# Diagnostics

L'appareil ESPSomfy-RTS porte une série de capteurs qui décrivent son identité, son réseau et
sa mémoire. Ils sont tous de catégorie **Diagnostic** : ils se trouvent dans le bloc
« Diagnostic » de la fiche de l'appareil, pas parmi les commandes.

Ils s'emploient comme n'importe quel capteur : dans un template, une condition, un graphique
ou une alerte.

![Capteurs de diagnostic de l'appareil](home-assistant/img/ha-appareil-hub){ .on-glb }

!!! note "D'autres capteurs de diagnostic"

    Les capteurs **Émetteur N** des télécommandes liées, les capteurs de plannings et le capteur
    **Dernière sauvegarde** sont aussi de catégorie Diagnostic. Ils sont décrits dans
    [Entités exposées](entites.md).

## Vue d'ensemble { #vue-ensemble }

| Capteur | Contenu | Unité | Mise à jour |
| :--- | :--- | :--- | :--- |
| **Nom d'hôte** | nom réseau de l'appareil | — | figé |
| **Type de puce** | modèle d'ESP32, par exemple `ESP32`, `ESP32-S3` ou `ESP32-C6` | — | figé |
| **Profil Matériel** | `BOX-ETH`, `BOX-WIFI` ou `GENERIC` | — | à chaque connexion |
| **Dernier redémarrage** | cause du dernier redémarrage, voir [plus bas](#redemarrage) | — | à chaque connexion |
| **Démarré** | date et heure du démarrage de l'appareil | horodatage | à chaque connexion |
| **Réseau connecté depuis** | date et heure de la dernière connexion de l'appareil au réseau | horodatage | à chaque connexion |
| **Connexion** | `Wifi`, `Ethernet` ou `Unknown` | — | figé |
| **Puissance Wi-Fi** | niveau de réception Wi-Fi | dBm | lissé |
| **SSID Wi-Fi** | réseau Wi-Fi auquel l'appareil est associé | — | à chaque variation |
| **Canal Wi-Fi** | canal du point d'accès | — | à chaque variation |
| **Vitesse de connexion** | débit négocié du lien Ethernet | Mbit/s | à chaque variation |
| **Full Duplex** | `True` ou `False` | — | à chaque variation |
| **Mémoire libre** | mémoire vive disponible | octets | lissé |
| **Plus grand bloc libre** | plus grand bloc d'un seul tenant encore allouable | octets | lissé |
| **Mémoire minimale** | plus bas niveau de mémoire libre atteint depuis le démarrage | octets | lissé |
| **Adresse IP** | adresse que l'intégration utilise pour joindre l'appareil | — | figé |

Tous ne sont pas toujours créés :

| Capteurs | Créés quand |
| :--- | :--- |
| **Puissance Wi-Fi**, **SSID Wi-Fi**, **Canal Wi-Fi** | **Connexion** vaut `Wifi` |
| **Vitesse de connexion**, **Full Duplex** | **Connexion** vaut `Ethernet` |
| **Profil Matériel**, **Dernier redémarrage**, **Démarré**, **Réseau connecté depuis** | firmware v3 |
| les autres | toujours |

Quand **Connexion** vaut `Unknown`, aucun capteur Wi-Fi ni Ethernet n'est créé.

## Les capteurs figés { #figes }

**Nom d'hôte**, **Type de puce**, **Connexion** et **Adresse IP** sont relevés une fois, au
démarrage de l'intégration. Rien ne les met à jour ensuite.

!!! warning "Adresse IP"

    **Adresse IP** affiche l'adresse saisie dans l'intégration, pas celle que l'appareil
    s'attribue. Si vous avez saisi un nom d'hôte, c'est ce nom qui s'affiche. Pour changer
    d'adresse, passez par la [reconfiguration](installation.md#reconfigurer).

## Les capteurs relus à chaque connexion { #connexion }

**Profil Matériel**, **Dernier redémarrage**, **Démarré** et **Réseau connecté depuis** sont
relus à chaque fois que la liaison avec l'appareil se rétablit. Un redémarrage de l'appareil
coupe cette liaison : ces quatre capteurs se mettent donc à jour après chaque redémarrage.

**Démarré** et **Réseau connecté depuis** sont des horodatages : Home Assistant les affiche
sous la forme « il y a 3 heures » et les tient à jour seul. Un écart de moins de 60 secondes
avec la valeur précédente est ignoré : une simple reconnexion ne fait pas bouger l'heure de
démarrage.

### Causes de redémarrage { #redemarrage }

| Valeur | Signification |
| :--- | :--- |
| `POWERON` | mise sous tension |
| `EXT` | broche de réinitialisation externe |
| `SW` | redémarrage demandé par le logiciel : bouton `Redémarrer`, fin de mise à jour… |
| `PANIC` | plantage du micrologiciel |
| `INT_WDT`, `TASK_WDT`, `WDT` | chien de garde : une tâche est restée bloquée |
| `BROWNOUT` | baisse de la tension d'alimentation |
| `DEEPSLEEP` | réveil de veille profonde |
| `SDIO` | réinitialisation par le bus SDIO |
| `UNKNOWN` | cause non identifiée |

## Capteurs Wi-Fi { #wifi }

Les trois capteurs Wi-Fi sont alimentés par le même message de l'appareil. Il l'envoie quand
le niveau de réception bouge de plus de 1 dBm ou quand le canal change.

* **SSID Wi-Fi** et **Canal Wi-Fi** prennent la dernière valeur reçue, sans filtrage.
* **Puissance Wi-Fi** est [lissée](#lissage). Sa classe « force du signal » permet à Home
    Assistant d'en tracer l'historique.

Au démarrage de l'intégration, **Puissance Wi-Fi** et **Canal Wi-Fi** valent **Inconnu**, et
**SSID Wi-Fi** est vide, jusqu'au premier message de l'appareil.

## Capteurs Ethernet { #ethernet }

**Vitesse de connexion** et **Full Duplex** se mettent à jour quand l'état du lien change.

**Vitesse de connexion** est déclarée comme un débit, en Mbit/s : vous pouvez choisir une autre
unité dans les paramètres de l'entité.

## Capteurs de mémoire { #memoire }

| Capteur | Ce qu'il mesure | À quoi il sert |
| :--- | :--- | :--- |
| **Mémoire libre** | total de la mémoire vive disponible | vue d'ensemble de la santé mémoire |
| **Plus grand bloc libre** | plus grand bloc d'un seul tenant encore allouable | c'est lui qui limite vraiment : beaucoup de mémoire libre ne garantit pas de pouvoir allouer un gros bloc |
| **Mémoire minimale** | plus bas niveau de mémoire libre depuis le démarrage | révèle un pic de consommation passé, invisible sur les deux autres |

Ces capteurs sont déclarés comme des tailles de données, en octets : vous pouvez les afficher en
Ko ou en Kio dans les paramètres de l'entité.

L'écart entre **Mémoire libre** et **Plus grand bloc libre** est l'indicateur à suivre : s'il se
creuse avec le temps, la mémoire se fragmente.

## Le lissage { #lissage }

**Puissance Wi-Fi**, **Mémoire libre**, **Plus grand bloc libre** et **Mémoire minimale** ne
sont pas enregistrés à chaque mesure reçue. L'intégration accumule les valeurs et n'en garde
qu'une, la **médiane**, dès que l'une de ces conditions est remplie :

| Condition | Valeur |
| :--- | :--- |
| délai depuis le dernier enregistrement | 25 s pour **Mémoire libre**, 30 s pour les trois autres |
| nombre de valeurs accumulées | 15 |

Au démarrage de l'intégration, les capteurs de mémoire partent de la valeur lue à la
configuration ; **Puissance Wi-Fi** prend la première valeur reçue sans attendre.

C'est volontaire : sans ce filtre, ces capteurs écriraient sans cesse dans la base de données
de Home Assistant pour un signal qui n'en dit pas plus.

!!! note "Conséquence"

    Ces capteurs **retardent** d'une demi-minute environ, et une valeur isolée disparaît dans la
    médiane. Ne vous en servez pas pour repérer un événement bref.

## Disponibilité { #disponibilite }

Tous ces capteurs passent **indisponibles** quand la liaison WebSocket avec l'appareil tombe,
et redeviennent disponibles à la reconnexion. C'est le moyen le plus simple de savoir si
l'appareil répond :

```jinja
{{ states('sensor.<appareil>_adresse_ip') not in ['unavailable', 'unknown'] }}
```

## Télécharger les diagnostics { #telecharger }

Pour signaler un problème, Home Assistant sait produire un fichier de diagnostic : sur la page
de l'intégration, menu de l'entrée, puis **Télécharger les diagnostics**.

Le fichier contient la configuration lue sur l'appareil, ses plannings, l'état de la liaison
(connectée ou non, nombre de reconnexions et de refus d'authentification) et la dernière
version de micrologiciel connue.

Avant l'écriture du fichier, l'intégration masque :

* le nom d'utilisateur, le mot de passe et le PIN ;
* la clé d'accès à l'appareil ;
* les adresses radio et les codes tournants : à eux deux, ils suffiraient à imiter une
    télécommande ;
* l'adresse MAC et le SSID Wi-Fi.

## Lire les valeurs { #lire }

Les identifiants dépendent du nom de l'appareil et de la langue de Home Assistant au moment de
leur création : relevez-les dans **Outils de développement › États**, en filtrant sur `sensor.`.
Les exemples ci-dessous supposent une installation en français.

```jinja
{{ states('sensor.<appareil>_adresse_ip') }}
{{ states('sensor.<appareil>_canal_wi_fi') }}
{{ states('sensor.<appareil>_puissance_wi_fi') }}
{{ states('sensor.<appareil>_memoire_libre') }}
{{ states('sensor.<appareil>_dernier_redemarrage') }}
```

### Heures écoulées depuis le démarrage

```jinja
{% set depuis = states('sensor.<appareil>_demarre') | as_datetime(none) %}
{{ ((now() - depuis).total_seconds() / 3600) | round(1) if depuis else none }} h
```

### Mémoire libre en kilo-octets

```jinja
{{ (states('sensor.<appareil>_memoire_libre') | int(0) / 1024) | round(1) }} Ko
```

### Fragmentation de la mémoire

```jinja
{% set libre = states('sensor.<appareil>_memoire_libre') | int(0) %}
{% set bloc = states('sensor.<appareil>_plus_grand_bloc_libre') | int(0) %}
{{ ((libre - bloc) / libre * 100) | round(1) if libre > 0 else none }}
```

### Qualité du Wi-Fi en clair

```jinja
{% set rssi = states('sensor.<appareil>_puissance_wi_fi') %}
{% if not is_number(rssi) %}inconnue
{% elif rssi | int >= -55 %}excellente
{% elif rssi | int >= -67 %}bonne
{% elif rssi | int >= -75 %}moyenne
{% else %}faible{% endif %}
```

## Recettes { #recettes }

### Alerter quand la mémoire s'effondre

```yaml
alias: Mémoire ESPSomfy-RTS basse
triggers:
  - trigger: numeric_state
    entity_id: sensor.<appareil>_plus_grand_bloc_libre
    below: 20000
    for: "00:05:00"
actions:
  - action: persistent_notification.create
    data:
      title: Mémoire ESPSomfy-RTS
      message: >
        Plus grand bloc libre : {{ states('sensor.<appareil>_plus_grand_bloc_libre') }} octets.
        Mémoire libre : {{ states('sensor.<appareil>_memoire_libre') }} octets.
```

Le seuil est à caler sur votre installation : relevez la valeur au repos pendant quelques jours
avant de le choisir.

### Alerter quand le Wi-Fi se dégrade

```yaml
alias: Signal Wi-Fi ESPSomfy-RTS faible
triggers:
  - trigger: numeric_state
    entity_id: sensor.<appareil>_puissance_wi_fi
    below: -80
    for: "00:15:00"
actions:
  - action: persistent_notification.create
    data:
      title: Signal Wi-Fi faible
      message: >
        {{ states('sensor.<appareil>_puissance_wi_fi') }} dBm sur le canal
        {{ states('sensor.<appareil>_canal_wi_fi') }}.
```

### Alerter sur un redémarrage anormal

Le capteur **Démarré** change à chaque redémarrage. La courte pause laisse à
**Dernier redémarrage** le temps de prendre sa nouvelle valeur.

```yaml
alias: Redémarrage anormal d'ESPSomfy-RTS
triggers:
  - trigger: state
    entity_id: sensor.<appareil>_demarre
    not_from:
      - unavailable
      - unknown
    not_to:
      - unavailable
      - unknown
actions:
  - delay: "00:00:02"
  - condition: template
    value_template: >
      {{ states('sensor.<appareil>_dernier_redemarrage')
         in ['PANIC', 'INT_WDT', 'TASK_WDT', 'WDT', 'BROWNOUT'] }}
  - action: persistent_notification.create
    data:
      title: ESPSomfy-RTS a redémarré
      message: >
        Cause : {{ states('sensor.<appareil>_dernier_redemarrage') }}.
```

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

Un capteur `template`, dans `configuration.yaml`, pour en tracer la courbe :

```yaml
template:
  - sensor:
      - name: "Fragmentation ESPSomfy-RTS"
        unique_id: espsomfy_fragmentation
        unit_of_measurement: "%"
        state_class: measurement
        state: >
          {% set libre = states('sensor.<appareil>_memoire_libre') | int(0) %}
          {% set bloc = states('sensor.<appareil>_plus_grand_bloc_libre') | int(0) %}
          {{ ((libre - bloc) / libre * 100) | round(1) if libre > 0 else none }}
        availability: >
          {{ states('sensor.<appareil>_memoire_libre') | int(0) > 0 }}
```
