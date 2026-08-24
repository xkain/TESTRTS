#ifndef SOMFY_H
#define SOMFY_H
#include "ConfigSettings.h"
#include "web/WResp.h"
// Couche radio (protocole RTS bas niveau + pilote CC1101), extraite dans ses propres en-têtes ;
// ce fichier ne garde que le modèle de domaine (Room/Remote/Shade/Group/ShadeController) qui en
// dépend (radio_proto/somfy_commands/somfy_frame_t comme types de champs, Transceiver comme
// membre de SomfyShadeController).
#include "SomfyRadioCodec.h"
#include "SomfyRadioDriver.h"

#define SOMFY_MAX_SHADES 32
#define SOMFY_MAX_GROUPS 16
#define SOMFY_MAX_LINKED_REMOTES 7
#define SOMFY_MAX_GROUPED_SHADES 32
#define SOMFY_MAX_ROOMS 16
#define SOMFY_MAX_REPEATERS 7

#define SECS_TO_MILLIS(x) ((x) * 1000)
#define MINS_TO_MILLIS(x) SECS_TO_MILLIS((x) * 60)

#define SOMFY_SUN_TIMEOUT MINS_TO_MILLIS(2)
#define SOMFY_NO_SUN_TIMEOUT MINS_TO_MILLIS(20)

#define SOMFY_WIND_TIMEOUT SECS_TO_MILLIS(2)
#define SOMFY_NO_WIND_TIMEOUT MINS_TO_MILLIS(12)
#define SOMFY_NO_WIND_REMOTE_TIMEOUT SECS_TO_MILLIS(30)

// Répétitions de trame pour les commandes qui doivent tenir un appui long : apprentissage My
// (SETMY_REPEATS) et bascule tilt/euromode (TILT_REPEATS). Utilisées à la fois par Somfy.cpp
// (dispatch de commande) et SomfyPositioning.cpp (moteur de mouvement), donc partagées ici plutôt
// que définies localement dans un seul des deux fichiers.
#define SETMY_REPEATS 35
#define TILT_REPEATS 15

// Enums du modèle de domaine (par opposition à radio_proto/somfy_commands, propres au protocole
// radio et déplacés dans SomfyRadioCodec.h) : restent ici, avec les classes qui les utilisent.
enum class group_types : byte {
  channel = 0x00
};
enum class shade_types : byte {
  roller = 0x00,
  blind = 0x01,
  ldrapery = 0x02,
  awning = 0x03,
  shutter = 0x04,
  garage1 = 0x05,
  garage3 = 0x06,
  rdrapery = 0x07,
  cdrapery = 0x08,
  drycontact = 0x09,
  drycontact2 = 0x0A,
  lgate = 0x0B,
  cgate = 0x0C,
  rgate = 0x0D,
  lgate1 = 0x0E,
  cgate1 = 0x0F,
  rgate1 = 0x10
};
enum class tilt_types : byte {
  none = 0x00,
  tiltmotor = 0x01,
  integrated = 0x02,
  tiltonly = 0x03,
  euromode = 0x04
};
enum class somfy_flags_t : byte {
    SunFlag = 0x01,
    SunSensor = 0x02,
    DemoMode = 0x04,
    Light = 0x08,
    Windy = 0x10,
    Sunny = 0x20,
    Lighted = 0x40,
    SimMy = 0x80
};
enum class gpio_flags_t : byte {
  LowLevelTrigger = 0x01
};

class SomfyRoom {
  public:
    uint8_t roomId = 0;
    char name[21] = "";
    int8_t sortOrder = 0;
    void clear();
    bool save();
    bool fromJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json);
    void emitState(const char *evt = "roomState");
    void emitState(uint8_t num, const char *evt = "roomState");
    void publish();
    void unpublish();
    static void unpublish(uint8_t id);
};

class SomfyRemote {
  // These sizes for the data have been
  // confirmed.  The address is actually 24bits
  // and the rolling code is 16 bits.
  protected:
    char m_remotePrefId[11] = "";
    uint32_t m_remoteAddress = 0;
  public:
    radio_proto proto = radio_proto::RTS;
    uint8_t gpioFlags = 0;
    int8_t gpioDir = 0;
    uint8_t gpioUp = 0;
    uint8_t gpioDown = 0;
    uint8_t gpioMy = 0;
    uint32_t gpioRelease = 0;
    somfy_frame_t lastFrame;
    bool flipCommands = false;
    // Éclat du témoin lumineux à chaque commande envoyée à CE volet / CE groupe. Champ dédié plutôt
    // qu'un bit de `flags` : celui-ci est plein (les 8 bits de somfy_flags_t sont attribués) et
    // surtout SomfyGroup::updateFlags() le recalcule intégralement depuis les volets membres, ce qui
    // effacerait silencieusement une préférence de groupe stockée là.
    bool ledFeedback = false;
    uint16_t lastRollingCode = 0;
    uint8_t flags = 0;
    uint8_t bitLength = 0;
    uint8_t repeats = 1;
    virtual bool isLastCommand(somfy_commands cmd);
    char *getRemotePrefId() {return m_remotePrefId;}
    virtual void toJSON(JsonFormatter &json);
    virtual void setRemoteAddress(uint32_t address);
    virtual uint32_t getRemoteAddress();
    virtual uint16_t getNextRollingCode();
    virtual uint16_t setRollingCode(uint16_t code);
    bool hasSunSensor();
    bool hasLight();
    bool simMy();
    void setSunSensor(bool bHasSensor);
    void setLight(bool bHasLight);
    void setSimMy(bool bSimMy);
    virtual void sendCommand(somfy_commands cmd);
    virtual void sendCommand(somfy_commands cmd, uint8_t repeat, uint8_t stepSize = 0);
    void sendSensorCommand(int8_t isWindy, int8_t isSunny, uint8_t repeat);
    void repeatFrame(uint8_t repeat);
    virtual uint16_t p_lastRollingCode(uint16_t code);
    somfy_commands transformCommand(somfy_commands cmd);
    virtual void triggerGPIOs(somfy_frame_t &frame);
   
};
class SomfyLinkedRemote : public SomfyRemote {
  public:
    SomfyLinkedRemote();
    // Dernier RSSI (dBm) reçu pour cette télécommande, tenu à jour en RAM à chaque trame valide
    // (cf. SomfyShade::processFrame) -- jamais persisté en Flash/NVS, c'est une valeur de diagnostic
    // "live" qui repart à zéro à chaque redémarrage. -128 (INT8_MIN) = aucune trame reçue depuis
    // le boot, à distinguer d'un RSSI réel qui reste toujours nettement au-dessus de cette valeur.
    static const int8_t RSSI_UNKNOWN = -128;
    int8_t lastRssi = RSSI_UNKNOWN;
    void toJSON(JsonFormatter &json) override;
};
class SomfyShade : public SomfyRemote {
  protected:
    uint8_t shadeId = 255;
    // millis()-based timestamps: kept at 32 bits to match millis()'s own wraparound modulus
    // (~49.7 days). Widening these to 64 bits would silently break the unsigned-subtraction
    // rollover-safe comparisons used against them (curTime - this->xxx), since the subtraction
    // would then wrap at 2^64 instead of at the 2^32 boundary millis() itself wraps at.
    uint32_t moveStart = 0;
    uint32_t tiltStart = 0;
    uint32_t noSunStart = 0;
    uint32_t sunStart = 0;
    uint32_t windStart = 0;
    uint32_t windLast = 0;
    uint32_t noWindStart = 0;
    bool noSunDone = true;
    bool sunDone = true;
    bool windDone = true;
    bool noWindDone = true;
    float startPos = 0.0f;
    float startTiltPos = 0.0f;
    bool settingMyPos = false;
    bool settingPos = false;
    bool settingTiltPos = false;
    uint32_t awaitMy = 0;
  public:
    uint8_t roomId = 0;
    int8_t sortOrder = 0;
    bool flipPosition = false;
    shade_types shadeType = shade_types::roller;
    tilt_types tiltType = tilt_types::none;
    #ifdef USE_NVS
    void load();
    #endif
    float currentPos = 0.0f;
    float currentTiltPos = 0.0f;
    int8_t lastMovement = 0;
    int8_t direction = 0; // 0 = stopped, 1=down, -1=up.
    int8_t tiltDirection = 0; // 0=stopped, 1=clockwise, -1=counter clockwise
    float target = 0.0f;
    float tiltTarget = 0.0f;
    float myPos = -1.0f;
    float myTiltPos = -1.0f;
    SomfyLinkedRemote linkedRemotes[SOMFY_MAX_LINKED_REMOTES];
    bool paired = false;
    int8_t validateJSON(JsonObject &obj);
    void toJSONRef(JsonFormatter &json);
    // Variante masquable du format allégé : il sert les `linkedShades` d'un groupe, donc il
    // traverse lui aussi le document de découverte (C-5, seconde moitié).
    void toJSONRef(JsonFormatter &json, bool secrets);
    int8_t fromJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json) override;
    // Variante masquable, ajoutée le 24/08/2026 pour la SECONDE moitié du constat C-5 -- celle qui
    // n'avait jamais été appliquée. `secrets = false` omet `remoteAddress`, `lastRollingCode` et la
    // liste `linkedRemotes` : c'est exactement le couple qui permet de forger une trame RTS valide
    // et de piloter les volets par radio en contournant le PIN. La surcharge à un argument délègue
    // à celle-ci avec secrets = true, de sorte qu'il n'existe qu'UN corps de sérialisation -- la
    // duplication étant la cause racine du constat T-2 trouvé quelques heures plus tôt.
    void toJSON(JsonFormatter &json, bool secrets);
    
    char name[21] = "";
    void setShadeId(uint8_t id) { shadeId = id; }
    uint8_t getShadeId() { return shadeId; }
    uint32_t upTime = 10000;
    uint32_t downTime = 10000;
    // Remplace l'ancien champ unique tiltTime (asymétrie montée/descente du tilt non réglable,
    // cf. retour utilisateur issue #33 : "the tilt takes a slight different amount of time with
    // each direction which can also not be set right now"). tiltTimeUp = temps pour ramener les
    // lames à plat (tiltDirection < 0), tiltTimeDown = temps pour les fermer (tiltDirection > 0) --
    // même correspondance que upTime/downTime pour la translation. Migration depuis un fichier de
    // config v26 ou antérieur : voir ConfigFile.cpp (les deux valeurs héritent de l'ancien tiltTime).
    uint32_t tiltTimeUp = 7000;
    uint32_t tiltTimeDown = 7000;
    // Pour tiltType::integrated, ordre tilt/translation par sens de mouvement -- true = incliner
    // d'abord puis translater (comportement historique, seul modélisé jusqu'ici). Certains moteurs
    // (issue #33, remote 80 bits) font l'inverse à la fermeture : ils translatent d'abord et
    // n'inclinent qu'une fois en butée. Quand le flag est à false pour un sens donné, checkMovement()
    // (SomfyPositioning.cpp) prend naturellement le même chemin que pour un tiltType::tiltmotor
    // classique : translation normale, puis stop + moveToTiltTarget() une fois la position atteinte.
    bool tiltFirstOnOpen = true;
    bool tiltFirstOnClose = true;
    uint16_t stepSize = 100;
    bool save();
    bool isIdle();
    bool isInGroup();
    void checkMovement();
    void processFrame(somfy_frame_t &frame, bool internal = false);
    void processInternalCommand(somfy_commands cmd, uint8_t repeat = 1);
    void setTiltMovement(int8_t dir);
    void setMovement(int8_t dir);
    void setTarget(float target);
    bool isAtTarget();
    bool isToggle();
    void moveToTarget(float pos, float tilt = -1.0f);
    void moveToTiltTarget(float target);
    void sendTiltCommand(somfy_commands cmd);
    void sendCommand(somfy_commands cmd);
    void sendCommand(somfy_commands cmd, uint8_t repeat, uint8_t stepSize = 0);
    bool linkRemote(uint32_t remoteAddress, uint16_t rollingCode = 0);
    bool unlinkRemote(uint32_t remoteAddress);
    void emitState(const char *evt = "shadeState");
    void emitState(uint8_t num, const char *evt = "shadeState");
    void emitCommand(somfy_commands cmd, const char *source, uint32_t sourceAddress, const char *evt = "shadeCommand");
    void emitCommand(uint8_t num, somfy_commands cmd, const char *source, uint32_t sourceAddress, const char *evt = "shadeCommand");
    void setMyPosition(int8_t pos, int8_t tilt = -1);
    void moveToMyPosition();
    void processWaitingFrame();
    void publish();
    void unpublish();
    static void unpublish(uint8_t id);
    static void unpublish(uint8_t id, const char *topic);
    void publishState();
    // Émetteur UNIQUE des topics dérivés de `flags` (`sunFlag`, `sunny`, `windy`), appelé aussi
    // bien par publishState() que par publishMovementState(). C'est délibérément une fonction et
    // non un bloc dupliqué : jusqu'au 24/08/2026 cette logique ne vivait que dans publishState(),
    // laquelle n'est atteinte qu'à l'enregistrement d'un volet et à la connexion au courtier --
    // un changement de drapeau (capteur soleil/vent, commande d'une télécommande, MQTT) ne
    // remontait donc JAMAIS, alors que le groupe équivalent, lui, republiait. Un émetteur unique
    // rend cette divergence impossible plutôt qu'improbable.
    // Publie ce que publishState() publiait, aux mêmes conditions : `sunFlag`/`sunny` seulement
    // si hasSunSensor() (et retirés sinon), `windy` toujours. `hasSunSensor()` lisant le bit
    // SunSensor du MÊME octet `flags`, une bascule de ce bit passe naturellement par ici.
    void publishFlags();
    // Publication MQTT des six topics qui bougent pendant un mouvement, plus les drapeaux.
    // Appelée à chaque tour de SomfyShadeController::loop(), elle compare l'état courant à ce qui
    // a RÉELLEMENT été publié et n'émet que la différence -- même principe que les masques de
    // SomfyExpose.cpp : ne jamais supposer ce que le courtier détient, le retenir.
    void publishMovementState();
    // Ce que le courtier détient pour ces six topics. -2 = jamais publié : transformPosition()
    // rend -1..100 et les directions valent -1..1, la valeur est donc hors de toute plage réelle.
    // Rafraîchi par publishState(), qui republie ces mêmes topics à l'enregistrement d'un volet
    // et à la connexion au courtier.
    int8_t pubPosition = -2;
    int8_t pubTarget = -2;
    int8_t pubDirection = -2;
    int8_t pubTiltPosition = -2;
    int8_t pubTiltTarget = -2;
    int8_t pubTiltDirection = -2;
    // Ce que le courtier détient pour les topics dérivés de `flags`. int16_t et non uint8_t : il
    // faut une sentinelle « jamais publié » HORS de la plage réelle, et `flags` occupe tout
    // 0..255 (huit bits utilisés, cf. somfy_flags_t). -1 joue ce rôle.
    int16_t pubFlags = -1;
    // Horodatage de la dernière publication de position, pour l'étranglement pendant un mouvement.
    uint32_t lastMqttMove = 0;
    void commit();
    void commitShadePosition();
    void commitTiltPosition();
    void commitMyPosition();
    void clear();
    int8_t transformPosition(float fpos);
    void setGPIOs();
    void triggerGPIOs(somfy_frame_t &frame);
    bool usesPin(uint8_t pin);
    // State Setters
    int8_t p_direction(int8_t dir);
    int8_t p_tiltDirection(int8_t dir);
    float p_target(float target);
    float p_tiltTarget(float target);
    float p_myPos(float pos);
    float p_myTiltPos(float pos);
    bool p_flag(somfy_flags_t flag, bool val);
    bool p_sunFlag(bool val);
    bool p_sunny(bool val);
    bool p_windy(bool val);
    float p_currentPos(float pos);
    float p_currentTiltPos(float pos);
    uint16_t p_lastRollingCode(uint16_t code);
    bool publish(const char *topic, const char *val, bool retain = false);
    bool publish(const char *topic, uint8_t val, bool retain = false);
    bool publish(const char *topic, int8_t val, bool retain = false);
    bool publish(const char *topic, uint32_t val, bool retain = false);
    bool publish(const char *topic, uint16_t val, bool retain = false);
    bool publish(const char *topic, bool val, bool retain = false);
    void publishDisco();
    void unpublishDisco();
};
class SomfyGroup : public SomfyRemote {
  protected:
    uint8_t groupId = 255;
  public:
    uint8_t roomId = 0;
    int8_t sortOrder = 0;
    group_types groupType = group_types::channel;
    int8_t direction = 0; // 0 = stopped, 1=down, -1=up.
    char name[21] = "";
    uint8_t linkedShades[SOMFY_MAX_GROUPED_SHADES];
    void setGroupId(uint8_t id) { groupId = id; }
    uint8_t getGroupId() { return groupId; }
    bool save();
    void clear();
    bool fromJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json);
    // Même variante masquable que SomfyShade, pour la même raison (C-5, seconde moitié).
    void toJSON(JsonFormatter &json, bool secrets);
    void toJSONRef(JsonFormatter &json);
    
    bool linkShade(uint8_t shadeId);
    bool unlinkShade(uint8_t shadeId);
    bool hasShadeId(uint8_t shadeId);
    void compressLinkedShadeIds();
    void publish();
    void unpublish();
    static void unpublish(uint8_t id);
    static void unpublish(uint8_t id, const char *topic);
    void publishState();
    void updateFlags();
    void emitState(const char *evt = "groupState");
    void emitState(uint8_t num, const char *evt = "groupState");
    void sendCommand(somfy_commands cmd);
    void sendCommand(somfy_commands cmd, uint8_t repeat, uint8_t stepSize = 0);
    void moveToTarget(float pos, float tilt = -1.0f);
    void moveTiltOnly(float tilt);
    int8_t p_direction(int8_t dir);
    // Surcharge CHAÎNE, absente jusqu'au 23/08/2026 -- et son absence n'était pas une erreur
    // silencieuse : `publish("name", this->name, true)` compilait quand même, `char*` n'ayant
    // qu'une seule conversion viable vers le reste du jeu de surcharges, la conversion booléenne.
    // Le courtier recevait donc littéralement `groups/1/name = true`. SomfyShade a toujours eu
    // cette surcharge (plus haut dans ce fichier) ; SomfyGroup en était le seul dépourvu.
    bool publish(const char *topic, const char *val, bool retain = false);
    bool publish(const char *topic, uint8_t val, bool retain = false);
    bool publish(const char *topic, int8_t val, bool retain = false);
    bool publish(const char *topic, uint32_t val, bool retain = false);
    bool publish(const char *topic, uint16_t val, bool retain = false);
    bool publish(const char *topic, bool val, bool retain = false);
};
class SomfyShadeController {
  protected:
    uint8_t m_shadeIds[SOMFY_MAX_SHADES];
    uint32_t lastCommit = 0;
  public:
    bool useNVS();
    bool isDirty = false;
    uint32_t startingAddress;
    uint8_t getNextRoomId();
    uint8_t getNextShadeId();
    uint8_t getNextGroupId();
    // Republient les topics d'INDEX `shades` et `groups` (le tableau des identifiants existants).
    // Jusqu'au 23/08/2026 ces deux topics n'étaient construits que dans
    // SomfyShadeController::publish(), elle-même appelée UNIQUEMENT depuis MQTTClass::connect() :
    // créer ou supprimer un volet/groupe pendant que MQTT était connecté laissait donc l'index
    // périmé jusqu'à la prochaine reconnexion. Symptôme observé sur matériel : `shades = []` alors
    // que `shades/1/name` était bien publié -- le volet ayant été créé après la connexion (son
    // save() publie ses propres topics, mais rien ne touchait l'index).
    void publishShadeIndex();
    void publishGroupIndex();
    // Index `rooms`, ajouté par symétrie le 23/08/2026 : les pièces étaient absentes de tout le
    // mécanisme de publication et de nettoyage MQTT (cf. SomfyExpose.cpp).
    void publishRoomIndex();
    // Retire les fiches de découverte Home Assistant de tous les volets. Appelée par
    // /connectmqtt avant d'appliquer des réglages qui désactivent la découverte ou en changent le
    // préfixe -- après, plus rien ne permettrait de désigner les fiches déjà publiées.
    void unpublishDisco();
    int8_t getMaxRoomOrder();
    int8_t getMaxShadeOrder();
    int8_t getMaxGroupOrder();
    uint32_t getNextRemoteAddress(uint8_t shadeId);
    SomfyShadeController();
    Transceiver transceiver;
    SomfyRoom *addRoom();
    SomfyRoom *addRoom(JsonObject &obj);
    SomfyShade *addShade();
    SomfyShade *addShade(JsonObject &obj);
    SomfyGroup *addGroup();
    SomfyGroup *addGroup(JsonObject &obj);
    bool deleteRoom(uint8_t roomId);
    bool deleteShade(uint8_t shadeId);
    bool deleteGroup(uint8_t groupId);
    bool begin();
    void loop();
    void end();
    // Vrai si au moins un volet est actuellement en mouvement (SomfyShade::isIdle() == false).
    // Sert de garde avant un appel réseau bloquant (fetch GitHub synchrone dans le handler HTTP,
    // cf. GitOTA/WebSystem) : le laisser s'exécuter pendant un mouvement retarderait le STOP et
    // provoquerait un dépassement de course.
    bool isAnyShadeMoving();
    void compressRepeaters();
    uint32_t repeaters[SOMFY_MAX_REPEATERS] = {0};
    SomfyRoom rooms[SOMFY_MAX_ROOMS];
    SomfyShade shades[SOMFY_MAX_SHADES];
    SomfyGroup groups[SOMFY_MAX_GROUPS];
    bool linkRepeater(uint32_t address);
    bool unlinkRepeater(uint32_t address);
    void toJSONShades(JsonFormatter &json);
    void toJSONRooms(JsonFormatter &json);
    void toJSONGroups(JsonFormatter &json);
    void toJSONRepeaters(JsonFormatter &json);
    uint8_t repeaterCount();
    uint8_t roomCount();
    uint8_t shadeCount();
    uint8_t groupCount();
    void updateGroupFlags();
    SomfyShade * getShadeById(uint8_t shadeId);
    SomfyRoom * getRoomById(uint8_t roomId);
    SomfyGroup * getGroupById(uint8_t groupId);
    SomfyShade * findShadeByRemoteAddress(uint32_t address);
    SomfyGroup * findGroupByRemoteAddress(uint32_t address);
    void sendFrame(somfy_frame_t &frame, uint8_t repeats = 0);
    void processFrame(somfy_frame_t &frame, bool internal = false);
    void emitState(uint8_t num = 255);
    void publish();
    void processWaitingFrame();
    void commit();
    // false si le filesystem est momentanément verrouillé par GitOTA (rien n'a été écrit) ou si
    // l'écriture a échoué -- /backup doit alors refuser plutôt que servir un fichier périmé.
    bool writeBackup();
    bool loadShadesFile(const char *filename);
    #ifdef USE_NVS
    bool loadLegacy();
    #endif
};

// Indique si une broche est déjà attribuée au transceiver ou à un relais de volet, et renseigne
// `owner` avec un libellé exploitable dans un message d'erreur. Vit ici parce que c'est le seul
// endroit qui connaît à la fois la configuration radio et les GPIO des volets ; sert à la fois à la
// validation d'API (Web.cpp) et au garde-fou d'exécution du témoin lumineux (StatusLed.cpp).
bool somfyPinInUse(int8_t pin, const char **owner);

// Émet un événement socket léger ("radioActivity", corps vide) pour l'indicateur logiciel du header
// web (general.showRadioActivity côté frontend) -- pendant de statusLed.blink() pour les clients
// web, indépendant de la LED GPIO physique. Appelée SANS condition par les 4 points d'activité
// RF/mouvement (SomfyRadioDriver.cpp, SomfyPositioning.cpp) : la garde settings.showRadioActivity
// et l'anti-saturation sont internes, comme pour statusLed.blink() -- aucun test côté appelant.
void emitRadioActivity();

#endif
