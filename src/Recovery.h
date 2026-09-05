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
// ------------------------------------------------

// Ce que l'utilisateur a coché dans la page de récupération. Tout est faux par défaut : une session
// de récupération sans case cochée ne doit strictement rien modifier.
struct RecoveryTargets {
  bool network = false;       // WIFI + IP + ETH + connType
  bool security = false;      // SEC + jeton d'API
  bool system = false;        // MQTT + NTP + réglages généraux (hors réseau et hors debug)
  bool shades = false;        // équipements/groupes/pièces (NVS Shades + fichiers de config)
  bool schedules = false;     // /schedules.cfg
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
    // Arrête la DÉCISION (mode Récupération demandé ou non) et rend la main. NE BLOQUE PLUS dans le
    // cas nominal (L1.2 de l'audit de performance du 26/08/2026) : la fenêtre de BOOT_TIMEOUT
    // continue de courir en arrière-plan, entretenue par loopDetection().
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
    // mais StatusLed::begin() se contente de l'éteindre une fois (le tour de boucle suivant la
    // reprend, invisible à l'oeil) et StatusLed::loop() sort immédiatement tant qu'aucun blink()
    // n'est en cours. Aucun des deux ne peut figer le témoin de l'autre.
    void loopDetection();
    // Referme la fenêtre séance tenante. À n'appeler que depuis le chemin de redémarrage volontaire
    // de loop() : sans elle, un redémarrage demandé pendant la fenêtre laisserait le compteur de
    // cycles incrémenté, et trois d'affilée ouvriraient le mode Récupération sans qu'aucune
    // alimentation n'ait été coupée. Cas de figure très improbable (le réseau n'est pas encore
    // connecté à ce stade du démarrage), fermé quand même : c'est deux lignes.
    void closeDetection() { this->_finishDetection(); }
    bool isRequested() { return this->_requested; }
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
