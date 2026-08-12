var socket;
var tConnect = null;
var sockIsOpen = false;
var connecting = false;
var connects = 0;
var connectFailed = 0;
// Compilées une seule fois plutôt qu'à chaque message socket.onmessage (JSON.parse reviver
// ci-dessous) : sans état (pas de flag g/y, donc pas de .lastIndex à réinitialiser entre appels),
// leur réutilisation est sûre. Sensible en pratique pendant un scan RF actif, qui pousse des
// messages fréquents (frequencyScan).
const RE_ISO_DATE = /^(\d{4}|\+010000)-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
const RE_MSAJAX_DATE = /^\/Date\((d|-|.*)\)[\/|\\]$/;
async function initSockets() {
    if (connecting) return;
    logger.debug('Connecting to socket...');
    connecting = true;
    if (tConnect) clearTimeout(tConnect);
    tConnect = null;
    let wms = document.getElementsByClassName('socket-wait');
    for (let i = 0; i < wms.length; i++) {
        wms[i].remove();
    }
    ui.waitMessage(get('divContainer'), 'MSG_WAIT_CONNECTING').classList.add('socket-wait');
    let host = isDevHost ? hst : window.location.hostname;
    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const port = window.location.protocol === 'https:' ? '' : ':8080';
        socket = new WebSocket(`${protocol}//${host}${port}/`);
        socket.onmessage = (evt) => {
            if (evt.data.startsWith('42')) {
                let ndx = evt.data.indexOf(',');
                let eventName = evt.data.substring(3, ndx);
                let data = evt.data.substring(ndx + 1, evt.data.length - 1);
                try {
                    var msg = JSON.parse(data, (key, value) => {
                        if (typeof value === 'string') {
                            var a = RE_ISO_DATE.exec(value);
                            if (a) return new Date(value);
                            a = RE_MSAJAX_DATE.exec(value);
                            if (a) {
                                var b = a[1].split(/[-+,.]/);
                                return new Date(b[0] ? +b[0] : 0 - +b[1]);
                            }
                        }
                        return value;
                    });
                    switch (eventName) {
                        case 'memStatus':
                            firmware.procMemoryStatus(msg);
                            break;
                        case 'updateProgress':
                            firmware.procUpdateProgress(msg);
                            break;
                        case 'fwStatus':
                            firmware.procFwStatus(msg);
                            break;
                        case 'langDownloadProgress':
                            general.procLangDownloadProgress(msg);
                            break;
                        case 'langDownloadComplete':
                            general.procLangDownloadComplete(msg);
                            break;
                        case 'remoteFrame':
                            somfy.procRemoteFrame(msg);
                            break;
                        case 'groupState':
                            somfy.procGroupState(msg);
                            break;
                        case 'shadeState':
                            somfy.procShadeState(msg);
                            break;
                        case 'shadeCommand':
                            logger.debug('Shade command received:', msg);
                            break;
                        case 'roomRemoved':
                            somfy.procRoomRemoved(msg);
                            break;
                        case 'roomAdded':
                            somfy.procRoomAdded(msg);
                            break;
                        case 'shadeRemoved':
                            break;
                        case 'shadeAdded':
                            break;
                        case 'ethernet':
                            wifi.procEthernet(msg);
                            break;
                        case 'wifiStrength':
                            wifi.procWifiStrength(msg);
                            break;
                        case 'packetPulses':
                            logger.debug('RF packet pulses:', msg);
                            break;
                        case 'frequencyScan':
                            somfy.procFrequencyScan(msg);
                            break;
                    }
                } catch (err) {
                    logger.error('Error processing socket event', eventName, err);
                }
            }
        };
        socket.onopen = (evt) => {
            if (tConnect) clearTimeout(tConnect);
            tConnect = null;
            logger.debug('Socket connected');

            if (evt.target && evt.target.url && evt.target.url.includes('192.168.4.1')) {
                logger.debug("Hotspot mode detected (192.168.4.1)");
                wifi.isHotspot = true;
                document.body.classList.add('mode-hotspot');
            } else {
                wifi.isHotspot = false;
                document.body.classList.remove('mode-hotspot');
            }
            sockIsOpen = true;
            connecting = false;
            connects++;
            connectFailed = 0;
            let wms = document.getElementsByClassName('socket-wait');
            for (let i = 0; i < wms.length; i++) {
                wms[i].remove();
            }
            let errs = document.getElementsByClassName('socket-error');
            for (let i = 0; i < errs.length; i++)
                errs[i].remove();
            if (general.reloadApp) {
                general.reload();
            }
            else {
                (async () => {
                    ui.clearErrors();
                    // Le serveur protège désormais les réglages réseau/MQTT/config par une authentification :
                    // on ne précharge que ce que la politique de sécurité autorise à cet instant, pour éviter
                    // des erreurs 401 visibles avant une éventuelle connexion.
                    const configOnly = (security.permissions & 0x01) === 0x01;
                    const dashboardAccessible = security.type === 0 || security.authenticated || configOnly;
                    const configAccessible = security.type === 0 || security.authenticated;

                    if (dashboardAccessible) {
                        await general.loadGeneral();
                        await somfy.loadSomfy();
                    }
                    if (configAccessible) {
                        await wifi.loadNetwork();
                        await mqtt.loadMQTT();
                    }
                    if (ui.isConfigOpen()) socket.send('join:0');
                })();
            }
        };
        socket.onclose = (evt) => {
            wifi.procWifiStrength({ ssid: '', channel: -1, strength: -100 });
            wifi.procEthernet({ connected: false, speed: 0, fullduplex: false });
            if (document.getElementsByClassName('socket-wait').length === 0)
                ui.waitMessage(get('divContainer'), 'MSG_WAIT_CONNECTING').classList.add('socket-wait');
            if (evt.wasClean) {
                logger.debug('Socket closed cleanly');
                connectFailed = 0;
                tConnect = setTimeout(async () => { await reopenSocket(); }, 7000);
                logger.debug('Reconnecting socket in 7 seconds');
            }
            else {
                logger.warn('Socket closed unexpectedly, reconnecting...', evt.reason);
                if (connects > 0) {
                    logger.debug('Reconnecting socket in 3 seconds');
                    tConnect = setTimeout(async () => { await reopenSocket(); }, 3000);
                }
                else {
                    if (connecting) {
                        connectFailed++;
                        let timeout = Math.min(connectFailed * 500, 10000);
                        logger.debug(`Initial socket did not connect try again (server was busy and timed out ${connectFailed} times)`);
                        tConnect = setTimeout(async () => { await reopenSocket(); }, timeout);
                        if (connectFailed === 5) {
                            ui.socketError('Too many clients connected.  A maximum of 5 clients may be connected at any one time.  Close some connections to the ESP Somfy RTS device to proceed.');
                        }
                        let spanAttempts = get('spanSocketAttempts');
                        if (spanAttempts) spanAttempts.innerHTML = connectFailed.fmt("#,##0");
                    }
                    else {
                        logger.debug('Connecting socket in .5 seconds');
                        tConnect = setTimeout(async () => { await reopenSocket(); }, 500);
                    }
                }
            }
            connecting = false;
        };
        socket.onerror = (evt) => {
            logger.warn('Socket error', evt);
        };
    } catch (err) {
        logger.error('Failed to open WebSocket connection', err);
        tConnect = setTimeout(async () => { await reopenSocket(); }, 5000);
    }
}

function shOverlay(div, onClose) {
    if (!div) return;

    const btn = div.querySelector('[close]');
    if (btn) btn.onclick = () => confirmDiscardChanges(() => closeOverlay(div, onClose), null, criticalStepGuard(div));

    // Si c'est une modale, on bloque le scroll
    if (div.classList.contains('modal-overlay')) {
        document.body.classList.add('modal-open');
    } else {
        // On ne remonte la page principale que si c'est inst-overlay
        window.scrollTo(0, 0);
    }

    get('divContainer').appendChild(div);
}

const closeOverlay = (div, callback) => {
    if (!div) return;

    // 1. On lance l'animation de sortie
    div.classList.add('overlay-exit');

    // 2. On attend la fin de l'animation avant de nettoyer le DOM
    setTimeout(() => {
        div.remove();

        // Seuls les .modal-overlay gèrent le verrouillage du scroll.
        // On regarde s'il reste une modale active (en excluant celle qui finit de s'animer).
        const remainingModal = document.querySelector('.modal-overlay:not(.overlay-exit)');

        if (!remainingModal) {
            document.body.classList.remove('modal-open');
        }

        if (typeof callback === 'function') callback();
    }, 300);
};
function handleMobileDismiss(handleElement) {
    // Trouve l'overlay parent le plus proche (.modal-overlay ou .inst-overlay)
    const topOverlay = handleElement.closest('.modal-overlay, .inst-overlay');
    if (topOverlay) {
        confirmDiscardChanges(() => closeOverlay(topOverlay), null, criticalStepGuard(topOverlay));
    }
}

// Fermeture au clic sur le fond (façon Facebook) : un clic qui n'atterrit PAS dans la vraie zone
// de contenu (.message-content pour .modal-overlay, .instructions-content pour .inst-overlay)
// ferme l'overlay -- même logique de sortie que le bouton Annuler/[close]/glisser-pour-fermer
// ci-dessus, donc même passage par confirmDiscardChanges() si des modifications sont en cours.
// Exclusions volontaires : les alertes critiques (confirmation/erreur/info -- ui.promptMessage(),
// ui.errorMessage(), ui.infoMessage(), socketError()...) ne doivent jamais se fermer par
// accident au clic extérieur ; elles se reconnaissent à leur classe interne prompt-content/
// error-content/info-content, posée par ces fonctions dans index.js.
document.addEventListener('click', (e) => {
    const overlay = e.target.closest('.modal-overlay, .inst-overlay');
    if (!overlay) return;
    if (e.target.closest('.message-content, .instructions-content')) return;
    if (overlay.querySelector('.prompt-content, .error-content, .info-content')) return;
    confirmDiscardChanges(() => closeOverlay(overlay), null, criticalStepGuard(overlay));
});

function clearOverlays() {
    const selectors = ['.inst-overlay', '.modal-overlay', '.instructions', '#divGitInstall'];
    selectors.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
    document.body.classList.remove('modal-open');
}

// Pilote le remplissage visuel (.slider-progress) des sliders ".md3-range-input" -- le
// <input type="range"> natif est invisible (opacity:0 en CSS) et ne sert plus qu'à
// l'interaction, tout le rendu passe par ce div normal (aucune dépendance à un
// pseudo-élément spécifique à un moteur, donc rendu garanti identique partout).
// À appeler sur chaque 'input' (glisser) ET après toute affectation programmatique de
// la valeur (cf. ui.setValue() case 'range').
function syncSliderProgress(el) {
    const progress = el.previousElementSibling;
    if (!progress || !progress.classList.contains('slider-progress')) return;

    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || 100;
    const pct = max > min ? ((parseFloat(el.value) - min) / (max - min)) * 100 : 0;
    const clampedPct = Math.min(100, Math.max(0, pct));

    // Met à jour le width et la variable CSS pour la compensation exacte
    progress.style.width = `${clampedPct}%`;
    progress.style.setProperty('--pct', clampedPct);
}

// =========================================================================
// SECTION : PROTECTION CONTRE LA PERTE DE MODIFICATIONS NON ENREGISTRÉES
// =========================================================================
// Plusieurs conteneurs peuvent être suivis en parallèle : au chargement, Général/Réseau/MQTT/Radio
// se peuplent quasiment en même temps (chacun appelle watchDirty() dans son propre callback), donc
// un unique conteneur "actif" écraserait les précédents avant même que l'utilisateur ne touche à
// rien. isDirty reste un drapeau global unique (recalculé), mais l'écoute est additive par conteneur.
let isDirty = false;
const _dirtyWatchContainers = new Set();

// N'ajoute/enlève JAMAIS de classe sur un parent : seul l'élément modifié reçoit .is-dirty. La mise
// en évidence d'un conteneur englobant est entièrement déléguée au CSS (voir base.css, règle
// .dirty-target:has(.is-dirty)) -- à placer manuellement dans le HTML sur les blocs voulus.
function _markDirty(evt) {
    const el = evt.target;
    if (!el || !el.classList) return;
    el.classList.add('is-dirty');
    isDirty = true;
}
function _recomputeIsDirty() {
    isDirty = !!document.querySelector('.is-dirty');
}

/**
 * Attache une écoute déléguée sur `container` : toute saisie/changement utilisateur sur un champ
 * (input/select/textarea, y compris les cases à cocher et sliders) à l'intérieur marque l'état
 * "modifié" et ajoute .is-dirty sur ce champ précis. À appeler UNE FOIS le formulaire rempli avec
 * ses valeurs actuelles (ui.toElement...), pour ne pas marquer "modifié" le simple remplissage
 * programmatique. Un même conteneur peut être réutilisé d'une ouverture à l'autre (même div pour
 * chaque volet édité) : on repart alors d'un état visuel propre, sans dupliquer l'écoute.
 * @param {Element} container
 */
function watchDirty(container) {
    if (!container) return;
    if (!_dirtyWatchContainers.has(container)) {
        _dirtyWatchContainers.add(container);
        container.addEventListener('input', _markDirty);
        container.addEventListener('change', _markDirty);
    }
    container.querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty'));
    _recomputeIsDirty();
}
// À appeler après une sauvegarde réussie ou un clic explicite sur Annuler/Fermer (Quitter sans
// enregistrer inclus). Sans argument : remet à zéro l'état visuel ET l'alerte pour TOUS les
// conteneurs suivis. Avec un `container` : ne nettoie que celui-ci puis recalcule isDirty/l'alerte
// -- indispensable quand un formulaire peut s'ouvrir par-dessus un autre encore non enregistré
// (ex: création de pièce à la volée depuis l'édition d'un volet/groupe) : sauvegarder/annuler la
// pièce ne doit pas effacer les modifications en attente du formulaire parent resté ouvert derrière.
function clearDirty(container) {
    if (container) {
        container.querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty'));
        _recomputeIsDirty();
        if (!isDirty) document.body.classList.remove('dirty-alerted');
        return;
    }
    _dirtyWatchContainers.forEach(c => c.querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty')));
    document.body.classList.remove('dirty-alerted');
    isDirty = false;
}

/**
 * Si isDirty, affiche une modale de confirmation ("Modifications non enregistrées") avant
 * d'exécuter onLeave ; sinon exécute onLeave immédiatement. onLeave n'est appelé que si
 * l'utilisateur choisit "Quitter sans enregistrer" (isDirty est alors réinitialisé avant).
 * onStay (optionnel) s'exécute si l'utilisateur choisit "Annuler" (reste sur la page) -- dans ce
 * cas l'alerte visuelle (niveau 2, orange) N'EST PAS retirée : elle doit rester affichée tant que
 * les modifications ne sont ni enregistrées ni abandonnées.
 * @param {Function} onLeave
 * @param {Function} [onStay]
 * @param {Object} [options]
 * @param {boolean} [options.force] - Affiche l'avertissement même si isDirty est false. Réservé
 *   aux procédures radio irréversibles (appairage, liaison de groupe) où il n'y a aucun champ de
 *   formulaire à suivre via watchDirty(), mais où quitter en cours de route peut désynchroniser
 *   un équipement qui a déjà reçu une commande -- voir criticalStepGuard() plus bas.
 * @param {string} [options.titleKey] - Clé de traduction du titre (défaut : PROMPT_UNSAVED_TITLE).
 * @param {string} [options.msgKey] - Clé de traduction du message (défaut : PROMPT_UNSAVED_MSG).
 * @param {string} [options.icon] - Icône du modalHeader (défaut : svg-info).
 * @param {string} [options.type] - Type du modalHeader (défaut : 'small', 'small danger' pour force).
 */
function confirmDiscardChanges(onLeave, onStay, options) {
    const opts = options || {};
    if (!isDirty && !opts.force) { onLeave(); return; }
    // Passage au niveau 2 (avertissement) : la simple tentative de sortie escalade la mise en
    // évidence, même si l'utilisateur annule ensuite -- il doit repérer immédiatement les champs
    // à traiter s'il retente de quitter. Sans objet pour un avertissement "force" hors formulaire.
    if (isDirty) document.body.classList.add('dirty-alerted');
    const titleKey = opts.titleKey || 'PROMPT_UNSAVED_TITLE';
    const msgKey = opts.msgKey || 'PROMPT_UNSAVED_MSG';
    const icon = opts.icon || (opts.force ? 'svg-warning' : 'svg-info');
    const type = opts.type || (opts.force ? 'small danger' : 'small');
    let div = document.createElement('div');
    div.className = 'modal-overlay';
    div.innerHTML = `
    <div class="message-content prompt-content">
    ${modalHeader(titleKey, icon, { type: type })}
    <div class="sub-message"><p>${tr(msgKey)}</p></div>
    <div class="button-container-row">
    <button id="btnUnsavedStay" line type="button">${tr('BT_STAY_PAGE')}</button>
    <button id="btnUnsavedLeave" red type="button"><span>${tr('BT_LEAVE_WITHOUT_SAVING')}</span></button>
    </div>
    </div>`;
    shOverlay(div);
    div.querySelector('#btnUnsavedStay').onclick = () => {
        closeOverlay(div);
        if (typeof onStay === 'function') onStay();
    };
    div.querySelector('#btnUnsavedLeave').onclick = () => {
        clearDirty();
        closeOverlay(div);
        onLeave();
    };
}

// Overlays de procédure radio irréversible (appairage/désappairage volet, liaison/déliaison de
// groupe) : dès l'instant où l'étape critique envoie une commande radio réelle au volet (mise en
// écoute programmation), quitter sans terminer la procédure peut le laisser désynchronisé --
// contrairement au reste de l'appli, ce risque existe même sans aucun champ de formulaire modifié
// (isDirty resterait false), donc confirmDiscardChanges() doit être forcé indépendamment de lui.
// Un seul point de vérité pour la correspondance overlay/étape, réutilisé sur tous les chemins de
// fermeture (fond cliquable, glisser mobile, boutons Annuler dédiés).
// Pose un drapeau PERSISTANT (jamais retiré en revenant en arrière dans l'assistant) dès que
// l'étape radio critique est atteinte une première fois -- s'appuie sur l'évènement 'stepchanged'
// déjà émis par ui.wizSetStep() (base.css/index.js). Un simple test "étape courante === X" ne
// suffit pas : la commande radio a bien été envoyée au volet une fois cette étape franchie, et ce
// risque ne disparaît pas si l'utilisateur clique ensuite sur "Précédent" -- le drapeau doit donc
// coller à l'overlay jusqu'à l'enregistrement final (qui ferme l'overlay directement, sans passer
// par confirmDiscardChanges -- cf. sucAction/btnPairToGroup/btnUnpairFromGroup), pas juste tant que
// l'étape affichée est la bonne.
function markCriticalStepReached(div, criticalStep) {
    div.addEventListener('stepchanged', (e) => {
        if (e.detail.newStep >= criticalStep) div.setAttribute('data-radio-committed', 'true');
    });
}

const CRITICAL_STEP_OVERLAY_IDS = ['divPairing', 'divLinkGroup', 'divUnlinkGroup', 'divCalibration'];

function criticalStepGuard(overlay) {
    if (!overlay) return null;
    if (CRITICAL_STEP_OVERLAY_IDS.includes(overlay.id) && overlay.getAttribute('data-radio-committed') === 'true') {
        return { force: true, titleKey: 'PROMPT_RADIO_PROCEDURE_TITLE', msgKey: 'PROMPT_RADIO_PROCEDURE_MSG' };
    }
    return null;
}
// Repère si une procédure radio critique est en cours quelque part dans le DOM (pas juste dans
// l'overlay actif) -- utilisé par le garde-fou beforeunload ci-dessous, seul mécanisme que F5/
// fermeture d'onglet/navigation externe respecte : confirmDiscardChanges() ne vit qu'en mémoire JS
// et n'a jamais l'occasion de s'exécuter dans ces cas-là.
function anyCriticalStepPending() {
    return CRITICAL_STEP_OVERLAY_IDS.some(id => {
        const el = document.getElementById(id);
        return el && el.getAttribute('data-radio-committed') === 'true';
    });
}
// Avertissement natif du navigateur (texte non personnalisable, imposé par tous les navigateurs
// modernes depuis des années pour éviter les abus) -- déclenché sur F5, fermeture d'onglet/
// fenêtre, ou navigation vers une autre URL, exactement les sorties que confirmDiscardChanges()
// ne peut pas intercepter puisqu'il ne s'exécute qu'en JS dans la page. Couvre à la fois les
// formulaires en cours (isDirty) et les procédures radio critiques en cours (voir plus haut).
window.addEventListener('beforeunload', (e) => {
    if (!isDirty && !anyCriticalStepPending()) return;
    e.preventDefault();
    e.returnValue = '';
});

// =========================================================================
// SECTION : ROUTEUR DE NAVIGATION (deep-linking par hash d'URL)
// =========================================================================
// Table de routage centrale : un seul point de vérité pour la correspondance entre les
// panneaux (data-grpid du DOM) et les slugs d'URL adressables (#dashboard, #shades...).
// Seule une "feuille" (panneau réellement affiché) possède un slug ; une section de premier
// niveau (System/Network/Somfy/Radio) résout automatiquement vers son sous-onglet par défaut.
//
// Le sous-onglet par défaut n'est PAS codé en dur : il est résolu dynamiquement (voir
// _resolveDefaultChild ci-dessous) comme le premier <span data-grpid> réellement présent dans le
// .subtab-container de la section, pour que la navigation suive toujours l'ordre visuel du HTML
// -- y compris après une réorganisation manuelle des onglets, sans synchronisation JS à refaire.
const ROUTE_TOP_LEVEL_IDS = new Set(['divSystemSettings', 'divNetworkSettings', 'divSomfySettings', 'divRadioSettings']);
function _resolveDefaultChild(grpid) {
    if (!ROUTE_TOP_LEVEL_IDS.has(grpid)) return grpid;
    // Recherche par id stable (subtabContainer-<grpid>), pas par position dans le DOM : sur
    // mobile, _mountMobileSubtab() déplace le .subtab-container de la section active hors de son
    // parent d'origine (voir plus bas), donc `:scope > .subtab-container` ne le retrouverait plus
    // dès la 2e visite de cette section.
    const subtabContainer = get('subtabContainer-' + grpid);
    const firstSpan = subtabContainer ? subtabContainer.querySelector('span[data-grpid]') : null;
    return firstSpan ? firstSpan.getAttribute('data-grpid') : grpid;
}
const ROUTE_LEAF_PARENT = {
    divSystemOptions: 'divSystemSettings',
    divFirmware: 'divSystemSettings',
    divNetAdapter: 'divNetworkSettings',
    divMQTT: 'divNetworkSettings',
    divSomfyRooms: 'divSomfySettings',
    divSomfyMotors: 'divSomfySettings',
    divSomfyGroups: 'divSomfySettings',
    divRepeater: 'divSomfySettings',
    divVirtualRemote: 'divSomfySettings',
    divSomfySchedules: 'divSomfySettings',
    divTransceiverSettings: 'divRadioSettings',
    divFrameLog: 'divRadioSettings',
};
const ROUTE_SLUGS = {
    divHomePnl: 'dashboard',
    divSystemOptions: 'general',
    divFirmware: 'firmware',
    divNetAdapter: 'connection',
    divMQTT: 'mqtt',
    divSomfyRooms: 'rooms',
    divSomfyMotors: 'shades',
    divSomfyGroups: 'groups',
    divRepeater: 'repeaters',
    divVirtualRemote: 'virtual-remote',
    divSomfySchedules: 'schedules',
    divTransceiverSettings: 'radio',
    divFrameLog: 'radio-logs',
};
const ROUTE_SLUG_TO_GRPID = Object.fromEntries(Object.entries(ROUTE_SLUGS).map(([id, slug]) => [slug, id]));
// N'importe quel appelant (sidebar, onglets mobiles, boutons du dashboard, retour F5/historique)
// passe par isApplyingHash pour éviter qu'un hashchange déclenché par nous-mêmes ne relance une
// seconde fois la même navigation.
let isApplyingHash = false;
// Slug réellement affiché à l'écran en ce moment (mis à jour uniquement quand activateGrpid va
// au bout de sa bascule DOM) : sert de point de "retour" quand on doit annuler visuellement une
// navigation par bouton Précédent/Suivant bloquée par des modifications non enregistrées.
let currentSlug = 'dashboard';

// TEST fil d'Ariane (desktop) : lit les libellés déjà traduits depuis la sidebar (section) et le
// .subtab-container (feuille) plutôt que de dupliquer une table de traduction -- reste donc
// automatiquement à jour avec la langue active et un éventuel renommage des onglets.
function _updateBreadcrumb(topId, leafId) {
    const bc = get('divSectionBreadcrumb');
    if (!bc) return;
    const parentEl = bc.querySelector('.section-breadcrumb-parent');
    const activeEl = bc.querySelector('.section-breadcrumb-active');
    if (topId === 'divHomePnl') {
        parentEl.textContent = '';
        activeEl.textContent = '';
        return;
    }
    const topLabel = document.querySelector(`.nav-item[data-grpid="${topId}"] span`)?.textContent.trim() || '';
    const leafLabel = document.querySelector(`.subtab-container > span[data-grpid="${leafId}"]`)?.textContent.trim() || '';
    parentEl.textContent = topLabel;
    // Feuille identique à la section (ex: Radio > Radio) : laisser vide masque le séparateur et
    // le second niveau via CSS (:empty), pour ne pas afficher "Radio › Radio".
    activeEl.textContent = (leafLabel && leafLabel !== topLabel) ? leafLabel : '';
}

/**
 * Point d'entrée UNIQUE de la navigation : résout n'importe quel data-grpid (section de premier
 * niveau ou feuille) vers le panneau réellement à afficher, applique tous les effets de bord
 * (auth, socket join/leave, fermeture des formulaires d'édition volet/groupe...), synchronise
 * la sidebar/les onglets/les sous-onglets, puis reflète le résultat dans le hash de l'URL.
 * Remplace les anciens syncNavigationState()/selectTab()/setHomePanel()/_executeOpenConfig().
 * @param {string} grpid - data-grpid ciblé (section ou feuille)
 * @param {{updateHash?: boolean}} opts - updateHash=false quand l'appel provient déjà du hash
 *        (hashchange ou restauration au chargement), pour ne pas re-déclencher le routeur.
 * @returns {string} le slug résolu (utile pour la restauration initiale via replaceState)
 */
function activateGrpid(grpid, { updateHash = true } = {}) {
    // Le Wizard reste seul maître de l'affichage tant qu'il n'est pas terminé/ignoré (mode AP) :
    // aucune navigation ne doit pouvoir le faire disparaître derrière le tableau de bord -- ni la
    // restauration de route au chargement (init(), qui appelle toujours activateGrpid une fois,
    // hash ou pas), ni un hashchange, ni un lien resté cliquable quelque part. onboarding.relaunch()
    // ne passe pas par ici et n'est donc pas concerné.
    if (isApMode && !window.__onboardingDone) return 'dashboard';
    if (!grpid || !get(grpid)) grpid = 'divHomePnl';
    const leafId = _resolveDefaultChild(grpid);
    const topId = (leafId === 'divHomePnl') ? 'divHomePnl' : (ROUTE_LEAF_PARENT[leafId] || leafId);
    const isDashboard = (topId === 'divHomePnl');

    // Garde d'authentification : reproduit le comportement historique (setConfigPanel/afterlogin)
    // avant toute bascule DOM, pour qu'un lien profond (#schedules) demande bien un login au lieu
    // de l'exposer silencieusement.
    if (!isDashboard && typeof security !== 'undefined' && !security.authenticated && security.type !== 0) {
        get('divContainer').addEventListener('afterlogin', () => {
            if (security.authenticated) activateGrpid(grpid, { updateHash });
        }, { once: true });
        security.authUser();
        return ROUTE_SLUGS[leafId] || 'dashboard';
    }

    clearOverlays();

    if (isDashboard) {
        if (typeof security !== 'undefined' && security.type !== 0 && !security.authenticated) {
            const configOnly = (security.permissions & 0x01) === 0x01;
            if (!configOnly) {
                // Sécurité complète : le dashboard exige aussi une authentification.
                security.authUser();
                return 'dashboard';
            }
            // Sécurité "config only" : le dashboard reste public, on referme l'écran de login s'il est affiché.
            get('divUnauthenticated').style.display = 'none';
            get('divAuthenticated').style.display = '';
        }
        const divCfg = get('divConfigPnl'), header = get('appHeader');
        // Pas de "divHome.style.display = ''" forcé ici (contrairement à avant) : tant que les
        // données n'ont pas encore été chargées (somfy.dataLoaded), on ne sait pas encore s'il
        // faut afficher le dashboard (avec ou sans la colonne Équipements/Groupes) ou divGetStarted
        // -- forcer divHomePnl visible ici l'exposait, vide, pendant la fenêtre de chargement,
        // avant que checkEmptyState() ci-dessous ne le recache pour laisser place à divGetStarted.
        // checkEmptyState() est seul responsable de l'affichage de divHomePnl (cf. son
        // "divHomePnl.style.display = ..." ci-dessous), qu'il tourne tout de suite (données déjà
        // chargées) ou plus tard, une fois somfy.dataLoaded passé à true.
        if (header) header.style.display = '';
        if (divCfg) divCfg.style.display = 'none';
        somfy.checkEmptyState();
        if (sockIsOpen) socket.send('leave:0');
        general.setSecurityConfig({ type: 0, username: '', password: '', pin: '', permissions: 0 });
        somfy.showEditShade(false);
        somfy.showEditGroup(false);

        // Sidebar : le dashboard est une section de premier niveau à part (pas un vrai
        // data-grpid de .submenu), mais elle doit quand même recevoir .active comme les
        // autres -- sinon aucune entrée de la sidebar n'apparaît sélectionnée sur le dashboard.
        document.querySelectorAll('.nav-item[data-grpid]').forEach(i => i.classList.toggle('active', i.getAttribute('data-grpid') === 'divHomePnl'));
        document.querySelectorAll('.nav-group .submenu').forEach(s => { s.style.display = 'none'; });
        document.querySelectorAll('.sub-nav-item[data-grpid]').forEach(i => i.classList.remove('active'));

        _updateBreadcrumb('divHomePnl', null);
    } else {
        const wasClosed = window.getComputedStyle(get('divConfigPnl')).display === 'none';
        const divCfg = get('divConfigPnl'), divHome = get('divHomePnl'), header = get('appHeader');
        if (divHome) divHome.style.display = 'none';
        if (header) header.style.display = 'none';
        if (divCfg) divCfg.style.display = '';
        somfy.checkEmptyState();

        if (wasClosed) {
            if (sockIsOpen) socket.send('join:0');
            let overlay = ui.waitMessage(get('divSystemOptions'));
            if (overlay) {
                overlay.style.borderRadius = '5px';
                getJSON('/getSecurity', (err, sec) => {
                    overlay.remove();
                    if (err) ui.serviceError(err);
                    else general.setSecurityConfig(sec);
                });
            }
        }

        if (topId !== 'divSomfySettings' && typeof somfy !== 'undefined') {
            somfy.showEditShade(false);
            somfy.showEditGroup(false);
        }
        if (topId === 'divNetworkSettings' && typeof wifi !== 'undefined') wifi.loadNetwork();

        // Sections de premier niveau : sidebar (.nav-item + son .submenu) et onglets (.tab-container).
        document.querySelectorAll('.nav-item[data-grpid]').forEach(i => i.classList.toggle('active', i.getAttribute('data-grpid') === topId));
        document.querySelectorAll('.nav-group .submenu').forEach(s => {
            s.style.display = (s.previousElementSibling?.getAttribute('data-grpid') === topId) ? 'flex' : 'none';
        });
        document.querySelectorAll('.tab-container > span[data-grpid]').forEach(t => {
            const id = t.getAttribute('data-grpid');
            t.classList.toggle('selected', id === topId);
            const panel = get(id);
            if (panel) panel.style.display = (id === topId) ? '' : 'none';
        });

        // Sous-onglet réellement visible : sidebar (.sub-nav-item) et .subtab-container de la section active.
        document.querySelectorAll('.sub-nav-item[data-grpid]').forEach(i => i.classList.toggle('active', i.getAttribute('data-grpid') === leafId));
        document.querySelectorAll('.subtab-container > span[data-grpid]').forEach(t => {
            const id = t.getAttribute('data-grpid');
            t.classList.toggle('selected', id === leafId);
            const panel = get(id);
            if (panel) panel.style.display = (id === leafId) ? '' : 'none';
        });

        _updateBreadcrumb(topId, leafId);
        _mountMobileSubtab(topId);
    }

    const slug = ROUTE_SLUGS[leafId] || 'dashboard';
    currentSlug = slug;
    if (updateHash && location.hash.slice(1) !== slug) {
        isApplyingHash = true;
        location.hash = slug;
    }
    return slug;
}

// TEST navigation sticky mobile : .tab-container et le .subtab-container de la section active
// partagent désormais UN SEUL bloc sticky (#divMobileStickyNav, voir main.css) au lieu de deux
// position:sticky indépendants qui pouvaient se repeindre à des instants légèrement différents
// pendant le scroll (décalage visuel de 1-2px constaté en test). Chaque section garde son propre
// .subtab-container (identifié par un id stable, subtabContainer-<grpid>) : on le déplace dans le
// slot partagé -- appendChild() le détache automatiquement de son ancien parent, pas besoin de le
// replacer manuellement quand on quitte la section, il suffit de toujours le retrouver par id.
function _mountMobileSubtab(topId) {
    const slot = get('divMobileSubtabSlot');
    if (!slot) return;
    // Renvoie tout ce qui occupe déjà le slot vers sa section d'origine avant d'y déposer celui
    // de la section active : sans ça, les .subtab-container s'empileraient au fil des
    // navigations au lieu de n'en garder qu'un seul à la fois dans le bloc sticky.
    Array.from(slot.children).forEach(child => {
        const ownerGrpid = child.id.replace('subtabContainer-', '');
        const owner = get(ownerGrpid);
        if (owner) owner.prepend(child);
    });
    const subtab = get('subtabContainer-' + topId);
    if (subtab) slot.appendChild(subtab);
}

// Le tooltip d'uptime s'ouvre au :hover en CSS, ce qui suffit sur desktop. Sur tactile, :hover est
// à la fois imprévisible et collant (il reste actif après le toucher), d'où cette bascule explicite
// au clic sur la version mobile -- le CSS desktop reste inchangé.
function bindMobileUptimeTooltip() {
    const chip = get('mobileUptime');
    if (!chip) return;
    chip.addEventListener('click', (e) => {
        // Un clic DANS le tooltip (sélection de texte) ne doit pas le refermer.
        if (e.target.closest('.uptime-tooltip')) return;
        chip.classList.toggle('uptime-open');
    });
    // Refermeture au clic ailleurs, comme n'importe quel menu contextuel.
    document.addEventListener('click', (e) => {
        if (!chip.contains(e.target)) chip.classList.remove('uptime-open');
    });
}

// Popover de résumé des plannings (icône horloge des cartes volet/groupe du dashboard, cf.
// setShadesList/setGroupsList -- .schedule-indicator) : heure/jours/position au survol OU au clic
// (utile sur tactile, où le survol n'existe pas). Un seul élément partagé, ajouté au <body> et
// positionné en position:fixed à l'ouverture -- .somfyShadeCtl/.somfyGroupCtl ont overflow:hidden
// (coins arrondis des cartes), un popover enfant de l'icône y serait rogné dès qu'il dépasse la
// carte, d'où ce choix plutôt qu'un simple survol CSS comme .uptime-tooltip.
let scheduleIndicatorHideTimer = null;
function getScheduleIndicatorPopover() {
    let pop = get('scheduleIndicatorPopover');
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'scheduleIndicatorPopover';
        pop.className = 'schedule-popover';
        // Passer du bouton au popover (petit espace entre les deux) ne doit pas le refermer.
        pop.addEventListener('mouseenter', () => {
            if (scheduleIndicatorHideTimer) { clearTimeout(scheduleIndicatorHideTimer); scheduleIndicatorHideTimer = null; }
        });
        pop.addEventListener('mouseleave', () => hideScheduleIndicatorPopover());
        document.body.appendChild(pop);
    }
    return pop;
}
function hideScheduleIndicatorPopover() {
    const pop = get('scheduleIndicatorPopover');
    if (pop) { pop.classList.remove('open'); pop.removeAttribute('data-for'); }
}
function showScheduleIndicatorPopover(indicatorEl) {
    const targetType = indicatorEl.getAttribute('data-schedule-target');
    const targetId = parseInt(indicatorEl.getAttribute('data-schedule-id'), 10);
    if (!targetType || isNaN(targetId)) return;
    const pop = getScheduleIndicatorPopover();
    pop.innerHTML = somfy._buildScheduleTooltipHtml(targetType, targetId);
    pop.setAttribute('data-for', `${targetType}:${targetId}`);
    pop.classList.add('open');

    // Positionné au-dessus de l'icône par défaut (elle vit en pied de carte) ; bascule sous
    // l'icône si la carte est trop près du haut de la fenêtre pour laisser la place.
    const rect = indicatorEl.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    const maxLeft = window.innerWidth - popRect.width - margin;
    if (left > maxLeft) left = Math.max(margin, maxLeft);
    let top = rect.top - popRect.height - 10;
    if (top < margin) top = rect.bottom + 10;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
}
function bindScheduleIndicatorPopover() {
    // mouseover/mouseout (bubbles) plutôt que mouseenter/mouseleave (ne bubblent pas) : seule
    // façon de déléguer proprement depuis document sans rebinder à chaque reconstruction des
    // cartes (tri, drag & drop, changement de pièce...). Le garde e.relatedTarget évite de
    // rouvrir/refermer à chaque passage d'un enfant à l'autre (svg, use...) DANS la même icône.
    document.addEventListener('mouseover', (e) => {
        const el = e.target.closest('.schedule-indicator');
        if (!el || el.contains(e.relatedTarget)) return;
        if (scheduleIndicatorHideTimer) { clearTimeout(scheduleIndicatorHideTimer); scheduleIndicatorHideTimer = null; }
        showScheduleIndicatorPopover(el);
    });
    document.addEventListener('mouseout', (e) => {
        const el = e.target.closest('.schedule-indicator');
        if (!el || el.contains(e.relatedTarget)) return;
        scheduleIndicatorHideTimer = setTimeout(hideScheduleIndicatorPopover, 150);
    });
    document.addEventListener('click', (e) => {
        const el = e.target.closest('.schedule-indicator');
        if (!el) {
            if (!e.target.closest('#scheduleIndicatorPopover')) hideScheduleIndicatorPopover();
            return;
        }
        e.stopPropagation();
        const pop = get('scheduleIndicatorPopover');
        const key = `${el.getAttribute('data-schedule-target')}:${el.getAttribute('data-schedule-id')}`;
        if (pop && pop.classList.contains('open') && pop.getAttribute('data-for') === key) hideScheduleIndicatorPopover();
        else showScheduleIndicatorPopover(el);
    });
}
function bindNavigation() {
    document.querySelectorAll('.nav-item, .sub-nav-item, .tab-container > span, .subtab-container > span').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const grpid = item.getAttribute('data-grpid');
            if (grpid) confirmDiscardChanges(() => activateGrpid(grpid));
        });
    });
    window.addEventListener('hashchange', () => {
        // Le hashchange qu'on vient de déclencher nous-même (dans activateGrpid, ou le
        // rétablissement au chargement) ne doit pas relancer une seconde navigation ; celui
        // provoqué par le bouton Précédent/Suivant ou une saisie manuelle de l'URL, si.
        if (isApplyingHash) { isApplyingHash = false; return; }
        const targetSlug = location.hash.slice(1);
        if (isDirty) {
            // Un hashchange déjà survenu (Précédent/Suivant) ne peut pas être annulé : on
            // rétablit immédiatement l'URL affichée avant de demander confirmation ; si
            // l'utilisateur choisit de quitter sans enregistrer, on réapplique la cible voulue.
            isApplyingHash = true;
            location.hash = currentSlug;
            confirmDiscardChanges(() => activateGrpid(ROUTE_SLUG_TO_GRPID[targetSlug] || 'divHomePnl'));
            return;
        }
        const grpid = ROUTE_SLUG_TO_GRPID[targetSlug] || 'divHomePnl';
        activateGrpid(grpid, { updateHash: false });
    });
    // Fermeture d'onglet/fenêtre ou rechargement (F5) : déjà couvert par le listener 'beforeunload'
    // au niveau module (voir plus haut, juste après anyCriticalStepPending()) -- lui-même plus
    // complet (couvre aussi les procédures radio critiques en cours, pas seulement isDirty). Un
    // second listener identique-mais-incomplet avait été réintroduit ici par erreur (audit) sans
    // voir que l'original existait déjà ; supprimé plutôt que dupliqué.
}
function stepDeviceGpio(pinKey, direction, prefix, boardSelectId, isManualCallback, pinMaps) {
    const selBoard = get(boardSelectId);
    if (!selBoard) return;

    const isM = isManualCallback(parseInt(selBoard.value, 10));
    const el = get((isM ? 'input' : 'sel') + prefix + pinKey);
    if (!el) return;

    let newValue;

    if (isM) {
        let current = parseInt(el.value, 10);
        if (isNaN(current)) current = 0;

        let next = current + direction;
        const cm = (get('divContainer').getAttribute('data-chipmodel') || "").toLowerCase();
        const pm = pinMaps.find(x => x.name === cm) || { maxPins: 39 };

        if (next < 0 || next > pm.maxPins) return;

        el.value = next;
        newValue = next;

        const selPin = get(`sel${prefix}${pinKey}`);
        if (selPin) selPin.value = next;
    } else {
        const nextIndex = el.selectedIndex + direction;
        if (nextIndex < 0 || nextIndex >= el.options.length) return;

        el.selectedIndex = nextIndex;
        newValue = el.value;

        const inpP = get(`input${prefix}${pinKey}`);
        if (inpP) inpP.value = newValue;
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));

    return newValue;
}

// --- Champs de secret (mot de passe/PIN) : le serveur ne renvoie jamais la valeur réelle, juste
// un booléen "défini/pas défini". Ces helpers affichent un masque factice (des puces) quand un
// secret existe déjà, le font disparaître dès que l'utilisateur interagit avec le champ pour
// saisir une nouvelle valeur, et permettent de distinguer "toujours factice" (= non modifié) de
// "réellement saisi" au moment de la sauvegarde — sans jamais confondre les puces factices avec
// une vraie valeur à envoyer au serveur.
const SECRET_DUMMY_CHAR = '•';
const SECRET_DUMMY_TEXT = SECRET_DUMMY_CHAR.repeat(10);

function initSecretField(input, hasValue) {
    if (!input) return;
    const eye = input.parentElement ? input.parentElement.querySelector('.password-eye') : null;
    const showDummy = () => {
        input.value = SECRET_DUMMY_TEXT;
        input.dataset.secretDummy = 'true';
        if (eye) eye.style.display = 'none';
    };
    const reveal = () => {
        if (input.dataset.secretDummy === 'true') {
            input.value = '';
            input.dataset.secretDummy = 'false';
            if (eye) eye.style.display = '';
        }
    };
    input.dataset.hadValue = hasValue ? 'true' : 'false';
    if (hasValue) showDummy();
    else {
        input.value = '';
        input.dataset.secretDummy = 'false';
        if (eye) eye.style.display = '';
    }
    input.addEventListener('focus', reveal);
    input.addEventListener('input', reveal);
    input.addEventListener('blur', () => {
        // L'utilisateur a révélé le champ (masque effacé) mais l'a quitté sans rien saisir :
        // on remet le masque factice plutôt que de laisser un champ vide trompeur.
        if (input.dataset.hadValue === 'true' && input.dataset.secretDummy === 'false' && input.value === '') {
            showDummy();
        }
    });
}
// Valeur réelle d'un champ secret : chaîne vide tant que le masque factice n'a pas été effacé,
// même si l'utilisateur n'a jamais cliqué dedans (ex: sauvegarde sans avoir touché au champ).
function secretValue(input) {
    if (!input) return '';
    return input.dataset.secretDummy === 'true' ? '' : input.value;
}
function initSecretPinGroup(inputs, hasValue) {
    const list = Array.from(inputs || []);
    if (list.length === 0) return;
    const hadValue = !!hasValue;
    const showDummy = () => {
        list.forEach(inp => { inp.value = SECRET_DUMMY_CHAR; inp.dataset.secretDummy = 'true'; });
    };
    const reveal = () => {
        if (list[0].dataset.secretDummy === 'true') {
            // On efface les 4 cases ensemble (un PIN se ressaisit en entier), sans voler le focus
            // à la case que l'utilisateur vient de cliquer.
            list.forEach(inp => { inp.value = ''; inp.dataset.secretDummy = 'false'; });
        }
    };
    list.forEach(inp => {
        inp.value = hasValue ? SECRET_DUMMY_CHAR : '';
        inp.dataset.secretDummy = hasValue ? 'true' : 'false';
        inp.addEventListener('focus', reveal);
        inp.addEventListener('blur', () => {
            // On laisse le temps au focus de se poser sur la case suivante/précédente du même
            // groupe (tabulation interne) avant de juger que l'utilisateur a quitté le PIN entier.
            setTimeout(() => {
                const stillInGroup = list.includes(document.activeElement);
                const allEmpty = list.every(i => i.value === '');
                if (!stillInGroup && hadValue && list[0].dataset.secretDummy === 'false' && allEmpty) {
                    showDummy();
                }
            }, 0);
        });
    });
}
function secretPinValue(inputs) {
    const list = Array.from(inputs || []);
    if (list.length === 0 || list[0].dataset.secretDummy === 'true') return '';
    return list.map(inp => inp.value || '').join('');
}

function modalHeader(title, icon = 'svg-simpleShutter', options = {}) {
    const subtitle = options.subtitle ? `<span class="modalHeader-subtitle">${tr(options.subtitle) || options.subtitle}</span>` : '';
    const rightContent = options.rightContent || '';

    // Les types restent sous la forme 'header-danger' ou 'header-small'
    const headerTypeClass = options.type ? options.type.split(' ').map(t => `header-${t}`).join(' ') : '';

    return `
    <!-- Poignée visible uniquement sur Mobile -->
    <div class="modalHeader-handle" onclick="handleMobileDismiss(this)"></div>

    <div class="modalHeader ${headerTypeClass}">
    <div class="modalHeader-block">
    <!-- Badge Icône Premium -->
    <div class="modalHeader-badge">
    <svg><use href="#${icon}"></use></svg>
    </div>

    <!-- Bloc Textes (Titre + Sous-titre facultatif) -->
    <div class="modalHeader-texts">
    <span class="modalHeader-title">${tr(title) || title}</span>
    ${subtitle}
    </div>
    </div>

    <!-- Contenu additionnel à droite -->
    <div class="modalHeader-right">${rightContent}</div>
    </div>`;
}

function overlayHeader(title, desc, icon = 'svg-simpleShutter', options = {}) {
    if (typeof options === 'boolean') {
        options = { showExpert: options };
    }

    const subtitle = options.subtitle ? `<span class="overlayHeader-subtitle">${tr(options.subtitle) || options.subtitle}</span>` : '';
    const showInfo = options.showInfo !== undefined ? options.showInfo : true;
    const showExpert = options.showExpert || false;

    // Échappement en 2 temps : d'abord pour le contexte chaîne JS (apostrophe, délimiteur utilisé
    // ci-dessous), PUIS pour le contexte attribut HTML (onclick="..." est délimité par des
    // guillemets doubles -- un ' échappé ne protège en rien contre un " dans title/desc, qui
    // casserait l'attribut). Sans impact aujourd'hui (les appelants ne passent que des clés de
    // traduction statiques, jamais de texte utilisateur), corrigé par audit : l'échappement
    // protégeait contre le mauvais caractère pour ce contexte.
    const escJsString = s => (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escHtmlAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const safeTitle = escHtmlAttr(escJsString(title));
    const safeDesc = escHtmlAttr(escJsString(desc));

    const infoAction = `(typeof ui !== 'undefined' && ui.infoMessage) ? ui.infoMessage('${safeTitle}', '${safeDesc}') : infoMessage('${safeTitle}', '${safeDesc}');`;

    let actionHTML = '';

    if (showExpert) {
        actionHTML = `
        <div class="overlayHeader-dropdown-container">
        <button type="button" class="overlayHeader-btn-action" title="Options" onclick="
        event.stopPropagation();
        const menu = this.nextElementSibling;
        const isExp = (typeof ui !== 'undefined' && ui) ? ui.isExpertMode : false;

        const optExp = menu.querySelector('.opt-expert');
        const optNorm = menu.querySelector('.opt-normal');

        // On réinitialise et on applique .active sur le BON bouton uniquement
        if (optExp && optNorm) {
            optExp.classList.remove('active');
            optNorm.classList.remove('active');
            if (isExp) {
                optExp.classList.add('active');
            } else {
                optNorm.classList.add('active');
            }
        }

        menu.classList.toggle('show');
        ">
        <svg><use href="#svg-menuVertical"></use></svg>
        </button>
        <div class="overlayHeader-dropdown-menu">
        ${showInfo ? `<div class="dropdown-item" onclick="this.parentElement.classList.remove('show'); ${infoAction}"><svg><use href="#svg-info"></use></svg> Information</div>` : ''}

        <div class="dropdown-item opt-expert" onclick="
        this.parentElement.classList.remove('show');
        if(typeof ui !== 'undefined' && ui && !ui.isExpertMode) {
            ui.toggleExpertMode(this.closest('.inst-overlay, .modal-overlay'));
        }
        ">
        <svg><use href="#svg-check"></use></svg> Mode Expert
        </div>

        <div class="dropdown-item opt-normal" onclick="
        this.parentElement.classList.remove('show');
        if(typeof ui !== 'undefined' && ui && ui.isExpertMode) {
            ui.toggleExpertMode(this.closest('.inst-overlay, .modal-overlay'));
        }
        ">
        <svg><use href="#svg-close"></use></svg> Mode Simple Utilisateur
        </div>
        </div>
        </div>`;
    } else if (showInfo) {
        actionHTML = `
        <button type="button" class="overlayHeader-btn-action" title="Aide" onclick="${infoAction}">
        <svg><use href="#svg-info"></use></svg>
        </button>`;
    }

    return `
    <div class="overlayHeader">
    <div class="overlayHeader-block">
    <div class="overlayHeader-badge">
    <svg><use href="#${icon}"></use></svg>
    </div>
    <div class="overlayHeader-texts">
    <span class="overlayHeader-title">${tr(title) || title}</span>
    ${subtitle}
    </div>
    </div>
    <div class="overlayHeader-right">
    ${actionHTML}
    <div close onclick="closeOverlay(this.closest('.inst-overlay, .modal-overlay'))">
    <svg><use href="#svg-closeOverlay"></use></svg>
    </div>
    </div>
    </div>`;
}

// Écouteur global pour fermer les menus déroulants lors d'un clic extérieur
document.addEventListener('click', () => {
    document.querySelectorAll('.overlayHeader-dropdown-menu.show').forEach(menu => menu.classList.remove('show'));
});

function wizardStepper(stepsData, translationPrefix) {
    let stepsHtml = '';
    let titlesHtml = '';

    const isArray = Array.isArray(stepsData);
    const totalSteps = isArray ? stepsData.length : stepsData;

    for (let i = 1; i <= totalSteps; i++) {
        stepsHtml += `<div class="stepper-item" data-stepid="${i}"><div class="step-counter">${i}</div></div>`;

        let titleKey;
        if (isArray) {
            titleKey = stepsData[i - 1];
        } else {
            titleKey = `${translationPrefix}_STEP${i}`;
        }
        titlesHtml += `<h3 class="step-title wizard-step" data-stepid="${i}">${tr(titleKey)}</h3>`;
    }
    return `
    <div class="stepper-wrapper" style="--steps: ${totalSteps};">
    ${stepsHtml}
    </div>
    <div class="step-title-container">
    ${titlesHtml}
    </div>`;
}

function toggleTooltip(el) {
    const tooltip = el.querySelector('.tooltip-text');
    const isVisible = tooltip.style.display === 'block';

    document.querySelectorAll('.tooltip-text').forEach(t => t.style.display = 'none');
    tooltip.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
        setTimeout(() => {
            window.addEventListener('click', function closeMenu() {
                tooltip.style.display = 'none';
                window.removeEventListener('click', closeMenu);
            }, { once: true });
        }, 10);
    }
}
async function reopenSocket() {
    if (tConnect) clearTimeout(tConnect);
    tConnect = null;
    await initSockets();
}
async function init() {
    await security.init();
    general.init();
    wifi.init();
    somfy.init();
    mqtt.init();
    firmware.init();


    bindNavigation();
    bindMobileUptimeTooltip();
    bindScheduleIndicatorPopover();
    // Restaure la route depuis le hash de l'URL au chargement (deep-link direct ou F5) ; par
    // défaut le Dashboard si absent/inconnu. replaceState (réécriture manuelle ci-dessous) pour
    // ne pas ajouter une entrée d'historique superflue au tout premier chargement.
    const initialGrpid = ROUTE_SLUG_TO_GRPID[location.hash.slice(1)] || 'divHomePnl';
    const resolvedSlug = activateGrpid(initialGrpid, { updateHash: false });
    if (location.hash.slice(1) !== resolvedSlug) {
        history.replaceState(null, '', location.pathname + location.search + '#' + resolvedSlug);
    }

    // En sécurité complète, le préchargement initial (socket.onopen) saute général/somfy/réseau/MQTT
    // tant que l'utilisateur n'est pas authentifié (le serveur les protège désormais). On les
    // recharge donc dès qu'une connexion réussit, sinon le dashboard et les réglages resteraient
    // vides après un login sans rechargement de page.
    get('divContainer').addEventListener('afterlogin', (evt) => {
        if (!evt.detail || !evt.detail.authenticated || !sockIsOpen) return;
        (async () => {
            await general.loadGeneral();
            await wifi.loadNetwork();
            await somfy.loadSomfy();
            await mqtt.loadMQTT();
        })();
    });
}
