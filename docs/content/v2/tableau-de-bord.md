# Tableau de bord

Cette page couvre l'écran **Tableau de bord**, celui qui s'affiche à l'ouverture de l'interface :
le cadre qui l'entoure, le filtre par pièce, et les cartes qui pilotent vos groupes et vos
équipements. Les réglages, eux, ont leurs propres pages — voir [Options](configuration/options.md), [Sécurité](configuration/securite.md) et
[Firmware](configuration/firmware.md).

---

<img width="100%" src="img/tableau-de-bord-1-clair.webp#only-light" /><img width="100%" src="img/tableau-de-bord-1-sombre.webp#only-dark" />


## 1. Deux présentations, selon la largeur de l'écran

L'interface bascule à **780 pixels** de large. Ce n'est pas un réglage : c'est la largeur de la
fenêtre qui décide, et un simple redimensionnement suffit à passer d'une présentation à l'autre.

| | Écran large | Écran étroit |
| --- | --- | --- |
| Barre du haut | visible | **masquée** |
| Barre latérale | visible | **masquée** |
| En-tête dans la page | masqué | **visible**, avec l'engrenage |
| Navigation | la barre latérale | l'engrenage |

!!! note "Note"

    Sur écran étroit, le relevé *Durée de fonctionnement* disparaît avec la barre du haut. C'est
    pourquoi l'onglet [Firmware](configuration/firmware.md) le réaffiche à cette largeur-là, et seulement à celle-là.

## 2. La barre du haut

Trois choses, à droite du logo.

* **Connexion** — trois pastilles, `WIFI`, `LAN` et `POE`. Celle qui correspond au mode réellement
    utilisé est mise en évidence ; voir [Connexion](configuration/connexion.md).
* **Durée de fonctionnement — Appareil** — depuis combien de temps l'appareil n'a pas redémarré.
* **Durée de fonctionnement — Réseau** — depuis combien de temps sa connexion tient. Les deux
    valeurs diffèrent dès que le réseau est retombé puis revenu sans que l'appareil redémarre : un
    écart entre les deux est donc un indice de liaison instable.

## 3. La barre latérale

**Tableau de bord** en haut, puis quatre groupes dépliants — **Système**, **Réseau**, **Somfy** et
**Radio** — qui mènent aux pages de configuration.

En bas, deux boutons :

* un bouton de **mise à jour**, qui n'apparaît que lorsqu'une version plus récente a été repérée ;
    il ouvre directement la fenêtre de mise à jour GitHub — voir [Mettre à jour](configuration/mettre-a-jour.md) ;
* `Redémarrer`, qui relance l'appareil.

!!! note "Note"

    Si la radio est désactivée, la mention **désactivé** s'affiche à côté du groupe **Radio**. Aucune
    commande ne partira tant qu'elle le reste.

## 4. Sur écran étroit

La barre du haut et la barre latérale disparaissent ; un en-tête prend leur place dans la page,
avec un bouton **engrenage** à droite. Il déplie une rangée de quatre icônes — Système, Réseau,
Somfy, Radio — puis une seconde rangée pour le sous-onglet. Le tableau de bord reste la vue par
défaut : l'engrenage se referme sur lui.

<img width="20%" src="img/tableau-de-bord-2-clair.webp#only-light" /><img width="20%" src="img/tableau-de-bord-2-sombre.webp#only-dark" />
<img width="20%" src="img/tableau-de-bord-3-clair.webp#only-light" /><img width="20%" src="img/tableau-de-bord-3-sombre.webp#only-dark" />



L'avertissement de mise à jour, lui, s'affiche en bandeau au-dessus de l'en-tête, là où l'écran
large le met dans la barre latérale.

## 5. La page d'accueil des débuts

Tant qu'aucune pièce, aucun équipement et aucun groupe n'existe, le tableau de bord laisse la place
à une page d'accueil : un mot de bienvenue, puis quatre cartes qui mènent chacune à l'étape
correspondante — **Réseau**, **Radio**, **Système** et **Ajouter un équipement**. Une cinquième
entrée propose l'assistant de préconfiguration aux boîtiers achetés en ligne.

<img width="100%" src="img/tableau-de-bord-4-clair.webp#only-light" /><img width="100%" src="img/tableau-de-bord-4-sombre.webp#only-dark" />

!!! note "Note"

    Cette page **disparaît définitivement** dès qu'une pièce, un équipement ou un groupe est créé.
    Elle n'est pas un onglet : on ne peut pas y revenir, et c'est voulu.

## 6. Le filtre par pièce

Une bande de pastilles en haut du tableau de bord, la première s'appelant **Accueil**.

* **Accueil** affiche tout.
* Une autre pastille ne laisse que les équipements **et les groupes** rattachés à cette pièce.
* Les deux flèches de part et d'autre font défiler la bande quand elle est plus large que l'écran.

Si la pièce choisie ne contient aucun équipement, le tableau de bord affiche *Aucun appareil n'est
actuellement assigné à cette pièce*. L'affectation d'un équipement à une pièce se fait dans
[EQUIPEMENTS](somfy/equipements.md), et les pièces elles-mêmes dans [Pièces (Rooms)](somfy/pieces.md).

## 7. Les cartes de groupe

Elles sont placées au-dessus des cartes d'équipement.

| Élément | Ce qu'il affiche |
| --- | --- |
| Pièce et nom | la pièce du groupe, puis son nom |
| **Membres** | le nombre d'équipements rattachés au groupe |
| Boutons | **Monter**, **My**, **Descendre** — envoyés à tout le groupe en une seule trame |
| Soleil | présent uniquement si le groupe est déclaré avec un capteur de soleil |

Une carte de groupe n'a ni indicateur de vent, ni position, ni fenêtre de positionnement : un
groupe s'adresse à plusieurs moteurs à la fois et ne renvoie pas d'état propre. Voir
[GROUPES (Groups)](somfy/groupes.md).

## 8. Les cartes d'équipement

C'est l'élément central de l'écran. De haut en bas :

* la **poignée**, sur le bord gauche, avec une flèche — elle ouvre la fenêtre de positionnement
    ([La position souhaitée](#la-position-souhaitée)). La flèche se retourne quand la fenêtre est
    ouverte ;
* le **nom** de l'équipement ;
* la **pièce** dans lequel l'équipement a été ajouté (optionnel)
* l'**icône**, qui dépend du type et **se remplit à la hauteur de la position courante** : c'est
    l'indicateur le plus immédiat de l'écran ;
* la **pièce**, puis `Pos: 42%` et, si l'équipement s'incline, `Tilt: 39%`.

<img width="500" height="186" src="img/tableau-de-bord-5-clair.webp#only-light" /><img width="500" height="186" src="img/tableau-de-bord-5-sombre.webp#only-dark" />

### Les boutons de commande

Ils ne sont pas les mêmes selon le type de l'équipement.

| Type | Boutons affichés |
| --- | --- |
| La plupart des types | **Monter**, **My**, **Descendre** |
| *Garage (1-button)*, *Gate (1-button …)*, *Dry Contact (1-button)* | un seul bouton **bascule**, large |
| *Dry Contact (2-button)* | **Monter** et **Descendre**, sans **My** |

!!! tip "Astuce"

    **L'appui long de deux secondes a sa propre fonction.** Sur **Monter** ou **Descendre**, et
    uniquement si l'équipement s'incline, il envoie la commande d'**inclinaison** au lieu du
    mouvement. Sur **My**, il ouvre la fenêtre de réglage de [La position My](#la-position-my) — à
    condition que
    l'équipement soit à l'arrêt.

### La barre d'état, en bas de carte

À gauche, les témoins et les repères :

| Élément | Quand il apparaît |
| --- | --- |
| **Vent** | seulement quand l'appareil a reçu une alerte de vent. Il **clignote** tant qu'elle dure. |
| **Soleil** | seulement quand l'appareil est en condition d'ensoleillement. |
| **My** | toujours : la position mémorisée, ou `---` si aucune ne l'est. |
| **My Tilt** | si l'équipement s'incline. |

À droite, les boutons :

| Bouton | Rôle |
| --- | --- |
| **Ampoule** | présent si l'équipement commande une lumière ; bascule son état. |
| **Soleil** | présent si l'équipement a un capteur de soleil ; active ou désactive sa prise en compte par le moteur. |
| `Favori` | ouvre la fenêtre de réglage de [La position My](#la-position-my). |

!!! note "Note"

    Les témoins **Vent** et **Soleil** de gauche sont des *états reçus* : ils ne se cliquent pas. Le
    bouton **Soleil** de droite, lui, est une *commande*. Deux soleils, deux rôles.

!!! tip "Astuce"

    **Ces témoins s'allument alors que votre équipement n'a aucun capteur ?** Ils viennent presque
    toujours de la télécommande virtuelle. Ses deux cases **Soleil** et **Vent**, validées par le
    bouton **Envoyer**, posent ces états sur l'équipement sélectionné — qu'il ait un capteur ou
    non, puisque c'est précisément le rôle de cette page que de simuler ce qu'un capteur enverrait.
    Pour les éteindre : retournez sur [TÉLÉCOMMANDE VIRTUELLE(Virtual Remote)](somfy/telecommande-virtuelle.md), décochez les deux
    cases et renvoyez.

## 9. Les deux fenêtres glissantes

Les deux sortent du bord de la carte et se referment au clic suivant ailleurs dans la page.

### La position souhaitée

<img width="500" src="img/tableau-de-bord-6-clair.webp#only-light" /><img width="500" src="img/tableau-de-bord-6-sombre.webp#only-dark" />

Ouverte par la **poignée** du bord gauche. Un ou deux curseurs selon l'équipement : *Position
souhaitée*, et *Position d'inclinaison cible* s'il s'incline. La commande part **au relâchement du
curseur**, pas pendant qu'on le déplace.

Le pourcentage est suivi de *Fermé* ou d'*Ouvert* selon le sens déclaré pour l'équipement : un
store banne est ouvert quand il est déplié, et son affichage est donc inversé par rapport à un
volet.

!!! note "Note"

    Cette fenêtre **ne s'ouvre pas** pour les types à bouton unique ni pour les contacts secs. Ces
    équipements n'ont pas de position intermédiaire : il n'y aurait rien à régler.

### La position My

<img width="500" src="img/tableau-de-bord-7-clair.webp#only-light" /><img width="500" src="img/tableau-de-bord-7-sombre.webp#only-dark" />

Ouverte par le bouton `Favori`, ou par un appui long sur **My**. Mêmes curseurs, mais ils ne
commandent rien : ils **enregistrent** la position que le moteur rejoindra ensuite sur un appui
court sur **My**.

Le bouton de validation change selon ce que vous réglez : **Définir "My" position** en règle
générale, et **Effacer "My" position**, en orange, dès que les curseurs retrouvent la valeur déjà
mémorisée. Le même bouton sert donc à poser et à retirer.

!!! tip "Astuce"

    **Votre équipement a déjà une position My, qui fonctionne depuis votre télécommande physique,
    mais le bouton My de l'interface ne fait rien ?** C'est normal. Cette position est mémorisée
    **dans le moteur**, et le protocole RTS n'émet que dans un sens : rien ne permet à
    ESPSomfy-RTS d'aller la lire. Si vous ne lui dites pas que votre My se trouve à 45 %, il ne
    peut pas le deviner — et tant qu'aucune valeur n'est enregistrée, il **n'envoie aucune trame** :
    le bouton reste sans effet, le moteur ne bouge pas.

    Enregistrez-la une fois ici, avec les curseurs, et le bouton **My** de l'interface se comportera
    comme celui de votre télécommande.

---

## Étape suivante

* [EQUIPEMENTS](somfy/equipements.md) — créer un équipement, l'appairer et le rattacher à une pièce.
* [GROUPES (Groups)](somfy/groupes.md) — réunir plusieurs équipements sous une seule commande.
* [Pièces (Rooms)](somfy/pieces.md) — organiser le tableau de bord.
* [TÉLÉCOMMANDE VIRTUELLE(Virtual Remote)](somfy/telecommande-virtuelle.md) — simuler une télécommande, et les deux cases qui
    allument les témoins de soleil et de vent.

