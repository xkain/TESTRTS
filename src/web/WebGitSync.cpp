#include "ConfigSettings.h"
#include "somfy/Somfy.h"
#include "GitOTA.h"
#include "WResp.h"
#include "WebCommon.h"
#include "WebGitSync.h"
#include "Web.h"

extern ConfigSettings settings;
extern SomfyShadeController somfy;
extern GitUpdater git;
extern Web webServer;

namespace WebGitSync {
  // Tampon de réponse PROPRE à ce module, alloué le temps d'une requête (décision « g_content »
  // du 24/08/2026). Ces deux handlers tournent sur loopTask (cœur 1) tandis que les handlers
  // ESPAsyncWebServer tournent sur async_tcp (cœur 0) : ce ne sont pas deux tâches qui se
  // préemptent, ce sont deux cœurs qui s'exécutent RÉELLEMENT en parallèle. Écrire dans le
  // `g_content` partagé depuis ici pouvait donc entrelacer cette réponse avec celle d'un handler
  // async -- et `handleSaveSecurity`/`handleLogin` y déposent une clé d'API valide, si bien que le
  // pire cas n'était pas une réponse illisible mais un fragment de secret versé dans la réponse
  // d'un autre client.
  //
  // Allocation TRANSITOIRE plutôt qu'un second tampon statique : le coût n'existe que pendant
  // l'usage de la page Firmware, alors qu'un tampon permanent aurait pesé 4 Ko en continu. Ce
  // chemin vient de toute façon d'enchaîner une session TLS à ~35 Ko transitoires, donc 4 Ko de
  // plus n'y changent rien. Écarté aussi : un mutex, dont la section critique aurait contenu le
  // `send()` socket -- de l'E/S bloquante partagée entre loopTask et async_tcp, très exactement le
  // motif supprimé par P-6/P-7.
  //
  // RAII et non malloc/free manuels : les deux handlers ont des retours anticipés (dépassement de
  // sérialisation), où un free() explicite s'oublierait tôt ou tard.
  struct SyncRespBuffer {
    char *buf;
    SyncRespBuffer() : buf((char *)malloc(WEB_MAX_RESPONSE)) {}
    ~SyncRespBuffer() { if(this->buf) free(this->buf); }
    SyncRespBuffer(const SyncRespBuffer &) = delete;
    SyncRespBuffer &operator=(const SyncRespBuffer &) = delete;
    bool ok() const { return this->buf != nullptr; }
  };


  static WebServer gitSyncServer(GIT_SYNC_SERVER_PORT);

  // Reflète l'Origin de la requête plutôt qu'un `*` générique : ce port ne sert que 2 routes
  // étroites (contrairement à ENABLE_DEV_CORS, qui ouvre toute la surface API principale), mais
  // autant garder l'habitude d'une réponse ciblée -- les en-têtes personnalisés (apikey) exigent
  // de toute façon un Origin explicite plutôt que "*" pour qu'un navigateur les honore avec
  // credentials/headers custom sur une requête cross-port.
  static void sendCorsHeaders() {
    String origin = gitSyncServer.header("Origin");
    gitSyncServer.sendHeader("Access-Control-Allow-Origin", origin.length() ? origin : "*");
    gitSyncServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    gitSyncServer.sendHeader("Access-Control-Allow-Headers", "apikey, Content-Type");
  }

  // Refuse une requête déclenchée depuis une AUTRE origine que l'interface du boîtier.
  //
  // /downloadFirmware a un effet de bord majeur : il arme git.status = GIT_AWAITING_UPDATE, et
  // GitUpdater::loop() enchaîne alors téléchargement, écriture de partition et redémarrage. Or CORS
  // ne protège de rien ici -- il empêche une page tierce de LIRE la réponse, pas d'ÉMETTRE la
  // requête. Tant que la sécurité est sur None (défaut d'usine), un simple
  // `fetch('http://<boitier>:8082/downloadFirmware?ver=latest', {mode:'no-cors'})` posé sur
  // n'importe quel site suffisait donc à reflasher l'appareil d'un visiteur. Aucun jeton anti-CSRF
  // n'existe dans le projet ; le contrôle d'origine en tient lieu.
  //
  // Un navigateur envoie toujours Origin sur une requête cross-origin. Un client non-navigateur
  // (script, intégration domotique) n'en envoie pas : absence = autorisé, sans quoi on casserait
  // tous les clients REST légitimes. On compare les seuls NOMS D'HÔTE : l'interface est servie sur
  // le port 80 et appelle ce serveur sur le 8082, les ports diffèrent donc par construction.
  static bool sameOriginOrNone() {
    String origin = gitSyncServer.header("Origin");
    if(origin.length() == 0 || origin == "null") return true;
    int sep = origin.indexOf("://");
    String oHost = (sep < 0) ? origin : origin.substring(sep + 3);
    int colon = oHost.indexOf(':');
    if(colon >= 0) oHost = oHost.substring(0, colon);
    String host = gitSyncServer.hostHeader();
    colon = host.indexOf(':');
    if(colon >= 0) host = host.substring(0, colon);
    if(oHost.length() > 0 && oHost.equalsIgnoreCase(host)) return true;
    Serial.printf("Requete refusee : origine %s etrangere a l'hote %s\n", origin.c_str(), host.c_str());
    sendCorsHeaders();
    gitSyncServer.send(403, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Cross-origin request refused.\"}");
    return false;
  }

  // Repris de Web::isAuthenticated() (Web.cpp) sans dupliquer la logique de vérification -- même
  // appel à webServer.createAPIToken() (HMAC IP+secret, indépendant du transport), seule
  // l'extraction de l'en-tête/IP diffère entre WebServer (ici) et AsyncWebServerRequest (là-bas).
  static bool isAuthenticatedSync(bool cfg) {
    if(settings.Security.type == security_types::None) return true;
    if(!cfg && (settings.Security.permissions & static_cast<uint8_t>(security_permissions::ConfigOnly)) == 0x01) return true;
    if(gitSyncServer.hasHeader("apikey")) {
      char token[65];
      memset(token, 0x00, sizeof(token));
      // Mêmes deux gardes que Web::checkAuth() (cf. son commentaire) : un échec de calcul du jeton
      // ou un jeton vide valent refus, jamais acceptation. Ce port arme git.status =
      // GIT_AWAITING_UPDATE, donc un reflash de l'appareil -- c'est le dernier endroit où laisser
      // une pénurie de mémoire se transformer en autorisation.
      if(webServer.createAPIToken(gitSyncServer.client().remoteIP(), token) && token[0] != '\0' &&
         String(token) == gitSyncServer.header("apikey")) return true;
    }
    sendCorsHeaders();
    gitSyncServer.send(401, _encoding_text, "Unauthorized API Key");
    return false;
  }

  // Recherche `ver` ("latest"/"main"/tag exact) dans un GitRepo déjà rempli -- même logique que
  // son équivalent async (WebSystem.cpp::findRelease), dupliquée plutôt que partagée : les deux
  // opèrent sur des types de requête différents et une dépendance croisée entre WebSystem.cpp et
  // ce module isolé n'apporterait rien.
  static GitRelease *findRelease(GitRepo &repo, const char *ver) {
    if(strcmp(ver, "latest") == 0) return &repo.releases[0];
    if(strcmp(ver, "main") == 0) return &repo.releases[GIT_MAX_RELEASES];
    for(uint8_t i = 0; i < GIT_MAX_RELEASES; i++) {
      if(repo.releases[i].id == 0) continue;
      if(strcmp(repo.releases[i].name, ver) == 0) return &repo.releases[i];
    }
    return nullptr;
  }

  static void handleGetReleases() {
    if(gitSyncServer.method() == HTTP_OPTIONS) { sendCorsHeaders(); gitSyncServer.send(200, _encoding_text, "OK"); return; }
    if(!sameOriginOrNone()) return;
    if(!isAuthenticatedSync(true)) return;
    // Même garde que la route async d'origine : un volet en mouvement ne doit pas voir son STOP
    // retardé par un fetch réseau de plusieurs secondes.
    if(somfy.isAnyShadeMoving()) {
      sendCorsHeaders();
      gitSyncServer.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"A shade is currently moving, please try again shortly.\"}");
      return;
    }
    if(git.lockFS) {
      sendCorsHeaders();
      gitSyncServer.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }
    // Fetch bloquant assumé : ce serveur ne partage aucune ressource avec async_tcp, un blocage
    // de quelques secondes ici n'affecte ni les WebSocket ni les autres requêtes HTTP servies par
    // ailleurs. git.cachedReleases (pas un GitRepo local) : /downloadFirmware, servi par ce même
    // serveur, le réutilise ensuite sans refaire un aller-retour réseau.
    int16_t err = git.cachedReleases.getReleases();
    if(err != 0) {
      int httpStatus = (err >= 100 && err <= 599) ? err : 500;
      char body[64];
      snprintf(body, sizeof(body), "{\"status\":\"ERROR\",\"error\":%d}", err);
      sendCorsHeaders();
      gitSyncServer.send(httpStatus, _encoding_json, body);
      return;
    }
    git.setCurrentRelease(git.cachedReleases);
    // Horodater le cache ici aussi (17/08/2026) : cette route le remplit directement, sans passer
    // par git.releasesRequested. Sans cette ligne, /getAvailableLangs (gestionnaire de langues)
    // ignore que le catalogue vient d'être rafraîchi et relance un aller-retour TLS complet --
    // observé en usage réel, deux fetches à 29 s d'intervalle pour un cache pourtant valide 5 min.
    // Cf. GIT_RELEASES_CACHE_TTL_MS dans GitOTA.h.
    git.lastReleasesFetch = millis();
    SyncRespBuffer resp;
    if(!resp.ok()) {
      sendCorsHeaders();
      gitSyncServer.send(503, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Out of memory building the release list.\"}");
      return;
    }
    JsonFormatter json;
    json.begin(resp.buf, WEB_MAX_RESPONSE);
    json.beginObject();
    git.cachedReleases.toJSON(json);
    json.endObject();
    sendCorsHeaders();
    // P-8 : ce tampon fait 4096 octets et cette réponse porte jusqu'à 5 releases avec leurs noms
    // d'assets -- elle peut réellement l'atteindre. Sans ce contrôle, on émettait un 200 avec un
    // corps STRUCTURELLEMENT invalide (le fragment qui ne tenait pas était abandonné, l'écriture
    // poursuivie) : le client recevait un succès qu'il ne pouvait pas analyser. Un 500 explicite
    // vaut mieux qu'un JSON cassé annoncé comme valide.
    if(json.overflowed()) {
      gitSyncServer.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Release list too large to serialize.\"}");
      return;
    }
    gitSyncServer.send(200, _encoding_json, resp.buf);
  }

  static void handleDownloadFirmware() {
    if(gitSyncServer.method() == HTTP_OPTIONS) { sendCorsHeaders(); gitSyncServer.send(200, _encoding_text, "OK"); return; }
    if(!sameOriginOrNone()) return;
    if(!isAuthenticatedSync(true)) return;
    if(!gitSyncServer.hasArg("ver")) {
      sendCorsHeaders();
      gitSyncServer.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Release version not supplied.\"}");
      return;
    }
    String ver = gitSyncServer.arg("ver");
    GitRelease *rel = findRelease(git.cachedReleases, ver.c_str());
    if(!rel) {
      // Filet de sécurité seulement (cache vide -- redémarrage récent sans être passé par
      // /getReleases au préalable) : un fetch bloquant supplémentaire ici est sans risque, cf.
      // commentaire sur handleGetReleases() -- ce serveur ne partage rien avec async_tcp.
      int16_t err = git.cachedReleases.getReleases();
      if(err != 0) {
        int httpStatus = (err >= 100 && err <= 599) ? err : 500;
        sendCorsHeaders();
        gitSyncServer.send(httpStatus, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error communicating with Github.\"}");
        return;
      }
      // Même horodatage que dans handleGetReleases() ci-dessus : ce chemin de secours remplit lui
      // aussi le cache.
      git.lastReleasesFetch = millis();
      rel = findRelease(git.cachedReleases, ver.c_str());
    }
    if(!rel) {
      sendCorsHeaders();
      gitSyncServer.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Release not found in repo.\"}");
      return;
    }
    SyncRespBuffer resp;
    if(!resp.ok()) {
      sendCorsHeaders();
      gitSyncServer.send(503, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Out of memory building the release payload.\"}");
      return;
    }
    JsonFormatter json;
    json.begin(resp.buf, WEB_MAX_RESPONSE);
    json.beginObject();
    rel->toJSON(json);
    json.endObject();
    sendCorsHeaders();
    // Contrôle AVANT d'armer la mise à jour (cf. P-8 dans handleGetReleases ci-dessus) : si la
    // réponse est invalide, le client ne saura pas quelle version il installe. On ne déclenche
    // donc pas un reflash sur une réponse qu'on sait cassée.
    if(json.overflowed()) {
      gitSyncServer.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Release payload too large to serialize.\"}");
      return;
    }
    strcpy(git.targetRelease, rel->name);
    git.status = GIT_AWAITING_UPDATE;
    gitSyncServer.send(200, _encoding_json, resp.buf);
  }

  void begin() {
    // INDISPENSABLE, et c'était l'omission qui cassait tout ce module. gitSyncServer est un
    // WebServer SYNCHRONE : contrairement à AsyncWebServerRequest, il ne conserve QUE les en-têtes
    // déclarés ici (le défaut de la bibliothèque se limite à "Authorization"). Sans cet appel :
    //   - gitSyncServer.hasHeader("apikey") renvoyait TOUJOURS false, donc isAuthenticatedSync()
    //     répondait systématiquement 401 dès qu'un PIN ou un mot de passe était configuré :
    //     l'installation OTA depuis l'interface était purement et simplement inutilisable ;
    //   - gitSyncServer.header("Origin") renvoyait toujours "", donc sendCorsHeaders() retombait
    //     sur "Access-Control-Allow-Origin: *" -- l'inverse exact de l'intention documentée en tête
    //     de ce fichier.
    // Le commentaire de Web::begin() ("pas d'équivalent à collectHeaders() nécessaire") ne vaut que
    // pour ESPAsyncWebServer ; il avait été transposé par erreur à ce serveur-ci.
    static const char *collected[] = { "apikey", "Origin" };
    gitSyncServer.collectHeaders(collected, sizeof(collected) / sizeof(collected[0]));
    gitSyncServer.on("/getReleases", handleGetReleases);
    gitSyncServer.on("/downloadFirmware", handleDownloadFirmware);
    // Toute autre route sur ce port est une erreur de configuration côté client (mauvais port) --
    // pas de contenu à servir ici, contrairement à `server`@80.
    gitSyncServer.onNotFound([]() { sendCorsHeaders(); gitSyncServer.send(404, _encoding_text, "404: Not Found"); });
    gitSyncServer.begin();
    Serial.println("Git sync server started (OTA release check/install, port " + String(GIT_SYNC_SERVER_PORT) + ")...");
  }

  void loop() {
    gitSyncServer.handleClient();
  }
}
