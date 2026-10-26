# Paramètres MQTT

Cet onglet (`Réseau → MQTT`, à côté de [Connexion réseau](index.md)) relie l'appareil à un
**courtier MQTT**. C'est ce qui permet à une plateforme domotique (Home Assistant, Jeedom,
Node-RED…) de **lire l'état** de vos équipements et de **les piloter**, sans passer par
l'interface web. Il est facultatif : sans MQTT, l'appareil fonctionne normalement.

Cette page décrit les réglages. Pour ce que l'appareil publie et écoute une fois connecté, voir
la page [MQTT](../integrations/mqtt.md).

![mqtt 1](v3/img/mqtt-1){ .on-glb }

La page est organisée en quatre blocs:

## Client MQTT

Ce bloc contient les deux interrupteurs qui décident **si** et **comment** l'appareil parle MQTT.

- **Activer le client MQTT** : l'interrupteur principal. Tant qu'il est désactivé, l'appareil
  ne publie rien et n'écoute rien, même si le reste du formulaire est rempli.
- **Publier découverte** : l'appareil envoie, en plus, des **fiches de description** de chacun de
  ses équipements. Une plateforme compatible (Home Assistant en tête) les lit et **crée toute
  seule** les entités correspondantes, sans que vous ayez à les déclarer une par une. Voir
  [Auto-découverte MQTT](../integrations/mqtt.md#auto-découverte-mqtt) pour le détail de ce qui
  est publié. Activer cet interrupteur fait apparaître le champ **Discovery Topic**, dans le bloc
  Topics.

Quand le client est **désactivé**, les blocs suivants sont **grisés mais restent modifiables** :
les réglages sont enregistrés dans tous les cas.

## Courtier

Ce bloc dit **où** se trouve le courtier, et **comment s'y identifier**.

- **Adresse du courtier** : une seule ligne composée de `mqtt://`, de l'**hôte** (le nom ou
  l'adresse IP de la machine qui héberge votre courtier), de deux-points, puis du **port**
  (`1883` par défaut). Un port hors de la plage valide (1 à 65535) est refusé à l'enregistrement.
- **Identifiant** et **Mot de passe** : à renseigner seulement si votre courtier exige une
  authentification (32 caractères au maximum chacun). Laissez-les vides pour un courtier ouvert.
  Le mot de passe ne s'affiche jamais en clair, sauf avec l'icône œil pendant la saisie ; un champ
  laissé tel quel signifie « je n'y touche pas », car l'appareil ne renvoie jamais le mot de passe
  déjà enregistré.

!!! warning "La liaison n'est pas chiffrée"

    `mqtt://` n'est pas un choix : ESPSomfy-RTS ne sait parler qu'en MQTT **non chiffré**.
    L'identifiant et le mot de passe circulent donc **en clair** sur le réseau. Utilisez un
    courtier de votre réseau local, jamais exposé sur Internet. À partir de **1600 px** de large,
    un encart de la page le rappelle. Voir [MQTT](../integrations/mqtt.md#activer-la-connexion)
    pour le pourquoi.

## Topics

Un *topic* (sujet) est l'« adresse » d'un message MQTT. Ce bloc règle comment l'appareil
**range** les siens.

- **Root Topic** (sujet racine) : le préfixe sous lequel **tout** ce que publie et écoute
  l'appareil est rangé, par exemple `espsomfy-CF8CF4/shades/1/position`. Il isole l'appareil des
  autres clients du même courtier : si vous avez deux boîtiers, chacun a sa propre racine. Il est
  rempli par défaut avec `espsomfy-` suivi de l'identifiant de l'appareil. Voir
  [Le sujet racine](../integrations/mqtt.md#le-sujet-racine).
- **Identifiant client** : le nom sous lequel l'appareil se présente au courtier. **Laissez-le
  vide** pour un identifiant unique, dérivé de l'appareil. Ne le renseignez que si votre courtier
  fonde ses règles d'accès sur cet identifiant, ou si vous préférez un nom lisible. Deux clients
  ne doivent jamais porter le même.
- **Discovery Topic** : visible seulement quand **Publier découverte** est activé. C'est le chemin
  sous lequel sont publiées les fiches de découverte. Sa valeur par défaut, `homeassistant`, est
  celle que Home Assistant écoute : ne la changez que si votre plateforme en attend une autre.
  
  ![mqtt 2](v3/img/mqtt-2){ .on-glb }

!!! important "Le Root Topic est vérifié même si MQTT est désactivé"

    Il ne peut pas être vide, ne peut pas contenir de joker (`+` ou `#`) et ne peut pas commencer
    par `/` ou `$`. Si vous saisissez une valeur refusée, le champ est remis à la valeur réellement
    en vigueur sur l'appareil, et sélectionné pour une correction immédiate.

## Aperçu des topics

Ce bloc latéral ne se règle pas : il **vous montre le résultat**. Il se met à jour **en direct
pendant la saisie**, à partir du Root Topic et du Discovery Topic, et affiche les topics de
l'**équipement 1** comme exemple :

| Ligne | Topic | À quoi il sert |
|---|---|---|
| **État de l'appareil** | `<racine>/status` | indique `online` ou `offline` : si l'appareil est joignable |
| **Position de l'équipement 1** | `<racine>/shades/1/position` | où se trouve l'équipement (à lire) |
| **Commande de l'équipement 1** | `<racine>/shades/1/target/set` | où vous lui demandez d'aller (à écrire) |
| **Découverte de l'équipement 1** | `<découverte>/cover/1/config` | sa fiche de découverte, si **Publier découverte** est activé |

C'est le moyen le plus rapide de vérifier qu'une racine est bien celle que votre plateforme
attend, avant d'enregistrer. Les mêmes topics existent pour chaque équipement, groupe, pièce et
planning : voir [MQTT](../integrations/mqtt.md).

## Enregistrer

Le bouton **Enregistrer** envoie tout le formulaire en une fois, puis ferme et rouvre la
connexion au courtier avec les nouveaux réglages.

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
