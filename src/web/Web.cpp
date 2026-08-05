#include <WiFi.h>
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

// CSP du document racine (index.html) uniquement -- pas des assets, qui n'exécutent rien par
// eux-mêmes. 'unsafe-inline' est nécessaire des deux côtés : index.html porte un <script> inline
// (détection du thème avant le premier paint, cf. data-dev/index.html) ainsi que des attributs
// onclick=, et de nombreux style="" inline (cf. data-dev/index.html/index.js). connect-src liste
// tout ce que l'UI contacte en XHR/fetch/WebSocket : l'API REST et le WebSocket temps réel sur le
// device lui-même (port 8080, cf. Sockets.cpp), plus GitHub pour la vérification de mises à jour
// (raw.githubusercontent.com pour le changelog, api.github.com pour les releases). Toute nouvelle
// origine contactée depuis index.js doit être ajoutée ici, sous peine de blocage silencieux par le
// navigateur.
static const char _csp[] PROGMEM =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; "
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com ws://*:8080 wss://*:8080; "
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

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
// Cf. WebCommon.h pour le contexte complet (bug trouvé en test matériel réel, étape 5e).
void asyncBodyHandler(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
  if(total == 0) return;
  if(request->_tempObject == nullptr) {
    request->_tempObject = malloc(total + 1);
    if(request->_tempObject == nullptr) return;
    ((char*)request->_tempObject)[total] = '\0';
  }
  memcpy((uint8_t*)request->_tempObject + index, data, len);
}
bool asyncHasBody(AsyncWebServerRequest *request) {
  return request->_tempObject != nullptr;
}
String asyncGetBody(AsyncWebServerRequest *request) {
  return request->_tempObject ? String((char*)request->_tempObject) : String();
}

void Web::handleStreamFile(AsyncWebServerRequest *request, const char *filename, const char *contentType, bool isRootDocument, bool alwaysGzipped) {
  if(git.lockFS) {
    request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
    return;
  }
  AsyncWebServerResponse *response;
  if(alwaysGzipped) {
    // Cf. commentaire de handleStreamFile dans Web.h : ces fichiers n'existent JAMAIS en clair sur
    // le device, on interroge donc directement leur variante .gz -- un seul lookup, toujours
    // gagnant, au lieu des deux lookups ratés du chemin générique ci-dessous.
    String gzFilename = String(filename) + ".gz";
    if(!LittleFS.exists(gzFilename)) {
      request->send(404, _encoding_text, "404: Not Found");
      return;
    }
    esp_task_wdt_reset();
    response = request->beginResponse(LittleFS, gzFilename, contentType);
    response->addHeader("Content-Encoding", "gzip");
  }
  else {
    if(!LittleFS.exists(filename) && !LittleFS.exists(String(filename) + ".gz")) {
      request->send(404, _encoding_text, "404: Not Found");
      return;
    }
    esp_task_wdt_reset();
    response = request->beginResponse(LittleFS, filename, contentType);
  }
  if(isRootDocument) {
    // Jamais de cache aveugle sur le document qui référence les URLs versionnées ?v= des autres
    // assets (cf. commentaire de handleStreamFile dans Web.h) ; no-store empêche même une mise en
    // cache locale, must-revalidate impose au client de revérifier auprès du device avant toute
    // réutilisation, même hors ligne dans certains navigateurs.
    response->addHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    // String(FPSTR(...)) plutôt que FPSTR(...) passé tel quel : addHeader() n'a pas de surcharge
    // pour const __FlashStringHelper*, seulement (const char*, const char*) et (String, String) --
    // la conversion explicite lève toute ambiguïté de résolution de surcharge.
    response->addHeader("Content-Security-Policy", String(FPSTR(_csp)));
    response->addHeader("X-Content-Type-Options", "nosniff");
  }
  else {
    // Idem pour tout le reste (assets versionnés ou non, fichiers de config) : jamais de cache long
    // -- cf. commentaire de handleStreamFile dans Web.h, un cache immutable combiné au ?v= avait
    // déjà produit un JS/CSS périmé après reflash tant qu'index.html lui-même n'était pas hors
    // cache. On ne réintroduit pas ce risque même maintenant qu'index.html l'est.
    response->addHeader("Cache-Control", "no-cache, must-revalidate");
  }
  request->send(response);
  esp_task_wdt_reset();
}
void Web::handleNotFound(AsyncWebServerRequest *request) {
  if(request->method() == AsyncHttp::OPTIONS) {
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
    // Une clé présente mais invalide DOIT répondre comme une clé absente : sans ce send(), la
    // requête restait sans réponse et le client attendait son timeout au lieu de voir un refus
    // explicite (et donc de redemander une authentification).
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
  apiServer.on("/discovery", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleDiscovery(request); });
  apiServer.on("/rooms", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetRooms(request); });
  apiServer.on("/shades", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetShades(request); });
  apiServer.on("/groups", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetGroups(request); });
  apiServer.on("/schedules", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetSchedules(request); });
  apiServer.on("/login", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebAuth::handleLogin(request); }, nullptr, asyncBodyHandler);
  apiServer.onNotFound([](AsyncWebServerRequest *request) { webServer.handleNotFound(request); });
  apiServer.on("/controller", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleController(request); });
  apiServer.on("/shadeCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleShadeCommand(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/groupCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleGroupCommand(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/tiltCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleTiltCommand(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/repeatCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleRepeatCommand(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/room", AsyncHttp::GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleRoom(request); });
  apiServer.on("/shade", AsyncHttp::GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleShade(request); });
  apiServer.on("/group", AsyncHttp::GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleGroup(request); });
  apiServer.on("/schedule", AsyncHttp::GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleSchedule(request); });
  apiServer.on("/setPositions", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleSetPositions(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/setSensor", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleSetSensor(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/downloadFirmware", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleDownloadFirmware(request); });
  apiServer.on("/backup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleBackup(request); });
  apiServer.on("/reboot", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleReboot(request); });

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
