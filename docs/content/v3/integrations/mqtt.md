# MQTT

ESPSomfy-RTS publie en continu l'état de vos équipements, groupes, pièces et plannings sur
votre courtier MQTT, et s'abonne à des sujets dédiés pour les piloter en retour — de quoi
l'intégrer à n'importe quelle plateforme domotique qui parle MQTT, pas seulement Home
Assistant. Pour l'intégration Home Assistant proprement dite, voir
[Home Assistant](index.md#home-assistant) : elle utilise ce même mécanisme en coulisses, mais une
intégration dédiée reste préférable à MQTT nu quand c'est votre seule cible.

## Activer la connexion

Se configure depuis **Réseau → MQTT** — voir [Paramètres MQTT](../reseau/parametres-mqtt.md) pour le détail
de chaque champ (hôte, port, identifiants, sujet de découverte…). Cette page-ci documente ce
qui se passe une fois connecté : ce que l'appareil publie, et comment le piloter en retour.

!!! danger "Attention"

    **La connexion n'est jamais chiffrée.** ESPSomfy-RTS ne sait parler qu'en MQTT en clair : il
    n'existe aucune option TLS, même si certains anciens fichiers de sauvegarde portent encore la
    trace d'un champ « protocole » — il est ignoré, pas appliqué (implémenter TLS coûterait
    environ 34 Ko de mémoire retenue en permanence, un budget qui entre directement en
    concurrence avec celui des mises à jour). Réservez cette fonctionnalité à un courtier sur
    votre réseau local, jamais exposé directement sur Internet.

### Le sujet racine

Tout ce que publie ou écoute l'appareil vit sous un seul préfixe — le **sujet racine** — qui
isole son espace de noms de celui des autres appareils sur le même courtier :
`[racine]/shades/1/position`, `[racine]/groups/2/direction/set`, etc. Il ne peut **jamais être
vide** : un sujet racine vide publierait et s'abonnerait directement à la racine du courtier,
où n'importe quel autre client pourrait piloter vos équipements. S'il n'est pas renseigné,
l'appareil comble automatiquement le champ avec `espsomfy-<identifiant serveur>` (le même
identifiant de 6 caractères que celui du
[fichier de sauvegarde](../firmware/anatomie-sauvegarde.md#enregistrement-den-tête)). Les
jokers (`+`, `#`), un `/` ou un `$` en tête, et les caractères de contrôle sont refusés à la
saisie.

!!! tip "Astuce"

    Pour explorer ce qui se publie réellement sans rien deviner, un outil comme
    **[MQTT Explorer](http://mqtt-explorer.com/)** affiche en direct l'arborescence complète de
    votre courtier, sujet par sujet — bien plus parlant que cette page pour se faire une idée
    concrète avant d'écrire la moindre ligne d'intégration.

### Exemple concret

Avec un sujet racine `espsomfy-a1b2c3` (reprenant l'exemple de la page
[Anatomie du fichier de sauvegarde](../firmware/anatomie-sauvegarde.md)) et un équipement n°4
nommé « Volet Salon », voici à quoi ressemblent quelques sujets réels, tels qu'un explorateur
MQTT les afficherait :

```
espsomfy-a1b2c3/status                       online
espsomfy-a1b2c3/shades                       [1,2,3,4,5,6,7,8,9,10]
espsomfy-a1b2c3/shades/4/name                Volet Salon
espsomfy-a1b2c3/shades/4/shadeType           4
espsomfy-a1b2c3/shades/4/position            0
espsomfy-a1b2c3/shades/4/target              0
espsomfy-a1b2c3/shades/4/direction           0
espsomfy-a1b2c3/groups/1/name                Rez-de-chaussée
espsomfy-a1b2c3/groups/1/direction           0
```

`shades/4/position` à `0` et `direction` à `0` : le Volet Salon est actuellement **ouvert et
à l'arrêt** (rappel : `0` = ouvert, `100` = fermé, sauf si l'équipement a son réglage
« Inverser position » activé — voir [EQUIPEMENTS](../somfy/equipements/index.md)).

## Sujets publiés (lecture seule)

Toutes les valeurs ci-dessous sont **retenues** (`retain`) par le courtier : un client qui se
connecte après coup lit immédiatement le dernier état, sans attendre un prochain changement.

### Informations système

| Sujet | Contenu |
|---|---|
| `[racine]/status` | **Testament (LWT)** du client — `online` tant que connecté, `offline` dès la coupure (propre ou non) |
| `[racine]/ipAddress` | Adresse IP actuelle |
| `[racine]/host` | Nom d'hôte configuré |
| `[racine]/firmware` | Version du firmware |
| `[racine]/serverId` | Identifiant unique de l'appareil |
| `[racine]/mac` | Adresse MAC |
| `[racine]/uptime` | Durée de fonctionnement en secondes, republiée toutes les 60 s |
| `[racine]/shades`, `/groups`, `/rooms`, `/schedules` | Un tableau JSON des identifiants actuellement configurés pour chaque famille — ex. `[1,2,4]` — republié à chaque (re)connexion, pratique pour construire un tableau de bord qui découvre lui-même ce qui existe |

### Équipements (`[racine]/shades/[shadeId]/…`)

| Sujet | Contenu |
|---|---|
| `shadeId`, `name`, `remoteAddress`, `shadeType`, `tiltType` | Identité — voir les [tables de valeurs](../firmware/anatomie-sauvegarde.md#types-déquipement) pour `shadeType`/`tiltType` |
| `flipCommands`, `flipPosition` | Réglages d'inversion de l'équipement |
| `position`, `target` | Position de levage actuelle et visée (0-100) |
| `tiltPosition`, `tiltTarget`, `tiltDirection` | Idem pour l'inclinaison — **absents** si l'équipement n'a pas d'inclinaison |
| `direction` | `-1` monte, `0` arrêté, `1` descend |
| `mypos`, `myTiltPos` | Position favorite (« My »), `-1` si non définie |
| `lastRollingCode` | Dernier code tournant utilisé |
| `flags` | Masque brut des drapeaux capteurs (voir [Anatomie du fichier de sauvegarde](../firmware/anatomie-sauvegarde.md#enregistrement-équipement)) |
| `sunFlag`, `sunny` | Présents uniquement si l'équipement a un capteur solaire associé |
| `windy` | Toujours publié, qu'un capteur vent existe ou non |
| `remotes/[1-7]/address`, `remotes/[1-7]/rssi` | Adresse et dernier signal radio de chaque télécommande liée — uniquement les emplacements occupés |

!!! note "Note"

    Pendant un mouvement, `position`/`target`/`tiltPosition`/`tiltTarget` sont republiés au
    maximum une fois par seconde (pour ne pas saturer le courtier à chaque pas de 20 % par
    seconde que fait le suivi de position) — sauf la position finale à l'arrêt, toujours publiée
    sans délai. `direction`, `tiltDirection` et les drapeaux capteurs, eux, ne sont **jamais**
    retardés : ils ne changent qu'aux transitions, pas en flux continu.

### Groupes (`[racine]/groups/[groupId]/…`)

| Sujet | Contenu |
|---|---|
| `groupId`, `name`, `remoteAddress`, `groupType` | Identité |
| `flipCommands` | Réglage d'inversion |
| `direction` | `-1`/`0`/`1`, comme pour un équipement |
| `lastRollingCode` | Dernier code tournant du groupe |
| `flags`, `sunSensor`, `sunFlag`, `sunny`, `windy` | Mêmes capteurs qu'un équipement, agrégés sur le groupe |

!!! note "Note"

    Un groupe ne publie ni `position` ni `target` : il ne mémorise pas de position propre, il ne
    fait que retransmettre une commande à ses membres — voir
    [GROUPES](../somfy/groupes/index.md)#caractéristiques-techniques).

### Pièces (`[racine]/rooms/[roomId]/…`)

| Sujet | Contenu |
|---|---|
| `roomId`, `name`, `sortOrder` | Identité et ordre d'affichage |

### Plannings (`[racine]/schedules/[scheduleId]/…`)

| Sujet | Contenu |
|---|---|
| `scheduleId`, `name`, `enabled` | Identité et état d'activation |
| `targetType` | `shade` ou `group` |
| `targetId`, `targetPos`, `targetTilt` | Cible et position visée |
| `dayMask` | Masque de jours (voir [Anatomie du fichier de sauvegarde](../firmware/anatomie-sauvegarde.md#bloc-plannings)) |
| `timeRef` | `clock`, `sunrise` ou `sunset` |
| `hour`, `minute`, `sunOffset` | Heure fixe, ou décalage en minutes si lever/coucher du soleil |
| `positionMode` | `position`, `my` ou `tiltonly` |
| `retries` | Tentatives de relance configurées |
| `nextTime` | Heure effective du prochain déclenchement (`HH:MM`) — absent si elle n'est pas calculable (ex. lever/coucher du soleil sans [position géographique](../general/position-geographique.md) configurée) |
| `lastRun` | Horodatage ISO 8601 du dernier déclenchement effectif |

## Sujets d'abonnement (pilotage)

L'appareil s'abonne à ces sujets pour recevoir des commandes. Le **payload doit être un
nombre entier** — tout ce qui n'en est pas un (texte, vide, décimal) est silencieusement
ignoré plutôt que mal interprété.

!!! danger "Attention"

    **Ne publiez jamais ces sujets avec l'indicateur « retain », et évitez toute QoS supérieure
    à 0.** Un message retenu sur un sujet de commande est réémis par le courtier à chaque
    reconnexion d'ESPSomfy-RTS — l'appareil rejouerait alors indéfiniment la même commande à
    chaque redémarrage ou coupure réseau. Ces sujets sont faits pour être publiés une fois, au
    moment de la commande, jamais conservés.

### Équipements (`[racine]/shades/[shadeId]/…/set`)

| Sujet | Valeur | Effet |
|---|---|---|
| `direction/set` | `-1`, `0`, `1` | Monte / Stop ou bascule / Descend |
| `target/set` | `0`-`100` | Déplace vers X % |
| `tiltTarget/set` | `0`-`100` | Incline vers X % |
| `mypos/set`, `myTiltPos/set` | `-1`-`100` | Définit la position favorite (`-1` l'efface) |
| `position/set`, `tiltPosition/set` | `0`-`100` | **Resynchronise** la position mémorisée sans déplacer le moteur (utile avec un capteur externe) |
| `sunFlag/set` | `0`, `1` | Active/désactive le suivi du capteur solaire |
| `sunny/set`, `windy/set` | `0`, `1` | Simule l'état d'un capteur soleil/vent — voir [EQUIPEMENTS](../somfy/equipements/index.md) |

### Groupes (`[racine]/groups/[groupId]/…/set`)

| Sujet | Valeur | Effet |
|---|---|---|
| `direction/set` | `-1`, `0`, `1` | Monte / Stop ou bascule / Descend, pour tous les membres |
| `target/set` | `0`-`100` | Déplace tous les membres vers X % |
| `sunFlag/set`, `sunny/set`, `windy/set` | `0`/`1` | Mêmes effets qu'un équipement, appliqués au groupe entier |

### Plannings (`[racine]/schedules/[scheduleId]/enabled/set`)

| Sujet | Valeur | Effet |
|---|---|---|
| `enabled/set` | `0`, `1` | Désactive/active le planning à distance, sans passer par l'interface |

## Exemples de commandes

En reprenant l'exemple ci-dessus (sujet racine `espsomfy-a1b2c3`, équipement n°4 « Volet
Salon », groupe n°1 « Rez-de-chaussée »), voici ce que ça donne avec le client en ligne de
commande `mosquitto_pub` (adaptez `-h` à l'adresse de votre courtier) :

```bash
# Ouvrir complètement le Volet Salon
mosquitto_pub -h 192.168.1.10 -t 'espsomfy-a1b2c3/shades/4/target/set' -m '0'

# Le fermer complètement
mosquitto_pub -h 192.168.1.10 -t 'espsomfy-a1b2c3/shades/4/target/set' -m '100'

# L'arrêter en plein mouvement (ou basculer My s'il est déjà à l'arrêt)
mosquitto_pub -h 192.168.1.10 -t 'espsomfy-a1b2c3/shades/4/direction/set' -m '0'

# Le positionner précisément à 30 % fermé
mosquitto_pub -h 192.168.1.10 -t 'espsomfy-a1b2c3/shades/4/target/set' -m '30'

# Fermer tous les équipements du groupe "Rez-de-chaussée"
mosquitto_pub -h 192.168.1.10 -t 'espsomfy-a1b2c3/groups/1/target/set' -m '100'

# Désactiver le planning n°2 sans toucher à l'interface
mosquitto_pub -h 192.168.1.10 -t 'espsomfy-a1b2c3/schedules/2/enabled/set' -m '0'

# Simuler du vent sur le Volet Salon (le rétracte s'il est équipé du capteur Eolis)
mosquitto_pub -h 192.168.1.10 -t 'espsomfy-a1b2c3/shades/4/windy/set' -m '1'
```

Et pour suivre en direct tout ce que publie l'appareil (équivalent en ligne de commande de
MQTT Explorer) :

```bash
mosquitto_sub -h 192.168.1.10 -t 'espsomfy-a1b2c3/#' -v
```

## Auto-découverte MQTT

Si **Publier découverte** est activée, l'appareil publie automatiquement des fiches de
configuration reconnues par les plateformes domotiques compatibles (dont Home Assistant,
sous le sujet choisi en **Sujet de découverte**) : chaque équipement apparaît comme un volet
roulant (`cover`) ou un interrupteur (`switch`) selon son type, chaque télécommande liée comme
un capteur, et chaque planning comme un interrupteur d'activation accompagné de deux capteurs
(prochain déclenchement, dernier déclenchement).

!!! tip "Astuce"

    Si Home Assistant est votre cible, préférez l'intégration dédiée
    [ESPSomfy-RTS Enhanced](index.md#home-assistant) à cette auto-découverte générique : elle offre un
    suivi plus complet (position en temps réel y compris pilotée par télécommande physique,
    meilleure gestion des capteurs) tout en s'appuyant sur ce même mécanisme MQTT en coulisses.

