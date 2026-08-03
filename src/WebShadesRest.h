#ifndef webshadesrest_h
#define webshadesrest_h
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// CRUD Rooms/Shades/Groups/Schedules : listes, get/save/add/delete par id, tri (sortOrder),
// options de groupe, liaison/déliaison volet<->groupe.
// handleGetRooms/handleGetShades/handleGetGroups/handleGetSchedules/handleRoom/handleShade/
// handleGroup/handleSchedule sont exposées séparément car mirrorées telles quelles sur apiServer
// (port 8081) dans Web::begin(), en plus de leur enregistrement via registerRoutes() sur le
// serveur principal.
namespace WebShadesRest {
  void handleGetRooms(WebServer &server);
  void handleGetShades(WebServer &server);
  void handleGetGroups(WebServer &server);
  void handleGetSchedules(WebServer &server);
  void handleRoom(WebServer &server);
  void handleShade(WebServer &server);
  void handleGroup(WebServer &server);
  void handleSchedule(WebServer &server);
  void registerRoutes(WebServer &server);

  // Surcharges ESPAsyncWebServer (étape 5 migration) : coexistent avec les versions WebServer&
  // jusqu'à la bascule finale de Web.cpp::begin() (cf. Web.h). Non câblées pour l'instant.
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
