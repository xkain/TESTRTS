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
                            tval = ui.formatDuration(tval, $this.attr('data-fmtmask'));
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
                            k = arrayRef[sRef];
                            if (typeof k === 'undefined') {
                                a = t[v];
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
                        k = arrayRef[sRef];
                        if (typeof k === 'undefined') {
                            a = t[v];
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
                if (typeof val === 'string') return Date.parseISO(val);
                else if (typeof val === 'number') return new Date(number);
                else if (typeof val.getMonth === 'function') return val;
                return undefined;
            case 'time':
                var dt = new Date();
                if (typeof val === 'number') {
                    dt.setHours(0, 0, 0);
                    dt.addMinutes(tval);
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
    formatValue(val, dataType, fmtMask, emptyMask) {
        var v = this.parseValue(val, dataType);
        if (typeof v === 'undefined') return emptyMask || '';
        switch (dataType) {
            case 'int':
            case 'uint':
            case 'float':
            case 'real':
            case 'double':
            case 'decimal':
            case 'number':
                return v.fmt(fmtMask, emptyMask || '');
            case 'time':
            case 'date':
            case 'dateTime':
                return v.fmt(fmtMask, emptyMask || '');
        }
        return v;
    }
    // msgKey (optionnel) : clé de traduction affichée SOUS le spinner, pour dire à l'utilisateur ce
    // qui est en cours plutôt que de le laisser devant une animation muette. Le libellé peut être
    // changé en cours de route via ui.setWaitMessage() quand une opération enchaîne plusieurs
    // phases (ex: enregistrement puis attente de bascule réseau).
    waitMessage(el, msgKey) {
        let div = document.createElement('div');
        div.innerHTML = `
        <div class="wait-overlay-inner">
        <div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
        <div class="wait-overlay-text"></div>
        </div>`;
        div.classList.add('wait-overlay');
        if (typeof el === 'undefined') el = get('divContainer');
        el.appendChild(div);
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
    }
    serviceError(el, err) {
        let title = tr('ERROR_SERVICE_TITLE') || 'Service Error'; // Utilise la traduction si dispo, sinon fallback
        if (arguments.length === 1) {
            err = el;
            el = get('divContainer');
        }
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
                    title = err.desc;
                }
            }
        }
        logger.error('Service error:', err);

        // On appelle notre errorMessage tout beau, tout neuf !
        let div = this.errorMessage(el, `${err.htmlError || 500}: ${title}`);
        let sub = div.querySelector('.sub-message');

        // On injecte les détails avec notre charte graphique (sans le font-size de 22px qui casserait l'harmonie)
        sub.innerHTML = `
        <div style="margin-bottom: 10px;">
        <strong style="opacity: 0.7;">Service:</strong> ${err.service || 'Unknown'}
        </div>
        <div style="font-weight: 600; opacity: 0.9;">
        ${msg}
        </div>
        `;
        return div;
    }


    /*
    serviceError(el, err) {
        let title = 'Service Error'
        if (arguments.length === 1) {
            err = el;
            el = get('divContainer');
        }
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
                    title = err.desc;
                }
            }
        }
        console.log(err);
        let div = this.errorMessage(`${err.htmlError || 500}:${title}`);
        let sub = div.querySelector('.sub-message');
        sub.innerHTML = `<div><label>Service:</label>${err.service}</div><div style="font-size:22px;">${msg}</div>`;
        return div;
    }

    */



    socketError(el, msg) {
        if (arguments.length === 1) {
            msg = el;
            el = get('divContainer');
        }
        let existing = document.querySelector('.socket-error');
        if (existing) {
            // Si l'overlay existe déjà, on met juste à jour le message d'erreur interne au cas où il change
            let subMsg = existing.querySelector('.sub-message-text');
            if (subMsg) subMsg.innerHTML = msg;
            return existing;
        }

        let div = document.createElement('div');
        div.className = 'error-message socket-error modal-overlay';

        // Structure générique avec textes en dur (Anglais)
        div.innerHTML = `
        <div class="message-content error-content">
        ${modalHeader('Connection Error', 'svg-error', { type: 'small danger' })}
        <div class="sub-message">
        <p style="font-weight: 600; margin-bottom: 8px;">Unable to connect to the server</p>
        <p class="sub-message-text" style="font-size: 0.85em; opacity: 0.8;">${msg}</p>

        <!-- Compteur de tentatives stylisé en bas du message -->
        <div id="divSocketAttempts" class="socketAttempts" style="margin-top: 20px; font-size: 0.85em; opacity: 0.6;">
        <span>Connection attempts: </span><span id="spanSocketAttempts" style="font-weight: 600;">1</span>
        </div>
        </div>
        </div>`;

        el.appendChild(div);
        shOverlay(div);
        return div;
    }


























    errorMessage(el, title, subMsg, extraMsg) {
        this.clearErrors();

        // 1. Si le premier argument n'est pas un élément HTML, c'est une chaîne de caractères
        let container = el;
        let args = [title, subMsg, extraMsg];

        if (!(el instanceof HTMLElement)) {
            container = get('divContainer');
            // Si 'el' n'est pas un élément, c'était le premier texte passé !
            args = [el, title, subMsg, extraMsg].filter(a => a !== undefined && a !== null && a !== '');
        } else {
            args = args.filter(a => a !== undefined && a !== null && a !== '');
        }

        let headerTitle = tr('ERROR'); // Titre par défaut
        let bodyMessages = [];

        // 2. Gestion selon le nombre d'arguments textuels passés
        if (args.length === 1) {
            // 1 seul argument -> Titre par défaut ("ERROR"), le texte va dans le sous-message
            bodyMessages.push(args[0]);
        } else if (args.length === 2) {
            // 2 arguments -> Le 1er est le titre, le 2ème est le sous-message
            headerTitle = args[0];
            bodyMessages.push(args[1]);
        } else if (args.length >= 3) {
            // 3 arguments (ou +) -> Le 1er est le titre, tous les suivants sont regroupés dans le sous-message
            headerTitle = args[0];
            bodyMessages = args.slice(1);
        }

        // Construction du HTML du sous-message
        const bodyContent = bodyMessages.map(msg => `<p>${msg}</p>`).join('');

        let div = document.createElement('div');
        div.className = 'error-message modal-overlay';

        div.innerHTML = `
        <div class="message-content error-content">
        ${modalHeader(headerTitle, 'svg-error', { type: 'small danger' })}
        <div class="sub-message">
        ${bodyContent}
        </div>
        <div class="button-container-row">
        <button type="button" onclick="ui.clearErrors();">${tr('BT_CLOSE')}</button>
        </div>
        </div>`;

        container.appendChild(div);
        shOverlay(div);
        return div;
    }
    promptMessage(el, msg, onYes, isDanger = false, iconId = null) {
        // Gestion des arguments dynamiques d'origine
        if (arguments.length === 2 || (arguments.length === 3 && typeof msg === 'function')) {
            if (typeof msg === 'function') {
                isDanger = onYes;
                onYes = msg;
                msg = el;
                el = get('divContainer');
            }
        }
        if (!iconId) {
            iconId = isDanger ? 'svg-reboot' : 'svg-info'; // Remplace 'svg-info' par ton id d'icône par défaut si besoin
        }

        let div = document.createElement('div');
        div.className = 'modal-overlay';
        const redAttr = isDanger ? 'red' : '';
        const modalType = isDanger ? 'small danger' : 'small';
        // Nouvelle structure avec le conteneur d'icône "prompt-header-block"
        div.innerHTML = `
        <div class="message-content prompt-content">
        ${modalHeader(msg, iconId, { type: modalType })}

        <div class="sub-message"></div>
        <div class="button-container-row">
        <button line type="button" onclick="ui.clearErrors();">${tr('BT_NO')}</button>
        <button id="btnYes" ${redAttr} type="button">
        ${isDanger ? `<svg><use href="#svg-retry"></use></svg>` : ''} <span>${tr('BT_YES')}</span>
        </button>
        </div>
        </div>`;

        el.appendChild(div);
        shOverlay(div);

        div.querySelector('#btnYes').onclick = () => {
            if (typeof onYes === 'function') onYes();
            ui.clearErrors();
        };
        return div;
    }
    infoMessage(el, title, msg, onOk) {
        this.clearErrors();

        // Gestion dynamique des arguments (si "el" n'est pas fourni)
        if (typeof el === 'string') {
            onOk = msg;
            msg = title;
            title = el;
            el = get('divContainer');
        }

        let div = document.createElement('div');
        div.className = 'info-message modal-overlay';

        // Traduction automatique du titre et du message si ce sont des clés de langue
        const headerTitle = tr(title) || title || tr('INFORMATION');
        const contentMsg = (msg !== undefined && msg !== null) ? (tr(msg) || msg) : '';

        div.innerHTML = `
        <div class="message-content info-content">
        ${modalHeader(headerTitle, 'svg-info', { type: 'small' })}

        <div class="sub-message">
        ${contentMsg ? `<p>${contentMsg}</p>` : ''}
        </div>

        <div class="button-container-row">
        <button id="btnOk" type="button">${tr('BT_OK')}</button>
        </div>
        </div>`;

        el.appendChild(div);
        shOverlay(div);

        const btnOk = div.querySelector('#btnOk');
        btnOk.onclick = () => {
            if (typeof onOk === 'function') onOk();
            ui.clearErrors();
        };

        return div;
    }


    clearErrors() {
        let errors = document.querySelectorAll('div.modal-overlay');
        errors.forEach((el) => {
            // Certaines fenêtres (ex: la confirmation de sauvegarde réseau) doivent rester ouvertes
            // même quand un message de succès s'affiche ailleurs (successMessage() appelle
            // clearErrors()), le temps que l'ESP32 termine réellement sa reconnexion.
            if (el.dataset.keepOpen === 'true') return;
            closeOverlay(el);
        });
    }
    successMessage(msg) {
        this.clearErrors();
        let el = get('divContainer');

        let div = document.createElement('div');
        div.innerHTML = `<div class="success-content"><svg class="icon-svg"><use href="#svg-succes"></use></svg><span>${msg}</span></div>`;

        div.classList.add('success-toast');
        el.appendChild(div);

        setTimeout(() => {
            div.classList.add('hide');
            setTimeout(() => {
                if (div.parentNode) div.remove();
            }, 400);

        }, 3500);
        return div;
    }
    toggleExpertMode(el) {
        this.isExpertMode = !this.isExpertMode;
        localStorage.setItem('expertMode', this.isExpertMode);

        if (el) {
            el.classList.toggle('is-expert', this.isExpertMode);
            if (!this.isExpertMode) {
                this.wizSetStep(el, this.wizCurrentStep(el));
            }
        }
    }
    /**Dirige l'attention de l'utilisateur sur un élément spécifique
     * @param {string|HTMLElement} target - ID de l'élément ou l'élément lui-même
     * @param {boolean} activate - Activer ou désactiver l'animation
     * @param {string} color - Couleur spécifique (ex: 'red', '#FFA500')
     */
    setFocus(target, activate = true, color = null) {
        let el = (typeof target === 'string') ? document.getElementById(target) : target;
        if (!el) return;
        if (el.id === 'btnPairShade' || el.id === 'btnUnpairShade') {
            el = el.closest('.uniblocCol.divButton') || el;
        }
        else if (el.tagName === 'BUTTON' && el.classList.contains('unibutton')) {
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
    wizSetPrevStep(el) { this.wizSetStep(el, Math.max(this.wizCurrentStep(el) - 1, 1)); }
    wizSetNextStep(el) { this.wizSetStep(el, this.wizCurrentStep(el) + 1); }
    wizSetStep(el, step) {
        let curr = this.wizCurrentStep(el);
        let sStep = step.toString();
        const isExpert = el.classList.contains('is-expert');

        el.setAttribute('data-stepid', step);
        // Consommé par .stepper-wrapper::after (overlays.css) pour la largeur de la barre de
        // liaison, et par .completed/.active ci-dessous pour les puces -- généralisé à N'IMPORTE
        // QUEL nombre d'étapes (calc(), pas une liste de règles [data-stepid="N"] figée) : cf.
        // l'assistant de calibration, qui peut dépasser les ~4-5 étapes des autres wizards.
        el.style.setProperty('--current-step', step);
        el.querySelectorAll('.stepper-item[data-stepid]').forEach(item => {
            const n = parseInt(item.getAttribute('data-stepid'), 10);
            item.classList.toggle('completed', n < step);
            item.classList.toggle('active', n === step);
        });
        el.querySelectorAll('[data-stepid], [data-ustepid], [data-mstepid]').forEach(item => {
            if (item.classList.contains('stepper-item')) return;
            if (item === el) return;

            let show = true;

            if (isExpert) {
                show = item.hasAttribute('data-expert');
            }
            else {
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
    setHomePanel() { activateGrpid('divHomePnl'); }
    showRadioConfig() { activateGrpid('divTransceiverSettings'); }
    showShadeConfig() {
        activateGrpid('divSomfyMotors');
        if (typeof somfy !== 'undefined') {
            somfy.showEditShade(true);
            somfy.openEditShade();
        }
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
        // La topbar/sidebar sont hors de #divContainer (chrome partagé, toujours dans le DOM) --
        // la topbar reste visible (logo, badge Hotspot/LAN, uptime), la sidebar reste affichée
        // mais body.onboarding-active la floute et la rend non cliquable (main.css) pour empêcher
        // toute navigation hors de l'assistant tant qu'il est actif (cf. aussi le garde-fou dans
        // activateGrpid()).
        document.body.classList.add('onboarding-active');
        onboarding.open();
    } else {
        const wiz = get('divOnboardingWizard');
        if (wiz) wiz.style.display = 'none';
        document.body.classList.remove('onboarding-active');
        get('divAuthenticated').style.display = '';
    }
}
