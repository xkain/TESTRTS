<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/TÉLÉCOMMANDE-VIRTUELLE(Virtual-Remote).md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Télécommande virtuelle

La **Télécommande Virtuelle** vous permet d'utiliser l'interface comme une véritable télécommande physique, autorisant des combinaisons de touches et des pressions de différentes durées.

<img  alt="Capture d’écran 2026-03-04 à 23 54 20" src="https://github.com/user-attachments/assets/6fb1ed5b-09a8-4607-b3b5-52cf9b26a07b" />


### Pourquoi utiliser la Télécommande Virtuelle ?
Cet outil est indispensable si vous n'avez aucune télécommande physique sous la main. Il permet de :

* **Appairer un moteur neuf** ou réinitialisé (Factory Reset).
* **Régler les fins de course** du moteur grâce aux combinaisons de touches.
* **Ajouter d'autres télécommandes** physiques à votre installation.
* **Simuler des capteurs** comme les dispositifs Sunis ou Eolis.


### Utilisation de l'interface

1.  **Sélection** : Utilisez le menu déroulant en haut de l'onglet pour choisir le volet que vous souhaitez piloter.
2.  **Pressions longues** : Pour effectuer un appui long (ex: bouton PROG), effectuez un clic long (ou un appui long sur écran tactile) sur le bouton concerné.
3.  **Combinaisons** : Vous pouvez cliquer sur plusieurs boutons simultanément pour envoyer des commandes complexes (ex: Haut + Bas ou bien Bas + My).
4.  **Commandes étendues (80-bit)** : Les commandes spécifiques comme *Step*, *Favorite* ou *Stop* ne s'afficheront que si votre moteur est défini en mode **80 bits** dans ses réglages.

!!! important "Important"

    Assurez-vous d'avoir sélectionné le bon volet avant toute manipulation !


### Scénario : Configuration sans télécommande physique
Si vous partez de zéro avec un moteur vierge :

1. Réinitialisez votre moteur (procédure constructeur).
2. Créez un volet dans l'onglet **Shades** de l'ESPSomfy-RTS.
3. Allez dans **Virtual Remote**, sélectionnez ce volet.
4. Utilisez les boutons virtuels pour réaliser la procédure d'appairage et le réglage des limites comme vous le feriez avec une télécommande Telis ou Situo.

