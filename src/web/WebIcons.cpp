// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <LittleFS.h>
#include "Utils.h"   // wdtReset()
#include "FwInfo.h"   // fsLocked
#include "ConfigSettings.h"
#include "Web.h"
#include "WebCommon.h"
#include "WebIcons.h"

extern Web webServer;
extern ConfigSettings settings;

#define ICON_PACK_TMP "/icons/upload.tmp"
// Le pack par défaut pèse 2,8 Ko gzippé : 16 Ko laisse de la marge à un pack tiers sans menacer
// la place des langues et de la sauvegarde sur la partition spiffs.
#define MAX_ICON_PACK_SIZE (16 * 1024)

namespace WebIcons {
  // Même règle que l'id d'un pack côté page (15-icons.js) : il finit dans settings et la sauvegarde.
  static bool isValidPackId(const String &id) {
    if(id.length() == 0 || id.length() >= sizeof(settings.iconPack)) return false;
    for(size_t i = 0; i < id.length(); i++) {
      char c = id.charAt(i);
      if(!islower((unsigned char)c) && !isdigit((unsigned char)c) && c != '-') return false;
    }
    return true;
  }
  static void rememberPack(const char *id) {
    if(strcmp(settings.iconPack, id) == 0) return;
    strlcpy(settings.iconPack, id, sizeof(settings.iconPack));
    settings.save();
  }

  // Même patron que l'upload de langue (WebI18n.cpp) : temporaire, contrôle gzip, renommage. Un
  // échec à n'importe quelle étape laisse l'ancien pack en place.
  struct UploadState { bool success = false; bool rejected = false; bool writeFailed = false; bool tooBig = false; uint32_t written = 0; };

  static void handleIcons(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    // 404 = pas de pack : la page garde le défaut. « wanted » nomme le pack d'une sauvegarde
    // restaurée dont le fichier manque encore, que la page va chercher dans le catalogue.
    if(!LittleFS.exists(ICON_PACK_FILE)) {
      char buf[96];
      snprintf(buf, sizeof(buf), "{\"error\":\"no icon pack\",\"wanted\":\"%s\"}", settings.iconPack);
      request->send(404, _encoding_json, buf);
      return;
    }
    webServer.handleStreamFile(request, "/icons/pack.json", _encoding_json, false, true);
  }

  static void handleDeleteIcons(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(fsLocked) {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }
    if(LittleFS.exists(ICON_PACK_FILE)) LittleFS.remove(ICON_PACK_FILE);
    rememberPack("");
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleUploadIcons(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    UploadState *state = (UploadState *)request->_tempObject;
    if(state && state->tooBig) {
      LittleFS.remove(ICON_PACK_TMP);
      char buf[64];
      snprintf(buf, sizeof(buf), "{\"error\":\"icon pack too large\",\"max\":%d}", MAX_ICON_PACK_SIZE);
      request->send(413, _encoding_json, buf);
      return;
    }
    if(!state || !state->success) {
      LittleFS.remove(ICON_PACK_TMP);
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Upload failed\"}");
      return;
    }
    if(!isValidPackId(request->arg("id"))) {
      LittleFS.remove(ICON_PACK_TMP);
      request->send(400, _encoding_json, "{\"error\":\"invalid id\"}");
      return;
    }
    if(fsLocked) {
      LittleFS.remove(ICON_PACK_TMP);
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }
    // Même dernier filet que /uploadLang : en-tête gzip deflate et taille minimale d'un flux.
    File check = LittleFS.open(ICON_PACK_TMP, "r");
    bool validGzip = false;
    if(check && check.size() >= 18) {
      validGzip = check.read() == 0x1F && check.read() == 0x8B && check.read() == 0x08;
    }
    if(check) check.close();
    if(!validGzip) {
      Serial.println("uploadIcons: contenu rejete -- ce n'est pas un flux gzip valide");
      LittleFS.remove(ICON_PACK_TMP);
      request->send(400, _encoding_json, "{\"error\":\"invalid gzip content\"}");
      return;
    }
    if(LittleFS.exists(ICON_PACK_FILE)) LittleFS.remove(ICON_PACK_FILE);
    if(!LittleFS.rename(ICON_PACK_TMP, ICON_PACK_FILE)) {
      Serial.println("uploadIcons: renommage refuse par LittleFS");
      request->send(500, _encoding_json, "{\"error\":\"rename failed\"}");
      return;
    }
    rememberPack(request->arg("id").c_str());
    Serial.printf("uploadIcons: pack %s installe (%u octets)\n", settings.iconPack, (unsigned)state->written);
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleUploadIconsBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    wdtReset();
    if(index == 0) {
      UploadState *state = (UploadState *)malloc(sizeof(UploadState));
      if(!state) return;
      state->success = false;
      state->writeFailed = false;
      state->written = 0;
      // Le corps multipart dépasse le fichier de quelques centaines d'octets d'en-têtes : 2 Ko de
      // tolérance pour refuser d'emblée un envoi manifestement trop gros, sans rien écrire.
      state->tooBig = request->contentLength() > MAX_ICON_PACK_SIZE + 2048;
      // Avant handleUploadIcons() et son isAuthenticated() : cf. handleUploadLangBody().
      state->rejected = state->tooBig || fsLocked || !webServer.checkAuth(request, true);
      request->_tempObject = state;
      if(state->rejected) {
        Serial.printf("uploadIcons: refuse (%s)\n", state->tooBig ? "trop gros" : fsLocked ? "filesystem occupe" : "non authentifie");
        return;
      }
      LittleFS.mkdir("/icons");
      if(!fsUploadLockAcquire(ICON_PACK_TMP)) {
        Serial.println("uploadIcons: impossible d'ouvrir le fichier temporaire");
        state->rejected = true;
        return;
      }
      request->onDisconnect([]() { fsUploadLockRelease(); });
    }
    UploadState *state = (UploadState *)request->_tempObject;
    if(!state || state->rejected) return;
    if(state->written + len > MAX_ICON_PACK_SIZE) state->tooBig = true;
    if(state->tooBig || !fsUploadWrite(data, len)) state->writeFailed = true;
    else state->written += len;
    if(final) {
      state->success = !state->writeFailed;
      fsUploadLockRelease();
    }
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/icons", AsyncHttp::GET, [](AsyncWebServerRequest *request) { handleIcons(request); });
    server.on("/deleteIcons", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleDeleteIcons(request); });
    server.on("/uploadIcons", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleUploadIcons(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUploadIconsBody(request, filename, index, data, len, final); });
  }
}
