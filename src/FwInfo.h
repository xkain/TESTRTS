// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef FWINFO_H
#define FWINFO_H
#include <Arduino.h>
#include <atomic>
#include "web/WResp.h"

// Le boîtier ne télécharge plus rien : le navigateur ou Home Assistant lisent le catalogue des
// versions sur le site Pages et envoient l'image à /updateFirmware. Il ne reste ici que ce que
// ces relais doivent savoir du boîtier.

// Verrou d'écriture du filesystem principal (ex git.lockFS) : posé par tout écrivain LittleFS
// asynchrone -- /restore, /updateShadeConfig, /uploadLang -- et testé par les lecteurs. Cf. le
// motif « verrouiller puis drainer » de Web::waitForFileReaders().
extern std::atomic<bool> fsLocked;

namespace FwInfo {
  // Jeton de carte des noms d'asset (esp32, esp32wrover, esp32c6, esp32_BOX_eth...) : le relais
  // s'en sert pour choisir l'image à envoyer.
  void boardToken(char *out, size_t len);
  void toJSON(JsonFormatter &json);
  // Événement socket fwStatus, à un client (num) ou à tous (255).
  void emit(uint8_t num = 255);
  // Retour arrière automatique : un firmware fraîchement installé démarre « à vérifier » et n'est
  // validé qu'après FW_PROVEN_AFTER_MS de fonctionnement avec un accès possible (réseau ou point
  // d'accès). Un redémarrage avant -- plantage, boucle de reset -- fait revenir le chargeur sur
  // l'emplacement précédent. À appeler à chaque tour de loop().
  void loopRollback(bool reachable);
}
#define FW_PROVEN_AFTER_MS 60000UL
#endif
