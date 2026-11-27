# Réseau

La page **Réseau** relie l'appareil à votre réseau local, en Wi-Fi, en Ethernet ou les deux, et
règle comment on le retrouve : nom d'hôte, adresse IP et réseau de secours. Elle se lit en quatre
onglets ; **Wi-Fi** et **Ethernet** n'apparaissent que si le type de connexion choisi s'en sert.

!!! tip "Première installation"

    Pour une première mise en réseau, l'[assistant de connexion](assistant-de-connexion.md) est
    plus simple : il pose les mêmes réglages en trois étapes. Cette page sert à ajuster un réglage
    précis une fois l'appareil sur votre réseau.

## Le bandeau

Le bandeau, à gauche sur ordinateur et en haut de la page sur tablette et téléphone, décrit ce que
fait l'appareil **maintenant**, pas ce qui est réglé :

* l'icône : des ondes Wi-Fi, allumées et colorées selon le signal, la prise Ethernet, ou le point
    d'accès quand vous êtes connecté au réseau de l'appareil ;
* l'état : *Connecté en Wi-Fi*, *Connecté en Ethernet* ou *Point d'accès de l'appareil* ;
* le nom du réseau Wi-Fi rejoint, *Ethernet*, ou le nom de l'appareil sur son point d'accès ;
* la qualité : *Très bon signal*, *Signal moyen*, *Signal faible* (en Wi-Fi), *Lien actif* (en
    Ethernet) ou *Déconnecté* ;
* les faits : **Adresse IP**, **Adressage** (`Automatique` ou `Fixe`), **Canal** et signal en dBm
    (en Wi-Fi), **Vitesse** (en Ethernet) et **Adresse MAC**, utile pour une réservation dans votre
    box ;
* le bouton `Relancer l'assistant de première connexion`, qui ouvre
    l'[assistant de connexion](assistant-de-connexion.md).

Sur ordinateur, les faits et le bouton sont affichés directement, et derrière **Détails** sur
tablette. Sur téléphone, le bandeau ne garde qu'une ligne de résumé : son menu ⋮ propose
**Détails**, qui ouvre ces informations dans un panneau, et **Aide sur cette page**.

## Connexion { #summary }

![Réseau, onglet Connexion](v3/img/reseau-connexion){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Type de connexion** | trois choix : **Wi-Fi** (*Sans fil, par votre box*), **Ethernet + Wi-Fi de secours** (*Bascule en Wi-Fi si l'Ethernet ne répond plus*) et **Ethernet** (*Par la prise réseau de la carte*). La pastille *Actif* marque le type enregistré. |
| **Récapitulatif** | ce qui partirait à l'enregistrement : nom d'hôte, réseau Wi-Fi et itinérance, carte Ethernet, adresse IP et réseau de secours. Une ligne à compléter passe en orange (*À renseigner*). Toucher une ligne ouvre l'onglet qui la règle. |

Choisir un type affiche ou masque aussitôt les onglets **Ethernet** et **Wi-Fi**, avant même
l'enregistrement. En mode **Ethernet + Wi-Fi de secours**, l'onglet Wi-Fi s'appelle **Wi-Fi de
secours**.

Quand vous êtes connecté au point d'accès de l'appareil, la tuile le rappelle : *Vous êtes connecté
au point d'accès de l'appareil. Choisissez comment le relier à votre réseau.* Sur un
[boîtier officiel](../../materiel/boitiers-officiels.md) Wi-Fi seul, la tuile **Type de connexion**
n'apparaît pas : il n'y a rien à choisir.

### Ce que fait chaque type { #types }

| Type | L'appareil… | Sans réseau |
|---|---|---|
| **Wi-Fi** | rejoint le réseau Wi-Fi enregistré | ouvre son point d'accès au bout de 20 s |
| **Ethernet** | n'utilise que le câble, le Wi-Fi est éteint | ouvre son point d'accès si le lien du câble est absent |
| **Ethernet + Wi-Fi de secours** | utilise le câble ; si le lien tombe, rejoint le Wi-Fi enregistré, et revient au câble dès que le lien revient | ouvre son point d'accès si le Wi-Fi de secours ne répond pas non plus au bout de 20 s |

!!! important "Le Wi-Fi de secours doit être enregistré"

    Le repli n'existe que si un réseau Wi-Fi est **enregistré**, pas seulement si le mode est
    choisi : renseignez l'onglet **Wi-Fi de secours** avant d'enregistrer. Les deux partent dans
    le même enregistrement.

## Wi-Fi { #wifi }

![Réseau, onglet Wi-Fi](v3/img/reseau-wifi){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Réseaux à proximité** | `Chercher un réseau Wi-Fi` liste les réseaux que capte l'appareil, du plus fort au plus faible, avec la qualité du signal ; un réseau émis par plusieurs bornes n'apparaît qu'une fois. Toucher un réseau remplit son nom et passe au mot de passe. `+ Mon réseau n'apparaît pas (réseau caché)` vide le nom pour le saisir à la main, `Chercher à nouveau` relance la recherche. |
| **Wi-Fi** | le **SSID du réseau** (32 caractères) et son **Mot de passe**. Un mot de passe enregistré n'est jamais renvoyé par l'appareil : le champ masqué veut dire « inchangé ». |
| **Options Wi-Fi** | **Réseau Wi-Fi caché** et **Itinérance**, ci-dessous |

La recherche ne part jamais seule : elle dure quelques secondes, pendant lesquelles l'appareil ne
répond plus.

### Réseau Wi-Fi caché { #reseau-cache }

Pour un réseau qui ne diffuse pas son nom. L'appareil s'y connecte en visant directement ce nom,
sans chercher les bornes autour de lui. Passer ce réglage à `Oui` met **Itinérance** à `Non` et la
grise : elle repose sur une recherche que ce réseau ne permet pas.

### Itinérance { #itinerance }

Pour un réseau à plusieurs bornes (Mesh, répéteurs) qui diffusent le même nom. À `Oui`, l'appareil
cherche toutes les **30 secondes** les bornes de son réseau, et change de borne quand une autre
capte au moins **10 dBm** mieux que la sienne. Le changement coupe le Wi-Fi le temps de se
reconnecter. Laissez-la à `Non` avec une seule borne, ou si votre box attache l'appareil à une borne
précise.

## Ethernet { #ethernet }

![Réseau, onglet Ethernet](v3/img/reseau-ethernet){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Carte Ethernet** | le **Type de carte** : un préréglage par carte connue, ou `Définir manuellement (utilisateur avancé)` |
| **Réglages de cette carte** | avec un préréglage : *Remplis d'après le modèle choisi : rien à régler.* `Voir le détail` affiche le type de puce PHY, l'adresse PHY, le mode d'horloge et les broches d'alimentation, MDC et MDIO. |
| **Réglages manuels** | en définition manuelle seulement : **PHY**, **Clock**, **Adresse**, et les broches **Power**, **MDC** et **MDIO**, avec `−` / `+`. Le bouton à côté de **Power** passe la broche à *Aucune*. |

Les préréglages :

| Carte | Puce PHY | Power | MDC | MDIO |
|---|---|---|---|---|
| WT32-ETH01 - Wireless Tag | LAN8720 | GPIO16 | GPIO23 | GPIO18 |
| EST-PoE-32 - Everything Smart | LAN8720 | GPIO12 | GPIO23 | GPIO18 |
| ESP32-EVB - Olimex | LAN8720 | Aucune | GPIO23 | GPIO18 |
| ESP32-POE - Olimex | LAN8720 | GPIO12 | GPIO23 | GPIO18 |
| T-Internet POE - LILYGO | LAN8720 | GPIO16 | GPIO23 | GPIO18 |
| wESP32 v7+ - Silicognition | RTL8201 | Aucune | GPIO16 | GPIO17 |
| wESP32 < v7 - Silicognition | LAN8720 | Aucune | GPIO16 | GPIO17 |

!!! danger "Une broche fausse peut bloquer ou abîmer la carte"

    Rien ne détecte une broche déjà reliée à un autre composant (flash, radio…). Comparez chaque
    broche à la documentation du fabricant : l'enregistrement les récapitule dans une
    [confirmation critique](#confirmation-critique) avant d'envoyer quoi que ce soit.

Sur un [boîtier officiel](../../materiel/boitiers-officiels.md), la carte est fixe : l'onglet
Ethernet n'apparaît pas. Cinq clics sur le titre du bandeau le font apparaître pour un dépannage,
jusqu'au prochain rechargement de la page.

## Accès { #advanced }

![Réseau, onglet Accès](v3/img/reseau-advanced){ .on-glb }

### Nom et découverte { #nom }

Le **Nom d'hôte** donne l'adresse locale de l'appareil, `http://<nom>.local` : 31 caractères au
plus, lettres, chiffres ou tiret. Il s'applique tout de suite au réseau, mais la nouvelle adresse
`.local` ne répond qu'après un redémarrage. C'est aussi le nom du point d'accès de secours.

**Diffusion uPnP (SSDP)** annonce l'appareil sur le réseau local pour que les autres systèmes le
trouvent tout seuls. Ce réglage s'applique dès le changement, sans passer par `Enregistrer`.

### Adresse IP { #adresse-ip }

**Adressage** `Automatique` laisse votre box attribuer l'adresse. Pour garder toujours la même
adresse, réservez-la dans votre box, avec l'**Adresse MAC** du bandeau, plutôt que de la fixer ici.

`Fixe` ouvre les champs **Adresse IP statique**, **Masque sous-réseau** et **Passerelle**
(obligatoires), **Nom serveur DNS 1** et **DNS 2** (facultatifs), au format `XXX.XXX.XXX.XXX`. Ils
ne s'appliquent qu'au prochain redémarrage de l'appareil.

![Tuile Adresse IP en adressage fixe](v3/img/reseau-ip-fixe){ .on-glb }

!!! warning "Une adresse fixe fausse rend l'appareil injoignable"

    Une adresse hors de la plage de votre box, déjà prise ou avec une mauvaise passerelle coupe
    l'appareil du réseau, sans message. Pour en sortir sans rien perdre d'autre, le
    [firmware de secours](../systeme/firmware-de-secours.md) réinitialise le seul réseau : voir
    [Réinitialiser](../systeme/firmware-de-secours.md#reinitialiser).

### Réseau de secours de l'appareil { #point-d-acces }

Si aucun réseau n'est joignable (voir [ce que fait chaque type](#types)), l'appareil ouvre son
propre point d'accès Wi-Fi, au nom de l'appareil, sur `192.168.4.1` : c'est par là qu'on le
reconfigure. Voir [Se connecter au point d'accès](../../../aide/point-d-acces.md).

**Mot de passe du point d'accès** à `Oui` exige un mot de passe pour le rejoindre, de 8 à 63
caractères (limite du WPA2). À `Non`, le point d'accès est ouvert, c'est le réglage d'usine :

| Choix | Avertissement affiché |
|---|---|
| `Non` | *Sans mot de passe, ce point d'accès est ouvert : toute personne à portée peut s'y connecter et piloter vos équipements tant qu'il reste actif.* |
| `Oui` | *Si vous oubliez ce mot de passe et que le Wi-Fi principal échoue un jour, vous ne pourrez plus reconfigurer l'appareil à distance […]* : il faudra passer par le [firmware de secours](../systeme/firmware-de-secours.md), dont le réseau `ESPSomfy-RESCUE` reste ouvert. |

## Enregistrer

La barre d'enregistrement liste chaque réglage modifié, avec l'ancienne et la nouvelle valeur ;
`Annuler` remet la page dans l'état enregistré. À l'enregistrement, le nom d'hôte, le mot de passe
du point d'accès et l'adresse IP partent d'abord, sans redémarrage. La connexion (type, Wi-Fi,
carte Ethernet) part en dernier, par les fenêtres ci-dessous, parce qu'elle peut couper la page.

### Confirmation critique { #confirmation-critique }

![Fenêtre Confirmation critique](v3/img/reseau-fen-confirmation-ethernet){ .on-glb }

En **Ethernet** ou **Ethernet + Wi-Fi de secours**, un panneau rouge récapitule la carte (type,
puce PHY, adresse PHY, horloge) et les broches (alimentation, MDC, MDIO) : *Ces valeurs
correspondent-elles à votre carte ?* `Continuer` passe à l'étape suivante, `Annuler` ne change
rien. Sur un boîtier officiel Ethernet, au câblage fixe, ce panneau est sauté.

### Enregistrer le réseau { #enregistrer-le-reseau }

![Fenêtre Enregistrer le réseau](v3/img/reseau-fen-enregistrer){ .on-glb }

Le dernier panneau rappelle que la page va perdre la connexion, permet de changer une dernière fois
le **Nom d'hôte**, et donne les adresses où retrouver l'appareil : `http://<nom>.local`,
`http://<nom>`, ou l'adresse IP que votre box lui donnera. Depuis le point d'accès de l'appareil,
il ajoute les étapes pour revenir sur votre Wi-Fi habituel. Rien n'est envoyé avant `Enregistrer`.

Après `Enregistrer`, le panneau affiche *Bascule réseau en cours* et la nouvelle adresse.
L'appareil redémarre une seconde plus tard quand le type de connexion change, quand le réseau ou
le mot de passe Wi-Fi changent en mode Wi-Fi, ou pour tout changement Ethernet en mode Ethernet.

!!! tip "L'appareil reste introuvable ?"

    Patientez une minute, vérifiez le mot de passe Wi-Fi, puis cherchez l'appareil dans la liste
    des appareils connectés de votre box. S'il ne rejoint pas le réseau, il rouvre de lui-même son
    point d'accès. S'il est injoignable de tout côté, voir le
    [firmware de secours](../systeme/firmware-de-secours.md).

## Pages liées

* [Assistant de connexion](assistant-de-connexion.md)
* [Se connecter au point d'accès](../../../aide/point-d-acces.md)
* [Firmware de secours](../systeme/firmware-de-secours.md)
* [Paramètres MQTT](../../domotique/mqtt/index.md)
