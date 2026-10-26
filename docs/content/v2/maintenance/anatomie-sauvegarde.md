# Anatomie du fichier de sauvegarde

!!! note "Note"

    Cette page documente le format binaire du fichier `.backup` produit par **Sauvegarder**
    (voir [Sauvegarde et restauration](../configuration/firmware.md#sauvegarde-et-restauration)) —
    reprise et mise à jour de la page
    [Backup File Anatomy](https://github.com/rstrouse/ESPSomfy-RTS/wiki/Backup-File-Anatomy)
    du projet d'origine (rstrouse). Elle s'adresse à qui veut inspecter, éditer à la main ou
    scripter un fichier de sauvegarde — ce n'est pas un pré-requis pour sauvegarder et
    restaurer au quotidien.

## Versionnage

Chaque fichier porte un numéro de version d'en-tête. Le firmware s'en sert pour continuer à
relire correctement des sauvegardes plus anciennes à mesure que de nouveaux champs
s'ajoutent — un champ apparu après coup est simplement absent d'un vieux fichier, et le
lecteur lui laisse sa valeur par défaut plutôt que de décaler tout le reste. Chaque champ
documenté plus bas porte la version d'en-tête à partir de laquelle il est présent.

**Les versions v2.x.x actuelles écrivent la version d'en-tête 25.**

!!! note "Note"

    Ce format sert aussi, sous une forme réduite, au fichier interne `/shades.cfg` que
    l'appareil tient en fonctionnement normal : il ne contient que les enregistrements
    Pièce, Équipement, Groupe et Répéteurs, sans les blocs Réglages, Réseau et Radio, qui
    n'existent que dans un `.backup` produit par **Sauvegarder**. C'est ce dernier, le plus
    complet, qui est documenté ici.

## Principe général

Comme dans le format d'origine, le fichier est entièrement en texte lisible : un en-tête sur
la première ligne, puis un enregistrement par ligne. Chaque donnée est séparée par une
virgule, les nombres sont cadrés à droite et complétés d'espaces, le texte à largeur fixe est
cadré à gauche et complété d'espaces, et le texte à longueur variable est entouré de
guillemets (ce qui lui permet de contenir lui-même une virgule sans ambiguïté).

!!! note "Note"

    Toutes les valeurs du fichier ci-dessous sont **fictives** — adresses radio, codes tournants,
    réseau et identifiant serveur ont été inventés pour l'exemple, un vrai fichier n'est jamais
    partagé tel quel (ces informations permettent, entre autres, d'émettre des commandes radio à
    la place de l'appareil d'origine). La structure, elle, est strictement conforme au format
    version 25 décrit sur cette page.

```
 25, 76,   29,  3,  276, 10,  200,  3,   77,  1,  102,  182,   78,A1B2C3   
  1,Salon               ,  0
  2,Cuisine             ,  1
  3,Chambre             ,  2
  1,true ,  4,    100101,Volet Chambre 1     ,  0,  0, 56,     17500,     17000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   42,  1,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  3,  0,  0,  0,  0,  0,  3
  2,true ,  4,    100102,Volet Chambre 2     ,  0,  0, 56,     17000,     16400,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   18,  1,    -1.00000,    -1.00000,    45.00000,     0.00000,false,false,  3,  1,  0,  0,  0,  0,  3
  3,true ,  4,    100103,Volet Atelier       ,  0,  0, 56,     17000,     16500,      7000,  100,         0,         0,         0,         0,         0,         0,         0,    7,  0,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  0,  2,  0,  0,  0,  0,  0
  4,true ,  4,    100104,Volet Salon         ,  0,  0, 56,     30000,     26300,      7000,  100,         0,         0,         0,         0,         0,         0,         0,  247, 20,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  2,  3,  0,  0,  0,  0,  1
  5,true ,  1,    100105,Store Vénitien     ,  2,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   20,131,    71.00000,     0.00000,    71.00000,    31.00000,false,false,  0,  4,  0,  0,  0,  0,  1
  6,true , 13,    100106,Portail             ,  0,  0, 80,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   22,  0,    -1.00000,    -1.00000,     0.00000,     0.00000,false,true ,  0,  5,  0,  0,  0,  0,  0
  7,true ,  4,    100107,Volet Salon Droit   ,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   14,128,    26.00000,    -1.00000,    26.00000,     0.00000,false,false,  0,  6,  0,  0,  0,  0,  1
  8,true ,  4,    100108,Volet Cuisine Droit ,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   11,128,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  0,  7,  0,  0,  0,  0,  2
  9,true ,  4,    100109,Volet Cuisine Gauche,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   16,128,    -1.00000,    -1.00000,    19.00000,     0.00000,false,false,  0,  8,  0,  0,  0,  0,  2
 10,true ,  9,    100110,Lampe Terrasse      ,  0,  8, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,    0,  8,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  0,  9, 32, 33,  0,  1,  1
  1,  0,    200101,Rez-de-chaussée    ,  0, 56,  4,  7,  8,  9,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  2,  0,false,  0,    0
  2,  0,    200102,Chambres            ,  0, 56,  1,  2,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,false,  3,    0
  3,  0,    200103,Ouvertures          ,  0, 56,  6, 10,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  3,  2,false,  0,    0
    100199,         0,         0,         0,         0,         0,         0
"v2.6.0","ESPSomfyRTS-Demo","pool.ntp.org","CET-1CEST-2,M3.5.0/02:00:00,M10.5.0/03:00:00","#1a5fb4",true ,true ,  1
  1,true ,"192.168.1.50","192.168.1.1","255.255.255.0","192.168.1.1","0.0.0.0","mqtt://","192.168.1.10", 1883,true ,"espsomfy-a1b2c3","homeassistant",  0,  0,  0,   0,  -1,  23,  18
true ,  0, 56,  1, 18,  5, 23, 19, 21, 22,   433.420,    99.97,    47.60,  10
```

Ce fichier contient 3 pièces, 10 équipements tous **appairés**, 3 groupes avec des équipements
effectivement liés et 1 enregistrement de répéteurs (7 adresses), suivis des blocs réglages
(102 octets), réseau (182 octets) et radio (78 octets). C'est la première ligne, l'en-tête, qui
annonce tout cela — chaque enregistrement est détaillé dans la suite de la page.

!!! important "Important"

    **Le padding n'est pas un détail cosmétique : c'est ce qui garde le fichier aligné.** Un
    champ texte à largeur fixe (un nom d'équipement, par exemple) est systématiquement complété
    jusqu'à exactement sa largeur déclarée moins un caractère, puis suivi du séparateur. Un seul
    champ mal aligné décale tous les suivants : l'enregistrement ne se termine plus à la longueur
    annoncée, le fichier est rejeté en bloc et le [moniteur série](../../outils/journaux-port-serie.md)
    affiche `Shade record length is … and should be …`.

    Attention en particulier aux accents : le remplissage compte des **octets**, pas des
    caractères. Un nom contenant un `é` tiendra donc une colonne de moins à l'écran que les
    autres — c'est normal, et c'est voulu.

À la lecture d'un fichier de restauration, le firmware vérifie que l'en-tête est cohérent
(version ≥ 1, taille d'enregistrement Équipement et Groupe plausibles) puis, pour chaque
enregistrement Pièce, Équipement et Groupe, que la fin de ligne tombe **exactement** à la
longueur annoncée dans l'en-tête. Si ce n'est pas le cas, la restauration est refusée. Les
trois blocs de fin — Réglages, Réseau, Radio — ne sont pas contrôlés de cette façon : le
lecteur s'y recale sur le caractère de fin de ligne s'il n'est pas tombé juste.

Quelques pointeurs pour s'y retrouver dedans — chacun des champs cités est décrit, section
par section, dans la suite de la page :

* **Équipement 5** (« Store Vénitien ») est le seul avec une inclinaison (type d'inclinaison
    `2`, intégrée) — ses positions actuelle et d'inclinaison (`71.00000`/`31.00000`) le montrent
    à mi-course. Son nom contient un accent : sa colonne tient donc un caractère de moins que
    les autres, pour le même nombre d'octets.
* **Équipement 6** (« Portail ») est le seul en trame **80 bits**, et le seul avec *Inverser
    position* à `true`.
* **Équipement 10** (« Lampe Terrasse ») est un **contact sec** (type `9`) piloté non pas par
    radio mais par les broches de l'ESP32 : son protocole vaut `8` (GP_Relay), ses champs *GPIO
    Haut* et *GPIO Bas* valent `32` et `33`, et son avant-dernier champ, *Indicateurs GPIO*,
    vaut `1` — déclenchement à l'état bas. Voir [Contrôle-des-moteurs-avec-GPIO](../materiel/controle-moteurs-gpio.md).
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
* La longueur de l'enregistrement Réglages annoncée dans l'en-tête est `102`, alors que la
    ligne en fait **116** : c'est l'écart de 14 octets détaillé dans
    [l'enregistrement Réglages](#enregistrement-réglages).

## Enregistrement d'en-tête

Un seul enregistrement, toujours en première ligne du fichier, entièrement à largeur fixe.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Version | 3 | La version de ce fichier de sauvegarde | 1+ |
| Longueur de l'en-tête | 3 | La longueur totale de l'en-tête, en octets (76 en version 25) | 1+ |
| Longueur d'un enregistrement Pièce | 5 | 29 en version 25 | 19+ |
| Nombre d'enregistrements Pièce | 3 | | 19+ |
| Longueur d'un enregistrement Équipement | 5 | 276 en version 25. Codée sur 3 caractères avant la version 13 | 1+ |
| Nombre d'enregistrements Équipement | 3 | | 1+ |
| Longueur d'un enregistrement Groupe | 5 | 200 en version 25. Codée sur 3 caractères avant la version 13 | 11+ |
| Nombre d'enregistrements Groupe | 3 | | 11+ |
| Longueur d'un enregistrement Répéteurs | 5 | 77 en version 25 | 21+ |
| Nombre d'enregistrements Répéteurs | 3 | Toujours 1 | 21+ |
| Longueur de l'enregistrement Réglages | 5 | 0 si absent | 14+ |
| Longueur de l'enregistrement Réseau | 5 | 0 si absent | 14+ |
| Longueur de l'enregistrement Radio | 5 | 0 si absent — 78 en version 25 | 14+ |
| Identifiant serveur | 9 | 6 caractères hexadécimaux dérivés de l'adresse MAC de la puce, complétés d'espaces. Sert aussi au topic MQTT de découverte Home Assistant (`espsomfy-<id>`) — voir [MQTT](../integrations/mqtt.md#auto-découverte-mqtt-auto-discovery) | 14+ |

!!! note "Note"

    Ce dernier champ s'appelle **Chip Id** dans le format d'origine. C'est lui qui décide du
    sort des réglages Ethernet à la restauration : si l'identifiant du fichier ne correspond pas
    à celui de l'appareil en cours de restauration, le bloc de câblage EMAC (type de carte, PHY,
    horloge, broches) est délibérément ignoré, puisqu'il décrit une carte qui n'est pas celle
    qu'on a devant soi. Tout le reste du bloc Réseau est restauré normalement.

!!! note "Note"

    **Pourquoi 14 pièces et non 16, 30 équipements et non 32, 14 groupes et non 16 ?** Le
    format de fichier réserve bien 16 emplacements pour les pièces et les groupes, et 32 pour
    les équipements — ce sont les capacités *brutes* que portent les champs d'en-tête et les
    identifiants ci-dessous. Mais l'algorithme qui attribue un nouvel identifiant côté firmware
    (`getNextRoomId()` / `getNextShadeId()` / `getNextGroupId()`) ne distribue jamais ni
    l'identifiant **0** (réservé comme valeur sentinelle — pour une pièce, c'est précisément
    **Accueil**, la pièce par défaut toujours présente) ni le **tout dernier** identifiant de la
    plage. Deux emplacements sur 16 (ou 32) restent donc toujours hors d'atteinte depuis
    l'interface, quel que soit le nombre déclaré dans le fichier. Plutôt que de laisser
    l'utilisateur buter sur cet échec bas niveau sans explication, l'interface pose elle-même ce
    plafond réduit en amont, pour pouvoir afficher un message clair indiquant que la limite est
    atteinte. C'est ce nombre réduit — **14, 30, 14** — qui apparaît partout ailleurs sur ce
    wiki.

## Enregistrement Pièce

Un enregistrement par pièce déclarée (jusqu'à 16, dont 14 réellement atteignables depuis
l'interface — voir la note ci-dessus). Entièrement à largeur fixe, inchangé depuis le format
d'origine. Longueur totale : **29 octets**.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Id Pièce | 3 | 1 à 16, mais seuls 1 à 14 sont attribués automatiquement par l'interface | 19+ |
| Nom | 20 | | 19+ |
| Ordre d'affichage | 3 | | 19+ |

Voir [Pièces (Rooms)](../somfy/pieces.md).

## Enregistrement Équipement

Un enregistrement par équipement configuré (jusqu'à 32, dont 30 réellement atteignables
depuis l'interface — voir la note plus haut). Longueur totale : **276 octets**.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Id Équipement | 3 | 1 à 32, mais seuls 1 à 30 sont attribués automatiquement par l'interface | 1+ |
| Appairé | 5 | `true`/`false` | 1+ |
| Type d'équipement | 3 | Voir la table des types ci-dessous | 1+ |
| Adresse | 10 | L'adresse Somfy (24 bits) attribuée à l'équipement | 1+ |
| Nom | 20 | | 1+ |
| Type d'inclinaison | 3 | 0=Aucune, 1=Moteur inclinaison, 2=Intégrée, 3=Inclinaison seule, 4=Inclinaison Euro | 1+ |
| Protocole | 3 | 0=RTS, 1=RTW, 2=RTV, 8=GP_Relay, 9=GP_Remote | 7+ |
| Longueur de trame | 3 | 56 ou 80 bits | 2+ |
| Temps de montée | 10 | En ms | 1+ |
| Temps de descente | 10 | En ms | 1+ |
| Temps d'inclinaison | 10 | En ms — voir [Les temps de course](../somfy/equipements.md#3-les-temps-de-course) | 1+ |
| Pas (Step Size) | 5 | 1 à 1000 | 6+ |
| Télécommande liée 1 à 5 | 10 chacune | Adresse de la télécommande | 1+ |
| Télécommande liée 6 et 7 | 10 chacune | | 5+ |
| Dernier code tournant | 5 | | 1+ |
| Indicateurs capteurs | 3 | Masque de bits, voir la table ci-dessous | 8+ |
| Position My | 12 | 5 décimales, -1 = non définie | 1+ |
| Position My d'inclinaison | 12 | 5 décimales, -1 = non définie | 4+ |
| Position actuelle | 12 | 5 décimales, 0-100 | 1+ |
| Position actuelle d'inclinaison | 12 | 5 décimales, 0-100 | 1+ |
| Inverser commandes | 5 | Haut devient Bas et inversement | 9+ |
| Inverser position | 5 | 0% devient fermé ou ouvert | 10+ |
| Répétitions | 3 | Nombre de répétitions par commande envoyée | 12+ |
| Ordre d'affichage | 3 | | 13+ |
| GPIO Haut | 3 | Si protocole GP_* — voir [Contrôle-des-moteurs-avec-GPIO](../materiel/controle-moteurs-gpio.md) | 15+ |
| GPIO Bas | 3 | Si protocole GP_* | 15+ |
| GPIO My | 3 | Si protocole GP_Remote | 16+ |
| Indicateurs GPIO | 3 | Bit 1 (`0x01`) = déclenchement à l'état bas | 17+ |
| Id Pièce | 3 | | 19+ |

### Indicateurs capteurs

Le champ *Indicateurs capteurs* est un masque de bits, écrit en décimal. Les valeurs
observées dans un fichier sont donc des sommes : `131` = `0x80 | 0x02 | 0x01`.

| Bit | Nom | Signification |
| --- | --- | --- |
| `0x01` | SunFlag | Le capteur soleil est activé pour cet équipement |
| `0x02` | SunSensor | L'équipement dispose d'un capteur soleil |
| `0x04` | DemoMode | Mode démonstration |
| `0x08` | Light | L'équipement expose une sortie lumière (types Garage) |
| `0x10` | Windy | Dernier état vent reçu |
| `0x20` | Sunny | Dernier état soleil reçu |
| `0x40` | Lighted | Dernier état de la sortie lumière |
| `0x80` | SimMy | La position My est simulée par le firmware |

Voir [Lier un capteur](../somfy/equipements.md#7-lier-un-capteur).

### Types d'équipement

Un total de 17 types d'équipement :

| Code | Type |
| --- | --- |
| 0 | Store enrouleur |
| 1 | Store vénitien |
| 2 | Rideau (gauche) |
| 3 | Store banne |
| 4 | Volet |
| 5 | Garage (1 bouton) |
| 6 | Garage (3 boutons) |
| 7 | Rideau (droit) |
| 8 | Rideau (centre) |
| 9 | Contact sec (1 bouton) |
| 10 | Contact sec (2 boutons) |
| 11 | Portail (gauche) |
| 12 | Portail (centre) |
| 13 | Portail (droit) |
| 14 | Portail 1 bouton (gauche) |
| 15 | Portail 1 bouton (centre) |
| 16 | Portail 1 bouton (droit) |

Ces 17 codes, et leurs valeurs numériques, sont ceux du format d'origine : seuls les
libellés affichés par l'interface ont changé. Voir
[Identification et Type](../somfy/equipements.md#identification-et-type) pour la description de chacun.

## Enregistrement Groupe

Un enregistrement par groupe (jusqu'à 16, dont 14 réellement atteignables depuis l'interface
— voir la note plus haut), absent des fichiers antérieurs à la version 11. Longueur totale :
**200 octets**.

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

!!! note "Note"

    Capacité réelle : le nombre maximum d'équipements sur l'appareil (30, voir la note
    plus haut) étant inférieur au nombre d'emplacements membre du format (32), au moins deux de
    ces 32 emplacements sont toujours vides — voir [GROUPES (Groups)](../somfy/groupes.md) pour la limite
    effective.

    À la relecture, les emplacements vides sont compactés : si les membres d'un groupe sont
    dispersés dans la liste, ils se retrouvent regroupés en tête. L'ordre des identifiants dans
    le fichier n'a donc aucune importance.

## Enregistrement Répéteurs

Un seul enregistrement, 7 adresses à la suite — absent des fichiers antérieurs à la
version 21. Longueur totale : **77 octets**.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Adresse répéteur 1 à 7 | 10 chacune | 0 = emplacement inutilisé. Voir [RÉPÉTEUR (Repeaters)](../somfy/repeteurs.md) | 21+ |

## Enregistrement Réglages

Un seul enregistrement, de longueur **variable** (elle dépend de la longueur réelle des
textes qu'il contient). Absent des fichiers antérieurs à la version 14. Les champs décrits
ici sont présentés dans l'ordre où l'interface les affiche — voir
[Options](../configuration/options.md).

| Nom | Type | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Firmware | Texte variable | Version du firmware au moment de la sauvegarde | 14+ |
| Nom d'hôte | Texte variable | | 14+ |
| Serveur NTP | Texte variable | | 14+ |
| Fuseau horaire | Texte variable | Au format POSIX | 14+ |
| Couleur d'accentuation | Texte variable | Code couleur hexadécimal, `#1a5fb4` par défaut — voir la note ci-dessous | 25, firmware v2.5.1+ |
| Diffusion uPnP (SSDP) | 5 | `true`/`false` | 14+ |
| Vérification des mises à jour | 5 | `true`/`false` | 20+ |
| Langue | 3 | Index de la langue active : 0=anglais, 1=français, 2=allemand, 3=espagnol | 25+ |

!!! warning "Avertissement"

    **La longueur annoncée de cet enregistrement est inférieure à sa longueur réelle.** La
    *Couleur d'accentuation* est apparue avec le firmware v2.5.1 sans que la version d'en-tête
    passe de 25 à 26, et le calcul de taille qui alimente l'en-tête n'a pas suivi : il omet ce
    champ, ainsi que la *Langue*. L'écart est de **14 octets** sur un fichier produit par
    v2.5.1 ou plus récent.

    Conséquence pour qui analyse un fichier à la main : la somme
    `en-tête + pièces + équipements + groupes + répéteurs + réglages + réseau + radio`
    tombe 14 octets en dessous de la taille réelle du fichier, et l'enregistrement Réglages
    est le seul dont la longueur annoncée ne doit pas servir à se déplacer. Fiez-vous à la fin
    de ligne. C'est aussi la raison du message `File size is not correct` dans le
    [moniteur série](../../outils/journaux-port-serie.md) à chaque restauration.

## Enregistrement Réseau

Un seul enregistrement, de longueur variable — absent des fichiers antérieurs à la
version 14. Comme dans le format d'origine, **aucun mot de passe** (Wi-Fi, MQTT) n'y figure.

| Nom | Type | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Type de connexion | 3 | 0=Non défini, 1=Wi-Fi, 2=Ethernet, 3=Ethernet préféré, 4=Point d'accès — voir [Connexion](../configuration/connexion.md) | 14+ |
| DHCP | 5 | `true`/`false` — voir [DHCP-et-IP-Statique](../configuration/dhcp-ip-statique.md) | 14+ |
| Adresse IP | Texte variable | | 14+ |
| Passerelle | Texte variable | | 14+ |
| Masque de sous-réseau | Texte variable | | 14+ |
| DNS 1 | Texte variable | | 14+ |
| DNS 2 | Texte variable | | 14+ |
| Protocole MQTT | Texte variable | `mqtt://` | 22+ |
| Hôte MQTT | Texte variable | | 22+ |
| Port MQTT | 5 | | 22+ |
| Publier la découverte MQTT | 5 | `true`/`false` | 22+ |
| Racine du topic MQTT | Texte variable | | 22+ |
| Topic de découverte MQTT | Texte variable | | 22+ |
| Type de carte Ethernet | 3 | 0=Manuel, 1=WT32-ETH01, 2=ESP32-POE (Olimex), 3=ESP32-EVB (Olimex), 4=T-Internet POE (LilyGO), 5=wESP32 v7+, 6=wESP32 <v7, 7=EST-PoE-32 | 14+ |
| Type de PHY | 3 | 0=LAN8720, 1=TLK110, 2=RTL8201, 3=DP83848, 4=DM9051, 5=KZ8081 | 14+ |
| Mode d'horloge | 3 | 0=GPIO0 Entrée, 1=GPIO0 Sortie, 2=GPIO16 Sortie, 3=GPIO17 Sortie | 14+ |
| Adresse PHY | 4 | | 14+ |
| Broche PWR | 4 | -1 = aucune | 14+ |
| Broche MDC | 4 | | 14+ |
| Broche MDIO | 4 | | 14+ |

!!! note "Note"

    Le type de carte Ethernet 7 (**EST-PoE-32**) est nouveau par rapport au format d'origine ;
    les sept valeurs précédentes sont inchangées. Les quatre derniers champs, ainsi que le type
    de PHY et le mode d'horloge, ne sont restaurés que si l'identifiant serveur du fichier est
    celui de l'appareil — voir la note de l'enregistrement d'en-tête.

## Enregistrement Radio (Transceiver)

Un seul enregistrement, entièrement à largeur fixe — absent des fichiers antérieurs à la
version 14. Longueur totale : **78 octets**.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Activé | 5 | `true`/`false` | 14+ |
| Protocole | 3 | 0=RTS, 1=RTW, 2=RTV | 14+ |
| Longueur de trame | 3 | 56 ou 80 bits | 14+ |
| Préréglage de carte | 3 | Voir [Composants](../../commun/composants.md) | 25+ |
| Broche SCK | 3 | | 14+ |
| Broche CSN | 3 | | 14+ |
| Broche MOSI | 3 | | 14+ |
| Broche MISO | 3 | | 14+ |
| Broche TX | 3 | | 14+ |
| Broche RX | 3 | | 14+ |
| Fréquence | 10 | En MHz, 3 décimales | 14+ |
| Largeur de bande RX | 9 | En kHz, 2 décimales | 14+ |
| Déviation de fréquence | 9 | En kHz, 2 décimales — n'intervient pas en réception, voir [Accorder la radio](../radio/configurer.md#accorder-la-radio) | 14+ |
| Puissance d'émission | 4 | En dBm | 14+ |

!!! note "Note"

    Le champ *Préréglage de carte* n'existait pas avant la version 25. Comme son ajout n'a pas
    fait l'objet d'un nouveau numéro de version, le lecteur le détecte autrement : un
    enregistrement Radio de moins de 78 octets est un fichier d'avant, et le préréglage y est
    alors considéré comme 0 (auto-détection).

