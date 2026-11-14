// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
class UIBinder {
    setValue(el, val) {
        if (el instanceof HTMLInputElement) {
            switch (el.type.toLowerCase()) {
                case 'checkbox':
                    el.checked = makeBool(val);
                    break;
                case 'range':
                    let dt = el.getAttribute('data-datatype');
                    let mult = parseInt(el.getAttribute('data-mult') || 1, 10);
                    switch (dt) {
                        // We always range with integers
                        case 'float':
                            el.value = Math.round(parseInt(val * mult, 10));
                            break;
                        case 'index':
                            let ivals = JSON.parse(el.getAttribute('data-values'));
                            for (let i = 0; i < ivals.length; i++) {
                                if (ivals[i].toString() === val.toString()) {
                                    el.value = i;
                                    break;
                                }
                            }
                            break;
                        default:
                            el.value = parseInt(val, 10) * mult;
                            break;
                    }
                    syncSliderProgress(el);
                    break;
                default:
                    el.value = val;
                    break;
            }
        }
        else if (el instanceof HTMLSelectElement) {
            let ndx = 0;
            for (let i = 0; i < el.options.length; i++) {
                let opt = el.options[i];
                if (opt.value === val.toString()) {
                    ndx = i;
                    break;
                }
            }
            el.selectedIndex = ndx;
        }
        else if (el instanceof HTMLElement) el.innerHTML = val;
    }
    getValue(el, defVal) {
        let val = defVal;
        if (el instanceof HTMLInputElement) {
            switch (el.type.toLowerCase()) {
                case 'checkbox':
                    val = el.checked;
                    break;
                case 'range':
                    let dt = el.getAttribute('data-datatype');
                    let mult = parseInt(el.getAttribute('data-mult') || 1, 10);
                    switch (dt) {
                        // We always range with integers
                        case 'float':
                            val = parseInt(el.value, 10) / mult;
                            break;
                        case 'index':
                            let ivals = JSON.parse(el.getAttribute('data-values'));
                            val = ivals[parseInt(el.value, 10)];
                            break;
                        default:
                            val = parseInt(el.value / mult, 10);
                            break;
                    }
                    break;
                default:
                    val = el.value;
                    break;
            }
        }
        else if (el instanceof HTMLSelectElement) val = el.value;
        else if (el instanceof HTMLElement) val = el.innerHTML;
        return val;
    }
    toElement(el, val) {
        let flds = el.querySelectorAll('*[data-bind]');
        flds.forEach((fld) => {
            let prop = fld.getAttribute('data-bind');
            let arr = prop.split('.');
            let tval = val;
            for (let i = 0; i < arr.length; i++) {
                var s = arr[i];
                if (typeof s === 'undefined' || !s) continue;
                let ndx = s.indexOf('[');
                if (ndx !== -1) {
                    ndx = parseInt(s.substring(ndx + 1, s.indexOf(']') - 1), 10);
                    s = s.substring(0, ndx - 1);
                }
                tval = tval[s];
                if (typeof tval === 'undefined') break;
                if (ndx >= 0) tval = tval[ndx];
            }
            if (typeof tval !== 'undefined') {
                if (typeof fld.val === 'function') this.val(tval);
                else {
                    switch (fld.getAttribute('data-fmttype')) {
                        case 'time':
                        {
                            var dt = new Date();
                            dt.setHours(0, 0, 0);
                            dt.addMinutes(tval);
                            tval = dt.fmt(fld.getAttribute('data-fmtmask'), fld.getAttribute('data-fmtempty') || '');
                        }
                        break;
                        case 'date':
                        case 'datetime':
                        {
                            let dt = new Date(tval);
                            tval = dt.fmt(fld.getAttribute('data-fmtmask'), fld.getAttribute('data-fmtempty') || '');
                        }
                        break;
                        case 'number':
                            if (typeof tval !== 'number') tval = parseFloat(tval);
                            tval = tval.fmt(fld.getAttribute('data-fmtmask'), fld.getAttribute('data-fmtempty') || '');
                        break;
                        case 'duration':
                            // ui.formatDuration n'existe pas (jamais implémenté) -- inatteignable de
                            // toute façon, aucun data-fmttype="duration" en usage dans le HTML actuel.
                            // $this (reliquat jQuery, inexistant dans ce code vanilla JS) corrigé en
                            // fld pour rester cohérent avec les autres cas si ce chemin est un jour
                            // activé, mais formatDuration reste à écrire avant de l'utiliser.
                            tval = ui.formatDuration(tval, fld.getAttribute('data-fmtmask'));
                            break;
                    }
                    this.setValue(fld, tval);
                }
            }
        });
    }
    fromElement(el, obj, arrayRef) {
        if (typeof arrayRef === 'undefined' || arrayRef === null) arrayRef = [];
        if (typeof obj === 'undefined' || obj === null) obj = {};
        if (typeof el.getAttribute('data-bind') !== 'undefined') this._bindValue(obj, el, this.getValue(el), arrayRef);
        let flds = el.querySelectorAll('*[data-bind]');
        flds.forEach((fld) => {
            if (!makeBool(fld.getAttribute('data-setonly')))
                this._bindValue(obj, fld, this.getValue(fld), arrayRef);
        });
        return obj;
    }
    parseNumber(val) {
        if (val === null) return;
        if (typeof val === 'undefined') return val;
        if (typeof val === 'number') return val;
        if (typeof val.getMonth === 'function') return val.getTime();
        var tval = val.replace(/[^0-9\.\-]+/g, '');
        return tval.indexOf('.') !== -1 ? parseFloat(tval) : parseInt(tval, 10);
    }
    _bindValue(obj, el, val, arrayRef) {
        var binding = el.getAttribute('data-bind');
        var dataType = el.getAttribute('data-datatype');
        if (binding && binding.length > 0) {
            var sRef = '';
            var arr = binding.split('.');
            var t = obj;
            for (var i = 0; i < arr.length - 1; i++) {
                let s = arr[i];
                if (typeof s === 'undefined' || s.length === 0) continue;
                sRef += '.' + s;
                var ndx = s.lastIndexOf('[');
                if (ndx !== -1) {
                    var v = s.substring(0, ndx);
                    var ndxEnd = s.lastIndexOf(']');
                    var ord = parseInt(s.substring(ndx + 1, ndxEnd), 10);
                    if (isNaN(ord)) ord = 0;
                    if (typeof arrayRef[sRef] === 'undefined') {
                        if (typeof t[v] === 'undefined') {
                            t[v] = new Array();
                            t[v].push(new Object());
                            t = t[v][0];
                            arrayRef[sRef] = ord;
                        }
                        else {
                            let k = arrayRef[sRef];
                            if (typeof k === 'undefined') {
                                let a = t[v];
                                k = a.length;
                                arrayRef[sRef] = k;
                                a.push(new Object());
                                t = a[k];
                            }
                            else
                                t = t[v][k];
                        }
                    }
                    else {
                        let k = arrayRef[sRef];
                        if (typeof k === 'undefined') {
                            let a = t[v];
                            k = a.length;
                            arrayRef[sRef] = k;
                            a.push(new Object());
                            t = a[k];
                        }
                        else
                            t = t[v][k];
                    }
                }
                else if (typeof t[s] === 'undefined') {
                    t[s] = new Object();
                    t = t[s];
                }
                else
                    t = t[s];
            }
            if (typeof dataType === 'undefined') dataType = 'string';
            t[arr[arr.length - 1]] = this.parseValue(val, dataType);
        }
    }
    parseValue(val, dataType) {
        switch (dataType) {
            case 'int':
                return Math.floor(this.parseNumber(val));
            case 'uint':
                return Math.abs(this.parseNumber(val));
            case 'float':
            case 'real':
            case 'double':
            case 'decimal':
            case 'number':
                return this.parseNumber(val);
            case 'date':
                // Date.parseISO n'a jamais existé (ni natif, ni défini ici) -- new Date() suffit,
                // le constructeur natif parse déjà l'ISO 8601. Inatteignable de toute façon, aucun
                // data-datatype="date" en usage dans le HTML actuel.
                if (typeof val === 'string') return new Date(val);
                else if (typeof val === 'number') return new Date(val);
                else if (typeof val.getMonth === 'function') return val;
                return undefined;
            case 'time':
                var dt = new Date();
                if (typeof val === 'number') {
                    dt.setHours(0, 0, 0);
                    dt.addMinutes(val);
                    return dt;
                }
                else if (typeof val === 'string' && val.indexOf(':') !== -1) {
                    var n = val.lastIndexOf(':');
                    var min = this.parseNumber(val.substring(n));
                    var nsp = val.substring(0, n).lastIndexOf(' ') + 1;
                    var hrs = this.parseNumber(val.substring(nsp, n));
                    dt.setHours(0, 0, 0);
                    if (hrs <= 12 && val.substring(n).indexOf('p')) hrs += 12;
                    dt.addMinutes(hrs * 60 + min);
                    return dt;
                }
                break;
            case 'duration':
                if (typeof val === 'number') return val;
                return Math.floor(this.parseNumber(val));
            default:
                return val;
        }
    }
    // Attente longue, qui couvre l'écran. msgKey : ce qui est en cours, sous l'indicateur ; il peut
    // changer en route (ui.setWaitMessage). opts.steps : [[clé, 'done' | 'cur' | 'todo'], ...],
    // les étapes d'une opération qui coupe l'interface ; opts.note : une consigne sous les étapes.
    waitMessage(el, msgKey, opts = {}) {
        let div = document.createElement('div');
        const steps = (opts.steps || []).map(([k, st]) => `<li class="is-${st}">${tr(k)}</li>`).join('');
        div.innerHTML = `
        <div class="wait-overlay-inner">
        <svg class="wait-spinner" viewBox="25 25 50 50"><circle class="wait-spinner-track" cx="50" cy="50" r="20" fill="none" stroke-width="3"/><circle class="wait-spinner-arc" cx="50" cy="50" r="20" fill="none" stroke-width="3" stroke-miterlimit="10"/></svg>
        <div class="wait-overlay-text"></div>
        ${steps ? `<ul class="wait-overlay-steps">${steps}</ul>` : ''}
        ${opts.note ? `<p class="wait-overlay-note">${tr(opts.note)}</p>` : ''}
        </div>`;
        div.classList.add('wait-overlay');
        if (typeof el === 'undefined') el = get('divContainer');
        el.appendChild(div);
        // Transition d'entrée -- cf. .overlay-entered dans overlays.css et le même appel dans
        // shOverlay() (20-shell.js) pour l'explication du offsetWidth (force le reflow avant
        // d'ajouter la classe, un seul requestAnimationFrame ne suffisant pas de façon fiable).
        void div.offsetWidth;
        div.classList.add('overlay-entered');
        this.setWaitMessage(div, msgKey);
        return div;
    }
    // Sans clé, le libellé est simplement masqué : le spinner seul reste valable pour les attentes
    // trop brèves ou trop génériques pour mériter un texte.
    setWaitMessage(overlay, msgKey) {
        if (!overlay) return;
        const txt = overlay.querySelector('.wait-overlay-text');
        if (!txt) return;
        txt.textContent = msgKey ? tr(msgKey) : '';
        txt.style.display = msgKey ? '' : 'none';
        // Sans texte, une simple pastille ; avec, une vraie fenêtre (feuille du bas sur mobile).
        overlay.classList.toggle('has-text', !!msgKey);
    }
    // Attente courte, dans le bouton qui l'a déclenchée : il garde sa largeur, sa couleur et son
    // libellé, et affiche un indicateur. aria-disabled et non disabled, que base.css grise en
    // !important ; les clics, clavier compris, sont arrêtés dans 10-core-utils.js.
    busy(btn) {
        if (!btn || btn.classList.contains('is-busy')) return () => {};
        btn.style.minWidth = btn.offsetWidth + 'px';
        btn.classList.add('is-busy');
        btn.setAttribute('aria-busy', 'true');
        btn.setAttribute('aria-disabled', 'true');
        return () => {
            btn.classList.remove('is-busy');
            btn.removeAttribute('aria-busy');
            btn.removeAttribute('aria-disabled');
            btn.style.minWidth = '';
        };
    }
    // Texte d'une erreur de requête dans la langue de l'interface (HTML : ce qui vient d'une saisie,
    // owner par exemple, est échappé ici). Sert au bandeau et aux fenêtres à onConfirm.
    errorText(err) {
        if (err && (err.noResponse || err instanceof TypeError)) return '';
        let msg = '';
        if (typeof err === 'string' && err.startsWith('{')) {
            let e = JSON.parse(err);
            if (typeof e !== 'undefined' && typeof e.desc === 'string') msg = e.desc;
            else msg = err;
        }
        else if (typeof err === 'string') msg = err;
        else if (typeof err === 'number') {
            switch (err) {
                case 404:
                    msg = `404: Service not found`;
                    break;
                default:
                    msg = `${err}: Service Error`;
                    break;
            }
        }
        else if (typeof err !== 'undefined') {
            if (typeof err.desc === 'string') {
                msg = typeof err.desc !== 'undefined' ? err.desc : err.message;
                if (typeof err.code === 'number') {
                    let e = errors.find(x => x.code === err.code) || { code: err.code, desc: 'Unspecified error' };
                    msg = e.desc;
                }
            }
        }
        // Erreur applicative du boitier : elle porte un CODE stable et des champs structures (pin,
        // line, line2, owner/ownerKey), ce qui permet de la rendre dans la langue de l'interface au
        // lieu de l'anglais fige du firmware. trOr() conserve ce desc anglais tant que la cle
        // ERR_<code> n'existe pas au dictionnaire : aucune regression possible, et le mecanisme vaut
        // pour TOUS les codes de l'API -- pas seulement ceux de la radio.
        // Le test porte sur une chaine : err.code numerique appartient a la table d'erreurs interne
        // traitee juste au-dessus, ce sont deux choses differentes.
        if (err && typeof err === 'object' && typeof err.code === 'string') {
            const proprio = typeof err.owner === 'string' ? err.owner
                          : (err.ownerKey ? tr(err.ownerKey) : '');
            const modele = trOr('ERR_' + err.code, null);
            // msg part dans un innerHTML et `owner` est un nom saisi par l'utilisateur : on echappe,
            // ici comme sur le repli anglais, qui transporte ce meme nom.
            // Substitution GLOBALE : String.replace(chaine) ne remplace que la premiere occurrence,
            // et rien n'interdit a une traduction de reprendre un jeton -- {line} dans une tournure
            // qui le repete, par exemple.
            const champs = {
                pin: escHtml(String(err.pin ?? '')),
                line: escHtml(String(err.line ?? '')),
                line2: escHtml(String(err.line2 ?? '')),
                owner: escHtml(proprio)
            };
            msg = modele
                ? modele.replace(/\{(pin|line2|line|owner)\}/g, (m, k) => champs[k])
                : escHtml(msg);
        }

        // Libellé HTTP générique en anglais (Unauthorized, Not Found…) : le titre traduit le dit déjà.
        if (err && typeof err === 'object' && err.code === undefined && msg === httpStatusText[err.htmlError]) msg = '';
        return msg;
    }
    _errorKind(err) {
        const o = err && typeof err === 'object' ? err : {};
        if (o.noResponse || err instanceof TypeError) return 'none';
        if (o.code === 'RESP_MALFORMED' || o.code === 'RESP_TRUNCATED') return 'unreadable';
        if (o.code !== undefined || (o.htmlError >= 400 && o.htmlError < 500)) return 'refused';
        return 'failed';
    }
    errorTitle(err) {
        return { none: tr('ERR_BANNER_NO_RESPONSE'), unreadable: tr('ERR_BANNER_UNREADABLE'),
                 refused: tr('ERR_BANNER_REFUSED'), failed: tr('ERR_BANNER_FAILED') }[this._errorKind(err)];
    }
    serviceError(el, err) {
        if (arguments.length === 1) err = el;
        logger.error('Service error:', err);
        const o = err && typeof err === 'object' ? err : {};
        const kind = this._errorKind(err);
        return this.banner({
            id: 'service',
            // Réponse illisible ou refus : l'appareil répond, c'est un avertissement, pas une panne.
            level: kind === 'unreadable' || kind === 'refused' ? 'warn' : 'danger',
            title: this.errorTitle(err),
            text: this.errorText(err),
            details: [o.service, kind === 'none' ? '' : o.htmlError].filter(Boolean).join(' · ')
        });
    }
    // Bandeau en haut, au-dessus des fenêtres : erreurs de requête et connexion perdue. Un bandeau
    // à id remplace le précédent du même id ; first le place en tête. title, details : texte ; text : HTML.
    banner(o) {
        let stack = get('divBannerStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'divBannerStack';
            stack.className = 'banner-stack';
            document.body.appendChild(stack);
        }
        const lvl = o.level || 'danger';
        const el = (o.id && stack.querySelector(`[data-banner-id="${o.id}"]`)) || document.createElement('div');
        el.className = `banner banner-${lvl}`;
        el.setAttribute('role', 'alert');
        if (o.id) el.dataset.bannerId = o.id;
        el.innerHTML = `<span class="banner-icon"><svg><use href="#${o.icon || { info: 'svg-info', warn: 'svg-warning', danger: 'svg-error' }[lvl]}"></use></svg></span>
        <div class="banner-texts"><p class="banner-line"><b class="banner-title"></b>${o.text ? ` <span class="banner-text">${o.text}</span>` : ''}</p>
        ${o.details ? `<details class="banner-details"><summary>${tr('ERR_TECH_DETAILS')}</summary><code></code></details>` : ''}</div>
        <span class="banner-actions"></span>`;
        el.querySelector('.banner-title').textContent = o.title || '';
        if (o.details) el.querySelector('.banner-details code').textContent = o.details;
        const acts = el.querySelector('.banner-actions');
        (o.actions || []).forEach(act => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'banner-btn';
            btn.textContent = act.label;
            btn.onclick = act.onClick;
            acts.appendChild(btn);
        });
        if (o.closable !== false) {
            const x = document.createElement('button');
            x.type = 'button';
            x.className = 'banner-close';
            x.setAttribute('aria-label', tr('BT_CLOSE'));
            x.innerHTML = '<svg><use href="#svg-close"></use></svg>';
            x.onclick = () => el.remove();
            acts.appendChild(x);
        }
        if (!el.parentNode) o.first ? stack.prepend(el) : stack.appendChild(el);
        return el;
    }
    closeBanner(id) {
        document.querySelector(`#divBannerStack [data-banner-id="${id}"]`)?.remove();
    }
    // Fenêtre de message unique : confirmation, erreur, information. La Promise rend
    // { button, checked } dès le clic, la fenêtre s'efface ensuite ; croix, Échap, poignée ou
    // fermeture par clearErrors() valent 'cancel'. title et libellés : texte. desc, cons, html :
    // HTML, l'appelant échappe ce qui vient d'une saisie.
    dialog(o) {
        const lvl = o.level || 'info';
        const id = `msgTitle${this._msgN = (this._msgN || 0) + 1}`;
        const icon = o.icon || { info: 'svg-info', warn: 'svg-warning', danger: 'svg-warning', ok: 'svg-check' }[lvl];
        const body = [
            o.cons && o.cons.length ? `<ul class="msg-cons">${o.cons.map(c => `<li>${c}</li>`).join('')}</ul>` : '',
            o.html || '',
            o.check ? `<label class="msg-check"><input type="checkbox"><span></span></label>` : ''
        ].join('');
        const div = document.createElement('div');
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content msg-window msg-alert msg-${lvl}" role="alertdialog" aria-modal="true" aria-labelledby="${id}">
        <div class="modalHeader-handle" onclick="handleMobileDismiss(this)"></div>
        <div class="msg-head">
        <span class="msg-icon"><svg><use href="#${icon}"></use></svg></span>
        <div class="msg-texts"><h2 class="msg-title" id="${id}"></h2>${o.desc ? `<div class="msg-desc">${o.desc}</div>` : ''}</div>
        </div>
        ${body ? `<div class="msg-body">${body}</div>` : ''}
        <p class="msg-error" role="alert" hidden></p>
        <div class="msg-foot"></div>
        </div>`;
        const win = div.firstElementChild, foot = win.querySelector('.msg-foot');
        win.querySelector('.msg-title').textContent = o.title || '';
        const check = win.querySelector('.msg-check input');
        if (check) check.nextElementSibling.textContent = o.check.label;
        (o.buttons || [{ id: 'cancel', label: tr('BT_CLOSE'), kind: 'primary' }]).forEach(b => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gen-btn' + (b.kind ? ` gen-btn-${b.kind}` : '');
            btn.dataset.id = b.id;
            btn.innerHTML = `<span class="msg-btn-long"></span>${b.short ? '<span class="msg-btn-short"></span>' : ''}`;
            btn.firstChild.textContent = b.label;
            if (b.short) btn.lastChild.textContent = b.short;
            foot.appendChild(btn);
        });
        // Engagement : seul 'cancel' reste actif tant que la case n'est pas cochée.
        const gate = () => foot.querySelectorAll('button:not([data-id="cancel"])').forEach(b => { b.disabled = !check.checked; });
        if (check && o.check.required) { check.onchange = gate; gate(); }

        return new Promise(resolve => {
            let done = false;
            const finish = (button) => {
                if (done) return;
                done = true;
                document.removeEventListener('keydown', onKey);
                resolve({ button, checked: !!(check && check.checked) });
            };
            const onKey = (e) => {
                if (e.key !== 'Escape' || win.classList.contains('is-busy')) return;
                if (div !== [...document.querySelectorAll('.modal-overlay:not(.overlay-exit)')].pop()) return;
                e.stopPropagation();
                finish('cancel');
                closeOverlay(div);
            };
            document.addEventListener('keydown', onKey);
            div._onClosed = () => finish('cancel');
            foot.onclick = async (e) => {
                const btn = e.target.closest('button');
                if (!btn || btn.disabled || btn.classList.contains('is-busy')) return;
                // onConfirm asynchrone : la fenêtre reste ouverte, bouton occupé, et affiche
                // l'erreur sur place si l'appareil refuse, au lieu d'en ouvrir une seconde.
                if (btn.dataset.id !== 'cancel' && typeof o.onConfirm === 'function') {
                    const others = [...foot.querySelectorAll('button')].filter(b => b !== btn);
                    const err = win.querySelector('.msg-error');
                    others.forEach(b => { b.disabled = true; });
                    win.classList.add('is-busy');
                    const release = this.busy(btn);
                    err.hidden = true;
                    try { await o.onConfirm(btn.dataset.id); }
                    catch (x) {
                        others.forEach(b => { b.disabled = false; });
                        if (check && o.check.required) gate();
                        win.classList.remove('is-busy');
                        release();
                        err.innerHTML = this.errorText(x) || this.errorTitle(x);
                        err.hidden = false;
                        return;
                    }
                }
                finish(btn.dataset.id);
                closeOverlay(div);
            };
            shOverlay(div);
            // Une action qui détruit ne doit pas partir sur un Entrée réflexe.
            const focus = lvl === 'danger' ? foot.querySelector('[data-id="cancel"]') : foot.lastElementChild;
            if (focus) focus.focus();
        });
    }
    async confirm(o) {
        const r = await this.dialog(Object.assign({ level: 'warn' }, o, {
            buttons: [
                { id: 'cancel', label: o.cancel || tr('BT_CANCEL') },
                { id: 'ok', label: o.confirm, kind: o.level === 'danger' ? 'danger' : 'primary' }
            ]
        }));
        return r.button === 'ok';
    }
    alert(o) {
        return this.dialog(Object.assign({ level: 'info' }, o, {
            buttons: [{ id: 'cancel', label: o.close || tr('BT_CLOSE'), kind: 'primary' }]
        }));
    }

    // Erreur de saisie sous le champ (gabarit .gen-field) : l'onglet qui le contient s'affiche, le
    // champ prend le focus, et le message part dès que la valeur change. Hors gabarit, la fenêtre.
    // html : l'appelant échappe ce qui vient d'une saisie.
    fieldError(field, html) {
        const el = typeof field === 'string' ? get(field) : field;
        const wrap = el && el.closest('.gen-field');
        if (!wrap) return this.errorMessage(html);
        this.clearFieldError(el);
        const panel = el.closest('[role="tabpanel"][data-tab]');
        if (panel && panel.hidden) {
            const sel = `.gen-tab[data-tab="${panel.dataset.tab}"]`;
            let n = panel.parentElement;
            while (n && !n.querySelector(sel)) n = n.parentElement;
            n?.querySelector(sel)?.click();
        }
        (wrap.querySelector('.gen-input-box') || el).classList.add('is-invalid');
        const msg = document.createElement('p');
        msg.className = 'gen-field-error';
        msg.id = `${el.id || 'fld'}Error`;
        msg.innerHTML = html;
        wrap.appendChild(msg);
        el.setAttribute('aria-invalid', 'true');
        el.setAttribute('aria-describedby', msg.id);
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const clear = () => this.clearFieldError(el);
        el.addEventListener('input', clear, { once: true });
        el.addEventListener('change', clear, { once: true });
        return msg;
    }
    clearFieldError(field) {
        const el = typeof field === 'string' ? get(field) : field;
        const wrap = el && el.closest('.gen-field');
        if (!wrap) return;
        wrap.querySelector('.gen-input-box.is-invalid')?.classList.remove('is-invalid');
        wrap.querySelector('.gen-field-error')?.remove();
        el.removeAttribute('aria-invalid');
        el.removeAttribute('aria-describedby');
    }
    errorMessage(el, title, subMsg, extraMsg) {
        const args = (el instanceof HTMLElement ? [title, subMsg, extraMsg] : [el, title, subMsg, extraMsg])
            .filter(a => a !== undefined && a !== null && a !== '');
        const head = args.length > 1 ? args[0] : tr('ERROR');
        const lines = args.length > 1 ? args.slice(1) : args;
        this.clearErrors();
        return this.alert({ level: 'danger', title: head, desc: lines.map(m => `<p>${m}</p>`).join('') });
    }
    infoMessage(el, title, msg, onOk) {
        if (typeof el === 'string') {
            onOk = msg;
            msg = title;
            title = el;
        }
        this.clearErrors();
        return this.alert({ level: 'info', title: tr(title), desc: msg != null ? `<p>${tr(msg)}</p>` : '' })
            .then(() => { if (typeof onOk === 'function') onOk(); });
    }


    // Ne ferme QUE les fenêtres d'alerte (.msg-alert : ui.dialog() et ses appelants) : la même classe les exclut de la fermeture au clic
    // extérieur (20-shell.js). Tout div.modal-overlay refermerait aussi un formulaire ouvert
    // derrière une simple erreur de validation, avec perte de la saisie en cours.
    clearErrors() {
        document.querySelectorAll('div.modal-overlay:not(.overlay-exit)').forEach((el) => {
            if (el.querySelector('.msg-alert')) closeOverlay(el);
        });
    }
    // Message bref, en bas : une seule pile (suggestions de langue comprises), posée au-dessus
    // de la barre d'enregistrement ou de l'ancien pied s'ils sont à l'écran. title : texte,
    // detail : HTML. Un message à id ne s'affiche qu'une fois ; duration 0 = jusqu'à close().
    toast(o) {
        if (typeof o === 'string') o = { title: o };
        let stack = get('divToastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'divToastStack';
            stack.className = 'toast-stack';
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        this.placeToasts();
        if (o.id && this.findToast(o.id)) return this.findToast(o.id);

        const el = document.createElement('div');
        let timer = 0;
        const t = {
            el,
            close: () => {
                clearTimeout(timer);
                el.classList.add('is-leaving');
                setTimeout(() => el.remove(), 300);
            },
            update: (p) => {
                Object.assign(o, p);
                const lvl = o.level || 'ok';
                el.className = `toast toast-${lvl}${o.busy ? ' is-busy' : ''}${el.classList.contains('is-shown') ? ' is-shown' : ''}`;
                const icon = o.icon || { ok: 'svg-check', info: 'svg-info', warn: 'svg-warning', danger: 'svg-error' }[lvl];
                el.innerHTML = `<span class="toast-icon"><svg><use href="#${icon}"></use></svg></span>
                <span class="toast-texts"><b class="toast-title"></b>${o.detail ? `<span class="toast-detail">${o.detail}</span>` : ''}</span>
                <span class="toast-actions"></span>`;
                el.querySelector('.toast-title').textContent = o.title || '';
                (o.actions || []).forEach(act => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'toast-btn';
                    btn.textContent = act.label;
                    btn.onclick = () => act.onClick(t);
                    el.querySelector('.toast-actions').appendChild(btn);
                });
                clearTimeout(timer);
                const ms = o.duration ?? (o.actions && o.actions.length ? 6000 : 3500);
                if (ms > 0) timer = setTimeout(t.close, ms);
            }
        };
        el._toast = t;
        if (o.id) el.dataset.toastId = o.id;
        t.update({});
        stack.appendChild(el);
        void el.offsetWidth;
        el.classList.add('is-shown');
        return t;
    }
    // Rappelée par la barre d'enregistrement quand elle monte ou descend : la pile la suit.
    placeToasts() {
        const stack = get('divToastStack');
        if (!stack) return;
        const covered = [...document.querySelectorAll('.save-bar, .button-container-footerHtml')]
            .map(b => b.getBoundingClientRect()).filter(r => r.height > 0 && r.top < innerHeight)
            .map(r => innerHeight - r.top);
        stack.style.setProperty('--toast-offset', Math.max(0, ...covered) + 'px');
    }
    findToast(id) {
        const el = document.querySelector(`#divToastStack [data-toast-id="${id}"]:not(.is-leaving)`);
        return el ? el._toast : null;
    }
    /**Dirige l'attention de l'utilisateur sur un élément spécifique
     * @param {string|HTMLElement} target - ID de l'élément ou l'élément lui-même
     * @param {boolean} activate - Activer ou désactiver l'animation
     * @param {string} color - Couleur spécifique (ex: 'red', '#FFA500')
     */
    setFocus(target, activate = true, color = null) {
        let el = (typeof target === 'string') ? document.getElementById(target) : target;
        if (!el) return;
        if (el.tagName === 'BUTTON' && el.classList.contains('unibutton')) {
            el = el.closest('.uniblocCol') || el;
        }

        if (activate) {
            if (color) el.style.setProperty('--pulse-color', color);
            el.classList.add('ui-pulse');
        } else {
            el.classList.remove('ui-pulse');
            el.style.removeProperty('--pulse-color');
        }
    }
    wizSetStep(el, step) {
        let curr = this.wizCurrentStep(el);
        let sStep = step.toString();

        el.setAttribute('data-stepid', step);
        // Consommé par .stepper-wrapper::after (overlays.css) pour la largeur de la barre de
        // liaison, et par .completed/.active ci-dessous pour les puces -- généralisé à N'IMPORTE
        // QUEL nombre d'étapes (calc(), pas une liste de règles [data-stepid="N"] figée) : cf.
        // l'assistant de calibration, qui peut dépasser les ~4-5 étapes des autres wizards.
        el.style.setProperty('--current-step', step);
        el.querySelectorAll('.stepper-item[data-stepid]').forEach(item => {
            const n = parseInt(item.getAttribute('data-stepid'), 10);
            const isCompleted = n < step;
            item.classList.toggle('completed', isCompleted);
            item.classList.toggle('active', n === step);
            // Étape validée : remplace le chiffre du cercle par un check (svg-check, cf. index.html)
            // -- restauré dès qu'elle redevient active/à venir (retour arrière via
            // un retour arrière). Point d'entrée unique pour tous les wizards du projet (appairage,
            // désappairage, calibration, mise à jour OTA...), tous pilotés par ce même wizSetStep().
            const counter = item.querySelector('.step-counter');
            if (counter) counter.innerHTML = isCompleted ? '<svg><use href="#svg-check"></use></svg>' : n;
        });
        el.querySelectorAll('[data-stepid], [data-ustepid], [data-mstepid]').forEach(item => {
            if (item.classList.contains('stepper-item')) return;
            if (item === el) return;

            let show = true;

            if (item.hasAttribute('data-stepid')) {
                show = item.getAttribute('data-stepid') === sStep;
            }
            else if (item.hasAttribute('data-ustepid')) {
                show = item.getAttribute('data-ustepid') !== sStep;
            }
            else if (item.hasAttribute('data-mstepid')) {
                let steps = item.getAttribute('data-mstepid').split(',');
                show = steps.includes(sStep);
            }
            item.style.display = show ? '' : 'none';
        });
        if (curr !== step) {
            let evt = new CustomEvent('stepchanged', { detail: { oldStep: curr, newStep: step }, bubbles: true });
            el.dispatchEvent(evt);
        }
    }
    wizCurrentStep(el) { return parseInt(el.getAttribute('data-stepid') || 1, 10); }
    pinKeyPressed(evt) {
        let el = evt.target || evt.srcElement;
        let parent = el.parentElement;
        let digits = Array.from(parent.querySelectorAll('.pin-digit'));
        let index = digits.indexOf(el);
        switch (evt.key) {
            case 'Backspace':
                if (el.value === '' && index > 0) digits[index - 1].focus();
                return;
            case 'ArrowLeft':
                if (index > 0) digits[index - 1].focus();
                return;
            case 'ArrowRight':
                if (index < digits.length - 1) digits[index + 1].focus();
                return;
            case 'Enter':
                if (typeof security !== 'undefined') security.login();
                return;
        }
        setTimeout(() => {
            if (el.value.length > 1) el.value = el.value.slice(-1);
            // Écran de saisie du PIN : même règle qu'à la définition du code (cf.
            // General.renderSecurityTile), pour la raison supplémentaire qu'une lettre comptait ici
            // comme un chiffre saisi -- quatre frappes suffisaient donc à déclencher la tentative
            // de connexion, forcément refusée, et à faire monter le repli exponentiel de
            // handleLogin (WebAuth.cpp) sur une simple faute de frappe.
            if (!/^[0-9]$/.test(el.value)) el.value = "";
            if (el.value !== "" && index < digits.length - 1) {
                digits[index + 1].focus();
            }
            const pin = digits.map(d => d.value).join('');
            if (pin.length === 4) {
                if (typeof security !== 'undefined') {
                    security.login();
                } else if (typeof general !== 'undefined' && typeof general.login === 'function') {
                    general.login();
                }
            }
        }, 20);
    }
    pinDigitFocus(evt) {
        evt.srcElement.select();
    }
    isConfigOpen() { return window.getComputedStyle(get('divConfigPnl')).display !== 'none'; }

    // Point d'entrée générique "ouvrir la config" (bouton engrenage) : conserve le comportement
    // historique d'atterrir sur Système par défaut. Toute la logique d'ouverture (auth, socket
    // join, bascule DOM, hash) vit désormais dans activateGrpid(), point d'entrée unique du routeur.
    setConfigPanel() { activateGrpid('divSystemSettings'); }
    showRadioConfig() { activateGrpid('divTransceiverSettings'); }
    // Carte d'accueil "Système" (index.html). Manquait alors que ses trois voisines visaient des
    // méthodes réelles : le clic levait un TypeError et ne faisait rien. Même destination que
    // setConfigPanel() ci-dessus, gardée comme point d'entrée du bouton engrenage -- deux noms
    // parce que les deux appelants sont distincts, et que le nom showXxxConfig est celui qu'attend
    // la série des cartes d'accueil.
    showSystemConfig() { this.setConfigPanel(); }
    showNetworkConfig() { activateGrpid('divNetworkSettings'); }
    showShadeConfig() {
        activateGrpid('divSomfyMotors');
        if (typeof shadeSetup !== 'undefined') shadeSetup.open();
    }
}
var ui = new UIBinder();
// Bascule entre le tableau de bord habituel et l'assistant de premier démarrage (Onboarding
// Wizard) -- appelé partout où le code affichait auparavant divAuthenticated directement
// (Security.init()/login()/cancelLogin()), pour ne pas dupliquer la condition à 3 endroits.
// L'assistant ne s'affiche automatiquement qu'en mode AP et tant qu'il n'est pas terminé/ignoré
// (window.__onboardingDone, cf. loadContext()) -- une relance manuelle (onboarding.relaunch())
// l'ouvre directement sans passer par ici, donc sans dépendre du mode AP.
function showAuthenticatedShellOrWizard() {
    if (isApMode && !window.__onboardingDone) {
        get('divAuthenticated').style.display = 'none';
        setOnboardingLock(true);
        onboarding.open();
    } else {
        const wiz = get('divOnboardingWizard');
        if (wiz) wiz.style.display = 'none';
        setOnboardingLock(false);
        get('divAuthenticated').style.display = '';
    }
}
// Neutralise (ou rétablit) la navigation pendant que l'assistant occupe l'écran. Point unique :
// l'assistant s'ouvre aussi bien automatiquement (ci-dessus) que manuellement
// (onboarding.relaunch()), et l'oubli d'un des deux équipements dans l'un des cas est exactement ce qui
// laissait un trou.
//
// La topbar/sidebar sont hors de #divContainer (chrome partagé, toujours dans le DOM) -- la topbar
// reste visible et sans élément focalisable (logo, badge Hotspot/LAN, uptime), la sidebar reste
// affichée mais body.onboarding-active la floute et la rend non cliquable (main.css).
//
// inert EN PLUS de la classe : filter/pointer-events n'arrêtent que la souris, pas le clavier.
// Ce que ça rattrape exactement, mesuré plutôt que supposé : les entrées de navigation sont des
// <a> SANS href, donc déjà hors de l'ordre de tabulation -- la sidebar n'expose en réalité que deux
// <button>, #btnReboot ("Redémarrer", toujours visible) et #divSidebarUpdate (mise à jour firmware,
// affiché seulement quand il y en a une). Peu de surface, mais la pire possible : une tabulation
// puis Entrée redémarrait l'ESP32 en plein assistant.
// Et le garde-fou d'activateGrpid() ne couvrait pas ce cas, même en mode automatique : il filtre la
// NAVIGATION, pas une action directe comme un redémarrage.
// inert retire l'élément et toute sa descendance de l'ordre de tabulation, de la cible des
// pointeurs et de l'arbre d'accessibilité, en une propriété -- et sur un navigateur trop ancien
// pour le connaître, on retombe simplement sur le comportement d'avant, pas pire.
function setOnboardingLock(active) {
    document.body.classList.toggle('onboarding-active', active);
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.inert = active;
}
