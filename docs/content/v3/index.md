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

## Matériel { #materiel }

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

-   :material-lifebuoy:{ .lg .middle } **[Mode Récupération](recuperation.md)**

    ---

    Reprendre la main sur un appareil dont l'interface ne répond plus.

</div>

## Configuration de l'interface { #configuration }

<div class="grid cards" markdown>

-   :material-cog-outline:{ .lg .middle } **[Général](general/index.md)**

    ---

    Sécurité, langues, retours tactiles, tableau de bord et position
    géographique.

-   :material-memory:{ .lg .middle } **[Firmware](firmware/index.md)**

    ---

    État matériel, mises à jour, témoin LED, sauvegarde et restauration.

-   :material-lan:{ .lg .middle } **[Réseau](reseau/index.md)**

    ---

    Connexion Wi-Fi et Ethernet, DHCP et IP statique, point d'accès, MQTT.

-   :material-radio-tower:{ .lg .middle } **[Radio](radio/index.md)**

    ---

    Réglages de la radio, balayage de fréquence, journal et dépannage.

</div>

## Gestion Somfy RTS { #somfy }

<div class="grid cards" markdown>

-   :material-door-open:{ .lg .middle } **[Pièces](somfy/pieces.md)**

    ---

    Organiser la maison par zones.

-   :material-window-shutter:{ .lg .middle } **[Équipements](somfy/equipements/index.md)**

    ---

    Ajouter volets, stores, portes de garage et portails&nbsp;: calibration,
    appairage, télécommandes et plannification.

-   :material-group:{ .lg .middle } **[Groupes](somfy/groupes/index.md)**

    ---

    Centraliser plusieurs équipements sous une même commande.

-   :material-repeat:{ .lg .middle } **[Répéteurs](somfy/repeteurs.md)**

    ---

    Étendre la portée du signal radio.

-   :material-remote:{ .lg .middle } **[Télécommande virtuelle](somfy/telecommande-virtuelle.md)**

    ---

    Simuler un émetteur physique depuis l'interface.

</div>

## Intégrations et domotique { #integrations }

<div class="grid cards" markdown>

-   :material-connection:{ .lg .middle } **[Options d'intégration](integrations/index.md)**

    ---

    API REST, MQTT et Home Assistant&nbsp;: vue d'ensemble.

-   :material-home-assistant:{ .lg .middle } **[Intégration Home Assistant](integrations/home-assistant/index.md)**

    ---

    Les services, entités, attributs et événements exposés par l'intégration
    `espsomfy_rts_enhanced` — huit pages, de la découverte aux pièges connus.

</div>

Les [outils en ligne](../outils/index.md) fonctionnent avec les deux lignées.
