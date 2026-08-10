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
void SomfyRemote::setRemoteAddress(uint32_t address) { this->m_remoteAddress = address; snprintf(this->m_remotePrefId, sizeof(this->m_remotePrefId), "_%lu", (unsigned long)this->m_remoteAddress); }
uint32_t SomfyRemote::getRemoteAddress() { return this->m_remoteAddress; }
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
SomfyLinkedRemote::SomfyLinkedRemote() {}


