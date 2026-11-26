// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include "Utils.h"   // wdtReset()
#include "ConfigSettings.h"
#include "WResp.h"
#include "Web.h"
#include "FwInfo.h"
#include "WebCommon.h"
#include "WebI18n.h"
#include "WebStatic.h"

extern ConfigSettings settings;
extern Web webServer;

#define MAX_LANG_CATALOG_ENTRIES 24
// Langue d'usine comprise, bien qu'elle vive dans l'application : deux packs au plus sur la
// partition spiffs (256 Ko), où un remplacement fait coexister l'ancienne et la nouvelle version.
#define MAX_INSTALLED_LANGS 3

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

  static bool isFactoryLang(const String &code) { return code == DEFAULT_EMBEDDED_LANG; }

  // Nom de fichier d'un pack (« de.json.gz ») vers son code, chaîne vide si ce n'en est pas un.
  // Un fichier au nom de la langue d'usine est ignoré : c'est toujours la copie de l'application
  // qui est servie.
  static String packCode(File &entry) {
    if(entry.isDirectory()) return String();
    String name = entry.name();
    int slash = name.lastIndexOf('/');
    if(slash >= 0) name = name.substring(slash + 1);
    if(!name.endsWith(".json.gz")) return String();
    String code = name.substring(0, name.length() - strlen(".json.gz"));
    return isFactoryLang(code) ? String() : code;
  }

  static void sendFactoryLang(AsyncWebServerRequest *request) {
    size_t len;
    const uint8_t *data = WebStatic::defaultLangGz(len);
    webServer.handleEmbeddedAsset(request, data, len, _encoding_json, false, false);
  }

  // Une langue déjà installée peut toujours être remplacée. Un seul parcours du dossier, sans
  // LittleFS.exists() : il journalise une erreur pour tout fichier absent.
  static bool langSlotAvailable(const String &code) {
    if(isFactoryLang(code)) return true;
    uint8_t count = 1;
    bool present = false;
    File dir = LittleFS.open("/locale");
    if(dir && dir.isDirectory()) {
      File entry = dir.openNextFile();
      while(entry) {
        String c = packCode(entry);
        if(c.length()) {
          count++;
          if(c == code) present = true;
        }
        entry.close();
        entry = dir.openNextFile();
      }
      dir.close();
    }
    return present || count < MAX_INSTALLED_LANGS;
  }

  static void sendLangLimit(AsyncWebServerRequest *request) {
    char buf[64];
    snprintf(buf, sizeof(buf), "{\"error\":\"lang limit reached\",\"max\":%d}", MAX_INSTALLED_LANGS);
    request->send(409, _encoding_json, buf);
  }

  static void handleLang(AsyncWebServerRequest *request) {
    if (request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    // Pack absent (jamais téléchargé, ou effacé par un reset) : repli sur la langue d'usine plutôt
    // qu'une erreur. handleStreamFile() prend le chemin sans .gz et ajoute le suffixe lui-même.
    if(strcmp(settings.language, DEFAULT_EMBEDDED_LANG) != 0) {
      char filename[32];
      snprintf(filename, sizeof(filename), "/locale/%s.json", settings.language);
      if(LittleFS.exists(String(filename) + ".gz")) {
        webServer.handleStreamFile(request, filename, _encoding_json, false, true);
        return;
      }
    }
    sendFactoryLang(request);
  }

  static void handleLangDefault(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(strcmp(settings.language, DEFAULT_EMBEDDED_LANG) == 0) { request->send(204); return; }
    sendFactoryLang(request);
  }

  static void handleSetLang(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    // cfg=false, exactement pour les mêmes raisons que handleSetOnboardingDone() ci-dessous : la
    // langue se choisit depuis le gestionnaire de langues, accessible en mode "config seule" avant
    // toute connexion -- exiger une clé API y renverrait un 401 sur un écran légitime. En sécurité
    // complète, l'authentification reste requise.
    // Sans ce contrôle, n'importe qui sur le réseau pouvait changer la langue de l'appareil et,
    // surtout, provoquer une écriture NVS (settings.save()) par requête -- usure de flash à la
    // fréquence des requêtes. Aggravé par la méthode GET, déclenchable en cross-origin par une
    // simple balise <img> sur les variantes compilées avec ENABLE_DEV_CORS.
    if(!webServer.isAuthenticated(request, false)) return;
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
    // Même raisonnement que handleSetLang() ci-dessus : la mise en attente se fait précisément en
    // mode AP, avant toute connexion, d'où cfg=false -- mais elle écrit elle aussi en NVS à chaque
    // appel et n'a aucune raison d'être ouverte quand la sécurité complète est active.
    if(!webServer.isAuthenticated(request, false)) return;
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
    if(!langSlotAvailable(code)) { sendLangLimit(request); return; }
    strlcpy(settings.pendingLang, code.c_str(), sizeof(settings.pendingLang));
    settings.save();
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleSetOnboardingDone(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    // cfg=false, à la différence de /downloadLang plus bas. Ce drapeau n'est qu'un état d'interface
    // (afficher ou non l'assistant de premier démarrage), pas un réglage sensible : le protéger
    // comme un point de configuration exigerait une clé API même en sécurité "config seule" -- or
    // dans ce mode l'assistant s'affiche AVANT toute connexion (cf. showAuthenticatedShellOrWizard()
    // et Security.init()), et "Ignorer" se prendrait alors un 401, faisant réapparaître l'assistant
    // au démarrage suivant. Avec cfg=false, la sécurité complète reste exigée (Web::isAuthenticated)
    // et le mode "config seule" continue de passer.
    // Sans ce contrôle, n'importe qui sur le réseau pouvait réarmer l'assistant à distance, et
    // provoquer une écriture NVS (settings.save()) par requête.
    if(!webServer.isAuthenticated(request, false)) return;
    if(!request->hasArg("done")) {
      request->send(400, _encoding_json, "{\"error\":\"missing done\"}");
      return;
    }
    settings.onboardingDone = request->arg("done").toInt() != 0;
    settings.save();
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleDeleteLang(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    if(!request->hasArg("code")) {
      request->send(400, _encoding_json, "{\"error\":\"missing code\"}");
      return;
    }
    String code = request->arg("code");
    if(!isValidLangCode(code)) {
      request->send(400, _encoding_json, "{\"error\":\"invalid code\"}");
      return;
    }
    if(isFactoryLang(code)) {
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
    if(!fsLockTake()) {
      webServer.sendError(request, 500, "Filesystem update in progress");
      return;
    }
    LittleFS.remove(path);
    fsLockGive();
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleGetInstalledLangs(AsyncWebServerRequest *request) {
    if (request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginArray();
    resp.addElem(DEFAULT_EMBEDDED_LANG);
    File dir = LittleFS.open("/locale");
    if (dir && dir.isDirectory()) {
        File entry = dir.openNextFile();
        while (entry) {
            String code = packCode(entry);
            if (code.length()) resp.addElem(code.c_str());
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
    strlcpy(entries[0].code, DEFAULT_EMBEDDED_LANG, sizeof(entries[0].code));
    entries[0].installed = true;
    entries[0].downloadable = false;
    uint8_t count = 1;

    File dir = LittleFS.open("/locale");
    if (dir && dir.isDirectory()) {
        File entry = dir.openNextFile();
        while (entry) {
            String code = packCode(entry);
            if (code.length() && count < MAX_LANG_CATALOG_ENTRIES) {
                strlcpy(entries[count].code, code.c_str(), sizeof(entries[count].code));
                entries[count].installed = true;
                entries[count].downloadable = false;
                count++;
            }
            entry.close();
            entry = dir.openNextFile();
        }
        dir.close();
    }

    {
        size_t mlen;
        const uint8_t *mdata = WebStatic::langManifest(mlen);
        DynamicJsonDocument doc(2048);
        DeserializationError err = deserializeJson(doc, (const char *)mdata, mlen);
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
  // sur UploadState là-bas) -- état alloué via request->_tempObject, libéré automatiquement par le
  // destructeur d'AsyncWebServerRequest, plutôt qu'un flag global partagé entre requêtes.
  // `rejected` : posé par handleUploadLangBody() si GitOTA était déjà occupé au moment où l'upload
  // a démarré (aucun octet écrit dans ce cas) -- fait retomber handleUploadLang() sur le même
  // message "Upload failed" que les autres échecs d'upload, `LittleFS.remove(tempPath)` restant un
  // no-op sûr sur un fichier jamais créé.
  // `writeFailed` : le résultat de CHAQUE écriture LittleFS doit être retenu -- une écriture courte
  // ou refusée (partition pleine, secteur défaillant, handle perdu) tronquerait sinon le fichier
  // sans que rien ne le remarque, `success` passant quand même à true au dernier paquet. Pour une
  // langue, cela donnerait un .json.gz coupé, renommé, puis servi par /lang avec
  // `Content-Encoding: gzip` : le navigateur répond « Erreur d'encodage de contenu ».
  struct UploadState { bool success = false; bool rejected = false; bool writeFailed = false; bool full = false; bool factory = false; uint32_t written = 0; };

  static void handleUploadLang(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }

    // Pas de LittleFS.remove() sur ce chemin, contrairement aux échecs plus bas : le temporaire
    // est partagé entre requêtes, et le supprimer ici permettrait à un appelant NON authentifié
    // de détruire l'upload légitime d'un autre client en cours. C'est sans objet de toute façon,
    // handleUploadLangBody() ne créant plus rien sans authentification.
    if(!webServer.isAuthenticated(request, true)) return;

    const char *tempPath = "/locale/upload.json.gz.tmp";
    UploadState *state = (UploadState *)request->_tempObject;
    if(state && state->full) { sendLangLimit(request); return; }
    if(state && state->factory) {
      request->send(400, _encoding_json, "{\"error\":\"factory language is built in\"}");
      return;
    }
    if(!state || !state->success) {
      // Refusé = jamais écrit : le temporaire appartient alors à un autre téléversement en cours.
      if(state && !state->rejected) LittleFS.remove(tempPath);
      webServer.sendError(request, 500, "Upload failed");
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
    if(!fsLockTake()) {
      webServer.sendError(request, 500, "Filesystem update in progress");
      return;
    }

    // Les DEUX octets magiques seuls ne suffisent pas : un fichier tronqué avec un en-tête intact
    // les porterait quand même, serait renommé en /locale/<code>.json.gz, puis servi par /lang avec
    // `Content-Encoding: gzip` -- le navigateur répond « Erreur d'encodage de contenu » sur CHAQUE
    // chargement, sans que rien côté firmware ne le signale.
    // On vérifie donc aussi la méthode de compression (0x08 = deflate, la seule que gzip définisse)
    // et une taille plausible : 18 octets est le minimum absolu d'un flux gzip valide (10 d'en-tête
    // + 8 de fin CRC32/ISIZE), donc tout ce qui est en dessous est tronqué à coup sûr.
    // Ce contrôle reste peu coûteux et NE PROUVE PAS l'intégrité du flux -- une coupure à 90 %
    // passerait encore. La vraie garantie est ailleurs : `state->writeFailed` ci-dessus, qui refuse
    // l'upload dès qu'une écriture n'a pas abouti, et l'absence du paquet `final` si la connexion
    // tombe. Ceci n'est qu'un dernier filet.
    File check = LittleFS.open(tempPath, "r");
    bool validGzip = false;
    if(check && check.size() >= 18) {
      validGzip = check.read() == 0x1F && check.read() == 0x8B && check.read() == 0x08;
    }
    if(check) check.close();
    if(!validGzip) {
      Serial.println("uploadLang: content rejected -- not a valid gzip stream (header or size)");
      LittleFS.remove(tempPath);
      fsLockGive();
      request->send(400, _encoding_json, "{\"error\":\"invalid gzip content\"}");
      return;
    }

    char finalPath[32];
    snprintf(finalPath, sizeof(finalPath), "/locale/%s.json.gz", code.c_str());
    if(LittleFS.exists(finalPath)) LittleFS.remove(finalPath);
    bool renamed = LittleFS.rename(tempPath, finalPath);
    fsLockGive();
    if(!renamed) {
      Serial.printf("uploadLang: rename to %s refused by LittleFS\n", finalPath);
      request->send(500, _encoding_json, "{\"error\":\"rename failed\"}");
      return;
    }
    Serial.printf("uploadLang: %s installed\n", finalPath);
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleUploadLangBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    wdtReset();
    if (index == 0) {
      UploadState *state = (UploadState *)malloc(sizeof(UploadState));
      // Test de nullité indispensable : cette allocation se fait précisément quand le tas est sous
      // pression (upload en cours) -- sans lui, un échec produirait un déréférencement nul immédiat
      // (reboot) au lieu du "Upload failed" propre déjà prévu par handleUploadLang().
      if(!state) return;
      state->success = false;
      state->writeFailed = false;
      state->full = false;
      state->factory = false;
      state->written = 0;
      // Refus AVANT toute écriture. Sous ESPAsyncWebServer ce callback s'exécute pendant l'analyse
      // de la requête, donc AVANT handleUploadLang() et son isAuthenticated() : sans ce test, un
      // POST non authentifié posait fsLocked (gelant planification et registre Somfy le temps du
      // transfert) et écrivait la totalité du corps sur LittleFS avant d'être refusé. checkAuth()
      // plutôt qu'isAuthenticated() parce qu'ici on ne peut pas répondre -- on serait au milieu de
      // la réception ; on réutilise le drapeau `rejected` déjà prévu pour le cas "GitOTA occupé",
      // qui fait retomber handleUploadLang() sur son "Upload failed" sans qu'un octet soit écrit.
      state->rejected = fsLocked || !webServer.checkAuth(request, true);
      // Plafond et langue d'usine vérifiés avant d'ouvrir le temporaire : refusé, l'envoi n'écrit
      // pas un octet. Un pack au nom de la langue d'usine ne serait jamais servi.
      if(!state->rejected && isFactoryLang(request->arg("code")))
        state->rejected = state->factory = true;
      else if(!state->rejected && isValidLangCode(request->arg("code")) && !langSlotAvailable(request->arg("code")))
        state->rejected = state->full = true;
      request->_tempObject = state;
      if(state->rejected)
        Serial.printf("uploadLang: refused (%s)\n", state->full ? "language limit reached" : state->factory ? "factory language" : fsLocked ? "filesystem busy" : "not authenticated");
      else
        Serial.println("uploadLang: receiving");
      // GitOTA a déjà la main sur le filesystem (firmware/langue en cours) : on n'écrit rien,
      // handleUploadLang() retombera sur "Upload failed" via state->success resté false.
      if(state->rejected) return;
      // Section critique FS : sans ce verrou, un écrit concurrent d'un autre acteur tournant sur la
      // tâche principale (planification, registre Somfy) pendant l'écriture par chunks ci-dessous
      // peut heurter LittleFS -- l'assert interne "lfs_mlist_isopen" est fatal (reboot immédiat).
      // fsLocked est le verrou déjà utilisé par le reste du code pour signaler "FS occupé, ne pas
      // toucher" (cf. Schedule.cpp, SomfyRegistry.cpp, WebI18n.cpp::handleDownloadLang/
      // handleDeleteLang) -- réutilisé ici côté écriture plutôt qu'inventer un 2e mécanisme. Relâché
      // au chunk final ci-dessous ; onDisconnect() sert de filet de sécurité si la connexion tombe
      // en cours de transfert -- sans lui, un upload interrompu laisserait ce verrou bloqué jusqu'au
      // reboot, gelant schedules/registre Somfy.
      // fsUploadLockAcquire()/fsUploadLockRelease() plutôt que fsLocked écrit directement (cf. le
      // commentaire détaillé dans WebCommon.h) : le rappel de déconnexion ci-dessous ne se
      // déclenche qu'à la fermeture de la CONNEXION, potentiellement bien après la fin de cet
      // upload -- il ne doit donc jamais relâcher un verrou repris entre-temps par une autre
      // opération.
      // Acquisition VÉRIFIÉE : entre le test de fsLocked ci-dessus et cette ligne, la tâche
      // principale a pu poser le verrou (téléchargement de langue, OTA). Écrire quand même
      // ferait cohabiter deux écrivains LittleFS -- le scénario "lfs_mlist_isopen" que ce verrou
      // existe précisément pour empêcher. On retombe alors sur le refus normal, aucun octet écrit.
      // L'acquisition ouvre aussi le fichier : plus d'open/append/close par paquet reçu.
      // Le filesystem d'usine est vide : /locale n'existe qu'après le premier pack.
      LittleFS.mkdir("/locale");
      if(!fsUploadLockAcquire("/locale/upload.json.gz.tmp")) {
        Serial.println("uploadLang: cannot open the temporary file (filesystem busy or full)");
        state->rejected = true;
        return;
      }
      request->onDisconnect([]() { fsUploadLockRelease(); });
    }
    UploadState *state = (UploadState *)request->_tempObject;
    if(!state || state->rejected) return;
    if(!fsUploadWrite(data, len)) {
      // Une seule ligne, au PREMIER échec : la suite du transfert continuerait d'en produire une
      // par paquet, ce qui noierait le motif initial.
      if(!state->writeFailed)
        Serial.printf("uploadLang: write FAILED after %u bytes (heap or filesystem)\n", (unsigned)state->written);
      state->writeFailed = true;
    }
    else state->written += len;
    if (final) {
      state->success = !state->writeFailed;
      fsUploadLockRelease();
      Serial.printf("uploadLang: received, %u bytes, %s\n",
        (unsigned)state->written, state->success ? "ok" : "FAILED");
    }
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/lang", AsyncHttp::GET, handleLang);
    server.on("/langDefault", AsyncHttp::GET, handleLangDefault);
    server.on("/setLang", AsyncHttp::GET, handleSetLang);
    server.on("/setPendingLang", AsyncHttp::POST, handleSetPendingLang);
    server.on("/setOnboardingDone", AsyncHttp::POST, handleSetOnboardingDone);
    server.on("/getInstalledLangs", AsyncHttp::GET, handleGetInstalledLangs);
    server.on("/getAvailableLangs", AsyncHttp::GET, handleGetAvailableLangs);
    server.on("/deleteLang", AsyncHttp::POST, handleDeleteLang);
    // Callback d'upload enveloppé dans une lambda : sa signature ne correspond pas exactement au
    // std::function attendu par on() sans cette conversion explicite (idem WebSystem.cpp).
    server.on("/uploadLang", AsyncHttp::POST, handleUploadLang,
      [](AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) { handleUploadLangBody(request, filename, index, data, len, final); });
  }
}
