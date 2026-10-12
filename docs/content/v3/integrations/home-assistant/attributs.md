# Attributs en template

Les entités `cover` des équipements portent des attributs supplémentaires, utilisables
dans les conditions, les templates et les cartes du tableau de bord.

## Liste des attributs

| Attribut | Contenu |
|---|---|
| `current_position` | position en convention Home Assistant : 0 = fermé, 100 = ouvert |
| `current_tilt_position` | inclinaison, même convention |
| `target` | position visée par le mouvement en cours, **en convention ESPSomfy-RTS** |
| `my_pos` | position favorite MY, **en convention ESPSomfy-RTS**. `-1` si aucune n'est enregistrée |
| `tilt_target` | inclinaison visée |
| `my_tilt_pos` | inclinaison favorite MY. `-1` si aucune |
| `remote_address` | adresse de la télécommande virtuelle de l'équipement |
| `last_cmd` | dernière commande RTS observée sur cet équipement |
| `cmd_source` | origine de cette commande : `internal`, `remote` ou `group` |
| `cmd_address` | adresse de l'émetteur de la commande |
| `cmd_fired` | horodatage Unix de la commande |

## Lire une valeur

La syntaxe est toujours la même : `state_attr('<entité>', '<attribut>')`.

```jinja
{{ state_attr('cover.salon', 'my_pos') }}
{{ state_attr('cover.salon', 'current_position') }}
{{ state_attr('cover.veranda', 'current_tilt_position') }}
{{ state_attr('cover.salon', 'last_cmd') }}
{{ state_attr('cover.salon', 'cmd_source') }}
```

L'état de l'entité, lui, se lit avec `states()` — il vaut `open`, `closed`, `opening` ou
`closing` :

```jinja
{{ states('cover.salon') }}
```

### Position MY ramenée à l'échelle Home Assistant

`my_pos` est livré dans la convention ESPSomfy-RTS. Pour un volet classique :

```jinja
{% set my = state_attr('cover.salon', 'my_pos') %}
{{ 100 - my if my is not none and my >= 0 else none }}
```

### Savoir si une position MY existe

```jinja
{{ state_attr('cover.salon', 'my_pos') | default(-1) | int >= 0 }}
```

### Savoir si l'équipement est à sa position MY

```jinja
{% set my = state_attr('cover.salon', 'my_pos') | default(-1) | int %}
{% set pos = state_attr('cover.salon', 'current_position') | default(-1) | int %}
{{ my >= 0 and pos >= 0 and (100 - my) == pos }}
```

### Horodatage de la dernière commande, en date lisible

`cmd_fired` est un horodatage Unix :

```jinja
{{ state_attr('cover.salon', 'cmd_fired') | timestamp_custom('%d/%m/%Y %H:%M:%S') }}
```

### Lister les équipements sans position MY

```jinja
{{ states.cover
   | selectattr('attributes.my_pos', 'defined')
   | selectattr('attributes.my_pos', 'eq', -1)
   | map(attribute='name') | list | join(', ') }}
```

### En faire un capteur

Pour exploiter une de ces valeurs dans un graphique, une carte ou l'historique, elle doit
devenir une entité. Dans `configuration.yaml` :

```yaml
template:
  - sensor:
      - name: "Position MY du salon"
        unique_id: my_pos_salon
        unit_of_measurement: "%"
        state: >
          {% set my = state_attr('cover.salon', 'my_pos') %}
          {{ 100 - my if my is not none and my >= 0 else none }}
        availability: >
          {{ state_attr('cover.salon', 'my_pos') | default(-1) | int >= 0 }}
```

Le bloc `availability` évite que le capteur affiche une valeur absurde quand aucune
position favorite n'est enregistrée, ou pendant la fenêtre de démarrage décrite plus bas.

## Convention de position

!!! danger "C'est le piège principal de cette page"
    `target`, `my_pos`, `tilt_target` et `my_tilt_pos` sont livrés **dans le repère
    d'ESPSomfy-RTS**, où `0 = ouvert` et `100 = fermé` — l'inverse de `current_position`,
    qui suit la convention de Home Assistant.

    Pour un **store banne**, ou pour un équipement dont l'option **« position inversée »**
    est active dans ESPSomfy-RTS, la valeur est déjà dans le bon sens et la soustraction ne
    s'applique pas.

## La valeur `-1`

`my_pos` et `my_tilt_pos` valent `-1` quand aucune position favorite n'est enregistrée
dans le moteur. Ce n'est pas `unknown` ni `None` : il faut filtrer explicitement.

```jinja
{{ state_attr('cover.salon', 'my_pos') | default(-1) | int == -1 }}
```

## Disponibilité des attributs

Ces attributs n'existent pas au moment exact où l'entité est créée : ils apparaissent à
la première trame d'état reçue.

ESPSomfy-RTS émet l'état complet de tous les équipements dès qu'un client se connecte,
donc l'attente se compte en secondes après un redémarrage de Home Assistant — mais un
template exécuté dans cette fenêtre reçoit `None`. Prévoyez toujours une valeur de repli.

## Attributs de commande

`last_cmd`, `cmd_source`, `cmd_address` et `cmd_fired` décrivent la **dernière commande
RTS observée** sur l'équipement, quelle qu'en soit l'origine — Home Assistant, interface
web d'ESPSomfy-RTS, MQTT, planificateur, ou télécommande physique captée en radio.

Ils sont pratiques pour une carte d'état, mais pour **réagir** à une commande, préférez le
bus d'événements : il porte les mêmes informations et se déclenche à coup sûr, y compris
quand deux commandes identiques se suivent. Voir [Événements](evenements.md).
