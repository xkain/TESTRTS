# Lier un équipement au groupe

Pour qu'un moteur réponde à une commande de groupe, il doit enregistrer l'**adresse du groupe**
dans sa mémoire, en plus de sa propre adresse individuelle. Cette liaison se fait **équipement
par équipement**.

Elle se fait de deux façons, avec les **mêmes tâches guidées** :

- à la **création du groupe**, pour chaque équipement coché ;
- sur la **fiche du groupe**, par **Associer un équipement** (et **Retirer du groupe** pour
  délier).

Chaque liaison est **enregistrée dès qu'elle est confirmée**.

!!! note "Ce n'est pas l'appairage d'un équipement"

    Les va-et-vient ressemblent à ceux de l'[appairage](../equipements/appairage.md), mais il
    s'agit d'une procédure **différente** : ici, c'est le **groupe** qui envoie ses commandes
    avec sa propre adresse.

## Lier un équipement

Si vous passez par **Associer un équipement**, l'assistant demande d'abord **quel équipement lier
à ce groupe** : seuls les équipements pas encore membres de **ce** groupe apparaissent (un
équipement peut appartenir à plusieurs groupes).

La tâche **Lier** *nom* se fait en deux temps :

1. **Ouvrir la mémoire de l'équipement.** ESPSomfy-RTS envoie un **appui long sur Prog** avec
   l'**adresse de l'équipement**. Son moteur doit faire un **bref va-et-vient** : il est alors
   prêt à apprendre l'adresse du groupe. Cliquez sur **Ouvrir la mémoire**, puis indiquez si
   l'équipement a fait un va-et-vient.
    - S'il n'en a **pas** fait : le moteur n'a pas reçu l'appui. Vérifiez que l'équipement est
      bien appairé et à portée, puis réessayez.
    - Vous pouvez aussi **ouvrir la mémoire autrement**, avec sa télécommande d'origine (appui
      long sur **Prog**) : choisissez alors **J'ai ouvert la mémoire autrement** et passez
      directement à l'étape suivante.
2. **Appairer le groupe.** **Maintenez** le bouton **Maintenir pour appairer** : le groupe envoie
   **Prog avec sa propre adresse**, jusqu'à ce que le moteur fasse un nouveau va-et-vient.
   **Relâchez dès qu'il bouge**, puis confirmez : *Oui, il est lié*.

Un équipement lié apparaît dans le bloc **Équipements associés au groupe**.

## Délier un équipement

La tâche **Délier** *nom* suit le même principe :

1. **Ouvrir la mémoire de l'équipement**, comme ci-dessus : ESPSomfy-RTS envoie l'appui long sur
   Prog avec l'adresse de l'équipement ; le moteur est alors prêt à **oublier** l'adresse du
   groupe.
2. **Retirer du groupe.** Le groupe envoie un **appui court** sur Prog avec sa propre adresse : le
   moteur **oublie le groupe** et refait un va-et-vient. Confirmez : *Oui, il est retiré*.

!!! important "Délier n'est pas une simple suppression"

    L'étape de désappairage envoie une **véritable commande radio** au groupe, avec confirmation
    du mouvement du moteur, avant de retirer le membre. Si la procédure échoue, une télécommande
    physique du groupe peut aussi ouvrir la mémoire du moteur en maintenant le bouton **PROG**
    enfoncé.
