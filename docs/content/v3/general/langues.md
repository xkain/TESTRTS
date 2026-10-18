# Gérer les langues

Un véritable gestionnaire de packs de langue, pas un simple sélecteur. Depuis **Général**, le
bouton **Gérer les langues** l'ouvre — voir [Général](index.md).

!!! note "Note"

    La langue d'origine embarquée dans le firmware n'est jamais supprimable — c'est le filet de
    sécurité qui garantit que l'interface affiche toujours quelque chose, quoi qu'il arrive aux
    autres packs.

## La liste des langues

Une ligne par langue disponible, avec un badge d'état :

* **Active** : c'est la langue actuellement affichée.
* **Installée** : le pack est présent sur l'appareil, prêt à être utilisé.
* **En attente** : un téléchargement a été mis en file, voir plus bas.

## Changer de langue active

Bouton **Utiliser** sur une langue déjà installée — bascule l'interface dessus
immédiatement.

## Installer une nouvelle langue

Bouton **Télécharger** sur une langue pas encore installée : le pack est récupéré depuis
GitHub, avec une barre de progression par ligne.

### Si l'appareil n'a pas d'accès Internet

Deux filets de secours, dans l'ordre :

1. **Relais par le navigateur** : la page tente de télécharger le pack elle-même (puisque
    *votre* ordinateur a probablement un accès Internet, même si l'appareil n'en a pas) et de
    le transmettre à l'appareil.
2. **Si ça échoue aussi** (par exemple l'appareil est en point d'accès isolé) : l'interface
    bascule sur un import manuel, avec un lien direct **Ouvrir le fichier sur GitHub** à
    télécharger puis réimporter (voir plus bas), ou l'option **Appliquer dès que possible** —
    la langue est alors marquée **En attente** et sera récupérée automatiquement dès que
    l'appareil retrouvera un accès Internet. **Annuler la mise en attente** retire cette file
    d'attente si vous changez d'avis.

## Importer un fichier manuellement

**Importer un fichier de langue (.json, .json.gz)** accepte un fichier que vous avez
téléchargé vous-même — utile en dernier recours, ou si vous préférez ne pas dépendre du
téléchargement automatique.

!!! tip "Astuce"

    **Créer et proposer une nouvelle langue** : cette même méthode d'import permet de tester
    votre propre traduction avant de la proposer au projet. Partez d'un fichier de langue
    existant comme modèle (même structure de clés, seules les valeurs changent), traduisez-le,
    puis importez-le ici pour vérifier le rendu directement dans l'interface — aucun besoin de
    reflasher ou de recompiler. Une fois satisfait du résultat, vous pouvez soumettre votre
    fichier pour qu'il soit intégré officiellement au projet et proposé à tous les
    utilisateurs.

## Supprimer une langue installée

Bouton **Supprimer** sur chaque langue installée (sauf la langue d'origine du firmware, qui
reste toujours disponible).

