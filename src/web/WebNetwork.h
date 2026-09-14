// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef webnetwork_h
#define webnetwork_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Réseau / WiFi / Ethernet / MQTT / réglages généraux : /scanaps, /setgeneral, /setNetwork,
// /setIP, /connectwifi, /modulesettings, /networksettings, /connectmqtt, /mqttsettings.
// Uniquement enregistrées sur le serveur principal (port 80) -- pas de mirroring sur apiServer.
namespace WebNetwork {
  void registerRoutes(AsyncWebServer &server);
}
#endif
