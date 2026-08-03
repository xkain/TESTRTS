#ifndef webradiocommands_h
#define webradiocommands_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Commandes RF Somfy (protocole/transceiver) : /shadeCommand, /groupCommand, /tiltCommand,
// /repeatCommand, /setPositions, /setSensor, /setMyPosition, /setRollingCode, /setPaired,
// /unpairShade, /linkRepeater, /unlinkRepeater, /unlinkRemote, /linkRemote, /sendRemoteCommand,
// /beginFrequencyScan, /endFrequencyScan, /saveRadio, /getRadio.
// handleShadeCommand/handleGroupCommand/handleTiltCommand/handleRepeatCommand/handleSetPositions/
// handleSetSensor sont exposées séparément car mirrorées telles quelles sur apiServer (port 8081)
// dans Web::begin(), en plus de leur enregistrement via registerRoutes() sur le serveur principal.
namespace WebRadioCommands {
  void handleShadeCommand(AsyncWebServerRequest *request);
  void handleGroupCommand(AsyncWebServerRequest *request);
  void handleTiltCommand(AsyncWebServerRequest *request);
  void handleRepeatCommand(AsyncWebServerRequest *request);
  void handleSetPositions(AsyncWebServerRequest *request);
  void handleSetSensor(AsyncWebServerRequest *request);
  void registerRoutes(AsyncWebServer &server);
}
#endif
