# Télécommande virtuelle

La **Télécommande Virtuelle** permet de piloter un équipement ou un groupe depuis
l'interface exactement comme avec une télécommande physique — combinaisons dédiées, pression
maintenue, simulation de capteurs comprises.

Elle s'ouvre par l'icône télécommande des listes, ou par le bouton **Télécommande** de la carte
**dépliée** d'un équipement ou d'un groupe sur le [tableau de bord](../tableau-de-bord.md).

### Pourquoi l'utiliser ?

Indispensable si vous n'avez aucune télécommande physique sous la main. Elle permet de :

* **Appairer un moteur neuf** ou réinitialisé (Factory Reset).
* **Régler les fins de course** du moteur grâce à ses commandes dédiées.
* **Ajouter d'autres télécommandes** physiques à votre installation.
* **Simuler des capteurs** comme les dispositifs Sunis ou Eolis.

### Où la trouver

Ce n'est plus un onglet séparé avec un sélecteur d'équipement : l'icône télécommande, sur la
carte de n'importe quel **équipement** ou **groupe** du tableau de bord, ouvre directement sa
télécommande virtuelle — déjà ciblée sur cet élément précis, sans manipulation
supplémentaire. Les groupes sont pilotables au même titre que les équipements individuels.

### Les commandes disponibles

L'ensemble des commandes qui apparaissent dépend du type de l'équipement ciblé — voir plus
bas.

* **La molette** : flèches Haut/Bas, et un bouton central dont le rôle change selon le
    contexte — **Stop** en mouvement, **Ma Position (My)** à l'arrêt, ou **Actionner** pour un
    équipement à bouton unique (garage, portail ou interrupteur 1 bouton). Il n'y a plus de
    bouton Stop séparé : c'est désormais ce même bouton central qui en tient lieu.
* **Prog** : ouvre la mémoire du moteur, pour l'appairage.
* **Combinaisons dédiées** : My + Monter, My + Descendre, Monter + Descendre, Monter + My +
    Descendre. Ce sont des **boutons distincts**, pas deux boutons à presser simultanément —
    chacun envoie une seule trame radio portant un code de commande combiné, comme le ferait
    réellement une télécommande physique.
* **Indicateur soleil** : un même bouton bascule entre Activer et Désactiver le drapeau
    soleil du moteur.
* **Favori** et **Pas (Step)** : réservés aux moteurs **80-bit** — un curseur règle la taille
    du pas (1 à 127) utilisé par les boutons Monter/Descendre par pas.
* **Inclinaison** : une rangée Haut/My/Bas dédiée à l'inclinaison apparaît pour les
    équipements à mécanisme d'inclinaison motorisé.
* **Simulation de capteur** : deux cases **Soleil** / **Vent**, plus un bouton **Envoyer** —
    voir plus bas.

### Comportement selon le type d'équipement

L'affichage s'adapte automatiquement au type de l'équipement ciblé (ou, pour un groupe, à ce
que tous ses membres ont en commun) :

| Type d'équipement | Ce qui s'affiche |
|---|---|
| Équipement normal (store, volet, rideau…) | Molette complète + combinaisons |
| Store vénitien / mécanisme à inclinaison | Molette complète + rangée Inclinaison |
| Garage/Portail 1 bouton, Interrupteur 1 bouton | Pas de flèches Haut/Bas : le bouton central devient **Actionner** |
| Interrupteur 2 boutons | Seulement Haut/Bas — pas de My, pas de combinaisons, pas de capteurs |

### Pression maintenue

Ce n'est pas une détection de durée (pas d'appui long chronométré) : maintenir un bouton
enfoncé **répète la commande** tant qu'il reste pressé — exactement comme une télécommande
physique qu'on maintient. Ce mécanisme s'applique à **tous** les boutons de commande (Prog
compris), à l'exception des commandes d'inclinaison, qui n'envoient qu'une seule pression à
la fois. Une coupure de sécurité à 15 secondes arrête la répétition si le relâchement du
bouton n'a pas été détecté (par exemple en quittant la fenêtre avec le bouton enfoncé).

### Simuler un capteur solaire ou de vent

Les cases **Soleil** et **Vent**, suivies du bouton **Envoyer**, simulent la réception d'une
trame de capteur Sunis (soleil) ou Eolis (vent) — ce qui permet à l'équipement de réagir
exactement comme s'il recevait l'information d'un vrai capteur Somfy. L'état affiché reflète
l'état réel de l'équipement à l'ouverture de la fenêtre, pas une valeur mémorisée.

### Scénario : configuration sans télécommande physique

Si vous partez de zéro avec un moteur vierge :

1. Réinitialisez votre moteur (procédure constructeur).
2. Créez l'équipement dans l'onglet [EQUIPEMENTS](equipements/index.md).
3. Ouvrez sa télécommande virtuelle depuis l'icône télécommande de sa carte.
4. Utilisez les boutons virtuels pour réaliser la procédure d'appairage et le réglage des
    limites, comme vous le feriez avec une télécommande Telis ou Situo.

