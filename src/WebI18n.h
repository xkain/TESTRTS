#ifndef webi18n_h
#define webi18n_h
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Langues (i18n) : /lang, /langDefault, /setLang, /setPendingLang, /setOnboardingDone,
// /getInstalledLangs, /getAvailableLangs, /downloadLang, /deleteLang, /uploadLang.
// Uniquement enregistrées sur le serveur principal (port 80) -- pas de mirroring sur apiServer.
namespace WebI18n {
  void registerRoutes(WebServer &server);
  // Surcharge ESPAsyncWebServer (étapes 3+4 migration) : coexiste avec registerRoutes(WebServer&)
  // jusqu'à la bascule finale de Web.cpp::begin() (cf. Web.h). Non câblée pour l'instant.
  void registerRoutes(AsyncWebServer &server);
}
#endif
