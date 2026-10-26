# Temps de course et lames

Pour afficher une **position juste**, ESPSomfy-RTS doit connaître la **durée d'une course
complète**. On la **chronomètre ensemble** : vous lancez, vous cliquez quand l'équipement arrive
en butée.

Ces mesures sont des tâches de la [mise en service](mise-en-service.md). Elles se refont une par
une depuis le bloc **Mise en service** de la fiche de l'équipement : il n'existe plus de
commutateur Assistant / Manuel ni d'assistant de calibration séparé.

!!! tip "Placez-vous bien"

    Placez-vous de façon à **bien voir l'équipement du début à la fin** de la course.

## Temps de course

La tâche **Temps de course** mesure la montée et la descente (ou l'ouverture et la fermeture,
le déploiement et le repli, selon le type d'équipement).

1. L'équipement doit être **complètement fermé** (ou ouvert, selon le sens qui vous est demandé).
2. Cliquez sur **Démarrer**, puis sur le bouton de fin **dès que l'équipement arrive en butée**.
3. Faites la même chose dans l'**autre sens** : **Mesurer : descente**, par exemple.
4. **Valider les temps**.

**Annuler la mesure** interrompt un chrono en cours. Si vous **connaissez déjà les temps**, le
bouton **Je connais déjà les temps** permet de les saisir directement : de **0,5 à 180 secondes**.

Une fois fait, la ligne affiche les temps mesurés ; **Mesurer à nouveau** ou **Modifier les
temps** les reprennent.

### Le temps mort

Après la mesure, l'assistant demande : **« Avez-vous remarqué un temps mort ? »**

Un temps mort est un moment où le **moteur tourne déjà** (on l'entend) alors que l'équipement
**ne bouge pas encore**, au début de la montée, ou **ne bouge plus**, à la fin de la descente.
**Beaucoup de moteurs n'en ont pas.** Le compenser rend la position affichée plus juste au début
de chaque mouvement.

- **Non, terminer** : aucun temps mort n'est enregistré.
- **Oui, le mesurer** : on refait chaque sens, **cette fois en deux temps**.
    - Pour la **montée** : écoutez le moteur et regardez l'équipement ; cliquez une première fois
      **quand il commence réellement à bouger**, puis une seconde fois quand il arrive en butée.
    - Pour la **descente** : cliquez une première fois **quand l'équipement arrive en butée**,
      puis une seconde fois **quand le moteur s'arrête** à son tour.
    - **Pas de temps mort dans ce sens** si vous n'en avez pas remarqué.

## Orientation des lames { #orientation-des-lames }

Pour un **store vénitien**, la tâche **Orientation des lames** mesure le temps que mettent les
lames à pivoter **complètement, dans chaque sens** (*ouverture des lames*, *fermeture des
lames*).

Pour un store à **moteur unique (intégré)**, le moteur fait pivoter les lames **avant** de
déplacer le store : on mesure combien dure ce pivotement, dans chaque sens.

Un store à **orientation seule** n'a pas de course : seule cette mesure est faite.

## Ordre lames / course { #ordre-lames-course }

Sur un store à **moteur unique (intégré)**, l'assistant doit savoir **ce qui bouge en premier** :

1. Appuyez sur la commande demandée et **regardez ce qui bouge en premier**.
2. Répondez : *Les lames ont pivoté*, ou *L'équipement s'est déplacé*.
3. **Même chose dans l'autre sens.**

La ligne affiche ensuite « **lames d'abord** » ou « **course d'abord** ».

## Modifier la mesure plus tard

Dans la fiche de l'équipement, le bloc **Mise en service** montre les temps enregistrés. Un
clic sur une ligne rouvre sa tâche avec les valeurs actuelles : **Modifier les temps**, **Mesurer
à nouveau**. Les temps ne sont plus des champs de la fiche : une **sauvegarde de la fiche
n'écrase jamais** des temps mesurés.
