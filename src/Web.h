#include <WebServer.h>
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
