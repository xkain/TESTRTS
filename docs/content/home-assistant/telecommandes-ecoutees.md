# Télécommandes écoutées

Une télécommande **écoutée** n'est liée à aucun équipement : l'appareil capte ses appuis et les
transmet. Dans Home Assistant, chaque appui devient un événement qui peut lancer une automatisation,
allumer une lumière ou activer une scène.

La capture d'une télécommande se fait dans l'interface de l'appareil, page **Déclencheurs** : voir
[Déclencheurs](../v3/domotique/declencheurs.md). Cette fonction demande un firmware v3.

## Ce que crée l'intégration { #entites }

| Élément | Détail |
| :--- | :--- |
| **Appareil** | un appareil Home Assistant par télécommande, de modèle **ESPSomfy-RTS Listened Remote**, rattaché à l'appareil ESPSomfy-RTS et nommé comme dans l'interface (ou par son adresse à défaut) |
| **Entité** | une entité `event` de classe *button*, qui porte le nom de cet appareil |
| **Attributs** | `event_type` (la touche), `rssi` (force du signal reçu, en dBm) et `address` (adresse radio de la télécommande) |
| **Disponibilité** | l'entité est indisponible quand la connexion avec l'appareil est coupée |

### Quand l'entité apparaît { #creation }

L'entité naît au **premier appui** reçu de la télécommande, par la connexion WebSocket de
l'appareil, et non au moment de sa capture : après avoir ajouté une télécommande, appuyez une fois
sur une touche. Ce premier appui n'est pas perdu : il est rejoué dès que l'entité existe.

Ensuite, l'entité est recréée à chaque démarrage de Home Assistant depuis son registre, sans
attendre un nouvel appui.

## Les types d'appui { #types }

| `event_type` | Affiché dans Home Assistant |
| :--- | :--- |
| `up` | Montée |
| `down` | Descente |
| `my` | My |
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
| `stop` | Stop |

Dans une automatisation, utilisez toujours la valeur de la colonne `event_type`, pas sa traduction.

## Exemple d'automatisation { #exemple }

Allumer la lampe du bureau sur **Montée** et l'éteindre sur **Descente**, avec la télécommande
écoutée `event.bureau` :

```yaml
alias: Télécommande du bureau
triggers:
  - trigger: state
    entity_id: event.bureau
    not_from:
      - unavailable
      - unknown
    not_to:
      - unavailable
      - unknown
actions:
  - choose:
      - conditions:
          - condition: template
            value_template: "{{ trigger.to_state.attributes.event_type == 'up' }}"
        sequence:
          - action: light.turn_on
            target:
              entity_id: light.bureau
      - conditions:
          - condition: template
            value_template: "{{ trigger.to_state.attributes.event_type == 'down' }}"
        sequence:
          - action: light.turn_off
            target:
              entity_id: light.bureau
mode: queued
```

L'état d'une entité `event` est l'horodatage du dernier appui : il change à chaque appui, même
répété sur la même touche. `not_from` et `not_to` évitent de réagir quand la connexion se coupe
ou revient : l'entité passe alors par **Indisponible** sans qu'aucune touche n'ait été pressée.

## À savoir { #a-savoir }

!!! warning "Appareils jamais supprimés automatiquement"

    Retirer une télécommande de l'écoute sur l'appareil ne retire pas son appareil de Home
    Assistant. Supprimez-le vous-même depuis sa page dans **Paramètres** › **Appareils et
    services**.

!!! note "Renommer"

    Renommer la télécommande dans l'interface de l'appareil ne renomme pas son appareil dans Home
    Assistant. Renommez-le aussi dans Home Assistant si besoin.

!!! warning "Une seule voie à la fois"

    Si la découverte MQTT de l'appareil est aussi activée, la même télécommande apparaît deux fois
    dans Home Assistant : une entité par l'intégration, une par MQTT. Choisissez l'une ou l'autre,
    voir [Déclencheurs](../v3/domotique/declencheurs.md#avec-la-decouverte-mqtt).
