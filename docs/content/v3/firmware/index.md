# Firmware

Cet onglet (`Système → Firmware`) surveille la santé matérielle de l'appareil et regroupe la
mise à jour, le témoin LED et la sauvegarde / restauration, chacune documentée sur sa propre page.
Il est organisé en **blocs** :

![firmware 1](v3/img/firmware-systeme-1){ .on-glb }

## Matériel et mémoire

Ce bloc donne des informations sur votre appareil :

* **Puce** : le modèle exact d'ESP32 détecté (ESP32, ESP32-S3, ESP32-C3, ESP32-C6…).
* **Processeur** : mono ou double cœur, et sa fréquence de fonctionnement — généralement
    Dual-Core @ 240 MHz sur la plupart des cartes compatibles.
* **Profil Matériel** : d'où vient votre carte, au sens où le firmware la reconnaît :

    | Profil | Signifie |
    |---|---|
    | **Générique** | N'importe quelle carte ESP32 **qui n'est pas l'un de mes boîtiers**. Le firmware ne présume rien de son câblage : radio, LED et sorties GPIO se configurent entièrement à la main (voir [Configurer la Radio](../radio/index.md) et [Témoin LED de statut](led-de-statut.md)). C'est le profil de l'écrasante majorité des installations. |
    | **Édition Wi-Fi** | Un de mes [boîtiers officiels](../materiel/boitiers-officiels.md), variante Wi-Fi seul. Radio et LED sont câblées en dur et déjà reconnues — rien à configurer de ce côté. |
    | **Édition Ethernet & Wi-Fi** | Même chose, variante avec port Ethernet (et son repli Wi-Fi). |

!!! note "Note"

    Ce profil n'est **pas un réglage** : il se décide par le firmware
    installé (chaque boîtier a son propre binaire dédié, cf.
    [Mises à jour du Firmware](mises-a-jour.md)) — on ne « bascule » pas une carte
    générique en boîtier depuis l'interface. Si vous ne possédez pas l'un de mes boîtiers,
    n'essayez pas d'installer ces firmwares.

* **Dernier redémarrage** : la raison technique du démarrage en cours, utile en cas
    d'instabilité répétée :

    | Raison affichée | Signifie |
    |---|---|
    | Coupure d'alimentation | Démarrage normal après mise sous tension |
    | Bouton de réinitialisation | Le bouton physique RESET de la carte a été pressé |
    | Redémarrage demandé (interface ou mise à jour) | Un redémarrage volontaire, déclenché depuis l'interface ou après une mise à jour |
    | Erreur interne | Le firmware a rencontré une exception logicielle et a redémarré pour s'en protéger |
    | Redémarrage de sécurité (interruptions / tâche bloquée) | Le chien de garde (watchdog) a dû intervenir : une partie du code est restée bloquée trop longtemps |
    | Sortie de veille | Réveil après une mise en veille profonde |
    | Tension d'alimentation insuffisante | L'alimentation fournie était trop faible ou instable |

    Une coupure d'alimentation ou un redémarrage demandé sont normaux. Les autres raisons,
    surtout si elles reviennent souvent, méritent d'activer les **logs de debug** (voir
    Maintenance ci-dessous) pour en comprendre la cause.

* **Mémoire Vive (RAM)** : libre actuellement, avec le plancher (**Min**) et le plus grand
    bloc contigu (**Max**) observés depuis le démarrage — ce dernier compte plus que la RAM
    libre totale pour la stabilité : une mémoire fragmentée peut refuser une grosse allocation
    même avec beaucoup de libre au total.

* **Mémoire Flash** : espace total et vitesse d'horloge de la puce flash, puis l'espace
    libre sur le système de fichiers qui héberge l'interface web (la partition que
    [Mise à jour Application/Filesystem](mises-a-jour.md) remplace).

* **Uptime** : durée de fonctionnement de l'appareil depuis son dernier démarrage, et
    séparément celle de sa connexion réseau actuelle (remise à zéro si le Wi-Fi ou l'Ethernet
    se reconnecte sans que l'appareil lui-même redémarre — les deux durées peuvent donc
    diverger).

## Mise à jour

Un bandeau de statut indique l'état de votre version : il reste **vert** et dit que votre système
est à jour, ou passe au **rouge** et annonce qu'une mise à jour est disponible, avec son numéro de
version. Deux méthodes d'installation sont proposées : voir
[Mises à jour du Firmware](mises-a-jour.md) pour l'explication détaillée.

## Témoin LED de statut

Dans le bloc **Matériel**, ce réglage configure le voyant d'état de la carte (broche, polarité,
clignotement sur activité radio) : voir [Témoin LED de statut](led-de-statut.md).

## Maintenance

* **Sauvegarder** : génère un fichier `.backup` contenant l'intégralité de la configuration
    actuelle.
* **Restaurer le système** : réinstalle tout ou partie d'une configuration depuis un fichier
    `.backup` — voir [Restaurer le système](restaurer.md). Le détail technique du
    format de ce fichier est documenté sur sa propre page,
    [Anatomie du fichier de sauvegarde](anatomie-sauvegarde.md).
* **Vider le cache** : force le navigateur à recharger l'interface si des bugs d'affichage
    persistent après une mise à jour.
* **Logs de debug** : affiche des informations détaillées sur le port série et la console du
    navigateur (trames radio, requêtes réseau…). À activer uniquement en cas de dépannage —
    ralentit légèrement l'appareil.

## À propos & Aide

* **Documentation** : ouvre le guide de configuration du projet.
* **Signaler un problème** : ouvre un formulaire de rapport de bug pré-rempli sur GitHub. Une
    infobulle rappelle que les tickets sont réservés aux **vrais bugs du firmware** ; pour une
    question de configuration ou un besoin d'aide, elle propose les **Discussions** GitHub (voir
    aussi la page [Aide](../../aide/index.md)).

### Crédits du projet

Sous ces boutons, un encart rend hommage à celles et ceux qui ont fait ce projet, **dans cet
ordre** :

1. **rstrouse**, *auteur du projet d'origine* : Robert Strouse a créé ESPSomfy-RTS, sa radio
    et son protocole, et l'a publié dans le domaine public. Cette version repose sur les
    fondations de son travail : **un grand merci à lui**. Un clic ouvre son dépôt.
2. **xkain**, *auteur de cette version* : l'interface et la refonte du cœur du firmware.
3. **Les contributeurs du projet**, dont **y-streibel-uiris**, **glich34**, **dirstel**, **Peethiplatsch**, **jcrespoc** : merci
    pour votre contribution. Un clic sur un nom ouvre son profil GitHub.

Un dernier bouton ouvre le texte de la **licence** : cette version est fournie **sans aucune
garantie**, et peut être redistribuée et modifiée selon les conditions de l'AGPL-3.0. Le travail
de rstrouse reste, lui, dans le domaine public.

!!! important "Ces deux crédits sont intangibles"

    Les noms de **rstrouse** (en premier) et de **xkain** (en second) doivent **toujours**
    figurer dans les crédits de l'interface, **avec les mêmes intitulés, le même rang et dans le
    même ordre**. C'est une condition de la licence (clause additionnelle de la section 7(b)
    de l'AGPL-3.0) : toute personne qui redistribue ce projet, ou une œuvre qui en dérive, ne peut
    ni les retirer, ni les renommer, ni changer leur ordre, ni les rétrograder dans une catégorie
    inférieure. Elle peut en revanche **ajouter son propre nom**, comme auteur de ses propres
    modifications, dans une entrée supplémentaire.

Merci aussi à toutes les personnes qui testent, signalent un défaut ou améliorent cette
documentation.
