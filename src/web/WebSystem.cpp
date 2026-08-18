#include <LittleFS.h>
#include <Update.h>
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
#include "GitOTA.h"
#include "Network.h"
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
extern GitUpdater git;
extern Network net;
extern ScheduleController schedule;

namespace WebSystem {
  // --- Sérialisation chunked de /controller (audit heap, 17/08/2026) ---
  // Cf. WebChunkedJson.h pour le pourquoi (coin de 16 Ko + plafond de configuration). L'ordre des
  // phases ci-dessous reproduit EXACTEMENT celui de l'ancienne version bufferisée -- toute
  // divergence produirait un JSON structurellement différent, que le front-end consommerait sans
  // rien signaler.
  enum ctl_phase_t : uint8_t {
    CTL_HEAD = 0,     // "{" + scalaires + "transceiver"
    CTL_VERSION,      // ,"version":{...}   -- séparé de CTL_HEAD pour ne pas cumuler deux objets
                      // imbriqués dans le même tampon d'élément
    CTL_ROOMS, CTL_SHADES, CTL_GROUPS, CTL_REPEATERS, CTL_SCHEDULES,
    CTL_EPILOGUE,     // "}"
    CTL_DONE
  };

  // Instantané des index valides, pris une fois pour toutes à l'ouverture de la réponse. La réponse
  // chunked s'étale désormais sur plusieurs cycles d'ACK (dizaines de ms), là où le handler
  // bufferisé produisait un instantané atomique : sans cette photo, un volet ajouté ou supprimé en
  // cours d'émission pourrait apparaître deux fois ou manquer. ~103 octets, et ça règle du même
  // coup la granularité du verrou de ScheduleController, qu'on ne peut plus tenir sur toute la
  // durée d'un transfert réseau.
  struct ControllerChunkState {
    ChunkedJsonEmitter em;
    uint8_t phase = CTL_HEAD;
    uint8_t idx = 0;
    bool openEmitted = false;
    bool firstItem = true;
    bool overflowed = false;
    uint8_t rooms[SOMFY_MAX_ROOMS];       uint8_t nRooms = 0;
    uint8_t shades[SOMFY_MAX_SHADES];     uint8_t nShades = 0;
    uint8_t groups[SOMFY_MAX_GROUPS];     uint8_t nGroups = 0;
    uint8_t reps[SOMFY_MAX_REPEATERS];    uint8_t nReps = 0;
    uint8_t scheds[SOMFY_MAX_SCHEDULES];  uint8_t nScheds = 0;
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
        j->addElem("maxSchedules", (uint8_t)SOMFY_MAX_SCHEDULES);
        j->addElem("startingAddress", (uint32_t)somfy.startingAddress);
        j->beginObject("transceiver");
        somfy.transceiver.toJSON(*j);
        j->endObject();
        st->phase = CTL_VERSION;
        break;
      }
      case CTL_VERSION: {
        JsonFormatter *j = st->em.beginItem(true);
        j->beginObject("version");
        git.toJSON(*j);
        j->endObject();
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
          somfy.shades[st->shades[st->idx]].toJSON(*j);
          j->endObject();
          st->idx++; st->firstItem = false;
          break;
        }
        st->em.emitRaw("]");
        st->phase = CTL_GROUPS; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      case CTL_GROUPS:
        if(!st->openEmitted) { st->em.emitRaw(",\"groups\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nGroups) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          somfy.groups[st->groups[st->idx]].toJSON(*j);
          j->endObject();
          st->idx++; st->firstItem = false;
          break;
        }
        st->em.emitRaw("]");
        st->phase = CTL_REPEATERS; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      case CTL_REPEATERS:
        if(!st->openEmitted) { st->em.emitRaw(",\"repeaters\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nReps) {
          // Éléments scalaires, pas des objets : cf. SomfyShadeController::toJSONRepeaters.
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->addElem((uint32_t)somfy.repeaters[st->reps[st->idx]]);
          st->idx++; st->firstItem = false;
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
    if(!st->em.endItem() && !st->overflowed) {
      st->overflowed = true;
      Serial.printf("[CHUNKED] /controller: element tronque en phase %u (tampon de %u octets depasse)\n",
        (unsigned)st->phase, (unsigned)CHUNKED_ITEM_BUF);
    }
    return true;
  }

  void handleController(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    settings.printAvailHeap();
    if (method == AsyncHttp::POST || method == AsyncHttp::GET) {
      // Réponse chunked plutôt que bufferisée (audit heap, 17/08/2026) : cf. WebChunkedJson.h.
      // L'ancienne version réservait 16384 octets contigus d'un coup -- coin de fragmentation
      // mesuré, et plafond de configuration au-delà duquel cette route ne pouvait plus répondre.
      auto st = std::make_shared<ControllerChunkState>();
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
    else request->send(404, _encoding_text, _response_404);
  }

  // --- Sérialisation chunked de /discovery (étape B2, 17/08/2026) ---
  // Même motif que /controller ci-dessus, et pour la même raison mesurée sur matériel : deux boots
  // identiques ont montré une chute de EXACTEMENT 16384 octets de plus gros bloc contigu, non
  // résorbée, pour seulement ~2700 octets de données réellement ajoutées -- signature d'une
  // réservation de 16 Ko prise puis rendue, qui échoue au passage les petites allocations
  // permanentes. Après la conversion de /controller, cette route et handleGetShades étaient les
  // deux dernières à réserver 16384.
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
    bool overflowed = false;
    // Capturé à la réception de la requête : net.connType peut changer d'ici la sérialisation.
    char connType[10] = "Unknown";
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
        j->addElem("latest", git.latest.name);
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
        // Même champ que l'évènement socket memStatus (cf. Network::emitHeap) : les deux surfaces
        // exposant la mémoire décrivent ainsi le même état, fragmentation comprise.
        j->addElem("largest", (uint32_t)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
        j->endObject();
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
          somfy.shades[st->shades[st->idx]].toJSON(*j);
          j->endObject();
          st->idx++; st->firstItem = false;
          break;
        }
        st->em.emitRaw("]");
        st->phase = DISC_GROUPS; st->openEmitted = false; st->firstItem = true; st->idx = 0;
        return true;
      case DISC_GROUPS:
        if(!st->openEmitted) { st->em.emitRaw(",\"groups\":["); st->openEmitted = true; return true; }
        if(st->idx < st->nGroups) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          somfy.groups[st->groups[st->idx]].toJSON(*j);
          j->endObject();
          st->idx++; st->firstItem = false;
          break;
        }
        st->em.emitRaw("]");
        st->phase = DISC_EPILOGUE;
        return true;
      case DISC_EPILOGUE:
        st->em.emitRaw("}");
        st->phase = DISC_DONE;
        return true;
      default:
        return false;
    }
    if(!st->em.endItem() && !st->overflowed) {
      st->overflowed = true;
      Serial.printf("[CHUNKED] /discovery: element tronque en phase %u (tampon de %u octets depasse)\n",
        (unsigned)st->phase, (unsigned)CHUNKED_ITEM_BUF);
    }
    return true;
  }

  void handleDiscovery(AsyncWebServerRequest *request) {
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
    somfy.writeBackup();

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

  // Recherche `ver` ("latest"/"main"/tag exact) dans un GitRepo déjà rempli -- factorisé pour être
  // utilisable aussi bien sur le cache (git.cachedReleases) que sur un fetch réseau de secours,
  // cf. handleDownloadFirmware() ci-dessous.
  static GitRelease *findRelease(GitRepo &repo, const char *ver) {
    if(strcmp(ver, "latest") == 0) return &repo.releases[0];
    if(strcmp(ver, "main") == 0) return &repo.releases[GIT_MAX_RELEASES];
    for(uint8_t i = 0; i < GIT_MAX_RELEASES; i++) {
      if(repo.releases[i].id == 0) continue;
      if(strcmp(repo.releases[i].name, ver) == 0) return &repo.releases[i];
    }
    return nullptr;
  }

  void handleDownloadFirmware(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(!request->hasArg("ver")) {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Release version not supplied.\"}");
      return;
    }
    DBG_PRINTLN("downloadFirmware called...");
    // Root cause de "ERR_GIT_LOW_HEAP" ("Not enough free memory to start a secure connection")
    // observé en pratique lors d'une installation OTA réelle : cette route rouvrait jusqu'ici sa
    // PROPRE connexion TLS vers GitHub (repo.getReleases(), deux tampons mbedTLS de 16 Ko exigés
    // par mbedTLS, cf. hasEnoughHeapForTls()/GIT_TLS_MIN_HEAP_BYTES dans GitOTA.cpp) pour
    // re-télécharger EXACTEMENT la même liste de releases que celle déjà en cache -- le
    // /getReleases qui vient nécessairement de précéder cet appel (c'est lui qui a rempli le
    // sélecteur de version affiché à l'utilisateur) l'a déjà peuplée dans git.cachedReleases, et
    // le seul champ de la réponse réellement consommé côté client (ver.name, cf.
    // firmware.installGitRelease() dans 95-firmware.js) est de toute façon déjà connu de lui --
    // c'est lui qui l'a envoyé dans `ver`. Cette deuxième poignée de main TLS grignotait donc le
    // tas pour rien, juste avant la VRAIE connexion (downloadFile(), lancée juste après par
    // GitUpdater::loop()) -- la pire place possible pour perdre de la marge mémoire.
    GitRelease *rel = findRelease(git.cachedReleases, request->arg("ver").c_str());
    if(rel) {
      // Chemin courant (cache déjà rempli par le /getReleases qui a forcément précédé cet appel) :
      // rel pointe dans git.cachedReleases, qui vit pour toute la durée de l'appareil -- rien à
      // garder en vie localement.
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginObject();
      rel->toJSON(resp);
      resp.endObject();
      resp.endResponse();
      strcpy(git.targetRelease, rel->name);
      git.status = GIT_AWAITING_UPDATE;
      return;
    }
    // Cache vide (ex. redémarrage récent suivi d'un appel direct à cette route sans être passé
    // par la modale, donc sans /getReleases préalable) : refus propre plutôt qu'un fetch réseau
    // de secours. Ce fallback synchrone a été retiré (audit heap OTA, 14/08/2026) -- il rouvrait
    // une connexion TLS bloquante directement sur la tâche async_tcp, exactement le problème que
    // /getReleases vient de résoudre en passant au modèle différé (cf. son commentaire détaillé
    // ci-dessus). En usage normal cette branche n'est jamais atteinte : le client attend toujours
    // une réponse définitive de /getReleases (qui peuple ce cache) avant d'offrir le bouton
    // d'installation. Le client peut simplement rappeler /getReleases puis relancer l'install.
    request->send(409, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Release list not loaded yet, call /getReleases first and retry.\"}");
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

  // /getReleases n'est plus servie ici (audit heap OTA, 14/08-15/08/2026) : après plusieurs
  // correctifs plus ciblés sur cette route async (connexion redondante supprimée, drainage,
  // modèle différé par sondage...) restés insuffisants en usage réel, elle est désormais servie
  // par un serveur HTTP synchrone dédié, complètement isolé d'ESPAsyncWebServer/async_tcp -- cf.
  // WebGitSync.cpp pour le mécanisme et son historique détaillé. handleDownloadFirmware()
  // ci-dessus reste ici (encore utilisée par apiServer@8081, cf. Web.cpp -- surface API externe
  // distincte de l'UI navigateur, qui appelle désormais WebGitSync elle aussi) et garde donc
  // findRelease() comme dépendance.

  static void handleCancelFirmware(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(!git.lockFS) {
      git.status = GIT_UPDATE_CANCELLING;
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginObject();
      git.toJSON(resp);
      resp.endObject();
      resp.endResponse();
      git.cancelled = true;
    }
    else {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Cannot cancel during filesystem update.\"}");
    }
  }

  // /restore est le SEUL des 4 flux d'upload de ce module dont le handler principal lit
  // effectivement un flag de succès (les 3 autres s'appuient sur Update.hasError() ou renvoient
  // un message fixe) -- state->success est donc alloué via request->_tempObject (libéré
  // automatiquement par le destructeur d'AsyncWebServerRequest) au lieu d'un flag global partagé,
  // pour ne pas faire interférer deux requêtes /restore concurrentes sur le même booléen.
  // `rejected` (audit heap WebSockets/AsyncTCP/ESPAsyncWebServer, 17/08/2026) : même rôle que dans
  // WebI18n::handleUploadLang -- posé si GitOTA détenait déjà le filesystem au démarrage de
  // l'upload, auquel cas aucun octet n'est écrit et handleRestore() retombe sur "Upload failed".
  struct UploadState { bool success = false; bool rejected = false; };

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
    esp_task_wdt_reset();
    if (index == 0) {
      UploadState *state = (UploadState *)malloc(sizeof(UploadState));
      // Test de nullité (audit heap, 17/08/2026) : cette allocation intervient précisément quand le
      // tas est sous pression (upload en cours). Sans lui, l'échec se traduisait par un
      // déréférencement nul immédiat -- un reboot au lieu d'un "Upload failed" propre.
      if(!state) return;
      state->success = false;
      state->rejected = git.lockFS;
      request->_tempObject = state;
      if(state->rejected) return;
      // Section critique FS (audit heap WebSockets/AsyncTCP/ESPAsyncWebServer, 17/08/2026) : ce
      // handler écrit LittleFS par chunks depuis la tâche async_tcp, exactement comme
      // WebI18n::handleUploadLangBody -- lequel avait dû être verrouillé après un assert interne
      // "lfs_mlist_isopen" fatal observé en usage réel (écriture concurrente depuis la tâche
      // principale : planification, registre Somfy). Le verrou manquait ici, ce chemin étant le
      // jumeau non corrigé de ce correctif. git.lockFS est le mécanisme déjà utilisé partout
      // ailleurs pour signaler "FS occupé" (cf. Schedule.cpp, SomfyRegistry.cpp) -- réutilisé plutôt
      // que d'introduire un 2e verrou. Relâché au chunk final ; onDisconnect() est le filet de
      // sécurité si la connexion tombe en cours de transfert, sans quoi un upload interrompu
      // laisserait le verrou tenu jusqu'au reboot, gelant plannings et registre.
      git.lockFS = true;
      request->onDisconnect([]() { git.lockFS = false; });
      DBG_PRINTF("Restore: %s\n", filename.c_str());
      File fup = LittleFS.open("/shades.tmp", "w");
      fup.close();
    }
    UploadState *state = (UploadState *)request->_tempObject;
    if(!state || state->rejected) return;
    File fup = LittleFS.open("/shades.tmp", "a");
    fup.write(data, len);
    fup.close();
    if (final) {
      state->success = true;
      git.lockFS = false;
      // Relevé de pile async_tcp : chemin d'upload (parseur multipart + écriture LittleFS par
      // chunks, entièrement sur async_tcp). Cf. CONFIG_ASYNC_TCP_STACK_SIZE dans platformio.ini.
      ConfigSettings::reportAsyncTcpStackLow("upload /restore");
    }
  }

  static void handleUpdateFirmware(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if (Update.hasError())
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error updating firmware: \"}");
    else
      request->send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Successfully updated firmware\"}");
    rebootDelay.rebootTime = millis() + 500;
    rebootDelay.reboot = true;
  }

  static void handleUpdateFirmwareBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    if (index == 0) {
      DBG_PRINTF("Update: %s\n", filename.c_str());
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
    if (Update.write(data, len) != len) {
      Update.printError(Serial);
      Serial.printf("Upload of %s aborted invalid size %d\n", filename.c_str(), len);
      Update.abort();
    }
    if (final) {
      if (Update.end(true)) { //true to set the size to the current progress
        DBG_PRINTF("Update Success: %u\nRebooting...\n", index + len);
      }
      else {
        Update.printError(Serial);
      }
      esp_task_wdt_reset();
      // Relevé de pile async_tcp : upload firmware (multipart + écriture partition OTA), l'autre
      // chemin d'upload à mesurer. Cf. CONFIG_ASYNC_TCP_STACK_SIZE dans platformio.ini.
      ConfigSettings::reportAsyncTcpStackLow("upload /updateFirmware");
    }
  }

  static void handleUpdateShadeConfig(AsyncWebServerRequest *request) {
    if(git.lockFS) {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    request->send(200, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Updating Shade Config: \"}");
  }

  static void handleUpdateShadeConfigBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    esp_task_wdt_reset();
    if (index == 0) {
      UploadState *state = (UploadState *)malloc(sizeof(UploadState));
      if(!state) return;
      state->success = false;
      state->rejected = git.lockFS;
      request->_tempObject = state;
      if(state->rejected) return;
      // Même section critique FS que handleRestoreBody() ci-dessus (audit heap, 17/08/2026) : second
      // écrivain LittleFS par chunks sur la tâche async_tcp resté sans verrou. Relâché au chunk
      // final AVANT somfy.loadShadesFile(), qui relit le fichier et doit donc trouver le FS libre.
      git.lockFS = true;
      request->onDisconnect([]() { git.lockFS = false; });
      DBG_PRINTF("Update: shades.cfg\n");
      File fup = LittleFS.open("/shades.tmp", "w");
      fup.close();
    }
    UploadState *state = (UploadState *)request->_tempObject;
    if(!state || state->rejected) return;
    /* flashing littlefs to ESP*/
    if (Update.write(data, len) != len) {
      File fup = LittleFS.open("/shades.tmp", "a");
      fup.write(data, len);
      fup.close();
    }
    if (final) {
      state->success = true;
      git.lockFS = false;
      somfy.loadShadesFile("/shades.tmp");
    }
  }

  static void handleUpdateApplication(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if (Update.hasError())
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error updating application: \"}");
    else
      request->send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Successfully updated application\"}");
    rebootDelay.rebootTime = millis() + 500;
    rebootDelay.reboot = true;
  }

  static void handleUpdateApplicationBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    if (index == 0) {
      DBG_PRINTF("Update: %s\n", filename.c_str());
      if (!Update.begin(UPDATE_SIZE_UNKNOWN, U_SPIFFS)) { //start with max available size and tell it we are updating the file system.
        Update.printError(Serial);
      }
      else {
        somfy.transceiver.end(); // Shut down the radio so we do not get any interrupts during this process.
        mqtt.end();
      }
      request->onDisconnect([]() {
        if (Update.isRunning()) {
          Serial.println("Upload aborted (client disconnected)");
          Update.abort();
          somfy.commit();
        }
      });
    }
    /* flashing littlefs to ESP*/
    if (Update.write(data, len) != len) {
      Update.printError(Serial);
      Serial.printf("Upload of %s aborted invalid size %d\n", filename.c_str(), len);
      Update.abort();
    }
    if (final) {
      if (Update.end(true)) { //true to set the size to the current progress
        DBG_PRINTF("Update Success: %u\nRebooting...\n", index + len);
        somfy.commit();
      }
      else {
        somfy.commit();
        Update.printError(Serial);
      }
      esp_task_wdt_reset();
    }
  }

  static void handleRecoverFilesystem(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(git.status == GIT_UPDATING)
      request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Filesystem is updating.  Please wait!!!\"}");
    else if(git.status != GIT_STATUS_READY)
      request->send(200, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Cannot recover file system at this time.\"}");
    else {
      git.recoverFilesystem();
      request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Recovering filesystem from github please wait!!!\"}");
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
    // /getReleases et /downloadFirmware ne sont plus enregistrées ici : servies par WebGitSync
    // (port dédié, cf. son commentaire d'en-tête) pour l'UI navigateur -- handleDownloadFirmware()
    // reste néanmoins définie plus haut, encore utilisée par apiServer@8081 (cf. Web.cpp).
    server.on("/cancelFirmware", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleCancelFirmware(request); });
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
    server.on("/updateApplication", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleUpdateApplication(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUpdateApplicationBody(request, filename, index, data, len, final); });
    server.on("/reboot", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleReboot(request); });
    server.on("/recoverFilesystem", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleRecoverFilesystem(request); });
  }
}
