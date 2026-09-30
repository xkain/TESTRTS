// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef diagconn_h
#define diagconn_h
#include <Arduino.h>

// Recense les connexions TCP réellement ouvertes (UI port 80, API 8081, OTA 8082, WebSocket 8080)
// en lisant directement les listes de PCB lwIP plutôt qu'en comptant dans les handlers -- ce
// dernier manquerait les connexions spéculatives des navigateurs et les TIME_WAIT laissés par
// chaque réponse (ESPAsyncWebServer ferme après CHAQUE réponse).
//
// SÛRETÉ : tcp_active_pcbs/tcp_tw_pcbs appartiennent à la tâche tcpip et sont modifiées par elle
// SANS VERROU (CONFIG_LWIP_TCPIP_CORE_LOCKING désactivé sur ce core) -- les parcourir depuis
// loopTask serait une lecture de liste chaînée en cours de mutation. Le parcours s'exécute donc SUR
// la tâche tcpip, via tcpip_api_call(), le même mécanisme qu'AsyncTCP pour ses appels tcp_*.
#define DIAGCONN_PORTS 4

struct conn_census_t {
  // Indexés comme DiagConn::ports[] : 80, 8081, 8082, 8080.
  uint16_t est[DIAGCONN_PORTS];      // ESTABLISHED : connexions réellement vivantes
  uint16_t transit[DIAGCONN_PORTS];  // SYN_RCVD ou fermeture en cours (FIN_WAIT/CLOSING/LAST_ACK/CLOSE_WAIT)
  uint16_t otherPort;                // établies sur un port non surveillé (sortantes : GitHub, MQTT, NTP...)
  uint16_t timeWait;                 // liste tcp_tw_pcbs : rémanence de 2*MSL après chaque réponse
  uint16_t activeTotal;              // longueur de tcp_active_pcbs, tous ports et états confondus
  uint8_t peers;                     // adresses IP distantes distinctes parmi les actives (~= nb de machines)
  uint8_t wsClients;                 // emplacements occupés du pool WebSocket (links2004)
  bool valid;                        // false = pile réseau pas encore démarrée, relevé sans signification
};

namespace DiagConn {
  extern const uint16_t ports[DIAGCONN_PORTS];
  // Relevé instantané. Bloque le temps que la tâche tcpip traite l'appel (quelques centaines de
  // microsecondes en pratique) -- à n'appeler que depuis la tâche principale.
  bool snapshot(conn_census_t *census);
  // Imprime un relevé complet : connexions, tas, et pics accumulés depuis le dernier resetPeaks().
  // `force` contourne l'anti-répétition, pour les relevés explicitement demandés.
  void report(const char *label, bool force = false);
  // Remet les pics à zéro (début d'un nouveau palier de mesure sans redémarrage).
  void resetPeaks();
  // À appeler depuis loop() : échantillonne, tient les pics à jour, signale les changements de
  // composition, et traite les commandes de mesure reçues sur la liaison série.
  void loop();
}
#endif
