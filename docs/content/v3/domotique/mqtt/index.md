# MQTT

La page **MQTT** relie l'appareil à un **courtier MQTT**. C'est ce qui permet à un système
domotique (Home Assistant, Jeedom, Node-RED…) de **lire l'état** de vos équipements et de **les
piloter**, sans passer par l'interface web. Elle est facultative : sans MQTT, l'appareil fonctionne
normalement.

La page n'a pas d'onglets : elle se lit en trois parties, **Courtier**, **Topics** et
**Découverte**. Pour ce que l'appareil publie et écoute une fois connecté, voir
[Topics publiés et commandes](topics.md).

![Page MQTT](v3/img/mqtt-page){ .on-glb }

## Le bandeau

Le bandeau, à gauche sur ordinateur et en haut de la page sur tablette et téléphone, porte
l'interrupteur **Client MQTT** `Oui` / `Non`, et son état : *Activé* ou *Désactivé*. Il résume
aussi les réglages en cours de saisie, avant même l'enregistrement :

| Ligne | Ce qu'elle dit |
|---|---|
| **Courtier** | l'adresse complète, `mqtt://<hôte>:<port>` |
| **Topic racine** | le préfixe de tous les messages |
| **Découverte** | *publiée sous* le topic de découverte, ou *non publiée* |
| **Identifiants** | *compte « … »*, ou *Aucun* |

Ces lignes sont affichées directement sur ordinateur, et derrière **Détails** sur tablette. Sur
téléphone, le bandeau ne garde qu'une ligne de résumé : son menu ⋮ propose **Détails**, qui ouvre
ces informations dans un panneau, et **Aide sur cette page**.

Client à `Non`, une note le rappelle en haut de la page : *ces réglages sont gardés mais rien
n'est envoyé au courtier*. Les tuiles sont grisées mais restent modifiables et s'enregistrent quand
même.

## Courtier { #courtier }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Adresse du courtier** | le **Protocole**, toujours `mqtt://`, l'**Hôte** (adresse IP ou nom du serveur, 64 caractères) et le **Port** (1 à 65535, `1883` d'habitude). L'hôte est obligatoire quand le client est à `Oui`. |
| **Identifiants** | le **Nom d'utilisateur** et le **Mot de passe**, 32 caractères chacun, à laisser vides pour un courtier ouvert. Un mot de passe enregistré n'est jamais renvoyé par l'appareil : le champ masqué veut dire « inchangé ». |

!!! warning "La liaison n'est pas chiffrée"

    ESPSomfy-RTS ne parle que le MQTT **non chiffré** : identifiant et mot de passe circulent en
    clair. Utilisez un courtier de votre réseau local, jamais exposé sur Internet, et un compte
    dédié. Voir [pourquoi](topics.md#activer-la-connexion).

## Topics { #topics }

Un *topic* est l'« adresse » d'un message MQTT.

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Nommage** | le **Topic racine**, préfixe de tout ce que l'appareil publie et écoute (64 caractères), et l'**Identifiant client**, le nom sous lequel il se présente au courtier |
| **Aperçu des topics** | le résultat, en direct pendant la saisie, pour l'équipement 1 : **État de l'appareil** (`<racine>/status`), **Position de l'équipement 1** (`<racine>/shades/1/position`) et **Commande de l'équipement 1** (`<racine>/shades/1/target/set`) |

Le **Topic racine** isole l'appareil des autres clients du courtier : deux appareils doivent en
avoir deux différents. Par défaut, c'est `espsomfy-` suivi de l'identifiant de l'appareil. Il ne
peut pas être vide, contenir `+` ou `#`, ni commencer par `/` ou `$` : une valeur refusée est
remise à celle en vigueur, sélectionnée pour être corrigée. Ce contrôle a lieu même client à
`Non`. Voir [Le sujet racine](topics.md#le-sujet-racine).

L'**Identifiant client**, laissé vide, est fabriqué à partir de l'adresse de l'appareil. Ne le
remplissez que si votre courtier fonde ses droits dessus ; deux clients ne doivent jamais porter le
même.

## Découverte { #decouverte }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Découverte automatique** | **Publier la découverte** : à `Oui`, l'appareil publie une fiche par équipement, et votre système domotique les crée tout seul. Le **Topic de découverte**, `homeassistant` pour Home Assistant, n'est modifiable qu'avec la découverte à `Oui`. |
| **Aperçu** | le topic de la **Fiche de l'équipement 1**, `<découverte>/cover/1/config`, ou *Découverte désactivée : rien n'est publié sous ce topic.* |

Après un changement de topic, votre système domotique peut demander un redémarrage pour voir les
nouvelles fiches. Le détail des fiches publiées est dans
[Auto-découverte MQTT](topics.md#auto-découverte-mqtt).

## Enregistrer

La barre d'enregistrement liste chaque réglage modifié, avec l'ancienne et la nouvelle valeur ;
`Annuler` remet la page dans l'état enregistré. `Enregistrer` envoie tous les réglages, puis
l'appareil coupe la connexion au courtier et la rouvre avec les nouveaux.

## Bon à savoir : comment fonctionne MQTT

!!! info "Le principe en quelques mots"

    MQTT n'est pas une conversation directe entre deux appareils : tout passe par un
    **courtier** (*broker*), un petit serveur installé chez vous, par exemple sur la machine qui
    héberge Home Assistant.

    - Chacun **publie** des messages sur des **topics**, comme des étiquettes classées en
      arborescence : `espsomfy-CF8CF4/shades/1/position`.
    - Chacun **s'abonne** aux topics qui l'intéressent. Le courtier transmet à chaque abonné les
      messages publiés sur ses topics.
    - ESPSomfy-RTS fait les deux : il **publie** l'état de ses équipements (position, direction,
      etc.) et **s'abonne** aux topics se terminant par `/set` pour recevoir vos ordres.

    Pour **lire** un état, votre plateforme s'abonne au topic de l'équipement. Pour le
    **piloter**, elle publie une valeur sur son topic `/set` : l'appareil la reçoit et envoie
    la commande radio.

    Les états sont **retenus** (*retain*) par le courtier : un client qui se connecte plus tard
    reçoit tout de suite la dernière valeur connue, sans attendre le prochain changement.
    Le topic `status` joue le rôle de témoin : il passe à `offline` quand l'appareil disparaît,
    ce qui permet à votre plateforme de le signaler.

    Pour voir ce qui circule, un outil comme [MQTT Explorer](http://mqtt-explorer.com/) affiche
    l'arborescence du courtier en direct.

## Pages liées

* [Topics publiés et commandes](topics.md)
* [Déclencheurs](../declencheurs.md)
* [Home Assistant](../home-assistant/index.md)
