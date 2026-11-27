# Plannings

Les plannings sont les commandes que l'appareil envoie seul, à heure fixe ou au lever et au
coucher du soleil, les jours de la semaine que vous choisissez. Chacun pilote un équipement ou un
groupe. La page se lit en un bandeau, une liste de tuiles et deux fenêtres : la
**programmation** et l'**horaire**.

![Page Plannings](v3/img/plannings-page){ .on-glb }

## Programmation et horaire

Deux mots reviennent sur toute la page :

| Terme | Ce que c'est |
|---|---|
| **Horaire** | un déclenchement : un moment (heure fixe, lever ou coucher du soleil) et une action (position, inclinaison ou Ma position). C'est l'unité que l'appareil exécute et qu'il compte |
| **Programmation** | l'ensemble des horaires qui visent **la même cible** les **mêmes jours**. Elle porte un nom facultatif, une cible et des jours ; chacun de ses horaires a son moment et son action |

La programmation n'existe que dans l'interface : l'appareil ne connaît que des horaires, et
l'interface réunit dans une même tuile ceux qui partagent cible et jours. Le nom, la cible et
les jours d'une programmation sont donc recopiés sur chacun de ses horaires à l'enregistrement.

!!! note "Deux programmations qui se rejoignent"

    Si vous donnez à une programmation la cible et les jours d'une autre, les deux n'en font
    plus qu'une : l'interface le signale avant d'enregistrer (voir
    [Enregistrer](#enregistrer)).

**30 horaires** au plus, tous équipements et groupes confondus.

## Le bandeau

Le bandeau est à gauche sur ordinateur, en haut de la page sur tablette et téléphone (sous
1000 px).

| Élément | Contenu |
|---|---|
| **Surtitre** | *Habitation* |
| **Titre** | **Plannings** |
| **Description** | *Les commandes que l'appareil envoie seul, à heure fixe ou au lever et au coucher du soleil.* |
| **Jauge** | les horaires utilisés, *n sur 30*, et *N places libres* (*1 place libre* au singulier), avec une barre de remplissage, orange quand les 30 horaires sont pris |
| **Note de position** | *Une position géographique est nécessaire pour les plannings au soleil.*, avec le bouton `Position géographique` |

La jauge compte les **horaires**, pas les tuiles : une programmation de trois horaires occupe
trois places.

La note de position n'apparaît que si l'heure du lever et du coucher ne peut pas être calculée
aujourd'hui, c'est-à-dire tant que la position géographique de l'appareil n'est pas réglée.
`Position géographique` ouvre la page **Préférences** sur son onglet **Langue & région**, où se
trouve la tuile [Position géographique](../appareil/preferences/index.md#position) (si une
fenêtre a des modifications non enregistrées, l'interface demande d'abord confirmation).

Tant que la liste est vide, la note, les outils et le menu ⋮ sont masqués.

Ce que montre le bandeau dépend de l'écran :

| Écran | Bandeau | Outils (recherche, tri, filtre) |
|---|---|---|
| **Ordinateur** | surtitre, titre, description, jauge complète, note de position | barre au-dessus de la liste ; le filtre est derrière un bouton ⋮ (`Filtrer`) au bout de la barre |
| **Tablette** (768 à 999 px) | sur une ligne : icône, titre et jauge ; surtitre et description masqués ; la note de position passe dessous, sur toute la largeur | comme sur ordinateur |
| **Téléphone** (sous 768 px) | icône, jauge réduite à *n sur 30* (sans les places libres) et un bouton ⋮ (`Rechercher et trier`) ; la note de position dessous | dans le panneau qu'ouvre le ⋮ du bandeau : recherche, **Trier**, puis les filtres à plat |

Une pastille sur le ⋮ signale qu'un réglage masque une partie de la liste : sur le ⋮ du bandeau
(téléphone) quand une recherche ou un filtre est actif, sur le ⋮ `Filtrer` (ordinateur, tablette)
quand un filtre autre que **Tous** est choisi.

## Rechercher, trier, filtrer { #outils }

| Outil | Effet |
|---|---|
| **Recherche** (*Rechercher un équipement, une heure…*) | garde les programmations dont la cible, le nom ou l'heure d'un horaire contient le texte tapé |
| **Tri** `A → Z` | regroupe les tuiles sous un intertitre par cible (icône, nom de la cible, nombre de programmations), cibles dans l'ordre alphabétique ; sous chaque cible, les programmations dans l'ordre de leur premier horaire |
| **Tri** `Par heure` | une seule liste, dans l'ordre du premier horaire de chaque programmation, sans intertitre ; chaque tuile rappelle sa cible sous son titre |
| **Filtre** **Déclenchement** | `Tous`, `Heure fixe`, `Soleil`, chacun avec son nombre |

Le tri choisi est retenu par le navigateur. Par défaut, c'est `A → Z`.

L'ordre « par heure » suit l'heure **effective du jour** : un horaire au soleil se range à
l'heure du lever ou du coucher d'aujourd'hui, décalage compris. Un horaire au soleil dont l'heure
ne peut pas être calculée (position non réglée) se range en fin de liste et s'affiche `--:--`.

Le filtre `Soleil` retient les programmations qui ont **au moins un** horaire au lever ou au
coucher, `Heure fixe` celles qui ont au moins un horaire à heure fixe : une programmation qui
mêle les deux figure sous les deux filtres. Un second clic sur le filtre actif revient à `Tous`.

Si la recherche et le filtre ne laissent rien, la liste affiche **Rien ne correspond** — *Videz la
recherche ou choisissez un autre filtre.* — et un bouton `Tout afficher` qui efface les deux.

## La liste { #liste }

### Liste vide

Sans aucune programmation, la page affiche **Aucune programmation pour l'instant** — *Une
programmation envoie une commande à heure fixe ou au lever et au coucher du soleil, les jours que vous choisissez.* —
et la seule tuile d'ajout.

### La tuile d'ajout

Toujours en tête de liste : `Ajouter une programmation`, avec *Une heure ou le soleil, une action,
des jours* (ce sous-titre est masqué sur téléphone). Elle ouvre la
[fenêtre de programmation](#programmation) avec une cible à choisir.

| Cas | Ce qui se passe |
|---|---|
| Les 30 horaires sont déjà utilisés | la tuile est grisée |
| Aucun équipement ni groupe n'existe | la fenêtre ne s'ouvre pas : **Aucune cible disponible** — *Une programmation doit piloter un équipement ou un groupe. Créez-en un avant de programmer un horaire.* |

### La tuile d'une programmation

Un clic sur la tuile ouvre la [fenêtre de programmation](#programmation).

| Zone | Contenu |
|---|---|
| **Icône** | celle du type de l'équipement visé, ou l'icône des groupes |
| **Menu ⋮** (**Options**) | `Pause` (ou `Reprendre`) et `Supprimer` |
| **Titre** | le nom de la programmation, ou à défaut l'heure de son premier horaire ; badge **Désactivée** si aucun de ses horaires n'est actif |
| **Horaires** | une ligne par horaire, dans l'ordre de la journée. Au-delà de deux horaires, seul le premier est montré, suivi de *+n autres horaires* |
| **Jours** | les sept initiales, de lundi à dimanche ; les jours actifs sont pleins |

Chaque ligne d'horaire montre :

- une icône d'action (flèche haute, flèche basse, cible, **My** ou lames) ;
- l'heure, effective du jour pour un horaire au soleil ;
- l'action en clair : `Ouvrir`, `Fermer`, un pourcentage, **Ma position**, ou **Inclinaison seule**
  suivie du pourcentage ; complétée de *· inclinaison n %* quand une inclinaison s'ajoute à la
  position ;
- dessous, le déclenchement : *Heure fixe*, ou l'icône soleil ou lune suivie de *Lever* ou
  *Coucher* et du décalage entre parenthèses (*(+30m)*, *(-15m)*) ;
- un badge **Désactivée** si cet horaire seul est coupé dans une programmation par ailleurs
  active.

Une programmation entièrement désactivée apparaît estompée.

| Commande du menu | Effet |
|---|---|
| `Pause` | désactive tous les horaires de la programmation, tout de suite, sans confirmation et sans passer par un enregistrement |
| `Reprendre` | réactive tous ses horaires, de la même façon |
| `Supprimer` | demande **Supprimer cette programmation ?** (*heures – cible, avec tous ses horaires.*), puis supprime tous les horaires de la programmation avec `Supprimer la programmation`. Irréversible |

## Ailleurs dans l'interface { #ailleurs }

Les mêmes tuiles et la même fenêtre se retrouvent à deux autres endroits. La cible y est alors
**imposée** : la fenêtre de programmation l'affiche sans permettre d'en changer.

| Endroit | Ce qu'on y trouve |
|---|---|
| Onglet **Plannings** de la fiche d'un [équipement](equipements/index.md) ou d'un [groupe](groupes/index.md) | les tuiles des programmations de cette cible, précédées de la tuile `Ajouter une programmation` avec le nombre d'horaires restants. La fiche reste ouverte derrière la fenêtre, ses modifications en cours sont conservées |
| Carte dépliée du [tableau de bord](../tableau-de-bord/index.md) | un bloc **Plannings** en lecture seule (heure, initiales des jours, action, icône soleil ou lune ; *Aucune programmation pour l'instant* s'il n'y en a pas) avec un lien `+ Ajouter`, et dans les **Raccourcis** des options de la carte un bouton `Ajouter une programmation` |

Supprimer un équipement ou un groupe supprime aussi les horaires qui le visent.

## La fenêtre de programmation { #programmation }

Titre **Créer une programmation** (*Définissez un ou plusieurs déclenchements horaires pour un
équipement ou un groupe.*) ou **Modifier la programmation** (*Ajustez les paramètres de cette
programmation.*). Le côté de la fenêtre rappelle la **Cible**, mise à jour quand on en change,
et porte un badge **Désactivée** quand aucun horaire n'est actif.

| Champ | Contenu |
|---|---|
| **Cible** | liste déroulante en deux sections, **Équipements** et **Groupes**. Une nouvelle programmation propose d'abord le premier équipement. Ouverte depuis une fiche ou une carte, la cible est affichée sans pouvoir être changée |
| **Nom** | facultatif, 20 caractères au plus (*Entrer un nom de programmation*). Sans nom, la tuile prend l'heure du premier horaire |
| **Jours de répétition** | sept boutons, un par jour, de lundi à dimanche, et le lien `Tous les jours`, qui coche les sept, ou les décoche s'ils l'étaient tous |
| **Horaires** | la liste des horaires, avec à droite du titre un interrupteur `Oui` / `Non` qui active ou désactive tous les horaires d'un coup (grisé tant qu'il n'y en a aucun) ; puis le bouton `Ajouter un horaire` |

Une nouvelle programmation démarre **sans horaire** et **sans jour** coché.

Chaque horaire de la liste, rangé dans l'ordre de la journée, montre son heure, une icône
d'action, l'action en clair (avec **Désactivée** s'il est coupé) et une phrase : *S'ouvrira à
08:00*, *Se fermera à 21:15*, *Se positionnera à 40 % à 12:00*, *Se positionnera sur Ma position à
…*, *Inclinera ses lames à 30 % à …* ; pour un horaire au soleil, suivie de *· Lever* ou *· Coucher*
et du décalage.

| Geste | Effet |
|---|---|
| Clic sur un horaire | ouvre la [fenêtre de l'horaire](#horaire) |
| Corbeille d'un horaire | le retire de la liste, sans confirmation |
| `Ajouter un horaire` | ouvre la fenêtre de l'horaire, vierge |
| `Fermer` ou la croix | ferme la fenêtre ; s'il y a des modifications, **Modifications non enregistrées** propose `Quitter sans enregistrer` ou `Rester sur la page` |
| `Créer` / `Enregistrer` | envoie la programmation à l'appareil |

Le pied de la fenêtre rappelle le nombre d'horaires encore disponibles sur l'appareil (*n
horaire(s) restant(s)*) une fois la programmation enregistrée ; il suit les horaires ajoutés ou
retirés.

!!! note "Rien ne part avant l'enregistrement"

    Ajouter, régler ou retirer un horaire ne modifie que la fenêtre. L'appareil n'est touché
    qu'au clic sur `Créer` ou `Enregistrer` ; seuls les horaires modifiés sont alors réécrits.

### Enregistrer { #enregistrer }

L'enregistrement est refusé, avec un message, dans ces cas :

| Message | Cause |
|---|---|
| *Ajoutez au moins un horaire à cette programmation.* | la liste des horaires est vide |
| *Sélectionnez au moins un jour de la semaine.* | aucun jour coché |
| *Sélectionnez un équipement ou un groupe valide.* | aucune cible choisie |
| *Deux horaires sont réglés sur le même déclenchement (08:00). Modifiez l'un des deux avant d'enregistrer.* | deux horaires ont la même heure fixe, ou la même référence solaire avec le même décalage |
| *Limite maximale d'horaires atteinte. Supprimez un horaire avant d'en ajouter un nouveau.* | l'enregistrement porterait le total au-delà de 30 horaires |

Si la cible et les jours choisis sont déjà ceux d'une autre programmation, l'interface demande
**Réunir les deux programmations ?** — *{cible} a déjà une programmation sur ces jours. Les deux n'en
formeront plus qu'une seule, de n horaires.* — avec le bouton `Réunir`. Annuler laisse la fenêtre
ouverte, rien n'est envoyé.

Après un enregistrement réussi, la fenêtre se ferme sur *Ajouté avec succès* ou *Enregistré avec
succès*. Si l'appareil refuse une étape en cours de route, une partie des horaires peut être
déjà enregistrée : la liste est rechargée pour montrer l'état réel avant que l'erreur
s'affiche.

## La fenêtre de l'horaire { #horaire }

Elle s'ouvre par-dessus la fenêtre de programmation : **Nouvel horaire** ou **Modifier
l'horaire**, avec le nom de la programmation en sous-titre. Un nouvel horaire est préréglé à
**09:00**, heure fixe, `Ouvrir`, sans répétition, actif.

### Heure de déclenchement

| Réglage | Contenu |
|---|---|
| **Référence horaire** | `Heure fixe`, `Au lever du soleil` ou `Au coucher du soleil`. Sans position géographique, les deux derniers portent la mention *(non configuré)* |
| **Heure fixe** | l'heure, pour la référence **Heure fixe** seulement |
| **Décalage** | pour le lever ou le coucher : `Oui` / `Non`. À `Oui`, un curseur et un champ en minutes, de −720 à +720 (douze heures avant ou après) |

Pour une référence solaire, la fenêtre affiche l'heure du jour (*Lever du soleil aujourd'hui :
07:42*) puis, sous le décalage, la phrase qui en résulte et se met à jour en direct :

| Décalage | Phrase |
|---|---|
| nul | *Se déclenchera exactement au coucher du soleil, soit à 18:05.* |
| positif | *Se déclenchera 20 minute(s) après le coucher du soleil, soit à 18:25.* |
| négatif | *Se déclenchera 20 minute(s) avant le coucher du soleil, soit à 17:45.* |

Sans position géographique, ces lignes sont remplacées par l'avertissement *Position
géographique non configurée. Réglez-la dans Préférences › Langue & région pour utiliser le
lever/coucher du soleil.* L'horaire peut tout de même être enregistré, mais il ne se déclenchera
pas (voir [Sur l'appareil](#appareil)). Aux latitudes où le soleil ne se lève ou ne se couche pas
ce jour-là, la fenêtre l'indique : *Le soleil ne se lève ni ne se couche aujourd'hui à cette
latitude (nuit ou jour polaire).*

### Position

Cinq choix au plus, un seul actif à la fois :

| Choix | Action envoyée | Proposé |
|---|---|---|
| `Ouvrir` | position 0 % | sauf cas ci-dessous |
| `Fermer` | position 100 % | sauf cas ci-dessous |
| `Personnalisée` | la **Position souhaitée**, de 0 à 100 % au curseur | sauf cas ci-dessous |
| `Inclinaison seule` | la **Position d'inclinaison cible** seule, hauteur inchangée | si la cible gère l'inclinaison |
| `Ma position` | la vraie commande **My** : le moteur rejoint sa position favorite, telle qu'elle est mémorisée au moment du déclenchement | si le type de la cible a une position favorite |

Sur une cible à lames, le curseur **Position d'inclinaison cible** s'ajoute aussi à `Ouvrir`,
`Fermer` et `Personnalisée` : la position et l'inclinaison sont visées ensemble. Il disparaît
avec `Ma position`, qui gère sa propre inclinaison.

Les choix s'adaptent à la cible :

| Cible | Choix proposés |
|---|---|
| Équipement sans inclinaison | `Ouvrir`, `Fermer`, `Personnalisée`, `Ma position` |
| Équipement à lames | les mêmes, plus `Inclinaison seule` |
| Équipement de type d'inclinaison **Inclinaison seule** | `Inclinaison seule` et `Ma position` |
| **Garage (1 bouton)**, **Portail 1 bouton** | `Ouvrir`, `Fermer`, `Personnalisée` (pas de position favorite) |
| **Interrupteur (1 bouton)** | un seul choix, `Actionner` |
| **Interrupteur (2 boutons)** | `Arrêt` et `Marche` |
| Groupe | `Ouvrir`, `Fermer`, `Personnalisée`, `Ma position` ; `Inclinaison seule` si au moins un membre gère l'inclinaison |

Pour un groupe, deux avertissements peuvent apparaître sous les choix :

- avec `Ma position`, si un membre n'a pas de position favorite : *Les équipements du groupe ne
  supportant pas la position MY (ex: portes de garage) ignoreront cette commande.*
- avec `Inclinaison seule`, si un membre ne gère pas l'inclinaison : *Les équipements du groupe
  ne gérant pas l'inclinaison ignoreront cette commande ; leur hauteur restera inchangée.*

Pour un groupe visé en pourcentage, chaque membre reçoit sa propre commande et rejoint la cible
de son côté. `Ma position` envoie au contraire une seule commande **My** au groupe.

### Options

| Réglage | Contenu |
|---|---|
| **Répéter commandes** | `Aucune répétition`, ou de `1 fois` à `10 fois` : renvois de fiabilité après le déclenchement (voir [Sur l'appareil](#appareil)) |
| **Horaire** | `Oui` / `Non` — *Désactivé, l'horaire reste dans la programmation mais ne se déclenche plus.* |

`Confirmer` reporte l'horaire dans la fenêtre de programmation (rien n'est encore envoyé à
l'appareil) ; il est refusé si un autre horaire de la programmation a le même déclenchement
(*Deux horaires sont réglés sur le même déclenchement…*). `Annuler` referme sans rien reporter,
après confirmation s'il y avait des modifications.

## Sur l'appareil { #appareil }

C'est l'appareil qui exécute les horaires : ni le navigateur ni un système domotique n'ont besoin
d'être ouverts.

| Point | Comportement |
|---|---|
| **Vérification** | toutes les 30 secondes environ ; un horaire se déclenche une fois dans la minute prévue, les jours cochés |
| **Heure** | l'appareil a besoin de l'heure exacte, reçue du serveur NTP réglé dans les [Préférences](../appareil/preferences/index.md). Tant qu'il ne l'a pas, aucun horaire ne se déclenche |
| **Lever et coucher** | recalculés chaque jour à partir de la position géographique, et aussitôt si la position ou le fuseau horaire changent |
| **Sans position géographique** | les horaires au soleil sont ignorés, sans erreur ; de même un jour de nuit ou de jour polaire |
| **Horaire manqué** | un horaire dont la minute est passée pendant que l'appareil était éteint ou redémarrait n'est pas rattrapé |
| **Redémarrage** | les horaires sont conservés et reprennent dès que l'heure est connue |
| **Cible supprimée** | ses horaires sont supprimés avec elle |

**Répéter commandes** fiabilise l'envoi radio, le protocole RTS n'ayant aucun retour du moteur :
les renvois sont répartis sur les deux minutes qui suivent le déclenchement. Pour un équipement
visé en pourcentage ou en inclinaison, chaque renvoi n'a lieu que si la position **estimée** par
l'appareil ne correspond pas encore à la consigne. Pour un groupe, ou avec `Ma position`, les
renvois partent sans condition.

!!! note "Ce que les plannings ne font pas"

    Pas de déclenchement unique ni de plage de dates : un horaire se répète chaque semaine, les
    jours cochés. Pas de condition (météo, état d'un capteur, position actuelle) ni de scène qui
    croise plusieurs cibles : un horaire vise un seul équipement ou un seul groupe. Pour aller
    au-delà, un système domotique comme [Home Assistant](../../home-assistant/index.md) fait
    mieux.

Les plannings sont aussi publiés en MQTT, où chacun peut être activé ou désactivé à distance
(voir [Topics MQTT](../domotique/mqtt/topics.md)), et l'intégration Home Assistant les expose
et les gère (voir [Plannings dans Home Assistant](../../home-assistant/plannings.md)). Ces deux
chemins voient des **horaires**, chacun avec son numéro, et non des programmations.

## Pages liées

* [Tableau de bord](../tableau-de-bord/index.md)
* [Équipements](equipements/index.md)
* [Groupes](groupes/index.md)
* [Préférences › Position géographique](../appareil/preferences/index.md#position)
* [Topics MQTT](../domotique/mqtt/topics.md)
* [Plannings dans Home Assistant](../../home-assistant/plannings.md)
