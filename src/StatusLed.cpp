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
  this->_pin = LED_PROFILE_PIN;
  this->_activeLow = LED_PROFILE_ACTIVE_LOW;
  #else
  this->_pin = settings.ledPin;
  this->_activeLow = settings.ledActiveLow;
  // Filet de sécurité en plus du refus à l'enregistrement (Web::validateLedPin) : une valeur peut
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
  digitalWrite(this->_pin, (on != this->_activeLow) ? HIGH : LOW);
  this->_on = on;
}
void StatusLed::begin() {
  this->_resolve();
  if(this->_pin < 0) return;
  pinMode(this->_pin, OUTPUT);
  this->_write(false);
  Serial.printf("Status LED on GPIO%d (active %s)\n", this->_pin, this->_activeLow ? "low" : "high");
}
void StatusLed::reconfigure() {
  int8_t oldPin = this->_pin;
  this->_resolve();
  // La broche a changé : on rend l'ancienne à un état neutre, sinon elle resterait figée au dernier
  // niveau écrit -- ce qui, sur une sortie pilotant autre chose, ne serait pas anodin.
  if(oldPin >= 0 && oldPin != this->_pin) {
    digitalWrite(oldPin, this->_activeLow ? HIGH : LOW);
    pinMode(oldPin, INPUT);
  }
  this->_on = false;
  this->_offAt = 0;
  if(this->_pin >= 0) {
    pinMode(this->_pin, OUTPUT);
    this->_write(false);
  }
}
void StatusLed::blink() {
  if(this->_pin < 0) return;
  uint32_t now = millis();
  // Anti-saturation : on ignore la demande plutôt que de la mettre en file. Une LED n'est pas un
  // canal d'information, seulement un signe de vie -- accumuler les éclats en retard donnerait un
  // témoin qui continue de clignoter longtemps après la fin de l'activité.
  if(this->_on && (uint32_t)(now - this->_lastBlink) < LED_BLINK_MIN_INTERVAL) return;
  this->_lastBlink = now;
  this->_offAt = now + LED_BLINK_MS;
  this->_write(true);
}
void StatusLed::loop() {
  if(this->_pin < 0 || !this->_on) return;
  if((int32_t)(millis() - this->_offAt) >= 0) this->_write(false);
}
