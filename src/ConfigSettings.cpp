#include <Arduino.h>
#include <LittleFS.h>        // https://github.com/espressif/arduino-esp32/tree/master/libraries/LittleFS
#include <time.h>
#include <WiFi.h>
#include <Preferences.h>
#include "ConfigSettings.h"
#include "Utils.h"
#include "esp_chip_info.h"

extern ConfigSettings settings;
Preferences pref;

static const char *LANG_CODE_TABLE[] = { "en", "fr", "de", "es" };
#define LANG_CODE_TABLE_SIZE (sizeof(LANG_CODE_TABLE) / sizeof(LANG_CODE_TABLE[0]))

void langIndexToCode(uint8_t idx, char *dest, size_t destSize) {
  const char *code = (idx < LANG_CODE_TABLE_SIZE) ? LANG_CODE_TABLE[idx] : "en";
  strlcpy(dest, code, destSize);
}
uint8_t langCodeToIndex(const char *code) {
  for(uint8_t i = 0; i < LANG_CODE_TABLE_SIZE; i++) {
    if(strcmp(code, LANG_CODE_TABLE[i]) == 0) return i;
  }
  return 0; // Défaut anglais pour un code que l'ancien format (shades.cfg) ne connaît pas.
}

void restore_options_t::fromJSON(JsonObject &obj) {
  if(obj.containsKey("shades")) this->shades = obj["shades"];
  if(obj.containsKey("settings")) this->settings = obj["settings"];
  if(obj.containsKey("network")) this->network = obj["network"];
  if(obj.containsKey("transceiver")) this->transceiver = obj["transceiver"];
  if(obj.containsKey("repeaters")) this->repeaters = obj["repeaters"];
  if(obj.containsKey("mqtt")) this->mqtt = obj["mqtt"];
}
int8_t appver_t::compare(appver_t &ver) {
  if(this->major == ver.major && this->minor == ver.minor && this->build == ver.build) return 0;
  if(this->major > ver.major) return 1;
  else if(this->major < ver.major) return -1;
  else {
    if(this->minor > ver.minor) return 1;
    else if(this->minor < ver.minor) return -1;
    else {
      if(this->build > ver.build) return 1;
      else if(this->build < ver.build) return -1;
    }
  }
  return 0;
}
void appver_t::copy(appver_t &ver) {
  strcpy(this->name, ver.name);
  this->major = ver.major;
  this->minor = ver.minor;
  this->build = ver.build;
  strcpy(this->suffix, ver.suffix);
}
void appver_t::parse(const char *ver) {
  // Now lets parse this pig.
  memset(this, 0x00, sizeof(appver_t));
  strlcpy(this->name, ver, sizeof(this->name));
  char num[3];
  uint8_t i = 0;
  memset(num, 0x00, sizeof(num));
  for(uint8_t j = 0; j < sizeof(num) - 1 && i < strlen(ver);) {
    char ch = ver[i++];
    // Trim off all the prefix.
    if(ch == '.') break;
    if(!isdigit(ch)) continue;
    if(ch != '.')
      num[j++] = ch;
    else
      break;
  }
  this->major = static_cast<uint8_t>(atoi(num) & 0xFF);
  memset(num, 0x00, sizeof(num));
  for(uint8_t j = 0; j < sizeof(num) - 1 && i < strlen(ver);) {
    char ch = ver[i++];
    if(ch != '.')
      num[j++] = ch;
    else
      break;
  }
  this->minor = static_cast<uint8_t>(atoi(num) & 0xFF);
  memset(num, 0x00, sizeof(num));
  for(uint8_t j = 0; j < sizeof(num) - 1 && i < strlen(ver);) {
    char ch = ver[i++];
    if(!isdigit(ch)) break;
    if(ch != '.')
      num[j++] = ch;
    else
      break;
  }
  this->build = static_cast<uint8_t>(atoi(num) & 0xFF);
  if(strlen(ver) < i) strlcpy(this->suffix, &ver[i], sizeof(this->suffix));
}
bool appver_t::toJSON(JsonObject &obj) {
  obj["name"] = this->name;
  obj["major"] = this->major;
  obj["minor"] = this->minor;
  obj["build"] = this->build;
  obj["suffix"] = this->suffix;
  return true;
}
void appver_t::toJSON(JsonResponse &json) {
  json.addElem("name", this->name);
  json.addElem("major", this->major);
  json.addElem("minor", this->minor);
  json.addElem("build", this->build);
  json.addElem("suffix", this->suffix);
}
void appver_t::toJSON(JsonSockEvent *json) {
  json->addElem("name", this->name);
  json->addElem("major", this->major);
  json->addElem("minor", this->minor);
  json->addElem("build", this->build);
  json->addElem("suffix", this->suffix);
}

bool BaseSettings::load() { return true; }
bool BaseSettings::loadFile(const char *filename) {
  size_t filesize = 10;
  String data = "";
  if(LittleFS.exists(filename)) {
    File file = LittleFS.open(filename, "r");
    filesize += file.size();
    while(file.available()) {
      char c = file.read();
      data += c;
    }
    DynamicJsonDocument doc(filesize);
    deserializeJson(doc, data);
    JsonObject obj = doc.as<JsonObject>();
    this->fromJSON(obj);
    file.close();
  }
  return false;
}
bool BaseSettings::saveFile(const char *filename) {
  File file = LittleFS.open(filename, "w");
  DynamicJsonDocument doc(2048);
  JsonObject obj = doc.as<JsonObject>();
  this->toJSON(obj);
  serializeJson(doc, file);
  file.close();
  return true;
}
bool BaseSettings::parseValueString(JsonObject &obj, const char *prop, char *pdest, size_t size) {
  if(obj.containsKey(prop)) strlcpy(pdest, obj[prop], size);
  return true;
}
bool BaseSettings::parseSecretString(JsonObject &obj, const char *prop, char *pdest, size_t size) {
  if(obj.containsKey(prop)) {
    const char *val = obj[prop] | "";
    if(strlen(val) > 0) strlcpy(pdest, val, size);
  }
  return true;
}
bool BaseSettings::parseIPAddress(JsonObject &obj, const char *prop, IPAddress *pdest) {
  if(obj.containsKey(prop)) {
    char buff[16];
    strlcpy(buff, obj[prop], sizeof(buff));
    pdest->fromString(buff);
  }
  return true;
}
int BaseSettings::parseValueInt(JsonObject &obj, const char *prop, int defVal) {
  if(obj.containsKey(prop)) return obj[prop];
  return defVal;
}
double BaseSettings::parseValueDouble(JsonObject &obj, const char *prop, double defVal) {
  if(obj.containsKey(prop)) return obj[prop];
  return defVal;
}

bool ConfigSettings::begin() {
  uint32_t chipId = 0;
  esp_chip_info_t ci;
  esp_chip_info(&ci);

  // 1. Détermination du processeur physique (Remis comme à l'origine)
  switch(ci.model) {
    case esp_chip_model_t::CHIP_ESP32:
      if (psramFound()) {
        strcpy(this->chipModel, "wrover");
      } else {
        strcpy(this->chipModel, "");
      }
      break;
    case esp_chip_model_t::CHIP_ESP32S3:
      strcpy(this->chipModel, "s3");
      break;
    case esp_chip_model_t::CHIP_ESP32S2:
      strcpy(this->chipModel, "s2");
      break;
    case esp_chip_model_t::CHIP_ESP32C3:
      strcpy(this->chipModel, "c3");
      break;
    case esp_chip_model_t::CHIP_ESP32H2:
      strcpy(this->chipModel, "h2");
      break;
    default:
      sprintf(this->chipModel, "UNK%d", static_cast<int>(ci.model));
      break;
  }

  // 2. Détermination du profil matériel lié à l'environnement d'exécution
  #if defined(HARDWARE_BOX_ETH)
    strcpy(this->hardwareProfile, "BOX-ETH");
  #elif defined(HARDWARE_BOX_WIFI)
    strcpy(this->hardwareProfile, "BOX-WIFI");
  #else
    strcpy(this->hardwareProfile, "GENERIC");
  #endif

  // LOG DE DEBUG ET DE VALIDATION DU BOOT
  Serial.printf("Chip Model ESP32-%s | Hardware Profile: %s\n", this->chipModel, this->hardwareProfile);

  this->fwVersion.parse(FW_VERSION);
  uint64_t mac = ESP.getEfuseMac();
  for(int i=0; i<17; i=i+8) {
    chipId |= ((mac >> (40 - i)) & 0xff) << i;
  }
  snprintf_P(this->serverId, sizeof(this->serverId), "%02X%02X%02X",
    (uint16_t)((chipId >> 16) & 0xff),
    (uint16_t)((chipId >> 8) & 0xff),
    (uint16_t)chipId & 0xff);
  this->load();
  this->Security.begin();
  this->IP.begin();
  this->WIFI.begin();
  this->Ethernet.begin();
  this->NTP.begin();
  this->MQTT.begin();
  this->print();
  return true;
}

bool ConfigSettings::load() {
  this->fwVersion.parse(FW_VERSION);
  this->getAppVersion();
  pref.begin("CFG");
  pref.getString("hostname", this->hostname, sizeof(this->hostname));
  this->ssdpBroadcast = pref.getBool("ssdpBroadcast", true);
  this->checkForUpdate = pref.getBool("checkForUpdate", true);
  pref.getString("accentColor", this->accentColor, sizeof(this->accentColor));
  // Migration transparente : les versions antérieures stockaient un enum uint8_t sous la clé
  // "language" (0=en,1=fr,2=de,3=es). La nouvelle clé "langCode" (string) est prioritaire dès
  // qu'elle existe ; sinon on relit l'ancienne valeur et on la convertit. Si aucune des deux
  // clé n'existe (premier boot), this->language garde son défaut de déclaration (dépendant du
  // profil matériel, cf ConfigSettings.h).
  if(pref.isKey("langCode")) {
    pref.getString("langCode", this->language, sizeof(this->language));
  }
  else if(pref.isKey("language")) {
    uint8_t oldIdx = pref.getUChar("language", 0);
    langIndexToCode(oldIdx, this->language, sizeof(this->language));
  }
  this->swShowGpio = pref.getBool("swShowGpio", false);
  this->enableDebugLogs = pref.getBool("enableDebugLogs", false);
  // Recovery lit ces mêmes clés directement via Preferences, bien avant ce point : sa fenêtre de
  // détection s'ouvre avant settings.begin() (cf. SomfyController.ino). Les deux lectures doivent
  // donc rester d'accord sur les noms de clés et les défauts.
  this->ledPin = pref.getChar("ledPin", -1);
  this->ledActiveLow = pref.getBool("ledActiveLow", false);
  this->ledRfBlink = pref.getBool("ledRfBlink", false);
  this->connType = static_cast<conn_types_t>(pref.getChar("connType", 0x00));
  pref.getString("pendingLang", this->pendingLang, sizeof(this->pendingLang));
  this->onboardingDone = pref.getBool("onboardingDone", false);
  pref.end();

  if(this->connType == conn_types_t::unset) {
    // We are doing this to convert the data from previous versions.
    this->connType = conn_types_t::wifi;
    pref.begin("WIFI");
    pref.getString("hostname", this->hostname, sizeof(this->hostname));
    this->ssdpBroadcast = pref.getBool("ssdpBroadcast", true);
    pref.remove("hostname");
    pref.remove("ssdpBroadcast");
    pref.end();
    this->save();
  }
  return true;
}

bool ConfigSettings::getAppVersion() {
  char app[15];
  if(!LittleFS.exists("/appversion")) return false;
  File f = LittleFS.open("/appversion", "r");
  memset(app, 0x00, sizeof(app));
  f.read((uint8_t *)app, sizeof(app) - 1);
  f.close();
  _trim(app);
  this->appVersion.parse(app);
  return true;
}
bool ConfigSettings::save() {
  pref.begin("CFG");
  pref.putString("hostname", this->hostname);
  pref.putBool("ssdpBroadcast", this->ssdpBroadcast);
  pref.putChar("connType", static_cast<uint8_t>(this->connType));
  pref.putBool("checkForUpdate", this->checkForUpdate);
  pref.putString("accentColor", this->accentColor);
  pref.putString("langCode", this->language);
  pref.putBool("swShowGpio", this->swShowGpio);
  pref.putBool("enableDebugLogs", this->enableDebugLogs);
  pref.putChar("ledPin", this->ledPin);
  pref.putBool("ledActiveLow", this->ledActiveLow);
  pref.putBool("ledRfBlink", this->ledRfBlink);
  pref.putString("pendingLang", this->pendingLang);
  pref.putBool("onboardingDone", this->onboardingDone);
  pref.end();
  return true;
}
bool ConfigSettings::toJSON(JsonObject &obj) {
  obj["ssdpBroadcast"] = this->ssdpBroadcast;
  obj["hostname"] = this->hostname;
  obj["connType"] = static_cast<uint8_t>(this->connType);
  obj["language"] = this->language;
  obj["chipModel"] = this->chipModel;
  obj["hardwareProfile"] = this->hardwareProfile;
  obj["checkForUpdate"] = this->checkForUpdate;
  obj["accentColor"] = this->accentColor;
  obj["swShowGpio"] = this->swShowGpio;
  obj["enableDebugLogs"] = this->enableDebugLogs;
  obj["ledPin"] = this->ledPin;
  obj["ledActiveLow"] = this->ledActiveLow;
  obj["ledRfBlink"] = this->ledRfBlink;
  return true;
}
void ConfigSettings::toJSON(JsonResponse &json) {
  json.addElem("ssdpBroadcast", this->ssdpBroadcast);
  json.addElem("hostname", this->hostname);
  json.addElem("connType", static_cast<uint8_t>(this->connType));
  json.addElem("language", this->language);
  json.addElem("chipModel", this->chipModel);
  json.addElem("hardwareProfile", this->hardwareProfile); // Parenthèse de fermeture corrigée ici
  json.addElem("checkForUpdate", this->checkForUpdate);
  json.addElem("accentColor", this->accentColor);
  json.addElem("swShowGpio", this->swShowGpio);
  json.addElem("enableDebugLogs", this->enableDebugLogs);
  json.addElem("ledPin", this->ledPin);
  json.addElem("ledActiveLow", this->ledActiveLow);
  json.addElem("ledRfBlink", this->ledRfBlink);
}

bool ConfigSettings::requiresAuth() { return this->Security.type != security_types::None; }
bool ConfigSettings::fromJSON(JsonObject &obj) {
    if(obj.containsKey("ssdpBroadcast")) this->ssdpBroadcast = obj["ssdpBroadcast"];
    if(obj.containsKey("hostname")) this->parseValueString(obj, "hostname", this->hostname, sizeof(this->hostname));
    if(obj.containsKey("connType")) this->connType = static_cast<conn_types_t>(obj["connType"].as<uint8_t>());
    if(obj.containsKey("language")) this->parseValueString(obj, "language", this->language, sizeof(this->language));
    if(obj.containsKey("checkForUpdate")) this->checkForUpdate = obj["checkForUpdate"];
    if(obj.containsKey("accentColor")) this->parseValueString(obj, "accentColor",this->accentColor, sizeof(this->accentColor));
    if(obj.containsKey("swShowGpio")) this->swShowGpio = obj["swShowGpio"];
    if(obj.containsKey("enableDebugLogs")) this->enableDebugLogs = obj["enableDebugLogs"];
    // La validation de la broche (existence, capacité de sortie, collision avec la radio ou les
    // relais) est faite en amont par Web::validateLedPin() : elle doit pouvoir REFUSER la requête,
    // ce que la signature de fromJSON ne permet pas d'exprimer utilement.
    if(obj.containsKey("ledPin")) this->ledPin = obj["ledPin"].as<int8_t>();
    if(obj.containsKey("ledActiveLow")) this->ledActiveLow = obj["ledActiveLow"];
    if(obj.containsKey("ledRfBlink")) this->ledRfBlink = obj["ledRfBlink"];
    return true;
}
void ConfigSettings::print() {
  this->Security.print();
  Serial.printf("Connection Type: %u\n", (unsigned int) this->connType);
  this->NTP.print();
  if(this->connType == conn_types_t::wifi || this->connType == conn_types_t::unset) this->WIFI.print();
  if(this->connType == conn_types_t::ethernet || this->connType == conn_types_t::ethernetpref) this->Ethernet.print();
}
void ConfigSettings::emitSockets() {}
void ConfigSettings::emitSockets(uint8_t num) {}
uint16_t ConfigSettings::calcSettingsRecSize() {
  return strlen(this->fwVersion.name) + 3
    + strlen(this->hostname) + 3
    + strlen(this->NTP.ntpServer) + 3
    + strlen(this->NTP.posixZone) + 3
    + 6  // ssdpbroadcast
    + 6  // updateCheck
    + 3;  // language
}
uint16_t ConfigSettings::calcNetRecSize() {
  return 4 // connType
    + 6 // dhcp
    + this->IP.ip.toString().length() + 3
    + this->IP.gateway.toString().length() + 3
    + this->IP.subnet.toString().length() + 3
    + this->IP.dns1.toString().length() + 3
    + this->IP.dns2.toString().length() + 3
    + strlen(this->MQTT.protocol) + 3
    + strlen(this->MQTT.hostname) + 3
    + 6 // MQTT Port
    + 6 // PubDisco
    + strlen(this->MQTT.rootTopic) + 3
    + strlen(this->MQTT.discoTopic) + 3
    + 4 // ETH.boardType
    + 4 // ETH.phyType
    + 4 // ETH.clkMode
    + 5 // ETH.phyAddress
    + 5 // ETH.PWRPin
    + 5 // ETH.MDCPin
    + 5; // ETH.MDIOPin
}
bool MQTTSettings::begin() {
  this->load();
  return true;
}
void MQTTSettings::toJSON(JsonResponse &json) {
  json.addElem("enabled", this->enabled);
  json.addElem("pubDisco", this->pubDisco);
  json.addElem("protocol", this->protocol);
  json.addElem("hostname", this->hostname);
  json.addElem("port", (uint32_t)this->port);
  json.addElem("username", this->username);
  json.addElem("hasPassword", strlen(this->password) > 0);
  json.addElem("rootTopic", this->rootTopic);
  json.addElem("discoTopic", this->discoTopic);
}

bool MQTTSettings::toJSON(JsonObject &obj) {
  obj["enabled"] = this->enabled;
  obj["pubDisco"] = this->pubDisco;
  obj["protocol"] = this->protocol;
  obj["hostname"] = this->hostname;
  obj["port"] = this->port;
  obj["username"] = this->username;
  obj["hasPassword"] = strlen(this->password) > 0;
  obj["rootTopic"] = this->rootTopic;
  obj["discoTopic"] = this->discoTopic;
  return true;
}
bool MQTTSettings::fromJSON(JsonObject &obj) {
  if(obj.containsKey("enabled")) this->enabled = obj["enabled"];
  if(obj.containsKey("pubDisco")) this->pubDisco = obj["pubDisco"];
  this->parseValueString(obj, "protocol", this->protocol, sizeof(this->protocol));
  this->parseValueString(obj, "hostname", this->hostname, sizeof(this->hostname));
  this->parseValueString(obj, "username", this->username, sizeof(this->username));
  this->parseSecretString(obj, "password", this->password, sizeof(this->password));
  this->parseValueString(obj, "rootTopic", this->rootTopic, sizeof(this->rootTopic));
  this->parseValueString(obj, "discoTopic", this->discoTopic, sizeof(this->discoTopic));
  if(obj.containsKey("port")) this->port = obj["port"];
  return true;
}
bool MQTTSettings::save() {
  pref.begin("MQTT");
  pref.clear();
  pref.putString("protocol", this->protocol);
  pref.putString("hostname", this->hostname);
  pref.putShort("port", this->port);
  pref.putString("username", this->username);
  pref.putString("password", this->password);
  pref.putString("rootTopic", this->rootTopic);
  pref.putBool("enabled", this->enabled);
  pref.putBool("pubDisco", this->pubDisco);
  pref.putString("discoTopic", this->discoTopic);
  pref.end();
  return true;
}
bool MQTTSettings::load() {
  pref.begin("MQTT");
  pref.getString("protocol", this->protocol, sizeof(this->protocol));
  pref.getString("hostname", this->hostname, sizeof(this->hostname));
  this->port = pref.getShort("port", 1883);
  pref.getString("username", this->username, sizeof(this->username));
  pref.getString("password", this->password, sizeof(this->password));
  pref.getString("rootTopic", this->rootTopic, sizeof(this->rootTopic));
  this->enabled = pref.getBool("enabled", false);
  this->pubDisco = pref.getBool("pubDisco", false);
  pref.getString("discoTopic", this->discoTopic, sizeof(this->discoTopic));
  pref.end();
  return true;
}
bool ConfigSettings::toJSON(DynamicJsonDocument &doc) {
  doc["fwVersion"] = this->fwVersion.name;
  JsonObject objWIFI = doc.createNestedObject("WIFI");
  this->WIFI.toJSON(objWIFI);
  JsonObject objNTP = doc.createNestedObject("NTP");
  this->NTP.toJSON(objNTP);
  JsonObject objMQTT = doc.createNestedObject("MQTT");
  this->MQTT.toJSON(objMQTT);
  return true;
}
bool NTPSettings::begin() {
  this->load();
  this->apply();
  return true;
}
bool NTPSettings::save() {
  pref.begin("NTP");
  pref.clear();
  pref.putString("ntpServer", this->ntpServer);
  pref.putString("posixZone", this->posixZone);
  pref.end();
  return this->apply();
}
bool NTPSettings::load() {
  pref.begin("NTP");
  pref.getString("ntpServer", this->ntpServer, sizeof(this->ntpServer));
  pref.getString("posixZone", this->posixZone, sizeof(this->posixZone));
  pref.end();
  return true;
}
void NTPSettings::print() {
  Serial.println("NTP Settings ");
  Serial.print(this->ntpServer);
  Serial.print(" TZ:");
  Serial.println(this->posixZone);
}
bool NTPSettings::fromJSON(JsonObject &obj) {
  this->parseValueString(obj, "ntpServer", this->ntpServer, sizeof(this->ntpServer));
  this->parseValueString(obj, "posixZone", this->posixZone, sizeof(this->posixZone));
  return true;
}
void NTPSettings::toJSON(JsonResponse &json) {
  json.addElem("ntpServer", this->ntpServer);
  json.addElem("posixZone", this->posixZone);
}

bool NTPSettings::toJSON(JsonObject &obj) {
  obj["ntpServer"] = this->ntpServer;
  obj["posixZone"] = this->posixZone;
  return true;
}
bool NTPSettings::apply() {
  configTime(0, 0, this->ntpServer);
  // BUGFIX : le fuseau horaire doit être appliqué IMMÉDIATEMENT, indépendamment du succès de
  // getLocalTime() ci-dessous. apply() est appelé depuis ConfigSettings::begin(), donc AVANT même
  // que net.setup() ne démarre le WiFi -- la synchronisation NTP (asynchrone) ne peut alors jamais
  // avoir abouti, et l'ancien code faisait un retour anticipé avant setenv("TZ", ...) : le fuseau
  // horaire n'était donc JAMAIS appliqué de toute la durée de vie du firmware (sauf resauvegarde
  // manuelle des réglages réseau une fois le WiFi up, avec la même course contre la sync NTP).
  // Conséquence concrète : getLocalTime() renvoyait l'heure UTC brute, décalant silencieusement le
  // déclenchement de TOUS les plannings de la valeur du fuseau (ex: 2h en France l'été, CEST=UTC+2)
  // -- un planning réglé sur 12:03 heure locale ne correspondait jamais à l'heure UTC du device.
  setenv("TZ", this->posixZone, 1);
  tzset();
  struct tm dt;
  bool synced = getLocalTime(&dt, 100);
  if(settings.enableDebugLogs) {
    char buf[32] = "non disponible";
    if(synced) strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &dt);
    Serial.printf("NTP: fuseau '%s' applique (serveur %s) -- heure locale actuelle : %s%s\n",
      this->posixZone, this->ntpServer, buf,
      synced ? "" : " (NTP pas encore synchronise, se corrigera automatiquement)");
  }
  return synced;
}
IPSettings::IPSettings() {}
bool IPSettings::begin() {
  this->load();
  return true;
}
bool IPSettings::fromJSON(JsonObject &obj) {
  if(obj.containsKey("dhcp")) this->dhcp = obj["dhcp"];
  this->parseIPAddress(obj, "ip", &this->ip);
  this->parseIPAddress(obj, "gateway", &this->gateway);
  this->parseIPAddress(obj, "subnet", &this->subnet);
  this->parseIPAddress(obj, "dns1", &this->dns1);
  this->parseIPAddress(obj, "dns2", &this->dns2);
  return true;
}
bool IPSettings::toJSON(JsonObject &obj) {
  IPAddress ipEmpty(0,0,0,0);
  obj["dhcp"] = this->dhcp;
  obj["ip"] = this->ip == ipEmpty ? "" : this->ip.toString();
  obj["gateway"] = this->gateway == ipEmpty ? "" : this->gateway.toString();
  obj["subnet"] = this->subnet == ipEmpty ? "" : this->subnet.toString();
  obj["dns1"] = this->dns1 == ipEmpty ? "" : this->dns1.toString();
  obj["dns2"] = this->dns2 == ipEmpty ? "" : this->dns2.toString();
  return true;
}
void IPSettings::toJSON(JsonResponse &json) {
  IPAddress ipEmpty(0,0,0,0);
  json.addElem("dhcp", this->dhcp);
  json.addElem("ip", this->ip.toString().c_str());
  json.addElem("gateway", this->gateway.toString().c_str());
  json.addElem("subnet", this->subnet.toString().c_str());
  json.addElem("dns1", this->dns1.toString().c_str());
  json.addElem("dns2", this->dns2.toString().c_str());
}

bool IPSettings::save() {
  pref.begin("IP");
  pref.clear();
  pref.putBool("dhcp", this->dhcp);
  pref.putString("ip", this->ip.toString());
  pref.putString("gateway", this->gateway.toString());
  pref.putString("subnet", this->subnet.toString());
  pref.putString("dns1", this->dns1.toString());
  pref.putString("dns2", this->dns2.toString());
  pref.end();
  return true;
}
bool IPSettings::load() {
  pref.begin("IP");
  this->dhcp = pref.getBool("dhcp", true);
  char buff[16];
  if(pref.isKey("ip")) {
    pref.getString("ip", buff, sizeof(buff));
    this->ip.fromString(buff);
  }
  if(pref.isKey("gateway")) {
    pref.getString("gateway", buff, sizeof(buff));
    this->gateway.fromString(buff);
  }
  if(pref.isKey("subnet")) {
    pref.getString("subnet", buff, sizeof(buff));
    this->subnet.fromString(buff);
  }
  if(pref.isKey("dns1")) {
    pref.getString("dns1", buff, sizeof(buff));
    this->dns1.fromString(buff);
  }
  if(pref.isKey("dns2")) {
    pref.getString("dns2", buff, sizeof(buff));
    this->dns2.fromString(buff);
  }
  Serial.printf("Preference IP Free Entries: %d\n", pref.freeEntries());
  pref.end();
  return true;
}
bool SecuritySettings::begin() {
  this->load();
  return true;
}
bool SecuritySettings::fromJSON(JsonObject &obj) {
  if(obj.containsKey("type")) this->type = static_cast<security_types>(obj["type"].as<uint8_t>());
  this->parseValueString(obj, "username", this->username, sizeof(this->username));
  this->parseSecretString(obj, "password", this->password, sizeof(this->password));
  this->parseSecretString(obj, "pin", this->pin, sizeof(this->pin));
  if(obj.containsKey("permissions")) this->permissions = obj["permissions"];
  return true;
}
bool SecuritySettings::toJSON(JsonObject &obj) {
  obj["type"] = static_cast<uint8_t>(this->type);
  obj["username"] = this->username;
  obj["hasPassword"] = strlen(this->password) > 0;
  obj["hasPin"] = strlen(this->pin) > 0;
  obj["permissions"] = this->permissions;
  return true;
}
void SecuritySettings::toJSON(JsonResponse &json) {
  json.addElem("type", static_cast<uint8_t>(this->type));
  json.addElem("username", this->username);
  json.addElem("hasPassword", strlen(this->password) > 0);
  json.addElem("hasPin", strlen(this->pin) > 0);
  json.addElem("permissions", this->permissions);
}

bool SecuritySettings::save() {
  pref.begin("SEC");
  pref.clear();
  pref.putChar("type", static_cast<uint8_t>(this->type));
  pref.putString("username", this->username);
  pref.putString("password", this->password);
  pref.putString("pin", this->pin);
  pref.putChar("permissions", this->permissions);
  pref.end();
  return true;
}
bool SecuritySettings::load() {
  pref.begin("SEC");
  this->type = static_cast<security_types>(pref.getChar("type", 0));
  if(pref.isKey("username")) pref.getString("username", this->username, sizeof(this->username));
  if(pref.isKey("password")) pref.getString("password", this->password, sizeof(this->password));
  if(pref.isKey("pin")) pref.getString("pin", this->pin, sizeof(this->pin));
  if(pref.isKey("permissions")) this->permissions = pref.getChar("permissions", this->permissions);
  pref.end();
  return true;
}
void SecuritySettings::print() {
  Serial.print("SECURITY   Type:");
  Serial.print(static_cast<uint8_t>(this->type));
  Serial.print(" Username:[");
  Serial.print(this->username);
  Serial.print("] Password:[");
  size_t passLen = strlen(this->password);
  for (size_t i = 0; i < passLen; i++) {
    Serial.print('*');
  }
  Serial.print("] Pin:[");
  if (strlen(this->pin) > 0) {
    Serial.print("****");
  }
  Serial.print("] Permissions:");
  Serial.println(this->permissions);
}
WifiSettings::WifiSettings() {}
bool WifiSettings::begin() {
  this->load();
  return true;
}
bool WifiSettings::fromJSON(JsonObject &obj) {
  this->parseValueString(obj, "ssid", this->ssid, sizeof(this->ssid));
  this->parseSecretString(obj, "passphrase", this->passphrase, sizeof(this->passphrase));
  if(obj.containsKey("apPassword")) {
    const char *val = obj["apPassword"] | "";
    size_t len = strlen(val);
    // Vide => champ non modifié (le client ne reçoit jamais le mot de passe existant).
    // Sinon, doit respecter la contrainte WPA2 (8-63 caractères) : on ignore silencieusement
    // toute valeur invalide plutôt que de risquer un point d'accès de secours mal configuré.
    if(len >= 8 && len < sizeof(this->apPassword)) strlcpy(this->apPassword, val, sizeof(this->apPassword));
  }
  if(obj.containsKey("roaming")) this->roaming = obj["roaming"];
  if(obj.containsKey("hidden")) this->hidden = obj["hidden"];
  return true;
}
bool WifiSettings::toJSON(JsonObject &obj) {
  obj["ssid"] = this->ssid;
  obj["hasPassphrase"] = strlen(this->passphrase) > 0;
  obj["hasApPassword"] = strlen(this->apPassword) > 0;
  obj["roaming"] = this->roaming;
  obj["hidden"] = this->hidden;
  return true;
}
void WifiSettings::toJSON(JsonResponse &json) {
  json.addElem("ssid", this->ssid);
  json.addElem("hasPassphrase", strlen(this->passphrase) > 0);
  json.addElem("hasApPassword", strlen(this->apPassword) > 0);
  json.addElem("roaming", this->roaming);
  json.addElem("hidden", this->hidden);
}

bool WifiSettings::save() {
  pref.begin("WIFI");
  pref.clear();
  pref.putString("ssid", this->ssid);
  pref.putString("passphrase", this->passphrase);
  pref.putString("apPassword", this->apPassword);
  pref.putBool("roaming", this->roaming);
  pref.putBool("hidden", this->hidden);
  pref.end();
  return true;
}
bool WifiSettings::load() {
  pref.begin("WIFI");
  pref.getString("ssid", this->ssid, sizeof(this->ssid));
  pref.getString("passphrase", this->passphrase, sizeof(this->passphrase));
  // Pas de clé "apPassword" en NVS -> on garde la valeur par défaut du membre ("espsomfyrts"),
  // getString() laisse le buffer inchangé si la clé est absente.
  pref.getString("apPassword", this->apPassword, sizeof(this->apPassword));
  this->ssid[sizeof(this->ssid) - 1] = '\0';
  this->passphrase[sizeof(this->passphrase) - 1] = '\0';
  this->apPassword[sizeof(this->apPassword) - 1] = '\0';
  this->roaming = pref.getBool("roaming", false);
  this->hidden = pref.getBool("hidden", false);
  pref.end();
  return true;
}
String WifiSettings::mapEncryptionType(int type) {
  switch(type) {
    case WIFI_AUTH_OPEN:
      return "Open";
    case WIFI_AUTH_WEP:
      return "WEP";
    case WIFI_AUTH_WPA_PSK:
      return "WPA/PSK";
    case WIFI_AUTH_WPA2_PSK:
      return "WPA2/PSK";
    case WIFI_AUTH_WPA_WPA2_PSK:
      return "WPA/WPA2/PSK";
    case WIFI_AUTH_WPA2_ENTERPRISE:
      return "WPA/Enterprise";
  }
  return "Unknown";
}
void WifiSettings::print() {
  if(!settings.enableDebugLogs) return;
  Serial.println("WIFI Settings");
  Serial.print(" SSID: [");
  Serial.print(this->ssid);
  Serial.print("] PassPhrase: [");
  size_t passLen = strlen(this->passphrase);
  for (size_t i = 0; i < passLen; i++) {
    Serial.print('*');
  }
  Serial.println("]");
}
void WifiSettings::printNetworks() {
  if(!settings.enableDebugLogs) return;
  int n = WiFi.scanNetworks(false, false);
  Serial.print("Scanned ");
  Serial.print(n);
  Serial.println(" Networks...");
  for(int i = 0; i < n; i++) {
    if(WiFi.SSID(i).compareTo(this->ssid) == 0) Serial.print("*");
    else Serial.print(" ");
    Serial.print(i);
    Serial.print(": ");
    Serial.print(WiFi.SSID(i));
    Serial.print(" (");
    Serial.print(WiFi.RSSI(i));
    Serial.print("dBm) CH:");
    Serial.print(WiFi.channel(i));
    Serial.print(" MAC:");
    Serial.print(WiFi.BSSIDstr(i));
    Serial.println();
  }
}
bool WifiSettings::ssidExists(const char *ssid) {
  int n = WiFi.scanNetworks(false, true);
  for(int i = 0; i < n; i++) {
    if(WiFi.SSID(i).compareTo(ssid) == 0) return true;
  }
  return false;
}
EthernetSettings::EthernetSettings() {}
bool EthernetSettings::begin() {
  this->load();
  return true;
}
bool EthernetSettings::fromJSON(JsonObject &obj) {
  if(obj.containsKey("boardType")) this->boardType = obj["boardType"];
  if(obj.containsKey("phyAddress")) this->phyAddress = obj["phyAddress"];
  if(obj.containsKey("CLKMode")) this->CLKMode = static_cast<eth_clock_mode_t>(obj["CLKMode"]);
  if(obj.containsKey("phyType")) this->phyType = static_cast<eth_phy_type_t>(obj["phyType"]);
  if(obj.containsKey("PWRPin")) this->PWRPin = obj["PWRPin"];
  if(obj.containsKey("MDCPin")) this->MDCPin = obj["MDCPin"];
  if(obj.containsKey("MDIOPin")) this->MDIOPin = obj["MDIOPin"];
  return true;
}
bool EthernetSettings::toJSON(JsonObject &obj) {
  obj["boardType"] = this->boardType;
  obj["phyAddress"] = this->phyAddress;
  obj["CLKMode"] = static_cast<uint8_t>(this->CLKMode);
  obj["phyType"] = static_cast<uint8_t>(this->phyType);
  obj["PWRPin"] = this->PWRPin;
  obj["MDCPin"] = this->MDCPin;
  obj["MDIOPin"] = this->MDIOPin;
  return true;
}
void EthernetSettings::toJSON(JsonResponse &json) {
  json.addElem("boardType", this->boardType);
  json.addElem("phyAddress", this->phyAddress);
  json.addElem("CLKMode", static_cast<uint8_t>(this->CLKMode));
  json.addElem("phyType", static_cast<uint8_t>(this->phyType));
  json.addElem("PWRPin", this->PWRPin);
  json.addElem("MDCPin", this->MDCPin);
  json.addElem("MDIOPin", this->MDIOPin);
}

bool EthernetSettings::usesPin(uint8_t pin) {
  if((this->CLKMode == 0 || this->CLKMode == 1) && pin == 0) return true;
  else if(this->CLKMode == 2 && pin == 16) return true;
  else if(this->CLKMode == 3 && pin == 17) return true;
  else if(this->PWRPin == pin) return true;
  else if(this->MDCPin == pin) return true;
  else if(this->MDIOPin == pin) return true;
  return false;
}
bool EthernetSettings::save() {
  pref.begin("ETH");
  pref.clear();
  pref.putChar("boardType", this->boardType);
  pref.putChar("phyAddress", this->phyAddress);
  pref.putChar("phyType", static_cast<uint8_t>(this->phyType));
  pref.putChar("CLKMode", static_cast<uint8_t>(this->CLKMode));
  pref.putChar("PWRPin", this->PWRPin);
  pref.putChar("MDCPin", this->MDCPin);
  pref.putChar("MDIOPin", this->MDIOPin);
  pref.end();
  return true;
}
bool EthernetSettings::load() {
  pref.begin("ETH");
  this->boardType = pref.getChar("boardType", this->boardType);
  this->phyType = static_cast<eth_phy_type_t>(pref.getChar("phyType", ETH_PHY_LAN8720));
  this->CLKMode = static_cast<eth_clock_mode_t>(pref.getChar("CLKMode", ETH_CLOCK_GPIO0_IN));
  this->phyAddress = pref.getChar("phyAddress", this->phyAddress);
  this->PWRPin = pref.getChar("PWRPin", this->PWRPin);
  this->MDCPin = pref.getChar("MDCPin", this->MDCPin);
  this->MDIOPin = pref.getChar("MDIOPin", this->MDIOPin);
  pref.end();
  return true;
}
void EthernetSettings::print() {
  Serial.println("Ethernet Settings");
  Serial.printf("Board:%d PHYType:%d CLK:%d ADDR:%d PWR:%d MDC:%d MDIO:%d\n", this->boardType, this->phyType, this->CLKMode, this->phyAddress, this->PWRPin, this->MDCPin, this->MDIOPin);
}
void ConfigSettings::printAvailHeap() {
  if(!settings.enableDebugLogs) return;
  Serial.print("Max Heap: ");
  Serial.println(ESP.getMaxAllocHeap());
  Serial.print("Free Heap: ");
  Serial.println(ESP.getFreeHeap());
  Serial.print("Min Heap: ");
  Serial.println(ESP.getMinFreeHeap());
}
