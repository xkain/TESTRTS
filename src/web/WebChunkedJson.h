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
//
// ATTENTION -- un GROUPE n'est pas un « élément » au sens de ce tampon : SomfyGroup::toJSON imbrique
// jusqu'à SOMFY_MAX_GROUPED_SHADES références d'équipement (~205 octets chacune), soit ~6,9 Ko au
// pire, plus du triple de ce tampon. Un groupe de 9 équipements liés suffisait déjà à dépasser, et
// la réponse partait tronquée. Les groupes se composent donc en PLUSIEURS éléments -- en-tête via
// SomfyGroup::toJSONHead(), puis une référence d'équipement par élément -- cf. CTL_GROUPS et
// DISC_GROUPS (WebSystem.cpp). Toute nouvelle structure imbriquant une collection relève du même
// découpage : agrandir ce tampon reviendrait à reprendre le coin d'allocation contigu que la
// réponse chunked existe précisément pour supprimer.
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

    // Abandonne l'élément composé sans rien émettre. Sûr jusqu'au retour vers la boucle d'appel :
    // la recopie vers la bibliothèque ne lit l'élément qu'ensuite (cf. pending()/flush()).
    void discardItem() { this->len = 0; this->sent = 0; }

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

    // Ajoute du texte brut à la SUITE de l'élément composé par le formateur, avant endItem() :
    // ponctuation structurelle que JsonFormatter ne sait pas produire parce qu'elle laisse une
    // structure OUVERTE d'un élément sur l'autre -- l'ouverture d'un tableau dont les éléments
    // seront émis un par un (cf. GRP_HEAD). Un dépassement n'a pas besoin d'être signalé ici :
    // strlcpy borne l'écriture, et la longueur qui en résulte sature le tampon, ce que endItem()
    // détecte juste après.
    void appendRaw(const char *text) {
      size_t cur = strlen(this->item);
      strlcpy(this->item + cur, text, sizeof(this->item) - cur);
    }

    // Clôt l'élément composé. Renvoie false si le tampon a été saturé : JsonFormatter::_safecat()
    // tronque SILENCIEUSEMENT en cas de dépassement, ce qui produirait un JSON invalide livré tel
    // quel au navigateur -- l'appelant doit donc traiter ce cas plutôt que de l'ignorer.
    //
    // Le verdict vient du FORMATEUR, et surtout pas de la longueur obtenue seule : _safecat()
    // n'écrit RIEN du fragment qui ne tient pas (il rend la main en levant son drapeau), il ne
    // remplit donc jamais le tampon jusqu'au dernier octet. La longueur s'arrête au dernier
    // fragment qui tenait, franchement sous la capacité -- 1806 octets sur 2048 pour le groupe qui
    // a motivé ce découpage, 506 sur 512 à l'épreuve du filet. Le test de longueur seul ne se
    // déclenchait donc que par accident, quand un fragment tombait pile sur la dernière place : il
    // a laissé partir des éléments tronqués sur /controller, /discovery et /shades.
    // Il reste néanmoins nécessaire À CÔTÉ du drapeau : appendRaw() écrit par strlcpy, hors du
    // formateur, et peut saturer le tampon sans que celui-ci en sache rien.
    bool endItem() {
      this->len = this->_commaOffset + strlen(this->item + this->_commaOffset);
      this->sent = 0;
      return !this->json.overflowed() && this->len < sizeof(this->item) - 1;
    }
};
#endif
