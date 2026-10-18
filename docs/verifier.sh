#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#
# Vérifie le site après une modification de content/ : build strict, qui échoue
# sur un lien, une ancre ou une image morts.
#
# Si le serveur de prévisualisation tourne, il se recharge tout seul : ce script
# sert à contrôler, pas à rafraîchir.
#
#   ./verifier.sh            vérifier
#   ./verifier.sh --serve    vérifier, puis servir sur 127.0.0.1:8767

set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")"

ZENSICAL=.venv/bin/zensical
if [ ! -x "$ZENSICAL" ]; then
  echo "Environnement absent. Le créer :"
  echo "  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/pip install -e tools/rts_images"
  exit 1
fi

# Le contrôle construit dans un dossier à part : un build dans site/ écraserait
# ce que sert le serveur de prévisualisation, qui cesserait alors de se recharger.
CHECK_CONFIG=.check-mkdocs.yml
CHECK_SITE=.check-site
trap 'rm -rf "$CHECK_CONFIG" "$CHECK_SITE"' EXIT
sed "s#^site_dir: site#site_dir: $CHECK_SITE#" mkdocs.yml > "$CHECK_CONFIG"

out=$("$ZENSICAL" build --strict -f "$CHECK_CONFIG" 2>&1); status=$?
if [ $status -eq 0 ] && ! grep -q "image introuvable" <<<"$out"; then
  echo "OK : aucun lien ni aucune ancre morte."
else
  # Les lignes utiles : l'avertissement et le fichier:ligne qui le suit.
  echo "$out" | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Warning|Error|╭─\[|image introuvable" | head -40
  echo
  echo "Des problèmes sont à corriger (voir ci-dessus)."
  exit 1
fi

if [ "${1:-}" = "--serve" ]; then
  echo
  echo "Site sur http://127.0.0.1:8767/ESPSomfy-RTS/guide/  (Ctrl+C pour arrêter)"
  exec "$ZENSICAL" serve -f mkdocs.yml -a 127.0.0.1:8767
fi
