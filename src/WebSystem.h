#ifndef websystem_h
#define websystem_h
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Système / Firmware / OTA / Backup / découverte réseau : /controller, /getReleases,
// /downloadFirmware, /cancelFirmware, /updateFirmware, /updateShadeConfig, /updateApplication,
// /reboot, /recoverFilesystem, /backup, /restore, /discovery, /upnp.xml.
// handleDiscovery/handleController/handleDownloadFirmware/handleBackup/handleReboot sont exposées
// séparément car mirrorées telles quelles sur apiServer (port 8081) dans Web::begin(), en plus de
// leur enregistrement via registerRoutes() sur le serveur principal.
namespace WebSystem {
  void handleDiscovery(WebServer &server);
  void handleController(WebServer &server);
  void handleDownloadFirmware(WebServer &server);
  void handleBackup(WebServer &server, bool attach = false);
  void handleReboot(WebServer &server);
  void registerRoutes(WebServer &server);
  // Surcharges ESPAsyncWebServer (étape 3/4 migration) : coexistent avec les versions WebServer&
  // jusqu'à la bascule finale de Web.cpp::begin() (cf. Web.h). Non câblées pour l'instant.
  // apiServer (port 8081) reste sur WebServer pour l'instant (étape 5) -- ces surcharges ne sont
  // donc mirrorées nulle part avant la bascule finale, contrairement aux versions WebServer&.
  void handleDiscovery(AsyncWebServerRequest *request);
  void handleController(AsyncWebServerRequest *request);
  void handleDownloadFirmware(AsyncWebServerRequest *request);
  void handleBackup(AsyncWebServerRequest *request, bool attach = false);
  void handleReboot(AsyncWebServerRequest *request);
  void registerRoutes(AsyncWebServer &server);
}
#endif
