#ifndef GITOTA_H
#define GITOTA_H
#include <Arduino.h>
#include <ArduinoJson.h>
#include <atomic>
#include <time.h>
#include "ConfigSettings.h"
#include "WResp.h"

#define GITHUB_REPOSITORY "xkain/TESTRTS"

#define GIT_MAX_RELEASES 5
#define GIT_STATUS_READY 0
#define GIT_STATUS_CHECK 1
#define GIT_AWAITING_UPDATE 2
#define GIT_UPDATING 3
#define GIT_UPDATE_COMPLETE 4
#define GIT_UPDATE_CANCELLING 5
#define GIT_UPDATE_CANCELLED 6

// Encadrement des nouvelles tentatives de résolution d'une langue en attente
// (cf. GitUpdater::pendingLangRetryMs / checkPendingLang()).
#define PENDING_LANG_RETRY_MIN 15000
#define PENDING_LANG_RETRY_MAX 300000

class GitRelease {
public:
  uint64_t id = 0;
  bool draft = false;
  bool preRelease = false;
  bool main = false;
  bool hasFS = false;
  char hwVersions[128] = "";
  // Codes langue (séparés par des virgules) détectés parmi les assets de cette release dont le
  // nom correspond au patron ESPSomfyRTS_<tag>_lang_<code>.json.gz -- cf. package_langs.py /
  // build.yaml (Phase 1 i18n). Alimente /getAvailableLangs (Phase 2).
  char availableLangs[64] = "";
  time_t releaseDate;
  char name[32] = "";
  appver_t version;
  void setReleaseProperty(const char *key, const char *val);
  void setAssetProperty(const char *key, const char *val);
  void toJSON(JsonFormatter &json);
};

class GitRepo {
public:
  int16_t getReleases(uint8_t num = GIT_MAX_RELEASES);
  GitRelease releases[GIT_MAX_RELEASES + 1];
  void toJSON(JsonFormatter &json);
};

class GitUpdater {
public:
  // std::atomic : vérifié par de nombreux handlers Web (potentiellement sur la tâche async_tcp
  // après migration ESPAsyncWebServer) pendant qu'il est écrit par git.loop() sur la tâche
  // principale -- garantit une visibilité correcte inter-tâches du gel/dégel du filesystem.
  std::atomic<bool> lockFS{false};
  bool canCancel = true;
  uint8_t status = 0;
  uint32_t lastCheck = 0;
  bool updateAvailable = false;
  bool inetAvailable = false;
  appver_t latest;
  bool cancelled = false;
  int16_t error = 0;
  char targetRelease[32];
  char currentFile[96] = ""; // Augmenté à 96 pour sécuriser les longs noms v3 + LBC
  char baseUrl[128] = "";
  int partition = 0;
  void checkForUpdate();
  bool beginUpdate(const char *release);
  bool endUpdate();
  int8_t downloadFile();
  void setFirmwareFile(const char *version); // Corrigé : ajout de l'argument version
  void setCurrentRelease(GitRepo &repo);
  void loop();
  void toJSON(JsonFormatter &json);
  bool recoverFilesystem();
  int checkInternet();
  void emitUpdateCheck(uint8_t num=255);
  void emitDownloadProgress(size_t total, size_t loaded, const char *evt = "updateProgress");
  void emitDownloadProgress(uint8_t num, size_t total, size_t loaded, const char *evt = "updateProgress");
  // Téléchargement à la demande d'un fichier de langue (Phase 2 i18n), sur le même patron que
  // downloadFile() (WiFiClientSecure/HTTPClient/lockFS) mais ciblant un simple fichier LittleFS
  // au lieu d'une partition flash via Update -- ne partage donc pas la machine à états
  // status/GIT_* de la mise à jour firmware (pas de redémarrage à prévoir ici).
  int8_t downloadLangFile(const char *code);
  void emitLangDownloadProgress(const char *code, size_t total, size_t loaded);
  void emitLangDownloadComplete(const char *code, bool success);
  // Requête différée pour /getReleases (étape 2 migration ESPAsyncWebServer) : le handler HTTP ne
  // fait plus l'appel HTTPS/TLS bloquant lui-même (dangereux sous ESPAsyncWebServer, cf. audit --
  // bloquerait la tâche async_tcp et donc tous les autres clients pendant la durée de l'appel). Il
  // se contente de positionner releasesRequested à true et de retourner immédiatement l'état
  // courant de cachedReleases (éventuellement vide/périmé au tout premier appel) ; c'est
  // GitUpdater::loop() qui effectue le fetch réel sur la tâche principale, au même titre que
  // checkForUpdate()/checkPendingLang() ci-dessous.
  bool releasesRequested = false;
  GitRepo cachedReleases;
  // Même principe que releasesRequested, pour /downloadLang (téléchargement de langue déclenché
  // manuellement depuis l'UI, à ne pas confondre avec pendingLang qui est la résolution
  // automatique en mode AP ci-dessous). Chaîne vide = aucune requête en attente.
  char requestedLangCode[8] = "";
  // Langue "en attente" (mode AP, cf. ConfigSettings::pendingLang) : tentative périodique dès
  // qu'une vraie connectivité Internet est disponible, indépendante du cycle quotidien de
  // checkForUpdate() -- voir GitUpdater::loop().
  uint32_t lastPendingLangCheck = 0;
  // Délai avant la prochaine tentative, volontairement variable : une absence de connectivité
  // juste après l'arrivée sur le réseau (DHCP/DNS encore en cours) se débloque souvent en
  // quelques secondes et ne doit pas coûter la pénalité pleine, alors qu'un vrai échec de
  // téléchargement n'a aucune raison de réussir en réessayant tout de suite. Backoff progressif
  // depuis PENDING_LANG_RETRY_MIN, plafonné à PENDING_LANG_RETRY_MAX pour ne pas sonder
  // indéfiniment un réseau local réellement sans accès Internet. Cf. checkPendingLang().
  uint32_t pendingLangRetryMs = PENDING_LANG_RETRY_MIN;
  void checkPendingLang();
};
#endif
