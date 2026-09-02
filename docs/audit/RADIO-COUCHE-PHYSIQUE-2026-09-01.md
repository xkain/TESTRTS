# Couche physique radio — ce que le code fait réellement, 01/09/2026

Relevé de code et de banc, écrit pour reprendre le travail plus tard sans le refaire.
**Aucun code de rstrouse n'a été modifié**, et rien ici ne propose de le faire.

Document frère : [`ASSISTANT-RADIO-2026-08-31.md`](ASSISTANT-RADIO-2026-08-31.md) (chantier assistant).

---

## À LIRE EN PREMIER — l'état de la question

La question posée : **la déviation de fréquence sert-elle à quelque chose dans ESPSomfy-RTS ?**

| affirmation | statut |
|---|---|
| Le CC1101 est configuré en ASK/OOK, sans condition, pour tous les protocoles | **établi par lecture du code** |
| `setDeviation()` n'écrit que le registre DEVIATN (0x15) | **établi par lecture de la bibliothèque** |
| La déviation n'agit pas sur la **réception** | **mesuré sur banc**, voir §3 |
| La déviation n'agit pas sur l'**émission** | **NON TESTÉ — travail restant**, voir §5 |
| Le réglage serait inutile / à retirer | **non affirmé, et non recommandé** — voir §4 |

---

## 1. Ce que la radio fait, d'après le code et non les commentaires

Toute la configuration du CC1101 tient dans `transceiver_config_t::apply()`,
[`src/somfy/SomfyRadioDriver.cpp`](../../src/somfy/SomfyRadioDriver.cpp) (~lignes 878-909) :

```
setMHZ(frequency)      setRxBW(rxBandwidth)   setDeviation(deviation)   setPA(txPower)
setModulation(2)       setManchester(1)       setPktFormat(3)           setDcFilterOff(0)
setCrc(0)              setCRC_AF(0)           setSyncMode(4)            setAdrChk(0)
```

Points vérifiés un par un :

- **`setModulation(2)` est un littéral**, jamais une variable. C'est le **seul** appel à
  `setModulation` de tout le projet. La modulation est donc **toujours ASK/OOK**.
- `setPktFormat(3)` = série asynchrone, `setSyncMode(4)` = pas de préambule, simple détection de
  porteuse. **Le CC1101 n'est qu'un détecteur d'enveloppe** : c'est le pilote qui décode les durées
  d'impulsions en logiciel (ISR `handleReceive`, machine à états `waiting_synchro` /
  `receiving_data`).
- **Un second bloc de configuration existe mais est MORT** : lignes ~930-950, entièrement à
  l'intérieur d'un `/* */`. Il référence `dataRate`, `syncMode`, `pktFormat`, `enableManchester`…
  qui sont eux-mêmes commentés dans `transceiver_config_t`. Ne pas se laisser tromper en le lisant :
  **rien de tout ça n'est compilé**.

### Les protocoles ne touchent pas la couche physique

`radio_proto` ([`SomfyRadioCodec.h:11`](../../src/somfy/SomfyRadioCodec.h)) : `RTS=0`, `RTW=1`,
`RTV=2`, `GP_Relay=8`, `GP_Remote=9`. Seuls les trois premiers sont offerts dans le menu
(`selRadioProto`).

Ils ne diffèrent **que par les octets de charge utile**
([`SomfyRadioCodec.cpp`](../../src/somfy/SomfyRadioCodec.cpp), ~241-290) : `frame[0] = 133/134…`
pour RTW, `149/150/151…` pour RTV, avec `frame[1] = 0xF0`. Même modulation, même Manchester, mêmes
durées d'impulsion.

Dans le pilote, `proto` n'apparaît **que** en sérialisation (`toJSON`, `fromJSON`, `save`, `load`)
et dans l'émission de l'évènement. **Jamais dans la configuration radio.**

De même, `type` (56/80 bits) n'agit que sur le hwsync et la longueur de trame, pas sur un registre.

**Conséquence :** il n'existe aujourd'hui aucun chemin, dans ce firmware, où le CC1101 passerait en
FSK. C'est ce qui rend le test de banc du §3 non restrictif malgré son unique configuration.

---

## 2. Ce que `setDeviation()` fait, d'après la bibliothèque

`SmartRC-CC1101-Driver-Lib` / `ELECHOUSE_CC1101_SRC_DRV.cpp` :

```cpp
void ELECHOUSE_CC1101::setDeviation(float d){
  ...
  SpiWriteReg(21, c);   // 21 = 0x15 = DEVIATN
}
```

**Un seul registre, rien d'autre.** C'est le seul écrivain de DEVIATN du projet, hormis la table de
valeurs par défaut de la bibliothèque (`SpiWriteReg(CC1101_DEVIATN, 0x47)`).

Pour mémoire, `setModulation(2)` écrit `MDMCFG2.MOD_FORMAT = 0x30` et `FREND0 = 0x11`.

---

## 3. Le test de banc — réception (01/09/2026)

**Protocole.** Même télécommande maintenue, `rxBandwidth` laissée à 99,97, `frequency` à 433,23 ;
seule la déviation modifiée entre les deux passes. On compte les évènements `remoteFrame`, émis par
le firmware quand une trame est **réellement décodée**.

| déviation | marge selon l'ancienne formule `bande/2 − déviation` | trames | valides | RSSI |
|---|---|---|---|---|
| **47,60 kHz** | + 2,385 kHz | 68 | 68 | −54 à −58 dBm |
| **380,85 kHz** (max CC1101) | **− 330,87 kHz** | **68** | **68** | −54 à −57 dBm |

Huit fois la déviation, jusqu'au maximum de la puce, pour un résultat **identique**. L'ancienne
formule prédisait **zéro trame**. Elle est donc falsifiée sur la variable elle-même.

Configuration restaurée à l'identique après le test, vérifiée champ par champ.

### Corroboration antérieure (31/08/2026)

Fenêtre de détection relevée à **110 kHz** ≈ `rxBandwidth` — douze pas de balayage consécutifs
au-dessus de −75 dBm, sur trois passes. Une marge de 2,385 kHz n'aurait pu en allumer qu'**un seul**.

### Mode opératoire, pour refaire la mesure

1. `GET /getRadio` → relever la config, **la noter pour restauration**.
2. `PUT /saveRadio` avec `{"config": {…}}`, la config complète et `deviation` modifiée.
   `Transceiver::save()` appelle `config.apply()` : la valeur part dans la puce immédiatement.
3. Ouvrir une WebSocket sur `ws://<boîtier>:8080/`, envoyer le texte **`join:0`**
   (ROOM_EMIT_FRAME). Sans ça, aucune trame décodée n'arrive.
4. Filtrer les messages `42["remoteFrame",{…}]`, compter `valid`.
5. `PUT /saveRadio` pour restaurer, puis `GET /getRadio` pour **vérifier** la restauration.

La socket est ouverte sans jeton tant que `Security.type == None`. Aucune bibliothèque WebSocket
n'est installée sur la machine de travail : le client a été écrit à la main (poignée de main
RFC6455, trames masquées côté client, réponse aux pings).

⚠️ Une télécommande **cesse d'émettre d'elle-même au bout de 10-15 s**, bouton maintenu. Prévoir
des fenêtres d'écoute courtes et plusieurs pressions.

---

## 4. Sur l'intention de rstrouse — ce qu'on ne conclut PAS

Rien n'indique une erreur, et **il n'est pas proposé de retirer le curseur ni l'appel**.

- Le réglage est **réellement écrit dans la puce** (registre 0x15).
- Il fait partie de la **configuration sauvegardée et du format de backup** : le retirer serait un
  changement cassant.
- Il resterait pertinent si un protocole FSK était ajouté un jour.
- Le bloc `apply()` reproduit la liste de paramètres de l'exemple ELECHOUSE, commentaires repris
  mot pour mot — ce qui explique sa présence sans qu'il faille y voir une intention forte. Le bloc
  commenté juste en dessous en est le reste.

La seule chose établie est **factuelle et bornée** : sur le chemin de code actuel, la déviation
n'agit pas sur la réception.

---

## 5. TRAVAIL RESTANT — le test en émission

**C'est le trou connu.** Tout ce qui précède ne concerne que la réception.

En OOK, l'émission se fait en commutant l'amplificateur (PA) ; DEVIATN ne devrait pas y intervenir
non plus. **Mais ce n'est pas mesuré**, et ça ne doit pas être affirmé.

### Protocole proposé

1. Relever et **noter** la config (`GET /getRadio`).
2. Porter `deviation` à **380,85** via `PUT /saveRadio`.
3. Envoyer une commande à un volet réel (`/shadeCommand` ou `/sendRemoteCommand`).
4. **Le volet bouge-t-il ?**
   - Oui → la déviation n'agit pas non plus en émission ; le texte d'aide pourra être élargi.
   - Non → elle agit en émission, et tout ce qui affirme « n'intervient pas » doit être restreint
     explicitement à la réception.
5. Restaurer `deviation` à 47,60 et **vérifier**.

**Non exécuté le 01/09/2026** : demande de faire bouger un volet réel, ce qui n'était pas possible
à ce moment-là. À reprendre quand les conditions le permettent.

---

## 6. Ce qui, dans le dépôt, dépend de tout ceci

| endroit | ce qui y est affirmé |
|---|---|
| `updateRadioGraph()`, [`data-dev/js/70-somfy.js`](../../data-dev/js/70-somfy.js) | marge = `bande/2`, sans terme de déviation ; commentaire portant les deux mesures |
| commentaire de l'accordeur, [`data-dev/index.html`](../../data-dev/index.html) | même relation, renvoi vers le commentaire JS |
| [`ASSISTANT-RADIO-2026-08-31.md`](ASSISTANT-RADIO-2026-08-31.md) §1 | la physique et la preuve directe |
| `RADIO_HELP_FREQ_DEVIATION`, `locales/fr.json` | texte d'aide vu par l'utilisateur |

Si le test en émission du §5 contredisait quoi que ce soit, **ce sont ces quatre endroits** qu'il
faudrait reprendre.

---

## 7. Point de détail toujours en suspens

Le commentaire de `txPower` dans [`SomfyRadioDriver.h`](../../src/somfy/SomfyRadioDriver.h) annonce
« Default is 12 » alors que la valeur compilée est **10**. Les valeurs d'usine recopiées côté JS
(`radioDefaults`) suivent le **code**. Symptôme du même copier-coller depuis l'exemple ELECHOUSE.
