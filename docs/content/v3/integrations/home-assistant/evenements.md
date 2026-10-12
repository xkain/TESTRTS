# Événements

L'intégration publie un événement sur le bus de Home Assistant à **chaque commande RTS
observée**, y compris celles émises par une télécommande physique ou depuis l'interface
web d'ESPSomfy-RTS.

C'est le moyen de réagir à ce qui se passe **en dehors** de Home Assistant : quelqu'un
appuie sur la télécommande du salon, et une automatisation peut enchaîner sur autre
chose.

Type d'événement : **`espsomfy-rts_event`**

!!! warning "Ce nom est fixe"
    Il ne contient ni le nom donné à l'appareil, ni le domaine de l'intégration : quel
    que soit le matériel, le type à écouter est littéralement `espsomfy-rts_event`, avec
    un tiret entre `espsomfy` et `rts`, et un tiret bas devant `event`.

## Charge utile

| Champ | Contenu |
|---|---|
| `entity_id` | l'entité `cover` concernée, par exemple `cover.volet_salon` |
| `event_key` | toujours `shadeCommand` |
| `name` | nom de l'équipement **tel qu'il est configuré dans ESPSomfy-RTS**, par exemple `Volet salon` — ce n'est pas l'`entity_id` |
| `command` | la commande RTS, voir l'orthographe exacte plus bas |
| `source` | origine de la commande, voir ci-dessous |
| `remote_address` | adresse de la télécommande **virtuelle** de l'équipement, celle qu'ESPSomfy-RTS utilise pour émettre. Constante pour un équipement donné |
| `source_address` | adresse de l'émetteur **réel** de la trame. Quand `source` vaut `remote`, c'est l'adresse de la télécommande physique qui a été actionnée |
| `timestamp` | horodatage Unix |

### Valeurs de `source`

| Valeur | Signification |
|---|---|
| `internal` | commande émise par ESPSomfy-RTS lui-même : Home Assistant, interface web, MQTT, planificateur |
| `remote` | trame captée en radio, émise par une télécommande physique appairée |
| `group` | commande reçue par l'équipement au titre d'un groupe dont il fait partie |

C'est le champ qui permet de distinguer « j'ai fermé le volet depuis Home Assistant » de
« quelqu'un a fermé le volet depuis la télécommande du salon ». Filtrer sur
`source: remote` évite les boucles d'automatisation.

### Orthographe de `command`

Attention : les commandes **reçues** dans un événement ne s'écrivent pas toujours comme
les commandes **envoyées** par [`send_command`](services.md#commandes-acceptées). Les
commandes composées portent un séparateur.

| Envoyé à `send_command` | Reçu dans `command` |
|---|---|
| `Up` | `Up` |
| `Down` | `Down` |
| `My` | `My` |
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

En cas de doute, observez le bus plutôt que de deviner — voir
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

Le filtrage par `event_data` est un filtrage exact. Pour cibler un équipement précis,
ajoutez une condition sur `entity_id` plutôt qu'un filtre supplémentaire — c'est plus
lisible, et cela reste vrai si l'équipement est renommé dans ESPSomfy-RTS :

```yaml
conditions:
  - condition: template
    value_template: "{{ trigger.event.data.entity_id == 'cover.salon' }}"
```

### Deux erreurs classiques

**Écrire le nom de son appareil dans `event_type`.** Le type est fixe,
`espsomfy-rts_event`, et ne varie jamais. Une automatisation qui écoute
`mon_appareil_event` ne se déclenchera jamais, sans le moindre message d'erreur.

**Confondre `name` et `entity_id`.** `name` vaut le nom configuré dans ESPSomfy-RTS —
`Volet Laurent` — tandis que `entity_id` vaut `cover.volet_laurent`. Comparer `name` à un
`entity_id` donne une condition toujours fausse, et là non plus rien ne le signale :
l'automatisation se déclenche mais n'agit pas.

Pour cibler un équipement, utilisez `entity_id` :

```jinja
value_template: "{{ trigger.event.data.entity_id == 'cover.volet_laurent' }}"
```

ou son nom, exactement tel qu'il est écrit dans ESPSomfy-RTS :

```jinja
value_template: "{{ trigger.event.data.name == 'Volet Laurent' }}"
```

## Identifier la télécommande physique

Quand `source` vaut `remote`, **`source_address` contient l'adresse de la télécommande
qui a émis la trame**. C'est ce qui permet de distinguer deux télécommandes agissant sur
le même équipement, sans rien ajouter à l'intégration.

Ne confondez pas les deux champs d'adresse :

- `remote_address` est l'adresse de la télécommande **virtuelle** de l'équipement, celle
  qu'ESPSomfy-RTS utilise quand c'est lui qui émet. Elle ne change jamais pour un
  équipement donné, elle ne dit rien de l'origine de la commande.
- `source_address` est l'adresse de **l'émetteur réel**. C'est celle-là qui identifie la
  télécommande.

### Relever l'adresse d'une télécommande

Dans **Outils de développement → Événements**, écoutez `espsomfy-rts_event` et actionnez la
télécommande à identifier. Notez la valeur de `source_address` dans l'événement reçu.

Les adresses des télécommandes appairées à un équipement sont aussi listées dans
l'interface web d'ESPSomfy-RTS, dans les télécommandes liées de l'équipement.

!!! note
    En RTS, chaque **canal** d'une télécommande multicanaux porte sa propre adresse : une
    Telis 4 à cinq canaux se présente donc comme cinq adresses distinctes. Vérifiez-le en
    observant le bus canal par canal.

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

Le filtre par `event_data` compare des valeurs exactes : `source_address` est un entier,
écrivez-le sans guillemets.

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
    value_template: "{{ trigger.event.data.entity_id == 'cover.volet_laurent' }}"
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

### Le cas des groupes

Quand la commande vient d'un groupe, `source` vaut `group` et `source_address` porte
l'adresse **du groupe**, pas celle d'une télécommande. Un filtre sur `source: remote`
écarte déjà ce cas.

---

## Plusieurs appareils ESPSomfy-RTS

Si vous avez deux appareils ou plus, ils publient tous sur le **même** type d'événement,
`espsomfy-rts_event`. Et la charge utile ne contient **aucun champ identifiant l'appareil
émetteur** : ni son nom, ni son identifiant de serveur.

Ce qui reste fiable, et ce qui ne l'est plus :

| Champ | Avec plusieurs appareils |
|---|---|
| `entity_id` | **fiable** — Home Assistant garantit son unicité sur toute l'instance |
| `name` | **pas fiable** — deux équipements peuvent porter le même nom sur deux appareils |
| `remote_address` | distinct en pratique — la plage d'adresses dérive de l'adresse MAC de chaque ESP32 — mais opaque à lire |

Filtrez donc toujours sur `entity_id`. Pour plusieurs équipements à la fois :

```jinja
conditions:
  - condition: template
    value_template: >
      {{ trigger.event.data.entity_id in
         ['cover.volet_laurent', 'cover.volet_salon', 'cover.volet_cuisine'] }}
```

!!! tip "Donnez des noms distincts à vos appareils"
    Si deux appareils portent le même nom, Home Assistant suffixe les entités du second
    en `_2` — et lequel des deux hérite du suffixe dépend de l'ordre de découverte, qui
    peut changer d'un redémarrage à l'autre si une intégration est supprimée puis
    réajoutée. Des noms distincts évitent ce piège dès le départ.

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

Un message de notification complet, par exemple :

```yaml
actions:
  - action: notify.persistent_notification
    data:
      message: >
        {{ trigger.event.data.name }} a reçu la commande
        {{ trigger.event.data.command }}
        ({{ 'télécommande' if trigger.event.data.source == 'remote' else 'Home Assistant' }})
        à {{ trigger.event.data.timestamp | timestamp_custom('%H:%M:%S') }}
```

## Observer le bus

Pour découvrir les événements réellement émis par votre installation :
**Outils de développement → Événements**, puis écoutez le type `espsomfy-rts_event` et
actionnez une télécommande.

C'est la façon la plus rapide de relever les `remote_address` et `source_address` de vos
télécommandes physiques, pour distinguer laquelle a servi.
