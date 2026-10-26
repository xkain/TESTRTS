# Assistant de connexion

Un parcours guidé en deux étapes pour relier l'appareil à votre réseau, sans avoir à
comprendre la page [Connexion Réseau](index.md) dans son ensemble. C'est lui qui
s'affiche automatiquement au tout premier démarrage (tant que l'appareil est sur son propre
point d'accès) ; vous pouvez aussi le relancer à tout moment depuis **Réseau → Connexion**.

!!! tip "Astuce"

    Sur un [boîtier officiel](../materiel/boitiers-officiels.md), cette étape est en français, 

## Étape 1 : comment se connecter ?

Trois cartes, qui ne déterminent que les réglages présentés à l'étape suivante :

* **Wi-Fi** : rejoindre votre réseau sans fil habituel.
* **Ethernet** : connexion filaire ou PoE, sans aucun repli sans fil.
* **Ethernet + secours Wi-Fi** : connexion filaire comme méthode principale, avec un réseau
    Wi-Fi de secours qui prend le relais si le câble tombe.

![assistant de connexion 1](v3/img/assistant-de-connexion-1){ .on-glb }   
    
!!! note "Note"

    Sur un [boîtier officiel](../materiel/boitiers-officiels.md), cette étape est adaptée au matériel :

    * Sur la variante **Wi-Fi seul**, elle n'existe pas — le boîtier ne porte aucune broche
        Ethernet, il n'y a donc rien à choisir. L'assistant s'ouvre directement à l'étape 2.
    * Sur la variante **Ethernet & Wi-Fi**, la carte **Ethernet seul** est masquée : son câblage
        est fixe et déjà validé en usine, il n'y a donc aucun réglage à présenter derrière ce
        choix. Restent **Wi-Fi** et **Ethernet + secours Wi-Fi**, qui ont chacun quelque chose à
        configurer. Le câblage Ethernet lui-même, lui, est actif par défaut et ne demande rien.

## Étape 2 : les réglages

Le contenu dépend du choix fait à l'étape 1 — un seul bloc pour Wi-Fi ou Ethernet seul, les
deux pour le mode combiné.

### Bloc Wi-Fi

Deux façons de renseigner un réseau, communes au reste de l'application : **Chercher un
réseau sans fil** (scan) ou **Ajouter un réseau manuellement** (saisie directe, pour un SSID
caché) — voir [Connexion Réseau](index.md#connexion-wi-fi) pour le détail de ces deux
méthodes. Une fois un réseau retenu, il s'affiche en résumé vert sous les deux boutons — rien
n'est envoyé à l'appareil à ce stade, c'est le bouton **Enregistrer** en bas de carte qui
conclut, pour les trois modes.

<div class="rts-row" markdown>

![assistant de connexion 2](v3/img/assistant-de-connexion-2){ .on-glb }
![assistant de connexion 3](v3/img/assistant-de-connexion-3){ .on-glb }
![assistant de connexion 4](v3/img/assistant-de-connexion-4){ .on-glb }

</div>

<div class="rts-row" markdown>

![assistant de connexion 5](v3/img/assistant-de-connexion-5){ .on-glb }
![assistant de connexion 6](v3/img/assistant-de-connexion-6){ .on-glb }

</div>


### Bloc Ethernet

Sur une carte générique : sélection du type de carte, qui pré-remplit automatiquement les
broches PHY/Clock/GPIO — voir [Connexion Réseau](index.md#connexion-ethernet) pour le
détail. Sur un boîtier officiel, ce bloc ne montre qu'une phrase expliquant qu'il n'y a rien à
régler, votre box internet attribuera une adresse automatiquement.

!!! tip "Astuce"

    Un dépannage caché existe si vous avez besoin, malgré tout, de voir ou modifier la
    configuration Ethernet complète sur un boîtier : cliquez 5 fois sur le titre de l'étape 1
    (« Comment souhaitez-vous connecter... »). La carte **Ethernet seul** et le sélecteur de
    type de carte réapparaissent. Ce déverrouillage ne survit pas à la fermeture de l'assistant.

### Avertissement du mode combiné

En mode **Ethernet + secours Wi-Fi**, un bandeau d'avertissement reste affiché tant qu'aucun
réseau Wi-Fi n'a été renseigné : sans lui, un câble débranché renverrait l'appareil sur son
point d'accès de configuration sans aucun moyen de le rejoindre à distance. Si vous cliquez
quand même sur **Enregistrer** sans Wi-Fi configuré, une confirmation vous demande si vous
voulez vraiment continuer sans secours — accepter revient alors, techniquement, à enregistrer
un **Ethernet seul** plutôt qu'un mode combiné sans filet.

## Enregistrement

Un seul bouton **Enregistrer**, pour les trois modes, qui envoie Ethernet et Wi-Fi dans un
seul message — c'est précisément ce qui rend le mode **Ethernet + secours Wi-Fi** possible
depuis l'assistant : les deux parties partent ensemble, sans repasser deux fois par l'étape 2.
La fenêtre de confirmation finale (nom d'hôte, adresses d'accès une fois basculé) est la même
que depuis la page Connexion — voir
[Connexion Réseau](index.md#rejoindre-le-réseau-après-enregistrement).

## Ignorer l'assistant

Disponible à tout moment, en haut à droite. L'appareil reste alors sur son propre point
d'accès, utilisable normalement — vous pourrez toujours configurer le réseau plus tard depuis
[Connexion Réseau](index.md) ou en relançant cet assistant.

