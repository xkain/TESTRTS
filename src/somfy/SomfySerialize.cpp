#include <Arduino.h>
#include <ArduinoJson.h>
#include "ConfigSettings.h"
#include "Utils.h"   // isUsableOutputPin()
#include "Somfy.h"

// Sérialisation JSON du modèle de domaine (SomfyShade/SomfyRoom/SomfyGroup/SomfyRemote/
// SomfyLinkedRemote/SomfyShadeController) pour l'API REST et les sockets -- validateJSON/
// fromJSON pour les requêtes entrantes, toJSON*/toJSONRef pour les réponses. La sérialisation du
// transceiver radio (Transceiver/transceiver_config_t) reste dans SomfyRadioDriver.cpp : elle est
// intimement liée à sa configuration matérielle plutôt qu'au modèle de domaine ici.
// Extrait de Somfy.cpp.

extern SomfyShadeController somfy;
extern ConfigSettings settings;

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
    // `obj["proto"]`, et non `this->proto` : la valeur COURANTE est encore l'ancienne sur la requête
    // qui fait justement passer un équipement de RTS à GP_Relay/GP_Remote. Toute la validation de broches
    // ci-dessous était donc court-circuitée exactement quand elle sert, et ne s'appliquait qu'aux
    // modifications ultérieures d'un équipement déjà relais.
    radio_proto proto = static_cast<radio_proto>(obj["proto"].as<uint8_t>());
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
      // Validité INTRINSÈQUE de la broche, avant toute question de collision : ce contrôle n'existait
      // pas. fromJSON() enchaînait directement sur pinMode(gpioUp, OUTPUT) puis digitalWrite() à
      // chaque tour de loop() -- avec un numéro arbitraire venu du réseau. Les broches 6-11 pilotent
      // le flash SPI interne : y écrire plante l'appareil immédiatement. Cf. isUsableOutputPin().
      if((upPin != 255 && !isUsableOutputPin(upPin)) ||
        (downPin != 255 && !isUsableOutputPin(downPin)) ||
        (myPin != 255 && !isUsableOutputPin(myPin)))
        ret = -13;
      if(ret == 0 && somfy.transceiver.config.enabled) {
        if((upPin != 255 && somfy.transceiver.usesPin(upPin)) ||
          (downPin != 255 && somfy.transceiver.usesPin(downPin)) ||
          (myPin != 255 && somfy.transceiver.usesPin(myPin)))
          ret = -10;
      }
      if(ret == 0 && (settings.connType == conn_types_t::ethernet || settings.connType == conn_types_t::ethernetpref)) {
        // Les deux dernières lignes testaient le TRANSCEIVER (déjà fait juste au-dessus) au lieu de
        // l'Ethernet : sur un boîtier BOX-ETH, un relais d'équipement pouvait s'approprier MDC/MDIO/PWR
        // et couper le réseau sans qu'aucune validation ne s'y oppose.
        if((upPin != 255 && settings.Ethernet.usesPin(upPin)) ||
          (downPin != 255 && settings.Ethernet.usesPin(downPin)) ||
          (myPin != 255 && settings.Ethernet.usesPin(myPin)))
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
  // Capturé avant validateJSON() : sa branche shadeType numérique (ci-dessus) mute déjà
  // this->shadeType comme effet de bord -- lire l'ancienne valeur plus tard serait trop tard pour
  // la comparaison faite après le bloc shadeType plus bas.
  shade_types oldType = this->shadeType;
  int8_t err = this->validateJSON(obj);
  if(err == 0) {
    if(obj.containsKey("name")) strlcpyUtf8(this->name, obj["name"], sizeof(this->name));
    if(obj.containsKey("roomId")) this->roomId = obj["roomId"];
    if(obj.containsKey("upTime")) this->upTime = obj["upTime"];
    if(obj.containsKey("downTime")) this->downTime = obj["downTime"];
    if(obj.containsKey("remoteAddress")) this->setRemoteAddress(obj["remoteAddress"]);
    if(obj.containsKey("tiltTimeUp")) this->tiltTimeUp = obj["tiltTimeUp"];
    if(obj.containsKey("tiltTimeDown")) this->tiltTimeDown = obj["tiltTimeDown"];
    if(obj.containsKey("tiltFirstOnOpen")) this->tiltFirstOnOpen = obj["tiltFirstOnOpen"];
    if(obj.containsKey("tiltFirstOnClose")) this->tiltFirstOnClose = obj["tiltFirstOnClose"];
    if(obj.containsKey("stepSize")) this->stepSize = obj["stepSize"];
    // Correspondance INVERSÉE jusqu'ici : `hasTilt: true` produisait tilt_types::none. Le sens
    // attendu est celui qu'écrit SomfyShade::save() (`putBool("hasTilt", tiltType != none)`),
    // donc true = l'équipement A une inclinaison. Un client REST obtenait exactement le contraire de
    // ce qu'il demandait. (Le même défaut existe dans SomfyShade::load(), sous #ifdef USE_NVS --
    // macro définie nulle part dans le projet, donc code mort : laissé tel quel.)
    if(obj.containsKey("hasTilt")) this->tiltType = static_cast<bool>(obj["hasTilt"]) ? tilt_types::tiltmotor : tilt_types::none;
    // Seules valeurs que le codec sait produire (0 = "hériter du transceiver", cf.
    // SomfyRemote::sendCommand). Toute autre valeur faisait lire `frame[i / 8]` au-delà du
    // `byte frm[10]` de l'appelant dans Transceiver::sendFrame().
    if(obj.containsKey("bitLength")) {
      uint8_t bl = obj["bitLength"].as<uint8_t>();
      if(bl == 0 || bl == 56 || bl == 80) this->bitLength = bl;
    }
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
    // Un changement de type d'équipement change ses capacités (lift/tilt) -- les temps mesurés
    // pour l'ancien type (via l'assistant de calibration ou saisis à la main) n'ont alors plus de
    // sens et pourraient produire un comportement incohérent (ex. un ancien temps de tilt réutilisé
    // sur un type qui n'a plus de tilt) s'ils restaient appliqués tels quels au nouveau type.
    // Reset systématique dès que le type change effectivement -- y compris si la même requête
    // transportait aussi d'anciennes valeurs de temps (cf. saveShade() côté client, qui renvoie
    // toujours upTime/downTime/tiltTimeUp/tiltTimeDown même masqués/inchangés) : un changement de
    // type volontaire justifie de toute façon une recalibration, donc pas d'exception à faire pour
    // ce cas plutôt qu'un autre.
    // Valeurs par défaut (pas 0) : mêmes littéraux que SomfyShade::clear()/les initialiseurs de
    // membres dans Somfy.h -- 0 casserait le calcul de position (divisions dans SomfyPositioning.cpp/
    // SomfyDispatch.cpp, gardées par des `if(...Time == 0) return`) et bloquerait la validation du
    // formulaire d'édition manuel (bornes >= 1 dans saveShade() côté client), qui n'a aucune raison
    // de refuser un enregistrement sans rapport (ex. renommer l'équipement) simplement parce que son
    // type a changé plus tôt.
    if(obj.containsKey("shadeType") && this->shadeType != oldType) {
      this->upTime = 10000;
      this->downTime = 10000;
      this->tiltTimeUp = 7000;
      this->tiltTimeDown = 7000;
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
        // Borne indispensable : sans elle, un tableau JSON plus long que SOMFY_MAX_LINKED_REMOTES
        // écrit hors de ce tableau de PILE (28 octets) -- adresse de retour comprise. Le corps est
        // plafonné à 8 Ko et parsé dans un document de 1 Ko, ce qui laisse largement la place à une
        // soixantaine d'entiers : le débordement était directement atteignable depuis /saveShade.
        if(i >= SOMFY_MAX_LINKED_REMOTES) break;
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
void SomfyShade::toJSONRef(JsonFormatter &json) { this->toJSONRef(json, true); }
void SomfyShade::toJSONRef(JsonFormatter &json, bool secrets) {
  json.addElem("shadeId", this->getShadeId());
  json.addElem("roomId", this->roomId);
  json.addElem("name", this->name);
  // Même masquage que toJSON : ce format allégé sert les `linkedShades` d'un groupe, donc il passe
  // lui aussi par le document de découverte. L'oublier ici aurait laissé fuir par la bande
  // exactement ce qu'on retire ailleurs.
  json.addElem("remoteAddress", secrets ? (uint32_t)this->m_remoteAddress : (uint32_t)0);
  json.addElem("paired", this->paired);
  json.addElem("shadeType", static_cast<uint8_t>(this->shadeType));
  json.addElem("flipCommands", this->flipCommands);
  // Copier-coller : ce champ renvoyait flipCommands. toJSONRef() alimente /shadeCommand,
  // /tiltCommand, /repeatCommand, /groupOptions et les fiches d'équipements d'un groupe -- et le
  // front-end lit data-flipposition pour orienter les icônes.
  json.addElem("flipPosition", this->flipPosition);
  json.addElem("bitLength", this->bitLength);
  json.addElem("proto", static_cast<uint8_t>(this->proto));
  json.addElem("flags", this->flags);
  json.addElem("sunSensor", this->hasSunSensor());
  json.addElem("hasLight", this->hasLight());
  json.addElem("repeats", this->repeats);
  //SomfyRemote::toJSON(json);
}

void SomfyShade::toJSON(JsonFormatter &json) { this->toJSON(json, true); }
void SomfyShade::toJSON(JsonFormatter &json, bool secrets) {
  json.addElem("shadeId", this->getShadeId());
  json.addElem("roomId", this->roomId);
  json.addElem("name", this->name);
  json.addElem("remoteAddress", secrets ? (uint32_t)this->m_remoteAddress : (uint32_t)0);
  json.addElem("upTime", (uint32_t)this->upTime);
  json.addElem("downTime", (uint32_t)this->downTime);
  json.addElem("paired", this->paired);
  json.addElem("lastRollingCode", secrets ? (uint32_t)this->lastRollingCode : (uint32_t)0);
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
  // Chaque télécommande liée porte elle aussi une adresse ET un code tournant (cf.
  // SomfyRemote::toJSON) : masqué, le tableau reste PRÉSENT mais vide. On ne retire jamais une clé
  // ni ne change la forme du JSON -- un client tiers qui lit `remoteAddress` ou itère
  // `linkedRemotes` continue de trouver ce qu'il attend, simplement neutralisé. 0 est d'ailleurs
  // déjà la sentinelle « pas d'adresse » ailleurs dans ce fichier.
  json.beginArray("linkedRemotes");
  {
    for(uint8_t i = 0; secrets && i < SOMFY_MAX_LINKED_REMOTES; i++) {
      SomfyLinkedRemote &lremote = this->linkedRemotes[i];
      if(lremote.getRemoteAddress() != 0) {
        json.beginObject();
        lremote.toJSON(json);
        json.endObject();
      }
    }
  }
  json.endArray();
}

// 57 lignes de code ArduinoJson commenté retirées ici le 24/08/2026 (P-2/P-3) : variantes ArduinoJson mises en
// commentaire de longue date, remplacées par les surcharges JsonFormatter/JsonSockEvent qui
// sont, elles, réellement utilisées. Elles restent dans l'historique git si besoin.
bool SomfyRoom::fromJSON(JsonObject &obj) {
  if(obj.containsKey("name")) strlcpyUtf8(this->name, obj["name"], sizeof(this->name));
  if(obj.containsKey("sortOrder")) this->sortOrder = obj["sortOrder"];
  return true;
}
// 8 lignes de code ArduinoJson commenté retirées ici le 24/08/2026 (P-2/P-3) : variantes ArduinoJson mises en
// commentaire de longue date, remplacées par les surcharges JsonFormatter/JsonSockEvent qui
// sont, elles, réellement utilisées. Elles restent dans l'historique git si besoin.
void SomfyRoom::toJSON(JsonFormatter &json) {
  json.addElem("roomId", this->roomId);
  json.addElem("name", this->name);
  json.addElem("sortOrder", this->sortOrder);
}

bool SomfyGroup::fromJSON(JsonObject &obj) {
  if(obj.containsKey("name")) strlcpyUtf8(this->name, obj["name"], sizeof(this->name));
  if(obj.containsKey("roomId")) this->roomId = obj["roomId"];
  if(obj.containsKey("remoteAddress")) this->setRemoteAddress(obj["remoteAddress"]);
  // Même validation que SomfyShade::fromJSON plus haut (correctif E-1), qui manquait ici :
  // `bitLength` finit en argument de Transceiver::sendFrame(), dont la boucle d'émission indexe
  // `frame[i/8]` jusqu'à `bitLength` bits sur un tampon de 10 octets appartenant à l'appelant.
  // Une valeur de 200 acceptée par /saveGroup faisait donc lire jusqu'à frm[24] -- au-delà du
  // tableau -- et émettre ces octets de pile par radio. 0 reste accepté : c'est la sentinelle
  // « prendre le défaut du transceiver », gérée par sendCommand() et repeatFrame().
  if(obj.containsKey("bitLength")) {
    uint8_t bl = obj["bitLength"].as<uint8_t>();
    if(bl == 0 || bl == 56 || bl == 80) this->bitLength = bl;
  }
  if(obj.containsKey("proto")) this->proto = static_cast<radio_proto>(obj["proto"].as<uint8_t>());
  if(obj.containsKey("flipCommands")) this->flipCommands = obj["flipCommands"].as<bool>();
  if(obj.containsKey("ledFeedback")) this->ledFeedback = obj["ledFeedback"].as<bool>();

  //if(obj.containsKey("sunSensor")) this->hasSunSensor() = obj["sunSensor"];  This is calculated
  if(obj.containsKey("repeats")) this->repeats = obj["repeats"];
  if(obj.containsKey("linkedShades")) {
    // Ce bloc remplissait un tableau LOCAL qui mourait en fin de portée : la composition d'un
    // groupe envoyée à /addGroup ou /saveGroup était donc silencieusement ignorée. L'interface ne
    // s'en apercevait pas (elle passe par /linkToGroup et /unlinkFromGroup), mais tout client REST
    // croyait avoir configuré un groupe qui restait vide.
    //
    // Deux formes acceptées, parce que toJSON() et l'API ne parlent pas le même dialecte : la
    // sérialisation sortante émet un tableau d'OBJETS (shade->toJSONRef), alors qu'un client qui
    // écrit à la main envoie naturellement un tableau d'IDS. Un GET suivi d'un PUT du même document
    // aurait sinon vidé le groupe, chaque objet étant converti en 0.
    uint8_t linkedShades[SOMFY_MAX_GROUPED_SHADES];
    memset(linkedShades, 0x00, sizeof(linkedShades));
    JsonArray arr = obj["linkedShades"];
    uint8_t i = 0;
    for(JsonVariant v : arr) {
      // Même borne que pour linkedAddresses ci-dessus : tableau de pile, débordement direct.
      if(i >= SOMFY_MAX_GROUPED_SHADES) break;
      uint8_t shadeId = v.is<JsonObject>() ? v["shadeId"].as<uint8_t>() : v.as<uint8_t>();
      // 0 = sentinelle "emplacement libre" et 255 = "équipement inexistant" : ni l'un ni l'autre n'a sa
      // place dans la liste. On écarte aussi les ids qui ne correspondent à aucun équipement, sans quoi
      // sendCommand()/emitState() itéreraient sur des références orphelines.
      if(shadeId == 0 || shadeId == 255 || !somfy.getShadeById(shadeId)) continue;
      linkedShades[i++] = shadeId;
    }
    memcpy(this->linkedShades, linkedShades, sizeof(this->linkedShades));
  }
  return true;
}
void SomfyGroup::toJSON(JsonFormatter &json) { this->toJSON(json, true); }
void SomfyGroup::toJSON(JsonFormatter &json, bool secrets) {
  this->updateFlags();
  json.addElem("groupId", this->getGroupId());
  json.addElem("roomId", this->roomId);
  json.addElem("name", this->name);
  json.addElem("remoteAddress", secrets ? (uint32_t)this->m_remoteAddress : (uint32_t)0);
  json.addElem("lastRollingCode", secrets ? (uint32_t)this->lastRollingCode : (uint32_t)0);
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
        shade->toJSONRef(json, secrets);
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

// 31 lignes de code ArduinoJson commenté retirées ici le 24/08/2026 (P-2/P-3) : variantes ArduinoJson mises en
// commentaire de longue date, remplacées par les surcharges JsonFormatter/JsonSockEvent qui
// sont, elles, réellement utilisées. Elles restent dans l'historique git si besoin.
void SomfyRemote::toJSON(JsonFormatter &json) {
  json.addElem("remoteAddress", (uint32_t)this->getRemoteAddress());
  json.addElem("lastRollingCode", (uint32_t)this->lastRollingCode);
}
// 8 lignes de code ArduinoJson commenté retirées ici le 24/08/2026 (P-2/P-3) : variantes ArduinoJson mises en
// commentaire de longue date, remplacées par les surcharges JsonFormatter/JsonSockEvent qui
// sont, elles, réellement utilisées. Elles restent dans l'historique git si besoin.
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

// 53 lignes de code ArduinoJson commenté retirées ici le 24/08/2026 (P-2/P-3) : variantes ArduinoJson mises en
// commentaire de longue date, remplacées par les surcharges JsonFormatter/JsonSockEvent qui
// sont, elles, réellement utilisées. Elles restent dans l'historique git si besoin.
void SomfyShadeController::toJSONGroups(JsonFormatter &json) { this->toJSONGroups(json, true); }
void SomfyShadeController::toJSONGroups(JsonFormatter &json, bool secrets) {
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup &group = this->groups[i];
    if(group.getGroupId() != 255) {
      json.beginObject();
      group.toJSON(json, secrets);
      json.endObject();
    }
  }
}
void SomfyShadeController::toJSONRepeaters(JsonFormatter &json) {
  for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++) {
    if(somfy.repeaters[i] != 0) json.addElem((uint32_t)somfy.repeaters[i]);
  }
}
void SomfyLinkedRemote::toJSON(JsonFormatter &json) {
  SomfyRemote::toJSON(json);
  json.addElem("lastRssi", this->lastRssi);
}
