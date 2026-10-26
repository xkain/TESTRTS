# Page d'accueil

L'interface de l'appareil se lit en trois parties : la **barre du haut**, le **menu** à gauche, et
le **contenu** de la page. Ce chapitre les présente dans cet ordre, puis décrit la page d'accueil
proprement dite, qui s'affiche tant que rien n'a été créé.

![page-accueil-1](v3/img/page-accueil-1){ .on-glb }


## La barre du haut

Sur ordinateur, la barre du haut porte, de gauche à droite :

- le **fil d'Ariane**, **absent de la page d'accueil et du tableau de bord** : il n'apparaît que
  dans les autres sections. Il indique la section, la sous-section et, quand vous éditez un
  élément, son nom (par exemple *Radio › Configuration*, ou *Somfy › Équipements › Volet salon*).
  Quand la sous-section porte le même nom que la section, un seul niveau s'affiche. Un clic sur
  un niveau précédent permet de **revenir en arrière** ;
- l'**indicateur d'activité radio / mouvement** : une icône radio qui **s'anime à chaque signal
  radio** émis ou reçu, ou dès qu'un équipement ou un groupe **est en mouvement**. Il se règle dans
  les [réglages du tableau de bord](general/tableau-de-bord.md) ;
- l'**état de la connexion** : trois pastilles **WIFI**, **LAN** et **POE**, dont **celle du mode
  actif est allumée**. En survol : « Connexion Wi-Fi », « Connexion filaire Ethernet », « Connexion
  Ethernet avec alimentation PoE ». Sur le [point d'accès de secours](../commun/point-d-acces.md),
  la pastille **WIFI** est remplacée par **AP** (« Point d'accès de secours actif ») ;
- la **durée de fonctionnement** : un petit compteur « jours / heures / minutes / secondes »,
  avec au survol le détail **Appareil** (depuis le dernier démarrage) et **Réseau** (depuis la
  connexion réseau actuelle, remise à zéro si le Wi-Fi ou l'Ethernet se reconnecte sans que
  l'appareil redémarre).

Sur **téléphone**, la barre du haut change de forme : le **logo** et le nom, puis l'icône
d'**activité radio**, une icône de **statut réseau** avec un point de couleur, une icône
d'**uptime** (avec la même infobulle), et un bouton **engrenage** qui ouvre la section
**Système**. Ce qui s'affiche se règle dans les [réglages du tableau de
bord](general/tableau-de-bord.md#en-tête-mobile).

Sur téléphone, une **bannière** apparaît en haut quand une **mise à jour** du firmware est disponible ; sur ordinateur, c'est le bouton du bas du menu (voir ci-dessous).

## Le menu

Le menu de gauche (et la barre d'onglets du téléphone) se lit de haut en bas comme une **feuille
de route**, **dans l'ordre où l'on s'en sert** :

| Entrée | Contenu | Pourquoi à cette place |
|---|---|---|
| **Tableau de bord** | vos équipements et groupes, une fois créés : voir [Tableau de bord](tableau-de-bord.md) | l'écran principal |
| **Réseau** | *Connexion*, *MQTT* | la première étape depuis le [point d'accès de secours](../commun/point-d-acces.md) |
| **Radio** | *Configuration*, *Journaux* | L'appairage, les télécommandes liées, les répéteurs et les plannings passent tous par elle |
| **Somfy** | *Équipements*, *Groupes*, *Pièces*, *Répéteur*, *Plannings* | la gestion de l'installation |
| **Système** | *Général*, *Firmware* | en bas du menu, à côté du bouton de redémarrage |

Un badge **désactivé** apparaît à côté de **Radio** tant que la radio est désactivée.

En **bas du menu** : un bouton de **mise à jour du firmware**, visible seulement quand une version
est disponible, et le bouton **Redémarrer**.

## Le contenu : un parcours en trois étapes

Tant qu'**aucune pièce, aucun équipement et aucun groupe** n'a été créé, le tableau de bord
n'est pas vide : il affiche un **parcours numéroté en trois étapes**, avec une barre de
progression 1-2-3. L'étape à faire en premier est mise en évidence, sur la barre et sur sa carte.

| Étape | Ce qu'elle demande | État affiché |
|---|---|---|
| **1. Réseau** | Relier l'appareil à votre box internet, en Wi-Fi ou en Ethernet. | **Connecté** (avec le nom du réseau Wi-Fi, ou « Ethernet »), ou **À faire** |
| **2. Radio** | Activer la radio, puis vérifier que vos télécommandes sont bien reconnues. | **Radio activée**, **Radio désactivée**, ou **Après la radio** tant que le réseau n'est pas fait |
| **3. Ajouter un équipement** | Appairer votre premier équipement : volet, store, portail ou porte de garage. | **Prêt**, ou **Après la radio** |

Une dernière carte en pointillés, **« Plus tard, si vous le souhaitez »**, renvoie vers
**Système** : langue, sécurité d'accès, apparence et maintenance. Elle ne fait pas partie du
parcours mais vous pouvez y faire un détours pour changer la langue par exemple.

Les états se mettent à jour tout seuls : à chaque changement de réseau, à l'enregistrement de
la radio et à chaque affichage de la page. **Dès qu'une pièce, un équipement ou un groupe est
créé, cette page ne s'affiche plus** : le [tableau de bord](tableau-de-bord.md) prend sa place.

### Pas à pas

1. **Réseau.** Reliez l'appareil à votre box : voir l'[assistant de
   connexion](reseau/assistant-de-connexion.md) et la page [Connexion réseau](reseau/index.md).
2. **Radio.** Activez-la et testez vos télécommandes : voir [Configurer la
   radio](radio/index.md) et le [test des télécommandes](radio/assistant-de-reglages.md). Si
   toutes vos télécommandes sont reconnues, **aucun réglage radio n'est nécessaire**.
3. **Premier équipement.** Voir la [mise en service d'un
   équipement](somfy/equipements/mise-en-service.md).
   
**Configuration.**  Ajustez l'appareil à votre usage :
   langue, sécurité d'accès, apparence, mises à jour et sauvegarde. Tout se trouve dans
   **Système → Général** : voir la page [Général](general/index.md).

   
