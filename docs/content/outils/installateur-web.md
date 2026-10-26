# Installateur web

![Installateur web 0](outils/img/installateur-web-0){ .on-glb }


Écrit le firmware sur votre ESP32 **par le câble USB, depuis le navigateur**. Il remplace
esptool, plateformIO et tout autre outil à installer : la page ouvre elle-même le port
série et pilote la puce.

## Pourquoi il existe

La mise à jour ordinaire d'un appareil déjà en service se fait **depuis son interface**,
par le réseau — l'appareil télécharge sa nouvelle version tout seul. L'installateur web
sert aux cas où cette voie n'existe pas ou ne répond plus :

- **premier montage** : une carte neuve n'a pas encore de firmware, donc pas d'interface ;
- **appareil qui ne démarre plus** : plus de Wi-Fi, plus de page, plus de mise à jour ;
- **changement de lignée** : passer d'une 2.x à une 3.x, ou revenir en arrière ;
- **repartir propre** : effacer une configuration devenue incohérente.

Dans tous les autres cas, la mise à jour par le réseau est plus simple et **ne perd rien**.

## Ce qu'il vous faut

- **Chrome, Edge, Brave, Opera, ou Firefox (à partir de la version 151, mai 2026)**, sur
    ordinateur. Safari ne sait pas parler au port série ; la page vous en avertit et propose
    [web.esphome.io](installateur-esphome.md) comme solution de repli. Sur une version de
    Firefox antérieure à 151, c'est le même avertissement qui s'affiche.
- Un **câble USB de données**. Beaucoup de câbles ne portent que l'alimentation : ils
    chargent un téléphone mais ne transportent aucun signal. C'est la première cause d'échec.
- Le **pilote du convertisseur USB-série** de votre carte, CP2102 ou CH340 selon le modèle.

## Avant d'installer, sauvegardez

!!! danger "Attention"

    L'installation commence par un **effacement complet de la mémoire**. Tout disparaît :

    | Ce qui est perdu | Conséquence |
    |---|---|
    | Identifiants Wi-Fi | l'appareil repart en point d'accès, à reconfigurer |
    | Équipements déclarés | volets, stores, portes à redéclarer |
    | Télécommandes appairées et codes tournants | **les moteurs ne répondront plus** tant que l'appairage n'est pas refait |
    | Programmations, groupes, réglages | à ressaisir |

Depuis l'interface de l'appareil, **Système → Firmware → Sauvegarder** produit un fichier
qui contient tout cela. Après l'installation, **Restaurer le système** au même endroit vous
rend votre installation intacte, codes tournants compris.

Si l'appareil ne démarre plus, cette sauvegarde n'est évidemment plus possible — raison de
plus pour en garder une d'avance.

## Comment ça se passe

### 1. Connecter

Branchez l'appareil, cliquez sur **Connecter**. Le navigateur — pas la page — ouvre une
fenêtre qui liste les ports série de votre ordinateur ; choisissez le vôtre.

![Installateur web 1](outils/img/installateur-web-1){ .on-glb }

**Aucun port dans la liste ?** Quatre causes, par ordre de fréquence : câble de charge sans
fils de données, pilote USB-série absent, navigateur incompatible, ou appareil branché
*après* l'ouverture de la fenêtre. Changez de câble, vérifiez le pilote, puis réessayez.

Une fois connecté, un badge **Connecté** apparaît et quatre actions remplacent le bouton.

![Installateur web 2](outils/img/installateur-web-2){ .on-glb }

### 2. Installer : choisir son matériel

**Installer** ouvre la fenêtre « Quel matériel installez-vous ? », en deux onglets :
**ESP32** pour les cartes génériques, **Boîtier officiel** pour mes boîtiers.



#### L'onglet ESP32 : les cartes génériques

![Installateur web 3](outils/img/installateur-web-3){ .on-glb }


Chaque carte du catalogue s'affiche avec une courte description et une **note sur 5
étoiles**.

| Carte | Particularité | Note |
|---|---|---|
| ESP32 | double cœur, 520 Ko de mémoire vive | 4/5 — Fonctionnel |
| ESP32-Wrover | double cœur, avec PSRAM | 5/5 — Recommandé |
| ESP32-S3 | double cœur, USB natif | 5/5 — Recommandé |
| ESP32-C6 | cœur unique, USB natif | 3/5 — Fonctionnel |
| ESP32-C3 | cœur unique | 1/5 — Limité |
| ESP32-S2 | cœur unique, USB natif | 1/5 — Limité |

!!! warning "ESP32-C6 : uniquement avec 8 Mo de flash"

    Une carte ESP32-C6 de 4 Mo ne démarrerait pas sur l'image proposée : le C6 n'est
    pris en charge qu'en 8 Mo. Voir [Composants](../commun/composants.md).

**Comprendre la note.** Un lien « Comprendre la note », sous la grille, déplie la
même explication. La note additionne quatre caractéristiques matérielles :

| Caractéristique | Points | Pourquoi |
|---|---|---|
| Double cœur | 2 | la pile réseau tourne sur son propre cœur ; sur un cœur unique, elle partage celui de l'application et supporte moins bien la charge |
| Mémoire vive interne | 2 (512 Ko ou plus), 1 (400 Ko ou plus) | la marge avant fragmentation quand plusieurs navigateurs sont connectés |
| USB natif | 1 | installation sans pilote USB-série ; **n'agit pas sur la stabilité du réseau**, seulement sur le confort d'installation |
| PSRAM | 1 | mémoire supplémentaire réelle, mais que le firmware n'exploite pas aujourd'hui : un atout neutre |

Trois zones en découlent :

- **Recommandé (5/5)** : double cœur et mémoire complète, plus un atout de plus
  (USB natif ou PSRAM) ;
- **Fonctionnel (3 ou 4/5)** : un compromis, cœur unique compensé par la mémoire ou
  l'USB natif, ou double cœur sans atout de plus ;
- **Limité (2/5 ou moins)** : cœur unique sans vraie compensation, la marge la plus
  faible du catalogue.

Une note basse ne veut pas dire « ne marche pas » : seulement une marge moindre quand
l'appareil est très sollicité.

!!! tip "Le choix de la carte compte"

    Les cartes ESP32 coûtent peu : mieux vaut investir un peu plus dans une carte bien
    notée, sur laquelle ESPSomfy-RTS fonctionnera **confortablement**, plutôt que de
    chercher la moins chère et de composer avec ses limites. Une **ESP32-Wrover**
    ou une **ESP32-S3** (5/5) est le meilleur choix ; une **ESP32** classique (4/5) reste
    un très bon compromis.

#### L'onglet Boîtier officiel

Deux cartes : **Boîtier Wi-Fi** et **Boîtier Wi-Fi & Ethernet**. Il n'y a rien d'autre
à choisir, le matériel étant figé : l'installateur sait déjà quelle image écrire.

![Installateur web 4](outils/img/installateur-web-4){ .on-glb }

Choisir l'édition Ethernet & Wi-Fi fait apparaître un avertissement : ce modèle
demande de maintenir son bouton-poussoir pendant l'écriture (voir
[le cas particulier](#boitier-ethernet) plus bas).

#### Choisir la version

Après le matériel, le sélecteur propose les **cinq dernières versions publiées**,
directement installables. Les plus anciennes y figurent aussi, mais grisées et
marquées « téléversement manuel » : elles existent toujours, elles s'installent par
l'autre bouton. Une **pré-version** affiche un avertissement : elle est publiée pour
être essayée, pas pour un usage quotidien.

### 3. Téléverser un fichier

**Téléverser** sert à installer un fichier que vous avez téléchargé vous-même : une
version absente du sélecteur, ou une image que vous avez construite. Seules les
**images complètes** conviennent : elles contiennent l'amorceur, la table de
partitions, le firmware et l'interface, et s'écrivent donc correctement quoi qu'il y
ait déjà sur la puce. L'archive `.zip` se donne telle quelle, inutile de l'extraire.

La fenêtre a deux onglets, **Images v3.x** et **Images v2.x**. Ils ne filtrent rien :
ils expliquent seulement la convention de nommage du fichier que vous tenez. Le bon
onglet s'ouvre tout seul quand vous choisissez un fichier.

#### Comprendre le nom d'un fichier

Le **modèle de puce est déduit du nom du fichier** : gardez le nom d'origine. S'il ne
dit rien, l'installation est refusée plutôt que devinée, car écrire l'image d'un
ESP32-C3 sur un ESP32 ne produirait qu'un appareil muet.

**Images v3.x** : le terme repère est **factory**.

![Installateur web 5](outils/img/installateur-web-5){ .on-glb }

```text
ESPSomfyRTS_[1]_factory_[2]_[3].zip
```

1. **Version** de l'image, par exemple `v3.0.0` ;
2. **Carte** : `esp32`, `esp32wrover`, `esp32c3`, `esp32s2` ou `esp32s3` ;
3. **Option** : `BOX_wifi` ou `BOX_eth`, réservé à mes boîtiers. Cette partie est
   **absente** des images pour cartes génériques, et une future variante matérielle
   pourra occuper cette même position.

Exemples : `ESPSomfyRTS_v3.0.0_factory_esp32.zip` (carte générique),
`ESPSomfyRTS_v3.0.0_factory_esp32_BOX_wifi.zip` (boîtier Wi-Fi).

**Images v2.x** : le terme repère est **onboard**.

![Installateur web 6](outils/img/installateur-web-6){ .on-glb }

```text
SomfyController.onboard.[1]_[2].bin.zip
```

1. **Carte** : `esp32`, `esp32wrover`, `esp32c3`, `esp32s2` ou `esp32s3` ;
2. **Mémoire** flash, `4mb` ou `8mb`. Présente sur les seules images ESP32-S3,
   absente partout ailleurs (et le `_` qui la précède avec elle).

Exemples : `SomfyController.onboard.esp32c3.bin.zip`,
`SomfyController.onboard.esp32s3_4mb.bin.zip`.

### 4. Cas particulier du boîtier Wi-Fi & Ethernet { #boitier-ethernet }

Ce modèle n'entre pas seul en mode écriture. **Maintenez le bouton poussoir sous le boîtier
enfoncé** avant de cliquer sur Installer, relâchez-le une fois l'effacement terminé et
l'écriture commencée. À la fin, il quitte ce mode en redemarrant de lui-meme.

### 5. L'installation pas à pas

Dès que vous cliquez sur **Installer**, une fenêtre suit chaque étape **laisser faire** :

1. **Connexion à l'appareil.** L'installateur ouvre la liaison avec la puce et la
   reconnaît : « Appareil détecté » suivi de son modèle. Si l'image ne prend pas en charge
   cette puce, un message d'erreur l'indique et l'installation s'arrête.
2. **Téléchargement du firmware** (pour une version en ligne). L'image est récupérée par
   votre navigateur, jamais par un serveur intermédiaire.
3. **Effacement de la mémoire flash.** Toute la mémoire est effacée, comme annoncé plus
   haut : la sauvegarde doit donc avoir été faite **avant** de lancer l'installation.
4. **Écriture du firmware.** Une barre de progression et un pourcentage suivent
   l'écriture. **Ne débranchez pas l'appareil et ne fermez pas l'onglet** avant la fin.
5. **Installation terminée.** Votre apparail va redemarrer automatiquement de lui-même.

<div class="rts-row" markdown>

![Connexion à l'appareil](outils/img/installateur-web-7){ .on-glb }
![Effacement de la mémoire flash](outils/img/installateur-web-8){ .on-glb }
![Connexion à l'apparei](outils/img/installateur-web-9){ .on-glb }
</div>

![Effacement de la mémoireflash](outils/img/installateur-web-10){ .on-glb }

!!! tip "Voir ce qui se passe"

    Le lien **Voir les journaux**, dans la fenêtre, déroule le détail technique de chaque
    événement. Le bouton **Télécharger** en fait un fichier texte, utile à joindre à une
    demande d'aide si l'installation échoue.

!!! note "« Impossible de se connecter à l'appareil »"

    Réessayez, ou maintenez le bouton **BOOT** de la carte enfoncé pendant que vous
    cliquez sur **Installer**. Sur le boîtier Wi-Fi & Ethernet, c'est le bouton-poussoir
    sous le boîtier (voir [le cas particulier](#boitier-ethernet)).


### 6. Après { #apres }

L'appareil redémarre. N'ayant plus d'identifiants Wi-Fi, il ouvre après quelques secondes
son **[point d'accès de secours](../commun/point-d-acces.md)** — nommé d'après son nom d'hôte, « ESPSomfyRTS » par
défaut. Connectez-vous-y pour lancer l'assistant de premier démarrage, puis restaurez votre
sauvegarde.

## Les journaux série { #journaux }

Le bouton à icône de terminal ouvre une console qui affiche, horodatée, **tout ce que
l'appareil écrit sur le port série** — le même flux qu'un moniteur série d'IDE.

![Installateur web 11](outils/img/installateur-web-11){ .on-glb }

C'est l'outil de diagnostic quand rien d'autre ne répond : un appareil qui redémarre en
boucle, qui n'obtient pas d'adresse IP ou qui plante au démarrage le dit ici.

Quatre commandes : **réinitialiser l'appareil** (le redémarre sans le débrancher, pratique
pour voir le démarrage depuis la première ligne), **télécharger** le journal en fichier
texte, **effacer** l'affichage, **arrêter** la lecture pour libérer le port.

!!! note "Note"

    Le port série ne se partage pas. Tant que la console est ouverte, aucune installation
    n'est possible — et inversement. La page ferme la console d'elle-même quand vous lancez
    une installation.

## Ce qui ne quitte pas votre ordinateur

Le firmware est téléchargé depuis le site vers **votre navigateur**, puis écrit directement
sur l'ESP32 par le câble. Il ne transite par aucun serveur intermédiaire, et rien de ce que
l'appareil raconte dans les journaux n'est envoyé nulle part.

## Si cet installateur ne fonctionne pas

Votre carte n'est pas détectée, l'écriture échoue en cours de route, ou rien ne se passe malgré
un bon câble ? Il existe une **seconde voie**, indépendante de cette page : l'outil de flashage du
projet ESPHome, **web.esphome.io**. Elle écrit la même image, avec ses propres écrans.

La procédure complète, pas à pas, est sur la page
[Installateur de secours : web.esphome.io](installateur-esphome.md).
