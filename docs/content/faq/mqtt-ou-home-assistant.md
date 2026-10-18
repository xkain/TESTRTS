# MQTT ou intégration Home Assistant&nbsp;?

ESPSomfy-RTS se relie à une domotique de plusieurs façons&nbsp;: commandes REST,
WebSockets, **MQTT** et l'**intégration Home Assistant dédiée**.

- **Vous utilisez Home Assistant**&nbsp;: l'intégration dédiée est la voie
  naturelle. Vos équipements y sont reconnus comme des entités `cover`
  standard, pilotables à la voix et utilisables dans vos automatisations, avec
  en plus des services propres au protocole RTS. Voir
  [Intégration Home Assistant](../v3/integrations/home-assistant/index.md) et son
  [installation](../commun/home-assistant.md#installation-via-le-marketplace-anciennement-hacs).
- **Vous utilisez un autre système**, ou vous avez déjà un courtier MQTT&nbsp;: la
  page [MQTT](../v3/integrations/mqtt.md) décrit la connexion bidirectionnelle
  (commande et retour d'état).

Vue d'ensemble&nbsp;: [Options d'intégration](../v3/integrations/index.md).
