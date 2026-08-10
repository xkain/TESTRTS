#include <Arduino.h>
#include "ConfigSettings.h"
#include "Somfy.h"

// Traduit une trame radio (processFrame, déclenchée par une réception RF ou un renvoi interne
// via processInternalCommand) ou une commande logicielle (processInternalCommand, déclenchée par
// le web/planning/MQTT) en cibles de mouvement (target/tiltTarget) puis délègue à setMovement()
// -- SomfyPositioning.cpp prend le relais pour l'exécution effective. processWaitingFrame() gère
// les cas où il faut attendre un délai (ex. distinguer un appui court "My" d'un appui long avant
// de savoir si c'est un enregistrement de position favorite) avant de trancher.
// Extrait de Somfy.cpp : c'est la couche qui décide QUOI faire d'une commande, séparée du QUAND/
// COMMENT déplacer le volet (SomfyPositioning.cpp).

extern SomfyShadeController somfy;
extern ConfigSettings settings;

void SomfyShade::processWaitingFrame() {
  if(this->shadeId == 255) {
    this->lastFrame.await = 0;
    return;
  }
  if(this->lastFrame.processed) return;
  if(this->lastFrame.await > 0 && (int32_t)(millis() - this->lastFrame.await) >= 0) {
    somfy_commands cmd = this->transformCommand(this->lastFrame.cmd);
    switch(cmd) {
      case somfy_commands::StepUp:
          this->lastFrame.processed = true;
          // Simply move the shade up by 1%.
          if(this->currentPos > 0) {
            this->p_target(floor(this->currentPos) - 1);
            this->setMovement(-1);
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          break;
      case somfy_commands::StepDown:
          this->lastFrame.processed = true;
          // Simply move the shade down by 1%.
          if(this->currentPos < 100) {
            this->p_target(floor(this->currentPos) + 1);
            this->setMovement(1);
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          break;
      case somfy_commands::Down:
      case somfy_commands::Up:
        if(this->tiltType == tilt_types::tiltmotor) { // Theoretically this should get here unless it does have a tilt motor.
          if(this->lastFrame.repeats >= TILT_REPEATS) {
            int8_t dir = this->lastFrame.cmd == somfy_commands::Up ? -1 : 1;
            this->p_tiltTarget(dir > 0 ? 100.0f : 0.0f);
            this->setTiltMovement(dir);
            this->lastFrame.processed = true;
            DBG_PRINT(this->name);
            DBG_PRINT(" Processing tilt ");
            DBG_PRINT(translateSomfyCommand(this->lastFrame.cmd));
            DBG_PRINT(" after ");
            DBG_PRINT(this->lastFrame.repeats);
            DBG_PRINTLN(" repeats");
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          else {
            int8_t dir = this->lastFrame.cmd == somfy_commands::Up ? -1 : 1;
            this->p_target(dir > 0 ? 100 : 0);
            this->setMovement(dir);
            this->lastFrame.processed = true;
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          if(this->lastFrame.repeats > TILT_REPEATS + 2) {
            this->lastFrame.processed = true;
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
        }
        else if(this->tiltType == tilt_types::euromode) {
          if(this->lastFrame.repeats >= TILT_REPEATS) {
            int8_t dir = this->lastFrame.cmd == somfy_commands::Up ? -1 : 1;
            this->p_target(dir > 0 ? 100.0f : 0.0f);
            this->setMovement(dir);
            this->lastFrame.processed = true;
            DBG_PRINT(this->name);
            DBG_PRINT(" Processing ");
            DBG_PRINT(translateSomfyCommand(this->lastFrame.cmd));
            DBG_PRINT(" after ");
            DBG_PRINT(this->lastFrame.repeats);
            DBG_PRINTLN(" repeats");
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          else {
            int8_t dir = this->lastFrame.cmd == somfy_commands::Up ? -1 : 1;
            this->p_tiltTarget(dir > 0 ? 100 : 0);
            this->setTiltMovement(dir);
            this->lastFrame.processed = true;
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
          if(this->lastFrame.repeats > TILT_REPEATS + 2) {
            this->lastFrame.processed = true;
            this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
          }
        }
        break;
      case somfy_commands::My:
        if(this->lastFrame.repeats >= SETMY_REPEATS && this->isIdle()) {
          if(floor(this->myPos) == floor(this->currentPos)) {
            // We are clearing it.
            this->p_myPos(-1);
            this->p_myTiltPos(-1);
          }
          else {
            this->p_myPos(this->currentPos);
            this->p_myTiltPos(this->currentTiltPos);
          }
          this->commitMyPosition();
          this->lastFrame.processed = true;
          this->emitState();
        }
        else if(this->isIdle()) {
          if(this->simMy())
            this->moveToMyPosition(); // Call out like this (instead of move to target) so that we don't get some of the goofy tilt only problems.
          else {
            if(this->myPos >= 0.0f && this->myPos <= 100.0f) this->p_target(this->myPos);
            if(this->myTiltPos >= 0.0f && this->myTiltPos <= 100.0f) this->p_tiltTarget(this->myTiltPos);
          }
          this->setMovement(0);
          this->lastFrame.processed = true;
          this->emitCommand(cmd, "remote", this->lastFrame.remoteAddress);
        }
        else {
          this->p_target(this->currentPos);
          this->p_tiltTarget(this->currentTiltPos);
        }
        if(this->lastFrame.repeats > SETMY_REPEATS + 2) this->lastFrame.processed = true;
        if(this->lastFrame.processed) {
          DBG_PRINT(this->name);
          DBG_PRINT(" Processing MY after ");
          DBG_PRINT(this->lastFrame.repeats);
          DBG_PRINTLN(" repeats");
        }
        break;
      default:
        break;
    }
  }
}
void SomfyShade::processFrame(somfy_frame_t &frame, bool internal) {
  // The reason why we are processing all frames here is so
  // any linked remotes that may happen to be on the same ESPSomfy RTS
  // device can trigger the appropriate actions.
  if(this->shadeId == 255) return;
  bool hasRemote = this->getRemoteAddress() == frame.remoteAddress;
  if(!hasRemote) {
    for(uint8_t i = 0; i < SOMFY_MAX_LINKED_REMOTES; i++) {
      if(this->linkedRemotes[i].getRemoteAddress() == frame.remoteAddress) {
        if(frame.cmd != somfy_commands::Sensor) this->linkedRemotes[i].setRollingCode(frame.rollingCode);
        // Diagnostic RSSI "live", RAM uniquement (cf. SomfyLinkedRemote::lastRssi) : rafraîchi à
        // chaque trame valide de cette télécommande, pas seulement lors de la liaison initiale.
        this->linkedRemotes[i].lastRssi = (int8_t)frame.rssi;
        hasRemote = true;
        break;
      }
    }
  }
  if(!hasRemote) return;
  const uint32_t curTime = millis();
  this->lastFrame.copy(frame);
  int8_t dir = 0;
  this->moveStart = this->tiltStart = curTime;
  this->startPos = this->currentPos;
  this->startTiltPos = this->currentTiltPos;
  // If the command is coming from a remote then we are aborting all these positioning operations.
  if(!internal) this->settingMyPos = this->settingPos = this->settingTiltPos = false;
  somfy_commands cmd = this->transformCommand(frame.cmd);
  // At this point we are not processing the combo buttons
  // will need to see what the shade does when you press both.
  switch(cmd) {
    case somfy_commands::Sensor:
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      {
        const uint8_t prevFlags = this->flags;
        const bool wasSunny = prevFlags & static_cast<uint8_t>(somfy_flags_t::Sunny);
        const bool wasWindy = prevFlags & static_cast<uint8_t>(somfy_flags_t::Windy);
        const uint16_t status = frame.rollingCode << 4;
        if (status & static_cast<uint8_t>(somfy_flags_t::Sunny))
          this->p_sunny(true);
          //this->flags |= static_cast<uint8_t>(somfy_flags_t::Sunny);
        else
          this->p_sunny(false);
          //this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::Sunny));
        if (status & static_cast<uint8_t>(somfy_flags_t::Windy))
          this->p_windy(true);
          //this->flags |= static_cast<uint8_t>(somfy_flags_t::Windy);
        else
          this->p_windy(false);
          //this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::Windy));
        if(frame.rollingCode & static_cast<uint8_t>(somfy_flags_t::DemoMode))
          this->flags |= static_cast<uint8_t>(somfy_flags_t::DemoMode);
        else
          this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::DemoMode));
        const bool isSunny = this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny);
        const bool isWindy = this->flags & static_cast<uint8_t>(somfy_flags_t::Windy);
        if (isSunny)
        {
          this->noSunStart = 0;
          this->noSunDone = true;
        }
        else
        {
          this->sunStart = 0;
          this->sunDone = true;
        }
        if (isWindy)
        {
          this->noWindStart = 0;
          this->noWindDone = true;
          this->windLast = curTime;
        }
        else
        {
          this->windStart = 0;
          this->windDone = true;
        }
        if (isSunny && !wasSunny)
        {
          this->sunStart = curTime;
          this->sunDone = false;
          DBG_PRINTF("[%u] Sun -> start\r\n", this->shadeId);
        }
        else if (!isSunny && wasSunny)
        {
          this->noSunStart = curTime;
          this->noSunDone = false;
          DBG_PRINTF("[%u] No Sun -> start\r\n", this->shadeId);
        }
        if (isWindy && !wasWindy)
        {
          this->windStart = curTime;
          this->windDone = false;
          DBG_PRINTF("[%u] Wind -> start\r\n", this->shadeId);
        }
        else if (!isWindy && wasWindy)
        {
          this->noWindStart = curTime;
          this->noWindDone = false;
          DBG_PRINTF("[%u] No Wind -> start\r\n", this->shadeId);
        }
        this->emitState();
        somfy.updateGroupFlags();
      }
      break;
    case somfy_commands::Prog:
    case somfy_commands::MyUp:
    case somfy_commands::MyDown:
    case somfy_commands::MyUpDown:
    case somfy_commands::UpDown:
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;

    case somfy_commands::Flag:
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      if(this->lastFrame.rollingCode & 0x8000) return; // Some sensors send bogus frames with a rollingCode >= 32768 that cause them to change the state.
      this->p_sunFlag(false);
      //this->flags &= ~(static_cast<uint8_t>(somfy_flags_t::SunFlag));
      somfy.isDirty = true;
      this->emitState();
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      somfy.updateGroupFlags();
      break;
    case somfy_commands::SunFlag:
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      if(this->lastFrame.rollingCode & 0x8000) return; // Some sensors send bogus frames with a rollingCode >= 32768 that cause them to change the state.
      {
        const bool isWindy = this->flags & static_cast<uint8_t>(somfy_flags_t::Windy);
        //this->flags |= static_cast<uint8_t>(somfy_flags_t::SunFlag);
        this->p_sunFlag(true);
        if (!isWindy)
        {
          const bool isSunny = this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny);
          if (isSunny && this->sunDone) {
            if(this->tiltType == tilt_types::tiltonly)
              this->p_tiltTarget(this->myTiltPos >= 0 ? this->myTiltPos : 100.0f);
            else
              this->p_target(this->myPos >= 0 ? this->myPos : 100.0f);
          }
          else if (!isSunny && this->noSunDone) {
            if(this->tiltType == tilt_types::tiltonly)
              this->p_tiltTarget(0.0f);
            else
              this->p_target(0.0f);
          }
        }
        somfy.isDirty = true;
        this->emitState();
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        somfy.updateGroupFlags();
      }
      break;
    case somfy_commands::Up:
      if(this->shadeType == shade_types::drycontact) {
        this->lastFrame.processed = true;
        return;
      }
      else if(this->shadeType == shade_types::drycontact2) {
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(this->currentPos != 0.0f) this->p_target(0);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        return;
      }
      if(this->tiltType == tilt_types::tiltmotor || this->tiltType == tilt_types::euromode) {
        // Wait another half second just in case we are potentially processing a tilt.
        if(!internal) this->lastFrame.await = curTime + 500;
        else this->lastFrame.processed = true;
      }
      else {
        // If from a remote we will simply be going up.
        if(this->tiltType == tilt_types::tiltonly && !internal) this->p_tiltTarget(0.0f);
        else if(!internal) {
          if(this->tiltType != tilt_types::tiltonly) this->p_target(0.0f);
          this->p_tiltTarget(0.0f);
        }
        this->lastFrame.processed = true;
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      }
      break;
    case somfy_commands::Down:
      if(this->shadeType == shade_types::drycontact) {
        this->lastFrame.processed = true;
        return;
      }
      else if(this->shadeType == shade_types::drycontact2) {
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(this->currentPos != 100.0f) this->p_target(100);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        return;
      }
      if (!this->windLast || (curTime - this->windLast) >= SOMFY_NO_WIND_REMOTE_TIMEOUT) {
        if(this->tiltType == tilt_types::tiltmotor || this->tiltType == tilt_types::euromode) {
          // Wait another half seccond just in case we are potentially processing a tilt.
          if(!internal) this->lastFrame.await = curTime + 500;
          else this->lastFrame.processed = true;
        }
        else {
          this->lastFrame.processed = true;
          if(!internal) {
            if(this->tiltType != tilt_types::tiltonly) this->p_target(100.0f);
            if(this->tiltType != tilt_types::none) this->p_tiltTarget(100.0f);
          }
        }
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      }
      break;
    case somfy_commands::My:
      if(this->shadeType == shade_types::drycontact2) return;
      if(this->isToggle()) { // This is a one button device
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(!this->isIdle()) this->p_target(this->currentPos);
        else if(this->currentPos == 100.0f) this->p_target(0.0f);
        else if(this->currentPos == 0.0f) this->p_target(100.0f);
        else this->p_target(this->lastMovement == -1 ? 100 : 0);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        return;
      }
      else if(this->shadeType == shade_types::drycontact) {
        // In this case we need to toggle the contact but we only should do this if
        // this is not a repeat.
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(this->currentPos == 100.0f) this->p_target(0);
        else if(this->currentPos == 0.0f) this->p_target(100);
        else this->p_target(this->lastMovement == -1 ? 100 : 0);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        return;
      }
      if(this->isIdle()) {
        if(!internal) {
          // This frame is coming from a remote. We are potentially setting
          // the my position.
          this->lastFrame.await = curTime + 500;
        }
        else {
          if(this->lastFrame.processed) return;
          DBG_PRINTLN("Moving to My target");
          this->lastFrame.processed = true;
          if(this->myTiltPos >= 0.0f && this->myTiltPos <= 100.0f) this->p_tiltTarget(this->myTiltPos);
          if(this->myPos >= 0.0f && this->myPos <= 100.0f && this->tiltType != tilt_types::tiltonly) this->p_target(this->myPos);
          this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
        }
      }
      else {
        if(this->lastFrame.processed) return;
        this->lastFrame.processed = true;
        if(!internal) {
          if(this->tiltType != tilt_types::tiltonly) this->p_target(this->currentPos);
          this->p_tiltTarget(this->currentTiltPos);
        }
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      }
      break;
    case somfy_commands::StepUp:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      dir = 0;
      // With the step commands and integrated shades
      // the motor must tilt in the direction first then move
      // so we have to calculate the target with this in mind.
      if(this->stepSize == 0) return; // Avoid divide by 0.
      if(this->lastFrame.stepSize == 0) this->lastFrame.stepSize = 1;
      if(this->tiltType == tilt_types::integrated) {
        // With integrated tilt this is more involved than ne would think because the step command can be moving not just the tilt
        // but the lift.  So a determination needs to be made as to whether we are currently moving and it should stop.
        // Conditions:
        // 1. If both the tilt and lift are at 0% do nothing
        // 2. If the tilt position is not currently at the top then shift the tilt.
        // 3. If the tilt position is not currently at the top then shift the lift.
        if(this->currentTiltPos <= 0.0f && this->currentPos <= 0.0f) return; // Do nothing
        else if(this->currentTiltPos > 0.0f) {
          // Set the tilt position.  This should stop the lift movement.
          this->p_target(this->currentPos);
          if(this->tiltTimeUp == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(max(0.0f, this->currentTiltPos - (100.0f/(static_cast<float>(this->tiltTimeUp/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
        }
        else {
          // We only have the lift to move.
          if(this->upTime == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(this->currentTiltPos);
          this->p_target(max(0.0f, this->currentPos - (100.0f/(static_cast<float>(this->upTime/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
        }
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        if(this->tiltTimeUp == 0 || this->stepSize == 0) return;
        this->p_tiltTarget(max(0.0f, this->currentTiltPos - (100.0f/(static_cast<float>(this->tiltTimeUp/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
      }
      else if(this->currentPos > 0.0f) {
        if(this->downTime == 0 || this->stepSize == 0) return;
        this->p_target(max(0.0f, this->currentPos - (100.0f/(static_cast<float>(this->upTime/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
      }
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;
    case somfy_commands::StepDown:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) return;
      dir = 1;
      // With the step commands and integrated shades
      // the motor must tilt in the direction first then move
      // so we have to calculate the target with this in mind.
      if(this->stepSize == 0) return; // Avoid divide by 0.
      if(this->lastFrame.stepSize == 0) this->lastFrame.stepSize = 1;

      if(this->tiltType == tilt_types::integrated) {
        // With integrated tilt this is more involved than ne would think because the step command can be moving not just the tilt
        // but the lift.  So a determination needs to be made as to whether we are currently moving and it should stop.
        // Conditions:
        // 1. If both the tilt and lift are at 100% do nothing
        // 2. If the tilt position is not currently at the bottom then shift the tilt.
        // 3. If the tilt position is add the bottom then shift the lift.
        if(this->currentTiltPos >= 100.0f && this->currentPos >= 100.0f) return; // Do nothing
        else if(this->currentTiltPos < 100.0f) {
          // Set the tilt position.  This should stop the lift movement.
          this->p_target(this->currentPos);
          if(this->tiltTimeDown == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(min(100.0f, this->currentTiltPos + (100.0f/(static_cast<float>(this->tiltTimeDown/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
        }
        else {
          // We only have the lift to move.
          this->p_tiltTarget(this->currentTiltPos);
          if(this->downTime == 0) return; // Avoid divide by 0.
          this->p_target(min(100.0f, this->currentPos + (100.0f/(static_cast<float>(this->downTime/static_cast<float>(this->stepSize* this->lastFrame.stepSize))))));
        }
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        if(this->tiltTimeDown == 0 || this->stepSize == 0) return;
        this->p_target(min(100.0f, this->currentTiltPos + (100.0f/(static_cast<float>(this->tiltTimeDown/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
      }
      else if(this->currentPos < 100.0f) {
        if(this->downTime == 0 || this->stepSize == 0) return;
        this->p_target(min(100.0f, this->currentPos + (100.0f/(static_cast<float>(this->downTime/static_cast<float>(this->stepSize * this->lastFrame.stepSize))))));
      }
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;
    case somfy_commands::Toggle:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      if(!this->isIdle()) this->p_target(this->currentPos);
      else if(this->currentPos == 100.0f) this->p_target(0);
      else if(this->currentPos == 0.0f) this->p_target(100);
      else this->p_target(this->lastMovement == -1 ? 100 : 0);
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;
    case somfy_commands::Stop:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      this->p_target(this->currentPos);
      this->p_tiltTarget(this->currentTiltPos);
      this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      break;
    case somfy_commands::Favorite:
      if(this->lastFrame.processed) return;
      this->lastFrame.processed = true;
      if(this->simMy()) {
        this->moveToMyPosition();
      }
      else {
        if(this->myTiltPos >= 0.0f && this->myTiltPos <= 100.0f) this->p_tiltTarget(this->myTiltPos);
        if(this->myPos >= 0.0f && this->myPos <= 100.0f && this->tiltType != tilt_types::tiltonly) this->p_target(this->myPos);
        this->emitCommand(cmd, internal ? "internal" : "remote", frame.remoteAddress);
      }
      break;
    default:
      dir = 0;
      break;
  }
  //if(dir == 0 && this->tiltType == tilt_types::tiltmotor && this->tiltDirection != 0) this->setTiltMovement(0);
  this->setMovement(dir);
}
void SomfyShade::processInternalCommand(somfy_commands cmd, uint8_t repeat) {
  // The reason why we are processing all frames here is so
  // any linked remotes that may happen to be on the same ESPSomfy RTS
  // device can trigger the appropriate actions.
  if(this->shadeId == 255) return;
  const uint32_t curTime = millis();
  int8_t dir = 0;
  this->moveStart = this->tiltStart = curTime;
  this->startPos = this->currentPos;
  this->startTiltPos = this->currentTiltPos;
  // If the command is coming from a remote then we are aborting all these positioning operations.
  switch(cmd) {
    case somfy_commands::Up:
      if(this->tiltType == tilt_types::tiltmotor) {
        if(repeat >= TILT_REPEATS)
          this->p_tiltTarget(0.0f);
        else
          this->p_target(0.0f);
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        this->p_target(100.0f);
        this->p_currentPos(100.0f);
        this->p_tiltTarget(0.0f);
      }
      else {
        this->p_target(0.0f);
        this->p_tiltTarget(0.0f);
      }
      break;
    case somfy_commands::Down:
      if (!this->windLast || (curTime - this->windLast) >= SOMFY_NO_WIND_REMOTE_TIMEOUT) {
        if(this->tiltType == tilt_types::tiltmotor) {
          if(repeat >= TILT_REPEATS)
            this->p_tiltTarget(100.0f);
          else
            this->p_target(100.0f);
        }
        else if(this->tiltType == tilt_types::tiltonly) {
          this->p_target(100.0f);
          this->p_currentPos(100.0f);
          this->p_tiltTarget(100.0f);
        }
        else {
            this->p_target(100.0f);
            if(this->tiltType != tilt_types::none) this->p_tiltTarget(100.0f);
        }
      }
      break;
    case somfy_commands::My:
      if(this->isIdle()) {
        DBG_PRINTF("Shade #%d is idle\n", this->getShadeId());
        if(this->simMy()) {
          this->moveToMyPosition();
        }
        else {
          if(this->myTiltPos >= 0.0f && this->myTiltPos <= 100.0f) this->p_tiltTarget(this->myTiltPos);
          if(this->myPos >= 0.0f && this->myPos <= 100.0f && this->tiltType != tilt_types::tiltonly) this->p_target(this->myPos);
        }
      }
      else {
        if(this->tiltType == tilt_types::tiltonly) {
          this->p_target(100.0f);
        }
        else this->p_target(this->currentPos);
        this->p_tiltTarget(this->currentTiltPos);
      }
      break;
    case somfy_commands::StepUp:
      // With the step commands and integrated shades
      // the motor must tilt in the direction first then move
      // so we have to calculate the target with this in mind.
      if(this->stepSize == 0) return; // Avoid divide by 0.
      if(this->tiltType == tilt_types::integrated) {
        // With integrated tilt this is more involved than ne would think because the step command can be moving not just the tilt
        // but the lift.  So a determination needs to be made as to whether we are currently moving and it should stop.
        // Conditions:
        // 1. If both the tilt and lift are at 0% do nothing
        // 2. If the tilt position is not currently at the top then shift the tilt.
        // 3. If the tilt position is not currently at the top then shift the lift.
        if(this->currentTiltPos <= 0.0f && this->currentPos <= 0.0f) return; // Do nothing
        else if(this->currentTiltPos > 0.0f) {
          // Set the tilt position.  This should stop the lift movement.
          this->p_target(this->currentPos);
          if(this->tiltTimeUp == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(max(0.0f, this->currentTiltPos - (100.0f/(static_cast<float>(this->tiltTimeUp/static_cast<float>(this->stepSize))))));
        }
        else {
          // We only have the lift to move.
          if(this->upTime == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(this->currentTiltPos);
          this->p_target(max(0.0f, this->currentPos - (100.0f/(static_cast<float>(this->upTime/static_cast<float>(this->stepSize))))));
        }
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        if(this->tiltTimeUp == 0 || this->currentTiltPos <= 0.0f) return;
        this->p_tiltTarget(max(0.0f, this->currentTiltPos - (100.0f/(static_cast<float>(this->tiltTimeUp/static_cast<float>(this->stepSize))))));
      }
      else if(this->currentPos > 0.0f) {
        if(this->upTime == 0) return;
        this->p_target(max(0.0f, this->currentPos - (100.0f/(static_cast<float>(this->upTime/static_cast<float>(this->stepSize))))));
      }
      break;
    case somfy_commands::StepDown:
      dir = 1;
      // With the step commands and integrated shades
      // the motor must tilt in the direction first then move
      // so we have to calculate the target with this in mind.
      if(this->stepSize == 0) return; // Avoid divide by 0.
      if(this->tiltType == tilt_types::integrated) {
        // With integrated tilt this is more involved than ne would think because the step command can be moving not just the tilt
        // but the lift.  So a determination needs to be made as to whether we are currently moving and it should stop.
        // Conditions:
        // 1. If both the tilt and lift are at 100% do nothing
        // 2. If the tilt position is not currently at the bottom then shift the tilt.
        // 3. If the tilt position is add the bottom then shift the lift.
        if(this->currentTiltPos >= 100.0f && this->currentPos >= 100.0f) return; // Do nothing
        else if(this->currentTiltPos < 100.0f) {
          // Set the tilt position.  This should stop the lift movement.
          this->p_target(this->currentPos);
          if(this->tiltTimeDown == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(min(100.0f, this->currentTiltPos + (100.0f/(static_cast<float>(this->tiltTimeDown/static_cast<float>(this->stepSize))))));
        }
        else {
          // We only have the lift to move.
          if(this->downTime == 0) return; // Avoid divide by 0.
          this->p_tiltTarget(this->currentTiltPos);
          this->p_target(min(100.0f, this->currentPos + (100.0f/(static_cast<float>(this->downTime/static_cast<float>(this->stepSize))))));
        }
      }
      else if(this->tiltType == tilt_types::tiltonly) {
        if(this->tiltTimeDown == 0 || this->stepSize == 0 || this->currentTiltPos >= 100.0f) return;
        this->p_tiltTarget(min(100.0f, this->currentTiltPos + (100.0f/(static_cast<float>(this->tiltTimeDown/static_cast<float>(this->stepSize))))));
      }
      else if(this->currentPos < 100.0f) {
        if(this->downTime == 0 || this->stepSize == 0) return;
        this->p_target(min(100.0f, this->currentPos + (100.0f/(static_cast<float>(this->downTime/static_cast<float>(this->stepSize))))));
      }
      break;
    case somfy_commands::Flag:
      this->p_sunFlag(false);
      if(this->hasSunSensor()) {
        somfy.isDirty = true;
        this->emitState();
      }
      else {
        DBG_PRINTF("Shade does not have sensor %d\n", this->flags);
      }
      break;
    case somfy_commands::SunFlag:
      if(this->hasSunSensor()) {
        const bool isWindy = this->flags & static_cast<uint8_t>(somfy_flags_t::Windy);
        this->p_sunFlag(true);
        //this->flags |= static_cast<uint8_t>(somfy_flags_t::SunFlag);
        if (!isWindy)
        {
          const bool isSunny = this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny);
          if (isSunny && this->sunDone)
            this->p_target(this->myPos >= 0 ? this->myPos : 100.0f);
          else if (!isSunny && this->noSunDone)
            this->p_target(0.0f);
        }
        somfy.isDirty = true;
        this->emitState();
      }
      else
        DBG_PRINTF("Shade does not have sensor %d\n", this->flags);
      break;
    default:
      dir = 0;
      break;
  }
  this->setMovement(dir);
}
void SomfyShadeController::processFrame(somfy_frame_t &frame, bool internal) {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
    if(this->shades[i].getShadeId() != 255) this->shades[i].processFrame(frame, internal);
  }
}
void SomfyShadeController::processWaitingFrame() {
  for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++)
    if(this->shades[i].getShadeId() != 255) this->shades[i].processWaitingFrame();
}
