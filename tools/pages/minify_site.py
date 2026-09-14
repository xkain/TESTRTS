#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Minifie le site Pages assemblé, sur la COPIE de déploiement -- jamais sur docs/.

Volontairement indépendant de build_data_image.py : celui-ci sert le firmware, avec ses propres
contraintes (tenir dans LittleFS, être servi par un ESP32 sans CDN) et son propre calendrier. Les
deux chaînes n'ont aucune raison d'évoluer ensemble, et les faire dépendre l'une de l'autre les
condamnerait à se casser mutuellement.

Ce que ça change, mesuré sur le site en l'état : 220 046 o de sources deviennent 72 200 o une fois
gzippés par le CDN de Pages ; minifiés d'abord, 39 790 o. Le gzip n'efface pas les commentaires --
il compresse la répétition, or de la prose est peu répétitive. Et ces commentaires sont VISIBLES :
l'inspecteur du navigateur montre les sources telles quelles.

Le HTML est traité ici, le CSS et le JS par esbuild s'il est fourni (--esbuild) : il est déjà
installé par le workflow pour empaqueter flash.js, et il minifie mieux que ne le ferait une
expression régulière -- il renomme aussi les variables locales.

Usage :
    minify_site.py <dossier> [--esbuild <chemin>]
"""

import argparse
import glob
import os
import re
import subprocess
import sys

# Contenus à ne surtout pas toucher : leur espacement est signifiant (<pre>, <textarea>) ou leur
# syntaxe n'est pas du HTML (<script>, <style>).
INTOUCHABLES = re.compile(r"(?is)<(pre|textarea|script|style)\b.*?</\1\s*>")

# Une balise, en tenant compte des valeurs d'attribut qui peuvent contenir un '>'.
BALISE = re.compile(r"""<(?:"[^"]*"|'[^']*'|[^'">])*>""")

COMMENTAIRE = re.compile(r"<!--.*?-->", re.S)


def minify_html(texte):
    """Retire les commentaires et l'indentation, sans jamais coller deux mots.

    Toute suite d'espaces contenant un saut de ligne devient UN espace, pas rien : entre deux
    éléments en ligne, ce saut de ligne EST un espace pour le navigateur, et le supprimer
    souderait les mots. Entre deux blocs il est inerte, donc le garder ne coûte qu'un octet.
    La règle ne s'applique qu'au TEXTE : à l'intérieur des balises, les attributs -- tracés SVG
    compris -- restent intacts.
    """
    coffre = []

    def ranger(m):
        coffre.append(m.group(0))
        return "\x00%d\x00" % (len(coffre) - 1)

    texte = INTOUCHABLES.sub(ranger, texte)
    texte = COMMENTAIRE.sub("", texte)

    morceaux = []
    position = 0
    for m in BALISE.finditer(texte):
        morceaux.append(re.sub(r"\s*\n\s*", " ", texte[position:m.start()]))
        morceaux.append(m.group(0))
        position = m.end()
    morceaux.append(re.sub(r"\s*\n\s*", " ", texte[position:]))
    texte = "".join(morceaux)

    # Les espaces en tête et en fin de document ne rendent rien.
    texte = texte.strip()
    return re.sub(r"\x00(\d+)\x00", lambda m: coffre[int(m.group(1))], texte)


def esbuild(chemin, fichier):
    """Minifie un .css ou .js en place. Rend True si esbuild a bien travaillé."""
    args = [chemin, fichier, "--minify", "--outfile=" + fichier, "--allow-overwrite"]
    if fichier.endswith(".js"):
        # Les modules gardent leurs import/export : installer.js en a un vers le paquet flash.js.
        args.append("--format=esm")
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        print("::warning::esbuild a échoué sur %s : %s" % (fichier, r.stderr.strip()[:200]))
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dossier")
    ap.add_argument("--esbuild", default="", help="chemin de l'exécutable esbuild (css et js)")
    args = ap.parse_args()

    total_avant = total_apres = 0
    for fichier in sorted(glob.glob(os.path.join(args.dossier, "**", "*"), recursive=True)):
        ext = os.path.splitext(fichier)[1].lower()
        if not os.path.isfile(fichier) or ext not in (".html", ".css", ".js"):
            continue
        # Le paquet flash.js est déjà minifié par sa propre build.
        if os.path.basename(os.path.dirname(fichier)) == "vendor":
            continue

        avant = os.path.getsize(fichier)
        if ext == ".html":
            with open(fichier, encoding="utf-8") as f:
                texte = f.read()
            with open(fichier, "w", encoding="utf-8") as f:
                f.write(minify_html(texte))
        elif args.esbuild:
            if not esbuild(args.esbuild, fichier):
                continue
        else:
            continue
        apres = os.path.getsize(fichier)
        total_avant += avant
        total_apres += apres
        print("  %-34s %7d -> %7d o  (-%.0f%%)"
              % (os.path.relpath(fichier, args.dossier), avant, apres,
                 100 * (1 - apres / avant) if avant else 0))

    if total_avant:
        print("\n  total %d -> %d o  (-%.1f%%)"
              % (total_avant, total_apres, 100 * (1 - total_apres / total_avant)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
