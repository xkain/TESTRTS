# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""
Garde-fou de build : le Mode installation (install/) relit en NVS ce que le firmware principal (src/)
y a écrit, et refait le même jeton d'accès. Rien ne relie ces deux programmes à la compilation : une
clé renommée, un type changé ou une énumération décalée d'un seul côté donnerait un Mode installation
qui ne rejoint plus le réseau ou refuse le bon PIN, découvert le jour où quelqu'un en a besoin.

Vérifie, par lecture des sources :
  1. chaque clé NVS lue par install/ est écrite par src/, avec un type compatible ;
  2. les valeurs des types de connexion et de sécurité sont les mêmes des deux côtés ;
  3. les formats du jeton (PIN:IP, utilisateur:mot de passe:IP) sont identiques.
La table et le marqueur d'image n'ont pas besoin d'y figurer : install/ lit directement
../partitions_common_4mb.csv et src/ConfigSettings.h (cf. install/main_contract.py).
"""
import glob
import os
import re
import sys

# Lues par install/ mais plus écrites par src/ : chaque entrée dit pourquoi elle reste légitime.
READ_ONLY_LEGACY = {
    ("CFG", "language"): "ancien index de langue, encore lu par src/ pour la migration vers langCode",
}
PUT_FOR = {"getString": "putString", "getChar": "putChar", "getUChar": "putUChar",
           "getBool": "putBool", "getInt": "putInt", "readIp": "putString"}


def repo_root(project_dir):
    for d in (project_dir, os.path.dirname(project_dir)):
        if os.path.isfile(os.path.join(d, "src", "ConfigSettings.h")):
            return d
    return None


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def install_reads(text):
    """(espace, clé, accesseur) dans l'ordre du source : chaque p.begin("X") ouvre un espace."""
    out, ns = [], None
    for m in re.finditer(r'p\.begin\("([A-Za-z_]+)"|p\.(get[A-Za-z]+)\("([A-Za-z0-9_]+)"|readIp\(p, "([A-Za-z0-9_]+)"', text):
        if m.group(1):
            ns = m.group(1)
        elif m.group(2):
            out.append((ns, m.group(3), m.group(2)))
        else:
            out.append((ns, m.group(4), "readIp"))
    return out


def enum_values(text, pattern):
    m = re.search(pattern, text, re.S)
    return [int(v, 0) for v in re.findall(r"=\s*(0x[0-9A-Fa-f]+|\d+)", m.group(1))] if m else None


def token_formats(text):
    return set(re.findall(r'"((?:%s:)*%u\.%u\.%u\.%u)"', text))


def check(root):
    errors = []
    inst = read(os.path.join(root, "install", "src", "main.cpp"))
    main = "\n".join(read(p) for p in glob.glob(os.path.join(root, "src", "**", "*.*"), recursive=True)
                     if p.endswith((".cpp", ".h")))

    for ns, key, getter in install_reads(inst):
        if (ns, key) in READ_ONLY_LEGACY:
            continue
        if not re.search(r'begin\("%s"' % re.escape(ns), main):
            errors.append('espace NVS "%s" lu par install/ mais jamais ouvert par src/' % ns)
            continue
        put = PUT_FOR.get(getter)
        if put is None:
            errors.append('accesseur %s("%s") inconnu du garde-fou : l\'ajouter à PUT_FOR' % (getter, key))
        elif not re.search(r'%s\("%s"' % (put, re.escape(key)), main):
            errors.append('%s/%s : install/ le lit par %s, src/ ne l\'écrit jamais par %s' % (ns, key, getter, put))

    header = read(os.path.join(root, "src", "ConfigSettings.h"))
    pairs = [
        ("type de connexion", r"enum class conn_types_t[^{]*\{(.*?)\}", r"enum : uint8_t \{ (CONN_UNSET.*?)\}"),
        ("type de sécurité", r"enum class security_types[^{]*\{(.*?)\}", r"enum : uint8_t \{ (SEC_NONE.*?)\}"),
    ]
    for label, main_pat, inst_pat in pairs:
        a, b = enum_values(header, main_pat), enum_values(inst, inst_pat)
        if a is None or b is None:
            errors.append("%s : énumération introuvable (src/ConfigSettings.h ou install/)" % label)
        elif a != b:
            errors.append("%s : src/ vaut %s, install/ vaut %s" % (label, a, b))

    web = read(os.path.join(root, "src", "web", "Web.cpp"))
    for fmt in ("%s:%u.%u.%u.%u", "%s:%s:%u.%u.%u.%u"):
        if fmt in token_formats(web) and fmt not in token_formats(inst):
            errors.append('jeton : le format "%s" de Web.cpp manque à install/' % fmt)
        if fmt not in token_formats(web):
            errors.append('jeton : le format "%s" n\'est plus dans Web.cpp, revoir install/ tokenFor()' % fmt)
    return errors


def report(errors):
    if not errors:
        print("[install] contrat avec le firmware principal conforme")
        return
    print("\n" + "=" * 78)
    print("[install] BUILD INTERROMPU -- %d écart(s) avec le Mode installation" % len(errors))
    for e in errors:
        print("  - " + e)
    print("Le Mode installation (install/src/main.cpp) doit suivre : il ne rejoindrait plus le réseau\n"
          "ou refuserait le bon accès.")
    print("=" * 78 + "\n")
    sys.exit(1)


try:
    from SCons.Script import Import  # noqa: F401
    Import("env")
    report(check(repo_root(env.subst("$PROJECT_DIR"))))  # noqa: F821
except ImportError:
    if __name__ == "__main__":
        report(check(repo_root(os.getcwd()) or os.getcwd()))
