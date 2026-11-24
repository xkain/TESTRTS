# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Reprend de ../src/ConfigSettings.h ce que le Mode installation doit partager avec le firmware
principal : génération de table (marqueur exigé des images), version, préfixe de version."""
import glob
import hashlib
import os
import re

Import("env")

HEADER = os.path.join(env.subst("$PROJECT_DIR"), "..", "src", "ConfigSettings.h")
WANTED = {
    "FW_PARTITION_LAYOUT": r"#define\s+FW_PARTITION_LAYOUT\s+(\d+)",
    "FW_VERSION": r'#define\s+FW_VERSION\s+"([^"]+)"',
    "FW_VERSION_PREFIX": r'#define\s+FW_VERSION_PREFIX\s+"([^"]+)"',
    "FW_INSTALL_TAG": r'#define\s+FW_INSTALL_TAG\s+"([^"]+)"',
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
# Identifiant du Mode installation : empreinte de ce qui le fait fonctionner, version du firmware
# exclue. Deux compilations du même code donnent le même identifiant, et l'appareil ne réécrit sa
# partition install que lorsqu'il change (cf. /updateInstall).
project = env.subst("$PROJECT_DIR")
sources = sorted(glob.glob(os.path.join(project, "src", "**", "*"), recursive=True))
sources += [os.path.join(project, "platformio.ini"), os.path.join(project, "main_contract.py"),
            os.path.join(project, "..", "partitions_common_4mb.csv")]
digest = hashlib.sha256()
for path in sources:
    if os.path.isfile(path):
        digest.update(os.path.relpath(path, project).encode())
        digest.update(open(path, "rb").read())
for name, pattern in WANTED.items():
    if name != "FW_VERSION":
        digest.update(re.search(pattern, text).group(1).encode())
defines.append(("INSTALL_ID", env.StringifyMacro(digest.hexdigest()[:12])))
env.Append(CPPDEFINES=defines)
