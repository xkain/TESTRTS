#!/usr/bin/env python3
"""
Empaquette CHAQUE fichier de langue (embarqué dans data-dev/locale/ ou "à la demande" dans
locales/) en un .json.gz individuel, prêt à être attaché comme asset de release GitHub
(cf. .github/workflows/build.yaml, job `littlefs`). Distinct de minify_data.py : celui-ci ne
traite QUE les langues embarquées par défaut au build (data-dev -> data), alors que ce script
traite TOUTES les langues du projet, embarquées ou non, pour la Phase 1 de l'i18n dynamique.

Usage : python package_langs.py [dossier_de_sortie]  (défaut : dist_langs/)
"""

import gzip
import json
import os
import sys

SRC_DIRS = ["data-dev/locale", "locales"]
DEFAULT_OUT_DIR = "dist_langs"


def minify_json(text):
    data = json.loads(text)
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


def package_all(out_dir):
    if os.path.exists(out_dir):
        for fname in os.listdir(out_dir):
            os.remove(os.path.join(out_dir, fname))
    os.makedirs(out_dir, exist_ok=True)

    seen = {}
    for src_dir in SRC_DIRS:
        if not os.path.isdir(src_dir):
            continue
        for fname in sorted(os.listdir(src_dir)):
            if not fname.endswith(".json"):
                continue
            code = fname[: -len(".json")]
            if code in seen:
                print(f"[package_langs] ATTENTION : code '{code}' présent à la fois dans "
                      f"{seen[code]} et {src_dir}, ce dernier est ignoré.")
                continue
            seen[code] = src_dir

            src_path = os.path.join(src_dir, fname)
            with open(src_path, "r", encoding="utf-8") as f:
                content = minify_json(f.read())

            gz_path = os.path.join(out_dir, f"{code}.json.gz")
            with gzip.open(gz_path, "wb", compresslevel=9) as gz:
                gz.write(content.encode("utf-8"))

            old_sz = os.path.getsize(src_path)
            new_sz = os.path.getsize(gz_path)
            pct = (old_sz - new_sz) / old_sz * 100 if old_sz > 0 else 0
            print(f"  {code:<6} ({src_dir}) {old_sz:>7} -> {new_sz:>7} B ({pct:>3.0f}%)")

    return sorted(seen.keys())


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT_DIR
    print(f"[package_langs] Empaquetage des langues -> {out_dir}/")
    codes = package_all(out_dir)
    print(f"[package_langs] {len(codes)} langue(s) traitée(s) : {', '.join(codes)}")
