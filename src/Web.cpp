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

WebServer apiServer(8081);
WebServer server(80);
void Web::startup() {
  Serial.println("Launching web server...");
  this->loadApiSecret();


  //server.on("/json", HTTP_GET, []() {
    //Serial.print(">>> REQUETE /json RECUE DE L'IP : ");
    //Serial.println(server.client().remoteIP().toString());
    //server.send(200, "application/json", "{}");
  //});
}
void Web::loop() {
  server.handleClient();
  delay(1);
  apiServer.handleClient();
  delay(1);
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
  server.sendHeader(F("Cache-Control"), F("public, max-age=604800, immutable"));
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
void Web::begin() {
  Serial.println("Creating Web MicroServices...");
  // CORS n'est nécessaire que pour développer data-dev/ depuis un serveur/origine distincte
  // du device (ex: http://localhost:8000). En usage normal (page servie par le device lui-même),
  // tout est same-origin et CORS n'apporte rien à part exposer inutilement l'API à d'autres sites.
#ifdef ENABLE_DEV_CORS
  server.enableCORS(true);
#endif
  const char *keys[1] = {"apikey"};
  server.collectHeaders(keys, 1);
  // API Server Handlers
  apiServer.collectHeaders(keys, 1);
#ifdef ENABLE_DEV_CORS
  apiServer.enableCORS(true);
#endif
  apiServer.on("/discovery", []() { WebSystem::handleDiscovery(apiServer); });
  apiServer.on("/rooms", []() { WebShadesRest::handleGetRooms(apiServer); });
  apiServer.on("/shades", []() { WebShadesRest::handleGetShades(apiServer); });
  apiServer.on("/groups", []() { WebShadesRest::handleGetGroups(apiServer); });
  apiServer.on("/schedules", []() { WebShadesRest::handleGetSchedules(apiServer); });
  apiServer.on("/login", []() { WebAuth::handleLogin(apiServer); });
  apiServer.onNotFound([]() { webServer.handleNotFound(apiServer); });
  apiServer.on("/controller", []() { WebSystem::handleController(apiServer); });
  apiServer.on("/shadeCommand", []() { WebRadioCommands::handleShadeCommand(apiServer); });
  apiServer.on("/groupCommand", []() { WebRadioCommands::handleGroupCommand(apiServer); });
  apiServer.on("/tiltCommand", []() { WebRadioCommands::handleTiltCommand(apiServer); });
  apiServer.on("/repeatCommand", []() { WebRadioCommands::handleRepeatCommand(apiServer); });
  apiServer.on("/room", HTTP_GET, [] () { WebShadesRest::handleRoom(apiServer); });
  apiServer.on("/shade", HTTP_GET, [] () { WebShadesRest::handleShade(apiServer); });
  apiServer.on("/group", HTTP_GET, [] () { WebShadesRest::handleGroup(apiServer); });
  apiServer.on("/schedule", HTTP_GET, [] () { WebShadesRest::handleSchedule(apiServer); });
  apiServer.on("/setPositions", []() { WebRadioCommands::handleSetPositions(apiServer); });
  apiServer.on("/setSensor", []() { WebRadioCommands::handleSetSensor(apiServer); });
  apiServer.on("/downloadFirmware", []() { WebSystem::handleDownloadFirmware(apiServer); });
  apiServer.on("/backup", []() { WebSystem::handleBackup(apiServer); });
  apiServer.on("/reboot", []() { WebSystem::handleReboot(apiServer); });
  
  WebI18n::registerRoutes(server);

  WebStatic::registerRoutes(server);
  WebAuth::registerRoutes(server);
  WebSystem::registerRoutes(server);
  server.onNotFound([]() { webServer.handleNotFound(server); });
  WebShadesRest::registerRoutes(server);
  WebRadioCommands::registerRoutes(server);
  WebNetwork::registerRoutes(server);
  server.begin();
  apiServer.begin();
}
