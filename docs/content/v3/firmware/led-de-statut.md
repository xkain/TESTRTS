# Témoin LED de statut

Configure le voyant d'état matériel de l'appareil. Depuis **Firmware**, le bouton
**Témoin LED de statut** ouvre cette fenêtre — voir [Firmware](index.md).

!!! note "Note"

    Si vous possédez l'un de mes [boîtiers officiels](../materiel/boitiers-officiels.md), tout ce qui suit
    jusqu'à **Témoin d'activité radio** ne vous concerne pas : la LED y est câblée en dur et
    **déjà activée par défaut**, rien à faire de votre côté. L'interface le sait — sur ces
    appareils, la section **Activer le témoin / Modèle de carte / Réglages manuels / LED
    active à l'état bas** ci-dessous ne s'affiche tout simplement **pas** dans la fenêtre : il
    n'y a ni broche ni polarité à choisir, puisqu'il n'y a rien à vous laisser casser sur ce
    point précis. Seul le réglage **Témoin d'activité radio**, plus bas, reste visible et
    réglable chez vous.

    Tout ce qui suit jusque-là s'adresse donc uniquement aux **cartes génériques**.

## Activer le témoin (cartes génériques)

Un commutateur active ou désactive totalement le témoin. L'activer sans avoir encore choisi
de broche le place sur un état intermédiaire (« Choisir une carte ou un GPIO… ») qui bloque
l'enregistrement tant qu'un choix explicite n'a pas été fait — pour éviter d'attribuer un
GPIO arbitraire dans votre dos.

## Modèle de carte

Une liste déroulante propose des préréglages pour les cartes les plus courantes, filtrée
pour n'afficher que celles compatibles avec la puce détectée sur votre appareil :

| Carte | Broche | Polarité |
|---|---|---|
| WT32-ETH01 | GPIO5 | Active à l'état bas |
| ESP32-D1 mini | GPIO2 | Active à l'état haut |
| XIAO ESP32-S3 | GPIO21 | Active à l'état bas |
| XIAO ESP32-C6 | GPIO15 | Active à l'état bas |

Choisir un préréglage renseigne automatiquement la broche et la polarité adaptées — pas
besoin de les connaître. L'option **Réglages manuels** affiche à la place un champ GPIO
libre (avec boutons +/-) et une case de confirmation (« Je comprends les risques d'une
mauvaise configuration des GPIO ») obligatoire pour enregistrer un choix manuel.

Un avertissement s'affiche en continu si le GPIO saisi est le 12 sur un ESP32 d'origine
(broche de strapping, cf. [Composants](../../commun/composants.md)) ; au moment d'enregistrer, un conflit
avec une broche déjà utilisée par la radio (CS/SCK/MOSI/MISO…) est aussi détecté et bloque
la sauvegarde avec un message nommant le propriétaire de la broche.

## LED active à l'état bas

À cocher si votre LED s'allume quand le GPIO est mis à l'état bas plutôt qu'à l'état haut —
la case se règle automatiquement à la bonne valeur si vous passez par un préréglage.

## Témoin d'activité radio

Indépendant de ce qui précède (visible même sur un boîtier officiel) : la LED clignote
brièvement à chaque trame RTS émise ou reçue par l'appareil — y compris les télécommandes du
voisinage captées à portée de l'antenne, pas seulement les vôtres. Dans un environnement
radio dense, le clignotement peut donc être plus fréquent qu'attendu.

!!! note "Note"

    Ce même témoin s'allume aussi pour une raison différente : chaque équipement ou groupe a
    sa propre option **Retour lumineux** (voir [EQUIPEMENTS](../somfy/equipements/index.md) et
    [GROUPES](../somfy/groupes/index.md))), qui fait clignoter cette LED à chaque commande envoyée
    depuis l'interface — indépendamment du réglage d'activité radio ci-dessus.

## Enregistrement

Un réglage de broche/polarité s'applique immédiatement, sans redémarrage — l'ancienne broche
est relâchée proprement. Dès qu'une broche est configurée (boîtier officiel ou carte
générique réglée ici), ce même témoin affiche aussi deux signaux supplémentaires en dehors
du fonctionnement normal, propres au mode de secours de l'appareil : voir
[Mode Récupération](../recuperation.md)#signal-visuel) pour leur signification.

