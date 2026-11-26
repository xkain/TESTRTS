#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Lit le fichier « ESPSomfyRTS coredump <elf>.bin » de Système › Dépannage (ESP32, Xtensa).

Usage : decode_coredump.py <coredump.bin> <firmware.elf> [tâche] [--addr2line CHEMIN]

Sans tâche : toutes les tâches du dump. Pour chacune, les adresses de code trouvées dans sa pile,
traduites par addr2line : des appelants probables, pas un déroulé exact de la pile. L'ELF doit être
celui dont l'empreinte figure dans le nom du fichier (artefact CI elf-<env> ou archive symbols_<version>_elf.zip de release).
Dépendance : pyelftools.
"""
import glob
import io
import os
import re
import shutil
import struct
import subprocess
import sys

try:
    from elftools.elf.elffile import ELFFile
except ImportError:
    sys.exit("pyelftools manquant : pip install pyelftools")

TCB_SIZE = 344


def find_addr2line(explicit):
    if explicit:
        return explicit
    found = shutil.which("xtensa-esp32-elf-addr2line")
    if found:
        return found
    pio = glob.glob(os.path.expanduser("~/.platformio/packages/toolchain-xtensa-esp32/bin/xtensa-esp32-elf-addr2line"))
    if pio:
        return pio[0]
    sys.exit("xtensa-esp32-elf-addr2line introuvable : passer --addr2line CHEMIN")


def tasks(core):
    segs = [(s["p_vaddr"], s.data()) for s in core.iter_segments() if s["p_type"] == "PT_LOAD"]
    for tcb_va, tcb in segs:
        if len(tcb) != TCB_SIZE:
            continue
        top = struct.unpack_from("<I", tcb, 0)[0]
        stack = next((d for va, d in segs if va <= top < va + len(d) and va != tcb_va), None)
        if stack is None:
            continue
        m = re.match(rb"([A-Za-z][A-Za-z0-9_.]{1,15})\x00", tcb[0x38:])
        yield (m.group(1).decode() if m else hex(tcb_va)), stack


def code_addresses(stack):
    seen = []
    for o in range(0, len(stack) - 3, 4):
        w = struct.unpack_from("<I", stack, o)[0]
        if w >> 30 and 0x000D0000 <= (w & 0x3FFFFFFF) < 0x00400000:
            a = (w & 0x3FFFFFFF) | 0x40000000
            if a not in seen:
                seen.append(a)
    return seen


def main(argv):
    a2l = None
    if "--addr2line" in argv:
        i = argv.index("--addr2line")
        a2l = argv[i + 1]
        del argv[i:i + 2]
    if len(argv) < 3:
        sys.exit(__doc__)
    dump, elf = argv[1], argv[2]
    only = argv[3] if len(argv) > 3 else None
    data = open(dump, "rb").read()
    start = data.find(b"\x7fELF")
    if start < 0:
        sys.exit("pas de coredump ELF dans ce fichier")
    core = ELFFile(io.BytesIO(data[start:]))
    a2l = find_addr2line(a2l)
    listed = False
    for name, stack in tasks(core):
        if only and name != only:
            continue
        listed = True
        addrs = code_addresses(stack)
        print(f"== {name}")
        if not addrs:
            continue
        out = subprocess.run([a2l, "-pfC", "-e", elf] + [hex(a) for a in addrs], capture_output=True, text=True).stdout
        for a, line in zip(addrs, out.splitlines()):
            if "??" in line:
                continue
            func, _, where = line.partition(" at ")
            print(f"   {a:#010x}  {func[:80]}  {os.path.basename(where)}")
    if only and not listed:
        sys.exit(f"tâche {only} absente du dump")


if __name__ == "__main__":
    main(sys.argv)
