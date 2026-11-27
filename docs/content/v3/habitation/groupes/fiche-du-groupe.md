# La fiche du groupe

Un clic sur la tuile d'un groupe, dans la page [Groupes](index.md), ouvre sa fiche. On y commande
le groupe, on change ses réglages, on lui ajoute ou retire des équipements et on gère ses
plannings. Elle se lit en un bandeau et trois onglets : **Général**, **Équipements** et
**Plannings**.

![Fiche d'un groupe, onglet Général](v3/img/groupes-fiche){ .on-glb }

## Le bandeau

Le bandeau est à gauche sur ordinateur, en haut de la page sur tablette et téléphone (sous
1000 px).

| Élément | Contenu |
|---|---|
| **Titre** | **Groupe** |
| **Sous-titre** | la pièce et le nombre de membres : *Salon · 3 équipement(s) associé(s)* |
| **Commandes** | `Ouvrir`, **My**, `Fermer` et `Télécommande` |
| **Pastilles** | la pièce, puis le protocole, la longueur de trame et l'ID : *RTS · 56 bits · ID 123456* |
| **Aide** | le bouton **?** (*Aide sur cette page*) ouvre cette page de documentation |

Les commandes envoient une seule trame, avec l'adresse du groupe (voir
[Ce qu'est un groupe](index.md#principe)). `Télécommande` ouvre la
[télécommande virtuelle](../equipements/telecommande-virtuelle.md) du groupe. Les quatre boutons
sont grisés tant que le groupe n'a aucun membre.

Le sous-titre et les pastilles suivent les champs de l'onglet **Général** pendant la saisie, avant
même l'enregistrement. Sur tablette et téléphone, les pastilles sont masquées.

## Enregistrer { #enregistrer }

Les champs de l'onglet **Général** ne s'appliquent pas tout de suite. Dès qu'un champ change, il
est marqué et une barre d'enregistrement apparaît : *n modification(s) non enregistrée(s)*, la
liste des changements (*Nom : Salon → Séjour*), `Annuler` qui remet les valeurs enregistrées, et
`Enregistrer`.

Avant d'enregistrer, l'interface vérifie :

| Vérification | Message |
|---|---|
| **Nom** de 1 à 20 caractères | *Vous devez fournir un nom pour l'équipement compris entre 1 et 20 caractères.* |
| **ID Groupe** entre 1 et 16777215 | *L'adresse de la télécommande doit être un nombre compris entre 1 et 16777215. Ce nombre doit être unique pour tous les équipements.* |
| **ID Groupe** libre | *L'ID est déjà celui de l'équipement « nom ».* ou *… du groupe « nom ».*, suivi de *Chaque équipement et chaque groupe doit avoir son propre ID, sinon les deux répondent à la même commande.* |

Un enregistrement réussi affiche *Enregistré avec succès*.

Quitter la fiche avec des modifications en attente demande confirmation : **Modifications non
enregistrées** — *Si vous quittez maintenant, vos modifications seront perdues.* —, avec
`Quitter sans enregistrer` et `Rester sur la page`.

Les onglets **Équipements** et **Plannings** ne passent pas par cette barre : chaque appairage,
retrait ou planning est enregistré à sa propre confirmation.

## Général { #general }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Nom et pièce** | **Nom** (20 caractères au plus) et **Pièce**. `Ajouter Pièce` crée une pièce sans quitter la fiche et la choisit (voir [Pièces](../pieces.md#depuis-une-fiche)) |
| **Comportement** | **Commandes inversées**, **Répéter commandes**, **Retour lumineux** |
| **Communication** | **Protocole**, **Bit**, **ID Groupe** |
| **Zone sensible** | **Code Tournant** et la suppression du groupe |

### Comportement

| Réglage | Effet |
|---|---|
| **Commandes inversées** | `Oui` / `Non` : *Inverse la direction des commandes*. Haut et Bas sont échangés dans la trame du groupe, pour tous ses membres à la fois |
| **Répéter commandes** | de *1 fois* à *7 fois* : le nombre d'émissions de chaque commande du groupe. À augmenter si un membre éloigné ne répond pas toujours |
| **Retour lumineux** | `Oui` / `Non` : *Fait clignoter la LED de statut une fois par commande de groupe*, et non une fois par membre. Présent seulement si une LED d'état est configurée sur l'appareil |

### Communication

| Réglage | Contenu |
|---|---|
| **Protocole** | `RTS`, `RTW` ou `RTV` |
| **Bit** | `56-BIT` ou `80-BIT` |
| **ID Groupe** | l'adresse radio du groupe, de 1 à 16777215 |

*Le groupe a sa propre adresse : chaque équipement appairé l'a apprise. La changer oblige à les
appairer de nouveau.*

### Zone sensible

| Élément | Effet |
|---|---|
| **Code Tournant** | *Dernier code envoyé : n.* *Chaque commande l'augmente ; les moteurs ignorent un code plus ancien que le dernier reçu. À n'utiliser que pour reprendre le code d'un autre appareil.* Saisir une valeur de 0 à 65535 active `Définir…` |
| `Définir…` | demande **Définir le code tournant du groupe ?** — *Le code passera de ancien à nouveau. S'il est plus bas que celui connu des moteurs, ils ignoreront le groupe jusqu'à ce que le compteur le dépasse ou jusqu'à un nouvel appairage.* —, puis l'applique avec `Appliquer`, hors de la barre d'enregistrement |
| `Supprimer le groupe…` | *Supprimer le groupe ne supprime pas ses équipements : ils restent pilotables un par un. Retirez-les d'abord du groupe.* Voir [Supprimer le groupe](#supprimer) |

## Équipements { #devices }

*Appairer un équipement au groupe lui apprend l'adresse du groupe : il doit être à portée, et
l'opération passe par sa mémoire (Prog).*

![Fiche d'un groupe, onglet Équipements](v3/img/groupes-fiche-devices){ .on-glb }

La liste commence par la tuile `Associer un Équipement` (*Choisir, puis appairer pas à pas*).
Suit une tuile par membre :

| Zone | Contenu |
|---|---|
| **Icône** | celle de son type |
| **Menu ⋮** (**Options**) | `Retirer du groupe` |
| **Nom** | le nom de l'équipement et son type |
| **Pied** | *appairé* et l'ID de l'équipement |

Un clic sur la tuile d'un membre ouvre la fiche de cet [équipement](../equipements/index.md).

Les deux procédures ci-dessous s'ouvrent dans la même fenêtre que l'assistant de création, avec
ses étapes à gauche sur ordinateur et en bandeau sur tablette et téléphone. Le menu ⋮ de la
colonne y propose aussi le **Mode expert** (voir
[Créer un groupe](creer-un-groupe.md#mode-expert)). Si un membre a été ajouté ou retiré, la
fiche se recharge à la fermeture.

### Associer un équipement { #associer }

Seuls les équipements qui ne sont pas encore dans **ce** groupe sont proposés : un équipement peut
appartenir à plusieurs groupes. S'il n'en reste aucun : *Aucun équipement disponible à associer à
ce groupe.*

La fenêtre **Associer un Équipement** compte trois étapes. L'exemple ajoute *Évier* au groupe
*Séjour*.

1. **Équipement.** **Quel équipement appairer à ce groupe ?** — *Seuls ceux qui ne sont pas
    encore dans « nom » sont proposés.* Un clic choisit l'équipement, puis `Continuer`.

    ![Étape 1 : choisir l'équipement à appairer](v3/img/groupes-associer-1){ .on-glb }

2. **Mémoire.** **Ouvrir la mémoire de « nom »**, tuile **Appui long sur Prog** :
    `Ouvrir la mémoire`, puis la question du va-et-vient, comme dans
    l'[assistant](creer-un-groupe.md#appairage). `Continuer` reste grisé tant que la mémoire
    n'est pas ouverte (*Ouvrez la mémoire pour continuer*) ; `Retour` revient au choix.

    ![Étape 2 : ouvrir la mémoire de l'équipement](v3/img/groupes-associer-2){ .on-glb }

3. **Appairage.** **Appairer « nom » au groupe**, tuile **Appui long sur Prog du groupe** :
    maintenir `Maintenir pour appairer`, relâcher au va-et-vient, puis `Oui, il est appairé`. Le
    message devient *« nom » répond au groupe*.

    ![Étape 3 : appairer l'équipement au groupe](v3/img/groupes-associer-3){ .on-glb }

L'équipement est enregistré comme membre dès `Oui, il est appairé`. `Terminer` ferme la fenêtre
(*« nom » ajouté au groupe*).

### Retirer un équipement { #retirer }

`Retirer du groupe`, dans le menu ⋮ d'un membre, ouvre une fenêtre de deux étapes. Retirer n'est
pas un simple effacement : le moteur doit oublier l'adresse du groupe, sinon il continuerait d'y
répondre.

| Étape | Ce qu'on y fait |
|---|---|
| **Mémoire** | *ESPSomfy-RTS envoie un appui long sur Prog avec l'adresse de cet équipement. Son moteur doit faire un bref va-et-vient : il est alors prêt à oublier l'adresse du groupe.* Mêmes boutons et mêmes réponses que pour l'appairage |
| **Retrait** | **Retirer nom du groupe**, tuile **Appui court sur Prog du groupe** : *Le groupe envoie un appui court sur Prog avec sa propre adresse : le moteur oublie le groupe et fait un nouveau va-et-vient.* Un clic sur `Retirer du groupe`, puis **« nom » a-t-il refait un va-et-vient ?** : `Oui, il est retiré` ou `Non, réessayer` |

L'équipement quitte la liste des membres dès `Oui, il est retiré` (*« nom » ne répond plus au
groupe*). `Terminer` ferme la fenêtre (*« nom » retiré du groupe*).

!!! tip "Si le moteur ne répond plus"

    `J'ai ouvert la mémoire autrement` permet d'ouvrir la mémoire avec la télécommande d'origine
    de l'équipement (appui long sur Prog), puis de poursuivre.

### Des membres de types différents

La fiche n'avertit pas d'un groupe qui mêle des types d'équipements. La différence se voit
ailleurs :

* dans la fenêtre d'un [planning](../plannings.md) visant le groupe, une note prévient que les
  membres sans **Ma position** ignoreront cette action (*ex : portes de garage*), et que ceux sans
  inclinaison ignoreront une **Inclinaison seule** ;
* une position en pourcentage est envoyée à chaque membre séparément, chacun selon sa propre
  course.

## Plannings { #schedules }

L'onglet reprend les tuiles de la page [Plannings](../plannings.md), limitées aux programmations
qui visent ce groupe. La tuile `Ajouter une programmation` vient en tête, avec le nombre
d'horaires encore disponibles sur l'appareil (*n horaire(s) restant(s)*) ; elle est grisée quand
il n'en reste aucun.

![Fiche d'un groupe, onglet Plannings](v3/img/groupes-fiche-schedules){ .on-glb }

Un clic ouvre la fenêtre de programmation, avec ce groupe comme cible imposée. La fiche reste
ouverte derrière, avec ses modifications en cours (voir
[Plannings](../plannings.md#ailleurs)).

## Supprimer le groupe { #supprimer }

`Supprimer le groupe…`, dans la tuile **Zone sensible**, suit les mêmes règles que le menu ⋮ de
la liste :

| Cas | Ce qui se passe |
|---|---|
| Le groupe a encore des membres | refus : *Vous ne pouvez pas supprimer ce groupe tant que tous les équipements n'en ont pas été retirés.* Retirez-les un par un dans l'onglet [Équipements](#retirer) |
| Le groupe est vide | **Supprimer « nom » ?** — *Cette action est définitive.* —, avec *n horaire(s) qui le visent seront aussi supprimés.* s'il est la cible de plannings. `Supprimer le groupe` le supprime et ramène à la liste |

!!! note "Une fiche vierge"

    L'adresse de la fiche d'un nouveau groupe reste joignable directement : la fiche s'ouvre
    alors sous le titre **Créer un groupe** (*Enregistrer les paramètres de base pour créer
    votre groupe*), sans commandes, sans onglets ni **Zone sensible**. Le chemin normal reste
    l'[assistant](creer-un-groupe.md).

## Pages liées

* [Groupes](index.md)
* [Créer un groupe](creer-un-groupe.md)
* [Équipements](../equipements/index.md)
* [Pièces](../pieces.md)
* [Plannings](../plannings.md)
* [Tableau de bord](../../tableau-de-bord/index.md)
* [Entités Home Assistant](../../../home-assistant/entites.md)
