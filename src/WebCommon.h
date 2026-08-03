#ifndef webcommon_h
#define webcommon_h

// Constantes partagées entre les modules Web* (routes HTTP). Définies une seule fois dans
// Web.cpp (noyau WebCore) ; chaque module qui en a besoin les déclare ici en extern plutôt que
// de dupliquer les littéraux.
extern const char _response_404[];
extern const char _encoding_text[];
extern const char _encoding_html[];
extern const char _encoding_json[];

// Buffer de sérialisation JSON partagé par tous les handlers HTTP, réutilisé requête après
// requête (modèle synchrone WebServer::handleClient() : une seule requête traitée à la fois).
// Défini dans Web.cpp (WebCore). À réexaminer lors de la migration ESPAsyncWebServer, qui peut
// traiter plusieurs requêtes en parallèle.
#define WEB_MAX_RESPONSE 4096
extern char g_content[WEB_MAX_RESPONSE];

// Langue embarquée d'usine garantie présente sur LittleFS pour cet environnement de build (cf.
// minify_data.py, qui n'embarque plus qu'une seule des deux candidates en/fr selon la variante
// matérielle) -- sert de repli universel dans WebI18n::handleLang() et de protection dans
// WebI18n::handleDeleteLang(), à la place de l'ancien "en" fixe qui ne serait plus forcément
// présent sur les boîtiers BOX (fr embarqué, en devenu une langue optionnelle comme les autres).
#if defined(HARDWARE_BOX_ETH) || defined(HARDWARE_BOX_WIFI)
#define DEFAULT_EMBEDDED_LANG "fr"
#else
#define DEFAULT_EMBEDDED_LANG "en"
#endif

#endif
