// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
// --- MODE TEST OTA (design des barres de progression) ---
// A repasser a false avant tout commit/prod : quand true, le clic sur "btnUpdate" (apres
// confirmation du prompt, cf. confirmInstallGitRelease()) ne télécharge ni n'envoie rien, ni
// firmware.backup(). Il se contente d'afficher l'ecran de progression (installGitRelease) avec
// les barres figees a DEBUG_FAKE_OTA_PCT%, sans verrou 'hard' -- l'overlay reste fermable en
// cliquant hors de la modale (pas de [close]/poignee mobile sur cet ecran, cf.
// renderGitInstallProgress()).
const DEBUG_FAKE_OTA = false;
const DEBUG_FAKE_OTA_PCT = 60;

class Firmware {
    initialized = false;
    init() {
        this.initialized = true;
        // Rotation du téléphone ou redimensionnement de la fenêtre : la largeur disponible change,
        // donc la taille calculée par fitFileName() ne vaut plus. Écouteur posé une fois pour
        // toutes plutôt qu'à l'ouverture de l'overlay -- il n'a pas de cible à traiter en dehors
        // de sa durée de vie, et il n'y a ainsi rien à retirer quand l'overlay est détruit.
        window.addEventListener('resize', () => this.fitFileName());
    }
    isMobile() {
        return /Android|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent);
    }
    async backup() {
        let overlay = ui.waitMessage(get('divContainer'));
        return await new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.responseType = 'blob';
            xhr.onreadystatechange = (evt) => {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    let obj = window.URL.createObjectURL(xhr.response);
                    var link = document.createElement('a');
                    document.body.appendChild(link);
                    let header = xhr.getResponseHeader('content-disposition');
                    let fname = 'backup';
                    if (typeof header !== 'undefined') {
                        let start = header.indexOf('filename="');
                        if (start >= 0) {
                            let length = header.length;
                            fname = header.substring(start + 10, length - 1);
                        }
                    }
                    logger.debug('Backup file downloaded:', fname);
                    link.setAttribute('download', fname);
                    link.setAttribute('href', obj);
                    link.click();
                    link.remove();
                    setTimeout(() => { window.URL.revokeObjectURL(obj); }, 0);
                }
            };
            xhr.onload = (evt) => {
                if (typeof overlay !== 'undefined') overlay.remove();
                let status = xhr.status;
                if (status !== 200) {
                    let err = xhr.response || {};
                    err.htmlError = status;
                    err.service = `GET /backup`;
                    if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
                    logger.error('Backup download failed:', err);
                    reject(err);
                }
                else {
                    resolve();
                }
            };
            xhr.onerror = (evt) => {
                if (typeof overlay !== 'undefined') overlay.remove();
                let err = {
                    htmlError: xhr.status || 500,
                    service: `GET /backup`
                };
                if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
                logger.error('Backup request failed:', err);
                reject(err);
            };
            xhr.onabort = (evt) => {
                if (typeof overlay !== 'undefined') overlay.remove();
                // `status` (sans préfixe) n'existe pas ici : c'est une variable locale à
                // xhr.onload (une fonction différente), pas une variable de la portée englobante
                // -- la référencer levait un ReferenceError et laissait la Promise ni résolue ni
                // rejetée (firmware.backup() restait bloquée indéfiniment sur un abandon réel).
                reject({ htmlError: xhr.status || 500, service: 'GET /backup' });
            };
            xhr.open('GET', baseUrl.length > 0 ? `${baseUrl}/backup` : '/backup', true);
            // /backup est une route de CONFIGURATION (isAuthenticated(request, true)) : sans cet
            // en-tête, elle répond 401 dès qu'un PIN ou un mot de passe est configuré. C'était le
            // seul XHR du projet à ne pas le poser -- invisible tant que la sécurité restait sur
            // None (checkAuth laisse alors tout passer), mais bloquant sur le chemin d'installation
            // OTA, qui commence par `await firmware.backup()` : la promesse était rejetée et la
            // mise à jour s'interrompait avant d'avoir commencé.
            xhr.setRequestHeader('apikey', (typeof security !== 'undefined' ? security.apiKey : '') || '');
            xhr.send();
        });
    }

    restore() {
        let div = this.createFileUploader('/restore');
        let instContent = div.querySelector('.instructions-content');
        //[id, bind, texte, checked]
        const opts = [
            ['cbRestoreShades', 'shades', 'RESTORE_DEVICES_GROUPS', 1],
            ['cbRestoreRepeaters', 'repeaters', 'RESTORE_REPEATERS', 0],
            ['cbRestoreListeners', 'listeners', 'RESTORE_LISTENERS', 0],
            ['cbRestoreSystem', 'settings', 'RESTORE_SYSTEM_SETTINGS', 0],
            ['cbRestoreNetwork', 'network', 'RESTORE_NETWORK_SETTINGS', 0],
            ['cbRestoreMQTT', 'mqtt', 'RESTORE_MQTT_SETTINGS', 0],
            ['cbRestoreTransceiver', 'transceiver', 'RESTORE_RADIO_SETTINGS', 0]
        ];

        let html = opts.map(o => `
        <label class="uniRow dirty-target">
        <div class="uniLabel">${tr(o[2])}</div>
        <div class="uniRight">
        <span class="switch">
        <input id="${o[0]}" type="checkbox" data-bind="${o[1]}" ${o[3]?'checked':''}>
        <div></div>
        </span>
        </div>
        </label>`).join('');

        let divInstText = div.querySelector('#divInstText');
        if (divInstText) {
            divInstText.innerHTML = `
            <div class="uniblocStep"><div>${tr('RESTORE_SELECT_FILE')}</div></div>
            <div id="jsUniRestore" class="uniblocCol">${html}</div>`;
        }
        instContent.insertAdjacentHTML('afterbegin', overlayHeader('RESTORE_TITLE', 'RESTORE_DESC', 'svg-restore', { subtitle: 'RESTORE_DESC' }));

        shOverlay(div);
    }


    // Nom de l'asset de release attendu par CET appareil, décomposé en trois morceaux pour
    // l'affichage : ce qui précède, ce qui l'identifie, ce qui suit.
    // Le morceau qui identifie le matériel n'est plus RECONSTITUÉ ici : il vient du firmware, seul
    // endroit où la convention de nommage est définie (FwInfo::boardToken). Ce bloc en
    // tenait auparavant un miroir -- une table `boards` de correspondance puce -> suffixe -- et ce
    // miroir avait divergé : le C6 n'y figurait pas, si bien qu'un C6 se voyait annoncer
    // "..._firmware_esp32.bin", une image Xtensa qui n'y démarrerait jamais. Ne pas réintroduire
    // cette table : la variante d'image (cf. FW_ASSET_VARIANT) s'y perdrait de la même façon.
    assetNameParts() {
        const cont = get('divContainer');
        const profile = (cont.getAttribute('data-hardwareprofile') || '').toUpperCase();
        // Le profil ne compose plus aucun nom (le jeton du firmware porte déjà le suffixe de
        // boîtier) : il ne sert qu'à `box`, qui choisit un paragraphe d'aide.
        const box = profile === 'BOX-ETH' || profile === 'BOX-WIFI';
        return { middle: '_firmware_', device: cont.getAttribute('data-assetdevice') || '', box: box };
    }

    // Le nom du fichier attendu, surligné sur la partie qui identifie le matériel. Ce bloc n'est
    // PAS une étape : c'est un fait sur l'appareil, au même titre que la version installée, d'où
    // sa place dans #divInstText au-dessus du filet qui ouvre la procédure. Il y gagne aussi
    // toute la largeur de la fenêtre -- dans une étape, le rail des numéros lui en retirait 60px,
    // de quoi replier le nom sur deux lignes sur un téléphone.
    fileIdCard() {
        const p = this.assetNameParts();
        const device = p.device ? `<span class="fw-you">${p.device}</span>` : '';
        // Le tooltip est COMPOSÉ, pas choisi : data-tooltip-tr accepte plusieurs clés et les
        // assemble en paragraphes (cf. showAppTooltip(), 20-shell.js). Chaque paragraphe n'est
        // donc présent que s'il a quelque chose à dire à CE lecteur -- l'avertissement sur les
        // boîtiers n'apparaît que sur un boîtier, et le paragraphe du surlignage laisse la place
        // à son contraire quand il n'y a rien à surligner.
        const tips = ['FIRMWARE_MA_FILE_TOOLTIP_VERSION'];
        tips.push(p.device ? 'FIRMWARE_MA_FILE_TOOLTIP_GREEN' : 'FIRMWARE_MA_FILE_TOOLTIP_ANYBOARD');
        tips.push('FIRMWARE_MA_FILE_TOOLTIP_KIND_FW');
        if (p.box) tips.push('FIRMWARE_MA_FILE_TOOLTIP_BOX');
        return `
        <div class="fw-band fw-id">
        <div class="fw-band-label">
        <span>${tr('FIRMWARE_MA_FILE_FOR_DEVICE')}</span>
        <div class="help-container" data-tooltip-title-tr="FIRMWARE_MA_FILE_TOOLTIP_TITLE" data-tooltip-tr="${tips.join(',')}">
        <svg class="help-svg"><use href="#icon-question"></use></svg>
        </div>
        </div>
        <div class="fw-id-name"><span class="fw-lit">ESPSomfyRTS_</span><span class="fw-ver">${tr('FIRMWARE_MA_FILE_TOK_VERSION')}</span><span class="fw-lit">${p.middle}</span>${device}<span class="fw-lit">.bin</span></div>
        </div>`;
    }

    // Le nom doit tenir sur UNE ligne : replié sur deux, il cesse de se lire comme un nom de
    // fichier et le repère visuel du surlignage se disloque. Mieux vaut donc un texte plus petit
    // qu'un texte replié. Aucune règle CSS ne peut le garantir : la largeur dépend du modèle de
    // puce, qui varie d'un appareil à l'autre (42 caractères sur un ESP32-C3, 49 sur un boîtier
    // BOX-wifi), et la chasse réelle dépend de la fonte à chasse fixe que le système fournit.
    // On mesure donc une fois l'overlay posé, puis on réduit d'exactement ce qu'il faut.
    // Le plancher de 8px n'est là que par prudence : au pire nom connu il couvre les écrans
    // jusqu'à environ 250px de large, très en deçà de tout matériel réel.
    fitFileName(root) {
        const el = (root || document).querySelector('.fw-id-name');
        if (!el) return;
        el.style.fontSize = '';
        // Quand le nom tient déjà, scrollWidth vaut EXACTEMENT clientWidth : le test doit donc
        // porter sur l'égalité stricte, sans marge, sinon toute taille est rabotée d'un cran pour
        // rien. La marge d'un pixel n'intervient qu'au calcul, où elle absorbe l'arrondi entier
        // de scrollWidth et les sous-pixels de la mise en page.
        const avail = el.clientWidth, natural = el.scrollWidth;
        if (avail <= 0 || natural <= avail) return;
        const base = parseFloat(getComputedStyle(el).fontSize) || 13;
        el.style.fontSize = Math.max(8, Math.floor(base * (avail - 1) / natural * 10) / 10) + 'px';
    }

    createFileUploader(service) {
        const isRestore = service === '/restore', isMob = this.isMobile(), div = document.createElement('div');
        const pickKey = isRestore ? 'FILE_PICK_BACKUP' : 'FILE_PICK_FIRMWARE';
        div.id = 'divUploadFile';
        // no-feedback : pas d'animation/retour souhaité pendant un flux d'upload/restauration
        // firmware -- un enfoncement/flash sur les boutons pendant cette opération sensible
        // serait plus distrayant qu'utile.
        div.className = 'inst-overlay no-feedback';

        const step = (n, content, hide = false) => hide ? '' : `
        <div class="v-step-item">
        <div class="v-step-left"><div class="step-counter">${n}</div><div class="v-step-line"></div></div>
        <div class="v-step-right"><div>${content}</div></div>
        </div>`;

        div.innerHTML = `
        <div class="instructions-content UploadFile-content">
        <div class="overlay-scroll-content">
        <form method="POST" action="#" enctype="multipart/form-data" id="frmUploadApp">
        <div id="divInstText"></div>
        <div class="vertical-steps-container">
        ${step(1, `
        <div>${tr('FIRMWARE_MA_UPDATE_GET_FILE')}</div>
        <a href="https://github.com/xkain/TESTRTS/releases" target="_blank" class="link" style="display:block; margin-top:5px;">${tr('FIRMWARE_MA_UPDATE_FROM_GITHUB')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a>
        `, isRestore)}
        <div class="v-step-item ${isRestore ? '' : 'has-extra-content'}" style="${isRestore ? 'height:auto;margin:0' : ''}">
        <div class="v-step-left" style="${isRestore ? 'display:none' : ''}">
        <div class="step-counter">2</div><div class="v-step-line"></div>
        </div>
        <div class="v-step-right" style="${isRestore ? 'padding-left:0;height:auto' : ''}">
        <input id="fileName" type="file" name="updateFS" style="display:none"
        onchange="const f=this.files[0];if(f){get('span-selected-file').innerText=f.name;firmware.checkBackupVersion(f)}"/>
        ${fileDropZone('fileName', pickKey, 'span-selected-file')}
        </div>
        </div>
        <div class="v-step-item" style="${isRestore ? 'display:none' : ''}">
        <div class="v-step-left"><div class="step-counter">3</div></div>
        <div class="v-step-right"><div>${tr('FIRMWARE_MA_UPDATE_VERIFY_0')} <svg class="svgInText"><use href="#svg-save"></use></svg> ${tr('FIRMWARE_MA_UPDATE_VERIFY_1')}</div></div>
        </div>
        </div>

        <div class="warning" style="${isRestore ? 'margin-top:0' : 'display:none'}">
        <div class="warning-header">
        <svg><use href="#svg-warning"></use></svg>
        <b>${tr('MSG_ALERT')}</b>
        </div>
        <div class="information-text">
        <span>${tr('RESTORE_NETWORK_WARNING')}</span>
        </div>
        </div>

        <div id="divFileUploadProgress" style="display:none;margin:15px 0">
        <div class="progress-bar-header"><span class="progress-bar-label"></span><span class="progress-bar-value" id="progFileUpload-value">0%</span></div>
        <div class="progress-bar" id="progFileUpload"><div class="progress-bar-fill"></div></div>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay"><div class="footer-sticky-content">
        <div class="uniRow backup-row" style="${isRestore ? 'display:none' : ''}">
        <div class="uniText">
        <span class="uniLabel">${tr('FIRMWARE_MT_SAVE_BACKUP')}</span>
        <span class="uniStatus">${tr(isMob ? 'FIRMWARE_MT_SAVE_BACKUP_DESC_MOB' : 'FIRMWARE_MT_SAVE_BACKUP_DESC')}</span>
        </div>
        <div id="btnBackupCfg" class="gitBackup" onclick="firmware.backup()"><svg><use href="#svg-save"></use></svg></div>
        </div>
        <!-- Remplace la ligne de sauvegarde ci-dessus une fois le transfert lancé (cf.
             firmware.uploadFile()) : le verrou 'hard' posé sur l'overlay à cet instant empêche déjà
             toute fermeture réelle (requestCloseOverlay() ne fait plus qu'un flash visuel), inutile
             donc de laisser "Annuler" affiché -- ce texte réutilise les mêmes clés que le message de
             ce verrou (setOverlayLock plus bas), déjà pensées pour prévenir de ne pas fermer la page
             ni débrancher l'appareil pendant une installation/restauration OTA. -->
        <div id="divUploadInProgressNotice" class="warning" style="display:none">
        <div class="warning-header">
        <svg><use href="#svg-warning"></use></svg>
        <b>${tr(isRestore ? 'PROMPT_RESTORE_IN_PROGRESS_TITLE' : 'PROMPT_UPDATE_IN_PROGRESS_TITLE')}</b>
        </div>
        <div class="information-text">
        <span>${tr(isRestore ? 'PROMPT_RESTORE_IN_PROGRESS_MSG' : 'PROMPT_UPDATE_IN_PROGRESS_MSG')}</span>
        </div>
        </div>
        <div class="button-container-row">
        <button id="btnClose" line type="button" onclick="requestCloseOverlay(get('divUploadFile'))">${tr('BT_CANCEL_1')}</button>
        <button id="btnUploadFile" type="button" onclick="firmware.uploadFile('${service}',get('divUploadFile'),ui.fromElement(get('divUploadFile')))">${tr('BT_UPLOAD_FILE')}</button>
        </div>
        </div></div>
        </form>
        </div>
        </div>`;

        return div;
    }
    checkBackupVersion(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split('\n');
            if (lines.length > 0) {
                const ver = parseInt(lines[0].split(',')[0]);
                if (!isNaN(ver) && ver < 25) {
                    let prompt = ui.promptMessage(tr('PROMPT_RESTORE_FILE_TITLE'), () => closeOverlay(prompt));

                    prompt.querySelector('.sub-message').innerHTML = `<p style="color:var(--color-warning); font-weight:bold;"><p>${tr('PROMPT_RESTORE_FILE_DESC')}</p><p><b>${tr('PROMPT_RESTORE_FILE_DESC_1')}</b></p><p>${tr('PROMPT_RESTORE_FILE_DESC_2')}</p>`;

                    const btnCan = prompt.querySelector('button[line]');
                    if (btnCan) {
                        btnCan.onclick = () => {
                            get('fileName').value = "";
                            get('span-selected-file').innerText = tr('FILE_PICK_BACKUP');
                            closeOverlay(prompt);
                        };
                    }
                }
            }
        };
        reader.readAsText(file.slice(0, 100));
    }
    procMemoryStatus(mem) {
        // Le firmware envoie des OCTETS (ESP.getFreeHeap() et compagnie, cf. NetManager::emitHeap).
        // La conversion se fait ici plutôt que de corriger les étiquettes, parce que des
        // kilo-octets sont ce qu'on veut lire sur cette carte -- les octets exacts restent
        // disponibles sur /discovery pour un diagnostic fin.
        const ko = (v) => (typeof v === 'number' ? (v / 1024).fmt('#,##0.0') : '--');
        let sp = get('spanFreeMemory');
        if (sp) sp.innerHTML = ko(mem.free) + ' ';
        sp = get('spanMaxMemory');
        if (sp) sp.innerHTML = ko(mem.max) + ' ';
        sp = get('spanMinMemory');
        if (sp) sp.innerHTML = ko(mem.min) + ' ';

        // --- MISE À JOUR DU CERCLE RAM VIA BACKGROUND DIRECT ---
        if (mem && mem.free) {
            const totalRam = mem.total ? mem.total : 265672;
            const ramUsedPct = Math.min(100, Math.max(0, Math.round(((totalRam - mem.free) / totalRam) * 100)));

            const cRam = get('circle-ram');
            if (cRam) {
                cRam.style.background = `conic-gradient(#3b82f6 ${ramUsedPct}%, var(--color-circle-indicator) 0%)`;
                cRam.innerHTML = `<span>${ramUsedPct}%</span>`;
            }
        }
    }


    // fwStatus (FwInfo::toJSON côté firmware) : version installée, jeton de carte, génération de la
    // table de partitions et réglage checkForUpdate. Le boîtier ne connaît plus la dernière version
    // publiée -- c'est ce navigateur qui la découvre dans le catalogue (refreshUpdateBadge).
    // Émis à chaque connexion socket : c'est donc aussi lui qui signale le retour de l'appareil
    // après une installation (finishInstall).
    procFwStatus(info) {
        this.fwInfo = info;
        const gitInst = get('divGitInstall');
        if (gitInst && this._pendingInstall && this._pendingInstall.sent) {
            this.finishInstall(gitInst, info);
            return;
        }
        this.refreshUpdateBadge();
    }

    // Badge « mise à jour disponible » : version stable la plus haute du catalogue pour CETTE carte
    // et CETTE table de partitions, comparée à la version installée. Silencieux en cas d'échec
    // (appareil sans Internet, mode AP) : on affiche alors simplement « à jour ».
    async refreshUpdateBadge() {
        const info = this.fwInfo || {};
        const divsGlobal = document.querySelectorAll('.firmware-message');
        const btnGit = get('btnUpdateGithub');
        const gitDesc = get('gitUpdateDesc');
        const statusRight = get('gitUpdateStatusRight');
        if (divsGlobal.length === 0) return;
        divsGlobal.forEach(div => {
            div.classList.remove('procFwStatusshow');
            div.onclick = null;
        });
        const currentVersion = info.appVersion?.name || get('spanFwVersion')?.innerText || '';
        const showUpToDate = () => {
            if (!btnGit) return;
            if (gitDesc) gitDesc.innerHTML = tr('FW_UPDATE_UPTODATE');
            if (statusRight) statusRight.innerHTML = `<span class="status-badge state-success">v${escHtml(currentVersion)}</span>`;
        };
        if (info.checkForUpdate === false) return showUpToDate();
        let latest = null;
        try {
            const rel = await this.loadReleases(false);
            const current = this.verNum(info.appVersion);
            for (const r of rel.releases) {
                if (!r.asset || r.preRelease || r.main) continue;
                if (this.verNum(r.version) > current && (!latest || this.verNum(r.version) > this.verNum(latest.version))) latest = r;
            }
        } catch (e) {
            logger.debug('Update catalog unavailable:', e);
        }
        if (!latest) return showUpToDate();
        divsGlobal.forEach(div => {
            div.classList.add('procFwStatusshow');
            div.style.cursor = 'pointer';
            div.onclick = () => { firmware.updateGithub(); };
            div.innerHTML = `<span>${tr('FW_UPDATE_AVAILABLE')}</span>`;
        });
        if (btnGit) {
            if (gitDesc) gitDesc.innerHTML = tr('FW_UPDATE_ACTION_DESC');
            if (statusRight) statusRight.innerHTML = `<span class="status-badge state-danger">${escHtml(latest.version.name)}</span>`;
        }
    }

    // Barre de progression de l'écran d'installation (cf. renderGitInstallProgress).
    setInstallBar(id, pct) {
        const p = get(id);
        if (!p) return;
        p.style.setProperty('--progress', `${pct}%`);
        const val = get(`${id}-value`);
        if (val) val.textContent = `${pct}%`;
    }
    setInstallStatus(text) {
        const status = get('divGitPostStatus');
        const textEl = get('spanGitPostStatusText');
        if (!status || !textEl) return;
        status.style.display = '';
        textEl.textContent = text;
    }
    // Étape de l'écran d'installation : le stepper, et sous lui UNE barre qui mesure l'étape en
    // cours, remise à zéro à chaque changement. À l'étape 3 il n'y a plus rien à mesurer -- on
    // attend que l'appareil revienne, puis le renvoi des langues -- et la barre cède la place au
    // rouage de divGitPostStatus.
    setInstallPhase(div, step, label) {
        ui.wizSetStep(div, step);
        const bar = div.querySelector('#divInstallBar');
        if (bar) bar.style.display = step < 3 ? '' : 'none';
        if (step < 3) {
            const l = div.querySelector('#spanInstallPhase');
            if (l) l.textContent = label;
            this.setInstallBar('progInstall', 0);
        }
        else this.setInstallStatus(label);
    }

    // Extrait juste le premier nombre après le 'v' (ex: "v2.5.2" -> 2, "v3.0.0" -> 3, "3.1.2" -> 3)
    getMainVersion(verStr) {
        if (!verStr) return 0;
        const match = verStr.match(/[vV]?(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    // Rendu de l'écran de progression de installGitRelease, partagé entre le flux réel et le
    // mode DEBUG_FAKE_OTA ci-dessous.
    //
    // Stepper à 3 étapes, piloté par installGitRelease()/finishInstall() via setInstallPhase() :
    // 1 = téléchargement de l'image depuis Pages, 2 = envoi à /updateFirmware, 3 = redémarrage
    // puis renvoi des packs de langue. Une seule barre, celle de l'étape en cours.
    renderGitInstallProgress(div, verName) {
        const desc = tr('GIT_RELEASE_DESC').replace('%1', verName);

        // divGitInstall bascule de .inst-overlay (écran de sélection de version, potentiellement
        // long avec les notes de release -- cf. updateGithub()) à .modal-overlay pour cet écran de
        // progression, beaucoup plus court (stepper + barre + footer) : dialogue centré sur
        // desktop (au lieu d'un panneau plein cadre), scroll du fond verrouillé sur tous les
        // écrans via body.modal-open (au lieu de l'astuce CSS mobile-only de .inst-overlay, cf.
        // .container:has(.inst-overlay) dans main.css), et bottom-sheet sur mobile "gratuit" via
        // .message-content (cf. plus bas) -- le bottom-sheet standard cible déjà cette classe, pas
        // besoin de le reproduire. Son text-align:center par défaut (pensé pour des dialogues
        // courts type confirmation) ne convient pas au contenu en blocs de cet écran (stepper,
        // barres, footer) : neutralisé spécifiquement pour #divGitInstall dans overlays.css.
        // classList.remove/add plutôt qu'un className direct : préserve 'overlay-entered', déjà
        // posée par shOverlay() lors de l'ouverture initiale (écran de sélection de version) --
        // l'écraser ferait recalculer l'élément à opacity:0 (état de départ commun aux deux
        // classes) puisque plus rien ne redéclencherait la transition d'entrée.
        div.classList.remove('inst-overlay');
        div.classList.add('modal-overlay');
        // shOverlay() ne pose body.modal-open qu'à l'ouverture initiale (alors encore
        // .inst-overlay, donc ignoré) -- le reposer ici manuellement ; son retrait reste géré par
        // closeOverlay()/clearOverlays() génériques (cf. leurs commentaires respectifs), qui ne
        // dépendent que de la présence d'un .modal-overlay dans le DOM, pas de qui l'a posé.
        document.body.classList.add('modal-open');
        // Devenu .modal-overlay, divGitInstall reste hors du champ de ui.clearErrors() : celle-ci
        // ne ferme que les modales d'ALERTE (.prompt-content/.error-content/.info-content, cf.
        // 30-ui-binder.js), pas les fenêtres de travail comme celle-ci. Elle est appelée juste
        // après confirmInstallGitRelease() (le clic sur #btnYes du prompt de confirmation fait
        // onYes() PUIS clearErrors()), qui referme donc bien le prompt sans toucher à cet écran.

        div.innerHTML = `
        <div class="message-content">

        ${modalHeader('GIT_RELEASE_TITLE', 'svg-github', {
            subtitle: '',
            // Pas de rightContent/[close] ici volontairement : l'utilisateur doit confirmer AVANT
            // de lancer le flash (cf. confirmInstallGitRelease(), appelée par btnUpdate) en étant
            // prévenu qu'il ne pourra plus rien arrêter ensuite -- une icône de fermeture sur cet
            // écran laisserait croire le contraire une fois l'installation en cours.
        })}

        ${wizardStepper(3, 'GIT_RELEASE_TITLE')}

        <div class="overlay-scroll-content">

        <div id="divInstallBar">
        <div class="progress-bar-header"><span class="progress-bar-label" id="spanInstallPhase"></span><span class="progress-bar-value" id="progInstall-value">0%</span></div>
        <div class="progress-bar" id="progInstall"><div class="progress-bar-fill"></div></div>
        </div>

        <!-- Étape 3, à la place de la barre : attente du redémarrage, puis renvoi des packs de
        langue (cf. setInstallPhase, finishInstall). -->
        <div id="divGitPostStatus" class="information remote-search-status" style="display:none;">
        <div class="information-header">
        <span class="remote-search-spinner"></span>
        <b id="spanGitPostStatusText"></b>
        </div>
        </div>
        </div>

        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">

        <div class="git-install-footer-info">
        <svg><use href="#svg-power"></use></svg>
        <span>${tr('GIT_RELEASE_KEEP_POWERED')}</span>
        </div>
        </div>
        </div>
        </div>`;

        const hP = div.querySelector('.instructions-header p');
        if (hP) hP.innerHTML = desc;

        // Pas de bouton Annuler ici : une fois l'image envoyée, l'appareil redémarre dessus quoi
        // qu'il arrive, donc aucune annulation n'est réellement possible -- en proposer une serait
        // trompeur. Aucun
        // [close] dans le header (pas de rightContent sur modalHeader() ci-dessus) ni de poignée
        // mobile (cf. #divGitInstall .modalHeader-handle dans overlays.css) : le seul geste qui
        // reste est le clic hors-modale, déjà intercepté par requestCloseOverlay() via l'écouteur
        // générique (cf. 20-shell.js) -- qui refuse la fermeture tant que le verrou 'hard' posé
        // ci-dessus est actif (cf. flashOverlayLocked). La confirmation avant de lancer le flash
        // (cf. confirmInstallGitRelease()) est donc la seule porte de sortie réelle.

        // État initial : étape 1 (téléchargement) active.
        this.setInstallPhase(div, 1, tr('GIT_RELEASE_PHASE_DOWNLOAD').replace('%1', verName));
    }

    // Porte d'entrée de btnUpdate (cf. updateGithub()) : renderGitInstallProgress() ne pose plus
    // aucun moyen de fermer l'écran de progression une fois affiché (ni [close], ni bouton
    // Annuler, ni poignée mobile -- cf. ses commentaires) puisque le flash, une fois lancé côté
    // ESP32, ne peut de toute façon plus être interrompu (aucune route /cancelInstallGit). La
    // confirmation doit donc se faire ICI, avant, pendant qu'il est encore temps de reculer.
    confirmInstallGitRelease(div) {
        // ui.promptMessage() ne remappe (el, msg, onYes) que pour ses formes à 2/3 arguments (cf.
        // son propre commentaire dans 30-ui-binder.js) -- isDanger+iconId en plus obligent donc à
        // passer `el` explicitement, comme rebootDevice() (40-general.js).
        const prompt = ui.promptMessage(get('divContainer'), tr('GIT_RELEASE_CONFIRM_TITLE'), () => {
            this.installGitRelease(div);
        }, true, 'svg-github');
        // Même comparaison que gitReleaseSelected() (data-vernum de l'option sélectionnée vs
        // data-currentvernum posé sur le conteneur) -- recalculée ici plutôt que mémorisée :
        // l'utilisateur peut changer la version sélectionnée entre le rendu du bouton et ce clic.
        // Trois cas ici contre deux pour le libellé du bouton, qui reste "Mettre à jour" sur une
        // version antérieure faute de place pour un troisième texte : c'est donc cette fenêtre
        // qui dit qu'on redescend, et elle est le dernier point où l'on peut encore reculer.
        const sel = div.querySelector('#selVersion');
        const opt = sel && sel.selectedIndex !== -1 ? sel.options[sel.selectedIndex] : null;
        const vernum = opt ? Number(opt.getAttribute('data-vernum')) : 0;
        const currentVerNum = Number(div.getAttribute('data-currentvernum'));
        // Les trois clés restent des littéraux passés à tr(), et non une variable : c'est à cette
        // condition que check_i18n.py les voit et refuse le build si l'une manque aux locales
        // (son motif ne capture que tr('CLE'), cf. TR_LITERAL). Un tr(key) bien plus compact
        // passerait le contrôle sans être vu, et la fenêtre afficherait le nom de la clé.
        // La version de dev (data-vernum -1) n'a pas de numéro comparable : ni réinstallation ni retour arrière.
        const isDevBuild = opt && opt.getAttribute('data-devbuild') === 'true';
        prompt.querySelector('.sub-message').innerHTML = `<p>${
            isDevBuild ? tr('GIT_RELEASE_CONFIRM_SUB')
            : !opt || vernum === currentVerNum ? tr('GIT_RELEASE_CONFIRM_SUB_REINSTALL')
            : vernum < currentVerNum ? tr('GIT_RELEASE_CONFIRM_SUB_DOWNGRADE')
            : tr('GIT_RELEASE_CONFIRM_SUB')}</p>`;
    }

    async installGitRelease(div) {
        let obj = ui.fromElement(div);

        // --- MODE TEST OTA (cf. DEBUG_FAKE_OTA en tête de fichier) ---
        if (DEBUG_FAKE_OTA) {
            this.renderGitInstallProgress(div, obj.version || 'X.X.X');
            this.setInstallPhase(div, 2, tr('GIT_RELEASE_PHASE_INSTALL'));
            this.setInstallBar('progInstall', DEBUG_FAKE_OTA_PCT);
            return;
        }

        const rel = (div._rel?.releases || []).find(r => r.version.name === obj.version);
        if (!rel || !rel.asset) return ui.errorMessage(tr('ERR_UNSPECIFIED'));

        if (!this.isMobile()) {
            try { await firmware.backup(); }
            catch (err) { return ui.serviceError(div, err); }
        }
        // Verrou 'hard' jusqu'au retour de l'appareil (finishInstall) : une fois l'image envoyée,
        // fermer cet écran ne l'arrêterait pas, ça priverait seulement l'utilisateur du résultat.
        setOverlayLock(div, 'hard', {
            titleKey: 'PROMPT_UPDATE_IN_PROGRESS_TITLE',
            msgKey: 'PROMPT_UPDATE_IN_PROGRESS_MSG',
        });
        this.renderGitInstallProgress(div, rel.name);
        this._pendingInstall = { tag: rel.version.name, sent: false };
        try {
            const bin = await this.downloadImage(rel.asset, pct => this.setInstallBar('progInstall', pct));
            this.setInstallPhase(div, 2, tr('GIT_RELEASE_PHASE_INSTALL'));
            await this.sendImage(bin, rel.asset.sha256, pct => this.setInstallBar('progInstall', pct));
            this._pendingInstall.sent = true;
            this.setInstallPhase(div, 3, tr('GIT_RELEASE_PHASE_REBOOT'));
            // La suite arrive avec le fwStatus de la reconnexion socket (finishInstall). Filet si
            // l'appareil ne revient jamais : sans lui, le verrou 'hard' piégerait l'interface.
            this._installTimer = setTimeout(() => this.failInstall(div, tr('ERR_UNSPECIFIED')), 180000);
        }
        catch (err) {
            this.failInstall(div, err.message);
        }
    }
    failInstall(div, msg) {
        clearTimeout(this._installTimer);
        this._pendingInstall = null;
        clearOverlayLock(div);
        div.remove();
        ui.errorMessage(msg);
    }
    // Retour de l'appareil après l'envoi : la version qu'il annonce dit si l'image a pris. Sinon,
    // c'est qu'il a refusé l'image ou que le chargeur est revenu à l'emplacement précédent (retour
    // arrière, cf. FwInfo::loopRollback).
    async finishInstall(div, info) {
        const pending = this._pendingInstall;
        clearTimeout(this._installTimer);
        const got = info.fwVersion?.name || '';
        const ok = pending.tag === 'dev' || got === pending.tag || `v${got}` === pending.tag;
        if (!ok) return this.failInstall(div, `${tr('ERR_UNSPECIFIED')} (${got})`);
        this._pendingInstall = null;
        // Toujours l'étape 3 : les packs de langue du filesystem datent de l'ancienne version, et
        // leurs clés ne correspondent plus forcément. On renvoie celui de la langue active et celui
        // de repli, pris au tag du NOUVEAU firmware (cf. fetchGithubRawContent).
        window.__fwVersionTag = got;
        const codes = [...new Set([window.__activeLangCode, window.__defaultLangCode].filter(Boolean))];
        let langFailed = false;
        for (let i = 0; i < codes.length; i++) {
            this.setInstallStatus(tr('GIT_LANG_RESTORE_IN_PROGRESS').replace('%1', codes[i]));
            try { await relayLangViaBrowser(codes[i]); }
            catch (e) { langFailed = true; logger.error('Language pack refresh failed for ' + codes[i] + ':', e); }
        }
        // Au-delà de la dernière étape : les trois puces passent à « terminé ».
        ui.wizSetStep(div, 4);
        clearOverlayLock(div);
        div.remove();
        const subMsg = langFailed
            ? `${tr('GIT_RELEASE_SUCCES_1')}<br>${tr('GIT_LANG_RESTORE_FAILED').replace('%1', codes.join(', '))}`
            : `${tr('GIT_RELEASE_SUCCES_1')}<br>${tr('GIT_RELEASE_SUCCES_2')}`;
        ui.successMessage(tr('GIT_RELEASE_SUCCESS_TITLE'), subMsg);
        general.reloadApp = true;
        setTimeout(() => general.reload(), 3000);
    }

    // --- Catalogue Pages (cf. OTA_CATALOG_URL) ---
    verNum(v) { return ((v?.major || 0) * 1000000) + ((v?.minor || 0) * 1000) + (v?.build || 0); }
    async loadCatalog() {
        // Gardé cinq minutes : le badge et l'écran de sélection le relisent sans refaire la requête.
        if (this._catalog && Date.now() - this._catalogAt < 300000) return this._catalog;
        const resp = await fetch(OTA_CATALOG_URL, { cache: 'no-cache' });
        if (!resp.ok) throw new Error('catalog HTTP ' + resp.status);
        this._catalog = await resp.json();
        this._catalogAt = Date.now();
        return this._catalog;
    }
    // Jeton de carte du firmware (esp32, esp32c6, esp32_BOX_eth...) vers la clé du catalogue,
    // identique à celle de l'installateur web (box_eth, box_wifi).
    boardKey() {
        const t = this.fwInfo?.board || '';
        return t.includes('_BOX_') ? 'box_' + t.split('_BOX_')[1] : t;
    }
    // Même forme que l'ancienne réponse du boîtier (/getReleases), pour que l'écran de sélection n'ait pas à
    // changer : `asset` n'est renseigné que si une image existe pour cette carte ET cette table de
    // partitions -- une image bâtie pour une autre table serait de toute façon refusée par le
    // marqueur de /updateFirmware.
    async loadReleases(includeDev) {
        const cat = await this.loadCatalog();
        const board = this.boardKey();
        const layout = this.fwInfo?.layout;
        const parse = tag => {
            const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag || '');
            return m ? { name: tag, major: +m[1], minor: +m[2], build: +m[3] } : { name: tag, major: 0, minor: 0, build: 0 };
        };
        const releases = (cat.versions || []).filter(v => includeDev || !v.dev).map(v => {
            const a = (v.boards || {})[board];
            return {
                name: v.name || v.tag,
                version: parse(v.tag),
                preRelease: !!v.prerelease || !!v.dev,
                draft: false,
                main: !!v.dev,
                notes: v.notes,
                asset: a && (layout === undefined || a.layout === layout) ? a : undefined,
            };
        });
        return { appVersion: this.fwInfo?.appVersion || {}, releases };
    }
    catalogFetch(includeDev, cb) {
        const overlay = ui.waitMessage(get('divContainer'), 'WAIT_MSG_LOADING');
        this.loadReleases(includeDev)
            .then(rel => { overlay.remove(); cb(null, rel); })
            .catch(err => { overlay.remove(); cb({ desc: `${tr('ERR_GIT_NOTE')} (${err.message})` }, null); });
    }
    // Téléchargement de l'image depuis Pages, avec progression. Pas de contrôle d'empreinte ici :
    // crypto.subtle n'existe pas sur une page servie en http:// -- c'est l'appareil qui la vérifie.
    async downloadImage(asset, onPct) {
        const resp = await fetch(new URL(asset.path, OTA_CATALOG_URL), { cache: 'no-cache' });
        if (!resp.ok || !resp.body) throw new Error('download HTTP ' + resp.status);
        const total = asset.size || Number(resp.headers.get('Content-Length')) || 0;
        const reader = resp.body.getReader();
        const chunks = [];
        let loaded = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            if (total) onPct(Math.min(100, Math.round((loaded / total) * 100)));
        }
        if (asset.size && loaded !== asset.size) throw new Error(`download size ${loaded}/${asset.size}`);
        return new Blob(chunks, { type: 'application/octet-stream' });
    }
    // Envoi à /updateFirmware. XMLHttpRequest plutôt que fetch : seul lui expose la progression de
    // l'envoi. L'empreinte part en en-tête (FW_DIGEST_HEADER côté firmware).
    sendImage(blob, sha256, onPct) {
        return new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append('update', blob, 'firmware.bin');
            const xhr = new XMLHttpRequest();
            xhr.open('POST', baseUrl + '/updateFirmware');
            xhr.setRequestHeader('apikey', security.apiKey || '');
            if (sha256) xhr.setRequestHeader('X-Firmware-SHA256', sha256);
            xhr.upload.onprogress = e => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
            xhr.onload = () => {
                let body = {};
                try { body = JSON.parse(xhr.responseText); } catch (e) { /* corps non JSON */ }
                if (xhr.status === 200) return resolve(body);
                reject(new Error(body.desc || ('HTTP ' + xhr.status)));
            };
            xhr.onerror = () => reject(new Error('upload failed'));
            xhr.send(fd);
        });
    }

    // Menu du header de divGitInstall. Le mode n'est jamais mémorisé : chaque ouverture repart en
    // Production, l'accès à la version de dev reste un geste volontaire.
    setGitMode(el, mode) {
        const div = el.closest('#divGitInstall');
        if (!div || !div.setGitMode || div.getAttribute('data-mode') === mode) return;
        if (mode !== 'dev') return div.setGitMode(mode);
        const prompt = ui.promptMessage(get('divContainer'), tr('FIRMWARE_DEV_CONFIRM_TITLE'), () => div.setGitMode('dev'), true, 'svg-warning');
        prompt.querySelector('.sub-message').innerHTML = `<p>${tr('FIRMWARE_DEV_CONFIRM')}</p>`;
    }

    updateGithub() {
        this.catalogFetch(false, (err, rel) => {
            if (err) {
                if (typeof err.error !== 'undefined') {
                    let e = errors.find(x => x.code === err.error) || { desc: tr('ERR_UNSPECIFIED') };
                    return ui.errorMessage(e.desc);
                }
                return ui.serviceError(err);
            }

            const div = document.createElement('div'), isMob = this.isMobile();
            div.id = 'divGitInstall';
            div.className = 'inst-overlay';

            rel.releases.sort((a, b) => a.preRelease === b.preRelease && b.draft === a.draft ? 0 : a.preRelease ? 1 : -1);

            // Comparaison numérique major/minor/build (déjà fournis par /getReleases, pas besoin de
            // parser la chaîne "name") : sert à reconnaître la release DÉJÀ INSTALLÉE parmi les
            // options (libellé "Réinstaller" plutôt que "Mettre à jour", cf. gitReleaseSelected()).
            // Elle ne filtre plus rien -- une v3 antérieure reste proposée, le seul plancher est
            // la majeure 3 ci-dessous. Indispensable car les "name" ne sont PAS comparables :
            // le tag GitHub garde son préfixe ("v3.0.0", cf. GitRelease::setReleaseProperty) alors
            // que /appversion en est dépouillé au build (cf. build.yaml, "${TAG#v}") -- appVersion.name
            // vaut donc "3.0.0" sans le "v".
            const verNum = v => ((v?.major || 0) * 1000000) + ((v?.minor || 0) * 1000) + (v?.build || 0);
            const currentVerNum = verNum(rel.appVersion);

            // --- INJECTION DE LA VERSION COURANTE DE L'ESP (numérique, cf. commentaire ci-dessus) ---
            div.setAttribute('data-currentvernum', currentVerNum);

            // --- FILTRAGE DES OPTIONS DU SÉLECTEUR ---
            // La version de dev (r.main, case réservée côté firmware) n'est servie qu'avec ?dev=1 et
            // passe en tête : sans numéro dans son tag, elle tomberait sous le plancher de majeure.
            const isCompatible = r => !!r.asset;
            const buildOpts = rel => {
            const devBuild = rel.releases.find(r => r.main && isCompatible(r));
            return (devBuild ? `<option value="${escAttr(devBuild.version.name)}" data-prerelease="true" data-devbuild="true" data-vernum="-1">${escHtml(devBuild.name)}</option>` : '') + rel.releases.map(r => {
                const name = r.name.toLowerCase();
                if (r.main || name === 'main' || name === 'master' || !isCompatible(r)) return '';

                // Seul plancher : la majeure. Une v2 ne s'installe pas par OTA depuis une v3 (table
                // de partitions différente, cf. le blocage isBlocked plus haut), l'afficher ne
                // ferait que proposer une impasse. À l'intérieur de la v3, TOUTES les versions
                // rapportées par /getReleases sont proposées, y compris antérieures à celle
                // installée : revenir en arrière dans la même majeure est un besoin légitime, et
                // c'est le plafond GIT_MAX_RELEASES (GitOTA.h) qui borne la liste, pas la version
                // courante.
                const targetMajor = this.getMainVersion(r.version.name);
                if (targetMajor < 3) return '';

                // Nom et version viennent du JSON GitHub : distant, donc échappés comme le reste.
                return `<option value="${escAttr(r.version.name)}" data-prerelease="${r.preRelease}" data-vernum="${verNum(r.version)}">${escHtml(r.name)}${r.preRelease ? ' - Pre' : ''}</option>`;
            }).join('');
            };
            const optsHtml = buildOpts(rel);
            div.setAttribute('data-mode', 'prod');
            div._rel = rel;

            div.innerHTML = `
            <div class="instructions-content github-content">
            ${overlayHeader('FIRMWARE_OTA_TITLE', 'FIRMWARE_OTA_TITLE_DESC', 'svg-github', { subtitle: 'FIRMWARE_OTA_TITLE_DESC', menu: [
                { id: 'prod', label: tr('FIRMWARE_MODE_PROD'), active: true, action: "firmware.setGitMode(this, 'prod')" },
                { id: 'dev', label: tr('FIRMWARE_MODE_DEV'), action: "firmware.setGitMode(this, 'dev')" }
            ] })}

            <div class="overlay-static-content">
            <div class="baseFlexRow"><span class="uniLabel">${tr('FIRMWARE_MT_INSTALLED')}</span><span class="labelgrey">v${rel.appVersion.name}</span></div>
            <div class="baseFlexRow">
            <span class="uniLabel">${tr('FIRMWARE_OTA_AVAILABLE')}</span>
            <select id="selVersion" class="selectCompac" data-bind="version">${optsHtml}</select>
            </div>
            <!-- Page des releases du dépôt comme valeur de départ, et non "#" : le href n'était
                 renseigné que par updateNotes() en cas de succès (r.info.html_url). Dès que la note
                 ne se chargeait pas -- sélecteur vide, ou GitHub injoignable depuis le NAVIGATEUR,
                 qui va le chercher lui-même -- le lien gardait "#", que le navigateur résout contre
                 la page courante : il pointait donc sur http://espsomfyrts.local/#, c'est-à-dire sur
                 lui-même. updateNotes() l'affine ensuite sur la version sélectionnée. -->
            <a id="lnkGithubRelease" href="https://github.com/xkain/TESTRTS/releases" target="_blank" class="link">${tr('FIRMWARE_OTA_NOTE_GITHUB')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a>


            </div>

            <!-- Bandeau d'alerte, à la même place que la carte du fichier de divUploadFile (cf.
                 .fw-band, overlays.css) : sous le bloc statique et HORS de la zone défilante, où
                 il partait auparavant avec les notes de version dès qu'on les faisait défiler.
                 Quand il est visible, sa bordure basse remplace le filet ci-dessous. -->
            <div id="divPrereleaseWarning" class="error fw-band" style="display:none;">
            <div class="error-header">
            <svg><use href="#svg-error"></use></svg>
            <b>${tr('MSG_ALERT')}</b>
            </div>
            <div class="information-text">
            <span id="spanUpdateWarning"></span>
            </div>
            </div>
            <div class="hrModal"></div>

            <div class="overlay-scroll-content">
            <div class="warningText"><svg><use href="#svg-warning"></use></svg><span>${tr('FIRMWARE_MT_CACHE')}</span></div>

            <div id="notesPreview" class="release-notes-preview">
            <div class="wifiConnectScan">
            <svg class="wait-spinner" viewBox="25 25 50 50"><circle class="wait-spinner-track" cx="50" cy="50" r="20" fill="none" stroke-width="3"/><circle class="wait-spinner-arc" cx="50" cy="50" r="20" fill="none" stroke-width="3" stroke-miterlimit="10"/></svg>
            </div>
            </div>
            </div>

            <div class="hrDivFooter-Instruc"></div>
            <div class="button-container-overlay">
            <div class="footer-sticky-content">
            <div class="uniRow">
            <div class="uniText"><span class="uniLabel">${tr('FIRMWARE_MT_SAVE_BACKUP')}</span><span class="uniStatus">${tr(isMob ? 'FIRMWARE_MT_SAVE_BACKUP_DESC_MOB' : 'FIRMWARE_MT_SAVE_BACKUP_DESC')}</span></div>
            <div id="btnBackupCfg" class="gitBackup" onclick="firmware.backup()"><svg><use href="#svg-save"></use></svg></div>
            </div>
            <div class="button-container-row">
            <button id="btnClose" line type="button" onclick="requestCloseOverlay(get('divGitInstall'))">${tr('BT_CANCEL_1')}</button>
            <button id="btnUpdate" type="button" class="btn-main" onclick="firmware.confirmInstallGitRelease(get('divGitInstall'))">${tr('BT_UPDATE')}</button>
            </div>
            </div>
            </div>
            </div>`;

            shOverlay(div);
            const sel = div.querySelector('#selVersion');

            const updateNotes = async () => {
                const nDiv = div.querySelector('#notesPreview'), lnk = div.querySelector('#lnkGithubRelease');
                // Sélecteur vide (aucune release compatible) : sel.value est "" et
                // getReleaseInfo("") construirait .../releases/tags/ (404 GitHub garanti).
                // On affiche le message d'échec plutôt que de sortir sèchement : le bloc #notesPreview
                // est né avec le rouage d'attente dans son HTML, un `return` nu le laissait tourner
                // indéfiniment. Le lien, lui, reste sur la page des releases du dépôt.
                if (!nDiv) return;
                if (!sel || !sel.value) {
                    nDiv.innerHTML = `
                    <div class="divGitNoteError">
                    <div class="gitNoteError">${tr('ERR_GIT_NOTE')}</div>
                    <div class="gitNoteErrorSub">${tr('FIRMWARE_OTA_NOTE_UPDATE')}</div>
                    </div>`;
                    return;
                }

                nDiv.innerHTML = '<div class="wifiConnectScan"><svg class="wait-spinner" viewBox="25 25 50 50"><circle class="wait-spinner-track" cx="50" cy="50" r="20" fill="none" stroke-width="3"/><circle class="wait-spinner-arc" cx="50" cy="50" r="20" fill="none" stroke-width="3" stroke-miterlimit="10"/></svg></div>';

                // Lien posé AVANT l'appel réseau, sur la version sélectionnée : s'il échoue, le lien
                // reste exact et cliquable, ce qui est précisément ce que propose le message d'erreur
                // ci-dessous (FIRMWARE_OTA_NOTE_UPDATE, « Cliquer directement sur le lien ci-dessus »).
                if (lnk) lnk.href = `https://github.com/xkain/TESTRTS/releases/tag/${encodeURIComponent(sel.value)}`;

                try {
                    const r = await firmware.getReleaseInfo(sel.value, true);
                    if (r?.info?.body) {
                        nDiv.innerHTML = firmware.parseMarkdown(r.info.body);
                        if (lnk && r.info.html_url) lnk.href = r.info.html_url;
                    } else {
                        throw new Error("No body");
                    }
                } catch (e) {
                    nDiv.innerHTML = `
                    <div class="divGitNoteError">
                    <div class="gitNoteError">${tr('ERR_GIT_NOTE')}</div>
                    <div class="gitNoteErrorSub">${tr('FIRMWARE_OTA_NOTE_UPDATE')}</div>
                    </div>`;
                }
            };
            sel.addEventListener('change', () => { this.gitReleaseSelected(div); updateNotes(); });
            this.gitReleaseSelected(div);
            updateNotes();

            const applyMode = (mode, list) => {
                div.setAttribute('data-mode', mode);
                div._rel = list;
                div.querySelectorAll('.overlayHeader-dropdown-menu [data-menu]').forEach(m => m.classList.toggle('active', m.getAttribute('data-menu') === mode));
                sel.innerHTML = buildOpts(list);
                this.gitReleaseSelected(div);
                updateNotes();
            };
            // Production : la liste déjà chargée suffit (le firmware y a vidé la case de la version de dev).
            // Développeur : un second appel, seul à payer la poignée de main TLS de /releases/tags/dev.
            div.setGitMode = mode => {
                if (mode !== 'dev') return applyMode('prod', rel);
                this.catalogFetch(true, (err, devRel) => {
                    if (err) return ui.serviceError(err);
                    if (!devRel.releases.some(r => r.main && isCompatible(r))) ui.errorMessage(tr('FIRMWARE_DEV_NONE'));
                    applyMode('dev', devRel);
                });
            };
        });
    }
    gitReleaseSelected(div) {
        const sel = div.querySelector('#selVersion');
        if (!sel || sel.selectedIndex === -1) return;

        const opt = sel.options[sel.selectedIndex];
        const isPre = opt.getAttribute('data-prerelease') === "true";
        const divPre = div.querySelector('#divPrereleaseWarning');
        const spanWarning = div.querySelector('#spanUpdateWarning');
        const btnUpdate = div.querySelector('#btnUpdate');

        if (btnUpdate) {
            btnUpdate.disabled = false;
            // Version sélectionnée = version déjà installée (cf. verNum >= currentVerNum dans
            // updateGithub, qui garde volontairement l'entrée courante dans le sélecteur pour
            // permettre une réinstallation) : le libellé "Mettre à jour" serait trompeur, on
            // bascule sur "Réinstaller". Comparaison sur data-vernum/data-currentvernum (numérique)
            // et non sur les "name" -- ceux-ci ne sont pas directement comparables entre eux, cf.
            // commentaire dans updateGithub().
            const isReinstall = opt.getAttribute('data-vernum') === div.getAttribute('data-currentvernum');
            btnUpdate.textContent = tr(isReinstall ? 'BT_REINSTALL' : 'BT_UPDATE');
        }

        if (divPre) {
            if (isPre) {
                if (spanWarning) spanWarning.innerHTML = opt.getAttribute('data-devbuild') === 'true' ? tr('FIRMWARE_OTA_RELEASE_DEV') : tr('FIRMWARE_OTA_RELEASE_BETA');
                divPre.style.display = 'flex';
            } else {
                divPre.style.display = 'none';
            }
            // Le bandeau visible tient lieu de séparateur : le filet qui le suit ferait doublon
            // (cf. #divGitInstall.has-prerelease .hrModal, overlays.css).
            div.classList.toggle('has-prerelease', isPre);
        }
    }
    // Notes de version publiées avec le catalogue (notes/<tag>.md) : même origine que lui, donc
    // aucune limite de débit de l'API GitHub, et la version de dev a les siennes.
    async getReleaseInfo(tag, silent = false) {
        let overlay = null;
        if (!silent) overlay = ui.waitMessage(document.getElementById('divContainer'));
        try {
            const cat = await this.loadCatalog();
            const v = (cat.versions || []).find(x => x.tag === tag);
            if (!v || !v.notes) return { resp: { ok: false }, info: null };
            const resp = await fetch(new URL(v.notes, OTA_CATALOG_URL), { cache: 'no-cache' });
            const info = resp.ok ? { body: await resp.text(), html_url: `https://github.com/xkain/TESTRTS/releases/tag/${encodeURIComponent(tag)}` } : null;
            return { resp, info };
        }
        catch (err) {
            return { resp: { ok: false }, err: err };
        }
        finally {
            if (overlay) overlay.remove();
        }
    }
    formatInlineMarkdown(txt) {
        if (!txt) return '';
        return txt
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`([^`]+)`/g, '<code class="md-code-inline">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="md-link">$1</a>')
        .replace(/(?<!["=>])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="md-link-auto">$1</a>');
    }
    parseMarkdown(bodyText) {
        const self = this;
        const ctx = {
            lines: (bodyText || "").split(/\r?\n/),
            ndx: 0,
            html: '',
            token(txt) {
                const trimmed = txt.trim();
                if (!trimmed) return { type: 'empty' };
                const firstChar = txt.match(/\S/);
                const indent = firstChar ? txt.indexOf(firstChar[0]) : 0;
                if (trimmed.startsWith('#')) return { type: 'head', txt: trimmed, indent };
                if (trimmed.startsWith('* ')) return { type: 'list', txt: trimmed.substring(2), indent };
                return { type: 'text', txt: trimmed, indent };
            },
            renderHead(token) {
                const level = (token.txt.match(/^#+/) || ["#"])[0].length;
                const content = token.txt.replace(/^#+\s*/, '');
                return `<h${level} style="margin: 10px 0 5px 0;">${self.formatInlineMarkdown(content)}</h${level}>`;
            },
            renderList() {
                let listHtml = '<ul class="md-list" style="padding:0; margin:5px 0;">';
                while (this.ndx < this.lines.length) {
                    const t = this.token(this.lines[this.ndx]);
                    if (t.type !== 'list') break;
                    const margin = (t.indent * 8) + 20;
                    listHtml += `<li style="margin-left:${margin}px; text-align:left; list-style-type:disc;">${self.formatInlineMarkdown(t.txt)}</li>`;
                    this.ndx++;
                }
                listHtml += '</ul>';
                return listHtml;
            },
            parse() {
                while (this.ndx < this.lines.length) {
                    const t = this.token(this.lines[this.ndx]);
                    switch (t.type) {
                        case 'head': this.html += this.renderHead(t); this.ndx++; break;
                        case 'list': this.html += this.renderList(); break;
                        case 'empty': this.html += '<div style="height:8px"></div>'; this.ndx++; break;
                        default:
                            const margin = (t.indent * 8) + (t.indent > 0 ? 20 : 0);
                            this.html += `<p style="margin: 2px 0; margin-left:${margin}px; text-align:left; line-height:1.4;">${self.formatInlineMarkdown(t.txt)}</p>`;
                            this.ndx++;
                            break;
                    }
                }
            }
        };
        ctx.parse();
        return ctx.html;
    }
    // Envoi manuel d'un firmware. L'interface est compilée dedans : plus d'image de filesystem à
    // envoyer à part, ni de /updateApplication.
    updateManual() {
        const service = '/updateFirmware';
        const div = this.createFileUploader(service);
        const currentVer = get('spanFwVersion').innerText || '?.?.?';

        let instContent = div.querySelector('.instructions-content');
        const updateDescKey = 'FIRMWARE_MA_FIRMWARE_DESC';
        instContent.insertAdjacentHTML('afterbegin', overlayHeader('FIRMWARE_MA_UPDATE_TITLE', updateDescKey, 'svg-update', { subtitle: updateDescKey }));

        div.querySelector('#divInstText').innerHTML = `



        <div class="overlay-static-content">
        <div class="baseFlexRow"><span class="uniLabel">${tr('FIRMWARE_MT_INSTALLED')}</span><span class="labelgrey">${currentVer}</span></div>
        <div class="warningText"><span>${tr('FIRMWARE_MT_CACHE')}</span></div></div>
        ${this.fileIdCard()}



        </div>`;

        div.className += ' mode-firm-update';
        shOverlay(div);
        // Après shOverlay() : la mesure demande que le bloc soit dans le document et sa largeur
        // arrêtée. La transition d'entrée ne gêne pas, elle porte sur une transformation et une
        // opacité, dont clientWidth/scrollWidth ne dépendent pas.
        this.fitFileName(div);

        const btnB = div.querySelector('#btnBackupCfg');
        if (btnB) {
            btnB.style.display = 'flex';
            btnB.onclick = () => firmware.backup();
        }
    }
    async uploadFile(service, el, data) {
        let field = el.querySelector('input[type="file"]'),
        filename = field.value,
        file = field.files[0],
        title = tr('MSG_ALERT'),
        err = null,
        customErrMsg = null;

        if (!filename) {
            err = (service === '/restore')
            ? 'ERR_NO_FILE_BACKUP_SELECTED'
            : 'ERR_NO_FILE_FIRMWARE_SELECTED';
        }
        else {
            // Extrait uniquement le nom du fichier (supprime le C:\fakepath\)
            const cleanFileName = filename.split(/(\\|\/)/).pop();

            // --- INTERCEPTION SPÉCIFIQUE DES ANCIENNES VERSIONS V2 (SomfyController) ---
            if (cleanFileName.includes('SomfyController')) {
                const isOldFS = cleanFileName.includes('littlefs');
                const fileTypeKey = isOldFS ? 'ERR_FIRMWARE_TYPE_LITTLEFS' : 'IS_FIRMWARE';

                customErrMsg = tr('ERR_FIRMWARE_V2_INCOMPATIBLE')
                .replace('%file%', cleanFileName)
                .replace('%type%', tr(fileTypeKey));
            }
            // --- VALIDATIONS STRICTES V3 + ---
            else if (service === '/updateFirmware' && (!cleanFileName.startsWith('ESPSomfyRTS_') || cleanFileName.includes('_filesystem') || !cleanFileName.endsWith('.bin'))) {
                err = 'ERR_INVALID_FILE_FIRMWARE';
            }
            else if (service === '/restore') {
                if (file.size > 32768) {
                    const msg = tr('ERR_BACKUP_TOO_LARGE').replace('%s', file.size.fmt("#,##0"));
                    ui.errorMessage(title, msg);
                    return;
                }
                if (!cleanFileName.endsWith('.backup')) err = 'ERR_INVALID_FILE_BACKUP';
                else if (!['shades', 'settings', 'network', 'transceiver', 'repeaters', 'listeners', 'mqtt'].some(k => data[k])) err = 'ERR_NO_RESTORE_OPTION';
            }
        }

        if (customErrMsg || err) {
            const message = customErrMsg ? customErrMsg : tr(err);
            ui.errorMessage(title, message);
            return;
        }

        // Les validations ci-dessus ne portent que sur le NOM du fichier : renommer un binaire
        // v2.x.x au format v3 suffisait à les franchir, et l'appareil flashait une image bâtie
        // pour une autre table de partition -- récupération par USB obligatoire. On regarde donc
        // le contenu. Le contrôle qui fait foi reste celui de /updateFirmware côté
        // firmware, celui-ci n'évite qu'un téléversement inutile de plus d'un mégaoctet.
        if (service === '/updateFirmware' && window.__fwImageMarker) {
            if (!await this.imageMarkerPresent(file, window.__fwImageMarker)) {
                ui.errorMessage(title, tr('ERR_GIT_PARTITION_BLOCKED'));
                return;
            }
        }

        // Même porte de confirmation que btnUpdate/confirmInstallGitRelease() (divGitInstall) :
        // au-delà de ce point, le transfert devient irréversible (verrou 'hard' posé par
        // _startUpload() ci-dessous, aucune route /cancelXxx côté firmware) -- donc, comme pour
        // l'install GitHub, c'est ICI, avant de lancer quoi que ce soit, que la confirmation doit
        // avoir lieu, pas après.
        this.confirmUploadFile(service, el, data, file);
    }
    // Cherche le marqueur d'image dans le binaire. 'latin1' fait correspondre chaque octet à une
    // unité de code, ce qui permet un indexOf() natif plutôt qu'un balayage octet par octet en JS
    // sur plus d'un mégaoctet.
    async imageMarkerPresent(file, marker) {
        try {
            const buf = new Uint8Array(await file.arrayBuffer());
            return new TextDecoder('latin1').decode(buf).indexOf(marker) >= 0;
        }
        catch (err) {
            // Fichier illisible (permissions, fichier remplacé entre-temps) : on ne bloque pas sur
            // un doute, le firmware refusera de son côté s'il y a lieu.
            logger.warn('Firmware image marker check skipped:', err);
            return true;
        }
    }
    confirmUploadFile(service, el, data, file) {
        const isRestore = service === '/restore';
        const prompt = ui.promptMessage(get('divContainer'), tr(isRestore ? 'RESTORE_CONFIRM_TITLE' : 'GIT_RELEASE_CONFIRM_TITLE'), () => {
            this._startUpload(service, el, data, file);
        }, true, isRestore ? 'svg-restore' : 'svg-update');
        prompt.querySelector('.sub-message').innerHTML = `<p>${tr(isRestore ? 'RESTORE_CONFIRM_SUB' : 'GIT_RELEASE_CONFIRM_SUB')}</p>`;
    }
    async _startUpload(service, el, data, file) {
        if (service !== '/restore' && !this.isMobile()) {
            try { await firmware.backup(); }
            catch (e) { return ui.serviceError(el, e); }
        }

        let formData = new FormData();
        formData.append('file', file);
        if (service === '/restore') formData.append('data', JSON.stringify(data));

        ['btnBackupCfg', 'btnUploadFile'].forEach(id => { let b = el.querySelector('#' + id); if (b) b.style.display = 'none'; });
        // field n'est plus dans la portée ici (déclaré localement dans uploadFile(), la validation
        // -- qui précède désormais la confirmation, cf. confirmUploadFile() -- appelante) : redérivé.
        let field = el.querySelector('input[type="file"]');
        field.disabled = true;
        let steps = el.querySelector('.vertical-steps-container');
        if (steps) steps.style.display = 'none';
        let progWrap = el.querySelector('#divFileUploadProgress'),
        prog = el.querySelector('#progFileUpload'),
        progVal = el.querySelector('#progFileUpload-value'),
        btnCancel = el.querySelector('#btnClose'),
        backupRow = el.querySelector('.uniRow.backup-row'),
        inProgressNotice = el.querySelector('#divUploadInProgressNotice');
        progWrap.style.display = '';

        // "Annuler" ne fait en réalité rien une fois le transfert lancé (cf. le verrou 'hard'
        // ci-dessous, qui bloque déjà toute fermeture réelle) -- le masquer plutôt que de laisser
        // un bouton trompeur. Idem pour la ligne de sauvegarde config, qui n'a plus lieu d'être une
        // fois le transfert en cours : les deux sont remplacés par le même avertissement que celui
        // du verrou (ne pas fermer la page ni débrancher l'appareil).
        if (backupRow) backupRow.style.display = 'none';
        btnCancel.style.display = 'none';
        if (inProgressNotice) inProgressNotice.style.display = '';

        // Une fois l'envoi démarré, le fichier est en cours d'injection/traitement côté ESP32
        // (restauration de config ou écriture flash) : fermer l'overlay ne l'arrête pas
        // proprement et priverait l'utilisateur de tout retour. Verrou 'hard' jusqu'à la réponse
        // du serveur (xhr.onload/onerror ci-dessous, qui le retire).
        setOverlayLock(el, 'hard', {
            titleKey: service === '/restore' ? 'PROMPT_RESTORE_IN_PROGRESS_TITLE' : 'PROMPT_UPDATE_IN_PROGRESS_TITLE',
            msgKey: service === '/restore' ? 'PROMPT_RESTORE_IN_PROGRESS_MSG' : 'PROMPT_UPDATE_IN_PROGRESS_MSG',
        });

        let xhr = new XMLHttpRequest();
        xhr.open('POST', baseUrl ? `${baseUrl}${service}` : service, true);
        // Même omission que dans backup() ci-dessus, et sur les quatre routes les plus sensibles du
        // firmware : /restore, /updateFirmware et /updateShadeConfig exigent
        // toutes une clé de configuration. Sans elle, tout téléversement depuis le navigateur
        // échouait dès qu'une sécurité était active.
        xhr.setRequestHeader('apikey', (typeof security !== 'undefined' ? security.apiKey : '') || '');

        xhr.upload.onprogress = (evt) => {
            let pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
            prog.style.setProperty('--progress', `${pct}%`);
            progVal.textContent = `${pct}%`;
        };

        xhr.onload = async () => {
            clearOverlayLock(el);
            // xhr.onerror ne couvre QUE les échecs réseau (DNS/connexion refusée...), jamais une
            // réponse HTTP d'erreur : un /restore ou /updateFirmware refusé
            // côté serveur (fichier invalide, place insuffisante...) répond bien 500 avec un corps
            // JSON {status,desc} (cf. WebSystem.cpp), mais atterrit ici, dans onload, pas onerror.
            // Sans ce contrôle, un échec serveur était traité exactement comme un succès -- au
            // pire silencieusement ignoré (mise à jour firmware/littlefs, l'appareil redémarre de
            // toute façon), au mieux carrément trompeur pour /restore : somfy.init() était rappelé
            // et la modale se refermait comme si la restauration avait réellement eu lieu, alors
            // que rien n'avait été restauré et qu'aucun redémarrage n'était même programmé côté
            // firmware dans ce cas (cf. handleRestore, branche else).
            if (xhr.status !== 200) {
                // Échec confirmé : l'avertissement "ne pas débrancher" n'a plus lieu d'être, et
                // l'utilisateur doit pouvoir refermer l'overlay normalement (btnCancel masqué au
                // lancement du transfert, cf. plus haut).
                if (inProgressNotice) inProgressNotice.style.display = 'none';
                btnCancel.style.display = '';
                btnCancel.innerText = tr('BT_CLOSE');
                let desc = '';
                try { desc = JSON.parse(xhr.responseText).desc || ''; } catch (e) { /* corps non JSON */ }
                ui.serviceError(el, { htmlError: xhr.status, service: `POST ${service}`, desc: desc || xhr.statusText || httpStatusText[xhr.status || 500] });
                return;
            }
            if (service === '/restore') {
                await somfy.init();
                closeOverlay(get('divUploadFile'));
            }
            else {
                // /updateFirmware : le serveur a répondu 200 et redémarre
                // ~500 ms plus tard (rebootDelay, WebSystem.cpp). L'overlay se ferme tout de suite
                // et laisse place à un message d'attente qui dit que l'installation a réussi. La
                // classe socket-wait en fait LE message de la coupure qui suit : socket.onclose
                // n'en empile pas un second "Connexion à l'appareil…", et socket.onopen le retire
                // au retour de l'appareil, ou recharge la page (reloadApp, posé ici pour les deux
                // services comme sur le chemin GitHub).
                general.reloadApp = true;
                closeOverlay(get('divUploadFile'));
                const sockWait = document.querySelector('.socket-wait');
                if (sockWait) ui.setWaitMessage(sockWait, 'WAIT_MSG_UPDATE_REBOOTING');
                else ui.waitMessage(get('divContainer'), 'WAIT_MSG_UPDATE_REBOOTING').classList.add('socket-wait');
            }
        };
        xhr.onerror = () => {
            clearOverlayLock(el);
            // Échec réseau : même rétablissement qu'en cas d'échec HTTP ci-dessus (xhr.onload),
            // voir le commentaire associé.
            if (inProgressNotice) inProgressNotice.style.display = 'none';
            btnCancel.style.display = '';
            btnCancel.innerText = tr('BT_CLOSE');
            ui.serviceError(el, 'Upload Failed');
        };
        // Ne tente plus d'annuler (xhr.abort()) : le verrou 'hard' posé ci-dessus bloque déjà la
        // fermeture pendant l'envoi, donc ce bouton ne peut de toute façon plus fermer l'overlay
        // tant que la requête est en vol -- requestCloseOverlay() se contente d'un retour visuel
        // (flashOverlayLocked) et referme normalement une fois le verrou levé (onload/onerror).
        btnCancel.onclick = () => requestCloseOverlay(el);
        xhr.send(formData);
    }
}
var firmware = new Firmware();
