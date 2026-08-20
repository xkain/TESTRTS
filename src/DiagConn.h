#ifndef diagconn_h
#define diagconn_h
#include <Arduino.h>

// --- Recensement des connexions TCP (audit capacité multi-clients, 18/08/2026) ---
//
// Répond à une question que rien dans le firmware ne savait mesurer : UN ONGLET DE NAVIGATEUR,
// c'est combien de connexions sur l'appareil ? WEBSOCKETS_SERVER_CLIENT_MAX=10 ne compte que le
// pool WebSocket (port 8080) ; il ignore les connexions HTTP que le même onglet ouvre EN
// PARALLÈLE sur les serveurs 80 (UI), 8081 (API REST) et 8082 (OTA synchrone). Or c'est le total
// simultané qui pèse sur le tas, chaque connexion coûtant un AsyncClient + une AsyncWebServerRequest
// + ses tampons d'émission, tous pris sur le tas et tous susceptibles de couper la seule région
// qui porte du libre (cf. l'enquête ERR_GIT_LOW_HEAP et ConfigSettings::dumpHeapBlocks()).
//
// POURQUOI UN RECENSEMENT lwIP ET PAS DES COMPTEURS D'ÉVÈNEMENTS. Compter dans nos handlers (ou
// dans un middleware ESPAsyncWebServer) ne verrait que les connexions qui vont jusqu'à une requête
// complète. Manqueraient : les connexions spéculatives que les navigateurs ouvrent d'avance sans
// jamais s'en servir, celles rejetées avant parsing, et surtout les TIME_WAIT laissés derrière par
// chaque réponse -- ESPAsyncWebServer 3.6.0 répond systématiquement `Connection: close` et ferme
// après CHAQUE réponse (cf. AsyncWebServerRequest::_onAck), donc un chargement de page laisse
// autant de TIME_WAIT que de fichiers servis. Un recensement direct des listes de PCB lwIP voit
// tout cela, sans dépendre d'un chemin de code particulier.
//
// SÛRETÉ. Les listes tcp_active_pcbs/tcp_tw_pcbs appartiennent à la tâche tcpip et sont modifiées
// par elle sans verrou (CONFIG_LWIP_TCPIP_CORE_LOCKING n'est PAS activé dans le paquet Arduino
// ESP32 6.8.1 : LOCK_TCPIP_CORE() y est un no-op, les parcourir depuis loopTask serait une lecture
// de liste chaînée en cours de mutation). Le parcours s'exécute donc SUR la tâche tcpip, via
// tcpip_api_call() -- le même mécanisme qu'utilise AsyncTCP pour tous ses appels tcp_*. Il ne fait
// que compter dans une structure : aucune sortie série, aucune allocation, quelques microsecondes.
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
