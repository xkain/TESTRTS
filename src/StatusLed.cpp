// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <Arduino.h>
#include "ConfigSettings.h"
#include "Recovery.h"   // constantes LED_PROFILE_* du profil matériel
#include "somfy/Somfy.h"      // somfyPinInUse()
#include "StatusLed.h"

extern ConfigSettings settings;

StatusLed statusLed;

void StatusLed::_resolve() {
  #if LED_PROFILE_FIXED
  // Boîtiers : le câblage fait autorité, les réglages sont ignorés (et masqués dans l'interface).
  // Leur LED est une simple sortie à niveau -- aucun boîtier n'embarque de LED adressable.
  this->_pin = LED_PROFILE_PIN;
  this->_activeLow = LED_PROFILE_ACTIVE_LOW;
  this->_addressable = false;
  #else
  this->_pin = settings.ledPin;
  this->_activeLow = settings.ledActiveLow;
  this->_addressable = settings.ledAddressable;
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
    // Blanc et non une couleur : aucune information de teinte ici, et l'égalité des composantes
    // rend l'ordre des octets sans objet (cf. LED_ADDRESSABLE_LEVEL). L'écriture passe par
    // ledPixelWrite (Recovery.h), qui absorbe l'écart de nom entre les deux cores du projet.
    const uint8_t v = on ? LED_ADDRESSABLE_LEVEL : 0;
    ledPixelWrite((uint8_t)this->_pin, v, v, v);
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
  this->_write(false);
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
  if(this->_pin < 0 || !this->_on) return;
  if((int32_t)(millis() - this->_offAt) >= 0) this->_write(false);
}
