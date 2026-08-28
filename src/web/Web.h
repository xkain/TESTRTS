// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>
#include "somfy/Somfy.h"
#ifndef webserver_h
#define webserver_h
class Web {
public:
  void startup();
  void begin();
  // Web Handlers
  bool createAPIToken(const IPAddress ipAddress, char *token);
  bool createAPIToken(const char *payload, char *token);
  bool createAPIPinToken(const IPAddress ipAddress, const char *pin, char *token);
  bool createAPIPasswordToken(const IPAddress ipAddress, const char *username, const char *password, char *token);
  void loadApiSecret();

  // handleStreamFile : filename ne doit JAMAIS inclure le suffixe .gz.
  // - alwaysGzipped = false (défaut) : filename peut exister en clair (shades.cfg/tmp, jamais
  //   gzippés -- écrits tels quels par le device) ou dans les deux variantes selon le cas
  //   (locale/<code>.json : gzippée si c'est la langue embarquée par le build, sinon JSON brut posé
  //   tel quel par handleDownloadLang, cf. WebI18n.cpp) : AsyncFileResponse détecte et sert
  //   lui-même filename+".gz" si filename seul n'existe pas, Content-Encoding: gzip étant alors
  //   ajouté automatiquement par la bibliothèque.
  // - alwaysGzipped = true : filename provient du pipeline de build (build_data_image.py), qui
  //   n'embarque JAMAIS le fichier "nu" -- seule la variante .gz existe sur le device. On
  //   interroge alors celle-ci directement (Content-Encoding posé nous-mêmes) : ça évite le double
  //   lookup raté que faisait chaque requête sur ces fichiers dans le cas générique ci-dessus
  //   (LittleFS.exists(filename), PUIS le fallback automatique d'AsyncFileResponse -- visible en
  //   logs série sous forme de vfs_api "does not exist" répétés à chaque chargement de page). À
  //   réserver aux appelants sûrs que le fichier nu n'existera jamais (index.html/js/css/svg/json
  //   issus de data-dev/, PAS shades.cfg/tmp ni la langue couramment sélectionnée).
  // Cache-Control par défaut : no-cache, must-revalidate. S'applique à tout le reste (index.css,
  // index.js hors release, favicon.svg, manifest.json, shades.cfg/tmp, locale/*.json...) : le
  // navigateur peut garder une copie mais doit toujours la revalider auprès du device avant de
  // l'utiliser.
  // - isRootDocument = true : c'est index.html lui-même -- le seul fichier qui référence les URLs
  //   versionnées ci-dessous. Force "Cache-Control: no-store, no-cache, must-revalidate, max-age=0"
  //   (encore plus strict : no-store interdit même la mise en cache) et ajoute les en-têtes de
  //   durcissement (CSP, X-Content-Type-Options) : inutile de les répéter sur chaque asset, ils ne
  //   s'appliquent qu'au document racine.
  // - immutableVersioned = true : réservé à index.js/index.css, les deux seuls fichiers dont l'URL
  //   porte le suffixe "?v=<version de build>" posé par index.html (cf.
  //   build_data_image.py::resolve_build_version). Cache-Control: max-age=31536000, immutable --
  //   MAIS seulement si BUILD_ASSET_CACHE_IMMUTABLE vaut 1 (define posé par
  //   build_data_image.py::_set_build_cache_flag), c.-à-d. seulement sur une release propre (?v= sans
  //   suffixe "-dev-"). En dev, où la version peut changer sans qu'un onglet déjà ouvert ne le
  //   voie tant qu'on ne l'a pas explicitement rechargé, on reste en no-cache/must-revalidate :
  //   ce cache long avait déjà produit deux fois du JS/CSS périmé après reflash/AP/erase, les deux
  //   fois découvert EN TESTANT activement (cf. commits "fix cache statique" et "Corrige
  //   définitivement le cache statique après reflash/AP/erase") -- on ne le réintroduit qu'à
  //   l'endroit où ce risque d'itération rapide ne se pose pas.
  void handleStreamFile(AsyncWebServerRequest *request, const char *filename, const char *contentType, bool isRootDocument = false, bool alwaysGzipped = false, bool immutableVersioned = false);
  void handleNotFound(AsyncWebServerRequest *request);
  void handleDeserializationError(AsyncWebServerRequest *request, DeserializationError &err);
  // Ne réémet pas d'en-tête de réponse "apikey" en écho au token déjà connu du client : ce dernier
  // l'a lui-même calculé de façon déterministe (même HMAC IP+réglages de sécurité), l'écho ne
  // transporterait donc aucune information nouvelle -- et une réponse concrète n'existe pas encore
  // à ce stade (elle est construite plus tard par l'appelant).
  // Même décision que isAuthenticated(), mais SANS émettre de réponse : indispensable dans les
  // callbacks de corps de requête (upload), qui s'exécutent AVANT le handler et où répondre
  // reviendrait à écrire au milieu de la réception. isAuthenticated() n'est plus qu'un
  // enrobage qui y ajoute le 401.
  bool checkAuth(AsyncWebServerRequest *request, bool cfg = false);
  bool isAuthenticated(AsyncWebServerRequest *request, bool cfg = false);

  // Draine les réponses fichier LittleFS encore en cours d'émission sur la tâche async_tcp. À
  // appeler depuis la tâche principale APRÈS avoir posé git.lockFS, avant toute écriture du
  // filesystem (OTA, pack de langue) -- cf. le commentaire détaillé sur g_asyncFileReaders dans
  // Web.cpp. Renvoie false si le budget d'attente est épuisé, l'appelant poursuivant alors quand
  // même (comportement identique à l'existant, aucun blocage nouveau introduit).
  bool waitForFileReaders(uint32_t timeoutMs = 2000);

private:
  // Clé de signature HMAC des jetons de session : générée aléatoirement au premier boot et
  // persistée en NVS (namespace dédié). Ne jamais l'exposer via une réponse JSON/MQTT/mDNS.
  char apiSecret[65] = "";
};
#endif
