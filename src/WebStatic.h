#ifndef webstatic_h
#define webstatic_h
#include <WebServer.h>

// Fichiers statiques servis depuis LittleFS (page, JS/CSS, favicon, manifeste des langues,
// exports shades.cfg/shades.tmp). Ne dépend que des primitives du noyau WebCore (handleStreamFile,
// sendCacheHeaders, isAuthenticated).
namespace WebStatic {
  void registerRoutes(WebServer &server);
}
#endif
