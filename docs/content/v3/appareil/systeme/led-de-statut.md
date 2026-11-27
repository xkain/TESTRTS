# Témoin LED de statut

Le témoin de statut est une LED que l'appareil allume pour montrer ce qu'il fait, sans ouvrir
l'interface : un bref flash à chaque commande envoyée ou à chaque trame radio, et le signal des
[trois coupures d'alimentation](firmware-de-secours.md#trois-coupures) au démarrage.

Il se règle depuis l'onglet **État du système** de la page **Appareil › Système** (voir
[Système](index.md#status)) : la ligne **Témoin LED de statut**, dont la pastille dit s'il est actif,
ouvre la fenêtre de réglage.

![Fenêtre Témoin LED de statut](v3/img/systeme-fen-led){ .on-glb }

## En haut de la fenêtre

La colonne de gauche (le bandeau, sur téléphone) résume l'état enregistré et permet d'essayer la LED :

| Élément | Ce qu'il montre ou permet |
|---|---|
| **Aperçu** | une pastille aux couleurs du réglage affiché : verte pour une LED simple, la couleur d'activité pour une LED RGB, éteinte si le témoin est désactivé |
| `Tester la LED` | fait clignoter la LED avec les réglages affichés, sans les enregistrer, voir [Tester la LED](#tester-la-led) |
| **Voyant** | `Activé` ou `Désactivé`, avec la broche et le type de LED enregistrés ; `Intégré` sur un boîtier officiel |

## Quelle LED ?

Le témoin peut être :

- **la LED intégrée à votre carte ESP32** : beaucoup de cartes en portent une, reliée à une
  broche GPIO. Les préréglages de **Modèle de carte** en couvrent plusieurs ;
- **une LED que vous ajoutez vous-même** sur une broche libre, avec sa résistance ;
- **une LED RGB adressable** (type WS2812), intégrée à certaines cartes ou ajoutée par vous :
  la couleur de ses flashs se règle alors dans la même fenêtre, voir [Type et couleurs](#type-et-couleurs).

La LED d'alimentation, celle qui s'allume dès que la carte est sous tension, n'est reliée à
aucune broche : le firmware ne peut pas la piloter. Si votre carte n'a que celle-là, ajoutez une LED.

## Boîtier officiel ou carte générique ? { #boitier-ou-carte-generique }

!!! note "Sur un boîtier officiel, presque tout est déjà réglé"

    Sur l'un de mes [boîtiers officiels](../../materiel/boitiers-officiels.md), la LED est câblée en
    dur et **déjà activée** : la fenêtre l'indique (« Votre carte est reconnue : la broche et le type
    de LED sont déjà réglés. ») et n'affiche que le bloc **Activité radio**, avec le bouton
    `Tester la LED`. Les sections [Voyant](#voyant), [Broche de la LED](#broche-de-la-led) et
    [Type et couleurs](#type-et-couleurs) ne concernent que les **cartes génériques**.

## Voyant { #voyant }

**Témoin LED** : `Oui` / `Non` met le témoin en service ou l'arrête complètement. Passer à `Oui`
sans avoir encore choisi de broche place le **Modèle de carte** sur « Choisir une carte ou un
GPIO… », qui **bloque l'enregistrement** tant qu'un choix n'a pas été fait : l'interface n'attribue
jamais un GPIO arbitraire. Choisir **Aucune / Désactivée** dans la liste repasse l'interrupteur à
`Non`.

## Broche de la LED { #broche-de-la-led }

La liste **Modèle de carte** propose des préréglages pour des cartes courantes. Elle ne montre que
ceux de la puce de votre appareil :

| Carte | Puce | Broche | Type | Câblage |
|---|---|---|---|---|
| WT32-ETH01 | ESP32 | GPIO5 | LED simple | active à l'état bas |
| ESP32-D1 mini | ESP32 | GPIO2 | LED simple | active à l'état haut |
| XIAO ESP32-S3 | ESP32-S3 | GPIO21 | LED simple | active à l'état bas |
| ESP32-S3 Zero | ESP32-S3 | GPIO21 | LED RGB | ordre GRB |
| ESP32-C6-Zero | ESP32-C6 | GPIO8 | LED RGB | ordre RGB |
| XIAO ESP32-C6 | ESP32-C6 | GPIO15 | LED simple | active à l'état bas |

Un préréglage pose la broche, le type de LED et son câblage : vous n'avez pas à les connaître, et
la fenêtre ne les affiche pas.

**Définir manuellement (utilisateur avancé)** affiche à la place un champ **GPIO** (avec ses
boutons `−` et `+`), un avertissement rouge et l'interrupteur **J'ai vérifié mon câblage, broche par
broche.** : tant qu'il n'est pas sur `Oui`, une broche choisie à la main n'est ni testée ni
enregistrée.

!!! danger "Une broche fausse peut bloquer ou abîmer la carte"

    Une broche déjà reliée à un autre composant (flash, Ethernet, radio…) peut empêcher
    l'appareil de démarrer, ou être abîmée si deux composants la pilotent en même temps.
    Comparez chaque broche à la documentation du fabricant.

Un avertissement s'affiche si le GPIO saisi est le **12** sur un ESP32 d'origine : c'est une broche
de *strapping* (voir [Composants](../../../commun/composants.md)), qui peut empêcher un
redémarrage. Une broche déjà utilisée, par la radio par exemple, est refusée avec un message qui
nomme son propriétaire, préréglages compris : le WT32-ETH01 propose la 5, qui est aussi la broche
CSN de la radio par défaut.

## Type et couleurs { #type-et-couleurs }

Ce bloc n'apparaît qu'avec **Définir manuellement**, sauf pour la **Couleur d'activité**, toujours
proposée pour une LED RGB : avec un préréglage, le type et le câblage découlent de la carte.

| | LED simple | LED RGB |
|---|---|---|
| Composant | LED ordinaire, allumée ou éteinte par le niveau du GPIO | LED adressable de type WS2812, pilotée par une trame numérique |
| Réglage de câblage | **LED active à l'état bas** | **Ordre des couleurs** |
| Couleur | celle de la LED, non réglable | **Couleur d'activité**, au choix |
| Au repos | éteinte | éteinte |

### LED simple { #led-simple }

Une LED classique à deux broches, d'une seule couleur, ou la LED intégrée à la plupart des
cartes ESP32. Le firmware l'allume ou l'éteint en changeant le niveau du GPIO, et ne règle rien
d'autre.

![Type et couleurs, LED simple](v3/img/temoin-led-simple){ .on-glb }

**LED active à l'état bas** : `Oui` si votre LED s'allume quand le GPIO est à l'état bas. C'est le
cas de nombreuses LED intégrées, câblées entre la broche et l'alimentation. Si la LED reste
allumée en permanence et s'éteint lors d'un flash, c'est ce réglage qu'il faut inverser :
`Tester la LED` le vérifie tout de suite.

### LED RGB { #led-rgb }

Une LED adressable (WS2812, NeoPixel…), reconnaissable à ses trois ou quatre pattes et à la puce
minuscule visible. Elle reçoit une trame numérique qui lui donne sa couleur exacte, ce qui permet
de choisir celle des flashs. On la trouve intégrée à certaines cartes récentes, comme
l'ESP32-C6-Zero et l'ESP32-S3 Zero.

![Type et couleurs, LED RGB](v3/img/temoin-led-rgb){ .on-glb }

**Couleur d'activité** : la couleur des flashs qui signalent une commande ou une trame radio. C'est
une préférence, pas du câblage : elle reste réglable avec un préréglage. La luminosité est
volontairement limitée pour ne pas éblouir ; au repos, le témoin reste éteint.

**Ordre des couleurs** : `GRB` ou `RGB`. Le protocole de ces LED ne dit pas dans quel ordre le
composant attend ses couleurs. Le standard est `GRB`, mais certaines cartes sont câblées en `RGB`.
Si la couleur affichée ne correspond pas à celle choisie, un orange qui sort vert par exemple,
changez d'ordre.

!!! note "Une LED RGB s'allume en bleu au démarrage"

    Pendant la fenêtre des [trois coupures](firmware-de-secours.md#trois-coupures), une LED RGB
    s'allume en **bleu**, quelle que soit la couleur d'activité choisie. Cette couleur n'est pas
    réglable : c'est le seul retour visuel disponible quand plus rien d'autre ne répond, et elle
    distingue d'un coup d'œil cette phase du fonctionnement normal.

## Activité radio { #temoin-dactivite-radio }

**Témoin d'activité radio** : `Oui` / `Non`, visible aussi sur un boîtier officiel. À `Oui`, la LED
clignote brièvement à chaque trame RTS émise ou reçue par l'appareil, y compris celles des
télécommandes du voisinage captées à portée de l'antenne. Dans un environnement radio dense, le
clignotement peut donc être plus fréquent qu'attendu.

!!! note "Un autre réglage allume ce même témoin"

    Chaque équipement ou groupe a sa propre option **Retour lumineux** (voir
    [Équipements](../../habitation/equipements/index.md) et [Groupes](../../habitation/groupes/index.md)),
    qui fait clignoter cette LED à chaque commande envoyée depuis l'interface, indépendamment du
    témoin d'activité radio.

## Tester la LED { #tester-la-led }

`Tester la LED` vérifie un réglage **avant de l'enregistrer** : la LED clignote **trois fois**
(environ deux secondes), puis revient à son état normal.

- **Sur une carte générique**, le test utilise **exactement ce qui est affiché** : la broche (ou
  le préréglage), le type de LED, l'état bas, la couleur d'activité et l'ordre des couleurs. Rien
  n'est enregistré : ajustez, retestez, et n'enregistrez qu'une fois la LED correcte.
- **Sur un boîtier officiel**, il fait clignoter la LED du boîtier (bleu pour l'Édition Wi-Fi, vert
  pour l'Édition Ethernet & Wi-Fi).

C'est le moyen le plus rapide de savoir si l'état bas est le bon (la LED doit clignoter, pas
rester allumée), si la couleur s'affiche bien, et si l'ordre des couleurs est correct.

!!! tip "Si le test ne part pas"

    Sur une carte générique, le test refuse de partir, avec un message en haut de la fenêtre, quand :

    - aucune carte ni aucun GPIO n'a été choisi (« Choisissez un modèle de carte ou définissez le
      GPIO manuellement avant d'appliquer. ») ;
    - le GPIO saisi n'existe pas sur cette carte ;
    - avec **Définir manuellement**, la case de vérification du câblage n'est pas cochée ;
    - le GPIO est **déjà utilisé** : le message nomme son propriétaire.

    Le bouton reste ensuite grisé environ **2 secondes**, le temps du test. Pendant le test, les
    flashs habituels du témoin sont suspendus : ils reprennent à la fin.

## Enregistrer

Le pied de la fenêtre rappelle que **rien n'est enregistré avant `Enregistrer`**. `Enregistrer`
reste grisé tant que rien n'a changé ; `Annuler` ferme la fenêtre sans rien garder. Une broche ou
un câblage enregistré s'applique **immédiatement**, sans redémarrage : l'ancienne broche est
relâchée proprement.

Dès qu'une broche est configurée (boîtier officiel ou carte générique réglée ici), le témoin
affiche aussi le signal des coupures d'alimentation qui mènent au firmware de secours : voir
[Trois coupures d'alimentation](firmware-de-secours.md#trois-coupures).
