# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Reprend de ../src/ConfigSettings.h ce que le Mode installation doit partager avec le firmware
principal : génération de table (marqueur exigé des images), version, préfixe de version."""
import os
import re

Import("env")

HEADER = os.path.join(env.subst("$PROJECT_DIR"), "..", "src", "ConfigSettings.h")
WANTED = {
    "FW_PARTITION_LAYOUT": r"#define\s+FW_PARTITION_LAYOUT\s+(\d+)",
    "FW_VERSION": r'#define\s+FW_VERSION\s+"([^"]+)"',
    "FW_VERSION_PREFIX": r'#define\s+FW_VERSION_PREFIX\s+"([^"]+)"',
}

text = open(HEADER, encoding="utf-8").read()
defines = []
for name, pattern in WANTED.items():
    m = re.search(pattern, text)
    if not m:
        print("[install] %s introuvable dans %s" % (name, HEADER))
        env.Exit(1)
    value = m.group(1)
    defines.append((name, value if name == "FW_PARTITION_LAYOUT" else env.StringifyMacro(value)))
env.Append(CPPDEFINES=defines)
