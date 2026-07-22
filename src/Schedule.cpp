#include <Arduino.h>
#include <time.h>
#include <esp_task_wdt.h>
#include "Schedule.h"
#include "Somfy.h"
#include "ConfigFile.h"
#include "GitOTA.h"

extern SomfyShadeController somfy;
extern ConfigSettings settings;
extern GitUpdater git;

// ============================================================================
// ScheduleRule
// ============================================================================
void ScheduleRule::clear() {
  this->id = 255;
  this->name[0] = '\0';
  this->dayMask = 0;
  this->hour = 0;
  this->minute = 0;
  this->targetType = schedule_target_t::SHADE;
  this->targetId = 255;
  this->targetPos = 0;
  this->targetTilt = -1;
  this->enabled = true;
  this->lastTriggeredMinuteKey = -1;
}
int8_t ScheduleRule::validateJSON(JsonObject &obj) {
  if(obj.containsKey("hour") && obj["hour"].as<uint8_t>() > 23) return -1;
  if(obj.containsKey("minute") && obj["minute"].as<uint8_t>() > 59) return -1;
  if(obj.containsKey("targetPos") && obj["targetPos"].as<uint8_t>() > 100) return -1;
  schedule_target_t type = this->targetType;
  if(obj.containsKey("targetType")) {
    // Garde-fou : un client malveillant/buggé pourrait envoyer une valeur non-string
    // (ex: un nombre) ; obj["targetType"] renverrait alors nullptr, ce qui ferait
    // planter strncmp si on ne vérifiait pas le type au préalable.
    if(!obj["targetType"].is<const char *>()) return -1;
    const char *t = obj["targetType"];
    if(strncmp(t, "shade", 5) != 0 && strncmp(t, "group", 5) != 0) return -1;
    type = (strncmp(t, "group", 5) == 0) ? schedule_target_t::GROUP : schedule_target_t::SHADE;
  }
  if(obj.containsKey("targetId")) {
    uint8_t tid = obj["targetId"];
    if(type == schedule_target_t::SHADE) {
      if(!somfy.getShadeById(tid)) return -1;
    }
    else {
      if(!somfy.getGroupById(tid)) return -1;
    }
  }
  return 0;
}
int8_t ScheduleRule::fromJSON(JsonObject &obj) {
  int8_t rc = this->validateJSON(obj);
  if(rc != 0) return rc;
  if(obj.containsKey("name")) strlcpy(this->name, obj["name"], sizeof(this->name));
  if(obj.containsKey("dayMask")) this->dayMask = obj["dayMask"];
  if(obj.containsKey("hour")) this->hour = obj["hour"];
  if(obj.containsKey("minute")) this->minute = obj["minute"];
  if(obj.containsKey("targetType")) {
    const char *t = obj["targetType"];
    this->targetType = (strncmp(t, "group", 5) == 0) ? schedule_target_t::GROUP : schedule_target_t::SHADE;
  }
  if(obj.containsKey("targetId")) this->targetId = obj["targetId"];
  if(obj.containsKey("targetPos")) this->targetPos = obj["targetPos"];
  if(obj.containsKey("targetTilt")) this->targetTilt = obj["targetTilt"];
  if(obj.containsKey("enabled")) this->enabled = obj["enabled"];
  // Toute modification invalide le dernier déclenchement mémorisé (au cas où l'heure/le
  // jour changerait pour tomber de nouveau sur la minute courante).
  this->lastTriggeredMinuteKey = -1;
  return 0;
}
void ScheduleRule::toJSON(JsonResponse &json) {
  json.addElem("id", this->id);
  json.addElem("name", this->name);
  json.addElem("dayMask", this->dayMask);
  json.addElem("hour", this->hour);
  json.addElem("minute", this->minute);
  json.addElem("targetType", this->targetType == schedule_target_t::GROUP ? "group" : "shade");
  json.addElem("targetId", this->targetId);
  json.addElem("targetPos", this->targetPos);
  json.addElem("targetTilt", this->targetTilt);
  json.addElem("enabled", this->enabled);
}

// ============================================================================
// ScheduleController
// ============================================================================
bool ScheduleController::begin() {
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) this->schedules[i].clear();
  if(ScheduleConfigFile::exists()) {
    DBG_PRINTLN("schedules.cfg exists so we are using that");
    ScheduleConfigFile::load(this);
  }
  else {
    DBG_PRINTLN("No schedules.cfg -- starting clean");
  }
  return true;
}
void ScheduleController::commit() {
  if(git.lockFS) return;
  esp_task_wdt_reset(); // Ne pas déclencher le watchdog pendant l'écriture flash.
  ScheduleConfigFile file;
  file.begin();
  file.save(this);
  file.end();
  this->isDirty = false;
  this->lastCommit = millis();
}
uint8_t ScheduleController::scheduleCount() {
  uint8_t count = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    if(this->schedules[i].getId() != 255) count++;
  }
  return count;
}
uint8_t ScheduleController::getNextScheduleId() {
  // Même logique que SomfyShadeController::getNextShadeId : recherche linéaire du premier
  // slot libre, car la suppression d'une règle au milieu de la liste laisse des trous.
  for(uint8_t i = 1; i < SOMFY_MAX_SCHEDULES - 1; i++) {
    bool id_exists = false;
    for(uint8_t j = 0; j < SOMFY_MAX_SCHEDULES; j++) {
      if(this->schedules[j].getId() == i) { id_exists = true; break; }
    }
    if(!id_exists) return i;
  }
  return 255;
}
ScheduleRule *ScheduleController::addSchedule() {
  uint8_t id = this->getNextScheduleId();
  if(id == 255) return nullptr;
  ScheduleRule *rule = &this->schedules[id - 1];
  rule->setId(id);
  this->isDirty = true;
  return rule;
}
ScheduleRule *ScheduleController::addSchedule(JsonObject &obj) {
  ScheduleRule *rule = this->addSchedule();
  if(rule) {
    if(rule->fromJSON(obj) != 0) {
      // JSON invalide (cible inexistante, heure hors bornes...) : on libère le slot réservé.
      rule->clear();
      return nullptr;
    }
    this->isDirty = true;
  }
  return rule;
}
ScheduleRule *ScheduleController::getScheduleById(uint8_t id) {
  if(id == 255) return nullptr;
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    if(this->schedules[i].getId() == id) return &this->schedules[i];
  }
  return nullptr;
}
bool ScheduleController::deleteSchedule(uint8_t id) {
  ScheduleRule *rule = this->getScheduleById(id);
  if(!rule) return false;
  rule->clear();
  this->isDirty = true;
  return true;
}
void ScheduleController::toJSONSchedules(JsonResponse &json) {
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    if(this->schedules[i].getId() != 255) {
      json.beginObject();
      this->schedules[i].toJSON(json);
      json.endObject();
    }
  }
}
void ScheduleController::loop() {
  // Une résolution à la minute suffit pour une programmation domestique ; on vérifie
  // toutes les ~30s pour rester réactif sans surcharger la boucle principale à chaque tour.
  if(millis() - this->lastCheck >= 30000) {
    this->lastCheck = millis();
    this->checkSchedules();
  }
  // Commit différé (throttle 1s), même pattern que SomfyShadeController::loop().
  if(this->isDirty && millis() - this->lastCommit > 1000) this->commit();
}
void ScheduleController::checkSchedules() {
  struct tm dt;
  if(!getLocalTime(&dt, 50)) return; // Heure pas encore synchronisée (NTP) : on ne déclenche rien.
  uint8_t todayMask = 1 << dt.tm_wday; // tm_wday standard C : 0=dimanche ... 6=samedi
  int32_t minuteKey = dt.tm_yday * 1440 + dt.tm_hour * 60 + dt.tm_min;
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &this->schedules[i];
    if(rule->getId() == 255 || !rule->enabled) continue;
    if((rule->dayMask & todayMask) == 0) continue;
    if(rule->hour != (uint8_t)dt.tm_hour || rule->minute != (uint8_t)dt.tm_min) continue;
    if(rule->lastTriggeredMinuteKey == minuteKey) continue; // déjà déclenchée cette minute-ci.
    rule->lastTriggeredMinuteKey = minuteKey;
    this->executeRule(rule);
  }
}
void ScheduleController::executeRule(ScheduleRule *rule) {
  if(rule->targetType == schedule_target_t::SHADE) {
    SomfyShade *shade = somfy.getShadeById(rule->targetId);
    if(!shade) {
      DBG_PRINTF("Schedule %u: shade %u introuvable, ignorée\n", rule->getId(), rule->targetId);
      return;
    }
    DBG_PRINTF("Schedule %u: volet %u -> %u%%\n", rule->getId(), rule->targetId, rule->targetPos);
    shade->moveToTarget((float)rule->targetPos, rule->targetTilt >= 0 ? (float)rule->targetTilt : -1.0f);
  }
  else {
    SomfyGroup *group = somfy.getGroupById(rule->targetId);
    if(!group) {
      DBG_PRINTF("Schedule %u: groupe %u introuvable, ignorée\n", rule->getId(), rule->targetId);
      return;
    }
    DBG_PRINTF("Schedule %u: groupe %u -> %u%%\n", rule->getId(), rule->targetId, rule->targetPos);
    group->moveToTarget((float)rule->targetPos);
  }
}
