// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>
#include "Somfy.h"
#ifndef webserver_h
#define webserver_h
class Web {
public:
  void sendCacheHeaders(uint32_t seconds = 604800);
  void startup();
  void begin();
  void loop();
  void end();
  // Web Handlers
  bool createAPIToken(const IPAddress ipAddress, char *token);
  bool createAPIToken(const char *payload, char *token);
  bool createAPIPinToken(const IPAddress ipAddress, const char *pin, char *token);
  bool createAPIPasswordToken(const IPAddress ipAddress, const char *username, const char *password, char *token);
  void loadApiSecret();

  // handleStreamFile : filename ne doit JAMAIS inclure le suffixe .gz -- AsyncFileResponse détecte
  // et sert automatiquement filename+".gz" si filename lui seul n'existe pas sur LittleFS (cf.
  // minify_data.py, qui n'embarque que la variante gzip pour html/js/css/svg), Content-Encoding:
  // gzip étant alors ajouté automatiquement par la bibliothèque. cacheSeconds = 0 (défaut) n'ajoute
  // aucun en-tête Cache-Control.
  void handleStreamFile(AsyncWebServerRequest *request, const char *filename, const char *contentType, uint32_t cacheSeconds = 0);
  void handleNotFound(AsyncWebServerRequest *request);
  void handleDeserializationError(AsyncWebServerRequest *request, DeserializationError &err);
  // Ne réémet pas d'en-tête de réponse "apikey" en écho au token déjà connu du client : ce dernier
  // l'a lui-même calculé de façon déterministe (même HMAC IP+réglages de sécurité), l'écho ne
  // transporterait donc aucune information nouvelle -- et une réponse concrète n'existe pas encore
  // à ce stade (elle est construite plus tard par l'appelant).
  bool isAuthenticated(AsyncWebServerRequest *request, bool cfg = false);

private:
  // Clé de signature HMAC des jetons de session : générée aléatoirement au premier boot et
  // persistée en NVS (namespace dédié). Ne jamais l'exposer via une réponse JSON/MQTT/mDNS.
  char apiSecret[65] = "";
};
#endif
