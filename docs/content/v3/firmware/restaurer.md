# Restaurer le système

Réinstalle tout ou partie d'une configuration à partir d'un fichier `.backup` généré par
**Sauvegarder**. Depuis **Firmware**, le bouton **Restaurer le système** ouvre cette fenêtre
— voir [Firmware](index.md).

!!! note "Note"

    Si c'est l'**interface web elle-même** qui est endommagée (pas seulement la
    configuration), cette fenêtre ne peut pas vous aider : elle fait partie de cette même
    interface. Voir [Mode Récupération](../recuperation.md)#interface-web) pour ce
    cas de figure.

## Ce qu'on peut restaurer

Des cases à cocher choisissent précisément quoi réinstaller depuis le fichier — seule
**Équipements, groupes, pièces et plannings** est cochée par défaut :

| Case | Contenu restauré |
|---|---|
| Équipements, groupes, pièces et plannings | Tous vos équipements déclarés, leur organisation en groupes et pièces, et vos programmations horaires |
| Répéteurs | La liste des répéteurs radio enregistrés |
| Paramètres système | Nom d'hôte, NTP, préférences d'affichage, sécurité… |
| Paramètres réseau | Configuration Wi-Fi/Ethernet |
| Paramètres MQTT | Connexion au courtier MQTT |
| Paramètres radio | Configuration du module radio (broches, fréquence…) |

Au moins une case doit être cochée pour que le bouton **Téléverser** accepte la demande.

!!! warning "Avertissement"

    Les **mots de passe** (Wi-Fi, MQTT) ne sont **jamais inclus** dans une sauvegarde : après
    restauration des paramètres réseau ou MQTT concernés, il faudra les ressaisir
    manuellement. Restaurer sur un **nouveau matériel** ignore également les réglages
    Ethernet d'origine (broches EMAC propres à la carte précédente).

!!! warning "Avertissement"

    Cocher **Équipements, groupes, pièces et plannings** efface d'abord systématiquement tous
    les plannings actuellement sur l'appareil, puis ne les recharge que si le fichier en
    contient effectivement. Une sauvegarde faite avant que vos plannings n'existent (ou un
    fichier tronqué) les supprime donc, même si vous ne cherchiez qu'à récupérer vos
    équipements — voir [Anatomie du fichier de sauvegarde](anatomie-sauvegarde.md#bloc-plannings)
    pour le détail technique.

## Fichier accepté

Un fichier `.backup` de moins de 32 Ko — au-delà, il est automatiquement refusé comme
invraisemblable pour un fichier de ce type. Si le fichier sélectionné provient d'une version
**antérieure à la v2.5.0**, une fenêtre d'avertissement propose de continuer ou d'annuler :
les réglages de broches radio qu'il contient ne seront alors pas restaurés correctement, à
vérifier manuellement dans [Configurer la Radio](../radio/index.md) après coup.

## Déroulement

Après confirmation, le fichier est envoyé et traité par l'appareil — une seule barre de
progression, pas d'étapes. L'appareil redémarre systématiquement une seconde après la fin du
transfert, quelles que soient les cases cochées : l'interface se referme et se reconnecte
d'elle-même à son retour.

!!! warning "Avertissement"

    Comme pour une mise à jour, le transfert ne peut plus être interrompu une fois lancé —
    gardez l'appareil sous tension jusqu'à la fin.

