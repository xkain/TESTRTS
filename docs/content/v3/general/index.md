# Général

Cet onglet (`Système → Général`) regroupe l'identité de l'appareil, ses services réseau, ses
préférences de langue et d'apparence, la sécurité et les mises à jour. Il est organisé en
**blocs**, dans cet ordre :

![general 1](v3/img/general-1){ .on-glb }

| Bloc | Contenu |
|---|---|
| **Identité & services** | nom d'hôte, serveur NTP, diffusion uPnP (SSDP) |
| **Langue & région** | gérer les langues, fuseau horaire, position géographique |
| **Apparence** | mode d'affichage, couleur d'accentuation, retours tactiles & visuels, tableau de bord |
| **Sécurité & mises à jour** | sécurité de l'appareil, vérification des mises à jour, côte à côte |
| **Intégration** | la carte Home Assistant, en colonne latérale |

Plusieurs réglages plus détaillés (sécurité, langues, retours tactiles & visuels, tableau de bord,
géolocalisation) s'ouvrent depuis des boutons dédiés, dans des fenêtres séparées documentées sur
leur propre page. Les boutons affichent parfois un **état** sous leur titre : la langue active, un
badge de sécurité (`Désactivé`, `Code Pin` ou `Mot de Passe`), ou les coordonnées enregistrées
(`Non configurée` tant que la position n'est pas réglée).

La barre **Enregistrer** est **fixée en bas** de la page. Le bouton **Redémarrer** s'y ajoute sur
un écran étroit (téléphone) ; sur un grand écran, il se trouve en bas du menu latéral. Un bloc
modifié mais pas encore enregistré est signalé visuellement.

## Intégration Home Assistant

Dans la colonne latérale, une carte **Home Assistant** ouvre une fenêtre de présentation — elle ne
configure rien ici, mais explique l'intégration **ESPSomfy-RTS Enhanced** et comment
l'installer.

Votre appareil fonctionne de façon totalement autonome : cette intégration est optionnelle,
réservée à ceux qui possèdent déjà un serveur Home Assistant. Une fois installée, elle
remonte automatiquement tous vos équipements (volets, stores, portails…) sous forme
d'entités `cover` standard — position suivie en temps réel même pilotés par une télécommande
physique, contrôle à la voix, intégration dans vos propres automatisations.

Elle s'installe via le [Marketplace](https://www.hacs.xyz/docs/marketplace/) de Home Assistant
(anciennement HACS, prérequis) en cherchant « ESPSomfy-RTS Enhanced », ou directement depuis son
[dépôt GitHub](https://github.com/xkain/ESPSomfy-RTS-enhanced). Une fois téléchargée et Home
Assistant redémarré, votre appareil est découvert automatiquement dans **Paramètres →
Appareils et services**.

À partir de **1600 px** de large, cette colonne s'élargit d'un encart **« Bon à savoir »** : le
nouveau **nom d'hôte** s'applique tout de suite au réseau, mais la **nouvelle adresse `.local` ne
répond qu'après un redémarrage**.

!!! info "Sur le point d'accès"

    Quand vous êtes connecté au [point d'accès de secours](../../aide/point-d-acces.md), la carte
    Home Assistant, l'encart et la **position géographique** sont **masqués** : ils n'ont
    pas de sens tant que l'appareil n'a rejoint aucun réseau.

## Identité & services { #identite }

* **Nom d'hôte** : donnez un nom unique à votre appareil (ex: `espsomfy-salon`), jusqu'à
    **31 caractères**. L'appareil est ensuite joignable à l'adresse `nom-d-hôte.local`. Si vous
    possédez plusieurs boîtiers sur le même réseau, chaque nom doit être différent pour éviter
    les conflits DNS.
* **Serveur NTP** : synchronisation automatique de l'heure via Internet. Par défaut,
    l'appareil utilise `pool.ntp.org`, mais vous pouvez indiquer votre propre serveur local.
* **Diffusion uPnP (SSDP)** : si activée, l'appareil s'annonce sur le réseau local et
    apparaît automatiquement dans les périphériques réseau de systèmes comme l'Explorateur de
    fichiers Windows.

## Langue, région et apparence

### Langue & région

* **Langue** : ouvre le gestionnaire de packs de langue, et rappelle la langue active — voir
    [Gérer les langues](langues.md).
* **Fuseau horaire** : sélection dans une liste de zones nommées — détermine l'heure locale
    utilisée par vos [programmations](../somfy/equipements/plannification.md).
* **Position géographique** : ouvre la fenêtre de réglage des coordonnées GPS, utilisées pour
    calculer les heures de lever et de coucher du soleil des plannings. Le bouton affiche les
    coordonnées enregistrées, ou **Non configurée** — voir
    [Position Géographique](position-geographique.md).

### Apparence

* **Mode d'affichage** : **Dépend du navigateur** (suit vos préférences système),
    **Mode sombre** ou **Mode clair** forcé.
* **Couleur d'accentuation** : personnalise la couleur des boutons et menus via un
    sélecteur de couleur natif.
* **Retours tactiles & visuels** : ouvre les réglages de confirmation d'interaction — voir
    [Retours tactiles & visuels](retours-tactiles-et-visuels.md).
* **Tableau de bord** : ouvre les préférences d'affichage du tableau de bord (ordre des colonnes,
    en-tête mobile, indicateurs visuels) — voir [Tableau de bord](tableau-de-bord.md).

## Sécurité & mises à jour

* **Sécurité de l'appareil** : ouvre la fenêtre de configuration de l'accès à l'interface,
    avec un badge indiquant l'état actuel — voir [Sécurité de l'appareil](securite.md).
* **Mises à jour** : active la vérification automatique de nouvelle version. ESPSomfy-RTS
    consulte alors périodiquement GitHub et affiche une alerte dans l'interface (et dans Home
    Assistant) si une mise à jour est disponible.

!!! important "Important"

    N'oubliez pas de cliquer sur **Enregistrer** en bas de page une fois vos réglages
    terminés — y compris pour la couleur d'accentuation, qui reviendrait sinon à sa valeur par
    défaut au prochain chargement.
