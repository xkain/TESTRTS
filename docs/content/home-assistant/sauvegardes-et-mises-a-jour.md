# Sauvegardes et mises à jour

L'intégration garde dans Home Assistant une copie de la configuration de l'appareil, et installe
les nouvelles versions de son micrologiciel.

## Les boutons de l'appareil { #boutons }

Trois boutons de catégorie configuration figurent sur la page de l'appareil ESPSomfy-RTS dans Home
Assistant :

| Bouton | Effet |
| :--- | :--- |
| `Sauvegarder` | copie la configuration de l'appareil dans Home Assistant |
| `Télécharger la sauvegarde` | fait une nouvelle sauvegarde, puis affiche une notification avec un lien pour la télécharger |
| `Redémarrer` | redémarre l'appareil ; à partir du firmware v2.3.0 |

La notification de `Télécharger la sauvegarde`, intitulée **Sauvegarde de &lt;appareil&gt;**,
indique : *« Télécharger : &lt;lien&gt;. Le lien reste valable 10 minutes ; le fichier se restaure
depuis l'interface de l'appareil. »*

## Les sauvegardes gardées { #fichiers }

Chaque sauvegarde est un fichier rangé dans la configuration de Home Assistant :

```text
<config>/ESPSomfyRTS_<serverId>/AAAA-MM-JJTHH_MM_SS.backup
```

`<serverId>` est l'identifiant de l'appareil, la date et l'heure sont celles de Home Assistant.
Les **5 plus récentes** sont gardées ; les plus anciennes s'effacent d'elles-mêmes à chaque
nouvelle sauvegarde.

Le capteur de diagnostic **Dernière sauvegarde** donne la date de la plus récente ; son attribut
`count` le nombre de fichiers gardés.

Pour effacer des fichiers sans toucher à l'appareil, l'action
`espsomfy_rts_enhanced.delete_backups` (**Effacer les sauvegardes**) vise le bouton `Sauvegarder` ;
son champ `keep` (**Conserver**) est le nombre de sauvegardes récentes à garder, **0** les efface
toutes. Le panneau permet aussi de télécharger ou de supprimer chaque fichier, voir
[Sauvegardes](panneau.md#sauvegardes).

## Sauvegarde automatique { #automatique }

Dans l'onglet **Sauvegardes** du [panneau](panneau.md#sauvegardes), activez **Sauvegarde
automatique**, puis choisissez les **Jours** et l'**Heure** (heure de Home Assistant, 03:00 par
défaut).

Au moment prévu, la sauvegarde attend si :

* l'appareil est déconnecté ;
* un équipement est en mouvement ;
* une mise à jour du micrologiciel est en cours.

Elle réessaie alors **toutes les 2 minutes** et abandonne au bout d'**une heure**, avec un
avertissement dans le journal de Home Assistant. Il en va de même si l'appareil refuse la
sauvegarde.

## Restaurer { #restaurer }

La restauration ne se fait pas depuis Home Assistant : téléchargez le fichier, puis restaurez-le
dans l'interface de l'appareil, voir [Sauvegarde](../v3/appareil/systeme/index.md#backup).

## Mettre à jour le micrologiciel { #mises-a-jour }

L'entité de mise à jour **Micrologiciel ESP32** (catégorie configuration) compare la version
installée à la dernière publiée pour votre carte. Elle se comporte comme toute mise à jour de Home
Assistant : elle apparaît dans **Paramètres** › **Mises à jour** quand une version est disponible,
avec ses notes de version et une case pour faire une sauvegarde avant l'installation.

| Élément | Comportement |
| :--- | :--- |
| **Vérification** | le catalogue des versions est relu toutes les 6 heures, et quand l'appareil annonce son état |
| **Version proposée** | la plus récente construite pour votre carte et sa table de partitions |
| **Canal développeur** | activé dans les [options](installation.md#options) ou le [panneau](panneau.md#appareil), il propose aussi la dernière version de développement |
| **Notes de version** | précédées d'un rappel : ce micrologiciel est un projet distinct de l'intégration, avec ses propres numéros de version |
| **Sauvegarde avant installation** | si la case est cochée et que la sauvegarde échoue, la mise à jour est annulée |

!!! note "Micrologiciel et intégration"

    Mettre à jour le micrologiciel de l'appareil ne met pas à jour l'intégration, et inversement :
    l'intégration se met à jour par le Marketplace.

### Déroulement { #deroulement }

Avec un firmware récent, l'appareil ne télécharge plus rien lui-même : c'est Home Assistant qui
récupère l'image, la vérifie, puis l'envoie. La progression affichée suit ces étapes :

| Progression | Étape |
| :--- | :--- |
| 0 à 40 % | téléchargement de l'image par Home Assistant, puis contrôle de sa taille et de son empreinte |
| 40 à 45 % | redémarrage de l'appareil sur son [firmware de secours](../v3/appareil/systeme/firmware-de-secours.md), quand le firmware installé l'annonce |
| 45 à 90 % | envoi de l'image à l'appareil |
| 90 à 97 % | attente du redémarrage sur la nouvelle version |
| 97 à 100 % | mise à jour des langues installées sur l'appareil, puis du firmware de secours si la version en apporte un autre |

Un échec sur les langues ou sur le firmware de secours n'annule pas la mise à jour : l'ancien
firmware de secours reste en place et fonctionne toujours.

Avec un firmware plus ancien, c'est l'appareil qui télécharge lui-même la nouvelle version :
l'installation n'est alors proposée que s'il a lui-même accès à Internet.

### Messages d'erreur { #erreurs }

| Message | Cause |
| :--- | :--- |
| *Aucune image &lt;version&gt; pour l'appareil &lt;carte&gt; (table de partitions &lt;table&gt;)* | cette version n'est pas publiée pour votre carte |
| *Échec du téléchargement du micrologiciel : HTTP &lt;code&gt;* | le serveur de publication a refusé le téléchargement |
| *Téléchargement du micrologiciel incomplet : &lt;reçus&gt;/&lt;attendus&gt; octets* | téléchargement interrompu |
| *Le micrologiciel téléchargé ne correspond pas à son empreinte publiée* | fichier abîmé : rien n'est envoyé à l'appareil |
| *Appareil injoignable à l'adresse &lt;adresse&gt;* | l'appareil ne répond pas |
| *Envoi du micrologiciel vers &lt;adresse&gt; interrompu : &lt;erreur&gt;* | la connexion a été coupée pendant l'envoi |
| *L'appareil a refusé le micrologiciel (HTTP &lt;code&gt;) : &lt;détail&gt;* | l'appareil a rejeté l'image |
| *Le firmware de secours est absent de l'appareil &lt;adresse&gt; : réinstallez-le avec le bouton Réinstaller de sa tuile Espace des firmwares* | voir [Version et mise à jour](../v3/appareil/systeme/firmware-de-secours.md#mettre-a-jour) |
| *L'appareil &lt;adresse&gt; n'a pas répondu sur son firmware de secours ; il revient seul à son micrologiciel principal au bout de 10 minutes* | le firmware de secours n'a pas répondu à temps |
| *L'appareil n'a pas répondu dans les 3 minutes suivant la mise à jour ; vérifiez-le à l'adresse &lt;adresse&gt;* | l'appareil n'est pas revenu après l'installation |
| *L'appareil a redémarré sur &lt;version en place&gt; au lieu de &lt;version&gt; (retour à la version précédente ?)* | la nouvelle version n'a pas été validée et l'appareil est revenu à l'ancienne |
| *Échec de la sauvegarde de la configuration, mise à jour annulée* | sauvegarde avant installation impossible |
| *Aucune version du micrologiciel à installer* | aucune version disponible |
| *Échec de la mise à jour du micrologiciel : &lt;erreur&gt;* | autre erreur, détaillée dans le journal |

Après un envoi interrompu ou refusé passé par le firmware de secours, l'intégration renvoie
l'appareil sur son micrologiciel en place.
