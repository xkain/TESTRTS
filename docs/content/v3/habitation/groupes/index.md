# Groupes

Un groupe commande plusieurs équipements d'un seul geste. La page **Groupes** les liste, permet
d'en créer et ouvre la fiche de chacun. Elle se lit en un bandeau, une barre d'outils et une liste
de tuiles.

![Page Groupes](v3/img/groupes-page){ .on-glb }

## Ce qu'est un groupe { #principe }

Un groupe a **sa propre adresse radio**, comme une télécommande de plus. Chaque moteur du groupe
apprend cette adresse **en plus** de la sienne et de celles de ses télécommandes : c'est
l'appairage au groupe, qui se fait équipement par équipement avec le bouton Prog (voir
[Créer un groupe](creer-un-groupe.md)).

Une commande du groupe part alors en **une seule trame**, avec l'adresse du groupe, et tous les
moteurs qui la connaissent la reçoivent en même temps.

| Commande | Ce que l'appareil envoie |
|---|---|
| `Ouvrir`, **My**, `Fermer` (fiche, tableau de bord, télécommande virtuelle) | une seule trame, avec l'adresse du groupe ; l'appareil met ensuite à jour l'état de chaque membre |
| Une position en pourcentage (planning, Home Assistant) | une commande **par membre**, chacun avec sa propre adresse : chaque équipement part de sa position et rejoint la cible pour son compte |

Le réglage **Commandes inversées** du groupe vaut pour **tout le groupe** : il échange Haut et Bas
dans la trame du groupe. Il n'existe pas de réglage d'inversion par membre.

Un même équipement peut appartenir à plusieurs groupes. Un équipement qui appartient à un groupe
ne peut pas être supprimé : retirez-le d'abord du groupe.

!!! note "Des adresses toujours uniques"

    Chaque équipement et chaque groupe doit avoir son propre ID : sinon les deux répondent à la
    même commande. L'interface refuse un ID déjà pris, en nommant l'équipement ou le groupe qui
    le porte.

**14 groupes** au plus. Un groupe peut réunir tous vos équipements.

## Le bandeau

Le bandeau est à gauche sur ordinateur, en haut de la page sur tablette et téléphone (sous
1000 px).

| Élément | Contenu |
|---|---|
| **Surtitre** | *Habitation* |
| **Titre** | **Groupes** |
| **Description** | *Un groupe commande plusieurs équipements d'un seul geste, avec sa propre adresse radio.* |
| **Jauge** | les groupes créés, *n sur 14*, et *N places libres* (*1 place libre* au singulier), avec une barre de remplissage, orange quand les 14 places sont prises |
| **Aide** | le bouton **?** (*Aide sur cette page*) ouvre cette page de documentation |

Tant que la liste est vide, les outils et le menu ⋮ du bandeau sont masqués.

Ce que montre le bandeau dépend de l'écran :

| Écran | Bandeau | Outils (recherche, tri, filtre) |
|---|---|---|
| **Ordinateur** | surtitre, titre, description, jauge complète | barre au-dessus de la liste ; le filtre est derrière un bouton ⋮ (`Filtrer`) au bout de la barre |
| **Tablette** (768 à 999 px) | sur une ligne : icône, titre et jauge ; surtitre et description masqués | comme sur ordinateur |
| **Téléphone** (sous 768 px) | icône, jauge réduite à *n sur 14* (sans les places libres) et un bouton ⋮ (`Rechercher et trier`) ; le titre est masqué | dans le panneau qu'ouvre le ⋮ du bandeau : recherche, **Trier**, puis les filtres à plat |

Une pastille sur le ⋮ signale qu'un réglage masque une partie de la liste : sur le ⋮ du bandeau
(téléphone) quand une recherche ou un filtre est actif, sur le ⋮ `Filtrer` (ordinateur, tablette)
quand un filtre autre que **Toutes** est choisi.

## Rechercher, trier, filtrer { #outils }

| Outil | Effet |
|---|---|
| **Recherche** (*Rechercher un groupe…*) | garde les groupes dont le nom, la pièce ou le nom d'un membre contient le texte tapé |
| **Tri** `A → Z` | une seule liste, dans l'ordre alphabétique des noms |
| **Tri** `Par pièce` | les groupes rangés sous un intertitre par pièce (nom de la pièce, nombre de groupes), pièces dans l'ordre du tableau de bord, Accueil en tête ; sous chaque pièce, l'ordre alphabétique. Sans aucune pièce créée, pas d'intertitre |
| **Filtre** **Pièces** | `Toutes`, puis chaque pièce qui contient au moins un groupe, chacune avec son nombre |

Le tri choisi est retenu par le navigateur. Par défaut, c'est `A → Z`. Un second clic sur le
filtre actif revient à `Toutes`.

Si la recherche et le filtre ne laissent rien, la liste affiche **Rien ne correspond** — *Videz la
recherche ou choisissez un autre filtre.* — et un bouton `Tout afficher` qui efface les deux.

## La liste { #liste }

### Liste vide

Sans aucun groupe, la page affiche **Aucun groupe pour l'instant** — *Réunissez plusieurs
équipements dans un groupe pour les commander d'un seul geste.* — et la seule tuile d'ajout.

### La tuile d'ajout

Toujours en tête de liste : `Ajouter Groupe`, avec *Choisissez ensuite ses équipements* (ce
sous-titre est masqué sur téléphone). Elle ouvre l'assistant
[Créer un groupe](creer-un-groupe.md).

| Cas | Ce qui se passe |
|---|---|
| Les 14 groupes existent déjà | la tuile est grisée |
| Aucun équipement n'existe | l'assistant s'ouvre, mais s'arrête au choix des équipements : *Aucun équipement à ajouter : créez d'abord un équipement.* |

### La tuile d'un groupe

| Zone | Contenu |
|---|---|
| **Icônes** | celles du type des trois premiers membres, suivies de *+n* au-delà ; l'icône des groupes tant qu'il n'a aucun membre |
| **Menu ⋮** (**Options**) | `Supprimer` |
| **Nom** | le nom du groupe, et dessous le nombre de membres : *n équipement(s)* |
| **Pied** | la pièce du groupe (*Accueil* s'il n'est rangé nulle part) et son ID radio |

Un clic sur la tuile ouvre la [fiche du groupe](fiche-du-groupe.md). Si une autre fiche a des
modifications non enregistrées, l'interface demande d'abord confirmation.

### Supprimer un groupe { #supprimer }

`Supprimer`, dans le menu ⋮ de la tuile, fait la même chose que le bouton
`Supprimer le groupe…` de la fiche :

| Cas | Ce qui se passe |
|---|---|
| Le groupe a encore des membres | refus : *Vous ne pouvez pas supprimer ce groupe tant que tous les équipements n'en ont pas été retirés.* |
| Le groupe est vide | confirmation **Supprimer « nom » ?** — *Cette action est définitive.* —, avec en plus *n horaire(s) qui le visent seront aussi supprimés.* s'il est la cible de plannings ; le bouton `Supprimer le groupe` le supprime |

Retirer les membres passe par une vraie commande radio à chaque moteur, pour qu'il oublie
l'adresse du groupe (voir [Retirer un équipement](fiche-du-groupe.md#retirer)). Supprimer le
groupe ne supprime pas ses équipements.

## Pour aller plus loin

* [Créer un groupe](creer-un-groupe.md) : l'assistant, du nom à l'appairage de chaque équipement.
* [La fiche du groupe](fiche-du-groupe.md) : ses réglages, ses membres et ses plannings.

## Pages liées

* [Équipements](../equipements/index.md)
* [Pièces](../pieces.md)
* [Plannings](../plannings.md)
* [Tableau de bord](../../tableau-de-bord/index.md) : la colonne **Groupes** et la carte de chaque
  groupe
* [Entités Home Assistant](../../../home-assistant/entites.md) : un groupe y devient un appareil
  avec son entité `cover`
