#!/usr/bin/env python3
"""
Fiabilise la comparaison de locales/{en,de,es}.json par rapport à locales/fr.json (seule source de
vérité éditée manuellement par le user -- cf. mémoire projet "Stratégie de synchro des locales" :
Claude ne doit jamais éditer fr.json lui-même, ni synchroniser les autres langues sans demande
explicite). Outil de LECTURE SEULE : ne réécrit jamais aucun fichier, juste un diagnostic fiable
sur un fichier de ~1000+ clés, facilement source d'erreur à l'oeil nu -- l'édition réelle des
traductions reste faite à la main (par Claude ou le user), en respectant le formatage existant de
chaque fichier (sections "PAGE..." en guise de commentaires, regroupements par lignes vides) que ce
script ne cherche volontairement pas à reproduire.

Commandes :
  status                Compare l'état ACTUEL de fr.json aux 3 autres langues : clés manquantes
                         (à traduire, avec leur texte français), clés orphelines (absentes de
                         fr.json, à supprimer ou à vérifier).
  renames [--since REF]  Diffe fr.json entre REF (def: HEAD, donc les modifs NON commitées) et le
                         fichier actuel pour repérer les renommages probables : une clé supprimée
                         et une clé ajoutée qui partagent EXACTEMENT la même valeur française sont
                         très probablement un renommage (pas une suppression + un ajout réels) --
                         la traduction existante doit alors être conservée sous le nouveau nom
                         plutôt que refaite. Liste aussi les clés réellement ajoutées/supprimées
                         (non appariées) et celles dont le texte français a changé sans renommage.

Exemples :
  python locale_sync.py status
  python locale_sync.py renames
  python locale_sync.py renames --since HEAD~3
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOCALES_DIR = ROOT / "locales"
SOURCE_LANG = "fr"
TARGET_LANGS = ["en", "de", "es"]


def load_json_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)  # dict Python 3.7+ préserve l'ordre d'insertion == ordre du fichier


def load_json_at_ref(ref, relpath):
    """Lit un fichier JSON tel qu'il existait à un commit donné (git show), sans toucher au
    fichier réel sur disque ni à l'index git."""
    out = subprocess.run(
        ["git", "show", f"{ref}:{relpath}"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def cmd_status(args):
    fr_path = LOCALES_DIR / f"{SOURCE_LANG}.json"
    fr = load_json_file(fr_path)
    fr_keys = list(fr.keys())
    fr_keys_set = set(fr_keys)

    any_issue = False
    for lang in TARGET_LANGS:
        path = LOCALES_DIR / f"{lang}.json"
        print(f"=== {lang}.json ===")
        if not path.exists():
            print("  FICHIER ABSENT")
            any_issue = True
            print()
            continue
        target = load_json_file(path)
        target_keys_set = set(target.keys())

        missing = [k for k in fr_keys if k not in target_keys_set]
        orphans = [k for k in target.keys() if k not in fr_keys_set]

        if not missing and not orphans:
            print("  OK -- rien à faire.")
        if missing:
            any_issue = True
            print(f"  {len(missing)} clé(s) manquante(s) (à traduire depuis le français) :")
            for k in missing:
                print(f"    + {k} = {json.dumps(fr[k], ensure_ascii=False)}")
        if orphans:
            any_issue = True
            print(f"  {len(orphans)} clé(s) orpheline(s) (absente(s) de fr.json, à supprimer ou à vérifier) :")
            for k in orphans:
                print(f"    - {k} = {json.dumps(target[k], ensure_ascii=False)}")
        print()

    if not any_issue:
        print("Tout est synchronisé.")
    return 0


def cmd_renames(args):
    relpath = f"locales/{SOURCE_LANG}.json"
    fr_path = LOCALES_DIR / f"{SOURCE_LANG}.json"
    try:
        old_fr = load_json_at_ref(args.since, relpath)
    except subprocess.CalledProcessError:
        print(f"Impossible de lire {relpath} à la référence '{args.since}' "
              f"(ref invalide, ou fichier absent à ce commit ?).", file=sys.stderr)
        return 1
    new_fr = load_json_file(fr_path)

    old_keys = set(old_fr.keys())
    new_keys = set(new_fr.keys())

    added = new_keys - old_keys
    removed = old_keys - new_keys
    common = old_keys & new_keys
    modified = [k for k in common if old_fr[k] != new_fr[k]]

    # Un couple (clé supprimée, clé ajoutée) qui partage EXACTEMENT la même valeur française est
    # un renommage très probable -- une vraie suppression + un vrai ajout indépendants auraient
    # chacun leur propre texte, une coïncidence de valeur identique serait improbable sur un texte
    # UI réel (d'où le filtre de longueur ci-dessous, qui écarte les valeurs trop génériques comme
    # "" ou "OK"). N'accepte que les couples SANS ambiguïté (une seule clé ajoutée <-> une seule
    # clé supprimée pour cette valeur) : le reste est laissé en ajout/suppression "réel" plutôt que
    # deviné à tort.
    removed_by_value = {}
    for k in removed:
        removed_by_value.setdefault(old_fr[k], []).append(k)

    renames = []
    remaining_added = set(added)
    remaining_removed = set(removed)
    for k in sorted(added):
        val = new_fr[k]
        if not isinstance(val, str) or len(val.strip()) < 3:
            continue
        candidates = [c for c in removed_by_value.get(val, []) if c in remaining_removed]
        if len(candidates) == 1:
            old_key = candidates[0]
            renames.append((old_key, k, val))
            remaining_added.discard(k)
            remaining_removed.discard(old_key)

    print(f"Comparaison fr.json : {args.since} -> disque\n")

    if renames:
        print(f"{len(renames)} renommage(s) probable(s) (même texte français, clé différente) :")
        for old_key, new_key, val in renames:
            print(f"  {old_key}  ->  {new_key}   (= {json.dumps(val, ensure_ascii=False)})")
        print("  Pour chacun : renommer la clé dans en/de/es en conservant la traduction existante.\n")
    else:
        print("Aucun renommage probable détecté.\n")

    genuinely_added = sorted(remaining_added)
    if genuinely_added:
        print(f"{len(genuinely_added)} clé(s) réellement nouvelle(s) (à traduire) :")
        for k in genuinely_added:
            print(f"  + {k} = {json.dumps(new_fr[k], ensure_ascii=False)}")
        print()

    genuinely_removed = sorted(remaining_removed)
    if genuinely_removed:
        print(f"{len(genuinely_removed)} clé(s) réellement supprimée(s) (à retirer de en/de/es) :")
        for k in genuinely_removed:
            print(f"  - {k}")
        print()

    if modified:
        print(f"{len(modified)} clé(s) au texte français modifié (même nom de clé -- traduction "
              f"existante potentiellement obsolète, à relire) :")
        for k in sorted(modified):
            print(f"  ~ {k}")
            print(f"      avant : {json.dumps(old_fr[k], ensure_ascii=False)}")
            print(f"      après : {json.dumps(new_fr[k], ensure_ascii=False)}")
        print()

    if not renames and not genuinely_added and not genuinely_removed and not modified:
        print("fr.json est identique à cette référence -- rien à faire.")

    return 0


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_status = sub.add_parser("status", help="Compare l'état actuel de fr.json aux 3 autres langues.")
    p_status.set_defaults(func=cmd_status)

    p_renames = sub.add_parser("renames", help="Détecte les renommages probables depuis REF.")
    p_renames.add_argument("--since", default="HEAD",
                            help="Référence git à comparer (def: HEAD, donc les modifs non commitées).")
    p_renames.set_defaults(func=cmd_renames)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
