#ifndef webshadesrest_h
#define webshadesrest_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// CRUD Rooms/Shades/Groups/Schedules : listes, get/save/add/delete par id, tri (sortOrder),
// options de groupe, liaison/déliaison équipement<->groupe.
// handleGetRooms/handleGetShades/handleGetGroups/handleGetSchedules/handleRoom/handleShade/
// handleGroup/handleSchedule sont exposées séparément car mirrorées telles quelles sur apiServer
// (port 8081) dans Web::begin(), en plus de leur enregistrement via registerRoutes() sur le
// serveur principal.
namespace WebShadesRest {
  void handleGetRooms(AsyncWebServerRequest *request);
  void handleGetShades(AsyncWebServerRequest *request);
  void handleGetGroups(AsyncWebServerRequest *request);
  void handleGetSchedules(AsyncWebServerRequest *request);
  void handleRoom(AsyncWebServerRequest *request);
  void handleShade(AsyncWebServerRequest *request);
  void handleGroup(AsyncWebServerRequest *request);
  void handleSchedule(AsyncWebServerRequest *request);
  void registerRoutes(AsyncWebServer &server);
}
#endif
