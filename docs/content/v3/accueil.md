# Page d'accueil

Tant qu'aucune pièce, aucun équipement et aucun groupe n'existe, l'interface s'ouvre sur une
**page d'accueil** qui guide la mise en service en quatre étapes. Cette page présente d'abord
l'ossature de l'interface, la même sur toutes les pages, puis l'accueil lui-même.

![Page d'accueil de l'interface](v3/img/accueil-page){ .on-glb }

## L'ossature de l'interface

### Sur ordinateur : le menu de gauche { #menu }

Le menu de gauche porte, de haut en bas :

* le **logo** et le nom ESPSomfy-RTS ;
* trois **indicateurs d'état** :

    | Indicateur | Ce qu'il montre |
    |---|---|
    | **Réseau** | l'icône et le nom du mode actif, **WIFI**, **LAN** ou **POE** ; un point vert ou rouge dit si le lien est établi. Sur le [point d'accès de secours](../aide/point-d-acces.md), le mode s'appelle **AP**. |
    | **Durée de fonctionnement** | depuis le dernier démarrage ; au survol, le détail **Appareil** (depuis le démarrage) et **Réseau** (depuis la connexion actuelle) |
    | **Radio** | un point qui s'allume à chaque trame radio émise ou reçue |

* **Tableau de bord**, l'écran principal, avec un résumé de vos équipements dessous ;
* trois sections, dans l'ordre où l'on s'en sert :

    | Section | Pages |
    |---|---|
    | **Habitation** | [Équipements](habitation/equipements/index.md), [Groupes](habitation/groupes/index.md), [Pièces](habitation/pieces.md), [Plannings](habitation/plannings.md) |
    | **Domotique** | [Home Assistant](domotique/home-assistant/index.md), [MQTT](domotique/mqtt/index.md), [Déclencheurs](domotique/declencheurs.md) |
    | **Appareil** | [Réseau](appareil/reseau/index.md), [Radio](appareil/radio/index.md), [Sécurité](appareil/securite.md), [Préférences](appareil/preferences/index.md), [Système](appareil/systeme/index.md) |

* en bas, un bouton de **mise à jour du firmware**, visible seulement quand une version est
    disponible, et `Redémarrer`.

### Sur téléphone : l'en-tête et le menu { #telephone }

Sous 768 px, le menu de gauche disparaît :

* **en haut**, l'en-tête montre le titre de la page et une flèche de retour. Sur le tableau de
    bord, il porte à la place les commandes de toute la maison (monter, arrêter, descendre) et
    un menu ⋮ : `Ajouter`, `Trier`, `Personnaliser`. L'indicateur d'**activité radio**, s'il est
    activé dans les [réglages du tableau de bord](tableau-de-bord/personnaliser.md), y clignote à
    chaque trame ;
* **en bas**, deux onglets : **Tableau de bord** et **Menu**. La page **Menu** commence par une
    carte d'identité de l'appareil (nom, version, adresse, réseau, signal, durée de
    fonctionnement), qui ouvre l'état détaillé, puis reprend les trois sections en tuiles, avec
    `Aide` et `Redémarrer` en bas.

Quand le réseau mérite votre attention, un **bandeau** s'affiche sous l'en-tête et mène à la page
[Réseau](appareil/reseau/index.md) : point d'accès de secours actif, câble Ethernet débranché avec
bascule en Wi-Fi, ou signal Wi-Fi faible (sous -80 dBm).

## L'accueil : quatre étapes { #etapes }

*Prêt à démarrer ? Suivez le guide.* Le bouton principal mène toujours à l'étape à faire :
`Configurer le réseau`, `Régler vos préférences`, `Configurer la radio`, puis `Ajouter mon
premier équipement`. Dessous, deux liens : `Restaurer une sauvegarde`, si vous remplacez un
ancien appareil, et `Voir le guide`, qui ouvre cette page.

| Étape | Ce qu'elle demande | Quand elle est faite |
|---|---|---|
| **1. Se connecter** | relier l'appareil à votre box, en Wi-Fi ou en Ethernet | *C'est fait : l'appareil a rejoint le réseau Wi-Fi* (avec son nom), ou *relié à votre réseau en Ethernet* |
| **2. Régler vos préférences** (*Recommandé*) | l'heure et la position pour vos plannings, le thème et la couleur | le fuseau de l'appareil est celui du navigateur et la position est renseignée |
| **3. Régler la radio** | choisir le module radio et l'activer | *La radio est activée* |
| **4. Ajouter un équipement** | appairer votre premier équipement avec sa télécommande en main | — |

Chaque carte ouvre la page qui la règle. L'étape en cours est mise en avant ; une étape faite
affiche **Fait**.

* Tant que l'appareil n'est pas relié à votre réseau, les préférences attendent : *Disponible une
    fois l'appareil relié à internet, d'où il tire l'heure.*
* Les préférences sont conseillées, jamais bloquantes : la radio reste accessible avant elles.
* L'étape 4 ne s'ouvre qu'une fois la radio activée.

Les états se mettent à jour tout seuls, à chaque changement de réseau ou de radio et à chaque
affichage de la page. En bas, **Et ensuite ?** donne trois idées : ouvrir au lever du soleil, tout
fermer d'un seul geste, piloter depuis Home Assistant.

!!! note "Note"

    Dès qu'une pièce, un équipement ou un groupe existe, l'accueil ne s'affiche plus : le
    [tableau de bord](tableau-de-bord/index.md) prend sa place.

## Pas à pas { #pas-a-pas }

1. **Réseau** : l'[assistant de connexion](appareil/reseau/assistant-de-connexion.md), ou la page
    [Réseau](appareil/reseau/index.md).
2. **Préférences** : la page [Préférences](appareil/preferences/index.md), onglet Région.
3. **Radio** : la page [Radio](appareil/radio/index.md) et le
    [test des télécommandes](appareil/radio/assistant-de-reglages.md). Si toutes vos télécommandes
    sont reconnues, aucun réglage radio n'est nécessaire.
4. **Premier équipement** : la [mise en service d'un
    équipement](habitation/equipements/mise-en-service.md).
