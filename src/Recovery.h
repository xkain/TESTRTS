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
#if defined(HARDWARE_BOX_ETH)
// Boîtier Ethernet (WT32-ETH01)
#define LED_PIN          5
#define LED_ON           LOW  // Active Low (0 = allumé)
#define LED_OFF          HIGH

#elif defined(HARDWARE_BOX_WIFI)
// Boîtier Wi-Fi (ESP32 D1 Mini)
#define LED_PIN          2
#define LED_ON           HIGH // Active High (1 = allumé)
#define LED_OFF          LOW

#else
// Option de repli par défaut pour les autres variantes
#define LED_PIN          -1
#define LED_ON           HIGH
#define LED_OFF          LOW
#endif
// ------------------------------------------------

// Ce que l'utilisateur a coché dans la page de récupération. Tout est faux par défaut : une session
// de récupération sans case cochée ne doit strictement rien modifier.
struct RecoveryTargets {
  bool network = false;       // WIFI + IP + ETH + connType
  bool security = false;      // SEC + jeton d'API
  bool system = false;        // MQTT + NTP + réglages généraux (hors réseau et hors debug)
  bool shades = false;        // volets/groupes/pièces (NVS Shades + fichiers de config)
  bool schedules = false;     // /schedules.cfg
  bool langs = false;         // packs de langue téléchargés
  bool rollingCodes = false;  // NVS ShadeCodes -- désynchronise les moteurs appairés
  bool factory = false;       // effacement NVS complet + fichiers de config
  bool formatFS = false;      // LittleFS.format()
  bool enableDebugLogs = false;
};

class Recovery {
  public:
    // Incrémente le compteur de cycles et arme le retour visuel. NE BLOQUE PAS : le reste du boot
    // (montage du filesystem, chargement des réglages) se déroule PENDANT la fenêtre de détection
    // au lieu d'attendre derrière elle.
    void beginDetection();
    // Épuise ce qui reste de la fenêtre, remet le compteur à zéro et arrête la décision.
    void endDetection();
    bool isRequested() { return this->_requested; }
    bool isActive() { return this->_active; }
    // Démarre l'AP de secours, le portail captif et le serveur web dédié.
    void begin();
    void loop();
  private:
    bool _requested = false;
    bool _active = false;
    int _cycle = 0;
    int _flashSpeed = 0;
    uint32_t _detectStart = 0;
    uint32_t _lastClientSeen = 0;
    uint32_t _lastBlink = 0;
    WebServer *_server = nullptr;
    DNSServer *_dns = nullptr;
    void _registerRoutes();
    void _apply(const RecoveryTargets &t);
    void _rebootSoon();
};

extern Recovery recovery;

#endif
