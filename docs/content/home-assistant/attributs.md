# Attributs en template

Les entités de l'intégration **ESPSomfy-RTS Enhanced** portent des attributs en plus de leur
état. Ils se lisent dans les conditions, les templates et les cartes du tableau de bord, avec
`state_attr('<entité>', '<attribut>')`.

![Attributs d'une entité cover d'équipement](home-assistant/img/ha-attributs){ .on-glb }

## Entité `cover` d'un équipement { #cover }

| Attribut | Contenu | Présent |
| :--- | :--- | :--- |
| `current_position` | position, 0 = fermé, 100 = ouvert | toujours |
| `current_tilt_position` | inclinaison des lames, 0 = fermé, 100 = ouvert | équipement avec inclinaison |
| `target` | position visée par le mouvement en cours | dès le premier état reçu |
| `my_pos` | position favorite (My) ; `None` si aucune n'est enregistrée | dès le premier état reçu |
| `tilt_target` | inclinaison visée | équipement avec inclinaison |
| `my_tilt_pos` | inclinaison favorite ; `None` si aucune | équipement avec inclinaison |
| `remote_address` | adresse radio de l'équipement sur l'appareil | dès le premier état reçu |
| `last_cmd` | dernière commande RTS vue pour cet équipement | dès la première commande |
| `cmd_source` | origine de cette commande, voir [plus bas](#commandes) | dès la première commande |
| `cmd_address` | adresse radio de l'émetteur de cette commande | dès la première commande |
| `cmd_fired` | moment où Home Assistant a reçu cette commande, en horodatage Unix | dès la première commande |

!!! tip "Une seule convention de position"

    `target`, `my_pos`, `tilt_target` et `my_tilt_pos` suivent la même convention que
    `current_position` : **0 = fermé, 100 = ouvert**. C'est vrai aussi pour un store banne et pour
    un équipement à **Position inversée** : l'intégration fait la conversion. Vous pouvez donc
    comparer `my_pos` et `current_position` directement, sans calcul.

### Quand les attributs apparaissent { #apparition }

Au démarrage de l'intégration, une entité n'a que ses attributs standard. Les autres arrivent :

* `target`, `my_pos` et `remote_address` avec le premier état de l'équipement envoyé par
    l'appareil. Il l'envoie dès que la liaison s'établit : l'attente se compte en secondes ;
* `tilt_target` et `my_tilt_pos` de même, mais seulement sur un équipement qui sait incliner ses
    lames ;
* `last_cmd`, `cmd_source`, `cmd_address` et `cmd_fired` à la **première commande** vue pour cet
    équipement. Ils ne survivent pas à un redémarrage de Home Assistant.

Un template exécuté avant leur arrivée reçoit `None` : prévoyez toujours ce cas.

### Les attributs de commande { #commandes }

`last_cmd`, `cmd_source`, `cmd_address` et `cmd_fired` décrivent la **dernière commande RTS**
vue pour l'équipement, quelle qu'en soit l'origine.

| `cmd_source` | Origine de la commande |
| :--- | :--- |
| `internal` | l'appareil lui-même : Home Assistant, son interface web, MQTT, un planning… |
| `remote` | une télécommande physique, captée par radio |
| `group` | une commande adressée à un groupe dont l'équipement fait partie |

`last_cmd` prend l'une de ces valeurs : `Up`, `Down`, `My`, `Stop`, `My+Up`, `My+Down`,
`Up+Down`, `My+Up+Down`, `Prog`, `Sun Flag`, `Flag`, `Step Up`, `Step Down`, `Toggle`,
`Favorite`, `Sensor`.

!!! note "Pour réagir à une commande"

    Ces attributs conviennent à une carte d'état. Pour **réagir** à une commande, préférez
    l'événement `espsomfy-rts_event` : il se déclenche à chaque commande, y compris quand deux
    commandes identiques se suivent. Voir [Événements](evenements.md).

## Entité `cover` d'un groupe { #groupe }

| Attribut | Contenu |
| :--- | :--- |
| `current_position` | moyenne des positions de ses membres |
| `current_tilt_position` | moyenne des inclinaisons de ses membres |
| `entity_id` | liste des entités `cover` de ses membres |

Un groupe n'a ni `my_pos`, ni attributs de commande.

## Entité `event` d'une télécommande écoutée { #event }

| Attribut | Contenu |
| :--- | :--- |
| `event_type` | touche ou combinaison appuyée, voir le tableau ci-dessous |
| `rssi` | niveau du signal reçu pour cet appui, en dBm |
| `address` | adresse radio de la télécommande |

L'état de l'entité est l'heure du dernier appui.

| `event_type` | Libellé affiché |
| :--- | :--- |
| `up` | Montée |
| `down` | Descente |
| `my` | My |
| `stop` | Stop |
| `my_up` | My + Montée |
| `my_down` | My + Descente |
| `up_down` | Montée + Descente |
| `my_up_down` | My + Montée + Descente |
| `prog` | Prog |
| `sun_flag` | Soleil activé |
| `flag` | Soleil désactivé |
| `step_up` | Pas vers le haut |
| `step_down` | Pas vers le bas |
| `toggle` | Bascule |
| `favorite` | Favori |

L'usage de ces entités est décrit dans [Télécommandes écoutées](telecommandes-ecoutees.md).

```jinja
{{ state_attr('event.telis_cuisine', 'event_type') }}
{{ state_attr('event.telis_cuisine', 'rssi') }}
```

## Exemples { #exemples }

L'état d'une entité `cover` se lit avec `states()`. Il vaut `open`, `closed`, `opening` ou
`closing` :

```jinja
{{ states('cover.salon') }}
{{ state_attr('cover.salon', 'current_position') }}
{{ state_attr('cover.salon', 'my_pos') }}
{{ state_attr('cover.salon', 'last_cmd') }}
```

### Savoir si une position favorite existe

```jinja
{{ state_attr('cover.salon', 'my_pos') is not none }}
```

### Savoir si l'équipement est à sa position favorite

```jinja
{% set my = state_attr('cover.salon', 'my_pos') %}
{% set pos = state_attr('cover.salon', 'current_position') %}
{{ my is not none and pos is not none and pos == my }}
```

### Savoir si l'équipement a été commandé à la télécommande

```jinja
{{ state_attr('cover.salon', 'cmd_source') == 'remote' }}
```

### Date de la dernière commande, lisible

```jinja
{% set t = state_attr('cover.salon', 'cmd_fired') %}
{{ t | timestamp_custom('%d/%m/%Y %H:%M:%S') if t else 'aucune depuis le démarrage' }}
```

### Lister les équipements sans position favorite

```jinja
{{ states.cover
   | selectattr('attributes.my_pos', 'defined')
   | selectattr('attributes.my_pos', 'none')
   | map(attribute='name') | list | join(', ') }}
```

Le filtre `defined` écarte les groupes et les entités `cover` d'autres intégrations, qui n'ont
pas d'attribut `my_pos`.

### En faire un capteur

Pour tracer une de ces valeurs dans un graphique ou l'historique, elle doit devenir une entité.
Dans `configuration.yaml` :

```yaml
template:
  - sensor:
      - name: "Position favorite du salon"
        unique_id: my_pos_salon
        unit_of_measurement: "%"
        state: "{{ state_attr('cover.salon', 'my_pos') }}"
        availability: "{{ state_attr('cover.salon', 'my_pos') is not none }}"
```

Le bloc `availability` rend le capteur indisponible plutôt que faux quand aucune position
favorite n'est enregistrée, ou avant le premier état reçu.
