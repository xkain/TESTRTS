/* ESPSomfy-RTS — assistant de flash web (GitHub Pages, HTTPS), basé sur ESP Web Tools.
 *
 * Trois étapes, dans une seule carte :
 *
 *   step-connect ─> step-hardware ─> step-ready
 *
 * LA CONNEXION D'ABORD. Le port était auparavant demandé au tout dernier moment, au clic sur
 * « Installer » : un visiteur pouvait répondre à trois écrans avant d'apprendre que son navigateur
 * ne sait pas parler série, ou que son câble USB n'a pas de fil de données. Le port est maintenant
 * retenu dès le premier écran et conservé dans `port` jusqu'au flash.
 *
 * Les étapes sont de simples sections affichées/masquées (classe .is-active). Plus de position
 * absolue, plus de translateX, plus de hauteur de scène mesurée en JavaScript : la carte tient sa
 * taille de la CSS, et la liste de matériel défile à l'intérieur si elle dépasse. Les trois
 * fonctions updateStageHeight/updateStepHeaderHeight/updateLayout qui vivaient ici n'ont plus
 * d'objet.
 *
 * FLASH : on pilote directement flash.js, le module bas niveau qu'exporte esp-web-tools
 * (Transport/ESPLoader d'esptool-js, cf. son code source -- exporté publiquement, pas un détail
 * interne détourné). C'est le MÊME moteur que le composant <esp-web-install-button>, qui l'utilise
 * en interne ; on ne réutilise juste pas SA fenêtre de progression (look non personnalisable,
 * toujours en thème clair) -- la nôtre (#flashDialog dans installer.html) reprend nos variables
 * CSS existantes, donc suit automatiquement le thème clair/sombre du site, et nos traductions.
 *
 * CONSOLE SÉRIE (#logsOverlay) : elle ne doit rien à esp-web-tools. Web Serial seul suffit --
 * port.open({baudRate: 115200}), une boucle de lecture, et setSignals() pour le bouton de
 * réinitialisation. Le port étant unique, la console et le flash ne peuvent pas tourner ensemble :
 * startFlash() ferme la console d'abord (cf. stopLogs()).
 *
 * VERSION DU FIRMWARE : le site ne porte QU'UNE version, celle de la dernière release publiée,
 * recopiée à chaque déploiement par .github/workflows/pages.yml. Le numéro n'est donc pas écrit
 * ici, il est lu dans le manifeste (champ "version"). En servir plusieurs demanderait de toutes
 * les recopier -- environ 27 Mo par version pour les sept variantes, l'image d'un ESP32 faisant
 * 3,94 Mo -- et les binaires ne peuvent pas être tirés des releases depuis le navigateur :
 * release-assets.githubusercontent.com n'envoie aucun en-tête CORS. C'est donc un changement de
 * pages.yml, pas de cette page ; buildVersionSelect() est écrit pour l'accueillir sans rien
 * bouger d'autre.
 *
 * Volontairement AUCUNE sélection de langue de l'appareil ici (supprimée à la demande : elle
 * faisait doublon avec l'assistant de premier démarrage déjà présent sur l'appareil, cf.
 * settings.pendingLang / GitUpdater::checkPendingLang() dans src/GitOTA.cpp).
 *
 * L'effacement complet avant écriture est demandé explicitement (dernier argument de flash(),
 * cf. startFlash()) plutôt que piloté par le champ "new_install_prompt_erase" du manifeste (celui-
 * ci n'est lu que par la boîte de dialogue PAR DÉFAUT qu'on n'utilise plus ici).
 *
 * La page reste elle-même traduisible (FR/EN/DE/ES). Le choix de la langue, le dictionnaire, la
 * bannière, le pied de page et le thème viennent de js/layout.js, commun à toutes les pages du
 * site ; ce fichier ne garde que ce qui lui est propre.
 */
'use strict';

// Bundle local (./vendor/esp-flash.js) plutôt qu'un import direct depuis un CDN (unpkg?module,
// puis esm.sh) : les deux ont chacun échoué différemment sur la même dépendance transitive
// d'esptool-js (atob-lite) en conditions réelles -- l'un dès l'import ("does not provide an
// export named 'default'"), l'autre en plein milieu d'un flash réel ("String contains an
// invalid character" au décodage du stub uploadé sur la puce), alors que la connexion et la
// détection de la puce avaient réussi. Ce bundle est construit par tools/esp-flash-bundle/ (vrai
// `npm install` + esbuild, cf. son package.json) et publié par .github/workflows/pages.yml :
// aucune résolution de dépendance à la volée au chargement de la page.
import { flash } from './vendor/esp-flash.js';

// Catalogue unique : boîtiers vendus préconfigurés puis cartes génériques, dans le même écran.
// `kind` ne sert qu'à les ranger dans deux grilles de présentation différente (photo pour les
// boîtiers, libellé + description pour les cartes).
//
// Les images des boîtiers sont hébergées localement (docs/img/*.webp, ~25 Ko chacune) plutôt que
// sur github.com/user-attachments/... (~1,9 Mo en PNG plein format) : la latence de chargement
// depuis un domaine tiers était visible et disgracieuse à l'arrivée sur cet écran.
//
// Les `id` des cartes génériques DOIVENT être les valeurs exactes de `matrix.env` dans build.yaml :
// pages.yml nomme chaque manifeste généré d'après `frag['variant']`, lui-même égal à matrix.env --
// un id qui diverge donne un manifeste introuvable (404 silencieux, vécu une fois : garder les
// deux alignés). Ces manifestes proviennent de la DERNIÈRE RELEASE PUBLIÉE, pas du dernier push :
// renommer un environnement de build ici et là-bas laisse le wizard en 404 jusqu'à la release
// suivante.
const HARDWARE = [
    { kind: 'box', id: 'box_wifi', titleKey: 'installer_box_wifi_title', image: 'img/box-wifi.webp', alt: 'ESPSomfy-RTS BOX-Wifi' },
    { kind: 'box', id: 'box_eth', titleKey: 'installer_box_eth_title', image: 'img/box-eth.webp', alt: 'ESPSomfy-RTS BOX-Wifi & Ethernet' },
    { kind: 'diy', id: 'esp32', label: 'ESP32', descKey: 'installer_hw_esp32_desc' },
    { kind: 'diy', id: 'esp32wrover', label: 'ESP32-Wrover', descKey: 'installer_hw_esp32wrover_desc' },
    { kind: 'diy', id: 'esp32c3', label: 'ESP32-C3', descKey: 'installer_hw_esp32c3_desc' },
    { kind: 'diy', id: 'esp32s2', label: 'ESP32-S2', descKey: 'installer_hw_esp32s2_desc' },
    { kind: 'diy', id: 'esp32s3', label: 'ESP32-S3', descKey: 'installer_hw_esp32s3_desc' },
];

const manifestPath = (id) => `manifests/${id}.json`;

let t = {};
let stack = ['step-connect'];
let port = null;
let selected = null;
let selectedManifest = null;

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ Traductions */

// Tout le mécanisme (langue retenue, chargement, traduction des [data-i18n]) vit dans
// js/layout.js. Ne reste ici que la conséquence propre à cette page : garder une copie du
// dictionnaire pour les textes construits en JavaScript.
function onTranslationsChanged() {
    t = SiteLayout.dict;
}

document.addEventListener('i18n:changed', onTranslationsChanged);

// t[key] avec substitution de {token} -> value ; repli sur la clé elle-même si absente (ne
// devrait pas arriver, les 4 langues sont tenues alignées, cf. version_docs.py --check).
function tr(key, tokens) {
    let s = t[key] !== undefined ? t[key] : key;
    if (tokens) {
        for (const [k, v] of Object.entries(tokens)) s = s.replaceAll(`{${k}}`, v);
    }
    return s;
}

/* ------------------------------------------------------------------ Navigation */

function showStep(id) {
    document.querySelectorAll('.installer-step').forEach((el) => {
        el.classList.toggle('is-active', el.id === id);
    });
    // L'étape de connexion est la seule à ne rien avoir à dérouler : elle se passe de la hauteur
    // réservée aux deux autres, qui doivent elles rester identiques entre elles (cf. CSS).
    document.querySelector('.installer-card').classList.toggle('is-connect', id === 'step-connect');
    // .is-invisible (visibility) et non l'attribut hidden : le bouton garde sa place à l'étape 1,
    // sinon tout ce qui suit remonterait d'autant en y arrivant.
    const isRoot = stack.length <= 1;
    $('wizardBack').classList.toggle('is-invisible', isRoot);
    $('wizardBack').tabIndex = isRoot ? -1 : 0;
    // La console série n'a de sens qu'une fois un port retenu -- mais sa place reste réservée dès
    // l'étape 1 (visibilité, pas présence), sinon la carte grandirait en passant à l'étape 2.
    $('installerTools').classList.toggle('is-invisible', !port);
}

function goTo(id) {
    stack.push(id);
    showStep(id);
}

function goBack() {
    if (stack.length <= 1) return;
    stack.pop();
    showStep(stack[stack.length - 1]);
}

/* ------------------------------------------------------------------ Étape 1 : connexion */

function isCompatible() {
    return 'serial' in navigator && window.isSecureContext;
}

async function connect() {
    if (!isCompatible()) return;
    $('noPortHint').hidden = true;
    try {
        port = await navigator.serial.requestPort();
    } catch (err) {
        // NotFoundError couvre DEUX cas que le navigateur ne distingue pas : la fenêtre fermée
        // sans rien choisir, et la fenêtre ouverte sur une liste vide. D'où un message qui répond
        // au second sans contredire le premier.
        $('noPortHint').hidden = false;
        return;
    }
    goTo('step-hardware');
}

/* ------------------------------------------------------------------ Étape 2 : matériel */

function renderHardware() {
    const boxGrid = $('boxGrid');
    const diyGrid = $('diyGrid');
    boxGrid.innerHTML = '';
    diyGrid.innerHTML = '';

    HARDWARE.forEach((item) => {
        const card = document.createElement('button');
        card.type = 'button';
        if (item.kind === 'box') {
            card.className = 'box-card';
            card.innerHTML = `
        <span class="box-card-label" data-i18n="${item.titleKey}"></span>
        <img class="box-card-img" src="${item.image}" alt="${item.alt}" loading="lazy">
        `;
            boxGrid.appendChild(card);
        } else {
            card.className = 'hw-card';
            card.innerHTML = `
            <span class="hw-card-label">${item.label}</span>
            <span class="hw-card-desc" data-i18n="${item.descKey}"></span>
        `;
            diyGrid.appendChild(card);
        }
        card.addEventListener('click', () => selectHardware(item));
    });
}

async function selectHardware(item) {
    selected = item;
    selectedManifest = manifestPath(item.id);

    const name = $('readyBoardName');
    if (item.kind === 'box') {
        name.setAttribute('data-i18n', item.titleKey);
        name.textContent = '';
    } else {
        name.removeAttribute('data-i18n');
        name.textContent = item.label;
    }

    // Note bouton-poussoir : uniquement pertinente pour le boîtier Wi-fi & Ethernet (le Wi-fi
    // seul n'a pas ce mode d'entrée en flash manuel).
    $('boxEthBootNotice').hidden = item.id !== 'box_eth';

    // Le data-i18n qu'on vient de poser sur le nom n'a encore aucun contenu.
    SiteLayout.apply();
    goTo('step-ready');
    await buildVersionSelect();
}

/* ------------------------------------------------------------------ Étape 3 : version et flash */

// Une seule version disponible aujourd'hui (cf. commentaire d'en-tête) : son numéro est lu dans
// le manifeste plutôt qu'écrit en dur, pour qu'il suive les déploiements sans intervention. Le
// jour où pages.yml en publiera plusieurs, c'est cette fonction qui recevra la liste -- le reste
// de la page n'a pas à bouger, startFlash() lisant le manifeste choisi ici.
async function buildVersionSelect() {
    const sel = $('fwVersion');
    sel.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = selectedManifest;
    opt.textContent = tr('installer_version_loading');
    sel.appendChild(opt);
    sel.disabled = true;

    try {
        const res = await fetch(selectedManifest);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const manifest = await res.json();
        opt.textContent = manifest.version || '?';
    } catch (err) {
        opt.textContent = tr('installer_version_unavailable');
    }
}

/* ------------------------------------------------------------------ Fenêtre de flash maison */

// Même spinner que ui.waitMessage() côté firmware (cf. data-dev/index.js / overlays.css,
// ".lds-roller") -- 8 points animés en cercle -- et mêmes icônes svg-warning/svg-error/svg-success
// que ui.serviceError() (symboles définis en tête de installer.html), plutôt que des emoji.
const LDS_ROLLER = '<div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>';
const flashIcons = {
    busy: LDS_ROLLER,
    progress: LDS_ROLLER,
    success: '<svg class="flash-dialog-svg-icon"><use href="#svg-success"/></svg>',
    error: '<svg class="flash-dialog-svg-icon"><use href="#svg-error"/></svg>',
};

// 'busy' et 'progress' partagent la même icône (LDS_ROLLER) : pendant l'écriture, onFlashEvent
// appelle setFlashDialog() à chaque pourcentage reçu (potentiellement plusieurs fois par
// seconde). Sans ce garde-fou, innerHTML est réécrit à chaque appel -> le roller repart de zéro
// avant même d'avoir complété un tour, l'animation paraît saccadée. On ne touche à l'icône que
// lorsque sa catégorie change réellement.
const ICON_CATEGORY = { busy: 'spinner', progress: 'spinner', success: 'success', error: 'error' };
let lastIconCategory = null;

let flashLogLines = [];

function logFlashLine(text) {
    const time = new Date().toLocaleTimeString();
    flashLogLines.push(`[${time}] ${text}`);
    const content = $('flashLogContent');
    content.textContent = flashLogLines.join('\n');
    content.scrollTop = content.scrollHeight;
}

function setFlashDialog(kind, title, message, pct) {
    const category = ICON_CATEGORY[kind] || 'spinner';
    if (category !== lastIconCategory) {
        $('flashDialogIcon').innerHTML = flashIcons[kind] || LDS_ROLLER;
        lastIconCategory = category;
    }
    $('flashDialogTitle').textContent = title;
    $('flashDialogMessage').textContent = message || '';
    logFlashLine(message ? `${title} -- ${message}` : title);

    const progress = $('flashProgress');
    if (kind === 'progress' && typeof pct === 'number') {
        progress.hidden = false;
        progress.classList.remove('indeterminate');
        $('flashProgressBar').style.width = `${pct}%`;
    } else if (kind === 'busy') {
        progress.hidden = false;
        progress.classList.add('indeterminate');
    } else {
        progress.hidden = true;
    }

    const closable = kind === 'success' || kind === 'error';
    $('flashDialogActions').hidden = !closable;
    $('flashDialog').classList.toggle('is-error', kind === 'error');
}

function openFlashDialog() {
    flashLogLines = [];
    $('flashLogContent').textContent = '';
    $('flashLog').hidden = true;
    $('flashLogToggle').textContent = tr('installer_flash_show_logs');
    $('flashOverlay').hidden = false;
    setFlashDialog('busy', tr('installer_flash_state_initializing'), '');
}

function closeFlashDialog() {
    $('flashOverlay').hidden = true;
}

function toggleFlashLog() {
    const log = $('flashLog');
    log.hidden = !log.hidden;
    $('flashLogToggle').textContent = tr(log.hidden ? 'installer_flash_show_logs' : 'installer_flash_hide_logs');
    if (!log.hidden) $('flashLogContent').scrollTop = $('flashLogContent').scrollHeight;
}

function download(name, text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

// Traduit chaque évènement de flash.js (cf. son code source, réexporté par esp-web-tools) en
// mise à jour de notre fenêtre. Toujours défensif sur les champs (`details` diffère selon
// `state`) : un champ absent/inattendu retombe sur le message brut de la bibliothèque plutôt que
// de planter l'affichage.
function onFlashEvent(ev) {
    const chip = ev.chipFamily || '';
    switch (ev.state) {
        case 'initializing':
            setFlashDialog('busy',
                ev.details && ev.details.done
                    ? tr('installer_flash_state_connected', { chip })
                    : tr('installer_flash_state_initializing'),
                '');
            break;
        case 'preparing':
            setFlashDialog('busy', tr('installer_flash_state_preparing'), '');
            break;
        case 'erasing':
            setFlashDialog('busy', tr('installer_flash_state_erasing'), '');
            break;
        case 'writing': {
            const pct = ev.details && typeof ev.details.percentage === 'number' ? ev.details.percentage : 0;
            setFlashDialog('progress', tr('installer_flash_state_writing', { pct }), '', pct);
            break;
        }
        case 'finished':
            setFlashDialog('success', tr('installer_flash_state_finished_title'), tr('installer_flash_state_finished_body'));
            break;
        case 'error': {
            const code = ev.details && ev.details.error;
            let msg;
            if (code === 'not_supported') msg = tr('installer_flash_error_not_supported', { chip });
            else if (code === 'failed_initialize') msg = tr('installer_flash_error_init');
            else msg = tr('installer_flash_error_generic', { message: ev.message || code || '?' });
            setFlashDialog('error', tr('installer_flash_error_title'), msg);
            break;
        }
        default:
            setFlashDialog('busy', ev.message || '', '');
    }
}

async function startFlash() {
    const manifestPath = $('fwVersion').value || selectedManifest;
    if (!isCompatible() || !port || !manifestPath) return;

    // La console série tient le port ouvert : flash.js ne pourrait pas l'ouvrir.
    await stopLogs();
    closeLogs();

    // Récupéré avant de toucher au port : inutile d'aller plus loin si le manifeste n'est même
    // pas chargeable.
    let manifest;
    try {
        const res = await fetch(manifestPath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        manifest = await res.json();
    } catch (err) {
        openFlashDialog();
        setFlashDialog('error', tr('installer_flash_error_title'), tr('installer_flash_error_manifest'));
        return;
    }

    // PAS de port.open() ici : flash.js l'ouvre lui-même en interne (esploader.main() ->
    // detectChip() -> connect()). Vérifié en conditions réelles : un port.open() explicite avant
    // flash() fait échouer cette ouverture interne avec "DOMException: Port is already open"
    // (webserial.js), pas la connexion au ROM bootloader elle-même.
    // Filet de sécurité : si le port est resté ouvert (console série mal refermée, tentative
    // précédente interrompue par une erreur), le refermer avant de relancer flash() dessus.
    if (port.readable || port.writable) {
        try { await port.close(); } catch (err) { /* ignoré : au pire flash() échouera proprement */ }
    }

    openFlashDialog();
    // eraseFirst=true : effacement complet systématique (cf. commentaire d'en-tête, remplace le
    // "new_install_prompt_erase" du manifeste que seule la boîte de dialogue par défaut lisait).
    await flash(onFlashEvent, port, manifestPath, manifest, true);
}

/* ------------------------------------------------------------------ Console série */

// Aucune dépendance à esp-web-tools ici : Web Serial suffit. `reading` est la promesse de la
// boucle de lecture -- stopLogs() l'attend pour être sûr que le port est bien libéré avant qu'un
// flash ne le réclame.
let logsReader = null;
let logsPipe = null;
let logsLines = [];
const LOGS_BAUD = 115200;

function setLogsText(text) {
    $('logsContent').textContent = text;
}

function appendLogs(chunk) {
    if (logsLines.length === 0) setLogsText('');
    logsLines.push(chunk);
    const el = $('logsContent');
    // Collé en bas TANT QUE l'utilisateur y est déjà : s'il a remonté pour lire, on ne lui
    // arrache pas sa position à chaque ligne reçue.
    const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    el.textContent = logsLines.join('');
    if (stick) el.scrollTop = el.scrollHeight;
}

async function openLogs() {
    if (!port) return;
    logsLines = [];
    setLogsText(tr('installer_logs_waiting'));
    $('logsOverlay').hidden = false;

    if (!port.readable) {
        try {
            await port.open({ baudRate: LOGS_BAUD });
        } catch (err) {
            setLogsText(tr('installer_logs_open_error', { message: err.message || String(err) }));
            return;
        }
    }
    readLogs();
}

// Boucle de lecture. TextDecoderStream plutôt qu'un TextDecoder manuel : il recolle les
// caractères multi-octets coupés entre deux paquets USB, ce qu'une conversion paquet par paquet
// casserait (accents tronqués en plein milieu d'une ligne).
async function readLogs() {
    const decoder = new TextDecoderStream();
    // La promesse est retenue : elle ne se règle qu'une fois le tuyau défait, et stopLogs()
    // doit l'attendre avant de fermer le port.
    logsPipe = port.readable.pipeTo(decoder.writable).catch(() => {});
    logsReader = decoder.readable.getReader();
    $('logsDot').classList.add('is-live');
    try {
        for (;;) {
            const { value, done } = await logsReader.read();
            if (done) break;
            if (value) appendLogs(value);
        }
    } catch (err) {
        appendLogs(`\n[${tr('installer_logs_stopped')}] ${err.message || String(err)}\n`);
    } finally {
        $('logsDot').classList.remove('is-live');
    }
}

async function stopLogs() {
    if (logsReader) {
        try { await logsReader.cancel(); } catch (err) { /* déjà fermé */ }
        try { logsReader.releaseLock(); } catch (err) { /* idem */ }
        logsReader = null;
    }
    if (logsPipe) {
        try { await logsPipe; } catch (err) { /* le tuyau signale l'annulation : attendu */ }
        logsPipe = null;
    }
    if (port && (port.readable || port.writable)) {
        try { await port.close(); } catch (err) { /* au pire le prochain open() échouera */ }
    }
    $('logsDot').classList.remove('is-live');
}

function closeLogs() {
    $('logsOverlay').hidden = true;
}

// Réinitialisation matérielle, exactement comme esptool : sur le montage d'auto-reset des cartes
// ESP32, RTS pilote EN (la broche de reset) et DTR pilote IO0. RTS affirmé met EN à la masse,
// donc l'appareil redémarre ; DTR laissé au repos garde IO0 haut, donc un démarrage normal et non
// une entrée en bootloader.
async function resetDevice() {
    if (!port || !port.readable) return;
    try {
        await port.setSignals({ dataTerminalReady: false, requestToSend: true });
        await new Promise((r) => setTimeout(r, 120));
        await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch (err) {
        appendLogs(`\n[${tr('installer_logs_reset_error')}] ${err.message || String(err)}\n`);
    }
}

function clearLogs() {
    logsLines = [];
    setLogsText('');
}

/* ------------------------------------------------------------------ Init */

function checkCompat() {
    if (!isCompatible()) {
        $('compatWarning').hidden = false;
        $('btnConnect').disabled = true;
    }
}

async function init() {
    checkCompat();
    renderHardware();

    $('btnConnect').addEventListener('click', connect);
    $('wizardBack').addEventListener('click', goBack);
    $('installBtn').addEventListener('click', startFlash);
    $('flashDialogClose').addEventListener('click', closeFlashDialog);
    $('flashLogToggle').addEventListener('click', toggleFlashLog);
    $('flashLogDownload').addEventListener('click', () => download('espsomfy-rts-flash-log.txt', flashLogLines.join('\n')));

    $('logsBtn').addEventListener('click', openLogs);
    $('logsClose').addEventListener('click', async () => { await stopLogs(); closeLogs(); });
    $('logsStop').addEventListener('click', stopLogs);
    $('logsClear').addEventListener('click', clearLogs);
    $('logsReset').addEventListener('click', resetDevice);
    $('logsDownload').addEventListener('click', () => download('espsomfy-rts-serial-log.txt', logsLines.join('')));

    // Le port reste ouvert tant que l'onglet vit : le refermer au départ évite de laisser le
    // périphérique verrouillé pour la prochaine application qui voudra l'ouvrir.
    window.addEventListener('beforeunload', () => { if (port && port.readable) port.close().catch(() => {}); });

    // renderHardware() vient d'insérer des data-i18n. Selon l'ordre dans lequel les abonnés à
    // DOMContentLoaded sont appelés, la première traduction de layout.js peut être passée AVANT
    // cette insertion (c'est le cas dès que le dictionnaire est déjà en cache) et laisser les
    // cartes vides : on la rejoue donc explicitement, une fois tout le balisage en place.
    await SiteLayout.ready;
    SiteLayout.apply();
    showStep('step-connect');
}

document.addEventListener('DOMContentLoaded', init);
