#include "Web.h"
#include "WebCommon.h"
#include "WebStatic.h"

extern Web webServer;

namespace WebStatic {
  // Les noms de fichiers passés à handleStreamFile() ne portent jamais le suffixe .gz : c'est
  // AsyncFileResponse qui détecte et sert automatiquement la variante .gz si le fichier nu
  // n'existe pas (cf. commentaire sur Web::handleStreamFile).
  // Aucun cache long ici (cf. Web.h/handleStreamFile) : même les assets versionnés par index.html
  // via "?v=<version de build>" (base.css/main.css/overlays.css/index.js, cf.
  // minify_data.py::resolve_build_version) restent en no-cache/must-revalidate -- un cache
  // immutable avait déjà fait rester des navigateurs plusieurs jours sur un JS/CSS périmé après un
  // reflash avant d'être retiré ("fix cache statique").
  void registerRoutes(AsyncWebServer &server) {
    server.on("/", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/index.html", _encoding_html, true); });
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
    server.on("/index.js", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/index.js", "text/javascript"); });
    server.on("/base.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/base.css", "text/css"); });
    server.on("/main.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/main.css", "text/css"); });
    server.on("/overlays.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/overlays.css", "text/css"); });
    server.on("/favicon.svg", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/favicon.svg", "image/svg+xml"); });
    server.on("/manifest.json", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/manifest.json", _encoding_json); });
  }
}
