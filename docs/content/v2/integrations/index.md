<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/Intégrations.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Intégrations

# Options de connectivité disponibles

Le but premier d'ESPSomfy-RTS n'est pas seulement de proposer une interface utilisateur, mais de servir de plateforme d'intégration pour vos volets vers d'autres systèmes.

* **Commandes REST** : utilisation des commandes HTTP (GET, POST, PUT) — **décrit sur cette page**.
* **Websockets** : notifications en temps réel lors des mouvements.
* **[MQTT](mqtt.md)** : connexion bidirectionnelle pour le contrôle et le retour d'état.
* **[Home Assistant](home-assistant.md)** : intégration native « clés en main » (raison d'être
    principale du projet).

Les deux derniers ont leur propre page. Le reste de celle-ci documente l'**interface REST**.


## Interface REST (API)

L'interface REST permet le contrôle à distance via votre réseau Wi-Fi. Elle utilise deux ports distincts selon vos besoins :

* **Port 80** : Utilisé pour la configuration et l'état du système (peut être sécurisé par `apikey`).
* **Port 8081** : Dédié exclusivement aux commandes de mouvement (ex: `shadeCommand`).



## Tester vos volets immédiatement (Méthode GET)

Vous pouvez tester vos volets en tapant simplement une adresse dans votre navigateur web (Chrome, Firefox, Safari).

### Exemple avec votre configuration actuelle :

* **Exemple Adresse IP** : `192.168.1.13`
* **Port** : `8081`
* **ID du volet** : `1`

| Action souhaitée | URL à copier dans votre navigateur |
| :--- | :--- |
| **Monter** | `http://192.168.1.13:8081/shadeCommand?shadeId=1&command=up` |
| **Descendre** | `http://192.168.1.13:8081/shadeCommand?shadeId=1&command=down` |
| **Arrêter (Stop)** | `http://192.168.1.13:8081/shadeCommand?shadeId=1&command=stop` |

!!! important "Important"

    **Sécurité** : Si vous activez la sécurité dans les réglages, vous devrez fournir un `apikey` dans l'en-tête (header) HTTP. Dans ce cas, l'utilisation d'un outil comme **Postman** est indispensable pour tester vos requêtes.

---

## GET /controller

Cette commande retourne la configuration publique du contrôleur (limites et versions logicielles, réglages radio et état actuel).


| Paramètre | Retour | Méthode | Port | URL d'exemple |
| :--- | :--- | :--- | :--- | :--- |
| Aucun | JSON |**GET** | `80` | `http://192.168.1.13:80/controller` |

### Paramètres :
Aucun

### Retour :
JSON

Voir le point de terminaison `GET /shades` pour la description des objets de référence des volets.

Voir le point de terminaison `GET /groups` pour la description des objets de référence des groupes.

<details>
<summary>Exemple de retour</summary>

```json
{
  "maxRooms": 16,
  "maxShades": 32,
  "maxGroups": 16,
  "maxGroupedShades": 32,
  "maxLinkedRemotes": 7,
  "startingAddress": 656296,
  
  
  "transceiver": {
    "config": {
      "type": 56,
      "TXPin": 13,
      "RXPin": 12,
      "SCKPin": 18,
      "MOSIPin": 23,
      "MISOPin": 19,
      "CSNPin": 5,
      "rxBandwidth": 99.97000122,
      "frequency": 433.4200134,
      "deviation": 47.59999847,
      "txPower": 10,
      "proto": 0,
      "enabled": true,
      "radioInit": true,
      "radioBoardType": 0
    }
  },
  "version": {
    "available": false,
    "status": 0,
    "error": 0,
    "cancelled": false,
    "checkForUpdate": true,
    "inetAvailable": true,
    "fwVersion": {
      "name": "v2.5.0",
      "major": 2,
      "minor": 5,
      "build": 1,
      "suffix": ""
    },
    "appVersion": {
      "name": "2.5.0",
      "major": 2,
      "minor": 5,
      "build": 0,
      "suffix": ""
    },
    "latest": {
      "name": "v2.5.0",
      "major": 2,
      "minor": 5,
      "build": 0,
      "suffix": ""
    }
  },
  "shades": [],
  "groups": []
}
```
</details>


## GET /discovery

Retourne un objet de découverte contenant l'identifiant unique et la version du firmware de l'appareil ESPSomfy-RTS. Ce point de terminaison est similaire à `/controller` mais ne contient pas les informations de configuration. Utilisez-le pour obtenir une sortie plus légère. Les références aux volets et aux groupes omettent les données de configuration et la configuration du transceiver n'est pas incluse.


| Paramètre | Retour | Méthode | Port | URL d'exemple |
| :--- | :--- | :--- | :--- | :--- |
| Aucun | JSON |**GET** | `8081` | `http://192.168.1.13:8081/discovery` |


* `authType` - Le type d'authentification requis pour une clé API valide
    * `0` = Aucune authentification
    * `1` = Saisie de code PIN
    * `2` = Nom d'utilisateur / Mot de passe
* `permissions` - Le masque de bits des permissions accordées lors de la connexion
    * `0x00` - Toutes les permissions, y compris la configuration
    * `0x01` - Seules les fonctions de configuration nécessitent une authentification

   

### Parameters
Aucun

### Retour 
JSON

* `authType` - Le type d'authentification requis pour une clé API valide
    * `0` = Aucune authentification
    * `1` = Saisie de code PIN
    * `2` = Nom d'utilisateur / Mot de passe
* `permissions` - Le masque de bits des permissions accordées lors de la connexion
    * `0x00` - Toutes les permissions, y compris la configuration
    * `0x01` - Seules les fonctions de configuration nécessitent une authentification

Voir le point de terminaison `GET /shades` pour la description des objets de référence des volets.

Voir le point de terminaison `GET /groups` pour la description des objets de référence des groupes.

<details>
<summary>Return Example</summary>

```json
{
  "serverId": "49E4AC",
  "version": "v2.5.0",
  "latest": "v2.5.0",
  "model": "ESPSomfyRTS",
  "hostname": "ESPSomfyRTS",
  "authType": 0,
  "permissions": 0,
  "chipModel": "",
  "connType": "Wifi",
  "checkForUpdate": true,
  "memory": {
    "max": 110580,
    "free": 164008,
    "min": 110924,
    "total": 266040
  },
  "shades": [],
  "groups": []
}
```
</details>

## GET|PUT|POST /groupCommand
Envoie une commande pour un groupe.
Cette commande permet de piloter simultanément tous les volets enregistrés dans un groupe spécifique. C'est l'outil idéal pour des actions globales comme "Fermer tout les volets".


| Paramètre | Retour | Méthode | Port | URL d'exemple (Groupe 1) |
| :--- | :--- | :--- | :--- | :--- |
| `groupId`, `command` | JSON | **GET** | `8081` | `http://192.168.1.13:8081/groupCommand?groupId=1&command=down` |

### Paramètres

* `groupId` - L'identifiant du groupe auquel envoyer la commande [1-14].
* `command` - La commande à envoyer au groupe.
    * `m | My | my` - My (Position favorite)
    * `u | Up | up` - Monter (Up)
    * `d | Down | down` - Descendre (Down)
* `repeat` - Le nombre de répétitions à envoyer pour le groupe. ESPSomfy RTS envoie 1 trame plus 1 répétition pour un total de 2 trames.

`GET /groupCommand?groupId=1&command=up` - Déplace tous les volets du groupe vers la position d'ouverture complète.
`GET /groupCommand?groupId=1&command=my` - Déplace tous les volets du groupe actuellement immobiles vers leur position favorite.

### Retour
Référence JSON du groupe.

## GET /groups
Récupère un tableau des groupes configurés sur l'appareil.


| Paramètre | Retour | Méthode | Port | URL d'exemple (Groupe 1) |
| :--- | :--- | :--- | :--- | :--- |
| Aucun | JSON | **GET** | `8081` | `http://192.168.1.13:8081/groupCommand?groupId=1&command=down` |

### Paramètres
Aucun

### Retour
JSON

* `proto` - Le protocole assigné au groupe pour la transmission.
    * `0` = RTS
    * `1` = RTW
    * `2` = RTV
* `linkedShades` - Un tableau de références de volets/moteurs qui sont membres du groupe.

Voir le point de terminaison `GET /shades` pour la description des objets `linkedShade`.

<details>
<summary>Exemple de retour</summary>

```json
[
  {
    "groupId": 1,
    "roomId": 0,
    "name": "My Group",
    "remoteAddress": 515023,
    "lastRollingCode": 120,
    "bitLength": 56,
    "proto": 0,
    "sunSensor": false,
    "flipCommands": false,
    "flags": 0,
    "repeats": 0,
    "sortOrder": 1,
    "linkedShades": [
      {
        "shadeId": 1,
        "roomId": 0,
        "name": "My Awning",
        "remoteAddress": 515021,
        "paired": false,
        "shadeType": 4,
        "flipCommands": false,
        "flipPosition": false,
        "bitLength": 56,
        "proto": 0,
        "flags": 0,
        "sunSensor": false,
        "hasLight": false,
        "repeats": 0
      },
      {
        "shadeId": 2,
        "roomId": 0,
        "name": "My Blind",
        "remoteAddress": 515022,
        "paired": false,
        "shadeType": 1,
        "flipCommands": false,
        "flipPosition": false,
        "bitLength": 56,
        "proto": 0,
        "flags": 0,
        "sunSensor": false,
        "hasLight": false,
        "repeats": 0
      },
      {
        "shadeId": 3,
        "roomId": 0,
        "name": "My Shutter",
        "remoteAddress": 515024,
        "paired": false,
        "shadeType": 0,
        "flipCommands": false,
        "flipPosition": false,
        "bitLength": 56,
        "proto": 0,
        "flags": 0,
        "sunSensor": false,
        "hasLight": false,
        "repeats": 0
      }
    ]
  }
]
```
</details>

## GET|PUT|POST /login
Récupère une clé API pour les futurs appels sécurisés. Depuis la version 2.0.0, seuls les paramètres de configuration vérifient la clé API.

| Paramètre | Retour | Méthode | Port | URL d'exemple |
| :--- | :--- | :--- | :--- | :--- |
| `pin`, `user`, `password` | JSON | **GET** | `80` | `http://192.168.1.13/login?pin=1234` |


### Paramètres
Tous les paramètres sont transmis en JSON ou en tant que paramètres sur l'URL encodée. Lorsque le `authType` est "Pin Entry", le code PIN doit être fourni. Lorsque le `authType` est "Password", le nom d'utilisateur et le mot de passe doivent être fournis.


* `pin` - Le code PIN défini dans la configuration de sécurité
* `username` - Le nom d'utilisateur défini dans la configuration de sécurité
* `password` - Le mot de passe défini dans la configuration de sécurité 

Vous pouvez transmettre les trois, mais ESPSomfy-RTS ne s'authentifiera qu'en utilisant les paramètres applicables.
`GET /login?pin=1234&username=myUsername&password=myPassword`

<details>
<summary>Exemple de Payload JSON</summary>

```json
{
   "pin": 1234
   "username": "myUser"
   "password": "myPassword"
}

```
</details>

### Retour
JSON

* `type` - Le type d'authentification utilisé pour authentifier l'utilisateur
* `success` - true si la connexion a réussi
* `msg` - Un message affiché pour la connexion
* `apiKey` - Le hachage SHA-256 de la clé API générée pour la connexion

<details>
<summary>Exemple de retour</summary>

```json
{
  "type": 1,
  "success": true,
  "msg": "Login successful",
  "apiKey": "9b92ba08950cd40451eeb41d8e137e3c35bc6dc6ed0b695f7a4724cfc0ba702f"
}
```

</details>


## GET|PUT|POST /shadeCommand
Envoie une commande au volet identifié.

| Paramètre | Retour | Méthode | Port | URL d'exemple |
| :--- | :--- | :--- | :--- | :--- |
| `shadeId`, `command`, `target`, `repeat`, `stepSize` | JSON | **GET** | `8081` | `http://192.168.1.13:8081/shadeCommand?shadeId=1&command=up` |



### Paramètres
Les paramètres peuvent être fournis dans l'URL ou sous forme d'objet JSON dans le corps de la requête (body).

* `shadeId` - Identifiant numérique obligatoire du volet [1-32].
* `target` - Pourcentage cible optionnel [0-100] vers lequel le volet doit se déplacer si la commande n'est pas fournie.
* `command` - Valeur de commande optionnelle requise si `target` n'est pas envoyé. Vous pouvez utiliser l'une des formes séparées par '|' ci-dessous :
    * `m | My | my` - My (Position favorite)
    * `u | Up | up` - Monter (Up)
    * `d | Down | down` - Descendre (Down)
    * `mu | MyUp | myup` - My + Monter
    * `md | MyDown | mydown` - My + Descendre
    * `ud | UpDown | updown` - Monter + Descendre
    * `mud | MyUpDown | myupdown` - My + Monter + Descendre
    * `p | Prog | prog` - Programmation (Prog)
    * `s | SunFlag | sunflag` - SunFlag (Active le capteur de soleil)
    * `f | Flag | flag` - Flag (Désactive le capteur de soleil)
    * `su | StepUp | stepup` - StepUp (80-bit uniquement, simule la molette)
    * `sd | StepDown | stepdown` - StepDown (80-bit uniquement, simule la molette)
    * `fav | Favorite | favorite` - Favorite (80-bit uniquement, sur les moteurs compatibles)
    * `stop | Stop` - Stop (80-bit uniquement, sur les moteurs compatibles)
* `repeat` - Nombre optionnel de répétitions à envoyer. Par défaut, ESPSomfy RTS envoie 1 répétition (soit 2 commandes au total).
* `stepSize` - Nombre optionnel entre 1 et 127 pour indiquer la taille de la commande d'étape (80-bit uniquement, sur les moteurs compatibles).

`GET /shadeCommand?shadeId=1&command=up` - Déplace le volet vers la position d'ouverture complète.
`GET /shadeCommand?shadeId=1&target=50` - Déplace le volet à 50% de fermeture.
`GET /shadeCommand?shadeId=1&command=prog&repeat=40` - Ouvre la mémoire du volet pour qu'il puisse mémoriser une télécommande.

Si vous incluez la structure de commande dans le corps de la requête :

<details>
<summary>Exemples de Payload JSON pour la requête</summary>

```json
{
  "shadeId":1,
  "command":"up",
  "repeat": 2
}
```
or...
```json
{
  "shadeId":1,
  "target":"35"
}
```

</details>

### Retour
JSON

Objet du volet cible


## GET /shades
Retourne une référence de tous les volets configurés.

| Paramètre | Retour | Méthode | Port | URL d'exemple |
| :--- | :--- | :--- | :--- | :--- |
| Aucun | JSON (Array) | **GET** | `8081` | `http://192.168.1.13:8081/shades` |


### Parameters
Aucun

### Retour
JSON

Un tableau d'objets de référence des volets :

* `shadeType` - Le type de volet référencé

    * `0` - Store enrouleur
    * `1` - Store vénitien
    * `2` - Rideau (gauche)
    * `3` - Store banne
    * `4` - Volet
    * `5` - Garage (1 bouton)
    * `6` - Garage (3 boutons)
    * `7` - Rideau (droit)
    * `8` - Rideau (central)
    * `9` - Contact sec
    * `10` - Contact sec (2 bouton)
    * `11` - Portail (gauche)
    * `12` - Portail (centre)
    * `13` - Portail (droit)
    * `14` - Portail 1 bouton (gauche)
    * `15` - Portail 1 bouton (centre)
    * `16` - Portail 1 bouton (droit) 
* `tiltType` - Le type de mécanisme d'inclinaison associé au moteur
    * `0` - Aucun
    * `1` - Moteur d'inclinaison séparé
    * `2` - Mécanisme d'inclinaison intégré
    * `3` - Inclinaison uniquement
* `myPos` - La position en pourcentage pour le favori (-1 si non défini)
* `myTiltPos` - La position d'inclinaison en pourcentage pour le favori (-1 si non défini)
* `position` - La position de levage actuelle du volet
* `tiltPosition` - La position d'inclinaison actuelle des lames
* `direction` - La direction dans laquelle le volet se déplace
    * `-1` - Le volet monte
    * `0` - Le volet est à l'arrêt
    * `1` - Le volet descend
* `tiltDirection` - La direction dans laquelle les lames se déplacent
    * `-1` - Les lames s'ouvrent
    * `0` - Les lames sont à l'arrêt
    * `1` - Les lames se ferment
* `flags` - Masque de bits pour les drapeaux des capteurs
    * `0x01` - Le capteur de soleil est activé
    * `0x04` - Le capteur est en mode démo
    * `0x10` - Il y a du vent
    * `0x20` - Il y a du soleil
* `inGroup` - Indique si le volet est membre d'un groupe (true si c'est le cas)
* `proto` - Le protocole assigné au moteur
    * `0` - RTS
    * `1` - RTW
    * `2` - RTV
* `target` - La position de levage cible pour le volet [0-100]. Si le volet est en mouvement, cela indique l'endroit où il doit s'arrêter. S'il est arrêté, cette valeur est égale à `position`.
* `tiltTarget` - La position d'inclinaison cible pour les lames [0-100]. C'est la position finale des lames une fois le mouvement terminé.
* `linkedRemotes` - Un tableau des télécommandes liées associées au volet.

<details>
<summary>Exemple de retour</summary>

```json
[
  {
    "shadeId": 1,
    "name": "My Awning",
    "remoteAddress": 515021,
    "upTime": 10000,
    "downTime": 10000,
    "paired": true,
    "lastRollingCode": 25,
    "position": 0,
    "tiltPosition": 0,
    "tiltDirection": 0,
    "tiltTime": 7000,
    "stepSize": 100,
    "tiltTarget": 0,
    "target": 0,
    "myPos": 38,
    "myTiltPos": -1,
    "direction": 0,
    "tiltType": 0,
    "shadeType": 3,
    "bitLength": 56,
    "proto": 0,
    "flags": 0,
    "flipCommands": false,
    "flipPosition": false,
    "inGroup": true,
    "linkedRemotes": [
      {
        "remoteAddress": 4886592,
        "lastRollingCode": 1054
      }
    ]
  },
  {
    "shadeId": 2,
    "name": "My Blind",
    "remoteAddress": 515022,
    "upTime": 10000,
    "downTime": 10000,
    "paired": true,
    "lastRollingCode": 44,
    "position": 0,
    "tiltPosition": 0,
    "tiltDirection": 0,
    "tiltTime": 7000,
    "stepSize": 100,
    "tiltTarget": 0,
    "target": 0,
    "myPos": 63,
    "myTiltPos": 84,
    "direction": 0,
    "tiltType": 2,
    "shadeType": 1,
    "bitLength": 56,
    "proto": 0,
    "flags": 0,
    "flipCommands": false,
    "flipPosition": false,
    "inGroup": true,
    "linkedRemotes": [
      {
        "remoteAddress": 4886593,
        "lastRollingCode": 1357
      }
    ]
  },
  {
    "shadeId": 3,
    "name": "My Shutter",
    "remoteAddress": 515024,
    "upTime": 10000,
    "downTime": 10000,
    "paired": true,
    "lastRollingCode": 13,
    "position": 0,
    "tiltPosition": 0,
    "tiltDirection": 0,
    "tiltTime": 7000,
    "stepSize": 100,
    "tiltTarget": 0,
    "target": 0,
    "myPos": -1,
    "myTiltPos": -1,
    "direction": 0,
    "tiltType": 0,
    "shadeType": 4,
    "bitLength": 56,
    "proto": 0,
    "flags": 0,
    "flipCommands": false,
    "flipPosition": false,
    "inGroup": true,
    "linkedRemotes": [
      {
        "remoteAddress": 4886594,
        "lastRollingCode": 1315
      }
    ]
  },
  {
    "shadeId": 4,
    "name": "My Shade",
    "remoteAddress": 515025,
    "upTime": 10000,
    "downTime": 10000,
    "paired": true,
    "lastRollingCode": 4,
    "position": 32,
    "tiltPosition": 0,
    "tiltDirection": 0,
    "tiltTime": 7000,
    "stepSize": 100,
    "tiltTarget": 0,
    "target": 32,
    "myPos": -1,
    "myTiltPos": -1,
    "direction": 0,
    "tiltType": 0,
    "shadeType": 0,
    "bitLength": 56,
    "proto": 0,
    "flags": 0,
    "flipCommands": false,
    "flipPosition": false,
    "inGroup": false,
    "linkedRemotes": [
      {
        "remoteAddress": 4886595,
        "lastRollingCode": 14415
      }
    ]
  }
]
```

</details>


## GET|PUT|POST /tiltCommand
Incline les lames pour un store vénitien.

| Paramètre | Retour | Méthode | Port | URL d'exemple |
| :--- | :--- | :--- | :--- | :--- |
| `shadeId`, `command`, `target`, `repeat` | JSON | **GET** | `8081` | `http://192.168.1.13:8081/tiltCommand?shadeId=1&command=up` |


### Paramètres

* `shadeId` - L'identifiant du volet auquel envoyer la commande [1-30].
* `command` - Commande d'inclinaison optionnelle. Vous devez fournir soit la cible (`target`), soit la commande.
    * `m | My | my` - My (Position favorite)
    * `u | Up | up` - Monter (Ouvrir l'inclinaison)
    * `d | Down | down` - Descendre (Fermer l'inclinaison)
    * `su | StepUp | stepup` - StepUp (80-bit uniquement, simule la molette)
    * `sd | StepDown | stepdown` - StepDown (80-bit uniquement, simule la molette)
* `target` - Cible optionnelle pour la position des lames [0-100].
* `repeat` - Le nombre de répétitions à envoyer. ESPSomfy RTS envoie 1 trame plus 1 répétition pour un total de 2 trames.

`GET /tiltCommand?shadeId=1&command=up` - Incline les lames en position ouverte.
`GET /tiltCommand?shadeId=1&command=my` - Déplace les lames vers la position favorite si elles sont immobiles, ou arrête le mouvement si elles bougent.
`GET /tiltCommand?shadeId=1&target=35` - Déplace l'inclinaison des lames à 35%.

### Retour
Référence JSON du groupe

## GET|PUT|POST /setPostions
Définit la position enregistrée du moteur sans déplacer celui-ci. Ceci est pratique dans les situations où d'autres capteurs sont utilisés pour identifier la position finale du moteur. Par exemple, si vous avez un capteur d'inclinaison sur une porte de garage ou un capteur magnétique sur un portail, vous pouvez utiliser cette commande pour indiquer à ESPSomfy RTS que la position est fermée ou ouverte en fonction de l'état du capteur.

### Parameters

* `shadeId` - L'identifiant du volet pour lequel définir la position [1-30].
* `position` - Position de levage optionnelle de 0 à 100%.
* `tiltPosition` - Position d'inclinaison optionnelle de 0 à 100%.

`GET /setPositions?shadeId=1&position=50` - Définit la position de levage à 50%.
`GET /setPositions?shadeId=1&liftPosition=50` - Définit la position de levage à 50%.

Vous pouvez également envoyer ces informations sous forme de payload JSON.

<details>
Exemple de payload JSON (vous pouvez omettre soit la valeur position, soit tiltPosition)
```json
{
   "shadeId": 1,
   "position": 50,
   "tiltPosition": 100
}
```
</details>

### Retour
Référence JSON du volet.

## GET|PUT|POST /setSensor
Envoie une trame de capteur au moteur. Celles-ci peuvent être envoyées pour un volet ou un groupe afin de simuler un capteur Eolis (vent) ou Sunis (soleil). Vous pouvez créer vos propres capteurs de vent ou de soleil et faire en sorte que le moteur réagisse à ceux-ci. Voir la documentation du capteur Sun/Wind Sunis.

Pour la plupart des moteurs, si vous indiquez qu'il y a du vent, le volet se rétractera pendant au moins 2 minutes après l'envoi du premier signal de calme. Si vous indiquez au moteur qu'il fait soleil, il déploiera le volet 2 minutes après avoir reçu ce signal et le rétractera 20 minutes après la fin de la condition d'ensoleillement. Cela fonctionne en conjonction avec le réglage "Sun Flag" (drapeau soleil) sur le moteur ; il ne se déploiera ou se rétractera que si ce mode est activé.

Cela fonctionne aussi bien pour les groupes que pour les volets, selon que vous envoyez l'identifiant du groupe ou celui du volet.

| Paramètres disponibles | Retour | Méthode | Port | URL d'exemple |
| :--- | :--- | :--- | :--- | :--- |
| `shadeId` **OU** `groupId`, `sunny`, `windy` | JSON | **GET** | `8081` | `http://192.168.1.13:8081/setSensor?shadeId=1&windy=1` |

### Paramètres

* `shadeId` - L'identifiant du volet auquel appliquer les attributs soleil ou vent [1-30].
* `groupId` - L'identifiant du groupe auquel appliquer les attributs soleil ou vent [1-14].
* `sunny` - 1 pour ensoleillé, 0 pour non ensoleillé.
* `windy` - 1 pour venteux, 0 pour calme.

`GET /setSensor?shadeId=1&windy=1` - Indique au volet qu'il y a du vent.
`GET /setSensor?groupId=1&windy=1` - Indique à un groupe qu'il y a du vent.
`GET /setSensor?shadeId=1&windy=0&sunny=1` - Indique au volet qu'il fait soleil et que le temps est calme.
`GET /setSensor?groupId=1&windy=0&sunny=1` - Indique à un groupe qu'il fait soleil et que le temps est calme.


Vous pouvez également envoyer ces informations via un payload JSON.

<details>
Example of a json payload send either a groupId or a shadeId.  Either or both sunny and windy values can be sent.

The example below tells the motor that it is sunny and calm so act accordingly.
```json
{
   "shadeId": 1,
   "windy": 0,
   "sunny": 1
}
```
The example below tells the group members that it is sunny and calm so act accordingly.
```json
{
   "groupId": 1,
   "windy": 0,
   "sunny": 1
}
```
</details>


### Retour
Référence JSON du volet ou du groupe

---

**Pages liées :** [MQTT](mqtt.md) · [Home Assistant](home-assistant.md)

