# Services

ESPSomfy-RTS Enhanced ajoute 19 actions au domaine `espsomfy_rts_enhanced`. Elles
apparaissent dans l'éditeur d'automatisations sous leur nom français, et en YAML sous leur
identifiant.

| Famille | Action (nom affiché) | Identifiant | Cible |
|---|---|---|---|
| [Mouvement](#mouvement) | `Ouvrir l'équipement` | `open_shade` | équipement ou groupe |
| | `Fermer l'équipement` | `close_shade` | équipement ou groupe |
| | `Arrêter l'équipement` | `stop_shade` | équipement ou groupe |
| | `Définir la position` | `set_shade_position` | équipement ou groupe |
| [Inclinaison](#inclinaison) | `Ouvrir l'inclinaison` | `tilt_open` | équipement ou groupe |
| | `Fermer l'inclinaison` | `tilt_close` | équipement ou groupe |
| | `Définir l'inclinaison` | `set_tilt_position` | équipement ou groupe |
| [Recalage](#recalage-de-position) | `Forcer la position actuelle` | `set_current_position` | équipement seul |
| | `Forcer l'inclinaison actuelle` | `set_current_tilt_position` | équipement seul |
| [Position favorite](#position-favorite-my) | `Définir la position favorite (My)` | `set_my_position` | équipement seul |
| [Soleil et vent](#soleil-et-vent) | `Définir l'état d'ensoleillement` | `set_sunny` | équipement ou groupe |
| | `Définir l'état du vent` | `set_windy` | équipement ou groupe |
| [Commandes brutes](#commandes-brutes-rts) | `Envoyer une commande RTS` | `send_command` | équipement ou groupe |
| | `Envoyer une commande Pas-à-Pas` | `send_step_command` | équipement ou groupe |
| [Plannings](#plannings) | `Créer un planning` | `create_schedule` | équipement ou groupe |
| | `Supprimer le planning` | `delete_schedule` | interrupteur d'un planning |
| [Appareil](#services-de-lappareil) | `Redémarrer` | `reboot` | bouton de l'appareil |
| | `Sauvegarder` | `backup` | bouton de l'appareil |
| | `Effacer les sauvegardes` | `delete_backups` | bouton de l'appareil |

Toutes les positions et inclinaisons se donnent dans la convention Home Assistant :
**0 = fermé, 100 = ouvert**. L'intégration fait la conversion vers l'appareil, y compris
pour les stores bannes et les équipements dont la position est inversée.

!!! warning "Une action refusée échoue visiblement"

    Si l'appareil est injoignable ou refuse l'ordre, l'action lève une erreur : la trace de
    l'automatisation s'arrête sur l'étape fautive avec le motif. Avec la sécurité active sur
    l'appareil, un refus pour PIN ou mot de passe invite à ressaisir les identifiants dans
    l'intégration.

---

## Mouvement

### `open_shade` / `close_shade` / `stop_shade`

Aucun paramètre.

```yaml
action: espsomfy_rts_enhanced.open_shade
target:
  entity_id: cover.salon
```

`stop_shade` **ne fait rien si l'équipement est à l'arrêt** : sur un moteur Somfy, l'ordre
d'arrêt est la touche My, qui enverrait un équipement immobile à sa position favorite.
Sur un groupe, il ne part que si au moins un membre est en mouvement.

#### Équipements à commande unique { #equipements-a-commande-unique }

Les portes de garage et portails à bouton unique (bascule) n'ont qu'une trame, `Toggle` :
c'est le moteur qui choisit le sens.

| Action | Ce qui part |
|---|---|
| `open_shade` | la bascule, seulement si l'équipement est à l'arrêt ou en train de se fermer |
| `close_shade` | la bascule, toujours |
| `stop_shade` | la bascule si l'équipement bouge, rien à l'arrêt |

### `set_shade_position`

Envoie l'équipement à une position précise. ESPSomfy-RTS calcule la durée de course et
émet les trames nécessaires.

| Champ | Nom affiché | Type | Plage | Requis |
|---|---|---|---|---|
| `position` | **Position** | entier | 0 à 100 | oui |

```yaml
action: espsomfy_rts_enhanced.set_shade_position
target:
  entity_id: cover.salon
data:
  position: 40
```

Demander la position que l'équipement occupe déjà n'émet aucune trame, sans erreur. Voir
[Pièges et limites](pieges-et-limites.md).

---

## Inclinaison

### `tilt_open` / `tilt_close`

Aucun paramètre.

```yaml
action: espsomfy_rts_enhanced.tilt_close
target:
  entity_id: cover.veranda
```

### `set_tilt_position`

| Champ | Nom affiché | Type | Plage | Requis |
|---|---|---|---|---|
| `tilt_position` | **Position d'inclinaison** | entier | 0 à 100 | oui |

```yaml
action: espsomfy_rts_enhanced.set_tilt_position
target:
  entity_id: cover.veranda
data:
  tilt_position: 75
```

L'intégration ne vérifie pas que l'équipement visé possède une inclinaison : réservez ces
actions aux équipements déclarés avec des lames orientables.

---

## Recalage de position

Ces deux actions **ne font pas bouger le moteur**. Elles corrigent la position
qu'ESPSomfy-RTS croit être la position courante, après une manœuvre au bouton mural non
captée, une coupure de courant ou une dérive constatée. Elles sont refusées sur un groupe.

### `set_current_position`

| Champ | Nom affiché | Type | Plage | Requis |
|---|---|---|---|---|
| `position` | **Position** | entier | 0 à 100 | oui |

```yaml
action: espsomfy_rts_enhanced.set_current_position
target:
  entity_id: cover.salon
data:
  position: 100
```

### `set_current_tilt_position`

| Champ | Nom affiché | Type | Plage | Requis |
|---|---|---|---|---|
| `tilt_position` | **Position d'inclinaison** | entier | 0 à 100 | oui |

```yaml
action: espsomfy_rts_enhanced.set_current_tilt_position
target:
  entity_id: cover.veranda
data:
  tilt_position: 0
```

---

## Position favorite (My)

### `set_my_position`

Amène l'équipement à la position demandée puis la mémorise comme position favorite,
comme un appui long sur My.

| Champ | Nom affiché | Type | Plage | Requis |
|---|---|---|---|---|
| `position` | **Position favorite** | entier | 0 à 100 | oui |
| `tilt_position` | **Inclinaison favorite** | entier | 0 à 100 | non |
| `learn` | **Déjà apprise par le moteur** | booléen | — | non (`false`) |

```yaml
action: espsomfy_rts_enhanced.set_my_position
target:
  entity_id: cover.salon
data:
  position: 30
```

| Situation | Effet |
|---|---|
| valeur différente de la favorite actuelle | l'équipement s'y rend, puis la valeur est mémorisée |
| **même valeur que la favorite actuelle** | la position favorite est **effacée** |
| `learn: true` | rien n'est émis : le moteur connaît déjà cette position et l'équipement s'y trouve, l'appareil l'enregistre seulement |
| équipement en mouvement | rien n'est mémorisé |
| groupe | refusé |

`tilt_position` n'est pris en compte que sur un équipement qui a une inclinaison. La
position favorite se relit dans l'attribut `my_pos` (et `my_tilt_pos`), voir
[Attributs](attributs.md).

---

## Soleil et vent { #soleil-et-vent }

Ces actions émettent les trames capteur du protocole RTS : elles **simulent un capteur
Somfy** de soleil ou de vent auprès du moteur. N'importe quelle source de Home Assistant
(station météo, capteur de luminosité, prévision) peut ainsi piloter la logique
automatique du moteur. Elles s'appliquent à un équipement ou à un groupe.

### `set_sunny`

| Champ | Nom affiché | Type | Requis |
|---|---|---|---|
| `sunny` | **Ensoleillé** | booléen | oui |

```yaml
action: espsomfy_rts_enhanced.set_sunny
target:
  entity_id: cover.banne_terrasse
data:
  sunny: true
```

### `set_windy`

| Champ | Nom affiché | Type | Requis |
|---|---|---|---|
| `windy` | **Venteux** | booléen | oui |

```yaml
action: espsomfy_rts_enhanced.set_windy
target:
  entity_id: cover.banne_terrasse
data:
  windy: true
```

### Priorité et entités associées

L'ordre « vent » est prioritaire sur l'ordre « soleil » : tant que le vent est signalé,
la logique soleil est neutralisée et l'équipement est ramené en position rentrée.

| Entité | Rôle |
|---|---|
| interrupteur **Capteur solaire** | arme ou désarme le suivi soleil du moteur, l'équivalent du drapeau soleil d'une télécommande |
| capteur binaire **Ensoleillement** | l'état soleil qu'ESPSomfy-RTS attribue à l'équipement |
| capteur binaire **Vent** | l'état vent qu'ESPSomfy-RTS attribue à l'équipement |

Le commutateur décide si le moteur a le droit de réagir au soleil, `set_sunny` lui dit
s'il y a du soleil. Voir [Entités](entites.md).

---

## Commandes brutes RTS

La porte de sortie quand aucune action dédiée ne couvre le besoin. Sur un groupe, la
trame part sous l'adresse du groupe.

### `send_command`

| Champ | Nom affiché | Type | Plage | Requis |
|---|---|---|---|---|
| `command` | **Commande** | liste | voir ci-dessous | oui |
| `repeat` | **Répétition** | entier | 0 à 50 | non |

```yaml
action: espsomfy_rts_enhanced.send_command
target:
  entity_id: cover.salon
data:
  command: My
  repeat: 3
```

| Commande | Effet |
|---|---|
| `Up` | montée |
| `Down` | descente |
| `My` | **à l'arrêt** : rejoint la position favorite. **En mouvement** : arrête l'équipement |
| `Stop` | arrêt |
| `Toggle` | bascule, pour les équipements à commande unique |
| `UpDown` | appui simultané montée + descente |
| `MyUp` | My + montée |
| `MyDown` | My + descente |
| `MyUpDown` | My + montée + descente |
| `Prog` | mode appairage du moteur |
| `StepUp` / `StepDown` | déplacement par palier (préférez `send_step_command`) |
| `Flag` | retire le drapeau soleil du moteur |
| `SunFlag` | pose le drapeau soleil du moteur |
| `Favorite` | va à la position favorite, trame dédiée des moteurs 80 bits |

!!! warning "`Favorite` et `My`"

    `Favorite` vise les moteurs en trame 80 bits. Sur un moteur RTS 56 bits classique,
    utilisez `My`.

!!! danger "`Prog`"

    `Prog` met le moteur en mode appairage. Ne l'utilisez jamais dans une automatisation
    périodique : une association involontaire est pénible à défaire.

#### Le cas particulier de `My`

`My` n'est pas « aller à la position favorite » en toutes circonstances : à l'arrêt,
l'équipement la rejoint ; en mouvement, il s'arrête sur place. C'est le comportement
d'une télécommande Somfy. Dans une automatisation, conditionnez l'envoi :

```yaml
conditions:
  - condition: template
    value_template: "{{ states('cover.salon') not in ['opening', 'closing'] }}"
```

Rien ne bouge non plus si aucune position favorite n'est enregistrée
(`my_pos` vaut alors `None`), ou si l'équipement s'y trouve déjà.

### `send_step_command`

Déplacement par palier, pour un réglage fin.

| Champ | Nom affiché | Type | Plage | Requis |
|---|---|---|---|---|
| `direction` | **Direction** | `Up` ou `Down` | — | oui |
| `step_size` | **Taille du pas** | entier | 1 à 127 | oui |
| `repeat` | **Répétition** | entier | 0 à 50 | non |

```yaml
action: espsomfy_rts_enhanced.send_step_command
target:
  entity_id: cover.veranda
data:
  direction: Down
  step_size: 20
```

### Le paramètre `repeat`

Chaque répétition est une trame de plus dans l'air. Augmenter `repeat` aide un équipement
éloigné, mais occupe la radio d'autant et retarde les commandes suivantes. Sans `repeat`,
ESPSomfy-RTS applique le nombre de répétitions réglé sur l'équipement ou le groupe.

---

## Plannings

Les plannings s'exécutent **sur l'appareil lui-même**, sans que Home Assistant soit
nécessaire. Chaque planning apparaît dans Home Assistant comme un interrupteur qui
l'active ou le désactive. Voir [Plannings](plannings.md).

### `create_schedule`

| Champ | Nom affiché | Valeurs | Défaut | Requis |
|---|---|---|---|---|
| `days` | **Jours** | `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun` (un ou plusieurs) | — | oui |
| `time_ref` | **Référence horaire** | `clock` (Heure fixe), `sunrise` (Lever du soleil), `sunset` (Coucher du soleil) | `clock` | non |
| `time` | **Heure** | heure, par exemple `"07:30:00"` | — | oui avec `clock` |
| `offset` | **Décalage** | −720 à 720 minutes, avant (négatif) ou après le lever ou le coucher | `0` | non |
| `action` | **Action** | `position` (Aller à une position), `my` (Aller à la position favorite (My)), `tilt_only` (Inclinaison seule) | `position` | non |
| `position` | **Position** | 0 à 100 | — | oui avec `position` |
| `tilt_position` | **Inclinaison** | 0 à 100 | — | oui avec `tilt_only` |
| `name` | **Nom** | texte | nom de l'équipement | non |
| `enabled` | **Actif** | booléen | `true` | non |

```yaml
action: espsomfy_rts_enhanced.create_schedule
target:
  entity_id: cover.salon
data:
  days: [mon, tue, wed, thu, fri]
  time_ref: sunrise
  offset: 15
  action: position
  position: 100
  name: Lever salon
response_variable: planning
```

L'action renvoie l'identifiant du planning créé, rangé sous l'identifiant de l'entité
visée :

```jinja
{{ planning['cover.salon'].schedule_id }}
```

| Refus | Motif |
|---|---|
| heure fixe sans `time` | « Un planning à heure fixe demande une heure. » |
| `position` sans valeur | « Aller à une position demande une position. » |
| `tilt_only` sans `tilt_position` | « L'inclinaison seule demande une inclinaison. » |
| nom trop long | l'appareil garde 20 caractères au plus, une lettre accentuée compte pour deux |
| groupe mêlant membres inversés et normaux | l'appareil leur enverrait la même valeur : créez un planning par équipement |
| firmware sans gestion des plannings | « Ce firmware ne permet pas de gérer les plannings depuis Home Assistant. » |

### `delete_schedule`

Supprime le planning sur l'appareil. Aucun paramètre : la cible est **l'interrupteur du
planning**, pas l'équipement.

```yaml
action: espsomfy_rts_enhanced.delete_schedule
target:
  entity_id: switch.lever_salon
```

---

## Services de l'appareil

Ces actions ciblent les boutons de l'appareil ESPSomfy-RTS (catégorie
« Configuration »), pas les équipements.

| Bouton | Accepte |
|---|---|
| `Redémarrer` | `reboot` |
| `Sauvegarder` | `backup`, `delete_backups` |
| `Télécharger la sauvegarde` | `backup`, `delete_backups` ; un appui propose en plus un lien de téléchargement |

!!! warning "Les identifiants des boutons suivent la langue"

    Home Assistant forme l'identifiant d'entité à partir du nom traduit : en français,
    on obtient par exemple `button.<appareil>_redemarrer`. Ne recopiez pas un identifiant
    anglais trouvé ailleurs : choisissez le bouton dans le sélecteur de l'éditeur, ou
    utilisez les [actions d'appareil](#actions-dappareil).

### `reboot`

Redémarre l'appareil. Aucun paramètre.

```yaml
action: espsomfy_rts_enhanced.reboot
target:
  entity_id: button.mon_appareil_redemarrer
```

Le redémarrage coupe la liaison : les entités de l'intégration passent indisponibles le
temps que l'appareil reparte, puis se rétablissent seules.

### `backup`

Télécharge la configuration de l'appareil et l'enregistre dans Home Assistant. Aucun
paramètre.

```yaml
action: espsomfy_rts_enhanced.backup
target:
  entity_id: button.mon_appareil_sauvegarder
```

Les **5 sauvegardes les plus récentes** sont gardées, les plus anciennes sont effacées à
chaque nouvelle sauvegarde. La sauvegarde automatique à jours et heure fixes se règle dans
le panneau **ESPSomfy RTS** de la barre latérale : voir
[Sauvegardes et mises à jour](sauvegardes-et-mises-a-jour.md).

### `delete_backups`

Efface les fichiers de sauvegarde de l'appareil gardés dans Home Assistant. L'appareil
lui-même n'est pas touché.

| Champ | Nom affiché | Type | Défaut | Requis |
|---|---|---|---|---|
| `keep` | **Conserver** | entier, 0 à 100 | `0` | non |

`keep` est le nombre de sauvegardes les plus récentes à garder ; **0 les efface toutes**.

```yaml
action: espsomfy_rts_enhanced.delete_backups
target:
  entity_id: button.mon_appareil_sauvegarder
data:
  keep: 2
```

### Actions d'appareil

Dans l'éditeur d'automatisations, **Ajouter une action → Appareil**, puis l'appareil
ESPSomfy-RTS, propose deux actions : **Reboot** et **Backup**. Elles visent le bon bouton
quel que soit son identifiant, ce qui les rend insensibles à la langue et aux renommages.
L'intégration ne fournit pas de déclencheur d'appareil.

---

## Actions sur un groupe { #actions-sur-un-groupe }

| Action | Sur un groupe |
|---|---|
| `open_shade` / `close_shade` | une seule trame pour le groupe ; sens inversé si **tous** les membres sont inversés ; membre par membre si le groupe mêle membres inversés et normaux |
| `stop_shade` | une trame d'arrêt, seulement si un membre bouge |
| `set_shade_position` | une seule requête si le firmware sait viser une position de groupe et qu'aucun membre n'est inversé ; sinon membre par membre |
| `tilt_open` / `tilt_close` / `set_tilt_position` | membre par membre |
| `set_sunny` / `set_windy` | trame capteur envoyée au groupe |
| `send_command` / `send_step_command` | trame sous l'adresse du groupe |
| `create_schedule` | accepté, sauf groupe mêlant membres inversés et normaux |
| `set_current_position` / `set_current_tilt_position` / `set_my_position` | **refusé** : « Cette action ne s'applique pas à un groupe » |

Un membre est dit inversé quand c'est un store banne ou que sa position est inversée dans
ses réglages.
