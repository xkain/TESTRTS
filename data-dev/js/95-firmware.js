// --- MODE TEST OTA (design des barres de progression) ---
// A repasser a false avant tout commit/prod : quand true, le clic sur "btnUpdate" (apres
// confirmation du prompt, cf. confirmInstallGitRelease()) n'appelle plus /downloadFirmware ni
// firmware.backup(). Il se contente d'afficher l'ecran de progression (installGitRelease) avec
// les barres figees a DEBUG_FAKE_OTA_PCT%, sans verrou 'hard' -- l'overlay reste fermable en
// cliquant hors de la modale (pas de [close]/poignee mobile sur cet ecran, cf.
// renderGitInstallProgress()).
const DEBUG_FAKE_OTA = false;
const DEBUG_FAKE_OTA_PCT = 60;

class Firmware {
    initialized = false;
    init() { this.initialized = true; }
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
            xhr.send();
        });
    }

    restore() {
        let div = this.createFileUploader('/restore');
        // Le parent direct est maintenant instructions-content
        let instContent = div.querySelector('.instructions-content');
        //[id, bind, texte, checked]
        const opts = [
            ['cbRestoreShades', 'shades', 'RESTORE_SHADES_GROUPS', 1],
            ['cbRestoreRepeaters', 'repeaters', 'RESTORE_REPEATERS', 0],
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
        instContent.insertAdjacentHTML('afterbegin', overlayHeader('RESTORE_TITLE', 'RESTORE_DESC', 'svg-restore', { subtitle: 'RESTORE_DESC', showInfo: false }));

        shOverlay(div);
    }




















    createFileUploader(service) {
        const isRestore = service === '/restore', isMob = this.isMobile(), div = document.createElement('div');
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

        const firmwareHelp = service === '/updateFirmware' ? `
        <div class="help-container" data-tooltip-tr="FIRMWARE_MA_UPDATE_SYS_TOOLTIP">
        <svg class="help-svg"><use href="#icon-question"></use></svg>
        </div>` : service === '/updateApplication' ? `
        <div class="help-container" data-tooltip-tr="FIRMWARE_MA_UPDATE_LITTLEFS_TOOLTIP">
        <svg class="help-svg"><use href="#icon-question"></use></svg>
        </div>` : '';

        // Modifié : Le overlayHeader sera injecté dynamiquement ou est absent par défaut ici
        // pour laisser la méthode appelante (comme restore() ou updateManual()) le placer au début de .instructions-content
        div.innerHTML = `
        <div class="instructions-content UploadFile-content">
        <div class="overlay-scroll-content">
        <form method="POST" action="#" enctype="multipart/form-data" id="frmUploadApp">
        <div id="divInstText"></div>
        <div class="vertical-steps-container">
        ${step(1, `
        <div>${tr(service === '/updateFirmware' ? 'FIRMWARE_MA_UPDATE_SYS' : 'FIRMWARE_MA_UPDATE_LITTLEFS')}${firmwareHelp}</div>
        <a href="https://github.com/xkain/TESTRTS/releases" target="_blank" class="link" style="display:block; margin-top:5px;">${tr('FIRMWARE_MA_UPDATE_FROM_GITHUB')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a>
        `, isRestore)}
        <div class="v-step-item ${isRestore ? '' : 'has-extra-content'}" style="${isRestore ? 'height:auto;margin:15px 0 0' : ''}">
        <div class="v-step-left" style="${isRestore ? 'display:none' : ''}">
        <div class="step-counter">2</div><div class="v-step-line"></div>
        </div>
        <div class="v-step-right" style="${isRestore ? 'padding-left:0' : ''}">
        <input id="fileName" type="file" name="updateFS" style="display:none"
        onchange="const f=this.files[0];if(f){const s=get('span-selected-file');s.innerText=f.name;s.style.opacity='1';firmware.checkBackupVersion(f)}"/>
        <label for="fileName" class="custom-file-upload">
        <span id="span-selected-file" class="file-name-display">${tr('CHOOSE_FILE')}</span>
        <div class="file-icon-btn"><svg><use href="#svg-upload"></use></svg></div>
        </label>
        </div>
        </div>
        <div class="v-step-item" style="${isRestore ? 'display:none' : ''}">
        <div class="v-step-left"><div class="step-counter">3</div></div>
        <div class="v-step-right"><div>${tr('FIRMWARE_MA_UPDATE_VERIFY_0')} <svg class="svgInText"><use href="#svg-download"></use></svg> ${tr('FIRMWARE_MA_UPDATE_VERIFY_1')}</div></div>
        </div>
        </div>

        <div class="warning" style="${isRestore ? '' : 'display:none'}">
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
        <!-- Affiché uniquement pour /updateFirmware et /updateApplication une fois le téléversement
             confirmé par le serveur (200) : l'appareil va redémarrer dans l'instant (cf. rebootDelay
             côté firmware, WebSystem.cpp), ce n'est donc plus utile de laisser la barre figée à 100%
             en attendant un clic manuel sur "Fermer" -- voir firmware.uploadFile(). -->
        <div id="divFileUploadSuccess" class="information" style="display:none;margin:15px 0">
        <div class="information-header">
        <span class="remote-search-spinner"></span>
        <b>${tr('FIRMWARE_MA_UPDATE_SUCCESS_TITLE')}</b>
        </div>
        <div class="information-text"><span>${tr('FIRMWARE_MA_UPDATE_SUCCESS_DESC')}</span></div>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay"><div class="footer-sticky-content">
        <div class="uniRow backup-row" style="${isRestore ? 'display:none' : ''}">
        <div class="uniText">
        <span class="uniLabel">${tr('FIRMWARE_MT_SAVE_BACKUP')}</span>
        <span class="uniStatus">${tr(isMob ? 'FIRMWARE_MT_SAVE_BACKUP_DESC_MOB' : 'FIRMWARE_MT_SAVE_BACKUP_DESC')}</span>
        </div>
        <div id="btnBackupCfg" class="gitBackup" onclick="firmware.backup()"><svg><use href="#svg-download"></use></svg></div>
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
                            get('span-selected-file').innerText = tr('CHOOSE_FILE');
                            closeOverlay(prompt);
                        };
                    }
                }
            }
        };
        reader.readAsText(file.slice(0, 100));
    }
    procMemoryStatus(mem) {
        let sp = get('spanFreeMemory');
        if (sp) sp.innerHTML = mem.free.fmt("#,##0 ");
        sp = get('spanMaxMemory');
        if (sp) sp.innerHTML = mem.max.fmt('#,##0 ');
        sp = get('spanMinMemory');
        if (sp) sp.innerHTML = mem.min.fmt('#,##0 ');

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


    procFwStatus(rel) {
        // Fin réelle d'une mise à jour en cours (overlay encore ouvert) : la barre littlefs à
        // 100% (cf. procUpdateProgress) ne ferme plus elle-même l'overlay -- elle attend ce
        // dernier événement, qui n'arrive qu'une fois la partition validée ET la réinstallation
        // best-effort du pack de langue actif tentée côté device (cf. GitUpdater::beginUpdate()).
        // Placé avant le guard divsGlobal ci-dessous : cette fermeture ne doit pas dépendre de la
        // présence du badge de mise à jour dans la page actuellement affichée derrière l'overlay.
        const gitInst = get('divGitInstall');
        if (gitInst && rel.status === 4) {
            clearOverlayLock(gitInst);
            gitInst.remove();
            if (rel.error === 0) {
                const subMsg = `${tr('GIT_RELEASE_SUCCES_1')}<br>${tr('GIT_RELEASE_SUCCES_2')}`;
                ui.successMessage(tr('GIT_RELEASE_SUCCESS_TITLE'), subMsg);
            } else {
                let e = errors.find(x => x.code === rel.error) || { desc: tr('ERR_UNSPECIFIED') };
                ui.errorMessage(e.desc);
            }
            return;
        }

        const divsGlobal = document.querySelectorAll('.firmware-message');
        const btnGit = get('btnUpdateGithub');
        const gitDesc = get('gitUpdateDesc');
        const statusRight = get('gitUpdateStatusRight');

        if (divsGlobal.length === 0) return;
        divsGlobal.forEach(div => {
            div.classList.remove('procFwStatusshow');
            div.onclick = null;
        });

        // --- CAS 1 : UNE MISE À JOUR EST DISPONIBLE ---
        if (rel.available && rel.status === 0 && rel.checkForUpdate !== false) {
            divsGlobal.forEach(div => {
                div.classList.add('procFwStatusshow');
                div.style.cursor = 'pointer';
                div.onclick = () => { firmware.updateGithub(); };
                div.innerHTML = `<span>${tr('FW_UPDATE_AVAILABLE')}</span>`;
            });

            if (btnGit) {
                const currentMajor = this.getMainVersion(rel.appVersion?.name || get('spanFwVersion')?.innerText);
                const targetMajor = this.getMainVersion(rel.latest?.name);
                const isBlocked = (currentMajor < 3 && targetMajor >= 3) || (currentMajor >= 3 && targetMajor < 3);

                if (gitDesc) {
                    gitDesc.innerHTML = isBlocked
                    ? tr('FW_UPDATE_USB_DESC').replace('%1', rel.latest.name)
                    : tr('FW_UPDATE_ACTION_DESC');
                }

                if (statusRight) {
                    // rel.latest.name vient du tag_name GitHub, préfixe "v" déjà inclus (cf.
                    // GitRelease::setReleaseProperty côté firmware) -- ne pas en rajouter un.
                    const badgeText = isBlocked ? "USB REQUIS" : rel.latest.name;
                    // Toujours 'state-disabled' (badge rouge) en cas de MAJ requise ou disponible
                    statusRight.innerHTML = `<span class="status-badge state-danger">${badgeText}</span>`;
                }
            }
        }
        // --- CAS 2 : ERREUR DE VÉRIFICATION ---
        else if (rel.status === 4 && rel.error !== 0) {
            let e = errors.find(x => x.code === rel.error) || { desc: tr('ERR_UNSPECIFIED') };
            let inst = get('divGitInstall');
            if (inst) inst.remove();
            ui.errorMessage(e.desc);
        }
        // --- CAS 3 : LE SYSTÈME EST À JOUR ---
        else {
            if (btnGit) {
                if (gitDesc) gitDesc.innerHTML = tr('FW_UPDATE_UPTODATE');

                if (statusRight) {
                    const currentVersion = rel.appVersion?.name || get('spanFwVersion')?.innerText || "";
                    statusRight.innerHTML = `<span class="status-badge state-success">v${currentVersion}</span>`;
                }
            }
        }
    }

    procUpdateProgress(prog) {
        const pct = Math.round((prog.loaded / prog.total) * 100);
        general.reloadApp = true;
        const git = get('divGitInstall');
        if (!git) return;

        if (prog.part === 100) {
            const btnCancel = get('btnCancelUpdate');
            if (btnCancel) btnCancel.style.display = 'none';
        }
        const isApplication = prog.part === 100;
        const p = isApplication ?
        get('progApplicationDownload') :
        get('progFirmwareDownload');

        if (p) {
            p.style.setProperty('--progress', `${pct}%`);
            const val = get(`${p.id}-value`);
            if (val) val.textContent = `${pct}%`;
        }

        // Stepper à 3 étapes (cf. renderGitInstallProgress) : firmware et littlefs sont flashés
        // l'un après l'autre, jamais en parallèle (cf. GitUpdater::beginUpdate()), donc le seul
        // signal fiable pour distinguer "étape 1 encore en cours" de "étape 2 démarrée" est le
        // changement de partition (prog.part) porté par cet évènement -- pas le %, qui repasse à 0
        // au tout début de chaque fichier. isApplication===false -> étape 1 (firmware). Une fois
        // sur l'application/littlefs, étape 2 tant que pct < 100, puis étape 3 (redémarrage) dès
        // que ce flash-là atteint 100% -- Update.end(true)/validateFilesystem()/le redémarrage
        // programmé côté ESP32 suivent immédiatement, sans évènement de progression dédié.
        ui.wizSetStep(git, isApplication ? (pct >= 100 ? 3 : 2) : 1);

        // Volontairement pas de fermeture de l'overlay / message de succès ici dès que la barre
        // littlefs atteint 100% : GitUpdater::beginUpdate() valide encore le filesystem et
        // réinstalle éventuellement le pack de langue actif après ce dernier octet écrit
        // (best-effort, cf. procLangRestore ci-dessous) avant de programmer le redémarrage. La
        // barre reste donc figée à 100%, c'est fwStatus (status=4/GIT_UPDATE_COMPLETE, cf.
        // procFwStatus) qui marque désormais la vraie fin de ce post-traitement.
    }

    // Retour visuel de la réinstallation best-effort du pack de langue actif après l'écriture du
    // filesystem.bin (cf. GitUpdater::beginUpdate()/emitLangRestoreStatus, événement socket
    // gitLangRestore). N'apparaît que si la langue active n'est pas la langue embarquée par
    // défaut -- sinon rien n'est tenté côté device et cet événement n'arrive jamais.
    procLangRestore(msg) {
        const status = get('divGitPostStatus');
        if (!status) return;
        const spinner = status.querySelector('.remote-search-spinner');
        const textEl = get('spanGitPostStatusText');
        status.style.display = '';

        if (msg.state === 'start') {
            if (spinner) spinner.style.display = '';
            if (textEl) textEl.textContent = tr('GIT_LANG_RESTORE_IN_PROGRESS').replace('%1', msg.code);
        } else {
            if (spinner) spinner.style.display = 'none';
            if (textEl) {
                textEl.textContent = tr(msg.state === 'success' ? 'GIT_LANG_RESTORE_SUCCESS' : 'GIT_LANG_RESTORE_FAILED').replace('%1', msg.code);
            }
        }
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
    // Stepper à 3 étapes (firmware et interface web sont flashés séquentiellement, jamais en
    // parallèle -- cf. GitUpdater::beginUpdate()) : le pilotage (quelle étape est .active/
    // .completed) se fait via ui.wizSetStep(div, n), appelé une première fois ici pour l'état
    // initial (étape 1) puis à chaque évènement de progression dans procUpdateProgress() ci-
    // dessous. Le pack de langue actif (réinstallation best-effort après le filesystem.bin, cf.
    // divGitPostStatus/procLangRestore) n'a volontairement pas sa propre étape : chronologiquement
    // il se déroule pendant la finalisation qui précède le redémarrage (étape 3), son bloc reste
    // donc simplement à sa place actuelle, affiché uniquement si l'évènement gitLangRestore arrive.
    renderGitInstallProgress(div, verName) {
        const desc = tr('GIT_RELEASE_DESC').replace('%1', verName);

        // divGitInstall bascule de .inst-overlay (écran de sélection de version, potentiellement
        // long avec les notes de release -- cf. updateGithub()) à .modal-overlay pour cet écran de
        // progression, beaucoup plus court (stepper + 2 barres + footer) : dialogue centré sur
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
        // Devenu .modal-overlay, divGitInstall entre dans le champ de ui.clearErrors() --
        // querySelectorAll('div.modal-overlay') SANS distinction, appelée par exemple juste après
        // confirmInstallGitRelease() (le clic sur #btnYes du prompt de confirmation fait
        // onYes() PUIS clearErrors()) -- qui le refermerait donc immédiatement après son
        // affichage. data-keepOpen='true' est l'échappatoire déjà prévue pour ce cas exact (cf.
        // clearErrors() dans 30-ui-binder.js) ; closeOverlay()/requestCloseOverlay() l'ignorent,
        // donc les fermetures volontaires (clic hors-modale tant qu'aucun verrou 'hard' n'est
        // posé) continuent de fonctionner normalement.
        div.dataset.keepOpen = 'true';

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

        <div class="progress-bar-header"><span class="progress-bar-label">${tr('GIT_RELEASE_FIRMWARE_INSTALL_PROGRESS')}</span><span class="progress-bar-value" id="progFirmwareDownload-value">0%</span></div>
        <div class="progress-bar" id="progFirmwareDownload"><div class="progress-bar-fill"></div></div>
        <div class="progress-bar-header"><span class="progress-bar-label">${tr('GIT_RELEASE_APPLICATION_INSTALL_PROGRESS')}</span><span class="progress-bar-value" id="progApplicationDownload-value">0%</span></div>
        <div class="progress-bar" id="progApplicationDownload"><div class="progress-bar-fill"></div></div>

        <!-- Masqué par défaut : affiché uniquement pendant la réinstallation best-effort du
        pack de langue actif après l'écriture du filesystem.bin (cf. procLangRestore, événement
        socket gitLangRestore émis par GitUpdater::beginUpdate()). La barre ci-dessus reste
        figée à 100% pendant ce temps -- cf. procUpdateProgress/procFwStatus. -->
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

        // Pas de bouton Annuler ici : une fois /downloadFirmware déclenché, le flash continue
        // côté ESP32 quoi qu'il arrive (aucune route /cancelInstallGit côté firmware), donc
        // aucune annulation n'est réellement possible -- en proposer une serait trompeur. Aucun
        // [close] dans le header (pas de rightContent sur modalHeader() ci-dessus) ni de poignée
        // mobile (cf. #divGitInstall .modalHeader-handle dans overlays.css) : le seul geste qui
        // reste est le clic hors-modale, déjà intercepté par requestCloseOverlay() via l'écouteur
        // générique (cf. 20-shell.js) -- qui refuse la fermeture tant que le verrou 'hard' posé
        // ci-dessus est actif (cf. flashOverlayLocked). La confirmation avant de lancer le flash
        // (cf. confirmInstallGitRelease()) est donc la seule porte de sortie réelle.

        // État initial du stepper : étape 1 (firmware) active. Les transitions suivantes sont
        // pilotées par procUpdateProgress() au fil des évènements socket updateProgress.
        ui.wizSetStep(div, 1);
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
        prompt.querySelector('.sub-message').innerHTML = `<p>${tr('GIT_RELEASE_CONFIRM_SUB')}</p>`;
    }

    async installGitRelease(div) {
        let obj = ui.fromElement(div);

        // --- MODE TEST OTA (cf. DEBUG_FAKE_OTA en tête de fichier) ---
        // Aucun appel réseau (ni backup, ni /downloadFirmware) : on affiche juste l'écran de
        // progression avec les barres figées à DEBUG_FAKE_OTA_PCT%, sans verrou 'hard', pour
        // pouvoir retoucher le CSS/design tranquillement et fermer l'overlay à tout moment.
        if (DEBUG_FAKE_OTA) {
            this.renderGitInstallProgress(div, obj.version || 'X.X.X');
            // Firmware figé à 100% (terminé) et application à DEBUG_FAKE_OTA_PCT% (en cours), pour
            // exercer visuellement les 3 états du stepper (complété/actif/à venir) en une seule fois.
            const fake = { progFirmwareDownload: 100, progApplicationDownload: DEBUG_FAKE_OTA_PCT };
            Object.keys(fake).forEach(id => {
                const p = div.querySelector(`#${id}`);
                if (p) {
                    p.style.setProperty('--progress', `${fake[id]}%`);
                    const val = div.querySelector(`#${id}-value`);
                    if (val) val.textContent = `${fake[id]}%`;
                }
            });
            ui.wizSetStep(div, 2);
            return;
        }

        if (!this.isMobile()) {
            try { await firmware.backup(); }
            catch (err) { return ui.serviceError(div, err); }
        }
        // Même port dédié que /getReleases ci-dessus (cf. gitSyncOrigin()) -- `ver` reste passé en
        // query string, lu côté firmware via WebServer::arg() (fonctionne quelle que soit la
        // méthode, contrairement à un corps de requête).
        this.gitSyncFetch(`/downloadFirmware?ver=${obj.version}`, { method: 'POST' }, (err, ver) => {
            if (err) return ui.serviceError(err);
            general.reloadApp = true;
            // Le flash continue de toute façon côté ESP32 une fois lancé : fermer cet overlay ne
            // l'arrête pas, ça ne fait que priver l'utilisateur de tout retour (croyant avoir
            // annulé). Verrou 'hard' jusqu'à l'évènement fwStatus final (cf. procFwStatus,
            // rel.status === 4), qui retire lui-même l'overlay du DOM.
            setOverlayLock(div, 'hard', {
                titleKey: 'PROMPT_UPDATE_IN_PROGRESS_TITLE',
                msgKey: 'PROMPT_UPDATE_IN_PROGRESS_MSG',
            });
            this.renderGitInstallProgress(div, ver.name);
        });
    }
    // /getReleases et /downloadFirmware sont servies par un serveur HTTP synchrone dédié, isolé
    // d'ESPAsyncWebServer/async_tcp (WebGitSync.cpp, port GIT_SYNC_PORT) -- root cause de
    // l'instabilité mémoire OTA (audit du 14-15/08/2026) : le fetch GitHub bloquant (~3-4s)
    // tournait jusque-là sur la tâche async_tcp, la même qui traite en parallèle toutes les
    // connexions WebSocket/HTTP -- une activité socket concurrente (reconnexion de page, plusieurs
    // onglets) survenant PENDANT ce blocage faisait chuter durablement le tas sous le seuil
    // qu'exige un handshake TLS côté device, y compris après plusieurs correctifs plus ciblés
    // (connexion redondante supprimée, drainage, modèle différé par sondage...). Un appel bloquant
    // classique suffit maintenant : ce port ne partage plus rien avec async_tcp.
    gitSyncOrigin() {
        return `http://${isDevHost ? hst : window.location.hostname}:${GIT_SYNC_PORT}`;
    }
    // fetch() direct plutôt que deviceFetch()/getJSONSync (toutes deux pensées pour une URL
    // relative résolue via baseUrl, cf. 00-bootstrap.js) : ce port cross-origin (port différent de
    // la page principale, même sur l'appareil lui-même) a besoin d'une URL absolue à part.
    gitSyncFetch(path, options, cb) {
        const overlay = ui.waitMessage(get('divContainer'), 'MSG_WAIT_LOADING');
        const opts = Object.assign({ headers: { apikey: security.apiKey || '' } }, options);
        fetch(this.gitSyncOrigin() + path, opts)
            .then(resp => resp.text().then(txt => ({ resp, txt })))
            .then(({ resp, txt }) => {
                overlay.remove();
                let body = {};
                try { body = txt ? JSON.parse(txt) : {}; } catch (e) { /* corps non JSON */ }
                if (!resp.ok) {
                    body.htmlError = resp.status;
                    if (typeof body.desc === 'undefined') body.desc = resp.statusText || httpStatusText[resp.status] || httpStatusText['500'];
                    return cb(body, null);
                }
                cb(null, body);
            })
            .catch(err => { overlay.remove(); cb({ desc: String(err && err.message || err) }, null); });
    }

    updateGithub() {
        this.gitSyncFetch('/getReleases', { method: 'GET' }, (err, rel) => {
            if (err) {
                if (typeof err.error !== 'undefined') {
                    let e = errors.find(x => x.code === err.error) || { desc: tr('ERR_UNSPECIFIED') };
                    return ui.errorMessage(e.desc);
                }
                return ui.serviceError(err);
            }

            const div = document.createElement('div'), isMob = this.isMobile();
            const chip = (get('divContainer').getAttribute('data-chipmodel') || "").toLowerCase();
            div.id = 'divGitInstall';
            div.className = 'inst-overlay';

            rel.releases.sort((a, b) => a.preRelease === b.preRelease && b.draft === a.draft ? 0 : a.preRelease ? 1 : -1);

            // Comparaison numérique major/minor/build (déjà fournis par /getReleases, pas besoin de
            // parser la chaîne "name") : la release installée doit rester sélectionnable pour
            // permettre une réinstallation, donc >= et pas > (v3.0.0 installée >= v3.0.0 du repo).
            // Indispensable aussi car les "name" ne sont PAS directement comparables entre eux :
            // le tag GitHub garde son préfixe ("v3.0.0", cf. GitRelease::setReleaseProperty) alors
            // que /appversion en est dépouillé au build (cf. build.yaml, "${TAG#v}") -- appVersion.name
            // vaut donc "3.0.0" sans le "v".
            const verNum = v => ((v?.major || 0) * 1000000) + ((v?.minor || 0) * 1000) + (v?.build || 0);
            const currentVerNum = verNum(rel.appVersion);

            // --- INJECTION DE LA VERSION COURANTE DE L'ESP (numérique, cf. commentaire ci-dessus) ---
            div.setAttribute('data-currentvernum', currentVerNum);

            // --- FILTRAGE DES OPTIONS DU SÉLECTEUR ---
            const optsHtml = rel.releases.map(r => {
                const name = r.name.toLowerCase();
                if (name === 'main' || name === 'master' || (r.hwVersions.length > 0 && r.hwVersions.indexOf(chip) < 0)) return '';

                // Si la version de la release GitHub est inférieure à la v3.0.0, on ne l'affiche pas du tout
                const targetMajor = this.getMainVersion(r.version.name);
                if (targetMajor < 3) return '';

                // Versions strictement plus anciennes que celle installée : masquées. La version
                // installée elle-même reste visible (réinstallation/flash propre).
                if (verNum(r.version) < currentVerNum) return '';

                return `<option value="${r.version.name}" data-prerelease="${r.preRelease}" data-vernum="${verNum(r.version)}">${r.name}${r.preRelease ? ' - Pre' : ''}</option>`;
            }).join('');

            div.innerHTML = `
            <div class="instructions-content github-content">
            ${overlayHeader('FIRMWARE_OTA_TITLE', 'FIRMWARE_OTA_TITLE_DESC', 'svg-github')}

            <!-- Zone statique du haut (Sélecteurs + Lien) -->
            <div class="overlay-static-content">
            <div class="baseFlexRow"><span class="uniLabel">${tr('FIRMWARE_MT_INSTALLED')}</span><span class="labelgrey">v${rel.appVersion.name}</span></div>
            <div class="baseFlexRow">
            <span class="uniLabel">${tr('FIRMWARE_OTA_AVAILABLE')}</span>
            <select id="selVersion" class="selectCompac" data-bind="version">${optsHtml}</select>
            </div>
            <a id="lnkGithubRelease" href="#" target="_blank" class="link">${tr('FIRMWARE_OTA_NOTE_GITHUB')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a>


            </div> <!-- <-- ICI : Elle s'arrête bien juste après le lien 'lnkGithubRelease' -->
            <div class="hrModal"></div>

            <!-- Zone défilante pour les alertes et les notes de version -->
            <div class="overlay-scroll-content">
            <div id="divPrereleaseWarning" class="error" style="display:none;">
            <div class="error-header">
            <svg><use href="#svg-error"></use></svg>
            <b>${tr('MSG_ALERT')}</b>
            </div>
            <div class="information-text">
            <span id="spanUpdateWarning"></span>
            </div>
            </div>


            <div class="warningText"><svg><use href="#svg-warning"></use></svg><span>${tr('FIRMWARE_MT_CACHE')}</span></div>

            <!-- Conteneur des notes dynamique (prend le scroll) -->
            <div id="notesPreview" class="release-notes-preview">
            <div class="wifiConnectScan">
            <div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
            </div>
            </div>
            </div>

            <!-- Footer collant en bas -->
            <div class="hrDivFooter-Instruc"></div>
            <div class="button-container-overlay">
            <div class="footer-sticky-content">
            <div class="uniRow">
            <div class="uniText"><span class="uniLabel">${tr('FIRMWARE_MT_SAVE_BACKUP')}</span><span class="uniStatus">${tr(isMob ? 'FIRMWARE_MT_SAVE_BACKUP_DESC_MOB' : 'FIRMWARE_MT_SAVE_BACKUP_DESC')}</span></div>
            <div id="btnBackupCfg" class="gitBackup" onclick="firmware.backup()"><svg><use href="#svg-download"></use></svg></div>
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
                if (!nDiv || !sel || !sel.value) return;

                nDiv.innerHTML = '<div class="wifiConnectScan"><div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div></div>';

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
                if (spanWarning) spanWarning.innerHTML = tr('FIRMWARE_OTA_RELEASE_BETA');
                divPre.style.display = 'flex';
            } else {
                divPre.style.display = 'none';
            }
        }
    }
    async getReleaseInfo(tag, silent = false) {
        let overlay = null;
        if (!silent) overlay = ui.waitMessage(document.getElementById('divContainer'));
        try {
            let ret = { resp: { ok: false }, info: null };
            ret.resp = await fetch(`https://api.github.com/repos/xkain/TESTRTS/releases/tags/${tag}`);
            if (ret.resp.ok) {
                ret.info = await ret.resp.json();
            }
            return ret;
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
    updateManual(isApp = false) {
        const service = isApp ? '/updateApplication' : '/updateFirmware';
        const div = this.createFileUploader(service);

        if (isApp) general.reloadApp = true;
        const currentVer = isApp ? (general?.appVersion || this.appVersion) : (get('spanFwVersion').innerText || '?.?.?');

        // Modifié : Ajout de overlayHeader directement comme premier enfant de .instructions-content
        let instContent = div.querySelector('.instructions-content');
        instContent.insertAdjacentHTML('afterbegin', overlayHeader('FIRMWARE_MA_UPDATE_TITLE', isApp ? 'FIRMWARE_MA_LITTLEFS_DESC' : 'FIRMWARE_MA_FIRMWARE_DESC', 'svg-update'));

        div.querySelector('#divInstText').innerHTML = `



        <div class="overlay-static-content">
        <div class="baseFlexRow"><span class="uniLabel">${tr('FIRMWARE_MT_INSTALLED')}</span><span class="labelgrey">${currentVer}</span></div>
        <div class="warningText"><span>${tr('FIRMWARE_MT_CACHE')}</span></div></div>



        </div> <!-- <-- ICI : Elle s'arrête bien juste après le lien 'lnkGithubRelease' -->
        <div class="hrModal"></div>`;

        div.className += isApp ? ' mode-app-update' : ' mode-firm-update';
        shOverlay(div);

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
            : (service === '/updateApplication' ? 'ERR_NO_FILE_LITTLEFS_SELECTED' : 'ERR_NO_FILE_FIRMWARE_SELECTED');
        }
        else {
            // Extrait uniquement le nom du fichier (supprime le C:\fakepath\)
            const cleanFileName = filename.split(/(\\|\/)/).pop();

            // --- INTERCEPTION SPÉCIFIQUE DES ANCIENNES VERSIONS V2 (SomfyController) ---
            if (cleanFileName.includes('SomfyController')) {
                const isOldFS = cleanFileName.includes('littlefs');
                const fileTypeKey = isOldFS ? 'ERR_FIRMWARE_TYPE_LITTLEFS' : 'ERR_FIRMWARE_TYPE_FIRMWARE';

                customErrMsg = tr('ERR_FIRMWARE_V2_INCOMPATIBLE')
                .replace('%file%', cleanFileName)
                .replace('%type%', tr(fileTypeKey));
            }
            // --- VALIDATIONS STRICTES V3 + ---
            // Validation filesystem V3 + : Doit respecter le nommage 'ESPSomfyRTS_..._filesystem.bin'
            // (générique) ou 'ESPSomfyRTS_..._filesystem_BOX.bin' (boîtiers) -- d'où un simple
            // "includes('_filesystem')" plutôt qu'un endsWith, qui ne couvrirait que la 1re forme.
            else if (service === '/updateApplication' && (!cleanFileName.startsWith('ESPSomfyRTS_') || !cleanFileName.includes('_filesystem') || !cleanFileName.endsWith('.bin'))) {
                err = 'ERR_INVALID_FILE_LITTLEFS';
            }
            // Validation Firmware V3 + : Doit commencer par 'ESPSomfyRTS_', finir par '.bin' et ne pas être le fichier filesystem
            else if (service === '/updateFirmware' && (!cleanFileName.startsWith('ESPSomfyRTS_') || cleanFileName.includes('_filesystem') || !cleanFileName.endsWith('.bin'))) {
                err = 'ERR_INVALID_FILE_FIRMWARE';
            }
            else if (service === '/restore') {
                if (file.size > 20480) {
                    const msg = tr('ERR_BACKUP_TOO_LARGE').replace('%s', file.size.fmt("#,##0"));
                    ui.errorMessage(title, msg);
                    return;
                }
                if (!cleanFileName.endsWith('.backup')) err = 'ERR_INVALID_FILE_BACKUP';
                else if (!['shades', 'settings', 'network', 'transceiver', 'repeaters', 'mqtt'].some(k => data[k])) err = 'ERR_NO_RESTORE_OPTION';
            }
        }

        // Affichage de l'erreur si déclenchée
        if (customErrMsg || err) {
            const message = customErrMsg ? customErrMsg : tr(err);
            ui.errorMessage(title, message);
            return;
        }

        if (service !== '/restore' && !this.isMobile()) {
            try { await firmware.backup(); }
            catch (e) { return ui.serviceError(el, e); }
        }

        let formData = new FormData();
        formData.append('file', file);
        if (service === '/restore') formData.append('data', JSON.stringify(data));

        ['btnBackupCfg', 'btnUploadFile'].forEach(id => { let b = el.querySelector('#' + id); if (b) b.style.display = 'none'; });
        field.disabled = true;
        let steps = el.querySelector('.vertical-steps-container');
        if (steps) steps.style.display = 'none';
        let progWrap = el.querySelector('#divFileUploadProgress'),
        prog = el.querySelector('#progFileUpload'),
        progVal = el.querySelector('#progFileUpload-value'),
        btnCancel = el.querySelector('#btnClose');
        progWrap.style.display = '';

        // Une fois l'envoi démarré, le fichier est en cours d'injection/traitement côté ESP32
        // (restauration de config ou écriture flash) : fermer l'overlay ne l'arrête pas
        // proprement et priverait l'utilisateur de tout retour. Verrou 'hard' jusqu'à la réponse
        // du serveur (xhr.onload/onerror ci-dessous, qui le retire).
        setOverlayLock(el, 'hard', {
            titleKey: 'PROMPT_RESTORE_IN_PROGRESS_TITLE',
            msgKey: 'PROMPT_RESTORE_IN_PROGRESS_MSG',
        });

        let xhr = new XMLHttpRequest();
        xhr.open('POST', baseUrl ? `${baseUrl}${service}` : service, true);

        xhr.upload.onprogress = (evt) => {
            let pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
            prog.style.setProperty('--progress', `${pct}%`);
            progVal.textContent = `${pct}%`;
        };

        xhr.onload = async () => {
            clearOverlayLock(el);
            btnCancel.innerText = tr('BT_CLOSE');
            // xhr.onerror ne couvre QUE les échecs réseau (DNS/connexion refusée...), jamais une
            // réponse HTTP d'erreur : un /restore, /updateFirmware ou /updateApplication refusé
            // côté serveur (fichier invalide, place insuffisante...) répond bien 500 avec un corps
            // JSON {status,desc} (cf. WebSystem.cpp), mais atterrit ici, dans onload, pas onerror.
            // Sans ce contrôle, un échec serveur était traité exactement comme un succès -- au
            // pire silencieusement ignoré (mise à jour firmware/littlefs, l'appareil redémarre de
            // toute façon), au mieux carrément trompeur pour /restore : somfy.init() était rappelé
            // et la modale se refermait comme si la restauration avait réellement eu lieu, alors
            // que rien n'avait été restauré et qu'aucun redémarrage n'était même programmé côté
            // firmware dans ce cas (cf. handleRestore, branche else).
            if (xhr.status !== 200) {
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
                // /updateFirmware ou /updateApplication : le serveur a déjà répondu 200 avant de
                // programmer son propre redémarrage (~500ms, cf. rebootDelay côté firmware,
                // WebSystem.cpp) -- l'overlay ne doit donc pas rester figé sur la barre à 100% en
                // attendant un clic manuel sur "Fermer". On affiche un état de succès explicite
                // puis on referme automatiquement, pour laisser la reprise de connexion générique
                // (socket.onclose -> "MSG_WAIT_CONNECTING", cf. initSockets() dans 20-shell.js, qui
                // recharge déjà la page si general.reloadApp est vrai) gérer la suite sans se
                // superposer à cette modale.
                if (progWrap) progWrap.style.display = 'none';
                let successBox = el.querySelector('#divFileUploadSuccess');
                if (successBox) successBox.style.display = '';
                let footer = el.querySelector('.button-container-row');
                if (footer) footer.style.display = 'none';
                setTimeout(() => closeOverlay(get('divUploadFile')), 1500);
            }
        };
        xhr.onerror = () => { clearOverlayLock(el); ui.serviceError(el, 'Upload Failed'); };
        // Ne tente plus d'annuler (xhr.abort()) : le verrou 'hard' posé ci-dessus bloque déjà la
        // fermeture pendant l'envoi, donc ce bouton ne peut de toute façon plus fermer l'overlay
        // tant que la requête est en vol -- requestCloseOverlay() se contente d'un retour visuel
        // (flashOverlayLocked) et referme normalement une fois le verrou levé (onload/onerror).
        btnCancel.onclick = () => requestCloseOverlay(el);
        xhr.send(formData);
    }
}
var firmware = new Firmware();
