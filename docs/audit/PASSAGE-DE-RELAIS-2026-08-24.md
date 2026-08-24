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

### NON éprouvé sur matériel

M-6/M-7 (pas-à-pas par télécommande : demande un store vénitien `tiltonly`, et un volet configuré
avec `upTime = 0`), M-8 → M-15, M-16/M-17 (anti-brute-force par IP et `/loginContext` scindé :
logique rejouée hors cible seulement), M-18 → M-24, et P-4 → P-8.

Les deux plus utiles à couvrir en premier :

- **M-24** — programmer une règle à la minute suivante et solliciter l'interface **pendant** son
  déclenchement : `/saveSchedule` et `/getSchedules` ne doivent plus attendre la fin de l'émission RF.
- **M-16** — trois PIN faux depuis une machine, puis vérifier que la connexion reste possible
  **depuis une seconde machine pendant le verrouillage**. C'est tout l'objet du correctif.

---

## Ce qui reste — trois décisions, pas du travail en attente

### 1. P-1 — fusionner les trois serveurs HTTP
`server` (80, async), `apiServer` (8081, async) et `gitSyncServer` (8082, **synchrone**), plus
`sockServer` (8080). Le port 8081 duplique 17 routes du port 80. Gain annoncé : les ~12 Ko de pile
du `WebServer` synchrone.

**Refonte architecturale, pas une correction.** Risque élevé sur du code réseau qui vient d'être
stabilisé, et l'estimation de gain n'a pas été vérifiée (cf. la leçon de P-3 ci-dessous). À ne pas
entreprendre sans arbitrage explicite.

### 2. Le tampon `g_content` partagé
Listé comme « incohérence n°5 » du rapport, sans numéro P — et c'est pourtant le plus sérieux du
reliquat.

Ce qui a été **vérifié** : `AsyncWebServerRequest::send()` copie immédiatement dans un `String`
(`WebRequest.cpp:254`), et les handlers async sont sérialisés sur une tâche unique. La race ne
subsiste donc **qu'entre `WebGitSync` (tâche principale) et async_tcp** — réelle mais étroite.

Trois issues, aucune évidente :
- un second tampon dédié à `WebGitSync` → **+4 Ko de RAM**, sur un appareil où 12 Ko de pile ont
  été âprement négociés ;
- un mutex → rétablit le risque de blocage croisé entre loopTask et async_tcp, exactement le motif
  supprimé dans P-6/P-7 ;
- documenter la fenêtre et ne rien changer.

### 3. Deux corrections de vérité, une ligne chacune
- `src/README.md` annonce « 30 volets, 14 groupes, 14 pièces » alors que les macros valent
  **32/16/16** — la documentation entérine l'off-by-one F-1 au lieu de le signaler ;
- `SomfyExpose.cpp` déclare `"mf": "rstrouse"` à Home Assistant — le fabricant du projet **amont**,
  alors que SSDP annonce `"xkain"` (`Network.cpp:287`).

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
