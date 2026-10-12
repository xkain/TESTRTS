<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/Composants.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Composants

Ce guide explique comment fabriquer un appareil ESPSomfy-RTS. Aucun fer à souder ni connaissances avancées en développement ne sont requis : il suffit de quelques composants et de connecteurs Dupont.

### Composants Requis

* 1 - ESP32 Module
* 1 - Module Transmetteur CC1101
* 8 - Câbles connecteurs Dupont (femelle/femelle)

## Choisir son ESP32
Vous devez d'abord choisir entre une connexion Wi-Fi ou Ethernet.

**Spécifications minimales** : La carte doit impérativement avoir au moins 4 Mo de mémoire Flash.<br>
**Mise à jour** : Une fois le premier flashage effectué, les mises à jour logicielles se font à distance (OTA) sans toucher au module.


### Wifi
La plupart répondent aux spécifications mentionnées ci-dessus.

Les cartes supportées :

* ESP-WROOM-32 
* ESP32s2 
* ESP32s3 
* ESP32c3.

### Ethernet
Les cartes Ethernet supportées (PoE ou filaire) :

* Wireless Tag WT32-ETH01
* Olimex ESP32-POE
* Olimex ESP32-EVB
* LILYGO T-Internet POE
* Silicognition wESP32 (toutes les versions)
* Everything Smart EST-PoE-32


> Note : Les modèles Ethernet ont souvent moins de broches disponibles et peuvent nécessiter de débrancher le CC1101 lors du premier flashage série.

!!! important "Important"

    Vérifiez systématiquement la configuration de votre carte. Bien que ces paramètres soient basés sur les dernières données constructeurs, les spécifications techniques peuvent varier d'une série à l'autre. Une configuration Ethernet erronée peut provoquer des dommages matériels irréversibles sur votre ESP32.

## Choix du module CC1101
Modèle privilégié : Le E07-M1101D-SMA (reconnaissable à son PCB bleu). C'est le module le plus fiable pour ce projet, offrant la meilleure sensibilité de réception et une portée optimale.

* **Modèles à éviter** : Les cartes marquées D-SUN. Les tests ont montré une fiabilité médiocre (pannes matérielles, réception instable et portée limitée à moins de 5 mètres).
* **Antenne** : Privilégiez les versions avec connecteur SMA (antenne "duck" amovible) plutôt que les antennes à ressort soudées pour une meilleure stabilité du signal.

!!! tip "Astuce"

    Pour identifier facilement le bon module, cherchez le PCB bleu identique à l'image ci-dessous.
![20260317_225207](https://github.com/user-attachments/assets/dc4dc101-2836-4af1-b17b-8dd1a6cfc18d)


### Optimisation de la portée (Antenne)
Bien que l'antenne "duck" de 5 cm fournie par défaut offre des performances étonnantes, certains environnements (murs épais en pierre, stuc, ou installation en rack serveur) peuvent nécessiter une amélioration du signal.

* **Antennes à éviter** : Méfiez-vous des antennes 433 MHz bon marché ou destinées à d'autres usages (ex: motorisations de portail). Des tests ont montré que certaines antennes mal calibrées peuvent littéralement "tuer" la portée de l'ESPSomfy.
* **Antennes recommandé** : L'utilisation d'une antenne 3dBi de 10 cm (4 pouces) permet de passer par exemple d'un signal de -56 dBm à -31 dBm (plus le chiffre est proche de zéro, meilleur est le signal).

Grâce à ce simple changement, l'appareil peut être placé dans une baie de brassage métallique ou derrière plusieurs murs porteurs sans aucun échec de commande. Le gain en réception est massif, surpassant de loin le matériel Somfy d'origine. Cela permet de capter les télécommandes depuis les zones les plus reculées de la maison et au-delà (jusqu'à 150-200 mètres maximum sans obstacles ni interférences électromagnétiques).

Si vous rencontrez toujours des problèmes de réception après ce changement, l'antenne ne sera pas en cause : vérifiez plutôt vos réglages de fréquences.

!!! tip "Astuce"

    https://fr.aliexpress.com/item/1005005200440286.html?spm=a2g0o.order_list.order_list_main.5.69225e5bxbuO2V&gatewayAdapt=glo2fra#nav-specification

### Assemblage du matériel
Le montage est extrêmement simple et ne nécessite aucune soudure ni plaque d'essai (breadboard). Huit câbles Dupont femelle-femelle (10 cm) suffisent pour relier directement le transmetteur CC1101 à l'ESP32.

Conseils de connexion :

* **Identifier les broches** : Sur de nombreux modules CC1101, les broches ne sont pas nommées mais simplement numérotées. Reportez-vous systématiquement au schéma de câblage fourni dans la section suivante.
* **Variante 10 broches** : Si vous possédez un module à 10 broches, sachez qu'il s'agit d'une version standard avec des broches VCC et GND doublées. Vous pouvez utiliser n'importe lequel des deux ports d'alimentation.
* **Modèles Ethernet (PoE)** : Le câblage diffère car le port Ethernet mobilise de nombreuses broches GPIO.
    * RX : Utilisez de préférence une broche "input-only" (typiquement GPIO 32 ou supérieur).

!!! note "Note"

    Si vous utilisez un modèle Wi-Fi classique, vous n'avez même pas besoin de débrancher la radio pour programmer l'appareil. Tout est géré de manière transparente par le logiciel.


# Configuration des Broches (Pins)

Les réglages ci-dessous sont des suggestions adaptées aux modèles d'ESP32 les plus courants.

ESPSomfy-RTS permet d'utiliser une seule et même broche pour l'émission (TX) et la réception (RX). Le logiciel bascule automatiquement l'état de la broche selon le besoin.

* **Câblage** : Connectez uniquement la broche GDO0 du CC1101 à l'ESP32.
* **Configuration logicielle** : Dans les paramètres radio, assignez le même numéro de GPIO aux champs RX et TX.
* **Avantage** : Cela libère une broche sur votre ESP32, ce qui est particulièrement utile sur les modèles Ethernet (PoE) où les pins disponibles sont limitées.

!!! note "Note"

    Cette configuration simplifiée fonctionne avec tous les modèles de cartes listés dans cette documentation.

## ESP-WROOM-32 / ESP32S
C'est l'option la plus simple, la plus fiable et la plus économique pour une connexion Wi-Fi. Ces cartes intègrent généralement un port USB, ce qui facilite grandement la programmation initiale.

| Pin | Description | ESP32 Pin |
| --- | ----------- | ------- |
| 1 | GND | GND |
| 2 | VCC | 3v3 |
| 3 | GDO0 - c'est la broche TX | GPIO 13 |
| 4 | CSN | GPIO 5 |
| 5 | SCK | GPIO 18 |
| 6 | MOSI | GPIO 23 |
| 7 | MISO | GPIO 19 |
| 8 | GDO2 - c'est la broche RX | GPIO 12 |

<sup>Note : Ce schéma est basé sur le module E07-M1101D. Si vous utilisez un autre modèle de CC1101, fiez-vous aux fonctions de la colonne centrale.</sup>

Conseils d'installation :

* **Broches Tactiles** : Ne choisissez pas de broches "Touch" (capacitives) pour les signaux radio (comme GDO0), car elles sont extrêmement sensibles aux interférences électromagnétiques dès que vous approchez la main du boîtier.
* **Flexibilité** : Vous pouvez modifier ces assignations prédifinies dans l'interface logicielle, mais le schéma ci-dessus est testé et validé pour fonctionner sans conflit.

![image](https://user-images.githubusercontent.com/47839015/227078539-9b7a5f0d-21a4-45c5-b96b-cabfaceafcbb.png)


## ESP32 D1 mini
Cette variante miniature de l'ESP32 combine la compacité de l'ancien format D1 Mini (ESP8266) avec toute la puissance et le Bluetooth de l'ESP32 standard. Son format réduit et standardisé en fait le choix idéal, tout en offrant un port USB-C/Micro-USB natif.

| Pin | Description | ESP32 Pin |
| --- | ----------- | ------- |
| 1 | GND | GND |
| 2 | VCC | 3v3 |
| 3 | GDO0 - c'est la broche TX | GPIO 21 |
| 4 | CSN | GPIO 5 |
| 5 | SCK | GPIO 18 |
| 6 | MOSI | GPIO 23 |
| 7 | MISO | GPIO 19 |
| 8 | GDO2 - c'est la broche RX | GPIO 22 |

<sup>Note : Schéma basé sur le module E07-M1101D. Si vous utilisez un autre modèle, fiez-vous aux fonctions de la colonne centrale.</sup>



## WT32-ETH01
Le modèle WT32-ETH01 permet une connexion via câble Ethernet ou Wi-Fi. Attention : le port Ethernet mobilise une grande partie des broches de l'ESP32, ce qui réduit considérablement le nombre de ports disponibles pour le transmetteur.

| Pin | Description | ESP32 Pin |
| --- | ----------- | ------- |
| 1 | GND | GND |
| 2 | VCC | 3v3 |
| 3 | GDO0 - c'est la broche TX | GPIO 02 |
| 4 | CSN | GPIO 12 |
| 5 | SCK | GPIO 14 |
| 6 | MOSI | GPIO 15 |
| 7 | MISO | GPIO 04 |
| 8 | GDO2 - c'est la broche RX | GPIO 35 |

<sup>Note : Schéma basé sur le module E07-M1101D. Si vous utilisez un autre modèle, fiez-vous aux fonctions de la colonne centrale.</sup>

## Olimex ESP32-PoE/EVB
Ces cartes supportent le Power over Ethernet (PoE), permettant d'alimenter l'appareil et de transmettre les données via un seul câble réseau. Elles offrent plus de flexibilité que le modèle WT32-ETH01 grâce au connecteur UEXT.

| Pin | Description | ESP32 Pin |
| --- | ----------- | ------- |
| 1 | GND | GND |
| 2 | VCC | 3v3 |
| 3 | GDO0 - c'est la broche TX | GPIO 04 |
| 4 | CSN | GPIO 13 |
| 5 | SCK | GPIO 14 |
| 6 | MOSI | GPIO 15 |
| 7 | MISO | GPIO 16 |
| 8 | GDO2 - c'est la broche RX | GPIO 36 |

<sup>Note : Schéma basé sur le module E07-M1101D. Si vous utilisez un autre modèle, fiez-vous aux fonctions de la colonne centrale.</sup>

Conseils et Sécurité :

* **Simplicité** : Toutes les broches suggérées sont regroupées sur le connecteur UEXT. Vous pouvez fabriquer un adaptateur direct sans utiliser de plaque d'essai (breadboard).
* **Flashage** : La carte possède un port micro-USB intégré, facilitant la programmation initiale sans convertisseur externe.
* **Attention (Modèles non-ISO)** : Si vous ne possédez pas la version isolée (ISO), ne connectez jamais simultanément le câble Ethernet PoE et le câble USB sous peine d'endommager la carte.
    
    
## LilyGO T-Internet POE
Une autre option compacte supportant l'alimentation par Ethernet (PoE). Bien que le nombre de broches disponibles soit limité, il reste suffisant pour connecter le transmetteur CC1101.

![image](https://github.com/rstrouse/ESPSomfy-RTS/assets/47839015/8569735b-8397-4a1c-9603-9975442d88c7)

<sup><sub>On oublie pas de remercier Oliver pour que graphique</sub></sup>

| Pin | Description | ESP32 Pin |
| --- | ----------- | ------- |
| 1 | GND | GND |
| 2 | VCC | 3v3 |
| 3 | GDO0 - c'est la broche TX | GPIO 04 |
| 4 | CSN | GPIO 12 |
| 5 | SCK | GPIO 14 |
| 6 | MOSI | GPIO 15 |
| 7 | MISO | GPIO 16 |
| 8 | GDO2 - c'est la broche | GPIO 35 |

<sup>Note : Schéma basé sur le module E07-M1101D. Si vous utilisez un autre modèle, fiez-vous aux fonctions de la colonne centrale.</sup>

!!! note "Note"

    **Programmation** : Cette carte nécessite une petite carte d'interface (le "programmer card") pour le premier flashage du firmware. Une fois cette étape terminée, l'appareil peut être mis à jour à distance (OTA).


## wESP POE
Cette carte est intéressante car elle offre un nombre de broches disponibles plus important que la plupart des autres options Ethernet.

| Pin | Description | ESP32 Pin |
| --- | ----------- | ------- |
| 1 | GND | GND |
| 2 | VCC | 3v3 |
| 3 | GDO0 - c'est la broche TX | GPIO 04 |
| 4 | CSN | GPIO 05 |
| 5 | SCK | GPIO 18 |
| 6 | MOSI | GPIO 13 |
| 7 | MISO | GPIO 32 |
| 8 | GDO2 - c'est la broche RX | GPIO 39 |

<sup><sub>Note : Schéma basé sur le module E07-M1101D. Si vous utilisez un autre modèle, fiez-vous aux fonctions de la colonne centrale.</sub></sup>

!!! note "Note"

    **Programmation** : Comme pour d'autres modèles compacts, vous devrez utiliser un convertisseur série (dongle USB) pour le flashage initial du firmware. Les mises à jour suivantes pourront être effectuées via le réseau (OTA).
    
## ESP-PoE-32
Une solution robuste pour une connexion Ethernet filaire avec support PoE. Voici la configuration recommandée pour les broches :

![image](https://github.com/user-attachments/assets/f0999ec4-aa52-425c-8004-01a11f60c85e)

| Pin | Description | ESP32 Pin |
| --- | ----------- | ------- |
| 1 | GND | GND |
| 2 | VCC | 3v3 |
| 3 | GDO0 - c'est la broche TX | GPIO 04 |
| 4 | CSN | GPIO 05 |
| 5 | SCK | GPIO 14 |
| 6 | MOSI | GPIO 13 |
| 7 | MISO | GPIO 32 |
| 8 | GDO2 - c'est la broche RX | GPIO 35 |

<sup><sub>Note : Schéma basé sur le module E07-M1101D. Si vous utilisez un autre modèle, fiez-vous aux fonctions de la colonne centrale.</sub></sup>


# ESP32s3 Mini
This is a tiny little postage stamp sized board.  Visit the following [wiki](https://github.com/rstrouse/ESPSomfy-RTS/wiki/Mini-ESP32s3-Device-Build) for an act of miniaturization build.  Here are the pinouts below that work really well.

Cette carte est idéale pour les projets [(voir exemple)](https://github.com/rstrouse/ESPSomfy-RTS/wiki/Mini-ESP32s3-Device-Build) de miniaturisation extrême (format "timbre-poste"). Malgré sa taille réduite, elle offre d'excellentes performances.

![image](https://github.com/rstrouse/ESPSomfy-RTS/assets/47839015/56a660f0-209a-4074-ba78-827f126099cb)

| Pin | Description | ESP32 Pin |
| --- | ----------- | ------- |
| 1 | GND | GND |
| 2 | VCC | 3v3 |
| 3 | GDO0 - c'est la broche TX | GPIO 03 |
| 4 | CSN | GPIO 06 |
| 5 | SCK | GPIO 07 |
| 6 | MOSI | GPIO 09 |
| 7 | MISO | GPIO 08 |
| 8 | GDO2 - c'est la broche RX | GPIO 04 |

<sup><sub>Note : Schéma basé sur le module E07-M1101D. Si vous utilisez un autre modèle, fiez-vous aux fonctions de la colonne centrale.</sub></sup>


