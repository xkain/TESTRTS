<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/Configurer-le-Système.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Configurer le système

# OPTIONS

Cet onglet détail par ordre d'affichage chaque option présente dans le premier onglet de configuration.

---

<p align="center">
  <img alt="Capture d'écran de l'interface des options" src="https://github.com/user-attachments/assets/0454bdc0-f4b1-4a99-a651-57782c399789" />
</p>


* **Nom d'hôte** : Donnez un nom unique à votre appareil (ex: `espsomfy-salon`). Si vous possédez plusieurs boîtiers sur le même réseau, chaque nom doit être différent pour éviter les conflits DNS.
* **Fuseau horaire** : Configurez votre zone géographique. C'est ce paramètre qui détermine l'heure locale pour vos automatisations.
* **Langue** : (Depuis la v2.5.0) Choisissez votre langue d'interface parmi le **français**, l'anglais ou l'allemand.
    > note: La page se rechargera automatiquement pour appliquer correctement le changement de langue

* **Serveur NTP** : Permet la synchronisation automatique de l'heure via Internet. Par défaut, l'appareil utilise `pool.ntp.org`, mais vous pouvez spécifier votre propre serveur local si nécessaire.


* **uPnP (SSDP)** : Si cette option est activée, votre appareil apparaîtra automatiquement dans les périphériques réseau de systèmes comme Microsoft Windows (Explorateur de fichiers > Réseau).
* **Mises à jour logicielles** : ESPSomfy-RTS vérifie périodiquement sur GitHub si une nouvelle version est disponible. Une alerte s'affichera dans l'interface web et dans Home Assistant.

* **Mode d'affichage** : 
    * **Mode Sombre / Mode Clair** : Force l'apparence de l'interface.
    * **Auto** : Laisse votre navigateur ou système d'exploitation choisir suivant vos préférences globales.
* **Couleur d'accentuation** : Personnalisez la couleur des boutons et des menus. 
  > note: Ne pas oublier de cliquer sur le bouton **SAUVEGARDE** sinon la couleur reviendra à celle par défaut lors du prochain chargement.
  

!!! important "Important"

    **Sauvegarde :** Une fois que vous avez passé en revue toutes les options de haut en bas, cliquez sur le bouton **Sauvegarder** pour enregistrer définitivement vos modifications en mémoire.

---
# SÉCURITÉ

Cet onglet vous permet de protéger l'accès à votre interface ESPSomfy-RTS afin d'éviter toute manipulation non autorisée de vos volets ou de la configuration.

<p align="center">
  <img alt="Interface des options de sécurité" src="https://github.com/user-attachments/assets/766e138d-0228-48a1-8975-54a9028f6904" />
</p>


* **Type de sécurité** : 
    * **Aucun** : L'interface est libre d'accès pour toute personne connectée à votre réseau local.
    * **Code PIN** : Un code à 4 chiffres vous sera demandé à chaque ouverture de l'interface.
    * **Mot de passe** : Une authentification complète (Nom d'utilisateur + Mot de passe) sera requise pour accéder au système.

* **Configuration sécurisée uniquement** : Si cette option est activée, l'accès aux commandes de vos volets reste libre, mais toute modification des paramètres (réseau, radio, GPIO) nécessitera une authentification selon la méthode choisie ci-dessus.


!!! important "Important"

    **Validation :** Cliquez sur le bouton **SAUVEGARDER SECURITÉ** pour enregistrer vos modifications. Un message de confirmation (popup) s'affichera pour valider la mise en place de la protection.

---

# FIRMWARE

Cet onglet vous permet de surveiller l'état de santé de votre ESP32, de gérer les mises à jour, de consulter les crédits du projet et de sauvegarder & restaurer vos configurations.

<img alt="Capture d’écran 2026-04-01 à 11 37 30" src="https://github.com/user-attachments/assets/b4ac1ac1-6665-45d1-b081-747bb94ebd2e" />


* **Puce & Processeur** : Modèle d'ESP32 et fréquence de fonctionnement (généralement Dual-Core @ 240 MHz).
* **Mémoire Vive (RAM)** : Affiche la mémoire disponible. 
    * *Niveau Min / Bloc Max* : Informations techniques sur la fragmentation pour diagnostiquer la stabilité.
* **Mémoire Flash** : Affiche l'espace total, disponible et utilisé du stockage de votre appareil ainsi que la vitesse d'horloge du système en MHz.

* **État de mise à jour** : L'interface vous informe de l'état du système via un bandeau de statut coloré, lorsque une mise à jour est disponible, le bandeau prend une couleur rouge et vous indiquera quelle version est disponible
 
     <img width="850" height="57" alt="Capture d’écran 2026-04-01 à 11 37 31" src="https://github.com/user-attachments/assets/63f7ae77-81e8-4602-85db-137e7e4b3c03" />


* **GitHub Mise à jour** : Permet de lancer la mise à jour automatique (Firmware + Application) directement depuis le dépôt **xkain**. Un popup s'affichera pour vous permettre de choisir la version souhaitée.

      <img width="500" alt="Copie d&#39;écran_20260401_114124" src="https://github.com/user-attachments/assets/936f52d5-5e60-4507-8410-de9e598866de" />
  
    | Type | Tag / Nom | État | Utilisation recommandée |
    | :--- | :--- | :--- | :--- |
    | **Stable** | `vX.Y.Z` | 🟢 **Release** | **Officielle.** Testée et validée pour un usage quotidien. |
    | **Bêta** | `vX.Y.Z-PRE` | 🟡 **Pre-release** | **Test.** Pour essayer les correctifs avant la sortie officielle. |
    | **Alpha** | `Main-Experimental` | 🔴 **Experimental** | **Développement.** Code en cours d'écriture, potentiellement instable. | 


  > **ATTENTION** :
  > La version `Main-Experimental` reflète le code en cours de modification. Elle peut contenir des bugs critiques. N'est proposé que pour les ESP32 et ESP32-S3


* **Mise à jour Firmware** : Permet de sélectionner et flasher manuellement le fichier cœur du système (`.bin`) en local.

    <img height="500" alt="Copie d&#39;écran_20260401_122238" src="https://github.com/user-attachments/assets/015880d4-e6fd-4019-9fa3-03cfd92a5be9" />

* **Mise à jour Application** : Permet de sélectionner et mettre à jour uniquement la partition `LittleFs` utilisé principalement pour l'interface web (UI). Idéal pour les corrections graphiques rapides.

    <img height="500" alt="Copie d&#39;écran_20260401_122245" src="https://github.com/user-attachments/assets/60b640d0-163a-4135-ab35-35caeb84bae9" />

* **Vider le cache** : Action indispensable après une mise à jour pour (par exemple) forcer le navigateur à charger la nouvelle interface et éviter les bugs d'affichage, si par cas ça persiste... vider le cache du navigateur
* **Mainteneur du projet** : Lien vers le profil de **xkain**, développeur de cette version.
* **Documentation** : Lien direct vers ce guide de configuration.
* **Crédits Spéciaux** : Hommage à **rstrouse**, créateur du moteur original ESPSomfy-RTS.



## Sauvegarde et restauration
<img  height="720" alt="Copie d&#39;écran_20260401_122249" src="https://github.com/user-attachments/assets/7d4dbec5-94a1-4f5e-bb8f-002ffaa2fecd" />


!!! important "Important"


    * **Sauvegarder** : Ce bouton génère un fichier contenant l'intégralité de votre configuration actuelle. Conservez précieusement ce fichier sur votre ordinateur.
    * **Restaurer** : En cliquant sur ce bouton, une fenêtre popup s'affichera ( image ci-dessus) pour vous permettre de sélectionner votre fichier de sauvegarde. Vous pourrez alors choisir précisément quels éléments vous souhaitez restaurer (réseau, MQTT, Volets, etc.).
