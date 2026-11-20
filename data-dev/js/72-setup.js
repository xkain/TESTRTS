// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS

// =========================================================================
// SECTION : CRÉATION ET MISE EN SERVICE D'UN ÉQUIPEMENT
// =========================================================================
// Un seul assistant en deux phases : créer (type, télécommande d'origine, nom et pièce), puis mettre
// en service (appairage, sens, temps de course...). Chaque tâche est enregistrée dès qu'elle est
// finie, avec son bit dans setupSteps : quitter en route ne perd rien.
const SETUP_BIT = { pair: 1, dir: 2, cal: 4, tilt: 8, order: 16, opts: 32 };
const SETUP_INIT = { pair: 'pret', unpair: 'pret', remote: 'listen', dir: 'test', cal: 'intro', tilt: 'tup', order: 'open', opts: 'q' };
const SETUP_MIN_MS = 500, SETUP_MAX_MS = 180000, SETUP_LISTEN_MS = 30000;
// Tabliers enroulés (store, store banne, volet roulant) : seuls à proposer la mi-course.
const SETUP_CURVE_TYPES = [0, 3, 4];
// Tassement des lames en fin de course basse : volet roulant seulement.
const SETUP_SLACK_TYPES = [4];
// Temps de réaction retiré du clic « Il s'est arrêté » de l'apprentissage My.
const SETUP_REACT_MS = 300;

// Appairage d'un équipement et liaison d'un groupe : guidé (étapes) ou expert (les boutons seuls,
// comme la v2). Le choix est retenu par navigateur et se change par le menu ⋮ du titre, dans les
// deux sens : l'ancien mode expert, sans chemin de retour, enfermait l'utilisateur.
const pairMode = {
    expert() { try { return localStorage.getItem('pairMode') === 'expert'; } catch (e) { return false; } },
    set(on) { try { localStorage.setItem('pairMode', on ? 'expert' : 'guided'); } catch (e) { /* stockage refusé : le choix vaut pour la page */ } },
    menu(fn) {
        const x = this.expert(), item = (on, k, d) => `<div class="dropdown-item pair-mode-item" role="menuitemradio" aria-checked="${on === x}" onclick="this.parentElement.classList.remove('show'); ${fn}(${on})">
            <span class="pair-mode-check">${on === x ? '<svg><use href="#svg-check"></use></svg>' : ''}</span><span><b>${tr(k)}</b><small>${tr(d)}</small></span></div>`;
        return `<div class="pair-mode-menu overlayHeader-dropdown-container" onclick="event.stopPropagation();">
            <button type="button" class="pair-mode-btn" aria-label="${escAttr(tr('OPTION'))}" aria-haspopup="menu" onclick="somfy.toggleTileMenu(this);"><svg><use href="#svg-menuVertical"></use></svg></button>
            <div class="overlayHeader-dropdown-menu" role="menu">${item(false, 'PAIR_MODE_GUIDED', 'PAIR_MODE_GUIDED_D')}${item(true, 'PAIR_MODE_EXPERT', 'PAIR_MODE_EXPERT_D')}</div></div>`;
    },
    badge() { return `<span class="pair-mode-badge">${tr('PAIR_MODE_EXPERT')}</span>`; }
};

// Bandeau d'étapes de la coque wiz-, partagé avec « Créer un groupe ». items : { title, desc,
// state ('on', 'done', 'skipped' ou ''), phase (titre posé avant l'étape), pick (code onclick) }.
// prev / next servent au mobile, qui n'affiche que la précédente, la courante et la suivante ;
// la barre segmentée (bar) y garde la vue d'ensemble, et now (« Étape 2 sur 5 · Appairage ») l'étape courante.
// Croix des assistants : enfant direct de .wiz-window, hors de la colonne en peau de hero (dont
// les jetons la rendraient invisible sur le corps clair, où elle se pose sur PC).
function wizCloseHtml(attr = 'data-wiz-close') {
    return `<button type="button" class="wiz-close" ${attr} aria-label="${escAttr(tr('BT_CLOSE'))}"><svg><use href="#svg-closeOverlay"></use></svg></button>`;
}
function wizStepsHtml(items) {
    const cur = items.findIndex(x => x.state === 'on');
    const steps = items.map((x, i) => `${x.phase ? `<li class="wiz-phase${i ? '' : ' first'}" aria-hidden="true">${escHtml(x.phase)}</li>` : ''}<li class="wiz-step${x.state ? ' ' + x.state : ''}${i === cur - 1 ? ' prev' : i === cur + 1 ? ' next' : ''}${x.pick ? ' pick' : ''}"${x.pick ? ` onclick="${x.pick}"` : ''}${x.state === 'on' ? ' aria-current="step"' : ''}>
        <span class="wiz-step-n">${x.state === 'done' ? '<svg><use href="#svg-check"></use></svg>' : x.state === 'skipped' ? '–' : i + 1}</span>
        <span class="wiz-step-text"><b>${escHtml(x.title)}</b><small>${escHtml(x.desc || '')}</small></span></li>`).join('');
    const now = cur < 0 ? '' : `${tr('SETUP_W_KICK').replace('{N}', cur + 1).replace('{T}', items.length)} · ${items[cur].title}`;
    return { steps, now, bar: items.map((x, i) => `<i class="${x.state || ''}${x.phase && i ? ' cut' : ''}"></i>`).join('') };
}

// Nouvelle étape (key change) : le contenu repart du haut. Un simple redessin de la même étape
// (réponse cochée, chrono) garde la position.
function wizScrollTop(w, main, key) {
    if (!w || !main || w.lastKey === key) return;
    w.lastKey = key;
    main.scrollTop = 0;
}

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
                   extra: (v, c) => v !== '1' ? '' : `<div class="gen-field"><label class="gen-field-label" for="setupPulse">${tr('SETUP_PULSE_LABEL')}</label>
                     <div class="gen-input-box"><input id="setupPulse" class="gen-input" type="number" min="50" max="10000" step="10" value="${c.pulse}" oninput="shadeSetup.c.pulse = parseInt(this.value, 10) || 200"></div></div>` }],
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
        // Forme courte « faites/total » pour la liste sur mobile (cf. main.css) : en restantes/total,
        // un équipement où tout reste à faire afficherait 4/4 et passerait pour terminé.
        const total = this.tasksFor(shade).length;
        return `<button type="button" class="setup-badge" title="${escAttr(tr('SETUP_RESUME'))}" onclick="event.stopPropagation(); shadeSetup.resume(${shade.shadeId});"><span class="setup-badge-long">${n > 1 ? this.t('SETUP_BADGE_MANY', { n }) : tr('SETUP_BADGE_ONE')}</span><span class="setup-badge-short">${total - n}/${total}</span></button>`;
    }

    // ---------- Deux fenêtres ----------
    // L'assistant (création, puis toute la mise en service, ou sa reprise depuis la liste) vit dans
    // la coque wiz- de « Créer un groupe » ; une tâche lancée seule depuis la fiche, dans le gabarit
    // des fenêtres (genModalShell), comme la fenêtre pièce.
    mountTask() {
        get('divShadeSetup')?.remove();
        this.w = null;
        const div = document.createElement('div');
        div.id = 'divShadeSetup';
        div.className = 'modal-overlay genmod-overlay genmod-task';
        div.innerHTML = `<div class="message-content genmod-window">${genModalShell({
            id: 'taskWin', icon: 'svg-pair', obj: 'equipement', titleKey: 'PAIRING', descKey: 'SETUP_TW_PAIR_DESC', sectionKey: 'PAIRING',
            stateKey: '', stateValue: '', hintKey: 'SETUP_PAIR_2MIN', footId: 'taskWinFoot', bodyHtml: ''
        })}</div>`;
        div.addEventListener('click', (e) => { if (e.target.closest('[data-genmod-close]')) this.close(); });
        this.div = div;
        shOverlay(div, () => this.onClose());
        return div;
    }
    mountWiz() {
        get('divShadeSetup')?.remove();
        const div = document.createElement('div');
        div.id = 'divShadeSetup';
        div.className = 'modal-overlay genmod-overlay wiz-overlay';
        div.innerHTML = `<div class="message-content wiz-window">${wizCloseHtml()}
            <aside class="wiz-side hero-skin" data-obj="equipement">
            <div class="wiz-side-head"></div>
            <div class="wiz-sum"><span class="wiz-sum-icon"><svg><use href="#svg-shutter"></use></svg></span><span class="wiz-sum-text"><h2 class="wiz-title"></h2><b></b><span></span><small class="wiz-now"></small></span></div>
            <ol class="wiz-steps"></ol><div class="wiz-pbar" aria-hidden="true"></div>
            </aside>
            <section class="wiz-main"></section>
            <footer class="wiz-foot"></footer></div>`;
        this.div = div;
        div._onClosed = () => { if (this.div === div) this.onClose(); };
        div.onclick = (e) => { if (e.target.closest('[data-wiz-close]')) this.close(); };
        shOverlay(div);
    }
    $(sel) { return this.div ? this.div.querySelector(sel) : null; }
    box() { return this.$('.wiz-window') || this.$('.genmod-window'); }
    close() { if (this.div) requestCloseOverlay(this.div, this.w ? undefined : () => this.onClose()); }
    // Un chrono en cours veut dire un moteur peut-être en mouvement : on l'arrête avant de partir.
    onClose() {
        this.stopListen();
        if (this.s && this.s.timer) { this.stopTimer(); this.sendCmd('My'); }
        if (this.s && this.s.rtimer) clearTimeout(this.s.rtimer);
        if (this.s) somfy.updateShadeList();
        const cb = this.s && this.s.single && this.s.changed ? this.s.onDone : null;
        this.c = this.s = this.div = this.w = null;
        if (typeof cb === 'function') cb();
    }

    // ================= CRÉATION : type, télécommande, nom et pièce =================
    open() {
        if (somfy.shades?.length >= 30) return ui.errorMessage(get('divSomfySettings'), tr('ERR_DEVICE_LIMIT_REACHED'));
        getJSONSync('/getNextShade', (err, next) => {
            if (err) return ui.serviceError(err);
            this.s = null;
            this.c = { fam: null, axes: [], name: '', nameTouched: false, roomId: 0, proto: next.proto || 0, bits: next.bitLength === 80 ? 80 : 56,
                       addr: next.remoteAddress, pulse: 200, remote: 'idle', frame: null, keep: true, detected: false, advOpen: pairMode.expert(), timer: null };
            this.w = { step: 0, resume: false, justCreated: false, remote: 'idle' };
            this.mountWiz();
            this.renderWiz();
        });
    }
    // ---------- Copie d'un équipement existant ----------
    // Mêmes réglages que le modèle, créé d'un coup puis ouvert dans sa fiche. Pas de My (position
    // propre à chaque fenêtre), ni nom, pièce, ID radio ou télécommandes. Les GPIO d'un relais ne
    // se copient pas non plus : deux équipements ne commandent pas la même broche.
    copyHtml() {
        const list = (somfy.shades || []).slice().sort((a, b) => b.shadeId - a.shadeId);
        if (!list.length) return '';
        return `<div class="gen-tile wiz-copy"><div class="wiz-copy-text"><b>${tr('SETUP_W_COPY_TITLE')}</b><p class="gen-tile-desc">${tr('SETUP_W_COPY_DESC')}</p></div>
            <div class="gen-input-box"><select class="gen-input" aria-label="${escAttr(tr('SETUP_COPY_FROM'))}" onchange="shadeSetup.copyFrom(this)"><option value="">${tr('SETUP_COPY_PICK')}</option>
            ${list.map(x => `<option value="${x.shadeId}">${escHtml(x.name)}</option>`).join('')}</select></div></div>`;
    }
    familyOf(shadeType) {
        const types = { shutter: [4], roller: [0], blind: [1], awning: [3], drapery: [2, 7, 8], garage: [5, 6], gate: [11, 12, 13, 14, 15, 16], switch: [9, 10] };
        return this.families.find(f => (types[f.id] || []).includes(shadeType));
    }
    copyFrom(sel) {
        const id = parseInt(sel.value, 10), src = (somfy.shades || []).find(x => x.shadeId === id);
        sel.value = '';
        if (!src) return;
        ui.confirm({ level: 'info', title: tr('SETUP_COPY_CONFIRM').replace('{name}', src.name), desc: `<p>${tr('SETUP_COPY_CONFIRM_DESC')}</p>`, confirm: tr('BT_CREATE') })
            .then(ok => { if (ok) this.createCopy(id); });
    }
    createCopy(id) {
        const c = this.c;
        getJSONSync(`/shade?shadeId=${id}`, (err, m) => {
            if (err) return ui.serviceError(err);
            const fam = this.familyOf(m.shadeType);
            const obj = { name: `${fam ? tr(fam.label) : m.name} ${(somfy.shades || []).filter(x => x.shadeType === m.shadeType).length + 1}`.slice(0, 20),
                          roomId: 0, remoteAddress: c.addr };
            ['shadeType', 'bitLength', 'flipCommands', 'flipPosition', 'upTime', 'downTime', 'slackUp', 'slackDown', 'upMidTime', 'downMidTime', 'tiltType', 'tiltTimeUp', 'tiltTimeDown',
             'tiltFirstOnOpen', 'tiltFirstOnClose', 'stepSize', 'sunSensor', 'repeats', 'ledFeedback', 'stateVocab', 'outputMode', 'pulseTime']
                .forEach(k => { if (m[k] !== undefined) obj[k] = m[k]; });
            obj.proto = m.proto < 8 ? m.proto : c.proto;
            // Seules les tâches de réglage passent : l'appairage est à refaire, les options aussi pour le My.
            // Modèle d'avant setupSteps et appairé : tout y est réputé fait.
            const copied = SETUP_BIT.dir | SETUP_BIT.cal | SETUP_BIT.tilt | SETUP_BIT.order;
            const steps = (!m.setupSteps && m.paired) ? this.tasksFor(m).reduce((a, k) => a | SETUP_BIT[k], 0) : (m.setupSteps || 0);
            obj.setupSteps = steps & copied;
            const owner = somfy.remoteAddressOwner(obj.remoteAddress, NaN, 255);
            if (owner) return ui.errorMessage(this.box(), tr(owner.isGroup ? 'ERR_REMOTE_ADDRESS_USED_GROUP' : 'ERR_REMOTE_ADDRESS_USED_DEVICE').replace('{name}', escHtml(owner.name)));
            putJSONSync('/addShade', obj, (e, shade) => {
                if (e) return ui.serviceError(e);
                this.stopListen();
                closeOverlay(this.div);
                this.c = this.div = this.w = null;
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
        this.renderWiz();
    }
    pickAxis(i, v) {
        const c = this.c;
        c.axes[i] = v;
        if (!c.nameTouched && c.axes.every(x => x != null)) c.name = this.autoName(c.fam, c.axes);
        this.renderWiz();
    }
    setName(v) { this.c.name = v; this.c.nameTouched = v.trim() !== ''; this.renderWiz(true); }
    setAdv(k, v) { this.c[k] = parseInt(v, 10); this.c.detected = false; this.renderWiz(); }
    // Ce que demandera la mise en service, d'après le type choisi : la colonne le montre dès l'étape 1.
    previewShade() {
        const c = this.c, fam = c && c.fam;
        if (!fam) return { shadeType: 4 };
        const a = c.axes.map(v => v ?? '0');
        return Object.assign({ shadeType: fam.type(a) }, fam.settings ? fam.settings(a, c) : {});
    }
    listen() {
        const c = this.c;
        c.remote = 'listen';
        this.stopListen();
        c.timer = setTimeout(() => { c.timer = null; c.remote = 'timeout'; this.renderWiz(); }, SETUP_LISTEN_MS);
        this.renderWiz();
    }
    stopListen() { if (this.c && this.c.timer) { clearTimeout(this.c.timer); this.c.timer = null; } }
    cancelListen() {
        const c = this.c;
        this.stopListen();
        c.remote = c.frame ? (somfy.frameAddressName(c.frame.address) ? 'known' : 'ok') : 'idle';
        this.renderWiz();
    }
    noRemote() { this.stopListen(); this.c.remote = 'none'; this.renderWiz(); }
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
        this.renderWiz();
    }
    create() {
        const c = this.c, body = this.box();
        const obj = Object.assign({ name: c.name.trim(), shadeType: c.fam.type(c.axes), roomId: c.roomId, proto: c.proto, bitLength: c.bits, remoteAddress: c.addr, setupSteps: pairMode.expert() ? SETUP_BIT.dir | SETUP_BIT.opts : 0 },
            c.fam.settings ? c.fam.settings(c.axes, c) : {});
        if (!obj.name || obj.name.length > 20) return ui.errorMessage(body, tr('ERR_DEVICE_NAME_INVALID'));
        if (isNaN(obj.remoteAddress) || obj.remoteAddress < 1 || obj.remoteAddress > 16777215) return ui.errorMessage(body, tr('ERR_REMOTE_ADDRESS_INVALID'));
        const owner = somfy.remoteAddressOwner(obj.remoteAddress, NaN, 255);
        if (owner) return ui.errorMessage(body, tr(owner.isGroup ? 'ERR_REMOTE_ADDRESS_USED_GROUP' : 'ERR_REMOTE_ADDRESS_USED_DEVICE').replace('{name}', escHtml(owner.name)));
        this.stopListen();
        putJSONSync('/addShade', obj, (err, shade) => {
            if (err) return ui.serviceError(err);
            const link = c.frame && c.keep ? c.frame : null;
            // L'équipement existe désormais : la suite de l'assistant est sa mise en service.
            const go = () => {
                // Expert : la fiche porte déjà les réglages en saisie directe ; l'appairage s'ouvre par-dessus.
                if (pairMode.expert()) {
                    closeOverlay(this.div);
                    somfy.updateShadeList();
                    somfy.openCardEditor('shade', shade.shadeId, 2);
                    return this.runTask(shade.shadeId, 'pair', () => somfy._openEditShade(shade.shadeId));
                }
                somfy.updateShadeList();
                if (this.w) Object.assign(this.w, { justCreated: true, remote: c.remote });
                this.startSetup(shade, !!link);
            };
            if (!link) return go();
            putJSON('/linkRemote', { shadeId: shade.shadeId, remoteAddress: link.address, rollingCode: link.rcode }, (e) => { if (e) ui.serviceError(e); go(); });
        });
    }

    // ---------- Rendu de l'assistant (coque wiz-) ----------
    wizNext() {
        const s = this.s;
        if (!s) return this.create();
        if (s.tasks[s.cur].id === 'opts') return this.optsDone();
        this.nextTask();
    }
    wizDesc(shade, id) {
        const toggle = somfy.toggleShadeTypes.includes(shade.shadeType) || somfy.dryContactShadeTypes.includes(shade.shadeType);
        return tr({ pair: 'SETUP_W_D_PAIR', dir: toggle ? 'SETUP_W_D_TEST' : 'SETUP_W_D_DIR', cal: 'SETUP_W_D_CAL', tilt: 'SETUP_W_D_TILT', order: 'SETUP_W_D_ORDER', opts: 'SETUP_W_D_OPTS' }[id]);
    }
    // keepMain : pendant la frappe du nom, seuls la colonne et le pied sont redessinés.
    renderWiz(keepMain) {
        const w = this.w, c = this.c, s = this.s, created = !!s;
        if (!w || !this.div) return;
        if (created && s.cur >= s.tasks.length) return this.finishWiz();
        const fam = created ? this.familyOf(s.shade.shadeType) : c.fam;
        const name = created ? s.shade.name : c.name.trim();
        const roomId = created ? s.shade.roomId : c.roomId;
        const room = roomId ? ((_rooms.find(r => r.roomId === roomId) || {}).name || '') : '';
        const items = [];
        // La création tient sur une page : une seule étape, puis celles de la mise en service.
        if (!w.resume) items.push({ title: tr('SETUP_W_CREATE_BTN'), desc: name || (fam ? tr(fam.label) : tr('SETUP_W_TYPE_DESC')), state: created ? 'done' : 'on' });
        const shade = created ? s.shade : this.previewShade();
        const tasks = created ? s.tasks : this.tasksFor(shade).map(id => ({ id, state: null }));
        tasks.forEach((T, k) => {
            const on = created && k === s.cur;
            items.push({ title: this.titleFor(shade, T.id), phase: !w.resume && k === 0 ? tr('SETUP_W_PH_SERVICE') : '',
                desc: T.state === 'done' ? (T.note || tr('SETUP_S_DONE')) : T.state === 'skipped' ? tr('SETUP_S_SKIPPED') : this.wizDesc(shade, T.id),
                state: on ? 'on' : T.state === 'done' ? 'done' : T.state || '', pick: created && !on && (T.state || k < s.cur) ? `shadeSetup.reopen(${k})` : '' });
        });
        const bar = wizStepsHtml(items), ol = this.$('.wiz-steps');
        // Expert : pas de mise en service par étapes à annoncer, la fiche s'ouvre après la création.
        ol.hidden = this.$('.wiz-pbar').hidden = !created && pairMode.expert();
        ol.innerHTML = bar.steps;
        ol.classList.toggle('many', items.length > 4);
        this.$('.wiz-pbar').innerHTML = bar.bar;
        this.$('.wiz-now').textContent = ol.hidden ? '' : bar.now;
        this.$('.wiz-title').textContent = tr(w.resume ? 'SETUP_RESUME_TITLE' : 'WELCOME_ADD_DEVICE_TITLE');
        this.$('.wiz-sum-icon use').setAttribute('href', `#${fam ? fam.ico : 'svg-shutter'}`);
        this.$('.wiz-sum-text b').textContent = name || tr('SETUP_W_NEW');
        this.$('.wiz-sum-text span').textContent = fam ? tr(fam.label) + (room ? ' · ' + room : '') : tr('SETUP_W_TYPE_DESC');

        const T = created ? s.tasks[s.cur] : null;
        // Guidé / expert : à la création et à l'appairage, menu ⋮ au coin de la colonne (à gauche de la croix).
        const pm = !created || T.id === 'pair', expert = pm && pairMode.expert();
        this.$('.wiz-side-head .pair-mode-menu')?.remove();
        this.$('.pair-mode-badge')?.remove();
        if (pm) this.$('.wiz-side-head').insertAdjacentHTML('beforeend', pairMode.menu('shadeSetup.setPairMode'));
        if (expert) this.$('.wiz-pbar').insertAdjacentHTML('afterend', pairMode.badge());
        const head = (title) => `<div class="wiz-head"><h2 class="wiz-h">${title}</h2></div>`;
        const okSvg = '<svg><use href="#svg-check"></use></svg>';
        let html = '', ok = true, hint = '', primary = 'BT_CONTINUE';
        if (!created) {
            const sel = c.fam, typeOk = !!sel && !c.axes.some(v => v == null), off = typeOk ? '' : ' wiz-sec-off';
            const sec = (n, title, body, cls = '') => `<section class="wiz-sec${cls}"><h3 class="wiz-sec-h"><span class="wiz-sec-n">${n}</span>${title}</h3>${body}</section>`;
            const axes = sel && sel.axes ? sel.axes.map((a, i) => {
                const cur = a.opts.find(o => o[0] === c.axes[i]);
                const desc = c.axes[i] == null ? '' : a.desc ? a.desc(c.axes[i]) : (cur && cur[2] ? tr(cur[2]) : '');
                return `<div class="gen-tile"><h4 class="wiz-q">${tr(a.q)}</h4><div class="wiz-chips">${a.opts.map(([v, l]) =>
                    `<button type="button" class="wiz-chip${c.axes[i] === v ? ' on' : ''}" aria-pressed="${c.axes[i] === v}" onclick="shadeSetup.pickAxis(${i},'${v}')">${tr(l)}</button>`).join('')}</div>
                    ${desc ? `<p class="gen-tile-desc">${desc}</p>` : ''}${a.extra ? a.extra(c.axes[i], c) : ''}</div>`;
            }).join('') : '';
            const typeSec = `<div class="wiz-fam">${this.families.map(f => `<button type="button" class="wiz-fam-card${sel === f ? ' on' : ''}" aria-pressed="${sel === f}" onclick="shadeSetup.pickFamily('${f.id}')">
                <span class="wiz-fam-icon"><svg><use href="#${f.ico}"></use></svg></span>${tr(f.label)}</button>`).join('')}</div>
                ${axes ? `<div class="wiz-grid">${axes}</div>` : ''}${this.copyHtml()}`;
            const f = c.frame, own = c.remote === 'known', owner = own ? somfy.frameAddressName(f.address) : null;
            const badge = c.detected ? `<span class="wiz-badge">${tr('SETUP_DETECTED')}</span>` : '';
            const remBody = {
                listen: `<div class="wiz-listen"><span class="wiz-listen-icon"><svg><use href="#svg-wave"></use></svg></span><span class="wiz-listen-text"><b>${tr('SETUP_LISTEN_TITLE')}</b>${tr('SETUP_LISTEN_DESC')}</span>
                    <button type="button" class="gen-btn" onclick="shadeSetup.cancelListen()">${tr('BT_CANCEL_1')}</button></div>`,
                timeout: `<p class="wiz-warn"><span><b>${tr('SETUP_TIMEOUT_TITLE')}</b><br>${tr('SETUP_TIMEOUT_DESC')}</span></p>
                    <div class="gen-btn-row"><button type="button" class="gen-btn gen-btn-primary" onclick="shadeSetup.listen()">${tr('BT_RETRY')}</button></div>`,
                none: `<p class="wiz-info">${tr('SETUP_W_REMOTE_NONE_DESC')}</p><button type="button" class="wiz-link" onclick="shadeSetup.listen()">${tr('SETUP_W_LISTEN_YES')}</button>`,
                idle: `<div class="gen-btn-row"><button type="button" class="gen-btn gen-btn-primary" onclick="shadeSetup.listen()">${tr('SETUP_W_LISTEN_YES')}</button>
                    <button type="button" class="gen-btn" onclick="shadeSetup.noRemote()">${tr('SETUP_W_LISTEN_NO')}</button></div>`
            }[c.remote] || `<p class="${own ? 'wiz-warn' : 'wiz-ok'}">${own ? '' : okSvg}<span><b>${own ? this.t('SETUP_REMOTE_KNOWN', { name: escHtml(owner ? owner.name : '') }) : tr('SETUP_REMOTE_OK')}</b>
                    <span class="wiz-facts"><span>${somfy.frameProtoLabel(f.proto)}</span><span>${this.t('SETUP_FACT_BITS', { n: f.bits })}</span><span>${this.t('SETUP_FACT_ADDR', { addr: f.address })}</span><span>${f.rssi} dBm</span></span>
                    ${tr(own ? 'SETUP_REMOTE_KNOWN_DESC' : 'SETUP_REMOTE_OK_DESC')}</span></p>
                <button type="button" class="wiz-check wiz-keep${c.keep ? ' on' : ''}" aria-pressed="${c.keep}" onclick="shadeSetup.c.keep = !shadeSetup.c.keep; shadeSetup.renderWiz()">
                <span class="wiz-check-text"><b>${tr('SETUP_REMOTE_KEEP')}</b></span><span class="wiz-check-box">${okSvg}</span></button>
                <button type="button" class="wiz-link" onclick="shadeSetup.listen()">${tr('SETUP_REMOTE_AGAIN')}</button>`;
            const remSec = `<p class="wiz-lead">${tr('SETUP_REMOTE_DESC')}</p>${remBody}
                <details class="wiz-adv"${c.advOpen ? ' open' : ''} ontoggle="shadeSetup.c.advOpen = this.open"><summary>${tr('SETUP_ADVANCED')}<span>${this.t('SETUP_ADV_SUMMARY', { proto: somfy.frameProtoLabel(c.proto), bits: c.bits, id: c.addr })}</span></summary>
                <div class="wiz-grid">
                <div class="gen-field"><label class="gen-field-label" for="ssetupProto">${tr('PROTOCOL')}${badge}</label><div class="gen-input-box"><select id="ssetupProto" class="gen-input" onchange="shadeSetup.setAdv('proto', this.value)">${[0, 1, 2].map(v => `<option value="${v}"${c.proto === v ? ' selected' : ''}>${somfy.frameProtoLabel(v)}</option>`).join('')}</select></div></div>
                <div class="gen-field"><label class="gen-field-label" for="ssetupBits">${tr('BIT')}${badge}</label><div class="gen-input-box"><select id="ssetupBits" class="gen-input" onchange="shadeSetup.setAdv('bits', this.value)">${[56, 80].map(v => `<option value="${v}"${c.bits === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div></div>
                <div class="gen-field"><label class="gen-field-label" for="ssetupAddr">${tr('DEVICE_ID')}</label><div class="gen-input-box"><input id="ssetupAddr" class="gen-input" type="number" min="1" max="16777215" value="${c.addr}" oninput="shadeSetup.c.addr = parseInt(this.value, 10)"></div></div>
                </div><p class="gen-tile-desc">${tr('SETUP_ADV_NOTE')}</p></details>`;
            const rooms = _rooms.map(r => `<option value="${r.roomId}"${r.roomId === c.roomId ? ' selected' : ''}>${escHtml(r.name)}</option>`).join('');
            const nameSec = `<div class="wiz-grid">
                <div class="gen-tile"><div class="gen-field"><label class="gen-field-label" for="ssetupName">${tr('NAME')}</label>
                  <div class="gen-input-box"><input id="ssetupName" class="gen-input" maxlength="20" placeholder="${escAttr(tr('ENTER_NAME'))}" value="${escAttr(c.name)}" oninput="shadeSetup.setName(this.value)"></div></div>
                  ${c.nameTouched ? '' : `<p class="gen-tile-desc">${tr('SETUP_W_NAME_AUTO')}</p>`}</div>
                <div class="gen-tile"><div class="gen-field"><label class="gen-field-label" for="ssetupRoom">${tr('ROOM')}</label>
                  <div class="gen-input-box"><select id="ssetupRoom" class="gen-input" onchange="shadeSetup.c.roomId = parseInt(this.value, 10); shadeSetup.renderWiz(true)">${rooms}</select></div></div>
                  <button type="button" class="gen-btn wiz-add-room" onclick="somfy.openAddRoomInline('ssetup')"><svg><use href="#svg-add"></use></svg><span>${tr('BT_ADD_ROOM')}</span></button></div>
                </div>
                <p class="wiz-info">${tr('SETUP_W_CREATE_NOTE')}</p>`;
            // Télécommande et nom restent grisés tant que le type n'est pas complet : le nom proposé
            // et la liste de la mise en service en dépendent.
            html = `${head(tr('SETUP_W_CREATE_H'))}${sec(1, tr('SETUP_TYPE_Q'), typeSec)}${sec(2, tr('SETUP_W_REMOTE_H'), remSec, off)}${sec(3, tr('SETUP_W_NAME_H'), nameSec, off)}`;
            ok = typeOk && c.remote !== 'listen' && !!name && c.name.length <= 20;
            hint = !sel ? tr('SETUP_W_HINT_TYPE') : !typeOk ? tr('SETUP_W_HINT_AXES') : c.remote === 'listen' ? tr('SETUP_W_HINT_LISTEN') : !name ? tr('GSETUP_W_HINT_NAME') : '';
            primary = 'SETUP_W_CREATE_BTN';
        } else {
            const skipIn = T.state === 'done' || T.id === 'opts' ? '' : `<button type="button" class="wiz-link wiz-skip-in" onclick="shadeSetup.skip()">${tr('SETUP_SKIP')}</button>`;
            if (expert) html = `${head(tr('SETUP_W_PAIR_H'))}<div class="wiz-grid"><div class="gen-tile">${this.twPair(T).body}</div></div>`;
            else if (T.id === 'pair') html = `${head(tr('SETUP_W_PAIR_H'))}
                ${w.justCreated ? `<p class="wiz-ok">${okSvg}<span>${this.t('SETUP_W_CREATED', { name: escHtml(name) })}</span></p>` : ''}
                <p class="wiz-lead">${tr('SETUP_W_PAIR_LEAD')}</p><div class="wiz-grid">${this.wizPair(T)}</div>`;
            else if (T.id === 'dir') html = `${head(this.title(T))}<div class="wiz-grid"><div class="gen-tile wiz-body">${this.bodyDir(T)}</div>
                ${s.isToggle ? '' : `<div class="gen-tile"><h3 class="gen-tile-title">${tr('SETUP_TIP_TITLE')}</h3><p class="gen-tile-desc">${tr('SETUP_W_DIR_TIP')}</p></div>`}</div>`;
            else if (T.id === 'opts') html = `${head(tr('SETUP_W_OPTS_H'))}
                ${s.tasks.some(x => x.state === 'skipped') ? `<p class="wiz-warn">${tr('SETUP_PARTIAL_DESC')}</p>` : ''}
                <div class="wiz-grid wiz-opts">${this.bodyOpts(true)}</div>`;
            else html = `${head(T.id === 'cal' ? tr('SETUP_W_CAL_H') : this.title(T))}<div class="wiz-grid"><div class="gen-tile wiz-body">${this.taskBody(T)}</div></div>`;
            html += skipIn;
            if (T.id === 'opts') { ok = this.optsReady().all; hint = ok ? '' : tr('SETUP_W_HINT_OPTS'); primary = 'SETUP_FINISH'; }
            else {
                ok = T.state === 'done';
                hint = ok ? '' : tr({ pair: 'SETUP_W_HINT_PAIR', dir: 'SETUP_W_HINT_DIR', cal: 'SETUP_W_HINT_CAL' }[T.id] || 'SETUP_W_HINT_STEP');
            }
        }
        // Expert : la page de création sans ses textes d'aide (cf. .wiz-x, overlays.css).
        this.$('.wiz-main').classList.toggle('wiz-x', !created && pairMode.expert());
        if (!keepMain) {
            this.$('.wiz-main').innerHTML = html;
            wizScrollTop(w, this.$('.wiz-main'), created ? `t${s.cur}` : 'create');
        }
        const btn = (cls, attrs, key) => `<button type="button" class="gen-btn${cls}" ${attrs}>${tr(key)}</button>`;
        // Retour : la sous-étape précédente, sinon l'étape précédente de la mise en service.
        const back = created && ((s.hist[s.cur] || []).length || s.cur > 0) ? 'onclick="shadeSetup.prev()"' : '';
        // Mobile : à la création, le pied devient le message flottant de la barre d'enregistrement.
        const foot = this.$('.wiz-foot');
        foot.classList.toggle('wiz-float', !created);
        this.$('.wiz-main').classList.toggle('wiz-main-float', !created);
        if (!created && !hint) hint = [name, fam ? tr(fam.label) : '', room].filter(Boolean).join(' · ');
        // Retour à gauche ; à droite, la sortie juste avant l'action principale, comme « Créer un groupe ».
        foot.innerHTML = `${back ? btn('', back, 'BT_GO_BACK') : ''}
            <span class="wiz-foot-gap"></span><span class="wiz-foot-hint">${escHtml(hint)}</span>
            ${created && T.id !== 'opts' && T.state !== 'done' ? btn(' wiz-skip', 'onclick="shadeSetup.skip()"', 'SETUP_SKIP') : ''}
            ${btn(' wiz-quit', 'data-wiz-close', created ? 'SETUP_LATER' : 'BT_CANCEL')}
            ${btn(' gen-btn-primary', `onclick="shadeSetup.wizNext()"${ok ? '' : ' disabled'}`, primary)}`;
        if (!keepMain) this.bindProg();
    }
    // Appairage en deux tuiles, comme la liaison d'un groupe : la mémoire ouverte avec la
    // télécommande d'origine, puis PROG depuis l'appareil (grisé tant que la première n'est pas faite).
    wizPair(T) {
        const s = this.s, memOk = T.sub !== 'pret', okSvg = '<svg><use href="#svg-check"></use></svg>';
        const mem = memOk ? `<p class="wiz-ok">${okSvg}${tr('GSETUP_MEM_OK')}</p>`
            : `<div class="gen-btn-row"><button type="button" class="gen-btn gen-btn-primary" onclick="shadeSetup.go('prog')">${tr('SETUP_PAIR_JOGGED')}</button></div>`;
        const prog = T.sub === 'rien' ? `<p class="wiz-warn"><span><b>${tr('SETUP_PAIR_HELP')}</b><br>${tr('SETUP_PAIR_HELP_2')}</span></p>
            <div class="gen-btn-row"><button type="button" class="gen-btn" onclick="shadeSetup.go('pret')">${tr('SETUP_PAIR_REOPEN')}</button><button type="button" class="gen-btn gen-btn-primary" onclick="shadeSetup.go('prog')">${tr('SETUP_PAIR_RETRY')}</button></div>`
            : `<div class="gen-btn-row"><button type="button" id="btnSetupProg" class="gen-btn gen-btn-primary wiz-prog"${memOk ? '' : ' disabled'}>${tr('BT_PROG')}</button></div>
            <div id="setupAfterProg" class="wiz-after"${s.sent ? '' : ' hidden'}><p class="wiz-q">${tr('SETUP_WHAT_DID')}</p>
            <div class="gen-btn-row"><button type="button" class="gen-btn" onclick="shadeSetup.go('rien')">${tr('SETUP_NOTHING')}</button><button type="button" class="gen-btn" onclick="shadeSetup.pairDone()">${tr('SETUP_PAIR_JOGGED')}</button></div></div>`;
        return `<div class="gen-tile"><h3 class="gen-tile-title">${tr('SETUP_W_MEM_TITLE')}</h3>
            <p class="gen-tile-desc">${this.t('SETUP_PAIR_OPEN', { remote: tr(s.hadRemote ? 'SETUP_PAIR_THIS_REMOTE' : 'SETUP_PAIR_ANY_REMOTE') })}</p>
            <p class="gen-tile-desc">${tr('SETUP_PAIR_2MIN')}</p>${mem}</div>
            <div class="gen-tile"><h3 class="gen-tile-title">${tr('SETUP_W_PROG_TITLE')}</h3><p class="gen-tile-desc">${tr('SETUP_PAIR_PROG')}</p>${prog}</div>`;
    }
    // Fin de parcours : un message bref, la carte de la liste dit ce qui reste à faire.
    finishWiz() {
        const s = this.s, todo = s.tasks.some(T => T.state !== 'done');
        ui.toast(this.t(todo ? 'SETUP_CREATED' : 'SETUP_READY', { name: s.shade.name }));
        closeOverlay(this.div);
    }

    // ================= ÉTAPE 2 : MISE EN SERVICE =================
    resume(shadeId) {
        getJSONSync(`/shade?shadeId=${shadeId}`, (err, shade) => {
            if (err) return ui.serviceError(err);
            this.w = { step: 0, resume: true, justCreated: false, remote: 'idle' };
            this.mountWiz();
            this.startSetup(shade, false);
        });
    }
    // Une tâche seule, hors parcours (fiche de l'équipement, désappairage). Les autres bits de
    // setupSteps sont repris tels quels : la tâche ne réécrit que le sien.
    runTask(shadeId, taskId, onDone) {
        getJSONSync(`/shade?shadeId=${shadeId}`, (err, shade) => {
            if (err) return ui.serviceError(err);
            this.mountTask();
            // « Régler la position favorite » : la seule question My de la tâche Options.
            this.startSetup(shade, false, taskId === 'my' ? 'opts' : taskId, onDone);
            if (taskId === 'my' && this.s) { this.s.myOnly = true; this.render(); }
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
            myTilt: shade.myTiltPos >= 0 ? shade.myTiltPos : 50, posq: shade.flipPosition ? 'open' : 'closed', rep: shade.repeats ?? 1, led: shade.ledFeedback ? 'oui' : 'non'
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
        const s = this.s;
        this.prefillMarks(shade);
        s.orderOpen = !!shade.tiltFirstOnOpen;
        s.orderClose = !!shade.tiltFirstOnClose;
        if (s.supportsMy && shade.myPos >= 0) Object.assign(s, shade.simMy ? { my: 'non', myMode: 'sim' } : { my: 'oui' }, { myStep: 'learned', myPos: shade.myPos, myTarget: shade.myPos });
        if (s.st.sun) s.sun = shade.sunSensor ? 'oui' : 'non';
    }
    // Repères des tâches faites, repris de l'équipement : seulement ceux qui ne sont pas déjà en mémoire.
    prefillMarks(shade) {
        const s = this.s, done = id => (s.tasks.find(T => T.id === id) || {}).state === 'done';
        if (done('cal') && !s.marks.up) {
            Object.assign(s.marks, { up: { inter: null, final: shade.upTime }, down: { inter: null, final: shade.downTime } });
            if (shade.slackUp) s.marks.dzup = { inter: shade.slackUp, final: shade.upTime };
            if (shade.slackDown) s.marks.dzdown = { inter: shade.downTime - shade.slackDown, final: shade.downTime };
            s.dzManual = !!(shade.slackUp || shade.slackDown);
            if (shade.upMidTime) s.marks.mup = { inter: null, final: shade.upMidTime };
            if (shade.downMidTime) s.marks.mdown = { inter: null, final: shade.downMidTime };
            s.midManual = !!(shade.upMidTime || shade.downMidTime);
        }
        if (done('tilt') && !s.marks.tup) Object.assign(s.marks, { tup: { inter: null, final: shade.tiltTimeUp }, tdown: { inter: null, final: shade.tiltTimeDown } });
    }
    // Désappairer depuis la vue de l'appairage : même fenêtre, l'autre tâche.
    switchTask(id) {
        const s = this.s;
        let k = s.tasks.findIndex(T => T.id === id);
        if (k < 0) { s.tasks.push({ id, sub: SETUP_INIT[id], state: null }); k = s.tasks.length - 1; }
        s.home = s.cur = k;
        s.sent = false;
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
        if (this.w) this.w.justCreated = false;
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
        if (this.w) this.w.justCreated = false;
        const T = s.tasks[k];
        T.sub = SETUP_INIT[T.id];
        // Revenir en arrière dans l'assistant : une tâche faite s'ouvre sur ce qui est réglé.
        if (this.w && T.state === 'done' && ['dir', 'cal', 'tilt', 'order'].includes(T.id)) {
            this.prefillMarks(s.shade);
            T.sub = 'view';
        }
        s.cur = k;
        this.render();
    }
    skip() {
        const s = this.s;
        this.stopTimer();
        if (s.tasks[s.cur].state !== 'done') s.tasks[s.cur].state = 'skipped';
        this.nextTask();
    }
    cmd(c) { this.sendCmd(c); this.s.sent = true; this.render(); }

    titleFor(shade, id) {
        const st = somfy.shadeTypes.find(x => x.type === shade.shadeType) || {}, tt = st.tilt ? (shade.tiltType || 0) : 0;
        const toggle = somfy.toggleShadeTypes.includes(shade.shadeType) || somfy.dryContactShadeTypes.includes(shade.shadeType);
        return tr({ pair: 'PAIRING', unpair: 'UNPAIR_TITLE', remote: 'REMOTESLIST_TITLE', dir: toggle ? 'SETUP_T_TEST' : tt === 3 ? 'SETUP_T_SLATS_DIR' : 'SETUP_T_DIR',
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
            // Le désappairage ne se trouve que derrière cette ligne : on le dit.
            case 'pair': return `${tr('SETUP_S_PAIRED')}<span class="setup-hint"> · ${tr('SETUP_S_PAIRED_HINT')}</span>`;
            case 'dir': return tr(toggle ? 'SETUP_S_RESPONDS' : shade.flipCommands ? 'SETUP_V_DIR_FLIPPED' : 'SETUP_V_DIR_NORMAL');
            case 'cal': return `${f(shade.upTime)}${dz(shade.slackUp)} / ${f(shade.downTime)}${dz(shade.slackDown)}${shade.upMidTime || shade.downMidTime ? ' · ' + tr('SETUP_S_MIDCURVE') : ''}`;
            case 'tilt': return `${f(shade.tiltTimeUp)} / ${f(shade.tiltTimeDown)}`;
            case 'order': return `${first(shade.tiltFirstOnOpen)} / ${first(shade.tiltFirstOnClose)}`;
            case 'opts': {
                const st = somfy.shadeTypes.find(x => x.type === shade.shadeType) || {}, parts = [];
                if (!somfy.noMyShadeTypes.includes(shade.shadeType)) parts.push(shade.myPos >= 0 ? this.t(shade.simMy ? 'SETUP_S_MY_SIM' : 'SETUP_S_MY', { pos: shade.myPos }) : tr('SETUP_S_NO_MY'));
                if (st.tilt && [1, 2, 4].includes(shade.tiltType) && shade.myPos >= 0 && shade.myTiltPos >= 0) parts.push(this.t('SETUP_S_MY_TILT', { tilt: shade.myTiltPos }));
                if (st.sun) parts.push(tr(shade.sunSensor ? 'SETUP_S_SUN' : 'SETUP_S_NO_SUN'));
                if ((shade.repeats ?? 1) > 1) parts.push(this.t('SETUP_S_REPEATS', { n: shade.repeats }));
                if (this.hasLed() && shade.ledFeedback) parts.push(tr('SETUP_S_LED'));
                return parts.join(' · ') || tr('SETUP_S_REACH_NORMAL');
            }
        }
        return tr('SETUP_S_DONE');
    }
    hasLed() { return typeof window.__ledPin === 'number' && window.__ledPin >= 0; }
    renderEditPanel(shade) {
        const sec = get('divShadeSetupTasks'), list = get('divShadeSetupList');
        if (!sec || !list) return;
        sec.style.display = shade ? '' : 'none';
        this.editShade = shade;
        this.renderTip(shade);
        this.renderActivity(shade);
        if (!shade) { if (get('divShadeRemotes')) get('divShadeRemotes').innerHTML = ''; return; }
        const steps = shade.setupSteps || 0, legacy = !steps && shade.paired;
        const ids = this.tasksFor(shade), doneN = ids.length - this.missingSteps(shade);
        get('shdSetupTitle').textContent = `${tr('SETUP_RESUME_TITLE')} · ${doneN}/${ids.length}`;
        get('shdSetupMeter').style.width = `${Math.round(doneN / ids.length * 100)}%`;
        list.innerHTML = ids.map((id, i) => {
            // Équipement d'avant setupSteps : rien ne dit ce qui a été fait, on n'affiche pas d'état.
            const done = id === 'pair' ? !!shade.paired : !!(steps & SETUP_BIT[id]);
            const status = legacy && id !== 'pair' ? '' : done ? this.valueFor(shade, id) : tr('SETUP_S_TODO');
            const state = done && status ? ' is-done' : status ? ' is-todo' : '';
            return `<button type="button" class="ed-step${state}" onclick="shadeSetup.fromEdit(${shade.shadeId},'${id}')">
            <span class="ed-step-n">${done && status ? '<svg><use href="#svg-check"></use></svg>' : i + 1}</span>
            <span class="ed-step-t"><b>${this.titleFor(shade, id)}</b>${status ? `<span>${status}</span>` : ''}</span>
            <svg class="ed-step-go"><use href="#svg-arrowRight"></use></svg></button>`;
        }).join('');
        this.renderRemoteTiles(shade);
    }
    // Onglet Télécommandes de la fiche : tuile d'ajout puis une tuile par télécommande, comme les
    // membres de la fiche groupe.
    renderRemoteTiles(shade) {
        const box = get('divShadeRemotes');
        if (!box) return;
        const id = shade.shadeId, list = shade.linkedRemotes || [], max = somfy.maxLinkedRemotes || 15;
        const reps = (somfy.repeaters || []).map(Number), repMax = somfy.maxRepeaters || 7;
        const repTip = list.length ? `<p class="ed-tip"><svg><use href="#svg-repeater"></use></svg><span>${tr('DEVICE_REPEAT_TIP').replace('{N}', reps.length).replace('{MAX}', repMax)} <a class="ed-tip-link" onclick="somfy.openRadioTab(4);">${tr('DEVICE_REPEAT_SEE_ALL')}</a></span></p>` : '';
        box.innerHTML = `<p class="ed-tip"><svg><use href="#svg-info"></use></svg><span>${tr('DEVICE_REMOTES_TIP')} <b>${list.length}/${max}</b></span></p>${repTip}
        <div class="cfg-tiles"><button type="button" class="cfg-tile cfg-tile-add" onclick="shadeSetup.runTask(${id},'remote')"${list.length >= max ? ' disabled' : ''}><svg><use href="#svg-add"></use></svg><span>${tr('BT_LINK_REMOTE')}</span><small>${tr('DEVICE_REMOTE_ADD_DESC')}</small></button>`
            + list.map((r, i) => `<div class="cfg-tile" data-remoteaddress="${r.remoteAddress}">
            <div class="cfg-tile-top"><span class="cfg-tile-icon"><svg><use href="#svg-remote"></use></svg></span>${somfy.cfgTileMenu(`somfy.unlinkRemote(${id}, '${r.remoteAddress}')`, '', 'DEVICE_REMOTE_UNLINK')}</div>
            <div class="cfg-tile-name"><span class="name-text">${tr('REMOTESLIST_LINKED')} ${i + 1}</span><span class="cfg-tile-sub">${tr('ADDR')} ${r.remoteAddress}</span></div>
            ${this.repeatRowHtml(r.remoteAddress, reps.includes(Number(r.remoteAddress)), reps.length >= repMax)}
            <div class="cfg-tile-foot">${somfy.remoteSignalHtml(r.lastRssi, r.remoteAddress)}<span class="cfg-tile-id">${tr('CODE')} ${r.lastRollingCode}</span></div>
            </div>`).join('') + '</div>';
    }
    // La fiche est suivie par watchDirty : l'interrupteur s'applique tout de suite, il arrête
    // input/change pour ne pas passer pour une modification à enregistrer.
    repeatRowHtml(address, on, full) {
        return `<div class="ed-rep-row${on ? ' is-on' : ''}"><b>${tr('DEVICE_REMOTE_REPEAT')}</b>
            <span class="gen-seg gen-seg-bool"><input type="checkbox"${on ? ' checked' : ''}${full && !on ? ' disabled' : ''} aria-label="${escAttr(tr('DEVICE_REMOTE_REPEAT'))}" oninput="event.stopPropagation();" onchange="event.stopPropagation(); shadeSetup.toggleRepeat(this, ${Number(address)});"><span class="gen-seg-yes">${tr('BT_YES')}</span><span class="gen-seg-no">${tr('BT_NO')}</span></span>
            <small>${tr(on ? 'DEVICE_REMOTE_REPEAT_ON' : 'DEVICE_REMOTE_REPEAT_OFF')}</small></div>`;
    }
    toggleRepeat(cb, address) {
        cb.disabled = true;
        somfy.setRemoteRepeated(address, cb.checked, (ok) => {
            if (ok) return;
            cb.checked = !cb.checked;
            cb.disabled = false;
        });
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
        const sh = this.editShade && this.editShade.shadeId === a.shadeId ? this.editShade : { shadeId: a.shadeId, shadeType: a.shadeType };
        const cmd = somfy.sentCommandLabel(sh, a.sentCmd);
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
    // Hors assistant, il ne reste que la tâche seule ouverte depuis la fiche.
    render() {
        if (this.w) return this.renderWiz();
        this.renderTask();
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
            if (!this.w && !this.$('.genmod-window')) btn.setAttribute('line', '');
            const after = this.$('#setupAfterProg'), xs = this.$('#setupXStatus');
            if (after) after.hidden = false;
            if (xs) xs.textContent = tr('PAIR_X_SENT');
        };
        btn.addEventListener('mousedown', press, true);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, true);
    }

    taskBody(T) {
        switch (T.id) {
            case 'dir': return this.bodyDir(T);
            case 'cal': return this.bodyCal(T);
            case 'tilt': return this.bodyTilt(T);
            case 'order': return this.bodyOrder(T);
            case 'opts': return this.bodyOpts();
        }
        return '';
    }
    renderTask() {
        // myOnly ne vaut que sur la tâche Options : « Mesurer les temps » y mène à la tâche Temps de course.
        const s = this.s, T = s.tasks[s.cur], remote = T.id === 'remote', id = s.myOnly && T.id === 'opts' ? 'my' : T.id;
        const ico = { pair: 'svg-pair', unpair: 'svg-unlink', remote: 'svg-remote', dir: 'svg-commandInverse', cal: 'svg-horloge', tilt: 'svg-tiltTime', order: 'svg-repeat', opts: 'svg-tabSettings', my: 'svg-favori' }[id];
        if (ico) this.$('.genmod-side-icon use').setAttribute('href', `#${ico}`);
        const side = { pair: ['PAIRING', 'SETUP_TW_PAIR_DESC'], unpair: ['UNPAIR_TITLE', 'SETUP_TW_UNPAIR_DESC'], remote: ['SUBTAB_REMOTES', 'DEVICE_REMOTES_TIP'], my: ['SETMYPOS_TITLE', 'SETUP_MY_DESC'] }[id];
        const n = (s.shade.linkedRemotes || []).length, max = somfy.maxLinkedRemotes || 15;
        const title = this.$('.genmod-side-title'), pm = ['pair', 'unpair'].includes(id);
        title.textContent = side ? tr(side[0]) : this.title(T);
        title.parentElement.querySelector('.pair-mode-menu')?.remove();
        this.$('.pair-mode-badge')?.remove();
        if (pm) {
            title.classList.add('pair-mode-title');
            title.insertAdjacentHTML('afterend', pairMode.menu('shadeSetup.setPairMode'));
            if (pairMode.expert()) this.$('#taskWinState').insertAdjacentHTML('afterend', pairMode.badge());
        } else title.classList.remove('pair-mode-title');
        this.$('.genmod-side-desc').innerHTML = side ? tr(side[1]) : tr({ dir: 'SETUP_TW_DESC_DIR', cal: 'SETUP_TW_DESC_CAL', tilt: 'SETUP_TW_DESC_TILT', order: 'SETUP_TW_DESC_ORDER', opts: 'SETUP_TW_DESC_OPTS' }[id]);
        const stateVal = remote ? `${n}/${max}` : ['pair', 'unpair'].includes(id) ? tr(s.shade.paired ? 'SETUP_PILL_PAIRED' : 'DEVICE_NOT_PAIRED')
            : id === 'my' ? (s.shade.myPos >= 0 ? `${s.shade.myPos} %` : tr('CARD_MY_NONE')) : T.state === 'done' ? this.valueFor(s.shade, id) : tr('SETUP_S_TODO');
        this.$('#taskWinState').innerHTML = genModalState(escHtml(s.shade.name), escHtml(stateVal));
        const v = remote ? this.twRemote() : ['pair', 'unpair'].includes(id) ? this.twPair(T, id === 'unpair') : this.twTask(T, id);
        const back = (s.hist[s.cur] || []).length ? `<button type="button" class="gen-btn" onclick="shadeSetup.prev()">${tr('BT_GO_BACK')}</button>` : '';
        this.$('.genmod-head-title').textContent = v.head;
        this.$('#taskWinHint').textContent = v.hint || '';
        this.$('.genmod-body').innerHTML = v.body;
        this.$('#taskWinFoot').innerHTML = back + `<button type="button" class="gen-btn" data-genmod-close>${tr('BT_CLOSE')}</button>` + (v.primary || '');
        this.bindProg();
    }
    // Les autres tâches gardent le contenu de l'assistant (restylé par :is(.wiz-main, .genmod-body)).
    twTask(T, id) {
        const s = this.s;
        if (id === 'my') return { head: tr('SETMYPOS_TITLE'), body: `<div class="wiz-body">${this.bodyOpts(true)}</div>` };
        if (id === 'opts') {
            const ok = this.optsReady().all;
            return { head: this.title(T), hint: ok ? '' : tr('SETUP_W_HINT_OPTS'), body: `<div class="wiz-body">${this.bodyOpts(true)}</div>`,
                primary: `<button type="button" class="gen-btn gen-btn-primary"${ok ? '' : ' disabled'} onclick="shadeSetup.optsDone()">${tr('SETUP_VALIDATE')}</button>` };
        }
        return { head: this.title(T), body: `<div class="wiz-body">${this.taskBody(T)}</div>` };
    }
    twStep(state, n, title, text) {
        return `<div class="tw-step${state ? ` is-${state}` : ''}"><span class="tw-step-n">${state === 'done' ? '<svg><use href="#svg-check"></use></svg>' : n}</span>
        <div class="tw-step-t"><b>${title}</b><span>${text}</span></div></div>`;
    }
    // Désappairer suit le même geste : mémoire ouverte avec une télécommande appairée, puis PROG.
    twPair(T, un) {
        if (pairMode.expert()) return { head: tr('PAIR_MODE_EXPERT'), body: `<div class="pair-mode-col">
            <button type="button" id="btnSetupProg" class="gen-btn">${tr('BT_PROG')}</button>
            <button type="button" class="gen-btn gen-btn-primary" onclick="shadeSetup.${un ? 'unpairDone' : 'pairDone'}()">${tr('PAIR_X_JOGGED')}</button></div>
            <p class="gen-tile-desc">${tr('PAIR_X_NOTE')}</p><p class="pair-mode-status" id="setupXStatus" aria-live="polite"></p>` };
        const progT = tr(un ? 'SETUP_TW_H_UNPROG' : 'SETUP_TW_H_PROG');
        if (T.sub === 'view') return { head: tr('SETUP_TW_H_DONE'), body: `<p class="tw-ok"><svg><use href="#svg-check"></use></svg><span>${tr('SETUP_TW_PAIR_OK')}</span></p>
            <p class="gen-tile-desc">${tr('SETUP_TW_PAIR_OK_D')}</p>
            <div class="tw-acts"><button type="button" class="gen-btn" onclick="shadeSetup.go('pret')">${tr('SETUP_REPAIR')}</button><button type="button" class="gen-btn genmod-btn-danger" onclick="shadeSetup.switchTask('unpair')">${tr('DEVICE_UNPAIR')}</button></div>` };
        if (T.sub === 'rien') return { head: tr('SETUP_NOTHING_HAPPENED'), body: `<div class="tw-card is-warn"><span class="tw-card-ico"><svg><use href="#svg-warning"></use></svg></span><div><b>${tr('SETUP_PAIR_HELP')}</b><span>${tr('SETUP_PAIR_HELP_2')}</span></div></div>
            <div class="tw-acts"><button type="button" class="gen-btn" onclick="shadeSetup.go('pret')">${tr('SETUP_PAIR_REOPEN')}</button></div>`,
            primary: `<button type="button" class="gen-btn gen-btn-primary" onclick="shadeSetup.go('prog')">${tr('SETUP_PAIR_RETRY')}</button>` };
        if (T.sub === 'prog') return { head: progT, hint: tr('SETUP_TW_HINT_ANSWER'), body: `<div class="tw-steps">${this.twStep('done', 1, tr('SETUP_TW_S1_DONE'), tr('SETUP_TW_S1_DONE_D'))}${this.twStep('', 2, progT, tr(un ? 'UNPAIR_DEVICE_STEP_2_1' : 'SETUP_PAIR_PROG'))}</div>
            <button type="button" id="btnSetupProg" class="tw-prog">${tr('BT_PROG')}<small>${tr('SETUP_TW_PROG_HOLD')}</small></button>
            <div id="setupAfterProg" class="tw-q"${this.s.sent ? '' : ' hidden'}><b>${tr('SETUP_WHAT_DID')}</b>
            <div class="tw-chips"><button type="button" class="tw-chip" onclick="shadeSetup.go('rien')">${tr('SETUP_NOTHING')}</button><button type="button" class="tw-chip is-ok" onclick="shadeSetup.${un ? 'unpairDone' : 'pairDone'}()">${tr('SETUP_PAIR_JOGGED')}</button></div></div>` };
        const open = un ? tr('UNPAIR_DEVICE_STEP_1_1') : this.t('SETUP_PAIR_OPEN', { remote: tr(this.s.hadRemote ? 'SETUP_PAIR_THIS_REMOTE' : 'SETUP_PAIR_ANY_REMOTE') });
        return { head: tr('SETUP_TW_H_OPEN'), hint: tr('SETUP_PAIR_2MIN'), body: `<div class="tw-steps">${this.twStep('', 1, tr('SETUP_TW_H_OPEN'), open)}${this.twStep('off', 2, progT, tr('SETUP_TW_S2_LATER'))}</div>`,
            primary: `<button type="button" class="gen-btn gen-btn-primary" onclick="shadeSetup.go('prog')">${tr('SETUP_PAIR_JOGGED')}</button>` };
    }
    setPairMode(on) { pairMode.set(on); this.render(); }
    pairDone() {
        putJSON('/setPaired', { shadeId: this.shadeId, paired: true }, (err) => {
            if (err) return ui.serviceError(err);
            this.complete({}, tr('SETUP_S_PAIRED'));
        });
    }
    // ---------- Lier une télécommande physique (pas de bit : facultatif, et répétable) ----------
    remotesFull(shade) { return (shade.linkedRemotes || []).length >= (somfy.maxLinkedRemotes || 15); }
    remoteListen(silent) {
        const s = this.s;
        if (s.rtimer) clearTimeout(s.rtimer);
        if (this.remotesFull(s.shade)) { s.rstate = 'full'; if (!silent) this.render(); return; }
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
            if (err && err.code === -19) { s.rstate = 'full'; return this.render(); }
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
    twRemote() {
        const s = this.s, f = s.rframe, list = s.shade.linkedRemotes || [];
        const card = (cls, ico, title, more) => `<div class="tw-card${cls}"><span class="tw-card-ico"><svg><use href="#${ico}"></use></svg></span><div><b>${title}</b>${more || ''}</div></div>`;
        const facts = f ? `<span class="tw-facts"><i>${somfy.frameProtoLabel(f.proto)}</i><i>${this.t('SETUP_FACT_BITS', { n: f.bits })}</i><i>${this.t('SETUP_FACT_ADDR', { addr: f.address })}</i><i>${f.rssi} dBm</i></span>` : '';
        let body = '';
        if (s.rstate === 'listen') body = card(' is-listen', 'svg-wave', tr('SETUP_LISTEN_TITLE'), `<span>${tr('REMOTESLIST_SEARCH')}</span>`)
            + (list.length ? `<button type="button" class="tw-link" onclick="shadeSetup.remoteCancel()">${tr('BT_CANCEL_1')}</button>` : '');
        else if (s.rstate === 'timeout') body = card(' is-warn', 'svg-warning', tr('SETUP_TIMEOUT_TITLE'), `<span>${tr('SETUP_LINK_TIMEOUT_DESC')}</span>`);
        else if (s.rstate === 'linked') body = card(' is-ok', 'svg-check', tr('MSG_REMOTE_LINKED_SUCCESS').replace('%s', f.rssi), facts)
            + (s.rshared ? `<p class="gen-tile-desc">${this.t('SETUP_LINK_SHARED', { name: escHtml(s.rshared) })}</p>` : '');
        else if (s.rstate === 'already') body = card(' is-warn', 'svg-warning', tr('SETUP_LINK_ALREADY'), facts);
        else if (s.rstate === 'full') body = card(' is-warn', 'svg-warning', tr('ERR_REMOTES_FULL'));
        if (list.length) body += `<p class="tw-sec">${tr('SUBTAB_REMOTES')} · ${list.length}/${somfy.maxLinkedRemotes || 15}</p><div class="tw-rlist">${list.map((r, i) => `<div class="tw-rt" data-remoteaddress="${r.remoteAddress}">
            <span class="tw-rt-ico"><svg><use href="#svg-remote"></use></svg></span><span class="tw-rt-t"><b>${tr('REMOTESLIST_LINKED')} ${i + 1}</b><small>${tr('ADDR')} ${r.remoteAddress}</small></span>${somfy.remoteSignalHtml(r.lastRssi, r.remoteAddress)}</div>`).join('')}</div>`;
        const primary = s.rstate === 'listen' || this.remotesFull(s.shade) ? '' : `<button type="button" class="gen-btn gen-btn-primary" onclick="shadeSetup.remoteListen()">${tr(s.rstate === 'timeout' ? 'BT_RETRY' : list.length ? 'SETUP_LINK_ANOTHER' : 'BT_LINK_REMOTE')}</button>`;
        return { head: tr('BT_LINK_REMOTE'), hint: s.rstate === 'listen' ? tr('SETUP_TW_HINT_REMOTE') : '', body, primary };
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
        if (sub[0] === 'm') { const [lo, hi] = this.midBounds(sub); return Math.max(lo + 100, Math.min(hi - 100, val)); }
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
    timeField(id, label, val) {
        return this.w ? `<div class="gen-field"><label class="gen-field-label" for="${id}">${label}</label><div class="gen-input-box"><input id="${id}" class="gen-input" type="number" min="0" max="180" step="0.1" value="${val}"></div></div>`
            : `<div class="uniRow"><div class="unifield-content"><label class="label" for="${id}">${label}</label><input id="${id}" class="inputAndSelect" type="number" min="0" max="180" step="0.1" placeholder=" " value="${val}"></div></div>`;
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
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('manual')">${tr('SETUP_EDIT_TIMES')}</button><button type="button" onclick="shadeSetup.remeasure()">${tr('SETUP_REMEASURE')}</button></div>
            ${this.curveOk() ? `<button type="button" class="setup-link setup-start" onclick="shadeSetup.go('midq')">${tr('SETUP_MID_FINE')}</button>` : ''}`;
        if (T.sub === 'intro') return `
            <p class="setup-p">${tr('SETUP_CAL_INTRO')}</p>
            <p class="setup-p sub">${tr('SETUP_CAL_INTRO_2')}${s.tt > 0 ? ' ' + tr('SETUP_CAL_TILT_AFTER') : ''}</p>
            <div class="setup-actions"><button type="button" onclick="shadeSetup.go('up')">${tr('BT_BEGIN')}</button></div>
            <button type="button" class="setup-link setup-start" onclick="shadeSetup.go('manual')">${tr('SETUP_CAL_KNOWN')}</button>`;
        if (T.sub === 'manual') {
            const v = (d, f) => { if (f === 'slack') { const x = this.slackOf('dz' + d); return x ? x / 1000 : ''; } const k = M[f === 'mid' ? 'm' + d : d]; return k ? k.final / 1000 : ''; };
            const field = (id, label, val) => this.timeField(id, label, val);
            // Rangée en <div> : un <label> ferait basculer le Oui/Non au clic sur le texte.
            const opt = (key, lbl, desc) => `<div class="gen-row"><span class="gen-row-text"><b>${tr(lbl)}</b><span>${tr(desc)}</span></span>
                <span class="gen-seg gen-seg-bool"><input type="checkbox" aria-label="${escAttr(tr(lbl))}"${s[key] ? ' checked' : ''} onchange="shadeSetup.manToggle('${key}', this.checked)"><span class="gen-seg-yes">${tr('BT_YES')}</span><span class="gen-seg-no">${tr('BT_NO')}</span></span></div>`;
            return `
            <div class="setup-fields">${field('setupUpT', this.t('SETUP_TIME_OF', { what: W.upN }), v('up', 'final'))}${field('setupDownT', this.t('SETUP_TIME_OF', { what: W.downN }), v('down', 'final'))}</div>
            ${this.slackOk() ? `${opt('dzManual', 'SETUP_DEADTIME', 'DEVICE_DEADZONE_DESC')}
            ${s.dzManual ? `<div class="setup-fields">${field('setupDzUp', tr('DEVICE_DEADZONE_UP'), v('up', 'slack'))}${field('setupDzDown', tr('DEVICE_DEADZONE_DOWN'), v('down', 'slack'))}</div>` : ''}` : ''}
            ${this.curveOk() ? `${opt('midManual', 'DEVICE_MIDCOURSE', 'DEVICE_MIDCOURSE_DESC')}
            ${s.midManual ? `<div class="setup-fields">${field('setupMidUp', tr('DEVICE_MIDCOURSE_UP'), v('up', 'mid'))}${field('setupMidDown', tr('DEVICE_MIDCOURSE_DOWN'), v('down', 'mid'))}</div>` : ''}` : ''}
            <div class="setup-err" id="setupManErr"></div>
            <div class="setup-actions"><button type="button" class="btn-success" onclick="shadeSetup.manual()">${tr('SETUP_VALIDATE')}</button></div>`;
        }
        if (T.sub === 'dzq') return `${cells}
            <p class="setup-p"><b>${tr('SETUP_DZ_Q')}</b></p>
            <p class="setup-p sub">${this.t('SETUP_DZ_EXPLAIN', { theUp: W.theUp, theDown: W.theDown })}</p>
            <p class="setup-p sub">${tr('SETUP_DZ_WHY')}</p>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('dzup')">${tr('SETUP_DZ_YES')}</button><button type="button" onclick="shadeSetup.afterDz()">${tr('SETUP_DZ_NO')}</button></div>`;
        if (T.sub === 'midq') {
            const has = M.mup || M.mdown;
            return `${cells}
            <p class="setup-p"><b>${tr('SETUP_MID_Q')}</b></p>
            <p class="setup-p sub">${this.t('SETUP_MID_EXPLAIN', { open: W.open })}</p>
            <p class="setup-p sub">${tr('SETUP_MID_LATER')}</p>
            ${has ? `<div class="setup-intermark">${this.t('SETUP_MID_CUR', { up: M.mup ? this.fmt(M.mup.final) : '—', down: M.mdown ? this.fmt(M.mdown.final) : '—' })}</div>` : ''}
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.midStart()">${tr(has ? 'SETUP_REMEASURE' : 'SETUP_MID_YES')}</button><button type="button" onclick="shadeSetup.finishCal()">${tr(has ? 'SETUP_VALIDATE' : 'SETUP_DZ_NO')}</button></div>
            ${has ? `<button type="button" class="setup-link setup-start" onclick="shadeSetup.midClear()">${tr('SETUP_MID_CLEAR')}</button>` : ''}`;
        }
        if (T.sub === 'mup' || T.sub === 'mdown') return this.bodyMid(T, cells);
        const sub = T.sub, up = this.dirOf(sub) === 'up', dz = sub.startsWith('dz'), run = !!s.timer, k = M[sub];
        const interLbl = tr(up ? 'CAL_MARK_MOVING' : 'CAL_MARK_TOUCHES');
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
            <button type="button" class="setup-link setup-start" onclick="shadeSetup.cancel()">${tr('SETUP_CANCEL_MEASURE')}</button>
            ${dz ? '' : `<button type="button" class="setup-link setup-start" onclick="shadeSetup.runToManual()">${tr('SETUP_CAL_KNOWN_RUN')}</button>`}`;
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
    // L'équipement roule peut-être : on l'arrête avant d'ouvrir la saisie des temps.
    runToManual() { this.stopTimer(); this.stopMotor(); this.go(this.s.tasks[this.s.cur].id === 'tilt' ? 'tmanual' : 'manual'); }
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
        if (sub === 'dzdown') return this.afterDz();
        if (sub === 'mdown') return this.finishCal();
        if (sub === 'down' && !this.slackOk()) return this.afterDz();
        if (sub === 'tdown') return this.finishTilt();
        this.go({ up: 'down', down: 'dzq', dzup: 'dzdown', mup: 'mdown', tup: 'tdown' }[sub]);
    }
    // « Pas de temps mort dans ce sens » : la mesure simple de ce sens reste valable.
    noDz() {
        const sub = this.s.tasks[this.s.cur].sub;
        delete this.s.marks[sub];
        if (sub === 'dzup') this.go('dzdown');
        else this.afterDz();
    }
    // ---------- Réglage fin : passage à mi-course (vitesse variable d'un tablier enroulé) ----------
    curveOk() { return SETUP_CURVE_TYPES.includes(this.s.shade.shadeType); }
    // Un tassement déjà enregistré reste visible sur tout type : on doit pouvoir le retirer.
    slackOk() { const sh = this.s.shade; return SETUP_SLACK_TYPES.includes(sh.shadeType) || !!(sh.slackUp || sh.slackDown); }
    afterDz() { if (this.curveOk()) this.go('midq'); else this.finishCal(); }
    // Fenêtre où la mi-course a un sens, en ms depuis le départ du moteur : la course utile.
    midBounds(sub) {
        const d = this.dirOf(sub), b = this.best(d), k = this.s.marks[b];
        if (!k) return [0, SETUP_MAX_MS];
        const slack = this.slackOf(b);
        return d === 'up' ? [slack, k.final] : [0, k.final - slack];
    }
    midOf(d) {
        const k = this.s.marks['m' + d];
        if (!k) return 0;
        const [lo, hi] = this.midBounds('m' + d);
        return k.final > lo && k.final < hi ? k.final : 0;
    }
    midStart() { delete this.s.marks.mup; delete this.s.marks.mdown; this.go('mup'); }
    midClear() { delete this.s.marks.mup; delete this.s.marks.mdown; this.s.midManual = false; this.finishCal(); }
    // Le moteur n'est pas arrêté : l'équipement finit sa course en butée, position connue.
    midMark() {
        const s = this.s, sub = s.tasks[s.cur].sub, el = Date.now() - s.t0, [lo, hi] = this.midBounds(sub);
        this.stopTimer();
        if (el <= lo || el >= hi) { s.err = tr('ERR_MIDCOURSE_INVALID'); return this.render(); }
        s.marks[sub] = { inter: null, final: el };
        s.midManual = true;
        this.render();
    }
    bodyMid(T, cells) {
        const s = this.s, W = s.W, up = T.sub === 'mup', k = s.marks[T.sub], btn = tr('SETUP_MID_MARK');
        const instr = this.t('SETUP_MID_INSTR', { pos: up ? W.closed : W.open, btn });
        if (s.timer) return `${cells}
            <p class="setup-p">${instr}</p>
            ${this.chronoHtml(true)}
            <button type="button" class="btn-success" onclick="shadeSetup.midMark()">${btn}</button>
            <button type="button" class="setup-link setup-start" onclick="shadeSetup.cancel()">${tr('SETUP_CANCEL_MEASURE')}</button>`;
        if (k) return `${cells}
            <div class="setup-marks"><p class="setup-p sub">${tr('CAL_ADJUST_INTRO')}</p>${this.rowAdj(tr('SETUP_MID_TIME'), 'final', k.final)}</div>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.redo()">${tr('CAL_BTN_REDO')}</button><button type="button" onclick="shadeSetup.next()">${up ? this.t('SETUP_MID_NEXT', { what: W.downN }) : tr('SETUP_VALIDATE_TIMES')}</button></div>`;
        return `${cells}
            <p class="setup-p">${instr}</p>
            ${this.chronoHtml(false)}
            ${s.err ? `<div class="setup-err">${s.err}</div>` : ''}
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.sendCmd('${up ? 'Down' : 'Up'}')">${this.t('SETUP_FIRST', { cmd: up ? W.down : W.up })}</button><button type="button" onclick="shadeSetup.start()">${tr('BT_START')}</button></div>`;
    }
    finishCal() {
        const M = this.s.marks, bu = this.best('up'), bd = this.best('down');
        const fields = { upTime: M[bu].final, downTime: M[bd].final, slackUp: this.slackOf(bu), slackDown: this.slackOf(bd), upMidTime: this.midOf('up'), downMidTime: this.midOf('down') };
        Object.assign(this.s.shade, fields);
        const part = (b) => this.fmt(M[b].final) + (this.slackOf(b) ? ' · ' + this.t('SETUP_S_DEADZONE', { t: this.fmt(this.slackOf(b)) }) : '');
        this.complete(fields, `${part(bu)} / ${part(bd)}${fields.upMidTime || fields.downMidTime ? ' · ' + tr('SETUP_S_MIDCURVE') : ''}`);
    }
    // Une case cochée redessine la saisie : ce qui est déjà tapé est repris tel quel.
    manToggle(key, on) {
        const ids = ['#setupUpT', '#setupDownT', '#setupDzUp', '#setupDzDown', '#setupMidUp', '#setupMidDown'], keep = {};
        ids.forEach(id => { const e = this.$(id); if (e) keep[id] = e.value; });
        this.s[key] = on;
        this.render();
        Object.keys(keep).forEach(id => { const e = this.$(id); if (e) e.value = keep[id]; });
    }
    manual() {
        const s = this.s, num = id => { const e = this.$(id); return e && e.value !== '' ? Math.round(parseFloat(String(e.value).replace(',', '.')) * 1000) : 0; };
        const u = num('#setupUpT'), d = num('#setupDownT'), su = s.dzManual ? num('#setupDzUp') : 0, sd = s.dzManual ? num('#setupDzDown') : 0;
        const err = this.$('#setupManErr');
        if (!(u >= SETUP_MIN_MS && u <= SETUP_MAX_MS) || !(d >= SETUP_MIN_MS && d <= SETUP_MAX_MS)) { err.textContent = tr('SETUP_ERR_TIMES'); return; }
        if (isNaN(su) || isNaN(sd) || su < 0 || sd < 0) { err.textContent = tr('ERR_DEADZONE_INVALID'); return; }
        if (u - su < SETUP_MIN_MS || d - sd < SETUP_MIN_MS) { err.textContent = tr('ERR_DEADZONE_TOO_LONG'); return; }
        const mid = s.midManual && this.curveOk(), mu = mid ? num('#setupMidUp') : 0, md = mid ? num('#setupMidDown') : 0;
        if (isNaN(mu) || isNaN(md) || (mu && !(mu > su && mu < u)) || (md && !(md > 0 && md < d - sd))) { err.textContent = tr('ERR_MIDCOURSE_INVALID'); return; }
        // Grandeurs dérivées saisies directement : on reconstruit des repères équivalents.
        s.marks = { up: { inter: null, final: u }, down: { inter: null, final: d } };
        if (su) s.marks.dzup = { inter: su, final: u };
        if (sd) s.marks.dzdown = { inter: d - sd, final: d };
        if (mu) s.marks.mup = { inter: null, final: mu };
        if (md) s.marks.mdown = { inter: null, final: md };
        this.finishCal();
    }

    // ---------- Lames ----------
    bodyTilt(T) {
        const s = this.s, M = s.marks, up = T.sub === 'tup', k = M[T.sub], run = !!s.timer, integ = s.tt === 2;
        const instr = tr(up ? (integ ? 'CAL_TILT_UP_INSTRUCTION_INTEGRATED' : 'CAL_TILT_UP_INSTRUCTION') : (integ ? 'CAL_TILT_DOWN_INSTRUCTION_INTEGRATED' : 'CAL_TILT_DOWN_INSTRUCTION'));
        const cells = `<div class="setup-meas"><div class="${T.sub === 'tup' ? 'cur' : ''}">${tr('SETUP_TILT_OPEN')}<b>${M.tup ? this.fmt(M.tup.final) : '—'}</b></div><div class="${T.sub === 'tdown' ? 'cur' : ''}">${tr('SETUP_TILT_CLOSE')}<b>${M.tdown ? this.fmt(M.tdown.final) : '—'}</b></div></div>`;
        if (T.sub === 'view') return `${cells}
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.go('tmanual')">${tr('SETUP_EDIT_TIMES')}</button><button type="button" onclick="shadeSetup.remeasure()">${tr('SETUP_REMEASURE')}</button></div>`;
        if (T.sub === 'tmanual') return `
            <div class="setup-fields">${this.timeField('setupTiltUp', tr('SETUP_TILT_OPEN') + ' (s)', M.tup ? M.tup.final / 1000 : '')}${this.timeField('setupTiltDown', tr('SETUP_TILT_CLOSE') + ' (s)', M.tdown ? M.tdown.final / 1000 : '')}</div>
            <div class="setup-err" id="setupManErr"></div>
            <div class="setup-actions"><button type="button" class="btn-success" onclick="shadeSetup.tiltManual()">${tr('SETUP_VALIDATE')}</button></div>`;
        if (run) return `${cells}
            <p class="setup-p">${instr}</p>
            ${this.chronoHtml(true)}
            <button type="button" class="btn-success" onclick="shadeSetup.stop()">${tr('BT_STOP')}</button>
            <button type="button" class="setup-link setup-start" onclick="shadeSetup.cancel()">${tr('SETUP_CANCEL_MEASURE')}</button>
            <button type="button" class="setup-link setup-start" onclick="shadeSetup.runToManual()">${tr('SETUP_CAL_KNOWN_RUN')}</button>`;
        if (k) return `${cells}
            <div class="setup-marks"><p class="setup-p sub">${tr('CAL_ADJUST_INTRO')}</p>${this.rowAdj(tr('CAL_RESULT_LABEL'), 'final', k.final)}</div>
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.redo()">${tr('CAL_BTN_REDO')}</button><button type="button" onclick="shadeSetup.next()">${up ? this.t('SETUP_MEASURE_NEXT', { what: tr('SETUP_TILT_CLOSE').toLowerCase() }) : tr('SETUP_VALIDATE')}</button></div>`;
        return `${cells}
            ${up ? `<p class="setup-p sub">${tr(integ ? 'SETUP_TILT_INTRO_INTEGRATED' : 'SETUP_TILT_INTRO')}</p>` : ''}
            <p class="setup-p">${instr}</p>
            ${this.chronoHtml(false)}
            ${s.err ? `<div class="setup-err">${s.err}</div>` : ''}
            <div class="setup-actions"><button type="button" line onclick="shadeSetup.sendTilt('${up ? 'Down' : 'Up'}')">${tr(up ? 'CAL_TILT_UP_PREP' : 'CAL_TILT_DOWN_PREP')}</button><button type="button" onclick="shadeSetup.start()">${tr('BT_START')}</button></div>
            ${up ? `<button type="button" class="setup-link setup-start" onclick="shadeSetup.go('tmanual')">${tr('SETUP_CAL_KNOWN')}</button>` : ''}`;
    }
    tiltManual() {
        const num = id => { const e = this.$(id); return e && e.value !== '' ? Math.round(parseFloat(String(e.value).replace(',', '.')) * 1000) : 0; };
        const u = num('#setupTiltUp'), d = num('#setupTiltDown');
        if (!(u >= SETUP_MIN_MS && u <= SETUP_MAX_MS) || !(d >= SETUP_MIN_MS && d <= SETUP_MAX_MS)) { this.$('#setupManErr').textContent = tr('SETUP_ERR_TILT_TIMES'); return; }
        Object.assign(this.s.marks, { tup: { inter: null, final: u }, tdown: { inter: null, final: d } });
        this.finishTilt();
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
    timesOk() { return !!(this.s.shade.setupSteps & SETUP_BIT.cal) || this.s.tasks.some(T => T.id === 'cal' && T.state === 'done'); }
    optsReady() {
        const s = this.s, timesOk = this.timesOk();
        const myReady = !s.supportsMy || s.my === 'oui' || (s.my === 'non' && (s.myMode === 'none' || s.myStep === 'learned' || (!!s.myMode && !timesOk)));
        return { my: myReady, sun: !s.st.sun || !!s.sun, all: myReady && (!s.st.sun || !!s.sun) };
    }
    // wiz : dans l'assistant, chaque question devient une tuile et « Terminer » est au pied.
    bodyOpts(wiz) {
        const s = this.s, W = s.W;
        const chip = (key, val, lbl) => `<div class="setup-chip${s[key] === val ? ' sel' : ''}" onclick="shadeSetup.opt('${key}','${val}')">${lbl}</div>`;
        // Pas de temps de course, pas de conversion « arrêt au bout de 4 s » -> pourcentage.
        const useful = (s.shade.downTime || 0) - (s.shade.slackDown || 0);
        const timesOk = this.timesOk();
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
        const rd = this.optsReady(), myReady = rd.my, sunReady = rd.sun;
        // Le rappel reste sous la question tant qu'elle bloque « Valider » : sur mobile, le bouton est loin.
        const req = `<div class="setup-warn">${tr('SETUP_ANSWER_REQUIRED')}</div>`;
        let h = '';
        if (s.supportsMy) h += `<div class="setup-optq"><div class="setup-q2">${tr('SETUP_MY_Q')}</div>
            <p class="setup-p sub">${tr('SETUP_MY_DESC')}</p>${myReady ? '' : req}
            <div class="setup-chips">${chip('my', 'oui', tr('BT_YES'))}${chip('my', 'non', tr('BT_NO'))}${chip('my', 'nsp', tr('SETUP_DONT_KNOW'))}</div>
            ${s.my === 'nsp' ? `<p class="setup-p sub">${tr('SETUP_MY_CHECK')}</p>
                <div class="setup-actions"><button type="button" line onclick="shadeSetup.cmd('My')">■ My</button></div>
                <div class="setup-chips">${chip('my', 'oui', tr('SETUP_MY_WENT'))}${chip('my', 'non', tr('SETUP_MY_STILL'))}</div>` : ''}
            ${my}</div>`;
        if (s.myOnly) return h;
        if (s.st.sun) h += `<div class="setup-optq"><div class="setup-q2">${tr('SETUP_SUN_Q')}</div>
            <p class="setup-p sub">${tr('SETUP_SUN_DESC')}</p>${sunReady ? '' : req}
            <div class="setup-chips">${chip('sun', 'oui', tr('BT_YES'))}${chip('sun', 'non', tr('BT_NO'))}</div></div>`;
        if (!s.isToggle) h += `<div class="setup-optq"><div class="setup-q2">${tr('SETUP_POS_Q')}</div>
            <p class="setup-p sub">${tr('SETUP_POS_DESC')}</p>
            <div class="setup-chips">${chip('posq', 'closed', tr('IS_CLOSED'))}${chip('posq', 'open', tr('IS_OPEN'))}</div></div>`;
        h += `<div class="setup-optq"><div class="setup-q2">${tr('SETUP_REACH_Q')}</div>
            <p class="setup-p sub">${tr('SETUP_REACH_DESC')}</p>
            ${(() => {
                // Équipement : le nombre exact (1 à 20) plutôt que Normale/Renforcée.
                const opts = Array.from({ length: 20 }, (_, i) => i + 1).map(v => `<option value="${v}"${s.rep === v ? ' selected' : ''}>${tr(`OPT_${v}TIME`)}</option>`).join('');
                const sel = `<select class="${wiz ? 'gen-input' : 'inputAndSelect'}" aria-label="${escAttr(tr('REPEAT_COMMANDS'))}" onchange="shadeSetup.setRep(parseInt(this.value, 10))">${opts}</select>`;
                return wiz ? `<div class="gen-input-box">${sel}</div>` : sel;
            })()}</div>`;
        if (this.hasLed()) h += `<div class="setup-optq"><div class="setup-q2">${tr({ 'BOX-WIFI': 'SETUP_LED_Q_BOX_WIFI', 'BOX-ETH': 'SETUP_LED_Q_BOX_ETH' }[window.__hardwareProfile] || 'SETUP_LED_Q')}</div>
            <div class="setup-chips">${chip('led', 'oui', tr('BT_YES'))}${chip('led', 'non', tr('BT_NO'))}</div></div>`;
        if (wiz) return h;
        return `${h}<div class="setup-actions"><button type="button"${rd.all ? '' : ' disabled class="disabled"'} onclick="shadeSetup.optsDone()">${tr('SETUP_VALIDATE')}</button></div>`;
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
    myDone(pos) { this.s.myPos = pos; this.s.myStep = 'learned'; this.s.changed = true; this.render(); }
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
    setRep(v) { this.s.rep = v; this.render(); }
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
        fields.repeats = s.rep;
        if (s.rep > 1) parts.push(this.t('SETUP_S_REPEATS', { n: s.rep }));
        if (this.hasLed()) {
            fields.ledFeedback = s.led === 'oui';
            if (fields.ledFeedback) parts.push(tr('SETUP_S_LED'));
        }
        this.complete(fields, parts.join(' · ') || tr('SETUP_S_REACH_NORMAL'));
    }
}
var shadeSetup = new ShadeSetup();
