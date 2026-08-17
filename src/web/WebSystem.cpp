#include <LittleFS.h>
#include <Update.h>
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
  void handleController(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    settings.printAvailHeap();
    if (method == AsyncHttp::POST || method == AsyncHttp::GET) {
      JsonAsyncResponse resp;
      // /controller agrège rooms+shades+groups+repeaters+schedules -- potentiellement la plus
      // grosse réponse JSON de toute l'appli (jusqu'à SOMFY_MAX_SHADES=32 volets détaillés) et
      // appelée à chaque (re)connexion socket (loadSomfy(), cf. 20-shell.js) : le défaut de
      // beginResponse() ne suffirait pas à l'écrire en un seul bloc -- cf. commentaire détaillé
      // sur expectedSize dans WResp.h.
      resp.beginResponse(request, 16384);
      resp.beginObject();
      resp.addElem("maxRooms", (uint8_t)SOMFY_MAX_ROOMS);
      resp.addElem("maxShades", (uint8_t)SOMFY_MAX_SHADES);
      resp.addElem("maxGroups", (uint8_t)SOMFY_MAX_GROUPS);
      resp.addElem("maxGroupedShades", (uint8_t)SOMFY_MAX_GROUPED_SHADES);
      resp.addElem("maxLinkedRemotes", (uint8_t)SOMFY_MAX_LINKED_REMOTES);
      resp.addElem("maxSchedules", (uint8_t)SOMFY_MAX_SCHEDULES);
      resp.addElem("startingAddress", (uint32_t)somfy.startingAddress);
      resp.beginObject("transceiver");
      somfy.transceiver.toJSON(resp);
      resp.endObject();
      resp.beginObject("version");
      git.toJSON(resp);
      resp.endObject();
      resp.beginArray("rooms");
      somfy.toJSONRooms(resp);
      resp.endArray();
      resp.beginArray("shades");
      somfy.toJSONShades(resp);
      resp.endArray();
      resp.beginArray("groups");
      somfy.toJSONGroups(resp);
      resp.endArray();
      resp.beginArray("repeaters");
      somfy.toJSONRepeaters(resp);
      resp.endArray();
      resp.beginArray("schedules");
      schedule.toJSONSchedules(resp);
      resp.endArray();
      resp.endObject();
      resp.endResponse();
    }
    else request->send(404, _encoding_text, _response_404);
  }

  void handleDiscovery(AsyncWebServerRequest *request) {
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::POST || method == AsyncHttp::GET) {
      DBG_PRINTLN("Discovery Requested");
      char connType[10] = "Unknown";
      if(net.connType == conn_types_t::ethernet) strcpy(connType, "Ethernet");
      else if(net.connType == conn_types_t::wifi) strcpy(connType, "Wifi");

      JsonAsyncResponse resp;
      // Même raison qu'au-dessus dans handleController() : rooms+shades+groups inclus ici aussi.
      resp.beginResponse(request, 16384);
      resp.beginObject();
      resp.addElem("serverId", settings.serverId);
      resp.addElem("version", settings.fwVersion.name);
      resp.addElem("latest", git.latest.name);
      resp.addElem("model", "ESPSomfyRTS");
      resp.addElem("hostname", settings.hostname);
      resp.addElem("authType", static_cast<uint8_t>(settings.Security.type));
      resp.addElem("permissions", settings.Security.permissions);
      resp.addElem("chipModel", settings.chipModel);
      resp.addElem("connType", connType);
      resp.addElem("checkForUpdate", settings.checkForUpdate);
      resp.beginObject("memory");
      resp.addElem("max", ESP.getMaxAllocHeap());
      resp.addElem("free", ESP.getFreeHeap());
      resp.addElem("min", ESP.getMinFreeHeap());
      resp.addElem("total", ESP.getHeapSize());
      // Même champ que l'évènement socket memStatus (cf. Network::emitHeap) : les deux surfaces
      // exposant la mémoire décrivent ainsi le même état, fragmentation comprise.
      resp.addElem("largest", (uint32_t)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
      resp.endObject();
      resp.beginArray("rooms");
      somfy.toJSONRooms(resp);
      resp.endArray();
      resp.beginArray("shades");
      somfy.toJSONShades(resp);
      resp.endArray();
      resp.beginArray("groups");
      somfy.toJSONGroups(resp);
      resp.endArray();
      resp.endObject();
      resp.endResponse();
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
    // PROPRE connexion TLS vers GitHub (repo.getReleases(), ~45 Ko d'un seul bloc contigu exigés
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
