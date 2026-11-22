// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef webstatic_h
#define webstatic_h
#include <ESPAsyncWebServer.h>

// Fichiers statiques : la page, ses JS/CSS, le favicon, la langue d'usine et le manifeste des
// langues, compilés dans l'application (WebAssets.h, inclus ici seulement), plus les exports
// shades.cfg/shades.tmp lus sur le filesystem.
namespace WebStatic {
  void registerRoutes(AsyncWebServer &server);
  const uint8_t *defaultLangGz(size_t &len);
  const uint8_t *langManifest(size_t &len);
}
#endif
