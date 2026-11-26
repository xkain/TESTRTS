// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#pragma once
#ifdef __cplusplus
#include <Arduino.h>
inline decltype(Serial) &logTeeHw() { return Serial; }
#include "LogTee.h"
#undef Serial
#define Serial SerialTee
#endif
