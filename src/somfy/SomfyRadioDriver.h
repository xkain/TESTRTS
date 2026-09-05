#ifndef SOMFY_RADIO_DRIVER_H
#define SOMFY_RADIO_DRIVER_H
#include "web/WResp.h"
#include "SomfyRadioCodec.h"
#include <atomic>

// Déclarations du pilote radio CC1101, extraites de Somfy.h : la configuration matérielle
// (transceiver_config_t) et la classe Transceiver (implémentées dans SomfyRadioDriver.cpp).
// Dépend de SomfyRadioCodec.h pour somfy_frame_t/somfy_rx_t (types manipulés par le pilote), mais
// d'aucune classe du modèle de domaine (SomfyShade/Group/...).

struct transceiver_config_t {
    bool printBuffer = false;
    bool enabled = false;
    uint8_t type = 56;                // 56 or 80 bit protocol..
    #if defined(HARDWARE_BOX_WIFI)
    uint8_t radioBoardType = 1; // Boîtier Édition Wi-Fi
    #elif defined(HARDWARE_BOX_ETH)
    uint8_t radioBoardType = 2; // Boîtier Édition Ethernet
    #else
    uint8_t radioBoardType = 0; // Version Standard
    #endif
    radio_proto proto = radio_proto::RTS;
    uint8_t SCKPin = 18;
    uint8_t TXPin = 13;
    uint8_t RXPin = 12;
    uint8_t MOSIPin = 23;
    uint8_t MISOPin = 19;
    uint8_t CSNPin = 5;
    bool radioInit = false;
    float frequency = 433.42;         // Basic frequency
    float rxBandwidth = 99.97;        // Receive bandwidth in kHz.  Value from 58.03 to 812.50.  Default is 99.97kHz.
    int8_t txPower = 10;              // Transmission power {-30, -20, -15, -10, -6, 0, 5, 7, 10, 11, 12}.  Default is 12.
/*
    bool internalCCMode = false;      // Use internal transmission mode FIFO buffers.
    byte modulationMode = 2;          // Modulation mode. 0 = 2-FSK, 1 = GFSK, 2 = ASK/OOK, 3 = 4-FSK, 4 = MSK.
    uint8_t channel = 0;              // The channel number from 0 to 255
    float channelSpacing = 199.95;    // Channel spacing in multiplied by the channel number and added to the base frequency in kHz. 25.39 to 405.45.  Default 199.95
    float dataRate = 99.97;           // The data rate in kBaud.  0.02 to 1621.83 Default is 99.97.
    uint8_t syncMode = 0;             // 0=No preamble/sync,
    // 1=16 sync word bits detected,
    // 2=16/16 sync words bits detected.
    // 3=30/32 sync word bits detected,
    // 4=No preamble/sync carrier above threshold
    // 5=15/16 + carrier above threshold.
    // 6=16/16 + carrier-sense above threshold
    // 7=0/32 + carrier-sense above threshold
    uint16_t syncWordHigh = 211;      // The sync word used to the sync mode.
    uint16_t syncWordLow = 145;       // The sync word used to the sync mode.
    uint8_t addrCheckMode = 0;        // 0=No address filtration
    // 1=Check address without broadcast.
    // 2=Address check with 0 as broadcast.
    // 3=Address check with 0 or 255 as broadcast.
    uint8_t checkAddr = 0;            // Packet filter address depending on addrCheck settings.
    bool dataWhitening = false;       // Indicates whether data whitening should be applied.
    uint8_t pktFormat = 0;            // 0=Use FIFO buffers form RX and TX
    // 1=Synchronous serial mode.  RX on GDO0 and TX on either GDOx pins.
    // 2=Random TX mode.  Send data using PN9 generator.
    // 3=Asynchronous serial mode.  RX on GDO0 and TX on either GDOx pins.
    uint8_t pktLengthMode = 0;        // 0=Fixed packet length
    // 1=Variable packet length
    // 2=Infinite packet length
    // 3=Reserved
    uint8_t pktLength = 0;            // Packet length
    bool useCRC = false;              // Indicates whether CRC is to be used.
    bool autoFlushCRC = false;        // Automatically flush RX FIFO when CRC fails.  If more than one packet is in the buffer it too will be flushed.
    bool disableDCFilter = false;     // Digital blocking filter for demodulator.  Only for data rates <= 250k.
    bool enableManchester = true;     // Enable/disable Manchester encoding.
    bool enableFEC = false;           // Enable/disable forward error correction.
    uint8_t minPreambleBytes = 0;     // The minimum number of preamble bytes to be transmitten.
    // 0=2bytes
    // 1=3bytes
    // 2=4bytes
    // 3=6bytes
    // 4=8bytes
    // 5=12bytes
    // 6=16bytes
    // 7=24bytes
    uint8_t pqtThreshold = 0;         // Preamble quality estimator threshold.  The preable quality estimator increase an internal counter by one each time a bit is received that is different than the prevoius bit and
    // decreases the bounter by 8 each time a bit is received that is the same as the lats bit.  A threshold of 4 PQT for this counter is used to gate sync word detection.
    // When PQT = 0 a sync word is always accepted.
    bool appendStatus = false;        // Appends the RSSI and LQI values to the TX packed as well as the CRC.
 */
    void fromJSON(JsonObject& obj);
    void toJSON(JsonFormatter& json);
    void save();
    void load();
    void apply();
    void removeNVSKey(const char *key);
};
// Ce qu'une broche radio doit savoir faire, selon la ligne a laquelle elle est affectee.
enum class radio_pin_role : uint8_t { tx_bitbang, spi_out, spi_in };
// Renvoie nullptr si la broche convient a ce role, sinon le CODE d'erreur -- celui-la meme que
// porte la reponse HTTP 400 et que l'interface traduit. radioPinFaultText() en donne la phrase
// anglaise ; les deux derivent du meme test, ils ne peuvent donc pas se contredire.
const char *radioPinFault(int pin, radio_pin_role role);
const char *radioPinFaultText(const char *code);

class Transceiver {
  private:
    static void handleReceive();
    bool _received = false;
    somfy_frame_t frame;
  public:
    transceiver_config_t config;
    bool printBuffer = false;
    void toJSON(JsonFormatter& json);
    bool fromJSON(JsonObject& obj);
    bool save();
    bool begin();
    void loop();
    bool end();
    bool receive(somfy_rx_t *rx);
    void clearReceived();
    void enableReceive();
    void disableReceive();
    somfy_frame_t& lastFrame();
    void sendFrame(byte *frame, uint8_t sync, uint8_t bitLength = 56);
    void beginTransmit();
    void endTransmit();
    void emitFrame(somfy_frame_t *frame, somfy_rx_t *rx = nullptr);
    void processRfNoise();
    void resetRfNoise();
    void emitRfNoise();
    uint32_t noiseEpisodes();
    // Le scan de fréquence est DIFFÉRÉ vers la tâche principale depuis le 25/08/2026 (T-5).
    // Ces deux méthodes pilotent directement le CC1101 en SPI, appellent attachInterrupt/
    // detachInterrupt et écrivent rxmode/currFreq/markFreq/markRSSI. Appelées telles quelles
    // depuis un handler web, elles s'exécutaient sur async_tcp (cœur 0) pendant que
    // processFrequencyScan() manipulait le MÊME périphérique et les MÊMES variables sur loopTask
    // (cœur 1) -- deux cœurs en parallélisme réel sur une puce radio, dont un qui touche aux
    // interruptions.
    //
    // Les handlers posent donc une demande, et Transceiver::loop() l'exécute : une seule tâche
    // touche la radio, par construction. Sans effet visible côté interface -- le scan tournait
    // déjà sur loopTask, seuls son démarrage et son arrêt changent de tâche, et le client ne lit
    // pas l'état renvoyé (il n'attend qu'une absence d'erreur ; le résultat arrive par la socket).
    //
    // Choix ASSUMÉ de ne PAS étendre ce différé aux commandes d'équipement, bien qu'elles émettent
    // elles aussi depuis async_tcp : là, la réponse HTTP part APRÈS l'émission, donc un succès
    // affiché signifie que la trame est partie. Différer inverserait cette garantie -- exactement
    // le travers (« succès annoncé sans rien faire ») que cet audit a passé sa semaine à réparer.
    // Pour ces commandes, la piste est un verrou étroit begin/endTransmit, pas un différé.
    enum scan_request_t : uint8_t { SCAN_REQ_NONE = 0, SCAN_REQ_BEGIN, SCAN_REQ_END };
    std::atomic<uint8_t> scanRequest{SCAN_REQ_NONE};
    void requestFrequencyScan(bool begin) { this->scanRequest.store(begin ? SCAN_REQ_BEGIN : SCAN_REQ_END); }
    void beginFrequencyScan();
    void endFrequencyScan();
    void processFrequencyScan(bool received = false);
    void emitFrequencyScan(uint8_t num = 255);
    bool usesPin(uint8_t pin);
};
#endif
