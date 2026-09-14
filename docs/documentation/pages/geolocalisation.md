[← Sommaire](README.md)

# Géolocalisation

Trouve les **coordonnées GPS de votre domicile** et les transmet à l'appareil, en une fois.

## Pourquoi il existe

L'appareil sait déclencher une programmation « au lever du soleil » ou « au coucher du
soleil » plutôt qu'à une heure fixe — un volet qui suit la saison sans qu'on y touche. Mais
ces deux instants ne se calculent pas à partir de l'heure : ils dépendent de **l'endroit où
vous êtes**, et varient de plus d'une heure entre le nord et le sud d'un même pays.

L'appareil a donc besoin d'une latitude et d'une longitude. Il n'a aucun moyen de les
deviner : pas de GPS, pas de service de géolocalisation, et l'adresse IP d'un réseau
domestique ne dit pas grand-chose. C'est cette page qui les lui fournit.

**Vous n'en avez besoin qu'une fois**, sauf déménagement. Et vous n'en avez pas besoin du
tout si vous ne programmez qu'à heure fixe.

Une précision suffit largement : quelques centaines de mètres décalent le lever du soleil de
moins d'une seconde. Le nom de votre commune fait parfaitement l'affaire, inutile de
chercher votre rue.

## Deux façons d'obtenir la position

### Détection automatique

**Détecter ma position** demande la position au navigateur, qui vous demandera votre accord.
C'est le chemin le plus court, et le plus discret : la position **ne part nulle part**, elle
reste dans la page jusqu'à ce que vous l'envoyiez à votre appareil.

Selon la machine, la précision vient du GPS, du Wi-Fi environnant ou de l'adresse réseau —
largement assez dans tous les cas.

Si vous refusez l'autorisation, ou si le navigateur ne sait pas répondre, la page vous le
dit et il reste la saisie manuelle.

### Recherche par ville

Tapez une **ville ou un code postal**, éventuellement en filtrant par pays, puis choisissez
une suggestion dans la liste. La position n'est retenue qu'à ce choix.

Cette recherche interroge **OpenStreetMap** : le nom que vous tapez sort de votre machine.
C'est le seul endroit du site où cela se produit. Si cela vous gêne, la détection
automatique ne l'exige pas.

## Transmettre à l'appareil

Une fois la position retenue, les coordonnées s'affichent et deux voies s'ouvrent.

### Transmettre directement

Le champ **Adresse de votre ESPSomfy-RTS** attend le nom ou l'IP de l'appareil sur votre
réseau — `espsomfyrts.local` par défaut, ce qui convient à la plupart des installations.
Une IP (`192.168.1.42`) fait aussi bien, et est plus sûre si la résolution de nom locale
est capricieuse.

Deux comportements, selon la façon dont vous êtes arrivé ici :

| Vous avez ouvert la page… | Ce qui se passe |
|---|---|
| depuis l'interface de l'appareil | les coordonnées repartent vers l'onglet d'origine, et **cet onglet se referme** — votre interface reste où vous l'aviez laissée |
| directement, par un signet ou un lien | le navigateur **va sur l'appareil** en lui passant les coordonnées dans l'adresse |

Le premier cas est le plus confortable : partez du bouton prévu dans l'interface de
l'appareil plutôt que d'ouvrir la page dans le vide.

Une adresse mal écrite est refusée avant tout départ, plutôt que de vous envoyer sur une
page inexistante.

### Copier les coordonnées

**Copier les coordonnées** les place dans le presse-papiers. Utile si l'appareil n'est pas
joignable depuis cet ordinateur, ou si vous préférez les coller à la main dans ses réglages.

## En cas de refus

| Message | Ce qu'il veut dire |
|---|---|
| *Géolocalisation non supportée* | le navigateur n'a pas l'interface, ou la page n'est pas en HTTPS |
| *Erreur GPS* | vous avez refusé l'autorisation, ou le système n'a pas su localiser la machine |
| *Aucun résultat* | orthographe, ou filtre pays trop restrictif — réessayez sans le filtre |
| *La recherche a échoué* | pas d'accès à Internet, ou OpenStreetMap indisponible |
| *Choisissez d'abord une position* | vous avez tapé une ville sans choisir de suggestion dans la liste |
| *Adresse d'appareil invalide* | le nom ou l'IP saisi n'est pas une adresse recevable |
