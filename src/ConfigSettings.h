#include <ArduinoJson.h>
#include <ETH.h>
#ifndef configsettings_h
#define configsettings_h
#include "web/WResp.h"
#include <Preferences.h>
#define FW_VERSION "v3.0.0"

// --- Accès NVS : DEUX invariants, tous deux nés d'un défaut mesuré le 25/08/2026 ---
//
// 1. UNE INSTANCE `Preferences` PAR PORTÉE, jamais de global partagé.
//    Un objet Preferences ne porte qu'UN handle (`uint32_t _handle`). Jusqu'au 25/08/2026 tout le
//    projet partageait un unique `Preferences pref;` global, utilisé avec 14 espaces de noms
//    différents et depuis DEUX tâches : loopTask (cœur 1) y écrit le code tournant à chaque trame
//    RF reçue (SomfyRemote::setRollingCode), async_tcp (cœur 0) y écrit les réglages web. Ce ne
//    sont pas deux tâches qui se préemptent, ce sont deux cœurs qui s'exécutent réellement en
//    parallèle : le `pref.end()` de l'une fermait le handle que l'autre utilisait, d'où le
//    `nvs_set_u8 fail: pubDisco INVALID_HANDLE` observé en usage. L'API NVS d'ESP-IDF étant
//    elle-même protégée en interne, des handles distincts suffisent -- aucun verrou nécessaire.
//    Déclarer l'instance dans la fonction qui l'utilise, entre son begin() et son end().
//
// 2. TOUJOURS VÉRIFIER LE RETOUR DE put*(). Aucun ne l'était, et `save()` rendait `true`
//    inconditionnellement : un réglage pouvait donc échouer à se persister EN SILENCE, l'interface
//    annonçant le succès et la valeur disparaissant au redémarrage suivant.
//
//    PIÈGE, à ne pas contourner naïvement : `Preferences::putString()` rend `strlen(value)`, donc
//    **0 pour une chaîne vide** -- indiscernable d'un échec, alors qu'un identifiant ou un mot de
//    passe non renseignés sont parfaitement légitimes. `nvsPutOk()` ci-dessous fait cette
//    distinction ; ne jamais tester `putString(...) > 0` directement.
[[maybe_unused]] static inline bool nvsPutOk(size_t written, const char *value) {
  return written > 0 || (value != nullptr && value[0] == '\0');
}
[[maybe_unused]] static inline bool nvsPutOk(size_t written) { return written > 0; }
// Surcharge pour les String Arduino (IPSettings::save() persiste des IPAddress::toString()).
[[maybe_unused]] static inline bool nvsPutOk(size_t written, const String &value) {
  return written > 0 || value.length() == 0;
}

// Génération de la TABLE DE PARTITION -- délibérément indépendante de FW_VERSION : la table
// introduite en v3.0.0 vaut aussi pour les v4, v5 et suivantes, qui doivent donc rester
// installables par OTA. N'incrémenter QUE si partitions_custom*.csv change de façon
// incompatible (offsets ou tailles), auquel cas la mise à jour ne peut plus passer par OTA du
// tout -- la table n'étant jamais réécrite par Update -- et exige un flash USB.
//   1 = table v3.0.0 : app0/app1 de 0x1B0000, spiffs 0x370000/0x80000
// Un garde-fou de build (check_partition_layout.py, pre: dans platformio.ini) casse la
// compilation si un .csv est modifié sans que ce numéro bouge.
#define FW_PARTITION_LAYOUT 1

// Marqueur recherché dans toute image reçue par /updateFirmware. Il n'a besoin d'AUCUNE astuce
// d'embarquement (attribut used, section de linker, KEEP) : c'est le code de vérification
// lui-même qui référence ce littéral, donc tout firmware capable de vérifier une image en porte
// forcément un exemplaire en .rodata. La présence du marqueur EST la présence du contrôle -- un
// binaire antérieur à ce mécanisme, comme ceux de la v2.x.x, ne peut pas s'en réclamer.
#define _FW_STR2(x) #x
#define _FW_STR(x) _FW_STR2(x)
#define FW_IMAGE_MARKER "ESPSomfyRTS-PART/" _FW_STR(FW_PARTITION_LAYOUT) "/"
// Logging gated by the runtime settings.enableDebugLogs toggle (Système > Firmware > Diagnostic).
// Boot messages and critical errors keep using plain Serial calls; anything that fires repeatedly
// during normal operation (per request, per loop tick, per RF frame...) goes through these instead.
// Each translation unit using these macros must already have `extern ConfigSettings settings;` in scope.
#define DBG_PRINT(...) do { if (settings.enableDebugLogs) Serial.print(__VA_ARGS__); } while(0)
#define DBG_PRINTLN(...) do { if (settings.enableDebugLogs) Serial.println(__VA_ARGS__); } while(0)
#define DBG_PRINTF(...) do { if (settings.enableDebugLogs) Serial.printf(__VA_ARGS__); } while(0)
enum class conn_types_t : byte {
    unset = 0x00,
    wifi = 0x01,
    ethernet = 0x02,
    ethernetpref = 0x03,
    ap = 0x04
};

enum DeviceStatus {
  DS_OK = 0,
  DS_ERROR = 1,
  DS_FWUPDATE = 2
};
// Constantes symboliques pour ConfigSettings::headerMobileDisplay (stocké en uint8_t brut, comme
// ledPin, plutôt qu'en enum typé comme conn_types_t : c'est une simple liste de choix d'affichage,
// jamais comparée/castée ailleurs qu'ici et côté JSON).
enum header_mobile_display_t : uint8_t {
  HMD_ALL = 0,
  HMD_NET_ONLY = 1,
  HMD_UPTIME_ONLY = 2,
  HMD_NONE = 3
};
struct restore_options_t {
  bool settings = false;
  bool shades = false;
  bool network = false;
  bool transceiver = false;
  bool repeaters = false;
  bool mqtt = false;
  void fromJSON(JsonObject &obj);
};
struct appver_t {
  char name[15] = "";
  uint8_t major = 0;
  uint8_t minor = 0;
  uint8_t build = 0;
  // Élargi le 24/08/2026 (M-15) : 3 caractères utiles ne suffisaient pas à retenir un suffixe
  // réel ("beta", "rc1", "dev"...). Sans effet sur le format de configuration -- seul
  // `fwVersion.name` est persisté, en chaîne variable (cf. ConfigFile.cpp) ; cette structure n'est
  // jamais écrite champ par champ.
  char suffix[12] = "";
  void parse(const char *ver);
  void toJSON(JsonFormatter &json);
  void toJSON(JsonSockEvent *json);
  int8_t compare(appver_t &ver);
  void copy(appver_t &ver);
};
// loadFile()/saveFile() RETIRÉES le 24/08/2026 (M-21 / P-3). Elles n'avaient aucun appelant --
// vérifié sur tout src/ ; les `loadFile` de ConfigFile.cpp appartiennent à ShadeConfigFile et
// ScheduleConfigFile, sans rapport avec cette classe. Non virtuelles, donc aucune redéfinition
// possible ailleurs. Les corriger n'aurait servi personne, et elles portaient trois défauts :
//  - `data += c` octet par octet, soit un realloc exact-fit par caractère sur ce coeur : le motif
//    de fragmentation du tas déjà documenté et corrigé pour AsyncResponseStream (cf. WResp.h) ;
//  - saveFile() faisait `doc.as<JsonObject>()` sur un document VIDE au lieu de `doc.to<>()`, ce
//    qui aurait écrit littéralement `null` dans le fichier ;
//  - loadFile() retournait `false` en toutes circonstances, succès compris.
// Supprimer était plus sûr que réparer du code que personne n'exerce.
class BaseSettings {
  public:
    bool fromJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json);
    bool parseIPAddress(JsonObject &obj, const char *prop, IPAddress *);
    bool parseValueString(JsonObject &obj, const char *prop, char *dest, size_t size);
    // Comme parseValueString, mais pour les secrets (mots de passe, PIN...) : une valeur absente
    // OU vide laisse le champ inchangé. Le client ne reçoit jamais le secret existant, donc un
    // champ vide veut dire "l'utilisateur n'a rien retapé", pas "effacer le secret".
    bool parseSecretString(JsonObject &obj, const char *prop, char *dest, size_t size);
    int parseValueInt(JsonObject &obj, const char *prop, int defVal);
    double parseValueDouble(JsonObject &obj, const char *prop, double defVal);
    bool save();
    bool load();
};
class NTPSettings: BaseSettings {
  public:
    char ntpServer[65] = "pool.ntp.org";
    #if defined(HARDWARE_BOX_ETH) || defined(HARDWARE_BOX_WIFI)
    char posixZone[64] = "CET-1CEST-2,M3.5.0/02:00:00,M10.5.0/03:00:00";
    #else
    char posixZone[64] = "UTC0";
    #endif
    bool fromJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json);
    bool apply();
    bool begin();
    bool save();
    bool load();
    void print();
};
class WifiSettings: BaseSettings {
  public:
    WifiSettings();
    bool roaming = false;
    bool hidden = false;
    char ssid[65] = "";
    char passphrase[65] = "";
    // Mot de passe WPA2 du point d'accès de secours (hotspot ouvert quand le Wi-Fi principal
    // échoue). "espsomfyrts" par défaut : WPA2 exige au moins 8 caractères
    char apPassword[65] = "espsomfyrts";
    //bool ssdpBroadcast = true;
    bool begin();
    bool fromJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json);
    bool ssidExists(const char *ssid);
    void printNetworks();
    bool save();
    bool load();
    void print();
};
class EthernetSettings: BaseSettings {
  public:
    EthernetSettings();
    #if defined(HARDWARE_BOX_ETH)
    uint8_t boardType = 1; // Type 1 par défaut pour le boîtier Ethernet
    #else
    uint8_t boardType = 0; // Type 0 par défaut (Wi-Fi ou Standard)
    #endif
    eth_phy_type_t phyType = ETH_PHY_LAN8720;
    eth_clock_mode_t CLKMode = ETH_CLOCK_GPIO0_IN;
    int8_t phyAddress = ETH_PHY_ADDR;
    int8_t PWRPin = ETH_PHY_POWER;
    int8_t MDCPin = ETH_PHY_MDC;
    int8_t MDIOPin = ETH_PHY_MDIO;
    
    bool begin();
    bool fromJSON(JsonObject &obj);
    bool toJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json);
    bool load();
    bool save();
    void print();
    bool usesPin(uint8_t pin);
};
class IPSettings: BaseSettings {
  public:
    IPSettings();
    bool dhcp = true;
    IPAddress ip;
    IPAddress subnet = IPAddress(255,255,255,0);
    IPAddress gateway = IPAddress(0,0,0,0);
    IPAddress dns1 = IPAddress(0,0,0,0);
    IPAddress dns2 = IPAddress(0,0,0,0);
    bool begin();
    bool fromJSON(JsonObject &obj);
    bool toJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json);
    bool load();
    bool save();
    void print();
};
enum class security_types : byte {
  None = 0x00,
  PinEntry = 0x01,
  Password = 0x02
};
enum class security_permissions : byte {
  ConfigOnly = 0x01
};
class SecuritySettings: BaseSettings {
  public:
    security_types type = security_types::None;
    char username[33] = "";
    char password[33] = "";
    char pin[5] = "";
    uint8_t permissions = 0;
    bool begin();
    bool save();
    bool load();
    void print();
    bool toJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json);
    bool fromJSON(JsonObject &obj);
};
class MQTTSettings: BaseSettings {
  public:
    bool enabled = false;
    bool pubDisco = false;
    char hostname[65] = "ESPSomfyRTS";
    // CONSTANTE, et non plus un champ saisissable (E-7, refermé le 25/08/2026). Ce firmware ne
    // parle QUE du MQTT en clair : MQTTClass::connect() instancie un WiFiClient nu et n'a jamais
    // consulté ce champ. Il était donc saisi, persisté en NVS, réaffiché et sans le moindre effet
    // -- choisir "mqtts://" donnait la certitude fausse d'une liaison chiffrée pendant que
    // l'identifiant et le mot de passe du courtier partaient en clair. L'option a été retirée de
    // l'interface ; la rendre CONSTANTE ici est ce qui empêche l'état incohérent de revenir par
    // une autre porte (restauration d'une sauvegarde faite sur une version antérieure, charge
    // utile /connectmqtt forgée, valeur déjà gravée en NVS) : le compilateur refuse désormais
    // toute écriture, plutôt qu'un garde-fou à replacer sur chaque chemin.
    //
    // Rétablir un choix suppose d'abord d'implémenter TLS côté firmware, au prix de ~34 Ko de tas
    // retenus pour toute la durée de la connexion -- à arbitrer face au budget mémoire de l'OTA
    // (cf. GIT_TLS_MIN_HEAP_BYTES). Le champ reste émis en JSON et écrit dans l'enregistrement
    // réseau de la sauvegarde : ces deux formats sont positionnels, on n'en retire pas un champ
    // sans en changer la version.
    static const char *const protocol;
    uint16_t port = 1883;
    char username[33] = "";
    char password[33] = "";
    char rootTopic[65] = "";
    char discoTopic[65] = "homeassistant";
    // Identifiant client annoncé au courtier. Vide = repli sur "client-<mac>", unique par
    // appareil. Utile quand le courtier indexe ses ACL sur cet identifiant, ou quand deux
    // boîtiers partagent le même courtier. Persisté en NVS uniquement : l'enregistrement réseau
    // de la sauvegarde (writeNetRecord) est un format binaire figé, au même titre que le nom
    // d'utilisateur et le mot de passe du courtier qui n'y figurent pas non plus.
    char clientId[65] = "";
    // Le topic racine est la SEULE chose qui délimite l'espace de noms de ce module sur le
    // courtier : c'est lui qui fait que `shades/+/target/set` n'est pas un topic global. Vide,
    // makeTopic() publiait ET s'abonnait à la racine du courtier, où n'importe quel autre
    // publieur pouvait alors piloter les volets. Refuse aussi les jokers (`+`, `#`), qui à
    // l'abonnement élargiraient la portée au lieu de la restreindre, un `/` ou un `$` en tête
    // (niveau vide, espace réservé du courtier) et les caractères de contrôle.
    static bool isValidRootTopic(const char *topic);
    // Comble un topic racine vide par un défaut stable dérivé de l'identifiant de l'appareil.
    // Rend true si la valeur a dû être changée, pour que l'appelant sache qu'il faut la persister.
    bool ensureRootTopic();
    bool begin();
    bool save();
    bool load();
    void toJSON(JsonFormatter &json);
    bool fromJSON(JsonObject &obj);
};
// Table de correspondance avec l'ancien enum uint8_t (0=en,1=fr,2=de,3=es), conservée
// uniquement pour : la migration des anciennes valeurs NVS (ConfigSettings::load()) et la
// compatibilité binaire du format shades.cfg (ConfigFile.cpp), qui stocke toujours 1 octet.
// Le code canonique en mémoire est désormais la chaîne ISO (ConfigSettings::language).
void langIndexToCode(uint8_t idx, char *dest, size_t destSize);
uint8_t langCodeToIndex(const char *code);

class ConfigSettings: BaseSettings {
  public:
    static void printAvailHeap();
    // Liste bloc par bloc (adresse + taille + libre/alloué) du tas MALLOC_CAP_8BIT, précédée du
    // récapitulatif par région (audit heap, 17/08/2026). Sert à identifier NOMMÉMENT ce qui occupe
    // le milieu de l'unique région exploitable : sur matériel réel, celle-ci (0x3ffe4350, 113840
    // octets) s'est retrouvée coupée en deux moitiés libres d'environ 41 Ko séparées par un amas de
    // ~124 petites allocations longue durée -- d'où un ESP.getMaxAllocHeap() bloqué à 40948 alors
    // que plus de 100 Ko restaient libres au total. Le diff entre un appel de RÉFÉRENCE (juste après
    // le boot réseau, tas encore quasi contigu) et un appel EN SITUATION DÉGRADÉE désigne l'amas
    // sans ambiguïté ; c'est pour rendre ce diff exploitable que les deux passent par cette même
    // fonction, donc par un format d'affichage identique au caractère près.
    // Volumineux (~140 lignes) et réservé à `enableDebugLogs` : à n'appeler que ponctuellement.
    static void dumpHeapBlocks(const char *label);
    // Traceur du point bas de la pile de la tâche async_tcp. N'imprime QUE lorsqu'un nouveau
    // minimum est atteint, en nommant le chemin qui vient de s'exécuter : un relevé absolu lu à un
    // instant quelconque (ce que faisait printAvailHeap()) ne dit pas QUI a creusé la pile, alors
    // que c'est précisément ce qu'il faut savoir avant de réduire CONFIG_ASYNC_TCP_STACK_SIZE.
    // uxTaskGetStackHighWaterMark() étant un minimum historique monotone, l'appel peut se faire
    // après coup sans rien manquer. Naturellement silencieux (quelques lignes sur toute la vie de
    // l'appareil), donc non conditionné à enableDebugLogs.
    static void reportAsyncTcpStackLow(const char *label);
    char serverId[10] = "";
    char hostname[32] = "ESPSomfyRTS";
    char chipModel[10] = "ESP32";
    char hardwareProfile[15];
    char accentColor[8] = "#1a5fb4";
    conn_types_t connType = conn_types_t::unset;
    appver_t fwVersion;
    appver_t appVersion;
    bool ssdpBroadcast = true;
    bool checkForUpdate = true;
    bool swShowGpio = false;
    // Active les logs de debug verbeux (trames RF envoyées, corps bruts des requêtes HTTP)
    // à chaud depuis l'UI, sans avoir à reflasher avec un #ifdef.
    bool enableDebugLogs = false;
    // LED de statut. Les profils BOX ont un câblage figé et connu : ils ignorent ces trois réglages
    // au profit des constantes de Recovery.h, pour qu'une valeur aberrante (restauration d'une
    // sauvegarde faite depuis une carte générique, par exemple) ne puisse pas éteindre ou
    // détourner la LED d'un boîtier connu-bon. Seul le profil GENERIC les lit.
    // -1 = aucune LED câblée (défaut) ; ledActiveLow inverse le niveau logique d'allumage.
    int8_t ledPin = -1;
    bool ledActiveLow = false;
    // Témoin d'activité radio : clignotement bref à chaque salve émise et à chaque trame reçue.
    // Global et non filtrable -- en réception l'émetteur est souvent inconnu (télécommande du
    // voisin), un filtrage par volet n'aurait pas de sens.
    bool ledRfBlink = false;
    // ===================================================================================
    // Personnalisation de l'interface (dashboard/header) -- Système > Général > Préférences.
    // Contrairement au thème, à la couleur d'accent ou aux retours haptiques/visuels (100%
    // client, cf. General.getFeedbackPrefs() côté web), ces réglages doivent survivre à un
    // changement de navigateur ou d'appareil : ils sont donc persistés côté firmware comme
    // n'importe quel autre réglage général (NVS + /setgeneral), pas en localStorage.
    // ===================================================================================
    // Éléments affichés dans le header en largeur mobile (<768px) : 0=tout (statut réseau +
    // uptime), 1=statut réseau seul, 2=uptime seul, 3=aucun. Voir header_mobile_display_t
    // ci-dessous pour les constantes symboliques utilisées côté C++.
    uint8_t headerMobileDisplay = 0;
    // Inverse l'ordre Gauche/Droite des colonnes Équipements/Groupes du tableau de bord en
    // largeur desktop (cf. .dashboard-split-container, data-dev/overlays.css).
    bool reverseDashboardColumns = false;
    // Colonne affichée par défaut à l'ouverture du tableau de bord en largeur mobile. Reprend
    // tel quel le vocabulaire déjà utilisé par somfy.switchMobileTab('groups'|'devices') côté
    // web pour éviter une couche de correspondance supplémentaire.
    char defaultMobileTab[8] = "groups";
    // Indicateur logiciel (point lumineux dans le header, toutes pages) d'activité radio RTS
    // (émission/réception) ou de mouvement d'un équipement/groupe -- pendant visuel de la LED
    // GPIO physique (ledRfBlink) pour les appareils qui n'en ont pas, ou en plus de celle-ci.
    bool showRadioActivity = false;
    // Position géographique pour le calcul lever/coucher du soleil (cf. SunCalc). Sentinelle
    // "non configuré" : geoLat=99.0 (hors plage valide -90..90), au lieu de NaN -- JsonFormatter::
    // addElem(float) fait un sprintf("%.4f", ...) qui produirait un JSON invalide ("nan") avec NaN.
    // Arrondi à 2 décimales (~1,1 km) avant persistance côté serveur (cf. Web::/setgeneral) :
    // largement suffisant pour une précision de calcul à la minute, et raisonnable côté vie privée.
    float geoLat = 99.0f;
    float geoLon = 0.0f;
    bool hasGeoPosition() { return this->geoLat >= -90.0f && this->geoLat <= 90.0f; }
    uint8_t status;
    // Code langue ISO (ex: "en", "fr") -- remplace l'ancien enum uint8_t (0=en,1=fr,2=de,3=es).
    // Voir langIndexToCode()/langCodeToIndex() pour la compatibilité binaire (shades.cfg) et la
    // migration transparente des anciennes valeurs NVS.
    #if defined(HARDWARE_BOX_ETH) || defined(HARDWARE_BOX_WIFI)
    char language[8] = "fr";
    #else
    char language[8] = "en";
    #endif
    // Langue choisie en mode AP (pas de route Internet côté ESP32) en attente de téléchargement
    // dès qu'une vraie connexion Internet sera disponible -- cf. GitUpdater::loop()/checkPendingLang().
    // Volontairement absente du format binaire shades.cfg (calcSettingsRecSize/ConfigFile.cpp) et
    // de fromJSON(JsonObject&) (API générale) : c'est un état transitoire de file d'attente, pas
    // une préférence utilisateur stable à sauvegarder/restaurer -- ne se modifie que via
    // /setPendingLang.
    char pendingLang[8] = "";
    // Assistant de premier démarrage (Onboarding Wizard) : true une fois terminé OU explicitement
    // ignoré par l'utilisateur -- tant que false et que l'appareil est en mode AP, le frontend
    // affiche l'assistant à la place du tableau de bord habituel (cf. /setOnboardingDone).
    bool onboardingDone = false;
    IPSettings IP;
    WifiSettings WIFI;
    EthernetSettings Ethernet;
    NTPSettings NTP;
    MQTTSettings MQTT;
    SecuritySettings Security;
    bool requiresAuth();
    bool fromJSON(JsonObject &obj);
    bool toJSON(JsonObject &obj);
    void toJSON(JsonFormatter &json);
    bool begin();
    bool save();
    bool load();
    void print();
    void emitSockets(uint8_t num);
    uint16_t calcSettingsRecSize();
    uint16_t calcNetRecSize();
    bool getAppVersion();
};
#endif
