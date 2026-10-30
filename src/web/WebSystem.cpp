// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <LittleFS.h>
#include <Update.h>
#include <memory>            // std::make_shared -- état de la réponse chunked de /controller
#include <esp_task_wdt.h>
#include <esp_heap_caps.h>   // heap_caps_get_largest_free_block() -- cf. handleDiscovery()
#include "mbedtls/sha256.h"
#include "mbedtls/version.h"   // MBEDTLS_VERSION_MAJOR -- cf. FW_SHA_*
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
      st->secrets = webServer.isAuthenticated(request, true);
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

  void handleBackup(AsyncWebServerRequest *request, bool attach) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(request->hasArg("attach")) attach = toBoolean(request->arg("attach").c_str(), attach);

    DBG_PRINTLN(F("Backup..."));
    // La valeur de retour était ignorée : quand writeBackup() renonçait (filesystem verrouillé par
    // une OTA), l'ancien /controller.backup restant sur le disque partait quand même, présenté au
    // client comme une sauvegarde fraîche.
    if(!somfy.writeBackup()) {
      request->send(503, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem busy, please retry.\"}");
      return;
    }

    if(!LittleFS.exists("/controller.backup")) {
      request->send(500, _encoding_text, "Err: File");
      return;
    }
    AsyncWebServerResponse *response = request->beginResponse(LittleFS, "/controller.backup", _encoding_text);
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
      request->send(201, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
    }
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

  // Détection du marqueur d'image (cf. FW_IMAGE_MARKER dans ConfigSettings.h) pendant la
  // réception d'un /updateFirmware. Le marqueur peut tomber à cheval sur deux paquets : on
  // conserve donc les (len-1) derniers octets de chaque morceau et on cherche dans
  // "queue + morceau". État par requête via request->_tempObject, comme les autres uploads de ce
  // module -- pas de variable globale partagée entre requêtes.
  #define FW_MARKER_LEN (sizeof(FW_IMAGE_MARKER) - 1)
  // En-tête facultatif portant l'empreinte attendue de l'image, en hexadécimal. Le relais (page
  // Firmware, intégration Home Assistant) la lit dans le catalogue publié et l'envoie avec l'image :
  // l'appareil la recalcule pendant l'écriture et refuse de rendre la partition amorçable si elles
  // diffèrent. Sans en-tête (envoi manuel d'un .bin), seul le marqueur est contrôlé, comme avant.
  #define FW_DIGEST_HEADER "X-Firmware-SHA256"
  struct FwImageScan {
    bool found = false;
    // Même rôle que dans UploadState : posé si la requête n'était pas authentifiée (ou si le
    // filesystem était occupé) au démarrage de l'upload, auquel cas AUCUN octet n'atteint Update.
    // Cf. handleUpdateFirmwareBody().
    bool rejected = false;
    bool hasDigest = false;
    bool digestMismatch = false;
    uint8_t expected[32];
    mbedtls_sha256_context sha;
    uint8_t tailLen = 0;
    uint8_t tail[FW_MARKER_LEN > 0 ? FW_MARKER_LEN - 1 : 1];
  };
  // mbedTLS 3 (core 3.x, C6) a retiré le suffixe _ret de ces trois fonctions.
  #if MBEDTLS_VERSION_MAJOR >= 3
    #define FW_SHA_STARTS mbedtls_sha256_starts
    #define FW_SHA_UPDATE mbedtls_sha256_update
    #define FW_SHA_FINISH mbedtls_sha256_finish
  #else
    #define FW_SHA_STARTS mbedtls_sha256_starts_ret
    #define FW_SHA_UPDATE mbedtls_sha256_update_ret
    #define FW_SHA_FINISH mbedtls_sha256_finish_ret
  #endif
  static bool parseHexDigest(const String &hex, uint8_t out[32]) {
    if(hex.length() != 64) return false;
    for(uint8_t i = 0; i < 32; i++) {
      uint8_t o = 0;
      for(uint8_t k = 0; k < 2; k++) {
        char c = hex[i * 2 + k];
        uint8_t v;
        if(c >= '0' && c <= '9') v = c - '0';
        else if(c >= 'a' && c <= 'f') v = c - 'a' + 10;
        else if(c >= 'A' && c <= 'F') v = c - 'A' + 10;
        else return false;
        o = (uint8_t)((o << 4) | v);
      }
      out[i] = o;
    }
    return true;
  }
  static void fwScanChunk(FwImageScan *st, const uint8_t *data, size_t len) {
    if(!st || st->found) return;
    const size_t keep = FW_MARKER_LEN - 1;
    // AUCUNE allocation ici : cette fonction s'exécute sur la tâche async_tcp pour chaque paquet
    // d'un upload, précisément quand le tas est le plus sollicité. Un malloc par paquet y serait un
    // risque gratuit. On procède donc en deux temps, avec un unique tampon de pile de 2*(len-1)
    // octets.
    //
    // 1) La jointure : le marqueur peut chevaucher la frontière entre le paquet précédent et
    //    celui-ci. On ne recompose que cette zone -- la queue conservée, suivie du début du
    //    paquet courant -- et on l'examine.
    if(st->tailLen > 0) {
      uint8_t edge[2 * (FW_MARKER_LEN - 1)];
      size_t head = len < keep ? len : keep;
      memcpy(edge, st->tail, st->tailLen);
      memcpy(edge + st->tailLen, data, head);
      size_t edgeLen = st->tailLen + head;
      for(size_t i = 0; !st->found && i + FW_MARKER_LEN <= edgeLen; i++) {
        if(memcmp(edge + i, FW_IMAGE_MARKER, FW_MARKER_LEN) == 0) st->found = true;
      }
    }
    // 2) Le paquet lui-même, lu sur place.
    for(size_t i = 0; !st->found && i + FW_MARKER_LEN <= len; i++) {
      if(memcmp(data + i, FW_IMAGE_MARKER, FW_MARKER_LEN) == 0) st->found = true;
    }
    if(st->found) { st->tailLen = 0; return; }
    // Nouvelle queue : les (len-1) derniers octets vus, en tenant compte d'un paquet plus court
    // que le marqueur (la queue doit alors glisser plutôt que d'être remplacée).
    if(len >= keep) {
      memcpy(st->tail, data + len - keep, keep);
      st->tailLen = (uint8_t)keep;
    }
    else {
      size_t drop = (st->tailLen + len > keep) ? (st->tailLen + len - keep) : 0;
      memmove(st->tail, st->tail + drop, st->tailLen - drop);
      memcpy(st->tail + (st->tailLen - drop), data, len);
      st->tailLen = (uint8_t)(st->tailLen - drop + len);
    }
  }

  static void handleRestore(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    UploadState *state = (UploadState *)request->_tempObject;
    if(state && state->success) {
      request->send(200, _encoding_json, "{\"status\":\"Success\",\"desc\":\"Restoring Shade settings\"}");
      restore_options_t opts;
      if(request->hasArg("data")) {
        if(settings.enableDebugLogs) Serial.println(request->arg("data"));
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, request->arg("data"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          opts.fromJSON(obj);
        }
      }
      else {
        DBG_PRINTLN("No restore options sent.  Using defaults...");
        opts.shades = true;
      }
      ShadeConfigFile::restore(&somfy, "/shades.tmp", opts);
      DBG_PRINTLN("Rebooting ESP for restored settings...");
      rebootDelay.rebootTime = millis() + 1000;
      rebootDelay.reboot = true;
    }
    else {
      // Comportement corrigé par rapport à la version WebServer& d'origine : celle-ci ne renvoyait
      // RIEN du tout dans ce cas (aucune branche else), laissant la requête sans réponse jusqu'au
      // timeout du client -- bug latent, plus risqué encore sous ESPAsyncWebServer (connexion
      // potentiellement conservée en attente). Toutes les autres routes d'upload répondent déjà
      // explicitement en cas d'échec ; alignement sur ce comportement.
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Upload failed\"}");
    }
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

  static void handleUpdateFirmware(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    FwImageScan *scan = (FwImageScan *)request->_tempObject;
    // Aucun état, ou upload refusé en amont (filesystem occupé -- le cas non authentifié n'arrive
    // jamais jusqu'ici, isAuthenticated() vient de répondre 401) : RIEN n'a été écrit, ni la radio
    // ni MQTT coupés. Il n'y a donc rien à remettre d'aplomb, et surtout aucune raison de
    // redémarrer -- d'où le return, contrairement aux deux autres branches d'échec ci-dessous.
    if(scan && scan->rejected && scan->digestMismatch) {
      request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"code\":\"FW_DIGEST_MISMATCH\",\"desc\":\"Malformed " FW_DIGEST_HEADER " header.\"}");
      return;
    }
    if(!scan || scan->rejected) {
      request->send(503, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Firmware update could not be started, please retry.\"}");
      return;
    }
    if(!scan->found)
      request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"code\":\"FW_IMAGE_INCOMPATIBLE\",\"desc\":\"This firmware image was not built for this partition layout.\"}");
    else if(scan->digestMismatch)
      request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"code\":\"FW_DIGEST_MISMATCH\",\"desc\":\"The received image does not match its published checksum.\"}");
    else if (Update.hasError())
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error updating firmware: \"}");
    else
      request->send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Successfully updated firmware\"}");
    // Redémarrage même sur refus : handleUpdateFirmwareBody a coupé la radio et MQTT dès le
    // premier paquet, avant qu'on puisse savoir si l'image était valide. Les rallumer à chaud au
    // milieu d'un flux interrompu est plus fragile que de repartir proprement -- et l'appareil
    // revient sur son firmware actuel, la partition OTA n'ayant pas été validée.
    rebootDelay.rebootTime = millis() + 500;
    rebootDelay.reboot = true;
  }

  static void handleUpdateFirmwareBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    if (index == 0) {
      DBG_PRINTF("Update: %s\n", filename.c_str());
      FwImageScan *scan = (FwImageScan *)malloc(sizeof(FwImageScan));
      // Sans allocation il n'y a pas d'état pour porter le refus : on n'écrit rien plutôt que de
      // continuer à l'aveugle. handleUpdateFirmware() verra scan == nullptr et refusera l'image.
      if(!scan) return;
      *scan = FwImageScan();
      request->_tempObject = scan;
      // Refus AVANT tout effet de bord. Ce callback s'exécute pendant l'analyse de la requête, donc
      // AVANT le handler et son isAuthenticated() -- c'est exactement la fenêtre déjà documentée et
      // fermée dans handleRestoreBody()/handleUploadLangBody(), qui n'avait jamais été reportée ici
      // alors que c'est la route la plus dangereuse du lot : sans ce test, un POST non authentifié
      // coupait la radio et MQTT, déversait toute son image dans la partition OTA, et le
      // Update.end(true) du chunk final la rendait AMORÇABLE -- le firmware d'un tiers démarrait au
      // redémarrage suivant. checkAuth() plutôt qu'isAuthenticated() : on ne peut pas répondre ici,
      // au milieu de la réception ; `rejected` fait retomber le handler sur son refus normal.
      scan->rejected = fsLocked || !webServer.checkAuth(request, true);
      if(scan->rejected) {
        Serial.println("Firmware upload rejected: unauthorized or filesystem busy");
        return;
      }
      // Empreinte facultative (cf. FW_DIGEST_HEADER). Mal formée, elle vaut refus : un relais qui
      // en envoie une entend qu'elle soit vérifiée, l'ignorer en silence trahirait cette intention.
      if(request->hasHeader(FW_DIGEST_HEADER)) {
        if(!parseHexDigest(request->header(FW_DIGEST_HEADER), scan->expected)) {
          Serial.println("Firmware upload rejected: malformed " FW_DIGEST_HEADER);
          scan->digestMismatch = true;
          scan->found = true;   // le marqueur n'est pas en cause : c'est le refus d'empreinte qui répond
          scan->rejected = true;
          return;
        }
        scan->hasDigest = true;
        mbedtls_sha256_init(&scan->sha);
        FW_SHA_STARTS(&scan->sha, 0);
      }
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) { //start with max available size
        Update.printError(Serial);
      }
      else {
        somfy.transceiver.end(); // Shut down the radio so we do not get any interrupts during this process.
        mqtt.end();
      }
      // Équivalent de UPLOAD_FILE_ABORTED (WebServer&) : ESPAsyncWebServer ne signale pas
      // l'abandon via le callback d'upload lui-même, mais via un callback de déconnexion séparé.
      request->onDisconnect([]() {
        if (Update.isRunning()) {
          Serial.println("Upload aborted (client disconnected)");
          Update.abort();
        }
      });
    }
    /* flashing firmware to ESP*/
    FwImageScan *scan = (FwImageScan *)request->_tempObject;
    if(!scan || scan->rejected) return;
    fwScanChunk(scan, data, len);
    if(scan->hasDigest) FW_SHA_UPDATE(&scan->sha, data, len);
    if (Update.write(data, len) != len) {
      Update.printError(Serial);
      Serial.printf("Upload of %s aborted invalid size %d\n", filename.c_str(), len);
      Update.abort();
    }
    if (final) {
      // Image étrangère : rien n'est validé. Update.end() n'étant jamais appelé, la partition OTA
      // ne devient pas amorçable et l'appareil restera sur son firmware actuel. Le contrôle par
      // nom de fichier côté navigateur ne suffisait pas -- renommer un binaire v2.x.x au format
      // v3 le faisait passer, avec pour résultat une table de partition incompatible et une
      // récupération par USB obligatoire.
      if(!scan->found) {
        Serial.println("Update rejected: firmware image marker not found (incompatible partition layout)");
        Update.abort();
        if(scan->hasDigest) mbedtls_sha256_free(&scan->sha);
        return;
      }
      // Vérification AVANT Update.end(true), qui appelle esp_ota_set_boot_partition() : après lui,
      // il serait trop tard pour refuser l'image.
      if(scan->hasDigest) {
        uint8_t got[32];
        FW_SHA_FINISH(&scan->sha, got);
        mbedtls_sha256_free(&scan->sha);
        if(memcmp(got, scan->expected, sizeof(got)) != 0) {
          Serial.println("Update rejected: SHA-256 mismatch");
          scan->digestMismatch = true;
          Update.abort();
          return;
        }
      }
      if (Update.end(true)) { //true to set the size to the current progress
        DBG_PRINTF("Update Success: %u\nRebooting...\n", index + len);
      }
      else {
        Update.printError(Serial);
      }
      wdtReset();
      // Relevé de pile async_tcp : upload firmware (multipart + écriture partition OTA), l'autre
      // chemin d'upload à mesurer. Cf. CONFIG_ASYNC_TCP_STACK_SIZE dans platformio.ini.
      ConfigSettings::reportAsyncTcpStackLow("upload /updateFirmware");
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
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Upload failed\"}");
      return;
    }
    // Chargement déplacé ICI depuis le callback de corps : c'est le seul endroit d'où l'on puisse
    // encore répondre. Tant qu'il vivait dans le callback, son booléen de retour était jeté et un
    // fichier illisible passait pour un succès. L'ordre reste celui que documentait déjà le
    // callback -- verrou relâché au chunk final, PUIS relecture, le filesystem devant être libre.
    if(!somfy.loadShadesFile("/shades.tmp")) {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid shade configuration file\"}");
      return;
    }
    request->send(200, _encoding_json, "{\"status\":\"Success\",\"desc\":\"Shade configuration updated\"}");
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
      AsyncResponseStream *stream = request->beginResponseStream("text/xml");
      SSDP.schema(*stream);
      request->send(stream);
    });
    server.on("/controller", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleController(request); });
    server.on("/backup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleBackup(request, true); });
    // Les callbacks d'upload sont enveloppés dans une lambda plutôt que passés tels quels : leur
    // signature (AsyncWebServerRequest*, const String&, size_t, uint8_t*, size_t, bool) ne
    // correspond pas exactement au std::function attendu par on() sans cette conversion explicite.
    server.on("/restore", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleRestore(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleRestoreBody(request, filename, index, data, len, final); });
    server.on("/updateFirmware", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleUpdateFirmware(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUpdateFirmwareBody(request, filename, index, data, len, final); });
    server.on("/updateShadeConfig", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleUpdateShadeConfig(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUpdateShadeConfigBody(request, filename, index, data, len, final); });
    server.on("/reboot", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleReboot(request); });
  }
}
