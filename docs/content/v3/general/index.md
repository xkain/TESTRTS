# Général

Cet onglet (`Système → Général`) regroupe l'identité de l'appareil, ses services réseau et
ses préférences — en trois blocs. Plusieurs réglages plus détaillés (sécurité, langues,
retours tactiles & visuels, tableau de bord, géolocalisation) s'ouvrent depuis des boutons
dédiés, dans des fenêtres séparées documentées sur leur propre page.

## Intégration Home Assistant

Une tuile **Home Assistant** en haut de la page ouvre une fenêtre de présentation — elle ne
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

## Services Réseau

* **Nom d'hôte** : donnez un nom unique à votre appareil (ex: `espsomfy-salon`), jusqu'à
    **31 caractères**. Si vous possédez plusieurs boîtiers sur le même réseau, chaque nom doit
    être différent pour éviter les conflits DNS.
* **Serveur NTP** : synchronisation automatique de l'heure via Internet. Par défaut,
    l'appareil utilise `pool.ntp.org`, mais vous pouvez indiquer votre propre serveur local.
* **Diffusion uPnP (SSDP)** : si activée, l'appareil s'annonce sur le réseau local et
    apparaît automatiquement dans les périphériques réseau de systèmes comme l'Explorateur de
    fichiers Windows.

## Sécurité & Vérification

* **Sécurité de l'appareil** : ouvre la fenêtre de configuration de l'accès à l'interface,
    avec un badge indiquant l'état actuel — voir [Sécurité de l'appareil](securite.md).
* **Mises à jour** : active la vérification automatique de nouvelle version. ESPSomfy-RTS
    consulte alors périodiquement GitHub et affiche une alerte dans l'interface (et dans Home
    Assistant) si une mise à jour est disponible.

## Préférences

* **Gérer les langues** : ouvre le gestionnaire de packs de langue — voir
    [Gérer les langues](langues.md).
* **Fuseau horaire** : sélection dans une liste de zones nommées — détermine l'heure locale
    utilisée par vos [programmations](../somfy/equipements/plannification.md).
* **Position géographique** : ouvre la fenêtre de réglage des coordonnées GPS — voir
    [Position Géographique](position-geographique.md).
* **Retours tactiles & visuels** : ouvre les réglages de confirmation d'interaction — voir
    [Retours tactiles & visuels](retours-tactiles-et-visuels.md).
* **Mode d'affichage** : **Dépend du navigateur** (suit vos préférences système),
    **Mode sombre** ou **Mode clair** forcé.
* **Couleur d'accentuation** : personnalise la couleur des boutons et menus via un
    sélecteur de couleur natif.
* **Tableau de bord** : ouvre les préférences d'affichage du tableau de bord — voir
    [Tableau de bord](tableau-de-bord.md).

!!! important "Important"

    N'oubliez pas de cliquer sur **Enregistrer** en bas de page une fois vos réglages
    terminés — y compris pour la couleur d'accentuation, qui reviendrait sinon à sa valeur par
    défaut au prochain chargement. Un bouton **Redémarrer** est également disponible à côté.

