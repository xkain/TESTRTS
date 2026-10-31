# Témoin LED de statut

Le témoin de statut est une LED que l'appareil allume pour montrer ce qu'il fait, sans avoir à
ouvrir l'interface : un bref flash à chaque trame radio émise ou reçue, ou à chaque commande
envoyée, et des signaux propres au démarrage et au [Mode Récupération](../recuperation.md#signal-visuel).

Il se règle depuis **Système → Firmware** (voir [Firmware](index.md)), avec le bouton
**Témoin LED de statut**, qui ouvre une fenêtre de réglage.

![temoin led statut 1](v3/img/temoin-led-statut-1){ .on-glb }

## Quelle LED ?

Le témoin peut être :

- **la LED intégrée à votre carte ESP32** : beaucoup de cartes en portent une, reliée à une
  broche GPIO. Les préréglages de **Modèle de carte**, plus bas, en couvrent quelques-unes ;
- **une LED que vous ajoutez vous-même** sur une broche libre, avec sa résistance ;
- **une LED RGB adressable** (type WS2812), intégrée à certaines cartes ou ajoutée par vous :
  la couleur de ses flashs se règle alors dans la même fenêtre, voir [Type de LED](#type-de-led).

La LED d'alimentation, celle qui s'allume dès que la carte est sous tension, n'est reliée à
aucune broche : le firmware ne peut pas la piloter. Si votre carte n'a que celle-là, ajoutez une LED.

## Boîtier officiel ou carte générique ? { #boitier-ou-carte-generique }

!!! note "Sur un boîtier officiel, presque tout est déjà réglé"

    Sur l'un de mes [boîtiers officiels](../materiel/boitiers-officiels.md), la LED est câblée en
    dur et **déjà activée par défaut** : il n'y a ni broche, ni type, ni polarité à choisir. La
    fenêtre n'affiche donc **pas** les sections *Activer le témoin*, *Modèle de carte* et *Type
    de LED*. Il reste deux choses : le **Témoin d'activité radio** et le bouton **Tester la
    LED**.

    Tout le reste de cette page, jusqu'à [Témoin d'activité radio](#temoin-dactivite-radio),
    concerne donc les **cartes génériques**.

## Activer le témoin (cartes génériques)

Un grand commutateur **Désactivé / Activé** met le témoin en service ou l'arrête complètement.
L'activer sans avoir encore choisi de broche le place sur un état intermédiaire (« Choisir une
carte ou un GPIO… ») qui **bloque l'enregistrement** tant qu'un choix explicite n'a pas été fait :
l'interface n'attribue jamais un GPIO arbitraire dans votre dos.

## Modèle de carte

Une liste déroulante propose des préréglages pour les cartes les plus courantes, filtrée pour
n'afficher que celles compatibles avec la puce détectée sur votre appareil :

| Carte | Broche | Type | Réglage |
|---|---|---|---|
| WT32-ETH01 | GPIO5 | LED simple | Active à l'état bas |
| ESP32-D1 mini | GPIO2 | LED simple | Active à l'état haut |
| XIAO ESP32-S3 | GPIO21 | LED simple | Active à l'état bas |
| ESP32-C6-Zero | GPIO8 | LED RGB | Rouge et vert inversés |
| ESP32-S3 Zero | GPIO21 | LED RGB | Ordre standard |

Choisir un préréglage renseigne automatiquement la broche, le type de LED et ses réglages
propres : pas besoin de les connaître.

L'option **Réglages manuels** affiche à la place un champ **GPIO** libre (avec boutons `+` et
`-`) et un interrupteur de confirmation, *« J'ai vérifié mon câblage, broche par broche. »*,
**obligatoire** pour enregistrer ou tester un choix manuel.

Un avertissement s'affiche en continu si le GPIO saisi est le **12** sur un ESP32 d'origine
(broche de *strapping*, voir [Composants](../../commun/composants.md)). Un conflit avec une
broche déjà utilisée par la radio (CS, SCK, MOSI, MISO…) est détecté, et bloque la sauvegarde
avec un message qui nomme le propriétaire de la broche.

## Type de LED { #type-de-led }

Un sélecteur à deux positions, `LED simple` et `LED RGB`, indique au firmware comment piloter
la broche. Il n'apparaît qu'en **Réglages manuels** : avec un préréglage, le type découle de la
carte choisie. Chaque type a ses propres options, et celles de l'autre type sont masquées.

| | LED simple | LED RGB |
|---|---|---|
| Composant | LED ordinaire, allumée ou éteinte par le niveau du GPIO | LED adressable de type WS2812, pilotée par une trame numérique |
| Option de câblage | **LED active à l'état bas** | **Inverser le rouge et le vert** |
| Couleur | Celle de la LED, non réglable | **Couleur d'activité**, au choix |
| Au repos | Éteinte | Éteinte |

### LED simple

Une LED classique à deux broches, d'une seule couleur, ou la LED intégrée à la plupart des
cartes ESP32. Le firmware l'allume ou l'éteint en changeant le niveau du GPIO, et ne peut rien
régler d'autre.

![temoin led statut 3](v3/img/temoin-led-statut-3){ .on-glb }

**LED active à l'état bas** : à activer si votre LED s'allume quand le GPIO est mis à l'état bas
plutôt qu'à l'état haut. C'est le cas de nombreuses LED intégrées, câblées entre la broche et
l'alimentation. Si la LED reste allumée en permanence et s'éteint lors d'un flash, c'est
cet interrupteur qu'il faut inverser. Le bouton **Tester la LED** (voir plus bas) permet de le
vérifier tout de suite.

### LED RGB

Une LED adressable (WS2812, NeoPixel…), reconnaissable à ses trois ou quatre pattes et à la puce
minuscule visible. Elle reçoit une trame numérique qui lui donne sa couleur exacte, ce qui permet
de choisir celle des flashs. On la trouve intégrée à certaines cartes récentes, comme
l'ESP32-C6-Zero.

![temoin led statut 4](v3/img/temoin-led-statut-4){ .on-glb }

**Couleur d'activité** : la couleur des flashs qui signalent une commande ou une trame radio.
Contrairement aux options de câblage, c'est une préférence : elle reste donc réglable même avec
un préréglage. La luminosité est volontairement limitée pour ne pas éblouir, la teinte choisie
est conservée. Au repos, le témoin reste éteint.

**Inverser le rouge et le vert** : le protocole de ces LED ne dit pas dans quel ordre le
composant attend ses couleurs. Le standard est GRB (interrupteur désactivé), mais beaucoup de
cartes sont câblées en RGB (interrupteur activé). Si la couleur affichée ne correspond pas à
celle choisie, un orange qui sort vert par exemple, activez cet interrupteur. Il n'apparaît, lui
aussi, qu'en **Réglages manuels**.

!!! note "Une LED RGB s'allume en bleu au démarrage"

    Au démarrage et en [Mode Récupération](../recuperation.md#signal-visuel), une LED RGB
    s'allume en **bleu**, quelle que soit la couleur d'activité choisie. Cette couleur n'est pas
    réglable : c'est le seul retour visuel disponible quand plus rien d'autre ne répond, et elle
    distingue d'un coup d'œil ces phases du fonctionnement normal.

## Tester la LED { #tester-la-led }

Le bouton **Tester la LED** vérifie un réglage **avant de l'enregistrer** : il fait clignoter la
LED **trois fois** (environ deux secondes), puis la rend à son état normal.

- **Sur une carte générique**, il se trouve en bas du bloc de réglage de la broche, sous les
  options de type. Le test utilise **exactement ce qui est affiché dans la fenêtre** : la broche
  (ou le préréglage), le type de LED, la polarité, la couleur d'activité et l'ordre des couleurs.
  Rien n'est enregistré : vous pouvez ajuster un réglage, retester, et n'enregistrer qu'une fois la
  LED correcte.
- **Sur un boîtier officiel**, il se trouve sous le **Témoin d'activité radio**, et fait
  clignoter la LED du boîtier (bleu pour l'Édition Wi-Fi et vert pour l'Édition Ethernet & Wi-Fi) .

C'est la manière la plus rapide de savoir si la **polarité** est la bonne (la LED doit clignoter
et non rester allumée), si la **couleur** s'affiche bien, et si l'ordre rouge / vert est correct.

!!! tip "Si le test ne part pas"

    Sur une carte générique, le bouton refuse de partir, avec un message sous le champ, quand :

    - aucune carte ni aucun GPIO n'a été choisi (**Choisir un modèle de carte ou définir le GPIO
      manuellement**) ;
    - le GPIO saisi n'existe pas sur cette carte ;
    - en **Réglages manuels**, l'interrupteur de confirmation du câblage n'est pas activé ;
    - le GPIO est **déjà utilisé** par la radio ou un autre réglage : le message nomme le
      propriétaire.

    Le bouton reste ensuite grisé environ **2 secondes**, le temps du test. Un second clic pendant
    un test en cours est simplement ignoré.

Pendant le test, les flashs habituels du témoin sont suspendus : ils reprennent à la fin.

## Témoin d'activité radio { #temoin-dactivite-radio }

Indépendant de ce qui précède (visible même sur un boîtier officiel) : quand cet interrupteur est
activé, la LED clignote brièvement à chaque trame RTS émise ou reçue par l'appareil, y compris les
télécommandes du voisinage captées à portée de l'antenne, pas seulement les vôtres. Dans un
environnement radio dense, le clignotement peut donc être plus fréquent qu'attendu.

!!! note "Un autre réglage allume ce même témoin"

    Chaque équipement ou groupe a sa propre option **Retour lumineux** (voir
    [Équipements](../somfy/equipements/index.md) et [Groupes](../somfy/groupes/index.md)), qui fait
    clignoter cette LED à chaque commande envoyée depuis l'interface, indépendamment du réglage
    d'activité radio ci-dessus.

## Enregistrer

La fenêtre se termine par **Annuler** et **Enregistrer**. Le bouton **Enregistrer** reste grisé
tant que vous n'avez rien modifié. Un réglage de broche ou de polarité s'applique **immédiatement**
après l'enregistrement, sans redémarrage : l'ancienne broche est relâchée proprement.

Dès qu'une broche est configurée (boîtier officiel ou carte générique réglée ici), le témoin
affiche aussi deux signaux supplémentaires, propres au mode de secours de l'appareil : voir
[Mode Récupération](../recuperation.md#signal-visuel) pour leur signification.
