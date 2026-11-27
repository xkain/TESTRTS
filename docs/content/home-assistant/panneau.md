# Le panneau ESPSomfy RTS

Le panneau rassemble, dans Home Assistant, ce que l'on règle le plus souvent sur un appareil
ESPSomfy-RTS : le nom et les temps de course des équipements, les membres des groupes, les
plannings, les sauvegardes et la mise à jour du micrologiciel.

![Panneau ESPSomfy RTS, onglet Équipements](home-assistant/img/ha-panneau-equipements){ .on-glb }

## L'ouvrir { #ouvrir }

* Dans la barre latérale, entrée **ESPSomfy RTS**. Elle apparaît dès qu'un appareil est chargé et
    disparaît avec le dernier appareil supprimé.
* Depuis **Paramètres** › **Appareils et services** › **ESPSomfy-RTS Enhanced**, qui propose aussi
    d'ouvrir le panneau.

!!! note "Réservé aux administrateurs"

    Le panneau n'est visible et utilisable que par un compte administrateur de Home Assistant.

## L'en-tête { #en-tete }

| Élément | Rôle |
| :--- | :--- |
| **Nom de l'appareil** | avec plusieurs appareils, une liste pour passer de l'un à l'autre ; le panneau retient le dernier choisi sur ce navigateur |
| **Pastille** | verte quand l'appareil est joignable, rouge sinon |
| **Version** | la version du micrologiciel installé |
| **Adresse** | l'adresse de l'appareil ; masquée sur un écran étroit |
| `Interface de l'appareil` | ouvre l'interface web de l'appareil dans un nouvel onglet |

Sous l'en-tête, cinq onglets : **Équipements**, **Groupes**, **Plannings**, **Sauvegardes** et
**Appareil**. Les trois premiers affichent leur nombre d'éléments.

Le panneau se met à jour de lui-même quand l'appareil signale un changement : équipement ajouté
ou retiré, groupe modifié, planning déclenché, appareil reconnecté.

### États particuliers { #etats }

| Message | Signification |
| :--- | :--- |
| *Aucun appareil ESPSomfy RTS n'est chargé.* | aucun appareil n'est configuré, ou aucun n'a pu démarrer |
| *Chargement…* | le panneau lit l'appareil |
| *L'appareil ne répond pas. Les données reviendront dès qu'il sera joignable.* | l'appareil choisi est injoignable |

## Équipements { #equipements }

Les équipements sont classés par pièce, ceux sans pièce sous **Sans pièce**. Chaque carte montre :

* le nom et l'état : *Ouvert*, *Fermé*, *Ouvert à N %*, *Ouverture…*, *Fermeture…* ou
    *Indisponible*, suivi de *Lames à N %* pour un équipement à lames orientables ;
* une jauge de position ;
* les temps de course, montée ↑ et descente ↓ ;
* trois boutons : monter, arrêter, fermer ;
* le crayon, qui ouvre la fenêtre de réglage.

Les contacts secs n'apparaissent pas dans cet onglet. Sans équipement : *Aucun équipement sur cet
appareil.*

### Fenêtre « Modifier » d'un équipement { #modifier-equipement }

![Fenêtre Modifier d'un équipement](home-assistant/img/ha-panneau-modifier){ .on-glb }

| Champ | Rôle |
| :--- | :--- |
| **Nom** | *« Le même nom sur l'appareil, dans MQTT et dans Home Assistant. »* Un compteur affiche la taille sur **20** |
| **Pièce** | la pièce de l'appareil, ou **Sans pièce** |
| **Montée (s)** et **Descente (s)** | temps de course, de 0 à 300 s, au dixième de seconde |
| **Lames, ouverture (s)** et **Lames, fermeture (s)** | seulement pour un équipement à lames orientables |
| **Inverser les commandes** | *« Monter descend et inversement. »* |
| **Inverser la position** | *« 0 % devient ouvert. »* |

`Annuler` ferme sans rien changer ; `Enregistrer` envoie à l'appareil et affiche *Enregistré sur
l'appareil*.

!!! warning "20 octets, pas 20 lettres"

    L'appareil garde au plus 20 octets par nom : **une lettre accentuée compte pour deux**. Au-delà,
    le champ passe en rouge (*« Trop long : l'appareil le couperait. Raccourcissez-le (une lettre
    accentuée compte pour deux). »*) et `Enregistrer` reste grisé. Un nom vide est refusé de même
    (*« Le nom ne peut pas être vide. »*).

## Groupes { #groupes }

Chaque carte de groupe montre son nom, sa pièce, son nombre de membres, la liste de ses membres
(marqués *sens inversé* s'ils ont **Inverser la position**), son état et les trois boutons de
mouvement. Sans groupe : *Aucun groupe sur cet appareil.*

Un groupe qui mêle des membres inversés et des membres normaux porte un bandeau : *« Membres de
sens mélangés : une même position ne vaudrait pas la même chose pour tous. Les plannings de ce
groupe sont refusés. »*

### Fenêtre « Modifier » d'un groupe { #modifier-groupe }

| Champ | Rôle |
| :--- | :--- |
| **Nom** | mêmes règles que pour un équipement : 20 octets au plus, non vide |
| **Pièce** | la pièce du groupe, ou **Sans pièce** |
| **Membres** | un interrupteur par équipement de l'appareil, avec sa pièce et la mention *sens inversé* le cas échéant |

## Plannings { #plannings }

Cet onglet n'existe qu'avec un firmware v3. Sur un firmware v2, il affiche *« Cet appareil n'a pas
de plannings : ils arrivent avec le micrologiciel v3. »*

![Panneau ESPSomfy RTS, onglet Plannings](home-assistant/img/ha-panneau-plannings){ .on-glb }

En haut, la frise **Aujourd'hui, &lt;jour&gt;** place sur 24 heures les plannings actifs du jour,
numérotés ; ceux déjà passés sont grisés, un trait rouge marque l'heure actuelle.

Sous **Tous les plannings**, le bouton `Ajouter` crée un planning. Chaque carte montre :

* l'heure, ou **Lever** / **Coucher** avec son décalage (par exemple *Coucher −15 min*), le numéro
    et le nom du planning ;
* un interrupteur pour l'activer ou le désactiver, sans recharger l'intégration ;
* les jours, du lundi au dimanche ;
* la cible et l'action : *Ouvert*, *Fermé*, *Ouvert à N %*, *Position My* ou *Lames à N %* ;
* **Dernière :** (*aujourd'hui*, *hier*, une date, ou *jamais*) et **Prochaine :** (*aujourd'hui*,
    *demain*, un jour de la semaine, ou *désactivé*). Pour un planning solaire, l'heure suivante est
    précédée de ≈ : elle est estimée.

Sans planning : *Aucun planning pour l'instant.*

### Fenêtre « Nouveau planning » ou « Modifier » { #modifier-planning }

| Champ | Rôle |
| :--- | :--- |
| **Équipement ou groupe** | la cible ; un groupe aux membres de sens mélangés est grisé |
| **Jours** | un bouton par jour ; par défaut, du lundi au vendredi |
| **Quand** | `Heure fixe`, `Lever` ou `Coucher` |
| **Heure** | pour une heure fixe ; 08:00 par défaut |
| **Décalage (min)** | pour le lever ou le coucher, de −720 à 720 minutes : *« Négatif = avant, positif = après. »* |
| **Action** | `Position`, `Position My` ou `Lames seules` |
| **Position** ou **Lames** | curseur de 0 à 100 %, absent pour `Position My` |
| **Nom** | **Facultatif** ; vide, le planning prend le nom de sa cible. 20 octets au plus |
| **Activé** | *« Un planning désactivé est gardé mais ne se déclenche pas. »* |

En modification, `Supprimer` demande confirmation (*« Supprimer ce planning de l'appareil ? »*).
Voir aussi [Plannings](plannings.md).

## Sauvegardes { #sauvegardes }

![Panneau ESPSomfy RTS, onglet Sauvegardes](home-assistant/img/ha-panneau-sauvegardes){ .on-glb }

| Élément | Rôle |
| :--- | :--- |
| **Dernière sauvegarde : &lt;date&gt;** | la plus récente des sauvegardes gardées, ou *Aucune sauvegarde gardée.* |
| Cinq cases | une par sauvegarde gardée : *« Les 5 plus récentes sont gardées sur Home Assistant, les plus anciennes s'effacent d'elles-mêmes. »* |
| `Sauvegarder maintenant` | copie aussitôt la configuration de l'appareil dans Home Assistant ; *Sauvegarde créée* |
| **Sauvegarde automatique** | interrupteur ; activé, il affiche **Prochaine : &lt;date&gt;** |
| **Jours** | un bouton par jour, et `Tous les jours` pour tout cocher ou tout décocher |
| **Heure** | l'heure de la sauvegarde, 03:00 par défaut |
| **Sauvegardes gardées** | la liste, la plus récente marquée *la plus récente*, avec sa taille ; boutons télécharger et supprimer |
| `Tout effacer` | efface toutes les sauvegardes gardées pour cet appareil, après confirmation |

Activer la sauvegarde automatique sans aucun jour coche toute la semaine ; décocher le dernier jour
la désactive. Ces réglages sont gardés dans Home Assistant (*Enregistré dans Home Assistant*) et ne
rechargent pas l'intégration. Le détail est dans [Sauvegardes et mises à
jour](sauvegardes-et-mises-a-jour.md).

## Appareil { #appareil }

| Bloc | Contenu |
| :--- | :--- |
| **Micrologiciel installé** | la version ; puis *À jour.*, ou *La version X est disponible.* avec un bouton `Installer X`, ou *Installation en cours : N %* |
| **Réglages de l'intégration** | **Canal développeur** : *« Propose aussi les versions de développement. Elles peuvent être instables. »* Le changer recharge l'intégration |
| **Connexion** | **Adresse** de l'appareil, et `Changer l'adresse ou le PIN`, qui mène à la page de l'intégration, voir [Reconfigurer](installation.md#reconfigurer) |
| **Dans l'interface de l'appareil** | ce qui reste à faire dans l'interface de l'appareil, et le bouton `Interface de l'appareil` |

Restent à faire dans l'interface de l'appareil :

* ajouter un équipement et l'appairer à son moteur ;
* radio, réseau, sécurité, MQTT ;
* télécommandes écoutées et restauration d'une sauvegarde.

## Ce que fait un enregistrement { #enregistrement }

| Action dans le panneau | Effet dans Home Assistant |
| :--- | :--- |
| `Enregistrer` un équipement, un groupe ou un planning | l'appareil est modifié, puis l'intégration se recharge pour que les entités suivent |
| `Supprimer` un planning | idem |
| Activer ou désactiver un planning | l'appareil est modifié, rien n'est rechargé |
| Régler la sauvegarde automatique | réglage gardé dans Home Assistant, rien n'est rechargé |
| Changer le **Canal développeur** | réglage gardé dans Home Assistant, l'intégration se recharge |

Pendant un rechargement, les entités de l'appareil sont brièvement indisponibles.

### Messages d'erreur { #erreurs }

| Message | Cause |
| :--- | :--- |
| *L'appareil n'a pas pris la modification : il est injoignable ou l'a refusée.* | l'appareil ne répond pas, ou a rejeté la demande |
| *Cet appareil n'est pas chargé dans Home Assistant.* | l'appareil n'a pas démarré dans Home Assistant |
| *Nom vide ou trop long : 20 caractères au plus, une lettre accentuée compte pour deux.* | nom refusé |
| *Choisissez un équipement ou un groupe.* | planning sans cible |
| *Choisissez au moins un jour.* | planning sans jour |
| *Indiquez l'heure.* | planning à heure fixe sans heure |
| *Indiquez la position.* / *Indiquez la position des lames.* | action sans valeur |
| *Ce groupe mêle des équipements de sens opposés : un planning n'y aurait pas le même effet sur tous.* | groupe aux membres de sens mélangés |
| *Cet appareil n'a pas de plannings.* | firmware v2 |
| *La sauvegarde a échoué : l'appareil ne l'a pas envoyée.* | sauvegarde refusée ou appareil injoignable |
| *La sauvegarde n'a pas pu être effacée.* | fichier impossible à supprimer dans Home Assistant |
