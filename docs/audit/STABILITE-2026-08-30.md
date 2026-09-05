# Stratégie d'épreuve de stabilité — v3.0.0

Banc : `192.168.1.13` (boîtier consommable), pilote depuis `192.168.1.24`, courtier MQTT
`mosquitto` sur `.24`, Home Assistant sur `.21`. Voir `PASSAGE-DE-RELAIS-2026-08-24.md` pour
l'état fonctionnel, qui est le point de départ : **l'audit est clos, la stabilité ne l'est pas.**

---

## 1. Ce qu'on cherche à prouver — et ce qu'on ne cherche pas

L'audit a répondu à « le firmware fait-il ce qu'il doit ? ». Cette campagne répond à une question
différente et disjointe : **« continue-t-il de le faire ? »**. Quatre propriétés, chacune
falsifiable :

| | Propriété | Énoncé falsifiable |
|---|---|---|
| **P1** | Vivacité | L'appareil répond à toute requête en un temps borné, et le reste après des jours. |
| **P2** | Non-dégradation | Aucune métrique de ressource ne dérive de façon **monotone** dans le temps. |
| **P3** | Intégrité | La configuration survit à tout — redémarrage, coupure, restauration partielle, écriture concurrente — **octet pour octet**. |
| **P4** | Récupération | Après toute agression (WiFi coupé, courtier absent, OTA interrompu, coupure secteur en pleine écriture), retour nominal **sans intervention humaine**. |

**Hors périmètre, explicitement** : la justesse fonctionnelle (audit clos), la portée radio, la
dispersion entre exemplaires de carte (un seul boîtier), et l'environnement 8 Mo (`.13` est en
4 Mo, `fsTotal` 512 Ko).

---

## 2. Principes méthodologiques — non négociables

Ils viennent tous d'une erreur déjà commise sur ce projet.

1. **Les critères chiffrés s'écrivent AVANT le lancement.** Un seuil décidé après coup se plie
   toujours au résultat obtenu. Ceux de la section 6 sont figés à la publication de ce document.

2. **Tout résultat négatif exige un témoin positif.** « Rien n'a cassé pendant 48 h » ne vaut rien
   tant qu'on n'a pas montré, sur le même montage, que l'instrument **aurait vu** la casse. Leçon
   de M-11 : un correctif « validé » détruisait la configuration de tous les utilisateurs, parce
   que le test négatif ne prouvait que sa propre cécité. Chaque axe de la section 5 porte donc sa
   ligne « témoin ».

3. **L'appareil qui se mesure lui-même est un témoin qui meurt avec l'accusé.** Trois sources
   indépendantes, horodatées sur la même base de temps (`.24`) :
   - un **sondeur HTTP externe** sur `/discovery` (port 8081) ;
   - la **capture série continue** (`pyserial`, jamais `pio monitor`) ;
   - le **courtier MQTT** (`mosquitto_sub -t '#' -v`).
   Sans base de temps commune, aucune corrélation n'est possible après coup.

4. **Un facteur à la fois, puis composition.** Les défauts intéressants de ce projet
   (`multi-client`, `ERR_GIT_LOW_HEAP`) ne sont apparus qu'en **combinaison** — mais on ne sait
   lire une combinaison que si chaque facteur seul a d'abord été chiffré.

5. **Distinguer le plancher de la pente.** C'est le discriminant décisif, et il a déjà failli être
   manqué : `largest` qui tombe de 94 196 à 65 524 puis n'y bouge plus est un **plancher** (sain) ;
   la même chute qui se répète est une **pente** (mortelle). Aucune métrique mémoire ne se juge sur
   un niveau ponctuel — seulement sur une régression sur plusieurs heures.

6. **Un relevé instantané ment.** Mesuré aujourd'hui même sur `.13` : au repos `largest` = 73 716,
   mais pendant trois `curl` concurrents il tombe à **23 540**, sous le seuil TLS de 36 864. Le
   creux transitoire n'est pas un plateau. Toute métrique se relève **au repos** et **sous charge
   nommée**, jamais « comme ça se trouve ».

---

## 3. Référence mesurée — 30/08/2026

Boîtier au repos, aucun client, 0 équipement, radio désactivée, 7 échantillons sur 140 s :

| Métrique | Valeur | Remarque |
|---|---|---|
| `max` (`getMaxAllocHeap`) | **73 716**, invariant | 2,0 × `GIT_TLS_MIN_HEAP_BYTES` (36 864) |
| `free` | 120 588 – 120 644 | oscillation de 56 octets, bruit |
| `min` (`getMinFreeHeap`) | 62 960 | point bas depuis l'amorce |
| `largest` | **73 716**, invariant | |
| latence `/discovery` | 19 – 122 ms | le 122 ms est le premier appel |
| Sous 3 requêtes concurrentes | `max` 38 900 / `largest` **23 540** | creux transitoire, cf. principe 6 |

Version `v3.0.0` (app 3.0.0), `authType` 0 (aucun PIN), transceiver `enabled:false`,
`radioInit:false`, `fsUsed` 252 Ko / 512 Ko.

**C'est une référence de boîtier vide.** Elle ne vaut que comme point zéro : la campagne se mène
sur la configuration de la section 4.

---

## 4. Phase 0 — montage du banc (≈ 2 h, préalable à tout)

L'ordre compte ; deux inversions sont fatales.

1. **Ouvrir la liaison série AVANT tout le reste.** Ouvrir `/dev/ttyUSB0` redémarre l'ESP32 : le
   faire en cours de soak détruit la mesure. La capture tourne du début à la fin de la campagne.
   `pyserial` en lecture pure — jamais de pilotage DTR/RTS répété, qui laisse le CP2102 à resservir
   des données corrompues sans jamais échouer.
2. **Activer `enableDebugLogs`** (`/setgeneral`). Sans lui, `DiagConn::loop()` rend la main
   immédiatement et l'instrument principal reste muet.
3. **Construire la configuration de référence** : 32 équipements (le maximum), répartis en pièces et
   groupes, plus 32 planifications dont plusieurs à déclenchement fréquent. Un équipement sans moteur en
   face exerce toute la logique firmware ; les trames partent dans le vide.
4. **Figer la référence d'intégrité** : `curl -o ref.backup http://192.168.1.13/backup` puis
   `sha256sum`. C'est le juge de P3 pour toute la campagne.
5. **Démarrer les trois collecteurs** (sondeur HTTP 20 s, série, MQTT) et vérifier que les trois
   fichiers grossissent.
6. **Poser le témoin positif du sondeur** : un `PUT /reboot` commandé, et vérifier que `uptime`
   **recule** dans le CSV et que la série montre la ligne `rst:0x...`. Si le sondeur ne voit pas ce
   redémarrage-là, il ne verra aucun des autres.

### Instruments disponibles, et lequel pour quoi

| Instrument | Ce qu'il voit | Coût |
|---|---|---|
| `/discovery` (8081) | `max`, `free`, `min`, `largest`, `total` — réponse chunked | ~2 Ko de pic ; non authentifié, donc insensible au PIN |
| `DiagConn` (série : `m`, `M`, `r`) | recensement lwIP par port (80/8081/8082/8080), `TIME_WAIT`, pairs distincts, emplacements WS, **pics** et `largest_min` horodatés | nul — c'est précisément pourquoi il est sur la série et non sur une route |
| WebSocket 8080 `memStatus` | mêmes métriques, toutes les 15 s, poussées | une connexion |
| ligne `rst:0x..` du bootloader ROM | **cause de redémarrage** | aucune ; c'est la seule surface, `esp_reset_reason()` n'est exposé nulle part dans le firmware |

`DiagConn` est le bon instrument de la section 5-B : il a été écrit pour cette question. Ne jamais
appeler `heap_caps_dump()` réseau actif (`TG1WDT_SYS_RESET` reproductible) — c'est `M`, à réserver
aux marques de palier.

---

## 5. Les six axes, par probabilité décroissante d'après l'historique du projet

### A. Fragmentation du tas dans le temps — *risque n° 1*

**Hypothèse à réfuter** : `largest` décrit une pente et non un plancher, sur une durée plus longue
que celles déjà observées.

*Protocole* : phase 1 (24 h au repos) puis phase 5 (72 h en charge nominale), régression linéaire
de `largest` sur chaque fenêtre glissante de 6 h. Marque de palier (`r` puis `m`) à H+1, H+6, H+24.
**Témoin** : provoquer une chute connue (30 appels à la page Firmware, `getReleases()` coûte ~35 Ko
transitoires par session TLS) et vérifier que la régression la voit.

### B. Capacité multi-clients — *sujet resté ouvert depuis le 18/08*

`WEBSOCKETS_SERVER_CLIENT_MAX=10` dimensionne un pool que le tas ne tient pas : ~12–16 Ko de plus
gros bloc par session, donc 3 à 4 clients suffisent en théorie à passer sous 36 864.

*Protocole* : balayage 1 → 10 clients réels (onglets, pas des sockets nus — un onglet ouvre des
connexions sur 80, 8081, 8082 **et** 8080), un palier de 10 min par valeur, `m` en début et fin de
palier. On cherche **la valeur de N où `largest_min` croise 36 864**, puis on tente un OTA réel à
N−1 et à N. **Témoin** : à N clients, l'OTA doit échouer en `ERR_GIT_LOW_HEAP` — un échec attendu
qui se produit vaut mieux qu'un succès qu'on ne sait pas expliquer.

*Livrable de décision* : soit `WEBSOCKETS_SERVER_CLIENT_MAX` descend à la capacité réelle, soit on
écrit pourquoi 10 tient. Le pool ne doit plus promettre ce que la mémoire ne donne pas.

### C. Vivacité de `loopTask` et watchdog

Le motif « réseau bloquant sur `loopTask` » a déjà coûté 5 sites corrigés, et il a **deux équipements** :
la durée (watchdog à 15 s) et la pile de 8 Ko (TLS n'y laisse que 1 884 octets).

*Protocole* : rafales HTTP concurrentes pendant qu'une planification déclenche et qu'un OTA vérifie
les versions ; surveiller le p99 de latence du sondeur et les `high water mark` de pile.
`getStrongestAP()` reste à requalifier — le provoquer explicitement (perte de l'AP) fait partie de
la phase 4. **Témoin** : un `M` volontaire réseau actif doit produire le `TG1WDT_SYS_RESET` connu,
prouvant que la chaîne série + sondeur classe correctement un redémarrage par watchdog.

### D. Intégrité de la configuration — *3 défauts critiques déjà sortis d'ici*

T-3, T-6 et T-7 sont tous nés du même endroit : une taille annoncée à laquelle on faisait confiance.

*Protocole* : 50 cycles `PUT /reboot` (jamais par DTR/RTS), `sha256sum` du `/backup` après chaque
cycle — **identité stricte** attendue. Puis le chemin qui a produit T-7 : restauration partielle
« équipements seuls », décochant « Réglages », et vérification que `hostname`, `protocol`, `port` et la
configuration MQTT sont intacts. **Témoin** : restaurer une sauvegarde volontairement tronquée doit
produire l'écart journalisé par `skipRecord()`, pas un silence.

### E. Réseau, récupération, intégrations

*Protocole* : couper l'AP 30 s / 5 min / 30 min ; forcer un renouvellement DHCP ; arrêter le
courtier `mosquitto` sur `.24` 1 h puis le relancer ; couper l'alimentation en pleine écriture de
configuration. À chaque fois : retour nominal attendu sans intervention, et vérification que HA
(`.21`) retrouve ses entités. **Piège connu** : activer un PIN coupe intégralement l'intégration HA
(401 REST + WebSocket rejetée) — la campagne doit donc se dérouler **deux fois** sur cet axe, PIN
actif et PIN inactif, sinon on ne teste que la moitié du produit.

### F. LittleFS et OTA sous pression

*Protocole* : téléversement de paquets de langue pendant une sauvegarde d'équipements (les trois
écrivains async posent désormais `git.lockFS`) ; OTA interrompu par coupure secteur à mi-flash ;
OTA à `largest` sciemment dégradé. **Témoin** : le `git.lockFS` retiré mentalement — c'est-à-dire
vérifier qu'on sait reproduire le crash `lfs_mlist_isopen` sur une version antérieure via
`git worktree`, sinon on ne prouve rien du correctif.

### G. Radio RTS — *entré au périmètre le 30/08, module confirmé actif*

`radioInit:true`, `radioBoardType:1`, TX 21 / RX 22, 433,42 MHz. Aucun moteur en face : les trames
partent dans le vide, ce qui suffit à éprouver tout le firmware.

*Protocole* : (i) **persistance du code tournant** — relever `lastRollingCode` de chaque équipement,
émettre 200 commandes, redémarrer, vérifier que le code repris est ≥ celui émis, jamais en recul —
un recul est une perte de synchronisation définitive avec un vrai moteur ; (ii) **préemption** —
émettre en continu pendant les rafales HTTP de l'axe C, `async_tcp` étant épinglée sur le cœur 0
justement pour ne pas couper l'émission bit-bangée de `loopTask` sur le cœur 1 ; (iii) **réception
concurrente** — laisser le récepteur ouvert pendant les 72 h de la phase 5. **Témoin** : émettre
une trame vers un identifiant inexistant doit produire une trace, sinon on ne mesure que le silence.

---

## 6. Critères de sortie — figés

| | Critère | Seuil |
|---|---|---|
| **G1** | Redémarrage non commandé | **Zéro** sur toute la campagne. `uptime` strictement croissant dans le CSV. Tout redémarrage est éliminatoire tant que sa cause n'est pas classée par la ligne `rst:` |
| **G2** | Pente mémoire | \|pente de `largest`\| < **512 o/h** sur chaque fenêtre de 6 h, et `largest` final ≥ 90 % du plancher atteint à H+1 |
| **G3** | Marge TLS | `largest` au repos ≥ **55 296** (1,5 × 36 864) à tout instant hors creux transitoire, **et** un OTA réel réussit à la fin de chaque phase d'endurance — le seul juge honnête |
| **G4** | Vivacité | p99 de latence `/discovery` < **2 s** sur 24 h, **aucun** dépassement de 10 s |
| **G5** | Intégrité | `sha256` du `/backup` identique après 50 redémarrages ; restauration partielle sans perte réseau/MQTT |
| **G6** | Récupération | Retour nominal < **120 s** après chaque agression, sans intervention |
| **G7** | Capacité clients | Limite pratique **chiffrée**, et `WEBSOCKETS_SERVER_CLIENT_MAX` mis en cohérence ou justifié par écrit |
| **G8** | Code tournant | Aucun recul de `lastRollingCode` sur toute la campagne, redémarrages compris |

Un critère non tenu n'interdit pas la sortie de v3.0.0 — il interdit de la sortir **sans le dire**.

---

## 7. Calendrier

| Phase | Durée | Contenu |
|---|---|---|
| 0 | 2 h | Montage, configuration de référence, témoins positifs |
| 1 | 24 h | Soak au repos — l'hypothèse nulle. Rien ne doit bouger. |
| 2 | 24 h | Soak sous charge nominale (clients, WS, planifications, MQTT, HA) |
| 3 | ½ j | Saturation : balayage clients 1→10, rafales |
| 4 | ½ j | Agressions et récupération (axes C, E, F) |
| 5 | 72 h | Endurance finale, configuration maximale, PIN actif. **C'est elle qui donne le verdict.** |

Total ≈ 6 jours d'immobilisation du boîtier, dont ~5 sans surveillance.

---

## 8. Ce que ce banc ne peut pas prouver — à écrire dans le verdict

- ~~La radio~~ — **levé le 30/08** : le module a été activé, `radioInit:true`,
  `radioBoardType:1`, TX 21 / RX 22. L'axe **G** ci-dessus entre donc dans le périmètre.
- **La dispersion matérielle.** Un exemplaire, une alimentation. Un défaut de carte se lira comme
  un défaut de firmware.
- **L'environnement 8 Mo**, non couvert.
- **La durée réelle.** 72 h ne prouvent pas 6 mois. C'est précisément pourquoi le critère G2 porte
  sur la **pente** et non sur l'absence d'incident : une pente nulle s'extrapole, une absence non.


---

## 9. Journal — Phase 0, close le 30/08/2026 à 20 h 05

**Le banc tourne.** Trois collecteurs actifs, base de temps commune sur `.24`.

### Montage

| Élément | État |
|---|---|
| Capture série | `pyserial` sur `/dev/ttyUSB0`, en continu, avec canal de commande (`serial.cmd` → `m`/`M`/`r` vers `DiagConn`) — vérifié, les marques reviennent |
| `enableDebugLogs` | activé via `/setgeneral` — sans lui `DiagConn` reste muet |
| Sondeur HTTP | `/discovery` (8081) + `/loginContext`, toutes les 20 s → `prober.csv` |
| MQTT | activé vers le courtier `192.168.1.24:1883`, `pubDisco` **volontairement à false** (voir plus bas), collecteur `mosquitto_sub` actif |
| Radio | activée par le user, `radioInit:true` |

### Configuration de référence

14 pièces, **30 équipements**, 14 groupes, 30 liens groupe→équipement, **30 planifications** (mélange
heure fixe / lever / coucher, cibles équipements et groupes).

Les plafonds réels sont **30 / 14 / 14 / 30** pour des maxima annoncés de 32 / 16 / 16 / 32 : les
allocateurs s'arrêtent à `MAX − 2`, mesuré par refus effectif sur les quatre familles. Le constat
F-1 de l'audit disait `MAX − 1` ; la capacité annoncée dans le README (30/14/14) est, elle, juste.

### Références mesurées

| Repère | Valeur |
|---|---|
| Amorce `rst:` → `Net: Connected` | **7–8 s**, sur trois redémarrages |
| Tas à l'amorce, aucun client | `largest` 98 292 / `free` 98 796 |
| Tas au repos, boîtier vide, aucun client | `largest` **73 716**, invariant sur 12 échantillons / 4 min |
| Coût d'**un** onglet navigateur | 98 292 → 73 716, soit **−24 576** de `largest` (6 × 4096, cf. le plateau documenté) |
| Régime établi, config complète + MQTT + 2 clients | `largest` **65 524**, plateau confirmé par le détecteur embarqué |
| Marge G3 dans ce régime | 65 524 / 36 864 = **×1,78** — tient, mais l'axe B mordra dessus |
| Sauvegarde de référence | 13 279 octets, `sha256` `636eeb8e050f2693…` |
| Débit série | 143 o/s pour un plafond de 11 520 — aucune signature de corruption CP2102 |
| `Guru Meditation` / `abort` / `backtrace` | **0** |

### Témoins positifs posés

- **G1** : `PUT /reboot` commandé → le sondeur voit `uptime` passer de 891 à 18, et la série porte
  `rst:0xc (SW_CPU_RESET)`. La chaîne de détection des redémarrages **voit** ce qu'elle doit voir.
- **G5** : cycle 1/50 (sauvegarde → redémarrage → sauvegarde) **identique octet pour octet**.
- Un premier écart de sauvegarde a été observé puis **entièrement expliqué** : la référence avait
  été prise avant l'activation MQTT, `hostname` passant de `ESPSomfyRTS` à `192.168.1.24` et son
  octet de longueur de 181 à 182. Ce n'était pas un défaut — mais c'est la démonstration que la
  comparaison octet à octet détecte bien un champ à largeur fixe qui bouge, ce qui est exactement
  la classe de défaut de T-3/T-6/T-7.

### Deux points ouverts, à trancher avant la phase 1

1. **Un onglet Firefox de `.24` est connecté en permanence** (`pid` 3274, socket sur 8080, il se
   reconnecte dans la seconde qui suit chaque redémarrage), et **Home Assistant depuis `.21`**
   l'est aussi — identifiés par la trace (`Socket [0] Connected from 192.168.1.24`,
   `Socket [2] Connected from 192.168.1.21`), pas par déduction. C'est une charge de fond
   **non maîtrisée** : la phase 1 « au repos » exige zéro client hors sondeur, sinon on mesure
   autre chose que l'hypothèse nulle. L'onglet doit être fermé ; HA a sa place en phase 2, pas
   en phase 1.
2. **`pubDisco` laissé à false.** L'activer publie sur `homeassistant/#` et crée des entités dans
   le HA de `.21` — un effet hors du boîtier consommable. À activer sur accord explicite, pour la
   phase 2.

---

## 10. Journal — phase 1 interrompue le 30/08/2026 à 20 h 20, à la demande du user

**Durée effective : 7 minutes** (t0 20:09:51), 23 relevés. Aucun verdict n'en sort, et il ne faut
pas en tirer : 7 minutes ne disent rien de ce que la campagne cherchait à établir. Ce qui suit est
un relevé, pas un résultat.

| Critère | Sur ces 7 minutes |
|---|---|
| G1 redémarrages non commandés | 0 |
| Erreurs sondeur | 0 / 23 |
| G3 marge TLS | `largest` min 69 620 = ×1,89 du seuil |
| G4 latence `/discovery` | médiane 86 ms, p99 169 ms, max 169 ms |
| Série | 0 `Guru Meditation`, 0 `abort`, 0 `Backtrace`, 86 o/s (plafond 11 520) |
| G2 pente | **non calculable** — voir ci-dessous |

La ligne « G2 pente −719 o/h, hors seuil » qu'affiche l'analyseur sur cette fenêtre est un
**artefact d'échantillon court**, pas un signal : un unique creux à 69 620 suivi d'un retour à
73 716, extrapolé à l'heure. Elle est passée de −9 616 à −2 735 puis −719 o/h à mesure que les
relevés s'accumulaient, ce qui est la signature d'un bruit qui se dilue, pas d'une dérive. C'est
précisément pourquoi G2 est défini sur des fenêtres de 6 h.

### Le point de blocage, à trancher avant toute reprise

Home Assistant ne peut pas être éteint sur la durée d'une campagne. Ce n'est pas une objection à la
méthode — HA devient simplement **une partie de la référence** au lieu d'une perturbation, et la
phase 1 mesure alors « au repos avec HA connecté », plus représentatif de l'usage réel. On perd
seulement l'attribution immédiate d'une dérive éventuelle (firmware ou HA ?), qui se règle après
coup par une fenêtre courte sans HA, pas par 24 h.

**Le conflit réel est ailleurs, et il reste entier** : la phase 5 était prévue **PIN actif**, et un
PIN coupe intégralement l'intégration HA (401 REST, WebSocket rejetée, cf. le chantier du 24/08).
Si HA doit rester debout en permanence, les deux exigences sont incompatibles :

- soit la phase 5 se fait **sans PIN**, et la campagne n'éprouve que la moitié du produit — à
  écrire noir sur blanc dans le verdict ;
- soit HA tombe pendant les 72 h finales.

Il n'y a pas de troisième voie tant que le PIN casse l'intégration. C'est un arbitrage, pas un
défaut à corriger.

### État laissé sur le boîtier `.13`

Rien n'a été défait. Configuration de référence en place (14 pièces, 30 équipements, 14 groupes,
30 liens, 30 planifications **actives**), `enableDebugLogs` à true, MQTT activé vers
`192.168.1.24:1883` avec `pubDisco` à false, radio active. Sauvegarde de référence conservée
(13 279 octets, `sha256` `636eeb8e050f2693…`) — c'est l'artefact qui permet de reprendre sans
tout reconstruire.

**À savoir** : les 30 planifications sont actives, dayMask 127, et la radio est allumée. Le boîtier
émettra donc des trames RTS aux heures programmées. Elles partent vers des adresses jamais
appairées (656 297 et suivantes), donc sans effet sur une installation réelle — mais c'est un
effet de bord introduit par la phase 0, pas un état d'origine.
