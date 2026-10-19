---
title: Boîtiers officiels
hide:
  - toc
---

# Boîtiers officiels ESPSomfy-RTS

Piloter ses volets, stores, portes de garage ou portails Somfy RTS sans être
bricoleur, c'est possible. Je propose à la vente des boîtiers officiels,
**livrés entièrement préconfigurés et testés** : vous les branchez, vous les
connectez à votre réseau, et il ne reste plus qu'à ajouter vos équipements
(et, au besoin, à ajuster la fréquence radio).

Avec le firmware **v3.0.0**, le boîtier est reconnu nativement : l'interface est
simplifiée pour vous.

[Voir les boîtiers](https://www.leboncoin.fr/profile/77a39e2a-ddb5-44c8-828a-954652c46ee7){ .md-button .md-button--primary }
[Fiche technique](../v3/materiel/boitiers-officiels.md){ .md-button }

## Prêt à l'emploi, vraiment

Un boîtier officiel est pensé pour qu'on n'ait **rien à configurer** :

<div class="grid cards" markdown>

-   :material-chip:{ .lg .middle } **Aucune broche (GPIO) à régler**

    ---

    L'assignation des broches de la radio est déjà faite : pas de carte à
    choisir dans les menus, pas de schéma à consulter.

-   :material-auto-fix:{ .lg .middle } **Aucun assistant à lancer**

    ---

    Depuis la v3.0.0, il n'y a plus d'assistant de préconfiguration à passer
    après coup : tout est natif pour votre boîtier, l'interface est donc
    simplifiée.

-   :material-translate:{ .lg .middle } **Déjà à votre heure et en français**

    ---

    Interface en français, fuseau horaire Europe/Paris. Rien à corriger au
    premier démarrage.

-   :material-ethernet-cable:{ .lg .middle } **Ethernet sans réglage**

    ---

    Sur l'édition Ethernet & Wi-Fi, le type de carte est déjà connu : vous
    n'avez rien à sélectionner pour activer la connexion filaire.

</div>

Au premier démarrage, il ne reste que le réseau : un assistant de connexion vous
guide, puis vous pouvez
[configurer vos équipements](../v3/somfy/equipements/index.md).

## Deux éditions

<div class="rts-editions" markdown>

<div class="rts-edition" markdown>

### Édition Wi-Fi

<div class="rts-photo" markdown>

![Intérieur du boîtier Wi-Fi](v3/img/boitiers-officiels-7)

<div class="rts-photo__thumbs" markdown>

![Boîtier Wi-Fi, façade en treillis](boitiers/img/boitiers-officiels-1){ .on-glb }
![Boîtier Wi-Fi, façade en vagues](boitiers/img/boitiers-officiels-2){ .on-glb }
![Boîtier Wi-Fi, façade à fentes obliques](boitiers/img/boitiers-officiels-3){ .on-glb }
![Boîtier Wi-Fi, façade à motifs triangulaires](boitiers/img/boitiers-officiels-4){ .on-glb }
![Boîtier Wi-Fi, façade lisse](boitiers/img/boitiers-officiels-5){ .on-glb }

</div>

</div>

- ESP32 D1 Mini
- Module radio E07-M1101D-SMA (CC1101)
- Antenne 3 dBi amovible
- Circuit imprimé (PCB) développé sur mesure
- Flash direct sans manipulation
- USB-C
- Voyant d'état intégré, **bleu**

</div>

<div class="rts-edition" markdown>

### Édition Ethernet & Wi-Fi

<div class="rts-photo" markdown>

![Intérieur du boîtier Ethernet & Wi-Fi](v3/img/boitiers-officiels-8)

<div class="rts-photo__thumbs" markdown>

![Boîtier Ethernet & Wi-Fi, façade à croix gravée](boitiers/img/boitiers-officiels-6){ .on-glb }

</div>

</div>

- ESP32 WT32-ETH01
- Module radio E07-M1101D-SMA (CC1101)
- Antenne 3 dBi amovible
- Circuit imprimé (PCB) développé sur mesure
- Flash par un petit bouton sous le boîtier
- USB-C
- Voyant d'état intégré, **vert**
- Ethernet, avec un secours Wi-Fi possible : si le câble est coupé, le boîtier
  bascule sur votre réseau Wi-Fi

</div>

</div>

Le détail du matériel et des broches est sur la page
[Composants](../commun/composants.md).

## Quelle version a mon boîtier ?

Une méthode simple vous renseigne : **branchez votre boîtier et regardez son
voyant d'état**.

- **Le voyant s'allume pendant cinq secondes** : votre boîtier est en
  **v3.x et +**. Sa couleur dépend de l'édition :

  | Votre boîtier | Voyant en v3.x et + |
  |---|---|
  | Édition Wi-Fi | **Bleu** |
  | Édition Ethernet & Wi-Fi | **Vert** |

- **Le voyant ne s'allume pas** : votre boîtier est en **v2.x.x**.

Vous pouvez aussi lire la version dans l'interface, sous **Système → Firmware**,
ou sur la page de connexion.

Un boîtier en v2.x.x peut passer en v3 : voir
[Passer de la v2 à la v3](../v3/migration.md). En attendant, sa fiche est la
[fiche v2.x](../v2/materiel/boitiers-preassembles.md).

## Bien alimenter son boîtier

Utilisez de préférence un chargeur de téléphone stable, d'au moins 1 A pour l'édition Wi-fi. 
Pour l'édition Ethernet & Wi-Fi, un chargeur stable et de bonne qualité d'au moins
1,5 A : le WT32-ETH01 supporte mal les micro-coupures et les sous-tensions. Vous
pouvez aussi brancher le boîtier sur un port USB (box, TV, ordinateur).

## Où les trouver

Je vends les boîtiers **exclusivement en France**. Mes annonces en cours sont
accessibles depuis le bouton ci-dessous.

[Voir les boîtiers](https://www.leboncoin.fr/profile/77a39e2a-ddb5-44c8-828a-954652c46ee7){ .md-button .md-button--primary }

!!! tip "Un achat qui fait avancer le projet"

    Chaque boîtier acheté soutient directement mon travail de développement sur
    ESPSomfy-RTS. Merci à celles et ceux qui font ce choix.
