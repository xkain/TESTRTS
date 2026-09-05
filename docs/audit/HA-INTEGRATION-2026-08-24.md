# Intégration Home Assistant — pourquoi une sécurité active la coupe entièrement

**24/08/2026.** Audit de lecture seule, déclenché par un symptôme de terrain : PIN saisi dans
l'intégration, réponse « **Appareil non trouvé** », champ PIN vidé.

**Rien n'a été modifié, et rien ne doit l'être dans l'immédiat.** L'intégration est en ligne,
largement déployée, et alignée sur ESPSomfy-RTS v2.5.6 : la corriger maintenant casserait les
installations existantes, qui parlent toutes à des firmwares v2.5.x. Ce document existe pour qu'on
sache quoi faire le jour où on s'en occupera.

Sources lues : `custom_components/espsomfy_rts_enhanced/{config_flow,controller}.py`
(intégration, `version: 2.5.6`) et `src/web/{WebSystem,Web}.cpp`, `src/Sockets.cpp` (firmware).

---

## Le symptôme, mesuré

Boîtier de test `192.168.1.13`, PIN actif, Home Assistant en `192.168.1.21` (intégration configurée
pendant le chantier MQTT, donc **quand la sécurité valait `None`**).

| Canal | Relevé |
|---|---|
| REST port 8081 — `/discovery`, `/shades`, `/rooms`, `/groups` | **401** sur les quatre |
| WebSocket 8080 | **3 650 tentatives, 3 652 rejets, 0 acceptation** sur une capture série |

Les 3 650 poignées de main visent `/` **nu**, sans aucun paramètre. Reconnexion toutes les ~3,7 s,
indéfiniment, sans le moindre message exploitable côté Home Assistant.

---

## Cause n°1 — une impasse d'amorçage, refermée sur elle-même

Le flux de configuration (`config_flow.py`, `async_step_user`) fait, **dans cet ordre** :

```python
api = ESPSomfyAPI(self.hass, 0, user_input)
await api.discover()                       # 1. AVANT toute authentification
await api.login({... "pin": user_input.get(CONF_PIN, "") ...})   # 2. seulement ensuite
```

`discover()` (`controller.py`) émet `GET {api_url}/discovery` avec `headers=self._headers`, or
`_headers` vaut `{"apikey": ""}` tant que `login()` n'a pas abouti — la clé n'y est écrite qu'à la
ligne `self._config["apiKey"] = self._headers["apikey"] = data["apiKey"]`, **dans `login()`**.

Depuis C-5, `/discovery` exige une authentification. Donc : `401` → `DiscoveryError` → le flux
s'arrête sur `errors[CONF_HOST] = "discovery_error"`, dont la traduction française est exactement
**« Appareil non trouvé »**. Le PIN saisi n'est jamais envoyé nulle part.

**Et le verrou se referme.** `login()` commence par `if self._canLogin:` — sans `else`, sans
exception. Or `_canLogin` n'est mis à `True` que dans `apply_data()`, appelée **uniquement par
`discover()` sur une réponse 200**. Même si l'exception était rattrapée, `login()` serait un
**no-op silencieux** : aucune requête, aucune erreur, le PIN resterait inutilisé.

L'intégration apprend qu'une authentification est nécessaire (`authType`, `permissions`) en lisant
`/discovery` — le seul endpoint qui pourrait le lui dire est passé derrière l'authentification qu'il
sert à annoncer. C'est un amorçage impossible, pas un défaut de saisie.

## Cause n°2 — la WebSocket n'est jamais authentifiée, par construction

Indépendante de la première, et **non réparable en reconfigurant l'intégration** :

```python
def set_host(self, host) -> None:
    self._sock_url = f"ws://{self._host}:8080"      # aucun ?apikey= n'y est jamais ajouté
def get_sock_url(self):
    return self._sock_url
```

Cette URL nue est passée telle quelle à `websocket.WebSocketApp(self.url, ...)`, **sans argument
`header=`**. L'intégration ne présente donc le jeton ni en requête, ni en en-tête, ni à la
connexion, ni à la reconnexion. C'est très exactement ce que montre la trace : `url: /`, 3 650 fois.

La question laissée ouverte par le rapport principal — « si l'intégration envoie le jeton en
en-tête plutôt qu'en URL, l'accepter aussi côté firmware est une dizaine de lignes » — est donc
**tranchée par la négative** : elle n'envoie rien du tout. Aucune modification du firmware seule ne
peut authentifier un client qui ne présente aucune preuve.

Comme l'intégration est déclarée `iot_class: local_push`, cette socket est son canal d'état : sans
elle, pas de position d'équipement, pas de retour de commande.

## Cause n°3 — la vraie : l'intégration n'est pas conçue pour un appareil authentifié

Les deux causes précédentes ne sont que les deux premières manifestations d'un fait plus large.
Inventaire de **toutes** les requêtes de `controller.py` vers l'appareil :

| Portent `headers=self._headers` | Ne portent **rien** |
|---|---|
| ligne 620, ligne 630 | `get_initial()` (883) — **le chemin de démarrage, rejoué à chaque redémarrage de HA** |
| `discover()` (710) | `load_shades()` (720), `load_groups()` (728) |
| | **`put_command()` (828) — par où passe TOUTE commande d'équipement** |
| | `login()` et les trois PUT voisins (837, 861, 871) |

**3 requêtes sur 11 portent la clé.** `get_initial()` est particulièrement décisif : c'est lui
qu'appelle `async_setup_entry()`, donc le chemin réellement emprunté à chaque démarrage — et il
n'envoie aucun en-tête, même quand un PIN valide est enregistré dans l'entrée de configuration.
Son `else` se contente d'un `_LOGGER.error()`, `self._configured` reste `False`, et
`async_setup_entry` lève `ConfigEntryNotReady`.

**Conséquence directe, et elle invalide une piste que ce document proposait initialement :
aucun changement côté firmware seul ne peut restaurer cette intégration.** Même un `/discovery`
entièrement public laisserait `put_command()` en 401 et la WebSocket rejetée : on obtiendrait une
intégration qui *paraît* configurée, crée ses entités, et ne remonte aucun état ni n'exécute aucune
commande — un échec plus difficile à diagnostiquer que le refus franc d'aujourd'hui.

---

## Contournement immédiat, vérifié sur matériel — le mode « config seule »

**Il n'y a rien à modifier, ni d'un côté ni de l'autre.** Le firmware possède déjà le réglage qui
convient : `Security.permissions = ConfigOnly` (valeur `1`). `socketHandshakeAuthorized()`
(`src/Sockets.cpp`) et `Web::checkAuth(request, false)` le traitent tous deux comme un laissez-passer :

```cpp
if((settings.Security.permissions & static_cast<uint8_t>(security_permissions::ConfigOnly)) == 0x01) return true;
```

Le PIN continue alors de protéger **la configuration** (`checkAuth(request, true)` : réglages
réseau, sécurité, radio, téléversements), tandis que l'état et le pilotage des équipements restent
ouverts sur le réseau local — exactement le compromis pour lequel ce mode a été prévu.

Relevé après bascule en `{"type":1,"permissions":1}`, sans toucher à l'intégration :

| Contrôle | Avant (`permissions:0`) | Après (`permissions:1`) |
|---|---|---|
| `/discovery`, `/shades`, `/groups`, `/rooms` (8081, sans clé) | 401 | **200** |
| `put_command` sans clé | 401 | **passe** (atteint le handler) |
| Poignée de main WebSocket sans clé | fermée | **acceptée, état complet reçu** |
| Home Assistant (`192.168.1.21`) | 8 rejets / 30 s, en boucle | **reconnecté seul ; 60 s sans une seule reconnexion** |

C'est la réponse à donner tant que l'intégration n'a pas évolué : **sécurité PIN + permissions
« config seule »**. Le mode « complet » est incompatible avec elle, et le restera quoi qu'on fasse
au firmware.

---

## Verdict sur la question posée : « est-ce bien l'intégration le problème ? »

**En partie seulement, et ce n'est pas la partie la plus importante.**

- L'intégration porte une **fragilité réelle** : amorcer sa configuration à travers un endpoint
  qu'elle suppose non authentifié, et un `if self._canLogin:` sans branche d'échec qui transforme
  une erreur en silence.
- Mais elle n'est, plus profondément, **pas conçue pour un appareil authentifié du tout** :
  8 de ses 11 requêtes n'envoient aucune clé, commandes d'équipements comprises (cause n°3). Le PIN
  n'a jamais été un mode de fonctionnement supporté ; `login()` existe et range la clé, mais
  presque rien ne s'en sert.
- Et c'est **notre changement C-5 qui a rompu le contrat** sur lequel elle s'appuyait. Avant lui,
  `/discovery` était public : le flux fonctionnait (découvrir → lire `authType` → se connecter avec
  le PIN → recevoir la clé). Un client tiers ne pouvait pas deviner que cet endpoint deviendrait
  authentifié.
- La cause n°2, elle, est **entièrement du côté de l'intégration**, et C-6 la révèle sans l'avoir
  créée : cette socket n'a jamais rien authentifié.

### Le constat qui compte pour la suite

**C-5 recommandait deux mesures. Une seule a été appliquée.** Texte du rapport :

> Ajouter `if(!webServer.isAuthenticated(request, false)) return;` en tête, **et retirer
> `remoteAddress`/`lastRollingCode` de la charge utile de découverte**.

La première est faite. La seconde ne l'est pas : `SomfyShade::toJSON(JsonFormatter&)`
(`src/somfy/SomfySerialize.cpp:272` et `:276`) émet toujours `remoteAddress` et `lastRollingCode`,
et le bloc `DISC_SHADES` de `handleDiscovery()` appelle ce `toJSON` sans masquage.

Nous avons donc pris l'instrument contondant **et** gardé les secrets dans la charge utile : le
contrat est rompu pour les clients tiers, et la donnée sensible est toujours là — simplement
derrière une porte. Si la seconde mesure avait été appliquée, la première aurait pu être évitée ou
réduite, et l'intégration fonctionnerait encore.

---

## Pistes, pour le jour où on s'en occupera

Aucune n'est à appliquer maintenant. Elles sont classées par ce qu'elles réparent.

**A. Scinder `/discovery` en deux moitiés — à décider sur ses propres mérites, PAS comme un
correctif Home Assistant.** Servir `serverId`, `hostname`, `model`, `version`, `authType`,
`permissions` sans authentification — le strict nécessaire pour qu'un client sache qu'il doit se
connecter — et le reste (`rooms`, `shades`, `groups`, `memory`) derrière la clé, sur le modèle déjà
retenu pour `/loginContext` (M-17).

*Correction apportée à ce document après vérification.* Il présentait initialement cette piste
comme restaurant « la moitié REST » de l'intégration : **c'est faux**, et la cause n°3 explique
pourquoi — `put_command()` et `get_initial()` n'envoient aucune clé, donc l'intégration resterait
non fonctionnelle. La piste garde sa valeur **de sécurité** (un client tiers peut découvrir qu'il
doit s'authentifier sans qu'on lui serve la configuration complète), mais elle ne doit pas être
vendue comme une réparation de Home Assistant.

*À noter avant de se donner du mal sur la moitié publique :* `/upnp.xml` est **déjà servi sans
authentification** (`WebSystem.cpp`) et publie `friendlyName` (hostname), `serialNumber` (serverId),
`modelName`, `modelNumber` et `firmwareVersion` — que SSDP diffuse en outre en multicast. Gater ces
champs-là dans `/discovery` ne protégerait rien qui ne soit déjà sur le réseau.

**B. Côté firmware — appliquer enfin la seconde moitié de C-5.**
Retirer `remoteAddress` et `lastRollingCode` de la charge utile de découverte (masquage sur le
chemin `discovery`, comme le fait déjà le drapeau `secrets` ailleurs). À faire dans tous les cas, A
ou pas : c'est le constat C-5 qui n'est qu'à moitié traité.

**C. Côté intégration — les deux corrections, le jour où sa refonte v3 sera à l'ordre du jour.**
1. Ordonner `login()` **avant** `discover()`, ou rattraper le `401` de `discover()` pour tenter une
   connexion puis réessayer. Et remplacer `if self._canLogin:` par une branche qui échoue
   bruyamment — un no-op silencieux sur un chemin d'authentification est le pire des comportements.
2. Ajouter `?apikey=<jeton>` à `get_sock_url()`, ou passer `header=["apikey: <jeton>"]` à
   `WebSocketApp`. Si c'est l'en-tête qui est retenu, il faudra l'accepter côté firmware dans
   `socketHandshakeAuthorized()` (`src/Sockets.cpp`), qui ne lit aujourd'hui que la requête.

**Contrainte de compatibilité, à ne pas perdre de vue.** L'intégration parle à des firmwares v2.5.x
déployés, où `/discovery` est public et la WebSocket ouverte. Toute correction côté intégration doit
rester compatible avec eux : envoyer une clé à un firmware qui n'en demande pas doit rester sans
effet — ce qui est le cas, un paramètre de requête inconnu étant ignoré, et un en-tête surnuméraire
aussi.

---

## À retenir sur la méthode

Pendant la campagne du 24/08, ces 3 650 rejets ont d'abord été attribués à « un onglet resté ouvert
sur un téléphone », et écartés. C'était Home Assistant. **Une IP non identifiée dans une trace ne
doit pas être expliquée par hypothèse** : la vérifier, ou demander. L'écart entre les deux lectures
n'était pas un détail — d'un côté un client anonyme correctement rejeté, de l'autre la réponse à un
point de validation que le rapport principal avait explicitement laissé en suspens.
