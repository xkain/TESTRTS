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
}
