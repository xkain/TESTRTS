#include <Arduino.h>
#include <WiFi.h>
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include "ConfigSettings.h"
#include "Network.h"
#include "web/Web.h"
#include "web/WebGitSync.h"
#include "Sockets.h"
#include "Utils.h"
#include "somfy/Somfy.h"
#include "MQTT.h"
#include "GitOTA.h"
#include "Recovery.h"
#include "Schedule.h"
#include "StatusLed.h"
#include "DiagConn.h"
#include "SysDiag.h"

ConfigSettings settings;
Web webServer;
SocketEmitter sockEmit;
Network net;
rebootDelay_t rebootDelay;
SomfyShadeController somfy;
MQTTClass mqtt;
GitUpdater git;
ScheduleController schedule;

uint32_t oldheap = 0;

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Startup/Boot....");

  // Avant tout le reste : c'est la cause du redémarrage QUI VIENT D'AVOIR LIEU qu'on fige ici, et
  // elle distingue un panic ou un watchdog d'une coupure de courant -- trois situations que la
  // fenêtre de détection de Recovery, juste en dessous, ne sait pas départager à elle seule.
  SysDiag::begin();

  // Arme la détection des coupures d'alim successives (et la LED si LED_PIN != -1). Ne bloque pas :
  // le montage du filesystem et le chargement des réglages ci-dessous se font PENDANT la fenêtre de
  // détection, de sorte qu'un démarrage nominal n'en paie pas le coût en plus.
  recovery.beginDetection();

  Serial.println("Mounting File System...");
  if (LittleFS.begin()) {
    Serial.println("File system mounted successfully");
  } else {
    // Le mode Récupération sert justement à réparer ce cas, et sa page est embarquée dans le
    // binaire (cf. RecoveryPage.h) donc indépendante du filesystem -- on le déclenche nous-mêmes
    // plutôt que d'attendre les 3 coupures d'alimentation manuelles : un FS illisible (OTA
    // interrompue, secteur corrompu) laisserait sinon démarrer une UI cassée sans aucune piste
    // pour l'utilisateur.
    Serial.println("Error mounting file system");
    recovery.forceRequest();
  }

  settings.begin();

  // Consomme le reliquat de la fenêtre puis arrête la décision.
  recovery.endDetection();

  if (recovery.isRequested()) {
    // Point d'accès de secours + portail captif + serveur web dédié. On s'arrête là : ni Somfy, ni
    // MQTT, ni plannings, ni pile réseau normale. loop() est court-circuité de la même façon.
    recovery.begin();
    return;
  }

  if (WiFi.status() == WL_CONNECTED) WiFi.disconnect(true);
  delay(10);

  Serial.println();
  webServer.startup();
  webServer.begin();
  // Serveur HTTP synchrone dédié aux opérations OTA GitHub bloquantes (/getReleases,
  // /downloadFirmware) -- isolé d'ESPAsyncWebServer/async_tcp, cf. son commentaire d'en-tête pour
  // le pourquoi (audit heap OTA, 14-15/08/2026).
  WebGitSync::begin();
  // Pas de temporisation entre le démarrage des serveurs et celui du réseau (L1.1 de l'audit de
  // performance du 26/08/2026). Un `delay(1000)` occupait cette place depuis le tout premier commit,
  // sans commentaire ni justification au milieu d'un fichier qui documente tout le reste -- signe
  // d'une attente empirique jamais requalifiée. Rien ne l'appelle : `server.begin()`,
  // `apiServer.begin()` et `gitSyncServer.begin()` ne font qu'ouvrir des sockets d'écoute et rendent
  // la main immédiatement, et aucune des trois n'a de travail asynchrone en cours à ce point (la
  // tâche async_tcp elle-même est créée par le premier begin(), déjà passé). Mesuré : 1,00 s de
  // démarrage, sur les 28,8 s d'alors.
  net.setup();
  somfy.begin();
  schedule.begin();
  // Après somfy.begin() : la broche du témoin est refusée si elle est déjà prise par la radio ou
  // par un relais de volet, ce qui suppose que leur configuration soit chargée.
  statusLed.begin();

  esp_task_wdt_init(WDT_TIMEOUT_SEC, true); // enable panic so ESP32 restarts
  esp_task_wdt_add(NULL);      // add current thread to WDT watch
}

void loop() {
  // PREMIÈRE instruction, avant même le court-circuit du mode Récupération : c'est l'intervalle
  // entre deux appels qui constitue la mesure de cadence, elle doit donc couvrir tous les chemins
  // de la boucle sans exception (cf. SysDiag.h).
  SysDiag::loopTick();

  // En mode Récupération, rien du fonctionnement nominal ne doit tourner : le watchdog n'a pas été
  // armé (setup() sort avant) et aucun sous-système n'a été démarré.
  if (recovery.isActive()) { recovery.loop(); return; }

  // Fenêtre de détection des coupures d'alimentation (L1.2 de l'audit de performance du
  // 26/08/2026). Elle courait autrefois derrière une attente bloquante de setup() ; elle court
  // désormais ICI, en parallèle du reste du démarrage, pour la même durée exactement. No-op dès
  // qu'elle est refermée, c'est-à-dire au bout de BOOT_TIMEOUT et pour tout le reste de la vie de
  // l'appareil. En tête de boucle, avant le chemin de redémarrage ci-dessous : le témoin doit être
  // entretenu à cadence régulière.
  recovery.loopDetection();

  if (rebootDelay.reboot && (int32_t)(millis() - rebootDelay.rebootTime) >= 0) {
    if(settings.enableDebugLogs) {
      Serial.print("Rebooting after ");
      Serial.print(rebootDelay.rebootTime);
      Serial.println("ms");
    }
    // Un redémarrage VOLONTAIRE n'est pas une coupure d'alimentation : la fenêtre est refermée avant
    // de partir, sinon le compteur de cycles resterait incrémenté (cf. closeDetection()).
    recovery.closeDetection();
    net.end();
    ESP.restart();
    return;
  }
  uint32_t timing = millis();

  // En tête de boucle et sans condition : c'est cette extinction différée qui rend blink() non
  // bloquant pour ses appelants, dont l'émission RF au timing critique.
  statusLed.loop();

  net.loop();
  if (millis() - timing > 100) {
    DBG_PRINTF("Timing Net: %ldms\n", millis() - timing);
  }

  timing = millis();
  esp_task_wdt_reset();
  somfy.loop();

  if (millis() - timing > 100) {
    DBG_PRINTF("Timing Somfy: %ldms\n", millis() - timing);
  }

  timing = millis();
  esp_task_wdt_reset();
  // Fonctionne indépendamment de la connectivité réseau : ne dépend que de l'horloge
  // locale (déjà synchronisée par NTP puis conservée par la RTC entre deux synchros).
  schedule.loop();

  if (millis() - timing > 100) {
    DBG_PRINTF("Timing Schedule: %ldms\n", millis() - timing);
  }

  timing = millis();
  esp_task_wdt_reset();

  if (net.connected() || net.softAPOpened) {
    // Recensement des connexions (audit capacité multi-clients, 18/08/2026). Placé AVANT le dump de
    // référence ci-dessous, pour que la première ligne [CONN] du journal date d'avant lui : c'est
    // elle qui atteste que la référence a bien été prise à zéro client, condition de validité de
    // tout le protocole de mesure par paliers.
    DiagConn::loop();
    esp_task_wdt_reset();
    // Dump de RÉFÉRENCE du tas, une seule fois par démarrage (audit heap, 17/08/2026). Pris ici, et
    // pas au moment du GOT_IP : d'une part setConnected() s'exécute sur la tâche d'évènements
    // Arduino/WiFi (mauvais endroit pour une sortie série de ~140 lignes), d'autre part le délai
    // laisse SSDP, mDNS et MQTT terminer leurs propres allocations de démarrage -- sans quoi la
    // référence contiendrait des trous qui se rempliraient juste après, brouillant le diff.
    // Le point de mesure visé est celui où ESP.getMaxAllocHeap() vaut encore ~98 Ko sur une région
    // de 113 840, c'est-à-dire AVANT la première connexion TLS et, idéalement, avant tout
    // chargement de page : pour un diff propre, garder le navigateur fermé pendant ces 3 secondes.
    // Sans effet hors `enableDebugLogs` (testé dans dumpHeapBlocks).
    static uint32_t heapBaselineSince = 0;
    static bool heapBaselineDone = false;
    if (!heapBaselineDone && net.connected()) {
      if (heapBaselineSince == 0) heapBaselineSince = millis();
      else if ((int32_t)(millis() - heapBaselineSince) >= 3000) {
        heapBaselineDone = true;
        ConfigSettings::dumpHeapBlocks("reference post-boot reseau");
      }
    }
    if (!rebootDelay.reboot && net.connected() && !net.softAPOpened) {
      git.loop();
      esp_task_wdt_reset();
    }
    // webServer.loop() retiré (P-3, 24/08/2026) : no-op depuis la bascule ESPAsyncWebServer, qui
    // sert les requêtes dans sa propre tâche sans polling. Web::sendCacheHeaders() et Web::end(),
    // vides pour les mêmes raisons, ont disparu avec lui.
    // handleClient() peut bloquer plusieurs secondes ici (fetch GitHub synchrone d'un
    // /getReleases ou /downloadFirmware en cours) -- assumé, ce serveur est isolé
    // d'ESPAsyncWebServer/async_tcp et ne partage aucune ressource avec eux, cf. WebGitSync.cpp.
    WebGitSync::loop();
    esp_task_wdt_reset();

    if (millis() - timing > 100) {
      DBG_PRINTF("Timing WebServer: %ldms\n", millis() - timing);
    }

    // Pas de sockEmit.loop() ici (audit heap, 17/08/2026) : net.loop() ci-dessus l'appelle déjà, à
    // chaque itération et sans condition (cf. fin de Network::loop()). Le second appel était un
    // doublon pur -- sans conséquence fonctionnelle, mais il faisait passer deux fois par la section
    // critique du verrou socket par tour de boucle.
    esp_task_wdt_reset();
    timing = millis();
  }

  if (rebootDelay.reboot && (int32_t)(millis() - rebootDelay.rebootTime) >= 0) {
    recovery.closeDetection();   // même raison qu'en tête de boucle
    net.end();
    ESP.restart();
  }
  esp_task_wdt_reset();
}
