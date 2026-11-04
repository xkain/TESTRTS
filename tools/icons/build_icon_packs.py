# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Assemble les packs d'icônes publiés dans le catalogue.

Source : icons/src/<id>/pack.json (métadonnées et jetons) + pack.svg (symboles et matières).
Sortie : icons/<id>.json, le fichier que l'interface télécharge, et icons/manifest.json.

Le plafond de 16 Ko gzippé est celui du firmware (MAX_ICON_PACK_SIZE, WebIcons.cpp) : un pack qui
le dépasse ferait échouer l'installation chez l'utilisateur, le script refuse donc de le publier.

Usage : python3 tools/icons/build_icon_packs.py
"""
import gzip
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "icons", "src")
OUT = os.path.join(ROOT, "icons")
MAX_GZ = 16 * 1024
CONTRACT = 1


def main():
    manifest = {"contract": CONTRACT, "packs": {}}
    failed = False
    for pid in sorted(os.listdir(SRC)):
        d = os.path.join(SRC, pid)
        if not os.path.isdir(d):
            continue
        with open(os.path.join(d, "pack.json"), encoding="utf-8") as f:
            meta = json.load(f)
        with open(os.path.join(d, "pack.svg"), encoding="utf-8") as f:
            svg = re.sub(r">\s+<", "><", f.read().strip())
        if meta.get("id") != pid or meta.get("contract") != CONTRACT:
            print(f"[icons] {pid} : id ou contrat incohérent avec le dossier")
            failed = True
            continue
        pack = dict(meta, svg=svg)
        pack.pop("description", None)
        body = json.dumps(pack, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        gz = len(gzip.compress(body, 9))
        if gz > MAX_GZ:
            print(f"[icons] {pid} : {gz} octets gzippés, au-delà du plafond de {MAX_GZ}")
            failed = True
            continue
        with open(os.path.join(OUT, pid + ".json"), "wb") as f:
            f.write(body)
        manifest["packs"][pid] = {k: meta[k] for k in ("name", "author", "version", "description") if k in meta}
        manifest["packs"][pid]["size"] = gz
        print(f"[icons] {pid:<12} {len(body):>6} -> {gz:>5} octets gzippés")
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
