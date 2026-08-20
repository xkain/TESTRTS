#include <Arduino.h>
#include <esp_heap_caps.h>
#include <esp_task_wdt.h>
#include "lwip/priv/tcp_priv.h"
#include "lwip/priv/tcpip_priv.h"
#include "ConfigSettings.h"
#include "Sockets.h"
#include "DiagConn.h"

extern ConfigSettings settings;
extern SocketEmitter sockEmit;

// Ordre des colonnes du relevé. 80 = UI (ESPAsyncWebServer), 8081 = API REST (seconde instance
// AsyncWebServer), 8082 = serveur synchrone des opérations OTA GitHub (cf. WebGitSync.cpp),
// 8080 = WebSocket temps réel (links2004, cf. Sockets.cpp). Un onglet ouvert sur l'UI les touche
// tous les quatre, et c'est précisément ce cumul que la limite WEBSOCKETS_SERVER_CLIENT_MAX ne dit
// pas.
const uint16_t DiagConn::ports[DIAGCONN_PORTS] = {80, 8081, 8082, 8080};

// Cadence d'échantillonnage. 1 s : assez fin pour attraper la bouffée de connexions d'un
// chargement de page (qui dure 1 à 3 s), assez lâche pour que le coût -- un aller-retour vers la
// tâche tcpip -- reste négligeable devant le reste de la boucle.
#define DIAGCONN_TICK_MS 1000
// Plancher entre deux lignes "composition changée" : pendant un chargement de page la composition
// bouge à chaque paquet, sans quoi le journal deviendrait illisible au moment précis où on veut le
// lire.
#define DIAGCONN_MIN_GAP_MS 500
// Battement de fond, pour qu'un palier stable laisse quand même une trace horodatée dans le
// journal (c'est elle qui sert de niveau de référence du palier).
#define DIAGCONN_HEARTBEAT_MS 30000
// Nombre d'adresses distantes distinctes suivies. Au-delà on cesse de compter : la mesure vise à
// distinguer "un poste avec quatre onglets" de "quatre postes", pas à inventorier un réseau.
#define DIAGCONN_MAX_PEERS 8

typedef struct {
  struct tcpip_api_call_data call;
  conn_census_t *out;
} census_call_t;

// S'exécute SUR la tâche tcpip (cf. le commentaire d'en-tête de DiagConn.h) : c'est la seule
// façon sûre de parcourir ces listes sans verrouillage de cœur lwIP. Ne fait que compter.
static err_t diagCensusApi(struct tcpip_api_call_data *msg) {
  census_call_t *c = (census_call_t *)msg;
  conn_census_t *out = c->out;
  ip_addr_t seen[DIAGCONN_MAX_PEERS];
  for(struct tcp_pcb *pcb = tcp_active_pcbs; pcb != NULL; pcb = pcb->next) {
    out->activeTotal++;
    int8_t idx = -1;
    for(uint8_t i = 0; i < DIAGCONN_PORTS; i++)
      if(pcb->local_port == DiagConn::ports[i]) { idx = (int8_t)i; break; }
    if(idx < 0) {
      // Port local non surveillé : ce sont nos connexions SORTANTES (GitHub, MQTT, NTP), qui
      // portent elles aussi un coût mémoire -- d'où leur comptage séparé plutôt que leur omission.
      if(pcb->state == ESTABLISHED) out->otherPort++;
    }
    else if(pcb->state == ESTABLISHED) out->est[idx]++;
    else out->transit[idx]++;
    if(out->peers < DIAGCONN_MAX_PEERS) {
      bool known = false;
      for(uint8_t i = 0; i < out->peers; i++)
        if(ip_addr_cmp(&seen[i], &pcb->remote_ip)) { known = true; break; }
      if(!known) { seen[out->peers] = pcb->remote_ip; out->peers++; }
    }
  }
  // Liste séparée dans lwIP, et pas un état de tcp_active_pcbs. Elle mérite sa propre colonne :
  // ESPAsyncWebServer fermant après chaque réponse, c'est le sous-produit direct du nombre de
  // requêtes servies, et il persiste 2*MSL bien après que l'onglet a fini de charger.
  for(struct tcp_pcb *pcb = tcp_tw_pcbs; pcb != NULL; pcb = pcb->next) out->timeWait++;
  return ERR_OK;
}

bool DiagConn::snapshot(conn_census_t *census) {
  memset(census, 0, sizeof(conn_census_t));
  // Une connexion (au minimum le PCB en écoute des serveurs) suffit à prouver que la pile est
  // montée ; avant cela le relevé n'aurait aucun sens et on le marque invalide.
  if(xTaskGetHandle("tiT") == NULL) return false;
  census_call_t msg;
  msg.out = census;
  // Reset HORS branche, des deux côtés de l'appel : tcpip_api_call() attend sur un sémaphore que
  // la tâche tcpip ait traité le message, sans délai maximal. L'attente est très courte en
  // pratique (le parcours est en microsecondes) mais elle n'est pas bornée par construction --
  // même précaution que pour les autres attentes réseau de loopTask.
  esp_task_wdt_reset();
  err_t err = tcpip_api_call(diagCensusApi, (struct tcpip_api_call_data *)&msg);
  esp_task_wdt_reset();
  if(err != ERR_OK) return false;
  census->wsClients = sockEmit.connectedClients();
  census->valid = true;
  return true;
}

// Pics accumulés depuis le démarrage ou depuis le dernier resetPeaks(). Ce sont eux qui portent la
// réponse : le coût d'un client ne se lit pas sur un état au repos (où tout est refermé) mais sur
// le PIRE instant du chargement, c'est-à-dire le moment où le plus gros bloc contigu touche son
// plancher.
static uint16_t s_peakEst = 0;
static uint16_t s_peakActive = 0;
static uint16_t s_peakTimeWait = 0;
static uint32_t s_peakAt = 0;
static uint32_t s_minLargest = 0xFFFFFFFF;
static uint32_t s_minLargestAt = 0;
static uint32_t s_maxAllocBlocks = 0;

void DiagConn::resetPeaks() {
  s_peakEst = 0;
  s_peakActive = 0;
  s_peakTimeWait = 0;
  s_peakAt = 0;
  s_minLargest = 0xFFFFFFFF;
  s_minLargestAt = 0;
  s_maxAllocBlocks = 0;
  Serial.printf("[CONN] pics remis a zero a t=%lums\n", (unsigned long)millis());
}

static uint16_t censusEstTotal(const conn_census_t *c) {
  uint16_t total = 0;
  for(uint8_t i = 0; i < DIAGCONN_PORTS; i++) total = (uint16_t)(total + c->est[i]);
  return total;
}

static void printCensus(const char *label, const conn_census_t *c) {
  Serial.printf("[CONN] %s t=%lums ws=%u |", label, (unsigned long)millis(), (unsigned)c->wsClients);
  for(uint8_t i = 0; i < DIAGCONN_PORTS; i++)
    Serial.printf(" :%u=%u+%u", (unsigned)DiagConn::ports[i], (unsigned)c->est[i], (unsigned)c->transit[i]);
  Serial.printf(" | sortantes=%u TW=%u actifs=%u postes=%u\n",
    (unsigned)c->otherPort, (unsigned)c->timeWait, (unsigned)c->activeTotal, (unsigned)c->peers);
}

// Le tas est relu ICI, sur la tâche principale, et pas dans le recensement : mélanger les deux
// mesures dans un même instant supposé n'a déjà induit en erreur qu'une fois de trop (cf. la
// re-lecture de dumpHeapFragmentationIfLow()). Les deux lignes portent le même horodatage, ce qui
// suffit à les apparier sans prétendre à la simultanéité.
static void printHeapLine(const char *label) {
  multi_heap_info_t info;
  heap_caps_get_info(&info, MALLOC_CAP_8BIT);
  if(info.largest_free_block < s_minLargest) {
    s_minLargest = info.largest_free_block;
    s_minLargestAt = millis();
  }
  if(info.allocated_blocks > s_maxAllocBlocks) s_maxAllocBlocks = info.allocated_blocks;
  Serial.printf("[CONN] %s tas: largest=%u free=%u blocs_alloues=%u blocs_libres=%u\n",
    label, (unsigned)info.largest_free_block, (unsigned)info.total_free_bytes,
    (unsigned)info.allocated_blocks, (unsigned)info.free_blocks);
}

void DiagConn::report(const char *label, bool force) {
  (void)force;
  conn_census_t c;
  if(!DiagConn::snapshot(&c)) {
    Serial.printf("[CONN] %s : pile reseau non demarree, releve sans objet\n", label);
    return;
  }
  printCensus(label, &c);
  printHeapLine(label);
  Serial.printf("[CONN] %s pics: etablies_max=%u actifs_max=%u TW_max=%u (a t=%lums) -- largest_min=%u (a t=%lums) blocs_alloues_max=%u\n",
    label, (unsigned)s_peakEst, (unsigned)s_peakActive, (unsigned)s_peakTimeWait,
    (unsigned long)s_peakAt, (unsigned)(s_minLargest == 0xFFFFFFFF ? 0 : s_minLargest),
    (unsigned long)s_minLargestAt, (unsigned)s_maxAllocBlocks);
}

// Commandes de mesure sur la liaison série. Choisies là plutôt que sur une route HTTP parce
// qu'une route se paie une connexion de plus : l'instrument fausserait la mesure qu'il prend.
static void handleSerialCommands() {
  while(Serial.available()) {
    int ch = Serial.read();
    switch(ch) {
      case 'm':
        DiagConn::report("MARQUE", true);
        break;
      case 'M':
        DiagConn::report("MARQUE+DUMP", true);
        // Volumineux (~140 lignes) et conditionné à enableDebugLogs à l'intérieur.
        ConfigSettings::dumpHeapBlocks("marque de palier");
        break;
      case 'r':
        DiagConn::resetPeaks();
        break;
      default:
        break;   // tout le reste (CR, LF, frappe accidentelle) est ignoré sans bruit
    }
  }
}

void DiagConn::loop() {
  handleSerialCommands();
  if(!settings.enableDebugLogs) return;
  static uint32_t lastTick = 0;
  static uint32_t lastPrint = 0;
  static uint16_t lastEstTotal = 0xFFFF;
  static uint8_t lastWs = 0xFF;
  if((uint32_t)(millis() - lastTick) < DIAGCONN_TICK_MS) return;
  lastTick = millis();
  conn_census_t c;
  if(!DiagConn::snapshot(&c)) return;
  uint16_t estTotal = censusEstTotal(&c);
  if(estTotal > s_peakEst || c.activeTotal > s_peakActive) {
    if(estTotal > s_peakEst) s_peakEst = estTotal;
    if(c.activeTotal > s_peakActive) s_peakActive = c.activeTotal;
    s_peakAt = millis();
  }
  if(c.timeWait > s_peakTimeWait) s_peakTimeWait = c.timeWait;
  // Le pic de fragmentation est suivi à CHAQUE tic, pas seulement quand on imprime : c'est un
  // minimum instantané, et il tombe précisément pendant la rafale d'ouverture, là où l'échantillon
  // imprimé peut passer à côté.
  multi_heap_info_t info;
  heap_caps_get_info(&info, MALLOC_CAP_8BIT);
  if(info.largest_free_block < s_minLargest) {
    s_minLargest = info.largest_free_block;
    s_minLargestAt = millis();
  }
  if(info.allocated_blocks > s_maxAllocBlocks) s_maxAllocBlocks = info.allocated_blocks;
  bool changed = (estTotal != lastEstTotal) || (c.wsClients != lastWs);
  bool heartbeat = (uint32_t)(millis() - lastPrint) >= DIAGCONN_HEARTBEAT_MS;
  if(!heartbeat && (!changed || (uint32_t)(millis() - lastPrint) < DIAGCONN_MIN_GAP_MS)) return;
  lastEstTotal = estTotal;
  lastWs = c.wsClients;
  lastPrint = millis();
  printCensus(changed ? "composition" : "battement", &c);
  printHeapLine(changed ? "composition" : "battement");
}
