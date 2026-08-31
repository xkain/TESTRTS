#!/usr/bin/env python3
"""Cache-busting des pages statiques de docs/ (site GitHub Pages).

Réécrit le ?v=... de chaque lien css/js des fichiers docs/*.html avec une empreinte du CONTENU
de l'asset visé. Deux conséquences utiles :
  - la version ne change que si le fichier change réellement (un commit sans rapport ne casse
    pas le cache des visiteurs) ;
  - chaque asset a sa propre version, donc modifier le CSS n'invalide pas le cache du JS.

Contrairement à build_data_image.py, il n'y a pas de couple source/destination ici : les fichiers de
docs/ sont eux-mêmes le livrable publié, l'empreinte est donc écrite en place. Le script est
idempotent : relancé sans modification d'asset, il ne touche à aucun fichier.

Vérifie aussi que tous les dictionnaires de docs/lang/ exposent exactement le même jeu de clés --
une clé absente d'une langue se traduirait par un libellé manquant en production, sans erreur
visible au chargement.

Usage :
    python3 version_docs.py           # réécrit si nécessaire
    python3 version_docs.py --check   # ne modifie rien, sort en erreur si désynchronisé (CI)

Exécuté aussi automatiquement avant chaque build PlatformIO (cf. extra_scripts).
"""

import hashlib
import json
import os
import re
import sys

DOCS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")
LANG_DIR = os.path.join(DOCS_DIR, "lang")
HASH_LEN = 8

# href="..." ou src="..." pointant vers un .css/.js local, avec ou sans ?v= déjà présent.
# Les URLs absolues (http://, //cdn...) sont écartées : leur contenu ne nous appartient pas.
ASSET_RE = re.compile(
    r'(?P<attr>\b(?:href|src)=")(?P<path>(?!https?:)(?!//)[^"?#]+\.(?:css|js))(?:\?[^"#]*)?(?P<frag>#[^"]*)?"'
)


def short_hash(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:HASH_LEN]


def process_html(html_path, check_only=False):
    """Retourne (modifie, [(asset, version), ...])."""
    with open(html_path, "r", encoding="utf-8") as f:
        original = f.read()

    seen = []

    def repl(m):
        rel = m.group("path")
        asset = os.path.normpath(os.path.join(os.path.dirname(html_path), rel))
        if not os.path.isfile(asset):
            # Lien cassé ou asset généré ailleurs : on n'invente pas de version, on laisse tel quel.
            print(f"  [!] {os.path.basename(html_path)} : asset introuvable, ignoré -> {rel}")
            return m.group(0)
        version = short_hash(asset)
        seen.append((rel, version))
        return f'{m.group("attr")}{rel}?v={version}{m.group("frag") or ""}"'

    updated = ASSET_RE.sub(repl, original)
    changed = updated != original
    if changed and not check_only:
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(updated)
    return changed, seen


def check_lang_files():
    """Toutes les langues doivent exposer le même jeu de clés. Retourne la liste des anomalies."""
    if not os.path.isdir(LANG_DIR):
        return []
    files = sorted(f for f in os.listdir(LANG_DIR) if f.endswith(".json"))
    if not files:
        return []

    keysets, problems = {}, []
    for name in files:
        try:
            with open(os.path.join(LANG_DIR, name), "r", encoding="utf-8") as f:
                keysets[name] = set(json.load(f).keys())
        except (json.JSONDecodeError, OSError) as e:
            problems.append(f"{name} : illisible ({e})")

    if len(keysets) > 1:
        # Référence = union de toutes les clés : on signale ce qui manque à chacun.
        union = set().union(*keysets.values())
        for name, keys in sorted(keysets.items()):
            missing = union - keys
            if missing:
                problems.append(f"{name} : {len(missing)} clé(s) manquante(s) -> "
                                + ", ".join(sorted(missing)[:5])
                                + (" ..." if len(missing) > 5 else ""))
    if keysets and not problems:
        print(f"  langues : {len(keysets)} fichier(s), "
              f"{len(next(iter(keysets.values())))} clés identiques partout")
    return problems


def main(argv):
    check_only = "--check" in argv

    if not os.path.isdir(DOCS_DIR):
        print("[docs] dossier docs/ absent, rien à faire")
        return 0

    print("[docs] Cache-busting des pages statiques")
    pages = sorted(f for f in os.listdir(DOCS_DIR) if f.endswith(".html"))
    dirty = []
    for name in pages:
        path = os.path.join(DOCS_DIR, name)
        changed, assets = process_html(path, check_only)
        detail = ", ".join(f"{a}?v={v}" for a, v in assets) or "aucun asset local"
        print(f"  {name:<26} {'MIS A JOUR' if changed else 'a jour':<11} {detail}")
        if changed:
            dirty.append(name)

    problems = check_lang_files()
    for p in problems:
        print(f"  [!] {p}")

    if problems:
        # Bloquant : une clé manquante passe inaperçue en production (libellé vide/anglais).
        print("[docs] ECHEC : dictionnaires de langue désynchronisés")
        return 1
    if check_only and dirty:
        print(f"[docs] ECHEC : {len(dirty)} page(s) à régénérer -> lancez `python3 version_docs.py`")
        return 1
    return 0


# Intégration PlatformIO : le script est chargé par SCons avant le build. L'import est optionnel
# pour que `python3 version_docs.py` fonctionne aussi en ligne de commande.
try:
    from SCons.Script import Import  # noqa: F401

    Import("env")
    rc = main([])
    if rc != 0:
        raise SystemExit(rc)
except ImportError:
    if __name__ == "__main__":
        sys.exit(main(sys.argv[1:]))
