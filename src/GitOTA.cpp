#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <LittleFS.h>
#include <Update.h>
#include <HTTPClient.h>
#include <esp_task_wdt.h>
#include "ConfigSettings.h"
#include "GitOTA.h"
#include "Utils.h"
#include "Sockets.h"
#include "Somfy.h"
#include "web/Web.h"
#include "web/WResp.h"
#include "Network.h"

extern ConfigSettings settings;
extern SocketEmitter sockEmit;
extern SomfyShadeController somfy;
extern rebootDelay_t rebootDelay;
extern Web webServer;
extern Network net;

#define MAX_BUFF_SIZE 4096

// Ajoute un label à hwVersions (séparé par une virgule) uniquement si ça tient dans le buffer.
// hwVersions provient de noms d'assets d'une release GitHub (réseau, TLS non vérifié via
// setInsecure()) : un nombre d'assets non borné ne doit jamais pouvoir dépasser le buffer fixe.
static void appendHwVersion(char *dest, size_t destSize, const char *label) {
  size_t curLen = strlen(dest);
  size_t sepLen = curLen > 0 ? 1 : 0;
  size_t labelLen = strlen(label);
  if(curLen + sepLen + labelLen < destSize) {
    if(sepLen) strcat(dest, ",");
    strcat(dest, label);
  }
}

void GitRelease::setReleaseProperty(const char *key, const char *val) {
  if(strcmp(key, "id") == 0) this->id = atol(val);
  else if(strcmp(key, "draft") == 0) this->draft = toBoolean(val, false);
  else if(strcmp(key, "prerelease") == 0) this->preRelease = toBoolean(val, false);
  else if(strcmp(key, "name") == 0) strlcpy(this->name, val, sizeof(this->name));
  else if(strcmp(key, "tag_name") == 0) {
    this->version.parse(val);
  }
  else if(strcmp(key, "published_at") == 0) {
    this->releaseDate = Timestamp::parseUTCTime(val);
  }
}

void GitRelease::setAssetProperty(const char *key, const char *val) {
  if(strcmp(key, "name") == 0) {
    if(strstr(val, "littlefs.bin")) this->hasFS = true;

    else if(strstr(val, "esp32.bin") && !strstr(val, "esp32s") && !strstr(val, "esp32c")) {
      #if defined(HARDWARE_BOX_ETH)
      // Le boîtier Ethernet ne doit valider l'asset que s'il contient "eth_"
      if(!strstr(val, "eth_")) return;
      #elif defined(HARDWARE_BOX_WIFI)
      // Le boîtier Wifi ne doit prendre que le firmware contenant "wifi_"
      if(!strstr(val, "wifi_")) return;
      #else
      // La version standard ignore les versions spéciaux "BOX"
      if(strstr(val, "_BOX_")) return;
      #endif

      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "32");
    }
    else if(strstr(val, "esp32wrover.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "wrover");
    }
    else if(strstr(val, "esp32s3.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "s3");
    }
    else if(strstr(val, "esp32s2.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "s2");
    }
    else if(strstr(val, "esp32c3.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "c3");
    }
    else if(strstr(val, "esp32c2.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "c2");
    }
    else if(strstr(val, "esp32c6.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "c6");
    }
    else if(strstr(val, "esp32h2.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "h2");
    }
    else if(strstr(val, "_lang_") && strstr(val, ".json.gz")) {
      // Asset de langue (Phase 1/2 i18n) : ESPSomfyRTS_<tag>_lang_<code>.json.gz -- on extrait
      // le code entre "_lang_" et ".json.gz" et on le pousse dans availableLangs (même helper
      // d'accumulation CSV bornée que hwVersions, générique malgré son nom).
      const char *start = strstr(val, "_lang_") + strlen("_lang_");
      const char *end = strstr(start, ".json.gz");
      if(end && end > start && (size_t)(end - start) < 8) {
        char code[8];
        size_t len = end - start;
        strncpy(code, start, len);
        code[len] = '\0';
        appendHwVersion(this->availableLangs, sizeof(this->availableLangs), code);
      }
    }
  }
}

void GitRelease::toJSON(JsonFormatter &json) {
  Timestamp ts;
  char buff[20];
  sprintf(buff, "%llu", this->id);
  json.addElem("id", buff);
  json.addElem("name", this->name);
  json.addElem("date", ts.getISOTime(this->releaseDate));
  json.addElem("draft", this->draft);
  json.addElem("preRelease", this->preRelease);
  json.addElem("main", this->main);
  json.addElem("hasFS", this->hasFS);
  json.addElem("hwVersions", this->hwVersions);
  json.beginObject("version");
  this->version.toJSON(json);
  json.endObject();
}

#define ERR_CLIENT_OFFSET -50

int16_t GitRepo::getReleases(uint8_t num) {
  WiFiClientSecure sclient;
  sclient.setInsecure();
  sclient.setHandshakeTimeout(3);
  uint8_t ndx = 0;
  uint8_t count = min((uint8_t)GIT_MAX_RELEASES, num);
  char url[128];
  // Le memset() de this->releases est retardé jusqu'à la confirmation du succès HTTP (plus bas,
  // juste avant le parsing) plutôt que fait ici en tête de fonction : /getReleases sert
  // this->releases (cachedReleases) à chaud à chaque appel HTTP, donc le vider avant même de savoir
  // si la nouvelle requête va réussir fait disparaître un cache valide en cas d'échec réseau/TLS.
  // NB : pas de tampon local séparé (GitRelease[GIT_MAX_RELEASES+1] ~1,7 Ko) -- cette fonction est
  // aussi appelée avec un GitRepo local (checkForUpdate()) déjà volumineux sur la pile ; un tampon
  // supplémentaire y provoquait un dépassement de pile (stack canary / reboot).
  sprintf(url, "https://api.github.com/repos/" GITHUB_REPOSITORY "/releases?per_page=%d&page=1", count);
  Serial.printf("[GitOTA-DEBUG] getReleases() : requete vers %s\n", url);
  HTTPClient https;
  https.setReuse(false);
  if(https.begin(sclient, url)) {
    esp_task_wdt_reset();
    int httpCode = https.GET();
    Serial.printf("[GitOTA-DEBUG] https.GET() code retour = %d\n", httpCode);
    DBG_PRINTF("[HTTPS] GET... code: %d\n", httpCode);
    if(httpCode > 0) {
      int len = https.getSize();
      Serial.printf("[GitOTA-DEBUG] Content-Length annonce = %d\n", len);
      DBG_PRINTF("[HTTPS] GET... code: %d - %d\n", httpCode, len);
      if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY) {
        // Requête HTTP confirmée réussie : on peut maintenant vider le cache avant d'y écrire
        // les nouvelles données parsées ci-dessous.
        memset(this->releases, 0x00, sizeof(GitRelease) * GIT_MAX_RELEASES);
        WiFiClient *stream = https.getStreamPtr();
        uint8_t buff[128] = {0};
        char jsonElem[32] = "";
        char jsonValue[128] = "";
        int arrTok = 0;
        int objTok = 0;
        bool inQuote = false;
        bool inElem = false;
        bool inValue = false;
        bool awaitValue = false;
        bool inAss = false;
        while(https.connected() && (len > 0 || len == -1) && ndx < count) {
          size_t size = stream->available();
          if(size) {
            esp_task_wdt_reset();
            int c = stream->readBytes(buff, ((size > sizeof(buff)) ? sizeof(buff) : size));
            if(len > 0) len -= c;
            for(uint8_t i = 0; i < c; i++) {
              char ch = static_cast<char>(buff[i]);
              if(ch == '[') {
                arrTok++;
                if(arrTok == 2 && strcmp(jsonElem, "assets") == 0) {
                  inElem = inValue = awaitValue = false;
                  inAss = true;
                }
                else if(arrTok < 2) inAss = false;
              }
              else if(ch == ']') {
                arrTok--;
                if(arrTok < 2) inAss = false;
              }
              else if(ch == '{') {
                objTok++;
                if(objTok != 1 && !inAss) inElem = inValue = awaitValue = false;
              }
              else if(ch == '}') {
                objTok--;
                if(objTok == 0) ndx++;
              }
              else if(objTok == 1 || inAss) {
                if(ch == '\"') {
                  inQuote = !inQuote;
                  if(inElem) {
                    inElem = false;
                    awaitValue = true;
                  }
                  else if(inValue) {
                    inValue = false;
                    inElem = false;
                    awaitValue = false;
                    if(inAss)
                      this->releases[ndx].setAssetProperty(jsonElem, jsonValue);
                    else
                      this->releases[ndx].setReleaseProperty(jsonElem, jsonValue);
                    memset(jsonElem, 0x00, sizeof(jsonElem));
                    memset(jsonValue, 0x00, sizeof(jsonValue));
                  }
                  else if(awaitValue) inValue = true;
                  else {
                    inElem = true;
                    awaitValue = false;
                  }
                }
                else if(awaitValue) {
                  if(ch != ' ' && ch != ':') {
                    strncat(jsonValue, &ch, 1);
                    awaitValue = false;
                    inValue = true;
                  }
                }
                else if((!inQuote && ch == ',') || ch == '\r' || ch == '\n') {
                  inElem = inValue = awaitValue = false;
                  if(strlen(jsonElem) > 0) {
                    if(inAss)
                      this->releases[ndx].setAssetProperty(jsonElem, jsonValue);
                    else
                      this->releases[ndx].setReleaseProperty(jsonElem, jsonValue);
                  }
                  memset(jsonElem, 0x00, sizeof(jsonElem));
                  memset(jsonValue, 0x00, sizeof(jsonValue));
                }
                else {
                  if(inElem) {
                    if(strlen(jsonElem) < sizeof(jsonElem) - 1) strncat(jsonElem, &ch, 1);
                  }
                  else if(inValue) {
                    if(strlen(jsonValue) < sizeof(jsonValue) - 1) strncat(jsonValue, &ch, 1);
                  }
                }
              }
            }
            delay(1);
          }
        }
        Serial.printf("[GitOTA-DEBUG] parsing JSON termine : %u release(s) extraite(s) (boucle sortie via connected=%d, len restant=%d, ndx=%u/%u)\n",
          ndx, https.connected(), len, ndx, count);
      }
      else {
        Serial.printf("[GitOTA-DEBUG] echec HTTP, code %d != 200/301 -> requete abandonnee, cache precedent conserve\n", httpCode);
        https.end();
        sclient.stop();
        return httpCode;
      }
    }
    else {
      Serial.printf("[GitOTA-DEBUG] https.GET() a retourne un code <= 0 (%d) : timeout/erreur de transport\n", httpCode);
    }
    https.end();
    sclient.stop();
  }
  else {
    Serial.println("[GitOTA-DEBUG] https.begin() a echoue (DNS/TLS ?) : requete jamais envoyee, cache precedent conserve");
  }
  settings.printAvailHeap();
  return 0;
}

void GitRepo::toJSON(JsonFormatter &json) {
  json.beginObject("fwVersion");
  settings.fwVersion.toJSON(json);
  json.endObject();
  json.beginObject("appVersion");
  settings.appVersion.toJSON(json);
  json.endObject();
  json.beginArray("releases");
  for(uint8_t i = 0; i < GIT_MAX_RELEASES; i++) {
    if(this->releases[i].id == 0) continue;
    json.beginObject();
    this->releases[i].toJSON(json);
    json.endObject();
  }
  json.endArray();
}

#define UPDATE_ERR_OFFSET 20
#define ERR_DOWNLOAD_HTTP -40
#define ERR_DOWNLOAD_BUFFER -41
#define ERR_DOWNLOAD_CONNECTION -42

void GitUpdater::loop() {
  if(!net.connected()) return;
  if(this->status == GIT_STATUS_READY) {
    if(settings.checkForUpdate &&
      ((int32_t)(millis() - net.connectTime) >= 60000) &&
      (this->lastCheck == 0 || (int32_t)(millis() - this->lastCheck) >= 86400000) && !rebootDelay.reboot) {
      this->checkForUpdate();
      }
    // Langue en attente (mode AP) : indépendant du throttle quotidien ci-dessus -- on veut
    // l'appliquer dès que possible, pas attendre le prochain cycle de vérification firmware.
    // L'intervalle entre tentatives n'est pas fixe : il s'adapte à la raison du dernier échec
    // (cf. checkPendingLang()), pour ne pas transformer une connectivité pas encore prête en
    // plusieurs minutes d'interface restée dans l'ancienne langue.
    if(settings.pendingLang[0] != '\0' && !this->lockFS &&
      ((int32_t)(millis() - net.connectTime) >= PENDING_LANG_RETRY_MIN) &&
      (this->lastPendingLangCheck == 0 || (int32_t)(millis() - this->lastPendingLangCheck) >= (int32_t)this->pendingLangRetryMs) &&
      !rebootDelay.reboot) {
      this->checkPendingLang();
      }
    // Catalogue complet des releases pour /getAvailableLangs (WebI18n.cpp, cf. releasesRequested
    // dans GitOTA.h) : exécuté ici plutôt que dans le handler HTTP lui-même. /getReleases fait
    // maintenant son propre fetch synchrone directement dans son handler (WebSystem.cpp) et ne
    // passe plus par ce mécanisme.
    if(this->releasesRequested) {
      this->cachedReleases.getReleases();
      this->setCurrentRelease(this->cachedReleases);
      this->releasesRequested = false;
    }
    // Téléchargement de langue demandé par /downloadLang (étape 2 migration ESPAsyncWebServer) --
    // même principe que ci-dessus, cf. requestedLangCode dans GitOTA.h. downloadLangFile() gère
    // déjà lui-même lockFS et l'émission des évènements socket de progression/complétion.
    if(this->requestedLangCode[0] != '\0') {
      char code[8];
      strlcpy(code, this->requestedLangCode, sizeof(code));
      this->requestedLangCode[0] = '\0';
      this->downloadLangFile(code);
    }
  }
  else if(this->status == GIT_AWAITING_UPDATE) {
    DBG_PRINTLN("Starting update process....");
    this->status = GIT_UPDATING;
    this->beginUpdate(this->targetRelease);
    this->status = GIT_STATUS_READY;
    this->emitUpdateCheck();
  }
  else if(this->status == GIT_UPDATE_CANCELLING) {
    DBG_PRINTLN("Cancelling update process....");
    if(!this->lockFS) {
      this->status = GIT_UPDATE_CANCELLED;
      this->cancelled = true;
      this->emitUpdateCheck();
    }
  }
}

void GitUpdater::checkForUpdate() {
  if(this->status != 0) return;
  DBG_PRINTLN("Check github for updates...");

  this->status = GIT_STATUS_CHECK;
  settings.printAvailHeap();
  this->lastCheck = millis();
  if(this->checkInternet() == 0) {
    GitRepo repo;
    this->updateAvailable = false;
    this->error = repo.getReleases(2);
    if(this->error == 0) {
      this->setCurrentRelease(repo);
    }
    else {
      this->emitUpdateCheck();
    }
  }
  this->status = GIT_STATUS_READY;
}

void GitUpdater::setCurrentRelease(GitRepo &repo) {
  this->updateAvailable = false;
  for(uint8_t i = 0; i < 2; i++) {
    if(repo.releases[i].draft || repo.releases[i].preRelease || repo.releases[i].id == 0) continue;
    this->latest.copy(repo.releases[i].version);
    if(repo.releases[i].version.compare(settings.fwVersion) > 0) {
      this->updateAvailable = true;
    }
    break;
  }
  this->emitUpdateCheck();
}

void GitUpdater::toJSON(JsonFormatter &json) {
  json.addElem("available", this->updateAvailable);
  json.addElem("status", this->status);
  json.addElem("error", (int32_t)this->error);
  json.addElem("cancelled", this->cancelled);
  json.addElem("checkForUpdate", settings.checkForUpdate);
  json.addElem("inetAvailable", this->inetAvailable);
  json.beginObject("fwVersion");
  settings.fwVersion.toJSON(json);
  json.endObject();
  json.beginObject("appVersion");
  settings.appVersion.toJSON(json);
  json.endObject();
  json.beginObject("latest");
  this->latest.toJSON(json);
  json.endObject();
}

void GitUpdater::emitUpdateCheck(uint8_t num) {
  JsonSockEvent *json = sockEmit.beginEmit("fwStatus");
  json->beginObject();
  json->addElem("available", this->updateAvailable);
  json->addElem("status", this->status);
  json->addElem("error", (int32_t)this->error);
  json->addElem("cancelled", this->cancelled);
  json->addElem("checkForUpdate", settings.checkForUpdate);
  json->addElem("inetAvailable", this->inetAvailable);
  json->beginObject("fwVersion");
  settings.fwVersion.toJSON(json);
  json->endObject();
  json->beginObject("appVersion");
  settings.appVersion.toJSON(json);
  json->endObject();
  json->beginObject("latest");
  this->latest.toJSON(json);
  json->endObject();
  json->endObject();
  sockEmit.endEmit(num);
}

int GitUpdater::checkInternet() {
  int err = 500;
  uint32_t t = millis();
  WiFiClientSecure sclient;
  sclient.setInsecure();
  sclient.setHandshakeTimeout(3);
  esp_task_wdt_reset();
  HTTPClient https;
  https.setReuse(false);
  if(https.begin(sclient, "https://github.com/" GITHUB_REPOSITORY)) {
    https.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    https.setTimeout(3000);
    esp_task_wdt_reset();
    int httpCode = https.sendRequest("HEAD");
    esp_task_wdt_reset();
    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY || httpCode == HTTP_CODE_FOUND) {
      err = 0;
      DBG_PRINTF("Internet is Available: %ldms\n", millis() - t);
      this->inetAvailable = true;
    }
    else {
      err = httpCode;
      DBG_PRINTF("Internet is Unavailable: %d: %ldms\n", err, millis() - t);
      this->inetAvailable = false;
    }
    https.end();
    sclient.stop();
  }
  esp_task_wdt_reset();
  return err;
}

void GitUpdater::emitDownloadProgress(size_t total, size_t loaded, const char *evt) { this->emitDownloadProgress(255, total, loaded, evt); }
void GitUpdater::emitDownloadProgress(uint8_t num, size_t total, size_t loaded, const char *evt) {
  JsonSockEvent *json = sockEmit.beginEmit(evt);
  json->beginObject();
  json->addElem("ver", this->targetRelease);
  json->addElem("part", (int32_t)this->partition);
  json->addElem("file", this->currentFile);
  json->addElem("total", (uint32_t)total);
  json->addElem("loaded", (uint32_t)loaded);
  json->addElem("error", (uint32_t)this->error);
  json->endObject();
  sockEmit.endEmit(num);
  sockEmit.loop();
  webServer.loop();
}

void GitUpdater::setFirmwareFile(const char *version) {
  esp_chip_info_t ci;
  esp_chip_info(&ci);

  char suffix[32] = "esp32.bin";

  switch(ci.model) {
    case esp_chip_model_t::CHIP_ESP32S3:
      strlcpy(suffix, "esp32s3.bin", sizeof(suffix));
      break;
    case esp_chip_model_t::CHIP_ESP32S2:
      strlcpy(suffix, "esp32s2.bin", sizeof(suffix));
      break;
    case esp_chip_model_t::CHIP_ESP32C3:
      strlcpy(suffix, "esp32c3.bin", sizeof(suffix));
      break;
    case esp_chip_model_t::CHIP_ESP32:
      if (psramFound()) {
        strlcpy(suffix, "esp32wrover.bin", sizeof(suffix));
      } else {
        strlcpy(suffix, "esp32.bin", sizeof(suffix));
      }
      break;
    default:
      strlcpy(suffix, "esp32.bin", sizeof(suffix));
      break;
  }

  #if defined(HARDWARE_BOX_ETH)
  char ethSuffix[48];
  snprintf(ethSuffix, sizeof(ethSuffix), "eth_%s", suffix);
  snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_BOX_%s", version, ethSuffix);

  #elif defined(HARDWARE_BOX_WIFI)
  snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_BOX_wifi_%s", version, suffix);

  #else
  snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_%s", version, suffix);
  #endif
}

bool GitUpdater::beginUpdate(const char *version) {
  DBG_PRINTLN("Begin update called...");
  sprintf(this->baseUrl, "https://github.com/" GITHUB_REPOSITORY "/releases/download/%s/", version);

  strcpy(this->targetRelease, version);
  this->emitUpdateCheck();
  this->setFirmwareFile(version);
  this->partition = U_FLASH;
  this->lockFS = this->cancelled = false;
  this->error = 0;
  this->error = this->downloadFile();

  if(this->error == 0 && !this->cancelled) {
    somfy.commit();

    #if defined(HARDWARE_BOX_ETH)
    snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_BOX_eth_littlefs.bin", version);
    #elif defined(HARDWARE_BOX_WIFI)
    snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_BOX_wifi_littlefs.bin", version);
    #else
    snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_littlefs.bin", version);
    #endif

    this->partition = U_SPIFFS;
    this->lockFS = true;
    this->error = this->downloadFile();
    this->lockFS = false;

    if(this->error == 0) {
      settings.fwVersion.parse(version);
      delay(100);
      DBG_PRINTLN("Committing Configuration...");
      somfy.commit();
    }

    rebootDelay.rebootTime = millis() + 500;
    rebootDelay.reboot = true;
  }

  this->status = GIT_UPDATE_COMPLETE;
  this->emitUpdateCheck();
  return true;
}

bool GitUpdater::recoverFilesystem() {
  const char* currentVer = settings.fwVersion.name;
  sprintf(this->baseUrl, "https://github.com/" GITHUB_REPOSITORY "/releases/download/%s/", currentVer);

  // Correction appliquée : Choix du LittleFS de secours selon le matériel BOX
  #if defined(HARDWARE_BOX_ETH)
  snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_BOX_eth_littlefs.bin", currentVer);
  #elif defined(HARDWARE_BOX_WIFI)
  snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_BOX_wifi_littlefs.bin", currentVer);
  #else
  snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_littlefs.bin", currentVer);
  #endif

  this->status = GIT_UPDATING;
  this->partition = U_SPIFFS;
  this->lockFS = true;
  this->error = this->downloadFile();
  this->lockFS = false;
  if(this->error == 0) {
    delay(100);
    DBG_PRINTLN("Committing Configuration...");
    somfy.commit();
  }
  this->status = GIT_UPDATE_COMPLETE;
  rebootDelay.rebootTime = millis() + 500;
  rebootDelay.reboot = true;
  return true;
}

bool GitUpdater::endUpdate() { return true; }

int8_t GitUpdater::downloadFile() {
  DBG_PRINTF("Begin update %s\n", this->currentFile);
  WiFiClientSecure sclient;
  sclient.setInsecure();
  HTTPClient https;
  char url[196];
  sprintf(url, "%s%s", this->baseUrl, this->currentFile);
  DBG_PRINTLN(url);
  esp_task_wdt_reset();
  if(https.begin(sclient, url)) {
    https.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    DBG_PRINT("[HTTPS] GET...\n");
    int httpCode = https.GET();
    if(httpCode > 0) {
      size_t len = https.getSize();
      size_t total = 0;
      uint8_t pct = 0;
      DBG_PRINTF("[HTTPS] GET... code: %d - %d\n", httpCode, len);
      if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY || httpCode == HTTP_CODE_FOUND) {
        WiFiClient *stream = https.getStreamPtr();
        if(!Update.begin(len, this->partition)) {
          Serial.println("Update Error detected!!!!!");
          Update.printError(Serial);
          https.end();
          return -(Update.getError() + UPDATE_ERR_OFFSET);
        }
        uint8_t *buff = (uint8_t *)malloc(MAX_BUFF_SIZE);
        if(buff) {
          this->emitDownloadProgress(len, total);
          int timeouts = 0;
          while(https.connected() && (len > 0 || len == -1) && total < len) {
            size_t size = stream->available();
            esp_task_wdt_reset();
            if(size) {
              timeouts = 0;
              if(this->cancelled && !this->lockFS) {
                Update.abort();
                free(buff);
                https.end();
                return -(Update.getError() + UPDATE_ERR_OFFSET);
              }
              int c = stream->readBytes(buff, ((size > MAX_BUFF_SIZE) ? MAX_BUFF_SIZE : size));
              total += c;
              if (Update.write(buff, c) != c) {
                Update.printError(Serial);
                Serial.printf("Upload of %s aborted invalid size %d\n", url, c);
                free(buff);
                https.end();
                sclient.stop();
                return -(Update.getError() + UPDATE_ERR_OFFSET);
              }
              uint8_t p = (uint8_t)floor(((float)total / (float)len) * 100.0f);
              if(p != pct) {
                pct = p;
                DBG_PRINTF("LEN:%d TOTAL:%d %d%%\n", len, total, pct);
                this->emitDownloadProgress(len, total);
              }
              delay(1);
              if(total >= len) {
                if(!Update.end(true)) {
                  Serial.println("Error downloading update...");
                  Update.printError(Serial);
                }
                else {
                  DBG_PRINTLN("Update.end Called...");
                }
                https.end();
                sclient.stop();
              }
            }
            else {
              timeouts++;
              if(timeouts >= 500) {
                Update.abort();
                https.end();
                free(buff);
                Serial.println("Stream timeout!!!");
                return -43;
              }
              sockEmit.loop();
              webServer.loop();
              delay(100);
            }
          }
          free(buff);
          if(len > total) {
            Update.abort();
            somfy.commit();
            Serial.println("Error downloading file!!!");
            return -42;
          }
          else
            DBG_PRINTF("Update %s complete\n", this->currentFile);
        }
        else {
          Serial.println("Unable to allocate memory for update!!!");
        }
      }
      else {
        Serial.printf("Invalid HTTP Code... %d", httpCode);
        return httpCode;
      }
    }
    else {
      Serial.printf("Invalid HTTP Code: %d\n", httpCode);
    }
    https.end();
    sclient.stop();
    DBG_PRINTF("End update %s\n", this->currentFile);
  }
  esp_task_wdt_reset();
  return 0;
}

void GitUpdater::emitLangDownloadProgress(const char *code, size_t total, size_t loaded) {
  JsonSockEvent *json = sockEmit.beginEmit("langDownloadProgress");
  json->beginObject();
  json->addElem("code", code);
  json->addElem("total", (uint32_t)total);
  json->addElem("loaded", (uint32_t)loaded);
  json->endObject();
  sockEmit.endEmit();
  sockEmit.loop();
  webServer.loop();
}
void GitUpdater::emitLangDownloadComplete(const char *code, bool success) {
  JsonSockEvent *json = sockEmit.beginEmit("langDownloadComplete");
  json->beginObject();
  json->addElem("code", code);
  json->addElem("success", success);
  json->endObject();
  sockEmit.endEmit();
  sockEmit.loop();
  webServer.loop();
}

#define LANG_DOWNLOAD_BUFF_SIZE 1024

// Téléchargement à la demande d'un fichier de langue (Phase 2 i18n) : même patron réseau que
// downloadFile() (WiFiClientSecure/HTTPClient), mais écrit dans un simple fichier LittleFS
// plutôt que dans une partition flash via Update. Toujours vers un nom temporaire d'abord --
// /locale/temp.json.gz -- validé (taille non nulle + en-tête gzip correct) puis renommé vers
// /locale/<code>.json.gz seulement en cas de succès, pour ne jamais écraser une langue déjà
// installée et fonctionnelle par un téléchargement partiel ou corrompu.
int8_t GitUpdater::downloadLangFile(const char *code) {
  DBG_PRINTF("Downloading language file: %s\n", code);
  char url[196];
  snprintf(url, sizeof(url), "https://github.com/" GITHUB_REPOSITORY "/releases/download/%s/ESPSomfyRTS_%s_lang_%s.json.gz",
    settings.fwVersion.name, settings.fwVersion.name, code);
  DBG_PRINTLN(url);

  const char *tempPath = "/locale/temp.json.gz";
  WiFiClientSecure sclient;
  sclient.setInsecure();
  HTTPClient https;
  https.setReuse(false);
  esp_task_wdt_reset();

  this->lockFS = true;
  int8_t result = -1;

  if(https.begin(sclient, url)) {
    https.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    int httpCode = https.GET();
    if(httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY || httpCode == HTTP_CODE_FOUND) {
      size_t len = https.getSize();
      if(len == 0) {
        DBG_PRINTLN("Language download: empty response");
      }
      else {
        WiFiClient *stream = https.getStreamPtr();
        File f = LittleFS.open(tempPath, "w");
        if(f) {
          size_t total = 0;
          uint8_t buff[LANG_DOWNLOAD_BUFF_SIZE];
          int timeouts = 0;
          this->emitLangDownloadProgress(code, len, total);
          while(https.connected() && (len > 0 || len == -1) && total < len) {
            size_t size = stream->available();
            esp_task_wdt_reset();
            if(size) {
              timeouts = 0;
              int c = stream->readBytes(buff, ((size > sizeof(buff)) ? sizeof(buff) : size));
              f.write(buff, c);
              total += c;
              this->emitLangDownloadProgress(code, len, total);
              delay(1);
            }
            else {
              timeouts++;
              if(timeouts >= 500) {
                DBG_PRINTLN("Language download: stream timeout");
                break;
              }
              sockEmit.loop();
              webServer.loop();
              delay(10);
            }
          }
          f.close();
          if(total > 0 && total >= len) result = 0;
          else DBG_PRINTLN("Language download: incomplete transfer");
        }
        else {
          DBG_PRINTLN("Language download: unable to open temp file");
        }
      }
    }
    else {
      DBG_PRINTF("Language download: invalid HTTP code %d\n", httpCode);
    }
    https.end();
    sclient.stop();
  }

  // Validation minimale du contenu : en-tête gzip (0x1F 0x8B) présent -- suffisant pour
  // détecter une page d'erreur/redirection reçue avec un code 200 au lieu du vrai asset,
  // sans avoir besoin d'une bibliothèque de décompression embarquée.
  if(result == 0) {
    File check = LittleFS.open(tempPath, "r");
    if(!check || check.size() < 2 || check.read() != 0x1F || check.read() != 0x8B) {
      DBG_PRINTLN("Language download: invalid gzip header");
      result = -1;
    }
    if(check) check.close();
  }

  if(result == 0) {
    char finalPath[32];
    snprintf(finalPath, sizeof(finalPath), "/locale/%s.json.gz", code);
    if(LittleFS.exists(finalPath)) LittleFS.remove(finalPath);
    if(!LittleFS.rename(tempPath, finalPath)) {
      DBG_PRINTLN("Language download: rename failed");
      result = -1;
    }
  }
  if(result != 0) LittleFS.remove(tempPath);

  this->lockFS = false;
  this->emitLangDownloadComplete(code, result == 0);
  return result;
}

// Résolution de la langue en attente (cf. ConfigSettings::pendingLang, /setPendingLang) : appelée
// depuis loop() une fois la connectivité réseau établie. checkInternet() (déjà utilisé par
// checkForUpdate()) sert ici de garde silencieuse -- tant qu'aucune route Internet réelle n'existe
// (cas typique : Wi-Fi local sans accès Internet), on ne tente même pas downloadLangFile() et on
// ne déclenche donc aucun évènement socket d'échec qui spammerait un navigateur resté ouvert ;
// downloadLangFile() lui-même émet déjà langDownloadComplete (succès/échec), donc pas de double
// émission ici une fois la tentative réellement lancée.
void GitUpdater::checkPendingLang() {
  this->lastPendingLangCheck = millis();
  // Pas de connectivité Internet exploitable : on n'a RIEN tenté, donc pas de raison de payer
  // l'intervalle plein. C'est le cas courant dans les secondes qui suivent l'arrivée sur le
  // réseau local (DHCP/DNS encore en cours) -- typiquement juste après la fin de l'assistant de
  // premier démarrage, au moment précis où l'utilisateur attend sa langue. On double simplement
  // le délai à chaque échec, jusqu'au plafond, pour se débloquer vite dans ce cas transitoire
  // sans sonder indéfiniment un réseau réellement dépourvu d'accès Internet.
  if(this->checkInternet() != 0) {
    uint32_t next = this->pendingLangRetryMs * 2;
    this->pendingLangRetryMs = (next > PENDING_LANG_RETRY_MAX) ? PENDING_LANG_RETRY_MAX : next;
    DBG_PRINTF("Pending language: no internet yet, retry in %u ms\n", this->pendingLangRetryMs);
    return;
  }

  char code[8];
  strlcpy(code, settings.pendingLang, sizeof(code));
  DBG_PRINTF("Resolving pending language: %s\n", code);
  int8_t err = this->downloadLangFile(code);
  if(err == 0) {
    strlcpy(settings.language, code, sizeof(settings.language));
    settings.pendingLang[0] = '\0';
    settings.save();
    this->pendingLangRetryMs = PENDING_LANG_RETRY_MIN;
    DBG_PRINTF("Pending language applied: %s\n", code);
  }
  else {
    // Vrai échec de téléchargement (asset absent de la release, coupure en cours de transfert) :
    // contrairement au cas ci-dessus, réessayer tout de suite n'a aucune raison d'aboutir.
    this->pendingLangRetryMs = PENDING_LANG_RETRY_MAX;
    DBG_PRINTLN("Pending language download failed, will retry later");
  }
}
