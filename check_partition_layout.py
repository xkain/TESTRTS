#!/usr/bin/env python3
"""
Garde-fou de build : interdit de modifier une table de partition sans incrémenter
FW_PARTITION_LAYOUT (src/ConfigSettings.h).

Pourquoi ce script existe
-------------------------
FW_PARTITION_LAYOUT est recopié dans FW_IMAGE_MARKER, le marqueur que tout firmware embarque et
que /updateFirmware cherche dans les images reçues (cf. WebSystem::fwScanChunk). C'est lui qui
empêche d'installer par le formulaire d'envoi manuel un binaire bâti pour une AUTRE table -- une
v2.x.x renommée, par exemple, dont les offsets diffèrent et qui laisserait l'appareil
irrécupérable sans USB.

Le numéro et les .csv sont donc deux moitiés d'un même contrat, tenues à la main dans deux
fichiers distincts. Exactement le motif qui a déjà produit deux bugs dans ce projet : un message
annonçant "5 clients maximum" alors que la macro valait 10, et deux bornes de mot de passe qui
divergeaient d'un caractère. Un commentaire ne suffit pas -- on casse donc la compilation.

Comment mettre à jour après un changement de table
--------------------------------------------------
1. Modifier le ou les partitions_custom*.csv.
2. Incrémenter FW_PARTITION_LAYOUT dans src/ConfigSettings.h.
3. Lancer un build : il échoue en affichant l'empreinte attendue.
4. Reporter cette empreinte dans KNOWN_LAYOUTS ci-dessous, avec un commentaire décrivant la table.

Une table modifiée SANS changement de numéro échoue aussi -- c'est tout l'objet du garde-fou :
deux firmwares porteraient le même marqueur en attendant des offsets différents.
"""

import glob
import hashlib
import os
import re
import sys

# Empreinte de l'ENSEMBLE des tables, par génération. Une génération couvre toutes les variantes
# (4 Mo, 8 Mo...) : un binaire ne sait pas laquelle il rencontrera, le marqueur doit donc changer
# dès que l'une d'elles bouge.
KNOWN_LAYOUTS = {
    # 1 = table introduite en v3.0.0 : app0/app1 de 0x1B0000, spiffs 0x370000/0x80000.
    #     Rompt avec la v2.x.x (app0 0x180000, spiffs 0x310000/0x0E0000).
    1: "bdb0c709ec755889",
}

CSV_GLOB = "partitions_custom*.csv"
HEADER = os.path.join("src", "ConfigSettings.h")


def normalized_digest(project_dir):
    """Empreinte insensible aux commentaires, à l'indentation et à la casse des offsets.

    Renommer 0xE000 en 0xe000 ou réaligner une colonne ne doit pas déclencher d'alerte : seul un
    changement réel de nom, type, offset ou taille compte.
    """
    parts = []
    for path in sorted(glob.glob(os.path.join(project_dir, CSV_GLOB))):
        rows = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.split("#", 1)[0].strip()
                if not line:
                    continue
                rows.append(",".join(c.strip().lower() for c in line.split(",")))
        parts.append(os.path.basename(path) + "\n" + "\n".join(rows))
    if not parts:
        return None
    blob = "\n--\n".join(parts).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:16]


def declared_layout(project_dir):
    path = os.path.join(project_dir, HEADER)
    try:
        with open(path, "r", encoding="utf-8") as f:
            src = f.read()
    except OSError:
        return None
    m = re.search(r"^\s*#define\s+FW_PARTITION_LAYOUT\s+(\d+)", src, re.M)
    return int(m.group(1)) if m else None


def fail(msg):
    print("\n" + "=" * 78)
    print("[partitions] BUILD INTERROMPU")
    print(msg.rstrip())
    print("=" * 78 + "\n")
    sys.exit(1)


def check(project_dir):
    layout = declared_layout(project_dir)
    if layout is None:
        fail("  FW_PARTITION_LAYOUT est introuvable dans %s.\n"
             "  Ce numéro alimente FW_IMAGE_MARKER, qui protège /updateFirmware contre les images\n"
             "  bâties pour une autre table de partition." % HEADER)

    digest = normalized_digest(project_dir)
    if digest is None:
        fail("  Aucun fichier %s trouvé à la racine du projet." % CSV_GLOB)

    expected = KNOWN_LAYOUTS.get(layout)
    if expected is None:
        fail("  FW_PARTITION_LAYOUT vaut %d, mais cette génération n'est pas enregistrée.\n"
             "  Empreinte des tables actuelles : %s\n\n"
             "  Ajoutez cette ligne dans KNOWN_LAYOUTS (check_partition_layout.py) :\n"
             "      %d: \"%s\",\n" % (layout, digest, layout, digest))

    if digest != expected:
        fail("  Les tables de partition ont changé sans que FW_PARTITION_LAYOUT bouge.\n\n"
             "      génération déclarée : %d\n"
             "      empreinte attendue  : %s\n"
             "      empreinte actuelle  : %s\n\n"
             "  Deux firmwares porteraient le même marqueur en attendant des offsets différents,\n"
             "  et /updateFirmware laisserait passer une image incompatible.\n\n"
             "  Si le changement est INTENTIONNEL et incompatible :\n"
             "    1. incrémenter FW_PARTITION_LAYOUT dans %s\n"
             "    2. relancer le build, il affichera la nouvelle empreinte à enregistrer\n\n"
             "  S'il ne l'est pas, annulez la modification des .csv."
             % (layout, expected, digest, HEADER))

    print("[partitions] génération %d, tables conformes (%s)" % (layout, digest))


# --- Point d'entrée PlatformIO (pre:) ---------------------------------------------------------
# Exécuté hors SCons quand on lance le script à la main, pour pouvoir vérifier sans build.
try:
    from SCons.Script import Import  # noqa: F401

    Import("env")
    check(env.subst("$PROJECT_DIR"))  # noqa: F821
except ImportError:
    if __name__ == "__main__":
        check(os.path.dirname(os.path.abspath(__file__)))
