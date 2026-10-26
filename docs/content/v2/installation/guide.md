# Guide d'installation

Cette page couvre la **première installation** d'ESPSomfy-RTS en v2.x : écrire l'ESP32 en entier par
USB, depuis un navigateur, sans rien installer sur votre ordinateur — avec
l'[installateur web d'ESPSomfy-RTS](../../outils/installateur-web.md), ou, en secours, avec
[web.esphome.io](../../outils/installateur-esphome.md). C'est la voie à prendre dans deux
cas — un ESP32 qui n'a jamais reçu ce firmware, et un appareil qui tourne aujourd'hui sous le
firmware d'origine de **rstrouse**.

Une fois l'appareil en service, vous n'y revenez plus : les versions suivantes s'installent depuis
l'interface, en deux clics — voir [Mettre à jour](../configuration/mettre-a-jour.md).

---

## 1. Pourquoi par USB, et pas depuis l'interface

L'appareil tient en deux partitions, le firmware et l'interface web, et une **table de partition**
qui dit où chacune commence. Les mises à jour par l'interface réécrivent les partitions, jamais la
table : elles supposent un ESP32 déjà découpé à la bonne mesure.

L'image dite **onboard** est la seule à contenir l'ensemble — chargeur d'amorçage, table de
partition, firmware et interface. Elle écrase l'ESP32 du premier au dernier octet, et c'est
précisément ce qu'il faut pour une première installation.

| Votre situation | La voie à prendre |
| --- | --- |
| ESP32 neuf, ou firmware d'un autre projet | **Cette page** — USB, image `onboard` |
| Firmware d'origine de rstrouse | **Cette page** — USB, image `onboard` |
| Déjà sous ce firmware | [Mettre à jour](../configuration/mettre-a-jour.md), depuis l'interface |

!!! warning "Avertissement"

    **Ne passez pas du firmware de rstrouse à celui-ci par sa page Firmware.** Cette route n'est pas
    prise en charge : elle ne remplace qu'une moitié du système, et laisse une interface et un
    firmware qui ne se comprennent pas. L'installation complète par USB est la seule voie.

## 2. Prérequis

Un ordinateur avec un navigateur compatible Web Serial (Chrome, Edge, Brave, Opera, ou Firefox
151 minimum), un **câble USB de données** et le pilote USB-série de votre carte : tout est détaillé
dans [Ce qu'il vous faut](../../outils/installateur-web.md#ce-quil-vous-faut), sur la page de
l'installateur web.

## 3. Télécharger la bonne image

Ouvrez la page de la dernière version publiée :
[**github.com/xkain/ESPSomfy-RTS/releases/latest**](https://github.com/xkain/ESPSomfy-RTS/releases/latest)
— la liste complète des versions est sur
[la page Releases](https://github.com/xkain/ESPSomfy-RTS/releases).

Dépliez sa section **Assets** : elle publie treize fichiers, et pour une installation par USB
**un seul vous concerne**, celui dont le nom contient `onboard`.

<img height="500" alt="Section Assets d'une release" src="../img/guide-d-installation-1-clair.webp#only-light" /><img height="500" alt="Section Assets d'une release" src="../img/guide-d-installation-1-sombre.webp#only-dark" />

| Votre ESP32 | Le fichier à prendre |
| --- | --- |
| ESP32 classique, sans PSRAM | `SomfyController.onboard.esp32.bin.zip` |
| ESP32 avec PSRAM (WROVER) | `SomfyController.onboard.esp32wrover.bin.zip` |
| ESP32-S2 | `SomfyController.onboard.esp32s2.bin.zip` |
| ESP32-S3, flash de 4 Mo | `SomfyController.onboard.esp32s3_4mb.bin.zip` |
| ESP32-S3, flash de 8 Mo | `SomfyController.onboard.esp32s3_8mb.bin.zip` |
| ESP32-C3 | `SomfyController.onboard.esp32c3.bin.zip` |

Avec l'**installateur web d'ESPSomfy-RTS**, donnez l'archive **telle quelle** : il lit le `.zip`
lui-même. Avec **web.esphome.io**, **décompressez-la** pour obtenir le `.bin` qu'elle contient :
c'est ce fichier que vous donnerez à l'outil.

!!! note "Note"

    Les deux **éditions préassemblées** reposent toutes les deux sur un ESP32 sans PSRAM :
    prenez `SomfyController.onboard.esp32.bin.zip`, pour le modèle Wi-Fi comme pour le modèle
    Ethernet. Voir [Boîtiers préassemblés](../materiel/boitiers-preassembles.md).

!!! tip "Astuce"

    Les douze autres fichiers ne servent qu'aux mises à jour d'un appareil déjà installé, et leur
    rôle est détaillé dans
    [Les fichiers d'une release](../configuration/mettre-a-jour.md#2-les-fichiers-dune-release).

## 4. Avant d'écraser : la sauvegarde

Si un appareil est déjà en service — sous ce firmware ou sous celui de rstrouse — **prenez une
sauvegarde avant de flasher**. L'image `onboard` efface tout l'ESP32, configuration comprise :
équipements, groupes, pièces, réseau, tout disparaît.

Depuis l'interface actuelle, onglet `Système` > sous-onglet `Firmware`, le bouton
`Sauvegarde de la configuration` télécharge un fichier `.backup` dans votre navigateur. Mettez-le
de côté : vous le rechargerez après l'installation.

## 5. Flasher par USB

Deux outils, qui écrivent la même image :

<div class="grid cards" markdown>

-   :material-usb-flash-drive:{ .lg .middle } **[Installateur web ESPSomfy-RTS](../../outils/installateur-web.md)**

    ---

    **La voie recommandée.** Choisissez **Téléverser**, puis l'onglet **Images v2.x** et votre
    fichier `onboard`. Les journaux série sont intégrés.

-   :material-lifebuoy:{ .lg .middle } **[Installateur de secours : web.esphome.io](../../outils/installateur-esphome.md)**

    ---

    Si le premier ne fonctionne pas pour vous. Un outil tiers, décrit pas à pas, avec captures.

</div>

!!! note "Certaines cartes demandent un geste"

    Le D1 Mini se flashe tel quel, au simple branchement ; le WT32-ETH01 a besoin qu'on le mette
    en mode flash — sur l'édition Ethernet des [boîtiers officiels](../materiel/boitiers-preassembles.md),
    un bouton-poussoir en face inférieure s'en charge. Voir
    [Composants](../../commun/composants.md).

## 6. Premier démarrage

L'appareil sort d'usine sans réseau : il ouvre donc son **propre point d'accès Wi-Fi**.

1. Depuis un téléphone ou un ordinateur, connectez-vous au réseau `ESPSomfyRTS`, sans mot de passe.
2. Ouvrez `http://192.168.4.1`.
3. Si l'interface paraît incomplète, forcez le rafraîchissement du navigateur : **Ctrl + F5** sous
    Windows et Linux, **Cmd + Maj + R** sur Mac.
4. Renseignez votre réseau — la procédure complète, Wi-Fi comme Ethernet, est dans [Connexion](../configuration/connexion.md).

!!! important "Important"

    **Une installation complète efface aussi la préconfiguration des boîtiers préassemblés** :
    fuseau horaire, langue, assignation des GPIO et activation de la radio reviennent aux réglages
    universels. L'interface embarque un assistant qui remet les quatre d'un coup — voir
    [Boîtiers préassemblés](../materiel/boitiers-preassembles.md). Sans lui, la radio reste muette : rien ne sera émis.

## 7. Si vous veniez du firmware de rstrouse

Rechargez votre `.backup` depuis l'onglet `Système` > sous-onglet `Firmware`. Vos **équipements,
groupes et adresses de télécommande** sont repris : vos moteurs n'ont pas à être réappairés.

* **Un avertissement de compatibilité s'affiche pendant la restauration.** Il est attendu, et ne
    signale pas un échec.
* **L'assignation des GPIO n'est pas restaurée.** Le sélecteur de carte introduit par ce fork ne
    peut pas la deviner depuis un fichier plus ancien : il faut la refaire à la main dans l'onglet
    `Radio` — voir [Configurer la Radio](../radio/configurer.md).

!!! important "Important"

    Si votre sauvegarde refuse de se charger, [ouvrez une
    issue](https://github.com/xkain/ESPSomfy-RTS/issues). Le fichier peut être analysé et corrigé à
    la main pour redevenir lisible.

---

## Étape suivante

* [Connexion](../configuration/connexion.md) — rejoindre votre réseau, en Wi-Fi ou en Ethernet.
* [Tableau de bord](../tableau-de-bord.md) — la visite de l'interface, écran par écran.
* [Mettre à jour](../configuration/mettre-a-jour.md) — les versions suivantes, depuis l'interface.

