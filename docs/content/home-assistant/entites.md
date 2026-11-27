# Entités exposées

L'intégration **ESPSomfy-RTS Enhanced** crée dans Home Assistant un appareil pour l'appareil
ESPSomfy-RTS lui-même, puis un appareil par équipement et par groupe. Chacun porte ses entités :
commandes, capteurs, interrupteurs de configuration.

Toutes les entités sont actives dès leur création : aucune n'est désactivée par défaut.

![Appareils créés par l'intégration](home-assistant/img/ha-integration){ .on-glb }

## Les appareils créés { #appareils }

| Appareil | Modèle affiché | Ce qu'il porte |
| :--- | :--- | :--- |
| **L'appareil ESPSomfy-RTS** | le modèle annoncé par l'appareil | boutons, mise à jour du micrologiciel, capteurs de diagnostic, dernière sauvegarde |
| **Un équipement** | `ESPSomfy-RTS Device` | son entité `cover` (ou son interrupteur de contact sec), ses capteurs soleil et vent, les capteurs de signal de ses télécommandes liées, ses plannings |
| **Un groupe** | `ESPSomfy-RTS Group` | son entité `cover`, ses capteurs soleil et vent, ses plannings |
| **Une télécommande écoutée** | `ESPSomfy-RTS Listened Remote` | son entité `event`, voir [Télécommandes écoutées](telecommandes-ecoutees.md) |

Les équipements, les groupes et les télécommandes écoutées sont rattachés à l'appareil
ESPSomfy-RTS : leur fiche indique « via » cet appareil.

La fiche de l'appareil ESPSomfy-RTS reprend aussi :

* son **numéro de série**, qui est l'identifiant serveur de l'appareil ;
* sa **version matérielle**, qui est son profil matériel (`BOX-ETH`, `BOX-WIFI` ou `GENERIC`),
    sur un firmware v3 ;
* son **adresse MAC**, sur un firmware v3 : Home Assistant la rapproche de la fiche que votre
    routeur a déjà de la carte ;
* un lien vers l'interface web de l'appareil.

![Fiche de l'appareil ESPSomfy-RTS dans Home Assistant](home-assistant/img/ha-appareil-hub){ .on-glb }

### Pièce et zone { #zones }

À sa création, l'appareil d'un équipement ou d'un groupe reçoit comme **zone suggérée** le nom
de sa [pièce](../v3/habitation/pieces.md) sur l'appareil.

Si vous changez ensuite la zone dans Home Assistant, l'intégration cherche sur l'appareil une
pièce **du même nom** (sans tenir compte des majuscules) :

| Situation | Ce qui se passe |
| :--- | :--- |
| Une pièce porte ce nom | l'équipement ou le groupe y est rangé sur l'appareil, puis l'intégration se recharge |
| Aucune pièce ne porte ce nom | rien n'est envoyé : la zone n'existe que dans Home Assistant |
| Vous retirez la zone | rien n'est envoyé |
| L'appareil est injoignable ou refuse | une notification signale que le changement n'existe que dans Home Assistant |

!!! tip "Faire correspondre zones et pièces"

    Donnez à vos pièces sur l'appareil les mêmes noms que vos zones dans Home Assistant : un
    changement de zone d'un côté range alors l'équipement au même endroit de l'autre.

### Noms { #noms }

L'entité `cover` d'un équipement n'a pas de nom propre : elle prend le nom de son appareil, donc
celui de l'équipement. Les autres entités ajoutent leur libellé à ce nom, par exemple
**Salon Capteur solaire**.

Un renommage fait sur l'appareil est suivi dans Home Assistant. Si vous avez renommé l'appareil
dans Home Assistant, c'est votre nom qui reste affiché.

### Quand la liste change { #resynchronisation }

L'intégration se recharge d'elle-même **5 secondes** après l'un de ces changements faits sur
l'appareil :

* un équipement ou un groupe ajouté ou supprimé ;
* un planning ajouté, supprimé, renommé, ou dont l'heure fixe a changé ;
* un groupe dont les membres ont changé.

Au démarrage de l'intégration, les appareils et entités de ce qui n'existe plus sur l'appareil
sont retirés : équipements et groupes supprimés, plannings disparus, télécommandes déliées.
Les télécommandes écoutées font exception : leurs appareils ne sont jamais retirés, c'est à vous
de les supprimer.

### Disponibilité { #disponibilite }

Les entités suivent la liaison WebSocket avec l'appareil : elles passent **indisponibles** quand
elle tombe et reviennent à la reconnexion. Le capteur **Dernière sauvegarde** fait exception : il
décrit des fichiers gardés dans Home Assistant et reste lisible.

## Inventaire { #inventaire }

### Sur un équipement { #equipement }

| Plateforme | Entité | Créée quand |
| :--- | :--- | :--- |
| `cover` | l'équipement lui-même | pour tout équipement, sauf les types **Interrupteur** |
| `switch` | **Contact sec** | pour les types **Interrupteur (1 bouton)** et **Interrupteur (2 boutons)**, à la place de la `cover` |
| `binary_sensor` | **Ensoleillement** | l'équipement a l'option **Capteur solaire**, ou c'est un store banne qui n'a pas l'option désactivée |
| `binary_sensor` | **Vent** | l'équipement a l'option **Capteur solaire**, ou c'est un store banne |
| `switch` | **Capteur solaire** | l'équipement a l'option **Capteur solaire**, ou c'est un store banne qui n'a pas l'option désactivée ; jamais pour un interrupteur |
| `sensor` | **Émetteur 1**, **Émetteur 2**… | une par télécommande liée à l'équipement, firmware v3 |
| `switch` | **{nom} ({heure})** | un par planning qui vise l'équipement |
| `sensor` | **{nom} ({heure}) prochain déclenchement** | un par planning qui vise l'équipement |
| `sensor` | **{nom} ({heure}) dernier déclenchement** | un par planning, si le firmware tient ce relevé |

!!! note "Store banne et option Capteur solaire"

    Un store banne dont l'option **Capteur solaire** est désactivée sur l'appareil n'a que le
    capteur **Vent** : ni **Ensoleillement**, ni interrupteur **Capteur solaire**.

### Sur un groupe { #groupe }

| Plateforme | Entité | Créée quand |
| :--- | :--- | :--- |
| `cover` | le groupe lui-même | pour chaque groupe |
| `binary_sensor` | **Ensoleillement** et **Vent** | le groupe a l'option **Capteur solaire** |
| `switch` | **Capteur solaire** | le groupe a l'option **Capteur solaire** |
| `switch` et `sensor` | les entités de ses plannings | un jeu par planning qui vise le groupe |

### Sur l'appareil ESPSomfy-RTS { #hub }

| Plateforme | Entité | Créée quand |
| :--- | :--- | :--- |
| `button` | **Redémarrer** | firmware v2.3.0 ou plus récent |
| `button` | **Sauvegarder** | toujours |
| `button` | **Télécharger la sauvegarde** | toujours |
| `update` | **Micrologiciel ESP32** | toujours |
| `sensor` | **Dernière sauvegarde** | toujours |
| `sensor` | capteurs de diagnostic | selon ce que l'appareil annonce, voir [Diagnostics](diagnostics.md) |

## Entité `cover` d'un équipement { #cover }

### Classe d'appareil { #classes }

La classe d'appareil découle du **Type** choisi sur la fiche de l'équipement. C'est elle qui
fixe l'icône et les libellés d'état affichés par Home Assistant.

| Type sur l'appareil | Classe dans Home Assistant | Particularité |
| :--- | :--- | :--- |
| Volet | `shutter` | |
| Store enrouleur | `shade` | |
| Store vénitien | `blind` | |
| Rideau (gauche, centre, droit) | `curtain` | |
| Store banne | `awning` | sens d'ouverture inversé, géré par l'intégration |
| Garage (1 bouton) | `garage` | commande unique, voir plus bas |
| Garage (3 boutons) | `garage` | |
| Portail (gauche, centre, droit) | `gate` | |
| Portail 1 bouton (gauche, centre, droit) | `gate` | commande unique, voir plus bas |
| Interrupteur (1 ou 2 boutons) | aucune | pas de `cover` : un interrupteur **Contact sec** |

### Ce que l'entité sait faire { #capacites }

Un équipement ordinaire s'ouvre, se ferme, s'arrête et se règle en position de 0 à 100 %, en
convention Home Assistant : **0 = fermé, 100 = ouvert**. L'intégration fait elle-même la
conversion pour un store banne ou un équipement à **Position inversée**.

Le **Type d'inclinaison** ajoute ou retire des capacités :

| Type d'inclinaison | Effet |
| :--- | :--- |
| Aucun | position seule |
| Moteur inclinaison, Intégré, Inclinaison Euro | position et inclinaison des lames |
| Inclinaison seule | inclinaison seule : ni position, ni ouverture ou fermeture en hauteur |

Les équipements à **commande unique** (Garage (1 bouton) et les portails 1 bouton) n'ont pas de
position réglable : une seule trame commande le moteur, qui décide lui-même du sens. Home
Assistant ne propose que les boutons qui ont un sens dans l'état du moment. Le détail est dans
[Services](services.md#equipements-a-commande-unique).

!!! note "Arrêter un équipement immobile ne fait rien"

    La touche Stop d'une télécommande RTS est la touche My : envoyée à un équipement déjà à
    l'arrêt, elle l'enverrait à sa position favorite. L'intégration n'envoie donc rien quand
    vous demandez l'arrêt d'un équipement qui ne bouge pas.

## Entité `cover` d'un groupe { #cover-groupe }

Un groupe est une entité `cover` qui rassemble les entités de ses membres :

* sa **position** et son **inclinaison** sont la moyenne de celles de ses membres ;
* sa classe d'appareil est toujours `shade` ;
* son attribut `entity_id` liste les entités de ses membres.

```jinja
{{ state_attr('cover.facade_sud', 'entity_id') }}
```

Ouvrir ou fermer un groupe part en **une seule commande** vers l'appareil. Quand ses membres ne
vont pas tous dans le même sens (un store banne avec des équipements ordinaires, par exemple),
l'intégration commande chaque membre séparément. Le détail est dans
[Services](services.md#actions-sur-un-groupe).

## Interrupteur Contact sec { #contact-sec }

Un équipement de type **Interrupteur** devient un interrupteur, allumé quand l'appareil le donne
actif.

| Type | Allumer | Éteindre |
| :--- | :--- | :--- |
| Interrupteur (1 bouton) | bascule | bascule |
| Interrupteur (2 boutons) | ouvre (ferme si **Commandes inversées**) | ferme (ouvre si **Commandes inversées**) |

Son icône suit le vocabulaire d'état choisi sur la fiche de l'équipement :

| Vocabulaire | Icône allumé / éteint |
| :--- | :--- |
| Marche / Arrêt | icône par défaut d'un interrupteur |
| Allumé / Éteint | ampoule allumée / éteinte |
| Ouvert / Fermé | porte ouverte / fermée |
| Actif / Inactif | lecture / arrêt |

## Soleil et vent { #soleil-vent }

| Entité | Ce qu'elle indique | Catégorie |
| :--- | :--- | :--- |
| **Ensoleillement** | l'appareil tient l'équipement ou le groupe pour ensoleillé | aucune |
| **Vent** | l'appareil tient l'équipement ou le groupe pour venté | aucune |
| **Capteur solaire** | le mode soleil du moteur est actif ; l'allumer envoie la commande RTS Sun Flag, l'éteindre la commande Flag | Configuration |

Pour signaler vous-même du soleil ou du vent, passez par les actions `set_sunny` et `set_windy` :
voir [Services](services.md#soleil-et-vent).

## Télécommandes liées : Émetteur 1, 2… { #emetteurs }

Sur un firmware v3, chaque télécommande liée à un équipement donne un capteur **Émetteur N** :
le niveau du signal reçu de cette télécommande, en dBm. Il se met à jour à chaque appui sur la
télécommande.

* Tant qu'aucune trame n'a été reçue de cette télécommande depuis le démarrage de l'appareil, le
    capteur vaut **Inconnu**.
* Le numéro est la place de la télécommande dans la liste des
    [télécommandes liées](../v3/habitation/equipements/liaison-telecommande.md), comme dans
    l'interface de l'appareil. Il peut changer quand une télécommande est déliée.
* Les capteurs sont créés au démarrage de l'intégration, d'après la liste des télécommandes liées
    à ce moment-là.

## Plannings { #plannings }

Chaque [planning](../v3/habitation/plannings.md) donne trois entités, rangées sur l'appareil de
l'équipement ou du groupe qu'il vise. Leur nom reprend celui du planning et son heure, ou
« Lever du soleil » / « Coucher du soleil » : deux plannings de même nom restent ainsi distincts.

| Entité | Rôle | Catégorie |
| :--- | :--- | :--- |
| **{nom} ({heure})** | active ou désactive le planning sur l'appareil | Configuration |
| **{nom} ({heure}) prochain déclenchement** | date et heure du prochain déclenchement ; **Inconnu** si le planning est désactivé, et pour un planning au lever ou au coucher du soleil tant que l'appareil n'a pas donné l'heure du jour | Diagnostic |
| **{nom} ({heure}) dernier déclenchement** | date et heure du dernier déclenchement, tel que l'appareil le garde ; perdu quand il redémarre | Diagnostic |

Le détail est sur la page [Plannings](plannings.md).

## Boutons, mise à jour et sauvegarde { #hub-entites }

| Entité | Rôle | Catégorie |
| :--- | :--- | :--- |
| **Redémarrer** | redémarre l'appareil | Configuration |
| **Sauvegarder** | sauvegarde la configuration de l'appareil dans Home Assistant | Configuration |
| **Télécharger la sauvegarde** | sauvegarde, puis affiche une notification avec un lien de téléchargement valable 10 minutes | Configuration |
| **Micrologiciel ESP32** | met à jour le micrologiciel de l'appareil | Configuration |
| **Dernière sauvegarde** | date de la sauvegarde la plus récente gardée dans Home Assistant ; son attribut `count` donne le nombre de fichiers gardés | Diagnostic |

Le fonctionnement complet est sur la page
[Sauvegardes et mises à jour](sauvegardes-et-mises-a-jour.md).
