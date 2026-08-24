#include <Arduino.h>
#include <LittleFS.h>        // https://github.com/espressif/arduino-esp32/tree/master/libraries/LittleFS
#include <time.h>
#include <math.h>
#include <WiFi.h>
#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <esp_heap_caps.h>   // heap_caps_get_info()/print_heap_info()/dump() -- cf. dumpHeapBlocks()
#include "ConfigSettings.h"
#include "Utils.h"
#include "Network.h"   // net.lockScan()/unlockScan() -- verrou partagé du scan Wi-Fi, cf. ssidExists()
#include "esp_chip_info.h"

extern ConfigSettings settings;
extern Network net;
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
  // M-15 : `num[3]` ne retenait que DEUX chiffres par composant (la borne des boucles est
  // `j < sizeof(num) - 1`). "v3.0.100" était donc lu comme build 10 -- et ce n'est pas cosmétique,
  // c'est `compare()` qui décide s'il existe une mise à jour : passer de 3.0.99 à 3.0.100
  // apparaissait comme un RETOUR EN ARRIÈRE (10 < 99), donc aucune mise à jour proposée. 4 octets
  // couvrent les trois chiffres d'un uint8_t (255) plus le terminateur.
  char num[4];
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
  // M-15 : la condition était `strlen(ver) < i`, jamais vraie. Les trois boucles ci-dessus
  // n'incrémentent `i` que sous `i < strlen(ver)`, donc `i` ne peut au mieux qu'ATTEINDRE la
  // longueur, jamais la dépasser. `suffix` restait vide en permanence -- pour settings.fwVersion,
  // settings.appVersion et chaque GitRelease::version -- alors qu'il est sérialisé en JSON par les
  // trois toJSON() de cette structure, donc exposé à l'interface et aux clients REST.
  if(i < strlen(ver)) {
    // La boucle du build sort de deux façons : sur un caractère non numérique, qu'elle a DÉJÀ
    // consommé (le '-' de "3.0.1-beta"), ou sur le remplissage de `num`, qui laisse ce même
    // caractère à lire ("3.0.100-rc1"). Sans cette normalisation le suffixe vaudrait "beta" dans
    // un cas et "-rc1" dans l'autre. On saute donc un éventuel séparateur de tête, pour que la
    // valeur publiée ne dépende pas du nombre de chiffres du build.
    const char *sfx = &ver[i];
    if(*sfx == '-' || *sfx == '.' || *sfx == '+') sfx++;
    strlcpy(this->suffix, sfx, sizeof(this->suffix));
  }
}
void appver_t::toJSON(JsonFormatter &json) {
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
bool BaseSettings::parseValueString(JsonObject &obj, const char *prop, char *pdest, size_t size) {
  // strlcpyUtf8 et non strlcpy (constat T-1, cf. Utils.h) : cette fonction recopie des chaînes
  // saisies par l'utilisateur (hostname, topics MQTT, identifiants, couleur d'accent...) dans des
  // champs de taille fixe qui sont ensuite sérialisés. Une troncature au milieu d'un caractère
  // UTF-8 y laisserait un octet orphelin, rendant la réponse indécodable pour tout consommateur
  // strict.
  if(obj.containsKey(prop)) strlcpyUtf8(pdest, obj[prop], size);
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
  // Clés NVS raccourcies (≤ 15 caractères, limite dure de l'API Preferences/NVS ESP32 --
  // ESP_ERR_NVS_KEY_TOO_LONG sinon) : les noms complets ("headerMobileDisplay",
  // "reverseDashboardColumns", "defaultMobileTab", "showRadioActivity") dépassaient tous cette
  // limite, faisant échouer silencieusement CHAQUE écriture depuis leur introduction -- ces 4
  // réglages n'ont donc jamais été réellement persistés. Pas de migration nécessaire : l'ancienne
  // clé n'a jamais contenu de valeur valide (cf. commit fix associé).
  this->headerMobileDisplay = pref.getUChar("hdrMobileDisp", 0);
  this->reverseDashboardColumns = pref.getBool("revDashCols", false);
  // Comme hostname/accentColor ci-dessus : si la clé est absente (première exécution), le buffer
  // garde son initialiseur de champ ("groups", cf. ConfigSettings.h) au lieu d'être vidé.
  pref.getString("defMobileTab", this->defaultMobileTab, sizeof(this->defaultMobileTab));
  this->showRadioActivity = pref.getBool("showRadioAct", false);
  this->geoLat = pref.getFloat("geoLat", 99.0f);
  this->geoLon = pref.getFloat("geoLon", 0.0f);
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
  // Mêmes clés raccourcies qu'en lecture ci-dessus (load()) -- cf. commentaire détaillé là-bas.
  pref.putUChar("hdrMobileDisp", this->headerMobileDisplay);
  pref.putBool("revDashCols", this->reverseDashboardColumns);
  pref.putString("defMobileTab", this->defaultMobileTab);
  pref.putBool("showRadioAct", this->showRadioActivity);
  pref.putFloat("geoLat", this->geoLat);
  pref.putFloat("geoLon", this->geoLon);
  pref.putString("pendingLang", this->pendingLang);
  pref.putBool("onboardingDone", this->onboardingDone);
  pref.end();
  return true;
}
void ConfigSettings::toJSON(JsonFormatter &json) {
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
  json.addElem("headerMobileDisplay", this->headerMobileDisplay);
  json.addElem("reverseDashboardColumns", this->reverseDashboardColumns);
  json.addElem("defaultMobileTab", this->defaultMobileTab);
  json.addElem("showRadioActivity", this->showRadioActivity);
  json.addElem("geoLat", this->geoLat);
  json.addElem("geoLon", this->geoLon);
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
    // La validation de plage (0..3) et de la valeur ("groups"/"devices") est faite en amont par
    // Web::/setgeneral, pour les mêmes raisons que ledPin ci-dessus.
    if(obj.containsKey("headerMobileDisplay")) this->headerMobileDisplay = obj["headerMobileDisplay"].as<uint8_t>();
    if(obj.containsKey("reverseDashboardColumns")) this->reverseDashboardColumns = obj["reverseDashboardColumns"];
    if(obj.containsKey("defaultMobileTab")) this->parseValueString(obj, "defaultMobileTab", this->defaultMobileTab, sizeof(this->defaultMobileTab));
    if(obj.containsKey("showRadioActivity")) this->showRadioActivity = obj["showRadioActivity"];
    // La validation de plage (-90..90 / -180..180) est faite en amont par Web::/setgeneral, pour
    // les mêmes raisons que ledPin ci-dessus. Arrondi à 2 décimales ici quelle que soit la
    // précision envoyée par le client : c'est la seule précision jamais persistée.
    if(obj.containsKey("geoLat")) this->geoLat = roundf(obj["geoLat"].as<float>() * 100.0f) / 100.0f;
    if(obj.containsKey("geoLon")) this->geoLon = roundf(obj["geoLon"].as<float>() * 100.0f) / 100.0f;
    return true;
}
void ConfigSettings::print() {
  this->Security.print();
  Serial.printf("Connection Type: %u\n", (unsigned int) this->connType);
  this->NTP.print();
  if(this->connType == conn_types_t::wifi || this->connType == conn_types_t::unset) this->WIFI.print();
  if(this->connType == conn_types_t::ethernet || this->connType == conn_types_t::ethernetpref) this->Ethernet.print();
}
void ConfigSettings::emitSockets(uint8_t num) {}
uint16_t ConfigSettings::calcSettingsRecSize() {
  return strlen(this->fwVersion.name) + 3
    + strlen(this->hostname) + 3
    + strlen(this->NTP.ntpServer) + 3
    + strlen(this->NTP.posixZone) + 3
    + 6  // ssdpbroadcast
    + 6  // updateCheck
    + 3   // language
    + 4   // headerMobileDisplay
    + 6   // reverseDashboardColumns
    + strlen(this->defaultMobileTab) + 3
    + 6;  // showRadioActivity
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
bool MQTTSettings::isValidRootTopic(const char *topic) {
  if(!topic) return false;
  size_t len = strlen(topic);
  if(len == 0 || len >= sizeof(MQTTSettings::rootTopic)) return false;
  // Un '/' en tête crée un premier niveau vide ; '$' est l'espace réservé aux topics système du
  // courtier ($SYS/...), qu'un client n'a pas à s'approprier.
  if(topic[0] == '/' || topic[0] == '$') return false;
  bool hasContent = false;
  for(size_t i = 0; i < len; i++) {
    unsigned char c = (unsigned char)topic[i];
    // Les jokers ne veulent rien dire dans un préfixe de PUBLICATION, et à l'abonnement ils
    // feraient exactement l'inverse de ce que ce champ est censé faire : élargir la portée.
    if(c == '+' || c == '#') return false;
    if(c < 0x20 || c == 0x7F) return false;
    if(c != ' ') hasContent = true;
  }
  // Une suite d'espaces est un topic valide au sens du protocole, mais illisible et
  // indistinguable d'un champ vide pour qui le relit : même traitement que vide.
  return hasContent;
}
bool MQTTSettings::ensureRootTopic() {
  if(this->rootTopic[0] != '\0') return false;
  // serverId est dérivé du MAC de l'eFuse (ConfigSettings::begin(), appelé AVANT MQTT.begin()) :
  // stable d'un démarrage à l'autre et distinct d'un boîtier à l'autre, donc deux modules sur le
  // même courtier ne se marchent jamais dessus. C'est aussi ce qui identifie déjà l'appareil dans
  // les fiches de découverte Home Assistant (mqtt_espsomfyrts_<serverId>).
  snprintf(this->rootTopic, sizeof(this->rootTopic), "espsomfy-%s", settings.serverId);
  Serial.printf("MQTT: topic racine vide, defaut applique : %s\n", this->rootTopic);
  return true;
}
bool MQTTSettings::begin() {
  this->load();
  return true;
}
void MQTTSettings::toJSON(JsonFormatter &json) {
  json.addElem("enabled", this->enabled);
  json.addElem("pubDisco", this->pubDisco);
  json.addElem("protocol", this->protocol);
  json.addElem("hostname", this->hostname);
  json.addElem("port", (uint32_t)this->port);
  json.addElem("username", this->username);
  json.addElem("hasPassword", strlen(this->password) > 0);
  json.addElem("rootTopic", this->rootTopic);
  json.addElem("discoTopic", this->discoTopic);
  json.addElem("clientId", this->clientId);
}

bool MQTTSettings::fromJSON(JsonObject &obj) {
  // Contrôlé AVANT la moindre affectation : un topic racine inexploitable doit faire échouer la
  // charge utile entière plutôt que d'en appliquer la moitié. L'appelant (route /connectmqtt,
  // restauration de configuration) sait alors qu'il n'a rien à enregistrer.
  if(obj.containsKey("rootTopic") && !MQTTSettings::isValidRootTopic(obj["rootTopic"] | "")) return false;
  if(obj.containsKey("enabled")) this->enabled = obj["enabled"];
  if(obj.containsKey("pubDisco")) this->pubDisco = obj["pubDisco"];
  this->parseValueString(obj, "protocol", this->protocol, sizeof(this->protocol));
  this->parseValueString(obj, "hostname", this->hostname, sizeof(this->hostname));
  this->parseValueString(obj, "username", this->username, sizeof(this->username));
  this->parseSecretString(obj, "password", this->password, sizeof(this->password));
  this->parseValueString(obj, "rootTopic", this->rootTopic, sizeof(this->rootTopic));
  this->parseValueString(obj, "discoTopic", this->discoTopic, sizeof(this->discoTopic));
  this->parseValueString(obj, "clientId", this->clientId, sizeof(this->clientId));
  if(obj.containsKey("port")) this->port = obj["port"];
  return true;
}
bool MQTTSettings::save() {
  // Jamais d'enregistrement vide, quel que soit le chemin d'écriture (page de réglages,
  // restauration d'un fichier de configuration...) : c'est le dernier point de passage commun.
  this->ensureRootTopic();
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
  pref.putString("clientId", this->clientId);
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
  pref.getString("clientId", this->clientId, sizeof(this->clientId));
  // Un topic racine vide déjà gravé en NVS (appareil configuré avant ce garde-fou) est réécrit
  // sur place, sinon makeTopic() retomberait à la racine du courtier à chaque démarrage sans que
  // rien ne le signale. La session Preferences est encore ouverte en écriture ici.
  if(this->ensureRootTopic()) pref.putString("rootTopic", this->rootTopic);
  pref.end();
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
void NTPSettings::toJSON(JsonFormatter &json) {
  json.addElem("ntpServer", this->ntpServer);
  json.addElem("posixZone", this->posixZone);
}

// P-2 (24/08/2026) : les surcharges toJSON(JsonObject&) de ConfigSettings, MQTTSettings,
// NTPSettings, WifiSettings et appver_t sont retirées, ainsi que
// ConfigSettings::toJSON(DynamicJsonDocument&) -- leur unique consommateur, lui-même sans
// appelant. Trois représentations JSON coexistaient pour chaque entité (ArduinoJson,
// JsonFormatter maison, JsonSockEvent) ; seules les deux dernières sont réellement
// utilisées ici. SecuritySettings::toJSON(JsonObject&), IPSettings et EthernetSettings sont
// CONSERVÉES : contrairement à ce qu'annonçait le rapport, elles ont des appelants vivants.
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
    char buf[32] = "not available";
    if(synced) strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &dt);
    Serial.printf("NTP: timezone '%s' applied (server %s) -- current local time: %s%s\n",
      this->posixZone, this->ntpServer, buf,
      synced ? "" : " (NTP not synced yet, will self-correct automatically)");
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
void IPSettings::toJSON(JsonFormatter &json) {
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
void SecuritySettings::toJSON(JsonFormatter &json) {
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
    // 63 et non sizeof-1 (64) : la contrainte est celle de WPA2, pas celle du tampon. Les deux
    // divergeaient d'un caractère -- /setNetwork refuse 64, ici il était accepté.
    if(len >= 8 && len <= 63) strlcpy(this->apPassword, val, sizeof(this->apPassword));
  }
  if(obj.containsKey("roaming")) this->roaming = obj["roaming"];
  if(obj.containsKey("hidden")) this->hidden = obj["hidden"];
  return true;
}
void WifiSettings::toJSON(JsonFormatter &json) {
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
// P-7, corrigé le 24/08/2026. Ce scan est BLOQUANT (2 à 6 s) et cette fonction est appelée depuis
// handleConnectWifi(), donc depuis async_tcp -- même motif que /scanaps, mais sans aucune
// sérialisation : deux /connectwifi concurrents, ou un /connectwifi pendant un /scanaps, se
// marchaient sur l'unique état de scan du pilote Wi-Fi. Le verrou de Network est désormais partagé
// par tous les utilisateurs du scan (cf. Network::lockScan).
//
// Deuxième défaut, non relevé par l'audit : les résultats n'étaient JAMAIS libérés. Le `return
// true` sortait au milieu de la boucle sans scanDelete(), et même le chemin `false` n'en faisait
// pas -- la liste restait en mémoire jusqu'au scan suivant, qui l'écrasait.
bool WifiSettings::ssidExists(const char *ssid) {
  net.lockScan();
  int n = WiFi.scanNetworks(false, true);
  bool found = false;
  for(int i = 0; i < n; i++) {
    if(WiFi.SSID(i).compareTo(ssid) == 0) { found = true; break; }
  }
  WiFi.scanDelete();
  net.unlockScan();
  return found;
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
void EthernetSettings::toJSON(JsonFormatter &json) {
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
  // Instrumentation temporaire (audit mémoire OTA, cf. GitOTA.cpp/GIT_TLS_MIN_HEAP_BYTES) : mesure
  // la marge RÉELLE jamais utilisée sur le stack de la tâche "async_tcp" (AsyncTCP.cpp,
  // CONFIG_ASYNC_TCP_STACK_SIZE = 16 Ko alloués une fois pour toute la durée de vie de l'appareil
  // dès le premier AsyncWebServer::begin()) -- avant de risquer de réduire cette taille (un stack
  // overflow serait bien pire qu'un refus propre de connexion TLS), on veut d'abord un chiffre réel
  // de high-water-mark sur du matériel en usage normal. xTaskGetHandle() retrouve la tâche par son
  // nom sans avoir à patcher AsyncTCP (qui ne l'expose pas lui-même) ; StackType_t = uint8_t sur ce
  // port Xtensa (cf. portmacro.h), donc uxTaskGetStackHighWaterMark() renvoie déjà des OCTETS, pas
  // des mots. Valeur nulle/absente = tâche pas encore démarrée (aucun AsyncWebServer::begin() n'a
  // encore eu lieu à cet instant).
  TaskHandle_t asyncTcpTask = xTaskGetHandle("async_tcp");
  if(asyncTcpTask) {
    Serial.print("AsyncTCP Stack HWM (free, bytes): ");
    Serial.println(uxTaskGetStackHighWaterMark(asyncTcpTask));
  }
}
void ConfigSettings::reportAsyncTcpStackLow(const char *label) {
  TaskHandle_t asyncTcpTask = xTaskGetHandle("async_tcp");
  if(!asyncTcpTask) return;   // aucun AsyncWebServer::begin() encore effectué
  // StackType_t = uint8_t sur ce port Xtensa (cf. portmacro.h) : la valeur est déjà en OCTETS.
  UBaseType_t hwm = uxTaskGetStackHighWaterMark(asyncTcpTask);
  static UBaseType_t lowest = (UBaseType_t)-1;
  if(hwm >= lowest) return;
  lowest = hwm;
  Serial.printf("[ASYNC-STACK] nouveau minimum apres %s : %u octets libres sur %u -- pic d'utilisation %u\n",
    label, (unsigned)hwm, (unsigned)CONFIG_ASYNC_TCP_STACK_SIZE,
    (unsigned)(CONFIG_ASYNC_TCP_STACK_SIZE - hwm));
}
void ConfigSettings::dumpHeapBlocks(const char *label) {
  if(!settings.enableDebugLogs) return;
  multi_heap_info_t info;
  heap_caps_get_info(&info, MALLOC_CAP_8BIT);
  // En-tête sur une seule ligne, avec le libellé : c'est elle qui permet de retrouver et d'apparier
  // les deux dumps dans un long journal série avant de les comparer.
  Serial.printf("[HEAP-DUMP] ==== DEBUT %s ==== largest=%u free_total=%u blocs_libres=%u blocs_alloues=%u min_free=%u\n",
    label, (unsigned)info.largest_free_block, (unsigned)info.total_free_bytes,
    (unsigned)info.free_blocks, (unsigned)info.allocated_blocks, (unsigned)info.minimum_free_bytes);
  // Récapitulatif par région : montre laquelle porte réellement du libre (les autres, buffers
  // WiFi/système, sont saturées en permanence et ne participent jamais à getMaxAllocHeap()).
  // Une vingtaine de lignes, sans rétention de verrou notable -- sûr à appeler en fonctionnement.
  heap_caps_print_heap_info(MALLOC_CAP_8BIT);
  // Second relevé, après l'impression : heap_caps_print_heap_info() relit le tas pour son propre
  // compte et son affichage prend plusieurs millisecondes, pendant lesquelles d'autres tâches
  // allouent et libèrent. Sans cette ligne de clôture, l'en-tête et le corps du dump semblent se
  // contredire alors qu'ils décrivent simplement deux instants (cas réel observé : 42996 en tête,
  // 81908 dans le récapitulatif). Un écart important ici signifie "état instable pendant la
  // mesure" -- à lire comme tel, et non comme une incohérence.
  multi_heap_info_t after;
  heap_caps_get_info(&after, MALLOC_CAP_8BIT);
  if(after.largest_free_block != info.largest_free_block)
    Serial.printf("[HEAP-DUMP] (le tas a bouge pendant le dump : largest %u -> %u)\n",
      (unsigned)info.largest_free_block, (unsigned)after.largest_free_block);
  // PAS de heap_caps_dump() ici. Tenté le 17/08/2026, il a provoqué un TG1WDT_SYS_RESET
  // (redémarrage watchdog) de façon reproductible, sortie série tronquée au même bloc à chaque
  // essai : la fonction parcourt le tas en TENANT SON VERROU pendant toute l'impression -- plusieurs
  // centaines de lignes, soit plusieurs secondes à 115200 bauds -- ce qui bloque simultanément toute
  // allocation des autres tâches (async_tcp à la priorité 10, pile WiFi) sans qu'aucun
  // esp_task_wdt_reset() ne puisse être intercalé, la boucle étant interne à l'ESP-IDF. Inutilisable
  // ici, et de toute façon superflu : le récapitulatif par région ci-dessus fournit déjà
  // alloc_blocks/free_blocks/largest_free_block, ce qui a suffi à identifier le mécanisme (une
  // grosse réservation contiguë transitoire qui échoue en altitude de petites allocations
  // permanentes). Ne pas le réintroduire sans couper le réseau au préalable.
  Serial.printf("[HEAP-DUMP] ==== FIN %s ====\n", label);
}
