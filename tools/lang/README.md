# tools/lang/

Scripts liés à l'internationalisation (i18n). `locales/fr.json` est la seule source de
vérité éditée à la main ; `en.json`, `de.json` et `es.json` en sont dérivés ou vérifiés
par les outils ci-dessous.

## check_i18n.py

Garde-fou de build (`pre:` dans `platformio.ini`). Bloque la compilation si un défaut
d'i18n déjà corrigé par le passé est réintroduit : clé appelée mais absente d'une locale,
littéral passé à `tr()` au lieu d'une clé, texte visible écrit en dur, locales
désynchronisées, jeton de substitution (`{LANG}`, `%1`...) divergent, clé au format non
conforme. Chaque contrôle correspond à un bug réellement apparu à l'écran, pas à une
précaution théorique (détail des motifs : en-tête du script).

```bash
python3 tools/lang/check_i18n.py            # ce que le build exécute
python3 tools/lang/check_i18n.py --full     # + audit des clés jamais utilisées
```

## locale_sync.py

Outil **manuel**, jamais lancé automatiquement (ni par le build, ni en tâche de fond) :
compare et réécrit `en.json`/`de.json`/`es.json` par rapport à `fr.json`, à la demande
explicite du user uniquement.

```bash
python3 tools/lang/locale_sync.py status
python3 tools/lang/locale_sync.py renames
python3 tools/lang/locale_sync.py apply                    # aperçu, ne modifie rien
python3 tools/lang/locale_sync.py apply --write             # réécrit réellement
python3 tools/lang/locale_sync.py apply --write --langs de  # une seule langue
```

## package_langs.py

Empaquette chaque fichier de `locales/` en `.json.gz` individuel, attaché comme asset de
release GitHub (cf. `.github/workflows/build.yaml`, job de release). Distinct de
`tools/build_data_image.py`, qui n'embarque dans le firmware que la langue par défaut de
l'environnement de build ; celui-ci traite toutes les langues du projet, embarquée ou non.

```bash
python3 tools/lang/package_langs.py [dossier_de_sortie]   # défaut : dist_langs/
```
