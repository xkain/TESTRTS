#ifndef webauth_h
#define webauth_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Authentification et contexte de session : /login, /loginContext, /getSecurity, /saveSecurity.
// handleLogin est exposée séparément car mirrorée telle quelle sur apiServer (port 8081) dans
// Web::begin(), en plus de son enregistrement via registerRoutes() sur le serveur principal.
namespace WebAuth {
  void handleLogin(AsyncWebServerRequest *request);
  void registerRoutes(AsyncWebServer &server);
}
#endif
