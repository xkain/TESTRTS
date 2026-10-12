# Site de documentation ESPSomfy-RTS

Site regroupant les deux lignées de firmware : la **v2.x**, importée du wiki
GitHub, et la **v3.x**, rédigée directement ici.

## Démarrer

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/zensical serve
```

Le site est servi sur <http://127.0.0.1:8000> et se recharge à chaque
enregistrement. Depuis Claude Code, la configuration `zensical-site` de
`.claude/launch.json` fait la même chose sur le port 8767.

Pour produire le site statique dans `site/` :

```bash
.venv/bin/zensical build --strict
```

Zensical valide les liens et les ancres internes à chaque build, et `--strict`
en fait une erreur bloquante — indispensable vu le nombre de liens croisés
hérités du wiki.

## Pourquoi Zensical et pas MkDocs

[Zensical](https://zensical.org) est le successeur de Material for MkDocs,
écrit par la même équipe. Material for MkDocs est en fin de maintenance le
**5 mai 2027**, et MkDocs 1.x n'est déjà plus maintenu.

Zensical lit le `mkdocs.yml` que voici — c'est volontaire, et officiellement
supporté sans limite de durée ; passer à `zensical.toml` reste possible plus
tard, sans urgence. Il embarque son thème, donc ni `mkdocs` ni
`mkdocs-material` ne sont installés.

**Deux choses à ne pas réintroduire :**

- le mécanisme `hooks` de MkDocs — Zensical ne le reprend pas. Tout ce qu'un
  hook ferait au rendu, `import-wiki-v2.py` le fait une fois pour toutes dans
  le fichier ;
- les clés de validation de MkDocs (`anchors`, `unrecognized_links`…) — elles
  sont inertes ici. Zensical a les siennes, `invalid_links` et
  `invalid_link_anchors`.

## Organisation

```
content/
  index.md              accueil : hero + choix entre les deux lignées
  v2/                   PRODUIT PAR SCRIPT — ne pas éditer à la main
  v3/                   rédigé ici
  outils/               commun aux deux lignées
  assets/               logo, favicon, bannière du hero
  stylesheets/extra.css palette, hero, cartes, admonitions
overrides/
  main.html             bandeau d'annonce, en haut de toutes les pages
  home.html             gabarit du hero de l'accueil
import-wiki-v2.py       wiki-v2-source/ -> content/v2/
```

## Mettre à jour la documentation v2.x

Le wiki en ligne reste la source de vérité. Après l'avoir modifié, redéposer
les fichiers dans `../../wiki-v2-source/`, puis :

```bash
python3 import-wiki-v2.py
```

Le script réécrit `content/v2/` en entier : liens du wiki traduits en chemins
relatifs, listes remises en forme pour Python-Markdown, alertes `> [!NOTE]`
converties en admonitions françaises, titre ajouté en tête de chaque page.
Toute retouche faite directement dans `content/v2/` est donc perdue — c'est
voulu.

Pour vérifier sans rien écrire que les deux côtés sont en phase (utile en
intégration continue) :

```bash
python3 import-wiki-v2.py --check
```

Ajouter une page au wiki demande une ligne dans le dictionnaire `PAGES` du
script, et une entrée dans le `nav` de `mkdocs.yml` ; sans cela le script la
signale comme non importée.

## Ce que le script ne fait pas

Les captures d'écran restent hébergées chez GitHub (`user-attachments`) : le
dépôt ne les embarque pas, et le site dépend donc de leur disponibilité.

La page *Journaux du port série* n'est pas dans `wiki-v2-source/` ; elle est
pour l'instant pointée vers le wiki en ligne.
