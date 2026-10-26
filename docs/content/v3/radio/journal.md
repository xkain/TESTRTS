# Journal radio

![Effacement de la mémoireflash](v3/img/journal-radio){ .on-glb }

Le second sous-onglet de **Radio**, intitulé **Journaux**. La page est organisée en **blocs** :
**Écoute radio** (l'état du flux et ses compteurs), **Trames reçues** (le tableau, avec sa
recherche et ses filtres) et **Émetteurs entendus**. Chaque trame radio **décodée** par le CC1101
(RTS, RTW ou RTV, valide ou non) y apparaît dès réception, la plus récente en haut. Voir
[Configurer la radio](index.md) pour les réglages qui déterminent ce qui est reçu, et
[Dépannage radio](depannage.md#5-lire-le-journal-pour-comprendre-ce-qui-se-passe) pour l'utiliser
dans un diagnostic.

!!! info "Le journal commence à l'ouverture de l'interface"

    Il se remplit **depuis l'ouverture de l'interface** et **s'efface au rechargement de la
    page**. Une trame **« invalide »** a été captée mais mal décodée (signal faible ou
    parasite) : elle est **ignorée** et ne pilote rien.

## Écoute radio

Une pastille et un texte indiquent l'état du flux en direct :

* **À l'écoute** — le flux reçoit les trames normalement.
* **En pause** — vous avez cliqué **Pause** (voir plus bas) ; aucune nouvelle ligne ne
    s'ajoute au tableau tant que vous n'avez pas repris.
* **Hors ligne** — la connexion temps réel avec l'appareil est coupée ; rechargez la page une
    fois la connexion rétablie.

Trois compteurs à côté, mis à jour en direct :

* **Trames** : total cumulé depuis l'ouverture de la page (ou le dernier **EFFACER**) — il
    continue de grimper même au-delà des 300 lignes conservées à l'écran (voir
    [Nombre de trames conservées](#nombre-de-trames-conservées)).
* **Trames/min** : cadence sur la dernière minute glissante — utile pour voir si un équipement
    émet en continu (dysfonctionnement) ou si le silence radio est normal.
* **RSSI** : la puissance de la dernière trame reçue, coloré selon les mêmes zones que le
    tableau (voir [Code couleur du RSSI](#code-couleur-du-rssi)) ; affiche `--` tant qu'aucune
    trame n'est encore arrivée.

## Émetteurs entendus

Un bloc liste **chaque émetteur entendu, une seule fois** (« Chaque identifiant entendu, une seule
fois »). Pour chacun : **l'équipement auquel il correspond** (ou **Télécommande inconnue**), le
**nombre de trames**, l'**heure de la dernière** et le **dernier signal**. Une étiquette précise
s'il s'agit d'une **télécommande associée** ou de l'**adresse propre de l'équipement**.

**Touchez-en un** pour ne voir dans le tableau que **ses trames** ; **Tout afficher** retire le
filtre. Tant qu'aucune trame n'est arrivée : « Aucun émetteur pour l'instant ».

## Rechercher et filtrer

Le champ de recherche (*« Filtrer par adresse, commande ou code… »*) filtre en réalité sur un
champ plus large que son texte ne le laisse penser : **adresse, commande, code tournant, clé
d'obfuscation, et nom de l'équipement/groupe** si l'adresse est déjà reconnue — taper le nom
d'un volet retrouve donc aussi ses trames. Une croix vide le champ.

Le bouton **Valides** bascule un filtre qui **retire du tableau** toute trame marquée invalide
(il ne les grise pas, il les masque) — pratique pour ne garder que les trames exploitables
pendant un diagnostic de portée ou de réglage de fréquence.

## Colonnes du tableau

| Colonne | Contenu |
|---|---|
| Temps | Heure de réception, au millième de seconde près |
| Commandes | Icône de la commande, son nom, l'exposant du pas (`stepSize`) si la commande en porte un, et un badge rouge **invalide** le cas échéant |
| Adresse | Adresse numérique de la télécommande, avec en dessous le nom de l'équipement/groupe déjà associé — ou **« Télécommande inconnue »** si cette adresse n'est liée à rien ici |
| RSSI | Puissance du signal en dBm, cellule colorée (voir plus bas) |
| clé | Clé d'obfuscation de la trame |
| Code | Code tournant (rolling code) |
| Bits | Nombre de bits de la trame, avec le protocole (RTS / RTW / RTV) en exposant |

Chaque ligne est cliquable et déplie un détail :

* **Protocole**, **Synchro** et **Durée** (somme des impulsions, en millisecondes) sur une
    même grille.
* Un bloc **Impulsions** : le nombre d'impulsions puis leur liste brute, largeur par largeur —
    la matière première dont le firmware déduit bits et protocole. Utile pour illustrer un
    signalement de bug ou comparer deux télécommandes au niveau physique.

## Code couleur du RSSI

Le tableau et la pastille de la barre d'état utilisent **deux seuils** pour colorer chaque
valeur :

| Couleur | Seuil |
|---|---|
| 🟢 Vert | RSSI > -70 dBm |
| 🟡 Jaune | -85 dBm < RSSI ≤ -70 dBm |
| 🔴 Rouge | RSSI ≤ -85 dBm |
| ⚪ Gris | aucune mesure disponible |

!!! note "Note"

    Cette échelle à deux seuils est différente de la légende à trois zones (-30/-60, -70/-85,
    -90/-110 dBm) affichée dans l'outil de
    [balayage manuel](balayage-frequence.md#comprendre-le-rssi-affiché) : ce
    sont deux textes indépendants dans l'interface, pas la même échelle redessinée deux fois. Ici,
    « vert » commence dès -70 dBm plutôt qu'à -60.

## Reconnaître une trame invalide

Une trame qui ne respecte pas le format attendu reste affichée (sauf si **Valides** est actif)
mais porte un badge rouge **invalide** dans la colonne Commandes et un liseré rouge sur toute
la ligne — rien n'est grisé, la ligne reste lisible et dépliable normalement. Les causes
possibles, côté firmware : somme de contrôle incorrecte, adresse de télécommande hors plage,
code tournant nul (hors commande Sensor), échec de la parité propre aux trames 80 bits,
commande reconnue mais non gérée, ou clé d'obfuscation nulle.

!!! tip "Astuce"

    Une trame invalide n'est pas forcément le signe d'un problème : du bruit radio capté par
    hasard produit presque toujours une trame invalide. C'est une trame **valide** mais associée
    à une **adresse inconnue** qui signale un vrai problème de liaison — voir
    [Dépannage Radio §4](depannage.md#4-réception-ok-mais-rien-ne-bouge).

## Pause et reprise

Le bouton **Pause** fige l'affichage du tableau sans rien arrêter en coulisses : les trames
continuent d'être comptabilisées (compteurs et RSSI de la barre d'état toujours à jour), elles
ne sont simplement plus insérées dans la liste visible. **Reprendre** réaffiche d'un coup l'état
courant complet. Pratique pour lire tranquillement une trame sans que de nouvelles lignes ne la
fassent défiler hors de vue.

## Copier et effacer

* **COPIER** place dans le presse-papiers les trames **actuellement visibles** — c'est-à-dire
    après application de la recherche et du filtre **Valides** en cours, pas forcément tout
    l'historique. Le format est du JSON indenté, une propriété par ligne, avec tous les champs de
    chaque trame (heure, commande, adresse, RSSI, clé, code, bits, protocole, synchro, impulsions,
    validité…) — pratique à coller tel quel dans un ticket GitHub ou un message de forum.
* **EFFACER** vide le tableau **immédiatement, sans confirmation**. L'effet est purement local
    à votre navigateur : rien n'est envoyé à l'appareil, le journal recommence simplement à se
    remplir dès la trame suivante. Gardez la copie du journal (bouton **COPIER**) **avant**
    d'effacer si vous en aviez besoin.

## Nombre de trames conservées

Le tableau garde au maximum **300 trames** en mémoire (indiqué en pied de page, *« Trames
conservées : 300 »*) : au-delà, la plus ancienne est retirée à chaque nouvelle arrivée, premier
entré/premier sorti. Le compteur **Trames** de la barre d'état, lui, n'est pas plafonné : il
continue de grimper au-delà de 300 tant que vous n'effacez pas.

!!! important "Important"

    Si vous laissez le journal ouvert pendant un long test, pensez à **copier régulièrement** ce
    qui vous intéresse : les trames les plus anciennes disparaissent silencieusement une fois la
    limite de 300 atteinte.

