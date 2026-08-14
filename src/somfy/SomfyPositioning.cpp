#include <Arduino.h>
#include "Somfy.h"
#include "StatusLed.h"

// Moteur de positionnement, extrait de Somfy.cpp : suivi de la position/tilt pendant un
// mouvement (checkMovement, appelée en continu depuis loop()) et fixation des cibles envoyées
// à la radio (setMovement/setTiltMovement/setMyPosition/moveToMyPosition/moveToTarget/
// moveToTiltTarget/sendCommand/sendTiltCommand), pour SomfyShade et pour SomfyGroup.
//
// C'est la zone la plus sensible du projet : le protocole RTS ne renvoie aucun état du volet,
// donc currentPos/currentTiltPos ne sont jamais mesurés -- seulement estimés à partir du temps
// écoulé face à upTime/downTime/tiltTimeUp/tiltTimeDown. checkMovement() tourne en continu sur la tâche
// loop(), pendant que les commandes utilisateur/planning/MQTT arrivent depuis d'autres tâches
// (requêtes HTTP notamment) : plusieurs races entre les deux ont déjà dû être corrigées par le
// passé (voir les commentaires "APRÈS l'appel" plus bas, qui documentent pourquoi l'ordre des
// affectations compte). Toute modification ici doit être testée volet par volet, pas supposée
// correcte à la lecture.

extern SomfyShadeController somfy;
extern ConfigSettings settings;

void SomfyShade::checkMovement() {
  const uint32_t curTime = millis();
  const bool sunFlag = this->flags & static_cast<uint8_t>(somfy_flags_t::SunFlag);
  const bool isSunny = this->flags & static_cast<uint8_t>(somfy_flags_t::Sunny);
  const bool isWindy = this->flags & static_cast<uint8_t>(somfy_flags_t::Windy);
  // We need to first evaluate the sensor flags as these could be triggering movement from previous sensor inputs. So
  // we must check this before setting the directional items or it will not get processed until the next loop.
  int32_t downTime = (int32_t)this->downTime;
  int32_t upTime = (int32_t)this->upTime;
  // tiltTimeUp : lames -> plates (tiltDirection < 0, ouverture). tiltTimeDown : lames -> fermées
  // (tiltDirection > 0, fermeture). Cf. issue #33 : ces deux durées ne sont pas symétriques sur
  // tous les moteurs et doivent pouvoir être calibrées séparément.
  int32_t tiltTimeUp = (int32_t)this->tiltTimeUp;
  int32_t tiltTimeDown = (int32_t)this->tiltTimeDown;
  if(this->shadeType == shade_types::drycontact || this->shadeType == shade_types::drycontact2) downTime = upTime = tiltTimeUp = tiltTimeDown = 1;


  // We are checking movement for essentially 3 types of motors.
  // If this is an integrated tilt we need to first tilt in the direction we are moving then move.  We know
  // what needs to be done by the tilt type.  Set a tilt first flag to indicate whether we should be tilting or
  // moving. If this is only a tilt action then the regular tilt action should operate fine.
  // tiltFirstOnOpen/tiltFirstOnClose rendent cet ordre configurable par sens (issue #33 : certains
  // moteurs translatent d'abord et n'inclinent qu'en butée, à la fermeture par exemple). Quand le
  // flag du sens courant est à false, tilt_first reste false comme pour un tiltmotor classique : la
  // branche !tilt_first ci-dessous gère déjà la translation suivie d'un tilt différé une fois la
  // position atteinte (stop + moveToTiltTarget), aucune logique supplémentaire n'est nécessaire.
  int8_t currDir = this->direction;
  int8_t currTiltDir = this->tiltDirection;
  this->p_direction(this->currentPos == this->target ? 0 : this->currentPos > this->target ? -1 : 1);
  bool tilt_first = this->tiltType == tilt_types::integrated &&
    ((this->direction == -1 && this->tiltFirstOnOpen && this->currentTiltPos != 0.0f) ||
     (this->direction == 1 && this->tiltFirstOnClose && this->currentTiltPos != 100.0f));

  this->p_tiltDirection(this->currentTiltPos == this->tiltTarget ? 0 : this->currentTiltPos > this->tiltTarget ? -1 : 1);
  if(tilt_first) this->p_tiltDirection(this->direction);
  else if(this->direction != 0) this->p_tiltDirection(0);
  uint8_t currPos = floor(this->currentPos);
  uint8_t currTiltPos = floor(this->currentTiltPos);
  if(this->direction != 0) this->lastMovement = this->direction;
  if (sunFlag) {
    if (isSunny && !isWindy) {  // It is sunny and there is no wind so we should be extended
      if (this->noWindDone
          && !this->sunDone
          && this->sunStart
          && (curTime - this->sunStart) >= SOMFY_SUN_TIMEOUT)
      {
        this->p_target(this->myPos >= 0 ? this->myPos : 100.0f);
        //this->target = this->myPos >= 0 ? this->myPos : 100.0f;
        this->sunDone = true;
        DBG_PRINTF("[%u] Sun -> done\r\n", this->shadeId);
      }
      if (!this->noWindDone
          && this->noWindStart
          && (curTime - this->noWindStart) >= SOMFY_NO_WIND_TIMEOUT)
      {
        this->p_target(this->myPos >= 0 ? this->myPos : 100.0f);
        //this->target = this->myPos >= 0 ? this->myPos : 100.0f;
        this->noWindDone = true;
        DBG_PRINTF("[%u] No Wind -> done\r\n", this->shadeId);
      }
    }
    if (!isSunny
        && !this->noSunDone
        && this->noSunStart
        && (curTime - this->noSunStart) >= SOMFY_NO_SUN_TIMEOUT)
    {
      if(this->tiltType == tilt_types::tiltonly) this->p_tiltTarget(0.0f);
      this->p_target(0.0f);
      this->noSunDone = true;
      DBG_PRINTF("[%u] No Sun -> done\r\n", this->shadeId);
    }
  }

  if (isWindy
      && !this->windDone
      && this->windStart
      && (curTime - this->windStart) >= SOMFY_WIND_TIMEOUT)
  {
    if(this->tiltType == tilt_types::tiltonly) this->p_tiltTarget(0.0f);
    this->p_target(0.0f);
    this->windDone = true;
    DBG_PRINTF("[%u] Wind -> done\r\n", this->shadeId);
  }

  if(!tilt_first && this->direction > 0) {
    if(downTime == 0) {
      this->p_currentPos(100.0);
      //this->p_direction(0);
    }
    else {
      // The shade is moving down so we need to calculate its position through the down position.
      // 10000ms from 0 to 100
      // The starting posion is a float value from 0-1 that indicates how much the shade is open. So
      // if we take the starting position * the total down time then this will tell us how many ms it
      // has moved in the down position.
      int32_t msFrom0 = (int32_t)floor((this->startPos/100) * downTime);

      // So if the start position is .1 it is 10% closed so we have a 1000ms (1sec) of time to account for
      // before we add any more time.
      msFrom0 += (curTime - this->moveStart);
      // Now we should have the total number of ms that the shade moved from the top.  But just so we
      // don't have any rounding errors make sure that it is not greater than the max down time.
      msFrom0 = min(downTime, msFrom0);
      if(msFrom0 >= downTime) {
        this->p_currentPos(100.0f);
        //this->p_direction(0);
      }
      else {
        // So now we know how much time has elapsed from the 0 position to down.  The current position should be
        // a ratio of how much time has travelled over the total time to go 100%.

        // We should now have the number of ms it will take to reach the shade fully close.
        this->p_currentPos((min(max((float)0.0, (float)msFrom0 / (float)downTime), (float)1.0)) * 100);
        // If the current position is >= 1 then we are at the bottom of the shade.
        if(this->currentPos >= 100) {
          this->p_currentPos(100.0);
          //this->p_direction(0);
        }
      }
    }
    if(this->currentPos >= this->target) {
      this->p_currentPos(this->target);
      //if(this->settingMyPos) Serial.printf("IsAtTarget: %d  %f=%f\n", this->isAtTarget(), this->currentPos, this->target);
      // If we need to stop the shade do this before we indicate that we are
      // not moving otherwise the my function will kick in.
      if(this->settingPos) {
        if(!isAtTarget()) {
          DBG_PRINTF("We are not at our tilt target: %.2f\n", this->tiltTarget);
          if(this->target != 100.0) SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
          delay(100);
          // We now need to move the tilt to the position we requested.
          this->moveToTiltTarget(this->tiltTarget);
        }
        else
          if(this->target != 100.0) SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
      }
      this->p_direction(0);
      this->tiltStart = curTime;
      this->startTiltPos = this->currentTiltPos;
      if(this->isAtTarget()) this->commitShadePosition();
    }
  }
  else if(!tilt_first && this->direction < 0) {
    if(upTime == 0) {
      this->p_currentPos(0);
      //this->p_direction(0);
    }
    else {
      // The shade is moving up so we need to calculate its position through the up position. Shades
      // often move slower in the up position so since we are using a relative position the up time
      // can be calculated.
      // 10000ms from 100 to 0;
      int32_t msFrom100 = upTime - (int32_t)floor((this->startPos/100) * upTime);
      msFrom100 += (curTime - this->moveStart);
      msFrom100 = min(upTime, msFrom100);
      if(msFrom100 >= upTime) {
        this->p_currentPos(0.0f);
        //this->p_direction(0);
      }
      else {
        float fpos = ((float)1.0 - min(max((float)0.0, (float)msFrom100 / (float)upTime), (float)1.0)) * 100;
        // We should now have the number of ms it will take to reach the shade fully open.
        // If we are at the top of the shade then set the movement to 0.
        if(fpos <= 0.0) {
          this->p_currentPos(0.0f);
          //this->p_direction(0);
        }
        else
          this->p_currentPos(fpos);
      }
    }
    if(this->currentPos <= this->target) {
      this->p_currentPos(this->target);
      //if(this->settingMyPos) Serial.printf("IsAtTarget: %d  %f=%f\n", this->isAtTarget(), this->currentPos, this->target);

      // If we need to stop the shade do this before we indicate that we are
      // not moving otherwise the my function will kick in.
      if(this->settingPos) {
        if(!isAtTarget()) {
          DBG_PRINTF("We are not at our tilt target: %.2f\n", this->tiltTarget);
          if(this->target != 0.0) SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
          delay(100);
          // We now need to move the tilt to the position we requested.
          this->moveToTiltTarget(this->tiltTarget);
        }
        else
          if(this->target != 0.0) SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
      }
      this->p_direction(0);
      this->tiltStart = curTime;
      this->startTiltPos = this->currentTiltPos;
      if(this->isAtTarget()) this->commitShadePosition();
    }
  }
  if(this->tiltDirection > 0) {
    if(tilt_first) this->moveStart = curTime;
    int32_t msFrom0 = (int32_t)floor((this->startTiltPos/100) * tiltTimeDown);
    msFrom0 += (curTime - this->tiltStart);
    msFrom0 = min(tiltTimeDown, msFrom0);
    if(msFrom0 >= tiltTimeDown) {
      this->p_currentTiltPos(100.0f);
      //this->p_tiltDirection(0);
      //Serial.printf("Setting tiltDirection to 0 (not enough time) %.4f %.4f\n", msFrom0, tiltTimeDown);
    }
    else {
      float fpos = (min(max((float)0.0, (float)msFrom0 / (float)tiltTimeDown), (float)1.0)) * 100;

      if(fpos > 100.0f) {
        this->p_currentTiltPos(100.0f);
        //this->p_tiltDirection(0);
        //Serial.println("Setting tiltDirection to 0 (100%)");
      }
      else this->p_currentTiltPos(fpos);
    }
    if(tilt_first) {
      if(this->currentTiltPos >= 100.0f) {
        this->p_currentTiltPos(100.0f);
        this->moveStart = curTime;
        this->startPos = this->currentPos;
        //this->p_tiltDirection(0);
        //Serial.println("Setting tiltDirection to 0 (tilt_first)");
      }
    }
    else if(this->currentTiltPos >= this->tiltTarget) {
      this->p_currentTiltPos(this->tiltTarget);
      // If we need to stop the shade do this before we indicate that we are
      // not moving otherwise the my function will kick in.
      if(this->settingTiltPos) {
        if(this->tiltType == tilt_types::integrated) {
          // If this is an integrated tilt mechanism the we will simply let it finish.  If it is not then we will stop it.
          //Serial.printf("Sending My -- tiltTarget: %.2f, tiltDirection: %d\n", this->tiltTarget, this->tiltDirection);
          if(this->tiltTarget != 100.0f || this->currentPos != 100.0f) SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
        }
        else {
          // This is a tilt motor so let it complete if it is going to 100.
          if(this->tiltTarget != 100.0f) SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
        }
      }
      this->p_tiltDirection(0);
      this->settingTiltPos = false;
      if(this->isAtTarget()) this->commitShadePosition();
    }
  }
  else if(this->tiltDirection < 0) {
    if(tilt_first) this->moveStart = curTime;
    if(tiltTimeUp == 0) {
      this->p_tiltDirection(0);
      this->p_currentTiltPos(0.0f);
    }
    else {
      int32_t msFrom100 = tiltTimeUp - (int32_t)floor((this->startTiltPos/100) * tiltTimeUp);
      msFrom100 += (curTime - this->tiltStart);
      msFrom100 = min(tiltTimeUp, msFrom100);
      if(msFrom100 >= tiltTimeUp) {
        this->p_currentTiltPos(0.0f);
        //this->p_tiltDirection(0);
      }
      float fpos = ((float)1.0 - min(max((float)0.0, (float)msFrom100 / (float)tiltTimeUp), (float)1.0)) * 100;
      // If we are at the top of the shade then set the movement to 0.
      if(fpos <= 0.0f) {
        this->p_currentTiltPos(0.0f);
        //this->p_tiltDirection(0);
      }
      else this->p_currentTiltPos(fpos);
    }
    if(tilt_first) {
      if(this->currentTiltPos <= 0.0f) {
        this->p_currentTiltPos(0.0f);
        this->moveStart = curTime;
        this->startPos = this->currentPos;
        //this->p_tiltDirection(0);
      }
    }
    else if(this->currentTiltPos <= this->tiltTarget) {
      this->p_currentTiltPos(this->tiltTarget);
      // If we need to stop the shade do this before we indicate that we are
      // not moving otherwise the my function will kick in.
      if(this->settingTiltPos) {
        if(this->tiltType == tilt_types::integrated) {
          // If this is an integrated tilt mechanism the we will simply let it finish.  If it is not then we will stop it.
          //Serial.printf("Sending My -- tiltTarget: %.2f, tiltDirection: %d\n", this->tiltTarget, this->tiltDirection);
          if(this->tiltTarget != 0.0 || this->currentPos != 0.0) SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
        }
        else {
          // This is a tilt motor so let it complete if it is going to 0.
          if(this->tiltTarget != 0.0) SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
        }
      }
      this->p_tiltDirection(0);
      this->settingTiltPos = false;
      DBG_PRINTLN("Stopping at tilt position");
      if(this->isAtTarget()) this->commitShadePosition();
    }
  }
  if(this->settingMyPos && this->isAtTarget()) {
    delay(200);
    // Set this position before sending the command.  If you don't the processFrame function
    // will send the shade back to its original My position.
    if(this->tiltType != tilt_types::none) {
      if(this->myTiltPos == this->currentTiltPos && this->myPos == this->currentPos) this->myPos = this->myTiltPos = -1;
      else {
        this->p_myPos(this->currentPos);
        this->p_myTiltPos(this->currentTiltPos);
      }
    }
    else {
      this->p_myTiltPos(-1);
      if(this->myPos == this->currentPos) this->p_myPos(-1);
      else this->p_myPos(this->currentPos);
    }
    SomfyRemote::sendCommand(somfy_commands::My, SETMY_REPEATS);
    this->settingMyPos = false;
    this->commitMyPosition();
    this->emitState();
  }
  else if(currDir != this->direction || currPos != floor(this->currentPos) || currTiltDir != this->tiltDirection || currTiltPos != floor(this->currentTiltPos)) {
    // We need to emit on the socket that our state has changed.
    this->emitState();
  }
}
void SomfyShade::setTiltMovement(int8_t dir) {
  int8_t currDir = this->tiltDirection;
  if(dir == 0) {
    // The shade tilt is stopped.
    this->startTiltPos = this->currentTiltPos;
    this->tiltStart = 0;
    this->p_tiltDirection(dir);
    if(currDir != dir) {
      this->commitTiltPosition();
    }
  }
  else if(this->tiltDirection != dir) {
    this->tiltStart = millis();
    this->startTiltPos = this->currentTiltPos;
    this->p_tiltDirection(dir);
  }
  if(this->tiltDirection != currDir) {
    this->emitState();
  }
}
void SomfyShade::setMovement(int8_t dir) {
  int8_t currDir = this->direction;
  int8_t currTiltDir = this->tiltDirection;
  if(dir == 0) {
    if(currDir != dir || currTiltDir != dir) this->commitShadePosition();
  }
  else {
    this->tiltStart = this->moveStart = millis();
    this->startPos = this->currentPos;
    this->startTiltPos = this->currentTiltPos;
  }
  if(this->direction != currDir || currTiltDir != this->tiltDirection) {
    this->emitState();
  }
}
void SomfyShade::setMyPosition(int8_t pos, int8_t tilt) {
  if(!this->isIdle()) return; // Don't do this if it is moving.
  // En mode simMy il n'existe pas de moteur physique dont il faudrait respecter la mémoire de
  // position : la valeur My n'est qu'un pourcentage que le firmware retient pour moveToTarget().
  // On peut donc l'enregistrer immédiatement, sans passer par la chorégraphie "déplacer le volet
  // jusque là, puis constater l'arrivée dans checkMovement() pour committer" qu'impose le
  // protocole natif (calquée sur l'apprentissage My d'une vraie télécommande : on amène le volet
  // à la position voulue à la main, puis on appuie sur My). Cette chorégraphie asynchrone est ce
  // qui provoquait le décalage observé côté UI (badge affichant la valeur précédente pendant tout
  // le trajet simulé) ainsi que les sauts de position lorsqu'un second ordre My était envoyé avant
  // que le premier n'ait fini de committer.
  if(this->simMy()) {
    if(this->tiltType == tilt_types::tiltonly) {
      this->p_myPos(-1.0f);
      if(tilt == floor(this->myTiltPos)) this->p_myTiltPos(-1.0f); // toggle : déjà mémorisé -> on efface
      else this->p_myTiltPos(tilt);
    }
    else if(this->tiltType != tilt_types::none) {
      if(tilt < 0) tilt = 0;
      if(pos == floor(this->myPos) && tilt == floor(this->myTiltPos)) {
        this->p_myPos(-1.0f);
        this->p_myTiltPos(-1.0f);
      }
      else {
        this->p_myPos(pos);
        this->p_myTiltPos(tilt);
      }
    }
    else {
      if(pos == floor(this->myPos)) this->p_myPos(-1.0f);
      else this->p_myPos(pos);
      this->p_myTiltPos(-1.0f);
    }
    this->commitMyPosition();
    this->emitState();
    return;
  }
  if(this->tiltType == tilt_types::tiltonly) {
    this->p_myPos(-1.0f);
    if(tilt != floor(this->currentTiltPos)) {
      // settingMyPos positionné APRÈS l'appel (et non avant) : moveToTarget()/moveToMyPosition()
      // remettent moveStart/startTiltPos à zéro (via SomfyRemote::sendCommand -> processFrame), ce
      // qui rend le volet "en mouvement" aux yeux de checkMovement() -- lequel tourne en continu sur
      // une tâche distincte de celle-ci (traitement d'une requête HTTP). Positionner settingMyPos
      // AVANT laissait une fenêtre où checkMovement() pouvait le voir déjà à true alors que
      // tiltTarget n'avait pas encore été mis à jour (encore égal à l'ancien, qui coïncide typiquement
      // avec currentTiltPos puisque le volet était idle) : isAtTarget() renvoyait alors vrai à tort et
      // committait myTiltPos sur la position de DÉPART au lieu de la position visée.
      if(tilt == floor(this->myTiltPos))
        this->moveToMyPosition();
      else
        this->moveToTarget(100, tilt);
      this->settingMyPos = true;
    }
    else if(tilt == floor(this->myTiltPos)) {
      // Of so we need to clear the my position. These motors are finicky so send
      // a my command to ensure we are actually at the my position then send the clear
      // command.  There really is no other way to do this.
      if(this->currentTiltPos != this->myTiltPos) {
        this->moveToMyPosition();
        this->settingMyPos = true;
      }
      else {
        SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
        this->settingPos = false;
        this->settingMyPos = true;
      }
    }
    else {
      SomfyRemote::sendCommand(somfy_commands::My, SETMY_REPEATS);
      this->p_myTiltPos(this->currentTiltPos);
    }
    this->commitMyPosition();
    this->emitState();
  }
  else if(this->tiltType != tilt_types::none) {
      if(tilt < 0) tilt = 0;
      if(pos != floor(this->currentPos) || tilt != floor(this->currentTiltPos)) {
        // settingMyPos APRÈS l'appel : voir le commentaire équivalent dans la branche tiltonly
        // ci-dessus -- même fenêtre de compétition avec checkMovement() sur une tâche distincte.
        if(pos == floor(this->myPos) && tilt == floor(this->myTiltPos))
          this->moveToMyPosition();
        else
          this->moveToTarget(pos, tilt);
        this->settingMyPos = true;
      }
      else if(pos == floor(this->myPos) && tilt == floor(this->myTiltPos)) {
        // Of so we need to clear the my position. These motors are finicky so send
        // a my command to ensure we are actually at the my position then send the clear
        // command.  There really is no other way to do this.
        if(this->currentPos != this->myPos || this->currentTiltPos != this->myTiltPos) {
          this->moveToMyPosition();
          this->settingMyPos = true;
        }
        else {
          SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
          this->settingPos = false;
          this->settingMyPos = true;
        }
      }
      else {
        SomfyRemote::sendCommand(somfy_commands::My, SETMY_REPEATS);
        this->p_myPos(this->currentPos);
        this->p_myTiltPos(this->currentTiltPos);
      }
      this->commitMyPosition();
      this->emitState();
  }
  else {
    if(pos != floor(this->currentPos)) {
      // settingMyPos APRÈS l'appel : voir le commentaire équivalent dans la branche tiltonly
      // plus haut -- même fenêtre de compétition avec checkMovement() sur une tâche distincte.
      if(pos == floor(this->myPos))
        this->moveToMyPosition();
      else
        this->moveToTarget(pos);
      this->settingMyPos = true;
    }
    else if(pos == floor(this->myPos)) {
      // Of so we need to clear the my position. These motors are finicky so send
      // a my command to ensure we are actually at the my position then send the clear
      // command.  There really is no other way to do this.
      if(this->myPos != this->currentPos) {
        this->moveToMyPosition();
        this->settingMyPos = true;
      }
      else {
        SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
        this->settingPos = false;
        this->settingMyPos = true;
      }
    }
    else {
      SomfyRemote::sendCommand(somfy_commands::My, SETMY_REPEATS);
      this->p_myPos(currentPos);
      this->p_myTiltPos(-1);
      this->commitMyPosition();
      this->emitState();
    }
  }
}
void SomfyShade::moveToMyPosition() {
  if(!this->isIdle()) return;
  DBG_PRINTLN("Moving to My Position");
  if(this->tiltType == tilt_types::tiltonly) {
    this->p_currentPos(100.0f);
    this->p_myPos(-1.0f);
  }
  if(this->currentPos == this->myPos) {
    if(this->tiltType != tilt_types::none) {
      if(this->currentTiltPos == this->myTiltPos) return; // Nothing to see here since we are already here.
    }
    else
      return;
  }
  if(this->myPos == -1 && (this->tiltType == tilt_types::none || this->myTiltPos == -1)) return;
  this->settingPos = false;
  if(this->simMy()) {
    DBG_PRINT("Moving to simulated favorite\n");
    // Ne PAS positionner target ici : moveToTarget() s'en charge lui-même, dans le bon ordre --
    // APRÈS avoir remis à zéro moveStart/startPos (via SomfyRemote::sendCommand -> processFrame).
    // Le faire en amont, comme le fait la branche native ci-dessous, ouvrait une fenêtre de
    // compétition avec checkMovement() : target changeait de valeur immédiatement, visible dès le
    // prochain passage de la boucle principale, alors que moveStart/startPos restaient encore ceux
    // de l'ancien mouvement (potentiellement très anciens). checkMovement() calculait alors un
    // temps écoulé aberrant, concluait que le trajet entier était déjà passé, et faisait sauter
    // directement le volet à la position My en un seul cycle au lieu de l'animation progressive.
    this->moveToTarget(this->myPos, this->myTiltPos);
  }
  else {
    if(this->tiltType != tilt_types::tiltonly && this->myPos >= 0.0f && this->myPos <= 100.0f) this->p_target(this->myPos);
    if(this->myTiltPos >= 0.0f && this->myTiltPos <= 100.0f) this->p_tiltTarget(this->myTiltPos);
    SomfyRemote::sendCommand(somfy_commands::My, this->repeats);
  }
}
void SomfyShade::sendCommand(somfy_commands cmd) { this->sendCommand(cmd, this->repeats); }
void SomfyShade::sendCommand(somfy_commands cmd, uint8_t repeat, uint8_t stepSize) {
  // This sendCommand function will always be called externally. sendCommand at the remote level
  // is expected to be called internally when the motor needs commanded.
  if(this->bitLength == 0) this->bitLength = somfy.transceiver.config.type;
  // Éclat du témoin : ces deux sendCommand sont les points d'entrée EXTERNES (une commande
  // utilisateur, planning ou MQTT), là où sendCommand au niveau SomfyRemote est appelé en
  // interne pour chaque répétition. Un groupe ne rediffuse pas vers ses membres : sa commande
  // produit donc un seul éclat, pas un par volet lié.
  if(this->ledFeedback) statusLed.blink();
  // Indicateur logiciel (header web) : contrairement à ledFeedback ci-dessus (par volet/groupe,
  // pilote la LED GPIO), showRadioActivity est un réglage global -- la garde est interne à
  // emitRadioActivity(), cf. Somfy.cpp.
  emitRadioActivity();
  if(cmd == somfy_commands::Up) {
    if(this->tiltType == tilt_types::euromode) {
      // In euromode we need to long press for 2 seconds on the
      // up command.
      SomfyRemote::sendCommand(cmd, TILT_REPEATS);
      this->p_target(0.0f);
    }
    else {
      SomfyRemote::sendCommand(cmd, repeat);
      if(this->tiltType == tilt_types::tiltonly) {
        this->p_target(100.0f);
        this->p_tiltTarget(0.0f);
        this->p_currentPos(100.0f);
      }
      else this->p_target(0.0f);
      if(this->tiltType == tilt_types::integrated) this->p_tiltTarget(0.0f);
    }
  }
  else if(cmd == somfy_commands::Down) {
    if(this->tiltType == tilt_types::euromode) {
      // In euromode we need to long press for 2 seconds on the
      // down command.
      SomfyRemote::sendCommand(cmd, TILT_REPEATS);
      this->p_target(100.0f);
    }
    else {
      SomfyRemote::sendCommand(cmd, repeat);
      if(this->tiltType == tilt_types::tiltonly) {
        this->p_target(100.0f);
        this->p_tiltTarget(100.0f);
        this->p_currentPos(100.0f);
      }
      else this->p_target(100.0f);
      if(this->tiltType == tilt_types::integrated) this->p_tiltTarget(100.0f);
    }
  }
  else if(cmd == somfy_commands::My) {
    if(this->isToggle() || this->shadeType == shade_types::drycontact)
      SomfyRemote::sendCommand(cmd, repeat);
    else if(this->shadeType == shade_types::drycontact2) return;
    else if(this->isIdle()) {
      this->moveToMyPosition();
      return;
    }
    else {
      SomfyRemote::sendCommand(cmd, repeat);
      if(this->tiltType != tilt_types::tiltonly) this->p_target(this->currentPos);
      this->p_tiltTarget(this->currentTiltPos);
    }
  }
  else if(cmd == somfy_commands::Toggle) {
    if(this->bitLength != 80) SomfyRemote::sendCommand(somfy_commands::My, repeat, stepSize);
    else SomfyRemote::sendCommand(somfy_commands::Toggle, repeat);
  }
  else if(this->isToggle() && cmd == somfy_commands::Prog) {
    SomfyRemote::sendCommand(somfy_commands::Toggle, repeat, stepSize);
  }
  else {
    SomfyRemote::sendCommand(cmd, repeat, stepSize);
  }
}
void SomfyGroup::sendCommand(somfy_commands cmd) { this->sendCommand(cmd, this->repeats); }
void SomfyGroup::sendCommand(somfy_commands cmd, uint8_t repeat, uint8_t stepSize) {
  // This sendCommand function will always be called externally. sendCommand at the remote level
  // is expected to be called internally when the motor needs commanded.
  if(this->bitLength == 0) this->bitLength = somfy.transceiver.config.type;
  // Éclat du témoin : ces deux sendCommand sont les points d'entrée EXTERNES (une commande
  // utilisateur, planning ou MQTT), là où sendCommand au niveau SomfyRemote est appelé en
  // interne pour chaque répétition. Un groupe ne rediffuse pas vers ses membres : sa commande
  // produit donc un seul éclat, pas un par volet lié.
  if(this->ledFeedback) statusLed.blink();
  // Indicateur logiciel (header web) : contrairement à ledFeedback ci-dessus (par volet/groupe,
  // pilote la LED GPIO), showRadioActivity est un réglage global -- la garde est interne à
  // emitRadioActivity(), cf. Somfy.cpp.
  emitRadioActivity();
  SomfyRemote::sendCommand(cmd, repeat, stepSize);

  switch(cmd) {
    case somfy_commands::My:
      this->p_direction(0);
      break;
    case somfy_commands::Up:
      this->p_direction(-1);
      break;
    case somfy_commands::Down:
      this->p_direction(1);
      break;
    default:
      break;
  }

  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] != 0) {
      SomfyShade *shade = somfy.getShadeById(this->linkedShades[i]);
      if(shade) {
        shade->processInternalCommand(cmd, repeat);
        shade->emitCommand(cmd, "group", this->getRemoteAddress());
      }
    }
  }
  this->updateFlags();
  this->emitState();

}
void SomfyGroup::moveToTarget(float pos, float tilt) {
  // Contrairement à sendCommand (une seule trame RF sur le canal du groupe, puis mise à
  // jour interne des volets membres), ici chaque volet doit potentiellement parcourir une
  // distance différente pour atteindre le même pourcentage cible : il n'y a pas de sens de
  // déplacement unique valable pour tout le groupe. On délègue donc à SomfyShade::moveToTarget
  // (déjà utilisé pour le positionnement individuel) pour chaque volet membre, qui décide
  // Up/Down/My selon sa propre position courante et gère lui-même le dead-reckoning
  // (upTime/downTime) via checkMovement(). tilt n'est transmis qu'aux volets du groupe qui gèrent
  // réellement l'inclinaison (groupe potentiellement mixte) : un volet sans tilt qui se trouve déjà
  // à la position cible pourrait sinon interpréter à tort une comparaison de tilt residuelle comme
  // une demande de mouvement.
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] != 0) {
      SomfyShade *shade = somfy.getShadeById(this->linkedShades[i]);
      if(shade) shade->moveToTarget(pos, (shade->tiltType != tilt_types::none) ? tilt : -1.0f);
    }
  }
  this->updateFlags();
  this->emitState();
}
// Ajuste uniquement l'inclinaison de chaque volet membre qui en gère une, sans toucher à sa
// hauteur actuelle : contrairement à moveToTarget (un pourcentage commun visé par tous les
// membres), chaque volet garde ici sa propre position -- on lui repasse donc sa position ACTUELLE
// en argument `pos`, ce que SomfyShade::moveToTarget interprète déjà comme "hauteur inchangée,
// n'ajuster que le tilt" via sa comparaison pos==currentPos existante. Les volets sans tilt sont
// ignorés (groupe potentiellement mixte).
void SomfyGroup::moveTiltOnly(float tilt) {
  for(uint8_t i = 0; i < SOMFY_MAX_GROUPED_SHADES; i++) {
    if(this->linkedShades[i] != 0) {
      SomfyShade *shade = somfy.getShadeById(this->linkedShades[i]);
      if(shade && shade->tiltType != tilt_types::none) shade->moveToTarget(shade->currentPos, tilt);
    }
  }
  this->updateFlags();
  this->emitState();
}
void SomfyShade::sendTiltCommand(somfy_commands cmd) {
  if(cmd == somfy_commands::Up) {
    SomfyRemote::sendCommand(cmd, this->tiltType == tilt_types::tiltmotor ? TILT_REPEATS : this->repeats);
    this->p_tiltTarget(0.0f);
  }
  else if(cmd == somfy_commands::Down) {
    SomfyRemote::sendCommand(cmd, this->tiltType == tilt_types::tiltmotor ? TILT_REPEATS : this->repeats);
    this->p_tiltTarget(100.0f);
  }
  else if(cmd == somfy_commands::My) {
    SomfyRemote::sendCommand(cmd, this->tiltType == tilt_types::tiltmotor ? TILT_REPEATS : this->repeats);
    this->p_tiltTarget(this->currentTiltPos);
  }
}
void SomfyShade::moveToTiltTarget(float target) {
  somfy_commands cmd = somfy_commands::My;
  if(target < this->currentTiltPos)
    cmd = somfy_commands::Up;
  else if(target > this->currentTiltPos)
    cmd = somfy_commands::Down;
  if(target >= 0.0f && target <= 100.0f) {
    // Only send a command if the lift is not moving.
    if(this->currentPos == this->target || this->tiltType == tilt_types::tiltmotor) {
      if(cmd != somfy_commands::My) {
        DBG_PRINT("Moving Tilt to ");
        DBG_PRINT(target);
        DBG_PRINT("% from ");
        DBG_PRINT(this->currentTiltPos);
        DBG_PRINT("% using ");
        DBG_PRINTLN(translateSomfyCommand(cmd));
        SomfyRemote::sendCommand(cmd, this->tiltType == tilt_types::tiltmotor ? TILT_REPEATS : this->repeats);
      }
      // If the blind is currently moving then the command to stop it
      // will occur on its own when the tilt target is set.
    }
    this->p_tiltTarget(target);
  }
  if(cmd != somfy_commands::My) this->settingTiltPos = true;
}
void SomfyShade::moveToTarget(float pos, float tilt) {
  somfy_commands cmd = somfy_commands::My;
  if(this->isToggle()) {
    // Overload this as we cannot seek a position on a garage door or single button device.
    this->p_target(pos);
    this->p_currentPos(pos);
    this->emitState();
    return;
  }
  if(this->tiltType == tilt_types::tiltonly) {
    this->p_target(100.0f);
    this->p_myPos(-1.0f);
    this->p_currentPos(100.0f);
    pos = 100;
    if(tilt < this->currentTiltPos) cmd = somfy_commands::Up;
    else if(tilt > this->currentTiltPos) cmd = somfy_commands::Down;
  }
  else {
    if(pos < this->currentPos)
      cmd = somfy_commands::Up;
    else if(pos > this->currentPos)
      cmd = somfy_commands::Down;
    else if(tilt >= 0 && tilt < this->currentTiltPos)
      cmd = somfy_commands::Up;
    else if(tilt >= 0 && tilt > this->currentTiltPos)
      cmd = somfy_commands::Down;
  }
  if(cmd != somfy_commands::My) {
    DBG_PRINT("Moving to ");
    DBG_PRINT(pos);
    DBG_PRINT("% from ");
    DBG_PRINT(this->currentPos);
    if(tilt >= 0) {
      DBG_PRINT(" tilt ");
      DBG_PRINT(tilt);
      DBG_PRINT("% from ");
      DBG_PRINT(this->currentTiltPos);
    }
    DBG_PRINT("% using ");
    DBG_PRINTLN(translateSomfyCommand(cmd));
    // target/tiltTarget DOIVENT être positionnés AVANT SomfyRemote::sendCommand() (et non après,
    // comme c'était le cas) : celui-ci déclenche somfy.processFrame(frame, true), qui remet à zéro
    // moveStart/startPos/startTiltPos -- rendant le volet "en mouvement" du point de vue de
    // checkMovement() -- alors que handleShadeCommand()/handleSetMyPosition() tournent sur une tâche
    // distincte de loop(). Avec l'ancien ordre, une fenêtre de compétition existait : checkMovement()
    // pouvait s'exécuter entre le reset de moveStart et la mise à jour de target/tiltTarget, et y
    // trouvait encore les ANCIENNES valeurs de target/tiltTarget -- qui correspondent typiquement
    // pile à currentPos/currentTiltPos puisque le volet était idle juste avant. isAtTarget() renvoyait
    // alors vrai à tort, ce qui pouvait déclencher prématurément la validation d'arrivée (et, pour
    // SomfyShade::setMyPosition(), committer myPos/myTiltPos sur la position de DÉPART du trajet au
    // lieu de la position réellement visée).
    this->settingPos = true;
    this->p_target(pos);
    if(tilt >= 0) {
      this->p_tiltTarget(tilt);
      this->settingTiltPos = true;
    }
    SomfyRemote::sendCommand(cmd, this->tiltType == tilt_types::euromode ? TILT_REPEATS : this->repeats);
  }
}
