#include <Arduino.h>
#include "Somfy.h"

// Pilotage GPIO direct des équipements câblés en relais (radio_proto::GP_Relay, deux boutons Up/Down)
// ou en "faux télécommande" (GP_Remote, trois boutons Up/Down/My) -- une alternative filaire au
// RTS pour des moteurs qui n'ont pas de récepteur radio. setGPIOs() maintient l'état des broches
// en continu (rappelée depuis checkMovement()), triggerGPIOs() réagit à une commande ponctuelle.
// somfyPinInUse() centralise la vérification anti-collision de broche (radio + tous les équipements
// GPIO), utilisée par la validation de config des équipements et par StatusLed.

extern SomfyShadeController somfy;
extern ConfigSettings settings;

void SomfyShade::setGPIOs() {
  if(this->proto == radio_proto::GP_Relay) {
    // Determine whether the direction needs to be set.
    uint8_t p_on = (this->gpioFlags & (uint8_t)gpio_flags_t::LowLevelTrigger) == 0x00 ? HIGH : LOW;
    uint8_t p_off = (this->gpioFlags & (uint8_t)gpio_flags_t::LowLevelTrigger) == 0x00 ? LOW : HIGH;

    int8_t dir = this->direction;
    if(dir == 0 && this->tiltType == tilt_types::integrated)
      dir = this->tiltDirection;
    else if(this->tiltType == tilt_types::tiltonly)
      dir = this->tiltDirection;
    if(this->shadeType == shade_types::drycontact) {
      digitalWrite(this->gpioDown, this->currentPos == 100 ? p_on : p_off);
      this->gpioDir = this->currentPos == 100 ? 1 : -1;
    }
    else if(this->shadeType == shade_types::drycontact2) {
      if(this->currentPos == 100) {
        digitalWrite(this->gpioDown, p_off);
        digitalWrite(this->gpioUp, p_on);
      }
      else {
        digitalWrite(this->gpioUp, p_off);
        digitalWrite(this->gpioDown, p_on);
      }
      this->gpioDir = this->currentPos == 100 ? 1 : -1;
    }
    else {
      switch(dir) {
        case -1:
          digitalWrite(this->gpioDown, p_off);
          digitalWrite(this->gpioUp, p_on);
          if(dir != this->gpioDir) DBG_PRINTF("UP: true, DOWN: false\n");
          this->gpioDir = dir;
          break;
        case 1:
          digitalWrite(this->gpioUp, p_off);
          digitalWrite(this->gpioDown, p_on);
          if(dir != this->gpioDir) DBG_PRINTF("UP: false, DOWN: true\n");
          this->gpioDir = dir;
          break;
        default:
          digitalWrite(this->gpioUp, p_off);
          digitalWrite(this->gpioDown, p_off);
          if(dir != this->gpioDir) DBG_PRINTF("UP: false, DOWN: false\n");
          this->gpioDir = dir;
          break;
      }
    }
  }
  else if(this->proto == radio_proto::GP_Remote) {
    if((int32_t)(millis() - this->gpioRelease) >= 0) {
      //uint8_t p_on = (this->gpioFlags & (uint8_t)gpio_flags_t::LowLevelTrigger) == 0x00 ? HIGH : LOW;
      uint8_t p_off = (this->gpioFlags & (uint8_t)gpio_flags_t::LowLevelTrigger) == 0x00 ? LOW : HIGH;
      digitalWrite(this->gpioUp, p_off);
      digitalWrite(this->gpioDown, p_off);
      digitalWrite(this->gpioMy, p_off);
      this->gpioRelease = 0;
    }
  }
}
void SomfyRemote::triggerGPIOs(somfy_frame_t &frame) { }
void SomfyShade::triggerGPIOs(somfy_frame_t &frame) {
  if(this->proto == radio_proto::GP_Remote) {
    uint8_t p_on = (this->gpioFlags & (uint8_t)gpio_flags_t::LowLevelTrigger) == 0x00 ? HIGH : LOW;
    uint8_t p_off = (this->gpioFlags & (uint8_t)gpio_flags_t::LowLevelTrigger) == 0x00 ? LOW : HIGH;
    int8_t dir = 0;
    switch(frame.cmd) {
      case somfy_commands::My:
        if(this->shadeType != shade_types::drycontact && !this->isToggle()) {
          digitalWrite(this->gpioUp, p_off);
          digitalWrite(this->gpioDown, p_off);
          digitalWrite(this->gpioMy, p_on);
          dir = 0;
          if(dir != this->gpioDir) DBG_PRINTF("UP: false, DOWN: false, MY: true\n");
        }
        break;
      case somfy_commands::Up:
        if(this->shadeType != shade_types::drycontact && !this->isToggle() && this->shadeType != shade_types::drycontact2) {
          digitalWrite(this->gpioMy, p_off);
          digitalWrite(this->gpioDown, p_off);
          digitalWrite(this->gpioUp, p_on);
          dir = -1;
          DBG_PRINTF("UP: true, DOWN: false, MY: false\n");
        }
        break;
      case somfy_commands::Toggle:
      case somfy_commands::Down:
        if(this->shadeType != shade_types::drycontact && !this->isToggle() && this->shadeType != shade_types::drycontact2) {
          digitalWrite(this->gpioMy, p_off);
          digitalWrite(this->gpioUp, p_off);
        }
        digitalWrite(this->gpioDown, p_on);
        dir = 1;
        DBG_PRINTF("UP: false, DOWN: true, MY: false\n");
        break;
      case somfy_commands::MyUp:
        if(this->shadeType != shade_types::drycontact && !this->isToggle() && this->shadeType != shade_types::drycontact2) {
          digitalWrite(this->gpioDown, p_off);
          digitalWrite(this->gpioMy, p_on);
          digitalWrite(this->gpioUp, p_on);
          DBG_PRINTF("UP: true, DOWN: false, MY: true\n");
        }
        break;
      case somfy_commands::MyDown:
        if(this->shadeType != shade_types::drycontact && !this->isToggle() && this->shadeType != shade_types::drycontact2) {
          digitalWrite(this->gpioUp, p_off);
          digitalWrite(this->gpioMy, p_on);
          digitalWrite(this->gpioDown, p_on);
          DBG_PRINTF("UP: false, DOWN: true, MY: true\n");
        }
        break;
      case somfy_commands::MyUpDown:
        if(this->shadeType != shade_types::drycontact && this->isToggle() && this->shadeType != shade_types::drycontact2) {
          digitalWrite(this->gpioUp, p_on);
          digitalWrite(this->gpioMy, p_on);
          digitalWrite(this->gpioDown, p_on);
          DBG_PRINTF("UP: true, DOWN: true, MY: true\n");
        }
        break;
      default:
        break;
    }
    this->gpioRelease = millis() + (frame.repeats * 200);
    this->gpioDir = dir;
  }
}
bool somfyPinInUse(int8_t pin, const char **owner, bool includeRadio) {
  if(pin < 0) return false;
  // Broches de la radio : elles sont configurées même quand le transceiver est désactivé, et les
  // écraser casserait l'émission sans qu'aucun message ne le signale.
  if(includeRadio) {
    const transceiver_config_t &cfg = somfy.transceiver.config;
    if(pin == (int8_t)cfg.SCKPin)  { if(owner) *owner = "SCK";  return true; }
    if(pin == (int8_t)cfg.CSNPin)  { if(owner) *owner = "CSN";  return true; }
    if(pin == (int8_t)cfg.MOSIPin) { if(owner) *owner = "MOSI"; return true; }
    if(pin == (int8_t)cfg.MISOPin) { if(owner) *owner = "MISO"; return true; }
    if(pin == (int8_t)cfg.TXPin)   { if(owner) *owner = "TX";   return true; }
    if(pin == (int8_t)cfg.RXPin)   { if(owner) *owner = "RX";   return true; }
  }
  // Relais d'équipements : seuls les équipements pilotés en direct (GPIO) réservent réellement des broches ;
  // pour les autres, gpioUp/Down/My gardent une valeur par défaut jamais appliquée en sortie.
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    SomfyShade *shade = &somfy.shades[i];
    if(shade->getShadeId() == 255) continue;
    if(shade->proto != radio_proto::GP_Relay && shade->proto != radio_proto::GP_Remote) continue;
    if(pin == (int8_t)shade->gpioUp || pin == (int8_t)shade->gpioDown || pin == (int8_t)shade->gpioMy) {
      if(owner) *owner = shade->name;
      return true;
    }
  }
  return false;
}
