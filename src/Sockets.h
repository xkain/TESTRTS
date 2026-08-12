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
class SocketEmitter {
  protected:
    uint8_t newclients = 0;
    uint8_t newClients[WEBSOCKETS_SERVER_CLIENT_MAX];
    void delayInit(uint8_t num);
  public:
    JsonSockEvent json;
    //ClientSocketEvent evt;
    room_t rooms[SOCK_MAX_ROOMS];
    uint8_t activeClients(uint8_t room);
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
