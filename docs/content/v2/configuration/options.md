# Options

Cette page couvre le sous-onglet **Options** de l'onglet **Système**, décrit dans l'ordre où les
réglages apparaissent à l'écran.

---

<img width="100%" src="../img/options-clair.webp#only-light" /><img width="100%" src="../img/options-sombre.webp#only-dark" />

## 1. Les deux assistants (en haut)

Avant les réglages, deux boutons ouvrent chacun une fenêtre d'aide. Ils ne modifient rien par
eux-mêmes.

* **Boîtier acheté en ligne** — un assistant de préconfiguration en quatre étapes : fuseau
    horaire `Europe/Paris`, interface en français, assignation des GPIO propres au boîtier et
    activation de la radio. Il est réservé aux boîtiers prêts à l'emploi — voir
    [Boîtiers préassemblés](../materiel/boitiers-preassembles.md).
* **Home Assistant** — rappelle à quoi sert l'intégration et comment l'installer via le Marketplace (anciennement HACS). Le
    détail est sur la page [Home Assistant](../../commun/home-assistant.md).

!!! note "Note"

    Le bouton **Boîtier acheté en ligne** n'apparaît **que si l'interface est en français**. En
    anglais, en allemand ou en espagnol, il reste masqué : l'assistant ne configure que des
    boîtiers vendus en France.

## 2. Identité et heure

| Réglage | Ce qu'il fait |
| --- | --- |
| **Nom d'hôte** | Le nom de l'appareil sur le réseau (32 caractères au maximum). Si vous avez plusieurs boîtiers, donnez-leur des noms différents, sinon ils se disputent le même nom. |
| **Fuseau horaire** | Détermine l'heure locale. C'est elle qui s'affiche dans les [Journaux Radio](../radio/journaux.md). |
| **Langue** | **Français**, **anglais**, **allemand** ou **espagnol**. |
| **Serveur NTP** | Le serveur qui donne l'heure (32 caractères au maximum). `pool.ntp.org` par défaut ; indiquez le vôtre si votre réseau n'a pas accès à Internet. |

!!! note "Note"

    Changer la langue recharge la page immédiatement, le choix est mémorisé
    dans l'appareil sans avoir besoin de cliquer sur le bouton `Enregistrer`

## 3. Réseau et mises à jour

Deux commutateurs.

* **Diffusion uPnP (SSDP)** — l'appareil s'annonce sur le réseau pour que les autres équipements
    le découvrent tout seuls. Sous Windows, il apparaît alors dans *Explorateur de fichiers >
    Réseau*.
* **Mises à jour** — l'appareil interroge périodiquement GitHub pour savoir si une version plus
    récente existe. Quand c'est le cas, un bandeau s'affiche dans l'interface et dans Home
    Assistant. Le détail est sur la page [Firmware](firmware.md).

!!! note "Note"

    Ce commutateur ne gouverne que la **vérification**. Rien ne s'installe jamais tout seul :
    une mise à jour reste toujours une action que vous déclenchez.

## 4. Apparence

* **Mode d'affichage** — **Dépend du navigateur** (l'appareil suit la préférence claire ou
    sombre de votre système), **Mode sombre** ou **Mode clair**.
* **Couleur** — la couleur d'accentuation des boutons et des menus, `#1a5fb4` par défaut.

!!! important "Important"

    La couleur s'applique à l'écran dès que vous la choisissez, mais elle n'est **pas encore
    enregistrée**. Sans un clic sur `Enregistrer`, elle revient à la précédente au prochain
    chargement de la page.

## 5. Les deux boutons du bas

* `Redémarrer` — redémarre l'appareil. Les réglages non enregistrés sont perdus.
* `Enregistrer` — écrit en mémoire tout ce que vous avez modifié sur cette page. Passez les
    options en revue de haut en bas, puis cliquez une seule fois à la fin.

---

## Étape suivante

* [Sécurité](securite.md) — protéger l'accès à l'interface.
* [Firmware](firmware.md) — état de l'appareil, mises à jour, sauvegarde et restauration.

