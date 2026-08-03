#ifndef webshadesrest_h
#define webshadesrest_h
#include <WebServer.h>

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
}
#endif
