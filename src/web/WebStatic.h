#ifndef webstatic_h
#define webstatic_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Fichiers statiques servis depuis LittleFS (page, JS/CSS, favicon, manifeste des langues,
// exports shades.cfg/shades.tmp). Ne dépend que des primitives du noyau WebCore (handleStreamFile,
// sendCacheHeaders, isAuthenticated).
namespace WebStatic {
  void registerRoutes(AsyncWebServer &server);
}
#endif
