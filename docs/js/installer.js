/* ESPSomfy-RTS — assistant de flash web (GitHub Pages, HTTPS), basé sur ESP Web Tools.
 *
 * Questionnaire guidé à embranchement conditionnel, avec navigation avant/arrière et transitions
 * de type "diapositives" :
 *
 *   s-root ─ Option A (boîtier officiel) ─> s-box-pick ─> s-box-install
 *          └ Option B (ESP32 DIY)        ─> s-diy-pick ─> s-diy-install
 *
 * Chaque écran est un <section class="wizard-screen"> du DOM, présent en permanence, positionné
 * en absolu dans .wizard-stage (cf. showScreen()) : l'écran entrant ET l'écran sortant sont animés
 * simultanément (vrai glissement croisé, pas juste un fondu à l'entrée), et la hauteur de la scène
 * est fixée à la plus grande hauteur mesurée parmi tous les écrans (cf. updateStageHeight()) pour
 * que passer d'une étape à l'autre ne fasse pas sauter le reste de la page.
 *
 * FLASH : on pilote directement flash.js, le module bas niveau qu'exporte esp-web-tools
 * (Transport/ESPLoader d'esptool-js, cf. son code source -- exporté publiquement, pas un détail
 * interne détourné). C'est le MÊME moteur que le composant <esp-web-install-button>, qui l'utilise
 * en interne ; on ne réutilise juste pas SA fenêtre de progression (look non personnalisable,
 * toujours en thème clair) -- la nôtre (#flashDialog dans installer.html) reprend nos variables
 * CSS existantes, donc suit automatiquement le thème clair/sombre du site, et nos traductions.
 * Un panneau de journaux (repliable) restitue chaque évènement brut de flash.js -- équivalent du
 * bouton "Logs" de la boîte de dialogue par défaut, qu'on n'utilise plus.
 *
 * Volontairement AUCUNE sélection de langue de l'appareil ici (supprimée à la demande : elle
 * faisait doublon avec l'assistant de premier démarrage déjà présent sur l'appareil, cf.
 * settings.pendingLang / GitUpdater::checkPendingLang() dans src/GitOTA.cpp -- c'est lui qui gère
 * réellement le téléchargement de la traduction, une fois l'appareil en ligne). Ce que dit encore
 * cette page à ce sujet reste donc un simple message informatif dans les écrans d'installation.
 *
 * L'effacement complet avant écriture est demandé explicitement (dernier argument de flash(),
 * cf. startFlash()) plutôt que piloté par le champ "new_install_prompt_erase" du manifeste (celui-
 * ci n'est lu que par la boîte de dialogue PAR DÉFAUT qu'on n'utilise plus ici).
 *
 * La page reste elle-même traduisible (FR/EN/DE/ES, cf. js/geo.js pour le même patron) --
 * indépendant de la langue de l'appareil ci-dessus : c'est juste l'interface DE CETTE PAGE.
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

const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es'];
const DEFAULT_LANG = 'en';

// Catalogue des boîtiers officiels (étape 2A), avec leurs photos.
// Images hébergées localement (docs/img/*.webp, ~25 Ko chacune) plutôt que sur
// github.com/user-attachments/... (~1,9 Mo en PNG plein format) : la latence de chargement
// depuis un domaine tiers était visible et disgracieuse à l'arrivée sur cet écran.
const BOXES = [
    {
        id: 'box_wifi',
        manifest: 'manifests/box_wifi.json',
        titleKey: 'installer_box_wifi_title',
        image: 'img/box-wifi.webp',
        alt: 'ESPSomfy-RTS BOX-Wifi',
    },
    {
        id: 'box_eth',
        manifest: 'manifests/box_eth.json',
        titleKey: 'installer_box_eth_title',
        image: 'img/box-eth.webp',
        alt: 'ESPSomfy-RTS BOX-Wifi & Ethernet',
    },
];

// Catalogue matériel de l'étape 2B. Les `id` DOIVENT être les valeurs exactes de `matrix.env`
// dans build.yaml : pages.yml nomme chaque manifeste généré d'après `frag['variant']`, lui-même
// égal à matrix.env (cf. step "Generate ESP Web Tools manifest fragment") -- un id qui diverge
// donne un manifeste introuvable (404 silencieux côté ESP Web Tools, vécu une fois : garder les
// deux alignés). Ces manifestes proviennent de la DERNIÈRE RELEASE PUBLIÉE, pas du dernier push
// (cf. pages.yml, step "Locate latest release and its build run") : renommer un environnement de
// build ici et là-bas laisse donc le wizard en 404 jusqu'à la publication de la release suivante.
const DIY_BOARDS = [
    { id: 'esp32', manifest: 'manifests/esp32.json', label: 'ESP32', descKey: 'installer_hw_esp32_desc' },
    { id: 'esp32wrover', manifest: 'manifests/esp32wrover.json', label: 'ESP32-Wrover', descKey: 'installer_hw_esp32wrover_desc' },
    { id: 'esp32c3', manifest: 'manifests/esp32c3.json', label: 'ESP32-C3', descKey: 'installer_hw_esp32c3_desc' },
    { id: 'esp32s2', manifest: 'manifests/esp32s2.json', label: 'ESP32-S2', descKey: 'installer_hw_esp32s2_desc' },
    { id: 'esp32s3', manifest: 'manifests/esp32s3.json', label: 'ESP32-S3', descKey: 'installer_hw_esp32s3_desc' },
];

let t = {};
let screenStack = ['s-root'];
let selectedBoxManifest = null;
let selectedDiyManifest = null;

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ Traductions (cf. js/geo.js) */

function resolveLang() {
    const asked = new URLSearchParams(window.location.search).get('lang');
    const candidates = [asked, (navigator.language || '')].map(
        (v) => (v || '').toLowerCase().slice(0, 2)
    );
    return candidates.find((c) => SUPPORTED_LANGS.includes(c)) || DEFAULT_LANG;
}

async function loadLanguage(lang) {
    const fetchLang = async (code) => {
        const res = await fetch(`lang/${code}.json`);
        if (!res.ok) throw new Error(`lang/${code}.json: HTTP ${res.status}`);
        return res.json();
    };
    try {
        t = await fetchLang(lang);
    } catch (err) {
        console.warn('Langue indisponible, repli sur', DEFAULT_LANG, err);
        if (lang !== DEFAULT_LANG) {
            try {
                t = await fetchLang(DEFAULT_LANG);
            } catch (e2) {
                console.error('Aucune traduction chargeable, les libellés du HTML sont conservés', e2);
                return;
            }
        } else {
            return;
        }
    }
    applyTranslations();
    // Le contenu texte vient de changer (parfois avec des longueurs très différentes d'une
    // langue à l'autre) : les hauteurs figées (en-têtes puis scène) doivent être recalculées.
    updateLayout();
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (t[key] !== undefined) el.innerHTML = t[key];
    });
}

// t[key] avec substitution de {token} -> value ; repli sur la clé elle-même si absente (ne
// devrait pas arriver, les 4 langues sont tenues alignées, cf. version_docs.py --check).
function tr(key, tokens) {
    let s = t[key] !== undefined ? t[key] : key;
    if (tokens) {
        for (const [k, v] of Object.entries(tokens)) s = s.replaceAll(`{${k}}`, v);
    }
    return s;
}

/* ------------------------------------------------------------------ Navigation du wizard */

// Hauteur de .wizard-stage figée à la plus grande hauteur naturelle parmi tous les écrans : sans
// ça, passer d'un écran court (ex: choix carte) à un écran long (ex: résultat + bouton) fait
// sauter tout le bas de page (pied de page sécurité compris) à chaque transition. Les écrans sont
// mesurables tels quels (position: absolute mais sans "bottom", cf. CSS) même quand ils ne sont
// pas actifs : leur hauteur suit leur contenu, pas celle de .wizard-stage.
function updateStageHeight() {
    const stage = document.querySelector('.wizard-stage');
    if (!stage) return;
    let max = 0;
    document.querySelectorAll('.wizard-screen').forEach((el) => {
        max = Math.max(max, el.scrollHeight);
    });
    if (max > 0) stage.style.minHeight = `${max}px`;
}

// Même principe que updateStageHeight(), mais pour les en-têtes de texte partagés par s-root,
// s-box-pick et s-diy-pick (.step-header) : sans ça, passer de l'étape 1 à l'étape 2 (ou 2bis)
// déplacerait les cartes en dessous d'un texte plus court/plus long de quelques pixels selon
// l'écran. Réinitialise min-height AVANT de mesurer (sinon on mesure une hauteur déjà figée par
// un appel précédent, jamais celle du contenu réel).
function updateStepHeaderHeight() {
    const headers = document.querySelectorAll('.step-header');
    if (!headers.length) return;
    headers.forEach((el) => { el.style.minHeight = ''; });
    let max = 0;
    headers.forEach((el) => { max = Math.max(max, el.scrollHeight); });
    headers.forEach((el) => { el.style.minHeight = `${max}px`; });
}

// updateStepHeaderHeight() D'ABORD : elle peut agrandir le contenu d'un .wizard-screen (si son
// step-header n'était pas déjà le plus grand des 3), donc updateStageHeight() doit mesurer APRÈS
// pour rester exacte -- l'ordre inverse laisserait la scène parfois trop courte d'un texte.
function updateLayout() {
    updateStepHeaderHeight();
    updateStageHeight();
}

// Écran entrant ET écran sortant animés en même temps (vrai glissement croisé) plutôt qu'un
// simple fondu à l'entrée : le sortant part dans la direction opposée à l'entrant. `direction`
// vaut 'back' (retour arrière : l'entrant vient de la gauche, le sortant part vers la droite) ou
// 'forward' (par défaut : l'inverse).
function showScreen(id, direction) {
    const incoming = $(id);
    const outgoing = document.querySelector('.wizard-screen.active');
    if (incoming === outgoing) return;

    const sign = direction === 'back' ? -1 : 1;

    // Repositionne l'écran entrant hors-champ AVANT de le rendre visible, sans transition (sinon
    // il glisserait depuis le centre au lieu d'arriver depuis le bord) ; force un reflow pour que
    // le navigateur "voie" cette position de départ avant qu'on ne déclenche la vraie transition.
    incoming.classList.remove('active', 'leaving');
    incoming.classList.add('offscreen-instant');
    incoming.style.transform = `translateX(${sign * 32}px)`;
    void incoming.offsetWidth;
    incoming.classList.remove('offscreen-instant');

    // setTimeout plutôt que requestAnimationFrame : équivalent pour ce besoin (juste différer le
    // changement d'état après le reflow forcé ci-dessus, pas une boucle d'animation continue), et
    // ne dépend pas de la page au premier plan -- requestAnimationFrame est suspendu par le
    // navigateur pour un onglet masqué/en arrière-plan (vérifié en conditions réelles), ce que
    // setTimeout n'est pas.
    setTimeout(() => {
        if (outgoing) {
            outgoing.classList.remove('active');
            outgoing.classList.add('leaving');
            outgoing.style.transform = `translateX(${-sign * 32}px)`;
        }
        incoming.classList.add('active');
        incoming.style.transform = 'translateX(0)';
    });

    // Une fois l'écran sortant hors du champ visuel (opacity: 0 via .leaving, cf. CSS), le
    // retirer du flux de la transition pour ne pas laisser un vieux style inline traîner.
    if (outgoing) {
        outgoing.addEventListener('transitionend', () => {
            outgoing.classList.remove('leaving');
            outgoing.style.transform = '';
        }, { once: true });
    }

    // .is-invisible (visibility) et non l'attribut hidden : le bouton doit garder son espace
    // réservé même à l'étape 1 (cf. commentaire CSS de .wizard-back), sinon tout ce qui suit
    // remonterait d'autant en y arrivant, brisant la stabilité verticale entre étapes.
    const backBtn = $('wizardBack');
    const isRoot = screenStack.length <= 1;
    backBtn.classList.toggle('is-invisible', isRoot);
    backBtn.tabIndex = isRoot ? -1 : 0;
}

function goTo(id) {
    screenStack.push(id);
    showScreen(id, 'forward');
}

function goBack() {
    if (screenStack.length <= 1) return;
    screenStack.pop();
    showScreen(screenStack[screenStack.length - 1], 'back');
}

/* ------------------------------------------------------------------ Étape 1 : type d'équipement */

function initRootScreen() {
    $('optOfficial').addEventListener('click', () => goTo('s-box-pick'));
    $('optDiy').addEventListener('click', () => goTo('s-diy-pick'));
}

/* ------------------------------------------------------------------ Étape 2A / 3A : boîtier officiel */

function renderBoxGrid() {
    const grid = $('boxGrid');
    grid.innerHTML = '';
    BOXES.forEach((box) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'box-card';
        card.innerHTML = `
        <span class="box-card-label" data-i18n="${box.titleKey}"></span>
        <img class="box-card-img" src="${box.image}" alt="${box.alt}" loading="lazy">
        `;
        card.addEventListener('click', () => selectBox(box));
        grid.appendChild(card);
    });
}

function selectBox(box) {
    selectedBoxManifest = box.manifest;
    $('s3aBoardName').setAttribute('data-i18n', box.titleKey);
    // Note bouton-poussoir : uniquement pertinente pour le boîtier Wi-fi & Ethernet (le Wi-fi
    // seul n'a pas ce mode d'entrée en flash manuel).
    $('boxEthBootNotice').hidden = box.id !== 'box_eth';
    applyTranslations();
    goTo('s-box-install');
    updateLayout();
}

/* ------------------------------------------------------------------ Étape 2B / 3B : ESP32 DIY */

function renderDiyGrid() {
    const grid = $('diyGrid');
    grid.innerHTML = '';
    DIY_BOARDS.forEach((board) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'hw-card';
        card.innerHTML = `
            <span class="hw-card-label">${board.label}</span>
            <span class="hw-card-desc" data-i18n="${board.descKey}"></span>
        `;
        card.addEventListener('click', () => selectDiyBoard(board));
        grid.appendChild(card);
    });
}

function selectDiyBoard(board) {
    selectedDiyManifest = board.manifest;
    $('s3bBoardName').textContent = board.label;
    goTo('s-diy-install');
}

/* ------------------------------------------------------------------ Compatibilité navigateur */

function isCompatible() {
    return 'serial' in navigator && window.isSecureContext;
}

function checkCompat() {
    if (!isCompatible()) {
        $('compatWarning').hidden = false;
        $('boxInstallBtn').disabled = true;
        $('diyInstallBtn').disabled = true;
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
// avant même d'avoir complété un tour, l'animation paraît saccadée/"pas fluide". On ne touche à
// l'icône que lorsque sa catégorie change réellement.
const ICON_CATEGORY = { busy: 'spinner', progress: 'spinner', success: 'success', error: 'error' };
let lastIconCategory = null;

// Journal brut des évènements de flash.js, restitué dans le panneau repliable #flashLog --
// équivalent du bouton "Logs" de la boîte de dialogue par défaut d'ESP Web Tools qu'on
// n'utilise plus (cf. commentaire d'en-tête).
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

// Équivalent du bouton "DOWNLOAD LOGS" de l'écran de compilation d'ESPHome Web : exporte le
// journal accumulé (flashLogLines) en fichier .txt téléchargeable, pour le joindre à un rapport
// de bug par exemple.
function downloadFlashLog() {
    const blob = new Blob([flashLogLines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'espsomfy-rts-flash-log.txt';
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

async function startFlash(manifestPath) {
    if (!isCompatible() || !manifestPath) return;

    // Récupéré avant de toucher au port : inutile de faire choisir un port à l'utilisateur si le
    // manifeste n'est même pas chargeable.
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

    let port;
    try {
        port = await navigator.serial.requestPort();
    } catch (err) {
        return; // sélecteur de port annulé par l'utilisateur : rien à signaler
    }

    // PAS de port.open() ici : flash.js l'ouvre lui-même en interne (esploader.main() ->
    // detectChip() -> connect()). Vérifié en conditions réelles : un port.open() explicite avant
    // flash() fait échouer cette ouverture interne avec "DOMException: Port is already open"
    // (webserial.js), pas la connexion au ROM bootloader elle-même.
    // Filet de sécurité : si le port est resté ouvert d'une tentative précédente (fermeture
    // interrompue par une erreur), le refermer avant de relancer flash() dessus -- sinon c'est
    // exactement la même DOMException, cette fois causée par NOUS plutôt que par un port.open()
    // en trop.
    if (port.readable || port.writable) {
        try { await port.close(); } catch (err) { /* ignoré : au pire flash() échouera proprement */ }
    }

    openFlashDialog();
    // eraseFirst=true : effacement complet systématique (cf. commentaire d'en-tête, remplace le
    // "new_install_prompt_erase" du manifeste que seule la boîte de dialogue par défaut lisait).
    await flash(onFlashEvent, port, manifestPath, manifest, true);
}

function initFlashDialog() {
    $('boxInstallBtn').addEventListener('click', () => startFlash(selectedBoxManifest));
    $('diyInstallBtn').addEventListener('click', () => startFlash(selectedDiyManifest));
    $('flashDialogClose').addEventListener('click', closeFlashDialog);
    $('flashLogToggle').addEventListener('click', toggleFlashLog);
    $('flashLogDownload').addEventListener('click', downloadFlashLog);
}

/* ------------------------------------------------------------------ Init */

async function init() {
    checkCompat();
    initRootScreen();
    renderBoxGrid();
    renderDiyGrid();
    initFlashDialog();
    $('wizardBack').addEventListener('click', goBack);
    await loadLanguage(resolveLang());

    updateLayout();
    // Les images du choix de boîtier réservent déjà leur espace via aspect-ratio (cf. CSS), donc
    // la mesure ci-dessus est normalement déjà correcte avant même leur chargement complet -- ce
    // recalcul supplémentaire n'est qu'un filet de sécurité si une police tarde à s'appliquer.
    window.addEventListener('load', updateLayout);
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(updateLayout, 150);
    });
}

document.addEventListener('DOMContentLoaded', init);
