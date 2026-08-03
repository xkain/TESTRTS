#ifndef webi18n_h
#define webi18n_h
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Langues (i18n) : /lang, /langDefault, /setLang, /setPendingLang, /setOnboardingDone,
// /getInstalledLangs, /getAvailableLangs, /downloadLang, /deleteLang, /uploadLang.
// Uniquement enregistrées sur le serveur principal (port 80) -- pas de mirroring sur apiServer.
namespace WebI18n {
  void registerRoutes(WebServer &server);
  // Surcharge ESPAsyncWebServer (étape 3 migration) : coexiste avec registerRoutes(WebServer&)
  // jusqu'à la bascule finale de Web.cpp::begin() (cf. Web.h). N'enregistre PAS /uploadLang
  // (upload multipart, réservé à l'étape 4) -- non câblée pour l'instant.
  void registerRoutes(AsyncWebServer &server);
}
#endif
