class GroupSetup {
    t(key, vars) { let s = tr(key); Object.keys(vars || {}).forEach(k => { s = s.split(`{${k}}`).join(vars[k]); }); return s; }
    hasLed() { return typeof window.__ledPin === 'number' && window.__ledPin >= 0; }
    icoOf(shade) { return (somfy.shadeTypes.find(x => x.type === shade.shadeType) || {}).indic || 'svg-indicShutter'; }
    $(sel) { return this.div ? this.div.querySelector(sel) : null; }

    mount(title, sub, menu) {
        get('divShadeSetup')?.remove();
        const div = document.createElement('div');
        div.className = 'inst-overlay';
        div.id = 'divShadeSetup';
        div.innerHTML = `<div class="instructions-content">
            ${overlayHeader(title, '', 'svg-group', menu ? { subtitle: title, menu } : { subtitle: title })}
            <div class="overlay-scroll-content"><div class="setup-body"></div></div>
            <div class="hrDivFooter-Instruc"></div>
            <div class="button-container-overlay setup-foot"></div></div>`;
        this.div = div;
        div._onClosed = () => { if (this.div === div) this.onClose(); };
        this.head(tr(title), sub);
        shOverlay(div);
    }
    head(title, sub) {
        const t = this.$('.overlayHeader-title'), u = this.$('.overlayHeader-subtitle');
        if (t) t.textContent = title;
        if (u) u.textContent = sub;
    }
    close() { if (this.div) requestCloseOverlay(this.div); }
    onClose() {
        const s = this.s, cb = s && s.changed ? s.onDone : null;
        if (s && s.changed) somfy.updateGroupList();
        this.c = this.s = this.div = this.w = null;
        if (typeof cb === 'function') cb();
    }

    // ---------- Assistant de création : 4 étapes dans la coque wiz- (overlays.css) ----------
    // Nom et pièce → équipements → liaison un par un → options. Le groupe est créé en quittant
    // l'étape 2 : la liaison a besoin de son adresse. Les étapes de liaison réutilisent
    // openMemory / holdStart / confirmLink du mode « une tâche » (fiche du groupe).
    open() {
        if (somfy.groups?.length >= 14) return ui.errorMessage(get('divSomfySettings'), tr('ERR_GROUP_LIMIT_REACHED'));
        getJSONSync('/getNextGroup', (err, next) => {
            if (err) return ui.serviceError(err);
            this.s = null;
            this.c = { name: '', roomId: 0, members: [], addr: next.remoteAddress, bits: next.bitLength || 56, proto: next.proto || 0 };
            this.w = { step: 0 };
            this.mountWiz();
            this.renderWiz();
        });
    }
    mountWiz() {
        get('divGroupSetup')?.remove();
        const div = document.createElement('div');
        div.id = 'divGroupSetup';
        div.className = 'modal-overlay genmod-overlay wiz-overlay';
        div.innerHTML = `<div class="message-content wiz-window">
            <aside class="wiz-side">
            <div class="wiz-side-head"><h2 class="wiz-title">${tr('GSETUP_TITLE')}</h2>
            <button type="button" class="wiz-close" data-wiz-close aria-label="${escAttr(tr('BT_CLOSE'))}"><svg><use href="#svg-close"></use></svg></button></div>
            <ol class="wiz-steps"></ol>
            <div class="wiz-sum"><span class="wiz-sum-icon"><svg><use href="#svg-group"></use></svg></span><span class="wiz-sum-text"><b></b><span></span></span></div>
            </aside>
            <section class="wiz-main"></section>
            <footer class="wiz-foot"></footer></div>`;
        this.div = div;
        div._onClosed = () => { if (this.div === div) this.onClose(); };
        div.onclick = (e) => { if (e.target.closest('[data-wiz-close]')) this.close(); };
        shOverlay(div);
    }
    // keepMain : appelé pendant la frappe du nom, on ne redessine que la colonne et le pied.
    renderWiz(keepMain) {
        const c = this.c, s = this.s, step = this.w.step, name = c.name.trim();
        const links = s ? s.tasks : [];
        const linked = links.filter(T => T.state === 'done').length;
        const n = c.members.length;
        const steps = [
            ['GSETUP_W_STEP_NAME', name || tr('GSETUP_W_TO_CHOOSE')],
            ['GSETUP_W_STEP_DEVICES', tr('GSETUP_W_CHOSEN').replace('{N}', n)],
            ['GSETUP_W_STEP_LINK', tr('GSETUP_W_LINKED').replace('{N}', linked).replace('{T}', n)],
            ['GSETUP_W_STEP_OPTS', tr('GSETUP_W_OPTS_DESC')]
        ];
        this.$('.wiz-steps').innerHTML = steps.map(([k, d], i) => `<li class="wiz-step${i === step ? ' on' : i < step ? ' done' : ''}">
            <span class="wiz-step-n">${i < step ? '<svg><use href="#svg-check"></use></svg>' : i + 1}</span>
            <span class="wiz-step-text"><b>${tr(k)}</b><small>${escHtml(d)}</small></span></li>`).join('');
        this.$('.wiz-sum-text b').textContent = name || tr('GSETUP_W_NEW');
        this.$('.wiz-sum-text span').textContent = tr('GSETUP_W_COUNT').replace('{N}', n);
        const kick = tr('GSETUP_W_KICK').replace('{N}', step + 1);
        const head = (title, extra = '') => `<div class="wiz-head"><div class="wiz-kick">${kick}${extra}</div><h2 class="wiz-h">${title}</h2></div>`;
        const main = keepMain ? document.createElement('section') : this.$('.wiz-main');
        let ok = true, hint = '';
        if (step === 0) {
            const rooms = _rooms.map(r => `<option value="${r.roomId}"${r.roomId === c.roomId ? ' selected' : ''}>${escHtml(r.name)}</option>`).join('');
            main.innerHTML = `${head(tr('GSETUP_W_NAME_H'))}
            <div class="wiz-grid">
            <div class="gen-tile"><div class="gen-field"><label class="gen-field-label" for="gsetupName">${tr('NAME')}</label>
              <div class="gen-input-box"><input id="gsetupName" class="gen-input" maxlength="20" placeholder="${escAttr(tr('ENTER_NAME'))}" value="${escAttr(c.name)}" oninput="groupSetup.c.name = this.value; groupSetup.renderWiz(true)"></div></div></div>
            <div class="gen-tile"><div class="gen-field"><label class="gen-field-label" for="gsetupRoom">${tr('ROOM')}</label>
              <div class="gen-input-box"><select id="gsetupRoom" class="gen-input" onchange="groupSetup.c.roomId = parseInt(this.value, 10)">${rooms}</select></div></div>
              <p class="gen-tile-desc">${tr('GSETUP_ADV_NOTE')}</p></div>
            </div>
            <details class="wiz-adv"><summary>${tr('SETUP_ADVANCED')}<span>${somfy.frameProtoLabel(c.proto)} · ${c.bits} bits · ID ${c.addr}</span></summary>
              <div class="wiz-grid">
              <div class="gen-field"><label class="gen-field-label" for="gsetupBits">${tr('BIT')}</label><div class="gen-input-box"><select id="gsetupBits" class="gen-input" onchange="groupSetup.c.bits = parseInt(this.value, 10)">${[56, 80].map(v => `<option value="${v}"${c.bits === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div></div>
              <div class="gen-field"><label class="gen-field-label" for="gsetupAddr">${tr('GROUP_ID')}</label><div class="gen-input-box"><input id="gsetupAddr" class="gen-input" type="number" min="1" max="16777215" value="${c.addr}" oninput="groupSetup.c.addr = parseInt(this.value, 10)"></div></div>
              </div></details>`;
            ok = name.length > 0 && c.name.length <= 20;
            if (!ok) hint = tr('GSETUP_W_HINT_NAME');
        } else if (step === 1) {
            const shades = somfy.shades || [];
            main.innerHTML = `${head(tr('GSETUP_MEMBERS_Q'))}<p class="wiz-lead">${tr(shades.length ? 'GSETUP_MEMBERS_DESC' : 'GSETUP_NO_DEVICE')}</p>
            <div class="wiz-grid">${shades.map(sh => {
                const on = c.members.includes(sh.shadeId), off = !sh.paired;
                return `<button type="button" class="wiz-check${on ? ' on' : ''}" ${off ? 'disabled' : ''} aria-pressed="${on}" onclick="groupSetup.toggle(${sh.shadeId})">
                <span class="wiz-check-icon"><svg><use href="#${this.icoOf(sh)}"></use></svg></span>
                <span class="wiz-check-text"><b>${escHtml(sh.name)}</b><small>${escHtml(off ? tr('GSETUP_S_UNPAIRED') : `${tr(somfy.shadeTypeKey(sh.shadeType) || 'SETUP_S_PAIRED')} · ${somfy._cfgRoomName(sh.roomId)}`)}</small></span>
                <span class="wiz-check-box"><svg><use href="#svg-check"></use></svg></span></button>`;
            }).join('')}</div>`;
            ok = n > 0;
            if (!ok) hint = tr('GSETUP_W_HINT_DEVICES');
        } else if (step === 2) {
            const T = s.tasks[s.cur];
            const progress = `<div class="gen-tile"><h3 class="gen-tile-title">${tr('GSETUP_W_PROGRESS')}</h3>${links.map((L, k) => {
                const st = L.state === 'done' ? 'done' : L.state === 'skipped' ? 'skipped' : k === s.cur ? 'cur' : '';
                return `<div class="wiz-task ${st}"><span class="wiz-task-n">${st === 'done' ? '<svg><use href="#svg-check"></use></svg>' : k + 1}</span><b>${escHtml(L.name)}</b><span>${tr({ done: 'GSETUP_S_LINKED', skipped: 'GSETUP_W_S_SKIPPED', cur: 'GSETUP_W_S_CUR' }[st] || 'SETUP_S_TODO')}</span></div>`;
            }).join('')}</div>`;
            if (T) {
                const nm = escHtml(T.name), memOk = T.sub === 'grp' || T.sub === 'grpq';
                const memBody = T.sub === 'mem' ? `<p class="gen-tile-desc">${tr('GSETUP_MEM_DESC')}</p><div class="gen-btn-row"><button type="button" class="gen-btn gen-btn-primary" onclick="groupSetup.openMemory()">${tr('GSETUP_MEM_BTN')}</button></div>`
                    : T.sub === 'memq' ? `<p class="wiz-q">${this.t('GSETUP_MEM_Q', { name: nm })}</p><div class="gen-btn-row"><button type="button" class="gen-btn" onclick="groupSetup.sub('memno')">${tr('BT_NO')}</button><button type="button" class="gen-btn gen-btn-primary" onclick="groupSetup.sub('grp')">${tr('BT_YES')}</button></div>`
                    : T.sub === 'memno' ? `<p class="wiz-warn">${this.t('GSETUP_MEM_NO', { name: nm })}</p><div class="gen-btn-row"><button type="button" class="gen-btn" onclick="groupSetup.sub('mem')">${tr('BT_RETRY')}</button><button type="button" class="gen-btn" onclick="groupSetup.sub('grp')">${tr('GSETUP_MEM_OTHER')}</button></div>`
                    : `<p class="wiz-ok"><svg><use href="#svg-check"></use></svg>${tr('GSETUP_MEM_OK')}</p>`;
                const grpBody = T.sub === 'grpq' ? `<p class="wiz-q">${this.t('GSETUP_GRP_Q', { name: nm })}</p><div class="gen-btn-row"><button type="button" class="gen-btn" onclick="groupSetup.sub('grp')">${tr('SETUP_RETRY_NO')}</button><button type="button" class="gen-btn gen-btn-primary" onclick="groupSetup.confirmLink()">${tr('GSETUP_GRP_YES')}</button></div>`
                    : `<p class="gen-tile-desc">${tr('GSETUP_GRP_DESC')}</p><div class="gen-btn-row"><button type="button" id="btnGsetupHold" class="gen-btn gen-btn-primary"${memOk ? '' : ' disabled'} onmousedown="groupSetup.holdStart(event)" ontouchstart="event.preventDefault(); groupSetup.holdStart()" onmouseup="groupSetup.holdEnd(event)" ontouchend="groupSetup.holdEnd()">${tr('GSETUP_GRP_BTN')}</button></div>`;
                main.innerHTML = `${head(this.t('GSETUP_T_LINK', { name: nm }), ' · ' + tr('GSETUP_W_LINK_POS').replace('{I}', s.cur + 1).replace('{T}', links.length))}
                <div class="wiz-grid">
                <div class="gen-tile"><h3 class="gen-tile-title">${this.t('GSETUP_MEM_TITLE', { name: nm })}</h3>${memBody}</div>
                <div class="gen-tile"><h3 class="gen-tile-title">${tr('GSETUP_GRP_TITLE')}</h3>${grpBody}</div>
                </div>${progress}`;
            } else main.innerHTML = `${head(tr('GSETUP_W_STEP_LINK'))}${progress}`;
            ok = !T;
            if (!ok) hint = tr('GSETUP_W_HINT_LINK');
        } else {
            const all = links.every(T => T.state === 'done'), gname = escHtml(s.group.name);
            const seg = (k, opts) => `<span class="gen-seg">${opts.map(([v, l]) => `<button type="button" class="wiz-opt${s[k] === v ? ' on' : ''}" aria-pressed="${s[k] === v}" onclick="groupSetup.opt('${k}','${v}')">${tr(l)}</button>`).join('')}</span>`;
            const led = this.hasLed() ? `<div class="gen-tile"><h3 class="gen-tile-title">${tr('LED_FEEDBACK')}</h3><p class="gen-tile-desc">${tr({ 'BOX-WIFI': 'GSETUP_LED_Q_BOX_WIFI', 'BOX-ETH': 'GSETUP_LED_Q_BOX_ETH' }[window.__hardwareProfile] || 'GSETUP_LED_Q')}</p>${seg('led', [['oui', 'BT_YES'], ['non', 'BT_NO']])}</div>` : '';
            main.innerHTML = `${head(this.t(all ? 'GSETUP_READY' : 'GSETUP_CREATED', { name: gname }))}
            <p class="${all ? 'wiz-ok' : 'wiz-warn'}">${all ? '<svg><use href="#svg-check"></use></svg>' : ''}${tr(all ? 'GSETUP_READY_DESC' : 'GSETUP_PARTIAL_DESC')}</p>
            <div class="wiz-grid">
            <div class="gen-tile"><h3 class="gen-tile-title">${tr('GSETUP_FLIP_Q')}</h3><p class="gen-tile-desc">${tr('GSETUP_FLIP_DESC')}</p>${seg('flip', [['normal', 'GSETUP_FLIP_NORMAL'], ['inv', 'GSETUP_FLIP_INV']])}</div>
            <div class="gen-tile"><h3 class="gen-tile-title">${tr('SETUP_REACH_Q')}</h3><p class="gen-tile-desc">${tr('GSETUP_REACH_DESC')}</p>${seg('reach', [['normal', 'SETUP_REACH_NORMAL'], ['strong', 'SETUP_REACH_STRONG']])}</div>
            ${led}</div>`;
        }
        const created = !!s;
        const btn = (cls, attrs, key) => `<button type="button" class="gen-btn${cls}" ${attrs}>${tr(key)}</button>`;
        this.$('.wiz-foot').innerHTML = `${step === 1 ? btn('', 'onclick="groupSetup.wizStep(0)"', 'BT_GO_BACK') : ''}
            ${btn(' wiz-ghost', 'data-wiz-close', created ? 'SETUP_LATER' : 'BT_CANCEL')}
            <span class="wiz-foot-gap"></span><span class="wiz-foot-hint">${escHtml(hint)}</span>
            ${step === 2 && s.tasks[s.cur] ? btn('', 'onclick="groupSetup.skip()"', 'SETUP_SKIP') : ''}
            ${btn(' gen-btn-primary', `onclick="groupSetup.wizNext()"${ok ? '' : ' disabled'}`, step === 3 ? 'SETUP_FINISH' : 'BT_CONTINUE')}`;
    }
    wizStep(i) { this.w.step = i; this.renderWiz(); }
    wizNext() {
        const step = this.w.step;
        if (step === 0) return this.wizStep(1);
        if (step === 1) return this.create();
        if (step === 2) return this.wizStep(3);
        this.finishWiz();
    }
    toggle(id) {
        const m = this.c.members, i = m.indexOf(id);
        if (i >= 0) m.splice(i, 1); else m.push(id);
        if (m.length === 1 && i < 0) this.c.bits = (somfy.shades.find(x => x.shadeId === id) || {}).bitLength || this.c.bits;
        this.renderWiz();
    }
    create() {
        const c = this.c;
        if (isNaN(c.addr) || c.addr < 1 || c.addr > 16777215) return ui.errorMessage(tr('ERR_REMOTE_ADDRESS_INVALID'));
        const owner = somfy.remoteAddressOwner(c.addr, 255, NaN);
        if (owner) return ui.errorMessage(tr(owner.isGroup ? 'ERR_REMOTE_ADDRESS_USED_GROUP' : 'ERR_REMOTE_ADDRESS_USED_DEVICE').replace('{name}', escHtml(owner.name)));
        putJSONSync('/addGroup', { name: c.name.trim(), roomId: c.roomId, remoteAddress: c.addr, bitLength: c.bits, proto: c.proto }, (err, group) => {
            if (err) return ui.serviceError(err);
            if (!somfy.groups) somfy.groups = [];
            if (!somfy.groups.some(g => g.groupId === group.groupId)) somfy.groups.push(group);
            const tasks = c.members.map(id => {
                const sh = somfy.shades.find(x => x.shadeId === id);
                return { id: 'link', shadeId: id, name: sh ? sh.name : '', sub: 'mem', state: null };
            });
            this.s = { group, tasks, cur: 0, single: false, changed: true,
                flip: group.flipCommands ? 'inv' : 'normal', reach: (group.repeats ?? 1) > 1 ? 'strong' : 'normal', led: group.ledFeedback ? 'oui' : 'non' };
            this.wizStep(2);
        });
    }
    finishWiz() {
        const s = this.s, g = s.group, rep = g.repeats ?? 1, fields = { groupId: g.groupId, flipCommands: s.flip === 'inv' };
        fields.repeats = s.reach === 'strong' ? (rep > 1 ? rep : 3) : (rep > 1 ? 1 : rep);
        if (this.hasLed()) fields.ledFeedback = s.led === 'oui';
        putJSONSync('/saveGroup', fields, (err) => {
            if (err) return ui.serviceError(err);
            ui.successMessage(tr('MSG_ADD_SUCCESS'));
            this.closeDone();
        });
    }

    start(group, tasks, single, onDone) {
        this.w = null;
        this.s = { group, tasks, cur: 0, single, onDone, changed: !single,
            flip: group.flipCommands ? 'inv' : 'normal', reach: (group.repeats ?? 1) > 1 ? 'strong' : 'normal', led: group.ledFeedback ? 'oui' : 'non' };
        if (!this.div || !this.div.isConnected) this.mount('SETUP_RESUME_TITLE', '');
        this.head(tr('SETUP_RESUME_TITLE'), single ? group.name : this.t('GSETUP_STEP2_SUB', { name: group.name }));
        this.$('.overlayHeader-dropdown-container')?.remove();
        this.render();
    }
    runLink(groupId) {
        getJSONSync(`/groupOptions?groupId=${groupId}`, (err, data) => {
            if (err) return ui.serviceError(err);
            const avail = data.availShades || [];
            if (!avail.length) return ui.errorMessage(tr('ERR_NO_DEVICE_AVAILABLE_GROUP'));
            this.avail = avail;
            this.start(data, [{ id: 'pick', state: null }], true, () => somfy.openEditGroup(groupId));
        });
    }
    runUnlink(groupId, shadeId) {
        getJSONSync(`/group?groupId=${groupId}`, (err, group) => {
            if (err) return ui.serviceError(err);
            const sh = (group.linkedShades || []).find(x => x.shadeId === shadeId);
            if (!sh) return ui.errorMessage(tr('ERR_DEVICE_NOT_FOUND_GROUP'));
            this.start(group, [{ id: 'unlink', shadeId, name: sh.name, sub: 'mem', state: null }], true, () => somfy.openEditGroup(groupId));
        });
    }

    title(T) {
        if (T.id === 'link') return this.t('GSETUP_T_LINK', { name: escHtml(T.name) });
        if (T.id === 'unlink') return this.t('GSETUP_T_UNLINK', { name: escHtml(T.name) });
        if (T.id === 'pick') return tr('BT_LINK_DEVICE');
        return tr('OPTION');
    }
    render() {
        if (this.w) return this.renderWiz();
        const s = this.s;
        if (s.cur >= s.tasks.length) return s.single ? this.closeDone() : this.renderFinal();
        this.$('.setup-body').innerHTML = `<div class="setup-tasks">${s.tasks.map((T, k) => {
            const cls = k === s.cur ? 'active' : (T.state || '');
            const n = T.state === 'done' ? '<svg><use href="#svg-check"></use></svg>' : k + 1;
            const st = T.state === 'done' ? (T.note || '') : k === s.cur ? '' : tr('SETUP_S_TODO');
            const body = k === s.cur ? `<div class="setup-task-b">${this.body(T)}${s.single ? '' : `<div class="setup-nav"><span></span><button type="button" class="setup-link" onclick="groupSetup.skip()">${tr('SETUP_SKIP')}</button></div>`}</div>` : '';
            return s.single && k !== s.cur ? '' : `<div class="setup-task ${cls}${s.single ? ' setup-single' : ''}">${s.single ? '' : `<div class="setup-task-h"><div class="setup-task-n">${n}</div><div class="setup-task-t">${this.title(T)}</div><div class="setup-task-s">${st}</div></div>`}${body}</div>`;
        }).join('')}</div>`;
        this.$('.setup-foot').innerHTML = `<button type="button" line onclick="groupSetup.close()">${tr(s.single ? 'BT_CLOSE' : 'SETUP_LATER')}</button>`;
    }
    body(T) {
        if (T.id === 'pick') return this.bodyPick();
        if (T.id === 'opts') return this.bodyOpts();
        const name = escHtml(T.name), un = T.id === 'unlink';
        if (T.sub === 'mem') return `
            <p class="setup-p"><b>${this.t('GSETUP_MEM_TITLE', { name })}</b></p>
            <p class="setup-p sub">${tr(un ? 'GSETUP_MEM_DESC_UN' : 'GSETUP_MEM_DESC')}</p>
            <div class="setup-actions"><button type="button" onclick="groupSetup.openMemory()">${tr('GSETUP_MEM_BTN')}</button></div>`;
        if (T.sub === 'memq') return `
            <p class="setup-p">${this.t('GSETUP_MEM_Q', { name })}</p>
            <div class="setup-actions"><button type="button" line onclick="groupSetup.sub('memno')">${tr('BT_NO')}</button><button type="button" class="btn-success" onclick="groupSetup.sub('grp')">${tr('BT_YES')}</button></div>`;
        if (T.sub === 'memno') return `
            <div class="setup-warn">${this.t('GSETUP_MEM_NO', { name })}</div>
            <div class="setup-actions"><button type="button" line onclick="groupSetup.sub('mem')">${tr('BT_RETRY')}</button><button type="button" onclick="groupSetup.sub('grp')">${tr('GSETUP_MEM_OTHER')}</button></div>`;
        const ok = `<div class="setup-okline"><svg><use href="#svg-check"></use></svg><span>${tr('GSETUP_MEM_OK')}</span></div>`;
        if (T.sub === 'grp' && un) return `${ok}
            <p class="setup-p"><b>${tr('GSETUP_UNGRP_TITLE')}</b></p>
            <p class="setup-p sub">${tr('GSETUP_UNGRP_DESC')}</p>
            <div class="setup-actions"><button type="button" onclick="groupSetup.groupProgOnce()">${tr('GSETUP_UNGRP_BTN')}</button></div>`;
        if (T.sub === 'grp') return `${ok}
            <p class="setup-p"><b>${tr('GSETUP_GRP_TITLE')}</b></p>
            <p class="setup-p sub">${tr('GSETUP_GRP_DESC')}</p>
            <div class="setup-actions"><button type="button" id="btnGsetupHold" onmousedown="groupSetup.holdStart(event)" ontouchstart="event.preventDefault(); groupSetup.holdStart()" onmouseup="groupSetup.holdEnd(event)" ontouchend="groupSetup.holdEnd()">${tr('GSETUP_GRP_BTN')}</button></div>`;
        if (T.sub === 'grpq') return `
            <p class="setup-p">${this.t('GSETUP_GRP_Q', { name })}</p>
            <div class="setup-actions"><button type="button" line onclick="groupSetup.sub('grp')">${tr('SETUP_RETRY_NO')}</button><button type="button" class="btn-success" onclick="groupSetup.confirmLink()">${tr(un ? 'GSETUP_UNGRP_YES' : 'GSETUP_GRP_YES')}</button></div>`;
        return '';
    }
    bodyPick() {
        const opts = this.avail.map(sh => `<option value="${sh.shadeId}">${escHtml(sh.name)}</option>`).join('');
        return `<div class="uniRow"><div class="unifield-content"><label class="label" for="gsetupPick">${tr('GSETUP_PICK_Q')}</label>
            <select id="gsetupPick" class="inputAndSelect">${opts}</select></div></div>
            <div class="setup-actions"><button type="button" onclick="groupSetup.pick()">${tr('BT_NEXT')}</button></div>`;
    }
    pick() {
        const id = parseInt(this.$('#gsetupPick').value, 10), sh = this.avail.find(x => x.shadeId === id);
        this.s.tasks = [{ id: 'link', shadeId: id, name: sh ? sh.name : '', sub: 'mem', state: null }];
        this.render();
    }
    bodyOpts() {
        const s = this.s;
        const chip = (k, v, l) => `<div class="setup-chip${s[k] === v ? ' sel' : ''}" onclick="groupSetup.opt('${k}','${v}')">${l}</div>`;
        let h = `<div class="setup-optq"><div class="setup-q2">${tr('GSETUP_FLIP_Q')}</div>
            <p class="setup-p sub">${tr('GSETUP_FLIP_DESC')}</p>
            <div class="setup-chips">${chip('flip', 'normal', tr('GSETUP_FLIP_NORMAL'))}${chip('flip', 'inv', tr('GSETUP_FLIP_INV'))}</div></div>
            <div class="setup-optq"><div class="setup-q2">${tr('SETUP_REACH_Q')}</div>
            <p class="setup-p sub">${tr('GSETUP_REACH_DESC')}</p>
            <div class="setup-chips">${chip('reach', 'normal', tr('SETUP_REACH_NORMAL'))}${chip('reach', 'strong', tr('SETUP_REACH_STRONG'))}</div>
            <p class="setup-p sub setup-why"><i>${tr('GSETUP_REACH_HINT')}</i></p></div>`;
        if (this.hasLed()) h += `<div class="setup-optq"><div class="setup-q2">${tr({ 'BOX-WIFI': 'GSETUP_LED_Q_BOX_WIFI', 'BOX-ETH': 'GSETUP_LED_Q_BOX_ETH' }[window.__hardwareProfile] || 'GSETUP_LED_Q')}</div>
            <div class="setup-chips">${chip('led', 'oui', tr('BT_YES'))}${chip('led', 'non', tr('BT_NO'))}</div></div>`;
        return `${h}<div class="setup-actions"><button type="button" onclick="groupSetup.optsDone()">${tr('SETUP_VALIDATE')}</button></div>`;
    }
    opt(k, v) { this.s[k] = v; this.render(); }
    sub(v) { this.s.tasks[this.s.cur].sub = v; this.render(); }
    task() { return this.s.tasks[this.s.cur]; }

    openMemory() {
        putJSONSync('/shadeCommand', { shadeId: this.task().shadeId, command: 'prog', repeat: 40 }, (err) => {
            if (err) return ui.serviceError(err);
            this.sub('memq');
        });
    }
    holdStart(evt) {
        if (!isPrimaryPress(evt) || this.holding) return;
        this.holding = true;
        const gid = this.s.group.groupId;
        const again = (err) => { if (!err && mouseDown && this.holding) somfy.sendGroupRepeat(gid, 'prog', null, again); };
        somfy.sendGroupCommand(gid, 'prog', null, again);
    }
    holdEnd(evt) {
        if (!isPrimaryPress(evt) || !this.holding) return;
        this.holding = false;
        this.sub('grpq');
    }
    groupProgOnce() {
        putJSONSync('/groupCommand', { groupId: this.s.group.groupId, command: 'prog', repeat: 1 }, (err) => {
            if (err) return ui.serviceError(err);
            this.sub('grpq');
        });
    }
    confirmLink() {
        const T = this.task(), un = T.id === 'unlink';
        putJSONSync(un ? '/unlinkFromGroup' : '/linkToGroup', { groupId: this.s.group.groupId, shadeId: T.shadeId }, (err, group) => {
            if (err) return ui.serviceError(err);
            if (group) this.s.group = group;
            this.s.changed = true;
            this.done(tr(un ? 'GSETUP_S_UNLINKED' : 'GSETUP_S_LINKED'));
        });
    }
    optsDone() {
        const s = this.s, g = s.group, rep = g.repeats ?? 1, fields = { groupId: g.groupId, flipCommands: s.flip === 'inv' };
        fields.repeats = s.reach === 'strong' ? (rep > 1 ? rep : 3) : (rep > 1 ? 1 : rep);
        if (this.hasLed()) fields.ledFeedback = s.led === 'oui';
        putJSONSync('/saveGroup', fields, (err, group) => {
            if (err) return ui.serviceError(err);
            if (group) s.group = group;
            s.changed = true;
            const parts = [s.flip === 'inv' ? tr('GSETUP_S_FLIPPED') : '', tr(s.reach === 'strong' ? 'SETUP_S_REACH_STRONG' : 'SETUP_S_REACH_NORMAL'), fields.ledFeedback ? tr('SETUP_S_LED') : ''];
            this.done(parts.filter(Boolean).join(' · '));
        });
    }
    done(note) { const T = this.task(); T.state = 'done'; T.note = note; this.s.cur++; this.render(); }
    skip() { this.task().state = 'skipped'; this.s.cur++; this.render(); }
    closeDone() { if (this.div) closeOverlay(this.div); }
    renderFinal() {
        const s = this.s, todo = s.tasks.filter(T => T.state !== 'done'), name = escHtml(s.group.name);
        this.$('.setup-body').innerHTML = `<div class="setup-final"><svg><use href="#svg-group"></use></svg>
            <h3>${this.t(todo.length ? 'GSETUP_CREATED' : 'GSETUP_READY', { name })}</h3>
            <p class="setup-p sub">${tr(todo.length ? 'GSETUP_PARTIAL_DESC' : 'GSETUP_READY_DESC')}</p></div>
            <div class="setup-tasks">${s.tasks.map((T, k) => `<div class="setup-task ${T.state || ''}"><div class="setup-task-h"><div class="setup-task-n">${T.state === 'done' ? '<svg><use href="#svg-check"></use></svg>' : k + 1}</div><div class="setup-task-t">${this.title(T)}</div><div class="setup-task-s">${T.state === 'done' ? T.note : tr(T.id === 'opts' ? 'SETUP_S_TODO' : 'GSETUP_S_NOT_LINKED')}</div></div></div>`).join('')}</div>`;
        const gid = s.group.groupId;
        this.$('.setup-foot').innerHTML = `<button type="button" line onclick="groupSetup.closeDone(); somfy.openEditGroup(${gid})">${tr('SETUP_OPEN_FORM')}</button><button type="button" onclick="groupSetup.closeDone()">${tr('SETUP_FINISH')}</button>`;
    }

    renderMembers(group) {
        const list = get('divGroupMembers');
        if (!list) return;
        const shades = group.linkedShades || [];
        list.innerHTML = shades.map(sh => `<div class="somfyLinkedRemote linkedRemoteCard" data-shadeid="${sh.shadeId}"><div class="remote-card-top">
            <div class="linkedWrap"><svg class="icon-svg"><use href="#${this.icoOf(sh)}"></use></svg></div>
            <div class="linkedContent"><div class="linkedRemote-title">${escHtml(sh.name)}</div>
            <div class="linkedRemote-meta"><span>${tr('ADDR')} ${sh.remoteAddress}</span><span class="linkedRemote-sep">|</span><span>${sh.bitLength || 56} bits</span></div></div>
            <div class="linkedRemote-btn-delete" title="${escAttr(tr('GSETUP_UNLINK_TIP'))}" onclick="groupSetup.runUnlink(${group.groupId}, ${sh.shadeId})"><svg><use href="#svg-unlink"></use></svg></div></div></div>`).join('');
    }
}
const groupSetup = new GroupSetup();
