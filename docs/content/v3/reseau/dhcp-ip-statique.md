# DHCP et IP statique

Choisit comment l'appareil obtient son adresse IP sur votre réseau local. Depuis **Réseau →
Connexion**, le bouton **DHCP / IP Statique** ouvre cette fenêtre — voir
[Connexion Réseau](index.md). Ce réglage est **indépendant du type de connexion** :
il s'applique aussi bien en Wi-Fi qu'en Ethernet.

## DHCP (par défaut)

Un commutateur bascule entre **IP Statique** et **DHCP**. Par défaut, l'appareil laisse votre
box/routeur lui attribuer automatiquement une adresse — c'est le réglage recommandé pour la
grande majorité des installations.

!!! tip "Astuce"

    Si vous voulez une adresse qui ne change jamais sans pour autant gérer vous-même
    l'adressage, la méthode la plus fiable reste la **réservation DHCP** : configurez-la dans
    les paramètres de votre box/routeur (associe l'adresse MAC de l'appareil — voir
    [Connexion Réseau](index.md#informations-réseau) — à une adresse IP fixe), plutôt
    que de basculer en IP statique ici. Vous gardez ainsi l'attribution automatique tout en
    ayant une adresse stable.

## IP Statique

Désactiver le commutateur révèle quatre champs à renseigner vous-même :

* **Adresse IP statique**
* **Masque sous-réseau**
* **Passerelle**
* **Nom serveur DNS 1** et **DNS 2** (ce dernier facultatif)

Chaque champ est validé au format `XXX.XXX.XXX.XXX` avant l'enregistrement ; adresse IP,
masque et passerelle sont obligatoires, les deux DNS sont facultatifs (mais validés au même
format s'ils sont renseignés).

!!! warning "Avertissement"

    Si vous ne maîtrisez pas ces paramètres (notamment la plage d'adresses de votre
    sous-réseau), laissez le DHCP actif. Une IP statique mal choisie — hors de la plage de
    votre routeur, en conflit avec un autre appareil, mauvaise passerelle — rend l'appareil
    injoignable sur le réseau, sans message d'erreur visible : il applique simplement une
    configuration invalide.

## Enregistrement

Contrairement à un changement de réseau Wi-Fi ou de type de connexion, enregistrer ici ne
redémarre **pas** l'appareil automatiquement — un bandeau d'information le précise dans la
fenêtre : les nouveaux réglages IP ne prendront effet qu'au **prochain redémarrage**, qu'il
vous faudra déclencher vous-même (bouton **Redémarrer**, à côté d'**Enregistrer** sur la page
[Général](../general/index.md)) si vous voulez les voir appliqués tout de suite. L'état actuel (DHCP ou IP Statique) s'affiche en badge sur le
bouton **DHCP / IP Statique**, dans la page Connexion, sans avoir à rouvrir cette fenêtre.

