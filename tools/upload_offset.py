# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""
Upload PlatformIO (bouton de VS Code) : écrit l'image dans la partition que nomme
board_build.app_partition_name, à l'adresse lue dans la table.

Ni l'une ni l'autre plateforme ne le fait seule : espressif32@6.8.1 écrit toujours en 0x10000, sur
le Mode installation, et pioarduino (C6) toujours dans ota_0, sur le firmware principal.
"""
import csv

Import("env")  # noqa: F821

name = env.BoardConfig().get("build.app_partition_name", "")  # noqa: F821
table = env.subst("$PARTITIONS_TABLE_CSV")  # noqa: F821
offset = None
with open(table, encoding="utf-8") as f:
    for row in csv.reader(f):
        if len(row) >= 5 and row[0].strip() == name:
            offset = row[3].strip()
if not offset:
    print("[upload] partition « %s » absente de %s" % (name, table))
    env.Exit(1)  # noqa: F821
env.Replace(UPLOADCMD=env.get("UPLOADCMD", "").replace("$ESP32_APP_OFFSET", offset))  # noqa: F821
