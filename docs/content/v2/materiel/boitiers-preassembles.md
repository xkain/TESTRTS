# Boîtiers officiels

## À qui s'adresse cette page ?

**Utilisateurs ciblés :** Cette page d'aide et l'utilitaire associé s'adressent **exclusivement** aux personnes ayant acheté l'un de [mes boîtiers préassemblés](https://www.leboncoin.fr/profile/77a39e2a-ddb5-44c8-828a-954652c46ee7). 

!!! note "Note"

    Les boîtiers étant exclusivement vendus en France, toutes les références à la vente du matériel et à l'utilitaire de préconfiguration ne sont visibles dans l'interface ESPSomfy-RTS que si celle-ci est configurée en **Français**. Si vous utilisez une autre langue, ces éléments n'apparaîtront pas afin de ne pas surcharger inutilement l'interface pour les personnes non concernées.

## 📦 Spécifications du Matériel

<div class="rts-editions rts-editions--row" markdown>

<div class="rts-edition" markdown>

### Édition Wi-Fi

<div class="rts-photo" markdown>

![Boîtier Édition Wi-Fi](v2/img/boitiers-preassembles-1)

<div class="rts-photo__thumbs" markdown>

![Boîtier Wi-Fi, façade en treillis](boitiers/img/boitiers-officiels-1){ .on-glb }
![Boîtier Wi-Fi, façade en vagues](boitiers/img/boitiers-officiels-2){ .on-glb }
![Boîtier Wi-Fi, façade à fentes obliques](boitiers/img/boitiers-officiels-3){ .on-glb }
![Boîtier Wi-Fi, façade à motifs triangulaires](boitiers/img/boitiers-officiels-4){ .on-glb }
![Boîtier Wi-Fi, façade lisse](boitiers/img/boitiers-officiels-5){ .on-glb }

</div>

</div>

- ESP32 D1 Mini
- E07-M1101D-SMA (CC1101)
- Pont USB-série CP2102, présent sur la carte D1 Mini
- Antenne 3dBi (amovible)
- PCB développé sur mesure
- Assignation GPIO : [Voir détails](../../commun/composants.md#esp32-d1-mini)
- 💾 **Flash ultra-simple :** Se branche et se flashe directement en USB-C sans manipulation requise.

</div>

<div class="rts-edition" markdown>

### Édition Ethernet & Wi-Fi

<div class="rts-photo" markdown>

![Boîtier Édition Ethernet & Wi-Fi](v2/img/boitiers-preassembles-2)

<div class="rts-photo__thumbs" markdown>

![Boîtier Ethernet & Wi-Fi, façade à croix gravée](boitiers/img/boitiers-officiels-6){ .on-glb }

</div>

</div>

- ESP32 WT32-ETH01
- E07-M1101D-SMA (CC1101)
- Pont USB-série CH340N SOP8 : un module séparé, soudé sur le PCB, le WT32-ETH01 n'ayant pas d'USB
- Antenne 3dBi (amovible)
- PCB développé sur mesure
- Assignation GPIO : [Voir détails](../../commun/composants.md#wt32-eth01)
- 💾 **Flash matériel :** Équipé d'un bouton-poussoir discret en face inférieure pour basculer en mode flash au branchement USB-C.

</div>

</div>

!!! note "Note"

    Utilisez de **préférence** un chargeur de téléphone standard pour l’alimentation (évitez les chargeurs de moins de 1A). Pour les boîtiers Ethernet & Wi-Fi (comme le WT32-ETH01), utilisez un chargeur stable et de bonne qualité d'au moins 1,5A. Ce composant supporte très mal les micro-coupures et sous-tensions, au risque d'être dégradé de manière permanente, l'utilisation d'un petit onduleur pourrait facilement vous éviter ce genre de problème. <br>
    Vous pouvez également brancher sur n’importe quel appareil disposant d’un port USB (ex : Box / TV / PC).


## 🛠️ L'Assistant de Configuration Automatique

### À quoi sert cet utilitaire ?
Par défaut, le firmware d'origine prévoit des réglages universels. Les boîtiers que je vous envoie sont **déjà entièrement préconfigurés et testés** avant expédition. Vous n'avez donc strictement rien à faire lors du premier branchement.

Cependant, cet utilitaire devient indispensable dans deux situations :

1. Après une mise à jour si, par hasard, certains paramètres système ont été réinitialisés.
2. Après un [Factory Reset](../maintenance/factory-reset.md) (remise à zéro totale) de votre boîtier.

Dans le cas d'un Factory Reset complet, votre matériel repasse avec les configurations d'usine par défaut (interface en anglais, fuseau horaire Etc/UTC, broches GPIO de la radio non configurées). L'assistant applique alors tous les réglages régionaux (langue française, heure Europe/Paris), injecte la configuration matérielle exacte de votre boîtier (assignation des GPIO pour le module CC1101) et active le module radio.

### Comment l'utiliser ?
L'opération est d'une simplicité enfantine : il vous suffit de sélectionner le bon modèl de boîtier et cliquer sur le bouton `DÉMARRER`. L'assistant valide chaque étape, enregistre les paramètres en tâche de fond, puis recharge automatiquement la page. ESPSomfy-RTS est maintenant préconfiguré pour votre boîtier !


<img width="800px" alt="Capture d&#39;écran_20260528_112324" src="../img/boitiers-preassembles-3-clair.webp#only-light" /><img width="800px" alt="Capture d&#39;écran_20260528_112324" src="../img/boitiers-preassembles-3-sombre.webp#only-dark" />


## Où trouver l'assistant ?

Pour vous faciliter l'accès, l'utilitaire est disponible à deux endroits différents dans l'interface :

### 1. Directement sur la page d'accueil
Tout en bas de la page d'accueil (uniquement visible lorsqu'aucune pièce, aucun équipement et aucun groupe n'ont encore été créés), un encadré vous invite à ouvrir l'utilitaire si vous possédez l'un de mes boîtiers.

<img width="800" src="../img/boitiers-preassembles-4-clair.webp#only-light" /><img width="800" src="../img/boitiers-preassembles-4-sombre.webp#only-dark" />

### 2. Dans l'onglet **Options**
Si votre tableau de bord est déjà configuré, pas de panique : vous trouverez également un bouton dédié et très explicite dans l'onglet **Options** pour lancer l'utilitaire à tout moment.

<img width="800" src="../img/boitiers-preassembles-5-clair.webp#only-light" /><img width="800" src="../img/boitiers-preassembles-5-sombre.webp#only-dark" />

### Spécificités pour les boîtiers Ethernet & Wi-Fi

Si vous possédez l'Édition Ethernet, l'assistant s'occupe de presque tout, mais deux étapes importantes restent à votre charge :

1. **Configuration du Wi-Fi:** Pour que le Secours Wi-Fi fonctionne, il vous faut en amont configurer votre réseau Wi-Fi **Cette étape est très fortement conseillée !** 
2. **Activation du Secours Wi-Fi :** Il est vivement conseillé d'activer l'option `Secours Wi-Fi`, en cas de déconnexion ou de problème avec votre câble Ethernet, le boîtier basculera automatiquement sur votre Wi-Fi pour garantir la continuité du service.
3. **Sélection du type de carte :** Dans les paramètres réseau, vous devez impérativement sélectionner le type de carte **`WT32-ETH01 - Wireless Tag`** pour que la puce Ethernet soit correctement initialisée.

<img width="800" src="../img/boitiers-preassembles-6-clair.webp#only-light" /><img width="800" src="../img/boitiers-preassembles-6-sombre.webp#only-dark" />

!!! important "Important"

    **Attention au choix de la carte :** Veillez à sélectionner rigoureusement le modèle **`WT32-ETH01 - Wireless Tag`**. Choisir un autre type de carte appliquerait une mauvaise assignation des broches (GPIO). En raison des conflits électriques que cela peut engendrer sur les lignes de communication de la puce réseau, **un mauvais paramétrage risque d'endommager le matériel de façon permanente.**
<br>
<br>

---

## Un grand merci pour votre soutien !

Avant toute chose, je tenais à vous remercier d'avoir acheté l'un de mes boîtiers. En faisant ce choix, **vous soutenez directement mon travail de développement**. 

C'est grâce à votre confiance et à votre contribution que je peux passer du temps à faire avancer ce projet open-source. **Merci à vous !**
