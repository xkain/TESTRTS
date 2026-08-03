#ifndef webnetwork_h
#define webnetwork_h
#include <WebServer.h>

// Réseau / WiFi / Ethernet / MQTT / réglages généraux : /scanaps, /setgeneral, /setNetwork,
// /setIP, /connectwifi, /modulesettings, /networksettings, /connectmqtt, /mqttsettings.
// Uniquement enregistrées sur le serveur principal (port 80) -- pas de mirroring sur apiServer.
namespace WebNetwork {
  void registerRoutes(WebServer &server);
}
#endif
