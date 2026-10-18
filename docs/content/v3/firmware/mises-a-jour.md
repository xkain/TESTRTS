# Mises à jour du firmware

Deux façons de mettre à jour votre appareil, depuis **Firmware** — voir
[Firmware](index.md). Dans les deux cas, une sauvegarde de la configuration actuelle est
proposée automatiquement avant de lancer l'installation (sauf depuis un téléphone, où le
téléchargement du fichier est moins pratique).

!!! warning "Avertissement"

    Une fois lancée, l'installation ne peut **plus être interrompue** avant son terme : aucun
    bouton Annuler n'est proposé pendant le flash, parce qu'il n'y a de toute façon plus rien à
    annuler côté appareil. Gardez-le sous tension jusqu'à la fin.

## Mise à jour depuis GitHub (recommandée)

Le bouton **Mise à jour** ouvre la liste des versions disponibles sur le dépôt du projet,
filtrée à celles compatibles avec votre puce :

| Type | Tag / Nom | Utilisation recommandée |
| :--- | :--- | :--- |
| **Stable** | `vX.Y.Z` | Officielle, testée pour un usage quotidien. |
| **Bêta** | `vX.Y.Z-PRE` | Pour essayer les correctifs avant la sortie officielle. |

La liste n'est pas limitée aux versions plus récentes : revenir à une version antérieure (au
sein de la même version majeure) est proposé aussi, repéré alors comme un retour en arrière
plutôt qu'une mise à jour. Réinstaller la version déjà en place est également possible.

Les notes de version s'affichent sous le sélecteur.

!!! important "Important"

    **Prenez le temps de lire les notes de version avant d'installer.** Une mise à jour ne se
    limite pas à des correctifs discrets : elle peut renommer, déplacer ou changer le
    comportement par défaut d'un réglage que vous utilisez déjà (c'est arrivé plusieurs fois
    rien qu'entre les versions v3.0.0, cf. les autres pages de ce wiki — réglages regroupés
    différemment, options renommées, nouveaux comportements par défaut…). Sauter cette lecture,
    c'est risquer de découvrir le changement a posteriori, une fois un équipement ou un réglage
    visiblement différent de ce que vous attendiez, sans savoir pourquoi.

Un bandeau d'avertissement apparaît aussi si la version sélectionnée est une bêta.

!!! important "Important"

    Une mise à jour qui changerait de version **majeure** (ex. v2.x → v3.x) n'est **pas**
    proposée par cette voie : la structure des partitions a changé entre les deux, un flash par
    ce chemin ne fonctionnerait pas. Ce cas exige un flash **USB complet**, l'interface
    l'indique explicitement (« USB REQUIS ») si une telle version est détectée disponible.

    C'est exactement le cas que couvre notre [Installateur Web](../../outils/installateur-web.md) : un
    flashage complet (amorceur, partitions, firmware et interface) directement depuis votre
    navigateur, sans rien installer sur votre ordinateur. Il existe précisément parce qu'un
    changement de version majeure ne peut structurellement pas passer par une mise à jour OTA
    classique — c'est la voie à utiliser pour franchir ce palier.

Après confirmation, l'installation se déroule en 3 étapes suivies par une barre de
progression chacune : **Firmware**, **Interface web**, puis **Redémarrage**. Si un pack de
langue autre que celui d'origine est actif, l'appareil tente de le réinstaller après
l'écriture de l'interface (un indicateur dédié l'affiche) — en best-effort, sans bloquer la
suite si ça échoue.

## Mise à jour manuelle (fichier local)

Utile en l'absence d'accès Internet depuis l'appareil, ou pour installer une version qui
n'est plus listée dans le flux automatique. Deux boutons distincts, un par fichier à
téléverser (lien direct vers les releases GitHub fourni dans chaque fenêtre) :

* **Fichier Firmware** : le programme de l'appareil lui-même — tout le code qui pilote la
    radio, le réseau, MQTT, les plannings… C'est l'équivalent d'un nouveau cerveau pour
    l'appareil.
* **Fichier Filesystem** : uniquement l'interface web (ce que vous voyez dans votre
    navigateur) et vos équipements/groupes/pièces/plannings, qui vivent dans cette même
    partition. Idéal pour une correction graphique rapide, sans toucher au comportement radio
    de l'appareil.

!!! note "Note"

    Dans le firmware d'origine (rstrouse) comme dans les premières versions d'ESPSomfy-RTS,
    ce second fichier s'appelait **« Application »** plutôt que « Filesystem » — c'est le même
    composant : le binaire de la partition **LittleFS**. Le nom a changé en v3.0.0 pour
    décrire plus fidèlement ce qu'il contient réellement, mais si vous avez suivi d'anciens
    tutoriels ou discussions qui parlent de mettre à jour « l'Application », c'est bien de ce
    fichier qu'il s'agit.

### Reconnaître le bon fichier

Chaque release GitHub contient plusieurs fichiers, un par carte/puce — mieux vaut s'assurer
d'avoir le bon avant de téléverser. L'interface affiche et surligne elle-même le nom attendu
pour votre appareil, mais voici comment il est construit :

**Fichier Firmware :**

```
ESPSomfyRTS_[1: vX.X.X]_firmware_[2: carte][3: suffixe].bin
```

1. **Version** — par exemple `v3.0.0`.
2. **Carte** — la puce détectée : `esp32`, `esp32wrover` (ESP32 d'origine avec PSRAM),
    `esp32s3`, `esp32s2`, `esp32c3` ou `esp32c6`.
3. **Suffixe** *(absent sur une carte générique courante)* — `_BOX_wifi` ou `_BOX_eth` pour
    un boîtier officiel ; une variante technique (ex. taille de flash) pour certaines cartes
    qui en ont plusieurs déclinaisons.

> Exemple générique : `ESPSomfyRTS_v3.0.0_firmware_esp32.bin`
> Exemple boîtier : `ESPSomfyRTS_v3.0.0_firmware_esp32_BOX_eth.bin`

**Fichier Filesystem :**

```
ESPSomfyRTS_[1: vX.X.X]_filesystem[2: suffixe].bin
```

1. **Version** — identique au fichier firmware correspondant.
2. **Suffixe** *(absent sur une carte générique courante)* — `_BOX` pour un boîtier officiel
    (les deux variantes Wi-Fi/Ethernet partagent le même système de fichiers, qui embarque le
    français) ; une variante technique sur les cartes qui en ont plusieurs.

> Exemple générique : `ESPSomfyRTS_v3.0.0_filesystem.bin`
> Exemple boîtier : `ESPSomfyRTS_v3.0.0_filesystem_BOX.bin`

!!! note "Note"

    Contrairement au fichier Firmware, le fichier Filesystem ne porte **jamais** le nom précis
    de la carte (`esp32`, `esp32s3`…) : il est le même pour toutes les cartes qui partagent la
    même taille de partition de système de fichiers, peu importe leur puce.

### Contrôles avant envoi

Plusieurs vérifications bloquent un envoi incompatible avant même qu'il ne parte :

* le nom doit commencer par `ESPSomfyRTS_`, porter `_firmware_` ou `_filesystem_` selon le
    bouton utilisé, et finir en `.bin` ;
* un fichier `SomfyController...` (ancien nommage v2.x.x) est reconnu et refusé avec un
    message explicite, avant même d'être envoyé ;
* le **contenu** du fichier est aussi vérifié (marqueur d'image pour le firmware, géométrie
    LittleFS déclarée pour le système de fichiers) — un fichier v2.x.x renommé au format v3 ne
    passerait pas ce second contrôle non plus, la table de partitions ayant changé entre les
    deux versions majeures. Ce cas de figure (changement de version majeure) est justement
    celui que couvre l'[Installateur Web](../../outils/installateur-web.md), voir plus haut.

Une seule barre de progression ici (pas de notion d'étapes multiples) ; l'appareil redémarre
automatiquement une fois le transfert terminé et validé.

