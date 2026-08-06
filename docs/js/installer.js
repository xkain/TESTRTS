/* ESPSomfy-RTS — assistant de flash web (GitHub Pages, HTTPS), basé sur ESP Web Tools.
 *
 * Questionnaire guidé à embranchement conditionnel, avec navigation avant/arrière et transitions
 * de type "diapositives" :
 *
 *   s-root ─ Option A (boîtier officiel) ─> s-box-pick ─> s-box-install
 *          └ Option B (ESP32 DIY)        ─> s-diy-pick ─> s-diy-install
 *
 * Chaque écran est un <section class="wizard-screen"> du DOM, présent en permanence ; seul
 * l'écran actif est affiché (cf. showScreen()). Un tableau `screenStack` retient le chemin
 * emprunté pour permettre un retour arrière fidèle sans recharger la page ni dupliquer la
 * logique de chaque branche.
 *
 * Volontairement AUCUNE sélection de langue de l'appareil ici (supprimée à la demande : elle
 * faisait doublon avec l'assistant de premier démarrage déjà présent sur l'appareil, cf.
 * settings.pendingLang / GitUpdater::checkPendingLang() dans src/GitOTA.cpp -- c'est lui qui gère
 * réellement le téléchargement de la traduction, une fois l'appareil en ligne). Ce que dit encore
 * cette page à ce sujet reste donc un simple message informatif dans les écrans d'installation.
 *
 * L'effacement complet avant écriture reste géré par ESP Web Tools lui-même : en l'absence du
 * champ "new_install_prompt_erase" dans les manifestes (cf. docs/manifests/*.json, générés par
 * .github/workflows/pages.yml), un erase complet est effectué automatiquement avant chaque
 * installation neuve, sans dialogue supplémentaire. Le choix du port USB est également géré
 * nativement par le navigateur (sélecteur natif Web Serial ouvert par <esp-web-install-button>).
 *
 * La page reste elle-même traduisible (FR/EN/DE/ES, cf. js/geo.js pour le même patron) --
 * indépendant de la langue de l'appareil ci-dessus : c'est juste l'interface DE CETTE PAGE.
 */
'use strict';

const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es'];
const DEFAULT_LANG = 'en';

// Catalogue des boîtiers officiels (étape 2A), avec leurs photos.
const BOXES = [
    {
        id: 'box_wifi',
        manifest: 'manifests/box_wifi.json',
        titleKey: 'installer_box_wifi_title',
        descKey: 'installer_box_wifi_desc',
        image: 'https://github.com/user-attachments/assets/09564622-8128-46de-9957-2310bc14ab70',
        alt: 'ESPSomfy-RTS BOX-Wifi',
    },
    {
        id: 'box_eth',
        manifest: 'manifests/box_eth.json',
        titleKey: 'installer_box_eth_title',
        descKey: 'installer_box_eth_desc',
        image: 'https://github.com/user-attachments/assets/05727baa-7245-4067-a876-978e53891212',
        alt: 'ESPSomfy-RTS BOX-Ethernet',
    },
];

// Catalogue matériel de l'étape 2B, aligné sur la matrice de build.yaml / platformio.ini.
const DIY_BOARDS = [
    { id: 'esp32', manifest: 'manifests/esp32.json', label: 'ESP32', descKey: 'installer_hw_esp32_desc' },
    { id: 'esp32wrover', manifest: 'manifests/esp32wrover.json', label: 'ESP32-Wrover', descKey: 'installer_hw_esp32wrover_desc' },
    { id: 'esp32c3', manifest: 'manifests/esp32c3.json', label: 'ESP32-C3', descKey: 'installer_hw_esp32c3_desc' },
    { id: 'esp32s2', manifest: 'manifests/esp32s2.json', label: 'ESP32-S2', descKey: 'installer_hw_esp32s2_desc' },
    { id: 'esp32s3', manifest: 'manifests/esp32s3.json', label: 'ESP32-S3', descKey: 'installer_hw_esp32s3_desc' },
];

let t = {};
let screenStack = ['s-root'];

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
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (t[key] !== undefined) el.innerHTML = t[key];
    });
}

/* ------------------------------------------------------------------ Navigation du wizard */

function showScreen(id, direction) {
    document.querySelectorAll('.wizard-screen').forEach((el) => {
        el.classList.remove('active', 'enter-forward', 'enter-back');
    });
    const el = $(id);
    el.classList.add('active', direction === 'back' ? 'enter-back' : 'enter-forward');

    const backBtn = $('wizardBack');
    backBtn.hidden = screenStack.length <= 1;
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
            <img class="box-card-img" src="${box.image}" alt="${box.alt}" loading="lazy">
            <span class="box-card-label" data-i18n="${box.titleKey}"></span>
            <span class="box-card-desc" data-i18n="${box.descKey}"></span>
        `;
        card.addEventListener('click', () => selectBox(box));
        grid.appendChild(card);
    });
}

function selectBox(box) {
    $('boxInstallBtn').manifest = box.manifest;
    $('s3aBoardName').setAttribute('data-i18n', box.titleKey);
    applyTranslations();
    goTo('s-box-install');
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
    $('diyInstallBtn').manifest = board.manifest;
    $('s3bBoardName').textContent = board.label;
    goTo('s-diy-install');
}

/* ------------------------------------------------------------------ Compatibilité navigateur */

function checkCompat() {
    const supported = 'serial' in navigator;
    const allowed = window.isSecureContext;
    if (!supported || !allowed) {
        $('compatWarning').hidden = false;
    }
}

/* ------------------------------------------------------------------ Init */

async function init() {
    checkCompat();
    initRootScreen();
    renderBoxGrid();
    renderDiyGrid();
    $('wizardBack').addEventListener('click', goBack);
    await loadLanguage(resolveLang());
}

document.addEventListener('DOMContentLoaded', init);
