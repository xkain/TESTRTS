# Firmware

Cet onglet (`Système → Firmware`) surveille la santé matérielle de l'appareil, et regroupe
mise à jour, témoin LED et sauvegarde/restauration — chacune documentée sur sa propre page.

## Informations Matériel

* **Puce** : le modèle exact d'ESP32 détecté (ESP32, ESP32-S3, ESP32-C3, ESP32-C6…).
* **Processeur** : mono ou double cœur, et sa fréquence de fonctionnement — généralement
    Dual-Core @ 240 MHz sur la plupart des cartes compatibles.
* **Profil Matériel** : d'où vient votre carte, au sens où le firmware la reconnaît :

    | Profil | Signifie |
    |---|---|
    | **Générique** | N'importe quelle carte ESP32 qui n'est pas un de mes boîtiers — dev board du commerce, module nu, carte avec Ethernet PoE… Le firmware ne présume rien de son câblage : radio, LED et sorties GPIO se configurent entièrement à la main (voir [Configurer la Radio](../radio/index.md) et [Témoin LED de statut](led-de-statut.md)). C'est le profil de l'écrasante majorité des installations. |
    | **BOX Édition Wi-Fi** | Un de mes [boîtiers officiels](../materiel/boitiers-officiels.md), variante Wi-Fi seul. Radio et LED sont câblées en dur et déjà reconnues — rien à configurer de ce côté. |
    | **BOX Édition Ethernet & Wi-Fi** | Même chose, variante avec port Ethernet (et son repli Wi-Fi). |

    Ce profil n'est **pas un réglage** : il est décidé une fois pour toutes par le firmware
    installé (chaque boîtier a son propre binaire dédié, cf.
    [Mises à jour du Firmware](mises-a-jour.md)) — on ne « bascule » pas une carte
    générique en boîtier depuis l'interface.
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

Un bandeau de statut (coloré si une mise à jour est disponible) et deux méthodes
d'installation — voir [Mises à jour du Firmware](mises-a-jour.md).

## Témoin LED de statut

Configure le voyant d'état matériel (broche, polarité, clignotement sur activité radio) —
voir [Témoin LED de statut](led-de-statut.md).

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

* **Documentation** : ouvre le wiki du projet.
* **Signaler un problème** : ouvre un formulaire de rapport de bug pré-rempli sur GitHub.

