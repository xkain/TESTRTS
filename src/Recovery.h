// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef RECOVERY_H
#define RECOVERY_H

#include <Arduino.h>
#include <WebServer.h>
#include <DNSServer.h>

// Nombre de coupures d'alimentation successives (pendant la fenêtre BOOT_TIMEOUT) donnant accès au
// mode Récupération. L'ancien palier à 6 cycles, qui déclenchait un effacement d'usine à l'aveugle,
// n'existe plus : la réinitialisation d'usine est devenue une case à cocher de l'interface, donc
// délibérée et annulable tant qu'elle n'est pas appliquée.
#define RECOVERY_CYCLES 3
#define BOOT_TIMEOUT 5000

// SSID volontairement distinct de celui de l'AP d'onboarding (qui diffuse settings.hostname) : en
// scannant les réseaux, il doit être évident que l'appareil est en secours et pas en première
// configuration. Réseau OUVERT : le mot de passe de l'AP normal fait justement partie de ce qu'on
// peut avoir à récupérer, s'en servir pour garder l'accès de secours serait circulaire. Le garde-fou
// est physique (trois coupures délibérées) et temporel (RECOVERY_IDLE_TIMEOUT).
#define RECOVERY_AP_SSID "ESPSomfy-RECOVERY"
#define RECOVERY_IDLE_TIMEOUT 600000UL   // 10 min sans client -> redémarrage automatique
#define RECOVERY_DNS_PORT 53

// --- CONFIGURATION DE LA LED SELON LE BOÎTIER ---
// Ces constantes décrivent un CÂBLAGE, pas une préférence. Sur les boîtiers elles font autorité et
// priment sur NVS (LED_PROFILE_FIXED) : une valeur enregistrée aberrante -- typiquement la
// restauration sur un boîtier d'une sauvegarde faite depuis une carte générique -- ne doit pas
// pouvoir éteindre ou détourner la LED d'un matériel connu-bon.
// Sur les cartes génériques, l'utilisateur câble ce qu'il veut : la broche et la polarité viennent
// de NVS et valent « aucune LED » par défaut. StatusLed.h réutilise ces mêmes constantes.
#if defined(HARDWARE_BOX_ETH)
// Boîtier Ethernet (WT32-ETH01) -- actif bas
#define LED_PROFILE_PIN        5
#define LED_PROFILE_ACTIVE_LOW true
#define LED_PROFILE_FIXED      1

#elif defined(HARDWARE_BOX_WIFI)
// Boîtier Wi-Fi (ESP32 D1 Mini) -- actif haut
#define LED_PROFILE_PIN        2
#define LED_PROFILE_ACTIVE_LOW false
#define LED_PROFILE_FIXED      1

#else
// Cartes génériques : rien de câblé par défaut, tout vient des réglages.
#define LED_PROFILE_PIN        -1
#define LED_PROFILE_ACTIVE_LOW false
#define LED_PROFILE_FIXED      0
#endif

// Niveau des trois composantes d'une LED ADRESSABLE allumée. Bas volontairement : une WS2812 à
// pleine échelle éblouit de près sans rien apporter à un témoin d'activité. R=G=B rend du même coup
// l'ORDRE des octets sans objet -- plusieurs cartes câblent du RGB là où le WS2812 standard attend
// du GRB, et le firmware n'a aucun moyen de le deviner.
// Défini ICI et pas dans StatusLed.h, où il est né : les deux témoins éclairent la MÊME LED, et
// deux luminosités qui divergeraient se verraient à l'oeil au passage de la récupération au
// fonctionnement nominal. Recovery.h est déjà le domicile du câblage LED, StatusLed.h l'inclut.
#define LED_ADDRESSABLE_LEVEL 24

// Couleur du témoin de DÉMARRAGE et de RÉCUPÉRATION sur une LED adressable. Bleue et non blanche :
// elle distingue d'un coup d'oeil ces deux phases du fonctionnement nominal, dont les couleurs sont
// réglables (ConfigSettings::ledColorIdle / ledColorActivity).
// Câblée en dur et NON configurable, délibérément : ce témoin est le seul retour dont dispose
// l'utilisateur quand plus rien d'autre ne fonctionne, un réglage pourrait l'éteindre -- ou être
// lui-même illisible, puisqu'il vit dans la configuration qu'on est précisément en train de
// réparer. Le rythme continue de porter le reste du message (fixe = démarrage normal, rapide =
// cycle de récupération atteint, lent = point d'accès de secours).
#define LED_RECOVERY_R 0
#define LED_RECOVERY_G 0
#define LED_RECOVERY_B LED_ADDRESSABLE_LEVEL

// Écriture d'un pixel adressable, indépendante de la version du core. Les DEUX témoins passent par
// ici (StatusLed::_write et Recovery::_led), c'est le seul point du projet qui touche le RMT.
//
// Le branchement est obligatoire, pas cosmétique : le projet compile sur deux cores et aucun des
// deux noms ne couvre les deux. rgbLedWrite() est le nom moderne, totalement ABSENT du core 2.0.17
// qu'apporte espressif32@6.8.1 -- soit HUIT des neuf environnements ; neopixelWrite(), son alias
// historique, est marqué [[deprecated]] dans le core 3.x et annoncé pour suppression. Seul
// l'environnement esp32c6 passe par pioarduino et donc par le core 3.x (cf. platformio.ini) : le
// S3, malgré sa table de partitions à part, reste sur la plateforme commune.
//
// La broche part telle quelle. Les deux cores détournent la valeur RGB_BUILTIN vers la broche réelle
// de la LED embarquée, mais RGB_BUILTIN vaut SOC_GPIO_PIN_COUNT + n (39 sur C6, 97 sur S3) : un vrai
// numéro de GPIO ne peut pas la heurter par accident.
//
// LIMITE DU CORE 2.0.17 qu'aucune garde ne corrige : son neopixelWrite() retient la broche du
// PREMIER appel dans une variable `static` et n'en change plus jamais. Sur ces huit environnements,
// DÉPLACER une LED adressable depuis l'interface reste donc sans effet jusqu'au redémarrage : les
// écritures continuent de partir sur la broche d'origine. Le core 3.x réinitialise par broche et n'a
// pas ce défaut -- le C6, seule carte du projet qui ait une LED adressable d'usine, y échappe.
static inline void ledPixelWrite(uint8_t pin, uint8_t r, uint8_t g, uint8_t b) {
  #if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  rgbLedWrite(pin, r, g, b);
  #else
  neopixelWrite(pin, r, g, b);
  #endif
}
// ------------------------------------------------

// Ce que l'utilisateur a coché dans la page de récupération. Tout est faux par défaut : une session
// de récupération sans case cochée ne doit strictement rien modifier.
//
// `shades` entraîne `schedules`, forcé à la lecture du JSON de /recoveryApply -- donc quel que soit
// le client, et pas seulement quand l'interface a verrouillé la case. Sans ça, les plannings
// survivraient à leurs cibles : les identifiants d'équipement et de groupe étant réattribués en
// partant du plus petit libre (SomfyShadeController::getNextShadeId), une règle orpheline se
// rattacherait en silence au prochain équipement créé. L'inverse reste libre -- effacer les
// plannings seuls ne touche à rien d'autre, et c'est tout l'intérêt d'une case distincte.
struct RecoveryTargets {
  bool network = false;       // WIFI + IP + ETH + connType
  bool security = false;      // SEC + jeton d'API
  bool system = false;        // MQTT + NTP + réglages généraux (hors réseau et hors debug)
  bool shades = false;        // équipements/groupes/pièces (NVS Shades + fichiers de config)
  bool schedules = false;     // /schedules.cfg -- forcé par shades, cf. ci-dessus
  bool langs = false;         // packs de langue téléchargés
  bool rollingCodes = false;  // NVS ShadeCodes -- désynchronise les moteurs appairés
  bool factory = false;       // effacement NVS complet + fichiers de config
  bool enableDebugLogs = false;
};

class Recovery {
  public:
    // Incrémente le compteur de cycles et arme le retour visuel. NE BLOQUE PAS : le reste du boot
    // (montage du filesystem, chargement des réglages) se déroule PENDANT la fenêtre de détection
    // au lieu d'attendre derrière elle.
    void beginDetection();
    // Arrête la DÉCISION (mode Récupération demandé ou non) et rend la main. NE BLOQUE PAS dans le
    // cas nominal : la fenêtre de BOOT_TIMEOUT continue de courir en arrière-plan, entretenue par
    // loopDetection().
    //
    // Ce que la fenêtre décide est connu dès beginDetection() -- `_cycle >= RECOVERY_CYCLES`, lu en
    // NVS avant même le montage du filesystem. Son SEUL rôle restant est donc de retarder la remise
    // à zéro du compteur de cycles : « l'appareil a tenu BOOT_TIMEOUT sans coupure, ce démarrage est
    // normal ». Attendre pour ça immobilisait tout le démarrage 4,6 s, alors que le même verdict
    // s'obtient en horodatant la décision plutôt qu'en la faisant patienter. La fenêtre utilisateur
    // reste de 5 s à la milliseconde près, le retour visuel aussi.
    //
    // EXCEPTION, délibérée : quand le mode Récupération est acquis (cycle atteint, ou forceRequest()
    // après un filesystem illisible), l'attente historique est CONSERVÉE telle quelle. Il n'y a rien
    // à gagner à écourter le démarrage d'un appareil qui ne démarrera pas, et le clignotement rapide
    // de ces 5 secondes est le seul signe qui confirme à l'utilisateur qu'il a atteint le cycle de
    // récupération -- il doit rester visible en entier.
    void endDetection();
    // Entretient la fenêtre de détection depuis la boucle principale, puis la referme (compteur de
    // cycles remis à zéro, témoin rendu à StatusLed). No-op dès qu'elle est close, et jamais
    // atteinte en mode Récupération, où endDetection() a déjà tout fait.
    //
    // Cohabitation avec StatusLed pendant ces quelques secondes : les deux pilotent la même broche,
    // mais StatusLed s'abstient d'écrire tant que isDetecting() est vrai, et pose sa couleur de
    // repos au premier tour de boucle qui suit la fermeture. Le partage était auparavant implicite
    // -- StatusLed::begin() éteignait la broche et la réaffirmation suivante de Recovery la
    // reprenait, trop vite pour être vue. Une couleur de repos autre que « éteint » aurait rendu ce
    // va-et-vient parfaitement visible, d'où la passation explicite.
    void loopDetection();
    // Referme la fenêtre séance tenante. À n'appeler que depuis le chemin de redémarrage volontaire
    // de loop() : sans elle, un redémarrage demandé pendant la fenêtre laisserait le compteur de
    // cycles incrémenté, et trois d'affilée ouvriraient le mode Récupération sans qu'aucune
    // alimentation n'ait été coupée. Cas de figure très improbable (le réseau n'est pas encore
    // connecté à ce stade du démarrage), fermé quand même : c'est deux lignes.
    void closeDetection() { this->_finishDetection(); }
    bool isRequested() { return this->_requested; }
    // Vrai tant que la fenêtre de détection court. StatusLed s'en sert pour ne pas écraser le
    // témoin de démarrage : les deux pilotent la même broche pendant ces quelques secondes, et une
    // couleur de repos autre que « éteint » les ferait se disputer la LED dix fois par seconde.
    // Vrai AVANT beginDetection() aussi, ce qui est correct : rien ne doit écrire là non plus.
    bool isDetecting() const { return !this->_detectClosed; }
    bool isActive() { return this->_active; }
    // Force l'entrée en mode Récupération indépendamment du compteur de coupures d'alimentation --
    // utilisé quand le montage du filesystem échoue au boot (OTA interrompue, secteur corrompu) :
    // attendre les 3 coupures manuelles laisserait sinon démarrer une UI cassée sans que rien ne
    // guide l'utilisateur vers la réparation. Sans effet sur le compteur/la LED de la détection
    // physique, qui continuent de fonctionner normalement en parallèle.
    void forceRequest() { this->_requested = true; }
    // Démarre l'AP de secours, le portail captif et le serveur web dédié.
    void begin();
    void loop();
  private:
    bool _requested = false;
    bool _active = false;
    bool _uploadOk = false;
    // Résolus au tout début de beginDetection(), donc AVANT settings.begin() : la lecture se fait
    // directement via Preferences, comme celle du compteur de cycles juste à côté.
    int8_t _ledPin = -1;
    bool _ledActiveLow = false;
    // Type de LED, lu dans la même clé NVS que StatusLed. Sans lui, le témoin de récupération reste
    // muet sur une carte à pixel adressable -- précisément le matériel où le clignotement est la
    // SEULE chose qui atteste que les trois coupures ont été comptées.
    bool _ledAddressable = false;
    // État courant du témoin. Les deux bascules du mode Récupération partaient d'un digitalRead sur
    // la broche ; un pixel adressable ne se relit pas (RMT a la main sur la sortie), il faut donc
    // mémoriser. Fonctionne à l'identique pour une sortie à niveau.
    bool _ledOn = false;
    int _cycle = 0;
    int _flashSpeed = 0;
    bool _detectClosed = false;
    uint32_t _detectStart = 0;
    uint32_t _lastClientSeen = 0;
    uint32_t _lastBlink = 0;
    WebServer *_server = nullptr;
    DNSServer *_dns = nullptr;
    void _registerRoutes();
    void _apply(const RecoveryTargets &t);
    void _rebootSoon();
    void _resolveLed();
    void _led(bool on);
    // Un pas d'entretien du témoin pendant la fenêtre de détection. Partagé par les deux chemins de
    // endDetection() (l'attente bloquante du mode Récupération et loopDetection()) pour qu'ils ne
    // puissent pas diverger.
    void _serviceLed();
    void _finishDetection();
};

extern Recovery recovery;

#endif
