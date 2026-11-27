# Répéter une télécommande

Cette fenêtre ajoute une télécommande à la liste de celles qu'ESPSomfy-RTS réémet, pour un moteur
qui la capte mal. Elle s'ouvre depuis l'onglet [Répéteur](index.md#repeater) de la page Radio,
avec la carte **Capturer une télécommande à répéter**.

![Fenêtre Répéter une télécommande](v3/img/radio-fen-repeteur){ .on-glb }

À gauche (en haut sur téléphone), la fenêtre rappelle le nombre de **Télécommandes répétées** sur 7
et l'avertissement : seulement si le moteur capte mal une télécommande qu'ESPSomfy-RTS entend bien,
et jamais la même sur deux appareils, sous peine d'écho. Si la liste est déjà pleine, la fenêtre ne
s'ouvre pas : *La liste des répéteurs est pleine.*

## Écouter

L'écoute démarre dès l'ouverture et dure **30 secondes** : *Appuyez sur une touche de la
télécommande*. N'importe quelle touche, près de l'appareil ; la liaison se fait dès la première
trame. `Fermer` arrête l'écoute.

## Le résultat

![Fenêtre Répéter une télécommande, répéteur assigné](v3/img/radio-fen-repeteur-resultat){ .on-glb }

| Résultat | Ce qu'affiche la fenêtre | Que faire |
|---|---|---|
| **Répéteur assigné** | le protocole, le nombre de bits, l'adresse et le signal de la télécommande : *Les signaux de cette télécommande sont désormais répétés.* | `Fermer`, ou `Répéter une autre` |
| *Cette télécommande est déjà répétée.* | les mêmes informations | `Écouter une autre` relance l'écoute |
| *Aucune télécommande entendue* | *Vérifiez sa pile ou rapprochez-vous de l'appareil, puis réessayez.* | `Réessayer` |

La télécommande ajoutée apparaît aussitôt dans l'onglet Répéteur, où vous pouvez lui donner un nom
ou arrêter sa répétition. Rien d'autre à enregistrer : la répétition commence tout de suite.

Voir aussi l'avertissement [Une télécommande, un seul appareil répéteur](index.md#repeater).
