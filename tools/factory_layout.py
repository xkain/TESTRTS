# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Adresses de l'image factory, lues dans la table, et otadata qui fait démarrer app0.

Usage : factory_layout.py <table.csv> <otadata.bin>
Écrit <otadata.bin> et affiche « <otadata> <install> <app0> » (offsets hexadécimaux).
Format d'une entrée otadata (esp_ota_select_entry_t) : ota_seq, seq_label[20], ota_state, crc ;
ota_seq = 1 désigne ota_0, crc = CRC32 de ota_seq seul (comme esp_ota_ops et otatool.py).
"""
import binascii
import csv
import struct
import sys


def offsets(path):
    rows = {}
    for row in csv.reader(open(path, encoding="utf-8")):
        if row and not row[0].lstrip().startswith("#") and len(row) >= 5:
            rows[row[0].strip()] = (row[3].strip(), int(row[4].strip(), 0))
    return rows


def otadata(size):
    seq = 1
    entry = struct.pack("<I", seq) + b"\xff" * 20 + struct.pack("<I", 0xFFFFFFFF)
    entry += struct.pack("<I", binascii.crc32(struct.pack("<I", seq), 0xFFFFFFFF) & 0xFFFFFFFF)
    return entry + b"\xff" * (size - len(entry))


if __name__ == "__main__":
    rows = offsets(sys.argv[1])
    off, size = rows["otadata"]
    with open(sys.argv[2], "wb") as f:
        f.write(otadata(size))
    print(off, rows["install"][0], rows["app0"][0])
