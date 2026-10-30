#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Publie sur le site Pages le catalogue des mises à jour : ota/index.json, les images
applicatives et les notes de version.

Le boîtier ne télécharge plus rien lui-même (plus de client TLS) : c'est le navigateur (page
Firmware) ou Home Assistant qui lisent ce catalogue, récupèrent l'image de la carte et l'envoient à
/updateFirmware avec son empreinte. Les assets de GitHub Releases n'étant pas lisibles par un
navigateur (aucun Access-Control-Allow-Origin, cf. mirror_releases.py), les images sont recopiées
ici, où Pages sert « * ».

Seule l'image APPLICATIVE est recopiée (ESPSomfyRTS_<tag>_firmware_<carte>.bin) : l'interface est
compilée dedans, et une mise à jour n'écrit plus que l'emplacement d'app inactif.

Pour chaque image : taille, SHA-256 (vérifié par l'appareil avant de la rendre amorçable) et
génération de table de partitions, lue dans le marqueur que porte tout firmware
(ESPSomfyRTS-PART/<n>/, cf. FW_IMAGE_MARKER). Une image sans marqueur ne s'installe pas par
/updateFirmware : elle n'est pas publiée.

Format de ota/index.json (chemins relatifs à ce fichier) :
    {"genere": "...", "versions": [
        {"tag": "v3.0.1", "name": "...", "prerelease": false, "dev": false, "date": "...",
         "layout": 5, "notes": "notes/v3.0.1.md",
         "boards": {"esp32": {"path": "v3.0.1/esp32.bin", "size": 1440425, "sha256": "..."}}}]}

Usage :
    mirror_ota.py --repo <owner/name> --site <dir> [--cache <dir>] [--nombre 5]
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

DEV_TAG = "dev"
RE_FIRMWARE = re.compile(r"^ESPSomfyRTS_.+_firmware_(.+)\.bin$")
RE_MARKER = re.compile(rb"ESPSomfyRTS-PART/(\d+)/")
CARTES = {"esp32", "esp32wrover", "esp32c3", "esp32s2", "esp32s3", "esp32c6"}


def carte(nom):
    """Clé de carte du catalogue, identique à celle de l'installateur web (box_eth, box_wifi)."""
    m = RE_FIRMWARE.match(nom)
    if not m:
        return None
    reste = m.group(1)
    if "BOX_wifi" in reste:
        return "box_wifi"
    if "BOX_eth" in reste:
        return "box_eth"
    return reste if reste in CARTES else None


def numero(tag):
    return tuple(int(n) for n in re.findall(r"\d+", tag)[:4]) or (0,)


def lister_releases(repo):
    sortie = subprocess.run(
        ["gh", "api", "--paginate", f"repos/{repo}/releases", "--jq",
         ".[] | {tag: .tag_name, nom: .name, draft: .draft, pre: .prerelease, "
         "date: .published_at, notes: .body, assets: [.assets[] | {name, updated_at}]}"],
        check=True, capture_output=True, text=True,
    ).stdout
    releases = [json.loads(l) for l in sortie.splitlines() if l.strip()]
    releases = [r for r in releases if not r["draft"] and r.get("date")]
    releases.sort(key=lambda r: r["date"], reverse=True)
    return releases


def telecharger(repo, tag, asset, destination):
    subprocess.run(
        ["gh", "release", "download", tag, "--repo", repo, "--pattern", asset,
         "--dir", os.path.dirname(destination), "--clobber"],
        check=True, capture_output=True, text=True,
    )
    os.replace(os.path.join(os.path.dirname(destination), asset), destination)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--site", required=True)
    ap.add_argument("--cache", default="")
    ap.add_argument("--nombre", type=int, default=5)
    args = ap.parse_args()

    releases = lister_releases(args.repo)
    stables = [r for r in releases if r["tag"] != DEV_TAG][:args.nombre]
    dev = [r for r in releases if r["tag"] == DEV_TAG][:1]
    retenues = stables + dev

    racine = os.path.join(args.site, "ota")
    os.makedirs(os.path.join(racine, "notes"), exist_ok=True)
    cache = args.cache or os.path.join(args.site, ".cache-ota-inutilise")
    os.makedirs(cache, exist_ok=True)
    for vieux in os.listdir(cache):
        if vieux not in {r["tag"] for r in retenues} and os.path.isdir(os.path.join(cache, vieux)):
            shutil.rmtree(os.path.join(cache, vieux))

    versions = []
    for r in retenues:
        tag = r["tag"]
        boards = {}
        layout = None
        for a in r["assets"]:
            c = carte(a["name"])
            if not c or c in boards:
                continue
            # La pré-release dev est republiée à chaque push sous le même tag : la date de
            # l'asset entre dans le nom du fichier en cache, sans quoi il resterait figé.
            stamp = re.sub(r"[^0-9]", "", a.get("updated_at") or "")
            fichier_cache = os.path.join(cache, tag, f"{c}-{stamp}.bin")
            os.makedirs(os.path.dirname(fichier_cache), exist_ok=True)
            if not (os.path.exists(fichier_cache) and os.path.getsize(fichier_cache) > 0):
                telecharger(args.repo, tag, a["name"], fichier_cache)
            with open(fichier_cache, "rb") as f:
                data = f.read()
            m = RE_MARKER.search(data)
            if not m:
                print(f"  {tag}/{c}: pas de marqueur de table, image ignorée")
                continue
            lay = int(m.group(1))
            if layout is not None and lay != layout:
                print(f"::warning::{tag} : générations de table différentes selon les cartes ({layout}/{lay})")
            layout = lay if layout is None else layout
            dossier = os.path.join(racine, tag)
            os.makedirs(dossier, exist_ok=True)
            with open(os.path.join(dossier, f"{c}.bin"), "wb") as f:
                f.write(data)
            boards[c] = {
                "path": f"{tag}/{c}.bin",
                "size": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "layout": lay,
            }
            print(f"  {tag}/{c:12s} {len(data)} o, table {lay}")
        if not boards:
            continue
        notes = f"notes/{tag}.md"
        with open(os.path.join(racine, notes), "w", encoding="utf-8") as f:
            f.write(r.get("notes") or "")
        versions.append({
            "tag": tag,
            "name": r.get("nom") or tag,
            "prerelease": bool(r["pre"]),
            "dev": tag == DEV_TAG,
            "date": r["date"],
            "layout": layout,
            "notes": notes,
            "boards": boards,
        })

    # Dev en tête, puis de la version la plus haute à la plus basse.
    versions.sort(key=lambda v: (v["dev"], numero(v["tag"])), reverse=True)
    index = {
        "genere": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "versions": versions,
    }
    with open(os.path.join(racine, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print(f"\n{len(versions)} version(s) au catalogue OTA -> {os.path.join(racine, 'index.json')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
