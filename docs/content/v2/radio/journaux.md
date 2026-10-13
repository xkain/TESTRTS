<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/Journaux-Radio.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Journaux radio

Le sous-onglet **Journaux** (`Radio → Journaux`) affiche en direct les trames radio reçues. C'est
l'outil de diagnostic central : tant qu'une télécommande n'apparaît pas ici, rien ne fonctionnera.

<img alt="Journaux radio" src="https://github.com/user-attachments/assets/eca7dca1-e49f-498b-947e-ea53e9f91dec" />

Les trames les plus récentes s'affichent **en haut** de la liste. Chaque pression sur une
télécommande d'origine génère une ligne.

---

# Les colonnes

| Colonne | Contenu |
| :--- | :--- |
| **Clé** | La clé d'obfuscation de la trame. Selon le protocole, elle contient aussi la valeur de commande brute : l'appareil en extrait l'octet de commande pour les protocoles RTW et RTV. |
| **Adresse** | L'adresse 24 bits de la télécommande émettrice. |
| **Commandes** | Le bouton enfoncé (voir la liste ci-dessous). |
| **Code** | Le code tournant (*rolling code*) porté par la trame. |
| **RSSI** | La force du signal reçu pour cette trame. |
| **Bits** | Le nombre de bits de la trame, et le protocole. Le plus souvent 56 ou 80. |
| **Temps** | Heure locale, selon le fuseau défini dans [Configurer le Système](../configuration/systeme.md#options). |

<details markdown="1">
<summary>👉 Les valeurs possibles de la colonne « Commandes »</summary>

`Up` · `Down` · `My` · `My+Up` · `My+Down` · `My+Up+Down` · `Up+Down` · `Prog` · `SunFlag` ·
`Sensor` · `Step Up` · `Step Down`

</details>

## Les boutons

* **`COPIER`** : copie l'intégralité du journal dans le presse-papiers.
* **`EFFACER`** : vide la liste, pour repartir sur une session de test propre.

## Demander de l'aide

Le journal copié est **la pièce jointe la plus utile** que vous puissiez fournir : il contient
l'adresse de vos télécommandes, le protocole, le RSSI et les horodatages. Commencez par
`EFFACER`, reproduisez le problème, puis `COPIER` : vous obtenez une trace courte et lisible
plutôt que des centaines de lignes.

Trois endroits, selon ce que vous cherchez :

| Votre situation | Où aller |
| :--- | :--- |
| **Une question, un réglage qui résiste, une installation à mettre au point** | Le sujet dédié sur le [forum HACF](https://forum.hacf.fr/t/espsomfy-rts-pour-la-gestion-de-vos-volets-rts-nouvelle-version/77935) — c'est le lieu d'échange principal, en français, et d'autres utilisateurs ont souvent rencontré le même cas. |
| **Un doute sur le fonctionnement attendu, une idée, une demande** | Les [Discussions GitHub](https://github.com/xkain/ESPSomfy-RTS/discussions) du dépôt. |
| **Un défaut reproductible du firmware** | Une [issue GitHub](https://github.com/xkain/ESPSomfy-RTS/issues) : le comportement attendu, celui observé, et la version du firmware. |

!!! tip "Astuce"

    Dans le doute, le **forum** d'abord. Un problème de configuration y trouve généralement sa
    réponse plus vite, et s'il s'avère que le firmware est en cause, l'issue sera ouverte ensuite
    avec un diagnostic déjà dégrossi.

!!! note "Note"

    Pensez à joindre, en plus du journal : la **version du firmware** (visible dans
    [Configurer le Système → Firmware](../configuration/systeme.md#firmware)), votre **modèle de carte**,
    et vos réglages radio — fréquence de base, largeur de bande, déviation.

---

# Identifier le protocole (colonne Bits)

C'est l'usage le plus utile de cette page : savoir quoi choisir au moment d'ajouter un équipement.

| Valeur affichée | Protocole à sélectionner |
|---|---|
| **56-S** | **RTS** standard (56 bits) |
| **80-S** | **RTS** étendu (80 bits) |
| **56-W** | **RTW** (souvent les moteurs de marque ASA) |
| **56-V** | **RTV** |

!!! tip "Astuce"

    Vous hésitez sur le type de vos moteurs ? Ne devinez pas : ouvrez cette page, manipulez la
    télécommande d'origine, et lisez le suffixe. `-S`, `-W` ou `-V` vous donne la configuration
    exacte à appliquer dans [Configurer la Radio](configurer.md#protocoles-et-valeurs-par-défaut)
    ou sur l'équipement lui-même.

---

# Interpréter le RSSI

L'échelle des valeurs est donnée une fois pour toutes dans
[Interpréter la qualité du signal](configurer.md#interpréter-la-qualité-du-signal-rssi).

Ce qui est propre à cette page, c'est la lecture que l'on en fait **trame par trame** : un RSSI
faible sur une trame qui apparaît quand même n'est pas forcément un problème, puisque la trame a
été décodée. Ce qui doit vous alerter, c'est une télécommande qui **n'apparaît qu'une fois sur
trois** : le signal est alors à la limite du décrochage. Rapprochez l'appareil, ou revoyez son
emplacement.

---

# Guide de dépannage

## La radio est désactivée, ou l'icône radio reste barrée de rouge

L'ESP32 ne parvient pas à dialoguer avec le module CC1101. Le problème est en amont de la radio :

* **Câblage** : vérifiez les soudures et l'ordre des broches. Attention, l'ordre s'inverse
    (droite/gauche) quand on retourne le module CC1101 pour le brancher.
* **Configuration** : vérifiez que les GPIO saisis dans
    [Assignation GPIO](configurer.md#assignation-gpio) correspondent au câblage réel,
    SCLK/CSN/MOSI/MISO en premier.
* **Conflit GPIO** : sur une carte Ethernet, assurez-vous qu'aucune broche SPI n'est partagée avec
    le contrôleur réseau.

## Le RSSI varie, mais rien n'apparaît dans les journaux

La radio capte de l'énergie sans réussir à décoder quoi que ce soit. Trois causes, dans cet ordre :

1. **Broches RX et TX inversées.** C'est la plus fréquente, et la plus rapide à écarter.
2. **Fenêtre d'écoute mal placée.** Poussez la **Largeur de bande RX** au maximum
    (`812,50 kHz`) et enregistrez : si des trames apparaissent, c'est un écart de fréquence, et
    c'est la [procédure d'accord](configurer.md#accorder-la-radio) qu'il vous faut.
3. **Bruit ambiant.** Micro-ondes, routeur Wi-Fi, alimentation à découpage à proximité immédiate.

!!! note "Note"

    Ne cherchez pas du côté de la **déviation**, contrairement à ce qu'on lit souvent : elle n'a
    **aucun effet sur la réception**, c'est mesuré. L'explication est dans
    [Qui fait quoi](configurer.md#qui-fait-quoi).

## Certaines télécommandes apparaissent, d'autres pas

C'est un écart de calage entre vos télécommandes, pas une panne. Le cas est traité pas à pas dans
[« 6 équipements sur 8 répondent »](configurer.md#exemple--6-équipements-sur-8-répondent).

## Réception OK mais émission impossible

Les trames défilent quand vous utilisez la télécommande, mais l'interface ne fait bouger aucun
équipement :

* **Inversion RX/TX** : le CC1101 ne peut émettre que par **GDO0**. Si GDO0 et GDO2 sont inversés
    dans vos réglages, la réception marchera et l'émission échouera — exactement ce symptôme.
* **Fréquence d'émission** : l'émission n'utilise que la **Fréquence de base**, sans largeur de
    bande pour la rattraper. Si vous avez décentré la fréquence pour récupérer une télécommande en
    réception, vous avez peut-être perdu l'émission vers les autres moteurs.
* **Mémoire du moteur** : les moteurs Somfy ont un nombre limité d'emplacements. S'il est plein,
    le moteur ignore les nouvelles tentatives d'appairage.

---

**Pages liées :** [Configurer la Radio](configurer.md) ·
[Balayage de Fréquence](balayage-frequence.md) · [EQUIPEMENTS](../somfy/equipements.md)

