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
class JsonResponse : public JsonFormatter {
  protected:
    void _safecat(const char *val, bool escape = false) override;
  public:
    WebServer *server;
    void beginResponse(WebServer *server, char *buff, size_t buffSize);
    void endResponse();
    void send();
};
// Équivalent de JsonResponse pour ESPAsyncWebServer (étape 3+ migration) : JsonResponse est câblée
// en dur sur WebServer* (setContentLength/send_P/sendContent, chunking manuel dans un buffer fixe
// partagé) -- incompatible avec AsyncWebServerRequest*. Écrit directement dans un AsyncResponseStream
// (backend StreamString qui grandit dynamiquement), ce qui élimine au passage tout risque de
// dépassement du buffer fixe partagé g_content pour les réponses migrées vers cette classe.
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
