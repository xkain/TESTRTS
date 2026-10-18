# Répéteurs (Repeaters)

L'ESPSomfy-RTS inclut une fonction de répétition de signal. L'appareil "écoute" les trames radio de vos télécommandes physiques et les réémet instantan

<img width="100%" src="../img/repeteur-repeaters-1-clair.webp#only-light" /><img width="100%" src="../img/repeteur-repeaters-1-sombre.webp#only-dark" />

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
2.  **Lancer le scan** : Cliquez sur le bouton `CHERCHER TÉLÉCOMMANDE` (*Scan Remote*).
3.  **Capture** : L'assistant s'affiche. Appuyez sur n'importe quel bouton de votre télécommande physique.

    <img width="500" src="../img/repeteur-repeaters-2-clair.webp#only-light" /><img width="500" src="../img/repeteur-repeaters-2-sombre.webp#only-dark" />

4.  **Confirmation** : Dès que le signal est entendu, l'assistant se ferme et l'adresse de la télécommande est ajoutée à la liste des répéteurs actifs.

    <img width="500" src="../img/repeteur-repeaters-3-clair.webp#only-light" /><img width="500" src="../img/repeteur-repeaters-3-sombre.webp#only-dark" />

