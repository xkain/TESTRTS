#ifndef RECOVERY_H
#define RECOVERY_H

#include <Arduino.h>

#define NET_RECOVERY_CYCLES 3
#define FULL_FACTORY_CYCLES 6
#define BOOT_TIMEOUT 5000

// --- CONFIGURATION DE LA LED SELON LE BOÎTIER ---
#if defined(HARDWARE_BOX_ETH)
// Boîtier Ethernet (WT32-ETH01)
#define LED_PIN          5   // Appelé LED_PIN pour correspondre à ton code
#define LED_ON           LOW // Active Low (0 = allumé)
#define LED_OFF          HIGH

#elif defined(HARDWARE_BOX_WIFI)
// Boîtier Wi-Fi (ESP32 D1 Mini)
#define LED_PIN          2   // Appelé LED_PIN pour correspondre à ton code
#define LED_ON           HIGH // Active High (1 = allumé)
#define LED_OFF          LOW

#else
// Option de repli par défaut pour les autres variantes
#define LED_PIN          -1
#define LED_ON           HIGH
#define LED_OFF          LOW
#endif
// ------------------------------------------------

extern bool _pendingNetSecuRecovery;
extern bool _pendingFactory;

void visualFeedback(int durationMs, int speedMs);
void handlePowerCycleReset();
void resetAccessAndNetworkConfig();
void performFactoryReset();

#endif
