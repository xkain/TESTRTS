#ifndef Network_h
#define Network_h

#include <Arduino.h>
#include <atomic>

#define CONNECT_TIMEOUT 20000
#define SSID_SCAN_INTERVAL 30000

// Temps passé sur CHAQUE canal par les scans CIBLÉS de Network::loop() -- ceux qui cherchent un
// SSID déjà connu pour en élire le meilleur BSSID (L2.2 de l'audit de performance du 26/08/2026).
// Arduino applique 300 ms par défaut, une valeur jamais choisie ; sur 14 canaux elle fixait à elle
// seule un plancher de 4,21 s, mesuré, sur le chemin du démarrage.
//
// 120 ms, en scan ACTIF. Un scan actif émet une probe request et reçoit sa réponse en quelques
// millisecondes ; 120 ms lui laissent deux ordres de grandeur de marge. La valeur ne conviendrait
// PAS à un scan passif, qui doit attendre une balise spontanée de l'AP -- 102,4 ms d'intervalle
// par défaut, davantage sur certains modèles : la marge y serait d'une seule balise, et un scan
// passif raccourci rendrait des réseaux intermittents. C'est pourquoi les deux appels de
// Network::loop() qui scannaient en passif sont passés en actif du même coup ; ils sont tous deux
// gardés par !settings.WIFI.hidden, donc aucun ne comptait sur le passif pour voir un SSID masqué.
#define WIFI_SCAN_MS_PER_CHAN 120

// Temps par canal des scans d'INVENTAIRE -- /scanaps, ssidExists(), printNetworks() : ceux qui
// veulent la liste de tout ce qui est visible, sans SSID cible.
//
// 300 ms, c'est-à-dire le défaut d'Arduino, mais posé ICI comme un choix mesuré et non plus subi.
// Descendre cette valeur à 120 comme ci-dessus a été essayé, puis REJETÉ sur mesure A/B (matériel,
// 26/08/2026, quatre appels de /scanaps par branche) :
//
//     120 ms/canal : 7,75 / 7,81 / 7,83 / 7,70 s   -> moyenne 7,77 s, très stable
//     300 ms/canal : 1,80 / 6,26 / 6,25 / 2,84 s   -> moyenne 4,29 s, bimodale
//
// Le scan court est donc presque DEUX FOIS PLUS LENT, pour un résultat identique (mêmes AP rendus).
// Le mécanisme n'est pas établi -- une piste est que `scan_time.active.min` est câblé à 100 ms par
// WiFiScanClass::scanNetworks() et qu'une fenêtre min/max étroite (100-120) empêche le pilote
// d'abréger un canal vide, là où 100-300 lui en laisse la latitude. Ce qui est certain est la
// mesure. À ne pas « optimiser » de nouveau sans rejouer ce A/B.
#define WIFI_SCAN_MS_PER_CHAN_INVENTORY 300

class Network {
protected:
  uint32_t lastEmit = 0;
  uint32_t lastMDNS = 0;
  int lastRSSI = 0;
  int lastChannel = 0;
  int linkSpeed = 0;
public:
  // Regroupement des booléens (Gain de place RAM/Alignement)
  bool _connecting = false;
  bool ethStarted = false;
  bool wifiFallback = false;
  bool openingSoftAP = false;
  // std::atomic : lus par des handlers Web (potentiellement sur la tâche async_tcp après migration
  // ESPAsyncWebServer) pendant qu'ils sont écrits ici même sur la tâche principale (net.loop()) --
  // séparés du regroupement ci-dessus car std::atomic<bool> n'est pas trivialement copiable.
  std::atomic<bool> softAPOpened{false};
  std::atomic<bool> needsBroadcast{true};

  uint32_t lastWifiScan = 0;
  conn_types_t connType = conn_types_t::unset;
  conn_types_t connTarget = conn_types_t::unset;

  bool connected();
  bool connecting();
  void clearConnecting();
  conn_types_t preferredConnType();

  char ssid[33]; // SSID max 32 car. + \0
  char mac[18];  // MAC max 17 car. + \0

  int channel;
  int strength;
  int disconnected = 0;
  int connectAttempts = 0;
  uint32_t disconnectTime = 0;
  uint32_t connectStart = 0;
  uint32_t connectTime = 0;
  uint32_t connectedAt = 0;
  // Horodatage d'ouverture du point d'accès de secours (0 = AP fermé). Distinct de connectedAt
  // qui, lui, n'est mis à jour que par setConnected() (WiFi/Ethernet) -- l'AP ne passe jamais
  // par setConnected(), d'où ce compteur dédié pour la pop-up "Durée de fonctionnement".
  uint32_t apOpenedAt = 0;

  bool openSoftAP();
  bool connect(conn_types_t ctype);
  bool connectWiFi(const uint8_t *bssid = nullptr, const int32_t channel = -1);
  bool connectWired();
  void setConnected(conn_types_t connType);
  // --- Verrou du SCAN Wi-Fi, partagé par tous ses utilisateurs (P-6/P-7, 24/08/2026) ---
  // L'ESP32 n'a qu'UN état de scan global. Trois acteurs y touchaient sans coordination :
  // /scanaps (async_tcp, scan bloquant 2-6 s), WifiSettings::ssidExists() appelé par
  // /connectwifi (async_tcp, scan bloquant lui aussi), et Network lui-même (tâche principale :
  // scanNetworks(true,...) asynchrone, scanComplete(), scanDelete()). Un mutex existait bien,
  // mais `static` LOCAL à /scanaps : il ne protégeait cette route que d'elle-même. Un
  // /connectwifi concurrent, ou le scan d'itinérance de Network::loop(), pouvaient supprimer les
  // résultats qu'un autre était en train de lire.
  //
  // `waitMs = 0` est le mode À UTILISER DEPUIS LA TÂCHE PRINCIPALE : elle ne doit JAMAIS attendre
  // derrière un scan bloquant de 2 à 6 s tenu par async_tcp -- c'est le motif « réseau bloquant
  // sur loopTask » déjà corrigé cinq fois ailleurs. L'appelant renonce simplement à son scan pour
  // ce tour ; il est de toute façon best-effort (itinérance, choix du meilleur point d'accès).
  bool lockScan(uint32_t waitMs = portMAX_DELAY);
  void unlockScan();
  bool getStrongestAP(const char *ssid, uint8_t *bssid, int32_t *channel);
  bool changeAP(const uint8_t *bssid, const int32_t channel);
  void updateHostname();
  bool setup();
  void loop();
  void end();
  void emitSockets();
  void emitSockets(uint8_t num);
  void emitHeap(uint8_t num = 255);
  uint32_t getChipId();
  static void networkEvent(WiFiEvent_t event);
};
#endif
