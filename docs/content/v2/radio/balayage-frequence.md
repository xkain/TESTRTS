<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/Balayage-de-Fréquence.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Balayage de fréquence

Le **balayage de fréquence** mesure la fréquence réelle d'une télécommande. C'est l'outil à
utiliser quand une télécommande n'apparaît pas dans les [Journaux Radio](journaux.md) et que
vous soupçonnez un écart de calage — voir
[la règle qui décide si une télécommande est entendue](configurer.md#la-règle-qui-décide-si-une-télécommande-est-entendue).

On l'ouvre depuis le sous-onglet **Radio**, avec le bouton **`SCANNER`**. Une fenêtre
**Balayage Radio** s'affiche : *« Analysez les fréquences environnantes pour identifier et
configurer vos équipements radio. »*

<p align="center">
<img width="500" alt="Interface du Scanner Radio" src="https://github.com/user-attachments/assets/e03c593b-bb81-438b-bfe9-947c40b8a65d" />
</p>

---

# Procédure

1. Cliquez sur **`DÉMARRER LE BALAYAGE`**. L'appareil parcourt la bande **433,00 → 434,00 MHz**
    par pas de 100 kHz, soit une passe complète en **un peu plus de 10 secondes**, et recommence.
2. Quand le balayage croise la fréquence de la télécommande, un **pic** apparaît sur le graphique
    et la fréquence s'affiche (par exemple `433,19 MHz`), accompagnée du RSSI.
3. Cliquez sur **`ARRÊTER LE BALAYAGE`**.
4. Cliquez sur **`DÉFINIR LA FRÉQUENCE`** pour injecter la valeur mesurée dans le champ
    **Fréquence de base** du sous-onglet Radio.
5. **Indispensable :** cliquez sur **`ENREGISTRER`** en bas du sous-onglet Radio. Sans cela, rien
    n'est mémorisé.

!!! important "Important"

    **N'attendez pas que ça marche du premier coup, et ne cherchez pas à maintenir le bouton jusqu'à
    la fin du balayage : c'est matériellement impossible.** Le balayage ne traverse la fréquence de
    votre télécommande que pendant **environ 1,6 seconde par passe de 10 secondes** — les 85 % du
    temps restant, votre émission est perdue. Et une télécommande Somfy ou générique **cesse d'émettre
    au bout de 10 à 15 secondes** de bouton maintenu, par sécurité.

    La bonne méthode : appuyez, maintenez 10 secondes, relâchez, recommencez aussitôt. Une absence
    de pic ne signifie pas que votre télécommande est hors de portée, seulement qu'on ne l'a pas
    encore croisée.

!!! tip "Astuce"

    **Ne collez pas la télécommande contre l'antenne.** À bout touchant, le récepteur sature et le
    pic s'étale sur toute la bande, ce qui rend la mesure inutilisable. Un à deux mètres est la
    bonne distance.

---

# Lire le résultat honnêtement

La valeur que le firmware retient est le **sommet du pic**. Or ce sommet est plat, et c'est la
principale limite de l'outil, mesurée sur banc :

* Sur **cinq passes consécutives**, pour une télécommande parfaitement immobile, la valeur
    retenue s'étale sur **40 kHz** (de 433,190 à 433,230 MHz). Le sommet du pic est plat sur près
    de 70 kHz : il n'y a pas de maximum franc à trouver.
* Les **flancs**, en revanche, sont nets : le signal chute de 12 dB en un seul pas.

**Ce qu'il faut en retenir :** ne traitez pas le chiffre affiché comme une mesure au kilohertz
près. Considérez-le comme une **estimation à ± 20 kHz**, ce qui est amplement suffisant pour
l'usage qu'on en fait : décider dans quelle fenêtre d'écoute se placer.

!!! tip "Astuce"

    **Pour une mesure plus fiable, regardez le graphique plutôt que le chiffre.** Repérez le premier
    et le dernier pas où le signal décolle, et prenez le **milieu** de cet intervalle. Cette
    estimation-là est **quatre fois plus répétable** que le sommet : elle ne varie que de 10 kHz
    d'une passe à l'autre, ce qui est simplement son propre pas de quantification.

---

# Comprendre le signal (RSSI)

La fenêtre de balayage affiche, sous le graphique, un rappel de l'échelle du RSSI et de ce que
chaque palier signifie. C'est la même échelle que partout ailleurs dans l'interface, détaillée
dans [Interpréter la qualité du signal](configurer.md#interpréter-la-qualité-du-signal-rssi).

Ici, le RSSI ne sert pas à juger la qualité d'une liaison mais à **repérer le pic** : ce qui
compte est moins sa valeur absolue que son écart avec les pas voisins. Un pic qui ne dépasse le
bruit de fond que de 2 ou 3 dB n'est pas exploitable — rapprochez-vous et recommencez.

---

# Et ensuite ?

Mesurer une fréquence ne règle rien par soi-même. Ce qui compte, c'est la fenêtre dans laquelle
vous allez vous placer, et elle doit convenir à **toutes** vos télécommandes à la fois.

Prenez donc la mesure de chacune avant de décider, puis reportez-vous à
[Accorder la radio](configurer.md#accorder-la-radio), et en particulier à l'exemple
[« 6 équipements sur 8 répondent »](configurer.md#exemple--6-équipements-sur-8-répondent)
qui déroule le calcul complet.

!!! warning "Avertissement"

    **Attention au réflexe « je mesure, je définis, j'enregistre ».** Si vous cliquez sur
    `DÉFINIR LA FRÉQUENCE` après avoir mesuré une seule télécommande, vous recentrez la radio sur
    celle-là — et vous risquez de perdre toutes les autres, ainsi que l'émission vers les moteurs
    qui fonctionnaient. Mesurez d'abord, décidez ensuite.

---

**Pages liées :** [Configurer la Radio](configurer.md) · [Journaux Radio](journaux.md)

