# Télécommandes écoutées

Une télécommande écoutée n'est liée à **aucun équipement** du boîtier : l'ESPSomfy-RTS se
contente de capter ses appuis, de les afficher dans l'interface et de les publier sur MQTT.
Une télécommande Somfy qui traîne dans un tiroir devient ainsi un **bouton d'automatisation** :
allumer une scène, lancer une routine, piloter autre chose qu'un volet.

Cette fonction ne dépend d'aucune plateforme en particulier : les appuis sont publiés sur des
sujets MQTT que n'importe quel système domotique peut lire (Home Assistant, Jeedom, Node-RED…).
[Home Assistant](#avec-home-assistant) n'est que le cas où l'entité se crée toute seule.

## Caractéristiques techniques

* **Capacité** : jusqu'à **14 télécommandes écoutées** par appareil.
* **Un appui = un événement** : une télécommande répète la même trame tant que le bouton est
    tenu. Le boîtier ne retient que la première, en se fiant au code tournant, et non au temps
    écoulé.
* **Capteurs exclus** : les trames des capteurs soleil/vent ne sont pas transmises.
* **Mémorisation** : seuls l'adresse et le nom sont enregistrés. Ils font partie de la
    [sauvegarde](../firmware/anatomie-sauvegarde.md) et se restaurent avec l'option
    **Restaurer télécommandes écoutées**.

!!! info "Pour agir sur un appui, il faut MQTT"

    Sans MQTT, l'appareil affiche bien les appuis dans l'interface, mais ne peut rien
    déclencher d'autre. Le client MQTT doit être activé et connecté (voir
    [Paramètres MQTT](../reseau/parametres-mqtt.md)). L'option **Publier découverte** n'est
    nécessaire que si vous voulez que Home Assistant crée l'entité de lui-même.

!!! warning "Attention"

    **L'écoute ne bloque pas la trame.** Si la télécommande pilote aussi un moteur, parce
    qu'elle y est appairée, ou un équipement du boîtier, parce qu'elle y est liée, un appui le
    fera bouger comme avant. L'ESPSomfy-RTS signale ce second cas à la capture et sur la carte
    de la télécommande : *« Cette télécommande commande aussi « … » : un appui le fera
    bouger. »*

## Ajouter une télécommande

L'onglet **Télécommandes** se trouve dans la section **Somfy**.

1. **Lancer l'écoute** : cliquez sur **Capturer une télécommande**, en bas de la tuile
    **Télécommandes**. La fenêtre **Télécommande écoutée** s'ouvre et l'écoute démarre
    aussitôt, sur la carte **En écoute…** bordée de pointillés.
2. **Capturer** : prenez la télécommande, ou sélectionnez la zone voulue sur une
    télécommande multi-zones, et appuyez sur n'importe quelle touche.
3. **Nommer** : la carte passe au vert, **Télécommande reconnue**, avec le protocole, le
    nombre de bits, l'adresse et la force du signal reçu. Donnez-lui un **nom** (20
    caractères au plus) : il sert d'étiquette dans l'interface, et d'intitulé à l'entité
    sous Home Assistant.
4. **Enregistrer** : cliquez sur **Enregistrer**. La fenêtre se ferme et la télécommande
    rejoint la liste.

La fenêtre prévoit deux autres cas :

| Cas | Ce qu'affiche la fenêtre | Que faire |
|---|---|---|
| La télécommande est **déjà écoutée** | une carte orange, *« Cette télécommande est déjà écoutée sous le nom « … ». »* | **Écouter une autre télécommande** relance l'écoute |
| **Aucun signal** au bout de 30 secondes | une carte orange, *« Aucune télécommande entendue »* | vérifiez la pile ou rapprochez-vous du boîtier, puis **Réessayer** |

L'enregistrement est refusé, avec un message d'erreur, quand :

| Refus | Raison |
|---|---|
| la liste est **pleine** | les 14 emplacements sont occupés |
| la télécommande est un **répéteur** | une même télécommande ne peut pas être à la fois répétée et écoutée (voir [Répéteurs](repeteurs.md)) |
| l'adresse est celle d'un **équipement ou d'un groupe** du boîtier | c'est une adresse que le boîtier émet lui-même, pas une télécommande physique |

## La page Télécommandes

L'onglet suit la même présentation en tuiles que les autres pages.

### La tuile Activité

| Indicateur | Signification |
|---|---|
| **Écoutées** | le nombre de télécommandes écoutées, sur le maximum de 14 |
| **Appuis captés** | le nombre d'appuis reçus **depuis l'ouverture de la page** ; il repart de zéro à chaque rechargement |
| **Dernier appui** | la dernière télécommande appuyée, avec sa touche et l'heure |

### La tuile Télécommandes

Elle liste une carte par télécommande, avec un compteur `n / 14` en titre. Chaque carte
affiche :

* le **nom** choisi, ou à défaut l'adresse ;
* l'**adresse radio** de la télécommande ;
* la ligne **Signal**, en dBm, colorée selon sa qualité ;
* à droite, la **dernière touche** appuyée et son heure, ou *« Aucun appui depuis le
    démarrage »* ;
* l'avertissement orange quand la télécommande commande aussi un équipement du boîtier ;
* une icône **poubelle**, qui retire la télécommande après confirmation (son entité disparaît
    alors de Home Assistant, si elle y avait été créée).

La carte de la dernière télécommande appuyée est entourée de la couleur d'accent ; une
télécommande jamais entendue depuis le démarrage du boîtier est grisée. **Un clic sur une
carte** ouvre la fenêtre de renommage : le nouveau nom est aussitôt republié vers Home
Assistant.

!!! note "Note"

    Le dernier appui et le signal sont tenus en mémoire vive par le boîtier : ils sont
    affichés dès l'ouverture de la page, mais repartent de zéro à chaque redémarrage.

## Exploiter les appuis

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
filtrer sur `event_type`. Le sujet racine est celui réglé dans les
[Paramètres MQTT](../reseau/parametres-mqtt.md#topics), et l'adresse est celle affichée sur la
carte de la télécommande. Pour le détail de ce que publie l'appareil par ailleurs, voir
[MQTT](../integrations/mqtt.md).

### Avec Home Assistant

Quand **Publier découverte** est activé, chaque télécommande écoutée devient en plus une entité
**`event`** (classe *button*), créée par l'auto-découverte MQTT (voir
[Auto-découverte MQTT](../integrations/mqtt.md#auto-découverte-mqtt)). Elle est rattachée à
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
`<découverte>/event/<identifiant du boîtier>_l<adresse>/config`. L'identifiant du boîtier fait
partie de ce sujet : si deux boîtiers entendent la même télécommande, chacun publie sa propre
entité sans écraser celle de l'autre. Une télécommande retirée pendant que MQTT était
déconnecté voit son entité effacée à la connexion suivante.
