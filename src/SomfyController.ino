#include <Arduino.h>
#include <WiFi.h>
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include "ConfigSettings.h"
#include "Network.h"
#include "Web.h"
#include "Sockets.h"
#include "Utils.h"
#include "Somfy.h"
#include "MQTT.h"
#include "GitOTA.h"
#include "Recovery.h"
#include "Schedule.h"
#include "StatusLed.h"

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

  // Arme la détection des coupures d'alim successives (et la LED si LED_PIN != -1). Ne bloque pas :
  // le montage du filesystem et le chargement des réglages ci-dessous se font PENDANT la fenêtre de
  // détection, de sorte qu'un démarrage nominal n'en paie pas le coût en plus.
  recovery.beginDetection();

  Serial.println("Mounting File System...");
  if (LittleFS.begin()) {
    Serial.println("File system mounted successfully");
  } else {
    // Échec toléré : le mode Récupération sert justement à réparer ce cas, et sa page est
    // embarquée dans le binaire (cf. RecoveryPage.h) donc indépendante du filesystem.
    Serial.println("Error mounting file system");
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
  delay(1000);
  net.setup();
  somfy.begin();
  schedule.begin();
  // Après somfy.begin() : la broche du témoin est refusée si elle est déjà prise par la radio ou
  // par un relais de volet, ce qui suppose que leur configuration soit chargée.
  statusLed.begin();

  esp_task_wdt_init(15, true); // enable panic so ESP32 restarts
  esp_task_wdt_add(NULL);      // add current thread to WDT watch
}

void loop() {
  // En mode Récupération, rien du fonctionnement nominal ne doit tourner : le watchdog n'a pas été
  // armé (setup() sort avant) et aucun sous-système n'a été démarré.
  if (recovery.isActive()) { recovery.loop(); return; }

  if (rebootDelay.reboot && (int32_t)(millis() - rebootDelay.rebootTime) >= 0) {
    if(settings.enableDebugLogs) {
      Serial.print("Rebooting after ");
      Serial.print(rebootDelay.rebootTime);
      Serial.println("ms");
    }
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
    if (!rebootDelay.reboot && net.connected() && !net.softAPOpened) {
      git.loop();
      esp_task_wdt_reset();
    }
    webServer.loop();
    esp_task_wdt_reset();

    if (millis() - timing > 100) {
      DBG_PRINTF("Timing WebServer: %ldms\n", millis() - timing);
    }

    esp_task_wdt_reset();
    timing = millis();
    sockEmit.loop();

    if (millis() - timing > 100) {
      DBG_PRINTF("Timing Socket: %ldms\n", millis() - timing);
    }

    esp_task_wdt_reset();
    timing = millis();
  }

  if (rebootDelay.reboot && (int32_t)(millis() - rebootDelay.rebootTime) >= 0) {
    net.end();
    ESP.restart();
  }
  esp_task_wdt_reset();
}
