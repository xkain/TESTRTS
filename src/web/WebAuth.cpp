#include <WiFi.h>
#include <esp_partition.h>  // taille de la partition spiffs servie par /loginContext
#include <LittleFS.h>
#include "ConfigSettings.h"
#include "somfy/Somfy.h"
#include "WResp.h"
#include "Web.h"
#include "Network.h"
#include "Recovery.h"    // LED_PROFILE_FIXED
#include "WebCommon.h"
#include "WebAuth.h"

extern ConfigSettings settings;
extern Web webServer;
extern Network net;

// --- Anti brute-force sur /login, INDEXÉ PAR IP (M-16 de l'audit, corrigé le 23/08/2026) ---
//
// CE QUI NE VA PAS DANS UN COMPTEUR GLOBAL. Le mécanisme précédent tenait deux variables uniques
// pour tout l'appareil : quatre échecs venus de N'IMPORTE QUELLE machine du réseau verrouillaient
// /login pour TOUT LE MONDE pendant 180 s, et chaque nouvel échec réarmait le verrou. Un script
// tentant un mot de passe toutes les 30 s rendait donc l'interface définitivement inaccessible à
// son propriétaire -- un déni de service à coût nul, et le contraire de ce qu'un anti-brute-force
// doit produire. Le suivi est désormais par adresse : un attaquant ne peut plus verrouiller que
// lui-même.
//
// REPLI EXPONENTIEL plutôt que verrou fixe. Le PIN ne fait que 4 chiffres (char[5], cf.
// ConfigSettings.h), soit 10 000 combinaisons : la temporisation est le seul rempart, et un délai
// constant de 180 s laisse un budget d'essais linéaire. Avec un doublement à chaque échec
// au-delà du quota libre, on passe de 15 s à 15 min en sept erreurs, ce qui rend l'espace de clés
// hors de portée tout en restant indolore pour un utilisateur qui se trompe une ou deux fois.
//
// DÉCROISSANCE. Sans oubli, un utilisateur revenu le lendemain repartirait avec le compteur au
// plus haut et se prendrait 15 min au premier faux pas. Après LOGIN_DECAY_MS sans tentative et
// hors verrouillage, le compteur d'échecs est remis à zéro.
//
// ÉVICTION, et son compromis assumé. Le tableau est borné (LOGIN_TRACK_SLOTS) ; à saturation on
// recycle d'abord un emplacement libre, puis le plus ancien NON verrouillé, et seulement en
// dernier recours celui dont le verrou expire le plus tôt. Ce dernier cas offre effectivement à
// un attaquant capable de faire varier son adresse un moyen de raccourcir son propre repli --
// mais il faut pour cela saturer les 8 emplacements en permanence, et surtout l'alternative
// (refuser toute nouvelle IP quand le tableau est plein) rétablirait très exactement le déni de
// service qu'on vient de supprimer. Ne jamais enfermer le propriétaire dehors prime.
//
// CONCURRENCE : aucun verrou. Tous les handlers ESPAsyncWebServer -- ceux de `server`, d'
// `apiServer`, et le miroir de /login sur ce dernier -- s'exécutent sur l'unique tâche async_tcp,
// donc sérialisés entre eux. Le serveur OTA synchrone (WebGitSync.cpp, tâche principale) n'a pas
// de route /login et ne touche pas ce tableau.
#define LOGIN_FREE_ATTEMPTS 3
#define LOGIN_LOCKOUT_BASE_SECONDS 15
#define LOGIN_LOCKOUT_MAX_SECONDS 900
#define LOGIN_TRACK_SLOTS 8
#define LOGIN_DECAY_MS 900000UL

struct login_tracker_t {
  bool used = false;
  uint32_t ip = 0;
  uint16_t fails = 0;
  uint32_t lockUntil = 0;   // échelle millis()
  uint32_t lastSeen = 0;
};
static login_tracker_t g_loginTrackers[LOGIN_TRACK_SLOTS];

// Comparaison en différence signée, comme partout ailleurs dans le projet : millis() repasse à
// zéro tous les ~49 jours, et un `millis() < lockUntil` naïf verrouillerait alors pour la durée
// entière du cycle.
static bool loginIsLocked(const login_tracker_t &t) {
  return t.lockUntil != 0 && (int32_t)(t.lockUntil - millis()) > 0;
}

static login_tracker_t *loginTrackerFor(const IPAddress &addr) {
  uint32_t ip = (uint32_t)addr;
  uint32_t now = millis();
  for(uint8_t i = 0; i < LOGIN_TRACK_SLOTS; i++) {
    if(g_loginTrackers[i].used && g_loginTrackers[i].ip == ip) {
      login_tracker_t &t = g_loginTrackers[i];
      // Décroissance : le silence prolongé efface l'ardoise, mais JAMAIS un verrou en cours --
      // sans quoi il suffirait d'attendre pour l'annuler.
      if(!loginIsLocked(t) && (uint32_t)(now - t.lastSeen) >= LOGIN_DECAY_MS) {
        t.fails = 0;
        t.lockUntil = 0;
      }
      t.lastSeen = now;
      return &t;
    }
  }
  // 1) un emplacement libre.
  login_tracker_t *pick = nullptr;
  for(uint8_t i = 0; i < LOGIN_TRACK_SLOTS; i++) {
    if(!g_loginTrackers[i].used) { pick = &g_loginTrackers[i]; break; }
  }
  // 2) sinon le plus ancien NON verrouillé : on ne sacrifie jamais un verrou actif tant qu'il
  //    reste une entrée dormante à recycler.
  if(!pick) {
    for(uint8_t i = 0; i < LOGIN_TRACK_SLOTS; i++) {
      if(loginIsLocked(g_loginTrackers[i])) continue;
      if(!pick || (uint32_t)(now - g_loginTrackers[i].lastSeen) > (uint32_t)(now - pick->lastSeen))
        pick = &g_loginTrackers[i];
    }
  }
  // 3) tout est verrouillé : celui dont le verrou expire le plus tôt (cf. le compromis d'éviction
  //    documenté en tête de ce bloc).
  if(!pick) {
    pick = &g_loginTrackers[0];
    for(uint8_t i = 1; i < LOGIN_TRACK_SLOTS; i++) {
      if((int32_t)(g_loginTrackers[i].lockUntil - pick->lockUntil) < 0) pick = &g_loginTrackers[i];
    }
  }
  pick->used = true;
  pick->ip = ip;
  pick->fails = 0;
  pick->lockUntil = 0;
  pick->lastSeen = now;
  return pick;
}

// Durée du verrou après `fails` échecs : doublement à chaque échec au-delà du quota libre, plafonné.
static uint32_t loginLockoutSeconds(uint16_t fails) {
  uint16_t over = (fails > LOGIN_FREE_ATTEMPTS) ? (uint16_t)(fails - LOGIN_FREE_ATTEMPTS - 1) : 0;
  // Décalage borné AVANT de l'appliquer : au-delà de 16 le décalage déborderait l'entier bien
  // avant que le plafond ci-dessous n'ait l'occasion d'agir.
  if(over > 16) over = 16;
  uint32_t secs = (uint32_t)LOGIN_LOCKOUT_BASE_SECONDS << over;
  return (secs > LOGIN_LOCKOUT_MAX_SECONDS) ? LOGIN_LOCKOUT_MAX_SECONDS : secs;
}

namespace WebAuth {
  void handleLogin(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    StaticJsonDocument<256> doc;
    JsonObject obj = doc.to<JsonObject>();
    char token[65];
    memset(&token, 0x00, sizeof(token));
    // Échec traité (audit sécurité/mémoire, 23/08/2026) : createAPIToken() peut désormais échouer
    // proprement quand le tas ne permet plus d'allouer le contexte HMAC. Sans ce contrôle, la
    // connexion "réussissait" en délivrant une clé VIDE, que le client aurait ensuite renvoyée à
    // chaque requête pour se faire refuser -- un échec silencieux, impossible à interpréter côté
    // utilisateur. Un 503 dit ce qui se passe réellement et invite à réessayer.
    if(!webServer.createAPIToken(request->client()->remoteIP(), token)) {
      request->send(503, _encoding_json, "{\"success\":false,\"msg\":\"Device low on memory, please retry.\"}");
      return;
    }
    obj["type"] = static_cast<uint8_t>(settings.Security.type);
    if(settings.Security.type == security_types::None) {
      obj["apiKey"] = token;
      obj["msg"] = "Success";
      obj["success"] = true;
      serializeJson(doc, g_content);
      request->send(200, _encoding_json, g_content);
      return;
    }
    DBG_PRINTLN("Web logging in...");
    char username[33] = "";
    char password[33] = "";
    char pin[5] = "";
    memset(username, 0x00, sizeof(username));
    memset(password, 0x00, sizeof(password));
    memset(pin, 0x00, sizeof(pin));
    // asyncHasBody()/asyncGetBody() (WebCommon.h), pas request->hasArg("body") directement : un
    // corps JSON n'est PAS auto-capturé par ESPAsyncWebServer (seuls x-www-form-urlencoded et
    // text/plain "clef=valeur" le sont) -- il faut un callback onBody explicite, enregistré sur la
    // route /login (cf. registerRoutes(AsyncWebServer&) ci-dessous). Différence d'API silencieuse
    // avec WebServer (qui expose "plain" pour tout corps brut, quel que soit le Content-Type) à ne
    // pas reproduire par erreur ailleurs lors de la suite de la migration.
    if(asyncHasBody(request)) {
      DynamicJsonDocument docin(512);
      DeserializationError err = deserializeJson(docin, asyncGetBody(request));
      if (err) {
        webServer.handleDeserializationError(request, err);
        return;
      }
      else {
          JsonObject objin = docin.as<JsonObject>();
          if(objin.containsKey("username") && objin["username"]) strlcpy(username, objin["username"], sizeof(username));
          if(objin.containsKey("password") && objin["password"]) strlcpy(password, objin["password"], sizeof(password));
          if(objin.containsKey("pin") && objin["pin"]) strlcpy(pin, objin["pin"], sizeof(pin));
      }
    }
    else {
      if(request->hasArg("username")) strlcpy(username, request->arg("username").c_str(), sizeof(username));
      if(request->hasArg("password")) strlcpy(password, request->arg("password").c_str(), sizeof(password));
      if(request->hasArg("pin")) strlcpy(pin, request->arg("pin").c_str(), sizeof(pin));
    }
    // Anti brute-force : verrouillage actif POUR CETTE ADRESSE, on refuse sans même comparer les
    // identifiants. L'emplacement est résolu ici, une seule fois, et réutilisé plus bas.
    login_tracker_t *tracker = loginTrackerFor(request->client()->remoteIP());
    if(loginIsLocked(*tracker)) {
      uint32_t retryAfter = (uint32_t)((tracker->lockUntil - millis() + 999) / 1000);
      obj["success"] = false;
      obj["msg"] = "Too many attempts. Please wait.";
      obj["retryAfter"] = retryAfter;
      serializeJson(doc, g_content);
      request->send(429, _encoding_json, g_content);
      return;
    }
    // At this point we should have all the data we need to login.
    if(settings.Security.type == security_types::PinEntry) {
      DBG_PRINTLN("Validating pin");
      if(strlen(pin) == 0 || strcmp(pin, settings.Security.pin) != 0) {
        obj["success"] = false;
        obj["msg"] = "Invalid Pin Entry";
      }
      else {
        obj["success"] = true;
        obj["msg"] = "Login successful";
        obj["apiKey"] = token;
      }
    }
    else if(settings.Security.type == security_types::Password) {
      if(strlen(username) == 0 || strlen(password) == 0 || strcmp(username, settings.Security.username) != 0 || strcmp(password, settings.Security.password) != 0) {
        obj["success"] = false;
        obj["msg"] = "Invalid username or password";
      }
      else {
        obj["success"] = true;
        obj["msg"] = "Login successful";
        obj["apiKey"] = token;
      }
    }
    if(obj["success"] == true) {
      tracker->fails = 0;
      tracker->lockUntil = 0;
    }
    else {
      if(tracker->fails < 1000) tracker->fails++;
      if(tracker->fails > LOGIN_FREE_ATTEMPTS) {
        // Au-delà du quota libre : verrouillage de CETTE adresse, doublé à chaque nouvel échec.
        uint32_t secs = loginLockoutSeconds(tracker->fails);
        tracker->lockUntil = millis() + (secs * 1000UL);
        obj["retryAfter"] = secs;
        serializeJson(doc, g_content);
        request->send(429, _encoding_json, g_content);
        return;
      }
      // Encore dans le quota d'essais libres : on indique où on en est pour l'UI.
      obj["attempt"] = tracker->fails;
      obj["maxAttempts"] = LOGIN_FREE_ATTEMPTS;
    }
    serializeJson(doc, g_content);
    request->send(200, _encoding_json, g_content);
    return;
  }

  static void handleLoginContext(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.addElem("type", static_cast<uint8_t>(settings.Security.type));
    resp.addElem("permissions", settings.Security.permissions);
    // Verdict sur la clé d'API PRÉSENTÉE PAR CETTE REQUÊTE (audit authentification, 23/08/2026).
    // Cette route reste volontairement non authentifiée -- c'est elle qui dit au navigateur QUEL
    // écran de connexion afficher, elle doit donc répondre même sans session. Mais l'interface a
    // besoin de savoir si la clé qu'elle vient de restaurer (sessionStorage, cf. Security.init()
    // dans 35-security.js) est toujours acceptée : sans ce champ, elle n'avait aucun moyen de le
    // vérifier sans provoquer volontairement un 401 sur une autre route.
    // C'est ce qui permet de ne PLUS redemander le PIN à chaque rechargement de page -- et il y en
    // a beaucoup : toute installation de langue se termine par un window.location.reload()
    // (General.onLanguageChanged), tout comme la fin d'une mise à jour firmware.
    // checkAuth() et non isAuthenticated() : on rend un verdict, on n'émet surtout pas de 401 --
    // la réponse JSON est déjà en cours de construction.
    const bool authed = webServer.checkAuth(request, true);
    resp.addElem("authenticated", authed);
    resp.addElem("language", settings.language);
    resp.addElem("defaultLang", DEFAULT_EMBEDDED_LANG);
    resp.addElem("pendingLang", settings.pendingLang);
    resp.addElem("onboardingDone", settings.onboardingDone);
    // Limite réelle du pool de connexions WebSocket, exposée à l'interface plutôt que redite en
    // dur côté JS : le message "Too many clients connected" annonçait encore un maximum de 5
    // alors que la macro vaut 10 depuis longtemps. Sockets.h documente déjà ce piège pour le
    // dimensionnement des tableaux ("un littéral figé à 5 ici plafonnerait silencieusement...") ;
    // la même dérive s'était produite côté message utilisateur, sans que rien ne la signale.
    resp.addElem("maxClients", (uint8_t)WEBSOCKETS_SERVER_CLIENT_MAX);

    // --- Frontière de divulgation (M-17, audit du 23/08/2026) ---
    // Tout ce qui suit décrit L'APPAREIL, pas l'écran de connexion : adresse MAC, nom d'hôte,
    // version du firmware, profil matériel, géométrie flash/LittleFS, fréquence CPU, uptime...
    // Aucun de ces champs n'est nécessaire pour décider QUEL formulaire de connexion afficher,
    // et cette route est publique par construction. Un simple `curl http://<boitier>/loginContext`
    // dressait donc la fiche signalétique complète d'un appareil pourtant protégé par un PIN --
    // exactement ce qu'on veut refuser à un scanner réseau, d'autant que la version du firmware
    // dit à un attaquant quelles failles connues s'appliquent.
    //
    // `detailed` vaut `authed || configOnly`, ce qui est EXACTEMENT ce que renverrait
    // checkAuth(request, false) -- réécrit ainsi plutôt qu'appelé une seconde fois pour ne pas
    // recalculer le HMAC du jeton (cf. Web::createAPIToken, sur le chemin de chaque requête).
    // Le mode "config seule" passe donc sans clé : dans ce mode le tableau de bord EST public, son
    // en-tête affiche uptime et informations d'appareil, et les masquer casserait un écran
    // légitime. Sécurité désactivée : `authed` est vrai d'emblée, comportement inchangé.
    //
    // Conséquence côté interface, à ne pas perdre de vue : en sécurité complète, le PREMIER appel
    // (avant connexion) ne rapporte plus ces champs. C'est pourquoi Security.login() relit
    // /loginContext avec la clé une fois la connexion acceptée -- sans cette relecture, l'en-tête
    // et les panneaux d'information resteraient vides toute la session.
    const bool configOnly = (settings.Security.permissions & static_cast<uint8_t>(security_permissions::ConfigOnly)) == 0x01;
    const bool detailed = authed || configOnly;
    if(!detailed) {
      resp.endObject();
      resp.endResponse();
      return;
    }

    // `serverId` et `model` ne sont lus par AUCUN appelant -- ni l'interface (vérifié sur les 10
    // fichiers de data-dev/js/), ni les routes miroir du port 8081, `/discovery` servant déjà
    // l'identité de l'appareil aux intégrations. Conservés derrière l'authentification plutôt que
    // supprimés : un client tiers non recensé pourrait les lire, et les retirer serait un
    // changement de contrat que rien n'oblige à faire ici.
    resp.addElem("serverId", settings.serverId);
    resp.addElem("model", "ESPSomfyRTS");
    resp.addElem("version", settings.fwVersion.name);
    resp.addElem("hostname", settings.hostname);
    resp.addElem("hardwareProfile", settings.hardwareProfile);
    // Marqueur attendu dans une image de firmware, pour que le navigateur puisse refuser un
    // fichier incompatible AVANT de le téléverser (cf. Firmware.uploadFile). Servi plutôt que
    // redit en dur côté JS : la génération de table de partition ne doit exister qu'à un seul
    // endroit, FW_PARTITION_LAYOUT. Le contrôle qui compte reste celui de /updateFirmware --
    // un client REST ne passe pas par l'interface.
    resp.addElem("fwImageMarker", FW_IMAGE_MARKER);
    // Taille réelle de la partition de fichiers, pour que le navigateur puisse comparer la
    // géométrie déclarée par une image LittleFS avant de la téléverser (cf.
    // Firmware.fsImageGeometryOk). Lue de la table de partition, jamais codée en dur.
    {
      const esp_partition_t *fsPart = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_SPIFFS, NULL);
      resp.addElem("fsPartitionSize", (uint32_t)(fsPart ? fsPart->size : 0));
    }
    #if LED_PROFILE_FIXED
    resp.addElem("ledPin", (int8_t)LED_PROFILE_PIN);
    #else
    resp.addElem("ledPin", settings.ledPin);
    #endif
    if (net.connType == conn_types_t::ethernet) {
      resp.addElem("mac", ETH.macAddress().c_str());
    } else {
      resp.addElem("mac", WiFi.macAddress().c_str());
    }
    resp.addElem("uptime", (uint32_t)(millis() / 1000));
    // Compteur de session réseau : reflète l'interface RÉELLEMENT active (net.softAPOpened /
    // net.connType), pas la configuration statique -- reste donc correct pendant un repli AP
    // temporaire même si settings.connType pointe vers Wi-Fi/Ethernet. net.apOpenedAt est distinct
    // de net.connectedAt car l'AP ne passe jamais par Network::setConnected().
    uint32_t netUptime = 0;
    const char *netMode = "wifi";
    if(net.softAPOpened && net.apOpenedAt > 0) {
      netUptime = (millis() - net.apOpenedAt) / 1000;
      netMode = "ap";
    } else if(net.connectedAt > 0) {
      netUptime = (millis() - net.connectedAt) / 1000;
      netMode = (net.connType == conn_types_t::ethernet) ? "eth" : "wifi";
    }
    resp.addElem("netUptime", netUptime);
    resp.addElem("netMode", netMode);
    resp.addElem("cpuFreq", ESP.getCpuFreqMHz());
    resp.addElem("cores", ESP.getChipCores());
    resp.addElem("flashSize", (uint32_t)(ESP.getFlashChipSize() / 1024 / 1024));
    size_t total = LittleFS.totalBytes();
    size_t used = LittleFS.usedBytes();
    resp.addElem("fsTotal", (uint32_t)(total / 1024));
    resp.addElem("fsUsed", (uint32_t)(used / 1024));
    resp.addElem("flashSpeed", (uint32_t)(ESP.getFlashChipSpeed() / 1000000));
    resp.endObject();
    resp.endResponse();
  }

  static void handleSaveSecurity(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200); return; }
    if(!webServer.isAuthenticated(request, true)) return;

    StaticJsonDocument<768> doc;
    if (deserializeJson(doc, asyncGetBody(request))) { request->send(400, "text/plain", "J-Err"); return; }

    if (request->method() == AsyncHttp::POST || request->method() == AsyncHttp::PUT) {
      JsonObject obj = doc.as<JsonObject>();
      // Garde-fou de longueur AVANT fromJSON() : parseValueString/parseSecretString recopient via
      // strlcpy() dans des char[33] (identifiant, mot de passe) et char[5] (PIN), ce qui TRONQUE
      // en silence -- l'appareil enregistrait alors autre chose que ce qui lui était demandé, sans
      // que l'appelant en sache rien. L'interface web borne déjà ses champs (maxlength + contrôle
      // dans General.saveSecurity), mais elle n'est pas le seul client de cette route : un script,
      // un client REST ou une intégration tierce y accèdent directement. C'est donc ici, et
      // seulement ici, qu'un refus explicite est garanti pour tous.
      const char *inUser = obj["username"] | "";
      const char *inPass = obj["password"] | "";
      const char *inPin = obj["pin"] | "";
      if(strlen(inUser) >= sizeof(settings.Security.username)) {
        request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"code\":\"USERNAME_TOO_LONG\",\"desc\":\"The username may not exceed 32 characters.\"}");
        return;
      }
      if(strlen(inPass) >= sizeof(settings.Security.password)) {
        request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"code\":\"PASSWORD_TOO_LONG\",\"desc\":\"The password may not exceed 32 characters.\"}");
        return;
      }
      // Un PIN vide veut dire "inchangé" (parseSecretString ignore la chaîne vide) : seule une
      // valeur réellement fournie doit faire exactement 4 chiffres.
      if(strlen(inPin) > 0 && strlen(inPin) != sizeof(settings.Security.pin) - 1) {
        request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"code\":\"PIN_INVALID\",\"desc\":\"The pin must be exactly 4 digits.\"}");
        return;
      }
      // Suppression explicite d'un secret déjà enregistré. Une chaîne vide ne peut pas jouer ce
      // rôle -- parseSecretString l'interprète justement comme "inchangé", ce qui permet à
      // l'interface d'enregistrer les autres réglages sans renvoyer le mot de passe -- d'où ces
      // deux drapeaux dédiés, sans ambiguïté possible. Jusqu'ici aucun chemin ne permettait de
      // retirer un secret : désactiver la sécurité laissait mot de passe et PIN en NVS.
      bool clearPassword = obj["clearPassword"] | false;
      bool clearPin = obj["clearPin"] | false;
      // Le type qui sera EFFECTIVEMENT actif après cet enregistrement, pas celui d'avant : effacer
      // le secret dont dépend l'authentification enfermerait tout le monde dehors (handleLogin
      // compare par strcmp, et aucune saisie ne peut correspondre à une chaîne vide). C'est le
      // seul garde-fou qui protège les clients hors interface, où rien ne relit un formulaire.
      security_types newType = obj.containsKey("type") ? static_cast<security_types>(obj["type"].as<uint8_t>()) : settings.Security.type;
      if(clearPassword && newType == security_types::Password) {
        request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"code\":\"CLEAR_ACTIVE_PASSWORD\",\"desc\":\"The password cannot be cleared while password security is active.\"}");
        return;
      }
      if(clearPin && newType == security_types::PinEntry) {
        request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"code\":\"CLEAR_ACTIVE_PIN\",\"desc\":\"The pin cannot be cleared while pin security is active.\"}");
        return;
      }
      settings.Security.fromJSON(obj);
      // Après fromJSON : une demande de suppression l'emporte sur une éventuelle nouvelle valeur
      // reçue dans le même corps, plutôt que de dépendre de l'ordre des clés du JSON.
      if(clearPassword) settings.Security.password[0] = '\0';
      if(clearPin) settings.Security.pin[0] = '\0';
      settings.Security.save();
      // Les jetons HTTP sont recalculés à chaque requête (HMAC secret+IP+identifiants) : changer un
      // mot de passe les invalide donc instantanément. Les sessions WebSocket, elles, ne sont
      // authentifiées qu'à la poignée de main -- sans cette révocation, une socket ouverte avec
      // l'ancien PIN continuerait de recevoir l'état des volets jusqu'à ce que la connexion tombe
      // d'elle-même. Coupure effective au prochain tour de la boucle principale ; le navigateur
      // légitime se reconnecte tout seul avec sa nouvelle clé (cf. socket.onclose dans 20-shell.js).
      sockRevokeAllClients();

      doc.clear();
      obj = doc.to<JsonObject>();

      char token[65];
      webServer.createAPIToken(request->client()->remoteIP(), token);
      settings.Security.toJSON(obj);
      obj["apiKey"] = token;

      serializeJson(doc, g_content);
      request->send(200, _encoding_json, g_content);
    } else {
      request->send(405, _encoding_json, "{\"s\":\"ERR\"}");
    }
  }

  static void handleGetSecurity(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(192);
    JsonObject obj = doc.to<JsonObject>();
    settings.Security.toJSON(obj);
    serializeJson(doc, g_content);
    request->send(200, _encoding_json, g_content);
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/login", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleLogin(request); }, nullptr, asyncBodyHandler);
    server.on("/loginContext", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleLoginContext(request); });
    server.on("/saveSecurity", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSaveSecurity(request); }, nullptr, asyncBodyHandler);
    server.on("/getSecurity", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetSecurity(request); });
  }
}
