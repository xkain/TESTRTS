#include <WebSocketsServer.h>
#include "web/WResp.h"
#ifndef sockets_h
#define sockets_h

#define SOCK_MAX_ROOMS 1
#define ROOM_EMIT_FRAME 0

struct room_t {
  // Taille alignée sur WEBSOCKETS_SERVER_CLIENT_MAX (cf. platformio.ini) : un littéral figé à 5
  // ici plafonnerait silencieusement l'appartenance aux rooms/la file d'init différée bien avant
  // que le pool de connexions réel ne soit plein. Pas d'initialiseur en ligne (un {255,255,255,255,255}
  // ne couvrirait que les 5 premiers octets si la macro grandit un jour, laissant le reste à 0 --
  // faux positif "déjà joint" pour le client 0) : memset(255) explicite dans
  // SocketEmitter::begin() à la place (cf. Sockets.cpp), seul point d'entrée réel au démarrage.
  uint8_t clients[WEBSOCKETS_SERVER_CLIENT_MAX];
  uint8_t activeClients();
  bool isJoined(uint8_t num);
  bool join(uint8_t num);
  bool leave(uint8_t num);
  void clear();
};
// Nombre d'émissions différées pouvant être en vol simultanément (cf. le commentaire détaillé en
// tête de Sockets.cpp). Chaque emplacement porte son PROPRE tampon de composition, d'où le coût en
// RAM statique (SOCK_DEFER_SLOTS x SOCK_MAX_RESPONSE).
// Dimensionné sur la plus longue RAFALE séquentielle observée hors tâche principale, et non sur le
// nombre de tâches : Network::setConnected() (tâche d'évènements Arduino/WiFi) enchaîne jusqu'à 4
// émissions avant que la tâche principale n'ait l'occasion de drainer -- "ethernet", puis
// emitSockets(255) qui produit lui-même wifiStrength/ethernet + emitHeap. 6 laisse une marge
// au-dessus de cette rafale tout en couvrant une émission concurrente d'async_tcp. Au-delà, les
// évènements excédentaires sont abandonnés (comptés et logués), jamais mis en attente bloquante.
#define SOCK_DEFER_SLOTS 6
// Tampon de la voie DIRECTE (g_response, tâche principale). Dimensionné par le plus gros évènement
// du firmware : "remoteFrame" et son tableau de pulses (cf. Transceiver::emitFrame).
#define SOCK_MAX_RESPONSE 2048
// Tampon d'un emplacement DIFFÉRÉ -- volontairement bien plus petit que SOCK_MAX_RESPONSE, qu'il ne
// faut pas recopier ici par symétrie apparente : les gros évènements (remoteFrame, frequencyScan)
// sont tous émis depuis la tâche principale (Transceiver, radio RX) et empruntent donc la voie
// directe. Ne transitent par un emplacement différé que les évènements des tâches async_tcp et
// évènements WiFi : états d'équipement/groupe/pièce, échos de commande, wifiStrength/ethernet/memStatus.
// Le plus volumineux est SomfyShade::emitState (~420 octets au pire : 19 champs + un nom de 20
// caractères, échappement compris) ; SomfyGroup::emitState avec ses 32 équipements liés reste en dessous.
// 768 laisse donc ~75 % de marge. Un dépassement n'est pas silencieux : JsonSockEvent lève
// _overflowed, l'évènement est abandonné et signalé sur la liaison série.
// Ce dimensionnement est direct sur la RAM statique (SOCK_DEFER_SLOTS x SOCK_DEFER_BUF, donc autant
// de retiré au tas et au plus gros bloc contigu) : à 2048 il coûtait 12 Ko, mesurés en régression
// nette de ESP.getMaxAllocHeap() sur matériel.
#define SOCK_DEFER_BUF 768

// États d'un emplacement d'émission différée. Écrits par la tâche qui compose, lus par la tâche
// principale qui draine -- `volatile` parce que la transition COMPOSING -> READY est le signal de
// publication entre les deux.
enum sock_defer_state_t : uint8_t { SOCK_SLOT_FREE = 0, SOCK_SLOT_COMPOSING = 1, SOCK_SLOT_READY = 2 };

struct sock_defer_slot_t {
  char buf[SOCK_DEFER_BUF];
  JsonSockEvent json;
  // Tâche propriétaire pendant la composition : permet à endEmit()/endEmitRoom() de retrouver
  // l'emplacement de l'appelant sans état par tâche, chaque tâche n'en composant qu'un à la fois.
  void *owner = nullptr;
  uint8_t num = 255;      // client destinataire (255 = diffusion générale)
  int8_t room = -1;       // >= 0 : émission vers une room, `num` alors ignoré
  volatile uint8_t state = SOCK_SLOT_FREE;
};

class SocketEmitter {
  protected:
    uint8_t newclients = 0;
    uint8_t newClients[WEBSOCKETS_SERVER_CLIENT_MAX];
    void delayInit(uint8_t num);
    // Draine les emplacements prêts. Appelée exclusivement depuis loop(), donc sur la tâche
    // principale : c'est elle, et elle seule, qui parle à sockServer.
    void drainDeferred();
  public:
    JsonSockEvent json;
    //ClientSocketEvent evt;
    room_t rooms[SOCK_MAX_ROOMS];
    uint8_t activeClients(uint8_t room);
    // Emplacements du pool RÉELLEMENT occupés, indépendamment de l'appartenance aux rooms que
    // compte activeClients() -- un client qui vient de se connecter et n'a pas encore émis son
    // "join:0", ou une session zombie en attente d'expiration du heartbeat, occupe un emplacement
    // sans figurer dans aucune room. C'est ce nombre-là, et pas l'autre, qu'il faut comparer à
    // WEBSOCKETS_SERVER_CLIENT_MAX (cf. DiagConn.h, audit capacité multi-clients).
    uint8_t connectedClients();
    void initClients();
    void startup();
    void begin();
    void loop();
    void end();
    void disconnect();
    JsonSockEvent * beginEmit(const char *evt);
    void endEmit(uint8_t num = 255);
    void endEmitRoom(uint8_t num);
    static void wsEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length);
};
#endif
