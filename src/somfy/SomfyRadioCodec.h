#ifndef SOMFY_RADIO_CODEC_H
#define SOMFY_RADIO_CODEC_H
#include "ConfigSettings.h"

// Déclarations du protocole RTS bas niveau, extraites de Somfy.h : les opcodes de commande
// radio, les structures de réception/émission (ISR + files TX/RX) et la trame elle-même
// (somfy_frame_t, implémentée dans SomfyRadioCodec.cpp). Ne dépend d'aucune classe du modèle de
// domaine (SomfyShade/Group/...) -- uniquement du protocole radio, donc peut être inclus seul par
// tout code qui n'a besoin que d'encoder/décoder une trame.

enum class radio_proto : byte { // Ordinal byte 0-255
  RTS = 0x00,
  RTW = 0x01,
  RTV = 0x02,
  GP_Relay = 0x08,
  GP_Remote = 0x09
};
enum class somfy_commands : byte {
    Unknown0 = 0x0,
    My = 0x1,
    Up = 0x2,
    MyUp = 0x3,
    Down = 0x4,
    MyDown = 0x5,
    UpDown = 0x6,
    MyUpDown = 0x7,
    Prog = 0x8,
    SunFlag = 0x9,
    Flag = 0xA,
    StepDown = 0xB,
    Toggle = 0xC,
    UnknownD = 0xD,
    Sensor = 0xE,
    RTWProto = 0xF, // RTW Protocol
    // Command extensions for 80 bit frames
    StepUp = 0x8B,
    Favorite = 0xC1,
    Stop = 0xF1
};
String translateSomfyCommand(const somfy_commands cmd);
somfy_commands translateSomfyCommand(const String& string);

#define MAX_TIMINGS 300
#define MAX_RX_BUFFER 3
#define MAX_TX_BUFFER 5

typedef enum {
    waiting_synchro = 0,
    receiving_data = 1,
    complete = 2
} t_status;

struct somfy_rx_t {
    void clear() {
      this->status = t_status::waiting_synchro;
      this->bit_length = 56;
      this->cpt_synchro_hw = 0;
      this->cpt_bits = 0;
      this->previous_bit = 0;
      this->waiting_half_symbol = false;
      memset(this->payload, 0, sizeof(this->payload));
      memset(this->pulses, 0, sizeof(this->pulses));
      this->pulseCount = 0;
    }
    t_status status;
    uint8_t bit_length = 56;
    uint8_t cpt_synchro_hw = 0;
    uint8_t cpt_bits = 0;
    uint8_t previous_bit = 0;
    bool waiting_half_symbol;
    uint8_t payload[10];
    unsigned int pulses[MAX_TIMINGS];
    uint16_t pulseCount = 0;
};
// A simple FIFO queue to hold rx buffers.  We are using
// a byte index to make it so we don't have to reorganize
// the storage each time we push or pop.
struct somfy_rx_queue_t {
  void init();
  uint8_t length = 0;
  uint8_t index[MAX_RX_BUFFER];
  somfy_rx_t items[MAX_RX_BUFFER];
  void push(somfy_rx_t *rx);
  bool pop(somfy_rx_t *rx);
};
struct somfy_tx_t {
  void clear() {
    this->hwsync = 0;
    this->bit_length = 0;
    memset(this->payload, 0x00, sizeof(this->payload));
  }
  uint8_t hwsync = 0;
  uint8_t bit_length = 0;
  uint8_t payload[10] = {};
};
struct somfy_tx_queue_t {
  somfy_tx_queue_t() { this->clear(); }
  void clear() {
    for (uint8_t i = 0; i < MAX_TX_BUFFER; i++) {
      this->index[i] = 255;
      this->items[i].clear();
    }
    this->length = 0;
  }
  unsigned long delay_time = 0;
  uint8_t length = 0;
  uint8_t index[MAX_TX_BUFFER] = {255};
  somfy_tx_t items[MAX_TX_BUFFER];
  bool pop(somfy_tx_t *tx);
  void push(somfy_rx_t *rx); // Used for repeats
  void push(uint8_t hwsync, byte *payload, uint8_t bit_length);
};

struct somfy_relay_t {
  uint32_t remoteAddress = 0;
  uint8_t sync = 0;
  byte frame[10] = {0};
};
struct somfy_frame_t {
    bool valid = false;
    bool processed = false;
    bool synonym = false;
    radio_proto proto = radio_proto::RTS;
    int rssi = 0;
    byte lqi = 0x0;
    // M-13 de l'audit, corrigé le 24/08/2026 : SEUL champ de cette structure sans initialiseur.
    // `somfy_frame_t frame;` déclaré en pile laissait donc `cmd` indéterminé, et
    // handleSendRemoteCommand() traite l'argument `command` comme OPTIONNEL : un
    // `GET /sendRemoteCommand?address=123&rcode=1` émettait une vraie trame RTS portant un opcode
    // issu du contenu résiduel de la pile -- Prog (0x8) inclus, qui apparie ou désapparie un équipement.
    // `My` est le défaut correct, pas un choix arbitraire : c'est déjà ce que rend
    // translateSomfyCommand("") (cf. sa dernière branche, Somfy.cpp), donc ce que le chemin JSON du
    // même handler produit depuis toujours quand `command` est absent. Les deux chemins concordent
    // désormais.
    somfy_commands cmd = somfy_commands::My;
    uint32_t remoteAddress = 0;
    uint16_t rollingCode = 0;
    uint8_t encKey = 0xA7;
    uint8_t checksum = 0;
    uint8_t hwsync = 0;
    uint8_t repeats = 0;
    uint32_t await = 0;
    uint8_t bitLength = 56;
    uint16_t pulseCount = 0;
    uint8_t stepSize = 0;
    void print();
    void encode80BitFrame(byte *frame, uint8_t repeat);
    byte calc80Checksum(byte b0, byte b1, byte b2);
    byte encode80Byte7(byte start, uint8_t repeat);
    void encodeFrame(byte *frame);
    void decodeFrame(byte* frame);
    void decodeFrame(somfy_rx_t *rx);
    bool isRepeat(somfy_frame_t &f);
    bool isSynonym(somfy_frame_t &f);
    void copy(somfy_frame_t &f);
};
#endif
