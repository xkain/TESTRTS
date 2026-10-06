// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef websystem_h
#define websystem_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Système / Firmware / OTA / Backup / découverte réseau. registerRoutes() enregistre sur le serveur
// principal : /upnp.xml, /controller, /cancelFirmware, /backup, /restore, /updateFirmware,
// /updateShadeConfig, /updateApplication, /reboot, /recoverFilesystem.
// Les cinq handlers déclarés ci-dessous le sont parce que Web::begin() les mirrore sur apiServer
// (8081) -- /controller, /backup et /reboot en plus du serveur principal, /discovery et
// /downloadFirmware UNIQUEMENT là (cf. WebSystem.cpp, fin de registerRoutes). /getReleases n'est pas
// servie par ce module : elle vit dans WebGitSync.cpp, sur son port dédié.
namespace WebSystem {
  void handleDiscovery(AsyncWebServerRequest *request);
  void handleController(AsyncWebServerRequest *request);
  void handleDownloadFirmware(AsyncWebServerRequest *request);
  void handleBackup(AsyncWebServerRequest *request, bool attach = false);
  void handleReboot(AsyncWebServerRequest *request);
  void registerRoutes(AsyncWebServer &server);
}
#endif
