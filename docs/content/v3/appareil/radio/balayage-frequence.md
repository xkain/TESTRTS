# Balayage de fréquence

Le balayage parcourt la bande 433 MHz pendant que vous maintenez un bouton de votre télécommande,
et retient la fréquence où ESPSomfy-RTS l'entend le mieux. Il s'ouvre depuis l'onglet
[Réception](index.md#reception) de la page Radio : `Réglages manuels`, puis
`Ouvrir le balayage…` dans la tuile **Balayage en direct**. Il ne change que la **fréquence
d'écoute**, jamais celle d'émission.

![Balayage de la bande](v3/img/radio-balayage){ .on-glb }

Pour plusieurs télécommandes à la fois, sans rien interpréter, préférez le
[test des télécommandes](assistant-de-reglages.md).

## Le bandeau

Le bandeau, à gauche sur ordinateur et en haut de la page sur tablette et téléphone, rappelle la
fréquence d'**Écoute actuelle** et la **Fenêtre d'écoute actuelle** (± la moitié de la largeur de
bande), puis une légende pour **Lire le signal** :

| Couleur | Signal | Sens |
|---|---|---|
| Vert | −30 à −60 dBm | Excellent |
| Orange | −60 à −90 dBm | Faible |
| Gris | sous −90 dBm | Bruit |

## Lancer le balayage

`Commencer` démarre le balayage : *Balayage en cours · 433.00 – 434.00 MHz*. Gardez le bouton de la
télécommande enfoncé, à un mètre environ ; s'il s'arrête, relâchez et réappuyez. Ne collez pas la
télécommande contre l'antenne : à bout portant, le récepteur sature et fausse la mesure.

Pendant le balayage :

* **Fréquence balayée** : celle que la radio écoute à cet instant, et son signal ;
* **Meilleur signal** : la fréquence qui a donné le meilleur signal depuis le début, celle qui vous
  intéresse ;
* le graphique **Signal reçu sur la bande** trace le signal mesuré, avec la fenêtre d'écoute
  actuelle en fond et la position du balayage ; le numéro de passe s'affiche au-dessus.

`Arrêter le balayage` y met fin. Si vous quittez la page pendant un balayage, un message
*Balayage en cours* propose de `Voir` la page ou d'`Arrêter`.

## Appliquer le résultat

| Résultat | Ce que propose la page |
|---|---|
| *Entendue au mieux à … MHz*, avec le signal reçu | `Écouter à …` recopie cette fréquence dans la **Fréquence d'écoute** de l'onglet Réception et y retourne. La fréquence retenue est marquée sur le graphique |
| *Aucun signal détecté* | maintenez le bouton enfoncé, approchez-vous et vérifiez la pile, puis `Relancer` |

La fréquence recopiée **n'est pas encore enregistrée** : `Enregistrer`, dans la barre en bas de la
page Radio, l'applique.

## Une seule télécommande à la fois

Le balayage relève **une** fréquence. Si vos télécommandes n'émettent pas toutes sur la même,
les balayer une à une puis choisir une valeur ne donne qu'un compromis. Le
[test des télécommandes](assistant-de-reglages.md) mesure chacune et calcule lui-même une fenêtre
d'écoute qui les couvre toutes.
