#include "Web.h"
#include "WebCommon.h"
#include "WebStatic.h"

extern Web webServer;

namespace WebStatic {
  // Les noms de fichiers passés à handleStreamFile() ne portent jamais le suffixe .gz : c'est
  // AsyncFileResponse qui détecte et sert automatiquement la variante .gz si le fichier nu
  // n'existe pas (cf. commentaire sur Web::handleStreamFile).
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
    // Pas de cache long (immutable) sur ces assets : rien ici ne porte de nom versionné/hashé,
    // donc un Cache-Control agressif (l'ancien réglage : 604800s = 7 jours, immutable) faisait
    // servir un JS/CSS périmé par le navigateur après un reflash, sans que rien ne le signale --
    // seul index.html (jamais mis en cache, cf. ci-dessus) semblait alors à jour, ce qui a
    // provoqué plusieurs faux "régressions" en test. cacheSeconds omis = comportement par défaut
    // de handleStreamFile (pas d'en-tête Cache-Control, cf. Web.h), identique à index.html.
    server.on("/index.js", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/index.js", "text/javascript"); });
    server.on("/base.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/base.css", "text/css"); });
    server.on("/main.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/main.css", "text/css"); });
    server.on("/overlays.css", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/overlays.css", "text/css"); });
    server.on("/favicon.svg", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/favicon.svg", "image/svg+xml"); });
    server.on("/manifest.json", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/manifest.json", _encoding_json); });
  }
}
