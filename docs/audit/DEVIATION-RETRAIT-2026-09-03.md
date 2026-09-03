# Retrait du réglage de déviation — 03/09/2026

Clôture de la question ouverte par
[`RADIO-COUCHE-PHYSIQUE-2026-09-01.md`](RADIO-COUCHE-PHYSIQUE-2026-09-01.md) : *la déviation de
fréquence sert-elle à quelque chose dans ESPSomfy-RTS ?*

**Réponse : non, et le réglage a été retiré.** Éprouvé sur matériel avant de toucher au reste.

---

## 1. Pourquoi

Le CC1101 est configuré en **ASK/OOK sans condition** — `setModulation(2)` est un littéral, seul
appel du projet. En tout-ou-rien il n'y a qu'un seul ton : la porteuse est présente ou absente, et
il n'existe aucun écart de fréquence à régler. `DEVIATN` (registre 0x15) gouverne l'écartement des
deux tons en FSK/GFSK/MSK ; il n'est pas lu par le démodulateur en OOK.

S'y ajoute que `setPktFormat(3)` place la puce en série asynchrone : l'ESP32 bascule lui-même la
porteuse par GPIO à l'émission (`sendFrame()`, `REG_WRITE(GPIO_OUT_W1TS_REG, …)`, `SYMBOL = 640 µs`)
et l'ISR décode les durées d'impulsions à la réception. Le CC1101 n'est qu'un interrupteur de
porteuse.

**RTS, RTW et RTV ne changent rien à cela** : ce sont trois variantes de charge utile, distinguées
après démodulation par des plages de valeurs de l'octet `encKey` (`SomfyRadioCodec.cpp`), et à
l'émission par deux octets de trame. Même couche physique, 56 comme 80 bits.

### Le fait qui a rendu le retrait sûr

`ELECHOUSE_cc1101.Init()` appelle `RegConfigSettings()`, qui écrit **`DEVIATN = 0x47`**. Or `0x47`
(E=4, M=7) vaut **47,607 kHz**, exactement la case de grille où tombait la valeur d'usine de 47,60.
Supprimer l'appel laisse donc le registre à la valeur qu'a toute installation par défaut. Rien à
préserver, aucune valeur de repli à choisir.

### Au passage : la résolution affichée était fictive

`setDeviation()` (bibliothèque `SmartRC-CC1101-Driver-Lib@2.5.7`) écrit un exposant sur 3 bits et
une mantisse sur 3 bits. Les **37 928 positions** du curseur se réduisaient à **63 valeurs de
registre**, choisies par plafond, avec un pas réel de 0,198 kHz en bas de plage et 25,4 kHz en haut.
Le registre 0x00 était inatteignable : le minimum réel valait 1,785 kHz, pas les 1,58 annoncés.

Les deux boîtiers dont nous avions des sauvegardes tournaient à `109.35` et `97.02` — deux valeurs
réglées à la main, aucune effective, aucune égale à ce qui s'affichait (elles donnaient 114,258 et
101,562 kHz).

---

## 2. La campagne de mesure

Boîtier .13, télécommande 381703 (« Volet salon »), bouton My, 56 bits. Configuration figée
pendant toute la campagne : `433.100 MHz / 99.97 kHz / txPower 10 / carte 1`.

Protocole : 10 appuis espacés de 3 s, télécommande posée sur un repère fixe. Comptage par hook sur
`somfy.procRemoteFrame` côté navigateur, regroupement en salves au seuil de 1000 ms. Le port série
ne sert à rien ici : la réception n'écrit aucun log. Et sans onglet ouvert sur la page de
configuration, le firmware **n'émet même pas** l'évènement `remoteFrame`
(`if(sockEmit.activeClients(ROOM_EMIT_FRAME) > 0)`).

| série | firmware | salves/appuis | trames | valides | RSSI moy |
|---|---|---|---|---|---|
| 1 | ancien | 8 / 10 (*) | 12 | 100 % | −44,10 |
| 2 | ancien | 10 / 10 | 11 | 100 % | −44,91 |
| 3 | ancien | 10 / 10 | 12 | 100 % | −44,75 |
| **témoin positif** | ancien | **0 / 10** | **0** | — | — |
| contrôle | ancien | 10 / 10 | 13 | 100 % | −42,92 |
| B | **nouveau** | 10 / 10 | 11 | 100 % | −47,00 |
| A′ | ancien | 10 / 10 | 10 | 100 % | −48,70 |
| clôture | **nouveau** | 10 / 10 | **20** | 100 % | −43,80 |

(*) série 1 polluée par la mise en place de la télécommande (deux trames à −80 dBm).

**Témoin positif** : fréquence décalée à 434.500 MHz, soit 1,4 MHz pour 99,97 kHz de bande.
Effondrement total à 0/10, puis retour à la référence après restauration. Sans lui, « rien n'a
changé » n'aurait rien valu — un compteur en panne produit le même résultat.

**A/B/A** : la mesure B donnait −47,00 contre −44,91 en référence, soit 2 dB hors de la bande
d'acceptation fixée d'avance. Le retour à l'ancien firmware (A′) a donné **−48,70**, c'est-à-dire
pire. L'ancien firmware détient à la fois le meilleur (−42,92) et le pire (−48,70) relevé de la
séance ; les deux plages se recouvrent. La variation est environnementale et réversible — le RSSI
est remonté à −43,80 en clôture.

**Sur les sept séries, 10 salves pour 10 appuis et 100 % de trames valides, sans exception.**

### Non mesuré : l'émission

La campagne ne porte que sur la **réception**. L'émission repose sur l'argument de code : le
modulateur du CC1101 n'est pas utilisé (série asynchrone, keying par GPIO), et le registre est de
toute façon identique avant et après pour une configuration par défaut. Un test direct reste
possible — envoyer une commande à un volet apparié et vérifier qu'il répond.

---

## 3. Ce qui a été retiré

| Fichier | Site |
|---|---|
| `src/somfy/SomfyRadioDriver.h` | champ `float deviation` de `transceiver_config_t` |
| `src/somfy/SomfyRadioDriver.cpp` | `setDeviation()` dans `apply()` |
| | `clampRadioFloat(…, "deviation", …)` dans `fromJSON()` |
| | `addElem("deviation", …)` dans `toJSON()` |
| | `pref.putFloat` / `pref.getFloat` |
| | + `removeNVSKey("deviation")` pour purger la clé orpheline |
| `src/ConfigFile.cpp` | `TRANS_REC_SIZE` 78 → 68, lecture et écriture du champ |
| `data-dev/index.html` | bloc curseur + champ numérique (41 lignes) |
| `data-dev/js/70-somfy.js` | `deviationChanged`, `deviationInputChanged`, ligne du récapitulatif, paire d'aide, `radioDefaults`, `applyRadioDefaults`, gabarit de démarrage |
| `locales/{fr,en,de,es}.json` | `RADIO_FREQ_DEVIATION`, `RADIO_HELP_FREQ_DEVIATION` |

Le texte d'aide supprimé — « Détermine l'écart nécessaire pour distinguer les bits de données » —
décrivait du 2-FSK. Il ne venait pas de rstrouse : la v2.4.7 n'a aucune internationalisation et
affichait « Frequency Deviation » sans aide. Il est né dans la lignée 2.5.x.

---

## 4. Le format de sauvegarde

`SHADE_HDR_VER` **reste à 26** : la v3.0.0 est en développement, la dernière version publique est
la 25. L'enregistrement transceiver passe de **78 à 68 octets**.

Deux champs, deux discriminants — et les confondre était le piège :

```
radioBoardType   ->  test de VERSION   : if(this->header.version < 25)
deviation        ->  test de TAILLE    : if(this->header.transRecordSize >= 74) this->readFloat(0);
```

Le test d'origine de `radioBoardType` portait sur `transRecordSize < 78`. Un enregistrement neuf de
68 octets l'aurait déclenché à tort et **remis `radioBoardType` à 0 à chaque restauration**.

La ligne de compatibilité n'est pas un luxe. Sans elle, `readInt8` lit les quatre premiers
caractères du champ déviation, `_rtrim` les vide, `drainToSeparator` avale le reste et `atoi("")`
rend 0 : **`txPower` est détruit silencieusement**, avec une valeur qui dépend du cadrage — 11 → 1
sur une sauvegarde v2.4.6, 11 → 0 sur une v2.5.4. Une perte de 10 dB à l'émission que rien ne
signale.

### Vérification

| fichier | version | taille | résultat |
|---|---|---|---|
| v2.4.6 | 24 | 74 o. | 13/13 champs identiques au lecteur d'origine |
| v2.5.4 | 25 | 78 o. | 13/13 champs identiques |
| v3.0.0 | 26 | 78 o. | 13/13 champs identiques |

Sur matériel, avec témoin positif : `txPower` porté à 12 sur le boîtier, restauration d'un fichier
au vieux format en portant 10, une lecture ratée donnant 0. **Résultat : 10.**

Piège rencontré : `/restore` sans options ne restaure que les volets (`opts.shades = true` par
défaut). Il faut envoyer `data={"transceiver":true}` pour exercer l'enregistrement radio.

Les vraies sauvegardes v2.4.6 et v2.5.4 portent une **IP statique 192.168.1.43** : les restaurer
telles quelles fait disparaître le boîtier de son adresse. Le fichier de test a donc été fabriqué à
partir de la configuration courante, `transRecordSize` forcé à 78 et champ déviation réinséré.

---

## 5. Quand la déviation servirait

Elle n'a de sens que si la puce module elle-même, en FSK/GFSK/MSK. Elle se règle alors en triplet
avec le débit et la bande RX : indice de modulation `h = 2·Δf / débit` (≈ 1 en 2-FSK classique) et
règle de Carson `BW ≥ 2·Δf + débit`. Cas réels : télémétrie bas débit longue portée, liaisons
rapides, et surtout **reproduire la déviation d'un équipement existant** avec lequel on veut
dialoguer.

Rien de tout cela dans ESPSomfy-RTS. Si le CC1101 devait un jour servir de passerelle de capteurs
433 MHz, la déviation redeviendrait un paramètre — mais **par protocole**, stocké avec le décodeur,
pas en curseur global.
