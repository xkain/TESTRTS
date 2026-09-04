#include "ConfigSettings.h"
#include "Utils.h"
#include "somfy/Somfy.h"
#include "StatusLed.h"
#include "WResp.h"
#include "Web.h"
#include "WebCommon.h"
#include "WebRadioCommands.h"

extern ConfigSettings settings;
extern SomfyShadeController somfy;
extern Web webServer;

namespace WebRadioCommands {

  void handleShadeCommand(AsyncWebServerRequest *request) {
    if (request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t shadeId = 255;
    uint8_t target = 255;
    uint8_t stepSize = 0;
    int8_t repeat = -1;
    somfy_commands command = somfy_commands::My;
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (request->hasArg("shadeId")) {
        shadeId = atoi(request->arg("shadeId").c_str());
        if (request->hasArg("command")) command = translateSomfyCommand(request->arg("command"));
        else if (request->hasArg("target")) target = atoi(request->arg("target").c_str());
        if (request->hasArg("repeat")) repeat = atoi(request->arg("repeat").c_str());
        if(request->hasArg("stepSize")) stepSize = atoi(request->arg("stepSize").c_str());
      }
      else if (asyncHasBody(request)) {
        DBG_PRINTLN("Sending Shade Command");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
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
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
      SomfyShade* shade = somfy.getShadeById(shadeId);
      if (shade) {
        if(settings.enableDebugLogs) {
          Serial.print("Received:");
          Serial.println(asyncGetBody(request));
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
    if (method == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    uint8_t shadeId = 255;
    uint8_t groupId = 255;
    uint8_t stepSize = 0;
    int8_t repeat = -1;
    somfy_commands command = somfy_commands::My;
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if(request->hasArg("shadeId")) shadeId = atoi(request->arg("shadeId").c_str());
      else if(request->hasArg("groupId")) groupId = atoi(request->arg("groupId").c_str());
      if(request->hasArg("command")) command = translateSomfyCommand(request->arg("command"));
      if(request->hasArg("repeat")) repeat = atoi(request->arg("repeat").c_str());
      if(request->hasArg("stepSize")) stepSize = atoi(request->arg("stepSize").c_str());
      if(shadeId == 255 && groupId == 255 && asyncHasBody(request)) {
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t groupId = 255;
    uint8_t stepSize = 0;
    int8_t repeat = -1;
    somfy_commands command = somfy_commands::My;
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (request->hasArg("groupId")) {
        groupId = atoi(request->arg("groupId").c_str());
        if (request->hasArg("command")) command = translateSomfyCommand(request->arg("command"));
        if(request->hasArg("repeat")) repeat = atoi(request->arg("repeat").c_str());
        if(request->hasArg("stepSize")) stepSize = atoi(request->arg("stepSize").c_str());
      }
      else if (asyncHasBody(request)) {
        DBG_PRINTLN("Sending Group Command");
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No group object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
      SomfyGroup * group = somfy.getGroupById(groupId);
      if (group) {
        if(settings.enableDebugLogs) {
          Serial.print("Received:");
          Serial.println(asyncGetBody(request));
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t shadeId = 255;
    uint8_t target = 255;
    somfy_commands command = somfy_commands::My;
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (request->hasArg("shadeId")) {
        shadeId = atoi(request->arg("shadeId").c_str());
        if (request->hasArg("command")) command = translateSomfyCommand(request->arg("command"));
        else if(request->hasArg("target")) target = atoi(request->arg("target").c_str());
      }
      else if (asyncHasBody(request)) {
        DBG_PRINTLN("Sending Shade Tilt Command");
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
          if (obj.containsKey("command")) {
            String scmd = obj["command"];
            command = translateSomfyCommand(scmd);
          }
          else if(obj.containsKey("target")) {
            target = obj["target"].as<uint8_t>();
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
      SomfyShade* shade = somfy.getShadeById(shadeId);
      if (shade) {
        if(settings.enableDebugLogs) {
          Serial.print("Received:");
          Serial.println(asyncGetBody(request));
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    uint8_t shadeId = (request->hasArg("shadeId")) ? atoi(request->arg("shadeId").c_str()) : 255;
    int8_t pos = (request->hasArg("position")) ? atoi(request->arg("position").c_str()) : -1;
    int8_t tiltPos = (request->hasArg("tiltPosition")) ? atoi(request->arg("tiltPosition").c_str()) : -1;
    if(asyncHasBody(request)) {
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    uint8_t shadeId = (request->hasArg("shadeId")) ? atoi(request->arg("shadeId").c_str()) : 255;
    uint8_t groupId = (request->hasArg("groupId")) ? atoi(request->arg("groupId").c_str()) : 255;
    int8_t sunny = (request->hasArg("sunny")) ? toBoolean(request->arg("sunny").c_str(), false) ? 1 : 0 : -1;
    int8_t windy = (request->hasArg("windy")) ? atoi(request->arg("windy").c_str()) : -1;
    int8_t repeat = (request->hasArg("repeat")) ? atoi(request->arg("repeat").c_str()) : -1;
    if(asyncHasBody(request)) {
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t shadeId = 255;
    int8_t pos = -1;
    int8_t tilt = -1;
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (request->hasArg("shadeId")) {
        shadeId = atoi(request->arg("shadeId").c_str());
        if(request->hasArg("pos")) pos = atoi(request->arg("pos").c_str());
        if(request->hasArg("tilt")) tilt = atoi(request->arg("tilt").c_str());
      }
      else if (asyncHasBody(request)) {
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("shadeId")) shadeId = obj["shadeId"];
          else {
            // `return` ajouté le 23/08/2026 : sans lui, l'exécution continuait jusqu'à la
            // recherche du volet plus bas, qui émettait une SECONDE réponse -- et c'est la
            // dernière qui gagne (AsyncWebServerRequest::send() supprime la réponse déjà posée,
            // cf. WebRequest.cpp). Le client recevait donc « Shade with the specified id not
            // found. » au lieu du vrai motif, « No shade id was supplied. ».
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
            return;
          }
          if(obj.containsKey("pos")) pos = obj["pos"].as<int8_t>();
          if(obj.containsKey("tilt")) tilt = obj["tilt"].as<int8_t>();
        }
      }
      else {
        // Même correctif que ci-dessus : la réponse était écrasée par celle de la recherche de volet.
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}");
        return;
      }
      SomfyShade* shade = somfy.getShadeById(shadeId);
      if (shade) {
        // M-8 de l'audit, corrigé le 23/08/2026 : le repli se faisait sur `myPos`, la position
        // favorite de HAUTEUR, pour alimenter une INCLINAISON. Un /setMyPosition sans champ `tilt`
        // mémorisait donc la hauteur favorite comme inclinaison favorite. `myTiltPos` est la seule
        // valeur qui exprime « garde l'inclinaison favorite actuelle ».
        // (Les deux champs sont des float ; la troncature vers int8_t est celle qui existait déjà,
        // et -1.0f -> -1 conserve bien la sémantique « non défini ».)
        if(tilt < 0) tilt = shade->myTiltPos;
        if(shade->tiltType == tilt_types::none) tilt = -1;
        // Accolades ajoutées, et le cas « position absente ou hors bornes » n'est plus silencieux.
        // Sans accolades, seul l'appel à setMyPosition() était gardé -- l'indentation laissait
        // croire que toute la construction de réponse l'était aussi. Le comportement qui en
        // résultait était trompeur : un appel sans `pos` n'enregistrait RIEN et répondait quand
        // même 200 avec l'état du volet, donc comme un succès. On refuse désormais explicitement.
        // L'interface n'est pas concernée, elle envoie toujours les trois champs (cf. 70-somfy.js).
        if(pos < 0 || pos > 100) {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"A position between 0 and 100 is required.\"}");
          return;
        }
        shade->setMyPosition(shade->transformPosition(pos), shade->transformPosition(tilt));
        {
          JsonAsyncResponse resp;
          resp.beginResponse(request);
          resp.beginObject();
          // toJSON() (et non toJSONRef(), qui omet myPos/myTiltPos) : les autres routes de
          // commande de mouvement du fichier renvoient déjà l'état complet, et le client a besoin
          // de myPos/myTiltPos à jour pour rafraîchir son affichage sans attendre une diffusion WS.
          shade->toJSON(resp);
          resp.endObject();
          resp.endResponse();
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade with the specified id not found.\"}");
      }
    }
    else
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  static void handleSetRollingCode(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      uint8_t shadeId = 255;
      uint16_t rollingCode = 0;
      if (asyncHasBody(request)) {
        // Its coming in the body.
        StaticJsonDocument<129> doc;
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
    // M-23 : branche absente jusqu'au 24/08/2026. Ces routes sont enregistrées en
    // AsyncHttp::ANY, donc un GET, DELETE, PATCH ou HEAD entrait ici, ne satisfaisait aucune
    // condition, et la fonction retournait SANS qu'aucune réponse ne soit posée. Sous
    // ESPAsyncWebServer la requête n'est alors jamais close : le client attend son propre délai
    // d'expiration, connexion tenue pendant tout ce temps.
    else request->send(405, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  static void handleSetPaired(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    uint8_t shadeId = 255;
    bool paired = false;
    if(asyncHasBody(request)) {
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      uint8_t shadeId = 255;
      if (asyncHasBody(request)) {
        // Its coming in the body.
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
    // M-23 : branche absente jusqu'au 24/08/2026. Ces routes sont enregistrées en
    // AsyncHttp::ANY, donc un GET, DELETE, PATCH ou HEAD entrait ici, ne satisfaisait aucune
    // condition, et la fonction retournait SANS qu'aucune réponse ne soit posée. Sous
    // ESPAsyncWebServer la requête n'est alors jamais close : le client attend son propre délai
    // d'expiration, connexion tenue pendant tout ce temps.
    else request->send(405, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  static void handleLinkRepeater(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      // We are adding a linked repeater.
      uint32_t address = 0;
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Linking a repeater");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
    // M-23 : branche absente jusqu'au 24/08/2026. Ces routes sont enregistrées en
    // AsyncHttp::ANY, donc un GET, DELETE, PATCH ou HEAD entrait ici, ne satisfaisait aucune
    // condition, et la fonction retournait SANS qu'aucune réponse ne soit posée. Sous
    // ESPAsyncWebServer la requête n'est alors jamais close : le client attend son propre délai
    // d'expiration, connexion tenue pendant tout ce temps.
    else request->send(405, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  static void handleUnlinkRepeater(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      // We are adding a linked repeater.
      uint32_t address = 0;
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Unlinking a repeater");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
    // M-23 : branche absente jusqu'au 24/08/2026. Ces routes sont enregistrées en
    // AsyncHttp::ANY, donc un GET, DELETE, PATCH ou HEAD entrait ici, ne satisfaisait aucune
    // condition, et la fonction retournait SANS qu'aucune réponse ne soit posée. Sous
    // ESPAsyncWebServer la requête n'est alors jamais close : le client attend son propre délai
    // d'expiration, connexion tenue pendant tout ce temps.
    else request->send(405, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  static void handleUnlinkRemote(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      // We are updating an existing shade by adding a linked remote.
      if (asyncHasBody(request)) {
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
            else {
              request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade Id not found.\"}");
              return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
            }
          }
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No remote object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
  }

  static void handleLinkRemote(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      // We are updating an existing shade by adding a linked remote.
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Linking a remote");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
            else {
              request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade Id not found.\"}");
              return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
            }
          }
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No remote object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
  }

  // VALIDATION AVANT APPLICATION. transceiver_config_t::fromJSON refuse une broche en silence --
  // il n'a aucun canal de retour d'erreur -- et /saveRadio repondait quand meme 200 : l'interface
  // continuait d'afficher une broche que la carte n'avait jamais prise, jusqu'au rechargement de
  // page. On tranche donc ici, la ou l'on peut encore repondre, et rien n'est applique tant que les
  // six broches ne tiennent pas.
  static bool validateRadioPins(JsonObject& obj, String &err) {
    if(!obj.containsKey("config")) return true;
    JsonObject cfg = obj["config"];
    const transceiver_config_t &cur = somfy.transceiver.config;
    struct pin_slot_t { const char *key; const char *label; uint8_t current; radio_pin_role role; };
    const pin_slot_t slots[6] = {
      {"SCKPin",  "SCK",  cur.SCKPin,  radio_pin_role::spi_out},
      {"MOSIPin", "MOSI", cur.MOSIPin, radio_pin_role::spi_out},
      {"CSNPin",  "CSN",  cur.CSNPin,  radio_pin_role::spi_out},
      {"MISOPin", "MISO", cur.MISOPin, radio_pin_role::spi_in},
      {"RXPin",   "RX",   cur.RXPin,   radio_pin_role::spi_in},
      {"TXPin",   "TX",   cur.TXPin,   radio_pin_role::tx_bitbang}
    };
    // Une cle absente laisse la valeur courante : on valide l'etat RESULTANT, pas le seul delta.
    int val[6];
    for(uint8_t i = 0; i < 6; i++)
      val[i] = cfg.containsKey(slots[i].key) ? cfg[slots[i].key].as<int>() : (int)slots[i].current;

    // `extra` porte les champs propres au cas (line2, owner, ownerKey) ; `desc` reste l'anglais du
    // firmware, qui sert de repli tant que la cle ERR_<code> n'existe pas cote dictionnaire et de
    // message lisible pour un client tiers. Le code, lui, est ce que l'interface traduit.
    auto fail = [&err](const char *code, int pin, const char *line, const String &extra, const String &desc) {
      err = String("{\"status\":\"ERROR\",\"code\":\"") + code + "\",\"pin\":" + pin +
            ",\"line\":\"" + line + "\"" + extra + ",\"desc\":\"" + desc + "\"}";
      return false;
    };

    for(uint8_t i = 0; i < 6; i++) {
      const char *fault = radioPinFault(val[i], slots[i].role);
      if(!fault) continue;
      const char *code = (slots[i].role == radio_pin_role::spi_in) ? "RADIO_PIN_NOT_INPUT"
                       : (val[i] > 31 ? "RADIO_PIN_TX_TOO_HIGH" : "RADIO_PIN_NOT_OUTPUT");
      return fail(code, val[i], slots[i].label, "",
                  String("GPIO") + val[i] + " (" + slots[i].label + ") is " + fault + ".");
    }
    // TX et RX peuvent partager une broche -- GDO0 commun, cf. setGDO0() dans SomfyRadioDriver.
    // Toute autre paire identique est une erreur de saisie.
    for(uint8_t i = 0; i < 6; i++) {
      for(uint8_t j = i + 1; j < 6; j++) {
        if(val[i] != val[j]) continue;
        if(slots[i].role == radio_pin_role::tx_bitbang || slots[j].role == radio_pin_role::tx_bitbang) {
          if(strcmp(slots[i].label, "RX") == 0 || strcmp(slots[j].label, "RX") == 0) continue;
        }
        return fail("RADIO_PIN_DUPLICATED", val[i], slots[i].label,
                    String(",\"line2\":\"") + slots[j].label + "\"",
                    String("GPIO") + val[i] + " is assigned to both " + slots[i].label + " and " + slots[j].label + ".");
      }
    }
    // Occupation par un AUTRE organe. La radio est exclue de la recherche : on est precisement en
    // train de la reaffecter, elle se detecterait comme sa propre occupante.
    for(uint8_t i = 0; i < 6; i++) {
      const char *owner = nullptr;
      // Un volet porte un NOM saisi par l'utilisateur : il part tel quel dans `owner`, echappe,
      // et l'interface l'interpole. L'Ethernet et le temoin sont des concepts : ils passent par
      // ownerKey, que l'interface traduit.
      if(somfyPinInUse((int8_t)val[i], &owner, false))
        return fail("RADIO_PIN_IN_USE", val[i], slots[i].label,
                    String(",\"owner\":\"") + jsonEscape(owner ? owner : "another device") + "\"",
                    String("GPIO") + val[i] + " (" + slots[i].label + ") is already used by " + (owner ? owner : "another device") + ".");
      if((settings.connType == conn_types_t::ethernet || settings.connType == conn_types_t::ethernetpref)
         && settings.Ethernet.usesPin((uint8_t)val[i]))
        return fail("RADIO_PIN_IN_USE", val[i], slots[i].label,
                    ",\"ownerKey\":\"OWNER_ETHERNET\"",
                    String("GPIO") + val[i] + " (" + slots[i].label + ") is already used by the Ethernet interface.");
      if(statusLed.isEnabled() && statusLed.pin() == (int8_t)val[i])
        return fail("RADIO_PIN_IN_USE", val[i], slots[i].label,
                    ",\"ownerKey\":\"OWNER_LED\"",
                    String("GPIO") + val[i] + " (" + slots[i].label + ") is already used by the status LED.");
    }
    return true;
  }

  static void handleSaveRadio(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;

    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, asyncGetBody(request))) { request->send(400, "text/plain", "J-Err"); return; }

    if (request->method() == AsyncHttp::POST || request->method() == AsyncHttp::PUT) {
      JsonObject obj = doc.as<JsonObject>();
      String err;
      if(!validateRadioPins(obj, err)) { request->send(400, _encoding_json, err); return; }
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
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    somfy.transceiver.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleSendRemoteCommand(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      somfy_frame_t frame;
      uint8_t repeats = 0;
      if (request->hasArg("address")) {
        frame.remoteAddress = atoi(request->arg("address").c_str());
        if (request->hasArg("encKey")) frame.encKey = atoi(request->arg("encKey").c_str());
        if (request->hasArg("command")) frame.cmd = translateSomfyCommand(request->arg("command"));
        if (request->hasArg("rcode")) frame.rollingCode = atoi(request->arg("rcode").c_str());
        if (request->hasArg("repeats")) repeats = atoi(request->arg("repeats").c_str());
      }
      else if (asyncHasBody(request)) {
        StaticJsonDocument<128> doc;
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
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
    else {
      // Branche absente jusqu'au 24/08/2026 : la route est enregistrée en AsyncHttp::ANY, donc un
      // DELETE, PATCH ou HEAD entrait ici et en ressortait SANS qu'aucune réponse ne soit posée.
      // Sous ESPAsyncWebServer, une requête sans réponse n'est pas close : le client attend son
      // propre délai d'expiration, connexion tenue pendant tout ce temps. Toutes les autres routes
      // du fichier ferment déjà ce cas.
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
    }
  }

  static void handleBeginFrequencyScan(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    // Différé vers la tâche principale (T-5, cf. SomfyRadioDriver.h) : appeler
    // beginFrequencyScan() ici l'exécuterait sur async_tcp, en parallèle réel de
    // processFrequencyScan() sur loopTask -- deux cœurs sur la même puce radio.
    somfy.transceiver.requestFrequencyScan(true);
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    somfy.transceiver.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  static void handleEndFrequencyScan(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    somfy.transceiver.requestFrequencyScan(false); // différé, cf. handleBeginFrequencyScan
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    somfy.transceiver.toJSON(resp);
    resp.endObject();
    resp.endResponse();
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/tiltCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleTiltCommand(request); }, nullptr, asyncBodyHandler);
    server.on("/repeatCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleRepeatCommand(request); }, nullptr, asyncBodyHandler);
    server.on("/shadeCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleShadeCommand(request); }, nullptr, asyncBodyHandler);
    server.on("/groupCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGroupCommand(request); }, nullptr, asyncBodyHandler);
    server.on("/setPositions", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSetPositions(request); }, nullptr, asyncBodyHandler);
    server.on("/setSensor", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSetSensor(request); }, nullptr, asyncBodyHandler);
    server.on("/setMyPosition", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSetMyPosition(request); }, nullptr, asyncBodyHandler);
    server.on("/setRollingCode", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSetRollingCode(request); }, nullptr, asyncBodyHandler);
    server.on("/setPaired", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSetPaired(request); }, nullptr, asyncBodyHandler);
    server.on("/unpairShade", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleUnpairShade(request); }, nullptr, asyncBodyHandler);
    server.on("/linkRepeater", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleLinkRepeater(request); }, nullptr, asyncBodyHandler);
    server.on("/unlinkRepeater", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleUnlinkRepeater(request); }, nullptr, asyncBodyHandler);
    server.on("/unlinkRemote", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleUnlinkRemote(request); }, nullptr, asyncBodyHandler);
    server.on("/linkRemote", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleLinkRemote(request); }, nullptr, asyncBodyHandler);
    server.on("/saveRadio", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSaveRadio(request); }, nullptr, asyncBodyHandler);
    server.on("/getRadio", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetRadio(request); });
    server.on("/sendRemoteCommand", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSendRemoteCommand(request); }, nullptr, asyncBodyHandler);
    server.on("/beginFrequencyScan", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleBeginFrequencyScan(request); });
    server.on("/endFrequencyScan", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleEndFrequencyScan(request); });
  }
}
