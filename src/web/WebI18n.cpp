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

  static void handleLang(AsyncWebServerRequest *request) {
    if (request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    char filename[48];
    snprintf(filename, sizeof(filename), "/locale/%s.json", settings.language);
    char gzFilename[56];
    snprintf(gzFilename, sizeof(gzFilename), "%s.gz", filename);
    // Variante .gz testée EN PREMIER (17/08/2026) : c'est le cas courant et, en pratique, le seul --
    // downloadLangFile() comme handleUploadLang() écrivent tous deux en /locale/<code>.json.gz.
    // L'ordre inverse coûtait TROIS recherches perdues à chaque chargement de page (le exists() nu
    // ici, celui de handleStreamFile(), puis la tentative d'AsyncFileResponse avant son repli .gz),
    // chacune produisant une ligne d'erreur rouge sur la liaison série : LittleFS.exists() passe par
    // VFSImpl::open(), qui journalise en niveau E tout fichier absent. Ce n'étaient pas des échecs
    // -- le fichier était bien servi -- mais le bruit faisait passer un fonctionnement nominal pour
    // une panne.
    bool gzipped = LittleFS.exists(gzFilename);
    if (!gzipped && !LittleFS.exists(filename)) {
        // Langue absente du filesystem (jamais téléchargée, ou code obsolète après un reset) : repli
        // sur la langue embarquée d'usine plutôt qu'une erreur. Elle est TOUJOURS gzippée (cf.
        // build_data_image.py::_embed_default_language), d'où alwaysGzipped=true sans nouveau test.
        strlcpy(filename, "/locale/" DEFAULT_EMBEDDED_LANG ".json", sizeof(filename));
        gzipped = true;
    }
    // alwaysGzipped renseigné plutôt que laissé à false : handleStreamFile() interroge alors
    // directement la bonne variante, en un seul lookup toujours gagnant.
    webServer.handleStreamFile(request, filename, "application/json", false, gzipped);
  }

  static void handleLangDefault(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(strcmp(settings.language, DEFAULT_EMBEDDED_LANG) == 0) { request->send(204); return; }
    // Contrairement à handleLang() ci-dessus (settings.language, potentiellement une langue
    // téléchargée à l'exécution donc jamais gzippée), DEFAULT_EMBEDDED_LANG est TOUJOURS la langue
    // embarquée par le build (cf. build_data_image.py::_embed_default_language, toujours gzippée) --
    // alwaysGzipped=true est donc sûr ici.
    webServer.handleStreamFile(request, "/locale/" DEFAULT_EMBEDDED_LANG ".json", _encoding_json, false, true);
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
    // Rafraîchissement en tâche de fond seulement si le cache est vide ou périmé (17/08/2026).
    // Auparavant inconditionnel : comme l'UI appelle loadLangCatalog() depuis une dizaine
    // d'endroits, ouvrir la modale du gestionnaire -- même pour activer une langue DÉJÀ INSTALLÉE,
    // sans rien télécharger -- déclenchait à chaque fois un aller-retour TLS complet vers GitHub,
    // soit 3 à 5 s de blocage de la tâche principale. Reproduit en usage réel jusqu'au
    // redémarrage watchdog. Le catalogue ne change qu'à la publication d'une release : le servir
    // depuis le cache est le comportement correct, pas une optimisation.
    // PLUS AUCUN rafraîchissement déclenché depuis cette route (24/08/2026). Le correctif du
    // 17/08 avait supprimé le fetch SYNCHRONE d'ici, mais laissé l'armement d'un fetch de fond,
    // exécuté sur la tâche principale par GitUpdater::loop(). Relevé sur matériel : ouvrir le
    // gestionnaire de langues bloquait encore loopTask 5,4 s (`Timing WebServer: 5402ms`) et
    // creusait le plus gros bloc contigu de 73716 à 38900, la région principale tombant à 2556
    // octets libres au pire. C'est-à-dire exactement au moment où l'utilisateur s'apprête à
    // TÉLÉVERSER un pack de langue -- l'écriture LittleFS suivante se faisait donc au plus bas du
    // tas. Un téléversement de fr.json a échoué ainsi en usage réel, sans laisser de fichier.
    //
    // Ce fetch n'apportait par ailleurs rien ici. La boucle ci-dessus ne retient que la release
    // dont la version ÉGALE celle installée (`compare(settings.fwVersion) != 0` -> continue), la
    // seule que downloadLangFile() sache télécharger puisqu'il construit son URL à partir de
    // `settings.fwVersion.name`. Or les langues de CETTE release sont déjà toutes décrites par
    // /manifest.json, embarqué depuis `locales/manifest.json` -- la source même dont le workflow
    // de build tire les assets de langue publiés. Les deux listes ne peuvent pas diverger.
    //
    // Le cache reste exploité s'il se trouve rempli par ailleurs (page Firmware, /getReleases sur
    // le port 8082) : on ne perd que le déclenchement, pas la lecture.
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
  // sur UploadState là-bas) -- état alloué via request->_tempObject, libéré automatiquement par le
  // destructeur d'AsyncWebServerRequest, plutôt qu'un flag global partagé entre requêtes.
  // `rejected` (audit heap OTA satellite, 15/08/2026) : posé par handleUploadLangBody() si GitOTA
  // était déjà occupé au moment où l'upload a démarré (aucun octet écrit dans ce cas) -- fait
  // retomber handleUploadLang() sur le même message "Upload failed" que les autres échecs
  // d'upload, `LittleFS.remove(tempPath)` restant un no-op sûr sur un fichier jamais créé.
  // `writeFailed` (24/08/2026) : une écriture LittleFS courte ou refusée -- partition pleine,
  // secteur défaillant, handle perdu -- tronquait le fichier SANS que rien ne le remarque, et
  // `success` passait quand même à true au dernier paquet. Le fichier tronqué était alors traité
  // comme valide. Pour une langue, cela donne un .json.gz coupé, renommé, puis servi par /lang
  // avec `Content-Encoding: gzip` : le navigateur répond « Erreur d'encodage de contenu » et
  // n'affiche plus rien. Le résultat de chaque écriture est désormais retenu.
  struct UploadState { bool success = false; bool rejected = false; bool writeFailed = false; uint32_t written = 0; };

  static void handleUploadLang(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }

    // Pas de LittleFS.remove() sur ce chemin, contrairement aux échecs plus bas : le temporaire
    // est partagé entre requêtes, et le supprimer ici permettrait à un appelant NON authentifié
    // de détruire l'upload légitime d'un autre client en cours. C'est sans objet de toute façon,
    // handleUploadLangBody() ne créant plus rien sans authentification.
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

    // Validation gzip renforcée (24/08/2026). Elle ne lisait que les DEUX octets magiques, ce qui
    // laissait passer un fichier tronqué dès lors que son en-tête était intact -- il était alors
    // renommé en /locale/<code>.json.gz, puis servi par /lang avec `Content-Encoding: gzip`. Le
    // navigateur répond « Erreur d'encodage de contenu » et n'affiche plus rien, sur CHAQUE
    // chargement, sans que rien côté firmware ne signale quoi que ce soit.
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
      Serial.println("uploadLang: contenu rejete -- ce n'est pas un flux gzip valide (en-tete ou taille)");
      LittleFS.remove(tempPath);
      request->send(400, _encoding_json, "{\"error\":\"invalid gzip content\"}");
      return;
    }

    char finalPath[32];
    snprintf(finalPath, sizeof(finalPath), "/locale/%s.json.gz", code.c_str());
    if(LittleFS.exists(finalPath)) LittleFS.remove(finalPath);
    if(!LittleFS.rename(tempPath, finalPath)) {
      Serial.printf("uploadLang: renommage vers %s refuse par LittleFS\n", finalPath);
      request->send(500, _encoding_json, "{\"error\":\"rename failed\"}");
      return;
    }
    Serial.printf("uploadLang: %s installe\n", finalPath);
    request->send(200, _encoding_json, "{\"status\":\"ok\"}");
  }

  static void handleUploadLangBody(AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len, bool final) {
    esp_task_wdt_reset();
    if (index == 0) {
      UploadState *state = (UploadState *)malloc(sizeof(UploadState));
      // Test de nullité (audit heap, 17/08/2026) : allocation faite précisément quand le tas est
      // sous pression (upload en cours) -- sans lui, l'échec produisait un déréférencement nul
      // immédiat (reboot) au lieu du "Upload failed" propre déjà prévu par handleUploadLang().
      if(!state) return;
      state->success = false;
      state->writeFailed = false;
      state->written = 0;
      // Refus AVANT toute écriture. Sous ESPAsyncWebServer ce callback s'exécute pendant l'analyse
      // de la requête, donc AVANT handleUploadLang() et son isAuthenticated() : sans ce test, un
      // POST non authentifié posait git.lockFS (gelant planification et registre Somfy le temps du
      // transfert) et écrivait la totalité du corps sur LittleFS avant d'être refusé. checkAuth()
      // plutôt qu'isAuthenticated() parce qu'ici on ne peut pas répondre -- on serait au milieu de
      // la réception ; on réutilise le drapeau `rejected` déjà prévu pour le cas "GitOTA occupé",
      // qui fait retomber handleUploadLang() sur son "Upload failed" sans qu'un octet soit écrit.
      state->rejected = git.lockFS || !webServer.checkAuth(request, true);
      request->_tempObject = state;
      // Ce chemin ne journalisait RIEN (24/08/2026) -- ni début, ni octets reçus, ni motif de
      // refus. Un téléversement de langue qui échouait ne laissait donc aucune trace sur la
      // liaison série, et la seule chose observable était, aux chargements suivants, un
      // « /littlefs/locale/<code>.json.gz does not exist » qui ne dit pas POURQUOI le fichier
      // n'est pas là. Même défaut que le `return false` muet de MQTT::connect(), au même endroit
      // du raisonnement : on vérifiait ce que le code fait, pas ce qu'il rapporte en échouant.
      if(state->rejected)
        Serial.printf("uploadLang: refuse (%s)\n", git.lockFS ? "filesystem occupe" : "non authentifie");
      else
        Serial.println("uploadLang: debut de reception");
      // GitOTA a déjà la main sur le filesystem (firmware/langue en cours) : on n'écrit rien,
      // handleUploadLang() retombera sur "Upload failed" via state->success resté false.
      if(state->rejected) return;
      // Section critique FS (audit heap OTA satellite, 15/08/2026) : sans ce verrou, un écrit
      // concurrent d'un autre acteur tournant sur la tâche principale (planification, registre
      // Somfy) pendant l'écriture par chunks ci-dessous peut heurter LittleFS -- observé en usage
      // réel comme un assert interne "lfs_mlist_isopen" fatal (reboot immédiat). git.lockFS est le
      // verrou déjà utilisé par le reste du code pour signaler "FS occupé, ne pas toucher" (cf.
      // Schedule.cpp, SomfyRegistry.cpp, WebI18n.cpp::handleDownloadLang/handleDeleteLang) --
      // réutilisé ici côté écriture plutôt qu'inventer un 2e mécanisme. Relâché au chunk final
      // ci-dessous ; onDisconnect() sert de filet de sécurité si la connexion tombe en cours de
      // transfert (cf. le "NetworkError" à l'origine du crash observé) -- sans lui, un upload
      // interrompu laisserait ce verrou bloqué jusqu'au reboot, gelant schedules/registre Somfy.
      // fsUploadLockAcquire()/fsUploadLockRelease() plutôt que git.lockFS écrit directement (cf. le
      // commentaire détaillé dans WebCommon.h) : le rappel de déconnexion ci-dessous ne se
      // déclenche qu'à la fermeture de la CONNEXION, potentiellement bien après la fin de cet
      // upload -- il ne doit donc jamais relâcher un verrou repris entre-temps par une autre
      // opération.
      // Acquisition VÉRIFIÉE : entre le test de git.lockFS ci-dessus et cette ligne, la tâche
      // principale a pu poser le verrou (téléchargement de langue, OTA). Écrire quand même
      // ferait cohabiter deux écrivains LittleFS -- le scénario "lfs_mlist_isopen" que ce verrou
      // existe précisément pour empêcher. On retombe alors sur le refus normal, aucun octet écrit.
      // L'acquisition ouvre aussi le fichier (M-19) : plus d'open/append/close par paquet reçu.
      if(!fsUploadLockAcquire("/locale/upload.json.gz.tmp")) {
        Serial.println("uploadLang: impossible d'ouvrir le fichier temporaire (filesystem occupe ou plein)");
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
        Serial.printf("uploadLang: ECHEC d'ecriture apres %u octets (tas ou filesystem)\n", (unsigned)state->written);
      state->writeFailed = true;
    }
    else state->written += len;
    if (final) {
      state->success = !state->writeFailed;
      fsUploadLockRelease();
      Serial.printf("uploadLang: reception terminee, %u octets, %s\n",
        (unsigned)state->written, state->success ? "ok" : "EN ECHEC");
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
