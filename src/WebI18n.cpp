#include <WebServer.h>
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include "ConfigSettings.h"
#include "WResp.h"
#include "Web.h"
#include "GitOTA.h"
#include "WebCommon.h"
#include "WebI18n.h"

extern ConfigSettings settings;
extern Web webServer;
extern GitUpdater git;

#define MAX_LANG_CATALOG_ENTRIES 24

namespace WebI18n {
  // Validation stricte partagée par tous les endpoints qui reçoivent un code langue en paramètre
  // (handleSetLang/handleDownloadLang/handleDeleteLang/handleUploadLang) : celui-ci sert à
  // construire un chemin de fichier LittleFS, donc on n'accepte que des caractères
  // alphanumériques/tiret dans la limite de la taille du champ -- évite toute tentative
  // d'injection de chemin (ex: "../../secret").
  static bool isValidLangCode(const String &code) {
    if(code.length() == 0 || code.length() >= sizeof(settings.language)) return false;
    for(size_t i = 0; i < code.length(); i++) {
      char c = code.charAt(i);
      if(!isalnum((unsigned char)c) && c != '-') return false;
    }
    return true;
  }

  static void handleLang(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if (server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }

    char filename[48];
    snprintf(filename, sizeof(filename), "/locale/%s.json.gz", settings.language);

    // Langue non présente sur le filesystem (jamais téléchargée, ou code obsolète après un
    // reset) : on retombe sur la langue embarquée d'usine plutôt que de renvoyer une erreur.
    if (!LittleFS.exists(filename)) {
        strlcpy(filename, "/locale/" DEFAULT_EMBEDDED_LANG ".json.gz", sizeof(filename));
    }

    if (LittleFS.exists(filename)) {
        File file = LittleFS.open(filename, "r");

        // --- MÉTHODE D'ENVOI MANUELLE (Identique à handleStreamFile) ---
        server.setContentLength(file.size());
        server.sendHeader("Content-Encoding", "gzip");

        // On envoie le Type MIME JSON
        server.send(200, "application/json", "");

        // Envoi du binaire compressé
        server.client().write(file);

        file.close();
    } else {
        DBG_PRINT("Lang file not found: ");
        DBG_PRINTLN(filename);
        server.send(404, "text/plain", "Lang file not found");
    }
  }

  static void handleLangDefault(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(strcmp(settings.language, DEFAULT_EMBEDDED_LANG) == 0) { server.send(204); return; }
    webServer.handleStreamFile(server, "/locale/" DEFAULT_EMBEDDED_LANG ".json.gz", _encoding_json);
  }

  static void handleSetLang(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) {
      server.send(200, "OK");
      return;
    }

    if(!server.hasArg("lang")) {
      server.send(400, _encoding_json, "{\"error\":\"missing lang\"}");
      return;
    }

    String lang = server.arg("lang");
    if(!isValidLangCode(lang)) {
      server.send(400, _encoding_json, "{\"error\":\"invalid lang\"}");
      return;
    }

    strlcpy(settings.language, lang.c_str(), sizeof(settings.language));
    // Un choix explicite de langue annule toute mise en attente précédente (cf. /setPendingLang) --
    // sinon un pendingLang obsolète pourrait basculer la langue plus tard sans que l'utilisateur
    // s'y attende.
    if(settings.pendingLang[0] != '\0') settings.pendingLang[0] = '\0';
    settings.save();
    server.send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  // Langue choisie en mode AP (pas de route Internet côté ESP32, cf. GitUpdater::checkPendingLang())
  // : enregistre le choix sans tenter de téléchargement, appliqué automatiquement dès qu'une vraie
  // connexion Internet sera disponible. arg "clear" annule une mise en attente en cours.
  static void handleSetPendingLang(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }

    if(server.hasArg("clear")) {
      settings.pendingLang[0] = '\0';
      settings.save();
      server.send(200, _encoding_json, "{\"status\":\"ok\"}");
      return;
    }

    if(!server.hasArg("code")) {
      server.send(400, _encoding_json, "{\"error\":\"missing code\"}");
      return;
    }
    String code = server.arg("code");
    if(!isValidLangCode(code)) {
      server.send(400, _encoding_json, "{\"error\":\"invalid code\"}");
      return;
    }

    strlcpy(settings.pendingLang, code.c_str(), sizeof(settings.pendingLang));
    settings.save();
    server.send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  // Marque l'assistant de premier démarrage comme terminé (Terminer/Ignorer) ou le réinitialise
  // (entrée "Relancer l'assistant" du menu Système).
  static void handleSetOnboardingDone(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }

    if(!server.hasArg("done")) {
      server.send(400, _encoding_json, "{\"error\":\"missing done\"}");
      return;
    }
    settings.onboardingDone = server.arg("done").toInt() != 0;
    settings.save();
    server.send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  // Ne fait plus l'appel HTTPS/TLS bloquant ici (dangereux sous ESPAsyncWebServer : bloquerait la
  // tâche async_tcp, donc tous les autres clients, pendant toute la durée du téléchargement). Se
  // contente de valider puis de déclencher la requête (traitée par git.loop() sur la tâche
  // principale, cf. GitOTA.h::requestedLangCode) et répond 202 -- le résultat réel (succès/échec)
  // n'est plus connu au moment de la réponse HTTP, downloadLangFile() continue de l'émettre via
  // l'évènement socket "langDownloadComplete" comme c'était déjà le cas pour checkPendingLang().
  static void handleDownloadLang(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    if(git.lockFS) {
      server.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }
    if(git.requestedLangCode[0] != '\0') {
      server.send(409, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"A language download is already in progress\"}");
      return;
    }
    if(!server.hasArg("code")) {
      server.send(400, _encoding_json, "{\"error\":\"missing code\"}");
      return;
    }
    String code = server.arg("code");
    if(!isValidLangCode(code)) {
      server.send(400, _encoding_json, "{\"error\":\"invalid code\"}");
      return;
    }

    strlcpy(git.requestedLangCode, code.c_str(), sizeof(git.requestedLangCode));
    server.send(202, _encoding_json, "{\"status\":\"queued\"}");
  }

  static void handleDeleteLang(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    if(git.lockFS) {
      server.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }
    if(!server.hasArg("code")) {
      server.send(400, _encoding_json, "{\"error\":\"missing code\"}");
      return;
    }
    String code = server.arg("code");
    if(!isValidLangCode(code)) {
      server.send(400, _encoding_json, "{\"error\":\"invalid code\"}");
      return;
    }
    // La langue embarquée d'usine reste le filet de sécurité universel de handleLang() -- ne
    // doit jamais pouvoir être supprimée, sous peine de casser le repli automatique en cas de
    // langue active manquante.
    if(code == DEFAULT_EMBEDDED_LANG) {
      server.send(400, _encoding_json, "{\"error\":\"cannot delete default fallback language\"}");
      return;
    }
    // La langue actuellement active ne peut pas être supprimée sous les pieds de l'utilisateur --
    // il doit d'abord en choisir une autre.
    if(code == settings.language) {
      server.send(400, _encoding_json, "{\"error\":\"cannot delete active language\"}");
      return;
    }

    char path[32];
    snprintf(path, sizeof(path), "/locale/%s.json.gz", code.c_str());
    if(!LittleFS.exists(path)) {
      server.send(404, _encoding_json, "{\"error\":\"not installed\"}");
      return;
    }
    LittleFS.remove(path);
    server.send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleGetInstalledLangs(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if (server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }

    // Liste les langues réellement présentes sur LittleFS (Phase 0 : uniquement celles
    // embarquées au build ; à partir de la Phase 2, inclura aussi la langue téléchargée à la
    // demande). Sert à peupler #langSelect dynamiquement côté frontend.
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginArray();
    File dir = LittleFS.open("/locale");
    if (dir && dir.isDirectory()) {
        File entry = dir.openNextFile();
        while (entry) {
            if (!entry.isDirectory()) {
                String name = entry.name();
                int slash = name.lastIndexOf('/');
                if (slash >= 0) name = name.substring(slash + 1);
                if (name.endsWith(".json.gz")) {
                    String code = name.substring(0, name.length() - strlen(".json.gz"));
                    resp.addElem(code.c_str());
                }
            }
            entry.close();
            entry = dir.openNextFile();
        }
        dir.close();
    }
    resp.endArray();
    resp.endResponse();
    server.client().stop();
  }

  static void handleGetAvailableLangs(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if (server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, false)) return;

    // Catalogue fusionné : langues installées sur LittleFS (comme /getInstalledLangs) + langues
    // téléchargeables listées dans le manifeste embarqué (/manifest.json) et, si joignable,
    // affinées par les assets réels de la release GitHub correspondant au firmware en cours
    // (settings.fwVersion) -- cf. GitRelease::availableLangs.
    struct LangCatalogEntry { char code[8]; bool installed; bool downloadable; };
    LangCatalogEntry entries[MAX_LANG_CATALOG_ENTRIES];
    uint8_t count = 0;

    File dir = LittleFS.open("/locale");
    if (dir && dir.isDirectory()) {
        File entry = dir.openNextFile();
        while (entry) {
            if (!entry.isDirectory()) {
                String name = entry.name();
                int slash = name.lastIndexOf('/');
                if (slash >= 0) name = name.substring(slash + 1);
                if (name.endsWith(".json.gz") && count < MAX_LANG_CATALOG_ENTRIES) {
                    String code = name.substring(0, name.length() - strlen(".json.gz"));
                    strlcpy(entries[count].code, code.c_str(), sizeof(entries[count].code));
                    entries[count].installed = true;
                    entries[count].downloadable = false;
                    count++;
                }
            }
            entry.close();
            entry = dir.openNextFile();
        }
        dir.close();
    }

    // Manifeste embarqué (data/manifest.json, cf. minify_data.py) : garantit un catalogue
    // utilisable même hors-ligne (mode AP/hotspot), où la requête GitHub ci-dessous échoue
    // systématiquement faute de route Internet côté ESP32 (net.softAPOpened). Toute langue listée
    // ici est marquée "downloadable" par défaut ; la disponibilité réelle est de toute façon
    // revérifiée au moment du téléchargement (direct ou relais navigateur).
    if (LittleFS.exists("/manifest.json")) {
        File mf = LittleFS.open("/manifest.json", "r");
        DynamicJsonDocument doc(2048);
        DeserializationError err = deserializeJson(doc, mf);
        mf.close();
        if (!err && doc.containsKey("langs")) {
            JsonObject langs = doc["langs"].as<JsonObject>();
            for (JsonPair kv : langs) {
                const char *code = kv.key().c_str();
                bool found = false;
                for (uint8_t j = 0; j < count; j++) {
                    if (strcmp(entries[j].code, code) == 0) { entries[j].downloadable = true; found = true; break; }
                }
                if (!found && count < MAX_LANG_CATALOG_ENTRIES) {
                    strlcpy(entries[count].code, code, sizeof(entries[count].code));
                    entries[count].installed = false;
                    entries[count].downloadable = true;
                    count++;
                }
            }
        }
    }

    // Raffinement en ligne (facultatif) : si GitHub est joignable, on confirme/complète via les
    // assets réels de la release en cours -- sans ça, le manifeste embarqué ci-dessus suffit déjà
    // à afficher un catalogue correct hors-ligne.
    GitRepo repo;
    if (repo.getReleases(GIT_MAX_RELEASES) == 0) {
        for (uint8_t i = 0; i < GIT_MAX_RELEASES; i++) {
            if (repo.releases[i].id == 0) continue;
            if (repo.releases[i].version.compare(settings.fwVersion) != 0) continue;
            char buff[64];
            strlcpy(buff, repo.releases[i].availableLangs, sizeof(buff));
            char *tok = strtok(buff, ",");
            while (tok) {
                bool found = false;
                for (uint8_t j = 0; j < count; j++) {
                    if (strcmp(entries[j].code, tok) == 0) { entries[j].downloadable = true; found = true; break; }
                }
                if (!found && count < MAX_LANG_CATALOG_ENTRIES) {
                    strlcpy(entries[count].code, tok, sizeof(entries[count].code));
                    entries[count].installed = false;
                    entries[count].downloadable = true;
                    count++;
                }
                tok = strtok(nullptr, ",");
            }
            break;
        }
    }

    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginArray();
    for (uint8_t i = 0; i < count; i++) {
        resp.beginObject();
        resp.addElem("code", entries[i].code);
        resp.addElem("installed", entries[i].installed);
        resp.addElem("downloadable", entries[i].downloadable);
        resp.endObject();
    }
    resp.endArray();
    resp.endResponse();
    server.client().stop();
  }

  // Phase 4 i18n : relais navigateur en mode AP/hotspot -- l'ESP32 n'a alors aucune route
  // Internet propre (cf. net.softAPOpened), donc c'est le navigateur du client (potentiellement
  // connecté en parallèle via 4G/5G) qui va chercher le contenu de la langue sur GitHub et le
  // pousse ici, plutôt que /downloadLang (qui échouerait faute de réseau côté ESP32). Même patron
  // d'upload multipart que /restore, mais un flag dédié (langUploadSuccess) pour ne pas coupler
  // les deux flux.
  static void handleUploadLang(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    server.sendHeader("Connection", "close");

    const char *tempPath = "/locale/upload.json.gz.tmp";
    if(!webServer.langUploadSuccess) {
      LittleFS.remove(tempPath);
      server.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Upload failed\"}");
      return;
    }
    if(!server.hasArg("code")) {
      LittleFS.remove(tempPath);
      server.send(400, _encoding_json, "{\"error\":\"missing code\"}");
      return;
    }
    String code = server.arg("code");
    if(!isValidLangCode(code)) {
      LittleFS.remove(tempPath);
      server.send(400, _encoding_json, "{\"error\":\"invalid code\"}");
      return;
    }
    if(git.lockFS) {
      LittleFS.remove(tempPath);
      server.send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }

    // Même validation minimale que downloadLangFile() (GitOTA.cpp) : en-tête gzip présent.
    File check = LittleFS.open(tempPath, "r");
    bool validGzip = check && check.size() >= 2 && check.read() == 0x1F && check.read() == 0x8B;
    if(check) check.close();
    if(!validGzip) {
      LittleFS.remove(tempPath);
      server.send(400, _encoding_json, "{\"error\":\"invalid gzip content\"}");
      return;
    }

    char finalPath[32];
    snprintf(finalPath, sizeof(finalPath), "/locale/%s.json.gz", code.c_str());
    if(LittleFS.exists(finalPath)) LittleFS.remove(finalPath);
    if(!LittleFS.rename(tempPath, finalPath)) {
      server.send(500, _encoding_json, "{\"error\":\"rename failed\"}");
      return;
    }
    server.send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleUploadLangBody(WebServer &server) {
    esp_task_wdt_reset();
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      webServer.langUploadSuccess = false;
      File fup = LittleFS.open("/locale/upload.json.gz.tmp", "w");
      fup.close();
    }
    else if (upload.status == UPLOAD_FILE_WRITE) {
      File fup = LittleFS.open("/locale/upload.json.gz.tmp", "a");
      fup.write(upload.buf, upload.currentSize);
      fup.close();
    }
    else if (upload.status == UPLOAD_FILE_END) {
      webServer.langUploadSuccess = true;
    }
  }

  void registerRoutes(WebServer &server) {
    server.on("/lang", HTTP_GET, [&server]() { handleLang(server); });
    server.on("/langDefault", HTTP_GET, [&server]() { handleLangDefault(server); });
    server.on("/setLang", HTTP_GET, [&server]() { handleSetLang(server); });
    server.on("/setPendingLang", HTTP_POST, [&server]() { handleSetPendingLang(server); });
    server.on("/setOnboardingDone", HTTP_POST, [&server]() { handleSetOnboardingDone(server); });
    server.on("/getInstalledLangs", HTTP_GET, [&server]() { handleGetInstalledLangs(server); });
    server.on("/getAvailableLangs", HTTP_GET, [&server]() { handleGetAvailableLangs(server); });
    server.on("/downloadLang", HTTP_POST, [&server]() { handleDownloadLang(server); });
    server.on("/deleteLang", HTTP_POST, [&server]() { handleDeleteLang(server); });
    server.on("/uploadLang", HTTP_POST, [&server]() { handleUploadLang(server); }, [&server]() { handleUploadLangBody(server); });
  }

  // --- Surcharges ESPAsyncWebServer (étape 3 migration, non câblées pour l'instant) ---
  // /uploadLang (upload multipart) volontairement absente : réservée à l'étape 4 (gestion des
  // uploads sous ESPAsyncWebServer -- état par-requête au lieu des flags globaux uploadSuccess/
  // langUploadSuccess, cf. audit).

  static void handleLang(AsyncWebServerRequest *request) {
    if (request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    char filename[48];
    snprintf(filename, sizeof(filename), "/locale/%s.json", settings.language);
    // Langue non présente sur le filesystem (jamais téléchargée, ou code obsolète après un reset) :
    // on retombe sur la langue embarquée d'usine plutôt que de renvoyer une erreur. On teste les
    // deux variantes (nue et .gz) puisque handleStreamFile() ne reçoit jamais le suffixe .gz --
    // c'est AsyncFileResponse qui le détecte et le sert lui-même.
    if (!LittleFS.exists(filename) && !LittleFS.exists(String(filename) + ".gz")) {
        strlcpy(filename, "/locale/" DEFAULT_EMBEDDED_LANG ".json", sizeof(filename));
    }
    webServer.handleStreamFile(request, filename, "application/json");
  }

  static void handleLangDefault(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(strcmp(settings.language, DEFAULT_EMBEDDED_LANG) == 0) { request->send(204); return; }
    webServer.handleStreamFile(request, "/locale/" DEFAULT_EMBEDDED_LANG ".json", _encoding_json);
  }

  static void handleSetLang(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!request->hasArg("lang")) {
      request->send(400, _encoding_json, "{\"error\":\"missing lang\"}");
      return;
    }
    String lang = request->arg("lang");
    if(!isValidLangCode(lang)) {
      request->send(400, _encoding_json, "{\"error\":\"invalid lang\"}");
      return;
    }
    strlcpy(settings.language, lang.c_str(), sizeof(settings.language));
    if(settings.pendingLang[0] != '\0') settings.pendingLang[0] = '\0';
    settings.save();
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleSetPendingLang(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(request->hasArg("clear")) {
      settings.pendingLang[0] = '\0';
      settings.save();
      request->send(200, _encoding_json, "{\"status\":\"ok\"}");
      return;
    }
    if(!request->hasArg("code")) {
      request->send(400, _encoding_json, "{\"error\":\"missing code\"}");
      return;
    }
    String code = request->arg("code");
    if(!isValidLangCode(code)) {
      request->send(400, _encoding_json, "{\"error\":\"invalid code\"}");
      return;
    }
    strlcpy(settings.pendingLang, code.c_str(), sizeof(settings.pendingLang));
    settings.save();
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleSetOnboardingDone(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!request->hasArg("done")) {
      request->send(400, _encoding_json, "{\"error\":\"missing done\"}");
      return;
    }
    settings.onboardingDone = request->arg("done").toInt() != 0;
    settings.save();
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleDownloadLang(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(git.lockFS) {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }
    if(git.requestedLangCode[0] != '\0') {
      request->send(409, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"A language download is already in progress\"}");
      return;
    }
    if(!request->hasArg("code")) {
      request->send(400, _encoding_json, "{\"error\":\"missing code\"}");
      return;
    }
    String code = request->arg("code");
    if(!isValidLangCode(code)) {
      request->send(400, _encoding_json, "{\"error\":\"invalid code\"}");
      return;
    }
    strlcpy(git.requestedLangCode, code.c_str(), sizeof(git.requestedLangCode));
    request->send(202, _encoding_json, "{\"status\":\"queued\"}");
  }

  static void handleDeleteLang(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(git.lockFS) {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }
    if(!request->hasArg("code")) {
      request->send(400, _encoding_json, "{\"error\":\"missing code\"}");
      return;
    }
    String code = request->arg("code");
    if(!isValidLangCode(code)) {
      request->send(400, _encoding_json, "{\"error\":\"invalid code\"}");
      return;
    }
    if(code == DEFAULT_EMBEDDED_LANG) {
      request->send(400, _encoding_json, "{\"error\":\"cannot delete default fallback language\"}");
      return;
    }
    if(code == settings.language) {
      request->send(400, _encoding_json, "{\"error\":\"cannot delete active language\"}");
      return;
    }
    char path[32];
    snprintf(path, sizeof(path), "/locale/%s.json.gz", code.c_str());
    if(!LittleFS.exists(path)) {
      request->send(404, _encoding_json, "{\"error\":\"not installed\"}");
      return;
    }
    LittleFS.remove(path);
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleGetInstalledLangs(AsyncWebServerRequest *request) {
    if (request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginArray();
    File dir = LittleFS.open("/locale");
    if (dir && dir.isDirectory()) {
        File entry = dir.openNextFile();
        while (entry) {
            if (!entry.isDirectory()) {
                String name = entry.name();
                int slash = name.lastIndexOf('/');
                if (slash >= 0) name = name.substring(slash + 1);
                if (name.endsWith(".json.gz")) {
                    String code = name.substring(0, name.length() - strlen(".json.gz"));
                    resp.addElem(code.c_str());
                }
            }
            entry.close();
            entry = dir.openNextFile();
        }
        dir.close();
    }
    resp.endArray();
    resp.endResponse();
  }

  static void handleGetAvailableLangs(AsyncWebServerRequest *request) {
    if (request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;

    struct LangCatalogEntry { char code[8]; bool installed; bool downloadable; };
    LangCatalogEntry entries[MAX_LANG_CATALOG_ENTRIES];
    uint8_t count = 0;

    File dir = LittleFS.open("/locale");
    if (dir && dir.isDirectory()) {
        File entry = dir.openNextFile();
        while (entry) {
            if (!entry.isDirectory()) {
                String name = entry.name();
                int slash = name.lastIndexOf('/');
                if (slash >= 0) name = name.substring(slash + 1);
                if (name.endsWith(".json.gz") && count < MAX_LANG_CATALOG_ENTRIES) {
                    String code = name.substring(0, name.length() - strlen(".json.gz"));
                    strlcpy(entries[count].code, code.c_str(), sizeof(entries[count].code));
                    entries[count].installed = true;
                    entries[count].downloadable = false;
                    count++;
                }
            }
            entry.close();
            entry = dir.openNextFile();
        }
        dir.close();
    }

    if (LittleFS.exists("/manifest.json")) {
        File mf = LittleFS.open("/manifest.json", "r");
        DynamicJsonDocument doc(2048);
        DeserializationError err = deserializeJson(doc, mf);
        mf.close();
        if (!err && doc.containsKey("langs")) {
            JsonObject langs = doc["langs"].as<JsonObject>();
            for (JsonPair kv : langs) {
                const char *code = kv.key().c_str();
                bool found = false;
                for (uint8_t j = 0; j < count; j++) {
                    if (strcmp(entries[j].code, code) == 0) { entries[j].downloadable = true; found = true; break; }
                }
                if (!found && count < MAX_LANG_CATALOG_ENTRIES) {
                    strlcpy(entries[count].code, code, sizeof(entries[count].code));
                    entries[count].installed = false;
                    entries[count].downloadable = true;
                    count++;
                }
            }
        }
    }

    // Ne fait plus l'appel HTTPS/TLS bloquant ici (dangereux sous ESPAsyncWebServer -- même
    // constat que /getReleases et /downloadLang dans l'audit, non repéré à l'origine pour cette
    // route précise). Réutilise le catalogue déjà mis en cache par /getReleases (git.cachedReleases,
    // cf. GitOTA.h::releasesRequested) au lieu de refaire un fetch synchrone : peut être vide/périmé
    // si /getReleases n'a encore jamais été sollicité, dégradation identique au cas hors-ligne déjà
    // géré ci-dessus (manifeste embarqué seul). Déclenche quand même un rafraîchissement en tâche de
    // fond pour bénéficier aux appels suivants.
    git.releasesRequested = true;
    for (uint8_t i = 0; i < GIT_MAX_RELEASES; i++) {
        if (git.cachedReleases.releases[i].id == 0) continue;
        if (git.cachedReleases.releases[i].version.compare(settings.fwVersion) != 0) continue;
        char buff[64];
        strlcpy(buff, git.cachedReleases.releases[i].availableLangs, sizeof(buff));
        char *tok = strtok(buff, ",");
        while (tok) {
            bool found = false;
            for (uint8_t j = 0; j < count; j++) {
                if (strcmp(entries[j].code, tok) == 0) { entries[j].downloadable = true; found = true; break; }
            }
            if (!found && count < MAX_LANG_CATALOG_ENTRIES) {
                strlcpy(entries[count].code, tok, sizeof(entries[count].code));
                entries[count].installed = false;
                entries[count].downloadable = true;
                count++;
            }
            tok = strtok(nullptr, ",");
        }
        break;
    }

    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginArray();
    for (uint8_t i = 0; i < count; i++) {
        resp.beginObject();
        resp.addElem("code", entries[i].code);
        resp.addElem("installed", entries[i].installed);
        resp.addElem("downloadable", entries[i].downloadable);
        resp.endObject();
    }
    resp.endArray();
    resp.endResponse();
  }

  // /uploadLang : même patron d'upload par-requête que WebSystem::handleRestore (cf. commentaire
  // sur UploadState là-bas) -- request->_tempObject remplace webServer.langUploadSuccess, libéré
  // automatiquement par le destructeur d'AsyncWebServerRequest.
  struct UploadState { bool success = false; };

  static void handleUploadLang(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;

    const char *tempPath = "/locale/upload.json.gz.tmp";
    UploadState *state = (UploadState *)request->_tempObject;
    if(!state || !state->success) {
      LittleFS.remove(tempPath);
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Upload failed\"}");
      return;
    }
    if(!request->hasArg("code")) {
      LittleFS.remove(tempPath);
      request->send(400, _encoding_json, "{\"error\":\"missing code\"}");
      return;
    }
    String code = request->arg("code");
    if(!isValidLangCode(code)) {
      LittleFS.remove(tempPath);
      request->send(400, _encoding_json, "{\"error\":\"invalid code\"}");
      return;
    }
    if(git.lockFS) {
      LittleFS.remove(tempPath);
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Filesystem update in progress\"}");
      return;
    }

    // Même validation minimale que downloadLangFile() (GitOTA.cpp) : en-tête gzip présent.
    File check = LittleFS.open(tempPath, "r");
    bool validGzip = check && check.size() >= 2 && check.read() == 0x1F && check.read() == 0x8B;
    if(check) check.close();
    if(!validGzip) {
      LittleFS.remove(tempPath);
      request->send(400, _encoding_json, "{\"error\":\"invalid gzip content\"}");
      return;
    }

    char finalPath[32];
    snprintf(finalPath, sizeof(finalPath), "/locale/%s.json.gz", code.c_str());
    if(LittleFS.exists(finalPath)) LittleFS.remove(finalPath);
    if(!LittleFS.rename(tempPath, finalPath)) {
      request->send(500, _encoding_json, "{\"error\":\"rename failed\"}");
      return;
    }
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleUploadLangBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    esp_task_wdt_reset();
    if (index == 0) {
      UploadState *state = (UploadState *)malloc(sizeof(UploadState));
      state->success = false;
      request->_tempObject = state;
      File fup = LittleFS.open("/locale/upload.json.gz.tmp", "w");
      fup.close();
    }
    File fup = LittleFS.open("/locale/upload.json.gz.tmp", "a");
    fup.write(data, len);
    fup.close();
    if (final) {
      UploadState *state = (UploadState *)request->_tempObject;
      if(state) state->success = true;
    }
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/lang", AsyncHttp::GET, [](AsyncWebServerRequest *request) { handleLang(request); });
    server.on("/langDefault", AsyncHttp::GET, [](AsyncWebServerRequest *request) { handleLangDefault(request); });
    server.on("/setLang", AsyncHttp::GET, [](AsyncWebServerRequest *request) { handleSetLang(request); });
    server.on("/setPendingLang", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleSetPendingLang(request); });
    server.on("/setOnboardingDone", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleSetOnboardingDone(request); });
    server.on("/getInstalledLangs", AsyncHttp::GET, [](AsyncWebServerRequest *request) { handleGetInstalledLangs(request); });
    server.on("/getAvailableLangs", AsyncHttp::GET, [](AsyncWebServerRequest *request) { handleGetAvailableLangs(request); });
    server.on("/downloadLang", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleDownloadLang(request); });
    server.on("/deleteLang", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleDeleteLang(request); });
    // Callback d'upload enveloppé dans une lambda : handleUploadLangBody existe en deux surcharges
    // (WebServer&/AsyncWebServerRequest*) dans ce même namespace, ambiguës pour la conversion
    // implicite vers std::function attendue par on() si passées telles quelles.
    server.on("/uploadLang", AsyncHttp::POST, [](AsyncWebServerRequest *request) { handleUploadLang(request); },
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUploadLangBody(request, filename, index, data, len, final); });
  }
}
