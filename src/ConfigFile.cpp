#include <Arduino.h>
#include <LittleFS.h>
#include <Preferences.h>
#include "ConfigFile.h"
#include "Utils.h"
#include "ConfigSettings.h"


// v26 : dernière version publique = v2.5.6 (SHADE_HDR_VER 25, autre dépôt) ; toutes les
// évolutions de format faites pendant le développement de la v3.0.0 (jamais publiées -- les
// paliers de travail intermédiaires 26 à 29 utilisés en interne pendant l'itération ont été
// fusionnés ici) sont regroupées sous ce SEUL bump 25->26, la v3.0.0 finale n'existant aux yeux
// du monde qu'en une seule bascule :
//  - retour LED par volet/groupe (ledFeedback) + accentColor personnalisable
//  - tiltTimeUp/tiltTimeDown remplacent le tiltTime unique pour les volets à lames (asymétrie
//    montée/descente réglable séparément, cf. issue #33) ; le slot legacy tiltTime au milieu de
//    l'enregistrement reste écrit (avec tiltTimeDown) pour qu'un retour en arrière vers un
//    firmware < v26 retrouve une valeur exploitable
//  - tiltFirstOnOpen/tiltFirstOnClose (ordre tilt/translation configurable par sens pour
//    tiltType::integrated, même issue #33) : champs entièrement nouveaux, sans équivalent
//    single-value historique
//  - personnalisation dashboard/header (headerMobileDisplay, reverseDashboardColumns,
//    defaultMobileTab, showRadioActivity), ajoutés en fin d'enregistrement settings -- cf.
//    ShadeConfigFile::readSettingsRecord()/writeSettingsRecord() et ConfigSettings::
//    calcSettingsRecSize()
// Un fichier v25 (dernière version publique v2.5.6) se lit toujours sans décalage : chaque champ
// ci-dessus reste gardé par `if(this->header.version >= 26)` et le lecteur se resynchronise sur
// le délimiteur de fin d'enregistrement (CFG_REC_END) si la position ne correspond pas à la
// taille déclarée dans l'en-tête.
#define SHADE_HDR_VER 26
#define SHADE_HDR_SIZE 76
#define SHADE_REC_SIZE 316
#define GROUP_REC_SIZE 206
#define TRANS_REC_SIZE 68
#define ROOM_REC_SIZE 29
#define REPEATER_REC_SIZE 77

extern ConfigSettings settings;

bool ConfigFile::begin(const char* filename, bool readOnly) {
  this->file = LittleFS.open(filename, readOnly ? "r" : "w");
  this->_opened = true;
  return true;
}
void ConfigFile::end() {
  if(this->isOpen()) {
    if(!this->readOnly) this->file.flush();
    this->file.close();
  }
  this->_opened = false;
}
bool ConfigFile::isOpen() { return this->_opened; }
bool ConfigFile::seekChar(const char val) {
  if(!this->isOpen()) return false;
  char ch;
  do {
    ch = this->readChar('\0');
    if(ch == '\0') return false;
  } while(ch != val);
  return true;
}
bool ConfigFile::writeSeparator() {return this->writeChar(CFG_VALUE_SEP); }
bool ConfigFile::writeRecordEnd() { return this->writeChar(CFG_REC_END); }
bool ConfigFile::writeHeader() { return this->writeHeader(this->header); }
bool ConfigFile::writeHeader(const config_header_t &hdr) {
  if(!this->isOpen()) return false;
  this->writeUInt8(hdr.version);
  this->writeUInt8(hdr.length);
  this->writeUInt16(hdr.roomRecordSize);
  this->writeUInt8(hdr.roomRecords);
  this->writeUInt16(hdr.shadeRecordSize);
  this->writeUInt8(hdr.shadeRecords);
  this->writeUInt16(hdr.groupRecordSize);
  this->writeUInt8(hdr.groupRecords);
  this->writeUInt16(hdr.repeaterRecordSize);
  this->writeUInt8(hdr.repeaterRecords);
  this->writeUInt16(hdr.settingsRecordSize);
  this->writeUInt16(hdr.netRecordSize);
  this->writeUInt16(hdr.transRecordSize);
  this->writeString(settings.serverId, sizeof(hdr.serverId), CFG_REC_END);
  return true;
}
bool ConfigFile::readHeader() {
  if(!this->isOpen()) return false;
  //if(this->file.position() != 0) this->file.seek(0, SeekSet);
  DBG_PRINTF("Reading header at %u\n", this->file.position());
  this->header.version = this->readUInt8(this->header.version);
  this->header.length = this->readUInt8(0);
  if(this->header.version >= 19) {
    this->header.roomRecordSize = this->readUInt16(this->header.roomRecordSize);
    this->header.roomRecords = this->readUInt8(this->header.roomRecords);
  }
  if(this->header.version >= 13) this->header.shadeRecordSize = this->readUInt16(this->header.shadeRecordSize);
  else this->header.shadeRecordSize = this->readUInt8((uint8_t)this->header.shadeRecordSize);
  this->header.shadeRecords = this->readUInt8(this->header.shadeRecords);
  if(this->header.version > 10) {
    if(this->header.version >= 13) this->header.groupRecordSize = this->readUInt16(this->header.groupRecordSize);
    else this->header.groupRecordSize = this->readUInt8(this->header.groupRecordSize);
    this->header.groupRecords = this->readUInt8(this->header.groupRecords);
  }
  if(this->header.version >= 21) {
    this->header.repeaterRecordSize = this->readUInt16(this->header.repeaterRecordSize);
    this->header.repeaterRecords = this->readUInt8(this->header.repeaterRecords);
  }
  if(this->header.version > 13) {
    this->header.settingsRecordSize = this->readUInt16(this->header.settingsRecordSize);
    this->header.netRecordSize = this->readUInt16(this->header.netRecordSize);
    this->header.transRecordSize = this->readUInt16(this->header.transRecordSize);
    this->readString(this->header.serverId, sizeof(this->header.serverId));
  }
  DBG_PRINTF("version:%u len:%u roomSize:%u roomRecs:%u shadeSize:%u shadeRecs:%u groupSize:%u groupRecs: %u pos:%d\n", this->header.version, this->header.length, this->header.roomRecordSize, this->header.roomRecords, this->header.shadeRecordSize, this->header.shadeRecords, this->header.groupRecordSize, this->header.groupRecords, this->file.position());
  return true;
}
/*
bool ConfigFile::seekRecordByIndex(uint16_t ndx) {
  if(!this->file) {
    return false;
  }
  if(((this->header.recordSize * ndx) + this->header.length) > this->file.size()) return false;
  return true;
}
*/
// M-11 de l'audit, corrigé le 23/08/2026. Le dernier octet du tampon est désormais RÉSERVÉ au
// terminateur : la boucle ne remplit plus que len-1 octets.
//
// Ce qui se passait sans cela : `memset(buff, 0, len)` zérote bien le tampon au départ, mais un
// champ occupant EXACTEMENT len octets écrasait ce zéro final, et la chaîne repartait sans
// terminateur. `_rtrim(buff)` (Utils.h) fait alors `strlen(str)` sur ce tampon -- il lit au-delà,
// puis remonte en ÉCRIVANT des '\0' depuis l'endroit où strlen s'est arrêté : c'est un débordement
// dans les deux sens, pas seulement une lecture hasardeuse. Atteignable par un fichier de
// configuration forgé (restauration de sauvegarde, /updateShadeConfig) ou simplement corrompu.
//
// ATTENTION -- la première rédaction de ce commentaire affirmait : « Aucun changement sur un
// fichier BIEN FORMÉ [...] le plafond ne mord que sur une entrée malformée ». **C'était faux, et
// c'est ce raisonnement qui a produit la régression du 23-24/08/2026.** `writeString()` pade
// chaque champ à EXACTEMENT len-1 octets avant son séparateur : le cas nominal est donc
// précisément celui qui atteint le plafond. Le plafond ne mord pas « rarement », il mord à CHAQUE
// champ numérique de CHAQUE enregistrement.
//
// Conséquence, mesurée sur matériel le 24/08/2026 : le retour anticipé laissait le séparateur NON
// consommé, la lecture suivante tombait dessus et rendait une chaîne vide, et tout le reste de
// l'enregistrement se décalait d'un champ. `shades.cfg` était écrit correctement (SHADE_REC_SIZE
// bien présent dans le fichier) puis relu comme « Invalid Shade Record Size » -- volets, groupes
// et pièces perdus au PREMIER redémarrage suivant l'installation.
//
// D'où le drainage ci-dessous : quand le tampon est plein, on consomme jusqu'au séparateur inclus.
// Cela rétablit l'alignement du flux ET conserve la protection voulue par M-11, puisqu'un champ
// malformé plus long que le tampon est simplement sauté jusqu'à son séparateur au lieu de
// déborder.
bool ConfigFile::drainToSeparator(uint8_t quotes) {
  if(!this->file) return false;
  uint8_t extra;
  while(this->file.read(&extra, 1) == 1) {
    if(extra == CFG_TOK_QUOTE) { quotes++; continue; }
    if(extra == CFG_REC_END) return true;
    // Même règle de fin que skipValue() : `quotes == 0` couvre les champs non guillemetés
    // (writeString), `quotes >= 2` les champs à longueur variable une fois refermés.
    if(extra == CFG_VALUE_SEP && (quotes >= 2 || quotes == 0)) return true;
  }
  return false;  // fin de fichier atteinte : plus rien à réaligner
}
bool ConfigFile::readString(char *buff, size_t len) {
  if(!this->file) return false;
  // len == 0 : sans ce test, `len - 1` ci-dessous déborderait vers SIZE_MAX (len est un size_t).
  if(len == 0) return false;
  memset(buff, 0x00, len);
  uint16_t i = 0;
  while(i < len - 1) {
    uint8_t val;
    if(this->file.read(&val, 1) == 1) {
      switch(val) {
        case CFG_REC_END:
        case CFG_VALUE_SEP:
          // Séparateur atteint avant le plafond : il vient d'être consommé par ce read(), le flux
          // est donc déjà positionné sur le champ suivant.
          _rtrim(buff);
          return true;
      }
      buff[i++] = val;
      if(i == len - 1) {
        _rtrim(buff);
        // Tampon plein : le séparateur n'a PAS encore été lu. Le consommer (ainsi que tout
        // dépassement d'un champ malformé), sans quoi le champ suivant démarrerait dessus.
        this->drainToSeparator();
        return true;
      }
    }
    else
      return false;
  }
  _rtrim(buff);
  return true;
}
bool ConfigFile::skipValue(size_t len) {
  if(!this->file) return false;
  uint8_t quotes = 0;
  uint8_t j = 0;
  while(j < len) {
    uint8_t val;
    j++;
    if(this->file.read(&val, 1) == 1) {
      switch(val) {
        case CFG_VALUE_SEP:
          if(quotes >= 2 || quotes == 0) return true;
          break;
        case CFG_REC_END:
          return true;
        case CFG_TOK_QUOTE:
          quotes++;
          break;
      }
    }
    else return false;
  }
  // Borne épuisée sans avoir atteint le séparateur : sans ce drainage, le champ suivant
  // démarrerait dessus (mécanisme de T-3). Cette fonction saute délibérément des champs, elle
  // doit donc laisser le flux exactement là où un lecteur l'aurait laissé.
  this->drainToSeparator(quotes);
  return true;
}
// Même correctif que readString() ci-dessus (M-11) -- cf. son commentaire pour le mécanisme.
// Ici `j` borne le nombre d'octets LUS et `i` le nombre d'octets ÉCRITS : les guillemets sont
// consommés sans être stockés (`continue`), donc i <= j et c'est bien `i` qu'il faut plafonner.
//
// AJOUT DU 25/08/2026 -- le drainage de T-3 manquait ici. Le correctif du 24/08 avait été porté
// sur readString() seul, alors que readVarString() a DEUX sorties qui laissent le séparateur non
// consommé : le tampon plein (`i == len - 1`) et la borne `j` épuisée. Dans les deux cas le champ
// suivant démarrait sur le séparateur et tout l'enregistrement se décalait -- le mécanisme exact
// de T-3, à ceci près qu'il n'avait pas été cherché dans cette fonction-ci.
//
// Ce n'était pas théorique. Sur disque un champ vaut `"` + valeur + `"` + séparateur : pour une
// valeur de N caractères, le séparateur se trouve à l'octet N+3, alors que la boucle n'en lit que
// `len`. Le flux se décalait donc dès que N >= len - 2 -- soit, pour `char hostname[65]`, à partir
// de 63 caractères, sur un champ dont l'interface en autorise 64. Même seuil pour `rootTopic` et
// `discoTopic`. Les deux sorties mordent tour à tour : la borne `j` à N = 63, puis `i == len - 1`
// à N = 64.
//
// Vérifié hors cible avec témoin positif : les mêmes cas rejoués sur les fonctions extraites de
// la révision précédente décalent bien l'enregistrement à 63 et à 64 caractères, et ne le
// décalent plus ensuite.
bool ConfigFile::readVarString(char *buff, size_t len) {
  if(!this->file) return false;
  if(len == 0) return false;
  memset(buff, 0x00, len);
  uint8_t quotes = 0;
  uint16_t i = 0;
  uint16_t j = 0;
  while(j < len) {
    uint8_t val;
    j++;
    if(this->file.read(&val, 1) == 1) {
      switch(val) {
        case CFG_VALUE_SEP:
          if(quotes >= 2) {
            _rtrim(buff);
            return true;
          }
          break;
        case CFG_REC_END:
          return true;
        case CFG_TOK_QUOTE:
          quotes++;
          continue;
      }
      buff[i++] = val;
      if(i == len - 1) {
        _rtrim(buff);
        // Tampon plein avant le guillemet fermant : réaligner sur le champ suivant.
        this->drainToSeparator(quotes);
        return true;
      }
    }
    else 
      return false;
  }
  _rtrim(buff);
  // Borne `j` épuisée sans avoir vu le séparateur : même réalignement.
  this->drainToSeparator(quotes);
  return true;
}

bool ConfigFile::writeString(const char *val, size_t len, const char tok) {
  if(!this->isOpen()) return false;
  // Symétrique du garde-fou de readString() : `slen < len - 1` compare un int à un size_t, donc
  // len == 0 ferait déborder la borne vers SIZE_MAX et la boucle de padding ci-dessous écrirait
  // sans fin. Aucun appelant ne passe 0 aujourd'hui ; la boucle ne doit pas en dépendre.
  if(len == 0) return false;
  int slen = strlen(val);
  if(slen > 0)
    if(this->file.write((uint8_t *)val, slen) != slen) return false;
  // Now we need to pad the end of the string so that it is of a fixed length.
  while(slen < len - 1) {
    this->file.write(' ');
    slen++;
  }
  // 255 = len = 4 slen = 3
  if(tok != CFG_TOK_NONE)
    return this->writeChar(tok);
  return true;
}
bool ConfigFile::writeVarString(const char *val, const char tok) {
  if(!this->isOpen()) return false;
  int slen = strlen(val);
  this->writeChar(CFG_TOK_QUOTE);
  if(slen > 0) if(this->file.write((uint8_t *)val, slen) != slen) return false;
  this->writeChar(CFG_TOK_QUOTE);
  if(tok != CFG_TOK_NONE) return this->writeChar(tok);
  return true;
}
bool ConfigFile::writeChar(const char val) {
  if(!this->isOpen()) return false;
  if(this->file.write(static_cast<uint8_t>(val)) == 1) return true;
  return false;
}
bool ConfigFile::writeInt8(const int8_t val, const char tok) {
  char buff[5];
  snprintf(buff, sizeof(buff), "%4d", val);
  return this->writeString(buff, sizeof(buff), tok);
}
bool ConfigFile::writeUInt8(const uint8_t val, const char tok) {
  char buff[4];
  snprintf(buff, sizeof(buff), "%3u", val);
  return this->writeString(buff, sizeof(buff), tok); 
}
bool ConfigFile::writeInt16(const int16_t val, const char tok) {
  char buff[7];
  snprintf(buff, sizeof(buff), "%6d", val);
  return this->writeString(buff, sizeof(buff), tok);
}
bool ConfigFile::writeUInt16(const uint16_t val, const char tok) {
  char buff[6];
  snprintf(buff, sizeof(buff), "%5u", val);
  return this->writeString(buff, sizeof(buff), tok);
}
bool ConfigFile::writeUInt32(const uint32_t val, const char tok) {
  char buff[11];
  snprintf(buff, sizeof(buff), "%10u", val);
  return this->writeString(buff, sizeof(buff), tok); 
}
bool ConfigFile::writeFloat(const float val, const uint8_t prec, const char tok) {
  char buff[20];
  snprintf(buff, sizeof(buff), "%*.*f", 7 + prec, prec, val);
  return this->writeString(buff, 8 + prec, tok);
}
bool ConfigFile::writeBool(const bool val, const char tok) {
  return this->writeString(val ? "true" : "false", 6, tok);
}
char ConfigFile::readChar(const char defVal) {
  uint8_t ch;
  if(this->file.read(&ch, 1) == 1) return (char)ch;
  return defVal;
}
int8_t ConfigFile::readInt8(const int8_t defVal) {
  char buff[5];
  if(this->readString(buff, sizeof(buff)))
    return static_cast<int8_t>(atoi(buff));
  return defVal;
}
uint8_t ConfigFile::readUInt8(const uint8_t defVal) {
  char buff[4];
  if(this->readString(buff, sizeof(buff)))
    return static_cast<uint8_t>(atoi(buff));
  return defVal;
}
int16_t ConfigFile::readInt16(const int16_t defVal) {
  char buff[7];
  if(this->readString(buff, sizeof(buff)))
    return static_cast<int16_t>(atoi(buff));
  return defVal;
}
uint16_t ConfigFile::readUInt16(const uint16_t defVal) {
  char buff[6];
  if(this->readString(buff, sizeof(buff)))
    return static_cast<uint16_t>(atoi(buff));
  return defVal;
}
uint32_t ConfigFile::readUInt32(const uint32_t defVal) {
  char buff[11];
  if(this->readString(buff, sizeof(buff)))
    return static_cast<uint32_t>(atoi(buff));
  return defVal;
}
float ConfigFile::readFloat(const float defVal) {
  char buff[25];
  if(this->readString(buff, sizeof(buff)))
    return atof(buff);
  return defVal;
}
bool ConfigFile::readBool(const bool defVal) {
  char buff[6];
  if(this->readString(buff, sizeof(buff))) {
    switch(buff[0]) {
      case 't':
      case 'T':
      case '1':
        return true;
      default: 
        return false;    
    }
  }
  return defVal;
}
/*
bool ShadeConfigFile::seekRecordById(uint8_t id) {
  if(this->isOpen()) return false;
  this->file.seek(this->header.length, SeekSet);  // Start at the beginning of the file after the header.
  uint8_t i = 0;
  while(i < SOMFY_MAX_SHADES) {
    uint32_t pos = this->file.position();
    uint8_t len = this->readUInt8(this->header.recordSize);
    uint8_t cid = this->readUInt8(255);
    if(cid == id) {
      this->file.seek(pos, SeekSet);
      return true;
    }
    pos += len;
    this->file.seek(pos, SeekSet);
  }
  return false;
}
*/
bool ShadeConfigFile::begin(bool readOnly) { return this->begin("/shades.cfg", readOnly); }
bool ShadeConfigFile::begin(const char *filename, bool readOnly) { return ConfigFile::begin(filename, readOnly); }
void ShadeConfigFile::end() { ConfigFile::end(); }
bool ShadeConfigFile::save(SomfyShadeController *s) {
  this->header.version = SHADE_HDR_VER;
  this->header.roomRecordSize = ROOM_REC_SIZE;
  this->header.roomRecords = s->roomCount();
  this->header.shadeRecordSize = SHADE_REC_SIZE;
  this->header.length = SHADE_HDR_SIZE;
  this->header.shadeRecords = s->shadeCount();
  this->header.groupRecordSize = GROUP_REC_SIZE;
  this->header.groupRecords = s->groupCount();
  this->header.repeaterRecords = 1;
  this->header.repeaterRecordSize = REPEATER_REC_SIZE;
  this->header.settingsRecordSize = 0;
  this->header.netRecordSize = 0;
  this->header.transRecordSize = 0;
  this->writeHeader();
  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    SomfyRoom *room = &s->rooms[i];
    if(room->roomId != 0)
      this->writeRoomRecord(room);
  }
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade *shade = &s->shades[i];
    if(shade->getShadeId() != 255)
      this->writeShadeRecord(shade);
  }
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup *group = &s->groups[i];
    if(group->getGroupId() != 255)
      this->writeGroupRecord(group);
  }
  this->writeRepeaterRecord(s);
  return true;
}
bool ShadeConfigFile::backup(SomfyShadeController *s) {
  this->header.version = SHADE_HDR_VER;
  this->header.roomRecordSize = ROOM_REC_SIZE;
  this->header.roomRecords = s->roomCount();
  this->header.shadeRecordSize = SHADE_REC_SIZE;
  this->header.length = SHADE_HDR_SIZE;
  this->header.shadeRecords = s->shadeCount();
  this->header.groupRecordSize = GROUP_REC_SIZE;
  this->header.groupRecords = s->groupCount();
  this->header.repeaterRecords = 1;
  this->header.repeaterRecordSize = REPEATER_REC_SIZE;
  this->header.settingsRecordSize = settings.calcSettingsRecSize();
  this->header.netRecordSize = settings.calcNetRecSize();
  this->header.transRecordSize = TRANS_REC_SIZE;
  this->writeHeader();
  for(uint8_t i = 0; i < SOMFY_MAX_ROOMS; i++) {
    SomfyRoom *room = &s->rooms[i];
    if(room->roomId != 0)
      this->writeRoomRecord(room);
  }
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade *shade = &s->shades[i];
    if(shade->getShadeId() != 255)
      this->writeShadeRecord(shade);
  }
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPS; i++) {
    SomfyGroup *group = &s->groups[i];
    if(group->getGroupId() != 255)
      this->writeGroupRecord(group);
  }
  this->writeRepeaterRecord(s);
  this->writeSettingsRecord();
  this->writeNetRecord();
  this->writeTransRecord(s->transceiver.config);
  return true;
}
bool ShadeConfigFile::validate() {
  this->readHeader();
  if(this->header.version < 1) {
    Serial.print("Invalid Header Version:");
    Serial.println(this->header.version);
    return false;
  }
  if(this->header.shadeRecordSize < 100) {
    Serial.print("Invalid Shade Record Size:");
    Serial.println(this->header.shadeRecordSize);
    return false;
  }
  // Ces compteurs sont lus tels quels depuis le fichier (uint8_t, donc jusqu'à 255) puis utilisés
  // comme borne de boucle pour écrire directement dans s->rooms/shades/groups/repeaters, des
  // tableaux de taille fixe. Sans ce contrôle, un fichier de restauration forgé avec un nombre
  // d'enregistrements supérieur à la capacité réelle provoque une écriture hors limites.
  if(this->header.roomRecords > SOMFY_MAX_ROOMS) {
    Serial.print("Invalid Room Record Count:");
    Serial.println(this->header.roomRecords);
    return false;
  }
  if(this->header.shadeRecords > SOMFY_MAX_SHADES) {
    Serial.print("Invalid Shade Record Count:");
    Serial.println(this->header.shadeRecords);
    return false;
  }
  if(this->header.repeaterRecords > SOMFY_MAX_REPEATERS) {
    Serial.print("Invalid Repeater Record Count:");
    Serial.println(this->header.repeaterRecords);
    return false;
  }
  if(this->header.version > 10) {
    if(this->header.groupRecordSize < 100) {
      Serial.print("Invalid Group Record Size:");
      Serial.println(this->header.groupRecordSize);
      return false;
    }
    if(this->header.groupRecords > SOMFY_MAX_GROUPS) {
      Serial.print("Invalid Group Record Count:");
      Serial.println(this->header.groupRecords);
      return false;
    }
  }
  if(this->file.position() != this->header.length) {
    Serial.printf("File not positioned at %u end of header: %d\n", this->header.length, this->file.position());
    return false;
  }
  
  // We should know the file size based upon the record information in the header
  uint32_t fsize = this->header.length + (this->header.shadeRecordSize * this->header.shadeRecords);
  if(this->header.version > 10) fsize += (this->header.groupRecordSize * this->header.groupRecords);
  if(this->header.version >= 19) fsize += (this->header.roomRecordSize * this->header.roomRecords);
  if(this->header.version > 13) {
    fsize += (this->header.settingsRecordSize);
    fsize += (this->header.netRecordSize);
    fsize += (this->header.transRecordSize);
  }
  if(this->header.version >= 21) {
    fsize += (this->header.repeaterRecordSize * this->header.repeaterRecords);
  }
  if(this->file.size() != fsize) {
    Serial.printf("File size is not correct should be %d and got %d\n", fsize, this->file.size());
  }
  // Next check to see if the records match the header length.
  uint8_t recs = 0;
  uint32_t startPos = this->file.position();
  if(this->header.version >= 19) {
    while(recs < this->header.roomRecords) {
      uint32_t pos = this->file.position();
      if(!this->seekChar(CFG_REC_END)) {
        Serial.printf("Failed to find the room record end %d\n", recs);
        return false;
      }
      if(this->file.position() - pos != this->header.roomRecordSize) {
        Serial.printf("Room record length is %d and should be %d\n", this->file.position() - pos, this->header.roomRecordSize);
        return false;
      }
      recs++;
    }
    recs = 0;
  }
  while(recs < this->header.shadeRecords) {
    uint32_t pos = this->file.position();
    if(!this->seekChar(CFG_REC_END)) {
      Serial.printf("Failed to find the shade record end %d\n", recs);
      return false;
    }
    if(this->file.position() - pos != this->header.shadeRecordSize) {
      Serial.printf("Shade record length is %d and should be %d\n", this->file.position() - pos, this->header.shadeRecordSize);
      return false;
    }
    recs++;
  }
  if(this->header.version > 10) {
    recs = 0;
    while(recs < this->header.groupRecords) {
      uint32_t pos = this->file.position();
      if(!this->seekChar(CFG_REC_END)) {
        Serial.printf("Failed to find the group record end %d\n", recs);
        return false;
      }
      recs++;
      if(this->file.position() - pos != this->header.groupRecordSize) {
        Serial.printf("Group record length is %d and should be %d\n", this->file.position() - pos, this->header.groupRecordSize);
        return false;
      }
    }
  }
  if(this->header.version >= 21) {
    recs = 0;
    while(recs < this->header.repeaterRecords) {
      //uint32_t pos = this->file.position();
      if(!this->seekChar(CFG_REC_END)) {
        Serial.printf("Failed to find the repeater record end %d\n", recs);
      }
      recs++;
      
    }
  }
  this->file.seek(startPos, SeekSet);
  return true;  
}
bool ShadeConfigFile::load(SomfyShadeController *s, const char *filename) {
  ShadeConfigFile file;
  if(file.begin(filename, true)) {
    bool success = file.loadFile(s, filename);
    file.end();
    return success;
  }
  return false;
}
bool ShadeConfigFile::restore(SomfyShadeController *s, const char *filename, restore_options_t &opts) {
  ShadeConfigFile file;
  if(file.begin(filename, true)) {
    bool success = file.restoreFile(s, filename, opts);
    file.end();
    return success;
  }
  return false;
}
bool ShadeConfigFile::restoreFile(SomfyShadeController *s, const char *filename, restore_options_t &opts) {
  bool opened = false;
  if(!this->isOpen()) {
    DBG_PRINTLN("Opening shade restore file");
    this->begin(filename, true);
    opened = true;
  }
  if(!this->validate()) {
    Serial.println("Shade restore file invalid!");
    if(opened) this->end();
    return false;
  }
  if(opts.shades) {
    DBG_PRINTLN("Restoring Rooms...");
    for(uint8_t i = 0; i < this->header.roomRecords; i++) {
      this->readRoomRecord(&s->rooms[i]);
      if(i > 0) DBG_PRINT(",");
      DBG_PRINT(s->rooms[i].roomId);
    }
    DBG_PRINTLN("Restoring Shades...");
    // We should be valid so start reading.
    for(uint8_t i = 0; i < this->header.shadeRecords; i++) {
      this->readShadeRecord(&s->shades[i]);
      if(i > 0) DBG_PRINT(",");
      DBG_PRINT(s->shades[i].getShadeId());
    }
    DBG_PRINTLN("");
    if(this->header.shadeRecords < SOMFY_MAX_SHADES) {
      uint8_t ndx = this->header.shadeRecords;
      // Clear out any positions that are not in the shade file.
      while(ndx < SOMFY_MAX_SHADES) {
        ((SomfyShade *)&s->shades[ndx++])->clear();
      }
    }
    DBG_PRINTLN("Restoring Groups...");
    for(uint8_t i = 0; i < this->header.groupRecords; i++) {
      if(i > 0) DBG_PRINT(",");
      DBG_PRINT(s->groups[i].getGroupId());
      this->readGroupRecord(&s->groups[i]);
    }
    DBG_PRINTLN("");
    if(this->header.groupRecords < SOMFY_MAX_GROUPS) {
      uint8_t ndx = this->header.groupRecords;
      // Clear out any positions that are not in the shade file.
      while(ndx < SOMFY_MAX_GROUPS) {
        ((SomfyGroup *)&s->groups[ndx++])->clear();
      }
    }
  }
  else {
    DBG_PRINTLN("Shade data ignored");
    // FF past the shades and groups.
    // Les PIÈCES sont écrites en premier dans le fichier (cf. save() et l'ordre de lecture de
    // validate()) : les oublier ici décalait tout ce qui suit -- répéteurs, réglages, réseau et
    // configuration radio étaient alors relus à la mauvaise position et écrasés par des valeurs
    // aberrantes, dès qu'on restaurait une sauvegarde en décochant "Équipements".
    uint32_t skip = (uint32_t)this->header.shadeRecords * this->header.shadeRecordSize
                  + (uint32_t)this->header.groupRecords * this->header.groupRecordSize;
    if(this->header.version >= 19) skip += (uint32_t)this->header.roomRecords * this->header.roomRecordSize;
    this->file.seek(this->file.position() + skip, SeekSet);
  }
  if(opts.repeaters) {
    DBG_PRINTLN("Restoring Repeaters...");
    if(this->header.repeaterRecords > 0) {
      memset(s->repeaters, 0x00, sizeof(uint32_t) * SOMFY_MAX_REPEATERS);
      for(uint8_t i = 0; i < this->header.repeaterRecords; i++) {
        this->readRepeaterRecord(s);
      }
    }
  }
  else {
    this->skipRecord("repeteurs", this->header.repeaterRecordSize);
  }
  if(opts.settings) {
    // First read out the data.
    this->readSettingsRecord();
  }
  else {
    // T-7 : c'est CE saut qui perdait l'enregistrement réseau. `settingsRecordSize` annonçait 11
    // octets de moins que la réalité, la lecture suivante démarrait donc au milieu du champ
    // `defaultMobileTab` et tout ce qui suit était relu de travers -- nom d'hôte du courtier, port,
    // topics. Reproduit sur le boîtier de test le 25/08 : `protocol` rendu à "255.255.2", un
    // morceau du masque de sous-réseau.
    this->skipRecord("reglages", this->header.settingsRecordSize);
  }
  if(opts.network || opts.mqtt) {
    this->readNetRecord(opts);
  }
  else {
    this->skipRecord("reseau", this->header.netRecordSize);
  }
  if(opts.shades) s->commit();
  if(opts.transceiver)
  {
    this->readTransRecord(s->transceiver.config);
    s->transceiver.save();
  }
  if(opts.settings || opts.network) settings.save();
  if(opts.settings) settings.NTP.save();
  if(opts.network) {
    settings.IP.save();
    settings.WIFI.save();
    settings.Ethernet.save();
  }
  if(opts.mqtt) settings.MQTT.save();
  return true;
}
bool ShadeConfigFile::skipRecord(const char *what, uint16_t declaredSize) {
  // Taille nulle = enregistrement absent du fichier (version antérieure) : il n'y a rien à sauter,
  // et consommer un délimiteur ici mangerait l'enregistrement suivant.
  if(declaredSize == 0) return true;
  uint32_t startPos = this->file.position();
  if(!this->seekChar(CFG_REC_END)) return false;
  uint32_t actual = this->file.position() - startPos;
  if(actual != declaredSize)
    Serial.printf("[CFG] enregistrement %s : %u octets annonces, %u reellement lus -- resynchronise\n",
      what, (unsigned)declaredSize, (unsigned)actual);
  return true;
}
bool ShadeConfigFile::readNetRecord(restore_options_t &opts) {
  if(this->header.netRecordSize > 0) {
    uint32_t startPos = this->file.position();
    if(opts.network) {
      DBG_PRINTLN("Reading network settings from file...");
      settings.connType = static_cast<conn_types_t>(this->readUInt8(static_cast<uint8_t>(conn_types_t::unset)));
      settings.IP.dhcp = this->readBool(true);
      char ip[24];
      this->readVarString(ip, sizeof(ip));
      settings.IP.ip.fromString(ip);
      this->readVarString(ip, sizeof(ip));
      settings.IP.gateway.fromString(ip);
      this->readVarString(ip, sizeof(ip));
      settings.IP.subnet.fromString(ip);
      this->readVarString(ip, sizeof(ip));
      settings.IP.dns1.fromString(ip);
      this->readVarString(ip, sizeof(ip));
      settings.IP.dns2.fromString(ip);
    }
    else {
      this->skipValue(4); // connType
      this->skipValue(6); // dhcp flag
      this->skipValue(24); // ip
      this->skipValue(24); // gateway
      this->skipValue(24); // subnet
      this->skipValue(24); // dns1
      this->skipValue(24); // dns2
    }
    if(this->header.version >= 22) {
      if(opts.mqtt) {
        // Le protocole est une CONSTANTE depuis E-7 (cf. ConfigSettings.h) : la valeur portée par
        // la sauvegarde est lue pour ne pas décaler la suite -- l'enregistrement est positionnel --
        // puis jetée. Une sauvegarde faite sur une version antérieure peut porter "mqtts://".
        //
        // Taille écrite en clair, et non plus `sizeof(settings.MQTT.protocol)` : ce champ est
        // désormais un `const char *`, dont le sizeof vaut 4. Le drainage de readVarString()
        // rattraperait un plafond trop court, mais autant ne pas tronquer pour rien.
        char discardedProtocol[16];
        this->readVarString(discardedProtocol, sizeof(discardedProtocol));
        this->readVarString(settings.MQTT.hostname, sizeof(settings.MQTT.hostname));
        settings.MQTT.port = this->readUInt16(1883);
        settings.MQTT.pubDisco = this->readBool(false);
        this->readVarString(settings.MQTT.rootTopic, sizeof(settings.MQTT.rootTopic));
        this->readVarString(settings.MQTT.discoTopic, sizeof(settings.MQTT.discoTopic));
      }
      else {
        this->skipValue(16); // protocol -- constante depuis E-7, cf. la branche ci-dessus
        this->skipValue(sizeof(settings.MQTT.hostname));
        this->skipValue(6); // Port
        this->skipValue(6); // pubDisco
        this->skipValue(sizeof(settings.MQTT.rootTopic));
        this->skipValue(sizeof(settings.MQTT.discoTopic));
      }
    }
    // Now lets check to see if we are the same board.  If we are then we will restore
    // the ethernet phy settings.
    if(opts.network) {
      if(strncmp(settings.serverId, this->header.serverId, sizeof(settings.serverId)) == 0) {
        DBG_PRINTLN("Restoring Ethernet adapter settings");
        settings.Ethernet.boardType = this->readUInt8(1);
        settings.Ethernet.phyType = static_cast<eth_phy_type_t>(this->readUInt8(0));
        settings.Ethernet.CLKMode = static_cast<eth_clock_mode_t>(this->readUInt8(0));
        settings.Ethernet.phyAddress = this->readInt8(1);
        settings.Ethernet.PWRPin = this->readInt8(1);
        settings.Ethernet.MDCPin = this->readInt8(16);
        settings.Ethernet.MDIOPin = this->readInt8(23);
      }
    }
    if(this->file.position() != startPos + this->header.netRecordSize) {
      DBG_PRINTLN("Reading to end of network record");
      this->seekChar(CFG_REC_END);
    }
  }
  return true;
}
bool ShadeConfigFile::readTransRecord(transceiver_config_t &cfg) {
  if(this->header.transRecordSize > 0) {
    uint32_t startPos = this->file.position();
    DBG_PRINTLN("Reading Transceiver settings from file...");
    cfg.enabled = this->readBool(false);
    cfg.proto = static_cast<radio_proto>(this->readUInt8(0));
    cfg.type = this->readUInt8(56);
    if(this->header.version < 25) {
      cfg.radioBoardType = 0;
      //Serial.println("Old backup detected (v2.4.6), skipping radioBoardType");
    } else {
      cfg.radioBoardType = this->readUInt8(0);
    }
    cfg.SCKPin = this->readUInt8(cfg.SCKPin);
    cfg.CSNPin = this->readUInt8(cfg.CSNPin);
    cfg.MOSIPin = this->readUInt8(cfg.MOSIPin);
    cfg.MISOPin = this->readUInt8(cfg.MISOPin);
    cfg.TXPin = this->readUInt8(cfg.TXPin);
    cfg.RXPin = this->readUInt8(cfg.RXPin);
    cfg.frequency = this->readFloat(cfg.frequency);
    cfg.rxBandwidth = this->readFloat(cfg.rxBandwidth);
    if(this->header.transRecordSize >= 74) this->readFloat(0);
    cfg.txPower = this->readInt8(cfg.txPower);
    if(this->file.position() != startPos + this->header.transRecordSize) {
      DBG_PRINTLN("Reading to end of transceiver record");
      this->seekChar(CFG_REC_END);
    }
    
  }
  return true; 
}
bool ShadeConfigFile::readSettingsRecord() {
  if(this->header.settingsRecordSize > 0) {
    uint32_t startPos = this->file.position();
    DBG_PRINTLN("Reading settings from file...");
    char ver[24];
    this->readVarString(ver, sizeof(ver));
    this->readVarString(settings.hostname, sizeof(settings.hostname));
    this->readVarString(settings.NTP.ntpServer, sizeof(settings.NTP.ntpServer));
    this->readVarString(settings.NTP.posixZone, sizeof(settings.NTP.posixZone));
    if(this->header.version >= 26) {
      this->readVarString(settings.accentColor, sizeof(settings.accentColor));
    } else {
      strncpy(settings.accentColor, "#1a5fb4", sizeof(settings.accentColor));
    }
    settings.ssdpBroadcast = this->readBool(false);
    if(this->header.version >= 20) settings.checkForUpdate = this->readBool(true);
    if(this->header.version >= 25) {
      // shades.cfg garde 1 octet pour la langue (compat binaire) -- converti vers le code ISO
      // désormais canonique en mémoire (settings.language est une string depuis la Phase 0 i18n).
      langIndexToCode(this->readUInt8(0), settings.language, sizeof(settings.language));
    } else {
      strlcpy(settings.language, "en", sizeof(settings.language)); // Anglais par défaut pour les versions antérieures
    }
    if(this->header.version >= 26) {
      settings.headerMobileDisplay = this->readUInt8(0);
      settings.reverseDashboardColumns = this->readBool(false);
      this->readVarString(settings.defaultMobileTab, sizeof(settings.defaultMobileTab));
      settings.showRadioActivity = this->readBool(false);
    }
    if(this->file.position() != startPos + this->header.settingsRecordSize) {
      DBG_PRINTLN("Reading to end of settings record");
      this->seekChar(CFG_REC_END);
    }
  }
  return true;
}
bool ShadeConfigFile::readGroupRecord(SomfyGroup *group) {
  Preferences pref;  // instance LOCALE -- cf. l'invariant en tete de ConfigSettings.h
  pref.begin("ShadeCodes");
  uint32_t startPos = this->file.position();
  group->setGroupId(this->readUInt8(255));
  group->groupType = static_cast<group_types>(this->readUInt8(0));
  group->setRemoteAddress(this->readUInt32(0));
  this->readString(group->name, sizeof(group->name));
  group->proto = static_cast<radio_proto>(this->readUInt8(0));
  group->bitLength = this->readUInt8(56);
  if(this->header.version == 23) group->lastRollingCode = this->readUInt16(0);
  uint8_t lsd = 0;
  memset(group->linkedShades, 0x00, sizeof(group->linkedShades));
  for(uint8_t j = 0; j < SOMFY_MAX_GROUPED_SHADES; j++) {
    uint8_t shadeId = this->readUInt8(0);
    // Do this to eliminate gaps.
    if(shadeId > 0) group->linkedShades[lsd++] = shadeId;
  }
  if(this->header.version >= 12) group->repeats = this->readUInt8(1);
  if(this->header.version >= 13) group->sortOrder = this->readUInt8(group->getGroupId() - 1);
  else group->sortOrder = group->getGroupId() - 1;
  
  if(group->getGroupId() == 255) group->clear();
  else group->compressLinkedShadeIds();
  if(this->header.version >= 18) group->flipCommands = this->readBool(false);
  if(this->header.version >= 19) group->roomId = this->readUInt8(0);
  if(this->header.version >= 24) group->lastRollingCode = this->readUInt16(0);
  // Lu ici, à la place exacte qu'occupe l'écriture : le bloc NVS qui suit ne touche pas au fichier.
  if(this->header.version >= 26) group->ledFeedback = this->readBool(false);
  if(group->getRemoteAddress() != 0) {
    uint16_t rc = pref.getUShort(group->getRemotePrefId(), 0);
    group->lastRollingCode = max(rc, group->lastRollingCode);
    if(rc < group->lastRollingCode) pref.putUShort(group->getRemotePrefId(), group->lastRollingCode);
  }
  
  pref.end();
  if(this->file.position() != startPos + this->header.groupRecordSize) {
    DBG_PRINTLN("Reading to end of group record");
    this->seekChar(CFG_REC_END);
  }
  return true;
}
bool ShadeConfigFile::readRepeaterRecord(SomfyShadeController *s) {
  uint32_t startPos = this->file.position();
  
  for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++) {
    s->linkRepeater(this->readUInt32(0));  
  }
  if(this->file.position() != startPos + this->header.repeaterRecordSize) {
    DBG_PRINTLN("Reading to end of repeater record");
    this->seekChar(CFG_REC_END);
  }
  return true;
}
bool ShadeConfigFile::readRoomRecord(SomfyRoom *room) {
  uint32_t startPos = this->file.position();
  room->roomId = this->readUInt8(0);
  this->readString(room->name, sizeof(room->name));
  room->sortOrder = this->readUInt8(room->roomId - 1);
  if(this->file.position() != startPos + this->header.roomRecordSize) {
    DBG_PRINTLN("Reading to end of room record");
    this->seekChar(CFG_REC_END);
  }
  return true;
}

bool ShadeConfigFile::readShadeRecord(SomfyShade *shade) {
  Preferences pref;  // instance LOCALE -- cf. l'invariant en tete de ConfigSettings.h
  pref.begin("ShadeCodes");
  uint32_t startPos = this->file.position();
  shade->setShadeId(this->readUInt8(255));
  shade->paired = this->readBool(false);
  shade->shadeType = static_cast<shade_types>(this->readUInt8(0));
  shade->setRemoteAddress(this->readUInt32(0));
  this->readString(shade->name, sizeof(shade->name));
  if(this->header.version < 3)
    shade->tiltType = this->readBool(false) ? tilt_types::none : tilt_types::tiltmotor;
  else
    shade->tiltType = static_cast<tilt_types>(this->readUInt8(0));
  if(this->header.version > 6) shade->proto = static_cast<radio_proto>(this->readUInt8(0));
  if(this->header.version > 1) shade->bitLength = this->readUInt8(56);
  shade->upTime = this->readUInt32(shade->upTime);
  shade->downTime = this->readUInt32(shade->downTime);
  // Slot legacy (< v26) : une seule durée de tilt. Sert de valeur de départ pour les deux sens
  // tant que les champs v26 (lus plus bas) ne l'ont pas remplacée.
  uint32_t legacyTiltTime = this->readUInt32(shade->tiltTimeDown);
  shade->tiltTimeUp = legacyTiltTime;
  shade->tiltTimeDown = legacyTiltTime;
  if(this->header.version > 5) shade->stepSize = this->readUInt16(100);
  for(uint8_t j = 0; j < SOMFY_MAX_LINKED_REMOTES; j++) {
    SomfyLinkedRemote *rem = &shade->linkedRemotes[j];
    rem->setRemoteAddress(this->readUInt32(0));
    if(rem->getRemoteAddress() != 0) rem->lastRollingCode = pref.getUShort(rem->getRemotePrefId(), 0);
    if(this->header.version < 5 && j == 4) break; // Prior to version 5 we only supported 5 linked remotes.
  }
  shade->lastRollingCode = this->readUInt16(0);
  if(this->header.version > 7) shade->flags = this->readUInt8(0);
  if(shade->getRemoteAddress() != 0) {
    // If the last rolling code stored on the nvs is less than the rc we currently have
    // then we need to set it.
    uint16_t rc = pref.getUShort(shade->getRemotePrefId(), 0);
    shade->lastRollingCode = max(rc, shade->lastRollingCode);
    if(rc < shade->lastRollingCode) pref.putUShort(shade->getRemotePrefId(), shade->lastRollingCode);
  }
  if(this->header.version < 4)
    shade->myPos = static_cast<float>(this->readUInt8(255));
  else {
    shade->myPos = this->readFloat(-1);
    shade->myTiltPos = this->readFloat(-1);
  }
  if(shade->myPos > 100 || shade->myPos < 0) shade->myPos = -1;
  if(shade->myTiltPos > 100 || shade->myTiltPos < 0) shade->myTiltPos = -1;
  shade->currentPos = this->readFloat(0);
  shade->currentTiltPos = this->readFloat(0);
  if(shade->tiltType == tilt_types::none || shade->shadeType != shade_types::blind) {
    shade->myTiltPos = -1;
    shade->currentTiltPos = 0;
    shade->tiltType = tilt_types::none;
  }
  if(this->header.version < 3) {
    shade->currentPos = shade->currentPos * 100;
    shade->currentTiltPos = shade->currentTiltPos * 100;
  }
  shade->target = floor(shade->currentPos);
  shade->tiltTarget = floor(shade->currentTiltPos);
  if(this->header.version >= 9) shade->flipCommands = this->readBool(false);
  if(this->header.version >= 10) shade->flipPosition = this->readBool(false);
  if(this->header.version >= 12) shade->repeats = this->readUInt8(1);
  if(this->header.version >= 13) shade->sortOrder = this->readUInt8(shade->getShadeId() - 1);
  else shade->sortOrder = shade->getShadeId() - 1;
  if(this->header.version > 14) {
    shade->gpioUp = this->readUInt8(shade->gpioUp);
    shade->gpioDown = this->readUInt8(shade->gpioDown);
  }
  if(this->header.version > 15)
    shade->gpioMy = this->readUInt8(shade->gpioMy);
  if(this->header.version > 16)
    shade->gpioFlags = this->readUInt8(shade->gpioFlags);
  if(shade->getShadeId() == 255) shade->clear();
  else if(shade->tiltType == tilt_types::tiltonly) {
    shade->myPos = shade->currentPos = shade->target = 100.0f;
  }
  pref.end();
  if(shade->proto == radio_proto::GP_Relay || shade->proto == radio_proto::GP_Remote) {
    pinMode(shade->gpioUp, OUTPUT);
    pinMode(shade->gpioDown, OUTPUT);
  }
  if(shade->proto == radio_proto::GP_Remote)
    pinMode(shade->gpioMy, OUTPUT);
  if(this->header.version >= 19) shade->roomId = this->readUInt8(0);
  if(this->header.version >= 26) {
    shade->ledFeedback = this->readBool(false);
    // Calibration séparée montée/descente : écrase la valeur unique lue plus haut.
    shade->tiltTimeUp = this->readUInt32(shade->tiltTimeUp);
    shade->tiltTimeDown = this->readUInt32(shade->tiltTimeDown);
    shade->tiltFirstOnOpen = this->readBool(shade->tiltFirstOnOpen);
    shade->tiltFirstOnClose = this->readBool(shade->tiltFirstOnClose);
  }
  if(this->file.position() != startPos + this->header.shadeRecordSize) {
    DBG_PRINTLN("Reading to end of shade record");
    this->seekChar(CFG_REC_END);
  }
  return true;
}
bool ShadeConfigFile::loadFile(SomfyShadeController *s, const char *filename) {
  bool opened = false;
  if(!this->isOpen()) {
    DBG_PRINTLN("Opening shade config file");
    this->begin(filename, true);
    opened = true;
  }
  if(!this->validate()) {
    Serial.println("Shade config file invalid!");
    if(opened) this->end();
    return false;
  }
  for(uint8_t i = 0; i < this->header.roomRecords;i++) {
    this->readRoomRecord(&s->rooms[i]);
  }
  if(this->header.roomRecords < SOMFY_MAX_ROOMS) {
    uint8_t ndx = this->header.roomRecords;
    // Clear out any positions that are not in the shade file.
    while(ndx < SOMFY_MAX_ROOMS) {
      ((SomfyRoom *)&s->rooms[ndx++])->clear();
    }
  }
  
  // We should be valid so start reading.
  for(uint8_t i = 0; i < this->header.shadeRecords; i++) {
    this->readShadeRecord(&s->shades[i]);
  }
  if(this->header.shadeRecords < SOMFY_MAX_SHADES) {
    uint8_t ndx = this->header.shadeRecords;
    // Clear out any positions that are not in the shade file.
    while(ndx < SOMFY_MAX_SHADES) {
      ((SomfyShade *)&s->shades[ndx++])->clear();
    }
  }
  for(uint8_t i = 0; i < this->header.groupRecords; i++) {
    this->readGroupRecord(&s->groups[i]);
  }
  if(this->header.groupRecords < SOMFY_MAX_GROUPS) {
    uint8_t ndx = this->header.groupRecords;
    // Clear out any positions that are not in the shade file.
    while(ndx < SOMFY_MAX_GROUPS) {
      ((SomfyGroup *)&s->groups[ndx++])->clear();
    }
  }
  if(this->header.repeaterRecords > 0) {
    memset(s->repeaters, 0x00, sizeof(uint32_t) * SOMFY_MAX_REPEATERS);
    for(uint8_t i = 0; i < this->header.repeaterRecords; i++)
      this->readRepeaterRecord(s);
  }
  if(opened) {
    DBG_PRINTLN("Closing shade config file");
    this->end();
  }
  return true;
}
bool ShadeConfigFile::writeGroupRecord(SomfyGroup *group) {
  this->writeUInt8(group->getGroupId());
  this->writeUInt8(static_cast<uint8_t>(group->groupType));
  this->writeUInt32(group->getRemoteAddress());
  this->writeString(group->name, sizeof(group->name));
  this->writeUInt8(static_cast<uint8_t>(group->proto));
  this->writeUInt8(group->bitLength);
  for(uint8_t j = 0; j < SOMFY_MAX_GROUPED_SHADES; j++) {
    this->writeUInt8(group->linkedShades[j]);
  }
  this->writeUInt8(group->repeats);
  this->writeUInt8(group->sortOrder);
  this->writeBool(group->flipCommands);
  this->writeUInt8(group->roomId);
  this->writeUInt16(group->lastRollingCode);
  this->writeBool(group->ledFeedback, CFG_REC_END);
  return true;
}
bool ShadeConfigFile::writeRepeaterRecord(SomfyShadeController *s) {
  for(uint8_t i = 0; i < SOMFY_MAX_REPEATERS; i++) {
    this->writeUInt32(s->repeaters[i], i == SOMFY_MAX_REPEATERS - 1 ? CFG_REC_END : CFG_VALUE_SEP);
  }
  return true;
}
bool ShadeConfigFile::writeRoomRecord(SomfyRoom *room) {
  this->writeUInt8(room->roomId);
  this->writeString(room->name, sizeof(room->name));
  this->writeUInt8(room->sortOrder, CFG_REC_END);
  return true;
}
bool ShadeConfigFile::writeShadeRecord(SomfyShade *shade) {
  if(shade->tiltType == tilt_types::none || shade->shadeType != shade_types::blind) {
    shade->myTiltPos = -1;
    shade->currentTiltPos = 0;
    shade->tiltType = tilt_types::none;
  }
  this->writeUInt8(shade->getShadeId());
  this->writeBool(shade->paired);
  this->writeUInt8(static_cast<uint8_t>(shade->shadeType));
  this->writeUInt32(shade->getRemoteAddress());
  this->writeString(shade->name, sizeof(shade->name));
  this->writeUInt8(static_cast<uint8_t>(shade->tiltType));
  this->writeUInt8(static_cast<uint8_t>(shade->proto));
  this->writeUInt8(shade->bitLength);
  this->writeUInt32(shade->upTime);
  this->writeUInt32(shade->downTime);
  // Slot legacy conservé à sa position d'origine (tiltTimeDown comme approximation single-value,
  // pour qu'un firmware < v26 qui relirait ce fichier retrouve quelque chose d'exploitable) --
  // les deux temps réels sont écrits séparément en fin d'enregistrement, voir plus bas.
  this->writeUInt32(shade->tiltTimeDown);
  this->writeUInt16(shade->stepSize);
  for(uint8_t j = 0; j < SOMFY_MAX_LINKED_REMOTES; j++) {
    SomfyLinkedRemote *rem = &shade->linkedRemotes[j];
    this->writeUInt32(rem->getRemoteAddress());
  }
  this->writeUInt16(shade->lastRollingCode);
  if(shade->getShadeId() != 255) {
    this->writeUInt8(shade->flags & 0xFF);
    this->writeFloat(shade->myPos, 5);
    this->writeFloat(shade->myTiltPos, 5);
    this->writeFloat(shade->currentPos, 5);
    this->writeFloat(shade->currentTiltPos, 5);
  }
  else {
    // Make sure that we write cleared values when the shade is deleted.
    this->writeUInt8(0);
    this->writeFloat(-1.0f, 5); // MyPos
    this->writeFloat(-1.0f, 5); // MyTiltPos
    this->writeFloat(0.0f, 5);  // currentPos
    this->writeFloat(0.0f, 5); // currentTiltPos
  }
  this->writeBool(shade->flipCommands);
  this->writeBool(shade->flipPosition);
  this->writeUInt8(shade->repeats);
  this->writeUInt8(shade->sortOrder);
  this->writeUInt8(shade->gpioUp);
  this->writeUInt8(shade->gpioDown);
  this->writeUInt8(shade->gpioMy);
  this->writeUInt8(shade->gpioFlags);
  this->writeUInt8(shade->roomId);
  this->writeBool(shade->ledFeedback);
  // v26 : calibration tilt séparée montée/descente (voir SHADE_HDR_VER plus haut).
  this->writeUInt32(shade->tiltTimeUp);
  this->writeUInt32(shade->tiltTimeDown);
  // v26 : ordre tilt/translation configurable par sens (idem).
  this->writeBool(shade->tiltFirstOnOpen);
  this->writeBool(shade->tiltFirstOnClose, CFG_REC_END);
  return true;
}
bool ShadeConfigFile::writeSettingsRecord() {
  this->writeVarString(settings.fwVersion.name);
  this->writeVarString(settings.hostname);
  this->writeVarString(settings.NTP.ntpServer);
  this->writeVarString(settings.NTP.posixZone);
  this->writeVarString(settings.accentColor);
  this->writeBool(settings.ssdpBroadcast);
  this->writeBool(settings.checkForUpdate);
  this->writeUInt8(langCodeToIndex(settings.language));
  this->writeUInt8(settings.headerMobileDisplay);
  this->writeBool(settings.reverseDashboardColumns);
  this->writeVarString(settings.defaultMobileTab);
  this->writeBool(settings.showRadioActivity, CFG_REC_END);
  return true;
}
bool ShadeConfigFile::writeNetRecord() {
  this->writeUInt8(static_cast<uint8_t>(settings.connType));
  this->writeBool(settings.IP.dhcp); 
  this->writeVarString(settings.IP.ip.toString().c_str());
  this->writeVarString(settings.IP.gateway.toString().c_str());
  this->writeVarString(settings.IP.subnet.toString().c_str());
  this->writeVarString(settings.IP.dns1.toString().c_str());
  this->writeVarString(settings.IP.dns2.toString().c_str());
  this->writeVarString(settings.MQTT.protocol);
  this->writeVarString(settings.MQTT.hostname);
  this->writeUInt16(settings.MQTT.port);
  this->writeBool(settings.MQTT.pubDisco);
  this->writeVarString(settings.MQTT.rootTopic);
  this->writeVarString(settings.MQTT.discoTopic);
  this->writeUInt8(settings.Ethernet.boardType);
  this->writeUInt8(static_cast<uint8_t>(settings.Ethernet.phyType));
  this->writeUInt8(static_cast<uint8_t>(settings.Ethernet.CLKMode));
  this->writeInt8(settings.Ethernet.phyAddress);
  this->writeInt8(settings.Ethernet.PWRPin);
  this->writeInt8(settings.Ethernet.MDCPin);
  this->writeInt8(settings.Ethernet.MDIOPin, CFG_REC_END);
  return true;
}
bool ShadeConfigFile::writeTransRecord(transceiver_config_t &cfg) {
  this->writeBool(cfg.enabled);
  this->writeUInt8(static_cast<uint8_t>(cfg.proto));
  this->writeUInt8(cfg.type);
  this->writeUInt8(cfg.radioBoardType);
  this->writeUInt8(cfg.SCKPin);
  this->writeUInt8(cfg.CSNPin);
  this->writeUInt8(cfg.MOSIPin);
  this->writeUInt8(cfg.MISOPin);
  this->writeUInt8(cfg.TXPin);
  this->writeUInt8(cfg.RXPin);
  this->writeFloat(cfg.frequency, 3);
  this->writeFloat(cfg.rxBandwidth, 2);
  this->writeInt8(cfg.txPower, CFG_REC_END);
  return true;
}
bool ShadeConfigFile::exists() { return LittleFS.exists("/shades.cfg"); }

// ============================================================================
// ScheduleConfigFile (/schedules.cfg)
//
// En-tête minimal propre à ce fichier (pas de réutilisation de config_header_t,
// dont les champs sont spécifiques à shades.cfg) : version(4o) + tailleEnr(6o) +
// nbEnr(4o) = 14 octets. Chaque enregistrement fait SCHEDULE_REC_SIZE octets.
//
// Fonctionnalité entièrement nouvelle en v3.0.0 -- schedules.cfg n'existe pas du tout dans les
// versions publiques v2.x.x (aucune trace de ScheduleConfigFile avant le tag v2.5.3, cf. mémoire
// "Philosophie de versioning v3"), donc aucun format public antérieur à préserver, contrairement
// à shades.cfg/SHADE_HDR_VER. Les paliers de travail intermédiaires 1 à 4 utilisés pendant
// l'itération (retries, puis positionMode, puis timeRef+sunOffset pour le déclenchement
// lever/coucher du soleil via SunCalc, ajoutés successivement en fin d'enregistrement) sont donc
// fusionnés ici en une seule version 1 : tous les champs sont désormais lus/écrits sans condition.
// Le byte de version reste néanmoins présent dans l'en-tête pour une évolution future du format
// après la sortie officielle de la v3.0.0.
// ============================================================================
#define SCHEDULE_HDR_VER 1
#define SCHEDULE_REC_SIZE 79   // dayMask..enabled (60) + retries (4) + positionMode (4) + timeRef (4) + sunOffset (7)

bool ScheduleConfigFile::begin(bool readOnly) { return this->begin("/schedules.cfg", readOnly); }
bool ScheduleConfigFile::begin(const char *filename, bool readOnly) { return ConfigFile::begin(filename, readOnly); }
void ScheduleConfigFile::end() { ConfigFile::end(); }
bool ScheduleConfigFile::exists() { return LittleFS.exists("/schedules.cfg"); }

bool ScheduleConfigFile::writeScheduleRecord(ScheduleRule *rule) {
  this->writeUInt8(rule->getId());
  this->writeString(rule->name, sizeof(rule->name));
  this->writeUInt8(rule->dayMask);
  this->writeUInt8(rule->hour);
  this->writeUInt8(rule->minute);
  this->writeUInt8(static_cast<uint8_t>(rule->targetType));
  this->writeUInt8(rule->targetId);
  this->writeUInt8(rule->targetPos);
  this->writeInt8(rule->targetTilt);
  this->writeBool(rule->enabled);
  this->writeUInt8(rule->retries);
  this->writeUInt8(static_cast<uint8_t>(rule->positionMode));
  this->writeUInt8(static_cast<uint8_t>(rule->timeRef));
  this->writeInt16(rule->sunOffset, CFG_REC_END);
  return true;
}
bool ScheduleConfigFile::readScheduleRecord(ScheduleRule *rule) {
  uint32_t startPos = this->file.position();
  rule->setId(this->readUInt8(255));
  this->readString(rule->name, sizeof(rule->name));
  rule->dayMask = this->readUInt8(0);
  rule->hour = this->readUInt8(0);
  rule->minute = this->readUInt8(0);
  rule->targetType = static_cast<schedule_target_t>(this->readUInt8(0));
  rule->targetId = this->readUInt8(255);
  rule->targetPos = this->readUInt8(0);
  rule->targetTilt = this->readInt8(-1);
  rule->enabled = this->readBool(true);
  rule->retries = this->readUInt8(0);
  rule->positionMode = static_cast<schedule_position_mode_t>(this->readUInt8(0));
  rule->timeRef = static_cast<schedule_time_ref_t>(this->readUInt8(0));
  rule->sunOffset = this->readInt16(0);
  if(this->file.position() != startPos + SCHEDULE_REC_SIZE) {
    DBG_PRINTLN("Reading to end of schedule record");
    this->seekChar(CFG_REC_END);
  }
  return true;
}
bool ScheduleConfigFile::save(ScheduleController *s) {
  this->writeUInt8(SCHEDULE_HDR_VER);
  this->writeUInt16(SCHEDULE_REC_SIZE);
  this->writeUInt8(s->scheduleCount(), CFG_REC_END);
  for(uint8_t i = 0; i < SOMFY_MAX_SCHEDULES; i++) {
    ScheduleRule *rule = &s->schedules[i];
    if(rule->getId() != 255) this->writeScheduleRecord(rule);
  }
  return true;
}
bool ScheduleConfigFile::loadFile(ScheduleController *s, const char *filename) {
  if(!this->begin(filename, true)) return false;
  // Le byte de version reste consommé (position du curseur dans le fichier) même s'il n'y a plus
  // qu'une seule version publique possible pour l'instant -- voir le commentaire au-dessus de
  // SCHEDULE_HDR_VER.
  uint8_t version = this->readUInt8(SCHEDULE_HDR_VER);
  uint16_t recSize = this->readUInt16(SCHEDULE_REC_SIZE);
  uint8_t recCount = this->readUInt8(0);
  (void)version;
  (void)recSize;
  for(uint8_t i = 0; i < recCount && i < SOMFY_MAX_SCHEDULES; i++) {
    this->readScheduleRecord(&s->schedules[i]);
  }
  this->end();
  return true;
}
bool ScheduleConfigFile::load(ScheduleController *s, const char *filename) {
  ScheduleConfigFile file;
  return file.loadFile(s, filename);
}
