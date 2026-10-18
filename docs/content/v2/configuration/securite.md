# Sécurité

Cette page couvre le sous-onglet **Sécurité** de l'onglet **Système**. Il protège l'accès à
l'interface pour éviter qu'on manipule vos équipements ou votre configuration sans votre accord.

---
<img width="100%" src="../img/securite-clair.webp#only-light" /><img width="100%" src="../img/securite-sombre.webp#only-dark" />

## 1. Type de sécurité

Une seule liste, trois choix. Tant que **Aucun** est sélectionné, le reste de la page reste
masqué.

| Choix | Ce qui est demandé |
| --- | --- |
| **Aucun** | Rien. L'interface est libre d'accès pour toute personne présente sur votre réseau local. C'est le réglage d'usine. |
| **Code Pin** | Quatre chiffres, saisis dans quatre cases séparées. |
| **Mot de Passe** | Un nom d'utilisateur et un mot de passe, 32 caractères au maximum chacun. Le mot de passe doit être saisi deux fois ; l'icône en forme d'œil permet de vérifier ce que vous tapez. |

!!! note "Note"

    Le code PIN fait exactement **4 chiffres**, ni plus ni moins — l'interface n'accepte qu'un
    caractère numérique par case. Ce n'est pas un secret solide ; il est là pour empêcher une
    manipulation involontaire, pas pour résister à une attaque.

## 2. Configuration sécurisée uniquement

Ce commutateur n'apparaît qu'une fois un type de sécurité choisi. Il décide de **l'étendue** de
la protection, et c'est le réglage le plus important de cette page.

| État | Ce qui reste libre | Ce qui demande l'authentification |
| --- | --- | --- |
| **Activé** | Voir la liste des équipements, des pièces et des groupes, et leur envoyer des commandes (monter, descendre, My, position, inclinaison). | Tous les réglages : système, réseau, MQTT, radio, GPIO, et la création, la modification ou la suppression d'un équipement, d'une pièce ou d'un groupe. |
| **Désactivé** | Rien, hormis la page de connexion elle-même. | Tout, y compris la simple lecture de l'état de vos équipements. |

!!! important "Important"

    **Si vous utilisez Home Assistant, saisissez le code PIN ou le mot de passe dans
    l'intégration.** Elle les demande à l'installation, et vous redemande de vous identifier
    d'elle-même si la clé cesse d'être valable. Sans eux, elle reçoit une erreur `401` sur chacune
    de ses requêtes et sa connexion temps réel est refusée en boucle : l'appareil continue de
    fonctionner, mais il disparaît de Home Assistant — voir [Home Assistant](../../commun/home-assistant.md).

    Cette authentification demande l'intégration **v2.6.0 ou plus récente**. Les versions
    antérieures ne savaient pas présenter de clé et étaient coupées net dès qu'une sécurité était
    posée. Laisser **Configuration sécurisée uniquement** activé évite la question : l'intégration
    n'a besoin que des accès que ce mode laisse ouverts.


## 3. Enregistrer

Le bouton `Enregistrer` en bas de page applique la protection. Une fenêtre de confirmation
s'affiche ensuite.

!!! important "Important"

    Notez votre code ou votre mot de passe avant de quitter la page. Si vous le perdez, le recours
    est la **réinitialisation réseau et sécurité** : trois cycles d'alimentation, qui désactivent
    la sécurité et effacent le Wi-Fi, mais **conservent vos équipements, vos groupes, vos pièces,
    la radio et MQTT**. L'appareil redémarre alors sur son propre réseau `ESPSomfyRTS` et il faut
    le reconnecter. Ce n'est qu'au **sixième** cycle que tout est effacé — voir [Factory Reset](../maintenance/factory-reset.md).

## 4. Ce qui se passe quand vous vous connectez

Une fois la protection active, l'interface demande le code ou le mot de passe à l'ouverture.

* **Tant que vous restez dans le même onglet, on ne vous le redemande pas.** La session survit
    aux rechargements de la page. Elle disparaît en revanche à la **fermeture de l'onglet** ;
    rouvrir l'interface demande alors à nouveau l'authentification.
* **Après trois tentatives infructueuses, il faut attendre.** La quatrième erreur verrouille
    l'adresse qui a essayé pendant 15 secondes, et chaque nouvel échec double ce délai —
    30 secondes, 1 minute, 2 minutes… jusqu'à un plafond de 15 minutes. Le compteur d'échecs
    s'efface de lui-même après 15 minutes sans aucune tentative ; un verrou déjà lancé, lui, court
    jusqu'à son terme.
* **L'écran vous dit où vous en êtes.** Chaque échec affiche le rang de l'essai sous le
    formulaire — `Essai 2/3`. Au verrouillage, le bouton **Connexion** se désactive et le message
    devient *Trop de tentatives. Réessayer dans 15s*, décompté chaque seconde, puis le bouton se
    réactive de lui-même à la fin du décompte.

!!! note "Note"

    Ce retour à l'écran arrive avec la **v2.6.1**. En v2.6.0, un échec ne disait rien du nombre
    d'essais restants et le verrou se découvrait en butant dessus.

!!! note "Note"

    Le verrou ne vise que **l'adresse qui se trompe**. Un autre appareil de la maison, ou Home
    Assistant, continue d'accéder normalement pendant ce temps.

## Ce que la sécurité ne couvre pas

* **Le trafic n'est pas chiffré.** L'interface est servie en HTTP simple et la liaison MQTT est
    en clair sur le réseau local. Un code PIN/mot de passe contrôle qui peut agir, il ne rend pas les échanges
    confidentiels.
* **La clé d'authentification dépend de l'adresse IP** du client. Un appareil dont l'adresse
    change (bail DHCP renouvelé) doit se reconnecter. C'est une raison de plus de poser une
    réservation DHCP — voir [DHCP-et-IP-Statique](dhcp-ip-statique.md).
* **Les mots de passe Wi-Fi et MQTT ne sont jamais écrits dans une sauvegarde.** Après une
    restauration, il faut les ressaisir — voir [Anatomie Fichier de Sauvegarde](../maintenance/anatomie-sauvegarde.md).

---

## Étape suivante

* [Firmware](firmware.md) — état de l'appareil, mises à jour, sauvegarde et restauration.
* [Options](options.md) — nom d'hôte, heure, langue et apparence.

