/* ESPSomfy-RTS — assistant de flash web (GitHub Pages, HTTPS), basé sur ESP Web Tools.
 *
 * Rôle : proposer deux parcours de flash USB depuis le navigateur (Chrome/Edge desktop, API Web
 * Serial) :
 *   - Boîtiers vendus (BOX-Wifi / BOX-Ethernet) : un seul bouton, l'image "onboard" appropriée
 *     est déjà connue à l'avance, aucune question à poser.
 *   - Cartes ESP32 génériques : un mini-assistant à 3 étapes (matériel -> langue -> flash).
 *
 * Volontairement PAS d'injection de langue dans le binaire flashé : il n'existe qu'un seul
 * littlefs.bin embarqué par la CI (cf. build.yaml / minify_data.py), quel que soit le board ou
 * la langue choisie ici. Le choix de langue de cette page reste donc purement informatif -- la
 * vraie sélection/téléchargement de langue se fait sur l'appareil lui-même, après connexion
 * Wi-Fi, via son assistant de premier démarrage (settings.pendingLang / GitUpdater::
 * checkPendingLang(), cf. src/GitOTA.cpp). Étape 2 = un simple message adapté à la langue
 * choisie, rien de plus.
 *
 * L'effacement complet avant écriture (erase total) n'est PAS piloté ici : en l'absence du champ
 * "new_install_prompt_erase" dans le manifeste (cf. docs/manifests/*.json), ESP Web Tools
 * effectue un erase complet automatiquement avant chaque installation neuve, sans dialogue
 * supplémentaire. Le choix du port USB est également géré nativement par le navigateur
 * (sélecteur natif Web Serial ouvert par <esp-web-install-button>).
 */
'use strict';

const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es'];
const DEFAULT_LANG = 'en';

// Langues proposées à l'étape 2, alignées sur locales/manifest.json (langues effectivement
// téléchargeables par l'appareil une fois en ligne).
const DEVICE_LANGS = [
    { code: 'fr', native: 'Français' },
    { code: 'en', native: 'English' },
    { code: 'de', native: 'Deutsch' },
    { code: 'es', native: 'Español' },
];

// Catalogue matériel de l'étape 1, aligné sur la matrice de build.yaml / platformio.ini.
// `manifest` pointe vers un fichier ESP Web Tools servi à côté de cette page.
const BOARDS = [
    { id: 'esp32', manifest: 'manifests/esp32.json', label: 'ESP32', descKey: 'installer_hw_esp32_desc' },
    { id: 'esp32wrover', manifest: 'manifests/esp32wrover.json', label: 'ESP32-Wrover', descKey: 'installer_hw_esp32wrover_desc' },
    { id: 'esp32c3', manifest: 'manifests/esp32c3.json', label: 'ESP32-C3', descKey: 'installer_hw_esp32c3_desc' },
    { id: 'esp32s2', manifest: 'manifests/esp32s2.json', label: 'ESP32-S2', descKey: 'installer_hw_esp32s2_desc' },
    { id: 'esp32s3', manifest: 'manifests/esp32s3.json', label: 'ESP32-S3', descKey: 'installer_hw_esp32s3_desc' },
];

let t = {};
let activeLang = DEFAULT_LANG;
let selectedBoard = null;
let selectedDeviceLang = 'fr';

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
        activeLang = lang;
    } catch (err) {
        console.warn('Langue indisponible, repli sur', DEFAULT_LANG, err);
        if (lang !== DEFAULT_LANG) {
            try {
                t = await fetchLang(DEFAULT_LANG);
                activeLang = DEFAULT_LANG;
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
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key] !== undefined) el.placeholder = t[key];
    });
    updateStep2Hint();
}

/* ------------------------------------------------------------------ Étape 1 : matériel */

function renderBoardGrid() {
    const grid = $('hwGrid');
    grid.innerHTML = '';
    BOARDS.forEach((board) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'hw-card';
        card.dataset.board = board.id;
        card.innerHTML = `
            <span class="hw-card-label">${board.label}</span>
            <span class="hw-card-desc" data-i18n="${board.descKey}"></span>
        `;
        card.addEventListener('click', () => selectBoard(board));
        grid.appendChild(card);
    });
}

function selectBoard(board) {
    selectedBoard = board;
    document.querySelectorAll('.hw-card').forEach((el) => {
        el.classList.toggle('selected', el.dataset.board === board.id);
    });

    const installBtn = $('wizardInstall');
    installBtn.manifest = board.manifest;
    installBtn.hidden = false;
    $('step3Placeholder').hidden = true;
    $('step3BoardName').textContent = board.label;

    applyTranslations();
}

/* ------------------------------------------------------------------ Étape 2 : langue (informatif) */

function renderLangSelect() {
    const select = $('deviceLangSelect');
    select.innerHTML = '';
    DEVICE_LANGS.forEach(({ code, native }) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = native;
        select.appendChild(opt);
    });
    select.value = selectedDeviceLang;
    select.addEventListener('change', () => {
        selectedDeviceLang = select.value;
        updateStep2Hint();
    });
}

function updateStep2Hint() {
    const hintEl = $('step2Hint');
    if (!hintEl || !t.installer_step2_hint) return;
    const native = (DEVICE_LANGS.find((l) => l.code === selectedDeviceLang) || {}).native || '';
    hintEl.textContent = t.installer_step2_hint.replace('{lang}', native);
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
    renderBoardGrid();
    renderLangSelect();
    await loadLanguage(resolveLang());
}

document.addEventListener('DOMContentLoaded', init);
