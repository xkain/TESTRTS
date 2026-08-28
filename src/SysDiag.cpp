#include <Arduino.h>
#include <esp_system.h>
#include <esp_timer.h>
#include "SysDiag.h"

// Même logique que le core Arduino (cores/esp32/main.cpp) : le dénominateur affiché doit être la
// taille RÉELLE de la pile de loopTask, y compris si un projet la redéfinit par -D. La recopier ici
// plutôt que d'inclure main.cpp est le seul moyen d'y accéder, la valeur n'étant exposée par aucun
// en-tête.
#ifndef ARDUINO_LOOP_STACK_SIZE
#ifndef CONFIG_ARDUINO_LOOP_STACK_SIZE
#define ARDUINO_LOOP_STACK_SIZE 8192
#else
#define ARDUINO_LOOP_STACK_SIZE CONFIG_ARDUINO_LOOP_STACK_SIZE
#endif
#endif

static esp_reset_reason_t _resetReason = ESP_RST_UNKNOWN;

// Horodatage du tour précédent. 0 = aucun tour encore mesuré : le tout premier appel ne peut pas
// produire de delta (il n'y a rien avant lui), et prendre setup() comme origine ferait passer les
// secondes de démarrage pour un tour de boucle de plusieurs secondes -- exactement le genre de
// fausse valeur extrême qui reste ensuite affichée à vie dans loopMaxUsEver.
static int64_t _lastTick = 0;
static int64_t _winStart = 0;
static uint32_t _winCount = 0;

static uint32_t _loopHz = 0;
static uint32_t _loopMaxUsEver = 0;

// Pic glissant, en seaux. ÉPROUVÉ SUR MATÉRIEL le 28/08/2026 : la première version tenait le
// maximum sur la MÊME fenêtre d'une seconde que la cadence, et elle ne servait à rien. Un appel
// /getReleases (fetch GitHub synchrone sur loopTask) a bloqué la boucle 5,1 secondes sans laisser
// la moindre trace lisible -- le pic vivait dans une fenêtre d'une seconde refermée et écrasée
// bien avant le tic memStatus suivant, qui ne passe que toutes les 10 à 15 s. Une métrique de pic
// qui rate les pics ne vaut pas la peine d'être transmise.
// Le seau courant avance toutes les SYSDIAG_BUCKET_US et le maximum rapporté est celui de tous les
// seaux : un pic reste donc visible entre 50 et 60 secondes, largement de quoi être ramassé par
// n'importe quel tic d'émission. Aucun couplage avec les émetteurs (pas de « remise à zéro à la
// lecture ») : /loginContext et memStatus lisent la même valeur sans se la voler l'un l'autre.
#define SYSDIAG_PEAK_BUCKETS 6
#define SYSDIAG_BUCKET_US 10000000UL
static uint32_t _peakUs[SYSDIAG_PEAK_BUCKETS] = {0};
static uint8_t _peakIdx = 0;
static int64_t _bucketStart = 0;
// Relevé DEPUIS loopTask, donc sans passer par xTaskGetHandle("loopTask") : uxTaskGetStackHighWaterMark(NULL)
// interroge la tâche courante, et loopTick() n'est appelée que de loop(). StackType_t = uint8_t sur
// ce port Xtensa (cf. portmacro.h), la valeur est donc déjà en OCTETS, pas en mots.
static uint32_t _loopStackFree = 0;

void SysDiag::begin() {
  _resetReason = esp_reset_reason();
}

void SysDiag::loopTick() {
  int64_t now = esp_timer_get_time();
  if(_lastTick == 0) { _lastTick = _winStart = _bucketStart = now; return; }
  uint32_t dt = (uint32_t)(now - _lastTick);   // un tour de boucle ne dure jamais 71 minutes
  _lastTick = now;
  _winCount++;
  if(dt > _loopMaxUsEver) _loopMaxUsEver = dt;

  // Rotation du seau de pic AVANT l'enregistrement : le tour qu'on vient de mesurer appartient à
  // l'instant présent, donc au seau courant une fois la rotation faite. Un seul pas par appel
  // suffit -- le watchdog redémarre l'appareil bien avant qu'un tour de boucle puisse couvrir deux
  // seaux entiers (15 s d'armement contre 10 s de seau).
  if((uint32_t)(now - _bucketStart) >= SYSDIAG_BUCKET_US) {
    _peakIdx = (uint8_t)((_peakIdx + 1) % SYSDIAG_PEAK_BUCKETS);
    _peakUs[_peakIdx] = 0;
    _bucketStart = now;
  }
  if(dt > _peakUs[_peakIdx]) _peakUs[_peakIdx] = dt;

  uint32_t elapsed = (uint32_t)(now - _winStart);
  if(elapsed < SYSDIAG_WINDOW_US) return;
  // Cadence calculée sur la durée RÉELLE de la fenêtre et non sur SYSDIAG_WINDOW_US : quand un tour
  // bloque plusieurs secondes, la fenêtre se referme en retard et le rapport tours/durée reste
  // juste, là où une division par la durée nominale gonflerait artificiellement la cadence au
  // moment précis où elle s'effondre.
  _loopHz = (uint32_t)(((uint64_t)_winCount * 1000000ULL) / elapsed);
  _winStart = now;
  _winCount = 0;
  _loopStackFree = (uint32_t)uxTaskGetStackHighWaterMark(NULL);
}

const char *SysDiag::resetReason() {
  switch(_resetReason) {
    case ESP_RST_POWERON:   return "POWERON";
    case ESP_RST_EXT:       return "EXT";
    case ESP_RST_SW:        return "SW";
    case ESP_RST_PANIC:     return "PANIC";
    case ESP_RST_INT_WDT:   return "INT_WDT";
    case ESP_RST_TASK_WDT:  return "TASK_WDT";
    case ESP_RST_WDT:       return "WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT:  return "BROWNOUT";
    case ESP_RST_SDIO:      return "SDIO";
    default:                return "UNKNOWN";
  }
}

void SysDiag::snapshot(sys_diag_t *d) {
  d->loopHz = _loopHz;
  // Un seul parcours pour les deux grandeurs, qui répondent à deux questions distinctes :
  // l'amplitude du pire blocage (« à quel point s'est-on approché du chien de garde ») et le NOMBRE
  // de seaux touchés (« était-ce un accident isolé ou est-ce que ça dure »). Sans la seconde, un
  // incident ponctuel et une gêne persistante donnent exactement le même relevé.
  uint32_t peak = 0;
  uint32_t slow = 0;
  for(uint8_t i = 0; i < SYSDIAG_PEAK_BUCKETS; i++) {
    if(_peakUs[i] > peak) peak = _peakUs[i];
    if(_peakUs[i] >= SYSDIAG_SLOW_US) slow++;
  }
  d->loopMaxUs = peak;
  d->loopSlowBuckets = slow;
  d->loopMaxUsEver = _loopMaxUsEver;
  d->loopStackFree = _loopStackFree;
  d->loopStackTotal = ARDUINO_LOOP_STACK_SIZE;
  // Retrouvée par son nom : AsyncTCP ne publie pas son handle de tâche, et la patcher pour cela
  // serait une modification de dépendance pour une simple lecture. Absente tant qu'aucun
  // AsyncWebServer::begin() n'a eu lieu -- on rapporte alors 0/0 plutôt qu'un chiffre inventé.
  TaskHandle_t asyncTcpTask = xTaskGetHandle("async_tcp");
  d->asyncStackFree = asyncTcpTask ? (uint32_t)uxTaskGetStackHighWaterMark(asyncTcpTask) : 0;
  d->asyncStackTotal = asyncTcpTask ? (uint32_t)CONFIG_ASYNC_TCP_STACK_SIZE : 0;
  d->wdtSec = WDT_TIMEOUT_SEC;
  // Servi DANS le bloc diag, alors que /loginContext expose déjà un `uptime` à sa racine : c'est ce
  // qui rend la charge utile autonome. L'évènement socket memStatus porte le même objet et n'a, lui,
  // aucun uptime -- sans ce champ, la péremption de la cause de redémarrage (cf. procDiag) ne
  // fonctionnerait qu'au chargement de la page et plus du tout sur les rafraîchissements en direct.
  d->uptimeSec = (uint32_t)(millis() / 1000);
}

void SysDiag::toJSON(JsonFormatter &json) {
  sys_diag_t d;
  SysDiag::snapshot(&d);
  json.addElem("resetReason", SysDiag::resetReason());
  json.addElem("loopHz", d.loopHz);
  json.addElem("loopMaxUs", d.loopMaxUs);
  json.addElem("loopMaxUsEver", d.loopMaxUsEver);
  json.addElem("loopSlowBuckets", d.loopSlowBuckets);
  json.addElem("loopStackFree", d.loopStackFree);
  json.addElem("loopStackTotal", d.loopStackTotal);
  json.addElem("asyncStackFree", d.asyncStackFree);
  json.addElem("asyncStackTotal", d.asyncStackTotal);
  json.addElem("wdtSec", d.wdtSec);
  json.addElem("uptimeSec", d.uptimeSec);
}
