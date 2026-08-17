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

  // Repris de Web::isAuthenticated() (Web.cpp) sans dupliquer la logique de vérification -- même
  // appel à webServer.createAPIToken() (HMAC IP+secret, indépendant du transport), seule
  // l'extraction de l'en-tête/IP diffère entre WebServer (ici) et AsyncWebServerRequest (là-bas).
  static bool isAuthenticatedSync(bool cfg) {
    if(settings.Security.type == security_types::None) return true;
    if(!cfg && (settings.Security.permissions & static_cast<uint8_t>(security_permissions::ConfigOnly)) == 0x01) return true;
    if(gitSyncServer.hasHeader("apikey")) {
      char token[65];
      memset(token, 0x00, sizeof(token));
      webServer.createAPIToken(gitSyncServer.client().remoteIP(), token);
      if(String(token) == gitSyncServer.header("apikey")) return true;
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
    JsonFormatter json;
    json.begin(g_content, WEB_MAX_RESPONSE);
    json.beginObject();
    git.cachedReleases.toJSON(json);
    json.endObject();
    sendCorsHeaders();
    gitSyncServer.send(200, _encoding_json, g_content);
  }

  static void handleDownloadFirmware() {
    if(gitSyncServer.method() == HTTP_OPTIONS) { sendCorsHeaders(); gitSyncServer.send(200, _encoding_text, "OK"); return; }
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
    JsonFormatter json;
    json.begin(g_content, WEB_MAX_RESPONSE);
    json.beginObject();
    rel->toJSON(json);
    json.endObject();
    strcpy(git.targetRelease, rel->name);
    git.status = GIT_AWAITING_UPDATE;
    sendCorsHeaders();
    gitSyncServer.send(200, _encoding_json, g_content);
  }

  void begin() {
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
