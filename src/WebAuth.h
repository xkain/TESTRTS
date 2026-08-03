#ifndef webauth_h
#define webauth_h
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Authentification et contexte de session : /login, /loginContext, /getSecurity, /saveSecurity.
// handleLogin est exposée séparément car mirrorée telle quelle sur apiServer (port 8081) dans
// Web::begin(), en plus de son enregistrement via registerRoutes() sur le serveur principal.
namespace WebAuth {
  void handleLogin(WebServer &server);
  void registerRoutes(WebServer &server);
  // Surcharges ESPAsyncWebServer (étape 3 migration) : coexistent avec les versions WebServer&
  // jusqu'à la bascule finale de Web.cpp::begin() (cf. Web.h). Non câblées pour l'instant.
  void handleLogin(AsyncWebServerRequest *request);
  void registerRoutes(AsyncWebServer &server);
}
#endif
