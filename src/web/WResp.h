// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
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
    // JsonFormatter écrit dans un tampon FIXE : quand un fragment ne tient pas, l'abandonner puis
    // poursuivre produirait un JSON structurellement FAUX (accolade sans clé, virgule orpheline,
    // chaîne non fermée) plutôt qu'un JSON tronqué détectable -- un 200 que le client ne peut pas
    // analyser. Ce drapeau vit dans la classe de BASE pour couvrir tous les écrivains.
    bool _overflowed = false;
    virtual void _safecat(const char *val, bool escape = false);
    void _appendNumber(const char *name);
  public:
    // Utilisable directement, sans sous-classe, sur un tampon déjà alloué par l'appelant :
    // l'implémentation par défaut de _safecat() y écrit avec troncature bornée. Sert au serveur HTTP
    // synchrone des opérations OTA bloquantes (WebGitSync.cpp), qui alloue son PROPRE tampon
    // transitoire -- surtout pas g_content, réservé à async_tcp (cf. WebCommon.h).
    void begin(char *buff, size_t buffSize) {
      this->buff = buff;
      this->buffSize = buffSize;
      this->_cursor = 0;
      this->_nocomma = true;
      this->_overflowed = false;
      if(buffSize) this->buff[0] = 0x00;
    }
    // À INTERROGER par tout appelant qui sérialise dans un tampon fixe, avant d'émettre la réponse :
    // vrai signifie que le contenu n'est pas du JSON valide et ne doit pas partir tel quel (cf.
    // WebGitSync::handleGetReleases, où une liste de releases aux noms longs peut saturer ses
    // 4096 octets).
    bool overflowed() const { return this->_overflowed; }
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
    // expectedSize : réservé d'un coup dans le StreamString sous-jacent (_content.reserve, cf.
    // ESPAsyncWebServer/WebResponses.cpp) -- PAS une capacité initiale ignorable. Sans ce paramètre,
    // beginResponseStream() retombe sur RESPONSE_STREAM_BUFFER_SIZE = 1460 octets : dès qu'une
    // réponse le dépasse, CHAQUE _safecat() suivant (un par champ, virgule, accolade) déclenche un
    // realloc() exact-fit -- String::concat() fait reserve(len()+length), sans croissance
    // géométrique sur ce core -- et truffe le tas de trous de tailles disparates. C'est la cause
    // identifiée de la fragmentation apparue avec la migration ESPAsyncWebServer (l'ancien WebServer
    // streamait directement sur le socket), et probablement des "ERR_GIT_LOW_HEAP" après un usage
    // prolongé de l'UI. Réserver la bonne taille d'emblée rend les reserve() internes suivants des
    // no-op : une grosse allocation libérée en fin de requête, au lieu de dizaines de petites.
    // Les plus grosses réponses du projet (/controller, /discovery) ne passent plus par ici : elles
    // sont chunkées (cf. WebChunkedJson.h).
    void beginResponse(AsyncWebServerRequest *request, size_t expectedSize = 4096);
    void endResponse();
};
// Remet à zéro le compteur d'échecs d'émission consécutifs d'un emplacement client. À appeler à
// chaque connexion ET déconnexion : les emplacements du pool sont RÉUTILISÉS, donc sans cette
// remise à zéro un nouveau client hériterait des échecs de celui qui occupait l'emplacement avant
// lui et se ferait éjecter prématurément. Cf. sendFrameFanOut() dans WResp.cpp.
void resetSockWriteFailures(uint8_t num);

// Vrai si l'emplacement client a présenté une clé d'API valide au moment de sa poignée de main (cf.
// SocketEmitter::wsEvent, WStype_CONNECTED). Défini dans Sockets.cpp -- déclaré ici pour la même
// raison que resetSockWriteFailures ci-dessus : c'est le seul en-tête que WResp.cpp et Sockets.cpp
// ont en commun, et sendFrameFanOut() doit pouvoir écarter un emplacement non autorisé encore en
// attente de sa déconnexion différée, sans quoi une diffusion générale pourrait l'atteindre pendant
// cette courte fenêtre.
bool sockClientAuthorized(uint8_t num);

// Révoque toutes les sessions WebSocket en cours : les clients seront coupés au prochain tour de la
// boucle principale et devront repasser par une poignée de main authentifiée. À appeler dès que les
// réglages de sécurité changent -- sans quoi une session ouverte avec l'ancien PIN/mot de passe
// continuerait de recevoir l'état des équipements indéfiniment, alors que le jeton HTTP correspondant,
// lui, devient invalide immédiatement (il est recalculé à chaque requête). Sûre depuis n'importe
// quelle tâche : ne touche que deux masques de bits, jamais sockServer.
void sockRevokeAllClients();

class JsonSockEvent : public JsonFormatter {
  protected:
    bool _closed = false;
    // _overflowed vit dans JsonFormatter : le redéclarer ici le masquerait, et les deux drapeaux
    // divergeraient silencieusement.
    // Mode "puits" : toutes les écritures sont ignorées et rien n'est envoyé. Sert au repli quand
    // aucun emplacement d'émission différée n'est disponible (cf. Sockets.cpp) -- les appelants
    // continuent d'appeler beginObject()/addElem() normalement sur le pointeur reçu, sans avoir à
    // tester quoi que ce soit, et l'évènement est simplement perdu.
    bool _discard = false;
    void _safecat(const char *val, bool escape = false) override;
  public:
    WebSocketsServer *server = nullptr;
    void beginEvent(WebSocketsServer *server, const char *evt, char *buff, size_t buffSize);
    // Prépare l'objet en mode puits. Aucun tampon n'est requis : rien n'y sera écrit.
    void beginDiscard();
    void endEvent(uint8_t clientNum = 255);
    void closeEvent();
    // Émet le contenu déjà composé vers un serveur donné, sans repasser par beginEvent(). Utilisé
    // par le drainage des émissions différées : la composition a eu lieu sur une autre tâche, seule
    // l'émission doit se faire sur la tâche principale.
    void sendComposed(WebSocketsServer *srv, uint8_t clientNum);
    bool isDiscarding() const { return this->_discard; }
};
#endif
