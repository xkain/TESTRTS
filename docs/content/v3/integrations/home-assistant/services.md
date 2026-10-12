# Services

Tous les services de l'intégration, avec leurs paramètres et des exemples.

| Famille | Services |
|---|---|
| [Mouvement et position](#services-de-mouvement-et-de-position) | `open_shade`, `close_shade`, `stop_shade`, `set_shade_position` |
| [Inclinaison](#inclinaison) | `tilt_open`, `tilt_close`, `set_tilt_position` |
| [Recalage de position](#recalage-de-position) | `set_current_position`, `set_current_tilt_position` |
| [Capteurs soleil et vent](#services-de-capteurs-soleil-et-vent) | `set_sunny`, `set_windy` |
| [Commandes brutes RTS](#services-de-commande-brute-rts) | `send_command`, `send_step_command` |
| [Services de l'appareil](#services-de-lappareil) | `reboot`, `backup` |

---

# Services de mouvement et de position

Tous ces services ciblent une entité `cover` — un équipement ou un groupe.

---

## Mouvement

### `open_shade` / `close_shade` / `stop_shade`

Aucun paramètre.

```yaml
action: espsomfy_rts_enhanced.open_shade
target:
  entity_id: cover.salon
```

Pour les équipements à bouton unique (portes de garage et portails à commande
« toggle »), les trois services envoient la même trame de bascule : c'est le moteur qui
décide du sens.

### `set_shade_position`

Envoie l'équipement à une position précise. ESPSomfy-RTS calcule la durée de course et
émet les trames nécessaires.

| Champ | Type | Plage | Requis |
|---|---|---|---|
| `position` | entier | 0 à 100 | oui |

```yaml
action: espsomfy_rts_enhanced.set_shade_position
target:
  entity_id: cover.salon
data:
  position: 40
```

`position` suit la convention Home Assistant : **0 = fermé, 100 = ouvert**. L'intégration
se charge de l'inversion vers la convention ESPSomfy-RTS, y compris pour les stores
bannes et les équipements dont l'option « position inversée » est active.

---

## Inclinaison

Ces services ne sont disponibles que sur les équipements déclarés avec une inclinaison
(lames orientables, stores vénitiens, moteurs à inclinaison intégrée).

### `tilt_open` / `tilt_close`

Aucun paramètre.

```yaml
action: espsomfy_rts_enhanced.tilt_close
target:
  entity_id: cover.veranda
```

### `set_tilt_position`

| Champ | Type | Plage | Requis |
|---|---|---|---|
| `tilt_position` | entier | 0 à 100 | oui |

```yaml
action: espsomfy_rts_enhanced.set_tilt_position
target:
  entity_id: cover.veranda
data:
  tilt_position: 75
```

---

## Recalage de position

Ces deux services **ne font pas bouger le moteur**. Ils corrigent la position
qu'ESPSomfy-RTS croit être la position courante. Utiles après une manœuvre manuelle, une
coupure de courant, ou une désynchronisation constatée — voir
[Pièges et limites](pieges-et-limites.md).

### `set_current_position`

| Champ | Type | Plage | Requis |
|---|---|---|---|
| `position` | entier | 0 à 100 | oui |

```yaml
action: espsomfy_rts_enhanced.set_current_position
target:
  entity_id: cover.salon
data:
  position: 100
```

### `set_current_tilt_position`

| Champ | Type | Plage | Requis |
|---|---|---|---|
| `tilt_position` | entier | 0 à 100 | oui |

```yaml
action: espsomfy_rts_enhanced.set_current_tilt_position
target:
  entity_id: cover.veranda
data:
  tilt_position: 0
```

---

# Services de capteurs soleil et vent

Ces services émettent les trames capteur du protocole RTS : ils **simulent un capteur
Somfy** (Sunis pour le soleil, Eolis pour le vent) auprès du moteur.

C'est ce qui permet de piloter le comportement automatique du moteur depuis n'importe
quelle source de données de Home Assistant — une station météo locale, un capteur de
luminosité, une prévision, un calcul d'azimut solaire. Le moteur, lui, croit recevoir
l'information d'un capteur Somfy et applique sa logique interne.

---

## `set_sunny`

| Champ | Type | Requis |
|---|---|---|
| `sunny` | booléen | oui |

```yaml
action: espsomfy_rts_enhanced.set_sunny
target:
  entity_id: cover.banne_terrasse
data:
  sunny: true
```

## `set_windy`

| Champ | Type | Requis |
|---|---|---|
| `windy` | booléen | oui |

```yaml
action: espsomfy_rts_enhanced.set_windy
target:
  entity_id: cover.banne_terrasse
data:
  windy: true
```

---

## Priorité entre les deux ordres

L'ordre « vent » est prioritaire sur l'ordre « soleil » : tant que la condition de vent
est posée, la logique soleil est neutralisée, et l'équipement est ramené en position
rentrée. Le suivi solaire ne reprend la main qu'une fois la condition de vent levée.

## Le commutateur « Capteur solaire »

En parallèle de ces services, l'intégration expose une entité `switch` **Capteur
solaire** par équipement et par groupe concerné. Elle ne transmet pas une mesure : elle
arme ou désarme le suivi soleil du moteur — l'équivalent du drapeau soleil d'une
télécommande Somfy.

Les deux mécanismes se complètent : le commutateur décide si le moteur a le droit de
réagir au soleil, `set_sunny` lui dit s'il y a du soleil.

## Les capteurs binaires

Les entités `binary_sensor` **Ensoleillement** et **Vent** reflètent en retour l'état
qu'ESPSomfy-RTS attribue à l'équipement. Elles sont utilisables comme déclencheur ou
comme condition dans une automatisation.

---

# Services de commande brute RTS

Ces deux services envoient directement une trame du protocole RTS. C'est la porte de
sortie quand aucun service dédié ne couvre le besoin.

---

## `send_command`

| Champ | Type | Plage | Requis |
|---|---|---|---|
| `command` | chaîne | voir le tableau ci-dessous | oui |
| `repeat` | entier | 0 à 50 | non |

```yaml
action: espsomfy_rts_enhanced.send_command
target:
  entity_id: cover.salon
data:
  command: My
  repeat: 3
```

### Commandes acceptées

| Commande | Effet |
|---|---|
| `Up` | montée |
| `Down` | descente |
| `My` | **à l'arrêt** : rejoint la position favorite MY. **En mouvement** : agit comme un arrêt |
| `Stop` | arrêt franc (trame 80 bits) |
| `Toggle` | bascule ouvert / fermé selon le dernier sens de déplacement |
| `UpDown` | appui simultané montée + descente |
| `MyUp` | MY + montée |
| `MyDown` | MY + descente |
| `MyUpDown` | MY + montée + descente |
| `Prog` | mode appairage — à réserver à l'association d'une télécommande |
| `StepUp` / `StepDown` | déplacement par palier (préférer `send_step_command`) |
| `Flag` | retire le drapeau soleil du moteur |
| `SunFlag` | pose le drapeau soleil du moteur |
| `Favorite` | va à la position favorite, trame dédiée 80 bits |

!!! warning
    **`Favorite`** n'a de sens que pour les moteurs en trame 80 bits. Sur un moteur RTS
    56 bits classique, c'est `My` qu'il faut utiliser.

!!! danger
    **`Prog`** déclenche le mode appairage du moteur. Ne l'utilisez pas dans une
    automatisation périodique : une association involontaire est pénible à défaire.

### Le cas particulier de `My`

`My` n'est pas « aller à MY » en toutes circonstances :

- équipement **à l'arrêt** → il rejoint la position favorite ;
- équipement **en mouvement** → la commande l'arrête sur place.

C'est le comportement natif d'une télécommande Somfy, pas une limite de l'intégration.
Dans une automatisation, conditionnez l'envoi :

```yaml
conditions:
  - condition: template
    value_template: "{{ states('cover.salon') not in ['opening', 'closing'] }}"
```

Rien ne part non plus si aucune position favorite n'est enregistrée, ou si l'équipement
s'y trouve déjà. La position favorite se lit dans l'attribut `my_pos` :

```jinja
{{ state_attr('cover.salon', 'my_pos') }}
```

Voir [Attributs en template](attributs.md) pour la convention de valeur et les cas
particuliers.

---

## `send_step_command`

Déplacement par palier, pour un réglage fin.

| Champ | Type | Plage | Requis |
|---|---|---|---|
| `direction` | `Up` ou `Down` | — | oui |
| `step_size` | entier | 1 à 127 | oui |
| `repeat` | entier | 0 à 50 | non |

```yaml
action: espsomfy_rts_enhanced.send_step_command
target:
  entity_id: cover.veranda
data:
  direction: Down
  step_size: 20
```

---

## Le paramètre `repeat`

Chaque répétition est une trame de plus dans l'air. Augmenter `repeat` aide sur un
équipement éloigné ou dans un environnement radio chargé, mais monopolise la radio
d'autant et retarde les commandes suivantes. Restez dans les valeurs basses sauf raison
précise.

Sans `repeat`, ESPSomfy-RTS applique la valeur configurée pour l'équipement.

---

# Services de l'appareil

Ces deux services ciblent les entités `button` de l'appareil ESPSomfy-RTS, pas les
équipements. Les entités correspondantes sont classées en catégorie « Configuration ».

---

## `reboot`

Redémarre l'appareil. Aucun paramètre.

```yaml
action: espsomfy_rts_enhanced.reboot
target:
  entity_id: button.espsomfy_rts_reboot
```

Le redémarrage coupe la liaison WebSocket : toutes les entités de l'intégration passent
indisponibles le temps que l'appareil reparte, puis se rétablissent seules.

---

## `backup`

Télécharge la configuration de l'appareil et l'enregistre dans le répertoire de
configuration de Home Assistant, sous `ESPSomfyRTS_<identifiant du serveur>/`, dans un
fichier horodaté `AAAA-MM-JJTHH_MM_SS.backup`.

```yaml
action: espsomfy_rts_enhanced.backup
target:
  entity_id: button.espsomfy_rts_backup
```

La sauvegarde couvre l'intégralité de la configuration : pièces, équipements, groupes,
répéteur, adresses de télécommande, codes tournants, réglages de l'émetteur-récepteur,
réglages généraux et réseau. C'est ce qui permet de reconstruire une installation sans
réappairer chaque moteur.

Une sauvegarde périodique est un bon réflexe — voir la recette dans
[Recettes d'automatisation](automatisations.md#sauvegarde-périodique-de-la-configuration).

---

## L'entité de mise à jour

En complément des deux services, l'entité `update` **Micrologiciel** permet de mettre à
jour le firmware depuis l'interface de Home Assistant, avec les notes de version
affichées avant installation.

Le bouton d'installation ne s'active que si l'appareil confirme deux conditions : la
recherche de mise à jour est activée dans ses réglages, et il dispose d'un accès
Internet. Si le bouton reste grisé alors qu'une version plus récente existe, c'est l'un
de ces deux points qu'il faut vérifier.

L'option de sauvegarde proposée par Home Assistant au moment de l'installation déclenche
la même sauvegarde que le service `backup`.
