#ifndef SCHEDULE_H
#define SCHEDULE_H
#include "ConfigSettings.h"
#include "WResp.h"

#define SOMFY_MAX_SCHEDULES 32

enum class schedule_target_t : uint8_t { SHADE = 0, GROUP = 1 };

// Une règle = un seul déclenchement ponctuel (jour(s) + heure + position cible).
// Plusieurs règles peuvent viser le même volet/groupe pour enchaîner des mouvements
// dans la même journée (ex: 08h00 -> 100%, 11h00 -> 50%, 17h00 -> 100%, 23h00 -> 0%).
class ScheduleRule {
  protected:
    uint8_t id = 255; // 255 = emplacement libre, même convention que shadeId/groupId.
  public:
    char name[21] = "";
    // dayMask : bit0=Dimanche, bit1=Lundi ... bit6=Samedi, aligné sur struct tm::tm_wday
    // (valeur standard renvoyée par getLocalTime), pour éviter toute conversion.
    uint8_t dayMask = 0;
    uint8_t hour = 0;   // 0-23
    uint8_t minute = 0; // 0-59
    schedule_target_t targetType = schedule_target_t::SHADE;
    uint8_t targetId = 255;
    uint8_t targetPos = 0;  // 0-100 (%)
    int8_t targetTilt = -1; // -1 = non applicable
    bool enabled = true;
    // Etat d'exécution en RAM uniquement (jamais persisté) : identifie la dernière minute
    // où la règle a déclenché, pour ne pas la redéclencher plusieurs fois tant que l'horloge
    // reste dans cette même minute (la vérification tourne toutes les ~30s).
    int32_t lastTriggeredMinuteKey = -1;

    void setId(uint8_t v) { this->id = v; }
    uint8_t getId() { return this->id; }
    void clear();
    int8_t validateJSON(JsonObject &obj);
    int8_t fromJSON(JsonObject &obj);
    void toJSON(JsonResponse &json);
};

class ScheduleController {
  protected:
    uint32_t lastCommit = 0;
    uint32_t lastCheck = 0;
    void checkSchedules();
    void executeRule(ScheduleRule *rule);
  public:
    bool isDirty = false;
    ScheduleRule schedules[SOMFY_MAX_SCHEDULES];
    bool begin();
    void loop();
    void commit();
    uint8_t scheduleCount();
    uint8_t getNextScheduleId();
    ScheduleRule *addSchedule();
    ScheduleRule *addSchedule(JsonObject &obj);
    ScheduleRule *getScheduleById(uint8_t id);
    bool deleteSchedule(uint8_t id);
    void toJSONSchedules(JsonResponse &json);
};
#endif
