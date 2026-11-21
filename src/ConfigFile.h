// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "somfy/Somfy.h"
#include "ConfigSettings.h"
#include "Schedule.h"

#ifndef configfile_h
#define configfile_h

class JsonFormatter;   // web/WResp.h -- référencé par signature seule, pour ne pas tirer le serveur ici
class Preferences;

#define CFG_VALUE_SEP ','
#define CFG_REC_END '\n'
#define CFG_TOK_NONE 0x00
#define CFG_TOK_QUOTE '"'

// Partition « cfg » (cf. partitions_common_4mb.csv) : shades.cfg et schedules.cfg y vivent, à
// l'écart du filesystem principal où s'écrivent les packs de langue et /controller.backup. Aucune
// mise à jour n'écrit plus ni l'une ni l'autre partition ; l'isolement sert à ce qu'un pack de
// langue ne puisse pas saturer l'espace dont commit() a besoin.
// Sans partition cfg (table antérieure), tout retombe sur LittleFS : fsFor() rend alors le
// filesystem principal pour tous les chemins.
namespace CfgStore {
  bool begin();
  bool mounted();
  bool isConfigPath(const char *path);
  fs::FS &fsFor(const char *path);
}


// Position relue d'un fichier : [0,100], NaN → 0. Hors bornes, elle déborderait la largeur fixe
// de writeFloat au prochain commit et validate() refuserait tout le fichier.
static inline float cfgClampPos(float v) { if(!(v >= 0.0f)) return 0.0f; return v > 100.0f ? 100.0f : v; }

struct config_header_t {
  uint8_t version = 1;
  uint8_t repeaterRecords = 0;
  uint8_t repeaterRecordSize = 0;
  uint8_t roomRecords = 0;
  uint16_t roomRecordSize = 0;
  uint16_t shadeRecordSize = 0;
  uint8_t shadeRecords = 0;
  uint16_t groupRecordSize = 0;
  uint8_t groupRecords = 0;
  uint16_t settingsRecordSize = 0;
  uint16_t netRecordSize = 0;
  uint16_t transRecordSize = 0;
  char serverId[10] = ""; // Doit correspondre à la taille du server id dans ConfigSettings.
  int8_t length = 0;
};
class ConfigFile {
  protected:
    File file;
    bool readOnly = false;
    bool begin(const char *filename, bool readOnly = false);
    uint32_t startRecPos = 0;
    bool _opened = false;
    // Écriture dans <chemin>.tmp puis rename() dans end() ; `failed` retient toute écriture courte.
    char path[32] = "";
    char tmpPath[36] = "";
    bool failed = false;
    // Consomme le flux jusqu'au séparateur de champ (inclus), pour les lecteurs qui s'arrêtent
    // AVANT lui (tampon plein ou borne épuisée) -- sans ça, le champ suivant démarre sur le
    // séparateur et tout l'enregistrement se décale. Émetteur unique, pour que les trois lecteurs
    // ne puissent pas diverger.
    // `quotes` = nombre de guillemets DÉJÀ vus par l'appelant sur ce champ, pour appliquer la même
    // règle de fin : un champ à longueur variable n'est terminé que par le séparateur qui suit son
    // guillemet fermant, une virgule entre guillemets faisant partie de la valeur. Le défaut, 2,
    // convient aux champs non guillemetés (readString) : la première virgule les termine.
    bool drainToSeparator(uint8_t quotes = 2);
    bool writeScheduleRecord(ScheduleRule *rule);
    bool readScheduleRecord(ScheduleRule *rule);
  public:
    config_header_t header;
    // Vrai si tout a été écrit et, en écriture, si le temporaire a pris la place du fichier.
    bool end();
    bool isOpen();
    bool readHeader();
    bool seekChar(const char val);
    bool writeHeader(const config_header_t &header);
    bool writeHeader();
    bool writeSeparator();
    bool writeRecordEnd();
    bool writeChar(const char val);
    bool writeInt8(const int8_t val, const char tok = CFG_VALUE_SEP);
    bool writeUInt8(const uint8_t val, const char tok = CFG_VALUE_SEP);
    bool writeInt16(const int16_t val, const char tok = CFG_VALUE_SEP);
    bool writeUInt16(const uint16_t val, const char tok = CFG_VALUE_SEP);
    bool writeUInt32(const uint32_t val, const char tok = CFG_VALUE_SEP);
    bool writeBool(const bool val, const char tok = CFG_VALUE_SEP);
    bool writeFloat(const float val, const uint8_t prec, const char tok = CFG_VALUE_SEP);
    bool readString(char *buff, size_t len);
    bool readVarString(char *buff, size_t len);
    bool skipValue(size_t len);
    bool writeString(const char *val, size_t len, const char tok = CFG_VALUE_SEP);
    bool writeVarString(const char *val, const char tok = CFG_VALUE_SEP);
    char readChar(const char defVal = '\0');
    int8_t readInt8(const int8_t defVal = 0);
    uint8_t readUInt8(const uint8_t defVal = 0);
    int16_t readInt16(const int16_t defVal = 0);
    uint16_t readUInt16(const uint16_t defVal = 0);
    uint32_t readUInt32(const uint32_t defVal = 0);
    bool readBool(const bool defVal = false);
    float readFloat(const float defVal = 0.00);
    bool atRecordEnd();
};
class ShadeConfigFile : public ConfigFile {
  protected:
    bool writeRepeaterRecord(SomfyShadeController *s);
    bool writeRoomRecord(SomfyRoom *room);
    bool writeShadeRecord(SomfyShade *shade);
    bool writeGroupRecord(SomfyGroup *group);
    bool readRepeaterRecord(SomfyShadeController *s);
    bool readRoomRecord(SomfyRoom *room);
    bool readShadeRecord(SomfyShade *shade);
    bool readGroupRecord(SomfyGroup *group);
    bool readSettingsRecord();
    // Saute un enregistrement entier en se calant sur son délimiteur de fin, et NON sur la taille
    // annoncée dans l'en-tête : une taille annoncée n'est qu'un calcul, qui peut être faux (et les
    // sauvegardes déjà produites avec un calcul faux en portent la trace). Le délimiteur, lui, est
    // dans le fichier -- il ne peut pas mentir, et aucun champ ne peut en contenir un (readString
    // comme readVarString le traitent en terminateur inconditionnel). Journalise l'écart quand il
    // y en a un.
    bool skipRecord(const char *what, uint16_t declaredSize);
    bool readNetRecord(restore_options_t &opts);
    bool readTransRecord(transceiver_config_t &cfg);
    bool readScheduleBlock();
    bool skipScheduleBlock();
    bool writeListenerBlock(SomfyShadeController *s);
    bool readListenerBlock(SomfyShadeController *s, bool restoring);
    bool skipListenerBlock();
    bool writeRepeaterNameBlock(SomfyShadeController *s);
    bool readRepeaterNameBlock(SomfyShadeController *s);
    bool writeRemoteNameBlock(SomfyShadeController *s);
    bool readRemoteNameBlock(SomfyShadeController *s);
    // Sauvegarde NDJSON (ConfigFileNdjson.cpp) : backup() et restore() y basculent quand le premier
    // octet le demande ; le positionnel reste pour shades.cfg et les sauvegardes 25/26/27.
    bool writeNdjsonLine(JsonFormatter &fmt, char *buff, const char *what);
    bool backupNdjson(SomfyShadeController *s);
    bool restoreNdjson(SomfyShadeController *s, restore_options_t &opts);
  public:
    // Émetteur unique du garde anti-recul des codes tournants (spec §7) : prend le code lu dans un
    // fichier, rend le max avec la NVS et réécrit celle-ci si le fichier est en avance. Partagé par
    // les lecteurs positionnels et NDJSON pour qu'il ne puisse pas diverger d'un chemin à l'autre.
    static uint16_t reconcileRollingCode(Preferences &pref, const char *prefId, uint16_t fromFile);
    static bool exists();
    static bool load(SomfyShadeController *somfy, const char *filename = "/shades.cfg");
    static bool restore(SomfyShadeController *somfy, const char *filename, restore_options_t &opts);
    bool begin(const char *filename, bool readOnly = false);
    bool begin(bool readOnly = false);
    bool save(SomfyShadeController *somfy);
    bool backup(SomfyShadeController *somfy);
    bool loadFile(SomfyShadeController *somfy, const char *filename = "/shades.cfg");
    bool restoreFile(SomfyShadeController *somfy, const char *filename, restore_options_t &opts);
    bool end();
    bool validate();
};
// Fichier dédié aux plannings (/schedules.cfg), séparé de shades.cfg pour ne pas
// complexifier davantage son versionnage déjà chargé (SHADE_HDR_VER). Réutilise les
// mêmes primitives d'écriture/lecture bas niveau que ConfigFile, avec son propre
// petit en-tête (version + nombre d'enregistrements + taille d'enregistrement).
class ScheduleConfigFile : public ConfigFile {
  public:
    static bool exists();
    static bool load(ScheduleController *schedule, const char *filename = "/schedules.cfg");
    bool begin(const char *filename, bool readOnly = false);
    bool begin(bool readOnly = false);
    bool save(ScheduleController *schedule);
    bool loadFile(ScheduleController *schedule, const char *filename = "/schedules.cfg");
    bool end();
};
#endif
