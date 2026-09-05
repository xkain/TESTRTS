#include <WiFi.h>
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include <esp_random.h>
#include <Preferences.h>
#include "mbedtls/md.h"
#include "ConfigSettings.h"
#include "Utils.h"
#include "somfy/Somfy.h"
#include "WResp.h"
#include "Web.h"
#include "GitOTA.h"
#include "WebCommon.h"
#include "WebStatic.h"
#include "WebAuth.h"
#include "WebI18n.h"
#include "WebNetwork.h"
#include "WebSystem.h"
#include "WebShadesRest.h"
#include "WebRadioCommands.h"

extern ConfigSettings settings;
extern Web webServer;
extern GitUpdater git;

char g_content[WEB_MAX_RESPONSE];

// General responses
const char _response_404[] = "404: Service Not Found";

// Encodings
const char _encoding_text[] = "text/plain";
const char _encoding_html[] = "text/html";
const char _encoding_json[] = "application/json";

// CSP du document racine (index.html) uniquement -- pas des assets, qui n'exécutent rien par
// eux-mêmes. 'unsafe-inline' est nécessaire des deux côtés : index.html porte un <script> inline
// (détection du thème avant le premier paint, cf. data-dev/index.html) ainsi que des attributs
// onclick=, et de nombreux style="" inline (cf. data-dev/index.html/index.js). connect-src liste
// tout ce que l'UI contacte en XHR/fetch/WebSocket : l'API REST et le WebSocket temps réel sur le
// device lui-même (port 8080, cf. Sockets.cpp), le serveur HTTP synchrone dédié aux opérations
// OTA bloquantes (port 8082, cf. WebGitSync.cpp -- GIT_SYNC_SERVER_PORT), plus GitHub pour la
// vérification de mises à jour (raw.githubusercontent.com pour le changelog, api.github.com pour
// les releases). Toute nouvelle origine contactée depuis index.js doit être ajoutée ici, sous
// peine de blocage silencieux par le navigateur.
static const char _csp[] PROGMEM =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; "
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com "
  "ws://*:8080 wss://*:8080 http://*:8082; "
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

AsyncWebServer apiServer(8081);
AsyncWebServer server(80);
void Web::startup() {
  Serial.println("Launching web server...");
  this->loadApiSecret();
}
// Charge utile HMAC composee dans un tampon de PILE (audit heap, 23/08/2026), et non plus par
// concatenation de String. Chaque `String(...) + ":" + ...` fabriquait 4 a 6 objets String
// intermediaires, donc autant d'allocations et de liberations de tas -- String n'a pas
// d'optimisation "petite chaine" sur ce coeur, la moindre chaine non vide passe par le tas. Or ces
// fonctions sont sur le chemin de CHAQUE requete authentifiee (Web::checkAuth) : c'etait quelques
// milliers d'allocations par heure sur la tache async_tcp, pour un texte qui tient largement dans
// 96 octets. Aucun changement de format : le resultat est identique caractere pour caractere a ce
// que produisait l'ancienne concatenation (IPAddress::toString() rend "a.b.c.d" sur ce coeur), donc
// les jetons deja distribues restent valides et aucune session n'est cassee par ce correctif.
// Dimensionnements : le PIN fait au plus 4 caracteres et l'identifiant comme le mot de passe au
// plus 32 (char[5]/char[33] dans SecuritySettings, bornes verifiees des l'entree par
// handleSaveSecurity), plus une adresse IPv4 de 15 caracteres et 2 separateurs.
bool Web::createAPIPinToken(const IPAddress ipAddress, const char *pin, char *token) {
  char payload[48];
  snprintf(payload, sizeof(payload), "%s:%u.%u.%u.%u", pin, ipAddress[0], ipAddress[1], ipAddress[2], ipAddress[3]);
  return this->createAPIToken(payload, token);
}
bool Web::createAPIPasswordToken(const IPAddress ipAddress, const char *username, const char *password, char *token) {
  char payload[96];
  snprintf(payload, sizeof(payload), "%s:%s:%u.%u.%u.%u", username, password, ipAddress[0], ipAddress[1], ipAddress[2], ipAddress[3]);
  return this->createAPIToken(payload, token);
}
void Web::loadApiSecret() {
  Preferences p;
  p.begin("authkey", false);
  String existing = p.getString("secret", "");
  if(existing.length() == sizeof(this->apiSecret) - 1) {
    strlcpy(this->apiSecret, existing.c_str(), sizeof(this->apiSecret));
  }
  else {
    uint8_t buf[32];
    esp_fill_random(buf, sizeof(buf));
    // P-4 : curseur explicite. `strcat` reparcourait la chaîne depuis le début à chaque octet --
    // 32 parcours pour 64 caractères. Sans conséquence ici (une fois par vie de l'appareil), mais
    // c'est le même motif que createAPIToken() ci-dessous, lui sur le chemin de CHAQUE requête
    // authentifiée : autant que les deux se lisent pareil.
    char *w = this->apiSecret;   // `p` est déjà pris par l'objet Preferences de cette fonction
    for(uint8_t i = 0; i < sizeof(buf); i++) w += sprintf(w, "%02x", (int)buf[i]);
    p.putString("secret", this->apiSecret);
    Serial.println(F("Generated new API signing secret."));
  }
  p.end();
}
// FUITE DE TAS CORRIGÉE ICI (audit sécurité/mémoire, 23/08/2026) -- root cause du "Max Heap très
// bas qui ne remonte jamais" observé dès qu'un PIN ou un mot de passe est configuré.
// mbedtls_md_setup() fait DEUX allocations sur le tas (cf. mbedtls/md.c) : le contexte SHA-256
// via ctx_alloc_func() (~116 octets, cf. sha256_alt.h du port ESP32) et, parce qu'on demande le
// mode HMAC (dernier argument à 1), un tampon calloc(2, block_size) = 2 x 64 = 128 octets. Aucune
// des deux n'est rendue sans mbedtls_md_free() -- que l'en-tête de la bibliothèque rend pourtant
// explicitement obligatoire ("If you have called mbedtls_md_setup() on ctx, you must call
// mbedtls_md_free()"). Chaque appel abandonnait donc ~264 octets, en-têtes de bloc compris.
//
// POURQUOI LA SÉCURITÉ CHANGE TOUT. Sur Security.type == None, Web::checkAuth() sort à sa
// PREMIÈRE ligne et cette fonction n'est jamais atteinte hors /login -- la fuite existait, mais
// à raison d'un appel par connexion, invisible. Dès qu'un PIN ou un mot de passe est actif, elle
// est appelée pour CHAQUE requête HTTP authentifiée (checkAuth), CHAQUE poignée de main WebSocket
// (socketHandshakeAuthorized, Sockets.cpp) et chaque requête du serveur OTA synchrone
// (isAuthenticatedSync, WebGitSync.cpp). Un simple chargement de l'interface en fait une
// vingtaine ; une session de gestion des langues (catalogue rechargé une dizaine de fois,
// rechargement complet de page après chaque installation, cf. General.onLanguageChanged) en fait
// des centaines. Le tas ne perd pas seulement ces octets : ce sont des centaines de petits blocs
// PERMANENTS éparpillés dans l'unique région qui porte le libre utile, donc le plus gros bloc
// CONTIGU s'effondre bien plus vite que le total libre (free élevé + largest bas, exactement le
// profil relevé le 17/08/2026 : free=82356 pour un largest de 40948). C'est ce plus gros bloc, et
// lui seul, qui décide de la faisabilité d'une poignée de main TLS (GIT_TLS_MIN_HEAP_BYTES,
// GitOTA.cpp) -- d'où l'OTA devenue impossible, et le téléchargement de langue instable, sans
// qu'aucun redémarrage du réseau ne les fasse remonter.
//
// mbedtls_md_init() ajouté en tête pour la même raison de contrat : md_free() ne doit être appelée
// que sur un contexte initialisé, et setup() laisse le contexte intact quand elle échoue (elle
// retourne avant d'écrire md_info) -- sans init(), la libération porterait sur des pointeurs de
// pile non initialisés.
bool Web::createAPIToken(const char *payload, char *token) {
    byte hmacResult[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);
    token[0] = '\0';
    if(mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1) != 0) {
        // Tas épuisé : on rend le contexte et on laisse `token` VIDE, en signalant l'échec.
        // Les appelants doivent traiter ce cas comme "non authentifié" -- cf. Web::checkAuth(),
        // qui refuse explicitement un jeton vide : sans ce garde-fou, un client envoyant un
        // en-tête `apikey:` vide (ce que fait deviceFetch() tant qu'aucune session n'est ouverte,
        // cf. 10-core-utils.js) aurait été comparé à une chaîne vide... et accepté.
        mbedtls_md_free(&ctx);
        return false;
    }
    mbedtls_md_hmac_starts(&ctx, (const unsigned char *)this->apiSecret, strlen(this->apiSecret));
    mbedtls_md_hmac_update(&ctx, (const unsigned char *)payload, strlen(payload));
    mbedtls_md_hmac_finish(&ctx, hmacResult);
    mbedtls_md_free(&ctx);
    // P-4 : curseur explicite (cf. loadApiSecret). Cette fonction s'exécute pour chaque requête
    // authentifiée, chaque poignée de main WebSocket et chaque requête du port 8082 -- les 32
    // parcours complets de `strcat` y étaient payés à chaque fois.
    char *p = token;
    for(size_t i = 0; i < sizeof(hmacResult); i++) p += sprintf(p, "%02x", (int)hmacResult[i]);
    return true;
}
bool Web::createAPIToken(const IPAddress ipAddress, char *token) {
    // Résultat RÉELLEMENT propagé (il était jusqu'ici écrasé par un `return true` inconditionnel,
    // et `String payload` était déclarée puis jamais utilisée) : c'est ce booléen qui permet à
    // checkAuth() de distinguer "jeton calculé, il ne correspond pas" de "jeton pas calculable".
    if(settings.Security.type == security_types::Password) return createAPIPasswordToken(ipAddress, settings.Security.username, settings.Security.password, token);
    else if(settings.Security.type == security_types::PinEntry) return createAPIPinToken(ipAddress, settings.Security.pin, token);
    char payload[24];
    snprintf(payload, sizeof(payload), "%u.%u.%u.%u", ipAddress[0], ipAddress[1], ipAddress[2], ipAddress[3]);
    return createAPIToken(payload, token);
}
// Cf. WebCommon.h pour le contexte complet (bug trouvé en test matériel réel, étape 5e).
void asyncBodyHandler(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
  if(total == 0) return;
  // Borne sur `total` (audit heap WebSockets/AsyncTCP/ESPAsyncWebServer, 17/08/2026) : `total` est
  // le Content-Length ANNONCÉ PAR LE CLIENT, donc une valeur non fiable. Sans plafond, une requête
  // déclarant 40 Ko fait réserver ici 40 Ko D'UN SEUL BLOC CONTIGU, conservés pendant toute la vie
  // de la requête -- exactement la ressource que réclame une poignée de main mbedTLS
  // (GIT_TLS_MIN_HEAP_BYTES = 36864 octets contigus, cf. GitOTA.cpp), et le tout sur des routes dont
  // /login, non authentifiée par construction. Pas besoin d'intention hostile : un client bogué ou
  // un scanner réseau suffit à couler durablement le plus gros bloc libre. La bibliothèque applique
  // elle-même exactement ce garde-fou sur son propre équivalent (`total < _maxContentLength`, cf.
  // AsyncJson.cpp::handleBody) -- il manquait simplement ici. Le plafond est très large devant le
  // plus gros corps réellement émis par l'UI (quelques centaines d'octets : identifiants, commandes
  // équipement, réglages) tout en restant sans commune mesure avec le budget TLS.
  // Au-delà, on n'alloue rien : asyncHasBody() renvoie donc false et le handler retombe sur son
  // propre chemin d'erreur "corps absent", au lieu d'un refus HTTP explicite -- les callbacks onBody
  // s'exécutent AVANT le handler principal, une réponse envoyée d'ici serait de toute façon écrasée
  // par celle du handler (AsyncWebServerRequest::send() remplace toute réponse déjà posée).
  if(total > ASYNC_MAX_BODY_BYTES) {
    if(index == 0)
      Serial.printf("Rejet du corps de %s: %u octets > plafond %u\n",
        request->url().c_str(), (unsigned)total, (unsigned)ASYNC_MAX_BODY_BYTES);
    return;
  }
  if(request->_tempObject == nullptr) {
    request->_tempObject = malloc(total + 1);
    if(request->_tempObject == nullptr) return;
    ((char*)request->_tempObject)[total] = '\0';
  }
  // Garde défensive : le parseur borne normalement la somme des chunks au Content-Length annoncé,
  // mais ce buffer est dimensionné sur une valeur d'origine cliente -- on ne lui fait pas confiance
  // au point d'écrire hors bornes si un corps mal formé venait à la dépasser.
  if(index + len > total) return;
  memcpy((uint8_t*)request->_tempObject + index, data, len);
}
// Cf. le commentaire détaillé sur ces trois fonctions dans WebCommon.h.
static volatile bool g_fsUploadHoldsLock = false;
static File g_fsUploadFile;
bool fsUploadLockAcquire(const char *path) {
  if(git.lockFS) return false;
  g_fsUploadFile = LittleFS.open(path, "w");
  if(!g_fsUploadFile) return false;
  git.lockFS = true;
  g_fsUploadHoldsLock = true;
  return true;
}
bool fsUploadWrite(const uint8_t *data, size_t len) {
  if(!g_fsUploadHoldsLock || !g_fsUploadFile) return false;
  return g_fsUploadFile.write(data, len) == len;
}
void fsUploadLockRelease() {
  if(!g_fsUploadHoldsLock) return;
  g_fsUploadHoldsLock = false;
  // Fermeture ICI, et nulle part ailleurs : le drapeau de propriété est le seul point qui sache si
  // ce handle est encore le nôtre. Un rappel de déconnexion tardif (cf. WebCommon.h) trouve le
  // drapeau à false et ressort sans toucher au fichier d'un autre téléversement.
  if(g_fsUploadFile) g_fsUploadFile.close();
  git.lockFS = false;
}
bool asyncHasBody(AsyncWebServerRequest *request) {
  return request->_tempObject != nullptr;
}
String asyncGetBody(AsyncWebServerRequest *request) {
  return request->_tempObject ? String((char*)request->_tempObject) : String();
}

// Posé par build_data_image.py::_set_build_cache_flag (CPPDEFINES, pas un fichier LittleFS -- décidé
// une fois pour toutes à la compilation) : 1 sur une release propre (?v= sans suffixe "-dev-"),
// 0 sinon. Le défaut à 0 ici couvre les environnements où le pre-script ne tourne pas (ex. build
// natif de tests) : on reste alors sur le comportement sûr, jamais de cache long.
#ifndef BUILD_ASSET_CACHE_IMMUTABLE
#define BUILD_ASSET_CACHE_IMMUTABLE 0
#endif

// Compteur de réponses fichier LittleFS en cours d'émission sur la tâche async_tcp (audit heap
// WebSockets/AsyncTCP/ESPAsyncWebServer, 17/08/2026). AsyncFileResponse conserve un `File` OUVERT
// pendant toute la durée du transfert (fermé dans son destructeur, cf. WebResponseImpl.h) : tester
// git.lockFS au début de handleStreamFile() ne protège donc que l'INSTANT de la requête, pas la
// fenêtre de streaming qui suit. Sans ce compteur, une OTA qui pose le verrou puis écrit la
// partition pendant qu'un asset est encore en cours d'envoi fait cohabiter une écriture LittleFS
// (tâche principale) avec un handle de lecture ouvert (async_tcp) -- c'est exactement la
// configuration de l'assert interne "lfs_mlist_isopen" déjà rencontrée en usage réel (cf. le
// verrouillage symétrique côté écriture dans WebI18n.cpp::handleUploadLangBody).
// Le compteur est incrémenté/décrémenté par TrackedFileResponse ci-dessous ; il redescend dès la
// fin réelle du transfert (la réponse est détruite dans AsyncWebServerRequest::_onAck() sitôt
// terminée, PAS à la fermeture de la connexion keep-alive), la fenêtre reste donc courte.
static std::atomic<uint16_t> g_asyncFileReaders{0};

// Seul rôle : rendre observable la durée de vie du `File` détenu par AsyncFileResponse. On n'hérite
// que pour instrumenter le destructeur -- aucun comportement de la réponse n'est modifié.
// fs::FS pleinement qualifié, PAS `FS` : AsyncFileResponse déclare en privé son propre alias
// `using FS = fs::FS`, qui masque le nom global à l'intérieur de toute classe dérivée -- l'écrire
// non qualifié ici ne compile pas ("'using FS = class fs::FS' is private within this context").
class TrackedFileResponse : public AsyncFileResponse {
  public:
    TrackedFileResponse(fs::FS &fs, const String &path, const char *contentType)
      : AsyncFileResponse(fs, path, contentType) { g_asyncFileReaders++; }
    ~TrackedFileResponse() { g_asyncFileReaders--; }
};

bool Web::waitForFileReaders(uint32_t timeoutMs) {
  // À n'appeler qu'APRÈS avoir posé git.lockFS : le verrou empêche toute NOUVELLE réponse fichier de
  // démarrer (handleStreamFile() répond 500 tant qu'il est tenu), cette attente ne fait que drainer
  // celles déjà en vol -- sans quoi on attendrait un compteur qu'un flux continu de requêtes pourrait
  // maintenir indéfiniment au-dessus de zéro. Modèle "verrouiller puis drainer", pas de verrou côté
  // lecteur : deux assets servis en parallèle (chargement de page normal) restent parfaitement
  // concurrents, ce qu'un verrou d'exclusion aurait cassé.
  uint32_t start = millis();
  while(g_asyncFileReaders > 0) {
    if((uint32_t)(millis() - start) >= timeoutMs) {
      // Volontairement non bloquant au-delà du budget : mieux vaut poursuivre l'OTA (risque résiduel
      // identique à l'existant) que de figer la tâche principale sur un transfert qui ne se termine
      // pas -- un client disparu sans FIN garderait sinon le compteur à 1 jusqu'au timeout TCP.
      Serial.printf("Attente des lecteurs de fichiers expirée (%u encore en cours)\n",
        (unsigned)g_asyncFileReaders);
      return false;
    }
    esp_task_wdt_reset();
    delay(10);
  }
  return true;
}

void Web::handleStreamFile(AsyncWebServerRequest *request, const char *filename, const char *contentType, bool isRootDocument, bool alwaysGzipped, bool immutableVersioned) {
  if(git.lockFS) {
    // 503 + Retry-After, et non 500 : le fichier existe, il est seulement momentanément
    // inaccessible (installation de langue, mise à jour OTA). La distinction n'est pas cosmétique
    // -- c'est elle qui permet au client de savoir qu'il doit RÉESSAYER plutôt que conclure que
    // l'asset est cassé. index.html s'en sert pour ne pas basculer sur son repli de dev, qui
    // chargeait onze fichiers absents du firmware et tuait la page (cf. __onAssetError).
    AsyncWebServerResponse *busy = request->beginResponse(503, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
    busy->addHeader("Retry-After", "5");
    request->send(busy);
    return;
  }
  AsyncWebServerResponse *response;
  if(alwaysGzipped) {
    // Cf. commentaire de handleStreamFile dans Web.h : ces fichiers n'existent JAMAIS en clair sur
    // le device, on interroge donc directement leur variante .gz -- un seul lookup, toujours
    // gagnant, au lieu des deux lookups ratés du chemin générique ci-dessous.
    String gzFilename = String(filename) + ".gz";
    if(!LittleFS.exists(gzFilename)) {
      request->send(404, _encoding_text, "404: Not Found");
      return;
    }
    esp_task_wdt_reset();
    // new TrackedFileResponse(...) plutôt que request->beginResponse(LittleFS, ...) : cette dernière
    // se contente de construire un AsyncFileResponse (cf. WebResponses.cpp), on substitue la
    // sous-classe instrumentée -- cf. g_asyncFileReaders ci-dessus. La réponse est détruite par la
    // bibliothèque comme n'importe quelle autre.
    response = new TrackedFileResponse(LittleFS, gzFilename, contentType);
    response->addHeader("Content-Encoding", "gzip");
  }
  else {
    if(!LittleFS.exists(filename) && !LittleFS.exists(String(filename) + ".gz")) {
      request->send(404, _encoding_text, "404: Not Found");
      return;
    }
    esp_task_wdt_reset();
    // Même substitution que dans la branche alwaysGzipped ci-dessus. Le repli automatique sur
    // filename+".gz" (cf. commentaire de handleStreamFile dans Web.h) est assuré par le constructeur
    // d'AsyncFileResponse lui-même, que TrackedFileResponse ne fait que relayer : comportement
    // inchangé.
    response = new TrackedFileResponse(LittleFS, filename, contentType);
  }
  if(isRootDocument) {
    // Jamais de cache aveugle sur le document qui référence les URLs versionnées ?v= des autres
    // assets (cf. commentaire de handleStreamFile dans Web.h) ; no-store empêche même une mise en
    // cache locale, must-revalidate impose au client de revérifier auprès du device avant toute
    // réutilisation, même hors ligne dans certains navigateurs.
    response->addHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    // String(FPSTR(...)) plutôt que FPSTR(...) passé tel quel : addHeader() n'a pas de surcharge
    // pour const __FlashStringHelper*, seulement (const char*, const char*) et (String, String) --
    // la conversion explicite lève toute ambiguïté de résolution de surcharge.
    response->addHeader("Content-Security-Policy", String(FPSTR(_csp)));
    response->addHeader("X-Content-Type-Options", "nosniff");
  }
  else if(immutableVersioned && BUILD_ASSET_CACHE_IMMUTABLE) {
    // Release propre uniquement (cf. BUILD_ASSET_CACHE_IMMUTABLE ci-dessus et le commentaire de
    // handleStreamFile dans Web.h) : le contenu sous cette URL exacte ne peut plus changer, le
    // navigateur peut donc la garder un an sans jamais revalider.
    response->addHeader("Cache-Control", "max-age=31536000, immutable");
  }
  else {
    // Tout le reste (assets non versionnés, ou versionnés mais en build de dev) : jamais de cache
    // long -- cf. commentaire de handleStreamFile dans Web.h, ce cache combiné au ?v= a déjà
    // produit un JS/CSS périmé après reflash/AP/erase à deux reprises en développement actif.
    response->addHeader("Cache-Control", "no-cache, must-revalidate");
  }
  request->send(response);
  esp_task_wdt_reset();
}
void Web::handleNotFound(AsyncWebServerRequest *request) {
  if(request->method() == AsyncHttp::OPTIONS) {
    request->send(200, _encoding_text, "OK");
    return;
  }
  DBG_PRINT(F("404: "));
  DBG_PRINTLN(request->url());
  request->send(404, _encoding_text, "404: Not Found");
}
void Web::handleDeserializationError(AsyncWebServerRequest *request, DeserializationError &err) {
    switch (err.code()) {
    case DeserializationError::InvalidInput:
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid JSON payload\"}");
      break;
    case DeserializationError::NoMemory:
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Out of memory parsing JSON\"}");
      break;
    default:
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"General JSON Deserialization failed\"}");
      break;
    }
}
bool Web::checkAuth(AsyncWebServerRequest *request, bool cfg) {
  if(settings.Security.type == security_types::None) return true;
  if(!cfg && (settings.Security.permissions & static_cast<uint8_t>(security_permissions::ConfigOnly)) == 0x01) return true;
  if(!request->hasHeader("apikey")) return false;
  char token[65];
  memset(token, 0x00, sizeof(token));
  // Résultat de createAPIToken() vérifié, et jeton vide refusé (audit sécurité/mémoire,
  // 23/08/2026). Le calcul peut désormais échouer proprement quand le tas ne permet plus
  // d'allouer le contexte HMAC (cf. le commentaire détaillé sur createAPIToken() ci-dessus) : il
  // laisse alors `token` vide. Sans ces deux gardes, la comparaison qui suit opposerait une chaîne
  // vide à l'en-tête reçu -- or l'interface envoie littéralement `apikey:` (vide) tant qu'aucune
  // session n'est ouverte (deviceFetch/getJSON, cf. 10-core-utils.js). Une pénurie de mémoire
  // aurait donc ouvert l'API à tout client non authentifié, exactement au moment où l'appareil est
  // le plus fragile. Un refus est le seul comportement acceptable ici.
  if(!this->createAPIToken(request->client()->remoteIP(), token)) return false;
  if(token[0] == '\0') return false;
  return String(token) == request->header("apikey");
}
bool Web::isAuthenticated(AsyncWebServerRequest *request, bool cfg) {
  DBG_PRINTLN("Checking authentication");
  if(this->checkAuth(request, cfg)) return true;
  // Une clé présente mais invalide DOIT répondre comme une clé absente : sans ce send(), la
  // requête restait sans réponse et le client attendait son timeout au lieu de voir un refus
  // explicite (et donc de redemander une authentification).
  DBG_PRINTLN("Not authenticated...");
  request->send(401, _encoding_text, "Unauthorized API Key");
  return false;
}

void Web::begin() {
  Serial.println("Creating Web MicroServices...");
  // CORS n'est nécessaire que pour développer data-dev/ depuis un serveur/origine distincte
  // du device (ex: http://localhost:8000). En usage normal (page servie par le device lui-même),
  // tout est same-origin et CORS n'apporte rien à part exposer inutilement l'API à d'autres sites.
  // DefaultHeaders est un registre global unique côté ESPAsyncWebServer (partagé par toutes les
  // instances AsyncWebServer du process) : un seul appel couvre donc server ET apiServer, là où
  // WebServer::enableCORS(true) devait être activé séparément sur chacun des deux anciens objets.
  // Reproduit exactement les 3 en-têtes qu'ajoutait WebServer::enableCORS(true) (cf. WebServer.cpp).
#ifdef ENABLE_DEV_CORS
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "*");
#endif
  // Pas d'équivalent à WebServer::collectHeaders() nécessaire : AsyncWebServerRequest expose tous
  // les en-têtes de la requête via hasHeader()/header() sans opt-in préalable.
  apiServer.on("/discovery", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleDiscovery(request); });
  apiServer.on("/rooms", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetRooms(request); });
  apiServer.on("/shades", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetShades(request); });
  apiServer.on("/groups", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetGroups(request); });
  apiServer.on("/schedules", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebShadesRest::handleGetSchedules(request); });
  apiServer.on("/login", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebAuth::handleLogin(request); }, nullptr, asyncBodyHandler);
  apiServer.onNotFound([](AsyncWebServerRequest *request) { webServer.handleNotFound(request); });
  apiServer.on("/controller", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleController(request); });
  apiServer.on("/shadeCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleShadeCommand(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/groupCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleGroupCommand(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/tiltCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleTiltCommand(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/repeatCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleRepeatCommand(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/room", AsyncHttp::GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleRoom(request); });
  apiServer.on("/shade", AsyncHttp::GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleShade(request); });
  apiServer.on("/group", AsyncHttp::GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleGroup(request); });
  apiServer.on("/schedule", AsyncHttp::GET, [](AsyncWebServerRequest *request) { WebShadesRest::handleSchedule(request); });
  apiServer.on("/setPositions", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleSetPositions(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/setSensor", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebRadioCommands::handleSetSensor(request); }, nullptr, asyncBodyHandler);
  apiServer.on("/downloadFirmware", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleDownloadFirmware(request); });
  apiServer.on("/backup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleBackup(request); });
  apiServer.on("/reboot", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { WebSystem::handleReboot(request); });

  WebI18n::registerRoutes(server);

  WebStatic::registerRoutes(server);
  WebAuth::registerRoutes(server);
  WebSystem::registerRoutes(server);
  server.onNotFound([](AsyncWebServerRequest *request) { webServer.handleNotFound(request); });
  WebShadesRest::registerRoutes(server);
  WebRadioCommands::registerRoutes(server);
  WebNetwork::registerRoutes(server);
  server.begin();
  apiServer.begin();
}
