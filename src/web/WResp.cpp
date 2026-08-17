#include "WResp.h"
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
  if(clientNum == 255) srv->broadcastTXT(this->buff);
  else srv->sendTXT(clientNum, this->buff);
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
  if(num == 255) this->server->broadcastTXT(this->buff);
  else this->server->sendTXT(num, this->buff);
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
void JsonFormatter::addElem(float fval) { sprintf(this->_numbuff, "%.4f", fval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(int8_t nval) { sprintf(this->_numbuff, "%d", nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(uint8_t nval) { sprintf(this->_numbuff, "%u", nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(int32_t nval) { sprintf(this->_numbuff, "%ld", (long)nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(uint32_t nval) { sprintf(this->_numbuff, "%lu", (unsigned long)nval); this->_appendNumber(nullptr); }

/*
void JsonFormatter::addElem(int16_t nval) { sprintf(this->_numbuff, "%d", nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(uint16_t nval) { sprintf(this->_numbuff, "%u", nval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(int64_t lval) { sprintf(this->_numbuff, "%lld", (long long)lval); this->_appendNumber(nullptr); }
void JsonFormatter::addElem(uint64_t lval) { sprintf(this->_numbuff, "%llu", (unsigned long long)lval); this->_appendNumber(nullptr); }
*/
void JsonFormatter::addElem(bool bval) { strcpy(this->_numbuff, bval ? "true" : "false"); this->_appendNumber(nullptr); }

void JsonFormatter::addElem(const char *name, float fval) { sprintf(this->_numbuff, "%.4f", fval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, int8_t nval) { sprintf(this->_numbuff, "%d", nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, uint8_t nval) { sprintf(this->_numbuff, "%u", nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, int32_t nval) { sprintf(this->_numbuff, "%ld", (long)nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, uint32_t nval) { sprintf(this->_numbuff, "%lu", (unsigned long)nval); this->_appendNumber(name); }

/*
void JsonFormatter::addElem(const char *name, int16_t nval) { sprintf(this->_numbuff, "%d", nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, uint16_t nval) { sprintf(this->_numbuff, "%u", nval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, int64_t lval) { sprintf(this->_numbuff, "%lld", (long long)lval); this->_appendNumber(name); }
void JsonFormatter::addElem(const char *name, uint64_t lval) { sprintf(this->_numbuff, "%llu", (unsigned long long)lval); this->_appendNumber(name); }
*/
void JsonFormatter::addElem(const char *name, bool bval) { strcpy(this->_numbuff, bval ? "true" : "false"); this->_appendNumber(name); }

void JsonFormatter::_safecat(const char *val, bool escape) {
  size_t len = (escape ? this->calcEscapedLength(val) : strlen(val)) + this->_cursor;
  if(escape) len += 2;
  if(len >= this->buffSize) {
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
uint32_t JsonFormatter::calcEscapedLength(const char *raw) {
  uint32_t len = 0;
  for(size_t i = 0; i < strlen(raw); i++) {
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
        len++;
        break;
    }
  }
  return len;
}
void JsonFormatter::escapeString(const char *raw, char *escaped) {
  for(uint32_t i = 0; i < strlen(raw); i++) {
    switch(raw[i]) {
      case '"':
        strcat(escaped, "\\\"");
        break;
      case '/':
        strcat(escaped, "\\/");
        break;
      case '\b':
        strcat(escaped, "\\b");
        break;
      case '\f':
        strcat(escaped, "\\f");
        break;
      case '\n':
        strcat(escaped, "\\n");
        break;
      case '\r':
        strcat(escaped, "\\r");
        break;
      case '\t':
        strcat(escaped, "\\t");
        break;
      case '\\':
        strcat(escaped, "\\\\");
        break;
      default:
        size_t len = strlen(escaped);
        escaped[len] = raw[i];
        escaped[len+1] = 0x00;
        break;
    }
  }
}
