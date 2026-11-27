# Test des télécommandes

ESPSomfy-RTS doit **reconnaître le signal de vos télécommandes** pour piloter vos équipements. Ce
test le vérifie, **une télécommande après l'autre**. Pour celles qui ne sont pas reconnues, il
**mesure leur fréquence** et propose un réglage. **Si toutes vos télécommandes sont reconnues,
aucun réglage radio n'est nécessaire.**

Il s'ouvre depuis l'onglet [Réception](index.md#reception) de la page Radio, tuile **Assistant de
réception**, par `Tester mes télécommandes physiques`. La radio doit être activée et enregistrée.

![Fenêtre Test des télécommandes](v3/img/radio-fen-test){ .on-glb }

La colonne de gauche (en haut sur téléphone) rappelle la **Fenêtre d'écoute actuelle** et les trois
étapes : **Préparer**, **Tester**, **Réglages**.

!!! note "Quand l'utiliser"

    Utile si certains équipements seulement obéissent : c'est le signe que vos télécommandes
    n'émettent pas toutes exactement sur la même fréquence.

## Déroulement

1. **Munissez-vous de toutes vos télécommandes**, puis `Commencer`. Celles que ESPSomfy-RTS
   reconnaît déjà n'ont besoin de rien ; pour les autres, il mesurera leur fréquence. Rien n'est
   enregistré sans votre accord.
2. **Télécommande 1 — appuyez sur un bouton.** N'importe quel bouton, à portée de l'appareil ; une
   **brève pression** suffit. L'assistant écoute avec les réglages actuels, **12 secondes** par
   télécommande.
3. Il affiche le résultat, puis demande *Avez-vous une autre télécommande ?* : `Oui, une autre` ou
   `Non, j'ai terminé`, et ainsi de suite. Sous le résultat, la liste **Télécommandes testées**
   s'allonge.

### Ce que peut répondre le test

| Résultat | Signification |
|---|---|
| *Télécommande N reconnue* | elle est décodée avec les réglages actuels : l'assistant donne son **ID** et son **signal** (en dBm). Elle fonctionne telle quelle |
| *Cette télécommande a déjà été testée* | vous avez appuyé sur une télécommande déjà testée ; appuyez sur une autre |
| *Télécommande N non reconnue* | rien n'a été décodé : vérifiez la pile et la portée, `Réessayer`, ou `Mesurer sa fréquence` |

Pour **mesurer la fréquence**, **maintenez un bouton enfoncé**, à un mètre environ ; s'il
s'arrête, relâchez et réappuyez. `Passer` saute cette télécommande. La mesure dit ensuite :

| Mesure | Signification |
|---|---|
| *émet sur … MHz, hors de la fenêtre d'écoute* | la fréquence devra être ajustée |
| *émet sur … MHz, déjà dans la fenêtre d'écoute* | la fréquence n'est pas en cause : vérifiez le **décodage** (tuile **Décodage** de l'onglet Réception), la pile ou la portée |
| *Aucun signal n'a été reçu* | maintenez bien un bouton enfoncé, vérifiez la pile, rapprochez-vous |
| un signal trop bref | réappuyez en maintenant le bouton jusqu'à ce que la mesure s'affiche |

![Test des télécommandes, étape Tester : une télécommande reconnue, une autre mesurée hors de la fenêtre d'écoute](v3/img/radio-fen-test-2){ .on-glb }

### La fin du test

- **Toutes reconnues** : *Vos N télécommandes sont reconnues*. Inutile de modifier les
  fréquences.
- **Certaines à ajuster** : *Reconnues : x, à ajuster : y*, et les **Réglages proposés** (fréquence
  d'écoute et largeur de bande, avec leur valeur actuelle), sur un graphique des **Fréquences
  mesurées** : fenêtre actuelle, fenêtre proposée. La fréquence d'émission vers vos équipements ne
  change pas. `Enregistrer` les applique ; refaites ensuite le test pour confirmer.
- **Seulement des non reconnues** : changer la fréquence n'y changerait rien, puisqu'elles émettent
  déjà dans la fenêtre d'écoute.

![Test des télécommandes, étape Réglages : les réglages proposés](v3/img/radio-fen-test-3){ .on-glb }

## Le résultat reste affiché

La tuile **Assistant de réception** garde le résultat pour la session : la liste des télécommandes
testées, puis *Toutes vos télécommandes sont reconnues*, ou `Voir les réglages proposés`, ou un test
interrompu que l'on peut reprendre (`Continuer le test`). Fermer la fenêtre ne fait rien perdre.

Enregistrer de nouveaux réglages radio **efface ce résultat** : refaites le test pour confirmer que
toutes vos télécommandes sont reconnues avec les nouveaux réglages.

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
plutôt qu'une vraie télécommande à vous. `Retirer cette mesure` ou `Annuler` :
l'assistant ne décide jamais seul.

## Le calcul

Une fois les mesures retenues :

* **Fréquence d'écoute** = milieu entre la mesure la plus basse et la plus haute (et non leur
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
    ambiant — voir [Comprendre la fenêtre d'écoute](index.md#fenetre-ecoute). Si l'écart
    entre vos télécommandes dépasse ce que le CC1101 peut couvrir, l'assistant vous le signale
    plutôt que de proposer un réglage qui dégraderait toute la réception pour rien — dans ce cas
    rare, vérifiez qu'il ne s'agit pas en réalité de deux émetteurs différents.

