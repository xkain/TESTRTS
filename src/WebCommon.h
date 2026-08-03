#ifndef webcommon_h
#define webcommon_h
#include <ESPAsyncWebServer.h>

// Constantes partagées entre les modules Web* (routes HTTP). Définies une seule fois dans
// Web.cpp (noyau WebCore) ; chaque module qui en a besoin les déclare ici en extern plutôt que
// de dupliquer les littéraux.

// --- Constantes HTTP pour AsyncWebServerRequest::method() (bug trouvé en test matériel réel,
// étape 5e de la migration ESPAsyncWebServer) ---
// ESPAsyncWebServer.h ne redéfinit HTTP_GET/HTTP_POST/HTTP_PUT/HTTP_OPTIONS/... QUE si WEBSERVER_H
// n'est pas déjà défini dans l'unité de compilation courante (garde `#ifndef WEBSERVER_H`). Tous
// nos fichiers projet incluent <WebServer.h> AVANT <ESPAsyncWebServer.h>, donc chez NOUS ces
// macros valent les entiers séquentiels de `enum http_method` (GET=1, POST=3, PUT=4, OPTIONS=6,
// ...). Mais WebRequest.cpp -- compilé À L'INTÉRIEUR de la bibliothèque ESPAsyncWebServer,
// laquelle n'inclut PAS <WebServer.h> dans sa propre unité de compilation -- utilise lui les
// valeurs bitmask qu'ESPAsyncWebServer.h définit par défaut (GET=0b1, POST=0b10, DELETE=0b100,
// PUT=0b1000, PATCH=0b10000, HEAD=0b100000, OPTIONS=0b1000000) pour peupler
// AsyncWebServerRequest::_method au moment de parser chaque requête reçue. Les deux jeux de
// valeurs ne coïncident QUE pour GET (=1 dans les deux cas, par hasard) : toute comparaison directe
// `request->method() == HTTP_POST/HTTP_PUT/HTTP_OPTIONS/...` échoue donc silencieusement (constaté
// en test réel : un OPTIONS sur /shadeCommand retombait dans le else "Invalid Http method"). Ces
// constantes reproduisent la valeur RÉELLEMENT utilisée à l'exécution par
// AsyncWebServerRequest::method() -- à utiliser exclusivement dans le code AsyncWebServerRequest*
// (routes registerRoutes(AsyncWebServer&) ET comparaisons dans les handlers), jamais avec l'ancien
// WebServer&, qui reste sur l'enum classique (cohérent avec lui-même, donc non affecté par ce bug).
namespace AsyncHttp {
  constexpr WebRequestMethodComposite GET      = 0b00000001;
  constexpr WebRequestMethodComposite POST     = 0b00000010;
  constexpr WebRequestMethodComposite DELETE_  = 0b00000100;
  constexpr WebRequestMethodComposite PUT      = 0b00001000;
  constexpr WebRequestMethodComposite PATCH    = 0b00010000;
  constexpr WebRequestMethodComposite HEAD     = 0b00100000;
  constexpr WebRequestMethodComposite OPTIONS  = 0b01000000;
  constexpr WebRequestMethodComposite ANY      = 0b01111111;
}
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

// --- Corps de requête brut pour les routes Async à payload JSON (bug trouvé en test matériel
// réel, étape 5e) ---
// request->arg("body")/hasArg("body") NE capture PAS automatiquement le corps d'une requête
// Content-Type: application/json (constaté en test réel : PUT/POST avec JSON répondaient "No
// object supplied" alors que le corps était bien envoyé). Cf. ESPAsyncWebServer WebRequest.cpp :
// un paramètre "body" (T_BODY) n'est peuplé automatiquement QUE si le corps est
// application/x-www-form-urlencoded, ou text/plain au format "clef=valeur" (chemin _isPlainPost) ;
// pour tout autre Content-Type (dont application/json, ce que le front-end envoie), le corps est
// livré via le callback onBody du handler -- qui reste NULL tant qu'on ne le fournit pas
// explicitement à server.on(). asyncBodyHandler doit donc être enregistré comme argument onBody de
// chaque route Async dont le handler lit un corps JSON (server.on(uri, méthode, onRequest, nullptr,
// asyncBodyHandler)) ; il accumule les octets reçus dans request->_tempObject (buffer malloc()'d +
// terminateur nul, libéré automatiquement par free() dans ~AsyncWebServerRequest() -- ne jamais y
// stocker un type non trivialement destructible comme String/std::string, qui fuirait ou
// corromprait le tas puisque le destructeur ne serait jamais appelé). Sans effet sur les requêtes
// sans corps (GET, OPTIONS...) : total vaut alors 0 et le callback ne fait rien.
void asyncBodyHandler(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total);
bool asyncHasBody(AsyncWebServerRequest *request);
String asyncGetBody(AsyncWebServerRequest *request);

#endif
