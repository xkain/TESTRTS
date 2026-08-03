#ifndef webi18n_h
#define webi18n_h
#include <WebServer.h>

// Langues (i18n) : /lang, /langDefault, /setLang, /setPendingLang, /setOnboardingDone,
// /getInstalledLangs, /getAvailableLangs, /downloadLang, /deleteLang, /uploadLang.
// Uniquement enregistrées sur le serveur principal (port 80) -- pas de mirroring sur apiServer.
namespace WebI18n {
  void registerRoutes(WebServer &server);
}
#endif
