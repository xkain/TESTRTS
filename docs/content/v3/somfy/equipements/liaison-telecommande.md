# Télécommandes liées

Pour que ESPSomfy-RTS puisse suivre précisément la position de vos équipements, il doit
« écouter » vos télécommandes physiques. Si vous ne liez pas vos télécommandes, l'interface
affichera une position erronée dès que vous utiliserez un bouton réel.

La liaison se fait **depuis la fiche de l'équipement** (voir [Équipements](index.md)), ou dès la
[mise en service](mise-en-service.md) : en créant l'équipement, vous pouvez cocher « l'associer
à cet équipement » pour la télécommande que vous venez d'utiliser.

Sur la fiche, dans le bloc **Mise en service**, une ligne **Télécommandes ou capteurs liés** porte :

- un **badge** avec le **nombre** de télécommandes déjà liées ;
- le **dernier signal** connu, en dBm, **moyenné** quand plusieurs télécommandes sont liées.

Un clic sur cette ligne ouvre la **liste des télécommandes liées**, avec un bouton pour en
**lier une autre**.

Vous pouvez lier jusqu'à **7 canaux** par équipement — c'est une limite réelle du firmware,
pas un choix d'interface.

!!! important "Important"

    **Cas des groupes :** si vous avez une télécommande (par exemple une Telis 4 canaux) qui
    commande plusieurs équipements en même temps, vous devez lier ce canal à **chaque
    équipement** défini dans l'interface. Une télécommande peut piloter plusieurs équipements :
    l'assistant le signale (« Elle pilote aussi *nom* »).

## Procédure de liaison

1. **Ouvrez la liste** des télécommandes liées, puis cliquez sur **Lier une autre
   télécommande** (le **+** de la ligne **Télécommandes ou capteurs liés**). **L'écoute démarre aussitôt.**
2. **Appuyez sur un bouton** de votre télécommande réelle (le bouton **MONTER** est le plus
   simple), près du boîtier.
3. **Détection automatique** : dès que ESPSomfy-RTS entend le signal, il capture l'adresse de la
   télécommande, l'ajoute à la liste, et l'écoute s'arrête d'elle-même.

Si aucune télécommande n'est entendue, vérifiez sa pile ou rapprochez-vous du boîtier, puis
réessayez. Si la télécommande est **déjà liée à cet équipement**, l'assistant le dit.

## La liste des télécommandes liées

Chaque télécommande liée apparaît sous forme de carte (*« Émetteur 1 »*, *« Émetteur 2 »*…),
composée de :

* l'**ADDR** et le **CODE** : l'adresse radio de la télécommande et son dernier code
    tournant reçu ;
* une icône **poubelle**, qui retire la télécommande de la liste ;
* en dessous, séparée par un filet, la ligne **Signal** : la force du signal radio de cette
    télécommande précise, en dBm — **mise à jour à chaque appui** sur un bouton de cette
    télécommande, pratique pour repérer en direct une télécommande mal placée ou à portée
    limite, sans attendre un problème de commande.

Sur la fiche, la ligne **Télécommande entendue** (bloc Communication) indique **quand** une
télécommande liée a été entendue pour la dernière fois, et la carte de l'équipement sur le
tableau de bord le rappelle dans sa vue détaillée.

## Liaison des capteurs (Linking Sensors)

Si vous possédez des capteurs automatiques (comme le capteur de soleil/vent **Soliris** ou
le capteur de vent **Eolis**), vous devez également les lier à vos équipements, exactement
comme s'il s'agissait d'une télécommande manuelle.

Bien que ces capteurs n'envoient pas de commandes « bouton », l'ESPSomfy-RTS intercepte
leurs signaux radio et les traduit en actions (ex : « Le vent souffle trop fort, le store
remonte »). Sans cette liaison, votre interface ne saura pas que le store s'est replié par
sécurité.

**Procédure pour les capteurs :**

La méthode est identique à celle d'une télécommande (**Lier Télécommande**), mais vous
devez forcer le capteur à émettre un signal pendant que la fenêtre est en écoute.

* **Options pour déclencher le signal :**
    * Faire tourner l'anémomètre (le « moulinet ») rapidement (un sèche-cheveux ou un
        souffleur de feuilles font l'affaire).
    * Couvrir le capteur solaire pour simuler un changement de luminosité.
    * Appuyer brièvement sur le bouton **PROG** du capteur s'il en possède un.

Une fois que l'ESPSomfy-RTS entend le signal du capteur, la mise en écoute s'arrête
d'elle-même et le capteur apparaît dans la liste des appareils liés.

