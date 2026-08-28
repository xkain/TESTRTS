#!/usr/bin/env python3
"""
Garde-fou de build : empêche la réintroduction des défauts d'internationalisation corrigés lors
de l'audit i18n (août 2026).

Ce que ce script vérifie a été établi à partir de bugs RÉELS, pas de précautions théoriques.
Chaque contrôle correspond à quelque chose qui s'est effectivement affiché à l'écran :

  - clé appelée mais absente des locales     -> ERROR_SERVICE_TITLE, GEO_EXTERNAL, ADRESS
  - littéral passé à tr() qui n'est pas une clé -> tr("Ouvrir"), tr("Position MY"), tr("Menu")
  - texte visible écrit en dur dans un gabarit  -> "Mode Expert", "RSSI:", "POS:", "USB REQUIS"
  - locales désynchronisées                  -> de.json réécrit depuis un éditeur, clé retirée de fr seul
  - jetons de substitution divergents        -> {LANG}, {MAX}, %1 absents d'une traduction
  - repli mort après tr()                    -> tr(x) || x, impossible à atteindre
  - clé au format non conforme               -> "PAGE MODAL LED", espaces au lieu de _

Pourquoi au build plutôt qu'en revue
------------------------------------
Tous ces contrôles ont d'abord été faits à la main. Tant qu'ils vivent dans une conversation
plutôt que dans le build, ils se reperdent. Même raisonnement que check_partition_layout.py : ce
qui est tenu à la main dans deux fichiers doit être vérifié par la machine.

Deux modes
----------
  (build)                contrôles bloquants uniquement, silencieux quand tout va bien
  python3 check_i18n.py --full   ajoute l'audit des clés jamais utilisées

L'audit des clés mortes n'est PAS bloquant et ne tourne pas pendant un build : le détecter suppose
de modéliser la construction dynamique des clés (BOARD_DEFAULT_${cm}, assistants d'appairage,
wizardStepper), modèle approximatif qui a déjà produit de faux positifs. Un build légitime ne doit
pas échouer sur une heuristique.
"""

import glob
import json
import os
import re
import sys
from collections import Counter

LANGS = ("fr", "en", "de", "es")
REF = "fr"

# Chaînes visibles qu'il est légitime de ne PAS traduire : noms propres, marques, unités
# universelles, valeurs d'exemple. Toute addition ici doit être un vrai nom propre -- c'est la
# soupape du contrôle "texte en dur", pas un endroit où ranger ce qu'on n'a pas envie de traduire.
ALLOWED_LITERALS = {
    "hacs", "home assistant", "open hacs repository on", "github",
    "wt32-eth01", "esp32-d1 mini", "espsomfy rts", "somfy",
    "my", "unknown", "rssi", "mqtt", "wi-fi", "ethernet", "poe", "gpio",
}

# Préfixes de clés assemblées à l'exécution. Sert UNIQUEMENT à l'audit --full, jamais au build.
DYNAMIC_PREFIXES = (
    "BOARD_DEFAULT_", "CAL_BLIND_OPT_", "ROOM_PRESET_", "GENERAL_OPT_",
    "GIT_RELEASE_TITLE_STEP", "WIZ_", "PAIR_", "UNPAIR_", "LINK_GROUP_", "UNLINK_GROUP_",
)

JS_GLOB = os.path.join("data-dev", "js", "*.js")
HTML = os.path.join("data-dev", "index.html")
LOCALE = os.path.join("locales", "%s.json")

TOKEN = re.compile(r"\{[A-Za-z_]+\}|%[0-9]|%[a-z]+%")
# tr('CLE') / trOr('CLE', ...) : le littéral doit être SEUL -- une concaténation
# (tr('PREFIXE_' + x)) est une construction dynamique, pas une clé, et n'est pas capturée ici
# grâce au [,)] final. Le contenu est délibérément permissif (espaces et accents compris) :
# c'est précisément ce qui permet d'attraper tr("Position MY") ou tr("Fermer"), des phrases
# françaises passées à tr() comme s'il s'agissait de clés.
TR_LITERAL = re.compile(r"""\b(?:tr|trOr)\s*\(\s*(['"])([^'"\n]+)\1\s*[,)]""")
TR_ATTR = re.compile(r"""(?<![-\w])tr="([^"]+)\"""")
# tr(...) suivi de || : impossible à atteindre, tr() ne renvoyant jamais de valeur fausse.
DEAD_FALLBACK = re.compile(r"\b(?:tr)\s*\([^()]*\)\s*\|\|")
NOISE = re.compile(r"[=<>&|\\/\n]|\breturn\b|indexOf|\.length\b|Etc/GMT|\|")


def read_locales(root):
    out, errs = {}, []
    for lg in LANGS:
        path = os.path.join(root, LOCALE % lg)
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = f.read()
            out[lg] = (json.loads(raw), raw)
        except (OSError, json.JSONDecodeError) as e:
            errs.append("locales/%s.json illisible ou invalide : %s" % (lg, e))
    return out, errs


def keys_in_order(raw):
    return [m.group(1) for m in re.finditer(r'^\s*"((?:[^"\\]|\\.)*)"\s*:', raw, re.M)]


def source_files(root):
    return sorted(glob.glob(os.path.join(root, JS_GLOB))) + [os.path.join(root, HTML)]


def rel(root, path):
    return os.path.relpath(path, root)


def line_of(src, pos):
    return src.count("\n", 0, pos) + 1


def in_comment(src, pos):
    start = src.rfind("\n", 0, pos) + 1
    return src[start:pos].lstrip().startswith("//")


def check(root, full=False):
    errors, warnings = [], []
    loc, errs = read_locales(root)
    errors += errs
    if errs:
        return errors, warnings

    ref_keys = set(loc[REF][0])
    ref_order = keys_in_order(loc[REF][1])

    # --- 1. intégrité des quatre fichiers ------------------------------------------------------
    for lg in LANGS:
        data, raw = loc[lg]
        order = keys_in_order(raw)
        dups = [k for k, c in Counter(order).items() if c > 1]
        if dups:
            errors.append("locales/%s.json : clé(s) en double -> %s" % (lg, ", ".join(sorted(dups))))
        empties = [k for k, v in data.items() if not v.strip()]
        if empties:
            errors.append("locales/%s.json : valeur(s) vide(s) -> %s" % (lg, ", ".join(sorted(empties))))
        bad = [k for k in order if " " in k]
        if bad:
            errors.append("locales/%s.json : clé(s) au format non conforme (espace) -> %s"
                          % (lg, ", ".join(sorted(bad))))
        if lg == REF:
            continue
        missing = sorted(ref_keys - set(data))
        extra = sorted(set(data) - ref_keys)
        if missing or extra:
            errors.append(
                "locales/%s.json désynchronisé de %s.json :\n"
                "      %d manquante(s) : %s\n"
                "      %d en trop      : %s\n"
                "      -> python3 locale_sync.py status, puis apply --write"
                % (lg, REF, len(missing), ", ".join(missing[:6]) or "-",
                   len(extra), ", ".join(extra[:6]) or "-"))
        elif order != ref_order:
            first = next((a for a, b in zip(ref_order, order) if a != b), "?")
            errors.append("locales/%s.json : ordre des clés différent de %s.json (1re divergence : %s)\n"
                          "      -> python3 locale_sync.py apply --write" % (lg, REF, first))

    # --- 2. jetons de substitution -------------------------------------------------------------
    for k, v in loc[REF][0].items():
        want = sorted(TOKEN.findall(v))
        for lg in LANGS[1:]:
            got = sorted(TOKEN.findall(loc[lg][0].get(k, "")))
            if got != want:
                errors.append("%s : jetons différents entre %s %s et %s %s"
                              % (k, REF, want or "[]", lg, got or "[]"))

    # --- 3. code : clés manquantes, littéraux non traduits, replis morts -----------------------
    for path in source_files(root):
        try:
            with open(path, "r", encoding="utf-8") as f:
                src = f.read()
        except OSError:
            continue
        name = rel(root, path)
        for rx in (TR_LITERAL, TR_ATTR):
            for m in rx.finditer(src):
                key = m.group(2) if rx is TR_LITERAL else m.group(1)
                if in_comment(src, m.start()):
                    continue
                if key in ref_keys:
                    continue
                errors.append("%s:%d : tr(%r) -- cette clé n'existe pas dans %s.json"
                              % (name, line_of(src, m.start()), key, REF))
        for m in DEAD_FALLBACK.finditer(src):
            if in_comment(src, m.start()):
                continue
            errors.append("%s:%d : repli mort après tr() -- tr() ne renvoie jamais de valeur fausse,\n"
                          "      le second membre du || ne peut pas s'évaluer. Utiliser trOr() si un\n"
                          "      repli est réellement nécessaire." % (name, line_of(src, m.start())))
        if path.endswith(".js"):
            errors += hardcoded_text(name, src, loc[REF][0])

    # --- 4. audit non bloquant ----------------------------------------------------------------
    if full:
        warnings += dead_keys(root, loc[REF][0])
    return errors, warnings


def hardcoded_text(name, src, ref):
    """Texte visible écrit en dur dans un gabarit JS, jamais passé à tr()."""
    by_value = {}
    for k, v in ref.items():
        if not k.startswith("INDEX_"):
            by_value.setdefault(v.strip().lower(), k)
    out = []
    seen = set()

    def flag(pos, text, what):
        t = text.strip()
        low = t.lower()
        if not t or low in ALLOWED_LITERALS or NOISE.search(t):
            return
        if not re.search(r"[A-Za-zÀ-ÿ]{3}", t) or re.fullmatch(r"[\d.\s%:+-]*", t):
            return
        ln = line_of(src, pos)
        if (ln, low) in seen:
            return
        seen.add((ln, low))
        hint = by_value.get(low)
        out.append("%s:%d : %s en dur %r%s" % (name, ln, what, t,
                   ("  -- la clé %s porte déjà ce texte" % hint) if hint else ""))

    for m in re.finditer(r"<(\w+)([^<>]*)>([^<>{}`$]{3,70})</\1>", src):
        if re.search(r"(?<![-\w])tr=", m.group(2)):
            continue
        flag(m.start(), m.group(3), "texte")
    for m in re.finditer(r'<(\w+)([^<>]*\btitle="([^"${]{3,70})"[^<>]*)>', src):
        if re.search(r"(?<![-\w])tr=", m.group(2)):
            continue
        flag(m.start(), m.group(3), "attribut title")
    for m in re.finditer(r"</svg>\s*([A-Za-zÀ-ÿ][^<>{}`$\n]{2,60}?)\s*(?=</|\n)", src):
        flag(m.start(), m.group(1), "libellé")
    return out


def dead_keys(root, ref):
    """Clés déclarées et jamais référencées. Indicatif : voir l'en-tête du fichier."""
    corpus = ""
    for pat in ("data-dev/**/*", "src/**/*", "*.py"):
        for f in glob.glob(os.path.join(root, pat), recursive=True):
            if os.path.isfile(f) and os.path.splitext(f)[1] in (".js", ".html", ".css", ".cpp", ".h", ".ino", ".py"):
                try:
                    with open(f, "r", encoding="utf-8", errors="ignore") as fh:
                        corpus += fh.read()
                except OSError:
                    pass
    dead = [k for k in ref
            if not k.startswith("INDEX_")
            and k not in corpus
            and not k.startswith(DYNAMIC_PREFIXES)]
    if not dead:
        return []
    return ["%d clé(s) jamais référencée(s) -- à confirmer une par une, certaines familles sont\n"
            "    assemblées à l'exécution :\n    %s" % (len(dead), ", ".join(sorted(dead)))]


def report(errors, warnings):
    for w in warnings:
        print("[i18n] AVERTISSEMENT : %s" % w)
    if not errors:
        if not warnings:
            print("[i18n] locales et code conformes")
        return 0
    print("\n" + "=" * 78)
    print("[i18n] BUILD INTERROMPU -- %d anomalie(s)" % len(errors))
    print("")
    for e in errors:
        print("  - %s" % e)
    print("")
    print("  Ces contrôles reprennent des défauts qui se sont réellement affichés à l'écran.")
    print("  Détail des motifs : en-tête de check_i18n.py.")
    print("=" * 78 + "\n")
    return 1


# --- Point d'entrée PlatformIO (pre:) ---------------------------------------------------------
try:
    from SCons.Script import Import  # noqa: F401

    Import("env")
    _root = env.subst("$PROJECT_DIR")  # noqa: F821
    _errors, _warnings = check(_root)
    if report(_errors, _warnings):
        sys.exit(1)
except ImportError:
    if __name__ == "__main__":
        root = os.path.dirname(os.path.abspath(__file__))
        errs, warns = check(root, full="--full" in sys.argv)
        sys.exit(report(errs, warns))
