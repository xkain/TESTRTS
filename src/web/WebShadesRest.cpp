#include <memory>            // std::make_shared -- état de la réponse chunked de /shades
#include "ConfigSettings.h"
#include "somfy/Somfy.h"
#include "Schedule.h"
#include "WResp.h"
#include "Web.h"
#include "WebCommon.h"
#include "WebChunkedJson.h"
#include "WebShadesRest.h"

extern ConfigSettings settings;
extern SomfyShadeController somfy;
extern Web webServer;
extern ScheduleController schedule;

namespace WebShadesRest {

  void handleGetRooms(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::POST || method == AsyncHttp::GET) {
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginArray();
      somfy.toJSONRooms(resp);
      resp.endArray();
      resp.endResponse();
    }
    else {
      request->send(404, _encoding_text, _response_404);
      return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
    }
  }

  // --- Sérialisation chunked de /shades (étape B2, 17/08/2026) ---
  // Cf. WebChunkedJson.h. Cette route était, avec /discovery, la dernière à réserver 16384 octets
  // contigus. Elle y était d'autant plus exposée qu'elle est typiquement interrogée à intervalle
  // régulier par une intégration externe (Home Assistant) : chaque sondage reprenait le coin de
  // 16 Ko, avec à chaque fois une occasion d'échouer une petite allocation permanente au milieu de
  // la région. Réponse plate (un simple tableau de volets), donc machine à états minimale.
  enum shades_phase_t : uint8_t { SH_OPEN = 0, SH_ITEMS, SH_DONE };
  struct ShadesChunkState {
    ChunkedJsonEmitter em;
    uint8_t phase = SH_OPEN;
    uint8_t idx = 0;
    bool firstItem = true;
    bool overflowed = false;
    // Décidé à la RÉCEPTION de la requête et figé ici : la réponse chunked s'étale sur plusieurs
    // cycles d'ACK, et `request` n'est plus consultable pendant l'émission.
    bool secrets = true;
    uint8_t shades[SOMFY_MAX_SHADES]; uint8_t nShades = 0;
  };

  static bool shadesProduceNext(ShadesChunkState *st) {
    switch(st->phase) {
      case SH_OPEN:
        st->em.emitRaw("[");
        st->phase = SH_ITEMS;
        return true;
      case SH_ITEMS:
        if(st->idx < st->nShades) {
          JsonFormatter *j = st->em.beginItem(!st->firstItem);
          j->beginObject();
          somfy.shades[st->shades[st->idx]].toJSON(*j, st->secrets);
          j->endObject();
          st->idx++; st->firstItem = false;
          break;
        }
        st->em.emitRaw("]");
        st->phase = SH_DONE;
        return true;
      default:
        return false;
    }
    if(!st->em.endItem() && !st->overflowed) {
      st->overflowed = true;
      Serial.printf("[CHUNKED] /shades: element tronque (tampon de %u octets depasse)\n",
        (unsigned)CHUNKED_ITEM_BUF);
    }
    return true;
  }

  void handleGetShades(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::POST || method == AsyncHttp::GET) {
      auto st = std::make_shared<ShadesChunkState>();
      // Adresse de télécommande et code tournant ne sortent qu'avec une authentification de niveau
      // CONFIG (décision n°4, 24/08/2026). La route elle-même reste au niveau `false`, comme avant :
      // ce sont les SECRETS qui montent d'un cran, pas l'accès. Sans cela, le mode « config seule »
      // -- où checkAuth(request, false) passe sans clé -- servait le couple qui permet de forger une
      // trame RTS à n'importe qui sur le réseau local, ce que C-5 avait fermé sur /discovery
      // seulement. Même modèle que le fork actif du projet.
      st->secrets = webServer.isAuthenticated(request, true);
      // Même filtre de sentinelle que SomfyShadeController::toJSONShades.
      for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++)
        if(somfy.shades[i].getShadeId() != 255) st->shades[st->nShades++] = i;

      request->send(request->beginChunkedResponse(_encoding_json,
        [st](uint8_t *buffer, size_t maxLen, size_t index) -> size_t {
          size_t written = 0;
          while(written < maxLen) {
            if(st->em.pending()) {
              written += st->em.flush(buffer + written, maxLen - written);
              continue;
            }
            if(!shadesProduceNext(st.get())) {
              ConfigSettings::reportAsyncTcpStackLow("/shades (serialisation chunked)");
              break;
            }
          }
          return written;
        }));
    }
    else {
      request->send(404, _encoding_text, _response_404);
      return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
    }
  }

  void handleGetGroups(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::POST || method == AsyncHttp::GET) {
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginArray();
      somfy.toJSONGroups(resp, webServer.isAuthenticated(request, true)); // cf. /shades
      resp.endArray();
      resp.endResponse();
    }
    else {
      request->send(404, _encoding_text, _response_404);
      return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
    }
  }

  void handleGetSchedules(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::POST || method == AsyncHttp::GET) {
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginArray();
      schedule.toJSONSchedules(resp);
      resp.endArray();
      resp.endResponse();
    }
    else {
      request->send(404, _encoding_text, _response_404);
      return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
    }
  }

  void handleSchedule(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, false)) return;
    if (request->method() == AsyncHttp::GET) {
      if (request->hasArg("scheduleId")) {
        int scheduleId = atoi(request->arg("scheduleId").c_str());
        schedule.lock();
        ScheduleRule* rule = schedule.getScheduleById(scheduleId);
        if (rule) {
          JsonAsyncResponse resp;
          resp.beginResponse(request);
          resp.beginObject();
          rule->toJSON(resp);
          resp.endObject();
          resp.endResponse();
          schedule.unlock();
        }
        else {
          schedule.unlock();
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Schedule Id not found.\"}");
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"You must supply a valid schedule id.\"}");
      }
    }
    else {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
      return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
    }
  }

  void handleRoom(AsyncWebServerRequest *request) {
    WebRequestMethodComposite method = request->method();
    if(method == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, method != AsyncHttp::GET)) return;
    if (method == AsyncHttp::GET) {
      if (request->hasArg("roomId")) {
        int roomId = atoi(request->arg("roomId").c_str());
        SomfyRoom* room = somfy.getRoomById(roomId);
        if (room) {
          JsonAsyncResponse resp;
          resp.beginResponse(request);
          resp.beginObject();
          room->toJSON(resp);
          resp.endObject();
          resp.endResponse();
        }
        else {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Room Id not found.\"}");
          return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"You must supply a valid room id.\"}");
      }
    }
    else if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Updating a room");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("roomId")) {
            SomfyRoom* room = somfy.getRoomById(obj["roomId"]);
            if (room) {
              // M-2 de l'audit, corrigé le 23/08/2026. SomfyRoom::fromJSON renvoie un BOOL
              // (`true` = accepté, cf. SomfySerialize.cpp) et le résultat était rangé dans un
              // `uint8_t err` testé contre 0 : la convention était donc lue à l'envers. `true`
              // devenait err=1, la branche d'échec partait, et cette route répondait
              // systématiquement 500 « Data Error » -- SANS jamais appeler room->save(), donc en
              // perdant réellement la modification. Le cas inverse (fromJSON refusant l'objet)
              // aurait été rapporté comme un succès ; il ne se produit pas aujourd'hui, cette
              // fonction n'ayant aucun chemin d'échec, mais la lecture restait fausse.
              // Le booléen est maintenant testé pour ce qu'il est, sans variable intermédiaire.
              // L'interface n'était pas touchée : elle passe par /saveRoom (cf. 70-somfy.js) ;
              // c'est /room, la route REST, qui était inutilisable.
              if(room->fromJSON(obj)) {
                room->save();
                JsonAsyncResponse resp;
                resp.beginResponse(request);
                resp.beginObject();
                room->toJSON(resp);
                resp.endObject();
                resp.endResponse();
              }
              else {
                request->send(500, _encoding_json, "{\"status\":\"DATA\",\"desc\":\"Data Error.\"}");
              }
            }
            else {
              request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Room Id not found.\"}");
              return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
            }
          }
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No room id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No room object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
    else
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  void handleShade(AsyncWebServerRequest *request) {
    WebRequestMethodComposite method = request->method();
    if(method == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, method != AsyncHttp::GET)) return;
    if (method == AsyncHttp::GET) {
      if (request->hasArg("shadeId")) {
        int shadeId = atoi(request->arg("shadeId").c_str());
        SomfyShade* shade = somfy.getShadeById(shadeId);
        if (shade) {
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
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"You must supply a valid shade id.\"}");
      }
    }
    else if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Updating a shade");
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
              // int8_t et non uint8_t : c'est le type que SomfyShade::fromJSON déclare, et ses
              // codes d'erreur sont NÉGATIFS. Rangés dans un uint8_t ils restaient non nuls -- la
              // branche d'échec partait donc bien -- mais le `"code":%d` renvoyé au client était
              // le complément à deux (un -5 s'affichait 251), donc inexploitable pour diagnostiquer.
              // Aligné sur handleSaveShade plus bas, qui utilise déjà le bon type.
              int8_t err = shade->fromJSON(obj);
              if(err == 0) {
                shade->save();
                JsonAsyncResponse resp;
                resp.beginResponse(request);
                resp.beginObject();
                shade->toJSON(resp);
                resp.endObject();
                resp.endResponse();
              }
              else {
                snprintf(g_content, sizeof(g_content), "{\"status\":\"DATA\",\"desc\":\"Data Error.\", \"code\":%d}", err);
                request->send(500, _encoding_json, g_content);
              }
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
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
    else
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  void handleGroup(AsyncWebServerRequest *request) {
    WebRequestMethodComposite method = request->method();
    if(method == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, method != AsyncHttp::GET)) return;
    if (method == AsyncHttp::GET) {
      if (request->hasArg("groupId")) {
        int groupId = atoi(request->arg("groupId").c_str());
        SomfyGroup* group = somfy.getGroupById(groupId);
        if (group) {
          JsonAsyncResponse resp;
          resp.beginResponse(request);
          resp.beginObject();
          group->toJSON(resp);
          resp.endObject();
          resp.endResponse();
        }
        else {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group Id not found.\"}");
          return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"You must supply a valid shade id.\"}");
      }
    }
    else if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Updating a group");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("groupId")) {
            SomfyGroup* group = somfy.getGroupById(obj["groupId"]);
            if (group) {
              group->fromJSON(obj);
              group->save();
              JsonAsyncResponse resp;
              resp.beginResponse(request);
              resp.beginObject();
              group->toJSON(resp);
              resp.endObject();
              resp.endResponse();
            }
            else {
              request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group Id not found.\"}");
              return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
            }
          }
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No group id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No group object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
    else
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Invalid Http method\"}");
  }

  static void handleGetNextRoom(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.addElem("roomId", somfy.getNextRoomId());
    resp.endObject();
    resp.endResponse();
  }

  static void handleGetNextShade(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    uint8_t shadeId = somfy.getNextShadeId();
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.addElem("shadeId", shadeId);
    resp.addElem("remoteAddress", (uint32_t)somfy.getNextRemoteAddress(shadeId));
    resp.addElem("bitLength", somfy.transceiver.config.type);
    resp.addElem("stepSize", (uint8_t)100);
    resp.addElem("proto", static_cast<uint8_t>(somfy.transceiver.config.proto));
    resp.endObject();
    resp.endResponse();
  }

  static void handleGetNextGroup(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    uint8_t groupId = somfy.getNextGroupId();
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.addElem("groupId", groupId);
    resp.addElem("remoteAddress", (uint32_t)somfy.getNextRemoteAddress(groupId));
    resp.addElem("bitLength", somfy.transceiver.config.type);
    resp.addElem("proto", static_cast<uint8_t>(somfy.transceiver.config.proto));
    resp.endObject();
    resp.endResponse();
  }

  static void handleGetNextSchedule(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    JsonAsyncResponse resp;
    resp.beginResponse(request);
    resp.beginObject();
    resp.addElem("id", schedule.getNextScheduleId());
    resp.endObject();
    resp.endResponse();
  }

  static void handleAddRoom(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    SomfyRoom * room = nullptr;
    if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
      DBG_PRINTLN("Adding a room");
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, asyncGetBody(request));
      if (err) {
        webServer.handleDeserializationError(request, err);
        return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        DBG_PRINTLN("Counting rooms");
        if (somfy.roomCount() > SOMFY_MAX_ROOMS) {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Maximum number of rooms exceeded.\"}");
          return;
        }
        else {
          DBG_PRINTLN("Adding room");
          room = somfy.addRoom(obj);
          if (!room) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error adding room.\"}");
            return;
          }
        }
      }
    }
    if (room) {
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginObject();
      room->toJSON(resp);
      resp.endObject();
      resp.endResponse();
    }
    else {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error saving Somfy Room.\"}");
    }
  }

  static void handleAddShade(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    SomfyShade* shade = nullptr;
    if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
      DBG_PRINTLN("Adding a shade");
      DynamicJsonDocument doc(1024);
      DeserializationError err = deserializeJson(doc, asyncGetBody(request));
      if (err) {
        webServer.handleDeserializationError(request, err);
        return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        DBG_PRINTLN("Counting shades");
        if (somfy.shadeCount() > SOMFY_MAX_SHADES) {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Maximum number of shades exceeded.\"}");
          return;
        }
        else {
          DBG_PRINTLN("Adding shade");
          shade = somfy.addShade(obj);
          if (!shade) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error adding shade.\"}");
            return;
          }
        }
      }
    }
    if (shade) {
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginObject();
      shade->toJSON(resp);
      resp.endObject();
      resp.endResponse();
    }
    else {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error saving Somfy Shade.\"}");
    }
  }

  static void handleAddGroup(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    SomfyGroup * group = nullptr;
    if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
      DBG_PRINTLN("Adding a group");
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, asyncGetBody(request));
      if (err) {
        webServer.handleDeserializationError(request, err);
        return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        DBG_PRINTLN("Counting shades");
        if (somfy.groupCount() > SOMFY_MAX_GROUPS) {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Maximum number of groups exceeded.\"}");
          return;
        }
        else {
          DBG_PRINTLN("Adding group");
          group = somfy.addGroup(obj);
          if (!group) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error adding group.\"}");
            return;
          }
        }
      }
    }
    if (group) {
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginObject();
      group->toJSON(resp);
      resp.endObject();
      resp.endResponse();
    }
    else {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error saving Somfy Group.\"}");
    }
  }

  static void handleAddSchedule(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    ScheduleRule *rule = nullptr;
    if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
      DBG_PRINTLN("Adding a schedule");
      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, asyncGetBody(request));
      if (err) {
        webServer.handleDeserializationError(request, err);
        return;
      }
      else {
        JsonObject obj = doc.as<JsonObject>();
        if (schedule.scheduleCount() >= SOMFY_MAX_SCHEDULES) {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Maximum number of schedules exceeded.\"}");
          return;
        }
        else {
          rule = schedule.addSchedule(obj);
          if (!rule) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error adding schedule. Check the target shade/group id and value ranges.\"}");
            return;
          }
        }
      }
    }
    if (rule) {
      JsonAsyncResponse resp;
      resp.beginResponse(request);
      resp.beginObject();
      rule->toJSON(resp);
      resp.endObject();
      resp.endResponse();
    }
    else {
      request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Error saving Schedule.\"}");
    }
  }

  static void handleGroupOptions(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::GET || method == AsyncHttp::POST) {
      if (request->hasArg("groupId")) {
        int groupId = atoi(request->arg("groupId").c_str());
        SomfyGroup* group = somfy.getGroupById(groupId);
        if (group) {
          JsonAsyncResponse resp;
          resp.beginResponse(request);
          resp.beginObject();
          group->toJSON(resp);
          resp.beginArray("availShades");
          for(uint8_t i = 0; i < SOMFY_MAX_SHADES; i++) {
            SomfyShade *shade = &somfy.shades[i];
            if(shade->getShadeId() != 255) {
              bool isLinked = false;
              for(uint8_t j = 0; j < SOMFY_MAX_GROUPED_SHADES; j++) {
                if(group->linkedShades[j] == shade->getShadeId()) {
                  isLinked = true;
                  break;
                }
              }
              if(!isLinked) {
                resp.beginObject();
                shade->toJSONRef(resp);
                resp.endObject();
              }
            }
          }
          resp.endArray();
          resp.endObject();
          resp.endResponse();
        }
        else {
          request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group Id not found.\"}");
          return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"You must supply a valid group id.\"}");
      }
    }
  }

  static void handleSaveRoom(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Updating a room");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("roomId")) {
            SomfyRoom* room = somfy.getRoomById(obj["roomId"]);
            if (room) {
              room->fromJSON(obj);
              room->save();
              JsonAsyncResponse resp;
              resp.beginResponse(request);
              resp.beginObject();
              room->toJSON(resp);
              resp.endObject();
              resp.endResponse();
            }
            else {
              request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Room Id not found.\"}");
              return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
            }
          }
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No room id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No room object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
  }

  static void handleSaveShade(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Updating a shade");
        DynamicJsonDocument doc(1024);
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
              int8_t err = shade->fromJSON(obj);
              if(err == 0) {
                shade->save();
                JsonAsyncResponse resp;
                resp.beginResponse(request);
                resp.beginObject();
                shade->toJSON(resp);
                resp.endObject();
                resp.endResponse();
              }
              else {
                snprintf(g_content, sizeof(g_content), "{\"status\":\"DATA\",\"desc\":\"Data Error.\", \"code\":%d}", err);
                request->send(500, _encoding_json, g_content);
              }
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
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
  }

  static void handleSaveGroup(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Updating a group");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("groupId")) {
            SomfyGroup* group = somfy.getGroupById(obj["groupId"]);
            if (group) {
              group->fromJSON(obj);
              group->save();
              JsonAsyncResponse resp;
              resp.beginResponse(request);
              resp.beginObject();
              group->toJSON(resp);
              resp.endObject();
              resp.endResponse();
            }
            else {
              request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group Id not found.\"}");
              return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
            }
          }
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No group id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No group object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
  }

  static void handleSaveSchedule(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Updating a schedule");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("id")) {
            // Verrouillé le temps de lire+muter le ScheduleRule ET de le committer : sans ça,
            // checkSchedules()/checkVerifications() (tâche Arduino, toutes les ~5-30s) peuvent lire
            // la règle à mi-chemin entre deux champs mutés par fromJSON() (ex: timeRef déjà écrit,
            // sunOffset pas encore), ou commit() peut écrire schedules.cfg en même temps que le
            // commit() explicite ci-dessous -- cf. le verrou déjà en place dans ScheduleController.
            schedule.lock();
            ScheduleRule *rule = schedule.getScheduleById(obj["id"]);
            if (rule) {
              int8_t err = rule->fromJSON(obj);
              if(err == 0) {
                schedule.isDirty = true;
                schedule.commit();
                JsonAsyncResponse resp;
                resp.beginResponse(request);
                resp.beginObject();
                rule->toJSON(resp);
                resp.endObject();
                resp.endResponse();
                schedule.unlock();
              }
              else {
                schedule.unlock();
                snprintf(g_content, sizeof(g_content), "{\"status\":\"DATA\",\"desc\":\"Data Error.\", \"code\":%d}", err);
                request->send(500, _encoding_json, g_content);
              }
            }
            else {
              schedule.unlock();
              request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Schedule Id not found.\"}");
            }
          }
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No schedule id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No schedule object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
  }

  static void handleLinkToGroup(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Linking a shade to a group");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          uint8_t shadeId = obj.containsKey("shadeId") ? obj["shadeId"] : 0;
          uint8_t groupId = obj.containsKey("groupId") ? obj["groupId"] : 0;
          if(groupId == 0) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group id not provided.\"}");
            return;
          }
          if(shadeId == 0) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade id not provided.\"}");
            return;
          }
          SomfyGroup * group = somfy.getGroupById(groupId);
          if(!group) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group id not found.\"}");
            return;
          }
          SomfyShade * shade = somfy.getShadeById(shadeId);
          if(!shade) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade id not found.\"}");
            return;
          }
          group->linkShade(shadeId);
          JsonAsyncResponse resp;
          resp.beginResponse(request);
          resp.beginObject();
          group->toJSON(resp);
          resp.endObject();
          resp.endResponse();
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No linking object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
  }

  static void handleUnlinkFromGroup(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    if (method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (asyncHasBody(request)) {
        DBG_PRINTLN("Unlinking a shade from a group");
        DynamicJsonDocument doc(512);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          uint8_t shadeId = obj.containsKey("shadeId") ? obj["shadeId"] : 0;
          uint8_t groupId = obj.containsKey("groupId") ? obj["groupId"] : 0;
          if(groupId == 0) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group id not provided.\"}");
            return;
          }
          if(shadeId == 0) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade id not provided.\"}");
            return;
          }
          SomfyGroup * group = somfy.getGroupById(groupId);
          if(!group) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group id not found.\"}");
            return;
          }
          SomfyShade * shade = somfy.getShadeById(shadeId);
          if(!shade) {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade id not found.\"}");
            return;
          }
          group->unlinkShade(shadeId);
          JsonAsyncResponse resp;
          resp.beginResponse(request);
          resp.beginObject();
          group->toJSON(resp);
          resp.endObject();
          resp.endResponse();
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No unlinking object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
  }

  static void handleDeleteRoom(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t roomId = 0;
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (request->hasArg("roomId")) {
        roomId = atoi(request->arg("roomId").c_str());
      }
      else if (asyncHasBody(request)) {
        DBG_PRINTLN("Deleting a Room");
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("roomId")) roomId = obj["roomId"];
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No room id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No room object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
    SomfyRoom* room = somfy.getRoomById(roomId);
    if (!room) request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Room with the specified id not found.\"}");
    else {
      somfy.deleteRoom(roomId);
      request->send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Room deleted.\"}");
    }
  }

  static void handleDeleteShade(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t shadeId = 255;
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (request->hasArg("shadeId")) {
        shadeId = atoi(request->arg("shadeId").c_str());
      }
      else if (asyncHasBody(request)) {
        DBG_PRINTLN("Deleting a shade");
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
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No shade object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
    SomfyShade* shade = somfy.getShadeById(shadeId);
    if (!shade) request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Shade with the specified id not found.\"}");
    else if(shade->isInGroup()) {
      request->send(400, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"This shade is a member of a group and cannot be deleted.\"}");
    }
    else {
      somfy.deleteShade(shadeId);
      request->send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Shade deleted.\"}");
    }
  }

  static void handleDeleteGroup(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t groupId = 255;
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (request->hasArg("groupId")) {
        groupId = atoi(request->arg("groupId").c_str());
      }
      else if (asyncHasBody(request)) {
        DBG_PRINTLN("Deleting a group");
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
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No group object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
    SomfyGroup * group = somfy.getGroupById(groupId);
    if (!group) request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Group with the specified id not found.\"}");
    else {
      somfy.deleteGroup(groupId);
      request->send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Group deleted.\"}");
    }
  }

  static void handleDeleteSchedule(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    WebRequestMethodComposite method = request->method();
    uint8_t scheduleId = 255;
    if (method == AsyncHttp::GET || method == AsyncHttp::PUT || method == AsyncHttp::POST) {
      if (request->hasArg("scheduleId")) {
        scheduleId = atoi(request->arg("scheduleId").c_str());
      }
      else if (asyncHasBody(request)) {
        DBG_PRINTLN("Deleting a schedule");
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, asyncGetBody(request));
        if (err) {
          webServer.handleDeserializationError(request, err);
          return;
        }
        else {
          JsonObject obj = doc.as<JsonObject>();
          if (obj.containsKey("id")) scheduleId = obj["id"];
          else {
            request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No schedule id was supplied.\"}");
            return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
          }
        }
      }
      else {
        request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"No schedule object supplied.\"}");
        return;   // M-22 : sans ce return, le flux reprenait apres le bloc et posait une SECONDE reponse
      }
    }
    if (!schedule.getScheduleById(scheduleId)) request->send(500, _encoding_json, "{\"status\":\"ERROR\",\"desc\":\"Schedule with the specified id not found.\"}");
    else {
      schedule.deleteSchedule(scheduleId);
      request->send(200, _encoding_json, "{\"status\":\"SUCCESS\",\"desc\":\"Schedule deleted.\"}");
    }
  }

  static void handleRoomSortOrder(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(512);
    if(settings.enableDebugLogs) {
      Serial.print("Plain: ");
      Serial.print(request->method());
      Serial.println(asyncGetBody(request));
    }
    DeserializationError err = deserializeJson(doc, asyncGetBody(request));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonArray arr = doc.as<JsonArray>();
      WebRequestMethodComposite method = request->method();
      if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
        uint8_t order = 0;
        for(JsonVariant v : arr) {
          uint8_t roomId = v.as<uint8_t>();
          if (roomId != 0) {
            SomfyRoom *room = somfy.getRoomById(roomId);
            if(room) room->sortOrder = order++;
          }
        }
        // Sans ce drapeau, les trois handlers d'ordre ne faisaient QUE muter la RAM : rien ne
        // déclenchait l'écriture de shades.cfg (SomfyShadeController::loop() ne commit que sur
        // isDirty), donc le réordonnancement disparaissait au redémarrage suivant -- alors que
        // l'interface affichait un succès.
        somfy.isDirty = true;
        request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully set room order\"}");
      }
      else {
        request->send(201, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleShadeSortOrder(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(512);
    if(settings.enableDebugLogs) {
      Serial.print("Plain: ");
      Serial.print(request->method());
      Serial.println(asyncGetBody(request));
    }
    DeserializationError err = deserializeJson(doc, asyncGetBody(request));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonArray arr = doc.as<JsonArray>();
      WebRequestMethodComposite method = request->method();
      if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
        uint8_t order = 0;
        for(JsonVariant v : arr) {
          uint8_t shadeId = v.as<uint8_t>();
          if (shadeId != 255) {
            SomfyShade *shade = somfy.getShadeById(shadeId);
            if(shade) shade->sortOrder = order++;
          }
        }
        somfy.isDirty = true;   // cf. handleRoomSortOrder
        request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully set shade order\"}");
      }
      else {
        request->send(201, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  static void handleGroupSortOrder(AsyncWebServerRequest *request) {
    if(request->method() == AsyncHttp::OPTIONS) { request->send(200, "OK"); return; }
    if(!webServer.isAuthenticated(request, true)) return;
    DynamicJsonDocument doc(512);
    if(settings.enableDebugLogs) {
      Serial.print("Plain: ");
      Serial.print(request->method());
      Serial.println(asyncGetBody(request));
    }
    DeserializationError err = deserializeJson(doc, asyncGetBody(request));
    if (err) {
      webServer.handleDeserializationError(request, err);
      return;
    }
    else {
      JsonArray arr = doc.as<JsonArray>();
      WebRequestMethodComposite method = request->method();
      if (method == AsyncHttp::POST || method == AsyncHttp::PUT) {
        uint8_t order = 0;
        for(JsonVariant v : arr) {
          uint8_t groupId = v.as<uint8_t>();
          if (groupId != 255) {
            SomfyGroup *group = somfy.getGroupById(groupId);
            if(group) group->sortOrder = order++;
          }
        }
        somfy.isDirty = true;   // cf. handleRoomSortOrder
        request->send(200, "application/json", "{\"status\":\"OK\",\"desc\":\"Successfully set group order\"}");
      }
      else {
        request->send(201, "application/json", "{\"status\":\"ERROR\",\"desc\":\"Invalid HTTP Method: \"}");
      }
    }
  }

  void registerRoutes(AsyncWebServer &server) {
    server.on("/rooms", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetRooms(request); });
    server.on("/shades", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetShades(request); });
    server.on("/groups", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetGroups(request); });
    server.on("/schedules", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetSchedules(request); });
    server.on("/room", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleRoom(request); }, nullptr, asyncBodyHandler);
    server.on("/shade", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleShade(request); }, nullptr, asyncBodyHandler);
    server.on("/group", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGroup(request); }, nullptr, asyncBodyHandler);
    server.on("/schedule", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSchedule(request); });
    server.on("/getNextRoom", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetNextRoom(request); });
    server.on("/getNextShade", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetNextShade(request); });
    server.on("/getNextGroup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetNextGroup(request); });
    server.on("/getNextSchedule", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGetNextSchedule(request); });
    server.on("/addRoom", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleAddRoom(request); }, nullptr, asyncBodyHandler);
    server.on("/addShade", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleAddShade(request); }, nullptr, asyncBodyHandler);
    server.on("/addGroup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleAddGroup(request); }, nullptr, asyncBodyHandler);
    server.on("/addSchedule", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleAddSchedule(request); }, nullptr, asyncBodyHandler);
    server.on("/groupOptions", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGroupOptions(request); });
    server.on("/saveRoom", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSaveRoom(request); }, nullptr, asyncBodyHandler);
    server.on("/saveShade", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSaveShade(request); }, nullptr, asyncBodyHandler);
    server.on("/saveGroup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSaveGroup(request); }, nullptr, asyncBodyHandler);
    server.on("/saveSchedule", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleSaveSchedule(request); }, nullptr, asyncBodyHandler);
    server.on("/linkToGroup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleLinkToGroup(request); }, nullptr, asyncBodyHandler);
    server.on("/unlinkFromGroup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleUnlinkFromGroup(request); }, nullptr, asyncBodyHandler);
    server.on("/deleteRoom", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleDeleteRoom(request); }, nullptr, asyncBodyHandler);
    server.on("/deleteShade", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleDeleteShade(request); }, nullptr, asyncBodyHandler);
    server.on("/deleteGroup", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleDeleteGroup(request); }, nullptr, asyncBodyHandler);
    server.on("/deleteSchedule", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleDeleteSchedule(request); }, nullptr, asyncBodyHandler);
    server.on("/roomSortOrder", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleRoomSortOrder(request); }, nullptr, asyncBodyHandler);
    server.on("/shadeSortOrder", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleShadeSortOrder(request); }, nullptr, asyncBodyHandler);
    server.on("/groupSortOrder", AsyncHttp::ANY, [](AsyncWebServerRequest *request) { handleGroupSortOrder(request); }, nullptr, asyncBodyHandler);
  }
}
