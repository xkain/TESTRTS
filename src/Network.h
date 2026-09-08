#ifndef Network_h
#define Network_h

#include <Arduino.h>
#include <atomic>

#define CONNECT_TIMEOUT 20000
#define SSID_SCAN_INTERVAL 30000

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
