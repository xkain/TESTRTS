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
Sous les deux temps, deux réglages fins se règlent par **Oui** / **Non** : **Tassement des lames**
(volet roulant seulement) et **Vitesse variable** (store enrouleur, store banne et volet roulant).
Sur **Oui**, leurs champs apparaissent ; ils sont décrits ci-dessous.

Une fois fait, la ligne affiche les temps mesurés ; **Mesurer à nouveau** ou **Modifier les
temps** les reprennent.

### Le tassement des lames

Pour un **volet roulant**, après la mesure, l'assistant demande : **« Les lames se tassent-elles en
fin de fermeture ? »**

Sur beaucoup d'équipements, à la fin de la descente, le moteur continue quelques secondes une
fois le bas posé : **les lames se tassent** et les jours entre elles se ferment. Au début de la
montée, c'est l'inverse : **les lames se détassent** d'abord, puis le bas décolle. Pendant ce
temps, la position affichée ne bouge pas. Le mesurer permet d'arrêter l'équipement à la bonne
hauteur quand vous lui demandez une position. Si les lames restent espacées une fois en bas, il
n'y a rien à mesurer.

- **Non, terminer** : aucun tassement n'est enregistré.
- **Oui, le mesurer** : on refait chaque sens, **en deux temps**.
    - Pour la **montée** : cliquez une première fois **quand les lames ont fini de se détasser et
      que le bas décolle**, puis une seconde fois quand il arrive en butée.
    - Pour la **descente** : cliquez une première fois **quand le bas se pose et que les lames
      commencent à se tasser**, puis une seconde fois **quand le moteur s'arrête**.
    - **Pas de tassement dans ce sens** si le moteur s'arrête en même temps que l'équipement se
      pose.

### La vitesse variable { #vitesse-variable }

Un tablier qui s'enroule sur un axe n'avance pas à vitesse constante : le moteur tourne à vitesse
fixe, mais **plus le rouleau est gros, plus l'équipement va vite**. Il descend donc vite au départ
et ralentit en approchant du bas ; à la montée, il démarre lentement et accélère. Avec une vitesse
supposée constante, une consigne à 50 % l'arrête trop bas.

Pour un **store enrouleur**, un **store banne** ou un **volet roulant**, l'assistant pose une
dernière question, **facultative** : **« Réglage fin : sa vitesse change-t-elle en cours de
route ? »**

- **Non, terminer** : la vitesse reste supposée constante.
- **Oui, la mesurer** : on chronomètre le **passage à mi-course** dans chaque sens.
    - Partez d'une butée (**fermé** pour la montée, **ouvert** pour la descente), cliquez sur
      **Démarrer**, puis sur **À mi-course** quand l'équipement a parcouru **la moitié de sa
      course**. Il continue ensuite jusqu'en butée.
    - Ajustez le repère de ± 0,1 s si besoin, puis passez à l'autre sens.

Une seule mesure par sens suffit : ESPSomfy-RTS en déduit la courbe complète, et la position
affichée suit le vrai rythme de l'équipement sur toute la course.

Ce réglage se reprend **à tout moment** : la ligne **Temps de course** de la fiche affiche
« vitesse variable » quand il est réglé, et le lien **Réglage fin : vitesse variable** rouvre la
question avec trois choix : **Mesurer à nouveau**, **Valider**, ou **Revenir à une vitesse
constante**. En saisie manuelle, ce sont les champs **Mi-course montée** et **Mi-course
descente**, en secondes depuis le départ du moteur en butée.

!!! note "Mi-course et tassement"

    Sur un volet roulant qui a un tassement, le chrono de la montée part toujours du démarrage du
    moteur : le temps de détassement est compris dans la mesure, ESPSomfy-RTS le retire lui-même.
    Le passage à mi-course doit tomber **après** ce temps et **avant** l'arrivée en butée.

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
