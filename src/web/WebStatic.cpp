#include "Web.h"
#include "WebCommon.h"
#include "WebStatic.h"

extern Web webServer;

namespace WebStatic {
  // Les noms de fichiers passés à handleStreamFile() ne portent jamais le suffixe .gz (cf.
  // commentaire détaillé sur Web::handleStreamFile dans Web.h).
  // index.html/index.js/base.css/main.css/overlays.css/favicon.svg passent alwaysGzipped=true :
  // ce sont tous des fichiers du pipeline de build (minify_data.py::minify_all(), qui gzippe
  // systématiquement .html/.js/.css/.svg), jamais présents en clair sur le device -- inutile de le
  // revérifier à chaque requête. manifest.json, lui, est délibérément exclu de cette gzippification
  // (cf. minify_data.py::_embed_manifest -- lu directement par le backend C++, qui n'a pas de
  // capacité de décompression) et reste donc sur le chemin générique, tout comme shades.cfg/tmp qui
  // ne sont eux jamais gzippés (écrits en clair par le device lui-même).
  // Aucun cache long ici (cf. Web.h/handleStreamFile) : même les assets versionnés par index.html
  // via "?v=<version de build>" (base.css/main.css/overlays.css/index.js, cf.
  // minify_data.py::resolve_build_version) restent en no-cache/must-revalidate -- un cache
  // immutable avait déjà fait rester des navigateurs plusieurs jours sur un JS/CSS périmé après un
  // reflash avant d'être retiré ("fix cache statique").
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
    server.on("/index.js", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/index.js", "text/javascript", false, true); });
    server.on("/base.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/base.css", "text/css", false, true); });
    server.on("/main.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/main.css", "text/css", false, true); });
    server.on("/overlays.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/overlays.css", "text/css", false, true); });
    server.on("/favicon.svg", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/favicon.svg", "image/svg+xml", false, true); });
    server.on("/manifest.json", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/manifest.json", _encoding_json); });
  }
}
