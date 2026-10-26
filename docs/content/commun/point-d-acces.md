# Le point d'accès de secours

Quand l'appareil ne parvient pas à rejoindre votre réseau, il ouvre **son propre réseau Wi-Fi** :
le **point d'accès de secours**. Vous vous y connectez avec un téléphone ou un ordinateur, vous
ouvrez `http://192.168.4.1`, et vous pouvez alors configurer l'appareil, même s'il n'a aucun
réseau.

Ce réseau est **local à l'appareil** : il n'a pas d'accès Internet, et il disparaît dès que
l'appareil a rejoint votre réseau.

## Quand s'ouvre-t-il ?

Dès que la connexion principale échoue ou n'existe pas encore :

- **le tout premier démarrage**, ou après une installation complète qui a effacé la mémoire ;
- un **mot de passe Wi-Fi** incorrect, ou une **box en panne** ;
- un **câble Ethernet débranché**, sans secours Wi-Fi configuré.

## Comment s'y connecter

1. Dans la liste des réseaux Wi-Fi de votre téléphone ou de votre ordinateur, choisissez le réseau
   qui **porte le nom de votre appareil** : c'est son **nom d'hôte**, le même que celui
   qu'il affiche sur votre réseau une fois connecté. Si vous changez le nom d'hôte, le nom du
   point d'accès change avec lui.
   
   ![point d'accès 1](commun/img/point-acces-1){ .on-glb }
   
2. Ouvrez **`http://192.168.4.1`** dans un navigateur.

=== "v3.x"

    Le nom d'hôte se choisit dans l'[assistant de connexion](../v3/reseau/assistant-de-connexion.md),
    au premier démarrage. Tant qu'il n'a pas été changé, le réseau s'appelle **ESPSomfyRTS**.

    Le point d'accès peut être **protégé par un mot de passe** : voir
    [Mot de passe du point d'accès](../v3/reseau/mot-de-passe-point-d-acces.md). Sans réglage de
    votre part, il reste **ouvert**.

=== "v2.x"

    Le nom d'hôte se règle dans la page [Options](../v2/configuration/options.md). Tant qu'il n'a
    pas été changé, le réseau s'appelle **ESPSomfyRTS**.

    Le point d'accès de la v2 est toujours **ouvert** : il n'est pas possible de le protéger par
    un mot de passe.

## Comment savoir qu'on est sur le point d'accès

=== "v3.x"

    La barre du haut de l'interface affiche un badge **AP** à la place du badge **WIFI**. En le
    survolant, l'infobulle indique « Point d'accès de secours actif ».

    Au premier démarrage, l'[assistant de connexion](../v3/reseau/assistant-de-connexion.md)
    s'ouvre de lui-même.

=== "v2.x"

    L'interface **ne signale pas** qu'elle tourne sur le point d'accès. Vous le reconnaissez à
    l'adresse `192.168.4.1` et au réseau Wi-Fi auquel vous êtes connecté.

## La langue de l'interface

=== "v3.x"

    L'interface du point d'accès est **en anglais** par défaut. Seuls les [boîtiers officiels](../boitiers/index.md)
    sont **en français** dès le tout premier démarrage.

    Les langues de la v3 sont des paquets **téléchargés depuis GitHub** : or le point d'accès n'a
    pas d'accès Internet, et l'appareil ne peut donc pas en télécharger un à ce moment-là.
    Vous pouvez changer de langue une fois l'appareil connecté à votre réseau, ou
    [importer un fichier de langue](../v3/general/langues.md#importer-un-fichier-manuellement) que
    vous avez téléchargé vous-même.

=== "v2.x"

    Les langues sont **embarquées dans l'appareil**. L'interface est en anglais par défaut, mais
    vous pouvez **changer de langue directement depuis le point d'accès**.

## En sortir

Il suffit de **rejoindre votre réseau** :

- en v3, avec l'[assistant de connexion](../v3/reseau/assistant-de-connexion.md) ;
- en v2, depuis l'onglet **Réseau**, page [Connexion](../v2/configuration/connexion.md).

L'appareil prend alors une adresse de votre box : `http://192.168.4.1` n'est plus accessible, il
faut retrouver sa nouvelle adresse (dans l'interface de votre box, par exemple).

## À ne pas confondre avec le mode Récupération

En v3, un autre réseau Wi-Fi existe pour **réparer** un appareil : le
[mode Récupération](../v3/recuperation.md). Il s'ouvre après trois coupures d'alimentation rapides,
porte le nom **`ESPSomfy-RECOVERY`** et ne demande jamais de mot de passe. Il est volontairement
nommé autrement, pour qu'on ne le confonde pas avec le point d'accès de secours habituel, qui porte
le nom de votre appareil.
