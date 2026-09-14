// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef webstatic_h
#define webstatic_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Fichiers statiques servis depuis LittleFS (page, JS/CSS, favicon, manifeste des langues,
// exports shades.cfg/shades.tmp). Ne dépend que des primitives du noyau WebCore (handleStreamFile,
// sendCacheHeaders, isAuthenticated).
namespace WebStatic {
  void registerRoutes(AsyncWebServer &server);
}
#endif
