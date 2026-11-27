# Préférences

La page **Préférences** règle la langue de l'interface, l'heure et la position de l'appareil, et
l'apparence de l'interface. Elle se lit en deux onglets.

Le nom d'hôte et la diffusion SSDP se trouvent dans [Connexion réseau](../reseau/index.md), la
vérification des mises à jour dans [Système](../systeme/index.md#update), et la sécurité de l'accès
dans [Sécurité de l'appareil](../securite.md).

## Le bandeau

Le bandeau, à gauche sur ordinateur et en haut de la page sur tablette et téléphone, rappelle le
nom de l'appareil et son adresse `.local` ; sur ordinateur, il ajoute la description de la page.
Il résume aussi la **Langue**, le **Fuseau horaire** et le **Thème** en service : directement sur
ordinateur, derrière le bouton **Détails** sur tablette.

Sur téléphone, le bandeau ne garde qu'une ligne de résumé : son menu ⋮ propose **Détails**, qui
ouvre ces informations dans un panneau, et **Aide sur cette page**.

## Langue & région { #region }

![Préférences, onglet Langue & région](v3/img/preferences-region){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Langue** | la langue de l'interface ; `Gérer les langues` ouvre le gestionnaire des langues, voir [Gérer les langues](langues.md) |
| **Date et heure** | le **Fuseau horaire**, dont dépend aussi le passage à l'heure d'été, et le **Serveur NTP**, qui donne l'heure exacte aux [plannings](../../habitation/plannings.md) (`pool.ntp.org` par défaut) |
| **Position géographique** | **Latitude** et **Longitude** de votre domicile, pour les plannings au lever ou au coucher du soleil, voir [Position géographique](#position) |

Pour aller plus loin : [Gérer les langues](langues.md).

### Position géographique { #position }

Un [planning](../../habitation/plannings.md) peut se déclencher au lever ou au coucher du soleil
plutôt qu'à heure fixe. Ces deux instants dépendent de l'endroit où vous êtes, et l'appareil n'a
aucun moyen de le deviner : il lui faut une latitude et une longitude. Une seule fois suffit, sauf
déménagement, et le nom de votre commune est assez précis. Inutile si vous ne programmez qu'à
heure fixe.

La tuile n'apparaît pas tant que l'appareil est sur son
[point d'accès de secours](../../../aide/point-d-acces.md).

!!! note "Vie privée : vos coordonnées restent dans l'appareil"

    Elles sont **arrondies à 2 décimales** (environ 1 km) avant d'être enregistrées : assez pour
    un calcul à la minute près, sans garder votre adresse exacte. Elles ne servent qu'au calcul
    local du lever et du coucher du soleil, et l'appareil ne les envoie nulle part : ni sur
    Internet, ni vers MQTT.

Trois façons de remplir les champs, de la plus simple à la plus manuelle :

| Méthode | Comment | Ce qui sort de votre navigateur |
|---|---|---|
| `Localisation via assistant GitHub` | ouvre l'[assistant de géolocalisation](../../../outils/geolocalisation.md) dans un nouvel onglet, servi en HTTPS : détection par le navigateur ou recherche par ville. La position choisie revient remplir les champs de la tuile, et l'onglet de l'assistant se referme | rien avec la détection ; avec la recherche, le nom de la ville ou le code postal tapé, envoyé à OpenStreetMap |
| `Localisation via Navigateur` | lit la position sur place. Ce bouton n'apparaît que si la page est servie en HTTPS ou depuis `localhost` : ce n'est pas le cas de l'appareil, servi en HTTP sur le réseau local | rien |
| Saisie ou collage | une paire `latitude, longitude` collée d'un coup, copiée depuis une carte par exemple, se répartit dans les deux champs | rien |

Les champs remplis par l'assistant ou le navigateur le sont comme une saisie : vérifiez-les, puis
enregistrez. Pour retirer la position, videz les deux champs et enregistrez : les plannings au
lever ou au coucher du soleil restent alors inactifs.

| Message | Ce qu'il veut dire |
|---|---|
| *Votre navigateur ne prend pas en charge la géolocalisation.* | le navigateur n'a pas l'interface requise |
| *Accès à la position refusé ou indisponible. Saisissez les coordonnées manuellement.* | vous avez refusé l'autorisation, ou le système n'a pas su localiser la machine |
| *La latitude doit être comprise entre -90 et 90.* / *La longitude doit être comprise entre -180 et 180.* | une valeur hors plage a été saisie ; l'appareil la refuse aussi |

## Apparence { #appearance }

![Préférences, onglet Apparence](v3/img/preferences-appearance){ .on-glb }

| Tuile | Ce qu'elle montre ou permet |
|---|---|
| **Mode d'affichage** | `Automatique` (suit le réglage clair ou sombre du navigateur), `Clair` ou `Sombre` |
| **Couleur d'accentuation** | six teintes au choix, ou `Autre…` pour n'importe quelle couleur |
| **Catégories en couleur** | `Non`, `Icônes` ou `Icônes et bloc de titre` : donne une couleur à chaque catégorie de l'Habitation (équipements, groupes, pièces, plannings), sur les icônes des listes, et au besoin sur le bloc de titre des pages et des fenêtres |
| **Retours tactiles & visuels** | les confirmations d'appui, propres à ce navigateur, voir [Retours tactiles & visuels](#retours) |

### Retours tactiles & visuels { #retours }

Ces réglages sont enregistrés **dans votre navigateur**, pas sur l'appareil : ils ne valent que
pour le navigateur où vous les réglez.

| Réglage | Effet |
|---|---|
| **Boutons de contrôle** | `Enfoncement`, `Flash / Lueur` ou `Aucun` à l'appui sur les boutons de commande (haut, bas, My, bascule et [télécommande virtuelle](../../habitation/equipements/telecommande-virtuelle.md)) ; utile si l'indicateur d'activité radio est désactivé |
| **Navigation & cartes** | le même choix pour les boutons généraux, les cartes et les autres éléments interactifs |
| **Formulaires & réglages** | `Oui` / `Non` : met en valeur le champ, le menu ou l'option que vous sélectionnez |
| **Vibration au toucher** | `Oui` / `Non` : une brève vibration à chaque interaction, sur écran tactile seulement ; grisé avec « Non pris en charge par cet appareil ou ce navigateur. » ailleurs |

## Enregistrer

Une modification fait apparaître la barre d'enregistrement en bas de l'écran, avec le nombre de
modifications en attente ; son bouton de liste les détaille, avant et après. `Enregistrer` les
applique, `Annuler` les abandonne. Les retours tactiles & visuels passent par la même barre, mais
sont enregistrés dans ce navigateur plutôt que sur l'appareil.

## Pages liées

* [Gérer les langues](langues.md)
* [Assistant de géolocalisation](../../../outils/geolocalisation.md)
* [Réglages du tableau de bord](../../tableau-de-bord/personnaliser.md)
