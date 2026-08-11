// =========================================================================
// SECTION : APPUI LONG / RÉPÉTITION DE COMMANDE
// =========================================================================
// `mouseDown` était lu par trois fonctions indépendantes (télécommande
// virtuelle, appairage, liaison de groupe) mais écrit par une seule d'entre
// elles -- audité en session : la répétition tant qu'on maintenait un
// bouton VR ou "Prog" en appairage n'a donc jamais fonctionné, malgré toute
// la logique de répétition déjà en place (sendCommandRepeat/sendGroupRepeat).
//
// Suivi au niveau document plutôt que par bouton : la capture garantit
// toujours un relâchement (mouseup/touchend/touchcancel arrivent forcément
// jusqu'ici, où qu'ils se produisent sur la page), sans avoir à poser des
// écouteurs pointerup/pointerleave/pointercancel sur chaque bouton -- un
// essai plus complexe (WeakMap par élément, anneau de progression en
// conic-gradient) s'est révélé visuellement raté en test ("horrible", trop
// travaillé pour ce que ça apporte) et a été abandonné au profit de ce
// patron, plus simple et plus robuste.
var mouseDown = false;
const setPointerDown = (down) => () => { mouseDown = down; };
document.addEventListener('mousedown', setPointerDown(true), true);
document.addEventListener('mouseup', setPointerDown(false), true);
document.addEventListener('touchstart', setPointerDown(true), { capture: true, passive: true });
document.addEventListener('touchend', setPointerDown(false), true);
document.addEventListener('touchcancel', setPointerDown(false), true);

// Halo visuel (.press-glow, voir base.css) pour les boutons sans geste de relâchement dédié
// (télécommande virtuelle, "Prog" en appairage/liaison de groupe) : posé une seule fois par
// bouton (idempotent), suit l'appui en cours quelle que soit sa durée -- utile pour les
// commandes à répétition (mouseDown ci-dessus), qui n'ont pas de seuil fixe contrairement au
// motif "2s" des cartes volet (armPressGlow/releasePressGlow dans setShadesList()).
const _pressGlowWired = new WeakSet();
function wirePressGlow(el) {
    if (_pressGlowWired.has(el)) return;
    _pressGlowWired.add(el);
    const clear = () => el.classList.remove('press-glow');
    el.addEventListener('mouseup', clear);
    el.addEventListener('mouseleave', clear);
    el.addEventListener('touchend', clear);
    el.addEventListener('touchcancel', clear);
}

let deviceUptimeSeconds = 0;
let netUptimeSeconds = 0;
let uptimeInterval = null;

// Logger centralisé : debug/info ne s'affichent que si l'utilisateur a activé "Logs de debug"
// (Système > Firmware). warn/error restent toujours visibles : ce sont de vrais problèmes
// techniques (fichier de langue manquant, déconnexion socket, requête API en échec...) qu'on
// veut voir même sans avoir activé le mode debug. Synchronisé via logger.setDebugEnabled()
// dans general.loadGeneral() et general.setGeneral().
const logger = {
    _debugEnabled: false,
    setDebugEnabled(enabled) { this._debugEnabled = !!enabled; },
    debug(...args) { if (this._debugEnabled) console.log(...args); },
    info(...args) { if (this._debugEnabled) console.info(...args); },
    warn(...args) { console.warn(...args); },
    error(...args) { console.error(...args); }
};

function initEasterEggToggle(triggerSelector, targetClassName, requiredClicks = 3) {
    const trigger = document.querySelector(triggerSelector);
    if (!trigger) return;

    let clickCount = 0;
    let clickTimeout;

    trigger.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;

        clickCount++;
        clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => { clickCount = 0; }, 2000);

        if (clickCount >= requiredClicks) {
            document.body.classList.add(targetClassName);
            if (typeof ui?.successMessage === 'function') {
                ui.successMessage("Mode avancé débloqué.");
            }
            clickCount = 0;
        }
    });
}


if (typeof ui !== 'undefined' && ui.waitMessage) {
    waitLoad = ui.waitMessage(document.body);
}
window.tr = function(id) {
    if (LANG && LANG[id]) return LANG[id];
    if (LANG_FALLBACK && LANG_FALLBACK[id]) return LANG_FALLBACK[id];
    return id;
};
const translator = {
    isInitialized: false,
    observer: null,

    translate(el) {
        const key = el.getAttribute('tr');
        if (!key) return;

        const text = tr(key);
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
        } else if (el.hasAttribute('title')) {
            el.title = text;
        } else {
            el.textContent = text;
        }
    },
    init() {
        document.querySelectorAll('[tr]').forEach(el => this.translate(el));
        if (this.isInitialized) return;

        this.observer = new MutationObserver((mutations) => {
            mutations.forEach(m => m.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.hasAttribute('tr')) this.translate(node);
                    node.querySelectorAll('[tr]').forEach(el => this.translate(el));
                }
            }));
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.isInitialized = true;
    }
};
function loadLang(callback) {
    if (Object.keys(LANG).length > 0) {
        logger.debug("Language already cached, skipping reload");
        if (callback) callback();
        return;
    }
    fetch(baseUrl + '/lang')
    .then(r => r.json())
    .then(dict => {
        LANG = dict;
        // Filet de rattrapage : la langue active peut être un pack téléchargé depuis une release
        // ANTÉRIEURE aux clés introduites depuis (les packs vivent hors du firmware, cf.
        // GitUpdater::downloadLangFile). Sans repli, ces clés s'affichaient telles quelles à
        // l'écran ("MSG_WAIT_LANG_CATALOG"). La langue embarquée, elle, est toujours livrée avec
        // ce bundle donc toujours à jour : elle sert de secours clé par clé.
        // Le serveur répond 204 quand la langue active EST déjà l'embarquée : rien à charger.
        return fetch(baseUrl + '/langDefault')
            .then(r => (r.ok && r.status !== 204) ? r.json() : null)
            .then(d => { if (d) LANG_FALLBACK = d; })
            .catch(err => logger.warn('Fallback language unavailable:', err));
    })
    .then(() => {
        translator.init();
        finishLoad(callback);
    })
    .catch(err => {
        logger.error("Failed to load language file, falling back to defaults", err);
        LANG = { "BT_LOGIN": "Login", "HOME": "Maison" };
        translator.init();
        finishLoad(callback);
    });
}
function finishLoad(callback) {
    document.body.classList.add('lang-loaded');
    if (waitLoad && typeof waitLoad.remove === 'function') {
        waitLoad.remove();
    }
    if (callback) callback();
}
// Détection de la langue navigateur vs langue active (Phase 3 i18n) : propose discrètement le
// téléchargement d'une langue reconnue par le manifeste, ni active ni déjà installée. Ne
// s'exécute qu'une fois par chargement de page (langSuggestionChecked) ; si l'authentification
// est requise et pas encore effective, diffère la vérification jusqu'à l'évènement 'afterlogin'
// (cf. Security.login()) puisque /downloadLang exige une session authentifiée.
let _langManifestCache = null;
// Tente d'abord le manifeste local (même origine, embarqué sur l'ESP32 -- toujours joignable,
// y compris en mode AP/hotspot sans accès Internet) avant de retomber sur GitHub, qui reste la
// source de vérité pour les langues ajoutées après la dernière mise à jour firmware.
function loadLangManifest() {
    if (_langManifestCache) return Promise.resolve(_langManifestCache);
    return fetch(baseUrl + '/manifest.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(manifest => { _langManifestCache = manifest; return manifest; })
    .catch(() => fetch(LANG_MANIFEST_URL)
        .then(r => r.json())
        .then(manifest => { _langManifestCache = manifest; return manifest; })
        .catch(err => { logger.error('Failed to load language manifest:', err); return null; })
    );
}
// Phase 5 i18n : détecte la langue active mais absente du filesystem -- typiquement après une
// mise à jour firmware, qui réécrit toute la partition LittleFS (cf. GitUpdater::beginUpdate())
// et n'y restaure que shades.cfg (somfy.commit()), jamais les langues téléchargées à la demande.
// settings.language (NVS, partition distincte) continue de pointer sur ce code, alors que
// handleLang() est déjà tombé en repli silencieux sur l'anglais -- sans explication pour
// l'utilisateur. Prioritaire sur la suggestion de langue navigateur (Phase 3) : on ne les
// affiche jamais toutes les deux à la fois, un vrai problème passe avant une simple suggestion.
// Confirmation "one-shot" qu'une langue mise en attente (mode AP, cf. General.setPendingLang())
// vient d'être appliquée par GitUpdater::checkPendingLang() -- ce n'est PAS l'évènement socket
// langDownloadComplete qui s'en charge ici (rien ne garantit qu'un navigateur soit resté ouvert
// entre la mise en attente et la résolution, potentiellement des heures plus tard) : on compare
// simplement, à chaque chargement de page, le code surveillé dans localStorage à l'état renvoyé
// par /loginContext -- déjà à jour pour CE chargement puisque settings.language est modifié
// directement côté firmware avant toute notification.
let pendingLangAppliedChecked = false;
function checkPendingLangApplied(activeLang, pendingLang) {
    if (pendingLangAppliedChecked) return;
    pendingLangAppliedChecked = true;
    const watched = localStorage.getItem('pendingLangWatch');
    if (!watched) return;
    if (pendingLang) return; // toujours en file d'attente, on garde le repère pour la prochaine visite
    localStorage.removeItem('pendingLangWatch');
    if (activeLang === watched && typeof general !== 'undefined') general.showLangAppliedToast(watched);
}
let activeLangAvailabilityChecked = false;
function checkActiveLangAvailability(activeLang) {
    if (activeLangAvailabilityChecked) return;
    if (!activeLang) return;
    if (typeof security !== 'undefined' && security.type !== 0 && !security.authenticated) return;
    activeLangAvailabilityChecked = true;

    deviceFetch('/getInstalledLangs')
    .then(installed => {
        if (installed.includes(activeLang)) {
            checkBrowserLangSuggestion(activeLang);
            return;
        }
        if (typeof general !== 'undefined') general.showLangMissingPrompt(activeLang);
    })
    .catch(err => logger.error('Failed to check active language availability:', err));
}
let langSuggestionChecked = false;
function checkBrowserLangSuggestion(activeLang) {
    if (langSuggestionChecked) return;
    if (typeof security !== 'undefined' && security.type !== 0 && !security.authenticated) return;
    // Jamais en mode hotspot : l'ESP32 n'y a aucune route Internet, donc aucune langue ne peut
    // être installée à ce moment-là -- proposer le téléchargement n'y mènerait qu'à un échec ou à
    // une mise en attente invisible. La suggestion est donc réservée au réseau local, une fois que
    // l'appareil peut réellement aller chercher le fichier (cf. showBrowserLangPrompt()).
    if (isApMode) return;
    langSuggestionChecked = true;

    const browserLang = ((navigator.language || navigator.userLanguage || 'en').split('-')[0] || '').toLowerCase();
    if (!browserLang || browserLang === activeLang) return;
    if (localStorage.getItem('langPromptDismissed_' + browserLang) === '1') return;

    Promise.all([
        loadLangManifest(),
        deviceFetch('/getInstalledLangs').catch(() => [])
    ])
    .then(([manifest, installed]) => {
        if (!manifest || !manifest.langs || !manifest.langs[browserLang]) return; // langue inconnue du projet
        if (installed.includes(browserLang)) return; // déjà installée (juste pas active)
        if (typeof general !== 'undefined') general.showBrowserLangPrompt(browserLang, manifest.langs[browserLang]);
    })
    .catch(err => logger.error('Failed to check browser language suggestion:', err));
}
// --- Relais navigateur (Phase 4 i18n) : en mode AP, l'ESP32 n'a aucune route Internet, donc
// /downloadLang échouerait systématiquement. Si le navigateur du client a sa propre connectivité
// (4G/5G en parallèle du WiFi de config, cas fréquent sur smartphone -- jamais garanti sur PC),
// on récupère ici le JSON brut depuis raw.githubusercontent.com (CORS ouvert, contrairement aux
// assets de release qui eux ne le sont pas -- vérifié), on le compresse en gzip côté client
// (CompressionStream, cf. support navigateur), puis on le pousse vers /uploadLang. ---
async function gzipCompress(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
}
// Verrouille la récupération du CONTENU d'une langue sur le tag exact du firmware en cours
// (window.__fwVersionTag, capturé depuis /loginContext) : sans ça, un firmware resté sur une
// ancienne version relaierait le contenu le plus récent de `main`, qui peut avoir évolué
// (nouvelles clés, libellés modifiés) et diverger de ce que ce firmware attend. Repli sur `main`
// uniquement si le tag n'a pas (encore) ce fichier -- ex: langue ajoutée après cette release --
// ou si aucun tag n'est connu (contexte de dev).
async function fetchGithubRawContent(path) {
    const tag = window.__fwVersionTag;
    if (tag) {
        const pinnedUrl = `${GITHUB_RAW_ROOT}${tag}/${path}`;
        const r = await fetch(pinnedUrl);
        if (r.ok) return r.text();
        logger.debug(`Language source absent at tag ${tag}, falling back to main:`, pinnedUrl);
    }
    const fallbackUrl = `${GITHUB_RAW_ROOT}main/${path}`;
    const r2 = await fetch(fallbackUrl);
    if (!r2.ok) throw new Error('HTTP ' + r2.status);
    return r2.text();
}
// Chaque étape lève une erreur distincte (au lieu de retourner silencieusement false) : le stade
// exact de l'échec est sinon impossible à distinguer depuis le message générique affiché à
// l'utilisateur -- indispensable pour diagnostiquer, par ex., un mobile dont le WiFi n'a pas basculé
// vers les données cellulaires pour ce trafic (fetchGithubRawContent) plutôt qu'un souci côté ESP32.
async function relayLangViaBrowser(code) {
    if (typeof CompressionStream === 'undefined') {
        throw new Error('unsupported: CompressionStream API absente de ce navigateur');
    }
    const manifest = await loadLangManifest();
    if (!manifest) {
        throw new Error('manifest-fetch-failed: pas de route Internet vers raw.githubusercontent.com depuis cet appareil');
    }
    const info = manifest.langs && manifest.langs[code];
    if (!info || !info.path) {
        throw new Error('unknown-language: ' + code + ' absent du manifeste');
    }

    let text;
    try {
        text = await fetchGithubRawContent(info.path);
    } catch (err) {
        throw new Error('github-fetch-failed: pas de route Internet vers raw.githubusercontent.com depuis cet appareil (' + err.message + ')');
    }

    const gzBlob = await gzipCompress(text);
    await uploadLangGzBlob(code, gzBlob);
}
// Étape finale, partagée par le relais automatique (relayLangViaBrowser) et l'import manuel
// (importLangFileManually, fallback quand raw.githubusercontent.com est réellement injoignable
// depuis cet appareil) : pousse le contenu déjà gzippé vers /uploadLang.
async function uploadLangGzBlob(code, gzBlob) {
    const fd = new FormData();
    fd.append('file', gzBlob, code + '.json.gz');
    let upResp;
    try {
        upResp = await fetch(baseUrl + '/uploadLang?code=' + code, { method: 'POST', body: fd, headers: { apikey: security.apiKey || '' } });
    } catch (err) {
        throw new Error('upload-failed: ESP32 injoignable depuis ce navigateur (' + err.message + ')');
    }
    let json;
    try {
        json = await upResp.json();
    } catch (err) {
        throw new Error('upload-bad-response: HTTP ' + upResp.status);
    }
    if (json.status !== 'ok') {
        throw new Error('upload-rejected: ' + (json.error || json.desc || ('HTTP ' + upResp.status)));
    }
}
// Fallback ultime (Phase 7 i18n) quand ni l'ESP32 (mode AP, sans Internet) ni le navigateur du
// client (relayLangViaBrowser, cf. github-fetch-failed) ne peuvent joindre raw.githubusercontent.com :
// l'utilisateur récupère le fichier de langue avec un AUTRE appareil/onglet ayant Internet, puis
// l'importe ici directement depuis le stockage local -- ne dépend d'aucune route réseau. Le fichier
// récupéré (ex: asset de release GitHub, cf. GitOTA.cpp) est le plus souvent déjà un .json.gz --
// on détecte ce cas à l'en-tête magique gzip (0x1F 0x8B, comme le fait /uploadLang côté firmware,
// cf. WebI18n.cpp::handleUploadLang) plutôt que sur l'extension du fichier, qui peut avoir été
// renommée. Un fichier déjà gzippé n'est PAS recompressé (un double-gzip serait rejeté par ce même
// contrôle d'en-tête côté firmware) ; on se contente de vérifier que son contenu décompressé est un
// JSON valide avant de le pousser tel quel.
async function importLangFileManually(code, file) {
    let buf;
    try {
        buf = await file.arrayBuffer();
    } catch (err) {
        throw new Error('read-failed: impossible de lire le fichier sélectionné (' + err.message + ')');
    }
    const bytes = new Uint8Array(buf);
    const isGzip = bytes.length >= 2 && bytes[0] === 0x1F && bytes[1] === 0x8B;

    if (isGzip) {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('unsupported: DecompressionStream API absente de ce navigateur, impossible de valider ce fichier .gz');
        }
        let text;
        try {
            const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
            text = await new Response(ds).text();
        } catch (err) {
            throw new Error('invalid-gzip: le fichier .gz sélectionné est corrompu ou illisible (' + err.message + ')');
        }
        try {
            JSON.parse(text);
        } catch (err) {
            throw new Error('invalid-json: le fichier .gz sélectionné ne contient pas un JSON valide');
        }
        await uploadLangGzBlob(code, new Blob([bytes]));
        return;
    }

    let text;
    try {
        text = new TextDecoder('utf-8').decode(bytes);
    } catch (err) {
        throw new Error('read-failed: impossible de lire le fichier sélectionné (' + err.message + ')');
    }
    try {
        JSON.parse(text);
    } catch (err) {
        throw new Error('invalid-json: le fichier sélectionné n\'est pas un JSON valide');
    }
    const gzBlob = await gzipCompress(text);
    await uploadLangGzBlob(code, gzBlob);
}
// Relabellise la ligne "Réseau" de la pop-up uptime (toutes ses occurrences : tooltip desktop,
// tooltip mobile, panneau Firmware) selon l'interface réellement active transmise par le firmware.
// mode attendu : "ap" | "eth" | "wifi" (cf. WebAuth::handleLoginContext) -- "wifi" par défaut si
// absent, pour rester correct sur un firmware plus ancien qui n'enverrait pas encore netMode.
function updateNetUptimeLabel(mode) {
    const key = mode === 'ap' ? 'TOPBAR_NET_AP' : mode === 'eth' ? 'TOPBAR_NET_ETH' : 'TOPBAR_NET_WIFI';
    const text = tr(key);
    document.querySelectorAll('.net-uptime-label').forEach(el => {
        if (el.hasAttribute('title')) el.title = text;
        else el.textContent = text;
    });
}
function displayUptime(totalSeconds, className) {
    const elements = document.querySelectorAll('.' + className);
    if (elements.length === 0 || isNaN(totalSeconds)) return;

    let seconds = parseInt(totalSeconds, 10);
    let days = Math.floor(seconds / (24 * 3600));
    seconds %= (24 * 3600);
    let hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    let minutes = Math.floor(seconds / 60);

    const fH = hours.toString().padStart(2, '0');
    const fM = minutes.toString().padStart(2, '0');
    // `seconds` a déjà été réduit modulo 3600 ci-dessus : le reste modulo 60 est donc bien le
    // nombre de secondes de la minute en cours.
    const fS = (seconds % 60).toString().padStart(2, '0');
    const timeString = `${days}${tr('DAY')} ${fH}${tr('HOUR')} ${fM}${tr('MIN')} ${fS}${tr('SEC')}`;

    elements.forEach(el => {
        el.textContent = timeString;
    });
}
var errors = [
    { code: -10, key: 'ERR_PIN_TRANSCEIVER' },
    { code: -11, key: 'ERR_PIN_ETHERNET' },
    { code: -12, key: 'ERR_PIN_MOTOR' },
    { code: -21, key: 'ERR_GIT_FLASH_WRITE' },
    { code: -22, key: 'ERR_GIT_FLASH_ERASE' },
    { code: -23, key: 'ERR_GIT_FLASH_READ' },
    { code: -24, key: 'ERR_GIT_SPACE' },
    { code: -25, key: 'ERR_GIT_FILE_SIZE' },
    { code: -26, key: 'ERR_GIT_TIMEOUT' },
    { code: -27, key: 'ERR_GIT_MD5' },
    { code: -28, key: 'ERR_GIT_MAGIC_BYTE' },
    { code: -29, key: 'ERR_GIT_ACTIVATE' },
    { code: -30, key: 'ERR_GIT_PARTITION' },
    { code: -31, key: 'ERR_GIT_ARGUMENT' },
    { code: -32, key: 'ERR_GIT_ABORTED' },
    { code: -40, key: 'ERR_GIT_HTTP' },
    { code: -41, key: 'ERR_GIT_BUFFER' },
    { code: -42, key: 'ERR_GIT_CONNECT' },
    { code: -43, key: 'ERR_GIT_DL_TIMEOUT' }
].map(err => {

    return {
        code: err.code,
        key: err.key,
        get desc() { return tr(this.key); }
    };
});
document.oncontextmenu = (event) => {
    if (event.target && event.target.tagName.toLowerCase() === 'input' && (event.target.type.toLowerCase() === 'text' || event.target.type.toLowerCase() === 'password'))
        return;
    else {
        event.preventDefault(); event.stopPropagation(); return false;
    }
};
Date.prototype.toJSON = function () {
    const tz = this.getTimezoneOffset();
    const sign = tz > 0 ? '-' : '+';
    const absTz = Math.abs(tz);
    const f = (n, c) => n.toString().padStart(c, '0');

    return `${this.getFullYear()}-${f(this.getMonth() + 1, 2)}-${f(this.getDate(), 2)}T${f(this.getHours(), 2)}:${f(this.getMinutes(), 2)}:${f(this.getSeconds(), 2)}.${f(this.getMilliseconds(), 3)}${sign}${f(Math.floor(absTz / 60), 2)}${f(absTz % 60, 2)}`;
};
Date.prototype.fmt = function (fmtMask, emptyMask) {
    const mask = fmtMask || 'MM-dd-yyyy HH:mm:ss';
    if (mask.match(/[hHmt]/) && this.isDateTimeEmpty?.()) return emptyMask ?? '';
    if (mask.match(/[Mdy]/) && this.isDateEmpty?.()) return emptyMask ?? '';

    const d = this;
    const y = d.getFullYear();
    const H = d.getHours();
    const m = d.getMonth();
    const map = {
        yyyy: y,
        yy: String(y).slice(-2),
        MMMM: formatType.MONTHS[m],
        MMM: formatType.MONTHS[m]?.substring(0, 3),
        MM: String(m + 1).padStart(2, '0'),
        M: m + 1,
        dddd: formatType.DAYS[d.getDay()],
        ddd: formatType.DAYS[d.getDay()]?.substring(0, 3),
        dd: String(d.getDate()).padStart(2, '0'),
        d: d.getDate(),
        HH: String(H).padStart(2, '0'),
        H: H,
        hh: String(H % 12 || 12).padStart(2, '0'),
        h: (H % 12 || 12),
        mm: String(d.getMinutes()).padStart(2, '0'),
        m: d.getMinutes(),
        ss: String(d.getSeconds()).padStart(2, '0'),
        s: d.getSeconds(),
        tt: H < 12 ? 'am' : 'pm',
        t: H < 12 ? 'a' : 'p'
    };

    return mask.replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t/g, t => map[t]);
};
Number.prototype.round = function (dec) { return Number(Math.round(this + 'e' + dec) + 'e-' + dec); };
Number.prototype.fmt = function (format, empty) {
    if (isNaN(this)) return empty || '';
    if (typeof format === 'undefined') return this.toString();
    let isNegative = this < 0;
    let tok = ['#', '0'];
    let pfx = '', sfx = '', fmt = format.replace(/[^#\.0\,]/g, '');
    let dec = fmt.lastIndexOf('.') > 0 ? fmt.length - (fmt.lastIndexOf('.') + 1) : 0,
    fw = '', fd = '', vw = '', vd = '', rw = '', rd = '';
    let val = String(Math.abs(this).round(dec));
    let ret = '', commaChar = ',', decChar = '.';
    for (var i = 0; i < format.length; i++) {
        let c = format.charAt(i);
        if (c === '#' || c === '0' || c === '.' || c === ',')
            break;
        pfx += c;
    }
    for (let i = format.length - 1; i >= 0; i--) {
        let c = format.charAt(i);
        if (c === '#' || c === '0' || c === '.' || c === ',')
            break;
        sfx = c + sfx;
    }
    if (dec > 0) {
        let dp = val.lastIndexOf('.');
        if (dp === -1) {
            val += '.'; dp = 0;
        }
        else
            dp = val.length - (dp + 1);
        while (dp < dec) {
            val += '0';
            dp++;
        }
        fw = fmt.substring(0, fmt.lastIndexOf('.'));
        fd = fmt.substring(fmt.lastIndexOf('.') + 1);
        vw = val.substring(0, val.lastIndexOf('.'));
        vd = val.substring(val.lastIndexOf('.') + 1);
        let ds = val.substring(val.lastIndexOf('.'), val.length);
        for (let i = 0; i < fd.length; i++) {
            if (fd.charAt(i) === '#' && vd.charAt(i) !== '0') {
                rd += vd.charAt(i);
                continue;
            } else if (fd.charAt(i) === '#' && vd.charAt(i) === '0') {
                var np = vd.substring(i);
                if (np.match('[1-9]')) {
                    rd += vd.charAt(i);
                    continue;
                }
                else
                    break;
            }
            else if (fd.charAt(i) === '0' || fd.charAt(i) === '#')
                rd += vd.charAt(i);
        }
        if (rd.length > 0) rd = decChar + rd;
    }
    else {
        fw = fmt;
        vw = val;
    }
    var cg = fw.lastIndexOf(',') >= 0 ? fw.length - fw.lastIndexOf(',') - 1 : 0;
    var nw = Math.abs(Math.floor(this.round(dec)));
    if (!(nw === 0 && fw.substr(fw.length - 1) === '#') || fw.substr(fw.length - 1) === '0') {
        var gc = 0;
        for (let i = vw.length - 1; i >= 0; i--) {
            rw = vw.charAt(i) + rw;
            gc++;
            if (gc === cg && i !== 0) {
                rw = commaChar + rw;
                gc = 0;
            }
        }
        if (fw.length > rw.length) {
            var pstart = fw.indexOf('0');
            if (pstart >= 0) {
                var plen = fw.length - pstart;
                var pos = fw.length - rw.length - 1;
                while (rw.length < plen) {
                    let pc = fw.charAt(pos);
                    if (pc === ',') pc = commaChar;
                    rw = pc + rw;
                    pos--;
                }
            }
        }
    }
    if (isNegative) rw = '-' + rw;
    if (rd.length === 0 && rw.length === 0) return '';
    return pfx + rw + rd + sfx;
};
// Port JS de SunCalc::calculate() (src/SunCalc.cpp) -- même algorithme NOAA (jour julien, position
// solaire moyenne + équation du centre, équation du temps, angle horaire à 90.833° pour le lever/
// coucher "civil"), pour permettre un aperçu instantané côté navigateur sans aller-retour serveur.
// Les deux copies doivent rester en phase : toute correction du calcul y est appliquée des deux
// côtés. Retourne {sunriseUtcMinutes, sunsetUtcMinutes} (minutes UTC depuis minuit) ou null en cas
// de nuit/jour polaire ce jour-là (cf. cosH hors [-1, 1] dans la version C++).
function computeSunUtcMinutes(lat, lon, date) {
    const rad = d => d * Math.PI / 180;
    const deg = r => r * 180 / Math.PI;

    let y = date.getFullYear(), m = date.getMonth() + 1;
    const d = date.getDate();
    if (m <= 2) { y -= 1; m += 12; }
    const a = Math.floor(y / 100);
    const b = 2 - a + Math.floor(a / 4);
    const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
    const jc = (jd - 2451545.0) / 36525.0;

    let gml = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360.0;
    if (gml < 0) gml += 360.0;
    const gma = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
    const ecc = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
    const gmaRad = rad(gma);
    const ctr = Math.sin(gmaRad) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
              + Math.sin(2 * gmaRad) * (0.019993 - 0.000101 * jc)
              + Math.sin(3 * gmaRad) * 0.000289;
    const al = gml + ctr - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * jc));
    const oe = 23.0 + (26.0 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60.0) / 60.0;
    const oc = oe + 0.00256 * Math.cos(rad(125.04 - 1934.136 * jc));
    const decl = deg(Math.asin(Math.sin(rad(oc)) * Math.sin(rad(al))));

    const vy = Math.pow(Math.tan(rad(oc / 2.0)), 2);
    const eot = 4.0 * deg(
        vy * Math.sin(2 * rad(gml))
        - 2 * ecc * Math.sin(gmaRad)
        + 4 * ecc * vy * Math.sin(gmaRad) * Math.cos(2 * rad(gml))
        - 0.5 * vy * vy * Math.sin(4 * rad(gml))
        - 1.25 * ecc * ecc * Math.sin(2 * gmaRad));

    const cosH = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(decl)))
               - Math.tan(rad(lat)) * Math.tan(rad(decl));
    if (cosH > 1.0 || cosH < -1.0) return null;
    const ha = deg(Math.acos(cosH));

    const solarNoon = 720.0 - 4.0 * lon - eot;
    return { sunriseUtcMinutes: solarNoon - 4.0 * ha, sunsetUtcMinutes: solarNoon + 4.0 * ha };
}
/**
 * Convertit des minutes UTC (depuis minuit) en heure locale, dans le format 12h/24h actif sur
 * l'appareil (résolu par le navigateur, pas de réglage dédié côté appli).
 * @param {number} utcMinutes
 * @returns {string} Exemple: "6:42 AM" ou "06:42" selon la locale du navigateur.
 */
function formatSunTime(utcMinutes) {
    if (utcMinutes === undefined || utcMinutes === null || isNaN(utcMinutes)) return '--:--';

    const now = new Date();
    // Arrondi à la seconde la plus proche PUIS troncature à la minute (comme SunCalc::toEpoch() +
    // localtime_r() côté C++, cf. Schedule.cpp) -- PAS un simple arrondi à la minute la plus proche
    // : ce dernier affichait une minute en avance sur ce que déclenche réellement le firmware dès
    // que la seconde exacte du lever/coucher dépassait :30 (observé en test réel : "06:55" affiché
    // ici, "lever=06:54" dans le log firmware, déclenchement à l'heure du firmware -- donc 1 min
    // "en retard" par rapport à ce que l'utilisateur attendait).
    const totalSeconds = Math.round(utcMinutes * 60);
    const flooredMinutes = Math.floor(totalSeconds / 60);
    const utcDate = new Date(Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        flooredMinutes
    ));

    return utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
// Comme formatSunTime() mais renvoie les minutes locales depuis minuit (0-1439) au lieu d'une
// chaîne déjà formatée -- nécessaire pour pouvoir additionner un sunOffset avant affichage (cf.
// renderScheduleBadges).
function sunUtcMinutesToLocal(utcMinutes) {
    if (utcMinutes === undefined || utcMinutes === null || isNaN(utcMinutes)) return null;
    const now = new Date();
    const totalSeconds = Math.round(utcMinutes * 60);
    const flooredMinutes = Math.floor(totalSeconds / 60);
    const utcDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, flooredMinutes));
    return utcDate.getHours() * 60 + utcDate.getMinutes();
}
// Formate des minutes locales depuis minuit (déjà calculées/décalées) en {main, ampm}, dans le
// format 12h/24h actif sur l'appareil -- ampm reste vide en 24h (aucun token "dayPeriod" produit).
function formatMinutesOfDay(totalMinutes) {
    if (totalMinutes === null || totalMinutes === undefined || isNaN(totalMinutes)) return { main: '--:--', ampm: '' };
    totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const d = new Date();
    d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
    const parts = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).formatToParts(d);
    let hour = '', minute = '', ampm = '';
    parts.forEach(p => {
        if (p.type === 'hour') hour = p.value;
        else if (p.type === 'minute') minute = p.value;
        else if (p.type === 'dayPeriod') ampm = p.value;
    });
    return { main: `${hour}:${minute}`, ampm };
}
// Mêmes bits que le SwitchBig jours de ScheduleOverlay (dayBtn) : bit0=Dimanche ... bit6=Samedi,
// aligné sur tm_wday -- affiché Lundi -> Dimanche. Partagé entre renderScheduleBadges et
// setScheduleList (cf. Somfy.prototype), pour les cartes de planning des deux pages.
const SCHEDULE_DAY_DEFS = [
    { bit: 2, key: 'DAY_MON' }, { bit: 4, key: 'DAY_TUE' }, { bit: 8, key: 'DAY_WED' },
    { bit: 16, key: 'DAY_THU' }, { bit: 32, key: 'DAY_FRI' }, { bit: 64, key: 'DAY_SAT' }, { bit: 1, key: 'DAY_SUN' }
];
function makeBool(val) {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'undefined') return false;
    if (typeof val === 'number') return val >= 1;
    if (typeof val === 'string') {
        if (val === '') return false;
        switch (val.toLowerCase().trim()) {
            case 'on':
            case 'true':
            case 'yes':
            case 'y':
                return true;
            case 'off':
            case 'false':
            case 'no':
            case 'n':
                return false;
        }
        if (!isNaN(parseInt(val, 10))) return parseInt(val, 10) >= 1;
    }
    return false;
}
var httpStatusText = {
    '200': 'OK',
    '201': 'Created',
    '202': 'Accepted',
    '203': 'Non-Authoritative Information',
    '204': 'No Content',
    '205': 'Reset Content',
    '206': 'Partial Content',
    '300': 'Multiple Choices',
    '301': 'Moved Permanently',
    '302': 'Found',
    '303': 'See Other',
    '304': 'Not Modified',
    '305': 'Use Proxy',
    '306': 'Unused',
    '307': 'Temporary Redirect',
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '402': 'Payment Required',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '406': 'Not Acceptable',
    '407': 'Proxy Authentication Required',
    '408': 'Request Timeout',
    '409': 'Conflict',
    '410': 'Gone',
    '411': 'Length Required',
    '412': 'Precondition Required',
    '413': 'Request Entry Too Large',
    '414': 'Request-URI Too Long',
    '415': 'Unsupported Media Type',
    '416': 'Requested Range Not Satisfiable',
    '417': 'Expectation Failed',
    '418': 'I\'m a teapot',
    '429': 'Too Many Requests',
    '500': 'Internal Server Error',
    '501': 'Not Implemented',
    '502': 'Bad Gateway',
    '503': 'Service Unavailable',
    '504': 'Gateway Timeout',
    '505': 'HTTP Version Not Supported'
};
// Équivalent fetch() des helpers XHR ci-dessous : il pose l'en-tête apikey, que fetch() n'ajoute
// évidemment pas tout seul. Sans lui, dès que la sécurité est activée, tous les appels écrits en
// fetch() brut (langues, onboarding...) recevaient un 401 AU CORPS VIDE (cf. Web::isAuthenticated,
// qui répond `server.send(401, ...)` sans contenu) -- et r.json() échouait alors sur un
// "unexpected end of data" au lieu de remonter une vraie erreur exploitable.
// Renvoie le JSON de la réponse, ou rejette avec un objet {htmlError, service, desc} du même
// format que celui produit par getJSON()/putJSONSync(), directement utilisable par ui.serviceError().
// Un 401 sur n'importe quel appel signifie que la clé de session n'est plus acceptée : on le
// signale une seule fois à la couche sécurité, qui se charge de redemander l'authentification.
function noteAuthFailure(err) {
    if (!err || err.htmlError !== 401) return;
    if (typeof security !== 'undefined' && security.handleUnauthorized) security.handleUnauthorized();
}
function deviceFetch(url, opts) {
    const options = Object.assign({}, opts);
    options.headers = Object.assign({}, options.headers, { apikey: (typeof security !== 'undefined' ? security.apiKey : '') || '' });
    const service = `${(options.method || 'GET').toUpperCase()} ${url}`;
    return fetch(baseUrl + url, options).then(resp => {
        return resp.text().then(txt => {
            if (!resp.ok) {
                let err = {};
                // Le corps peut être vide (401) ou non-JSON : on ne le parse qu'au mieux.
                try { err = txt ? JSON.parse(txt) : {}; } catch (e) { /* corps non JSON */ }
                err.htmlError = resp.status;
                err.service = service;
                if (typeof err.desc === 'undefined') err.desc = resp.statusText || httpStatusText[resp.status] || httpStatusText['500'];
                noteAuthFailure(err);
                throw err;
            }
            if (!txt) return {};
            try { return JSON.parse(txt); }
            catch (e) { throw { htmlError: resp.status, service: service, desc: httpStatusText['500'] }; }
        });
    });
}
function getJSON(url, cb) {
    let xhr = new XMLHttpRequest();
    logger.debug('GET', url);
    xhr.open('GET', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
    xhr.setRequestHeader('apikey', security.apiKey);
    xhr.responseType = 'json';
    xhr.onload = () => {
        let status = xhr.status;
        if (status !== 200) {
            let err = xhr.response || {};
            err.htmlError = status;
            err.service = `GET ${url}`;
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            noteAuthFailure(err);
            cb(err, null);
        }
        else {
            cb(null, xhr.response);
        }
    };
    xhr.onerror = (evt) => {
        let err = {
            htmlError: xhr.status || 500,
            service: `GET ${url}`
        };
        if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
        cb(err, null);
    };
    xhr.send();
}
function getJSONSync(url, cb) {
    let overlay = ui.waitMessage(get('divContainer'), 'MSG_WAIT_LOADING');
    let xhr = new XMLHttpRequest();
    logger.debug('GET', url);
    xhr.responseType = 'json';
    xhr.onload = () => {
        let status = xhr.status;
        if (status !== 200) {
            let err = xhr.response || {};
            err.htmlError = status;
            err.service = `GET ${url}`;
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            noteAuthFailure(err);
            cb(err, null);
        }
        else {
            cb(null, xhr.response);
        }
        if (typeof overlay !== 'undefined') overlay.remove();
    };

        xhr.onerror = (evt) => {
            let err = {
                htmlError: xhr.status || 500,
                service: `GET ${url}`
            };
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            noteAuthFailure(err);
            cb(err, null);
            if (typeof overlay !== 'undefined') overlay.remove();
        };
            xhr.onabort = (evt) => {
                if (typeof overlay !== 'undefined') overlay.remove();
            };
                xhr.open('GET', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
                xhr.setRequestHeader('apikey', security.apiKey);
                xhr.send();
}

function postJSONSync(url, data, cb) {
    let overlay = ui.waitMessage(get('divContainer'), 'MSG_WAIT_SAVING');
    try {
        let xhr = new XMLHttpRequest();
        logger.debug('POST', url, data);
        let fd = new FormData();
        for (let name in data) {
            fd.append(name, data[name]);
        }
        xhr.open('POST', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
        xhr.responseType = 'json';
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('apikey', security.apiKey);
        xhr.onload = () => {
            let status = xhr.status;
            if (status !== 200) {
                let err = xhr.response || {};
                err.htmlError = status;
                err.service = `POST ${url}`;
                err.data = data;
                if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
                noteAuthFailure(err);
                cb(err, null);
            }
            else {
                cb(null, xhr.response);
            }
            overlay.remove();
        };
        xhr.onerror = (evt) => {
            logger.error('POST failed:', url, xhr.status, xhr.statusText);
            let err = {
                htmlError: xhr.status || 500,
                service: `POST ${url}`
            };
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            noteAuthFailure(err);
            cb(err, null);
            overlay.remove();
        };
        xhr.send(fd);
    } catch (err) { ui.serviceError(get('divContainer'), err); }
}
function putJSON(url, data, cb) {
    let xhr = new XMLHttpRequest();
    logger.debug('PUT', url, data);
    xhr.open('PUT', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
    xhr.responseType = 'json';
    xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('apikey', security.apiKey);
    xhr.onload = () => {
        let status = xhr.status;
        if (status !== 200) {
            let err = xhr.response || {};
            err.htmlError = status;
            err.service = `PUT ${url}`;
            err.data = data;
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            noteAuthFailure(err);
            cb(err, null);
        }
        else {
            cb(null, xhr.response);
        }
    };
    xhr.onerror = (evt) => {
        logger.error('PUT failed:', url, xhr.status, xhr.statusText);
        let err = {
            htmlError: xhr.status || 500,
            service: `PUT ${url}`
        };
        if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
        cb(err, null);
    };
    xhr.send(JSON.stringify(data));
}
function putJSONSync(url, data, cb) {
    let overlay = ui.waitMessage(get('divContainer'), 'MSG_WAIT_SAVING');
    try {
        let xhr = new XMLHttpRequest();
        logger.debug('PUT', url, data);
        //xhr.open('PUT', url, true);
        xhr.open('PUT', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
        xhr.responseType = 'json';
        xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('apikey', security.apiKey);
        xhr.onload = () => {
            let status = xhr.status;
            if (status !== 200) {
                let err = xhr.response || {};
                err.htmlError = status;
                err.service = `PUT ${url}`;
                err.data = data;
                if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
                noteAuthFailure(err);
                cb(err, null);
            }
            else {
                cb(null, xhr.response);
            }
            overlay.remove();
        };
        xhr.onerror = (evt) => {
            logger.error('PUT failed:', url, xhr.status, xhr.statusText);
            let err = {
                htmlError: xhr.status || 500,
                service: `PUT ${url}`
            };
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            noteAuthFailure(err);
            cb(err, null);
            overlay.remove();
        };
        xhr.send(JSON.stringify(data));
    } catch (err) { ui.serviceError(get('divContainer'), err); }
}
