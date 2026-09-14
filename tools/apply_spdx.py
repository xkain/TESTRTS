#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Pose l'en-tête SPDX sur les fichiers suivis qui n'en portent pas encore.

Outil de maintenance, PAS un garde-fou de build : il ne tourne pas pendant un `pio run`. À
lancer après avoir ajouté des fichiers au projet, pour que les nouveaux venus portent la même
mention que les 98 posées lors de la bascule vers l'AGPL (14/09/2026).

    python3 tools/apply_spdx.py            liste ce qui manque, n'écrit rien
    python3 tools/apply_spdx.py --apply    écrit

Idempotent : un fichier qui porte déjà SPDX-License-Identifier dans ses 15 premières lignes est
laissé tel quel, y compris si son en-tête a été reformulé à la main.

Deux variantes de copyright, et la frontière n'est pas cosmétique
----------------------------------------------------------------
Tout src/ porte le double copyright Robert Strouse + xkain, SAUF les fichiers listés dans
XKAIN_ONLY_IN_SRC : ceux-là n'existent dans aucune version antérieure (vérifié dans le dépôt
`main`, qui conserve l'historique rstrouse depuis 2023 ; `git log --author=trouse
--diff-filter=A` y donne la liste des 22 fichiers d'origine). Hors de src/, le copyright est
xkain seul : rstrouse n'a jamais écrit une ligne de data-dev/, docs/ ni de l'outillage.

Le reste du projet -- JSON, images, produits de build, gabarits -- ne peut pas porter de
commentaire et relève de REUSE.toml. Ne JAMAIS élargir SKIP_PREFIX sans ajouter l'entrée
correspondante dans REUSE.toml, et ne jamais apposer un copyright xkain sur du généré ou du
tiers : une seule fausse déclaration de paternité suffit à fragiliser toutes les autres.

Coût embarqué : nul. minify_js, minify_css et minify_html de build_data_image.py retirent les
commentaires avant le gzip, donc un en-tête dans data-dev/ n'atteint jamais l'image LittleFS
(`zcat data/index.js.gz | grep -c SPDX` renvoie 0).
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = "--apply" not in sys.argv

LIC = "AGPL-3.0-or-later"
TERMS = "Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS"
RSTROUSE = "SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>"
XKAIN = "SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>"

XKAIN_ONLY_IN_SRC = {
    "DiagConn.cpp", "DiagConn.h", "GitHubCA.h", "Recovery.cpp", "Recovery.h",
    "RecoveryPage.h", "Schedule.cpp", "Schedule.h", "StatusLed.cpp", "StatusLed.h",
    "SunCalc.cpp", "SunCalc.h",
}

LINE = {".cpp": "//", ".h": "//", ".ino": "//", ".js": "//",
        ".py": "#", ".yaml": "#", ".yml": "#", ".csv": "#", ".ini": ";"}
BLOCK = {".css": ("/*", " *", " */"), ".html": ("<!--", "    ", "-->")}
HANDLED = LINE.keys() | BLOCK.keys()

SKIP_PREFIX = ("data/", ".vscode/", "locales/", "docs/lang/",
               "tools/esp-flash-bundle/", ".github/ISSUE_TEMPLATE/")
SKIP_EXACT = ("get-platformio.py",)


def tracked():
    out = subprocess.run(["git", "-C", ROOT, "ls-files", "--cached", "--others",
                          "--exclude-standard"], capture_output=True, text=True, check=True)
    return [p for p in out.stdout.splitlines() if p]


def lines_for(rel):
    body = [f"SPDX-License-Identifier: {LIC}"]
    if rel.startswith("src/") and os.path.basename(rel) not in XKAIN_ONLY_IN_SRC:
        body.append(RSTROUSE)
    body.append(XKAIN)
    body.append(TERMS)
    return body


def render(ext, body):
    if ext in LINE:
        prefix = LINE[ext]
        return "".join(f"{prefix} {b}\n" for b in body)
    open_, mid, close = BLOCK[ext]
    text = f"{open_} {body[0]}\n"
    for b in body[1:]:
        text += f"{mid} {b}\n"
    return text + f"{close}\n" if ext == ".css" else text.rstrip("\n") + f" {close}\n"


def insert_at(ext, text):
    """Index du caractère où insérer. Trois pièges : le shebang doit rester en première ligne,
    un commentaire placé avant <!DOCTYPE> bascule certains navigateurs en quirks mode, et
    data-dev/index.html commence par un BOM qu'un en-tête inséré devant rendrait invisible."""
    bom = 1 if text.startswith("﻿") else 0
    if ext == ".py" and text.startswith("#!"):
        return text.index("\n") + 1
    if ext == ".html":
        rest = text[bom:]
        pad = len(rest) - len(rest.lstrip())
        if rest.lower().lstrip().startswith("<!doctype"):
            return text.index("\n", bom + pad) + 1
    return bom


def main():
    done, untouched, uncovered = [], [], []
    for rel in tracked():
        ext = os.path.splitext(rel)[1].lower()
        if rel in SKIP_EXACT or rel.startswith(SKIP_PREFIX):
            if ext in HANDLED:
                uncovered.append(rel)
            continue
        if ext not in HANDLED:
            continue
        path = os.path.join(ROOT, rel)
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        if "SPDX-License-Identifier" in "\n".join(text.splitlines()[:15]):
            untouched.append(rel)
            continue
        pos = insert_at(ext, text)
        if not DRY:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text[:pos] + render(ext, lines_for(rel)) + text[pos:])
        done.append(rel)

    dual = [r for r in done if r.startswith("src/")
            and os.path.basename(r) not in XKAIN_ONLY_IN_SRC]
    verb = "à poser" if DRY else "posés"
    print("[spdx] %d en-tête(s) %s (%d double copyright, %d xkain seul), %d déjà pourvu(s)"
          % (len(done), verb, len(dual), len(done) - len(dual), len(untouched)))
    for rel in sorted(done):
        print("  %s" % rel)
    for rel in sorted(uncovered):
        print("  écarté, à couvrir par REUSE.toml : %s" % rel)
    if done and DRY:
        print("[spdx] relancer avec --apply pour écrire")


if __name__ == "__main__":
    main()
