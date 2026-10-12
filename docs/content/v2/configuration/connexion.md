<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/Connexion.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Connexion

Cette page couvre le sous-onglet **Connexion**, décrit dans l'ordre où les réglages apparaissent
à l'écran.

!!! note "Note"

    **Première configuration ?** Au premier démarrage, l'appareil ouvre son propre réseau Wi-Fi
    nommé `ESPSomfyRTS` et son interface est accessible à l'adresse `http://192.168.4.1`. C'est
    depuis cette interface que vous allez remplir cet onglet. Et si votre module possède un port
    Ethernet RJ45 câblé, branchez le câble maintenant : ce sera plus simple ensuite.

---
<img width="1600" alt="Capture d’écran 2026-05-21 à 15 19 34" src="https://github.com/user-attachments/assets/baf32266-3e04-4b60-88b9-42fe3471edb8" />

## 1. Le bloc d'informations (en haut)

Le premier bloc n'est pas un réglage : c'est un **état des lieux** de la connexion actuelle. Son
contenu dépend du mode actif.

* **En Wi-Fi** : le `Réseau:` (SSID) auquel l'appareil est connecté, le `Canal:` utilisé, et la
    force du signal en dBm avec son icône à barres.
* **En Ethernet** : le `Statut:` du lien et sa `Vitesse:` (10 ou 100 Mbit/s).
* **Dans les deux cas** : l'`Adresse MAC` de l'appareil, en bas du bloc.

!!! tip "Astuce"

    Notez cette adresse MAC quelque part. C'est elle que vous devrez indiquer à votre box pour
    créer une **réservation DHCP** — voir
    [DHCP / IP Statique](dhcp-ip-statique.md#la-bonne-méthode--la-réservation-dhcp).

## 2. Choisir Wi-Fi ou Ethernet

Juste en dessous, deux grands boutons à cocher déterminent **tout le reste de la page** :

* **Wi-Fi** — *« Utilise la connexion sans fil via le réseau Wi-Fi »*
* **Ethernet** — *« Utilise le câble Ethernet à la place du Wi-Fi »*

Sélectionner l'un ou l'autre fait apparaître les réglages correspondants et masque ceux de
l'autre mode.

!!! important "Important"

    **Un seul adaptateur fonctionne à la fois.** Pour ne pas surcharger le processeur de l'ESP32,
    le Wi-Fi et l'Ethernet ne sont jamais actifs simultanément. Il n'y a pas de « double WAN ».

## Utiliser une connexion WiFi

Avec **Wi-Fi** sélectionné, la page affiche, de haut en bas :

### a. Les deux interrupteurs

**`Réseau Wi-Fi caché`** — *« Permet de se connecter à un réseau qui ne diffuse pas son nom »*

À activer uniquement si votre box ne diffuse pas publiquement le nom de son réseau. Dans ce cas,
le scan ne servira à rien : vous devrez taper le `SSID du réseau` à la main.

!!! danger "Attention"

    Cocher cette case **désactive l'itinérance** juste en dessous : son commutateur repasse sur
    Arrêt et devient inopérant. Les deux mécanismes reposent sur un scan des environs,
    impossible à réaliser sur un réseau qui ne se laisse pas voir. Concrètement, un SSID caché
    implique trois limitations :

    1. **Pas de choix du meilleur signal :** l'appareil se connecte au premier point d'accès qui
        répond, et non au plus puissant.
    2. **Redémarrage réseau hasardeux :** après une coupure générale, il risque de se lier à votre
        routeur principal même si un répéteur plus proche offre un bien meilleur signal.
    3. **Pas d'itinérance :** le passage fluide d'une borne à l'autre est indisponible.

!!! tip "Astuce"

    **Masquer son SSID n'améliore pas la sécurité.** Cela force au contraire vos appareils à
    chercher activement le réseau, ce qui peut les rendre plus identifiables de l'extérieur. Pour
    une vraie sécurité, misez sur un mot de passe long et un chiffrement **WPA2/WPA3**. Pour une
    connexion stable, laissez votre SSID visible.

**`Activer l'itinérance`** — *« Cible toujours la borne Wi-Fi la plus proche »*

**Désactivé par défaut.** Ce réglage est destiné aux **réseaux maillés (Mesh)** composés de
plusieurs bornes diffusant le même nom de réseau. Une fois activé, l'appareil suit la borne
offrant le meilleur signal sans jamais couper sa radio
Wi-Fi :

* **Scan en arrière-plan :** périodiquement (environ toutes les 5 minutes), il recherche les
    autres bornes qui diffusent le même SSID, sans interrompre la connexion.
* **Seuil de basculement :** il ne change de borne que si la connexion actuelle est
    **totalement perdue**, ou si une autre borne offre un signal supérieur d'au moins
    **10 dBm**. Cet écart volontairement large évite l'effet de « ping-pong » entre deux bornes
    de force voisine.

Laissez l'itinérance **désactivée** dans ces cas, qui couvrent la majorité des installations :

* vous n'avez qu'un seul routeur / point d'accès ;
* votre réseau n'utilise pas de technologie Mesh ;
* vous forcez l'appareil sur une borne précise via une liaison AP (*AP Binding*) sur le routeur.

!!! tip "Astuce"

    À l'inverse, si vous constatez des déconnexions fréquentes alors que l'itinérance est active
    et que votre appareil ne bouge pas, désactivez-la : elle stabilisera la connexion sur une
    seule borne.

### b. Le scan et les identifiants

Le bouton **`CHERCHER RÉSEAU WI-FI`** lance une recherche des réseaux à portée. La liste
apparaît juste au-dessus du bouton, triée par force de signal (les bornes multiples d'un même
réseau maillé sont fusionnées sur le signal le plus fort). **Cliquez sur votre réseau** dans la
liste : son nom se recopie automatiquement dans le champ `SSID du réseau`.

Il ne reste plus qu'à renseigner le `Mot de Passe` de votre Wi-Fi — l'icône en forme d'œil
permet de vérifier la saisie avant de valider.

!!! note "Note"

    Si votre réseau n'apparaît pas dans la liste, vous pouvez toujours taper son nom directement
    dans le champ `SSID du réseau`. C'est obligatoire pour un réseau caché.

Terminez par le bouton **`ENREGISTRER`** en bas de page, puis passez à l'étape
[Rejoindre votre réseau local](#rejoindre-votre-réseau-local).

## Utiliser une connexion Ethernet

!!! danger "Attention"

    **Lisez ceci avant de toucher aux réglages.** De nombreuses cartes ESP32 ne possèdent aucune
    protection entre le microcontrôleur et la puce Ethernet. Une mauvaise affectation de broches
    peut **endommager physiquement et définitivement** le matériel. Prenez le temps de vérifier.

Avec **Ethernet** sélectionné, la page affiche, de haut en bas :

### a. `Secours Wi-Fi`

*« Bascule sur le Wi-Fi en cas de panne Ethernet »*

Permet de repasser automatiquement en Wi-Fi si le câble est débranché ou si le lien filaire
échoue.

!!! important "Important"

    **L'ordre des opérations compte.** En mode Ethernet, les champs Wi-Fi sont masqués. Pour que
    ce secours fonctionne, il faut donc :

    1. configurer et **enregistrer** d'abord le Wi-Fi (section précédente) ;
    2. puis revenir, sélectionner **Ethernet**, activer `Secours Wi-Fi` et enregistrer.

    Sans un réseau Wi-Fi réellement enregistré, cocher la case ne sert à rien.

### b. `Type de carte`

Cette liste déroulante propose les cartes Ethernet/PoE les plus répandues. La choisir remplit
automatiquement tous les paramètres matériels (type de PHY, mode d'horloge, adresse et broches)
et **masque les réglages détaillés** — vous n'avez rien d'autre à faire.

| Carte | Alimentation | MDC | MDIO |
|---|---|---|---|
| **WT32-ETH01 — Wireless Tag** | GPIO16 | GPIO23 | GPIO18 |
| EST-PoE-32 — Everything Smart | GPIO12 | GPIO23 | GPIO18 |
| ESP32-EVB — Olimex | Aucune | GPIO23 | GPIO18 |
| ESP32-POE — Olimex | GPIO12 | GPIO23 | GPIO18 |
| T-Internet POE — LilyGO | GPIO16 | GPIO23 | GPIO18 |
| wESP32 v7+ — Silicognition | Aucune | GPIO16 | GPIO17 |
| wESP32 < v7 — Silicognition | Aucune | GPIO16 | GPIO17 |

!!! tip "Astuce"

    **Possesseurs de mon boîtier Ethernet & Wi-Fi :** choisissez `WT32-ETH01 - Wireless Tag`.
    C'est le seul réglage à faire.

Le tableau ci-dessus ne liste que les broches mobilisées par la puce Ethernet. Pour savoir
**quelles broches il vous reste** pour câbler le transmetteur CC1101 sur chacune de ces cartes,
reportez-vous à [Composants → Configuration des Broches](../materiel/composants.md#configuration-des-broches-pins),
qui donne le schéma complet carte par carte :
[WT32-ETH01](../materiel/composants.md#wt32-eth01) · [Olimex ESP32-PoE/EVB](../materiel/composants.md#olimex-esp32-poeevb) ·
[LilyGO T-Internet POE](../materiel/composants.md#lilygo-t-internet-poe) · [wESP POE](../materiel/composants.md#wesp-poe) ·
[EST-PoE-32](../materiel/composants.md#esp-poe-32).

!!! note "Note"

    Un port Ethernet mobilise une grande partie des broches de l'ESP32. Sur ces cartes, le nombre
    de GPIO restant pour le CC1101 est donc nettement plus restreint que sur un modèle Wi-Fi.

L'option **`Définir manuellement`** fait au contraire apparaître tous les champs
(`Type de puce PHY`, `Adresse PHY`, `Mode Clock`, `Pin alimentation`, `Pin MDC`, `Pin MDIO`)
pour une carte absente de la liste. Reportez-vous alors à sa documentation technique.

!!! warning "Avertissement"

    Même si votre carte figure dans la liste, vérifiez que le fabricant n'a pas changé de révision
    matérielle entre-temps : un brochage différent sous le même nom commercial existe.

### c. Valider l'enregistrement

Comme un réglage Ethernet erroné peut détruire le matériel, le bouton **`ENREGISTRER`** n'écrit
rien directement : il ouvre d'abord une fenêtre **`Paramètres Ethernet`** récapitulant les
broches retenues.

1. **Relisez** chaque ligne du récapitulatif.
2. **Cochez** la case de confirmation (« Je confirme que ces paramètres sont corrects pour mon
    matériel… »).
3. Le bouton `ENREGISTRER` de la fenêtre **se dégrise** alors.
4. **Cliquez-le** pour écrire la configuration et redémarrer l'interface réseau.

<img height="500" src="https://github.com/user-attachments/assets/8a170778-f229-4c4d-b836-60d4f3778af3" />

Une fois validé, l'appareil tente la connexion par le câble. Vous suivez le résultat dans le
bloc d'informations en haut de ce même onglet, qui affiche désormais `Statut:` et `Vitesse:`.

<img height="500" src="https://github.com/user-attachments/assets/41b0b377-e56e-4433-bc3c-0e43b5546bda" />

### d. L'adresse IP n'est plus la même

!!! warning "Avertissement"

    **En passant du Wi-Fi à l'Ethernet, l'adresse IP de l'appareil change.** Si vous avez
    l'habitude d'accéder à l'interface par son adresse IP, l'ancienne ne répondra plus.

La raison est simple : le Wi-Fi et l'Ethernet sont **deux interfaces réseau distinctes**, chacune
avec sa propre adresse MAC. Votre box les voit donc comme deux appareils différents et leur
attribue **deux adresses IP différentes**. Trois conséquences pratiques :

* **Retrouver l'appareil :** ouvrez l'interface d'administration de votre box et consultez la
    liste des appareils connectés (souvent nommée « Appareils connectés », « Réseau » ou « DHCP »)
    pour lire la nouvelle adresse attribuée. Le nom d'hôte (`http://<nom-d-hote>.local`), lui, reste
    valable dans les deux modes et vous évite complètement ce souci.
* **Vos réservations et vos favoris :** un favori de navigateur, une intégration Home Assistant
    configurée par IP ou une [réservation DHCP](dhcp-ip-statique.md#la-bonne-méthode--la-réservation-dhcp)
    faite pour le Wi-Fi ne suivent **pas** le passage en Ethernet. Il faut les refaire avec la
    nouvelle adresse.
* **Le bloc d'informations n'affiche qu'une MAC à la fois** — celle de l'interface active. Pour
    relever les deux adresses MAC, consultez ce bloc une fois en Wi-Fi et une fois en Ethernet.

!!! tip "Astuce"

    **Si vous utilisez `Secours Wi-Fi`**, l'adresse changera à chaque bascule entre le câble et le
    sans-fil. Créez alors une
    [réservation DHCP](dhcp-ip-statique.md#la-bonne-méthode--la-réservation-dhcp) **pour les deux
    adresses MAC** dans votre box, en leur attribuant deux adresses fixes que vous connaissez — ou
    mieux, prenez l'habitude d'utiliser le nom d'hôte.

---

# Rejoindre votre réseau local

Enregistrer les identifiants ne suffit pas : **tant qu'un appareil reste connecté au point
d'accès `ESPSomfyRTS`, l'appareil ne basculera pas** sur votre réseau. C'est d'ailleurs ce que
rappelle le bandeau bleu en bas de l'onglet Connexion.

### La procédure

1. **Déconnectez** votre ordinateur ou votre téléphone du réseau Wi-Fi `ESPSomfyRTS`, et
    rejoignez votre réseau habituel.
2. **Attendez.** Ne voyant plus personne sur son propre point d'accès, l'appareil le referme et
    tente de rejoindre votre réseau avec les identifiants saisis.
3. **L'adresse change.** `http://192.168.4.1` n'est plus accessible : c'est maintenant votre box
    qui attribue une adresse IP à l'appareil.

### Retrouver l'interface

* **Par le nom d'hôte (le plus simple)**
    * Sur **macOS, iOS et Linux** : `http://<nom-d-hote>.local`
    * Sur **Windows** : `http://<nom-d-hote>`, à condition d'avoir activé l'option **uPnP (SSDP)**
        dans [Configurer le Système → Options](systeme.md#options). C'est aussi là que se
        règle le nom d'hôte lui-même.
* **Par l'adresse IP** — si le nom d'hôte ne répond pas tout de suite (le service mDNS met
    parfois une minute ou deux à se propager), ouvrez l'interface d'administration de votre box
    pour lire l'adresse attribuée à l'appareil.

### Si rien ne répond

* **Patientez 2 minutes**, puis vérifiez qu'il n'y a pas de faute de frappe dans le mot de passe
    Wi-Fi — c'est de loin la cause la plus fréquente.
* Après un échec prolongé, l'appareil **réactive de lui-même** son réseau `ESPSomfyRTS` : vous
    pourrez vous y reconnecter pour corriger la configuration.
* S'il reste totalement injoignable, voir [Factory Reset](../maintenance/factory-reset.md).
* Si la connexion échoue **sans erreur de mot de passe**, lisez la section
    [L'appareil ne rejoint pas mon Wi-Fi](#lappareil-ne-rejoint-pas-mon-wi-fi) ci-dessous.

---

# L'appareil ne rejoint pas mon Wi-Fi

Vous avez saisi le bon nom de réseau et le bon mot de passe, et pourtant l'appareil n'apparaît
jamais sur votre réseau. Avant de suspecter le matériel, passez en revue les réglages de **votre
box**, dans cet ordre.

## 1. Le protocole de sécurité de la box

**C'est la cause la plus souvent rencontrée, et la moins évidente à deviner.** Les box laissées
en mode de sécurité ancien ou trop permissif (`WPA`, `WPA/PSK`, `WPA-TKIP`) empêchent l'ESP32 de
s'associer, sans aucun message d'erreur parlant.

!!! tip "Astuce"

    **La solution :** dans l'interface de votre box, section Wi-Fi, réglez le chiffrement sur
    **WPA2** (ou `WPA2-PSK (AES)`, ou le mode mixte `WPA2/WPA3`). Puis redémarrez l'appareil
    ESPSomfy-RTS. C'est exactement ce qui a débloqué un utilisateur après plusieurs jours de
    recherche :

    > *« J'ai changé le protocole de sécurité wifi de la box qui était sur wpa/psk par wpa2 et là
    > tout a fonctionné. »*

À l'inverse, un réseau configuré en **WPA3 seul** peut aussi poser problème : là encore, le mode
mixte `WPA2/WPA3` est le réglage le plus sûr.

## 2. La bande de fréquence

L'ESP32 ne fonctionne **qu'en 2,4 GHz**. Il ne verra jamais un réseau diffusé uniquement en
5 GHz ou 6 GHz. Si votre box sépare ses bandes en deux noms distincts, sélectionnez bien celui
du **2,4 GHz**.

## 3. Les filtres et restrictions

* **Filtrage par adresse MAC** : s'il est actif sur votre box, ajoutez-y l'
    [adresse MAC](#1-le-bloc-dinformations-en-haut) de l'appareil, ou désactivez-le le temps de la
    première connexion.
* **Portail / contrôle d'accès invités** : un réseau « invité » exigeant une page de connexion ne
    convient pas, l'appareil n'a pas de navigateur pour s'y authentifier.

## 4. Le nom et le mot de passe

* **Caractères spéciaux :** un mot de passe ou un SSID contenant des accents, des espaces en fin
    de chaîne ou des caractères exotiques est une source classique d'échec. En cas de doute, testez
    avec un mot de passe simple et long (lettres et chiffres).
* **SSID caché :** si votre réseau est masqué, l'option `Réseau Wi-Fi caché` doit être activée —
    le scan ne le trouvera jamais.

## 5. En dernier recours

Si rien n'y fait, consultez les [Journaux du port série](https://github.com/xkain/ESPSomfy-RTS/wiki/Journaux-du-port-serie) : ils affichent
en clair le motif du refus d'association, ce qui permet de distinguer un mot de passe rejeté d'un
protocole incompatible.

