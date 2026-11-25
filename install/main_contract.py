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
# Sources seules : pioarduino (C6) dépose un idf_component.yml dans src/, qui changerait l'empreinte
# selon l'ordre des builds.
sources = sorted(p for p in glob.glob(os.path.join(project, "src", "**", "*"), recursive=True)
                 if p.endswith((".c", ".cpp", ".h")))
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
digest_id = digest.hexdigest()[:12]
# Version lisible tenue à la main dans install/VERSION (« 1.0 » puis l'empreinte de ce code) : une
# empreinte qui ne correspond plus fait échouer la CI, pour qu'aucune image publiée ne porte une
# version déjà prise par un autre code. En local, le build passe avec l'étiquette « 1.0+ ».
label, recorded = "0.0", ""
ver_path = os.path.join(project, "VERSION")
if os.path.isfile(ver_path):
    label, recorded = (open(ver_path, encoding="utf-8").read().split() + ["", ""])[:2]
if recorded != digest_id:
    msg = "[install] firmware de secours modifié : passer install/VERSION au-delà de %s avec l'empreinte %s" % (label, digest_id)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(msg)
        env.Exit(1)
    print(msg + " (build local : %s+)" % label)
    label += "+"
defines.append(("INSTALL_ID", env.StringifyMacro(digest_id)))
defines.append(("INSTALL_VER", env.StringifyMacro(label)))
env.Append(CPPDEFINES=defines)
