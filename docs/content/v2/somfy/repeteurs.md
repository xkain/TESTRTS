<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/RÉPÉTEUR-(Repeaters).md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Répéteurs (Repeaters)

L'ESPSomfy-RTS inclut une fonction de répétition de signal. L'appareil "écoute" les trames radio de vos télécommandes physiques et les réémet instantan

<img alt="Capture d’écran 2026-03-04 à 21 16 56" src="https://github.com/user-attachments/assets/e8f992dd-3ed7-49c0-b7f2-14dd142b8a12" />
ément pour étendre leur portée.


### Pourquoi utiliser le Répéteur ?
Cette fonction est utile lorsqu'une télécommande physique est située trop loin d'un volet pour l'actionner directement. L'ESPSomfy-RTS capte le signal et le renvoie avec la puissance de sa propre radio, servant ainsi de "pont" entre la télécommande et le moteur.

### ⚙️ Fonctionnement technique

* **Analyse de trame** : À chaque réception, l'ESPSomfy-RTS vérifie si l'adresse source figure dans sa liste de répéteurs.
* **Moment de silence** : Pour éviter les collisions radio (deux émetteurs parlant en même temps), le système attend un bref instant de silence radio après la fin de l'émission originale avant de répéter la trame.
* **Portée** : La portée de l'ESPSomfy-RTS étant généralement supérieure à celle d'une petite télécommande, le signal répété atteint plus facilement les moteurs cibles.


### ⚠️ Précautions et Limitations
L'utilisation de répéteurs augmente le trafic radio. Un usage excessif peut saturer la bande de fréquence 433 MHz.

!!! danger "Attention"

    **Risque de boucle infinie (Infinite Loop) :**
    Si vous possédez plusieurs appareils ESPSomfy-RTS, **ne configurez jamais la même télécommande comme répéteur sur plus d'un appareil**. 
    Les appareils se renverraient le signal mutuellement à l'infini (A répète vers B, B répète vers A, etc.), paralysant totalement votre installation radio. **Une télécommande = Un seul appareil répéteur.**


###  Configurer un Répéteur

La procédure est automatisée grâce à la fonction de scan :

1.  **Accès** : Allez dans la section `Somfy` > Onglet `Repeaters`.
2.  **Lancer le scan** : Cliquez sur le bouton **CHERCHER TÉLÉCOMMANDE** (*Scan Remote*).
3.  **Capture** : L'assistant s'affiche. Appuyez sur n'importe quel bouton de votre télécommande physique.

    <img alt="Copie d&#39;écran_20260304_211703" src="https://github.com/user-attachments/assets/069700fd-e024-4b96-b043-9e353e19e055" />

4.  **Confirmation** : Dès que le signal est entendu, l'assistant se ferme et l'adresse de la télécommande est ajoutée à la liste des répéteurs actifs.

    <img alt="Copie d&#39;écran_20260304_211624" src="https://github.com/user-attachments/assets/67547532-da60-476f-998c-8dac11aa8dd1" />

