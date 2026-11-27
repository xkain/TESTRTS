# Pièces

Les pièces rangent vos équipements et vos groupes en sections sur le
[tableau de bord](../tableau-de-bord/index.md). Une pièce n'a qu'un nom : ce qu'elle contient,
c'est la pièce choisie sur chaque équipement et chaque groupe. Un élément n'est que dans une pièce
à la fois.

![Page Pièces](v3/img/pieces-page){ .on-glb }

Ranger par pièce permet aussi des noms courts : dans la pièce **Cuisine**, un équipement peut
s'appeler simplement *Évier* plutôt que *Volet cuisine évier*, les noms étant limités à 20
caractères.

## La pièce Accueil

Tout ce qui n'est rangé dans aucune pièce est dans **Accueil**. Cette pièce existe toujours, ne se
renomme pas et ne se supprime pas : elle n'apparaît donc pas dans la liste.

## Le bandeau

Le bandeau, à gauche sur ordinateur et en haut de la page sur tablette et téléphone, porte le
surtitre *Habitation*, le titre **Pièces**, la description *Les pièces rangent équipements et
groupes en sections sur le tableau de bord.* et la jauge : *n sur 30* et les places libres. Sur
tablette et téléphone, la description disparaît ; sur téléphone, la recherche et le filtre passent
derrière le bouton ⋮ du bandeau.

**30 pièces** au plus, sans compter Accueil.

## Rechercher et filtrer { #outils }

| Outil | Effet |
|---|---|
| **Recherche** (*Rechercher une pièce…*) | garde les pièces dont le nom contient le texte tapé |
| **Filtre** **Contenu** | `Toutes`, `Avec contenu` ou `Vides`, chacun avec son nombre |

Les pièces sont toujours rangées dans l'ordre alphabétique. Leur ordre sur le tableau de bord se
règle ailleurs, dans la fenêtre **Ordre du tableau de bord** (voir
[Tableau de bord](../tableau-de-bord/index.md)).

## La liste { #liste }

Sans aucune pièce, la page affiche **Aucune pièce pour l'instant** — *Créez des pièces pour ranger
vos équipements et groupes par zone sur le tableau de bord.*

La liste commence par la tuile `Ajouter Pièce` (*Un nom suffit*), grisée quand les 30 places sont
prises. Suit une tuile par pièce : son nom, le nombre d'équipements et de groupes qu'elle contient,
et un menu ⋮ avec `Supprimer`. Un clic sur la tuile ouvre la fenêtre de la pièce.

## La fenêtre d'une pièce { #fenetre }

![Fenêtre Ajouter une pièce, deux éléments cochés](v3/img/pieces-fen-ajouter){ .on-glb }

La même fenêtre sert à créer et à modifier : **Ajouter une pièce** (*Un nom suffit. Vous pouvez y
ranger tout de suite des équipements et des groupes.*) ou **Modifier la pièce**.

| Élément | Contenu |
|---|---|
| **Nom** | de 1 à 20 caractères (*Entrer un nom de pièce*). À la création, huit suggestions le remplissent d'un clic : Salon, Cuisine, Chambre, Bureau, Terrasse, Garage, Extérieur, Jardin |
| **Dans cette pièce** | tous vos équipements et groupes, à cocher : *Cochez pour ranger ici. Un élément n'est que dans une pièce à la fois.* Sous chaque nom, son type et ce qui va se passer : *Ici*, *Viendra ici*, *Quittera Salon*, *Dans Cuisine*, *Retourne dans Accueil* |
| **Côté de la fenêtre** | à la création, le nombre de pièces sur 30 ; en modification, le contenu (*n équipement(s) · n groupe(s)*), qui suit les cases cochées |

Le pied de la fenêtre résume l'effet avant d'enregistrer : *Donnez-lui un nom pour continuer.*,
*n élément(s) y seront rangés*, *Vous pourrez y ranger des équipements plus tard.*, *n
modification(s) à enregistrer* ou *Aucune modification*. Le bouton principal reste grisé tant qu'il
n'y a pas de nom, ou rien à enregistrer.

| Bouton | Effet |
|---|---|
| `Créer` | crée la pièce, puis y range les éléments cochés |
| `Enregistrer` | enregistre le nom et les éléments déplacés ; un élément décoché retourne dans Accueil |
| `Supprimer` | en modification : supprime la pièce, après confirmation |
| `Annuler` (à la création) ou la croix | ferme ; s'il y a des modifications, l'interface demande confirmation |

### Créer une pièce depuis une fiche { #depuis-une-fiche }

Le bouton **+** à côté du choix de la pièce, dans la fiche d'un
[équipement](equipements/index.md) ou d'un [groupe](groupes/index.md), ouvre la même fenêtre,
réduite au nom : *« … » rejoindra cette pièce dès sa création. Sa fiche reste ouverte derrière, avec
ses modifications en cours.* `Créer et choisir` crée la pièce et la sélectionne dans la fiche.

## Supprimer une pièce { #supprimer }

Par le menu ⋮ de la tuile ou le bouton `Supprimer` de la fenêtre. La confirmation le rappelle :
*Les équipements et groupes qu'elle contient passent dans la pièce « Accueil ».* Rien d'autre n'est
supprimé.

## Pages liées

* [Tableau de bord](../tableau-de-bord/index.md)
* [Équipements](equipements/index.md)
* [Groupes](groupes/index.md)
* [Entités Home Assistant](../../home-assistant/entites.md) : la pièce devient la zone proposée dans
  Home Assistant
