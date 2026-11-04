// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef webicons_h
#define webicons_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Pack d'icônes d'équipement : /icons, /uploadIcons, /deleteIcons. Un seul pack installé à la
// fois ; le pack par défaut vit dans index.html et sert de repli.
#define ICON_PACK_FILE "/icons/pack.json.gz"

namespace WebIcons {
  void registerRoutes(AsyncWebServer &server);
}
#endif
