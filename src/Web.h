#include <WebServer.h>
// ESPAsyncWebServer.h détecte WebServer.h déjà inclus (garde WEBSERVER_H) et réutilise alors ses
// constantes HTTP_GET/HTTP_OPTIONS/etc. au lieu de les redéfinir -- les deux bibliothèques
// coexistent donc sans conflit dans cette même unité de compilation, le temps de la migration
// module par module vers ESPAsyncWebServer (étape 3+) : Web garde temporairement une surcharge par
// méthode pour chaque type de requête (WebServer&/AsyncWebServerRequest*), les anciennes surcharges
// étant retirées une fois tous les modules convertis et la bascule finale de `server`/`apiServer`
// effectuée dans Web.cpp::begin().
#include <ESPAsyncWebServer.h>
#include <atomic>
#include "Somfy.h"
#ifndef webserver_h
#define webserver_h
class Web {
public:
  // std::atomic : simple durcissement de la visibilité inter-tâches (étape 1 de la migration
  // ESPAsyncWebServer). Ne règle PAS la course entre deux uploads concurrents sur le même flag --
  // ce point sera traité lors de la migration des routes d'upload elles-mêmes (état par-requête).
  std::atomic<bool> uploadSuccess{false};
  // Dédié à /uploadLang (Phase 4 i18n, relais navigateur en mode AP/hotspot) -- distinct de
  // uploadSuccess (propre à /restore) pour ne coupler aucun des deux flux d'upload entre eux.
  std::atomic<bool> langUploadSuccess{false};

  void sendCORSHeaders(WebServer &server);
  void sendCacheHeaders(uint32_t seconds = 604800);
  void startup();
  void handleStreamFile(WebServer &server, const char *filename, const char *encoding);
  void handleNotFound(WebServer &server);
  void handleDeserializationError(WebServer &server, DeserializationError &err);
  void begin();
  void loop();
  void end();
  // Web Handlers
  bool createAPIToken(const IPAddress ipAddress, char *token);
  bool createAPIToken(const char *payload, char *token);
  bool createAPIPinToken(const IPAddress ipAddress, const char *pin, char *token);
  bool createAPIPasswordToken(const IPAddress ipAddress, const char *username, const char *password, char *token);
  bool isAuthenticated(WebServer &server, bool cfg = false);
  void loadApiSecret();

  // --- Surcharges ESPAsyncWebServer (étape 3+ migration) ---
  // handleStreamFile : contrairement à la version WebServer&, filename ne doit JAMAIS inclure le
  // suffixe .gz -- AsyncFileResponse détecte et sert automatiquement filename+".gz" si filename lui
  // seul n'existe pas sur LittleFS (cf. minify_data.py, qui n'embarque que la variante gzip pour
  // html/js/css/svg), Content-Encoding: gzip étant alors ajouté automatiquement par la bibliothèque.
  // cacheSeconds = 0 (défaut) n'ajoute aucun en-tête Cache-Control.
  void handleStreamFile(AsyncWebServerRequest *request, const char *filename, const char *contentType, uint32_t cacheSeconds = 0);
  void handleNotFound(AsyncWebServerRequest *request);
  void handleDeserializationError(AsyncWebServerRequest *request, DeserializationError &err);
  // Ne réémet pas l'en-tête de réponse "apikey" que la variante WebServer&/isAuthenticated()
  // renvoyait en écho au token déjà connu du client (server.sendHeader("apikey", token)) : ce
  // dernier a lui-même calculé ce token de façon déterministe (même HMAC IP+réglages de sécurité),
  // l'écho ne transportait donc aucune information nouvelle -- et une réponse concrète n'existe pas
  // encore à ce stade sous ESPAsyncWebServer (elle est construite plus tard par l'appelant).
  bool isAuthenticated(AsyncWebServerRequest *request, bool cfg = false);

  //void chunkRoomsResponse(WebServer &server, const char *elem = nullptr);
  //void chunkShadesResponse(WebServer &server, const char *elem = nullptr);
  //void chunkGroupsResponse(WebServer &server, const char *elem = nullptr);
  //void chunkGroupResponse(WebServer &server, SomfyGroup *, const char *prefix = nullptr);
private:
  // Clé de signature HMAC des jetons de session : générée aléatoirement au premier boot et
  // persistée en NVS (namespace dédié). Ne jamais l'exposer via une réponse JSON/MQTT/mDNS.
  char apiSecret[65] = "";
};
#endif
