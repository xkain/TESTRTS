// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <Arduino.h>
#include <esp_system.h>
#include <esp_core_dump.h>
#include <esp_ota_ops.h>
#include "SysDiag.h"

static esp_reset_reason_t _resetReason = ESP_RST_UNKNOWN;

void SysDiag::begin() {
  _resetReason = esp_reset_reason();
}

const char *SysDiag::resetReason() {
  switch(_resetReason) {
    case ESP_RST_POWERON:   return "POWERON";
    case ESP_RST_EXT:       return "EXT";
    case ESP_RST_SW:        return "SW";
    case ESP_RST_PANIC:     return "PANIC";
    case ESP_RST_INT_WDT:   return "INT_WDT";
    case ESP_RST_TASK_WDT:  return "TASK_WDT";
    case ESP_RST_WDT:       return "WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT:  return "BROWNOUT";
    case ESP_RST_SDIO:      return "SDIO";
    default:                return "UNKNOWN";
  }
}

#if CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH && CONFIG_ESP_COREDUMP_DATA_FORMAT_ELF
struct CrashInfo { char task[16]; char elf[9]; uint32_t pc, cause, bt[16]; uint8_t depth; bool corrupted, sameElf; };
static CrashInfo *_crash = nullptr;

void SysDiag::readCrash() {
  if(esp_core_dump_image_check() != ESP_OK) return;
  esp_core_dump_summary_t *s = (esp_core_dump_summary_t *)malloc(sizeof(esp_core_dump_summary_t));
  if(s && esp_core_dump_get_summary(s) == ESP_OK && (_crash = (CrashInfo *)calloc(1, sizeof(CrashInfo)))) {
    strlcpy(_crash->task, s->exc_task, sizeof(_crash->task));
    strlcpy(_crash->elf, (const char *)s->app_elf_sha256, sizeof(_crash->elf));
    char run[9] = "";
#if ESP_IDF_VERSION_MAJOR >= 5
    esp_app_get_elf_sha256(run, sizeof(run));
#else
    esp_ota_get_app_elf_sha256(run, sizeof(run));
#endif
    _crash->sameElf = !strcmp(run, _crash->elf);
    _crash->pc = s->exc_pc;
#if __XTENSA__
    _crash->cause = s->ex_info.exc_cause;
    _crash->depth = s->exc_bt_info.depth > 16 ? 16 : s->exc_bt_info.depth;
    memcpy(_crash->bt, s->exc_bt_info.bt, _crash->depth * sizeof(uint32_t));
    _crash->corrupted = s->exc_bt_info.corrupted;
#else
    _crash->cause = s->ex_info.mcause;
    _crash->bt[0] = s->exc_pc;
    _crash->bt[1] = s->ex_info.ra;
    _crash->depth = 2;
#endif
  }
  free(s);
}

size_t SysDiag::crashJSON(char *out, size_t len) {
  if(!_crash) return snprintf(out, len, "{\"present\":false}");
  int n = snprintf(out, len, "{\"present\":true,\"task\":\"%s\",\"pc\":\"0x%08x\",\"cause\":%u,\"elf\":\"%s\",\"sameElf\":%s,\"corrupted\":%s,\"bt\":\"",
    _crash->task, _crash->pc, _crash->cause, _crash->elf, _crash->sameElf ? "true" : "false", _crash->corrupted ? "true" : "false");
  for(uint8_t i = 0; i < _crash->depth && n < (int)len; i++) n += snprintf(out + n, len - n, i ? " 0x%08x" : "0x%08x", _crash->bt[i]);
  if(n < (int)len) n += snprintf(out + n, len - n, "\"}");
  return n;
}

void SysDiag::eraseCrash() {
  free(_crash);
  _crash = nullptr;
  esp_core_dump_image_erase();
}
#else
void SysDiag::readCrash() {}
size_t SysDiag::crashJSON(char *out, size_t len) { return snprintf(out, len, "{\"present\":false}"); }
void SysDiag::eraseCrash() {}
#endif
