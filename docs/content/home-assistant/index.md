# Présentation

L'intégration **ESPSomfy-RTS Enhanced** relie un appareil ESPSomfy-RTS à Home Assistant. Elle
reprend ses équipements, ses groupes et ses plannings, suit leur état en temps réel et ajoute un
panneau dans la barre latérale pour les régler sans quitter Home Assistant.

Le domaine de l'intégration est `espsomfy_rts_enhanced` : ses actions s'appellent sous la forme
`espsomfy_rts_enhanced.<action>`.

![Page de l'intégration ESPSomfy-RTS Enhanced dans Home Assistant](home-assistant/img/ha-integration){ .on-glb }

## Comment elle fonctionne

Tout passe par votre réseau local, sans cloud :

* **les commandes** (ouvrir, fermer, positionner, sauvegarder…) partent vers l'appareil en HTTP ;
* **l'état** revient par une connexion WebSocket que l'appareil garde ouverte : un mouvement lancé
    depuis une télécommande physique ou depuis l'interface de l'appareil se voit aussitôt dans
    Home Assistant, sans interrogation périodique.

Seules les mises à jour du micrologiciel et leurs notes de version demandent un accès à Internet.

## Ce qu'elle apporte

| Domaine | Ce que vous obtenez |
| :--- | :--- |
| **Équipements et groupes** | une entité `cover` par équipement et par groupe, avec position, inclinaison des lames et position favorite (My) |
| **Capteurs de l'appareil** | réseau, Wi-Fi ou Ethernet, mémoire, dernier redémarrage, voir [Diagnostics](diagnostics.md) |
| **Plannings** | les plannings de l'appareil, à activer, créer ou modifier depuis Home Assistant, voir [Plannings](plannings.md) |
| **Sauvegardes** | une copie de la configuration gardée dans Home Assistant, à la demande ou à jours fixes, voir [Sauvegardes et mises à jour](sauvegardes-et-mises-a-jour.md) |
| **Mises à jour** | le micrologiciel de l'appareil se met à jour comme n'importe quel appareil de Home Assistant |
| **Télécommandes écoutées** | chaque appui sur une télécommande écoutée devient un événement, voir [Télécommandes écoutées](telecommandes-ecoutees.md) |
| **Panneau ESPSomfy RTS** | une page dédiée pour renommer, régler et regrouper, voir [Le panneau ESPSomfy RTS](panneau.md) |

## Prérequis

| Élément | Exigence |
| :--- | :--- |
| **Home Assistant** | version **2026.8** ou plus récente |
| **Installation depuis le Marketplace intégré** | Home Assistant **2026.11** ou plus récent, version où HACS est devenu le Marketplace. Entre 2026.8 et 2026.10, passez encore par HACS |
| **Appareil** | un appareil ESPSomfy-RTS sur le même réseau, dont les équipements sont déjà appairés à leurs moteurs |

!!! note "Pourquoi 2026.8"

    L'intégration rattache chaque équipement, groupe et télécommande écoutée à l'appareil
    ESPSomfy-RTS par une méthode que Home Assistant n'offre qu'à partir de la version 2026.8.0.

## Firmware v2 ou v3

L'intégration fonctionne avec les deux lignées du firmware, mais certaines fonctions dépendent de
sa version :

| Fonction | Firmware v2 | Firmware v3 |
| :--- | :--- | :--- |
| Équipements, groupes, capteurs de l'appareil | oui | oui |
| Bouton `Redémarrer` | à partir de la v2.3.0 | oui |
| Mise à jour du micrologiciel depuis Home Assistant (**Micrologiciel ESP32**) | à partir de la v2.2.1 | oui |
| Plannings | non : le panneau affiche *« Cet appareil n'a pas de plannings : ils arrivent avec le micrologiciel v3. »* | oui |
| Force du signal des télécommandes liées à un équipement | non | oui |
| Télécommandes écoutées | non | oui |
| Mise à jour par le firmware de secours | non | quand le firmware l'annonce, voir [Sauvegardes et mises à jour](sauvegardes-et-mises-a-jour.md#mises-a-jour) |

## Les pages de cet onglet

### Découvrir

| Page | Contenu |
| :--- | :--- |
| [Présentation](index.md) | cette page : principe, prérequis, différences v2 / v3 |
| [Installation et connexion](installation.md) | installer, ajouter un appareil, PIN ou mot de passe, migration depuis l'intégration d'origine |
| [Le panneau ESPSomfy RTS](panneau.md) | la page de la barre latérale et ses cinq onglets |
| [Entités exposées](entites.md) | ce que l'intégration crée : équipements, groupes, capteurs, boutons |
| [Diagnostics](diagnostics.md) | les capteurs de l'appareil : réseau, Wi-Fi, Ethernet, mémoire |
| [Attributs en template](attributs.md) | lire une position, la position My, la dernière commande |

### Agir

| Page | Contenu |
| :--- | :--- |
| [Plannings](plannings.md) | les plannings de l'appareil vus de Home Assistant |
| [Sauvegardes et mises à jour](sauvegardes-et-mises-a-jour.md) | sauvegarder, télécharger, redémarrer, mettre à jour le micrologiciel |
| [Télécommandes écoutées](telecommandes-ecoutees.md) | réagir à l'appui sur une télécommande physique |
| [Services](services.md) | les actions propres à l'intégration |
| [Événements](evenements.md) | les événements publiés sur le bus de Home Assistant |
| [Recettes d'automatisation](automatisations.md) | des automatisations complètes, commentées |
| [Pièges et limites](pieges-et-limites.md) | ce que le protocole RTS ne permet pas, et ce qu'il faut anticiper |

!!! note "Et la page Home Assistant de l'appareil ?"

    L'interface de l'appareil a elle aussi une page **Home Assistant**. Elle est décrite dans la
    documentation de l'appareil : [Home Assistant](../v3/domotique/home-assistant/index.md).
