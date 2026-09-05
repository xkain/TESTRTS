#ifndef webchunkedjson_h
#define webchunkedjson_h
#include <Arduino.h>
#include "WResp.h"

// Ossature d'émission JSON en réponse chunked (audit heap, 17/08/2026).
//
// POURQUOI. Une réponse construite via JsonAsyncResponse est intégralement bufferisée dans un
// String contigu (AsyncResponseStream), avec une réservation initiale -- 16384 octets sur
// /controller, /discovery et /shades. Deux conséquences mesurées sur matériel :
//
//  1. Fragmentation. Cette grosse réservation transitoire sert de COIN : les petites allocations
//     permanentes faites pendant qu'elle est tenue (structures de client WebSocket, objets de
//     connexion) se posent au-delà, et restent échouées au milieu de la région une fois la
//     réservation libérée. Mesure : un chargement de page ajoute 3604 octets permanents mais coûte
//     16384 octets de plus gros bloc contigu -- exactement la taille de la réservation.
//  2. Plafond de configuration. Au-delà de la réservation, String::concat() réalloue en exact-fit
//     à CHAQUE écriture sur ce core, et un realloc qui ne peut pas s'étendre sur place a besoin de
//     l'ancien ET du nouveau bloc simultanément. Or un équipement sérialisé par SomfyShade::toJSON pèse
//     ~1,3 Ko (39 champs + jusqu'à 7 télécommandes liées) : 32 équipements font ~40 Ko, et /controller
//     au maximum de configuration dépasse 55 Ko -- au-delà du plus gros bloc contigu disponible
//     (mesuré entre 38 900 et 86 004 octets selon l'état). Cette route ne peut donc PAS servir une
//     configuration bien remplie aujourd'hui.
//
// COMMENT. AsyncChunkedResponse est en mode TIRAGE : la bibliothèque réclame les octets suivants
// par un callback (buffer, maxLen, index). On produit alors UN élément à la fois dans le tampon
// ci-dessous, et on le recopie vers le buffer de la bibliothèque au fil des appels -- avec report
// (`sent`) quand l'élément ne tient pas dans la place restante. Le pic mémoire devient la taille
// d'un seul élément, constante, au lieu de celle de la réponse entière.
//
// La granularité nécessaire existait déjà : toutes les collections du modèle (rooms, shades,
// groups, schedules) sont des tableaux de taille fixe filtrés sur une sentinelle, avec un toJSON()
// par élément -- aucune sérialisation n'a eu à être découpée.
//
// Repli HTTP/1.0 assuré par la bibliothèque elle-même (beginChunkedResponse retombe sur
// AsyncCallbackResponse si request->version() vaut 0), donc aucun risque de compatibilité client.

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
