# Anatomie du fichier de sauvegarde

!!! note "Note"

    Cette page documente le format binaire du fichier `.backup` produit par
    [Sauvegarder](index.md#maintenance) — reprise et mise à jour, pour la v3.0.0, de la page
    [Backup File Anatomy](https://github.com/rstrouse/ESPSomfy-RTS/wiki/Backup-File-Anatomy)
    du projet d'origine (rstrouse). Elle s'adresse à qui veut inspecter, éditer à la main ou
    scripter un fichier de sauvegarde — ce n'est pas un pré-requis pour utiliser
    [Restaurer le système](restaurer.md) au quotidien.

## Versionnage

Chaque fichier porte un numéro de version d'en-tête. Le firmware s'en sert pour continuer à
relire correctement des sauvegardes plus anciennes à mesure que de nouveaux champs
s'ajoutent — un champ apparu après coup est simplement absent d'un vieux fichier, et le
lecteur lui laisse sa valeur par défaut plutôt que de décaler tout le reste. Chaque champ documenté
plus bas porte la version d'en-tête à partir de laquelle il est présent.


!!! note "Note"

    Ce format sert aussi, sous une forme réduite, au fichier interne `/shades.cfg` que
    l'appareil tient en fonctionnement normal (pièces, équipements, groupes, répéteurs) — mais
    sans les enregistrements Réglages/Réseau/Radio ni le bloc Plannings, qui n'existent que dans
    un `.backup` produit par **Sauvegarder**. C'est ce dernier, le plus complet, qui est
    documenté ici.

## Principe général

Comme dans le format d'origine, le fichier est entièrement en texte lisible : un en-tête sur
la première ligne, puis un enregistrement par ligne. Chaque donnée est séparée par une
virgule, les nombres sont cadrés à droite et complétés d'espaces, le texte à largeur fixe est
cadré à gauche et complété d'espaces, et le texte à longueur variable est entouré de
guillemets (ce qui lui permet de contenir lui-même une virgule sans ambiguïté).

!!! note "Note"

    **Le padding n'est pas un détail cosmétique : c'est ce qui garde le fichier aligné.** Un
    champ texte à largeur fixe (un nom d'équipement, par exemple) est systématiquement complété
    jusqu'à exactement sa largeur déclarée moins un caractère, puis suivi du séparateur. Si cette
    règle n'est pas respectée à la lettre — y compris à la relecture, qui doit « boire » tout
    dépassement jusqu'au prochain séparateur plutôt que de s'arrêter pile à la largeur annoncée —
    un seul champ mal aligné décale tous les suivants, et l'enregistrement entier devient
    illisible (« Invalid Shade Record Size » au redémarrage, équipements et groupes perdus).
    C'est un piège réel rencontré pendant le développement de la v3.0.0, pas une précaution
    théorique.

Pour se prémunir d'un fichier tronqué ou corrompu, le firmware vérifie à la lecture que la
taille totale calculée à partir de l'en-tête correspond à la taille réelle du fichier, et que
chaque enregistrement se termine bien à la longueur annoncée — sans pour autant se fier
aveuglément à cette longueur annoncée : la fin réelle d'un enregistrement est toujours le
caractère de fin de ligne qu'il contient, pas un simple calcul d'offset.

### Exemple (en-tête)

```
 26, 76,   29,  3,  352, 22,  206,  2,   77,  1,  118,  165,   68,A1B2C3   
```

Cet en-tête décrit un fichier avec 3 pièces, 22 équipements, 2 groupes et 1 enregistrement de
répéteurs (7 adresses), suivi des blocs réglages (118 octets)/réseau (165 octets)/radio
(68 octets, longueur désormais constante — voir plus bas) puis du bloc plannings — voir le
détail de chaque champ ci-dessous.

## Enregistrement d'en-tête

Un seul enregistrement, toujours en première ligne du fichier, entièrement à largeur fixe.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Version | 3 | La version de ce fichier de sauvegarde | 1+ |
| Longueur de l'en-tête | 3 | La longueur totale de l'en-tête, en octets | 1+ |
| Longueur d'un enregistrement Pièce | 5 | | 19+ |
| Nombre d'enregistrements Pièce | 3 | | 19+ |
| Longueur d'un enregistrement Équipement | 5 | Codée sur 3 caractères avant la version 13 | 1+ |
| Nombre d'enregistrements Équipement | 3 | | 1+ |
| Longueur d'un enregistrement Groupe | 5 | Codée sur 3 caractères avant la version 13 | 11+ |
| Nombre d'enregistrements Groupe | 3 | | 11+ |
| Longueur d'un enregistrement Répéteurs | 5 | | 21+ |
| Nombre d'enregistrements Répéteurs | 3 | | 21+ |
| Longueur de l'enregistrement Réglages | 5 | 0 si absent | 14+ |
| Longueur de l'enregistrement Réseau | 5 | 0 si absent | 14+ |
| Longueur de l'enregistrement Radio | 5 | 0 si absent | 14+ |
| Identifiant serveur | 9 | 6 caractères hexadécimaux dérivés de l'adresse MAC de la puce, complétés d'espaces. Sert aussi au topic MQTT de découverte Home Assistant (`espsomfy-<id>`) — voir [Intégrations](../integrations/index.md) | 14+ |

!!! note "Note"

    Ce dernier champ s'appelait **Chip Id** dans le format d'origine. Il porte toujours la même
    valeur (dérivée de la puce), mais son rôle s'est élargi en v3.0.0 : restaurer les
    **paramètres réseau** sur un appareil qui n'a pas le même identifiant que celui qui a produit
    la sauvegarde ignore volontairement les réglages Ethernet (câblage EMAC propre à la carte
    d'origine) — voir [Restaurer le système](restaurer.md).

!!! note "Note"

    **Pourquoi 14 pièces et non 16, 30 équipements et non 32, 14 groupes et non 16 ?** Le
    format de fichier réserve bien 16 emplacements pour les pièces et les groupes, et 32 pour
    les équipements — ce sont les capacités *brutes* que portent les champs d'en-tête et les
    identifiants ci-dessous. Mais l'algorithme qui attribue un nouvel identifiant côté firmware
    (`getNextRoomId()` / `getNextShadeId()` / `getNextGroupId()`, et de la même façon
    `getNextScheduleId()` pour les plannings — `SomfyRegistry.cpp`/`Schedule.cpp`) ne distribue
    jamais ni l'identifiant **0** (réservé comme valeur sentinelle — pour une pièce, c'est
    précisément **Accueil**, la pièce par défaut toujours présente) ni le **tout dernier**
    identifiant de la plage. Deux emplacements sur 16 (ou 32) restent donc toujours hors
    d'atteinte depuis l'interface, quel que soit le nombre déclaré dans le fichier. Plutôt que
    de laisser l'utilisateur buter sur cet échec bas niveau sans explication, l'interface pose
    elle-même ce plafond réduit en amont, pour pouvoir afficher un message clair indiquant que
    la limite est atteinte plutôt qu'une erreur. C'est ce nombre réduit — **14, 30, 14**, et
    **30** pour les plannings — qui apparaît partout ailleurs sur ce wiki.

## Enregistrement Pièce

Un enregistrement par pièce déclarée (jusqu'à 16, dont 14 réellement atteignables depuis
l'interface — voir la note ci-dessus). Entièrement à largeur fixe, inchangé depuis le format
d'origine.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Id Pièce | 3 | 1 à 16, mais seuls 1 à 14 sont attribués automatiquement par l'interface | 19+ |
| Nom | 20 | | 19+ |
| Ordre d'affichage | 3 | | 19+ |

## Enregistrement Équipement

Un enregistrement par équipement configuré (jusqu'à 32, dont 30 réellement atteignables
depuis l'interface — voir la note plus haut).

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Id Équipement | 3 | 1 à 32, mais seuls 1 à 30 sont attribués automatiquement par l'interface | 1+ |
| Appairé | 5 | `true`/`false` | 1+ |
| Type d'équipement | 3 | Voir la table des types ci-dessous | 1+ |
| Adresse | 10 | L'adresse Somfy (24 bits) attribuée à l'équipement | 1+ |
| Nom | 20 | | 1+ |
| Type d'inclinaison | 3 | 0=Aucune, 1=Tiltmotor, 2=Intégrée, 3=Tilt seul, 4=Mode Euro | 1+ (codage simplifié avant la v3) |
| Protocole | 3 | 0=RTS, 1=RTW, 2=RTV, 8=GP_Relay, 9=GP_Remote | 7+ |
| Longueur de trame | 3 | 56 ou 80 bits | 2+ |
| Temps de montée | 10 | En ms | 1+ |
| Temps de descente | 10 | En ms | 1+ |
| Temps d'inclinaison (commun) | 10 | Ancien champ unique, remplacé en pratique par les deux champs dédiés plus bas (26+) | 1+ |
| Pas (Step Size) | 5 | 1 à 1000 | 6+ |
| Télécommande liée 1 à 5 | 10 chacune | Adresse de la télécommande | 1+ |
| Télécommande liée 6 et 7 | 10 chacune | | 5+ |
| Dernier code tournant | 5 | | 1+ |
| Indicateurs capteurs | 3 | Masque de bits : SunFlag=0x01, SunSensor=0x02, DemoMode=0x04, Windy=0x10, Sunny=0x20, SimMy=0x80 | 8+ |
| Position My | 12 | 5 décimales, -1 = non définie | 1+ (codage simplifié avant la v4) |
| Position My d'inclinaison | 12 | 5 décimales, -1 = non définie | 4+ |
| Position actuelle | 12 | 5 décimales, 0-100 | 1+ |
| Position actuelle d'inclinaison | 12 | 5 décimales, 0-100 | 1+ |
| Inverser commandes | 5 | Haut devient Bas et inversement | 9+ |
| Inverser position | 5 | 0% devient fermé ou ouvert | 10+ |
| Répétitions | 3 | Nombre de répétitions par commande envoyée | 12+ |
| Ordre d'affichage | 3 | | 13+ |
| GPIO Haut | 3 | Si protocole GP_* | 15+ |
| GPIO Bas | 3 | Si protocole GP_* | 15+ |
| GPIO My | 3 | Si protocole GP_Remote | 16+ |
| Indicateurs GPIO | 3 | Bit 1 = déclenchement à l'état bas | 17+ |
| Id Pièce | 3 | | 19+ |
| Retour lumineux | 5 | `true`/`false` — voir [Témoin LED de statut](led-de-statut.md) | 26+ |
| Temps de montée inclinaison | 10 | Remplace le champ commun ci-dessus, calibré séparément dans chaque sens | 26+ |
| Temps de descente inclinaison | 10 | | 26+ |
| Inclinaison d'abord à l'ouverture | 5 | `true`/`false` — voir [Temps de course et lames](../somfy/equipements/calibration.md) | 26+ |
| Inclinaison d'abord à la fermeture | 5 | `true`/`false` | 26+ |
| Zone morte (montée) | 10 | En ms — voir [EQUIPEMENTS](../somfy/equipements/calibration.md) | 26+ |
| Zone morte (descente) | 10 | En ms | 26+ |
| Mode de sortie | 3 | 0=Maintien (latching), 1=Impulsion (pulse) — équipements de type Interrupteur uniquement | 26+ |
| Durée d'impulsion | 5 | En ms, mode Impulsion uniquement | 26+ |
| Vocabulaire d'état | 3 | 0=Marche/Arrêt, 1=Allumé/Éteint, 2=Ouvert/Fermé, 3=Actif/Inactif — purement d'affichage | 26+ |

### Types d'équipement

Un total de 17 type d'équipements :

| Code | Type |
| --- | --- |
| 0 | Store à enroulement |
| 1 | Store vénitien / BSO |
| 2 | Draperie (gauche) |
| 3 | Store banne (awning) |
| 4 | Volet roulant |
| 5 | Portail/porte de garage (1 bouton) |
| 6 | Portail/porte de garage (3 boutons) |
| 7 | Draperie (droite) |
| 8 | Draperie (centre) |
| 9 | Interrupteur (1 bouton) |
| 10 | Interrupteur (2 boutons) |
| 11 | Portail (gauche) |
| 12 | Portail (centre) |
| 13 | Portail (droite) |
| 14 | Portail 1 bouton (gauche) |
| 15 | Portail 1 bouton (centre) |
| 16 | Portail 1 bouton (droite) |

!!! note "Note"

    Les codes 9 et 10 s'appelaient **Dry Contact** / **Dry Contact (toggle)** dans le format
    d'origine — renommés **Interrupteur** en v3.0.0 (voir
    [Contrôle des moteurs avec GPIO](../materiel/controle-moteurs-gpio.md)), la valeur numérique en
    base de données n'a pas changé. Les codes 11 à 16 (portails) sont entièrement nouveaux.

## Enregistrement Groupe

Un enregistrement par groupe (jusqu'à 16, dont 14 réellement atteignables depuis l'interface
— voir la note plus haut), absent des fichiers antérieurs à la version 11.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Id Groupe | 3 | 0 à 16, mais seuls 1 à 14 sont attribués automatiquement par l'interface (0 n'est, comme pour les pièces, jamais distribué) | 11+ |
| Type de groupe | 3 | Toujours 0 actuellement | 11+ |
| Adresse | 10 | L'adresse Somfy attribuée au groupe | 11+ |
| Nom | 20 | | 11+ |
| Protocole | 3 | 0=RTS, 1=RTW, 2=RTV, 8=GP_Relay, 9=GP_Remote | 11+ |
| Longueur de trame | 3 | 56 ou 80 bits | 11+ |
| Id membre 1 à 32 | 3 chacun | Id de l'équipement membre, 0 = emplacement vide | 11+ |
| Répétitions | 3 | | 12+ |
| Ordre d'affichage | 3 | | 13+ |
| Inverser commandes | 5 | | 18+ |
| Id Pièce | 3 | | 19+ |
| Dernier code tournant | 5 | | 24+ |
| Retour lumineux | 5 | `true`/`false`, un seul éclat par commande de groupe | 26+ |

!!! note "Note"

    Capacité réelle : le nombre maximum d'équipements sur l'appareil (30, voir la note
    plus haut) étant inférieur au nombre d'emplacements membre du format (32), au moins deux de
    ces 32 emplacements sont toujours vides — voir
    [GROUPES](../somfy/groupes/index.md)#caractéristiques-techniques) pour la limite effective.

## Enregistrement Répéteurs

Un seul enregistrement, 7 adresses à la suite — absent des fichiers antérieurs à la version 21.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Adresse répéteur 1 à 7 | 10 chacune | Voir [RÉPÉTEUR](../somfy/repeteurs.md)) | 21+ |

## Enregistrement Réglages

Un seul enregistrement, de longueur **variable** (recalculée à chaque sauvegarde en fonction
de la longueur réelle des textes qu'il contient). Absent des fichiers antérieurs à la
version 14.

| Nom | Type | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Firmware | Texte variable | Version du firmware au moment de la sauvegarde | 14+ |
| Nom d'hôte | Texte variable | | 14+ |
| Serveur NTP | Texte variable | | 14+ |
| Fuseau horaire | Texte variable | Au format POSIX | 14+ |
| Couleur d'accentuation | Texte variable | Code couleur hexadécimal — voir [Général](../general/index.md#langue-région-et-apparence) | 26+ |
| Diffusion uPnP (SSDP) | 5 | `true`/`false` | 14+ |
| Vérification des mises à jour | 5 | `true`/`false` | 20+ |
| Langue | 3 | Index numérique interne de la langue active — voir [Gérer les langues](../general/langues.md) | 25+ |
| Affichage en-tête mobile | 3 | 0=Tout, 1=Réseau seul, 2=Uptime seul, 3=Aucun — voir [Tableau de bord](../general/tableau-de-bord.md) | 26+ |
| Inverser colonnes (Desktop) | 5 | `true`/`false` | 26+ |
| Onglet par défaut (Mobile) | Texte variable | `groups` ou `shades` | 26+ |
| Activité radio dans l'en-tête | 5 | `true`/`false` | 26+ |
| Mode d'affichage | 3 | 0=Système, 1=Sombre, 2=Clair — facultatif, peut manquer même dans un fichier v26 | 26+ |
| Témoin de mouvement sur les cartes | 5 | `true`/`false` — facultatif, peut manquer même dans un fichier v26 | 26+ |

!!! note "Note"

    Les deux derniers champs sont lus de façon défensive (présents seulement s'il reste des
    données avant la fin de l'enregistrement) : ce bloc a reçu plusieurs ajouts successifs sans
    faire progresser le numéro de version à chaque fois — voir la note de version en tête de
    page.

## Enregistrement Réseau

Un seul enregistrement, de longueur variable — absent des fichiers antérieurs à la
version 14. Comme dans le format d'origine, **aucun mot de passe** (Wi-Fi, MQTT) n'y figure.

| Nom | Type | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Type de connexion | 3 | 0=Non défini, 1=Wi-Fi, 2=Ethernet, 3=Ethernet préféré, 4=Point d'accès | 14+ |
| DHCP | 5 | `true`/`false` | 14+ |
| Adresse IP | Texte variable | | 14+ |
| Passerelle | Texte variable | | 14+ |
| Masque de sous-réseau | Texte variable | | 14+ |
| DNS 1 | Texte variable | | 14+ |
| DNS 2 | Texte variable | | 14+ |
| Protocole MQTT | Texte variable | Écrit pour compatibilité mais **jamais relu** depuis la v3.0.0 : le protocole est désormais une constante (`mqtt://`), voir note ci-dessous | 22+ |
| Hôte MQTT | Texte variable | | 22+ |
| Port MQTT | 5 | | 22+ |
| Publier la découverte MQTT | 5 | `true`/`false` | 22+ |
| Racine du topic MQTT | Texte variable | | 22+ |
| Topic de découverte MQTT | Texte variable | | 22+ |
| Type de carte Ethernet | 3 | 0=Manuel, 1=WT32-ETH01, 2=ESP32-POE (Olimex), 3=ESP32-EVB (Olimex), 4=T-Internet POE (LilyGO), 5=wESP32 v7+, 6=wESP32 <v7, 7=EST-PoE-32 | 14+ |
| Type de PHY | 3 | 0=LAN8720, 1=TLK110, 2=RTL8201, 3=DP83848, 4=DM9051, 5=KZ8081 | 14+ |
| Mode d'horloge | 3 | 0=GPIO0 Entrée, 1=GPIO0 Sortie, 2=GPIO16 Sortie, 3=GPIO17 Sortie | 14+ |
| Adresse PHY | 4 | | 14+ |
| Broche PWR | 4 | | 14+ |
| Broche MDC | 4 | | 14+ |
| Broche MDIO | 4 | | 14+ |

!!! note "Note"

    **MQTTS (MQTT chiffré via TLS) a été évalué puis abandonné pour la v3.0.0** (empreinte
    mémoire trop lourde pour tenir à côté du reste, et incompatible avec l'OTA en l'état) : la
    connexion MQTT est désormais toujours en clair sur le réseau local, d'où un champ protocole
    qui ne sert plus qu'à ne pas décaler la lecture d'anciens fichiers. Le type de carte
    Ethernet 7 (EST-PoE-32) est également nouveau par rapport au format d'origine.

## Enregistrement Radio (Transceiver)

Un seul enregistrement, entièrement à largeur fixe — absent des fichiers antérieurs à la
version 14.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Activé | 5 | `true`/`false` | 14+ |
| Protocole | 3 | 0=RTS, 1=RTW, 2=RTV | 14+ |
| Longueur de trame | 3 | 56 ou 80 bits | 14+ |
| Préréglage de carte | 3 | Voir [Composants](../../commun/composants.md) — avant la v25, ce champ n'existait pas et vaut toujours 0 à la relecture d'un ancien fichier | 25+ |
| Broche SCK | 3 | | 14+ |
| Broche CSN | 3 | | 14+ |
| Broche MOSI | 3 | | 14+ |
| Broche MISO | 3 | | 14+ |
| Broche TX | 3 | | 14+ |
| Broche RX | 3 | | 14+ |
| Fréquence | 10 | 3 décimales | 14+ |
| Largeur de bande RX | 9 | 2 décimales | 14+ |
| Puissance d'émission | 4 | | 14+ |

!!! important "Important"

    **La Déviation de fréquence a disparu** de cet enregistrement en v3.0.0 : le format
    d'origine la plaçait entre la largeur de bande RX et la puissance d'émission. Elle n'est
    plus écrite — lue et aussitôt jetée uniquement pour les anciens fichiers qui la portent
    encore (reconnus à la taille déclarée de cet enregistrement). La modulation RTS est OOK, pas
    FSK : la déviation n'intervient tout simplement pas à la réception, elle n'avait donc aucun
    effet réel — voir [Configurer la Radio](../radio/index.md) pour la marge RF.

## Bloc Plannings

**Absent du format d'origine.** Les plannings (voir [Plannification](../somfy/equipements/plannification.md))
n'existaient pas dans la version documentée par rstrouse — il s'agit d'un composant entièrement
nouveau, ajouté après coup à la suite de l'enregistrement Radio plutôt qu'intégré aux compteurs
de l'en-tête principal. Il porte son propre mini en-tête auto-descriptif :

| Nom | Longueur | Commentaire |
| --- | --- | --- |
| Version du bloc | 3 | Actuellement 1 |
| Longueur d'un enregistrement | 5 | Actuellement 79 |
| Nombre d'enregistrements | 3 | Jusqu'à 32, dont 30 réellement atteignables depuis l'interface — même mécanisme que pièces/équipements/groupes, voir la note plus haut |

Suivi d'un enregistrement par planning :

| Nom | Longueur | Commentaire |
| --- | --- | --- |
| Id Planning | 3 | |
| Nom | 20 | |
| Masque de jours | 3 | Un bit par jour, bit 0 = Dimanche |
| Heure | 3 | 0-23, ignoré si la référence est le lever/coucher du soleil |
| Minute | 3 | 0-59, idem |
| Type de cible | 3 | 0=Équipement, 1=Groupe |
| Id de la cible | 3 | |
| Position cible | 3 | 0-100%, utilisé seulement en mode Position |
| Inclinaison cible | 4 | -1 = non applicable |
| Activé | 5 | `true`/`false` |
| Tentatives | 3 | Nombre de relances en cas d'échec |
| Mode de position | 3 | 0=Position, 1=My, 2=Inclinaison seule |
| Référence temporelle | 3 | 0=Heure fixe, 1=Lever du soleil, 2=Coucher du soleil |
| Décalage solaire | 6 | En minutes, signé — utilisé si la référence est le lever/coucher du soleil |

!!! note "Note"

    Ce même bloc existe sous deux formes distinctes dans le firmware : intégré au fichier
    `.backup` (documenté ici), et comme fichier autonome `/schedules.cfg` utilisé en
    fonctionnement normal. Les deux partagent exactement le même format d'enregistrement.

!!! warning "Avertissement"

    Restaurer la case **Équipements, groupes, pièces et plannings** efface d'abord
    systématiquement tous les plannings actuellement sur l'appareil, puis ne les recharge que si
    ce bloc est présent et lisible dans le fichier. Restaurer une sauvegarde **antérieure à ce
    bloc** (ou tronquée) via cette case supprime donc vos plannings actuels, même si vous ne
    cherchiez qu'à récupérer vos équipements — voir
    [Restaurer le système](restaurer.md).

## Exemple de fichier complet

!!! note "Note"

    Toutes les valeurs ci-dessous sont **fictives** — adresses radio, codes tournants, réseau et
    identifiant serveur ont été inventés pour l'exemple, un vrai fichier n'est jamais partagé tel
    quel (ces informations permettent, entre autres, d'émettre des commandes radio à la place de
    l'appareil d'origine). La structure, elle, est strictement conforme au format v26 décrit sur
    cette page : 3 pièces, 10 équipements tous **appairés**, 3 groupes (dont un renommé et deux
    ajoutés, avec des équipements effectivement liés), 1 répéteur, puis les blocs
    réglages/réseau/radio et 4 plannings.

```
 26, 76,   29,  3,  352, 10,  206,  3,   77,  1,  151,  182,   68,A1B2C3   
  1,Salon               ,  0
  2,Cuisine             ,  1
  3,Chambre             ,  2
  1,true ,  4,    100101,Volet Chambre 1     ,  0,  0, 56,     17500,     17000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   42,  1,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  3,  0,  0,  0,  0,  0,  3,false,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
  2,true ,  4,    100102,Volet Chambre 2     ,  0,  0, 56,     17000,     16400,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   18,  1,    -1.00000,    -1.00000,    45.00000,     0.00000,false,false,  3,  1,  0,  0,  0,  0,  3,false,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
  3,true ,  4,    100103,Volet Atelier       ,  0,  0, 56,     17000,     16500,      7000,  100,         0,         0,         0,         0,         0,         0,         0,    7,  0,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  0,  2,  0,  0,  0,  0,  0,false,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
  4,true ,  4,    100104,Volet Salon         ,  0,  0, 56,     30000,     26300,      7000,  100,         0,         0,         0,         0,         0,         0,         0,  247, 20,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  2,  3,  0,  0,  0,  0,  1,true ,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
  5,true ,  1,    100105,Store Vénitien     ,  2,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   20,131,    71.00000,     0.00000,    71.00000,    31.00000,false,false,  0,  4,  0,  0,  0,  0,  1,false,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
  6,true , 13,    100106,Portail             ,  0,  0, 80,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   22,  0,    -1.00000,    -1.00000,     0.00000,     0.00000,false,true ,  0,  5,  0,  0,  0,  0,  0,false,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
  7,true ,  4,    100107,Volet Salon Droit   ,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   14,128,    26.00000,    -1.00000,    26.00000,     0.00000,false,false,  0,  6,  0,  0,  0,  0,  1,false,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
  8,true ,  4,    100108,Volet Cuisine Droit ,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   11,128,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  0,  7,  0,  0,  0,  0,  2,false,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
  9,true ,  4,    100109,Volet Cuisine Gauche,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   16,128,    -1.00000,    -1.00000,    19.00000,     0.00000,false,false,  0,  8,  0,  0,  0,  0,  2,false,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
 10,true ,  5,    100110,Porte Garage        ,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,    0,  8,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  0,  9,  0,  0,  0,  0,  0,false,      7000,      7000,true ,true ,         0,         0,  0,    0,  0
  1,  0,    200101,Rez-de-chaussée    ,  0, 56,  4,  7,  8,  9,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  2,  0,false,  0,    0,true 
  2,  0,    200102,Chambres            ,  0, 56,  1,  2,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,false,  3,    0,false
  3,  0,    200103,Ouvertures          ,  0, 56,  6, 10,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  3,  2,false,  0,    0,false
    100199,         0,         0,         0,         0,         0,         0
"v3.0.0","ESPSomfyRTS-Demo","pool.ntp.org","CET-1CEST-2,M3.5.0/02:00:00,M10.5.0/03:00:00","#1a5fb4",true ,true ,  1,  0,false,"groups",true ,  0,true 
  1,true ,"192.168.1.50","192.168.1.1","255.255.255.0","192.168.1.1","0.0.0.0","mqtt://","192.168.1.10", 1883,true ,"espsomfy-a1b2c3","homeassistant",  0,  0,  0,   0,  -1,  23,  18
true ,  0, 56,  1, 18,  5, 23, 19, 21, 22,   433.420,    95.00,  10
  1,   79,  4
  1,Lever volets        ,127,  7, 30,  0,  4,100,  -1,true ,  0,  0,  0,     0
  2,Fermeture nuit      ,127, 22,  0,  1,  1,  0,  -1,true ,  0,  0,  0,     0
  3,Lever du jour       , 62,  0,  0,  0,  1,100,  -1,true ,  1,  0,  1,   -15
  4,Coucher du soleil   ,127,  0,  0,  1,  2,  0,  -1,true ,  0,  1,  2,   -20
```

Quelques pointeurs pour s'y retrouver dans cet exemple :

* **Équipement 5** (« Store Vénitien ») est le seul avec une inclinaison (`tilt=2`, intégrée) —
    ses positions actuelle et d'inclinaison (`71.00000`/`31.00000`) le montrent à mi-course.
* **Équipement 4** (« Volet Salon ») est le seul avec **Retour lumineux** activé (`true` juste
    avant les deux temps d'inclinaison séparés) — à comparer avec les autres, tous à `false`.
* **Groupe 1** (« Rez-de-chaussée ») lie 4 équipements (4, 7, 8, 9) — leurs identifiants
    apparaissent en tête de la longue série de zéros représentant les 32 emplacements membre.
* **Groupe 2** (« Chambres ») a son **Id Pièce** à `3` (Chambre) : contrairement aux
    équipements, un groupe peut être rattaché à une pièce même sans que chacun de ses membres le
    soit individuellement.
* Le **répéteur** (ligne avant les réglages) ne porte qu'une seule adresse sur les 7 possibles —
    les six autres emplacements à `0` sont simplement inutilisés.
* Le **fuseau horaire** dans l'enregistrement Réglages contient lui-même des virgules
    (`M3.5.0/02:00:00,M10.5.0/03:00:00`) : c'est exactement le cas que les guillemets d'un champ
    à longueur variable sont censés protéger.
* Les **4 plannings** illustrent chacun un cas différent : heure fixe sur un équipement, heure
    fixe sur un groupe, lever du soleil avec avance de 15 min un jour sur deux (masque `62` =
    lundi à vendredi), et coucher du soleil en mode My avec un retard de 20 min.

