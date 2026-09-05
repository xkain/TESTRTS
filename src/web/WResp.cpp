#include <esp_task_wdt.h>
#include <math.h>
#include "WResp.h"

// Rendu d'un float dans _numbuff (25 octets) -- cf. addElem(float) plus bas.
//
// L'ancien `sprintf(_numbuff, "%.4f", fval)` était un débordement de pile en attente : un float non
// borné rend jusqu'à ~44 caractères ("%.4f" de 3.4e38), et _numbuff est un membre de l'objet
// formateur, lui-même sur la pile de l'appelant. La valeur venait bel et bien du réseau -- la
// fréquence radio est un float recopié tel quel depuis le JSON de /saveRadio, puis persisté en NVS :
// un seul appel suffisait à faire planter l'appareil à CHAQUE /getRadio, /controller ou /discovery
// ultérieur.
//
// Deux pièges au-delà du simple snprintf :
//   - NaN/inf rendent "nan"/"inf", qui ne sont pas des nombres JSON : le navigateur lève sur
//     JSON.parse et toute l'interface tombe (le piège est documenté pour geoLat dans
//     ConfigSettings.h, mais la parade n'y avait jamais été généralisée).
//   - un snprintf qui TRONQUE laisse un nombre syntaxiquement valide mais numériquement faux
//     (1e30 -> "100000000000000001988462"), ce qui est pire qu'une notation compacte. On bascule
//     donc sur %g quand la forme décimale ne tient pas.
static void _fmtFloat(char *buff, size_t size, float fval) {
  if(isnan(fval) || isinf(fval)) { strlcpy(buff, "0", size); return; }
  int n = snprintf(buff, size, "%.4f", fval);
  if(n < 0 || (size_t)n >= size) snprintf(buff, size, "%.6g", fval);
}

// Diffusion d'une trame déjà composée, en remplacement de WebSocketsServer::broadcastTXT()
// (motif "réseau bloquant sur loopTask", 17/08/2026).
//
// PROBLÈME. Toute émission se termine dans WebSockets::write() (links2004), une attente ACTIVE
// bornée seulement par WEBSOCKETS_TCP_TIMEOUT, qui tourne tant que le client ne libère pas sa
// fenêtre TCP (onglet en arrière-plan, portable en veille, Wi-Fi qui retransmet). Depuis le
// découplage d'async_tcp, la tâche PRINCIPALE est la seule à parler à sockServer : ce blocage lui
// vole son temps, et avec lui la RF Somfy, la planification et le suivi de position.
//   - broadcastTXT() itère sur TOUS les clients dans un seul appel, sans point où intercaler un
//     esp_task_wdt_reset() -- et la bibliothèque n'en contient aucun (vérifié). 3 clients bloqués
//     suffisent à dépasser les 15 s d'esp_task_wdt_init() : redémarrage.
//   - sendTXT() renvoie false quand write() a rendu la main sans tout écrire : la trame part alors
//     TRONQUÉE et le flux WebSocket du client est désynchronisé pour de bon. La bibliothèque ignore
//     ce retour et le laisse dans cet état jusqu'à expiration du heartbeat, ~50 s plus tard.
//
// CORRECTIF. On déroule la boucle sur les clients nous-mêmes, ce qui ouvre les deux points
// d'action que broadcastTXT() interdisait : nourrir le chien de garde ENTRE chaque client (aucun
// intervalle ne dépasse plus le temps d'UNE trame, quel que soit le nombre de clients bloqués), et
// réagir à l'échec.
//
// POURQUOI PAS AU PREMIER ÉCHEC. Une première version déconnectait dès le premier envoi incomplet.
// C'était trop nerveux : SocketEmitter::initClients() envoie une RAFALE d'état complet à chaque
// client qui vient de se connecter -- un client momentanément lent y échoue, se fait déconnecter,
// se reconnecte, reçoit à nouveau la rafale, échoue encore... une boucle de reconnexion qui brasse
// le tas en continu. On exige donc SOCK_WRITE_FAIL_LIMIT échecs CONSÉCUTIFS, le compteur étant
// remis à zéro par le moindre envoi réussi : une congestion passagère ne coûte rien, seul un client
// réellement parti finit par être libéré.
//
// Le couple (WEBSOCKETS_TCP_TIMEOUT, SOCK_WRITE_FAIL_LIMIT) forme un tout : le premier borne la
// durée d'un blocage, le second évite que cette borne plus courte ne devienne une machine à
// déconnecter. Ne pas changer l'un sans reconsidérer l'autre.
#define SOCK_WRITE_FAIL_LIMIT 3
static uint8_t g_writeFailures[WEBSOCKETS_SERVER_CLIENT_MAX] = {0};

void resetSockWriteFailures(uint8_t num) {
  if(num < WEBSOCKETS_SERVER_CLIENT_MAX) g_writeFailures[num] = 0;
}

static void sendFrameFanOut(WebSocketsServer *srv, uint8_t num, const char *payload) {
  if(!srv || !payload) return;
  // Rien ne part vers un emplacement non authentifié : sa déconnexion est différée au prochain tour
  // de boucle principale (cf. SocketEmitter::loop), et une diffusion générale pourrait l'atteindre
  // entre-temps. Cf. sockClientAuthorized() dans WResp.h.
  if(num != 255 && !sockClientAuthorized(num)) return;
  // esp_task_wdt_reset() renvoie une erreur si la tâche courante n'est pas inscrite au watchdog
  // (cas des tâches autres que la principale, et de la fenêtre de démarrage avant
  // esp_task_wdt_add()) -- sans effet et sans danger, on ignore le retour.
  if(num != 255) {
    esp_task_wdt_reset();
    if(num < WEBSOCKETS_SERVER_CLIENT_MAX) {
      if(srv->sendTXT(num, payload)) g_writeFailures[num] = 0;
      else if(++g_writeFailures[num] >= SOCK_WRITE_FAIL_LIMIT) {
        Serial.printf("Socket [%u]: %u emissions incompletes consecutives, deconnexion\n",
          num, (unsigned)SOCK_WRITE_FAIL_LIMIT);
        srv->disconnect(num);
        g_writeFailures[num] = 0;
      }
    }
    esp_task_wdt_reset();
    return;
  }
  for(uint8_t i = 0; i < WEBSOCKETS_SERVER_CLIENT_MAX; i++) {
    if(!srv->clientIsConnected(i)) continue;
    if(!sockClientAuthorized(i)) continue;
    esp_task_wdt_reset();
    if(srv->sendTXT(i, payload)) g_writeFailures[i] = 0;
    else if(++g_writeFailures[i] >= SOCK_WRITE_FAIL_LIMIT) {
      Serial.printf("Socket [%u]: %u emissions incompletes consecutives, deconnexion\n",
        i, (unsigned)SOCK_WRITE_FAIL_LIMIT);
      srv->disconnect(i);
      g_writeFailures[i] = 0;
    }
  }
  esp_task_wdt_reset();
}
void JsonSockEvent::beginEvent(WebSocketsServer *server, const char *evt, char *buff, size_t buffSize) {
  this->server = server;
  this->buff = buff;
  this->buffSize = buffSize;
  this->_nocomma = true;
  this->_closed = false;
  this->_overflowed = false;
  this->_discard = false;
  snprintf(this->buff, buffSize, "42[%s,", evt);
  this->_cursor = strlen(this->buff);
}
void JsonSockEvent::beginDiscard() {
  this->server = nullptr;
  this->buff = nullptr;
  this->buffSize = 0;
  this->_nocomma = true;
  this->_closed = false;
  this->_overflowed = false;
  this->_discard = true;
  this->_cursor = 0;
}
void JsonSockEvent::sendComposed(WebSocketsServer *srv, uint8_t clientNum) {
  // Le contenu a déjà été composé et clos par la tâche émettrice ; on ne fait que l'envoyer. Pas de
  // closeEvent() ici : il a été fait côté composition, avant la publication de l'emplacement.
  if(this->_discard || this->_overflowed || !srv || !this->buff) return;
  sendFrameFanOut(srv, clientNum, this->buff);
}
void JsonSockEvent::closeEvent() {
  if(this->_discard) { this->_closed = true; return; }
  if(!this->_closed && !this->_overflowed) {
    if(this->_cursor + 1 < this->buffSize) {
      this->buff[this->_cursor] = ']';
      this->_cursor++;
      this->buff[this->_cursor] = 0x00;
    }
    else {
      // No room left for both the closing bracket and its NUL terminator: sacrifice the
      // last content byte rather than leave the buffer unterminated.
      this->_cursor = this->buffSize - 2;
      this->buff[this->_cursor] = ']';
      this->buff[this->_cursor + 1] = 0x00;
    }
  }
  this->_nocomma = true;
  this->_closed = true;
}
void JsonSockEvent::endEvent(uint8_t num) {
  // Mode puits : aucun tampon, aucun serveur -- il n'y a rien à clore ni à envoyer, et surtout pas
  // de message d'erreur à logger (l'abandon est déjà comptabilisé par l'appelant).
  if(this->_discard) return;
  this->closeEvent();
  if(this->_overflowed) {
    // The event payload would not fit in the buffer: sending it would produce truncated/invalid
    // JSON on the client. Drop the whole event instead of corrupting the socket stream.
    Serial.printf("Dropping WebSocket event: exceeded buffer size %d\n", this->buffSize);
    return;
  }
  sendFrameFanOut(this->server, num, this->buff);
}
void JsonSockEvent::_safecat(const char *val, bool escape) {
  // Mode puits : on n'écrit rien. C'est ce court-circuit qui rend l'instance de repli partagée
  // inoffensive -- aucun tampon n'est touché, cf. g_discardSink dans Sockets.cpp.
  if(this->_discard) return;
  if(this->_overflowed) return;
  size_t len = (escape ? this->calcEscapedLength(val) : strlen(val)) + this->_cursor;
  if(escape) len += 2;
  if(len >= this->buffSize) {
    Serial.printf("Socket exceeded buffer size %d - %d\n", this->buffSize, len);
    this->_overflowed = true;
    return;
  }
  if(escape) {
    this->buff[this->_cursor++] = '"';
    this->buff[this->_cursor] = 0x00;
    this->escapeString(val, &this->buff[this->_cursor]);
    this->_cursor += strlen(&this->buff[this->_cursor]);
    this->buff[this->_cursor++] = '"';
    this->buff[this->_cursor] = 0x00;
  }
  else {
    strcpy(&this->buff[this->_cursor], val);
    this->_cursor += strlen(val);
  }
}
void JsonAsyncResponse::beginResponse(AsyncWebServerRequest *request, size_t expectedSize) {
  this->request = request;
  // cf. commentaire sur expectedSize dans WResp.h : réservation en un bloc pour éviter la
  // fragmentation par petits realloc() successifs du StreamString sous-jacent.
  this->stream = request->beginResponseStream("application/json", expectedSize);
  this->_nocomma = true;
}
void JsonAsyncResponse::endResponse() {
  if(this->request && this->stream) this->request->send(this->stream);
}
void JsonAsyncResponse::_safecat(const char *val, bool escape) {
  if(!this->stream) return;
  if(escape) {
    // Taille exacte (calcEscapedLength), pas de buffer fixe à faire déborder -- alloc/free courts
    // et bornés à chaque champ, coût négligeable face au nombre de champs d'une réponse JSON.
    uint32_t len = this->calcEscapedLength(val);
    char *escaped = (char *)malloc(len + 1);
    if(!escaped) return;
    escaped[0] = 0x00;
    this->escapeString(val, escaped);
    this->stream->print('"');
    this->stream->print(escaped);
    this->stream->print('"');
    free(escaped);
  }
  else {
    this->stream->print(val);
  }
}

void JsonFormatter::beginObject(const char *name) {
  if(name && strlen(name) > 0) this->appendElem(name);
  else if(!this->_nocomma) this->_safecat(",");
  this->_safecat("{");
  this->_objects++;
  this->_nocomma = true;
}
void JsonFormatter::endObject() {
  //if(strlen(this->buff) + 1 > this->buffSize - 1) this->send();
  this->_safecat("}");
  this->_objects--;
  this->_nocomma = false;
}
void JsonFormatter::beginArray(const char *name) {
  if(name && strlen(name) > 0) this->appendElem(name);
  else if(!this->_nocomma) this->_safecat(",");
  this->_safecat("[");
  this->_arrays++;
  this->_nocomma = true;
}
void JsonFormatter::endArray() {
  //if(strlen(this->buff) + 1 > this->buffSize - 1) this->send();
  this->_safecat("]");
  this->_arrays--;
  this->_nocomma = false;
}

void JsonFormatter::appendElem(const char *name) {
  if(!this->_nocomma) this->_safecat(",");
  if(name && strlen(name) > 0) {
    this->_safecat(name, true);
    this->_safecat(":");
  }
  this->_nocomma = false;
}

void JsonFormatter::addElem(const char *name, const char *val) {
  if(!val) return;
  this->appendElem(name);
  this->_safecat(val, true);
}
void JsonFormatter::addElem(const char *val) { this->addElem(nullptr, val); }
void JsonFormatter::addElem(float fval) { _fmtFloat(this->_numbuff, sizeof(this->_numbuff), fval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(int8_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%d", nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(uint8_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%u", nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(int32_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%ld", (long)nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(uint32_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%lu", (unsigned long)nval); this->_appendNumber(nullptr); }

/*
void JsonFormatter::addElem(int16_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%d", nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(uint16_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%u", nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(int64_t lval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%lld", (long long)lval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(uint64_t lval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%llu", (unsigned long long)lval); this->_appendNumber(nullptr); }
*/
void JsonFormatter::addElem(bool bval) { strcpy(this->_numbuff, bval ? "true" : "false"); this->_appendNumber(nullptr); }

void JsonFormatter::addElem(const char *name, float fval) { _fmtFloat(this->_numbuff, sizeof(this->_numbuff), fval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, int8_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%d", nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, uint8_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%u", nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, int32_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%ld", (long)nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, uint32_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%lu", (unsigned long)nval); this->_appendNumber(name); }

/*
void JsonFormatter::addElem(const char *name, int16_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%d", nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, uint16_t nval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%u", nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, int64_t lval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%lld", (long long)lval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, uint64_t lval) { snprintf(this->_numbuff, sizeof(this->_numbuff), "%llu", (unsigned long long)lval); this->_appendNumber(name); }
*/
void JsonFormatter::addElem(const char *name, bool bval) { strcpy(this->_numbuff, bval ? "true" : "false"); this->_appendNumber(name); }

void JsonFormatter::_safecat(const char *val, bool escape) {
  // Cf. P-8 et le commentaire sur _overflowed dans WResp.h. Une fois le drapeau levé, on cesse
  // aussi d'écrire : poursuivre ne ferait qu'ajouter des fragments cohérents à une structure déjà
  // rompue, ce qui rend le défaut plus difficile à voir sans le rendre moins grave.
  if(this->_overflowed) return;
  size_t len = (escape ? this->calcEscapedLength(val) : strlen(val)) + this->_cursor;
  if(escape) len += 2;
  if(len >= this->buffSize) {
    this->_overflowed = true;
    Serial.printf("JsonFormatter: depassement du tampon (%u octets), reponse abandonnee\n",
      (unsigned)this->buffSize);
    return;
  }
  if(escape) {
    this->buff[this->_cursor++] = '"';
    this->buff[this->_cursor] = 0x00;
    this->escapeString(val, &this->buff[this->_cursor]);
    this->_cursor += strlen(&this->buff[this->_cursor]);
    this->buff[this->_cursor++] = '"';
    this->buff[this->_cursor] = 0x00;
  }
  else {
    strcpy(&this->buff[this->_cursor], val);
    this->_cursor += strlen(val);
  }
}
void JsonFormatter::_appendNumber(const char *name) { this->appendElem(name); this->_safecat(this->_numbuff); } 
// --- INVARIANT : calcEscapedLength() et escapeString() DOIVENT rester d'accord au caractère près.
// Les deux appelants (_safecat de JsonSockEvent et de JsonFormatter) dimensionnent le tampon avec
// la première, PUIS écrivent avec la seconde sans plus aucun contrôle de borne. Toute divergence
// entre les deux est un débordement de tampon, pas un affichage de travers. Elles sont donc
// écrites côte à côte, avec la même structure de test, et se modifient ensemble.
//
// M-12 de l'audit, corrigé le 24/08/2026 : les caractères de contrôle 0x00-0x1F autres que
// \b \f \n \r \t passaient TELS QUELS dans la sortie. Le JSON produit était alors invalide au sens
// de la RFC 8259, et `JSON.parse()` lève côté navigateur -- ce qui ne dégrade pas un champ, ça
// fait tomber toute l'interface. Un nom d'équipement, de pièce ou de groupe n'est filtré nulle part
// dans fromJSON ; un SSID capté au scan et les topics MQTT non plus. Ils sont désormais émis sous
// la forme \u00XX (6 caractères).
//
// Le transtypage en `unsigned char` n'est pas cosmétique : `char` est SIGNÉ sur xtensa, donc tout
// octet de continuation UTF-8 (0x80-0xBF) est négatif et satisferait un `raw[i] < 0x20` naïf. Sans
// ce cast, chaque caractère accentué d'un nom d'équipement serait haché en séquences \u00XX illisibles.
//
// M-20 corrigé au passage, ces deux fonctions en étant l'objet : `strlen(raw)` était réévalué à
// CHAQUE tour de boucle, et escapeString() faisait en plus un `strlen(escaped)` par caractère écrit
// (via strcat) -- soit un coût quadratique sur des chaînes parcourues à chaque sérialisation.
// La longueur est maintenant calculée une fois et la position d'écriture suivie par un index.
uint32_t JsonFormatter::calcEscapedLength(const char *raw) {
  uint32_t len = 0;
  const size_t rawLen = strlen(raw);
  for(size_t i = 0; i < rawLen; i++) {
    switch(raw[i]) {
      case '"':
      case '/':
      case '\b':
      case '\f':
      case '\n':
      case '\r':
      case '\t':
      case '\\':
        len += 2;
        break;
      default:
        // Doit couvrir exactement le même ensemble que le `default` d'escapeString().
        if((unsigned char)raw[i] < 0x20) len += 6;   // \u00XX
        else len++;
        break;
    }
  }
  return len;
}
// Cf. l'INVARIANT documenté sur calcEscapedLength() ci-dessus : même structure de test, même
// ensemble de caractères, mêmes longueurs produites. Écrit depuis l'index 0 du tampon fourni (les
// trois appelants lui passent une position qu'ils viennent de terminer par un NUL, l'ancien
// comportement à base de strcat produisait donc déjà exactement ce résultat).
void JsonFormatter::escapeString(const char *raw, char *escaped) {
  const size_t rawLen = strlen(raw);
  size_t n = 0;
  for(size_t i = 0; i < rawLen; i++) {
    switch(raw[i]) {
      case '"':  escaped[n++] = '\\'; escaped[n++] = '"';  break;
      case '/':  escaped[n++] = '\\'; escaped[n++] = '/';  break;
      case '\b': escaped[n++] = '\\'; escaped[n++] = 'b';  break;
      case '\f': escaped[n++] = '\\'; escaped[n++] = 'f';  break;
      case '\n': escaped[n++] = '\\'; escaped[n++] = 'n';  break;
      case '\r': escaped[n++] = '\\'; escaped[n++] = 'r';  break;
      case '\t': escaped[n++] = '\\'; escaped[n++] = 't';  break;
      case '\\': escaped[n++] = '\\'; escaped[n++] = '\\'; break;
      default:
        if((unsigned char)raw[i] < 0x20) {
          // 6 caractères, exactement ce que compte calcEscapedLength(). snprintf plutôt que
          // sprintf : la borne est ici connue et vaut ce que l'appelant a réservé pour ce
          // caractère précis, pas la taille restante du tampon -- on écrit 6 octets plus le NUL
          // que snprintf ajoute, lequel sera écrasé par le caractère suivant ou par la
          // terminaison finale.
          snprintf(&escaped[n], 7, "\\u%04x", (unsigned char)raw[i]);
          n += 6;
        }
        else escaped[n++] = raw[i];
        break;
    }
  }
  escaped[n] = 0x00;
}
