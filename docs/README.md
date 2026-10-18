# Site de documentation ESPSomfy-RTS

Site regroupant les deux lignées de firmware : la **v2.x**, importée du wiki
GitHub, et la **v3.x**, rédigée directement ici.

## Démarrer

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -e tools/rts_images
.venv/bin/zensical serve
```

Le site est servi sur <http://127.0.0.1:8000> et se recharge à chaque
enregistrement. Depuis Claude Code, la configuration `zensical-site` de
`.claude/launch.json` fait la même chose sur le port 8767.

Pour contrôler le site après une modification (liens, ancres, images), sans
perturber le serveur de prévisualisation :

```bash
./verifier.sh            # build strict, dans un dossier temporaire
./verifier.sh --serve    # idem, puis servir sur 127.0.0.1:8767
```

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

- le mécanisme `hooks` de MkDocs — Zensical ne le reprend pas ;
- les clés de validation de MkDocs (`anchors`, `unrecognized_links`…) — elles
  sont inertes ici. Zensical a les siennes, `invalid_links` et
  `invalid_link_anchors`.

## Organisation

`content/` est la **seule source** de la documentation : on l'édite directement.
Il n'y a plus de génération depuis le wiki GitHub, qui ne garde qu'un lien vers
ce site.

```
content/
  index.md              accueil : démarrage en 4 étapes, v2/v3, Home Assistant, FAQ
  v3/                   documentation de la lignée v3.x (dont la migration depuis la v2)
  v2/                   documentation de la lignée v2.x
  commun/               pages valables pour les deux lignées
  outils/               outils en ligne (installateur web, géolocalisation)
  boitiers/             fiches des boîtiers officiels
  faq/, aide/           questions fréquentes, où demander de l'aide
  assets/               logo, favicon, bannière du hero
  stylesheets/extra.css palette, hero, cartes, admonitions
overrides/
  main.html             bandeau d'annonce, en haut de toutes les pages
  home.html             gabarit du hero de l'accueil
  .icons/espsomfy/      logo de l'en-tête (SVG en ligne, suit la couleur du thème)
verifier.sh             contrôle strict et service local
```

## Images

Chaque lignée a son dossier `img/` (`v2/img/`, `v3/img/`, `commun/img/`). On cite
une image par son chemin **depuis la racine de `content/`**, sans compter les
`../` — c'est l'extension locale `tools/rts_images` qui le résout :

```markdown
![Tableau de bord](v3/img/tableau-de-bord.webp){ width="500" }
![Matériel](commun/img/materiel-1){ width="50%" }
```

- l'extension peut être omise ; `width`, `height` et les autres attributs se
  posent entre accolades, collées à l'image ;
- si `x-clair.webp` **et** `x-sombre.webp` existent à côté, la citation `x` est
  dédoublée en deux images dont le thème n'affiche que la bonne ; sinon l'image
  citée est utilisée telle quelle, quelle que soit son extension ;
- une image introuvable est signalée, et `./verifier.sh` échoue ;
- les citations en chemin relatif (`../img/x.png`) et les balises `<img>` HTML
  ne sont pas touchées : elles continuent de fonctionner.

Nommage : le nom de base, puis `-clair` ou `-sombre`, en `.webp`. Une image
partagée entre lignées se range dans `commun/img/` ; ne pas mettre d'accent ni
d'espace dans un nom de fichier (GitHub Pages distingue les majuscules).

## Avant la mise en ligne (dépôt officiel)

À passer en revue au moment de déplacer la documentation du dépôt de test vers
le dépôt officiel :

- [ ] **Le workflow et l'extension partent ensemble.** `.github/workflows/pages.yml`
      (la ligne `pip install docs/tools/rts_images`) et le dossier
      `docs/tools/rts_images/` doivent arriver avec `docs/`. Sinon la construction
      échoue sur « No module named 'rts_images' » et le site n'est pas mis à jour.
- [ ] `./verifier.sh` répond OK. Le workflow construit **sans** `--strict` (pour ne
      pas bloquer les binaires de l'installateur web) : c'est ce contrôle local qui
      attrape liens, ancres et images mortes.
- [ ] Le bandeau d'annonce (`overrides/main.html`) dit vrai le jour de la sortie :
      « La v3.0.0 est disponible ».
- [ ] Les images de *Journaux du port série* sont terminées, et aucun fichier
      d'image n'a d'accent, d'espace ou de majuscule dans son nom (GitHub Pages
      distingue les majuscules) — `content/assets/Écosystème domotique
      connecté.png` est à renommer.
- [ ] La page d'accueil du wiki GitHub porte le lien vers le site.
- [ ] Le lien « Ouvrir dans Home Assistant » (badge `hacs_repository`) fonctionne
      encore avec le Marketplace de Home Assistant 2026.11.
