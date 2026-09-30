#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""
Garde-fou de build : vérifie que chaque enregistrement de shades.cfg est LU exactement comme il
est ÉCRIT, et que sa taille déclarée correspond à ce que le code produit réellement.

Pourquoi ce script existe
-------------------------
Les enregistrements de ConfigFile sont des champs à LARGEUR FIXE séparés par un délimiteur.
Écriture et lecture sont deux listes d'appels tenues à la main dans deux fonctions distinctes,
plusieurs centaines de lignes l'une de l'autre, et un troisième endroit -- une macro *_REC_SIZE --
prétend en donner la taille. Trois moitiés d'un même contrat, aucune ne vérifiant les autres.

Ce motif a déjà détruit la configuration de tous les utilisateurs de ce projet : un champ ajouté
côté écriture sans son pendant côté lecture décale TOUT ce qui suit, et l'équipement redémarre sur
une configuration illisible. C'est aussi le motif exact qu'attrape check_partition_layout.py --
ce qui est tenu à la main dans deux fichiers doit être vérifié par la machine.

Ce que le script contrôle, pour chaque enregistrement
-----------------------------------------------------
1. La SÉQUENCE des champs écrits est identique à celle des champs lus, type par type et taille par
   taille, pour un fichier écrit à la version courante du firmware.
2. La somme de ces champs égale la macro *_REC_SIZE correspondante.

Le contrôle n°1 est le plus important. Une macro fausse est rattrapée à l'exécution par le
drainage sur CFG_REC_END en fin de readXxxRecord ; un décalage de séquence ne l'est jamais.

Le coût de chaque primitive vient de ConfigFile.cpp lui-même : writeString(val, len) écrit len-1
caractères de remplissage puis un séparateur, soit len octets. Les entiers passent par un tampon
de largeur fixe (writeUInt8 -> 4, writeUInt16 -> 6, writeUInt32 -> 11, writeBool -> 6...), les
flottants par 8 + précision.

Que faire quand il échoue
-------------------------
- séquences divergentes -> un champ a été ajouté, retiré ou déplacé d'un seul côté. Remettre les
  deux fonctions en phase, dans le MÊME ordre.
- taille divergente -> reporter la valeur calculée, affichée par le script, dans la macro.

Ce que le script NE contrôLE PAS : que les champs lus atterrissent dans les bons membres. Deux
uint8_t consécutifs échangés passent ce test et restent une régression -- seule la relecture d'une
configuration réelle après redémarrage le démontre.
"""

import os
import re
import sys

SOURCE = os.path.join("src", "ConfigFile.cpp")
HEADERS = [os.path.join("src", "somfy", "Somfy.h"), os.path.join("src", "Schedule.h")]

# Largeur écrite par chaque primitive, séparateur compris (cf. ConfigFile::writeXxx).
FIXED = {"UInt8": 4, "Int8": 4, "Int16": 7, "UInt16": 6, "UInt32": 11, "Bool": 6}

# Enregistrements contrôlés : macro de taille et les deux fonctions qui doivent rester en phase.
# Les boucles `for` sont reconnues et dépliées automatiquement, leur borne étant résolue depuis les
# #define des en-têtes -- un repérage par fragment de texte échouait dès que les deux côtés ne
# nommaient pas la même variable.
RECORDS = [
    ("SHADE_REC_SIZE", "writeShadeRecord", "readShadeRecord"),
    ("ROOM_REC_SIZE", "writeRoomRecord", "readRoomRecord"),
    ("GROUP_REC_SIZE", "writeGroupRecord", "readGroupRecord"),
]


def _constants(project_dir):
    """Valeur des #define entiers des en-têtes, pour résoudre les bornes de boucle."""
    out = {}
    for rel in HEADERS:
        path = os.path.join(project_dir, rel)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            for name, val in re.findall(r"#define\s+(\w+)\s+(\d+)\b", fh.read()):
                out.setdefault(name, int(val))
    return out


def _string_widths(project_dir):
    """Largeur des tableaux de char, pour résoudre sizeof(x->name)."""
    widths = {}
    for rel in HEADERS:
        path = os.path.join(project_dir, rel)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            for name, size in re.findall(r"char\s+(\w+)\s*\[\s*(\d+)\s*\]", fh.read()):
                widths.setdefault(name, int(size))
    return widths


def _cost(kind, line, widths):
    if kind == "String":
        m = re.search(r"sizeof\(\s*\w+->(\w+)\s*\)", line)
        if m and m.group(1) in widths:
            return widths[m.group(1)]
        m = re.search(r",\s*(\d+)\s*[,)]", line)
        if m:
            return int(m.group(1))
        raise ValueError("largeur de chaîne non résolue : %s" % line.strip())
    if kind == "Float":
        m = re.search(r",\s*(\d+)\s*[,)]", line)
        return 8 + (int(m.group(1)) if m else 5)
    if kind not in FIXED:
        raise ValueError("primitive inconnue : %s" % kind)
    return FIXED[kind]


def _body(source, fn):
    m = re.search(r"bool ShadeConfigFile::%s\([^)]*\) \{(.*?)\n\}" % fn, source, re.S)
    if not m:
        raise ValueError("fonction introuvable : %s" % fn)
    return m.group(1)


def _fields(body, verb, version, consts, widths):
    """Séquence (type, taille) des champs, dans l'ordre où ils atterrissent dans le fichier."""
    out = []
    skip_block = 0        # profondeur d'accolades d'une branche de version écartée
    skip_next = False     # garde de version sans accolade : la ligne suivante lui appartient
    dead_block = 0        # branche "enregistrement vidé", côté écriture
    loop = None           # (facteur, profondeur d'ouverture) de la boucle en cours
    depth = 0

    for line in body.split("\n"):
        st = line.strip()
        opens, closes = st.count("{"), st.count("}")

        # Branche "enregistrement vidé" : mêmes champs, mêmes tailles, ne pas compter deux fois.
        if verb == "write" and dead_block == 0 and st.startswith("else {"):
            dead_block = 1
            depth += opens - closes
            continue
        if dead_block:
            dead_block += opens - closes
            depth += opens - closes
            if dead_block <= 0:
                dead_block = 0
            continue

        # Branche de version écartée.
        if skip_block:
            skip_block += opens - closes
            depth += opens - closes
            if skip_block <= 0:
                skip_block = 0
            continue
        if skip_next:
            skip_next = False
            depth += opens - closes
            continue

        if verb == "read":
            m = re.search(r"this->header\.version\s*(<=|>=|==|!=|<|>)\s*(\d+)", st)
            if m and st.startswith("if("):
                op, ref = m.group(1), int(m.group(2))
                keep = {"<": version < ref, "<=": version <= ref,
                        ">=": version >= ref, ">": version > ref,
                        "==": version == ref, "!=": version != ref}[op]
                if not keep:
                    if st.endswith("{"):
                        skip_block = 1
                        depth += opens - closes
                    elif re.search(r"\)\s*\S", st):
                        pass          # instruction sur la même ligne : rien de plus à écarter
                    else:
                        skip_next = True
                    continue

        # Boucle : tout ce qu'elle contient est écrit autant de fois qu'elle tourne.
        m = re.match(r"for\s*\([^;]*;[^<]*<\s*(\w+)\s*;", st)
        if m and loop is None:
            bound = m.group(1)
            if bound.isdigit():
                loop = (int(bound), depth)
            elif bound in consts:
                loop = (consts[bound], depth)
            else:
                raise ValueError("borne de boucle non résolue : %s" % bound)

        repeat = loop[0] if loop else 1
        for mm in re.finditer(r"this->%s(\w+)\(" % verb, st):
            kind = mm.group(1)
            if kind not in FIXED and kind not in ("Float", "String"):
                continue
            for _ in range(repeat):
                out.append((kind, _cost(kind, st, widths)))

        depth += opens - closes
        if loop and depth <= loop[1]:
            loop = None
    return out


def check(project_dir):
    path = os.path.join(project_dir, SOURCE)
    with open(path, encoding="utf-8") as fh:
        source = fh.read()

    version = int(re.search(r"#define SHADE_HDR_VER\s+(\d+)", source).group(1))
    widths = _string_widths(project_dir)
    consts = _constants(project_dir)
    errors, summary = [], []

    for macro, wfn, rfn in RECORDS:
        m = re.search(r"#define %s\s+(\d+)" % macro, source)
        if not m:
            errors.append("%s : macro introuvable dans %s" % (macro, SOURCE))
            continue
        declared = int(m.group(1))
        try:
            written = _fields(_body(source, wfn), "write", version, consts, widths)
            read = _fields(_body(source, rfn), "read", version, consts, widths)
        except ValueError as exc:
            errors.append("%s : %s" % (macro, exc))
            continue

        total = sum(n for _, n in written)
        if written != read:
            idx = next(i for i in range(max(len(written), len(read)))
                       if (written[i] if i < len(written) else None)
                       != (read[i] if i < len(read) else None))
            fmt = lambda seq, i: "%s(%d)" % seq[i] if i < len(seq) else "— absent —"
            errors.append(
                "%s : %s et %s divergent au champ n°%d\n"
                "      écrit : %s\n"
                "      lu    : %s\n"
                "      (%d champs écrits, %d lus)"
                % (macro, wfn, rfn, idx, fmt(written, idx), fmt(read, idx),
                   len(written), len(read)))
        elif total != declared:
            errors.append(
                "%s : la macro annonce %d octets, le code en écrit %d\n"
                "      -> corriger la macro en %d dans %s"
                % (macro, declared, total, total, SOURCE))
        else:
            summary.append("%s=%d (%d champs)" % (macro, total, len(written)))

    if errors:
        sys.stderr.write(
            "\n==============================================================================\n"
            "[config] BUILD INTERROMPU -- %d anomalie(s) dans la disposition de shades.cfg\n\n"
            % len(errors))
        for err in errors:
            sys.stderr.write("  - %s\n" % err)
        sys.stderr.write(
            "\n  Un champ ajouté d'un seul côté décale tout ce qui suit : l'équipement\n"
            "  redémarre sur une configuration illisible. Motifs détaillés en tête de\n"
            "  tools/check_config_layout.py.\n"
            "==============================================================================\n\n")
        sys.exit(1)

    print("[config] shades.cfg v%d conforme : %s" % (version, ", ".join(summary)))


# --- Point d'entrée PlatformIO (pre:) ---------------------------------------------------------
# Exécuté hors SCons quand on lance le script à la main, pour pouvoir vérifier sans build.
try:
    from SCons.Script import Import  # noqa: F401

    Import("env")
    check(env.subst("$PROJECT_DIR"))  # noqa: F821
except ImportError:
    if __name__ == "__main__":
        check(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
