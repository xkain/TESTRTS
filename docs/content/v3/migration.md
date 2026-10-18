---
title: Passer de la v2 à la v3
---

# Passer de la v2 à la v3

Vous avez un appareil en **v2.x** et vous voulez passer à la **v3.x**&nbsp;? Le
chemin tient en trois temps&nbsp;: **sauvegarder, flasher, restaurer**. Votre
installation, codes tournants compris, se retrouve intacte.

## Pourquoi migrer

La v3 apporte une interface repensée, le **contact sec**, les **plannings
multi-horaires** et une intégration Home Assistant dédiée. Le protocole radio
et la logique d'appairage n'ont pas changé : vos moteurs ne sont pas à
réappairer.

## Ce qu'il faut savoir avant

!!! warning "Ce n'est pas une mise à jour en un clic"

    Un changement de version majeure n'est **pas** proposé par la page
    [Mises à jour du firmware](firmware/mises-a-jour.md)&nbsp;: la structure des
    partitions a changé entre les deux. La migration passe par un **flash USB
    complet**, avec l'[Installateur web](../outils/installateur-web.md), qui
    **efface toute la mémoire** de l'appareil. D'où la sauvegarde d'abord.

Il vous faut&nbsp;:

- l'appareil **branché en USB** à un ordinateur, avec le pilote de son
  convertisseur USB-série (CP2102 ou CH340 selon la carte)&nbsp;;
- un navigateur compatible, comme pour l'Installateur web.

## 1. Sauvegarder (avant tout)

Depuis l'interface de l'appareil, **Système → Firmware → Sauvegarder** produit
un fichier `.backup`. Gardez-le précieusement&nbsp;: il contient vos équipements,
groupes, pièces, plannings, répéteurs et réglages, **et les codes tournants**,
sans lesquels vos moteurs cesseraient de répondre.

!!! tip "Un fichier de sauvegarde v2.5.x se restaure en v3"

    La sauvegarde d'un appareil en v2.5.x se relit sans conversion sur la v3.

!!! danger "Notez vos mots de passe"

    Les **mots de passe** (Wi-Fi, MQTT) ne sont **jamais inclus** dans une
    sauvegarde. Notez-les avant de flasher&nbsp;: il faudra les ressaisir.

Si vous utilisez la sécurité de l'appareil (PIN), gardez aussi ses
identifiants sous la main.

## 2. Flasher la v3

Suivez la page de l'[Installateur web](../outils/installateur-web.md)&nbsp;:
connexion de la carte, choix de la version, écriture. Deux points à retenir&nbsp;:

- l'installation commence par un **effacement complet** de la mémoire&nbsp;;
- sur le **boîtier Wi-Fi & Ethernet**, maintenez le bouton poussoir sous le
  boîtier enfoncé pendant l'opération (le détail est sur la page de
  l'installateur).

À la fin, l'appareil redémarre. N'ayant plus d'identifiants Wi-Fi, il ouvre son
**point d'accès de secours** : connectez-vous-y pour lancer l'assistant de
premier démarrage (voir [Assistant de connexion](reseau/assistant-de-connexion.md)).

## 3. Restaurer la sauvegarde

Une fois l'appareil de nouveau joignable, ouvrez **Système → Firmware →
Restaurer le système** et envoyez votre fichier `.backup` (moins de 32&nbsp;Ko).
Le détail des cases à cocher est sur la page
[Restaurer le système](firmware/restaurer.md).

- Cochez ce que vous voulez retrouver&nbsp;: équipements, réseau, MQTT, radio…
- L'appareil **redémarre** une seconde après la fin du transfert.
- **Ressaisissez ensuite** les mots de passe Wi-Fi et MQTT s'ils ont été
  restaurés sans eux.

!!! note "Sauvegarde antérieure à la v2.5.0"

    Les réglages de broches radio d'un fichier plus ancien ne sont pas
    restaurés correctement&nbsp;: vérifiez-les dans
    [Configurer la radio](radio/index.md).

## Après la migration

- **Vérifiez vos équipements** dans l'interface&nbsp;: positions, noms, plannings.
- Si vous utilisez **Home Assistant**, consultez la page de l'
  [intégration dédiée](integrations/home-assistant/index.md) et son
  [installation par le Marketplace (anciennement HACS)](../commun/home-assistant.md#installation-via-le-marketplace-anciennement-hacs).
- En cas de souci, [l'aide](../aide/index.md) rassemble les pages de diagnostic.

La [documentation v2.x](../v2/index.md) reste disponible tant que vous avez des
appareils en v2.
