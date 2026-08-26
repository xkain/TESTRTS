# Audit de performance RAM / CPU — 26/08/2026

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

**L1.1 — Supprimer le `delay(1000)` de `setup()`** · gain **1,0 s** · effort 5 min · risque faible
`SomfyController.ino:76`, entre `WebGitSync::begin()` et `net.setup()`. Hérité du commit initial,
sans commentaire ni justification, alors que tout le reste du fichier est abondamment documenté —
signe d'une temporisation empirique jamais requalifiée. Les deux serveurs qui le précèdent ont
déjà rendu la main (`server.begin()` est non bloquant).
*Vérification* : trace de boot, l'écart `Git sync server started` → `WiFi Mode:` doit tomber à ~0.

**L1.2 — Rendre `recovery.endDetection()` non bloquante** · gain **4,6 s** · effort 1 h · risque faible
`Recovery.cpp:97-124`. La fonction attend le reliquat de `BOOT_TIMEOUT` (5 s) **puis** remet le
compteur de cycles à 0 en NVS. Or la seule décision qui dépend de cette fenêtre — entrer en mode
récupération — est déjà connue à `beginDetection()` (`_cycle >= RECOVERY_CYCLES`, ligne 92). Le
rôle réel de l'attente est donc uniquement de dire « l'appareil a tenu 5 s sans coupure, ce
démarrage est normal, je remets le compteur à zéro ». Ce reset peut être déplacé dans `loop()`,
armé à `millis() >= BOOT_TIMEOUT` : **la fenêtre utilisateur reste de 5 s à la seconde près, le
clignotement de la LED aussi, et le démarrage ne l'attend plus.** Aucune perte fonctionnelle.
*Vérification* : couper l'alimentation 3 fois de suite pendant la fenêtre doit toujours ouvrir le
mode Récupération ; un démarrage nominal suivi de 5 s de fonctionnement doit toujours remettre
`rst_logic/c` à 0 (relire la clé NVS).

**L1.3 — Le scan Wi-Fi préalable à la connexion** · gain **2,5 à 4,2 s** · effort 2 h · risque moyen
`Network.cpp:125`. `scanNetworks(true, false, true, 300, 0, ssid)` — scan **passif**, 300 ms par
canal, 14 canaux. Trois leviers, du moins au plus intrusif :
  a. **Scan actif à 120 ms/canal** au lieu de passif à 300 : ~1,7 s au lieu de 4,2. Un scan actif
     émet des probe requests et voit les mêmes AP plus vite ; le passif n'a d'intérêt que pour les
     canaux DFS (5 GHz), sans objet sur un ESP32 2,4 GHz. **Gain 2,5 s pour un changement d'un
     argument.**
  b. **Restreindre au canal du dernier BSSID connu** (déjà en NVS via `settings.WIFI`) au premier
     essai, et ne balayer les 14 canaux qu'en cas d'échec : ~0,3 s dans le cas nominal.
  c. **Sauter le scan quand `roaming` est désactivé** : le scan ne sert alors qu'à choisir le
     meilleur BSSID d'un SSID qui n'en a qu'un. `WiFi.begin(ssid, pass)` suffit.
*Vérification* : trace de boot, écart `Schedules: 0 schedule(s) loaded` → `WiFi scan done`.

**L1.4 — Les 18,2 s d'association** · gain **potentiellement 15 s** · effort 3 h · à instruire
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

**L2.2 — `max_ms_per_chan` explicite à 120 ms** · gain **~2,5 s par scan** · effort 15 min · risque faible
Sur les cinq sites de `scanNetworks()`. Le défaut Arduino de 300 ms n'a jamais été un choix.

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

1. **L1.1 + L1.2** — 5,6 s de démarrage récupérés en une demi-journée, sans risque fonctionnel.
2. **L2.2** — 15 minutes, ~2,5 s sur chaque scan.
3. **L1.4 (protocole de discrimination)** — une heure de banc décide si les 18,2 s se soldent par
   un argument changé ou par une refonte de la séquence de connexion. À faire tôt : c'est
   l'inconnue qui pèse le plus lourd, et H1 rendrait L1.3 largement caduc.
4. **L1.3** — selon le verdict de L1.4.
5. **L2.1** — la seule vraie dette de la migration ; le motif à recopier existe déjà dans le
   projet (`Transceiver::scanRequest`).
6. **L4.1** — instrumentation CPU, prérequis de tout le reste du lot 4.
7. **L3.3 + L3.4** — deux mesures et un flag, pas du développement.
8. Le reste, selon ce que l'instrumentation aura montré.
