# Home Assistant

La page **Home Assistant** de l'interface présente l'intégration **ESPSomfy-RTS Enhanced** et
dit comment l'installer. Elle ne règle rien sur l'appareil : tout se passe ensuite dans Home
Assistant. L'intégration a sa propre documentation, dans l'onglet
[Intégration Home Assistant](../../../home-assistant/index.md).

![Page Home Assistant de l'interface](v3/img/ha-page-appareil){ .on-glb }

## Le bandeau

Le bandeau, à gauche sur ordinateur et en haut de la page sur tablette et téléphone, rappelle que
l'appareil fonctionne parfaitement seul et que l'intégration est optionnelle. Son bouton
`Open in Marketplace on MY` ouvre directement l'intégration dans le Marketplace de votre Home
Assistant. Dessous, le prérequis : *Home Assistant 2026.11 ou plus récent. Sur une version plus
ancienne, passez par HACS.*

## Les tuiles

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **À quoi sert cette intégration ?** | ce qu'elle apporte (vos équipements en entités `cover`, une position suivie même avec une télécommande physique, le pilotage à la voix et partout) et trois exemples d'automatisations |
| **Comment l'installer depuis le Marketplace ?** | les trois étapes : ouvrir l'intégration dans le Marketplace, la télécharger puis redémarrer Home Assistant, et trouver l'appareil dans **Paramètres › Appareils et services**. Un lien mène au dépôt GitHub de l'intégration. |
| **Autre méthode : la découverte MQTT** | pour une installation qui passe déjà par un courtier MQTT. La ligne **Découverte MQTT** dit si la découverte est publiée et ouvre la page [MQTT](../mqtt/index.md). |

Quand vous êtes connecté au point d'accès de l'appareil, la tuile d'installation et le bouton du
Marketplace sont masqués : il faut d'abord relier l'appareil à votre réseau.

Pour aller plus loin : [Installation et connexion](../../../home-assistant/installation.md),
[Présentation de l'intégration](../../../home-assistant/index.md).
