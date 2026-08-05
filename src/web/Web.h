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
  // gzip étant alors ajouté automatiquement par la bibliothèque.
  // Aucun cache long (immutable/max-age) sur quoi que ce soit : le suffixe "?v=<version de build>"
  // posé par index.html sur base.css/main.css/overlays.css/index.js (cf.
  // minify_data.py::resolve_build_version) avait déjà été combiné une fois à du cache long
  // (immutable) côté serveur -- ça a fait rester des navigateurs plusieurs jours sur un JS/CSS
  // périmé après un reflash, sans aucun signal (cf. historique du commit "fix cache statique"),
  // avant d'être retiré. On ne le réintroduit pas : mieux vaut resservir ces fichiers à chaque
  // requête (ils sont petits, gzippés, et le device n'a pas de trafic à haute fréquence à
  // économiser) que risquer une UI figée en développement.
  // - isRootDocument = false (défaut) : Cache-Control: no-cache, must-revalidate. S'applique à tout
  //   le reste (base.css/main.css/overlays.css/index.js, favicon.svg, manifest.json,
  //   shades.cfg/tmp, locale/*.json...) : le navigateur peut garder une copie mais doit toujours la
  //   revalider auprès du device avant de l'utiliser.
  // - isRootDocument = true : c'est index.html lui-même -- le seul fichier qui référence les URLs
  //   versionnées ci-dessus. Force "Cache-Control: no-store, no-cache, must-revalidate, max-age=0"
  //   (encore plus strict : no-store interdit même la mise en cache) et ajoute les en-têtes de
  //   durcissement (CSP, X-Content-Type-Options) : inutile de les répéter sur chaque asset, ils ne
  //   s'appliquent qu'au document racine.
  void handleStreamFile(AsyncWebServerRequest *request, const char *filename, const char *contentType, bool isRootDocument = false);
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
