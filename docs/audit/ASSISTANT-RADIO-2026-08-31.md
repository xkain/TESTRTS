# Assistant de réglage radio — cadrage, 31/08/2026

Point de départ d'un chantier **non commencé**. Rien de ce document n'est implémenté, à une
exception près : la correction de l'accordeur décrite en §1, qui a été faite.

**Révision du 31/08/2026, après mesures sur banc.** La première version de ce document reposait
sur une formule fausse, qui en était pourtant le cœur. Elle est corrigée ici, et les mesures qui
l'ont invalidée sont reportées. Les conclusions qui en dépendaient — passe fine en bande étroite,
terme `2 × déviation`, seuil des 717 kHz — sont annulées.

---

## À LIRE EN PREMIER

L'idée : remplacer, pour la majorité des utilisateurs, le réglage manuel des fréquences radio par
un **assistant qui mesure** les télécommandes physiques et en déduit les réglages.

Le constat qui la motive : la page radio présente quatre cartes de réglages à un utilisateur qui,
dans ~75 % des cas, n'a aucune raison d'y toucher — les valeurs d'usine sont celles de Somfy. Et
celui qui a *besoin* d'y toucher est précisément celui qui ne saura pas quoi y mettre : aucun
déplacement de curseur ne permet de deviner la fréquence réelle d'une télécommande. **Il faut la
mesurer.**

---

## 1. La physique réelle — et l'erreur qu'il faut ne plus refaire

La condition de réception d'une télécommande donnée est :

```
|f_télécommande − f_centrale|  ≤  rxBandwidth / 2
```

Le filtre RX laisse passer `[fc − bw/2, fc + bw/2]` : ce qui tombe dedans est reçu, ce qui tombe
dehors ne l'est pas.

### La déviation n'intervient pas

**La version précédente de ce document posait `≤ (bande/2) − déviation`. C'est faux ici.** Ce
terme n'aurait sa place qu'en 2-FSK, où l'énergie se pose sur deux tons à `f ± déviation` devant
tenir tous les deux dans la bande. Or la radio est configurée en **ASK/OOK** :

| appel, `SomfyRadioDriver.cpp` | conséquence |
|---|---|
| `setModulation(2)` | ASK/OOK — porteuse présente ou absente, **un seul ton** |
| `setPktFormat(3)` | série asynchrone : aucune trame matérielle |
| `setSyncMode(4)` | pas de préambule, simple détection de porteuse |

Le CC1101 n'est ici qu'un **détecteur d'enveloppe** ; c'est le pilote qui décode lui-même les
durées d'impulsions en logiciel. Le registre de déviation ne gouverne pas cette réception.

### Ce que le banc a mesuré

| | si l'ancienne formule valait | mesuré |
|---|---|---|
| marge, valeurs d'usine | ± 2,385 kHz | **± 50 kHz** |
| fenêtre de détection | 4,8 kHz | **110 kHz** |
| pas de balayage au-dessus du seuil | **au plus 1** | **12 consécutifs**, sur 3 passes |

Douze pas de 10 kHz allumés simultanément sont incompatibles avec une fenêtre de 4,8 kHz.

### La preuve directe (01/09/2026)

Les mesures ci-dessus portaient sur la *largeur de fenêtre* ; la déviation elle-même n'avait jamais
été variée. Elle l'a été depuis, sur le banc, une même télécommande maintenue et `rxBandwidth`
laissée à 99,97 :

| déviation | marge selon l'ancienne formule | trames décodées | valides |
|---|---|---|---|
| **47,60 kHz** | + 2,385 kHz | 68 | 68 |
| **380,85 kHz** | **− 330,87 kHz** | **68** | **68** |

Huit fois la déviation, jusqu'au maximum du CC1101, pour un résultat **identique** (RSSI −54 à
−58 dBm dans les deux cas). L'ancienne formule prédisait là **zéro trame**. Elle est falsifiée sur
la variable elle-même, et non seulement par inférence.

Témoin domestique cohérent : le boîtier de test est réglé sur 433,23 et sa télécommande Simu
mesure 433,215 — écart bien supérieur à l'ancienne marge — et les volets répondent.

**Corrigé** dans `updateRadioGraph()` (`data-dev/js/70-somfy.js`) le 31/08/2026 : la zone verte de
l'accordeur vaut désormais `± bande/2`. Elle annonçait à l'utilisateur qu'il était vingt fois plus
près du décrochage qu'en réalité.

Effet de bord assumé : l'état `impossible` (marge ≤ 0) est devenu **inatteignable** — la bande
minimale du CC1101, 58,03 kHz, laisse déjà 29,0 kHz de marge. Le code et les clés
`RADIO_TUNER_IMPOSSIBLE` / `RADIO_TUNER_NOMARGIN` sont laissés en place, morts, à trancher plus tard.

---

## 2. Ce qui justifie le chantier maintenant

Le chantier ne perd rien à la correction — il change seulement d'échelle. La bande d'usine couvre
± 50 kHz, soit **100 kHz d'écart maximal entre deux télécommandes**. Au-delà, aucune fréquence
centrale ne les couvre toutes : il faut élargir la bande.

Le cas rencontré sur le banc l'illustre : une télécommande **Simu** à ~433,215 cohabite avec des
Somfy autour de 433,42, soit **~205 kHz d'écart** — le double de ce que l'usine tolère. Aucun
réglage d'usine ne convient, et personne ne découvrira ça en manipulant des curseurs.

### La moyenne reste le mauvais calcul

- la fréquence centrale est le **milieu des extrêmes** `(min + max) / 2`, qui minimise l'écart au
  pire cas — pas la moyenne, qui se laisse tirer par les valeurs groupées ;
- la **bande doit être élargie** en conséquence.

**L'assistant produit deux valeurs, pas une.** Un assistant qui ne réglerait que la fréquence
laisserait les télécommandes extrêmes hors bande.

### Le calcul retenu

```
centre = (min + max) / 2
bande  = borner( max( 99.97 , (max − min) + 20 ) , 58.03 , 812.50 )
```

- **`+ 20`** : un pas de balayage (10 kHz) de chaque côté. Cette marge sort de la **résolution de
  la mesure**, pas d'un modèle ajusté sur un cas particulier. Arbitrage du 31/08 : on s'y tient,
  sans supposition sur la dérive thermique ou sur une télécommande oubliée — la carte Manuel reste
  là pour qui veut élargir.
- **`max(99.97, …)`** : ne jamais descendre sous la valeur d'usine. Conséquence voulue — chez les
  ~75 % d'utilisateurs aux télécommandes groupées, l'assistant ressort **exactement les valeurs
  Somfy**. Il confirme au lieu de bricoler.
- **La déviation n'est pas touchée.** Elle ne gouverne pas la réception : un réglage de moins, et
  aucune décision à justifier.

---

## 3. Contraintes de mesure — mesurées, pas supposées

Relevés sur le banc en sondant l'événement WebSocket `frequencyScan` (port 8080).

### 3.1 `markFreq` n'est pas exploitable — les flancs le sont

Le firmware retient comme « meilleure » le pas de RSSI maximal. Or le sommet du pic est **plat sur
~70 kHz** : l'argmax s'y promène.

| estimateur | 5 passes sur une source immobile | étendue |
|---|---|---|
| `markFreq` (argmax, firmware) | 433,190 · 433,200 · 433,210 · 433,230 · 433,230 | **40 kHz** |
| milieu de fenêtre `(f_min + f_max)/2` | 433,210 · 433,215 · 433,215 · 433,215 · 433,220 | **10 kHz** |

Les flancs chutent de 12 dB en un seul pas : ils sont exploitables, le sommet non. Et l'étendue de
10 kHz du second est **son propre pas de quantification** (grille de 10 kHz → résolution 5 kHz),
pas du bruit : l'estimateur est déjà à sa limite.

**Conséquence : la passe fine en bande étroite est annulée.** La version précédente de ce document
la jugeait indispensable. Le balayage large actuel contient déjà l'information — c'est l'argmax qui
la jette. Le calcul se fait côté navigateur sur `testFreq`/`testRSSI`, déjà diffusés à chaque pas.

⚠️ La **largeur** de la fenêtre dépend du niveau du signal ; seul son **milieu** est une mesure.

### 3.2 Le vrai obstacle : 1,6 s de croisement contre 13 s d'endurance

| | mesuré |
|---|---|
| pas | 10 kHz, un pas / 100 ms |
| passe complète, au repos | **10,1 s** |
| passe complète, sous émission | **10,6 – 10,7 s** |
| **croisement d'une fréquence donnée** | **~1,6 s par passe** (12 pas) |
| **endurance d'une télécommande, bouton maintenu** | **10 – 15 s** |

Le balayage ne traverse la fréquence d'une télécommande qu'**une fois par passe** ; pendant les
85 % restants le récepteur écoute ailleurs et l'émission est perdue. Et la télécommande **cesse
d'émettre d'elle-même au bout de 10-15 s**.

**« Maintenez le bouton jusqu'à la fin du balayage » est donc irréalisable** — le matériel s'y
refuse. Une pression couvre un croisement, parfois zéro. L'assistant doit prévoir « on ne vous a
pas entendu, réappuyez » : deux ou trois pressions par télécommande.

Deux leviers firmware existent (séjour 100 → 40 ms, ou plage resserrée). **Écartés le 31/08** :
priorité à ne pas toucher la logique existante. À rouvrir si l'usage montre que trois pressions
lassent.

### 3.3 Ce que la garde `waiting_synchro` coûte vraiment

`processFrequencyScan()` n'avance que si `somfy_rx.status == waiting_synchro`. Craignait-on un
blocage sous émission continue ? Non : **0,5 à 0,6 s par passe (~5 %)**, zéro pause > 250 ms, zéro
pas répété, sur deux runs sous émission. Elle ralentit, elle ne suspend jamais.

### 3.4 Seuil et garde-fou

Le suivi du « meilleur » n'est retenu qu'au-dessus de **−75 dBm** — seuil du firmware lui-même,
à réutiliser tel quel. Le garde-fou anti-saturation ne gêne pas : `hold = (rxmode == 3) ? 0 : …`,
il récupère immédiatement en mode balayage.

---

## 4. Persistance — recommandation inchangée

Persister le **résultat** (fréquence centrale + bande), qui l'est déjà et part déjà dans le backup.

Les valeurs par télécommande sont **intermédiaires** : leur seul usage est de calculer les deux
réglages. Les persister imposerait une structure, une **version d'en-tête à incrémenter**, le
format de backup à faire évoluer et un chemin de migration — pour des données que plus rien ne lit.

Si le détail est souhaité pour du diagnostic, le garder **côté navigateur** (localStorage), en
disant qu'il ne fait pas partie de la configuration du boîtier — motif déjà retenu pour
`espsomfy_tuner_ref`.

---

## 5. Structure de la page

Les quatre cartes actuelles ne sont pas quatre cartes de réglage : ce sont **deux métiers**
empilés sans séparation.

| cartes | métier | fréquence d'usage |
|---|---|---|
| Activation · Communication · Assignation GPIO | **installation** | une fois, à la mise en service |
| Réglages Fréquence | **accordage** | seulement si ça ne marche pas |

**Décision du 31/08 : un `SwitchBig-2` Automatique / Manuel**, sur le modèle exact de
`feedbackStyleSwitch` (`40-general.js`).

**Portée : la section « Réglages Fréquence » seule, pas la tête de page.** Activation,
Communication et GPIO sont nécessaires dans les deux modes — un utilisateur en Automatique doit
pouvoir câbler sa carte. Défaut **Automatique** ; le choix est un état d'affichage, donc
`localStorage`, comme `espsomfy_graph_mode`.

```
[ Activation ] [ Communication ] [ GPIO ]      ← inchangés, toujours visibles
─────────────────────────────────────────
RÉGLAGES FRÉQUENCE
  ( Automatique )  ( Manuel )
  → Automatique : l'assistant
  → Manuel      : les 4 curseurs actuels, inchangés
─────────────────────────────────────────
[ Réinitialiser ]                [ Enregistrer ]
```

---

## 6. Le graphe — on n'y touche pas

La version précédente proposait de **changer le sujet** du graphe pour y montrer les `n`
télécommandes mesurées et la fenêtre posée autour d'elles.

**Écarté pour l'instant.** Ça obligerait à réécrire `updateRadioGraph()`, qui vise un signal
unique — exactement la réécriture de logique existante qu'on veut éviter. L'assistant montre son
résultat sur **son propre écran final**, et cale `tunerRef` sur le centre calculé pour que
l'accordeur existant reflète le résultat **sans une ligne de modification**.

Le graphe multi-télécommandes reste une idée pour plus tard, si le besoin se confirme à l'usage.

---

## 7. Parcours retenu

1. **Pas de « combien de télécommandes ? » en préambule.** C'est un formulaire avant toute valeur
   rendue, et l'utilisateur ne sait pas répondre (le point mural compte-t-il ?). On mesure la
   première, puis : « Une autre télécommande ? » → **Oui** / **Non, j'ai terminé**.
2. « Maintenez le bouton appuyé », télécommande **à un mètre environ** du boîtier — pas collée.
3. **Retour « je vous entends » dès que le RSSI décolle.** Point de rupture du parcours : on
   demande de tenir un bouton en regardant un écran tenu dans l'autre main. Sans retour immédiat,
   tout le monde relâche à trois secondes.
4. Calcul du centre et de la bande (§2).
5. Affichage du résultat, puis proposition d'enregistrer.

### Les trois points ouverts, tranchés le 31/08

**Télécommande muette** → *Réessayer / Ignorer*, jamais abandonner la campagne. Perdre trois
mesures parce que la quatrième a une pile morte serait inacceptable. Deux échecs à distinguer :

| observé | sens | proposition |
|---|---|---|
| `RSSI` reste à −100 | rien entendu — pile, mauvais bouton, hors portée | **Réessayer** / Ignorer |
| `RSSI` entre −75 et −90 | entendue mais faible, mesure bruitée | accepter en **signalant** |

« Ignorer » doit être honnête : la fenêtre calculée ne couvrira pas cette télécommande, et il faut
le dire à ce moment-là.

**Écart supérieur à ce que le CC1101 permet** → **refuser, et traiter en diagnostic**. Avec la
bande plafonnée à 812,50 kHz et la marge de 20 kHz, l'écart maximal couvrable est de
**792,50 kHz** — et non 717, chiffre qui découlait du terme `2 × déviation` désormais annulé.
Deux télécommandes si éloignées ne sont pas deux télécommandes : l'une des mesures est du bruit
ou une autre source 433. Élargir la bande pour « faire tenir » les deux
donnerait le pire résultat — sensibilité effondrée, bruit avalé. Désigner la mesure aberrante,
proposer de la refaire ou de l'exclure. Le même traitement sert au cas bien plus probable d'un
écart de 30 kHz, qui a la même cause.

**Écrire ou remplir ?** → **remplir**. C'est déjà la règle de l'écran, et `resetRadioSettings()`
en donne le patron : il repasse par les gestionnaires existants (`frequencyChanged`,
`rxBandwidthChanged`) puis affiche `RADIO_SAVE_REQUIRED`, sans rien écrire. L'assistant fait
strictement pareil — **zéro nouveau chemin d'écriture**, et il devient annulable en quittant la page.

---

## 8. État du code

Travaux réalisés le 31/08/2026 sur `data-dev/`, non compilés dans `data/` :

- `.radio-graph-container` : accordeur (aiguille, zone verte, écart en kHz, verdict, provenance).
  Aucun axe vertical, aucune hauteur porteuse de valeur.
- **Zone verte corrigée** (§1) : `± bande/2`.
- Référence de balayage persistée navigateur : `espsomfy_tuner_ref` (~45 octets), alimentée par
  `recordSpectrumSample()`.
- Bandeau de dépannage au-dessus du graphe : le symptôme puis le bouton **Scanner**.
- Pied de page : **Réinitialiser** et **Enregistrer**.

### Locales

**À jour.** Les corrections annoncées dans la version précédente ont été faites : `BT_RADIO_RESET`
est en place et référencée, `BT_RADIO_DEFAULTS`, `FREQ_MIN` et `FREQ_MAX` ont été supprimées. Les
douze clés `RADIO_SCAN_HINT_*` / `RADIO_TUNER_*` sont en place.

L'assistant demandera de **nouvelles clés**. Rappel : `fr.json` est la seule source de vérité et
n'est modifiée que par l'auteur ; `en/de/es` sont régénérées sur demande explicite.

### En suspens

- Le commentaire de `txPower` dans `SomfyRadioDriver.h` annonce « Default is 12 » alors que la
  valeur compilée est **10**. Les valeurs d'usine recopiées côté JS suivent le **code**.
- `impossible` et ses deux clés de locale : code mort depuis §1.
- La **déviation** est un réglage sans effet sur la réception. Son curseur reste en place et
  continue d'être enregistré — à qualifier un jour, hors de ce chantier.

---

## Annexe — protocole de mesure

Sonde WebSocket brute (aucune lib `websockets` n'est installée sur la machine de travail) branchée
sur `ws://<boîtier>:8080/`, filtrant les trames `42["frequencyScan",{…}]` et horodatant côté hôte.
Le balayage se pilote par `GET /beginFrequencyScan` et `/endFrequencyScan`. La socket est ouverte
sans jeton tant que `Security.type == None`.

Trois runs du 31/08/2026 : témoin au repos (30 s, **0 pas sur 301** avec le moindre signal, marque
jamais posée — le banc est silencieux), deux runs sous émission (30 s), un run de 90 s ayant capté
deux fenêtres de 1,6 s séparées de 29 s, qui est la mesure directe du §3.2.
