// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <Arduino.h>
#include "ConfigSettings.h"
#include "Recovery.h"   // LED_PROFILE_*, LED_ADDRESSABLE_LEVEL, ledPixelWrite(), recovery
#include "somfy/Somfy.h"      // somfyPinInUse()
#include "StatusLed.h"

extern ConfigSettings settings;

StatusLed statusLed;

// Convertit un "#rrggbb" en composantes ramenées à l'échelle du témoin. Le facteur est LINÉAIRE
// (x * LED_ADDRESSABLE_LEVEL / 255) : la teinte est conservée, l'intensité relative aussi -- un
// rouge sombre reste sombre -- et la pleine échelle, qui éblouit de près, reste hors d'atteinte.
// Une chaîne invalide donne du noir plutôt qu'une couleur de repli : le neutre, et non une surprise
// lumineuse pour une valeur qu'on n'a pas su lire.
static void parseLedColor(const char *hex, uint8_t out[3]) {
  out[0] = out[1] = out[2] = 0;
  if(!hex) return;
  if(*hex == '#') hex++;
  if(strlen(hex) != 6) return;
  for(uint8_t i = 0; i < 6; i++)
    if(!isxdigit((unsigned char)hex[i])) return;
  char buf[3] = {0, 0, 0};
  for(uint8_t i = 0; i < 3; i++) {
    buf[0] = hex[i * 2];
    buf[1] = hex[i * 2 + 1];
    out[i] = (uint8_t)((strtoul(buf, nullptr, 16) * LED_ADDRESSABLE_LEVEL) / 255);
  }
}

void StatusLed::_resolve() {
  #if LED_PROFILE_FIXED
  // Boîtiers : le câblage fait autorité, les réglages sont ignorés (et masqués dans l'interface).
  // Leur LED est une simple sortie à niveau -- aucun boîtier n'embarque de LED adressable.
  this->_pin = LED_PROFILE_PIN;
  this->_activeLow = LED_PROFILE_ACTIVE_LOW;
  this->_addressable = false;
  // Posées quand même, bien qu'aucun chemin ne les lise sans LED adressable : un membre laissé
  // dans un état qui dépend de la branche prise est une invitation au prochain bug.
  this->_colorIdle[0] = this->_colorIdle[1] = this->_colorIdle[2] = 0;
  this->_colorActivity[0] = this->_colorActivity[1] = this->_colorActivity[2] = LED_ADDRESSABLE_LEVEL;
  #else
  this->_pin = settings.ledPin;
  this->_activeLow = settings.ledActiveLow;
  this->_addressable = settings.ledAddressable;
  parseLedColor(settings.ledColorIdle, this->_colorIdle);
  parseLedColor(settings.ledColorActivity, this->_colorActivity);
  // Filet en plus du refus à l'enregistrement (WebNetwork::handleSetGeneral) : une valeur peut
  // précéder cette validation, venir d'une sauvegarde restaurée, ou entrer en collision avec une
  // broche radio reconfigurée depuis. Piloter une sortie de la radio la casserait silencieusement.
  const char *owner = nullptr;
  if(somfyPinInUse(this->_pin, &owner)) {
    Serial.printf("Status LED disabled: GPIO%d already used by %s\n", this->_pin, owner ? owner : "?");
    this->_pin = -1;
  }
  #endif
}
void StatusLed::_write(bool on) {
  if(this->_pin < 0) return;
  if(this->_addressable) {
    // Deux couleurs réglables, et « éteint » n'est qu'un cas particulier de la couleur de repos
    // (#000000, le défaut). L'écriture passe par ledPixelWrite (Recovery.h), qui absorbe l'écart de
    // nom entre les deux cores du projet.
    //
    // L'ordre des octets cesse d'être sans objet dès qu'on sort du blanc : les deux cores écrivent
    // en GRB (défaut WS2812B, non redéfini par la variante du C6), ce qui couvre l'immense majorité
    // des pixels. Sur une carte câblée en RGB, le rouge et le vert apparaîtront échangés -- sans
    // conséquence ici, puisque l'utilisateur choisit la couleur en la voyant et prendra celle qui
    // rend ce qu'il veut. Le firmware n'a aucun moyen de deviner l'ordre réel.
    const uint8_t *c = on ? this->_colorActivity : this->_colorIdle;
    ledPixelWrite((uint8_t)this->_pin, c[0], c[1], c[2]);
  }
  else digitalWrite(this->_pin, (on != this->_activeLow) ? HIGH : LOW);
  this->_on = on;
}
void StatusLed::begin() {
  this->_resolve();
  if(this->_pin < 0) return;
  // Une LED adressable n'est pas une sortie à niveau : l'écriture du pixel prend elle-même la main
  // sur la broche via le périphérique RMT, un pinMode(OUTPUT) préalable n'aurait aucun objet.
  if(!this->_addressable) pinMode(this->_pin, OUTPUT);
  // Rien n'est écrit pendant la fenêtre de détection : Recovery y pilote la même broche, et poser
  // la couleur de repos ici la lui arracherait. loop() la posera à la fermeture de la fenêtre.
  if(!recovery.isDetecting()) {
    this->_idleAsserted = true;
    this->_write(false);
  }
  Serial.printf("Status LED on GPIO%d (%s)\n", this->_pin,
    this->_addressable ? "addressable" : (this->_activeLow ? "active low" : "active high"));
}
void StatusLed::reconfigure() {
  // L'ancienne polarité et l'ancien type sont capturés AVANT _resolve(), qui les écrase : relâcher
  // la broche demande de savoir comment elle était pilotée, pas comment la nouvelle le sera.
  int8_t oldPin = this->_pin;
  bool oldActiveLow = this->_activeLow;
  bool oldAddressable = this->_addressable;
  this->_resolve();
  // La broche OU son type a changé : on rend l'ancienne à un état neutre, sinon elle resterait
  // figée au dernier niveau écrit -- ce qui, sur une sortie pilotant autre chose, ne serait pas
  // anodin, et sur une LED adressable laisserait le témoin allumé pour de bon.
  if(oldPin >= 0 && (oldPin != this->_pin || oldAddressable != this->_addressable)) {
    if(oldAddressable) ledPixelWrite((uint8_t)oldPin, 0, 0, 0);
    else digitalWrite(oldPin, oldActiveLow ? HIGH : LOW);
    pinMode(oldPin, INPUT);
  }
  this->_on = false;
  this->_offAt = 0;
  if(this->_pin >= 0) {
    if(!this->_addressable) pinMode(this->_pin, OUTPUT);
    // Un changement de réglage arrive par l'interface, donc bien après la fenêtre de détection :
    // la couleur de repos est posée séance tenante, c'est le retour visuel qui confirme le choix.
    this->_idleAsserted = true;
    this->_write(false);
  }
}
void StatusLed::blink() {
  if(this->_pin < 0) return;
  uint32_t now = millis();
  // Anti-saturation : la demande est ignorée, pas mise en file. Une LED est un signe de vie, pas un
  // canal d'information -- accumuler les éclats en retard ferait clignoter le témoin longtemps après
  // la fin de l'activité.
  if(this->_on && (uint32_t)(now - this->_lastBlink) < LED_BLINK_MIN_INTERVAL) return;
  this->_lastBlink = now;
  this->_offAt = now + LED_BLINK_MS;
  this->_write(true);
}
void StatusLed::loop() {
  if(this->_pin < 0) return;
  // Reprise du témoin au terme de la fenêtre de détection. Recovery le laisse ÉTEINT en refermant,
  // ce qui tombe juste quand la couleur de repos est « éteint » -- le défaut -- mais pas sinon. Une
  // seule écriture, pas une par tour de boucle : sur un pixel chacune est une trame RMT.
  if(!this->_idleAsserted && !recovery.isDetecting()) {
    this->_idleAsserted = true;
    if(!this->_on) this->_write(false);
  }
  if(!this->_on) return;
  if((int32_t)(millis() - this->_offAt) >= 0) this->_write(false);
}
