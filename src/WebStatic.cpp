#include <WebServer.h>
#include "Web.h"
#include "WebCommon.h"
#include "WebStatic.h"

extern Web webServer;

namespace WebStatic {
  void registerRoutes(WebServer &server) {
    server.on("/", [&server]() { webServer.handleStreamFile(server, "/index.html.gz", _encoding_html); });
    server.on("/shades.cfg", [&server]() {
      if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
      if(!webServer.isAuthenticated(server, true)) return;
      webServer.handleStreamFile(server, "/shades.cfg", _encoding_text);
    });
    server.on("/shades.tmp", [&server]() {
      if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
      if(!webServer.isAuthenticated(server, true)) return;
      webServer.handleStreamFile(server, "/shades.tmp", _encoding_text);
    });
    server.on("/index.js", [&server]() { webServer.sendCacheHeaders(604800); webServer.handleStreamFile(server, "/index.js.gz", "text/javascript"); });
    server.on("/base.css", [&server]() { webServer.sendCacheHeaders(604800); webServer.handleStreamFile(server, "/base.css.gz", "text/css"); });
    server.on("/main.css", [&server]() { webServer.sendCacheHeaders(604800); webServer.handleStreamFile(server, "/main.css.gz", "text/css"); });
    server.on("/overlays.css", [&server]() { webServer.sendCacheHeaders(604800); webServer.handleStreamFile(server, "/overlays.css.gz", "text/css"); });
    server.on("/favicon.svg", [&server]() { webServer.sendCacheHeaders(604800); webServer.handleStreamFile(server, "/favicon.svg.gz", "image/svg+xml"); });
    // Manifeste des langues, servi tel quel (non gzippé, cf. minify_data.py::_embed_manifest) --
    // permet à loadLangManifest() (index.js) de le lire en même origine, y compris en mode AP/hotspot
    // sans accès Internet vers raw.githubusercontent.com.
    server.on("/manifest.json", [&server]() { webServer.handleStreamFile(server, "/manifest.json", _encoding_json); });
  }

  // Surcharge ESPAsyncWebServer (étape 3 migration, non câblée pour l'instant -- cf. WebStatic.h).
  // Contrairement à la version WebServer&, les noms de fichiers passés à handleStreamFile() ne
  // portent jamais le suffixe .gz : c'est AsyncFileResponse qui détecte et sert automatiquement
  // la variante .gz si le fichier nu n'existe pas (cf. commentaire sur Web::handleStreamFile).
  void registerRoutes(AsyncWebServer &server) {
    server.on("/", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/index.html", _encoding_html); });
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
    server.on("/index.js", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/index.js", "text/javascript", 604800); });
    server.on("/base.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/base.css", "text/css", 604800); });
    server.on("/main.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/main.css", "text/css", 604800); });
    server.on("/overlays.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/overlays.css", "text/css", 604800); });
    server.on("/favicon.svg", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/favicon.svg", "image/svg+xml", 604800); });
    server.on("/manifest.json", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/manifest.json", _encoding_json); });
  }
}
