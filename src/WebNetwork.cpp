#include <WiFi.h>
#include <WebServer.h>
#include <esp_task_wdt.h>
#include "ConfigSettings.h"
#include "Utils.h"
#include "Somfy.h"
#include "WResp.h"
#include "Web.h"
#include "MQTT.h"
#include "GitOTA.h"
#include "Network.h"
#include "Recovery.h"    // LED_PROFILE_FIXED
#include "StatusLed.h"
#include "WebCommon.h"
#include "WebNetwork.h"

extern ConfigSettings settings;
extern rebootDelay_t rebootDelay;
extern Web webServer;
extern MQTTClass mqtt;
extern GitUpdater git;
extern Network net;

namespace WebNetwork {
  static void handleScanAps(WebServer &server) {
    webServer.sendCORSHeaders(server);
    esp_task_wdt_reset();

    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    esp_task_wdt_delete(NULL);
    if(net.softAPOpened) WiFi.disconnect(false);
    int n = WiFi.scanNetworks(false, true);
    esp_task_wdt_add(NULL);

    DBG_PRINT("Scanned ");
    DBG_PRINT(n);
    DBG_PRINTLN(" networks");
    // Ok we need to chunk this response as well.
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginObject();
    resp.beginObject("connected");
    resp.addElem("name", settings.WIFI.ssid);
    resp.addElem("passphrase", settings.WIFI.passphrase);
    resp.addElem("strength", (int32_t)WiFi.RSSI());
    resp.addElem("channel", (int32_t)WiFi.channel());
    resp.endObject();
    resp.beginArray("accessPoints");
    for(int i = 0; i < n; ++i) {
      if(WiFi.SSID(i).length() == 0 || WiFi.RSSI(i) < -95) continue; // Ignore hidden and weak networks that we cannot connect to anyway.
      resp.beginObject();
      resp.addElem("name", WiFi.SSID(i).c_str());
      resp.addElem("channel", (int32_t)WiFi.channel(i));
      resp.addElem("strength", (int32_t)WiFi.RSSI(i));
      resp.addElem("macAddress", WiFi.BSSIDstr(i).c_str());
      resp.endObject();
    }
    resp.endArray();
    resp.endObject();
    resp.endResponse();
  }

  static void handleSetGeneral(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    DynamicJsonDocument doc(512);

    if(settings.enableDebugLogs) {
      Serial.print("Plain: ");
      Serial.print(server.method());
      Serial.println(server.arg("plain"));
    }
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (err) {
      webServer.handleDeserializationError(server, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      HTTPMethod method = server.method();
      if (method == HTTP_POST || method == HTTP_PUT) {
        // Parse out all the inputs.
        // Refus STRICT d'une broche de LED déjà attribuée : l'accepter casserait l'émission radio
        // ou un relais de volet en silence, et le symptôme (« mes volets ne répondent plus »)
        // n'aurait aucun rapport visible avec le réglage qui l'a causé. La validation est aussi
        // faite côté navigateur, mais l'API est joignable directement.
        if(obj.containsKey("ledPin")) {
          int ledPin = obj["ledPin"].as<int>();
          #if LED_PROFILE_FIXED
          server.send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"LED_PIN_FIXED\",\"desc\":\"The status LED is wired in hardware on this device.\"}");
          return;
          #else
          if(ledPin < -1 || ledPin > 48) {
            server.send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"LED_PIN_INVALID\",\"desc\":\"Invalid GPIO number for the status LED.\"}");
            return;
          }
          const char *owner = nullptr;
          if(somfyPinInUse((int8_t)ledPin, &owner)) {
            String msg = "{\"status\":\"ERROR\",\"code\":\"LED_PIN_IN_USE\",\"pin\":";
            msg += ledPin;
            msg += ",\"owner\":\"";
            msg += owner ? owner : "";
            msg += "\",\"desc\":\"GPIO already assigned.\"}";
            server.send(400, "application/json", msg);
            return;
          }
          #endif
        }
        // Refus STRICT hors plage : une latitude/longitude aberrante fausserait silencieusement
        // tous les calculs lever/coucher (cf. SunCalc), avec un symptôme (déclenchement à la
        // mauvaise heure, ou jamais) sans rapport visible avec le réglage qui l'a causé.
        if(obj.containsKey("geoLat")) {
          float geoLat = obj["geoLat"].as<float>();
          if(geoLat < -90.0f || geoLat > 90.0f) {
            server.send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"GEO_LAT_INVALID\",\"desc\":\"Latitude must be between -90 and 90.\"}");
            return;
          }
        }
        if(obj.containsKey("geoLon")) {
          float geoLon = obj["geoLon"].as<float>();
          if(geoLon < -180.0f || geoLon > 180.0f) {
            server.send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"GEO_LON_INVALID\",\"desc\":\"Longitude must be between -180 and 180.\"}");
            return;
          }
        }
        if (obj.containsKey("hostname") || obj.containsKey("ssdpBroadcast") || obj.containsKey("checkForUpdate") || obj.containsKey("enableDebugLogs")
            || obj.containsKey("ledPin") || obj.containsKey("ledActiveLow") || obj.containsKey("ledRfBlink")
            || obj.containsKey("geoLat") || obj.containsKey("geoLon")) {
          bool checkForUpdate = settings.checkForUpdate;
          settings.fromJSON(obj);
          settings.save();
          if(settings.checkForUpdate != checkForUpdate) git.emitUpdateCheck();
          if(obj.containsKey("hostname")) net.updateHostname();
          // Applique le nouveau câblage sans redémarrage, en relâchant proprement l'ancienne broche.
          if(obj.containsKey("ledPin") || obj.containsKey("ledActiveLow")) statusLed.reconfigure();
        }
        if (obj.containsKey("ntpServer") || obj.containsKey("ntpServer")) {
          settings.NTP.fromJSON(obj);
          settings.NTP.save();
        }
        server.send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully set General Settings\"}");
      }
      else {
        server.send(201, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleSetNetwork(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (err) {
      Serial.print("Error parsing JSON ");
      Serial.println(err.c_str());
      String msg = err.c_str();
      server.send(400, _encoding_html, "Error parsing JSON body<br>" + msg);
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      HTTPMethod method = server.method();
      if (method == HTTP_POST || method == HTTP_PUT) {
        // Parse out all the inputs.
        bool reboot = false;
        if(obj.containsKey("connType") && obj["connType"].as<uint8_t>() != static_cast<uint8_t>(settings.connType)) {
          settings.connType = static_cast<conn_types_t>(obj["connType"].as<uint8_t>());
          settings.save();
          reboot = true;
        }
        if(obj.containsKey("wifi")) {
          JsonObject objWifi = obj["wifi"];
          if(settings.connType == conn_types_t::wifi) {
            if(objWifi.containsKey("ssid") && objWifi["ssid"].as<String>().compareTo(settings.WIFI.ssid) != 0) {
              if(WiFi.softAPgetStationNum() == 0) reboot = true;
            }
            if(objWifi.containsKey("passphrase") && objWifi["passphrase"].as<String>().compareTo(settings.WIFI.passphrase) != 0) {
              if(WiFi.softAPgetStationNum() == 0) reboot = true;
            }
          }
          settings.WIFI.fromJSON(objWifi);
          settings.WIFI.save();
        }
        if(obj.containsKey("ethernet"))
        {
          JsonObject objEth = obj["ethernet"];
          // This is an ethernet connection so if anything changes we need to reboot.
          if(settings.connType == conn_types_t::ethernet || settings.connType == conn_types_t::ethernetpref)
            reboot = true;
          settings.Ethernet.fromJSON(objEth);
          settings.Ethernet.save();
        }
        if (reboot) {
          DBG_PRINTLN("Rebooting ESP for new Network settings...");
          rebootDelay.rebootTime = millis() + 1000;
          rebootDelay.reboot = true;
        }
        server.send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully set Network Settings\"}");
      }
      else {
        server.send(201, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleSetIP(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    DBG_PRINTLN("Setting IP...");
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (err) {
      webServer.handleDeserializationError(server, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      HTTPMethod method = server.method();
      if (method == HTTP_POST || method == HTTP_PUT) {
        settings.IP.fromJSON(obj);
        settings.IP.save();
        server.send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully set Network Settings\"}");
      }
      else {
        server.send(201, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleConnectWifi(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    DBG_PRINTLN("Settings WIFI connection...");
    DynamicJsonDocument doc(512);
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (err) {
      webServer.handleDeserializationError(server, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      HTTPMethod method = server.method();
      //Serial.print(F("HTTP Method: "));
      //Serial.println(server.method());
      if (method == HTTP_POST || method == HTTP_PUT) {
        String ssid = "";
        String passphrase = "";
        if (obj.containsKey("ssid")) ssid = obj["ssid"].as<String>();
        if (obj.containsKey("passphrase")) passphrase = obj["passphrase"].as<String>();
        bool reboot;
        if (ssid.compareTo(settings.WIFI.ssid) != 0) reboot = true;
        if (passphrase.compareTo(settings.WIFI.passphrase) != 0) reboot = true;
        if (!settings.WIFI.ssidExists(ssid.c_str()) && ssid.length() > 0) {
          server.send(400, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"WiFi Network Does not exist\"}");
        }
        else {
          SETCHARPROP(settings.WIFI.ssid, ssid.c_str(), sizeof(settings.WIFI.ssid));
          SETCHARPROP(settings.WIFI.passphrase, passphrase.c_str(), sizeof(settings.WIFI.passphrase));
          settings.WIFI.save();
          settings.WIFI.print();
          server.send(201, _encoding_json, "{\"status\":\"OK\",\"desc\":\"Successfully set server connection\"}");
          if (reboot) {
            DBG_PRINTLN("Rebooting ESP for new WiFi settings...");
            rebootDelay.rebootTime = millis() + 1000;
            rebootDelay.reboot = true;
          }
        }
      }
      else {
        server.send(201, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleModuleSettings(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, false)) return;
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginObject();
    resp.addElem("fwVersion", settings.fwVersion.name);
    settings.toJSON(resp);
    settings.NTP.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleNetworkSettings(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginObject();
    settings.toJSON(resp);
    resp.addElem("fwVersion", settings.fwVersion.name);
    resp.beginObject("ethernet");
    settings.Ethernet.toJSON(resp);
    resp.endObject();
    resp.beginObject("wifi");
    settings.WIFI.toJSON(resp);
    resp.endObject();
    resp.beginObject("ip");
    settings.IP.toJSON(resp);
    resp.endObject();
    resp.endObject();
    resp.endResponse();
  }

  static void handleConnectMqtt(WebServer &server) {
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (err) {
      webServer.handleDeserializationError(server, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      HTTPMethod method = server.method();
      DBG_PRINT("Saving MQTT ");
      DBG_PRINT(F("HTTP Method: "));
      DBG_PRINTLN(server.method());
      if (method == HTTP_POST || method == HTTP_PUT) {
        mqtt.disconnect();
        settings.MQTT.fromJSON(obj);
        settings.MQTT.save();
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        settings.MQTT.toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
      else {
        server.send(201, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleMqttSettings(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginObject();
    settings.MQTT.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  void registerRoutes(WebServer &server) {
    server.on("/scanaps", [&server]() { handleScanAps(server); });
    server.on("/setgeneral", [&server]() { handleSetGeneral(server); });
    server.on("/setNetwork", [&server]() { handleSetNetwork(server); });
    server.on("/setIP", [&server]() { handleSetIP(server); });
    server.on("/connectwifi", [&server]() { handleConnectWifi(server); });
    server.on("/modulesettings", [&server]() { handleModuleSettings(server); });
    server.on("/networksettings", [&server]() { handleNetworkSettings(server); });
    server.on("/connectmqtt", [&server]() { handleConnectMqtt(server); });
    server.on("/mqttsettings", [&server]() { handleMqttSettings(server); });
  }

  // --- Surcharges ESPAsyncWebServer (étape 5 migration, non câblées pour l'instant) ---

  // WiFi.scanNetworks(false, ...) (version WebServer&) est BLOQUANT (2-6s) -- dangereux sous
  // ESPAsyncWebServer, où ce handler s'exécute sur la tâche async_tcp et gèlerait tous les autres
  // clients HTTP/WebSocket pendant le scan. L'API WiFi d'Arduino-ESP32 supporte nativement un mode
  // non bloquant (scanNetworks(true, ...) + scanComplete() pour récupérer le résultat plus tard) --
  // pas besoin ici du patron trigger+git.loop() utilisé pour les appels HTTPS/TLS (/getReleases) :
  // le pilote WiFi gère lui-même l'asynchronisme. Le frontend doit re-solliciter /scanaps jusqu'à
  // obtenir un statut différent de "scanning", à l'identique du patron déjà établi pour /getReleases.
  static void handleScanAps(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;

    int16_t n = WiFi.scanComplete();
    if(n == WIFI_SCAN_RUNNING) {
      request->send(202, _encoding_json, "{\"status\":\"scanning\"}");
      return;
    }
    if(n == WIFI_SCAN_FAILED) {
      // Jamais scanné, ou résultat précédent déjà consommé (cf. scanDelete() en fin de fonction) :
      // démarre un nouveau scan en tâche de fond et répond immédiatement.
      if(net.softAPOpened) WiFi.disconnect(false);
      WiFi.scanNetworks(true, true);
      request->send(202, _encoding_json, "{\"status\":\"scanning\"}");
      return;
    }

    DBG_PRINT("Scanned ");
    DBG_PRINT(n);
    DBG_PRINTLN(" networks");
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.beginObject("connected");
    resp.addElem("name", settings.WIFI.ssid);
    resp.addElem("passphrase", settings.WIFI.passphrase);
    resp.addElem("strength", (int32_t)WiFi.RSSI());
    resp.addElem("channel", (int32_t)WiFi.channel());
    resp.endObject();
    resp.beginArray("accessPoints");
    for(int i = 0; i < n; ++i) {
      if(WiFi.SSID(i).length() == 0 || WiFi.RSSI(i) < -95) continue; // Ignore hidden and weak networks that we cannot connect to anyway.
      resp.beginObject();
      resp.addElem("name", WiFi.SSID(i).c_str());
      resp.addElem("channel", (int32_t)WiFi.channel(i));
      resp.addElem("strength", (int32_t)WiFi.RSSI(i));
      resp.addElem("macAddress", WiFi.BSSIDstr(i).c_str());
      resp.endObject();
    }
    resp.endArray();
    resp.endObject();
    resp.endResponse();
    // Libère les résultats : un prochain appel à /scanaps déclenchera un scan frais plutôt que de
    // resservir indéfiniment ce même résultat (comportement équivalent à l'ancienne version
    // WebServer&, qui refaisait un scan bloquant complet à chaque appel).
    WiFi.scanDelete();
  }

  static void handleSetGeneral(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(512);

    if(settings.enableDebugLogs) {
      Serial.print("Plain: ");
      Serial.print(request->method());
      Serial.println(request->arg("body"));
    }
    DeserializationError err = deserializeJson(doc, request->arg("body"));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      WebRequestMethodComposite method = request->method();
      if (method == HTTP_POST || method == HTTP_PUT) {
        if(obj.containsKey("ledPin")) {
          int ledPin = obj["ledPin"].as<int>();
          #if LED_PROFILE_FIXED
          request->send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"LED_PIN_FIXED\",\"desc\":\"The status LED is wired in hardware on this device.\"}");
          return;
          #else
          if(ledPin < -1 || ledPin > 48) {
            request->send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"LED_PIN_INVALID\",\"desc\":\"Invalid GPIO number for the status LED.\"}");
            return;
          }
          const char *owner = nullptr;
          if(somfyPinInUse((int8_t)ledPin, &owner)) {
            String msg = "{\"status\":\"ERROR\",\"code\":\"LED_PIN_IN_USE\",\"pin\":";
            msg += ledPin;
            msg += ",\"owner\":\"";
            msg += owner ? owner : "";
            msg += "\",\"desc\":\"GPIO already assigned.\"}";
            request->send(400, "application/json", msg);
            return;
          }
          #endif
        }
        if(obj.containsKey("geoLat")) {
          float geoLat = obj["geoLat"].as<float>();
          if(geoLat < -90.0f || geoLat > 90.0f) {
            request->send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"GEO_LAT_INVALID\",\"desc\":\"Latitude must be between -90 and 90.\"}");
            return;
          }
        }
        if(obj.containsKey("geoLon")) {
          float geoLon = obj["geoLon"].as<float>();
          if(geoLon < -180.0f || geoLon > 180.0f) {
            request->send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"GEO_LON_INVALID\",\"desc\":\"Longitude must be between -180 and 180.\"}");
            return;
          }
        }
        if (obj.containsKey("hostname") || obj.containsKey("ssdpBroadcast") || obj.containsKey("checkForUpdate") || obj.containsKey("enableDebugLogs")
            || obj.containsKey("ledPin") || obj.containsKey("ledActiveLow") || obj.containsKey("ledRfBlink")
            || obj.containsKey("geoLat") || obj.containsKey("geoLon")) {
          bool checkForUpdate = settings.checkForUpdate;
          settings.fromJSON(obj);
          settings.save();
          if(settings.checkForUpdate != checkForUpdate) git.emitUpdateCheck();
          if(obj.containsKey("hostname")) net.updateHostname();
          if(obj.containsKey("ledPin") || obj.containsKey("ledActiveLow")) statusLed.reconfigure();
        }
        if (obj.containsKey("ntpServer") || obj.containsKey("ntpServer")) {
          settings.NTP.fromJSON(obj);
          settings.NTP.save();
        }
        request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully set General Settings\"}");
      }
      else {
        request->send(201, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleSetNetwork(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, request->arg("body"));
    if (err) {
      Serial.print("Error parsing JSON ");
      Serial.println(err.c_str());
      String msg = err.c_str();
      request->send(400, _encoding_html, ("Error parsing JSON body<br>" + msg).c_str());
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      WebRequestMethodComposite method = request->method();
      if (method == HTTP_POST || method == HTTP_PUT) {
        bool reboot = false;
        if(obj.containsKey("connType") && obj["connType"].as<uint8_t>() != static_cast<uint8_t>(settings.connType)) {
          settings.connType = static_cast<conn_types_t>(obj["connType"].as<uint8_t>());
          settings.save();
          reboot = true;
        }
        if(obj.containsKey("wifi")) {
          JsonObject objWifi = obj["wifi"];
          if(settings.connType == conn_types_t::wifi) {
            if(objWifi.containsKey("ssid") && objWifi["ssid"].as<String>().compareTo(settings.WIFI.ssid) != 0) {
              if(WiFi.softAPgetStationNum() == 0) reboot = true;
            }
            if(objWifi.containsKey("passphrase") && objWifi["passphrase"].as<String>().compareTo(settings.WIFI.passphrase) != 0) {
              if(WiFi.softAPgetStationNum() == 0) reboot = true;
            }
          }
          settings.WIFI.fromJSON(objWifi);
          settings.WIFI.save();
        }
        if(obj.containsKey("ethernet"))
        {
          JsonObject objEth = obj["ethernet"];
          if(settings.connType == conn_types_t::ethernet || settings.connType == conn_types_t::ethernetpref)
            reboot = true;
          settings.Ethernet.fromJSON(objEth);
          settings.Ethernet.save();
        }
        if (reboot) {
          DBG_PRINTLN("Rebooting ESP for new Network settings...");
          rebootDelay.rebootTime = millis() + 1000;
          rebootDelay.reboot = true;
        }
        request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully set Network Settings\"}");
      }
      else {
        request->send(201, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleSetIP(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DBG_PRINTLN("Setting IP...");
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, request->arg("body"));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      WebRequestMethodComposite method = request->method();
      if (method == HTTP_POST || method == HTTP_PUT) {
        settings.IP.fromJSON(obj);
        settings.IP.save();
        request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully set Network Settings\"}");
      }
      else {
        request->send(201, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleConnectWifi(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DBG_PRINTLN("Settings WIFI connection...");
    DynamicJsonDocument doc(512);
    DeserializationError err = deserializeJson(doc, request->arg("body"));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      WebRequestMethodComposite method = request->method();
      if (method == HTTP_POST || method == HTTP_PUT) {
        String ssid = "";
        String passphrase = "";
        if (obj.containsKey("ssid")) ssid = obj["ssid"].as<String>();
        if (obj.containsKey("passphrase")) passphrase = obj["passphrase"].as<String>();
        // Corrigé par rapport à la version WebServer& d'origine : "bool reboot;" y était déclarée
        // sans initialisation -- si ni le ssid ni la passphrase ne changeaient, la variable restait
        // lue non initialisée (comportement indéterminé) dans le "if(reboot)" plus bas.
        bool reboot = false;
        if (ssid.compareTo(settings.WIFI.ssid) != 0) reboot = true;
        if (passphrase.compareTo(settings.WIFI.passphrase) != 0) reboot = true;
        if (!settings.WIFI.ssidExists(ssid.c_str()) && ssid.length() > 0) {
          request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"WiFi Network Does not exist\"}");
        }
        else {
          SETCHARPROP(settings.WIFI.ssid, ssid.c_str(), sizeof(settings.WIFI.ssid));
          SETCHARPROP(settings.WIFI.passphrase, passphrase.c_str(), sizeof(settings.WIFI.passphrase));
          settings.WIFI.save();
          settings.WIFI.print();
          request->send(201, _encoding_json, "{\"status\":\"OK\",\"desc\":\"Successfully set server connection\"}");
          if (reboot) {
            DBG_PRINTLN("Rebooting ESP for new WiFi settings...");
            rebootDelay.rebootTime = millis() + 1000;
            rebootDelay.reboot = true;
          }
        }
      }
      else {
        request->send(201, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleModuleSettings(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.addElem("fwVersion", settings.fwVersion.name);
    settings.toJSON(resp);
    settings.NTP.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleNetworkSettings(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    settings.toJSON(resp);
    resp.addElem("fwVersion", settings.fwVersion.name);
    resp.beginObject("ethernet");
    settings.Ethernet.toJSON(resp);
    resp.endObject();
    resp.beginObject("wifi");
    settings.WIFI.toJSON(resp);
    resp.endObject();
    resp.beginObject("ip");
    settings.IP.toJSON(resp);
    resp.endObject();
    resp.endObject();
    resp.endResponse();
  }

  static void handleConnectMqtt(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, request->arg("body"));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      WebRequestMethodComposite method = request->method();
      DBG_PRINT("Saving MQTT ");
      DBG_PRINT(F("HTTP Method: "));
      DBG_PRINTLN(request->method());
      if (method == HTTP_POST || method == HTTP_PUT) {
        mqtt.disconnect();
        settings.MQTT.fromJSON(obj);
        settings.MQTT.save();
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        settings.MQTT.toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
      else {
        request->send(201, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleMqttSettings(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    settings.MQTT.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/scanaps", HTTP_ANY, [](AsyncWebServerRequest *request) { handleScanAps(request); });
    server.on("/setgeneral", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSetGeneral(request); });
    server.on("/setNetwork", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSetNetwork(request); });
    server.on("/setIP", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSetIP(request); });
    server.on("/connectwifi", HTTP_ANY, [](AsyncWebServerRequest *request) { handleConnectWifi(request); });
    server.on("/modulesettings", HTTP_ANY, [](AsyncWebServerRequest *request) { handleModuleSettings(request); });
    server.on("/networksettings", HTTP_ANY, [](AsyncWebServerRequest *request) { handleNetworkSettings(request); });
    server.on("/connectmqtt", HTTP_ANY, [](AsyncWebServerRequest *request) { handleConnectMqtt(request); });
    server.on("/mqttsettings", HTTP_ANY, [](AsyncWebServerRequest *request) { handleMqttSettings(request); });
  }
}
