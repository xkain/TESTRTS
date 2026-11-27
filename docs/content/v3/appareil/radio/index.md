# Radio

La page **Radio** règle le module CC1101 qui écoute vos télécommandes et commande vos moteurs
Somfy. Elle se lit en cinq onglets : **Réception**, **Émission**, **Matériel**, **Journal** et
**Répéteur**.

!!! tip "Si toutes vos télécommandes sont reconnues, il n'y a rien à régler"

    Le [test des télécommandes](assistant-de-reglages.md) le vérifie en quelques secondes. Les
    réglages manuels ne servent que si une télécommande n'est pas reconnue, ou si un équipement
    obéit mal.

!!! note "Sur un boîtier officiel"

    Sur l'un de mes [boîtiers officiels](../../materiel/boitiers-officiels.md), la radio est câblée
    et réglée d'usine : l'onglet **Matériel** l'indique en lecture seule, il n'y a rien à y régler.

## Le bandeau

Le bandeau, à gauche sur ordinateur et en haut de la page sur tablette et téléphone, reste affiché
quel que soit l'onglet :

* **Module radio** : `Oui` / `Non` met la radio en service ou l'arrête. Dessous, son état :
  *La radio est activée*, *La radio est désactivée*, ou *Enregistrez pour appliquer le changement*
  tant que le choix n'est pas enregistré. La radio est **désactivée** à la première mise en
  service, le temps de vérifier le câblage ; sans elle, ESPSomfy-RTS n'entend aucune télécommande
  et ne commande rien.
* **Fréquences en service** (sur ordinateur seulement) : la fréquence d'écoute, les bornes de la
  fenêtre d'écoute (**Fréq. min**, **Fréq. max**) et un graphique de cette fenêtre sur la bande
  433,000-434,399 MHz. Voir [Comprendre la fenêtre d'écoute](#fenetre-ecoute).
* **Trames reçues**, **Dernier signal** et **Dernière trame** : un signe de vie de la réception,
  affiché directement sur ordinateur, derrière le bouton **Détails** sur tablette.

Sur téléphone, le bandeau ne garde qu'une ligne de résumé : son menu ⋮ propose **Détails**, qui
ouvre ces informations dans un panneau, et **Aide sur cette page**.

## Réception { #reception }

![Radio, onglet Réception](v3/img/radio-reception){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Assistant de réception** | l'état de vos télécommandes, voir [ci-dessous](#assistant) ; `Réglages manuels` déplie les tuiles suivantes |
| **Balayage en direct** *(réglages manuels)* | `Ouvrir le balayage…` mesure la fréquence de vos télécommandes, voir [Balayage de fréquence](balayage-frequence.md). Il ne change que la fréquence d'écoute |
| **Réception — de vos télécommandes** *(réglages manuels)* | **Fréquence d'écoute** (433,000 à 434,399 MHz) et **Largeur bande RX** (58,03 à 812,50 kHz), réglées d'ordinaire par l'assistant ou le balayage |
| **Comprendre la réception** | ce que font ces réglages et le décodage |
| **Décodage** | **Protocole** (`RTS`, `RTW` ou `RTV`) et **Bit** (`56-BIT` ou `80-BIT`) : ce que la radio attend de vos télécommandes, et le réglage proposé à tout nouvel équipement |
| **Retour aux valeurs d'origine** | `Réinitialiser` remet les réglages radio d'origine, sauf les broches, après confirmation ; rien n'est écrit avant `Enregistrer`. La mesure du balayage est effacée |

![Radio, onglet Réception, réglages manuels dépliés](v3/img/radio-reception-manuel){ .on-glb }

### Assistant de réception { #assistant }

La tuile résume le résultat du [test des télécommandes](assistant-de-reglages.md) :

| Ce qu'elle affiche | Sens |
|---|---|
| *La radio est désactivée* | activez le **Module radio** dans le bandeau, puis enregistrez ; si elle reste désactivée, le module ne répond pas, voir [Dépannage radio](depannage.md#1-vérifier-dabord-que-la-radio-tourne) |
| `Tester mes télécommandes physiques` | aucun test encore : il ouvre le [test des télécommandes](assistant-de-reglages.md) |
| *Toutes vos télécommandes sont reconnues* | aucun réglage nécessaire |
| *Des télécommandes demandent un ajustement* | au moins une émet hors de la fenêtre d'écoute ; `Voir les réglages proposés` |
| *Une télécommande n'est pas reconnue* | sa fréquence est déjà dans la fenêtre : vérifiez le décodage, la pile ou la portée |
| *Test interrompu* | `Continuer le test` reprend là où vous vous êtes arrêté |

Sous le résultat, chaque télécommande testée est listée avec son état (*reconnue*, *Fréquence à
ajuster*, *Non reconnue*) ; `Refaire le test` repart de zéro.

### Comprendre la fenêtre d'écoute { #fenetre-ecoute }

ESPSomfy-RTS reçoit tout ce qui tombe dans une tranche de fréquences, centrée sur la fréquence
d'écoute :

```
fenêtre d'écoute = [fréquence d'écoute − largeur de bande / 2, fréquence d'écoute + largeur de bande / 2]
```

À partir de la fréquence d'origine (433,420 MHz) :

| Largeur bande RX | Fenêtre d'écoute | Effet |
|---|---|---|
| 99,97 kHz *(origine)* | 433,370 – 433,470 MHz | couvre la quasi-totalité des télécommandes Somfy |
| 58,03 kHz *(minimum)* | 433,391 – 433,449 MHz | très étroite : un écart de 29 kHz suffit à perdre le signal |
| 812,50 kHz *(maximum)* | 433,014 – 433,826 MHz | couvre presque toute la plage, mais capte beaucoup plus de parasites |

Recentrer la fenêtre sur une seule télécommande décalée peut en faire sortir les autres : c'est
pourquoi le [test des télécommandes](assistant-de-reglages.md) calcule une fenêtre qui les couvre
toutes à la fois.

!!! info "433,42 MHz n'est pas une valeur à respecter à la lettre"

    Les télécommandes Somfy émettent sur 433,42 MHz, mais avec les années chacune peut se décaler
    un peu, et chaque module radio a son propre écart. Une fréquence d'écoute un peu à côté n'est
    pas une erreur. Vos moteurs, eux, ne sont pas concernés : leur fréquence se règle dans
    l'onglet [Émission](#transmission).

!!! tip "Le signal s'agite, mais aucune trame ne se décode ?"

    C'est le signe d'une télécommande qui émet hors de la fenêtre : la radio capte du bruit sans
    jamais recevoir la porteuse. Le [Journal](#log) le montre.

### Pourquoi la déviation de fréquence a disparu { #deviation }

Les versions jusqu'à la v3.0.0 exposaient un réglage **Déviation de fréquence**. Il a été retiré :
mesuré sur banc, il n'a **aucun effet sur la réception**. La radio Somfy RTS module en tout ou rien
(ASK/OOK), pas en FSK : le CC1101 n'y détecte que la présence de la porteuse, et c'est le firmware
qui décode les durées d'impulsion. Même télécommande, même largeur de bande, déviation à 47,60 kHz
puis 380,85 kHz : 68 trames décodées sur 68 dans les deux cas, au même signal.

## Émission { #transmission }

![Radio, onglet Émission](v3/img/radio-transmission){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Émission — vers vos équipements** | **Standard Somfy** : `433.42 MHz` (RTS, le plus courant) ou `433.92 MHz` (RTV), la fréquence sur laquelle ESPSomfy-RTS commande vos moteurs. `Réglages manuels` déplie la tuile suivante |
| **Fréquence et puissance** *(réglages manuels)* | **Fréquence d'émission** (433,000 à 434,399 MHz) et **Puissance d'émission**, sur les 11 paliers du CC1101 : -30, -20, -15, -10, -6, 0, 5, 7, 10, 11 et 12 dBm |
| **Comprendre l'émission** | ce que font ces deux réglages |

Un moteur ne se décale pas, ou très peu, avec les années : la fréquence d'émission reste d'ordinaire
sur son standard. 10 dBm suffisent pour une maison. **Si un équipement éloigné obéit mal, montez
d'abord la puissance**, avant de toucher à la fréquence ; ne passez à 12 dBm que si votre matériel
est conçu pour.

Si même à 11 dBm l'équipement n'obéit pas mieux, c'est que la fréquence de son moteur a peut-être
un peu dérivé. Abaissez alors légèrement la **Fréquence d'émission**, **par petits pas**, vers la
fréquence sur laquelle émet la télécommande de ce moteur, que le
[test des télécommandes](assistant-de-reglages.md) ou le [balayage](balayage-frequence.md) mesure.
Essayez l'équipement après chaque pas.

## Matériel { #hardware }

![Radio, onglet Matériel](v3/img/radio-hardware){ .on-glb }

Sur un boîtier officiel, la tuile **Votre appareil** indique que la radio est *câblée et réglée
d'usine*, et **Broches du module radio** liste les broches en lecture seule.

Sur une carte générique, la tuile **Assignation GPIO** propose un **Modèle de carte**, qui remplit
les six broches, rappelées en dessous. Elle ne montre que les modèles de la puce de votre appareil :

| Carte | SCK | CSN | MOSI | MISO | TX | RX |
|---|---|---|---|---|---|---|
| ESP32 *(par défaut)* | 18 | 5 | 23 | 19 | 13 | 12 |
| ESP32-S2 *(par défaut)* | 36 | 34 | 35 | 37 | 15 | 14 |
| ESP32-S3 *(par défaut)* | 12 | 10 | 11 | 13 | 15 | 14 |
| ESP32-C3 *(par défaut)* | 15 | 14 | 16 | 17 | 13 | 12 |
| ESP32-C6 *(par défaut)* | 19 | 21 | 4 | 20 | 22 | 5 |
| ESP32-D1 mini | 18 | 5 | 23 | 19 | 21 | 22 |
| WT32-ETH01 | 14 | 12 | 15 | 4 | 2 | 35 |
| Olimex ESP32-PoE/EVB | 14 | 13 | 15 | 16 | 4 | 36 |
| LilyGO T-Internet POE | 14 | 12 | 15 | 16 | 4 | 35 |
| wESP POE | 18 | 5 | 13 | 32 | 4 | 39 |
| ESP-PoE-32 | 14 | 5 | 13 | 32 | 4 | 35 |
| ESP32-S3 Mini | 7 | 6 | 9 | 8 | 3 | 4 |
| ESP32-S3 Zero | 7 | 6 | 9 | 8 | 3 | 4 |
| XIAO-ESP32-C3 | 8 | 6 | 10 | 9 | 3 | 4 |
| ESP32-C6-Zero | 19 | 21 | 4 | 20 | 22 | 5 |
| XIAO-ESP32-C6 | 19 | 21 | 18 | 20 | 1 | 2 |

Les modèles WT32-ETH01, Olimex, LilyGO, wESP et ESP-PoE-32 portent aussi un contrôleur Ethernet :
leurs broches sont choisies pour ne jamais entrer en conflit avec lui.

**Définir manuellement (utilisateur avancé)** affiche la tuile **Broches du module radio**, avec un
champ par broche, un avertissement rouge et l'interrupteur **J'ai vérifié mon câblage, broche par
broche.** : tant qu'il n'est pas sur `Oui`, aucune broche saisie à la main n'est enregistrée.
`Enregistrer` demande encore une confirmation, *Enregistrer des broches saisies à la main ?*.

![Radio, onglet Matériel, broches saisies à la main](v3/img/radio-hardware-pins){ .on-glb }

!!! danger "Une broche fausse peut bloquer ou abîmer la carte"

    Une broche déjà reliée à un autre composant (flash, Ethernet, radio…) peut empêcher
    l'appareil de démarrer, ou être abîmée si deux composants la pilotent en même temps.
    Comparez chaque broche à la documentation du fabricant.

L'interface refuse deux broches radio identiques, mais **rien ne détecte un conflit avec
l'Ethernet** : sur une carte Ethernet, vérifiez vous-même qu'aucune broche radio n'est partagée
avec lui.

* **SCK, CSN, MOSI, MISO** : la liaison SPI vers le module. Un module qui ne répond pas du tout
  (voir [Dépannage radio](depannage.md#1-vérifier-dabord-que-la-radio-tourne)) vient presque
  toujours d'une erreur ici.
* **TX / RX (GDO0 / GDO2)** : le CC1101 ne peut **émettre** que par sa broche **GDO0** ; la
  réception fonctionne sur l'une ou l'autre. Inverser les deux donne une réception qui marche et
  une émission muette.
* **Une seule broche pour les deux** : relier GDO0 seul et indiquer le **même GPIO** pour TX et RX
  économise une broche, l'appareil commutant entre émission et réception. C'est le seul doublon
  que l'interface accepte.

## Journal { #log }

![Radio, onglet Journal](v3/img/radio-log){ .on-glb }

Chaque trame radio décodée par le CC1101 (RTS, RTW ou RTV, valide ou non) y apparaît dès
réception, la plus récente en haut. Le bouton **Journal radio** de la fiche d'un équipement y mène
aussi, déjà filtré sur son adresse.

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Trames reçues** | le tableau des trames, avec la recherche, les filtres et les boutons `Valides`, `Pause`, `Copier` et `Effacer` |
| **Activité** | l'état du flux et ses compteurs |
| **Émetteurs entendus** | chaque identifiant entendu, une seule fois |

!!! info "Le journal commence à l'ouverture de l'interface"

    Il se remplit depuis l'ouverture de l'interface et s'efface au rechargement de la page. Une
    trame « invalide » a été captée mais mal décodée (signal faible ou parasite) : elle est
    ignorée et ne pilote rien.

### Trames reçues

| Colonne | Contenu |
|---|---|
| Temps | heure de réception, au millième de seconde |
| Commandes | la commande, l'exposant du pas si elle en porte un, et un badge rouge **invalide** le cas échéant |
| Adresse | l'adresse de la télécommande, avec le nom de l'équipement ou du groupe associé, ou *Télécommande inconnue* |
| RSSI | la puissance du signal en dBm, colorée (voir [Code couleur du RSSI](#rssi)) |
| clé | la clé d'obfuscation |
| Code | le code tournant |
| Bits | le nombre de bits, avec le protocole en exposant |

Une ligne se déplie au clic : **Protocole**, **Synchro**, **Durée**, et la liste brute des
**Impulsions**, la matière dont le firmware déduit bits et protocole.

* **Recherche** : le champ filtre sur l'adresse, la commande, le code tournant, la clé et le nom
  de l'équipement ou du groupe reconnu.
* `Valides` masque les trames invalides.
* `Pause` fige le tableau sans rien arrêter : les compteurs continuent, et la reprise réaffiche
  tout d'un coup.
* `Copier` copie les trames **visibles** (après recherche et filtre), en JSON indenté, prêtes à
  coller dans un signalement.
* `Effacer` vide le tableau **sans confirmation** ; rien n'est envoyé à l'appareil.
* Le tableau garde au plus **300 trames** (*Trames conservées : 300*) : au-delà, la plus ancienne
  disparaît. Copiez régulièrement pendant un long test.

### Reconnaître une trame invalide { #trame-invalide }

Une trame invalide reste affichée (sauf avec `Valides`), avec un badge rouge et un liseré rouge.
Causes possibles : somme de contrôle fausse, adresse hors plage, code tournant nul (hors commande
Sensor), parité des trames 80 bits, commande non gérée ou clé nulle. Du bruit capté par hasard
donne presque toujours une trame invalide : ce n'est pas un problème en soi. Une trame **valide**
d'une **adresse inconnue**, en revanche, signale un vrai problème de liaison, voir
[Dépannage radio](depannage.md#4-réception-ok-mais-rien-ne-bouge).

### Activité et émetteurs entendus

**Activité** indique l'état du flux (*À l'écoute*, *En pause*, ou *Hors ligne* si la connexion en
temps réel avec l'appareil est coupée) et trois compteurs : **trames** depuis l'ouverture ou le
dernier `Effacer` (non plafonné à 300), **trames/min** sur la dernière minute, et le **RSSI** de la
dernière trame.

**Émetteurs entendus** liste chaque identifiant une seule fois : l'équipement auquel il correspond
(ou *Télécommande inconnue*), le nombre de trames, l'heure de la dernière et le dernier signal.
Touchez-en un pour ne voir que ses trames ; `Tout afficher` retire le filtre.

### Code couleur du RSSI { #rssi }

| Couleur | Seuil |
|---|---|
| Vert | RSSI > -70 dBm |
| Jaune | -85 dBm < RSSI ≤ -70 dBm |
| Rouge | RSSI ≤ -85 dBm |
| Gris | aucune mesure |

Cette échelle diffère de la légende du [balayage](balayage-frequence.md) : ce sont deux repères
indépendants.

## Répéteur { #repeater }

![Radio, onglet Répéteur](v3/img/radio-repeater){ .on-glb }

ESPSomfy-RTS peut **réémettre** les trames d'une télécommande précise, pour un moteur trop loin
pour la capter lui-même. La tuile **Télécommandes répétées** montre :

* le nombre de télécommandes répétées, **7 au plus**, et les places libres ;
* la **Dernière trame** répétée et le nombre de **trames répétées depuis l'ouverture de la page** ;
* un avertissement : seulement si le moteur capte mal une télécommande qu'ESPSomfy-RTS entend bien,
  et jamais la même sur deux appareils ;
* une carte par télécommande répétée : un **nom** modifiable (20 caractères, sinon
  *Télécommande de « … »* ou *Adresse télécommande*), la **Dernière trame**, le **Signal** et
  l'**Adresse**, et `Ne plus répéter`, après confirmation. Les changements s'appliquent tout de
  suite.

La carte **Capturer une télécommande à répéter** ouvre la fenêtre d'écoute, voir
[Répéter une télécommande](repeter-une-telecommande.md).

La trame est réémise telle quelle, dès qu'aucune réception n'est en cours et après un court délai
(100 ms), pour ne pas émettre par-dessus une trame qui arrive. Elle est répétée même si elle pilote
aussi l'un de vos équipements. La dernière trame et le signal de chaque carte sont relevés par
votre navigateur depuis l'ouverture de la page ; l'appareil ne garde que les adresses et les noms.

!!! danger "Une télécommande, un seul appareil répéteur"

    Si vous avez plusieurs appareils ESPSomfy-RTS, ne répétez jamais la même télécommande sur deux
    d'entre eux : ils se renverraient le signal sans fin. Rien ne détecte cette boucle. De même,
    chaque trame répétée en ajoute une dans l'air : ne répétez que les télécommandes qui en ont
    besoin.

Pour qu'une télécommande déclenche une automatisation au lieu d'être répétée, voir
[Télécommandes écoutées](../../domotique/declencheurs.md) ; une télécommande répétée ne peut pas y
être ajoutée.

## Enregistrer

Une modification fait apparaître la barre d'enregistrement en bas de l'écran : `Enregistrer` applique
les réglages des onglets Réception, Émission et Matériel, `Annuler` les abandonne. Enregistrer de
nouveaux réglages radio efface le résultat du test des télécommandes, à refaire ensuite. Les
répéteurs, eux, s'appliquent tout de suite.

## Pages liées

* [Test des télécommandes](assistant-de-reglages.md)
* [Balayage de fréquence](balayage-frequence.md)
* [Répéter une télécommande](repeter-une-telecommande.md)
* [Dépannage radio](depannage.md)
