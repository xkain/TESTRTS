#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "ConfigSettings.h"
#include "MQTT.h"
#include "somfy/Somfy.h"
#include "Network.h"
#include "Utils.h"

WiFiClient tcpClient;
PubSubClient mqttClient(tcpClient);

#define MQTT_MAX_RESPONSE 2048
static char g_content[MQTT_MAX_RESPONSE];

extern ConfigSettings settings;
extern SomfyShadeController somfy;
extern Network net;
extern rebootDelay_t rebootDelay;

// Protège mqttClient / g_content / le buffer statique de makeTopic() contre les accès concurrents :
// aujourd'hui tout tourne sur la même tâche (aucun effet), mais après migration ESPAsyncWebServer
// des handlers Web pourront appeler mqtt.publish() (via shade->emitCommand()) depuis la tâche
// async_tcp pendant que net.loop() -> mqtt.loop() continue sur la tâche principale. Récursif car
// connect()/publishDisco()/les surcharges numériques de publish() s'appellent entre elles depuis la
// MÊME tâche. Contrairement à SocketEmitter (verrou tenu à travers l'appelant), chaque méthode ici
// est autonome : un simple RAII (MqttLockGuard) suffit, y compris sur les retours anticipés.
static SemaphoreHandle_t g_mqttMutex = xSemaphoreCreateRecursiveMutex();
struct MqttLockGuard {
  MqttLockGuard() { xSemaphoreTakeRecursive(g_mqttMutex, portMAX_DELAY); }
  ~MqttLockGuard() { xSemaphoreGiveRecursive(g_mqttMutex); }
};

const char* MQTTClass::makeTopic(const char* topic) {
  static char top[128];
  // Le repli d'origine, quand le topic racine était vide, publiait ET S'ABONNAIT à la racine du
  // courtier : `shades/+/target/set` devenait alors un topic global, que n'importe quel autre
  // client du courtier pouvait écrire pour piloter les volets -- l'inverse exact de ce à quoi
  // sert ce champ. MQTTSettings garantit désormais un topic racine non vide (contrôlé à la
  // saisie, comblé à l'enregistrement comme au chargement) ; ce comblement-ci n'est qu'une
  // ceinture de sécurité pour un chemin d'écriture qui aurait été oublié.
  if(settings.MQTT.rootTopic[0] == '\0') settings.MQTT.ensureRootTopic();
  snprintf(top, sizeof(top), "%s/%s", settings.MQTT.rootTopic, topic);
  return top;
}

bool MQTTClass::begin() { MqttLockGuard lock; this->suspended = false; return true; }
bool MQTTClass::end() { MqttLockGuard lock; this->suspended = true; this->disconnect(); return true; }
void MQTTClass::reset() { MqttLockGuard lock; this->disconnect(); this->lastConnect = 0; this->connect(); }

bool MQTTClass::loop() {
  MqttLockGuard lock;
  if(settings.MQTT.enabled && !rebootDelay.reboot && !this->suspended && !mqttClient.connected()) {
    esp_task_wdt_reset();
    if(net.connected()) this->connect();
  }
  esp_task_wdt_reset();
  if(settings.MQTT.enabled) mqttClient.loop();
  return true;
}

void MQTTClass::receive(const char *topic, byte* payload, uint32_t length) {
  esp_task_wdt_reset();

  if(!topic || !payload) return;
  uint16_t len = strlen(topic);
  // Sans ce contrôle, un topic vide donne `ndx = (uint16_t)(0 - 1)` = 65535 et la remontée
  // ci-dessous part lire 64 Ko en aval du tampon du courtier avant de retomber sur un '/'.
  // Une trame PUBLISH sans nom de topic est invalide au sens du protocole, mais elle arrive
  // jusqu'ici telle quelle : c'est le courtier (ou ce qui se fait passer pour lui) qui la
  // fournit, pas nous.
  if(len == 0) return;
  uint16_t ndx = len - 1;
  uint8_t slashes = 0;
  while(ndx > 0 && slashes < 4) {
    if(topic[ndx] == '/') slashes++;
    if(slashes < 4) ndx--;
  }

  char entityType[10], entityId[5], command[32], value[11];
  auto extract = [&](char* dest, size_t dlen) {
    while(ndx < len && topic[ndx] == '/') ndx++;
    size_t i = 0;
    while(ndx < len && topic[ndx] != '/' && i < dlen - 1) dest[i++] = topic[ndx++];
    dest[i] = '\0';
  };

  extract(entityType, sizeof(entityType));
  extract(entityId, sizeof(entityId));
  extract(command, sizeof(command));

  size_t vlen = (length < sizeof(value) - 1) ? length : sizeof(value) - 1;
  memcpy(value, payload, vlen);
  value[vlen] = '\0';
  // atoi() rend 0 sur tout ce qu'il ne sait pas lire, sans le dire. Publier "ON", "open" ou une
  // charge utile vide sur `shades/N/target/set` faisait donc partir le volet à la position 0
  // -- grand ouvert -- au lieu d'être ignoré : le pire comportement possible pour une commande
  // mal formée. strtol() plus contrôle que TOUTE la chaîne a été consommée (espaces de fin
  // tolérés, certains clients MQTT en ajoutent) : ce qui n'est pas un entier n'est plus une
  // commande.
  char *endp = nullptr;
  long lval = strtol(value, &endp, 10);
  while(*endp == ' ' || *endp == '\t' || *endp == '\r' || *endp == '\n') endp++;
  if(endp == value || *endp != '\0') return;
  // Les bornes par commande sont posées plus bas ; ce premier écrêtage évite seulement qu'un
  // entier hors plage int déborde à la conversion.
  int val = (int)constrain(lval, -1000L, 1000L);

  if(strcmp(entityType, "shades") == 0) {
    SomfyShade* shade = somfy.getShadeById(atoi(entityId));
    if (shade) {
      // Écrêtage explicite de chaque commande : la valeur vient du réseau, et les setters en
      // aval supposent tous une plage déjà validée.
      if(strcmp(command, "target") == 0) shade->moveToTarget(shade->transformPosition(constrain(val, 0, 100)));
      else if(strcmp(command, "tiltTarget") == 0) shade->moveToTiltTarget(constrain(val, 0, 100));
      else if(strcmp(command, "direction") == 0) {
        if(val < 0) shade->sendCommand(somfy_commands::Up);
        else if(val > 0) shade->sendCommand(somfy_commands::Down);
        else shade->sendCommand(somfy_commands::My);
      }
      // -1 est la valeur conventionnelle "pas de position My definie", d'ou la borne basse.
      else if(strcmp(command, "mypos") == 0) shade->setMyPosition(constrain(val, -1, 100));
      else if(strcmp(command, "myTiltPos") == 0) shade->setMyPosition(shade->myPos, constrain(val, -1, 100));
      else if(strcmp(command, "sunFlag") == 0) shade->sendCommand(val > 0 ? somfy_commands::SunFlag : somfy_commands::Flag);
      else if(strcmp(command, "position") == 0) {
        shade->target = shade->currentPos = shade->transformPosition((float)constrain(val, 0, 100));
        shade->emitState();
      }
      else if(strcmp(command, "tiltPosition") == 0) {
        shade->tiltTarget = shade->currentTiltPos = (float)constrain(val, 0, 100);
        shade->emitState();
      }
      else if(strcmp(command, "sunny") == 0) shade->sendSensorCommand(-1, constrain(val, 0, 1), shade->repeats);
      else if(strcmp(command, "windy") == 0) shade->sendSensorCommand(constrain(val, 0, 1), -1, shade->repeats);
    }
  }
  else if(strcmp(entityType, "groups") == 0) {
    SomfyGroup* group = somfy.getGroupById(atoi(entityId));
    if (group) {
      if(strcmp(command, "direction") == 0) {
        if(val < 0) group->sendCommand(somfy_commands::Up);
        else if(val > 0) group->sendCommand(somfy_commands::Down);
        else group->sendCommand(somfy_commands::My);
      }
      // M-9 de l'audit, corrigé le 23/08/2026 : les deux commandes étaient interverties par rapport
      // à la branche "shades" ci-dessus. La sémantique est sans ambiguïté dans SomfyDispatch.cpp --
      // `Flag` fait p_sunFlag(false) et `SunFlag` fait p_sunFlag(true) -- et l'appareil PUBLIE
      // `sunFlag: 1` quand le drapeau est actif (cf. SomfyExpose.cpp). Publier 1 sur
      // groups/<id>/sunFlag/set DÉSACTIVAIT donc le suivi soleil : l'aller-retour était rompu, une
      // domotique qui relisait 1 et le réécrivait à l'identique inversait l'état du groupe.
      else if(strcmp(command, "sunFlag") == 0) group->sendCommand(val > 0 ? somfy_commands::SunFlag : somfy_commands::Flag);
      else if(strcmp(command, "sunny") == 0) group->sendSensorCommand(-1, constrain(val, 0, 1), group->repeats);
      else if(strcmp(command, "windy") == 0) group->sendSensorCommand(constrain(val, 0, 1), -1, group->repeats);
    }
  }
  esp_task_wdt_reset();
}

bool MQTTClass::connect() {
  MqttLockGuard lock;
  esp_task_wdt_reset();
  if(mqttClient.connected()) return true;
  if(!settings.MQTT.enabled || this->suspended || ((int32_t)(millis() - this->lastConnect) < 10000)) return false;

  // Identifiant client de l'utilisateur s'il en a saisi un (certains courtiers indexent leurs
  // ACL dessus), sinon repli sur une valeur dérivée du MAC : unique par appareil, donc deux
  // boîtiers sur le même courtier ne se déconnectent jamais l'un l'autre.
  if(settings.MQTT.clientId[0] != '\0')
    strlcpy(this->clientId, settings.MQTT.clientId, sizeof(this->clientId));
  else {
    uint64_t mac = ESP.getEfuseMac();
    snprintf(this->clientId, sizeof(this->clientId), "client-%08x%08x", (uint32_t)((mac >> 32) & 0xFFFFFFFF), (uint32_t)(mac & 0xFFFFFFFF));
  }

  mqttClient.setServer(settings.MQTT.hostname, settings.MQTT.port);
  // Motif "réseau bloquant sur loopTask", 17/08/2026. MQTT_SOCKET_TIMEOUT vaut 15 SECONDES par
  // défaut dans PubSubClient (cf. PubSubClient.h) -- très exactement le seuil de panique
  // d'esp_task_wdt_init(). Or mqttClient.connect() ci-dessous ET mqttClient.loop() (appelé depuis
  // MQTTClass::loop(), donc depuis Network::loop(), donc sur la tâche principale) attendent leurs
  // octets à hauteur de ce plafond, sans que rien ne nourrisse le chien de garde pendant l'attente
  // : un courtier qui cesse de répondre en plein échange fait donc redémarrer l'appareil. Le reset
  // posé AVANT l'appel dans MQTTClass::loop() ne protège de rien, l'attente ayant lieu après.
  // 2 s : très au-dessus d'un aller-retour courtier normal (quelques ms sur un réseau local), et
  // assez bas pour qu'un courtier muet soit abandonné bien avant le watchdog. Posé ici plutôt que
  // dans begin() pour être réappliqué à chaque reconnexion, quel que soit le chemin emprunté.
  mqttClient.setSocketTimeout(2);
  // Horodatage posé AVANT la tentative, et non plus seulement en cas de succès. Avec l'ancien
  // ordre, `lastConnect` restait à 0 tant qu'aucune connexion n'avait jamais abouti : la garde des
  // 10 s ci-dessus ne bloquait donc rien et loop() relançait un connect() à CHAQUE tour de la
  // boucle principale, chacun coûtant jusqu'à setSocketTimeout(2) plus la résolution DNS. Courtier
  // éteint = tâche principale bloquée l'essentiel du temps, donc RF, planification et suivi de
  // position d'autant retardés -- exactement le motif "réseau bloquant sur loopTask" déjà corrigé
  // ailleurs, manqué sur ce site.
  this->lastConnect = millis();
  if(mqttClient.connect(this->clientId, settings.MQTT.username, settings.MQTT.password, makeTopic("status"), 0, true, "offline")) {
    this->publish("status", "online", true);
    this->publish("ipAddress", settings.IP.ip.toString().c_str(), true);
    this->publish("host", settings.hostname, true);
    this->publish("firmware", settings.fwVersion.name, true);
    this->publish("serverId", settings.serverId, true);
    this->publish("mac", net.mac);
    somfy.publish();

    this->subscribe("shades/+/target/set");
    this->subscribe("shades/+/tiltTarget/set");
    this->subscribe("shades/+/direction/set");
    this->subscribe("shades/+/mypos/set");
    this->subscribe("shades/+/myTiltPos/set");
    this->subscribe("shades/+/sunFlag/set");
    this->subscribe("shades/+/sunny/set");
    this->subscribe("shades/+/windy/set");
    this->subscribe("shades/+/position/set");
    this->subscribe("shades/+/tiltPosition/set");
    this->subscribe("groups/+/direction/set");
    this->subscribe("groups/+/sunFlag/set");
    this->subscribe("groups/+/sunny/set");
    this->subscribe("groups/+/windy/set");

    mqttClient.setCallback(MQTTClass::receive);
    // Une reconnexion réussie doit réarmer le diagnostic ci-dessous, sans quoi un courtier qui
    // retombe plus tard sur la MÊME erreur resterait silencieux.
    this->lastConnState = MQTT_CONNECTED;
    return true;
  }
  // Échec DIAGNOSTIQUÉ (audit du 23/08/2026). Ce chemin était muet : `return false` et rien
  // d'autre. L'utilisateur ne voyait que l'erreur socket du coeur ESP32 ("connect(): socket error
  // on fd 51, errno: 104"), qui ne dit ni l'hôte visé, ni le port, ni le motif MQTT -- impossible
  // de distinguer un courtier injoignable d'identifiants refusés sans instrumenter le firmware.
  //
  // mqttClient.state() porte précisément cette information (cf. PubSubClient.h) : -2 = la connexion
  // TCP elle-même a échoué (mauvais hôte/port, courtier éteint, pare-feu, ou listener TLS répondant
  // à un client en clair -- ce firmware ne fait QUE du MQTT non chiffré, cf. E-7), -4 = le courtier
  // a accepté la connexion mais n'a pas répondu à temps, 4 = identifiants refusés, 5 = non
  // autorisé.
  //
  // Émis une seule fois par MOTIF, pas à chaque tentative : la boucle réessaie toutes les 10 s,
  // et répéter la même ligne indéfiniment noierait le journal série -- c'est justement ce qui rend
  // l'erreur socket du coeur difficile à exploiter.
  int st = mqttClient.state();
  if(st != this->lastConnState) {
    this->lastConnState = st;
    Serial.printf("MQTT: connexion a %s:%u echouee (state=%d)%s\n",
      settings.MQTT.hostname, (unsigned)settings.MQTT.port, st,
      (st == MQTT_CONNECT_FAILED) ? " -- hote/port injoignable ou courtier attendant du TLS (non supporte)" :
      (st == MQTT_CONNECTION_TIMEOUT) ? " -- pas de reponse du courtier" :
      (st == MQTT_CONNECT_BAD_CREDENTIALS) ? " -- identifiants refuses" :
      (st == MQTT_CONNECT_UNAUTHORIZED) ? " -- non autorise par le courtier" : "");
  }
  return false;
}

bool MQTTClass::disconnect() {
  MqttLockGuard lock;
  if(mqttClient.connected()) {
    this->unsubscribe("shades/+/target/set");
    this->unsubscribe("shades/+/direction/set");
    this->unsubscribe("shades/+/tiltTarget/set");
    this->unsubscribe("shades/+/mypos/set");
    this->unsubscribe("shades/+/myTiltPos/set");
    this->unsubscribe("shades/+/sunFlag/set");
    this->unsubscribe("groups/+/direction/set");
    this->unsubscribe("shades/+/sunny/set");
    this->unsubscribe("shades/+/windy/set");
    this->unsubscribe("shades/+/position/set");
    this->unsubscribe("shades/+/tiltPosition/set");
    this->unsubscribe("groups/+/direction/set");
    this->unsubscribe("groups/+/sunFlag/set");
    this->unsubscribe("groups/+/sunny/set");
    this->unsubscribe("groups/+/windy/set");
    mqttClient.disconnect();
  }
  return true;
}

bool MQTTClass::subscribe(const char *topic) {
  MqttLockGuard lock;
  if(!mqttClient.connected()) return false;
  esp_task_wdt_reset();
  return mqttClient.subscribe(makeTopic(topic));
}

bool MQTTClass::unsubscribe(const char *topic) {
  MqttLockGuard lock;
  if(!mqttClient.connected()) return false;
  return mqttClient.unsubscribe(makeTopic(topic));
}

bool MQTTClass::publish(const char *topic, const char *payload, bool retain) {
  MqttLockGuard lock;
  if(!mqttClient.connected()) return false;
  esp_task_wdt_reset();
  return mqttClient.publish(makeTopic(topic), payload, retain);
}

bool MQTTClass::unpublish(const char *topic) {
  MqttLockGuard lock;
  if(!mqttClient.connected()) return false;
  esp_task_wdt_reset();
  return mqttClient.publish(makeTopic(topic), (const uint8_t *)"", 0, true);
}

bool MQTTClass::publish(const char *topic, uint32_t val, bool retain) { MqttLockGuard lock; itoa(val, g_content, 10); return this->publish(topic, g_content, retain); }
bool MQTTClass::publish(const char *topic, uint8_t val, bool retain) { MqttLockGuard lock; itoa(val, g_content, 10); return this->publish(topic, g_content, retain); }
bool MQTTClass::publish(const char *topic, uint16_t val, bool retain) { MqttLockGuard lock; itoa(val, g_content, 10); return this->publish(topic, g_content, retain); }
bool MQTTClass::publish(const char *topic, int8_t val, bool retain) { MqttLockGuard lock; itoa(val, g_content, 10); return this->publish(topic, g_content, retain); }
bool MQTTClass::publish(const char *topic, bool val, bool retain) { return this->publish(topic, val ? "true" : "false", retain); }

bool MQTTClass::publishBuffer(const char *topic, uint8_t *data, uint16_t len, bool retain) {
  MqttLockGuard lock;
  if(!mqttClient.connected()) return false;
  esp_task_wdt_reset();
  mqttClient.beginPublish(makeTopic(topic), len, retain);
  mqttClient.write(data, len);
  return mqttClient.endPublish();
}

bool MQTTClass::publishDisco(const char *topic, JsonObject &obj, bool retain) {
  MqttLockGuard lock;
  serializeJson(obj, g_content, sizeof(g_content));
  return this->publishBuffer(topic, (uint8_t *)g_content, strlen(g_content), retain);
}

bool MQTTClass::connected() { MqttLockGuard lock; return settings.MQTT.enabled && mqttClient.connected(); }
