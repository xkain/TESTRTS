#ifndef STATUSLED_H
#define STATUSLED_H

#include <Arduino.h>

// Témoin lumineux du fonctionnement nominal. Volontairement distinct du pilotage LED de Recovery :
// celui-ci ne tourne que quand le mode secours est actif, et son autonomie totale (aucune
// dépendance à ConfigSettings, au filesystem ni au réseau) est précisément ce qui le rend fiable
// quand tout le reste est cassé. Les deux lisent les mêmes clés NVS mais ne partagent pas de code.
//
// Le profil matériel des défauts de câblage vit dans Recovery.h, qui les possédait déjà.

// Durée d'un éclat d'activité. Assez long pour être perçu, assez court pour que deux commandes
// rapprochées restent distinguables.
#define LED_BLINK_MS 80
// Intervalle minimal entre deux éclats. La réception RF se déclenche pour TOUTE trame RTS à portée,
// y compris les télécommandes du voisinage : sans ce plancher, la LED serait allumée en continu
// dans un environnement dense, ce qui n'informe plus de rien.
#define LED_BLINK_MIN_INTERVAL 150

class StatusLed {
  public:
    // Résout la broche et la polarité (constantes du profil pour les boîtiers, NVS pour les cartes
    // génériques) puis prend la main sur la sortie.
    void begin();
    void loop();
    // Réapplique un réglage modifié à chaud, en relâchant proprement l'ancienne broche. Évite
    // d'imposer un redémarrage après un changement dans l'interface.
    void reconfigure();
    // Éclat d'activité. Sans effet si aucune broche n'est configurée : les appelants n'ont donc
    // aucun test à faire de leur côté.
    void blink();
    bool isEnabled() { return this->_pin >= 0; }
  private:
    int8_t _pin = -1;
    bool _activeLow = false;
    bool _on = false;
    uint32_t _offAt = 0;
    uint32_t _lastBlink = 0;
    void _resolve();
    void _write(bool on);
};

extern StatusLed statusLed;

#endif
