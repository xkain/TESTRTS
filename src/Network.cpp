#include <ETH.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <esp_task_wdt.h>
#include <esp_heap_caps.h>   // heap_caps_get_largest_free_block() -- cf. emitHeap()
#include "ConfigSettings.h"
#include "Network.h"
#include "web/Web.h"
#include "Sockets.h"
#include "Utils.h"
#include "SSDP.h"
#include "MQTT.h"

extern ConfigSettings settings;
extern Web webServer;
extern SocketEmitter sockEmit;
extern MQTTClass mqtt;
extern rebootDelay_t rebootDelay;
extern Network net;
extern SomfyShadeController somfy;

static unsigned long _lastHeapEmit = 0;

static bool _apScanning = false;
static uint32_t _lastMaxHeap = 0;
static uint32_t _lastHeap = 0;
int connectRetries = 0;
void Network::end() {
  SSDP.end();
  mqtt.end();
  sockEmit.end();
  delay(100);
}
bool Network::setup() {
  WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN);
  WiFi.setSortMethod(WIFI_CONNECT_AP_BY_SIGNAL);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.onEvent(this->networkEvent);
  this->disconnectTime = millis();
  if(WiFi.status() == WL_CONNECTED) WiFi.disconnect(true, true);
  if(settings.connType == conn_types_t::wifi || settings.connType == conn_types_t::unset) {
    WiFi.persistent(false);
    if(settings.hostname[0] != '\0') WiFi.setHostname(settings.hostname);
    Serial.print("WiFi Mode: ");
    Serial.println(WiFi.getMode());
    WiFi.mode(WIFI_STA);
  }
  sockEmit.begin();
  return true;
}
conn_types_t Network::preferredConnType() {
  switch(settings.connType) {
    case conn_types_t::wifi:    
      return settings.WIFI.ssid[0] != '\0' ? conn_types_t::wifi : conn_types_t::ap;
    case conn_types_t::unset:
    case conn_types_t::ap:
      return conn_types_t::ap;
    case conn_types_t::ethernetpref:
      return settings.WIFI.ssid[0] != '\0' && (!ETH.linkUp() && this->ethStarted) ? conn_types_t::wifi : conn_types_t::ethernet;
    case conn_types_t::ethernet:
      return ETH.linkUp() || !this->ethStarted ? conn_types_t::ethernet : conn_types_t::ap;
    default:
      return settings.connType; 
  }
}
void Network::loop() {
  // ORDER OF OPERATIONS:
  // ----------------------------------------------
  // 1. If we are in the middle of a connection process we need to simply bail after the connect method.  The
  //    connect method will take care of our target connection for us.
  // 2. Check to see what type of target connection we need.  
  //    a. If this is an ethernet target then the connection needs to perform a fallback if applicable.
  //    b. If this is a wifi target then we need to first check to see if the SSID is available.
  //    c. If an SSID has not been set then we need to turn on the Soft AP.
  // 3. If the Soft AP is open and the target is either wifi, ethernet, or ethernetpref then
  //    we need to shut it down if there are no connections and the preferred connection is available.
  //    a. Ethernet: Check for an active ethernet connection.  We cannot rely on linkup because the PHY will
  //       report that the link is up when no IP address is being served.
  //    b. WiFi: Perform synchronous scan for APs related to the SSID.  If the SSID can be found then perform
  //       the connection process for the WiFi connection.
  //    c. SoftAP: This condition retains the Soft AP because no other connection method is available.
  conn_types_t ctype = this->preferredConnType();
  this->connect(ctype); // Connection timeout handled in connect function as well as the opening of the Soft AP if needed.
  if(this->connecting()) return; // If we are currently attempting to connect to something then we need to bail here.
  if(_apScanning) {
    if(settings.WIFI.hidden ||
      (this->connected() && !settings.WIFI.roaming) ||
      (ctype != conn_types_t::wifi)) {

      DBG_PRINTLN("Cancelling WiFi STA Scan...");
      _apScanning = false;
      WiFi.scanDelete();
      }
    else {
      int16_t n = WiFi.scanComplete();
      if( n >= 0) { // If the scan is complete but the WiFi isn't ready this can return 0.
        uint8_t bssid[6];
        int32_t channel = 0;
        if(this->getStrongestAP(settings.WIFI.ssid, bssid, &channel)) {
          if(!WiFi.BSSID() || memcmp(bssid, WiFi.BSSID(), sizeof(bssid)) != 0) {
            if(!this->connected()) {
              DBG_PRINTF("Connecting to AP %02X:%02X:%02X:%02X:%02X:%02X CH: %d\n", bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5], channel);
              this->connectWiFi(bssid, channel);
            }
            else {
              DBG_PRINTF("Found stronger AP %02X:%02X:%02X:%02X:%02X:%02X CH: %d\n", bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5], channel);
              this->changeAP(bssid, channel);
            }
          }
        }
        _apScanning = false;
      }
    }
  }
  if(!this->connecting() && !settings.WIFI.hidden) {
    // Permettre le scan en tâche de fond même si quelqu'un est sur le softAP
    if((this->softAPOpened) || (!this->connected() && ctype == conn_types_t::wifi)) {
      if(ctype == conn_types_t::wifi) {
        if(!_apScanning && WiFi.scanNetworks(true, false, true, 300, 0, settings.WIFI.ssid) == -1) {
          _apScanning = true;
        }
      }
    }
    else if(this->connected() && ctype == conn_types_t::wifi && settings.WIFI.roaming) {
      if((int32_t)(millis() - this->lastWifiScan) >= (int32_t)SSID_SCAN_INTERVAL) {
        if(!_apScanning && WiFi.scanNetworks(true, false, true, 300, 0, settings.WIFI.ssid) == -1) {
          _apScanning = true;
          this->lastWifiScan = millis();
        }
      }
    }
  }
  if(millis() - this->lastEmit > 1500) {
    // Post our connection status if needed.
    this->lastEmit = millis();
    if(this->connected()) {
      this->emitSockets();
      this->lastEmit = millis();
    }
    esp_task_wdt_reset(); // Make sure we do not reboot here.
  }
  
  sockEmit.loop();
  mqtt.loop();
  if(settings.ssdpBroadcast && this->connected()) {
    if(!SSDP.isStarted) SSDP.begin();
    if(SSDP.isStarted) SSDP.loop();
  }
  else if(!settings.ssdpBroadcast && SSDP.isStarted) SSDP.end();
}
bool Network::changeAP(const uint8_t *bssid, const int32_t channel) {
  esp_task_wdt_reset(); // Make sure we do not reboot here.
  if(SSDP.isStarted) SSDP.end();
  mqtt.disconnect();
  //sockEmit.end();
  WiFi.disconnect(false, true);
  this->connType = conn_types_t::unset;
  this->_connecting = true;
  this->connectStart = millis();
  WiFi.begin(settings.WIFI.ssid, settings.WIFI.passphrase, channel, bssid);
  this->connectStart = millis();
  return false;
}
void Network::emitSockets() {
  this->emitHeap();
  if(this->needsBroadcast || 
    (this->connType == conn_types_t::wifi && (abs(abs(WiFi.RSSI()) - abs(this->lastRSSI)) > 1 || WiFi.channel() != this->lastChannel))) {
    this->emitSockets(255);
    sockEmit.loop();
    this->needsBroadcast = false;
  }
}
void Network::emitSockets(uint8_t num) {
  if(this->connType == conn_types_t::ethernet) {
      JsonSockEvent *json = sockEmit.beginEmit("ethernet");
      json->beginObject();
      json->addElem("connected", this->connected());
      json->addElem("speed", ETH.linkSpeed());
      json->addElem("fullduplex", ETH.fullDuplex());
      json->endObject();
      sockEmit.endEmit(num);
  }
  else {
      if(WiFi.status() == WL_CONNECTED) {
        JsonSockEvent *json = sockEmit.beginEmit("wifiStrength");
        json->beginObject();
        json->addElem("ssid", WiFi.SSID().c_str());
        json->addElem("strength", (int32_t)WiFi.RSSI());
        json->addElem("channel", (int32_t)this->channel);
        json->endObject();
        sockEmit.endEmit(num);
        this->lastRSSI = WiFi.RSSI();
        this->lastChannel = WiFi.channel();
      }
      else {
        JsonSockEvent *json = sockEmit.beginEmit("wifiStrength");
        json->beginObject();
        json->addElem("ssid", "");
        json->addElem("strength", (int8_t)-100);
        json->addElem("channel", (int8_t)-1);
        json->endObject();
        sockEmit.endEmit(num);
        
        json = sockEmit.beginEmit("ethernet");
        json->beginObject();
        json->addElem("connected", false);
        json->addElem("speed", (uint8_t)0);
        json->addElem("fullduplex", false);
        json->endObject();
        sockEmit.endEmit(num);
        this->lastRSSI = -100;
        this->lastChannel = -1;
      }
  }
  this->emitHeap(num);
}

void Network::setConnected(conn_types_t connType) {
  esp_task_wdt_reset();
  this->connType = connType;
  this->connectTime = this->connectedAt = millis();
  connectRetries = 0;

  DBG_PRINTLN(F("Net: Connected")); // Version courte

  if(this->connType == conn_types_t::wifi) {
    // dès qu'on est connecté au Wi-Fi local, on coupe le hotspot AP sans condition sur le nombre de clients connectés
    if(this->softAPOpened) {
      WiFi.softAPdisconnect(true);
      WiFi.mode(WIFI_STA);
    }
    this->_connecting = false;
    strlcpy(this->ssid, WiFi.SSID().c_str(), sizeof(this->ssid));
    strlcpy(this->mac, WiFi.BSSIDstr().c_str(), sizeof(this->mac));
    this->strength = WiFi.RSSI();
    this->channel = WiFi.channel();
    this->connectAttempts++;
  }
  else if(this->connType == conn_types_t::ethernet) {
    if(this->softAPOpened) {
      WiFi.softAPdisconnect(true);
      WiFi.mode(WIFI_OFF);
    }
    this->connectAttempts++;
    this->_connecting = false;
    this->wifiFallback = false;
  }

  esp_task_wdt_reset();

  // Affichage minimaliste de la réussite
  if(this->connectAttempts == 1) {
    bool isWifi = (this->connType == conn_types_t::wifi);
    Serial.print(isWifi ? F("WiFi: ") : F("ETH: "));
    Serial.println(isWifi ? WiFi.localIP() : ETH.localIP());

    if(settings.IP.dhcp) {
      IPAddress ip = isWifi ? WiFi.localIP() : ETH.localIP();
      settings.IP.ip = ip;
      settings.IP.subnet = isWifi ? WiFi.subnetMask() : ETH.subnetMask();
      settings.IP.gateway = isWifi ? WiFi.gatewayIP() : ETH.gatewayIP();
      settings.IP.dns1 = isWifi ? WiFi.dnsIP(0) : ETH.dnsIP(0);
      settings.IP.dns2 = isWifi ? WiFi.dnsIP(1) : ETH.dnsIP(1);
    }

    if(!isWifi) {
      JsonSockEvent *json = sockEmit.beginEmit("ethernet");
      json->beginObject();
      json->addElem("connected", true);
      json->addElem("speed", ETH.linkSpeed());
      json->addElem("fullduplex", ETH.fullDuplex());
      json->endObject();
      sockEmit.endEmit();
    }
  }
  SSDP.setHTTPPort(80);
  SSDP.setSchemaURL(0, "upnp.xml");
  SSDP.setChipId(0, this->getChipId());
  SSDP.setDeviceType(0, "urn:schemas-xkain-org:device:Somfy:1"); // Raccourci
  SSDP.setName(0, settings.hostname);
  SSDP.setModelName(0, "SomfyRTS"); // Raccourci

  SSDP.setModelNumber(0, (strlen(settings.chipModel) == 0) ? "ESP32" : settings.chipModel);

  SSDP.setModelURL(0, "https://git.io/xkain"); // URL courte
  SSDP.setManufacturer(0, "xkain");
  SSDP.setURL(0, "/");
  SSDP.setActive(0, true);

  esp_task_wdt_reset();

  if(MDNS.begin(settings.hostname)) {
    MDNS.addService("http", "tcp", 80);
    MDNS.addService("espsomfy_rts", "tcp", 8080);

    MDNS.addServiceTxt("espsomfy_rts", "tcp", "serverId", (const char*)settings.serverId);
    MDNS.addServiceTxt("espsomfy_rts", "tcp", "model", "ESPSomfyRTS");
    MDNS.addServiceTxt("espsomfy_rts", "tcp", "version", (const char*)settings.fwVersion.name);
  }

  if(settings.ssdpBroadcast) SSDP.begin();
  else if(SSDP.isStarted) SSDP.end();

  esp_task_wdt_reset();
  this->emitSockets();
  this->needsBroadcast = true;
}
bool Network::connectWired() {
  if(ETH.linkUp()) {
    // If the ethernet link is re-established then we need to shut down wifi.
    if(WiFi.status() == WL_CONNECTED) {
      //sockEmit.end();
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
    }
    if(this->connType != conn_types_t::ethernet) this->setConnected(conn_types_t::ethernet);
    return true;
  }
  else if(this->ethStarted) {
    // There is no wired connection so we need to fallback if appropriate.
    if(settings.connType == conn_types_t::ethernetpref && settings.WIFI.ssid[0] != '\0')
      return this->connectWiFi();
  }
  if(this->connectAttempts > 0) {
    DBG_PRINTF("Ethernet Connection Lost... %d Reconnecting ", this->connectAttempts);
    DBG_PRINTLN(this->mac);
  }
  else
    DBG_PRINTLN("Connecting to Wired Ethernet");
  this->_connecting = true;
  this->connTarget = conn_types_t::ethernet;
  this->connType = conn_types_t::unset;
  if(!this->ethStarted) {
    // Currently the ethernet module will leak memory if you call begin more than once.
    this->ethStarted = true;
    WiFi.mode(WIFI_OFF);
    if(settings.hostname[0] != '\0') 
      ETH.setHostname(settings.hostname);
    else
      ETH.setHostname("ESPSomfy-RTS");
    DBG_PRINT("Set hostname to:");
    DBG_PRINTLN(ETH.getHostname());
    if(!ETH.begin(settings.Ethernet.phyAddress, settings.Ethernet.PWRPin, settings.Ethernet.MDCPin, settings.Ethernet.MDIOPin, settings.Ethernet.phyType, settings.Ethernet.CLKMode)) { 
      Serial.println("Ethernet Begin failed");
      this->ethStarted = false;
      if(settings.connType == conn_types_t::ethernetpref) {
        this->wifiFallback = true;
        return connectWiFi();
      }
      return false;
    }
    else {
      if(!settings.IP.dhcp) {
        if(!ETH.config(settings.IP.ip, settings.IP.gateway, settings.IP.subnet, settings.IP.dns1, settings.IP.dns2)) {
          Serial.println("Unable to configure static IP address....");
          ETH.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, INADDR_NONE);
        }
      }
      else
        ETH.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, INADDR_NONE);
    }
  }
  this->connectStart = millis();
  return true;
}
void Network::updateHostname() {
  if(settings.hostname[0] != '\0' && this->connected()) {
    if(this->connType == conn_types_t::ethernet &&
      strcmp(settings.hostname, ETH.getHostname()) != 0) {
      DBG_PRINTF("Updating host name to %s...\n", settings.hostname);
      ETH.setHostname(settings.hostname);
      MDNS.setInstanceName(settings.hostname);        
      SSDP.setName(0, settings.hostname);
     }
     else if(strcmp(settings.hostname, WiFi.getHostname()) != 0) {
      DBG_PRINTF("Updating host name to %s...\n", settings.hostname);
      WiFi.setHostname(settings.hostname);
      MDNS.setInstanceName(settings.hostname);        
      SSDP.setName(0, settings.hostname);
     }
  }
}
bool Network::connectWiFi(const uint8_t *bssid, const int32_t channel) {
  // On ne bloque la connexion au réseau local QUE si on n'a PAS de cible définie (bssid et channel).
  // Si l'utilisateur vient de cliquer sur Enregistrer, bssid et channel sont fournis, donc on ignore la sécurité et on fonce.
  if(!bssid && this->softAPOpened && WiFi.softAPgetStationNum() > 0) {
    WiFi.disconnect(false);
    this->_connecting = false;
    this->connType = conn_types_t::unset;
    return true;
  }
  WiFi.setSleep(false);
  if(!settings.IP.dhcp) {
    if(!WiFi.config(settings.IP.ip, settings.IP.gateway, settings.IP.subnet, settings.IP.dns1, settings.IP.dns2))
      WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, INADDR_NONE);
  }
  else
      WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, INADDR_NONE);
  if(settings.hostname[0] != '\0') WiFi.setHostname(settings.hostname);
  delay(100);
  
  if(bssid && channel > 0) {
    if(WiFi.status() == WL_CONNECTED && WiFi.SSID().compareTo(settings.WIFI.ssid) == 0
      && WiFi.channel() == channel) {
      this->disconnected = 0;
      return true;
    }
    this->connTarget = conn_types_t::wifi;
    this->connType = conn_types_t::unset;
    DBG_PRINTLN("WiFi begin...");
    this->_connecting = true;
    WiFi.begin(settings.WIFI.ssid, settings.WIFI.passphrase, channel, bssid);
    this->connectStart = millis();
  }
  else if(settings.WIFI.ssid[0] != '\0') {
    if(WiFi.status() == WL_CONNECTED && WiFi.SSID().compareTo(settings.WIFI.ssid) == 0) {
      // If we are connected to the target SSID then just return.
      this->disconnected = 0;
      this->_connecting = true;
      return true;
    }
    if(this->_connecting) return true;
    this->_connecting = true;
    this->connTarget = conn_types_t::wifi;
    this->connType = conn_types_t::unset;
    if(this->connectAttempts > 0) {
      DBG_PRINT("Connection Lost...");
      DBG_PRINT(this->mac);
      DBG_PRINT(" CH:");
      DBG_PRINT(this->channel);
      DBG_PRINT(" (");
      DBG_PRINT(this->strength);
      DBG_PRINTLN("dbm)  ");
    }
    else DBG_PRINTLN("Connecting to AP");
    delay(100);
    // There is also another method simply called hostname() but this is legacy for esp8266.
    if(settings.hostname[0] != '\0') WiFi.setHostname(settings.hostname);
    DBG_PRINT("Set hostname to:");
    DBG_PRINTLN(WiFi.getHostname());
    WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN);
    WiFi.setSortMethod(WIFI_CONNECT_AP_BY_SIGNAL);
    uint8_t _bssid[6];
    int32_t _channel = 0;
    if(!settings.WIFI.hidden && this->getStrongestAP(settings.WIFI.ssid, _bssid, &_channel)) {
      DBG_PRINTF("Found strongest AP %02X:%02X:%02X:%02X:%02X:%02X CH:%d\n", _bssid[0], _bssid[1], _bssid[2], _bssid[3], _bssid[4], _bssid[5], _channel);
      WiFi.begin(settings.WIFI.ssid, settings.WIFI.passphrase, _channel, _bssid);
    }
    else
      // If the user has the hidden flag set just connect to whatever the AP gives us.
      WiFi.begin(settings.WIFI.ssid, settings.WIFI.passphrase);
  }
  this->connectStart = millis();
  return true;
}
bool Network::connect(conn_types_t ctype) {
  esp_task_wdt_reset();
  if(this->connecting()) return true;
  if(this->disconnectTime == 0) this->disconnectTime = millis();
  if(ctype == conn_types_t::ethernet && this->connType != conn_types_t::ethernet) {
    // Here we need to call the connect to ethernet.
    this->connectWired();
  }
  else if(ctype == conn_types_t::ap || (!this->connected() && (int32_t)(millis() - this->disconnectTime) >= (int32_t)CONNECT_TIMEOUT)) {
    if(!this->softAPOpened && !this->openingSoftAP) {
      this->disconnectTime = millis();
      this->openSoftAP();
    }
    else if(this->softAPOpened && !this->openingSoftAP && 
      (ctype == conn_types_t::wifi && this->connType != conn_types_t::wifi && settings.WIFI.hidden)) {
      // When thge softAP is open then we need to try to connect to wifi repeatedly if the user connects to a hidden SSID.
      this->connectWiFi();
    }
  }
  else if((ctype == conn_types_t::wifi && this->connType != conn_types_t::wifi && settings.WIFI.hidden)) {
    this->connectWiFi();
  }
  
  return true;
}
uint32_t Network::getChipId() {
  uint32_t chipId = 0;
  uint64_t mac = ESP.getEfuseMac();
  for(int i=0; i<17; i=i+8) {
    chipId |= ((mac >> (40 - i)) & 0xff) << i;
  }
  return chipId;
}
bool Network::getStrongestAP(const char *ssid, uint8_t *bssid, int32_t *channel) {
  // The new AP must be at least 10dbm greater.
  int32_t strength = this->connected() ? WiFi.RSSI() + 10 : -127;
  int32_t chan = -1;
  memset(bssid, 0x00, 6);
  esp_task_wdt_delete(NULL);
  int16_t n = WiFi.scanComplete();
  //int16_t n = this->connected() ? WiFi.scanComplete() : WiFi.scanNetworks(false, false, false, 300, 0, ssid);
  esp_task_wdt_add(NULL);
  for(int16_t i = 0; i < n; i++) {
    if(WiFi.SSID(i).compareTo(ssid) == 0) {
      if(WiFi.RSSI(i) > strength) { 
        strength = WiFi.RSSI(i); 
        memcpy(bssid, WiFi.BSSID(i), 6); 
        *channel = chan = WiFi.channel(i);
      }
    }
  }  
  WiFi.scanDelete();
  return chan > 0;
}
bool Network::openSoftAP() {
  if(this->softAPOpened || this->openingSoftAP) return true;
  if(this->connected()) WiFi.disconnect(false);
  this->openingSoftAP = true;
  DBG_PRINTLN();
  DBG_PRINTLN("Turning the HotSpot On");
  esp_task_wdt_reset(); // Make sure we do not reboot here.
  // WPA2 exige soit un mot de passe vide (ouvert), soit 8-63 caractères. Une valeur invalide
  // en NVS (jamais censée arriver via l'UI, mais on se protège quand même) ferait échouer
  // WiFi.softAP() en silence et laisserait le point d'accès de secours ouvert : on retombe
  // alors sur le mot de passe par défaut plutôt que de risquer un hotspot non protégé.
  size_t apPassLen = strlen(settings.WIFI.apPassword);
  const char *apPass = (apPassLen == 0 || (apPassLen >= 8 && apPassLen < 64)) ? settings.WIFI.apPassword : "espsomfyrts";
  WiFi.softAP(strlen(settings.hostname) > 0 ? settings.hostname : "ESPSomfy RTS", apPass);
  delay(200);
  return true;
}
bool Network::connected() {
  if(this->connecting()) return false;
  else if(this->connType == conn_types_t::unset) return false;
  else if(this->connType == conn_types_t::wifi) return WiFi.status() == WL_CONNECTED;
  else if(this->connType == conn_types_t::ethernet) return ETH.linkUp();
  else return this->connType != conn_types_t::unset;
  return false;
}
bool Network::connecting() {
  if(this->_connecting && (int32_t)(millis() - this->connectStart) >= (int32_t)CONNECT_TIMEOUT) this->_connecting = false;
  return this->_connecting; 
}
void Network::clearConnecting() { this->_connecting = false; }
void Network::networkEvent(WiFiEvent_t event) {
  switch(event) {
    case ARDUINO_EVENT_WIFI_READY:           DBG_PRINTLN(F("WiFi ready")); break;
    case ARDUINO_EVENT_WIFI_SCAN_DONE:
      DBG_PRINTF("WiFi scan done (%d)\n", WiFi.scanComplete());
      net.lastWifiScan = millis();
      break;
    case ARDUINO_EVENT_WIFI_STA_START:
      DBG_PRINTLN(F("WiFi started"));
      if(settings.hostname[0] != '\0') WiFi.setHostname(settings.hostname);
      break;
    case ARDUINO_EVENT_WIFI_STA_STOP:         DBG_PRINTLN(F("WiFi stopped")); break;
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:    DBG_PRINTLN(F("WiFi connected")); break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      DBG_PRINTF("WiFi disconnected (%d)\n", net.connecting());
      net.connType = conn_types_t::unset;
      net.disconnectTime = millis();
      net.clearConnecting();
      break;
    case ARDUINO_EVENT_WIFI_STA_AUTHMODE_CHANGE: DBG_PRINTLN(F("WiFi auth changed")); break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      DBG_PRINT(F("WiFi IP: "));
      DBG_PRINTLN(WiFi.localIP());
      net.connType = conn_types_t::wifi;
      net.connectTime = millis();
      net.setConnected(conn_types_t::wifi);
      break;
    case ARDUINO_EVENT_WIFI_STA_LOST_IP:        DBG_PRINTLN(F("WiFi lost IP")); break;
    case ARDUINO_EVENT_ETH_GOT_IP:
      if(WiFi.status() == WL_CONNECTED) WiFi.disconnect(true);
      DBG_PRINT(F("Ethernet IP: "));
    DBG_PRINTLN(ETH.localIP());
    net.connectTime = millis();
    net.connType = conn_types_t::ethernet;
    if(settings.IP.dhcp) {
      settings.IP.ip = ETH.localIP();
      settings.IP.subnet = ETH.subnetMask();
      settings.IP.gateway = ETH.gatewayIP();
      settings.IP.dns1 = ETH.dnsIP(0);
      settings.IP.dns2 = ETH.dnsIP(1);
    }
    net.setConnected(conn_types_t::ethernet);
    break;
    case ARDUINO_EVENT_ETH_CONNECTED:    DBG_PRINTLN(F("Ethernet connected")); break;
    case ARDUINO_EVENT_ETH_DISCONNECTED:
      DBG_PRINTLN(F("Ethernet disconnected"));
      net.connType = conn_types_t::unset;
      net.disconnectTime = millis();
      net.clearConnecting();
      break;
    case ARDUINO_EVENT_ETH_START:
      DBG_PRINTLN(F("Ethernet started"));
      net.ethStarted = true;
      break;
    case ARDUINO_EVENT_ETH_STOP:
      DBG_PRINTLN(F("Ethernet stopped"));
      net.connType = conn_types_t::unset;
      net.ethStarted = false;
      break;
    case ARDUINO_EVENT_WIFI_AP_START:
      DBG_PRINT(F("Access Point started: "));
      DBG_PRINTLN(WiFi.softAPIP());
      net.openingSoftAP = false;
      net.softAPOpened = true;
      net.apOpenedAt = millis();
      break;
    case ARDUINO_EVENT_WIFI_AP_STOP:
      if(!net.openingSoftAP) DBG_PRINTLN(F("Access Point stopped"));
      net.softAPOpened = false;
      net.apOpenedAt = 0;
    break;
    default:
      if(event > ARDUINO_EVENT_ETH_START)
        DBG_PRINTF("Ethernet event %d\n", event);
    break;
  }
}
void Network::emitHeap(uint8_t num) {
  bool bEmit = false;
  bool bTimeEmit = millis() - _lastHeapEmit > 15000;
  bool bRoomEmit = false;
  bool bValEmit = false;
  if(num != 255 || this->needsBroadcast) bEmit = true;
  if(millis() - _lastHeapEmit > 15000) bTimeEmit = true;
  uint32_t freeHeap = ESP.getFreeHeap();
  uint32_t maxHeap = ESP.getMaxAllocHeap();
  uint32_t minHeap = ESP.getMinFreeHeap();
  // Instrumentation temporaire (audit mémoire OTA) : cette fonction est appelée depuis
  // Network::loop() toutes les ~1500ms tant que l'appareil est connecté (cf. emitSockets()) --
  // résolution suffisante pour repérer, entre deux tics, QUELLE action utilisateur (ajout de
  // volet, sauvegarde d'un planning, prog RF...) fait chuter ESP.getMaxAllocHeap() de façon
  // significative et durable, indépendamment de tout appel GitOTA. `_lastMaxHeapTick` est mis à
  // jour à CHAQUE appel (contrairement à _lastMaxHeap plus bas, qui ne l'est que dans la branche
  // broadcast) pour ne rater aucune chute entre deux tics.
  static uint32_t _lastMaxHeapTick = 0;
  if(settings.enableDebugLogs && _lastMaxHeapTick != 0 && maxHeap + 1000 < _lastMaxHeapTick) {
    Serial.printf("[HEAP-DEBUG] Max Heap chute de %u -> %u (-%u) à t=%lums\n",
      _lastMaxHeapTick, maxHeap, _lastMaxHeapTick - maxHeap, millis());
  }
  // Contrepartie de la ligne "chute" ci-dessus (audit heap OTA, 15/08/2026) : sans elle, un
  // silence dans le log après une chute est ambigu (heap resté bas VS remonté sans que rien ne le
  // signale, cf. emitHeap() qui ne loggue par ailleurs qu'un statut broadcast au mieux toutes les
  // ~10-15s). Même seuil (1000) que la chute, pour rester symétrique.
  else if(settings.enableDebugLogs && _lastMaxHeapTick != 0 && maxHeap > _lastMaxHeapTick + 1000) {
    Serial.printf("[HEAP-DEBUG] Max Heap reprise de %u -> %u (+%u) à t=%lums\n",
      _lastMaxHeapTick, maxHeap, maxHeap - _lastMaxHeapTick, millis());
  }
  // Détecteur de PLATEAU (audit heap, 17/08/2026). Le dump détaillé n'était jusqu'ici déclenché que
  // par le franchissement du seuil TLS dans GitOTA -- or un plateau peut s'installer juste
  // AU-DESSUS de ce seuil (observé : chute de 98292 à 47092, non résorbée, sans qu'aucun
  // diagnostic ne parte puisque 47092 > 46080). On instrumente donc le phénomène lui-même plutôt
  // qu'un de ses symptômes : une chute significative qui ne s'est pas résorbée au bout de
  // PLATEAU_SETTLE_MS est, par définition, un plateau -- c'est le moment exact où photographier le
  // tas, car les allocations responsables viennent de se figer.
  // Une seule fois par démarrage : le premier plateau est l'intéressant (il détermine le régime
  // permanent), les suivants n'apprennent rien et le dump est volumineux.
  #define PLATEAU_DROP_MIN_BYTES 8192
  #define PLATEAU_SETTLE_MS 20000
  static uint32_t _plateauFrom = 0;   // niveau d'avant la chute en cours de surveillance
  static uint32_t _plateauSince = 0;
  static bool _plateauDumped = false;
  if(!_plateauDumped && _lastMaxHeapTick != 0) {
    if(_plateauFrom == 0) {
      if(maxHeap + PLATEAU_DROP_MIN_BYTES < _lastMaxHeapTick) {
        _plateauFrom = _lastMaxHeapTick;
        _plateauSince = millis();
      }
    }
    else if(maxHeap + PLATEAU_DROP_MIN_BYTES >= _plateauFrom) {
      _plateauFrom = 0;   // résorbé : comportement nominal, rien à signaler
    }
    else if((uint32_t)(millis() - _plateauSince) >= PLATEAU_SETTLE_MS) {
      _plateauDumped = true;
      Serial.printf("[HEAP] PLATEAU confirme : %u -> %u (-%u) toujours non resorbe apres %us\n",
        (unsigned)_plateauFrom, (unsigned)maxHeap, (unsigned)(_plateauFrom - maxHeap),
        (unsigned)(PLATEAU_SETTLE_MS / 1000));
      ConfigSettings::dumpHeapBlocks("plateau confirme");
      _plateauFrom = 0;
    }
  }
  _lastMaxHeapTick = maxHeap;
  if(abs((int)(freeHeap - _lastHeap)) > 3500) bValEmit = true;
  if(abs((int)(maxHeap - _lastMaxHeap)) > 3500) bValEmit = true;
  bRoomEmit = sockEmit.activeClients(0) > 0;
  if(bValEmit) bTimeEmit = millis() - _lastHeapEmit > 10000;
  if(bEmit || bTimeEmit || bRoomEmit || bValEmit) {
    JsonSockEvent *json = sockEmit.beginEmit("memStatus");
    json->beginObject();
    json->addElem("max", maxHeap);
    json->addElem("free", freeHeap);
    json->addElem("min", minHeap);
    json->addElem("total", ESP.getHeapSize());
    // `largest` (audit heap, 17/08/2026) : plus gros bloc CONTIGU disponible. C'est cette valeur, et
    // non `free`, qui décide de la faisabilité d'une poignée de main TLS (mbedTLS réclame ~45 Ko d'un
    // seul tenant, cf. GIT_TLS_MIN_HEAP_BYTES dans GitOTA.cpp). L'écart entre `free` et `largest` est
    // la mesure directe de la fragmentation : c'est l'information qui manquait pour diagnostiquer à
    // distance le plateau bas intermittent, jusqu'ici visible seulement sur le port série d'un
    // appareil en mode debug. Champ purement additif -- une UI qui l'ignore reste compatible.
    json->addElem("largest", (uint32_t)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
    json->endObject();
    if(num == 255 && bTimeEmit && bValEmit) {
      sockEmit.endEmit(num);
      _lastHeapEmit = millis();
      _lastHeap = freeHeap;
      _lastMaxHeap = maxHeap;
      //Serial.printf("BROAD HEAP: Emit:%d TimeEmit:%d ValEmit:%d\n", bEmit, bTimeEmit, bValEmit);
    }
    else if(num != 255) {
      sockEmit.endEmit(num);
      //Serial.printf("TARGET HEAP %d: Emit:%d TimeEmit:%d ValEmit:%d\n", num, bEmit, bTimeEmit, bValEmit);
    }
    else if(bRoomEmit) {
      sockEmit.endEmitRoom(0);
      //Serial.printf("ROOM HEAP: Emit:%d TimeEmit:%d ValEmit:%d\n", bEmit, bTimeEmit, bValEmit);
    }
    else {
      // Aucune des trois conditions ci-dessus ne correspond (ex: bEmit seul, sur num==255) --
      // il faut tout de même clore l'événement JSON ouvert par beginEmit() ci-dessus, sous peine
      // de laisser sockEmit dans un état ouvert (verrou de section critique jamais relâché une
      // fois la protection multi-tâches introduite -- cf. SocketEmitter::beginEmit/endEmit).
      sockEmit.endEmit(num);
    }
  }
}
