#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include "ConfigSettings.h"
#include "Somfy.h"
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
  void handleLogin(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    StaticJsonDocument<256> doc;
    JsonObject obj = doc.to<JsonObject>();
    char token[65];
    memset(&token, 0x00, sizeof(token));
    webServer.createAPIToken(server.client().remoteIP(), token);
    obj["type"] = static_cast<uint8_t>(settings.Security.type);
    if(settings.Security.type == security_types::None) {
      obj["apiKey"] = token;
      obj["msg"] = "Success";
      obj["success"] = true;
      serializeJson(doc, g_content);
      server.send(200, _encoding_json, g_content);
      return;
    }
    DBG_PRINTLN("Web logging in...");
    char username[33] = "";
    char password[33] = "";
    char pin[5] = "";
    memset(username, 0x00, sizeof(username));
    memset(password, 0x00, sizeof(password));
    memset(pin, 0x00, sizeof(pin));
    if(server.hasArg("plain")) {
      DynamicJsonDocument docin(512);
      DeserializationError err = deserializeJson(docin, server.arg("plain"));
      if (err) {
        webServer.handleDeserializationError(server, err);
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
      if(server.hasArg("username")) strlcpy(username, server.arg("username").c_str(), sizeof(username));
      if(server.hasArg("password")) strlcpy(password, server.arg("password").c_str(), sizeof(password));
      if(server.hasArg("pin")) strlcpy(pin, server.arg("pin").c_str(), sizeof(pin));
    }
    // Anti brute-force : verrouillage actif, on refuse sans même comparer les identifiants.
    if((int32_t)(g_loginLockUntil - millis()) > 0) {
      uint32_t retryAfter = (uint32_t)((g_loginLockUntil - millis() + 999) / 1000);
      obj["success"] = false;
      obj["msg"] = "Too many attempts. Please wait.";
      obj["retryAfter"] = retryAfter;
      serializeJson(doc, g_content);
      server.send(429, _encoding_json, g_content);
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
        server.send(429, _encoding_json, g_content);
        return;
      }
      // Encore dans le quota d'essais libres : on indique où on en est pour l'UI.
      obj["attempt"] = g_loginFailCount;
      obj["maxAttempts"] = LOGIN_FREE_ATTEMPTS;
    }
    serializeJson(doc, g_content);
    server.send(200, _encoding_json, g_content);
    return;
  }

  static void handleLoginContext(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginObject();
    resp.addElem("type", static_cast<uint8_t>(settings.Security.type));
    resp.addElem("permissions", settings.Security.permissions);
    resp.addElem("serverId", settings.serverId);
    resp.addElem("version", settings.fwVersion.name);
    resp.addElem("model", "ESPSomfyRTS");
    resp.addElem("hostname", settings.hostname);
    // Code langue actif -- exposé dès le tout premier chargement (avant même l'authentification)
    // pour permettre la détection de langue navigateur côté frontend (Phase 3 i18n).
    resp.addElem("language", settings.language);
    // Langue embarquée d'usine pour cet environnement de build (fr sur BOX, en sinon) -- le
    // frontend doit s'y référer plutôt que de coder "en" en dur pour savoir quelle langue du
    // catalogue est protégée contre la suppression (cf. WebI18n::handleDeleteLang côté serveur).
    resp.addElem("defaultLang", DEFAULT_EMBEDDED_LANG);
    // Langue en attente (mode AP, cf. /setPendingLang et GitUpdater::checkPendingLang()) -- chaîne
    // vide si aucune. Permet au frontend d'afficher l'état "en attente" du catalogue après un
    // rechargement de page, sans dépendre uniquement de l'état en mémoire du navigateur.
    resp.addElem("pendingLang", settings.pendingLang);
    // Assistant de premier démarrage (cf. /setOnboardingDone) -- le frontend décide de l'afficher
    // uniquement en mode AP et tant que celui-ci n'est pas terminé/ignoré.
    resp.addElem("onboardingDone", settings.onboardingDone);
    // Exposé dès ce tout premier appel (avant même l'ouverture du Wizard) pour que l'étape Réseau
    // sache immédiatement si la bascule Ethernet a un sens sur ce matériel, sans dépendre d'un
    // second aller-retour vers /modulesettings une fois le Wizard déjà affiché -- ce délai
    // provoquait une réapparition tardive de la ligne Ethernet et donc un changement de hauteur
    // de la carte quelques secondes après le premier affichage.
    resp.addElem("hardwareProfile", settings.hardwareProfile);
    // Exposé ici pour la même raison que hardwareProfile : les modales Volet/Groupe masquent
    // l'option de retour lumineux quand aucune LED n'est câblée, et elles peuvent s'ouvrir bien
    // avant que le panneau Système n'ait chargé /modulesettings.
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
    uint32_t netUptime = 0;
    if(net.connectedAt > 0) {
      netUptime = (millis() - net.connectedAt) / 1000;
    }
    resp.addElem("netUptime", netUptime);
    resp.addElem("cpuFreq", ESP.getCpuFreqMHz());
    resp.addElem("cores", ESP.getChipCores());
    resp.addElem("flashSize", (uint32_t)(ESP.getFlashChipSize() / 1024 / 1024));
    size_t total = LittleFS.totalBytes();
    size_t used = LittleFS.usedBytes();
    resp.addElem("fsTotal", (uint32_t)(total / 1024)); // En Ko
    resp.addElem("fsUsed", (uint32_t)(used / 1024));   // En Ko
    resp.addElem("flashSpeed", (uint32_t)(ESP.getFlashChipSpeed() / 1000000)); // En MHz
    resp.endObject();
    resp.endResponse();
  }

  static void handleSaveSecurity(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) return server.send(200);
    if(!webServer.isAuthenticated(server, true)) return;

    StaticJsonDocument<768> doc; // Un seul doc suffit pour l'entrée et la sortie
    if (deserializeJson(doc, server.arg("plain"))) return server.send(400, "text/plain", F("J-Err"));

    if (server.method() == HTTP_POST || server.method() == HTTP_PUT) {
      JsonObject obj = doc.as<JsonObject>();
      settings.Security.fromJSON(obj);
      settings.Security.save();

      doc.clear();
      obj = doc.to<JsonObject>();

      char token[65];
      webServer.createAPIToken(server.client().remoteIP(), token);
      settings.Security.toJSON(obj);
      obj["apiKey"] = token;

      serializeJson(doc, g_content);
      server.send(200, _encoding_json, g_content);
    } else {
      server.send(405, _encoding_json, F("{\"s\":\"ERR\"}"));
    }
  }

  static void handleGetSecurity(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    DynamicJsonDocument doc(192);
    JsonObject obj = doc.to<JsonObject>();
    settings.Security.toJSON(obj);
    serializeJson(doc, g_content);
    server.send(200, _encoding_json, g_content);
  }

  void registerRoutes(WebServer &server) {
    server.on("/login", [&server]() { handleLogin(server); });
    server.on("/loginContext", [&server]() { handleLoginContext(server); });
    server.on("/saveSecurity", [&server]() { handleSaveSecurity(server); });
    server.on("/getSecurity", [&server]() { handleGetSecurity(server); });
  }
}
