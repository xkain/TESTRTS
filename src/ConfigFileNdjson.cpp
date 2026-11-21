// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <Arduino.h>
#include <LittleFS.h>
#include <Preferences.h>
#include "ConfigFile.h"
#include "ConfigSettings.h"
#include "Utils.h"
#include "web/WResp.h"
#include "JsonHelpers.h"

// Sauvegarde au format NDJSON (fmt 1) : un objet JSON par ligne, clés de l'API HTTP, clé absente =
// valeur en place conservée. Spécification : audit/FORMAT-SAUVEGARDE-2026-11-09.md. Le contrat de
// champs est partagé avec le convertisseur en ligne (online/js/convertisseur.js) : toute clé
// ajoutée ici doit l'être là-bas.
//
// `shades.cfg` n'est PAS concerné : il reste positionnel (ConfigFile.cpp). Seule la sauvegarde
// `/controller.backup` passe par ce fichier -- écriture via backupNdjson(), lecture via
// restoreNdjson(), toutes deux discriminées du format hérité par le premier octet (`{` contre un
// chiffre) dans ShadeConfigFile::backup()/restore().
//
// Contrainte de pile (spec §5) : la restauration tourne sur async_tcp (~1,9 Ko libres sous TLS).
// Tampon de ligne et document JSON vont donc sur le TAS, une seule fois, libérés en fin de course.

#define NDJSON_LINE_BUF 2048
#define NDJSON_DOC_SIZE 3072

extern ConfigSettings settings;
extern ScheduleController schedule;

/* ------------------------------------------------------------------ Écriture */

// Termine la ligne courante du formatter et la dépose dans le fichier. Une ligne qui a débordé le
// tampon serait du JSON invalide : elle est abandonnée et signalée, le reste du fichier est sain.
bool ShadeConfigFile::writeNdjsonLine(JsonFormatter &fmt, char *buff, const char *what) {
  fmt.endObject();
  if(fmt.overflowed()) {
    Serial.printf("[CFG] ligne %s trop longue pour le tampon NDJSON -- omise\n", what);
    return false;
  }
  size_t len = strlen(buff);
  if(this->file.write((uint8_t *)buff, len) != len) return false;
  return this->writeChar('\n');
}

bool ShadeConfigFile::backupNdjson(SomfyShadeController *s) {
  char *buff = (char *)malloc(NDJSON_LINE_BUF);
  if(!buff) return false;
  JsonFormatter fmt;
  bool ok = true;
  auto open = [&fmt, buff]() { fmt.begin(buff, NDJSON_LINE_BUF); fmt.beginObject(); };

  open();
  fmt.addElem("rec", "meta");
  fmt.addElem("fmt", (uint8_t)1);
  fmt.addElem("fw", settings.fwVersion.name);
  fmt.addElem("serverId", settings.serverId);
  fmt.addElem("chip", settings.chipModel);
  fmt.addElem("profile", settings.hardwareProfile);
  Timestamp ts;
  fmt.addElem("created", ts.getISOTime());
  ok &= this->writeNdjsonLine(fmt, buff, "meta");

  open();
  fmt.addElem("rec", "settings");
  fmt.addElem("hostname", settings.hostname);
  fmt.addElem("ntpServer", settings.NTP.ntpServer);
  fmt.addElem("posixZone", settings.NTP.posixZone);
  fmt.addElem("accentColor", settings.accentColor);
  fmt.addElem("ssdpBroadcast", settings.ssdpBroadcast);
  fmt.addElem("checkForUpdate", settings.checkForUpdate);
  fmt.addElem("language", settings.language);
  fmt.addElem("headerMobileDisplay", settings.headerMobileDisplay);
  fmt.addElem("reverseDashboardColumns", settings.reverseDashboardColumns);
  fmt.addElem("defaultMobileTab", settings.defaultMobileTab);
  fmt.addElem("showRadioActivity", settings.showRadioActivity);
  fmt.addElem("themeMode", settings.themeMode);
  fmt.addElem("showMovementIndicator", settings.showMovementIndicator);
  fmt.addElem("ledPin", settings.ledPin);
  fmt.addElem("ledActiveLow", settings.ledActiveLow);
  fmt.addElem("ledAddressable", settings.ledAddressable);
  fmt.addElem("ledColorOrder", settings.ledColorOrder);
  fmt.addElem("ledColorActivity", settings.ledColorActivity);
  fmt.addElem("ledRfBlink", settings.ledRfBlink);
  fmt.addElem("iconPack", settings.iconPack);
  fmt.addElem("dashCompact", settings.dashCompact);
  fmt.addElem("geoLat", settings.geoLat);
  fmt.addElem("geoLon", settings.geoLon);
  ok &= this->writeNdjsonLine(fmt, buff, "settings");

  open();
  fmt.addElem("rec", "net");
  fmt.addElem("connType", static_cast<uint8_t>(settings.connType));
  fmt.addElem("dhcp", settings.IP.dhcp);
  fmt.addElem("ip", settings.IP.ip.toString().c_str());
  fmt.addElem("gateway", settings.IP.gateway.toString().c_str());
  fmt.addElem("subnet", settings.IP.subnet.toString().c_str());
  fmt.addElem("dns1", settings.IP.dns1.toString().c_str());
  fmt.addElem("dns2", settings.IP.dns2.toString().c_str());
  fmt.addElem("ethBoardType", settings.Ethernet.boardType);
  fmt.addElem("ethPhyType", settings.Ethernet.phyType);
  fmt.addElem("ethCLKMode", settings.Ethernet.CLKMode);
  fmt.addElem("ethPhyAddress", settings.Ethernet.phyAddress);
  fmt.addElem("ethPWRPin", settings.Ethernet.PWRPin);
  fmt.addElem("ethMDCPin", settings.Ethernet.MDCPin);
  fmt.addElem("ethMDIOPin", settings.Ethernet.MDIOPin);
  ok &= this->writeNdjsonLine(fmt, buff, "net");

  // Identifiants et mot de passe du courtier exclus, comme toujours (spec §4) : seule la partie
  // non secrète de la configuration MQTT part dans la sauvegarde.
  open();
  fmt.addElem("rec", "mqtt");
  fmt.addElem("enabled", settings.MQTT.enabled);
  fmt.addElem("hostname", settings.MQTT.hostname);
  fmt.addElem("port", (uint32_t)settings.MQTT.port);
  fmt.addElem("pubDisco", settings.MQTT.pubDisco);
  fmt.addElem("rootTopic", settings.MQTT.rootTopic);
  fmt.addElem("discoTopic", settings.MQTT.discoTopic);
  fmt.addElem("clientId", settings.MQTT.clientId);
  ok &= this->writeNdjsonLine(fmt, buff, "mqtt");

  transceiver_config_t &cfg = s->transceiver.config;
  open();
  fmt.addElem("rec", "radio");
  fmt.addElem("enabled", cfg.enabled);
  fmt.addElem("proto", static_cast<uint8_t>(cfg.proto));
  fmt.addElem("type", cfg.type);
  fmt.addElem("radioBoardType", cfg.radioBoardType);
  fmt.addElem("SCKPin", cfg.SCKPin);
  fmt.addElem("CSNPin", cfg.CSNPin);
  fmt.addElem("MOSIPin", cfg.MOSIPin);
  fmt.addElem("MISOPin", cfg.MISOPin);
  fmt.addElem("TXPin", cfg.TXPin);
  fmt.addElem("RXPin", cfg.RXPin);
  fmt.addElem("frequency", cfg.frequency);
  fmt.addElem("rxFrequency", cfg.rxFrequency);
  fmt.addElem("rxBandwidth", cfg.rxBandwidth);
  fmt.addElem("txPower", cfg.txPower);
  ok &= this->writeNdjsonLine(fmt, buff, "radio");

  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    SomfyRoom *room = &s->rooms[i];
    if(room->roomId == 0) continue;
    open();
    fmt.addElem("rec", "room");
    fmt.addElem("roomId", room->roomId);
    fmt.addElem("name", room->name);
    fmt.addElem("sortOrder", room->sortOrder);
    ok &= this->writeNdjsonLine(fmt, buff, "room");
  }

  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade *shade = &s->shades[i];
    if(shade->getShadeId() == 255) continue;
    open();
    fmt.addElem("rec", "shade");
    fmt.addElem("shadeId", shade->getShadeId());
    fmt.addElem("paired", shade->paired);
    fmt.addElem("shadeType", static_cast<uint8_t>(shade->shadeType));
    fmt.addElem("remoteAddress", (uint32_t)shade->getRemoteAddress());
    fmt.addElem("name", shade->name);
    fmt.addElem("tiltType", static_cast<uint8_t>(shade->tiltType));
    fmt.addElem("proto", static_cast<uint8_t>(shade->proto));
    fmt.addElem("bitLength", shade->bitLength);
    fmt.addElem("upTime", (uint32_t)shade->upTime);
    fmt.addElem("downTime", (uint32_t)shade->downTime);
    fmt.addElem("tiltTimeUp", (uint32_t)shade->tiltTimeUp);
    fmt.addElem("tiltTimeDown", (uint32_t)shade->tiltTimeDown);
    fmt.addElem("stepSize", (uint32_t)shade->stepSize);
    fmt.addElem("flags", shade->flags);
    // Positions BRUTES, sans transformPosition() : la sauvegarde décrit l'état interne, pas la vue
    // de l'interface -- flipPosition est déjà dans la ligne, l'appliquer ici le doublerait.
    fmt.addElem("myPos", shade->myPos);
    fmt.addElem("myTiltPos", shade->myTiltPos);
    fmt.addElem("currentPos", shade->currentPos);
    fmt.addElem("currentTiltPos", shade->currentTiltPos);
    fmt.addElem("flipCommands", shade->flipCommands);
    fmt.addElem("flipPosition", shade->flipPosition);
    fmt.addElem("repeats", shade->repeats);
    fmt.addElem("sortOrder", shade->sortOrder);
    fmt.addElem("gpioUp", shade->gpioUp);
    fmt.addElem("gpioDown", shade->gpioDown);
    fmt.addElem("gpioMy", shade->gpioMy);
    fmt.addElem("gpioFlags", shade->gpioFlags);
    fmt.addElem("roomId", shade->roomId);
    fmt.addElem("ledFeedback", shade->ledFeedback);
    fmt.addElem("tiltFirstOnOpen", shade->tiltFirstOnOpen);
    fmt.addElem("tiltFirstOnClose", shade->tiltFirstOnClose);
    fmt.addElem("slackUp", (uint32_t)shade->slackUp);
    fmt.addElem("slackDown", (uint32_t)shade->slackDown);
    fmt.addElem("upMidTime", (uint32_t)shade->upMidTime);
    fmt.addElem("downMidTime", (uint32_t)shade->downMidTime);
    fmt.addElem("outputMode", static_cast<uint8_t>(shade->outputMode));
    fmt.addElem("pulseTime", (uint32_t)shade->pulseTime);
    fmt.addElem("stateVocab", static_cast<uint8_t>(shade->stateVocab));
    fmt.addElem("setupSteps", shade->setupSteps);
    fmt.addElem("lastRollingCode", (uint32_t)shade->lastRollingCode);
    if(shade->remoteModel[0]) fmt.addElem("remoteModel", shade->remoteModel);
    fmt.beginArray("linkedRemotes");
    for(uint8_t j = 0; j < SOMFY_MAX_LINKED_REMOTES; j++) {
      uint32_t addr = shade->linkedRemotes[j].getRemoteAddress();
      if(addr != 0) fmt.addElem(addr);
    }
    fmt.endArray();
    ok &= this->writeNdjsonLine(fmt, buff, "shade");
  }

  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup *group = &s->groups[i];
    if(group->getGroupId() == 255) continue;
    open();
    fmt.addElem("rec", "group");
    fmt.addElem("groupId", group->getGroupId());
    fmt.addElem("groupType", static_cast<uint8_t>(group->groupType));
    fmt.addElem("remoteAddress", (uint32_t)group->getRemoteAddress());
    fmt.addElem("name", group->name);
    fmt.addElem("proto", static_cast<uint8_t>(group->proto));
    fmt.addElem("bitLength", group->bitLength);
    fmt.addElem("repeats", group->repeats);
    fmt.addElem("sortOrder", group->sortOrder);
    fmt.addElem("flipCommands", group->flipCommands);
    fmt.addElem("roomId", group->roomId);
    fmt.addElem("ledFeedback", group->ledFeedback);
    fmt.addElem("lastRollingCode", (uint32_t)group->lastRollingCode);
    if(group->remoteModel[0]) fmt.addElem("remoteModel", group->remoteModel);
    fmt.beginArray("linkedShades");
    for(uint8_t j = 0; j < SOMFY_MAX_GROUPED_SHADES; j++) {
      uint8_t id = group->linkedShades[j];
      if(id > 0 && id < 255) fmt.addElem(id);
    }
    fmt.endArray();
    ok &= this->writeNdjsonLine(fmt, buff, "group");
  }

  for(uint8_t i = 0; i < SOMFY_MAX_REMOTE_NAMES; i++) {
    somfy_remote_name_t *r = &s->remoteNames[i];
    if(r->address == 0 || !r->name[0] || !s->isLinkedRemote(r->address)) continue;
    open();
    fmt.addElem("rec", "remoteName");
    fmt.addElem("address", (uint32_t)r->address);
    fmt.addElem("name", r->name);
    ok &= this->writeNdjsonLine(fmt, buff, "remoteName");
  }

  for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++) {
    if(s->repeaters[i] == 0) continue;
    open();
    fmt.addElem("rec", "repeater");
    fmt.addElem("address", (uint32_t)s->repeaters[i]);
    if(s->repeaterNames[i][0]) fmt.addElem("name", s->repeaterNames[i]);
    ok &= this->writeNdjsonLine(fmt, buff, "repeater");
  }

  for(uint8_t i = 0; i < SOMFY_MAX_LISTENERS; i++) {
    somfy_listener_t *l = &s->listeners[i];
    if(l->address == 0) continue;
    open();
    fmt.addElem("rec", "listener");
    fmt.addElem("address", (uint32_t)l->address);
    fmt.addElem("name", l->name);
    ok &= this->writeNdjsonLine(fmt, buff, "listener");
  }

  schedule.lock();
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &schedule.schedules[i];
    if(rule->getId() == 255) continue;
    open();
    fmt.addElem("rec", "schedule");
    fmt.addElem("scheduleId", rule->getId());
    fmt.addElem("name", rule->name);
    fmt.addElem("dayMask", rule->dayMask);
    fmt.addElem("hour", rule->hour);
    fmt.addElem("minute", rule->minute);
    fmt.addElem("targetType", static_cast<uint8_t>(rule->targetType));
    fmt.addElem("targetId", rule->targetId);
    fmt.addElem("targetPos", rule->targetPos);
    fmt.addElem("targetTilt", rule->targetTilt);
    fmt.addElem("enabled", rule->enabled);
    fmt.addElem("retries", rule->retries);
    fmt.addElem("positionMode", static_cast<uint8_t>(rule->positionMode));
    fmt.addElem("timeRef", static_cast<uint8_t>(rule->timeRef));
    fmt.addElem("sunOffset", (int32_t)rule->sunOffset);
    ok &= this->writeNdjsonLine(fmt, buff, "schedule");
  }
  schedule.unlock();

  free(buff);
  return ok;
}

/* ------------------------------------------------------------------ Lecture */

// Les lignes shade/group/room/schedule posent leurs champs DIRECTEMENT, comme les lecteurs
// positionnels : les fromJSON(JsonObject&) du modèle sont le dialecte de l'API (validation croisée
// contre le modèle vivant, remise à zéro des temps sur changement de type, clés linkedAddresses/
// hasTilt) -- une restauration doit reproduire l'état sauvegardé, pas négocier avec l'état courant.
// Les lignes settings/net/mqtt/radio réutilisent en revanche les fromJSON des réglages, dont les
// clés et les bornes sont exactement celles du contrat.

static void ndjsonApplyShade(JsonObject &obj, SomfyShade *shade) {
  shade->setShadeId(obj["shadeId"] | (uint8_t)255);
  jget(obj, "paired", shade->paired);
  if(obj.containsKey("shadeType")) shade->shadeType = static_cast<shade_types>(obj["shadeType"].as<uint8_t>());
  if(obj.containsKey("remoteAddress")) shade->setRemoteAddress(obj["remoteAddress"].as<uint32_t>());
  if(obj.containsKey("name")) strlcpyUtf8(shade->name, obj["name"] | "", sizeof(shade->name));
  if(obj.containsKey("tiltType")) shade->tiltType = static_cast<tilt_types>(obj["tiltType"].as<uint8_t>());
  if(obj.containsKey("proto")) shade->proto = static_cast<radio_proto>(obj["proto"].as<uint8_t>());
  if(obj.containsKey("bitLength")) {
    // Le fichier est désormais du texte éditable : mêmes seules valeurs que l'API (0 = hériter du
    // transceiver), toute autre ferait lire sendFrame() hors de son tampon de trame.
    uint8_t bl = obj["bitLength"].as<uint8_t>();
    if(bl == 0 || bl == 56 || bl == 80) shade->bitLength = bl;
  }
  jget(obj, "upTime", shade->upTime);
  jget(obj, "downTime", shade->downTime);
  jget(obj, "tiltTimeUp", shade->tiltTimeUp);
  jget(obj, "tiltTimeDown", shade->tiltTimeDown);
  jget(obj, "stepSize", shade->stepSize);
  jget(obj, "flags", shade->flags);
  // Positions calculées en LOCALES et posées tout en bas de cette fonction : le modèle s'écrit
  // sans verrou depuis async_tcp pendant que loopTask le lit et le recale (checkMovement). Écrire
  // currentPos ici puis target bien plus bas -- avec le reconcile NVS, des millisecondes, entre
  // les deux -- laissait loopTask recaler la position sur l'ANCIENNE cible de l'emplacement :
  // constaté sur banc, positions perdues sur la moitié du parc à chaque restauration.
  float myPos = obj.containsKey("myPos") ? obj["myPos"].as<float>() : shade->myPos;
  float myTiltPos = obj.containsKey("myTiltPos") ? obj["myTiltPos"].as<float>() : shade->myTiltPos;
  float curPos = obj.containsKey("currentPos") ? obj["currentPos"].as<float>() : shade->currentPos;
  float curTiltPos = obj.containsKey("currentTiltPos") ? obj["currentTiltPos"].as<float>() : shade->currentTiltPos;
  jget(obj, "flipCommands", shade->flipCommands);
  jget(obj, "flipPosition", shade->flipPosition);
  if(obj.containsKey("repeats")) shade->repeats = max(obj["repeats"].as<uint8_t>(), (uint8_t)1);
  shade->sortOrder = obj["sortOrder"] | (uint8_t)(shade->getShadeId() - 1);
  jget(obj, "gpioUp", shade->gpioUp);
  jget(obj, "gpioDown", shade->gpioDown);
  jget(obj, "gpioMy", shade->gpioMy);
  jget(obj, "gpioFlags", shade->gpioFlags);
  jget(obj, "roomId", shade->roomId);
  jget(obj, "ledFeedback", shade->ledFeedback);
  jget(obj, "tiltFirstOnOpen", shade->tiltFirstOnOpen);
  jget(obj, "tiltFirstOnClose", shade->tiltFirstOnClose);
  jget(obj, "slackUp", shade->slackUp);
  jget(obj, "slackDown", shade->slackDown);
  jget(obj, "upMidTime", shade->upMidTime);
  jget(obj, "downMidTime", shade->downMidTime);
  if(obj.containsKey("outputMode")) {
    uint8_t v = obj["outputMode"];
    shade->outputMode = (v == static_cast<uint8_t>(switch_output_t::pulse)) ? switch_output_t::pulse : switch_output_t::latching;
  }
  if(obj.containsKey("pulseTime")) {
    uint32_t v = obj["pulseTime"];
    shade->pulseTime = (uint16_t)constrain(v, SWITCH_PULSE_MIN_MS, SWITCH_PULSE_MAX_MS);
  }
  if(obj.containsKey("stateVocab")) {
    uint8_t v = obj["stateVocab"];
    shade->stateVocab = (v <= static_cast<uint8_t>(switch_vocab_t::activeIdle)) ? static_cast<switch_vocab_t>(v) : switch_vocab_t::onOff;
  }
  jget(obj, "setupSteps", shade->setupSteps);
  if(obj.containsKey("remoteModel")) shade->setRemoteModel(obj["remoteModel"] | "");
  if(obj.containsKey("linkedRemotes")) {
    for(uint8_t j = 0; j < SOMFY_MAX_LINKED_REMOTES; j++) shade->linkedRemotes[j] = SomfyLinkedRemote();
    JsonArray arr = obj["linkedRemotes"];
    uint8_t j = 0;
    for(JsonVariant v : arr) {
      if(j >= SOMFY_MAX_LINKED_REMOTES) break;
      // Nombre nu (contrat de la sauvegarde) ou objet {remoteAddress} (dialecte de l'API) : les
      // deux formes se rencontrent dans des fichiers retouchés à la main.
      uint32_t addr = v.is<JsonObject>() ? v["remoteAddress"].as<uint32_t>() : v.as<uint32_t>();
      if(addr != 0) shade->linkedRemotes[j++].setRemoteAddress(addr);
    }
  }
  jget(obj, "lastRollingCode", shade->lastRollingCode);
  if(shade->getRemoteAddress() != 0) {
    Preferences pref;  // instance LOCALE -- cf. l'invariant en tete de ConfigSettings.h
    pref.begin("ShadeCodes");
    shade->lastRollingCode = ShadeConfigFile::reconcileRollingCode(pref, shade->getRemotePrefId(), shade->lastRollingCode);
    pref.end();
  }
  // Mêmes normalisations que le lecteur positionnel (cohérence tilt/type, bornes), sur les
  // locales ; puis l'écriture dans le modèle, cible AVANT position : si loopTask recale entre les
  // deux, il recale sur la cible restaurée, pas sur un reliquat.
  if(myPos > 100 || myPos < 0) myPos = -1;
  if(myTiltPos > 100 || myTiltPos < 0) myTiltPos = -1;
  curPos = cfgClampPos(curPos);
  curTiltPos = cfgClampPos(curTiltPos);
  if(shade->tiltType == tilt_types::none || shade->shadeType != shade_types::blind) {
    myTiltPos = -1;
    curTiltPos = 0;
    shade->tiltType = tilt_types::none;
  }
  if(shade->tiltType == tilt_types::tiltonly) myPos = curPos = 100.0f;
  shade->myPos = myPos;
  shade->myTiltPos = myTiltPos;
  shade->tiltTarget = floor(curTiltPos);
  shade->currentTiltPos = curTiltPos;
  shade->target = floor(curPos);
  shade->currentPos = curPos;
  if(shade->proto == radio_proto::GP_Relay || shade->proto == radio_proto::GP_Remote) {
    pinMode(shade->gpioUp, OUTPUT);
    pinMode(shade->gpioDown, OUTPUT);
  }
  if(shade->proto == radio_proto::GP_Remote) pinMode(shade->gpioMy, OUTPUT);
}

static void ndjsonApplyGroup(JsonObject &obj, SomfyGroup *group) {
  group->setGroupId(obj["groupId"] | (uint8_t)255);
  if(obj.containsKey("groupType")) group->groupType = static_cast<group_types>(obj["groupType"].as<uint8_t>());
  if(obj.containsKey("remoteAddress")) group->setRemoteAddress(obj["remoteAddress"].as<uint32_t>());
  if(obj.containsKey("name")) strlcpyUtf8(group->name, obj["name"] | "", sizeof(group->name));
  if(obj.containsKey("proto")) group->proto = static_cast<radio_proto>(obj["proto"].as<uint8_t>());
  if(obj.containsKey("bitLength")) {
    uint8_t bl = obj["bitLength"].as<uint8_t>();
    if(bl == 0 || bl == 56 || bl == 80) group->bitLength = bl;
  }
  if(obj.containsKey("repeats")) group->repeats = max(obj["repeats"].as<uint8_t>(), (uint8_t)1);
  group->sortOrder = obj["sortOrder"] | (uint8_t)(group->getGroupId() - 1);
  jget(obj, "flipCommands", group->flipCommands);
  jget(obj, "roomId", group->roomId);
  jget(obj, "ledFeedback", group->ledFeedback);
  if(obj.containsKey("remoteModel")) group->setRemoteModel(obj["remoteModel"] | "");
  if(obj.containsKey("linkedShades")) {
    memset(group->linkedShades, 0x00, sizeof(group->linkedShades));
    JsonArray arr = obj["linkedShades"];
    uint8_t j = 0;
    for(JsonVariant v : arr) {
      if(j >= SOMFY_MAX_GROUPED_SHADES) break;
      uint8_t id = v.is<JsonObject>() ? v["shadeId"].as<uint8_t>() : v.as<uint8_t>();
      if(id > 0 && id < 255) group->linkedShades[j++] = id;
    }
  }
  jget(obj, "lastRollingCode", group->lastRollingCode);
  if(group->getRemoteAddress() != 0) {
    Preferences pref;  // instance LOCALE -- cf. l'invariant en tete de ConfigSettings.h
    pref.begin("ShadeCodes");
    group->lastRollingCode = ShadeConfigFile::reconcileRollingCode(pref, group->getRemotePrefId(), group->lastRollingCode);
    pref.end();
  }
  group->compressLinkedShadeIds();
}

static void ndjsonApplySchedule(JsonObject &obj, ScheduleRule *rule) {
  rule->setId(obj["scheduleId"] | (uint8_t)255);
  if(obj.containsKey("name")) strlcpyUtf8(rule->name, obj["name"] | "", sizeof(rule->name));
  jget(obj, "dayMask", rule->dayMask);
  jget(obj, "hour", rule->hour);
  jget(obj, "minute", rule->minute);
  // Valeurs NUMÉRIQUES, comme le bloc positionnel : ScheduleRule::fromJSON parle le dialecte de
  // l'API ("shade"/"group", "my"/"tiltonly"), pas celui de la sauvegarde.
  if(obj.containsKey("targetType")) rule->targetType = static_cast<schedule_target_t>(obj["targetType"].as<uint8_t>());
  jget(obj, "targetId", rule->targetId);
  jget(obj, "targetPos", rule->targetPos);
  jget(obj, "targetTilt", rule->targetTilt);
  jget(obj, "enabled", rule->enabled);
  jget(obj, "retries", rule->retries);
  if(obj.containsKey("positionMode")) rule->positionMode = static_cast<schedule_position_mode_t>(obj["positionMode"].as<uint8_t>());
  if(obj.containsKey("timeRef")) rule->timeRef = static_cast<schedule_time_ref_t>(obj["timeRef"].as<uint8_t>());
  jget(obj, "sunOffset", rule->sunOffset);
}

static void ndjsonApplySettings(JsonObject &obj) {
  // Mêmes bornes que le lecteur positionnel : ces quatre champs n'ont pas de validation dans
  // ConfigSettings::fromJSON (elle vit dans /setgeneral, en amont), et le fichier est éditable.
  if(obj.containsKey("ledPin")) {
    int8_t pin = obj["ledPin"].as<int8_t>();
    if(pin < -1 || pin > 48) obj["ledPin"] = -1;
  }
  if(obj.containsKey("ledColorOrder") && obj["ledColorOrder"].as<uint8_t>() > 1) obj["ledColorOrder"] = 0;
  if(obj.containsKey("ledColorActivity")) {
    const char *c = obj["ledColorActivity"] | "";
    bool hex = c[0] == '#' && strlen(c) == 7;
    for(uint8_t i = 1; hex && i <= 6; i++) hex = isxdigit((unsigned char)c[i]);
    if(!hex) obj.remove("ledColorActivity");
  }
  settings.fromJSON(obj);
  settings.NTP.fromJSON(obj);
  if(obj.containsKey("iconPack")) {
    const char *p = obj["iconPack"] | "";
    bool okPack = true;
    for(const char *c = p; okPack && *c; c++) okPack = islower((unsigned char)*c) || isdigit((unsigned char)*c) || *c == '-';
    if(okPack) strlcpy(settings.iconPack, p, sizeof(settings.iconPack));
  }
}

bool ShadeConfigFile::restoreNdjson(SomfyShadeController *s, restore_options_t &opts) {
  char *line = (char *)malloc(NDJSON_LINE_BUF);
  if(!line) return false;
  DynamicJsonDocument *doc = new DynamicJsonDocument(NDJSON_DOC_SIZE);
  if(!doc || doc->capacity() == 0) { free(line); delete doc; return false; }

  bool metaSeen = false, failed = false;
  char metaServerId[10] = "";
  uint8_t roomIdx = 0, shadeIdx = 0, groupIdx = 0, schedIdx = 0;

  // Le fichier fait foi pour les collections optionnelles : une sauvegarde NDJSON décrit l'état
  // complet, l'absence de lignes signifie « aucun », pas « inconnu » comme dans les générations
  // positionnelles antérieures aux blocs correspondants.
  if(opts.repeaters) {
    memset(s->repeaters, 0x00, sizeof(uint32_t) * SOMFY_MAX_REPEATERS);
    memset(s->repeaterNames, 0x00, sizeof(s->repeaterNames));
  }
  if(opts.listeners) {
    for(uint8_t i = 0; i < SOMFY_MAX_LISTENERS; i++) s->listeners[i] = somfy_listener_t();
  }
  if(opts.shades) {
    for(uint8_t i = 0; i < SOMFY_MAX_REMOTE_NAMES; i++) s->remoteNames[i] = somfy_remote_name_t();
  }
  if(opts.shades) {
    schedule.lock();
    for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) schedule.schedules[i].clear();
    schedule.unlock();
  }

  while(this->file.available()) {
    size_t n = this->file.readBytesUntil('\n', line, NDJSON_LINE_BUF - 1);
    line[n] = '\0';
    if(n == 0) continue;
    if(n == NDJSON_LINE_BUF - 1) {
      // Ligne plus longue que le tampon : tronquée elle serait du JSON invalide, on la jette
      // entière et on se recale sur la fin de ligne. Le reste du fichier est intact.
      Serial.println("[CFG] ligne NDJSON plus longue que le tampon -- ignoree");
      this->seekChar(CFG_REC_END);
      continue;
    }
    DeserializationError err = deserializeJson(*doc, line, n);
    if(err) {
      if(!metaSeen) { failed = true; break; }   // première ligne illisible = fichier refusé
      Serial.printf("[CFG] ligne NDJSON illisible (%s) -- ignoree\n", err.c_str());
      continue;
    }
    JsonObject obj = doc->as<JsonObject>();
    const char *rec = obj["rec"] | "";
    if(!metaSeen) {
      // Seul contrôle dur du format : la première ligne est un meta lisible (spec §3).
      if(strcmp(rec, "meta") != 0) { failed = true; break; }
      strlcpy(metaServerId, obj["serverId"] | "", sizeof(metaServerId));
      metaSeen = true;
      continue;
    }
    if(strcmp(rec, "settings") == 0) {
      if(opts.settings) ndjsonApplySettings(obj);
    }
    else if(strcmp(rec, "net") == 0) {
      if(opts.network) {
        if(obj.containsKey("connType")) settings.connType = static_cast<conn_types_t>(obj["connType"].as<uint8_t>());
        settings.IP.fromJSON(obj);
        // Même règle que le lecteur positionnel : la configuration Ethernet ne se restaure que sur
        // l'appareil d'origine -- des broches PHY d'une autre carte rendraient le réseau muet.
        if(strncmp(settings.serverId, metaServerId, sizeof(settings.serverId)) == 0) {
          jget(obj, "ethBoardType", settings.Ethernet.boardType);
          jget(obj, "ethPhyType", settings.Ethernet.phyType);
          jget(obj, "ethCLKMode", settings.Ethernet.CLKMode);
          jget(obj, "ethPhyAddress", settings.Ethernet.phyAddress);
          jget(obj, "ethPWRPin", settings.Ethernet.PWRPin);
          jget(obj, "ethMDCPin", settings.Ethernet.MDCPin);
          jget(obj, "ethMDIOPin", settings.Ethernet.MDIOPin);
        }
      }
    }
    else if(strcmp(rec, "mqtt") == 0) {
      if(opts.mqtt) settings.MQTT.fromJSON(obj);
    }
    else if(strcmp(rec, "radio") == 0) {
      if(opts.transceiver) s->transceiver.config.fromJSON(obj);
    }
    else if(strcmp(rec, "room") == 0) {
      if(opts.shades && roomIdx < SOMFY_MAX_ROOMS) {
        SomfyRoom *room = &s->rooms[roomIdx];
        room->roomId = obj["roomId"] | (uint8_t)0;
        if(room->roomId == 0) continue;
        strlcpyUtf8(room->name, obj["name"] | "", sizeof(room->name));
        room->sortOrder = obj["sortOrder"] | (uint8_t)(room->roomId - 1);
        roomIdx++;
      }
    }
    else if(strcmp(rec, "shade") == 0) {
      if(opts.shades && shadeIdx < SOMFY_MAX_SHADES) {
        SomfyShade *shade = &s->shades[shadeIdx];
        ndjsonApplyShade(obj, shade);
        if(shade->getShadeId() == 255) shade->clear();
        else shadeIdx++;
      }
    }
    else if(strcmp(rec, "group") == 0) {
      if(opts.shades && groupIdx < SOMFY_MAX_GROUPS) {
        SomfyGroup *group = &s->groups[groupIdx];
        ndjsonApplyGroup(obj, group);
        if(group->getGroupId() == 255) group->clear();
        else groupIdx++;
      }
    }
    else if(strcmp(rec, "remoteName") == 0) {
      if(opts.shades) s->renameRemote(obj["address"] | (uint32_t)0, obj["name"] | "");
    }
    else if(strcmp(rec, "repeater") == 0) {
      if(opts.repeaters) {
        uint32_t addr = obj["address"] | (uint32_t)0;
        if(addr != 0) {
          s->linkRepeater(addr);
          if(obj.containsKey("name")) s->renameRepeater(addr, obj["name"] | "");
        }
      }
    }
    else if(strcmp(rec, "listener") == 0) {
      if(opts.listeners) {
        uint32_t addr = obj["address"] | (uint32_t)0;
        if(addr != 0) s->linkListener(addr, obj["name"] | "");
      }
    }
    else if(strcmp(rec, "schedule") == 0) {
      if(opts.shades && schedIdx < SOMFY_MAX_SCHEDULES) {
        schedule.lock();
        ScheduleRule *rule = &schedule.schedules[schedIdx];
        ndjsonApplySchedule(obj, rule);
        if(rule->getId() == 255) rule->clear();
        else schedIdx++;
        schedule.unlock();
      }
    }
    // Clé `rec` inconnue : ignorée sans bruit, c'est la règle qui remplace les gardes de version.
  }

  if(failed) {
    Serial.println("[CFG] sauvegarde NDJSON sans ligne meta lisible -- restauration refusee");
    free(line);
    delete doc;
    return false;
  }

  // Les emplacements au-delà du contenu du fichier sont vidés, comme dans restoreFile().
  if(opts.shades) {
    while(roomIdx < SOMFY_MAX_ROOMS) s->rooms[roomIdx++].clear();
    while(shadeIdx < SOMFY_MAX_SHADES) s->shades[shadeIdx++].clear();
    while(groupIdx < SOMFY_MAX_GROUPS) s->groups[groupIdx++].clear();
    s->commit();
    schedule.isDirty = true;
    schedule.commit();
  }
  if(opts.listeners || opts.repeaters) s->isDirty = true;
  if(opts.transceiver) s->transceiver.save();
  if(opts.settings || opts.network) settings.save();
  if(opts.settings) settings.NTP.save();
  if(opts.network) {
    settings.IP.save();
    settings.WIFI.save();
    settings.Ethernet.save();
  }
  if(opts.mqtt) settings.MQTT.save();
  free(line);
  delete doc;
  return true;
}
