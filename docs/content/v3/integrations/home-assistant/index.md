# Home Assistant / MQTT — Vue d'ensemble

<img src="../../../assets/banniere-ha.webp" alt="ESPSomfy-RTS enhanced" width="100%">

Cette documentation décrit l'intégration qui accompagne le firmware
[ESPSomfy-RTS](https://github.com/xkain/ESPSomfy-RTS) : les services, entités, attributs
et événements exposés dans Home Assistant.

Le domaine de l'intégration est `espsomfy_rts_enhanced`. Tous les services décrits ici
s'appellent donc sous la forme `espsomfy_rts_enhanced.<service>`.

Les services standard de Home Assistant (`cover.open_cover`, `cover.set_cover_position`,
`cover.stop_cover`…) fonctionnent également sur toutes les entités `cover` de
l'intégration. Les services propres documentés ici n'existent que pour ce que le
protocole RTS sait faire et que le domaine `cover` ne couvre pas.

## Découvrir

| Page | Contenu |
|---|---|
| [Entités exposées](entites.md) | ce que l'intégration crée dans Home Assistant : équipements, groupes, capteurs, boutons |
| [Diagnostics](diagnostics.md) | les 12 capteurs de l'appareil : réseau, Wi-Fi, Ethernet, mémoire — contenu, cadence, alertes |
| [Attributs en template](attributs.md) | lire une position, la position MY, la dernière commande — et la convention de position qui s'inverse |
| [Événements](evenements.md) | le bus `espsomfy-rts_event`, sa charge utile, et comment réagir à une télécommande physique |

## Agir

| Page | Contenu |
|---|---|
| [Services](services.md) | les 15 services : mouvement, inclinaison, recalage, capteurs soleil et vent, commandes brutes RTS, appareil |
| [Recettes d'automatisation](automatisations.md) | 10 automatisations complètes, commentées |
| [Pièges et limites](pieges-et-limites.md) | ce que le protocole RTS ne permet pas, et ce qu'il faut anticiper |

## Vue d'ensemble des services

| Service | Cible | Paramètres |
|---|---|---|
| [`open_shade`](services.md#open_shade--close_shade--stop_shade) | `cover` | — |
| [`close_shade`](services.md#open_shade--close_shade--stop_shade) | `cover` | — |
| [`stop_shade`](services.md#open_shade--close_shade--stop_shade) | `cover` | — |
| [`set_shade_position`](services.md#set_shade_position) | `cover` | `position` |
| [`tilt_open`](services.md#tilt_open--tilt_close) | `cover` | — |
| [`tilt_close`](services.md#tilt_open--tilt_close) | `cover` | — |
| [`set_tilt_position`](services.md#set_tilt_position) | `cover` | `tilt_position` |
| [`set_current_position`](services.md#set_current_position) | `cover` | `position` |
| [`set_current_tilt_position`](services.md#set_current_tilt_position) | `cover` | `tilt_position` |
| [`set_sunny`](services.md#set_sunny) | `cover` | `sunny` |
| [`set_windy`](services.md#set_windy) | `cover` | `windy` |
| [`send_command`](services.md#send_command) | `cover` | `command`, `repeat` |
| [`send_step_command`](services.md#send_step_command) | `cover` | `direction`, `step_size`, `repeat` |
| [`reboot`](services.md#reboot) | `button` | — |
| [`backup`](services.md#backup) | `button` | — |

## Lire une valeur en un coup d'œil

| Ce que vous cherchez | Template |
|---|---|
| position actuelle | `{{ state_attr('cover.salon', 'current_position') }}` |
| position favorite MY | `{{ state_attr('cover.salon', 'my_pos') }}` |
| inclinaison actuelle | `{{ state_attr('cover.veranda', 'current_tilt_position') }}` |
| dernière commande reçue | `{{ state_attr('cover.salon', 'last_cmd') }}` |
| origine de cette commande | `{{ state_attr('cover.salon', 'cmd_source') }}` |
| état (ouvert, fermé, en mouvement) | `{{ states('cover.salon') }}` |
| adresse IP de l'appareil | `{{ states('sensor.<appareil>_adresse_ip') }}` |
| canal Wi-Fi | `{{ states('sensor.<appareil>_canal_wi_fi') }}` |
| mémoire libre | `{{ states('sensor.<appareil>_memoire_libre') }}` |

Les valeurs de diagnostic sont des **entités** à part entière, pas des attributs : elles
se lisent avec `states()`. Leurs identifiants dépendent du nom donné à l'appareil — voir
[Diagnostics](diagnostics.md#lire-les-valeurs).

!!! warning "Convention de position"
    `my_pos` et `target` sont livrés dans la convention ESPSomfy-RTS, l'inverse de
    `current_position`. Voir [Attributs en template](attributs.md#convention-de-position).
