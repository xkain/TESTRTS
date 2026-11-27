# Pièges et limites

## Le RTS est un protocole sans retour

Le moteur ne dit jamais où il est. Toutes les positions affichées sont **calculées** par
ESPSomfy-RTS à partir des durées de course configurées.

Une position peut donc dériver, en particulier après une coupure de courant ou une
manœuvre au bouton mural non captée par la radio.
[`set_current_position`](services.md#set_current_position) sert exactement à ça :
remettre en accord la position calculée et la position réelle, sans faire bouger le
moteur.

## Une consigne égale à la position courante n'émet rien

Demander à un équipement la position qu'ESPSomfy-RTS lui attribue déjà n'envoie aucune
trame, sans erreur ni message : l'action réussit, rien ne bouge. Si l'équipement n'est pas
réellement à cette position, c'est la position calculée qui a dérivé : recalez-la d'abord.

## `stop_shade` ne fait rien à l'arrêt

Sur un moteur Somfy, l'arrêt et la position favorite partagent la touche My : un ordre
d'arrêt envoyé à un équipement immobile l'enverrait à sa position favorite. L'intégration
n'émet donc rien quand l'équipement (ou, pour un groupe, chacun de ses membres) est à
l'arrêt. Pour rejoindre la position favorite, utilisez `send_command` avec `My`.

## `My` n'est pas « aller à la position favorite » en toutes circonstances

À l'arrêt, oui. En mouvement, la commande arrête l'équipement sur place : c'est le
comportement d'une télécommande Somfy. Testez l'état avant d'envoyer la commande dans une
automatisation, voir
[le cas particulier de `My`](services.md#le-cas-particulier-de-my).

## La position favorite : même valeur = effacement

[`set_my_position`](services.md#set_my_position) mémorise une position favorite, comme un
appui long sur My. Comme sur la télécommande, redemander la position favorite **déjà
enregistrée** l'efface. Rien n'est mémorisé non plus si l'équipement est en mouvement.

## Ce qu'un groupe refuse

Un groupe accepte le mouvement, la position, l'inclinaison, le soleil, le vent, les
commandes brutes et les plannings. Il refuse ce qui n'a de sens que pour un équipement :

| Action | Sur un groupe |
|---|---|
| `set_current_position` | refusée |
| `set_current_tilt_position` | refusée |
| `set_my_position` | refusée |
| `create_schedule` | refusée si le groupe mêle membres inversés et normaux |

Le message est « Cette action ne s'applique pas à un groupe » ; pour le planning,
l'appareil enverrait la même valeur à des membres qui la lisent en sens contraire :
créez un planning par équipement. Un membre est inversé quand c'est un store banne ou que
sa position est inversée dans ses réglages.

## Un groupe mixte perd sa trame unique

Un groupe dont tous les membres partagent la même convention reçoit une seule trame (ou
une seule requête de position, si le firmware le permet) : c'est rapide et tous les
membres partent ensemble. Un groupe qui mêle membres inversés et normaux est piloté
**membre par membre** pour l'ouverture, la fermeture et la position : une requête et une
trame par équipement, au lieu d'une seule pour tout le groupe. Voir [Actions sur un groupe](services.md#actions-sur-un-groupe).

## Les identifiants des boutons suivent la langue

Home Assistant forme l'identifiant d'entité des boutons de l'appareil à partir de leur
nom traduit : en français, `button.<appareil>_redemarrer`, `button.<appareil>_sauvegarder`.
Un exemple trouvé ailleurs, écrit pour une installation en anglais, vise une entité qui
n'existe pas chez vous. Choisissez le bouton dans le sélecteur de l'éditeur, ou utilisez
les actions d'appareil **Reboot** et **Backup**, qui ne dépendent pas de l'identifiant.

## Les actions d'inclinaison ne vérifient pas l'équipement

`tilt_open`, `tilt_close` et `set_tilt_position` sont proposées pour tous les équipements,
qu'ils aient une inclinaison ou non. Réservez-les aux équipements déclarés avec des lames
orientables.

## Attributs : convention et valeur absente

`target`, `my_pos`, `tilt_target` et `my_tilt_pos` suivent la même convention que
`current_position` (100 = ouvert) : on les compare directement, sans conversion. Ils valent
`None` quand aucune position favorite n'est enregistrée ; testez-les avec `is none` ou
`is not none`. Voir [Attributs](attributs.md).

## Les attributs arrivent après l'entité

Dans les secondes qui suivent le démarrage de Home Assistant, ou avant les premières
nouvelles de l'appareil, un attribut peut être absent : `state_attr` renvoie alors `None`.
Un template qui attend une position doit le prévoir.

## `repeat` a un coût

Chaque répétition est une trame de plus dans l'air. Augmenter `repeat` aide un équipement
éloigné, mais occupe la radio d'autant. Restez dans les valeurs basses sauf raison
précise.

## Les sauvegardes gardées sont limitées à 5

Chaque sauvegarde efface les plus anciennes au-delà des 5 plus récentes : une sauvegarde
à conserver durablement doit être téléchargée ou copiée ailleurs. `delete_backups` efface
les fichiers gardés dans Home Assistant, jamais la configuration de l'appareil. Voir
[Sauvegardes et mises à jour](sauvegardes-et-mises-a-jour.md).

## `Prog` déclenche le mode appairage

!!! danger "À réserver à l'association d'une télécommande"

    Une association involontaire se défait mal, et un `Prog` envoyé en boucle par une
    automatisation mal écrite peut désorganiser plusieurs moteurs à portée.
