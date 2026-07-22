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

  // Gère les coupures d'alim successives (et configure la LED automatiquement si LED_PIN != -1)
  handlePowerCycleReset();

  Serial.println("Mounting File System...");
  if (LittleFS.begin()) {
    Serial.println("File system mounted successfully");
  } else {
    Serial.println("Error mounting file system");
  }

  if (_pendingFactory) performFactoryReset();
  settings.begin();
  if (_pendingNetSecuRecovery) resetAccessAndNetworkConfig();
  if (WiFi.status() == WL_CONNECTED) WiFi.disconnect(true);
  delay(10);

  Serial.println();
  webServer.startup();
  webServer.begin();
  delay(1000);
  net.setup();
  somfy.begin();
  schedule.begin();

  esp_task_wdt_init(15, true); // enable panic so ESP32 restarts
  esp_task_wdt_add(NULL);      // add current thread to WDT watch
}

void loop() {
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
