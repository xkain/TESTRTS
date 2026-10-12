<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/Mise-à-jour-2.6.0.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Mise à jour 2.6.0

## Recommandation de sécurité
Avant de commencer toute manipulation, **n'oubliez pas de créer un fichier de sauvegarde** de votre configuration actuelle depuis l'onglet `firmware` de votre interface. Il est toujours plus sûr d'avoir une copie de vos réglages avant un changement de structure mémoire.

Cette version v3.0.0 embarque une nouvelle structure de la mémoire interne (Table de Partitions). Pour cette raison, vous devez impérativement effectuer cette mise à jour via USB pour installer ce nouveau firmware dans votre ESP32. Les mises à jour OTA (via l'interface) ne fonctionneront pas pour ce passage spécifique, les mises à jour futures pourront se faire à nouveau depuis l'interface.  

Nous profitons donc de cette cassure de rétrocompatibilité pour inclure une nouvelle structure pour les fichiers binaire 


## Prérequis

* Un ordinateur avec **Google Chrome** ou **Microsoft Edge** (Safari et Firefox supportent mal la technologie Web Serial nécessaire).
* Un **câble USB** (assurez-vous qu'il permet le transfert de données).
* Le fichier `.bin` de la version correspondant à votre carte téléchargée depuis la page **Latest Release**.



## Avant de commencer

* Vous devez télécharger la pre-release `v2.6.0` sur le GitHub. Pour ce faire, dans la section **Assets**, ne sélectionnez que la version `onboard` correspondant à votre ESP32.
<img height="400" alt="Copie d&#39;écran_20260503_223540" src="https://github.com/user-attachments/assets/51431f92-0c4d-4ea1-ae82-21cc32131880" />

> **Pourquoi utiliser le .onboard.bin ?**
> Comme nous déplaçons physiquement l'emplacement du système de fichiers et du programme, l'image "onboard" est la méthode la plus "propre". Elle écrase l'intégralité de la puce pour s'assurer que la nouvelle table de partitions est appliquée correctement dès le premier démarrage.

* **Si vous avez acheté un boîtier sur Leboncoin :** choisissez le fichier `SomfyController.onboard.esp32.bin.zip`.
* Une fois téléchargé, **décompressez le fichier ZIP** sur votre ordinateur pour obtenir le fichier `SomfyController.onboard.esp32.bin`.
* Vous êtes maintenant prêt pour flasher votre ESP32.



## Instructions étape par étape

1. **Connectez votre ESP32** à votre ordinateur à l'aide du câble USB.
2. Ouvrez le site suivant dans votre navigateur (Chrome ou Edge) : [**https://web.esphome.io/**](https://web.esphome.io/)
3. Cliquez sur le bouton bleu **"CONNECT"**.
    <img height="600" alt="Copie d&#39;écran_20260503_223829" src="https://github.com/user-attachments/assets/82252f39-04e8-474b-85f2-5020fd782360" />

4. Une fenêtre s'ouvre : sélectionnez votre ESP32 dans la liste (souvent nommé `USB Single Serial`, `CP210x` ou `CH340`) et cliquez sur **"Connexion"**.
    * *Si aucun port n'apparaît, vérifiez votre câble ou installez les pilotes (drivers) CH340/CP210x.*
        <img height="600" alt="Copie d&#39;écran_20260503_223907" src="https://github.com/user-attachments/assets/64f2faff-87f9-4175-8b38-31f2216a23ff" />

5. Une fois connecté, cliquez sur le bouton **"INSTALL"**.
    <img height="600" alt="Copie d&#39;écran_20260503_223924" src="https://github.com/user-attachments/assets/dac816e9-e66e-450d-bf0f-dfbaa2b11c81" />

6. Une boîte de dialogue s'ouvre : cliquez sur **"Choisir un fichier"** et sélectionnez le fichier `.bin` que vous avez décompressé précédemme
    <img height="600" alt="Copie d&#39;écran_20260503_223955" src="https://github.com/user-attachments/assets/db221584-f69a-4712-ae15-26dea7cf4794" />
nt.

7. Cliquez sur **"INSTALL"** (à nouveau) pour lancer le flashage.
8. **Patientez** : une barre de progression indique l'avancée. **Ne fermez pas la page et ne débranchez pas le câble** avant la fin du processus (100%).
    <img height="600" alt="Copie d&#39;écran_20260503_224022" src="https://github.com/user-attachments/assets/d968653c-1f7b-4186-8d2a-9e900f7d1250" />


9. Une fois terminé, un message de succès s'affiche. Vous pouvez cliquer sur **"LOGS & CONSOLE"** pour voir votre boîtier démarrer.


## Après le flashage

Une fois le boîtier redémarré :

1. Connectez-vous au hotspot Wi-Fi `ESPSomfy-RTS` puis aller a l'adresse http://192.168.4.1/
2. **Important :** Si l'interface semble incomplète ou ne s'affiche pas correctement, faites un rafraîchissement forcé de votre navigateur (appuyez sur **CTRL + F5** sur Windows ou **Cmd + Shift + R** sur Mac).

!!! important "Important"

    Si vous avez acheté mon boîtier sur Leboncoin, vous devrez reassigner les GPIO dans l'onglet `Radio`.
    Choisissez simplement `CC1101 - ESP32-D1` , activer le Switch et enregistrer.

    <img height="395" alt="Copie d&#39;écran_20260504_111847" src="https://github.com/user-attachments/assets/05627ba8-0b2b-4ca6-af40-f9c5ba8b00ee" />




## Note sur la restauration et l'avenir

Cette pré-version `v2.6.0` corrige un bug critique qui pouvait faire échouer la restauration à cause d'un calcul de taille incorrect dans l'en-tête du fichier (Header). 

* **Plus de problème à l'avenir :** Ce correctif garantit que vos fichiers de sauvegarde seront parfaitement compatibles avec toutes les futures versions. Une fois passé en `v2.6.0`, vous n'aurez plus à vous soucier de ce problème.

!!! important "Important"

    Si votre ancienne sauvegarde refuse de se charger, n'hésitez pas à [ouvrir une issue](https://github.com/xkain/ESPSomfy-RTS/issues). Nous pourrons analyser votre fichier et l'éditer manuellement pour  qu'il soit à nouveau fonctionnel.



