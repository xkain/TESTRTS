---
title: Documentation v2.x
hide:
  - toc
---

# Documentation v2.x

Cette section couvre la lignée **v2.x** du firmware, de la version 2.5.x à la
2.6.0 — celle qui équipe les appareils en service aujourd'hui. Elle reprend
l'intégralité du wiki du projet, page pour page.

!!! tip "Dans quel ordre lire&nbsp;?"

    Les quatre étapes ci-dessous suivent l'ordre d'une installation neuve&nbsp;:
    on prépare le matériel, on raccorde l'appareil au réseau et à la radio, on
    déclare les équipements, puis on relie le tout à la domotique.

## 1. Matériel

Préparez votre boîtier, ou fabriquez-le.

<div class="grid cards" markdown>

-   :material-package-variant-closed:{ .lg .middle } **[Boîtiers Leboncoin](materiel/boitiers-leboncoin.md)**

    ---

    Fiche technique et assistant d'auto-configuration pour un boîtier prêt à
    l'emploi.

-   :material-chip:{ .lg .middle } **[Composants](materiel/composants.md)**

    ---

    Le matériel nécessaire pour fabriquer soi-même un appareil ESPSomfy-RTS,
    carte par carte.

-   :material-toggle-switch-outline:{ .lg .middle } **[Contrôle des moteurs avec GPIO](materiel/controle-moteurs-gpio.md)**

    ---

    Raccordement de boutons et de commandes physiques sur les broches de la
    carte.

</div>

## 2. Premiers pas

Raccorder l'appareil à votre réseau, puis accorder sa radio.

<div class="grid cards" markdown>

-   :material-wifi:{ .lg .middle } **[Connexion](configuration/connexion.md)**

    ---

    Onglet *Réseau* — se connecter en
    [Wi-Fi](configuration/connexion.md#utiliser-une-connexion-wifi) ou en
    [Ethernet](configuration/connexion.md#utiliser-une-connexion-ethernet),
    et [que faire si la connexion
    échoue](configuration/connexion.md#lappareil-ne-rejoint-pas-mon-wi-fi).

-   :material-ip-network-outline:{ .lg .middle } **[DHCP et IP statique](configuration/dhcp-ip-statique.md)**

    ---

    Donner à l'appareil une adresse qui ne change plus, par
    [réservation DHCP](configuration/dhcp-ip-statique.md#la-bonne-méthode--la-réservation-dhcp)
    ou en
    [IP statique](configuration/dhcp-ip-statique.md#lip-statique-utilisateurs-avancés).

-   :material-cog-outline:{ .lg .middle } **[Configurer le système](configuration/systeme.md)**

    ---

    Options générales, [sécurité](configuration/systeme.md#sécurité) et
    [firmware](configuration/systeme.md#firmware).

-   :material-radio-tower:{ .lg .middle } **[Configurer la radio](radio/configurer.md)**

    ---

    [Assignation des GPIO](radio/configurer.md#assignation-gpio) et
    [réglage des fréquences](radio/configurer.md#accorder-la-radio), avec un
    cas concret si
    [certains équipements ne répondent pas](radio/configurer.md#exemple--6-équipements-sur-8-répondent).

-   :material-text-box-search-outline:{ .lg .middle } **[Journaux radio](radio/journaux.md)**

    ---

    Lire les trames reçues,
    [identifier le protocole](radio/journaux.md#identifier-le-protocole-colonne-bits)
    de vos moteurs et [dépanner la radio](radio/journaux.md#guide-de-dépannage).

-   :material-sine-wave:{ .lg .middle } **[Balayage de fréquence](radio/balayage-frequence.md)**

    ---

    Mesurer la fréquence réelle d'une télécommande.

</div>

## 3. Gestion Somfy RTS

Créer votre installation, lier les moteurs et les télécommandes.

<div class="grid cards" markdown>

-   :material-floor-plan:{ .lg .middle } **[Pièces (Rooms)](somfy/pieces.md)**

    ---

    Organiser et découper votre logement par zones.

-   :material-window-shutter:{ .lg .middle } **[Équipements](somfy/equipements.md)**

    ---

    Ajouter vos volets, stores ou portes de garage, et gérer
    l'[appairage](somfy/equipements.md#2-appairage-pairing), les
    [télécommandes](somfy/equipements.md#3-liaison-de-télécommande-link-remote)
    et les [rolling codes](somfy/equipements.md#5-définir-code-rolling-code).

-   :material-group:{ .lg .middle } **[Groupes (Groups)](somfy/groupes.md)**

    ---

    Centraliser plusieurs équipements derrière une seule commande.

-   :material-signal-distance-variant:{ .lg .middle } **[Répéteurs (Repeaters)](somfy/repeteurs.md)**

    ---

    Étendre la portée du signal radio.

-   :material-remote:{ .lg .middle } **[Télécommande virtuelle](somfy/telecommande-virtuelle.md)**

    ---

    Simuler un émetteur physique depuis l'interface.

</div>

## 4. Intégrations et domotique

Connecter vos équipements à vos serveurs et applications.

<div class="grid cards" markdown>

-   :material-transit-connection-variant:{ .lg .middle } **[Intégrations](integrations/index.md)**

    ---

    [Vue d'ensemble](integrations/index.md#options-de-connectivité-disponibles)
    des services vers d'autres systèmes, et
    [l'interface REST](integrations/index.md#interface-rest-api).

-   :material-swap-horizontal:{ .lg .middle } **[MQTT](integrations/mqtt.md)**

    ---

    [Sujets publiés](integrations/mqtt.md#sujets-publiés-published-topics),
    [sujets souscrits](integrations/mqtt.md#sujets-souscrits-subscribed-topics)
    et
    [auto-découverte](integrations/mqtt.md#auto-découverte-mqtt-auto-discovery).

-   :material-home-assistant:{ .lg .middle } **[Home Assistant](integrations/home-assistant.md)**

    ---

    [Installation via HACS](integrations/home-assistant.md#installation-via-hacs)
    de l'intégration dédiée, et compatibilité avec celle de rstrouse.

</div>

## Maintenance

<div class="grid cards" markdown>

-   :material-backup-restore:{ .lg .middle } **[Factory Reset](maintenance/factory-reset.md)**

    ---

    Restaurer l'appareil à son état d'origine, à deux paliers.

-   :material-update:{ .lg .middle } **[Mise à jour 2.6.0](maintenance/mise-a-jour-2.6.0.md)**

    ---

    Ce qui change et ce qu'il faut vérifier au passage à la 2.6.0.

-   :material-console:{ .lg .middle } **Moniteur série**

    ---

    Se connecter au port série de l'appareil depuis un navigateur ou un autre
    outil. Page encore hébergée sur le
    [wiki](https://github.com/xkain/ESPSomfy-RTS/wiki/Journaux-du-port-serie).

</div>
