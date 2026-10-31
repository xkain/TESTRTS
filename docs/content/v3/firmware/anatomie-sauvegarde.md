# Anatomie du fichier de sauvegarde

!!! note "Note"

    Cette page documente le format binaire du fichier `.backup` produit par **Sauvegarder**
    (voir [Maintenance](index.md#maintenance)) — reprise et mise à jour, pour la v3.0.0, de la
    page [Backup File Anatomy](https://github.com/rstrouse/ESPSomfy-RTS/wiki/Backup-File-Anatomy)
    du projet d'origine (rstrouse). Elle s'adresse à qui veut inspecter, éditer à la main ou
    scripter un fichier de sauvegarde — ce n'est pas un pré-requis pour utiliser
    [Restaurer le système](restaurer.md) au quotidien.

## Versionnage

Chaque fichier porte un numéro de version d'en-tête. Le firmware s'en sert pour continuer à
relire correctement des sauvegardes plus anciennes à mesure que de nouveaux champs
s'ajoutent — un champ apparu après coup est simplement absent d'un vieux fichier, et le
lecteur lui laisse sa valeur par défaut plutôt que de décaler tout le reste. Chaque champ
documenté plus bas porte la version d'en-tête à partir de laquelle il est présent.

**La v3.0.0 écrit la version d'en-tête 27.** Les versions v2.x.x écrivent la 25, et la v2.6.2
la 26, qui n'ajoute à la 25 que la *Couleur d'accentuation* — voir
[l'anatomie du format v2](../../v2/maintenance/anatomie-sauvegarde.md). Tout ce que la v3.0.0
ajoute est regroupé dans ce bloc 27, résumé dans
[Ce qui change par rapport au format v2](#ce-qui-change-par-rapport-au-format-v2).

!!! note "Note"

    Ce format sert aussi, sous une forme réduite, au fichier interne `/shades.cfg` que
    l'appareil tient en fonctionnement normal : il ne contient que les enregistrements
    Pièce, Équipement, Groupe et Répéteurs, sans les blocs Réglages, Réseau et Radio ni le bloc
    Plannings, qui n'existent que dans un `.backup` produit par **Sauvegarder**. C'est ce
    dernier, le plus complet, qui est documenté ici.

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
    version 27 décrit sur cette page.

```
 27, 76,   29,  3,  356, 10,  206,  3,   77,  1,  188,  182,   68,A1B2C3   
  1,Salon               ,  0
  2,Cuisine             ,  1
  3,Chambre             ,  2
  1,true ,  4,    100101,Volet Chambre 1     ,  0,  0, 56,     17500,     17000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   42,  1,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  3,  0,  0,  0,  0,  0,  3,false,      7000,      7000,true ,true ,         0,         0,  0,  200,  0,  7
  2,true ,  4,    100102,Volet Chambre 2     ,  0,  0, 56,     17000,     16400,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   18,  1,    -1.00000,    -1.00000,    45.00000,     0.00000,false,false,  3,  1,  0,  0,  0,  0,  3,false,      7000,      7000,true ,true ,         0,         0,  0,  200,  0,  7
  3,true ,  4,    100103,Volet Atelier       ,  0,  0, 56,     17000,     16500,      7000,  100,         0,         0,         0,         0,         0,         0,         0,    7,  0,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  1,  2,  0,  0,  0,  0,  0,false,      7000,      7000,true ,true ,         0,         0,  0,  200,  0,  3
  4,true ,  4,    100104,Volet Salon         ,  0,  0, 56,     30000,     26300,      7000,  100,         0,         0,         0,         0,         0,         0,         0,  247, 20,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  1,  3,  0,  0,  0,  0,  1,true ,      7000,      7000,true ,true ,       400,       250,  0,  200,  0,  7
  5,true ,  1,    100105,Store Vénitien     ,  2,  0, 56,     10000,     10000,      1500,  100,         0,         0,         0,         0,         0,         0,         0,   20,131,    71.00000,     0.00000,    71.00000,    31.00000,false,false,  1,  4,  0,  0,  0,  0,  1,false,      1800,      1500,true ,true ,         0,         0,  0,  200,  0, 31
  6,true , 13,    100106,Portail             ,  0,  0, 80,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   22,  0,    -1.00000,    -1.00000,     0.00000,     0.00000,false,true ,  1,  5,  0,  0,  0,  0,  0,false,      7000,      7000,true ,true ,         0,         0,  0,  200,  0,  1
  7,true ,  4,    100107,Volet Salon Droit   ,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   14,128,    26.00000,    -1.00000,    26.00000,     0.00000,false,false,  1,  6,  0,  0,  0,  0,  1,false,      7000,      7000,true ,true ,         0,         0,  0,  200,  0,  7
  8,true ,  4,    100108,Volet Cuisine Droit ,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   11,128,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  1,  7,  0,  0,  0,  0,  2,false,      7000,      7000,true ,true ,         0,         0,  0,  200,  0,  7
  9,true ,  4,    100109,Volet Cuisine Gauche,  0,  0, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,   16,128,    -1.00000,    -1.00000,    19.00000,     0.00000,false,false,  1,  8,  0,  0,  0,  0,  2,false,      7000,      7000,true ,true ,         0,         0,  0,  200,  0,  7
 10,true ,  9,         0,Lampe Terrasse      ,  0,  8, 56,     10000,     10000,      7000,  100,         0,         0,         0,         0,         0,         0,         0,    0,  0,    -1.00000,    -1.00000,     0.00000,     0.00000,false,false,  1,  9, 32, 33,  0,  1,  0,false,      7000,      7000,true ,true ,         0,         0,  1,  500,  1,  1
  1,  0,    200101,Rez-de-chaussée    ,  0, 56,  4,  7,  8,  9,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  0,false,  0,   12,true 
  2,  0,    200102,Chambres            ,  0, 56,  1,  2,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,false,  3,    5,false
  3,  0,    200103,Ouvertures          ,  0, 56,  6, 10,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  2,false,  0,    0,false
    100199,         0,         0,         0,         0,         0,         0
"v3.0.0","ESPSomfyRTS-Demo","pool.ntp.org","CET-1CEST-2,M3.5.0/02:00:00,M10.5.0/03:00:00","#1a5fb4",true ,true ,  1,  0,false,"groups",true ,  0,true ,   2,false,false,  0,"#ffffff",true 
  1,true ,"192.168.1.50","192.168.1.1","255.255.255.0","192.168.1.1","0.0.0.0","mqtt://","192.168.1.10", 1883,true ,"espsomfy-a1b2c3","homeassistant",  0,  0,  0,   0,  -1,  23,  18
true ,  0, 56,  1, 18,  5, 23, 19, 21, 22,   433.420,    97.96,  10
  1,   79,  4
  1,Lever volets        ,127,  7, 30,  0,  4,100,  -1,true ,  0,  0,  0,     0
  2,Fermeture nuit      ,127, 22,  0,  1,  1,  0,  -1,true ,  0,  0,  0,     0
  3,Lever du jour       , 62,  0,  0,  0,  1,100,  -1,true ,  1,  0,  1,   -15
  4,Coucher du soleil   ,127,  0,  0,  1,  2,  0,  -1,true ,  0,  1,  2,   -20
```

Ce fichier contient 3 pièces, 10 équipements tous **appairés**, 3 groupes avec des équipements
effectivement liés et 1 enregistrement de répéteurs (7 adresses), suivis des blocs réglages
(188 octets), réseau (182 octets) et radio (68 octets), puis du bloc plannings (4 plannings).
C'est la première ligne, l'en-tête, qui annonce tout cela, à l'exception des plannings qui
portent leur propre en-tête — chaque enregistrement est détaillé dans la suite de la page.

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
(version ≥ 1, taille d'enregistrement Équipement et Groupe plausibles, nombre
d'enregistrements dans la capacité de l'appareil) puis, pour chaque enregistrement Pièce,
Équipement et Groupe, que la fin de ligne tombe **exactement** à la longueur annoncée dans
l'en-tête. Si ce n'est pas le cas, la restauration est refusée. Les blocs de fin — Réglages,
Réseau, Radio — ne sont pas contrôlés de cette façon : le lecteur s'y recale sur le caractère
de fin de ligne s'il n'est pas tombé juste, et le signale dans le moniteur série
(`[CFG] enregistrement … resynchronise`).

Quelques pointeurs pour s'y retrouver dedans — chacun des champs cités est décrit, section
par section, dans la suite de la page :

* **Équipement 5** (« Store Vénitien ») est le seul avec une inclinaison (type d'inclinaison
    `2`, intégrée) — ses positions actuelle et d'inclinaison (`71.00000`/`31.00000`) le montrent
    à mi-course, et ses temps d'inclinaison sont calibrés séparément (`1800` à la montée, `1500`
    à la descente). Son nom contient un accent : sa colonne tient donc un caractère de moins que
    les autres, pour le même nombre d'octets.
* **Équipement 4** (« Volet Salon ») est le seul avec **Retour lumineux** activé (le `true`
    qui suit son Id Pièce) et le seul avec des zones mortes (`400` ms à la montée, `250` ms à
    la descente).
* **Équipement 6** (« Portail ») est le seul en trame **80 bits**, et le seul avec *Inverser
    position* à `true`.
* **Équipement 10** (« Lampe Terrasse ») est un **interrupteur** (type `9`) piloté non pas par
    radio mais par les broches de l'ESP32 : son protocole vaut `8` (GP_Relay), ses champs *GPIO
    Haut* et *GPIO Bas* valent `32` et `33`, et *Indicateurs GPIO* vaut `1` — déclenchement à
    l'état bas. Ses quatre derniers champs le montrent en mode **Impulsion** (`1`) de `500` ms,
    avec le vocabulaire **Allumé/Éteint** (`1`). Voir
    [Contrôle des moteurs avec GPIO](../materiel/controle-moteurs-gpio.md).
* Le **dernier champ** de chaque équipement, *Étapes de mise en service*, vaut `7` pour un
    volet entièrement mis en service (appairage, sens, temps de course) et `31` pour le store
    vénitien, qui ajoute les lames et leur ordre.
* **Groupe 1** (« Rez-de-chaussée ») lie 4 équipements (4, 7, 8, 9) — leurs identifiants
    apparaissent en tête de la longue série de zéros représentant les 32 emplacements membre.
    C'est aussi le seul groupe avec **Retour lumineux** (`true` en fin de ligne).
* **Groupe 2** (« Chambres ») a son **Id Pièce** à `3` (Chambre) : contrairement aux
    équipements, un groupe peut être rattaché à une pièce même sans que chacun de ses membres le
    soit individuellement.
* Le **répéteur** (ligne avant les réglages) ne porte qu'une seule adresse sur les 7 possibles —
    les six autres emplacements à `0` sont simplement inutilisés.
* Le **fuseau horaire** dans l'enregistrement Réglages contient lui-même des virgules
    (`M3.5.0/02:00:00,M10.5.0/03:00:00`) : c'est exactement le cas que les guillemets d'un champ
    à longueur variable sont censés protéger.
* Les **six derniers champs** de l'enregistrement Réglages décrivent le
    [témoin LED](led-de-statut.md) : une LED simple sur le GPIO2, active à l'état haut, avec le
    témoin d'activité radio activé.
* Les **4 plannings** illustrent chacun un cas différent : heure fixe sur un équipement, heure
    fixe sur un groupe, lever du soleil avec avance de 15 min du lundi au vendredi (masque `62`),
    et coucher du soleil en mode My avec un retard de 20 min.

## Ce qui change par rapport au format v2

Pour qui connaît déjà le [format v2](../../v2/maintenance/anatomie-sauvegarde.md), voici
l'ensemble des différences, toutes détaillées dans les sections qui suivent :

| Enregistrement | Changement |
| --- | --- |
| Équipement | 11 champs ajoutés en fin de ligne : retour lumineux, temps d'inclinaison séparés, inclinaison d'abord à l'ouverture et à la fermeture, zones mortes, mode de sortie, durée d'impulsion, vocabulaire d'état, étapes de mise en service. Longueur : 276 → **356 octets** |
| Groupe | Retour lumineux ajouté en fin de ligne. Longueur : 200 → **206 octets** |
| Réglages | Couleur d'accentuation désormais comptée, et 12 champs ajoutés : affichage de l'en-tête mobile, colonnes inversées, onglet mobile par défaut, activité radio dans l'en-tête, mode d'affichage, témoin de mouvement, et les six réglages du témoin LED |
| Réseau | Inchangé. Le protocole MQTT est encore écrit, mais n'est plus relu |
| Radio | Déviation de fréquence retirée. Longueur : 78 → **68 octets** |
| Plannings | Bloc entièrement nouveau, écrit après l'enregistrement Radio |

!!! note "Note"

    **La longueur annoncée de l'enregistrement Réglages est désormais exacte.** En version 25,
    elle était inférieure de 14 octets à la longueur réelle — voir
    [l'anatomie du format v2](../../v2/maintenance/anatomie-sauvegarde.md#enregistrement-réglages).
    La v3.0.0 compte tous les champs qu'elle écrit : la somme des longueurs de l'en-tête tombe
    donc juste, et le message `File size is not correct` n'apparaît plus à la restauration
    d'un fichier v27.

## Enregistrement d'en-tête

Un seul enregistrement, toujours en première ligne du fichier, entièrement à largeur fixe.
Longueur totale : **76 octets**.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Version | 3 | La version de ce fichier de sauvegarde, 27 en v3.0.0 | 1+ |
| Longueur de l'en-tête | 3 | La longueur totale de l'en-tête, en octets (76) | 1+ |
| Longueur d'un enregistrement Pièce | 5 | 29 | 19+ |
| Nombre d'enregistrements Pièce | 3 | | 19+ |
| Longueur d'un enregistrement Équipement | 5 | 356 en version 27. Codée sur 3 caractères avant la version 13 | 1+ |
| Nombre d'enregistrements Équipement | 3 | | 1+ |
| Longueur d'un enregistrement Groupe | 5 | 206 en version 27. Codée sur 3 caractères avant la version 13 | 11+ |
| Nombre d'enregistrements Groupe | 3 | | 11+ |
| Longueur d'un enregistrement Répéteurs | 5 | 77 | 21+ |
| Nombre d'enregistrements Répéteurs | 3 | Toujours 1 | 21+ |
| Longueur de l'enregistrement Réglages | 5 | 0 si absent | 14+ |
| Longueur de l'enregistrement Réseau | 5 | 0 si absent | 14+ |
| Longueur de l'enregistrement Radio | 5 | 0 si absent — 68 en version 27 | 14+ |
| Identifiant serveur | 9 | 6 caractères hexadécimaux dérivés de l'adresse MAC de la puce, complétés d'espaces. Sert aussi au topic MQTT de découverte Home Assistant (`espsomfy-<id>`) — voir [MQTT](../integrations/mqtt.md#auto-découverte-mqtt) | 14+ |

!!! note "Note"

    Ce dernier champ s'appelle **Chip Id** dans le format d'origine. C'est lui qui décide du
    sort des réglages Ethernet à la restauration : si l'identifiant du fichier ne correspond pas
    à celui de l'appareil en cours de restauration, le bloc de câblage EMAC (type de carte, PHY,
    horloge, broches) est délibérément ignoré, puisqu'il décrit une carte qui n'est pas celle
    qu'on a devant soi. Tout le reste du bloc Réseau est restauré normalement — voir
    [Restaurer le système](restaurer.md).

!!! note "Note"

    **Pourquoi 14 pièces et non 16, 30 équipements et non 32, 14 groupes et non 16 ?** Le
    format de fichier réserve bien 16 emplacements pour les pièces et les groupes, et 32 pour
    les équipements et les plannings — ce sont les capacités *brutes* que portent les champs
    d'en-tête et les identifiants ci-dessous. Mais l'algorithme qui attribue un nouvel
    identifiant côté firmware (`getNextRoomId()` / `getNextShadeId()` / `getNextGroupId()`, et
    de la même façon `getNextScheduleId()` pour les plannings) ne distribue jamais ni
    l'identifiant **0** (réservé comme valeur sentinelle — pour une pièce, c'est précisément
    **Accueil**, la pièce par défaut toujours présente) ni le **tout dernier** identifiant de la
    plage. Deux emplacements sur 16 (ou 32) restent donc toujours hors d'atteinte depuis
    l'interface, quel que soit le nombre déclaré dans le fichier. Plutôt que de laisser
    l'utilisateur buter sur cet échec bas niveau sans explication, l'interface pose elle-même ce
    plafond réduit en amont, pour pouvoir afficher un message clair indiquant que la limite est
    atteinte. C'est ce nombre réduit — **14, 30, 14**, et **30** pour les plannings — qui
    apparaît partout ailleurs dans cette documentation.

## Enregistrement Pièce

Un enregistrement par pièce déclarée (jusqu'à 16, dont 14 réellement atteignables depuis
l'interface — voir la note ci-dessus). Entièrement à largeur fixe, inchangé depuis le format
d'origine. Longueur totale : **29 octets**.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Id Pièce | 3 | 1 à 16, mais seuls 1 à 14 sont attribués automatiquement par l'interface | 19+ |
| Nom | 20 | | 19+ |
| Ordre d'affichage | 3 | | 19+ |

Voir [Pièces](../somfy/pieces.md).

## Enregistrement Équipement

Un enregistrement par équipement configuré (jusqu'à 32, dont 30 réellement atteignables
depuis l'interface — voir la note plus haut). Longueur totale : **356 octets**.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Id Équipement | 3 | 1 à 32, mais seuls 1 à 30 sont attribués automatiquement par l'interface | 1+ |
| Appairé | 5 | `true`/`false` | 1+ |
| Type d'équipement | 3 | Voir la table des types ci-dessous | 1+ |
| Adresse | 10 | L'adresse Somfy (24 bits) attribuée à l'équipement | 1+ |
| Nom | 20 | | 1+ |
| Type d'inclinaison | 3 | 0=Aucune, 1=Moteur inclinaison, 2=Intégrée, 3=Inclinaison seule, 4=Inclinaison Euro. Remis à 0 pour tout type autre que Store vénitien | 1+ |
| Protocole | 3 | 0=RTS, 1=RTW, 2=RTV, 8=GP_Relay, 9=GP_Remote | 7+ |
| Longueur de trame | 3 | 56 ou 80 bits | 2+ |
| Temps de montée | 10 | En ms | 1+ |
| Temps de descente | 10 | En ms | 1+ |
| Temps d'inclinaison (ancien champ) | 10 | En ms. Champ unique des versions antérieures : la v3.0.0 y écrit le temps d'inclinaison à la descente, et ne le relit que pour un fichier d'avant la version 27 | 1+ |
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
| GPIO Haut | 3 | Si protocole GP_* — voir [Contrôle des moteurs avec GPIO](../materiel/controle-moteurs-gpio.md) | 15+ |
| GPIO Bas | 3 | Si protocole GP_* | 15+ |
| GPIO My | 3 | Si protocole GP_Remote | 16+ |
| Indicateurs GPIO | 3 | Bit 1 (`0x01`) = déclenchement à l'état bas | 17+ |
| Id Pièce | 3 | | 19+ |
| Retour lumineux | 5 | `true`/`false` — un éclat du [témoin LED](led-de-statut.md) à chaque commande | 27+ |
| Temps d'inclinaison à la montée | 10 | En ms — remplace l'ancien champ unique, calibré séparément dans chaque sens. Voir [Temps de course et lames](../somfy/equipements/calibration.md) | 27+ |
| Temps d'inclinaison à la descente | 10 | En ms | 27+ |
| Inclinaison d'abord à l'ouverture | 5 | `true`/`false`, `true` par défaut | 27+ |
| Inclinaison d'abord à la fermeture | 5 | `true`/`false`, `true` par défaut | 27+ |
| Zone morte (montée) | 10 | En ms, 0 par défaut — début de la montée pendant lequel la position reste à 100 % | 27+ |
| Zone morte (descente) | 10 | En ms, 0 par défaut — fin de la descente, position déjà à 100 % pendant que le moteur termine | 27+ |
| Mode de sortie | 3 | 0=Maintien, 1=Impulsion — interrupteurs uniquement (types 9 et 10), ignoré ailleurs | 27+ |
| Durée d'impulsion | 5 | En ms, 50 à 10 000, 200 par défaut — mode Impulsion uniquement | 27+ |
| Vocabulaire d'état | 3 | 0=Marche/Arrêt, 1=Allumé/Éteint, 2=Ouvert/Fermé, 3=Actif/Inactif — purement d'affichage | 27+ |
| Étapes de mise en service | 3 | Masque de bits, voir la table ci-dessous. Absent d'un enregistrement de 352 octets | 27+ |

### Indicateurs capteurs

Le champ *Indicateurs capteurs* est un masque de bits, écrit en décimal. Les valeurs
observées dans un fichier sont donc des sommes : `131` = `0x80 | 0x02 | 0x01`.

| Bit | Nom | Signification |
| --- | --- | --- |
| `0x01` | SunFlag | Le capteur soleil est activé pour cet équipement |
| `0x02` | SunSensor | L'équipement dispose d'un capteur soleil |
| `0x04` | DemoMode | Mode démonstration |
| `0x10` | Windy | Dernier état vent reçu |
| `0x20` | Sunny | Dernier état soleil reçu |
| `0x80` | SimMy | La position My est simulée par le firmware |

Les bits `0x08` et `0x40`, documentés en v2 pour la sortie lumière des types Garage, ne sont
plus utilisés par la v3.0.0. Voir [Lier un capteur](../somfy/equipements/liaison-telecommande.md).

### Étapes de mise en service

Le champ *Étapes de mise en service* retient, un bit par étape, ce que
l'[assistant de mise en service](../somfy/equipements/mise-en-service.md) a déjà mené à
terme. C'est l'écart entre ce masque et les étapes que demande le type d'équipement qui fait
apparaître le badge « à finir » sur sa carte.

| Bit | Étape |
| --- | --- |
| `1` | Appairage |
| `2` | Sens de rotation |
| `4` | Temps de course |
| `8` | Lames (inclinaison) |
| `16` | Ordre lames / course |
| `32` | Options |

Un équipement appairé dont ce champ vaut `0` est un équipement d'avant l'assistant : rien
n'indique ce qui a été fait, et l'interface n'affiche alors aucun état.

!!! note "Note"

    Ce champ est le seul du bloc 27 à être gardé par la **taille** de l'enregistrement plutôt
    que par la version : il est apparu après les autres sans nouveau numéro de version. Un
    enregistrement Équipement de 352 octets, produit par une version de développement
    antérieure, s'arrête au vocabulaire d'état ; le lecteur ne cherche alors pas à lire ce
    champ, qui mordrait sur l'enregistrement suivant.

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
| 9 | Interrupteur (1 bouton) |
| 10 | Interrupteur (2 boutons) |
| 11 | Portail (gauche) |
| 12 | Portail (centre) |
| 13 | Portail (droit) |
| 14 | Portail 1 bouton (gauche) |
| 15 | Portail 1 bouton (centre) |
| 16 | Portail 1 bouton (droit) |

Ces 17 codes, et leurs valeurs numériques, sont ceux du format d'origine : seuls les
libellés affichés par l'interface ont changé. Les codes 9 et 10 s'appelaient **Dry Contact**
dans le format d'origine et **Contact sec** en v2 — voir
[Types d'équipement disponibles](../somfy/equipements/index.md#types-déquipement-disponibles).

## Enregistrement Groupe

Un enregistrement par groupe (jusqu'à 16, dont 14 réellement atteignables depuis l'interface
— voir la note plus haut), absent des fichiers antérieurs à la version 11. Longueur totale :
**206 octets**.

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
| Retour lumineux | 5 | `true`/`false`, un seul éclat du [témoin LED](led-de-statut.md) par commande de groupe | 27+ |

!!! note "Note"

    Capacité réelle : le nombre maximum d'équipements sur l'appareil (30, voir la note
    plus haut) étant inférieur au nombre d'emplacements membre du format (32), au moins deux de
    ces 32 emplacements sont toujours vides — voir
    [Groupes](../somfy/groupes/index.md#caractéristiques-techniques) pour la limite effective.

    À la relecture, les emplacements vides sont compactés : si les membres d'un groupe sont
    dispersés dans la liste, ils se retrouvent regroupés en tête. L'ordre des identifiants dans
    le fichier n'a donc aucune importance.

## Enregistrement Répéteurs

Un seul enregistrement, 7 adresses à la suite — absent des fichiers antérieurs à la
version 21. Longueur totale : **77 octets**.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Adresse répéteur 1 à 7 | 10 chacune | 0 = emplacement inutilisé. Voir [Répéteurs](../somfy/repeteurs.md) | 21+ |

## Enregistrement Réglages

Un seul enregistrement, de longueur **variable** (elle dépend de la longueur réelle des
textes qu'il contient). Absent des fichiers antérieurs à la version 14. Il n'est restauré que
si la case **Paramètres** est cochée — voir [Restaurer le système](restaurer.md).

| Nom | Type | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Firmware | Texte variable | Version du firmware au moment de la sauvegarde, jamais relue | 14+ |
| Nom d'hôte | Texte variable | | 14+ |
| Serveur NTP | Texte variable | | 14+ |
| Fuseau horaire | Texte variable | Au format POSIX | 14+ |
| Couleur d'accentuation | Texte variable | Code couleur hexadécimal, `#1a5fb4` par défaut — voir [Apparence](../general/index.md#apparence) | 26+, et 25 venant du firmware v2.5.1+ |
| Diffusion uPnP (SSDP) | 5 | `true`/`false` | 14+ |
| Vérification des mises à jour | 5 | `true`/`false` | 20+ |
| Langue | 3 | 0=anglais, 1=français, 2=allemand, 3=espagnol — voir la note ci-dessous | 25+ |
| Affichage de l'en-tête mobile | 3 | 0=Tout, 1=Réseau seul, 2=Uptime seul, 3=Aucun — voir [Réglages du tableau de bord](../general/tableau-de-bord.md#en-tête-mobile) | 27+ |
| Inverser les colonnes (bureau) | 5 | `true`/`false` | 27+ |
| Onglet par défaut (mobile) | Texte variable | `groups` ou `devices` | 27+ |
| Activité radio dans l'en-tête | 5 | `true`/`false` | 27+ |
| Mode d'affichage | 3 | 0=Système, 1=Sombre, 2=Clair | 27+ |
| Témoin de mouvement sur les cartes | 5 | `true`/`false`, `true` par défaut | 27+ |
| Broche du témoin LED | 4 | -1 = aucune LED, ce qui désactive aussi le témoin — voir [Témoin LED de statut](led-de-statut.md) | 27+ |
| LED active à l'état bas | 5 | `true`/`false` — LED simple uniquement | 27+ |
| LED RGB adressable | 5 | `true`/`false` — `false` pour une LED simple | 27+ |
| Ordre des couleurs | 3 | 0=GRB (standard), 1=RGB — LED RGB uniquement | 27+ |
| Couleur d'activité | Texte variable | Au format `#rrggbb`, `#ffffff` par défaut — LED RGB uniquement | 27+ |
| Témoin d'activité radio | 5 | `true`/`false` — la LED clignote à chaque trame radio | 27+ |

!!! note "Note"

    **Tous les champs ajoutés en version 27 sont lus de façon défensive** : chacun n'est lu que
    s'il reste des données avant la fin de l'enregistrement. Ce bloc a reçu plusieurs ajouts
    successifs sans faire progresser le numéro de version à chaque fois ; une sauvegarde qui
    s'arrête avant l'un d'eux laisse simplement la valeur en place sur l'appareil. Une
    sauvegarde antérieure aux six champs du témoin LED conserve ainsi la LED telle qu'elle est
    configurée, au lieu de l'éteindre.

!!! note "Note"

    **Les réglages du témoin LED sont contrôlés à la relecture**, avec les mêmes bornes qu'à
    l'enregistrement depuis l'interface : une broche hors de -1 à 48 devient « aucune LED », un
    ordre des couleurs inconnu redevient GRB, et une couleur mal formée est ignorée. Une broche
    déjà prise par la radio ou par un relais est détectée au redémarrage qui suit la
    restauration : la LED est alors désactivée, avec un message dans le
    [moniteur série](../../outils/journaux-port-serie.md). Sur un
    [boîtier officiel](../materiel/boitiers-officiels.md), ces champs sont écrits et relus mais
    restent sans effet : le câblage du boîtier fait autorité.

!!! note "Note"

    **Le champ Langue ne connaît que les quatre langues intégrées.** Une langue installée à
    part (voir [Gérer les langues](../general/langues.md)) est enregistrée comme `0`, et la
    restauration rebascule donc l'interface en anglais.

!!! note "Note"

    **Une sauvegarde v2.5.1 à v2.6.1 porte la couleur d'accentuation tout en annonçant la
    version 25.** Le lecteur la reconnaît à son guillemet : à cette place, le champ *Diffusion
    uPnP* qui suit sinon n'en a jamais. Ces fichiers se restaurent donc correctement, couleur
    comprise, comme ceux de la v2.6.2 qui annoncent la version 26.

## Enregistrement Réseau

Un seul enregistrement, de longueur variable — absent des fichiers antérieurs à la
version 14. Comme dans le format d'origine, **aucun mot de passe** (Wi-Fi, MQTT) n'y figure.
La première moitié n'est restaurée qu'avec la case **Réseau**, la partie MQTT qu'avec la case
**MQTT**.

| Nom | Type | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Type de connexion | 3 | 0=Non défini, 1=Wi-Fi, 2=Ethernet, 3=Ethernet préféré, 4=Point d'accès — voir [Réseau](../reseau/index.md) | 14+ |
| DHCP | 5 | `true`/`false` | 14+ |
| Adresse IP | Texte variable | | 14+ |
| Passerelle | Texte variable | | 14+ |
| Masque de sous-réseau | Texte variable | | 14+ |
| DNS 1 | Texte variable | | 14+ |
| DNS 2 | Texte variable | | 14+ |
| Protocole MQTT | Texte variable | Toujours `mqtt://`, écrit mais **jamais relu** — voir la note ci-dessous | 22+ |
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

    **MQTTS (MQTT chiffré via TLS) a été évalué puis abandonné pour la v3.0.0** : son empreinte
    mémoire ne tenait pas à côté du reste, et rendait la mise à jour OTA impossible. La
    connexion MQTT est donc toujours en clair sur le réseau local, et le protocole est devenu
    une constante. Le champ reste écrit pour ne pas décaler la lecture : une sauvegarde plus
    ancienne peut y porter `mqtts://`, qui est lu puis ignoré.

!!! note "Note"

    Les sept derniers champs (câblage Ethernet) ne sont restaurés que si l'identifiant serveur
    du fichier est celui de l'appareil — voir la note de l'enregistrement d'en-tête.

## Enregistrement Radio (Transceiver)

Un seul enregistrement, entièrement à largeur fixe — absent des fichiers antérieurs à la
version 14. Longueur totale : **68 octets**.

| Nom | Longueur | Commentaire | Depuis la version |
| --- | --- | --- | --- |
| Activé | 5 | `true`/`false` | 14+ |
| Protocole | 3 | 0=RTS, 1=RTW, 2=RTV | 14+ |
| Longueur de trame | 3 | 56 ou 80 bits | 14+ |
| Préréglage de carte | 3 | Numéro du modèle de carte choisi — voir [Assignation GPIO](../radio/index.md#assignation-gpio). Vaut 0 à la relecture d'un fichier d'avant la version 25 | 25+ |
| Broche SCK | 3 | | 14+ |
| Broche CSN | 3 | | 14+ |
| Broche MOSI | 3 | | 14+ |
| Broche MISO | 3 | | 14+ |
| Broche TX | 3 | | 14+ |
| Broche RX | 3 | | 14+ |
| Fréquence | 10 | En MHz, 3 décimales | 14+ |
| Largeur de bande RX | 9 | En kHz, 2 décimales | 14+ |
| Puissance d'émission | 4 | En dBm | 14+ |

!!! important "Important"

    **La déviation de fréquence a disparu** de cet enregistrement en v3.0.0 : les formats
    précédents la plaçaient entre la largeur de bande RX et la puissance d'émission. Elle n'est
    plus écrite, et n'est lue puis aussitôt jetée que dans un ancien fichier qui la porte
    encore, reconnu à la taille annoncée de son enregistrement Radio (74 octets ou plus). La
    modulation RTS est OOK, pas FSK : la déviation n'intervient pas à la réception, elle
    n'avait donc aucun effet réel — voir [Configurer la radio](../radio/index.md).

## Bloc Plannings

**Absent du format d'origine et du format v2.** Les plannings (voir
[Planification](../somfy/equipements/plannification.md)) sont écrits à la suite de
l'enregistrement Radio, sans apparaître dans les compteurs de l'en-tête principal. Le bloc
porte son propre en-tête, sur une ligne :

| Nom | Longueur | Commentaire |
| --- | --- | --- |
| Version du bloc | 3 | Actuellement 1 |
| Longueur d'un enregistrement | 5 | Actuellement 79 |
| Nombre d'enregistrements | 3 | Jusqu'à 32, dont 30 réellement atteignables depuis l'interface — même mécanisme que pièces/équipements/groupes, voir la note plus haut |

Suivi d'un enregistrement par planning. Longueur totale : **79 octets**.

| Nom | Longueur | Commentaire |
| --- | --- | --- |
| Id Planning | 3 | |
| Nom | 20 | |
| Masque de jours | 3 | Un bit par jour, bit 0 = dimanche, bit 6 = samedi : `127` = tous les jours, `62` = du lundi au vendredi |
| Heure | 3 | 0-23, ignorée si la référence est le lever ou le coucher du soleil |
| Minute | 3 | 0-59, idem |
| Type de cible | 3 | 0=Équipement, 1=Groupe |
| Id de la cible | 3 | |
| Position cible | 3 | 0-100 %, utilisée seulement en mode Position |
| Inclinaison cible | 4 | -1 = non applicable |
| Activé | 5 | `true`/`false` |
| Tentatives | 3 | Nombre de relances en cas d'échec |
| Mode de position | 3 | 0=Position, 1=My, 2=Inclinaison seule |
| Référence temporelle | 3 | 0=Heure fixe, 1=Lever du soleil, 2=Coucher du soleil — voir [Position géographique](../general/position-geographique.md) |
| Décalage solaire | 6 | En minutes, signé — utilisé si la référence est le lever ou le coucher du soleil |

!!! note "Note"

    Ce même bloc existe sous deux formes dans le firmware : intégré au fichier `.backup`
    (documenté ici), et comme fichier autonome `/schedules.cfg` utilisé en fonctionnement
    normal. Les deux partagent exactement le même format.

!!! warning "Avertissement"

    Restaurer la case **Équipements, groupes, pièces et plannings** efface d'abord
    systématiquement tous les plannings actuellement sur l'appareil, puis ne les recharge que si
    ce bloc est présent et lisible dans le fichier. Restaurer une sauvegarde **v2** (ou
    tronquée) via cette case supprime donc vos plannings actuels, même si vous ne cherchiez qu'à
    récupérer vos équipements — voir [Restaurer le système](restaurer.md).
