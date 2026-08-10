#include <Arduino.h>
#include <LittleFS.h>
#include <nvs_flash.h>
#include <Preferences.h>
#include <sdkconfig.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <esp_task_wdt.h>
#include "Recovery.h"
#include "RecoveryPage.h"
#include "somfy/Somfy.h"
#include "ConfigSettings.h"

extern ConfigSettings settings;
extern SomfyShadeController somfy;

Recovery recovery;

// Doit rester aligné sur Web.cpp : c'est la langue livrée avec le bundle, la seule qu'on ne
// supprime jamais quand on efface les packs téléchargés.
#if defined(HARDWARE_BOX_ETH) || defined(HARDWARE_BOX_WIFI)
#define RECOVERY_DEFAULT_LANG "fr"
#else
#define RECOVERY_DEFAULT_LANG "en"
#endif

// Effacements ciblés faits DIRECTEMENT sur les namespaces NVS et les fichiers, sans passer par
// ConfigSettings : on répare précisément les cas où la configuration peut être illisible, dépendre
// de son chargement réintroduirait le point de panne qu'on cherche à contourner.
static void clearNamespace(const char *ns) {
  Preferences p;
  if(p.begin(ns, false)) {
    p.clear();
    p.end();
    Serial.printf("[RECOVERY] NVS cleared: %s\n", ns);
  }
}
static void removeKeys(const char *ns, const char *const *keys, size_t count) {
  Preferences p;
  if(!p.begin(ns, false)) return;
  for(size_t i = 0; i < count; i++) {
    if(p.isKey(keys[i])) p.remove(keys[i]);
  }
  p.end();
}
static void removeFile(const char *path) {
  if(LittleFS.exists(path)) {
    LittleFS.remove(path);
    Serial.printf("[RECOVERY] Removed: %s\n", path);
  }
}

void Recovery::_resolveLed() {
  #if LED_PROFILE_FIXED
  this->_ledPin = LED_PROFILE_PIN;
  this->_ledActiveLow = LED_PROFILE_ACTIVE_LOW;
  #else
  // Lecture directe de NVS : nous sommes appelés AVANT settings.begin(), donc `settings` n'est pas
  // encore chargé. Les mêmes clés et les mêmes défauts que ConfigSettings::begin().
  Preferences p;
  if(p.begin("CFG", true)) {
    this->_ledPin = p.getChar("ledPin", -1);
    this->_ledActiveLow = p.getBool("ledActiveLow", false);
    p.end();
  }
  #endif
}
void Recovery::_led(bool on) {
  if(this->_ledPin < 0) return;
  digitalWrite(this->_ledPin, (on != this->_ledActiveLow) ? HIGH : LOW);
}

void Recovery::beginDetection() {
  this->_resolveLed();
  if(this->_ledPin >= 0) {
    pinMode(this->_ledPin, OUTPUT);
    this->_led(false);
  }

  Preferences p;
  p.begin("rst_logic", false);
  this->_cycle = p.getInt("c", 0) + 1;
  p.putInt("c", this->_cycle);
  p.end();

  Serial.print(F("\n[BOOT] Cycle: "));
  Serial.println(this->_cycle);

  // Le clignotement rapide n'apparaît qu'au cycle qui donne accès au mode Récupération : c'est le
  // signal que l'utilisateur attend avant de laisser l'appareil démarrer.
  this->_flashSpeed = (this->_cycle >= RECOVERY_CYCLES) ? 150 : 0;
  this->_detectStart = millis();
  this->_lastBlink = 0;
}

void Recovery::endDetection() {
  // La fenêtre reste de BOOT_TIMEOUT ms, mais l'appelant a déjà pu y faire son travail utile : on
  // n'attend ici que le reliquat, au lieu de payer les 5 s en plus du reste du démarrage.
  while((uint32_t)(millis() - this->_detectStart) < BOOT_TIMEOUT) {
    if(this->_ledPin >= 0) {
      if(this->_flashSpeed > 0) {
        if((uint32_t)(millis() - this->_lastBlink) >= (uint32_t)this->_flashSpeed) {
          // Bascule brute : indifférente à la polarité, contrairement à un allumage explicite.
          digitalWrite(this->_ledPin, !digitalRead(this->_ledPin));
          this->_lastBlink = millis();
        }
      }
      else this->_led(true);
    }
    delay(10);
  }

  Preferences p;
  p.begin("rst_logic", false);
  p.putInt("c", 0);
  p.end();

  if(this->_ledPin >= 0) this->_led(false);

  if(this->_cycle >= RECOVERY_CYCLES) {
    this->_requested = true;
    Serial.println(F("[BOOT] Recovery mode requested"));
  }
  Serial.println(F("Boot OK"));
}

void Recovery::begin() {
  this->_active = true;
  Serial.println(F("\n[RECOVERY] Starting recovery access point..."));

  // Aucune connexion sortante en secours : on force le mode AP seul pour ne pas rejouer une
  // configuration Wi-Fi potentiellement fautive.
  WiFi.persistent(false);
  WiFi.disconnect(true, false);
  WiFi.mode(WIFI_AP);
  // Adresse identique à celle de l'AP d'onboarding : les deux modes s'excluent dans le temps, donc
  // aucun conflit possible, et l'adresse bien connue reste documentable.
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  WiFi.softAP(RECOVERY_AP_SSID);
  delay(200);
  Serial.print(F("[RECOVERY] SSID: "));  Serial.println(F(RECOVERY_AP_SSID));
  Serial.print(F("[RECOVERY] IP: "));    Serial.println(WiFi.softAPIP());

  // Portail captif : toute résolution DNS pointe sur l'ESP32, ce qui déclenche l'ouverture
  // automatique de la page dès la connexion au réseau sur Android/iOS.
  this->_dns = new DNSServer();
  this->_dns->setErrorReplyCode(DNSReplyCode::NoError);
  this->_dns->start(RECOVERY_DNS_PORT, "*", WiFi.softAPIP());

  this->_server = new WebServer(80);
  this->_registerRoutes();
  this->_server->begin();

  this->_lastClientSeen = millis();

  // Clignotement lent et continu : l'appareil reste visuellement identifiable comme étant en mode
  // secours, même sans navigateur connecté.
  if(this->_ledPin >= 0) this->_lastBlink = millis();
}

void Recovery::_registerRoutes() {
  WebServer *srv = this->_server;

  srv->on("/", HTTP_GET, [srv]() {
    srv->sendHeader("Cache-Control", "no-store");
    srv->send_P(200, "text/html", RECOVERY_PAGE);
  });

  srv->on("/recoveryCancel", HTTP_POST, [this, srv]() {
    Serial.println(F("[RECOVERY] Cancelled by user, rebooting untouched"));
    srv->send(200, "application/json", "{\"status\":\"ok\"}");
    this->_rebootSoon();
  });

  srv->on("/recoveryApply", HTTP_POST, [this, srv]() {
    StaticJsonDocument<512> doc;
    if(deserializeJson(doc, srv->arg("plain"))) {
      srv->send(400, "application/json", "{\"status\":\"ERROR\"}");
      return;
    }
    RecoveryTargets t;
    t.network         = doc["network"]  | false;
    t.security        = doc["security"] | false;
    t.system          = doc["system"]   | false;
    t.shades          = doc["shades"]   | false;
    t.schedules       = doc["schedules"]| false;
    t.langs           = doc["langs"]    | false;
    t.rollingCodes    = doc["codes"]    | false;
    t.factory         = doc["factory"]  | false;
    t.enableDebugLogs = doc["debug"]    | false;

    // On répond AVANT d'effacer : l'effacement peut couper la pile réseau, et l'utilisateur doit
    // dans tous les cas recevoir la confirmation.
    srv->send(200, "application/json", "{\"status\":\"ok\"}");
    delay(100);
    this->_apply(t);
    this->_rebootSoon();
  });

  // Restauration de l'interface web : le flux est écrit directement dans la partition du système
  // de fichiers via l'API Update, sans passer par LittleFS. C'est ce qui permet de réparer une
  // partition illisible -- et ce qui rend le formatage seul inutile, l'image écrasant l'intégralité
  // de la partition. En récupération, ni la radio Somfy ni MQTT ne tournent : rien à arrêter avant.
  srv->on("/recoveryUploadFS", HTTP_POST,
    [this, srv]() {
      bool ok = this->_uploadOk && !Update.hasError();
      srv->send(ok ? 200 : 500, "application/json",
                ok ? "{\"status\":\"ok\"}" : "{\"status\":\"ERROR\"}");
      if(ok) this->_rebootSoon();
    },
    [this]() {
      HTTPUpload &upload = this->_server->upload();
      if(upload.status == UPLOAD_FILE_START) {
        this->_uploadOk = false;
        Serial.printf("[RECOVERY] Filesystem image upload: %s\n", upload.filename.c_str());
        // La partition ne doit plus être montée pendant qu'on la réécrit.
        LittleFS.end();
        if(!Update.begin(UPDATE_SIZE_UNKNOWN, U_SPIFFS)) Update.printError(Serial);
      }
      else if(upload.status == UPLOAD_FILE_WRITE) {
        if(Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
          Update.printError(Serial);
          Update.abort();
        }
      }
      else if(upload.status == UPLOAD_FILE_ABORTED) {
        Serial.println(F("[RECOVERY] Upload aborted"));
        Update.abort();
        LittleFS.begin();
      }
      else if(upload.status == UPLOAD_FILE_END) {
        if(Update.end(true)) {
          this->_uploadOk = true;
          Serial.printf("[RECOVERY] Filesystem restored (%u bytes)\n", upload.totalSize);
        }
        else {
          Update.printError(Serial);
          LittleFS.begin();
        }
      }
    });

  // Sondes de portail captif (Android/iOS/Windows) et tout le reste : on renvoie vers la page.
  srv->onNotFound([srv]() {
    srv->sendHeader("Location", "http://192.168.4.1/", true);
    srv->send(302, "text/plain", "");
  });
}

void Recovery::_apply(const RecoveryTargets &t) {
  Serial.println(F("\n[RECOVERY] Applying selection..."));

  if(t.network) {
    clearNamespace("WIFI");
    clearNamespace("IP");
    clearNamespace("ETH");
    // connType vit dans CFG mais relève du réseau : on retire la clé sans toucher au reste.
    static const char *k[] = {"connType"};
    removeKeys("CFG", k, 1);
  }
  if(t.security) {
    clearNamespace("SEC");
    clearNamespace("authkey");
  }
  if(t.system) {
    clearNamespace("MQTT");
    clearNamespace("NTP");
    // Réglages généraux uniquement : connType (réseau) et enableDebugLogs (interrupteur dédié)
    // sont délibérément épargnés pour que chaque case reste prévisible.
    // Les clés LED en font partie : une broche mal choisie n'est pas anodine (elle peut écraser une
    // sortie de la radio), et c'est ici la seule voie de retour en arrière sans effacement complet.
    static const char *k[] = {"hostname", "ssdpBroadcast", "checkForUpdate", "accentColor",
                              "swShowGpio", "onboardingDone", "pendingLang", "langCode", "language",
                              "ledPin", "ledActiveLow", "ledRfBlink"};
    removeKeys("CFG", k, sizeof(k) / sizeof(k[0]));
  }
  if(t.shades) {
    clearNamespace("Shades");
    removeFile("/shades.cfg");
    removeFile("/shades.cfg.bak");
    removeFile("/shades.tmp");
    removeFile("/controller.backup");
  }
  if(t.schedules) removeFile("/schedules.cfg");
  if(t.langs) {
    // Les packs téléchargés sont supprimés, la langue embarquée est conservée : sans elle, plus
    // aucun libellé ne s'afficherait après redémarrage.
    File dir = LittleFS.open("/locale");
    if(dir && dir.isDirectory()) {
      String keep = String("/locale/") + RECOVERY_DEFAULT_LANG + ".json.gz";
      String victims[8];
      int n = 0;
      File f = dir.openNextFile();
      while(f && n < 8) {
        String path = String("/locale/") + String(f.name()).substring(String(f.name()).lastIndexOf('/') + 1);
        if(!path.equals(keep)) victims[n++] = path;
        f = dir.openNextFile();
      }
      dir.close();
      for(int i = 0; i < n; i++) removeFile(victims[i].c_str());
    }
  }
  if(t.rollingCodes) clearNamespace("ShadeCodes");

  if(t.factory) {
    Serial.println(F("[RECOVERY] Full factory reset"));
    nvs_flash_erase();
    nvs_flash_init();
    removeFile("/shades.cfg");
    removeFile("/shades.cfg.bak");
    removeFile("/shades.tmp");
    removeFile("/controller.backup");
    removeFile("/schedules.cfg");
  }
  // Écrit en DERNIER : un effacement d'usine ou un formatage antérieur emporterait sinon la valeur
  // que l'utilisateur vient de demander.
  Preferences p;
  if(p.begin("CFG", false)) {
    p.putBool("enableDebugLogs", t.enableDebugLogs);
    p.end();
  }
  // Le compteur de cycles doit repartir de zéro, sinon le prochain démarrage rentrerait à nouveau
  // en récupération.
  if(p.begin("rst_logic", false)) {
    p.putInt("c", 0);
    p.end();
  }
  Serial.println(F("[RECOVERY] Done."));
}

void Recovery::_rebootSoon() {
  if(this->_ledPin >= 0) this->_led(false);
  delay(500);
  ESP.restart();
}

void Recovery::loop() {
  if(!this->_active) return;
  if(this->_dns) this->_dns->processNextRequest();
  if(this->_server) this->_server->handleClient();

  if(this->_ledPin >= 0 && (uint32_t)(millis() - this->_lastBlink) >= 800) {
    digitalWrite(this->_ledPin, !digitalRead(this->_ledPin));
    this->_lastBlink = millis();
  }

  // Un appareil laissé en récupération ne doit pas rester indéfiniment un point d'accès ouvert.
  // Le compteur repart dès qu'un client est associé.
  if(WiFi.softAPgetStationNum() > 0) this->_lastClientSeen = millis();
  else if((uint32_t)(millis() - this->_lastClientSeen) >= RECOVERY_IDLE_TIMEOUT) {
    Serial.println(F("[RECOVERY] Idle timeout, rebooting"));
    this->_rebootSoon();
  }
}
