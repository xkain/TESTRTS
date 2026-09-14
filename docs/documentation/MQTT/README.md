# MQTT — ESPSomfy-RTS v3

Cette page décrit **l'intégralité de la surface MQTT** du firmware v3 : ce qu'il publie, ce
qu'il écoute, ce qu'il déclare à Home Assistant — et, tout aussi important, **ce qu'il
n'expose pas** et par quel autre chemin l'obtenir.

Elle remplace la section MQTT du wiki d'intégration pour cette version : plusieurs topics
ont été ajoutés en v3, un topic documenté au wiki n'a jamais existé, et les conditions de
publication ont changé.

---

## Sommaire

| Section | Contenu |
|---|---|
| [Mise en service](#mise-en-service) | réglages, topic racine, chiffrement |
| [Règles générales](#règles-générales) | rétention, QoS, sens de lecture des topics |
| [Topics publiés](#topics-publiés-lecture) | appareil, index, équipements, télécommandes, groupes, pièces, programmations |
| [Topics d'abonnement](#topics-dabonnement-pilotage) | commandes acceptées et validation des charges utiles |
| [Auto-découverte](#auto-découverte-home-assistant) | fiches `cover` / `switch` |
| [Cadence de publication](#cadence-de-publication) | ce qui part tout de suite, ce qui est étranglé |
| [Ce que MQTT n'expose pas](#ce-que-mqtt-nexpose-pas) | les fonctions v3 sans topic, et leur alternative |
| [Pièges](#pièges-et-vérifications) | diagnostic |

---

## Mise en service

Les réglages se trouvent dans **Réseau → MQTT**.

| Réglage | Rôle |
|---|---|
| Activé | ouvre la connexion au courtier |
| Hôte / Port | adresse du courtier, `1883` par défaut |
| Utilisateur / Mot de passe | identifiants du courtier, facultatifs |
| Identifiant client | nom annoncé au courtier. Vide → `client-<mac>`, unique par appareil |
| Sujet racine | préfixe de **tous** les topics de cet appareil |
| Publier découverte | active les fiches Home Assistant |
| Sujet racine de découverte | `homeassistant` par défaut |

### Le sujet racine n'est pas facultatif

Il délimite l'espace de noms de l'appareil sur le courtier : c'est lui qui fait que
`shades/+/target/set` n'est pas un topic **global** sur lequel n'importe quel autre client
du courtier pourrait piloter vos équipements.

Le firmware le contrôle donc à la saisie et refuse :

- un champ vide ;
- un `/` ou un `$` en tête (niveau vide, espace réservé du courtier) ;
- les jokers `+` et `#`, qui à l'abonnement élargiraient la portée au lieu de la restreindre ;
- les caractères de contrôle ;
- une suite d'espaces seuls.

Si le champ est malgré tout trouvé vide au chargement (configuration ancienne, restauration
d'une sauvegarde), il est comblé par `espsomfy-<serverId>` et la valeur est journalisée sur
le port série.

### La liaison est en clair, et seulement en clair

Le firmware ne parle que **`mqtt://`**. Il n'y a pas de MQTTS, et le choix du protocole n'est
plus proposé dans l'interface : il était saisissable, persisté et **sans le moindre effet**,
ce qui donnait la certitude fausse d'une liaison chiffrée pendant que l'identifiant et le mot
de passe du courtier partaient en clair.

> [!IMPORTANT]
> Les identifiants du courtier transitent en clair sur votre réseau. Réservez MQTT à un
> réseau local de confiance, et n'y réutilisez pas un mot de passe employé ailleurs.

### MQTT est indépendant de la sécurité de l'interface web

Activer un PIN ou un mot de passe dans **Sécurité** ne protège **que** l'interface web et
l'API REST. MQTT continue de fonctionner à l'identique, la seule barrière étant celle du
courtier (identifiants + ACL).

C'est aussi ce qui en fait une porte de secours utile : un PIN actif coupe l'intégration
Home Assistant REST/WebSocket, pas MQTT.

---

## Règles générales

L'appareil publie tout à la connexion, puis **seulement sur changement**. Un abonné qui se
raccorde plus tard retrouve l'état courant grâce à la rétention.

> [!CAUTION]
> **Ne publiez jamais sur un topic d'état.** Les topics de la section « publiés » sont en
> lecture seule ; y écrire désynchronise l'appareil et vos entités domotiques.
>
> **Ne posez ni rétention ni QoS > 0 sur les topics `/set`.** À chaque reconnexion, le
> courtier vous relivrerait la dernière commande retenue et l'appareil l'exécuterait —
> typiquement un volet qui se referme tout seul au redémarrage du module.

### Rétention

| Famille | Retenue |
|---|---|
| État et configuration (position, nom, type, drapeaux…) | **oui** — c'est un état, il doit survivre à une reconnexion |
| `status` (testament) | **oui** |
| `mac` | **oui** |
| `cmd`, `cmdSource`, `cmdAddress` | **non** — ce sont des événements, pas des états |
| `uptime` | **oui**, republié toutes les 60 s |
| Fiches de découverte | **oui** |

---

## Topics publiés (lecture)

Tous les topics ci-dessous sont préfixés par le sujet racine, noté `<root>`.

### Appareil

| Topic | Contenu |
|---|---|
| `<root>/status` | **testament (LWT)** : `online` à la connexion, `offline` posé par le courtier à la rupture |
| `<root>/mac` | adresse MAC de l'interface réseau active |
| `<root>/ipAddress` | adresse IP au moment de la connexion au courtier |
| `<root>/host` | nom d'hôte de l'appareil |
| `<root>/firmware` | version du firmware installée, ex. `v3.0.3` |
| `<root>/serverId` | identifiant unique dérivé de l'eFuse de la puce |
| `<root>/uptime` | secondes écoulées depuis le dernier démarrage |

`status`, `mac`, `host`, `firmware` et `serverId` sont publiés une fois à l'établissement de
la session : ils ne changent pas tant que l'appareil tourne.

`ipAddress` est **republié dès que l'adresse change**, sans attendre une reconnexion au
courtier : un bail DHCP renouvelé ou un repli Ethernet → Wi-Fi est donc visible tout de suite.

`uptime` est republié **toutes les 60 secondes**. C'est le seul topic périodique de
l'appareil ; il coûte une poignée d'octets par minute et permet de détecter un redémarrage
que rien d'autre ne signalerait (la valeur repart de zéro).

### Index

Trois tableaux JSON qui disent ce qui existe, sans avoir à balayer les identifiants.

| Topic | Contenu | Exemple |
|---|---|---|
| `<root>/shades` | identifiants des équipements déclarés | `[1,2,5]` |
| `<root>/groups` | identifiants des groupes déclarés | `[1,3]` |
| `<root>/rooms` | identifiants des pièces déclarées | `[1,2]` |
| `<root>/schedules` | identifiants des programmations déclarées | `[1,4]` |

Ils sont réémis dès qu'un élément est ajouté ou supprimé, sans republier le reste.

### Équipements — identification et configuration

`<root>/shades/<shadeId>/…`

| Topic | Contenu |
|---|---|
| `shadeId` | identifiant numérique |
| `name` | nom défini pour l'équipement |
| `remoteAddress` | adresse radio assignée |
| `shadeType` | type d'équipement, voir la table ci-dessous |
| `tiltType` | type d'inclinaison, voir la table ci-dessous |
| `flipCommands` | `true`/`false` — commandes inversées (Haut ↔ Bas) |
| `flipPosition` | `true`/`false` — sens de lecture du pourcentage |

**`shadeType`**

| Valeur | Type | Valeur | Type |
|---|---|---|---|
| `0` | store enrouleur | `9` | contact sec |
| `1` | store vénitien | `10` | contact sec 2 boutons |
| `2` | rideau gauche | `11` | portail gauche |
| `3` | store banne | `12` | portail centre |
| `4` | volet | `13` | portail droit |
| `5` | garage 1 bouton | `14` | portail 1 bouton gauche |
| `6` | garage 3 boutons | `15` | portail 1 bouton centre |
| `7` | rideau droit | `16` | portail 1 bouton droit |
| `8` | rideau central | | |

**`tiltType`**

`0` aucun · `1` moteur d'inclinaison · `2` inclinaison intégrée · `3` inclinaison seule ·
**`4` euromode**

### Équipements — mouvement et position

| Topic | Contenu | Condition |
|---|---|---|
| `position` | position de levage, 0-100 % | toujours |
| `direction` | `-1` monte · `0` arrêté · `1` descend | toujours |
| `target` | position de levage visée | toujours |
| `lastRollingCode` | dernier code tournant émis | toujours |
| `mypos` | position favorite « my », `-1` si non définie | toujours |
| `myTiltPos` | inclinaison favorite « my », `-1` si non définie | toujours |
| `tiltPosition` | inclinaison actuelle, 0-100 % | `tiltType ≠ 0` |
| `tiltTarget` | inclinaison visée | `tiltType ≠ 0` |
| `tiltDirection` | `-1` · `0` · `1` | `tiltType ≠ 0` |

> [!NOTE]
> Les trois topics d'inclinaison sont **effacés du courtier** quand l'équipement repasse à
> `tiltType = 0`. Sans cela, ils survivraient indéfiniment avec leur dernière valeur.

### Équipements — capteurs et drapeaux

| Topic | Contenu | Condition |
|---|---|---|
| `flags` | masque brut des drapeaux, voir ci-dessous | toujours |
| `windy` | `0`/`1` — l'équipement considère qu'il y a du vent | toujours |
| `sunFlag` | `0`/`1` — suivi soleil actif | capteur soleil déclaré |
| `sunny` | `0`/`1` — l'équipement considère qu'il y a du soleil | capteur soleil déclaré |

**Composition de `flags`**

| Bit | Valeur | Signification |
|---|---|---|
| 0 | `0x01` | suivi soleil actif (`sunFlag`) |
| 1 | `0x02` | un capteur soleil est déclaré |
| 2 | `0x04` | mode démonstration |
| 4 | `0x10` | vent détecté (`windy`) |
| 5 | `0x20` | soleil détecté (`sunny`) |
| 7 | `0x80` | position « my » simulée |

> [!WARNING]
> Le wiki d'intégration documente un topic `shades/<id>/sunSensor`. **Il n'existe pas.**
> Le firmware ne le publie que pour les **groupes**. Pour un équipement, l'information se lit
> dans le bit `0x02` de `flags`.

### Équipements — événements de commande

Publiés **sans rétention** à chaque commande reçue ou émise, y compris celles venues d'une
télécommande physique.

| Topic | Contenu |
|---|---|
| `cmd` | commande Somfy, ex. `Up`, `Down`, `My`, `Prog` |
| `cmdSource` | origine, ex. `remote`, `group`, `internal` |
| `cmdAddress` | adresse radio de l'émetteur |

C'est le seul moyen, en MQTT, de savoir qu'une télécommande murale vient d'être actionnée.

### Équipements — télécommandes liées

`<root>/shades/<shadeId>/remotes/<n>/…`, avec `n` de 1 à 7 : l'emplacement de liaison, stable
tant que la télécommande reste liée.

| Topic | Contenu |
|---|---|
| `address` | adresse radio de la télécommande liée à cet emplacement |
| `rssi` | puissance du dernier signal reçu de cette télécommande, en dBm (valeur négative) |

`address` est publié à l'enregistrement de l'équipement, à la liaison et à la déliaison d'une
télécommande, ainsi qu'à chaque connexion au courtier. Un emplacement libéré voit ses deux
topics effacés.

`rssi` n'apparaît qu'**après réception d'une première trame** de cette télécommande depuis le
démarrage : c'est une mesure vivante, jamais persistée, qui repart à zéro à chaque
redémarrage. Il n'est republié que sur changement de valeur, et au plus une fois toutes les
5 secondes par équipement — une télécommande maintenue appuyée envoie des dizaines de trames.

C'est la mesure à regarder pour diagnostiquer une portée insuffisante : plus la valeur est
proche de zéro, meilleure est la réception.

### Programmations

`<root>/schedules/<scheduleId>/…`

| Topic | Contenu |
|---|---|
| `scheduleId` | identifiant de la règle |
| `name` | nom de la règle |
| `enabled` | `0`/`1` — règle active ou suspendue |
| `targetType` | `shade` ou `group` |
| `targetId` | identifiant de l'équipement ou du groupe visé |
| `dayMask` | jours de déclenchement, masque de bits : bit 0 = dimanche … bit 6 = samedi |
| `timeRef` | `clock`, `sunrise` ou `sunset` |
| `hour`, `minute` | heure configurée — n'a de sens que si `timeRef` vaut `clock` |
| `sunOffset` | décalage en minutes par rapport au lever/coucher, signé (ex. `-20`) |
| `positionMode` | `position`, `my` ou `tiltonly` |
| `targetPos` | consigne de levage 0-100 % — utilisée seulement si `positionMode` = `position` |
| `targetTilt` | consigne d'inclinaison, `-1` si non applicable |
| `retries` | nombre de renvois de fiabilité après déclenchement (`0` = désactivé) |
| `nextTime` | **heure réelle de déclenchement du jour**, `HH:MM` |
| `lastRun` | horodatage ISO 8601 local du dernier déclenchement, ex. `2026-09-14T07:42:00+0200` |

**`nextTime` est la valeur utile d'une règle solaire.** Pour une règle `clock` elle recopie
simplement `hour`/`minute` ; pour une règle `sunrise`/`sunset` elle donne l'heure à laquelle
la règle va *effectivement* partir aujourd'hui, décalage appliqué — la seule façon de lire
« coucher du soleil − 20 min » comme une heure.

Elle est recalculée une fois par jour, et aussi dès que le fuseau horaire ou la position
géographique change en cours de journée. Le topic est **effacé** quand l'heure solaire est
indisponible : position géographique non configurée, ou jour/nuit polaire ce jour-là. Un
`nextTime` absent sur une règle solaire signifie donc « cette règle ne partira pas
aujourd'hui ».

> [!NOTE]
> `lastRun` n'existe qu'après un premier déclenchement, et il est posé même si la cible a
> disparu entre-temps : il dit que la règle a tiré, pas que le moteur a bougé — le RTS
> n'offre aucune confirmation d'exécution.

Les règles sont publiées **une par une**, à raison d'une toutes les 100 ms : une reconnexion
au courtier avec 32 règles met environ 3 secondes à tout republier, sans jamais bloquer le
séquencement radio. Une règle supprimée voit tous ses topics effacés, y compris si la
suppression a eu lieu pendant que MQTT était déconnecté.

### Groupes

`<root>/groups/<groupId>/…`

| Topic | Contenu |
|---|---|
| `groupId` | identifiant du groupe |
| `name` | nom du groupe |
| `remoteAddress` | adresse radio du canal de groupe |
| `groupType` | type de groupe (`0` = canal) |
| `flags` | masque brut, même composition que pour un équipement |
| `sunSensor` | `true`/`false` — au moins un membre déclare un capteur soleil |
| `direction` | `-1` · `0` · `1` |
| `lastRollingCode` | dernier code tournant émis sur le canal |
| `flipCommands` | `true`/`false` |
| `sunFlag` | `0`/`1` |
| `sunny` | `0`/`1` |
| `windy` | `0`/`1` |

Les drapeaux d'un groupe sont **recalculés depuis ses membres** : ils reflètent l'état
agrégé, pas un réglage propre au groupe.

### Pièces

`<root>/rooms/<roomId>/…`

| Topic | Contenu |
|---|---|
| `roomId` | identifiant de la pièce |
| `name` | nom de la pièce |
| `sortOrder` | rang d'affichage |

> [!NOTE]
> L'**appartenance** n'est pas publiée : aucun topic ne dit quel équipement ou quel groupe
> appartient à quelle pièce. Voir [Ce que MQTT n'expose pas](#ce-que-mqtt-nexpose-pas).

### Nettoyage des topics

Un équipement, un groupe ou une pièce supprimé voit **tous** ses topics retenus effacés —
y compris s'il a été supprimé pendant que MQTT était déconnecté : le firmware mémorise en
NVS, sous forme de masques de bits, les identifiants réellement publiés lors de la session
précédente et ne nettoie que ceux-là.

Concrètement : plus d'équipements ni de groupes fantômes dans un explorateur MQTT, et
aucune publication inutile à la connexion.

---

## Topics d'abonnement (pilotage)

### Équipements

`<root>/shades/<shadeId>/<commande>/set`

| Commande | Charge utile | Effet |
|---|---|---|
| `direction` | `-1`, `0`, `1` | `-1` monte, `1` descend, `0` envoie la commande **My** (arrêt ou position favorite) |
| `target` | `0`-`100` | déplace l'équipement jusqu'à X % |
| `tiltTarget` | `0`-`100` | incline jusqu'à X % |
| `mypos` | `-1`-`100` | définit la position favorite de levage — **bascule** : renvoyer la valeur déjà mémorisée l'efface |
| `myTiltPos` | `-1`-`100` | définit l'inclinaison favorite — **bascule**, même règle |
| `position` | `0`-`100` | **synchronise** la position estimée, sans mouvement moteur |
| `tiltPosition` | `0`-`100` | **synchronise** l'inclinaison estimée, sans mouvement moteur |
| `sunFlag` | `0`, `1` | `1` active le suivi soleil, `0` le désactive |
| `sunny` | `0`, `1` | force l'état du capteur soleil |
| `windy` | `0`, `1` | force l'état du capteur vent |

### Groupes

`<root>/groups/<groupId>/<commande>/set`

| Commande | Charge utile | Effet |
|---|---|---|
| `direction` | `-1`, `0`, `1` | monte, descend ou **My** sur le canal de groupe |
| `sunFlag` | `0`, `1` | `1` active le suivi soleil du groupe, `0` le désactive |
| `sunny` | `0`, `1` | force l'état soleil de tous les membres |
| `windy` | `0`, `1` | force l'état vent de tous les membres |

> [!NOTE]
> Il n'existe **pas** de `groups/<id>/target/set` : un groupe se monte, se descend ou
> s'arrête, mais ne se positionne pas à un pourcentage en MQTT. Voir
> [Ce que MQTT n'expose pas](#ce-que-mqtt-nexpose-pas).

### Programmations

`<root>/schedules/<scheduleId>/enabled/set`

| Charge utile | Effet |
|---|---|
| `1` | réactive la règle |
| `0` | suspend la règle sans la supprimer |

Le changement est **persisté** : il survit à un redémarrage, exactement comme la case à
cocher de l'interface web. Suspendre une règle annule aussi le cycle de renvois de fiabilité
en cours, le cas échéant.

C'est la seule commande de planification exposée. Déclencher une règle à la main n'en est pas
une : cela revient à piloter l'équipement ou le groupe, ce que les topics ci-dessus font
déjà. Créer, modifier ou supprimer une règle reste du ressort de l'interface web et de l'API
REST — ces opérations valident des combinaisons de champs qu'une charge utile MQTT plate ne
permet pas d'exprimer.

### Validation des charges utiles

La charge utile vient du réseau : le firmware la contrôle strictement.

- **Seul un entier est accepté.** La chaîne doit être intégralement consommée par la
  conversion (les espaces de fin sont tolérés, certains clients MQTT en ajoutent). `ON`,
  `open`, `50%` ou une charge utile vide sont **ignorés** — et non plus interprétés comme
  `0`, ce qui envoyait autrefois l'équipement grand ouvert.
- **Chaque commande écrête sa propre plage**, listée dans les tables ci-dessus.
- Un identifiant inconnu est ignoré silencieusement.

`sunFlag` a la même orientation pour un équipement et pour un groupe : `1` active, `0`
désactive — l'aller-retour « lire `sunFlag`, le réécrire à l'identique » ne change donc rien.

`mypos` et `myTiltPos` sont en revanche des **bascules**, et ne supportent pas cet
aller-retour : réécrire la valeur courante **efface** la position favorite. Elles sont de
plus ignorées si l'équipement est en mouvement, ou s'il ne gère pas de position favorite.

---

## Auto-découverte Home Assistant

Cochez **Publier découverte** et renseignez le sujet racine de découverte
(`homeassistant` par défaut).

> [!TIP]
> Si vous utilisez Home Assistant, préférez l'intégration dédiée
> [ESPSomfy-RTS-enhanced](https://github.com/xkain/ESPSomfy-RTS-enhanced) : elle expose
> nettement plus que la découverte MQTT, en particulier les capteurs. La découverte MQTT vise
> d'abord les **autres** plateformes qui la supportent.

### Où partent les fiches

| Entité | Topic de la fiche |
|---|---|
| équipement, tous types sauf contact sec | `<discoTopic>/cover/<shadeId>/config` |
| équipement, contact sec et contact sec 2 boutons | `<discoTopic>/switch/<shadeId>/config` |
| télécommande liée, une par emplacement occupé | `<discoTopic>/sensor/<shadeId>r<n>/config` |
| programmation, interrupteur d'activation | `<discoTopic>/switch/sched<id>/config` |
| programmation, heure du jour | `<discoTopic>/sensor/sched<id>next/config` |
| programmation, dernier déclenchement | `<discoTopic>/sensor/sched<id>run/config` |

Toutes ces entités déclarent le **même appareil** (`device.identifiers`), elles se rangent donc
sous un seul appareil Home Assistant.

Ces topics sont **absolus** : ils vivent sous le préfixe de Home Assistant, pas sous le sujet
racine de l'appareil. Une version antérieure les publiait par erreur sous
`<root>/homeassistant/...`, où Home Assistant ne regarde jamais — d'où une découverte
silencieusement inopérante. Le firmware purge désormais cette ancienne forme au passage.

> [!IMPORTANT]
> Après correction d'une découverte qui ne remontait pas, **redémarrez Home Assistant** :
> il ne relit les fiches retenues qu'au démarrage de l'intégration MQTT.

### Contenu de la fiche

| Champ | Valeur |
|---|---|
| `device.identifiers` | `mqtt_espsomfyrts_<serverId>` — un seul appareil pour tous les équipements |
| `device.name` | nom d'hôte de l'appareil |
| `device.model` | `ESPSomfy-RTS MQTT` |
| `device.mf` | `xkain` |
| `device.hw_version` | version du firmware |
| `unique_id` | `mqtt_<serverId>_shade<shadeId>` |
| `availability_topic` | `<root>/status`, avec `online`/`offline` |
| `device_class` | `blind`, `curtain`, `garage`, `awning`, `shutter` ou `shade` selon le type |

Pour l'entité d'équipement, les topics de commande et d'état sont exprimés relativement à
`~` = `<root>/shades/<id>` :
`~/direction/set`, `~/position`, `~/target/set`, `~/direction`, et pour l'inclinaison
`~/tiltTarget/set` et `~/tiltPosition`.

`payload_open` / `payload_close` et les positions ouvert/fermé suivent `flipPosition`, et sont
inversés pour un store banne dont le sens naturel est l'inverse d'un volet.

### Les entités ajoutées

| Entité | Type HA | Détail |
|---|---|---|
| Télécommande liée | `sensor` | `device_class: signal_strength`, unité `dBm`, `state_class: measurement`, catégorie **diagnostic**. Une par emplacement occupé ; la fiche est effacée dès que la télécommande est déliée. |
| Programmation, activation | `switch` | catégorie **configuration**. C'est l'entité qui **pilote** : la basculer écrit sur `~/enabled/set`, et le changement est persisté. |
| Programmation, heure du jour | `sensor` | catégorie **diagnostic**, état = `nextTime`. Passe à *inconnu* quand l'heure solaire est indisponible. |
| Programmation, dernier déclenchement | `sensor` | `device_class: timestamp`, catégorie **diagnostic**, état = `lastRun`. Reste vide tant que la règle n'a jamais tiré. |

Les entités de catégorie *diagnostic* n'apparaissent pas sur la carte principale de l'appareil :
dépliez la section **Diagnostic** de la page de l'appareil dans Home Assistant.

### Changement de type d'équipement

Passer un équipement de la famille « cover » à « contact sec » (famille « switch ») ou
l'inverse **efface la fiche de l'autre famille**. Sans cela, l'ancienne fiche retenue restait
chez le courtier et Home Assistant affichait la même entité deux fois, dont une qui ne
répondait plus.

Supprimer un équipement efface les deux familles.

---

## Cadence de publication

Pendant un mouvement, la position entière change jusqu'à cinq fois par seconde. Republier
autant saturerait la liaison, et chaque publication se fait sur la tâche qui porte aussi le
séquencement radio.

| Donnée | Cadence |
|---|---|
| `direction`, `tiltDirection` | **immédiate** — elles ne changent qu'aux transitions |
| `flags`, `sunFlag`, `sunny`, `windy` | **immédiate**, y compris pendant un mouvement (c'est justement là qu'un capteur de vent se déclenche) |
| `position`, `target`, `tiltPosition`, `tiltTarget` | au plus **une fois par seconde** pendant le mouvement |
| position finale, à l'arrêt | **immédiate**, exacte, sans attendre la fin de la fenêtre |

La position est suivie **quel que soit le chemin** qui l'a modifiée : commande MQTT,
interface web, planification, ou télécommande physique reçue par la radio. Une version
antérieure laissait `position` figé pendant tout le trajet et ne remontait jamais un ordre
venu d'une télécommande.

---

## Ce que MQTT n'expose pas

Toutes les fonctions du firmware ne sont pas représentées en MQTT. Ce tableau dit lesquelles,
et par quel chemin les atteindre.

| Fonction | En MQTT | Alternative |
|---|---|---|
| **Créer / modifier / supprimer une programmation** | l'état et l'activation sont exposés, pas l'édition | REST : `/addSchedule`, `/saveSchedule`, `/deleteSchedule` |
| **Appartenance à une pièce** | les pièces sont publiées, pas le lien équipement → pièce | REST `/shades`, `/groups` (champ `roomId`) ; WebSocket `shadeState` / `groupState` |
| **Position d'un groupe en %** | `direction/set` seulement | disponible **uniquement** depuis une programmation ; ni REST ni MQTT ne l'exposent |
| **Position favorite d'un groupe** | aucun `mypos/set` de groupe | par équipement membre |
| **Découverte HA des groupes** | aucune fiche n'est publiée pour les groupes | intégration ESPSomfy-RTS-enhanced |
| **Témoin lumineux** (LED de statut, retour par équipement/groupe, indicateur radio) | rien | interface web, REST `/setgeneral` et `/saveShade` |
| **Détail d'une télécommande liée** (code tournant, dernière trame brute) | seuls l'adresse et le RSSI sont publiés | REST `/shade?shadeId=` ; WebSocket `remoteFrame` |
| **Répéteurs** | rien | REST `/linkRepeater`, `/unlinkRepeater`, `/getRadio` |
| **Position géographique, lever/coucher du soleil** | rien | REST `/setgeneral`, `/controller` |
| **Diagnostic système** (mémoire, raison du dernier redémarrage, cadence de boucle) | seul `uptime` est publié ; pas de `freeHeap` ni de `rssi` Wi-Fi | REST `/controller` ; WebSocket `memStatus` |
| **État d'une mise à jour OTA** | rien | WebSocket `fwStatus` |
| **Balayage de fréquence, journal radio** | rien | WebSocket `frequencyScan`, `remoteFrame` |
| **Redémarrage de l'appareil** | aucun topic de commande | REST `/reboot` |
| **Appairage, codes tournants, configuration** | lecture seule (`remoteAddress`, `lastRollingCode`) | REST `/setPaired`, `/unpairShade`, `/setRollingCode` |

> [!NOTE]
> Ces absences sont des **constats**, pas des pannes : les fonctions concernées marchent, mais
> par un autre chemin. Le cas de la **position de groupe en pourcentage** est le seul qui n'ait
> aucun équivalent hors planification.

---

## Pièges et vérifications

### L'appareil ne se connecte pas au courtier

Le port série donne le motif exact, une fois par motif (la tentative est relancée toutes les
10 s, répéter la ligne noierait le journal) :

```
MQTT: connexion a <hote>:<port> echouee (state=<n>)
```

| `state` | Signification |
|---|---|
| `-4` | le courtier a accepté la connexion mais n'a pas répondu à temps |
| `-2` | la connexion TCP a échoué : hôte/port injoignable, courtier éteint, pare-feu — **ou courtier attendant du TLS**, que ce firmware ne sait pas parler |
| `4` | identifiants refusés |
| `5` | non autorisé par le courtier (ACL) |

### Les entités Home Assistant n'apparaissent pas

1. Vérifiez que **Publier découverte** est coché.
2. Vérifiez, avec un explorateur MQTT, que `<discoTopic>/cover/<id>/config` **existe** et
   n'est pas vide.
3. **Redémarrez Home Assistant.**

> [!WARNING]
> **Piège de lecture.** Un explorateur MQTT montre *deux* nœuds `homeassistant` : celui de la
> racine du courtier, qui porte les vraies fiches, et un second **imbriqué sous votre sujet
> racine** (`<root>/homeassistant/…`), dont tous les nœuds sont vides.
>
> Ce second nœud est normal et voulu : le firmware y envoie des messages vides pour purger
> les fiches qu'une version antérieure publiait au mauvais endroit. Le voir n'indique aucun
> problème — au contraire, sa présence prouve que la découverte s'exécute. Ne jugez de l'état
> d'une fiche que sur le nœud `homeassistant` de la **racine**.

### Les capteurs sont introuvables dans Home Assistant

RSSI, heure du jour et dernier déclenchement sont classés en **diagnostic**. Home Assistant
les range dans une section repliée de la page de l'appareil, pas sur la carte principale.

### Un volet fantôme reste affiché

Un explorateur MQTT montre les messages **retenus**. Si un identifiant supprimé persiste,
reconnectez l'appareil au courtier : le nettoyage ciblé s'exécute à chaque connexion.

### Une valeur semble figée

`status`, `mac`, `host`, `firmware` et `serverId` ne changent pas tant que l'appareil tourne :
c'est normal. `ipAddress` et `uptime`, eux, se rafraîchissent d'eux-mêmes.

### Un `rssi` de télécommande n'apparaît pas

Il n'est publié qu'après réception d'une première trame depuis le démarrage. Appuyez sur un
bouton de la télécommande concernée : le topic apparaît dans les secondes qui suivent. Un
`address` publié sans `rssi` associé signifie « liée, mais jamais entendue depuis le dernier
redémarrage ».

### Lire `= {}` dans MQTT Explorer

Un nœud affiché `= {}` signifie que **le nœud lui-même ne porte pas de valeur**, seulement des
enfants. `<root>/shades = {}` est normal — c'est `<root>/shades/1/position` qui porte la
donnée. Ce n'est pas un topic vide.

---

## Voir aussi

- [Wiki — Intégrations](https://github.com/xkain/ESPSomfy-RTS/wiki/Int%C3%A9grations) : API REST, WebSockets, Home Assistant
- [ESPSomfy-RTS-enhanced](https://github.com/xkain/ESPSomfy-RTS-enhanced) : intégration Home Assistant dédiée
