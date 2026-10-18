# Configurer la radio

Le module **CC1101** est l'émetteur-récepteur 433 MHz qui parle à vos équipements Somfy. Cette
page couvre le sous-onglet **Radio**, où l'on déclare le câblage puis où l'on accorde la radio.

| Page | À quoi elle sert |
|---|---|
| **Radio** *(cette page)* | Activer la radio, déclarer les broches, accorder la fréquence. |
| **[Journaux Radio](journaux.md)** | Voir en direct les trames reçues : le tableau de bord du diagnostic. |
| **[Balayage de Fréquence](balayage-frequence.md)** | Mesurer la fréquence réelle d'une télécommande. Outil lancé depuis cette page. |

<img width="100%" src="../img/configurer-la-radio-1-clair.webp#only-light" /><img width="100%" src="../img/configurer-la-radio-1-sombre.webp#only-dark" />

!!! tip "Astuce"

    **Utilisateurs du boîtier :** si vous avez acheté l'un de mes boîtiers ESPSomfy-RTS prêt à l'emploi, la
    configuration est simplifiée au maximum. La radio est déjà activée et le profil GPIO est
    pré-configuré :

    * Boîtier Wi-Fi : `ESP32-D1 mini`
    * Boîtier Ethernet & Wi-Fi : `WT32-ETH01`

    **Votre seule étape consiste à ajuster le `protocole`, le `bit` et la fréquence si nécessaire.**

---

# Protocoles et valeurs par défaut

Ces réglages définissent les paramètres appliqués **par défaut** lors de l'ajout de tout nouvel
équipement, sans affecter ceux déjà enregistrés.

* **Radio** : désactivée par défaut, pour vous laisser valider vos broches GPIO avant la mise en
    service. L'état affiché sous l'interrupteur vous dit où vous en êtes : *La radio est activée*,
    *La radio est désactivée*, ou *Sauvegardez pour appliquer le changement* si vous venez de
    basculer l'interrupteur sans enregistrer.
* **Protocole** : **RTS** (standard), **RTW** ou **RTV**.
* **Bit** : **56-BIT** pour le RTS, **80-BIT** disponible selon vos équipements.

!!! tip "Astuce"

    Vous ne savez pas quel protocole choisir ? Ne devinez pas : manipulez votre télécommande
    d'origine et lisez la colonne **Bits** dans les
    [Journaux Radio](journaux.md#identifier-le-protocole-colonne-bits). Le suffixe affiché
    (`-S`, `-W`, `-V`) vous donne la réponse exacte.

!!! danger "Attention"

    **Utilisateurs Ethernet :** assurez-vous qu'aucune broche radio n'est partagée avec votre
    module Ethernet (PHY). Rien dans l'interface ne vous avertira d'un tel conflit, et le résultat
    peut aller de l'Ethernet qui ne monte pas à la "destruction" des composants.

---

# Assignation GPIO

La liste déroulante **Assignation GPIO** déclare comment votre CC1101 est câblé à l'ESP32. Deux
cas : un **profil** prêt à l'emploi, ou la **configuration manuelle**.

## Les profils prêts à l'emploi

Choisir un profil remplit les six broches et **masque les champs détaillés** : il n'y a rien
d'autre à faire. La liste ne propose que les profils compatibles avec la puce détectée.

### Par défaut (auto-détection)

**C'est l'option recommandée**, et celle qui est active au départ. L'appareil identifie votre
chipset et applique les broches standards correspondantes — vous n'avez aucun numéro à saisir.

<details markdown="1">
<summary>👉 Les broches retenues selon votre puce (Standard, S2, S3, C3)</summary>

| CC1101 | ESP32 Standard | ESP32-S2 | ESP32-S3 | ESP32-C3 |
|---|---|---|---|---|
| SCLK | GPIO18 | GPIO36 | GPIO12 | GPIO15 |
| CSN | GPIO05 | GPIO34 | GPIO10 | GPIO14 |
| MOSI | GPIO23 | GPIO35 | GPIO11 | GPIO16 |
| MISO | GPIO19 | GPIO37 | GPIO13 | GPIO17 |
| GDO0 (TX) | GPIO13 | GPIO15 | GPIO15 | GPIO13 |
| GDO2 (RX) | GPIO12 | GPIO14 | GPIO14 | GPIO12 |

*ESP32 Standard = WROOM, WROVER, Devkit C/V1.*

</details>

> Vérifiez malgré tout que votre modèle correspond bien à ces GPIO avant de câbler.

### Les profils de carte

Si votre carte figure dans cette liste, la choisir vous évite toute saisie.

| Profil | SCLK | CSN | MOSI | MISO | TX (GDO0) | RX (GDO2) |
|---|---|---|---|---|---|---|
| ESP32-D1 mini | 18 | 5 | 23 | 19 | 21 | 22 |
| WT32-ETH01 | 14 | 12 | 15 | 4 | 2 | 35 |
| Olimex ESP32-PoE/EVB | 14 | 13 | 15 | 16 | 4 | 36 |
| LilyGO T-Internet POE | 14 | 12 | 15 | 16 | 4 | 35 |
| wESP POE | 18 | 5 | 13 | 32 | 4 | 39 |
| ESP-PoE-32 | 14 | 5 | 13 | 32 | 4 | 35 |
| ESP32s3 Mini | 7 | 6 | 9 | 8 | 3 | 4 |
| XIAO-ESP32-C3 | 8 | 6 | 10 | 9 | 3 | 4 |
| ESP32c3 SuperMini | 4 | 7 | 6 | 5 | 21 | 20 |

## Définir manuellement (utilisateur avancé)

Cette option sert si votre carte n'est pas dans la liste, ou si vous avez câblé sur des broches
non standards. Elle remplace les listes déroulantes par des **champs libres** : vous pouvez y
saisir n'importe quel numéro de broche, y compris une broche qui n'existe pas ou qui est déjà
occupée. C'est précisément ce qui la rend risquée, et pourquoi l'interface pose **deux garde-fous
successifs**.

<img width="800" alt="Sélecteur GPIO" src="../img/configurer-la-radio-2-clair.webp#only-light" /><img width="800" alt="Sélecteur GPIO" src="../img/configurer-la-radio-2-sombre.webp#only-dark" />

### 1. L'interrupteur de sécurité

En passant en mode manuel, un interrupteur apparaît sous les six champs :

> **« Je comprends les risques d'une mauvaise configuration des GPIO. »**

Il n'applique aucun réglage : il **débloque simplement l'enregistrement**. Tant qu'il est sur
Arrêt, le bouton `ENREGISTRER` refuse d'écrire et affiche *« L'activation du switch de sécurité
est requise pour enregistrer la configuration manuelle des GPIO. »* Son seul rôle est de garantir
que personne ne saisit des broches au hasard sans avoir lu l'avertissement.

Cet interrupteur ne concerne **que** le mode manuel : avec un profil, il n'apparaît pas et
l'enregistrement se fait directement.

### 2. La demande de confirmation

Une fois l'interrupteur activé, `ENREGISTRER` ouvre une dernière question :

> **Êtes-vous sûr de vos réglages manuels ?**
> *Des broches GPIO incorrectes peuvent provoquer le plantage ou le redémarrage en boucle de
> votre ESP32.*

Répondre **Non** annule sans rien écrire. Répondre **Oui** enregistre et applique la
configuration.

!!! danger "Attention"

    Le redémarrage en boucle n'est pas une formule de style : une broche réservée au démarrage de
    l'ESP32 ou partagée avec la puce Ethernet peut rendre l'appareil inaccessible, et la seule
    issue est alors un reflashage par USB. Relisez les six numéros avant de confirmer.

!!! note "Note"


    * **Interface SPI :** **SCLK, CSN, MOSI et MISO** doivent correspondre exactement au câblage
        physique. Si le message *« La radio est désactivée »* ou l'icône radio barrée de rouge
        persiste, vérifiez ces quatre broches en priorité.
    * **GDO0 / GDO2 :** l'émission (TX) passe **obligatoirement** par GDO0. La réception (RX) peut
        se faire sur GDO0 ou GDO2.
    * **Mode multiplexé :** économisez une broche en reliant uniquement GDO0 et en
        mettant le même numéro de GPIO en RX et en TX. L'appareil commute la fonction tout seul.
        Particulièrement utile sur les cartes Ethernet, où les broches libres sont rares — voir
        [Composants → Configuration des Broches](../../commun/composants.md#configuration-des-broches-pins).
    * **Diagnostic express :** si le RSSI s'agite mais qu'aucune trame n'apparaît dans les
        journaux, vos broches RX et TX sont probablement inversées.

---

# Accorder la radio

C'est l'étape qui décide si vos télécommandes sont entendues et si vos moteurs obéissent. Elle
mérite d'être comprise avant d'être tentée au hasard.

<p align="center">
  <img alt="Interface Radio Complète" src="../img/configurer-la-radio-3-clair.webp#only-light" width="800" /><img alt="Interface Radio Complète" src="../img/configurer-la-radio-3-sombre.webp#only-dark" width="800" />
</p>

Les curseurs servent aux ajustements globaux, les boutons **<** **>** à la précision fine, et les
sélecteurs `1` `10` `100` définissent le pas d'incrémentation.

## Qui fait quoi

| Réglage | Plage | Défaut | Ce qu'il gouverne réellement |
| :--- | :--- | :--- | :--- |
| **Fréquence de base** | 433,000 → 434,399 MHz | **433,420 MHz** | La fréquence centrale, utilisée **à la fois en réception et en émission**. Le seul réglage qui agisse sur l'émission. |
| **Largeur de bande RX** | 58,03 → 812,50 kHz | **99,97 kHz** | La largeur de la fenêtre d'écoute, **en réception uniquement**. |
| **Déviation de fréquence** | 1,58 → 380,85 kHz | **47,60 kHz** | **Aucun effet sur la réception** — voir l'encadré ci-dessous. |
| **TX Puissance** | −30 → 12 dBm | **10 dBm** | La puissance d'émission. À 10 dBm la portée dépasse déjà largement celle d'une télécommande Somfy. |

!!! important "Important"

    **La déviation ne joue aucun rôle en réception.** C'est contre-intuitif, et l'infobulle de
    l'interface laisse encore croire le contraire, mais c'est mesuré : à largeur de bande
    identique, une même télécommande maintenue a donné **68 trames décodées à 47,60 kHz de
    déviation, et 68 trames décodées à 380,85 kHz** — le maximum de la puce — avec un RSSI
    identique.

    La raison est dans la modulation : la radio fonctionne en **ASK/OOK**, c'est-à-dire que la
    porteuse est simplement allumée ou éteinte. Le CC1101 n'est qu'un détecteur d'enveloppe, et
    c'est le logiciel qui mesure la durée des impulsions. La déviation n'aurait de sens qu'en
    2-FSK, où deux tons distincts doivent tenir dans le filtre.

    **En pratique : laissez la déviation sur sa valeur par défaut.** La toucher ne réparera pas une
    réception, et ne la cassera pas davantage.

    Son effet en **émission**, en revanche, n'a pas encore été établi. C'est la raison pour laquelle
    le réglage reste présent dans l'interface : tant que la question n'est pas tranchée, le retirer
    serait prématuré.

## La règle qui décide si une télécommande est entendue

Une télécommande n'est décodée que si sa fréquence tombe dans la fenêtre d'écoute :

> **| fréquence de la télécommande − Fréquence de base | ≤ Largeur de bande RX ÷ 2**

C'est tout. Deux conséquences pratiques :

* **Aux valeurs d'usine** (433,420 MHz et 99,97 kHz), la fenêtre va de **433,370 à 433,470 MHz**,
    soit ± 50 kHz. Une télécommande qui a dérivé à 433,19 MHz est à 230 kHz : elle est muette, quoi
    que vous fassiez d'autre.
* **Au maximum de largeur de bande** (812,50 kHz), la fenêtre couvre **433,014 à 433,826 MHz**.
    Presque toutes les télécommandes Somfy du marché y entrent, au prix d'un peu plus de bruit.

!!! tip "Astuce"

    La largeur de bande est votre outil de **diagnostic gratuit** : l'élargir au maximum ne risque
    rien et ne coûte qu'un peu de sensibilité. Si une télécommande muette se met à apparaître dans
    les journaux dès que vous élargissez, le problème est un **calage de fréquence**, pas un
    problème de matériel ni de câblage. Vous venez d'éliminer la moitié des hypothèses en une
    manipulation.

!!! warning "Avertissement"

    **L'émission, elle, ne connaît pas la largeur de bande.** Il n'existe aucun réglage de bande en
    émission : l'appareil émet sur la **Fréquence de base**, un point c'est tout. Élargir la bande
    répare la réception d'une télécommande, mais ne fera jamais obéir un moteur dont le récepteur
    est calé ailleurs. Pour l'émission, seule compte la fréquence centrale.

## Procédure de réglage

1. **Partez des valeurs d'usine.** Fréquence de base `433,420 MHz`, Largeur de bande `99,97 kHz`.
    Enregistrez. Si tout fonctionne, arrêtez-vous là : il n'y a rien à optimiser.
2. **Testez à 1 mètre.** Ouvrez les [Journaux Radio](journaux.md), prenez une télécommande et
    appuyez. Une ligne doit apparaître.
3. **Relevez le RSSI.** Plus il est proche de 0, mieux c'est — voir
    [Interpréter le RSSI](#interpréter-la-qualité-du-signal-rssi). Un bon module type E07-M1101D
    peut descendre à −32 dBm à cette distance, un module standard tournera plutôt vers −60 dBm.
4. **Faites le tour de toutes vos télécommandes**, une par une, avant de conclure. C'est là que
    les écarts se révèlent.
5. **Si l'une reste muette**, élargissez la bande au maximum pour confirmer qu'il s'agit bien d'un
    écart de fréquence, puis mesurez sa fréquence réelle avec le
    [Balayage de Fréquence](balayage-frequence.md).

!!! tip "Astuce"

    **Emplacement :** ne placez jamais l'appareil sur un micro-ondes ni à proximité immédiate d'un
    routeur Wi-Fi (laisser au moins deux mètres) ou d'une alimentation à découpage. Le bruit qu'ils
    produisent masque le signal de vos équipements et aucun réglage ne compensera un mauvais
    emplacement.

## Exemple : 6 équipements sur 8 répondent

Voici le cas typique, et la façon de le dénouer.

**La situation.** Huit équipements enregistrés. Six fonctionnent parfaitement. Les deux derniers
ne bougent pas, et surtout : **quand on appuie sur leur télécommande d'origine, rien n'apparaît
dans les journaux**.

**Ce que ce symptôme dit déjà.** Six équipements qui répondent prouvent que le câblage, les
broches et le module sont bons. Le problème n'est donc ni matériel ni logiciel : il est
**fréquentiel**, et il ne concerne que ces deux-là. Les télécommandes Somfy vieillissent, et leur
quartz dérive — deux télécommandes d'un même lot peuvent se retrouver à 200 kHz l'une de l'autre
après quelques années.

**Étape 1 — Confirmer l'hypothèse.** Poussez la **Largeur de bande RX** au maximum (`812,50 kHz`),
enregistrez, puis réappuyez sur les deux télécommandes récalcitrantes.

* *Des trames apparaissent* → c'est bien un écart de fréquence. Continuez.
* *Rien n'apparaît toujours* → le problème est ailleurs. Ces télécommandes sont peut-être hors
    service (pile), ou vous êtes sur le mauvais protocole. Allez au
    [dépannage des Journaux](journaux.md#guide-de-dépannage).

**Étape 2 — Mesurer.** Pour chacune des huit télécommandes, relevez sa fréquence avec le
[Balayage de Fréquence](balayage-frequence.md). Supposons le résultat suivant :

| Télécommande | Fréquence mesurée |
|---|---|
| Les six qui fonctionnent | 433,40 à 433,44 MHz |
| Les deux muettes | 433,19 et 433,21 MHz |

**Étape 3 — Recentrer et élargir.** L'étendue totale va de 433,19 à 433,44 MHz, soit **250 kHz**.
Il faut donc une fenêtre d'au moins 250 kHz, centrée au milieu :

* **Fréquence de base** = (433,19 + 433,44) ÷ 2 = **433,315 MHz**
* **Largeur de bande RX** ≥ 250 kHz → prenez une marge, par exemple **325 kHz**

Avec ces valeurs, la fenêtre va de 433,153 à 433,478 MHz : **les huit télécommandes sont dans la
fenêtre**. Enregistrez, et vérifiez dans les journaux que les huit apparaissent bien.

**Étape 4 — Et l'émission ?** C'est le point que beaucoup oublient. Vous venez de réparer la
**réception**, mais vous avez aussi déplacé la fréquence d'**émission** de 433,420 à
433,315 MHz — 105 kHz plus bas. Les six moteurs qui fonctionnaient risquent maintenant de ne plus
obéir, puisque l'émission n'a pas de largeur de bande pour les rattraper.

Testez donc une commande sur chacun des huit équipements depuis l'interface. Si les huit
obéissent, vous avez trouvé votre réglage : gardez-le. Sinon, passez à l'étape suivante.

**Étape 5 — Chercher la fréquence qui convient à tous.** Si les six moteurs d'origine n'obéissent
plus, n'annulez pas tout : vous n'avez pas encore essayé le bon réglage, vous en avez essayé un
seul. La méthode consiste maintenant à **ne faire varier qu'un seul paramètre**.

1. **Laissez la largeur de bande au maximum** (`812,50 kHz`). Ainsi la réception ne vous contraint
    plus du tout : vos huit télécommandes resteront entendues quelle que soit la fréquence centrale
    que vous essaierez. Vous venez de ramener le problème à **une seule inconnue**.
2. **Faites varier la seule Fréquence de base**, par pas de 20 à 30 kHz entre les deux groupes —
    dans notre exemple, de 433,20 jusqu'à 433,44 MHz.
3. **À chaque valeur, enregistrez et testez une commande sur les huit équipements.** Notez combien
    répondent. Vous obtenez une courbe : 6 ici, 7 là, peut-être 8 quelque part.
4. **Gardez la valeur qui en satisfait le plus.** Il y a de bonnes chances qu'un palier convienne
    aux huit : les récepteurs Somfy sont généralement plus tolérants que la fenêtre de réception du
    CC1101.

!!! important "Important"

    **« 433,420 MHz » n'est pas la valeur à laquelle il faut revenir.** C'est la fréquence du
    standard Somfy, mais ce n'est pas forcément le chiffre que *votre* appareil doit afficher. Les
    modules CC1101 sont accordés à quelques centaines de ppm près, ce qui représente **plus de
    100 kHz d'écart** à 433 MHz : un module peut parfaitement devoir être réglé sur 433,15 MHz pour
    émettre réellement sur 433,42.

    Autrement dit, la bonne fréquence est une grandeur **à calibrer pour votre appareil**, pas une
    valeur de référence à restaurer. Si un réglage inhabituel fait fonctionner vos huit équipements,
    c'est lui qui est correct — et le « rétablir » à 433,420 casserait votre installation.

**Si aucune valeur ne satisfait les huit.** C'est le cas difficile, et il reste deux sorties :

* **Vivre avec la bande élargie et le meilleur compromis.** Rien ne vous oblige à revenir aux
    valeurs d'usine : un réglage qui fait fonctionner sept équipements sur huit vaut mieux que celui
    qui en faisait fonctionner six.
* **Ré-appairer les équipements récalcitrants** à la fréquence que vous avez retenue, depuis la
    [télécommande virtuelle](../somfy/telecommande-virtuelle.md) ou l'
    [appairage](../somfy/equipements.md#5-appairer-le-moteur). Le moteur apprend alors à écouter l'appareil
    directement, et l'écart avec sa télécommande d'origine n'a plus d'importance.

!!! tip "Astuce"

    **Notez vos valeurs avant de commencer, et avancez un paramètre à la fois.** Fréquence de base,
    largeur de bande, déviation : trois nombres sur un papier, et vous pourrez toujours revenir à
    l'état qui fonctionnait pour six équipements sur huit. Une sauvegarde depuis
    [Firmware](../configuration/firmware.md) fait le même travail et
    emporte toute la configuration.

!!! note "Note"

    **Pourquoi faut-il tâtonner ?** Parce que le firmware n'a qu'**un seul** réglage de fréquence,
    partagé par l'émission et la réception : il est impossible de les optimiser séparément. Et parce
    que la tolérance des récepteurs Somfy, elle, n'est pas mesurable depuis l'interface. Le seul
    instrument dont vous disposez, c'est l'essai.

---

# Diagnostic RSSI

Le **RSSI** est l'indicateur de force du signal, affiché en haut du sous-onglet Radio :

* **Le score** : plus il est proche de 0, plus le signal est fort.
* **Le compteur** : le petit nombre à côté indique le nombre de trames reçues. Pratique pour
    tester la réactivité d'une télécommande sans quitter la page.

## Interpréter la qualité du signal (RSSI)

* **🟢 −30 à −60 dBm — Excellent** : signal très fort, communication parfaite.
* **🟡 −70 à −85 dBm — Faible** : signal limite, risques de pertes de commandes.
* **🔴 −90 à −110 dBm — Bruit** : signal trop faible ou trop parasité.

!!! note "Note"

    Un RSSI qui s'agite sans qu'aucune trame n'apparaisse dans les journaux ne veut **pas** dire que
    la réception fonctionne. Cela veut dire que la radio capte de l'énergie sur sa fenêtre, sans
    réussir à y décoder quoi que ce soit : broches RX/TX inversées, mauvaise fréquence, ou
    simplement du bruit ambiant.

---

**Pages liées :** [Journaux Radio](journaux.md) ·
[Balayage de Fréquence](balayage-frequence.md) ·
[Composants → Configuration des Broches](../../commun/composants.md#configuration-des-broches-pins)

