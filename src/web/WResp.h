// WebServer.h AVANT ESPAsyncWebServer.h dans CHAQUE en-tête qui inclut cette dernière (cf. les
// mêmes deux lignes dans Web.h/WebCommon.h/WebStatic.h/WebAuth.h/WebI18n.h/WebNetwork.h/
// WebSystem.h/WebShadesRest.h/WebRadioCommands.h) : ESPAsyncWebServer.h ne redéfinit
// HTTP_GET/HTTP_POST/... QUE si WEBSERVER_H n'est pas déjà défini dans l'unité de compilation
// courante (garde `#ifndef WEBSERVER_H`) -- sans cet ordre, selon quel en-tête est inclus en
// premier dans une unité de compilation donnée, les deux bibliothèques peuvent déclarer les mêmes
// noms HTTP_GET/HTTP_POST/... dans deux enums globaux distincts, ce qui ne compile pas ("conflicts
// with a previous declaration"). Recovery.h (portail de secours, distinct du serveur principal
// migré vers ESPAsyncWebServer) reste l'unique consommateur du type WebServer lui-même -- mais le
// simple fait d'inclure WebServer.h avant ESPAsyncWebServer.h suffit à fixer l'ordre pour toute
// unité de compilation, qu'elle atteigne Recovery.h ou non. Les valeurs numériques réellement
// utilisées à l'exécution par AsyncWebServerRequest::method() ne dépendent pas de ce choix --
// cf. WebCommon.h::AsyncHttp.
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ESPAsyncWebServer.h>
#ifndef wresp_h
#define wresp_h

class JsonFormatter {
  protected:
    char *buff;
    size_t buffSize;
    size_t _cursor = 0;
    bool _headersSent = false;
    uint8_t _objects = 0;
    uint8_t _arrays = 0;
    bool _nocomma = true;
    char _numbuff[25] = {0};
    virtual void _safecat(const char *val, bool escape = false);
    void _appendNumber(const char *name);
  public:
    void escapeString(const char *raw, char *escaped);
    uint32_t calcEscapedLength(const char *raw);
    void beginObject(const char *name = nullptr);
    void endObject();
    void beginArray(const char *name = nullptr);
    void endArray();
    void appendElem(const char *name = nullptr);

    void addElem(const char* val);
    void addElem(float fval);
    void addElem(int8_t nval);
    void addElem(uint8_t nval);
    /*
    void addElem(int32_t nval);
    void addElem(int16_t nval);
    void addElem(uint16_t nval);
    void addElem(unsigned int nval);
    */
    void addElem(int32_t lval);
    void addElem(uint32_t lval);
    void addElem(bool bval);
    
    void addElem(const char* name, float fval);
    void addElem(const char* name, int8_t nval);
    void addElem(const char* name, uint8_t nval);
    /*
    void addElem(const char* name, int nval);
    void addElem(const char* name, int16_t nval);
    void addElem(const char* name, uint16_t nval);
    void addElem(const char* name, unsigned int nval);
    */
    void addElem(const char* name, int32_t lval);
    void addElem(const char* name, uint32_t lval);
    void addElem(const char* name, bool bval);
    void addElem(const char *name, const char *val);
};
// Écrit directement dans un AsyncResponseStream (backend StreamString qui grandit dynamiquement),
// ce qui élimine tout risque de dépassement d'un buffer fixe partagé pour les réponses JSON.
class JsonAsyncResponse : public JsonFormatter {
  protected:
    void _safecat(const char *val, bool escape = false) override;
  public:
    AsyncWebServerRequest *request = nullptr;
    AsyncResponseStream *stream = nullptr;
    void beginResponse(AsyncWebServerRequest *request);
    void endResponse();
};
class JsonSockEvent : public JsonFormatter {
  protected:
    bool _closed = false;
    bool _overflowed = false;
    void _safecat(const char *val, bool escape = false) override;
  public:
    WebSocketsServer *server = nullptr;
    void beginEvent(WebSocketsServer *server, const char *evt, char *buff, size_t buffSize);
    void endEvent(uint8_t clientNum = 255);
    void closeEvent();
};
#endif
