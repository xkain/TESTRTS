# Mises à jour du firmware

Le bloc **Mises à jour** se trouve en haut de la page **Système → Firmware** — voir
[Firmware](index.md). Il montre où en est votre appareil et permet de lancer une mise à jour.

![mise à jour 1](v3/img/mise-a-jour-1){ .on-glb }

## Le bloc « Mises à jour »

En haut du bloc, à gauche, une ligne indique l'**état** de votre version ; à droite, le numéro de
la version **installée**.

| État | Ce que dit le bloc |
|---|---|
| **Votre système est à jour** | rien à faire ; l'heure de la dernière vérification est affichée |
| **Mise à jour disponible** *(en rouge)* | la version installée, une flèche, puis la version proposée ; un lien **notes de version** en ouvre le texte |
| **Recherche automatique désactivée** | l'interrupteur **Mises à jour** de la page [Général](../general/index.md#sécurité--mises-à-jour) est coupé : aucune vérification n'est faite |
| **Impossible de vérifier** | ce navigateur n'atteint pas la liste des versions publiées en ligne |

Quand une mise à jour est disponible, un rappel apparaît aussi **hors de cette page** : une
icône de téléchargement rouge dans l'en-tête sur téléphone, un point rouge sur l'onglet
**Système** et sur le sous-onglet **Firmware**, et le bouton rouge du menu latéral sur grand écran.
Tout disparaît dès que l'appareil est à jour.

Sous cet état, deux boutons permettent de mettre à jour :

* **Mise à jour en ligne** : l'appareil est mis à jour avec une version publiée par le projet. C'est
    la voie recommandée, et le bouton devient rouge quand une version est disponible. Voir
    [Mise à jour en ligne](#mise-a-jour-en-ligne) ;
* **Installer depuis un fichier** : vous envoyez vous-même un fichier de firmware, par exemple
    quand vous n'avez pas Internet sur le navigateur utilisé. Voir
    [Mise à jour manuelle](#mise-a-jour-manuelle-fichier-local).

Dans les deux cas, une **sauvegarde** de la configuration actuelle est proposée automatiquement
avant de lancer l'installation (sauf depuis un smartphone, où le téléchargement du fichier est moins
pratique).

L'interface web est **intégrée au firmware** : il n'y a qu'**un seul fichier** à installer, et
l'interface est mise à jour du même coup. Vos équipements, groupes, pièces, plannings, etc. ne sont
**jamais réécrits** par une mise à jour.

!!! warning "Avertissement"

    Une fois lancée, l'installation ne peut **plus être interrompue** avant son terme : aucun
    bouton Annuler n'est proposé pendant l'écriture, parce qu'il n'y a de toute façon plus rien à
    annuler côté appareil. Gardez-le sous tension jusqu'à la fin.

## Mise à jour en ligne (recommandée) { #mise-a-jour-en-ligne }

**Mise à jour en ligne** ouvre la fenêtre **Mise à jour Logicielle**, qui liste les versions
publiées sur le projet. Seules sont proposées celles qui existent **pour votre carte** et pour la
**table de partitions** de votre appareil.

![mise à jour 2](v3/img/mise-a-jour-2){ .on-glb }

!!! info "Il faut un accès à Internet, mais depuis votre navigateur"

    La vérification, le téléchargement de la version et la lecture de ses notes se font depuis
    **le navigateur** de l'ordinateur ou du smartphone avec lequel vous ouvrez l'interface : il va
    chercher les fichiers publiés par le projet sur GitHub, puis les envoie à l'appareil sur votre
    réseau local. **L'appareil lui-même ne se connecte plus à GitHub directement depuis la v3.0.0.**

    Il faut donc que ce navigateur ait **accès à Internet *et* à l'appareil en même temps**. Ce n'est
    pas le cas, par exemple, quand votre téléphone est connecté au
    [point d'accès de secours](../../aide/point-d-acces.md) de l'appareil, qui n'a pas d'Internet.
    Le bloc affiche alors **Impossible de vérifier** : passez par
    l'[installation depuis un fichier](#mise-a-jour-manuelle-fichier-local).

| Type | Tag / Nom | Utilisation recommandée |
| :--- | :--- | :--- |
| **Stable** | `vX.Y.Z` | Officielle, testée pour un usage quotidien. |
| **Bêta** | `vX.Y.Z-PRE` | Pour essayer les correctifs avant la sortie officielle. |

La liste en ligne garde les **cinq dernières versions stables**. Elle n'est pas limitée aux versions
plus récentes : revenir à une version antérieure est proposé aussi (sans descendre en dessous de la
v3.0.0), et la fenêtre de confirmation le signale alors comme un retour en arrière. Réinstaller la
version déjà en place est également possible : le bouton s'intitule alors **Réinstaller**. Seules les
versions stables déclenchent le rappel de « mise à jour disponible » : une bêta ne s'obtient que
volontairement, depuis cette fenêtre.

Les notes de version s'affichent sous le sélecteur, avec un lien pour les lire sur GitHub. Elles sont
elles aussi publiées avec cette liste.

### Mode Production ou mode Développeur

En haut de cette fenêtre, un **menu à trois points verticaux** propose deux modes :

![mise à jour 3](v3/img/mise-a-jour-3){ .on-glb }

| Mode | Ce que la liste propose |
| :--- | :--- |
| **Production** *(par défaut)* | les versions **Stable** et **Bêta** publiées sur le dépôt |
| **Développeur** | en plus, la **dernière version de développement**, construite automatiquement |

Le mode **Développeur** n'est **jamais mémorisé** : à chaque ouverture de la fenêtre, vous repartez
en mode Production. Pour l'activer, l'interface demande **à chaque fois une confirmation**, car
cette version peut rendre l'appareil inutilisable et exiger un **reflash par USB** : vous en assumez
seul la responsabilité. Si aucune version de développement n'existe pour votre appareil, un message
vous le dit. Une version de développement n'a pas de numéro comparable aux autres : elle ne propose
ni réinstallation ni retour en arrière.

!!! warning "Une version de développement n'est pas une bêta"

    | | **Bêta** (`vX.Y.Z-PRE`) | **Développeur** |
    | :--- | :--- | :--- |
    | **Origine** | une version **publiée** sur le dépôt, destinée à être essayée avant la sortie officielle | un **build automatique** du code le plus récent, refait à chaque modification du firmware |
    | **Test** | pas entièrement testée, mais **identifiée et annoncée** avec ses notes de version | **jamais testée** : elle peut contenir un travail en cours |
    | **Identifiant** | un numéro de version portant le suffixe `-PRE` | la version de base suivie du **code court du commit** |
    | **Où la trouver** | mode Production et mode Développeur | **mode Développeur uniquement** |
    | **Avertissement** | « version bêta préliminaire qui n'a pas été entièrement testée » | « version de développement non testée : sauvegardez votre configuration avant d'installer » |
    | **Notes de version** | la page de la release | les notes publiées avec cette version de développement |

    Une bêta est un **jalon que vous pouvez suivre** : elle reste en ligne et porte un numéro. La
    version de développement est une **photo mouvante** du travail en cours : elle change à chaque
    nouveau build, et elle n'est utile que pour essayer un correctif précis ou aider à tester.
    **Sauvegardez votre configuration avant de l'installer**, et préférez la Stable pour un usage
    quotidien.

!!! important "Important"

    **Prenez le temps de lire les notes de version avant d'installer.** Une mise à jour ne se
    limite pas à des correctifs discrets : elle peut renommer, déplacer ou changer le
    comportement par défaut d'un réglage que vous utilisez déjà. Sauter cette lecture,
    c'est risquer de découvrir le changement a posteriori, une fois un équipement ou un réglage
    visiblement différent de ce que vous attendiez, sans savoir pourquoi.

Un bandeau d'avertissement apparaît aussi si la version sélectionnée est une bêta ou une version
de développement.

### Le déroulement de l'installation

Après le clic sur **Mettre à jour**, une fenêtre vous demande de confirmer. Son texte change selon
le cas : mise à jour, **réinstallation**, ou **retour en arrière** — ce dernier rappelle que la
configuration sera relue par un firmware plus ancien, et qu'il faut avoir téléchargé la
sauvegarde.

Si vous êtes sur un ordinateur, la sauvegarde est téléchargée à ce moment. L'installation suit
alors **trois étapes**, avec une seule barre de progression qui repart de zéro à chacune :

| Étape | Ce qui se passe |
| :--- | :--- |
| **1. Téléchargement** | le navigateur récupère l'image de votre carte et en vérifie la taille |
| **2. Installation** | le navigateur l'envoie à l'appareil, qui l'écrit |
| **3. Redémarrage** | l'appareil redémarre sur la nouvelle version ; la barre cède la place à un message d'attente |

À l'étape 3, l'interface attend le retour de l'appareil, puis **renvoie le pack de la langue
active** (et celui de la langue d'origine), car les libellés d'une langue téléchargée peuvent ne
plus correspondre à la nouvelle version. Si ce renvoi échoue, un message l'indique : le pack se
réinstalle ensuite depuis [Gérer les langues](../general/langues.md). L'installation se termine par
un message de réussite, et la page se recharge d'elle-même.

!!! note "Ce que l'appareil vérifie, et comment il se protège"

    * **Empreinte** : le navigateur envoie avec l'image son empreinte SHA-256, lue dans la
      liste en ligne. L'appareil la recalcule pendant l'écriture et **refuse** de rendre l'image
      démarrable si elles diffèrent.
    * **Compatibilité** : l'image porte un repère qui indique la table de partitions pour laquelle
      elle a été bâtie. L'appareil refuse une image qui ne correspond pas à la sienne.
    * **Deux emplacements** : l'image est écrite dans l'emplacement d'application **inactif**. Le
      firmware en cours de fonctionnement n'est pas touché pendant l'écriture.
    * **Retour automatique** : la nouvelle version n'est considérée comme valide qu'après **60
      secondes** de fonctionnement avec un accès possible (réseau ou point d'accès). Si elle plante
      avant, l'appareil **redémarre sur la version précédente**. Dans ce cas, l'interface signale
      que l'installation n'a pas abouti, en citant la version qui tourne.
    * **Garde-fou** : si l'appareil ne répond pas dans les **trois minutes** après l'envoi, la fenêtre
      se débloque et affiche une erreur, au lieu de rester bloquée.

## Mise à jour manuelle (fichier local) { #mise-a-jour-manuelle-fichier-local }

Utile quand le navigateur n'atteint pas la liste en ligne, ou pour installer une version qui
n'est plus listée. **Installer depuis un fichier** ouvre la fenêtre **Mise à jour manuelle** :
vous y déposez le fichier **Firmware**, le programme complet de l'appareil — radio, réseau, MQTT,
plannings, et l'interface web qu'il contient.

![mise à jour 4](v3/img/mise-a-jour-4){ .on-glb }

!!! note "Il n'y a plus de fichier « Littlefs / application »"

    Dans le firmware d'origine (rstrouse) et dans les dernières versions v2.x.x, l'interface web était un
    second fichier, appelé **« Application »** ou **« LittleFs »**, à téléverser séparément. Ce
    n'est plus le cas : l'interface est **compilée dans le firmware**.

Le fichier se récupère sur la page [Releases](https://github.com/xkain/ESPSomfy-RTS/releases) du
projet. Un lien direct est fourni dans la fenêtre.

### Reconnaître le bon fichier

Chaque release GitHub contient plusieurs fichiers, un par carte/puce — mieux vaut s'assurer
d'avoir le bon avant de téléverser. L'interface affiche et surligne elle-même le nom attendu
pour votre appareil, mais voici comment il est construit :

```
ESPSomfyRTS_[1: vX.X.X]_firmware_[2: carte][3: suffixe].bin
```

1. **Version** — par exemple `v3.0.1`.
2. **Carte** — la puce détectée : `esp32`, `esp32wrover` (ESP32 d'origine avec PSRAM),
    `esp32s3`, `esp32s2`, `esp32c3` ou `esp32c6`.
3. **Suffixe** *(absent sur une carte générique courante)* — `_BOX_wifi` ou `_BOX_eth` pour
    un boîtier officiel ; une variante technique (ex. taille de flash) pour certaines cartes
    qui en ont plusieurs déclinaisons.

> Exemple générique : `ESPSomfyRTS_v3.0.1_firmware_esp32.bin`
>
> Exemple boîtier : `ESPSomfyRTS_v3.0.1_firmware_esp32_BOX_eth.bin`

### Contrôles avant envoi

Plusieurs vérifications bloquent un envoi incompatible avant même qu'il ne parte :

* le nom doit commencer par `ESPSomfyRTS_` et finir en `.bin` ;
* un fichier `SomfyController...` (ancien nommage v2.x.x) est reconnu et refusé avec un
    message explicite ;
* le **contenu** du fichier est aussi contrôlé : il doit porter le repère de la table de
    partitions de l'appareil. Un fichier v2.x.x renommé au format v3 ne passerait pas ce
    second contrôle non plus. Ce cas de figure (changement de version majeure) est justement
    celui que couvre l'[Installateur Web](../../outils/installateur-web.md).

Contrairement à la mise à jour en ligne, aucune empreinte n'est fournie : seul ce repère est
contrôlé. Les protections de l'appareil (écriture dans l'emplacement inactif, validation après 60
secondes, retour automatique) restent, elles, identiques.

Il y a une seule barre de progression ; une fois le transfert terminé et validé, l'appareil
redémarre et un message d'attente reste affiché jusqu'à son retour. La page se recharge alors
d'elle-même. Contrairement à la mise à jour en ligne, le **pack de langue n'est pas renvoyé** : si
des libellés de l'interface paraissent manquants après l'installation, réinstallez-le depuis
[Gérer les langues](../general/langues.md).
