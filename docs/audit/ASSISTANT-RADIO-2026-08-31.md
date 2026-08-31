# Assistant de réglage radio — cadrage, 31/08/2026

Point de départ d'un chantier **non commencé**. Rien de ce document n'est implémenté.
Le code de la page radio est dans l'état décrit en fin de document.

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

## Le fait chiffré qui justifie tout le chantier

La condition de réception, pour une télécommande donnée :

```
|f_télécommande − f_centrale|  ≤  (bande_RX / 2) − déviation
```

Elle se démontre en deux lignes : le filtre RX laisse passer `[fc − bw/2, fc + bw/2]`, le signal
2-FSK pose son énergie à `f ± déviation`, il faut donc que les deux tons tombent dans la bande.

Appliquée aux **valeurs d'usine** (`rxBandwidth = 99.97 kHz`, `deviation = 47.60 kHz`, cf.
[`src/somfy/SomfyRadioDriver.h`](../../src/somfy/SomfyRadioDriver.h)) :

```
marge = 99,97 / 2 − 47,60 = 2,385 kHz
```

**La configuration d'usine ne tolère que ± 2,4 kHz d'écart**, et donc au plus **4,77 kHz d'écart
entre deux télécommandes**. Au-delà, *aucune* fréquence centrale ne peut toutes les couvrir : il
faut élargir la bande. Personne ne découvrira jamais ça en manipulant des curseurs.

### Conséquence : la moyenne est le mauvais calcul

Le premier réflexe est de faire la moyenne des fréquences relevées. C'est faux sur deux plans :

- la fréquence centrale optimale est le **milieu des extrêmes** `(min + max) / 2`, qui minimise
  l'écart au pire cas — pas la moyenne, qui se laisse tirer par les valeurs groupées ;
- surtout, **la bande doit être élargie** en conséquence :

```
bande_RX  ≥  (max − min)  +  2 × déviation
```

Un assistant qui ne réglerait que la fréquence laisserait les télécommandes extrêmes hors bande,
sans que personne comprenne pourquoi. **L'assistant produit deux valeurs, pas une.**

---

## Contraintes de mesure — à traiter côté firmware

### 1. La règle est trop grossière

[`Transceiver::beginFrequencyScan()`](../../src/somfy/SomfyRadioDriver.cpp) règle le récepteur sur
la bande passante **configurée par l'utilisateur** :

```cpp
ELECHOUSE_cc1101.setRxBW(this->config.rxBandwidth);
```

À 99,97 kHz le récepteur entend ± 50 kHz autour du point d'écoute. Le pic est donc large et
l'incertitude sur la fréquence trouvée est **du même ordre que l'écart qu'on cherche à mesurer**.

À faire : balayer en **bande étroite** (58,03 kHz, le minimum du CC1101), idéalement avec une
seconde passe fine autour du pic grossier. C'est une modification firmware, pas un réglage
d'affichage.

### 2. Durée d'un balayage

[`Transceiver::processFrequencyScan()`](../../src/somfy/SomfyRadioDriver.cpp) :

| | |
|---|---|
| plage | 433,00 → 434,00 MHz (`currFreq > 434.0f` → retour à 433,0) |
| pas | 10 kHz (`currFreq += 0.01f`) |
| cadence | un pas / 100 ms |
| **passe complète** | **10 s** |

Compter deux passes par télécommande pour être robuste, soit ~20 s chacune, quelques minutes pour
cinq. Acceptable pour un assistant qu'on ne lance qu'une fois — **à condition que la progression
soit très lisible**, l'utilisateur devant maintenir un bouton appuyé pendant ce temps.

### 3. Ce que le firmware suit déjà

`emitFrequencyScan()` émet sur l'événement `frequencyScan` :

| champ | sens |
|---|---|
| `testFreq` / `testRSSI` | le pas courant |
| `frequency` / `RSSI` | la **meilleure** fréquence entendue et son niveau |

Le suivi du « meilleur » n'est retenu qu'au-dessus de **−75 dBm** (`else if(currRSSI > -75)`) :
c'est le seuil du firmware lui-même pour considérer qu'il y a un signal et non du bruit. À
réutiliser tel quel côté assistant.

---

## Persistance — recommandation

La question posée : garder les valeurs par télécommande indéfiniment dans l'ESP32, restaurables
par `.backup` ?

**Recommandation : non.** Persister le **résultat** (fréquence centrale + bande), qui l'est déjà et
part déjà dans le backup.

Les valeurs par télécommande sont des données **intermédiaires** : leur seul usage est de calculer
les deux réglages. Les persister imposerait une nouvelle structure, une **version d'en-tête à
incrémenter**, le format de backup à faire évoluer et un chemin de migration — pour des données que
plus rien ne lit ensuite. Cf. la philosophie de versioning du projet.

Si le détail est souhaité pour du diagnostic, le garder **côté navigateur** (localStorage), en
disant clairement qu'il ne fait pas partie de la configuration du boîtier — c'est déjà le motif
retenu pour la référence de l'accordeur (`espsomfy_tuner_ref`).

---

## Structure de la page — observation annexe

Les quatre cartes actuelles ne sont pas quatre cartes de réglage : ce sont **deux métiers
différents** empilés sans séparation visuelle.

| cartes | métier | fréquence d'usage |
|---|---|---|
| Activation · Communication · Assignation GPIO | **installation** — quel matériel, câblé comment | une fois, à la mise en service |
| Réglages Fréquence | **accordage** — quelle fréquence écouter | seulement si ça ne marche pas |

Mélanger « quelle broche GPIO » et « quelle déviation de fréquence » dans une suite uniforme de
cartes est une bonne part de la raison pour laquelle l'utilisateur ne sait pas quoi en faire.

Piste : un choix explicite en tête de page — **Automatique (recommandé)** qui lance l'assistant, et
**Manuel** qui donne accès aux cartes actuelles inchangées.

---

## Le graphe après l'assistant

Le bloc `.radio-graph-container` affiche aujourd'hui un **accordeur** (aiguille + zone verte),
construit sur la relation ci-dessus. Son défaut connu, signalé par l'utilisateur : *pas très
intuitif* — parce qu'il vise **un signal unique**.

Ne pas le supprimer, mais **changer son sujet** : après l'assistant, il aurait quelque chose
d'unique à montrer — **les télécommandes mesurées, et la fenêtre posée autour d'elles**. Trois
repères et un crochet. Il rendrait le résultat de l'assistant vérifiable au lieu d'être magique, et
afficherait une donnée qu'on ne peut obtenir autrement. Face à *n* télécommandes, la même image
devient évidente.

---

## Parcours envisagé

1. Combien de télécommandes physiques ?
2. Pour chacune : « maintenez le bouton appuyé jusqu'à la fin du balayage » → balayage en bande
   étroite, relevé de `frequency` / `RSSI`, progression très visible.
3. Répéter jusqu'à la dernière.
4. Calculer `f_centrale = (min + max) / 2` et `bande ≥ (max − min) + 2 × déviation`.
5. Afficher le résultat **et les mesures qui l'ont produit** (le graphe repensé), puis proposer
   d'enregistrer.

Points ouverts à trancher :

- que faire si une télécommande ne donne aucun relevé au-dessus de −75 dBm (pile faible, hors
  portée, mauvais bouton) — refaire, ignorer, abandonner ?
- que faire si l'écart mesuré exige une bande supérieure au maximum du CC1101 (812,50 kHz), soit
  un écart > 717 kHz ? En pratique improbable, mais le cas doit avoir une réponse.
- l'assistant écrit-il la configuration ou remplit-il seulement le formulaire ? La page suit
  aujourd'hui la seconde règle : **rien ne s'écrit sans « Enregistrer »**.

---

## Ce sur quoi ce chantier s'appuie

Travaux réalisés le 31/08/2026 sur `data-dev/`, non compilés dans `data/` :

- `.radio-graph-container` : accordeur (aiguille, zone verte = marge de calage, écart en kHz,
  verdict, provenance de la référence). Aucun axe vertical, aucune hauteur porteuse de valeur.
- Référence de balayage persistée navigateur : `espsomfy_tuner_ref` (~45 octets), alimentée par
  `recordSpectrumSample()` depuis l'événement `frequencyScan`.
- Bandeau de dépannage au-dessus du graphe : le symptôme (« vos équipements ne réagissent pas, ou
  mal ? ») puis le bouton **Scanner**, déplacé depuis le pied de page.
- Pied de page : **Réinitialiser** (valeurs d'usine + effacement de la référence de balayage, sans
  enregistrement) et **Enregistrer**.

Clés de locale : **13 sur 14 sont déjà dans `locales/fr.json`** (ajoutées par l'auteur le
31/08). Manque la seule qui a été renommée en fin de séance :

| clé | état |
|---|---|
| `BT_RADIO_RESET` | **à ajouter** — le bouton s'appelle désormais « Réinitialiser » |
| `BT_RADIO_DEFAULTS` | **orpheline** — ancien nom du même bouton, à supprimer |
| `FREQ_MIN`, `FREQ_MAX` | **orphelines** — l'en-tête du graphe ne montre plus les bords de bande |

Les douze autres (`RADIO_SCAN_HINT_*`, `RADIO_TUNER_*`) sont en place et à jour.

Rappel du fonctionnement : `fr.json` est la seule source de vérité et n'est modifiée que par
l'auteur ; `en/de/es` sont régénérées sur demande explicite, jamais en tâche de fond.

Point de détail en suspens : le commentaire de `txPower` dans
[`SomfyRadioDriver.h`](../../src/somfy/SomfyRadioDriver.h) annonce « Default is 12 » alors que la
valeur compilée est `10`. Les valeurs d'usine recopiées côté JS suivent le **code** (10).
