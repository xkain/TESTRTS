# Paramètres MQTT

Cet onglet (`Réseau → MQTT`, à côté de [Connexion Réseau](index.md)) — *« Réseau MQTT
: Configurez les paramètres de connexion MQTT »* — configure la connexion au courtier. Pour ce
que l'appareil publie et écoute une fois connecté, voir la page [MQTT](../integrations/mqtt.md). Les champs
ci-dessous reprennent les libellés et l'ordre exacts de l'écran.

## Activer le client MQTT

*« Active la communication avec votre serveur (broker) MQTT »* — l'interrupteur principal :
tant qu'il est désactivé, rien n'est publié ni écouté, même si le reste du formulaire est
rempli.

## Publier découverte

*« Envoie les paramètres pour une configuration automatique dans votre système »* — second
interrupteur, juste en dessous du précédent dans le même bloc. Voir
[MQTT](../integrations/mqtt.md#auto-découverte-mqtt) pour ce que ça publie concrètement. Le cocher révèle un
champ **Discovery Topic**, mais celui-ci n'apparaît qu'en bas de formulaire, après Root Topic
et Identifiant client (voir [Discovery Topic](#discovery-topic) plus bas) — les deux réglages
sont liés, sans être voisins à l'écran.

## Hôte et port

Hors de tout encadré, juste sous les deux interrupteurs : `MQTT://` *(figé, voir ci-dessous)*,
un champ libre pour l'**hôte** (`ESPSomfyRTS` par défaut — à remplacer par l'adresse de votre
courtier), et le **port** (`1883` par défaut). Toute valeur de port hors de la plage TCP
valide (1-65535) est refusée à l'enregistrement.

!!! note "Note"

    `MQTT` devant `://` n'est pas un choix : ce firmware ne sait parler qu'en MQTT non chiffré,
    voir [MQTT](../integrations/mqtt.md#activer-la-connexion) pour le pourquoi. Le menu déroulant qui l'affiche ne
    propose volontairement qu'une seule option.

## Nom d'Utilisateur et Mot de Passe

Seulement si votre courtier exige une authentification *(32 caractères max chacun)* —
laissez vides pour un courtier ouvert. Le mot de passe ne s'affiche jamais en clair (icône
œil pour le révéler à la saisie) ; un champ laissé tel quel (masque factice) signifie « je n'y
touche pas », le serveur ne renvoyant jamais le secret existant.

## Root Topic

*(Le champ garde son nom en anglais dans l'interface, y compris en français.)* Le préfixe
sous lequel tout ce que publie et écoute l'appareil est rangé — voir
[MQTT](../integrations/mqtt.md#le-sujet-racine) pour ce qu'il protège concrètement. Rempli par défaut avec
`espsomfy-<identifiant serveur>` (ex. `espsomfy-CF8CF4`). Deux validations **identiques**
s'appliquent, dans le navigateur avant l'envoi et sur l'appareil à la réception :

* ne peut pas être vide ;
* ne peut pas contenir de joker (`+`, `#`) ;
* ne peut pas commencer par `/` ou `$`.

!!! important "Important"

    Ce champ est vérifié **même si MQTT est désactivé** : le réglage est enregistré dans tous
    les cas. En cas de refus, le champ est automatiquement remis à la valeur réellement en
    vigueur sur l'appareil (pas celle que vous veniez de taper) et sélectionné pour une
    correction immédiate — sans quoi il resterait affiché tel quel, donnant l'impression
    trompeuse qu'une valeur invalide avait été acceptée.

## Identifiant client

*« Laisser vide pour un identifiant unique dérivé de l'appareil »* *(64 caractères max)*. Ne
le renseignez que si votre courtier indexe ses règles d'accès sur cet identifiant, ou si vous
préférez un nom choisi par vous plutôt qu'une valeur technique dérivée de l'adresse MAC.

## Discovery Topic

*(Lui aussi resté en anglais dans l'interface.)* Dernier champ du formulaire, visible
uniquement si **Publier découverte** (tout en haut) est coché — *« Chemin utilisé pour la
détection automatique par votre système, exemple : homeassistant »*, qui est aussi sa valeur
par défaut. À changer uniquement si votre plateforme en exige un autre.

## Enregistrement

Le bouton **Enregistrer** envoie l'ensemble du formulaire en une fois et referme/relance la
connexion au courtier avec les nouveaux réglages.

