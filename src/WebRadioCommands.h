#ifndef webradiocommands_h
#define webradiocommands_h
#include <WebServer.h>

// Commandes RF Somfy (protocole/transceiver) : /shadeCommand, /groupCommand, /tiltCommand,
// /repeatCommand, /setPositions, /setSensor, /setMyPosition, /setRollingCode, /setPaired,
// /unpairShade, /linkRepeater, /unlinkRepeater, /unlinkRemote, /linkRemote, /sendRemoteCommand,
// /beginFrequencyScan, /endFrequencyScan, /saveRadio, /getRadio.
// handleShadeCommand/handleGroupCommand/handleTiltCommand/handleRepeatCommand/handleSetPositions/
// handleSetSensor sont exposées séparément car mirrorées telles quelles sur apiServer (port 8081)
// dans Web::begin(), en plus de leur enregistrement via registerRoutes() sur le serveur principal.
namespace WebRadioCommands {
  void handleShadeCommand(WebServer &server);
  void handleGroupCommand(WebServer &server);
  void handleTiltCommand(WebServer &server);
  void handleRepeatCommand(WebServer &server);
  void handleSetPositions(WebServer &server);
  void handleSetSensor(WebServer &server);
  void registerRoutes(WebServer &server);
}
#endif
