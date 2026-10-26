// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS

// =========================================================================
// SECTION : CRÉATION ET MISE EN SERVICE D'UN ÉQUIPEMENT
// =========================================================================
// Étape 1 : ce que l'utilisateur sait (type, nom, pièce, télécommande d'origine).
// Étape 2 : ce qu'il constate (appairage, sens, temps de course...). Chaque tâche y est enregistrée
// dès qu'elle est finie, avec son bit dans setupSteps : quitter en route ne perd rien.
const SETUP_BIT = { pair: 1, dir: 2, cal: 4, tilt: 8, order: 16, opts: 32 };
const SETUP_INIT = { pair: 'pret', unpair: 'pret', remote: 'listen', dir: 'test', cal: 'intro', tilt: 'tup', order: 'open', opts: 'q' };
const SETUP_MIN_MS = 500, SETUP_MAX_MS = 180000, SETUP_LISTEN_MS = 30000;
// Temps de réaction retiré du clic « Il s'est arrêté » de l'apprentissage My.
const SETUP_REACT_MS = 300;

class ShadeSetup {
    families = [
        { id: 'shutter', label: 'DEVICE_SHUTTER', ico: 'svg-shutter', type: () => 4 },
        { id: 'roller', label: 'DEVICE_ROLLER', ico: 'svg-window-shade', type: () => 0 },
        { id: 'blind', label: 'DEVICE_BLIND', ico: 'svg-window-blind', type: () => 1,
          // Pas de valeur par défaut : un mauvais type d'orientation fausse tout l'étalonnage.
          axes: [{ q: 'SETUP_Q_SLATS', def: null, opts: [
              ['2', 'CAL_BLIND_OPT_INTEGRATED', 'CAL_BLIND_OPT_INTEGRATED_DESC'],
              ['1', 'CAL_BLIND_OPT_TILTMOTOR', 'CAL_BLIND_OPT_TILTMOTOR_DESC'],
              ['4', 'CAL_BLIND_OPT_EUROMODE', 'CAL_BLIND_OPT_EUROMODE_DESC'],
              ['3', 'CAL_BLIND_OPT_TILTONLY', 'CAL_BLIND_OPT_TILTONLY_DESC'],
              ['0', 'CAL_BLIND_OPT_NONE', 'CAL_BLIND_OPT_NONE_DESC']] }],
          settings: a => ({ tiltType: parseInt(a[0], 10) }) },
        { id: 'awning', label: 'DEVICE_AWNING', ico: 'svg-awning', type: () => 3 },
        { id: 'drapery', label: 'SETUP_FAM_DRAPERY', ico: 'svg-cdrapery',
          axes: [{ q: 'SETUP_Q_DRAPERY', def: 'c', opts: [['l', 'SETUP_OPEN_LEFT'], ['c', 'SETUP_OPEN_CENTER'], ['r', 'SETUP_OPEN_RIGHT']] }],
          type: a => ({ l: 2, c: 8, r: 7 })[a[0]] },
        { id: 'garage', label: 'SETUP_FAM_GARAGE', ico: 'svg-garage',
          axes: [{ q: 'SETUP_Q_BUTTONS', def: '3', opts: [['3', 'SETUP_BTN_3'], ['1', 'SETUP_BTN_1']] }],
          type: a => a[0] === '1' ? 5 : 6 },
        { id: 'gate', label: 'SETUP_FAM_GATE', ico: 'svg-cgate',
          axes: [{ q: 'SETUP_Q_GATE', def: 'c', opts: [['l', 'SETUP_GATE_LEFT'], ['c', 'SETUP_GATE_DOUBLE'], ['r', 'SETUP_GATE_RIGHT']] },
                 { q: 'SETUP_Q_BUTTONS', def: '3', opts: [['3', 'SETUP_BTN_3'], ['1', 'SETUP_BTN_1']] }],
          type: a => ({ l: 11, c: 12, r: 13 })[a[0]] + (a[1] === '1' ? 3 : 0) },
        { id: 'switch', label: 'SETUP_FAM_SWITCH', ico: 'svg-switch2',
          axes: [{ q: 'SETUP_Q_SWITCH_KEYS', def: '2', opts: [['2', 'SETUP_SW_2'], ['1', 'SETUP_SW_1']] },
                 { q: 'SETUP_Q_SWITCH_WHAT', def: '1', opts: [['1', 'SETUP_SW_LIGHT'], ['0', 'SETUP_SW_DEVICE'], ['2', 'SETUP_SW_OPENING'], ['3', 'SETUP_SW_OTHER']],
                   desc: v => { const p = somfy.stateVocabKeys[parseInt(v, 10)] || somfy.stateVocabKeys[0]; return this.t('SETUP_SW_STATE_DESC', { on: tr(p[0]), off: tr(p[1]) }); } },
                 { q: 'SETUP_Q_CONTACT', def: '0', opts: [['0', 'SETUP_CONTACT_LATCH', 'SETUP_CONTACT_LATCH_DESC'], ['1', 'SETUP_CONTACT_PULSE', 'SETUP_CONTACT_PULSE_DESC']],
                   extra: (v, c) => v !== '1' ? '' : `<div class="uniRow setup-pulse"><div class="unifield-content"><label class="label" for="setupPulse">${tr('SETUP_PULSE_LABEL')}</label>
                     <input id="setupPulse" class="inputAndSelect" type="number" min="50" max="10000" step="10" placeholder=" " value="${c.pulse}" oninput="shadeSetup.c.pulse = parseInt(this.value, 10) || 200"></div></div>` }],
          type: a => a[0] === '1' ? 9 : 10,
          settings: (a, c) => Object.assign({ stateVocab: parseInt(a[1], 10), outputMode: parseInt(a[2], 10) }, a[2] === '1' ? { pulseTime: c.pulse } : {}) },
    ];

    t(key, vars) {
        let s = tr(key);
        if (vars) Object.keys(vars).forEach(k => { s = s.split(`{${k}}`).join(vars[k]); });
        return s;
    }
    fmt(ms) { return (ms / 1000).toFixed(1) + ' s'; }
    // Vocabulaire du mouvement : un volet monte, un rideau s'ouvre, un store banne se replie.
    words(shadeType) {
        let w;
        if (shadeType === 3) w = { up: 'SETUP_DO_RETRACT', down: 'SETUP_DO_DEPLOY', upN: 'SETUP_N_RETRACT', downN: 'SETUP_N_DEPLOY', theUp: 'SETUP_THE_RETRACT', theDown: 'SETUP_THE_DEPLOY', open: 'SETUP_ST_RETRACTED', closed: 'SETUP_ST_DEPLOYED', upOk: 'SETUP_OK_RETRACTED' };
        else if ([2, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16].includes(shadeType)) w = { up: 'BT_OPEN', down: 'BT_CLOSE', upN: 'SETUP_N_OPENING', downN: 'SETUP_N_CLOSING', theUp: 'SETUP_THE_OPENING', theDown: 'SETUP_THE_CLOSING', open: 'SETUP_ST_OPEN', closed: 'SETUP_ST_CLOSED', upOk: 'SETUP_OK_OPENED' };
        else w = { up: 'DEVICE_GPIO_UP', down: 'DEVICE_GPIO_DOWN', upN: 'SETUP_N_RISE', downN: 'SETUP_N_LOWER', theUp: 'SETUP_THE_RISE', theDown: 'SETUP_THE_LOWER', open: 'SETUP_ST_OPEN', closed: 'SETUP_ST_CLOSED', upOk: 'SETUP_OK_RAISED' };
        Object.keys(w).forEach(k => { w[k] = tr(w[k]); });
        return w;
    }

    // ---------- Ce que demande un type : sert au parcours ET au badge de la carte ----------
    tasksFor(shade) {
        const st = somfy.shadeTypes.find(x => x.type === shade.shadeType) || {};
        const tt = st.tilt ? (shade.tiltType || 0) : 0;
        const ids = ['pair', 'dir'];
        if (st.lift && tt !== 3) ids.push('cal');
        if (tt > 0) ids.push('tilt');
        if (tt === 2) ids.push('order');
        ids.push('opts');
        return ids;
    }
    missingSteps(shade) {
        const steps = shade.setupSteps || 0;
        // Créé avant ce champ, ou par le formulaire complet, puis appairé : rien à réclamer.
        if (!steps && shade.paired) return 0;
        return this.tasksFor(shade).filter(id => !(steps & SETUP_BIT[id])).length;
    }
    badgeHtml(shade) {
        const n = this.missingSteps(shade);
        if (!n) return '';
        return `<button type="button" class="setup-badge" title="${escAttr(tr('SETUP_RESUME'))}" onclick="event.stopPropagation(); shadeSetup.resume(${shade.shadeId});">${n > 1 ? this.t('SETUP_BADGE_MANY', { n }) : tr('SETUP_BADGE_ONE')}</button>`;
    }

    // ---------- Overlay commun aux deux étapes ----------
    mount(titleKey, subKey, menu) {
        get('divShadeSetup')?.remove();
        const div = document.createElement('div');
        div.className = 'inst-overlay';
        div.id = 'divShadeSetup';
        div.innerHTML = `<div class="instructions-content">
            ${overlayHeader(titleKey, '', 'svg-add', menu ? { subtitle: subKey, menu } : { subtitle: subKey })}
            <div class="overlay-scroll-content"><div class="setup-body"></div></div>
            <div class="hrDivFooter-Instruc"></div>
            <div class="button-container-overlay setup-foot"></div></div>`;
        this.div = div;
        shOverlay(div, () => this.onClose());
        return div;
    }
    $(sel) { return this.div ? this.div.querySelector(sel) : null; }
    close() { if (this.div) requestCloseOverlay(this.div, () => this.onClose()); }
    // Un chrono en cours veut dire un moteur peut-être en mouvement : on l'arrête avant de partir.
    onClose() {
        this.stopListen();
        if (this.s && this.s.timer) { this.stopTimer(); this.sendCmd('My'); }
        if (this.s && this.s.rtimer) clearTimeout(this.s.rtimer);
        if (this.s) somfy.updateShadeList();
        const cb = this.s && this.s.single && this.s.changed ? this.s.onDone : null;
        this.c = this.s = this.div = null;
        if (typeof cb === 'function') cb();
    }

    // ================= ÉTAPE 1 : CRÉATION =================
    open() {
        if (somfy.shades?.length >= 30) return ui.errorMessage(get('divSomfySettings'), tr('ERR_DEVICE_LIMIT_REACHED'));
        getJSONSync('/getNextShade', (err, next) => {
            if (err) return ui.serviceError(err);
            this.s = null;
            this.c = { fam: null, axes: [], name: '', nameTouched: false, roomId: 0, proto: next.proto || 0, bits: next.bitLength === 80 ? 80 : 56,
                       addr: next.remoteAddress, pulse: 200, remote: 'idle', frame: null, keep: true, detected: false, advOpen: false, timer: null };
            this.mount('DEVICE_CREATE_TITLE', 'SETUP_STEP1_SUB', [{ id: 'full', label: tr('SETUP_FULL_FORM'), action: 'shadeSetup.fullForm()' }]);
            this.renderCreate();
        });
    }
    fullForm() {
        this.stopListen();
        closeOverlay(this.div);
        this.c = this.div = null;
        somfy.openEditShade();
    }
    // ---------- Copie d'un équipement existant ----------
    // Mêmes réglages que le modèle, créé d'un coup puis ouvert dans sa fiche. Pas de My (position
    // propre à chaque fenêtre), ni nom, pièce, ID radio ou télécommandes. Les GPIO d'un relais ne
    // se copient pas non plus : deux équipements ne commandent pas la même broche.
    copyHtml() {
        const list = (somfy.shades || []).slice().sort((a, b) => b.shadeId - a.shadeId);
        if (!list.length) return '';
        return `<div class="setup-copy"><svg><use href="#svg-clipboard"></use></svg><span>${tr('SETUP_COPY_FROM')}</span>
            <select class="selectCompac" onchange="shadeSetup.copyFrom(this)"><option value="">${tr('SETUP_COPY_PICK')}</option>
            ${list.map(x => `<option value="${x.shadeId}">${escHtml(x.name)}</option>`).join('')}</select></div>`;
    }
    familyOf(shadeType) {
        const types = { shutter: [4], roller: [0], blind: [1], awning: [3], drapery: [2, 7, 8], garage: [5, 6], gate: [11, 12, 13, 14, 15, 16], switch: [9, 10] };
        return this.families.find(f => (types[f.id] || []).includes(shadeType));
    }
    copyFrom(sel) {
        const id = parseInt(sel.value, 10), src = (somfy.shades || []).find(x => x.shadeId === id);
        sel.value = '';
        if (!src) return;
        const prompt = ui.promptMessage(this.$('.instructions-content'), this.t('SETUP_COPY_CONFIRM', { name: escHtml(src.name) }), () => this.createCopy(id));
        prompt.querySelector('.sub-message').innerHTML = `<p>${tr('SETUP_COPY_CONFIRM_DESC')}</p>`;
    }
    createCopy(id) {
        const c = this.c;
        getJSONSync(`/shade?shadeId=${id}`, (err, m) => {
            if (err) return ui.serviceError(err);
            const fam = this.familyOf(m.shadeType);
            const obj = { name: `${fam ? tr(fam.label) : m.name} ${(somfy.shades || []).filter(x => x.shadeType === m.shadeType).length + 1}`.slice(0, 20),
                          roomId: 0, remoteAddress: c.addr };
            ['shadeType', 'bitLength', 'flipCommands', 'flipPosition', 'upTime', 'downTime', 'slackUp', 'slackDown', 'tiltType', 'tiltTimeUp', 'tiltTimeDown',
             'tiltFirstOnOpen', 'tiltFirstOnClose', 'stepSize', 'sunSensor', 'repeats', 'ledFeedback', 'stateVocab', 'outputMode', 'pulseTime']
                .forEach(k => { if (m[k] !== undefined) obj[k] = m[k]; });
            obj.proto = m.proto < 8 ? m.proto : c.proto;
            // Seules les tâches de réglage passent : l'appairage est à refaire, les options aussi pour le My.
            // Modèle d'avant setupSteps et appairé : tout y est réputé fait.
            const copied = SETUP_BIT.dir | SETUP_BIT.cal | SETUP_BIT.tilt | SETUP_BIT.order;
            const steps = (!m.setupSteps && m.paired) ? this.tasksFor(m).reduce((a, k) => a | SETUP_BIT[k], 0) : (m.setupSteps || 0);
            obj.setupSteps = steps & copied;
            const owner = somfy.remoteAddressOwner(obj.remoteAddress, NaN, 255);
            if (owner) return ui.errorMessage(this.$('.instructions-content'), tr(owner.isGroup ? 'ERR_REMOTE_ADDRESS_USED_GROUP' : 'ERR_REMOTE_ADDRESS_USED_DEVICE').replace('{name}', escHtml(owner.name)));
            putJSONSync('/addShade', obj, (e, shade) => {
                if (e) return ui.serviceError(e);
                this.stopListen();
                closeOverlay(this.div);
                this.c = this.div = null;
                somfy.updateShadeList();
                somfy.openEditShade(shade.shadeId);
            });
        });
    }
    autoName(fam, axes) {
        const type = fam.type(axes);
        return `${tr(fam.label)} ${(somfy.shades || []).filter(x => x.shadeType === type).length + 1}`;
    }
    pickFamily(id) {
        const c = this.c;
        c.fam = this.families.find(f => f.id === id);
        c.axes = (c.fam.axes || []).map(a => a.def);
        if (!c.nameTouched) c.name = this.autoName(c.fam, c.axes);
        this.renderCreate();
    }
    pickAxis(i, v) {
        const c = this.c;
        c.axes[i] = v;
        if (!c.nameTouched && c.axes.every(x => x != null)) c.name = this.autoName(c.fam, c.axes);
        this.renderCreate();
    }
    setName(v) { this.c.name = v; this.c.nameTouched = v.trim() !== ''; this.refreshCreate(); }
    setAdv(k, v) { this.c[k] = parseInt(v, 10); this.c.detected = false; this.renderCreate(); }
    refreshCreate() {
        const c = this.c, b = this.$('#btnSetupCreate');
        if (!b) return;
        b.disabled = !c.fam || !c.name.trim() || c.axes.some(v => v == null);
        b.classList.toggle('disabled', b.disabled);
    }
    remoteHtml() {
        const c = this.c, arrow = '<svg class="setup-arrow"><use href="#svg-arrowRight"></use></svg>';
        const ico = id => `<div class="setup-ico"><svg><use href="#${id}"></use></svg></div>`;
        switch (c.remote) {
            case 'listen': return `<div class="setup-remote st-listen">${ico('svg-wave')}<div class="setup-txt">
                <b>${tr('SETUP_LISTEN_TITLE')}</b><span>${tr('SETUP_LISTEN_DESC')}</span>
                <div><button type="button" class="setup-link" onclick="shadeSetup.cancelListen()">${tr('BT_CANCEL_1')}</button></div></div></div>`;
            case 'timeout': return `<div class="setup-remote st-warn st-idle" onclick="shadeSetup.listen()">${ico('svg-warning')}<div class="setup-txt">
                <b>${tr('SETUP_TIMEOUT_TITLE')}</b><span>${tr('SETUP_TIMEOUT_DESC')}</span></div>${arrow}</div>`;
            case 'ok': case 'known': {
                const f = c.frame, own = c.remote === 'known', owner = own ? somfy.frameAddressName(f.address) : null;
                return `<div class="setup-remote ${own ? 'st-warn' : 'st-ok'}">${ico(own ? 'svg-warning' : 'svg-check')}<div class="setup-txt">
                <b>${own ? this.t('SETUP_REMOTE_KNOWN', { name: escHtml(owner ? owner.name : '') }) : tr('SETUP_REMOTE_OK')}</b>
                <div class="setup-facts"><span>${somfy.frameProtoLabel(f.proto)}</span><span>${this.t('SETUP_FACT_BITS', { n: f.bits })}</span><span>${this.t('SETUP_FACT_ADDR', { addr: f.address })}</span><span>${f.rssi} dBm</span></div>
                <span>${tr(own ? 'SETUP_REMOTE_KNOWN_DESC' : 'SETUP_REMOTE_OK_DESC')}</span>
                <label class="setup-keep"><input type="checkbox"${c.keep ? ' checked' : ''} onchange="shadeSetup.c.keep = this.checked"> ${tr('SETUP_REMOTE_KEEP')}</label>
                <div><button type="button" class="setup-link" onclick="shadeSetup.listen()">${tr('SETUP_REMOTE_AGAIN')}</button></div></div></div>`;
            }
            default: return `<div class="setup-remote st-idle" onclick="shadeSetup.listen()">${ico('svg-remote')}<div class="setup-txt">
                <b>${tr('SETUP_REMOTE_TITLE')}</b><span>${tr('SETUP_REMOTE_DESC')}</span></div>${arrow}</div>`;
        }
    }
    renderCreate() {
        const c = this.c, sel = c.fam;
        const tiles = this.families.map(f => `<div class="setup-tile${sel === f ? ' sel' : ''}" onclick="shadeSetup.pickFamily('${f.id}')"><svg><use href="#${f.ico}"></use></svg>${tr(f.label)}</div>`).join('');
        const axes = sel && sel.axes ? `<div class="setup-axes">${sel.axes.map((a, i) => {
            const cur = a.opts.find(o => o[0] === c.axes[i]);
            const desc = c.axes[i] == null ? '' : a.desc ? a.desc(c.axes[i]) : (cur && cur[2] ? tr(cur[2]) : '');
            return `<div><div class="setup-axis-q">${tr(a.q)}</div><div class="setup-chips">${a.opts.map(([v, l]) =>
                `<div class="setup-chip${c.axes[i] === v ? ' sel' : ''}" onclick="shadeSetup.pickAxis(${i},'${v}')">${tr(l)}</div>`).join('')}</div>${desc ? `<div class="setup-axis-d">${desc}</div>` : ''}${a.extra ? a.extra(c.axes[i], c) : ''}</div>`;
        }).join('')}</div>` : '';
        const rooms = _rooms.map(r => `<option value="${r.roomId}"${r.roomId === c.roomId ? ' selected' : ''}>${escHtml(r.name)}</option>`).join('');
        const off = sel ? '' : ' setup-off';
        const badge = c.detected ? `<span class="setup-detected">${tr('SETUP_DETECTED')}</span>` : '';
        this.$('.setup-body').innerHTML = `
            <div class="setup-sec">${this.copyHtml()}<div class="setup-q">${tr('SETUP_TYPE_Q')}</div><div class="setup-grid">${tiles}</div>${axes}</div>
            <div class="setup-sec${off}"><div class="setup-fields">
              <div class="uniRow"><div class="unifield-content"><label class="label" for="setupName">${tr('NAME')}</label>
                <input id="setupName" class="inputAndSelect" maxlength="20" placeholder=" " value="${escAttr(c.name)}" oninput="shadeSetup.setName(this.value)"></div></div>
              <div class="uniRow"><div class="unifield-content"><label class="label" for="setupRoom">${tr('ROOM')}</label>
                <select id="setupRoom" class="inputAndSelect" onchange="shadeSetup.c.roomId = parseInt(this.value, 10)">${rooms}</select></div></div>
            </div></div>
            <div class="setup-sec${off}">${this.remoteHtml()}</div>
            <details class="setup-adv"${c.advOpen ? ' open' : ''} ontoggle="shadeSetup.c.advOpen = this.open"><summary>${tr('SETUP_ADVANCED')}<span>${this.t('SETUP_ADV_SUMMARY', { proto: somfy.frameProtoLabel(c.proto), bits: c.bits, id: c.addr })}</span></summary>
              <div class="setup-adv-body">
                <div class="uniRow"><div class="unifield-content"><label class="label">${tr('PROTOCOL')}${badge}</label>
                  <select class="inputAndSelect" onchange="shadeSetup.setAdv('proto', this.value)">${[0, 1, 2].map(v => `<option value="${v}"${c.proto === v ? ' selected' : ''}>${somfy.frameProtoLabel(v)}</option>`).join('')}</select></div></div>
                <div class="uniRow"><div class="unifield-content"><label class="label">${tr('BIT')}${badge}</label>
                  <select class="inputAndSelect" onchange="shadeSetup.setAdv('bits', this.value)">${[56, 80].map(v => `<option value="${v}"${c.bits === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div></div>
                <div class="uniRow"><div class="unifield-content"><label class="label">${tr('DEVICE_ID')}</label>
                  <input class="inputAndSelect" type="number" min="1" max="16777215" placeholder=" " value="${c.addr}" oninput="shadeSetup.c.addr = parseInt(this.value, 10)"></div></div>
                <div class="setup-note">${tr('SETUP_ADV_NOTE')}</div>
              </div></details>`;
        this.$('.setup-foot').innerHTML = `<button type="button" line onclick="shadeSetup.close()">${tr('BT_CANCEL_1')}</button>
            <button type="button" id="btnSetupCreate" onclick="shadeSetup.create()">${tr('BT_CREATE')}</button>`;
        this.refreshCreate();
    }
    listen() {
        const c = this.c;
        c.remote = 'listen';
        this.stopListen();
        c.timer = setTimeout(() => { c.timer = null; c.remote = 'timeout'; this.renderCreate(); }, SETUP_LISTEN_MS);
        this.renderCreate();
    }
    stopListen() { if (this.c && this.c.timer) { clearTimeout(this.c.timer); this.c.timer = null; } }
    cancelListen() {
        const c = this.c;
        this.stopListen();
        c.remote = c.frame ? (somfy.frameAddressName(c.frame.address) ? 'known' : 'ok') : 'idle';
        this.renderCreate();
    }
    // Appelé par Somfy.procRemoteFrame pour chaque trame décodée.
    onFrame(frame) {
        const s = this.s;
        if (s && s.single && s.tasks[s.cur] && s.tasks[s.cur].id === 'remote') return this.remoteFrame(frame);
        const c = this.c;
        if (!c || c.remote !== 'listen' || frame.valid === false || !get('divShadeSetup')) return;
        this.stopListen();
        c.frame = frame;
        c.proto = frame.proto;
        c.bits = frame.bits === 80 ? 80 : 56;
        c.detected = true;
        c.remote = somfy.frameAddressName(frame.address) ? 'known' : 'ok';
        this.renderCreate();
    }
    create() {
        const c = this.c, body = this.$('.instructions-content');
        const obj = Object.assign({ name: c.name.trim(), shadeType: c.fam.type(c.axes), roomId: c.roomId, proto: c.proto, bitLength: c.bits, remoteAddress: c.addr, setupSteps: 0 },
            c.fam.settings ? c.fam.settings(c.axes, c) : {});
        if (!obj.name || obj.name.length > 20) return ui.errorMessage(body, tr('ERR_DEVIVE_NAME_INVALID'));
        if (isNaN(obj.remoteAddress) || obj.remoteAddress < 1 || obj.remoteAddress > 16777215) return ui.errorMessage(body, tr('ERR_REMOTE_ADDRESS_INVALID'));
        const owner = somfy.remoteAddressOwner(obj.remoteAddress, NaN, 255);
        if (owner) return ui.errorMessage(body, tr(owner.isGroup ? 'ERR_REMOTE_ADDRESS_USED_GROUP' : 'ERR_REMOTE_ADDRESS_USED_DEVICE').replace('{name}', escHtml(owner.name)));
        this.stopListen();
        putJSONSync('/addShade', obj, (err, shade) => {
            if (err) return ui.serviceError(err);
            const link = c.frame && c.keep ? c.frame : null;
            const go = () => { somfy.updateShadeList(); this.startSetup(shade, !!link); };
            if (!link) return go();
            putJSON('/linkRemote', { shadeId: shade.shadeId, remoteAddress: link.address, rollingCode: link.rcode }, (e) => { if (e) ui.serviceError(e); go(); });
        });
    }

    // ================= ÉTAPE 2 : MISE EN SERVICE =================
    resume(shadeId) {
        getJSONSync(`/shade?shadeId=${shadeId}`, (err, shade) => {
            if (err) return ui.serviceError(err);
            this.mount('SETUP_RESUME_TITLE', 'SETUP_RESUME_TITLE');
            this.startSetup(shade, false);
        });
    }
    // Une tâche seule, hors parcours (fiche de l'équipement, désappairage). Les autres bits de
    // setupSteps sont repris tels quels : la tâche ne réécrit que le sien.
    runTask(shadeId, taskId, onDone) {
        getJSONSync(`/shade?shadeId=${shadeId}`, (err, shade) => {
            if (err) return ui.serviceError(err);
            this.mount({ unpair: 'UNPAIR_TITLE', remote: 'REMOTESLIST_TITLE' }[taskId] || 'SETUP_RESUME_TITLE', 'SETUP_RESUME_TITLE');
            this.startSetup(shade, false, taskId, onDone);
        });
    }
    startSetup(shade, hadRemote, only, onDone) {
        const st = somfy.shadeTypes.find(x => x.type === shade.shadeType) || {}, steps = shade.setupSteps || 0;
        this.c = null;
        this.s = {
            shade, st, tt: st.tilt ? (shade.tiltType || 0) : 0, W: this.words(shade.shadeType), hadRemote,
            supportsMy: !somfy.noMyShadeTypes.includes(shade.shadeType), isDry: somfy.dryContactShadeTypes.includes(shade.shadeType),
            isToggle: somfy.toggleShadeTypes.includes(shade.shadeType) || somfy.dryContactShadeTypes.includes(shade.shadeType),
            tasks: this.tasksFor(shade).concat(['unpair', 'remote'].includes(only) ? [only] : []).map(id => ({ id, sub: SETUP_INIT[id], state: (steps & SETUP_BIT[id]) ? 'done' : null })),
            single: !!only, onDone,
            cur: 0, hist: {}, marks: {}, timer: null, t0: 0, sent: false, inter: null, err: '', flip: !!shade.flipCommands, dzManual: false,
            my: null, sun: null, myMode: null, myStep: null, myPos: 0, myEl: 0, myRaw: 0, myWarn: '', myTarget: 50,
            myTilt: shade.myTiltPos >= 0 ? shade.myTiltPos : 50, posq: shade.flipPosition ? 'open' : 'closed', reach: (shade.repeats ?? 1) > 1 ? 'strong' : 'normal', led: shade.ledFeedback ? 'oui' : 'non'
        };
        const s = this.s, first = s.tasks.findIndex(T => T.state !== 'done');
        s.cur = first < 0 ? s.tasks.length : first;
        if (only) {
            s.home = s.cur = s.tasks.findIndex(T => T.id === only);
            if (s.home < 0) { closeOverlay(this.div); this.onClose(); return; }
            const T = s.tasks[s.home];
            if (only === 'pair' && shade.paired) T.state = 'done';
            s.editing = T.state === 'done';
            this.prefill(shade);
            // Création ou modification : une tâche déjà faite s'ouvre sur ce qui est réglé.
            if (T.state === 'done' && ['pair', 'dir', 'cal', 'tilt', 'order'].includes(only)) T.sub = 'view';
        }
        if (only === 'remote') this.remoteListen(true);
        const sub = this.$('.overlayHeader-subtitle');
        if (sub) sub.textContent = only ? shade.name : this.t('SETUP_STEP2_SUB', { name: shade.name });
        const menu = this.$('.overlayHeader-dropdown-container');
        if (menu) menu.remove();
        this.render();
    }
    get shadeId() { return this.s.shade.shadeId; }
    sendCmd(cmd) { somfy.sendCommand(this.shadeId, cmd); }
    sendTilt(cmd) { somfy.sendTiltCommand(this.shadeId, cmd); }
    stopTimer() { if (this.s && this.s.timer) { clearInterval(this.s.timer); this.s.timer = null; } }
    startTimer() {
        const s = this.s;
        s.t0 = Date.now();
        s.timer = setInterval(() => { const e = this.$('#setupChrono'); if (e) e.textContent = this.fmt(Date.now() - s.t0); }, 100);
    }
    // Reprend ce qui est déjà enregistré, pour l'afficher et le modifier. Les temps ne sont repris
    // que si leur tâche est faite : sinon ce sont les valeurs par défaut, pas des mesures.
    prefill(shade) {
        const s = this.s, done = id => !!(s.tasks.find(T => T.id === id) || {}).state;
        if (done('cal')) {
            Object.assign(s.marks, { up: { inter: null, final: shade.upTime }, down: { inter: null, final: shade.downTime } });
            if (shade.slackUp) s.marks.dzup = { inter: shade.slackUp, final: shade.upTime };
            if (shade.slackDown) s.marks.dzdown = { inter: shade.downTime - shade.slackDown, final: shade.downTime };
            s.dzManual = !!(shade.slackUp || shade.slackDown);
        }
        if (done('tilt')) Object.assign(s.marks, { tup: { inter: null, final: shade.tiltTimeUp }, tdown: { inter: null, final: shade.tiltTimeDown } });
        s.orderOpen = !!shade.tiltFirstOnOpen;
        s.orderClose = !!shade.tiltFirstOnClose;
        if (s.supportsMy && shade.myPos >= 0) Object.assign(s, shade.simMy ? { my: 'non', myMode: 'sim' } : { my: 'oui' }, { myStep: 'learned', myPos: shade.myPos, myTarget: shade.myPos });
        if (s.st.sun) s.sun = shade.sunSensor ? 'oui' : 'non';
    }
    // Désappairer depuis la vue de l'appairage : même fenêtre, l'autre tâche.
    switchTask(id) {
        const s = this.s;
        let k = s.tasks.findIndex(T => T.id === id);
        if (k < 0) { s.tasks.push({ id, sub: SETUP_INIT[id], state: null }); k = s.tasks.length - 1; }
        s.home = s.cur = k;
        s.sent = false;
        const t = this.$('.overlayHeader-title');
        if (t) t.textContent = this.title(s.tasks[k]);
        this.render();
    }
    // Nouvelle mesure : les repères repris de l'enregistré ne doivent pas passer pour des mesures.
    remeasure() {
        const s = this.s, cal = s.tasks[s.cur].id === 'cal';
        (cal ? ['up', 'down', 'dzup', 'dzdown'] : ['tup', 'tdown']).forEach(k => delete s.marks[k]);
        this.go(cal ? 'up' : 'tup');
    }
    orderSave() {
        const s = this.s, word = v => tr(v ? 'SETUP_S_SLATS_FIRST' : 'SETUP_S_TRAVEL_FIRST');
        this.complete({ tiltFirstOnOpen: s.orderOpen, tiltFirstOnClose: s.orderClose }, `${word(s.orderOpen)} / ${word(s.orderClose)}`);
    }
    save(fields, cb) {
        putJSON('/saveShade', Object.assign({ shadeId: this.shadeId }, fields), (err, shade) => {
            if (err) return ui.serviceError(err);
            if (shade && this.s) { this.s.shade = shade; this.s.changed = true; }
            if (typeof cb === 'function') cb(shade);
        });
    }
    mask() { return this.s.tasks.reduce((m, T) => T.state === 'done' ? m | SETUP_BIT[T.id] : m, 0); }
    // Clôt la tâche courante : ses réglages et son bit partent dans la même requête.
    complete(fields, note) {
        const s = this.s, T = s.tasks[s.cur];
        T.state = 'done';
        T.note = note;
        // Tâche seule : la fenêtre se ferme et rafraîchit la liste, donc pas avant l'enregistrement.
        this.save(Object.assign({}, fields, { setupSteps: this.mask() }), () => { if (s.single) this.nextTask(); });
        if (!s.single) this.nextTask();
    }
    nextTask() {
        const s = this.s;
        s.sent = false;
        s.err = '';
        // Tâche seule : un détour (temps de course réclamés par les options) ramène à la tâche
        // demandée, qui une fois finie ou passée ferme la fenêtre.
        if (s.single) {
            if (s.cur !== s.home && s.tasks[s.home].state !== 'done') { s.cur = s.home; return this.render(); }
            const cb = s.onDone;
            s.changed = false;
            closeOverlay(this.div);
            this.onClose();
            if (typeof cb === 'function') cb();
            return;
        }
        s.cur++;
        while (s.cur < s.tasks.length && s.tasks[s.cur].state === 'done') s.cur++;
        this.render();
    }
    go(sub) {
        const s = this.s, T = s.tasks[s.cur];
        this.stopTimer();
        s.sent = false;
        s.err = '';
        if (T.sub !== sub) (s.hist[s.cur] = s.hist[s.cur] || []).push(T.sub);
        T.sub = sub;
        this.render();
    }
    // Retour : la sous-étape précédente de la tâche, sinon la tâche précédente rouverte au début.
    prev() {
        const s = this.s, h = s.hist[s.cur];
        this.stopTimer();
        s.sent = false;
        s.err = '';
        if (h && h.length) { s.tasks[s.cur].sub = h.pop(); return this.render(); }
        if (s.cur > 0) this.reopen(s.cur - 1);
    }
    reopen(k) {
        const s = this.s;
        this.stopTimer();
        s.sent = false;
        s.err = '';
        s.hist[k] = [];
        s.tasks[k].sub = SETUP_INIT[s.tasks[k].id];
        s.cur = k;
        this.render();
    }
    skip() {
        const s = this.s;
        this.stopTimer();
        if (s.tasks[s.cur].state !== 'done') s.tasks[s.cur].state = 'skipped';
        this.nextTask();
    }
    later() { this.stopTimer(); this.s.cur = this.s.tasks.length; this.render(); }
    cmd(c) { this.sendCmd(c); this.s.sent = true; this.render(); }

    titleFor(shade, id) {
        const st = somfy.shadeTypes.find(x => x.type === shade.shadeType) || {}, tt = st.tilt ? (shade.tiltType || 0) : 0;
        const toggle = somfy.toggleShadeTypes.includes(shade.shadeType) || somfy.dryContactShadeTypes.includes(shade.shadeType);
        return tr({ pair: 'PAIR_TITLE', unpair: 'UNPAIR_TITLE', remote: 'REMOTESLIST_TITLE', dir: toggle ? 'SETUP_T_TEST' : tt === 3 ? 'SETUP_T_SLATS_DIR' : 'SETUP_T_DIR',
                    cal: 'SETUP_T_TRAVEL', tilt: 'SETUP_T_TILT', order: 'SETUP_T_ORDER', opts: 'OPTION' }[id]);
    }
    title(T) { return this.titleFor(this.s.shade, T.id); }

    // ---------- Zone « Mise en service » de la fiche : les mêmes tâches, une par une ----------
    // Une tâche faite affiche ce qu'elle a réglé : la coche verte dit déjà « fait ».
    valueFor(shade, id) {
        const f = ms => this.fmt(ms || 0);
        const dz = ms => ms ? ' · ' + this.t('SETUP_S_DEADZONE', { t: f(ms) }) : '';
        const toggle = somfy.toggleShadeTypes.includes(shade.shadeType) || somfy.dryContactShadeTypes.includes(shade.shadeType);
        const first = v => tr(v ? 'SETUP_S_SLATS_FIRST' : 'SETUP_S_TRAVEL_FIRST');
        switch (id) {
            case 'pair': return tr('SETUP_S_PAIRED');
            case 'dir': return tr(toggle ? 'SETUP_S_RESPONDS' : shade.flipCommands ? 'SETUP_V_DIR_FLIPPED' : 'SETUP_V_DIR_NORMAL');
            case 'cal': return `${f(shade.upTime)}${dz(shade.slackUp)} / ${f(shade.downTime)}${dz(shade.slackDown)}`;
            case 'tilt': return `${f(shade.tiltTimeUp)} / ${f(shade.tiltTimeDown)}`;
            case 'order': return `${first(shade.tiltFirstOnOpen)} / ${first(shade.tiltFirstOnClose)}`;
            case 'opts': {
                const st = somfy.shadeTypes.find(x => x.type === shade.shadeType) || {}, parts = [];
                if (!somfy.noMyShadeTypes.includes(shade.shadeType)) parts.push(shade.myPos >= 0 ? this.t(shade.simMy ? 'SETUP_S_MY_SIM' : 'SETUP_S_MY', { pos: shade.myPos }) : tr('SETUP_S_NO_MY'));
                if (st.tilt && [1, 2, 4].includes(shade.tiltType) && shade.myPos >= 0 && shade.myTiltPos >= 0) parts.push(this.t('SETUP_S_MY_TILT', { tilt: shade.myTiltPos }));
                if (st.sun) parts.push(tr(shade.sunSensor ? 'SETUP_S_SUN' : 'SETUP_S_NO_SUN'));
                if ((shade.repeats ?? 1) > 1) parts.push(tr('SETUP_S_REACH_STRONG'));
                if (this.hasLed() && shade.ledFeedback) parts.push(tr('SETUP_S_LED'));
                return parts.join(' · ') || tr('SETUP_S_REACH_NORMAL');
            }
        }
        return tr('SETUP_S_DONE');
    }
    // Signal des télécommandes liées : le dernier RSSI connu, moyenné s'il y en a plusieurs.
    remoteSignal(shade) {
        const vals = (shade.linkedRemotes || []).map(r => (typeof r.lastRssi === 'number' && r.lastRssi > -128) ? r.lastRssi : somfy._getStoredRemoteSignal(r.remoteAddress))
            .filter(v => typeof v === 'number');
        const n = (shade.linkedRemotes || []).length;
        const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        const level = avg === null ? 'unknown' : somfy.rssiLevel(avg);
        return `<span class="setup-signal"><svg class="linkedRemote-signal-icon sig-${level}"><use href="#svg-tabRadio"></use></svg>${tr('M_SIGNAL')} | <span class="sig-${level}">${avg === null ? '—' : avg + ' dBm'}</span>${n > 1 && avg !== null ? ` (${tr('SETUP_SIGNAL_AVG')})` : ''}</span>`;
    }
    hasLed() { return typeof window.__ledPin === 'number' && window.__ledPin >= 0; }
    renderEditPanel(shade) {
        const sec = get('divShadeSetupTasks'), list = get('divShadeSetupList');
        if (!sec || !list) return;
        sec.style.display = shade ? '' : 'none';
        this.editShade = shade;
        this.renderTip(shade);
        this.renderActivity(shade);
        if (!shade) return;
        const steps = shade.setupSteps || 0, legacy = !steps && shade.paired;
        const remotes = (shade.linkedRemotes || []).length;
        const pills = get('spanShadeSetupPills');
        if (pills) pills.innerHTML = this.badgeHtml(shade) + (shade.paired ? `<span class="setup-pill"><svg><use href="#svg-check"></use></svg>${tr('SETUP_PILL_PAIRED')}</span>` : '');
        list.innerHTML = this.tasksFor(shade).map((id, i) => {
            // Équipement d'avant setupSteps : rien ne dit ce qui a été fait, on n'affiche pas d'état.
            const done = id === 'pair' ? !!shade.paired : !!(steps & SETUP_BIT[id]);
            const status = legacy && id !== 'pair' ? '' : done ? this.valueFor(shade, id) : tr('SETUP_S_TODO');
            const state = done && status ? ' setup-row-done' : status ? ' setup-step-todo' : '';
            return `<button type="button" class="editDevice-btn-pair setup-row setup-step${state}" onclick="shadeSetup.fromEdit(${shade.shadeId},'${id}')">
            <div class="editDevice-pair-btn-content"><div class="editDevice-pair-icon setup-step-n">${done && status ? '<svg><use href="#svg-check"></use></svg>' : `<span>${i + 1}</span>`}</div>
            <div class="uniText"><span class="editDevice-pair-title">${this.titleFor(shade, id)}</span>${status ? `<span class="uniStatus-Button">${status}</span>` : ''}</div></div>
            <svg class="editDevice-arrow-icon"><use href="#svg-arrowRight"></use></svg></button>`;
        }).join('')
            + `<hr class="setup-sep">
            <button type="button" class="editDevice-btn-pair setup-row setup-remote-row" onclick="shadeSetup.runTask(${shade.shadeId},'remote')">
            <div class="editDevice-pair-btn-content"><div class="editDevice-pair-icon"><svg><use href="#svg-linkRemot"></use></svg></div>
            <div class="uniText"><span class="editDevice-pair-title">${tr('REMOTESLIST_TITLE')}</span><span id="spanShadeRemoteSignal" class="uniStatus-Button">${remotes ? this.remoteSignal(shade) : tr('BT_LINK_REMOTE_DESC')}</span></div></div>
            <svg class="editDevice-arrow-icon setup-add"><use href="#svg-add"></use></svg></button>`
            + (remotes ? `<div class="setup-remotes">${somfy.modalRemotesListHtml(shade)}</div>` : '');
    }
    renderActivity(shade) {
        const box = get('divShadeActivity');
        if (!box) return;
        if (shade && typeof shade.lastSentAgo !== 'number' && this.act && this.act.shadeId === shade.shadeId) return;
        box.style.display = shade && typeof shade.lastSentAgo === 'number' ? '' : 'none';
        if (box.style.display) return;
        const now = Date.now();
        if (!shade._actAt) shade._actAt = now;
        const prev = this.act && this.act.shadeId === shade.shadeId ? this.act : {};
        const at = ago => ago >= 0 ? shade._actAt - ago * 1000 : 0;
        const act = { shadeId: shade.shadeId, shadeType: shade.shadeType, remotes: (shade.linkedRemotes || []).map(r => r.remoteAddress) };
        act.sentAt = at(shade.lastSentAgo);
        act.sentCmd = shade.lastSentCmd;
        if (prev.sentAt > act.sentAt) { act.sentAt = prev.sentAt; act.sentCmd = prev.sentCmd; }
        act.heardAt = 0;
        (shade.linkedRemotes || []).forEach(r => {
            const t = at(typeof r.lastRxAgo === 'number' ? r.lastRxAgo : -1);
            if (t > act.heardAt) { act.heardAt = t; act.heardRssi = r.lastRssi; }
        });
        if (prev.heardAt > act.heardAt) { act.heardAt = prev.heardAt; act.heardRssi = prev.heardRssi; }
        this.act = act;
        this.paintActivity();
        if (!this.actTimer) this.actTimer = setInterval(() => this.paintActivity(), 1000);
    }
    agoText(t) {
        const s = Math.max(0, Math.round((Date.now() - t) / 1000));
        if (s < 10) return tr('SHADE_ACT_NOW');
        if (s < 60) return this.t('SHADE_ACT_AGO_S', { n: s });
        // Les littéraux restent visibles pour check_i18n.py (cf. TR_LITERAL), d'où le ternaire plutôt
        // qu'un suffixe _ONE concaténé.
        const n = s < 3600 ? Math.floor(s / 60) : s < 86400 ? Math.floor(s / 3600) : Math.floor(s / 86400);
        if (s < 3600) return n === 1 ? tr('SHADE_ACT_AGO_MIN_ONE') : this.t('SHADE_ACT_AGO_MIN', { n });
        if (s < 86400) return n === 1 ? tr('SHADE_ACT_AGO_H_ONE') : this.t('SHADE_ACT_AGO_H', { n });
        return n === 1 ? tr('SHADE_ACT_AGO_D_ONE') : this.t('SHADE_ACT_AGO_D', { n });
    }
    paintActivity() {
        const a = this.act, box = get('divShadeActivity');
        if (!a || !box || box.style.display) return;
        const W = this.words(a.shadeType);
        const cmd = { Up: W.up, Down: W.down }[a.sentCmd] || a.sentCmd;
        get('valShadeSent').textContent = a.sentAt ? `${this.agoText(a.sentAt)} · ${cmd}` : tr('SHADE_ACT_NEVER');
        get('dotShadeSent').classList.toggle('ok', !!a.sentAt);
        get('rowShadeHeard').style.display = a.remotes.length ? '' : 'none';
        get('valShadeHeard').textContent = a.heardAt ? `${this.agoText(a.heardAt)}${typeof a.heardRssi === 'number' && a.heardRssi > -128 ? ` · ${a.heardRssi} dBm` : ''}` : tr('SHADE_ACT_NEVER');
        get('dotShadeHeard').classList.toggle('ok', !!a.heardAt);
    }
    onRemoteHeard(frame) {
        const sh = this.editShade, addr = Number(frame.address);
        const r = sh && (sh.linkedRemotes || []).find(x => Number(x.remoteAddress) === addr);
        if (!r || parseInt(get('spanShadeId')?.innerText, 10) !== sh.shadeId) return;
        r.lastRssi = frame.rssi;
        const sig = get('spanShadeRemoteSignal');
        if (sig) sig.innerHTML = this.remoteSignal(sh);
        if (this.act && this.act.shadeId === sh.shadeId) { this.act.heardAt = Date.now(); this.act.heardRssi = frame.rssi; this.paintActivity(); }
    }
    onShadeCommand(msg) {
        const a = this.act;
        if (!a || !msg || msg.shadeId !== a.shadeId) return;
        if (msg.source !== 'remote') { a.sentAt = Date.now(); a.sentCmd = msg.cmd; }
        else if (a.remotes.includes(msg.sourceAddress)) { a.heardAt = Date.now(); a.heardRssi = msg.lastRssi; }
        else return;
        this.paintActivity();
    }
    renderTip(shade) {
        const box = get('divShadeTip'), p = get('pShadeTip');
        if (!box || !p) return;
        box.style.display = shade ? '' : 'none';
        if (!shade) return;
        const toggle = somfy.toggleShadeTypes.includes(shade.shadeType) || somfy.dryContactShadeTypes.includes(shade.shadeType);
        p.textContent = tr(this.missingSteps(shade) ? 'SETUP_TIP_RESUME' : toggle ? 'SETUP_TIP_REACH' : 'SETUP_TIP_DIR');
    }
    // Appelé à chaque changement de la liste des télécommandes (liaison, suppression) : la ligne de
    // la fiche et, si elle est ouverte, la fenêtre de liaison suivent.
    renderRemotes(shade) {
        if (get('divShadeSetupTasks') && parseInt(get('spanShadeId')?.innerText, 10) === shade.shadeId) this.renderEditPanel(shade);
        const s = this.s;
        if (s && s.single && s.tasks[s.cur]?.id === 'remote' && s.shade.shadeId === shade.shadeId) { s.shade = shade; this.render(); }
    }
    // La fiche est rechargée après la tâche, qui a enregistré ses champs elle-même.
    fromEdit(shadeId, taskId) {
        const run = () => this.runTask(shadeId, taskId, () => somfy._openEditShade(shadeId));
        // Fiche modifiée (type changé, par exemple) : enregistrée d'abord, pour que la tâche parte du
        // bon type et qu'un enregistrement ultérieur n'écrase pas ce qu'elle aura mesuré.
        if (isDirty) return somfy.saveShade(() => { somfy._openEditShade(shadeId); run(); });
        run();
    }
    status(T, k) {
        if (T.state === 'done') return T.note || tr('SETUP_S_DONE');
        if (T.state === 'skipped') return tr('SETUP_S_SKIPPED');
        return k === this.s.cur ? tr('SETUP_S_CURRENT') : '';
    }
    render() {
        const s = this.s;
        if (s.cur >= s.tasks.length) return this.renderFinal();
        const nav = () => {
            const canBack = (s.hist[s.cur] || []).length || (s.cur > 0 && !s.single);
            return `<div class="setup-nav">${canBack ? `<button type="button" class="setup-link" onclick="shadeSetup.prev()">← ${tr('BT_GO_BACK')}</button>` : '<span></span>'}${s.editing ? '' : `<button type="button" class="setup-link" onclick="shadeSetup.skip()">${tr('SETUP_SKIP')}</button>`}</div>`;
        };
        this.$('.setup-body').innerHTML = `<div class="setup-tasks">${s.tasks.map((T, k) => {
            if (s.single) return k === s.cur ? `<div class="setup-task active setup-single"><div class="setup-task-b">${this.taskBody(T)}${s.timer || T.id === 'remote' || T.sub === 'view' ? '' : nav()}</div></div>` : '';
            const cls = k === s.cur ? 'active' : (T.state || '');
            const n = T.state === 'done' ? '<svg><use href="#svg-check"></use></svg>' : (k + 1);
            const reopen = k !== s.cur && T.state ? ` onclick="shadeSetup.reopen(${k})" title="${escAttr(tr('SETUP_REOPEN'))}"` : '';
            return `<div class="setup-task ${cls}"><div class="setup-task-h"${reopen}><div class="setup-task-n">${n}</div><div class="setup-task-t">${this.title(T)}</div><div class="setup-task-s">${this.status(T, k)}</div></div>
                ${k === s.cur ? `<div class="setup-task-b">${this.taskBody(T)}${s.timer || T.id === 'remote' ? '' : nav()}</div>` : ''}</div>`;
        }).join('')}</div>`;
        this.$('.setup-foot').innerHTML = s.single ? `<button type="button" line onclick="shadeSetup.close()">${tr('BT_CLOSE')}</button>`
            : `<button type="button" line onclick="shadeSetup.later()">${tr('SETUP_LATER')}</button>`;
        this.bindProg();
    }
    // PROG se maintient enfoncé (mêmes répétitions que l'assistant d'appairage) : la question
    // n'apparaît qu'au premier appui, sans re-rendu qui ôterait le bouton sous le doigt.
    bindProg() {
        const btn = this.$('#btnSetupProg');
        if (!btn) return;
        const id = this.shadeId;
        const fnRep = (err) => { if (!err && mouseDown) somfy.sendCommandRepeat(id, 'prog', null, fnRep); };
        const press = (evt) => {
            if (!isPrimaryPress(evt)) return;
            somfy.sendCommand(id, 'prog', null, fnRep);
            this.s.sent = true;
            btn.setAttribute('line', '');
            const after = this.$('#setupAfterProg');
            if (after) after.hidden = false;
        };
        btn.addEventListener('mousedown', press, true);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, true);
    }

    taskBody(T) {
        switch (T.id) {
            case 'pair': return this.bodyPair(T, false);
            case 'unpair': return this.bodyPair(T, true);
            case 'remote': return this.bodyRemote();
            case 'dir': return this.bodyDir(T);
            case 'cal': return this.bodyCal(T);
            case 'tilt': return this.bodyTilt(T);
            case 'order': return this.bodyOrder(T);
            case 'opts': return this.bodyOpts();
        }
        return '';
    }
    // Désappairer suit le même geste : mémoire ouverte avec une télécommande appairée, puis PROG.
    bodyPair(T, un) {
        if (T.sub === 'view') return `<div class="setup-okline"><svg><use href="#svg-check"></use></svg><span>${tr('SETUP_S_PAIRED')}</span></div>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('pret')">${tr('SETUP_REPAIR')}</button><button type="button" onclick="shadeSetup.switchTask('unpair')">${tr('DEVICE_UNPAIR')}</button></div>`;
        if (T.sub === 'prog') return `
            <p class="setup-p">${tr(un ? 'UNPAIR_DEVICE_STEP_2_1' : 'SETUP_PAIR_PROG')}</p>
            <button type="button" id="btnSetupProg" class="setup-prog">${tr('BT_PROG')}</button>
            <div id="setupAfterProg" class="setup-col"${this.s.sent ? '' : ' hidden'}>
              <p class="setup-p sub">${tr('SETUP_WHAT_DID')}</p>
              <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('rien')">${tr('SETUP_NOTHING')}</button><button type="button" class="btn-success" onclick="shadeSetup.${un ? 'unpairDone' : 'pairDone'}()">${tr('SETUP_PAIR_JOGGED')}</button></div>
            </div>`;
        if (T.sub === 'rien') return `
            <p class="setup-p">${tr('SETUP_PAIR_HELP')}</p>
            <p class="setup-p sub">${tr('SETUP_PAIR_HELP_2')}</p>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('pret')">${tr('SETUP_PAIR_REOPEN')}</button><button type="button" onclick="shadeSetup.go('prog')">${tr('SETUP_PAIR_RETRY')}</button></div>`;
        return `
            <p class="setup-p">${un ? tr('UNPAIR_DEVICE_STEP_1_1') : this.t('SETUP_PAIR_OPEN', { remote: tr(this.s.hadRemote ? 'SETUP_PAIR_THIS_REMOTE' : 'SETUP_PAIR_ANY_REMOTE') })}</p>
            <p class="setup-p sub">${tr('SETUP_PAIR_2MIN')}</p>
            <div class="setup-actions"><button type="button" onclick="shadeSetup.go('prog')">${tr('SETUP_PAIR_JOGGED')}</button></div>`;
    }
    pairDone() {
        putJSON('/setPaired', { shadeId: this.shadeId, paired: true }, (err) => {
            if (err) return ui.serviceError(err);
            this.complete({}, tr('SETUP_S_PAIRED'));
        });
    }
    // ---------- Lier une télécommande physique (pas de bit : facultatif, et répétable) ----------
    remoteListen(silent) {
        const s = this.s;
        if (s.rtimer) clearTimeout(s.rtimer);
        s.rstate = 'listen';
        s.rtimer = setTimeout(() => { s.rtimer = null; s.rstate = 'timeout'; this.render(); }, SETUP_LISTEN_MS);
        if (!silent) this.render();
    }
    // Une télécommande maintenue enfoncée répète sa trame : rbusy écarte les suivantes tant que la
    // première liaison est en vol.
    remoteFrame(frame) {
        const s = this.s;
        if (s.rstate !== 'listen' || s.rbusy || frame.valid === false || !this.div) return;
        clearTimeout(s.rtimer);
        s.rtimer = null;
        s.rframe = frame;
        if ((s.shade.linkedRemotes || []).some(r => Number(r.remoteAddress) === Number(frame.address))) { s.rstate = 'already'; return this.render(); }
        const other = somfy.frameAddressName(frame.address);
        s.rbusy = true;
        putJSON('/linkRemote', { shadeId: this.shadeId, remoteAddress: frame.address, rollingCode: frame.rcode }, (err, data) => {
            s.rbusy = false;
            if (err) { ui.serviceError(err); return this.remoteListen(); }
            // Le RSSI de la trame qui a servi à lier vaut mieux qu'un badge vide jusqu'au prochain appui.
            const linked = (data.linkedRemotes || []).find(r => Number(r.remoteAddress) === Number(frame.address));
            if (linked && (typeof linked.lastRssi !== 'number' || linked.lastRssi <= -128)) linked.lastRssi = frame.rssi;
            s.shade = data;
            s.rshared = other ? other.name : null;
            s.rstate = 'linked';
            somfy.setLinkedRemotesList(data);
            this.render();
        });
    }
    remoteCancel() { const s = this.s; if (s.rtimer) clearTimeout(s.rtimer); s.rtimer = null; s.rstate = 'list'; this.render(); }
    bodyRemote() {
        const s = this.s, f = s.rframe, remotes = (s.shade.linkedRemotes || []).length;
        const ico = id => `<div class="setup-ico"><svg><use href="#${id}"></use></svg></div>`;
        const facts = f ? `<div class="setup-facts"><span>${somfy.frameProtoLabel(f.proto)}</span><span>${this.t('SETUP_FACT_BITS', { n: f.bits })}</span><span>${this.t('SETUP_FACT_ADDR', { addr: f.address })}</span><span>${f.rssi} dBm</span></div>` : '';
        let card = '';
        if (s.rstate === 'listen') card = `<div class="setup-remote st-listen">${ico('svg-wave')}<div class="setup-txt"><b>${tr('SETUP_LISTEN_TITLE')}</b><span>${tr('REMOTESLIST_SEARCH')}</span>
            ${remotes ? `<div><button type="button" class="setup-link" onclick="shadeSetup.remoteCancel()">${tr('BT_CANCEL_1')}</button></div>` : ''}</div></div>`;
        else if (s.rstate === 'timeout') card = `<div class="setup-remote st-warn">${ico('svg-warning')}<div class="setup-txt"><b>${tr('SETUP_TIMEOUT_TITLE')}</b><span>${tr('SETUP_LINK_TIMEOUT_DESC')}</span></div></div>`;
        else if (s.rstate === 'linked') card = `<div class="setup-remote st-ok">${ico('svg-check')}<div class="setup-txt"><b>${tr('MSG_REMOTE_LINKED_SUCCESS').replace('%s', f.rssi)}</b>${facts}
            ${s.rshared ? `<span>${this.t('SETUP_LINK_SHARED', { name: escHtml(s.rshared) })}</span>` : ''}</div></div>`;
        else if (s.rstate === 'already') card = `<div class="setup-remote st-warn">${ico('svg-warning')}<div class="setup-txt"><b>${tr('SETUP_LINK_ALREADY')}</b>${facts}</div></div>`;
        const list = remotes ? `<div class="setup-remotes-list">${somfy.modalRemotesListHtml(s.shade)}</div>` : '';
        const add = s.rstate === 'listen' ? '' : `<div class="setup-actions"><button type="button" onclick="shadeSetup.remoteListen()">${tr(s.rstate === 'timeout' ? 'BT_RETRY' : remotes ? 'SETUP_LINK_ANOTHER' : 'BT_LINK_REMOTE')}</button></div>`;
        return card + list + add;
    }
    unpairDone() {
        putJSON('/setPaired', { shadeId: this.shadeId, paired: false }, (err) => {
            if (err) return ui.serviceError(err);
            const pair = this.s.tasks.find(T => T.id === 'pair');
            if (pair) pair.state = null;
            this.complete({}, '');
        });
    }
    bodyDir(T) {
        const s = this.s, W = s.W;
        if (T.sub === 'view') return s.isToggle ? `<div class="setup-okline"><svg><use href="#svg-check"></use></svg><span>${tr('SETUP_S_RESPONDS')}</span></div>
            <div class="setup-actions"><button type="button" onclick="shadeSetup.go('test')">${tr('SETUP_RETEST')}</button></div>`
            : `<div class="setup-okline"><svg><use href="#svg-check"></use></svg><span>${tr(s.flip ? 'SETUP_V_DIR_FLIPPED' : 'SETUP_V_DIR_NORMAL')}</span></div>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.flipDir()">${tr('SETUP_FLIP_DIR')}</button><button type="button" onclick="shadeSetup.go('test')">${tr('SETUP_RETEST')}</button></div>`;
        if (T.sub === 'rien') return `
            <p class="setup-p">${tr('SETUP_NO_REACT')}</p>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('test')">${tr('SETUP_RETEST')}</button><button type="button" onclick="shadeSetup.reopen(0)">${tr('SETUP_REPAIR')}</button></div>`;
        if (s.isToggle) {
            const v = s.isDry ? (s.shade.stateVocab || 0) : -1;
            const cmd = somfy.toggleShadeTypes.includes(s.shade.shadeType) ? 'toggle' : 'Up';
            return `
            <p class="setup-p">${tr('SETUP_TEST_PRESS')}</p>
            <button type="button" ${s.sent ? 'line' : ''} onclick="shadeSetup.cmd('${cmd}')">${tr(v >= 0 ? ['SETUP_SW_DO_0', 'SETUP_SW_DO_1', 'BT_OPEN', 'SETUP_SW_DO_3'][v] : 'VR_TOGGLE')}</button>
            ${s.sent ? `<div class="setup-actions"><button type="button" line onclick="shadeSetup.go('rien')">${tr('SETUP_NOTHING_HAPPENED')}</button><button type="button" class="btn-success" onclick="shadeSetup.dirDone()">${tr(v >= 0 ? `SETUP_SW_OK_${v}` : 'SETUP_REACTED')}</button></div>` : ''}`;
        }
        const testUp = s.tt === 3 ? tr('SETUP_OPEN_SLATS') : W.up, testOk = s.tt === 3 ? tr('SETUP_OK_SLATS') : W.upOk;
        return `
            ${s.flip ? `<div class="setup-warn">${tr('SETUP_FLIPPED_NOTE')}</div>` : ''}
            <p class="setup-p">${this.t('SETUP_DIR_PRESS', { cmd: testUp })}</p>
            <div class="setup-actions"><button type="button" ${s.sent ? 'line' : ''} onclick="shadeSetup.cmd('Up')">▲ ${testUp}</button><button type="button" line onclick="shadeSetup.cmd('My')">■ ${tr('BT_STOP')}</button></div>
            ${s.sent ? `<p class="setup-p sub">${tr('SETUP_WHAT_DID')}</p>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('rien')">${tr('SETUP_NOTHING')}</button><button type="button" line onclick="shadeSetup.flipDir()">${tr('SETUP_REVERSE')}</button><button type="button" class="btn-success" onclick="shadeSetup.dirDone()">${testOk}</button></div>` : ''}`;
    }
    // Enregistré tout de suite : le test suivant doit déjà partir dans le bon sens.
    flipDir() {
        const s = this.s;
        s.flip = !s.flip;
        s.sent = false;
        this.save({ flipCommands: s.flip });
        this.render();
    }
    dirDone() {
        const s = this.s;
        this.complete(s.isToggle ? {} : { flipCommands: s.flip }, tr(s.isToggle ? 'SETUP_S_RESPONDS' : s.flip ? 'SETUP_V_DIR_FLIPPED' : 'SETUP_V_DIR_NORMAL'));
    }

    // ---------- Temps de course, avec temps mort mesuré seulement si l'utilisateur en a un ----------
    // Repères rangés par sous-étape : up/down = course simple (un clic), dzup/dzdown = nouvelle
    // mesure en deux temps. La seconde, si elle existe, remplace la première pour ce sens.
    dirOf(sub) { return /up$/.test(sub) ? 'up' : 'down'; }
    slackOf(sub) {
        const k = this.s.marks[sub];
        if (!k || k.inter == null) return 0;
        return this.dirOf(sub) === 'up' ? k.inter : k.final - k.inter;
    }
    best(d) { return this.s.marks['dz' + d] ? 'dz' + d : d; }
    // Temps mort >= 0 et course utile >= SETUP_MIN_MS.
    clampMark(sub, which, val) {
        const k = this.s.marks[sub], slackFirst = this.dirOf(sub) === 'up';
        if (which === 'final') {
            const lo = k.inter == null ? SETUP_MIN_MS : (slackFirst ? k.inter + SETUP_MIN_MS : Math.max(SETUP_MIN_MS, k.inter));
            return Math.max(lo, Math.min(SETUP_MAX_MS, val));
        }
        return slackFirst ? Math.max(0, Math.min(k.final - SETUP_MIN_MS, val)) : Math.max(SETUP_MIN_MS, Math.min(k.final, val));
    }
    rowAdj(label, which, val) {
        return `<div class="setup-mrow"><span>${label}</span><span class="setup-adj">
            <button type="button" line title="${escAttr(tr('CAL_ADJUST_TOO_LATE_DESC'))}" onclick="shadeSetup.adj('${which}',-100)"><svg><use href="#svg-min"></use></svg></button>
            <b>${this.fmt(val)}</b>
            <button type="button" line title="${escAttr(tr('CAL_ADJUST_TOO_EARLY_DESC'))}" onclick="shadeSetup.adj('${which}',100)"><svg><use href="#svg-add"></use></svg></button></span></div>`;
    }
    chronoHtml(run) {
        return `<div class="setup-chrono${run ? ' run' : ''}" id="setupChrono">${run ? this.fmt(Date.now() - this.s.t0) : this.fmt(0)}</div>`;
    }
    bodyCal(T) {
        const s = this.s, W = s.W, M = s.marks;
        const cell = (d, lbl) => {
            const b = this.best(d), k = M[b], cur = this.dirOf(T.sub) === d && !['dzq', 'manual', 'intro', 'view'].includes(T.sub);
            return `<div class="${cur ? 'cur' : ''}">${lbl}<b>${k ? this.fmt(k.final) : '—'}</b>${k && b !== d ? `<i>${this.t('SETUP_S_DEADZONE', { t: this.fmt(this.slackOf(b)) })}</i>` : ''}</div>`;
        };
        const cells = `<div class="setup-meas">${cell('up', this.t('SETUP_CELL', { verb: W.up, from: W.closed, to: W.open }))}${cell('down', this.t('SETUP_CELL', { verb: W.down, from: W.open, to: W.closed }))}</div>`;
        if (T.sub === 'view') return `${cells}
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('manual')">${tr('SETUP_EDIT_TIMES')}</button><button type="button" onclick="shadeSetup.remeasure()">${tr('SETUP_REMEASURE')}</button></div>`;
        if (T.sub === 'intro') return `
            <p class="setup-p">${tr('SETUP_CAL_INTRO')}</p>
            <p class="setup-p sub">${tr('SETUP_CAL_INTRO_2')}${s.tt > 0 ? ' ' + tr('SETUP_CAL_TILT_AFTER') : ''}</p>
            <div class="setup-actions"><button type="button" onclick="shadeSetup.go('up')">${tr('BT_BEGIN')}</button></div>
            <button type="button" class="setup-link setup-start" onclick="shadeSetup.go('manual')">${tr('SETUP_CAL_KNOWN')}</button>`;
        if (T.sub === 'manual') {
            const v = (d, f) => { if (f === 'slack') { const x = this.slackOf('dz' + d); return x ? x / 1000 : ''; } return M[d] ? M[d].final / 1000 : ''; };
            const field = (id, label, val) => `<div class="uniRow"><div class="unifield-content"><label class="label" for="${id}">${label}</label><input id="${id}" class="inputAndSelect" type="number" min="0" max="180" step="0.1" placeholder=" " value="${val}"></div></div>`;
            return `
            <div class="setup-fields">${field('setupUpT', this.t('SETUP_TIME_OF', { what: W.upN }), v('up', 'final'))}${field('setupDownT', this.t('SETUP_TIME_OF', { what: W.downN }), v('down', 'final'))}</div>
            <label class="setup-keep"><input type="checkbox"${s.dzManual ? ' checked' : ''} onchange="shadeSetup.dzToggle(this.checked)"> ${tr('DEVICE_DEADZONE')}</label>
            <p class="setup-p sub">${tr('DEVICE_DEADZONE_DESC')}</p>
            ${s.dzManual ? `<div class="setup-fields">${field('setupDzUp', tr('DEVICE_DEADZONE_UP'), v('up', 'slack'))}${field('setupDzDown', tr('DEVICE_DEADZONE_DOWN'), v('down', 'slack'))}</div>` : ''}
            <div class="setup-err" id="setupManErr"></div>
            <div class="setup-actions"><button type="button" class="btn-success" onclick="shadeSetup.manual()">${tr('SETUP_VALIDATE')}</button></div>`;
        }
        if (T.sub === 'dzq') return `${cells}
            <p class="setup-p"><b>${tr('SETUP_DZ_Q')}</b></p>
            <p class="setup-p sub">${this.t('SETUP_DZ_EXPLAIN', { theUp: W.theUp, theDown: W.theDown })}</p>
            <p class="setup-p sub">${tr('SETUP_DZ_WHY')}</p>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('dzup')">${tr('SETUP_DZ_YES')}</button><button type="button" onclick="shadeSetup.finishCal()">${tr('SETUP_DZ_NO')}</button></div>`;
        const sub = T.sub, up = this.dirOf(sub) === 'up', dz = sub.startsWith('dz'), run = !!s.timer, k = M[sub];
        const interLbl = up ? tr('CAL_MARK_MOVING') : this.t('SETUP_MARK_IS', { state: W.closed });
        const finalLbl = (dz && !up) ? tr('CAL_MARK_MOTOR_STOPPED') : this.t('SETUP_MARK_IS', { state: up ? W.open : W.closed });
        const startPos = up ? W.closed : W.open;
        const instr = !dz ? this.t('SETUP_CAL_SIMPLE', { pos: startPos, btn: finalLbl })
            : this.t(up ? 'SETUP_DZ_UP_INSTR' : 'SETUP_DZ_DOWN_INSTR', { the: up ? W.theUp : W.theDown, pos: startPos });
        if (run) {
            const needInter = dz && s.inter == null;
            return `${cells}
            <p class="setup-p">${instr}</p>
            ${this.chronoHtml(true)}
            ${dz && s.inter != null ? `<div class="setup-intermark">${this.t('SETUP_MARK_SET', { t: this.fmt(s.inter), what: interLbl })}</div>` : ''}
            <button type="button" class="btn-success" onclick="shadeSetup.${needInter ? 'inter' : 'stop'}()">${needInter ? interLbl : finalLbl}</button>
            <button type="button" class="setup-link setup-start" onclick="shadeSetup.cancel()">${tr('SETUP_CANCEL_MEASURE')}</button>`;
        }
        if (k) {
            const next = { up: this.t('SETUP_MEASURE_NEXT', { what: W.downN }), down: tr('BT_NEXT'), dzup: this.t('SETUP_DZ_NEXT', { what: W.downN }), dzdown: tr('SETUP_VALIDATE_TIMES') }[sub];
            return `${cells}
            <div class="setup-marks">
              <p class="setup-p sub">${tr('CAL_ADJUST_INTRO')}</p>
              ${dz && k.inter != null ? this.rowAdj(interLbl, 'inter', k.inter) : ''}
              ${this.rowAdj(finalLbl, 'final', k.final)}
              <div class="setup-mrow der"><span>${tr('SETUP_T_TRAVEL')}</span><b>${this.fmt(k.final)}</b></div>
              ${dz ? `<div class="setup-mrow der${this.slackOf(sub) ? ' on' : ''}"><span>${tr('SETUP_DEADTIME')}</span><b>${this.fmt(this.slackOf(sub))}</b></div>` : ''}
            </div>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.redo()">${tr('CAL_BTN_REDO')}</button><button type="button" onclick="shadeSetup.next()">${next}</button></div>`;
        }
        return `${cells}
            <p class="setup-p">${instr}</p>
            ${this.chronoHtml(false)}
            ${s.err ? `<div class="setup-err">${s.err}</div>` : ''}
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.sendCmd('${up ? 'Down' : 'Up'}')">${this.t('SETUP_FIRST', { cmd: up ? W.down : W.up })}</button><button type="button" onclick="shadeSetup.start()">${tr('BT_START')}</button></div>
            ${dz ? `<button type="button" class="setup-link setup-start" onclick="shadeSetup.noDz()">${tr('SETUP_NO_DZ')}</button>` : ''}`;
    }
    start() {
        const s = this.s, T = s.tasks[s.cur], up = this.dirOf(T.sub) === 'up';
        if (T.id === 'tilt') this.sendTilt(up ? 'Up' : 'Down');
        else this.sendCmd(up ? 'Up' : 'Down');
        s.inter = null;
        s.err = '';
        this.startTimer();
        this.render();
    }
    inter() { this.s.inter = Date.now() - this.s.t0; this.render(); }
    stopMotor() { if (this.s.tasks[this.s.cur].id === 'tilt') this.sendTilt('My'); else this.sendCmd('My'); }
    cancel() { this.stopTimer(); this.stopMotor(); this.s.err = tr('CAL_MEASURE_CANCELLED'); this.render(); }
    stop() {
        const s = this.s, sub = s.tasks[s.cur].sub, el = Date.now() - s.t0;
        this.stopTimer();
        this.stopMotor();
        if (el < SETUP_MIN_MS || el > SETUP_MAX_MS) { s.err = tr(el < SETUP_MIN_MS ? 'CAL_ERR_DURATION_TOO_SHORT' : 'CAL_ERR_DURATION_TOO_LONG'); return this.render(); }
        s.marks[sub] = { inter: sub.startsWith('dz') ? s.inter : null, final: el };
        if (s.marks[sub].inter != null) s.marks[sub].inter = this.clampMark(sub, 'inter', s.marks[sub].inter);
        this.render();
    }
    adj(which, delta) {
        const sub = this.s.tasks[this.s.cur].sub, k = this.s.marks[sub];
        k[which] = this.clampMark(sub, which, k[which] + delta);
        this.render();
    }
    redo() { delete this.s.marks[this.s.tasks[this.s.cur].sub]; this.s.err = ''; this.render(); }
    next() {
        const sub = this.s.tasks[this.s.cur].sub;
        if (sub === 'dzdown') return this.finishCal();
        if (sub === 'tdown') return this.finishTilt();
        this.go({ up: 'down', down: 'dzq', dzup: 'dzdown', tup: 'tdown' }[sub]);
    }
    // « Pas de temps mort dans ce sens » : la mesure simple de ce sens reste valable.
    noDz() {
        const sub = this.s.tasks[this.s.cur].sub;
        delete this.s.marks[sub];
        if (sub === 'dzup') this.go('dzdown');
        else this.finishCal();
    }
    finishCal() {
        const M = this.s.marks, bu = this.best('up'), bd = this.best('down');
        const fields = { upTime: M[bu].final, downTime: M[bd].final, slackUp: this.slackOf(bu), slackDown: this.slackOf(bd) };
        Object.assign(this.s.shade, fields);
        const part = (b) => this.fmt(M[b].final) + (this.slackOf(b) ? ' · ' + this.t('SETUP_S_DEADZONE', { t: this.fmt(this.slackOf(b)) }) : '');
        this.complete(fields, `${part(bu)} / ${part(bd)}`);
    }
    dzToggle(on) {
        const u = this.$('#setupUpT').value, d = this.$('#setupDownT').value;
        this.s.dzManual = on;
        this.render();
        this.$('#setupUpT').value = u;
        this.$('#setupDownT').value = d;
    }
    manual() {
        const s = this.s, num = id => { const e = this.$(id); return e && e.value !== '' ? Math.round(parseFloat(String(e.value).replace(',', '.')) * 1000) : 0; };
        const u = num('#setupUpT'), d = num('#setupDownT'), su = s.dzManual ? num('#setupDzUp') : 0, sd = s.dzManual ? num('#setupDzDown') : 0;
        const err = this.$('#setupManErr');
        if (!(u >= SETUP_MIN_MS && u <= SETUP_MAX_MS) || !(d >= SETUP_MIN_MS && d <= SETUP_MAX_MS)) { err.textContent = tr('SETUP_ERR_TIMES'); return; }
        if (isNaN(su) || isNaN(sd) || su < 0 || sd < 0) { err.textContent = tr('ERR_DEADZONE_INVALID'); return; }
        if (u - su < SETUP_MIN_MS || d - sd < SETUP_MIN_MS) { err.textContent = tr('ERR_DEADZONE_TOO_LONG'); return; }
        // Grandeurs dérivées saisies directement : on reconstruit des repères équivalents.
        s.marks = { up: { inter: null, final: u }, down: { inter: null, final: d } };
        if (su) s.marks.dzup = { inter: su, final: u };
        if (sd) s.marks.dzdown = { inter: d - sd, final: d };
        this.finishCal();
    }

    // ---------- Lames ----------
    bodyTilt(T) {
        const s = this.s, M = s.marks, up = T.sub === 'tup', k = M[T.sub], run = !!s.timer, integ = s.tt === 2;
        const instr = tr(up ? (integ ? 'CAL_TILT_UP_INSTRUCTION_INTEGRATED' : 'CAL_TILT_UP_INSTRUCTION') : (integ ? 'CAL_TILT_DOWN_INSTRUCTION_INTEGRATED' : 'CAL_TILT_DOWN_INSTRUCTION'));
        const cells = `<div class="setup-meas"><div class="${T.sub === 'tup' ? 'cur' : ''}">${tr('SETUP_TILT_OPEN')}<b>${M.tup ? this.fmt(M.tup.final) : '—'}</b></div><div class="${T.sub === 'tdown' ? 'cur' : ''}">${tr('SETUP_TILT_CLOSE')}<b>${M.tdown ? this.fmt(M.tdown.final) : '—'}</b></div></div>`;
        if (T.sub === 'view') return `${cells}
            <div class="setup-actions"><button type="button" onclick="shadeSetup.remeasure()">${tr('SETUP_REMEASURE')}</button></div>`;
        if (run) return `${cells}
            <p class="setup-p">${instr}</p>
            ${this.chronoHtml(true)}
            <button type="button" class="btn-success" onclick="shadeSetup.stop()">${tr('BT_STOP')}</button>
            <button type="button" class="setup-link setup-start" onclick="shadeSetup.cancel()">${tr('SETUP_CANCEL_MEASURE')}</button>`;
        if (k) return `${cells}
            <div class="setup-marks"><p class="setup-p sub">${tr('CAL_ADJUST_INTRO')}</p>${this.rowAdj(tr('CAL_RESULT_LABEL'), 'final', k.final)}</div>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.redo()">${tr('CAL_BTN_REDO')}</button><button type="button" onclick="shadeSetup.next()">${up ? this.t('SETUP_MEASURE_NEXT', { what: tr('SETUP_TILT_CLOSE').toLowerCase() }) : tr('SETUP_VALIDATE')}</button></div>`;
        return `${cells}
            ${up ? `<p class="setup-p sub">${tr(integ ? 'SETUP_TILT_INTRO_INTEGRATED' : 'SETUP_TILT_INTRO')}</p>` : ''}
            <p class="setup-p">${instr}</p>
            ${this.chronoHtml(false)}
            ${s.err ? `<div class="setup-err">${s.err}</div>` : ''}
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.sendTilt('${up ? 'Down' : 'Up'}')">${tr(up ? 'CAL_TILT_UP_PREP' : 'CAL_TILT_DOWN_PREP')}</button><button type="button" onclick="shadeSetup.start()">${tr('BT_START')}</button></div>`;
    }
    finishTilt() {
        const M = this.s.marks;
        this.complete({ tiltTimeUp: M.tup.final, tiltTimeDown: M.tdown.final }, `${this.fmt(M.tup.final)} / ${this.fmt(M.tdown.final)}`);
    }
    bodyOrder(T) {
        const s = this.s, open = T.sub === 'open', verb = open ? s.W.up : s.W.down;
        if (T.sub === 'view') {
            const sw = (key, lbl) => `<label class="uniRow"><div class="uniLeft"><div class="uniText"><div class="uniLabel">${tr(lbl)}</div><div class="uniStatus">${tr(lbl + '_DESC')}</div></div></div>
                <div class="uniRight"><span class="switch"><input type="checkbox"${s[key] ? ' checked' : ''} onchange="shadeSetup.s.${key} = this.checked"><div></div></span></div></label>`;
            return `${sw('orderOpen', 'DEVICE_TILT_FIRST_ON_OPEN')}${sw('orderClose', 'DEVICE_TILT_FIRST_ON_CLOSE')}
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('open')">${tr('SETUP_RETEST')}</button><button type="button" onclick="shadeSetup.orderSave()">${tr('BT_SAVE')}</button></div>`;
        }
        return `${open ? `<p class="setup-p sub">${tr('CAL_ORDER_INTRO')}</p>` : `<p class="setup-p sub">${tr('SETUP_ORDER_AGAIN')}</p>`}
            <p class="setup-p">${this.t('SETUP_ORDER_PRESS', { cmd: verb })}</p>
            <div class="setup-actions"><button type="button" ${s.sent ? 'line' : ''} onclick="shadeSetup.cmd('${open ? 'Up' : 'Down'}')">${open ? '▲' : '▼'} ${verb}</button><button type="button" line onclick="shadeSetup.cmd('My')">■ ${tr('BT_STOP')}</button></div>
            ${s.sent ? `<p class="setup-p sub">${tr('SETUP_ORDER_Q')}</p>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.order(true)">${tr('SETUP_ORDER_SLATS')}</button><button type="button" line onclick="shadeSetup.order(false)">${tr('SETUP_ORDER_TRAVEL')}</button></div>` : ''}`;
    }
    order(slatsFirst) {
        const s = this.s, T = s.tasks[s.cur];
        s[T.sub === 'open' ? 'orderOpen' : 'orderClose'] = slatsFirst;
        if (T.sub === 'open') return this.go('close');
        const word = v => tr(v ? 'SETUP_S_SLATS_FIRST' : 'SETUP_S_TRAVEL_FIRST');
        this.complete({ tiltFirstOnOpen: s.orderOpen, tiltFirstOnClose: s.orderClose }, `${word(s.orderOpen)} / ${word(s.orderClose)}`);
    }

    // ---------- Options : position My et capteur soleil ----------
    bodyOpts() {
        const s = this.s, W = s.W;
        const chip = (key, val, lbl) => `<div class="setup-chip${s[key] === val ? ' sel' : ''}" onclick="shadeSetup.opt('${key}','${val}')">${lbl}</div>`;
        // Pas de temps de course, pas de conversion « arrêt au bout de 4 s » -> pourcentage.
        const useful = (s.shade.downTime || 0) - (s.shade.slackDown || 0);
        const timesOk = !!(s.shade.setupSteps & SETUP_BIT.cal) || s.tasks.some(T => T.id === 'cal' && T.state === 'done');
        const calIdx = s.tasks.findIndex(T => T.id === 'cal');
        const needTimes = `<div class="setup-warn">${tr('SETUP_NEED_TIMES')}</div>${calIdx >= 0 ? `<div class="setup-actions"><button type="button" line onclick="shadeSetup.reopen(${calIdx})">${tr('SETUP_MEASURE_TIMES')}</button></div>` : ''}`;
        const hasTilt = this.myHasTilt(), saveLbl = tr(hasTilt ? 'SETUP_SAVE_POSS' : 'SETUP_SAVE_POS');
        const slider = (val, fn, tilt) => `<div class="slider-wrapper${tilt ? ' tilt-slider' : ''}"><div class="slider-progress" style="width:${val}%;--pct:${val}"><div class="slider-thumb-line"></div></div><input type="range" class="md3-range-input" min="0" max="100" step="1" value="${val}" oninput="syncSliderProgress(this); shadeSetup.${fn}(this.value)"></div>`;
        const learned = `<div class="setup-okline"><svg><use href="#svg-check"></use></svg><span>${hasTilt ? this.t('SETUP_MY_SAVED_TILT', { pos: s.myPos, tilt: s.myTilt }) : this.t('SETUP_MY_SAVED', { pos: s.myPos })}</span><button type="button" class="setup-link" onclick="shadeSetup.myGo(null)">${tr('CAL_BTN_REDO')}</button></div>`;
        const ends = `<div class="setup-mrow setup-ends"><span>${W.open}</span><span>${W.closed}</span></div>`;
        const tiltRow = hasTilt ? `<div class="setup-mypos"><div class="setup-mrow"><span>${tr('SETUP_FAV_TILT')}</span><b id="setupMyTiltT">${s.myTilt} %</b></div>
            ${slider(s.myTilt, 'myTiltInput', true)}${ends}</div>` : '';
        let my = '';
        if (s.my === 'oui') {
            if (s.tt === 3) my = `<p class="setup-p sub">${tr('SETUP_MY_TILTONLY')}</p>`;
            else if (!timesOk || useful <= 0) my = needTimes;
            else if (s.myStep === 'learned') my = learned;
            else if (s.myStep === 'later') my = `<p class="setup-p sub">${tr('SETUP_MY_LATER_NOTE')} <button type="button" class="setup-link" onclick="shadeSetup.myGo(null)">${tr('SETUP_MY_LEARN_NOW')}</button></p>`;
            else if (!s.myStep) my = `<div class="setup-info">${tr('SETUP_MY_LEARN_INFO')}</div>
                <div class="setup-actions"><button type="button" onclick="shadeSetup.myGo('open')">${tr('SETUP_MY_LEARN')}</button></div>
                <button type="button" class="setup-link setup-start" onclick="shadeSetup.myGo('later')">${tr('SETUP_LATER_SHORT')}</button>`;
            else if (s.myStep === 'open') my = `<p class="setup-p">${this.t('SETUP_MY_STEP1', { open: W.open })}</p>
                <div class="setup-actions"><button type="button" ${s.sent ? 'line' : ''} onclick="shadeSetup.cmd('Up')">▲ ${W.up}</button></div>
                ${s.sent ? `<div class="setup-actions"><button type="button" onclick="shadeSetup.myGo('ready')">${this.t('SETUP_IS_FULLY', { open: W.open })}</button></div>` : ''}`;
            else if (s.myStep === 'ready' || s.myStep === 'run') {
                const run = !!s.timer;
                my = `<p class="setup-p">${tr('SETUP_MY_STEP2')}</p>
                <p class="setup-p sub setup-why"><i>${tr('SETUP_MY_WHY')}</i></p>
                ${this.chronoHtml(run)}
                ${run ? `<button type="button" class="btn-success" onclick="shadeSetup.myStop()">${tr('SETUP_STOPPED')}</button>` : `<div class="setup-actions"><button type="button" onclick="shadeSetup.myStart()">■ My</button></div>`}`;
            }
            else if (s.myStep === 'res') my = `${s.myWarn ? `<div class="setup-warn">${s.myWarn}</div>` : ''}
                <div class="setup-mypos"><div class="setup-mybar"><span style="width:${s.myPos}%"></span></div>${ends}
                <div class="setup-mrow"><span>${tr('SETUP_FAV_POS')}</span><span class="setup-adj">
                <button type="button" line onclick="shadeSetup.myAdj(-1)"><svg><use href="#svg-min"></use></svg></button><b>${s.myPos} %</b>
                <button type="button" line onclick="shadeSetup.myAdj(1)"><svg><use href="#svg-add"></use></svg></button></span></div></div>
                <p class="setup-p sub">${this.t('SETUP_MY_CALC', { raw: this.fmt(s.myRaw), react: this.fmt(SETUP_REACT_MS), t: this.fmt(s.myEl), useful: this.fmt(useful), what: W.downN })}</p>
                ${tiltRow ? `${tiltRow}<p class="setup-p sub">${tr('SETUP_MY_TILT_HINT')}</p>` : ''}
                <div class="setup-actions"><button type="button" line onclick="shadeSetup.myGo('open')">${tr('CAL_BTN_REDO')}</button><button type="button" onclick="shadeSetup.myLearn()">${saveLbl}</button></div>`;
        }
        if (s.my === 'non') {
            const desc = { motor: 'SETUP_MY_ON_MOTOR_DESC', sim: 'SETUP_MY_SIMULATE_DESC' }[s.myMode];
            my = `<p class="setup-p sub">${tr('SETUP_MY_CREATE')}</p>
                <div class="setup-chips">${chip('myMode', 'motor', tr('SETUP_MY_ON_MOTOR'))}${chip('myMode', 'sim', tr('SETUP_MY_SIMULATE'))}${chip('myMode', 'none', tr('SETUP_MY_NONE'))}</div>
                ${desc ? `<p class="setup-p sub">${tr(desc)}</p>` : ''}`;
            if (s.myMode === 'motor' || s.myMode === 'sim') {
                if (!timesOk) my += needTimes;
                else if (s.myStep === 'learned') my += learned;
                else {
                    my += `<div class="setup-mypos"><div class="setup-mrow"><span>${tr('SETUP_FAV_POS')}</span><b id="setupMyT">${s.myTarget} %</b></div>
                        ${slider(s.myTarget, 'myTargetInput', false)}${ends}</div>${tiltRow}`;
                    if (s.myMode === 'sim') my += `<div class="setup-actions"><button type="button" onclick="shadeSetup.mySim()">${saveLbl}</button></div>`;
                    else if (s.myStep === 'prog') my += `<p class="setup-p">${this.t('SETUP_MY_PROG_Q', { pos: s.myTarget })}</p>
                        <div class="setup-actions"><button type="button" line onclick="shadeSetup.myGo(null)">${tr('SETUP_RETRY_NO')}</button><button type="button" class="btn-success" onclick="shadeSetup.myDone(${s.myTarget})">${tr('BT_YES')}</button></div>`;
                    else my += `<p class="setup-p sub">${tr('SETUP_MY_PROG_NOTE')}</p>
                        <div class="setup-actions"><button type="button" onclick="shadeSetup.myProg()">${tr('SETUP_MY_PROG')}</button></div>`;
                }
            }
        }
        let h = '';
        if (s.supportsMy) h += `<div class="setup-optq"><div class="setup-q2">${tr('SETUP_MY_Q')}</div>
            <div class="setup-chips">${chip('my', 'oui', tr('BT_YES'))}${chip('my', 'non', tr('BT_NO'))}${chip('my', 'nsp', tr('SETUP_DONT_KNOW'))}</div>
            ${s.my === 'nsp' ? `<p class="setup-p sub">${tr('SETUP_MY_CHECK')}</p>
                <div class="setup-actions"><button type="button" line onclick="shadeSetup.cmd('My')">■ My</button></div>
                <div class="setup-chips">${chip('my', 'oui', tr('SETUP_MY_WENT'))}${chip('my', 'non', tr('SETUP_MY_STILL'))}</div>` : ''}
            ${my}</div>`;
        if (s.st.sun) h += `<div class="setup-optq"><div class="setup-q2">${tr('SETUP_SUN_Q')}</div>
            <p class="setup-p sub">${tr('SETUP_SUN_DESC')}</p>
            <div class="setup-chips">${chip('sun', 'oui', tr('BT_YES'))}${chip('sun', 'non', tr('BT_NO'))}</div></div>`;
        if (!s.isToggle) h += `<div class="setup-optq"><div class="setup-q2">${tr('SETUP_POS_Q')}</div>
            <p class="setup-p sub">${tr('SETUP_POS_DESC')}</p>
            <div class="setup-chips">${chip('posq', 'closed', tr('IS_CLOSED'))}${chip('posq', 'open', tr('IS_OPEN'))}</div></div>`;
        h += `<div class="setup-optq"><div class="setup-q2">${tr('SETUP_REACH_Q')}</div>
            <p class="setup-p sub">${tr('SETUP_REACH_DESC')}</p>
            <div class="setup-chips">${chip('reach', 'normal', tr('SETUP_REACH_NORMAL'))}${chip('reach', 'strong', tr('SETUP_REACH_STRONG'))}</div>
            <p class="setup-p sub setup-why"><i>${tr('SETUP_REACH_HINT')}</i></p></div>`;
        if (this.hasLed()) h += `<div class="setup-optq"><div class="setup-q2">${tr({ 'BOX-WIFI': 'SETUP_LED_Q_BOX_WIFI', 'BOX-ETH': 'SETUP_LED_Q_BOX_ETH' }[window.__hardwareProfile] || 'SETUP_LED_Q')}</div>
            <div class="setup-chips">${chip('led', 'oui', tr('BT_YES'))}${chip('led', 'non', tr('BT_NO'))}</div></div>`;
        const myReady = !s.supportsMy
            || s.my === 'oui'
            || (s.my === 'non' && (s.myMode === 'none' || s.myStep === 'learned' || (!!s.myMode && !timesOk)));
        const ready = myReady && (!s.st.sun || !!s.sun);
        return `${h}<div class="setup-actions"><button type="button"${ready ? '' : ' disabled class="disabled"'} onclick="shadeSetup.optsDone()">${tr('SETUP_VALIDATE')}</button></div>`;
    }
    opt(key, val) {
        const s = this.s;
        s[key] = val;
        if (key === 'my' || key === 'myMode') { s.myStep = null; s.myWarn = ''; }
        if (key === 'my' && val !== 'nsp') s.sent = false;
        this.render();
    }
    myGo(step) { this.stopTimer(); this.s.myStep = step; this.s.sent = false; this.render(); }
    myStart() {
        this.sendCmd('My');
        this.s.myStep = 'run';
        this.startTimer();
        this.render();
    }
    // Départ en butée ouverte : la fraction de course UTILE parcourue jusqu'à l'arrêt donne myPos
    // (le temps mort de descente est en fin de course, il ne joue pas ici).
    myStop() {
        const s = this.s, raw = Date.now() - s.t0, el = Math.max(0, raw - SETUP_REACT_MS);
        const useful = s.shade.downTime - (s.shade.slackDown || 0);
        this.stopTimer();
        s.myRaw = raw;
        s.myEl = el;
        s.myPos = Math.round(Math.min(el / useful, 1) * 100);
        s.myWarn = raw < SETUP_MIN_MS ? tr('SETUP_MY_WARN_NOMOVE') : el >= useful ? tr('SETUP_MY_WARN_END') : '';
        s.myStep = 'res';
        this.render();
    }
    myAdj(d) { this.s.myPos = Math.max(0, Math.min(100, this.s.myPos + d)); this.render(); }
    myHasTilt() { return [1, 2, 4].includes(this.s.tt); }
    myTiltInput(v) { this.s.myTilt = parseInt(v, 10); const e = this.$('#setupMyTiltT'); if (e) e.textContent = v + ' %'; }
    myTargetInput(v) { this.s.myTarget = parseInt(v, 10); const e = this.$('#setupMyT'); if (e) e.textContent = v + ' %'; }
    myDone(pos) { this.s.myPos = pos; this.s.myStep = 'learned'; this.render(); }
    // Moteur qui a déjà sa position My : enregistrée sans rien émettre (cf. learnMyPosition).
    myLearn() {
        const s = this.s;
        putJSON('/setMyPosition', { shadeId: this.shadeId, pos: s.myPos, tilt: this.myHasTilt() ? s.myTilt : -1, learn: true }, (err) => {
            if (err) return ui.serviceError(err);
            this.myDone(s.myPos);
        });
    }
    // Pas de position My sur le moteur : l'équipement s'y rend, puis un appui long l'y enregistre.
    myProg() {
        const s = this.s;
        putJSON('/setMyPosition', { shadeId: this.shadeId, pos: s.myTarget, tilt: this.myHasTilt() ? s.myTilt : -1 }, (err) => {
            if (err) return ui.serviceError(err);
            s.myStep = 'prog';
            this.render();
        });
    }
    // simMy d'abord : setMyPosition n'enregistre alors qu'un pourcentage, sans rien envoyer au moteur.
    mySim() {
        const s = this.s;
        this.save({ simMy: true }, () => putJSON('/setMyPosition', { shadeId: this.shadeId, pos: s.myTarget, tilt: this.myHasTilt() ? s.myTilt : -1 }, (err) => {
            if (err) return ui.serviceError(err);
            this.myDone(s.myTarget);
        }));
    }
    optsDone() {
        const s = this.s, learnedMy = s.myStep === 'learned', fields = {};
        if (s.st.sun) fields.sunSensor = s.sun === 'oui';
        const parts = [];
        if (s.supportsMy) {
            const sim = s.my === 'non' && s.myMode === 'sim' && learnedMy;
            parts.push(learnedMy ? this.t(sim ? 'SETUP_S_MY_SIM' : 'SETUP_S_MY', { pos: s.myPos }) : tr(s.my === 'oui' ? 'SETUP_S_MY_TODO' : 'SETUP_S_NO_MY'));
            if (learnedMy && this.myHasTilt()) parts.push(this.t('SETUP_S_MY_TILT', { tilt: s.myTilt }));
        }
        if (s.st.sun) parts.push(tr(fields.sunSensor ? 'SETUP_S_SUN' : 'SETUP_S_NO_SUN'));
        if (!s.isToggle) fields.flipPosition = s.posq === 'open';
        const rep = s.shade.repeats ?? 1;
        fields.repeats = s.reach === 'strong' ? (rep > 1 ? rep : 3) : (rep > 1 ? 1 : rep);
        if (s.reach === 'strong') parts.push(tr('SETUP_S_REACH_STRONG'));
        if (this.hasLed()) {
            fields.ledFeedback = s.led === 'oui';
            if (fields.ledFeedback) parts.push(tr('SETUP_S_LED'));
        }
        this.complete(fields, parts.join(' · ') || tr('SETUP_S_REACH_NORMAL'));
    }

    renderFinal() {
        const s = this.s, todo = s.tasks.filter(T => T.state !== 'done');
        this.$('.setup-body').innerHTML = `<div class="setup-final"><svg><use href="#${s.st.ico || 'svg-shutter'}"></use></svg>
            <h3>${this.t(todo.length ? 'SETUP_CREATED' : 'SETUP_READY', { name: escHtml(s.shade.name) })}</h3>
            <p class="setup-p sub">${tr(todo.length ? 'SETUP_PARTIAL_DESC' : 'SETUP_READY_DESC')}</p></div>
            <div class="setup-tasks">${s.tasks.map((T, k) => `<div class="setup-task ${T.state || ''}"><div class="setup-task-h"${T.state !== 'done' ? ` onclick="shadeSetup.reopen(${k})" title="${escAttr(tr('SETUP_REOPEN'))}"` : ''}><div class="setup-task-n">${T.state === 'done' ? '<svg><use href="#svg-check"></use></svg>' : k + 1}</div><div class="setup-task-t">${this.title(T)}</div><div class="setup-task-s">${T.state === 'done' ? (T.note || tr('SETUP_S_DONE')) : tr('SETUP_S_TODO')}</div></div></div>`).join('')}</div>`;
        this.$('.setup-foot').innerHTML = `<button type="button" line onclick="shadeSetup.openForm()">${tr('SETUP_OPEN_FORM')}</button><button type="button" onclick="shadeSetup.close()">${tr('SETUP_FINISH')}</button>`;
    }
    openForm() {
        const id = this.shadeId;
        closeOverlay(this.div);
        this.onClose();
        somfy.openEditShade(id);
    }
}
var shadeSetup = new ShadeSetup();
