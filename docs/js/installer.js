/* ESPSomfy-RTS — assistant de flash web (GitHub Pages, HTTPS), basé sur ESP Web Tools.
 *
 * UNE CARTE À DEUX ÉTATS, plus un assistant :
 *
 *   sans port  ──[Connecter]──>  avec port  ──[Installer]──> fenêtre matériel + version
 *                                           ──[Journaux]──> console série
 *                                           ──[Déconnecter]
 *
 * LA CONNEXION D'ABORD. Le port était autrefois demandé au tout dernier moment, au clic sur
 * « Installer » : un visiteur pouvait répondre à trois écrans avant d'apprendre que son navigateur
 * ne sait pas parler série, ou que son câble USB n'a pas de fil de données. Il est maintenant
 * retenu d'emblée et conservé dans `port` jusqu'au flash ou à la déconnexion.
 *
 * Les choix vivent dans des fenêtres, pas dans la carte. Ce n'est pas qu'une question de goût :
 * une carte qui change de contenu change de taille, et les trois tentatives précédentes (écrans
 * glissants à hauteur mesurée en JavaScript, puis zone fixe à défilement interne) ont toutes buté
 * là-dessus. Une fenêtre a le droit d'avoir sa propre taille. Les fonctions showStep/goTo/goBack
 * et updateStageHeight/updateStepHeaderHeight/updateLayout n'ont plus d'objet.
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

/* ------------------------------------------------------------------ État de la carte */

function isCompatible() {
    return 'serial' in navigator && window.isSecureContext;
}

// La carte n'a que deux états. Titre et texte changent de clé de traduction plutôt que d'être
// dupliqués dans deux blocs : SiteLayout.apply() relit l'attribut et repose le texte, dans la
// langue courante, sans que ce fichier n'ait à connaître un seul libellé.
function setConnected(connecte) {
    const carte = document.querySelector('.installer-card');
    carte.classList.toggle('is-disconnected', !connecte);
    $('connBadge').hidden = !connecte;
    $('btnConnect').hidden = connecte;
    $('mainActions').hidden = !connecte;
    $('toolsSecondary').hidden = !connecte;
    $('cardTitle').setAttribute('data-i18n', connecte ? 'installer_connected_title' : 'installer_connect_title');
    $('cardBody').setAttribute('data-i18n', connecte ? 'installer_connected_body' : 'installer_connect_body');
    if (connecte) $('noPortHint').hidden = true;
    SiteLayout.apply();
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
    setConnected(true);
}

// forget() rend l'autorisation accordée au site, pas seulement le port : sans lui, le sélecteur
// natif proposerait l'appareil comme déjà autorisé au prochain clic. Il n'existe que depuis
// Chrome 103, d'où l'appel protégé -- son absence n'empêche rien, elle laisse juste
// l'autorisation en place.
async function disconnect() {
    await stopLogs();
    closeLogs();
    if (port && port.forget) {
        try { await port.forget(); } catch (err) { /* sans effet sur la suite */ }
    }
    port = null;
    selected = null;
    selectedManifest = null;
    setConnected(false);
}

/* ------------------------------------------------------------------ Fenêtre du matériel */

// Onglets du tableau de bord du firmware (cf. data-dev/js/40-general.js, switchMobileTab) : la
// classe .active sur le bouton commande à la fois sa couleur et la position du soulignement, ce
// dernier par un sélecteur :has() en CSS -- rien à piloter ici que l'état.
function initTabs(idFenetre) {
    const fenetre = $(idFenetre);
    fenetre.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => activerOnglet(btn));
    });
}

// Séparé du branchement : la reconnaissance du nom de fichier s'en sert aussi pour amener
// l'utilisateur sur l'onglet qui décrit le fichier qu'il vient de choisir.
function activerOnglet(btn) {
    const fenetre = btn.closest('.inst-content');
    fenetre.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
    });
    fenetre.querySelectorAll('.hw-panel').forEach((p) => {
        p.classList.toggle('is-active', p.id === btn.dataset.panel);
    });
}

function renderHardware() {
    const boxGrid = $('boxGrid');
    const diyGrid = $('diyGrid');
    boxGrid.innerHTML = '';
    diyGrid.innerHTML = '';

    HARDWARE.forEach((item) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.dataset.id = item.id;
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

// Choisir ne lance plus rien : la sélection est un état visible, et c'est le bouton du pied de la
// fenêtre qui déclenche. Sans quoi il n'y aurait aucun moment pour choisir une version.
async function selectHardware(item) {
    selected = item;
    selectedManifest = manifestPath(item.id);

    document.querySelectorAll('#installOverlay .box-card, #installOverlay .hw-card').forEach((el) => {
        el.classList.toggle('is-selected', el.dataset.id === item.id);
    });

    // Note bouton-poussoir : uniquement pertinente pour le boîtier Wi-fi & Ethernet (le Wi-fi
    // seul n'a pas ce mode d'entrée en flash manuel).
    $('boxEthBootNotice').hidden = item.id !== 'box_eth';

    await buildVersionSelect();
    $('startFlashBtn').disabled = false;
}

function openInstallOverlay() {
    if (!port) return;
    $('installOverlay').hidden = false;
}

function closeInstallOverlay() {
    $('installOverlay').hidden = true;
}

/* ------------------------------------------------------------------ Version */

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
    // Une seule version publiée : il n'y a rien à choisir, la liste reste inerte. Elle
    // s'activera d'elle-même le jour où pages.yml en recopiera plusieurs.
    sel.disabled = sel.options.length <= 1;
}

/* ------------------------------------------------------------------ Téléversement manuel */

/* UNIQUEMENT des images complètes. Elles s'écrivent à l'adresse 0 et réécrivent la table de
 * partitions au passage : elles sont donc justes quoi qu'il y ait déjà sur la puce. Une
 * installation partielle devrait connaître les offsets de la table DÉJÀ EN PLACE, et ceux-ci
 * diffèrent d'une génération à l'autre -- LittleFS à 0x290000 sur la v2 amont, spiffs à 0x370000
 * sur la v3, et le garde-fou check_partition_layout.py en mentionne encore une autre. Les lire
 * sur la puce demanderait ESPLoader, que le paquet embarqué n'exporte pas.
 *
 * Le nom du fichier porte la puce visée, sur trois conventions différentes :
 *   v3            ESPSomfyRTS_<ver>_factory_esp32s3.zip, ..._factory_esp32_BOX_wifi.zip
 *   v2 (2.5.x)    SomfyController.onboard.esp32s3_4mb.bin.zip
 *   v2 (<= 2.4.7) SomfyController.onboard.esp32s3.bin.zip
 * D'où une reconnaissance par motifs, du plus spécifique au plus général : "esp32" est un préfixe
 * de tous les autres, il doit donc passer en dernier. */
const FAMILLES = [
    [/esp32-?s3/i, 'ESP32-S3'],
    [/esp32-?s2/i, 'ESP32-S2'],
    [/esp32-?c3/i, 'ESP32-C3'],
    [/esp32/i, 'ESP32'],
];

let manualBlob = null;

function familleDepuisNom(nom) {
    for (const [motif, famille] of FAMILLES) {
        if (motif.test(nom)) return famille;
    }
    return null;
}

function manualErreur(message) {
    const el = $('manualError');
    el.textContent = message || '';
    el.hidden = !message;
}

// Lecture d'archive maison plutôt qu'une bibliothèque : il n'y a qu'une entrée à extraire, et
// DecompressionStream fait tout le travail de décompression. On passe par le RÉPERTOIRE CENTRAL
// (en fin de fichier) et non par l'en-tête local : c'est la seule source qui porte toujours la
// taille compressée, un zip écrit en flux la laissant à zéro en tête.
async function lireArchive(fichier) {
    const buf = new Uint8Array(await fichier.arrayBuffer());
    const dv = new DataView(buf.buffer);

    let eocd = -1;
    const plancher = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= plancher; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error(tr('installer_manual_zip_error'));

    const entrees = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < entrees; n++) {
        if (dv.getUint32(p, true) !== 0x02014b50) throw new Error(tr('installer_manual_zip_error'));
        const methode = dv.getUint16(p + 10, true);
        const taille = dv.getUint32(p + 20, true);
        const lNom = dv.getUint16(p + 28, true);
        const lExtra = dv.getUint16(p + 30, true);
        const lComm = dv.getUint16(p + 32, true);
        const debutLocal = dv.getUint32(p + 42, true);
        const nom = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + lNom));
        p += 46 + lNom + lExtra + lComm;
        if (!nom.toLowerCase().endsWith('.bin')) continue;

        // Les longueurs nom/extra de l'en-tête LOCAL peuvent différer de celles du répertoire
        // central : c'est lui qui donne le vrai début des données.
        const lNom2 = dv.getUint16(debutLocal + 26, true);
        const lExtra2 = dv.getUint16(debutLocal + 28, true);
        const debut = debutLocal + 30 + lNom2 + lExtra2;
        const donnees = buf.subarray(debut, debut + taille);

        if (methode === 0) return { nom, blob: new Blob([donnees]) };
        if (methode === 8) {
            const flux = new Blob([donnees]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            return { nom, blob: await new Response(flux).blob() };
        }
        throw new Error(tr('installer_manual_zip_error'));
    }
    throw new Error(tr('installer_manual_no_bin'));
}

async function onManualFile() {
    manualBlob = null;
    manualErreur('');
    $('manualFlashBtn').disabled = true;
    $('manualStatus').textContent = '';

    const fichier = $('manualFile').files[0];
    const libelle = $('manualFileName');
    libelle.textContent = fichier ? fichier.name : tr('installer_manual_choose');
    libelle.classList.toggle('is-set', !!fichier);
    if (!fichier) return;

    const famille = familleDepuisNom(fichier.name);
    if (famille) $('manualChip').value = famille;

    // Le nom dit de quelle génération vient l'image : on ouvre l'onglet qui la décrit, pour que
    // la légende sous les yeux soit celle du fichier retenu.
    const nomBas = fichier.name.toLowerCase();
    if (nomBas.includes('onboard')) activerOnglet($('tabV2'));
    else if (nomBas.includes('factory')) activerOnglet($('tabV3'));

    $('manualStatus').textContent = tr('installer_manual_reading');
    try {
        if (fichier.name.toLowerCase().endsWith('.zip')) {
            const { nom, blob } = await lireArchive(fichier);
            manualBlob = blob;
            $('manualStatus').textContent = tr('installer_manual_ready', { nom, taille: Math.round(blob.size / 1024) });
        } else {
            manualBlob = fichier;
            $('manualStatus').textContent = tr('installer_manual_ready', { nom: fichier.name, taille: Math.round(fichier.size / 1024) });
        }
    } catch (err) {
        $('manualStatus').textContent = '';
        manualErreur(err.message || String(err));
        return;
    }
    $('manualFlashBtn').disabled = false;
}

// flash.js sait résoudre un manifeste en blob: (il le teste explicitement avant de le résoudre
// contre location), et une URL blob: passée en `path` se résout en elle-même : le fichier local
// se donne donc à la bibliothèque sans rien changer au paquet embarqué.
// Le manifeste n'annonce QU'UNE famille de puce, celle choisie dans la fenêtre : si la puce
// détectée ne correspond pas, flash.js abandonne sur "not_supported" avant la moindre écriture.
// C'est tout ce qui sépare l'utilisateur d'une image de C3 écrite sur un ESP32.
async function startManualFlash() {
    if (!isCompatible() || !port || !manualBlob) return;

    closeManualOverlay();
    await stopLogs();
    closeLogs();

    const url = URL.createObjectURL(manualBlob);
    const manifest = {
        name: $('manualFile').files[0].name,
        version: '',
        builds: [{ chipFamily: $('manualChip').value, parts: [{ path: url, offset: 0 }] }],
    };

    if (port.readable || port.writable) {
        try { await port.close(); } catch (err) { /* au pire flash() échouera proprement */ }
    }

    openFlashDialog();
    try {
        await flash(onFlashEvent, port, url, manifest, true);
    } finally {
        URL.revokeObjectURL(url);
    }
}

function openManualOverlay() {
    if (!port) return;
    $('manualOverlay').hidden = false;
}

function closeManualOverlay() {
    $('manualOverlay').hidden = true;
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

    closeInstallOverlay();
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
    initTabs('installOverlay');
    initTabs('manualOverlay');
    renderHardware();

    $('btnConnect').addEventListener('click', connect);
    $('btnDisconnect').addEventListener('click', disconnect);
    $('btnInstall').addEventListener('click', openInstallOverlay);
    $('instClose').addEventListener('click', closeInstallOverlay);
    $('startFlashBtn').addEventListener('click', startFlash);
    $('btnManual').addEventListener('click', openManualOverlay);
    $('manualClose').addEventListener('click', closeManualOverlay);
    $('manualFile').addEventListener('change', onManualFile);
    $('manualFlashBtn').addEventListener('click', startManualFlash);
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
}

document.addEventListener('DOMContentLoaded', init);
