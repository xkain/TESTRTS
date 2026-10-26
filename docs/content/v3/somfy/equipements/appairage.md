# Appairage et sens de rotation

L'appairage consiste à **enregistrer l'adresse de votre ESPSomfy-RTS dans la mémoire du moteur**.
La procédure est identique à l'ajout d'une nouvelle télécommande physique.

C'est la **première tâche** de la [mise en service](mise-en-service.md), et elle se refait à tout
moment depuis la ligne **Appairage** du bloc **Mise en service** de la fiche de l'équipement.
Il n'y a plus d'assistant d'appairage séparé : c'est la même tâche, dans la même fenêtre.

!!! important "Le « jog » est votre seul indicateur"

    Les moteurs ne renvoient aucune confirmation numérique. La seule façon de savoir si
    l'opération a réussi est d'observer l'équipement faire un **bref va-et-vient** (le « jog »).

## Appairer

1. **Ouvrez la mémoire du moteur.** Sur une télécommande **déjà appairée** (celle que vous venez
   d'utiliser pendant la création, si vous en avez signalé une), maintenez la touche **Prog**,
   souvent au dos, jusqu'à ce que l'équipement fasse un bref va-et-vient.
   La mémoire reste ouverte **environ 2 minutes** : rien ne presse.
2. Cliquez sur **Il a fait un va-et-vient**.
3. Appuyez sur **PROG** : ESPSomfy-RTS se présente au moteur, qui doit **refaire un
   va-et-vient**.
4. L'assistant demande **« Qu'a fait l'équipement ? »** : *Il a fait un va-et-vient*, ou *Rien*.

Si l'équipement **ne bouge pas** : la mémoire s'est peut-être refermée, ou l'appui était trop
court. **Réessayer PROG** en le maintenant une seconde. Si rien ne bouge toujours, **Rouvrir la
mémoire** avec la télécommande d'origine, et recommencez.

!!! warning "Soyez honnête avec l'assistant"

    N'indiquez pas que l'équipement a bougé s'il ne l'a pas fait : vous devriez passer par un
    désappairage pour repartir proprement.

!!! note "Le va-et-vient est une bascule"

    L'appairage et le désappairage utilisent **la même commande**. Si l'équipement fait plus
    d'un va-et-vient, vous venez probablement de supprimer le lien au lieu de le créer.

!!! tip "La distance est rarement en cause"

    La portée de l'appareil est impressionnante (150 à 200 mètres sans obstacles ni
    interférences). Si l'appairage échoue, c'est le plus souvent que le mode programmation du
    moteur s'est refermé trop vite.

## Désappairer

Depuis la ligne **Appairage** d'un équipement déjà appairé, la tâche montre son état d'abord, avec
**refaire** et **désappairer**. Le désappairage suit le même chemin, dans la **même fenêtre** :

1. Ouvrez la mémoire du moteur avec une télécommande existante (**Prog** jusqu'au va-et-vient).
2. Appuyez sur **PROG** dans l'assistant : le signal de désappairage part vers l'équipement.

## Sens de rotation

Juste après l'appairage, la tâche **Sens de rotation** vérifie que l'équipement part dans le bon
sens.

1. Appuyez sur la commande demandée (par exemple **Monter**) et **regardez l'équipement**.
2. S'il fait le contraire, cliquez sur **L'inverse** : les commandes sont inversées, et
   l'assistant vous fait **vérifier** que c'est bon.
3. S'il **n'a pas réagi** du tout, l'appairage n'a probablement pas pris : **Retester**, ou
   **Refaire l'appairage**.

Le sens se lit ensuite sur la fiche : **Sens normal** ou **Sens inversé**. **Inverser le sens**
est possible à tout moment, sans réappairer.

### Pour un interrupteur : le test de commande

Un interrupteur n'a pas de sens de rotation : la tâche devient un **test de commande**.
Appuyez sur le bouton (**Mettre en marche**, **Allumer**, **Activer**, selon ce que vous avez
choisi) et regardez l'équipement : *Il a réagi*, ou *Rien ne s'est passé*.
