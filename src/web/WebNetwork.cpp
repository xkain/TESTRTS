#include <WiFi.h>
#include <esp_task_wdt.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "ConfigSettings.h"
#include "Utils.h"
#include "somfy/Somfy.h"
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
  // Scan bloquant (WiFi.scanNetworks(false, ...), 2-6s) directement dans le handler, comme
  // /getReleases pour GitHub (WebSystem.cpp) et comme l'ancienne version WebServer : un seul
  // appel HTTP, réponse complète immédiate, pas de statut "scanning" à repoller côté JS. Ça bloque
  // la tâche async_tcp (donc les autres clients HTTP/WebSocket) pendant le scan, mais /scanaps
  // n'est déclenché que manuellement (page Wifi), un cas rare qui ne justifie pas la complexité
  // du mode non bloquant (scanNetworks(true, ...) + scanComplete() + polling).
  //
  // g_scanMutex : contrairement à l'ancien WebServer (un seul client traité à la fois via
  // handleClient()), AsyncWebServer peut exécuter ce handler pour plusieurs requêtes se chevauchant
  // dans le temps (deux onglets, un bouton "rafraîchir" cliqué pendant qu'un chargement automatique
  // est déjà en cours, etc.). Sans protection, deux exécutions concurrentes peuvent interférer sur
  // l'état global du pilote WiFi -- ex: l'une itère WiFi.SSID(i)/RSSI(i) sur un résultat de scan
  // pendant que l'autre appelle WiFi.scanDelete() ou WiFi.disconnect(false) sur ce même résultat,
  // ce qui invalide les données lues par la première en plein milieu de sa réponse. Ce mutex
  // sérialise tout le cycle scanNetworks()/lecture résultat/scanDelete() par requête (une requête
  // concurrente attend donc jusqu'à la fin du scan en cours, comme sous l'ancien WebServer).
  static SemaphoreHandle_t g_scanMutex = xSemaphoreCreateMutex();

  static void handleScanAps(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;

    xSemaphoreTake(g_scanMutex, portMAX_DELAY);

    if(net.softAPOpened) WiFi.disconnect(false);
    int16_t n = WiFi.scanNetworks(false, true);

    DBG_PRINT("Scanned ");
    DBG_PRINT(n);
    DBG_PRINTLN(" networks");
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.beginObject("connected");
    resp.addElem("name", settings.WIFI.ssid);
    // JAMAIS la passphrase en clair. Cette route la renvoyait telle quelle, à rebours du masquage
    // appliqué partout ailleurs (WifiSettings::toJSON ne publie que `hasPassphrase`) -- et comme
    // checkAuth() laisse tout passer tant que Security.type vaut None (défaut d'usine), le mot de
    // passe du réseau domestique était lisible par n'importe qui sur le LAN, et par n'importe quel
    // site web sur les builds qui activaient ENABLE_DEV_CORS. Aucun consommateur côté client : le
    // formulaire Wi-Fi repart de ses propres champs de saisie (cf. 50-wifi.js), jamais de ce champ.
    resp.addElem("hasPassphrase", strlen(settings.WIFI.passphrase) > 0);
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
    // WebServer&, qui refaisait un scan bloquant complet à chaque appel). Toujours sous le mutex :
    // une requête concurrente ne doit pas pouvoir lire ces résultats après leur libération.
    WiFi.scanDelete();
    xSemaphoreGive(g_scanMutex);
    // Relevé de pile async_tcp : ce handler est probablement le chemin le plus profond de toute la
    // tâche (WiFi.scanNetworks() descend dans la pile WiFi depuis async_tcp). Cf.
    // ConfigSettings::reportAsyncTcpStackLow() et le commentaire de CONFIG_ASYNC_TCP_STACK_SIZE
    // dans platformio.ini.
    ConfigSettings::reportAsyncTcpStackLow("/scanaps");
  }

  static void handleSetGeneral(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(512);

    if(settings.enableDebugLogs) {
      Serial.print("Plain: ");
      Serial.print(request->method());
      Serial.println(asyncGetBody(request));
    }
    DeserializationError err = deserializeJson(doc, asyncGetBody(request));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      WebRequestMethodComposite method = request->method();
      if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
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
        if(obj.containsKey("headerMobileDisplay")) {
          uint8_t hmd = obj["headerMobileDisplay"].as<uint8_t>();
          if(hmd > HMD_NONE) {
            request->send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"HEADER_MOBILE_DISPLAY_INVALID\",\"desc\":\"Invalid mobile header display option.\"}");
            return;
          }
        }
        if(obj.containsKey("defaultMobileTab")) {
          String tab = obj["defaultMobileTab"].as<String>();
          if(tab != "groups" && tab != "devices") {
            request->send(400, "application/json", "{\"status\":\"ERROR\",\"code\":\"DEFAULT_MOBILE_TAB_INVALID\",\"desc\":\"Invalid default mobile tab.\"}");
            return;
          }
        }
        if(obj.containsKey("geoLat")) {
          float geoLat = obj["geoLat"].as<float>();
          // 99.0 = sentinelle "position non configurée" (cf. ConfigSettings.h, hasGeoPosition()),
          // volontairement hors de la plage valide -- c'est la valeur envoyée par le bouton
          // "Effacer" (btnGeoClear, cf. index.js) et ne doit pas être rejetée comme une latitude
          // invalide.
          if(geoLat != 99.0f && (geoLat < -90.0f || geoLat > 90.0f)) {
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
        // Cette liste doit couvrir TOUTES les clés que ConfigSettings::fromJSON() sait traiter,
        // sinon un corps ne contenant qu'une clé absente d'ici est ignoré en silence -- avec un
        // 200 « Successfully set General Settings » pour couronner le tout. Comparée au code de
        // fromJSON le 23/08/2026 : `accentColor` et `swShowGpio` y manquaient (même défaut que
        // M-10 juste en dessous). L'interface ne le voyait pas, elle poste le panneau entier donc
        // `hostname` est toujours présent et la condition passe toujours ; seul un client REST
        // ciblé tombait dessus.
        // `connType` et `language`, également lues par fromJSON(), sont VOLONTAIREMENT absentes :
        // elles ont des routes dédiées (/setNetwork, /setLang) qui font davantage que poser le
        // champ -- reconfiguration de l'interface réseau, validation du code langue et purge de
        // pendingLang. Les accepter ici ouvrirait un second chemin incomplet.
        if (obj.containsKey("hostname") || obj.containsKey("ssdpBroadcast") || obj.containsKey("checkForUpdate") || obj.containsKey("enableDebugLogs")
            || obj.containsKey("ledPin") || obj.containsKey("ledActiveLow") || obj.containsKey("ledRfBlink")
            || obj.containsKey("headerMobileDisplay") || obj.containsKey("reverseDashboardColumns")
            || obj.containsKey("defaultMobileTab") || obj.containsKey("showRadioActivity")
            || obj.containsKey("accentColor") || obj.containsKey("swShowGpio")
            || obj.containsKey("geoLat") || obj.containsKey("geoLon")) {
          bool checkForUpdate = settings.checkForUpdate;
          settings.fromJSON(obj);
          settings.save();
          if(settings.checkForUpdate != checkForUpdate) git.emitUpdateCheck();
          if(obj.containsKey("hostname")) net.updateHostname();
          if(obj.containsKey("ledPin") || obj.containsKey("ledActiveLow")) statusLed.reconfigure();
        }
        // M-10 de l'audit, corrigé le 23/08/2026 : la condition testait DEUX FOIS `ntpServer`.
        // Or NTPSettings::fromJSON traite `ntpServer` ET `posixZone` (cf. ConfigSettings.cpp), si
        // bien qu'un corps ne portant que le fuseau horaire n'entrait jamais dans la branche : le
        // changement était perdu, et la route répondait quand même 200. L'interface masquait le
        // défaut en postant toujours les deux champs ensemble (`data-bind="general.posixZone"` et
        // `general.ntpServer` appartiennent au même panneau, cf. index.html).
        if (obj.containsKey("ntpServer") || obj.containsKey("posixZone")) {
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, asyncGetBody(request));
    if (err) {
      Serial.print("Error parsing JSON ");
      Serial.println(err.c_str());
      String msg = err.c_str();
      request->send(400, _encoding_html, ("Error parsing JSON body<br>" + msg).c_str());
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      WebRequestMethodComposite method = request->method();
      if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
        bool reboot = false;
        if(obj.containsKey("connType") && obj["connType"].as<uint8_t>() != static_cast<uint8_t>(settings.connType)) {
          settings.connType = static_cast<conn_types_t>(obj["connType"].as<uint8_t>());
          settings.save();
          reboot = true;
        }
        if(obj.containsKey("wifi")) {
          JsonObject objWifi = obj["wifi"];
          // Refus explicite d'un mot de passe de point d'accès hors bornes WPA2 (8-63).
          // WifiSettings::fromJSON écarte déjà la valeur, mais EN SILENCE : l'appelant recevait
          // un 200 et croyait le changement appliqué alors que l'appareil avait gardé l'ancien
          // mot de passe. L'interface borne déjà sa saisie (cf. Wifi.saveAPPassword), mais elle
          // n'est pas le seul client de cette route -- un script ou une intégration tierce y
          // accède directement. Vide = inchangé, le client ne recevant jamais l'existant.
          if(objWifi.containsKey("apPassword")) {
            size_t apLen = strlen(objWifi["apPassword"] | "");
            if(apLen > 0 && (apLen < 8 || apLen > 63)) {
              request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"code\":\"AP_PASSWORD_INVALID\",\"desc\":\"The access point password must be between 8 and 63 characters.\"}");
              return;
            }
          }
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DBG_PRINTLN("Setting IP...");
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, asyncGetBody(request));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      WebRequestMethodComposite method = request->method();
      if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DBG_PRINTLN("Settings WIFI connection...");
    DynamicJsonDocument doc(512);
    DeserializationError err = deserializeJson(doc, asyncGetBody(request));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonObject obj = doc.as<JsonObject>();
      WebRequestMethodComposite method = request->method();
      if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
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
          // 200, pas 201 : les clients JS génériques (putJSONSync) traitent tout code != 200 comme
          // une erreur (cf. audit croisé JS<->C++) -- un 201 sur ce chemin de succès serait donc
          // confondu avec une erreur, la seule différence visible étant le corps de la réponse.
          request->send(200, _encoding_json, "{\"status\":\"OK\",\"desc\":\"Successfully set server connection\"}");
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
      if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    settings.MQTT.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/scanaps", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleScanAps(request); });
    server.on("/setgeneral", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSetGeneral(request); }, nullptr, asyncBodyHandler);
    server.on("/setNetwork", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSetNetwork(request); }, nullptr, asyncBodyHandler);
    server.on("/setIP", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSetIP(request); }, nullptr, asyncBodyHandler);
    server.on("/connectwifi", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleConnectWifi(request); }, nullptr, asyncBodyHandler);
    server.on("/modulesettings", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleModuleSettings(request); });
    server.on("/networksettings", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleNetworkSettings(request); });
    server.on("/connectmqtt", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleConnectMqtt(request); }, nullptr, asyncBodyHandler);
    server.on("/mqttsettings", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleMqttSettings(request); });
  }
}
