// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include <Arduino.h>
#include <esp_log.h>
#include "LogTee.h"

LogTee SerialTee;

static char s_ring[LOG_RING_SIZE];
static uint32_t s_total = 0;
static uint32_t s_dropped = 0;
static char s_line[192];
static bool s_bol = true;
static SemaphoreHandle_t s_mx = nullptr;
static vprintf_like_t s_prevVprintf = nullptr;

static void stampLocked() {
  char ts[16];
  int k;
  time_t now = time(nullptr);
  if(now > 1700000000) {
    struct tm t;
    localtime_r(&now, &t);
    k = snprintf(ts, sizeof(ts), "%02d:%02d:%02d ", t.tm_hour, t.tm_min, t.tm_sec);
  }
  else {
    uint32_t ms = millis();
    k = snprintf(ts, sizeof(ts), "+%u.%us ", (unsigned)(ms / 1000), (unsigned)(ms / 100 % 10));
  }
  for(int i = 0; i < k; i++) s_ring[s_total++ % LOG_RING_SIZE] = ts[i];
}

static void putLocked(const char *p, size_t n) {
  for(size_t i = 0; i < n; i++) {
    if(p[i] == '\x1b') {
      while(i < n && !((p[i] >= 'A' && p[i] <= 'Z') || (p[i] >= 'a' && p[i] <= 'z'))) i++;
      continue;
    }
    if(s_bol && p[i] != '\n' && p[i] != '\r') stampLocked();
    s_ring[s_total++ % LOG_RING_SIZE] = p[i];
    if(p[i] != '\r') s_bol = p[i] == '\n';
  }
}

static void flushDroppedLocked() {
  if(!s_dropped) return;
  int k = snprintf(s_line, sizeof(s_line), s_bol ? "... %u write(s) dropped\n" : "\n... %u write(s) dropped\n", (unsigned)s_dropped);
  if(k > 0) putLocked(s_line, (size_t)k);
  s_dropped = 0;
}

static void ringPut(const char *p, size_t n) {
  if(!n || !s_mx) return;
  if(xPortInIsrContext() || xSemaphoreTake(s_mx, pdMS_TO_TICKS(2)) != pdTRUE) { s_dropped++; return; }
  flushDroppedLocked();
  putLocked(p, n);
  xSemaphoreGive(s_mx);
}

static int logVprintf(const char *fmt, va_list ap) {
  va_list ap2;
  va_copy(ap2, ap);
  int r = s_prevVprintf ? s_prevVprintf(fmt, ap) : vprintf(fmt, ap);
  if(s_mx && !xPortInIsrContext() && xSemaphoreTake(s_mx, pdMS_TO_TICKS(2)) == pdTRUE) {
    flushDroppedLocked();
    int k = vsnprintf(s_line, sizeof(s_line), fmt, ap2);
    if(k > 0) putLocked(s_line, (size_t)k < sizeof(s_line) ? (size_t)k : sizeof(s_line) - 1);
    xSemaphoreGive(s_mx);
  }
  else if(s_mx) s_dropped++;
  va_end(ap2);
  return r;
}

static uint32_t oldestLocked() { return s_total > LOG_RING_SIZE ? s_total - LOG_RING_SIZE : 0; }

uint32_t LogRing::span(uint32_t *first) {
  *first = 0;
  if(!s_mx || xSemaphoreTake(s_mx, pdMS_TO_TICKS(50)) != pdTRUE) return 0;
  uint32_t b = oldestLocked(), end = s_total;
  if(b) {
    while(b < end && s_ring[b % LOG_RING_SIZE] != '\n') b++;
    if(b < end) b++;
  }
  xSemaphoreGive(s_mx);
  *first = b;
  return end;
}

size_t LogRing::read(uint32_t *pos, uint32_t end, char *out, size_t cap) {
  if(!s_mx || !cap || xSemaphoreTake(s_mx, pdMS_TO_TICKS(50)) != pdTRUE) return 0;
  if(*pos < oldestLocked()) *pos = oldestLocked();
  size_t n = *pos < end ? end - *pos : 0;
  if(n > cap) n = cap;
  for(size_t i = 0; i < n; i++) out[i] = s_ring[(*pos + i) % LOG_RING_SIZE];
  xSemaphoreGive(s_mx);
  *pos += n;
  return n;
}

void LogTee::begin(unsigned long baud) {
  logTeeHw().begin(baud);
  if(s_mx) return;
  s_mx = xSemaphoreCreateMutex();
  if(s_mx) s_prevVprintf = esp_log_set_vprintf(logVprintf);
}
int LogTee::available() { return logTeeHw().available(); }
int LogTee::read() { return logTeeHw().read(); }
int LogTee::peek() { return logTeeHw().peek(); }
void LogTee::flush() { logTeeHw().flush(); }
size_t LogTee::write(uint8_t c) { return this->write(&c, 1); }
size_t LogTee::write(const uint8_t *buffer, size_t size) {
  size_t r = logTeeHw().write(buffer, size);
  ringPut((const char *)buffer, size);
  return r;
}
