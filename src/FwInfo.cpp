// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <esp_chip_info.h>   // esp_chip_info() -- n'arrive plus par esp_system.h en IDF 5
#include <esp_arduino_version.h>
#include <esp_ota_ops.h>
#include <esp_image_format.h>
#include "FwInfo.h"
#include "ConfigSettings.h"
#include "Sockets.h"

extern ConfigSettings settings;
extern SocketEmitter sockEmit;

std::atomic<bool> fsLocked{false};

// Variante et boîtier sont EXCLUSIFS : les deux boîtiers sont des ESP32 de 4 Mo à la table commune,
// ils n'auront jamais de seconde image. Le build refuse la combinaison plutôt que de la laisser
// traîner.
#if defined(FW_ASSET_VARIANT) && (defined(HARDWARE_BOX_ETH) || defined(HARDWARE_BOX_WIFI))
  #error "FW_ASSET_VARIANT ne se combine pas avec un boîtier : ce sont des ESP32 4 Mo à la table commune, une seule image applicative."
#endif
void FwInfo::boardToken(char *out, size_t len) {
  esp_chip_info_t ci;
  esp_chip_info(&ci);
  char carte[24] = "esp32";
  switch(ci.model) {
    case esp_chip_model_t::CHIP_ESP32S3: strlcpy(carte, "esp32s3", sizeof(carte)); break;
    case esp_chip_model_t::CHIP_ESP32S2: strlcpy(carte, "esp32s2", sizeof(carte)); break;
    case esp_chip_model_t::CHIP_ESP32C3: strlcpy(carte, "esp32c3", sizeof(carte)); break;
    // L'énumérateur n'existe pas dans le SDK du core 2.x. Sans ce cas, un C6 demanderait l'image
    // "esp32" -- un binaire Xtensa qui ne démarrerait pas sur du RISC-V.
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    case esp_chip_model_t::CHIP_ESP32C6: strlcpy(carte, "esp32c6", sizeof(carte)); break;
#endif
    case esp_chip_model_t::CHIP_ESP32:
      strlcpy(carte, psramFound() ? "esp32wrover" : "esp32", sizeof(carte));
      break;
    default: strlcpy(carte, "esp32", sizeof(carte)); break;
  }
  #if defined(HARDWARE_BOX_ETH)
  snprintf(out, len, "%s_BOX_eth", carte);
  #elif defined(HARDWARE_BOX_WIFI)
  snprintf(out, len, "%s_BOX_wifi", carte);
  #elif defined(FW_ASSET_VARIANT)
  snprintf(out, len, "%s_" FW_ASSET_VARIANT, carte);
  #else
  strlcpy(out, carte, len);
  #endif
}

void FwInfo::rememberBoard() {
  char board[40], stored[40] = "";
  boardToken(board, sizeof(board));
  Preferences p;
  if(!p.begin("CFG", false)) return;
  if(p.isKey("fwBoard")) p.getString("fwBoard", stored, sizeof(stored));
  if(strcmp(board, stored) != 0) p.putString("fwBoard", board);
  p.end();
}

static struct {
  bool valid = false;
  char id[16] = "";
  uint32_t used = 0, size = 0;
} installState;

void FwInfo::inspectInstall() {
  installState.valid = false;
  installState.id[0] = '\0';
  installState.used = installState.size = 0;
  const esp_partition_t *install = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_FACTORY, nullptr);
  if(!install) return;
  installState.size = install->size / 1024;
  const esp_partition_pos_t pos = {install->address, install->size};
  esp_image_metadata_t meta;
  if(esp_image_verify(ESP_IMAGE_VERIFY_SILENT, &pos, &meta) != ESP_OK) return;
  installState.valid = true;
  installState.used = meta.image_len / 1024;
  static const char tag[] = FW_INSTALL_TAG;
  const size_t tlen = sizeof(tag) - 1;
  uint8_t buf[512];
  size_t matched = 0, got = 0;
  for(uint32_t off = 0; off < meta.image_len; off += sizeof(buf)) {
    size_t n = min((uint32_t)sizeof(buf), meta.image_len - off);
    if(esp_partition_read(install, off, buf, n) != ESP_OK) return;
    for(size_t i = 0; i < n; i++) {
      if(matched == tlen) {
        // Le préfixe nu apparaît aussi dans le Mode installation (il s'en sert pour chercher) :
        // seule l'occurrence suivie de 12 caractères hexadécimaux est son identifiant.
        bool hex = (buf[i] >= '0' && buf[i] <= '9') || (buf[i] >= 'a' && buf[i] <= 'f');
        if(hex) {
          installState.id[got++] = (char)buf[i];
          if(got == 12) { installState.id[12] = '\0'; return; }
        }
        else { matched = buf[i] == (uint8_t)tag[0] ? 1 : 0; got = 0; }
      }
      else if(buf[i] == (uint8_t)tag[matched]) matched++;
      else matched = buf[i] == (uint8_t)tag[0] ? 1 : 0;
    }
  }
  installState.id[0] = '\0';
}

bool FwInfo::selectInstallMode() {
  const esp_partition_t *install = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_FACTORY, nullptr);
  if(!install) return false;
  const esp_partition_pos_t pos = {install->address, install->size};
  esp_image_metadata_t meta;
  if(esp_image_verify(ESP_IMAGE_VERIFY_SILENT, &pos, &meta) != ESP_OK) return false;
  // Lu AVANT esp_ota_set_boot_partition, qui efface otadata : un firmware déjà validé le note pour
  // se revalider seul au retour (marque consommée par Recovery::beginDetection, retirée par le Mode
  // installation s'il écrit une autre image).
  const esp_partition_t *run = esp_ota_get_running_partition();
  esp_ota_img_states_t st;
  bool proven = !run || esp_ota_get_state_partition(run, &st) != ESP_OK || st != ESP_OTA_IMG_PENDING_VERIFY;
  if(esp_ota_set_boot_partition(install) != ESP_OK) return false;
  if(proven) {
    Preferences p;
    if(p.begin("rst_logic", false)) { p.putUChar("ok", 1); p.end(); }
  }
  return true;
}

// Champs conservés de l'ancien fwStatus pour que l'interface et l'intégration Home Assistant
// gardent leurs repères (fwVersion, appVersion, checkForUpdate). "latest", "available" et
// "inetAvailable" ont disparu : le boîtier ne sait plus quelle version est publiée, c'est le
// relais qui le découvre.
void FwInfo::toJSON(JsonFormatter &json) {
  char board[40];
  boardToken(board, sizeof(board));
  json.addElem("board", board);
  // Génération de la table de partitions : le relais ne propose que les images bâties pour elle
  // (le marqueur de /updateFirmware refuserait les autres de toute façon).
  json.addElem("layout", (uint8_t)FW_PARTITION_LAYOUT);
  json.addElem("checkForUpdate", settings.checkForUpdate);
  json.beginObject("fwVersion");
  settings.fwVersion.toJSON(json);
  json.endObject();
  json.beginObject("appVersion");
  settings.appVersion.toJSON(json);
  json.endObject();
  json.beginObject("install");
  json.addElem("valid", installState.valid);
  json.addElem("id", installState.id);
  json.addElem("used", installState.used);
  json.addElem("size", installState.size);
  json.endObject();
}

// Le core Arduino appelle esp_ota_mark_app_valid_cancel_rollback() dès le démarrage, sauf si cette
// fonction faible (esp32-hal-misc.c, linkage C) rend true. Le chargeur est compilé avec
// CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE : sans validation, il revient seul à l'image précédente.
extern "C" bool verifyRollbackLater() { return true; }

void FwInfo::loopRollback(bool reachable) {
  static bool settled = false;
  if(settled) return;
  const esp_partition_t *running = esp_ota_get_running_partition();
  esp_ota_img_states_t state;
  if(!running || esp_ota_get_state_partition(running, &state) != ESP_OK || state != ESP_OTA_IMG_PENDING_VERIFY) {
    // Image déjà validée, ou flashée par USB (otadata effacé : aucun état) -- rien à décider.
    settled = true;
    return;
  }
  if(!reachable || millis() < FW_PROVEN_AFTER_MS) return;
  if(esp_ota_mark_app_valid_cancel_rollback() == ESP_OK) {
    Serial.println("New firmware proven: rollback cancelled");
    settled = true;
  }
}

void FwInfo::emit(uint8_t num) {
  JsonSockEvent *json = sockEmit.beginEmit("fwStatus");
  json->beginObject();
  toJSON(*json);
  json->endObject();
  sockEmit.endEmit(num);
}
