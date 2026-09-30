// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>
#ifndef webgitsync_h
#define webgitsync_h

// Serveur HTTP synchrone dédié, isolé de l'infrastructure ESPAsyncWebServer/AsyncTCP -- SEULES
// les opérations OTA GitHub réellement bloquantes (poignée de main TLS + lecture de plusieurs Ko)
// y sont servies : /getReleases et /downloadFirmware. Sur AsyncTCP, chaque évènement lwIP en
// attente pendant qu'un handler bloque la tâche async_tcp est une allocation heap individuelle
// dans sa file interne : une activité socket concurrente pendant ce blocage grossit cette file
// sans qu'async_tcp puisse la vider, et le tas ne se résorbe plus de façon fiable. Faire tourner
// ces deux routes sur un WebServer classique, sur la tâche PRINCIPALE (loop(), jamais async_tcp),
// supprime structurellement la collision plutôt que de l'atténuer.
//
// Port distinct (8082) : en-têtes CORS émis ICI explicitement et INCONDITIONNELLEMENT (pas de
// dépendance à ENABLE_DEV_CORS) -- ce port ne sert que 2 routes étroites, l'exposition reste
// contenue. Le contrôle d'ORIGINE (sameOriginOrNone(), tenant lieu de jeton anti-CSRF) dépend lui
// d'ENABLE_DEV_CORS, désactivé en développement où la page vient forcément de localhost.
#define GIT_SYNC_SERVER_PORT 8082

namespace WebGitSync {
  void begin();
  void loop();
}
#endif
