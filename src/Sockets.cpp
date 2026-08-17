#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsServer.h>
#include <esp_task_wdt.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "Sockets.h"
#include "ConfigSettings.h"
#include "somfy/Somfy.h"
#include "Network.h"
#include "GitOTA.h"

extern ConfigSettings settings;
extern Network net;
extern SomfyShadeController somfy;
extern SocketEmitter sockEmit;
extern GitUpdater git;


WebSocketsServer sockServer = WebSocketsServer(8080);

static char g_response[SOCK_MAX_RESPONSE];

// --- Émission différée hors tâche principale (audit heap WebSockets/AsyncTCP/ESPAsyncWebServer,
// --- 17/08/2026) ---
//
// PROBLÈME CORRIGÉ ICI. L'émission d'un évènement se termine par un sendTXT()/broadcastTXT(), donc
// par WebSockets::write() (links2004) : une boucle d'attente ACTIVE bornée seulement par
// WEBSOCKETS_TCP_TIMEOUT (5000 ms), qui tourne tant que le client ne libère pas sa fenêtre TCP
// (onglet en arrière-plan, Wi-Fi qui retransmet...). Cette I/O s'exécutait à l'intérieur de la
// section critique g_sockMutex, prise par beginEmit() et rendue par endEmit()/endEmitRoom().
// Conséquence : la tâche async_tcp -- qui émet elle aussi (un handler /shadeCommand appelle
// shade->moveToTarget(), lequel émet, cf. SomfyPositioning.cpp ; idem addShade/addRoom via
// SomfyRegistry.cpp) -- pouvait rester bloquée plusieurs secondes, soit à ATTENDRE le verrou, soit
// à exécuter elle-même cette I/O lente une fois le verrou obtenu. Or chaque évènement lwIP survenu
// pendant qu'async_tcp est bloquée est un malloc() individuel empilé dans _async_queue (AsyncTCP
// 3.3.2), les paquets LWIP_TCP_RECV épinglant de surcroît leur pbuf : un seul client WebSocket lent
// suffisait donc à générer une bouffée d'allocations dispersées -- exactement la signature de
// fragmentation recherchée par l'audit heap.
//
// SOLUTION. Seule la tâche principale parle désormais à sockServer. Toute émission provenant d'une
// autre tâche (async_tcp, tâche d'évènements Arduino/WiFi via Network::setConnected()) est composée
// dans un emplacement dédié -- son PROPRE tampon, donc aucun partage avec g_response -- puis publiée
// et envoyée par drainDeferred() au tour de boucle suivant. Les tâches non principales ne prennent
// jamais g_sockMutex et n'exécutent jamais d'I/O réseau : leur temps d'exécution dans beginEmit()/
// endEmit() est borné à quelques microsecondes, quel que soit l'état des clients.
//
// L'API ne change pas : beginEmit() rend toujours un JsonSockEvent* sur lequel l'appelant compose
// normalement, et chaque site d'appel garde son endEmit()/endEmitRoom() -- aucun des ~20 sites
// existants n'a eu à être modifié.
//
// Ce qui N'EST PAS corrigé ici : la tâche principale, elle, peut toujours passer jusqu'à 5 s dans
// write() sur un client bloqué (comportement historique inchangé), et la bibliothèque ne nourrit
// pas le watchdog pendant ce temps. C'est un risque distinct, sur une tâche qui n'a pas d'effet de
// bord mémoire comparable à celui d'async_tcp.
static sock_defer_slot_t g_deferSlots[SOCK_DEFER_SLOTS];

// Repli quand les 4 emplacements sont occupés : l'appelant reçoit un objet qui accepte toutes les
// écritures et n'en conserve aucune (cf. JsonSockEvent::beginDiscard). Partagé entre tâches sans
// verrou, ce qui est sûr parce qu'en mode puits _safecat() court-circuite AVANT toute écriture de
// tampon -- l'objet n'est jamais lu ni émis, seuls quelques champs scratch hérités peuvent être
// écrits de façon concurrente, sans conséquence observable.
static JsonSockEvent g_discardSink;
static uint32_t g_droppedEmits = 0;

// Tâche autorisée à dialoguer avec sockServer, capturée dans begin() (appelée depuis setup() via
// Network::setup(), donc la tâche principale). Tout le reste passe par la file différée.
static TaskHandle_t g_emitTask = nullptr;
static inline bool onEmitTask() { return xTaskGetCurrentTaskHandle() == g_emitTask; }

// Protège UNIQUEMENT l'allocation d'un emplacement (quelques instructions, jamais d'I/O) -- à ne
// pas confondre avec g_sockMutex, qui couvre sockServer et g_response sur la tâche principale.
static portMUX_TYPE g_deferMux = portMUX_INITIALIZER_UNLOCKED;

static sock_defer_slot_t *acquireDeferSlot() {
  sock_defer_slot_t *slot = nullptr;
  portENTER_CRITICAL(&g_deferMux);
  for(uint8_t i = 0; i < SOCK_DEFER_SLOTS; i++) {
    if(g_deferSlots[i].state == SOCK_SLOT_FREE) {
      g_deferSlots[i].state = SOCK_SLOT_COMPOSING;
      g_deferSlots[i].owner = (void *)xTaskGetCurrentTaskHandle();
      slot = &g_deferSlots[i];
      break;
    }
  }
  portEXIT_CRITICAL(&g_deferMux);
  return slot;
}

// Retrouve l'emplacement que la tâche courante est en train de composer. Sans état par tâche : une
// tâche donnée n'a jamais plus d'une composition différée en cours (beginEmit -> endEmit est une
// séquence linéaire, sans imbrication hors tâche principale).
static sock_defer_slot_t *currentDeferSlot() {
  void *self = (void *)xTaskGetCurrentTaskHandle();
  for(uint8_t i = 0; i < SOCK_DEFER_SLOTS; i++) {
    if(g_deferSlots[i].state == SOCK_SLOT_COMPOSING && g_deferSlots[i].owner == self)
      return &g_deferSlots[i];
  }
  return nullptr;
}

// Protège sockServer / g_response / SocketEmitter::json contre les accès concurrents : aujourd'hui
// tout tourne sur la même tâche (aucun effet), mais après migration ESPAsyncWebServer les handlers
// Web s'exécuteront sur la tâche async_tcp pendant que loop() (RF, planification, git.loop()...)
// continue sur la tâche principale. Récursif car loop() -> initClients() -> emitState()/emitSockets()
// rappellent beginEmit()/endEmit() depuis la MÊME tâche. Le verrou est pris dans beginEmit() et rendu
// dans endEmit()/endEmitRoom() (section critique tenue à travers l'appelant, le temps que celui-ci
// construise le JSON via les méthodes de JsonSockEvent) -- tout site d'appel doit donc impérativement
// faire correspondre chaque beginEmit() à un endEmit()/endEmitRoom(), sur tous les chemins.
static SemaphoreHandle_t g_sockMutex = xSemaphoreCreateRecursiveMutex();

bool room_t::isJoined(uint8_t num) {
  for(uint8_t i = 0; i < sizeof(this->clients); i++) { 
    if(this->clients[i] == num) return true; 
  } 
  return false; 
}
bool room_t::join(uint8_t num) {
  if(this->isJoined(num)) return true; 
  for(uint8_t i = 0; i < sizeof(this->clients); i++) { 
    if(this->clients[i] == 255) { 
      this->clients[i] = num; 
      return true; 
    } 
  }
  return false;  
}
bool room_t::leave(uint8_t num) { 
  if(!this->isJoined(num)) return false; 
  for(uint8_t i = 0; i < sizeof(this->clients); i++) { 
    if(this->clients[i] == num) this->clients[i] = 255; 
  } 
  return true;
}
void room_t::clear() {
  memset(this->clients, 255, sizeof(this->clients));
}
uint8_t room_t::activeClients() {
  uint8_t n = 0;
  for(uint8_t i = 0; i < sizeof(this->clients); i++) {
    if(this->clients[i] != 255) n++;
  }
  return n;
}
/*********************************************************************
 * ClientSocketEvent class members
 ********************************************************************/
/*
void ClientSocketEvent::prepareMessage(const char *evt, const char *payload) {
  if(strlen(payload) + 5 >= sizeof(this->msg)) Serial.printf("Socket buffer overflow %d > 2048\n", strlen(payload) + 5 + strlen(evt));
    snprintf(this->msg, sizeof(this->msg), "42[%s,%s]", evt, payload);
}
void ClientSocketEvent::prepareMessage(const char *evt, JsonDocument &doc) {
  memset(this->msg, 0x00, sizeof(this->msg));
  snprintf(this->msg, sizeof(this->msg), "42[%s,", evt);
  serializeJson(doc, &this->msg[strlen(this->msg)], sizeof(this->msg) - strlen(this->msg) - 2);
  strcat(this->msg, "]");
}
*/

/*********************************************************************
 * SocketEmitter class members
 ********************************************************************/
void SocketEmitter::startup() {
  
}
void SocketEmitter::begin() {
  // Sentinelle 255 = "libre" pour room_t::clients/newClients (cf. Sockets.h) : les tailles sont
  // désormais dérivées de WEBSOCKETS_SERVER_CLIENT_MAX, donc plus d'initialiseur en ligne fiable
  // sur ces tableaux -- memset explicite ici, seul point d'entrée réel au démarrage (startup()
  // ci-dessus n'est appelée par aucun code).
  memset(this->newClients, 255, sizeof(this->newClients));
  for(uint8_t i = 0; i < SOCK_MAX_ROOMS; i++) this->rooms[i].clear();
  // Capture de la tâche propriétaire de sockServer : begin() est appelée depuis Network::setup(),
  // donc depuis setup(), donc sur la tâche principale. Toute émission venant d'ailleurs sera
  // différée (cf. le commentaire sur l'émission différée en tête de ce fichier). À faire AVANT
  // sockServer.begin() : dès celui-ci, des évènements peuvent survenir.
  g_emitTask = xTaskGetCurrentTaskHandle();
  sockServer.begin();
  sockServer.enableHeartbeat(20000, 10000, 3);
  sockServer.onEvent(this->wsEvent);
  Serial.println("Socket Server Started...");
  //settings.printAvailHeap();
}
void SocketEmitter::loop() {
  // Garde indispensable au modèle "sockServer n'appartient qu'à la tâche principale" : cette
  // fonction est aussi atteinte depuis Network::emitSockets(), elle-même appelée par
  // Network::setConnected() -- qui s'exécute sur la tâche d'évènements Arduino/WiFi
  // (WiFi.onEvent(), cf. Network::networkEvent). Sans ce garde-fou, ce chemin appellerait
  // sockServer.loop() depuis une tâche tierce, rétablissant très exactement l'accès concurrent que
  // l'émission différée supprime. Ne rien faire est sans conséquence : la tâche principale draine
  // et pompe le serveur à chaque tour de boucle.
  if(!onEmitTask()) return;
  xSemaphoreTakeRecursive(g_sockMutex, portMAX_DELAY);
  this->initClients();
  // Avant sockServer.loop() : les trames composées par les autres tâches partent au plus tôt, sans
  // attendre un tour de boucle supplémentaire.
  this->drainDeferred();
  sockServer.loop();
  xSemaphoreGiveRecursive(g_sockMutex);
}
JsonSockEvent *SocketEmitter::beginEmit(const char *evt) {
  // Hors tâche principale : composition dans un emplacement dédié, sans verrou ni I/O -- cf. le
  // commentaire détaillé sur l'émission différée en tête de ce fichier.
  if(!onEmitTask()) {
    sock_defer_slot_t *slot = acquireDeferSlot();
    if(!slot) {
      // Tous les emplacements occupés : l'évènement est abandonné plutôt que d'attendre (attendre
      // reviendrait à réintroduire exactement le blocage que ce mécanisme supprime). Perte
      // acceptable : les émissions concernées sont des états qu'une émission ultérieure réactualise,
      // ou des échos d'évènement dont la disparition est cosmétique.
      g_droppedEmits++;
      if((g_droppedEmits % 50) == 1)
        Serial.printf("Emission socket differee abandonnee (aucun emplacement libre, total %lu)\n",
          (unsigned long)g_droppedEmits);
      g_discardSink.beginDiscard();
      return &g_discardSink;
    }
    slot->json.beginEvent(&sockServer, evt, slot->buf, sizeof(slot->buf));
    return &slot->json;
  }
  // Rendu par endEmit()/endEmitRoom() -- voir le commentaire sur g_sockMutex.
  xSemaphoreTakeRecursive(g_sockMutex, portMAX_DELAY);
  this->json.beginEvent(&sockServer, evt, g_response, sizeof(g_response));
  return &this->json;
}
void SocketEmitter::endEmit(uint8_t num) {
  if(!onEmitTask()) {
    sock_defer_slot_t *slot = currentDeferSlot();
    // Pas d'emplacement : beginEmit() avait renvoyé le puits, il n'y a rien à publier.
    if(!slot) return;
    slot->json.closeEvent();
    slot->num = num;
    slot->room = -1;
    slot->state = SOCK_SLOT_READY;   // publication : à partir d'ici, l'emplacement appartient au drainage
    return;
  }
  this->json.endEvent(num);
  sockServer.loop();
  xSemaphoreGiveRecursive(g_sockMutex);
}
void SocketEmitter::endEmitRoom(uint8_t room) {
  if(!onEmitTask()) {
    sock_defer_slot_t *slot = currentDeferSlot();
    if(!slot) return;
    slot->json.closeEvent();
    slot->num = 255;
    slot->room = (room < SOCK_MAX_ROOMS) ? (int8_t)room : -1;
    slot->state = SOCK_SLOT_READY;
    return;
  }
  if(room < SOCK_MAX_ROOMS) {
    room_t *r = &this->rooms[room];
    for(uint8_t i = 0; i < sizeof(r->clients); i++) {
      if(r->clients[i] != 255) this->json.endEvent(r->clients[i]);
    }
  }
  xSemaphoreGiveRecursive(g_sockMutex);
}
void SocketEmitter::drainDeferred() {
  // Tâche principale exclusivement (appelée depuis loop(), sous g_sockMutex) : c'est le seul endroit
  // où le contenu composé ailleurs atteint sockServer.
  for(uint8_t i = 0; i < SOCK_DEFER_SLOTS; i++) {
    sock_defer_slot_t *slot = &g_deferSlots[i];
    if(slot->state != SOCK_SLOT_READY) continue;
    if(slot->room >= 0 && slot->room < SOCK_MAX_ROOMS) {
      room_t *r = &this->rooms[slot->room];
      for(uint8_t c = 0; c < sizeof(r->clients); c++) {
        if(r->clients[c] != 255) slot->json.sendComposed(&sockServer, r->clients[c]);
      }
    }
    else slot->json.sendComposed(&sockServer, slot->num);
    slot->owner = nullptr;
    slot->state = SOCK_SLOT_FREE;   // libération : l'emplacement redevient disponible
  }
}
uint8_t SocketEmitter::activeClients(uint8_t room) {
  if(room < SOCK_MAX_ROOMS) return this->rooms[room].activeClients();
  return 0;
}
void SocketEmitter::initClients() {
  for(uint8_t i = 0; i < sizeof(this->newClients); i++) {
    uint8_t num = this->newClients[i];
    if(num != 255) {
      if(sockServer.clientIsConnected(num)) {
        DBG_PRINTF("Initializing Socket Client %u\n", num);
        esp_task_wdt_reset();
        settings.emitSockets(num);
        somfy.emitState(num);
        git.emitUpdateCheck(num);
        net.emitSockets(num);
        esp_task_wdt_reset();
      }
      this->newClients[i] = 255;
    }
  }
}
void SocketEmitter::delayInit(uint8_t num) {
  for(uint8_t i=0; i < sizeof(this->newClients); i++) {
    if(this->newClients[i] == num) break;
    else if(this->newClients[i] == 255) {
      this->newClients[i] = num;
      break;
    }
  }
}
void SocketEmitter::end() {
  xSemaphoreTakeRecursive(g_sockMutex, portMAX_DELAY);
  sockServer.close();
  for(uint8_t i = 0; i < SOCK_MAX_ROOMS; i++)
    this->rooms[i].clear();
  xSemaphoreGiveRecursive(g_sockMutex);
}
void SocketEmitter::disconnect() {
  xSemaphoreTakeRecursive(g_sockMutex, portMAX_DELAY);
  sockServer.disconnect();
  xSemaphoreGiveRecursive(g_sockMutex);
}
void SocketEmitter::wsEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
    switch(type) {
        case WStype_ERROR:
            if(length > 0)
              Serial.printf("Socket Error: %s\n", payload);
            else
              Serial.println("Socket Error: \n");
            break;
        case WStype_DISCONNECTED:
            if(length > 0)
              DBG_PRINTF("Socket [%u] Disconnected!\n [%s]", num, payload);
            else
              DBG_PRINTF("Socket [%u] Disconnected!\n", num);
            for(uint8_t i = 0; i < SOCK_MAX_ROOMS; i++) {
              sockEmit.rooms[i].leave(num);
            }
            // Les emplacements du pool sont RÉUTILISÉS : sans cette remise à zéro, le prochain
            // client à occuper cet emplacement hériterait des échecs d'émission du précédent et se
            // ferait éjecter prématurément. Cf. sendFrameFanOut() dans WResp.cpp.
            resetSockWriteFailures(num);
            break;
        case WStype_CONNECTED:
            {
                IPAddress ip = sockServer.remoteIP(num);
                // Repartir d'un compteur d'échecs vierge : cf. le commentaire sur WStype_DISCONNECTED
                // ci-dessus (emplacements réutilisés).
                resetSockWriteFailures(num);
                DBG_PRINTF("Socket [%u] Connected from %d.%d.%d.%d url: %s\n", num, ip[0], ip[1], ip[2], ip[3], payload);
                // Send all the current shade settings to the client.
                sockServer.sendTXT(num, "Connected");
                //sockServer.loop();
                sockEmit.delayInit(num);
            }
            break;
        case WStype_TEXT:
            if(strncmp((char *)payload, "join:", 5) == 0) {
              // In this instance the client wants to join a room.  Let's do some
              // work to get the ordinal of the room that the client wants to join.
              uint8_t roomNum = atoi((char *)&payload[5]);
              DBG_PRINTF("Client %u joining room %u\n", num, roomNum);
              if(roomNum < SOCK_MAX_ROOMS) sockEmit.rooms[roomNum].join(num);
            }
            else if(strncmp((char *)payload, "leave:", 6) == 0) {
              uint8_t roomNum = atoi((char *)&payload[6]);
              DBG_PRINTF("Client %u leaving room %u\n", num, roomNum);
              if(roomNum < SOCK_MAX_ROOMS) sockEmit.rooms[roomNum].leave(num);
            }
            else {
              DBG_PRINTF("Socket [%u] text: %s\n", num, payload);
            }
            // send message to client
            // webSocket.sendTXT(num, "message here");

            // send data to all connected clients
            // sockServer.broadcastTXT("message here");
            break;
        case WStype_BIN:
            DBG_PRINTF("[%u] get binary length: %u\n", num, length);
            //hexdump(payload, length);

            // send message to client
            // sockServer.sendBIN(num, payload, length);
            break;
        case WStype_PONG:
            //Serial.printf("Pong from %u\n", num);
            break;
        case WStype_PING:
            //Serial.printf("Ping from %u\n", num);
            break;
        default:
            break;
    }  
}
