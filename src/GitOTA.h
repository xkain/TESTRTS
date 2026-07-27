#ifndef GITOTA_H
#define GITOTA_H
#include <Arduino.h>
#include <ArduinoJson.h>
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
  void toJSON(JsonResponse &json);
};

class GitRepo {
public:
  int16_t getReleases(uint8_t num = GIT_MAX_RELEASES);
  GitRelease releases[GIT_MAX_RELEASES + 1];
  void toJSON(JsonResponse &json);
};

class GitUpdater {
public:
  bool lockFS = false;
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
  void toJSON(JsonResponse &json);
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
};
#endif
