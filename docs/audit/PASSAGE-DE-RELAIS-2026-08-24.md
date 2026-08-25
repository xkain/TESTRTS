# Passage de relais — 24/08/2026

État de l'audit v3.0.0 à la fin de la session des 23-24/08. Rapport de référence :
[`AUDIT-2026-08-23.md`](AUDIT-2026-08-23.md) ; volet MQTT : [`MQTT-2026-08-23.md`](MQTT-2026-08-23.md).

---

## Ce qui est fait

**Tous les constats de l'audit sont corrigés sauf P-1** : 6 critiques (C-1 → C-6), 19 élevés
(E-1 → E-19), **les 24 moyens** (M-1 → M-24) et P-2 → P-8.

S'y ajoutent, hors numérotation, les défauts trouvés en accompagnant des problèmes de terrain :
le chantier MQTT complet (points 1-4 et A-K, cf. son document dédié) et trois constats du 24/08
consignés dans le rapport principal (fetch GitHub armé par `/getAvailableLangs`, écriture d'upload
en échec rapportée comme succès, absence totale de journalisation sur `/uploadLang`).

`main` est à jour, les quatre environnements (`esp32dev`, `box_wifi`, `box_eth`, `esp32dev_cors`)
compilent, le garde-fou i18n passe.

### Validé sur matériel

- **OTA complète, PIN activé, réussie du premier coup** — couvre E-13 → E-19.
- **M-1 et M-2** par requêtes REST directes (`curl`).
- **Le chantier MQTT** dans son intégralité (index, noms, nettoyage, découverte, position en
  mouvement).
- **Le téléversement de langue** : import navigateur de `fr.json` (24 006 octets), installé.
- **Le régime mémoire** : `min_free` de la région principale passé de 2 532 à 26 760 octets,
  plancher du plus gros bloc contigu de 38 900 à **65 524** — le palier stable documenté le
  17/08 — soit 1,8× le seuil TLS au lieu de 1,3×.

### Campagne de validation matérielle — 24/08/2026

Boîtier `192.168.1.13`, firmware `v3.0.0` déjà à jour, PIN de test `1234` posé pour la durée de la
campagne. Trois volets et un groupe de test ont été **fabriqués** sur l'appareil (`Test tiltonly`
en `tiltonly`, `Test upTime zero` à `upTime = 0`, `Test standard` en `tiltmotor`, plus un groupe
les liant).

**Le « blocage » supposé n'existait pas.** J'avais d'abord écarté M-6/M-7/M-8/M-9/M-14/M-24 « faute
de volet appairé » : c'est faux, et cette erreur d'appréciation a failli clore la campagne à
mi-chemin. **Aucun moteur physique n'est nécessaire** — un volet simplement *configuré* suffit à
éprouver toute la logique firmware (pas-à-pas, cibles, tilt, MQTT, planification), les trames RF
partant simplement dans le vide.

**Validés sur appareil :**

| # | Contrôle effectué | Résultat |
|---|---|---|
| M-1 | `/shade?shadeId=255`, `=0`, `=33` ; `/group?groupId=255` | refus propre, aucun emplacement vide rendu |
| M-10 | `/setgeneral` avec **seulement** `posixZone` | `UTC0` → `CET-1CEST,...` enregistré |
| M-12 | pièce nommée avec `0x01`, `0x0B`, `0x1F` | sortis en `\u0001`/`\u000b`/`\u001f` ; `/addRoom`, `/rooms`, `/controller` analysables |
| M-13 | `GET /sendRemoteCommand?address=1&rcode=1` **sans** `command` | 200, plus d'opcode issu de la pile |
| M-16 | 4 PIN faux → 429 `retryAfter:15` ; bon PIN refusé pendant le verrou ; échec suivant → 30 s | repli exponentiel conforme |
| M-16 | **connexion depuis un second appareil PENDANT le verrouillage** | **passe normalement** — c'est tout l'objet du correctif |
| M-17 | `/loginContext` sans clé → 8 champs ; avec clé → réponse complète | frontière de divulgation respectée |
| M-22 | `/deleteRoom`, `/deleteShade`, `/deleteGroup` sans id | le **vrai** motif rendu, plus la seconde réponse qui l'écrasait |
| M-23 | `DELETE` sur `/setRollingCode`, `/unpairShade`, `/linkRepeater`, `/unlinkRepeater` | 405, plus de requête laissée sans réponse |
| **E-16** | **300 requêtes authentifiées** (10 routes en rotation) | **`min` et `largest` rigoureusement inchangés** — non corrigée, la fuite aurait coûté ~79 Ko |
| **E-16** (3e vérificateur) | `isAuthenticatedSync`, port 8082, sans clé | `401 Unauthorized API Key` |
| **E-9** | `/getReleases` port 8082, en-tête `Origin: http://evil.example` | `403 Cross-origin request refused` + trace série nommant l'origine |
| **C-4** | `/getReleases` avec clé → TLS vers `api.github.com` | **code 200** : le pinning CA fonctionne en conditions réelles |
| **C-6** | poignée de main WebSocket brute, 3 cas | bonne clé → `101` + état complet reçu ; sans clé et clé fausse → fermeture |
| **E-17** | 2 téléchargements de langue depuis GitHub (`fr`, `de`) | installés, progression étranglée, aucun blocage |
| **E-18 / M-19** | `/uploadLang` → **160 requêtes immédiates** → second `/uploadLang` enchaîné | 0 anomalie ; le verrou n'est pas relâché sous les pieds du second |
| **E-19** | rechargement du même onglet | clé `sessionStorage` conservée, `authenticated:true` dès le 1er appel, **champ PIN non affiché** |
| **E-19** | onglet neuf | clé absente, écran de connexion — limite volontaire de `sessionStorage` |
| Constat 1 (24/08) | `/getAvailableLangs` | **0,13 s** (contre 5,4 s bloquantes avant correctif), mémoire strictement inchangée |
| Constat 3 (24/08) | journalisation `/uploadLang` | `début de réception` / `réception terminée, 23692 octets, ok` / `installé` |
| **M-6** | `StepDown` sur volet `tiltonly` (`stepSize` fourni) | `tiltTarget` 0→10, `target` **inchangé** — seule la cible de TILT bouge |
| **M-7** | `StepUp` sur volet `upTime=0`, **avec témoin** sur volet à `upTime` normal | témoin : cible 50→0 ; cas piège : cible **inchangée** à 50, la garde refuse le calcul |
| **M-8** | `/setMyPosition {pos:40}` **sans** `tilt`, après référence `{pos:30, tilt:70}` | `myPos` 30→40, `myTiltPos` **conservé à 70** (le défaut aurait mis 30) |
| **M-9** | MQTT `groups/1/sunFlag/set` ← 1 puis 0, comparé à la branche volet | `1`→`CMD:Sun Flag`, `0`→`CMD:Flag` ; groupe et volet concordent enfin |
| **M-14** | `/saveGroup` `bitLength` 200/255/57, puis 56/80/0 | hors-bornes **refusés** (valeur maintenue), légitimes acceptés |
| **M-14** | émission avec `bitLength = 0` puis `/repeatCommand` | repli sur 56 (type du transceiver), plus d'émission à zéro bit |
| **M-24** | règle déclenchée à la minute suivante, 232 requêtes×3 pendant le tir | déclenchement effectif (volet à 60) ; `/schedules` max **235 ms**, `/controller` **266 ms**, `/saveSchedule` **505 ms** — aucune au-delà de 800 ms |

**Régime mémoire relevé pendant toute la campagne** (via le bloc `memory` de `/discovery`, port
8081 — utilisable en REST, sans dépendre de l'évènement socket `memStatus`) :

| Étape | `min` | `largest` |
|---|---|---|
| Référence après démarrage | 111 596 | 77 812 |
| Après 300 requêtes authentifiées | 111 596 | 77 812 |
| Après 1re installation de langue (TLS) | 61 040 | 73 716 |
| **Après 2e installation de langue** | **61 040** | 73 716 |
| Après 2 téléversements + 160 requêtes | 61 040 | 77 812 |
| Après poignée de main TLS `/getReleases` | 61 040 | 73 716 |

Le plancher descend **une seule fois** — le transitoire TLS du premier téléchargement — puis ne
bouge plus d'un octet. C'est exactement le « plancher stable, plus une pente » que la checklist
demandait de constater. `largest` reste entre 73 716 et 77 812, au-dessus du palier de 65 524
documenté le 24/08.

**Aucun** `guru meditation`, `panic`, `abort`, `lfs_mlist_isopen`, `stack overflow` ni `watchdog`
sur l'intégralité de la capture série de la campagne.

**Constat neuf sorti de cette campagne : [T-1](AUDIT-2026-08-23.md) — troncature UTF-8 des noms.**
Trouvé en validant M-12. **Corrigé et vérifié sur appareil le 24/08** : `strlcpyUtf8()` dans
`Utils.h`, appliqué aux quatre noms d'entités et à `parseValueString()` ; et côté interface, les 17
champs `length=` (attribut inexistant en HTML, donc sans effet) passés en `maxlength` ou nettoyés.
**Attention à ne pas répéter mon erreur d'estimation** : j'ai d'abord annoncé « toute l'interface
tombe », c'est faux — le navigateur décode en mode tolérant et `JSON.parse()` réussit. Seuls les
parseurs stricts cassent, au premier rang desquels l'écosystème Home Assistant.

**Second constat neuf : [T-2](AUDIT-2026-08-23.md) — les drapeaux d'un VOLET ne sont jamais
republiés sur MQTT**, alors que ceux d'un groupe le sont. Trouvé en validant M-9. **Corrigé et
vérifié sur appareil le 24/08** : émetteur unique `SomfyShade::publishFlags()` appelé par les deux
surfaces, plus un champ fantôme `pubFlags`.

**Troisième constat, et de loin le plus grave : [T-3](AUDIT-2026-08-23.md) — le correctif M-11
rendait TOUTE la configuration illisible au redémarrage.** Trouvé en flashant le correctif T-2.
`readString()` s'arrêtait dès le tampon plein **sans consommer le séparateur** ; or `writeString()`
pade chaque champ à exactement `len-1`, donc le cas nominal était précisément celui qui déclenchait
le défaut. Tout l'enregistrement se décalait d'un champ : `shades.cfg` était écrit correctement puis
rejeté (« Invalid Shade Record Size »), et **volets, pièces et groupes étaient perdus au premier
redémarrage suivant l'installation**, pour tout utilisateur. **Corrigé et vérifié le 24/08** —
persistance complète d'un jeu 1 pièce / 3 volets / 1 groupe au travers d'un redémarrage.

Le commentaire qui accompagnait M-11 affirmait « le plafond ne mord que sur une entrée malformée » :
l'exact contraire de ce que faisait le code. **Un correctif non éprouvé sur matériel n'est pas un
correctif, c'est une hypothèse** — et celui-ci était plus grave que le défaut qu'il réparait.

**Reste NON éprouvé :**

- ~~**M-6/M-7/M-8/M-9/M-14/M-24**~~ — **tous validés le 24/08** (cf. tableau ci-dessus). Le blocage
  supposé « faute de volet appairé » n'en était pas un : **aucun moteur physique n'est nécessaire**,
  un volet simplement *configuré* suffit à éprouver toute la logique firmware, les trames RF
  partant dans le vide.
- **M-11** — demande un `shades.cfg` forgé.
- **M-15, M-18, M-20, M-21** — non couverts (M-15 reste vérifié hors cible sur 9 chaînes de
  version ; M-18 est une route REST sans appelant dans l'interface).
- ~~**Intégration Home Assistant** avec sécurité activée~~ — **tranché le 24/08**, voir
  [`HA-INTEGRATION-2026-08-24.md`](HA-INTEGRATION-2026-08-24.md) : elle est **intégralement
  coupée** dès qu'un PIN est actif (401 sur tout le REST 8081, 3 650 poignées de main
  WebSocket rejetées sur 3 650). Elle n'envoie le jeton ni en URL ni en en-tête. À ne PAS
  corriger côté intégration pour l'instant (en ligne, alignée v2.5.6) ; côté firmware, la
  piste est de scinder `/discovery` comme on l'a fait pour `/loginContext`. T-1 la concerne
  par ailleurs directement.
- **P-4 → P-8.**

La checklist E-16 → E-19 est en revanche **couverte** (cf. le tableau ci-dessus), à une exception
près : l'OTA complète PIN actif, qui avait déjà été validée le 23/08 et n'a pas été rejouée — le
dépôt ne propose aucune version postérieure à celle installée.

**Deux pièges d'outillage rencontrés, à ne pas reprendre pour des défauts de l'appareil :**

1. **Ouvrir le port série redémarre l'ESP32.** Malgré `dtr=False`/`rts=False` posés avant
   `open()`, l'ouverture affirme DTR/RTS au niveau système sous Linux et déclenche le circuit
   d'auto-reset. Constaté ici : uptime retombé à 34 s en plein milieu de la campagne. Sans gravité
   (un démarrage propre est même une meilleure base pour mesurer une dérive de tas), mais il ne faut
   pas rouvrir le port en cours de mesure.
2. **La WebSocket `:8080` échoue depuis le navigateur intégré à l'outillage** — restriction de son
   bac à sable, **pas** un défaut de l'appareil : une poignée de main brute écrite à la main depuis
   la même machine, avec le bon jeton, est acceptée et reçoit l'état complet.

**L'erreur de méthode de cette campagne, à ne pas refaire.** La trace série montrait
`connexion non authentifiee, deconnexion` en boucle depuis `192.168.1.21`. J'ai expliqué ces rejets
par hypothèse — « un onglet resté ouvert et non connecté sur le téléphone du user » — et je les ai
écartés comme un comportement correct. **C'était Home Assistant** (le user l'avait intégré au
boîtier de test pendant le chantier MQTT), et ces 3 650 rejets étaient la réponse à un point de
validation que le rapport principal avait explicitement laissé en suspens. Voir
[`HA-INTEGRATION-2026-08-24.md`](HA-INTEGRATION-2026-08-24.md).

Une adresse IP non identifiée dans un relevé ne s'explique pas par supposition : on la vérifie, ou
on demande. Ici l'écart entre les deux lectures séparait « un client anonyme correctement rejeté »
de « l'intégration domotique de l'utilisateur est entièrement coupée ». Symétriquement, un rejet
dans la trace n'est pas un défaut tant qu'on n'a pas établi que le client rejeté présentait bien
une clé valide — c'est ce second réflexe qui m'a fait, cette fois, sous-estimer le constat.

**État du boîtier à la fin de la campagne** (à remettre en ordre avant diffusion) : PIN `1234`
toujours actif ; langues `de` et `fr` installées alors que seul `en` l'était au départ (`fr`
correspond au réglage `settings.language` et corrige donc l'écart signalé par l'interface, `de` a
été ajoutée pour la seconde mesure) ; `posixZone` passé de `UTC0` à `CET-1CEST,M3.5.0,M10.5.0/3`
lors du test M-10. Les pièces créées pour M-12 et T-1 ont toutes été supprimées (`/rooms` vide).

---

## Ce qui reste — trois décisions, pas du travail en attente

### 1. P-1 — fusionner les trois serveurs HTTP — **tranché : ne pas entreprendre**
`server` (80, async), `apiServer` (8081, async) et `gitSyncServer` (8082, **synchrone**), plus
`sockServer` (8080). Le port 8081 duplique 17 routes du port 80. Gain annoncé dans l'audit : les
~12 Ko de pile du `WebServer` synchrone.

**Instruction vérifiée le 24/08 : ce gain n'existe probablement pas.** `gitSyncServer` ne tourne
dans aucune tâche FreeRTOS dédiée — `WebGitSync::begin()`/`loop()` sont appelés inline depuis
`SomfyController.ino` (loopTask), et `src/` ne contient aucun `xTaskCreate`. Les seuls 12 Ko réels
du projet sont `CONFIG_ASYNC_TCP_STACK_SIZE=12288` (`platformio.ini`) : la pile de la tâche
`async_tcp`, déjà payée par la migration ESPAsyncWebServer et indépendante de `gitSyncServer` — elle
ne rétrécira pas si on le supprime. Même travers que P-3 (« 8-12 Ko de flash » annoncés, 80 octets
mesurés) : un chiffre non vérifié, vraisemblablement une confusion entre deux « 12 Ko » sans rapport.

**Ce qu'a fait le fork actif du projet** (github.com/Pulpyyyy/ESPSomfy-RTS, déjà cité dans
`WebGitSync.h`) donne un second élément, cette fois empirique et pas seulement théorique. Migration
disciplinée en 5 phases sur ~24h (commits `e845953`→`76c9d7b`, 30-31/07/2026), mesurée sur
matériel à chaque étape :
- **Ils n'ont jamais fusionné le serveur API Home Assistant.** Après avoir migré tout le reste sur
  le port 80 async, leur `apiServer` (WebServer synchrone, 8081 — l'équivalent direct de notre
  piste « fusionner `apiServer` dans `server` ») reste **délibérément séparé, en permanence**.
- **Pour les appels GitHub bloquants** (`/getReleases`, `/downloadFirmware`), ils ont fait
  l'inverse de nous : exécution inline dans la tâche `async_tcp` plutôt qu'isolation sur un port
  dédié (commit `76c9d7b`, « phase 5 »). Coût réel documenté : pile `async_tcp` **doublée**, 8 Ko
  par défaut → 16 Ko (la vérification de chaîne mbedTLS débordait la pile par défaut pendant le
  handshake TLS), plus `GitRepo` déplacé sur le tas pour soulager la pile de tâche.
- **Dans les heures qui ont suivi ce cutover**, crash matériel réel : des transferts de fichiers
  concurrents ont saturé la file d'événements AsyncTCP et fait tomber toute la pile LWIP, sur tous
  les ports, nécessitant un cycle d'alimentation (commit `67bb7ef`, message : « took the whole LWIP
  stack down on every port, sync included — it needed a power cycle »). C'est exactement le
  mécanisme décrit dans `WebGitSync.h` (file `_async_queue` qui grossit sans pouvoir se vider) —
  sauf que chez eux ce n'était plus une hypothèse d'audit mais un incident vécu. Réparé
  empiriquement : plafond à 3 transferts concurrents, `CONFIG_ASYNC_TCP_QUEUE_SIZE` 64→128, file de
  connexions élargie — des bornes réglées à la main, pas une élimination structurelle du risque.
  Nous tournons sur la même version AsyncTCP 3.3.2 qu'eux, au même défaut de file
  (`CONFIG_ASYNC_TCP_QUEUE_SIZE` non posé chez nous).

**Verdict.** Faisable techniquement (le fork le prouve), mais seulement en acceptant le modèle
« bloquant inline + pile doublée + file élargie empiriquement » — pas gratuit. Le gain annoncé est
probablement une erreur d'attribution ; le coût réel d'une fusion à la manière du fork serait plutôt
**négatif** (+4 à +8 Ko de pile `async_tcp`), sur un appareil où on vient de gagner l'essentiel de
la marge mémoire (38 900 → 65 524 octets de plus gros bloc contigu, audit du 24/08). Le fork
confirme empiriquement, plutôt que par simple raisonnement, que fusionner ces routes bloquantes
dans `async_tcp` peut planter tout l'appareil sous charge concurrente — exactement ce que
`WebGitSync.cpp` a été construit pour éviter. **Refonte architecturale, pas une correction**, et le
seul élément neuf par rapport à l'audit initial est que la prudence qui y était déjà recommandée se
trouve maintenant confirmée sur pièces plutôt que simplement supposée.

### 2. ~~Le tampon `g_content` partagé~~ — **FAIT le 24/08/2026**

Écrivains recensés avant correctif : `handleLogin`, `handleSaveSecurity`, `handleGetSecurity`
(`WebAuth.cpp`) et trois chemins d'erreur de `WebShadesRest.cpp`, tous sur **async_tcp** ; plus
`handleGetReleases` et `handleDownloadFirmware` (`WebGitSync.cpp`, port 8082) sur **loopTask**.

**Ce que la fiche d'origine ne disait pas, et qui a décidé du choix :** async_tcp est épinglée sur
le cœur 0 et loopTask sur le cœur 1 — ce ne sont pas deux tâches qui se préemptent, ce sont deux
cœurs qui s'exécutent réellement en parallèle. Et le pire cas n'était pas une réponse illisible :
`handleSaveSecurity()` et `handleLogin()` déposent une **clé d'API valide** dans ce tampon, qu'un
`send()` d'une autre tâche pouvait lire.

**Solution retenue — allocation transitoire**, qui ne figurait pas parmi les trois options
envisagées et qui domine celle du second tampon : `WebGitSync` alloue ses 4 Ko sur le tas le temps
de la requête et les rend ensuite (structure RAII, les deux handlers ayant des retours anticipés).
Le tampon partagé n'est donc plus écrit que depuis async_tcp, où tout est sérialisé. Coût nul au
repos, contre 4 Ko permanents pour un second tampon statique. Le mutex reste écarté : sa section
critique aurait contenu le `send()` socket, soit de l'E/S bloquante partagée entre les deux tâches
— le motif supprimé par P-6/P-7.

L'invariant est désormais écrit en tête de `WebCommon.h` : **ne jamais écrire dans `g_content`
depuis loopTask.**

**Vérifié sur appareil** : 12 `/getReleases` (chacun un aller-retour TLS complet, cœur 1) contre
3 160 requêtes async (cœur 0) en parallèle — aucun JSON malformé, aucune contamination croisée. La
garantie réelle reste toutefois structurelle, `WebGitSync` ne référençant plus le tampon du tout.

**Effet mémoire, mesuré et écarté comme cause :** après 32 `/getReleases`, `largest` descend de
77 812 à un **plateau de 53 236** puis n'y bouge plus, tandis que 200 requêtes non-TLS ne le font
pas varier d'un octet. C'est le **plateau mémoire du 17/08** (cf. « Hors audit » ci-dessous), pas
l'allocation transitoire — un `malloc`/`free` de taille constante réutilise son bloc. Marge au
plateau : 1,44× `GIT_TLS_MIN_HEAP_BYTES`.

### 3. Une correction de vérité, une ligne — l'autre était une erreur de ma part

- `SomfyExpose.cpp:240` déclare `"mf": "rstrouse"` à Home Assistant. C'est le champ **fabricant**
  de la découverte automatique MQTT (`mf` = `manufacturer`), affiché sur la fiche de l'appareil dans
  HA. Purement cosmétique : l'identité de l'appareil est portée par `identifiers`, donc le changer
  n'a aucun effet fonctionnel. SSDP annonce déjà `xkain` de son côté (`/upnp.xml`).

- ~~`src/README.md` annonce « 30 volets, 14 groupes, 14 pièces » alors que les macros valent
  32/16/16.~~ **FAUX — vérifié sur matériel le 24/08/2026.** J'avais conclu des macros sans
  essayer. En remplissant l'appareil jusqu'au refus : **30 volets, 14 groupes, 14 pièces**, le 31e
  volet répondant `Error adding shade.` La cause est dans les allocateurs
  (`SomfyRegistry.cpp:252` et suivants) : `for(uint8_t i = 1; i < SOMFY_MAX_SHADES - 1; i++)`
  n'attribue jamais d'identifiant au-delà de 30. **Le README dit donc vrai, et la « correction »
  proposée l'aurait rendu faux.** Ce qui subsiste est le constat F-1 lui-même — deux emplacements
  par tableau alloués en RAM et inatteignables — mais c'est une décision de capacité à prendre, pas
  une erreur de documentation à réparer.

### 4. ~~Masquer les secrets en mode « config seule »~~ — **FAIT le 24/08/2026**

Appliqué sur le modèle du fork actif du projet, qui avait résolu ce point avant nous : les routes
`/shades`, `/groups` et `/controller` restent accessibles au même niveau qu'avant
(`isAuthenticated(request, false)`), mais **les secrets** exigent désormais le niveau CONFIG
(`isAuthenticated(request, true)`). En mode « config seule », un client sans clé reçoit donc la
structure complète avec `remoteAddress` et `lastRollingCode` à **0** et `linkedRemotes` vide.

Deux choix repris du fork plutôt que les miens :
- **émettre `0` au lieu d'omettre la clé** — la forme du JSON reste stable pour un client tiers, et
  `0` est déjà la sentinelle « pas d'adresse » ailleurs dans le code. La découverte a été alignée
  dessus ;
- **conditionner les secrets, pas l'accès** : la route ne monte pas d'un cran, seuls les champs
  sensibles le font — ce qui évite de casser un écran légitime.

Vérifié sur appareil, en mode « config seule » : sans clé, `/shades`, `/groups`, `/controller` et
`:8081/discovery` rendent tous `remoteAddress=0`, `lastRollingCode=0`, `linkedRemotes=[]` ; avec la
clé de niveau config, les vraies valeurs reviennent (123456, 654321). Le tableau de bord public
s'affiche normalement, sans adresse ni `0` à sa place.

### Hors audit, toujours ouvert
- **MQTT sans TLS** : `MQTTSettings::protocol` est persisté mais **jamais consulté** par
  `connect()`, qui parle toujours en clair. Un boîtier mis à jour depuis une version antérieure peut
  garder `mqtts://` + port 8883 en NVS et échouer avec `errno 104` — le diagnostic ajouté le dira
  désormais explicitement.
- **Condensat SHA-256 des images OTA** (suite de C-4) : le pinning authentifie le serveur, pas
  l'image. `downloadFile()` ne compare toujours qu'un nombre d'octets.
- **Le plateau mémoire** reste le mécanisme de placement du 17/08 : éliminé du chemin des langues,
  toujours présent sur la page Firmware (`getReleases()` coûte ~35 Ko transitoires).

---

## Ce qu'il faut savoir avant de reprendre

**L'angle mort de cet audit, confirmé quatre fois.** Il a vérifié ce que le code *fait*, jamais ce
qu'il *émet vers l'extérieur* ni ce qu'il *rapporte en échouant*. Les défauts les plus coûteux en
temps de diagnostic étaient tous de cette famille : `MQTTClass::connect()` terminé par un
`return false` muet, `/uploadLang` sans la moindre trace, `groups/<id>/name` publié `true`, l'index
MQTT jamais rafraîchi. **Ajouter trois lignes de journalisation a résolu en une minute ce que deux
tours de relecture n'avaient pas trouvé.**

**Les estimations du rapport ne sont pas fiables, ses localisations non plus.** P-3 annonçait
« 8 à 12 Ko de flash » ; mesure réelle : **80 octets**, la chaîne utilisant `-ffunction-sections`
avec `--gc-sections` — le linker écartait déjà le code non référencé. P-2 donnait sans appelant des
fonctions vivantes (`SecuritySettings::toJSON`, `emitSockets(uint8_t)`). P-5 citait un bloc situé
dans un commentaire. M-14 attribuait à `/saveShade` un débordement qui venait de `/saveGroup`.
**Vérifier chaque constat dans le code avant d'agir**, et se servir du compilateur comme oracle
quand des surcharges homonymes rendent le raisonnement fragile.

**Méthodes qui ont porté leurs fruits**, à réutiliser :
- rejouer la logique **hors cible** (g++ sur l'hôte) avec un `millis()` simulé — anti-brute-force,
  masques de bits MQTT, échappement JSON sur les 255 octets, parseur de version ;
- servir le **bundle réellement construit** dans un navigateur derrière un simulateur de firmware,
  pour parcourir les quatre modes de sécurité ;
- **diff automatique** entre ce qui est publié et ce qui est nettoyé (c'est ce qui a trouvé
  `SunSensor` contre `sunSensor`, invisible à la relecture).

**Pièges de lecture des relevés :**
- un `= {}` dans MQTT Explorer est une charge utile **vide reçue**, pas un topic resté en place.
  Seule une reconnexion de l'explorateur fait foi ;
- les lignes `[E] open(): ... does not exist` ne sont **pas** des erreurs — `LittleFS.exists()`
  passe par `VFSImpl::open()`, qui journalise en niveau E tout fichier absent ;
- flasher LittleFS en local **efface les packs de langue** alors que `settings.language` survit en
  NVS : ça ressemble trait pour trait à un téléversement cassé ;
- pour la mémoire, le discriminant est **`min_free` par région**, pas `largest`. Une page blanche
  avec « Erreur d'encodage de contenu » qu'un rechargement répare est un symptôme de **famine
  mémoire** (flux gzip coupé en cours d'émission), pas d'un fichier corrompu — un fichier
  réellement abîmé donnerait une erreur permanente.

---

## État du dépôt

`main` synchronisé. 33 commits sur cette session (`f2f41a6..367babd`).

**Deux fichiers portent des modifications non commitées qui ne sont pas de l'audit :**
`data-dev/js/70-somfy.js` et `data-dev/main.css`. Elles étaient déjà présentes au début de la
session. Conséquence : **toute compilation régénère `data/*.gz` à partir de ces sources en cours de
travail** — ces quatre fichiers ont donc été délibérément laissés hors des commits d'audit. À
publier quand ce travail-là sera prêt.

Attention aussi : lancer `pio run -e esp32dev_cors` réécrit `.vscode/c_cpp_properties.json` et
`launch.json` vers cet environnement, **qui ne doit jamais être flashé** (il ouvre CORS sur toute
l'API, cf. C-1). Restaurer avec `git checkout -- .vscode/` après un build de vérification.
