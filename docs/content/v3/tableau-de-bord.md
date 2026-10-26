# Tableau de bord

Le **tableau de bord** est l'écran principal de l'interface, qui remplace la [page d'accueil](accueil.md) dès qu'un élément existe. Il montre vos équipements et vos groupes sous forme de **cartes** : on y commande,
on y suit l'état, et un clic sur une flèche déplie le détail.

![Tableau de bord 1](v3/img/tableau-de-bord-1){ .on-glb }

Les réglages de confort (en-tête mobile, indicateur d'activité, disposition) sont dans
[Réglages du tableau de bord](general/tableau-de-bord.md).

## Les pièces

Les équipements sont **regroupés par pièce**, avec un **ratio par pièce**. Sur grand écran, la **barre des pièces** porte le **résumé
« ouverts / en mouvement »**, qui **suit la pièce sélectionnée** et reste visible même **sans
pièces** : vous pouvez donc voir tout de suite si un groupe ou un équipement est en mouvement.

## Une carte de groupe

Une carte de groupe affiche le **ratio d'ouverture** du groupe, et trois boutons : **Ouvrir**,
**My** et **Fermer**.

Si **au moins un des équipements du groupe** a le **capteur soleil** activé, un bouton **soleil**
apparaît à côté de ces boutons. Il est allumé quand le mode soleil est
actif ; il permet aussi de désactiver d'un coup le mode soleil de tous les équipements du groupe.

![Tableau de bord 2](v3/img/tableau-de-bord-2){ .on-glb }

### La vue dépliée

Un clic sur la **zone supérieure** de la carte de groupe (l'icône ou le nom) la déplie ; la flèche
à droite la referme.

![Tableau de bord 3](v3/img/tableau-de-bord-3){ .on-glb }

| Bloc | Contenu |
|---|---|
| **Équipements associés au groupe** | un rang par membre : son **icône** (qui suit sa position en direct), son **nom** (avec une petite icône **soleil** si ce membre a le drapeau soleil activé), sa **barre de position** et son **pourcentage**. |
| **Plannings** | les plannings du groupe, avec un bouton pour **en ajouter un rapidement** : voir [Plannification](somfy/equipements/plannification.md) |
| **Télécommande** | ouvre la [télécommande virtuelle](somfy/telecommande-virtuelle.md) du groupe |
| **Modifier** | ouvre la **page d'édition du groupe** : voir [Groupes](somfy/groupes/index.md) |

!!! note "La vue dépliée se referme au rechargement"

    Les cartes dépliées ne sont **pas mémorisées** : si la page se recharge (actualisation du
    navigateur, par exemple), toutes les cartes reviennent fermées.

## Une carte d'équipement

### La carte fermée

Une carte d'équipement affiche une icône qui **reflète sa position en direct** (pour un store
vénitien, ses lames tournent avec l'inclinaison), une **ligne d'état** et des **indicateurs**,
décrits ci-dessous.

![Tableau de bord 4](v3/img/tableau-de-bord-4){ .on-glb }

La **ligne d'état** indique :

- la **position** : **Ouvert**, **Fermé**, un **pourcentage**, ou **Ouverture… / Fermeture…**
  pendant le mouvement ;
- l'**inclinaison** (∠ et un pourcentage) pour les stores à lames ;
- la **position favorite**, en **My** suivi d'un pourcentage (par exemple *My 40 %*), quand elle
  est définie. Ce **badge My** peut être masqué carte par carte, depuis le panneau [Plus](#le-panneau-plus).

Les **indicateurs** n'apparaissent que lorsqu'ils servent : une icône **vent** (orange, qui
**pulse**) quand le capteur détecte du vent, une icône **soleil** (jaune) quand il détecte du soleil.

![Tableau de bord 5](v3/img/tableau-de-bord-5){ .on-glb }

Sous l'en-tête, la carte affiche la **zone de contrôle**, où l'on commande l'équipement. Un volet
se commande de **trois façons**, et un **petit sélecteur** à trois pastilles permet de passer de
l'une à l'autre :

![Tableau de bord 6](v3/img/tableau-de-bord-6){ .on-glb }
![Tableau de bord 7](v3/img/tableau-de-bord-7){ .on-glb }
![Tableau de bord 8](v3/img/tableau-de-bord-8){ .on-glb }

| Pastille | Ce qu'elle affiche |
|---|---|
| **Boutons** | les boutons **monter**, **My** et **descendre** |
| **Position** | un **curseur** pour amener l'équipement à la position voulue, et un bouton **My** |
| **Inclinaison** | un **curseur** pour orienter les lames, et un bouton **My** (stores à lames seulement) |

Si l'équipement a un **capteur soleil**, un bouton **soleil** s'ajoute à côté des boutons
**monter**, **My** et **descendre** : il active ou désactive le mode soleil, et il est allumé quand
celui-ci est actif. Sans capteur soleil, ce bouton n'apparaît pas.

### Les équipements sans sélecteur

Tous les équipements ne se commandent pas de ces trois façons. Les suivants n'ont **pas de petit
sélecteur** : leur carte ne montre que de **gros boutons**.

| Équipement | Ce que montre la carte |
|---|---|
| **Portail (1 bouton)** (à gauche, au centre ou à droite), **Porte de garage (1 bouton)**, **Interrupteur (1 bouton)** | **un seul gros bouton**, qui bascule à chaque appui |
| **Interrupteur (2 boutons)** | **deux gros boutons** : un pour chaque ordre (marche / arrêt, selon le type d'interrupteur) |

Ces équipements n'ont ni position ni position favorite : il n'y a donc ni curseur, ni bouton
**My**. Les autres équipements (volets, stores, rideaux, portails et portes de garage à 3 touches)
gardent le sélecteur.

Ce que la carte affiche en premier (les boutons, le curseur de position ou celui d'inclinaison) se
choisit dans le panneau [Plus](#le-panneau-plus).

### La carte dépliée

Un clic sur la **zone supérieure** de la carte (l'icône ou le nom) la déplie ; la flèche à droite
la referme. Comme pour un groupe, une carte dépliée se referme si la page se recharge.

| Ligne | Contenu |
|---|---|
| **Position favorite (My)** | la position enregistrée, avec un lien **Modifier** ; ou **Non définie** avec un lien **Définir**. Les deux ouvrent le panneau [Plus](#le-panneau-plus). Voir aussi [Position favorite](somfy/equipements/mise-en-service.md#la-position-favorite-touche-my) |
| **Inclinaison** | l'inclinaison actuelle, pour les stores à lames |
| **Dernière commande envoyée** | quelle commande, et depuis quand (« il y a 36 s »), ou « aucune depuis le démarrage » |
| **Capteurs** | l'état d'un capteur **soleil / vent** : *Soleil*, *Vent*, ou **Calme** |
| **Indicateur soleil** | si le drapeau soleil est **activé** ou **désactivé** (équipements avec capteur soleil) |
| **Plannings** | les plannings de l'équipement, avec un bouton pour **en ajouter un rapidement** : voir [Plannification](somfy/equipements/plannification.md) |
| **Télécommandes ou capteurs liés** | chacun avec son **adresse** et son **signal** en dBm (« — » tant qu'aucun signal n'a été reçu) : voir [Télécommandes liées](somfy/equipements/liaison-telecommande.md) |

Trois boutons terminent la carte :

| Bouton | Effet |
|---|---|
| **Télécommande** | ouvre la [télécommande virtuelle](somfy/telecommande-virtuelle.md) de l'équipement |
| **Modifier** | ouvre la **page d'édition de l'équipement** : voir [Équipements](somfy/equipements/index.md) |
| **Plus** | ouvre le panneau d'options de la carte, décrit ci-dessous |

### Le panneau « Plus » { #le-panneau-plus }

**Plus** ouvre un panneau **par-dessus la carte**, intitulé **Options**. Un clic en dehors du panneau,
ou le bouton **Fermer**, le referme.

![Tableau de bord 10](v3/img/tableau-de-bord-10){ .on-glb }

**Affichage**

- **Contrôle par défaut** : ce que la carte affiche en premier au chargement (**Boutons**,
  **Position** ou **Inclinaison**). Ce choix n'apparaît que si l'équipement se commande de
  plusieurs façons. Il s'applique immédiatement.
- **Afficher le badge « My »** : un interrupteur qui montre ou cache le *My 39 %* de la ligne
  d'état. Ce réglage n'apparaît que pour les équipements qui ont une position favorite.

!!! note "Ces deux réglages sont propres à votre navigateur"

    Ils sont mémorisés dans le **navigateur** que vous utilisez, pas dans l'appareil : un autre
    ordinateur ou un téléphone garde ses propres choix.

**Position favorite**

Ce bloc règle **My** sans passer par la télécommande. Il affiche, en regard de son titre, la
position actuellement enregistrée (ou **Non définie**), et propose :

- une **icône d'aperçu**, qui montre **en direct** la position choisie ;
- un curseur de **position** et, pour un store à lames, un curseur d'**inclinaison**
  (l'inclinaison seule pour un store à orientation seule). Chaque curseur affiche son pourcentage
  et le sens (**Fermé** ou **Ouvert**) ;
- **Position actuelle** : reprend la position où l'équipement se trouve, pour la régler d'après
  ce que vous voyez ;
- **Définir « My » position** : enregistre les valeurs des curseurs. Quand elles sont **identiques
  à la position déjà enregistrée**, le bouton devient **Effacer « My » position** et supprime la
  position favorite.

Ce bloc n'existe que pour les types d'équipement qui ont une position favorite.
