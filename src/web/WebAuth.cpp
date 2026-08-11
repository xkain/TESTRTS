#include <WiFi.h>
#include <LittleFS.h>
#include "ConfigSettings.h"
#include "somfy/Somfy.h"
#include "WResp.h"
#include "Web.h"
#include "Network.h"
#include "Recovery.h"    // LED_PROFILE_FIXED
#include "WebCommon.h"
#include "WebAuth.h"

extern ConfigSettings settings;
extern Web webServer;
extern Network net;

// Anti brute-force sur /login : 3 essais libres, puis verrouillage fixe de 180s par échec supplémentaire.
#define LOGIN_FREE_ATTEMPTS 3
#define LOGIN_LOCKOUT_SECONDS 180
static uint16_t g_loginFailCount = 0;
static unsigned long g_loginLockUntil = 0;

namespace WebAuth {
  void handleLogin(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    StaticJsonDocument<256> doc;
    JsonObject obj = doc.to<JsonObject>();
    char token[65];
    memset(&token, 0x00, sizeof(token));
    webServer.createAPIToken(request->client()->remoteIP(), token);
    obj["type"] = static_cast<uint8_t>(settings.Security.type);
    if(settings.Security.type == security_types::None) {
      obj["apiKey"] = token;
      obj["msg"] = "Success";
      obj["success"] = true;
      serializeJson(doc, g_content);
      request->send(200, _encoding_json, g_content);
      return;
    }
    DBG_PRINTLN("Web logging in...");
    char username[33] = "";
    char password[33] = "";
    char pin[5] = "";
    memset(username, 0x00, sizeof(username));
    memset(password, 0x00, sizeof(password));
    memset(pin, 0x00, sizeof(pin));
    // asyncHasBody()/asyncGetBody() (WebCommon.h), pas request->hasArg("body") directement : un
    // corps JSON n'est PAS auto-capturé par ESPAsyncWebServer (seuls x-www-form-urlencoded et
    // text/plain "clef=valeur" le sont) -- il faut un callback onBody explicite, enregistré sur la
    // route /login (cf. registerRoutes(AsyncWebServer&) ci-dessous). Différence d'API silencieuse
    // avec WebServer (qui expose "plain" pour tout corps brut, quel que soit le Content-Type) à ne
    // pas reproduire par erreur ailleurs lors de la suite de la migration.
    if(asyncHasBody(request)) {
      DynamicJsonDocument docin(512);
      DeserializationError err = deserializeJson(docin, asyncGetBody(request));
      if (err) {
        webServer.handleDeserializationError(request, err);
        return;
      }
      else {
          JsonObject objin = docin.as<JsonObject>();
          if(objin.containsKey("username") && objin["username"]) strlcpy(username, objin["username"], sizeof(username));
          if(objin.containsKey("password") && objin["password"]) strlcpy(password, objin["password"], sizeof(password));
          if(objin.containsKey("pin") && objin["pin"]) strlcpy(pin, objin["pin"], sizeof(pin));
      }
    }
    else {
      if(request->hasArg("username")) strlcpy(username, request->arg("username").c_str(), sizeof(username));
      if(request->hasArg("password")) strlcpy(password, request->arg("password").c_str(), sizeof(password));
      if(request->hasArg("pin")) strlcpy(pin, request->arg("pin").c_str(), sizeof(pin));
    }
    // Anti brute-force : verrouillage actif, on refuse sans même comparer les identifiants.
    if((int32_t)(g_loginLockUntil - millis()) > 0) {
      uint32_t retryAfter = (uint32_t)((g_loginLockUntil - millis() + 999) / 1000);
      obj["success"] = false;
      obj["msg"] = "Too many attempts. Please wait.";
      obj["retryAfter"] = retryAfter;
      serializeJson(doc, g_content);
      request->send(429, _encoding_json, g_content);
      return;
    }
    // At this point we should have all the data we need to login.
    if(settings.Security.type == security_types::PinEntry) {
      DBG_PRINTLN("Validating pin");
      if(strlen(pin) == 0 || strcmp(pin, settings.Security.pin) != 0) {
        obj["success"] = false;
        obj["msg"] = "Invalid Pin Entry";
      }
      else {
        obj["success"] = true;
        obj["msg"] = "Login successful";
        obj["apiKey"] = token;
      }
    }
    else if(settings.Security.type == security_types::Password) {
      if(strlen(username) == 0 || strlen(password) == 0 || strcmp(username, settings.Security.username) != 0 || strcmp(password, settings.Security.password) != 0) {
        obj["success"] = false;
        obj["msg"] = "Invalid username or password";
      }
      else {
        obj["success"] = true;
        obj["msg"] = "Login successful";
        obj["apiKey"] = token;
      }
    }
    if(obj["success"] == true) {
      g_loginFailCount = 0;
      g_loginLockUntil = 0;
    }
    else {
      if(g_loginFailCount < 1000) g_loginFailCount++;
      if(g_loginFailCount > LOGIN_FREE_ATTEMPTS) {
        // 4e échec (ou plus) : verrouillage fixe.
        g_loginLockUntil = millis() + (LOGIN_LOCKOUT_SECONDS * 1000UL);
        obj["retryAfter"] = LOGIN_LOCKOUT_SECONDS;
        serializeJson(doc, g_content);
        request->send(429, _encoding_json, g_content);
        return;
      }
      // Encore dans le quota d'essais libres : on indique où on en est pour l'UI.
      obj["attempt"] = g_loginFailCount;
      obj["maxAttempts"] = LOGIN_FREE_ATTEMPTS;
    }
    serializeJson(doc, g_content);
    request->send(200, _encoding_json, g_content);
    return;
  }

  static void handleLoginContext(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.addElem("type", static_cast<uint8_t>(settings.Security.type));
    resp.addElem("permissions", settings.Security.permissions);
    resp.addElem("serverId", settings.serverId);
    resp.addElem("version", settings.fwVersion.name);
    resp.addElem("model", "ESPSomfyRTS");
    resp.addElem("hostname", settings.hostname);
    resp.addElem("language", settings.language);
    resp.addElem("defaultLang", DEFAULT_EMBEDDED_LANG);
    resp.addElem("pendingLang", settings.pendingLang);
    resp.addElem("onboardingDone", settings.onboardingDone);
    resp.addElem("hardwareProfile", settings.hardwareProfile);
    #if LED_PROFILE_FIXED
    resp.addElem("ledPin", (int8_t)LED_PROFILE_PIN);
    #else
    resp.addElem("ledPin", settings.ledPin);
    #endif
    if (net.connType == conn_types_t::ethernet) {
      resp.addElem("mac", ETH.macAddress().c_str());
    } else {
      resp.addElem("mac", WiFi.macAddress().c_str());
    }
    resp.addElem("uptime", (uint32_t)(millis() / 1000));
    // Compteur de session réseau : reflète l'interface RÉELLEMENT active (net.softAPOpened /
    // net.connType), pas la configuration statique -- reste donc correct pendant un repli AP
    // temporaire même si settings.connType pointe vers Wi-Fi/Ethernet. net.apOpenedAt est distinct
    // de net.connectedAt car l'AP ne passe jamais par Network::setConnected().
    uint32_t netUptime = 0;
    const char *netMode = "wifi";
    if(net.softAPOpened && net.apOpenedAt > 0) {
      netUptime = (millis() - net.apOpenedAt) / 1000;
      netMode = "ap";
    } else if(net.connectedAt > 0) {
      netUptime = (millis() - net.connectedAt) / 1000;
      netMode = (net.connType == conn_types_t::ethernet) ? "eth" : "wifi";
    }
    resp.addElem("netUptime", netUptime);
    resp.addElem("netMode", netMode);
    resp.addElem("cpuFreq", ESP.getCpuFreqMHz());
    resp.addElem("cores", ESP.getChipCores());
    resp.addElem("flashSize", (uint32_t)(ESP.getFlashChipSize() / 1024 / 1024));
    size_t total = LittleFS.totalBytes();
    size_t used = LittleFS.usedBytes();
    resp.addElem("fsTotal", (uint32_t)(total / 1024));
    resp.addElem("fsUsed", (uint32_t)(used / 1024));
    resp.addElem("flashSpeed", (uint32_t)(ESP.getFlashChipSpeed() / 1000000));
    resp.endObject();
    resp.endResponse();
  }

  static void handleSaveSecurity(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200); return; }
    if(!webServer.isAuthenticated(request, true)) return;

    StaticJsonDocument<768> doc;
    if (deserializeJson(doc, asyncGetBody(request))) { request->send(400, "text/plain", "J-Err"); return; }

    if (request->method() == AsyncHttp::POST || request->method() == AsyncHttp::PUT) {
      JsonObject obj = doc.as<JsonObject>();
      settings.Security.fromJSON(obj);
      settings.Security.save();

      doc.clear();
      obj = doc.to<JsonObject>();

      char token[65];
      webServer.createAPIToken(request->client()->remoteIP(), token);
      settings.Security.toJSON(obj);
      obj["apiKey"] = token;

      serializeJson(doc, g_content);
      request->send(200, _encoding_json, g_content);
    } else {
      request->send(405, _encoding_json, "{\"s\":\"ERR\"}");
    }
  }

  static void handleGetSecurity(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(192);
    JsonObject obj = doc.to<JsonObject>();
    settings.Security.toJSON(obj);
    serializeJson(doc, g_content);
    request->send(200, _encoding_json, g_content);
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/login", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleLogin(request); }, nullptr, asyncBodyHandler);
    server.on("/loginContext", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleLoginContext(request); });
    server.on("/saveSecurity", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSaveSecurity(request); }, nullptr, asyncBodyHandler);
    server.on("/getSecurity", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetSecurity(request); });
  }
}
