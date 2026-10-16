#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Convertit le wiki GitHub en pages MkDocs.

Le wiki reste la source de vérité : il est rédigé en ligne, puis déposé dans
wiki-v2-source/ pour ce qui ne vaut que pour la lignée v2.x, et dans wiki-mix/
pour les pages qui valent pour les deux lignées. Ce script est le seul chemin
entre les deux — ne jamais retoucher content/v2/, content/commun/ ni
content/outils/installateur-web.md à la main, tout y est régénéré à chaque
passage.

    python3 import-wiki-v2.py [--source CHEMIN] [--mix CHEMIN] [--check]

Trois écarts séparent la syntaxe de GitHub de celle de Python-Markdown, et
chacun casse le rendu en silence :

1. une liste collée au paragraphe qui la précède n'est pas vue comme une liste
   (le texte se retrouve aggloméré en un seul paragraphe) — on insère la ligne
   vide manquante ;
2. l'imbrication de listes à 2 ou 3 espaces est aplatie — réglé côté mkdocs.yml
   par mdx_truly_sane_lists, pas ici ;
3. les liens du wiki (`[[Page]]`, `/xkain/ESPSomfy-RTS/wiki/Page`) n'existent
   plus une fois le contenu sorti du wiki — on les réécrit en chemins relatifs.

Les images sont versionnées dans le wiki, sous img/ à côté des pages, et
recopiées ici dans <lignée>/img/ — une page de v2/somfy/ les vise donc en
../img/. Elles étaient auparavant hébergées chez GitHub (user-attachments) :
sept d'entre elles s'y étaient déjà volatilisées sans que rien le signale,
d'où le versionnement.
"""

from __future__ import annotations

import argparse
import filecmp
import os
import re
import shutil
import sys
import unicodedata
from pathlib import Path
from urllib.parse import unquote

HERE = Path(__file__).resolve().parent
DEFAULT_SOURCE = HERE.parent.parent / "wiki-v2-source"
DEFAULT_MIX = HERE.parent.parent / "wiki-mix"
DEST = HERE / "content"

# Nom du fichier wiki -> (chemin de destination sous content/, titre H1).
# L'ordre est celui de la barre latérale du wiki, et sert aussi de nav.
PAGES: dict[str, tuple[str, str]] = {
    "Boîtiers-préassemblés.md": (
        "v2/materiel/boitiers-preassembles.md",
        "Boîtiers préassemblés",
    ),
    "Contrôle-des-moteurs-avec-GPIO.md": (
        "v2/materiel/controle-moteurs-gpio.md",
        "Contrôle des moteurs avec GPIO",
    ),
    "Guide-d'installation.md": ("v2/installation/guide.md", "Guide d'installation"),
    "Tableau-de-bord.md": ("v2/tableau-de-bord.md", "Tableau de bord"),
    "Options.md": ("v2/configuration/options.md", "Options"),
    "Sécurité.md": ("v2/configuration/securite.md", "Sécurité"),
    "Firmware.md": ("v2/configuration/firmware.md", "Firmware"),
    "Mettre-à-jour.md": ("v2/configuration/mettre-a-jour.md", "Mettre à jour"),
    "Connexion.md": ("v2/configuration/connexion.md", "Connexion"),
    "DHCP-et-IP-Statique.md": ("v2/configuration/dhcp-ip-statique.md", "DHCP et IP statique"),
    "Configurer-la-Radio.md": ("v2/radio/configurer.md", "Configurer la radio"),
    "Journaux-Radio.md": ("v2/radio/journaux.md", "Journaux radio"),
    "Balayage-de-Fréquence.md": ("v2/radio/balayage-frequence.md", "Balayage de fréquence"),
    "Pièces-(Rooms).md": ("v2/somfy/pieces.md", "Pièces (Rooms)"),
    "EQUIPEMENTS.md": ("v2/somfy/equipements.md", "Équipements"),
    "GROUPES-(Groups).md": ("v2/somfy/groupes.md", "Groupes (Groups)"),
    "RÉPÉTEUR-(Repeaters).md": ("v2/somfy/repeteurs.md", "Répéteurs (Repeaters)"),
    "TÉLÉCOMMANDE-VIRTUELLE(Virtual-Remote).md": (
        "v2/somfy/telecommande-virtuelle.md",
        "Télécommande virtuelle",
    ),
    "Intégrations.md": ("v2/integrations/index.md", "Intégrations"),
    "MQTT.md": ("v2/integrations/mqtt.md", "MQTT"),
    "Factory-Reset.md": ("v2/maintenance/factory-reset.md", "Factory Reset"),
    "Anatomie-Fichier-de-Sauvegarde.md": (
        "v2/maintenance/anatomie-sauvegarde.md",
        "Anatomie du fichier de sauvegarde",
    ),
}

# Pages de wiki-mix/ : celles qui valent pour les deux lignées, et ne sont donc
# écrites qu'une fois. Trois sortent sous commun/, qui a son propre onglet ;
# l'installateur web reste rangé avec les outils en ligne, où l'accueil et la
# page v3 pointent déjà et où un lecteur le cherche — l'onglet « Outils en
# ligne » ne parle d'aucune lignée en particulier, le dédoubler n'apporterait
# rien.
MIX_PAGES: dict[str, tuple[str, str]] = {
    "Composants.md": ("commun/composants.md", "Composants"),
    "Journaux-du-port-serie.md": ("commun/journaux-port-serie.md", "Journaux du port série"),
    "Home-Assistant.md": ("commun/home-assistant.md", "Home Assistant"),
    "Installateur-Web.md": ("outils/installateur-web.md", "Installateur web"),
}

# Pages du wiki qui ne deviennent pas des pages du site.
SKIPPED = {"Home.md", "_Sidebar.md", "_Footer.md"}

# Cibles de liens que le wiki local ne contient pas. Faute de source, on renvoie
# vers le wiki en ligne plutôt que de produire un lien mort.
WIKI_BASE = "https://github.com/xkain/ESPSomfy-RTS/wiki"

BANNER = (
    "<!-- Page produite par docs/import-wiki-v2.py à partir de\n"
    "     {src}. Toute retouche ici sera écrasée : corriger le\n"
    "     wiki, redéposer la source, puis relancer le script. -->\n"
)


def page_key(name: str) -> str:
    """Clé de rapprochement entre un lien du wiki et un fichier source.

    GitHub traite les espaces et les tirets comme équivalents dans les URL de
    wiki (`[[Pièces (Rooms)]]` et `Pièces-(Rooms)` visent la même page), et les
    liens mélangent formes accentuées et formes percent-encodées. On ramène
    tout à une même empreinte : décodée, sans accents, sans ponctuation, en
    minuscules.
    """
    name = unquote(name).removesuffix(".md")
    name = unicodedata.normalize("NFD", name)
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", name.lower())


KEY_TO_DEST = {
    page_key(src): dest
    for src, (dest, _) in {**PAGES, **MIX_PAGES}.items()
}
KEY_TO_DEST[page_key("Home")] = "v2/index.md"


def rewrite_target(target: str, current_dest: str, unresolved: set[str]) -> str:
    """Traduit une cible de lien du wiki en chemin relatif, ancre comprise."""
    anchor = ""
    if "#" in target:
        target, anchor = target.split("#", 1)
        anchor = "#" + unquote(anchor)
    if not target:  # lien purement interne à la page
        return anchor

    dest = KEY_TO_DEST.get(page_key(target))
    if dest is None:
        unresolved.add(unquote(target))
        return f"{WIKI_BASE}/{target}{anchor}"

    rel = os.path.relpath(dest, os.path.dirname(current_dest))
    return rel + anchor


def rewrite_links(text: str, current_dest: str, unresolved: set[str]) -> str:
    """Réécrit les trois formes de liens que produit le wiki GitHub."""

    def to_rel(target: str) -> str:
        return rewrite_target(target, current_dest, unresolved)

    # 1. [[Page]] et [[libellé|Page]]
    def wikilink(m: re.Match[str]) -> str:
        inner = m.group(1)
        label, _, target = inner.rpartition("|")
        target = target.strip()
        label = (label or target).strip()
        return f"[{label}]({to_rel(target)})"

    text = re.sub(r"\[\[([^\]]+)\]\]", wikilink, text)

    # 2. URL absolues du wiki, en chemin de dépôt ou en URL complète, dans un
    #    lien Markdown (…) comme dans un href="…".
    wiki_url = r"(?:https?://github\.com)?/xkain/ESPSomfy-RTS/wiki/"
    text = re.sub(
        rf'href="{wiki_url}([^"]*)"',
        lambda m: f'href="{to_rel(m.group(1))}"',
        text,
    )
    text = re.sub(
        rf"\]\({wiki_url}([^)\s]*)\)",
        lambda m: f"]({to_rel(m.group(1))})",
        text,
    )

    # 3. Liens relatifs nus du wiki : ](Configurer-la-Radio#assignation-gpio).
    #    Dans un wiki, une cible relative sans extension est forcément une autre
    #    page du wiki : on la réécrit, qu'elle soit importée ou non — celles qui
    #    ne le sont pas repartent vers le wiki en ligne. On laisse en revanche
    #    passer les vrais fichiers (une extension) et les ancres locales.
    def is_wiki_page(target: str) -> bool:
        page = target.split("#", 1)[0]
        return bool(page) and "." not in page

    def bare(m: re.Match[str]) -> str:
        target = m.group(1)
        return f"]({to_rel(target)})" if is_wiki_page(target) else m.group(0)

    text = re.sub(r"\]\(([^):/#][^)\s]*)\)", bare, text)
    text = re.sub(
        r'href="([^":/#][^"]*)"',
        lambda m: (
            f'href="{to_rel(m.group(1))}"' if is_wiki_page(m.group(1)) else m.group(0)
        ),
        text,
    )
    return text


LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d+[.)])(\s+)")
QUOTE = re.compile(r"^(\s*(?:>\s?)+)")
INDENT = 4  # un niveau d'imbrication, en espaces, pour Python-Markdown


def normalise_lists(text: str) -> tuple[int, int, str]:
    """Remet les listes du wiki dans la forme qu'attend Python-Markdown.

    Deux corrections, qui doivent se faire dans la même passe parce qu'elles
    partagent le suivi du contexte de liste :

    1. **La ligne vide manquante.** GitHub démarre une liste même collée au
       paragraphe qui la précède ; Python-Markdown non, et avale alors la liste
       entière dans le paragraphe. On n'insère que si la ligne d'avant
       n'appartient pas déjà à une liste — sinon on couperait en deux un
       élément qui tient sur plusieurs lignes.

    2. **L'indentation d'imbrication.** Le wiki imbrique indifféremment à 2, 3
       ou 4 espaces, que GitHub accepte toutes. Python-Markdown n'en reconnaît
       qu'une seule, et rend le reste en texte brut au milieu de l'élément
       parent. Aucun réglage d'extension ne couvre les trois à la fois : on
       déduit donc la profondeur logique de chaque élément par comparaison avec
       celui du dessus, puis on réécrit toutes les listes à 4 espaces par
       niveau.
    """
    out: list[str] = []
    in_fence = False
    prev_in_list = False
    prev_blank = True
    inserted = 0
    reindented = 0
    # Pile des niveaux ouverts : (indentation lue, indentation écrite).
    levels: list[tuple[int, int]] = []
    # Position du texte dans l'élément courant, lue et écrite, pour décaler
    # ses lignes de continuation d'autant.
    content: tuple[int, int] = (0, 0)

    for line in text.split("\n"):
        quote = QUOTE.match(line)
        prefix = quote.group(1) if quote else ""
        body = line[len(prefix) :]

        if body.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
            out.append(line)
            prev_blank, prev_in_list = False, False
            levels.clear()
            continue
        if in_fence:
            out.append(line)
            continue

        if not body.strip():
            out.append(line)
            prev_blank = True
            continue

        item = LIST_ITEM.match(body)
        if item:
            if not prev_blank and not prev_in_list:
                out.append(prefix.rstrip() if prefix else "")
                inserted += 1

            read = len(item.group(1))
            while levels and read < levels[-1][0]:
                levels.pop()
            if not levels:
                written = 0
                levels.append((read, written))
            elif read == levels[-1][0]:
                written = levels[-1][1]
            else:
                written = levels[-1][1] + INDENT
                levels.append((read, written))

            content = (len(item.group(0)), written + INDENT)
            if written != read:
                reindented += 1
            out.append(prefix + " " * written + body.lstrip())
            prev_in_list, prev_blank = True, False
            continue

        if prev_in_list and body.startswith((" ", "\t")):
            # Continuation d'un élément : elle suit son texte, et garde le
            # surplus d'indentation qu'elle portait (sous-bloc, code indenté).
            read = len(body) - len(body.lstrip())
            written = content[1] + max(0, read - content[0])
            out.append(prefix + " " * written + body.lstrip())
            prev_blank = False
            continue

        prev_in_list = False
        levels.clear()
        out.append(line)
        prev_blank = False

    return inserted, reindented, "\n".join(out)


# Alerte GitHub -> (classe d'admonition Material, titre affiché).
# "caution" prend la classe "danger" (rouge) ; "important" garde la sienne, que
# stylesheets/extra.css teinte en violet comme chez GitHub.
CALLOUTS = {
    "NOTE": ("note", "Note"),
    "TIP": ("tip", "Astuce"),
    "IMPORTANT": ("important", "Important"),
    "WARNING": ("warning", "Avertissement"),
    "CAUTION": ("danger", "Attention"),
}
CALLOUT_MARKER = re.compile(r"^>\s?\[!(%s)\]\s*$" % "|".join(CALLOUTS))

# <details> ouvrant, sans attribut markdown déjà posé.
DETAILS_OPEN = re.compile(r"<details(?![^>]*\bmarkdown=)([^>]*)>")


def open_details(text: str) -> tuple[int, str]:
    """Pose markdown="1" sur chaque <details> pour que son contenu soit rendu.

    GitHub traite le Markdown à l'intérieur d'un bloc HTML brut ; Python-Markdown
    ne le fait que si l'élément porte markdown="1", ce que md_in_html lit. Sans
    cet attribut, un tableau dans un <details> ressort en barres verticales et un
    `code` en backticks littéraux, sans la moindre erreur de build.

    Les blocs de code clôturés, eux, passaient déjà : pymdownx.superfences les
    traite en préprocesseur, avant que le HTML brut ne soit mis de côté. C'est ce
    qui rendait la panne invisible sur les pages d'Intégrations, dont tous les
    <details> ne contiennent que du JSON clôturé.

    On l'écrit ici plutôt que dans le wiki : la source reste du Markdown GitHub
    pur, et GitHub ignore de toute façon l'attribut.
    """
    text, count = DETAILS_OPEN.subn(r'<details markdown="1"\1>', text)
    return count, text



def convert_callouts(text: str) -> tuple[int, str]:
    """Transforme les alertes GitHub en admonitions Material.

    `> [!NOTE]` n'est ni du Markdown ni du Python-Markdown : sans traitement, le
    bloc se rend en simple citation. Une extension sait les lire, mais elle en
    tire le titre du mot-clé et affiche "Note", "Tip", "Caution" — en anglais,
    sans moyen de changer. On écrit donc l'admonition et son titre dans le
    fichier, ce qui a deux vertus : rien ne dépend plus d'une extension tierce
    ni du mécanisme `hooks`, que Zensical ne reprend pas.

    À lancer APRÈS normalise_lists : celui-ci sait déjà travailler à travers le
    préfixe de citation, et les indentations qu'il pose sont décalées telles
    quelles dans le corps de l'admonition.
    """
    out: list[str] = []
    lines = text.split("\n")
    converted = 0
    i = 0

    while i < len(lines):
        marker = CALLOUT_MARKER.match(lines[i])
        if not marker:
            out.append(lines[i])
            i += 1
            continue

        css_class, label = CALLOUTS[marker.group(1)]
        if out and out[-1].strip():
            out.append("")  # Python-Markdown exige une ligne vide avant le bloc
        out.append(f'!!! {css_class} "{label}"')
        out.append("")

        i += 1
        while i < len(lines) and lines[i].startswith(">"):
            body = re.sub(r"^>\s?", "", lines[i])
            out.append(" " * INDENT + body if body.strip() else "")
            i += 1
        converted += 1

    return converted, "\n".join(out)


# Référence à une image du wiki : `](img/x.png)`, `src="img/x.png"`, `href="…"`.
IMAGE_REF = re.compile(r'(?P<open>\]\(|src="|href=")img/(?P<name>[A-Za-z0-9._-]+)')


def rewrite_images(text: str, dest_rel: str, used: set[str]) -> str:
    """Remonte `img/x.png` au dossier d'images de la lignée.

    Dans le wiki, les images sont posées à côté des pages, toutes à plat : une
    page les vise donc toujours en `img/x.png`. Ici les pages sont réparties en
    sous-dossiers (v2/somfy/, v2/radio/…) alors que les images restent groupées
    à la racine de la lignée — sans cette réécriture, une page de v2/somfy/
    irait chercher un v2/somfy/img/ qui n'existe pas.
    """
    root = dest_rel.split("/", 1)[0]
    here = os.path.dirname(dest_rel)

    def one(m: re.Match[str]) -> str:
        used.add(m.group("name"))
        return m.group("open") + os.path.relpath(f"{root}/img/{m.group('name')}", here)

    return IMAGE_REF.sub(one, text)


def convert(
    src_path: Path,
    dest_rel: str,
    title: str,
    unresolved: set[str],
    used: set[str],
) -> tuple[str, int, int, int, int]:
    text = src_path.read_text(encoding="utf-8")
    text = rewrite_images(text, dest_rel, used)
    text = rewrite_links(text, dest_rel, unresolved)
    inserted, reindented, text = normalise_lists(text)
    callouts, text = convert_callouts(text)
    details, text = open_details(text)
    source = f"{src_path.parent.name}/{src_path.name}"
    header = BANNER.format(src=source) + f"\n# {title}\n\n"
    return header + text.lstrip("\n") + "\n", inserted, reindented, callouts, details


def sync_images(
    dest_root: str, wanted: dict[str, Path], check: bool
) -> tuple[int, list[str]]:
    """Aligne content/<lignée>/img/ sur les images que les pages réclament.

    Les fichiers en trop sont retirés : une capture remplacée dans le wiki
    laisserait sinon son ancienne version derrière elle, publiée et invisible.
    """
    out_dir = HERE / "content" / dest_root / "img"
    ecarts: list[str] = []
    present = {f.name for f in out_dir.iterdir() if f.is_file()} if out_dir.is_dir() else set()

    for name, src in sorted(wanted.items()):
        dest = out_dir / name
        if dest.is_file() and filecmp.cmp(src, dest, shallow=False):
            continue
        ecarts.append(f"{dest_root}/img/{name}")
        if not check:
            out_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)

    for name in sorted(present - set(wanted)):
        ecarts.append(f"{dest_root}/img/{name} (en trop)")
        if not check:
            (out_dir / name).unlink()

    return len(wanted), ecarts


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--mix", type=Path, default=DEFAULT_MIX)
    ap.add_argument(
        "--check",
        action="store_true",
        help="ne rien écrire, signaler si content/ diffère des sources",
    )
    args = ap.parse_args()

    sources = [(args.source, PAGES), (args.mix, MIX_PAGES)]
    extra: list[str] = []
    for folder, table in sources:
        if not folder.is_dir():
            print(f"source introuvable : {folder}", file=sys.stderr)
            return 1
        present = {f.name for f in folder.glob("*.md")}
        if missing := set(table) - present:
            print(f"pages déclarées mais absentes de {folder.name} :", file=sys.stderr)
            for name in sorted(missing):
                print(f"  - {name}", file=sys.stderr)
            return 1
        extra += [f"{folder.name}/{n}" for n in sorted(present - set(table) - SKIPPED)]

    unresolved: set[str] = set()
    stale: list[str] = []
    # Images réclamées par les pages, rangées par dossier de destination.
    images: dict[str, dict[str, Path]] = {}
    total_inserted = total_reindented = total_callouts = total_details = 0
    pages = 0

    for folder, table in sources:
        for src_name, (dest_rel, title) in table.items():
            used: set[str] = set()
            content, inserted, reindented, callouts, details = convert(
                folder / src_name, dest_rel, title, unresolved, used
            )
            pages += 1
            total_inserted += inserted
            total_reindented += reindented
            total_callouts += callouts
            total_details += details
            images.setdefault(dest_rel.split("/", 1)[0], {}).update(
                {name: folder / "img" / name for name in used}
            )
            out = HERE / "content" / dest_rel
            if args.check:
                if not out.exists() or out.read_text(encoding="utf-8") != content:
                    stale.append(dest_rel)
                continue
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(content, encoding="utf-8")

    copiees = 0
    for dest_root, wanted in sorted(images.items()):
        n, ecarts = sync_images(dest_root, wanted, args.check)
        copiees += n
        stale += ecarts

    if args.check:
        if stale:
            print("content/ n'est plus à jour :", file=sys.stderr)
            for item in stale:
                print(f"  - {item}", file=sys.stderr)
            print("relancer : python3 import-wiki-v2.py", file=sys.stderr)
            return 1
        print(f"{pages} pages et {copiees} images à jour")
        return 0

    print(f"{pages} pages et {copiees} images écrites dans {DEST}")
    print(
        f"{total_inserted} lignes vides insérées devant des listes, "
        f"{total_reindented} éléments de liste réindentés, "
        f"{total_callouts} alertes converties en admonitions, "
        f"{total_details} blocs <details> ouverts au Markdown"
    )
    if extra:
        print("\nprésentes dans la source mais pas importées (à déclarer dans PAGES) :")
        for name in extra:
            print(f"  - {name}")
    if unresolved:
        print("\ncibles de liens sans page locale, renvoyées vers le wiki en ligne :")
        for name in sorted(unresolved):
            print(f"  - {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
