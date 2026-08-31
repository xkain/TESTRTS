#ifndef sysdiag_h
#define sysdiag_h
#include <Arduino.h>
#include "web/WResp.h"

// --- Diagnostic système (28/08/2026) ---
//
// POURQUOI PAS UNE « CHARGE CPU ». C'est la mesure qu'on attend spontanément d'un appareil, et elle
// est doublement hors de portée ici. D'abord techniquement : les bibliothèques Arduino précompilées
// (espressif32@6.8.1) livrent un sdkconfig où CONFIG_FREERTOS_USE_TRACE_FACILITY et
// CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS ne sont PAS posés, donc uxTaskGetSystemState() et
// vTaskGetRunTimeStats() n'existent pas -- les activer supposerait de recompiler l'IDF. Ensuite, et
// c'est le point décisif : configUSE_IDLE_HOOK vaut 1 en dur, on POURRAIT donc compter les tours de
// la tâche idle -- mais loopTask (Arduino) boucle sans jamais dormir et notre loop() ne fait aucun
// delay(). La tâche idle du cœur 1 ne tourne quasiment jamais : la jauge afficherait 100 % en
// permanence, quoi qu'il arrive. Un chiffre qui ne varie pas n'est pas une mesure.
//
// CE QUI EST MESURÉ À LA PLACE. Trois grandeurs qui, elles, changent quand quelque chose va mal :
//
//  1. CADENCE ET GIGUE DE loop(). Le vrai équivalent utile de « charge CPU » sur ce firmware : la
//     durée d'un tour englobe le travail de loop() ET le temps où loopTask s'est fait préempter ou
//     bloquer. C'est exactement la grandeur que surveille l'ensemble des correctifs « réseau
//     bloquant sur loopTask » (watchdog à 15 s, cf. esp_task_wdt_init dans SomfyController.ino) --
//     jusqu'ici elle n'existait que sous forme de DBG_PRINTF « Timing Net/Somfy/Schedule/WebServer »
//     au-delà de 100 ms, donc visible seulement sur un port série en mode debug, jamais à distance.
//
//  2. CAUSE DU DERNIER REDÉMARRAGE. esp_reset_reason() n'était appelé nulle part dans le projet.
//     Un panic, un watchdog et une coupure de courant produisent tous « l'appareil a redémarré » du
//     point de vue de l'utilisateur, alors que ce sont trois diagnostics complètement différents.
//     Complète la fenêtre de détection de coupure d'alimentation de Recovery, qui compte les
//     coupures mais ne dit rien des autres causes.
//
//  3. POINTS BAS DE PILE. uxTaskGetStackHighWaterMark() est un minimum HISTORIQUE monotone : lu à
//     n'importe quel moment, il rapporte le pire creux jamais atteint depuis le démarrage. Seules
//     les deux tâches dont NOUS fixons la taille de pile sont rapportées -- loopTask
//     (ARDUINO_LOOP_STACK_SIZE) et async_tcp (CONFIG_ASYNC_TCP_STACK_SIZE, posé dans
//     platformio.ini) : pour les tâches système (tiT, wifi...) le dénominateur ne nous appartient
//     pas et le chiffre n'aurait pas d'action associée. Le suivi existant
//     (ConfigSettings::reportAsyncTcpStackLow) ne parle qu'à la liaison série et ne couvre
//     qu'async_tcp ; ici les deux valeurs deviennent lisibles à distance.
//
// COÛT. loopTick() fait un esp_timer_get_time(), deux comparaisons et un compteur -- quelques
// dizaines de nanosecondes par tour de boucle, sur un tour qui en dure des centaines de
// microsecondes. Aucune allocation, aucune sortie série, rien de conditionné à enableDebugLogs :
// ces relevés doivent exister sur un appareil en production, c'est tout leur intérêt.

// Délai d'armement du chien de garde de tâche, en secondes -- la valeur passée à
// esp_task_wdt_init() dans setup(). Elle vivait jusqu'ici en littéral à cet unique endroit, mais
// elle est devenue le DÉNOMINATEUR du diagnostic de réactivité : un tour de boucle ne se juge pas
// dans l'absolu, il se juge en fraction du budget au bout duquel l'appareil redémarre de lui-même.
// Servie dans le JSON (`wdtSec`) pour que l'interface calcule ce rapport sans recopier la
// constante -- une valeur recopiée dans le JS finirait par diverger de celle du firmware, et la
// jauge mentirait sans que rien ne le signale.
#define WDT_TIMEOUT_SEC 15

// Fenêtre de calcul de la cadence. 1 s : assez court pour qu'un blocage ponctuel ressorte encore
// dans le maximum de la fenêtre courante, assez long pour que le compteur de tours soit stable.
#define SYSDIAG_WINDOW_US 1000000UL

// Seuil au-delà duquel un tour de boucle compte comme un BLOCAGE, et non comme une variation
// normale. Un tour nominal dure ~1 ms et les pics d'activité ordinaires (chargement de page,
// émission socket) restent sous les 150 ms : 1 seconde est un ordre de grandeur au-dessus de tout
// ce qui arrive en fonctionnement sain, et reste loin des 15 s du chien de garde.
// Sert à compter COMBIEN de seaux de la fenêtre glissante contiennent un blocage -- c'est ce
// comptage, et non l'amplitude du plus gros pic, qui distingue un incident isolé (une recherche de
// mise à jour lancée par l'utilisateur) d'une gêne qui dure. La distinction manquait, et le
// diagnostic s'allumait pour un évènement ponctuel déjà terminé.
#define SYSDIAG_SLOW_US 1000000UL

struct sys_diag_t {
  uint32_t loopHz;          // tours de loop() par seconde sur la dernière fenêtre d'une seconde
  uint32_t loopMaxUs;       // tour le plus long des ~60 dernières secondes (cf. les seaux, SysDiag.cpp)
  uint32_t loopMaxUsEver;   // pire tour depuis le démarrage (jamais remis à zéro)
  uint32_t loopSlowBuckets; // seaux de la fenêtre glissante contenant un blocage (0 à 6)
  uint32_t loopStackFree;   // octets de pile jamais utilisés par loopTask
  uint32_t loopStackTotal;
  uint32_t asyncStackFree;  // idem async_tcp ; 0 si la tâche n'existe pas encore
  uint32_t asyncStackTotal;
  uint32_t rfNoiseEpisodes;
  uint32_t wdtSec;          // budget du chien de garde, dénominateur de loopMaxUs côté interface
  uint32_t uptimeSec;       // secondes depuis le démarrage -- péremption de la cause de redémarrage
};

namespace SysDiag {
  // À appeler au tout début de setup(). Fige la cause du redémarrage : esp_reset_reason() reste
  // valable pendant toute la vie de l'appareil, mais la lire une seule fois évite qu'un appelant
  // tardif ne croie lire autre chose que le démarrage EN COURS.
  void begin();
  // À appeler en PREMIÈRE instruction de loop(), sur tous les chemins (mode Récupération compris) :
  // c'est l'intervalle entre deux appels qui EST la mesure. Un appel placé après un `return`
  // conditionnel mesurerait une boucle différente de celle qui tourne réellement.
  void loopTick();
  // Jeton stable, en majuscules, destiné à être traduit côté client : POWERON, PANIC, TASK_WDT,
  // BROWNOUT... Jamais une phrase -- la traduction n'a pas sa place dans le firmware.
  const char *resetReason();
  void snapshot(sys_diag_t *d);
  // Écrit les CHAMPS du diagnostic (sans accolades) : l'appelant ouvre et ferme l'objet lui-même,
  // ce qui lui laisse le choix du nom et permet de servir la même charge utile sur deux surfaces
  // (/loginContext et l'évènement socket memStatus) sans la dupliquer.
  void toJSON(JsonFormatter &json);
}
#endif
