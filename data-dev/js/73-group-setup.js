class GroupSetup {
    t(key, vars) { let s = tr(key); Object.keys(vars || {}).forEach(k => { s = s.split(`{${k}}`).join(vars[k]); }); return s; }
    hasLed() { return typeof window.__ledPin === 'number' && window.__ledPin >= 0; }
    icoOf(shade) { return (somfy.shadeTypes.find(x => x.type === shade.shadeType) || {}).indic || 'svg-indicShutter'; }
    $(sel) { return this.div ? this.div.querySelector(sel) : null; }

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
    mountWiz(titleKey = 'GSETUP_TITLE') {
        get('divGroupSetup')?.remove();
        const div = document.createElement('div');
        div.id = 'divGroupSetup';
        div.className = 'modal-overlay genmod-overlay wiz-overlay';
        div.innerHTML = `<div class="message-content wiz-window">
            <aside class="wiz-side">
            <div class="wiz-side-head"><h2 class="wiz-title">${tr(titleKey)}</h2>
            <button type="button" class="wiz-close" data-wiz-close aria-label="${escAttr(tr('BT_CLOSE'))}"><svg><use href="#svg-close"></use></svg></button></div>
            <ol class="wiz-steps"></ol><div class="wiz-pbar" aria-hidden="true"></div>
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
        if (this.w.mode) return this.renderLink();
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
        const bar = wizStepsHtml(steps.map(([k, d], i) => ({ title: tr(k), desc: d, state: i === step ? 'on' : i < step ? 'done' : '' })));
        this.$('.wiz-steps').innerHTML = bar.steps;
        this.$('.wiz-pbar').innerHTML = bar.bar;
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
              <button type="button" class="gen-btn wiz-add-room" onclick="somfy.openAddRoomInline('gsetup')"><svg><use href="#svg-add"></use></svg><span>${tr('BT_ADD_ROOM')}</span></button>
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
                // Oui / Non neutres : aucun des deux ne doit paraître déjà choisi.
                const memBody = this.memBody(T, nm, 'GSETUP_MEM_DESC'), grpBody = this.pairBody(T, nm, false, memOk);
                main.innerHTML = `${head(this.t('GSETUP_T_LINK', { name: nm }), ' · ' + tr('GSETUP_W_LINK_POS').replace('{I}', s.cur + 1).replace('{T}', links.length))}
                <div class="wiz-grid">
                <div class="gen-tile"><h3 class="gen-tile-title">${this.t('GSETUP_MEM_TITLE', { name: nm })}</h3>${memBody}</div>
                <div class="gen-tile"><h3 class="gen-tile-title">${tr('GSETUP_GRP_TITLE')}</h3>${grpBody}</div>
                ${progress}</div>`;
                main.innerHTML += `<button type="button" class="wiz-link wiz-skip-in" onclick="groupSetup.skip()">${tr('SETUP_SKIP')}</button>`;
            } else main.innerHTML = `${head(tr('GSETUP_W_STEP_LINK'))}<div class="wiz-grid">${progress}</div>`;
            ok = !T;
            if (!ok) hint = tr('GSETUP_W_HINT_LINK');
        } else {
            const all = links.every(T => T.state === 'done'), gname = escHtml(s.group.name);
            const seg = (k, opts) => `<span class="gen-seg">${opts.map(([v, l]) => `<button type="button" class="wiz-opt${s[k] === v ? ' on' : ''}" aria-pressed="${s[k] === v}" onclick="groupSetup.opt('${k}','${v}')">${tr(l)}</button>`).join('')}</span>`;
            // Normale = 1 répétition (valeur d'usine), Renforcée = 3 ; le nombre exact reste à portée,
            // replié, pour qui sait ce qu'il veut. Dans le doute, on conseille de ne rien toucher.
            const reach = `<span class="gen-seg"><button type="button" class="wiz-opt${s.rep <= 1 ? ' on' : ''}" aria-pressed="${s.rep <= 1}" onclick="groupSetup.setRep(1)">${tr('SETUP_REACH_NORMAL')}</button><button type="button" class="wiz-opt${s.rep > 1 ? ' on' : ''}" aria-pressed="${s.rep > 1}" onclick="groupSetup.setRep(3)">${tr('SETUP_REACH_STRONG')}</button></span>
                <p class="gen-tile-desc">${tr('SETUP_REACH_HINT')}</p>
                <details class="wiz-adv"${s.rep === 1 || s.rep === 3 ? '' : ' open'}><summary>${tr('SETUP_REACH_CUSTOM')}</summary>
                <div class="gen-input-box"><select class="gen-input" aria-label="${escAttr(tr('REPEAT_COMMANDS'))}" onchange="groupSetup.setRep(parseInt(this.value, 10))">${[1, 2, 3, 4, 5, 6, 7].map(v => `<option value="${v}"${s.rep === v ? ' selected' : ''}>${tr(`OPT_${v}TIME`)}</option>`).join('')}</select></div></details>`;
            const led = this.hasLed() ? `<div class="gen-tile"><h3 class="gen-tile-title">${tr('LED_FEEDBACK')}</h3><p class="gen-tile-desc">${tr({ 'BOX-WIFI': 'GSETUP_LED_Q_BOX_WIFI', 'BOX-ETH': 'GSETUP_LED_Q_BOX_ETH' }[window.__hardwareProfile] || 'GSETUP_LED_Q')}</p>${seg('led', [['oui', 'BT_YES'], ['non', 'BT_NO']])}</div>` : '';
            main.innerHTML = `${head(this.t(all ? 'GSETUP_READY' : 'GSETUP_CREATED', { name: gname }))}
            <p class="${all ? 'wiz-ok' : 'wiz-warn'}">${all ? '<svg><use href="#svg-check"></use></svg>' : ''}${tr(all ? 'GSETUP_READY_DESC' : 'GSETUP_PARTIAL_DESC')}</p>
            <div class="wiz-grid">
            <div class="gen-tile"><h3 class="gen-tile-title">${tr('GSETUP_FLIP_Q')}</h3><p class="gen-tile-desc">${tr('GSETUP_FLIP_DESC')}</p>${seg('flip', [['normal', 'GSETUP_FLIP_NORMAL'], ['inv', 'GSETUP_FLIP_INV']])}</div>
            <div class="gen-tile"><h3 class="gen-tile-title">${tr('SETUP_REACH_Q')}</h3><p class="gen-tile-desc">${tr('GSETUP_REACH_DESC')}</p>${reach}</div>
            ${led}</div>`;
        }
        const created = !!s;
        if (!keepMain) wizScrollTop(this.w, main, `${step}:${s ? s.cur : ''}`);
        const btn = (cls, attrs, key) => `<button type="button" class="gen-btn${cls}" ${attrs}>${tr(key)}</button>`;
        // Retour à gauche ; à droite, la sortie juste avant l'action principale, là où on la cherche.
        this.$('.wiz-foot').innerHTML = `${step === 1 ? btn('', 'onclick="groupSetup.wizStep(0)"', 'BT_GO_BACK') : ''}
            <span class="wiz-foot-gap"></span><span class="wiz-foot-hint">${escHtml(hint)}</span>
            ${step === 2 && s.tasks[s.cur] ? btn(' wiz-skip', 'onclick="groupSetup.skip()"', 'SETUP_SKIP') : ''}
            ${btn(' wiz-quit', 'data-wiz-close', created ? 'SETUP_LATER' : 'BT_CANCEL')}
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
            this.s = { group, tasks, cur: 0, changed: true,
                flip: group.flipCommands ? 'inv' : 'normal', rep: group.repeats ?? 1, led: group.ledFeedback ? 'oui' : 'non' };
            this.wizStep(2);
        });
    }
    finishWiz() {
        const s = this.s, fields = { groupId: s.group.groupId, flipCommands: s.flip === 'inv', repeats: s.rep };
        if (this.hasLed()) fields.ledFeedback = s.led === 'oui';
        putJSONSync('/saveGroup', fields, (err) => {
            if (err) return ui.serviceError(err);
            ui.toast(tr('MSG_ADD_SUCCESS'));
            this.closeDone();
        });
    }

    // Oui / Non neutres : aucun des deux ne doit paraître déjà choisi.
    memBody(T, nm, descKey) {
        if (T.sub === 'memwait') return `<p class="gen-tile-desc">${tr(descKey)}</p><div class="gen-btn-row"><button type="button" class="gen-btn gen-btn-primary wiz-busy" aria-disabled="true"><span class="wiz-spin"></span>${tr('GSETUP_MEM_SENDING')}</button></div>`;
        if (T.sub === 'mem') return `<p class="gen-tile-desc">${tr(descKey)}</p><div class="gen-btn-row"><button type="button" class="gen-btn gen-btn-primary" onclick="groupSetup.openMemory()">${tr('GSETUP_MEM_BTN')}</button></div>`;
        if (T.sub === 'memq') return `<p class="wiz-q">${this.t('GSETUP_MEM_Q', { name: nm })}</p><div class="gen-btn-row"><button type="button" class="gen-btn" onclick="groupSetup.sub('memno')">${tr('BT_NO')}</button><button type="button" class="gen-btn" onclick="groupSetup.sub('grp')">${tr('BT_YES')}</button></div>`;
        if (T.sub === 'memno') return `<p class="wiz-warn">${this.t('GSETUP_MEM_NO', { name: nm })}</p><div class="gen-btn-row"><button type="button" class="gen-btn" onclick="groupSetup.sub('mem')">${tr('BT_RETRY')}</button><button type="button" class="gen-btn" onclick="groupSetup.sub('grp')">${tr('GSETUP_MEM_OTHER')}</button></div>`;
        return `<p class="wiz-ok"><svg><use href="#svg-check"></use></svg>${tr('GSETUP_MEM_OK')}</p>`;
    }
    // Appairage : appui long maintenu ; retrait : un appui court suffit.
    pairBody(T, nm, un, memOk) {
        if (T.state === 'done') return `<p class="wiz-ok"><svg><use href="#svg-check"></use></svg>${this.t(un ? 'GSETUP_L_UNDONE' : 'GSETUP_L_DONE', { name: nm })}</p>`;
        if (T.sub === 'grpq') return `<p class="wiz-q">${this.t('GSETUP_GRP_Q', { name: nm })}</p><div class="gen-btn-row"><button type="button" class="gen-btn" onclick="groupSetup.sub('grp')">${tr('SETUP_RETRY_NO')}</button><button type="button" class="gen-btn" onclick="groupSetup.confirmLink()">${tr(un ? 'GSETUP_UNGRP_YES' : 'GSETUP_GRP_YES')}</button></div>`;
        if (un) return `<p class="gen-tile-desc">${tr('GSETUP_UNGRP_DESC')}</p><div class="gen-btn-row"><button type="button" class="gen-btn gen-btn-primary" onclick="groupSetup.groupProgOnce()">${tr('GSETUP_UNGRP_BTN')}</button></div>`;
        return `<p class="gen-tile-desc">${tr('GSETUP_GRP_DESC')}</p><div class="gen-btn-row"><button type="button" id="btnGsetupHold" class="gen-btn gen-btn-primary"${memOk ? '' : ' disabled'} onmousedown="groupSetup.holdStart(event)" ontouchstart="event.preventDefault(); groupSetup.holdStart()" onmouseup="groupSetup.holdEnd(event)" ontouchend="groupSetup.holdEnd()">${tr('GSETUP_GRP_BTN')}</button></div>`;
    }

    // ---------- Associer / retirer depuis la fiche du groupe : même coque, 3 ou 2 étapes ----------
    startLink(mode, group, tasks) {
        this.c = null;
        this.s = { group, tasks, cur: 0, changed: false, onDone: () => somfy.openEditGroup(group.groupId) };
        this.w = { step: 0, mode, pick: null };
        this.mountWiz(mode === 'unlink' ? 'GSETUP_UNLINK_TIP' : 'BT_LINK_DEVICE');
        this.renderWiz();
    }
    runLink(groupId) {
        getJSONSync(`/groupOptions?groupId=${groupId}`, (err, data) => {
            if (err) return ui.serviceError(err);
            const avail = data.availShades || [];
            if (!avail.length) return ui.errorMessage(tr('ERR_NO_DEVICE_AVAILABLE_GROUP'));
            this.avail = avail;
            this.startLink('link', data, []);
        });
    }
    runUnlink(groupId, shadeId) {
        getJSONSync(`/group?groupId=${groupId}`, (err, group) => {
            if (err) return ui.serviceError(err);
            const sh = (group.linkedShades || []).find(x => x.shadeId === shadeId);
            if (!sh) return ui.errorMessage(tr('ERR_DEVICE_NOT_FOUND_GROUP'));
            this.startLink('unlink', group, [{ id: 'unlink', shadeId, name: sh.name, sub: 'mem', state: null }]);
        });
    }
    linkKeys() { return this.w.mode === 'unlink' ? ['mem', 'pair'] : ['pick', 'mem', 'pair']; }
    renderLink() {
        const x = pairMode.expert();
        this.$('.wiz-side-head .pair-mode-menu')?.remove();
        this.$('.pair-mode-badge')?.remove();
        this.$('.wiz-title').insertAdjacentHTML('afterend', pairMode.menu('groupSetup.setPairMode'));
        this.$('.wiz-steps').hidden = x;
        this.$('.wiz-pbar').hidden = x;
        if (x) return this.renderLinkExpert();
        const w = this.w, s = this.s, un = w.mode === 'unlink', L = this.linkKeys(), key = L[w.step], T = s.tasks[0];
        const nm = T ? escHtml(T.name) : '', memOk = !!T && (T.state === 'done' || T.sub === 'grp' || T.sub === 'grpq');
        const steps = {
            pick: ['GSETUP_L_STEP_DEVICE', T ? T.name : (this.avail.find(a => a.shadeId === w.pick) || {}).name || tr('GSETUP_W_TO_CHOOSE')],
            mem: ['GSETUP_L_STEP_MEM', tr(memOk ? 'GSETUP_L_MEM_OPEN' : 'SETUP_S_TODO')],
            pair: [un ? 'GSETUP_L_STEP_UNPAIR' : 'GSETUP_W_STEP_LINK', tr(T && T.state === 'done' ? (un ? 'GSETUP_S_UNLINKED' : 'GSETUP_S_LINKED') : 'SETUP_S_TODO')]
        };
        const bar = wizStepsHtml(L.map((k, i) => ({ title: tr(steps[k][0]), desc: steps[k][1], state: i === w.step ? 'on' : i < w.step ? 'done' : '' })));
        this.$('.wiz-steps').innerHTML = bar.steps;
        this.$('.wiz-pbar').innerHTML = bar.bar;
        this.$('.wiz-sum-text b').textContent = s.group.name;
        this.$('.wiz-sum-text span').textContent = tr('GSETUP_W_COUNT').replace('{N}', (s.group.linkedShades || []).length);
        const head = (title) => `<div class="wiz-head"><div class="wiz-kick">${tr('GSETUP_L_KICK').replace('{N}', w.step + 1).replace('{T}', L.length)}</div><h2 class="wiz-h">${title}</h2></div>`;
        const main = this.$('.wiz-main');
        let ok, hint = '';
        if (key === 'pick') {
            main.innerHTML = `${head(tr('GSETUP_PICK_Q'))}<p class="wiz-lead">${this.t('GSETUP_L_PICK_DESC', { name: escHtml(s.group.name) })}</p>
            <div class="wiz-grid">${this.avail.map(a => {
                const sh = (somfy.shades || []).find(x => x.shadeId === a.shadeId) || a, on = w.pick === a.shadeId;
                const sub = [tr(somfy.shadeTypeKey(sh.shadeType) || ''), sh.roomId !== undefined ? somfy._cfgRoomName(sh.roomId) : ''].filter(Boolean).join(' · ');
                return `<button type="button" class="wiz-check${on ? ' on' : ''}" aria-pressed="${on}" onclick="groupSetup.pickLink(${a.shadeId})">
                <span class="wiz-check-icon"><svg><use href="#${this.icoOf(sh)}"></use></svg></span>
                <span class="wiz-check-text"><b>${escHtml(a.name)}</b>${sub ? `<small>${escHtml(sub)}</small>` : ''}</span>
                <span class="wiz-check-box"><svg><use href="#svg-check"></use></svg></span></button>`;
            }).join('')}</div>`;
            ok = w.pick !== null;
        } else if (key === 'mem') {
            main.innerHTML = `${head(this.t('GSETUP_L_MEM_H', { name: nm }))}<div class="wiz-grid"><div class="gen-tile"><h3 class="gen-tile-title">${tr('GSETUP_L_MEM_T')}</h3>${this.memBody(T, nm, un ? 'GSETUP_MEM_DESC_UN' : 'GSETUP_MEM_DESC')}</div></div>`;
            ok = memOk;
            if (!ok) hint = tr('GSETUP_L_MEM_HINT');
        } else {
            main.innerHTML = `${head(this.t(un ? 'GSETUP_T_UNLINK' : 'GSETUP_L_PAIR_H', { name: nm }))}<div class="wiz-grid"><div class="gen-tile"><h3 class="gen-tile-title">${tr(un ? 'GSETUP_L_UNPAIR_T' : 'GSETUP_L_PAIR_T')}</h3>${this.pairBody(T, nm, un, true)}</div></div>`;
            ok = T.state === 'done';
            if (!ok) hint = tr(un ? 'GSETUP_L_UNPAIR_HINT' : 'GSETUP_L_PAIR_HINT');
        }
        wizScrollTop(this.w, main, `${w.step}`);
        const last = w.step === L.length - 1;
        const btn = (cls, attrs, k) => `<button type="button" class="gen-btn${cls}" ${attrs}>${tr(k)}</button>`;
        this.$('.wiz-foot').innerHTML = `${key === 'mem' && !un ? btn('', 'onclick="groupSetup.linkBack()"', 'BT_GO_BACK') : ''}
            <span class="wiz-foot-gap"></span><span class="wiz-foot-hint">${escHtml(hint)}</span>
            ${btn(' wiz-quit', 'data-wiz-close', 'BT_CANCEL')}
            ${btn(' gen-btn-primary', `onclick="groupSetup.linkNext()"${ok ? '' : ' disabled'}`, last ? 'SETUP_FINISH' : 'BT_CONTINUE')}`;
    }
    // Mode expert : les boutons de la v2, sans question. Seul le second va-et-vient renseigne
    // sur le moteur, d'où un bouton qui l'enregistre plutôt qu'un « réussi ».
    renderLinkExpert() {
        const w = this.w, s = this.s, un = w.mode === 'unlink';
        if (!un && w.pick === null) w.pick = this.avail[0].shadeId;
        this.$('.wiz-pbar').insertAdjacentHTML('afterend', pairMode.badge());
        this.$('.wiz-sum-text b').textContent = s.group.name;
        this.$('.wiz-sum-text span').textContent = tr('GSETUP_W_COUNT').replace('{N}', (s.group.linkedShades || []).length);
        const dev = un ? `<p class="wiz-lead"><b>${escHtml(s.tasks[0].name)}</b></p>`
            : `<div class="gen-field"><label class="gen-field-label" for="gsetupXPick">${tr('GSETUP_L_STEP_DEVICE')}</label><div class="gen-input-box"><select id="gsetupXPick" class="gen-input" onchange="groupSetup.w.pick = parseInt(this.value, 10)">${this.avail.map(a => `<option value="${a.shadeId}"${a.shadeId === w.pick ? ' selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select></div></div>`;
        const prog = un ? 'onclick="groupSetup.xProgOnce()"'
            : 'onmousedown="groupSetup.holdStart(event)" ontouchstart="event.preventDefault(); groupSetup.holdStart()" onmouseup="groupSetup.holdEnd(event)" ontouchend="groupSetup.holdEnd()"';
        const main = this.$('.wiz-main');
        main.innerHTML = `${dev}<div class="pair-mode-col">
            <button type="button" class="gen-btn" onclick="groupSetup.xMem()">${tr('GSETUP_MEM_BTN')}</button>
            <button type="button" class="gen-btn" ${prog}>${tr('PAIR_X_GRP_PROG')}</button>
            <button type="button" class="gen-btn gen-btn-primary" onclick="groupSetup.xDone()">${tr('PAIR_X_JOGGED')}</button></div>
            <p class="gen-tile-desc">${tr(un ? 'PAIR_X_NOTE_UNLINK' : 'PAIR_X_NOTE_LINK')}</p>
            <p class="pair-mode-status" id="gsetupXStatus" aria-live="polite"></p>`;
        wizScrollTop(w, main, 'x');
        this.$('.wiz-foot').innerHTML = `<span class="wiz-foot-gap"></span><button type="button" class="gen-btn wiz-quit" data-wiz-close>${tr('BT_CANCEL')}</button>`;
    }
    setPairMode(on) { pairMode.set(on); this.renderWiz(); }
    xShade() { return this.w.mode === 'unlink' ? this.s.tasks[0] : this.avail.find(a => a.shadeId === this.w.pick); }
    xStatus(text) { const el = this.$('#gsetupXStatus'); if (el) el.textContent = text; }
    xMem() {
        const sh = this.xShade();
        putJSONSync('/shadeCommand', { shadeId: sh.shadeId, command: 'prog', repeat: 40 }, (err) => {
            if (err) return ui.serviceError(err);
            this.xStatus(this.t('PAIR_X_MEM_SENT', { name: sh.name }));
        });
    }
    xProgOnce() {
        putJSONSync('/groupCommand', { groupId: this.s.group.groupId, command: 'prog', repeat: 1 }, (err) => {
            if (err) return ui.serviceError(err);
            this.xStatus(tr('PAIR_X_PROG_SENT'));
        });
    }
    xDone() {
        const sh = this.xShade(), un = this.w.mode === 'unlink';
        putJSONSync(un ? '/unlinkFromGroup' : '/linkToGroup', { groupId: this.s.group.groupId, shadeId: sh.shadeId }, (err) => {
            if (err) return ui.serviceError(err);
            this.s.changed = true;
            ui.toast(this.t(un ? 'GSETUP_L_TOAST_UNLINK' : 'GSETUP_L_TOAST_LINK', { name: sh.name }));
            this.closeDone();
        });
    }
    pickLink(id) { this.w.pick = id; this.renderWiz(); }
    linkBack() { this.s.tasks = []; this.w.step = 0; this.renderWiz(); }
    linkNext() {
        const w = this.w, key = this.linkKeys()[w.step];
        if (key === 'pick') {
            const a = this.avail.find(x => x.shadeId === w.pick);
            this.s.tasks = [{ id: 'link', shadeId: w.pick, name: a ? a.name : '', sub: 'mem', state: null }];
            this.s.cur = 0;
        }
        if (key !== 'pair') { w.step++; return this.renderWiz(); }
        const T = this.s.tasks[0];
        ui.toast(this.t(w.mode === 'unlink' ? 'GSETUP_L_TOAST_UNLINK' : 'GSETUP_L_TOAST_LINK', { name: T.name }));
        this.closeDone();
    }
    opt(k, v) { this.s[k] = v; this.renderWiz(); }
    setRep(v) { this.s.rep = v; this.renderWiz(); }
    sub(v) { this.s.tasks[this.s.cur].sub = v; this.renderWiz(); }
    task() { return this.s.tasks[this.s.cur]; }

    // L'appui long dure 2 à 4 s avant la réponse : on l'affiche tout de suite, sinon on reclique.
    openMemory() {
        this.sub('memwait');
        putJSONSync('/shadeCommand', { shadeId: this.task().shadeId, command: 'prog', repeat: 40 }, (err) => {
            if (err) { this.sub('mem'); return ui.serviceError(err); }
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
        if (this.w && this.w.mode && pairMode.expert()) return this.xStatus(tr('PAIR_X_PROG_SENT'));
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
    done(note) { const T = this.task(); T.state = 'done'; T.note = note; this.s.cur++; this.renderWiz(); }
    skip() { this.task().state = 'skipped'; this.s.cur++; this.renderWiz(); }
    closeDone() { if (this.div) closeOverlay(this.div); }
    // Fiche groupe : tuiles des pages-listes, la tuile d'ajout en premier.
    renderMembers(group) {
        const list = get('divGroupMembers');
        if (!list) return;
        const gid = group.groupId;
        list.innerHTML = `<button type="button" id="btnLinkShade" class="cfg-tile cfg-tile-add" onclick="groupSetup.runLink(${gid})"><svg><use href="#svg-add"></use></svg><span>${tr('BT_LINK_DEVICE')}</span><small>${tr('GROUP_LINK_DESC')}</small></button>`
            + (group.linkedShades || []).map(sh => {
                const typeKey = somfy.shadeTypeKey(sh.shadeType);
                return `<div class="cfg-tile" data-shadeid="${sh.shadeId}" onclick="somfy.openEditShade(${sh.shadeId})">
            <div class="cfg-tile-top"><span class="cfg-tile-icon"><svg><use href="#${this.icoOf(sh)}"></use></svg></span>${somfy.cfgTileMenu(`groupSetup.runUnlink(${gid}, ${sh.shadeId})`, '', 'GSETUP_UNLINK_TIP')}</div>
            <div class="cfg-tile-name"><span class="name-text">${escHtml(sh.name)}</span>${typeKey ? `<span class="cfg-tile-sub">${tr(typeKey)}</span>` : ''}</div>
            <div class="cfg-tile-foot"><span class="grp-paired">${tr('GSETUP_S_LINKED')}</span><span class="cfg-tile-id">${sh.remoteAddress}</span></div>
            </div>`;
            }).join('');
    }
}
const groupSetup = new GroupSetup();
