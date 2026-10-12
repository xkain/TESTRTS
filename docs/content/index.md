---
title: Accueil
template: home.html
hide:
  - toc
---

## Quelle documentation vous concerne&nbsp;?

La version de votre firmware est affichée dans l'interface de l'appareil, sous
**Système → Firmware**, et sur la page de connexion. Les deux lignées ne se
configurent pas tout à fait de la même façon&nbsp;: choisissez celle que vous
utilisez.

<div class="grid cards" markdown>

-   :material-check-decagram:{ .lg .middle .rts-blue } **Documentation v2.x**

    ---

    La lignée en service aujourd'hui, des versions 2.5.x à 2.6.0. Matériel,
    connexion réseau, réglage de la radio, appairage des équipements,
    intégrations MQTT et Home Assistant, réinitialisation.

    **Documentation complète.**

    [:octicons-arrow-right-24: Ouvrir la documentation v2.x](v2/index.md)

-   :material-flask-outline:{ .lg .middle .rts-green } **Documentation v3.x**

    ---

    La lignée suivante, en développement. Interface repensée, contact sec,
    plannings multi-horaires, nouvelle intégration Home Assistant.

    **En cours de rédaction** — ce qui est écrit est à jour, le reste arrive.

    [:octicons-arrow-right-24: Ouvrir la documentation v3.x](v3/index.md)

</div>

## Outils en ligne

Ces deux outils fonctionnent dans le navigateur, quelle que soit la lignée
installée sur votre appareil.

<div class="grid cards" markdown>

-   :material-usb-flash-drive-outline:{ .lg .middle } **Installateur web**

    ---

    Écrit le firmware sur la puce par le câble USB, sans rien installer sur
    l'ordinateur.

    [:octicons-arrow-right-24: Lire la page](outils/installateur-web.md)

-   :material-map-marker-outline:{ .lg .middle } **Géolocalisation**

    ---

    Fournit les coordonnées GPS dont l'appareil a besoin pour les
    programmations au lever et au coucher du soleil.

    [:octicons-arrow-right-24: Lire la page](outils/geolocalisation.md)

</div>

## À propos du projet

Ce projet est un fork du firmware de
[rstrouse](https://github.com/rstrouse/ESPSomfy-RTS). Il conserve le protocole
RTS d'origine et son fonctionnement radio, et repose dessus une interface
simplifiée et multilingue.

Pour l'API brute, le MQTT avancé ou le fonctionnement interne du protocole, la
[documentation de rstrouse](https://github.com/rstrouse/ESPSomfy-RTS/wiki)
reste la référence.

!!! tip "Une erreur, un lien mort, une explication confuse&nbsp;?"

    Cette documentation est vivante. Signalez ce qui cloche en ouvrant une
    [issue](https://github.com/xkain/ESPSomfy-RTS/issues) — c'est ce qui la
    fait avancer.
