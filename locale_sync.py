#!/usr/bin/env python3
"""
Fiabilise la comparaison ET la réécriture de locales/{en,de,es}.json par rapport à locales/fr.json
(seule source de vérité éditée manuellement par le user -- cf. mémoire projet "Stratégie de synchro
des locales" : Claude ne doit jamais éditer fr.json lui-même, ni synchroniser les autres langues
sans demande explicite).

fr.json est structuré en blocs logiques débutant par des clés séparatrices "INDEX_..." (page, puis
immédiatement ses modaux/overlays), les clés à l'intérieur d'un bloc suivant l'ordre d'apparition
dans l'IHM -- règle imposée par le user, ce script DOIT la respecter à 100% lors de toute réécriture
(cf. cmd_apply). Piège à connaître : "INDEX_MENU" apparaît deux fois dans fr.json (séparateurs "TAB"
et "SUBTAB" distincts) -- json.load() perdrait silencieusement la première occurrence (les clés
dupliquées d'un objet JSON s'écrasent), d'où un parseur texte-brut dédié (parse_locale_file),
utilisé UNIQUEMENT par apply -- la seule commande qui a besoin de préserver l'ordre/les doublons
pour reconstruire la structure. status et renames restent sur json.load(), ce qui reste sûr : ils ne
comparent que des ENSEMBLES de clés (appartenance), jamais leur ordre ni leur nombre d'occurrences.

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
                         À lancer AVANT apply si fr.json a été réorganisé : sans ça, une clé
                         renommée apparaît à tort comme "nouvelle" (traduction perdue) + "orpheline"
                         (ancienne traduction reléguée en fin de fichier) plutôt que déplacée avec sa
                         traduction existante conservée.
  apply [--write] [--langs en de es]
                         Réécrit en/de/es pour suivre à 100% l'ordre des clés et le nombre exact de
                         lignes vides de fr.json (une clé par ligne ; séparateurs "INDEX_..." sans
                         indentation, clés du bloc indentées de 4 espaces, comme fr.json). Pour
                         chaque clé de fr.json : réutilise la traduction déjà présente dans la cible
                         si elle existe (où qu'elle soit actuellement dans le fichier -- gère donc
                         nativement un simple déplacement de bloc), sinon insère le texte français
                         comme repère temporaire (jamais de traduction inventée). Les clés de la
                         cible absentes de fr.json (orphelines) sont conservées -- rien n'est jamais
                         supprimé silencieusement -- déplacées dans un bloc "INDEX_UNSORTED" en fin
                         de fichier, à trier manuellement. SANS --write : aperçu seul, aucun fichier
                         modifié (comportement par défaut, volontairement prudent).

Exemples :
  python locale_sync.py status
  python locale_sync.py renames
  python locale_sync.py renames --since HEAD~3
  python locale_sync.py apply                    # aperçu, ne touche à rien
  python locale_sync.py apply --write             # réécrit réellement en/de/es
  python locale_sync.py apply --write --langs de  # une seule langue à la fois
"""
import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOCALES_DIR = ROOT / "locales"
SOURCE_LANG = "fr"
TARGET_LANGS = ["en", "de", "es"]

# "KEY": "value"[,]  -- une entrée par ligne physique, comme le sont actuellement les 4 fichiers de
# langue du projet ; value est le contenu BRUT (échappements JSON non résolus) entre les guillemets
# fermants, capturé pour être redécodé via json.loads ci-dessous plutôt que par ce regex lui-même.
ENTRY_RE = re.compile(r'^\s*"((?:[^"\\]|\\.)+)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$')


def parse_locale_file(path):
    """Parse séquentiel en texte brut (PAS json.load, cf. piège INDEX_MENU documenté en tête de
    fichier) -- retourne la liste ORDONNÉE des entrées {key, value, blank_before}, blank_before
    étant le nombre de lignes vides consécutives immédiatement avant cette entrée dans le fichier
    source (préserve donc aussi les doublons ET le découpage en blocs par lignes vides)."""
    with open(path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()
    entries = []
    blank_run = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped in ("{", "}", ""):
            if stripped == "":
                blank_run += 1
            continue
        m = ENTRY_RE.match(line)
        if not m:
            raise ValueError(f"{path.name}:{i + 1} : ligne au format inattendu (ni {{, }}, vide, "
                              f"ni \"clé\": \"valeur\") : {line!r}")
        key = json.loads('"' + m.group(1) + '"')
        value = json.loads('"' + m.group(2) + '"')
        entries.append({"key": key, "value": value, "blank_before": blank_run})
        blank_run = 0
    return entries


def write_locale_file(path, entries):
    """Réécrit un fichier de langue à partir d'une liste d'entrées {key, value, blank_before}, dans
    le même style que fr.json : une entrée par ligne, séparateurs "INDEX_..." collés à la marge
    (aucune indentation) et clés du bloc indentées de 4 espaces -- c'est ce décalage qui rend les
    blocs lisibles à l'oeil, il DOIT être reproduit à l'identique dans en/de/es. Accents/caractères
    non-ASCII laissés littéraux (ensure_ascii=False), virgule sur toutes les entrées sauf la
    dernière, un seul saut de ligne final."""
    out = ["{"]
    n = len(entries)
    for idx, e in enumerate(entries):
        out.extend([""] * e["blank_before"])
        comma = "," if idx < n - 1 else ""
        key_json = json.dumps(e["key"], ensure_ascii=False)
        val_json = json.dumps(e["value"], ensure_ascii=False)
        indent = "" if e["key"].startswith("INDEX_") else "    "
        out.append(f'{indent}{key_json}: {val_json}{comma}')
    out.append("}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")


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


def cmd_apply(args):
    fr_path = LOCALES_DIR / f"{SOURCE_LANG}.json"
    fr_entries = parse_locale_file(fr_path)

    # "INDEX_..." peut légitimement se répéter (séparateur structurel, cf. INDEX_MENU) -- toute
    # AUTRE clé dupliquée dans fr.json est une vraie erreur (coquille de frappe la plus probable)
    # qui fausserait la correspondance clé -> traduction ci-dessous : on s'arrête plutôt que de
    # deviner laquelle des deux occurrences est la bonne.
    key_counts = Counter(e["key"] for e in fr_entries)
    bad_dups = {k: c for k, c in key_counts.items() if c > 1 and not k.startswith("INDEX_")}
    if bad_dups:
        print("ERREUR : clé(s) dupliquée(s) dans fr.json en dehors des séparateurs INDEX_ -- "
              "à corriger avant de continuer :", file=sys.stderr)
        for k, c in sorted(bad_dups.items()):
            print(f"  {k} ({c} occurrences)", file=sys.stderr)
        return 1

    targets = args.langs if args.langs else TARGET_LANGS
    any_written = False

    for lang in targets:
        path = LOCALES_DIR / f"{lang}.json"
        print(f"=== {lang}.json ===")
        if not path.exists():
            print("  FICHIER ABSENT, ignoré.\n")
            continue
        target_entries = parse_locale_file(path)

        # Table clé -> valeur de la cible, dans son ordre ACTUEL (nécessaire pour préserver l'ordre
        # relatif des orphelines plus bas -- elles n'ont par définition aucune position dans
        # fr.json). Les séparateurs INDEX_ n'y figurent jamais : leur valeur est un texte inerte,
        # jamais traduit (vérifié identique dans les 4 langues), toujours recopié depuis fr.json.
        target_map, target_order = {}, []
        for e in target_entries:
            if e["key"].startswith("INDEX_") or e["key"] in target_map:
                continue
            target_map[e["key"]] = e["value"]
            target_order.append(e["key"])

        used_keys, new_entries, untranslated = set(), [], []
        for e in fr_entries:
            key = e["key"]
            if key.startswith("INDEX_"):
                new_entries.append({"key": key, "value": e["value"], "blank_before": e["blank_before"]})
                continue
            if key in target_map:
                new_entries.append({"key": key, "value": target_map[key], "blank_before": e["blank_before"]})
                used_keys.add(key)
            else:
                # Pas encore de traduction connue : le texte français sert de repère temporaire --
                # jamais une traduction inventée en silence, listée ci-dessous pour suite à donner.
                new_entries.append({"key": key, "value": e["value"], "blank_before": e["blank_before"]})
                untranslated.append(key)

        orphans = [k for k in target_order if k not in used_keys]
        if orphans:
            new_entries.append({
                "key": "INDEX_UNSORTED",
                "value": "CLÉS ORPHELINES (absentes de fr.json -- à trier manuellement)",
                "blank_before": 1,
            })
            for k in orphans:
                new_entries.append({"key": k, "value": target_map[k], "blank_before": 0})

        print(f"  {len(fr_entries)} entrées alignées sur la structure de fr.json.")
        if untranslated:
            print(f"  {len(untranslated)} clé(s) sans traduction (texte français inséré en attente) :")
            for k in untranslated:
                print(f"    ? {k}")
        if orphans:
            print(f"  {len(orphans)} clé(s) orpheline(s) déplacée(s) dans le bloc INDEX_UNSORTED en fin de fichier :")
            for k in orphans:
                print(f"    ! {k}")
        if not untranslated and not orphans:
            print("  Rien à signaler, réalignement structurel pur.")

        if args.write:
            write_locale_file(path, new_entries)
            any_written = True
            print(f"  -> {path.name} réécrit.")
        else:
            print("  (aperçu seul -- relancer avec --write pour réécrire réellement ce fichier)")
        print()

    if not args.write and targets:
        print("Aucun fichier modifié (mode aperçu). Ajoutez --write pour appliquer.")
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

    p_apply = sub.add_parser("apply", help="Réaligne en/de/es à 100% sur l'ordre/la structure de fr.json.")
    p_apply.add_argument("--write", action="store_true",
                          help="Réécrit réellement les fichiers (par défaut : aperçu seul, rien n'est modifié).")
    p_apply.add_argument("--langs", nargs="+", choices=TARGET_LANGS, default=None,
                          help="Limite l'opération à ces langues (def: en de es).")
    p_apply.set_defaults(func=cmd_apply)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
