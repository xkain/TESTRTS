#include <Preferences.h>
#include <ELECHOUSE_CC1101_SRC_DRV.h>
#include <SPI.h>
#include <esp_task_wdt.h>
#include "Utils.h"
#include "ConfigSettings.h"
#include "Somfy.h"
#include "Sockets.h"
#include "MQTT.h"
#include "ConfigFile.h"
#include "GitOTA.h"
#include "StatusLed.h"

extern Preferences pref;
extern SomfyShadeController somfy;
extern SocketEmitter sockEmit;
extern ConfigSettings settings;
extern MQTTClass mqtt;
extern GitUpdater git;


// SETMY_REPEATS / TILT_REPEATS : voir Somfy.h (partagés avec SomfyPositioning.cpp).
// rxmode/SYMBOL/RECEIVE_ATTR/TX_QUEUE_DELAY/interruptPin : déplacés dans SomfyRadioDriver.cpp,
// seul fichier qui les utilise désormais.

int sort_asc(const void *cmp1, const void *cmp2) {
  int a = *((uint8_t *)cmp1);
  int b = *((uint8_t *)cmp2);
  if(a == b) return 0;
  else if(a < b) return -1;
  return 1;
}

// Longueur de trame par défaut (56/80 bits) utilisée par SomfyRemote::sendCommand() ci-dessous
// quand this->bitLength vaut 0. Pas de static : transceiver_config_t::apply() (SomfyRadioDriver.cpp)
// la met à jour à chaque changement de protocole -- état partagé entre les deux fichiers.
uint8_t bit_length = 56;
somfy_commands translateSomfyCommand(const String& string) {
    if (string.equalsIgnoreCase("My")) return somfy_commands::My;
    else if (string.equalsIgnoreCase("Up")) return somfy_commands::Up;
    else if (string.equalsIgnoreCase("MyUp")) return somfy_commands::MyUp;
    else if (string.equalsIgnoreCase("Down")) return somfy_commands::Down;
    else if (string.equalsIgnoreCase("MyDown")) return somfy_commands::MyDown;
    else if (string.equalsIgnoreCase("UpDown")) return somfy_commands::UpDown;
    else if (string.equalsIgnoreCase("MyUpDown")) return somfy_commands::MyUpDown;
    else if (string.equalsIgnoreCase("Prog")) return somfy_commands::Prog;
    else if (string.equalsIgnoreCase("SunFlag")) return somfy_commands::SunFlag;
    else if (string.equalsIgnoreCase("StepUp")) return somfy_commands::StepUp;
    else if (string.equalsIgnoreCase("StepDown")) return somfy_commands::StepDown;
    else if (string.equalsIgnoreCase("Flag")) return somfy_commands::Flag;
    else if (string.equalsIgnoreCase("Sensor")) return somfy_commands::Sensor;
    else if (string.equalsIgnoreCase("Toggle")) return somfy_commands::Toggle;
    else if (string.equalsIgnoreCase("Favorite")) return somfy_commands::Favorite;
    else if (string.equalsIgnoreCase("Stop")) return somfy_commands::Stop;
    else if (string.startsWith("fav") || string.startsWith("FAV")) return somfy_commands::Favorite;
    else if (string.startsWith("mud") || string.startsWith("MUD")) return somfy_commands::MyUpDown;
    else if (string.startsWith("md") || string.startsWith("MD")) return somfy_commands::MyDown;
    else if (string.startsWith("ud") || string.startsWith("UD")) return somfy_commands::UpDown;
    else if (string.startsWith("mu") || string.startsWith("MU")) return somfy_commands::MyUp;
    else if (string.startsWith("su") || string.startsWith("SU")) return somfy_commands::StepUp;
    else if (string.startsWith("sd") || string.startsWith("SD")) return somfy_commands::StepDown;
    else if (string.startsWith("sen") || string.startsWith("SEN")) return somfy_commands::Sensor;
    else if (string.startsWith("p") || string.startsWith("P")) return somfy_commands::Prog;
    else if (string.startsWith("u") || string.startsWith("U")) return somfy_commands::Up;
    else if (string.startsWith("d") || string.startsWith("D")) return somfy_commands::Down;
    else if (string.startsWith("m") || string.startsWith("M")) return somfy_commands::My;
    else if (string.startsWith("f") || string.startsWith("F")) return somfy_commands::Flag;
    else if (string.startsWith("s") || string.startsWith("S")) return somfy_commands::SunFlag;
    else if (string.startsWith("t") || string.startsWith("T")) return somfy_commands::Toggle;
    else if (string.length() == 1) return static_cast<somfy_commands>(strtol(string.c_str(), nullptr, 16));
    else return somfy_commands::My;
}
String translateSomfyCommand(const somfy_commands cmd) {
    switch (cmd) {
    case somfy_commands::Up:
        return "Up";
    case somfy_commands::Down:
        return "Down";
    case somfy_commands::My:
        return "My";
    case somfy_commands::MyUp:
        return "My+Up";
    case somfy_commands::UpDown:
        return "Up+Down";
    case somfy_commands::MyDown:
        return "My+Down";
    case somfy_commands::MyUpDown:
        return "My+Up+Down";
    case somfy_commands::Prog:
        return "Prog";
    case somfy_commands::SunFlag:
        return "Sun Flag";
    case somfy_commands::Flag:
        return "Flag";
    case somfy_commands::StepUp:
        return "Step Up";
    case somfy_commands::StepDown:
        return "Step Down";
    case somfy_commands::Sensor:
        return "Sensor";
    case somfy_commands::Toggle:
        return "Toggle";
    case somfy_commands::Favorite:
        return "Favorite";
    case somfy_commands::Stop:
        return "Stop";
    default:
        return "Unknown(" + String((uint8_t)cmd) + ")";
    }
}
void SomfyShadeController::end() { this->transceiver.disableReceive(); }
SomfyShadeController::SomfyShadeController() {
  memset(this->m_shadeIds, 255, sizeof(this->m_shadeIds));
  uint64_t mac = ESP.getEfuseMac();
  this->startingAddress = mac & 0x0FFFFF;
}
bool SomfyShadeController::useNVS() { return !(settings.appVersion.major > 1 || settings.appVersion.minor >= 4); };
bool SomfyShadeController::isAnyShadeMoving() {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    if(this->shades[i].getShadeId() != 255 && !this->shades[i].isIdle()) return true;
  }
  return false;
}
SomfyShade *SomfyShadeController::findShadeByRemoteAddress(uint32_t address) {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade &shade = this->shades[i];
    if(shade.getRemoteAddress() == address) return &shade;
    else {
      for(uint8_t j = 0; j < SOMFY_MAX_LINKED_REMOTES; j++) {
        if(shade.linkedRemotes[j].getRemoteAddress() == address) return &shade;
      }
    }
  }
  return nullptr;
}
SomfyGroup *SomfyShadeController::findGroupByRemoteAddress(uint32_t address) {
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup &group = this->groups[i];
    if(group.getRemoteAddress() == address) return &group;
  }
  return nullptr;
}
void SomfyShadeController::updateGroupFlags() {
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup *group = &this->groups[i];
    if(group && group->getGroupId() != 255) {
      uint8_t flags = group->flags;
      group->updateFlags();
      if(flags != group->flags)
        group->emitState();
    }
  }
}
#ifdef USE_NVS
bool SomfyShadeController::loadLegacy() {
  Serial.println("Loading Legacy shades using NVS");
  pref.begin("Shades", true);
  pref.getBytes("shadeIds", this->m_shadeIds, sizeof(this->m_shadeIds));
  pref.end();
  for(uint8_t i = 0; i < sizeof(this->m_shadeIds); i++) {
    if(i != 0) DEBUG_SOMFY.print(",");
    DEBUG_SOMFY.print(this->m_shadeIds[i]);
  }
  DEBUG_SOMFY.println();
  sortArray<uint8_t>(this->m_shadeIds, sizeof(this->m_shadeIds));
  #ifdef DEBUG_SOMFY
  for(uint8_t i = 0; i < sizeof(this->m_shadeIds); i++) {
    if(i != 0) DEBUG_SOMFY.print(",");
    DEBUG_SOMFY.print(this->m_shadeIds[i]);
  }
  DEBUG_SOMFY.println();
  #endif

  uint8_t id = 0;
  for(uint8_t i = 0; i < sizeof(this->m_shadeIds); i++) {
    if(this->m_shadeIds[i] == id) this->m_shadeIds[i] = 255;
    id = this->m_shadeIds[i];
    SomfyShade *shade = &this->shades[i];
    shade->setShadeId(id);
    if(id == 255) {
      continue;
    }
    shade->load();
  }
  #ifdef DEBUG_SOMFY
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    DEBUG_SOMFY.print(this->shades[i].getShadeId());
    DEBUG_SOMFY.print(":");
    DEBUG_SOMFY.print(this->m_shadeIds[i]);
    if(i < SOMFY_MAX_SHADES - 1) DEBUG_SOMFY.print(",");
  }
  Serial.println();
  #endif
  #ifdef USE_NVS
  if(!this->useNVS()) {
    pref.begin("Shades");
    pref.putBytes("shadeIds", this->m_shadeIds, sizeof(this->m_shadeIds));
    pref.end();
  }
  #endif
  this->commit();
  return true;
}
#endif
bool SomfyShadeController::begin() {
  // Load up all the configuration data.
  //ShadeConfigFile::getAppVersion(this->appVersion);
  Serial.printf("App Version:%u.%u.%u\n", settings.appVersion.major, settings.appVersion.minor, settings.appVersion.build);
  #ifdef USE_NVS
  if(!this->useNVS()) {  // At 1.4 we started using the configuration file.  If the file doesn't exist then booh.
    // We need to remove all the extraeneous data from NVS for the shades.  From here on out we
    // will rely on the shade configuration.
    Serial.println("No longer using NVS");
    if(ShadeConfigFile::exists()) {
      ShadeConfigFile::load(this);
    }
    else {
      this->loadLegacy();
    }
    pref.begin("Shades");
    if(pref.isKey("shadeIds")) {
      pref.getBytes("shadeIds", this->m_shadeIds, sizeof(this->m_shadeIds));
      pref.clear(); // Delete all the keys.
    }
    pref.end();
    for(uint8_t i = 0; i < sizeof(this->m_shadeIds); i++) {
      // Start deleting the keys for the shades.
      if(this->m_shadeIds[i] == 255) continue;
      char shadeKey[15];
      sprintf(shadeKey, "SomfyShade%u", this->m_shadeIds[i]);
      pref.begin(shadeKey);
      pref.clear();
      pref.end();
    }
  }
  #endif
  if(ShadeConfigFile::exists()) {
    Serial.println("shades.cfg exists so we are using that");
    ShadeConfigFile::load(this);
  }
  else {
    Serial.println("Starting clean");
    #ifdef USE_NVS
    this->loadLegacy();
    #endif
  }
  this->transceiver.begin();

  // Set the radio type for shades that have yet to be specified.
  bool saveFlag = false;
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade *shade = &this->shades[i];
    if(shade->getShadeId() != 255 && shade->bitLength == 0) {
      //Serial.printf("Setting bit length to %d\n", this->transceiver.config.type);
      shade->bitLength = this->transceiver.config.type;
      saveFlag = true;
    }
  }
  if(saveFlag) somfy.commit();
  return true;
}
void SomfyShadeController::commit() {
  if(git.lockFS) return;
  esp_task_wdt_reset(); // Make sure we don't reset inadvertently.
  ShadeConfigFile file;
  file.begin();
  file.save(this);
  file.end();
  this->isDirty = false;
  this->lastCommit = millis();
}
void SomfyShadeController::writeBackup() {
  if(git.lockFS) return;
  esp_task_wdt_reset(); // Make sure we don't reset inadvertently.
  ShadeConfigFile file;
  file.begin("/controller.backup", false);
  file.backup(this);
  file.end();
}
SomfyRoom * SomfyShadeController::getRoomById(uint8_t roomId) {
  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    if(this->rooms[i].roomId == roomId) return &this->rooms[i];
  }
  return nullptr;
}
SomfyShade * SomfyShadeController::getShadeById(uint8_t shadeId) {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    if(this->shades[i].getShadeId() == shadeId) return &this->shades[i];
  }
  return nullptr;
}
SomfyGroup * SomfyShadeController::getGroupById(uint8_t groupId) {
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    if(this->groups[i].getGroupId() == groupId) return &this->groups[i];
  }
  return nullptr;
}
void SomfyShade::clear() {
  this->setShadeId(255);
  this->setRemoteAddress(0);
  this->moveStart = 0;
  this->tiltStart = 0;
  this->noSunStart = 0;
  this->sunStart = 0;
  this->windStart = 0;
  this->windLast = 0;
  this->noWindStart = 0;
  this->noSunDone = true;
  this->sunDone = true;
  this->windDone = true;
  this->noWindDone = true;
  this->startPos = 0.0f;
  this->startTiltPos = 0.0f;
  this->settingMyPos = false;
  this->settingPos = false;
  this->settingTiltPos = false;
  this->awaitMy = 0;
  this->flipPosition = false;
  this->flipCommands = false;
  this->ledFeedback = false;
  this->lastRollingCode = 0;
  this->shadeType = shade_types::roller;
  this->tiltType = tilt_types::none;
  //this->txQueue.clear();
  this->currentPos = 0.0f;
  this->currentTiltPos = 0.0f;
  this->direction = 0;
  this->tiltDirection = 0;  
  this->target = 0.0f;
  this->tiltTarget = 0.0f;
  this->myPos = -1.0f;
  this->myTiltPos = -1.0f;
  this->bitLength = somfy.transceiver.config.type;
  this->proto = somfy.transceiver.config.proto;
  for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++)
    this->linkedRemotes[i].setRemoteAddress(0);
  this->paired = false;
  this->name[0] = 0x00;
  this->upTime = 10000;
  this->downTime = 10000;
  this->tiltTimeUp = 7000;
  this->tiltTimeDown = 7000;
  this->tiltFirstOnOpen = true;
  this->tiltFirstOnClose = true;
  this->stepSize = 100;
  this->repeats = 1;
  this->sortOrder = 255;
}
void SomfyRoom::clear() {
  this->roomId = 0;
  strcpy(this->name, "");
}
void SomfyGroup::clear() {
  this->setGroupId(255);
  this->setRemoteAddress(0);
  this->repeats = 0;
  this->roomId = 0;
  this->ledFeedback = false;
  this->name[0] = 0x00;
  memset(&this->linkedShades, 0x00, sizeof(this->linkedShades));
}
bool SomfyShade::linkRemote(uint32_t address, uint16_t rollingCode) {
  // Check to see if the remote is already linked. If it is
  // just return true after setting the rolling code
  for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
    if(this->linkedRemotes[i].getRemoteAddress() == address) {
      this->linkedRemotes[i].setRollingCode(rollingCode);
      return true;
    }
  }
  for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
    if(this->linkedRemotes[i].getRemoteAddress() == 0) {
      this->linkedRemotes[i].setRemoteAddress(address);
      this->linkedRemotes[i].setRollingCode(rollingCode);
      #ifdef USE_NVS
      if(somfy.useNVS()) {
        uint32_t linkedAddresses[SOMFY_MAX_LINKED_REMOTES];
        memset(linkedAddresses, 0x00, sizeof(linkedAddresses));
        uint8_t j = 0;
        for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
          SomfyLinkedRemote lremote = this->linkedRemotes[i];
          if(lremote.getRemoteAddress() != 0) linkedAddresses[j++] = lremote.getRemoteAddress();
        }
        char shadeKey[15];
        snprintf(shadeKey, sizeof(shadeKey), "SomfyShade%u", this->getShadeId());
        pref.begin(shadeKey);
        pref.putBytes("linkedAddr", linkedAddresses, sizeof(uint32_t) * SOMFY_MAX_LINKED_REMOTES);
        pref.end();
      }
      #endif
      this->commit();
      return true;
    }
  }
  return false;
}
bool SomfyGroup::linkShade(uint8_t shadeId) {
  // Check to see if the shade is already linked. If it is just return true
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] == shadeId) {
      return true;
    }
  }
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] == 0) {
      this->linkedShades[i] = shadeId;
      somfy.commit();
      return true;
    }
  }
  return false;
}
void SomfyShade::commit() { somfy.commit(); }
void SomfyShade::commitShadePosition() {
  somfy.isDirty = true;
  #ifdef USE_NVS
  char shadeKey[15];
  if(somfy.useNVS()) {
    snprintf(shadeKey, sizeof(shadeKey), "SomfyShade%u", this->shadeId);
    Serial.print("Writing current shade position: ");
    Serial.println(this->currentPos, 4);
    pref.begin(shadeKey);
    pref.putFloat("currentPos", this->currentPos);
    pref.end();
  }
  #endif
}
void SomfyShade::commitMyPosition() {
  somfy.isDirty = true;
  #ifdef USE_NVS
  if(somfy.useNVS()) {
    char shadeKey[15];
    snprintf(shadeKey, sizeof(shadeKey), "SomfyShade%u", this->shadeId);
    Serial.print("Writing my shade position:");
    Serial.print(this->myPos);
    Serial.println("%");
    pref.begin(shadeKey);
    pref.putUShort("myPos", this->myPos);
    pref.end();
  }
  #endif
}
void SomfyShade::commitTiltPosition() {
  somfy.isDirty = true;
  #ifdef USE_NVS
  if(somfy.useNVS()) {
    char shadeKey[15];
    snprintf(shadeKey, sizeof(shadeKey), "SomfyShade%u", this->shadeId);
    Serial.print("Writing current shade tilt position: ");
    Serial.println(this->currentTiltPos, 4);
    pref.begin(shadeKey);
    pref.putFloat("currentTiltPos", this->currentTiltPos);
    pref.end();
  }
  #endif
}
bool SomfyShade::unlinkRemote(uint32_t address) {
  for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
    if(this->linkedRemotes[i].getRemoteAddress() == address) {
      this->linkedRemotes[i].setRemoteAddress(0);
      #ifdef USE_NVS
      if(somfy.useNVS()) {
        char shadeKey[15];
        snprintf(shadeKey, sizeof(shadeKey), "SomfyShade%u", this->getShadeId());
        uint32_t linkedAddresses[SOMFY_MAX_LINKED_REMOTES];
        memset(linkedAddresses, 0x00, sizeof(linkedAddresses));
        uint8_t j = 0;
        for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
          SomfyLinkedRemote lremote = this->linkedRemotes[i];
          if(lremote.getRemoteAddress() != 0) linkedAddresses[j++] = lremote.getRemoteAddress();
        }
        pref.begin(shadeKey);
        pref.putBytes("linkedAddr", linkedAddresses, sizeof(uint32_t) * SOMFY_MAX_LINKED_REMOTES);
        pref.end();
      }
      #endif
      this->commit();
      return true;
    }
  }
  return false;
}
bool SomfyGroup::unlinkShade(uint8_t shadeId) {
  bool removed = false;
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] == shadeId) {
      this->linkedShades[i] = 0;
      removed = true;
    }
  }
  // Compress the linked shade ids so we can stop looking on the first 0
  if(removed) {
    this->compressLinkedShadeIds();
    somfy.commit();
  }
  return removed;
}
void SomfyGroup::compressLinkedShadeIds() {
  // [1,0,4,3,0,0,0] i:0,j:0
  // [1,0,4,3,0,0,0] i:1,j:1
  // [1,4,0,3,0,0,0] i:2,j:1
  // [1,4,3,0,0,0,0] i:3,j:2
  // [1,4,3,0,0,0,0] i:4,j:2

  // [1,2,0,0,3,0,0] i:0,j:0
  // [1,2,0,0,3,0,0] i:1,j:1
  // [1,2,0,0,3,0,0] i:2,j:2
  // [1,2,0,0,3,0,0] i:3,j:2
  // [1,2,3,0,0,0,0] i:4,j:2
  // [1,2,3,0,0,0,0] i:5,j:3
  for(uint8_t i = 0, j = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] != 0) {
      if(i != j) {
        this->linkedShades[j] = this->linkedShades[i];
        this->linkedShades[i] = 0;
      }
      j++;
    }
  }
}
void SomfyShadeController::compressRepeaters() {
  for(uint8_t i = 0, j = 0; i < SOMFY_MAX_REPEATERS; i++) {
    if(this->repeaters[i] != 0) {
      if(i != j) {
        this->repeaters[j] = this->repeaters[i];
        this->repeaters[i] = 0;
      }
      j++;
    }
  }
}
bool SomfyGroup::hasShadeId(uint8_t shadeId) {
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] == 0) break;
    if(this->linkedShades[i] == shadeId) return true;
  }
  return false;
}
bool SomfyShade::isAtTarget() { 
  float epsilon = .00001;
  if(this->tiltType == tilt_types::tiltonly) return fabs(this->currentTiltPos - this->tiltTarget) < epsilon;
  else if(this->tiltType == tilt_types::none) return fabs(this->currentPos - this->target) < epsilon;
  return fabs(this->currentPos - this->target) < epsilon && fabs(this->currentTiltPos - this->tiltTarget) < epsilon; 
}
bool SomfyRemote::simMy() { return (this->flags & static_cast<uint8_t>(somfy_flags_t::SimMy)) > 0; }
void SomfyRemote::setSimMy(bool bSimMy) { bSimMy ? this->flags |= static_cast<uint8_t>(somfy_flags_t::SimMy) : this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::SimMy)); }
bool SomfyRemote::hasSunSensor() { return (this->flags & static_cast<uint8_t>(somfy_flags_t::SunSensor)) > 0;}
bool SomfyRemote::hasLight() { return (this->flags & static_cast<uint8_t>(somfy_flags_t::Light)) > 0; }
void SomfyRemote::setSunSensor(bool bHasSensor ) { bHasSensor ? this->flags |= static_cast<uint8_t>(somfy_flags_t::SunSensor) : this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::SunSensor)); }
void SomfyRemote::setLight(bool bHasLight ) { bHasLight ? this->flags |= static_cast<uint8_t>(somfy_flags_t::Light) : this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::Light)); }

void SomfyGroup::updateFlags() { 
  uint8_t oldFlags = this->flags;
  this->flags = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] != 0) {
      SomfyShade *shade = somfy.getShadeById(this->linkedShades[i]);
      if(shade) this->flags |= shade->flags;
    }
    else break;
  }
  if(oldFlags != this->flags) this->emitState();
}
bool SomfyShade::isInGroup() {
  if(this->getShadeId() == 255) return false;
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    if(somfy.groups[i].getGroupId() != 255 && somfy.groups[i].hasShadeId(this->getShadeId())) return true;
  }
  return false;
}
#ifdef USE_NVS
void SomfyShade::load() {
    char shadeKey[15];
    uint32_t linkedAddresses[SOMFY_MAX_LINKED_REMOTES];
    memset(linkedAddresses, 0x00, sizeof(uint32_t) * SOMFY_MAX_LINKED_REMOTES);
    snprintf(shadeKey, sizeof(shadeKey), "SomfyShade%u", this->shadeId);
    // Now load up each of the shades into memory.
    //Serial.print("key:");
    //Serial.println(shadeKey);
    
    pref.begin(shadeKey, !somfy.useNVS());
    pref.getString("name", this->name, sizeof(this->name));
    this->paired = pref.getBool("paired", false);
    if(pref.isKey("upTime") && pref.getType("upTime") != PreferenceType::PT_U32) {
      // We need to convert these to 32 bits because earlier versions did not support this.
      this->upTime = static_cast<uint32_t>(pref.getUShort("upTime", 1000));
      this->downTime = static_cast<uint32_t>(pref.getUShort("downTime", 1000));
      // Ancien tiltTime unique (clé NVS jamais renommée depuis) : sert de valeur de départ pour
      // les deux nouveaux sens tant qu'aucune calibration séparée n'a été enregistrée.
      uint32_t legacyTiltTime = static_cast<uint32_t>(pref.getUShort("tiltTime", 7000));
      this->tiltTimeUp = pref.getUInt("tiltTimeUp", legacyTiltTime);
      this->tiltTimeDown = pref.getUInt("tiltTimeDown", legacyTiltTime);
      if(somfy.useNVS()) {
        pref.remove("upTime");
        pref.putUInt("upTime", this->upTime);
        pref.remove("downTime");
        pref.putUInt("downTime", this->downTime);
        pref.remove("tiltTime");
        pref.putUInt("tiltTimeUp", this->tiltTimeUp);
        pref.putUInt("tiltTimeDown", this->tiltTimeDown);
      }
    }
    else {
      this->upTime = pref.getUInt("upTime", this->upTime);
      this->downTime = pref.getUInt("downTime", this->downTime);
      this->tiltTimeUp = pref.getUInt("tiltTimeUp", this->tiltTimeUp);
      this->tiltTimeDown = pref.getUInt("tiltTimeDown", this->tiltTimeDown);
    }
    this->setRemoteAddress(pref.getUInt("remoteAddress", 0));
    this->currentPos = pref.getFloat("currentPos", 0);
    this->target = floor(this->currentPos);
    this->myPos = static_cast<float>(pref.getUShort("myPos", this->myPos));
    this->tiltType = pref.getBool("hasTilt", false) ? tilt_types::none : tilt_types::tiltmotor;
    this->shadeType = static_cast<shade_types>(pref.getChar("shadeType", static_cast<uint8_t>(this->shadeType)));
    this->currentTiltPos = pref.getFloat("currentTiltPos", 0);
    this->tiltTarget = floor(this->currentTiltPos);
    pref.getBytes("linkedAddr", linkedAddresses, sizeof(linkedAddresses));
    pref.end();
    Serial.print("shadeId:");
    Serial.print(this->getShadeId());
    Serial.print(" name:");
    Serial.print(this->name);
    Serial.print(" address:");
    Serial.print(this->getRemoteAddress());
    Serial.print(" position:");
    Serial.print(this->currentPos);
    Serial.print(" myPos:");
    Serial.println(this->myPos);
    pref.begin("ShadeCodes");
    this->lastRollingCode = pref.getUShort(this->m_remotePrefId, 0);
    for(uint8_t j = 0; j < SOMFY_MAX_LINKED_REMOTES; j++) {
      SomfyLinkedRemote &lremote = this->linkedRemotes[j];
      lremote.setRemoteAddress(linkedAddresses[j]);
      lremote.lastRollingCode = pref.getUShort(lremote.getRemotePrefId(), 0);
    }
    pref.end();
}
#endif
void SomfyRoom::publish() {
  if(mqtt.connected()) {
    char topic[64];
    sprintf(topic, "rooms/%d/roomId", this->roomId);
    mqtt.publish(topic, this->roomId, true);
    sprintf(topic, "rooms/%d/name", this->roomId);
    mqtt.publish(topic, this->name, true);
    sprintf(topic, "rooms/%d/sortOrder", this->roomId);
    mqtt.publish(topic, this->sortOrder, true);
  }
}
void SomfyRoom::unpublish() {
  if(mqtt.connected()) {
    char topic[64];
    sprintf(topic, "rooms/%d/roomId", this->roomId);
    mqtt.unpublish(topic);
    sprintf(topic, "rooms/%d/name", this->roomId);
    mqtt.unpublish(topic);
    sprintf(topic, "rooms/%d/sortOrder", this->roomId);
    mqtt.unpublish(topic);
  }
}
void SomfyShade::publishState() {
  if(mqtt.connected()) {
    this->publish("position", this->transformPosition(this->currentPos), true);
    this->publish("direction", this->direction, true);
    this->publish("target", this->transformPosition(this->target), true);
    this->publish("lastRollingCode", this->lastRollingCode);
    this->publish("mypos", this->transformPosition(this->myPos), true);
    this->publish("myTiltPos", this->transformPosition(this->myTiltPos), true);
    if(this->tiltType != tilt_types::none) {
      this->publish("tiltDirection", this->tiltDirection, true);
      this->publish("tiltPosition", this->transformPosition(this->currentTiltPos), true);
      this->publish("tiltTarget", this->transformPosition(this->tiltTarget), true);
    }
    const uint8_t sunFlag = !!(this->flags & static_cast<uint8_t>(somfy_flags_t::SunFlag));
    const uint8_t isSunny = !!(this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny));
    const uint8_t isWindy = !!(this->flags & static_cast<uint8_t>(somfy_flags_t::Windy));
    if(this->hasSunSensor()) {
      this->publish("sunFlag", sunFlag);
      this->publish("sunny", isSunny);
    }
    this->publish("windy", isWindy);
  }
}
void SomfyShade::publishDisco() {
  if(!mqtt.connected() || !settings.MQTT.pubDisco) return;
  char topic[128] = "";
  DynamicJsonDocument doc(2048);
  JsonObject obj = doc.to<JsonObject>();
  snprintf(topic, sizeof(topic), "%s/shades/%d", settings.MQTT.rootTopic, this->shadeId);
  obj["~"] = topic;
  JsonObject dobj = obj.createNestedObject("device");
  dobj["hw_version"] = settings.fwVersion.name;
  dobj["name"] = settings.hostname;
  dobj["mf"] = "rstrouse";
  JsonArray arrids = dobj.createNestedArray("identifiers");
  //snprintf(topic, sizeof(topic), "mqtt_espsomfyrts_%s_shade%d", settings.serverId, this->shadeId);
  snprintf(topic, sizeof(topic), "mqtt_espsomfyrts_%s", settings.serverId);
  arrids.add(topic);
  //snprintf(topic, sizeof(topic), "ESPSomfy-RTS_%s", settings.serverId);
  dobj["via_device"] = topic;
  dobj["model"] = "ESPSomfy-RTS MQTT";
  snprintf(topic, sizeof(topic), "%s/status", settings.MQTT.rootTopic);
  obj["availability_topic"] = topic;
  obj["payload_available"] = "online";
  obj["payload_not_available"] = "offline";
  obj["name"] = this->name;
  snprintf(topic, sizeof(topic), "mqtt_%s_shade%d", settings.serverId, this->shadeId);
  obj["unique_id"] = topic;
  switch(this->shadeType) {
    case shade_types::blind:
      obj["device_class"] = "blind";
      obj["payload_close"] = this->flipPosition ? "-1" : "1";
      obj["payload_open"] = this->flipPosition ? "1" : "-1";
      obj["position_open"] = this->flipPosition ? 100 : 0;
      obj["position_closed"] = this->flipPosition ? 0 : 100;
      obj["state_closing"] = this->flipPosition ? "-1" : "1";
      obj["state_opening"] = this->flipPosition ? "1" : "-1";
      break;
    case shade_types::lgate:
    case shade_types::cgate:
    case shade_types::rgate:
    case shade_types::lgate1:
    case shade_types::cgate1:
    case shade_types::rgate1:
    case shade_types::ldrapery:
    case shade_types::rdrapery:
    case shade_types::cdrapery:
      obj["device_class"] = "curtain";
      obj["payload_close"] = this->flipPosition ? "-1" : "1";
      obj["payload_open"] = this->flipPosition ? "1" : "-1";
      obj["position_open"] = this->flipPosition ? 100 : 0;
      obj["position_closed"] = this->flipPosition ? 0 : 100;
      obj["state_closing"] = this->flipPosition ? "-1" : "1";
      obj["state_opening"] = this->flipPosition ? "1" : "-1";
      break;
    case shade_types::garage1:
    case shade_types::garage3:
      obj["device_class"] = "garage";
      obj["payload_close"] = this->flipPosition ? "-1" : "1";
      obj["payload_open"] = this->flipPosition ? "1" : "-1";
      obj["position_open"] = this->flipPosition ? 100 : 0;
      obj["position_closed"] = this->flipPosition ? 0 : 100;
      obj["state_closing"] = this->flipPosition ? "-1" : "1";
      obj["state_opening"] = this->flipPosition ? "1" : "-1";
      break;
    case shade_types::awning:
      obj["device_class"] = "awning";
      obj["payload_close"] = this->flipPosition ? "1" : "-1";
      obj["payload_open"] = this->flipPosition ? "-1" : "1";
      obj["position_open"] = this->flipPosition ? 0 : 100;
      obj["position_closed"] = this->flipPosition ? 100 : 0;
      obj["state_closing"] = this->flipPosition ? "1" : "-1";
      obj["state_opening"] = this->flipPosition ? "-1" : "1";
      break;
    case shade_types::shutter:
      obj["device_class"] = "shutter";
      obj["payload_close"] = this->flipPosition ? "-1" : "1";
      obj["payload_open"] = this->flipPosition ? "1" : "-1";
      obj["position_open"] = this->flipPosition ? 100 : 0;
      obj["position_closed"] = this->flipPosition ? 0 : 100;
      obj["state_closing"] = this->flipPosition ? "-1" : "1";
      obj["state_opening"] = this->flipPosition ? "1" : "-1";
      break;
    case shade_types::drycontact2:
    case shade_types::drycontact:
      break;
    default:
      obj["device_class"] = "shade";
      obj["payload_close"] = this->flipPosition ? "-1" : "1";
      obj["payload_open"] = this->flipPosition ? "1" : "-1";
      obj["position_open"] = this->flipPosition ? 100 : 0;
      obj["position_closed"] = this->flipPosition ? 0 : 100;
      obj["state_closing"] = this->flipPosition ? "-1" : "1";
      obj["state_opening"] = this->flipPosition ? "1" : "-1";
      break;
  }
  if(this->shadeType != shade_types::drycontact && this->shadeType != shade_types::drycontact2) {
    if(this->tiltType != tilt_types::tiltonly) {
      obj["command_topic"] = "~/direction/set";
      obj["position_topic"] = "~/position";
      obj["set_position_topic"] = "~/target/set";
      obj["state_topic"] = "~/direction";
      obj["payload_stop"] = "0";
      obj["state_stopped"] = "0";
    }
    else {
      obj["payload_close"] = nullptr;
      obj["payload_open"] = nullptr;
      obj["payload_stop"] = nullptr;
    }
    
    if(this->tiltType != tilt_types::none) {
      obj["tilt_command_topic"] = "~/tiltTarget/set";
      obj["tilt_status_topic"] = "~/tiltPosition";
    }
    snprintf(topic, sizeof(topic), "%s/cover/%d/config", settings.MQTT.discoTopic, this->shadeId);
  }
  else {
    obj["payload_on"] = 100;
    obj["payload_off"] = 0;
    obj["state_off"] = 0;
    obj["state_on"] = 100;
    obj["state_topic"] = "~/position";
    obj["command_topic"] = "~/target/set";
    snprintf(topic, sizeof(topic), "%s/switch/%d/config", settings.MQTT.discoTopic, this->shadeId);
  }
  
  obj["enabled_by_default"] = true;
  mqtt.publishDisco(topic, obj, true);  
}
void SomfyShade::unpublishDisco() {
  if(!mqtt.connected() || !settings.MQTT.pubDisco) return;
  char topic[128] = "";
  if(this->shadeType != shade_types::drycontact && this->shadeType != shade_types::drycontact2) {
    snprintf(topic, sizeof(topic), "%s/cover/%d/config", settings.MQTT.discoTopic, this->shadeId);
  }
  else
    snprintf(topic, sizeof(topic), "%s/switch/%d/config", settings.MQTT.discoTopic, this->shadeId);
  mqtt.unpublish(topic);
}
void SomfyShade::publish() {
  if(mqtt.connected()) {
    this->publish("shadeId", this->shadeId, true);
    this->publish("name", this->name, true);
    this->publish("remoteAddress", this->getRemoteAddress(), true);
    this->publish("shadeType", static_cast<uint8_t>(this->shadeType), true);
    this->publish("tiltType", static_cast<uint8_t>(this->tiltType), true);
    this->publish("flags", this->flags, true);
    this->publish("flipCommands", this->flipCommands, true);
    this->publish("flipPosition", this->flipPosition, true);
    this->publishState();
    this->publishDisco();
    sockEmit.loop(); // Keep our socket alive.
  }
}
void SomfyGroup::publishState() {
  if(mqtt.connected()) {
    this->publish("direction", this->direction, true);
    this->publish("lastRollingCode", this->lastRollingCode, true);
    this->publish("flipCommands", this->flipCommands, true);
    const uint8_t sunFlag = !!(this->flags & static_cast<uint8_t>(somfy_flags_t::SunFlag));
    const uint8_t isSunny = !!(this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny));
    const uint8_t isWindy = !!(this->flags & static_cast<uint8_t>(somfy_flags_t::Windy));
    this->publish("sunFlag", sunFlag);
    this->publish("sunny", isSunny);
    this->publish("windy", isWindy);    
  }  
}
void SomfyGroup::publish() {
  if(mqtt.connected()) {
    this->publish("groupId", this->groupId, true);
    this->publish("name", this->name, true);
    this->publish("remoteAddress", this->getRemoteAddress(), true);
    this->publish("groupType", static_cast<uint8_t>(this->groupType), true);
    this->publish("flags", this->flags, true);
    this->publish("sunSensor", this->hasSunSensor(), true);
    this->publishState();
  }
}
char mqttTopicBuffer[55];
void SomfyGroup::unpublish() { SomfyGroup::unpublish(this->groupId); }
void SomfyShade::unpublish() { SomfyShade::unpublish(this->shadeId); }
void SomfyShade::unpublish(uint8_t id) {
  if(mqtt.connected()) {
    SomfyShade::unpublish(id, "shadeId");
    SomfyShade::unpublish(id, "name");
    SomfyShade::unpublish(id, "remoteAddress");
    SomfyShade::unpublish(id, "shadeType");
    SomfyShade::unpublish(id, "tiltType");
    SomfyShade::unpublish(id, "flags");
    SomfyShade::unpublish(id, "flipCommands");
    SomfyShade::unpublish(id, "flipPosition");
    SomfyShade::unpublish(id, "position");
    SomfyShade::unpublish(id, "direction");
    SomfyShade::unpublish(id, "target");
    SomfyShade::unpublish(id, "lastRollingCode");
    SomfyShade::unpublish(id, "mypos");
    SomfyShade::unpublish(id, "myTiltPos");
    SomfyShade::unpublish(id, "tiltDirection");
    SomfyShade::unpublish(id, "tiltPosition");
    SomfyShade::unpublish(id, "tiltTarget");
    SomfyShade::unpublish(id, "windy");
    SomfyShade::unpublish(id, "sunny");
    if(settings.MQTT.pubDisco) {
      char topic[128] = "";
      snprintf(topic, sizeof(topic), "%s/cover/%d/config", settings.MQTT.discoTopic, id);
      mqtt.unpublish(topic);
      snprintf(topic, sizeof(topic), "%s/switch/%d/config", settings.MQTT.discoTopic, id);
      mqtt.unpublish(topic);
    }
  }
}
void SomfyGroup::unpublish(uint8_t id) {
  if(mqtt.connected()) {
    SomfyGroup::unpublish(id, "groupId");
    SomfyGroup::unpublish(id, "name");
    SomfyGroup::unpublish(id, "remoteAddress");
    SomfyGroup::unpublish(id, "groupType");
    SomfyGroup::unpublish(id, "direction");
    SomfyGroup::unpublish(id, "lastRollingCode");
    SomfyGroup::unpublish(id, "flags");
    SomfyGroup::unpublish(id, "SunSensor");
    SomfyGroup::unpublish(id, "flipCommands");
  }
}
void SomfyGroup::unpublish(uint8_t id, const char *topic) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", id, topic);
    mqtt.unpublish(mqttTopicBuffer);
  }
}
void SomfyShade::unpublish(uint8_t id, const char *topic) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", id, topic);
    mqtt.unpublish(mqttTopicBuffer);
  }
}
bool SomfyShade::publish(const char *topic, int8_t val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}

bool SomfyShade::publish(const char *topic, const char *val, bool retain) { 
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyShade::publish(const char *topic, uint8_t val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyShade::publish(const char *topic, uint32_t val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyShade::publish(const char *topic, uint16_t val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyShade::publish(const char *topic, bool val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}

bool SomfyGroup::publish(const char *topic, int8_t val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyGroup::publish(const char *topic, uint8_t val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyGroup::publish(const char *topic, uint32_t val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyGroup::publish(const char *topic, uint16_t val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyGroup::publish(const char *topic, bool val, bool retain) {
  if(mqtt.connected()) {
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
// State Setters
float SomfyShade::p_currentPos(float pos) {
  float old = this->currentPos;
  this->currentPos = pos;
  if(floor(old) != floor(pos)) this->publish("position", this->transformPosition(static_cast<uint8_t>(floor(this->currentPos))));
  return old;
}
float SomfyShade::p_currentTiltPos(float pos) {
  float old = this->currentTiltPos;
  this->currentTiltPos = pos;
  if(floor(old) != floor(pos)) this->publish("tiltPosition", this->transformPosition(static_cast<uint8_t>(floor(this->currentTiltPos))));
  return old;
}
uint16_t SomfyShade::p_lastRollingCode(uint16_t code) {
  uint16_t old = SomfyRemote::p_lastRollingCode(code);
  if(old != code) this->publish("lastRollingCode", code);
  return old;
}
bool SomfyShade::p_flag(somfy_flags_t flag, bool val) {
  bool old = !!(this->flags & static_cast<uint8_t>(flag));
  if(val) 
      this->flags |= static_cast<uint8_t>(flag);
  else
      this->flags &= ~(static_cast<uint8_t>(flag));
  return old;
}
bool SomfyShade::p_sunFlag(bool val) {
  bool old = this->p_flag(somfy_flags_t::SunFlag, val);
  if(old != val) this->publish("sunFlag", static_cast<uint8_t>(val));
  return old;
}
bool SomfyShade::p_windy(bool val) {
  bool old = this->p_flag(somfy_flags_t::Windy, val);
  if(old != val) this->publish("windy", static_cast<uint8_t>(val));
  return old;
}
bool SomfyShade::p_sunny(bool val) {
  bool old = this->p_flag(somfy_flags_t::Sunny, val);
  if(old != val) this->publish("sunny", static_cast<uint8_t>(val));
  return old;
}
int8_t SomfyShade::p_direction(int8_t dir) {
  int8_t old = this->direction;
  if(old != dir) {
    this->direction = dir;
    this->publish("direction", this->direction, true);
  }
  return old;
}
int8_t SomfyGroup::p_direction(int8_t dir) {
  int8_t old = this->direction;
  if(old != dir) {
    this->direction = dir;
    this->publish("direction", this->direction);
  }
  return old;
}
int8_t SomfyShade::p_tiltDirection(int8_t dir) {
  int8_t old = this->tiltDirection;
  if(old != dir) {
    this->tiltDirection = dir;
    this->publish("tiltDirection", this->tiltDirection, true);
  }
  return old;
}
float SomfyShade::p_target(float target) {
  float old = this->target;
  if(old != target) {
    this->target = target;
    if(this->transformPosition(old) != this->transformPosition(target))
      this->publish("target", this->transformPosition(this->target), true);
  }
  return old;
}
float SomfyShade::p_tiltTarget(float target) {
  float old = this->tiltTarget;
  if(old != target) {
    this->tiltTarget = target;
    if(this->transformPosition(old) != this->transformPosition(target))
      this->publish("tiltTarget", this->transformPosition(this->tiltTarget), true);
  }
  return old;
}
float SomfyShade::p_myPos(float pos) {
  float old = this->myPos;
  if(old != pos) {
    //if(this->transformPosition(pos) == 0) Serial.println("MyPos = %.2f", pos);
    this->myPos = pos;
    if(this->transformPosition(old) != this->transformPosition(pos))
      this->publish("mypos", this->transformPosition(this->myPos), true);
  }
  return old;
}
float SomfyShade::p_myTiltPos(float pos) {
  float old = this->myTiltPos;
  if(old != pos) {
    this->myTiltPos = pos;
    if(this->transformPosition(old) != this->transformPosition(pos))
      this->publish("myTiltPos", this->transformPosition(this->myTiltPos), true);
  }
  return old;
}

void SomfyShade::emitState(const char *evt) { this->emitState(255, evt); }
void SomfyShade::emitState(uint8_t num, const char *evt) {
  JsonSockEvent *json = sockEmit.beginEmit(evt);
  json->beginObject();
  json->addElem("shadeId", this->shadeId);
  json->addElem("type", static_cast<uint8_t>(this->shadeType));
  json->addElem("remoteAddress", (uint32_t)this->getRemoteAddress());
  json->addElem("name", this->name);
  json->addElem("direction", this->direction);
  json->addElem("position", this->transformPosition(this->currentPos));
  json->addElem("target", this->transformPosition(this->target));
  json->addElem("myPos", this->transformPosition(this->myPos));
  json->addElem("tiltType", static_cast<uint8_t>(this->tiltType));
  json->addElem("flipCommands", this->flipCommands);
  json->addElem("flipPosition", this->flipPosition);
  json->addElem("flags", this->flags);
  json->addElem("sunSensor", this->hasSunSensor());
  json->addElem("light", this->hasLight());
  json->addElem("sortOrder", this->sortOrder);
  if(this->tiltType != tilt_types::none) {
    json->addElem("tiltDirection", this->tiltDirection);
    json->addElem("tiltTarget", this->transformPosition(this->tiltTarget));
    json->addElem("tiltPosition", this->transformPosition(this->currentTiltPos));
    json->addElem("myTiltPos", this->transformPosition(this->myTiltPos));
  }
  json->endObject();
  sockEmit.endEmit(num);
  /*
  char buf[420];
  if(this->tiltType != tilt_types::none)
    snprintf(buf, sizeof(buf), "{\"shadeId\":%d,\"type\":%u,\"remoteAddress\":%d,\"name\":\"%s\",\"direction\":%d,\"position\":%d,\"target\":%d,\"myPos\":%d,\"myTiltPos\":%d,\"tiltType\":%u,\"tiltDirection\":%d,\"tiltTarget\":%d,\"tiltPosition\":%d,\"flipCommands\":%s,\"flipPosition\":%s,\"flags\":%d,\"sunSensor\":%s,\"light\":%s,\"sortOrder\":%d}", 
      this->shadeId, static_cast<uint8_t>(this->shadeType), this->getRemoteAddress(), this->name, this->direction, 
      this->transformPosition(this->currentPos), this->transformPosition(this->target), this->transformPosition(this->myPos), this->transformPosition(this->myTiltPos), static_cast<uint8_t>(this->tiltType), this->tiltDirection, 
      this->transformPosition(this->tiltTarget), this->transformPosition(this->currentTiltPos),
      this->flipCommands ? "true" : "false", this->flipPosition ? "true": "false", this->flags, this->hasSunSensor() ? "true" : "false", this->hasLight() ? "true" : "false", this->sortOrder);
  else
    snprintf(buf, sizeof(buf), "{\"shadeId\":%d,\"type\":%u,\"remoteAddress\":%d,\"name\":\"%s\",\"direction\":%d,\"position\":%d,\"target\":%d,\"myPos\":%d,\"tiltType\":%u,\"flipCommands\":%s,\"flipPosition\":%s,\"flags\":%d,\"sunSensor\":%s,\"light\":%s,\"sortOrder\":%d}", 
      this->shadeId, static_cast<uint8_t>(this->shadeType), this->getRemoteAddress(), this->name, this->direction, 
      this->transformPosition(this->currentPos), this->transformPosition(this->target), this->transformPosition(this->myPos), 
      static_cast<uint8_t>(this->tiltType), this->flipCommands ? "true" : "false", this->flipPosition ? "true": "false", this->flags, this->hasSunSensor() ? "true" : "false", this->hasLight() ? "true" : "false", this->sortOrder);
  if(num >= 255) sockEmit.sendToClients(evt, buf);
  else sockEmit.sendToClient(num, evt, buf);
  */
}
void SomfyShade::emitCommand(somfy_commands cmd, const char *source, uint32_t sourceAddress, const char *evt) { this->emitCommand(255, cmd, source, sourceAddress, evt); }
void SomfyShade::emitCommand(uint8_t num, somfy_commands cmd, const char *source, uint32_t sourceAddress, const char *evt) {
  JsonSockEvent *json = sockEmit.beginEmit(evt);
  json->beginObject();
  json->addElem("shadeId", this->shadeId);
  json->addElem("remoteAddress", (uint32_t)this->getRemoteAddress());
  json->addElem("cmd", translateSomfyCommand(cmd).c_str());
  json->addElem("source", source);
  json->addElem("rcode", (uint32_t)this->lastRollingCode);
  json->addElem("sourceAddress", (uint32_t)sourceAddress);
  json->endObject();
  sockEmit.endEmit(num);
  /*
  ClientSocketEvent e(evt);
  char buf[30];
  snprintf(buf, sizeof(buf), "{\"shadeId\":%d", this->shadeId);
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), ",\"remoteAddress\":%d", this->getRemoteAddress());
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), ",\"cmd\":\"%s\"", translateSomfyCommand(cmd).c_str());
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), ",\"source\":\"%s\"", source);
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), ",\"rcode\":%d", this->lastRollingCode);
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), ",\"sourceAddress\":%d}", sourceAddress);
  e.appendMessage(buf);
  if(num >= 255) sockEmit.sendToClients(&e);
  else sockEmit.sendToClient(num, &e);
  */
  if(mqtt.connected()) {
    this->publish("cmdSource", source);
    this->publish("cmdAddress", sourceAddress);
    this->publish("cmd", translateSomfyCommand(cmd).c_str());
  }
}
void SomfyRoom::emitState(const char *evt) { this->emitState(255, evt); }
void SomfyRoom::emitState(uint8_t num, const char *evt) {
  JsonSockEvent *json = sockEmit.beginEmit(evt);
  json->beginObject();
  json->addElem("roomId", this->roomId);
  json->addElem("name", this->name);
  json->addElem("sortOrder", this->sortOrder);
  json->endObject();
  sockEmit.endEmit(num);
  /*
  ClientSocketEvent e(evt);
  char buf[55];
  uint8_t flags = 0;
  snprintf(buf, sizeof(buf), "{\"roomId\":%d,", this->roomId);
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), "\"name\":\"%s\",", this->name);
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), "\"sortOrder\":%d}", this->sortOrder);
  e.appendMessage(buf);
  if(num >= 255) sockEmit.sendToClients(&e);
  else sockEmit.sendToClient(num, &e);
  */
  this->publish();
}
void SomfyGroup::emitState(const char *evt) { this->emitState(255, evt); }
void SomfyGroup::emitState(uint8_t num, const char *evt) {
  uint8_t flags = 0;
  JsonSockEvent *json = sockEmit.beginEmit(evt);
  json->beginObject();
  json->addElem("groupId", this->groupId);
  json->addElem("remoteAddress", (uint32_t)this->getRemoteAddress());
  json->addElem("name", this->name);
  json->addElem("sunSensor", this->hasSunSensor());
  json->beginArray("shades");
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] != 255 && this->linkedShades[i] != 0) {
      SomfyShade *shade = somfy.getShadeById(this->linkedShades[i]);
      if(shade) {
        json->addElem(this->linkedShades[i]);
        flags |= shade->flags;
      }
    }
  }
  json->endArray();
  json->addElem("flags", flags);
  json->endObject();
  sockEmit.endEmit(num);
  /*
  ClientSocketEvent e(evt);
  char buf[55];
  uint8_t flags = 0;
  snprintf(buf, sizeof(buf), "{\"groupId\":%d,", this->groupId);
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), "\"remoteAddress\":%d,", this->getRemoteAddress());
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), "\"name\":\"%s\",", this->name);
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), "\"sunSensor\":%s,", this->hasSunSensor() ? "true" : "false");
  e.appendMessage(buf);
  snprintf(buf, sizeof(buf), "\"shades\":[");
  e.appendMessage(buf);
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] != 255) {
      if(this->linkedShades[i] != 0) {
        SomfyShade *shade = somfy.getShadeById(this->linkedShades[i]);
        if(shade) {
          flags |= shade->flags;
          snprintf(buf, sizeof(buf), "%s%d", i != 0 ? "," : "", this->linkedShades[i]);
          e.appendMessage(buf);
        }
      }
    }
  }
  snprintf(buf, sizeof(buf), "],\"flags\":%d}", flags);
  e.appendMessage(buf);
  
  if(num >= 255) sockEmit.sendToClients(&e);
  else sockEmit.sendToClient(num, &e);
  */
  this->publish();
}
int8_t SomfyShade::transformPosition(float fpos) { 
  if(fpos < 0) return -1;
  return static_cast<int8_t>(this->flipPosition && fpos >= 0.00f ? floor(100.0f - fpos) : floor(fpos)); 
}
bool SomfyShade::isIdle() { 
  return this->isAtTarget() && this->direction == 0 && this->tiltDirection == 0; 
}
void SomfyShade::processWaitingFrame() {
  if(this->shadeId == 255) {
    this->lastFrame.await = 0; 
    return;
  }
  if(this->lastFrame.processed) return;
  if(this->lastFrame.await > 0 && (int32_t)(millis() - this->lastFrame.await) >= 0) {
    somfy_commands cmd = this->transformCommand(this->lastFrame.cmd);
    switch(cmd) {
      case somfy_commands::StepUp:
          this->lastFrame.processed = true;
          // Simply move the shade up by 1%.
          if(this->currentPos > 0) {
            this->p_target(floor(this->currentPos) - 1);
            this->setMovement(-1);
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          break;
      case somfy_commands::StepDown:
          this->lastFrame.processed = true;
          // Simply move the shade down by 1%.
          if(this->currentPos < 100) {
            this->p_target(floor(this->currentPos) + 1);
            this->setMovement(1);
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          break;
      case somfy_commands::Down:
      case somfy_commands::Up:
        if(this->tiltType == tilt_types::tiltmotor) { // Theoretically this should get here unless it does have a tilt motor.
          if(this->lastFrame.repeats >= TILT_REPEATS) {
            int8_t dir = this->lastFrame.cmd == somfy_commands::Up ? -1 : 1;
            this->p_tiltTarget(dir > 0 ? 100.0f : 0.0f);
            this->setTiltMovement(dir);
            this->lastFrame.processed = true;
            DBG_PRINT(this->name);
            DBG_PRINT(" Processing tilt ");
            DBG_PRINT(translateSomfyCommand(this->lastFrame.cmd));
            DBG_PRINT(" after ");
            DBG_PRINT(this->lastFrame.repeats);
            DBG_PRINTLN(" repeats");
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          else {
            int8_t dir = this->lastFrame.cmd == somfy_commands::Up ? -1 : 1;
            this->p_target(dir > 0 ? 100 : 0);
            this->setMovement(dir);
            this->lastFrame.processed = true;
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          if(this->lastFrame.repeats > TILT_REPEATS + 2) {
            this->lastFrame.processed = true;
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
        }
        else if(this->tiltType == tilt_types::euromode) {
          if(this->lastFrame.repeats >= TILT_REPEATS) {
            int8_t dir = this->lastFrame.cmd == somfy_commands::Up ? -1 : 1;
            this->p_target(dir > 0 ? 100.0f : 0.0f);
            this->setMovement(dir);
            this->lastFrame.processed = true;
            DBG_PRINT(this->name);
            DBG_PRINT(" Processing ");
            DBG_PRINT(translateSomfyCommand(this->lastFrame.cmd));
            DBG_PRINT(" after ");
            DBG_PRINT(this->lastFrame.repeats);
            DBG_PRINTLN(" repeats");
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          else {
            int8_t dir = this->lastFrame.cmd == somfy_commands::Up ? -1 : 1;
            this->p_tiltTarget(dir > 0 ? 100 : 0);
            this->setTiltMovement(dir);
            this->lastFrame.processed = true;
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          if(this->lastFrame.repeats > TILT_REPEATS + 2) {
            this->lastFrame.processed = true;
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
        }
        break;
      case somfy_commands::My:
        if(this->lastFrame.repeats >= SETMY_REPEATS && this->isIdle()) {
          if(floor(this->myPos) == floor(this->currentPos)) {
            // We are clearing it.
            this->p_myPos(-1);
            this->p_myTiltPos(-1);
          }
          else {
            this->p_myPos(this->currentPos);
            this->p_myTiltPos(this->currentTiltPos);
          }
          this->commitMyPosition();
          this->lastFrame.processed = true;
          this->emitState();
        }
        else if(this->isIdle()) {
          if(this->simMy())
            this->moveToMyPosition(); // Call out like this (instead of move to target) so that we don't get some of the goofy tilt only problems.
          else {
            if(this->myPos >= 0.0f && this->myPos <= 100.0f) this->p_target(this->myPos);
            if(this->myTiltPos >= 0.0f && this->myTiltPos <= 100.0f) this->p_tiltTarget(this->myTiltPos);
          }
          this->setMovement(0);
          this->lastFrame.processed = true;
          this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
        }
        else {
          this->p_target(this->currentPos);
          this->p_tiltTarget(this->currentTiltPos);
        }
        if(this->lastFrame.repeats > SETMY_REPEATS + 2) this->lastFrame.processed = true;
        if(this->lastFrame.processed) {
          DBG_PRINT(this->name);
          DBG_PRINT(" Processing MY after ");
          DBG_PRINT(this->lastFrame.repeats);
          DBG_PRINTLN(" repeats");
        }
        break;
      default:
        break;
    }
  }
}
void SomfyShade::processFrame(somfy_frame_t &frame, bool internal) {
  // The reason why we are processing all frames here is so
  // any linked remotes that may happen to be on the same ESPSomfy RTS
  // device can trigger the appropriate actions.
  if(this->shadeId == 255) return; 
  bool hasRemote = this->getRemoteAddress() == frame.remoteAddress;
  if(!hasRemote) {
    for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
      if(this->linkedRemotes[i].getRemoteAddress() == frame.remoteAddress) {
        if(frame.cmd != somfy_commands::Sensor) this->linkedRemotes[i].setRollingCode(frame.rollingCode);
        // Diagnostic RSSI "live", RAM uniquement (cf. SomfyLinkedRemote::lastRssi) : rafraîchi à
        // chaque trame valide de cette télécommande, pas seulement lors de la liaison initiale.
        this->linkedRemotes[i].lastRssi = (int8_t)frame.rssi;
        hasRemote = true;
        break;
      }
    }
  }
  if(!hasRemote) return;
  const uint32_t curTime = millis();
  this->lastFrame.copy(frame);
  int8_t dir = 0;
  this->moveStart = this->tiltStart = curTime;
  this->startPos = this->currentPos;
  this->startTiltPos = this->currentTiltPos;
  // If the command is coming from a remote then we are aborting all these positioning operations.
  if(!internal) this->settingMyPos = this->settingPos = this->settingTiltPos = false;
  somfy_commands cmd = this->transformCommand(frame.cmd);
  // At this point we are not processing the combo buttons
  // will need to see what the shade does when you press both.
  switch(cmd) {
    case somfy_commands::Sensor:
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      {
        const uint8_t prevFlags = this->flags;
        const bool wasSunny = prevFlags & static_cast<uint8_t>(somfy_flags_t::Sunny);
        const bool wasWindy = prevFlags & static_cast<uint8_t>(somfy_flags_t::Windy);
        const uint16_t status = frame.rollingCode << 4;
        if (status & static_cast<uint8_t>(somfy_flags_t::Sunny))
          this->p_sunny(true);
          //this->flags |= static_cast<uint8_t>(somfy_flags_t::Sunny);
        else
          this->p_sunny(false);
          //this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::Sunny));
        if (status & static_cast<uint8_t>(somfy_flags_t::Windy))
          this->p_windy(true);
          //this->flags |= static_cast<uint8_t>(somfy_flags_t::Windy);
        else
          this->p_windy(false);
          //this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::Windy));
        if(frame.rollingCode & static_cast<uint8_t>(somfy_flags_t::DemoMode))
          this->flags |= static_cast<uint8_t>(somfy_flags_t::DemoMode);
        else
          this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::DemoMode));
        const bool isSunny = this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny);
        const bool isWindy = this->flags & static_cast<uint8_t>(somfy_flags_t::Windy);
        if (isSunny)
        {
          this->noSunStart = 0;
          this->noSunDone = true;
        }
        else
        {
          this->sunStart = 0;
          this->sunDone = true;
        }
        if (isWindy)
        {
          this->noWindStart = 0;
          this->noWindDone = true;
          this->windLast = curTime;
        }
        else
        {
          this->windStart = 0;
          this->windDone = true;
        }
        if (isSunny && !wasSunny)
        {
          this->sunStart = curTime;
          this->sunDone = false;
          DBG_PRINTF("[%u] Sun -> start\r\n", this->shadeId);
        }
        else if (!isSunny && wasSunny)
        {
          this->noSunStart = curTime;
          this->noSunDone = false;
          DBG_PRINTF("[%u] No Sun -> start\r\n", this->shadeId);
        }
        if (isWindy && !wasWindy)
        {
          this->windStart = curTime;
          this->windDone = false;
          DBG_PRINTF("[%u] Wind -> start\r\n", this->shadeId);
        }
        else if (!isWindy && wasWindy)
        {
          this->noWindStart = curTime;
          this->noWindDone = false;
          DBG_PRINTF("[%u] No Wind -> start\r\n", this->shadeId);
        }
        this->emitState();
        somfy.updateGroupFlags();
      }
      break;
    case somfy_commands::Prog:
    case somfy_commands::MyUp:
    case somfy_commands::MyDown:
    case somfy_commands::MyUpDown:
    case somfy_commands::UpDown:
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;
      
    case somfy_commands::Flag:
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      if(this->lastFrame.rollingCode & 0x8000) return; // Some sensors send bogus frames with a rollingCode >= 32768 that cause them to change the state.
      this->p_sunFlag(false);
      //this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::SunFlag));
      somfy.isDirty = true;
      this->emitState();
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      somfy.updateGroupFlags();
      break;    
    case somfy_commands::SunFlag:
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      if(this->lastFrame.rollingCode & 0x8000) return; // Some sensors send bogus frames with a rollingCode >= 32768 that cause them to change the state.
      {
        const bool isWindy = this->flags & static_cast<uint8_t>(somfy_flags_t::Windy);
        //this->flags |= static_cast<uint8_t>(somfy_flags_t::SunFlag);
        this->p_sunFlag(true);
        if (!isWindy)
        {
          const bool isSunny = this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny);
          if (isSunny && this->sunDone) {
            if(this->tiltType == tilt_types::tiltonly)
              this->p_tiltTarget(this->myTiltPos >= 0 ? this->myTiltPos : 100.0f);
            else
              this->p_target(this->myPos >= 0 ? this->myPos : 100.0f);
          }
          else if (!isSunny && this->noSunDone) {
            if(this->tiltType == tilt_types::tiltonly)
              this->p_tiltTarget(0.0f);
            else
              this->p_target(0.0f);
          }
        }
        somfy.isDirty = true;
        this->emitState();
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        somfy.updateGroupFlags();
      }
      break;
    case somfy_commands::Up:
      if(this->shadeType == shade_types::drycontact) {
        this->lastFrame.processed = true;
        return;
      }
      else if(this->shadeType == shade_types::drycontact2) {
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(this->currentPos != 0.0f) this->p_target(0);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        return;
      }
      if(this->tiltType == tilt_types::tiltmotor || this->tiltType == tilt_types::euromode) {
        // Wait another half second just in case we are potentially processing a tilt.
        if(!internal) this->lastFrame.await = curTime + 500;
        else this->lastFrame.processed = true;
      }
      else {
        // If from a remote we will simply be going up.
        if(this->tiltType == tilt_types::tiltonly && !internal) this->p_tiltTarget(0.0f);
        else if(!internal) {
          if(this->tiltType != tilt_types::tiltonly) this->p_target(0.0f);
          this->p_tiltTarget(0.0f);
        }
        this->lastFrame.processed = true;
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      }
      break;
    case somfy_commands::Down:
      if(this->shadeType == shade_types::drycontact) {
        this->lastFrame.processed = true;
        return;
      }
      else if(this->shadeType == shade_types::drycontact2) {
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(this->currentPos != 100.0f) this->p_target(100);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        return;
      }
      if (!this->windLast || (curTime - this->windLast) >= SOMFY_NO_WIND_REMOTE_TIMEOUT) {
        if(this->tiltType == tilt_types::tiltmotor || this->tiltType == tilt_types::euromode) {
          // Wait another half seccond just in case we are potentially processing a tilt.
          if(!internal) this->lastFrame.await = curTime + 500;
          else this->lastFrame.processed = true;
        }
        else {
          this->lastFrame.processed = true;
          if(!internal) {
            if(this->tiltType != tilt_types::tiltonly) this->p_target(100.0f);
            if(this->tiltType != tilt_types::none) this->p_tiltTarget(100.0f);
          }
        }
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      }
      break;
    case somfy_commands::My:
      if(this->shadeType == shade_types::drycontact2) return;
      if(this->isToggle()) { // This is a one button device
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(!this->isIdle()) this->p_target(this->currentPos);
        else if(this->currentPos == 100.0f) this->p_target(0.0f);
        else if(this->currentPos == 0.0f) this->p_target(100.0f);
        else this->p_target(this->lastMovement == -1 ? 100 : 0);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        return;
      }
      else if(this->shadeType == shade_types::drycontact) {
        // In this case we need to toggle the contact but we only should do this if
        // this is not a repeat.
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(this->currentPos == 100.0f) this->p_target(0);
        else if(this->currentPos == 0.0f) this->p_target(100);
        else this->p_target(this->lastMovement == -1 ? 100 : 0);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        return;
      }
      if(this->isIdle()) {
        if(!internal) {
          // This frame is coming from a remote. We are potentially setting
          // the my position.
          this->lastFrame.await = curTime + 500;
        }
        else {
          if(this->lastFrame.processed) return;
          DBG_PRINTLN("Moving to My target");
          this->lastFrame.processed = true;
          if(this->myTiltPos >= 0.0f && this->myTiltPos <= 100.0f) this->p_tiltTarget(this->myTiltPos);
          if(this->myPos >= 0.0f && this->myPos <= 100.0f && this->tiltType != tilt_types::tiltonly) this->p_target(this->myPos);
          this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        }
      }
      else {
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(!internal) {
          if(this->tiltType != tilt_types::tiltonly) this->p_target(this->currentPos);
          this->p_tiltTarget(this->currentTiltPos);
        }
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      }
      break;
    case somfy_commands::StepUp:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      dir = 0;
      // With the step commands and integrated shades
      // the motor must tilt in the direction first then move
      // so we have to calculate the target with this in mind.
      if(this->stepSize == 0) return; // Avoid divide by 0.
      if(this->lastFrame.stepSize == 0) this->lastFrame.stepSize = 1;
      if(this->tiltType == tilt_types::integrated) {
        // With integrated tilt this is more involved than ne would think because the step command can be moving not just the tilt
        // but the lift.  So a determination needs to be made as to whether we are currently moving and it should stop.
        // Conditions:
        // 1. If both the tilt and lift are at 0% do nothing
        // 2. If the tilt position is not currently at the top then shift the tilt.
        // 3. If the tilt position is not currently at the top then shift the lift.
        if(this->currentTiltPos <= 0.0f && this->currentPos <= 0.0f) return; // Do nothing
        else if(this->currentTiltPos > 0.0f) {
          // Set the tilt position.  This should stop the lift movement.
          this->p_target(this->currentPos);
          if(this->tiltTimeUp == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(max(0.0f, this->currentTiltPos - (100.0f/(static_cast<float>(this->tiltTimeUp/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
        }
        else {
          // We only have the lift to move.
          if(this->upTime == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(this->currentTiltPos);
          this->p_target(max(0.0f, this->currentPos - (100.0f/(static_cast<float>(this->upTime/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
        }
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        if(this->tiltTimeUp == 0 || this->stepSize == 0) return;
        this->p_tiltTarget(max(0.0f, this->currentTiltPos - (100.0f/(static_cast<float>(this->tiltTimeUp/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
      }
      else if(this->currentPos > 0.0f) {
        if(this->downTime == 0 || this->stepSize == 0) return;
        this->p_target(max(0.0f, this->currentPos - (100.0f/(static_cast<float>(this->upTime/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
      }
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;
    case somfy_commands::StepDown:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      dir = 1;
      // With the step commands and integrated shades
      // the motor must tilt in the direction first then move
      // so we have to calculate the target with this in mind.
      if(this->stepSize == 0) return; // Avoid divide by 0.
      if(this->lastFrame.stepSize == 0) this->lastFrame.stepSize = 1;
      
      if(this->tiltType == tilt_types::integrated) {
        // With integrated tilt this is more involved than ne would think because the step command can be moving not just the tilt
        // but the lift.  So a determination needs to be made as to whether we are currently moving and it should stop.
        // Conditions:
        // 1. If both the tilt and lift are at 100% do nothing
        // 2. If the tilt position is not currently at the bottom then shift the tilt.
        // 3. If the tilt position is add the bottom then shift the lift.
        if(this->currentTiltPos >= 100.0f && this->currentPos >= 100.0f) return; // Do nothing
        else if(this->currentTiltPos < 100.0f) {
          // Set the tilt position.  This should stop the lift movement.
          this->p_target(this->currentPos);
          if(this->tiltTimeDown == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(min(100.0f, this->currentTiltPos + (100.0f/(static_cast<float>(this->tiltTimeDown/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
        }
        else {
          // We only have the lift to move.
          this->p_tiltTarget(this->currentTiltPos);
          if(this->downTime == 0) return; // Avoid divide by 0.
          this->p_target(min(100.0f, this->currentPos + (100.0f/(static_cast<float>(this->downTime/static_cast<float>(this->stepSize* this->lastFrame.stepSize))))));
        }
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        if(this->tiltTimeDown == 0 || this->stepSize == 0) return;
        this->p_target(min(100.0f, this->currentTiltPos + (100.0f/(static_cast<float>(this->tiltTimeDown/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
      }
      else if(this->currentPos < 100.0f) {
        if(this->downTime == 0 || this->stepSize == 0) return;
        this->p_target(min(100.0f, this->currentPos + (100.0f/(static_cast<float>(this->downTime/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
      }
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;
    case somfy_commands::Toggle:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      if(!this->isIdle()) this->p_target(this->currentPos);
      else if(this->currentPos == 100.0f) this->p_target(0);
      else if(this->currentPos == 0.0f) this->p_target(100);
      else this->p_target(this->lastMovement == -1 ? 100 : 0);
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;
    case somfy_commands::Stop:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      this->p_target(this->currentPos);
      this->p_tiltTarget(this->currentTiltPos);      
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;
    case somfy_commands::Favorite:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      if(this->simMy()) {
        this->moveToMyPosition();
      }
      else {
        if(this->myTiltPos >= 0.0f && this->myTiltPos <= 100.0f) this->p_tiltTarget(this->myTiltPos);
        if(this->myPos >= 0.0f && this->myPos <= 100.0f && this->tiltType != tilt_types::tiltonly) this->p_target(this->myPos);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      }
      break;
    default:
      dir = 0;
      break;
  }
  //if(dir == 0 && this->tiltType == tilt_types::tiltmotor && this->tiltDirection != 0) this->setTiltMovement(0);
  this->setMovement(dir);
}
void SomfyShade::processInternalCommand(somfy_commands cmd, uint8_t repeat) {
  // The reason why we are processing all frames here is so
  // any linked remotes that may happen to be on the same ESPSomfy RTS
  // device can trigger the appropriate actions.
  if(this->shadeId == 255) return; 
  const uint32_t curTime = millis();
  int8_t dir = 0;
  this->moveStart = this->tiltStart = curTime;
  this->startPos = this->currentPos;
  this->startTiltPos = this->currentTiltPos;
  // If the command is coming from a remote then we are aborting all these positioning operations.
  switch(cmd) {
    case somfy_commands::Up:
      if(this->tiltType == tilt_types::tiltmotor) {
        if(repeat >= TILT_REPEATS)
          this->p_tiltTarget(0.0f);
        else
          this->p_target(0.0f);
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        this->p_target(100.0f);
        this->p_currentPos(100.0f);
        this->p_tiltTarget(0.0f);
      }
      else {
        this->p_target(0.0f);
        this->p_tiltTarget(0.0f);
      }
      break;
    case somfy_commands::Down:
      if (!this->windLast || (curTime - this->windLast) >= SOMFY_NO_WIND_REMOTE_TIMEOUT) {
        if(this->tiltType == tilt_types::tiltmotor) {
          if(repeat >= TILT_REPEATS)
            this->p_tiltTarget(100.0f);
          else
            this->p_target(100.0f);
        }
        else if(this->tiltType == tilt_types::tiltonly) {
          this->p_target(100.0f);
          this->p_currentPos(100.0f);
          this->p_tiltTarget(100.0f);
        }
        else {
            this->p_target(100.0f);
            if(this->tiltType != tilt_types::none) this->p_tiltTarget(100.0f);
        }
      }
      break;
    case somfy_commands::My:
      if(this->isIdle()) {
        DBG_PRINTF("Shade #%d is idle\n", this->getShadeId());
        if(this->simMy()) {
          this->moveToMyPosition();
        }
        else {
          if(this->myTiltPos >= 0.0f && this->myTiltPos <= 100.0f) this->p_tiltTarget(this->myTiltPos);
          if(this->myPos >= 0.0f && this->myPos <= 100.0f && this->tiltType != tilt_types::tiltonly) this->p_target(this->myPos);
        }
      }
      else {
        if(this->tiltType == tilt_types::tiltonly) {
          this->p_target(100.0f);
        }
        else this->p_target(this->currentPos);
        this->p_tiltTarget(this->currentTiltPos);
      }
      break;
    case somfy_commands::StepUp:
      // With the step commands and integrated shades
      // the motor must tilt in the direction first then move
      // so we have to calculate the target with this in mind.
      if(this->stepSize == 0) return; // Avoid divide by 0.
      if(this->tiltType == tilt_types::integrated) {
        // With integrated tilt this is more involved than ne would think because the step command can be moving not just the tilt
        // but the lift.  So a determination needs to be made as to whether we are currently moving and it should stop.
        // Conditions:
        // 1. If both the tilt and lift are at 0% do nothing
        // 2. If the tilt position is not currently at the top then shift the tilt.
        // 3. If the tilt position is not currently at the top then shift the lift.
        if(this->currentTiltPos <= 0.0f && this->currentPos <= 0.0f) return; // Do nothing
        else if(this->currentTiltPos > 0.0f) {
          // Set the tilt position.  This should stop the lift movement.
          this->p_target(this->currentPos);
          if(this->tiltTimeUp == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(max(0.0f, this->currentTiltPos - (100.0f/(static_cast<float>(this->tiltTimeUp/static_cast<float>(this->stepSize))))));
        }
        else {
          // We only have the lift to move.
          if(this->upTime == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(this->currentTiltPos);
          this->p_target(max(0.0f, this->currentPos - (100.0f/(static_cast<float>(this->upTime/static_cast<float>(this->stepSize))))));
        }
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        if(this->tiltTimeUp == 0 || this->currentTiltPos <= 0.0f) return;
        this->p_tiltTarget(max(0.0f, this->currentTiltPos - (100.0f/(static_cast<float>(this->tiltTimeUp/static_cast<float>(this->stepSize))))));
      }
      else if(this->currentPos > 0.0f) {
        if(this->upTime == 0) return;
        this->p_target(max(0.0f, this->currentPos - (100.0f/(static_cast<float>(this->upTime/static_cast<float>(this->stepSize))))));
      }
      break;
    case somfy_commands::StepDown:
      dir = 1;
      // With the step commands and integrated shades
      // the motor must tilt in the direction first then move
      // so we have to calculate the target with this in mind.
      if(this->stepSize == 0) return; // Avoid divide by 0.
      if(this->tiltType == tilt_types::integrated) {
        // With integrated tilt this is more involved than ne would think because the step command can be moving not just the tilt
        // but the lift.  So a determination needs to be made as to whether we are currently moving and it should stop.
        // Conditions:
        // 1. If both the tilt and lift are at 100% do nothing
        // 2. If the tilt position is not currently at the bottom then shift the tilt.
        // 3. If the tilt position is add the bottom then shift the lift.
        if(this->currentTiltPos >= 100.0f && this->currentPos >= 100.0f) return; // Do nothing
        else if(this->currentTiltPos < 100.0f) {
          // Set the tilt position.  This should stop the lift movement.
          this->p_target(this->currentPos);
          if(this->tiltTimeDown == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(min(100.0f, this->currentTiltPos + (100.0f/(static_cast<float>(this->tiltTimeDown/static_cast<float>(this->stepSize))))));
        }
        else {
          // We only have the lift to move.
          if(this->downTime == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(this->currentTiltPos);
          this->p_target(min(100.0f, this->currentPos + (100.0f/(static_cast<float>(this->downTime/static_cast<float>(this->stepSize))))));
        }
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        if(this->tiltTimeDown == 0 || this->stepSize == 0 || this->currentTiltPos >= 100.0f) return;
        this->p_tiltTarget(min(100.0f, this->currentTiltPos + (100.0f/(static_cast<float>(this->tiltTimeDown/static_cast<float>(this->stepSize))))));
      }
      else if(this->currentPos < 100.0f) {
        if(this->downTime == 0 || this->stepSize == 0) return;
        this->p_target(min(100.0f, this->currentPos + (100.0f/(static_cast<float>(this->downTime/static_cast<float>(this->stepSize))))));
      }
      break;
    case somfy_commands::Flag:
      this->p_sunFlag(false);
      if(this->hasSunSensor()) {
        somfy.isDirty = true;
        this->emitState();
      }
      else {
        DBG_PRINTF("Shade does not have sensor %d\n", this->flags);
      }
      break;    
    case somfy_commands::SunFlag:
      if(this->hasSunSensor()) {
        const bool isWindy = this->flags & static_cast<uint8_t>(somfy_flags_t::Windy);
        this->p_sunFlag(true);
        //this->flags |= static_cast<uint8_t>(somfy_flags_t::SunFlag);
        if (!isWindy)
        {
          const bool isSunny = this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny);
          if (isSunny && this->sunDone)
            this->p_target(this->myPos >= 0 ? this->myPos : 100.0f);
          else if (!isSunny && this->noSunDone)
            this->p_target(0.0f);
        }
        somfy.isDirty = true;
        this->emitState();
      }
      else
        DBG_PRINTF("Shade does not have sensor %d\n", this->flags);
      break;
    default:
      dir = 0;
      break;
  }
  this->setMovement(dir);
}
bool SomfyShade::save() {
  #ifdef USE_NVS
  if(somfy.useNVS()) {
    char shadeKey[15];
    snprintf(shadeKey, sizeof(shadeKey), "SomfyShade%u", this->getShadeId());
    pref.begin(shadeKey);
    pref.clear();
    pref.putChar("shadeType", static_cast<uint8_t>(this->shadeType));
    pref.putUInt("remoteAddress", this->getRemoteAddress());
    pref.putString("name", this->name);
    pref.putBool("hasTilt", this->tiltType != tilt_types::none);
    pref.putBool("paired", this->paired);
    pref.putUInt("upTime", this->upTime);
    pref.putUInt("downTime", this->downTime);
    pref.putUInt("tiltTimeUp", this->tiltTimeUp);
    pref.putUInt("tiltTimeDown", this->tiltTimeDown);
    pref.putFloat("currentPos", this->currentPos);
    pref.putFloat("currentTiltPos", this->currentTiltPos);
    pref.putUShort("myPos", this->myPos);
    uint32_t linkedAddresses[SOMFY_MAX_LINKED_REMOTES];
    memset(linkedAddresses, 0x00, sizeof(linkedAddresses));
    uint8_t j = 0;
    for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
      SomfyLinkedRemote lremote = this->linkedRemotes[i];
      if(lremote.getRemoteAddress() != 0) linkedAddresses[j++] = lremote.getRemoteAddress();
    }
    pref.remove("linkedAddr");
    pref.putBytes("linkedAddr", linkedAddresses, sizeof(uint32_t) * SOMFY_MAX_LINKED_REMOTES);
    pref.end();
  }
  #endif
  this->commit();
  this->publish();
  return true;
}
bool SomfyRoom::save() { somfy.commit(); return true; }
bool SomfyGroup::save() { somfy.commit(); return true; }
bool SomfyShade::isToggle() {
  switch(this->shadeType) {
    case shade_types::garage1:
    case shade_types::lgate1:
    case shade_types::cgate1:
    case shade_types::rgate1:
      return true;
    default:
      break;
  }
  return false;
}
bool SomfyShade::usesPin(uint8_t pin) {
  if(this->proto != radio_proto::GP_Remote && this->proto != radio_proto::GP_Relay) return false;
  if(this->gpioDown == pin) return true;
  else if(this->shadeType == shade_types::drycontact)
    return this->gpioDown == pin;
  else if(this->isToggle()) {
    if(this->proto == radio_proto::GP_Relay && this->gpioUp == pin) return true;    
  }
  else if(this->shadeType == shade_types::drycontact2) {
    if(this->proto == radio_proto::GP_Relay && (this->gpioUp == pin || this->gpioDown == pin)) return true;
  }
  else {
    if(this->gpioUp == pin) return true;
    else if(this->proto == radio_proto::GP_Remote && this->gpioMy == pin) return true;    
  }
  return false;
}
int8_t SomfyShade::validateJSON(JsonObject &obj) {
  int8_t ret = 0;
  shade_types type = this->shadeType;
  if(obj.containsKey("shadeType")) {
    if(obj["shadeType"].is<const char *>()) {
      if(strncmp(obj["shadeType"].as<const char *>(), "roller", 7) == 0)
        type = shade_types::roller;
      else if(strncmp(obj["shadeType"].as<const char *>(), "ldrapery", 9) == 0)
        type = shade_types::ldrapery;
      else if(strncmp(obj["shadeType"].as<const char *>(), "rdrapery", 9) == 0)
        type = shade_types::rdrapery;
      else if(strncmp(obj["shadeType"].as<const char *>(), "cdrapery", 9) == 0)
        type = shade_types::cdrapery;
      else if(strncmp(obj["shadeType"].as<const char *>(), "garage1", 7) == 0)
        type = shade_types::garage1;
      else if(strncmp(obj["shadeType"].as<const char *>(), "garage3", 7) == 0)
        type = shade_types::garage3;
      else if(strncmp(obj["shadeType"].as<const char *>(), "blind", 5) == 0)
        type = shade_types::blind;
      else if(strncmp(obj["shadeType"].as<const char *>(), "awning", 7) == 0)
        type = shade_types::awning;
      else if(strncmp(obj["shadeType"].as<const char *>(), "shutter", 8) == 0)
        type = shade_types::shutter;
      else if(strncmp(obj["shadeType"].as<const char *>(), "drycontact2", 12) == 0)
        type = shade_types::drycontact2;
      else if(strncmp(obj["shadeType"].as<const char *>(), "drycontact", 11) == 0)
        type = shade_types::drycontact;
    }
    else {
      this->shadeType = static_cast<shade_types>(obj["shadeType"].as<uint8_t>());
    }
  }
  if(obj.containsKey("proto")) {
    radio_proto proto = this->proto;
    if(proto == radio_proto::GP_Relay || proto == radio_proto::GP_Remote) {
      // Check to see if we are using the up and or down
      // GPIOs anywhere else.
      uint8_t upPin = obj.containsKey("gpioUp") ? obj["gpioUp"].as<uint8_t>() : this->gpioUp;
      uint8_t downPin = obj.containsKey("gpioDown") ? obj["gpioDown"].as<uint8_t>() : this->gpioDown;
      uint8_t myPin = obj.containsKey("gpioMy") ? obj["gpioMy"].as<uint8_t>() : this->gpioMy;
      if(type == shade_types::drycontact || 
        ((type == shade_types::garage1 || type == shade_types::lgate1 || type == shade_types::cgate1 || type == shade_types::rgate1) 
        && proto == radio_proto::GP_Remote)) upPin = myPin = 255;
      else if(type == shade_types::drycontact2) myPin = 255;
      if(proto == radio_proto::GP_Relay) myPin = 255;
      if(somfy.transceiver.config.enabled) {
        if((upPin != 255 && somfy.transceiver.usesPin(upPin)) ||
          (downPin != 255 && somfy.transceiver.usesPin(downPin)) ||
          (myPin != 255 && somfy.transceiver.usesPin(myPin)))
          ret = -10;
      }
      if(settings.connType == conn_types_t::ethernet || settings.connType == conn_types_t::ethernetpref) {
        if((upPin != 255 && settings.Ethernet.usesPin(upPin)) ||
          (downPin != 255 && somfy.transceiver.usesPin(downPin)) ||
          (myPin != 255 && somfy.transceiver.usesPin(myPin)))
          ret = -11;
      }
      if(ret == 0) {
        for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
          SomfyShade *shade = &somfy.shades[i];
          if(shade->getShadeId() == this->getShadeId() || shade->getShadeId() == 255) continue;
          if((upPin != 255 && shade->usesPin(upPin)) ||
            (downPin != 255 && shade->usesPin(downPin)) ||
            (myPin != 255 && shade->usesPin(myPin))){
            ret = -12;
            break;
          }
        }
      }
    }
  }
  return ret;
}
int8_t SomfyShade::fromJSON(JsonObject &obj) {
  int8_t err = this->validateJSON(obj);
  if(err == 0) {
    if(obj.containsKey("name")) strlcpy(this->name, obj["name"], sizeof(this->name));
    if(obj.containsKey("roomId")) this->roomId = obj["roomId"];
    if(obj.containsKey("upTime")) this->upTime = obj["upTime"];
    if(obj.containsKey("downTime")) this->downTime = obj["downTime"];
    if(obj.containsKey("remoteAddress")) this->setRemoteAddress(obj["remoteAddress"]);
    if(obj.containsKey("tiltTimeUp")) this->tiltTimeUp = obj["tiltTimeUp"];
    if(obj.containsKey("tiltTimeDown")) this->tiltTimeDown = obj["tiltTimeDown"];
    if(obj.containsKey("tiltFirstOnOpen")) this->tiltFirstOnOpen = obj["tiltFirstOnOpen"];
    if(obj.containsKey("tiltFirstOnClose")) this->tiltFirstOnClose = obj["tiltFirstOnClose"];
    if(obj.containsKey("stepSize")) this->stepSize = obj["stepSize"];
    if(obj.containsKey("hasTilt")) this->tiltType = static_cast<bool>(obj["hasTilt"]) ? tilt_types::none : tilt_types::tiltmotor;
    if(obj.containsKey("bitLength")) this->bitLength = obj["bitLength"];
    if(obj.containsKey("proto")) this->proto = static_cast<radio_proto>(obj["proto"].as<uint8_t>());
    if(obj.containsKey("sunSensor")) this->setSunSensor(obj["sunSensor"]);
    if(obj.containsKey("simMy")) this->setSimMy(obj["simMy"]);
    if(obj.containsKey("light")) this->setLight(obj["light"]);
    if(obj.containsKey("gpioFlags")) this->gpioFlags = obj["gpioFlags"];
    if(obj.containsKey("gpioLLTrigger")) {
      if(obj["gpioLLTrigger"].as<bool>())
        this->gpioFlags |= (uint8_t)gpio_flags_t::LowLevelTrigger;
      else
        this->gpioFlags &= ~(uint8_t)gpio_flags_t::LowLevelTrigger;
    }
    
    if(obj.containsKey("shadeType")) {
      if(obj["shadeType"].is<const char *>()) {
        if(strncmp(obj["shadeType"].as<const char *>(), "roller", 7) == 0)
          this->shadeType = shade_types::roller;
        else if(strncmp(obj["shadeType"].as<const char *>(), "ldrapery", 9) == 0)
          this->shadeType = shade_types::ldrapery;
        else if(strncmp(obj["shadeType"].as<const char *>(), "rdrapery", 9) == 0)
          this->shadeType = shade_types::rdrapery;
        else if(strncmp(obj["shadeType"].as<const char *>(), "cdrapery", 9) == 0)
          this->shadeType = shade_types::cdrapery;
        else if(strncmp(obj["shadeType"].as<const char *>(), "garage1", 7) == 0)
          this->shadeType = shade_types::garage1;
        else if(strncmp(obj["shadeType"].as<const char *>(), "garage3", 7) == 0)
          this->shadeType = shade_types::garage3;
        else if(strncmp(obj["shadeType"].as<const char *>(), "blind", 5) == 0)
          this->shadeType = shade_types::blind;
        else if(strncmp(obj["shadeType"].as<const char *>(), "awning", 7) == 0)
          this->shadeType = shade_types::awning;
        else if(strncmp(obj["shadeType"].as<const char *>(), "shutter", 8) == 0)
          this->shadeType = shade_types::shutter;
        else if(strncmp(obj["shadeType"].as<const char *>(), "drycontact2", 12) == 0)
          this->shadeType = shade_types::drycontact2;
        else if(strncmp(obj["shadeType"].as<const char *>(), "drycontact", 11) == 0)
          this->shadeType = shade_types::drycontact;
      }
      else {
        this->shadeType = static_cast<shade_types>(obj["shadeType"].as<uint8_t>());
      }
    }
    if(obj.containsKey("flipCommands")) this->flipCommands = obj["flipCommands"].as<bool>();
    if(obj.containsKey("ledFeedback")) this->ledFeedback = obj["ledFeedback"].as<bool>();
    if(obj.containsKey("flipPosition")) this->flipPosition = obj["flipPosition"].as<bool>();
    if(obj.containsKey("repeats")) this->repeats = obj["repeats"];
    if(obj.containsKey("tiltType")) {
      if(obj["tiltType"].is<const char *>()) {
        if(strncmp(obj["tiltType"].as<const char *>(), "none", 4) == 0)
          this->tiltType = tilt_types::none;
        else if(strncmp(obj["tiltType"].as<const char *>(), "tiltmotor", 9) == 0)
          this->tiltType = tilt_types::tiltmotor;
        else if(strncmp(obj["tiltType"].as<const char *>(), "integ", 5) == 0)
          this->tiltType = tilt_types::integrated;
        else if(strncmp(obj["tiltType"].as<const char *>(), "tiltonly", 8) == 0)
          this->tiltType = tilt_types::tiltonly;
      }
      else {
        this->tiltType = static_cast<tilt_types>(obj["tiltType"].as<uint8_t>());
      }
    }
    if(obj.containsKey("linkedAddresses")) {
      uint32_t linkedAddresses[SOMFY_MAX_LINKED_REMOTES];
      memset(linkedAddresses, 0x00, sizeof(linkedAddresses));
      JsonArray arr = obj["linkedAddresses"];
      uint8_t i = 0;
      for(uint32_t addr : arr) {
        linkedAddresses[i++] = addr;
      }
      for(uint8_t j = 0; j < SOMFY_MAX_LINKED_REMOTES; j++) {
        this->linkedRemotes[j].setRemoteAddress(linkedAddresses[j]);
      }
    }
    if(obj.containsKey("flags")) this->flags = obj["flags"];
    if(this->proto == radio_proto::GP_Remote || this->proto == radio_proto::GP_Relay) {
      if(obj.containsKey("gpioUp")) this->gpioUp = obj["gpioUp"];
      if(obj.containsKey("gpioDown")) this->gpioDown = obj["gpioDown"];
      pinMode(this->gpioUp, OUTPUT);
      pinMode(this->gpioDown, OUTPUT);
    }
    if(this->proto == radio_proto::GP_Remote) {
      if(obj.containsKey("gpioMy")) this->gpioMy = obj["gpioMy"];
      pinMode(this->gpioMy, OUTPUT);
    }
  }
  return err;
}
void SomfyShade::toJSONRef(JsonFormatter &json) {
  json.addElem("shadeId", this->getShadeId());
  json.addElem("roomId", this->roomId);
  json.addElem("name", this->name);
  json.addElem("remoteAddress", (uint32_t)this->m_remoteAddress);
  json.addElem("paired", this->paired);
  json.addElem("shadeType", static_cast<uint8_t>(this->shadeType));
  json.addElem("flipCommands", this->flipCommands);
  json.addElem("flipPosition", this->flipCommands);
  json.addElem("bitLength", this->bitLength);
  json.addElem("proto", static_cast<uint8_t>(this->proto));
  json.addElem("flags", this->flags);
  json.addElem("sunSensor", this->hasSunSensor());
  json.addElem("hasLight", this->hasLight());
  json.addElem("repeats", this->repeats);
  //SomfyRemote::toJSON(json);
}

void SomfyShade::toJSON(JsonFormatter &json) {
  json.addElem("shadeId", this->getShadeId());
  json.addElem("roomId", this->roomId);
  json.addElem("name", this->name);
  json.addElem("remoteAddress", (uint32_t)this->m_remoteAddress);
  json.addElem("upTime", (uint32_t)this->upTime);
  json.addElem("downTime", (uint32_t)this->downTime);
  json.addElem("paired", this->paired);
  json.addElem("lastRollingCode", (uint32_t)this->lastRollingCode);
  json.addElem("position", this->transformPosition(this->currentPos));
  json.addElem("tiltType", static_cast<uint8_t>(this->tiltType));
  json.addElem("tiltPosition", this->transformPosition(this->currentTiltPos));
  json.addElem("tiltDirection", this->tiltDirection);
  json.addElem("tiltTimeUp", (uint32_t)this->tiltTimeUp);
  json.addElem("tiltTimeDown", (uint32_t)this->tiltTimeDown);
  json.addElem("tiltFirstOnOpen", this->tiltFirstOnOpen);
  json.addElem("tiltFirstOnClose", this->tiltFirstOnClose);
  json.addElem("stepSize", (uint32_t)this->stepSize);
  json.addElem("tiltTarget", this->transformPosition(this->tiltTarget));
  json.addElem("target", this->transformPosition(this->target));
  json.addElem("myPos", this->transformPosition(this->myPos));
  json.addElem("myTiltPos", this->transformPosition(this->myTiltPos));
  json.addElem("direction", this->direction);
  json.addElem("shadeType", static_cast<uint8_t>(this->shadeType));
  json.addElem("bitLength", this->bitLength);
  json.addElem("proto", static_cast<uint8_t>(this->proto));
  json.addElem("flags", this->flags);
  json.addElem("flipCommands", this->flipCommands);
  json.addElem("ledFeedback", this->ledFeedback);
  json.addElem("flipPosition", this->flipPosition);
  json.addElem("inGroup", this->isInGroup());
  json.addElem("sunSensor", this->hasSunSensor());
  json.addElem("light", this->hasLight());
  json.addElem("repeats", this->repeats);
  json.addElem("sortOrder", this->sortOrder);  
  json.addElem("gpioUp", this->gpioUp);
  json.addElem("gpioDown", this->gpioDown);
  json.addElem("gpioMy", this->gpioMy);
  json.addElem("gpioLLTrigger", ((this->gpioFlags & (uint8_t)gpio_flags_t::LowLevelTrigger) == 0) ? false : true);
  json.addElem("simMy", this->simMy());
  json.beginArray("linkedRemotes");
  for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
    SomfyLinkedRemote &lremote = this->linkedRemotes[i];
    if(lremote.getRemoteAddress() != 0) {
      json.beginObject();
      lremote.toJSON(json);
      json.endObject();
    }
  }
  json.endArray();
}

/*
bool SomfyShade::toJSON(JsonObject &obj) {
  //Serial.print("Serializing Shade:");
  //Serial.print(this->getShadeId());
  //Serial.print("  ");
  //Serial.println(this->name);
  obj["shadeId"] = this->getShadeId();
  obj["roomId"] = this->roomId;
  obj["name"] = this->name;
  obj["remoteAddress"] = this->m_remoteAddress;
  obj["upTime"] = this->upTime;
  obj["downTime"] = this->downTime;
  obj["paired"] = this->paired;
  //obj["remotePrefId"] = this->getRemotePrefId();
  obj["lastRollingCode"] = this->lastRollingCode;
  obj["position"] = this->transformPosition(this->currentPos);
  obj["tiltPosition"] = this->transformPosition(this->currentTiltPos);
  obj["tiltDirection"] = this->tiltDirection;
  obj["tiltTimeUp"] = this->tiltTimeUp;
  obj["tiltTimeDown"] = this->tiltTimeDown;
  obj["stepSize"] = this->stepSize;
  obj["tiltTarget"] = this->transformPosition(this->tiltTarget);
  obj["target"] = this->transformPosition(this->target);
  obj["myPos"] = this->transformPosition(this->myPos);
  obj["myTiltPos"] = this->transformPosition(this->myTiltPos);
  obj["direction"] = this->direction;
  obj["tiltType"] = static_cast<uint8_t>(this->tiltType);
  obj["tiltTimeUp"] = this->tiltTimeUp;
  obj["tiltTimeDown"] = this->tiltTimeDown;
  obj["shadeType"] = static_cast<uint8_t>(this->shadeType);
  obj["bitLength"] = this->bitLength;
  obj["proto"] = static_cast<uint8_t>(this->proto);
  obj["flags"] = this->flags;
  obj["flipCommands"] = this->flipCommands;
  obj["ledFeedback"] = this->ledFeedback;
  obj["flipPosition"] = this->flipPosition;
  obj["inGroup"] = this->isInGroup();
  obj["sunSensor"] = this->hasSunSensor();
  obj["light"] = this->hasLight();
  obj["repeats"] = this->repeats;
  obj["sortOrder"] = this->sortOrder;  
  obj["gpioUp"] = this->gpioUp;
  obj["gpioDown"] = this->gpioDown;
  obj["gpioMy"] = this->gpioMy;
  obj["gpioLLTrigger"] = ((this->gpioFlags & (uint8_t)gpio_flags_t::LowLevelTrigger) == 0) ? false : true;
  SomfyRemote::toJSON(obj);
  JsonArray arr = obj.createNestedArray("linkedRemotes");
  for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
    SomfyLinkedRemote &lremote = this->linkedRemotes[i];
    if(lremote.getRemoteAddress() != 0) {
      JsonObject lro = arr.createNestedObject();
      lremote.toJSON(lro);
    }
  }
  return true;
}
*/
bool SomfyRoom::fromJSON(JsonObject &obj) {
  if(obj.containsKey("name")) strlcpy(this->name, obj["name"], sizeof(this->name));
  if(obj.containsKey("sortOrder")) this->sortOrder = obj["sortOrder"];
  return true;
}
/*
bool SomfyRoom::toJSON(JsonObject &obj) {
  obj["roomId"] = this->roomId;
  obj["name"] = this->name;
  obj["sortOrder"] = this->sortOrder;
  return true;
}
*/
void SomfyRoom::toJSON(JsonFormatter &json) {
  json.addElem("roomId", this->roomId);
  json.addElem("name", this->name);
  json.addElem("sortOrder", this->sortOrder);
}

bool SomfyGroup::fromJSON(JsonObject &obj) {
  if(obj.containsKey("name")) strlcpy(this->name, obj["name"], sizeof(this->name));
  if(obj.containsKey("roomId")) this->roomId = obj["roomId"];
  if(obj.containsKey("remoteAddress")) this->setRemoteAddress(obj["remoteAddress"]);
  if(obj.containsKey("bitLength")) this->bitLength = obj["bitLength"];
  if(obj.containsKey("proto")) this->proto = static_cast<radio_proto>(obj["proto"].as<uint8_t>());
  if(obj.containsKey("flipCommands")) this->flipCommands = obj["flipCommands"].as<bool>();
  if(obj.containsKey("ledFeedback")) this->ledFeedback = obj["ledFeedback"].as<bool>();
  
  //if(obj.containsKey("sunSensor")) this->hasSunSensor() = obj["sunSensor"];  This is calculated
  if(obj.containsKey("repeats")) this->repeats = obj["repeats"];
  if(obj.containsKey("linkedShades")) {
    uint8_t linkedShades[SOMFY_MAX_GROUPED_SHADES];
    memset(linkedShades, 0x00, sizeof(linkedShades));
    JsonArray arr = obj["linkedShades"];
    uint8_t i = 0;
    for(uint8_t shadeId : arr) {
      linkedShades[i++] = shadeId;
    }
  }
  return true;
}
void SomfyGroup::toJSON(JsonFormatter &json) {
  this->updateFlags();
  json.addElem("groupId", this->getGroupId());
  json.addElem("roomId", this->roomId);
  json.addElem("name", this->name);
  json.addElem("remoteAddress", (uint32_t)this->m_remoteAddress);
  json.addElem("lastRollingCode", (uint32_t)this->lastRollingCode);
  json.addElem("bitLength", this->bitLength);
  json.addElem("proto", static_cast<uint8_t>(this->proto));
  json.addElem("sunSensor", this->hasSunSensor());
  json.addElem("flipCommands", this->flipCommands);
  json.addElem("ledFeedback", this->ledFeedback);
  json.addElem("flags", this->flags);
  json.addElem("repeats", this->repeats);
  json.addElem("sortOrder", this->sortOrder);
  json.beginArray("linkedShades");
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    uint8_t shadeId = this->linkedShades[i];
    if(shadeId > 0 && shadeId < 255) {
      SomfyShade *shade = somfy.getShadeById(shadeId);
      if(shade) {
        json.beginObject();
        shade->toJSONRef(json);
        json.endObject();
      }
    }
  }
  json.endArray();
}
void SomfyGroup::toJSONRef(JsonFormatter &json) {
  this->updateFlags();
  json.addElem("groupId", this->getGroupId());
  json.addElem("roomId", this->roomId);
  json.addElem("name", this->name);
  json.addElem("remoteAddress", (uint32_t)this->m_remoteAddress);
  json.addElem("lastRollingCode", (uint32_t)this->lastRollingCode);
  json.addElem("bitLength", this->bitLength);
  json.addElem("proto", static_cast<uint8_t>(this->proto));
  json.addElem("sunSensor", this->hasSunSensor());
  json.addElem("flipCommands", this->flipCommands);
  json.addElem("flags", this->flags);
  json.addElem("repeats", this->repeats);
  json.addElem("sortOrder", this->sortOrder);
}

/*
bool SomfyGroup::toJSON(JsonObject &obj) {
  this->updateFlags();
  obj["groupId"] = this->getGroupId();
  obj["roomId"] = this->roomId;
  obj["name"] = this->name;
  obj["remoteAddress"] = this->m_remoteAddress;
  obj["lastRollingCode"] = this->lastRollingCode;
  obj["bitLength"] = this->bitLength;
  obj["proto"] = static_cast<uint8_t>(this->proto);
  obj["sunSensor"] = this->hasSunSensor();
  obj["flipCommands"] = this->flipCommands;
  obj["ledFeedback"] = this->ledFeedback;
  obj["flags"] = this->flags;
  obj["repeats"] = this->repeats;
  obj["sortOrder"] = this->sortOrder;
  SomfyRemote::toJSON(obj);
  JsonArray arr = obj.createNestedArray("linkedShades");
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    uint8_t shadeId = this->linkedShades[i];
    if(shadeId > 0 && shadeId < 255) {
      SomfyShade *shade = somfy.getShadeById(shadeId);
      if(shade) {
        JsonObject lsd = arr.createNestedObject();
        shade->toJSONRef(lsd);
      }
    }
  }
  return true;
}
*/

void SomfyRemote::toJSON(JsonFormatter &json) {
  json.addElem("remoteAddress", (uint32_t)this->getRemoteAddress());
  json.addElem("lastRollingCode", (uint32_t)this->lastRollingCode);
}
/*
bool SomfyRemote::toJSON(JsonObject &obj) {
  //obj["remotePrefId"] = this->getRemotePrefId();
  obj["remoteAddress"] = this->getRemoteAddress();
  obj["lastRollingCode"] = this->lastRollingCode;
  return true;  
}
*/
void SomfyRemote::setRemoteAddress(uint32_t address) { this->m_remoteAddress = address; snprintf(this->m_remotePrefId, sizeof(this->m_remotePrefId), "_%lu", (unsigned long)this->m_remoteAddress); }
uint32_t SomfyRemote::getRemoteAddress() { return this->m_remoteAddress; }
void SomfyShadeController::processFrame(somfy_frame_t &frame, bool internal) {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    if(this->shades[i].getShadeId() != 255) this->shades[i].processFrame(frame, internal);
  }
}
void SomfyShadeController::processWaitingFrame() {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++)
    if(this->shades[i].getShadeId() != 255) this->shades[i].processWaitingFrame();
}
void SomfyShadeController::emitState(uint8_t num) {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade *shade = &this->shades[i];
    if(shade->getShadeId() == 255) continue;
    shade->emitState(num);
  }
}
void SomfyShadeController::publish() {
  this->updateGroupFlags();
  char arrIds[128] = "[";
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade *shade = &this->shades[i];
    if(shade->getShadeId() == 255) continue;
    if(strlen(arrIds) > 1) strcat(arrIds, ",");
    itoa(shade->getShadeId(), &arrIds[strlen(arrIds)], 10);
    shade->publish();
  }
  strcat(arrIds, "]");
  mqtt.publish("shades", arrIds, true);
  for(uint8_t i = 1; i <= SOMFY_MAX_SHADES; i++) {
    SomfyShade *shade = this->getShadeById(i);
    if(shade) continue;
    else {
      SomfyShade::unpublish(i);
    }
  }
  strcpy(arrIds, "[");
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup *group = &this->groups[i];
    if(group->getGroupId() == 255) continue;
    if(strlen(arrIds) > 1) strcat(arrIds, ",");
    itoa(group->getGroupId(), &arrIds[strlen(arrIds)], 10);
    group->publish();
  }
  strcat(arrIds, "]");
  mqtt.publish("groups", arrIds, true);
  for(uint8_t i = 1; i <= SOMFY_MAX_GROUPS; i++) {
    SomfyGroup *group = this->getGroupById(i);
    if(group) continue;
    else SomfyGroup::unpublish(i);
  }
}
uint8_t SomfyShadeController::getNextShadeId() {
  // There is no shortcut for this since the deletion of
  // a shade in the middle makes all of this very difficult.
  for(uint8_t i = 1; i < SOMFY_MAX_SHADES - 1; i++) {
    bool id_exists = false;
    for(uint8_t j = 0; j < SOMFY_MAX_SHADES; j++) {
      SomfyShade *shade = &this->shades[j];
      if(shade->getShadeId() == i) {
        id_exists = true;
        break;
      }
    }
    if(!id_exists) {
      DBG_PRINT("Got next Shade Id:");
      DBG_PRINT(i);
      return i;
    }
  }
  return 255;
}
int8_t SomfyShadeController::getMaxShadeOrder() {
  int8_t order = -1;
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade *shade = &this->shades[i];
    if(shade->getShadeId() == 255) continue;
    if(order < shade->sortOrder) order = shade->sortOrder;
  }
  return order;
}
int8_t SomfyShadeController::getMaxGroupOrder() {
  int8_t order = -1;
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup *group = &this->groups[i];
    if(group->getGroupId() == 255) continue;
    if(order < group->sortOrder) order = group->sortOrder;
  }
  return order;
}
uint8_t SomfyShadeController::getNextGroupId() {
  // There is no shortcut for this since the deletion of
  // a group in the middle makes all of this very difficult.
  for(uint8_t i = 1; i < SOMFY_MAX_GROUPS - 1; i++) {
    bool id_exists = false;
    for(uint8_t j = 0; j < SOMFY_MAX_GROUPS; j++) {
      SomfyGroup *group = &this->groups[j];
      if(group->getGroupId() == i) {
        id_exists = true;
        break;
      }
    }
    if(!id_exists) {
      DBG_PRINT("Got next Group Id:");
      DBG_PRINT(i);
      return i;
    }
  }
  return 255;
}
uint8_t SomfyShadeController::getNextRoomId() {
  // There is no shortcut for this since the deletion of
  // a room in the middle makes all of this very difficult.
  for(uint8_t i = 1; i < SOMFY_MAX_ROOMS - 1; i++) {
    bool id_exists = false;
    for(uint8_t j = 0; j < SOMFY_MAX_ROOMS; j++) {
      SomfyRoom *room = &this->rooms[j];
      if(room->roomId == i) {
        id_exists = true;
        break;
      }
    }
    if(!id_exists) {
      DBG_PRINT("Got next room Id:");
      DBG_PRINT(i);
      return i;
    }
  }
  return 0;
}
int8_t SomfyShadeController::getMaxRoomOrder() {
  int8_t order = -1;
  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    SomfyRoom *room = &this->rooms[i];
    if(room->roomId == 0) continue;
    if(order < room->sortOrder) order = room->sortOrder;
  }
  return order;
}
uint8_t SomfyShadeController::repeaterCount() {
  uint8_t count = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++) {
    if(this->repeaters[i] != 0) count++;
  }
  return count;
}
uint8_t SomfyShadeController::roomCount() {
  uint8_t count = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    if(this->rooms[i].roomId != 0) count++;
  }
  return count;
}
uint8_t SomfyShadeController::shadeCount() {
  uint8_t count = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    if(this->shades[i].getShadeId() != 255) count++;
  }
  return count;
}
uint8_t SomfyShadeController::groupCount() {
  uint8_t count = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    if(this->groups[i].getGroupId() != 255) count++;
  }
  return count;
}
uint32_t SomfyShadeController::getNextRemoteAddress(uint8_t id) {
  uint32_t address = this->startingAddress + id;
  uint8_t i = 0;
  // The assumption here is that the max number of groups will
  // always be less than or equal to the max number of shades.
  while(i < SOMFY_MAX_SHADES) {
    if((i < SOMFY_MAX_SHADES && this->shades[i].getShadeId() != 255 && this->shades[i].getRemoteAddress() == address) ||
      (i < SOMFY_MAX_GROUPS && this->groups[i].getGroupId() != 255 && this->groups[i].getRemoteAddress() == address)) {
      address++;
      i = 0; // Start over we cannot share addresses.
    }
    else i++;
  }
  i = 0;
  return address;
}
SomfyShade *SomfyShadeController::addShade(JsonObject &obj) {
  SomfyShade *shade = this->addShade();
  if(shade) {
    shade->fromJSON(obj);
    shade->save();
    shade->emitState("shadeAdded");
  }
  return shade;
}
SomfyShade *SomfyShadeController::addShade() {
  uint8_t shadeId = this->getNextShadeId();
  // So the next shade id will be the first one we run into with an id of 255 so
  // if it gets deleted in the middle then it will get the first slot that is empty.
  // There is no apparent way around this.  In the future we might actually add an indexer
  // to it for sorting later.  The time has come so the sort order is set below.
  if(shadeId == 255) return nullptr;
  SomfyShade *shade = &this->shades[shadeId - 1];
  if(shade) {
    shade->setShadeId(shadeId);
    shade->sortOrder = this->getMaxShadeOrder() + 1;
    DBG_PRINTF("Sort order set to %d\n", shade->sortOrder);
    this->isDirty = true;
    #ifdef USE_NVS
    if(this->useNVS()) {
      for(uint8_t i = 0; i < sizeof(this->m_shadeIds); i++) {
        this->m_shadeIds[i] = this->shades[i].getShadeId();
      }
      sortArray<uint8_t>(this->m_shadeIds, sizeof(this->m_shadeIds));
      uint8_t id = 0;
      // This little diddy is about a bug I had previously that left duplicates in the
      // sorted array.  So we will walk the sorted array until we hit a duplicate where the previous
      // value == the current value.  Set it to 255 then sort the array again.
      // 1,1,2,2,3,3,255...
      bool hadDups = false;
      for(uint8_t i = 0; i < sizeof(this->m_shadeIds); i++) {
        if(this->m_shadeIds[i] == 255) break;
        if(id == this->m_shadeIds[i]) {
          id = this->m_shadeIds[i];
          this->m_shadeIds[i] = 255;
          hadDups = true;
        }
        else {
          id = this->m_shadeIds[i];
        }
      }
      if(hadDups) sortArray<uint8_t>(this->m_shadeIds, sizeof(this->m_shadeIds));
      pref.begin("Shades");
      pref.remove("shadeIds");
      int x = pref.putBytes("shadeIds", this->m_shadeIds, sizeof(this->m_shadeIds));
      Serial.printf("WROTE %d bytes to shadeIds\n", x);
      pref.end();
      for(uint8_t i = 0; i < sizeof(this->m_shadeIds); i++) {
        if(i != 0) Serial.print(",");
        else Serial.print("Shade Ids: ");
        Serial.print(this->m_shadeIds[i]);
      }
      Serial.println();
      pref.begin("Shades");
      pref.getBytes("shadeIds", this->m_shadeIds, sizeof(this->m_shadeIds));
      Serial.print("LENGTH:");
      Serial.println(pref.getBytesLength("shadeIds"));
      pref.end();
      for(uint8_t i = 0; i < sizeof(this->m_shadeIds); i++) {
        if(i != 0) Serial.print(",");
        else Serial.print("Shade Ids: ");
        Serial.print(this->m_shadeIds[i]);
      }
      Serial.println();
    }
    #endif
  }
  return shade;
}
bool SomfyShadeController::unlinkRepeater(uint32_t address) {
  for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++) {
    if(this->repeaters[i] == address) this->repeaters[i] = 0;
  }
  this->compressRepeaters();
  this->isDirty = true;
  return true;  
}
bool SomfyShadeController::linkRepeater(uint32_t address) {
  bool bSet = false;
  for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++) {
    if(!bSet && this->repeaters[i] == address) bSet = true;
    else if(bSet && this->repeaters[i] == address) this->repeaters[i] = 0;
  }
  if(!bSet) {
    for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++) {
      if(this->repeaters[i] == 0) {
        this->repeaters[i] = address;
        return true;
      }
    }
  }
  return true;
}
SomfyRoom *SomfyShadeController::addRoom(JsonObject &obj) {
  SomfyRoom *room = this->addRoom();
  if(room) {
    room->fromJSON(obj);
    room->save();
    room->emitState("roomAdded");
  }
  return room;
}
SomfyRoom *SomfyShadeController::addRoom() {
  uint8_t roomId = this->getNextRoomId();
  // So the next room id will be the first one we run into with an id of 0 so
  if(roomId == 0) return nullptr;
  SomfyRoom *room = &this->rooms[roomId - 1];
  if(room) {
    room->roomId = roomId;
    room->sortOrder = this->getMaxRoomOrder() + 1;
    this->isDirty = true;
  }
  return room;
}

SomfyGroup *SomfyShadeController::addGroup(JsonObject &obj) {
  SomfyGroup *group = this->addGroup();
  if(group) {
    group->fromJSON(obj);
    group->save();
    group->emitState("groupAdded");
  }
  return group;
}
SomfyGroup *SomfyShadeController::addGroup() {
  uint8_t groupId = this->getNextGroupId();
  // So the next shade id will be the first one we run into with an id of 255 so
  // if it gets deleted in the middle then it will get the first slot that is empty.
  // There is no apparent way around this.  In the future we might actually add an indexer
  // to it for sorting later.
  if(groupId == 255) return nullptr;
  SomfyGroup *group = &this->groups[groupId - 1];
  if(group) {
    group->setGroupId(groupId);
    group->sortOrder = this->getMaxGroupOrder() + 1;
    this->isDirty = true;
  }
  return group;
}
somfy_commands SomfyRemote::transformCommand(somfy_commands cmd) {
  if(this->flipCommands) {
    switch(cmd) {
      case somfy_commands::Up:
        return somfy_commands::Down;
      case somfy_commands::MyUp:
        return somfy_commands::MyDown;
      case somfy_commands::Down:
        return somfy_commands::Up;
      case somfy_commands::MyDown:
        return somfy_commands::MyUp;
      case somfy_commands::StepUp:
        return somfy_commands::StepDown;
      case somfy_commands::StepDown:
        return somfy_commands::StepUp;
      default:
        break;
    }
  }
  return cmd;
}
void SomfyRemote::sendSensorCommand(int8_t isWindy, int8_t isSunny, uint8_t repeat) {
  uint8_t flags = (this->flags >> 4) & 0x0F;
  if(isWindy > 0) flags |= 0x01;
  if(isSunny > 0) flags |= 0x02;
  if(isWindy == 0) flags &= ~0x01;
  if(isSunny == 0) flags &= ~0x02;

  // Now ship this off as an 80 bit command.
  this->lastFrame.remoteAddress = this->getRemoteAddress();
  this->lastFrame.repeats = repeat;
  this->lastFrame.bitLength = this->bitLength;
  this->lastFrame.rollingCode = (uint16_t)flags;
  this->lastFrame.encKey = 160; // Sensor commands are always encryption code 160.
  this->lastFrame.cmd = somfy_commands::Sensor;
  this->lastFrame.processed = false;
  DBG_PRINT("CMD:");
  DBG_PRINT(translateSomfyCommand(this->lastFrame.cmd));
  DBG_PRINT(" ADDR:");
  DBG_PRINT(this->lastFrame.remoteAddress);
  DBG_PRINT(" RCODE:");
  DBG_PRINT(this->lastFrame.rollingCode);
  DBG_PRINT(" REPEAT:");
  DBG_PRINTLN(repeat);
  somfy.sendFrame(this->lastFrame, repeat);
  somfy.processFrame(this->lastFrame, true);
}
void SomfyRemote::sendCommand(somfy_commands cmd) { this->sendCommand(cmd, this->repeats); }
void SomfyRemote::sendCommand(somfy_commands cmd, uint8_t repeat, uint8_t stepSize) {
  this->lastFrame.rollingCode = this->getNextRollingCode();
  this->lastFrame.remoteAddress = this->getRemoteAddress();
  this->lastFrame.cmd = this->transformCommand(cmd);
  this->lastFrame.repeats = repeat;
  this->lastFrame.bitLength = this->bitLength;
  this->lastFrame.stepSize = stepSize;
  this->lastFrame.valid = true;
  // Match the encKey to the rolling code.  These keys range from 160 to 175.
  this->lastFrame.encKey = 0xA0 | static_cast<uint8_t>(this->lastFrame.rollingCode & 0x000F);
  this->lastFrame.proto = this->proto;
  if(this->lastFrame.bitLength == 0) this->lastFrame.bitLength = bit_length;
  if(this->lastFrame.rollingCode == 0) DBG_PRINTLN("ERROR: Setting rcode to 0");
  this->p_lastRollingCode(this->lastFrame.rollingCode);
  // We have to set the processed to clear this if we are sending
  // another command.
  this->lastFrame.processed = false;
  if(this->proto == radio_proto::GP_Relay) {
    DBG_PRINT("CMD:");
    DBG_PRINT(translateSomfyCommand(this->lastFrame.cmd));
    DBG_PRINT(" ADDR:");
    DBG_PRINT(this->lastFrame.remoteAddress);
    DBG_PRINT(" RCODE:");
    DBG_PRINT(this->lastFrame.rollingCode);
    DBG_PRINTLN(" SETTING GPIO");
  }
  else if(this->proto == radio_proto::GP_Remote) {
    DBG_PRINT("CMD:");
    DBG_PRINT(translateSomfyCommand(this->lastFrame.cmd));
    DBG_PRINT(" ADDR:");
    DBG_PRINT(this->lastFrame.remoteAddress);
    DBG_PRINT(" RCODE:");
    DBG_PRINT(this->lastFrame.rollingCode);
    DBG_PRINTLN(" TRIGGER GPIO");
    this->triggerGPIOs(this->lastFrame);
  }
  else {
    DBG_PRINT("CMD:");
    DBG_PRINT(translateSomfyCommand(this->lastFrame.cmd));
    DBG_PRINT(" ADDR:");
    DBG_PRINT(this->lastFrame.remoteAddress);
    DBG_PRINT(" RCODE:");
    DBG_PRINT(this->lastFrame.rollingCode);
    DBG_PRINT(" REPEAT:");
    DBG_PRINTLN(repeat);
    somfy.sendFrame(this->lastFrame, repeat);
  }
  somfy.processFrame(this->lastFrame, true);
}
bool SomfyRemote::isLastCommand(somfy_commands cmd) {
  if(this->lastFrame.cmd != cmd || this->lastFrame.rollingCode != this->lastRollingCode) {
    DBG_PRINTF("Not the last command %d: %d - %d\n", static_cast<uint8_t>(this->lastFrame.cmd), this->lastFrame.rollingCode, this->lastRollingCode);
    return false;
  }
  return true;
}
void SomfyRemote::repeatFrame(uint8_t repeat) {
  if(this->proto == radio_proto::GP_Relay)
    return;
  else if(this->proto == radio_proto::GP_Remote) {
    this->triggerGPIOs(this->lastFrame);
    return;
  }
  somfy.transceiver.beginTransmit();
  byte frm[10];
  this->lastFrame.encodeFrame(frm);
  this->lastFrame.repeats++;
  somfy.transceiver.sendFrame(frm, this->bitLength == 56 ? 2 : 12, this->bitLength);
  for(uint8_t i = 0; i < repeat; i++) {
    this->lastFrame.repeats++;
    if(this->lastFrame.bitLength == 80) this->lastFrame.encode80BitFrame(&frm[0], this->lastFrame.repeats);
    somfy.transceiver.sendFrame(frm, this->bitLength == 56 ? 7 : 6, this->bitLength);
    esp_task_wdt_reset();
  }
  somfy.transceiver.endTransmit();
  //somfy.processFrame(this->lastFrame, true);
}
void SomfyShadeController::sendFrame(somfy_frame_t &frame, uint8_t repeat) {
  somfy.transceiver.beginTransmit();
  byte frm[10];
  frame.encodeFrame(frm);
  this->transceiver.sendFrame(frm, frame.bitLength == 56 ? 2 : 12, frame.bitLength);
  for(uint8_t i = 0; i < repeat; i++) {
    // For each 80-bit frame we need to adjust the byte encoding for the
    // silence.
    if(frame.bitLength == 80) frame.encode80BitFrame(&frm[0], i + 1);
    this->transceiver.sendFrame(frm, frame.bitLength == 56 ? 7 : 6, frame.bitLength);
    esp_task_wdt_reset();
  }
  this->transceiver.endTransmit();
}
bool SomfyShadeController::deleteShade(uint8_t shadeId) {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    if(this->shades[i].getShadeId() == shadeId) {
      shades[i].emitState("shadeRemoved");
      shades[i].unpublish();
      this->shades[i].clear();
    }
  }
  // Garde-fou : purge toute référence orpheline vers ce volet dans les groupes.
  // Sans ça, un groupe qui référence encore cet id planterait au prochain
  // getShadeById() renvoyant nullptr (envoi de commande, emitState, etc.).
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    if(this->groups[i].getGroupId() != 255 && this->groups[i].hasShadeId(shadeId)) {
      this->groups[i].unlinkShade(shadeId);
      this->groups[i].emitState();
    }
  }
  #ifdef USE_NVS
  if(this->useNVS()) {
    for(uint8_t i = 0; i < sizeof(this->m_shadeIds) - 1; i++) {
      if(this->m_shadeIds[i] == shadeId) {
        this->m_shadeIds[i] = 255;
      }
    }
    
    //qsort(this->m_shadeIds, sizeof(this->m_shadeIds)/sizeof(this->m_shadeIds[0]), sizeof(this->m_shadeIds[0]), sort_asc);
    sortArray<uint8_t>(this->m_shadeIds, sizeof(this->m_shadeIds));
    
    pref.begin("Shades");
    pref.putBytes("shadeIds", this->m_shadeIds, sizeof(this->m_shadeIds));
    pref.end();
  }
  #endif
  this->commit();
  return true;
}
bool SomfyShadeController::deleteRoom(uint8_t roomId) {
  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    if(this->rooms[i].roomId == roomId) {
      rooms[i].unpublish();
      for(uint8_t j = 0; j < SOMFY_MAX_SHADES; j++) {
        if(shades[j].roomId == roomId) {
          shades[j].roomId = 0;
          shades[j].emitState();
        }
      }
      for(uint8_t j = 0; j < SOMFY_MAX_GROUPS; j++) {
        if(groups[j].roomId == roomId) {
          groups[j].roomId = 0;
          groups[j].emitState();
        }
      }
      rooms[i].emitState("roomRemoved");
      this->rooms[i].clear();
    }
  }
  this->commit();
  return true;
}

bool SomfyShadeController::deleteGroup(uint8_t groupId) {
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    if(this->groups[i].getGroupId() == groupId) {
      groups[i].emitState("groupRemoved");
      groups[i].unpublish();
      this->groups[i].clear();
    }
  }
  this->commit();
  return true;
}

bool SomfyShadeController::loadShadesFile(const char *filename) { return ShadeConfigFile::load(this, filename); }
uint16_t SomfyRemote::getNextRollingCode() {
  pref.begin("ShadeCodes");
  uint16_t code = pref.getUShort(this->m_remotePrefId, 0);
  code++;
  pref.putUShort(this->m_remotePrefId, code);
  pref.end();
  this->p_lastRollingCode(code);
  //Serial.printf("Getting Next Rolling code %d\n", this->lastRollingCode);
  return code;
}
uint16_t SomfyRemote::p_lastRollingCode(uint16_t code) { 
  uint16_t old = this->lastRollingCode;
  this->lastRollingCode = code; 
  return old;
}
uint16_t SomfyRemote::setRollingCode(uint16_t code) {
  if(this->lastRollingCode != code) {
    pref.begin("ShadeCodes");
    pref.putUShort(this->m_remotePrefId, code);
    pref.end();  
    this->lastRollingCode = code;
    DBG_PRINTF("Setting Last Rolling code %d\n", this->lastRollingCode);
  }
  return code;
}
void SomfyShadeController::toJSONRooms(JsonFormatter &json) {
  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    SomfyRoom *room = &this->rooms[i];
    if(room->roomId != 0) {
      json.beginObject();
      room->toJSON(json);
      json.endObject();
    }
  }
}
void SomfyShadeController::toJSONShades(JsonFormatter &json) {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade &shade = this->shades[i];
    if(shade.getShadeId() != 255) {
      json.beginObject();
      shade.toJSON(json);
      json.endObject();
    }
  }
}

/*
bool SomfyShadeController::toJSON(DynamicJsonDocument &doc) {
  doc["maxRooms"] = SOMFY_MAX_ROOMS;
  doc["maxShades"] = SOMFY_MAX_SHADES;
  doc["maxGroups"] = SOMFY_MAX_GROUPS;
  doc["maxGroupedShades"] = SOMFY_MAX_GROUPED_SHADES;
  doc["maxLinkedRemotes"] = SOMFY_MAX_LINKED_REMOTES;
  doc["startingAddress"] = this->startingAddress;
  JsonObject objRadio = doc.createNestedObject("transceiver");
  this->transceiver.toJSON(objRadio);
  JsonArray arrRooms = doc.createNestedArray("rooms");
  this->toJSONRooms(arrRooms);
  JsonArray arrShades = doc.createNestedArray("shades");
  this->toJSONShades(arrShades);
  JsonArray arrGroups = doc.createNestedArray("groups");
  this->toJSONGroups(arrGroups);
  return true;
}
bool SomfyShadeController::toJSON(JsonObject &obj) {
  obj["maxShades"] = SOMFY_MAX_SHADES;
  obj["maxLinkedRemotes"] = SOMFY_MAX_LINKED_REMOTES;
  obj["startingAddress"] = this->startingAddress;
  JsonObject oradio = obj.createNestedObject("transceiver");
  this->transceiver.toJSON(oradio);
  JsonArray arrShades = obj.createNestedArray("shades");
  this->toJSONShades(arrShades);
  JsonArray arrGroups = obj.createNestedArray("groups");
  this->toJSONGroups(arrGroups);
  return true;
}


bool SomfyShadeController::toJSONShades(JsonArray &arr) {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade &shade = this->shades[i];
    if(shade.getShadeId() != 255) {
      JsonObject oshade = arr.createNestedObject();
      shade.toJSON(oshade);
    }
  }
  return true;
}
bool SomfyShadeController::toJSONGroups(JsonArray &arr) {
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup &group = this->groups[i];
    if(group.getGroupId() != 255) {
      JsonObject ogroup = arr.createNestedObject();
      group.toJSON(ogroup);
    }
  }
  return true;
}
*/
void SomfyShadeController::toJSONGroups(JsonFormatter &json) {
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup &group = this->groups[i];
    if(group.getGroupId() != 255) {
      json.beginObject();
      group.toJSON(json);
      json.endObject();
    }
  }
}
void SomfyShadeController::toJSONRepeaters(JsonFormatter &json) {
  for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++) {
    if(somfy.repeaters[i] != 0) json.addElem((uint32_t)somfy.repeaters[i]);
  }
}
void SomfyShadeController::loop() { 
  this->transceiver.loop(); 
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    if(this->shades[i].getShadeId() != 255) {
      this->shades[i].checkMovement();
      this->shades[i].setGPIOs();
    }
  }
  // Only commit the file once per second.
  if(this->isDirty && millis() - this->lastCommit > 1000) {
    this->commit();
  }
}
SomfyLinkedRemote::SomfyLinkedRemote() {}
void SomfyLinkedRemote::toJSON(JsonFormatter &json) {
  SomfyRemote::toJSON(json);
  json.addElem("lastRssi", this->lastRssi);
}


