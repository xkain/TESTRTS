// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <Arduino.h>
#include <time.h>
#include <esp_task_wdt.h>
#include "Utils.h"   // strlcpyUtf8 (T-1)
#include <Preferences.h>
#include "Schedule.h"
#include "MQTT.h"
#include "somfy/Somfy.h"
#include "ConfigFile.h"
#include "GitOTA.h"
#include "SunCalc.h"

extern SomfyShadeController somfy;
extern ConfigSettings settings;
extern GitUpdater git;
extern MQTTClass mqtt;

#define SCHEDULE_MQTT_NAMESPACE "mqttpub"
static const char * const SCHEDULE_MQTT_TOPICS[] = {
  "scheduleId", "name", "enabled", "targetType", "targetId", "dayMask", "timeRef",
  "hour", "minute", "sunOffset", "positionMode", "targetPos", "targetTilt", "retries",
  "nextTime", "lastRun"
};
static uint32_t loadScheduleMask() {
  Preferences pref;
  pref.begin(SCHEDULE_MQTT_NAMESPACE, false);
  uint32_t mask = pref.getULong("schedules", 0);
  pref.end();
  return mask;
}
static void storeScheduleMask(uint32_t mask) {
  Preferences pref;
  pref.begin(SCHEDULE_MQTT_NAMESPACE, false);
  if(pref.getULong("schedules", 0) != mask) pref.putULong("schedules", mask);
  pref.end();
}
static void schedulePublish(uint8_t id, const char *topic, const char *val) {
  char buf[48];
  snprintf(buf, sizeof(buf), "schedules/%u/%s", id, topic);
  mqtt.publish(buf, val, true);
}
static void schedulePublish(uint8_t id, const char *topic, int32_t val) {
  char num[12];
  snprintf(num, sizeof(num), "%ld", (long)val);
  schedulePublish(id, topic, num);
}
static void scheduleUnpublish(uint8_t id, const char *topic) {
  char buf[48];
  snprintf(buf, sizeof(buf), "schedules/%u/%s", id, topic);
  mqtt.unpublish(buf);
}

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
  this->positionMode = schedule_position_mode_t::POSITION;
  this->timeRef = schedule_time_ref_t::CLOCK;
  this->sunOffset = 0;
  this->enabled = true;
  this->retries = 0;
  this->lastTriggeredMinuteKey = -1;
  this->verifyAttemptsLeft = 0;
  this->verifyWindowStart = 0;
  this->lastVerifyAt = 0;
  this->verifyInterval = 0;
}
int8_t ScheduleRule::validateJSON(JsonObject &obj) {
  if(obj.containsKey("hour") && obj["hour"].as<uint8_t>() > 23) return -1;
  if(obj.containsKey("minute") && obj["minute"].as<uint8_t>() > 59) return -1;
  if(obj.containsKey("targetPos") && obj["targetPos"].as<uint8_t>() > 100) return -1;
  if(obj.containsKey("targetTilt") && obj["targetTilt"].as<int8_t>() > 100) return -1; // -1 = non applicable, valide.
  if(obj.containsKey("retries") && obj["retries"].as<uint8_t>() > 10) return -1;
  if(obj.containsKey("timeRef")) {
    if(!obj["timeRef"].is<const char *>()) return -1;
    const char *r = obj["timeRef"];
    if(strncmp(r, "clock", 5) != 0 && strncmp(r, "sunrise", 7) != 0 && strncmp(r, "sunset", 6) != 0) return -1;
  }
  // ±720 min (12h) : au-delà, le décalage n'a plus de sens vis-à-vis d'un lever/coucher.
  if(obj.containsKey("sunOffset") && abs(obj["sunOffset"].as<int32_t>()) > 720) return -1;
  if(obj.containsKey("positionMode")) {
    if(!obj["positionMode"].is<const char *>()) return -1;
    const char *m = obj["positionMode"];
    if(strncmp(m, "position", 8) != 0 && strncmp(m, "my", 2) != 0 && strncmp(m, "tiltonly", 8) != 0) return -1;
    if(strncmp(m, "tiltonly", 8) == 0) {
      // Le tilt seul n'a de sens qu'avec une consigne d'inclinaison valide.
      int8_t tt = obj.containsKey("targetTilt") ? obj["targetTilt"].as<int8_t>() : this->targetTilt;
      if(tt < 0) return -1;
    }
  }
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
  if(obj.containsKey("name")) strlcpyUtf8(this->name, obj["name"], sizeof(this->name));
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
  if(obj.containsKey("positionMode")) {
    const char *m = obj["positionMode"];
    if(strncmp(m, "my", 2) == 0) this->positionMode = schedule_position_mode_t::MY;
    else if(strncmp(m, "tiltonly", 8) == 0) this->positionMode = schedule_position_mode_t::TILT_ONLY;
    else this->positionMode = schedule_position_mode_t::POSITION;
  }
  if(obj.containsKey("enabled")) this->enabled = obj["enabled"];
  if(obj.containsKey("retries")) this->retries = obj["retries"];
  if(obj.containsKey("timeRef")) {
    const char *r = obj["timeRef"];
    if(strncmp(r, "sunrise", 7) == 0) this->timeRef = schedule_time_ref_t::SUNRISE;
    else if(strncmp(r, "sunset", 6) == 0) this->timeRef = schedule_time_ref_t::SUNSET;
    else this->timeRef = schedule_time_ref_t::CLOCK;
  }
  if(obj.containsKey("sunOffset")) this->sunOffset = obj["sunOffset"].as<int16_t>();
  // Toute modification invalide le dernier déclenchement mémorisé (au cas où l'heure/le
  // jour changerait pour tomber de nouveau sur la minute courante) ainsi qu'un éventuel
  // cycle de renvois de fiabilité en cours (les paramètres ayant pu changer entre-temps).
  this->lastTriggeredMinuteKey = -1;
  this->verifyAttemptsLeft = 0;
  if(settings.enableDebugLogs) {
    const char *targetName = "?";
    if(this->targetType == schedule_target_t::SHADE) {
      SomfyShade *shade = somfy.getShadeById(this->targetId);
      if(shade) targetName = shade->name;
    }
    else {
      SomfyGroup *group = somfy.getGroupById(this->targetId);
      if(group) targetName = group->name;
    }
    char actionBuf[24];
    if(this->positionMode == schedule_position_mode_t::MY) strcpy(actionBuf, "MY");
    else if(this->positionMode == schedule_position_mode_t::TILT_ONLY) snprintf(actionBuf, sizeof(actionBuf), "tilt only=%d%%", this->targetTilt);
    else if(this->targetTilt >= 0) snprintf(actionBuf, sizeof(actionBuf), "%u%% tilt=%d%%", this->targetPos, this->targetTilt);
    else snprintf(actionBuf, sizeof(actionBuf), "%u%%", this->targetPos);
    // timeRef/sunOffset inclus explicitement : leur absence a compliqué le diagnostic d'un cas réel
    // où l'heure affichée (heure/minute) restait celle du dernier réglage "Heure fixe" alors que la
    // règle avait basculé sur lever/coucher -- sans ces deux champs, rien dans ce log ne permettait
    // de voir laquelle des deux référence horaire avait réellement été persistée.
    const char *timeRefStr = this->timeRef == schedule_time_ref_t::SUNRISE ? "sunrise" :
      this->timeRef == schedule_time_ref_t::SUNSET ? "sunset" : "clock";
    Serial.printf(
      "Schedule saved: id=%u name='%s' target=%s #%u ('%s') action=%s time=%02u:%02u ref=%s offset=%dmin dayMask=%u enabled=%s retries=%u\n",
      this->id, this->name, this->targetType == schedule_target_t::GROUP ? "group" : "shade",
      this->targetId, targetName, actionBuf, this->hour, this->minute, timeRefStr, this->sunOffset,
      this->dayMask, this->enabled ? "yes" : "no", this->retries);
  }
  return 0;
}
void ScheduleRule::toJSON(JsonFormatter &json) {
  json.addElem("id", this->id);
  json.addElem("name", this->name);
  json.addElem("dayMask", this->dayMask);
  json.addElem("hour", this->hour);
  json.addElem("minute", this->minute);
  json.addElem("targetType", this->targetType == schedule_target_t::GROUP ? "group" : "shade");
  json.addElem("targetId", this->targetId);
  json.addElem("targetPos", this->targetPos);
  json.addElem("targetTilt", this->targetTilt);
  json.addElem("positionMode",
    this->positionMode == schedule_position_mode_t::MY ? "my" :
    this->positionMode == schedule_position_mode_t::TILT_ONLY ? "tiltonly" : "position");
  json.addElem("enabled", this->enabled);
  json.addElem("retries", this->retries);
  json.addElem("timeRef",
    this->timeRef == schedule_time_ref_t::SUNRISE ? "sunrise" :
    this->timeRef == schedule_time_ref_t::SUNSET ? "sunset" : "clock");
  json.addElem("sunOffset", (int32_t)this->sunOffset);
}

// ============================================================================
// ScheduleController
// ============================================================================
void ScheduleController::lock() { if(this->_mutex) xSemaphoreTakeRecursive(this->_mutex, portMAX_DELAY); }
void ScheduleController::unlock() { if(this->_mutex) xSemaphoreGiveRecursive(this->_mutex); }
bool ScheduleController::begin() {
  if(!this->_mutex) this->_mutex = xSemaphoreCreateRecursiveMutex();
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) this->schedules[i].clear();
  if(ScheduleConfigFile::exists()) {
    DBG_PRINTLN("Schedules: schedules.cfg found, loading...");
    ScheduleConfigFile::load(this);
  }
  else {
    DBG_PRINTLN("Schedules: no schedules.cfg -- no schedule saved.");
  }
  // Conditionné à enableDebugLogs (voir Web.cpp/index.js) : permet de vérifier au boot que les
  // plannings créés ont bien été persistés puis rechargés avec les bonnes valeurs.
  uint8_t count = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &this->schedules[i];
    if(rule->getId() == 255) continue;
    count++;
    if(settings.enableDebugLogs) {
      char posBuf[16];
      if(rule->positionMode == schedule_position_mode_t::MY) strcpy(posBuf, "MY");
      else if(rule->positionMode == schedule_position_mode_t::TILT_ONLY) snprintf(posBuf, sizeof(posBuf), "tilt=%d%%", rule->targetTilt);
      else snprintf(posBuf, sizeof(posBuf), "%u%%", rule->targetPos);
      Serial.printf("Schedules:  #%u '%s' dayMask=%u %02u:%02u -> %s %u @ %s enabled=%s retries=%u\n",
        rule->getId(), rule->name, rule->dayMask, rule->hour, rule->minute,
        rule->targetType == schedule_target_t::GROUP ? "group" : "shade",
        rule->targetId, posBuf, rule->enabled ? "yes" : "no", rule->retries);
    }
  }
  DBG_PRINTF("Schedules: %u schedule(s) loaded.\n", count);
  return true;
}
void ScheduleController::commit() {
  // Verrouillé : commit() est appelé à la fois depuis loop() (tâche Arduino) et directement depuis
  // les handlers HTTP (tâche async_tcp, cf. WebShadesRest::handleSaveSchedule) -- sans ce verrou,
  // les deux peuvent écrire schedules.cfg en même temps, avec un risque de fichier corrompu ou
  // d'écraser en RAM un champ en cours de modification par l'autre tâche.
  this->lock();
  // Re-vérifié SOUS verrou plutôt que de faire confiance au test de loop() (fait hors verrou, sur
  // une valeur pouvant être obsolète) : sans ce garde-fou, un appel explicite (handleSaveSchedule)
  // et l'appel différé de loop() peuvent tous les deux passer leur propre test avant que l'un des
  // deux n'ait eu la main, puis s'écrire l'un après l'autre en série une fois le verrou libéré --
  // toujours sans corruption grâce au verrou, mais avec une écriture flash inutile en double
  // (constaté en pratique : deux lignes "écriture ... réussie" pour une seule sauvegarde).
  if(!this->isDirty) { this->unlock(); return; }
  if(git.lockFS) { this->unlock(); return; }
  esp_task_wdt_reset(); // Ne pas déclencher le watchdog pendant l'écriture flash.
  ScheduleConfigFile file;
  file.begin();
  bool ok = file.save(this);
  file.end();
  this->isDirty = false;
  this->lastCommit = millis();
  DBG_PRINTF("Schedule: schedules.cfg write (LittleFS) %s -- %u schedule(s) persisted.\n",
    ok ? "succeeded" : "FAILED", this->scheduleCount());
  this->unlock();
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
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &this->schedules[i];
    if(rule->getId() != 255) continue;
    rule->setId(id);
    this->isDirty = true;
    return rule;
  }
  return nullptr;
}
ScheduleRule *ScheduleController::addSchedule(JsonObject &obj) {
  this->lock();
  ScheduleRule *rule = this->addSchedule();
  if(rule) {
    if(rule->fromJSON(obj) != 0) {
      // JSON invalide (cible inexistante, heure hors bornes...) : on libère le slot réservé.
      rule->clear();
      this->unlock();
      return nullptr;
    }
    this->isDirty = true;
    this->markMqttDirty(rule->getId());
  }
  this->unlock();
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
  this->lock();
  ScheduleRule *rule = this->getScheduleById(id);
  if(!rule) { this->unlock(); return false; }
  rule->clear();
  this->isDirty = true;
  this->markMqttDirty(id);
  this->unlock();
  return true;
}
uint8_t ScheduleController::deleteSchedulesForTarget(schedule_target_t targetType, uint8_t targetId) {
  uint8_t removed = 0;
  this->lock();
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &this->schedules[i];
    if(rule->getId() == 255) continue;
    if(rule->targetType != targetType || rule->targetId != targetId) continue;
    DBG_PRINTF("Schedule %u: target %u removed, deleting rule\n", rule->getId(), rule->targetId);
    this->markMqttDirty(rule->getId());
    rule->clear();
    removed++;
  }
  if(removed > 0) this->isDirty = true;
  this->unlock();
  return removed;
}
void ScheduleController::toJSONSchedules(JsonFormatter &json) {
  this->lock();
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    if(this->schedules[i].getId() != 255) {
      json.beginObject();
      this->schedules[i].toJSON(json);
      json.endObject();
    }
  }
  this->unlock();
}
void ScheduleController::loop() {
  // Une résolution à la minute suffit pour une programmation domestique ; on vérifie
  // toutes les ~30s pour rester réactif sans surcharger la boucle principale à chaque tour.
  if(millis() - this->lastCheck >= 30000) {
    this->lastCheck = millis();
    this->checkSchedules();
  }
  // Renvois de fiabilité post-déclenchement (voir checkVerifications) : résolution plus fine
  // (~5s) que checkSchedules() puisqu'ils sont espacés sur une fenêtre de seulement 2 minutes.
  if(millis() - this->lastVerifyCheck >= 5000) {
    this->lastVerifyCheck = millis();
    this->checkVerifications();
  }
  // Commit différé (throttle 1s), même pattern que SomfyShadeController::loop().
  if(this->isDirty && millis() - this->lastCommit > 1000) this->commit();
  this->_processMqtt();
}
void ScheduleController::markMqttResync() {
  this->_mqttPublished = loadScheduleMask();
  uint32_t existing = 0;
  this->lock();
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    uint8_t id = this->schedules[i].getId();
    if(id >= 1 && id <= SOMFY_MAX_SCHEDULES) existing |= (1UL << (id - 1));
  }
  this->_mqttDirty = existing | this->_mqttPublished;
  this->_mqttIndexDirty = true;
  this->unlock();
}
void ScheduleController::markMqttDirty(uint8_t id) {
  if(id < 1 || id > SOMFY_MAX_SCHEDULES) return;
  this->lock();
  this->_mqttDirty |= (1UL << (id - 1));
  this->_mqttIndexDirty = true;
  this->unlock();
}
bool ScheduleController::_snapshotRule(uint8_t id, mqtt_rule_t &snap) {
  bool found = false;
  this->lock();
  ScheduleRule *rule = this->getScheduleById(id);
  if(rule) {
    snap.id = id;
    strlcpy(snap.name, rule->name, sizeof(snap.name));
    snap.enabled = rule->enabled;
    snap.targetType = rule->targetType;
    snap.targetId = rule->targetId;
    snap.dayMask = rule->dayMask;
    snap.hour = rule->hour;
    snap.minute = rule->minute;
    snap.timeRef = rule->timeRef;
    snap.sunOffset = rule->sunOffset;
    snap.positionMode = rule->positionMode;
    snap.targetPos = rule->targetPos;
    snap.targetTilt = rule->targetTilt;
    snap.retries = rule->retries;
    if(rule->timeRef == schedule_time_ref_t::CLOCK) {
      snap.hasEffective = true;
      snap.effHour = rule->hour;
      snap.effMinute = rule->minute;
    }
    else snap.hasEffective = this->_getEffectiveTime(rule, snap.effHour, snap.effMinute);
    found = true;
  }
  this->unlock();
  return found;
}
void ScheduleController::_publishRule(const mqtt_rule_t &snap) {
  schedulePublish(snap.id, "scheduleId", (int32_t)snap.id);
  schedulePublish(snap.id, "name", snap.name);
  schedulePublish(snap.id, "enabled", (int32_t)(snap.enabled ? 1 : 0));
  schedulePublish(snap.id, "targetType", snap.targetType == schedule_target_t::GROUP ? "group" : "shade");
  schedulePublish(snap.id, "targetId", (int32_t)snap.targetId);
  schedulePublish(snap.id, "dayMask", (int32_t)snap.dayMask);
  schedulePublish(snap.id, "timeRef",
    snap.timeRef == schedule_time_ref_t::SUNRISE ? "sunrise" :
    (snap.timeRef == schedule_time_ref_t::SUNSET ? "sunset" : "clock"));
  schedulePublish(snap.id, "hour", (int32_t)snap.hour);
  schedulePublish(snap.id, "minute", (int32_t)snap.minute);
  schedulePublish(snap.id, "sunOffset", (int32_t)snap.sunOffset);
  schedulePublish(snap.id, "positionMode",
    snap.positionMode == schedule_position_mode_t::MY ? "my" :
    (snap.positionMode == schedule_position_mode_t::TILT_ONLY ? "tiltonly" : "position"));
  schedulePublish(snap.id, "targetPos", (int32_t)snap.targetPos);
  schedulePublish(snap.id, "targetTilt", (int32_t)snap.targetTilt);
  schedulePublish(snap.id, "retries", (int32_t)snap.retries);
  if(snap.hasEffective) {
    char eff[6];
    snprintf(eff, sizeof(eff), "%02u:%02u", snap.effHour, snap.effMinute);
    schedulePublish(snap.id, "nextTime", eff);
  }
  else scheduleUnpublish(snap.id, "nextTime");
}
void ScheduleController::_unpublishRule(uint8_t id) {
  for(uint8_t i = 0; i < sizeof(SCHEDULE_MQTT_TOPICS) / sizeof(SCHEDULE_MQTT_TOPICS[0]); i++)
    scheduleUnpublish(id, SCHEDULE_MQTT_TOPICS[i]);
}
void ScheduleController::_publishIndex() {
  char arrIds[128];
  char *w = arrIds;
  *w++ = '[';
  this->lock();
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    uint8_t id = this->schedules[i].getId();
    if(id == 255) continue;
    if(w > arrIds + 1) *w++ = ',';
    w += sprintf(w, "%u", (unsigned)id);
  }
  this->unlock();
  *w++ = ']';
  *w = 0x00;
  mqtt.publish("schedules", arrIds, true);
  storeScheduleMask(this->_mqttPublished);
}
void ScheduleController::_publishRuleDisco(const mqtt_rule_t &snap) {
  if(!mqtt.connected() || !settings.MQTT.pubDisco) return;
  char topic[128];
  char base[96];
  char buf[72];
  snprintf(base, sizeof(base), "%s/schedules/%u", settings.MQTT.rootTopic, snap.id);
  const char *label = snap.name[0] != '\0' ? snap.name : nullptr;

  // Toutes les règles d'une même programmation portent le MÊME nom côté interface (c'est lui qui
  // titre la fiche, cf. groupKeyOf) : sans discriminant, Home Assistant recevrait trois entités
  // homonymes par règle et suffixerait leurs entity_id en doublon. Le déclenchement sert donc de
  // discriminant -- l'heure pour une règle à heure fixe, la PHASE et son décalage pour une règle
  // solaire. Surtout pas l'heure calculée dans ce dernier cas : elle change tous les jours, et le
  // nom de l'entité changerait avec elle à chaque republication.
  char when[24] = "";
  if(snap.timeRef == schedule_time_ref_t::CLOCK)
    snprintf(when, sizeof(when), " %02u:%02u", snap.hour, snap.minute);
  else {
    const char *phase = (snap.timeRef == schedule_time_ref_t::SUNRISE) ? "lever" : "coucher";
    if(snap.sunOffset == 0) snprintf(when, sizeof(when), " %s", phase);
    else snprintf(when, sizeof(when), " %s%+d", phase, (int)snap.sunOffset);
  }
  char title[48];
  if(label) snprintf(title, sizeof(title), "%s%s", label, when);
  else snprintf(title, sizeof(title), "Planning %u%s", snap.id, when);

  DynamicJsonDocument doc(1024);
  JsonObject obj = doc.to<JsonObject>();
  obj["~"] = base;
  mqtt.discoDevice(obj);
  obj["name"] = title;
  snprintf(buf, sizeof(buf), "mqtt_%s_schedule%u", settings.serverId, snap.id);
  obj["unique_id"] = buf;
  obj["state_topic"] = "~/enabled";
  obj["command_topic"] = "~/enabled/set";
  obj["payload_on"] = "1";
  obj["payload_off"] = "0";
  obj["state_on"] = "1";
  obj["state_off"] = "0";
  obj["icon"] = "mdi:calendar-clock";
  obj["entity_category"] = "config";
  obj["enabled_by_default"] = true;
  snprintf(topic, sizeof(topic), "%s/switch/sched%u/config", settings.MQTT.discoTopic, snap.id);
  mqtt.publishDisco(topic, obj, true);

  doc.clear();
  obj = doc.to<JsonObject>();
  obj["~"] = base;
  mqtt.discoDevice(obj);
  snprintf(buf, sizeof(buf), "%s heure", title);
  obj["name"] = buf;
  snprintf(buf, sizeof(buf), "mqtt_%s_schedule%u_next", settings.serverId, snap.id);
  obj["unique_id"] = buf;
  obj["state_topic"] = "~/nextTime";
  obj["icon"] = "mdi:clock-outline";
  obj["entity_category"] = "diagnostic";
  obj["enabled_by_default"] = true;
  snprintf(topic, sizeof(topic), "%s/sensor/sched%unext/config", settings.MQTT.discoTopic, snap.id);
  mqtt.publishDisco(topic, obj, true);

  doc.clear();
  obj = doc.to<JsonObject>();
  obj["~"] = base;
  mqtt.discoDevice(obj);
  snprintf(buf, sizeof(buf), "%s dernier declenchement", title);
  obj["name"] = buf;
  snprintf(buf, sizeof(buf), "mqtt_%s_schedule%u_run", settings.serverId, snap.id);
  obj["unique_id"] = buf;
  obj["state_topic"] = "~/lastRun";
  obj["device_class"] = "timestamp";
  obj["entity_category"] = "diagnostic";
  obj["enabled_by_default"] = true;
  snprintf(topic, sizeof(topic), "%s/sensor/sched%urun/config", settings.MQTT.discoTopic, snap.id);
  mqtt.publishDisco(topic, obj, true);
}
void ScheduleController::_unpublishRuleDisco(uint8_t id) {
  if(!mqtt.connected()) return;
  char topic[128];
  snprintf(topic, sizeof(topic), "%s/switch/sched%u/config", settings.MQTT.discoTopic, id);
  mqtt.unpublishDisco(topic);
  snprintf(topic, sizeof(topic), "%s/sensor/sched%unext/config", settings.MQTT.discoTopic, id);
  mqtt.unpublishDisco(topic);
  snprintf(topic, sizeof(topic), "%s/sensor/sched%urun/config", settings.MQTT.discoTopic, id);
  mqtt.unpublishDisco(topic);
}
void ScheduleController::unpublishDisco() {
  for(uint8_t id = 1; id <= SOMFY_MAX_SCHEDULES; id++) {
    if((this->_mqttPublished & (1UL << (id - 1))) == 0) continue;
    this->_unpublishRuleDisco(id);
  }
}
void ScheduleController::_publishLastRun(uint8_t id) {
  if(!mqtt.connected()) return;
  struct tm dt;
  if(!getLocalTime(&dt, 50)) return;
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S%z", &dt);
  size_t n = strlen(buf);
  if(n >= 5 && (buf[n - 5] == '+' || buf[n - 5] == '-')) {
    buf[n + 1] = '\0';
    buf[n] = buf[n - 1];
    buf[n - 1] = buf[n - 2];
    buf[n - 2] = ':';
  }
  schedulePublish(id, "lastRun", buf);
}
void ScheduleController::_processMqtt() {
  if(!mqtt.connected()) return;
  if(this->_mqttDirty == 0 && !this->_mqttIndexDirty) return;
  if((uint32_t)(millis() - this->_lastMqttPub) < 100) return;
  uint8_t next = 0;
  bool doIndex = false;
  this->lock();
  if(this->_mqttDirty != 0) {
    for(uint8_t id = 1; id <= SOMFY_MAX_SCHEDULES; id++) {
      uint32_t bit = 1UL << (id - 1);
      if((this->_mqttDirty & bit) == 0) continue;
      this->_mqttDirty &= ~bit;
      next = id;
      break;
    }
  }
  else if(this->_mqttIndexDirty) {
    this->_mqttIndexDirty = false;
    doIndex = true;
  }
  this->unlock();
  if(next == 0 && !doIndex) return;
  this->_lastMqttPub = millis();
  if(next != 0) {
    uint32_t bit = 1UL << (next - 1);
    mqtt_rule_t snap;
    if(this->_snapshotRule(next, snap)) {
      this->_publishRule(snap);
      this->_publishRuleDisco(snap);
      this->_mqttPublished |= bit;
    }
    else if(this->_mqttPublished & bit) {
      this->_unpublishRule(next);
      this->_unpublishRuleDisco(next);
      this->_mqttPublished &= ~bit;
    }
    return;
  }
  this->_publishIndex();
}
// Recalcule le lever/coucher du jour LOCAL courant (dt), en minutes locales depuis minuit.
// Le calcul NOAA (SunCalc) prend en entrée la date civile et renvoie des minutes UTC : on utilise
// délibérément l'année/mois/jour LOCAUX comme date civile d'entrée (convention standard des
// bibliothèques de lever/coucher embarquées, ex: Dusk2Dawn) -- la déclinaison solaire variant très
// lentement (~0,4°/jour), le décalage d'un jour calendaire que cela peut introduire près du
// changement de date UTC est sans effet mesurable sur la précision (cf. étude de faisabilité,
// écart max observé < 1 min). SunCalc::toEpoch() + localtime_r() appliquent ensuite le fuseau/DST
// réels (déjà configurés via NTPSettings::apply -> tzset()) pour obtenir l'heure locale exacte.
void ScheduleController::_recomputeSolarTimes(const struct tm &dt) {
  this->_sunriseLocalMin = -1;
  this->_sunsetLocalMin = -1;
  if(!settings.hasGeoPosition()) return;
  double sunriseUtcMin, sunsetUtcMin;
  int year = dt.tm_year + 1900, month = dt.tm_mon + 1, day = dt.tm_mday;
  if(!SunCalc::calculate(year, month, day, settings.geoLat, settings.geoLon, sunriseUtcMin, sunsetUtcMin)) {
    DBG_PRINTLN("Schedules: polar day or night today -- sunrise/sunset rules ignored.");
    return;
  }
  time_t sunriseEpoch = SunCalc::toEpoch(year, month, day, sunriseUtcMin);
  time_t sunsetEpoch = SunCalc::toEpoch(year, month, day, sunsetUtcMin);
  struct tm localTm;
  localtime_r(&sunriseEpoch, &localTm);
  this->_sunriseLocalMin = (int16_t)(localTm.tm_hour * 60 + localTm.tm_min);
  localtime_r(&sunsetEpoch, &localTm);
  this->_sunsetLocalMin = (int16_t)(localTm.tm_hour * 60 + localTm.tm_min);
  if(settings.enableDebugLogs) {
    Serial.printf("Schedules: sunrise=%02d:%02d sunset=%02d:%02d (local time, lat=%.2f lon=%.2f)\n",
      this->_sunriseLocalMin / 60, this->_sunriseLocalMin % 60,
      this->_sunsetLocalMin / 60, this->_sunsetLocalMin % 60,
      settings.geoLat, settings.geoLon);
  }
}
// Renvoie false si la règle est solaire mais que l'évènement de référence est indisponible
// aujourd'hui (position non configurée, ou jour/nuit polaire) : la règle doit alors être ignorée
// pour cette vérification, plutôt que de déclencher sur une heure par défaut trompeuse.
bool ScheduleController::_getEffectiveTime(ScheduleRule *rule, uint8_t &hour, uint8_t &minute) {
  int16_t base = (rule->timeRef == schedule_time_ref_t::SUNRISE) ? this->_sunriseLocalMin : this->_sunsetLocalMin;
  if(base < 0) return false;
  int32_t total = (int32_t)base + rule->sunOffset;
  while(total < 0) total += 1440;
  while(total >= 1440) total -= 1440;
  hour = (uint8_t)(total / 60);
  minute = (uint8_t)(total % 60);
  return true;
}
// M-24 de l'audit, corrigé le 24/08/2026. Cette fonction tenait le verrou de planification pendant
// TOUTE sa boucle, émission comprise -- or déclencher une règle lance une salve RF synchrone
// (sendCommand -> Transceiver::sendFrame, des centaines de millisecondes, davantage sur un groupe
// ou avec des répétitions). Pendant ce temps, /saveSchedule, /getSchedules et la phase
// CTL_SCHEDULES de /controller restaient bloqués sur schedule.lock() depuis async_tcp.
//
// La boucle ne fait donc plus qu'ÉLIRE les règles à déclencher, puis relâche le verrou avant
// d'émettre quoi que ce soit. Ce qui doit impérativement rester sous verrou y reste :
//   - `lastTriggeredMinuteKey`, qui garantit un seul déclenchement par minute ;
//   - la planification des renvois (verifyAttemptsLeft, verifyWindowStart, ...), qui écrit dans la
//     règle et que checkVerifications() lit sous le même verrou.
// Seule l'émission radio sort. On ne conserve pas de pointeur vers la règle au-delà du verrou :
// /deleteSchedule pourrait la libérer entre-temps, d'où pending_action_t qui recopie les seuls
// champs nécessaires (cf. Schedule.h).
void ScheduleController::checkSchedules() {
  this->lock();
  pending_action_t pending[SOMFY_MAX_SCHEDULES];
  uint8_t pendingCount = 0;
  struct tm dt;
  if(!getLocalTime(&dt, 50)) {
    // Conditionné à enableDebugLogs comme le reste : une fois le bug NTP/TZ (voir NTPSettings::apply)
    // corrigé et confirmé, ce message n'a plus vocation à s'afficher en fonctionnement normal.
    DBG_PRINTLN("Schedules: local time unavailable (NTP not yet synced) -- check skipped.");
    this->unlock();
    return;
  }
  // Recalculé si le jour a changé, MAIS AUSSI si le fuseau ou la position géo ont changé en cours
  // de journée (réglage modifié dans l'appli sans reboot) : sinon la conversion UTC->local déjà en
  // cache reste calée sur l'ancienne valeur jusqu'au lendemain (cf. commentaire sur les champs
  // _solarCache* dans Schedule.h).
  if(this->_solarCacheYday != (int16_t)dt.tm_yday ||
     strncmp(this->_solarCacheTZ, settings.NTP.posixZone, sizeof(this->_solarCacheTZ)) != 0 ||
     this->_solarCacheLat != settings.geoLat || this->_solarCacheLon != settings.geoLon) {
    this->_recomputeSolarTimes(dt);
    this->_solarCacheYday = (int16_t)dt.tm_yday;
    strlcpy(this->_solarCacheTZ, settings.NTP.posixZone, sizeof(this->_solarCacheTZ));
    this->_solarCacheLat = settings.geoLat;
    this->_solarCacheLon = settings.geoLon;
    for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
      if(this->schedules[i].getId() == 255) continue;
      if(this->schedules[i].timeRef != schedule_time_ref_t::CLOCK) this->markMqttDirty(this->schedules[i].getId());
    }
  }
  uint8_t todayMask = 1 << dt.tm_wday; // tm_wday standard C : 0=dimanche ... 6=samedi
  int32_t minuteKey = dt.tm_yday * 1440 + dt.tm_hour * 60 + dt.tm_min;
  uint8_t activeCount = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++)
    if(this->schedules[i].getId() != 255 && this->schedules[i].enabled) activeCount++;
  if(activeCount == 0) { this->unlock(); return; }
  if(settings.enableDebugLogs) {
    char buf[24];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &dt);
    Serial.printf("Schedules: check at %s (day bit=%u)\n", buf, todayMask);
  }
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &this->schedules[i];
    if(rule->getId() == 255) continue;
    if(!rule->enabled) { DBG_PRINTF("Schedule %u: disabled, skipped\n", rule->getId()); continue; }
    if((rule->dayMask & todayMask) == 0) {
      DBG_PRINTF("Schedule %u: not scheduled today (dayMask=%u, day bit=%u)\n", rule->getId(), rule->dayMask, todayMask);
      continue;
    }
    uint8_t effHour, effMinute;
    if(rule->timeRef == schedule_time_ref_t::CLOCK) {
      effHour = rule->hour;
      effMinute = rule->minute;
    }
    else if(!this->_getEffectiveTime(rule, effHour, effMinute)) {
      DBG_PRINTF("Schedule %u: solar time unavailable (position not configured, or polar day/night), skipped\n", rule->getId());
      continue;
    }
    if(effHour != (uint8_t)dt.tm_hour || effMinute != (uint8_t)dt.tm_min) continue;
    if(rule->lastTriggeredMinuteKey == minuteKey) { DBG_PRINTF("Schedule %u: already triggered this minute\n", rule->getId()); continue; }
    rule->lastTriggeredMinuteKey = minuteKey;
    DBG_PRINTF("Schedule %u (%s): triggering at %02u:%02u\n", rule->getId(), rule->name, effHour, effMinute);
    // Existence de la cible vérifiée ICI, sous verrou, parce que c'est elle qui conditionne la
    // planification des renvois -- exactement le rôle du drapeau `fired` d'avant ce correctif.
    bool targetExists = (rule->targetType == schedule_target_t::SHADE)
      ? (somfy.getShadeById(rule->targetId) != nullptr)
      : (somfy.getGroupById(rule->targetId) != nullptr);
    if(!targetExists) {
      DBG_PRINTF("Schedule %u: target %u not found, skipped\n", rule->getId(), rule->targetId);
      continue;
    }
    if(rule->retries > 0) {
      rule->verifyAttemptsLeft = rule->retries;
      rule->verifyWindowStart = millis();
      rule->lastVerifyAt = millis();
      rule->verifyInterval = 120000 / (uint32_t)(rule->retries + 1);
    }
    if(pendingCount < SOMFY_MAX_SCHEDULES) {
      pending[pendingCount++] = { rule->getId(), rule->targetType, rule->targetId,
                                  rule->positionMode, rule->targetPos, rule->targetTilt };
    }
  }
  this->unlock();
  // --- Hors verrou : c'est ici, et seulement ici, que la radio parle. ---
  for(uint8_t i = 0; i < pendingCount; i++) this->executeAction(pending[i]);
}
// Émission proprement dite. Les cibles sont RE-RÉSOLUES par identifiant plutôt que par un pointeur
// capturé sous verrou : entre le relâchement et cet appel, /deleteShade ou /deleteGroup ont pu
// libérer l'emplacement. Une cible disparue dans cet intervalle est simplement ignorée.
void ScheduleController::executeAction(const pending_action_t &act) {
  this->_publishLastRun(act.ruleId);
  bool isMy = (act.positionMode == schedule_position_mode_t::MY);
  bool isTiltOnly = (act.positionMode == schedule_position_mode_t::TILT_ONLY);
  if(act.targetType == schedule_target_t::SHADE) {
    SomfyShade *shade = somfy.getShadeById(act.targetId);
    if(!shade) {
      DBG_PRINTF("Schedule %u: shade %u disparu avant emission, ignore\n", act.ruleId, act.targetId);
      return;
    }
    if(isMy) {
      DBG_PRINTF("Schedule %u: shade %u (%s) -> MY command\n", act.ruleId, act.targetId, shade->name);
      shade->sendCommand(somfy_commands::My);
    }
    else if(isTiltOnly) {
      DBG_PRINTF("Schedule %u: shade %u (%s) tilt only -> target=%d%%\n", act.ruleId, act.targetId, shade->name, act.targetTilt);
      // Hauteur inchangée (on repasse la position actuelle) : cf. SomfyGroup::moveTiltOnly.
      shade->moveToTarget(shade->currentPos, (float)act.targetTilt);
    }
    else {
      DBG_PRINTF("Schedule %u: shade %u (%s) -> target=%u%%\n", act.ruleId, act.targetId, shade->name, act.targetPos);
      shade->moveToTarget((float)act.targetPos, act.targetTilt >= 0 ? (float)act.targetTilt : -1.0f);
    }
  }
  else {
    SomfyGroup *group = somfy.getGroupById(act.targetId);
    if(!group) {
      DBG_PRINTF("Schedule %u: group %u disparu avant emission, ignore\n", act.ruleId, act.targetId);
      return;
    }
    if(isMy) {
      DBG_PRINTF("Schedule %u: group %u -> MY command\n", act.ruleId, act.targetId);
      group->sendCommand(somfy_commands::My);
    }
    else if(isTiltOnly) {
      DBG_PRINTF("Schedule %u: group %u -> tilt only %d%%\n", act.ruleId, act.targetId, act.targetTilt);
      group->moveTiltOnly((float)act.targetTilt);
    }
    else {
      DBG_PRINTF("Schedule %u: group %u -> %u%%\n", act.ruleId, act.targetId, act.targetPos);
      group->moveToTarget((float)act.targetPos, act.targetTilt >= 0 ? (float)act.targetTilt : -1.0f);
    }
  }
}
// Renvois de fiabilité post-déclenchement : le RTS n'offrant aucune confirmation réelle
// d'exécution, chaque essai compare la position estimée (dead-reckoning) de l'équipement à la
// consigne demandée et ne réémet la commande que si elles ne correspondent pas encore --
// combinant ainsi comparaison d'état et renvoi "à l'aveugle" pour la fiabilité RF. Pour un
// groupe, ou en mode MY (pas de pourcentage à comparer), il n'existe pas de position unique
// à comparer : le renvoi reste purement aveugle.
void ScheduleController::checkVerifications() {
  this->lock();
  uint32_t now = millis();
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &this->schedules[i];
    if(rule->getId() == 255 || rule->verifyAttemptsLeft == 0) continue;
    if(now - rule->verifyWindowStart >= 120000) {
      rule->verifyAttemptsLeft = 0; // fenêtre de 2 minutes expirée, on arrête les renvois.
      continue;
    }
    if(now - rule->lastVerifyAt < rule->verifyInterval) continue; // pas encore l'heure du prochain essai.
    rule->lastVerifyAt = now;
    rule->verifyAttemptsLeft--;
    bool isMy = (rule->positionMode == schedule_position_mode_t::MY);
    bool isTiltOnly = (rule->positionMode == schedule_position_mode_t::TILT_ONLY);
    if(rule->targetType == schedule_target_t::SHADE) {
      SomfyShade *shade = somfy.getShadeById(rule->targetId);
      if(!shade) { rule->verifyAttemptsLeft = 0; continue; }
      if(isMy) {
        DBG_PRINTF("Schedule %u: reliability retry (shade %u, MY command)\n", rule->getId(), rule->targetId);
        shade->sendCommand(somfy_commands::My);
        continue;
      }
      if(isTiltOnly) {
        if(fabs(shade->currentTiltPos - (float)rule->targetTilt) < 1.0f) {
          rule->verifyAttemptsLeft = 0; // inclinaison estimée déjà conforme, inutile de continuer.
          continue;
        }
        DBG_PRINTF("Schedule %u: estimated tilt (%.1f%%) != target (%d%%), retrying (tilt only)\n",
          rule->getId(), shade->currentTiltPos, rule->targetTilt);
        shade->moveToTarget(shade->currentPos, (float)rule->targetTilt);
        continue;
      }
      if(fabs(shade->currentPos - (float)rule->targetPos) < 1.0f) {
        rule->verifyAttemptsLeft = 0; // position estimée déjà conforme à la consigne, inutile de continuer.
        continue;
      }
      DBG_PRINTF("Schedule %u: estimated position (%.1f%%) != target (%u%%), retrying command\n",
        rule->getId(), shade->currentPos, rule->targetPos);
      shade->moveToTarget((float)rule->targetPos, rule->targetTilt >= 0 ? (float)rule->targetTilt : -1.0f);
    }
    else {
      SomfyGroup *group = somfy.getGroupById(rule->targetId);
      if(!group) { rule->verifyAttemptsLeft = 0; continue; }
      if(isMy) {
        DBG_PRINTF("Schedule %u: reliability retry (group %u, MY command)\n", rule->getId(), rule->targetId);
        group->sendCommand(somfy_commands::My);
      }
      else if(isTiltOnly) {
        DBG_PRINTF("Schedule %u: reliability retry (group %u, tilt only)\n", rule->getId(), rule->targetId);
        group->moveTiltOnly((float)rule->targetTilt);
      }
      else {
        DBG_PRINTF("Schedule %u: reliability retry (group %u)\n", rule->getId(), rule->targetId);
        group->moveToTarget((float)rule->targetPos, rule->targetTilt >= 0 ? (float)rule->targetTilt : -1.0f);
      }
    }
  }
  this->unlock();
}
