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
fonction que pour les télécommandes qui en ont réellement besoin.

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

La procédure est automatisée grâce à la fonction de scan :

1. **Accès** : section `Somfy` → onglet `Répéteur`.
2. **Lancer le scan** : cliquez sur **Chercher Télécommande**.
3. **Capture** : l'assistant s'affiche en écoute. Appuyez sur n'importe quel bouton de votre
    télécommande physique.
4. **Confirmation** : dès qu'un signal est détecté, la fenêtre se ferme automatiquement et
    l'adresse de la télécommande rejoint la liste des répéteurs actifs — tous ses signaux
    seront désormais répétés.

### Liste des répéteurs

Tant qu'aucun répéteur n'est configuré, un message *« Aucune télécommande n'est
actuellement répétée »* invite à utiliser **Chercher Télécommande** pour en capturer un.

!!! note "Note"

    Contrairement aux listes Équipements/Groupes/Pièces, celle-ci n'a **pas** de poignée de
    glisser-déposer : aucune réorganisation n'est possible. L'ordre d'affichage suit celui de
    la liaison (premier emplacement libre), et se resserre automatiquement après une
    suppression pour ne jamais laisser de trou.

Chaque ligne affiche une icône fixe, le libellé **« Adresse télécommande »** suivi de
l'adresse radio elle-même — un répéteur n'a pas de nom personnalisé, seule son adresse est
connue — et une icône **poubelle** qui le retire, confirmation demandée avant d'arrêter la
répétition. La ligne elle-même n'est pas cliquable, seule la poubelle a une action.

