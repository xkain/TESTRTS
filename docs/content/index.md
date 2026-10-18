---
title: Accueil
template: home.html
hide:
  - toc
---

## Démarrer en 4 étapes { #demarrer }

Du matériel à votre premier équipement piloté, dans cet ordre&nbsp;:

<div class="grid cards rts-steps" markdown>

-   :material-numeric-1-circle:{ .lg .middle } **[Réunir le matériel](commun/composants.md)**

    ---

    Un module ESP32, un module radio CC1101 et 8 câbles Dupont. Aucune
    soudure.

-   :material-numeric-2-circle:{ .lg .middle } **[Flasher le firmware](outils/installateur-web.md)**

    ---

    Depuis le navigateur, par le câble USB. Rien à installer sur
    l'ordinateur.

-   :material-numeric-3-circle:{ .lg .middle } **[Se connecter au réseau](v3/reseau/assistant-de-connexion.md)**

    ---

    Un assistant guide la connexion de l'appareil à votre Wi-Fi ou à votre
    câble Ethernet.

-   :material-numeric-4-circle:{ .lg .middle } **[Ajouter vos équipements](v3/somfy/equipements/index.md)**

    ---

    Volets, stores, portes de garage, portails&nbsp;: appairage, télécommandes,
    plannings.

</div>

<p class="rts-aside" markdown>
Vous préférez un appareil déjà assemblé et préconfiguré&nbsp;? Voir les
[boîtiers officiels](boitiers/index.md) — fiches
[v3.x](v3/materiel/boitiers-officiels.md) et
[v2.x](v2/materiel/boitiers-preassembles.md).
</p>

## Un appareil en v2.x&nbsp;?

!!! tip rts-upgrade "Passez à la v3"

    La v3 apporte une interface repensée, le contact sec, les plannings
    multi-horaires et une intégration Home Assistant dédiée. Une sauvegarde
    d'une v2.5.x se restaure telle quelle.

    [Passer de la v2 à la v3](v3/migration.md){ .md-button .md-button--primary }
    [Documentation v2.x](v2/index.md){ .md-button }

## Home Assistant

<div class="grid cards" markdown>

-   :material-home-assistant:{ .lg .middle .rts-blue } **Une intégration dédiée**

    ---

    Vos équipements sont reconnus comme des volets natifs de Home Assistant&nbsp;:
    pilotage à la voix, automatisations, et des services propres au protocole
    RTS. L'intégration s'installe par le Marketplace (anciennement HACS).

    [:octicons-arrow-right-24: Installer l'intégration](commun/home-assistant.md#installation-via-le-marketplace-anciennement-hacs)
    [:octicons-arrow-right-24: Documentation de l'intégration](v3/integrations/home-assistant/index.md)

</div>

## Documentation v3.x

<div class="grid cards rts-steps" markdown>

-   :material-package-variant-closed:{ .lg .middle } **[Matériel](v3/index.md#materiel)**

    ---

    Boîtiers officiels, composants, contrôle par GPIO, mode Récupération.

-   :material-cog-outline:{ .lg .middle } **[Configuration de l'interface](v3/index.md#configuration)**

    ---

    Général, firmware, réseau, radio.

-   :material-window-shutter:{ .lg .middle } **[Gestion Somfy RTS](v3/index.md#somfy)**

    ---

    Pièces, équipements, groupes, répéteurs, télécommande virtuelle.

-   :material-home-assistant:{ .lg .middle } **[Intégrations et domotique](v3/index.md#integrations)**

    ---

    API REST, MQTT et Home Assistant.

</div>

## Questions fréquentes

??? question "Quelle version de firmware ai-je&nbsp;?"

    Elle est affichée dans l'interface, sous **Système → Firmware**. En 2.x.x,
    suivez la [documentation v2.x](v2/index.md)&nbsp;; en 3.x.x et plus, la
    [documentation v3.x](v3/index.md).

??? question "Mes télécommandes d'origine fonctionnent-elles encore&nbsp;?"

    Oui&nbsp;: l'appairage équivaut à ajouter une télécommande de plus. Liez-les
    pour que la position affichée reste juste
    ([détail](faq/telecommandes.md)).

??? question "Un équipement ne répond pas"

    Vérifiez d'abord que la radio tourne, puis l'appairage et la fréquence
    ([marche à suivre](faq/equipement-ne-repond-pas.md)).

??? question "MQTT ou intégration Home Assistant&nbsp;?"

    Avec Home Assistant, l'intégration dédiée&nbsp;; avec un autre système, MQTT
    ([comparaison](faq/mqtt-ou-home-assistant.md)).

[Toutes les questions](faq/index.md) · [Obtenir de l'aide](aide/index.md)

## Aller plus loin

<div class="grid cards" markdown>

-   :material-console:{ .lg .middle } **[Journaux du port série](commun/journaux-port-serie.md)**

    ---

    Lire ce que dit la carte quand plus rien ne répond par le réseau.

-   :material-map-marker-outline:{ .lg .middle } **[Géolocalisation](outils/geolocalisation.md)**

    ---

    Les coordonnées GPS pour les programmations au lever et au coucher du
    soleil.

</div>

## À propos du projet

Ce projet est un fork du firmware de
[rstrouse](https://github.com/rstrouse/ESPSomfy-RTS). Il conserve le protocole
RTS d'origine et son fonctionnement radio, et repose dessus une interface
simplifiée et multilingue.

!!! tip "Une erreur, un lien mort, une explication confuse&nbsp;?"

    Cette documentation est vivante. Signalez ce qui cloche en ouvrant une
    [issue](https://github.com/xkain/ESPSomfy-RTS/issues) — c'est ce qui la
    fait avancer.
