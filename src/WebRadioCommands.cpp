#include <WebServer.h>
#include "ConfigSettings.h"
#include "Utils.h"
#include "Somfy.h"
#include "WResp.h"
#include "Web.h"
#include "WebCommon.h"
#include "WebRadioCommands.h"

extern ConfigSettings settings;
extern SomfyShadeController somfy;
extern Web webServer;

namespace WebRadioCommands {
  void handleShadeCommand(WebServer& server) {
    webServer.sendCORSHeaders(server);
    if (server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, false)) return;
    HTTPMethod method = server.method();
    uint8_t shadeId = 255;
    uint8_t target = 255;
    uint8_t stepSize = 0;
    int8_t repeat = -1;
    somfy_commands command = somfy_commands::My;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if (server.hasArg("shadeId")) {
        shadeId = atoi(server.arg("shadeId").c_str());
        if (server.hasArg("command")) command = translateSomfyCommand(server.arg("command"));
        else if (server.hasArg("target")) target = atoi(server.arg("target").c_str());
        if (server.hasArg("repeat")) repeat = atoi(server.arg("repeat").c_str());
        if(server.hasArg("stepSize")) stepSize = atoi(server.arg("stepSize").c_str());
      }
      else if (server.hasArg("plain")) {
        DBG_PRINTLN("Sending Shade Command");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}"));
          if (obj.containsKey("command")) {
              String scmd = obj["command"];
              command = translateSomfyCommand(scmd);
          }
          else if (obj.containsKey("target")) {
              target = obj["target"].as<uint8_t>();
          }
          if (obj.containsKey("repeat")) repeat = obj["repeat"].as<uint8_t>();
          if(obj.containsKey("stepSize")) stepSize = obj["stepSize"].as<uint8_t>();
        }
      }
      else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}"));
      SomfyShade* shade = somfy.getShadeById(shadeId);
      if (shade) {
        if(settings.enableDebugLogs) {
          Serial.print("Received:");
          Serial.println(server.arg("plain"));
        }
        // Send the command to the shade.
        if (target <= 100)
            shade->moveToTarget(shade->transformPosition(target));
        else
            shade->sendCommand(command, repeat > 0 ? repeat : shade->repeats, stepSize);
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        shade->toJSONRef(resp);
        resp.endObject();
        resp.endResponse();
      }
      else {
          server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Shade with the specified id not found.\"}"));
      }
    }
    else
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}"));
  }

  void handleRepeatCommand(WebServer& server) {
    webServer.sendCORSHeaders(server);
    HTTPMethod method = server.method();
    if (method == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, false)) return;
    uint8_t shadeId = 255;
    uint8_t groupId = 255;
    uint8_t stepSize = 0;
    int8_t repeat = -1;
    somfy_commands command = somfy_commands::My;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if(server.hasArg("shadeId")) shadeId = atoi(server.arg("shadeId").c_str());
      else if(server.hasArg("groupId")) groupId = atoi(server.arg("groupId").c_str());
      if(server.hasArg("command")) command = translateSomfyCommand(server.arg("command"));
      if(server.hasArg("repeat")) repeat = atoi(server.arg("repeat").c_str());
      if(server.hasArg("stepSize")) stepSize = atoi(server.arg("stepSize").c_str());
      if(shadeId == 255 && groupId == 255 && server.hasArg("plain")) {
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          if(obj.containsKey("groupId")) groupId = obj["groupId"];
          if(obj.containsKey("stepSize")) stepSize = obj["stepSize"];
          if (obj.containsKey("command")) {
              String scmd = obj["command"];
              command = translateSomfyCommand(scmd);
          }
          if (obj.containsKey("repeat")) repeat = obj["repeat"].as<uint8_t>();
        }
      }
      if(shadeId != 255) {
        SomfyShade *shade = somfy.getShadeById(shadeId);
        if(!shade) {
          server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Shade reference could not be found.\"}"));
          return;
        }
        if(shade->shadeType == shade_types::garage1 && command == somfy_commands::Prog) command = somfy_commands::Toggle;
        if(!shade->isLastCommand(command)) {
          // We are going to send this as a new command.
          shade->sendCommand(command, repeat >= 0 ? repeat : shade->repeats, stepSize);
        }
        else {
          shade->repeatFrame(repeat >= 0 ? repeat : shade->repeats);
        }
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginArray();
        shade->toJSONRef(resp);
        resp.endArray();
        resp.endResponse();
      }
      else if(groupId != 255) {
        SomfyGroup * group = somfy.getGroupById(groupId);
        if(!group) {
          server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Group reference could not be found.\"}"));
          return;
        }
        if(!group->isLastCommand(command)) {
          // We are going to send this as a new command.
          group->sendCommand(command, repeat >= 0 ? repeat : group->repeats, stepSize);
        }
        else
          group->repeatFrame(repeat >= 0 ? repeat : group->repeats);
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        group->toJSONRef(resp);
        resp.endObject();
        resp.endResponse();
      }
    }
    else {
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}"));
    }
  }

  void handleGroupCommand(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, false)) return;
    HTTPMethod method = server.method();
    uint8_t groupId = 255;
    uint8_t stepSize = 0;
    int8_t repeat = -1;
    somfy_commands command = somfy_commands::My;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if (server.hasArg("groupId")) {
        groupId = atoi(server.arg("groupId").c_str());
        if (server.hasArg("command")) command = translateSomfyCommand(server.arg("command"));
        if(server.hasArg("repeat")) repeat = atoi(server.arg("repeat").c_str());
        if(server.hasArg("stepSize")) stepSize = atoi(server.arg("stepSize").c_str());
      }
      else if (server.hasArg("plain")) {
        DBG_PRINTLN("Sending Group Command");
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("groupId")) groupId = obj["groupId"];
          else {
            server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No group id was supplied.\"}"));
            return;
          }
          if (obj.containsKey("command")) {
            String scmd = obj["command"];
            command = translateSomfyCommand(scmd);
          }
          if(obj.containsKey("repeat")) repeat = obj["repeat"].as<uint8_t>();
          if(obj.containsKey("stepSize")) stepSize = obj["stepSize"].as<uint8_t>();
        }
      }
      else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No group object supplied.\"}"));
      SomfyGroup * group = somfy.getGroupById(groupId);
      if (group) {
        if(settings.enableDebugLogs) {
          Serial.print("Received:");
          Serial.println(server.arg("plain"));
        }
        // Send the command to the group.
        group->sendCommand(command, repeat >= 0 ? repeat : group->repeats, stepSize);
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        group->toJSONRef(resp);
        resp.endObject();
        resp.endResponse();
      }
      else {
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Group with the specified id not found.\"}"));
      }
    }
    else
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}"));
  }

  void handleTiltCommand(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, false)) return;
    HTTPMethod method = server.method();
    uint8_t shadeId = 255;
    uint8_t target = 255;
    somfy_commands command = somfy_commands::My;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if (server.hasArg("shadeId")) {
        shadeId = atoi(server.arg("shadeId").c_str());
        if (server.hasArg("command")) command = translateSomfyCommand(server.arg("command"));
        else if(server.hasArg("target")) target = atoi(server.arg("target").c_str());
      }
      else if (server.hasArg("plain")) {
        DBG_PRINTLN("Sending Shade Tilt Command");
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}"));
          if (obj.containsKey("command")) {
            String scmd = obj["command"];
            command = translateSomfyCommand(scmd);
          }
          else if(obj.containsKey("target")) {
            target = obj["target"].as<uint8_t>();
          }
        }
      }
      else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}"));
      SomfyShade* shade = somfy.getShadeById(shadeId);
      if (shade) {
        if(settings.enableDebugLogs) {
          Serial.print("Received:");
          Serial.println(server.arg("plain"));
        }
        // Send the command to the shade.
        if(target <= 100)
          shade->moveToTiltTarget(shade->transformPosition(target));
        else
          shade->sendTiltCommand(command);
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        shade->toJSONRef(resp);
        resp.endObject();
        resp.endResponse();
      }
      else {
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Shade with the specified id not found.\"}"));
      }
    }
    else
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}"));
  }

  void handleSetPositions(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, false)) return;
    uint8_t shadeId = (server.hasArg("shadeId")) ? atoi(server.arg("shadeId").c_str()) : 255;
    int8_t pos = (server.hasArg("position")) ? atoi(server.arg("position").c_str()) : -1;
    int8_t tiltPos = (server.hasArg("tiltPosition")) ? atoi(server.arg("tiltPosition").c_str()) : -1;
    if(server.hasArg("plain")) {
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, server.arg("plain"));
      if (err) {
        webServer.handleDeserializationError(server, err);
        return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        if(obj.containsKey("shadeId")) shadeId = obj["shadeId"];
        if(obj.containsKey("position")) pos = obj["position"];
        if(obj.containsKey("tiltPosition")) tiltPos = obj["tiltPosition"];
      }
    }
    if(shadeId != 255) {
      SomfyShade *shade = somfy.getShadeById(shadeId);
      if(shade) {
        if(pos >= 0) shade->target = shade->currentPos = pos;
        if(tiltPos >= 0 && shade->tiltType != tilt_types::none) shade->tiltTarget = shade->currentTiltPos = tiltPos;
        shade->emitState();
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        shade->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
      else
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"An invalid shadeId was provided\"}"));
    }
    else {
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"shadeId was not provided\"}"));
    }
  }

  void handleSetSensor(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, false)) return;
    uint8_t shadeId = (server.hasArg("shadeId")) ? atoi(server.arg("shadeId").c_str()) : 255;
    uint8_t groupId = (server.hasArg("groupId")) ? atoi(server.arg("groupId").c_str()) : 255;
    int8_t sunny = (server.hasArg("sunny")) ? toBoolean(server.arg("sunny").c_str(), false) ? 1 : 0 : -1;
    int8_t windy = (server.hasArg("windy")) ? atoi(server.arg("windy").c_str()) : -1;
    int8_t repeat = (server.hasArg("repeat")) ? atoi(server.arg("repeat").c_str()) : -1;
    if(server.hasArg("plain")) {
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, server.arg("plain"));
      if (err) {
        webServer.handleDeserializationError(server, err);
        return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        if(obj.containsKey("shadeId")) shadeId = obj["shadeId"].as<uint8_t>();
        if(obj.containsKey("groupId")) groupId = obj["groupId"].as<uint8_t>();
        if(obj.containsKey("sunny")) {
          if(obj["sunny"].is<bool>())
            sunny = obj["sunny"].as<bool>() ? 1 : 0;
          else
            sunny = obj["sunny"].as<int8_t>();
        }
        if(obj.containsKey("windy")) {
          if(obj["windy"].is<bool>())
            windy = obj["windy"].as<bool>() ? 1 : 0;
          else
            windy = obj["windy"].as<int8_t>();
        }
        if(obj.containsKey("repeat")) repeat = obj["repeat"].as<uint8_t>();
      }
    }
    if(shadeId != 255) {
      SomfyShade *shade = somfy.getShadeById(shadeId);
      if(shade) {
        shade->sendSensorCommand(windy, sunny, repeat >= 0 ? (uint8_t)repeat : shade->repeats);
        shade->emitState();
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        shade->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
      else
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"An invalid shadeId was provided\"}"));

    }
    else if(groupId != 255) {
      SomfyGroup *group = somfy.getGroupById(groupId);
      if(group) {
        group->sendSensorCommand(windy, sunny, repeat >= 0 ? (uint8_t)repeat : group->repeats);
        group->emitState();
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        group->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
      else
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"An invalid groupId was provided\"}"));
    }
    else {
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"shadeId was not provided\"}"));
    }
  }

  static void handleSetMyPosition(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    HTTPMethod method = server.method();
    uint8_t shadeId = 255;
    int8_t pos = -1;
    int8_t tilt = -1;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if (server.hasArg("shadeId")) {
        shadeId = atoi(server.arg("shadeId").c_str());
        if(server.hasArg("pos")) pos = atoi(server.arg("pos").c_str());
        if(server.hasArg("tilt")) tilt = atoi(server.arg("tilt").c_str());
      }
      else if (server.hasArg("plain")) {
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}"));
          if(obj.containsKey("pos")) pos = obj["pos"].as<int8_t>();
          if(obj.containsKey("tilt")) tilt = obj["tilt"].as<int8_t>();
        }
      }
      else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}"));
      SomfyShade* shade = somfy.getShadeById(shadeId);
      if (shade) {
        // Send the command to the shade.
        if(tilt < 0) tilt = shade->myPos;
        if(shade->tiltType == tilt_types::none) tilt = -1;
        if(pos >= 0 && pos <= 100)
          shade->setMyPosition(shade->transformPosition(pos), shade->transformPosition(tilt));
          JsonResponse resp;
          resp.beginResponse(&server, g_content, sizeof(g_content));
          resp.beginObject();
          shade->toJSONRef(resp);
          resp.endObject();
          resp.endResponse();
      }
      else {
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Shade with the specified id not found.\"}"));
      }
    }
    else
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}"));
  }

  static void handleSetRollingCode(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    HTTPMethod method = server.method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      uint8_t shadeId = 255;
      uint16_t rollingCode = 0;
      if (server.hasArg("plain")) {
        // Its coming in the body.
        StaticJsonDocument<129> doc;
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          if(obj.containsKey("rollingCode")) rollingCode = obj["rollingCode"];
        }
      }
      else if (server.hasArg("shadeId")) {
        shadeId = atoi(server.arg("shadeId").c_str());
        rollingCode = atoi(server.arg("rollingCode").c_str());
      }
      SomfyShade* shade = nullptr;
      if (shadeId != 255) shade = somfy.getShadeById(shadeId);
      if (!shade) {
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Shade not found to set rolling code\"}"));
      }
      else {
        shade->setRollingCode(rollingCode);
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        shade->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
    }
  }

  static void handleSetPaired(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    uint8_t shadeId = 255;
    bool paired = false;
    if(server.hasArg("plain")) {
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, server.arg("plain"));
      if(err) {
          webServer.handleDeserializationError(server, err);
          return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
        if(obj.containsKey("paired")) paired = obj["paired"];
      }
    }
    else if (server.hasArg("shadeId"))
      shadeId = atoi(server.arg("shadeId").c_str());
    if(server.hasArg("paired"))
      paired = toBoolean(server.arg("paired").c_str(), false);
    SomfyShade* shade = nullptr;
    if (shadeId != 255) shade = somfy.getShadeById(shadeId);
    if (!shade) {
      server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Shade not found to pair\"}"));
    }
    else {
      shade->paired = paired;
      shade->save();
      JsonResponse resp;
      resp.beginResponse(&server, g_content, sizeof(g_content));
      resp.beginObject();
      shade->toJSON(resp);
      resp.endObject();
      resp.endResponse();
    }
  }

  static void handleUnpairShade(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    HTTPMethod method = server.method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      uint8_t shadeId = 255;
      if (server.hasArg("plain")) {
        // Its coming in the body.
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
        }
      }
      else if (server.hasArg("shadeId"))
        shadeId = atoi(server.arg("shadeId").c_str());
      SomfyShade* shade = nullptr;
      if (shadeId != 255) shade = somfy.getShadeById(shadeId);
      if (!shade) {
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Shade not found to unpair\"}"));
      }
      else {
        if(shade->bitLength == 56)
          shade->sendCommand(somfy_commands::Prog, 7);
        else
          shade->sendCommand(somfy_commands::Prog, 1);
        shade->paired = false;
        shade->save();
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginObject();
        shade->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
    }
  }

  static void handleLinkRepeater(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    HTTPMethod method = server.method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      // We are adding a linked repeater.
      uint32_t address = 0;
      if (server.hasArg("plain")) {
        DBG_PRINTLN("Linking a repeater");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("address")) address = obj["address"];
          else if(obj.containsKey("remoteAddress")) address = obj["remoteAddress"];
        }
      }
      else if(server.hasArg("address"))
        address = atoi(server.arg("address").c_str());
      if(address == 0)
          server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No repeater address was supplied.\"}"));
      else {
        somfy.linkRepeater(address);
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginArray();
        somfy.toJSONRepeaters(resp);
        resp.endArray();
        resp.endResponse();
      }
    }
  }

  static void handleUnlinkRepeater(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    HTTPMethod method = server.method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      // We are adding a linked repeater.
      uint32_t address = 0;
      if (server.hasArg("plain")) {
        DBG_PRINTLN("Unlinking a repeater");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("address")) address = obj["address"];
          else if(obj.containsKey("remoteAddress")) address = obj["remoteAddress"];
        }
      }
      else if(server.hasArg("address"))
        address = atoi(server.arg("address").c_str());
      if(address == 0)
          server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No repeater address was supplied.\"}"));
      else {
        somfy.unlinkRepeater(address);
        JsonResponse resp;
        resp.beginResponse(&server, g_content, sizeof(g_content));
        resp.beginArray();
        somfy.toJSONRepeaters(resp);
        resp.endArray();
        resp.endResponse();
      }
    }
  }

  static void handleUnlinkRemote(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    HTTPMethod method = server.method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      // We are updating an existing shade by adding a linked remote.
      if (server.hasArg("plain")) {
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) {
            SomfyShade* shade = somfy.getShadeById(obj["shadeId"]);
            if (shade) {
              if (obj.containsKey("remoteAddress")) {
                shade->unlinkRemote(obj["remoteAddress"]);
              }
              else {
                server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Remote address not provided.\"}"));
              }
              JsonResponse resp;
              resp.beginResponse(&server, g_content, sizeof(g_content));
              resp.beginObject();
              shade->toJSON(resp);
              resp.endObject();
              resp.endResponse();
            }
            else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Shade Id not found.\"}"));
          }
          else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}"));
        }
      }
      else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No remote object supplied.\"}"));
    }
  }

  static void handleLinkRemote(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    HTTPMethod method = server.method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      // We are updating an existing shade by adding a linked remote.
      if (server.hasArg("plain")) {
        DBG_PRINTLN("Linking a remote");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) {
            SomfyShade* shade = somfy.getShadeById(obj["shadeId"]);
            if (shade) {
              if (obj.containsKey("remoteAddress")) {
                if (obj.containsKey("rollingCode")) shade->linkRemote(obj["remoteAddress"], obj["rollingCode"]);
                else shade->linkRemote(obj["remoteAddress"]);
              }
              else {
                server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Remote address not provided.\"}"));
              }
              JsonResponse resp;
              resp.beginResponse(&server, g_content, sizeof(g_content));
              resp.beginObject();
              shade->toJSON(resp);
              resp.endObject();
              resp.endResponse();
            }
            else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"Shade Id not found.\"}"));
          }
          else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}"));
        }
      }
      else server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No remote object supplied.\"}"));
    }
  }

  static void handleSaveRadio(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) return server.send(200);
    if(!webServer.isAuthenticated(server, true)) return;

    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, server.arg("plain"))) return server.send(400, "text/plain", F("J-Err"));

    if (server.method() == HTTP_POST || server.method() == HTTP_PUT) {
      JsonObject obj = doc.as<JsonObject>();
      somfy.transceiver.fromJSON(obj);
      somfy.transceiver.save();

      JsonResponse resp;
      resp.beginResponse(&server, g_content, sizeof(g_content));
      resp.beginObject();
      somfy.transceiver.toJSON(resp);
      resp.endObject();
      resp.endResponse();
    } else {
      server.send(405, _encoding_json, F("{\"s\":\"ERR\"}"));
    }
  }

  static void handleGetRadio(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginObject();
    somfy.transceiver.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleSendRemoteCommand(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    HTTPMethod method = server.method();
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      somfy_frame_t frame;
      uint8_t repeats = 0;
      if (server.hasArg("address")) {
        frame.remoteAddress = atoi(server.arg("address").c_str());
        if (server.hasArg("encKey")) frame.encKey = atoi(server.arg("encKey").c_str());
        if (server.hasArg("command")) frame.cmd = translateSomfyCommand(server.arg("command"));
        if (server.hasArg("rcode")) frame.rollingCode = atoi(server.arg("rcode").c_str());
        if (server.hasArg("repeats")) repeats = atoi(server.arg("repeats").c_str());
      }
      else if (server.hasArg("plain")) {
        StaticJsonDocument<128> doc;
        DeserializationError err = deserializeJson(doc, server.arg("plain"));
        if (err) {
          webServer.handleDeserializationError(server, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          String scmd;
          if (obj.containsKey("address")) frame.remoteAddress = obj["address"];
          if (obj.containsKey("command")) scmd = obj["command"].as<String>();
          if (obj.containsKey("repeats")) repeats = obj["repeats"];
          if (obj.containsKey("rcode")) frame.rollingCode = obj["rcode"];
          if (obj.containsKey("encKey")) frame.encKey = obj["encKey"];
          frame.cmd = translateSomfyCommand(scmd.c_str());
        }
      }
      if (frame.remoteAddress > 0 && frame.rollingCode > 0) {
        somfy.sendFrame(frame, repeats);
        server.send(200, _encoding_json, F("{\"status\":\"SUCCESS\",\"desc\":\"Command Sent\"}"));
      }
      else
        server.send(500, _encoding_json, F("{\"status\":\"ERROR\",\"desc\":\"No address or rolling code provided\"}"));
    }
  }

  static void handleBeginFrequencyScan(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    somfy.transceiver.beginFrequencyScan();
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginObject();
    somfy.transceiver.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleEndFrequencyScan(WebServer &server) {
    webServer.sendCORSHeaders(server);
    if(server.method() == HTTP_OPTIONS) { server.send(200, "OK"); return; }
    if(!webServer.isAuthenticated(server, true)) return;
    somfy.transceiver.endFrequencyScan();
    JsonResponse resp;
    resp.beginResponse(&server, g_content, sizeof(g_content));
    resp.beginObject();
    somfy.transceiver.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  void registerRoutes(WebServer &server) {
    server.on("/tiltCommand", [&server]() { handleTiltCommand(server); });
    server.on("/repeatCommand", [&server]() { handleRepeatCommand(server); });
    server.on("/shadeCommand", [&server]() { handleShadeCommand(server); });
    server.on("/groupCommand", [&server]() { handleGroupCommand(server); });
    server.on("/setPositions", [&server]() { handleSetPositions(server); });
    server.on("/setSensor", [&server]() { handleSetSensor(server); });
    server.on("/setMyPosition", [&server]() { handleSetMyPosition(server); });
    server.on("/setRollingCode", [&server]() { handleSetRollingCode(server); });
    server.on("/setPaired", [&server]() { handleSetPaired(server); });
    server.on("/unpairShade", [&server]() { handleUnpairShade(server); });
    server.on("/linkRepeater", [&server]() { handleLinkRepeater(server); });
    server.on("/unlinkRepeater", [&server]() { handleUnlinkRepeater(server); });
    server.on("/unlinkRemote", [&server]() { handleUnlinkRemote(server); });
    server.on("/linkRemote", [&server]() { handleLinkRemote(server); });
    server.on("/saveRadio", [&server]() { handleSaveRadio(server); });
    server.on("/getRadio", [&server]() { handleGetRadio(server); });
    server.on("/sendRemoteCommand", [&server]() { handleSendRemoteCommand(server); });
    server.on("/beginFrequencyScan", [&server]() { handleBeginFrequencyScan(server); });
    server.on("/endFrequencyScan", [&server]() { handleEndFrequencyScan(server); });
  }

  // --- Surcharges ESPAsyncWebServer (étape 5 migration, non câblées pour l'instant) ---
  // arg("plain") -> arg("body") partout : cf. WebAuth::handleLogin pour le raisonnement complet.

  void handleShadeCommand(AsyncWebServerRequest *request) {
    if (request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t shadeId = 255;
    uint8_t target = 255;
    uint8_t stepSize = 0;
    int8_t repeat = -1;
    somfy_commands command = somfy_commands::My;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if (request->hasArg("shadeId")) {
        shadeId = atoi(request->arg("shadeId").c_str());
        if (request->hasArg("command")) command = translateSomfyCommand(request->arg("command"));
        else if (request->hasArg("target")) target = atoi(request->arg("target").c_str());
        if (request->hasArg("repeat")) repeat = atoi(request->arg("repeat").c_str());
        if(request->hasArg("stepSize")) stepSize = atoi(request->arg("stepSize").c_str());
      }
      else if (request->hasArg("body")) {
        DBG_PRINTLN("Sending Shade Command");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
          if (obj.containsKey("command")) {
              String scmd = obj["command"];
              command = translateSomfyCommand(scmd);
          }
          else if (obj.containsKey("target")) {
              target = obj["target"].as<uint8_t>();
          }
          if (obj.containsKey("repeat")) repeat = obj["repeat"].as<uint8_t>();
          if(obj.containsKey("stepSize")) stepSize = obj["stepSize"].as<uint8_t>();
        }
      }
      else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}");
      SomfyShade* shade = somfy.getShadeById(shadeId);
      if (shade) {
        if(settings.enableDebugLogs) {
          Serial.print("Received:");
          Serial.println(request->arg("body"));
        }
        // Send the command to the shade.
        if (target <= 100)
            shade->moveToTarget(shade->transformPosition(target));
        else
            shade->sendCommand(command, repeat > 0 ? repeat : shade->repeats, stepSize);
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        shade->toJSONRef(resp);
        resp.endObject();
        resp.endResponse();
      }
      else {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade with the specified id not found.\"}");
      }
    }
    else
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  void handleRepeatCommand(AsyncWebServerRequest *request) {
    WebRequestMethodComposite method = request->method();
    if (method == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    uint8_t shadeId = 255;
    uint8_t groupId = 255;
    uint8_t stepSize = 0;
    int8_t repeat = -1;
    somfy_commands command = somfy_commands::My;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if(request->hasArg("shadeId")) shadeId = atoi(request->arg("shadeId").c_str());
      else if(request->hasArg("groupId")) groupId = atoi(request->arg("groupId").c_str());
      if(request->hasArg("command")) command = translateSomfyCommand(request->arg("command"));
      if(request->hasArg("repeat")) repeat = atoi(request->arg("repeat").c_str());
      if(request->hasArg("stepSize")) stepSize = atoi(request->arg("stepSize").c_str());
      if(shadeId == 255 && groupId == 255 && request->hasArg("body")) {
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          if(obj.containsKey("groupId")) groupId = obj["groupId"];
          if(obj.containsKey("stepSize")) stepSize = obj["stepSize"];
          if (obj.containsKey("command")) {
              String scmd = obj["command"];
              command = translateSomfyCommand(scmd);
          }
          if (obj.containsKey("repeat")) repeat = obj["repeat"].as<uint8_t>();
        }
      }
      if(shadeId != 255) {
        SomfyShade *shade = somfy.getShadeById(shadeId);
        if(!shade) {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade reference could not be found.\"}");
          return;
        }
        if(shade->shadeType == shade_types::garage1 && command == somfy_commands::Prog) command = somfy_commands::Toggle;
        if(!shade->isLastCommand(command)) {
          // We are going to send this as a new command.
          shade->sendCommand(command, repeat >= 0 ? repeat : shade->repeats, stepSize);
        }
        else {
          shade->repeatFrame(repeat >= 0 ? repeat : shade->repeats);
        }
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginArray();
        shade->toJSONRef(resp);
        resp.endArray();
        resp.endResponse();
      }
      else if(groupId != 255) {
        SomfyGroup * group = somfy.getGroupById(groupId);
        if(!group) {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group reference could not be found.\"}");
          return;
        }
        if(!group->isLastCommand(command)) {
          // We are going to send this as a new command.
          group->sendCommand(command, repeat >= 0 ? repeat : group->repeats, stepSize);
        }
        else
          group->repeatFrame(repeat >= 0 ? repeat : group->repeats);
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        group->toJSONRef(resp);
        resp.endObject();
        resp.endResponse();
      }
    }
    else {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
    }
  }

  void handleGroupCommand(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t groupId = 255;
    uint8_t stepSize = 0;
    int8_t repeat = -1;
    somfy_commands command = somfy_commands::My;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if (request->hasArg("groupId")) {
        groupId = atoi(request->arg("groupId").c_str());
        if (request->hasArg("command")) command = translateSomfyCommand(request->arg("command"));
        if(request->hasArg("repeat")) repeat = atoi(request->arg("repeat").c_str());
        if(request->hasArg("stepSize")) stepSize = atoi(request->arg("stepSize").c_str());
      }
      else if (request->hasArg("body")) {
        DBG_PRINTLN("Sending Group Command");
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("groupId")) groupId = obj["groupId"];
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No group id was supplied.\"}");
            return;
          }
          if (obj.containsKey("command")) {
            String scmd = obj["command"];
            command = translateSomfyCommand(scmd);
          }
          if(obj.containsKey("repeat")) repeat = obj["repeat"].as<uint8_t>();
          if(obj.containsKey("stepSize")) stepSize = obj["stepSize"].as<uint8_t>();
        }
      }
      else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No group object supplied.\"}");
      SomfyGroup * group = somfy.getGroupById(groupId);
      if (group) {
        if(settings.enableDebugLogs) {
          Serial.print("Received:");
          Serial.println(request->arg("body"));
        }
        // Send the command to the group.
        group->sendCommand(command, repeat >= 0 ? repeat : group->repeats, stepSize);
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        group->toJSONRef(resp);
        resp.endObject();
        resp.endResponse();
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group with the specified id not found.\"}");
      }
    }
    else
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  void handleTiltCommand(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t shadeId = 255;
    uint8_t target = 255;
    somfy_commands command = somfy_commands::My;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if (request->hasArg("shadeId")) {
        shadeId = atoi(request->arg("shadeId").c_str());
        if (request->hasArg("command")) command = translateSomfyCommand(request->arg("command"));
        else if(request->hasArg("target")) target = atoi(request->arg("target").c_str());
      }
      else if (request->hasArg("body")) {
        DBG_PRINTLN("Sending Shade Tilt Command");
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
          if (obj.containsKey("command")) {
            String scmd = obj["command"];
            command = translateSomfyCommand(scmd);
          }
          else if(obj.containsKey("target")) {
            target = obj["target"].as<uint8_t>();
          }
        }
      }
      else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}");
      SomfyShade* shade = somfy.getShadeById(shadeId);
      if (shade) {
        if(settings.enableDebugLogs) {
          Serial.print("Received:");
          Serial.println(request->arg("body"));
        }
        // Send the command to the shade.
        if(target <= 100)
          shade->moveToTiltTarget(shade->transformPosition(target));
        else
          shade->sendTiltCommand(command);
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        shade->toJSONRef(resp);
        resp.endObject();
        resp.endResponse();
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade with the specified id not found.\"}");
      }
    }
    else
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  void handleSetPositions(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    uint8_t shadeId = (request->hasArg("shadeId")) ? atoi(request->arg("shadeId").c_str()) : 255;
    int8_t pos = (request->hasArg("position")) ? atoi(request->arg("position").c_str()) : -1;
    int8_t tiltPos = (request->hasArg("tiltPosition")) ? atoi(request->arg("tiltPosition").c_str()) : -1;
    if(request->hasArg("body")) {
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, request->arg("body"));
      if (err) {
        webServer.handleDeserializationError(request, err);
        return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        if(obj.containsKey("shadeId")) shadeId = obj["shadeId"];
        if(obj.containsKey("position")) pos = obj["position"];
        if(obj.containsKey("tiltPosition")) tiltPos = obj["tiltPosition"];
      }
    }
    if(shadeId != 255) {
      SomfyShade *shade = somfy.getShadeById(shadeId);
      if(shade) {
        if(pos >= 0) shade->target = shade->currentPos = pos;
        if(tiltPos >= 0 && shade->tiltType != tilt_types::none) shade->tiltTarget = shade->currentTiltPos = tiltPos;
        shade->emitState();
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        shade->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
      else
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"An invalid shadeId was provided\"}");
    }
    else {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"shadeId was not provided\"}");
    }
  }

  void handleSetSensor(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    uint8_t shadeId = (request->hasArg("shadeId")) ? atoi(request->arg("shadeId").c_str()) : 255;
    uint8_t groupId = (request->hasArg("groupId")) ? atoi(request->arg("groupId").c_str()) : 255;
    int8_t sunny = (request->hasArg("sunny")) ? toBoolean(request->arg("sunny").c_str(), false) ? 1 : 0 : -1;
    int8_t windy = (request->hasArg("windy")) ? atoi(request->arg("windy").c_str()) : -1;
    int8_t repeat = (request->hasArg("repeat")) ? atoi(request->arg("repeat").c_str()) : -1;
    if(request->hasArg("body")) {
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, request->arg("body"));
      if (err) {
        webServer.handleDeserializationError(request, err);
        return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        if(obj.containsKey("shadeId")) shadeId = obj["shadeId"].as<uint8_t>();
        if(obj.containsKey("groupId")) groupId = obj["groupId"].as<uint8_t>();
        if(obj.containsKey("sunny")) {
          if(obj["sunny"].is<bool>())
            sunny = obj["sunny"].as<bool>() ? 1 : 0;
          else
            sunny = obj["sunny"].as<int8_t>();
        }
        if(obj.containsKey("windy")) {
          if(obj["windy"].is<bool>())
            windy = obj["windy"].as<bool>() ? 1 : 0;
          else
            windy = obj["windy"].as<int8_t>();
        }
        if(obj.containsKey("repeat")) repeat = obj["repeat"].as<uint8_t>();
      }
    }
    if(shadeId != 255) {
      SomfyShade *shade = somfy.getShadeById(shadeId);
      if(shade) {
        shade->sendSensorCommand(windy, sunny, repeat >= 0 ? (uint8_t)repeat : shade->repeats);
        shade->emitState();
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        shade->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
      else
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"An invalid shadeId was provided\"}");

    }
    else if(groupId != 255) {
      SomfyGroup *group = somfy.getGroupById(groupId);
      if(group) {
        group->sendSensorCommand(windy, sunny, repeat >= 0 ? (uint8_t)repeat : group->repeats);
        group->emitState();
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        group->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
      else
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"An invalid groupId was provided\"}");
    }
    else {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"shadeId was not provided\"}");
    }
  }

  static void handleSetMyPosition(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t shadeId = 255;
    int8_t pos = -1;
    int8_t tilt = -1;
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      if (request->hasArg("shadeId")) {
        shadeId = atoi(request->arg("shadeId").c_str());
        if(request->hasArg("pos")) pos = atoi(request->arg("pos").c_str());
        if(request->hasArg("tilt")) tilt = atoi(request->arg("tilt").c_str());
      }
      else if (request->hasArg("body")) {
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
          if(obj.containsKey("pos")) pos = obj["pos"].as<int8_t>();
          if(obj.containsKey("tilt")) tilt = obj["tilt"].as<int8_t>();
        }
      }
      else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}");
      SomfyShade* shade = somfy.getShadeById(shadeId);
      if (shade) {
        // Send the command to the shade.
        if(tilt < 0) tilt = shade->myPos;
        if(shade->tiltType == tilt_types::none) tilt = -1;
        if(pos >= 0 && pos <= 100)
          shade->setMyPosition(shade->transformPosition(pos), shade->transformPosition(tilt));
          JsonAsyncResponse resp;
          resp.beginResponse(request);
          resp.beginObject();
          shade->toJSONRef(resp);
          resp.endObject();
          resp.endResponse();
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade with the specified id not found.\"}");
      }
    }
    else
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  static void handleSetRollingCode(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      uint8_t shadeId = 255;
      uint16_t rollingCode = 0;
      if (request->hasArg("body")) {
        // Its coming in the body.
        StaticJsonDocument<129> doc;
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          if(obj.containsKey("rollingCode")) rollingCode = obj["rollingCode"];
        }
      }
      else if (request->hasArg("shadeId")) {
        shadeId = atoi(request->arg("shadeId").c_str());
        rollingCode = atoi(request->arg("rollingCode").c_str());
      }
      SomfyShade* shade = nullptr;
      if (shadeId != 255) shade = somfy.getShadeById(shadeId);
      if (!shade) {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade not found to set rolling code\"}");
      }
      else {
        shade->setRollingCode(rollingCode);
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        shade->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
    }
  }

  static void handleSetPaired(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    uint8_t shadeId = 255;
    bool paired = false;
    if(request->hasArg("body")) {
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, request->arg("body"));
      if(err) {
          webServer.handleDeserializationError(request, err);
          return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
        if(obj.containsKey("paired")) paired = obj["paired"];
      }
    }
    else if (request->hasArg("shadeId"))
      shadeId = atoi(request->arg("shadeId").c_str());
    if(request->hasArg("paired"))
      paired = toBoolean(request->arg("paired").c_str(), false);
    SomfyShade* shade = nullptr;
    if (shadeId != 255) shade = somfy.getShadeById(shadeId);
    if (!shade) {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade not found to pair\"}");
    }
    else {
      shade->paired = paired;
      shade->save();
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginObject();
      shade->toJSON(resp);
      resp.endObject();
      resp.endResponse();
    }
  }

  static void handleUnpairShade(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      uint8_t shadeId = 255;
      if (request->hasArg("body")) {
        // Its coming in the body.
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
        }
      }
      else if (request->hasArg("shadeId"))
        shadeId = atoi(request->arg("shadeId").c_str());
      SomfyShade* shade = nullptr;
      if (shadeId != 255) shade = somfy.getShadeById(shadeId);
      if (!shade) {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade not found to unpair\"}");
      }
      else {
        if(shade->bitLength == 56)
          shade->sendCommand(somfy_commands::Prog, 7);
        else
          shade->sendCommand(somfy_commands::Prog, 1);
        shade->paired = false;
        shade->save();
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginObject();
        shade->toJSON(resp);
        resp.endObject();
        resp.endResponse();
      }
    }
  }

  static void handleLinkRepeater(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      // We are adding a linked repeater.
      uint32_t address = 0;
      if (request->hasArg("body")) {
        DBG_PRINTLN("Linking a repeater");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("address")) address = obj["address"];
          else if(obj.containsKey("remoteAddress")) address = obj["remoteAddress"];
        }
      }
      else if(request->hasArg("address"))
        address = atoi(request->arg("address").c_str());
      if(address == 0)
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No repeater address was supplied.\"}");
      else {
        somfy.linkRepeater(address);
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginArray();
        somfy.toJSONRepeaters(resp);
        resp.endArray();
        resp.endResponse();
      }
    }
  }

  static void handleUnlinkRepeater(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      // We are adding a linked repeater.
      uint32_t address = 0;
      if (request->hasArg("body")) {
        DBG_PRINTLN("Unlinking a repeater");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("address")) address = obj["address"];
          else if(obj.containsKey("remoteAddress")) address = obj["remoteAddress"];
        }
      }
      else if(request->hasArg("address"))
        address = atoi(request->arg("address").c_str());
      if(address == 0)
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No repeater address was supplied.\"}");
      else {
        somfy.unlinkRepeater(address);
        JsonAsyncResponse resp;
        resp.beginResponse(request);
        resp.beginArray();
        somfy.toJSONRepeaters(resp);
        resp.endArray();
        resp.endResponse();
      }
    }
  }

  static void handleUnlinkRemote(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      // We are updating an existing shade by adding a linked remote.
      if (request->hasArg("body")) {
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) {
            SomfyShade* shade = somfy.getShadeById(obj["shadeId"]);
            if (shade) {
              if (obj.containsKey("remoteAddress")) {
                shade->unlinkRemote(obj["remoteAddress"]);
              }
              else {
                request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Remote address not provided.\"}");
              }
              JsonAsyncResponse resp;
              resp.beginResponse(request);
              resp.beginObject();
              shade->toJSON(resp);
              resp.endObject();
              resp.endResponse();
            }
            else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade Id not found.\"}");
          }
          else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
        }
      }
      else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No remote object supplied.\"}");
    }
  }

  static void handleLinkRemote(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == HTTP_PUT || method == HTTP_POST) {
      // We are updating an existing shade by adding a linked remote.
      if (request->hasArg("body")) {
        DBG_PRINTLN("Linking a remote");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) {
            SomfyShade* shade = somfy.getShadeById(obj["shadeId"]);
            if (shade) {
              if (obj.containsKey("remoteAddress")) {
                if (obj.containsKey("rollingCode")) shade->linkRemote(obj["remoteAddress"], obj["rollingCode"]);
                else shade->linkRemote(obj["remoteAddress"]);
              }
              else {
                request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Remote address not provided.\"}");
              }
              JsonAsyncResponse resp;
              resp.beginResponse(request);
              resp.beginObject();
              shade->toJSON(resp);
              resp.endObject();
              resp.endResponse();
            }
            else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade Id not found.\"}");
          }
          else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
        }
      }
      else request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No remote object supplied.\"}");
    }
  }

  static void handleSaveRadio(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;

    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, request->arg("body"))) { request->send(400, "text/plain", "J-Err"); return; }

    if (request->method() == HTTP_POST || request->method() == HTTP_PUT) {
      JsonObject obj = doc.as<JsonObject>();
      somfy.transceiver.fromJSON(obj);
      somfy.transceiver.save();

      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginObject();
      somfy.transceiver.toJSON(resp);
      resp.endObject();
      resp.endResponse();
    } else {
      request->send(405, _encoding_json, "{\"s\":\"ERR\"}");
    }
  }

  static void handleGetRadio(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    somfy.transceiver.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleSendRemoteCommand(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == HTTP_GET || method == HTTP_PUT || method == HTTP_POST) {
      somfy_frame_t frame;
      uint8_t repeats = 0;
      if (request->hasArg("address")) {
        frame.remoteAddress = atoi(request->arg("address").c_str());
        if (request->hasArg("encKey")) frame.encKey = atoi(request->arg("encKey").c_str());
        if (request->hasArg("command")) frame.cmd = translateSomfyCommand(request->arg("command"));
        if (request->hasArg("rcode")) frame.rollingCode = atoi(request->arg("rcode").c_str());
        if (request->hasArg("repeats")) repeats = atoi(request->arg("repeats").c_str());
      }
      else if (request->hasArg("body")) {
        StaticJsonDocument<128> doc;
        DeserializationError err = deserializeJson(doc, request->arg("body"));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          String scmd;
          if (obj.containsKey("address")) frame.remoteAddress = obj["address"];
          if (obj.containsKey("command")) scmd = obj["command"].as<String>();
          if (obj.containsKey("repeats")) repeats = obj["repeats"];
          if (obj.containsKey("rcode")) frame.rollingCode = obj["rcode"];
          if (obj.containsKey("encKey")) frame.encKey = obj["encKey"];
          frame.cmd = translateSomfyCommand(scmd.c_str());
        }
      }
      if (frame.remoteAddress > 0 && frame.rollingCode > 0) {
        somfy.sendFrame(frame, repeats);
        request->send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Command Sent\"}");
      }
      else
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No address or rolling code provided\"}");
    }
  }

  static void handleBeginFrequencyScan(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    somfy.transceiver.beginFrequencyScan();
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    somfy.transceiver.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleEndFrequencyScan(AsyncWebServerRequest *request) {
    if(request->method() == HTTP_OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    somfy.transceiver.endFrequencyScan();
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    somfy.transceiver.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/tiltCommand", HTTP_ANY, [](AsyncWebServerRequest *request) { handleTiltCommand(request); });
    server.on("/repeatCommand", HTTP_ANY, [](AsyncWebServerRequest *request) { handleRepeatCommand(request); });
    server.on("/shadeCommand", HTTP_ANY, [](AsyncWebServerRequest *request) { handleShadeCommand(request); });
    server.on("/groupCommand", HTTP_ANY, [](AsyncWebServerRequest *request) { handleGroupCommand(request); });
    server.on("/setPositions", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSetPositions(request); });
    server.on("/setSensor", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSetSensor(request); });
    server.on("/setMyPosition", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSetMyPosition(request); });
    server.on("/setRollingCode", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSetRollingCode(request); });
    server.on("/setPaired", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSetPaired(request); });
    server.on("/unpairShade", HTTP_ANY, [](AsyncWebServerRequest *request) { handleUnpairShade(request); });
    server.on("/linkRepeater", HTTP_ANY, [](AsyncWebServerRequest *request) { handleLinkRepeater(request); });
    server.on("/unlinkRepeater", HTTP_ANY, [](AsyncWebServerRequest *request) { handleUnlinkRepeater(request); });
    server.on("/unlinkRemote", HTTP_ANY, [](AsyncWebServerRequest *request) { handleUnlinkRemote(request); });
    server.on("/linkRemote", HTTP_ANY, [](AsyncWebServerRequest *request) { handleLinkRemote(request); });
    server.on("/saveRadio", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSaveRadio(request); });
    server.on("/getRadio", HTTP_ANY, [](AsyncWebServerRequest *request) { handleGetRadio(request); });
    server.on("/sendRemoteCommand", HTTP_ANY, [](AsyncWebServerRequest *request) { handleSendRemoteCommand(request); });
    server.on("/beginFrequencyScan", HTTP_ANY, [](AsyncWebServerRequest *request) { handleBeginFrequencyScan(request); });
    server.on("/endFrequencyScan", HTTP_ANY, [](AsyncWebServerRequest *request) { handleEndFrequencyScan(request); });
  }
}
