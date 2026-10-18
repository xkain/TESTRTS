# Firmware

Cette page couvre le sous-onglet **Firmware** de l'onglet **Système** : l'état de santé de
l'ESP32, les mises à jour, la sauvegarde et la restauration, et les crédits du projet. Les
réglages sont décrits dans l'ordre où ils apparaissent à l'écran.

---

<img width="100%" src="../img/firmware-1-clair.webp#only-light" /><img width="100%" src="../img/firmware-1-sombre.webp#only-dark" />

## 1. L'état de l'appareil

Le premier bloc n'est pas réglable : c'est un relevé.

| Ligne | Ce qu'elle affiche |
| --- | --- |
| **Puce** | Le modèle d'ESP32 détecté (`ESP32`, `ESP32-S2`, `ESP32-S3`, `ESP32-C3`…). |
| **Processeur** | Le nombre de cœurs et la fréquence du processeur, par exemple `Dual-Core @ 240 MHz`. |
| **Mémoire Vive (RAM)** | Les octets libres actuellement, puis deux repères : **Niveau Min**, le plus bas jamais atteint depuis le démarrage, et **Bloc Max**, le plus gros bloc contigu encore allouable. |
| **Mémoire Flash** | La taille totale de la flash en Mo et **sa** vitesse de bus en MHz, puis l'espace libre du système de fichiers sur son total, en Ko, et le pourcentage utilisé. |
| **Uptime** | Depuis combien de temps l'appareil fonctionne, et depuis combien de temps sa connexion réseau tient. |

!!! note "Note"

    Les MHz de la ligne **Mémoire Flash** sont ceux du bus de la flash, pas ceux du processeur —
    celui-ci est sur la ligne **Processeur** juste au-dessus. Il est normal de voir deux
    fréquences différentes.

!!! note "Note"

    La ligne **Uptime** n'apparaît dans cet onglet que sur les écrans étroits. Sur un écran large,
    l'information est déjà affichée en permanence dans la barre du haut, elle n'est donc pas
    répétée ici.

Les deux repères de RAM servent au diagnostic. Le **Bloc Max** compte souvent plus que le total
libre : une connexion chiffrée a besoin d'un bloc d'un seul morceau, et peut échouer alors
qu'il reste de la mémoire en apparence — simplement éparpillée. Un **Bloc Max** qui s'effondre
au fil des heures est le signe à surveiller.

## 2. Le bandeau de statut

Juste en dessous, un bandeau résume la situation.

| Couleur | Message | Signification |
| --- | --- | --- |
| Vert | *Votre système est à jour* — *Aucune action n'est requise* | La version installée est la plus récente publiée. |
| Rouge | *Mise à jour disponible* — *La version X est prête à être installée* | Une version plus récente existe. |
| Rouge | *Action manuelle requise* — *La version X nécessite un flashage obligatoire par USB* | Le saut demandé ne peut pas se faire à distance — voir [Mettre à jour](mettre-a-jour.md). |

<img width="850" height="57" alt="Bandeau de mise à jour disponible" src="../img/firmware-2-clair.webp#only-light" /><img width="850" height="57" alt="Bandeau de mise à jour disponible" src="../img/firmware-2-sombre.webp#only-dark" />

!!! tip "Astuce"

    Le bandeau rouge est **cliquable** : il ouvre directement la fenêtre de mise à jour GitHub.
    Le même avertissement apparaît aussi en haut des autres pages de l'interface, également
    cliquable.

Si vous avez désactivé **Mises à jour** dans [Options](options.md), ce bandeau reste vert quoi qu'il
arrive : sans vérification, l'appareil ne peut pas savoir qu'une version existe.

## 3. Les mises à jour

Trois boutons, qui ouvrent chacun une fenêtre.

| Bouton | Ce qu'il écrit |
| --- | --- |
| `GitHub mise à jour` | *Mise à jour recommandée (Firmware + LittleFS)* — l'appareil télécharge les deux moitiés depuis GitHub et choisit lui-même les fichiers de votre puce. |
| `Mise à jour Firmware` | *Mise à jour locale du cœur du système (.bin)* — un fichier depuis votre ordinateur, l'interface web n'est pas touchée. |
| `Mise à jour LittleFS` | *Mise à jour locale de l'interface web uniquement (.bin)* — l'inverse : l'interface et les langues, sans toucher au firmware. |

!!! tip "Astuce"

    `GitHub mise à jour` est la bonne réponse dans la très grande majorité des cas : c'est la
    seule qui garde les deux moitiés en phase.

Le détail de chaque fenêtre, les fichiers publiés par une *release* et le choix de celui qui
correspond à votre puce, les raisons pour lesquelles une version peut ne pas apparaître dans la
liste, et le passage entre la v2 et la v3 : voir **[Mettre à jour](mettre-a-jour.md)**.

## 4. Vider le cache

Force le navigateur à recharger l'interface. À faire systématiquement **après** une mise à jour :
sans cela, le navigateur peut continuer d'afficher l'ancienne interface, avec des bizarreries à
l'écran. Si cela persiste, videz le cache depuis votre navigateur lui-même.

## 5. Documentation et signalement

* `Documentation` — ouvre ce guide de configuration.
* `Signaler un problème` — ouvre un formulaire de rapport de bug sur GitHub, pré-rempli.

!!! important "Important"

    Ce formulaire est réservé aux **bugs du firmware**. Pour une question de configuration ou une
    installation à mettre au point, adressez-vous plutôt à cette documentation, à
    [l'espace Discussions](https://github.com/xkain/ESPSomfy-RTS/discussions) ou au
    [forum HACF](https://forum.hacf.fr/t/espsomfy-rts-pour-la-gestion-de-vos-volets-rts-nouvelle-version/77935) :
    vous y aurez une réponse plus vite.

## Sauvegarde et restauration

<img  height="720" alt="Fenêtre de restauration" src="../img/firmware-3-clair.webp#only-light" /><img  height="720" alt="Fenêtre de restauration" src="../img/firmware-3-sombre.webp#only-dark" />

* **Sauvegarder** — télécharge un fichier `.backup` contenant toute votre configuration.
    Conservez-le ailleurs que sur l'appareil. Son format est documenté sur la page
    [Anatomie Fichier de Sauvegarde](../maintenance/anatomie-sauvegarde.md).
* **Restaurer le système** — ouvre la fenêtre ci-dessus : vous choisissez d'abord **ce que** vous
    voulez restaurer, puis le fichier, puis vous téléversez.

### Les six cases de la restauration

| Case | Ce qu'elle rapatrie | Cochée par défaut |
| --- | --- | --- |
| **Restaurer équipements et groupes** | Pièces, équipements et groupes, avec leurs adresses radio et leurs codes tournants | Oui |
| **Restaurer répéteurs** | Les adresses de répéteurs | Non |
| **Restaurer paramètres système** | Nom d'hôte, fuseau horaire, serveur NTP, langue, couleur, uPnP, vérification des mises à jour | Non |
| **Restaurer paramètres réseau** | Type de connexion, DHCP ou IP fixe, et le câblage Ethernet | Non |
| **Restaurer paramètres MQTT** | Hôte, port, topics et découverte | Non |
| **Restaurer paramètres radio** | Fréquence, largeur de bande, puissance, broches et préréglage de carte | Non |

!!! warning "Avertissement"

    **Cochez « Restaurer paramètres système » dès que vous cochez réseau, MQTT ou radio.**

    La longueur annoncée du bloc des paramètres système est plus courte que le bloc réel. Quand
    cette case est décochée, l'appareil saute ce bloc d'après la longueur annoncée et commence à
    lire les suivants quatorze octets trop tôt : les réglages réseau ou radio sont alors
    reconstitués à partir de données décalées, puis enregistrés tels quels. Dans un cas mesuré, le
    type de connexion revenait à « non défini » et l'adresse IP à `1`.

    Cocher « Restaurer paramètres système » remet la lecture d'aplomb et n'a aucun inconvénient.
    Voir [Anatomie Fichier de Sauvegarde](../maintenance/anatomie-sauvegarde.md) pour le détail du format.

!!! note "Note"

    Deux choses ne reviennent jamais d'une sauvegarde :

    * **Les mots de passe** Wi-Fi et MQTT, qui n'y sont pas écrits. Il faut les ressaisir.
    * **Le câblage Ethernet**, si vous restaurez sur un autre appareil que celui qui a produit le
        fichier. C'est volontaire : ce câblage décrit la carte d'origine, pas la vôtre.

## Crédits

* **Auteur du projet** — **xkain**, développement de cette interface et de cette version.
* **Auteur historique** — **rstrouse**, auteur du projet ESPSomfy-RTS d'origine.
* **Contributeurs du projet** — **glich34**, **dirstel** et **jcrespoc**

---

## Étape suivante

* [Mettre à jour](mettre-a-jour.md) — les trois fenêtres en détail, et les fichiers d'une *release*.
* [Anatomie Fichier de Sauvegarde](../maintenance/anatomie-sauvegarde.md) — le format du fichier `.backup`, enregistrement par enregistrement.
* [Factory Reset](../maintenance/factory-reset.md) — revenir à l'état d'usine, en deux paliers.
* [Journaux du port serie](../../commun/journaux-port-serie.md) — lire les messages de l'appareil quand l'interface ne suffit plus.

