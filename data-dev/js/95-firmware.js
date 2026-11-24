// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS

class Firmware {
    initialized = false;
    init() {
        this.initialized = true;
        // Rotation du téléphone ou redimensionnement de la fenêtre : la largeur disponible change,
        // donc la taille calculée par fitFileName() ne vaut plus. Écouteur posé une fois pour
        // toutes plutôt qu'à l'ouverture de l'overlay -- il n'a pas de cible à traiter en dehors
        // de sa durée de vie, et il n'y a ainsi rien à retirer quand l'overlay est détruit.
        window.addEventListener('resize', () => this.fitFileName());
        const page = get('divFirmware');
        this._tabs = bindGenTabs({ tabs: 'fwTabs', panels: 'fwPanels', pager: 'fwPager', prev: 'btnFwPrev', next: 'btnFwNext', route: 'divFirmware' });
        // Rien à enregistrer sur cette page : chaque réglage part tout de suite (setOption), il ne
        // doit donc pas marquer la page « modifiée » auprès de watchDirty (#divSystemSettings).
        page.addEventListener('change', (e) => e.stopPropagation());
    }
    // Réglage appliqué à la volée : seul ce champ est envoyé (la route lit les clés présentes),
    // jamais le formulaire Général qui peut contenir des saisies non enregistrées.
    setOption(key, el) {
        const val = el.checked;
        putJSONSync('/setgeneral', { [key]: val }, (err) => {
            if (err) {
                el.checked = !val;
                return ui.serviceError(err);
            }
            if (general._lastSettings) general._lastSettings[key] = val;
            if (key === 'enableDebugLogs') logger.setDebugEnabled(val);
            if (key === 'checkForUpdate') {
                if (this.fwInfo) this.fwInfo.checkForUpdate = val;
                this.refreshUpdateBadge();
            }
            ui.toast(tr('MSG_SAVE_SUCCESS'));
        });
    }
    checkNow() {
        this._catalog = null;
        this.refreshUpdateBadge(true);
    }
    // Un build de développement porte le sha après la version (v3.0.0-6e58fe6, cf. build.yaml) ;
    // un build local garde FW_VERSION nu et passe donc pour stable.
    renderVersion(name) {
        if (!name) return;
        const dev = /^v?\d+\.\d+\.\d+-/.test(name);
        get('spanFwVersion').innerText = name;
        document.querySelectorAll('.fw-version').forEach(el => { el.textContent = name; });
        get('fwChannelTile').setAttribute('data-channel', dev ? 'dev' : 'stable');
        document.querySelectorAll('.fw-channel-short').forEach(el => { el.textContent = tr(dev ? 'CHANNEL_DEV' : 'CHANNEL_STABLE'); });
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

    restore(o = {}) {
        this._rstMigrate = !!o.migrate;
        // skin sans data-obj connu : peau du hero à la teinte neutre de la page Maintenance.
        const div = this.createFileUploader('/restore', {
            titleKey: 'RESTORE_TITLE', descKey: 'RESTORE_DESC', icon: 'svg-restore', skin: 'fw',
            stateKey: tr('RESTORE_STATE_FILE'), stateValue: '—',
            sectionKey: 'RESTORE_SECTION', hintKey: 'RESTORE_CONFIRM_SUB',
            afterDrop: `
            <div id="rstIntro" class="genmod-note is-info"><svg><use href="#svg-info"></use></svg><span><b>${tr('RESTORE_INTRO_TITLE')}</b>${tr('RESTORE_INTRO')}</span></div>
            <div id="rstBody" class="genmod-form"></div>`
        });
        div.querySelector('#rstBody').addEventListener('change', () => this.syncRestore(div));
        const btn = div.querySelector('#btnUploadFile');
        btn.textContent = tr('BT_RESTORE');
        btn.disabled = true;
        shOverlay(div);
    }
    // Le fichier est lu ici, avant tout envoi : une sauvegarde v3 (NDJSON) dit d'où elle vient et ce
    // qu'elle contient. L'ancien format n'est pas décodé : seul son numéro de génération est lu.
    readBackup(file) {
        const r = new FileReader();
        r.onload = () => this.renderRestore(file, String(r.result));
        r.readAsText(file.slice(0, 65537));
    }
    renderRestore(file, txt) {
        const w = get('divUploadFile'), body = w && w.querySelector('#rstBody');
        if (!body) return;
        const h = escHtml;
        const f = { shade: [], group: [], room: [], schedule: [], repeater: [], listener: [] };
        const old = txt[0] !== '{';
        if (!old) txt.split('\n').forEach(l => {
            try { const x = JSON.parse(l); if (Array.isArray(f[x.rec])) f[x.rec].push(x); else f[x.rec] = x; } catch (e) { }
        });
        const meta = f.meta;
        if (!old && !meta) return ui.errorMessage(tr('MSG_ALERT'), tr('ERR_INVALID_FILE_BACKUP'));
        const s = f.settings || {}, net = f.net || {}, mq = f.mqtt || {}, rd = f.radio || {};
        const same = !old && meta.serverId === window.__serverId;
        const profile = get('divContainer').getAttribute('data-hardwareprofile') || '';
        const otherBoard = !old && meta.profile && meta.profile !== profile;
        const d = !old && new Date(meta.created), date = d && d.getFullYear() > 2020 ? d.toLocaleDateString() : '';
        const cur = [(somfy.shades || []).length, (somfy.groups || []).length, _rooms.filter(r => r.roomId).length,
            (somfy.schedules || []).length, (somfy.repeaters || []).length, (somfy.listeners || []).length];
        const fil = [f.shade.length, f.group.length, f.room.length, f.schedule.length, f.repeater.length, f.listener.length];
        const diff = i => tr('RESTORE_DIFF').replace('%1', fil[i]).replace('%2', cur[i]);
        const emptied = i => !fil[i] && cur[i] && [tr('RESTORE_EMPTIED').replace('%s', cur[i]), 'is-warn'];
        const names = new Set(f.schedule.map(x => x.name));
        const lost = (somfy.schedules || []).filter(x => !names.has(x.name)).map(x => h(x.name));
        const conn = [, 'CONNEXION_WIFI', 'CONNEXION_ETHERNET', 'CONNEXION_ETHERNET'][net.connType];
        const rows = [
            ['shades', 'RESTORE_DEVICES_GROUPS', [
                !old && tr('RESTORE_DEVICES_DIFF').replace(/%(\d)/g, (m, i) => i < 4 ? fil[i - 1] : cur[i - 4]),
                tr('RESTORE_ROLLING')]],
            ['', 'SUBTAB_SCHEDULES', [
                !old && diff(3),
                !old && lost.length && [tr('RESTORE_SCHED_LOST').replace('%s', lost.join(', ')), 'is-warn'],
                [tr('RESTORE_SCHED_DEP'), 'rst-dep-note']]],
            ['repeaters', 'RESTORE_REPEATERS', [!old && diff(4), !old && emptied(4)]],
            ['listeners', 'RESTORE_LISTENERS', [!old && diff(5), !old && emptied(5)]],
            ['settings', 'RESTORE_SYSTEM_SETTINGS', [!old && tr('RESTORE_SYSTEM_SUM').replace('%s', `<em>${h(s.hostname)}</em>`)]],
            ['network', 'RESTORE_NETWORK_SETTINGS', [
                !old && conn && `${tr(conn)} · ${net.dhcp ? 'DHCP' : tr('RESTORE_NET_FIXED').replace('%s', h(net.ip))}`,
                !old && !same && net.connType > 1 && [tr('RESTORE_ETH_IGNORED'), 'is-info']]],
            ['mqtt', 'RESTORE_MQTT_SETTINGS', [!old && (mq.enabled ? tr('RESTORE_MQTT_SUM').replace('%s', h(`${mq.hostname}:${mq.port}`)) : tr('IS_DISABLED'))]],
            ['transceiver', 'RESTORE_RADIO_SETTINGS', [
                !old && rd.frequency && `${(+rd.frequency).fmt('#,##0.00')} ${tr('UNIT_MHZ')}`,
                otherBoard && [tr('RESTORE_RADIO_BOARD').replace('%s', h(tr(meta.profile))), 'is-warn'],
                old && parseInt(txt) < 25 && [tr('RESTORE_OLD_RADIO'), 'is-warn']]]
        ];
        // Migration (assistant de mise en service) : tout sauf le réseau, que l'assistant configure
        // juste après -- le connType d'un autre matériel piégerait l'appareil.
        const on = b => b === 'shades' || (this._rstMigrate && b !== 'network');
        const seg = (b, c) => `<span class="gen-seg gen-seg-bool"><input type="checkbox" ${b ? `data-bind="${b}"` : 'disabled'}${c ? ' checked' : ''}><span class="gen-seg-yes">${tr('BT_YES')}</span><span class="gen-seg-no">${tr('BT_NO')}</span></span>`;
        const chip = (t, c = '') => `<span class="rst-chip ${c}">${t}</span>`;
        body.innerHTML = `
        <div class="rst-file">
        <span class="rst-file-ico"><svg><use href="#svg-save"></use></svg></span>
        <b class="rst-file-name">${h(file.name)}</b>
        <span class="rst-file-sub">${(file.size / 1024).fmt('#,##0.0')} ${tr('UNIT_KO')} · ${old ? tr('RESTORE_OLD_READ') : tr('RESTORE_CREATED').replace('%s', date || '—')}</span>
        <label for="fileName" class="gen-btn">${tr('BT_CHANGE')}</label>
        <div class="rst-meta">${old ? chip(tr('RESTORE_OLD_FORMAT'), 'is-info') : chip(tr(same ? 'RESTORE_SAME_DEVICE' : 'RESTORE_OTHER_DEVICE'), same ? 'is-ok' : 'is-info')
            + chip(h(meta.fw)) + chip(h([meta.chip, meta.profile && tr(meta.profile)].filter(Boolean).join(' · ')), otherBoard ? 'is-warn' : '')}</div>
        </div>
        <div class="icon-pack-label"><span>${tr('RESTORE_WHAT')}</span><span id="restoreCount"></span></div>
        <div id="jsUniRestore" class="rst-checks">${rows.map(([b, k, l]) => `
        <div class="gen-row rst-row${b ? '' : ' rst-dep'}"><span class="gen-row-text"><b>${tr(k)}</b>${l.filter(Boolean).map(x => Array.isArray(x)
            ? `<span class="${x[1]}">${x[0]}</span>` : `<span>${x}</span>`).join('')}</span>${seg(b, b ? on(b) : on('shades'))}</div>`).join('')}
        </div>
        <div class="genmod-note rst-never"><svg><use href="#svg-lock"></use></svg><span><b>${tr('RESTORE_NEVER_TITLE')}</b>${tr('RESTORE_NEVER')}</span></div>`;
        w.querySelectorAll('#rstIntro, .file-drop').forEach(e => { e.style.display = 'none'; });
        w.querySelector('#uploadState .genmod-state-val').innerHTML = old ? tr('RESTORE_OLD_FORMAT') : `${h(s.hostname)}${date ? `<small>${date}</small>` : ''}`;
        this.syncRestore(w);
    }
    // Les plannings n'ont pas d'option propre côté firmware (opts.shades) : leur Oui/Non suit.
    syncRestore(w) {
        const ins = [...w.querySelectorAll('#jsUniRestore input[data-bind]')], n = ins.filter(c => c.checked).length;
        w.querySelector('.rst-dep input').checked = ins[0].checked;
        w.querySelector('#restoreCount').textContent = tr('RESTORE_COUNT').replace('%1', n).replace('%2', ins.length);
        const btn = w.querySelector('#btnUploadFile');
        btn.disabled = !n;
        btn.textContent = n ? `${tr('BT_RESTORE')} (${n})` : tr('BT_RESTORE');
    }


    // Nom de l'asset de release attendu par CET appareil, décomposé en trois morceaux pour
    // l'affichage : ce qui précède, ce qui l'identifie, ce qui suit.
    // Le morceau qui identifie le matériel n'est plus RECONSTITUÉ ici : il vient du firmware, seul
    // endroit où la convention de nommage est définie (FwInfo::boardToken). Ce bloc en
    // tenait auparavant un miroir -- une table `boards` de correspondance puce -> suffixe -- et ce
    // miroir avait divergé : le C6 n'y figurait pas, si bien qu'un C6 se voyait annoncer
    // "..._ota_esp32.bin", une image Xtensa qui n'y démarrerait jamais. Ne pas réintroduire
    // cette table : la variante d'image (cf. FW_ASSET_VARIANT) s'y perdrait de la même façon.
    assetNameParts() {
        const cont = get('divContainer');
        const profile = (cont.getAttribute('data-hardwareprofile') || '').toUpperCase();
        // Le profil ne compose plus aucun nom (le jeton du firmware porte déjà le suffixe de
        // boîtier) : il ne sert qu'à `box`, qui choisit un paragraphe d'aide.
        const box = profile === 'BOX-ETH' || profile === 'BOX-WIFI';
        return { middle: '_ota_', device: cont.getAttribute('data-assetdevice') || '', box: box };
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
        <ul class="fw-id-help">${tips.map(k => `<li>${tr(k)}</li>`).join('')}</ul>
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

    // Ligne de sauvegarde : pied de la fenêtre GitHub, 3e étape du téléversement, remise à zéro.
    backupRow(descKey) {
        return `<button type="button" id="btnBackupCfg" class="genmod-backup backup-row" onclick="firmware.backup()">
        <span class="genmod-backup-ico"><svg><use href="#svg-save"></use></svg></span>
        <span class="gen-row-text"><b>${tr('FIRMWARE_MT_SAVE_BACKUP')}</b><span>${tr(descKey || (this.isMobile() ? 'FIRMWARE_MT_SAVE_BACKUP_DESC_MOB' : 'FIRMWARE_MT_SAVE_BACKUP_DESC'))}</span></span>
        <svg class="genmod-backup-go"><use href="#svg-download"></use></svg>
        </button>`;
    }
    factoryReset() {
        const div = document.createElement('div');
        div.className = 'side-panel-overlay';
        const btn = (id, key, kind = '') => `<button type="button" class="gen-btn${kind}" data-id="${id}" disabled>${tr(key)}</button>`;
        div.innerHTML = `
        <aside class="side-panel is-danger" role="alertdialog" aria-modal="true" aria-labelledby="factoryPanelTitle">
        ${panelHead({ icon: 'svg-trash', tone: 'bad', id: 'factoryPanelTitle', title: tr('PROMPT_FACTORY_TITLE'), close: true, center: true })}
        <div class="side-panel-body">
        <div class="genmod-note is-danger"><svg><use href="#svg-warning"></use></svg><div>${tr('PROMPT_FACTORY_SUB')}</div></div>
        <ul class="msg-cons">${['DEVICES', 'SETTINGS', 'LANGS', 'MOTORS'].map(k => `<li>${tr('PROMPT_FACTORY_CONS_' + k)}</li>`).join('')}</ul>
        ${this.backupRow('FIRMWARE_MT_SAVE_BACKUP_DESC')}
        <label class="msg-check"><input type="checkbox"><span>${tr('PROMPT_FACTORY_CHECK')}</span></label>
        </div>
        <div class="side-panel-foot"><div class="genmod-foot-btns">
        ${btn('net', 'BT_FACTORY_KEEP_NET')}${btn('all', 'BT_FACTORY_ALL', ' gen-btn-danger')}
        </div></div>
        </aside>`;
        const acts = div.querySelectorAll('[data-id]');
        div.querySelector('.msg-check input').onchange = (e) => acts.forEach(b => { b.disabled = !e.target.checked; });
        const close = openSidePanel(div);
        div.querySelector('.genmod-close').focus();
        acts.forEach(b => b.onclick = () => {
            const keepNetwork = b.dataset.id === 'net';
            close();
            putJSON('/factoryReset', { confirm: 'factory', keepNetwork }, (err) => {
                if (err) return ui.serviceError(get('divContainer'), err);
                general.reloadApp = keepNetwork;
                document.querySelectorAll('.socket-wait').forEach(w => w.remove());
                ui.waitMessage(get('divContainer'), 'WAIT_MSG_FACTORY', {
                    steps: keepNetwork
                        ? [['WAIT_STEP_ERASE', 'cur'], ['WAIT_STEP_REBOOT', 'todo'], ['WAIT_STEP_RECONNECT', 'todo']]
                        : [['WAIT_STEP_ERASE', 'cur'], ['WAIT_STEP_REBOOT', 'todo']],
                    note: keepNetwork ? 'WAIT_MSG_DONT_UNPLUG' : 'WAIT_MSG_FACTORY_AP'
                }).classList.add('socket-wait');
                if (typeof socket !== 'undefined') socket.close(3000, 'reboot');
            });
        });
    }
    // Fenêtre de tâche (GitHub, téléversement, restauration) : la coque genmod- de la page
    // migrée, mais plein écran sur mobile comme l'ancien .inst-overlay (genmod-task, overlays.css).
    taskWindow(id, o, extraClass = '') {
        const div = document.createElement('div');
        div.id = id;
        div.className = `modal-overlay genmod-overlay genmod-task ${extraClass}`.trim();
        div.innerHTML = `<div class="message-content genmod-window">${genModalShell(o)}</div>`;
        div.onclick = (e) => { if (e.target.closest('[data-genmod-close]')) requestCloseOverlay(div); };
        return div;
    }
    createFileUploader(service, o) {
        const isRestore = service === '/restore';
        const pickKey = isRestore ? 'FILE_PICK_BACKUP' : 'FILE_PICK_FIRMWARE';
        const step = (n, content) => `
        <div class="genmod-step">
        <div class="genmod-step-rail"><span class="genmod-step-num">${n}</span><span class="genmod-step-line"></span></div>
        <div class="genmod-step-body">${content}</div>
        </div>`;
        const drop = `
        <input id="fileName" type="file" name="updateFS" style="display:none"
        onchange="const f=this.files[0];if(f){get('span-selected-file').innerText=f.name;if(get('rstBody'))firmware.readBackup(f)}"/>
        ${fileDropZone('fileName', pickKey, 'span-selected-file')}`;
        const inProgress = (titleKey, msgKey) => `
        <p id="divUploadInProgressNotice" class="gen-tile-desc is-warning" style="display:none"><b>${tr(titleKey)}</b><br>${tr(msgKey)}</p>`;
        // no-feedback : pas d'enfoncement ni de flash sur les boutons pendant ce flux sensible.
        const div = this.taskWindow('divUploadFile', Object.assign({
            id: 'upload', footId: 'uploadFoot',
            bodyHtml: `
            <form method="POST" action="#" enctype="multipart/form-data" id="frmUploadApp" class="genmod-form">
            <div id="divInstText"></div>
            ${isRestore ? drop : `
            <div class="vertical-steps-container">
            ${step(1, `<div><b>${tr('FIRMWARE_MA_UPDATE_GET_FILE')}</b>
            <a href="https://github.com/xkain/TESTRTS/releases" target="_blank" class="link genmod-link">${tr('FIRMWARE_MA_UPDATE_FROM_GITHUB')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a>
            ${this.fileIdCard()}</div>`)}
            ${step(2, drop)}
            ${step(3, this.backupRow())}
            </div>`}
            ${o.afterDrop || ''}
            <div id="divFileUploadProgress" style="display:none">
            <div class="progress-bar-header"><span class="progress-bar-label"></span><span class="progress-bar-value" id="progFileUpload-value">0%</span></div>
            <div class="progress-bar" id="progFileUpload"><div class="progress-bar-fill"></div></div>
            </div>
            ${inProgress(isRestore ? 'PROMPT_RESTORE_IN_PROGRESS_TITLE' : 'PROMPT_UPDATE_IN_PROGRESS_TITLE', isRestore ? 'PROMPT_RESTORE_IN_PROGRESS_MSG' : 'PROMPT_UPDATE_IN_PROGRESS_MSG')}
            </form>`
        }, o), 'no-feedback');
        div.querySelector('#uploadFoot').innerHTML = `
        <button id="btnClose" type="button" class="gen-btn" data-genmod-close>${tr('BT_CANCEL_1')}</button>
        <button id="btnUploadFile" type="button" class="gen-btn gen-btn-primary" onclick="firmware.uploadFile('${service}',get('divUploadFile'),ui.fromElement(get('divUploadFile')))">${tr('BT_UPLOAD_FILE')}</button>`;
        return div;
    }
    procMemoryStatus(mem) {
        // Le firmware envoie des OCTETS (ESP.getFreeHeap() et compagnie, cf. NetManager::emitHeap).
        // La conversion se fait ici plutôt que de corriger les étiquettes, parce que des
        // kilo-octets sont ce qu'on veut lire sur cette carte -- les octets exacts restent
        // disponibles sur /discovery pour un diagnostic fin.
        const ko = (v) => (typeof v === 'number' ? (v / 1024).fmt('#,##0.0') : '--');
        const set = (id, v) => { const sp = get(id); if (sp) sp.textContent = v; };
        set('spanFreeMemory', ko(mem.free));
        set('spanMaxMemory', ko(mem.max));
        set('spanMinMemory', ko(mem.min));
        document.querySelectorAll('.fw-free-mem').forEach(el => { el.textContent = ko(mem.free); });
        if (mem && mem.free) {
            const totalRam = mem.total ? mem.total : 265672;
            const usedPct = Math.min(100, Math.max(0, Math.round(((totalRam - mem.free) / totalRam) * 100)));
            get('fwRamBar')?.style.setProperty('--progress', `${usedPct}%`);
        }
    }


    // fwStatus (FwInfo::toJSON côté firmware) : version installée, jeton de carte, génération de la
    // table de partitions et réglage checkForUpdate. Le boîtier ne connaît plus la dernière version
    // publiée -- c'est ce navigateur qui la découvre dans le catalogue (refreshUpdateBadge).
    // Émis à chaque connexion socket : c'est donc aussi lui qui signale le retour de l'appareil
    // après une installation (finishInstall).
    procFwStatus(info) {
        this.fwInfo = info;
        // Retour depuis le Mode installation après un envoi réussi (cf. home('?installed') de sa page).
        if (!this._installedSeen) {
            this._installedSeen = true;
            if (new URLSearchParams(location.search).has('installed')) {
                ui.toast({ title: tr('GIT_RELEASE_SUCCESS_TITLE'), detail: tr('MSG_FW_INSTALLED').replace('%1', `v${info.appVersion?.name || ''}`) });
                history.replaceState(null, '', location.pathname + location.hash);
            }
        }
        const gitInst = get('divGitInstall');
        if (gitInst && this._pendingInstall && this._pendingInstall.sent) {
            this.finishInstall(gitInst, info);
            return;
        }
        this.refreshUpdateBadge();
    }

    // Badge « mise à jour disponible » : version stable la plus haute du catalogue pour CETTE carte
    // et CETTE table de partitions, comparée à la version installée.
    async refreshUpdateBadge(force) {
        const info = this.fwInfo || {};
        const divsGlobal = document.querySelectorAll('.firmware-message');
        const blk = get('divFwUpd');
        divsGlobal.forEach(div => {
            div.classList.remove('procFwStatusshow');
            div.onclick = null;
        });
        document.body.classList.remove('fw-update');
        if (blk) {
            this.renderVersion(info.fwVersion?.name);
            get('spanFwFileDesc').innerText = tr('FW_UPDATE_FILE_DESC').replace('%1', this.boardKey() || 'esp32');
        }
        if (info.checkForUpdate === false && !force) return this.setUpdateState('off');
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
            return this.setUpdateState('error');
        }
        if (!latest) return this.setUpdateState('idle');
        divsGlobal.forEach(div => {
            div.classList.add('procFwStatusshow');
            div.style.cursor = 'pointer';
            div.onclick = () => { firmware.updateGithub(); };
            div.innerHTML = `<span>${tr('FW_UPDATE_AVAILABLE')}</span>`;
        });
        document.body.classList.add('fw-update');
        this.setUpdateState('new', latest);
    }
    setUpdateState(state, latest) {
        const blk = get('divFwUpd');
        if (!blk) return;
        blk.setAttribute('data-state', state);
        get('fwHero').setAttribute('data-state', state);
        if (this._checkedTimer) { clearInterval(this._checkedTimer); this._checkedTimer = null; }
        if (state === 'new') {
            this._latestTag = latest.version.name;
            get('spanFwLatest').innerText = latest.version.name;
            get('spanFwInstall').innerText = tr('FW_INSTALL_VER').replace('%1', latest.version.name);
        }
        get('fwHeroBadge').innerText = state === 'new' ? tr('FW_BADGE_NEW').replace('%1', latest.version.name)
            : tr({ idle: 'FW_BADGE_UPTODATE', off: 'FW_BADGE_OFF', error: 'FW_UPDATE_CHECK_FAIL' }[state]);
        get('fwHero').querySelector('.fw-badge use').setAttribute('href', { idle: '#svg-check', new: '#svg-download', off: '#svg-info', error: '#svg-warning' }[state]);
        const title = get('gitUpdateDesc'), sub = get('gitUpdateChecked');
        title.innerText = tr({ new: 'FW_UPDATE_AVAILABLE', idle: 'FW_UPDATE_UPTODATE', off: 'FW_UPDATE_CHECK_OFF', error: 'FW_UPDATE_CHECK_FAIL' }[state]);
        if (state === 'error') { sub.innerText = tr('FW_UPDATE_CHECK_FAIL_DESC'); return; }
        if (state === 'off') { sub.innerText = ''; return; }
        const paint = () => { sub.innerText = `${tr('FW_UPDATE_CHECKED')} ${shadeSetup.agoText(this._catalogAt || Date.now())}`; };
        paint();
        this._checkedTimer = setInterval(paint, 30000);
    }

    async showReleaseNotes() {
        if (!this._latestTag) return;
        const r = await this.getReleaseInfo(this._latestTag);
        this.notesModal(this._latestTag, r?.info?.body ? this.parseMarkdown(r.info.body) : `<p>${tr('ERR_GIT_NOTE')}</p>`);
    }
    // Lecture : panneau latéral comme la fiche d'un équipement, feuille du bas sur mobile.
    // ui.infoMessage() ne convient pas : c'est une alerte critique, exclue de la fermeture au clic.
    notesModal(tag, html) {
        const url = `https://github.com/xkain/TESTRTS/releases/tag/${encodeURIComponent(tag)}`;
        const div = document.createElement('div');
        div.className = 'side-panel-overlay';
        div.innerHTML = `
        <aside class="side-panel" role="dialog" aria-modal="true" aria-labelledby="notesPanelTitle">
        ${panelHead({ icon: 'svg-doc', id: 'notesPanelTitle', title: tr('NOTES_KICKER'), desc: escHtml(tag) })}
        <div class="side-panel-body"><div class="side-panel-sec side-panel-md">${html}</div></div>
        <div class="side-panel-foot"><div class="genmod-foot-btns">
        <a class="gen-btn" href="${url}" target="_blank" rel="noopener"><span>${tr('NOTES_GITHUB')}</span><svg><use href="#svg-linkOut"></use></svg></a>
        <button type="button" class="gen-btn gen-btn-primary" data-close>${tr('BT_CLOSE')}</button>
        </div></div>
        </aside>`;
        openSidePanel(div);
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
        status.hidden = false;
        textEl.textContent = text;
    }
    // Étape de l'écran d'installation : le stepper, et sous lui UNE barre qui mesure l'étape en
    // cours, remise à zéro à chaque changement. À l'étape 3 il n'y a plus rien à mesurer -- on
    // attend que l'appareil revienne, puis le renvoi des langues -- et la barre cède la place au
    // rouage de divGitPostStatus.
    setInstallPhase(div, step, label) {
        div.querySelectorAll('.git-istep').forEach(el => {
            const n = parseInt(el.dataset.istep, 10);
            el.classList.toggle('is-done', n < step);
            el.classList.toggle('is-current', n === step);
            el.querySelector('.genmod-step-num').innerHTML = n < step ? '<svg><use href="#svg-check"></use></svg>' : n;
        });
        const busy = div.querySelector('#btnGitInstBusy span:last-child');
        if (busy) busy.textContent = tr(step < 3 ? 'GIT_INSTALL_BUSY' : 'GIT_INSTALL_REBOOTING');
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

    // Écran de progression de installGitRelease.
    // Trois étapes en rail, comme le téléversement : 1 = téléchargement depuis Pages, 2 = envoi à
    // /updateFirmware, 3 = redémarrage puis renvoi des packs de langue. Une seule barre, celle de
    // l'étape en cours. Même fenêtre que la sélection de version, sauf sur mobile : genmod-task
    // retiré, elle devient la feuille montante des fenêtres au lieu du plein écran.
    renderGitInstallProgress(div, verName) {
        div.classList.remove('genmod-task');
        div.removeAttribute('data-mode');
        const step = (n, k, d) => `<div class="genmod-step git-istep" data-istep="${n}">
            <div class="genmod-step-rail"><span class="genmod-step-num">${n}</span><span class="genmod-step-line"></span></div>
            <div class="genmod-step-body"><b>${tr(k)}</b><span>${tr(d)}</span></div></div>`;
        div.innerHTML = `<div class="message-content genmod-window">${genModalShell({
            id: 'gitInst', icon: 'svg-cloudDownload', titleKey: 'FIRMWARE_OTA_TITLE', descKey: 'GIT_INSTALL_DESC',
            stateKey: tr('FIRMWARE_MT_INSTALLED'), stateValue: `v${escHtml(this.fwInfo?.appVersion?.name || '')}`,
            sideExtra: `<div class="genmod-state">${genModalState(tr('GIT_INSTALL_NEW'), escHtml(verName))}</div>`,
            sectionKey: 'GIT_RELEASE_TITLE', hintKey: 'GIT_INSTALL_HINT', footId: 'gitInstFoot',
            bodyHtml: `<div class="git-isteps">
                ${step(1, 'GIT_RELEASE_TITLE_STEP1', 'GIT_INSTALL_STEP1_DESC')}
                ${step(2, 'GIT_RELEASE_TITLE_STEP2', 'GIT_INSTALL_STEP2_DESC')}
                ${step(3, 'GIT_RELEASE_TITLE_STEP3', 'GIT_INSTALL_STEP3_DESC')}</div>
                <div id="divInstallBar">
                <div class="progress-bar-header"><span class="progress-bar-label" id="spanInstallPhase"></span><span class="progress-bar-value" id="progInstall-value">0%</span></div>
                <div class="progress-bar" id="progInstall"><div class="progress-bar-fill"></div></div></div>
                <div id="divGitPostStatus" class="genmod-note is-info git-post-status" hidden><span class="wiz-spin" aria-hidden="true"></span><div><b id="spanGitPostStatusText"></b><span>${tr('GIT_INSTALL_RECONNECT')}</span></div></div>
                <div class="genmod-note is-warn"><svg><use href="#svg-warning"></use></svg><div><b>${tr('GIT_INSTALL_POWER_TITLE')}</b><span>${tr('GIT_INSTALL_POWER_DESC')}</span></div></div>`
        })}</div>`;
        div.querySelector('.genmod-head-title').textContent = tr('GIT_INSTALL_HEAD').replace('%1', verName);
        div.querySelector('#gitInstFoot').innerHTML = `<button type="button" class="gen-btn gen-btn-primary" id="btnGitInstBusy" disabled><span class="wiz-spin" aria-hidden="true"></span><span>${tr('GIT_INSTALL_BUSY')}</span></button>`;
        // Pas de fermeture ici : l'installation ne peut pas être interrompue, et une croix laisserait
        // croire le contraire. Le verrou 'hard' posé par installGitRelease() garde aussi le fond.
        div.querySelectorAll('.genmod-close').forEach(b => { b.disabled = true; });
        this.setInstallPhase(div, 1, tr('GIT_RELEASE_PHASE_DOWNLOAD').replace('%1', verName));
    }

    // Porte d'entrée de btnUpdate (cf. updateGithub()) : renderGitInstallProgress() ne pose plus
    // aucun moyen de fermer l'écran de progression une fois affiché (ni [close], ni bouton
    // Annuler, ni poignée mobile -- cf. ses commentaires) puisque le flash, une fois lancé côté
    // ESP32, ne peut de toute façon plus être interrompu (aucune route /cancelInstallGit). La
    // confirmation doit donc se faire ICI, avant, pendant qu'il est encore temps de reculer.
    async confirmInstallGitRelease(div) {
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
        const reinstall = !isDevBuild && (!opt || vernum === currentVerNum);
        const downgrade = !isDevBuild && !reinstall && vernum < currentVerNum;
        const ok = await ui.confirm({
            level: downgrade ? 'danger' : 'warn',
            icon: 'svg-cloudDownload',
            title: tr('GIT_RELEASE_CONFIRM_TITLE'),
            desc: `<p>${reinstall ? tr('GIT_RELEASE_CONFIRM_SUB_REINSTALL') : downgrade ? tr('GIT_RELEASE_CONFIRM_SUB_DOWNGRADE') : tr('GIT_RELEASE_CONFIRM_SUB')}</p>`,
            confirm: reinstall ? tr('BT_REINSTALL') : downgrade ? tr('BT_INSTALL') : tr('BT_UPDATE')
        });
        if (ok) this.installGitRelease(div);
    }

    async installGitRelease(div) {
        let obj = ui.fromElement(div);


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
            this.setInstallPhase(div, 2, tr('GIT_RELEASE_PHASE_INSTALL_MODE'));
            await this.installThroughMode(bin, rel.asset.sha256,
                () => this.setInstallPhase(div, 2, tr('GIT_RELEASE_PHASE_INSTALL')),
                pct => this.setInstallBar('progInstall', pct));
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
        closeOverlay(div);
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
        // Le pack de la langue active date de l'ancienne version : on le renvoie, pris au tag du
        // NOUVEAU firmware (cf. fetchGithubRawContent). La langue d'usine arrive avec l'image.
        window.__fwVersionTag = got;
        const codes = [window.__activeLangCode].filter(c => c && c !== window.__defaultLangCode);
        let langFailed = false;
        for (let i = 0; i < codes.length; i++) {
            this.setInstallStatus(tr('GIT_LANG_RESTORE_IN_PROGRESS').replace('%1', codes[i]));
            try { await relayLangViaBrowser(codes[i]); }
            catch (e) { langFailed = true; logger.error('Language pack refresh failed for ' + codes[i] + ':', e); }
        }
        // Au-delà de la dernière étape : les trois puces passent à « terminé ».
        this.setInstallPhase(div, 4, '');
        clearOverlayLock(div);
        closeOverlay(div);
        const subMsg = langFailed
            ? `${tr('GIT_RELEASE_SUCCESS_1')}<br>${tr('GIT_LANG_RESTORE_FAILED').replace('%1', codes.join(', '))}`
            : `${tr('GIT_RELEASE_SUCCESS_1')}<br>${tr('GIT_RELEASE_SUCCESS_2')}`;
        ui.toast({ title: tr('GIT_RELEASE_SUCCESS_TITLE'), detail: subMsg });
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
                date: v.date,
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
    // Le firmware ne s'écrit pas lui-même : il redémarre sur le Mode installation, qui répond sur la
    // même adresse et reconnaît le même jeton (même secret, même formule que /login).
    async rebootToInstall() {
        if (typeof socket !== 'undefined') socket.close(3000, 'install');
        const resp = await fetch(baseUrl + '/rebootInstall', { method: 'POST', headers: { apikey: security.apiKey || '' } });
        if (resp.ok) return;
        let body = {};
        try { body = await resp.json(); } catch (e) { /* corps non JSON */ }
        throw new Error(trOr('ERR_' + body.code, body.desc || ('HTTP ' + resp.status)));
    }
    async waitInstallMode(timeoutMs = 90000) {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                const resp = await fetch(baseUrl + '/install', { cache: 'no-store' });
                if (resp.ok && (await resp.json()).install) return;
            }
            catch (e) { /* encore en redémarrage */ }
        }
        throw new Error(tr('ERR_INSTALL_MODE_TIMEOUT'));
    }
    // Après un échec, le Mode installation ne renvoie sur le firmware installé que si son image est
    // restée intacte ; sinon il reste en place et la page suivante pourra réessayer.
    leaveInstallMode() {
        return fetch(baseUrl + '/bootApp', { method: 'POST', headers: { apikey: security.apiKey || '' } }).catch(() => {});
    }
    async installThroughMode(blob, sha256, onReady, onPct) {
        await this.rebootToInstall();
        await this.waitInstallMode();
        onReady();
        try { return await this.sendImage(blob, sha256, onPct); }
        catch (e) { await this.leaveInstallMode(); throw e; }
    }
    async restartInstallMode() {
        if (!await ui.confirm({ icon: 'svg-reboot', title: tr('PROMPT_INSTALL_MODE_TITLE'), desc: `<p>${tr('PROMPT_INSTALL_MODE_MSG')}</p>`, confirm: tr('BT_REBOOT') })) return;
        const wait = ui.waitMessage(get('divContainer'), 'WAIT_MSG_INSTALL_MODE');
        wait.classList.add('socket-wait');
        try {
            await this.rebootToInstall();
            await this.waitInstallMode();
            window.location.href = baseUrl + '/';
        }
        catch (e) {
            wait.remove();
            ui.errorMessage(e.message);
        }
    }

    // Menu du header de divGitInstall. Le mode n'est jamais mémorisé : chaque ouverture repart en
    // Production, l'accès à la version de dev reste un geste volontaire.
    setGitMode(el, mode) {
        const div = el.closest('#divGitInstall');
        if (!div || !div.setGitMode) return;
        // Le bouton radio reste sur le mode réel tant que applyMode() ne l'a pas changé : un refus
        // de la confirmation Développeur ne doit pas laisser « Développeur » coché.
        const cur = div.getAttribute('data-mode');
        div.querySelectorAll('input[name="gitMode"]').forEach(r => { r.checked = r.value === cur; });
        div.querySelectorAll('.genmod-mode-select').forEach(m => { m.value = cur; });
        if (cur === mode) return;
        if (mode !== 'dev') return div.setGitMode(mode);
        ui.confirm({ level: 'danger', title: tr('FIRMWARE_DEV_CONFIRM_TITLE'), desc: `<p>${tr('FIRMWARE_DEV_CONFIRM')}</p>`, confirm: tr('BT_ENABLE') })
            .then(ok => { if (ok) div.setGitMode('dev'); });
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
            const div = this.taskWindow('divGitInstall', {
                id: 'git', icon: 'svg-cloudDownload', footId: 'gitFoot',
                titleKey: 'FIRMWARE_OTA_TITLE', descKey: 'FIRMWARE_OTA_TITLE_DESC',
                stateKey: tr('FIRMWARE_MT_INSTALLED'), stateValue: `v${escHtml(rel.appVersion.name || '')}`,
                sideExtra: `
                <div class="genmod-state">
                <span class="genmod-state-key">${tr('CHANNEL')}</span>
                <span class="gen-seg genmod-seg">
                <label><input type="radio" name="gitMode" value="prod" checked onchange="firmware.setGitMode(this, 'prod')"><span>${tr('FIRMWARE_MODE_PROD')}</span></label>
                <label><input type="radio" name="gitMode" value="dev" onchange="firmware.setGitMode(this, 'dev')"><span>${tr('FIRMWARE_MODE_DEV')}</span></label>
                </span>
                <span class="genmod-state-note">${tr('FIRMWARE_OTA_CHANNEL_NOTE')}</span>
                ${/* Mobile : le même choix en sélecteur compact, pour rendre la hauteur aux notes. */ ''}
                <select class="genmod-mode-select" aria-label="${tr('CHANNEL')}" onchange="firmware.setGitMode(this, this.value)">
                <option value="prod">${tr('FIRMWARE_MODE_PROD')}</option>
                <option value="dev">${tr('FIRMWARE_MODE_DEV')}</option>
                </select>
                </div>`,
                sectionKey: 'FIRMWARE_OTA_SECTION', hintKey: 'FIRMWARE_MT_SAVE_BACKUP',
                bodyHtml: `
                <div class="icon-pack-label"><span id="gitCount"></span>
                ${/* Page des releases comme valeur de départ, jamais "#" (résolu contre la page
                     courante) : updateNotes() l'affine sur la version choisie. */ ''}
                <a id="lnkGithubRelease" href="https://github.com/xkain/TESTRTS/releases" target="_blank" class="link genmod-link">${tr('FIRMWARE_OTA_NOTE_GITHUB')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a></div>
                <select id="selVersion" data-bind="version" hidden>${optsHtml}</select>
                <div class="icon-pack-grid" id="gitVersions"></div>
                <p id="divPrereleaseWarning" class="gen-tile-desc is-warning" style="display:none"><span id="spanUpdateWarning"></span></p>
                <div class="genmod-notes-wrap">
                <div id="notesPreview" class="release-notes-preview genmod-notes">
                <div class="wifiConnectScan">
                <svg class="wait-spinner" viewBox="25 25 50 50"><circle class="wait-spinner-track" cx="50" cy="50" r="20" fill="none" stroke-width="3"/><circle class="wait-spinner-arc" cx="50" cy="50" r="20" fill="none" stroke-width="3" stroke-miterlimit="10"/></svg>
                </div>
                </div>
                <button type="button" class="genmod-notes-open"><svg><use href="#svg-doc"></use></svg>${tr('FIRMWARE_OTA_NOTES_OPEN')}</button>
                </div>
                <p class="gen-tile-desc">${tr('FIRMWARE_MT_CACHE')}</p>`
            });
            div.setAttribute('data-currentvernum', currentVerNum);
            div.setAttribute('data-mode', 'prod');
            div._rel = rel;
            div.querySelector('#gitHint').innerHTML = this.backupRow();
            div.querySelector('#gitFoot').innerHTML = `
            <button id="btnClose" type="button" class="gen-btn" data-genmod-close>${tr('BT_CANCEL_1')}</button>
            <button id="btnUpdate" type="button" class="gen-btn gen-btn-primary" onclick="firmware.confirmInstallGitRelease(get('divGitInstall'))">${tr('BT_UPDATE')}</button>`;

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
            div.querySelector('#gitVersions').addEventListener('click', (e) => {
                const t = e.target.closest('[data-ver]');
                if (!t || sel.value === t.dataset.ver) return;
                sel.value = t.dataset.ver;
                sel.dispatchEvent(new Event('change'));
            });
            // Mobile : les notes se lisent en grand dans une modale ; ailleurs elles ont la place.
            div.querySelector('.genmod-notes-wrap').addEventListener('click', () => {
                if (!window.matchMedia('(max-width: 767px)').matches) return;
                this.notesModal(sel.value, div.querySelector('#notesPreview').innerHTML);
            });
            this.renderGitTiles(div);
            this.gitReleaseSelected(div);
            updateNotes();

            const applyMode = (mode, list) => {
                div.setAttribute('data-mode', mode);
                div._rel = list;
                div.querySelectorAll('input[name="gitMode"]').forEach(r => { r.checked = r.value === mode; });
                div.querySelectorAll('.genmod-mode-select').forEach(m => { m.value = mode; });
                sel.innerHTML = buildOpts(list);
                this.renderGitTiles(div);
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
    // Les versions en tuiles (gabarit icon-pack-*) ; le <select> caché reste la source
    // de vérité pour gitReleaseSelected(), confirmInstallGitRelease() et ui.fromElement().
    renderGitTiles(div) {
        const sel = div.querySelector('#selVersion'), cur = div.getAttribute('data-currentvernum');
        const opts = [...sel.options];
        const stable = opts.filter(o => o.getAttribute('data-prerelease') !== 'true').map(o => Number(o.getAttribute('data-vernum')));
        const latest = stable.length ? Math.max(...stable) : null;
        get('gitCount').textContent = tr('FIRMWARE_OTA_COUNT').replace('%1', opts.length);
        div.querySelector('#gitVersions').innerHTML = opts.map(o => {
            const dev = o.getAttribute('data-devbuild') === 'true', pre = o.getAttribute('data-prerelease') === 'true';
            const vn = Number(o.getAttribute('data-vernum'));
            const m = /^v?(\d+)\.(\d+)/.exec(o.value);
            const badge = String(vn) === cur ? `<span class="lang-catalog-badge active">${tr('INSTALLED')}</span>`
                : vn === latest ? `<span class="lang-catalog-badge">${tr('FIRMWARE_OTA_TAG_LATEST')}</span>` : '';
            return `<div class="icon-pack-tile${String(vn) === cur ? ' is-default' : ''}" data-ver="${escAttr(o.value)}">
            <span class="lang-catalog-code">${dev ? 'dev' : m ? `${m[1]}.${m[2]}` : '?'}</span>
            <div class="icon-pack-name">${escHtml(o.value)}</div>
            <div class="icon-pack-meta">${tr(dev ? 'CHANNEL_DEV' : pre ? 'FIRMWARE_OTA_TAG_PRE' : 'CHANNEL_STABLE')}</div>
            <span class="icon-pack-tag">${badge}</span></div>`;
        }).join('');
    }
    gitReleaseSelected(div) {
        const sel = div.querySelector('#selVersion');
        if (!sel || sel.selectedIndex === -1) return;

        const opt = sel.options[sel.selectedIndex];
        div.querySelectorAll('#gitVersions [data-ver]').forEach(t => t.classList.toggle('selected', t.dataset.ver === sel.value));
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
                divPre.style.display = '';
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
        const div = this.createFileUploader('/updateFirmware', {
            titleKey: 'FIRMWARE_MA_UPDATE_TITLE', descKey: 'FIRMWARE_MA_FIRMWARE_DESC', icon: 'svg-upload',
            stateKey: tr('FIRMWARE_MT_INSTALLED'), stateValue: get('spanFwVersion').innerText || '?.?.?',
            sectionKey: 'FW_UPDATE_FILE', hintKey: 'FIRMWARE_MA_HINT'
        });
        shOverlay(div);
        // Après shOverlay() : la mesure demande que le bloc soit dans le document et sa largeur
        // arrêtée.
        this.fitFileName(div);
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
    async confirmUploadFile(service, el, data, file) {
        const isRestore = service === '/restore';
        const ok = await ui.confirm({
            icon: isRestore ? 'svg-restore' : 'svg-upload',
            title: tr(isRestore ? 'RESTORE_CONFIRM_TITLE' : 'GIT_RELEASE_CONFIRM_TITLE'),
            desc: `<p>${tr(isRestore ? 'RESTORE_CONFIRM_SUB' : 'GIT_RELEASE_CONFIRM_SUB')}</p>`,
            confirm: tr(isRestore ? 'BT_RESTORE' : 'BT_INSTALL')
        });
        if (ok) this._startUpload(service, el, data, file);
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
        backupRow = el.querySelector('.backup-row'),
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
                if (service === '/updateFirmware') this.leaveInstallMode();
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
                document.querySelectorAll('.socket-wait').forEach(w => w.remove());
                ui.waitMessage(get('divContainer'), 'WAIT_MSG_UPDATE_REBOOTING', {
                    steps: [['WAIT_STEP_INSTALL', 'done'], ['WAIT_STEP_REBOOT', 'cur'], ['WAIT_STEP_RECONNECT', 'todo']],
                    note: 'WAIT_MSG_DONT_UNPLUG'
                }).classList.add('socket-wait');
            }
        };
        xhr.onerror = () => {
            clearOverlayLock(el);
            if (service === '/updateFirmware') this.leaveInstallMode();
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
        if (service === '/updateFirmware') {
            const label = progWrap.querySelector('.progress-bar-label');
            label.textContent = tr('WAIT_MSG_INSTALL_MODE');
            try {
                await this.rebootToInstall();
                await this.waitInstallMode();
            }
            catch (e) {
                clearOverlayLock(el);
                if (inProgressNotice) inProgressNotice.style.display = 'none';
                btnCancel.style.display = '';
                btnCancel.innerText = tr('BT_CLOSE');
                ui.errorMessage(e.message);
                return;
            }
            label.textContent = '';
        }
        xhr.send(formData);
    }
}
var firmware = new Firmware();
