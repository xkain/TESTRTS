# Répéteurs (Repeaters)

L'ESPSomfy-RTS inclut une fonction de répétition de signal. L'appareil « écoute » les
trames radio d'une télécommande physique précise et les réémet, avec la puissance de sa
propre radio, pour étendre leur portée.

### Pourquoi utiliser le Répéteur ?

Cette fonction est utile lorsqu'une télécommande physique est trop loin d'un équipement
pour l'actionner directement. L'ESPSomfy-RTS capte le signal et le renvoie, servant de
« pont » entre la télécommande et le moteur.

### ⚙️ Fonctionnement technique

* **Capacité** : jusqu'à **7 télécommandes répétées** par appareil.
* **Analyse de trame** : à chaque réception, l'ESPSomfy-RTS compare l'adresse source à sa
    liste de répéteurs. Une correspondance met la trame en file d'attente pour réémission,
    indépendamment du fait qu'elle corresponde aussi à l'un de vos équipements déclarés — les
    deux traitements sont indépendants.
* **Moment de silence** : la trame mise en attente n'est réémise qu'une fois qu'aucune
    réception n'est en cours **et** qu'un court délai (100 ms) s'est écoulé depuis sa mise en
    file — pour éviter de réémettre par-dessus une trame radio encore en train d'arriver.
* **Fidélité** : la trame est retransmise telle quelle, sans modification.

### ⚠️ Précautions et Limitations

Répéter des signaux radio inutiles dégrade les performances radio de l'ensemble de votre
installation — chaque trame répétée est une trame de plus dans l'air. N'activez cette
fonction que pour les télécommandes qui en ont réellement besoin : une télécommande que
l'ESPSomfy-RTS capte de manière fiable, mais que le moteur ne capte pas.

!!! note "Note"

    Il n'existe aucune détection ou limitation automatique de saturation radio côté firmware
    — c'est à vous de rester raisonnable sur le nombre de répéteurs actifs.

!!! danger "Attention"

    **Risque de boucle infinie :** Si vous possédez plusieurs appareils ESPSomfy-RTS, **ne
    configurez jamais la même télécommande comme répéteur sur plus d'un appareil**. Les
    appareils se renverraient le signal mutuellement à l'infini (A répète vers B, B répète
    vers A, etc.) — une véritable chambre d'écho radio. Rien dans le firmware ne détecte ou
    n'interrompt ce genre de boucle : c'est une règle à respecter soi-même, pas un garde-fou
    logiciel. **Une télécommande = un seul appareil répéteur.**

### Configurer un Répéteur

1. **Accès** : section `Somfy` → onglet `Répéteur`.
2. **Lancer l'écoute** : cliquez sur `Capturer une télécommande à répéter`, en bas de la tuile
    **Télécommandes répétées**. La fenêtre **Répéteur** s'ouvre et l'écoute démarre aussitôt :
    la carte **En écoute…**, bordée de pointillés, rappelle sous elle l'avertissement
    ci-dessus.
3. **Capture** : appuyez sur n'importe quel bouton de votre télécommande physique.
4. **Confirmation** : dès qu'un signal est détecté, la carte passe au vert, **Répéteur
    assigné**, avec le protocole, le nombre de bits, l'adresse et la force du signal reçu.
    La télécommande rejoint la liste : tous ses signaux sont désormais répétés. Fermez la
    fenêtre avec `Fermer`.

La fenêtre prévoit deux autres cas :

| Cas | Ce qu'affiche la fenêtre | Que faire |
|---|---|---|
| La télécommande est **déjà répétée** | une carte orange, *« Cette télécommande est déjà répétée. »* | `Écouter une autre télécommande` relance l'écoute |
| **Aucun signal** au bout de 30 secondes | une carte orange, *« Aucune télécommande entendue »* | vérifiez la pile ou rapprochez-vous du boîtier, puis `Réessayer` |

### La page Répéteur

L'onglet suit la même présentation en tuiles que les autres pages.

**La tuile Capacité** résume la situation :

| Indicateur | Signification |
|---|---|
| **Répétées** | le nombre de télécommandes répétées, sur le maximum de 7 |
| **Entendues** | combien d'entre elles ont émis au moins une trame depuis l'ouverture de la page |
| **Dernière trame** | la dernière télécommande répétée entendue, avec sa commande et l'heure |

**La tuile Télécommandes répétées** liste une carte par télécommande, avec un compteur
`n / 7` en titre. Chaque carte affiche :

* le **nom** : *« Télécommande de « Volet séjour » »* quand cette télécommande est aussi
    liée à un équipement, sinon *« Adresse télécommande »* — un répéteur n'a pas de nom
    personnalisé ;
* l'**adresse radio** de la télécommande ;
* la ligne **Signal**, en dBm, colorée selon sa qualité ;
* à droite, la **dernière commande** reçue et son heure, ou *« Aucune trame depuis
    l'ouverture »* ;
* une icône **poubelle**, qui arrête la répétition après confirmation.

La carte de la dernière télécommande entendue est entourée de la couleur d'accent ; une
télécommande qui n'a encore rien émis est grisée.

!!! note "Note"

    Le boîtier ne conserve que les **adresses** des répéteurs. La dernière trame et le
    signal de chaque carte sont relevés par votre navigateur, à partir des trames reçues
    **depuis l'ouverture de la page** : après un rechargement, les cartes repartent de zéro
    jusqu'au prochain appui. Le signal, lui, reprend la dernière valeur que ce navigateur
    avait vue.

Tant qu'aucun répéteur n'est configuré, la tuile affiche *« Aucune télécommande n'est
actuellement répétée »*, et le bouton de capture reste disponible juste en dessous.

La liste ne se réorganise pas : l'ordre suit celui de la liaison (premier emplacement
libre), et se resserre automatiquement après une suppression.

!!! tip "Astuce"

    Pour qu'une télécommande déclenche une automatisation au lieu d'être répétée, voir
    [Télécommandes écoutées](telecommandes-ecoutees.md). Une télécommande déjà répétée ne
    peut pas y être ajoutée.
