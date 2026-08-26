class UIBinder {
    // toggleExpertMode() persiste ce choix dans localStorage mais ne le relisait jamais nulle
    // part -- ui.isExpertMode (lu par 20-shell.js/70-somfy.js pour les wizards) repartait donc
    // toujours à false après un rechargement, malgré la sauvegarde. Corrigé en initialisant
    // depuis la valeur persistée dès la construction de `ui` (var ui = new UIBinder(); plus bas).
    isExpertMode = localStorage.getItem('expertMode') === 'true';
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
    }
    serviceError(el, err) {
        let title = tr('ERR_SERVICE_TITLE');
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
        <strong style="opacity: 0.7;">${tr('ERR_SERVICE_LABEL')}</strong> ${err.service || 'Unknown'}
        </div>
        <div style="font-weight: 600; opacity: 0.9;">
        ${msg}
        </div>
        `;
        return div;
    }

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

        // Seul modal de l'interface qui puisse s'afficher SANS dictionnaire : loadLang() retombe
        // sur un repli à deux entrées si /lang échoue, ce qui arrive pendant un git.lockFS
        // (installation de langue, OTA) -- précisément quand le socket tombe aussi. Dans ce cas
        // tr() renvoie le nom de la clé. On teste donc explicitement sa présence, seule forme de
        // repli qui fonctionne (cf. le contrat de tr() dans 10-core-utils.js), et on retombe sur
        // l'anglais plutôt que d'afficher "ERR_SOCKET_CONNECT" à l'écran (cf. trOr()). Hors de cette fenêtre --
        // soit la quasi-totalité des cas, index.html étant servi en no-store, donc jamais depuis
        // le cache avec l'appareil éteint -- le message s'affiche bien traduit.
        div.innerHTML = `
        <div class="message-content error-content">
        ${modalHeader(trOr('ERR_SOCKET_TITLE', 'Connection Error'), 'svg-error', { type: 'small danger' })}
        <div class="sub-message">
        <p style="font-weight: 600; margin-bottom: 8px;">${trOr('ERR_SOCKET_CONNECT', 'Unable to connect to the server')}</p>
        <p class="sub-message-text" style="font-size: 0.85em; opacity: 0.8;">${msg}</p>

        <!-- Compteur de tentatives stylisé en bas du message -->
        <div id="divSocketAttempts" class="socketAttempts" style="margin-top: 20px; font-size: 0.85em; opacity: 0.6;">
        <span>${trOr('ERR_SOCKET_ATTEMPTS', 'Connection attempts:')} </span><span id="spanSocketAttempts" style="font-weight: 600;">1</span>
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

        // title part BRUT à modalHeader, qui le traduit lui-même (`tr(title) || title`, cf.
        // 20-shell.js) -- comme le fait errorMessage() juste au-dessus et comme le font tous les
        // autres appelants de modalHeader(). Le traduire ici en plus produisait un tr(tr(title)).
        // msg, lui, est injecté directement dans le corps : sa traduction reste à faire ici.
        const contentMsg = (msg !== undefined && msg !== null) ? tr(msg) : '';

        div.innerHTML = `
        <div class="message-content info-content">
        ${modalHeader(title, 'svg-info', { type: 'small' })}

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


    // Ne ferme QUE les modales d'alerte -- confirmation/erreur/info produites par promptMessage(),
    // errorMessage(), infoMessage(), socketError() -- reconnaissables à la classe interne
    // .prompt-content/.error-content/.info-content que ces fonctions posent elles-mêmes. C'est
    // exactement la convention qui sert déjà à exclure ces mêmes alertes de la fermeture au clic
    // extérieur (cf. le listener de clic dans 20-shell.js).
    // La sélection portait auparavant sur TOUT div.modal-overlay sans distinction : une simple
    // erreur de validation affichée par-dessus un formulaire modal refermait aussi le formulaire
    // -- errorMessage() commence par clearErrors(), et le bouton Fermer de l'erreur le rappelle.
    // L'utilisateur perdait alors tout ce qu'il venait de saisir (ex: mot de passe non confirmé
    // dans #divSecurityPopupContent : il fallait rouvrir la fenêtre et tout retaper). Trois
    // fenêtres (installation Git, liste des télécommandes, confirmation réseau) portaient un
    // data-keepOpen="true" uniquement pour échapper à ce ratissage : ce contournement n'a plus
    // lieu d'être et a été retiré avec lui.
    clearErrors() {
        document.querySelectorAll('div.modal-overlay').forEach((el) => {
            if (!el.querySelector('.prompt-content, .error-content, .info-content')) return;
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
            const isCompleted = n < step;
            item.classList.toggle('completed', isCompleted);
            item.classList.toggle('active', n === step);
            // Étape validée : remplace le chiffre du cercle par un check (svg-check, cf. index.html)
            // -- restauré dès qu'elle redevient active/à venir (retour arrière via
            // wizSetPrevStep()). Point d'entrée unique pour tous les wizards du projet (appairage,
            // désappairage, calibration, mise à jour OTA...), tous pilotés par ce même wizSetStep().
            const counter = item.querySelector('.step-counter');
            if (counter) counter.innerHTML = isCompleted ? '<svg><use href="#svg-check"></use></svg>' : n;
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
            // Écran de saisie du PIN : même règle qu'à la définition du code (cf.
            // General.SecurityOverlay), pour la raison supplémentaire qu'une lettre comptait ici
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
    setHomePanel() { activateGrpid('divHomePnl'); }
    showRadioConfig() { activateGrpid('divTransceiverSettings'); }
    // Carte d'accueil "Système" (index.html). Manquait alors que ses trois voisines visaient des
    // méthodes réelles : le clic levait un TypeError et ne faisait rien. Même destination que
    // setConfigPanel() ci-dessus, gardée comme point d'entrée du bouton engrenage -- deux noms
    // parce que les deux appelants sont distincts, et que le nom showXxxConfig est celui qu'attend
    // la série des cartes d'accueil.
    showSystemConfig() { this.setConfigPanel(); }
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
// (onboarding.relaunch()), et l'oubli d'un des deux volets dans l'un des cas est exactement ce qui
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
