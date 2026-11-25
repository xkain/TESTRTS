# Recettes d'automatisation

_Exemples d'automatisation à adapter aux identifiants de vos entités._

---

## Rejoindre la position favorite MY à heure fixe

`My` agit comme un arrêt si l'équipement est en train de bouger : la condition évite ce
cas.

```yaml
alias: Position MY du salon le matin
triggers:
  - trigger: time
    at: "08:30:00"
conditions:
  - condition: template
    value_template: "{{ states('cover.salon') not in ['opening', 'closing'] }}"
actions:
  - action: espsomfy_rts_enhanced.send_command
    target:
      entity_id: cover.salon
    data:
      command: My
```

---

## Protection vent depuis une station météo

```yaml
alias: Rentrer le store par grand vent
triggers:
  - trigger: numeric_state
    entity_id: sensor.vitesse_vent
    above: 35
actions:
  - action: espsomfy_rts_enhanced.set_windy
    target:
      entity_id: cover.banne_terrasse
    data:
      windy: true
mode: single
```

Et le retour au calme, temporisé pour éviter les allers-retours sur une rafale isolée :

```yaml
alias: Fin d'alerte vent
triggers:
  - trigger: numeric_state
    entity_id: sensor.vitesse_vent
    below: 20
    for: "00:20:00"
actions:
  - action: espsomfy_rts_enhanced.set_windy
    target:
      entity_id: cover.banne_terrasse
    data:
      windy: false
```

---

## Suivi solaire piloté par un capteur de luminosité

```yaml
alias: Suivi solaire terrasse
triggers:
  - trigger: numeric_state
    entity_id: sensor.luminosite_terrasse
    above: 40000
    for: "00:05:00"
    id: soleil
  - trigger: numeric_state
    entity_id: sensor.luminosite_terrasse
    below: 20000
    for: "00:15:00"
    id: ombre
actions:
  - choose:
      - conditions:
          - condition: trigger
            id: soleil
        sequence:
          - action: espsomfy_rts_enhanced.set_sunny
            target:
              entity_id: cover.banne_terrasse
            data:
              sunny: true
      - conditions:
          - condition: trigger
            id: ombre
        sequence:
          - action: espsomfy_rts_enhanced.set_sunny
            target:
              entity_id: cover.banne_terrasse
            data:
              sunny: false
```

Les temporisations `for` ne sont pas décoratives : sans elles, un nuage qui passe
déclenche un aller-retour complet du store.

---

## Réagir à une télécommande physique

ESPSomfy-RTS capte les trames émises par les télécommandes Somfy appairées. L'événement
permet d'enchaîner sur autre chose : un éclairage, une scène, une notification.

```yaml
alias: La télécommande du salon éteint aussi la lampe
triggers:
  - trigger: event
    event_type: espsomfy-rts_event
    event_data:
      source: remote
      command: Down
conditions:
  - condition: template
    value_template: "{{ trigger.event.data.entity_id == 'cover.salon' }}"
actions:
  - action: light.turn_off
    target:
      entity_id: light.lampadaire_salon
```

Le filtre `source: remote` est important : sans lui, une commande envoyée par Home
Assistant se déclencherait elle-même.

---

## Recaler la position après une manœuvre manuelle

```yaml
alias: Recaler le volet en butée haute
triggers:
  - trigger: event
    event_type: espsomfy-rts_event
    event_data:
      command: Up
      source: remote
actions:
  - delay: "00:01:00"
  - action: espsomfy_rts_enhanced.set_current_position
    target:
      entity_id: "{{ trigger.event.data.entity_id }}"
    data:
      position: 100
```

Le délai laisse le volet atteindre sa butée. Ce recalage ne déplace rien : il remet en
accord la position calculée par ESPSomfy-RTS et la position réelle.

---

## Réglage fin par paliers

```yaml
alias: Ajuster les lames de la véranda
triggers:
  - trigger: state
    entity_id: input_button.lames_plus_fermees
actions:
  - action: espsomfy_rts_enhanced.send_step_command
    target:
      entity_id: cover.veranda
    data:
      direction: Down
      step_size: 10
```

---

## Alerter quand aucune position MY n'est enregistrée

```yaml
alias: Contrôle des positions favorites
triggers:
  - trigger: time
    at: "12:00:00"
conditions:
  - condition: template
    value_template: >
      {{ state_attr('cover.salon', 'my_pos') | default(-1) | int == -1 }}
actions:
  - action: persistent_notification.create
    data:
      title: Position MY manquante
      message: Le volet du salon n'a pas de position favorite enregistrée.
```

---

## Fermer à moitié, seulement si le volet est plus ouvert que ça

Un exemple de lecture de valeur : la position actuelle sert de condition, et le service
n'est appelé que si le mouvement a un sens.

```yaml
alias: Mi-fermeture du salon en cas de forte chaleur
triggers:
  - trigger: numeric_state
    entity_id: sensor.temperature_salon
    above: 27
conditions:
  - condition: template
    value_template: >
      {{ state_attr('cover.salon', 'current_position') | default(0) | int > 50 }}
actions:
  - action: espsomfy_rts_enhanced.set_shade_position
    target:
      entity_id: cover.salon
    data:
      position: 50
```

## Rejoindre MY, mais seulement si on n'y est pas déjà

```yaml
alias: Position MY du salon si nécessaire
triggers:
  - trigger: time
    at: "08:30:00"
conditions:
  - condition: template
    value_template: "{{ states('cover.salon') not in ['opening', 'closing'] }}"
  - condition: template
    value_template: >
      {% set my = state_attr('cover.salon', 'my_pos') | default(-1) | int %}
      {% set pos = state_attr('cover.salon', 'current_position') | default(-1) | int %}
      {{ my >= 0 and pos >= 0 and (100 - my) != pos }}
actions:
  - action: espsomfy_rts_enhanced.send_command
    target:
      entity_id: cover.salon
    data:
      command: My
```

Le `100 - my` remet `my_pos` à l'échelle de `current_position` — voir
[Convention de position](attributs.md#convention-de-position).

---

## Sauvegarde périodique de la configuration

```yaml
alias: Sauvegarde hebdomadaire ESPSomfy
triggers:
  - trigger: time
    at: "03:15:00"
conditions:
  - condition: time
    weekday:
      - sun
actions:
  - action: espsomfy_rts_enhanced.backup
    target:
      entity_id: button.espsomfy_rts_backup
```

Les fichiers s'accumulent dans le répertoire de configuration de Home Assistant : pensez à
faire le ménage de temps en temps.
