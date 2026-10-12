# Pièges et limites

## Le RTS est un protocole sans retour

Le moteur ne dit jamais où il est. Toutes les positions affichées sont **calculées** par
ESPSomfy-RTS à partir des durées de course configurées.

Une position peut donc dériver, en particulier après une coupure de courant ou une
manœuvre au bouton mural non captée par la radio.
[`set_current_position`](services.md#set_current_position) sert exactement à ça :
remettre en accord la position calculée et la position réelle, sans faire bouger le
moteur.

## `My` n'est pas « aller à MY » en toutes circonstances

À l'arrêt, oui. En mouvement, la commande arrête l'équipement sur place — c'est le
comportement natif d'une télécommande Somfy. Testez l'état avant d'envoyer la commande
dans une automatisation. Voir
[le cas particulier de `My`](services.md#le-cas-particulier-de-my).

## Aucun service ne permet de définir la position MY

L'intégration sait la lire (`my_pos`) et l'atteindre (`send_command: My`), pas l'écrire.

Pour la modifier, il faut passer par l'interface web d'ESPSomfy-RTS, ou par MQTT s'il est
activé :

```yaml
action: mqtt.publish
data:
  topic: "<racine>/shades/3/mypos/set"
  payload: "45"
```

La valeur est dans la convention ESPSomfy-RTS (0 = ouvert), et `-1` efface la position
favorite. Le même mécanisme existe pour l'inclinaison, sur le topic `myTiltPos/set`.

## Les groupes ne sont pas des équipements

Un groupe envoie une seule trame radio pour tous ses membres : c'est plus rapide et plus
fiable qu'une boucle sur chaque équipement, mais un groupe n'a ni position ni inclinaison
propre. Les services de positionnement n'ont de sens que sur les équipements.

Un groupe dont les membres n'ont pas tous la même convention de position (un store banne
mélangé à des volets, par exemple) est traité équipement par équipement : la trame unique
est alors perdue, et avec elle son avantage.

## `repeat` a un coût

Chaque répétition est une trame de plus dans l'air. Augmenter `repeat` aide sur un
équipement éloigné, mais monopolise la radio d'autant. Restez dans les valeurs basses sauf
raison précise.

## La convention de position s'inverse selon l'attribut

`current_position` suit la convention Home Assistant (0 = fermé), `target`, `my_pos`,
`tilt_target` et `my_tilt_pos` suivent celle d'ESPSomfy-RTS (0 = ouvert). C'est la source
d'erreur la plus courante dans les templates — voir
[Attributs en template](attributs.md#convention-de-position).

## Les attributs arrivent après l'entité

Un template exécuté dans la seconde qui suit le démarrage de Home Assistant peut recevoir
`None` là où il attend une position. Prévoyez toujours une valeur de repli.

## `Prog` déclenche le mode appairage

!!! danger
    À réserver strictement à l'association d'une télécommande. Une association
    involontaire se défait mal, et un `Prog` envoyé en boucle par une automatisation mal
    écrite peut désorganiser plusieurs moteurs à portée. À utiliser avec une extrême
    prudence.
