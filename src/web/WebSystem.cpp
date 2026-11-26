// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <LittleFS.h>
#include <esp_ota_ops.h>
#include <esp_image_format.h>
#if __has_include(<spi_flash_mmap.h>)
#include <spi_flash_mmap.h>   // SPI_FLASH_SEC_SIZE sous IDF 5 (C6) ; IDF 4 le donne déjà
#endif
#include "mbedtls/sha256.h"
#include "mbedtls/version.h"
#include <memory>            // std::make_shared -- état de la réponse chunked de /controller
#include <esp_task_wdt.h>
#include <esp_heap_caps.h>   // heap_caps_get_largest_free_block() -- cf. handleDiscovery()
#include "ConfigSettings.h"
#include "ConfigFile.h"
#include "Utils.h"
#include "SSDP.h"
#include "somfy/Somfy.h"
#include "WResp.h"
#include "Web.h"
#include "MQTT.h"
#include "FwInfo.h"
#include "NetManager.h"
#include "Schedule.h"
#include "WebCommon.h"
#include "WebChunkedJson.h"
#include "WebSystem.h"
#include "LogTee.h"
#include "SysDiag.h"
#include <esp_core_dump.h>
#include <esp_flash.h>

extern ConfigSettings settings;
extern SSDPClass SSDP;
extern rebootDelay_t rebootDelay;
extern SomfyShadeController somfy;
extern Web webServer;
extern MQTTClass mqtt;
extern NetManager net;
extern ScheduleController schedule;

namespace WebSystem {
  // Sous-phases d'un groupe en cours d'émission. Un groupe ne tient PAS dans un élément (cf.
  // WebChunkedJson.h) : son en-tête, chacun de ses équipements liés et sa fermeture sont autant
  // d'éléments distincts. Partagé par /controller et /discovery, qui émettent les groupes à
  // l'identique.
  enum grp_sub_t : uint8_t {
    GRP_HEAD = 0,   // "{" + scalaires du groupe + ,"linkedShades":[
    GRP_SHADES,     // une référence d'équipement par élément
    GRP_CLOSE       // "]}"
  };

  // Fermeture d'abandon de loin la plus fréquente (cf. le champ abortTail) : le tableau de la
  // section en cours, puis la racine.
  static const char ABORT_IN_ARRAY[] = "],\"truncated\":true}";

  // --- Sérialisation chunked de /controller ---
  // Cf. WebChunkedJson.h pour le pourquoi (coin de 16 Ko + plafond de configuration). L'ordre des
  // phases ci-dessous reproduit EXACTEMENT celui de l'ancienne version bufferisée -- toute
  // divergence produirait un JSON structurellement différent, que le front-end consommerait sans
  // rien signaler.
  enum ctl_phase_t : uint8_t {
    CTL_HEAD = 0,     // "{" + scalaires + "transceiver"
    CTL_VERSION,      // ,"version":{...}   -- séparé de CTL_HEAD pour ne pas cumuler deux objets
                      // imbriqués dans le même tampon d'élément
    CTL_ROOMS, CTL_SHADES, CTL_GROUPS, CTL_REPEATERS, CTL_SCHEDULES,
    CTL_LISTENERS,    // ajout v3, en dernier : clé nouvelle, rien d'existant ne bouge
    CTL_REPEATER_NAMES, // ajout v3, même rang que `repeaters` (même instantané reps[])
    CTL_EPILOGUE,     // "}"
    CTL_DONE
  };

  // Instantané des index valides, pris une fois pour toutes à l'ouverture de la réponse. La réponse
  // chunked s'étale désormais sur plusieurs cycles d'ACK (dizaines de ms), là où le handler
  // bufferisé produisait un instantané atomique : sans cette photo, un équipement ajouté ou supprimé en
  // cours d'émission pourrait apparaître deux fois ou manquer. ~103 octets, et ça règle du même
  // coup la granularité du verrou de ScheduleController, qu'on ne peut plus tenir sur toute la
  // durée d'un transfert réseau.
  struct ControllerChunkState {
    ChunkedJsonEmitter em;
    uint8_t phase = CTL_HEAD;
    uint8_t idx = 0;
    bool openEmitted = false;
    bool firstItem = true;
    // Cf. ShadesChunkState : figé à la réception, la réponse chunked survivant à `request`.
    bool secrets = true;
    // Fermeture à poser si l'élément en cours de composition doit être ABANDONNÉ pour dépassement
    // de tampon : chaque case qui compose un élément y dépose ce qui resterait ouvert sans lui.
    // Cf. le contrôle de troncature en bas de controllerProduceNext().
    const char *abortTail = "}";
    // Position dans le groupe courant, cf. grp_sub_t.
    uint8_t gsub = GRP_HEAD;
    uint8_t gshade = 0;
    bool gfirstShade = true;
    uint8_t rooms[SOMFY_MAX_ROOMS];       uint8_t nRooms = 0;
    uint8_t shades[SOMFY_MAX_SHADES];     uint8_t nShades = 0;
    uint8_t groups[SOMFY_MAX_GROUPS];     uint8_t nGroups = 0;
    uint8_t reps[SOMFY_MAX_REPEATERS];    uint8_t nReps = 0;
    uint8_t scheds[SOMFY_MAX_SCHEDULES];  uint8_t nScheds = 0;
    uint8_t lsts[SOMFY_MAX_LISTENERS];    uint8_t nLsts = 0;
  };

  // Fabrique l'ouverture, un élément, ou la fermeture d'une section. Renvoie false quand tout a été
  // produit. Une seule émission par appel : c'est ce qui borne le pic mémoire à un élément.
  static bool controllerProduceNext(ControllerChunkState *st) {
    switch(st->phase) {
      case CTL_HEAD: {
        JsonFormatter *j = st->em.beginItem(false);
        j->beginObject();
        j->addElem("maxRooms", (uint8_t)SOMFY_MAX_ROOMS);
        j->addElem("maxShades", (uint8_t)SOMFY_MAX_SHADES);
        j->addElem("maxGroups", (uint8_t)SOMFY_MAX_GROUPS);
        j->addElem("maxGroupedShades", (uint8_t)SOMFY_MAX_GROUPED_SHADES);
        j->addElem("maxLinkedRemotes", (uint8_t)SOMFY_MAX_LINKED_REMOTES);
        j->addElem("maxListeners", (uint8_t)SOMFY_MAX_LISTENERS);
        j->addElem("maxRepeaters", (uint8_t)SOMFY_MAX_REPEATERS);
        j->addElem("maxSchedules", (uint8_t)SOMFY_MAX_SCHEDULES);
        j->addElem("startingAddress", (uint32_t)somfy.startingAddress);
        j->beginObject("transceiver");
        somfy.transceiver.toJSON(*j);
        j->endObject();
        // Élément abandonné = pas même l'accolade racine d'émise.
        st->abortTail = "{\"truncated\":true}";
        st->phase = CTL_VERSION;
        break;
      }
      case CTL_VERSION: {
        JsonFormatter *j = st->em.beginItem(true);
        j->beginObject("version");
        FwInfo::toJSON(*j);
        j->endObject();
        // Racine ouverte et déjà pourvue d'au moins un champ.
        st->abortTail = ",\"truncated\":true}";
        st->phase = CTL_ROOMS;
        break;
      }
      case CTL_ROOMS:
        if(!st->openEmitted) { st->em.emitRaw(",\"rooms\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nRooms) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          somfy.rooms[st->rooms[st->idx]].toJSON(*j);
          j->endObject();
          st->idx++; st->firstItem = false;
          st->abortTail = ABORT_IN_ARRAY;
          break;
        }
        st->em.emitRaw("]");
        st->phase = CTL_SHADES; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      case CTL_SHADES:
        if(!st->openEmitted) { st->em.emitRaw(",\"shades\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nShades) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          somfy.shades[st->shades[st->idx]].toJSON(*j, st->secrets);
          j->endObject();
          st->idx++; st->firstItem = false;
          st->abortTail = ABORT_IN_ARRAY;
          break;
        }
        st->em.emitRaw("]");
        st->phase = CTL_GROUPS; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      // Seule section dont un élément du modèle ne tient PAS dans le tampon : un groupe plein
      // imbrique jusqu'à SOMFY_MAX_GROUPED_SHADES références d'équipement (~6,9 Ko, cf.
      // WebChunkedJson.h). Il est donc émis en plusieurs éléments -- en-tête, puis un équipement
      // lié par élément, puis fermeture -- ce qui ramène le pic à la taille d'une référence.
      // L'ordre des champs reste celui de SomfyGroup::toJSON : `linkedShades` vient en dernier,
      // l'en-tête peut donc laisser le tableau ouvert d'un élément sur l'autre.
      case CTL_GROUPS: {
        if(!st->openEmitted) { st->em.emitRaw(",\"groups\":["); st->openEmitted = true; return true; }
        if(st->idx >= st->nGroups) {
          st->em.emitRaw("]");
          st->phase = CTL_REPEATERS; st->openEmitted = false; st->firstItem = true; st->idx = 0;
          return true;
        }
        SomfyGroup &group = somfy.groups[st->groups[st->idx]];
        if(st->gsub == GRP_HEAD) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          group.toJSONHead(*j, st->secrets);
          // Ni endObject() ni endArray() ici : l'objet du groupe ET son tableau d'équipements liés
          // restent ouverts jusqu'à GRP_CLOSE.
          st->em.appendRaw(",\"linkedShades\":[");
          // En-tête abandonné : ni l'objet du groupe ni son tableau n'existent, seul `groups` est
          // ouvert -- et ce malgré le passage en GRP_SHADES juste en dessous.
          st->abortTail = ABORT_IN_ARRAY;
          st->gsub = GRP_SHADES; st->gshade = 0; st->gfirstShade = true;
          break;
        }
        if(st->gsub == GRP_CLOSE) {
          st->em.emitRaw("]}");
          st->idx++; st->firstItem = false; st->gsub = GRP_HEAD;
          return true;
        }
        // GRP_SHADES : un emplacement par appel. Un emplacement vide ou un identifiant orphelin
        // n'émet rien et rend la main -- le `return true` (et non `break`) est indispensable, le
        // contrôle de troncature commun en bas de fonction recopierait sinon l'élément précédent
        // une seconde fois. Même filtre de sentinelle que SomfyGroup::toJSON.
        if(st->gshade >= SOMFY_MAX_GROUPED_SHADES) { st->gsub = GRP_CLOSE; return true; }
        uint8_t shadeId = group.linkedShades[st->gshade++];
        SomfyShade *shade = (shadeId > 0 && shadeId < 255) ? somfy.getShadeById(shadeId) : nullptr;
        if(!shade) return true;
        JsonFormatter *js = st->em.beginItem(!st->gfirstShade);
        js->beginObject();
        shade->toJSONRef(*js, st->secrets);
        js->endObject();
        st->gfirstShade = false;
        // `linkedShades` + l'objet du groupe + `groups`.
        st->abortTail = "]}],\"truncated\":true}";
        break;
      }
      case CTL_REPEATERS:
        if(!st->openEmitted) { st->em.emitRaw(",\"repeaters\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nReps) {
          // Éléments scalaires, pas des objets : cf. SomfyShadeController::toJSONRepeaters.
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->addElem((uint32_t)somfy.repeaters[st->reps[st->idx]]);
          st->idx++; st->firstItem = false;
          st->abortTail = ABORT_IN_ARRAY;
          break;
        }
        st->em.emitRaw("]");
        st->phase = CTL_SCHEDULES; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      case CTL_SCHEDULES:
        if(!st->openEmitted) { st->em.emitRaw(",\"schedules\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nScheds) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          // Verrou pris par ÉLÉMENT et non sur toute la collection (contrairement à
          // ScheduleController::toJSONSchedules) : le tenir d'un bout à l'autre reviendrait à le
          // garder pendant tout un transfert réseau, gelant les routes de planification.
          // L'instantané d'index rend ce découpage sûr -- les emplacements sont fixes.
          schedule.lock();
          schedule.schedules[st->scheds[st->idx]].toJSON(*j);
          schedule.unlock();
          j->endObject();
          st->idx++; st->firstItem = false;
          st->abortTail = ABORT_IN_ARRAY;
          break;
        }
        st->em.emitRaw("]");
        st->phase = CTL_LISTENERS; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      case CTL_LISTENERS:
        if(!st->openEmitted) { st->em.emitRaw(",\"listeners\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nLsts) {
          // Retrait survenu depuis l'instantané (compressListeners décale la liste) : on saute
          // l'emplacement vidé plutôt que d'émettre une entrée sans adresse.
          if(somfy.listeners[st->lsts[st->idx]].address == 0) { st->idx++; return true; }
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          somfy.toJSONListener(*j, &somfy.listeners[st->lsts[st->idx]], st->secrets);
          j->endObject();
          st->idx++; st->firstItem = false;
          st->abortTail = ABORT_IN_ARRAY;
          break;
        }
        st->em.emitRaw("]");
        st->phase = CTL_REPEATER_NAMES; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      case CTL_REPEATER_NAMES:
        if(!st->openEmitted) { st->em.emitRaw(",\"repeaterNames\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nReps) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->addElem(somfy.repeaterNames[st->reps[st->idx]]);
          st->idx++; st->firstItem = false;
          st->abortTail = ABORT_IN_ARRAY;
          break;
        }
        st->em.emitRaw("]");
        st->phase = CTL_EPILOGUE;
        return true;
      case CTL_EPILOGUE:
        st->em.emitRaw("}");
        st->phase = CTL_DONE;
        return true;
      default:
        return false;
    }
    // Chemins passés par beginItem()/composition : contrôler la troncature silencieuse.
    // L'élément tronqué n'est PAS expédié. Il n'a encore rien de recopié vers la bibliothèque --
    // beginItem() a remis `sent` à 0 et la recopie n'a lieu qu'après le retour de cette fonction --
    // on peut donc l'écraser par la fermeture de tout ce qui reste ouvert (cf. abortTail), plus un
    // drapeau `truncated`. Le corps livré reste ainsi du JSON ANALYSABLE, porteur d'un aveu
    // explicite : expédier la troncature telle quelle valait un 200 dont le navigateur ne tirait
    // qu'un `null` muet, et le bandeau de chargement tournait indéfiniment.
    if(!st->em.endItem()) {
      Serial.printf("[CHUNKED] /controller: element tronque en phase %u (tampon de %u octets depasse), reponse interrompue\n",
        (unsigned)st->phase, (unsigned)CHUNKED_ITEM_BUF);
      st->em.emitRaw(st->abortTail);
      st->phase = CTL_DONE;
    }
    return true;
  }

  void handleController(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    settings.printAvailHeap();
    if (method == AsyncHttp::POST || method == AsyncHttp::GET) {
      // Réponse chunked plutôt que bufferisée : cf. WebChunkedJson.h. Une version bufferisée
      // réserverait 16384 octets contigus d'un coup -- coin de fragmentation, et plafond de
      // configuration au-delà duquel cette route ne pourrait plus répondre.
      auto st = std::make_shared<ControllerChunkState>();
      // Adresse de télécommande et code tournant au niveau CONFIG seulement (cf. /shades).
      // L'accès à la route ne change pas ; seuls les secrets montent.
      st->secrets = webServer.checkAuth(request, true);
      // Instantané des index valides (cf. ControllerChunkState). Mêmes filtres de sentinelle que
      // les toJSON*() d'origine, pour produire exactement le même ensemble d'éléments.
      for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++)
        if(somfy.rooms[i].roomId != 0) st->rooms[st->nRooms++] = i;
      for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++)
        if(somfy.shades[i].getShadeId() != 255) st->shades[st->nShades++] = i;
      for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++)
        if(somfy.groups[i].getGroupId() != 255) st->groups[st->nGroups++] = i;
      for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++)
        if(somfy.repeaters[i] != 0) st->reps[st->nReps++] = i;
      for(uint8_t i = 0; i < SOMFY_MAX_LISTENERS; i++)
        if(somfy.listeners[i].address != 0) st->lsts[st->nLsts++] = i;
      schedule.lock();
      for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++)
        if(schedule.schedules[i].getId() != 255) st->scheds[st->nScheds++] = i;
      schedule.unlock();

      // L'état est capturé par shared_ptr : il vit exactement aussi longtemps que le std::function
      // du filler, donc que la réponse, et se libère tout seul à sa destruction.
      request->send(request->beginChunkedResponse(_encoding_json,
        [st](uint8_t *buffer, size_t maxLen, size_t index) -> size_t {
          size_t written = 0;
          while(written < maxLen) {
            if(st->em.pending()) {
              written += st->em.flush(buffer + written, maxLen - written);
              continue;
            }
            // Plus rien à produire : un retour à 0 signale la fin de la réponse à la bibliothèque.
            if(!controllerProduceNext(st.get())) {
              // Relevé de pile ICI et non dans le handler : depuis le passage en chunked, la
              // sérialisation ne s'exécute plus dans handleController() mais dans ce callback,
              // appelé par la bibliothèque au fil des ACK -- toujours sur async_tcp, mais bien plus
              // profond dans sa pile d'appels. Mesurer côté handler ne verrait plus que l'amorce.
              ConfigSettings::reportAsyncTcpStackLow("/controller (serialisation chunked)");
              break;
            }
          }
          return written;
        }));
      // Le relevé de pile de cette route a migré dans le callback de sérialisation ci-dessus : à ce
      // point-ci, seule l'amorce de la réponse a été exécutée.
    }
    else {
      request->send(404, _encoding_text, _response_404);
      return;   // Sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
    }
  }

  // --- Sérialisation chunked de /discovery ---
  // Même motif que /controller ci-dessus, pour la même raison : une réservation de 16 Ko contigus
  // prise puis rendue pour quelques Ko de données réellement ajoutées fragmente le tas en échouant
  // au passage les petites allocations permanentes.
  // L'état est volontairement distinct de ControllerChunkState (quelques lignes d'instantané
  // dupliquées) plutôt que factorisé : /controller est déjà validé sur matériel, on ne le
  // retouche pas pour un gain de forme.
  enum disc_phase_t : uint8_t {
    DISC_HEAD = 0,   // "{" + scalaires + "memory"
    DISC_ROOMS, DISC_SHADES, DISC_GROUPS,
    DISC_EPILOGUE, DISC_DONE
  };
  struct DiscoveryChunkState {
    ChunkedJsonEmitter em;
    uint8_t phase = DISC_HEAD;
    uint8_t idx = 0;
    bool openEmitted = false;
    bool firstItem = true;
    // Capturé à la réception de la requête : net.connType peut changer d'ici la sérialisation.
    char connType[10] = "Unknown";
    // Cf. ControllerChunkState.
    const char *abortTail = "}";
    uint8_t gsub = GRP_HEAD;
    uint8_t gshade = 0;
    bool gfirstShade = true;
    uint8_t rooms[SOMFY_MAX_ROOMS];   uint8_t nRooms = 0;
    uint8_t shades[SOMFY_MAX_SHADES]; uint8_t nShades = 0;
    uint8_t groups[SOMFY_MAX_GROUPS]; uint8_t nGroups = 0;
  };

  static bool discoveryProduceNext(DiscoveryChunkState *st) {
    switch(st->phase) {
      case DISC_HEAD: {
        JsonFormatter *j = st->em.beginItem(false);
        j->beginObject();
        j->addElem("serverId", settings.serverId);
        j->addElem("version", settings.fwVersion.name);
        j->addElem("model", "ESPSomfyRTS");
        j->addElem("hostname", settings.hostname);
        j->addElem("authType", static_cast<uint8_t>(settings.Security.type));
        j->addElem("permissions", settings.Security.permissions);
        // Un firmware plus ancien ignore `target` sur /groupCommand et envoie My : le client doit
        // vérifier ce drapeau avant de s'en servir.
        j->addElem("groupTarget", true);
        j->addElem("chipModel", settings.chipModel);
        j->addElem("connType", st->connType);
        j->addElem("checkForUpdate", settings.checkForUpdate);
        j->beginObject("memory");
        // Relevés pris au moment de la SÉRIALISATION et non plus de la réception de la requête.
        // Plus représentatif qu'avant : la réponse elle-même ne mobilise plus que ~2 Ko au lieu de
        // 16, les chiffres ne sont donc plus faussés par le coût de leur propre transport.
        j->addElem("max", ESP.getMaxAllocHeap());
        j->addElem("free", ESP.getFreeHeap());
        j->addElem("min", ESP.getMinFreeHeap());
        j->addElem("total", ESP.getHeapSize());
        // Même champ que l'évènement socket memStatus (cf. NetManager::emitHeap) : les deux surfaces
        // exposant la mémoire décrivent ainsi le même état, fragmentation comprise.
        j->addElem("largest", (uint32_t)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
        j->endObject();
        // Cf. CTL_HEAD : l'accolade racine part avec l'élément.
        st->abortTail = "{\"truncated\":true}";
        st->phase = DISC_ROOMS;
        break;
      }
      case DISC_ROOMS:
        if(!st->openEmitted) { st->em.emitRaw(",\"rooms\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nRooms) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          somfy.rooms[st->rooms[st->idx]].toJSON(*j);
          j->endObject();
          st->idx++; st->firstItem = false;
          st->abortTail = ABORT_IN_ARRAY;
          break;
        }
        st->em.emitRaw("]");
        st->phase = DISC_SHADES; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      case DISC_SHADES:
        if(!st->openEmitted) { st->em.emitRaw(",\"shades\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nShades) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          // `secrets = false` : `remoteAddress` et `lastRollingCode` sortent à 0 et `linkedRemotes`
          // vide (les clés restent présentes, cf. SomfySerialize.cpp). C'est ce couple qui permet de
          // forger une trame RTS valide et de piloter les équipements en contournant le PIN ; un
          // document de DÉCOUVERTE n'en a aucun besoin -- un vrai client repasse par /shades.
          somfy.shades[st->shades[st->idx]].toJSON(*j, false);
          j->endObject();
          st->idx++; st->firstItem = false;
          st->abortTail = ABORT_IN_ARRAY;
          break;
        }
        st->em.emitRaw("]");
        st->phase = DISC_GROUPS; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      // Découpé en sous-éléments pour la même raison que CTL_GROUPS -- s'y reporter.
      case DISC_GROUPS: {
        if(!st->openEmitted) { st->em.emitRaw(",\"groups\":["); st->openEmitted = true; return true; }
        if(st->idx >= st->nGroups) {
          st->em.emitRaw("]");
          st->phase = DISC_EPILOGUE;
          return true;
        }
        SomfyGroup &group = somfy.groups[st->groups[st->idx]];
        if(st->gsub == GRP_HEAD) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          group.toJSONHead(*j, false); // idem, cf. DISC_SHADES ci-dessus
          st->em.appendRaw(",\"linkedShades\":[");
          st->abortTail = ABORT_IN_ARRAY; // cf. CTL_GROUPS
          st->gsub = GRP_SHADES; st->gshade = 0; st->gfirstShade = true;
          break;
        }
        if(st->gsub == GRP_CLOSE) {
          st->em.emitRaw("]}");
          st->idx++; st->firstItem = false; st->gsub = GRP_HEAD;
          return true;
        }
        if(st->gshade >= SOMFY_MAX_GROUPED_SHADES) { st->gsub = GRP_CLOSE; return true; }
        uint8_t shadeId = group.linkedShades[st->gshade++];
        SomfyShade *shade = (shadeId > 0 && shadeId < 255) ? somfy.getShadeById(shadeId) : nullptr;
        if(!shade) return true;
        JsonFormatter *js = st->em.beginItem(!st->gfirstShade);
        js->beginObject();
        shade->toJSONRef(*js, false);
        js->endObject();
        st->gfirstShade = false;
        st->abortTail = "]}],\"truncated\":true}";
        break;
      }
      case DISC_EPILOGUE:
        st->em.emitRaw("}");
        st->phase = DISC_DONE;
        return true;
      default:
        return false;
    }
    // Même filet que controllerProduceNext() -- s'y reporter pour le pourquoi.
    if(!st->em.endItem()) {
      Serial.printf("[CHUNKED] /discovery: element tronque en phase %u (tampon de %u octets depasse), reponse interrompue\n",
        (unsigned)st->phase, (unsigned)CHUNKED_ITEM_BUF);
      st->em.emitRaw(st->abortTail);
      st->phase = DISC_DONE;
    }
    return true;
  }

  void handleDiscovery(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    // Cette route était le SEUL handler de ce module sans contrôle d'authentification, alors
    // qu'elle sert la configuration complète : chaque équipement passait par SomfyShade::toJSON(), qui
    // inclut `remoteAddress` ET `lastRollingCode` -- exactement le couple nécessaire pour forger
    // une trame RTS valide et piloter les équipements par radio, en contournant intégralement le
    // PIN/mot de passe. cfg=false : même niveau que /controller et /shades, qui exposent déjà les
    // mêmes champs -- l'objectif est de fermer le contournement, pas de durcir au-delà du reste de
    // l'API (le mode "config seule" continue donc de servir la découverte sans clé, comme /shades).
    //
    // Le couple adresse/code tournant est retiré de la charge utile via `toJSON(*j, false)` plus
    // bas. Ce masquage compte d'autant plus que le mode « config seule » sert cette route SANS clé
    // : l'authentification seule ne protège donc rien dans ce mode, alors que le masquage, lui,
    // vaut quel que soit le mode.
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::POST || method == AsyncHttp::GET) {
      DBG_PRINTLN("Discovery Requested");
      auto st = std::make_shared<DiscoveryChunkState>();
      if(net.connType == conn_types_t::ethernet) strcpy(st->connType, "Ethernet");
      else if(net.connType == conn_types_t::wifi) strcpy(st->connType, "Wifi");
      // Mêmes filtres de sentinelle que les toJSON*() d'origine (cf. ControllerChunkState pour le
      // pourquoi de l'instantané).
      for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++)
        if(somfy.rooms[i].roomId != 0) st->rooms[st->nRooms++] = i;
      for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++)
        if(somfy.shades[i].getShadeId() != 255) st->shades[st->nShades++] = i;
      for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++)
        if(somfy.groups[i].getGroupId() != 255) st->groups[st->nGroups++] = i;

      request->send(request->beginChunkedResponse(_encoding_json,
        [st](uint8_t *buffer, size_t maxLen, size_t index) -> size_t {
          size_t written = 0;
          while(written < maxLen) {
            if(st->em.pending()) {
              written += st->em.flush(buffer + written, maxLen - written);
              continue;
            }
            if(!discoveryProduceNext(st.get())) {
              ConfigSettings::reportAsyncTcpStackLow("/discovery (serialisation chunked)");
              break;
            }
          }
          return written;
        }));
      // Contrairement à WebServer::client().stop(), request->client()->stop() ne doit PAS être
      // appelé ici : request->send() ne fait que mettre la réponse en file d'attente d'émission
      // asynchrone -- fermer la connexion immédiatement risquerait de tronquer la réponse avant
      // qu'AsyncTCP n'ait fini de l'écrire. La gestion de la connexion est laissée à AsyncTCP.
      net.needsBroadcast = true;
    }
    else
      request->send(500, _encoding_text, "Invalid http method");
  }

  // Le File reste ouvert pendant tout le transfert : un second /backup qui réécrirait
  // /controller.backup sous ce lecteur lui livrerait un mélange des deux fichiers. Compté pour le
  // refuser le temps du téléchargement.
  static std::atomic<uint8_t> g_backupReaders{0};
  class BackupFileResponse : public AsyncFileResponse {
    public:
      BackupFileResponse(fs::FS &fs, const String &path, const char *contentType)
        : AsyncFileResponse(fs, path, contentType) { g_backupReaders++; }
      ~BackupFileResponse() { g_backupReaders--; }
  };

  void handleBackup(AsyncWebServerRequest *request, bool attach) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(request->hasArg("attach")) attach = toBoolean(request->arg("attach").c_str(), attach);

    DBG_PRINTLN(F("Backup..."));
    // Écrivain LittleFS sur async_tcp : il pose le verrou lui-même, et renonce si un transfert ou
    // un autre écrivain est en cours plutôt que de servir un fichier mêlé.
    if(g_backupReaders > 0 || !fsLockTake()) {
      webServer.sendError(request, 503, "Filesystem busy, please retry.");
      return;
    }
    bool ok = somfy.writeBackup();
    fsLockGive();
    if(!ok || !LittleFS.exists("/controller.backup")) {
      webServer.sendError(request, 500, "Backup could not be written.");
      return;
    }
    AsyncWebServerResponse *response = new BackupFileResponse(LittleFS, "/controller.backup", _encoding_text);
    if(attach) {
      Timestamp ts;
      char * iso = ts.getISOTime();
      for(char *p = iso; *p; p++) {
        if(*p == '.') { *p = '\0'; break; }
        if(*p == ':') *p = '_';
      }
      String disposition = String("attachment; filename=\"ESPSomfyRTS ") + iso + ".backup\"";
      response->addHeader("Content-Disposition", disposition.c_str());
      response->addHeader("Access-Control-Expose-Headers", "Content-Disposition");
    }
    request->send(response);
  }

  void handleLog(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    uint32_t first = 0;
    uint32_t end = LogRing::span(&first);
    uint32_t from = first;
    if(request->hasArg("from")) {
      uint32_t asked = strtoul(request->arg("from").c_str(), nullptr, 10);
      if(asked > first && asked <= end) from = asked;
    }
    auto pos = std::make_shared<uint32_t>(from);
    AsyncWebServerResponse *response = request->beginChunkedResponse(_encoding_text,
      [pos, end](uint8_t *buffer, size_t maxLen, size_t index) -> size_t {
        return LogRing::read(pos.get(), end, (char *)buffer, maxLen);
      });
    response->addHeader("Cache-Control", "no-store");
    response->addHeader("X-Log-Start", String(from).c_str());
    response->addHeader("X-Log-End", String(end).c_str());
    response->addHeader("Access-Control-Expose-Headers", "X-Log-Start, X-Log-End");
    request->send(response);
  }

  static void handleCrash(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if(method == AsyncHttp::GET && request->hasParam("raw")) {
      size_t addr = 0, size = 0;
      if(esp_core_dump_image_get(&addr, &size) != ESP_OK) { request->send(404, "text/plain", "No core dump"); return; }
      AsyncWebServerResponse *r = request->beginResponse("application/octet-stream", size, [addr, size](uint8_t *out, size_t maxLen, size_t index) -> size_t {
        size_t n = std::min(std::min(size - index, maxLen), (size_t)1024);
        return esp_flash_read(NULL, out, addr + index, n) == ESP_OK ? n : 0;
      });
      request->send(r);
      return;
    }
    if(method == AsyncHttp::POST || method == AsyncHttp::PUT) SysDiag::eraseCrash();
    char buf[384];
    SysDiag::crashJSON(buf, sizeof(buf));
    request->send(200, "application/json", buf);
  }
  void handleReboot(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
      DBG_PRINTLN("Rebooting ESP...");
      rebootDelay.rebootTime = millis() + 500;
      rebootDelay.reboot = true;
      request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully started reboot\"}");
    }
    else {
      webServer.sendError(request, 405, "Invalid HTTP Method: ");
    }
  }

  // Le firmware ne s'écrit jamais lui-même : une image s'installe depuis le Mode installation
  // (partition factory), qui la reçoit sur son propre /updateFirmware. Refus si ce mode est absent
  // ou abîmé, sinon le redémarrage tomberait sur une partition vide.
  void handleRebootInstall(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(request->method() != AsyncHttp::POST && request->method() != AsyncHttp::PUT) { webServer.rejectMethod(request); return; }
    if(!FwInfo::selectInstallMode()) {
      webServer.sendError(request, 409, "Install mode is missing on this device.", "INSTALL_MODE_MISSING");
      return;
    }
    rebootDelay.rebootTime = millis() + 500;
    rebootDelay.reboot = true;
    request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Rebooting into install mode\"}");
  }

  // Remplacement du Mode installation par le firmware principal, qui tourne pendant l'écriture : une
  // coupure n'abîme que la partition install, et l'envoi se recommence. L'image doit porter un
  // identifiant de Mode installation ET le marqueur de cette table, sans quoi un firmware principal
  // ou un Mode installation d'une autre génération prendrait la place.
  #if MBEDTLS_VERSION_MAJOR >= 3
    #define IN_SHA_STARTS mbedtls_sha256_starts
    #define IN_SHA_UPDATE mbedtls_sha256_update
    #define IN_SHA_FINISH mbedtls_sha256_finish
  #else
    #define IN_SHA_STARTS mbedtls_sha256_starts_ret
    #define IN_SHA_UPDATE mbedtls_sha256_update_ret
    #define IN_SHA_FINISH mbedtls_sha256_finish_ret
  #endif
  // `hex` caractères hexadécimaux exigés après le motif : le firmware principal contient le préfixe
  // FW_INSTALL_TAG nu (il s'en sert pour chercher), seul un Mode installation le fait suivre de son
  // identifiant.
  struct InScan {
    const char *pat; size_t len; size_t hex; size_t matched = 0, tail = 0; bool found = false;
    InScan(const char *p, size_t l, size_t h = 0) : pat(p), len(l), hex(h) {}
    void feed(const uint8_t *d, size_t n) {
      for(size_t i = 0; i < n && !found; i++) {
        if(matched == len) {
          bool isHex = (d[i] >= '0' && d[i] <= '9') || (d[i] >= 'a' && d[i] <= 'f');
          if(isHex && ++tail == hex) found = true;
          else if(!isHex) { matched = d[i] == (uint8_t)pat[0] ? 1 : 0; tail = 0; }
        }
        else if(d[i] == (uint8_t)pat[matched]) { if(++matched == len && hex == 0) found = true; }
        else matched = d[i] == (uint8_t)pat[0] ? 1 : 0;
      }
    }
  };
  struct InstallUpload {
    const esp_partition_t *part = nullptr;
    const char *error = nullptr;
    uint32_t written = 0, erased = 0;
    bool hasDigest = false;
    uint8_t expected[32];
    mbedtls_sha256_context sha;
    InScan tag{FW_INSTALL_TAG, sizeof(FW_INSTALL_TAG) - 1, 12};
    InScan marker{FW_IMAGE_MARKER, sizeof(FW_IMAGE_MARKER) - 1};
  };
  static bool parseSha(const String &hex, uint8_t out[32]) {
    if(hex.length() != 64) return false;
    for(uint8_t i = 0; i < 64; i++) {
      char c = hex[i];
      uint8_t v = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : 16;
      if(v > 15) return false;
      out[i / 2] = (i & 1) ? (out[i / 2] | v) : (uint8_t)(v << 4);
    }
    return true;
  }
  static void handleUpdateInstallBody(AsyncWebServerRequest *request, const String &, size_t index, uint8_t *data, size_t len, bool final) {
    InstallUpload *st = (InstallUpload *)request->_tempObject;
    if(index == 0) {
      void *mem = malloc(sizeof(InstallUpload));
      if(!mem) return;
      st = new (mem) InstallUpload();
      request->_tempObject = st;
      if(!webServer.checkAuth(request, true)) { st->error = "auth"; return; }
      // Le redémarrage qui suit tomberait avant la validation à 60 s d'un firmware fraîchement
      // installé, et le chargeur repartirait sur le Mode installation : un firmware qui reçoit un
      // envoi authentifié a fait ses preuves.
      esp_ota_mark_app_valid_cancel_rollback();
      st->part = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_FACTORY, nullptr);
      if(!st->part) { st->error = "no install partition"; return; }
      // Refus AVANT tout effacement : un firmware principal n'y tient pas, et la partition reste intacte.
      if(request->contentLength() > st->part->size) { st->error = "size"; return; }
      uint16_t chipId = len >= 16 ? (data[12] | ((uint16_t)data[13] << 8)) : 0xFFFF;
      uint32_t declared = len >= 16 ? 1UL << (20 + (data[3] >> 4)) : 0;
      if(len < 16 || data[0] != 0xE9 || chipId != CONFIG_IDF_FIRMWARE_CHIP_ID || declared > ESP.getFlashChipSize()) { st->error = "header"; return; }
      if(request->hasHeader("X-Firmware-SHA256")) {
        if(!parseSha(request->header("X-Firmware-SHA256"), st->expected)) { st->error = "sha256"; return; }
        st->hasDigest = true;
        mbedtls_sha256_init(&st->sha);
        IN_SHA_STARTS(&st->sha, 0);
      }
      somfy.transceiver.end();
      mqtt.end();
      // Radio et MQTT ne reviennent qu'au redémarrage, y compris si le client lâche en route.
      request->onDisconnect([]() {
        rebootDelay.rebootTime = millis() + 500;
        rebootDelay.reboot = true;
      });
    }
    if(!st || st->error) {
      if(st && st->part && st->written > 0 && final) esp_partition_erase_range(st->part, 0, SPI_FLASH_SEC_SIZE);
      return;
    }
    if(st->written + len > st->part->size) { st->error = "size"; return; }
    while(st->erased < st->written + len) {
      if(esp_partition_erase_range(st->part, st->erased, SPI_FLASH_SEC_SIZE) != ESP_OK) { st->error = "erase"; return; }
      st->erased += SPI_FLASH_SEC_SIZE;
    }
    if(esp_partition_write(st->part, st->written, data, len) != ESP_OK) { st->error = "write"; return; }
    st->written += len;
    st->tag.feed(data, len);
    st->marker.feed(data, len);
    if(st->hasDigest) IN_SHA_UPDATE(&st->sha, data, len);
    wdtReset();
    if(final) {
      if(!st->tag.found) st->error = "not an install mode";
      else if(!st->marker.found) st->error = "marker";
      else if(st->hasDigest) {
        uint8_t got[32];
        IN_SHA_FINISH(&st->sha, got);
        if(memcmp(got, st->expected, sizeof(got)) != 0) st->error = "sha256";
      }
      if(!st->error) {
        const esp_partition_pos_t pos = {st->part->address, st->part->size};
        esp_image_metadata_t meta;
        if(esp_image_verify(ESP_IMAGE_VERIFY_SILENT, &pos, &meta) != ESP_OK) st->error = "verify";
      }
      // Une image refusée ne doit pas rester démarrable, même complète : on efface son en-tête.
      if(st->error) esp_partition_erase_range(st->part, 0, SPI_FLASH_SEC_SIZE);
      FwInfo::inspectInstall();
    }
  }
  static void handleUpdateInstall(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    InstallUpload *st = (InstallUpload *)request->_tempObject;
    const char *err = !st ? "no upload" : st->error;
    if(err && strcmp(err, "auth") == 0) { free(st); request->_tempObject = nullptr; webServer.isAuthenticated(request, true); return; }
    bool touched = st && st->written > 0;
    if(st && st->hasDigest) mbedtls_sha256_free(&st->sha);
    free(st);
    request->_tempObject = nullptr;
    if(err) {
      char desc[64];
      snprintf(desc, sizeof(desc), "Install mode rejected: %s", err);
      webServer.sendError(request, 400, desc);
    }
    else request->send(200, "application/json", "{\"status\":\"SUCCESS\",\"desc\":\"Install mode updated\"}");
    // Radio et MQTT ont été coupés dès le premier paquet : on repart proprement, comme après une
    // mise à jour. Un refus avant toute écriture ne coupe rien et ne redémarre pas.
    if(touched || (err == nullptr)) {
      rebootDelay.rebootTime = millis() + 500;
      rebootDelay.reboot = true;
    }
  }

  // Le mot de confirmation est exigé : un appel sans corps (script, intégration) n'efface rien.
  void handleFactoryReset(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(request->method() != AsyncHttp::POST && request->method() != AsyncHttp::PUT) { webServer.rejectMethod(request); return; }
    StaticJsonDocument<64> doc;
    if(!asyncHasBody(request) || deserializeJson(doc, asyncBodyPtr(request), asyncBodyLen(request))
       || strcmp(doc["confirm"] | "", "factory") != 0) {
      webServer.sendError(request, 400, "Confirmation missing");
      return;
    }
    if(fsLocked) { webServer.sendError(request, 409, "File system busy"); return; }
    rebootDelay.wipe = (doc["keepNetwork"] | false) ? 1 : 2;
    rebootDelay.rebootTime = millis() + 500;
    rebootDelay.reboot = true;
    request->send(200, "application/json", "{\"status\":\"OK\"}");
  }

  // /restore est le SEUL des 4 flux d'upload de ce module dont le handler principal lit
  // effectivement un flag de succès (les 3 autres s'appuient sur Update.hasError() ou renvoient
  // un message fixe) -- state->success est donc alloué via request->_tempObject (libéré
  // automatiquement par le destructeur d'AsyncWebServerRequest) au lieu d'un flag global partagé,
  // pour ne pas faire interférer deux requêtes /restore concurrentes sur le même booléen.
  // `rejected` : même rôle que dans WebI18n::handleUploadLang -- posé si GitOTA détenait déjà le
  // filesystem au démarrage de l'upload, auquel cas aucun octet n'est écrit et handleRestore()
  // retombe sur "Upload failed".
  // `writeFailed` : le résultat de CHAQUE écriture LittleFS doit être retenu -- une écriture courte
  // ou refusée (partition pleine, secteur défaillant, handle perdu) tronquerait sinon le fichier
  // sans que rien ne le remarque, `success` passant quand même à true au dernier paquet.
  struct UploadState { bool success = false; bool rejected = false; bool writeFailed = false; };


  static void handleRestore(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    UploadState *state = (UploadState *)request->_tempObject;
    if(!state || !state->success) {
      webServer.sendError(request, 500, "Upload failed");
      return;
    }
    // Options validées AVANT de répondre : la réponse partait d'abord, et un JSON invalide en
    // produisait une seconde qui remplaçait la première en sautant la restauration.
    restore_options_t opts;
    if(request->hasArg("data")) {
      if(settings.enableDebugLogs) Serial.println(request->arg("data"));
      StaticJsonDocument<256> doc;
      String data = request->arg("data");
      DeserializationError err = deserializeJson(doc, data.begin(), data.length());
      if(err) {
        webServer.handleDeserializationError(request, err);
        return;
      }
      JsonObject obj = doc.as<JsonObject>();
      opts.fromJSON(obj);
    }
    else {
      DBG_PRINTLN("No restore options sent.  Using defaults...");
      opts.shades = true;
    }
    if(somfy.restorePending) {
      webServer.sendError(request, 503, "A restore is already in progress.");
      return;
    }
    // La restauration réécrit tout le modèle : elle s'exécute sur loopTask (SomfyShadeController::loop),
    // qui commit puis redémarre.
    somfy.requestRestore(opts);
    request->send(200, _encoding_json, "{\"status\":\"Success\",\"desc\":\"Restoring Shade settings\"}");
  }

  static void handleRestoreBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    wdtReset();
    if (index == 0) {
      UploadState *state = (UploadState *)malloc(sizeof(UploadState));
      // Test de nullité indispensable : cette allocation intervient précisément quand le tas est
      // sous pression (upload en cours). Sans lui, un échec se traduirait par un déréférencement
      // nul immédiat -- un reboot au lieu d'un "Upload failed" propre.
      if(!state) return;
      state->success = false;
      state->writeFailed = false;
      // Refus AVANT toute écriture. Ce callback s'exécute pendant l'analyse de la requête, donc
      // AVANT le handler et son isAuthenticated() : sans ce test, un POST non authentifié posait
      // fsLocked (gelant planification et registre Somfy le temps du transfert) et déversait
      // tout son corps dans /shades.tmp avant d'être refusé. checkAuth() plutôt
      // qu'isAuthenticated() parce qu'on ne peut pas répondre ici, au milieu de la réception ;
      // `rejected` fait retomber le handler sur son échec normal, aucun octet écrit.
      state->rejected = fsLocked || !webServer.checkAuth(request, true);
      request->_tempObject = state;
      if(state->rejected) return;
      // Section critique FS : ce handler écrit LittleFS par chunks depuis la tâche async_tcp,
      // exactement comme WebI18n::handleUploadLangBody -- une écriture concurrente depuis la tâche
      // principale (planification, registre Somfy) déclenche l'assert interne "lfs_mlist_isopen"
      // (fatal). fsLocked est le mécanisme déjà utilisé partout ailleurs pour signaler "FS occupé"
      // (cf. Schedule.cpp, SomfyRegistry.cpp) -- réutilisé plutôt que d'introduire un 2e verrou.
      // Relâché au chunk final ; onDisconnect() est le filet de sécurité si la connexion tombe en
      // cours de transfert, sans quoi un upload interrompu laisserait le verrou tenu jusqu'au
      // reboot, gelant plannings et registre.
      // fsUploadLockAcquire()/fsUploadLockRelease() plutôt que fsLocked écrit directement (cf. le
      // commentaire détaillé dans WebCommon.h) : le rappel de déconnexion ci-dessous ne se
      // déclenche qu'à la fermeture de la CONNEXION, potentiellement bien après la fin de cet
      // upload -- il ne doit donc jamais relâcher un verrou repris entre-temps par une autre
      // opération.
      // Acquisition VÉRIFIÉE : entre le test de fsLocked ci-dessus et cette ligne, la tâche
      // principale a pu poser le verrou (téléchargement de langue, OTA). Écrire quand même
      // ferait cohabiter deux écrivains LittleFS -- le scénario "lfs_mlist_isopen" que ce verrou
      // existe précisément pour empêcher. On retombe alors sur le refus normal, aucun octet écrit.
      // L'acquisition ouvre aussi le fichier : plus d'open/append/close par paquet reçu.
      if(!fsUploadLockAcquire("/shades.tmp")) { state->rejected = true; return; }
      request->onDisconnect([]() { fsUploadLockRelease(); });
      DBG_PRINTF("Restore: %s\n", filename.c_str());
    }
    UploadState *state = (UploadState *)request->_tempObject;
    if(!state || state->rejected) return;
    if(!fsUploadWrite(data, len)) state->writeFailed = true;
    if (final) {
      state->success = !state->writeFailed;
      fsUploadLockRelease();
      // Relevé de pile async_tcp : chemin d'upload (parseur multipart + écriture LittleFS par
      // chunks, entièrement sur async_tcp). Cf. CONFIG_ASYNC_TCP_STACK_SIZE dans platformio.ini.
      ConfigSettings::reportAsyncTcpStackLow("upload /restore");
    }
  }

  // Cette route rend un verdict réel (elle regarde `state->success`), sur le modèle de
  // handleRestore() ci-dessus -- ne pas revenir à un simple 200 inconditionnel.
  //
  // Pas de test `fsLocked` ici : ce handler s'exécute APRÈS la réception complète du corps, donc
  // après le seul moment où ce refus aurait un sens -- couvert par handleUpdateShadeConfigBody(),
  // qui le teste avant d'écrire le premier octet.
  static void handleUpdateShadeConfig(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    UploadState *state = (UploadState *)request->_tempObject;
    if(!state || !state->success) {
      // Pas de LittleFS.remove("/shades.tmp") ici, contrairement à ce que fait /uploadLang avec SON
      // temporaire : ce chemin-ci est partagé (il est aussi celui de /restore, et il est servi tel
      // quel par la route /shades.tmp). Le supprimer depuis un upload en échec détruirait le
      // travail d'une autre opération. Le prochain upload
      // le tronque de toute façon en l'ouvrant en "w".
      webServer.sendError(request, 500, "Upload failed");
      return;
    }
    // Chargement déplacé ICI depuis le callback de corps : c'est le seul endroit d'où l'on puisse
    // encore répondre. Tant qu'il vivait dans le callback, son booléen de retour était jeté et un
    // fichier illisible passait pour un succès. L'ordre reste celui que documentait déjà le
    // callback -- verrou relâché au chunk final, PUIS relecture, le filesystem devant être libre.
    // Relu par loop() (SomfyShadeController::loop) et non ici : le modèle ne se réécrit que sur
    // loopTask. Le verdict sur le fichier part donc sur la série, plus dans cette réponse.
    somfy.requestLoadShadesFile();
    request->send(200, _encoding_json, "{\"status\":\"Success\",\"desc\":\"Shade configuration queued\"}");
  }

  static void handleUpdateShadeConfigBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    wdtReset();
    if (index == 0) {
      UploadState *state = (UploadState *)malloc(sizeof(UploadState));
      if(!state) return;
      state->success = false;
      state->writeFailed = false;
      // Refus AVANT toute écriture. Ce callback s'exécute pendant l'analyse de la requête, donc
      // AVANT le handler et son isAuthenticated() : sans ce test, un POST non authentifié posait
      // fsLocked (gelant planification et registre Somfy le temps du transfert) et déversait
      // tout son corps dans /shades.tmp avant d'être refusé. checkAuth() plutôt
      // qu'isAuthenticated() parce qu'on ne peut pas répondre ici, au milieu de la réception ;
      // `rejected` fait retomber le handler sur son échec normal, aucun octet écrit.
      state->rejected = fsLocked || !webServer.checkAuth(request, true);
      request->_tempObject = state;
      if(state->rejected) return;
      // Même section critique FS que handleRestoreBody() ci-dessus : second écrivain LittleFS par
      // chunks sur la tâche async_tcp, protégé par le même verrou. Relâché au chunk final, donc
      // avant que handleUpdateShadeConfig() ne relise le fichier -- cette relecture doit trouver le
      // filesystem libre.
      // fsUploadLockAcquire()/fsUploadLockRelease() plutôt que fsLocked écrit directement (cf. le
      // commentaire détaillé dans WebCommon.h) : le rappel de déconnexion ci-dessous ne se
      // déclenche qu'à la fermeture de la CONNEXION, potentiellement bien après la fin de cet
      // upload -- il ne doit donc jamais relâcher un verrou repris entre-temps par une autre
      // opération.
      // Acquisition VÉRIFIÉE : entre le test de fsLocked ci-dessus et cette ligne, la tâche
      // principale a pu poser le verrou (téléchargement de langue, OTA). Écrire quand même
      // ferait cohabiter deux écrivains LittleFS -- le scénario "lfs_mlist_isopen" que ce verrou
      // existe précisément pour empêcher. On retombe alors sur le refus normal, aucun octet écrit.
      // L'acquisition ouvre aussi le fichier : plus d'open/append/close par paquet reçu.
      if(!fsUploadLockAcquire("/shades.tmp")) { state->rejected = true; return; }
      request->onDisconnect([]() { fsUploadLockRelease(); });
      DBG_PRINTF("Update: shades.cfg\n");
    }
    UploadState *state = (UploadState *)request->_tempObject;
    if(!state || state->rejected) return;
    // Ces octets s'écrivent dans un FICHIER (/shades.tmp) : cette route ne flashe rien.
    if(!fsUploadWrite(data, len)) state->writeFailed = true;
    if (final) {
      state->success = !state->writeFailed;
      fsUploadLockRelease();
      // somfy.loadShadesFile() n'est plus appelé ici mais dans handleUpdateShadeConfig() : son
      // résultat était perdu, et c'est le handler -- pas ce callback -- qui peut répondre.
    }
  }

  void registerRoutes(AsyncWebServer &server) {
    // SSDP.schema(Print&) écrit directement dans le flux fourni -- AsyncClient (request->client())
    // n'hérite pas de Print comme WiFiClient, contrairement à AsyncResponseStream qui, lui,
    // l'implémente : on redirige donc vers un flux de réponse Async plutôt que vers le client TCP
    // brut, sans toucher à SSDPClass::schema() elle-même.
    server.on("/upnp.xml", AsyncHttp::ANY, [](AsyncWebServerRequest *request) {
      // Même frontière que /loginContext : version, hôte et série ne sortent sans clé que pour SSDP.
      if(!settings.ssdpBroadcast) { request->send(404, _encoding_text, _response_404); return; }
      AsyncResponseStream *stream = request->beginResponseStream("text/xml");
      SSDP.schema(*stream);
      request->send(stream);
    });
    server.on("/controller", AsyncHttp::ANY, handleController);
    server.on("/backup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleBackup(request, true); });
    // Les callbacks d'upload sont enveloppés dans une lambda plutôt que passés tels quels : leur
    // signature (AsyncWebServerRequest*, const String&, size_t, uint8_t*, size_t, bool) ne
    // correspond pas exactement au std::function attendu par on() sans cette conversion explicite.
    server.on("/restore", AsyncHttp::POST, handleRestore,
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleRestoreBody(request, filename, index, data, len, final); });
    server.on("/rebootInstall", AsyncHttp::ANY, handleRebootInstall);
    server.on("/updateInstall", AsyncHttp::POST, handleUpdateInstall,
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUpdateInstallBody(request, filename, index, data, len, final); });
    server.on("/updateShadeConfig", AsyncHttp::POST, handleUpdateShadeConfig,
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUpdateShadeConfigBody(request, filename, index, data, len, final); });
    server.on("/log", AsyncHttp::ANY, handleLog);
    server.on("/crash", AsyncHttp::ANY, handleCrash);
    server.on("/reboot", AsyncHttp::ANY, handleReboot);
    server.on("/factoryReset", AsyncHttp::ANY, handleFactoryReset, nullptr, asyncBodyHandler);
  }
}
