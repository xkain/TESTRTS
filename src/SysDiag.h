// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef sysdiag_h
#define sysdiag_h
#include <Arduino.h>

#define WDT_TIMEOUT_SEC 15

namespace SysDiag {
  void begin();
  const char *resetReason();
}
#endif
