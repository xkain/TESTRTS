---
title: Documentation v3.x
hide:
  - toc
---

# Documentation v3.x

Cette section couvre la lignée **v3.x et suivantes** du firmware.

!!! info "Documentation en cours d'enrichissement"

    L'essentiel de l'interface est documenté. Les pages se complètent au fil
    des versions&nbsp;; la [documentation v2.x](../v2/index.md) reste valable
    pour le protocole radio et la logique d'appairage, qui n'ont pas changé de
    nature.

## 1. Matériel { #materiel }

<div class="grid cards" markdown>

-   :material-package-variant-closed:{ .lg .middle } **[Boîtiers officiels](materiel/boitiers-officiels.md)**

    ---

    Fiche technique des boîtiers officiels, livrés préconfigurés.

-   :material-chip:{ .lg .middle } **[Composants](../commun/composants.md)**

    ---

    Le matériel nécessaire pour fabriquer soi-même un appareil, carte par
    carte.

-   :material-toggle-switch-outline:{ .lg .middle } **[Contrôle des moteurs avec GPIO](materiel/controle-moteurs-gpio.md)**

    ---

    Raccordement de boutons et de commandes physiques sur les broches de la
    carte.

</div>

## 2. Installation { #installation }

<div class="grid cards" markdown>

-   :material-usb-flash-drive:{ .lg .middle } **[Installateur web](../outils/installateur-web.md)**

    ---

    **La voie recommandée** : écrit le firmware sur l'ESP32 par le câble USB,
    depuis le navigateur.

-   :material-lifebuoy:{ .lg .middle } **[Installateur de secours](../outils/installateur-esphome.md)**

    ---

    Si le premier ne fonctionne pas pour vous&nbsp;: web.esphome.io, pas à pas.

-   :material-swap-horizontal:{ .lg .middle } **[Passer de la v2 à la v3](migration.md)**

    ---

    Sauvegarder, flasher, restaurer&nbsp;: la migration d'un appareil en v2.x.

</div>

## 3. Tableau de bord { #tableau-de-bord }

L'écran d'accueil de l'interface : le parcours de démarrage tant qu'elle est vide, puis vos
équipements et groupes sous forme de cartes.

<div class="grid cards" markdown>

-   :material-home-outline:{ .lg .middle } **[Page d'accueil](accueil.md)**

    ---

    La barre du haut, le menu, et le parcours en trois étapes qu'affiche l'interface tant qu'elle est vide.

-   :material-view-dashboard-outline:{ .lg .middle } **[Tableau de bord](tableau-de-bord.md)**

    ---

    Les cartes d'équipements et de groupes : commandes, état, détail déplié, position favorite.

</div>

## 4. Réseau { #reseau }

Relier l'appareil à votre réseau, en Wi-Fi ou en Ethernet : c'est la première étape.

<div class="grid cards" markdown>

-   :material-lan-connect:{ .lg .middle } **[Connexion réseau](reseau/index.md)**

    ---

    Wi-Fi ou Ethernet, réseau caché, itinérance, repli vers le Wi-Fi.

-   :material-wizard-hat:{ .lg .middle } **[Assistant de connexion](reseau/assistant-de-connexion.md)**

    ---

    Le parcours guidé, depuis le point d'accès de secours.

-   :material-ip-network-outline:{ .lg .middle } **[DHCP et IP statique](reseau/dhcp-ip-statique.md)**

    ---

    Laisser votre box attribuer l'adresse, ou la fixer.

-   :material-wifi-lock:{ .lg .middle } **[Mot de passe du point d'accès](reseau/mot-de-passe-point-d-acces.md)**

    ---

    Protéger le réseau de secours que l'appareil ouvre quand il n'a plus de réseau.

-   :material-server-network:{ .lg .middle } **[Paramètres MQTT](reseau/parametres-mqtt.md)**

    ---

    Relier l'appareil à un courtier MQTT.

</div>

## 5. Radio { #radio }

Activer la radio et vérifier que vos télécommandes sont reconnues : si toutes le sont, rien n'est à régler.

<div class="grid cards" markdown>

-   :material-radio-tower:{ .lg .middle } **[Configurer la radio](radio/index.md)**

    ---

    Activer la radio et régler ses paramètres.

-   :material-remote:{ .lg .middle } **[Test des télécommandes](radio/assistant-de-reglages.md)**

    ---

    Vérifier que l'appareil entend vos télécommandes.

-   :material-sine-wave:{ .lg .middle } **[Balayage de fréquence](radio/balayage-frequence.md)**

    ---

    Retrouver la fréquence exacte de vos télécommandes.

-   :material-text-box-search-outline:{ .lg .middle } **[Journal radio](radio/journal.md)**

    ---

    Les trames reçues et émises, en direct.

-   :material-lifebuoy:{ .lg .middle } **[Dépannage radio](radio/depannage.md)**

    ---

    Quand des équipements n'obéissent pas, ou mal.

</div>

## 6. Gestion Somfy RTS { #somfy }

<div class="grid cards" markdown>

-   :material-window-shutter:{ .lg .middle } **[Équipements](somfy/equipements/index.md)**

    ---

    Ajouter volets, stores, portes de garage et portails&nbsp;: [Ajouter un équipement](somfy/equipements/mise-en-service.md) (la mise en service guidée),
    l'appairage, les temps de course, les télécommandes et la plannification.

-   :material-group:{ .lg .middle } **[Groupes](somfy/groupes/index.md)**

    ---

    Centraliser plusieurs équipements sous une même commande.

-   :material-door-open:{ .lg .middle } **[Pièces](somfy/pieces.md)**

    ---

    Organiser la maison par zones.

-   :material-repeat:{ .lg .middle } **[Répéteurs](somfy/repeteurs.md)**

    ---

    Étendre la portée du signal radio.

-   :material-remote:{ .lg .middle } **[Télécommande virtuelle](somfy/telecommande-virtuelle.md)**

    ---

    Simuler un émetteur physique depuis l'interface.

</div>

## 7. Système { #systeme }

<div class="grid cards" markdown>

-   :material-cog-outline:{ .lg .middle } **[Général](general/index.md)**

    ---

    Identité et services, langue et région, apparence, sécurité et mises à jour.

-   :material-memory:{ .lg .middle } **[Firmware](firmware/index.md)**

    ---

    Matériel, mises à jour, témoin LED, sauvegarde, restauration, mémoire et stockage.

</div>

## 8. Intégrations et domotique { #integrations }

<div class="grid cards" markdown>

-   :material-connection:{ .lg .middle } **[Options d'intégration](integrations/index.md)**

    ---

    API REST, MQTT et Home Assistant&nbsp;: vue d'ensemble.

-   :material-home-assistant:{ .lg .middle } **[Intégration Home Assistant](integrations/home-assistant/index.md)**

    ---

    Les services, entités, attributs et événements exposés par l'intégration
    `espsomfy_rts_enhanced` — huit pages, de la découverte aux pièges connus.

</div>

## 9. Maintenance { #maintenance }

<div class="grid cards" markdown>

-   :material-lifebuoy:{ .lg .middle } **[Mode Récupération](recuperation.md)**

    ---

    Reprendre la main sur un appareil dont l'interface ne répond plus.

-   :material-console-line:{ .lg .middle } **[Journaux de l'installateur web](../outils/installateur-web.md#journaux)**

    ---

    **Premier réflexe** quand plus rien ne répond par le réseau : tout ce que
    la carte écrit sur son port série, horodaté.

-   :material-console:{ .lg .middle } **[Journaux du port série](../outils/journaux-port-serie.md)**

    ---

    **En second recours**, avec un moniteur série classique.

-   :material-backup-restore:{ .lg .middle } **[Restaurer le système](firmware/restaurer.md)**

    ---

    Rétablir une configuration depuis un fichier de sauvegarde.

</div>

Les [outils en ligne](../outils/index.md) fonctionnent avec les deux lignées.
