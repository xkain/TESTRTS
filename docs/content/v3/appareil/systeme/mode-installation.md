# Mode installation

Le Mode installation est un petit programme rangé à part dans l'appareil, qui ne sait faire
qu'une chose : **recevoir un firmware et l'installer**. Il ne pilote aucun équipement, mais il
reste disponible même quand le firmware principal est abîmé, effacé ou incapable de démarrer.

---

## Pourquoi il existe

Le firmware principal ne s'écrit jamais lui-même. Chaque mise à jour passe par le Mode
installation : l'appareil y redémarre, reçoit l'image, l'écrit, puis redémarre sur le nouveau
firmware. Votre configuration (réseau, sécurité, équipements, plannings) n'est jamais touchée.

Si quelque chose tourne mal — envoi coupé, image refusée, nouveau firmware qui plante au
démarrage — l'appareil revient sur le Mode installation au lieu de rester sans rien. Il suffit
alors de relancer l'installation.

## 1. Quand l'appareil y passe { #quand-l-appareil-y-passe }

| Cas | Ce qui se passe |
| :--- | :--- |
| **Mise à jour** (en ligne ou par fichier) | l'interface fait passer l'appareil en Mode installation, envoie l'image, puis le ramène sur le nouveau firmware ; vous n'avez rien à faire |
| **Bouton** `Redémarrer en mode installation` | page **Appareil › Système**, onglet **Mises à jour**, tuile **Installation manuelle** ; la page du Mode installation s'ouvre ensuite d'elle-même |
| **Six coupures d'alimentation** | pour un appareil dont l'interface ne répond plus ; voir [la section suivante](#six-coupures) |
| **Nouveau firmware qui plante** | s'il plante avant d'avoir fonctionné 60 secondes, l'appareil revient seul sur le Mode installation |

## 2. Six coupures d'alimentation { #six-coupures }

Débranchez et rebranchez l'appareil **six fois de suite**, chaque coupure dans les 5 secondes
qui suivent le démarrage précédent. Les trois premières mènent au
[mode Récupération](recuperation.md) ; ne vous arrêtez pas pendant son clignotement, continuez
jusqu'à six.

| Démarrage | LED |
| :--- | :--- |
| 1er et 2e | **allumée fixe** |
| 3e, 4e et 5e | **clignotement rapide** : seuil du mode Récupération atteint, continuez |
| 6e | **allumée 1,5 seconde**, puis l'appareil redémarre en Mode installation |

Le compteur repart de zéro dès que l'appareil reste alimenté plus de 5 secondes.

## 3. Comment s'y connecter { #comment-s-y-connecter }

Le Mode installation reprend la configuration de l'appareil : même réseau Wi-Fi ou Ethernet,
même adresse, même nom (par exemple `http://espsomfyrts.local`), même code PIN ou mot de passe.

Après les **six coupures**, il ouvre **en plus** un réseau Wi-Fi **ouvert**, nommé
**`ESPSomfy-INSTALL`**, à l'adresse `192.168.4.1`. Un portail captif propose généralement d'ouvrir
la page sur votre téléphone. Le code PIN ou le mot de passe reste exigé pour installer, si la
sécurité est activée.

Si l'appareil n'a **pas de réseau** (aucun Wi-Fi enregistré, réglé en point d'accès seul, ou réseau
absent), le Mode installation rouvre **son point d'accès habituel**, avec le même nom et le même mot
de passe. Restez connecté dessus : l'appareil répond toujours à l'adresse `192.168.4.1`.

!!! tip "Retour automatique"

    Sans aucune activité pendant **10 minutes**, l'appareil revient seul sur son firmware, s'il
    est intact. Une entrée involontaire ne le laisse donc pas hors service.

## 4. La page du Mode installation { #la-page }

| Élément | Rôle |
| :--- | :--- |
| **Firmware installé** | la version présente, ou **Aucun firmware valide** |
| **Le fichier qui correspond à votre appareil** | le nom du fichier à choisir, la partie propre à votre carte en couleur, comme dans [Reconnaître le bon fichier](mises-a-jour.md#mise-a-jour-manuelle-fichier-local) |
| **Code PIN** ou **mot de passe** | présent seulement si la sécurité est activée |
| Zone de dépôt | cliquez, ou glissez-y le fichier `.bin` |
| `Installer` | envoie le fichier ; l'appareil redémarre et la page recharge l'interface habituelle |
| `Revenir au firmware` | quitte le Mode installation sans rien installer ; grisé s'il n'y a aucun firmware valide |

L'appareil refuse un fichier bâti pour une autre puce, pour une autre table de partitions, ou
abîmé. Dans ce cas, le firmware déjà en place n'est pas forcément conservé : installez le bon
fichier.

!!! warning "Pas de fichier `_installmode_` sur cette page"

    Cette page attend le **firmware** (`_ota_`). Un fichier `_installmode_` n'y est reconnu qu'une
    fois écrit à la place du firmware : il est refusé, et l'appareil reste en Mode installation
    jusqu'à l'envoi du bon fichier. Pour remplacer le Mode installation, passez par l'interface,
    voir [la section suivante](#mettre-a-jour).

## 5. Mettre à jour le Mode installation { #mettre-a-jour }

Le Mode installation n'est pas dans le fichier du firmware : il se met à jour à part.

* **Automatiquement**, après une [mise à jour en ligne](mises-a-jour.md#mise-a-jour-en-ligne) :
    si la version installée apporte un autre Mode installation, l'interface l'envoie à la fin
    (« Mise à jour du mode installation… »). En cas d'échec, le message de réussite le signale et
    l'ancien reste en place : il fonctionne toujours.
* **À la main**, avec `Installer depuis un fichier` : choisissez le fichier
    `ESPSomfyRTS_vX.X.X_installmode_<carte>.bin` de la release. L'interface le reconnaît et demande
    confirmation. Le firmware n'est pas touché ; l'appareil redémarre ensuite.

## 6. Quand faut-il passer par l'USB { #usb }

Le Mode installation se suffit à lui-même, sauf dans deux cas :

* **Passage de la v2.x à la v3** : l'organisation de la mémoire change, voir [la migration](../../migration.md) ;
* **Mode installation absent ou abîmé, et firmware qui ne démarre plus**. Tant que le firmware
  fonctionne, un Mode installation absent (« Le mode installation est absent de cet appareil ») se
  réinstalle par fichier, voir [Mettre à jour le Mode installation](#mettre-a-jour).

Dans ces deux cas, utilisez l'[installateur web](../../../outils/installateur-web.md).

!!! important "Boîtier Wi-Fi & Ethernet"

    Maintenez le **bouton poussoir** situé sous le boîtier enfoncé avant de cliquer sur
    `Installer` dans l'installateur web. Relâchez-le une fois l'effacement terminé et l'écriture
    commencée. À la fin, débranchez puis rebranchez le boîtier pour qu'il quitte le mode flash.

## 7. Mode installation ou mode Récupération ?

| | Mode installation | [Mode Récupération](recuperation.md) |
| :--- | :--- | :--- |
| **Sert à** | installer ou réinstaller un firmware | réparer la configuration (réseau, sécurité, remise à zéro) |
| **Coupures d'alimentation** | six | trois |
| **Réseau** | celui de l'appareil, ou son point d'accès s'il n'a pas de réseau ; plus `ESPSomfy-INSTALL` après les six coupures | `ESPSomfy-RECOVERY` uniquement |
| **Configuration** | jamais modifiée | modifiable |

## Étape suivante

* [Mises à jour du firmware](mises-a-jour.md)
* [Mode Récupération](recuperation.md)
* [Installateur web](../../../outils/installateur-web.md)
