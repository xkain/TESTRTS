# Connexion réseau

Cet onglet (`Réseau → Connexion`) relie l'appareil à votre réseau local, en Wi-Fi comme en
Ethernet. Trois réglages annexes vivent sur leur propre page :
[Assistant de Connexion](assistant-de-connexion.md) (parcours guidé),
[DHCP / IP Statique](dhcp-ip-statique.md) et
[Mot de passe du point d'accès](mot-de-passe-point-d-acces.md) (le point d'accès de secours
de l'appareil, pas votre Wi-Fi domestique). L'onglet voisin **Réseau → MQTT** est documenté à
part — voir [Paramètres MQTT](parametres-mqtt.md) pour sa configuration et [MQTT](../integrations/mqtt.md) pour ce
qui se publie une fois connecté.

![reseau 1](v3/img/reseau-1){ .on-glb }

!!! note "Note"

    Tant que vous êtes connecté au [point d'accès temporaire](../../commun/point-d-acces.md) de l'appareil (`192.168.4.1`),
    cette page s'ouvre sur un bandeau d'alerte et un raccourci direct vers l'[Assistant de Connexion](assistant-de-connexion.md) : rien d'autre n'a vraiment de sens avant
    d'avoir rejoint votre réseau. Le reste de cette page décrit la configuration **manuelle**,
    utile pour ajuster un réglage précis une fois déjà connecté, ou si vous préférez vous passer
    de l'assistant.

## La page, bloc par bloc

La page est organisée en **blocs** :

| Bloc | Contenu |
|---|---|
| **Configuration guidée** | le raccourci vers l'[assistant de connexion](assistant-de-connexion.md), en haut de page. Sur le point d'accès, il est masqué : le **bandeau orange** conduit déjà à l'assistant. |
| **Type de connexion** | le choix **Wi-Fi** ou **Ethernet** |
| **Connexion Wi-Fi** *(ou Ethernet)* | l'interface active : réseau, options et configuration matérielle |
| **Adressage & secours** | les réglages IP (voir [DHCP et IP statique](dhcp-ip-statique.md)) et le [mot de passe du point d'accès](mot-de-passe-point-d-acces.md) |
| **État de la connexion** | en colonne latérale : l'état du lien |

À partir de **1600 px** de large, un encart rappelle le **point d'accès de secours** : si aucun
réseau n'est joignable avant le délai, l'appareil ouvre son propre point d'accès, au nom de
l'appareil, sur `192.168.4.1`, et c'est par là qu'on le reconfigure. La barre **Enregistrer** est
fixée en bas de page.

### État de la connexion

Force du signal Wi-Fi (réseau, canal, dBm) ou statut et vitesse Ethernet selon le mode actif,
adresse IP actuelle, et adresse MAC de l'appareil — utile pour une réservation DHCP dans les
paramètres de votre routeur (voir [DHCP et IP statique](dhcp-ip-statique.md#dhcp-par-défaut)).

## Type de connexion : Wi-Fi ou Ethernet

Cliquer sur l'une des cartes fait basculer le type de connexion et affiche les options associées.

![reseau 2](v3/img/reseau-2){ .on-glb }

!!! note "Note"

    Sur un boîtier [**Édition Wi-Fi**](../materiel/boitiers-officiels.md), ce choix n'existe
    pas : le boîtier n'a aucune broche Ethernet, la page ne montre donc que la section Wi-Fi.

## Connexion Wi-Fi

![reseau 3](v3/img/reseau-3){ .on-glb }

### Rejoindre un réseau

Deux boutons, qui ouvrent la même fenêtre sous deux formes :

* **Chercher un réseau sans fil** : scanne les réseaux à portée et les affiche triés par
    force de signal (les doublons — plusieurs bornes du même réseau maillé — sont fusionnés sur
    le signal le plus fort). Toucher un réseau dans la liste passe directement à la saisie du
    mot de passe.
* **Ajouter un réseau manuellement** : saisie directe du SSID et du mot de passe, sans scan —
    nécessaire pour un réseau caché (voir plus bas), ou pratique si vous connaissez déjà le nom
    exact.

Dans les deux cas, valider ouvre une fenêtre de confirmation récapitulant le nom d'hôte et
les adresses pour retrouver l'appareil une fois basculé — voir
[rejoindre le réseau après enregistrement](#rejoindre-le-réseau-après-enregistrement).

### Réseau Wi-Fi caché

La case **Réseau Wi-Fi caché** permet de rejoindre un réseau qui ne diffuse pas son nom. Elle
change la façon dont l'appareil s'y connecte, pas seulement l'affichage :

* Un SSID caché ne peut pas être découvert par un scan — vous devez forcément passer par
    **Ajouter un réseau manuellement**.
* L'appareil s'y connecte alors en **visant directement ce nom**, sans jamais scanner les
    environs : ni pour la connexion initiale, ni en continu ensuite.
* Cocher cette case **désactive et grise automatiquement l'itinérance** (ci-dessous) : les
    deux mécanismes reposent sur un scan, impossible à faire sur un réseau qui ne se
    laisse pas voir.

!!! tip "Astuce"

    Un SSID caché n'augmente pas réellement la sécurité de votre réseau — il force seulement vos
    appareils à le chercher activement, ce qui peut au contraire les rendre plus identifiables.
    Pour une sécurité accrue, privilégiez un mot de passe robuste et un chiffrement WPA2/WPA3
    plutôt qu'un SSID masqué. Si la stabilité de la connexion compte pour vous, un SSID visible
    reste préférable.

### Itinérance (Roaming)

**Désactivée par défaut.** Une fois activée, l'appareil reste connecté à votre réseau maillé
(Mesh) en suivant la borne offrant le meilleur signal, sans jamais couper le Wi-Fi pour y
parvenir :

* Toutes les **30 secondes**, un scan recherche les autres bornes qui diffusent le même SSID.
* L'appareil ne change de borne que si sa connexion actuelle est **totalement perdue**, ou si
    une autre borne offre un signal supérieur d'au moins **10 dBm** — cet écart volontairement
    généreux évite l'effet de « ping-pong » entre deux bornes de force proche.

Laissez l'itinérance désactivée si votre installation ne comporte qu'un seul routeur/point
d'accès, si votre réseau n'utilise pas de technologie Mesh, ou si vous utilisez une liaison AP
forcée sur votre routeur pour fixer l'appareil sur une borne précise.

## Connexion Ethernet

![reseau 4](v3/img/reseau-4){ .on-glb }

!!! danger "Attention"

    De nombreuses cartes ESP32 ne protègent pas le microcontrôleur si le câblage vers la puce
    Ethernet est mal déclaré. Un mauvais réglage de broche peut endommager physiquement le
    matériel — et contrairement aux broches radio, **rien ne vous avertit d'un conflit avec une
    broche déjà utilisée ailleurs sur la carte** : vérifiez vous-même avant d'enregistrer.

### Type de carte

Une liste déroulante propose des préréglages pour les cartes Ethernet/PoE les plus connues,
qui remplissent automatiquement PHY, horloge, adresse et broches GPIO adaptées :

| Carte | PWR | MDC | MDIO |
|---|---|---|---|
| WT32-ETH01 — Wireless Tag | GPIO16 | GPIO23 | GPIO18 |
| EST-PoE-32 — Everything Smart | GPIO12 | GPIO23 | GPIO18 |
| ESP32-EVB — Olimex | Aucune | GPIO23 | GPIO18 |
| ESP32-POE — Olimex | GPIO12 | GPIO23 | GPIO18 |
| T-Internet POE — LilyGO | GPIO16 | GPIO23 | GPIO18 |
| wESP32 v7+ — Silicognition | Aucune | GPIO16 | GPIO17 |
| wESP32 < v7 — Silicognition | Aucune | GPIO16 | GPIO17 |

L'option **Configuration Manuelle** révèle à la place tous les champs (type de PHY, mode
d'horloge, adresse, broches Power/MDC/MDIO) pour une carte qui n'est pas dans la liste —
consultez alors sa documentation technique pour les renseigner vous-même.

![reseau 5](v3/img/reseau-5){ .on-glb }

!!! note "Note"

    Sur un boîtier [**Édition Ethernet & Wi-Fi**](../materiel/boitiers-officiels.md), ce bloc entier
    (type de carte comme réglages manuels) est **masqué** : le câblage est fixe et déjà validé
    en usine (c'est un WT32-ETH01), rien à choisir. Si vous avez malgré tout besoin de le
    consulter ou de le modifier, cliquez 5 fois sur le titre de la page — ce déverrouillage de
    dépannage ne survit pas à un rechargement.

### Repli vers le Wi-Fi

La case **Secours Wi-Fi** (au-dessus de la section Wi-Fi tant qu'Ethernet est actif) fait
basculer automatiquement sur votre réseau sans fil si le câble tombe ou que la connexion
filaire échoue. Concrètement : l'appareil préfère **toujours** l'Ethernet tant que son lien
est actif ; ce n'est que lorsque le lien tombe qu'il regarde si un réseau Wi-Fi a été
renseigné pour basculer dessus — sinon, il rouvre son point d'accès de configuration.

!!! important "Important"

    Ce repli n'existe que si un réseau Wi-Fi est **réellement enregistré** sur l'appareil — pas
    seulement coché. Cochez **Secours Wi-Fi**, puis renseignez un réseau via les boutons de la
    section Wi-Fi (restée accessible, elle ne se masque pas tant que ce repli est actif) **avant**
    d'enregistrer : les deux parties partent dans le même enregistrement, pas besoin de deux
    passages séparés.

Sans ce repli configuré, un câble débranché laisse l'appareil retenter indéfiniment la
connexion filaire, sans jamais rouvrir de point d'accès pour le reconfigurer à distance.

### Validation et enregistrement

Sur une carte générique, enregistrer un changement Ethernet ouvre d'abord un récapitulatif en
lecture seule des broches retenues, pour vous laisser l'occasion de les relire avant que
l'appareil ne redémarre son interface réseau.

![reseau 6](v3/img/reseau-6){ .on-glb }

!!! note "Note"

    Sur un boîtier **Édition Ethernet & Wi-Fi**, ce récapitulatif est **sauté** : le
    matériel étant **natif**, il n'y a rien à relire. L'enregistrement passe
    directement à la fenêtre finale (nom d'hôte), commune au Wi-Fi.

## Rejoindre le réseau après enregistrement

Une fois le réseau choisi (Wi-Fi ou Ethernet) et confirmé, une dernière fenêtre permet de
revoir — ou changer — le **nom d'hôte**, et affiche les adresses pour retrouver l'interface
une fois le basculement effectué.

![reseau 7](v3/img/reseau-7){ .on-glb }

* `http://<nom-d-hôte>.local` (fonctionne nativement sur la plupart des systèmes récents) ;
* `http://<nom-d-hôte>` directement, si **Diffusion uPnP (SSDP)** est activée (voir
    [Général](../general/index.md#identite)) ;
* ou l'adresse IP attribuée par votre routeur, visible dans son interface d'administration.

!!! warning "Avertissement"

    L'appareil redémarre environ une seconde après l'enregistrement pour appliquer son nouveau
    réseau. Si vous configuriez ce réseau depuis son propre point d'accès temporaire
    (`ESPSomfyRTS` ou le nom de votre appareil) — le cas le plus courant, premier démarrage ou
    reconfiguration après une perte de connexion — ce redémarrage coupe cette liaison : votre
    ordinateur ou téléphone s'y retrouve déconnecté, et **doit lui-même rejoindre votre réseau
    habituel** pour retrouver l'appareil à sa nouvelle adresse.

Si l'appareil reste introuvable après quelques minutes, vérifiez le mot de passe Wi-Fi saisi ainsi
que l'URL, si vous vous connectez par adresse IP. Débranchez l'appareil, puis rebranchez-le.
En cas d'échec de connexion prolongé, il réactivera de lui-même son point d'accès de
configuration. Pour un appareil totalement injoignable, voir
[Mode Récupération](../recuperation.md).

