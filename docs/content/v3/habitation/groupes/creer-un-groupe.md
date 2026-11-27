# Créer un groupe

La tuile `Ajouter Groupe` de la page [Groupes](index.md) ouvre l'assistant **Créer un groupe**. Il
mène en quatre étapes du nom du groupe à l'appairage de chacun de ses équipements, puis à ses
options. Le groupe est **créé dès la fin de la deuxième étape** : l'appairage a besoin de son
adresse.

Si les 14 groupes existent déjà, l'assistant ne s'ouvre pas : *Limite maximale de groupes
atteinte. Veuillez en supprimer un avant d'en créer un nouveau.*

## La fenêtre

| Zone | Contenu |
|---|---|
| **Colonne d'identité** | le titre **Créer un groupe**, le nom saisi (*Nouveau groupe* tant qu'il est vide) et *N équipement(s)* |
| **Étapes** | **Nom et pièce**, **Équipements**, **Appairage**, **Options**, chacune avec son résumé : le nom (ou *À choisir*), *N choisi(s)*, *N sur T* appairés, *Sens et portée* |
| **Pied** | l'indication de ce qui manque pour continuer, puis les boutons de l'étape |

La disposition dépend de l'écran : sur ordinateur, les étapes sont listées dans la colonne de
gauche ; sur tablette, elles passent en bandeau au-dessus du contenu, réduites à leur nom ; sur
téléphone, la fenêtre occupe tout l'écran et le bandeau ne garde que *Étape N sur 4 · nom de
l'étape* et une barre d'avancement.

Tant que le groupe n'est pas créé, `Annuler` (ou la croix) ferme l'assistant sans rien créer. Une
fois créé, ce bouton devient `Finir plus tard` : le groupe reste, avec les équipements déjà
appairés.

## Étape 1 : nom et pièce { #nom }

![Étape 1 : nom et pièce](v3/img/groupes-etape-1){ .on-glb }

**Le nom du groupe**

| Champ | Contenu |
|---|---|
| **Nom** | de 1 à 20 caractères (*Entrer un nom*) |
| **Pièce** | *Accueil* par défaut. `Ajouter Pièce` crée une pièce sans quitter l'assistant et la choisit (voir [Pièces](../pieces.md#depuis-une-fiche)). Dessous : *Le groupe a sa propre adresse radio, distincte de celle de chaque équipement.* |
| **Options avancées** | repliées ; leur titre résume le protocole, la longueur de trame et l'ID proposés (*RTS · 56 bits · ID 123456*). Dépliées : **Bit** (56 ou 80) et **ID Groupe** |

Le protocole et la longueur de trame proposés sont ceux de la radio de l'appareil ; l'ID est le
premier libre. Il n'y a en général rien à changer ici.

`Continuer` reste grisé tant que le nom est vide (*Donnez-lui un nom*).

## Étape 2 : les équipements { #equipements }

![Étape 2 : les équipements à réunir](v3/img/groupes-etape-2){ .on-glb }

**Quels équipements doit commander ce groupe ?** — *Chaque équipement coché sera appairé au groupe
à l'étape suivante, un par un. Vous pourrez en ajouter d'autres plus tard.*

Chaque équipement s'affiche avec son icône, son nom, son type et sa pièce. Un clic le coche ou le
décoche.

| Cas | Ce qui se passe |
|---|---|
| Un équipement n'est pas appairé | il est grisé, marqué *non appairé* : il ne peut pas rejoindre un groupe tant que son moteur ne le connaît pas |
| Aucun équipement n'existe | *Aucun équipement à ajouter : créez d'abord un équipement.* : l'assistant ne peut pas aller plus loin |
| Le premier équipement coché | la longueur de trame du groupe prend la sienne (56 ou 80 bits) |

`Continuer` reste grisé tant qu'aucun équipement n'est coché (*Choisissez au moins un
équipement*). `Retour` revient au nom.

`Continuer` **crée le groupe**. Avant, l'interface vérifie l'ID : un ID hors de 1 à 16777215, ou
déjà porté par un équipement ou un autre groupe, est refusé avec un message qui nomme son
propriétaire. Le groupe créé, il n'est plus possible de revenir aux deux premières étapes.

## Étape 3 : l'appairage { #appairage }

![Étape 3 : l'appairage, un équipement après l'autre](v3/img/groupes-etape-3){ .on-glb }

Les équipements cochés s'appairent **un par un**. Pour chacun, le titre est **Appairer nom**,
surmonté de *équipement I sur T*, et deux tuiles se suivent. Une tuile **Avancement** liste tous
les équipements avec leur état : *appairé*, *passé*, *en cours* ou *à faire*.

Gardez l'équipement en vue : le seul retour du moteur est un **bref va-et-vient**.

### 1. Ouvrir la mémoire de l'équipement

*ESPSomfy-RTS envoie un appui long sur Prog avec l'adresse de cet équipement. Son moteur doit
faire un bref va-et-vient : il est alors prêt à apprendre l'adresse du groupe.*

| Moment | Ce qui s'affiche |
|---|---|
| Avant l'envoi | le bouton `Ouvrir la mémoire` |
| Pendant l'envoi (quelques secondes) | *Ouverture de la mémoire…* |
| Après l'envoi | **« nom » a-t-il fait un va-et-vient ?** `Non` / `Oui` |
| Sur `Non` | *Le moteur n'a pas reçu l'appui. Vérifiez que « nom » est bien appairé et à portée, puis réessayez.* `Réessayer` relance l'appui ; `J'ai ouvert la mémoire autrement` passe à la suite, si vous avez ouvert la mémoire avec la télécommande d'origine (appui long sur Prog) |
| Sur `Oui` | *Mémoire ouverte* |

### 2. Appairer le groupe

*Maintenez le bouton : le groupe envoie Prog avec sa propre adresse jusqu'à ce que le moteur fasse
un nouveau va-et-vient. Relâchez dès qu'il bouge.*

Le bouton `Maintenir pour appairer` reste grisé tant que la mémoire n'est pas ouverte. Tant qu'il
est maintenu (souris ou doigt), le groupe répète Prog. Au relâchement :

**« nom » a-t-il refait un va-et-vient ?**

| Réponse | Effet |
|---|---|
| `Oui, il est appairé` | l'équipement est **enregistré comme membre** du groupe, tout de suite ; l'assistant passe au suivant |
| `Non, réessayer` | le bouton `Maintenir pour appairer` revient |

### Passer un équipement

`Passer cette étape` (dans le pied sur ordinateur, sous le contenu sur tablette et téléphone)
laisse l'équipement de côté, marqué *passé* : il ne fait pas partie du groupe.

`Continuer` reste grisé tant que chaque équipement n'a pas été appairé ou passé (*Appairez chaque
équipement, un par un*).

### Mode expert { #mode-expert }

Pendant l'appairage, un menu ⋮ dans le coin de la colonne propose **Mode guidé** (*Étape par
étape*) ou **Mode expert** (*Les commandes seules, sans étapes*). Le choix est retenu par le
navigateur ; un badge **Mode expert** le rappelle.

En mode expert, l'équipement courant n'a plus que trois boutons, sans question :

| Bouton | Effet |
|---|---|
| `Ouvrir la mémoire` | envoie l'appui long sur Prog avec l'adresse de l'équipement (*Prog envoyé à « nom »*) |
| `PROG du groupe` | à maintenir : le groupe répète Prog avec sa propre adresse (*PROG du groupe envoyé*) |
| `Il a refait un va-et-vient` | enregistre l'équipement comme membre et passe au suivant |

*Le second va-et-vient est le seul retour du moteur : ce bouton l'ajoute au groupe.*

!!! note "Ce n'est pas l'appairage d'un équipement"

    Les va-et-vient ressemblent à ceux de l'appairage d'un
    [équipement](../equipements/index.md), mais ici c'est le **groupe** qui envoie Prog, avec sa
    propre adresse. Le moteur garde son adresse individuelle et ses télécommandes.

## Étape 4 : les options { #options }

![Étape 4 : les options du groupe](v3/img/groupes-etape-4){ .on-glb }

Le titre dit le résultat : **« nom » est prêt** — *Tous les équipements répondent au groupe.* —,
ou **« nom » est créé** si des équipements ont été passés : *Les équipements non appairés au groupe
n'en font pas partie : appairez-les plus tard avec « Associer un Équipement » sur la fiche du
groupe.*

| Tuile | Choix |
|---|---|
| **Sens des commandes** | `Normal` ou `Inversé`. *À inverser seulement si tous les équipements du groupe partent dans le mauvais sens quand le groupe monte.* |
| **Portée radio** | `Normale` (*1 fois*) ou `Renforcée` : *« Renforcée » répète chaque commande 3 fois, pour un groupe dont un équipement est éloigné.* **Choisir le nombre de répétitions** (replié) propose de 1 à 7 fois. *Dans le doute, laissez « Normale » : vous pourrez l'augmenter plus tard depuis sa fiche si un équipement ne répond pas toujours.* |
| **Retour lumineux** | `Oui` / `Non` : faire clignoter la LED de l'appareil à chaque commande du groupe (la question nomme la LED *bleue* ou *verte* sur les boîtiers officiels Wi-Fi et Ethernet). Présente seulement si une LED d'état est configurée |

`Terminer` enregistre ces options (*Ajouté avec succès*) et ferme l'assistant. Le nouveau groupe
apparaît dans la liste.

Fermer l'assistant à cette étape, par `Finir plus tard` ou la croix, garde le groupe et ses
membres mais **n'enregistre pas** les options choisies : le groupe garde ses réglages d'origine,
modifiables dans sa [fiche](fiche-du-groupe.md#general).

## Après la création

* Ajouter un équipement oublié ou passé : `Associer un Équipement`, dans l'onglet
  [Équipements](fiche-du-groupe.md#devices) de la fiche.
* Commander le groupe : la fiche, ou la carte du groupe sur le
  [tableau de bord](../../tableau-de-bord/index.md).
* Programmer le groupe : [Plannings](../plannings.md).

## Pages liées

* [Groupes](index.md)
* [La fiche du groupe](fiche-du-groupe.md)
* [Équipements](../equipements/index.md)
* [Pièces](../pieces.md)
