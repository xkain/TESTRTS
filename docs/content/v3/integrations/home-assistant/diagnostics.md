# Diagnostics

L'intégration expose douze capteurs de diagnostic sur l'appareil ESPSomfy-RTS : identité,
réseau et mémoire. Ils portent tous la catégorie **Diagnostic**, et se trouvent donc dans
le bloc « Diagnostic » de la fiche de l'appareil, pas dans les commandes.

Ils sont utilisables comme n'importe quel capteur : en template, dans une condition,
dans un graphique, ou comme déclencheur d'alerte.

## Vue d'ensemble

| Capteur | Contenu | Unité | Rafraîchi |
|---|---|---|---|
| Nom d'hôte | nom réseau de l'appareil | — | figé |
| Type de puce | modèle d'ESP32, par exemple `ESP32-D0WDQ6` | — | figé |
| Connexion | `Wifi` ou `Ethernet` | — | figé |
| Adresse IP | adresse utilisée par l'intégration pour joindre l'appareil | — | figé |
| SSID Wi-Fi | réseau Wi-Fi associé | — | à chaque variation |
| Canal Wi-Fi | canal radio du point d'accès | — | à chaque variation |
| Puissance Wi-Fi | niveau de réception | dBm | lissé |
| Vitesse de connexion | débit négocié du lien Ethernet | voir la note | au changement d'état |
| Full Duplex | `True` ou `False` | — | au changement d'état |
| Mémoire libre | tas disponible | octets | lissé |
| Mémoire maximale | plus grand bloc contigu allouable | octets | lissé |
| Mémoire minimale | plus bas niveau de tas atteint depuis le démarrage | octets | lissé |

Les capteurs Wi-Fi n'existent que si l'appareil est en Wi-Fi, ceux d'Ethernet que s'il est
en Ethernet. Les autres sont toujours créés.

## Les quatre capteurs figés

**Nom d'hôte**, **Type de puce**, **Connexion** et **Adresse IP** sont des instantanés
pris au moment où l'intégration se configure. Aucun événement ne les met à jour ensuite.

!!! warning
    Conséquence concrète : si l'appareil change d'adresse IP, le capteur **Adresse IP**
    continue d'afficher l'ancienne jusqu'au rechargement de l'intégration ou au
    redémarrage de Home Assistant. Ne vous en servez pas comme source de vérité pour
    détecter un changement d'adresse.

## Capteurs Wi-Fi

Les trois capteurs Wi-Fi sont alimentés par le même événement, émis par l'appareil dès
que le niveau de réception bouge de plus de 1 dBm ou que le canal change.

**SSID Wi-Fi** et **Canal Wi-Fi** suivent cet événement sans filtrage : ils reflètent
immédiatement la dernière valeur reçue.

**Puissance Wi-Fi** est lissée — voir plus bas. Elle porte la classe d'appareil
« puissance du signal », donc Home Assistant l'affiche en dBm et sait en tracer
l'historique.

!!! note
    Quand le Wi-Fi décroche, l'appareil n'arrête pas d'émettre : il envoie un SSID vide,
    une puissance de **-100 dBm** et un canal **-1**. Une automatisation qui surveille la
    qualité du signal doit traiter ces valeurs comme « déconnecté », pas comme « très
    mauvais signal ».

## Capteurs Ethernet

**Vitesse de connexion** et **Full Duplex** sont rafraîchis quand l'état du lien change.

!!! note "Note d'affichage"
    La vitesse est déclarée à Home Assistant en méga-**octets** par seconde alors que la
    valeur envoyée est le débit du lien en méga-**bits** par seconde. Un lien 100 Mbit/s
    s'affiche donc « 100 MB/s ». La valeur est juste, c'est l'unité affichée qui ne l'est
    pas.

## Capteurs de mémoire

Les trois capteurs de mémoire décrivent le tas de l'ESP32, en octets :

| Capteur | Ce qu'il mesure | À quoi ça sert |
|---|---|---|
| Mémoire libre | total du tas disponible | vue générale de la santé mémoire |
| Mémoire maximale | plus grand bloc **contigu** allouable | c'est lui qui limite réellement : on peut avoir beaucoup de mémoire libre et ne plus pouvoir allouer un gros bloc |
| Mémoire minimale | plus bas niveau atteint depuis le démarrage | révèle un pic de consommation passé, invisible sur les deux autres |

L'appareil publie ces trois valeurs au moins toutes les 15 secondes, et toutes les
10 secondes si le tas libre ou le plus grand bloc a bougé de plus de 3,5 Ko.

L'écart entre **Mémoire libre** et **Mémoire maximale** est l'indicateur intéressant :
s'il se creuse avec le temps, le tas se fragmente.

## Le lissage

**Puissance Wi-Fi**, **Mémoire libre**, **Mémoire maximale** et **Mémoire minimale** ne
sont pas enregistrées à chaque mesure reçue. L'intégration accumule les valeurs et n'en
retient qu'une, la **médiane**, dès que l'une de ces deux conditions est remplie :

- un délai minimal s'est écoulé depuis le dernier enregistrement — 25 secondes pour la
  mémoire libre, 30 secondes pour les trois autres ;
- ou 15 valeurs ont été accumulées.

C'est volontaire : sans ce filtre, ces capteurs écriraient plusieurs fois par seconde
dans la base de données de Home Assistant, pour un signal qui ne dit rien de plus.

La conséquence à connaître : ces capteurs **retardent** de quelques dizaines de secondes,
et une valeur isolée est écrasée par la médiane. Ne les utilisez pas pour détecter un
événement bref.

## Disponibilité

Tous les capteurs de diagnostic deviennent **indisponibles** quand la liaison WebSocket
avec l'appareil tombe, et redeviennent disponibles à la reconnexion. C'est le moyen le
plus fiable de savoir si l'appareil répond encore :

```jinja
{{ states('sensor.<appareil>_adresse_ip') not in ['unavailable', 'unknown'] }}
```

## Lire les valeurs

```jinja
{{ states('sensor.<appareil>_adresse_ip') }}
{{ states('sensor.<appareil>_canal_wi_fi') }}
{{ states('sensor.<appareil>_puissance_wi_fi') }}
{{ states('sensor.<appareil>_memoire_libre') }}
{{ states('sensor.<appareil>_type_de_puce') }}
```

Les identifiants réels dépendent du nom donné à l'appareil et de la langue de Home
Assistant : relevez-les dans **Outils de développement → États** en filtrant sur `sensor.`.

### Mémoire libre en kilo-octets

```jinja
{{ (states('sensor.<appareil>_memoire_libre') | int(0) / 1024) | round(1) }} Ko
```

### Fragmentation du tas

```jinja
{% set libre = states('sensor.<appareil>_memoire_libre') | int(0) %}
{% set bloc = states('sensor.<appareil>_memoire_maximale') | int(0) %}
{{ ((libre - bloc) / libre * 100) | round(1) if libre > 0 else 0 }} %
```

### Qualité du Wi-Fi en clair

```jinja
{% set rssi = states('sensor.<appareil>_puissance_wi_fi') | int(-100) %}
{{ 'déconnecté' if rssi <= -100
   else 'excellent' if rssi >= -55
   else 'bon' if rssi >= -67
   else 'moyen' if rssi >= -75
   else 'faible' }}
```

## Recettes

### Alerter sur une mémoire qui s'effondre

```yaml
alias: Mémoire ESPSomfy-RTS basse
triggers:
  - trigger: numeric_state
    entity_id: sensor.<appareil>_memoire_maximale
    below: 20000
    for: "00:05:00"
actions:
  - action: persistent_notification.create
    data:
      title: Mémoire ESPSomfy-RTS
      message: >
        Plus grand bloc allouable : {{ states('sensor.<appareil>_memoire_maximale') }} octets.
        Mémoire libre : {{ states('sensor.<appareil>_memoire_libre') }} octets.
```

Le seuil est à caler sur votre installation : relevez la valeur au repos pendant quelques
jours avant de choisir.

### Alerter sur un Wi-Fi qui se dégrade

```yaml
alias: Signal Wi-Fi ESPSomfy-RTS faible
triggers:
  - trigger: numeric_state
    entity_id: sensor.<appareil>_puissance_wi_fi
    below: -80
    above: -100
    for: "00:15:00"
actions:
  - action: persistent_notification.create
    data:
      title: Signal Wi-Fi faible
      message: >
        {{ states('sensor.<appareil>_puissance_wi_fi') }} dBm sur le canal
        {{ states('sensor.<appareil>_canal_wi_fi') }}.
```

La borne `above: -100` écarte le cas « déconnecté », qui se signale justement par -100.

### Alerter sur une perte de liaison

```yaml
alias: ESPSomfy-RTS injoignable
triggers:
  - trigger: state
    entity_id: sensor.<appareil>_adresse_ip
    to: unavailable
    for: "00:02:00"
actions:
  - action: persistent_notification.create
    data:
      title: ESPSomfy-RTS injoignable
      message: La liaison avec l'appareil est coupée depuis 2 minutes.
```

### Suivre la fragmentation dans le temps

Un capteur `template` pour en faire une courbe :

```yaml
template:
  - sensor:
      - name: "Fragmentation ESPSomfy-RTS"
        unique_id: espsomfy_fragmentation
        unit_of_measurement: "%"
        state: >
          {% set libre = states('sensor.<appareil>_memoire_libre') | int(0) %}
          {% set bloc = states('sensor.<appareil>_memoire_maximale') | int(0) %}
          {{ ((libre - bloc) / libre * 100) | round(1) if libre > 0 else none }}
        availability: >
          {{ states('sensor.<appareil>_memoire_libre') | int(0) > 0 }}
```
