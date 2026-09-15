#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS

import os
import sys

SIZE_CODES = {0: "1MB", 1: "2MB", 2: "4MB", 3: "8MB", 4: "16MB", 5: "32MB"}
CODE_BY_NAME = {v: k for k, v in SIZE_CODES.items()}
POLICY_MAX_CODE = CODE_BY_NAME["4MB"]

IMAGE_MAGIC = 0xE9


def fail(msg):
    print("\n" + "=" * 78)
    print("[image] BUILD INTERROMPU")
    print(msg.rstrip())
    print("=" * 78 + "\n")
    sys.exit(1)


def read_size_code(path):
    with open(path, "rb") as f:
        head = f.read(4)
    if len(head) < 4 or head[0] != IMAGE_MAGIC:
        return None
    return (head[3] >> 4) & 0x0F


def check_file(path, declared_code, label):
    code = read_size_code(path)
    if code is None:
        fail("  %s n'est pas une image ESP valide (magic 0xE9 absent) :\n"
             "      %s" % (label, path))

    if code != declared_code:
        fail("  L'en-tête de %s ne correspond pas à la taille de flash déclarée.\n\n"
             "      fichier             : %s\n"
             "      déclaré (.ini)      : %s\n"
             "      écrit dans l'image  : %s\n\n"
             "  La plateforme n'a pas repris board_upload.flash_size. Vérifiez que le réglage\n"
             "  est bien board_upload.flash_size (et NON board_build.flash_size, que le builder\n"
             "  espressif32 ignore : il ne lit que board.get(\"upload.flash_size\"))."
             % (label, path, SIZE_CODES.get(declared_code, declared_code),
                SIZE_CODES.get(code, code)))


def check(env):
    declared = env.BoardConfig().get("upload.flash_size", "4MB")
    declared_code = CODE_BY_NAME.get(declared)

    if declared_code is None:
        fail("  board_upload.flash_size vaut \"%s\", valeur inconnue.\n"
             "  Valeurs acceptées : %s" % (declared, ", ".join(sorted(CODE_BY_NAME))))

    if declared_code > POLICY_MAX_CODE:
        fail("  board_upload.flash_size vaut %s pour l'environnement \"%s\".\n\n"
             "  Une image qui déclare PLUS que la flash réellement présente ne démarre pas :\n"
             "  le ROM bootloader s'arrête sur\n"
             "      \"Detected size(4096k) smaller than the size in the binary image\n"
             "       header(8192k). Probe failed.\"\n"
             "  puis boucle indéfiniment. L'inverse est sans danger : une image 4 Mo démarre\n"
             "  sur 4, 8, 16 et 32 Mo, la flash excédentaire reste simplement inutilisée.\n\n"
             "  Le projet publie donc un binaire unique par famille de puce, calé sur 4 Mo.\n"
             "  Si cette valeur vient d'un board PlatformIO plutôt que du .ini, c'est un\n"
             "  héritage à neutraliser : esp32-s3-devkitc-1 déclare 8 Mo par défaut.\n\n"
             "  Pour publier réellement deux tailles, il ne suffit PAS d'ajouter un\n"
             "  environnement : GitUpdater::assetName() (src/GitOTA.cpp) choisit l'asset sur le\n"
             "  seul modèle de puce et servirait l'image 8 Mo à une carte 4 Mo."
             % (declared, env.subst("$PIOENV")))

    build_dir = env.subst("$BUILD_DIR")
    targets = [
        (os.path.join(build_dir, "%s.bin" % env.subst("$PROGNAME")), "l'application"),
        (os.path.join(build_dir, "bootloader.bin"), "le bootloader"),
    ]

    checked = 0
    for path, label in targets:
        if not os.path.isfile(path):
            continue
        check_file(path, declared_code, label)
        checked += 1

    if checked == 0:
        fail("  Aucune image trouvée dans %s." % build_dir)

    print("[image] en-tête conforme : %s déclaré, %d image(s) vérifiée(s)"
          % (declared, checked))


try:
    from SCons.Script import Import  # noqa: F401

    Import("env")

    def _post_action(source, target, env):  # noqa: F811
        check(env)

    env.AddPostAction(  # noqa: F821
        "$BUILD_DIR/${PROGNAME}.bin", _post_action  # noqa: F821
    )
except ImportError:
    pass
