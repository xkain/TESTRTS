// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef webshadesrest_h
#define webshadesrest_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// CRUD Rooms/Shades/Groups/Schedules : listes, get/save/add/delete par id, tri (sortOrder),
// options de groupe, liaison/déliaison équipement<->groupe.
// Les neuf handlers déclarés ci-dessous le sont parce que Web::begin() les mirrore sur apiServer
// (8081), en plus de registerRoutes() sur le serveur principal -- /room, /shade, /group et /schedule
// y sont limitées à GET, alors qu'elles acceptent aussi PUT/POST sur le port 80.
// handleSaveSchedule est la seule des quatre handleSave* dans ce cas : /saveRoom, /saveShade et
// /saveGroup restent strictement internes à ce fichier.
namespace WebShadesRest {
  void handleGetRooms(AsyncWebServerRequest *request);
  void handleGetShades(AsyncWebServerRequest *request);
  void handleGetGroups(AsyncWebServerRequest *request);
  void handleGetSchedules(AsyncWebServerRequest *request);
  void handleRoom(AsyncWebServerRequest *request);
  void handleShade(AsyncWebServerRequest *request);
  void handleGroup(AsyncWebServerRequest *request);
  void handleSchedule(AsyncWebServerRequest *request);
  void handleSaveSchedule(AsyncWebServerRequest *request);
  void registerRoutes(AsyncWebServer &server);
}
#endif
