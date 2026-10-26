# Test des télécommandes

ESPSomfy-RTS doit **reconnaître le signal de vos télécommandes** pour piloter vos équipements. Ce
test le vérifie, **une télécommande après l'autre**. Pour celles qui ne sont pas reconnues, il
**mesure leur fréquence** et propose un réglage.

Il se lance depuis **Radio → Configuration**, bloc **Vos télécommandes**, par la carte **Tester
mes télécommandes physiques**. **Si toutes vos télécommandes sont reconnues, aucun réglage radio
n'est nécessaire.**

!!! note "Quand l'utiliser"

    Utile si certains équipements seulement obéissent : c'est le signe que vos télécommandes
    n'émettent pas toutes exactement sur la même fréquence.

## Déroulement

1. **Munissez-vous de toutes vos télécommandes.** Vous allez appuyer sur chacune, une par une, à
   portée du boîtier. Celles que ESPSomfy-RTS reconnaît déjà n'ont besoin de rien ; pour les
   autres, il mesurera leur fréquence.
2. **Télécommande 1 — appuyez sur un bouton.** N'importe quel bouton, à portée du boîtier ; une
   **brève pression** suffit. L'assistant **écoute avec les réglages actuels**.
3. Il affiche le résultat, puis demande si vous avez **une autre télécommande** (**Oui, une
   autre**, ou **Je n'en ai pas d'autre**), et ainsi de suite.

### Ce que peut répondre le test

| Résultat | Signification |
|---|---|
| **Télécommande N reconnue** | elle est décodée avec les réglages actuels : l'assistant donne son **ID** et son **signal** (en dBm). Elle fonctionne telle quelle. |
| **Cette télécommande a déjà été testée** | vous avez appuyé deux fois sur la même ; appuyez sur une télécommande que vous n'avez pas encore testée. |
| **Fréquence à ajuster** | rien n'a été décodé dans les **12 secondes** : l'assistant **mesure sa fréquence**. Elle émet **hors de la fenêtre d'écoute actuelle** (« elle émet sur … MHz »), la fréquence devra être ajustée. |
| **Non reconnue** | la fréquence est **déjà dans la fenêtre d'écoute** : elle n'est pas en cause. Vérifiez le **protocole** et la **longueur de trame** (bloc *Communication*), la **pile** ou la **portée**. |

Pour **mesurer la fréquence** d'une télécommande non reconnue, **maintenez un bouton enfoncé**
pendant la mesure. Il y a **« Mesurer sa fréquence »**, et **« Arrêter ici »** pour s'interrompre.

### La fin du test

- **Toutes reconnues** : « Vos *N* télécommandes sont reconnues ». **Inutile de modifier les
  fréquences.**
- **Certaines à ajuster** : « Reconnues : *x*, à ajuster : *y* ». L'assistant propose des
  réglages qui **les couvrent toutes**. **Enregistrez-les**, puis **refaites le test** pour
  confirmer.
- **Seulement des non reconnues** : changer la fréquence n'y changerait rien, puisqu'elles
  émettent déjà dans la fenêtre d'écoute.

## Le résultat reste affiché

Le bloc **Vos télécommandes** **garde le résultat pour la session** : *Télécommande 1, 2, 3* avec
leur ID et leur signal, puis « toutes reconnues », ou le réglage proposé à un clic (**Voir les
réglages proposés**), ou un test **interrompu** que l'on peut **continuer** (« Télécommandes
testées jusqu'ici : *n* »). **Fermer l'assistant ne fait plus rien perdre.**

Enregistrer de nouveaux réglages radio **efface ce résultat** et propose de **refaire le test**,
pour confirmer que toutes vos télécommandes sont reconnues avec les nouveaux réglages.

## Comment la mesure est faite

L'assistant pilote le même balayage que l'outil manuel (toute la bande 433-434 MHz, par pas de
10 kHz), mais ne retient **ni** le pic brut ni la fréquence que le balayage met en avant tout
seul. Sur banc, répéter la mesure cinq fois sur une télécommande immobile donne :

| Méthode | Étalement sur 5 mesures |
|---|---|
| Sommet du pic (ce qu'affiche le balayage brut) | 40 kHz |
| **Milieu de la fenêtre de détection** (ce que retient l'assistant) | 10 kHz — son propre pas de quantification, pas du bruit |

Le filtre de réception fait ~100 kHz de large : son sommet est plat sur une bonne part de
cette largeur, ce qui rend le point le plus fort peu fiable d'une passe à l'autre. Les flancs,
eux, chutent nettement (environ 12 dB) dès le pas suivant — l'assistant détecte ces deux
flancs et retient leur milieu, une mesure bien plus répétable.

## Mesure isolée : garder ou exclure ?

Si une des mesures est très éloignée des autres, l'assistant le signale avant de conclure :
l'inclure obligerait à élargir la bande au point de dégrader la réception de **toutes** les
autres télécommandes, pour un signal qui est probablement un appareil tiers capté par erreur
plutôt qu'une vraie télécommande à vous. Vous choisissez de la retirer ou de tout annuler —
l'assistant ne décide jamais seul.

## Le calcul

Une fois les mesures retenues :

* **Fréquence de base** = milieu entre la mesure la plus basse et la plus haute (et non leur
    moyenne, qui se laisserait influencer par un groupe de mesures proches au détriment d'un
    cas isolé).
* **Largeur de bande RX** = l'écart entre la plus basse et la plus haute, plus une marge de
    sécurité de 10 kHz de chaque côté (la résolution de la mesure elle-même) — **sans jamais
    descendre sous la largeur d'usine (99,97 kHz)**. Quand certaines télécommandes sont déjà
    reconnues, les réglages proposés couvrent **aussi la fenêtre d'écoute actuelle**, pas
    seulement les télécommandes mesurées. Si toutes vos télécommandes sont groupées
    (le cas le plus courant), l'assistant retrouve donc exactement la largeur de bande d'usine :
    il confirme plutôt que de bricoler, et n'élargit que quand les mesures l'exigent vraiment.

!!! note "Note"

    Élargir la bande n'est jamais gratuit : une fenêtre plus large capte aussi plus de bruit
    ambiant — voir [Configurer la radio](index.md#comprendre-la-fenêtre-de-réception). Si l'écart
    entre vos télécommandes dépasse ce que le CC1101 peut couvrir, l'assistant vous le signale
    plutôt que de proposer un réglage qui dégraderait toute la réception pour rien — dans ce cas
    rare, vérifiez qu'il ne s'agit pas en réalité de deux émetteurs différents.

