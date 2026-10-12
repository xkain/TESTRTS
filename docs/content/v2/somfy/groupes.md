<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/GROUPES-(Groups).md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Groupes (Groups)

ESPSomfy-RTS permet de créer des groupes de volets. Contrairement à une exécution séquentielle (un volet après l'autre), cette fonctionnalité utilise une **adresse radio unique** partagée pour une synchronisation parfaite.

<img alt="Capture d’écran 2026-03-03 à 21 20 29" src="https://github.com/user-attachments/assets/04b82b16-b7ce-4605-bd07-3ea96f36a40e" />

### Caractéristiques techniques

* **Capacité** : Vous pouvez créer jusqu'à **14 Groupes**.
* **Synchronisation native** : Une seule commande est diffusée. Tous les moteurs reçoivent l'ordre simultanément et démarrent en même temps.
* **Performance radio** : Réduit considérablement le trafic sur la fréquence 433.xxMHz, évitant les collisions de signaux.
* **Limitation technique** : Les groupes ne supportent pas le positionnement en pourcentage (%). En raison des différences de timing entre chaque moteur, les commandes sont limitées à **MONTER**, **DESCENDRE** et **STOP (MY)**.



### Ajouter et Éditer un Groupe

La gestion des groupes est identique à celle des volets individuels :

1.  **Accès** : `Somfy` > `Groupes`.
2.  **Ajout** : Cliquez sur le bouton **Ajouter Groupe**. 
    > * *Note : Vous devez enregistrer le groupe avec un nom avant de pouvoir l'appairer.*
    > * Les boutons `haut`, `my` et `bas` sont grisé et inactifs tant qu'au moins un volet n'a pas été ajouté au groupe.


###  Paramètres du Groupe

* **Nom** : Identifiant du Groupe (ex: *Groupe Salon*). Limité à **20 caractères**. Vous pouvez utiliser n'importe quel caractère imprimable.
* **Pièce** : Permet d'assigner le Groupe à une zone (par défaut : **Accueil**).
* **Protocole** : Généralement **RTS** (56-bit). Vous avez néanmoins le choix d'utiliser `RTW`, `RTV`.
    * **RTS** : Protocole standard.
    * **RTW** : Ce protocole est apparu en Europe sous la marque ASA Motors.
    * **RTV** : Variante du protocole où les moteurs sont marqués pour fonctionner à **433.92 MHz**.
      > _Si vous avez par exemple défini **RTW** lors que la configuration de la Radio alors **RTW** sera proposé par defaut._

* **Bits** : Vous pouvez choisir entre **56-bit** et **80-bit**. Les modèles à molette d'orientation (Tilt) utilisent souvent le **80-bit**.
  > Si vous avez défini **80-bit** lors que la configuration de la Radio alors **80-bit** sera proposé par defaut et vice-versa.

* **ID Télécommande (Adresse)** : Un identifiant unique de 24 bits. 

*  **Visualisation :** Cette partie vous permet d'observer le comportement des volets dans votre groupes directement pendant la configuration. Cela vous évite de multiplier les allers-retours avec la page d'accueil pour tester vos réglages.
   > * Comme dit quelques lignes plus haut, les boutons `haut`, `my` et `bas` sont grisé et inactifs tant qu'au moins un volet n'a pas été ajouté au groupe.
     <img width="878" height="102" alt="Copie d&#39;écran_20260304_183851" src="https://github.com/user-attachments/assets/9da61612-2044-4ce3-8b33-29a70ffcfd38" />
 

* **Commandes (Inverser)** : À utiliser si les volets descendent quand vous appuyez sur "Monter". 
  > *Note :* Monter n'est pas descendre. Si c'est inversé, votre moteur est mal configuré et vous devriez normalement inverser le sens sur le moteur lui-même. Cette case vous permet toutefois d'enverser le comportement dans l'application.

* **Répéter commandes** : Par défaut, l'ordre est envoyé une fois, puis répété une fois. 
  > *Conseil :* Augmentez cette valeur (jusqu'à 4 max) pour les moteurs à batterie qui "s'endorment" et sont lents à se réveiller. Ne l'augmentez pas inutilement : l'ESP ne peut rien entendre quand il parle !

!!! note "Note"

    Une fois que vous avez cliqué sur le bouton **AJOUTER GROUPE** :  

    * le bouton est remplacé par **SAUVEGARDER GROUPE**, ce qui vous permettra de modifier les paramettres de votre groupe si vous faites des changements à l'avenir
    * Le bouton **ASSORCIER VOLET** apparait, nous allons donc pouvoir associer un volet dans le groupe


### Associer Volet au Groupe

Pour qu'un moteur réponde au groupe, il doit enregistrer l'adresse du groupe dans sa mémoire. Répétez ces étapes pour chaque moteur membre :

1.  **Lancer l'assistant** : Cliquez sur **ASSOCIER VOLET**.
    <img width="878" alt="Copie d&#39;écran_20260304_195634" src="https://github.com/user-attachments/assets/c390020c-3460-45ff-b884-92e3eba1b4b0" />

2.  **Sélection** : Choisissez le volet à intégrer au groupe puis cliquez sur **SUIVANT**.
    <img width="878" height="687" alt="Copie d&#39;écran_20260304_195727" src="https://github.com/user-attachments/assets/33db879c-a6ba-49c3-b7b6-2c0d556cf6fa" />
on** : Choisissez le volet à intégrer au groupe puis cliquez sur **SUIVANT**.

3.  **Ouvrir la mémoire** : Prenez la télécommande individuelle du volet et appuyez sur le bouton **PROG** (au dos) jusqu'au va-et-vient (jog) du volet.
4.  **Confirmation** : Un popup vous demande de confirmer si le volet a bien effectué son mouvement.
    <img width="881" height="787" alt="Copie d&#39;écran_20260304_195752" src="https://github.com/user-attachments/assets/c1cd152a-18b4-448d-a52f-a09223826370" />

5.  **Validation** : Cliquez sur **APPAIRER AU GROUPE**. Le volet effectue un second "jog" pour confirmer l'enregistrement.

    <img  alt="Copie d&#39;écran_20260304_195819" src="https://github.com/user-attachments/assets/f3c71b43-9c32-447e-ae4b-5d1b4a4885f5" />

6.  **Finalisation** : Confirmez une dernière fois dans le popup final.

    <img alt="Copie d&#39;écran_20260304_195826" src="https://github.com/user-attachments/assets/f39cdfbd-07ab-44f6-96b2-5f14241803dd" />



Félicitations ! Vous avez un volet dans votre groupe et les boutons de commande sont désormais actifs.

<img width="881" height="397" alt="Copie d&#39;écran_20260304_195835" src="https://github.com/user-attachments/assets/d49af573-dd06-424b-af71-c9d073667bb8" />


!!! tip "Astuce"


    * Puisque l'adresse du groupe est physiquement enregistrée dans la mémoire du moteur, sa suppression nécessite une procédure de "désassociation" radio.
    * Pour retirer un volet du groupe, cliquez sur la **croix rouge** dans la liste des volets associés et suivez le même processus.
    * Cette étape est indispensable pour que le moteur "oublie" l'adresse du groupe et ne réponde plus aux commandes collectives.
