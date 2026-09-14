[← Sommaire](README.md)

# Installateur web

Écrit le firmware sur la puce **par le câble USB, depuis le navigateur**. Il remplace
esptool, l'IDE Arduino et tout autre outil à installer : la page ouvre elle-même le port
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

- **Chrome, Edge, Brave ou Opera**, sur ordinateur. Firefox et Safari ne savent pas parler
  au port série et n'y arriveront pas ; la page vous en avertit et propose
  [web.esphome.io](https://web.esphome.io) comme solution de repli.
- Un **câble USB de données**. Beaucoup de câbles ne portent que l'alimentation : ils
  chargent un téléphone mais ne transportent aucun signal. C'est la première cause d'échec.
- Le **pilote du convertisseur USB-série** de votre carte, CP2102 ou CH340 selon le modèle.

## Avant d'installer, sauvegardez

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

**Aucun port dans la liste ?** Quatre causes, par ordre de fréquence : câble de charge sans
fils de données, pilote USB-série absent, navigateur incompatible, ou appareil branché
*après* l'ouverture de la fenêtre. Changez de câble, vérifiez le pilote, puis réessayez.

Une fois connecté, un badge **Connecté** apparaît et quatre actions remplacent le bouton.

### 2. Installer, ou téléverser

**Installer** ouvre le choix du matériel, en deux onglets — les cartes ESP32 génériques et
les boîtiers officiels — puis le choix de la version.

Le sélecteur propose les **cinq dernières versions publiées**, directement installables.
Les plus anciennes y figurent aussi, mais grisées et marquées « téléversement manuel » :
elles existent toujours, elles s'installent par l'autre bouton. Une **pré-version** affiche
un avertissement : elle est publiée pour être essayée, pas pour un usage quotidien.

**Téléverser** sert à installer un fichier que vous avez téléchargé vous-même — une version
absente du sélecteur, ou une image que vous avez construite. Seules les **images complètes**
conviennent : elles contiennent l'amorceur, la table de partitions, le firmware et
l'interface, et s'écrivent donc correctement quoi qu'il y ait déjà sur la puce.

| Lignée | Nom du fichier | Repère |
|---|---|---|
| 3.x | `ESPSomfyRTS_v3.0.4_factory_esp32c3.zip` | le mot **factory** |
| 2.x | `SomfyController.onboard.esp32c3.bin.zip` | le mot **onboard** |

L'archive `.zip` se donne telle quelle, inutile de l'extraire. Le modèle de puce est déduit
du **nom du fichier** : gardez le nom d'origine. S'il ne dit rien, l'installation est
refusée plutôt que devinée — écrire l'image d'un ESP32-C3 sur un ESP32 ne produirait qu'un
appareil muet.

### 3. Cas particulier du boîtier Wi-fi & Ethernet

Ce modèle n'entre pas seul en mode écriture. **Maintenez le bouton poussoir sous le boîtier
enfoncé** avant de cliquer sur Installer, relâchez-le une fois l'effacement terminé et
l'écriture commencée. À la fin, **débranchez puis rebranchez** le boîtier pour qu'il quitte
ce mode.

### 4. Après

L'appareil redémarre. N'ayant plus d'identifiants Wi-Fi, il ouvre après quelques secondes
son **point d'accès de secours** — nommé d'après son nom d'hôte, « ESPSomfy RTS » par
défaut. Connectez-vous-y pour lancer l'assistant de premier démarrage, puis restaurez votre
sauvegarde.

## Les journaux série

Le bouton à icône de terminal ouvre une console qui affiche, horodatée, **tout ce que
l'appareil écrit sur le port série** — le même flux qu'un moniteur série d'IDE.

C'est l'outil de diagnostic quand rien d'autre ne répond : un appareil qui redémarre en
boucle, qui n'obtient pas d'adresse IP ou qui plante au démarrage le dit ici.

Quatre commandes : **réinitialiser l'appareil** (le redémarre sans le débrancher, pratique
pour voir le démarrage depuis la première ligne), **télécharger** le journal en fichier
texte, **effacer** l'affichage, **arrêter** la lecture pour libérer le port.

> Le port série ne se partage pas. Tant que la console est ouverte, aucune installation
> n'est possible — et inversement. La page ferme la console d'elle-même quand vous lancez
> une installation.

## Ce qui ne quitte pas votre ordinateur

Le firmware est téléchargé depuis le site vers **votre navigateur**, puis écrit directement
sur la puce par le câble. Il ne transite par aucun serveur intermédiaire, et rien de ce que
l'appareil raconte dans les journaux n'est envoyé nulle part.
