# Équipements

Un équipement, c'est l'« identité numérique » d'un de vos moteurs : son adresse radio, son type,
ses temps de course. ESPSomfy-RTS en a besoin pour parler au moteur **et** pour rester synchronisé
avec vos télécommandes physiques, car le protocole RTS ne lui permet jamais d'interroger le moteur.

---

<img width="100%" src="../img/equipements-1-clair.webp#only-light" /><img width="100%" src="../img/equipements-1-sombre.webp#only-dark" />

## 1. Ce qu'il faut savoir avant de commencer

| | |
| --- | --- |
| **Nombre d'équipements** | 30 au maximum |
| **Télécommandes liées** | 7 par équipement |
| **Adresse radio** | 24 bits, générée depuis l'adresse MAC de l'ESP32 |

!!! important "Important"

    **Le moteur ne répond jamais.** Le RTS n'émet que dans un sens : aucun moteur ne confirme quoi
    que ce soit, et aucun ne dit où il se trouve. Tout ce que l'interface affiche — position,
    pourcentage, mouvement en cours — est **calculé** à partir des temps de course que vous
    renseignez. D'où l'importance des deux chapitres qui suivent.

## 2. Créer l'équipement

`AJOUTER ÉQUIPEMENT` ouvre la fiche. Renseignez-la, puis `CRÉER`.

!!! note "Note"

    Tant que vous n'avez pas cliqué sur `CRÉER`, rien n'est enregistré et les boutons de la zone de
    visualisation restent grisés. Les options `APPAIRER`, `LIER TÉLÉCOMMANDE` et `DÉFINIR CODE`
    n'apparaissent qu'après.

Une fois l'équipement créé, `CRÉER` devient `ENREGISTRER` pour vos modifications ultérieures.

### Identification et type

* **Nom** — jusqu'à 20 caractères, n'importe quel caractère imprimable.
* **Pièce** — range l'équipement dans une pièce, **Accueil** par défaut. C'est ce qui alimente le
    filtre du [Tableau de bord](../tableau-de-bord.md) — voir [Pièces (Rooms)](pieces.md).
* **Type** — détermine l'icône, les boutons disponibles et les fonctions offertes. Seuls les
    stores vénitiens ont une inclinaison, seuls les garages ont une lumière.

     | Icône | Nom | Description | Fonctions |
     | :---: | :--- | :--- | :--- |
     | ![Roller Shade](../img/type-roller-clair.webp#only-light)![Roller Shade](../img/type-roller-sombre.webp#only-dark) | **Store enrouleur** | Toile pleine qui s'élève ou s'abaisse via un tube rotatif supérieur. | Haut, Bas, My |
     | ![Shutter](../img/type-shutter-clair.webp#only-light)![Shutter](../img/type-shutter-sombre.webp#only-dark) | **Volet roulant** | Tablier composé de lames articulées s'enroulant dans un coffre. | Haut, Bas, My, Soleil |
     | ![Blind](../img/type-blind-clair.webp#only-light)![Blind](../img/type-blind-sombre.webp#only-dark) | **Store Vénitien** | Lames reliées par des cordons. Inclut souvent un mécanisme d'inclinaison (Tilt). | Haut, Bas, My, Tilt, Soleil |
     | ![Drapery Left](../img/type-drapery-left-clair.webp#only-light)![Drapery Left](../img/type-drapery-left-sombre.webp#only-dark) | **Rideau (Gauche)** | Tringle coulissante qui s'ouvre de la droite vers la gauche (fixé à gauche). | Haut, Bas, My, Soleil |
     | ![Drapery Right](../img/type-drapery-right-clair.webp#only-light)![Drapery Right](../img/type-drapery-right-sombre.webp#only-dark) | **Rideau (Droite)** | Tringle coulissante qui s'ouvre de la gauche vers la droite (fixé à droite). | Haut, Bas, My, Soleil |
     | ![Drapery Center](../img/type-drapery-center-clair.webp#only-light)![Drapery Center](../img/type-drapery-center-sombre.webp#only-dark) | **Rideau (Central)** | Rideau à deux panneaux s'ouvrant depuis le centre vers les côtés. | Haut, Bas, My, Soleil |
     | ![Awning](../img/type-awning-clair.webp#only-light)![Awning](../img/type-awning-sombre.webp#only-dark) | **Store banne** | Mécanisme horizontal qui se déploie pour couvrir une zone (terrasse). | Haut, Bas, My, Soleil |
     | ![Garage 1](../img/type-garage1-clair.webp#only-light)![Garage 1](../img/type-garage1-sombre.webp#only-dark) | **Garage (1 bouton)** | Moteur avec une seule fonction cyclique (Toggle). **Note :** privilégiez la version 3 boutons si possible. | Cycle, Lumière |
     | ![Garage 3](../img/type-garage1-clair.webp#only-light)![Garage 3](../img/type-garage1-sombre.webp#only-dark) | **Garage (3 boutons)** | Porte de garage utilisant des commandes distinctes : Ouvrir, Fermer et Stop. | Haut, Bas, My, Lumière |
     | ![Dry Contact](../img/type-dry-contact-clair.webp#only-light)![Dry Contact](../img/type-dry-contact-sombre.webp#only-dark) | **Contact Sec** | Appareils RTS pilotant des relais simples (ON/OFF alterné). | Cycle |
     | ![Dry Contact 2](../img/type-dry-contact-clair.webp#only-light)![Dry Contact 2](../img/type-dry-contact-sombre.webp#only-dark) | **Contact Sec (2 boutons)** | Micro-récepteurs utilisant un bouton pour l'ouverture et l'autre pour la fermeture. | Haut, Bas |
     | ![Gate Left](../img/type-gate-left-clair.webp#only-light)![Gate Left](../img/type-gate-left-sombre.webp#only-dark) | **Portail (Gauche)** | Contrôleur où Haut ouvre et Bas ferme. Vantail représenté à gauche. | Haut, Bas, My |
     | ![Gate Right](../img/type-gate-right-clair.webp#only-light)![Gate Right](../img/type-gate-right-sombre.webp#only-dark) | **Portail (Droite)** | Contrôleur où Haut ouvre et Bas ferme. Vantail représenté à droite. | Haut, Bas, My |
     | ![Gate Center](../img/type-gate-center-clair.webp#only-light)![Gate Center](../img/type-gate-center-sombre.webp#only-dark) | **Portail (Double)** | Portail à deux battants s'ouvrant depuis le centre vers les côtés. | Haut, Bas, My |


   > **Conseil pour les portes de garage :** même si votre télécommande physique n'a qu'un bouton,
   > essayez le type **Garage (3 boutons)**. La plupart des moteurs récents acceptent les ordres
   > séparés, bien plus fiables pour une automatisation qu'une bascule unique.

* **Protocole** — **RTS** (standard), **RTW** (ASA Motors en Europe), **RTV** (variante calée sur
    433,92 MHz), ou **IO-Relay** / **IO-Remote** pour un pilotage filaire, décrit dans
    [Contrôle des moteurs avec GPIO](../materiel/controle-moteurs-gpio.md).
* **Bits** — **56-bit** ou **80-bit**. Les moteurs à molette d'inclinaison utilisent souvent le
    80-bit.
* **ID Télécommande** — l'adresse 24 bits de cet équipement.

!!! note "Note"

    **Protocole** et **Bits** reprennent par défaut ce que vous avez réglé dans
    [Configurer la Radio](../radio/configurer.md).

!!! warning "Avertissement"

    **Deux règles absolues sur l'adresse.**

    Elle doit être **unique** — parmi vos équipements, vos groupes, et les télécommandes physiques à
    portée. Deux équipements qui la partagent répondent aux mêmes ordres, et leurs codes tournants
    se mélangent.

    Et elle ne doit **jamais changer après l'appairage** : c'est elle que le moteur a retenue. La
    modifier revient à perdre le lien, qu'il faudra refaire.

    *Le firmware ne contrôle pas encore cette unicité en v2.6.0 ; il le fera à partir de la v2.6.1.
    D'ici là, c'est à vous d'y veiller.*

### La zone de visualisation

<img height="101" src="../img/equipements-2-clair.webp#only-light" /><img height="101" src="../img/equipements-2-sombre.webp#only-dark" />

Elle permet d'essayer vos réglages sans quitter la fiche. Les boutons sont **grisés** tant que
l'équipement n'a pas été créé, et ils n'obéissent qu'aux valeurs **enregistrées** : après une
modification, cliquez sur `ENREGISTRER` avant d'essayer.

## 3. Les temps de course

Tout s'exprime en **millisecondes** — 1 s = 1000 ms. La valeur par défaut est 10 000, soit dix
secondes.

* **Temps montée / descente** — la durée d'une course complète, dans chaque sens.
* **Type d'inclinaison** — n'apparaît que pour un **store vénitien** :

| Type | Ce que c'est |
| --- | --- |
| **Aucun** | Pas de mécanisme d'inclinaison. |
| **Moteur inclinaison** | Un moteur séparé, piloté par appuis longs. |
| **Intégré** | Un seul moteur pour l'inclinaison et la levée : il incline à fond avant de lever. |
| **Inclinaison seule** | Seule l'inclinaison est pilotable. |
| **Inclinaison Euro** | Moteurs gérant appuis courts et longs. |

* **Pas (80-bit uniquement)** — le pas de la molette d'inclinaison, de 1 à 1000. Il demande un peu
    d'essais pour trouver le rapport entre levée et inclinaison.

<p align="center">
  <img alt="Réglage Step Size" src="../img/equipements-3-clair.webp#only-light" /><img alt="Réglage Step Size" src="../img/equipements-3-sombre.webp#only-dark" />
</p>

!!! important "Important"

    **Chronométrez vraiment, les deux sens séparément.** Le poids du tablier rend la montée plus
    lente que la descente. Comme la position affichée est entièrement calculée à partir de ces deux
    nombres, une valeur approximative se traduit par un pourcentage qui dérive à chaque mouvement.

## 4. Les options

### Capteurs

* **Capteur solaire** — fait apparaître une icône soleil sur le tableau de bord, pour activer ou
    désactiver la prise en compte du soleil par le moteur.

      <img width="471" src="../img/equipements-4-clair.webp#only-light" /><img width="471" src="../img/equipements-4-sombre.webp#only-dark" />

* **Capteur lumière** — réservé aux types **Garage**, fait apparaître une icône ampoule.

     <img width="463" src="../img/equipements-5-clair.webp#only-light" /><img width="463" src="../img/equipements-5-sombre.webp#only-dark" />

!!! note "Note"

    Ces deux options n'inventent rien : elles supposent qu'un capteur physique est réellement lié au
    moteur. Et le capteur doit aussi être lié à ESPSomfy-RTS pour que l'interface sache ce qu'il a
    déclenché — voir le chapitre 7.

### Sens et affichage

* **Commandes (Inverser)** — si l'équipement descend quand vous demandez de monter.
* **Position (Inverser %)** — par défaut **100 % = fermé**, la convention Somfy. À cocher si vous
    préférez l'inverse.

!!! tip "Astuce"

    Inverser les commandes est un pansement : si le moteur descend quand on lui dit de monter, c'est
    son propre sens qu'il faudrait corriger, sur le moteur. La case est là pour les cas où ce n'est
    pas possible.

### Fiabilité

* **Répéter commandes** — de **aucune répétition** à **20 fois**, une répétition par défaut.
* **Favoris (Simuler)** — si le moteur ne sait pas mémoriser une position My, l'appareil simule
    l'arrêt en calculant le temps de trajet. Cela repose entièrement sur vos temps de course.

!!! important "Important"

    N'augmentez la répétition que pour un moteur qui rate des ordres — typiquement un moteur à
    batterie, lent à se réveiller. **Pendant qu'il émet, l'appareil n'écoute pas** : chaque
    répétition inutile est du temps d'écoute perdu, et vos télécommandes physiques passent par cette
    écoute.

## 5. Appairer le moteur

L'appairage écrit l'adresse d'ESPSomfy-RTS dans la mémoire du moteur. C'est exactement ce que vous
feriez pour ajouter une télécommande physique.

!!! important "Important"

    **Le va-et-vient est votre seul indicateur.** Le moteur ne renvoie aucune confirmation : la seule
    preuve qu'une étape a réussi est le bref mouvement d'aller-retour, le « jog ».

1. `APPAIRER` ouvre l'assistant, qui déroule les étapes.
2. **Ouvrez la mémoire du moteur** : sur votre télécommande d'origine, maintenez `PROG` au dos
    jusqu'au jog.
3. Cliquez sur `PROG` dans l'assistant. Un second jog signifie que c'est enregistré. **S'il ne
    bouge pas, ne validez pas** : reprenez à l'étape 2.
4. `APPAIRAGE RÉUSSI` ferme l'assistant. Le bouton `APPAIRER` devient `DÉSAPPAIRER`.

<img width="33%" src="../img/equipements-6-clair.webp#only-light" /><img width="33%" src="../img/equipements-6-sombre.webp#only-dark" />
<img width="33%" src="../img/equipements-7-clair.webp#only-light" /><img width="33%" src="../img/equipements-7-sombre.webp#only-dark" />
<img width="33%" src="../img/equipements-8-clair.webp#only-light" /><img width="33%" src="../img/equipements-8-sombre.webp#only-dark" />

!!! warning "Avertissement"

    **Ne confirmez pas un mouvement qui n'a pas eu lieu.** L'appairage et le désappairage sont la
    **même commande** : le moteur bascule d'un état à l'autre. Si vous validez à tort, vous ne savez
    plus dans quel état il est, et il faudra un désappairage pour repartir proprement. Un équipement
    qui fait plus d'un va-et-vient vient probablement d'être détaché.

!!! note "Note"

    **Désappairer** suit exactement la même procédure.

    **La portée n'est presque jamais le problème** : 150 à 200 mètres sans obstacle. Un appairage qui
    échoue vient le plus souvent du mode programmation du moteur, refermé trop vite.

### Le mode expert

Un commutateur **Mode Expert** en haut de l'assistant supprime les étapes intermédiaires et
regroupe tout sur une seule page : il ne reste que `PROG`, `APPAIRAGE RÉUSSI` et `ANNULER`. Utile
quand on enchaîne beaucoup d'équipements et qu'on connaît déjà le principe du jog.

C'est le même réglage que dans l'assistant d'association d'un groupe — voir
[GROUPES (Groups)](groupes.md) — et il revient au mode guidé au rechargement de la page.

<img width="400" src="../img/equipements-9-clair.webp#only-light" /><img width="400" src="../img/equipements-9-sombre.webp#only-dark" />

## 6. Lier vos télécommandes physiques

Sans cela, **la position affichée devient fausse dès que quelqu'un touche une télécommande
réelle** : l'appareil n'a aucun moyen de savoir que le moteur a bougé. Lier une télécommande, c'est
lui demander d'écouter cette adresse et de mettre son calcul à jour.

1. `LIER TÉLÉCOMMANDE` met l'interface en écoute.
2. Appuyez sur un bouton de la télécommande réelle — `MONTER` est le plus simple.
3. L'adresse est capturée et l'assistant se ferme seul.

<img width="828" alt="Copie d&#39;écran_20260520_113543" src="../img/equipements-10-clair.webp#only-light" /><img width="828" alt="Copie d&#39;écran_20260520_113543" src="../img/equipements-10-sombre.webp#only-dark" />

Un bloc apparaît alors avec l'adresse et le code tournant de la télécommande.

!!! important "Important"

    **Une télécommande de groupe doit être liée à chaque équipement qu'elle commande.** Un canal de
    Telis qui pilote quatre volets se lie quatre fois, une fois par équipement — sinon seuls ceux que
    vous avez liés suivront l'affichage.

!!! note "Note"

    **7 télécommandes au maximum par équipement**, capteurs compris. Pour en retirer une, la croix
    rouge dans la liste des télécommandes liées.

<img width="877" alt="Copie d&#39;écran_20260520_113114" src="../img/equipements-11-clair.webp#only-light" /><img width="877" alt="Copie d&#39;écran_20260520_113114" src="../img/equipements-11-sombre.webp#only-dark" />

## 7. Lier un capteur

Un capteur de soleil ou de vent — **Soliris**, **Eolis** — se lie comme une télécommande, avec le
même `LIER TÉLÉCOMMANDE`. Il n'envoie pas d'ordre de bouton, mais ESPSomfy-RTS intercepte ses
trames et en déduit l'action : sans la liaison, votre interface ne saura pas que le store s'est
replié par sécurité.

La difficulté est de le faire émettre pendant l'écoute :

* faire tourner l'anémomètre vite — un sèche-cheveux ou un souffleur de feuilles suffit ;
* couvrir le capteur solaire pour simuler un changement de luminosité ;
* appuyer brièvement sur son bouton `PROG`, s'il en a un.

## 8. Définir le code tournant

<img width="800" src="../img/equipements-12-clair.webp#only-light" /><img width="800" src="../img/equipements-12-sombre.webp#only-dark" />

Chaque commande envoyée incrémente de 1 un compteur, côté appareil **et** côté moteur. C'est ce
qui empêche de rejouer une trame enregistrée.

!!! danger "Attention"

    **Ne modifiez cette valeur que si vous savez pourquoi.** Si le code envoyé sort de la petite
    fenêtre de tolérance que le moteur accepte, celui-ci ignore la commande — et le rattrapage passe
    souvent par une réinitialisation complète de sa mémoire.

    `DÉFINIR CODE` sert surtout à **lire** la valeur, ou à la rétablir après avoir restauré une
    configuration sur un autre module.

---

## Étape suivante

* [GROUPES (Groups)](groupes.md) — commander plusieurs équipements d'une seule trame.
* [Tableau de bord](../tableau-de-bord.md) — les cartes, les boutons et les fenêtres de positionnement.
* [TÉLÉCOMMANDE VIRTUELLE(Virtual Remote)](telecommande-virtuelle.md) — émettre sans télécommande physique.

