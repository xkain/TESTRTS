# Équipements

L'onglet **Somfy → Équipements** regroupe deux écrans : la **liste** de vos équipements, et la
**fiche** de chacun. Un nouvel équipement se crée avec un **assistant guidé** : voir la
[mise en service d'un équipement](mise-en-service.md).

## Liste des équipements

Tant qu'aucun équipement n'existe, un message invite à cliquer sur **Ajouter un équipement**.
Une fois plusieurs créés, chacun s'affiche en carte cliquable (ouvre sa fiche), composée de
gauche à droite :

* une **poignée** ⠿ pour réordonner la liste par glisser-déposer (souris ou tactile) — le
    nouvel ordre est enregistré **immédiatement** au relâchement ;
* l'**icône du type** choisi ;
* le **nom**, avec la **pièce** assignée juste en dessous si elle est définie ;
* un badge **« N étapes à finir »** quand la [mise en service](mise-en-service.md) n'est pas
    terminée : un clic dessus la reprend là où elle s'était arrêtée ;
* à droite : l'**ID** de l'équipement, une icône **télécommande** qui ouvre directement la
    [télécommande virtuelle](../telecommande-virtuelle.md) de cet équipement, et une icône
    **poubelle** qui le supprime.

## La fiche de l'équipement

La fiche est organisée en **blocs** (des tuiles), qui s'empilent sur téléphone :

| Bloc | Contenu |
|---|---|
| **Informations générales** | nom, type, type d'inclinaison, pièce |
| **Communication** | protocole, bits, ID, dernière commande envoyée, télécommande entendue |
| **Mise en service** | les tâches du type, avec leur état, et les télécommandes liées |
| **Contrôle de l'équipement** | l'icône, la position et l'inclinaison en barres, la position favorite, les boutons |
| **Options** | réglages de comportement |
| **Plannings** | les programmations de cet équipement |

À partir de **1600 px** de large, un encart **« Bon à savoir »** apparaît dans une colonne à droite.
Les boutons **Fermer** et **Enregistrer** restent dans une barre fixe en bas de la fiche.

Les blocs **Mise en service**, **Contrôle** et **Plannings** n'apparaissent qu'**une fois
l'équipement créé** : on ne peut ni appairer ni programmer un équipement qui n'a pas encore
d'identifiant.

!!! tip "Changer de type, en direct"

    Changer le **type** (ou le **type d'inclinaison**) met à jour **immédiatement** les tâches de
    mise en service, les pastilles et l'encart d'aide, sans enregistrer : transformer un volet en
    store vénitien à inclinaison intégrée fait apparaître aussitôt les étapes des lames. Rien
    n'est envoyé avant l'enregistrement ou le démarrage d'une tâche.

## Informations générales

* **Nom** : limité à **20 caractères**, n'importe quel caractère imprimable.
* **Type** : détermine l'icône, les boutons de contrôle disponibles et les champs qui
    apparaissent plus bas sur cette même fiche (inclinaison, GPIO, contact sec…). Valeur par
    défaut d'un nouvel équipement : **Volet**.
* **Type d'inclinaison** *(store vénitien uniquement)* : **Aucun**, **Moteur inclinaison**
    (séparé), **Intégré** (un seul moteur lève et incline), **Inclinaison seule** ou
    **Inclinaison Euro**. Voir la [mise en service](mise-en-service.md#type).
* **Pièce** : zone d'affichage (défaut : **Accueil**). Le bouton **+** juste à côté permet de créer si besoin une
    nouvelle pièce sans quitter cette fiche — voir [Pièces (Rooms)](../pieces.md)) pour leur
    gestion complète.

### Capacité

ESPSomfy-RTS gère jusqu'à **30 équipements** au total — identifiants 1 à 30, les deux
extrêmes de la plage interne (0 et 31) étant réservés en coulisses et jamais attribués.

### Types d'équipement disponibles

| Icône | Nom | Description | Fonctions |
| :---: | :--- | :--- | :--- |
| ![Roller Shade](commun/img/type-roller){ width="60" } | **Store enrouleur** | Toile pleine qui s'élève ou s'abaisse via un tube rotatif supérieur. | Haut, Bas, My, Soleil |
| ![Shutter](commun/img/type-shutter) | **Volet** | Tablier composé de lames articulées s'enroulant dans un coffre. | Haut, Bas, My, Soleil |
| ![Blind](commun/img/type-blind) | **Store vénitien** | Lames reliées par des cordons. Seul type proposant un mécanisme d'inclinaison (Tilt). | Haut, Bas, My, Tilt, Soleil |
| ![Drapery Left](commun/img/type-drapery-left) | **Rideau (gauche)** | Tringle coulissante qui s'ouvre de la droite vers la gauche (fixé à gauche). | Haut, Bas, My, Soleil |
| ![Drapery Right](commun/img/type-drapery-right) | **Rideau (droit)** | Tringle coulissante qui s'ouvre de la gauche vers la droite (fixé à droite). | Haut, Bas, My, Soleil |
| ![Drapery Center](commun/img/type-drapery-center) | **Rideau (centre)** | Rideau à deux panneaux s'ouvrant depuis le centre vers les côtés. | Haut, Bas, My, Soleil |
| ![Awning](commun/img/type-awning){ width="60" } | **Store banne** | Mécanisme horizontal qui se déploie pour couvrir une zone (terrasse). | Haut, Bas, My, Soleil |
| ![Garage 1](commun/img/type-garage1) | **Garage (1 bouton)** | Une seule fonction cyclique (Toggle), sans position mémorisable. | Cycle |
| ![Garage 3](commun/img/type-garage1) | **Garage (3 boutons)** | Commandes distinctes : Ouvrir, Fermer, Stop. | Haut, Bas, My |
| ![Switch 1](v3/img/type-switch1) | **Interrupteur (1 bouton)** | Contact sec : simple bascule On/Off sur une seule broche. | Cycle |
| ![Switch 2](v3/img/type-switch2) | **Interrupteur (2 boutons)** | Contact sec : une broche pour l'activation, une pour la désactivation. | Haut, Bas |
| ![Gate Left](commun/img/type-gate-left) | **Portail (gauche)** | Trois commandes distinctes : Ouvrir, Fermer, Stop. | Haut, Bas, My |
| ![Gate Center](commun/img/type-gate-center) | **Portail (centre)** | Trois commandes distinctes, portail à deux battants. | Haut, Bas, My |
| ![Gate Right](commun/img/type-gate-right) | **Portail (droit)** | Trois commandes distinctes, vantail représenté à droite. | Haut, Bas, My |
| ![Gate Left](commun/img/type-gate-left) | **Portail 1 bouton (gauche)** | Même principe que Garage (1 bouton), vantail gauche. | Cycle |
| ![Gate Center](commun/img/type-gate-center){ width="60" } | **Portail 1 bouton (centre)** | Même principe que Garage (1 bouton), deux battants. | Cycle |
| ![Gate Right](commun/img/type-gate-right) | **Portail 1 bouton (droit)** | Même principe que Garage (1 bouton), vantail droit. | Cycle |

!!! tip "Astuce"

    **Portes de garage/portails :** même si votre télécommande physique n'a qu'un bouton,
    essayez d'abord la version « 3 boutons » / à commandes séparées — la plupart des moteurs
    récents la gèrent nativement, et c'est bien plus fiable pour l'automatisation.

## Communication

* **Protocole** : **RTS**, **RTW**, **RTV**, **IO-Relay** ou **IO_Remote**.
    * **RTS** : protocole radio Somfy standard.
    * **RTW** : apparu en Europe sous la marque ASA Motors.
    * **RTV** : variante marquée pour fonctionner à 433,92 MHz.
    * **IO-Relay** et **IO_Remote** : malgré leur nom, **rien à voir avec le protocole
        Somfy io-homecontrol** — ce sont les deux modes de pilotage par **contact sec /
        relais GPIO** (bistable pour l'un, boutons séparés pour l'autre). Les sélectionner
        remplace le champ **Bit** par trois menus **GPIO Montée/My/Descente** — voir
        [Contrôle des moteurs avec GPIO](../../materiel/controle-moteurs-gpio.md) pour le câblage et
        le détail complet.
  > Le protocole proposé par défaut à la création reprend celui actuellement configuré
  > dans **Radio → Configuration** — idem pour le nombre de bits.

* **Bit** : **56-bit** ou **80-bit** — masqué si le protocole est IO-Relay/IO_Remote. Les
    mécanismes d'inclinaison intégrés utilisent souvent le 80-bit.
* **ID Équipement** : adresse radio unique sur 24 bits, générée par défaut à partir de
    l'adresse MAC de votre ESP32. **Doit rester unique** parmi tous vos équipements et
    télécommandes à portée — l'appareil vérifie l'unicité à l'enregistrement.

  > [!CAUTION]
  > Ne modifiez jamais cet identifiant après avoir appairé l'équipement : le moteur ne
  > reconnaîtrait plus aucun ordre tant qu'il n'est pas réappairé.

* **Dernière commande envoyée** et **Télécommande entendue** : depuis quand, et quelle commande
    ou quel signal (par exemple « il y a 12 s »). L'appareil retient en mémoire vive quand
    chaque équipement a reçu une commande (directe, plannings, MQTT, répétitions, groupe) et
    quand chaque télécommande liée a été entendue. Ces valeurs se rafraîchissent toutes les
    15 secondes, et **repartent de zéro au redémarrage**.

## Contrôle de l'équipement

*Visible uniquement une fois l'équipement enregistré une première fois.*

Le bloc montre l'**icône** de l'équipement en grand, avec à côté la **position actuelle** en
barre et, pour les stores à lames, l'**inclinaison** en barre rayée. Les deux barres suivent
l'état **en direct**. Un équipement sans lames n'a qu'une barre ; un **contact sec** garde son
texte d'état, sans barre.

Dessous, deux petites cartes affichent la **position favorite** (« 62 % », marquée **My** ou
**My simulé**) et l'**inclinaison favorite**. Elles disparaissent quand aucune favorite n'est
réglée. Viennent ensuite les boutons Haut/My/Bas, ou un unique bouton pour les types à commande
cyclique (garage et portail à 1 bouton).

Sur un équipement **80-bit**, un curseur **Taille du pas** (1 à 1 000, défaut **100**) règle le
pas de la molette d'inclinaison. Il est masqué en 56-bit, en IO-Relay / IO_Remote, et pour les
types garage et portail à 1 bouton.

!!! info "Ce qui a quitté la fiche"

    Il n'y a plus de commutateur **Assistant / Manuel**, ni de boutons **Appairer** et **Lier
    télécommande** dans ce bloc : tout passe par le bloc **Mise en service**. Les **temps de
    course, les temps morts et les temps des lames** ne sont plus des champs de la fiche : ils se
    mesurent par les tâches (voir [Temps de course et lames](calibration.md)).

## Options

* **Déclenchement niveau bas** *(IO-Relay/IO_Remote uniquement)* — voir
    [Contrôle des moteurs avec GPIO](../../materiel/controle-moteurs-gpio.md).
* **Capteur solaire** : active la gestion du soleil pour les moteurs compatibles (un
    capteur physique doit être lié au moteur pour que cela fonctionne). Masqué pour
    garage/interrupteur/portail.
* **Commandes** : inverse le sens Haut/Bas envoyé — à n'utiliser que si l'équipement
    descend quand vous appuyez sur Monter ; la bonne pratique reste de corriger le sens
    directement sur le moteur.
* **Position** *(ou **État** pour un contact sec)* : par défaut **100 % = Fermé** (logique
    Somfy). Cochez pour inverser cette convention — ou, pour un contact sec, pour inverser
    le libellé Marche/Arrêt affiché.
* **Favoris** : simule la position « My » par calcul du temps de trajet, pour les moteurs
    qui ne la supportent pas nativement. Absent pour Garage 1 bouton, Interrupteur (1 et 2
    boutons) et Portail 1 bouton.
* **Mode de sortie** *(contact sec uniquement)* : **Bistable** ou **Impulsion**.
* **Temps d'impulsion** *(contact sec en mode Impulsion uniquement)* : 50 à 10 000 ms, pas
    de 10 ms, défaut **200 ms**.
* **Vocabulaire d'état** *(contact sec uniquement)* : **Marche/Arrêt** *(défaut)*,
    Allumé/Éteint, Ouvert/Fermé, ou Actif/Inactif.
* **Répéter commandes** : de **0** (« Aucune répétition », défaut) à **20** — chaque ordre
    radio est renvoyé ce nombre de fois en plus du premier.

  > [!TIP]
  > Utile pour les moteurs à pile qui « s'endorment » et répondent lentement — restez
  > raisonnable : chaque répétition retarde d'autant la commande suivante, l'appareil ne
  > pouvant pas écouter pendant qu'il émet.

* **Définir Code** : voir [ci-dessous](#définir-code-rolling-code).
* **Retour lumineux** : fait clignoter la LED de statut à chaque commande envoyée à cet
    équipement. N'apparaît que si une LED de statut est configurée sur votre appareil (voir
    [Témoin LED de statut](../../firmware/led-de-statut.md), ou nativement sur les
    [boîtiers officiels](../../materiel/boitiers-officiels.md)).

### Définir Code (Rolling Code)

Permet de modifier manuellement le code tournant (rolling code) d'un équipement — à
utiliser avec une extrême prudence.

!!! danger "Attention"

    Chaque commande envoyée incrémente ce code de 1 dans la mémoire du moteur. Si le code
    envoyé par ESPSomfy-RTS ne correspond pas à celui attendu (en dehors d'une petite
    fenêtre de tolérance), le moteur ignore la commande par sécurité.

!!! note "Note"

    Surtout utile en cas de restauration d'une configuration sur un nouveau module. Une
    désynchronisation oblige généralement à réinitialiser complètement la mémoire du moteur
    — une procédure fastidieuse. Vous pouvez ouvrir cette fenêtre uniquement pour consulter
    la valeur actuelle par curiosité, mais ne modifiez rien sans savoir exactement ce que
    vous faites.

## Plannings

*Visible uniquement une fois l'équipement enregistré une première fois.*

Le bouton **Ajouter une programmation** affiche un compteur d'horaires restants — voir
[Plannification](plannification.md) pour leur création et leur gestion.

!!! note "Note"

    30 plannings au total : ce quota est **global à l'appareil**, partagé entre tous les équipements et groupes
    — pas une allocation propre à cette fiche. Le même nombre
    s'affiche donc, à l'instant T, sur la fiche de n'importe quel autre équipement ou
    groupe.

## Procédures liées

- [Mise en service d'un équipement](mise-en-service.md) — l'assistant de création et ses tâches.
- [Appairage et sens de rotation](appairage.md) — enregistrer (ou retirer) l'adresse de
    ESPSomfy-RTS dans la mémoire du moteur.
- [Temps de course et lames](calibration.md) — chronométrage guidé de la course, du temps mort,
    de l'orientation des lames et de leur ordre.
- [Télécommandes liées](liaison-telecommande.md) — faire suivre une télécommande ou un capteur
    physique.
- [Pièces (Rooms)](../pieces.md) — créer une pièce à la volée via le bouton **+** du champ
    Pièce ; a aussi son propre onglet.
- [Plannification](plannification.md) — programmer des déclenchements automatiques.
- [Télécommande Virtuelle (Virtual Remote)](../telecommande-virtuelle.md) — icône sur chaque
    carte de la [liste](#liste-des-équipements) ; le même bouton existe sur les cartes des
    [groupes](../groupes/index.md).
