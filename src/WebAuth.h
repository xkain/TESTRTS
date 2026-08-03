#ifndef webauth_h
#define webauth_h
#include <WebServer.h>

// Authentification et contexte de session : /login, /loginContext, /getSecurity, /saveSecurity.
// handleLogin est exposée séparément car mirrorée telle quelle sur apiServer (port 8081) dans
// Web::begin(), en plus de son enregistrement via registerRoutes() sur le serveur principal.
namespace WebAuth {
  void handleLogin(WebServer &server);
  void registerRoutes(WebServer &server);
}
#endif
