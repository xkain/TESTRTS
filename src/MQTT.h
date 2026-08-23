#ifndef MQTT_H
#define MQTT_H
#include <Arduino.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

class MQTTClass {
private:
  const char* makeTopic(const char* topic);

public:
  uint32_t lastConnect = 0;
  // Dernier code mqttClient.state() déjà signalé sur la liaison série, pour n'émettre le
  // diagnostic d'échec qu'au CHANGEMENT de motif et non à chacune des tentatives (une toutes les
  // 10 s). Initialisé à MQTT_DISCONNECTED (-1), valeur que state() ne rend jamais sur un échec de
  // connexion : le tout premier échec est donc toujours signalé.
  int lastConnState = -1;
  bool suspended = false;
  // Aligné sur MQTTSettings::clientId : l'identifiant saisi par l'utilisateur doit y tenir sans
  // être tronqué en silence, ce qui donnerait au courtier un nom différent de celui affiché.
  char clientId[65] = {'\0'};

  bool begin();
  bool loop();
  bool end();
  bool connect();
  bool disconnect();
  bool connected();
  void reset();
  bool unpublish(const char *topic);
  bool publish(const char *topic, const char *payload, bool retain = false);
  bool publish(const char *topic, uint8_t val, bool retain = false);
  bool publish(const char *topic, int8_t val, bool retain = false);
  bool publish(const char *topic, uint32_t val, bool retain = false);
  bool publish(const char *topic, uint16_t val, bool retain = false);
  bool publish(const char *topic, bool val, bool retain = false);
  bool publishBuffer(const char *topic, uint8_t *data, uint16_t len, bool retain = false);
  bool publishDisco(const char *topic, JsonObject &obj, bool retain = false);
  bool subscribe(const char *topic);
  bool unsubscribe(const char *topic);
  static void receive(const char *topic, byte *payload, uint32_t length);
};
#endif
