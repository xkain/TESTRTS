#ifndef websystem_h
#define websystem_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Système / Firmware / OTA / Backup / découverte réseau : /controller, /getReleases,
// /downloadFirmware, /cancelFirmware, /updateFirmware, /updateShadeConfig, /updateApplication,
// /reboot, /recoverFilesystem, /backup, /restore, /discovery, /upnp.xml.
// handleDiscovery/handleController/handleDownloadFirmware/handleBackup/handleReboot sont exposées
// séparément car mirrorées telles quelles sur apiServer (port 8081) dans Web::begin(), en plus de
// leur enregistrement via registerRoutes() sur le serveur principal.
namespace WebSystem {
  void handleDiscovery(AsyncWebServerRequest *request);
  void handleController(AsyncWebServerRequest *request);
  void handleDownloadFirmware(AsyncWebServerRequest *request);
  void handleBackup(AsyncWebServerRequest *request, bool attach = false);
  void handleReboot(AsyncWebServerRequest *request);
  void registerRoutes(AsyncWebServer &server);
}
#endif
