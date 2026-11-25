// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
//
// Firmware de secours (partition factory, dite « install »). Rejoint le reseau avec les reglages NVS du firmware
// principal, authentifie comme lui (jeton HMAC du namespace authkey), recoit une image, la verifie
// et l'ecrit dans app0. Seul /reset ecrit dans la NVS et efface les partitions cfg et spiffs.
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <esp_image_format.h>
#include <nvs_flash.h>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>
#include <mbedtls/version.h>
#ifdef INSTALL_ETH
#include <ETH.h>
#endif

#if MBEDTLS_VERSION_MAJOR >= 3
#define SHA_START(c) mbedtls_sha256_starts(c, 0)
#define SHA_UPDATE(c, d, l) mbedtls_sha256_update(c, d, l)
#define SHA_FINISH(c, o) mbedtls_sha256_finish(c, o)
#else
#define SHA_START(c) mbedtls_sha256_starts_ret(c, 0)
#define SHA_UPDATE(c, d, l) mbedtls_sha256_update_ret(c, d, l)
#define SHA_FINISH(c, o) mbedtls_sha256_finish_ret(c, o)
#endif

#define _IN_STR2(x) #x
#define _IN_STR(x) _IN_STR2(x)
static const char IMAGE_MARKER[] = "ESPSomfyRTS-PART/" _IN_STR(FW_PARTITION_LAYOUT) "/";
static const char AP_SSID[] = "ESPSomfy-RESCUE";
static const char INSTALL_TAG[] = FW_INSTALL_TAG INSTALL_ID "/" INSTALL_VER;
static const uint32_t NET_TIMEOUT_MS = 20000;
static const uint32_t IDLE_TIMEOUT_MS = 600000;

enum : uint8_t { CONN_UNSET = 0, CONN_WIFI = 1, CONN_ETH = 2, CONN_ETHPREF = 3, CONN_AP = 4 };
enum : uint8_t { SEC_NONE = 0, SEC_PIN = 1, SEC_PASSWORD = 2 };

struct {
  char hostname[32] = "ESPSomfyRTS";
  uint8_t connType = CONN_UNSET;
  char ssid[65] = "";
  char passphrase[65] = "";
  char apPassword[65] = "";
  bool hidden = false;
  bool dhcp = true;
  IPAddress ip, gateway, subnet, dns1;
  int8_t phyType = 0, phyAddress = 1, clkMode = 0, pwrPin = -1, mdcPin = 23, mdioPin = 18;
  uint8_t secType = SEC_NONE;
  uint8_t permissions = 0;
  char username[33] = "";
  char password[33] = "";
  char pin[5] = "";
  char apiSecret[65] = "";
  char lang[8] = "";
  char board[40] = "";
  bool byCycles = false;
} cfg;

struct {
  bool valid = false;
  char version[32] = "";
} mainApp;

static WebServer server(80);
static DNSServer dns;
static uint32_t lastSeen = 0;
static void touch() { lastSeen = millis(); }
static bool netUp = false;
static bool apOpen = false;
static bool ethUp = false;

static void readIp(Preferences &p, const char *key, IPAddress &out) {
  char buf[16];
  if(p.isKey(key) && p.getString(key, buf, sizeof(buf)) > 0) out.fromString(buf);
}

static void loadSettings() {
  Preferences p;
  if(p.begin("CFG", true)) {
    p.getString("hostname", cfg.hostname, sizeof(cfg.hostname));
    cfg.connType = p.getChar("connType", CONN_UNSET);
    if(p.isKey("fwBoard")) p.getString("fwBoard", cfg.board, sizeof(cfg.board));
    if(p.isKey("langCode")) p.getString("langCode", cfg.lang, sizeof(cfg.lang));
    else if(p.isKey("language")) strcpy(cfg.lang, p.getUChar("language", 0) == 1 ? "fr" : "en");
    p.end();
  }
  if(p.begin("WIFI", true)) {
    p.getString("ssid", cfg.ssid, sizeof(cfg.ssid));
    p.getString("passphrase", cfg.passphrase, sizeof(cfg.passphrase));
    p.getString("apPassword", cfg.apPassword, sizeof(cfg.apPassword));
    cfg.hidden = p.getBool("hidden", false);
    p.end();
  }
  if(p.begin("IP", true)) {
    cfg.dhcp = p.getBool("dhcp", true);
    readIp(p, "ip", cfg.ip);
    readIp(p, "gateway", cfg.gateway);
    readIp(p, "subnet", cfg.subnet);
    readIp(p, "dns1", cfg.dns1);
    p.end();
  }
  if(p.begin("ETH", true)) {
    cfg.phyType = p.getChar("phyType", cfg.phyType);
    cfg.phyAddress = p.getChar("phyAddress", cfg.phyAddress);
    cfg.clkMode = p.getChar("CLKMode", cfg.clkMode);
    cfg.pwrPin = p.getChar("PWRPin", cfg.pwrPin);
    cfg.mdcPin = p.getChar("MDCPin", cfg.mdcPin);
    cfg.mdioPin = p.getChar("MDIOPin", cfg.mdioPin);
    p.end();
  }
  if(p.begin("SEC", true)) {
    cfg.secType = p.getChar("type", SEC_NONE);
    cfg.permissions = p.getChar("permissions", 0);
    p.getString("username", cfg.username, sizeof(cfg.username));
    p.getString("password", cfg.password, sizeof(cfg.password));
    p.getString("pin", cfg.pin, sizeof(cfg.pin));
    p.end();
  }
  if(p.begin("rst_logic", true)) {
    cfg.byCycles = p.getUChar("inst", 0) == 1;
    p.end();
  }
  // Lecture seule : le secret est cree par le firmware principal. Absent = appareil jamais demarre
  // en v3, et seule une securite desactivee laisse alors passer (cf. checkAuth).
  if(p.begin("authkey", true)) {
    p.getString("secret", cfg.apiSecret, sizeof(cfg.apiSecret));
    p.end();
  }
}

// ---------------------------------------------------------------- Reseau

static bool waitWifi(uint32_t timeout) {
  uint32_t t0 = millis();
  while(millis() - t0 < timeout) {
    if(WiFi.status() == WL_CONNECTED) return true;
    delay(100);
  }
  return false;
}

static bool connectWifi() {
  if(cfg.ssid[0] == '\0') return false;
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(cfg.hostname);
  if(!cfg.dhcp && cfg.ip != IPAddress()) WiFi.config(cfg.ip, cfg.gateway, cfg.subnet, cfg.dns1);
  WiFi.begin(cfg.ssid, cfg.passphrase);
  return waitWifi(NET_TIMEOUT_MS);
}

#ifdef INSTALL_ETH
static void onEthEvent(WiFiEvent_t event) {
  if(event == ARDUINO_EVENT_ETH_GOT_IP) ethUp = true;
  else if(event == ARDUINO_EVENT_ETH_DISCONNECTED || event == ARDUINO_EVENT_ETH_STOP) ethUp = false;
}

static bool connectEthernet() {
  WiFi.onEvent(onEthEvent);
  if(!ETH.begin(cfg.phyAddress, cfg.pwrPin, cfg.mdcPin, cfg.mdioPin,
                static_cast<eth_phy_type_t>(cfg.phyType), static_cast<eth_clock_mode_t>(cfg.clkMode))) return false;
  ETH.setHostname(cfg.hostname);
  if(!cfg.dhcp && cfg.ip != IPAddress()) ETH.config(cfg.ip, cfg.gateway, cfg.subnet, cfg.dns1);
  uint32_t t0 = millis();
  while(millis() - t0 < NET_TIMEOUT_MS) {
    if(ethUp) return true;
    delay(100);
  }
  return false;
}
#endif

// Apres les 3 coupures : ESPSomfy-RESCUE, ouvert. Sinon le point d'acces
// que le principal ouvre sans reseau, nom et mot de passe compris (cf. NetManager::openSoftAP) :
// celui qui pilotait l'appareil par la reste connecte pendant l'envoi.
static void openAP(bool byCycles) {
  WiFi.mode(netUp && !ethUp ? WIFI_AP_STA : WIFI_AP);
  size_t n = strlen(cfg.apPassword);
  if(byCycles) apOpen = WiFi.softAP(AP_SSID);
  else apOpen = WiFi.softAP(cfg.hostname[0] ? cfg.hostname : "ESPSomfy RTS", n >= 8 && n < 64 ? cfg.apPassword : nullptr);
  if(apOpen) dns.start(53, "*", WiFi.softAPIP());
}

static void startNetwork() {
  bool ok = false;
  switch(cfg.connType) {
#ifdef INSTALL_ETH
    case CONN_ETH: ok = connectEthernet(); break;
    case CONN_ETHPREF: ok = connectEthernet() || connectWifi(); break;
#endif
    case CONN_WIFI: ok = connectWifi(); break;
    default: break;
  }
  netUp = ok;
  if(cfg.byCycles || !ok) openAP(cfg.byCycles);
  IPAddress ip = apOpen ? WiFi.softAPIP() : WiFi.localIP();
#ifdef INSTALL_ETH
  if(ethUp) ip = ETH.localIP();
#endif
  Serial.printf("[INSTALL] reseau=%d ap=%d ip=%s\n", netUp, apOpen, ip.toString().c_str());
  // Meme nom .local que le firmware principal : l'interface ouverte par ce nom attend le Mode
  // installation a la meme adresse (Firmware.waitInstallMode).
  if((netUp || apOpen) && MDNS.begin(cfg.hostname)) MDNS.addService("http", "tcp", 80);
}

// ---------------------------------------------------------------- Authentification

static bool hmacToken(const char *payload, char *out) {
  out[0] = '\0';
  if(cfg.apiSecret[0] == '\0') return false;
  uint8_t mac[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  if(mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1) != 0) {
    mbedtls_md_free(&ctx);
    return false;
  }
  mbedtls_md_hmac_starts(&ctx, (const uint8_t *)cfg.apiSecret, strlen(cfg.apiSecret));
  mbedtls_md_hmac_update(&ctx, (const uint8_t *)payload, strlen(payload));
  mbedtls_md_hmac_finish(&ctx, mac);
  mbedtls_md_free(&ctx);
  char *w = out;
  for(size_t i = 0; i < sizeof(mac); i++) w += sprintf(w, "%02x", mac[i]);
  return true;
}

static bool tokenFor(IPAddress ip, const char *user, const char *pass, const char *pin, char *out) {
  char payload[100];
  if(cfg.secType == SEC_PASSWORD)
    snprintf(payload, sizeof(payload), "%s:%s:%u.%u.%u.%u", user, pass, ip[0], ip[1], ip[2], ip[3]);
  else if(cfg.secType == SEC_PIN)
    snprintf(payload, sizeof(payload), "%s:%u.%u.%u.%u", pin, ip[0], ip[1], ip[2], ip[3]);
  else
    snprintf(payload, sizeof(payload), "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
  return hmacToken(payload, out);
}

static bool secureEquals(const char *a, const char *b) {
  size_t la = strlen(a), lb = strlen(b);
  uint8_t diff = la != lb;
  for(size_t i = 0; i < la; i++) diff |= a[i] ^ (i < lb ? b[i] : 0);
  return diff == 0;
}

static String hostOf(const String &url) {
  int s = url.indexOf("://");
  String h = s >= 0 ? url.substring(s + 3) : url;
  int e = h.indexOf('/');
  if(e >= 0) h = h.substring(0, e);
  return h;
}

static bool fromForeignSite() {
  if(server.hasHeader("Sec-Fetch-Site")) return server.header("Sec-Fetch-Site").equalsIgnoreCase("cross-site");
  if(!server.hasHeader("Origin")) return false;
  return hostOf(server.header("Origin")) != hostOf(server.header("Host"));
}

// Toujours avec cfg=true : une mise a jour est une operation de configuration, le mode
// « configuration seule » ne la rend jamais publique.
static bool checkAuth() {
  if(fromForeignSite()) return false;
  if(cfg.secType == SEC_NONE) return true;
  if(!server.hasHeader("apikey")) return false;
  char expected[65];
  if(!tokenFor(server.client().remoteIP(), cfg.username, cfg.password, cfg.pin, expected)) return false;
  if(expected[0] == '\0') return false;
  return secureEquals(expected, server.header("apikey").c_str());
}

static void handleLogin() {
  touch();
  if(fromForeignSite()) { server.send(403, "text/plain", "Forbidden"); return; }
  char token[65] = "";
  bool ok = false;
  if(cfg.secType == SEC_NONE) ok = true;
  else if(cfg.secType == SEC_PIN) ok = secureEquals(server.arg("pin").c_str(), cfg.pin);
  else ok = secureEquals(server.arg("username").c_str(), cfg.username) && secureEquals(server.arg("password").c_str(), cfg.password);
  if(!ok || (cfg.secType != SEC_NONE && !tokenFor(server.client().remoteIP(), cfg.username, cfg.password, cfg.pin, token))) {
    delay(1000);
    server.send(401, "application/json", "{\"success\":false}");
    return;
  }
  server.send(200, "application/json", String("{\"success\":true,\"apiKey\":\"") + token + "\"}");
}

// ---------------------------------------------------------------- Mise a jour

struct UploadState {
  bool rejected = false;
  bool markerFound = false;
  bool hasDigest = false;
  uint8_t expected[32];
  mbedtls_sha256_context sha;
  size_t matched = 0;
  size_t tagMatched = 0, tagHex = 0;
  bool isInstall = false;
  bool begun = false;
  const char *error = nullptr;
} up;

static int hexVal(char c) {
  if(c >= '0' && c <= '9') return c - '0';
  if(c >= 'a' && c <= 'f') return c - 'a' + 10;
  if(c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static bool parseDigest(const String &hex, uint8_t *out) {
  if(hex.length() != 64) return false;
  for(int i = 0; i < 32; i++) {
    int h = hexVal(hex[2 * i]), l = hexVal(hex[2 * i + 1]);
    if(h < 0 || l < 0) return false;
    out[i] = (h << 4) | l;
  }
  return true;
}

// Recherche incrementale : le marqueur peut tomber a cheval sur deux paquets.
static void scanMarker(const uint8_t *data, size_t len) {
  const size_t mlen = sizeof(IMAGE_MARKER) - 1;
  for(size_t i = 0; i < len && !up.markerFound; i++) {
    if(data[i] == (uint8_t)IMAGE_MARKER[up.matched]) {
      if(++up.matched == mlen) up.markerFound = true;
    }
    else up.matched = data[i] == (uint8_t)IMAGE_MARKER[0] ? 1 : 0;
  }
}

// Magie, puce et taille de flash declaree (octet 3, quartet haut) : une image d'une autre puce ou
// declarant plus de flash qu'il n'y en a ferait boucler le chargeur au demarrage.
static bool imageHeaderOk(const uint8_t *d, size_t len) {
  if(len < 16 || d[0] != 0xE9) return false;
  uint16_t chipId = d[12] | ((uint16_t)d[13] << 8);
  uint32_t declared = 1UL << (20 + (d[3] >> 4));
  return chipId == CONFIG_IDF_FIRMWARE_CHIP_ID && declared <= ESP.getFlashChipSize();
}

static void inspectMainApp();

// Un Mode installation dans app0 démarrerait à la place du firmware : son identifiant (préfixe suivi
// de 12 caractères hexadécimaux) le trahit, quand le firmware principal ne porte que le préfixe nu.
static void scanInstallTag(const uint8_t *data, size_t len) {
  const size_t plen = sizeof(FW_INSTALL_TAG) - 1;
  for(size_t i = 0; i < len && !up.isInstall; i++) {
    if(up.tagMatched == plen) {
      bool hex = (data[i] >= '0' && data[i] <= '9') || (data[i] >= 'a' && data[i] <= 'f');
      if(hex && ++up.tagHex == 12) up.isInstall = true;
      else if(!hex) { up.tagMatched = data[i] == (uint8_t)FW_INSTALL_TAG[0] ? 1 : 0; up.tagHex = 0; }
    }
    else if(data[i] == (uint8_t)FW_INSTALL_TAG[up.tagMatched]) up.tagMatched++;
    else up.tagMatched = data[i] == (uint8_t)FW_INSTALL_TAG[0] ? 1 : 0;
  }
}

static void reject(const char *why) {
  if(!up.rejected) Serial.printf("[INSTALL] envoi refuse : %s\n", why);
  up.rejected = true;
  up.error = why;
  Update.abort();
  if(up.begun) { up.begun = false; mainApp = {}; inspectMainApp(); }
}

static void handleUploadChunk() {
  touch();
  HTTPUpload &u = server.upload();
  if(u.status == UPLOAD_FILE_START) {
    up = UploadState();
    if(!checkAuth()) { reject("auth"); return; }
    up.hasDigest = server.hasHeader("X-Firmware-SHA256") && parseDigest(server.header("X-Firmware-SHA256"), up.expected);
    if(up.hasDigest) { mbedtls_sha256_init(&up.sha); SHA_START(&up.sha); }
    if(!Update.begin(UPDATE_SIZE_UNKNOWN, U_FLASH)) reject("begin");
    else up.begun = true;
  }
  else if(u.status == UPLOAD_FILE_WRITE) {
    if(up.rejected) return;
    if(u.totalSize == 0 && !imageHeaderOk(u.buf, u.currentSize)) { reject("header"); return; }
    scanMarker(u.buf, u.currentSize);
    scanInstallTag(u.buf, u.currentSize);
    if(up.hasDigest) SHA_UPDATE(&up.sha, u.buf, u.currentSize);
    if(Update.write(u.buf, u.currentSize) != u.currentSize) reject("write");
  }
  else if(u.status == UPLOAD_FILE_END) {
    if(up.rejected) return;
    if(!up.markerFound) { reject("marker"); return; }
    if(up.isInstall) { reject("install"); return; }
    if(up.hasDigest) {
      uint8_t got[32];
      SHA_FINISH(&up.sha, got);
      mbedtls_sha256_free(&up.sha);
      if(memcmp(got, up.expected, 32) != 0) { reject("sha256"); return; }
    }
    if(!Update.end(true)) reject("end");
    else {
      Preferences p;
      if(p.begin("rst_logic", false)) { p.remove("ok"); p.end(); }
    }
  }
  else if(u.status == UPLOAD_FILE_ABORTED) {
    reject("aborted");
  }
}

static void handleUploadDone() {
  if(up.rejected) {
    server.send(strcmp(up.error, "auth") == 0 ? 401 : 400, "application/json",
                String("{\"status\":\"ERROR\",\"desc\":\"") + up.error + "\"}");
    return;
  }
  server.send(200, "application/json", "{\"status\":\"SUCCESS\"}");
  delay(500);
  ESP.restart();
}

// L'image entiere est verifiee (sommes de controle comprises), pas seulement son descripteur : apres
// un envoi coupe, le descripteur de l'ancienne image est souvent encore lisible.
static void inspectMainApp() {
  const esp_partition_t *app = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, nullptr);
  if(!app) return;
  const esp_partition_pos_t pos = {app->address, app->size};
  esp_image_metadata_t meta;
  if(esp_image_verify(ESP_IMAGE_VERIFY_SILENT, &pos, &meta) != ESP_OK) return;
  mainApp.valid = true;
  static const char prefix[] = FW_VERSION_PREFIX;
  const size_t plen = sizeof(prefix) - 1;
  uint8_t buf[1024];
  size_t matched = 0, got = 0;
  for(uint32_t off = 0; off < meta.image_len; off += sizeof(buf)) {
    size_t n = min((uint32_t)sizeof(buf), meta.image_len - off);
    if(esp_partition_read(app, off, buf, n) != ESP_OK) return;
    for(size_t i = 0; i < n; i++) {
      if(matched == plen) {
        if(buf[i] == '\0' || got == sizeof(mainApp.version) - 1) return;
        mainApp.version[got++] = (char)buf[i];
      }
      else if(buf[i] == (uint8_t)prefix[matched]) matched++;
      else matched = buf[i] == (uint8_t)prefix[0] ? 1 : 0;
    }
  }
}

// Retour au firmware principal sans rien ecrire, s'il est toujours present et valide.
static void handleBootApp() {
  if(!checkAuth()) { server.send(401, "text/plain", "Unauthorized"); return; }
  const esp_partition_t *app = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, nullptr);
  if(!mainApp.valid || !app || esp_ota_set_boot_partition(app) != ESP_OK) {
    server.send(409, "application/json", "{\"status\":\"ERROR\",\"desc\":\"no app\"}");
    return;
  }
  server.send(200, "application/json", "{\"status\":\"SUCCESS\"}");
  delay(500);
  ESP.restart();
}

// ---------------------------------------------------------------- Reinitialisation

// Sans code seulement apres les coupures ET depuis son propre point d'acces : sur le reseau de la
// maison, un voisin pourrait sinon effacer la securite pendant l'attente.
static bool physical() {
  return cfg.byCycles && apOpen && server.client().localIP() == WiFi.softAPIP();
}

static void clearNs(const char *ns) {
  Preferences p;
  if(p.begin(ns, false)) { p.clear(); p.end(); }
}

static void removeKeys(const char *ns, const char *const *keys, size_t n) {
  Preferences p;
  if(!p.begin(ns, false)) return;
  for(size_t i = 0; i < n; i++) if(p.isKey(keys[i])) p.remove(keys[i]);
  p.end();
}

// cfg ne porte que shades.cfg et schedules.cfg, spiffs que des fichiers regenerables : le firmware
// principal les reformate vides au demarrage suivant (formatOnFail).
static void eraseData(const char *label) {
  const esp_partition_t *part = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, label);
  if(part) esp_partition_erase_range(part, 0, part->size);
}

static void handleReset() {
  touch();
  const bool phys = physical();
  if(phys ? fromForeignSite() : !checkAuth()) { server.send(401, "application/json", "{\"status\":\"ERROR\",\"desc\":\"auth\"}"); return; }
  auto on = [](const char *k) { return server.arg(k) == "1"; };
  if(!phys && (on("security") || on("factory"))) {
    server.send(403, "application/json", "{\"status\":\"ERROR\",\"desc\":\"cuts\"}");
    return;
  }
  if(on("factory")) {
    nvs_flash_erase();
    nvs_flash_init();
    eraseData("cfg");
    eraseData("spiffs");
  }
  else {
    if(on("network")) {
      clearNs("WIFI");
      clearNs("IP");
      clearNs("ETH");
      static const char *k[] = {"connType"};
      removeKeys("CFG", k, 1);
    }
    if(on("security")) {
      clearNs("SEC");
      clearNs("authkey");
    }
    if(on("radio")) clearNs("CC1101");
    if(on("system")) {
      clearNs("MQTT");
      clearNs("NTP");
      static const char *k[] = {"hostname", "ssdpBroadcast", "checkForUpdate", "accentColor", "themeMode", "catColors",
                                "swShowGpio", "onboardingDone", "pendingLang", "langCode", "language",
                                "ledPin", "ledActiveLow", "ledAddr", "ledRfBlink", "ledColAct", "ledColOrder",
                                "dashCompact", "dashOrder", "revDashCols", "defMobileTab", "hdrMobileDisp",
                                "showMoveInd", "showRadioAct", "geoLat", "geoLon"};
      removeKeys("CFG", k, sizeof(k) / sizeof(k[0]));
    }
    if(on("shades")) {
      clearNs("Shades");
      eraseData("cfg");
    }
    if(on("langs")) eraseData("spiffs");
  }
  Serial.println("[INSTALL] reinitialisation faite");
  server.send(200, "application/json", "{\"status\":\"SUCCESS\"}");
  delay(500);
  const esp_partition_t *app = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, nullptr);
  if(mainApp.valid && app) esp_ota_set_boot_partition(app);
  ESP.restart();
}

static void handleStatus() {
  touch();
  String json = "{\"install\":true,\"version\":\"" FW_VERSION "\",\"id\":\"";
  json += INSTALL_ID "\",\"ver\":\"" INSTALL_VER;
  json += "\",\"marker\":\"";
  json += IMAGE_MARKER;
  json += "\",\"host\":\"";
  json += cfg.hostname;
  json += "\",\"lang\":\"";
  json += cfg.lang;
  json += "\",\"board\":\"";
  json += cfg.board;
  json += "\",\"chip\":\"";
  json += ESP.getChipModel();
  json += "\",\"security\":";
  json += cfg.secType;
  json += ",\"cuts\":";
  json += physical() ? "true" : "false";
  json += ",\"main\":{\"valid\":";
  json += mainApp.valid ? "true" : "false";
  json += ",\"version\":";
  json += mainApp.version[0] ? String("\"") + mainApp.version + "\"" : String("null");
  json += "}}";
  server.send(200, "application/json", json);
}

// Page de dernier recours, pour l'acces sans le firmware principal (3 coupures, firmware absent ou
// bouton de la page Appareil). Autonome : aucune CSS ni aucun script du firmware principal n'est
// disponible ici. Textes FR/EN choisis par /install (langue de l'appareil), sinon par le navigateur.
static const char PAGE[] PROGMEM = R"HTML(<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>ESPSomfy-RTS</title><style>
:root{--a:#1a5fb4;--oa:#fff;--g:oklch(from #1a5fb4 min(l,.5) c h);--bg:#e1e5eb;--panel:#f3f5f8;--surface:#fff;--s2:#e2e6ec;--border:#c3c9d2;--text:#17181c;--t2:#3b3d44;--ok:#1f6b24;--okb:#e3f3e5;--bad:#b3261e;--badb:#fdecea;--sh:0 14px 34px rgba(0,0,0,.18);color-scheme:light dark}
@media(prefers-color-scheme:dark){:root{--bg:#0b0d10;--panel:#181c22;--surface:#232933;--s2:#343b47;--border:#4a5260;--text:#eceef2;--t2:#c3c8d1;--ok:#7bd17f;--okb:#16301a;--bad:#ff8a80;--badb:#3b1a18;--a:oklch(from #1a5fb4 max(l,.72) c h);--oa:#0e1013;--sh:0 14px 34px rgba(0,0,0,.6)}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:flex;font:16px/1.45 "Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--text);background:var(--bg)}
.hero{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;width:340px;flex:none;padding:32px 28px;text-align:center;color:#fff;background:linear-gradient(135deg,color-mix(in srgb,var(--g) 88%,#000) 0%,var(--g) 40%,color-mix(in srgb,var(--g),#fff 18%) 100%);box-shadow:4px 0 0 color-mix(in srgb,var(--g) 70%,#000)}
.medal{display:grid;place-items:center;width:120px;height:120px;border-radius:50%;background:color-mix(in srgb,#fff 92%,var(--g));box-shadow:0 0 0 10px rgba(255,255,255,.22)}.medal svg{width:58px;height:58px}
h1{margin:0;font-size:1.375em;font-weight:800;letter-spacing:-.02em;line-height:1.1}.hero p{margin:0;color:rgba(255,255,255,.8);font-size:.875em}.hero .eb{margin-bottom:4px;color:#fff;font-size:.9375em;font-weight:800}
main{flex:1;display:grid;place-items:center;padding:24px 16px}
.card{display:flex;flex-direction:column;gap:14px;width:min(100%,460px);padding:28px 24px 24px;border-radius:22px;background:var(--panel);box-shadow:var(--sh)}
.lead{margin:0;font-size:.875em;color:var(--t2)}.fid{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.fid span{font-size:.8125em;font-weight:700}.fid code{font:600 .8125em ui-monospace,Menlo,Consolas,monospace;color:var(--t2);word-break:break-all}.fid b{color:var(--a)}
.st{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;font-size:.875em;background:var(--okb);color:var(--ok)}.st.bad{background:var(--badb);color:var(--bad)}.st i{width:10px;height:10px;border-radius:50%;background:currentColor;flex:none}
.f{display:flex;flex-direction:column;gap:6px}.f label{font-size:.8125em;font-weight:700}
.box{display:flex;align-items:center;min-height:46px;padding:0 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.box:focus-within{border-color:var(--a)}
.box input{flex:1;min-width:0;padding:12px 0;border:0;background:transparent;font:inherit;font-size:.9375em;color:var(--text);outline:0}
.drop{display:flex;flex-direction:column;align-items:center;gap:4px;padding:18px 12px;border:2px dashed var(--border);border-radius:14px;background:var(--surface);text-align:center;cursor:pointer;font-size:.875em;color:var(--t2)}
.drop:hover,.drop.ov{border-color:var(--a)}.drop b{color:var(--text);font-size:1.0714em;word-break:break-all}.drop svg{width:28px;height:28px;fill:var(--a)}
.bar{position:relative;height:8px;border-radius:99px;background:var(--s2);overflow:hidden}.bar i{position:relative;z-index:2;display:block;height:100%;width:0;background:var(--a);border-radius:inherit;transition:width .2s}.bar.run::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--a) 40%,transparent),transparent);transform:translateX(-100%);animation:hl 2s infinite ease-in-out}@keyframes hl{to{transform:translateX(100%)}}@media(prefers-reduced-motion:reduce){.bar.run::before{animation:none}}
.msg{margin:0;min-height:1.4em;font-size:.875em;font-weight:600;color:var(--t2)}.msg.bad{color:var(--bad)}
.btns{display:flex;gap:10px}.btn{flex:1 1 0;min-height:44px;padding:0 16px;border:0;border-radius:12px;background:var(--s2);color:var(--text);font:inherit;font-size:.875em;font-weight:700;cursor:pointer}
.btn.p{background:var(--a);color:var(--oa)}.help{align-self:center;font-size:.8125em;font-weight:600;color:var(--a)}.btn[disabled]{opacity:.5;cursor:default}[hidden]{display:none!important}
.pick{display:flex;gap:14px;align-items:center;width:100%;padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:var(--text);font:inherit;text-align:left;cursor:pointer}.pick:hover{border-color:var(--a)}.pick svg{width:28px;height:28px;flex:none;fill:var(--a)}
.pick span,.row span{display:flex;flex-direction:column;gap:2px}.pick small,.row small{font-size:.8125em;color:var(--t2)}.pick b{font-size:.9375em}
.rows{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}
.row{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;cursor:pointer}.row+.row{border-top:1px solid var(--border)}.row b{font-size:.9375em}
.row input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--a);flex:none}.row.dgr b{color:var(--bad)}.row.dgr input{accent-color:var(--bad)}.row.off{opacity:.5;cursor:default}
.back{align-self:flex-start;padding:0;border:0;background:none;font:inherit;font-size:.875em;font-weight:700;color:var(--a);cursor:pointer}
@media(max-width:767px){body{flex-direction:column}.hero{width:auto;flex-direction:row;justify-content:flex-start;gap:14px;padding:16px;text-align:left;box-shadow:0 4px 0 color-mix(in srgb,var(--g) 70%,#000)}.medal{width:56px;height:56px;box-shadow:0 0 0 5px rgba(255,255,255,.22)}.medal svg{width:28px;height:28px}.hero .eb{display:none}main{place-items:start center}}
</style></head><body>
<svg width=0 height=0 style=position:absolute><defs><linearGradient id=ls gradientUnits=userSpaceOnUse x1=15.5 x2=35.2><stop offset=0 stop-color=#3a9cf0 /><stop offset=1 stop-color=#36b4ff /></linearGradient></defs>
<symbol id=lg viewBox="0 0 36 36"><path fill=#1d7be6 d="M0 32.5V15.6q0-1.5 1.2-2.5L13.6 3l5.5 6L8 19.9v12.6q0 1.5-1.5 1.5h-5Q0 34 0 32.5z"/><path fill=#145bb9 d="M0 23.4l8-3.5V34H1.5Q0 34 0 32.5z"/><path fill=#30a7fa d="M13.6 3q1.2-1 2.6-1h3.9q1.3 0 2.3.8L36 14.2v6.7L19.1 9z"/><path fill=#165eaf d="M13.6 3l5.5 6-1.2 1.2-5.6-6.2z"/><g fill=url(#ls)><path d="M16 17h12.5l3 2H16z"/><rect x=16 y=21 width=19 height=2 rx=.25 /><rect x=16 y=25 width=19 height=2 rx=.25 /><rect x=16 y=29 width=19 height=2 rx=.25 /></g><g fill=#3a9df1><rect x=32 y=21 width=3 height=2 rx=.25 /><rect x=32 y=25 width=3 height=2 rx=.25 /><rect x=32 y=29 width=3 height=2 rx=.25 /></g></symbol></svg>
<aside class=hero><div class=medal><svg><use href=#lg /></svg></div><div><p class=eb>ESPSomfy-RTS</p><h1 data-t=title></h1><p id=host></p></div></aside>
<main><div class=card><button class=back id=bk data-s=fr data-t=back2></button><p class=lead data-s=h data-t=q></p><p class=lead data-s=f data-t=lead></p><div class=st id=st data-s=hf><i></i><span id=stt></span></div><button class=pick data-s=h onclick="show('f')"><svg viewBox="0 0 24 24"><path d="M12 21a1 1 0 0 1-1-1v-9.6l-3.3 3.3a1 1 0 0 1-1.4-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1-1.4 1.4L13 10.4V20a1 1 0 0 1-1 1zM5 3h14a1 1 0 1 1 0 2H5a1 1 0 0 1 0-2z"/></svg><span><b data-t=pfw></b><small data-t=pfwd></small></span></button><button class=pick data-s=h onclick="show('r')"><svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 1-7.4 5 1 1 0 1 1 1.8.8A6 6 0 1 0 12 6v2.2a.5.5 0 0 1-.8.4L7.6 6a.5.5 0 0 1 0-.8l3.6-2.6a.5.5 0 0 1 .8.4z"/></svg><span><b data-t=prs></b><small data-t=prsd></small></span></button><button class=btn id=bb data-s=h data-t=back disabled></button><div class=fid data-s=f><span data-t=fid></span><code>ESPSomfyRTS_<i data-t=ver></i>_ota_<b id=dev></b>.bin</code></div><div class=rows id=rows data-s=r></div><p class=lead data-s=r data-t=note></p><div class=f id=fu data-s=fr hidden><label data-t=user></label><div class=box><input id=u autocomplete=username></div></div><div class=f id=fp data-s=fr hidden><label id=lp></label><div class=box><input id=p type=password autocomplete=current-password></div></div><label class=drop id=dz data-s=f><svg viewBox="0 0 24 24"><path d="M12 21a1 1 0 0 1-1-1v-9.6l-3.3 3.3a1 1 0 0 1-1.4-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1-1.4 1.4L13 10.4V20a1 1 0 0 1-1 1zM5 3h14a1 1 0 1 1 0 2H5a1 1 0 0 1 0-2z"/></svg><b id=fn data-t=pick></b><span data-t=drop></span><input id=f type=file accept=.bin hidden></label><div class=bar id=br data-s=f><i id=pg></i></div><p class=msg id=m data-s=fr></p><div class=btns data-s=f><button class="btn p" id=bi data-t=go></button></div><div class=btns data-s=r><button class="btn p" id=bz data-t=reset></button></div><a class=help href="https://xkain.github.io/ESPSomfy-RTS/guide/v3/appareil/systeme/firmware-de-secours/" target=_blank rel=noopener data-t=help></a></div></main>
<script>
const L={fr:{title:'Firmware de secours',lead:"Choisissez un fichier de firmware ESPSomfy-RTS pour l'installer.",ok:'Firmware installé : ',fid:'Le fichier qui correspond à votre appareil',ver:'[version]',none:'Aucun firmware valide',none2:' · installez-en un pour reprendre',user:'Utilisateur',pin:'Code PIN',pass:'Mot de passe',pick:'Choisir un fichier de firmware',drop:'ou le déposer ici',back:'Revenir au firmware',go:'Installer',nofile:"Choisissez d'abord un fichier.",send:'Envoi…',done:"Installé. Redémarrage de l'appareil…",going:'Retour au firmware…',auth:'Code incorrect ou accès refusé.',marker:"Ce fichier n'est pas un firmware ESPSomfy-RTS pour cet appareil.",header:'Ce fichier est fait pour une autre puce.',sha256:'Le fichier est abîmé.',noapp:'Aucun firmware valide à relancer.',install:'Ce fichier est un firmware de secours, pas le firmware principal.',fail:"L'installation a échoué.",help:'Aide sur le firmware de secours',q:'Que voulez-vous faire ?',pfw:'Installer un firmware',pfwd:'Remplacer ou réparer le firmware principal avec un fichier .bin.',prs:'Réinitialiser',prsd:"Effacer le réseau, la radio, les équipements… ou tout.",back2:'‹ Retour au choix',reset:'Réinitialiser et redémarrer',note:"Équipements, groupes et plannings ne reviennent qu'avec une sauvegarde.",lock:'3 coupures de courant nécessaires',nosel:'Cochez au moins un élément.',sure:'Effacer définitivement les éléments cochés ?',rdone:"Réinitialisé. Redémarrage de l'appareil…",cuts:'Sécurité et Tout effacer exigent 3 coupures de courant.',
network:['Réseau','Wi-Fi, adresse IP, Ethernet.'],security:['Sécurité','Code PIN, identifiant et mot de passe.'],radio:['Radio','Module, broches, fréquence, puissance.'],system:['Réglages système',"MQTT, heure, nom et préférences de l'appareil."],shades:['Équipements, groupes et pièces','Avec les plannings, répéteurs et télécommandes.'],langs:['Langues téléchargées',"La langue d'origine reste."],factory:['Tout effacer',"Retour à l'état d'usine, codes tournants compris."]},
en:{title:'Rescue firmware',lead:'Choose an ESPSomfy-RTS firmware file to install it.',ok:'Installed firmware: ',fid:'The file that matches your device',ver:'[version]',none:'No valid firmware',none2:' · install one to resume',user:'Username',pin:'PIN code',pass:'Password',pick:'Choose a firmware file',drop:'or drop it here',back:'Back to firmware',go:'Install',nofile:'Choose a file first.',send:'Uploading…',done:'Installed. The device is restarting…',going:'Returning to the firmware…',auth:'Wrong code or access denied.',marker:'This file is not an ESPSomfy-RTS firmware for this device.',header:'This file is built for another chip.',sha256:'The file is damaged.',noapp:'No valid firmware to start.',install:'This file is a rescue firmware, not the main firmware.',fail:'Installation failed.',help:'Help about the rescue firmware',q:'What do you want to do?',pfw:'Install a firmware',pfwd:'Replace or repair the main firmware with a .bin file.',prs:'Reset',prsd:'Erase the network, radio, devices… or everything.',back2:'‹ Back to the choice',reset:'Reset and restart',note:'Devices, groups and schedules only come back from a backup.',lock:'3 power cuts required',nosel:'Tick at least one item.',sure:'Permanently erase the ticked items?',rdone:'Reset done. The device is restarting…',cuts:'Security and Erase everything require 3 power cuts.',
network:['Network','Wi-Fi, IP address, Ethernet.'],security:['Security','PIN code, username and password.'],radio:['Radio','Module, pins, frequency, power.'],system:['System settings','MQTT, time, device name and preferences.'],shades:['Devices, groups and rooms','With schedules, repeaters and remotes.'],langs:['Downloaded languages','The original language stays.'],factory:['Erase everything','Back to factory state, rolling codes included.']}};
const $=i=>document.getElementById(i);let T=L.en,sec=0,cuts=false,file=null,busy=false,P='h';
const show=v=>{P=v;document.querySelectorAll('[data-s]').forEach(e=>e.hidden=!e.dataset.s.includes(v));auth();say('')};
const auth=()=>{const a=sec&&!(P=='r'&&cuts);$('fu').hidden=!a||sec!=2||P=='h';$('fp').hidden=!a||P=='h'};
const K=['network','security','radio','system','shades','langs','factory'],PH={security:1,factory:1};
const say=(k,bad,x)=>{$('m').textContent=(T[k]||k)+(x?' ('+x+')':'');$('m').className='msg'+(bad?' bad':'')};show('h');
fetch('/install').then(r=>r.json()).then(j=>{
 const n=(j.lang||navigator.language||'en').slice(0,2);T=L[n]||L.en;document.documentElement.lang=L[n]?n:'en';
 document.querySelectorAll('[data-t]').forEach(e=>e.textContent=T[e.dataset.t]);document.title='ESPSomfy-RTS · '+T.title;
 $('host').textContent='v'+j.ver+' · '+(j.host?j.host+' · ':'')+location.host;sec=j.security;cuts=j.cuts;$('lp').textContent=sec==2?T.pass:T.pin;auth();
 $('rows').innerHTML=K.map(k=>{const off=PH[k]&&!cuts;return`<label class="row${k=='factory'?' dgr':''}${off?' off':''}"><input type=checkbox id=r_${k}${off?' disabled':''}><span><b>${T[k][0]}</b><small>${off?T.lock:T[k][1]}</small></span></label>`}).join('');
 $('st').classList.toggle('bad',!j.main.valid);$('stt').textContent=j.main.valid?T.ok+(j.main.version||'?'):T.none+T.none2;$('dev').textContent=j.board||{'ESP32-C3':'esp32c3','ESP32-S2':'esp32s2','ESP32-S3':'esp32s3','ESP32-C6':'esp32c6'}[j.chip]||'esp32';$('bb').disabled=!j.main.valid});
const pickf=x=>{if(x){file=x;$('fn').textContent=x.name}};
$('f').onchange=e=>pickf(e.target.files[0]);
['dragover','dragenter'].forEach(v=>$('dz').addEventListener(v,e=>{e.preventDefault();$('dz').classList.add('ov')}));
['dragleave','drop'].forEach(v=>$('dz').addEventListener(v,()=>$('dz').classList.remove('ov')));
$('dz').addEventListener('drop',e=>{e.preventDefault();pickf(e.dataTransfer.files[0])});
async function key(){if(!sec||(P=='r'&&cuts))return'';const l=await fetch('/login',{method:'POST',body:new URLSearchParams(sec==2?{username:$('u').value,password:$('p').value}:{pin:$('p').value})});if(!l.ok)throw'auth';return(await l.json()).apiKey||''}
function lock(b){busy=b;$('br').classList.toggle('run',b);$('bi').disabled=$('bz').disabled=$('bk').disabled=b;$('bb').disabled=b||$('st').classList.contains('bad')}
function home(q){setTimeout(function w(){fetch('/loginContext').then(r=>r.ok?location.replace('/'+(q||'')):setTimeout(w,2000)).catch(()=>setTimeout(w,2000))},4000)}
$('bi').onclick=async()=>{if(busy)return;if(!file)return say('nofile',1);lock(true);say('send');
 try{const k=await key();const d=new FormData();d.append('f',file);const x=new XMLHttpRequest();x.open('POST','/updateFirmware');x.setRequestHeader('apikey',k);
 x.upload.onprogress=e=>{if(e.lengthComputable)$('pg').style.width=(e.loaded/e.total*100)+'%'};
 x.onload=()=>{if(x.status==200){say('done');home('?installed')}else{let c='';try{c=JSON.parse(x.responseText).desc}catch(e){}lock(false);$('pg').style.width=0;say(L.en[c]?c:'fail',1,L.en[c]?'':c||x.status);fetch('/install').then(r=>r.json()).then(j=>{$('st').classList.toggle('bad',!j.main.valid);if(!j.main.valid)$('stt').textContent=T.none+T.none2;lock(false)})}};
 x.onerror=()=>{lock(false);say('fail',1)};x.send(d)}catch(e){lock(false);say(e=='auth'?'auth':'fail',1)}};
$('bk').onclick=()=>busy||show('h');
$('bz').onclick=async()=>{if(busy)return;const b=new URLSearchParams();K.forEach(k=>{if($('r_'+k).checked)b.append(k,1)});if(![...b].length)return say('nosel',1);if(!confirm(T.sure))return;lock(true);
 try{const r=await fetch('/reset',{method:'POST',headers:{apikey:await key()},body:b});if(r.ok){say('rdone');$('st').classList.contains('bad')?setTimeout(()=>location.reload(),8000):home()}else{lock(false);say(r.status==401?'auth':r.status==403?'cuts':'fail',1)}}catch(e){lock(false);say(e=='auth'?'auth':'fail',1)}};
$('bb').onclick=async()=>{if(busy)return;lock(true);say('going');try{const r=await fetch('/bootApp',{method:'POST',headers:{apikey:await key()}});if(r.ok)home();else{lock(false);say(r.status==401?'auth':'noapp',1)}}catch(e){lock(false);say(e=='auth'?'auth':'fail',1)}};
</script></body></html>)HTML";

// ---------------------------------------------------------------- Temoin

// Boitiers officiels seulement, broche cablee (LED_PROFILE_* de src/Recovery.h, verifie par
// check_install_contract.py) : sur une carte generique, la broche reglee pourrait heurter l'Ethernet.
static const struct { const char *board; int8_t pin; bool low; } BOX_LED[] = {
  {"_BOX_eth", 5, true},
  {"_BOX_wifi", 2, false},
};
static int8_t ledPin = -1;
static bool ledLow = false;

static void ledBegin() {
  for(const auto &b : BOX_LED)
    if(strstr(cfg.board, b.board)) { ledPin = b.pin; ledLow = b.low; }
  if(ledPin >= 0) pinMode(ledPin, OUTPUT);
}

// Clignotement lent tant que l'appareil est sur le firmware de secours.
static void ledLoop() {
  static uint32_t last = 0;
  static bool on = false;
  if(ledPin < 0 || millis() - last < 800) return;
  last = millis();
  on = !on;
  digitalWrite(ledPin, on != ledLow ? HIGH : LOW);
}

void setup() {
  Serial.begin(115200);
  // Seul usage d'INSTALL_TAG : sans lui, l'éditeur de liens retirerait la balise de l'image, et ni le
  // firmware principal ni le catalogue ne reconnaîtraient plus ce firmware.
  Serial.printf("\n[INSTALL] Firmware de secours %s\n", INSTALL_TAG);
  loadSettings();
  ledBegin();
  inspectMainApp();
  startNetwork();
  static const char *headers[] = {"apikey", "Origin", "Host", "Sec-Fetch-Site", "X-Firmware-SHA256"};
  server.collectHeaders(headers, sizeof(headers) / sizeof(headers[0]));
  server.on("/", HTTP_GET, []() { touch(); server.send_P(200, "text/html", PAGE); });
  // Portail captif, pour les seuls clients du point d'acces : toute autre adresse renvoie vers la page.
  server.onNotFound([]() {
    if(apOpen && server.client().localIP() == WiFi.softAPIP() && server.hostHeader() != WiFi.softAPIP().toString()) {
      server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/");
      server.send(302, "text/plain", "");
    }
    else server.send(404, "text/plain", "Not found");
  });
  server.on("/install", HTTP_GET, handleStatus);
  server.on("/login", HTTP_POST, handleLogin);
  server.on("/updateFirmware", HTTP_POST, handleUploadDone, handleUploadChunk);
  server.on("/bootApp", HTTP_POST, handleBootApp);
  server.on("/reset", HTTP_POST, handleReset);
  server.begin();
}

// Retour seul au firmware installe apres IDLE_TIMEOUT_MS sans client, s'il est intact : une entree
// involontaire (bouton, coupures accidentelles) ne laisse pas l'appareil hors service.
static void loopIdle() {
  if(apOpen && cfg.byCycles && WiFi.softAPgetStationNum() > 0) touch();
  if(!mainApp.valid || (uint32_t)(millis() - lastSeen) < IDLE_TIMEOUT_MS) return;
  const esp_partition_t *app = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, nullptr);
  if(app && esp_ota_set_boot_partition(app) == ESP_OK) {
    Serial.println("[INSTALL] inactif : retour au firmware installe");
    ESP.restart();
  }
  touch();
}

void loop() {
  if(apOpen) dns.processNextRequest();
  loopIdle();
  ledLoop();
  server.handleClient();
  delay(2);
}
