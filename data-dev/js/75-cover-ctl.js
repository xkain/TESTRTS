const coverCtl = {
    ROLL: 1 / 18, VEN0: 29 / 180, AW0: 8 / 180, DRAPE: .09, SLIDE: 70, SWING0: .08, GAUGE: 22,
    anim: {},
    kind(t) { return dashScene.kind(t); },
    isSym(t) { return t === 8 || t === 12 || t === 15; },
    horiz(t) { const k = this.kind(t); return k === 'gate' || k === 'drapery'; },
    disp(sh) { return sh.flipPosition ? 100 - sh.position : sh.position; },
    real(sh, v) { return sh.flipPosition ? 100 - v : v; },
    moving(sh) { return (parseInt(sh.direction, 10) || 0) !== 0 || (parseInt(sh.tiltDirection, 10) || 0) !== 0; },
    target(sh) { return (parseInt(sh.direction, 10) || 0) !== 0 && typeof sh.target === 'number' ? this.disp({ position: sh.target, flipPosition: sh.flipPosition }) : null; },
    tiltOnly(sh) { return sh.tiltType === 3; },
    mix(sh) { return sh.tiltType > 0 && sh.tiltType !== 3; },
    gaugeY(sh, H) { return [sh.sunSensor ? 52 : this.GAUGE, H - this.GAUGE]; },
    hasPos(sh) { return !somfy.noMyShadeTypes.includes(sh.shadeType); },
    vEdge(p) { return this.ROLL + (1 - this.ROLL) * p / 100; },
    venEdge(p) { return this.VEN0 + (1 - this.VEN0) * p / 100; },
    awEdge(p) { return this.AW0 + (.9 - this.AW0) * p / 100; },
    slideP(p) { return 1 - (1 - p / 100) * this.SLIDE / 92; },
    swingP(p) { return this.SWING0 + (1 - this.SWING0) * p / 100; },
    frac(t, p) {
        const k = this.kind(t), q = p / 100, e = this.DRAPE + (1 - this.DRAPE) * q;
        if (k === 'drapery') return t === 2 ? e : t === 7 ? 1 - e : e / 2;
        if (k === 'awning') return this.awEdge(p);
        if (k === 'blind') return this.venEdge(p);
        if (k === 'gate') {
            if (t === 12 || t === 15) return (11 + 38.4 * this.swingP(p)) / 100;
            return (t === 13 || t === 16 ? 11 + (1 - q) * this.SLIDE : 89 - (1 - q) * this.SLIDE) / 100;
        }
        return this.vEdge(p);
    },
    raw(t, f, side) {
        const k = this.kind(t), fs = side === 'R' ? 1 - f : f;
        if (k === 'drapery') return (t === 2 ? f - this.DRAPE : t === 7 ? 1 - f - this.DRAPE : 2 * fs - this.DRAPE) / (1 - this.DRAPE) * 100;
        if (k === 'awning') return (f - this.AW0) / (.9 - this.AW0) * 100;
        if (k === 'blind') return (f - this.VEN0) / (1 - this.VEN0) * 100;
        if (k === 'gate') {
            if (t === 12 || t === 15) return ((100 * fs - 11) / 38.4 - this.SWING0) / (1 - this.SWING0) * 100;
            return (t === 13 || t === 16 ? 1 - (100 * f - 11) / this.SLIDE : 1 - (89 - 100 * f) / this.SLIDE) * 100;
        }
        return (f - this.ROLL) / (1 - this.ROLL) * 100;
    },
    clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); },
    tiltRaw(f, H, sh) { const [a, b] = this.gaugeY(sh, H); return (f * H - a) / (b - a) * 100; },
    gauge(sh, W, H, v) {
        const gx = W - 20, [y0, y1] = this.gaugeY(sh, H);
        return `<rect class="cover-gauge" x="${gx - 11}" y="${y0 - 11}" width="22" height="${y1 - y0 + 22}" rx="11"/><circle class="cover-ball" cx="${gx}" cy="${(y0 + (y1 - y0) * v / 100).toFixed(2)}" r="8.5"/>`;
    },

    html(sh) {
        dashScene.initTiles();
        const t = sh.shadeType, k = this.kind(t), id = sh.shadeId, h = this.horiz(t);
        const pos = this.hasPos(sh), tog = somfy.toggleShadeTypes.includes(t), tilt = this.tiltOnly(sh);
        const back = k === 'gate' ? '' : `<div class="dcard-art-back"><svg viewBox="${dashScene.CROP[k === 'garage' ? 'garage' : 'shutter']}" preserveAspectRatio="none" aria-hidden="true"><use href="#dtw-${dashScene.ICON[k === 'garage' ? 5 : 4]}" width="48" height="48"></use></svg></div>`;
        const aria = pos ? `role="slider" tabindex="0" aria-label="${escAttr(tr(tilt ? 'OPT_PAGE_TILT' : 'IS_POSITION'))}" aria-valuemin="0" aria-valuemax="100" aria-orientation="${h && !tilt ? 'horizontal' : 'vertical'}"` : '';
        const sun = `<button type="button" class="cmd-button button-sunflag cover-sun-btn" data-cmd="sunflag" data-shadeid="${id}" data-on="${(sh.flags & 0x01) ? 'true' : 'false'}" title="${escAttr(tr('VR_SUN_FLAG'))}" style="${sh.sunSensor ? '' : 'display:none'}"><svg><use href="#svg-sun"></use></svg></button>`;
        const draw = `<div class="cover-draw${k === 'drapery' || k === 'awning' ? ' is-drape' : ''}" data-shadeid="${id}" ${aria}>${back}<svg class="cover-fx" aria-hidden="true"></svg>
            <span class="cover-chip"></span>${sun}<i class="cover-target${h && !tilt ? ' is-v' : ''}"><span></span></i>
            <svg class="cover-dir" viewBox="-20 -20 40 40" aria-hidden="true"><g><path d="M-9 10L0 1L9 10" opacity=".45"/><path d="M-9 -1L0 -10L9 -1"/></g></svg>
            ${tog ? `<p class="cover-hint"><span>${tr(this.disp(sh) >= 50 ? 'CARD_SWIPE_OPEN' : 'CARD_SWIPE_CLOSE')}</span></p>` : ''}</div>`;
        const rail = pos && !tilt ? `<div class="cover-slider${h ? ' is-h' : ''}" data-shadeid="${id}" aria-hidden="true"><i></i><em></em><b></b><span></span></div>` : '';
        const btn = (cmd, key, inner) => `<button type="button" class="cmd-button cover-btn" data-cmd="${cmd}" data-shadeid="${id}" aria-label="${escAttr(tr(key))}">${inner}</button>`;
        const icon = cmd => `<svg><use href="#svg-${cmd}"></use></svg>`;
        const btns = tog ? btn('toggle', 'BT_OPEN', icon('toggle'))
            : btn('up', 'BT_OPEN', `${icon('up')}<span>${tr('BT_OPEN')}</span>`)
            + btn('my', 'BT_MY', `<span class="cover-my-rest">${icon('my')}</span><span class="cover-my-move"><i></i>${tr('BT_STOP')}</span>`)
            + btn('down', 'BT_CLOSE', `${icon('down')}<span>${tr('BT_CLOSE')}</span>`);
        const block = rail && !h ? `<div class="cover-row">${draw}${rail}</div>` : draw + rail;
        if (this.myOn(sh)) return `<div class="cover-ctl is-my" data-shadeid="${id}"><div class="cover-my-banner"><b>${tr('SETMYPOS_TITLE')}</b><span>${tr('CARD_MY_EDIT_HINT')}${sh.tiltType ? ` ${tr('CARD_MY_EDIT_HINT_TILT')}` : ''}</span></div>${block}${this.myFootHtml(sh)}</div>`;
        return `<div class="cover-ctl" data-shadeid="${id}">${block}<div class="cover-btns">${btns}</div>${this.favsHtml(sh)}</div>`;
    },

    myOn(sh) { return !!this._my && this._my.id === sh.shadeId; },
    myAxes(sh) { const t = sh.tiltType || 0; return { p: t !== 3, t: t > 0 }; },
    myFmt(sh, p, t) { const a = this.myAxes(sh); return [a.p ? `${p} %` : '', a.t ? `∠ ${t} %` : ''].filter(Boolean).join(' · '); },
    myStart(id) {
        const sh = (somfy.shades || []).find(x => x.shadeId === id);
        if (!sh) return;
        this._favEdit = null;
        this._my = { id, p: sh.myPos >= 0 ? sh.myPos : sh.position, t: sh.myTiltPos >= 0 ? sh.myTiltPos : sh.tiltPosition || 0 };
        somfy.cardSheetTab(0);
    },
    myState(sh) {
        const d = this._my, a = this.myAxes(sh);
        const has = (!a.p || sh.myPos >= 0) && (!a.t || sh.myTiltPos >= 0);
        return { d, a, has, same: has && (!a.p || d.p === sh.myPos) && (!a.t || d.t === sh.myTiltPos), cur: (!a.p || d.p === sh.position) && (!a.t || d.t === (sh.tiltPosition || 0)) };
    },
    myFootHtml(sh) {
        const { d, has, same, cur } = this.myState(sh);
        return `<div class="cover-my-foot">
            <div class="cover-my-val"><b>${this.myFmt(sh, d.p, d.t)}</b><span>${tr('CARD_MY_SAVED').replace('{v}', has ? this.myFmt(sh, sh.myPos, sh.myTiltPos) : tr('CARD_MY_NONE'))}</span></div>
            <button type="button" class="cover-my-cur-btn" data-myact="cur"${cur ? ' aria-disabled="true"' : ''}>${tr('CARD_MY_CURRENT')} (${this.myFmt(sh, sh.position, sh.tiltPosition || 0)})</button>
            <p class="cover-my-note">${tr(sh.simMy ? 'CARD_MY_SIM_NOTE' : 'CARD_MY_MOVE_NOTE')}</p>
            <div class="cover-my-btns"><button type="button" class="gen-btn" data-myact="cancel">${tr('BT_CANCEL')}</button><button type="button" class="gen-btn gen-btn-primary" data-myact="save"${same ? ' aria-disabled="true"' : ''}>${tr('BT_SET_MY_POSITION')}</button></div>
            ${has ? `<button type="button" class="cover-my-clear-btn" data-myact="clear">${tr('BT_CLEAR_MY_POSITION')}</button>` : ''}
        </div>`;
    },
    myAct(el) {
        if (el.getAttribute('aria-disabled') === 'true') return;
        const sh = (somfy.shades || []).find(x => this._my && x.shadeId === this._my.id);
        if (!sh) return;
        const { d, a } = this.myState(sh), act = el.dataset.myact, id = sh.shadeId;
        if (act === 'cur') { d.p = sh.position; d.t = sh.tiltPosition || 0; return this.myRefresh(sh); }
        this._my = null;
        if (act === 'save') somfy.sendShadeMyPosition(id, a.p ? d.p : sh.position, d.t);
        if (act === 'clear') somfy.sendShadeMyPosition(id, a.p ? sh.myPos : sh.position, sh.myTiltPos);
        somfy.renderCardSheet();
    },
    myRefresh(sh) {
        document.querySelectorAll(`.cover-ctl[data-shadeid="${sh.shadeId}"] .cover-my-foot`).forEach(el => { el.outerHTML = this.myFootHtml(sh); });
        this.kick();
    },

    favAxes(sh) {
        if (!this.hasPos(sh) || somfy.toggleShadeTypes.includes(sh.shadeType)) return [];
        return this.tiltOnly(sh) ? ['t'] : this.mix(sh) ? ['p', 't'] : ['p'];
    },
    favList(sh, ax) { const l = ax === 't' ? sh.favTilt : sh.favPos; return Array.isArray(l) ? l : [25, 50, 75]; },
    favsHtml(sh) {
        const axes = this.favAxes(sh);
        return axes.length ? `<div class="cover-favs" data-shadeid="${sh.shadeId}">${axes.map(ax => this.favRow(sh, ax, axes.length > 1)).join('')}</div>` : '';
    },
    favRow(sh, ax, label) {
        const ed = this._favEdit && this._favEdit.id === sh.shadeId && this._favEdit.ax === ax, t = ax === 't', tc = t ? ' is-tilt' : '';
        const list = this.favList(sh, ax), cur = t ? sh.tiltPosition : sh.position, still = !this.moving(sh);
        const my = t ? sh.myTiltPos : this.tiltOnly(sh) ? -1 : sh.myPos;
        const on = v => !ed && still && cur === v ? ' is-cur' : '';
        const chip = (v, i) => `<button type="button" class="cover-fav-btn${tc}${ed ? ' is-edit' : ''}${on(v)}" data-fav="${v}" data-ax="${ax}" data-i="${i}">${v} %${ed ? `<i class="cover-fav-del" data-del="${i}" data-ax="${ax}" role="button" aria-label="${escAttr(tr('BT_DELETE'))} ${v} %">×</i>` : ''}</button>`;
        const myChip = typeof my === 'number' && my >= 0 ? `<button type="button" class="cover-fav-btn is-my${tc}${ed ? ' is-myedit' : ''}${on(my)}" data-fav="${my}" data-ax="${ax}" data-my="1" title="${escAttr(tr('SETMYPOS_TITLE'))}"><svg><use href="#svg-favori"></use></svg>${my} %</button>` : '';
        const tail = ed
            ? `${list.length < 6 ? `<button type="button" class="cover-fav-btn is-add" data-favadd="${ax}" aria-label="${escAttr(tr('CARD_FAV_ADD'))}">+</button>` : ''}<button type="button" class="cover-fav-btn is-done" data-favdone="1">${tr('BT_DONE')}</button>`
            : `<button type="button" class="cover-fav-btn is-tool" data-favedit="${ax}" aria-label="${escAttr(tr('CARD_FAV_EDIT'))}"><svg><use href="#svg-edit"></use></svg></button>`;
        return `<div class="cover-fav-row" data-ax="${ax}">${label ? `<span class="cover-fav-label${tc}">${tr(t ? 'OPT_PAGE_TILT' : 'IS_POSITION')}</span>` : ''}<div class="cover-fav-list">${myChip}${list.map((v, i) => myChip && v === my ? '' : chip(v, i)).join('')}${tail}</div>${ed ? `<p class="cover-fav-hint">${tr('CARD_FAV_HINT')}</p>` : ''}</div>`;
    },
    favRefresh(id) {
        const sh = (somfy.shades || []).find(x => x.shadeId === id);
        if (sh) document.querySelectorAll(`.cover-favs[data-shadeid="${id}"]`).forEach(el => { el.outerHTML = this.favsHtml(sh); });
    },
    favSave(sh, ax, list) {
        return new Promise((ok, ko) => putJSON('/setFavorites', { shadeId: sh.shadeId, [ax === 't' ? 'tilt' : 'pos']: list }, (err, res) => {
            if (err) return ko(err);
            const c = (somfy.shades || []).find(x => x.shadeId === sh.shadeId);
            if (c && res) { c.favPos = res.favPos; c.favTilt = res.favTilt; }
            this.favRefresh(sh.shadeId);
            ok();
        }));
    },
    favDialog(sh, ax, idx) {
        const t = ax === 't', list = this.favList(sh, ax), my = t ? sh.myTiltPos : sh.myPos, fid = `favIn${Date.now()}`;
        const start = idx >= 0 ? list[idx] : t ? sh.tiltPosition : sh.position;
        const p = ui.dialog({
            level: 'info', icon: 'svg-favori', title: tr(idx < 0 ? 'CARD_FAV_NEW' : 'CARD_FAV_CHANGE'), desc: escHtml(tr(t ? 'OPT_PAGE_TILT' : 'IS_POSITION')),
            html: `<div class="cover-fav-input"><button type="button" data-step="-5" aria-label="-5">−</button><label><input id="${fid}" type="number" min="0" max="100" step="1" inputmode="numeric" value="${start}"><span>%</span></label><button type="button" data-step="5" aria-label="+5">+</button></div>`,
            buttons: [{ id: 'cancel', label: tr('BT_CANCEL') }, { id: 'ok', label: tr('BT_SAVE'), kind: 'primary' }],
            onConfirm: async () => {
                const raw = inp.value.trim(), v = Math.round(+raw);
                if (raw === '' || isNaN(v) || v < 0 || v > 100) throw tr('CARD_FAV_RANGE');
                if (v === my) throw tr('CARD_FAV_IS_MY').replace('{v}', v);
                if (list.some((x, i) => x === v && i !== idx)) throw tr('CARD_FAV_DUP').replace('{v}', v);
                const n = list.slice();
                if (idx < 0) n.push(v); else n[idx] = v;
                await this.favSave(sh, ax, n);
            }
        });
        const inp = document.getElementById(fid);
        if (inp) {
            inp.closest('.cover-fav-input').addEventListener('click', e => {
                const b = e.target.closest('[data-step]');
                if (b) inp.value = this.clamp((+inp.value || 0) + +b.dataset.step);
            });
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.closest('.message-content').querySelector('[data-id="ok"]').click(); });
            setTimeout(() => { inp.focus(); inp.select(); }, 50);
        }
        return p;
    },
    async favClick(e, root) {
        const el = e.target.closest('[data-favedit], [data-favdone], [data-favadd], [data-del], [data-fav]');
        if (!el || !root.contains(el)) return;
        const id = parseInt(el.closest('.cover-favs').dataset.shadeid, 10), sh = (somfy.shades || []).find(x => x.shadeId === id);
        if (!sh) return;
        if (el.dataset.favedit) { this._favEdit = { id, ax: el.dataset.favedit }; return this.favRefresh(id); }
        if (el.dataset.favdone) { this._favEdit = null; return this.favRefresh(id); }
        if (el.dataset.favadd) return this.favDialog(sh, el.dataset.favadd, -1);
        if (el.dataset.del) {
            e.stopPropagation();
            const ax = el.dataset.ax, list = this.favList(sh, ax), i = +el.dataset.del;
            if (!await ui.confirm({ level: 'danger', title: tr('CARD_FAV_DELETE').replace('{v}', list[i]), confirm: tr('BT_DELETE') })) return;
            return this.favSave(sh, ax, list.filter((_, j) => j !== i)).catch(err => ui.serviceError(err));
        }
        if (this._favLong) { this._favLong = false; return; }
        if (el.classList.contains('is-myedit')) return this.myStart(id);
        if (el.classList.contains('is-edit')) return;
        const v = +el.dataset.fav;
        somfy.confirmCardCommand('shade', id, () => el.dataset.ax === 't' ? somfy.sendTiltCommand(id, v) : somfy.sendCommand(id, v));
    },
    favDown(e) {
        const m = e.target.closest('.cover-fav-btn[data-my]:not(.is-myedit)');
        if (m && e.button === 0) {
            const id = parseInt(m.closest('.cover-favs').dataset.shadeid, 10);
            const t = setTimeout(() => { this._favLong = true; if (navigator.vibrate) navigator.vibrate(10); this.myStart(id); }, 500);
            const stop = () => { clearTimeout(t); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
            window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
            return;
        }
        const c = e.target.closest('.cover-fav-btn[data-fav]:not([data-my])');
        if (!c || e.target.closest('.cover-fav-del') || e.button !== 0) return;
        const id = parseInt(c.closest('.cover-favs').dataset.shadeid, 10), ax = c.dataset.ax;
        if (!c.classList.contains('is-edit')) {
            const t = setTimeout(() => { this._favLong = true; this._favEdit = { id, ax }; if (navigator.vibrate) navigator.vibrate(10); this.favRefresh(id); }, 500);
            const stop = () => { clearTimeout(t); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('pointermove', mv); };
            const mv = m => { if (Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) > 8) stop(); };
            window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); window.addEventListener('pointermove', mv);
            return;
        }
        const row = c.parentElement, r0 = c.getBoundingClientRect(), gx = e.clientX - r0.left, gy = e.clientY - r0.top;
        let drag = false;
        try { c.setPointerCapture(e.pointerId); } catch (x) { }
        const mv = m => {
            if (!drag && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < 6) return;
            drag = true;
            c.dataset.dragging = 'true';
            c.classList.add('is-drag');
            c.style.transform = '';
            const hit = [...row.querySelectorAll('.cover-fav-btn.is-edit:not([data-my])')].find(o => { if (o === c) return false; const r = o.getBoundingClientRect(); return m.clientX > r.left && m.clientX < r.right && m.clientY > r.top && m.clientY < r.bottom; });
            if (hit) { const r = hit.getBoundingClientRect(); row.insertBefore(c, m.clientX < r.left + r.width / 2 ? hit : hit.nextSibling); }
            const nb = c.getBoundingClientRect();
            c.style.transform = `translate(${m.clientX - gx - nb.left}px, ${m.clientY - gy - nb.top}px)`;
        };
        const up = () => {
            c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up);
            const sh = (somfy.shades || []).find(x => x.shadeId === id);
            if (!sh) return;
            if (!drag) return this.favDialog(sh, ax, +c.dataset.i);
            c.style.transform = '';
            c.dataset.dragging = 'false';
            c.classList.remove('is-drag');
            const order = [...row.querySelectorAll('.cover-fav-btn.is-edit:not([data-my])')].map(o => +o.dataset.fav);
            this.favSave(sh, ax, order).catch(err => { ui.serviceError(err); this.favRefresh(id); });
        };
        c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    },

    state(sh) {
        const a = this.anim[sh.shadeId] || (this.anim[sh.shadeId] = { dpos: this.disp(sh), dposV: 0, dtilt: sh.tiltPosition || 0, dtiltV: 0, wv: 0, ph: 0, wp: this.disp(sh) });
        return a;
    },
    spring(a, key, goal, dt) {
        const vk = key + 'V';
        if (Math.abs(goal - a[key]) < .05 && Math.abs(a[vk]) < .5) { a[key] = goal; a[vk] = 0; return false; }
        for (let left = dt; left > 0; left -= .016) {
            const h = Math.min(.016, left);
            a[vk] += (49 * (goal - a[key]) - 14 * a[vk]) * h;
            a[key] = Math.max(0, Math.min(100, a[key] + a[vk] * h));
        }
        return true;
    },
    wave(a, dt) {
        const frames = Math.max(.01, dt * 1000 / 16.7), keep = .9 ** frames, inst = (a.dpos - a.wp) / frames;
        a.wv = a.wv * keep + inst * (1 - keep);
        if (Math.abs(a.wv) < .015 && Math.abs(inst) < .001) a.wv = 0;
        a.wp = a.dpos;
        if (a.wv) a.ph += (.06 + Math.abs(a.wv) * .03) * frames;
        return !!a.wv;
    },

    svg(sh, a, W, H, ball) {
        const t = sh.shadeType, k = this.kind(t), q = H / 180, f = n => n.toFixed(2), grips = [];
        const pos = a.swipe ?? a.dpos, open = sh.tiltType ? 1 - a.dtilt / 100 : 0, tgt = this.target(sh);
        const gh = y => grips.push([W / 2, y, 0]), gv = (x, y) => grips.push([x, y, 1]);
        const slat = (y, th) => {
            const face = Math.max(.4 * q, th * .114);
            return `<rect class="cover-slat" y="${f(y)}" width="${W}" height="${f(Math.max(1, th))}"/>` + (th > 2.2 * q
                ? `<rect class="cover-seam" y="${f(y + th - face)}" width="${W}" height="${f(face)}"/><rect class="cover-lift" y="${f(y)}" width="${W}" height="${f(face * .55)}"/>` : '');
        };
        const bar = (y, h) => `<rect class="cover-bar" y="${f(y)}" width="${W}" height="${f(h)}"/>`;
        const ghost = h => tgt === null ? '' : `<rect class="cover-ghost" width="${W}" height="${f(h)}"/>`;
        let body = '';
        if (k === 'gate') {
            const sw = t === 12 || t === 15, right = t === 13 || t === 16, gy = H * 43.5 / 76, px = u => u * W / 100;
            if (sw) { gv(px(11 + 38.4 * this.swingP(pos)), gy); gv(px(89 - 38.4 * this.swingP(pos)), gy); }
            else gv(px(right ? 11 + (1 - pos / 100) * this.SLIDE : 89 - (1 - pos / 100) * this.SLIDE), gy);
            return { grips, svg: dashScene.gateArt(t, sw ? this.swingP(pos) * 100 : this.slideP(pos) * 100).replace('class="dcard-art-svg"', 'class="cover-fx"').replaceAll('transition:transform .4s ease-in-out', '') };
        }
        if (this.tiltOnly(sh)) {
            const P = 12 * q, n = Math.ceil(H / P), th = Math.max(1.2 * q, (P - q) * (1 - open));
            for (let i = 0; i < n; i++) body += slat(i * P + (P - th) / 2, th);
            body += this.gauge(sh, W, H, ball);
        }
        else if (k === 'blind') {
            const PITCH = 10 * q, STACK = .6 * q, FLAT = .8 * q, HEAD = 8.8 * q;
            const th = (9 - 7 * open) * q, n = Math.ceil(H / PITCH) + 1, first = HEAD + th / 2;
            const pitch = (H - th / 2 - first) / (n - 1), rail = H * this.venEdge(pos);
            const c = Array.from({ length: n }, (_, i) => Math.max(first + i * STACK, Math.min(first + i * pitch, rail - th / 2 - (n - 1 - i) * STACK)));
            const op = [];
            for (let i = 0; i < n - 1; i++) op.push(Math.max(0, Math.min(1, (c[i + 1] - c[i] - STACK) / (pitch - STACK))));
            op.push(op[n - 2]);
            body += c.map((y, i) => { const h = FLAT + (th - FLAT) * op[i]; return slat(y - Math.max(.5, h / 2), h); }).join('');
            [.22, .78].forEach(x => { body += `<rect class="cover-cord" x="${f(W * x - .7 * q)}" width="${f(1.4 * q)}" height="${f(c[n - 1] + q)}"/>`; });
            const by = c[n - 1] - th / 2 - q, bh = Math.max(2 * q, th * .6);
            body += bar(by, bh) + `<rect class="cover-slat cover-head" width="${W}" height="${f(HEAD)}"/>`;
            if (this.mix(sh)) body += this.gauge(sh, W, H, ball);
            gh(by + bh / 2);
        }
        else if (k === 'drapery') {
            const Wc = t === 8 ? W / 2 : W, part = this.curtain(Wc, H, q, pos, a), hx = this.hemX;
            const mirror = (x0, w) => `<g transform="translate(${f(x0 + w)} 0) scale(-1 1)">${part}</g>`;
            body += t === 7 ? mirror(0, W) : part;
            if (t === 8) body += mirror(W / 2, W / 2);
            body += `<rect class="cover-rod" width="${W}" height="${f(4.5 * q)}"/>`;
            if (t === 7) gv(W - hx, H / 2); else { gv(hx, H / 2); if (t === 8) gv(W - hx, H / 2); }
            if (tgt !== null) {
                const tw = this.DRAPE * Wc + (1 - this.DRAPE) * Wc * tgt / 100, g = x => `<rect class="cover-ghost" x="${f(x)}" width="${f(tw)}" height="${H}"/>`;
                body += t === 7 ? g(W - tw) : g(0) + (t === 8 ? g(W - tw) : '');
            }
        }
        else if (k === 'awning') {
            const N = 8, sw = W / N, hy = H * this.awEdge(pos), sc = 6 * q;
            let sca = '';
            for (let i = N; i > 0; i--) sca += ` Q${f((i - .5) * sw)},${f(hy + sc)} ${f((i - 1) * sw)},${f(hy)}`;
            body += `<path class="cover-aw1" d="M0,0 H${W} V${f(hy)}${sca} Z"/>`;
            for (let i = 1; i < N; i += 2) body += `<rect class="cover-aw2" x="${f(i * sw)}" width="${f(sw)}" height="${f(hy)}"/><path class="cover-aw2" d="M${f(i * sw)},${f(hy)} Q${f((i + .5) * sw)},${f(hy + sc)} ${f((i + 1) * sw)},${f(hy)} Z"/>`;
            body += `<rect class="cover-awshade" width="${W}" height="${f(hy)}"/>${bar(hy - 2.4 * q, 2.4 * q)}<rect class="cover-rod" width="${W}" height="${f(10 * q)}"/>`;
            body += ghost(H * this.awEdge(tgt ?? 0));
            gh(hy - 1.2 * q);
        }
        else if (k === 'garage') {
            const ph = H / 5, bottom = H * this.vEdge(pos);
            for (let i = 0; i < 5; i++) {
                const y = bottom - H + i * ph;
                if (y + ph <= 0) continue;
                body += `<rect class="cover-door" y="${f(y)}" width="${W}" height="${f(ph)}"/>`
                    + [.33, .66].map(g => `<rect class="cover-seam cover-groove" y="${f(y + ph * g)}" width="${W}" height="${f(.8 * q)}"/>`).join('')
                    + `<rect class="cover-seam" y="${f(y + ph - 1.4 * q)}" width="${W}" height="${f(1.4 * q)}"/>`;
            }
            body += bar(bottom - 2.6 * q, 2.6 * q) + ghost(H * this.vEdge(tgt ?? 0));
            gh(bottom - 1.3 * q);
        }
        else {
            const BAR = 5 * q, bottom = H * this.vEdge(pos);
            if (t === 0) body += `<rect class="cover-fab" width="${W}" height="${f(bottom)}"/>`;
            else {
                const P = 12 * q, aj = Math.max(0, Math.min(1, (100 - pos) / 8));
                body += `<rect class="cover-slat cover-under" width="${W}" height="${f(bottom)}"/>`;
                for (let y = bottom - BAR - P; y > -P; y -= P) {
                    body += `<rect class="cover-slat" y="${f(y)}" width="${W}" height="${f(P)}"/><rect class="cover-seam" y="${f(y + P - .9 * q)}" width="${W}" height="${f(.9 * q)}"/>`;
                    if (aj > 0) for (let x = 8 * q; x < W - 12 * q; x += 16 * q)
                        body += `<rect class="cover-slot" x="${f(x)}" y="${f(y + P - 1.2 * q - 1.3 * q * aj)}" width="${f(7 * q)}" height="${f(2.6 * q * aj)}" rx="${f(1.2 * q * aj)}" opacity="${f(.35 + .65 * aj)}"/>`;
                }
            }
            body += bar(bottom - BAR, BAR) + ghost(H * this.vEdge(tgt ?? 0));
            gh(bottom - BAR / 2);
        }
        const g = (id, x2, a1, a2) => `<linearGradient id="${id}" x2="${x2}" y2="${1 - x2}"><stop offset="0" style="stop-color:var(${a1})"/><stop offset="1" style="stop-color:var(${a2})"/></linearGradient>`;
        const defs = `<defs>${g('cover-gs', 0, '--cv-slat1', '--cv-slat2')}${g('cover-gf', 1, '--cv-fab2', '--cv-fab')}${g('cover-gd', 0, '--cv-door1', '--cv-door2')}<linearGradient id="cover-ga" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".35" stop-color="#000" stop-opacity="0"/></linearGradient></defs>`;
        return { grips, svg: `<svg class="cover-fx" viewBox="0 0 ${W} ${H}" aria-hidden="true">${defs}${body}</svg>` };
    },
    curtain(Wc, H, q, pos, a) {
        const ROWS = 12, FOLDS = Wc > 220 ? 12 : 8, f = n => n.toFixed(1);
        const open = 1 - pos / 100, width = this.DRAPE * Wc + (1 - this.DRAPE) * Wc * pos / 100;
        const v = Math.max(-1.5, Math.min(1.5, a.wv * 3)), ph = a.ph;
        const swing = Math.min(4.8 * q, Math.abs(v) * 2.6 * q) * Math.sign(v || 1), rest = open * 1.4 * q;
        const hang = t => t ** 1.3, lag = t => -Math.abs(v) * 4.6 * q * t ** 1.5 * Math.sign(v);
        const sw = (t, d = 0) => Math.sin(t * Math.PI * 1.2 + ph - d) * hang(t) * 1.4, rw = (t, d = 0) => Math.sin(t * Math.PI * 2 + ph * .6 - d) * hang(t);
        const line = xAt => Array.from({ length: ROWS + 1 }, (_, r) => [xAt(r / ROWS), H * r / ROWS]);
        const path = pts => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ');
        const hem = line(t => width + lag(t) + swing * sw(t) + rest * rw(t));
        const folds = Array.from({ length: FOLDS }, (_, j) => {
            const i = j + 1, dist = 1 - i / (FOLDS + 1), wt = (1 - dist) ** 1.3;
            return line(t => width * i / (FOLDS + 1) + lag(t) * wt + swing * 1.35 * sw(t, dist * 3.2) * wt + rest * 1.6 * rw(t, dist * 2.5) * open * (.4 + .6 * wt));
        });
        this.hemX = hem[ROWS / 2][0];
        let out = `<path class="cover-cur" d="${path([[0, 0], ...hem, [0, H]])} Z"/>`;
        for (let i = 0; i < folds.length - 1; i += 2) out += `<path class="cover-cur2" d="${path([...folds[i], ...folds[i + 1].slice().reverse()])} Z"/>`;
        return out;
    },

    frame(ctl, dt) {
        const id = parseInt(ctl.dataset.shadeid, 10), sh = (somfy.shades || []).find(x => x.shadeId === id);
        const draw = ctl.querySelector('.cover-draw');
        if (!sh || !draw) return false;
        const a = this.state(sh), t = sh.shadeType, tilt = this.tiltOnly(sh), h = this.horiz(t) && !tilt;
        let busy = this.spring(a, 'dpos', this.disp(sh), dt);
        busy = this.spring(a, 'dtilt', sh.tiltPosition || 0, dt) || busy;
        busy = (this.kind(t) === 'drapery' && this.wave(a, dt)) || busy || this.moving(sh) || draw.dataset.dragging === 'true';
        const W = draw.clientWidth, H = draw.clientHeight;
        if (!W || !H) return busy;
        const ball = draw._tdrag ?? (tilt ? draw._drag : null) ?? (this.myOn(sh) ? this._my.t : null) ?? ((parseInt(sh.tiltDirection, 10) || 0) !== 0 ? sh.tiltTarget : null) ?? a.dtilt;
        const r = this.svg(sh, a, W, H, ball);
        draw.querySelector('svg.cover-fx').outerHTML = r.svg;
        const show = this.hasPos(sh) && !tilt;
        let gs = draw.querySelectorAll('.cover-grip');
        while (show && gs.length < r.grips.length) { draw.insertAdjacentHTML('beforeend', '<i class="cover-grip"></i>'); gs = draw.querySelectorAll('.cover-grip'); }
        gs.forEach((g, i) => {
            const p = show && r.grips[i];
            g.hidden = !p;
            if (p) { g.classList.toggle('is-v', !!p[2]); g.style.left = p[0].toFixed(2) + 'px'; g.style.top = p[1].toFixed(2) + 'px'; }
        });
        const my = this.myOn(sh), myd = my && !tilt ? this.disp({ position: this._my.p, flipPosition: sh.flipPosition }) : null;
        const tgt = draw._drag ?? myd ?? (tilt ? null : this.target(sh)), mark = draw.querySelector('.cover-target');
        mark.hidden = tgt === null || tilt || !this.hasPos(sh);
        if (!mark.hidden) {
            const fr = this.frac(t, tgt) * 100;
            if (h) mark.style.left = fr + '%'; else mark.style.top = fr + '%';
            mark.classList.toggle('is-low', !h && fr > 85);
            mark.classList.toggle('is-drag', draw._drag != null);
            mark.classList.toggle('is-my', my);
            mark.firstChild.textContent = (my ? 'my ' : draw._drag != null ? '' : '→ ') + this.real(sh, tgt) + ' %';
        }
        const dir = draw.querySelector('.cover-dir'), tg = this.target(sh);
        const on = tg !== null && !tilt && !this.isSym(t) && tg !== Math.round(a.dpos);
        dir.style.display = on ? 'block' : 'none';
        if (on) {
            const opening = tg < a.dpos, right = t === 7 || t === 13 || t === 16;
            dir.style.transform = `translate(-50%,-50%) rotate(${h ? (right === opening ? 90 : -90) : opening ? 0 : 180}deg)`;
        }
        const word = somfy.shadeStateText(sh), vals = !this.hasPos(sh) ? '' : tilt ? `${sh.tiltPosition} %` : `${sh.position} %${sh.tiltType ? ` | ${sh.tiltPosition} %` : ''}`;
        const chip = /%$/.test(word) ? vals : vals ? `${word} · ${vals}` : word;
        const ce = draw.querySelector('.cover-chip');
        if (ce.textContent !== chip) ce.textContent = chip;
        draw.classList.toggle('is-open', sh.position !== somfy.closedPosition(t, sh.flipPosition));
        if (draw.hasAttribute('aria-valuenow') || this.hasPos(sh)) draw.setAttribute('aria-valuenow', tilt ? sh.tiltPosition : sh.position);
        const rail = ctl.querySelector('.cover-slider');
        if (rail) {
            const L = rail.classList.contains('is-h') ? rail.clientWidth : rail.clientHeight, g = draw.querySelector('.cover-grip');
            const pf = v => this.isSym(t) ? v / 100 : this.frac(t, v);
            let fi = pf(a.dpos) * L;
            if (g && !g.hidden && !this.isSym(t)) fi = (h ? parseFloat(g.style.left) / W : parseFloat(g.style.top) / H) * L;
            const fb = rail._drag != null ? pf(rail._drag) * L : fi, want = rail._drag ?? (tilt ? null : tgt);
            const fill = rail.firstChild, em = rail.querySelector('em'), b = rail.querySelector('b');
            if (h) { fill.style.width = fi.toFixed(2) + 'px'; b.style.left = (fb - 2).toFixed(2) + 'px'; }
            else { fill.style.height = fi.toFixed(2) + 'px'; b.style.top = (fb - 2).toFixed(2) + 'px'; }
            em.hidden = want == null;
            if (want != null) em.style[h ? 'left' : 'top'] = (pf(want) * L).toFixed(2) + 'px';
            rail.lastChild.textContent = Math.round(rail._drag ?? a.dpos);
        }
        return busy;
    },
    kick() {
        if (this._raf || !document.querySelector('.cover-ctl')) return;
        this._last = performance.now();
        this._raf = requestAnimationFrame(now => this.tick(now));
    },
    tick(now) {
        const dt = Math.min(.1, (now - this._last) / 1000);
        this._last = now;
        let busy = false;
        document.querySelectorAll('.cover-ctl').forEach(c => { busy = this.frame(c, dt) || busy; });
        this._raf = busy ? requestAnimationFrame(n => this.tick(n)) : null;
    },

    mount(root) {
        root.addEventListener('click', e => { const m = e.target.closest('[data-myact]'); if (m) return this.myAct(m); this.favClick(e, root); });
        root.addEventListener('pointerdown', e => this.favDown(e));
        root.querySelectorAll('.cover-draw, .cover-slider').forEach(el => {
            el.addEventListener('pointerdown', ev => this.down(ev, el));
            if (el.classList.contains('cover-draw')) {
                el.addEventListener('keydown', ev => this.key(ev, el));
                el.addEventListener('blur', () => this.keyCommit(el));
            }
        });
        this.kick();
    },
    down(ev, el) {
        if (ev.button !== 0 || ev.target.closest('button')) return;
        const id = parseInt(el.dataset.shadeid, 10), sh = (somfy.shades || []).find(x => x.shadeId === id);
        if (!sh) return;
        const t = sh.shadeType, rail = el.classList.contains('cover-slider'), r = el.getBoundingClientRect();
        const onGauge = !rail && this.mix(sh) && ev.clientX - r.left > r.width - 48 && ev.clientY - r.top > this.gaugeY(sh, r.height)[0] - 22;
        const tilt = this.tiltOnly(sh) || onGauge, dk = onGauge ? '_tdrag' : '_drag';
        const hz = rail ? el.classList.contains('is-h') : this.horiz(t) && !tilt;
        const fr = p => hz ? (p.clientX - r.left) / r.width : (p.clientY - r.top) / r.height;
        const side = fr(ev) < .5 ? 'L' : 'R';
        const raw = f => tilt ? this.tiltRaw(f, r.height, sh) : rail && this.isSym(t) ? f * 100 : this.raw(t, f, side);
        const val = f => this.clamp(raw(Math.max(0, Math.min(1, f))));
        const f0 = fr(ev), start = tilt ? sh.tiltPosition || 0 : this.disp(sh), x0 = ev.clientX, y0 = ev.clientY;
        const tog = somfy.toggleShadeTypes.includes(t), a = this.state(sh), dir = this.disp(sh) >= 50 ? -1 : 1;
        const prog = m => Math.max(0, (raw(fr(m)) - raw(f0)) * dir);
        const resist = x => 20 * (1 - Math.exp(-Math.max(0, x) / 30));
        let dragged = false;
        try { el.setPointerCapture(ev.pointerId); } catch (e) { }
        ev.preventDefault();
        const move = m => {
            if (!dragged && Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return;
            dragged = true;
            el.dataset.dragging = 'true';
            if (tog) { const p = prog(m); a.swipe = p < 50 ? start + dir * resist(p) : (dir > 0 ? 100 : 0) - dir * resist(100 - p); }
            else el[dk] = rail ? val(fr(m)) : this.clamp(start + raw(fr(m)) - raw(f0));
            this.kick();
        };
        const up = u => {
            el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel);
            el.dataset.dragging = 'false';
            if (tog) {
                const go = dragged ? prog(u) >= 50 : (raw(fr(u)) < 50) === (dir < 0);
                if (a.swipe != null) { a.dpos = a.swipe; a.dposV = 0; a.swipe = null; }
                this.kick();
                if (go) somfy.confirmCardCommand('shade', id, () => somfy.sendCommand(id, 'toggle'));
                return;
            }
            const v = dragged ? el[dk] : val(fr(u));
            el[dk] = null;
            this.kick();
            if (v != null) this.send(sh, tilt, v);
        };
        const cancel = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); el.dataset.dragging = 'false'; el[dk] = null; a.swipe = null; this.kick(); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel);
    },
    send(sh, tilt, v) {
        const id = sh.shadeId;
        if (this.myOn(sh)) {
            if (tilt) this._my.t = v; else this._my.p = this.real(sh, v);
            return this.myRefresh(sh);
        }
        somfy.confirmCardCommand('shade', id, () => tilt ? somfy.sendTiltCommand(id, v) : somfy.sendCommand(id, this.real(sh, v)));
    },
    key(ev, el) {
        const id = parseInt(el.dataset.shadeid, 10), sh = (somfy.shades || []).find(x => x.shadeId === id);
        if (!sh || !this.hasPos(sh)) return;
        const s = ev.shiftKey ? 10 : 1, step = { ArrowDown: s, ArrowRight: s, ArrowUp: -s, ArrowLeft: -s, PageDown: 10, PageUp: -10, Home: -100, End: 100 }[ev.key];
        if (step === undefined) return;
        ev.preventDefault();
        const tilt = this.tiltOnly(sh);
        el._drag = this.clamp((el._drag ?? (tilt ? sh.tiltPosition || 0 : this.target(sh) ?? this.disp(sh))) + step);
        el.dataset.dragging = 'true';
        clearTimeout(el._keyT);
        el._keyT = setTimeout(() => this.keyCommit(el), 500);
        this.kick();
    },
    keyCommit(el) {
        if (el._drag == null) return;
        clearTimeout(el._keyT);
        const id = parseInt(el.dataset.shadeid, 10), sh = (somfy.shades || []).find(x => x.shadeId === id), v = el._drag;
        el._drag = null;
        el.dataset.dragging = 'false';
        if (sh) this.send(sh, this.tiltOnly(sh), v);
        this.kick();
    }
};
