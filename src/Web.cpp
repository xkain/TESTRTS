#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include <esp_random.h>
#include <Preferences.h>
#include "mbedtls/md.h"
#include "ConfigSettings.h"
#include "Utils.h"
#include "Somfy.h"
#include "WResp.h"
#include "Web.h"
#include "GitOTA.h"
#include "WebCommon.h"
#include "WebStatic.h"
#include "WebAuth.h"
#include "WebI18n.h"
#include "WebNetwork.h"
#include "WebSystem.h"
#include "WebShadesRest.h"
#include "WebRadioCommands.h"

extern ConfigSettings settings;
extern Web webServer;
extern GitUpdater git;

char g_content[WEB_MAX_RESPONSE];

// General responses
const char _response_404[] = "404: Service Not Found";

// Encodings
const char _encoding_text[] = "text/plain";
const char _encoding_html[] = "text/html";
const char _encoding_json[] = "application/json";

AsyncWebServer apiServer(8081);
AsyncWebServer server(80);
void Web::startup() {
  Serial.println("Launching web server...");
  this->loadApiSecret();
}
void Web::loop() {
  // No-op depuis la bascule finale ESPAsyncWebServer (étape 5d) : AsyncTCP sert les requêtes de
  // façon événementielle dans sa propre tâche FreeRTOS, sans polling. Fonction conservée (plutôt
  // que supprimée) car GitOTA.cpp l'appelle encore ponctuellement pendant ses boucles de
  // téléchargement bloquantes -- ces appels sont désormais inoffensifs mais inutiles.
}
void Web::sendCORSHeaders(WebServer &server) {
    //server.sendHeader(F("Connection"), F("Keep-Alive"));
    //server.sendHeader(F("Keep-Alive"), F("timeout=5, max=1000"));
    //server.sendHeader(F("Access-Control-Allow-Origin"), F("*"));
    //server.sendHeader(F("Access-Control-Max-Age"), F("600"));
    //server.sendHeader(F("Access-Control-Allow-Methods"), F("PUT,POST,GET,OPTIONS"));
    //server.sendHeader(F("Access-Control-Allow-Headers"), F("*"));
}
void Web::sendCacheHeaders(uint32_t seconds) {
  // No-op depuis la bascule finale ESPAsyncWebServer (étape 5d) : sous Async, l'en-tête
  // Cache-Control est ajouté directement à la réponse de la requête concernée (cf.
  // handleStreamFile(AsyncWebServerRequest*, ...) ci-dessous), il n'existe pas de "réponse globale"
  // en cours à laquelle rattacher un en-tête en dehors d'un contexte de requête comme le faisait
  // WebServer::sendHeader().
}
void Web::end() {
  //server.end();
}
void Web::handleDeserializationError(WebServer &server, DeserializationError &err) {
    switch (err.code()) {
    case DeserializationError::InvalidInput:
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Invalid JSON payload\"}"));
      break;
    case DeserializationError::NoMemory:
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Out of memory parsing JSON\"}"));
      break;
    default:
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"General JSON Deserialization failed\"}"));
      break;
    }
}
bool Web::isAuthenticated(WebServer &server, bool cfg) {
  DBG_PRINTLN("Checking authentication");
  if(settings.Security.type == security_types::None) return true;
  else if(!cfg && (settings.Security.permissions & static_cast<uint8_t>(security_permissions::ConfigOnly)) == 0x01) return true;
  else if(server.hasHeader("apikey")) {
    // Api key was supplied.
    DBG_PRINTLN("Checking API Key...");
    char token[65];
    memset(token, 0x00, sizeof(token));
    this->createAPIToken(server.client().remoteIP(), token);
    // Compare the tokens. Une clé présente mais invalide DOIT répondre comme une clé absente :
    // sans ce send(), la requête restait sans réponse et le client attendait son timeout au lieu
    // de voir un refus explicite (et donc de redemander une authentification).
    if(String(token) != server.header("apikey")) {
      DBG_PRINTLN("Invalid API Key...");
      server.send(401, "Unauthorized API Key");
      return false;
    }
    server.sendHeader("apikey", token);
  }
  else {
    // Send a 401
    DBG_PRINTLN("Not authenticated...");
    server.send(401, "Unauthorized API Key");
    return false;
  }
  return true;
}
bool Web::createAPIPinToken(const IPAddress ipAddress, const char *pin, char *token) {
  return this->createAPIToken((String(pin) + ":" + ipAddress.toString()).c_str(), token);
}
bool Web::createAPIPasswordToken(const IPAddress ipAddress, const char *username, const char *password, char *token) {
  return this->createAPIToken((String(username) + ":" + String(password) + ":" + ipAddress.toString()).c_str(), token);
}
void Web::loadApiSecret() {
  Preferences p;
  p.begin("authkey", false);
  String existing = p.getString("secret", "");
  if(existing.length() == sizeof(this->apiSecret) - 1) {
    strlcpy(this->apiSecret, existing.c_str(), sizeof(this->apiSecret));
  }
  else {
    uint8_t buf[32];
    esp_fill_random(buf, sizeof(buf));
    this->apiSecret[0] = '\0';
    for(uint8_t i = 0; i < sizeof(buf); i++) {
      char str[3];
      sprintf(str, "%02x", (int)buf[i]);
      strcat(this->apiSecret, str);
    }
    p.putString("secret", this->apiSecret);
    Serial.println(F("Generated new API signing secret."));
  }
  p.end();
}
bool Web::createAPIToken(const char *payload, char *token) {
    byte hmacResult[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(md_type), 1);
    mbedtls_md_hmac_starts(&ctx, (const unsigned char *)this->apiSecret, strlen(this->apiSecret));
    mbedtls_md_hmac_update(&ctx, (const unsigned char *)payload, strlen(payload));
    mbedtls_md_hmac_finish(&ctx, hmacResult);
    token[0] = '\0';
    for(int i = 0; i < sizeof(hmacResult); i++){
        char str[3];
        sprintf(str, "%02x", (int)hmacResult[i]);
        strcat(token, str);
    }
    return true;
}
bool Web::createAPIToken(const IPAddress ipAddress, char *token) {
    String payload;
    if(settings.Security.type == security_types::Password) createAPIPasswordToken(ipAddress, settings.Security.username, settings.Security.password, token);
    else if(settings.Security.type == security_types::PinEntry) createAPIPinToken(ipAddress, settings.Security.pin, token);
    else createAPIToken(ipAddress.toString().c_str(), token);
    return true;
}
void Web::handleStreamFile(WebServer &server, const char *filename, const char *encoding) {
  if(git.lockFS) {
    server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}"));
    return;
  }
  webServer.sendCORSHeaders(server);

  if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
  esp_task_wdt_reset();
  // Load the index html page from the data directory.
  // --- LE MOUCHARD DE MÉMOIRE ---
  WiFiClient clientDetect = server.client();
  //Serial.printf("\n[DEBUG] Requête de l'IP: %s | Fichier: %s\n", clientDetect.remoteIP().toString().c_str(), filename);
  //Serial.printf("[DEBUG] RAM Avant: Free:%d | MaxBlock:%d\n", ESP.getFreeHeap(), ESP.getMaxAllocHeap());
  // ------------------------------

  
  DBG_PRINT("Loading file ");
  DBG_PRINTLN(filename);
  File file = LittleFS.open(filename, "r");
  if (!file) {
    DBG_PRINT("Error opening");
    DBG_PRINTLN(filename);
    server.send(500, _encoding_text, "Error opening file");
    return;
  }
  server.setContentLength(file.size());
  
  if (String(filename).endsWith(".gz")) {
      server.sendHeader("Content-Encoding", "gzip");
  }
  server.send(200, encoding, ""); 
  server.client().write(file); 
  
  file.close();
 
  esp_task_wdt_reset();
}
void Web::handleNotFound(WebServer &server) {
  if(server.method() == HTTP_OPTIONS) {
    server.send(200, _encoding_text, F("OK"));
    return;
  }
  DBG_PRINT(F("404: "));
  DBG_PRINTLN(server.uri());

  server.send(404, _encoding_text, F("404: Not Found"));
}

// --- Surcharges ESPAsyncWebServer (étape 3+ migration, cf. Web.h) ---

void Web::handleStreamFile(AsyncWebServerRequest *request, const char *filename, const char *contentType, uint32_t cacheSeconds) {
  if(git.lockFS) {
    request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
    return;
  }
  if(!LittleFS.exists(filename) && !LittleFS.exists(String(filename) + ".gz")) {
    request->send(404, _encoding_text, "404: Not Found");
    return;
  }
  esp_task_wdt_reset();
  AsyncWebServerResponse *response = request->beginResponse(LittleFS, filename, contentType);
  if(cacheSeconds > 0) {
    String cc = "public, max-age=" + String(cacheSeconds) + ", immutable";
    response->addHeader("Cache-Control", cc.c_str());
  }
  request->send(response);
  esp_task_wdt_reset();
}
void Web::handleNotFound(AsyncWebServerRequest *request) {
  if(request->method() == HTTP_OPTIONS) {
    request->send(200, _encoding_text, "OK");
    return;
  }
  DBG_PRINT(F("404: "));
  DBG_PRINTLN(request->url());
  request->send(404, _encoding_text, "404: Not Found");
}
void Web::handleDeserializationError(AsyncWebServerRequest *request, DeserializationError &err) {
    switch (err.code()) {
    case DeserializationError::InvalidInput:
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid JSON payload\"}");
      break;
    case DeserializationError::NoMemory:
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Out of memory parsing JSON\"}");
      break;
    default:
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"General JSON Deserialization failed\"}");
      break;
    }
}
bool Web::isAuthenticated(AsyncWebServerRequest *request, bool cfg) {
  DBG_PRINTLN("Checking authentication");
  if(settings.Security.type == security_types::None) return true;
  else if(!cfg && (settings.Security.permissions & static_cast<uint8_t>(security_permissions::ConfigOnly)) == 0x01) return true;
  else if(request->hasHeader("apikey")) {
    DBG_PRINTLN("Checking API Key...");
    char token[65];
    memset(token, 0x00, sizeof(token));
    this->createAPIToken(request->client()->remoteIP(), token);
    // Une clé présente mais invalide DOIT répondre comme une clé absente : cf. isAuthenticated
    // (WebServer&) ci-dessus pour le raisonnement complet.
    if(String(token) != request->header("apikey")) {
      DBG_PRINTLN("Invalid API Key...");
      request->send(401, _encoding_text, "Unauthorized API Key");
      return false;
    }
  }
  else {
    DBG_PRINTLN("Not authenticated...");
    request->send(401, _encoding_text, "Unauthorized API Key");
    return false;
  }
  return true;
}

void Web::begin() {
  Serial.println("Creating Web MicroServices...");
  // CORS n'est nécessaire que pour développer data-dev/ depuis un serveur/origine distincte
  // du device (ex: http://localhost:8000). En usage normal (page servie par le device lui-même),
  // tout est same-origin et CORS n'apporte rien à part exposer inutilement l'API à d'autres sites.
  // DefaultHeaders est un registre global unique côté ESPAsyncWebServer (partagé par toutes les
  // instances AsyncWebServer du process) : un seul appel couvre donc server ET apiServer, là où
  // WebServer::enableCORS(true) devait être activé séparément sur chacun des deux anciens objets.
  // Reproduit exactement les 3 en-têtes qu'ajoutait WebServer::enableCORS(true) (cf. WebServer.cpp).
#ifdef ENABLE_DEV_CORS
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "*");
#endif
  // Pas d'équivalent à WebServer::collectHeaders() nécessaire : AsyncWebServerRequest expose tous
  // les en-têtes de la requête via hasHeader()/header() sans opt-in préalable.
  apiServer.on("/discovery", HTTP_ANY, [](AsyncWebServerRequest *request) { WebSystem::handleDiscovery(request); });
  apiServer.on("/rooms", HTTP_ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetRooms(request); });
  apiServer.on("/shades", HTTP_ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetShades(request); });
  apiServer.on("/groups", HTTP_ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetGroups(request); });
  apiServer.on("/schedules", HTTP_ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetSchedules(request); });
  apiServer.on("/login", HTTP_ANY, [](AsyncWebServerRequest *request) { WebAuth::handleLogin(request); });
  apiServer.onNotFound([](AsyncWebServerRequest *request) { webServer.handleNotFound(request); });
  apiServer.on("/controller", HTTP_ANY, [](AsyncWebServerRequest *request) { WebSystem::handleController(request); });
  apiServer.on("/shadeCommand", HTTP_ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleShadeCommand(request); });
  apiServer.on("/groupCommand", HTTP_ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleGroupCommand(request); });
  apiServer.on("/tiltCommand", HTTP_ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleTiltCommand(request); });
  apiServer.on("/repeatCommand", HTTP_ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleRepeatCommand(request); });
  apiServer.on("/room", HTTP_GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleRoom(request); });
  apiServer.on("/shade", HTTP_GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleShade(request); });
  apiServer.on("/group", HTTP_GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleGroup(request); });
  apiServer.on("/schedule", HTTP_GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleSchedule(request); });
  apiServer.on("/setPositions", HTTP_ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleSetPositions(request); });
  apiServer.on("/setSensor", HTTP_ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleSetSensor(request); });
  apiServer.on("/downloadFirmware", HTTP_ANY, [](AsyncWebServerRequest *request) { WebSystem::handleDownloadFirmware(request); });
  apiServer.on("/backup", HTTP_ANY, [](AsyncWebServerRequest *request) { WebSystem::handleBackup(request); });
  apiServer.on("/reboot", HTTP_ANY, [](AsyncWebServerRequest *request) { WebSystem::handleReboot(request); });

  WebI18n::registerRoutes(server);

  WebStatic::registerRoutes(server);
  WebAuth::registerRoutes(server);
  WebSystem::registerRoutes(server);
  server.onNotFound([](AsyncWebServerRequest *request) { webServer.handleNotFound(request); });
  WebShadesRest::registerRoutes(server);
  WebRadioCommands::registerRoutes(server);
  WebNetwork::registerRoutes(server);
  server.begin();
  apiServer.begin();
}
