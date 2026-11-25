# Système

La page **Appareil › Système** dit quelle version du firmware tourne sur l'appareil et dans quel
état il se trouve, et rassemble tout ce qui sert à l'entretenir : mise à jour, sauvegarde,
dépannage. Elle se lit en cinq onglets.

## En haut de la page

Le bandeau de gauche (en haut sur téléphone) reste affiché quel que soit l'onglet :

* la **version installée**, en grand, avec une pastille d'état :

    | Pastille | Signifie |
    |---|---|
    | **À jour** | aucune version plus récente n'est publiée |
    | **vX.Y.Z disponible** | une mise à jour est proposée : voir l'onglet [Mises à jour](#update) |
    | **Vérification désactivée** | la vérification automatique est coupée |
    | **Impossible de vérifier** | le navigateur n'atteint pas la liste des versions publiées |

* le bouton `Vérifier maintenant`, qui relance la recherche d'une mise à jour (absent sur
    téléphone, où le même bouton se trouve dans l'onglet Mises à jour) ;
* **Détails**, à déplier : le canal (stable ou développement), la durée de fonctionnement, la
    raison du dernier redémarrage et la mémoire libre.

## Mises à jour { #update }

![Système, onglet Mises à jour](v3/img/systeme-update){ .on-glb }

Un encadré **Bon à savoir** rappelle d'abord de faire une [sauvegarde](#backup) avant toute mise à
jour ou restauration.

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Version installée** | Le numéro de version, l'état (*Votre système est à jour*, *Mise à jour disponible*…) et l'heure de la dernière vérification. Quand une version est disponible, la tuile affiche la version proposée, un lien vers ses **notes de version** et un bouton pour l'installer. La ligne **Choisir une autre version** permet de réinstaller, de revenir en arrière ou de passer en version de développement. |
| **Vérification automatique** | **Me prévenir des mises à jour** : `Oui` / `Non`. La vérification a lieu à chaque ouverture de l'interface ; rien n'est installé sans votre accord. |
| **Canal** | **Version stable** (une version publiée) ou **Version de développement** (construite à chaque modification du code, sans être éprouvée). |
| **Installation manuelle** | Sans passer par Internet : **Installer depuis un fichier** (un fichier `.bin` téléchargé au préalable) et **Redémarrer en mode installation**. |

C'est **votre navigateur**, et non l'appareil, qui va chercher les versions publiées : c'est lui qui
doit avoir accès à Internet.

Pour aller plus loin : [Mises à jour du firmware](mises-a-jour.md).

## État du système { #status }

![Système, onglet État du système](v3/img/systeme-status){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Matériel** | La puce, le processeur et le profil matériel (voir ci-dessous). Le bouton **Témoin LED de statut** règle le voyant d'état de la carte : voir [Témoin LED de statut](led-de-statut.md). |
| **Fonctionnement** | Depuis combien de temps l'appareil tourne, depuis combien de temps sa connexion réseau (Wi-Fi ou Ethernet) est établie, et la raison du dernier redémarrage. Les deux durées peuvent différer : une reconnexion réseau ne redémarre pas l'appareil. |
| **Mémoire Vive (RAM)** | La mémoire libre, avec le plus bas observé depuis le démarrage et le plus grand bloc d'un seul tenant. Ce dernier compte plus que le total pour la stabilité : une mémoire morcelée peut refuser une grosse demande même avec beaucoup de libre. |
| **Mémoire Flash** | La part occupée du système de fichiers (packs de langue, sauvegarde interne), puis la taille et la vitesse de la puce flash. |
| **Espace du firmware** | La part occupée de la partition qui reçoit le firmware. Elle dit la marge qui reste pour les versions à venir. |

### Profil matériel

| Profil | Signifie |
|---|---|
| **Générique** | N'importe quelle carte ESP32 qui n'est pas un [boîtier officiel](../../materiel/boitiers-officiels.md). Radio, LED et sorties se configurent à la main (voir [Radio](../radio/index.md)). C'est le cas de la grande majorité des installations. |
| **Édition Wi-Fi** | Un boîtier officiel, variante Wi-Fi seul : radio et LED sont câblées et déjà reconnues. |
| **Édition Ethernet & Wi-Fi** | La même chose, avec port Ethernet et repli Wi-Fi. |

!!! note "Note"

    Le profil n'est **pas un réglage** : il dépend du firmware installé, chaque boîtier ayant son
    propre fichier. Si vous ne possédez pas l'un de ces boîtiers, n'installez pas leurs firmwares.

### Raison du dernier redémarrage

| Raison affichée | Signifie |
|---|---|
| Coupure d'alimentation | démarrage normal après une mise sous tension |
| Bouton de réinitialisation | le bouton RESET de la carte a été pressé |
| Redémarrage demandé (interface ou mise à jour) | redémarrage volontaire |
| Erreur interne | le firmware a rencontré une exception et a redémarré pour s'en protéger |
| Redémarrage de sécurité (interruptions / tâche bloquée) | le chien de garde (watchdog) est intervenu : une partie du code est restée bloquée trop longtemps |
| Sortie de veille | réveil après une mise en veille profonde |
| Tension d'alimentation insuffisante | l'alimentation était trop faible ou instable |

Les deux premières sont normales. Les autres, si elles reviennent souvent, justifient d'activer les
**logs de debug** (onglet [Dépannage](#troubleshoot)) pour en trouver la cause.

## Sauvegarde { #backup }

![Système, onglet Sauvegarde](v3/img/systeme-backup){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Sauvegarde de la configuration** | `Sauvegarder` télécharge un fichier `.backup` avec toute la configuration de l'appareil : équipements, groupes et pièces, plannings, répéteurs, télécommandes écoutées, paramètres système, réseau, MQTT et radio. |
| **Restauration** | `Restaurer une sauvegarde` réinstalle tout ou partie d'un fichier `.backup`, celui de cet appareil ou celui d'un ancien appareil qu'il remplace. Avant l'envoi, la fenêtre montre ce que contient le fichier et ce qu'il remplacera. Les sauvegardes v3 et les anciennes sauvegardes v2 (v2.4.6 et suivantes) sont acceptées. |

Ne figurent **jamais** dans une sauvegarde : le nom et le mot de passe du Wi-Fi, l'identifiant et le
mot de passe MQTT, le code PIN ou le mot de passe de l'interface, les packs de langue.

!!! warning "Ne publiez jamais un fichier de sauvegarde"

    Il ne contient aucun mot de passe, mais il contient les adresses radio et les codes tournants
    de vos équipements. Ne le joignez pas à un message de forum ni à une demande d'aide.

Pour aller plus loin : [Restaurer le système](restaurer.md) et
[Anatomie du fichier de sauvegarde](anatomie-sauvegarde.md).

## Dépannage { #troubleshoot }

![Système, onglet Dépannage](v3/img/systeme-troubleshoot){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Débogage** | **Logs de debug** : `Oui` / `Non`. Affiche des informations détaillées sur le port série et dans la console du navigateur (trames radio, requêtes réseau…). À n'activer qu'en cas de dépannage : l'appareil en est légèrement ralenti. **Vider le cache** force le navigateur à recharger l'interface, si un défaut d'affichage persiste après une mise à jour. |
| **Remise à zéro** | `Remettre à zéro` efface la configuration pour repartir comme un appareil neuf. |

La remise à zéro ouvre une fenêtre qui liste ce qui sera effacé : les équipements, groupes, pièces,
plannings et télécommandes liées ; les réglages, la sécurité et MQTT ; les langues téléchargées ;
l'appairage avec les moteurs, qui ne répondront plus tant qu'ils ne sont pas appairés à nouveau ou
qu'une sauvegarde n'est pas restaurée. Elle propose une sauvegarde, puis deux boutons, actifs une fois
la case de confirmation cochée : garder la connexion réseau, ou tout effacer. Dans ce dernier cas,
l'appareil redémarre sur son point d'accès de secours.

!!! danger "Rien ne pourra être annulé"

    Seule une sauvegarde faite avant permet de revenir en arrière.

Si l'interface ne répond plus du tout, voir [Mode Récupération](recuperation.md).

## À propos { #about }

![Système, onglet À propos](v3/img/systeme-about){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Aide** | **Documentation** ouvre le guide. **Signaler un problème** ouvre un rapport de bug pré-rempli sur GitHub ; l'infobulle `?` rappelle que les tickets sont réservés aux vrais bugs du firmware (pour une question, voir [Aide](../../../aide/index.md)). |
| **Crédits du projet** | Les auteurs, le copyright et la licence. |
| **Contributeurs du projet** | Celles et ceux qui ont apporté du code, des traductions, des tests ou des signalements. Un clic sur un nom ouvre son profil GitHub. |

Les crédits s'affichent **dans cet ordre** :

1. **rstrouse**, *auteur du projet d'origine* : Robert Strouse a créé ESPSomfy-RTS, sa radio et
    son protocole. Cette version repose sur son travail : **un grand merci à lui**.
2. **xkain**, *auteur de cette version* : l'interface et la refonte du cœur du firmware.

Cette version est fournie **sans aucune garantie** et peut être redistribuée et modifiée selon les
conditions de l'AGPL-3.0.

!!! important "Ces deux crédits sont intangibles"

    Les noms de **rstrouse** (en premier) et de **xkain** (en second) doivent **toujours**
    figurer dans les crédits de l'interface, **avec les mêmes intitulés, le même rang et dans le
    même ordre**. C'est une condition de la licence (clause additionnelle de la section 7(b)
    de l'AGPL-3.0) : qui redistribue ce projet, ou une œuvre qui en dérive, ne peut ni les
    retirer, ni les renommer, ni changer leur ordre, ni les rétrograder. Il peut en revanche
    **ajouter son propre nom**, pour ses propres modifications, dans une entrée supplémentaire.

## Pages liées

* [Mises à jour du firmware](mises-a-jour.md)
* [Témoin LED de statut](led-de-statut.md)
* [Restaurer le système](restaurer.md)
* [Anatomie du fichier de sauvegarde](anatomie-sauvegarde.md)
* [Mode Récupération](recuperation.md)
