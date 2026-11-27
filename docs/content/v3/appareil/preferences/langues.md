# Gérer les langues

L'appareil garde jusqu'à **trois langues installées**, sa langue d'origine comprise. Dans
l'onglet **Langue & région** de la page [Préférences](index.md#region), le bouton
`Gérer les langues` ouvre la fenêtre qui les installe, les active et les supprime.

![Fenêtre Gérer les langues](v3/img/preferences-fen-langues){ .on-glb }

!!! note "La langue d'origine"

    La langue d'origine est compilée dans le firmware : elle ne se supprime pas, et garantit que
    l'interface affiche toujours quelque chose, quoi qu'il arrive aux autres langues. Elle dépend
    de votre appareil :

    - **l'anglais** sur une [carte générique](../systeme/led-de-statut.md#boitier-ou-carte-generique) ;
    - **le français** sur l'un de mes [boîtiers officiels](../../materiel/boitiers-officiels.md).

## La fenêtre

La colonne de gauche rappelle la **Langue active**, ou la **Langue choisie** quand vous en
sélectionnez une autre. À droite, le compteur (`2/3 installées`, par exemple) puis une tuile par
langue proposée, avec son nom dans la langue elle-même et en anglais :

| Badge | Sens |
|---|---|
| **Active** | la langue affichée en ce moment |
| **Installée** | présente sur l'appareil, prête à être utilisée |
| **En attente** | choisie pour plus tard, voir [Si le navigateur n'a pas Internet](#hors-ligne) |
| *(aucun, bordure pointillée)* | proposée au téléchargement |

Une langue se sélectionne d'un clic sur sa tuile ; le pied de la fenêtre propose alors l'action
qui lui correspond. Quand trois langues sont déjà installées, un message le signale et les langues
à télécharger sont grisées : supprimez-en une d'abord.

## Changer de langue active

Sélectionnez une langue **Installée**, puis `Utiliser`. Comme le rappelle le pied de la fenêtre, la
langue choisie s'applique après un rechargement de la page.

## Installer une nouvelle langue

Sélectionnez une langue sans badge, puis `Télécharger` : une barre de progression s'affiche sur sa
tuile, puis la langue est installée et activée. Ne fermez pas la fenêtre pendant l'opération.

C'est **votre navigateur** qui télécharge le fichier de langue sur GitHub, puis l'envoie à
l'appareil : l'appareil lui-même ne se connecte pas à Internet. Le fichier est pris à **la version
du firmware installé**, pour que la traduction corresponde exactement à votre interface, et à
défaut dans la dernière version du projet.

### Si le navigateur n'a pas Internet { #hors-ligne }

Quand le navigateur n'atteint pas GitHub (téléphone connecté au
[point d'accès de secours](../../../aide/point-d-acces.md), par exemple), la tuile de la langue
propose deux solutions :

* **Ouvrir le fichier sur GitHub** : un lien vers le fichier de langue du projet. Ouvrez-le avec un
  appareil qui a Internet, enregistrez le fichier, puis déposez-le dans la zone d'import qui
  s'affiche juste en dessous.
* `Appliquer dès que possible` : la langue passe **En attente**. Le premier navigateur qui ouvrira
  l'interface avec un accès à Internet, hors point d'accès de secours, la téléchargera et
  l'appliquera ; un message le confirme au chargement suivant. `Annuler la mise en attente`
  retire ce choix.

## Importer un fichier { #importer-un-fichier-manuellement }

La zone **Choisir un pack de langue (ex. fr.json)**, sous les tuiles, accepte un fichier `.json` ou
`.json.gz` que vous avez récupéré vous-même. La page se recharge à la fin de l'import.

| Où le trouver | Fichier |
|---|---|
| Le lien **Ouvrir le fichier sur GitHub** de la fenêtre, ou le dossier `locales` du [dépôt du projet](https://github.com/xkain/TESTRTS/tree/main/locales) | `<code>.json` (par exemple `de.json`) |
| Les fichiers joints d'une [release](https://github.com/xkain/TESTRTS/releases) | `translation_<version>_<code>.json.gz` |

Dans le dossier `locales`, ouvrez le fichier de la langue voulue, puis utilisez le bouton de
téléchargement de GitHub (**Download raw file**).

!!! tip "Créer et proposer une nouvelle langue"

    Cette même méthode d'import permet de tester votre propre traduction. Partez d'un fichier de
    langue existant (même structure de clés, seules les valeurs changent), traduisez-le, puis
    importez-le pour vérifier le rendu dans l'interface, sans reflasher.

    Vous pouvez ensuite le **proposer au projet par une *pull request*** sur GitHub, en ajoutant
    votre fichier dans le dossier `locales` du dépôt.

## Supprimer une langue installée

Sélectionnez une langue **Installée** autre que la langue active, puis `Supprimer`. La langue
d'origine n'a pas ce bouton.
