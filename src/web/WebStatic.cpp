#include "Web.h"
#include "WebCommon.h"
#include "WebStatic.h"

extern Web webServer;

namespace WebStatic {
  // Les noms de fichiers passés à handleStreamFile() ne portent jamais le suffixe .gz (cf.
  // commentaire détaillé sur Web::handleStreamFile dans Web.h).
  // index.html/index.js/index.css/favicon.svg passent alwaysGzipped=true : ce sont tous des
  // fichiers du pipeline de build (build_data_image.py, qui gzippe systématiquement
  // .html/.js/.css/.svg), jamais présents en clair sur le device -- inutile de le revérifier à
  // chaque requête. manifest.json, lui, est délibérément exclu de cette gzippification (cf.
  // build_data_image.py::_embed_manifest -- lu directement par le backend C++, qui n'a pas de capacité
  // de décompression) et reste donc sur le chemin générique, tout comme shades.cfg/tmp qui ne sont
  // eux jamais gzippés (écrits en clair par le device lui-même).
  // Seuls index.js/index.css passent aussi immutableVersioned=true (cf. handleStreamFile dans
  // Web.h) : ce sont les deux seuls fichiers dont l'URL porte "?v=<version de build>" (posé par
  // index.html, cf. build_data_image.py::resolve_build_version) et qui peuvent donc être mis en cache
  // long sans risque -- SEULEMENT sur une release propre, cf. Web.h pour l'historique du cache
  // statique périmé que ça a produit deux fois en dev.
  void registerRoutes(AsyncWebServer &server) {
    server.on("/", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/index.html", _encoding_html, true, true); });
    server.on("/shades.cfg", [](AsyncWebServerRequest *request) {
      if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
      if(!webServer.isAuthenticated(request, true)) return;
      webServer.handleStreamFile(request, "/shades.cfg", _encoding_text);
    });
    server.on("/shades.tmp", [](AsyncWebServerRequest *request) {
      if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
      if(!webServer.isAuthenticated(request, true)) return;
      webServer.handleStreamFile(request, "/shades.tmp", _encoding_text);
    });
    // index.js/index.css : seuls assets versionnés (?v=) de ce module -- immutableVersioned=true
    // n'a d'effet réel qu'en build release (cf. build_data_image.py::_set_build_cache_flag et le
    // commentaire de handleStreamFile dans Web.h).
    server.on("/index.js", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/index.js", "text/javascript", false, true, true); });
    // base.css/main.css/overlays.css restent 3 fichiers éditables sous data-dev/, mais build_data_image.py
    // les fusionne en un seul index.css.gz (même convention que index.js, déjà un bundle unique) :
    // 1 requête au lieu de 3 à CHAQUE chargement de page, ces fichiers étant revalidés à chaque fois
    // (pas de cache long hors release, cf. Web.h).
    server.on("/index.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/index.css", "text/css", false, true, true); });
    server.on("/favicon.svg", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/favicon.svg", "image/svg+xml", false, true); });
    server.on("/manifest.json", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/manifest.json", _encoding_json); });
  }
}
