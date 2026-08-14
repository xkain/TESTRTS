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
    // expectedSize : réservé d'un coup dans le StreamString sous-jacent (AsyncResponseStream(...,
    // bufferSize) -> _content.reserve(bufferSize), cf. ESPAsyncWebServer/WebResponses.cpp) --
    // PAS juste une capacité initiale ignorable. Sans ce paramètre, beginResponseStream() retombe
    // sur son propre défaut RESPONSE_STREAM_BUFFER_SIZE = 1460 octets : dès qu'une réponse JSON le
    // dépasse (fréquent -- /controller, /discover, /getReleases... dépassent all largement dès
    // quelques volets/releases), CHAQUE appel _safecat() suivant (un par champ/virgule/accolade,
    // potentiellement des centaines par réponse) déclenche un realloc() exact-fit individuel
    // (String::concat() -> reserve(len()+length), pas de croissance géométrique sur ce core, cf.
    // WString.cpp) : autant de petites relocalisations qui truffent le tas de trous de tailles
    // disparates. Root cause identifiée d'un phénomène de fragmentation apparu avec la migration
    // ESPAsyncWebServer (l'ancien WebServer streamait directement sur le socket TCP, sans ce
    // tampon String intermédiaire) -- et cause probable des échecs "ERR_GIT_LOW_HEAP" (heap trop
    // fragmenté pour un handshake TLS mbedTLS, qui exige ~45 Ko d'UN SEUL bloc contigu, cf.
    // GIT_TLS_MIN_HEAP_BYTES dans GitOTA.cpp) après un usage prolongé de l'UI. Réserver la bonne
    // taille en une fois rend tous les reserve() internes ultérieurs des no-op (String::reserve()
    // ne réalloue que si capacity() < size) : une seule grosse allocation, libérée dès la fin de
    // la requête, au lieu de dizaines de petites qui s'éparpillent durablement dans le tas.
    void beginResponse(AsyncWebServerRequest *request, size_t expectedSize = 4096);
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
