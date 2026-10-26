# Groupes (Groups)

ESPSomfy-RTS permet de créer des groupes d'équipements. Contrairement à une exécution
séquentielle (un équipement après l'autre), un groupe utilise une **adresse radio unique**
partagée : la commande Haut/Ma Position/Bas part en **une seule trame**, reçue
simultanément par tous les moteurs membres.

## Liste des groupes

Tant qu'aucun groupe n'existe, un message invite à cliquer sur **Ajouter un groupe**. Une fois
plusieurs créés, chacun s'affiche en carte cliquable (ouvre sa fiche), composée de gauche à
droite :

* une **poignée** ⠿ pour réordonner la liste par glisser-déposer (souris ou tactile) — le
    nouvel ordre est enregistré **immédiatement** au relâchement ;
* le **nom** du groupe, avec la **pièce** assignée juste en dessous si elle est définie ;
* à droite : l'**ID** du groupe, une icône **télécommande** qui ouvre directement la
    [télécommande virtuelle](../telecommande-virtuelle.md) de ce groupe, et une icône
    **poubelle** qui le supprime.

!!! note "Note"

    Le nombre d'équipements membres ne s'affiche **pas** sur cette carte de liste.

## Créer un groupe

**Ajouter un groupe** ouvre un assistant en **deux étapes**, qui enregistre chaque liaison dès
qu'elle est confirmée. Le **mode expert** ouvre toujours le formulaire complet.

### Étape 1 sur 2 : nom et équipements

Donnez un **nom** (et une **pièce**), puis cochez les **équipements que ce groupe doit commander**.
Chaque équipement coché sera lié au groupe à l'étape suivante, **un par un**. Vous pourrez en
ajouter d'autres plus tard. S'il n'y a aucun équipement, l'assistant le dit : créez d'abord un
équipement.

Les **options avancées** rappellent que le groupe a sa **propre adresse radio**, distincte de
celle de chaque équipement.

### Étape 2 sur 2 : lier chaque équipement

Pour **chaque** équipement coché, une tâche « **Lier** *nom* » se déroule en deux temps. Elle est
décrite dans [Lier un équipement au groupe](lier-un-equipement.md).

Une dernière tâche, **Options**, règle :

- le **sens des commandes** : **Normal** ou **Inversé**, à inverser seulement si tous les
  équipements du groupe partent dans le mauvais sens quand le groupe monte ;
- la **portée radio** : **Normale**, ou **Renforcée**, qui répète chaque commande pour un groupe
  dont un équipement est éloigné ;
- le **clignotement de la LED d'état** à chaque commande du groupe (bleue sur un boîtier
  Wi-Fi, verte sur un boîtier Ethernet).

À la fin, « **nom** est prêt » : tous les équipements répondent au groupe. Si des liaisons sont
restées de côté, les équipements non liés ne font pas partie du groupe : ajoutez-les plus tard
avec **Associer un équipement** sur la fiche du groupe.

## Caractéristiques techniques

* **Capacité** : jusqu'à **14 groupes**. Un groupe peut contenir au plus **30 équipements**
    — ce n'est pas un plafond propre au groupe, mais le nombre maximal d'équipements que
    l'appareil peut gérer au total (voir [EQUIPEMENTS](../equipements/index.md#capacité)) :
    un groupe ne peut jamais en contenir plus qu'il n'en existe.
* **Synchronisation native** : une seule commande radio est diffusée pour Haut/Ma
    Position/Bas. Tous les moteurs la reçoivent au même instant.
* **Performance radio** : réduit considérablement le trafic sur la fréquence 433,xx MHz,
    comparé à l'envoi d'une commande par équipement.
* **Positionnement en pourcentage** : le tableau de bord d'un groupe n'offre que Haut, Ma
    Position (My) et Bas — pas de curseur de position, les différences de timing entre moteurs ne
    permettant pas une seule trame de position valable pour tous. Un groupe reste néanmoins
    une **cible valide pour une [programmation](../equipements/plannification.md)** visant un pourcentage
    précis : dans ce cas, chaque équipement membre reçoit alors sa propre commande de
    positionnement et rejoint la cible indépendamment des autres — ce n'est plus une seule
    trame partagée, mais le résultat reste pratique à programmer.


## La fiche du groupe

La fiche reprend la présentation en **blocs** de la fiche d'un équipement : **Informations
générales**, **Communication**, **Équipements associés au groupe**, **Contrôle du Groupe**,
**Options** et **Plannings**.

!!! note "Note"

    **Contrôle du Groupe** et **Plannings** restent **masqués tant que le groupe n'a pas été
    enregistré une première fois**. Le bloc **Options**, lui, reste visible dès la création.

## Informations générales

* **Nom** : identifiant du groupe (ex : *Groupe Salon*). Limité à **20 caractères**.
* **Pièce** : assigne le groupe à une zone (par défaut : **Accueil**) — voir
    [Pièces (Rooms)](../pieces.md)). Le bouton **+** juste à côté du sélecteur permet d'en
    créer une nouvelle sans quitter cette fiche.

## Communication

* **Protocole** : `RTS`, `RTW` ou `RTV` — pas de protocole GPIO (`IO-Relay`/`IO_Remote`)
    pour un groupe, voir [EQUIPEMENTS](../equipements/index.md#communication) pour le détail de ces
    protocoles.
* **Bit** : **56-bit** ou **80-bit**, même logique de préréglage que pour un équipement.
* **ID Équipement** : identifiant unique de 24 bits, généré par défaut à partir de
    l'adresse MAC de votre ESP32. Ne le modifiez jamais après avoir associé des équipements.

## Équipements associés au groupe

Ce bloc a **le sien** : en haut, le bouton **Associer un équipement** lance la procédure de
[liaison](lier-un-equipement.md). Dessous, chaque équipement membre s'affiche dans une carte,
sur le modèle des télécommandes liées, avec :

* une **icône** représentant le type de l'équipement ;
* son **nom** et son **ID** ;
* un bouton **Retirer du groupe** pour le délier.

Délier et lier passent par les **mêmes tâches guidées** que lors de la création. La liste n'a
pas d'état vide dédié : elle reste masquée tant qu'elle est vide.

## Contrôle du Groupe

*Visible uniquement une fois le groupe enregistré une première fois.*

Ce bloc ne garde que les boutons **Haut / My / Bas** (grisés tant qu'aucun équipement n'est
associé).

## Options

* **Commandes** : inverse le sens Haut/Bas envoyé — même logique que pour un équipement
    individuel.
* **Répéter commandes** : de **0** à **7** — une borne plus basse que pour un équipement
    seul (0 à 20), volontaire : un groupe de 8 membres répété plusieurs fois produirait
    autant d'éclats radio supplémentaires pour une seule action.
* **Retour lumineux** : fait clignoter la LED de statut **une fois par commande de
    groupe** envoyée, pas séparément pour chaque équipement membre. N'apparaît que si une
    LED de statut est configurée sur votre appareil — même condition que pour un équipement.

## Plannings

*Visible uniquement une fois le groupe enregistré une première fois.*

Comme pour un équipement, un bloc dédié liste les plannings déjà associés à ce groupe
avec un bouton **Ajouter une programmation** — voir [Plannification](../equipements/plannification.md).

## Procédures liées

- [Lier un équipement au groupe](lier-un-equipement.md) — lier ou délier un équipement, par les
    tâches guidées de l'assistant ou depuis la fiche.
- [Pièces (Rooms)](../pieces.md) — créer une pièce à la volée via le bouton **+** du champ Pièce.
- [Plannification](../equipements/plannification.md) — programmer des déclenchements
    automatiques ; a aussi son propre onglet **Plannings**.
- [Télécommande Virtuelle (Virtual Remote)](../telecommande-virtuelle.md) — icône sur chaque
    carte de la [liste](#liste-des-groupes) ; **absente de cette fiche**, accessible depuis la
    liste et le tableau de bord.
