// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <Arduino.h>
#include <LittleFS.h>
#include <nvs_flash.h>
#include <Preferences.h>
#include <sdkconfig.h>
#include <esp_ota_ops.h>
#include "Recovery.h"
#include "FwInfo.h"
#include "somfy/Somfy.h"
#include "ConfigSettings.h"
#include "ConfigFile.h"

extern ConfigSettings settings;
extern SomfyShadeController somfy;

Recovery recovery;

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
  fs::FS &fs = CfgStore::fsFor(path);
  if(fs.exists(path)) {
    fs.remove(path);
    Serial.printf("[RECOVERY] Removed: %s\n", path);
  }
}

void Recovery::_resolveLed() {
  #if LED_PROFILE_FIXED
  this->_ledPin = LED_PROFILE_PIN;
  this->_ledActiveLow = LED_PROFILE_ACTIVE_LOW;
  // Aucun boîtier n'embarque de LED adressable : le câblage fait autorité, une valeur enregistrée
  // ne doit pas pouvoir faire piloter en RMT une simple sortie à niveau.
  this->_ledAddressable = false;
  #else
  // Lecture directe de NVS : nous sommes appelés AVANT settings.begin(), donc `settings` n'est pas
  // encore chargé. Les mêmes clés et les mêmes défauts que ConfigSettings::begin().
  Preferences p;
  if(p.begin("CFG", true)) {
    this->_ledPin = p.getChar("ledPin", -1);
    this->_ledActiveLow = p.getBool("ledActiveLow", false);
    // ATTENTION : la clé est "ledAddr" alors que le champ de ConfigSettings s'appelle
    // ledAddressable -- contrairement à ledPin et ledActiveLow, qui portent le même nom des deux
    // côtés. Une divergence ici ne casse rien et ne signale rien : elle rend juste le témoin muet.
    // La clé fait foi côté ConfigSettings.cpp, à relire avant d'y toucher.
    this->_ledAddressable = p.getBool("ledAddr", false);
    p.end();
  }
  #endif
}
void Recovery::_led(bool on) {
  if(this->_ledPin < 0) return;
  this->_ledOn = on;
  if(this->_ledAddressable) {
    // Couleur fixe de Recovery.h, et non une couleur lue dans la configuration : le pilotage RMT
    // ne demande ni réglages chargés, ni filesystem, ni réseau, et c'est cette indépendance qui
    // rend le témoin fiable quand le reste est cassé. rmtInit() est idempotent d'un éclat au
    // suivant, l'écriture répétée ne coûte donc que sa trame.
    //
    // L'ordre des octets du pixel n'est pas lu non plus, et ce n'est pas un oubli : le bleu pur a
    // le rouge et le vert à zéro, les deux seules composantes que les ordres GRB et RGB échangent.
    // Il sort identique dans les deux cas. Un réglage de plus dans ce chemin n'aurait rien apporté
    // et lui aurait coûté une lecture NVS.
    if(on) ledPixelWrite((uint8_t)this->_ledPin, LED_RECOVERY_R, LED_RECOVERY_G, LED_RECOVERY_B);
    else ledPixelWrite((uint8_t)this->_ledPin, 0, 0, 0);
  }
  else digitalWrite(this->_ledPin, (on != this->_ledActiveLow) ? HIGH : LOW);
}

void Recovery::beginDetection() {
  this->_resolveLed();
  if(this->_ledPin >= 0) {
    // Une LED adressable se pilote par RMT, qui prend lui-même la main sur la broche : un
    // pinMode(OUTPUT) préalable n'aurait aucun objet et serait défait au premier écrit.
    if(!this->_ledAddressable) pinMode(this->_ledPin, OUTPUT);
    this->_led(false);
  }

  Preferences p;
  p.begin("rst_logic", false);
  // Marqueur posé pour le Mode installation : consommé dès le retour.
  if(p.isKey("inst")) p.remove("inst");
  // Retour du Mode installation sans nouvelle image (cf. FwInfo::selectInstallMode) : ce firmware
  // avait déjà fait ses preuves, il n'a pas à repasser par FW_PROVEN_AFTER_MS.
  if(p.isKey("ok")) {
    p.remove("ok");
    const esp_partition_t *run = esp_ota_get_running_partition();
    esp_ota_img_states_t st;
    if(run && esp_ota_get_state_partition(run, &st) == ESP_OK && st == ESP_OTA_IMG_PENDING_VERIFY)
      esp_ota_mark_app_valid_cancel_rollback();
  }
  this->_cycle = p.getInt("c", 0) + 1;
  p.putInt("c", this->_cycle);
  // Décidé ici, avant le montage du filesystem et le chargement des réglages : un firmware qui
  // plante plus loin dans son démarrage reste ainsi rattrapable.
  if(this->_cycle >= RECOVERY_CYCLES) {
    p.putInt("c", 0);
    if(FwInfo::selectInstallMode()) {
      p.putUChar("inst", 1);
      p.end();
      Serial.println(F("\n[BOOT] Install mode requested"));
      for(int i = 0; i < 10; i++) {
        this->_led(!this->_ledOn);
        delay(150);
      }
      this->_led(false);
      ESP.restart();
    }
    Serial.println(F("\n[BOOT] Install mode missing, normal start"));
  }
  p.end();

  Serial.print(F("\n[BOOT] Cycle: "));
  Serial.println(this->_cycle);
  this->_detectStart = millis();
  this->_lastBlink = 0;
}

void Recovery::_serviceLed() {
  if(this->_ledPin < 0) return;
  // Ré-affirmation périodique, et non à chaque tour de boucle. Elle est nécessaire : pendant cette
  // fenêtre StatusLed::begin() éteint la broche une fois (cf. la cohabitation décrite dans
  // Recovery.h), et un éclat d'activité radio peut faire de même. Mais sur une LED adressable
  // chaque reprise est une trame RMT d'une trentaine de microsecondes, là où le digitalWrite
  // d'origine ne coûtait rien -- la payer des milliers de fois par seconde ralentirait le démarrage
  // pour un résultat identique à l'oeil. 100 ms, soit bien en dessous du seuil de perception.
  if((uint32_t)(millis() - this->_lastBlink) >= 100) {
    this->_led(true);
    this->_lastBlink = millis();
  }
}
// Referme la fenêtre : le compteur de cycles repart de zéro -- l'appareil a tenu BOOT_TIMEOUT sans
// coupure, c'est la définition même d'un démarrage normal -- et le témoin est rendu à StatusLed.
// Idempotente : closeDetection() peut l'appeler sur une fenêtre déjà close.
void Recovery::_finishDetection() {
  if(this->_detectClosed) return;
  this->_detectClosed = true;

  Preferences p;
  p.begin("rst_logic", false);
  p.putInt("c", 0);
  p.end();

  if(this->_ledPin >= 0) this->_led(false);
}
void Recovery::endDetection() {
  // La fenêtre court toujours : loopDetection() l'entretient et la refermera à son terme.
  Serial.println(F("Boot OK"));
}
void Recovery::loopDetection() {
  if(this->_detectClosed) return;
  if((uint32_t)(millis() - this->_detectStart) < BOOT_TIMEOUT) {
    this->_serviceLed();
    return;
  }
  this->_finishDetection();
  // Trace de contrôle de la manoeuvre : c'est cette ligne qui atteste que la fenêtre a bien duré
  // BOOT_TIMEOUT alors que le démarrage ne l'attendait plus.
  if(settings.enableDebugLogs)
    Serial.printf("[BOOT] Detection window closed at t=%lums\n", (unsigned long)millis());
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
  if(t.radio) clearNamespace("CC1101");
  if(t.system) {
    clearNamespace("MQTT");
    clearNamespace("NTP");
    // Réglages généraux uniquement : connType (réseau) et enableDebugLogs (interrupteur dédié)
    // sont délibérément épargnés pour que chaque case reste prévisible.
    // Les clés LED en font partie : une broche mal choisie n'est pas anodine (elle peut écraser une
    // sortie de la radio), et c'est ici la seule voie de retour en arrière sans effacement complet.
    static const char *k[] = {"hostname", "ssdpBroadcast", "checkForUpdate", "accentColor", "themeMode", "catColors",
                              "swShowGpio", "onboardingDone", "pendingLang", "langCode", "language",
                              "ledPin", "ledActiveLow", "ledAddr", "ledRfBlink"};
    removeKeys("CFG", k, sizeof(k) / sizeof(k[0]));
  }
  if(t.shades) {
    clearNamespace("Shades");
    removeFile("/shades.cfg");
    removeFile("/shades.cfg.bak");
    removeFile("/shades.tmp");
    removeFile("/controller.backup");
  }
  // Le .bak aussi : ScheduleConfigFile::load() se rabat dessus quand schedules.cfg manque, et les
  // plannings effacés reviendraient au démarrage suivant.
  if(t.schedules) {
    removeFile("/schedules.cfg");
    removeFile("/schedules.cfg.bak");
  }
  if(t.langs) {
    // Tous les packs téléchargés partent : la langue d'usine vit dans l'application.
    File dir = LittleFS.open("/locale");
    if(dir && dir.isDirectory()) {
      String victims[8];
      int n = 0;
      File f = dir.openNextFile();
      while(f && n < 8) {
        victims[n++] = String("/locale/") + String(f.name()).substring(String(f.name()).lastIndexOf('/') + 1);
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
    removeFile("/schedules.cfg.bak");
  }
  // Écrit en DERNIER : un effacement d'usine ou un formatage antérieur emporterait sinon la valeur
  // que l'utilisateur vient de demander.
  Preferences p;
  if(p.begin("CFG", false)) {
    p.putBool("enableDebugLogs", t.enableDebugLogs);
    p.end();
  }
  // Le compteur de cycles doit repartir de zéro, sinon le prochain démarrage le prolongerait.
  if(p.begin("rst_logic", false)) {
    p.putInt("c", 0);
    p.end();
  }
  Serial.println(F("[RECOVERY] Done."));
}

void Recovery::factoryReset(bool keepNetwork) {
  RecoveryTargets t;
  t.langs = true;
  if(!keepNetwork) t.factory = true;
  else {
    t.security = t.shades = t.schedules = t.rollingCodes = true;
    clearNamespace("MQTT");
    clearNamespace("NTP");
    // "mqttpub" reste : c'est la liste de ce que le courtier retient, nettoyée à la prochaine
    // connexion MQTT. CFG est vidé en entier (la case « système » n'en retire qu'une liste).
    Preferences p;
    if(p.begin("CFG", false)) {
      int8_t conn = p.getChar("connType", 0);
      char host[sizeof(settings.hostname)] = "";
      p.getString("hostname", host, sizeof(host));
      p.clear();
      if(conn) p.putChar("connType", conn);
      if(host[0]) p.putString("hostname", host);
      p.end();
    }
  }
  this->_apply(t);
}
