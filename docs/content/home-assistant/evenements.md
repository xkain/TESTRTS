# Événements

ESPSomfy-RTS Enhanced publie un événement sur le bus de Home Assistant à **chaque commande
reçue par un équipement**, y compris celles émises par une télécommande physique, par
l'interface web d'ESPSomfy-RTS ou par un planning de l'appareil.

C'est le moyen de réagir à ce qui se passe **en dehors** de Home Assistant : quelqu'un
appuie sur la télécommande du salon, et une automatisation enchaîne sur autre chose.

Type d'événement : **`espsomfy-rts_event`**

!!! warning "Ce nom est fixe"

    Il ne contient ni le nom de l'appareil, ni le domaine de l'intégration : quel que soit
    le matériel, le type à écouter est littéralement `espsomfy-rts_event`, avec un tiret
    entre `espsomfy` et `rts`, et un tiret bas devant `event`.

!!! note "Télécommandes écoutées"

    Les télécommandes écoutées par l'appareil ont leurs propres entités `event`,
    distinctes de cet événement de bus. Voir
    [Télécommandes écoutées](telecommandes-ecoutees.md).

## Qui publie l'événement

| Situation | Événement publié |
|---|---|
| commande reçue par un équipement | oui, une fois par commande |
| commande envoyée à un groupe | oui, **une fois par membre**, au nom de l'équipement membre ; jamais au nom du groupe |
| entité `cover` de l'équipement désactivée dans Home Assistant | non |
| contact sec | non (ce n'est pas une entité `cover`) |

## Charge utile

| Champ | Contenu |
|---|---|
| `entity_id` | l'entité `cover` de l'équipement, par exemple `cover.salon` |
| `event_key` | toujours `shadeCommand` |
| `name` | nom de l'équipement **tel qu'il est configuré dans ESPSomfy-RTS**, par exemple `Salon` ; ce n'est pas l'`entity_id` |
| `command` | la commande, dans l'orthographe du firmware (voir plus bas) |
| `source` | origine de la commande (voir ci-dessous) |
| `remote_address` | adresse de la télécommande **virtuelle** de l'équipement, celle qu'ESPSomfy-RTS utilise pour émettre ; constante pour un équipement donné |
| `source_address` | adresse de l'émetteur **réel** de la trame |
| `timestamp` | heure de réception par Home Assistant, en secondes Unix (nombre décimal) |

### Valeurs de `source`

| Valeur | Signification | `source_address` contient |
|---|---|---|
| `internal` | commande émise par l'appareil lui-même : Home Assistant, interface web, MQTT, planning | l'adresse de l'équipement |
| `remote` | trame captée en radio, émise par une télécommande physique | l'adresse de la télécommande |
| `group` | commande reçue au titre d'un groupe dont l'équipement fait partie | l'adresse du groupe |

C'est ce champ qui distingue « j'ai fermé l'équipement depuis Home Assistant » de
« quelqu'un l'a fermé depuis la télécommande ». Filtrer sur `source: remote` évite aussi
qu'une automatisation se redéclenche sur ses propres ordres.

### Orthographe de `command`

Les commandes **reçues** dans l'événement ne s'écrivent pas toujours comme celles
**envoyées** à [`send_command`](services.md#send_command) : les commandes composées
portent un séparateur.

| Envoyé à `send_command` | Reçu dans `command` |
|---|---|
| `Up` | `Up` |
| `Down` | `Down` |
| `My` | `My` |
| `Stop` | `Stop` |
| `Prog` | `Prog` |
| `Toggle` | `Toggle` |
| `Flag` | `Flag` |
| `Favorite` | `Favorite` |
| `MyUp` | `My+Up` |
| `MyDown` | `My+Down` |
| `MyUpDown` | `My+Up+Down` |
| `UpDown` | `Up+Down` |
| `SunFlag` | `Sun Flag` |
| `StepUp` | `Step Up` |
| `StepDown` | `Step Down` |

En cas de doute, observez le bus plutôt que de deviner, voir
[Observer le bus](#observer-le-bus).

---

## Déclencheur

```yaml
triggers:
  - trigger: event
    event_type: espsomfy-rts_event
    event_data:
      source: remote
      command: My
```

Le filtrage par `event_data` compare des valeurs exactes. Pour cibler un équipement,
ajoutez une condition sur `entity_id` : elle reste vraie si l'équipement est renommé dans
ESPSomfy-RTS.

```yaml
conditions:
  - condition: template
    value_template: "{{ trigger.event.data.entity_id == 'cover.salon' }}"
```

### Deux erreurs classiques

**Écrire le nom de son appareil dans `event_type`.** Le type ne varie jamais. Une
automatisation qui écoute `mon_appareil_event` ne se déclenche jamais, sans le moindre
message d'erreur.

**Confondre `name` et `entity_id`.** `name` vaut le nom configuré dans ESPSomfy-RTS,
`Chambre Laurent`, tandis que `entity_id` vaut `cover.chambre_laurent`. Comparer `name` à
un `entity_id` donne une condition toujours fausse : l'automatisation se déclenche mais
n'agit pas, et rien ne le signale.

---

## Identifier la télécommande physique

Quand `source` vaut `remote`, **`source_address` contient l'adresse de la télécommande qui
a émis la trame**. C'est ce qui distingue deux télécommandes agissant sur le même
équipement.

| Champ | Ce qu'il identifie |
|---|---|
| `remote_address` | la télécommande **virtuelle** de l'équipement ; ne dit rien de l'origine de la commande |
| `source_address` | **l'émetteur réel** ; c'est lui qui identifie la télécommande |

### Relever l'adresse d'une télécommande

Dans **Outils de développement → Événements**, écoutez `espsomfy-rts_event` et actionnez
la télécommande à identifier : notez la valeur de `source_address`. Les adresses des
télécommandes liées à un équipement sont aussi listées dans l'interface web
d'ESPSomfy-RTS, dans la fiche de l'équipement.

!!! note "Télécommandes multicanaux"

    En RTS, chaque **canal** d'une télécommande multicanaux porte sa propre adresse. Une
    télécommande à cinq canaux se présente donc comme cinq adresses distinctes : relevez-les
    canal par canal.

### Réagir à une télécommande précise

```yaml
alias: La télécommande du couloir éteint la lampe du bureau
triggers:
  - trigger: event
    event_type: espsomfy-rts_event
    event_data:
      source: remote
      command: My
      source_address: 12345678
actions:
  - action: light.turn_off
    target:
      entity_id: light.bureau
```

`source_address` est un entier : écrivez-le sans guillemets.

### Aiguiller selon la télécommande

```yaml
alias: Les deux télécommandes du salon ne font pas la même chose
triggers:
  - trigger: event
    event_type: espsomfy-rts_event
    event_data:
      source: remote
      command: My
conditions:
  - condition: template
    value_template: "{{ trigger.event.data.entity_id == 'cover.salon' }}"
actions:
  - choose:
      - conditions:
          - condition: template
            value_template: "{{ trigger.event.data.source_address == 12345678 }}"
        sequence:
          - action: light.turn_off
            target:
              entity_id: light.bureau
      - conditions:
          - condition: template
            value_template: "{{ trigger.event.data.source_address == 87654321 }}"
        sequence:
          - action: scene.turn_on
            target:
              entity_id: scene.soiree
```

---

## Plusieurs appareils ESPSomfy-RTS

Tous les appareils publient sur le **même** type d'événement, et la charge utile ne
contient **aucun champ identifiant l'appareil** : ni son nom, ni son identifiant.

| Champ | Avec plusieurs appareils |
|---|---|
| `entity_id` | **fiable** : Home Assistant garantit son unicité sur toute l'instance |
| `name` | **pas fiable** : deux équipements peuvent porter le même nom sur deux appareils |
| `remote_address` | distinct en pratique, mais opaque à lire |

Filtrez donc toujours sur `entity_id`. Pour plusieurs équipements à la fois :

```yaml
conditions:
  - condition: template
    value_template: >
      {{ trigger.event.data.entity_id in
         ['cover.salon', 'cover.cuisine', 'cover.chambre_laurent'] }}
```

!!! tip "Donnez des noms distincts à vos appareils"

    Si deux appareils portent le même nom, Home Assistant suffixe les entités du second en
    `_2`, et lequel hérite du suffixe dépend de l'ordre de découverte. Des noms distincts
    évitent ce piège dès le départ.

---

## Lire les valeurs de l'événement

Dans les actions d'une automatisation déclenchée par cet événement, tous les champs sont
accessibles sous `trigger.event.data` :

```jinja
{{ trigger.event.data.command }}
{{ trigger.event.data.name }}
{{ trigger.event.data.source }}
{{ trigger.event.data.entity_id }}
{{ trigger.event.data.source_address }}
{{ trigger.event.data.timestamp | timestamp_custom('%H:%M:%S') }}
```

Une notification complète, par exemple :

```yaml
actions:
  - action: persistent_notification.create
    data:
      message: >
        {{ trigger.event.data.name }} a reçu la commande
        {{ trigger.event.data.command }}
        ({{ 'télécommande' if trigger.event.data.source == 'remote' else 'appareil' }})
        à {{ trigger.event.data.timestamp | timestamp_custom('%H:%M:%S') }}
```

## Observer le bus

Pour découvrir les événements réellement émis par votre installation : **Outils de
développement → Événements**, écoutez le type `espsomfy-rts_event` et actionnez une
télécommande. C'est la façon la plus rapide de relever les adresses de vos télécommandes
et l'orthographe exacte des commandes.
