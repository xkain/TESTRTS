# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
# Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
"""Extension Markdown : images citées depuis la racine de content/.

    ![Tableau de bord](v3/img/tableau-de-bord.webp){ width="500" }
    ![Boîtier](commun/img/boitier){ width="50%" }

Un chemin qui commence par un dossier de content/ (v2/, v3/, commun/…) est
résolu depuis la racine du site : plus de « ../../../ » à compter selon la
profondeur de la page. L'extension peut être omise.

Si x-clair.webp ET x-sombre.webp existent à côté de l'image citée, la référence
est dédoublée en deux images que Material n'affiche que dans le bon thème
(#only-light / #only-dark) ; sinon l'image citée est utilisée telle quelle. Les
attributs (largeur, hauteur…) sont repris sur chaque image.

Un chemin qui ne commence pas par un dossier de content/ (./x, ../x, URL) n'est
pas touché : les pages existantes continuent de fonctionner. Une image
introuvable est signalée, ce qui fait échouer un build strict.
"""

from __future__ import annotations

import copy
import logging
import posixpath
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

from markdown import Extension
from markdown.treeprocessors import Treeprocessor

if TYPE_CHECKING:
    from xml.etree.ElementTree import Element

    from markdown import Markdown

log = logging.getLogger("rts_images")

EXTENSIONS = (".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg")
THEMES = (("clair", "only-light"), ("sombre", "only-dark"))


class RtsImagesTreeprocessor(Treeprocessor):
    """Résout les images citées depuis la racine de content/."""

    def __init__(self, md: Markdown, docs_dir: Path) -> None:
        super().__init__(md)
        self.docs_dir = docs_dir

    def _page_path(self) -> str | None:
        from zensical.extensions.context import ContextPreprocessor  # noqa: PLC0415

        context = ContextPreprocessor.from_markdown(self.md)
        return context.page.path if context else None

    def _stem(self, ref: str) -> str:
        """Le chemin sans extension d'image, s'il en porte une."""
        base, dot, ext = ref.rpartition(".")
        return base if dot and f".{ext.lower()}" in EXTENSIONS else ref

    def _themed(self, ref: str) -> tuple[str, str] | None:
        stem = self._stem(ref)
        pair = tuple(f"{stem}-{theme}.webp" for theme, _ in THEMES)
        if all((self.docs_dir / p).is_file() for p in pair):
            return pair  # type: ignore[return-value]
        return None

    def _single(self, ref: str) -> str | None:
        """Chemin (depuis content/) du fichier cité, extension facultative."""
        if (self.docs_dir / ref).is_file():
            return ref
        for ext in EXTENSIONS:
            if (self.docs_dir / (ref + ext)).is_file():
                return ref + ext
        return None

    def run(self, root: Element) -> None:
        page = self._page_path()
        if page is None:
            return
        here = posixpath.dirname(page) or "."

        def rel(target: str) -> str:
            return posixpath.relpath(target, here)

        parents = {child: parent for parent in root.iter() for child in parent}
        for img in list(root.iter("img")):
            src = img.get("src", "")
            if not src or urlparse(src).scheme or src.startswith((".", "/", "#")):
                continue
            ref = src.split("#", 1)[0]
            top = ref.split("/", 1)[0]
            if "/" not in ref or not (self.docs_dir / top).is_dir():
                continue

            pair = self._themed(ref)
            found = None if pair else self._single(ref)
            if pair is None and found is None:
                log.warning("image introuvable : %s (page %s)", src, page)
                continue

            parent = parents.get(img)
            if pair is None or parent is None:
                img.set("src", rel(found or pair[0]))  # type: ignore[index]
                continue
            light = img
            dark = copy.deepcopy(img)
            light.set("src", f"{rel(pair[0])}#{THEMES[0][1]}")
            dark.set("src", f"{rel(pair[1])}#{THEMES[1][1]}")
            parent.insert(list(parent).index(light) + 1, dark)


class RtsImagesExtension(Extension):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)

    def extendMarkdown(self, md: Markdown) -> None:
        from zensical.config import get_config  # noqa: PLC0415

        config = get_config()
        # docs_dir est relatif au dossier du mkdocs.yml, pas au dossier courant :
        # le serveur de prévisualisation est lancé depuis la racine du dépôt.
        docs_dir = (Path(config["root_dir"]) / config["docs_dir"]).resolve()
        # Après attr_list (8), AVANT glightbox (7) : celui-ci enveloppe l'image
        # d'un lien qui reprend son src, qui doit donc déjà être résolu. Avant
        # aussi la réécriture des liens relatifs (0).
        md.treeprocessors.register(
            RtsImagesTreeprocessor(md, docs_dir), "rts_images", 7.5
        )


def makeExtension(**kwargs: Any) -> RtsImagesExtension:
    return RtsImagesExtension(**kwargs)
