# Installateur de secours : web.esphome.io

Cette page décrit une **seconde voie** pour écrire le firmware sur votre ESP32 : l'outil de
flashage du projet **ESPHome**, **web.esphome.io**. Elle sert de **secours** quand l'[installateur
web d'ESPSomfy-RTS](installateur-web.md) ne fonctionne pas pour vous : il ne détecte pas votre
carte, il échoue en cours d'écriture, ou vous préférez simplement un second avis.

Elle vaut pour les deux lignées, v2.x comme v3.x : seul le **nom du fichier** à donner change.

!!! note "Un outil tiers"

    web.esphome.io est développé et maintenu par le projet ESPHome, pas par ESPSomfy-RTS. Ses
    écrans, ses libellés et ses captures ci-dessous peuvent évoluer sans que cette page le sache.

## Ce que fait cet outil

Il n'installe pas ESPHome : avec l'option « choisir un fichier », il écrit sur l'ESP32 l'image
que vous lui donnez, **telle quelle, à partir du premier octet**. C'est l'utilitaire `esptool`
porté dans le navigateur, qui parle au chargeur d'amorçage de l'ESP32 par Web Serial — exactement
ce que ferait une ligne de commande, sans ligne de commande.

Deux raisons de l'utiliser : **rien à installer** sur votre ordinateur (ni Python, ni `esptool`,
ni PlatformIO), et la même procédure sous Windows, macOS et Linux. L'image d'ESPSomfy-RTS est
publiée en **un seul fichier** : le chargeur d'amorçage, la table de partition, le firmware et
l'interface y sont déjà fusionnés à leurs adresses respectives, si bien que l'outil n'a rien à
savoir du projet pour l'installer correctement.

## Ce qu'il vous faut

Les prérequis sont les mêmes que ceux de l'[installateur web](installateur-web.md#ce-quil-vous-faut) :
un navigateur compatible Web Serial, un **câble USB de données** et, selon votre carte, le pilote
CP2102 ou CH340.

Il vous faut en plus **l'image complète**, **décompressée** :

| Lignée | Le fichier à prendre dans la release | Repère |
|---|---|---|
| v3.x | `ESPSomfyRTS_<version>_factory_<carte>.zip` | le mot **factory** |
| v2.x | `SomfyController.onboard.<carte>.bin.zip` | le mot **onboard** |

**Décompressez l'archive** : c'est le `.bin` qu'elle contient que vous donnerez à l'outil, pas le
`.zip`. Le détail du nom d'un fichier v3 est expliqué dans
[Comprendre le nom d'un fichier](installateur-web.md#comprendre-le-nom-dun-fichier) ; pour la
v2, voir le [guide d'installation v2.x](../v2/installation/guide.md).

!!! warning "Sauvegardez avant"

    L'écriture efface **tout l'ESP32**, configuration comprise. Si un appareil est déjà en service,
    faites une sauvegarde d'abord : voir
    [Avant d'installer, sauvegardez](installateur-web.md#avant-dinstaller-sauvegardez).

## Pas à pas

!!! note "Langue"

    Le site suit la langue de votre navigateur. Les libellés et les captures ci-dessous sont ceux
    de la version française. Avec un navigateur en anglais, lisez `Connect`,
    `Prepare for first use` et `Install`.

1. **Branchez l'appareil** à votre ordinateur avec le câble USB.
2. Ouvrez [**https://web.esphome.io/**](https://web.esphome.io/) dans un navigateur compatible.
3. Cliquez sur `Connection`.

    ![Bouton Connection de web.esphome.io](outils/img/installateur-esphome-1){ .on-glb width="80%" }

4. Une fenêtre liste les ports série. Choisissez le vôtre — souvent nommé `USB Single Serial`,
    `CP210x` ou `CH340` — puis `Connexion`.

    * *Si aucun port n'apparaît : changez de câble, ou installez le pilote CH340 / CP210x
        correspondant à votre carte.*

        ![Choix du port série](outils/img/installateur-esphome-2){ .on-glb width="80%" }

5. Cliquez sur `INSTALLER`, à droite du bouton bleu `Préparation pour la première utilisation` —
    ce dernier installerait ESPHome, ce n'est pas ce que nous voulons.

    ![Bouton Install](outils/img/installateur-esphome-3){ .on-glb width="80%" }

6. Cliquez sur `Choisir un fichier` et désignez le `.bin` décompressé plus haut.

    ![Choix du fichier binaire](outils/img/installateur-esphome-4){ .on-glb width="80%" }

7. Le fichier choisi, cliquez de nouveau sur `INSTALLER` pour lancer l'écriture.
8. **L'installation se déroule en trois temps** : connexion à l'appareil, effacement complet de
    l'ESP32, puis écriture — c'est seulement à ce moment qu'une barre de progression apparaît.
    **Ne fermez pas l'onglet et ne débranchez pas le câble.**

    ![Nettoyage](outils/img/installateur-esphome-5){ .on-glb width="32%" }
    ![Effacement](outils/img/installateur-esphome-6){ .on-glb width="32%" }
    ![Écriture](outils/img/installateur-esphome-7){ .on-glb width="32%" }

9. Un message annonce la fin de l'installation, et l'appareil redémarre de lui-même.

    ![Succès](outils/img/installateur-esphome-8){ .on-glb width="80%" }

!!! note "Certaines cartes demandent un geste"

    Le D1 Mini se flashe tel quel, au simple branchement ; le WT32-ETH01 a besoin qu'on le mette
    en mode flash — sur l'édition Ethernet des [boîtiers officiels](../boitiers/index.md), un
    bouton-poussoir en face inférieure s'en charge. Voir
    [le cas particulier](installateur-web.md#boitier-ethernet) et
    [Composants](../commun/composants.md).

## Après l'installation

L'appareil sort sans réseau : il ouvre **son propre point d'accès Wi-Fi**, pour lancer
l'assistant de premier démarrage. La suite est décrite dans
[Après l'installation](installateur-web.md#apres) de l'installateur web, puis, selon votre
lignée, dans la documentation [v3.x](../v3/reseau/assistant-de-connexion.md) ou
[v2.x](../v2/configuration/connexion.md).
