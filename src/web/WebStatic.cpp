// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include "Web.h"
#include "WebCommon.h"
#include "WebStatic.h"
#include "WebAssets.h"

extern Web webServer;

namespace WebStatic {
  // L'interface (index.html, index.js, index.css, favicon.svg) est compilée dans le firmware, gzip
  // compris (cf. build_data_image.py::_write_web_assets_header) : elle ne peut plus diverger du
  // firmware, et aucune mise à jour n'a plus à réécrire le filesystem pour elle.
  // Seuls index.js/index.css sont versionnés : leur URL porte "?v=<version de build>" (posé par
  // index.html, cf. build_data_image.py::resolve_build_version), d'où un cache long possible --
  // SEULEMENT sur une release propre, cf. Web.h pour l'historique du cache statique périmé que ça
  // a produit deux fois en dev.
  static const WebAsset *findAsset(const char *path) {
    for(size_t i = 0; i < WEB_ASSET_COUNT; i++) {
      if(strcmp(WEB_ASSETS[i].path, path) == 0) return &WEB_ASSETS[i];
    }
    return nullptr;
  }
  static void serveAsset(AsyncWebServerRequest *request, const char *path, bool isRootDocument) {
    const WebAsset *a = findAsset(path);
    if(!a) { request->send(404, _encoding_text, "404: Not Found"); return; }
    webServer.handleEmbeddedAsset(request, a->data, a->len, a->contentType, isRootDocument, a->versioned);
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/", [](AsyncWebServerRequest *request) { serveAsset(request, "/index.html", true); });
    server.on("/index.js", [](AsyncWebServerRequest *request) { serveAsset(request, "/index.js", false); });
    server.on("/index.css", [](AsyncWebServerRequest *request) { serveAsset(request, "/index.css", false); });
    server.on("/favicon.svg", [](AsyncWebServerRequest *request) { serveAsset(request, "/favicon.svg", false); });
    // Fichiers du filesystem : shades.cfg/tmp (diagnostic, jamais gzippés) et manifest.json (lu
    // tel quel par le backend C++, cf. build_data_image.py::_embed_manifest).
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
    server.on("/manifest.json", [](AsyncWebServerRequest *request) { webServer.handleStreamFile(request, "/manifest.json", _encoding_json); });
    // Aucune route d'image bitmap : l'interface n'utilise que des SVG, tous inline dans le sprite
    // d'index.html. S'il fallait un jour introduire une image, l'ajouter à EMBEDDED_ROUTES
    // (build_data_image.py) plutôt qu'au filesystem.
  }
}
