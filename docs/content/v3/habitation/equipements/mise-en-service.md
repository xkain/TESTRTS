# Mise en service d'un équipement

Ajouter un équipement se fait **en deux étapes guidées** : d'abord ce que vous **savez** de lui (son
type, son nom, sa télécommande d'origine), puis ce que vous **constatez** en le regardant
(appairage, sens, temps de course, position favorite). L'assistant vous pose des questions
simples, une à la fois, et **enregistre chaque tâche dès qu'elle est finie** : quitter en
route ne fait rien perdre.

Il s'ouvre par **Ajouter un équipement**, sur le tableau de bord ou dans **Somfy → Équipements**.

!!! tip "Le formulaire complet reste disponible"

    En **mode expert**, et par le menu d'un équipement, **Formulaire complet (expert)** ouvre la
    fiche complète, avec tous les champs : voir [Équipements](index.md).

## Étape 1 sur 2 : l'équipement

### Quel type d'équipement ? { #type }

Une grille de types, avec pour chacun quelques questions simples :

| Type | Ce que l'assistant demande |
|---|---|
| **Volet** | rien de plus |
| **Store enrouleur** | rien de plus |
| **Store banne** | rien de plus |
| **Store vénitien** | **comment ses lames s'orientent-elles ?** Voir ci-dessous. |
| **Rideau** | de quel côté il s'ouvre : vers la gauche, par le centre, vers la droite |
| **Porte de garage** | combien de touches sur sa télécommande : 3 (monter, stop, descendre) ou 1 seule |
| **Portail** | comment il s'ouvre (un vantail à gauche, deux vantaux, un vantail à droite), puis 3 touches ou 1 seule |
| **Interrupteur** | 2 touches (marche / arrêt) ou 1 touche (bascule) ; ce qu'il commande (une lumière, un appareil, un ouvrant, autre chose, ce qui règle les mots d'état affichés) ; comment le contact réagit |

**Pour un store vénitien**, il n'y a pas de réponse par défaut : un mauvais type d'orientation
fausserait toute la mesure.

| Réponse | Signification |
|---|---|
| **Moteur unique (intégré)** | le même moteur oriente les lames puis déplace le store (ou l'inverse) ; l'assistant demandera dans quel ordre |
| **Moteur d'orientation séparé** | un second moteur oriente les lames indépendamment de la course |
| **Mode Euro** | course et orientation gérées ensemble par le même moteur, sans ordre à détecter |
| **Orientation seule** | pas de course : seule l'orientation est mesurée |
| **Course uniquement** | le store n'oriente pas ses lames |

**Pour un interrupteur**, le contact peut **rester dans l'état** (bistable : il reste fermé
jusqu'à la commande suivante) ou **donner une impulsion** (il se ferme brièvement puis se
rouvre, comme un bouton poussoir), avec une durée réglable en millisecondes. Voir
[Contrôle des moteurs avec GPIO](../../materiel/controle-moteurs-gpio.md) pour le câblage.

### Nom et pièce

Donnez un **nom** à l'équipement et, si vous le souhaitez, une **pièce**.

### « J'ai déjà une télécommande pour cet équipement »

Appuyez sur **une touche de sa télécommande d'origine**, près du boîtier : l'appareil
reconnaît **tout seul le protocole** (RTS, RTW, RTV…) et la longueur de trame, et la
télécommande **reste utilisable**.

- **Télécommande reconnue** : le protocole a été réglé d'après elle.
- **Cette télécommande pilote déjà un autre équipement** : une télécommande peut en piloter
  plusieurs. Le protocole est quand même repris.
- Une case permet de **l'associer à cet équipement**, pour que ses appuis mettent à jour la
  position affichée. Voir [Télécommandes liées](liaison-telecommande.md).
- **Écouter une autre télécommande** permet d'en essayer une autre.
- **Aucune télécommande entendue** : vérifiez la pile ou rapprochez-vous du boîtier, puis
  réessayez. Vous pouvez aussi **continuer sans** : les réglages par défaut conviennent à la
  plupart des moteurs.

**Options avancées** : protocole, nombre de bits et **ID**. Les valeurs par défaut conviennent à
la grande majorité des moteurs Somfy RTS. **Ne changez l'ID que pour reprendre celui d'un ancien
boîtier.**

## Étape 2 sur 2 : la mise en service

L'équipement est créé. L'assistant enchaîne ensuite **les tâches dont son type a besoin** :

| Tâche | Quand | Page |
|---|---|---|
| **Appairage** | toujours | [Appairage](appairage.md) |
| **Sens de rotation** (ou **Test de commande** pour un interrupteur) | toujours | [Appairage](appairage.md#sens-de-rotation) |
| **Temps de course** | équipement qui a une course (pas l'orientation seule) | [Temps de course et lames](calibration.md) |
| **Orientation des lames** | store avec orientation | [Temps de course et lames](calibration.md#orientation-des-lames) |
| **Ordre lames / course** | store à moteur unique (intégré) | [Temps de course et lames](calibration.md#ordre-lames-course) |
| **Options** | toujours | [Options et position favorite](#options-et-position-favorite) |

Chaque ligne affiche son état : **à faire**, **en cours**, **fait** ou **passée**, avec ce
qu'elle a réglé (par exemple « sens normal », « morte 0,4 s », « My à 62 % »).

### Reprendre plus tard

- **Finir plus tard** ferme l'assistant : tout ce qui est fait est déjà enregistré.
- Sur le tableau de bord, la carte de l'équipement affiche un badge **« N étapes à finir »** :
  un clic sur **Reprendre la mise en service** rouvre l'assistant là où il s'était arrêté.
- **Passer cette étape** met une tâche de côté.

### Refaire une seule tâche

Sur la **fiche de l'équipement**, le bloc **Mise en service** liste les tâches avec leur état.
**Un clic sur une ligne** ouvre cette seule tâche dans sa fenêtre, sans repasser par tout
l'assistant. Une tâche déjà faite montre d'abord ce qu'elle a réglé (**refaire**, **désappairer**,
**inverser**, **mesurer à nouveau**, **modifier les temps**).

!!! warning "Enregistrez avant"

    Les modifications non enregistrées de la fiche (un changement de type, par exemple) sont
    enregistrées avant qu'une tâche démarre, pour qu'elle suive le nouveau type. Une tâche
    enregistre ses propres valeurs : si vous ouvrez ensuite la fiche et l'enregistrez, les temps
    mesurés ne sont **pas** écrasés.

## Options et position favorite

La dernière tâche pose quelques réglages :

- **Que doit afficher 100 % ?** La position s'affiche en pourcentage, dans le sens de votre choix.
- **Portée radio** : **Normale**, ou **Renforcée**, qui répète chaque commande pour un équipement
  éloigné ou derrière un mur épais. Si vous constatez au quotidien qu'il ne répond pas toujours,
  augmentez la répétition.
- **Faire clignoter la LED d'état à chaque commande ?** Seulement si une LED est câblée ; sur un
  boîtier officiel, la question parle de la **LED bleue** (édition Wi-Fi) ou **verte** (édition
  Ethernet & Wi-Fi).
- **Position favorite (My)** et **capteur soleil**, ci-dessous.

### La position favorite (touche My)

L'assistant demande si le moteur a une position favorite réglée. S'il ne sait pas :
**Vérifions** : l'équipement à l'arrêt, appuyez sur **My** ; s'il part vers une position puis
s'arrête, elle est réglée.

Si elle est réglée sur le moteur, il faut **l'apprendre à ESPSomfy-RTS**. Sinon, quand vous
appuyez sur My, le moteur part bien à sa position, mais l'appareil ne sait pas où il s'arrête :
la position affichée devient fausse.

1. Amenez l'équipement **complètement ouvert** : c'est le point de départ de la mesure.
2. Appuyez sur **My** : l'équipement part vers sa position favorite. Cliquez **dès qu'il
   s'arrête**.

Le moteur s'arrête tout seul, sans rien émettre : votre clic donne à ESPSomfy-RTS la durée du
trajet, donc la position. Un temps de réaction de 0,3 s est retiré de votre clic. Si
l'équipement n'a presque pas bougé, ou est allé jusqu'au bout de sa course, la position est
peut-être tout en haut, ou n'est pas réglée : l'assistant le signale. Puis **Enregistrer cette
position**.

!!! info "Cette mesure demande d'abord les temps de course"

    Pour apprendre My, l'appareil doit connaître les temps de course de l'équipement :
    l'assistant propose de les mesurer d'abord.

Si le moteur **n'a pas** de position favorite, vous pouvez en **créer** une :

| Choix | Effet |
|---|---|
| **La régler sur le moteur** | elle est enregistrée dans le moteur : la télécommande d'origine pourra aussi s'en servir. L'équipement va à la position, puis un **appui long sur My** l'enregistre ; le moteur confirme par un bref va-et-vient. |
| **La simuler** | ESPSomfy-RTS amène lui-même l'équipement à cette position quand vous appuyez sur My. La télécommande d'origine ne la connaît pas. |
| **Pas de position favorite** | rien n'est enregistré |

**Plus tard** reporte l'apprentissage ; tant que la position n'est pas apprise, la position
affichée sera fausse après chaque appui sur My. Pour un store à **orientation seule**, la
position favorite des lames se règle depuis sa fiche.

Sur les stores vénitiens à moteur d'orientation, à moteur unique et en mode Euro, l'assistant
demande aussi l'**inclinaison favorite** des lames, **à l'œil**, avec un curseur : le chrono ne
mesure que la course. Le bouton devient **Enregistrer ces positions**.

### Le capteur soleil

« Un capteur soleil est-il associé à ce moteur ? » : un petit capteur posé près de l'équipement,
qui le commande selon l'ensoleillement.

## Bon à savoir

- Si l'équipement part dans le **mauvais sens**, inutile de le réappairer : la ligne **Sens de
  rotation** l'inverse à tout moment.
- Si l'équipement ne répond **pas toujours**, passez sa portée radio en **Renforcée** depuis la
  ligne **Options**.

## Ce qui est prêt

À la fin, « **nom** est prêt » apparaît, et l'équipement s'affiche sur le tableau de bord avec sa
position. Si des étapes restent à faire : « Tout ce qui est fait est déjà enregistré », la carte
le rappellera, et vous pourrez les reprendre depuis la liste des équipements.
