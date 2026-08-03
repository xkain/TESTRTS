#ifndef webnetwork_h
#define webnetwork_h
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Réseau / WiFi / Ethernet / MQTT / réglages généraux : /scanaps, /setgeneral, /setNetwork,
// /setIP, /connectwifi, /modulesettings, /networksettings, /connectmqtt, /mqttsettings.
// Uniquement enregistrées sur le serveur principal (port 80) -- pas de mirroring sur apiServer.
namespace WebNetwork {
  void registerRoutes(WebServer &server);
  // Surcharge ESPAsyncWebServer (étape 5 migration) : coexiste avec registerRoutes(WebServer&)
  // jusqu'à la bascule finale de Web.cpp::begin() (cf. Web.h). Non câblée pour l'instant.
  void registerRoutes(AsyncWebServer &server);
}
#endif
