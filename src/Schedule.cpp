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
  this->positionMode = schedule_position_mode_t::POSITION;
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
  if(obj.containsKey("retries") && obj["retries"].as<uint8_t>() > 10) return -1;
  if(obj.containsKey("positionMode")) {
    if(!obj["positionMode"].is<const char *>()) return -1;
    const char *m = obj["positionMode"];
    if(strncmp(m, "position", 8) != 0 && strncmp(m, "my", 2) != 0) return -1;
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
  if(obj.containsKey("positionMode")) {
    const char *m = obj["positionMode"];
    this->positionMode = (strncmp(m, "my", 2) == 0) ? schedule_position_mode_t::MY : schedule_position_mode_t::POSITION;
  }
  if(obj.containsKey("enabled")) this->enabled = obj["enabled"];
  if(obj.containsKey("retries")) this->retries = obj["retries"];
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
    char actionBuf[16];
    if(this->positionMode == schedule_position_mode_t::MY) strcpy(actionBuf, "MY");
    else snprintf(actionBuf, sizeof(actionBuf), "%u%%", this->targetPos);
    Serial.printf(
      "Schedule enregistrement: id=%u nom='%s' cible=%s #%u ('%s') action=%s heure=%02u:%02u dayMask=%u activé=%s renvois=%u\n",
      this->id, this->name, this->targetType == schedule_target_t::GROUP ? "groupe" : "volet",
      this->targetId, targetName, actionBuf, this->hour, this->minute, this->dayMask,
      this->enabled ? "oui" : "non", this->retries);
  }
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
  json.addElem("positionMode", this->positionMode == schedule_position_mode_t::MY ? "my" : "position");
  json.addElem("enabled", this->enabled);
  json.addElem("retries", this->retries);
}

// ============================================================================
// ScheduleController
// ============================================================================
bool ScheduleController::begin() {
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) this->schedules[i].clear();
  if(ScheduleConfigFile::exists()) {
    DBG_PRINTLN("Schedules: schedules.cfg trouvé, chargement...");
    ScheduleConfigFile::load(this);
  }
  else {
    DBG_PRINTLN("Schedules: pas de schedules.cfg -- aucun planning enregistré.");
  }
  // Conditionné à enableDebugLogs (voir Web.cpp/index.js) : permet de vérifier au boot que les
  // plannings créés ont bien été persistés puis rechargés avec les bonnes valeurs.
  uint8_t count = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &this->schedules[i];
    if(rule->getId() == 255) continue;
    count++;
    if(settings.enableDebugLogs) {
      char posBuf[8];
      if(rule->positionMode == schedule_position_mode_t::MY) strcpy(posBuf, "MY");
      else snprintf(posBuf, sizeof(posBuf), "%u%%", rule->targetPos);
      Serial.printf("Schedules:  #%u '%s' dayMask=%u %02u:%02u -> %s %u @ %s enabled=%s retries=%u\n",
        rule->getId(), rule->name, rule->dayMask, rule->hour, rule->minute,
        rule->targetType == schedule_target_t::GROUP ? "groupe" : "volet",
        rule->targetId, posBuf, rule->enabled ? "oui" : "non", rule->retries);
    }
  }
  DBG_PRINTF("Schedules: %u planning(s) chargé(s).\n", count);
  return true;
}
void ScheduleController::commit() {
  if(git.lockFS) return;
  esp_task_wdt_reset(); // Ne pas déclencher le watchdog pendant l'écriture flash.
  ScheduleConfigFile file;
  file.begin();
  bool ok = file.save(this);
  file.end();
  this->isDirty = false;
  this->lastCommit = millis();
  DBG_PRINTF("Schedule: écriture de schedules.cfg (LittleFS) %s -- %u planning(s) persisté(s).\n",
    ok ? "réussie" : "ÉCHOUÉE", this->scheduleCount());
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
  // Renvois de fiabilité post-déclenchement (voir checkVerifications) : résolution plus fine
  // (~5s) que checkSchedules() puisqu'ils sont espacés sur une fenêtre de seulement 2 minutes.
  if(millis() - this->lastVerifyCheck >= 5000) {
    this->lastVerifyCheck = millis();
    this->checkVerifications();
  }
  // Commit différé (throttle 1s), même pattern que SomfyShadeController::loop().
  if(this->isDirty && millis() - this->lastCommit > 1000) this->commit();
}
void ScheduleController::checkSchedules() {
  struct tm dt;
  if(!getLocalTime(&dt, 50)) {
    // Conditionné à enableDebugLogs comme le reste : une fois le bug NTP/TZ (voir NTPSettings::apply)
    // corrigé et confirmé, ce message n'a plus vocation à s'afficher en fonctionnement normal.
    DBG_PRINTLN("Schedules: heure locale indisponible (NTP pas encore synchronisé) -- vérification ignorée.");
    return;
  }
  uint8_t todayMask = 1 << dt.tm_wday; // tm_wday standard C : 0=dimanche ... 6=samedi
  int32_t minuteKey = dt.tm_yday * 1440 + dt.tm_hour * 60 + dt.tm_min;
  if(settings.enableDebugLogs) {
    char buf[24];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &dt);
    Serial.printf("Schedules: vérification à %s (jour bit=%u)\n", buf, todayMask);
  }
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &this->schedules[i];
    if(rule->getId() == 255) continue;
    if(!rule->enabled) { DBG_PRINTF("Schedule %u: désactivée, ignorée\n", rule->getId()); continue; }
    if((rule->dayMask & todayMask) == 0) {
      DBG_PRINTF("Schedule %u: pas prévue aujourd'hui (dayMask=%u, jour bit=%u)\n", rule->getId(), rule->dayMask, todayMask);
      continue;
    }
    if(rule->hour != (uint8_t)dt.tm_hour || rule->minute != (uint8_t)dt.tm_min) continue;
    if(rule->lastTriggeredMinuteKey == minuteKey) { DBG_PRINTF("Schedule %u: déjà déclenchée cette minute\n", rule->getId()); continue; }
    rule->lastTriggeredMinuteKey = minuteKey;
    DBG_PRINTF("Schedule %u (%s): déclenchement à %02u:%02u\n", rule->getId(), rule->name, rule->hour, rule->minute);
    this->executeRule(rule);
  }
}
void ScheduleController::executeRule(ScheduleRule *rule) {
  bool fired = false;
  bool isMy = (rule->positionMode == schedule_position_mode_t::MY);
  if(rule->targetType == schedule_target_t::SHADE) {
    SomfyShade *shade = somfy.getShadeById(rule->targetId);
    if(!shade) {
      DBG_PRINTF("Schedule %u: volet %u introuvable, ignorée\n", rule->getId(), rule->targetId);
      return;
    }
    if(isMy) {
      DBG_PRINTF("Schedule %u: volet %u (%s) -> commande MY\n", rule->getId(), rule->targetId, shade->name);
      shade->sendCommand(somfy_commands::My);
    }
    else {
      DBG_PRINTF("Schedule %u: volet %u (%s) position actuelle=%.1f%% -> cible=%u%%\n",
        rule->getId(), rule->targetId, shade->name, shade->currentPos, rule->targetPos);
      shade->moveToTarget((float)rule->targetPos, rule->targetTilt >= 0 ? (float)rule->targetTilt : -1.0f);
    }
    fired = true;
  }
  else {
    SomfyGroup *group = somfy.getGroupById(rule->targetId);
    if(!group) {
      DBG_PRINTF("Schedule %u: groupe %u introuvable, ignorée\n", rule->getId(), rule->targetId);
      return;
    }
    if(isMy) {
      DBG_PRINTF("Schedule %u: groupe %u -> commande MY\n", rule->getId(), rule->targetId);
      group->sendCommand(somfy_commands::My);
    }
    else {
      DBG_PRINTF("Schedule %u: groupe %u -> %u%%\n", rule->getId(), rule->targetId, rule->targetPos);
      group->moveToTarget((float)rule->targetPos);
    }
    fired = true;
  }
  // Programme le cycle de renvois de fiabilité (voir checkVerifications), réparti sur une
  // fenêtre glissante de 2 minutes à partir de maintenant.
  if(fired && rule->retries > 0) {
    rule->verifyAttemptsLeft = rule->retries;
    rule->verifyWindowStart = millis();
    rule->lastVerifyAt = millis();
    rule->verifyInterval = 120000 / (uint32_t)(rule->retries + 1);
  }
}
// Renvois de fiabilité post-déclenchement : le RTS n'offrant aucune confirmation réelle
// d'exécution, chaque essai compare la position estimée (dead-reckoning) du volet à la
// consigne demandée et ne réémet la commande que si elles ne correspondent pas encore --
// combinant ainsi comparaison d'état et renvoi "à l'aveugle" pour la fiabilité RF. Pour un
// groupe, ou en mode MY (pas de pourcentage à comparer), il n'existe pas de position unique
// à comparer : le renvoi reste purement aveugle.
void ScheduleController::checkVerifications() {
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
    if(rule->targetType == schedule_target_t::SHADE) {
      SomfyShade *shade = somfy.getShadeById(rule->targetId);
      if(!shade) { rule->verifyAttemptsLeft = 0; continue; }
      if(isMy) {
        DBG_PRINTF("Schedule %u: renvoi de fiabilité (volet %u, commande MY)\n", rule->getId(), rule->targetId);
        shade->sendCommand(somfy_commands::My);
        continue;
      }
      if(fabs(shade->currentPos - (float)rule->targetPos) < 1.0f) {
        rule->verifyAttemptsLeft = 0; // position estimée déjà conforme à la consigne, inutile de continuer.
        continue;
      }
      DBG_PRINTF("Schedule %u: position estimée (%.1f%%) != consigne (%u%%), renvoi de la commande\n",
        rule->getId(), shade->currentPos, rule->targetPos);
      shade->moveToTarget((float)rule->targetPos, rule->targetTilt >= 0 ? (float)rule->targetTilt : -1.0f);
    }
    else {
      SomfyGroup *group = somfy.getGroupById(rule->targetId);
      if(!group) { rule->verifyAttemptsLeft = 0; continue; }
      if(isMy) {
        DBG_PRINTF("Schedule %u: renvoi de fiabilité (groupe %u, commande MY)\n", rule->getId(), rule->targetId);
        group->sendCommand(somfy_commands::My);
      }
      else {
        DBG_PRINTF("Schedule %u: renvoi de fiabilité (groupe %u)\n", rule->getId(), rule->targetId);
        group->moveToTarget((float)rule->targetPos);
      }
    }
  }
}
