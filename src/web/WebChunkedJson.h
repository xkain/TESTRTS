// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef webchunkedjson_h
#define webchunkedjson_h
#include <Arduino.h>
#include "WResp.h"

// Ossature d'émission JSON en réponse chunked. Une réponse construite via JsonAsyncResponse est
// intégralement bufferisée dans un String contigu, avec une réservation initiale de 16384 octets :
// cette grosse réservation transitoire fragmente le tas (les petites allocations permanentes
// faites pendant qu'elle est tenue se posent au-delà, et restent échouées une fois la réservation
// libérée), et au-delà d'elle String::concat() réalloue en exact-fit à chaque écriture -- une
// configuration bien remplie (32 équipements, ~55 Ko) dépasse le plus gros bloc contigu
// disponible.
//
// AsyncChunkedResponse est en mode TIRAGE : la bibliothèque réclame les octets suivants par un
// callback (buffer, maxLen, index). On produit alors UN élément à la fois dans le tampon
// ci-dessous, recopié vers le buffer de la bibliothèque au fil des appels -- avec report (`sent`)
// quand l'élément ne tient pas dans la place restante. Le pic mémoire devient la taille d'un seul
// élément, constante, au lieu de celle de la réponse entière. Repli HTTP/1.0 assuré par la
// bibliothèque elle-même.

// Dimensionné sur le plus gros élément sérialisable de l'application : un équipement complet via
// SomfyShade::toJSON (~1,3 Ko). 2048 laisse ~55 % de marge. Un dépassement n'est pas silencieux --
// cf. la valeur de retour d'endItem().
#define CHUNKED_ITEM_BUF 2048

class ChunkedJsonEmitter {
  private:
    size_t _commaOffset = 0;
  public:
    char item[CHUNKED_ITEM_BUF];
    size_t len = 0;    // octets utiles dans item
    size_t sent = 0;   // octets déjà recopiés vers la bibliothèque
    JsonFormatter json;

    // Reste-t-il du report à écouler avant de produire l'élément suivant ?
    bool pending() const { return this->sent < this->len; }

    // Recopie ce qui tient dans le buffer de la bibliothèque et renvoie le nombre d'octets écrits.
    size_t flush(uint8_t *buf, size_t maxLen) {
      size_t n = this->len - this->sent;
      if(n > maxLen) n = maxLen;
      memcpy(buf, this->item + this->sent, n);
      this->sent += n;
      return n;
    }

    // Texte structurel brut (ouverture/fermeture de tableau, accolade finale...).
    void emitRaw(const char *text) {
      size_t n = strlcpy(this->item, text, sizeof(this->item));
      this->len = (n < sizeof(this->item)) ? n : sizeof(this->item) - 1;
      this->sent = 0;
    }

    // Prépare la composition d'un élément. `prependComma` gère la virgule de séparation : chaque
    // élément étant composé par un JsonFormatter fraîchement initialisé (donc persuadé d'être en
    // début de document), la ponctuation entre éléments ne peut pas venir du formateur lui-même.
    JsonFormatter *beginItem(bool prependComma) {
      this->_commaOffset = 0;
      if(prependComma) {
        this->item[0] = ',';
        this->_commaOffset = 1;
      }
      this->json.begin(this->item + this->_commaOffset, sizeof(this->item) - this->_commaOffset);
      return &this->json;
    }

    // Clôt l'élément composé. Renvoie false si le tampon a été saturé : JsonFormatter::_safecat()
    // tronque SILENCIEUSEMENT en cas de dépassement, ce qui produirait un JSON invalide livré tel
    // quel au navigateur -- l'appelant doit donc traiter ce cas plutôt que de l'ignorer.
    bool endItem() {
      this->len = this->_commaOffset + strlen(this->item + this->_commaOffset);
      this->sent = 0;
      return this->len < sizeof(this->item) - 1;
    }
};
#endif
