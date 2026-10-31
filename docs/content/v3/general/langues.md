# Gérer les langues

Un véritable gestionnaire de packs de langue, pas un simple sélecteur. Depuis **Général**, le
bouton **Gérer les langues** l'ouvre — voir [Général](index.md).

![gerer langues 1](v3/img/gerer-langues-1){ .on-glb }

!!! note "Note"

    La langue d'origine embarquée dans le firmware n'est jamais supprimable — c'est le filet de
    sécurité qui garantit que l'interface affiche toujours quelque chose, quoi qu'il arrive aux
    autres packs.

    Cette langue d'origine dépend de votre appareil :

    - **l'anglais** sur une [carte générique](../firmware/led-de-statut.md#boitier-ou-carte-generique) ;
    - **le français** sur l'un de mes [boîtiers officiels](../materiel/boitiers-officiels.md).

    Dans les deux cas, elle ne peut pas être supprimée : elle n'a pas de bouton **Supprimer**.

## La liste des langues

Une ligne par langue disponible, avec un badge d'état :

* **Active** : c'est la langue actuellement affichée.
* **Installée** : le pack est présent sur l'appareil, prêt à être utilisé.
* **En attente** : un téléchargement a été mis en file, voir plus bas.

## Changer de langue active

Bouton **Utiliser** sur une langue déjà installée — bascule l'interface dessus
immédiatement.

## Installer une nouvelle langue

Bouton **Télécharger** sur une langue pas encore installée, avec une barre de progression par
ligne.

### D'où vient le fichier de langue

La liste des langues proposées vient d'un petit catalogue embarqué dans l'appareil, complété par
celui du projet sur GitHub pour les langues ajoutées depuis votre dernière mise à jour.

Le pack téléchargé est un fichier d'une **release GitHub** du projet : l'appareil récupère le
fichier de langue lié à **la version de firmware qu'il exécute**, nommé
`ESPSomfyRTS_<version>_lang_<code>.json.gz` (par exemple `…_lang_de.json.gz` pour l'allemand).
Vous obtenez ainsi toujours une traduction qui correspond exactement à votre interface, même si le
projet a avancé depuis. Vous pouvez aussi trouver ces fichiers dans la liste des fichiers joints
de chaque release, sur la page [Releases](https://github.com/xkain/ESPSomfy-RTS/releases) du
projet.

### Si l'appareil n'a pas d'accès Internet

Deux filets de secours, dans l'ordre :

1. **Relais par le navigateur** : la page tente de télécharger le pack elle-même (puisque
    *votre* ordinateur a probablement un accès Internet, même si l'appareil n'en a pas) et de
    le transmettre à l'appareil.
2. **Si ça échoue aussi** (par exemple l'appareil est en point d'accès isolé) : l'interface
    bascule sur un import manuel, avec un lien **Ouvrir le fichier sur GitHub**. Il mène au
    fichier de langue du projet (dossier `locales`) : téléchargez-le avec un appareil qui a
    Internet, puis importez-le (voir plus bas). Vous pouvez aussi choisir **Appliquer dès que
    possible** : la langue est alors marquée **En attente** et sera récupérée automatiquement dès
    que l'appareil retrouvera un accès Internet. **Annuler la mise en attente** retire cette file
    d'attente si vous changez d'avis.

## Importer un fichier manuellement

**Importer un fichier de langue (.json, .json.gz)** accepte un fichier que vous avez
téléchargé vous-même — utile en dernier recours, ou si vous préférez ne pas dépendre du
téléchargement automatique.

Selon l'endroit où vous le récupérez, vous obtenez l'un ou l'autre format, tous deux acceptés :

| Où le chercher | Fichier | Format |
|---|---|---|
| Le lien **Ouvrir le fichier sur GitHub** de la fenêtre | `<code>.json` (par exemple `de.json`) | `.json` |
| Le dossier `locales` du [dépôt du projet](https://github.com/xkain/ESPSomfy-RTS/tree/main/locales) | `<code>.json` | `.json` |
| Les fichiers joints d'une [release](https://github.com/xkain/ESPSomfy-RTS/releases) | `ESPSomfyRTS_<version>_lang_<code>.json.gz` | `.json.gz` |

Dans le dossier `locales`, ouvrez le fichier de la langue voulue, puis utilisez le bouton de
téléchargement de GitHub (**Download raw file**). Une fois le fichier sur votre ordinateur, cliquez
sur la zone **Choisir un pack de langue** de la ligne concernée et sélectionnez-le : la page se
recharge à la fin de l'import.

!!! tip "Astuce"

    **Créer et proposer une nouvelle langue** : cette même méthode d'import permet de tester
    votre propre traduction avant de la proposer au projet. Partez d'un fichier de langue
    existant comme modèle (même structure de clés, seules les valeurs changent), traduisez-le,
    puis importez-le ici pour vérifier le rendu directement dans l'interface — aucun besoin de
    reflasher ou de recompiler.

    Si vous avez réalisé votre propre fichier de langue, vous pouvez le **proposer au projet par
    une *pull request*** sur GitHub : ajoutez votre fichier dans le dossier `locales` du dépôt.
    Une fois intégrée, la nouvelle langue sera proposée à tous les utilisateurs directement depuis
    l'interface.

## Supprimer une langue installée

Bouton **Supprimer** sur chaque langue installée (sauf la langue d'origine du firmware, qui
reste toujours disponible).

