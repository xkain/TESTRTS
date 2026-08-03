#ifndef websystem_h
#define websystem_h
#include <WebServer.h>

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
}
#endif
