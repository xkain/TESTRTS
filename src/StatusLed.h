// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef STATUSLED_H
#define STATUSLED_H

#include <Arduino.h>

// Témoin lumineux du fonctionnement nominal. Distinct du pilotage LED de Recovery, dont l'autonomie
// totale (ni ConfigSettings, ni filesystem, ni réseau) est ce qui le rend fiable quand tout le reste
// est cassé : les deux lisent les mêmes clés NVS sans partager de code. Le profil de câblage vit
// dans Recovery.h.

// Durée d'un éclat. Assez long pour être perçu, assez court pour distinguer deux commandes
// rapprochées.
#define LED_BLINK_MS 80
// Plancher entre deux éclats, qui empêche la LED de rester allumée en continu dans un environnement
// RF dense (la réception se déclenche pour TOUTE trame à portée, voisinage compris). Ne mord qu'avant
// l'extinction : une fois celle-ci faite par loop(), LED_BLINK_MS est le plancher réel.
#define LED_BLINK_MIN_INTERVAL 150

class StatusLed {
  public:
    // Résout broche et polarité (profil pour les boîtiers, NVS pour les cartes génériques) puis
    // prend la main sur la sortie.
    void begin();
    void loop();
    // Réapplique un réglage modifié à chaud en relâchant proprement l'ancienne broche : pas de
    // redémarrage à imposer après un changement dans l'interface.
    void reconfigure();
    // Éclat d'activité. Sans effet si aucune broche n'est configurée -- rien à tester côté appelant.
    void blink();
    bool isEnabled() { return this->_pin >= 0; }
    // Lue par la validation d'affectation radio : sans elle la radio pouvait s'approprier la broche
    // du témoin, alors que l'inverse était déjà refusé (cf. WebNetwork.cpp).
    int8_t pin() const { return this->_pin; }
  private:
    int8_t _pin = -1;
    bool _activeLow = false;
    bool _addressable = false;
    bool _on = false;
    // Couleurs déjà ramenées à l'échelle du témoin, posées une fois par _resolve() : le chemin
    // d'écriture ne doit pas analyser une chaîne hexadécimale à chaque éclat.
    // Initialisées à zéro et non à l'échelle du témoin : cette valeur vit dans Recovery.h, et
    // inclure cet en-tête ICI ferait entrer WebServer.h et DNSServer.h dans chaque unité de
    // compilation qui inclut StatusLed.h. _resolve() pose les deux couleurs dans tous les cas.
    uint8_t _colorIdle[3] = {0, 0, 0};
    uint8_t _colorActivity[3] = {0, 0, 0};
    // La couleur de repos a-t-elle été posée depuis la fermeture de la fenêtre de détection ?
    // Recovery laisse le témoin ÉTEINT en refermant : si la couleur de repos est autre chose, il
    // faut la poser -- une fois, et pas à chaque tour de boucle.
    bool _idleAsserted = false;
    uint32_t _offAt = 0;
    uint32_t _lastBlink = 0;
    void _resolve();
    void _write(bool on);
};

extern StatusLed statusLed;

#endif
