// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>
#ifndef webgitsync_h
#define webgitsync_h

// Serveur HTTP synchrone dédié, isolé de l'infrastructure ESPAsyncWebServer/AsyncTCP -- SEULES
// les opérations OTA GitHub réellement bloquantes (poignée de main TLS + lecture de plusieurs Ko)
// y sont servies : /getReleases et /downloadFirmware. Root cause de l'instabilité mémoire OTA
// (audit du 14-15/08/2026, cf. commits 3c995fe/f28c93b et suivants) : sur AsyncTCP 3.3.2, chaque
// évènement lwIP en attente pendant qu'un handler bloque la tâche async_tcp est une allocation
// heap individuelle dans sa file interne (_async_queue, liste chaînée) -- une activité socket
// concurrente (reconnexion de page, plusieurs onglets) survenant PENDANT ce blocage grossissait
// cette file sans qu'async_tcp puisse la vider, et le tas ne se résorbait plus de façon fiable.
// Le modèle différé (releasesRequested/GitUpdater::loop(), toujours en place pour
// /getAvailableLangs) atténue le problème mais n'élimine pas la collision sous-jacente : ce
// module la supprime structurellement en faisant tourner ces deux routes sur un WebServer
// classique tournant sur la tâche PRINCIPALE (loop(), jamais async_tcp) -- même verdict qu'un
// fork actif du projet confronté au même symptôme (github.com/Pulpyyyy/ESPSomfy-RTS), architecture
// distincte ici (pas de copie : nommage, découpage en fichier séparé, réutilisation de
// JsonFormatter::begin()/g_content au lieu d'une hiérarchie de classes WebSyncRequest dédiée).
//
// Port distinct (8082) obligatoire : /getReleases et /downloadFirmware restent aussi accessibles
// sur `server`@80 le temps de la bascule -- cf. leur suppression progressive dans WebSystem.cpp.
// En-têtes CORS émis ICI explicitement et INCONDITIONNELLEMENT (pas de dépendance à
// ENABLE_DEV_CORS, absent de l'environnement box_eth) : ce port ne sert que 2 routes étroites,
// l'exposition reste contenue. Le contrôle d'ORIGINE (sameOriginOrNone(), tenant lieu de jeton
// anti-CSRF) est distinct de ces en-têtes et lui, dépend d'ENABLE_DEV_CORS -- désactivé dans ce
// seul environnement de développement, où la page vient forcément de localhost.
#define GIT_SYNC_SERVER_PORT 8082

namespace WebGitSync {
  void begin();
  void loop();
}
#endif
