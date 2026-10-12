# Entités exposées

Chaque équipement et chaque groupe déclaré dans ESPSomfy-RTS devient un **appareil dédié**
dans Home Assistant, rattaché par un lien `via_device` à l'appareil ESPSomfy-RTS. Celui-ci
reste l'appareil parent, porteur des diagnostics et des boutons.

## Liste des entités

| Plateforme | Entité | Créée quand |
|---|---|---|
| `cover` | l'équipement (volet, store, porte, portail) | pour tout équipement dont le type n'est pas un contact sec |
| `cover` | le groupe | pour chaque groupe déclaré dans ESPSomfy-RTS |
| `binary_sensor` | Ensoleillement | l'équipement ou le groupe a un capteur solaire, ou c'est un store banne |
| `binary_sensor` | Vent | idem |
| `switch` | Capteur solaire | active ou désactive le suivi soleil de l'équipement ou du groupe |
| `switch` | Contact sec | pour les types d'équipement « contact sec » |
| `button` | Redémarrer | appareil ESPSomfy-RTS |
| `button` | Sauvegarder | appareil ESPSomfy-RTS |
| `update` | Micrologiciel | appareil ESPSomfy-RTS — mise à jour du firmware depuis l'interface Home Assistant |
| `sensor` | diagnostics | appareil ESPSomfy-RTS — voir ci-dessous |

## Classes d'appareil

La classe d'appareil de l'entité `cover` est déduite du type configuré dans
ESPSomfy-RTS : `blind`, `curtain`, `awning`, `shutter`, `garage`, `gate` ou `shade`. C'est
elle qui détermine les icônes et les libellés « Ouvert / Fermé » affichés par Home
Assistant.

Deux familles d'équipement modifient aussi les capacités exposées :

- les **portes de garage et portails à bouton unique** n'exposent qu'une bascule : les
  services d'ouverture, de fermeture et d'arrêt envoient tous la même trame, et c'est le
  moteur qui décide du sens ;
- les **équipements à inclinaison seule** n'exposent pas de position de hauteur.

## Capteurs de diagnostic

Douze capteurs portent la catégorie « Diagnostic » et sont rattachés à l'appareil
ESPSomfy-RTS : nom d'hôte, type de puce, connexion, adresse IP, les trois capteurs Wi-Fi
ou les deux capteurs Ethernet selon le mode réseau, et les trois capteurs de mémoire.

Le détail de chacun — contenu, unité, cadence de rafraîchissement, lissage, et des
exemples de lecture et d'alerte — est sur sa propre page : [Diagnostics](diagnostics.md).

## Entités de groupe

Un groupe est une entité `cover` d'un genre particulier : il agrège les entités de ses
membres et envoie **une seule trame radio** pour l'ensemble. C'est plus rapide et plus
fiable qu'une boucle sur chaque équipement, mais un groupe n'a ni position ni inclinaison
propre — voir [Pièges et limites](pieges-et-limites.md).

L'attribut `entity_id` du groupe liste les entités des équipements qui le composent :

```jinja
{{ state_attr('cover.facade_sud', 'entity_id') }}
```
