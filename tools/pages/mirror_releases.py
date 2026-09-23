#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Recopie sur le site Pages les images « factory » de plusieurs releases.

Les assets de GitHub Releases ne sont pas récupérables par le navigateur : leur URL finale
(release-assets.githubusercontent.com) n'envoie aucun Access-Control-Allow-Origin, quelle que soit
la forme d'URL employée -- y compris celle de l'API, dont la redirection porte pourtant CORS mais
pas sa destination. L'installateur web ne peut donc lire que des fichiers servis par SA PROPRE
origine : d'où cette recopie, faite côté serveur où aucune contrainte CORS ne s'applique.

Ce sont les ARCHIVES .zip qui sont recopiées, pas les images extraites. Le navigateur les déballe
lui-même (cf. lireArchive() dans docs/js/installer.js, déjà employé par le téléversement manuel) :
c'est quatre fois moins d'octets sur le site pour exactement le même volume transféré, le CDN de
Pages gzippant de toute façon les .bin (4 128 768 o -> 1 129 689 o mesurés en ligne).

Rien ici ne dépend des artefacts de build : ceux-ci expirent au bout de 90 jours, ce qui rendrait
toute version un peu ancienne irrécupérable. Les images sont reconnues à leur NOM, selon les
conventions publiées, et l'offset d'écriture vaut 0 pour toutes (image fusionnée, elle contient
son propre amorceur et sa table de partitions).

Ce sont simplement les N dernières releases publiées, toutes lignées confondues -- pas un quota
par génération. La reconnaissance des images, elle, dépend bien de la lignée : les 2.x ne nomment
pas leurs assets comme les 3.x. Ce qui sort de la fenêtre reste installable par le téléversement
manuel, et le sélecteur le dit.

Usage :
    mirror_releases.py --repo <owner/name> --site <dir> [--cache <dir>] [--nombre 5]
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

# Familles de puce telles qu'ESP Web Tools les attend, par identifiant de carte du site. Ces
# identifiants sont ceux de HARDWARE dans docs/js/installer.js ET de matrix.env dans build.yaml :
# les trois doivent rester alignés.
PUCES = {
    "esp32": "ESP32",
    "esp32wrover": "ESP32",
    "esp32c3": "ESP32-C3",
    "esp32s2": "ESP32-S2",
    "esp32s3": "ESP32-S3",
    "esp32c6": "ESP32-C6",
    "box_wifi": "ESP32",
    "box_eth": "ESP32",
}

# v3 : ESPSomfyRTS_<tag>_factory_<carte>.zip, avec deux ordres possibles pour le marqueur de
# boîtier -- il précédait la carte jusqu'à la v3.0.4 incluse, il la suit depuis. Les deux formes
# coexistent donc dans les releases déjà publiées.
RE_V3 = re.compile(r"^ESPSomfyRTS_.+_factory_(.+)\.zip$")

# v2 : SomfyController.onboard.<carte>.bin.zip
RE_V2 = re.compile(r"^SomfyController\.onboard\.(.+)\.bin\.zip$")


def carte_v3(nom):
    m = RE_V3.match(nom)
    if not m:
        return None
    reste = m.group(1)
    if "BOX_wifi" in reste:
        return "box_wifi"
    if "BOX_eth" in reste:
        return "box_eth"
    return reste if reste in PUCES else None


def carte_v2(nom):
    m = RE_V2.match(nom)
    if not m:
        return None
    carte = m.group(1)
    # esp32s3_4mb et esp32s3_8mb visent la même carte du site mais deux tailles de flash
    # différentes, et rien ne dit laquelle est branchée. Plutôt que d'en choisir une au hasard,
    # l'ESP32-S3 en 2.x reste au téléversement manuel, où l'onglet « images v2.x » explique
    # précisément ce suffixe.
    return carte if carte in PUCES else None


def majeur(tag):
    m = re.match(r"^v?(\d+)\.", tag)
    return int(m.group(1)) if m else 0


def numero(tag):
    """Tag -> tuple comparable, pour ordonner le sélecteur par version et non par date.

    Les deux ordres divergent réellement ici : la pré-version 3.0.1 a été publiée AVANT la 3.0.0.
    On retient les releases les plus RÉCENTES, mais on les présente de la plus HAUTE à la plus
    basse -- c'est ce qu'un sélecteur de version laisse attendre.
    """
    return tuple(int(n) for n in re.findall(r"\d+", tag)[:4]) or (0,)


def lister_releases(repo):
    """Toutes les releases publiées, la plus récente d'abord."""
    sortie = subprocess.run(
        ["gh", "api", "--paginate", f"repos/{repo}/releases", "--jq",
         ".[] | {tag: .tag_name, nom: .name, draft: .draft, pre: .prerelease, "
         "date: .published_at, assets: [.assets[].name]}"],
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
    recu = os.path.join(os.path.dirname(destination), asset)
    os.replace(recu, destination)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--site", required=True)
    ap.add_argument("--cache", default="")
    ap.add_argument("--nombre", type=int, default=5,
                    help="nombre de releases recopiées, de la plus récente à la plus ancienne")
    args = ap.parse_args()

    releases = lister_releases(args.repo)
    if not releases:
        print("Aucune release publiée : site publié sans images.")
        return 0

    # Les plus récentes par DATE de publication, quelle que soit la lignée.
    retenues = [r for r in releases if majeur(r["tag"]) >= 2][:args.nombre]
    tags_retenus = {r["tag"] for r in retenues}

    cache = args.cache or os.path.join(args.site, ".cache-inutilise")
    os.makedirs(cache, exist_ok=True)

    # Le cache est restauré d'un déploiement à l'autre : sans élagage il garderait indéfiniment
    # les versions sorties de la fenêtre.
    for vieux in os.listdir(cache):
        if vieux not in tags_retenus and os.path.isdir(os.path.join(cache, vieux)):
            shutil.rmtree(os.path.join(cache, vieux))
            print(f"cache: {vieux} élagué")

    versions = []
    for r in retenues:
        tag = r["tag"]
        reconnaitre = carte_v3 if majeur(tag) >= 3 else carte_v2
        trouvees = {}
        for asset in r["assets"]:
            carte = reconnaitre(asset)
            if carte and carte not in trouvees:
                trouvees[carte] = asset
        if not trouvees:
            print(f"::warning::{tag} : aucune image reconnue, version ignorée.")
            continue

        dossier_cache = os.path.join(cache, tag)
        dossier_site = os.path.join(args.site, "firmware", tag)
        os.makedirs(dossier_cache, exist_ok=True)
        os.makedirs(dossier_site, exist_ok=True)

        cartes = {}
        for carte, asset in sorted(trouvees.items()):
            fichier = os.path.join(dossier_cache, f"{carte}.zip")
            if os.path.exists(fichier) and os.path.getsize(fichier) > 0:
                etat = "cache"
            else:
                telecharger(args.repo, tag, asset, fichier)
                etat = f"{os.path.getsize(fichier)} o"
            shutil.copyfile(fichier, os.path.join(dossier_site, f"{carte}.zip"))
            # Chemin relatif à la PAGE (docs/installer.html), pas au fichier d'index : c'est le
            # script de la page qui récupère l'archive, plus ESP Web Tools qui résolvait autrefois
            # ses `path` contre l'URL du manifeste. Un "../" ici sortirait du sous-chemin du site
            # sur github.io -- invisible en local, où le navigateur bute sur la racine.
            cartes[carte] = f"firmware/{tag}/{carte}.zip"
            print(f"  {tag}/{carte:12s} <- {asset}  ({etat})")

        # Le TAG et pas le nom de la release : celui-ci est libre et diverge parfois du numéro
        # de version qu'il désigne (« v3.01 » pour le tag v3.0.1). Le tag, lui, est celui que
        # l'appareil compare à sa propre version.
        versions.append({
            "tag": tag,
            "majeur": majeur(tag),
            "prerelease": bool(r["pre"]),
            "cartes": cartes,
        })

    # Les autres releases existent toujours sur GitHub : le sélecteur les affiche en grisé pour
    # dire qu'elles sont installables, mais par le bouton de téléversement.
    versions.sort(key=lambda v: numero(v["tag"]), reverse=True)

    manuelles = [
        {"tag": r["tag"], "majeur": majeur(r["tag"])}
        for r in releases if r["tag"] not in tags_retenus and majeur(r["tag"]) >= 2
    ][:25]
    manuelles.sort(key=lambda v: numero(v["tag"]), reverse=True)

    index = {
        "genere": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "puces": PUCES,
        "versions": versions,
        "manuelles": manuelles,
    }
    os.makedirs(os.path.join(args.site, "manifests"), exist_ok=True)
    chemin = os.path.join(args.site, "manifests", "index.json")
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print(f"\n{len(versions)} version(s) recopiée(s), {len(manuelles)} en téléversement manuel "
          f"-> {chemin}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
