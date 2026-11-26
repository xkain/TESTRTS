// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef logtee_h
#define logtee_h
#include <Arduino.h>

#ifndef LOG_RING_SIZE
#define LOG_RING_SIZE 4096
#endif

namespace LogRing {
  uint32_t span(uint32_t *first);
  size_t read(uint32_t *pos, uint32_t end, char *out, size_t cap);
}

class LogTee : public Stream {
  public:
    void begin(unsigned long baud);
    int available() override;
    int read() override;
    int peek() override;
    void flush() override;
    size_t write(uint8_t c) override;
    size_t write(const uint8_t *buffer, size_t size) override;
    using Print::write;
};

extern LogTee SerialTee;
#endif
