#include <WebServer.h>
#include <LittleFS.h>
#include <Update.h>
#include <esp_task_wdt.h>
#include "ConfigSettings.h"
#include "ConfigFile.h"
#include "Utils.h"
#include "SSDP.h"
#include "Somfy.h"
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
  void handleController(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, false)) return;
    HTTPMethod method = server.method();
    settings.printAvailHeap();
    if (method == HTTP_POST || method == HTTP_GET) {
      JsonResponse resp;
      resp.beginResponse(&server, g_content, sizeof(g_content));
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
    else server.send(404, _encoding_text, _response_404);
  }

  void handleDiscovery(WebServer &server) {
    HTTPMethod method = server.method();
    if (method == HTTP_POST || method == HTTP_GET) {
      DBG_PRINTLN("Discovery Requested");
      char connType[10] = "Unknown";
      if(net.connType == conn_types_t::ethernet) strcpy(connType, "Ethernet");
      else if(net.connType == conn_types_t::wifi) strcpy(connType, "Wifi");

      JsonResponse resp;
      resp.beginResponse(&server, g_content, sizeof(g_content));
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
      server.client().stop();
      net.needsBroadcast = true;
    }
    else
      server.send(500, _encoding_text, "Invalid http method");
  }

  void handleBackup(WebServer &server, bool attach) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    if(server.hasArg("attach")) attach = toBoolean(server.arg("attach").c_str(), attach);

    if(attach) {
      Timestamp ts;
      char * iso = ts.getISOTime();

      for(char *p = iso; *p; p++) {
        if(*p == '.') { *p = '\0'; break; }
        if(*p == ':') *p = '_';
      }

      server.sendHeader(F("Content-Disposition"), String(F("attachment; filename=\"ESPSomfyRTS ")) + iso + F(".backup\""));
      server.sendHeader(F("Access-Control-Expose-Headers"), F("Content-Disposition"));
    }
    DBG_PRINTLN(F("Backup..."));
    somfy.writeBackup();

    File file = LittleFS.open("/controller.backup", "r");
    if (!file) {
      server.send(500, _encoding_text, F("Err: File"));
      return;
    }
    server.streamFile(file, _encoding_text);
    file.close();
  }

  void handleDownloadFirmware(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    GitRepo repo;
    GitRelease *rel = nullptr;
    int8_t err = repo.getReleases();
    DBG_PRINTLN("downloadFirmware called...");
    if(err == 0) {
      if(server.hasArg("ver")) {
        if(strcmp(server.arg("ver").c_str(), "latest") == 0) rel = &repo.releases[0];
        else if(strcmp(server.arg("ver").c_str(), "main") == 0) {
          rel = &repo.releases[GIT_MAX_RELEASES];
        }
        else {
          for(uint8_t i = 0; i < GIT_MAX_RELEASES; i++) {
            if(repo.releases[i].id == 0) continue;
            if(strcmp(repo.releases[i].name, server.arg("ver").c_str()) == 0) {
              rel = &repo.releases[i];
            }
          }
        }
        if(rel) {
          JsonResponse resp;
          resp.beginResponse(&server, g_content, sizeof(g_content));
          resp.beginObject();
          rel->toJSON(resp);
          resp.endObject();
          resp.endResponse();
          strcpy(git.targetRelease, rel->name);
          git.status = GIT_AWAITING_UPDATE;
        }
        else
          server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Release not found in repo.\"}"));
      }
      else
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Release version not supplied.\"}"));
    }
    else {
        server.send(err, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Error communicating with Github.\"}"));
    }
  }

  void handleReboot(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    HTTPMethod method = server.method();
    if (method == HTTP_POST || method == HTTP_PUT) {
      DBG_PRINTLN("Rebooting ESP...");
      rebootDelay.rebootTime = millis() + 500;
      rebootDelay.reboot = true;
      server.send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully started reboot\"}");
    }
    else {
      server.send(201, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
    }
  }

  // Ne fait plus l'appel HTTPS/TLS bloquant ici (dangereux sous ESPAsyncWebServer : bloquerait la
  // tâche async_tcp, donc tous les autres clients, pendant toute la durée de l'appel à l'API
  // GitHub). Se contente de déclencher la récupération (traitée par git.loop() sur la tâche
  // principale, cf. GitOTA.h::releasesRequested) et retourne l'état courant de git.cachedReleases
  // -- éventuellement vide/périmé au tout premier appel, rafraîchi en tâche de fond ensuite et
  // notifié en temps réel via l'évènement socket "fwStatus" (cf. GitUpdater::setCurrentRelease).
  static void handleGetReleases(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    bool wasFetching = git.releasesRequested;
    git.releasesRequested = true;
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginObject();
    resp.addElem("fetching", wasFetching);
    git.cachedReleases.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleCancelFirmware(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    // If we are currently downloading the filesystem we cannot cancel.
    if(!git.lockFS) {
      git.status = GIT_UPDATE_CANCELLING;
      JsonResponse resp;
      resp.beginResponse(&server, g_content, sizeof(g_content));
      resp.beginObject();
      git.toJSON(resp);
      resp.endObject();
      resp.endResponse();
      git.cancelled = true;
    }
    else {
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Cannot cancel during filesystem update.\"}"));
    }
  }

  static void handleRestore(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    server.sendHeader("Connection", "close");
    if(webServer.uploadSuccess) {
      server.send(200, _encoding_json, "{\"status\":\"Success\",\"desc\":\"Restoring Shade settings\"}");
      restore_options_t opts;
      if(server.hasArg("data")) {
        if(settings.enableDebugLogs) Serial.println(server.arg("data"));
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, server.arg("data"));
        if (err) {
          webServer.handleDeserializationError(server, err);
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
  }

  static void handleRestoreBody(WebServer &server) {
    esp_task_wdt_reset();
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      webServer.uploadSuccess = false;
      DBG_PRINTF("Restore: %s\n", upload.filename.c_str());
      // Begin by opening a new temporary file.
      File fup = LittleFS.open("/shades.tmp", "w");
      fup.close();
    }
    else if (upload.status == UPLOAD_FILE_WRITE) {
      File fup = LittleFS.open("/shades.tmp", "a");
      fup.write(upload.buf, upload.currentSize);
      fup.close();
    }
    else if (upload.status == UPLOAD_FILE_END) {
      webServer.uploadSuccess = true;
    }
  }

  static void handleUpdateFirmware(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    if (Update.hasError())
      server.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error updating firmware: \"}");
    else
      server.send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Successfully updated firmware\"}");
    rebootDelay.rebootTime = millis() + 500;
    rebootDelay.reboot = true;
  }

  static void handleUpdateFirmwareBody(WebServer &server) {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      webServer.uploadSuccess = false;
      DBG_PRINTF("Update: %s - %d\n", upload.filename.c_str(), upload.totalSize);
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) { //start with max available size
        Update.printError(Serial);
      }
      else {
        somfy.transceiver.end(); // Shut down the radio so we do not get any interrupts during this process.
        mqtt.end();
      }
    }
    else if(upload.status == UPLOAD_FILE_ABORTED) {
      Serial.printf("Upload of %s aborted\n", upload.filename.c_str());
      Update.abort();
    }
    else if (upload.status == UPLOAD_FILE_WRITE) {
      /* flashing firmware to ESP*/
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
        Serial.printf("Upload of %s aborted invalid size %d\n", upload.filename.c_str(), upload.currentSize);
        Update.abort();
      }
    }
    else if (upload.status == UPLOAD_FILE_END) {
      if (Update.end(true)) { //true to set the size to the current progress
        DBG_PRINTF("Update Success: %u\nRebooting...\n", upload.totalSize);
        webServer.uploadSuccess = true;
      }
      else {
        Update.printError(Serial);
      }
    }
    esp_task_wdt_reset();
  }

  static void handleUpdateShadeConfig(WebServer &server) {
    if(git.lockFS) {
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}"));
      return;
    }
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    server.sendHeader("Connection", "close");
    server.send(200, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Updating Shade Config: \"}");
  }

  static void handleUpdateShadeConfigBody(WebServer &server) {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      DBG_PRINTF("Update: shades.cfg\n");
      File fup = LittleFS.open("/shades.tmp", "w");
      fup.close();
    }
    else if (upload.status == UPLOAD_FILE_WRITE) {
      /* flashing littlefs to ESP*/
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        File fup = LittleFS.open("/shades.tmp", "a");
        fup.write(upload.buf, upload.currentSize);
        fup.close();
      }
    }
    else if (upload.status == UPLOAD_FILE_END) {
      somfy.loadShadesFile("/shades.tmp");
    }
  }

  static void handleUpdateApplication(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    server.sendHeader("Connection", "close");
    if (Update.hasError())
      server.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error updating application: \"}");
    else
      server.send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Successfully updated application\"}");
    rebootDelay.rebootTime = millis() + 500;
    rebootDelay.reboot = true;
  }

  static void handleUpdateApplicationBody(WebServer &server) {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      webServer.uploadSuccess = false;
      DBG_PRINTF("Update: %s %d\n", upload.filename.c_str(), upload.totalSize);
      if (!Update.begin(UPDATE_SIZE_UNKNOWN, U_SPIFFS)) { //start with max available size and tell it we are updating the file system.
        Update.printError(Serial);
      }
      else {
        somfy.transceiver.end(); // Shut down the radio so we do not get any interrupts during this process.
        mqtt.end();
      }
    }
    else if(upload.status == UPLOAD_FILE_ABORTED) {
      Serial.printf("Upload of %s aborted\n", upload.filename.c_str());
      Update.abort();
      somfy.commit();
    }
    else if (upload.status == UPLOAD_FILE_WRITE) {
      /* flashing littlefs to ESP*/
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
        Serial.printf("Upload of %s aborted invalid size %d\n", upload.filename.c_str(), upload.currentSize);
        Update.abort();
      }
    }
    else if (upload.status == UPLOAD_FILE_END) {
      if (Update.end(true)) { //true to set the size to the current progress
        webServer.uploadSuccess = true;
        DBG_PRINTF("Update Success: %u\nRebooting...\n", upload.totalSize);
        somfy.commit();
      }
      else {
        somfy.commit();
        Update.printError(Serial);
      }
    }
    esp_task_wdt_reset();
  }

  static void handleRecoverFilesystem(WebServer &server) {
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    webServer.sendCORSHeaders(server);
    if(git.status == GIT_UPDATING)
      server.send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Filesystem is updating.  Please wait!!!\"}");
    else if(git.status != GIT_STATUS_READY)
      server.send(200, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Cannot recover file system at this time.\"}");
    else {
      git.recoverFilesystem();
      server.send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Recovering filesystem from github please wait!!!\"}");
    }
  }

  void registerRoutes(WebServer &server) {
    server.on("/upnp.xml", [&server]() { SSDP.schema(server.client()); });
    server.on("/controller", [&server]() { handleController(server); });
    server.on("/getReleases", [&server]() { handleGetReleases(server); });
    server.on("/downloadFirmware", [&server]() { handleDownloadFirmware(server); });
    server.on("/cancelFirmware", [&server]() { handleCancelFirmware(server); });
    server.on("/backup", [&server]() { handleBackup(server, true); });
    server.on("/restore", HTTP_POST, [&server]() { handleRestore(server); }, [&server]() { handleRestoreBody(server); });
    server.on("/updateFirmware", HTTP_POST, [&server]() { handleUpdateFirmware(server); }, [&server]() { handleUpdateFirmwareBody(server); });
    server.on("/updateShadeConfig", HTTP_POST, [&server]() { handleUpdateShadeConfig(server); }, [&server]() { handleUpdateShadeConfigBody(server); });
    server.on("/updateApplication", HTTP_POST, [&server]() { handleUpdateApplication(server); }, [&server]() { handleUpdateApplicationBody(server); });
    server.on("/reboot", [&server]() { handleReboot(server); });
    server.on("/recoverFilesystem", [&server]() { handleRecoverFilesystem(server); });
  }

  // --- Surcharges ESPAsyncWebServer (étape 3/4 migration, non câblées pour l'instant) ---

  void handleController(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    settings.printAvailHeap();
    if (method == HTTP_POST || method == HTTP_GET) {
      JsonAsyncResponse resp;
      resp.beginResponse(request);
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
    if (method == HTTP_POST || method == HTTP_GET) {
      DBG_PRINTLN("Discovery Requested");
      char connType[10] = "Unknown";
      if(net.connType == conn_types_t::ethernet) strcpy(connType, "Ethernet");
      else if(net.connType == conn_types_t::wifi) strcpy(connType, "Wifi");

      JsonAsyncResponse resp;
      resp.beginResponse(request);
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
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
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

  void handleDownloadFirmware(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    GitRepo repo;
    GitRelease *rel = nullptr;
    int8_t err = repo.getReleases();
    DBG_PRINTLN("downloadFirmware called...");
    if(err == 0) {
      if(request->hasArg("ver")) {
        if(strcmp(request->arg("ver").c_str(), "latest") == 0) rel = &repo.releases[0];
        else if(strcmp(request->arg("ver").c_str(), "main") == 0) {
          rel = &repo.releases[GIT_MAX_RELEASES];
        }
        else {
          for(uint8_t i = 0; i < GIT_MAX_RELEASES; i++) {
            if(repo.releases[i].id == 0) continue;
            if(strcmp(repo.releases[i].name, request->arg("ver").c_str()) == 0) {
              rel = &repo.releases[i];
            }
          }
        }
        if(rel) {
          JsonAsyncResponse resp;
          resp.beginResponse(request);
          resp.beginObject();
          rel->toJSON(resp);
          resp.endObject();
          resp.endResponse();
          strcpy(git.targetRelease, rel->name);
          git.status = GIT_AWAITING_UPDATE;
        }
        else
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Release not found in repo.\"}");
      }
      else
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Release version not supplied.\"}");
    }
    else {
        request->send(err, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error communicating with Github.\"}");
    }
  }

  void handleReboot(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == HTTP_POST || method == HTTP_PUT) {
      DBG_PRINTLN("Rebooting ESP...");
      rebootDelay.rebootTime = millis() + 500;
      rebootDelay.reboot = true;
      request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully started reboot\"}");
    }
    else {
      request->send(201, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
    }
  }

  static void handleGetReleases(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    bool wasFetching = git.releasesRequested;
    git.releasesRequested = true;
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.addElem("fetching", wasFetching);
    git.cachedReleases.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleCancelFirmware(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
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
  struct UploadState { bool success = false; };

  static void handleRestore(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
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
      state->success = false;
      request->_tempObject = state;
      DBG_PRINTF("Restore: %s\n", filename.c_str());
      File fup = LittleFS.open("/shades.tmp", "w");
      fup.close();
    }
    File fup = LittleFS.open("/shades.tmp", "a");
    fup.write(data, len);
    fup.close();
    if (final) {
      UploadState *state = (UploadState *)request->_tempObject;
      if(state) state->success = true;
    }
  }

  static void handleUpdateFirmware(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
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
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    request->send(200, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Updating Shade Config: \"}");
  }

  static void handleUpdateShadeConfigBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    if (index == 0) {
      DBG_PRINTF("Update: shades.cfg\n");
      File fup = LittleFS.open("/shades.tmp", "w");
      fup.close();
    }
    /* flashing littlefs to ESP*/
    if (Update.write(data, len) != len) {
      File fup = LittleFS.open("/shades.tmp", "a");
      fup.write(data, len);
      fup.close();
    }
    if (final) {
      somfy.loadShadesFile("/shades.tmp");
    }
  }

  static void handleUpdateApplication(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
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
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
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
    server.on("/upnp.xml", HTTP_ANY, [](AsyncWebServerRequest *request) {
      AsyncResponseStream *stream = request->beginResponseStream("text/xml");
      SSDP.schema(*stream);
      request->send(stream);
    });
    server.on("/controller", HTTP_ANY, [](AsyncWebServerRequest *request) { handleController(request); });
    server.on("/getReleases", HTTP_ANY, [](AsyncWebServerRequest *request) { handleGetReleases(request); });
    server.on("/downloadFirmware", HTTP_ANY, [](AsyncWebServerRequest *request) { handleDownloadFirmware(request); });
    server.on("/cancelFirmware", HTTP_ANY, [](AsyncWebServerRequest *request) { handleCancelFirmware(request); });
    server.on("/backup", HTTP_ANY, [](AsyncWebServerRequest *request) { handleBackup(request, true); });
    // Les callbacks d'upload sont enveloppés dans une lambda (plutôt que passés tels quels) car
    // handleXxxBody existe en deux surcharges dans ce même namespace (WebServer&/AsyncWebServerRequest*)
    // -- le nom seul est alors ambigu pour la conversion implicite vers std::function attendue par on().
    server.on("/restore", HTTP_POST, [](AsyncWebServerRequest *request) { handleRestore(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleRestoreBody(request, filename, index, data, len, final); });
    server.on("/updateFirmware", HTTP_POST, [](AsyncWebServerRequest *request) { handleUpdateFirmware(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUpdateFirmwareBody(request, filename, index, data, len, final); });
    server.on("/updateShadeConfig", HTTP_POST, [](AsyncWebServerRequest *request) { handleUpdateShadeConfig(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUpdateShadeConfigBody(request, filename, index, data, len, final); });
    server.on("/updateApplication", HTTP_POST, [](AsyncWebServerRequest *request) { handleUpdateApplication(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUpdateApplicationBody(request, filename, index, data, len, final); });
    server.on("/reboot", HTTP_ANY, [](AsyncWebServerRequest *request) { handleReboot(request); });
    server.on("/recoverFilesystem", HTTP_ANY, [](AsyncWebServerRequest *request) { handleRecoverFilesystem(request); });
  }
}
