#include <Arduino.h>
#include <ArduinoJson.h>
#include "ConfigSettings.h"
#include "Somfy.h"
#include "Sockets.h"
#include "MQTT.h"

// Publication de l'état des équipements/groupes/pièces vers MQTT, et de leur fiche de découverte
// Home Assistant (publishDisco -- device_class, topics command/state/tilt selon le shadeType).
// Extrait de Somfy.cpp : c'est un consommateur de l'état (currentPos, tiltType, ...), jamais un
// producteur -- ne touche à aucune cible de mouvement, contrairement à SomfyDispatch.cpp/
// SomfyPositioning.cpp.

#include <Preferences.h>

extern MQTTClass mqtt;
extern SocketEmitter sockEmit;
extern ConfigSettings settings;

// --- Mémoire des identifiants RÉELLEMENT publiés vers MQTT (23/08/2026) ---
//
// Le nettoyage des topics retenus balayait auparavant TOUS les identifiants possibles à chaque
// connexion au courtier -- 1..32 pour les équipements, 1..16 pour les groupes -- en émettant un message
// vide sur chacun de leurs ~19 sous-topics. Soit près de 600 publications à chaque connexion, dont
// la quasi-totalité pour des emplacements qui n'avaient jamais rien publié. Effet visible en usage
// réel : un explorateur MQTT affichait 32 équipements et 16 groupes fantômes, dont un seul existait.
//
// Le remède n'est pas de supprimer ce nettoyage -- il a une vraie raison d'être : un équipement supprimé
// PENDANT que MQTT était déconnecté ne passe jamais par SomfyShade::unpublish(), ses topics retenus
// resteraient donc chez le courtier indéfiniment. Il faut seulement savoir QUOI nettoyer.
//
// D'où ces masques persistés : un bit par identifiant, ce qui tient exactement dans un uint32_t
// (32 équipements) et deux uint16_t (16 groupes, 16 pièces). À la connexion, on ne nettoie que les
// identifiants présents dans le masque de la session précédente et absents de la configuration
// actuelle. Zéro publication inutile, et le cas "supprimé hors ligne" reste couvert.
//
// Les PIÈCES ont été ajoutées au mécanisme le 23/08/2026 : elles en étaient exclues alors qu'elles
// publient bel et bien (SomfyRoom::emitState() appelle publish()). Une pièce supprimée pendant que
// MQTT était déconnecté ne passait par aucun chemin de nettoyage -- ni par deleteRoom(), hors
// ligne, ni par SomfyShadeController::publish(), qui ne connaissait qu'équipements et groupes.
//
// Écriture NVS uniquement quand le masque CHANGE : ces fonctions sont aussi appelées à chaque
// ajout/suppression, et réécrire à l'identique userait la flash pour rien.
#define MQTT_PUB_NAMESPACE "mqttpub"
static void loadPublishedMasks(uint32_t &shadeMask, uint16_t &groupMask, uint16_t &roomMask) {
  Preferences pref;  // instance LOCALE -- cf. l'invariant en tete de ConfigSettings.h
  // Ouverture en LECTURE-ÉCRITURE, pas en lecture seule : au tout premier démarrage le namespace
  // n'existe pas encore, et Preferences::begin(..., true) échoue alors en imprimant un log_e
  // ("nvs_open failed: NOT_FOUND") -- visible en rouge sur la liaison série avec le
  // CORE_DEBUG_LEVEL=1 du projet. Les valeurs par défaut seraient correctes malgré tout, mais ce
  // serait une ligne d'erreur pour un fonctionnement parfaitement nominal : le projet a déjà eu à
  // démêler ce genre de faux signal (cf. les "does not exist" de LittleFS.exists() dans
  // WebI18n.cpp). Le mode lecture-écriture crée simplement le namespace, sans rien y écrire.
  pref.begin(MQTT_PUB_NAMESPACE, false);
  shadeMask = pref.getULong("shades", 0);
  groupMask = (uint16_t)pref.getUShort("groups", 0);
  roomMask = (uint16_t)pref.getUShort("rooms", 0);
  pref.end();
}
static void storeShadeMask(uint32_t mask) {
  Preferences pref;  // instance LOCALE -- cf. l'invariant en tete de ConfigSettings.h
  pref.begin(MQTT_PUB_NAMESPACE, false);
  if(pref.getULong("shades", 0) != mask) pref.putULong("shades", mask);
  pref.end();
}
static void storeGroupMask(uint16_t mask) {
  Preferences pref;  // instance LOCALE -- cf. l'invariant en tete de ConfigSettings.h
  pref.begin(MQTT_PUB_NAMESPACE, false);
  if(pref.getUShort("groups", 0) != mask) pref.putUShort("groups", mask);
  pref.end();
}
static void storeRoomMask(uint16_t mask) {
  Preferences pref;  // instance LOCALE -- cf. l'invariant en tete de ConfigSettings.h
  pref.begin(MQTT_PUB_NAMESPACE, false);
  if(pref.getUShort("rooms", 0) != mask) pref.putUShort("rooms", mask);
  pref.end();
}

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
void SomfyRoom::unpublish() { SomfyRoom::unpublish(this->roomId); }
// Variante par identifiant, sur le modèle de SomfyShade/SomfyGroup : le balayage des pièces
// supprimées hors ligne n'a plus d'objet SomfyRoom à sa disposition -- l'emplacement a été
// remis à zéro par clear(), c'est justement la raison pour laquelle il faut le masque.
void SomfyRoom::unpublish(uint8_t id) {
  if(mqtt.connected()) {
    char topic[64];
    sprintf(topic, "rooms/%d/roomId", id);
    mqtt.unpublish(topic);
    sprintf(topic, "rooms/%d/name", id);
    mqtt.unpublish(topic);
    sprintf(topic, "rooms/%d/sortOrder", id);
    mqtt.unpublish(topic);
  }
}
// RÉTENTION : tout ce qui sort d'ici est un ÉTAT, pas un événement -- un abonné qui se connecte
// après coup doit pouvoir le lire sans attendre le prochain changement. `lastRollingCode`,
// `sunFlag`, `sunny` et `windy` étaient les seuls à ne pas être retenus, sans raison apparente :
// `lastRollingCode` l'est depuis toujours côté groupe pour la même donnée, et les trois autres
// sont même PILOTABLES (`shades/+/sunny/set` est abonné), donc une domotique qui relit avant
// d'écrire n'avait rien à relire au redémarrage. À ne pas confondre avec cmdSource/cmdAddress/cmd
// (Somfy.cpp), délibérément non retenus : ceux-là sont des événements.
//
// PUBLICATION SOUS CONDITION : quand la condition tombe, le topic retenu doit être EFFACÉ, sinon
// il survit indéfiniment avec sa dernière valeur. Passer un équipement d'un type incliné à `none`
// laissait ainsi trois topics d'inclinaison périmés chez le courtier -- même famille de défaut
// que les fiches de découverte cover/switch (cf. publishDisco). Le nettoyage est ici gratuit :
// publishState() n'est atteinte que depuis publish(), donc à l'enregistrement d'un équipement et à la
// connexion au courtier -- jamais pendant un mouvement.
void SomfyShade::publishState() {
  if(mqtt.connected()) {
    this->publish("position", this->transformPosition(this->currentPos), true);
    this->publish("direction", this->direction, true);
    this->publish("target", this->transformPosition(this->target), true);
    this->publish("lastRollingCode", this->lastRollingCode, true);
    this->publish("mypos", this->transformPosition(this->myPos), true);
    this->publish("myTiltPos", this->transformPosition(this->myTiltPos), true);
    if(this->tiltType != tilt_types::none) {
      this->publish("tiltDirection", this->tiltDirection, true);
      this->publish("tiltPosition", this->transformPosition(this->currentTiltPos), true);
      this->publish("tiltTarget", this->transformPosition(this->tiltTarget), true);
    }
    else {
      SomfyShade::unpublish(this->shadeId, "tiltDirection");
      SomfyShade::unpublish(this->shadeId, "tiltPosition");
      SomfyShade::unpublish(this->shadeId, "tiltTarget");
    }
    // Le cache de publishMovementState() suit ce qui vient d'être émis ici, sinon le tour de
    // boucle suivant republierait les six topics à l'identique. Les topics d'inclinaison
    // repassent à "jamais publié" quand ils sont effacés : réactiver l'inclinaison doit les
    // republier, même si la valeur n'a pas changé entre-temps.
    this->pubPosition = this->transformPosition(this->currentPos);
    this->pubDirection = this->direction;
    this->pubTarget = this->transformPosition(this->target);
    if(this->tiltType != tilt_types::none) {
      this->pubTiltDirection = this->tiltDirection;
      this->pubTiltPosition = this->transformPosition(this->currentTiltPos);
      this->pubTiltTarget = this->transformPosition(this->tiltTarget);
    }
    else this->pubTiltDirection = this->pubTiltPosition = this->pubTiltTarget = -2;
    this->publishFlags();
    this->pubFlags = this->flags;
  }
}
// Émetteur unique des topics dérivés de `flags`. Cf. sa déclaration dans Somfy.h pour le pourquoi
// de la factorisation. Ne touche PAS à pubFlags : c'est à l'appelant de le poser, parce que les
// deux appelants n'ont pas la même notion de « à jour » (publishState() republie tout de force,
// publishMovementState() ne vient ici qu'après avoir constaté une différence).
void SomfyShade::publishFlags() {
  if(!mqtt.connected()) return;
  const uint8_t sunFlag = !!(this->flags & static_cast<uint8_t>(somfy_flags_t::SunFlag));
  const uint8_t isSunny = !!(this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny));
  const uint8_t isWindy = !!(this->flags & static_cast<uint8_t>(somfy_flags_t::Windy));
  // `flags` lui-même : c'est le topic que consomme un client qui veut le masque brut, et c'est
  // celui sur lequel la divergence a été mesurée le 24/08 (REST 129 / MQTT 128 figé).
  this->publish("flags", this->flags, true);
  if(this->hasSunSensor()) {
    this->publish("sunFlag", sunFlag, true);
    this->publish("sunny", isSunny, true);
  }
  else {
    SomfyShade::unpublish(this->shadeId, "sunFlag");
    SomfyShade::unpublish(this->shadeId, "sunny");
  }
  this->publish("windy", isWindy, true);
}
// Étranglement de la POSITION pendant un mouvement. checkMovement() fait changer la position
// entière jusqu'à cinq fois par seconde : republier autant vers le courtier saturerait la liaison
// pour rien, et chaque mqtt.publish() se fait sur la tâche principale, celle qui porte aussi le
// séquencement radio -- un courtier lent y coûterait jusqu'à setSocketTimeout(2). Une seconde est
// largement suffisante pour qu'une entité domotique suive le trajet, et la position finale, elle,
// est publiée sans délai (cf. ci-dessous).
#define MQTT_MOVE_PUBLISH_MS 1000
// Ce que la WebSocket diffusait déjà et que MQTT ne voyait pas : SomfyShade::emitState() n'émet
// que sur la socket, et publishState() n'est atteinte que depuis publish() -- appelée à
// l'enregistrement d'un équipement et à la connexion au courtier. `shades/N/position` restait donc figé
// pendant tout le trajet, et un ordre venu d'une télécommande physique ne remontait jamais.
//
// Le choix a été de NE PAS greffer la publication sur les douze appels à emitState() du chemin de
// mouvement -- trop de sites, et certains ne sont que des renvois ciblés vers un seul client, pas
// des changements d'état. On compare l'état courant à ce qui a réellement été publié, à chaque
// tour de boucle : quel que soit le chemin qui a modifié la position, il est vu.
void SomfyShade::publishMovementState() {
  if(!mqtt.connected()) return;
  // La direction n'est JAMAIS retardée : c'est elle qui fait passer une entité domotique en
  // "ouverture"/"fermeture" puis à l'arrêt, et elle ne change qu'aux transitions -- son coût est
  // celui de deux messages par trajet, pas d'un flux.
  if(this->direction != this->pubDirection) {
    this->publish("direction", this->direction, true);
    this->pubDirection = this->direction;
  }
  if(this->tiltType != tilt_types::none && this->tiltDirection != this->pubTiltDirection) {
    this->publish("tiltDirection", this->tiltDirection, true);
    this->pubTiltDirection = this->tiltDirection;
  }
  // Les drapeaux ne sont JAMAIS étranglés non plus, et pour la même raison que la direction : ils
  // ne changent qu'à des transitions (capteur soleil/vent, commande SunFlag/Flag reçue d'une
  // télécommande ou de MQTT), jamais en flux. Placé AVANT le return d'étranglement ci-dessous,
  // sans quoi un drapeau qui bascule pendant un mouvement attendrait la fin de la fenêtre --
  // or c'est précisément pendant un mouvement qu'un capteur de vent se déclenche.
  if((int16_t)this->flags != this->pubFlags) {
    this->publishFlags();
    this->pubFlags = this->flags;
  }
  // Étranglement pendant le mouvement UNIQUEMENT. À l'arrêt, la comparaison passe sans délai :
  // la position finale part donc dès le tour de boucle qui suit l'arrêt, exacte, sans attendre
  // la fin d'une fenêtre. C'est la valeur qui compte le plus, c'est celle qui reste affichée.
  if(!this->isIdle() && (uint32_t)(millis() - this->lastMqttMove) < MQTT_MOVE_PUBLISH_MS) return;
  bool sent = false;
  const int8_t pos = this->transformPosition(this->currentPos);
  const int8_t tgt = this->transformPosition(this->target);
  if(pos != this->pubPosition) { this->publish("position", pos, true); this->pubPosition = pos; sent = true; }
  if(tgt != this->pubTarget) { this->publish("target", tgt, true); this->pubTarget = tgt; sent = true; }
  if(this->tiltType != tilt_types::none) {
    const int8_t tpos = this->transformPosition(this->currentTiltPos);
    const int8_t ttgt = this->transformPosition(this->tiltTarget);
    if(tpos != this->pubTiltPosition) { this->publish("tiltPosition", tpos, true); this->pubTiltPosition = tpos; sent = true; }
    if(ttgt != this->pubTiltTarget) { this->publish("tiltTarget", ttgt, true); this->pubTiltTarget = ttgt; sent = true; }
  }
  // Horodatage posé seulement si quelque chose est parti : un équipement immobile ne doit pas décaler
  // la fenêtre à chaque tour, sans quoi le premier mouvement attendrait une seconde de trop.
  if(sent) this->lastMqttMove = millis();
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
  // Fiche de l'AUTRE famille effacée dans la foulée. Le type d'un équipement peut passer de la famille
  // "cover" à drycontact (famille "switch") et inversement ; publishDisco() n'écrit alors plus que
  // la nouvelle fiche, et l'ancienne -- retenue -- restait chez le courtier : Home Assistant
  // continuait d'afficher une entité fantôme du type précédent, que seule la suppression de l'équipement
  // faisait disparaître (SomfyShade::unpublish efface bien les deux, elle).
  // Même famille de défaut que le nettoyage des groupes plus bas : on comparait ce qui est publié
  // à ce qui est nettoyé, sans jamais se demander ce qui avait été publié AVANT.
  // Un message vide sur un topic sans rétention ne coûte rien chez le courtier, et rend ce
  // nettoyage rétroactif : les installations déjà polluées se purgent à la prochaine connexion.
  if(this->shadeType != shade_types::drycontact && this->shadeType != shade_types::drycontact2)
    snprintf(topic, sizeof(topic), "%s/switch/%d/config", settings.MQTT.discoTopic, this->shadeId);
  else
    snprintf(topic, sizeof(topic), "%s/cover/%d/config", settings.MQTT.discoTopic, this->shadeId);
  mqtt.unpublish(topic);
}
// Retire la fiche de découverte de CET équipement. Écrite dès l'origine comme pendant de
// publishDisco(), elle est restée sans appelant jusqu'au 24/08/2026 -- d'où la seule chose qui lui
// manquait : un appelant. Elle en a un désormais, la route /connectmqtt, qui la déclenche quand
// l'utilisateur désactive la découverte ou change son préfixe.
//
// La garde `!settings.MQTT.pubDisco` n'est PAS auto-bloquante, contrairement à ce qu'on pourrait
// croire : elle n'est correcte que parce que l'appel a lieu AVANT que les nouveaux réglages ne
// soient appliqués. `pubDisco` vaut alors encore l'ancienne valeur, et `discoTopic` désigne encore
// les fiches réellement publiées. Appelée après, elle ne pourrait plus rien nommer.
//
// Les DEUX familles sont effacées, pas seulement celle du type courant : publishDisco() ne retire
// la fiche de l'autre famille que MQTT connecté, un changement de type fait hors ligne peut donc
// avoir laissé une fiche de la famille opposée.
void SomfyShade::unpublishDisco() {
  if(!mqtt.connected() || !settings.MQTT.pubDisco) return;
  char topic[128] = "";
  snprintf(topic, sizeof(topic), "%s/cover/%d/config", settings.MQTT.discoTopic, this->shadeId);
  mqtt.unpublish(topic);
  snprintf(topic, sizeof(topic), "%s/switch/%d/config", settings.MQTT.discoTopic, this->shadeId);
  mqtt.unpublish(topic);
}
// Balayage de toutes les fiches, pour le compte de /connectmqtt.
void SomfyShadeController::unpublishDisco() {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    if(this->shades[i].getShadeId() == 255) continue;
    this->shades[i].unpublishDisco();
  }
}
void SomfyShade::publish() {
  if(mqtt.connected()) {
    this->publish("shadeId", this->shadeId, true);
    this->publish("name", this->name, true);
    this->publish("remoteAddress", this->getRemoteAddress(), true);
    this->publish("shadeType", static_cast<uint8_t>(this->shadeType), true);
    this->publish("tiltType", static_cast<uint8_t>(this->tiltType), true);
    // `flags` n'est plus publié ici : publishFlags(), atteinte juste en dessous via publishState(),
    // en est désormais le propriétaire unique. Le publier aux deux endroits produisait deux
    // messages retenus identiques par enregistrement d'équipement, chacun coûtant un aller-retour vers
    // le courtier sur la tâche principale.
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
    // Retenus, comme tous les autres états du groupe (cf. SomfyShade::publishState). Publiés
    // sans condition, contrairement à l'équipement : rien à effacer ici.
    this->publish("sunFlag", sunFlag, true);
    this->publish("sunny", isSunny, true);
    this->publish("windy", isWindy, true);
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
// mqttTopicBuffer était ici un GLOBAL, rempli par snprintf() PUIS passé à mqtt.publish() --
// lequel ne prend son mutex qu'une fois appelé, donc APRÈS le remplissage. Deux tâches pouvaient
// s'y entrelacer : async_tcp remplit (via /saveShade -> save() -> publish(), une quinzaine de
// topics d'affilée) pendant que loopTask remplit aussi (publishMovementState(), à chaque tour).
// La valeur d'un équipement partait alors sur le topic d'un AUTRE équipement -- donnée fausse sur la
// mauvaise entité domotique, en silence.
//
// Un tampon LOCAL par appel supprime le partage : 55 octets de pile, contre un global que rien ne
// protégeait. Ne jamais réintroduire de tampon de composition à portée fichier ici (cf. le même
// raisonnement pour g_content en tête de web/WebCommon.h).
#define MQTT_TOPIC_BUF 55
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
    // publishState() émet aussi `sunFlag` (sous condition hasSunSensor(), qui n'est plus
    // consultable ici -- l'emplacement est vide) : absent de cette liste, un `shades/N/sunFlag`
    // retenu survivait seul à la suppression de l'équipement.
    SomfyShade::unpublish(id, "sunFlag");
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
    SomfyGroup::unpublish(id, "flipCommands");
    // Les topics MQTT sont SENSIBLES À LA CASSE. SomfyGroup::publish() émet `sunSensor`, cette
    // liste nettoyait `SunSensor` : le vrai topic n'était donc jamais effacé, et le nettoyage
    // créait en prime un topic fantôme `groups/N/SunSensor` qui n'avait jamais été publié.
    // Les deux étaient visibles côte à côte dans un explorateur MQTT.
    SomfyGroup::unpublish(id, "sunSensor");
    // Conservé le temps que les installations existantes se purgent : un message vide retenu
    // supprime la rétention chez le courtier, c'est le seul moyen de faire disparaître le
    // fantôme laissé par les versions précédentes.
    SomfyGroup::unpublish(id, "SunSensor");
    // Émis par SomfyGroup::publishState(), et absents de cette liste jusqu'ici : trois topics
    // retenus survivaient donc à la suppression du groupe.
    SomfyGroup::unpublish(id, "sunFlag");
    SomfyGroup::unpublish(id, "sunny");
    SomfyGroup::unpublish(id, "windy");
  }
}
void SomfyGroup::unpublish(uint8_t id, const char *topic) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", id, topic);
    mqtt.unpublish(mqttTopicBuffer);
  }
}
void SomfyShade::unpublish(uint8_t id, const char *topic) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", id, topic);
    mqtt.unpublish(mqttTopicBuffer);
  }
}
bool SomfyShade::publish(const char *topic, int8_t val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}

bool SomfyShade::publish(const char *topic, const char *val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyShade::publish(const char *topic, uint8_t val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyShade::publish(const char *topic, uint32_t val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyShade::publish(const char *topic, uint16_t val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyShade::publish(const char *topic, bool val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "shades/%u/%s", this->shadeId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}

bool SomfyGroup::publish(const char *topic, int8_t val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyGroup::publish(const char *topic, const char *val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyGroup::publish(const char *topic, uint8_t val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyGroup::publish(const char *topic, uint32_t val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyGroup::publish(const char *topic, uint16_t val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
bool SomfyGroup::publish(const char *topic, bool val, bool retain) {
  if(mqtt.connected()) {
    char mqttTopicBuffer[MQTT_TOPIC_BUF];
    snprintf(mqttTopicBuffer, sizeof(mqttTopicBuffer), "groups/%u/%s", this->groupId, topic);
    mqtt.publish(mqttTopicBuffer, val, retain);
    return true;
  }
  return false;
}
// Cf. le commentaire de déclaration dans Somfy.h : ces deux fonctions ont été EXTRAITES de
// SomfyShadeController::publish() ci-dessous pour pouvoir rafraîchir l'index sans republier tout
// le reste -- ce qu'exigent les ajouts et suppressions faits pendant que MQTT est déjà connecté.
// 128 octets suffisent largement : 32 identifiants de 2 chiffres au plus, virgules et crochets
// compris, soit 98 octets dans le pire cas.
void SomfyShadeController::publishShadeIndex() {
  if(!mqtt.connected()) return;
  // P-4 : curseur explicite. `strlen(arrIds)` était réévalué deux fois par identifiant, donc un
  // parcours complet de la chaîne à chaque tour.
  char arrIds[128];
  char *w = arrIds;
  *w++ = '[';
  uint32_t mask = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    uint8_t id = this->shades[i].getShadeId();
    if(id == 255) continue;
    if(w > arrIds + 1) *w++ = ',';
    w += sprintf(w, "%u", (unsigned)id);
    if(id >= 1 && id <= SOMFY_MAX_SHADES) mask |= (1UL << (id - 1));
  }
  *w++ = ']';
  *w = 0x00;
  mqtt.publish("shades", arrIds, true);
  // Le masque suit exactement ce qui vient d'être annoncé au courtier : cette fonction n'est
  // atteinte que MQTT connecté, donc « publié » et « existant » coïncident ici.
  storeShadeMask(mask);
}
void SomfyShadeController::publishGroupIndex() {
  if(!mqtt.connected()) return;
  // P-4 : curseur explicite. `strlen(arrIds)` était réévalué deux fois par identifiant, donc un
  // parcours complet de la chaîne à chaque tour.
  char arrIds[128];
  char *w = arrIds;
  *w++ = '[';
  uint16_t mask = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    uint8_t id = this->groups[i].getGroupId();
    if(id == 255) continue;
    if(w > arrIds + 1) *w++ = ',';
    w += sprintf(w, "%u", (unsigned)id);
    if(id >= 1 && id <= SOMFY_MAX_GROUPS) mask |= (1U << (id - 1));
  }
  *w++ = ']';
  *w = 0x00;
  mqtt.publish("groups", arrIds, true);
  storeGroupMask(mask);
}
// Index `rooms`, ajouté par symétrie avec `shades` et `groups` (23/08/2026). Ajout PUREMENT
// additif du point de vue des intégrations : aucun topic existant ne change de forme ni de
// contenu, un consommateur qui l'ignore continue de fonctionner à l'identique. Il rend surtout
// le masque des pièces publiables au même endroit que les deux autres.
// Les identifiants de pièce vont de 1 à SOMFY_MAX_ROOMS, 0 marquant un emplacement libre --
// contrairement aux équipements et aux groupes, où l'emplacement libre vaut 255.
void SomfyShadeController::publishRoomIndex() {
  if(!mqtt.connected()) return;
  char arrIds[128] = "[";
  uint16_t mask = 0;
  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    uint8_t id = this->rooms[i].roomId;
    if(id == 0) continue;
    if(strlen(arrIds) > 1) strcat(arrIds, ",");
    itoa(id, &arrIds[strlen(arrIds)], 10);
    if(id <= SOMFY_MAX_ROOMS) mask |= (1U << (id - 1));
  }
  strcat(arrIds, "]");
  mqtt.publish("rooms", arrIds, true);
  storeRoomMask(mask);
}
void SomfyShadeController::publish() {
  this->updateGroupFlags();
  // Nettoyage CIBLÉ, avant toute republication : les masques doivent être lus tant qu'ils portent
  // encore l'état de la session précédente -- publishShadeIndex()/publishGroupIndex() les
  // réécrivent plus bas. On ne touche qu'aux identifiants qui avaient réellement été publiés et
  // qui n'existent plus (typiquement : supprimés pendant que MQTT était déconnecté, cas que
  // SomfyShade::unpublish() appelé depuis deleteShade() ne peut pas couvrir).
  uint32_t prevShades = 0;
  uint16_t prevGroups = 0;
  uint16_t prevRooms = 0;
  loadPublishedMasks(prevShades, prevGroups, prevRooms);
  for(uint8_t id = 1; id <= SOMFY_MAX_SHADES; id++) {
    if((prevShades & (1UL << (id - 1))) && !this->getShadeById(id)) SomfyShade::unpublish(id);
  }
  for(uint8_t id = 1; id <= SOMFY_MAX_GROUPS; id++) {
    if((prevGroups & (1U << (id - 1))) && !this->getGroupById(id)) SomfyGroup::unpublish(id);
  }
  for(uint8_t id = 1; id <= SOMFY_MAX_ROOMS; id++) {
    if((prevRooms & (1U << (id - 1))) && !this->getRoomById(id)) SomfyRoom::unpublish(id);
  }
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    if(this->shades[i].getShadeId() == 255) continue;
    this->shades[i].publish();
  }
  this->publishShadeIndex();
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    if(this->groups[i].getGroupId() == 255) continue;
    this->groups[i].publish();
  }
  this->publishGroupIndex();
  // Les pièces ne figuraient pas du tout ici : leurs topics n'existaient chez le courtier que
  // par le publish() déclenché depuis SomfyRoom::emitState(), donc jamais republiés après une
  // reconnexion sans modification.
  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    if(this->rooms[i].roomId == 0) continue;
    this->rooms[i].publish();
  }
  this->publishRoomIndex();
}
