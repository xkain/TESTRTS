#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <LittleFS.h>
#include <Update.h>
#include <HTTPClient.h>
#include <esp_task_wdt.h>
#include <esp_heap_caps.h>
#include "ConfigSettings.h"
#include "mbedtls/sha256.h"
#include "GitOTA.h"
#include "GitHubCA.h"
#include "Utils.h"
#include "Sockets.h"
#include "somfy/Somfy.h"
#include "web/Web.h"
#include "web/WResp.h"
#include "web/WebCommon.h"
#include "Network.h"

extern ConfigSettings settings;
extern SocketEmitter sockEmit;
extern SomfyShadeController somfy;
extern rebootDelay_t rebootDelay;
extern Web webServer;
extern Network net;

#define MAX_BUFF_SIZE 4096

// Plancher de plus gros bloc contigu en dessous duquel on refuse d'ouvrir une connexion TLS, pour
// échouer PROPREMENT plutôt qu'en pleine poignée de main.
//
// Dimensionné sur ce que mbedTLS alloue RÉELLEMENT (révisé le 18/08/2026, cf. plus bas). La config
// compilée dans le core Arduino donne :
//     CONFIG_MBEDTLS_SSL_MAX_CONTENT_LEN=16384
//     # CONFIG_MBEDTLS_ASYMMETRIC_CONTENT_LEN is not set
// soit DEUX tampons de 16 384 octets (entrée + sortie) plus le contexte de session -- et non un
// bloc unique de 45 Ko. Ces tailles sont figées dans une bibliothèque précompilée : ni build_flags
// ni code applicatif n'y touchent, et WiFiClientSecure n'expose aucun réglage de tampon (seulement
// setInsecure/setCACert/setHandshakeTimeout/setAlpnProtocols).
//
// HISTORIQUE ET CORRECTION. 24576 s'était révélé insuffisant en pratique (échec en plein handshake,
// mbedtls -32512 "SSL - Memory allocation failed") : normal, un seul des deux tampons y tenait. Le
// seuil avait alors été porté à 46080, mais ce chiffre surestime le besoin -- il exige 45 Ko d'un
// seul tenant là où deux allocations de ~16,5 Ko se servent successivement dans le même bloc libre.
// Conséquence observée sur matériel le 18/08/2026 : après un téléchargement de langue, le plus gros
// bloc retombe à 40948 (la session TLS elle-même sert de coin et échoue au passage des allocations
// permanentes -- mécanisme décrit dans l'audit heap). Avec 124 664 octets encore libres au total et
// 40948 d'un seul tenant, les deux tampons AURAIENT tenu sans peine : 40948 héberge le premier, et
// les ~24 Ko restants du même bloc le second. Le garde-fou refusait donc des connexions qui
// auraient abouti, et bloquait toute vérification de mise à jour jusqu'au redémarrage.
//
// 36864 = 2 x 16384 + 4 Ko de marge pour le contexte de session. Le risque d'un seuil trop bas
// reste modéré et n'a jamais été un plantage : https.begin() renvoie false, ou GET() un code
// négatif, et les deux sont traités explicitement par les appelants (cf. les branches d'échec de
// getReleases()/downloadFile()). Le risque d'un seuil trop haut, lui, est un appareil
// fonctionnellement bloqué -- c'est celui qu'on vient d'observer.
#define GIT_TLS_MIN_HEAP_BYTES 36864
// Audit heap OTA (14/08/2026) : ESP.getMaxAllocHeap() creuse un point bas TRANSITOIRE pendant
// qu'une connexion TLS/requête HTTP précédente est encore en cours de nettoyage (buffers RX/TX
// mbedTLS ~34 Ko + la requête /getReleases elle-même, qui tourne sur la tâche async_tcp le temps
// du fetch GitHub) -- mesuré en usage réel : une chute sous ce seuil se résorbe typiquement en
// quelques secondes une fois la connexion précédente pleinement refermée (ex. 38900 -> remonté à
// 73716-81908 en moins de 5s dans les logs de test). Le refus immédiat au premier coup de canon
// louche donc une fenêtre transitoire plutôt qu'un manque de mémoire durable -- d'où ces quelques
// tentatives espacées avant d'abandonner pour de bon. GIT_TLS_HEAP_RETRIES tentatives (le compte
// TOTAL, pas le nombre de retries après la première) espacées de GIT_TLS_HEAP_RETRY_DELAY_MS ;
// esp_task_wdt_reset() à chaque itération -- cette fonction peut tourner sur la tâche async_tcp
// (cf. handleGetReleases(), WebSystem.cpp) où un delay() bloquant retarde aussi les autres
// requêtes HTTP/WebSocket le temps de l'attente, d'où un budget volontairement court.
#define GIT_TLS_HEAP_RETRIES 3
#define GIT_TLS_HEAP_RETRY_DELAY_MS 1500

// Plafond de la poignée de main TLS, en SECONDES (setHandshakeTimeout attend des secondes et
// multiplie par 1000 en interne). Motif "réseau bloquant sur loopTask", 17/08/2026 : le défaut du
// core Arduino est de 120 000 ms (cf. WiFiClientSecure.cpp, `sslclient->handshake_timeout =
// 120000`), soit HUIT FOIS les 15 s d'esp_task_wdt_init(). Toutes ces connexions s'ouvrent depuis
// la tâche principale, et rien ne nourrit le chien de garde pendant la poignée de main : un pair
// TLS qui cesse de répondre en plein échange y bloque donc loopTask jusqu'au redémarrage.
// getReleases() et checkInternet() bornaient déjà à 3 s ; downloadFile() et downloadLangFile() --
// les deux plus longues opérations, donc les plus exposées -- ne bornaient rien du tout. Valeur
// unique désormais, pour que la question ne se repose pas à chaque nouveau site TLS : 5 s, soit
// largement au-dessus d'une poignée de main normale (200 à 800 ms) et très en dessous du watchdog.
#define GIT_TLS_HANDSHAKE_TIMEOUT_S 5
static bool hasEnoughHeapForTls() {
  for(uint8_t i = 0; i < GIT_TLS_HEAP_RETRIES; i++) {
    if(ESP.getMaxAllocHeap() >= GIT_TLS_MIN_HEAP_BYTES) return true;
    if(i + 1 < GIT_TLS_HEAP_RETRIES) {
      DBG_PRINTF("[GitOTA-DEBUG] hasEnoughHeapForTls(): heap encore bas (essai %u/%u), nouvelle tentative dans %dms\n",
        i + 1, GIT_TLS_HEAP_RETRIES, GIT_TLS_HEAP_RETRY_DELAY_MS);
      esp_task_wdt_reset();
      delay(GIT_TLS_HEAP_RETRY_DELAY_MS);
    }
  }
  return false;
}

// Draine les octets restants d'un flux HTTP avant de fermer sa connexion sous-jacente. Root cause
// identifiée (audit heap OTA, 14/08/2026) via GitRepo::getReleases() : fermer https.end()/
// sclient.stop() sur une connexion pas totalement drainée peut laisser le PCB TCP local (lwIP) en
// attente du FIN/ACK distant, retenant ses tampons associés bien après le stop() -- observé en
// pratique comme un ESP.getMaxAllocHeap() qui ne se résorbe plus (contrairement à la chute
// transitoire habituelle, cf. commentaire sur GIT_TLS_MIN_HEAP_BYTES ci-dessus). Partagée avec
// GitUpdater::downloadLangFile(), dont le chemin d'échec (timeout de flux, `timeouts >= 500`) sort
// aussi de sa boucle de lecture sans avoir tout consommé -- même risque, même remède. Borné en
// itérations pour ne jamais bloquer indéfiniment si le serveur, à l'inverse, ne referme pas malgré
// Connection: close (https.setReuse(false), déjà en place sur tous les appelants).
static void drainHttpStream(HTTPClient &https, WiFiClient *stream, const char *label) {
  if(!https.connected()) return;
  uint16_t drainIters = 0;
  uint8_t discard[128];
  while(https.connected() && drainIters < 200) {
    size_t avail = stream->available();
    // Reset hors branche, comme dans les trois autres boucles de flux de ce fichier. Ici il est
    // surabondant -- la boucle est bornée à 200 itérations de 1 ms au pire, donc structurellement
    // incapable d'atteindre les 15 s du chien de garde -- mais l'uniformité vaut mieux qu'une
    // exception à justifier : si cette borne venait à être relâchée un jour, le garde-fou serait
    // déjà en place.
    esp_task_wdt_reset();
    if(avail) {
      stream->readBytes(discard, (avail > sizeof(discard)) ? sizeof(discard) : avail);
    }
    else delay(1);
    drainIters++;
  }
  DBG_PRINTF("[GitOTA-DEBUG] %s: drain post-lecture: %u itération(s), connected=%d\n", label, drainIters, https.connected());
}

// Diagnostic ponctuel (audit heap OTA, 15/08/2026) : un test réel a montré ESP.getMaxAllocHeap()
// bloqué sous GIT_TLS_MIN_HEAP_BYTES pendant 7 minutes après un seul getReleases() réussi (un seul
// onglet navigateur, aucune activité OTA entretemps) -- pas une chute transitoire qui se résorbe
// (cf. commentaire sur GIT_TLS_MIN_HEAP_BYTES plus haut), donc soit une fuite réelle (le bloc
// mbedTLS ~34 Ko n'est jamais rendu), soit une fragmentation structurelle (le bloc est bien rendu
// mais éclaté par d'autres allocations concurrentes en fragments trop petits pour se recombiner).
// Distingue les deux cas en comparant le free total au plus gros bloc contigu -- un ratio élevé
// pointe vers la fragmentation, un ratio proche de 1 vers un unique gros bloc jamais libéré. Ne
// s'affiche que si le heap est effectivement sous le seuil après coup, pour ne pas bruiter le log
// dans le cas nominal.
static void dumpHeapFragmentationIfLow(const char *label) {
  uint32_t maxAlloc = ESP.getMaxAllocHeap();
  if(maxAlloc >= GIT_TLS_MIN_HEAP_BYTES) return;
  multi_heap_info_t info;
  heap_caps_get_info(&info, MALLOC_CAP_8BIT);
  // Ligne de synthèse émise INCONDITIONNELLEMENT (audit heap, 17/08/2026) : le seul instrument
  // capable de qualifier le plateau bas doit rester lisible chez un utilisateur normal, sans mode
  // debug ni accès série privilégié. Ne se déclenche que sous le seuil TLS, donc jamais en nominal.
  //
  // Interprétation revue après le premier dump réel obtenu sur matériel (17/08/2026). L'ancienne
  // heuristique comparait free_total à largest_free_block et concluait "fragmenté en petits blocs"
  // ou "probable fuite d'un gros bloc" -- les deux étaient faux sur le cas observé. Ce que montre
  // heap_caps_print_heap_info() est qu'une SEULE région porte la quasi-totalité du libre (les autres,
  // buffers WiFi/système, sont saturées en permanence) et que cette région est coupée en deux
  // moitiés quasi égales par une allocation longue durée : free=82356 pour un plus gros bloc de
  // 40948, réparti sur seulement 18 blocs libres. La grandeur qui discrimine est donc le NOMBRE de
  // blocs libres, pas le ratio : peu de blocs + largest proche de free/2 = un gros bloc mal placé ;
  // beaucoup de blocs + largest très inférieur = véritable émiettement.
  const char *verdict;
  if(info.free_blocks <= 24 && info.total_free_bytes < (size_t)maxAlloc * 3)
    verdict = "peu de blocs libres, largest proche de free/2 -- gros bloc longue duree au milieu de la region";
  else if(info.total_free_bytes > (size_t)maxAlloc * 3)
    verdict = "emiettement en nombreux petits blocs";
  else
    verdict = "profil intermediaire";
  Serial.printf("[HEAP] %s: sous le seuil TLS (%u < %u) -- free total=%u, plus gros bloc=%u, blocs libres=%u (%s)\n",
    label, (unsigned)maxAlloc, (unsigned)GIT_TLS_MIN_HEAP_BYTES, (unsigned)info.total_free_bytes,
    (unsigned)info.largest_free_block, (unsigned)info.free_blocks, verdict);
  // Re-lecture avant le dump détaillé (corrigé le 17/08/2026 après un relevé matériel trompeur).
  // Les fonctions de dump relisent le tas pour leur propre compte : sur un test réel, l'en-tête
  // annonçait 42996 et le récapitulatif par région imprimé trois lignes plus bas affichait 81908 --
  // le tas avait remonté ENTRE les deux lectures. Présenter ces instants successifs comme un seul
  // état conduit à diagnostiquer un plateau là où il n'y avait qu'une chute transitoire de
  // démontage TLS. On revérifie donc juste avant : si c'est déjà résorbé, on le dit et on s'abstient
  // d'un dump devenu hors sujet.
  uint32_t recheck = ESP.getMaxAllocHeap();
  if(recheck >= GIT_TLS_MIN_HEAP_BYTES) {
    Serial.printf("[HEAP] %s: deja resorbe au moment du dump (%u >= %u) -- creux TRANSITOIRE, pas un plateau\n",
      label, (unsigned)recheck, (unsigned)GIT_TLS_MIN_HEAP_BYTES);
    return;
  }
  // Même fonction (donc même format exact) que le dump de référence pris après le boot réseau, cf.
  // ConfigSettings::dumpHeapBlocks() : c'est la comparaison des deux qui identifie l'amas
  // d'allocations échoué au milieu de la région. Le gate `enableDebugLogs` est appliqué à
  // l'intérieur.
  ConfigSettings::dumpHeapBlocks("etat degrade (sous seuil TLS)");
}

// Ajoute un label à hwVersions (séparé par une virgule) uniquement si ça tient dans le buffer.
// hwVersions provient de noms d'assets d'une release GitHub : le serveur est authentifié depuis
// le pinning de GitHubCA.h, mais le CONTENU reste une donnée distante non contrainte -- un nombre
// d'assets non borné ne doit jamais pouvoir dépasser le buffer fixe.
static void appendHwVersion(char *dest, size_t destSize, const char *label) {
  size_t curLen = strlen(dest);
  size_t sepLen = curLen > 0 ? 1 : 0;
  size_t labelLen = strlen(label);
  if(curLen + sepLen + labelLen < destSize) {
    if(sepLen) strcat(dest, ",");
    strcat(dest, label);
  }
}

void GitRelease::setReleaseProperty(const char *key, const char *val) {
  if(strcmp(key, "id") == 0) this->id = atol(val);
  else if(strcmp(key, "draft") == 0) this->draft = toBoolean(val, false);
  else if(strcmp(key, "prerelease") == 0) this->preRelease = toBoolean(val, false);
  else if(strcmp(key, "name") == 0) strlcpy(this->name, val, sizeof(this->name));
  else if(strcmp(key, "tag_name") == 0) {
    this->version.parse(val);
  }
  else if(strcmp(key, "published_at") == 0) {
    this->releaseDate = Timestamp::parseUTCTime(val);
  }
}

// Convertit "sha256:<64 hex>" en 32 octets. Rend false sur tout ce qui n'est pas exactement cette
// forme : mieux vaut « pas d'empreinte » qu'une empreinte à moitié décodée, qui ferait échouer la
// comparaison et bloquerait une mise à jour parfaitement saine.
static bool parseSha256Digest(const char *val, uint8_t *out) {
  if(!val || strncmp(val, "sha256:", 7) != 0) return false;
  const char *hex = val + 7;
  if(strlen(hex) != 64) return false;
  for(uint8_t i = 0; i < 32; i++) {
    uint8_t o = 0;
    for(uint8_t j = 0; j < 2; j++) {
      const char c = hex[i * 2 + j];
      uint8_t v;
      if(c >= '0' && c <= '9') v = c - '0';
      else if(c >= 'a' && c <= 'f') v = c - 'a' + 10;
      else if(c >= 'A' && c <= 'F') v = c - 'A' + 10;
      else return false;
      o = (uint8_t)((o << 4) | v);
    }
    out[i] = o;
  }
  return true;
}

void GitRelease::setAssetProperty(const char *key, const char *val) {
  // Empreinte de l'asset dont le nom vient d'être vu (cf. pendingAsset dans GitOTA.h). Traité
  // AVANT la branche "name", qui réarme pendingAsset pour l'asset suivant.
  if(strcmp(key, "digest") == 0) {
    if(this->pendingAsset == PA_FIRMWARE) this->hasFwDigest = parseSha256Digest(val, this->fwDigest);
    else if(this->pendingAsset == PA_FILESYSTEM) this->hasFsDigest = parseSha256Digest(val, this->fsDigest);
    return;
  }
  if(strcmp(key, "name") == 0) {
    // Chaque nouvel asset repart de zéro : sans cela, un asset sans `digest` hériterait du
    // marqueur du précédent et se verrait attribuer SON empreinte.
    this->pendingAsset = PA_NONE;
    // Reconnaissance des deux images que CE matériel installera, par les mêmes conventions de
    // nommage que setFirmwareFile()/le chemin filesystem de beginUpdate(). Le .zip factory est
    // exclu plus bas, il n'est jamais téléchargé par l'OTA.
    // Comparaison au nom EXACT que ce matériel téléchargera, obtenu par la convention de nommage
    // partagée (GitUpdater::assetName). Surtout pas une reconnaissance par sous-chaînes dupliquée
    // ici : le suffixe matériel est déterminé à l'exécution (modèle de puce, présence de PSRAM), et
    // deux implémentations de la même règle finissent toujours par diverger -- c'est exactement ce
    // qui a produit le constat T-2.
    if(this->version.name[0] != '\0') {
      char attendu[96];
      GitUpdater::assetName(this->version.name, true, attendu, sizeof(attendu));
      if(strcmp(val, attendu) == 0) this->pendingAsset = PA_FIRMWARE;
      else {
        GitUpdater::assetName(this->version.name, false, attendu, sizeof(attendu));
        if(strcmp(val, attendu) == 0) this->pendingAsset = PA_FILESYSTEM;
      }
    }
    // Les images "factory" (fusionnées, installables via un outil web) sont publiées en .zip --
    // cf. matrix.obname/asset_name dans build.yaml. Un nom comme "..._factory_esp32.bin.zip"
    // contient malgré tout "esp32.bin" en sous-chaîne : sans cette exclusion, la branche esp32.bin
    // ci-dessous compterait deux fois le même hwVersion (une fois pour le firmware "..._esp32.bin"
    // individuel, une fois pour le .zip factory qui l'embarque).
    if(strstr(val, ".zip")) return;

    // ex-"littlefs.bin" : la nouvelle convention nomme cet asset "..._filesystem.bin" (générique)
    // ou "..._filesystem_BOX.bin" -- on matche juste "filesystem" (sans exiger ".bin" juste après)
    // pour couvrir les deux formes en une seule fois.
    if(strstr(val, "filesystem")) this->hasFS = true;

    else if(strstr(val, "esp32.bin") && !strstr(val, "esp32s") && !strstr(val, "esp32c")) {
      #if defined(HARDWARE_BOX_ETH)
      // Le boîtier Ethernet ne doit valider l'asset que s'il contient "eth_"
      if(!strstr(val, "eth_")) return;
      #elif defined(HARDWARE_BOX_WIFI)
      // Le boîtier Wifi ne doit prendre que le firmware contenant "wifi_"
      if(!strstr(val, "wifi_")) return;
      #else
      // La version standard ignore les versions spéciaux "BOX"
      if(strstr(val, "_BOX_")) return;
      #endif

      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "32");
    }
    else if(strstr(val, "esp32wrover.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "wrover");
    }
    else if(strstr(val, "esp32s3.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "s3");
    }
    else if(strstr(val, "esp32s2.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "s2");
    }
    else if(strstr(val, "esp32c3.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "c3");
    }
    else if(strstr(val, "esp32c2.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "c2");
    }
    else if(strstr(val, "esp32c6.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "c6");
    }
    else if(strstr(val, "esp32h2.bin")) {
      appendHwVersion(this->hwVersions, sizeof(this->hwVersions), "h2");
    }
    else if(strstr(val, "_lang_") && strstr(val, ".json.gz")) {
      // Asset de langue (Phase 1/2 i18n) : ESPSomfyRTS_<tag>_lang_<code>.json.gz -- on extrait
      // le code entre "_lang_" et ".json.gz" et on le pousse dans availableLangs (même helper
      // d'accumulation CSV bornée que hwVersions, générique malgré son nom).
      const char *start = strstr(val, "_lang_") + strlen("_lang_");
      const char *end = strstr(start, ".json.gz");
      if(end && end > start && (size_t)(end - start) < 8) {
        char code[8];
        size_t len = end - start;
        strncpy(code, start, len);
        code[len] = '\0';
        appendHwVersion(this->availableLangs, sizeof(this->availableLangs), code);
      }
    }
  }
}

void GitRelease::toJSON(JsonFormatter &json) {
  Timestamp ts;
  char buff[20];
  sprintf(buff, "%llu", this->id);
  json.addElem("id", buff);
  json.addElem("name", this->name);
  json.addElem("date", ts.getISOTime(this->releaseDate));
  json.addElem("draft", this->draft);
  json.addElem("preRelease", this->preRelease);
  json.addElem("main", this->main);
  json.addElem("hasFS", this->hasFS);
  json.addElem("hwVersions", this->hwVersions);
  json.beginObject("version");
  this->version.toJSON(json);
  json.endObject();
}

#define ERR_CLIENT_OFFSET -50
#define UPDATE_ERR_OFFSET 20
#define ERR_DOWNLOAD_HTTP -40
#define ERR_DOWNLOAD_BUFFER -41
#define ERR_DOWNLOAD_CONNECTION -42
// Le flux HTTP est resté muet trop longtemps alors que la connexion était toujours ouverte : on
// abandonne plutôt que d'attendre indéfiniment. Utilisé par downloadFile() (où il était jusqu'ici
// écrit en dur) et par GitRepo::getReleases().
#define ERR_DOWNLOAD_TIMEOUT -43
// Update.end(true) a échoué alors que le compte d'octets était pourtant correct (finalisation --
// pas un problème de transfert détecté par ailleurs, cf. downloadFile()).
#define ERR_UPDATE_END -44
// La partition littlefs a été écrite avec le bon nombre d'octets mais ne remonte pas (ou l'UI y
// est absente/vide) une fois validée -- cf. GitUpdater::validateFilesystem().
#define ERR_FS_VALIDATION -45
// Heap trop fragmenté/insuffisant pour ouvrir une connexion TLS en sécurité (cf.
// hasEnoughHeapForTls()) -- downloadFile()/getReleases() n'ont même pas tenté la connexion. Rien
// n'a donc été écrit/récupéré : ne doit surtout pas être confondu avec un succès (bug corrigé --
// ces deux fonctions faisaient auparavant un retour 0 silencieux ici).
#define ERR_LOW_HEAP -46
// Déplacé ici (avant GitRepo::getReleases(), qui les utilise désormais aussi) depuis leur
// emplacement d'origine juste avant GitUpdater::loop() -- un #define doit précéder tous ses usages
// dans le fichier.

int16_t GitRepo::getReleases(uint8_t num) {
  WiFiClientSecure sclient;
  // Vérification du certificat serveur (cf. GitHubCA.h). Remplace un setInsecure() qui
  // acceptait n'importe quel certificat sur la connexion même qui rapatrie le firmware.
  sclient.setCACert(GITHUB_ROOT_CA_BUNDLE);
  sclient.setHandshakeTimeout(GIT_TLS_HANDSHAKE_TIMEOUT_S);
  uint8_t ndx = 0;
  uint8_t count = min((uint8_t)GIT_MAX_RELEASES, num);
  char url[128];
  // Le memset() de this->releases est retardé jusqu'à la confirmation du succès HTTP (plus bas,
  // juste avant le parsing) plutôt que fait ici en tête de fonction : /getReleases sert
  // this->releases (cachedReleases) à chaud à chaque appel HTTP, donc le vider avant même de savoir
  // si la nouvelle requête va réussir fait disparaître un cache valide en cas d'échec réseau/TLS.
  // NB : pas de tampon local séparé (GitRelease[GIT_MAX_RELEASES+1] ~1,7 Ko) -- cette fonction est
  // aussi appelée avec un GitRepo local (checkForUpdate()) déjà volumineux sur la pile ; un tampon
  // supplémentaire y provoquait un dépassement de pile (stack canary / reboot).
  sprintf(url, "https://api.github.com/repos/" GITHUB_REPOSITORY "/releases?per_page=%d&page=1", count);
  DBG_PRINTF("[GitOTA-DEBUG] getReleases(): request to %s\n", url);
  HTTPClient https;
  https.setReuse(false);
  // Comme dans downloadFile() (même défaut corrigé) : chacune des branches d'échec ci-dessous
  // renvoie désormais un code négatif explicite au lieu de retomber sur le `return 0;` final --
  // sinon handleDownloadFirmware() (WebSystem.cpp), qui ne regarde que `err == 0`, traite un appel
  // GitHub jamais parti (heap insuffisant, DNS/TLS en échec) comme un succès avec zéro release
  // trouvée dans le cache, et affiche à l'utilisateur "Release not found in repo." -- message
  // trompeur constaté en test réel juste après un flash complet (tas encore fragmenté par les
  // toutes premières connexions TLS de la session).
  if(!hasEnoughHeapForTls()) {
    DBG_PRINTLN("[GitOTA-DEBUG] insufficient heap to open a TLS connection, request cancelled");
    settings.printAvailHeap();
    return ERR_LOW_HEAP;
  }
  if(https.begin(sclient, url)) {
    esp_task_wdt_reset();
    int httpCode = https.GET();
    DBG_PRINTF("[GitOTA-DEBUG] https.GET() return code = %d\n", httpCode);
    DBG_PRINTF("[HTTPS] GET... code: %d\n", httpCode);
    if(httpCode > 0) {
      int len = https.getSize();
      DBG_PRINTF("[GitOTA-DEBUG] announced Content-Length = %d\n", len);
      DBG_PRINTF("[HTTPS] GET... code: %d - %d\n", httpCode, len);
      if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY) {
        // Requête HTTP confirmée réussie : on peut maintenant vider le cache avant d'y écrire
        // les nouvelles données parsées ci-dessous.
        memset(this->releases, 0x00, sizeof(GitRelease) * GIT_MAX_RELEASES);
        WiFiClient *stream = https.getStreamPtr();
        uint8_t buff[128] = {0};
        char jsonElem[32] = "";
        char jsonValue[128] = "";
        int arrTok = 0;
        int objTok = 0;
        bool inQuote = false;
        bool inElem = false;
        bool inValue = false;
        bool awaitValue = false;
        bool inAss = false;
        // Compteur d'attente à vide (correction du 17/08/2026, après un reboot watchdog reproduit
        // sur matériel en pleine sélection de langue). La boucle ci-dessous n'avait PAS de branche
        // `else` : quand stream->available() renvoyait 0 alors que la connexion restait ouverte,
        // elle tournait à vide sans nourrir le chien de garde, sans delay() et sans sortie bornée.
        // Or `len` vaut -1 sur cette requête (réponse chunked, cf. le log "announced
        // Content-Length = -1"), donc la condition d'arrêt sur la taille ne joue jamais : il
        // suffisait que GitHub tarde entre deux chunks pour que loopTask tourne en rond jusqu'aux
        // 15 s d'esp_task_wdt_init() et fasse redémarrer l'appareil. Les deux fonctions soeurs
        // (downloadFile(), downloadLangFile()) avaient bien ce garde-fou ; getReleases() était la
        // seule à en être dépourvue.
        // 500 itérations de 10 ms = 5 s de silence complet -- très au-delà du temps de réponse
        // observé pour cette requête (3 à 5 s pour la totalité de l'échange), donc jamais atteint
        // en fonctionnement normal.
        int timeouts = 0;
        bool streamTimedOut = false;
        while(https.connected() && (len > 0 || len == -1) && ndx < count) {
          size_t size = stream->available();
          // Reset AVANT le branchement, et non à l'intérieur : c'est le placement qu'ont déjà
          // downloadFile() et downloadLangFile(), et c'est précisément ce qui manquait ici. Un
          // reset logé dans une branche n'est nourri que si cette branche est prise -- toute
          // nouvelle branche l'oublierait à nouveau. Placé ici, il est inconditionnel par
          // construction.
          esp_task_wdt_reset();
          if(size) {
            timeouts = 0;
            int c = stream->readBytes(buff, ((size > sizeof(buff)) ? sizeof(buff) : size));
            if(len > 0) len -= c;
            for(uint8_t i = 0; i < c; i++) {
              char ch = static_cast<char>(buff[i]);
              if(ch == '[') {
                arrTok++;
                if(arrTok == 2 && strcmp(jsonElem, "assets") == 0) {
                  inElem = inValue = awaitValue = false;
                  inAss = true;
                }
                else if(arrTok < 2) inAss = false;
              }
              else if(ch == ']') {
                arrTok--;
                if(arrTok < 2) inAss = false;
              }
              else if(ch == '{') {
                objTok++;
                if(objTok != 1 && !inAss) inElem = inValue = awaitValue = false;
              }
              else if(ch == '}') {
                objTok--;
                if(objTok == 0) ndx++;
              }
              else if(objTok == 1 || inAss) {
                if(ch == '\"') {
                  inQuote = !inQuote;
                  if(inElem) {
                    inElem = false;
                    awaitValue = true;
                  }
                  else if(inValue) {
                    inValue = false;
                    inElem = false;
                    awaitValue = false;
                    if(inAss)
                      this->releases[ndx].setAssetProperty(jsonElem, jsonValue);
                    else
                      this->releases[ndx].setReleaseProperty(jsonElem, jsonValue);
                    memset(jsonElem, 0x00, sizeof(jsonElem));
                    memset(jsonValue, 0x00, sizeof(jsonValue));
                  }
                  else if(awaitValue) inValue = true;
                  else {
                    inElem = true;
                    awaitValue = false;
                  }
                }
                else if(awaitValue) {
                  if(ch != ' ' && ch != ':') {
                    strncat(jsonValue, &ch, 1);
                    awaitValue = false;
                    inValue = true;
                  }
                }
                else if((!inQuote && ch == ',') || ch == '\r' || ch == '\n') {
                  inElem = inValue = awaitValue = false;
                  if(strlen(jsonElem) > 0) {
                    if(inAss)
                      this->releases[ndx].setAssetProperty(jsonElem, jsonValue);
                    else
                      this->releases[ndx].setReleaseProperty(jsonElem, jsonValue);
                  }
                  memset(jsonElem, 0x00, sizeof(jsonElem));
                  memset(jsonValue, 0x00, sizeof(jsonValue));
                }
                else {
                  if(inElem) {
                    if(strlen(jsonElem) < sizeof(jsonElem) - 1) strncat(jsonElem, &ch, 1);
                  }
                  else if(inValue) {
                    if(strlen(jsonValue) < sizeof(jsonValue) - 1) strncat(jsonValue, &ch, 1);
                  }
                }
              }
            }
            delay(1);
          }
          else {
            // Rien à lire pour l'instant : on rend la main et on nourrit le chien de garde. C'est
            // très exactement ce qui manquait -- cf. le commentaire sur `timeouts` ci-dessus.
            timeouts++;
            if(timeouts >= 500) {
              DBG_PRINTLN("[GitOTA-DEBUG] getReleases(): flux muet trop longtemps, abandon");
              streamTimedOut = true;
              break;
            }
            delay(10);
          }
        }
        DBG_PRINTF("[GitOTA-DEBUG] JSON parsing complete: %u release(s) extracted (loop exited via connected=%d, remaining len=%d, ndx=%u/%u)\n",
          ndx, https.connected(), len, ndx, count);
        // La boucle ci-dessus s'arrête dès que `ndx` atteint `count` (5 releases trouvées), MÊME
        // si le flux HTTP/TLS n'est pas encore intégralement drainé côté serveur -- fréquent ici
        // puisque cette requête est transférée en chunked (Content-Length annoncé = -1), et qu'il
        // reste alors des octets de framing chunked (voire le "0\r\n\r\n" terminal) non lus après
        // le dernier "}" JSON. Cf. drainHttpStream() (racine du fichier) pour le mécanisme complet.
        drainHttpStream(https, stream, "getReleases()");
        // Abandon sur flux muet : la liste parsée est tronquée (le memset() du cache a déjà eu
        // lieu plus haut, à la confirmation du code HTTP). On le signale explicitement plutôt que
        // de rendre 0 -- un appelant qui ne regarde que `err == 0` prendrait sinon une liste
        // incomplète pour une liste complète, exactement le défaut déjà corrigé sur les autres
        // branches d'échec de cette fonction.
        if(streamTimedOut) {
          https.end();
          sclient.stop();
          return ERR_DOWNLOAD_TIMEOUT;
        }
      }
      else {
        DBG_PRINTF("[GitOTA-DEBUG] HTTP failure, code %d != 200/301 -> request aborted, previous cache kept\n", httpCode);
        https.end();
        sclient.stop();
        return httpCode;
      }
    }
    else {
      DBG_PRINTF("[GitOTA-DEBUG] https.GET() returned a code <= 0 (%d): timeout/transport error\n", httpCode);
      https.end();
      sclient.stop();
      settings.printAvailHeap();
      return ERR_DOWNLOAD_HTTP;
    }
    https.end();
    sclient.stop();
    dumpHeapFragmentationIfLow("getReleases()");
  }
  else {
    DBG_PRINTLN("[GitOTA-DEBUG] https.begin() failed (DNS/TLS?): request never sent, previous cache kept");
    settings.printAvailHeap();
    return ERR_DOWNLOAD_CONNECTION;
  }
  settings.printAvailHeap();
  return 0;
}

void GitRepo::toJSON(JsonFormatter &json) {
  json.beginObject("fwVersion");
  settings.fwVersion.toJSON(json);
  json.endObject();
  json.beginObject("appVersion");
  settings.appVersion.toJSON(json);
  json.endObject();
  json.beginArray("releases");
  for(uint8_t i = 0; i < GIT_MAX_RELEASES; i++) {
    if(this->releases[i].id == 0) continue;
    json.beginObject();
    this->releases[i].toJSON(json);
    json.endObject();
  }
  json.endArray();
}

void GitUpdater::loop() {
  if(!net.connected()) return;
  if(this->status == GIT_STATUS_READY) {
    if(settings.checkForUpdate &&
      // 5 minutes après connexion plutôt qu'1 : le handshake TLS bloquant ne doit pas tomber
      // pendant la ruée des toutes premières pages ouvertes après le boot.
      ((int32_t)(millis() - net.connectTime) >= 300000) &&
      (this->lastCheck == 0 || (int32_t)(millis() - this->lastCheck) >= 86400000) && !rebootDelay.reboot &&
      // Même raison que pour /getReleases : ne pas retarder le STOP d'un volet en mouvement.
      !somfy.isAnyShadeMoving()) {
      this->checkForUpdate();
      }
    // Langue en attente (mode AP) : indépendant du throttle quotidien ci-dessus -- on veut
    // l'appliquer dès que possible, pas attendre le prochain cycle de vérification firmware.
    // L'intervalle entre tentatives n'est pas fixe : il s'adapte à la raison du dernier échec
    // (cf. checkPendingLang()), pour ne pas transformer une connectivité pas encore prête en
    // plusieurs minutes d'interface restée dans l'ancienne langue.
    if(settings.pendingLang[0] != '\0' && !this->lockFS &&
      ((int32_t)(millis() - net.connectTime) >= PENDING_LANG_RETRY_MIN) &&
      (this->lastPendingLangCheck == 0 || (int32_t)(millis() - this->lastPendingLangCheck) >= (int32_t)this->pendingLangRetryMs) &&
      !rebootDelay.reboot) {
      this->checkPendingLang();
      }
    // Catalogue complet des releases pour /getAvailableLangs (WebI18n.cpp, cf. releasesRequested
    // dans GitOTA.h) : exécuté ici plutôt que dans le handler HTTP lui-même -- jamais sur la tâche
    // async_tcp. /getReleases (l'UI de mise à jour elle-même) est passée par ce même mécanisme
    // pendant l'audit heap OTA du 14/08/2026 avant d'être finalement isolée sur son propre serveur
    // HTTP synchrone (cf. WebGitSync.cpp) -- ce bloc ne sert donc plus qu'à /getAvailableLangs, qui
    // se contente d'un cache éventuellement vide/périmé en cas d'échec (pas de code d'erreur à
    // remonter, ce handler n'en a jamais eu besoin).
    if(this->releasesRequested) {
      if(this->cachedReleases.getReleases() == 0) {
        this->setCurrentRelease(this->cachedReleases);
        // Horodaté seulement en cas de succès : un échec (réseau, TLS, flux muet) doit pouvoir être
        // retenté au prochain appel plutôt que d'être masqué par un cache réputé frais mais vide.
        this->lastReleasesFetch = millis();
      }
      this->releasesRequested = false;
    }
    // Téléchargement de langue demandé par /downloadLang (étape 2 migration ESPAsyncWebServer) --
    // même principe que ci-dessus, cf. requestedLangCode dans GitOTA.h. downloadLangFile() gère
    // déjà lui-même lockFS et l'émission des évènements socket de progression/complétion.
    if(this->requestedLangCode[0] != '\0') {
      char code[8];
      strlcpy(code, this->requestedLangCode, sizeof(code));
      this->requestedLangCode[0] = '\0';
      this->downloadLangFile(code);
    }
  }
  else if(this->status == GIT_AWAITING_UPDATE) {
    DBG_PRINTLN("Starting update process....");
    this->status = GIT_UPDATING;
    this->beginUpdate(this->targetRelease);
    this->status = GIT_STATUS_READY;
    this->emitUpdateCheck();
  }
  else if(this->status == GIT_UPDATE_CANCELLING) {
    DBG_PRINTLN("Cancelling update process....");
    if(!this->lockFS) {
      this->status = GIT_UPDATE_CANCELLED;
      this->cancelled = true;
      this->emitUpdateCheck();
    }
  }
}

void GitUpdater::checkForUpdate() {
  if(this->status != 0) return;
  DBG_PRINTLN("Check github for updates...");

  this->status = GIT_STATUS_CHECK;
  settings.printAvailHeap();
  this->lastCheck = millis();
  if(this->checkInternet() == 0) {
    GitRepo repo;
    this->updateAvailable = false;
    this->error = repo.getReleases(2);
    if(this->error == 0) {
      this->setCurrentRelease(repo);
    }
    else {
      this->emitUpdateCheck();
    }
  }
  this->status = GIT_STATUS_READY;
}

void GitUpdater::setCurrentRelease(GitRepo &repo) {
  this->updateAvailable = false;
  for(uint8_t i = 0; i < 2; i++) {
    if(repo.releases[i].draft || repo.releases[i].preRelease || repo.releases[i].id == 0) continue;
    this->latest.copy(repo.releases[i].version);
    if(repo.releases[i].version.compare(settings.fwVersion) > 0) {
      this->updateAvailable = true;
    }
    break;
  }
  this->emitUpdateCheck();
}

void GitUpdater::toJSON(JsonFormatter &json) {
  json.addElem("available", this->updateAvailable);
  json.addElem("status", this->status);
  json.addElem("error", (int32_t)this->error);
  json.addElem("cancelled", this->cancelled);
  json.addElem("checkForUpdate", settings.checkForUpdate);
  json.addElem("inetAvailable", this->inetAvailable);
  json.beginObject("fwVersion");
  settings.fwVersion.toJSON(json);
  json.endObject();
  json.beginObject("appVersion");
  settings.appVersion.toJSON(json);
  json.endObject();
  json.beginObject("latest");
  this->latest.toJSON(json);
  json.endObject();
}

void GitUpdater::emitUpdateCheck(uint8_t num) {
  JsonSockEvent *json = sockEmit.beginEmit("fwStatus");
  json->beginObject();
  json->addElem("available", this->updateAvailable);
  json->addElem("status", this->status);
  json->addElem("error", (int32_t)this->error);
  json->addElem("cancelled", this->cancelled);
  json->addElem("checkForUpdate", settings.checkForUpdate);
  json->addElem("inetAvailable", this->inetAvailable);
  json->beginObject("fwVersion");
  settings.fwVersion.toJSON(json);
  json->endObject();
  json->beginObject("appVersion");
  settings.appVersion.toJSON(json);
  json->endObject();
  json->beginObject("latest");
  this->latest.toJSON(json);
  json->endObject();
  json->endObject();
  sockEmit.endEmit(num);
}

int GitUpdater::checkInternet() {
  int err = 500;
  uint32_t t = millis();
  WiFiClientSecure sclient;
  // Vérification du certificat serveur (cf. GitHubCA.h). Remplace un setInsecure() qui
  // acceptait n'importe quel certificat sur la connexion même qui rapatrie le firmware.
  sclient.setCACert(GITHUB_ROOT_CA_BUNDLE);
  sclient.setHandshakeTimeout(GIT_TLS_HANDSHAKE_TIMEOUT_S);
  esp_task_wdt_reset();
  HTTPClient https;
  https.setReuse(false);
  if(hasEnoughHeapForTls() && https.begin(sclient, "https://github.com/" GITHUB_REPOSITORY)) {
    https.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    https.setTimeout(3000);
    esp_task_wdt_reset();
    int httpCode = https.sendRequest("HEAD");
    esp_task_wdt_reset();
    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY || httpCode == HTTP_CODE_FOUND) {
      err = 0;
      DBG_PRINTF("Internet is Available: %ldms\n", millis() - t);
      this->inetAvailable = true;
    }
    else {
      err = httpCode;
      DBG_PRINTF("Internet is Unavailable: %d: %ldms\n", err, millis() - t);
      this->inetAvailable = false;
    }
    https.end();
    sclient.stop();
  }
  esp_task_wdt_reset();
  return err;
}

void GitUpdater::emitDownloadProgress(size_t total, size_t loaded, const char *evt) { this->emitDownloadProgress(255, total, loaded, evt); }
// Blocage d'OTA constaté sur matériel le 23/08/2026 : téléchargement figé à 5 %, rafale de
// `WiFiClient::write(): fail on fd 50, errno: 11` une fois par seconde, puis redémarrage watchdog
// sur loopTask.
//
// MÉCANISME. Pendant le transfert, la pile Wi-Fi est saturée par le flux TLS entrant (1,46 Mo) :
// une trame WebSocket sortante ne trouve plus de place dans le tampon d'émission de SA socket, et
// lwip_send() finit par rendre EAGAIN au bout de sa seconde d'attente. Jusqu'ici cette fonction
// enchaînait sur sockEmit.loop() -> WebSocketsServer::loop(), c'est-à-dire la boucle INTERNE de la
// bibliothèque links2004 : elle réessaie l'écriture sans borne utile et, surtout, sans jamais
// nourrir le chien de garde. loopTask y restait bloquée, ne lisait donc plus le flux TLS -- le
// téléchargement s'arrêtait -- et le watchdog finissait par redémarrer l'appareil.
//
// C'est exactement le risque résiduel documenté en tête de WResp.cpp ("la tâche principale peut
// toujours passer jusqu'à 5 s dans write() sur un client bloqué, et la bibliothèque ne nourrit pas
// le watchdog pendant ce temps"), que la charge d'une OTA rend enfin observable.
//
// CORRECTIF, en deux temps.
//   1. Plus de sockEmit.loop()/webServer.loop() ici. Ils étaient inutiles pour ÉMETTRE : sur la
//      tâche principale, endEmit() écrit déjà directement via sendFrameFanOut(), lequel borne
//      chaque envoi (WEBSOCKETS_TCP_TIMEOUT), nourrit le chien de garde autour de chaque client et
//      déconnecte au bout de SOCK_WRITE_FAIL_LIMIT échecs consécutifs. La boucle de la
//      bibliothèque ne sert qu'à la RÉCEPTION et au heartbeat -- dont on peut se passer le temps
//      d'un téléchargement qui se termine de toute façon par un redémarrage.
//   2. Étranglement temporel des diffusions. Le déclencheur restait une occasion de blocage par
//      pour-cent, soit une centaine sur un firmware : à 2 s de blocage possible chacune, le flux
//      TLS expirait bien avant la fin. 500 ms suffisent largement à une barre de progression.
//      La dernière émission (loaded >= total) passe toujours, sans quoi l'interface resterait
//      figée à 99 %. Les émissions ciblées (num != 255, initialisation d'un client qui vient de se
//      connecter) ne sont jamais étranglées : elles n'arrivent qu'une fois.
#define GIT_PROGRESS_MIN_INTERVAL 500
void GitUpdater::emitDownloadProgress(uint8_t num, size_t total, size_t loaded, const char *evt) {
  static uint32_t lastEmit = 0;
  const bool isFinal = (total > 0 && loaded >= total);
  if(num == 255 && !isFinal && lastEmit != 0 &&
     (uint32_t)(millis() - lastEmit) < GIT_PROGRESS_MIN_INTERVAL) return;
  if(num == 255) lastEmit = millis();
  JsonSockEvent *json = sockEmit.beginEmit(evt);
  json->beginObject();
  json->addElem("ver", this->targetRelease);
  json->addElem("part", (int32_t)this->partition);
  json->addElem("file", this->currentFile);
  json->addElem("total", (uint32_t)total);
  json->addElem("loaded", (uint32_t)loaded);
  json->addElem("error", (uint32_t)this->error);
  json->endObject();
  sockEmit.endEmit(num);
  esp_task_wdt_reset();
}

// Convention de nommage des assets, en UN SEUL endroit : utilisée par setFirmwareFile(), par le
// chemin filesystem de beginUpdate(), et par le parseur de releases pour reconnaître l'asset dont
// il doit retenir l'empreinte. Le suffixe dépend du modèle de puce à l'exécution, donc aucune
// duplication n'est possible sans divergence.
void GitUpdater::assetName(const char *version, bool firmware, char *out, size_t len) {
  if(!firmware) {
    #if defined(HARDWARE_BOX_ETH) || defined(HARDWARE_BOX_WIFI)
    snprintf(out, len, "ESPSomfyRTS_%s_filesystem_BOX.bin", version);
    #else
    snprintf(out, len, "ESPSomfyRTS_%s_filesystem.bin", version);
    #endif
    return;
  }
  esp_chip_info_t ci;
  esp_chip_info(&ci);
  char suffix[32] = "esp32.bin";
  switch(ci.model) {
    case esp_chip_model_t::CHIP_ESP32S3: strlcpy(suffix, "esp32s3.bin", sizeof(suffix)); break;
    case esp_chip_model_t::CHIP_ESP32S2: strlcpy(suffix, "esp32s2.bin", sizeof(suffix)); break;
    case esp_chip_model_t::CHIP_ESP32C3: strlcpy(suffix, "esp32c3.bin", sizeof(suffix)); break;
    case esp_chip_model_t::CHIP_ESP32:
      strlcpy(suffix, psramFound() ? "esp32wrover.bin" : "esp32.bin", sizeof(suffix));
      break;
    default: strlcpy(suffix, "esp32.bin", sizeof(suffix)); break;
  }
  #if defined(HARDWARE_BOX_ETH)
  snprintf(out, len, "ESPSomfyRTS_%s_firmware_BOX_eth_%s", version, suffix);
  #elif defined(HARDWARE_BOX_WIFI)
  snprintf(out, len, "ESPSomfyRTS_%s_firmware_BOX_wifi_%s", version, suffix);
  #else
  snprintf(out, len, "ESPSomfyRTS_%s_firmware_%s", version, suffix);
  #endif
}

void GitUpdater::setFirmwareFile(const char *version) {
  GitUpdater::assetName(version, true, this->currentFile, sizeof(this->currentFile));
}


bool GitUpdater::beginUpdate(const char *version) {
  DBG_PRINTLN("Begin update called...");
  sprintf(this->baseUrl, "https://github.com/" GITHUB_REPOSITORY "/releases/download/%s/", version);

  strcpy(this->targetRelease, version);
  this->emitUpdateCheck();
  this->setFirmwareFile(version);
  this->loadExpectedDigest(version, true);
  this->partition = U_FLASH;
  this->lockFS = this->cancelled = false;
  this->error = 0;
  this->error = this->downloadFile();

  if(this->error == 0 && !this->cancelled) {
    somfy.commit();

    // BOX-wifi et BOX-eth partagent le même filesystem (langue "fr" embarquée par
    // minify_data.py::_embedded_lang_for_env(), qui ne distingue déjà pas les deux matériels) --
    // donc le même asset de release, cf. commentaire équivalent dans ConfigSettings.h.
    #if defined(HARDWARE_BOX_ETH) || defined(HARDWARE_BOX_WIFI)
    snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_filesystem_BOX.bin", version);
    #else
    snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_filesystem.bin", version);
    #endif

    this->loadExpectedDigest(version, false);
    this->partition = U_SPIFFS;
    this->lockFS = true;
    // Draine les assets encore en cours d'envoi sur async_tcp avant d'écrire la partition : le
    // verrou ci-dessus bloque les NOUVELLES réponses fichier, celle-ci attend la fin de celles déjà
    // en vol (handle LittleFS ouvert). Cf. Web::waitForFileReaders().
    webServer.waitForFileReaders();
    this->error = this->downloadFile();
    // La partition littlefs n'a pas de secours A/B comme le firmware (U_FLASH, qui bascule entre
    // deux partitions OTA) : une écriture interrompue ou corrompue l'écrase pour de bon. Un compte
    // d'octets correct ne suffit donc pas -- on force un vrai remontage avant de faire confiance au
    // résultat.
    if(this->error == 0 && !this->validateFilesystem()) this->error = ERR_FS_VALIDATION;
    this->lockFS = false;

    if(this->error == 0) {
      settings.fwVersion.parse(version);
      delay(100);
      DBG_PRINTLN("Committing Configuration...");
      somfy.commit();

      // Réinstallation best-effort du pack de langue actif : le filesystem.bin qu'on vient d'écrire
      // ne contient que DEFAULT_EMBEDDED_LANG (cf. minify_data.py::_embed_default_language), donc
      // tout pack téléchargé à la demande (GitUpdater::downloadLangFile, cf. /downloadLang) a été
      // effacé avec le reste de la partition. silent=true : on pilote nous-mêmes le retour visuel
      // via gitLangRestore (cf. firmware.procLangRestore côté UI) plutôt que via
      // langDownloadProgress/Complete -- ces derniers sont pensés pour le flux manuel
      // /downloadLang, qui bascule+recharge la page (inapproprié ici, à quelques centaines de ms
      // d'un redémarrage déjà programmé juste après). Un échec ici (asset absent pour cette
      // release, réseau qui lâche juste après le gros transfert du firmware) ne doit ni annuler la
      // mise à jour -- déjà validée et committée ci-dessus -- ni empêcher le redémarrage :
      // handleLang() sait déjà retomber sur la langue embarquée si le fichier reste manquant.
      if(strcmp(settings.language, DEFAULT_EMBEDDED_LANG) != 0) {
        DBG_PRINTF("Reinstalling active language pack after FS update: %s\n", settings.language);
        this->emitLangRestoreStatus(settings.language, "start");
        int8_t langErr = this->downloadLangFile(settings.language, true);
        // Résultat explicite dans les logs -- downloadLangFile() lui-même ne trace ni succès ni
        // échec (silent=true ici, cf. son commentaire), et l'avertissement "does not exist, no
        // permits for creation" que le coeur ESP32 imprime au passage pour le LittleFS.exists()
        // interne (première installation de ce pack, fichier normalement absent à ce stade) n'est
        // qu'un artefact cosmétique de son implémentation -- pas une preuve d'échec.
        Serial.printf("Language pack %s reinstall %s\n", settings.language, (langErr == 0) ? "succeeded" : "failed");
        this->emitLangRestoreStatus(settings.language, (langErr == 0) ? "success" : "failed");
      }

      // Seule une mise à jour intégralement réussie doit provoquer le redémarrage : le firmware
      // déjà écrit reste inactif tant qu'on ne redémarre pas (l'ancien continue de tourner en
      // mémoire), donc ne PAS rebooter ici laisse une chance à l'utilisateur de voir l'échec dans
      // l'UI plutôt que de redémarrer à l'aveugle sur une partition littlefs corrompue.
      rebootDelay.rebootTime = millis() + 500;
      rebootDelay.reboot = true;
    }
    else {
      Serial.printf("Filesystem update failed (err=%d), reboot cancelled to avoid booting into a corrupted UI\n", this->error);
    }
  }

  this->status = GIT_UPDATE_COMPLETE;
  this->emitUpdateCheck();
  return true;
}

bool GitUpdater::recoverFilesystem() {
  const char* currentVer = settings.fwVersion.name;
  sprintf(this->baseUrl, "https://github.com/" GITHUB_REPOSITORY "/releases/download/%s/", currentVer);

  // Correction appliquée : Choix du filesystem de secours selon le matériel BOX -- BOX-wifi et
  // BOX-eth partagent le même asset, cf. commentaire équivalent dans beginUpdate().
  #if defined(HARDWARE_BOX_ETH) || defined(HARDWARE_BOX_WIFI)
  snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_filesystem_BOX.bin", currentVer);
  #else
  snprintf(this->currentFile, sizeof(this->currentFile), "ESPSomfyRTS_%s_filesystem.bin", currentVer);
  #endif

  this->status = GIT_UPDATING;
  this->partition = U_SPIFFS;
  this->lockFS = true;
  // Cf. beginUpdate() : drainage des lecteurs de fichiers en vol avant d'écrire la partition.
  webServer.waitForFileReaders();
  this->error = this->downloadFile();
  if(this->error == 0 && !this->validateFilesystem()) this->error = ERR_FS_VALIDATION;
  this->lockFS = false;
  if(this->error == 0) {
    delay(100);
    DBG_PRINTLN("Committing Configuration...");
    somfy.commit();

    // Même filet que dans beginUpdate() : cette réparation réécrit elle aussi toute la partition
    // littlefs et effacerait pareillement un pack de langue téléchargé à la demande. Best-effort,
    // entièrement silencieux (pas d'overlay dédié à ce flux de récupération) -- cf. commentaire
    // détaillé dans beginUpdate().
    if(strcmp(settings.language, DEFAULT_EMBEDDED_LANG) != 0) this->downloadLangFile(settings.language, true);

    rebootDelay.rebootTime = millis() + 500;
    rebootDelay.reboot = true;
  }
  else {
    // Un nouvel échec ici (réseau coupé à nouveau, asset absent, partition toujours corrompue) ne
    // doit pas reboucler aveuglément sur un redémarrage -- rien n'empêche l'utilisateur de relancer
    // /recoverFilesystem depuis l'UI (cf. reset du status juste en dessous).
    Serial.printf("Filesystem recovery failed (err=%d), reboot cancelled\n", this->error);
  }
  this->status = GIT_UPDATE_COMPLETE;
  this->emitUpdateCheck();
  // Contrairement à beginUpdate() (rappelée depuis loop(), qui remet elle-même le status à READY),
  // recoverFilesystem() est appelée directement et de façon synchrone par le handler HTTP -- sans
  // ce reset explicite, un échec laisserait le status bloqué sur COMPLETE et /recoverFilesystem
  // resterait inutilisable jusqu'au prochain boot.
  this->status = GIT_STATUS_READY;
  return true;
}

bool GitUpdater::endUpdate() { return true; }

// Retrouve, parmi les releases en cache, l'empreinte de l'image qu'on s'apprête à télécharger.
// Absence d'empreinte = pas de vérification (cf. le commentaire de verifyDigest ci-dessous), jamais
// un refus : bloquer une mise à jour saine parce qu'un champ d'API a changé de nom serait un
// remède pire que le mal -- c'est la leçon du pinning (C-4), dont la note de diffusion prévient
// déjà qu'un changement d'autorité arrête l'OTA.
void GitUpdater::loadExpectedDigest(const char *version, bool firmware) {
  this->hasExpectedDigest = false;
  for(uint8_t i = 0; i <= GIT_MAX_RELEASES; i++) {
    GitRelease &rel = this->cachedReleases.releases[i];
    if(rel.id == 0) continue;
    if(strcmp(rel.version.name, version) != 0 && strcmp(rel.name, version) != 0) continue;
    if(firmware && rel.hasFwDigest) { memcpy(this->expectedDigest, rel.fwDigest, 32); this->hasExpectedDigest = true; }
    else if(!firmware && rel.hasFsDigest) { memcpy(this->expectedDigest, rel.fsDigest, 32); this->hasExpectedDigest = true; }
    break;
  }
  if(!this->hasExpectedDigest)
    Serial.printf("[OTA] Aucune empreinte SHA-256 publiee pour %s (%s) -- installation SANS verification d'integrite\n",
                  this->currentFile, version);
}

int8_t GitUpdater::downloadFile() {
  DBG_PRINTF("Begin update %s\n", this->currentFile);
  WiFiClientSecure sclient;
  // Vérification du certificat serveur (cf. GitHubCA.h). Remplace un setInsecure() qui
  // acceptait n'importe quel certificat sur la connexion même qui rapatrie le firmware.
  sclient.setCACert(GITHUB_ROOT_CA_BUNDLE);
  // Sans ce plafond, la poignée de main retombe sur les 120 s du core Arduino -- huit fois le
  // watchdog, sur la tâche principale. Cf. GIT_TLS_HANDSHAKE_TIMEOUT_S.
  sclient.setHandshakeTimeout(GIT_TLS_HANDSHAKE_TIMEOUT_S);
  HTTPClient https;
  char url[196];
  sprintf(url, "%s%s", this->baseUrl, this->currentFile);
  DBG_PRINTLN(url);
  esp_task_wdt_reset();
  // Chacun des trois `if` qui suivent (heap, https.begin(), code HTTP) doit désormais renvoyer un
  // code d'erreur explicite en cas d'échec -- ce n'était pas le cas avant correction : ces branches
  // se contentaient de logger puis laissaient l'exécution retomber sur le `return 0;` final de
  // cette fonction, ce qui faisait croire à beginUpdate() qu'un firmware/littlefs avait été
  // installé alors qu'aucun octet n'avait été téléchargé (bug constaté en test réel : "Heap too low
  // ... aborting" suivi malgré tout du passage à l'étape suivante).
  if(!hasEnoughHeapForTls()) {
    Serial.println("Heap too low to safely start an OTA download, aborting.");
    return ERR_LOW_HEAP;
  }
  if(https.begin(sclient, url)) {
    https.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    DBG_PRINT("[HTTPS] GET...\n");
    int httpCode = https.GET();
    if(httpCode > 0) {
      size_t len = https.getSize();
      size_t total = 0;
      uint8_t pct = 0;
      DBG_PRINTF("[HTTPS] GET... code: %d - %d\n", httpCode, len);
      if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY || httpCode == HTTP_CODE_FOUND) {
        WiFiClient *stream = https.getStreamPtr();
        // Empreinte calculée AU FIL de l'écriture (suite de C-4). Contexte mbedtls sur la PILE,
        // et non via mbedtls_md_setup() qui alloue sur le tas : c'est précisément la fuite E-16.
        mbedtls_sha256_context shaCtx;
        mbedtls_sha256_init(&shaCtx);
        mbedtls_sha256_starts_ret(&shaCtx, 0); // 0 = SHA-256, pas SHA-224
        if(!Update.begin(len, this->partition)) {
          mbedtls_sha256_free(&shaCtx);
          Serial.println("Update Error detected!!!!!");
          Update.printError(Serial);
          https.end();
          return -(Update.getError() + UPDATE_ERR_OFFSET);
        }
        uint8_t *buff = (uint8_t *)malloc(MAX_BUFF_SIZE);
        if(buff) {
          this->emitDownloadProgress(len, total);
          int timeouts = 0;
          // Update.end(true) peut échouer à la finalisation alors que le compte d'octets écrits
          // était pourtant correct (secteur défaillant, etc.) -- ce cas ne doit pas être avalé
          // silencieusement en un retour de succès.
          bool updateEndFailed = false;
          while(https.connected() && (len > 0 || len == -1) && total < len) {
            size_t size = stream->available();
            esp_task_wdt_reset();
            if(size) {
              timeouts = 0;
              if(this->cancelled && !this->lockFS) {
                Update.abort();
                free(buff);
                https.end();
                return -(Update.getError() + UPDATE_ERR_OFFSET);
              }
              int c = stream->readBytes(buff, ((size > MAX_BUFF_SIZE) ? MAX_BUFF_SIZE : size));
              total += c;
              mbedtls_sha256_update_ret(&shaCtx, buff, c);
              if (Update.write(buff, c) != c) {
                mbedtls_sha256_free(&shaCtx);
                Update.printError(Serial);
                Serial.printf("Upload of %s aborted invalid size %d\n", url, c);
                free(buff);
                https.end();
                sclient.stop();
                return -(Update.getError() + UPDATE_ERR_OFFSET);
              }
              uint8_t p = (uint8_t)floor(((float)total / (float)len) * 100.0f);
              if(p != pct) {
                pct = p;
                DBG_PRINTF("LEN:%d TOTAL:%d %d%%\n", len, total, pct);
                this->emitDownloadProgress(len, total);
              }
              delay(1);
              if(total >= len) {
                // VÉRIFICATION avant de rendre la partition amorçable. Update.end(true) appelle
                // esp_ota_set_boot_partition() : après lui, il est trop tard.
                uint8_t calcule[32];
                mbedtls_sha256_finish_ret(&shaCtx, calcule);
                mbedtls_sha256_free(&shaCtx);
                if(this->hasExpectedDigest && memcmp(calcule, this->expectedDigest, 32) != 0) {
                  Serial.println("[OTA] EMPREINTE SHA-256 INVALIDE -- installation refusee.");
                  Serial.print("[OTA]   attendu : "); for(uint8_t k = 0; k < 32; k++) Serial.printf("%02x", this->expectedDigest[k]);
                  Serial.print("\n[OTA]   obtenu  : "); for(uint8_t k = 0; k < 32; k++) Serial.printf("%02x", calcule[k]);
                  Serial.println();
                  Update.abort();
                  free(buff);
                  https.end();
                  sclient.stop();
                  return GIT_ERR_DIGEST_MISMATCH;
                }
                if(this->hasExpectedDigest) DBG_PRINTLN("[OTA] Empreinte SHA-256 verifiee.");
                if(!Update.end(true)) {
                  Serial.println("Error downloading update...");
                  Update.printError(Serial);
                  updateEndFailed = true;
                }
                else {
                  DBG_PRINTLN("Update.end Called...");
                }
                https.end();
                sclient.stop();
              }
            }
            else {
              timeouts++;
              if(timeouts >= 500) {
                Update.abort();
                // Cf. drainHttpStream() (racine du fichier) : sortie avant d'avoir consommé tout
                // le fichier (total < len), même risque de connexion pas totalement drainée que
                // dans getReleases()/downloadLangFile().
                drainHttpStream(https, stream, "downloadFile() stream timeout");
                https.end();
                free(buff);
                Serial.println("Stream timeout!!!");
                return ERR_DOWNLOAD_TIMEOUT;
              }
              // Plus de sockEmit.loop() ici non plus -- même raison que dans
              // emitDownloadProgress() : la boucle interne de links2004 réessaie une écriture
              // impossible pendant que le flux TLS attend d'être lu, sans nourrir le chien de
              // garde. C'est le chemin qui figeait le téléchargement à 5 %. webServer.loop() est
              // un no-op depuis la bascule ESPAsyncWebServer (cf. Web.cpp), il partait avec.
              esp_task_wdt_reset();
              delay(100);
            }
          }
          free(buff);
          if(len > total) {
            Update.abort();
            somfy.commit();
            Serial.println("Error downloading file!!!");
            return -42;
          }
          else if(updateEndFailed) {
            somfy.commit();
            Serial.println("Update.end() failed after a complete transfer, treating as failure");
            return ERR_UPDATE_END;
          }
          else
            DBG_PRINTF("Update %s complete\n", this->currentFile);
        }
        else {
          Serial.println("Unable to allocate memory for update!!!");
          // Update.begin() a réussi juste au-dessus (partition effacée/prête) mais aucun octet n'a
          // été écrit -- Update.abort() plutôt que laisser la bibliothèque Update dans un état
          // "en cours" incohérent, comme les autres sorties d'erreur de cette boucle.
          Update.abort();
          https.end();
          sclient.stop();
          return ERR_DOWNLOAD_BUFFER;
        }
      }
      else {
        Serial.printf("Invalid HTTP Code... %d", httpCode);
        return httpCode;
      }
    }
    else {
      Serial.printf("Invalid HTTP Code: %d\n", httpCode);
      https.end();
      sclient.stop();
      return ERR_DOWNLOAD_HTTP;
    }
    https.end();
    sclient.stop();
    DBG_PRINTF("End update %s\n", this->currentFile);
  }
  else {
    Serial.println("https.begin() failed (DNS/TLS?): unable to open the OTA download connection");
    return ERR_DOWNLOAD_CONNECTION;
  }
  esp_task_wdt_reset();
  return 0;
}

// Valide qu'une partition littlefs fraîchement écrite est réellement montable et contient l'UI --
// Update.end() ne vérifie qu'un compte d'octets, pas la structure du filesystem : une écriture
// interrompue ou un secteur défaillant peut donner un total d'octets correct mais une partition
// illisible. On démonte puis remonte LittleFS (la partition réelle de l'appareil, celle que
// downloadFile() vient d'écrire directement via Update) pour forcer une vraie lecture du
// superbloc, comme le ferait un boot -- puis on vérifie la présence du document racine de l'UI.
bool GitUpdater::validateFilesystem() {
  LittleFS.end();
  if(!LittleFS.begin()) {
    DBG_PRINTLN("[GitOTA-DEBUG] validateFilesystem(): LittleFS.begin() failed after write");
    return false;
  }
  // index.html n'existe jamais en clair sur le device, seulement sa variante gzip (cf.
  // handleStreamFile()/WebStatic.cpp, alwaysGzipped=true pour "/") -- c'est elle qui sert de
  // sentinelle.
  File f = LittleFS.open("/index.html.gz", "r");
  bool ok = f && f.size() > 0;
  if(f) f.close();
  if(!ok) DBG_PRINTLN("[GitOTA-DEBUG] validateFilesystem(): /index.html.gz missing or empty");
  return ok;
}

// ÉTRANGLEMENT TEMPOREL, jumeau de celui d'emitDownloadProgress() ci-dessus (audit 23/08/2026).
// Le correctif E-14 n'avait été appliqué qu'au chemin FIRMWARE ; ce chemin-ci, pourtant identique
// dans sa structure, était resté à une émission PAR CHUNK -- et downloadLangFile() lit par blocs de
// LANG_DOWNLOAD_BUFF_SIZE (1 Ko), soit une diffusion WebSocket tous les 1024 octets au mieux,
// souvent plus dès que le flux TLS livre des segments partiels.
// Le mécanisme du blocage est exactement celui documenté sur emitDownloadProgress() : chaque
// diffusion peut rester jusqu'à WEBSOCKETS_TCP_TIMEOUT (2 s) dans write() sur un client dont la
// fenêtre TCP ne se libère pas, et ce temps est volé à loopTask -- la même tâche qui doit continuer
// à lire le flux TLS entrant. Le flux finit par expirer (`timeouts >= 500`), la boucle de lecture
// sort sur "stream timeout" et le transfert est déclaré incomplet : le téléchargement de langue
// échoue sans que rien de visible n'ait mal tourné côté réseau.
// 500 ms suffisent très largement à une barre de progression. La dernière émission
// (loaded >= total) passe toujours, sans quoi l'interface resterait figée juste avant 100 %.
void GitUpdater::emitLangDownloadProgress(const char *code, size_t total, size_t loaded) {
  static uint32_t lastLangEmit = 0;
  const bool isFinal = (total > 0 && loaded >= total);
  if(!isFinal && lastLangEmit != 0 && (uint32_t)(millis() - lastLangEmit) < GIT_PROGRESS_MIN_INTERVAL) {
    // Le chien de garde est nourri même quand on n'émet rien : c'est le seul reset de cette
    // itération de la boucle d'écriture appelante quand l'émission est étranglée.
    esp_task_wdt_reset();
    return;
  }
  lastLangEmit = millis();
  JsonSockEvent *json = sockEmit.beginEmit("langDownloadProgress");
  json->beginObject();
  json->addElem("code", code);
  json->addElem("total", (uint32_t)total);
  json->addElem("loaded", (uint32_t)loaded);
  json->endObject();
  sockEmit.endEmit();
  // Pas de sockEmit.loop() : cf. le commentaire détaillé sur emitDownloadProgress(). endEmit()
  // a déjà émis ; la boucle interne de links2004 ne ferait que réessayer une écriture bloquée
  // sans nourrir le chien de garde -- et ces trois émetteurs tournent pendant/juste après une
  // OTA, exactement quand la pile Wi-Fi est saturée.
  esp_task_wdt_reset();
}
void GitUpdater::emitLangDownloadComplete(const char *code, bool success) {
  JsonSockEvent *json = sockEmit.beginEmit("langDownloadComplete");
  json->beginObject();
  json->addElem("code", code);
  json->addElem("success", success);
  json->endObject();
  sockEmit.endEmit();
  // Pas de sockEmit.loop() : cf. le commentaire détaillé sur emitDownloadProgress(). endEmit()
  // a déjà émis ; la boucle interne de links2004 ne ferait que réessayer une écriture bloquée
  // sans nourrir le chien de garde -- et ces trois émetteurs tournent pendant/juste après une
  // OTA, exactement quand la pile Wi-Fi est saturée.
  esp_task_wdt_reset();
}

#define LANG_DOWNLOAD_BUFF_SIZE 1024

// Téléchargement à la demande d'un fichier de langue (Phase 2 i18n) : même patron réseau que
// downloadFile() (WiFiClientSecure/HTTPClient), mais écrit dans un simple fichier LittleFS
// plutôt que dans une partition flash via Update. Toujours vers un nom temporaire d'abord --
// /locale/temp.json.gz -- validé (taille non nulle + en-tête gzip correct) puis renommé vers
// /locale/<code>.json.gz seulement en cas de succès, pour ne jamais écraser une langue déjà
// installée et fonctionnelle par un téléchargement partiel ou corrompu.
int8_t GitUpdater::downloadLangFile(const char *code, bool silent) {
  DBG_PRINTF("Downloading language file: %s\n", code);
  char url[196];
  snprintf(url, sizeof(url), "https://github.com/" GITHUB_REPOSITORY "/releases/download/%s/ESPSomfyRTS_%s_lang_%s.json.gz",
    settings.fwVersion.name, settings.fwVersion.name, code);
  DBG_PRINTLN(url);

  const char *tempPath = "/locale/temp.json.gz";
  WiFiClientSecure sclient;
  // Vérification du certificat serveur (cf. GitHubCA.h). Remplace un setInsecure() qui
  // acceptait n'importe quel certificat sur la connexion même qui rapatrie le firmware.
  sclient.setCACert(GITHUB_ROOT_CA_BUNDLE);
  // Sans ce plafond, la poignée de main retombe sur les 120 s du core Arduino -- huit fois le
  // watchdog, sur la tâche principale. Cf. GIT_TLS_HANDSHAKE_TIMEOUT_S.
  sclient.setHandshakeTimeout(GIT_TLS_HANDSHAKE_TIMEOUT_S);
  HTTPClient https;
  https.setReuse(false);
  esp_task_wdt_reset();

  this->lockFS = true;
  // Cf. beginUpdate() : ce chemin écrit lui aussi LittleFS (/locale/*.json.gz) pendant qu'async_tcp
  // peut encore être en train de servir un asset -- même drainage.
  webServer.waitForFileReaders();
  int8_t result = -1;

  if(!hasEnoughHeapForTls()) DBG_PRINTLN("Language download: heap too low to safely open a TLS connection");
  if(hasEnoughHeapForTls() && https.begin(sclient, url)) {
    https.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    int httpCode = https.GET();
    if(httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY || httpCode == HTTP_CODE_FOUND) {
      size_t len = https.getSize();
      if(len == 0) {
        DBG_PRINTLN("Language download: empty response");
      }
      else {
        WiFiClient *stream = https.getStreamPtr();
        File f = LittleFS.open(tempPath, "w");
        if(f) {
          size_t total = 0;
          uint8_t buff[LANG_DOWNLOAD_BUFF_SIZE];
          int timeouts = 0;
          if(!silent) this->emitLangDownloadProgress(code, len, total);
          while(https.connected() && (len > 0 || len == -1) && total < len) {
            size_t size = stream->available();
            esp_task_wdt_reset();
            if(size) {
              timeouts = 0;
              int c = stream->readBytes(buff, ((size > sizeof(buff)) ? sizeof(buff) : size));
              f.write(buff, c);
              total += c;
              if(!silent) this->emitLangDownloadProgress(code, len, total);
              delay(1);
            }
            else {
              timeouts++;
              if(timeouts >= 500) {
                DBG_PRINTLN("Language download: stream timeout");
                break;
              }
              // Jumelle de la boucle d'attente de downloadFile() : même retrait, même raison.
              esp_task_wdt_reset();
              delay(10);
            }
          }
          f.close();
          if(total > 0 && total >= len) result = 0;
          else DBG_PRINTLN("Language download: incomplete transfer");
        }
        else {
          DBG_PRINTLN("Language download: unable to open temp file");
        }
      }
    }
    else {
      DBG_PRINTF("Language download: invalid HTTP code %d\n", httpCode);
    }
    // Le chemin de timeout ci-dessus (`break` sur stream timeout) sort de la boucle de lecture
    // avant d'avoir consommé tout le fichier (total < len) -- cf. drainHttpStream() (racine du
    // fichier) pour le risque encouru à fermer une connexion pas totalement drainée. Repris via
    // https.getStreamPtr() plutôt que la variable `stream` locale au bloc ci-dessus (hors de
    // portée ici) -- sans coût, renvoie le même pointeur.
    drainHttpStream(https, https.getStreamPtr(), "downloadLangFile()");
    https.end();
    sclient.stop();
  }

  // Validation minimale du contenu : en-tête gzip (0x1F 0x8B) présent -- suffisant pour
  // détecter une page d'erreur/redirection reçue avec un code 200 au lieu du vrai asset,
  // sans avoir besoin d'une bibliothèque de décompression embarquée.
  if(result == 0) {
    File check = LittleFS.open(tempPath, "r");
    if(!check || check.size() < 2 || check.read() != 0x1F || check.read() != 0x8B) {
      DBG_PRINTLN("Language download: invalid gzip header");
      result = -1;
    }
    if(check) check.close();
  }

  if(result == 0) {
    char finalPath[32];
    snprintf(finalPath, sizeof(finalPath), "/locale/%s.json.gz", code);
    if(LittleFS.exists(finalPath)) LittleFS.remove(finalPath);
    if(!LittleFS.rename(tempPath, finalPath)) {
      DBG_PRINTLN("Language download: rename failed");
      result = -1;
    }
  }
  if(result != 0) LittleFS.remove(tempPath);

  this->lockFS = false;
  if(!silent) this->emitLangDownloadComplete(code, result == 0);
  return result;
}

bool GitUpdater::releasesCacheEmpty() {
  for(uint8_t i = 0; i < GIT_MAX_RELEASES; i++) {
    if(this->cachedReleases.releases[i].id != 0) return false;
  }
  return true;
}

void GitUpdater::emitLangRestoreStatus(const char *code, const char *state) {
  JsonSockEvent *json = sockEmit.beginEmit("gitLangRestore");
  json->beginObject();
  json->addElem("code", code);
  json->addElem("state", state);
  json->endObject();
  sockEmit.endEmit();
  // Pas de sockEmit.loop() : cf. le commentaire détaillé sur emitDownloadProgress(). endEmit()
  // a déjà émis ; la boucle interne de links2004 ne ferait que réessayer une écriture bloquée
  // sans nourrir le chien de garde -- et ces trois émetteurs tournent pendant/juste après une
  // OTA, exactement quand la pile Wi-Fi est saturée.
  esp_task_wdt_reset();
}

// Résolution de la langue en attente (cf. ConfigSettings::pendingLang, /setPendingLang) : appelée
// depuis loop() une fois la connectivité réseau établie. checkInternet() (déjà utilisé par
// checkForUpdate()) sert ici de garde silencieuse -- tant qu'aucune route Internet réelle n'existe
// (cas typique : Wi-Fi local sans accès Internet), on ne tente même pas downloadLangFile() et on
// ne déclenche donc aucun évènement socket d'échec qui spammerait un navigateur resté ouvert ;
// downloadLangFile() lui-même émet déjà langDownloadComplete (succès/échec), donc pas de double
// émission ici une fois la tentative réellement lancée.
void GitUpdater::checkPendingLang() {
  this->lastPendingLangCheck = millis();
  // Pas de connectivité Internet exploitable : on n'a RIEN tenté, donc pas de raison de payer
  // l'intervalle plein. C'est le cas courant dans les secondes qui suivent l'arrivée sur le
  // réseau local (DHCP/DNS encore en cours) -- typiquement juste après la fin de l'assistant de
  // premier démarrage, au moment précis où l'utilisateur attend sa langue. On double simplement
  // le délai à chaque échec, jusqu'au plafond, pour se débloquer vite dans ce cas transitoire
  // sans sonder indéfiniment un réseau réellement dépourvu d'accès Internet.
  if(this->checkInternet() != 0) {
    uint32_t next = this->pendingLangRetryMs * 2;
    this->pendingLangRetryMs = (next > PENDING_LANG_RETRY_MAX) ? PENDING_LANG_RETRY_MAX : next;
    DBG_PRINTF("Pending language: no internet yet, retry in %u ms\n", this->pendingLangRetryMs);
    return;
  }

  char code[8];
  strlcpy(code, settings.pendingLang, sizeof(code));
  DBG_PRINTF("Resolving pending language: %s\n", code);
  int8_t err = this->downloadLangFile(code);
  if(err == 0) {
    strlcpy(settings.language, code, sizeof(settings.language));
    settings.pendingLang[0] = '\0';
    settings.save();
    this->pendingLangRetryMs = PENDING_LANG_RETRY_MIN;
    DBG_PRINTF("Pending language applied: %s\n", code);
  }
  else {
    // Vrai échec de téléchargement (asset absent de la release, coupure en cours de transfert) :
    // contrairement au cas ci-dessus, réessayer tout de suite n'a aucune raison d'aboutir.
    this->pendingLangRetryMs = PENDING_LANG_RETRY_MAX;
    DBG_PRINTLN("Pending language download failed, will retry later");
  }
}
