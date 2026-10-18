# Dépannage radio

Le point de départ quand des équipements n'obéissent pas, ou mal — cette page rassemble le
diagnostic radio, dans l'ordre où le mener. Pour le réglage automatique de la fréquence, voir
l'[Assistant de réglages](assistant-de-reglages.md) ; pour l'outil de balayage manuel,
voir [Balayage de Fréquence](balayage-frequence.md).

## 1. Vérifier d'abord que la radio tourne

Un signe avant-coureur se lit avant même d'ouvrir **Radio → Configuration** : sur petit écran
(mobile), l'icône Radio porte un trait diagonal rouge ; sur écran normal, c'est la mention
**« Désactivé »** qui apparaît à côté de Radio dans le menu latéral. Dans les deux cas, cela
signifie que le module CC1101 n'a tout simplement pas démarré — aucun réglage de fréquence ne
peut aider tant que ce point n'est pas réglé :

* **Radio éteinte** : le commutateur en haut de page est décoché, ou coché mais pas encore
    enregistré — dans les deux cas, rien n'est écouté ni émis. Activez-le puis
    **Enregistrer**.
* **« Radio not Initialized » / communication SPI impossible** : l'ESP32 ne parvient pas à
    parler au module CC1101.
    * Vérifiez le câblage et l'ordre des broches — attention, les broches sont inversées
        (gauche/droite) selon le sens dans lequel vous branchez le module.
    * Si vous êtes sur une carte Ethernet, assurez-vous qu'aucune broche radio (SCK, CSN, MOSI,
        MISO) n'est partagée avec le contrôleur Ethernet — voir
        [Configurer la Radio](index.md#assignation-gpio).
    * Vérifiez que les GPIO saisis correspondent bien à votre câblage physique.

## 2. Le test intégré (mode Assisté)

Avant tout réglage, **Radio → Configuration → Assisté** propose un test direct : appuyez sur
n'importe quelle touche d'une télécommande, et l'appareil écoute 15 secondes une trame
réellement **décodée** avec les réglages actuels. Un vert ici veut dire « vos équipements
répondront » — c'est la seule preuve de bout en bout, pas une simple mesure de fréquence.

* **Test réussi mais l'équipement ne bouge toujours pas** → voir
    [§4 Réception OK mais rien ne bouge](#4-réception-ok-mais-rien-ne-bouge).
* **Aucune télécommande reçue** → vérifiez d'abord l'évident (pile, portée, pression réelle du
    bouton) avant de soupçonner un réglage. Si le test échoue encore après ça, passez à
    l'[Assistant de réglages](assistant-de-reglages.md) — il mesure la fréquence réelle de vos
    télécommandes et règle l'appareil dessus. C'est le chemin recommandé : il ne demande aucune
    connaissance technique.

## 3. Comprendre pourquoi un décalage de fréquence empêche la réception

Le CC1101 n'écoute qu'une tranche étroite autour de sa **fréquence de base**, large de sa
**largeur de bande RX** — concrètement une fenêtre de `[fréquence − bande/2, fréquence +
bande/2]`. Une télécommande qui émet en dehors de cette fenêtre, même de peu, n'est tout
simplement pas vue : le RSSI peut s'agiter sur le journal sans qu'aucune trame ne se décode,
parce que le bruit ambiant est reçu mais la vraie porteuse, elle, tombe hors de la fenêtre.
Voir [Configurer la Radio](index.md#comprendre-la-fenêtre-de-réception) pour le
détail et des exemples chiffrés.

C'est fréquent avec des télécommandes Somfy plus anciennes, ou simplement un exemplaire qui
dérive un peu de la valeur nominale de 433,42 MHz — rien d'anormal, le standard tolère cet
écart, c'est à l'appareil de s'y adapter plutôt que l'inverse.

**Deux outils pour corriger ça**, du plus simple au plus complet :

* L'[Assistant de réglages](assistant-de-reglages.md) (recommandé) : mesure chaque
    télécommande et calcule lui-même la fréquence centrale et la largeur de bande qui les couvre
    toutes.
* Le [balayage manuel](balayage-frequence.md) (bouton en bas du volet
    Manuel) : affiche en direct le RSSI sur toute la bande 433 MHz pendant que vous maintenez un
    bouton enfoncé, et vous laisse relever vous-même la fréquence la plus forte pour l'injecter
    dans le champ **Fréquence de base**. Plus brut, utile si vous voulez comprendre ce qui se
    passe plutôt que laisser l'assistant calculer à votre place.

!!! tip "Astuce"

    Dans les deux cas, ne collez pas la télécommande contre l'antenne : à bout portant, le
    récepteur peut saturer et fausser la mesure. Restez à environ un mètre.

## 4. Réception OK, mais rien ne bouge

Si le journal (**Radio → Journaux**) affiche bien les trames de votre télécommande d'origine,
le problème n'est plus la réception :

* **Émission impossible (TX)** : le CC1101 ne peut émettre que via la broche **GDO0** — pas
    GDO2. Si vos réglages GDO0/GDO2 sont inversés, la réception continue de fonctionner (elle
    accepte les deux broches) mais toute commande envoyée depuis l'interface reste muette. Un
    RSSI qui s'agite à la réception mais aucune réaction à l'émission est le symptôme classique
    d'une inversion RX/TX.
* **Mémoire du moteur pleine** : les moteurs Somfy ont un nombre limité d'emplacements de
    télécommandes mémorisées. Si elle est pleine, le moteur ignore silencieusement toute nouvelle
    tentative d'appairage — voir [Appairage](../somfy/equipements/appairage.md)).
* **Adresse inconnue dans le journal** : si la colonne Adresse ne résout aucun nom
    d'équipement/groupe connu, la trame vient d'une télécommande que vous n'avez pas (encore)
    liée à cet équipement — voir [Liaison Télécommande](../somfy/equipements/liaison-telecommande.md)).

## 5. Lire le journal pour comprendre ce qui se passe

**Radio → Journaux** affiche chaque trame décodée en temps réel, la plus récente en haut —
voir [Journal Radio](journal.md) pour le détail complet de chaque colonne et des boutons.
Pour un diagnostic rapide :

* Une trame marquée **invalide** (badge rouge) a été reçue mais ne respecte pas le format
    attendu — le symptôme typique d'un réglage encore limite, pas forcément d'un échec total.
    Voir [Journal Radio](journal.md#reconnaître-une-trame-invalide) pour les causes exactes.
* **RSSI** : plus la valeur est proche de 0, meilleure est la réception — 🟢 vert au-dessus de
    -70 dBm, 🟡 jaune entre -70 et -85 dBm, 🔴 rouge en dessous de -85 dBm (voir
    [le détail des seuils](journal.md#code-couleur-du-rssi)).
* **COPIER** récupère les trames actuellement affichées (recherche et filtre **Valides**
    appliqués) dans le presse-papiers — indispensable pour demander de l'aide sur le forum ou
    GitHub.

!!! important "Important"

    Évitez de placer l'appareil près d'un micro-ondes ou d'un routeur Wi-Fi : ces deux sources
    génèrent du bruit dans la bande 433-434 MHz qui peut masquer vos télécommandes.

