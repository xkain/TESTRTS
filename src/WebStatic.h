#ifndef webstatic_h
#define webstatic_h
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Fichiers statiques servis depuis LittleFS (page, JS/CSS, favicon, manifeste des langues,
// exports shades.cfg/shades.tmp). Ne dépend que des primitives du noyau WebCore (handleStreamFile,
// sendCacheHeaders, isAuthenticated).
namespace WebStatic {
  void registerRoutes(WebServer &server);
  // Surcharge ESPAsyncWebServer (étape 3 migration) : coexiste avec registerRoutes(WebServer&)
  // jusqu'à la bascule finale de Web.cpp::begin() (cf. Web.h). Non câblée pour l'instant.
  void registerRoutes(AsyncWebServer &server);
}
#endif
