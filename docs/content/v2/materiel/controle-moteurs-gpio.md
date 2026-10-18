# Contrôle des moteurs avec GPIO

ESPSomfy-RTS permet de piloter des moteurs via les broches GPIO, que ce soit en utilisant des relais externes ou en modifiant une télécommande existante ("dissected remote"). Cette configuration vous permet de mélanger des moteurs radio avec des moteurs filaires contrôlés par relais ou déclenchés depuis une télécommande non supportée. Vous pouvez utiliser n'importe quelle broche de sortie libre sur votre ESP32 pour commander la montée ou la descente.

# Protocole IO-Relay
En plus des protocoles radio, ESPSomfy-RTS supporte deux protocoles GPIO distincts. Si vous avez acheté des moteurs "nus" sans contrôleur, vous pouvez simplement les déclencher à l'aide d'une paire de relais.

!!! important "Important"

    Ne pas confondre `Protocole IO-Relay` avec le `Protocole IO` ce sont deux choses complètement différentes

## Fonctionnement
En sélectionnant IO-Relay comme protocole de moteur, ESPSomfy RTS alimentera la broche sélectionnée pour le haut ou le bas selon la direction souhaitée. Lorsque la position cible est atteinte, la broche est automatiquement mise hors tension.

* **Logique de mouvement** : L'ESP32 active (pull high) la broche de montée pour bouger vers le haut et la broche de descente pour le bas. Au repos, les deux broches sont désactivées (pull low).
* **Identique au Radio** : Dans cette configuration, les moteurs fonctionnent comme s'ils étaient pilotés par radio. Toutes les fonctions, comme la touche "My", fonctionnent parfaitement. Même le positionnement est supporté !
* **Interopérabilité** : Si vous avez un canal libre sur une télécommande radio, vous pouvez même le lier pour déplacer ce moteur non-radio. Vous pouvez également lier ce moteur à un capteur de soleil ou de vent.

## Configuration

Sélectionnez le protocole IO-Relay pour le volet (Shade). Deux menus déroulants apparaîtront pour choisir les broches des relais Haut et Bas.

* **Timing** : N'oubliez pas de régler vos temps de course afin que le moteur sache quand s'arrêter, surtout si vous n'avez pas de commutateurs de fin de course.
* **Contact Sec (Dry Contact)** : Si le type est "Dry Contact", ESPSomfy RTS basculera simplement le relais (On/Off). Utile pour ajouter des interrupteurs simples (une seule broche utilisée).

<img width="100%" src="../img/controle-des-moteurs-avec-gpio-1.png" />

!!! note "Note"

    Seule une broche est activée à la fois pour garantir qu'aucune commande contradictoire ne parvienne au moteur. La durée d'activation est déterminée par vos réglages de temps de montée/descente (pratique si votre moteur est plus lent à monter qu'à descendre).
   

# Protocole IO-Remote
Si vous possédez un protocole radio non supporté, vous pouvez ajouter votre propre support en disséquant une télécommande d'origine. ESPSomfy-RTS simulera alors les pressions sur les boutons Haut, Bas et My.

!!! important "Important"

    Ne pas confondre `Protocole IO-Remote` avec le `Protocole IO` ce sont deux choses complètement différentes

## Fonctionnement
Comme pour le protocole IO-Relay, toutes les fonctions restent disponibles. Cependant, comme vous ne recevez pas de retour d'état du moteur pendant son fonctionnement, vous ne pouvez contrôler le moteur que via l'interface ESPSomfy-RTS pour garantir la précision.

## Configuration
Sélectionnez IO-Remote. Selon le nombre de boutons de la télécommande que vous émulez, vous aurez entre 1 et 3 sélections de broches. Par exemple, un contact sec ou une porte de garage à un seul bouton n'affichera que la broche "Down".

<img width="100%" src="../img/controle-des-moteurs-avec-gpio-2-clair.webp#only-light" /><img width="100%" src="../img/controle-des-moteurs-avec-gpio-2-sombre.webp#only-dark" />

!!! note "Note"

    Il est recommandé de faire quelques recherches sur le web pour le câblage. Beaucoup de télécommandes fonctionnent parfaitement si elles sont alimentées par les broches 3.3V de l'ESP32. La broche centrale du bouton est ensuite connectée à la broche fournie pour les boutons `haut`, `bas` et/ou `my` boutons.




