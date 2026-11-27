# Recettes d'automatisation

_Exemples à adapter aux identifiants de vos entités. Les positions suivent la convention
Home Assistant : 0 = fermé, 100 = ouvert._

!!! tip "Un horaire fixe ? Pensez au planning de l'appareil"

    Pour ouvrir ou fermer à heure fixe, au lever ou au coucher du soleil, un
    [planning](plannings.md) s'exécute sur l'appareil lui-même et continue de fonctionner
    quand Home Assistant est arrêté. Les automatisations ci-dessous servent à ce qu'un
    planning ne sait pas faire : réagir à un capteur, à une télécommande, à une condition.

---

## Rejoindre la position favorite à heure fixe

`My` arrête un équipement en mouvement au lieu de l'envoyer à sa position favorite : la
condition écarte ce cas.

```yaml
alias: Position favorite du salon le matin
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

## Rejoindre la position favorite, seulement si nécessaire

`my_pos` et `current_position` sont dans la même convention : on les compare
directement. `my_pos` vaut `None` quand aucune position favorite n'est enregistrée.

```yaml
alias: Position favorite du salon si nécessaire
triggers:
  - trigger: time
    at: "08:30:00"
conditions:
  - condition: template
    value_template: "{{ states('cover.salon') not in ['opening', 'closing'] }}"
  - condition: template
    value_template: >
      {% set my = state_attr('cover.salon', 'my_pos') %}
      {% set pos = state_attr('cover.salon', 'current_position') %}
      {{ my is not none and pos is not none and my | int != pos | int }}
actions:
  - action: espsomfy_rts_enhanced.send_command
    target:
      entity_id: cover.salon
    data:
      command: My
```

---

## Alerter quand aucune position favorite n'est enregistrée

```yaml
alias: Contrôle de la position favorite du salon
triggers:
  - trigger: time
    at: "12:00:00"
conditions:
  - condition: template
    value_template: "{{ state_attr('cover.salon', 'my_pos') is none }}"
actions:
  - action: persistent_notification.create
    data:
      title: Position favorite manquante
      message: L'équipement du salon n'a pas de position favorite enregistrée.
```

L'attribut vaut aussi `None` dans les secondes qui suivent un démarrage de Home Assistant,
avant les premières nouvelles de l'appareil : évitez de lancer ce contrôle au démarrage.

---

## Définir la position favorite depuis Home Assistant

`set_my_position` amène l'équipement à la position puis la mémorise, comme un appui long
sur My. Ici, un bouton d'aide fixe la position favorite à la position actuelle de
l'équipement : déjà sur place, il ne bouge pas et l'appareil envoie seulement l'appui long.

Si le moteur connaît déjà cette position et que l'équipement s'y trouve, ajoutez
`learn: true` : l'appareil l'enregistre sans rien émettre.

```yaml
alias: Mémoriser la position actuelle du salon comme favorite
triggers:
  - trigger: state
    entity_id: input_button.memoriser_favorite_salon
conditions:
  - condition: template
    value_template: >
      {{ states('cover.salon') not in ['opening', 'closing']
         and state_attr('cover.salon', 'current_position') is not none
         and state_attr('cover.salon', 'my_pos') != state_attr('cover.salon', 'current_position') }}
actions:
  - action: espsomfy_rts_enhanced.set_my_position
    target:
      entity_id: cover.salon
    data:
      position: "{{ state_attr('cover.salon', 'current_position') | int }}"
```

!!! warning "Même valeur = effacement"

    Envoyer à `set_my_position` la position favorite déjà enregistrée l'**efface**. La
    dernière partie de la condition écarte ce cas. `set_my_position` est refusée sur un
    groupe.

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

Et le retour au calme, temporisé pour ne pas réagir à une rafale isolée :

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

`set_windy` accepte aussi un groupe : une seule action protège tous les stores d'une
façade.

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
  - action: espsomfy_rts_enhanced.set_sunny
    target:
      entity_id: cover.banne_terrasse
    data:
      sunny: "{{ trigger.id == 'soleil' }}"
```

Les temporisations `for` ne sont pas décoratives : sans elles, un nuage qui passe
déclenche un aller-retour complet du store. Le moteur ne réagit au soleil que si
l'interrupteur **Capteur solaire** de l'équipement est allumé.

---

## Réagir à une télécommande physique

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

Le filtre `source: remote` est important : sans lui, une descente commandée par Home
Assistant déclencherait aussi l'automatisation. Voir [Événements](evenements.md).

---

## Recaler la position après une manœuvre non captée

Après une manœuvre au bouton mural ou une coupure de courant, la position calculée par
ESPSomfy-RTS peut ne plus correspondre à la réalité. Une fois l'équipement amené en butée
haute à la main, un bouton d'aide remet les deux en accord, sans faire bouger le moteur.

```yaml
alias: Recaler le salon en butée haute
triggers:
  - trigger: state
    entity_id: input_button.recaler_salon
actions:
  - action: espsomfy_rts_enhanced.set_current_position
    target:
      entity_id: cover.salon
    data:
      position: 100
```

`set_current_position` est refusée sur un groupe : recalez chaque équipement.

---

## Fermer à moitié, seulement si l'équipement est plus ouvert

La position actuelle sert de condition : l'action n'est appelée que si le mouvement a un
sens.

```yaml
alias: Mi-fermeture du salon en cas de forte chaleur
triggers:
  - trigger: numeric_state
    entity_id: sensor.temperature_salon
    above: 27
conditions:
  - condition: numeric_state
    entity_id: cover.salon
    attribute: current_position
    above: 50
actions:
  - action: espsomfy_rts_enhanced.set_shade_position
    target:
      entity_id: cover.salon
    data:
      position: 50
```

---

## Réglage fin par paliers

```yaml
alias: Fermer un peu plus les lames de la véranda
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

## Créer un planning et le notifier

`create_schedule` renvoie l'identifiant du planning créé, rangé sous l'entité visée.

```yaml
alias: Créer le planning de fermeture du salon
triggers:
  - trigger: state
    entity_id: input_button.creer_planning_salon
actions:
  - action: espsomfy_rts_enhanced.create_schedule
    target:
      entity_id: cover.salon
    data:
      days: [mon, tue, wed, thu, fri, sat, sun]
      time_ref: sunset
      offset: 20
      action: position
      position: 0
      name: Coucher salon
    response_variable: planning
  - action: persistent_notification.create
    data:
      message: >
        Planning {{ planning['cover.salon'].schedule_id }} créé sur l'appareil.
```

---

## Sauvegarder la configuration

Pas besoin d'automatisation : la **sauvegarde automatique** se règle (jours et heure) dans
le panneau **ESPSomfy RTS** de la barre latérale, et les 5 sauvegardes les plus récentes
sont gardées. Voir [Sauvegardes et mises à jour](sauvegardes-et-mises-a-jour.md).

Pour une sauvegarde déclenchée par autre chose qu'un horaire, préférez l'action d'appareil
**Backup** (éditeur d'automatisations, **Appareil**) : elle ne dépend pas de l'identifiant
du bouton, qui suit la langue de Home Assistant.
