# Audit de performance RAM / CPU — 26/08/2026

> **Mise à jour du 26/08/2026, même journée.** Quatre items appliqués et mesurés sur matériel :
> L1.1, L1.2, L2.2 et L1.4. **Le démarrage passe de 28,78 s à 6,72 s — 22,1 s gagnés, 4,3× plus
> rapide.** Et la question ouverte de cet audit est tranchée : les 18,2 s d'association étaient
> bien le balayage interne du pilote (H1), pas l'AP. Tout ce qui suit décrit l'état d'AVANT ces
> correctifs, sauf les fiches concernées (§5) qui portent leur résultat.
>
> | Étape | Démarrage (3 essais) | Moyenne |
> |---|---|---:|
> | Origine | 28,73 / 28,86 / 28,74 s | 28,78 s |
> | + L1.1 + L1.2 | 22,30 / 23,21 / 22,13 s | 22,55 s |
> | + L2.2 (scan ciblé actif, 120 ms/canal) | 12,18 / 12,18 / 12,23 s | 12,20 s |
> | + L1.4 (`WIFI_FAST_SCAN`) | 6,68 / 6,75 / 6,72 s | **6,72 s** |

Banc : boîtier `192.168.1.13` (esp32dev générique, `[env:esp32]`, v3.0.0, `enableDebugLogs`
actif, aucun volet configuré), AP `Livebox-90A0` canal 1, RSSI −45 dBm. Trace série horodatée
via `/dev/ttyUSB0`, mesures réseau depuis la machine de travail.

---

## À LIRE EN PREMIER — les trois conclusions

**1. Le démarrage dure 28,8 s, et la migration ESPAsyncWebServer n'y est pour rien.**
Mesuré trois fois : 28,73 / 28,86 / 28,74 s entre la dernière réponse HTTP et la première après
redémarrage. La dispersion est de 60 ms sur trois essais — c'est un **enchaînement déterministe**,
pas de la variabilité radio. La décomposition série (§1) attribue ces 28,8 s à quatre postes :
l'association Wi-Fi (18,2 s), le scan Wi-Fi préalable (4,2 s), la fenêtre de récupération (4,6 s)
et un `delay(1000)` en dur. Aucun n'est né de la migration : `git log -S` date le `delay(1000)` et
`WIFI_ALL_CHANNEL_SCAN` du commit initial `bb967ce` (« Migration PlatformIO »), et la fenêtre de
récupération de `06ed605`, tous antérieurs à `19954b2` (étape 1 de la migration async).

**2. La migration a bien introduit une régression de latence, mais ailleurs : elle transforme
chaque opération bloquante en gel de TOUT le service HTTP.** Mesuré : pendant un `/scanaps`, une
requête `/upnp.xml` concurrente met **2,92 s** au lieu de 33-46 ms au repos (§2). Sous l'ancien
`WebServer` synchrone, un scan gelait la boucle principale et la requête en cours ; sous
ESPAsyncWebServer, il gèle l'unique tâche `async_tcp`, donc **toutes les routes et tous les
clients à la fois**. C'est très probablement l'origine du « scan Wi-Fi plus long » ressenti : le
scan lui-même n'a pas changé de durée, c'est l'interface entière qui se fige pendant qu'il tourne.

**3. La mémoire n'est pas en tension.** Après démarrage : plus gros bloc contigu 86 004 octets,
libre total 90 496, sur une région utile de 113 840 (§3). Les corrections d'août ont fait leur
travail. Les gains RAM restants sont réels mais modestes (≈ 8 à 12 Ko) et aucun n'est urgent — à
traiter après les lots de latence, qui sont dix fois plus rentables.

---

## 1. Décomposition du démarrage — 29,96 s du reset à l'adresse IP

Trace série horodatée, reset matériel à t = 0 :

| Phase | de | à | durée | poste |
|---|---:|---:|---:|---|
| Bootloader + init Arduino | 0,000 | 0,618 | **0,62 s** | plateforme |
| `LittleFS.begin()` + `settings.begin()` | 0,618 | 0,994 | **0,38 s** | nous |
| `recovery.endDetection()` — attente pure | 0,994 | 5,599 | **4,61 s** | nous |
| `webServer.begin()` + `WebGitSync::begin()` | 5,599 | 5,599 | ~0 s | nous |
| `delay(1000)` en dur | 5,599 | 6,600 | **1,00 s** | nous |
| `net.setup()` + `somfy.begin()` + `schedule.begin()` | 6,600 | 6,933 | **0,33 s** | nous |
| Scan Wi-Fi passif (14 canaux × 300 ms) | 6,933 | 11,138 | **4,21 s** | nous |
| Association Wi-Fi (`WiFi.begin` → `STA_CONNECTED`) | 11,138 | 29,357 | **18,22 s** | à établir |
| DHCP (`STA_CONNECTED` → `GOT_IP`) | 29,357 | 29,957 | **0,60 s** | réseau |

**10,2 s sont immédiatement récupérables** (fenêtre de récupération + `delay` + scan préalable)
sans toucher à une seule fonctionnalité. Les 18,2 s d'association sont le poste dominant et le
seul dont la cause n'est pas établie — voir L1.4.

### Ce que la trace dit de l'association

Entre `WiFi begin...` (11,138) et `WiFi connected` (29,357), **aucune ligne**. En particulier
aucun `WiFi disconnected` : `Network::networkEvent()` le journalise sur
`ARDUINO_EVENT_WIFI_STA_DISCONNECTED` et les `DBG_*` passent bien (les lignes voisines s'affichent).
Il n'y a donc **pas** de cycle échec/reprise : c'est une tentative unique qui met 18,2 s. Et elle
les met à 60 ms près, trois fois de suite.

---

## 2. Le scan Wi-Fi — 6,25 s, et il gèle tout le serveur

| Mesure | Valeur |
|---|---|
| `/scanaps` complet | **6,25 s** (3,90 s sur un second essai) |
| `/upnp.xml` au repos | 33 à 46 ms |
| `/upnp.xml` lancé 1 s après un `/scanaps` | **2 922 ms** |
| `/upnp.xml` suivants (scan terminé) | 268 ms puis 33-44 ms |

La requête concurrente attend exactement le reliquat du scan, puis le service reprend d'un coup.
`handleScanAps()` (`WebNetwork.cpp:60`) appelle `WiFi.scanNetworks(false, true)` **sur async_tcp**,
et le commentaire d'en-tête assume déjà ce blocage — mais il en évalue le coût comme « les autres
clients HTTP/WebSocket » alors que la mesure montre un gel intégral du service, y compris des
routes sans rapport.

Deux autres scans bloquants vivent sur le même chemin :
- `WifiSettings::ssidExists()` (`ConfigSettings.cpp:897`), appelé par `/connectwifi` ;
- `WifiSettings::printNetworks()` (`ConfigSettings.cpp:867`), un scan bloquant **destiné à un
  affichage série de diagnostic** — sous `enableDebugLogs`, mais bloquant tout de même.

**Durée du scan lui-même.** Arduino passe `max_ms_per_chan = 300` par défaut. 14 canaux × 300 ms
= 4,2 s de plancher, ce qui colle exactement aux 4,21 s mesurés au démarrage et explique les
6,25 s de `/scanaps` (scan actif + retours au canal de service, puisqu'on est associé). Le
paramètre est explicite dans `Network.cpp:125` et `:133` (300), implicite ailleurs.

---

## 3. Mémoire — état des lieux mesuré

### Tas, après démarrage réseau (dump de référence à t = 32,9 s)

```
largest_free_block  86 004      free total  90 496      allocated  119 068
```

Neuf régions, mais **une seule porte du libre utile** : `0x3ffe4350`, 113 840 octets, dont
90 404 libres et 86 004 d'un seul tenant. Les huit autres (≈ 111 Ko) sont pleines à 100 %. C'est
cette région unique qui décide de tout : poignée de main TLS (36 864 octets contigus réclamés par
`GIT_TLS_MIN_HEAP_BYTES`), pile `async_tcp`, sessions clientes.

### RAM statique

| Section | Taille |
|---|---:|
| `.dram0.data` | 28 632 |
| `.dram0.bss` | 78 344 |
| **Total statique** | **106 976** |
| `.iram0.text` | 89 099 |

Les plus gros symboles à nous (`nm --size-sort`) :

| Symbole | Taille | Remarque |
|---|---:|---|
| `somfy` | **26 624** | 32 volets / 16 groupes / 16 pièces, dont 2 par tableau inatteignables (F-1) |
| `g_deferSlots` | 4 968 | 6 × 828 — déjà dimensionné et justifié, ne pas y toucher |
| `g_content` (Web) | 4 096 | tampon de réponse partagé |
| `rx_queue` | 3 676 | file RF |
| `sockServer` | 2 512 | 10 emplacements WebSockets |
| `git` | 2 432 | |
| `g_response` (Sockets) | 2 048 | voie directe |
| `g_content` (MQTT) | 2 048 | homonyme, `static` — piège de lecture, pas un bug |
| `SSDP` | 1 852 | |
| `schedule` | 1 892 | |

### Flash

`firmware.bin` = 1 473 792 octets sur une partition `app0` de 1 769 472 → **83,3 % occupés**,
295 680 libres. `.flash.text` 1 057 131 + `.flash.rodata` 291 324. LittleFS : 524 288 octets pour
≈ 197 Ko d'assets. Marge suffisante mais pas confortable : toute croissance de code doit rester
sous surveillance, l'OTA exigeant deux partitions de cette taille.

---

## 4. Ce qui n'est PAS un problème — à ne pas ré-auditer

Vérifié et mesuré, pour éviter d'y perdre du temps :

- **Le service HTTP est rapide.** `/` 40 501 o en 140 ms, `/index.js` 105 824 o en 293 ms,
  `/index.css` 29 622 o en 133 ms, `/upnp.xml` en 37 ms, `/controller` en 24 ms. Le chargement
  complet de l'interface fait **6 requêtes** et rien n'y est redondant sauf le point ci-dessous.
- **Les documents JSON sont tous statiques et petits** (`StaticJsonDocument<128>` à `<768>`) :
  aucune allocation de tas volumineuse par requête dans les handlers.
- **`g_deferSlots`, `SOCK_DEFER_BUF`, la pile `async_tcp`** : déjà mesurés et arbitrés en août,
  chaque valeur porte sa justification. Le seul reste est L3.3 ci-dessous.
- **Le tas ne fuit pas au repos** : `largest` oscille entre 73 et 94 Ko par pas de 4 096 (blocs de
  session), et remonte (`reprise de 77812 -> 81908`).

---

## 5. Feuille de route

Lots ordonnés par rapport gain/risque. Chaque item porte son protocole de vérification : le banc
de mesure de cet audit est reproductible en une commande (§6).

### LOT 1 — Démarrage : 10,2 s prouvés + 18,2 s à instruire

**L1.1 — Supprimer le `delay(1000)` de `setup()`** — ✅ **FAIT le 26/08/2026** · gain **1,0 s**
`SomfyController.ino:76`, entre `WebGitSync::begin()` et `net.setup()`. Hérité du commit initial,
sans commentaire ni justification, alors que tout le reste du fichier est abondamment documenté —
signe d'une temporisation empirique jamais requalifiée. Les deux serveurs qui le précèdent ont
déjà rendu la main (`server.begin()` est non bloquant).
*Vérification* : trace de boot, l'écart `Git sync server started` → `WiFi Mode:` doit tomber à ~0.

**L1.2 — Rendre `recovery.endDetection()` non bloquante** — ✅ **FAIT le 26/08/2026** · gain **4,6 s**
`Recovery.cpp`. La fonction attendait le reliquat de `BOOT_TIMEOUT` (5 s) **puis** remettait le
compteur de cycles à 0 en NVS. Or la seule décision qui dépend de cette fenêtre — entrer en mode
récupération — est déjà connue à `beginDetection()` (`_cycle >= RECOVERY_CYCLES`). Le rôle réel de
l'attente était donc uniquement de dire « l'appareil a tenu 5 s sans coupure, ce démarrage est
normal, je remets le compteur à zéro ». Ce reset est passé dans `loop()` via `loopDetection()`,
armé à `millis() >= BOOT_TIMEOUT` : la fenêtre utilisateur reste de 5 s à la milliseconde près, le
retour visuel aussi, et le démarrage ne l'attend plus.
**L'attente est CONSERVÉE telle quelle quand le mode Récupération est acquis** (cycle atteint ou
`forceRequest()`) : rien à gagner à écourter le démarrage d'un appareil qui ne démarrera pas, et
les 5 s de clignotement rapide sont le seul signe qui confirme à l'utilisateur qu'il a atteint le
cycle. Un redémarrage volontaire ferme la fenêtre avant de partir (`closeDetection()`), sans quoi
trois `/reboot` d'affilée auraient ouvert la récupération sans aucune coupure d'alimentation.

### Résultat mesuré de L1.1 + L1.2 (matériel, `.13`, 26/08/2026)

| | avant | après |
|---|---:|---:|
| Indisponibilité au redémarrage | 28,73 / 28,86 / 28,74 s | **22,30 / 23,21 / 22,13 s** |
| Moyenne | 28,78 s | **22,55 s** |

**6,2 s gagnés**, soit un peu plus que les 5,6 s attendus. La dispersion monte de 60 ms à ~550 ms :
le scan Wi-Fi démarrant désormais 5,6 s plus tôt, sa phase par rapport aux balises de l'AP n'est
plus la même à chaque essai — c'est le comportement normal d'un scan, et c'est cette régularité
artificielle d'avant qui était le symptôme.

**Éprouvé sur matériel** :
- Le démarrage nominal : trois redémarrages consécutifs sans entrée en mode Récupération prouvent
  que `loopDetection()` remet bien `rst_logic/c` à zéro à chaque fois.
- **Les 3 coupures d'alimentation ouvrent toujours le mode Récupération**, et le témoin s'allume
  bien pendant les 5 s de fenêtre — vérifié par débranchement/rebranchement réels le 26/08/2026.
  C'est aussi la validation de la cohabitation avec `StatusLed` : aux cycles 1 et 2, ces 5 s
  passent par le nouveau `loopDetection()`, en parallèle d'un `StatusLed::begin()` qui s'exécute
  désormais pendant la fenêtre au lieu d'après elle.
- Le clignotement lent (800 ms) une fois **dans** le mode Récupération n'est pas une nouveauté :
  il est dans `Recovery::loop()` depuis l'origine (ligne 374), simplement jamais vu faute de LED
  configurée sur le banc.

**Reste non éprouvé** : rien pour L1.2.

**L1.3 — Le scan Wi-Fi préalable à la connexion** · levier (a) FAIT via L2.2 · reste ~1,7 s
`Network.cpp:125`. Le levier (a) — scan actif à 120 ms au lieu de passif à 300 — a été appliqué
sous L2.2 : le scan préalable tombe de 4,21 s à ~1,7 s. Les deux autres restent ouverts, et ne
valent plus que ~1,4 s chacun maintenant que L1.4 a supprimé l'effet de levier qui les rendait
coûteux :
  b. **Restreindre au canal du dernier BSSID connu** (déjà en NVS via `settings.WIFI`) au premier
     essai, et ne balayer les 14 canaux qu'en cas d'échec : ~0,3 s dans le cas nominal.
  c. **Sauter le scan quand `roaming` est désactivé** : le scan ne sert alors qu'à choisir le
     meilleur BSSID d'un SSID qui n'en a qu'un. `WiFi.begin(ssid, pass)` suffit. C'est le cas du
     boîtier de test (`roaming = false`), et probablement de la plupart des installations
     domestiques.
*Vérification* : trace de boot, écart `Schedules: 0 schedule(s) loaded` → `WiFi scan done`.

**L1.4 — Les 18,2 s d'association** — ✅ **FAIT le 26/08/2026, H1 CONFIRMÉE** · gain **5,5 s** de plus
`WiFi.setScanMethod(WIFI_FAST_SCAN)` au lieu de `WIFI_ALL_CHANNEL_SCAN`, aux deux sites qui le
posent (`Network::setup()` et `Network::connectWiFi()`). Une ligne, mesurée : **12,20 s → 6,72 s**.

Le mécanisme, désormais établi. Ce réglage n'agit pas sur nos propres appels à `scanNetworks()` :
il entre dans le `wifi_config_t` et gouverne le scan que le pilote refait **lui-même** à chaque
`esp_wifi_connect()`, avant d'associer. En `ALL_CHANNEL`, ce scan interne rebalayait les 14 canaux
en réutilisant les paramètres de scan courants — d'où l'enchaînement complet :

- le scan **passif à 300 ms/canal** de `Network::loop()` posait 4,2 s par balayage ;
- le pilote rejouait ce balayage à la connexion, plusieurs fois : **18,2 s ≈ 4 × 4,2 s**, ce qui
  explique enfin le déterminisme à 60 ms près qui rendait l'hypothèse « c'est l'AP » intenable ;
- L2.2 (actif, 120 ms) a fait tomber le balayage à ~1,7 s, et l'association a suivi
  **mécaniquement** : 22,55 → 12,20 s, alors que L2.2 ne devait économiser que 2,5 s sur le scan
  lui-même. C'est ce gain inexpliqué qui a désigné le coupable avant même de tester L1.4 ;
- `FAST_SCAN` supprime le balayage résiduel : le pilote s'arrête au premier AP correspondant.

Aucune perte pour l'itinérance : c'est notre scan qui élit le meilleur BSSID, et `connectWiFi()`
comme `changeAP()` passent ensuite ce BSSID et son canal explicitement à `WiFi.begin()`, ce qui
court-circuite de toute façon le choix du pilote. `setSortMethod()` devient sans objet dans ce mode
et n'est conservé que par cohérence.

H2 (comportement de l'AP) est donc écartée, et `Network::end()` n'a pas été touché.

<details><summary>Les deux hypothèses telles qu'elles étaient posées avant la mesure</summary>

Poste dominant, cause non établie. Deux hypothèses, classées :

  - **H1 (probable) — le balayage complet interne du pilote.** `Network::setup()` pose
    `WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN)` + `WIFI_CONNECT_AP_BY_SIGNAL` (lignes 35-36),
    re-posés dans `connectWiFi()` (450-451). Ces réglages entrent dans le `wifi_config_t` et
    **font rescanner les 14 canaux au pilote à chaque `esp_wifi_connect()`**, avant même de tenter
    l'association — alors que notre code vient précisément de scanner lui-même pour lui fournir un
    BSSID et un canal explicites. Le balayage interne est donc doublement redondant, et son
    caractère programmé expliquerait le déterminisme à 60 ms près. Le défaut IDF,
    `WIFI_FAST_SCAN`, s'arrête au premier AP correspondant.
  - **H2 — comportement de l'AP.** La Livebox conserverait l'ancienne association après un
    redémarrage sans désassociation propre (`Network::end()` coupe SSDP, MQTT et les sockets mais
    n'appelle jamais `WiFi.disconnect()`). Moins probable : un délai côté AP serait bruité, pas
    reproductible à 60 ms.

  *Protocole de discrimination, une heure de banc* : construire trois variantes et mesurer chacune
  trois fois sur `.13` avec le script de §6 —
  (i) `WIFI_FAST_SCAN` au lieu de `WIFI_ALL_CHANNEL_SCAN` ; (ii) `WiFi.begin(ssid, pass)` sans
  BSSID ni canal ; (iii) `WiFi.disconnect(true, false)` ajouté dans `Network::end()` avant
  `ESP.restart()`. Si (i) ou (ii) effondre les 18,2 s → H1, et le correctif se réduit à un
  argument. Si seule (iii) agit → H2. Si aucune → monter `CORE_DEBUG_LEVEL` à 4 et lire les
  transitions du pilote entre `WiFi begin...` et `WiFi connected`.

  *Attention en traitant H1* : `WIFI_CONNECT_AP_BY_SIGNAL` et le scan de L1.3 servent l'itinérance
  (`settings.WIFI.roaming`). Basculer en `FAST_SCAN` doit rester compatible avec `changeAP()`, qui
  passe lui aussi un BSSID explicite.

</details>

### LOT 2 — Supprimer les gels du service HTTP (la vraie régression de la migration)

**L2.1 — Sortir les scans bloquants d'`async_tcp`** · gain **2,9 s de gel supprimés** · effort 4 h · risque moyen
Trois appelants (`handleScanAps`, `ssidExists` via `/connectwifi`, `printNetworks`) exécutent un
scan bloquant de 2 à 6 s sur l'unique tâche `async_tcp`. Deux modèles possibles :
  a. **Déléguer à loopTask** — `Transceiver::loop()` a déjà exactement ce motif pour le scan de
     fréquence RF (`scanRequest.exchange(SCAN_REQ_NONE)`, `SomfyRadioDriver.cpp:905`) : le handler
     dépose une demande atomique, la tâche principale l'exécute, le client sonde le résultat. Le
     motif est éprouvé dans le projet et son verrou (`Network::lockScan`) existe déjà.
  b. **Scan asynchrone + sondage** — `scanNetworks(true, ...)` puis `scanComplete()`, ce que
     `Network::loop()` fait déjà pour son propre scan. Le commentaire de `handleScanAps` l'écarte
     comme « complexité non justifiée » : cette évaluation datait d'avant la mesure du gel.
  Le choix (a) a un avantage décisif : il remet le scan là où il était **avant** la migration, sur
  la boucle principale, donc restaure le comportement de latence de la v2.
*Vérification* : rejouer le test de §2 — la requête concurrente doit rester sous 100 ms.

**L2.2 — `max_ms_per_chan` explicite** — ✅ **FAIT le 26/08/2026** · gain **10,4 s** au démarrage
Explicite sur les cinq sites, mais avec **deux valeurs distinctes**, ce que la fiche d'origine
n'avait pas anticipé — et c'est la mesure qui a imposé la distinction :

- **Scans ciblés** (`Network::loop()`, qui cherchent un SSID connu pour en élire le meilleur
  BSSID) : **actif à 120 ms/canal** au lieu de passif à 300. Le scan de démarrage tombe de 4,21 s
  à ~1,7 s — et surtout il entraîne l'association avec lui, cf. L1.4 : **22,55 → 12,20 s**, quatre
  fois le gain attendu.
- **Scans d'inventaire** (`/scanaps`, `ssidExists()`, `printNetworks()`, qui veulent tout ce qui
  est visible) : **300 ms/canal maintenus**, c'est-à-dire le défaut Arduino, mais désormais posé
  comme un choix mesuré. Raccourcir à 120 ms les rend presque **deux fois plus lents**, A/B sur
  matériel, quatre appels de `/scanaps` par branche :

  | | mesures | moyenne |
  |---|---|---:|
  | 120 ms/canal | 7,75 / 7,81 / 7,83 / 7,70 s | 7,77 s, très stable |
  | 300 ms/canal | 1,80 / 6,26 / 6,25 / 2,84 s | 4,29 s, bimodale |

  Résultat rendu identique (mêmes AP). Le mécanisme n'est pas établi — une piste est que
  `scan_time.active.min` est câblé à 100 ms par `WiFiScanClass::scanNetworks()` et qu'une fenêtre
  100-120 empêche le pilote d'abréger un canal vide, là où 100-300 lui en laisse la latitude.
  Ce qui est certain est la mesure ; les deux constantes vivent dans `Network.h` avec ce tableau,
  pour que personne ne « ré-optimise » ce site sans rejouer le A/B.

**L2.3 — `printNetworks()` : un scan bloquant pour une trace série** · effort 15 min · risque nul
`ConfigSettings.cpp:867`. Sous `enableDebugLogs`, une fonction de confort déclenche un scan
bloquant complet. Doit réutiliser le résultat du scan en cours (`scanComplete()`) au lieu d'en
provoquer un nouveau, ou disparaître.

**L2.4 — Recenser les autres blocages sur `async_tcp`** · effort 2 h · risque nul
Le motif « appel bloquant dans un handler async » n'a été traité que là où il faisait mal
(`/getReleases` isolé sur 8082, `g_content` rendu transitoire). Il faut la liste complète :
tout `LittleFS` en écriture, tout `settings.save()` (NVS, effacement de secteur flash), tout
`WiFi.*` bloquant atteint depuis un handler. `/setLang` et `/setPendingLang` écrivent en NVS à
chaque appel, sur async_tcp.

### LOT 3 — Mémoire (≈ 8 à 12 Ko, aucun urgent)

**L3.1 — Les emplacements inatteignables des tableaux Somfy** · gain **~1,7 Ko** · effort 1 h · risque faible
F-1, confirmé sur matériel le 24/08 : `SomfyRegistry.cpp:252` boucle `i < SOMFY_MAX_SHADES - 1`
en partant de 1, donc 30 volets utilisables sur 32 alloués — idem groupes et pièces. Soit deux
`SomfyShade` (~800 o pièce) et quatre entrées de groupe/pièce en RAM statique, définitivement
inaccessibles. **Décision de capacité, pas correction** : soit aligner les macros sur le réel
(32 → 30) et récupérer la RAM, soit corriger les allocateurs et gagner 2 volets. Les deux sont
défendables ; ne pas laisser l'écart en l'état.

**L3.2 — `g_content` : 4 096 octets permanents** · gain **4 Ko** · effort 3 h · risque moyen
Tampon de réponse statique, occupé en permanence pour un usage transitoire. `WebGitSync` a déjà
migré vers une allocation à la requête (structure RAII, décision du 24/08) avec un coût nul au
repos. Le même traitement appliqué au tampon principal rendrait 4 Ko à la région critique. À
peser : ces 4 Ko sont aujourd'hui hors du tas, donc ils ne fragmentent pas ; les rendre au tas les
expose au plateau connu. **Gain net à mesurer sur `largest`, pas à supposer.**

**L3.3 — Pile `async_tcp` : 12 288 → 8 192** · gain **4 Ko de tas** · effort 2 h · risque faible
`platformio.ini` documente déjà la condition exacte de cette réduction : le pic mesuré est de
3 540 octets sur trois chemins très différents, et il ne manque que le relevé du chemin **upload**
(`/restore` ou une mise à jour firmware), le seul qui descende dans `Update.write()`.
`reportAsyncTcpStackLow()` est déjà en place. **C'est une mesure à faire, pas un développement.**

**L3.4 — `CONFIG_ASYNC_TCP_QUEUE_SIZE` non posé** · effort 30 min · risque : c'est une assurance
Le fork actif a vécu l'incident (file `_async_queue` saturée par des transferts concurrents →
pile LWIP à terre sur tous les ports, cycle d'alimentation nécessaire) et l'a réparé en portant la
valeur de 64 à 128. Nous tournons sur le même AsyncTCP 3.3.2, sans le garde-fou. Poser la valeur
explicitement — même au défaut — la rend visible et instrumentable, comme cela a été fait pour
`CONFIG_ASYNC_TCP_STACK_SIZE`.

**L3.5 bis — Un `max heap` relevé à 45 044 après une session de récupération** · 26/08/2026
Observé par l'utilisateur au retour du mode Récupération. **Ce n'est pas une régression des
correctifs du jour**, vérifié sur pièces :

| Situation | `largest` |
|---|---:|
| Démarrage frais, 1 client WebSocket, firmware du jour | **77 812** |
| Même chose dans la trace de référence d'ORIGINE (avant tous les correctifs) | **77 812** |
| Après 6 cycles de chargement complet de l'interface | 73 716, stable |
| 4 sessions WebSocket concurrentes puis refermées | 65 524, **remonté** à 73 716 |
| Relevé de l'utilisateur | 45 044 |

Trois choses en ressortent. La valeur post-démarrage est **identique au chiffre** de la trace
d'origine, donc rien n'a bougé de ce côté. Le tas **se résorbe** quand les sessions se ferment, ce
qui écarte la fuite. Et 45 044 = 77 812 − **8 × 4 096**, un multiple exact du pas de 4 096 qui
apparaît partout dans les traces `[HEAP-DEBUG]` d'origine (« chute de 94196 -> 90100 (-4096) »,
« reprise de 77812 -> 81908 (+4096) ») — le pas d'un bloc de session.

Ce que je n'ai pas pu faire : descendre aussi bas. Mon plancher a été 65 524 avec cinq sessions
concurrentes ; il manque donc au moins trois blocs pour reproduire 45 044, et l'activité qui les
a posés n'est pas identifiée (page Firmware et sa session TLS ? clients restés associés à l'AP de
récupération ?). **Le firmware sait déjà se diagnostiquer tout seul ici** : le détecteur de plateau
d'`emitHeap()` déclenche `dumpHeapBlocks()` sur toute chute de plus de 8 Ko non résorbée au bout de
20 s, et ce dump nomme les blocs. Il sort sur la liaison série, hors d'atteinte ce jour-là (cf. §6).
**À reproduire port série rebranché** — c'est la seule mesure qui manque, et elle est déjà outillée.

**L3.5 — Le plateau mémoire de la page Firmware** · effort inconnu · toujours ouvert
Seul reliquat de l'enquête heap : `getReleases()` coûte ~35 Ko transitoires et `largest` se fige
sur un plateau (77 812 → 53 236 après 32 appels) qui ne se résorbe pas. Marge au plateau :
1,44 × `GIT_TLS_MIN_HEAP_BYTES`. Sans conséquence tant qu'on ne descend pas, mais c'est le seul
mécanisme du firmware qui dégrade durablement l'appareil.

### LOT 4 — CPU et instrumentation

**L4.1 — Il n'existe aucune mesure de la charge CPU** · effort 3 h · risque nul · **prérequis**
C'est le trou de cet audit : je peux chiffrer les latences (réseau, série) mais pas dire quelle
fraction du temps de `loopTask` va à quoi, ni à quelle fréquence tourne `loop()`. Le projet a déjà
la bonne primitive (`reportAsyncTcpStackLow()` nomme le chemin à chaque nouveau minimum de pile) —
il manque son équivalent temporel : compteur de tours par seconde, et `uxTaskGetSystemState()` ou
`vTaskGetRunTimeStats()` publiés dans `memStatus`. **Sans cette mesure, tout le lot 4 reste
spéculatif** — et la règle du projet est qu'un correctif non éprouvé est une hypothèse.

**L4.2 — 32 volets balayés à chaque tour de boucle** · gain à mesurer (L4.1 d'abord)
`SomfyRegistry.cpp:645` : `checkMovement()` + `setGPIOs()` + `publishMovementState()` pour chaque
emplacement occupé, à chaque tour, sans temporisation. `checkMovement()` n'est pas trivial (calcul
de position, tilt, capteurs). Avec 30 volets c'est 90 appels par tour, alors que la position ne
peut changer que pendant un mouvement. Piste : un compteur de volets réellement en mouvement, et
un balayage complet à cadence réduite (100 ms) hors mouvement.

**L4.3 — `loop()` tourne sans respiration** · à qualifier après L4.1
Aucun `delay()` ni `vTaskDelay()` : la boucle occupe 100 % du cœur 1 en permanence, et
`esp_task_wdt_reset()` y est appelé huit fois par tour. Ce n'est pas nécessairement un défaut
(l'émission RF est bit-bangée en `delayMicroseconds()` et veut un cœur disponible), mais ça
empêche toute réduction de fréquence et ça mérite d'être une décision consciente plutôt qu'un
héritage.

**L4.4 — `/lang` et `/langDefault` servent le même fichier** · gain 21 Ko par chargement de page
Mesuré sur `.13` : les deux routes rendent **68 099 octets identiques** (21 807 transférés
chacune). Cause : `settings.language` désigne une langue absente du filesystem, `handleLang()`
retombe donc sur la langue embarquée — mais **il ne le dit pas au client**, et `handleLangDefault()`
ne peut plus déclencher son `204` (`WebI18n.cpp:60`, qui ne teste que `settings.language`). Le
repli du client (`10-core-utils.js:170`) télécharge alors un dictionnaire de secours identique au
principal. **Correctif d'une ligne** : que `handleLangDefault()` réponde 204 aussi quand
`handleLang()` a servi la langue embarquée — c'est-à-dire quand le fichier de `settings.language`
n'existe pas. Cas de figure fréquent : un flash LittleFS local efface `/locale/*.json.gz` alors
que `settings.language` survit en NVS.

**L4.5 — `404: /modules` récurrent** · effort 30 min · risque nul
Un client du réseau (probablement l'intégration Home Assistant sur `.21`) interroge périodiquement
une route inexistante. Coût unitaire négligeable, mais une requête qui échoue en boucle mérite
d'être identifiée : soit la route existe ailleurs et l'UI/HA a une URL périmée, soit c'est une
sonde à ignorer explicitement.

---

## 6. Reproduire les mesures

**Temps de démarrage** (trois essais, sans matériel série) :

```bash
T0=$(date +%s.%N); curl -s -m 5 -X PUT "http://192.168.1.13/reboot" >/dev/null; while curl -s -m 1 -o /dev/null "http://192.168.1.13/upnp.xml"; do sleep 0.2; done; TD=$(date +%s.%N); while ! curl -s -m 2 -o /dev/null "http://192.168.1.13/upnp.xml"; do sleep 0.1; done; echo "indisponible pendant $(echo "$(date +%s.%N)-$TD"|bc)s"
```

**Décomposition série horodatée** : lire `/dev/ttyUSB0` à 115200 en préfixant chaque ligne du
temps écoulé depuis `Startup/Boot....`, et déclencher le redémarrage par HTTP plutôt que par
DTR/RTS (le reset par lignes de contrôle laisse le CP2102 dans un état où il resservait des
données corrompues — vérifié pendant cet audit : 200 ko/s de garbage sur un port à 11,5 ko/s).

**Gel du service pendant un scan** :

```bash
(curl -s -o /dev/null -w "SCAN %{time_total}\n" http://192.168.1.13/scanaps &); sleep 1; for i in 1 2 3; do curl -s -o /dev/null -w "  concurrent ttfb=%{time_starttransfer}\n" http://192.168.1.13/upnp.xml; done
```

**RAM statique** :

```bash
~/.platformio/packages/toolchain-xtensa-esp32/bin/xtensa-esp32-elf-nm --size-sort -S -C .pio/build/esp32/firmware.elf | awk '$3=="b"||$3=="B"||$3=="d"||$3=="D"' | tail -40
```

---

## 7. Ordre d'exécution conseillé

1. ~~**L1.1 + L1.2 + L2.2 + L1.4**~~ — **FAITS le 26/08/2026**, 22,1 s mesurés (28,78 → 6,72 s).
   Reste à éprouver sur matériel : les 3 coupures d'alimentation et le témoin sur une carte qui en
   a un (L1.2), et le scan d'itinérance sur une installation où `roaming` est activé (L2.2).
2. **L2.1** — désormais la seule vraie dette de la migration, et le premier poste de latence
   restant ; le motif à recopier existe déjà dans le projet (`Transceiver::scanRequest`).
3. **L4.1** — instrumentation CPU, prérequis de tout le reste du lot 4.
4. **L4.4** — le doublon `/lang` + `/langDefault`, correctif d'une ligne, 21 Ko par chargement.
5. **L3.3 + L3.4** — deux mesures et un flag, pas du développement.
6. **L1.3 (b) et (c)** — ~1,4 s encore récupérables sur le démarrage, mais le rapport
   effort/gain a beaucoup baissé maintenant que le démarrage tient en 6,7 s.
7. Le reste, selon ce que l'instrumentation aura montré.
