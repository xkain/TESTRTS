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

    Les sections ci-dessous suivent l'ordre d'une installation neuve&nbsp;:
    on prépare le matériel, on raccorde l'appareil au réseau et à la radio, on
    déclare les équipements, on règle le système, puis on relie le tout à la
    domotique.

## 1. Matériel

Préparez votre boîtier, ou fabriquez-le.

<div class="grid cards" markdown>

-   :material-package-variant-closed:{ .lg .middle } **[Boîtiers officiels](materiel/boitiers-preassembles.md)**

    ---

    Fiche technique et assistant d'auto-configuration pour un boîtier prêt à
    l'emploi.

-   :material-chip:{ .lg .middle } **[Composants](../commun/composants.md)**

    ---

    Le matériel nécessaire pour fabriquer soi-même un appareil ESPSomfy-RTS,
    carte par carte.

-   :material-toggle-switch-outline:{ .lg .middle } **[Contrôle des moteurs avec GPIO](materiel/controle-moteurs-gpio.md)**

    ---

    Raccordement de boutons et de commandes physiques sur les broches de la
    carte.

</div>

## 2. Installation

Écrire le firmware sur la carte, et la démarrer pour la première fois.

<div class="grid cards" markdown>

-   :material-usb-port:{ .lg .middle } **[Guide d'installation](installation/guide.md)**

    ---

    [Choisir la bonne image](installation/guide.md#3-télécharger-la-bonne-image),
    [flasher par USB](installation/guide.md#5-flasher-par-usb) et
    [démarrer](installation/guide.md#6-premier-démarrage) — y compris
    [en venant du firmware de rstrouse](installation/guide.md#7-si-vous-veniez-du-firmware-de-rstrouse).

</div>

## 3. Tableau de bord

L'écran d'accueil de l'interface, où l'on commande ses équipements.

<div class="grid cards" markdown>

-   :material-view-dashboard-outline:{ .lg .middle } **[Tableau de bord](tableau-de-bord.md)**

    ---

    L'écran d'accueil de l'interface :
    [les cartes d'équipement](tableau-de-bord.md#8-les-cartes-déquipement) et
    [les deux fenêtres glissantes](tableau-de-bord.md#9-les-deux-fenêtres-glissantes).

</div>

## 4. Réseau

Raccorder l'appareil à votre réseau, en Wi-Fi ou en Ethernet.

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

</div>

## 5. Radio

Accorder la radio, et lire ce qu'elle reçoit.

<div class="grid cards" markdown>

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

## 6. Gestion Somfy RTS

Créer votre installation, lier les moteurs et les télécommandes.

<div class="grid cards" markdown>

-   :material-floor-plan:{ .lg .middle } **[Pièces (Rooms)](somfy/pieces.md)**

    ---

    Organiser et découper votre logement par zones.

-   :material-window-shutter:{ .lg .middle } **[Équipements](somfy/equipements.md)**

    ---

    Ajouter vos volets, stores ou portes de garage, et gérer
    l'[appairage](somfy/equipements.md#5-appairer-le-moteur), les
    [télécommandes](somfy/equipements.md#6-lier-vos-télécommandes-physiques)
    et le [code tournant](somfy/equipements.md#8-définir-le-code-tournant).

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

## 7. Système

Nom d'hôte, sécurité, firmware et mises à jour.

<div class="grid cards" markdown>

-   :material-cog-outline:{ .lg .middle } **[Options](configuration/options.md)**

    ---

    Onglet *Système* — nom d'hôte, fuseau horaire, langue et apparence de
    l'interface.

-   :material-lock-outline:{ .lg .middle } **[Sécurité](configuration/securite.md)**

    ---

    Protéger l'accès par code PIN ou mot de passe, et choisir
    [l'étendue de la protection](configuration/securite.md#2-configuration-sécurisée-uniquement).

-   :material-chip:{ .lg .middle } **[Firmware](configuration/firmware.md)**

    ---

    État de l'appareil,
    [mises à jour](configuration/firmware.md#3-les-mises-à-jour) et
    [sauvegarde et restauration](configuration/firmware.md#sauvegarde-et-restauration).

-   :material-update:{ .lg .middle } **[Mettre à jour](configuration/mettre-a-jour.md)**

    ---

    [Les fichiers d'une release](configuration/mettre-a-jour.md#2-les-fichiers-dune-release),
    la [mise à jour depuis GitHub](configuration/mettre-a-jour.md#3-github-mise-à-jour)
    et [le passage entre les v2.x.x et la v3](configuration/mettre-a-jour.md#le-passage-entre-les-v2xx-et-la-v3).

</div>

## 8. Intégrations et domotique

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

-   :material-home-assistant:{ .lg .middle } **[Home Assistant](../commun/home-assistant.md)**

    ---

    [Installation via le Marketplace (anciennement HACS)](../commun/home-assistant.md#installation-via-le-marketplace-anciennement-hacs)
    de l'intégration dédiée, et compatibilité avec celle de rstrouse.

</div>

## 9. Maintenance

<div class="grid cards" markdown>

-   :material-console-line:{ .lg .middle } **[Journaux de l'installateur web](../outils/installateur-web.md#journaux)**

    ---

    **Premier réflexe** quand plus rien ne répond par le réseau : l'installateur
    web d'ESPSomfy-RTS affiche, horodaté, tout ce que la carte écrit sur son
    port série.

-   :material-console:{ .lg .middle } **[Journaux du port série](../outils/journaux-port-serie.md)**

    ---

    **En second recours**, avec un moniteur série classique, si l'installateur
    ne convient pas : comment lire le port série et ce qu'il dit.

-   :material-backup-restore:{ .lg .middle } **[Factory Reset](maintenance/factory-reset.md)**

    ---

    Restaurer l'appareil à son état d'origine, à deux paliers.

-   :material-file-tree:{ .lg .middle } **[Anatomie du fichier de sauvegarde](maintenance/anatomie-sauvegarde.md)**

    ---

    Ce que contient un `.backup`, enregistrement par enregistrement — et ce
    qu'une restauration partielle remet réellement en place.

</div>
