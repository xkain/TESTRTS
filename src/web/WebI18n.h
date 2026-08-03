#ifndef webi18n_h
#define webi18n_h
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// Langues (i18n) : /lang, /langDefault, /setLang, /setPendingLang, /setOnboardingDone,
// /getInstalledLangs, /getAvailableLangs, /downloadLang, /deleteLang, /uploadLang.
// Uniquement enregistrées sur le serveur principal (port 80) -- pas de mirroring sur apiServer.
namespace WebI18n {
  void registerRoutes(AsyncWebServer &server);
}
#endif
