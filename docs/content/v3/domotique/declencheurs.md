# Déclencheurs

Vous avez une télécommande RTS qui ne sert plus chez vous ? Elle peut maintenant servir de
**déclencheur** : lancer une automatisation, allumer une lumière, activer une scène…

La page **Déclencheurs** liste les **télécommandes écoutées**. Une télécommande écoutée n'est liée
à **aucun équipement** de l'appareil : ESPSomfy-RTS se contente de capter ses appuis, de les
afficher dans l'interface et de les transmettre à votre système domotique.

!!! quote "D'où vient l'idée"

    Cette fonction est née d'une proposition de
    [Timothee-Lhuillier](https://github.com/Timothee-Lhuillier), le 29 octobre 2026, dans l'issue
    [Independant remote listener](https://github.com/xkain/ESPSomfy-RTS/issues/75) du dépôt
    ESPSomfy-RTS. Merci pour cette idée.

Les appuis arrivent par deux voies, au choix : l'[intégration Home Assistant](#avec-home-assistant),
qui les reçoit directement de l'appareil, ou [MQTT](#par-mqtt), que n'importe quel système
domotique peut lire (Home Assistant, Jeedom, Node-RED…).

## Caractéristiques techniques

* **Capacité** : jusqu'à **14 télécommandes écoutées** par appareil.
* **Un appui = un événement** : une télécommande répète la même trame tant que le bouton est
    tenu. L'appareil ne retient que la première, en se fiant au code tournant, et non au temps
    écoulé.
* **Capteurs exclus** : les trames des capteurs soleil/vent ne sont pas transmises.
* **Mémorisation** : seuls l'adresse et le nom sont enregistrés. Ils font partie de la
    [sauvegarde](../appareil/systeme/anatomie-sauvegarde.md) et se restaurent avec l'option
    **Restaurer télécommandes écoutées**.

!!! info "Pour agir sur un appui"

    Seule, l'interface affiche les appuis mais ne déclenche rien. Il faut l'intégration
    Home Assistant **ESPSomfy-RTS Enhanced**, ou un client MQTT activé et connecté (voir
    [MQTT](mqtt/index.md)).

!!! warning "Attention"

    **L'écoute ne bloque pas la trame.** Si la télécommande pilote aussi un moteur, parce
    qu'elle y est appairée, ou un équipement de l'appareil, parce qu'elle y est liée, un appui le
    fera bouger comme avant. ESPSomfy-RTS signale ce second cas à la capture et sur la tuile
    de la télécommande : *« Cette télécommande commande aussi « … » : un appui le fera
    bouger. »*

## La page { #page }

![Page Déclencheurs](v3/img/declencheurs-page){ .on-glb }

Le bandeau, à gauche sur ordinateur et en haut de la page sur tablette et téléphone, compte les
télécommandes écoutées sur 14 et les places libres, et rappelle que *l'écoute ne bloque pas la
trame*.

La liste commence par la tuile **Capturer une télécommande**, grisée quand les 14 places sont
prises. Suit une tuile par télécommande écoutée :

| Élément | Ce qu'il montre ou permet |
|---|---|
| **Nom** | modifiable directement dans la tuile, 20 caractères au plus ; vide, c'est l'adresse qui sert de nom. Le nouveau nom est aussitôt republié vers votre système domotique. |
| **Dernier appui** | la touche et l'heure, ou *Aucun appui depuis le démarrage* |
| **Signal** | la force du dernier signal reçu, en dBm, avec des barres colorées selon sa qualité |
| **Adresse** | l'adresse radio de la télécommande |
| `Ne plus écouter` | retire la télécommande après confirmation ; sa fiche de découverte MQTT est effacée, mais l'appareil créé par l'intégration Home Assistant reste à supprimer à la main |

La tuile de la dernière télécommande appuyée est entourée de la couleur d'accent. Quand la
télécommande commande aussi un équipement de l'appareil, la tuile le dit en orange :
*Cette télécommande commande aussi « … » : un appui le fera bouger.* Tout s'applique tout de
suite, sans enregistrement.

!!! note "Note"

    Le dernier appui et le signal sont tenus en mémoire vive par l'appareil : ils s'affichent dès
    l'ouverture de la page, mais repartent de zéro à chaque redémarrage.

Sans télécommande écoutée, la page affiche *Aucune télécommande n'est écoutée* et la seule tuile
**Capturer une télécommande**.

## Ajouter une télécommande { #ajouter }

**Capturer une télécommande** ouvre une fenêtre d'écoute de **30 secondes** : *Appuyez sur une
touche de la télécommande*. Prenez la télécommande, ou sélectionnez la zone voulue sur une
télécommande multi-zones, et appuyez sur n'importe quelle touche. `Fermer` arrête l'écoute.

| Résultat | Ce qu'affiche la fenêtre | Que faire |
|---|---|---|
| *Télécommande reconnue* | le protocole, le nombre de bits, l'adresse et le signal, puis un champ **Nom** : *Ce nom désignera la télécommande dans votre système domotique.* | `Enregistrer`, ou `Annuler` |
| *Cette télécommande est déjà écoutée sous le nom « … ».* | les mêmes informations | `Écouter une autre` relance l'écoute |
| *Aucune télécommande entendue* | *Vérifiez sa pile ou rapprochez-vous de l'appareil, puis réessayez.* | `Réessayer` |

Si la télécommande commande aussi un équipement de l'appareil, la fenêtre l'avertit dès la
capture.

L'enregistrement est refusé, avec un message d'erreur, quand :

| Refus | Raison |
|---|---|
| la liste est **pleine** | les 14 places sont occupées |
| la télécommande est **répétée** | une même télécommande ne peut pas être à la fois répétée et écoutée (voir [Répéteur](../appareil/radio/index.md#repeater)) |
| l'adresse est celle d'un **équipement ou d'un groupe** de l'appareil | c'est une adresse que l'appareil émet lui-même, pas une télécommande physique |

## Exploiter les appuis

### Avec l'intégration Home Assistant { #avec-home-assistant }

L'intégration **ESPSomfy-RTS Enhanced** reçoit les appuis directement de l'appareil, par la même
connexion que l'état des équipements : MQTT n'est pas nécessaire. Chaque télécommande écoutée y
devient un appareil, rattaché à ESPSomfy-RTS et nommé comme dans l'interface, avec une entité
**`event`** (classe *button*).

* L'entité naît au **premier appui** de la télécommande, pas à sa capture : appuyez une fois sur
    une touche après l'avoir ajoutée. Elle est ensuite gardée d'un redémarrage à l'autre.
* Chaque appui lui apporte un événement dont l'`event_type` est celui du [tableau
    ci-dessous](#par-mqtt), traduit dans Home Assistant (*Montée*, *Descente*…), avec les
    attributs `rssi` et `address`.
* `Ne plus écouter` ne retire pas cet appareil de Home Assistant : supprimez-le vous-même.

Le détail côté Home Assistant est dans [Télécommandes écoutées](../../home-assistant/telecommandes-ecoutees.md).

L'exemple d'automatisation de la [découverte MQTT](#avec-la-decouverte-mqtt) vaut aussi pour
cette entité : remplacez seulement `entity_id` par le sien.

!!! warning "Une seule voie à la fois"

    Avec l'intégration **et** la découverte MQTT activées, la même télécommande apparaît deux fois
    dans Home Assistant. Choisissez l'une ou l'autre.

### Par MQTT { #par-mqtt }

À chaque appui reconnu, et tant que le client MQTT est connecté, l'appareil publie un message
sur le sujet :

```text
<sujet racine>/listeners/<adresse>/event
```

Son contenu est un petit JSON, par exemple `{"event_type":"up","rssi":-62}`. Il n'est **pas
retenu** par le courtier : c'est un événement, pas un état, et un abonné qui arrive après coup
ne doit pas croire à un appui. `rssi` est la force du signal reçu, en dBm. `event_type` dit
quelle touche a été pressée :

| `event_type` | Touche |
|---|---|
| `up`, `down`, `my` | Monter, Descendre, My |
| `my_up`, `my_down`, `up_down`, `my_up_down` | appuis simultanés sur deux ou trois touches |
| `prog` | PROG |
| `step_up`, `step_down` | pas à pas (lames orientables) |
| `sun_flag`, `flag` | activation / désactivation du mode soleil |
| `toggle` | commande bascule |
| `favorite`, `stop` | Favori et Stop des télécommandes 80 bits |

Avec une plateforme autre que Home Assistant, il suffit de vous abonner à ce sujet et de
filtrer sur `event_type`. Le sujet racine est celui réglé dans la page
[MQTT](mqtt/index.md#topics), et l'adresse est celle affichée sur la
tuile de la télécommande. Pour le détail de ce que publie l'appareil par ailleurs, voir
[MQTT](mqtt/topics.md).

### Avec la découverte MQTT de Home Assistant { #avec-la-decouverte-mqtt }

Quand **Publier la découverte** est à `Oui`, chaque télécommande écoutée devient en plus une entité
**`event`** (classe *button*), créée par l'auto-découverte MQTT (voir
[Auto-découverte MQTT](mqtt/topics.md#auto-découverte-mqtt)). Elle est rattachée à
l'appareil ESPSomfy-RTS et porte le nom donné dans l'interface, ou *« Telecommande
&lt;adresse&gt; »* à défaut. Chaque appui lui apporte un événement avec les mêmes `event_type`
et `rssi` que ci-dessus.

Pour déclencher une automatisation sur une touche précise, réagissez au changement d'état de
l'entité et filtrez sur `event_type` :

```yaml
triggers:
  - trigger: state
    entity_id: event.bureau
    not_to: unavailable
conditions:
  - condition: template
    value_template: "{{ trigger.to_state.attributes.event_type == 'up' }}"
actions:
  - action: scene.turn_on
    target:
      entity_id: scene.bureau_travail
```

!!! tip "Astuce"

    Le filtrage par `event_type` plutôt qu'un déclencheur `to: up` sur l'attribut est
    voulu : deux appuis successifs sur la même touche laissent l'attribut inchangé, alors
    que l'état de l'entité, lui, change à chaque événement.

La fiche de découverte est publiée sous
`<découverte>/event/<identifiant de l'appareil>_l<adresse>/config`. L'identifiant de l'appareil fait
partie de ce sujet : si deux appareils entendent la même télécommande, chacun publie sa propre
entité sans écraser celle de l'autre. Une télécommande retirée pendant que MQTT était
déconnecté voit son entité effacée à la connexion suivante.
