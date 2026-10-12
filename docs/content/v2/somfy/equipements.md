<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/EQUIPEMENTS.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Équipements

Commencez par cliquer sur le Bouton **AJOUTER ÉQUIPEMENT** cela vous permettra d'accéder à la page de création d'une "identité numérique" pour votre appareil. Pour que le système fonctionne parfaitement et reste synchronisé avec vos télécommandes physiques, il a besoin de connaître les caractéristiques techniques de votre moteur (Nom, Type, temps de course, type de protocole, etc.).

<img width="1200" alt="Capture d’écran 2026-05-20 à 11 24 23" src="https://github.com/user-attachments/assets/c1731102-23e0-4d06-bc6d-17cfaeede0be" />


### Caractéristiques Techniques

* **Capacité** : ESPSomfy-RTS peut gérer jusqu'à **30 moteurs**.
* **Adresse Radio** : Un identifiant unique (24-bit). L'appareil en génère un par défaut (basé sur l'adresse MAC). **Ne le changez pas après l'appairage.**
* **Temps de course (Timing)** : Le temps en millisecondes (1s = 1000ms) pour faire un trajet complet.
* **Télécommande liée (Linke Remote)** : Télécommande physique déjà existante que l'ESPSomfy-RTS doit surveiller pour rester synchronisé.
* **Capteur** : Si votre appareil dispose de capteur solaire par exemple, vous pourrez l'activer ici.


## Configuration d'un équipement (Détails)

Chaque équipement possède des paramètres spécifiques qui permettent d'ajuster sa précision et son comportement radio. Voici la description détaillée de chaque champ:


### Identification et Type

* **Nom** : Identifiant de l'équipement (ex: *volet Salon*). Limité à **20 caractères**. Vous pouvez utiliser n'importe quel caractère imprimable.
* **Pièce** : Permet d'assigner l'équipement à une zone (par défaut : **Accueil**).
* **Type** : Définit l'icône et les boutons de contrôle. Le type identifie aussi les fonctions disponibles (ex: seuls les stores ont une gestion d'inclinaison/Tilt).


     Le choix du type détermine l'icône affichée ainsi que les contrôles disponibles sur l'interface.

     | Icône | Nom | Description | Fonctions |
     | :---: | :--- | :--- | :--- |
     | ![Roller Shade](https://github.com/user-attachments/assets/cfe3c9dc-bcd2-41dd-8424-da4806c34011) | **Store enrouleur** | Toile pleine qui s'élève ou s'abaisse via un tube rotatif supérieur. | Haut, Bas, My |
     | ![Shutter](https://github.com/user-attachments/assets/d8a43f3e-0083-47ba-be9f-1329e71ac5a6) | **Volet roulant** | Tablier composé de lames articulées s'enroulant dans un coffre. | Haut, Bas, My, Soleil |
     | ![Blind](https://github.com/user-attachments/assets/18c205d2-261b-48bd-91fe-1884e45ce93f) | **Store Vénitien** | Lames reliées par des cordons. Inclut souvent un mécanisme d'inclinaison (Tilt). | Haut, Bas, My, Tilt, Soleil |
     | ![Drapery Left](https://github.com/user-attachments/assets/aba77bcb-0dac-448a-98fe-82035af283fd) | **Rideau (Gauche)** | Tringle coulissante qui s'ouvre de la droite vers la gauche (fixé à gauche). | Haut, Bas, My, Soleil |
     | ![Drapery Right](https://github.com/user-attachments/assets/d13eaea2-0ca1-4a8a-b554-800fe0d887ea) | **Rideau (Droite)** | Tringle coulissante qui s'ouvre de la gauche vers la droite (fixé à droite). | Haut, Bas, My, Soleil |
     | ![Drapery Center](https://github.com/user-attachments/assets/87567977-fd45-4cbf-a441-b8df6a6d735c) | **Rideau (Central)** | Rideau à deux panneaux s'ouvrant depuis le centre vers les côtés. | Haut, Bas, My, Soleil |
     | ![Awning](https://github.com/user-attachments/assets/c242cc14-d57c-4d1b-87c9-948f6bbce7fe) | **Store banne** | Mécanisme horizontal qui se déploie pour couvrir une zone (terrasse). | Haut, Bas, My, Soleil |
     | ![Garage 1](https://github.com/user-attachments/assets/c264f57a-4377-40fc-abbd-7f61b7961cc1) | **Garage (1 bouton)** | Moteur avec une seule fonction cyclique (Toggle). **Note :** privilégiez la version 3 boutons si possible. | Cycle, Lumière |
     | ![Garage 3](https://github.com/user-attachments/assets/c264f57a-4377-40fc-abbd-7f61b7961cc1) | **Garage (3 boutons)** | Porte de garage utilisant des commandes distinctes : Ouvrir, Fermer et Stop. | Haut, Bas, My, Lumière |
     | ![Dry Contact](https://github.com/user-attachments/assets/b6f6dc10-7a66-4c10-a734-b544cc4f2b42) | **Contact Sec** | Appareils RTS pilotant des relais simples (ON/OFF alterné). | Cycle |
     | ![Dry Contact 2](https://github.com/user-attachments/assets/b6f6dc10-7a66-4c10-a734-b544cc4f2b42) | **Contact Sec (2 boutons)** | Micro-récepteurs utilisant un bouton pour l'ouverture et l'autre pour la fermeture. | Haut, Bas |
     | ![Gate Left](https://github.com/user-attachments/assets/57b4b929-dcea-4e42-997c-de6f7e526441) | **Portail (Gauche)** | Contrôleur où Haut ouvre et Bas ferme. Vantail représenté à gauche. | Haut, Bas, My |
     | ![Gate Right](https://github.com/user-attachments/assets/ff351bc2-cd2b-4ee8-988e-6f2618e4813a) | **Portail (Droite)** | Contrôleur où Haut ouvre et Bas ferme. Vantail représenté à droite. | Haut, Bas, My |
     | ![Gate Center](https://github.com/user-attachments/assets/148a6d29-0e8f-48f9-ad72-cfbff06c2def) | **Portail (Double)** | Portail à deux battants s'ouvrant depuis le centre vers les côtés. | Haut, Bas, My |


   > **Conseil pour les portes de garage :** Même si votre télécommande physique n'a qu'un bouton, essayez le type **Garage (3-button)**. La plupart des moteurs récents gèrent nativement les ordres séparés, ce qui est beaucoup plus fiable pour l'automatisation.



* **Protocole** : Généralement **RTS** (56-bit). Vous avez néanmoins le choix d'utiliser `RTW`, `RTV`, `IO-Relay` ou `IO_Remote`.
    * **RTS** : Protocole standard.
    * **RTW** : Ce protocole est apparu en Europe sous la marque ASA Motors.
    * **RTV** : Variante du protocole où les moteurs sont marqués pour fonctionner à **433.92 MHz**.
    * _Pour **IO-Relay** et **IO_Remote** : Veuillez vous référer à la page [Contrôle des moteurs avec GPIO](../materiel/controle-moteurs-gpio.md)._
      > _Si vous avez par exemple défini **RTW** lors que la configuration de la Radio alors **RTW** sera proposé par defaut._

* **Bits** : Vous pouvez choisir entre **56-bit** et **80-bit**. Les modèles à molette d'orientation (Tilt) utilisent souvent le **80-bit**, si vous avez défini **80-bit** lors que la configuration de la Radio alors **80-bit** sera proposé par defaut et vice-versa.
* **ID Télécommande (Adresse)** : Un identifiant unique de 24 bits. 
    * Par défaut, il est généré à partir de l'adresse MAC de votre ESP32.
    * **Important :** Cette adresse doit être **unique** pour chaque canal et chaque télécommande à portée du module. L'algorithme interne vérifie l'unicité parmi les volets déjà connus de l'ESPSomfy-RTS.
    * _**Note :** Ne modifiez jamais cet ID après avoir appairé le volet, sinon le moteur ne reconnaîtra plus les ordres._

---

### Visualisation

Cette partie vous permet d'observer le comportement de l'équipement directement pendant sa configuration. Cela vous évite de multiplier les allers-retours avec la page d'accueil pour tester vos réglages.

<img height="101" alt="Copie d&#39;écran_20260520_110837" src="https://github.com/user-attachments/assets/58a44f58-7725-4176-a9cf-632b8b26840d" />


!!! note "Note"

    Tant que vous n'avez pas cliqué sur le bouton **CRÉER** les boutons seront grisé et inactifs et vos réglages ne sont pas enregister.
    Vous devez cliquer sur le bouton **CRÉER** pour que la visualisation correspond à vos réglages.

---

### Temps de course et Inclinaison (Motor Timing)
Ces valeurs s'expriment en **millisecondes** (1s = 1000ms). C'est le secret d'une synchronisation parfaite.

* **Temps montée / descente (ms)** : Temps total pour une course complète (limité à 3 minutes)
    * *Exemple :* 9,5 secondes s'inscrit `9500`.
    * *Conseil :* Prenez une minute pour chronométrer réellement chaque sens. Le poids du tablier rend souvent la montée plus lente que la descente. Un réglage précis garantit que l'interface reste toujours synchrone avec le volet.

* **Type d’inclinaison** : Cette option apparaît uniquement si le type choisi est **Store Vénitien**.
    * **Aucun** : Aucun mécanisme d'inclinaison n'existe sur le store.
    * **Moteur inclinaison** : Un moteur séparé est installé dans le mécanisme du store ; il utilise des pressions longues sur les boutons de la télécommande pour incliner les lames.
    * **Intégré** : Les mécanismes d'inclinaison intégrés utilisent un seul moteur pour l'inclinaison et la levée. Ces mécanismes inclinent les lames jusqu'à l'ouverture complète avant de lever le store, et les inclinent jusqu'à la fermeture complète avant de le baisser.
    * **Inclinaison seule** : Seul le temps d'inclinaison peut être contrôlé.
    * **Inclinaison Euro** : Pour les moteurs d'inclinaison gérant les pressions courtes et longues.

* **Pas (Step Size - 80-bit uniquement)** : Si vous avez un moteur 80-bit, un curseur supplémentaire apparaît pour régler le "pas" de la molette d'inclinaison. Il faudra expérimenter pour trouver le bon ratio entre la levée (lift) et l'inclinaison (tilt).

<p align="center">
  <img alt="Réglage Step Size" src="https://github.com/user-attachments/assets/53470159-e318-4c74-a079-af81021aa25e" />
</p>


---

### Options et Comportements Avancés

#### Capteur Solaire & Inversions

* **Capteur solaire** : Active la gestion du soleil pour les moteurs compatibles. Une icône "Soleil" apparaîtra sur l'écran d'accueil pour activer/désactiver la fonction.
  
      <img width="471" src="https://github.com/user-attachments/assets/e0496fcb-2e0f-4de7-aa2e-2103dced03bd" />
 
  
     _NOTE: Pour que cela fonctionne, un capteur physique doit être lié au moteur._

* **Capteur Lumière** : Cette option apparait seulement si le type est **Garage**, Une icône "Ampoule" apparaîtra sur l'écran d'accueil pour activer/désactiver la fonction. 

     <img width="463" height="186" alt="Copie d&#39;écran_20260302_180334" src="https://github.com/user-attachments/assets/ed4c5cea-ee0b-422b-a204-35f459f5f56a" />

     _Note : Pour que cela fonctionne, un capteur physique doit être lié au moteur._

* **Commandes (Inverser)** : À utiliser si l'équipement descend quand vous appuyez sur "Monter". 
  > *Note :* Monter n'est pas descendre. Si c'est inversé, votre moteur est mal configuré et vous devriez normalement inverser le sens sur le moteur lui-même. Cette case vous permet toutefois d'enverser le comportement dans l'application.

* **Position (Inverser %)** : Par défaut, **100% = Fermé** (logique Somfy). Cochez cette case si vous tenez absolument à ce que 100% signifie "Ouvert".

#### Fiabilité et Fonctions Spéciales

* **Répéter commandes** : Par défaut, l'ordre est envoyé une fois, puis répété une fois. 
  > *Conseil :* Augmentez cette valeur (jusqu'à 4 max) pour les moteurs à batterie qui "s'endorment" et sont lents à se réveiller. Ne l'augmentez pas inutilement : l'ESP ne peut rien entendre quand il parle !

* **Favoris (Simuler)** : Si votre moteur ne supporte pas nativement l'enregistrement d'une position "MY", l'application simulera cet arrêt en calculant le temps de trajet nécessaire depuis n'importe quel point.

---


Une fois les réglages validés et l'équipement créé via le bouton **CRÉER**, de nouvelles options apparaissent :

* **APPAIRER** : Lance la procédure pour lier numériquement l'ESP au moteur (le moteur doit être en mode "Prog").
* **DÉFINIR CODE** : Lance la procédure pour lier numériquement l'ESP au moteur (le moteur doit être en mode "Prog")
* **LIER TÉLÉCOMMANDE** : Permet à l'ESPSomfy-RTS d'écouter vos télécommandes physiques existantes. Vous pouvez lier jusqu'à **5 canaux** par équipement.

* **ENREGISTER** : Enregistre vos modifications.

### 💡 Conseils

!!! important "Important"

    **Le secret de la précision :** Prenez une minute pour chronométrer réellement vos volets. Le poids du tablier fait que la montée est souvent plus lente que la descente. Si vous réglez ces temps précisément, votre interface sera toujours parfaitement synchronisée avec la réalité.

!!! tip "Astuce"

    **Moteurs "paresseux" (Batteries) :** Si un volet ne répond pas de temps en temps (notamment ceux sur batterie qui "s'endorment"), augmentez le réglage **Répéter Commandes** à 2 ou 3. Cela force l'envoi du signal plusieurs fois pour être sûr de réveiller le moteur.

!!! note "Note"

    **Position favorite (MY) :** Si votre moteur ne supporte pas nativement la position "MY", cochez la case **Simuler la position favorite**. L'ESPSomfy-RTS calculera lui-même le temps nécessaire pour atteindre votre position préférée.


---


## 2. Appairage (Pairing)

L'appairage consiste à enregistrer l'adresse de votre ESPSomfy-RTS dans la mémoire du moteur. Cette procédure est identique à l'ajout d'une nouvelle télécommande physique.

!!! important "Important"

    **Le "Jog" est votre seul indicateur :** Les moteurs ne renvoient aucune confirmation numérique. La seule façon de savoir si l'opération a réussi est d'observer l'équipement faire un bref mouvement de va-et-vient (le "jog").

**Procédure étape par étape :**

1.  **Ouvir l'assistant** : Cliquer sur le bouton **APPAIRER** , l'assistant s'affichera et vous indiquera toutes les étapes à suivre
2.  **Ouvrez la mémoire du moteur** : Prenez votre télécommande d'origine (déjà fonctionnelle) et appuyez sur le bouton **PROG** au dos jusqu'à ce que le volet fasse un "jog".
3.  **Enregistrement** : Cliquez sur le bouton **PROG** de l'assistant. 
    * Si l'équipement fait à nouveau un "jog", l'appairage est réussi !
    * S'il ne bouge pas, ne validez pas. Réessayez l'étape 1.
4.  **Valider Enregistrement** : Cliquez sur le bouton **APPAIRAGE RÉUSSI**, l'assistant se fermera de lui-même, le bouton **APPAIRER** est devenu **DÉSAPPAIRER**


<img width="33%" alt="Copie d&#39;écran_20260520_093333" src="https://github.com/user-attachments/assets/4803ab5c-43ac-4d44-a59c-f5ff98635e23" />

<img width="33%" alt="Copie d&#39;écran_20260520_093404" src="https://github.com/user-attachments/assets/ee10d254-ef84-43a4-b610-ca4d0299e0a8" />

<img width="33%" alt="Copie d&#39;écran_20260520_093415" src="https://github.com/user-attachments/assets/db5520ed-7f4c-4954-8820-cf1f7e42f953" />

### Le Mode Expert (Nouveauté v2.5.2)

Si vous avez de nombreux équipements à configurer et que vous maîtrisez le principe du "Jog", le suivi pas à pas de l'assistant classique peut s'avérer répétitif.
Le Mode Expert, activable d'un simple clic via le commutateur (switch) en haut de l'assistant, résout ce problème. Il supprime les étapes intermédiaires et regroupe toutes les commandes essentielles sur une seule et unique page.


!!! tip "Astuce"

    Ce mode est idéal pour les installations denses : il fait gagner un temps précieux en évitant les allers-retours dans les menus de l'assistant standard.

<img width="400" alt="Copie d&#39;écran_20260520_095900" src="https://github.com/user-attachments/assets/27953a13-623b-4488-840b-3b44433dd445" />



!!! warning "Avertissement"

    **Honnêteté logicielle :** L'application vous demandera de confirmer si l'équipement a bougé. Ne dites pas "Oui" s'il ne l'a pas fait, sinon vous devrez passer par une procédure de désappairage pour recommencer proprement.

!!! note "Note"

    **Désappairer** : suivre exactement le même processus que l'appairage

    **Fonctionnement en "Bascule" (Toggle)** : L'appairage et le désappairage utilisent la même commande. Si l'équipement fait plus d'un va-et-vient, vous venez probablement de supprimer le lien au lieu de le créer.

    **Portée Radio** : la portée de l'ESPSomfy-RTS est impressionnante (150-200 mètres sans obstacles ni interférences éléctromagnétiques). Si l'appairage échoue, le problème est rarement la distance, mais plutôt le mode programmation du moteur qui s'est refermé trop vite.

---

### 3. Liaison de télécommande (Link Remote)

Pour que l'ESPSomfy-RTS puisse suivre précisément la position de vos équipements, il doit "écouter" vos télécommandes physiques. Si vous ne liez pas vos télécommandes, l'interface affichera une position erronée dès que vous utiliserez un bouton réel.

!!! important "Important"

    **Cas des Groupes :** Si vous avez une télécommande (ex: Telis 4 canaux) qui commande plusieurs volets en même temps, vous devez lier ce canal à **chaque volet** défini dans l'interface.

**Procédure de liaison :**

1.  **Ouvrez l'assistant** : Dans la fenêtre d'édition de l'équipement, cliquez sur le bouton **LIER TÉLÉCOMMANDE**.
2.  **Mise en écoute** : L'interface passe en mode "écoute" et attend un signal radio.
3.  **Action physique** : Appuyez simplement sur un bouton de votre télécommande réelle (le bouton **MONTER** est le plus simple).
4.  **Détection automatique** : Dès que l'ESPSomfy-RTS entend le signal, il capture l'adresse de la télécommande et ferme l'assistant automatiquement.


<img width="828" alt="Copie d&#39;écran_20260520_113543" src="https://github.com/user-attachments/assets/f520a33b-047b-447d-9888-6ad002d8d7a4" />


Une fois l'assistant fermé un bloc s'affiche indiquant l'adresse et le code de votre télécommande.

!!! note "Note"

    Pour supprimer l'apparaige de votre télécommande il suffit simplement de cliquer sur la croix rouge dans la liste des télécommandes liées pour la supprimer. 
    Vous pouvez lier autant de télécommandes ou de capteurs que vous le souhaitez à un même volet.
<img width="877" alt="Copie d&#39;écran_20260520_113114" src="https://github.com/user-attachments/assets/86ea8168-6f24-478f-8095-2c9a0458b089" />



### 4. Liaison des Capteurs (Linking Sensors)

Si vous possédez des capteurs automatiques (comme le capteur de soleil/vent **Soliris** ou le capteur de vent **Eolis**), vous devez également les lier à vos volets ou stores, exactement comme s'il s'agissait d'une télécommande manuelle.

Bien que ces capteurs n'envoient pas de commandes "bouton", l'ESPSomfy-RTS intercepte leurs signaux radio et les traduit en actions (ex: "Le vent souffle trop fort, le store remonte"). Sans cette liaison, votre interface ne saura pas que le store s'est replié par sécurité.

**Procédure pour les capteurs :**

La méthode est identique à celle d'une télécommande (**LIER TÉLÉCOMMANDE**), mais vous devez forcer le capteur à émettre un signal pendant que l'assistant est en écoute.

* **Options pour déclencher le signal :**
    * Faire tourner l'anémomètre (le "moulinet") rapidement (un sèche-cheveux ou un souffleur de feuilles font l'affaire).
    * Couvrir le capteur solaire pour simuler un changement de luminosité.
    * Appuyer brièvement sur le bouton **PROG** du capteur s'il en possède un.
    * *L'astuce de l'auteur :* Agiter un os de poulet cru en l'air jusqu'à ce que la fenêtre disparaisse. Ça n'aide pas techniquement, mais ça fera parler vos voisins et vous donnera une idée pour le dîner.

Une fois que l'ESPSomfy-RTS entend le signal du capteur, l'assistant se ferme et le capteur apparaît dans la liste des appareils liés.

### 5. Définir Code (Rolling Code)

L'ESPSomfy-RTS vous permet de modifier manuellement le "Rolling Code" d'un équipement. Cependant, cette fonctionnalité est à utiliser avec une **extrême prudence**.

!!! danger "Attention"

    **Risque de désynchronisation :** Chaque commande envoyée incrémente ce code de 1 dans la mémoire du moteur. Si le code envoyé par l'ESPSomfy-RTS ne correspond pas à celui attendu par le moteur (à l'intérieur d'une petite fenêtre de tolérance), le moteur ignorera la commande par sécurité.

!!! note "Note"


    * **Utilité :** Cette option est principalement informative ou utile en cas de restauration d'une configuration sur un nouveau module.
    * **Conséquence d'une erreur :** Si vous désynchronisez le code, vous devrez probablement réinitialiser complètement la mémoire du moteur (procédure souvent fastidieuse).
    * **Conseil :** Vous pouvez cliquer sur le bouton **DÉFINIR CODE** juste pour satisfaire votre curiosité et voir la valeur actuelle, mais ne modifiez rien à moins de savoir exactement ce que vous faites. L'application veille sur vous, mais elle ne peut pas empêcher une erreur de saisie manuelle !


<img width="828" height="694" alt="Copie d&#39;écran_20260520_113445" src="https://github.com/user-attachments/assets/966a95fe-166c-404e-8d89-fe45996f2165" />


