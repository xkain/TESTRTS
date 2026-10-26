# Balayage de fréquence

![balayage de frequence](v3/img/balayage-de-frequence){ .on-glb }

Un bouton des **Réglages avancés** de [Configurer la radio](index.md#réglages-avancés) lance
le **balayage** : il écoute toute la bande 433 MHz et repère la fréquence à laquelle vos
télécommandes émettent réellement. C'est l'outil de **balayage manuel** : un relevé RSSI brut sur
toute la bande, que vous lisez et appliquez vous-même. Pour le même résultat sans avoir à
interpréter quoi que ce soit, voir le [test des télécommandes](assistant-de-reglages.md) ; pour
le reste du diagnostic radio, voir [Dépannage radio](depannage.md).

## Lancer le balayage

Le bouton ouvre une fenêtre **« Balayage Radio »** qui démarre immédiatement : *« Appuyez et
maintenez n'importe quel bouton de votre télécommande et ESPSomfy-RTS trouvera la fréquence la
plus proche de la télécommande »*. Deux cartes affichées côte à côte, mises à jour en direct
pendant tout le balayage :

* **Balayage Actuel** : la fréquence que le CC1101 est en train d'écouter à cet instant précis
    (le balayage parcourt toute la bande en continu, pas à pas), et son RSSI.
* **Fréquence Optimale** : la fréquence qui a donné le **meilleur** RSSI depuis le début de ce
    balayage, et sa valeur. C'est elle qui vous intéresse — maintenez votre télécommande
    enfoncée assez longtemps pour que le balayage la croise et que cette carte se stabilise.

Un graphique à part (*« Visualiser le signal en temps réel »*, replié par défaut) trace le
RSSI mesuré pas à pas — pratique pour voir le pic se dessiner plutôt que ne lire que le
chiffre.

!!! tip "Astuce"

    Ne collez pas la télécommande contre l'antenne de l'appareil : à bout portant, le récepteur
    peut saturer et fausser la mesure. Restez à environ un mètre, comme pour le
    [test des télécommandes](assistant-de-reglages.md).

## Comprendre le RSSI affiché

Une seconde section dépliable (*« Comprendre le signal (RSSI) »*) rappelle les trois zones :

| Zone | RSSI | Signification |
|---|---|---|
| 🟢 Excellent | -30 à -60 dBm | Connexion parfaite |
| 🟡 Faible | -70 à -85 dBm | Risque de pertes de commandes |
| 🔴 Bruit | -90 à -110 dBm | Signal instable ou hors de portée |

## Appliquer le résultat

1. **Arrêter le balayage** fige les deux cartes sur leur dernière valeur.
2. Si une fréquence a été trouvée, le bouton **Définir la fréquence** apparaît : il recopie la
    valeur de la carte *Fréquence Optimale* dans le champ **Fréquence de base** des **Réglages avancés**,
    puis referme la fenêtre. Si rien n'a été capté (*« Aucun signal détecté »*), ce bouton reste
    masqué — relancez le balayage (**Démarrer**) et réessayez, télécommande plus proche ou pile
    neuve.
3. **La fréquence n'est pas encore enregistrée sur l'appareil à ce stade** : il reste à cliquer
    sur **Enregistrer** en bas de la page **Radio → Configuration**, comme pour tout autre
    changement des **Réglages avancés**.

!!! note "Note"

    Fermer la fenêtre pendant qu'un balayage est en cours redemande confirmation — l'interrompre
    à mi-chemin ne garde aucune mesure utilisable, autant le savoir avant de perdre la carte
    *Fréquence Optimale* en train de se construire.

## Une seule fréquence, pas plusieurs télécommandes

Cet outil relève **une** fréquence à la fois : si vous avez plusieurs télécommandes qui
n'émettent pas toutes exactement sur la même fréquence, le balayer télécommande par
télécommande puis choisir une valeur ne donnera qu'un compromis approximatif. Le
[test des télécommandes](assistant-de-reglages.md) a précisément été conçu pour ce cas : il
mesure chaque télécommande séparément et calcule lui-même la fréquence centrale et la largeur
de bande qui les couvre toutes, plutôt que de vous laisser deviner.

