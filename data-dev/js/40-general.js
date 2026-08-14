class General {
    initialized = false;
    appVersion = 'v3.0.0';
    reloadApp = false;
    _currentSecurityType = 0;
    // Codes de langue pour lesquels le relais navigateur a échoué au stade github-fetch-failed
    // (aucune route Internet réelle depuis cet appareil) -- renderLangCatalog() y substitue
    // l'import manuel de fichier à la ligne du catalogue habituelle, tant que la modale reste
    // ouverte (réinitialisé à chaque nouvelle ouverture, cf. openLangManager()).
    _manualImportPending = new Set();
    // Écoute déléguée (haptique) posée une seule fois par applyFeedbackPrefs() -- cf. plus bas.
    _feedbackListenersBound = false;
    init() {
        if (this.initialized) return;

        const savedTheme = localStorage.getItem('themeMode') || '0';
        this.applyTheme(savedTheme);
        const savedColor = localStorage.getItem('accentColor');
        if (savedColor) {
            document.documentElement.style.setProperty('--color-accent', savedColor);
        }
        this.applyFeedbackPrefs();
        this.setAppVersion();
        this.setTimeZones();
        if (sockIsOpen && ui.isConfigOpen()) socket.send('join:0');
        ui.toElement(get('divSystemSettings'), {
            general: { hostname: 'ESPSomfyRTS', username: '', password: '', posixZone: 'UTC0', ntpServer: 'pool.ntp.org' }
        });

        this.initialized = true;
    }
    applyTheme(val) {
        if (val === '1') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else if (val === '2') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        }
        const sel = get('selThemeMode');
        if (sel) sel.value = val;
    }
    // =====================================================================
    // SECTION : RETOURS TACTILE & VISUEL (voir FeedbackOverlay() plus bas)
    // =====================================================================
    // Préférence 100% client, jamais synchronisée au firmware -- même patron
    // que le thème/la couleur d'accent ci-dessus ou getShadeUIPrefs() plus
    // loin dans ce fichier : un unique blob JSON en localStorage.
    static FEEDBACK_PREFS_DEFAULT = { haptic: true, visualCommands: true, visualUI: true, visualForms: true, style: 'scale', styleCommands: 'scale' };
    getFeedbackPrefs() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem('feedbackPrefs') || '{}'); } catch (e) { saved = {}; }
        return Object.assign({}, General.FEEDBACK_PREFS_DEFAULT, saved);
    }
    setFeedbackPrefs(patch) {
        const merged = Object.assign(this.getFeedbackPrefs(), patch);
        localStorage.setItem('feedbackPrefs', JSON.stringify(merged));
        this.applyFeedbackPrefs();
    }
    // Pose les attributs data-feedback-* sur <html> : c'est tout ce dont le CSS a besoin (voir
    // base.css, section "RETOURS TACTILE & VISUEL") -- aucune classe à toucher élément par élément.
    applyFeedbackPrefs() {
        const p = this.getFeedbackPrefs();
        const root = document.documentElement;
        root.setAttribute('data-feedback-commands', p.visualCommands ? 'on' : 'off');
        root.setAttribute('data-feedback-ui', p.visualUI ? 'on' : 'off');
        root.setAttribute('data-feedback-forms', p.visualForms ? 'on' : 'off');
        root.setAttribute('data-feedback-style', p.style === 'flash' ? 'flash' : 'scale');
        root.setAttribute('data-feedback-style-commands', p.styleCommands === 'flash' ? 'flash' : 'scale');
        this._bindFeedbackListeners();
    }
    // Le vibreur ne peut pas être piloté en CSS : une seule écoute déléguée globale, posée une
    // fois pour toutes (pas un vibrate() semé dans chaque handler de clic, qui finirait par
    // dériver au fil des ajouts de composants) :
    // - Commandes/Navigation/Cartes/fermeture : impulsion à l'appui (pointerdown) sur tout élément
    //   portant déjà l'un des sélecteurs de retour visuel existants.
    // - Formulaires (.dirty-target) : impulsion à la PRISE de focus d'un champ (focusin), jamais à
    //   chaque frappe -- focusin ne se redéclenche qu'au changement de focus, contrairement à
    //   input/change utilisés par watchDirty() plus haut pour un tout autre besoin.
    _bindFeedbackListeners() {
        if (this._feedbackListenersBound) return;
        this._feedbackListenersBound = true;

        const HAPTIC_PRESS_SELECTOR = '.btn-somfy-svg, .animScale, .welcomeCard, .preset-badge, .radioBtnPrec, [close], button';
        const vibrate = () => {
            if (this.getFeedbackPrefs().haptic && navigator.vibrate) navigator.vibrate(15);
        };
        document.addEventListener('pointerdown', (e) => {
            if (e.target.closest(HAPTIC_PRESS_SELECTOR)) vibrate();
        }, { passive: true });
        document.addEventListener('focusin', (e) => {
            const el = e.target;
            if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.closest('.dirty-target')) vibrate();
        });
    }
    FeedbackOverlay() {
        if (get('divFeedbackOverlay')) return;
        const p = this.getFeedbackPrefs();
        // navigator.vibrate existe comme fonction sur la plupart des navigateurs desktop
        // (Chrome/Firefox), même sans moteur de vibration -- l'appel serait un no-op silencieux,
        // pas une erreur. `!!navigator.vibrate` seul ne détecte donc rien : il faut croiser avec la
        // présence d'un écran tactile pour ne proposer le réglage que là où il peut avoir un effet.
        const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        const hapticSupported = !!navigator.vibrate && hasTouch;

        const div = document.createElement('div');
        div.id = 'divFeedbackOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content" id="divFeedbackPopupContent">
        ${modalHeader('GENERAL_FEEDBACK', 'svg-haptic', { subtitle: 'FEEDBACK_MODAL_DESC' })}

        <div class="overlay-scroll-content">

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('FEEDBACK_SECTION_HAPTIC')}</h3>
        <label class="uniRow dirty-target" for="cbFeedbackHaptic">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-toggleHand"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('FEEDBACK_HAPTIC_TOGGLE')}</div>
        <div class="uniStatus">${tr(hapticSupported ? 'FEEDBACK_HAPTIC_TOGGLE_DESC' : 'FEEDBACK_HAPTIC_UNSUPPORTED')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch">
        <input id="cbFeedbackHaptic" type="checkbox" ${p.haptic ? 'checked' : ''} ${hapticSupported ? '' : 'disabled'}>
        <div></div>
        </span>
        </div>
        </label>
        </div>

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('FEEDBACK_SECTION_VISUAL')}</h3>
        <label class="uniRow dirty-target" for="cbFeedbackCommands">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-simpleShutter"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('FEEDBACK_VISUAL_COMMANDS')}</div>
        <div class="uniStatus">${tr('FEEDBACK_VISUAL_COMMANDS_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbFeedbackCommands" type="checkbox" ${p.visualCommands ? 'checked' : ''}><div></div></span>
        </div>
        </label>
        <div class="uniRow">
        <div class="unifield-content">
        <label class="label">${tr('FEEDBACK_STYLE_LABEL_COMMANDS')}</label>
        </div>
        </div>
        <div class="SwitchBig SwitchBig-2 dirty-target" id="feedbackStyleCommandsSwitch">
        <input type="radio" name="feedbackStyleCommands" id="feedbackStyleCommandsScale" value="scale" ${p.styleCommands !== 'flash' ? 'checked' : ''}>
        <label for="feedbackStyleCommandsScale">${tr('FEEDBACK_STYLE_SCALE')}</label>
        <input type="radio" name="feedbackStyleCommands" id="feedbackStyleCommandsFlash" value="flash" ${p.styleCommands === 'flash' ? 'checked' : ''}>
        <label for="feedbackStyleCommandsFlash">${tr('FEEDBACK_STYLE_FLASH')}</label>
        <div class="nav-pill"></div>
        </div>

        <label class="uniRow dirty-target" for="cbFeedbackUI">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-tabHome"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('FEEDBACK_VISUAL_UI')}</div>
        <div class="uniStatus">${tr('FEEDBACK_VISUAL_UI_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbFeedbackUI" type="checkbox" ${p.visualUI ? 'checked' : ''}><div></div></span>
        </div>
        </label>
        <label class="uniRow dirty-target" for="cbFeedbackForms">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-edit"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('FEEDBACK_VISUAL_FORMS')}</div>
        <div class="uniStatus">${tr('FEEDBACK_VISUAL_FORMS_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbFeedbackForms" type="checkbox" ${p.visualForms ? 'checked' : ''}><div></div></span>
        </div>
        </label>

        <div class="uniRow">
        <div class="unifield-content">
        <label class="label">${tr('FEEDBACK_STYLE_LABEL_UI')}</label>
        </div>
        </div>
        <div class="SwitchBig SwitchBig-2 dirty-target" id="feedbackStyleSwitch">
        <input type="radio" name="feedbackStyle" id="feedbackStyleScale" value="scale" ${p.style !== 'flash' ? 'checked' : ''}>
        <label for="feedbackStyleScale">${tr('FEEDBACK_STYLE_SCALE')}</label>
        <input type="radio" name="feedbackStyle" id="feedbackStyleFlash" value="flash" ${p.style === 'flash' ? 'checked' : ''}>
        <label for="feedbackStyleFlash">${tr('FEEDBACK_STYLE_FLASH')}</label>
        <div class="nav-pill"></div>
        </div>
        </div>

        </div>

        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnFeedbackClose" type="button">${tr('BT_CLOSE')}</button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);

        // Appliqué en direct à chaque changement (comme le thème/la couleur d'accent) : c'est une
        // préférence d'affichage, pas un formulaire à valider -- pas de bouton Enregistrer/Annuler.
        const bindSwitch = (id, key) => {
            const el = div.querySelector('#' + id);
            el.addEventListener('change', () => this.setFeedbackPrefs({ [key]: el.checked }));
        };
        bindSwitch('cbFeedbackHaptic', 'haptic');
        bindSwitch('cbFeedbackCommands', 'visualCommands');
        bindSwitch('cbFeedbackUI', 'visualUI');
        bindSwitch('cbFeedbackForms', 'visualForms');
        div.querySelectorAll('input[name="feedbackStyle"]').forEach(r => {
            r.addEventListener('change', () => { if (r.checked) this.setFeedbackPrefs({ style: r.value }); });
        });
        div.querySelectorAll('input[name="feedbackStyleCommands"]').forEach(r => {
            r.addEventListener('change', () => { if (r.checked) this.setFeedbackPrefs({ styleCommands: r.value }); });
        });

        div.querySelector('#btnFeedbackClose').onclick = () => closeOverlay(div);
    }
    getCookie(cname) {
        let n = cname + '=';
        let cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let c = cookies[i];
            // substring(1), pas substring(0) (qui renvoyait c inchangé et bouclait indéfiniment
            // dès qu'un cookie commençait par l'espace de séparation "; " -- le cas de tous sauf
            // le tout premier de document.cookie).
            while (c.charAt(0) === ' ') c = c.substring(1);
            if (c.indexOf(n) === 0) return c.substring(n.length, c.length);
        }
        return '';
    }
    reload() {
        let addMetaTag = (name, content) => {
            let meta = document.createElement('meta');
            meta.httpEquiv = name;
            meta.content = content;
            document.getElementsByTagName('head')[0].appendChild(meta);
        };
        addMetaTag('pragma', 'no-cache');
        addMetaTag('expires', '0');
        addMetaTag('cache-control', 'no-cache');
        document.location.reload();
    }
    timeZones = [
        "Africa/Cairo|EET-2",
        "Africa/Johannesburg|SAST-2",
        "Africa/Juba|CAT-2",
        "Africa/Lagos|WAT-1",
        "Africa/Mogadishu|EAT-3",
        "Africa/Tunis|CET-1",
        "America/Adak|HST10HDT,M3.2.0,M11.1.0",
        "America/Anchorage|AKST9AKDT,M3.2.0,M11.1.0",
        "America/Asuncion|<-04>4<-03>,M10.1.0/0,M3.4.0/0",
        "America/Bahia_Banderas|CST6CDT,M4.1.0,M10.5.0",
        "America/Barbados|AST4",
        "America/Bermuda|AST4ADT,M3.2.0,M11.1.0",
        "America/Cancun|EST5",
        "America/Central_Time|CST6CDT,M3.2.0,M11.1.0",
        "America/Chihuahua|MST7MDT,M4.1.0,M10.5.0",
        "America/Eastern_Time|EST5EDT,M3.2.0,M11.1.0",
        "America/Godthab|<-03>3<-02>,M3.5.0/-2,M10.5.0/-1",
        "America/Havana|CST5CDT,M3.2.0/0,M11.1.0/1",
        "America/Mexico_City|CST6",
        "America/Miquelon|<-03>3<-02>,M3.2.0,M11.1.0",
        "America/Mountain_Time|MST7MDT,M3.2.0,M11.1.0",
        "America/Pacific_Time|PST8PDT,M3.2.0,M11.1.0",
        "America/Phoenix|MST7",
        "America/Santiago|<-04>4<-03>,M9.1.6/24,M4.1.6/24",
        "America/St_Johns|NST3:30NDT,M3.2.0,M11.1.0",
        "Antarctica/Troll|<+00>0<+02>-2,M3.5.0/1,M10.5.0/3",
        "Asia/Amman|EET-2EEST,M2.5.4/24,M10.5.5/1",
        "Asia/Beirut|EET-2EEST,M3.5.0/0,M10.5.0/0",
        "Asia/Colombo|<+0530>-5:30",
        "Asia/Damascus|EET-2EEST,M3.5.5/0,M10.5.5/0",
        "Asia/Gaza|EET-2EEST,M3.4.4/50,M10.4.4/50",
        "Asia/Hong_Kong|HKT-8",
        "Asia/Jakarta|WIB-7",
        "Asia/Jayapura|WIT-9",
        "Asia/Jerusalem|IST-2IDT,M3.4.4/26,M10.5.0",
        "Asia/Kabul|<+0430>-4:30",
        "Asia/Karachi|PKT-5",
        "Asia/Kathmandu|<+0545>-5:45",
        "Asia/Kolkata|IST-5:30",
        "Asia/Makassar|WITA-8",
        "Asia/Manila|PST-8",
        "Asia/Seoul|KST-9",
        "Asia/Shanghai|CST-8",
        "Asia/Tehran|<+0330>-3:30",
        "Asia/Tokyo|JST-9",
        "Atlantic/Azores|<-01>1<+00>,M3.5.0/0,M10.5.0/1",
        "Australia/Adelaide|ACST-9:30ACDT,M10.1.0,M4.1.0/3",
        "Australia/Brisbane|AEST-10",
        "Australia/Darwin|ACST-9:30",
        "Australia/Eucla|<+0845>-8:45",
        "Australia/Lord_Howe|<+1030>-10:30<+11>-11,M10.1.0,M4.1.0",
        "Australia/Melbourne|AEST-10AEDT,M10.1.0,M4.1.0/3",
        "Australia/Perth|AWST-8",
        "Etc/GMT-1|<+01>-1",
        "Etc/GMT-2|<+02>-2",
        "Etc/GMT-3|<+03>-3",
        "Etc/GMT-4|<+04>-4",
        "Etc/GMT-5|<+05>-5",
        "Etc/GMT-6|<+06>-6",
        "Etc/GMT-7|<+07>-7",
        "Etc/GMT-8|<+08>-8",
        "Etc/GMT-9|<+09>-9",
        "Etc/GMT-10|<+10>-10",
        "Etc/GMT-11|<+11>-11",
        "Etc/GMT-12|<+12>-12",
        "Etc/GMT-13|<+13>-13",
        "Etc/GMT-14|<+14>-14",
        "Etc/GMT+0|GMT0",
        "Etc/GMT+1|<-01>1",
        "Etc/GMT+2|<-02>2",
        "Etc/GMT+3|<-03>3",
        "Etc/GMT+4|<-04>4",
        "Etc/GMT+5|<-05>5",
        "Etc/GMT+6|<-06>6",
        "Etc/GMT+7|<-07>7",
        "Etc/GMT+8|<-08>8",
        "Etc/GMT+9|<-09>9",
        "Etc/GMT+10|<-10>10",
        "Etc/GMT+11|<-11>11",
        "Etc/GMT+12|<-12>12",
        "Etc/UTC|UTC0",
        "Europe/Athens|EET-2EEST,M3.5.0/3,M10.5.0/4",
        "Europe/Berlin|CEST-1CET,M3.2.0/2:00:00,M11.1.0/2:00:00",
        "Europe/Brussels|CET-1CEST,M3.5.0,M10.5.0/3",
        "Europe/Chisinau|EET-2EEST,M3.5.0,M10.5.0/3",
        "Europe/Dublin|IST-1GMT0,M10.5.0,M3.5.0/1",
        "Europe/Lisbon|WET0WEST,M3.5.0/1,M10.5.0",
        "Europe/London|GMT0BST,M3.5.0/1,M10.5.0",
        "Europe/Moscow|MSK-3",
        "Europe/Paris|CET-1CEST-2,M3.5.0/02:00:00,M10.5.0/03:00:00",
        "Indian/Cocos|<+0630>-6:30",
        "Pacific/Auckland|NZST-12NZDT,M9.5.0,M4.1.0/3",
        "Pacific/Chatham|<+1245>-12:45<+1345>,M9.5.0/2:45,M4.1.0/3:45",
        "Pacific/Easter|<-06>6<-05>,M9.1.6/22,M4.1.6/22",
        "Pacific/Fiji|<+12>-12<+13>,M11.2.0,M1.2.3/99",
        "Pacific/Guam|ChST-10",
        "Pacific/Honolulu|HST10",
        "Pacific/Marquesas|<-0930>9:30",
        "Pacific/Midway|SST11",
        "Pacific/Norfolk|<+11>-11<+12>,M10.1.0,M4.1.0/3"
    ];
    loadGeneral() {
        // divSystemSettings englobe les deux sous-onglets (Général + Firmware) : certains
        // champs "general.*" (ex: enableDebugLogs) vivent dans Firmware, pas Général.
        const pnl = get('divSystemSettings');

        getJSONSync('/modulesettings', (err, settings) => {
            if (err) {
                logger.error('Failed to load general settings:', err);
                return;
            }
            logger.setDebugEnabled(settings.enableDebugLogs);
            logger.debug('General settings loaded:', settings);
            if (typeof somfy !== 'undefined') somfy.initPins();

            get('spanFwVersion').innerText = settings.fwVersion;
            get('spanHwVersion').innerText = settings.chipModel.length > 0 ? '-' + settings.chipModel : '';
            get('divContainer').setAttribute('data-chipmodel', settings.chipModel);

            if (settings.hardwareProfile) {
                get('divContainer').setAttribute('data-hardwareprofile', settings.hardwareProfile);
                get('info-lbc').innerText = tr(settings.hardwareProfile);
            }
            this.setAppVersion();

            // La LED vit désormais dans sa propre modale (general.LedOverlay()), hors de
            // #divSystemSettings : on garde juste l'état à jour pour peupler la modale à
            // l'ouverture et pour rafraîchir le badge de la tuile.
            this._ledSettings = { ledPin: settings.ledPin, ledActiveLow: settings.ledActiveLow, ledRfBlink: settings.ledRfBlink };
            window.__ledPin = typeof settings.ledPin === 'number' ? settings.ledPin : -1;
            this.updateLedBadge();

            // Position géo (lever/coucher du soleil, cf. Plannings) : geoLat=99 est la sentinelle
            // "non configuré" côté firmware (cf. ConfigSettings.h) -- hors de la plage valide -90..90.
            this._geoSettings = { geoLat: settings.geoLat, geoLon: settings.geoLon };
            this.updateGeoBadge();

            // Personnalisation dashboard/header (general.DashboardPrefsOverlay()) : synchronisée
            // côté firmware (contrairement au thème/couleur d'accent/retours haptiques ci-dessus,
            // 100% client) pour survivre à un changement de navigateur ou d'appareil.
            this._dashboardPrefs = {
                headerMobileDisplay: typeof settings.headerMobileDisplay === 'number' ? settings.headerMobileDisplay : 0,
                reverseDashboardColumns: !!settings.reverseDashboardColumns,
                defaultMobileTab: settings.defaultMobileTab === 'devices' ? 'devices' : 'groups',
                showRadioActivity: !!settings.showRadioActivity
            };
            this.applyDashboardPrefs(this._dashboardPrefs);
            // L'onglet mobile par défaut ne s'applique qu'UNE SEULE fois, au tout premier rendu :
            // le rejouer à chaque loadGeneral() (ex. après Enregistrer dans DashboardPrefsOverlay())
            // arracherait l'utilisateur de l'onglet où il se trouve déjà.
            if (!this._defaultMobileTabApplied) {
                this._defaultMobileTabApplied = true;
                if (typeof somfy !== 'undefined' && typeof somfy.switchMobileTab === 'function') {
                    somfy.switchMobileTab(this._dashboardPrefs.defaultMobileTab);
                }
            }

            // Retour depuis la page externe de détection de position (cf. GEO_HELPER_URL) :
            // ouvre directement la modale, pré-remplie, pour que l'utilisateur n'ait plus qu'à
            // vérifier puis confirmer -- jamais d'enregistrement automatique sans son geste.
            if (_pendingGeoFromUrl) {
                const prefill = _pendingGeoFromUrl;
                _pendingGeoFromUrl = null;
                this.GeoOverlay(prefill);
            }

            loadLang(() => {
                ui.toElement(pnl, { general: settings });

                this.populateLangSelect(settings.language);
            });
            if (settings.accentColor) {
                document.documentElement.style.setProperty('--color-accent', settings.accentColor);
                localStorage.setItem('accentColor', settings.accentColor);

                const accentInput = get('fldAccentColor');
                if (accentInput) {
                    accentInput.value = settings.accentColor;
                    accentInput.addEventListener('input', (e) => {
                        document.documentElement.style.setProperty('--color-accent', e.target.value);
                        localStorage.setItem('accentColor', e.target.value);
                    });
                }
            }

            watchDirty(pnl);
        });
    }

    setAppVersion() { get('spanAppVersion').innerText = this.appVersion; }
    setTimeZones() {
        const dd = get('selTimeZone');
        dd.innerHTML = this.timeZones.map(tz => {
            const [city, code] = tz.split('|');
            return `<option value="${code}">${city}</option>`;
        }).join('');

        dd.value = 'UTC0';
    }
    setGeneral(done) {
        let valid = true;
        let pnl = get('divSystemSettings');
        let obj = ui.fromElement(pnl).general;
        logger.setDebugEnabled(obj.enableDebugLogs);
        const msg = tr('ERR_HOSTNAME');

        if (typeof obj.hostname === 'undefined' || !obj.hostname || obj.hostname === '') {
            ui.errorMessage(msg, tr('ERR_INVALID_HOSTNAME'));
            valid = false;
        }
        if (valid && !/^[a-zA-Z0-9-]+$/.test(obj.hostname)) {
            ui.errorMessage(msg, tr('ERR_HOSTNAME_CHARS'));
            valid = false;
        }
        if (valid && obj.hostname.length > 32) {
            ui.errorMessage(msg, tr('ERR_HOSTNAME_LENGTH'));
            valid = false;
        }
        if (valid && typeof obj.ntpServer === 'string' && obj.ntpServer.length > 64) {
            ui.errorMessage(msg, tr('ERR_NTP_LENGTH'));
            valid = false;
        }
        if (valid) {
            putJSONSync('/setgeneral', obj, (err, response) => {
                if (err) {
                    ui.serviceError(err);
                } else {
                    ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                    logger.debug('General settings saved:', response);
                    clearDirty();
                }
                if (typeof done === 'function') done(err);
            });
        }
        else if (typeof done === 'function') done(new Error('invalid'));
    }
    // Reflète l'état courant sur la tuile de la page Général, sans ouvrir la modale : le nom de
    // carte physique pour les boîtiers (câblage figé, donc toujours "actif"), le GPIO ou
    // "Désactivé" pour les cartes génériques.
    updateLedBadge() {
        const badge = get('badgeLedState');
        if (!badge) return;
        const profile = get('divContainer').getAttribute('data-hardwareprofile') || '';
        const s = this._ledSettings || { ledPin: -1 };
        badge.classList.remove('state-disabled', 'state-success');
        if (profile && profile !== 'GENERIC') {
            badge.textContent = this._ledBoardLabel(profile);
            badge.classList.add('state-success');
        } else if (s.ledPin >= 0) {
            badge.textContent = `GPIO ${s.ledPin}`;
            badge.classList.add('state-success');
        } else {
            badge.textContent = tr('LED_BADGE_DISABLED');
            badge.classList.add('state-disabled');
        }
    }
    // geoLat=99 (hors -90..90) est la sentinelle "non configuré" côté firmware, cf. ConfigSettings.h.
    updateGeoBadge() {
        const badge = get('badgeGeoState');
        if (!badge) return;
        const s = this._geoSettings || { geoLat: 99 };
        badge.classList.remove('state-disabled', 'state-success');
        if (s.geoLat >= -90 && s.geoLat <= 90) {
            badge.textContent = `${s.geoLat.toFixed(2)}, ${s.geoLon.toFixed(2)}`;
            badge.classList.add('state-success');
        } else {
            badge.textContent = tr('GENERAL_GEO_BADGE_DISABLED');
            badge.classList.add('state-disabled');
        }
    }

    // `prefill` optionnel ({lat, lon}) : valeurs de retour de GEO_HELPER_URL (page externe HTTPS),
    // affichées dans les champs à la place des valeurs déjà enregistrées -- l'utilisateur garde
    // la main pour vérifier puis confirmer via Appliquer, rien n'est jamais pré-enregistré.
    GeoOverlay(prefill) {
        if (get('divGeoOverlay')) return;
        const s = this._geoSettings || { geoLat: 99, geoLon: 0 };
        const isSet = s.geoLat >= -90 && s.geoLat <= 90;
        const initLat = prefill ? prefill.lat : (isSet ? s.geoLat : null);
        const initLon = prefill ? prefill.lon : (isSet ? s.geoLon : null);
        // navigator.geolocation exige un contexte sécurisé (HTTPS/localhost) : sur ce device,
        // servi en HTTP simple sur le réseau local, la détection native échouerait toujours
        // silencieusement -- on masque ce bouton au profit de la page externe (GEO_HELPER_URL).
        const canDetectLocally = window.isSecureContext;
        // Même contrainte pour la LECTURE programmatique du presse-papiers (navigator.clipboard.
        // readText) : sur ce device en HTTP simple, elle est indisponible dans la quasi-totalité
        // des navigateurs, desktop comme mobile. Le COLLAGE natif (Ctrl+V, ou appui long > Coller
        // sur mobile), lui, ne dépend PAS de cette API -- c'est un geste utilisateur direct dans le
        // champ, pas une lecture par script -- et fonctionne donc toujours (cf. smartPaste()
        // plus bas). btnGeoPaste s'adapte : lecture directe si possible, sinon il se contente de
        // mettre le focus sur le champ et d'indiquer comment coller manuellement.
        const canReadClipboard = window.isSecureContext && !!(navigator.clipboard && navigator.clipboard.readText);

        const div = document.createElement('div');
        div.id = 'divGeoOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content" id="divGeoPopupContent">
        ${modalHeader('GENERAL_GEO_TITLE', 'svg-sun', {
            subtitle: 'GENERAL_GEO_MODAL_DESC',
        })}

        <div class="overlay-scroll-content">
        <div class="information">
        <div class="information-header">
        <svg><use href="#svg-info"></use></svg>
        <b>${tr('MSG_INFO')}</b>
        </div>
        <div class="information-text">
        <span>${tr('GENERAL_GEO_PRIVACY_NOTE')}</span>
        </div>
        </div>

        <div class="uniRow">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-search"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="btnGeoExternal">${tr('GENERAL_GEO_EXTERNAL')}</label>
        <div class="uniStatus">${tr('GENERAL_GEO_EXTERNAL_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <button type="button" id="btnGeoExternal">${tr('GENERAL_GEO_EXTERNAL_BTN')}</button>
        </div>
        </div>

        ${canDetectLocally ? `
        <div class="uniRow">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-target"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="inputGeoDetect">${tr('GENERAL_GEO_DETECT')}</label>
        <div class="uniStatus">${tr('GENERAL_GEO_DETECT_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <button type="button" line id="btnGeoDetect">${tr('GENERAL_GEO_DETECT_BTN')}</button>
        </div>
        </div>
        <div class="uniStatus ledPinWarn" id="geoDetectError" style="display:none"></div>
        ` : ''}

        <div class="uniRow dirty-target">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-sun"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="inputGeoLat">${tr('GENERAL_GEO_LAT')}</label>
        <input type="number" id="inputGeoLat" class="inputAndSelect" min="-90" max="90" step="0.01" value="${initLat !== null ? initLat.toFixed(2) : ''}" placeholder="48.85">
        </div>
        </div>
        </div>
        <div class="uniRow dirty-target">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-sun"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="inputGeoLon">${tr('GENERAL_GEO_LON')}</label>
        <input type="number" id="inputGeoLon" class="inputAndSelect" min="-180" max="180" step="0.01" value="${initLon !== null ? initLon.toFixed(2) : ''}" placeholder="2.35">
        </div>
        </div>
        </div>
        <div class="uniRow">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-download"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="btnGeoPaste">${tr('GENERAL_GEO_PASTE_BTN')}</label>
        <div class="uniStatus">${tr('GENERAL_GEO_PASTE_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <button type="button" line id="btnGeoPaste">${tr('GENERAL_GEO_PASTE_BTN')}</button>
        </div>
        </div>
        <div class="uniStatus ledPinWarn" id="geoError" style="display:none"></div>
        </div>

        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        ${isSet ? `<button id="btnGeoClear" line type="button">${tr('GENERAL_GEO_CLEAR_BTN')}</button>` : ''}
        <button id="btnGeoCancel" line type="button">${tr('BT_CANCEL')}</button>
        <button id="btnGeoApply" type="button">${tr('BT_APPLY')}</button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);
        watchDirty(div);

        const setError = (msgKey) => {
            const el = get('geoError');
            if (!msgKey) { el.textContent = ''; el.style.display = 'none'; return; }
            el.textContent = tr(msgKey);
            el.style.display = '';
        };
        const setDetectError = (msgKey) => {
            const el = get('geoDetectError');
            if (!msgKey) { el.textContent = ''; el.style.display = 'none'; return; }
            el.textContent = tr(msgKey);
            el.style.display = '';
        };

        // Reconnaît une paire "lat, lon" collée en bloc (ex: copiée depuis Google Maps :
        // "43.4, -0.57"), pour remplir les deux champs correctement au lieu d'écraser un seul
        // d'entre eux avec les deux valeurs. Tolère virgule ou point comme séparateur décimal, et
        // espace/virgule/point-virgule comme séparateur entre les deux nombres.
        const GEO_PASTE_RE = /^(-?\d+(?:[.,]\d+)?)[\s,;]+(-?\d+(?:[.,]\d+)?)$/;
        const applyPastedCoords = (raw) => {
            const m = (raw || '').trim().match(GEO_PASTE_RE);
            if (!m) return false;
            const lat = parseFloat(m[1].replace(',', '.'));
            const lon = parseFloat(m[2].replace(',', '.'));
            if (!Number.isFinite(lat) || lat < -90 || lat > 90) return false;
            if (!Number.isFinite(lon) || lon < -180 || lon > 180) return false;
            get('inputGeoLat').value = lat.toFixed(2);
            get('inputGeoLon').value = lon.toFixed(2);
            setError(null);
            return true;
        };
        // Collage manuel (Ctrl+V) directement dans l'un ou l'autre champ : marche indépendamment
        // du bouton "Coller" ci-dessous et de la permission presse-papiers.
        const smartPaste = (e) => {
            const raw = (e.clipboardData || window.clipboardData)?.getData('text') || '';
            if (applyPastedCoords(raw)) e.preventDefault();
        };
        get('inputGeoLat').addEventListener('paste', smartPaste);
        get('inputGeoLon').addEventListener('paste', smartPaste);

        get('btnGeoPaste')?.addEventListener('click', async () => {
            setError(null);
            if (canReadClipboard) {
                try {
                    const raw = await navigator.clipboard.readText();
                    if (!applyPastedCoords(raw)) setError('ERR_GEO_PASTE_MANUAL');
                    return;
                } catch (e) {
                    // Permission refusée au clic malgré un contexte sécurisé : bascule sur le
                    // même repli manuel que le cas non sécurisé ci-dessous.
                }
            }
            // Pas de lecture programmatique possible ici (cf. canReadClipboard) : on amène
            // directement l'utilisateur au geste qui fonctionne -- focus + sélection du champ
            // Latitude, prêt à recevoir un Ctrl+V ou un appui long > Coller (mobile).
            const latInput = get('inputGeoLat');
            latInput.focus();
            latInput.select();
            setError('ERR_GEO_PASTE_MANUAL');
        });

        get('btnGeoDetect')?.addEventListener('click', () => {
            if (!navigator.geolocation) {
                setDetectError('ERR_GEO_UNAVAILABLE');
                return;
            }
            setDetectError(null);
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    get('inputGeoLat').value = pos.coords.latitude.toFixed(2);
                    get('inputGeoLon').value = pos.coords.longitude.toFixed(2);
                    setError(null);
                },
                () => { setDetectError('ERR_GEO_DENIED'); },
                { timeout: 10000 }
            );
        });
        get('btnGeoExternal').onclick = () => {
            // `return` : l'origine de CET appareil, pour que la page externe sache où renvoyer les
            // coordonnées (repli par URL uniquement, cf. plus haut). `lang` : la langue déjà
            // choisie ici, pour que la page externe s'affiche dans la même langue plutôt que de
            // deviner d'après le navigateur.
            const params = new URLSearchParams({ return: window.location.origin });
            const lang = localStorage.getItem('selectedLang');
            if (lang) params.set('lang', lang);
            // PAS de 'noopener' ici : on a besoin que le popup garde une référence vers cette page
            // (window.opener) pour pouvoir nous renvoyer les coordonnées par postMessage et se
            // refermer tout seul (cf. sendToESP() dans docs/js/geo.js) -- sans ça, valider sur la
            // page externe naviguait cette page-là vers l'ESP et laissait cet onglet-ci en double.
            // Sans risque : GEO_HELPER_URL pointe vers notre propre page GitHub Pages, pas un site
            // tiers.
            window.open(`${GEO_HELPER_URL}?${params.toString()}`, '_blank');
        };

        get('btnGeoCancel').onclick = () => confirmDiscardChanges(() => closeOverlay(div));
        get('btnGeoClear')?.addEventListener('click', () => {
            putJSONSync('/setgeneral', { geoLat: 99, geoLon: 0 }, (err) => {
                if (err) { ui.serviceError(err); return; }
                this._geoSettings = { geoLat: 99, geoLon: 0 };
                this.updateGeoBadge();
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                closeOverlay(div);
            });
        });
        get('btnGeoApply').onclick = () => {
            const lat = parseFloat(get('inputGeoLat').value);
            const lon = parseFloat(get('inputGeoLon').value);
            if (isNaN(lat) || lat < -90 || lat > 90) { setError('ERR_GEO_LAT_INVALID'); return; }
            if (isNaN(lon) || lon < -180 || lon > 180) { setError('ERR_GEO_LON_INVALID'); return; }
            setError(null);
            putJSONSync('/setgeneral', { geoLat: lat, geoLon: lon }, (err) => {
                if (err) {
                    if (err.code === 'GEO_LAT_INVALID') setError('ERR_GEO_LAT_INVALID');
                    else if (err.code === 'GEO_LON_INVALID') setError('ERR_GEO_LON_INVALID');
                    else ui.serviceError(err);
                    return;
                }
                this._geoSettings = { geoLat: lat, geoLon: lon };
                this.updateGeoBadge();
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                clearDirty(div);
                closeOverlay(div);
            });
        };
    }
    // =====================================================================
    // SECTION : PERSONNALISATION DASHBOARD/HEADER (voir DashboardPrefsOverlay() ci-dessous)
    // =====================================================================
    // Pose les attributs/classes que le CSS et le reste du JS consomment -- même patron que
    // applyFeedbackPrefs() plus haut, mais pour des réglages serveur au lieu de localStorage.
    // Idempotente et sans effet de bord sur l'onglet mobile courant : appelable à tout moment
    // (chargement initial ET après Enregistrer dans la modale), contrairement à l'application de
    // defaultMobileTab qui, elle, ne doit avoir lieu qu'une fois (cf. loadGeneral()).
    applyDashboardPrefs(p) {
        const root = document.documentElement;
        root.setAttribute('data-header-mobile-display', String(p.headerMobileDisplay));
        root.setAttribute('data-show-radio-activity', p.showRadioActivity ? 'on' : 'off');
        const container = get('dashboardContainer');
        if (container) container.classList.toggle('reverse-columns', !!p.reverseDashboardColumns);
    }
    // Réglage serveur (NVS + /setgeneral), pas 100% client comme FeedbackOverlay() ci-dessus :
    // sauvegarde par bouton "Appliquer" unique, comme GeoOverlay()/LedOverlay(), plutôt
    // qu'application immédiate par champ -- une coupure réseau en cours de modification ne doit
    // pas laisser un sous-ensemble de champs appliqué silencieusement.
    DashboardPrefsOverlay() {
        if (get('divDashboardPrefsOverlay')) return;
        const p = this._dashboardPrefs || { headerMobileDisplay: 0, reverseDashboardColumns: false, defaultMobileTab: 'groups', showRadioActivity: false };

        const div = document.createElement('div');
        div.id = 'divDashboardPrefsOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content" id="divDashboardPrefsPopupContent">
        ${modalHeader('GENERAL_DASHBOARD_PREFS', 'svg-tabHome', { subtitle: 'DASHBOARD_PREFS_MODAL_DESC' })}

        <div class="overlay-scroll-content">

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('DASHBOARD_PREFS_SECTION_HEADER')}</h3>
        <div class="uniRow dirty-target">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-toggle"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selHeaderMobileDisplay">${tr('HEADER_MOBILE_DISPLAY')}</label>
        <select id="selHeaderMobileDisplay" class="inputAndSelect">
        <option value="0" ${p.headerMobileDisplay === 0 ? 'selected' : ''}>${tr('HEADER_MOBILE_ALL')}</option>
        <option value="1" ${p.headerMobileDisplay === 1 ? 'selected' : ''}>${tr('HEADER_MOBILE_NET')}</option>
        <option value="2" ${p.headerMobileDisplay === 2 ? 'selected' : ''}>${tr('HEADER_MOBILE_UPTIME')}</option>
        <option value="3" ${p.headerMobileDisplay === 3 ? 'selected' : ''}>${tr('HEADER_MOBILE_NONE')}</option>
        </select>
        </div>
        </div>
        </div>
        </div>

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('DASHBOARD_PREFS_SECTION_LAYOUT')}</h3>
        <label class="uniRow dirty-target" for="cbReverseDashboardColumns">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-drag"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('DASHBOARD_REVERSE_COLUMNS')}</div>
        <div class="uniStatus">${tr('DASHBOARD_REVERSE_COLUMNS_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbReverseDashboardColumns" type="checkbox" ${p.reverseDashboardColumns ? 'checked' : ''}><div></div></span>
        </div>
        </label>

        <div class="uniRow">
        <div class="unifield-content">
        <label class="label">${tr('DASHBOARD_DEFAULT_TAB')}</label>
        </div>
        </div>
        <div class="SwitchBig SwitchBig-2 dirty-target" id="dashboardDefaultTabSwitch">
        <input type="radio" name="defaultMobileTab" id="defaultTabGroups" value="groups" ${p.defaultMobileTab !== 'devices' ? 'checked' : ''}>
        <label for="defaultTabGroups">${tr('DASHBOARD_TAB_GROUPS')}</label>
        <input type="radio" name="defaultMobileTab" id="defaultTabDevices" value="devices" ${p.defaultMobileTab === 'devices' ? 'checked' : ''}>
        <label for="defaultTabDevices">${tr('DASHBOARD_TAB_DEVICES')}</label>
        <div class="nav-pill"></div>
        </div>
        </div>

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('DASHBOARD_PREFS_SECTION_RADIO')}</h3>
        <label class="uniRow dirty-target" for="cbShowRadioActivity">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-signal"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('SHOW_RADIO_ACTIVITY')}</div>
        <div class="uniStatus">${tr('SHOW_RADIO_ACTIVITY_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbShowRadioActivity" type="checkbox" ${p.showRadioActivity ? 'checked' : ''}><div></div></span>
        </div>
        </label>
        </div>

        </div>

        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnDashboardPrefsCancel" line type="button">${tr('BT_CANCEL')}</button>
        <button id="btnDashboardPrefsApply" type="button">${tr('BT_APPLY')}</button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);
        watchDirty(div);

        get('btnDashboardPrefsCancel').onclick = () => confirmDiscardChanges(() => closeOverlay(div));
        get('btnDashboardPrefsApply').onclick = () => {
            const payload = {
                headerMobileDisplay: parseInt(get('selHeaderMobileDisplay').value, 10),
                reverseDashboardColumns: get('cbReverseDashboardColumns').checked,
                defaultMobileTab: div.querySelector('input[name="defaultMobileTab"]:checked')?.value || 'groups',
                showRadioActivity: get('cbShowRadioActivity').checked
            };
            putJSONSync('/setgeneral', payload, (err) => {
                if (err) { ui.serviceError(err); return; }
                this._dashboardPrefs = payload;
                this.applyDashboardPrefs(payload);
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                clearDirty(div);
                closeOverlay(div);
            });
        };
    }
    // Nom commercial de la carte, distinct du libellé de hardwareProfile (qui décrit l'ÉDITION du
    // boîtier, ex. "BOX Édition Ethernet & Wi-Fi") -- ce sont des noms propres, non traduits, comme
    // le reste des libellés de modèle de carte (cf. radioBoardTypes).
    _ledBoardLabel(profile) {
        if (profile === 'BOX-ETH') return 'WT32-ETH01';
        if (profile === 'BOX-WIFI') return 'ESP32-D1 mini';
        return tr(profile);
    }
    // Broches déjà réservées par la radio, seules connaissables de façon synchrone côté navigateur
    // (somfy.shades n'a pas d'index par GPIO). Sert au retour immédiat dans la modale ; le serveur
    // reste la validation qui fait foi (il connaît aussi les relais de volets).
    _getRadioPins() {
        const pk = ['SCKPin', 'CSNPin', 'MOSIPin', 'MISOPin', 'TXPin', 'RXPin'];
        const bv = parseInt(get('selRadioBoardType')?.value, 10);
        const isM = (bv === 255);
        const out = {};
        pk.forEach(k => {
            const el = get((isM ? 'inputTrans' : 'selTrans') + k);
            if (el && el.value !== '') out[k] = parseInt(el.value, 10);
        });
        return out;
    }
    _ledPinConflict(pin) {
        const radio = this._getRadioPins();
        for (const k in radio) {
            if (radio[k] === pin) return k.replace('Pin', '');
        }
        return null;
    }
    // Signale l'erreur AU-DESSUS du sélecteur plutôt que dans une boîte de dialogue : celle-ci
    // recouvrait la modale, donc masquait le champ fautif et son animation de secousse.
    _setLedPinError(msgKey, params) {
        const el = get('ledPinError');
        if (!el) return;
        if (!msgKey) { el.textContent = ''; el.style.display = 'none'; return; }
        let msg = tr(msgKey);
        for (const k in (params || {})) msg = msg.replace(`{${k}}`, params[k]);
        el.textContent = msg;
        el.style.display = '';
    }

    // Secousse + bordure rouge sur le conteneur entier (select/input + boutons +/-). Déclenchée
    // uniquement au clic sur Appliquer : pendant la saisie, l'utilisateur traverse forcément des
    // valeurs invalides (passer de 2 à 5 croise 3 et 4) et l'interrompre à chaque pas serait hostile.
    _shakeLedPinInput() {
        const container = get('divLedPinCustom');
        // Rien à secouer en mode préréglage : le champ manuel existe mais son bloc est masqué, et
        // agiter un élément invisible ne ferait qu'ajouter un mouvement inexplicable à l'écran.
        if (!container || !container.offsetParent) return;
        container.classList.remove('input-error');
        void container.offsetWidth;
        container.classList.add('input-error');
        setTimeout(() => container.classList.remove('input-error'), 500);
    }



    LedOverlay() {
        if (get('divLedOverlay')) return;
        const profile = get('divContainer').getAttribute('data-hardwareprofile') || '';
        const isGeneric = !profile || profile === 'GENERIC';
        const s = this._ledSettings || { ledPin: -1, ledActiveLow: false, ledRfBlink: false };

        // LED_PRESET_NONE (-1) et LED_PRESET_PICK (0) sont deux états distincts : le premier veut
        // dire "pas de LED", le second "activée mais pas encore attribuée". Le 0 est une valeur
        // fantôme -- c'est un GPIO réel sur ESP32, donc jamais enregistrée telle quelle.
        const NONE = -1, PICK = 0, MANUAL = 255;
        let presetVal = String(NONE);
        if (s.ledPin === 5) presetVal = '5';
        else if (s.ledPin === 2) presetVal = '2';
        else if (s.ledPin > 0) presetVal = String(MANUAL);
        const enabled = s.ledPin >= 0;
        // Broche proposée en mode manuel quand rien n'est configuré : la 4 est libre par défaut sur
        // tous les profils de puce connus et n'est pas une broche de strapping.
        this._lastValidLedPin = (presetVal === String(MANUAL)) ? s.ledPin : 4;

        const div = document.createElement('div');
        div.id = 'divLedOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content ledOverlay-content" id="divLedPopupContent">
        ${modalHeader('GENERAL_LED_TITLE', 'svg-led', {
            subtitle: 'GENERAL_LED_MODAL_DESC',
        })}
        <div class="overlay-scroll-content">

        ${isGeneric ? `
        <div class="SwitchBig marginB25" id="ledEnableSwitch">
        <input id="cbLedEnabled" type="checkbox" ${enabled ? 'checked' : ''}>
        <label for="cbLedEnabled" class="label-left">${tr('LED_DISABLED_BTN')}</label>
        <label for="cbLedEnabled" class="label-right">${tr('LED_ENABLED_BTN')}</label>
        <div class="nav-pill"></div>
        </div>

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('GENERAL_LED_PIN_SECTION')}</h3>



        <div class="uniStatus ledPinWarn" id="ledPinError" style="display:none"></div>






        <div class="baseFlexCol ">
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-esp"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selLedBoardPreset">${tr('GENERAL_LED_BOARD_PRESET')}</label>
        <select id="selLedBoardPreset" class="inputAndSelect">
        <option value="${NONE}" ${presetVal === String(NONE) ? 'selected' : ''}>${tr('GENERAL_LED_PIN_NONE')}</option>
        <option value="${PICK}" ${presetVal === String(PICK) ? 'selected' : ''}>${tr('GENERAL_LED_PRESET_PICK')}</option>
        <option value="5" ${presetVal === '5' ? 'selected' : ''}>WT32-ETH01</option>
        <option value="2" ${presetVal === '2' ? 'selected' : ''}>ESP32-D1 mini</option>
        <option value="${MANUAL}" ${presetVal === String(MANUAL) ? 'selected' : ''}>${tr('GENERAL_LED_PRESET_MANUAL')}</option>
        </select>
        </div>
        </div>


        <div class="baseFlexCol">

        <div class="uniStatus led-pin-help">${tr('GENERAL_LED_PIN_DESC')}</div>
        </div>




        <div id="divLedManualBlock" style="display:${presetVal === String(MANUAL) ? 'block' : 'none'};">
        <div class="uniRow dirty-target">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-gpioMy"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="inputLedPinManual">${tr('GENERAL_LED_PIN')}</label>
        <div class="input-number-custom" id="divLedPinCustom">
        <input type="number" id="inputLedPinManual" class="inputAndSelect" min="0" max="48" value="${this._lastValidLedPin}" autocomplete="new-password">
        <div class="step-buttons-warp">
        <div class="step-buttons">
        <button type="button" id="btnLedPinMinus">-</button>
        <button type="button" id="btnLedPinPlus">+</button>
        </div>
        </div>
        </div>
        <div class="uniStatus ledPinWarn" id="ledPinWarn" style="display:none"></div>
        </div>
        </div>
        </div>
        <div class="manual-safety-block">
        <label class="safety-label" for="cbLedManualSafety">
        <span class="switch"><input id="cbLedManualSafety" type="checkbox"><div></div></span>
        <span class="safety-text">${tr('RADIO_SAFETY_TEXT')}</span>
        </label>
        </div>
        </div>
        </div>
        ` : ''}

        </div>


        <label class="uniRow dirty-target" for="cbLedActiveLow" id="rowLedActiveLow" style="display:${isGeneric ? 'flex' : 'none'};">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-gpioUp"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('GENERAL_LED_ACTIVE_LOW')}</div>
        <div class="uniStatus">${tr('GENERAL_LED_ACTIVE_LOW_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbLedActiveLow" type="checkbox" ${s.ledActiveLow ? 'checked' : ''}><div></div></span>
        </div>
        </label>

        <label class="uniRow dirty-target" for="cbLedRfBlink">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-wave"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('GENERAL_LED_RF_BLINK')}</div>
        <div class="uniStatus">${tr('GENERAL_LED_RF_BLINK_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbLedRfBlink" type="checkbox" ${s.ledRfBlink ? 'checked' : ''}><div></div></span>
        </div>
        </label>
        </div>


        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnLedCancel" line type="button">${tr('BT_CANCEL')}</button>
        <button id="btnLedApply" type="button" disabled>${tr('BT_APPLY')}</button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);
        watchDirty(div);

        const markDirty = () => { get('btnLedApply').disabled = false; };

        if (isGeneric) {
            const swEnabled = get('cbLedEnabled');
            const presetSel = get('selLedBoardPreset');
            const manualBlock = get('divLedManualBlock');
            const inputPin = get('inputLedPinManual');
            const warn12 = get('ledPinWarn');

            const cm = (get('divContainer').getAttribute('data-chipmodel') || '').toLowerCase();
            const pm = (typeof somfy !== 'undefined' && somfy.pinMaps.find(x => x.name === cm)) || { maxPins: 39 };

            // Avertissement de strapping affiché en continu (il informe, il ne bloque pas), au
            // contraire des erreurs de plage/conflit réservées au clic sur Appliquer.
            const updateWarn = () => {
                const v = parseInt(inputPin.value, 10);
                // MTDI n'est la broche 12 que sur l'ESP32 d'origine ; les S2/S3/C3 ont un autre brochage.
                const risky = v === 12 && (cm === '' || cm === 'esp32');
                warn12.textContent = risky ? tr('GENERAL_LED_PIN_WARN_12') : '';
                warn12.style.display = risky ? '' : 'none';
            };
            updateWarn();

            const syncPreset = () => {
                const val = parseInt(presetSel.value, 10);
                manualBlock.style.display = (val === MANUAL) ? 'block' : 'none';
                // Le switch et le sélecteur décrivent la même chose : "aucune broche" ne peut pas
                // coexister avec un témoin activé, dans un sens comme dans l'autre.
                swEnabled.checked = (val !== NONE);
                // Les deux présets correspondent au câblage réel des boîtiers : aligner la polarité
                // évite le piège d'une LED qui s'allume à l'envers faute d'avoir pensé à ce réglage.
                if (val === 5) get('cbLedActiveLow').checked = true;
                else if (val === 2) get('cbLedActiveLow').checked = false;
                if (val === MANUAL) updateWarn();
                this._setLedPinError(null);
            };

            presetSel.addEventListener('change', () => { syncPreset(); markDirty(); });

            swEnabled.addEventListener('change', () => {
                if (!swEnabled.checked) {
                    presetSel.value = String(NONE);
                } else if (parseInt(presetSel.value, 10) === NONE) {
                    // Activé sans broche connue : on s'arrête sur la valeur fantôme, qui demande un
                    // choix explicite au lieu d'attribuer un GPIO arbitraire dans le dos de l'utilisateur.
                    presetSel.value = String(PICK);
                }
                syncPreset();
                markDirty();
            });

            // Navigation libre : on met juste à jour l'avertissement de strapping et on efface
            // l'erreur précédente, sans rien valider ni bloquer.
            const onManualEdit = () => { updateWarn(); this._setLedPinError(null); markDirty(); };
            inputPin.addEventListener('input', onManualEdit);
            get('btnLedPinMinus').addEventListener('click', () => {
                inputPin.value = Math.max(0, (parseInt(inputPin.value, 10) || 0) - 1);
                onManualEdit();
            });
            get('btnLedPinPlus').addEventListener('click', () => {
                inputPin.value = Math.min(pm.maxPins, (parseInt(inputPin.value, 10) || 0) + 1);
                onManualEdit();
            });

            this._ledPinMax = pm.maxPins;
        }

        get('cbLedActiveLow')?.addEventListener('change', markDirty);
        get('cbLedRfBlink').addEventListener('change', markDirty);

        get('btnLedCancel').onclick = () => confirmDiscardChanges(() => closeOverlay(div));
        get('btnLedApply').onclick = () => this.saveLedSettings(div, isGeneric);
    }
    saveLedSettings(div, isGeneric) {
        const payload = { ledRfBlink: !!get('cbLedRfBlink').checked };

        if (isGeneric) {
            const NONE = -1, PICK = 0, MANUAL = 255;
            const presetVal = parseInt(get('selLedBoardPreset').value, 10);
            let pin = presetVal;

            // Toute la validation est ici, et nulle part ailleurs : c'est le seul moment où
            // l'utilisateur affirme que sa saisie est terminée.
            if (presetVal === PICK) {
                this._setLedPinError('ERR_LED_PIN_UNSET');
                return;
            }
            if (presetVal === MANUAL) {
                pin = parseInt(get('inputLedPinManual').value, 10);
                const max = this._ledPinMax ?? 39;
                if (isNaN(pin) || pin < 0 || pin > max) {
                    this._setLedPinError('ERR_GPIO_NOT_EXIST', { pin: get('inputLedPinManual').value, maxPins: max });
                    this._shakeLedPinInput();
                    return;
                }
            }
            // Conflit vérifié pour TOUTE broche retenue, préréglages compris : un préréglage peut
            // tomber sur une broche que la radio occupe déjà sur cette carte-ci (WT32-ETH01 propose
            // la 5, qui est le CSN par défaut). Sans ce contrôle, seul le serveur refusait -- au
            // prix d'un aller-retour, et pour un message désignant un champ non affiché.
            if (pin >= 0) {
                const owner = this._ledPinConflict(pin);
                if (owner) {
                    this._setLedPinError('ERR_LED_PIN_IN_USE_SHORT', { pin: pin, owner: owner });
                    this._shakeLedPinInput();
                    return;
                }
            }
            if (presetVal === MANUAL) {
                // Le switch ne bloque pas la saisie -- comme sur la page Radio -- seulement
                // l'enregistrement, avec un message qui dit explicitement pourquoi.
                if (!get('cbLedManualSafety')?.checked) {
                    this._setLedPinError('ERR_LED_SAFETY_REQUIRED');
                    return;
                }
                this._lastValidLedPin = pin;
            }
            this._setLedPinError(null);
            payload.ledPin = pin;
            payload.ledActiveLow = !!get('cbLedActiveLow').checked;
        }

        putJSONSync('/setgeneral', payload, (err, response) => {
            if (err) {
                // Filet de sécurité en plus de la vérification locale : la radio a pu être
                // reconfigurée pendant que la modale était ouverte. Le message nomme le
                // périphérique propriétaire, la seule information réellement actionnable.
                if (err.code === 'LED_PIN_IN_USE') {
                    this._setLedPinError('ERR_LED_PIN_IN_USE_SHORT', { pin: err.pin, owner: err.owner || '?' });
                    this._shakeLedPinInput();
                } else if (err.code === 'LED_PIN_INVALID') {
                    this._setLedPinError('ERR_LED_PIN_INVALID');
                    this._shakeLedPinInput();
                } else {
                    ui.serviceError(err);
                }
                return;
            }
            this._ledSettings = {
                ledPin: typeof payload.ledPin === 'number' ? payload.ledPin : this._ledSettings.ledPin,
                ledActiveLow: typeof payload.ledActiveLow === 'boolean' ? payload.ledActiveLow : this._ledSettings.ledActiveLow,
                ledRfBlink: payload.ledRfBlink
            };
            if (typeof payload.ledPin === 'number') window.__ledPin = payload.ledPin;
            this.updateLedBadge();
            if (typeof somfy !== 'undefined') somfy.applyLedFeedbackVisibility();
            ui.successMessage(tr('MSG_SAVE_SUCCESS'));
            logger.debug('LED settings saved:', response);
            clearDirty(div);
            closeOverlay(div);
        });
    }
    setSecurityConfig(security) {
        this._currentSecurityType = security.type;
        // Le serveur ne renvoie plus jamais le PIN/mot de passe réel, seulement s'il est défini :
        // les champs de saisie démarrent donc toujours vides, jamais pré-remplis avec le secret.
        this._hasPin = !!security.hasPin;
        this._hasPassword = !!security.hasPassword;
        this._securityData = {
            username: security.username || '',
            password: '',
            repeatpassword: '',
            permissions: { configOnly: makeBool(security.permissions & 0x01) },
            pin: { d0: '', d1: '', d2: '', d3: '' }
        };
        this.onSecurityTypeChanged();
    }
    rebootDevice() {
        let prompt = ui.promptMessage(
            get('divContainer'),
            tr('PROMPT_REBOOT_CONFIRM_TITLE'),
            () => {
                if(typeof socket !== 'undefined') socket.close(3000, 'reboot');
                putJSONSync('/reboot', {}, (err, response) => {
                    get('btnSaveGeneral').classList.remove('disabled');
                    logger.debug('Reboot requested:', response);
                });
                ui.clearErrors();
            },
            true,'svg-reboot'
        );
        prompt.querySelector('.sub-message').innerHTML = `<p>${tr('PROMPT_REBOOT_CONFIRM_SUB')}</p>`;
    }

    // Peuple #langSelect à partir des langues réellement installées sur l'ESP32 (LittleFS),
    // au lieu de la liste figée d'<option> qu'index.html portait auparavant -- Phase 0 de la
    // refonte i18n. Le libellé de chaque option réutilise les clés GENERAL_OPT_<CODE> déjà
    // présentes dans chaque fichier de langue ; tr() retombe sur le code brut si absente.
    // Affiche la langue actuelle dans le bouton de paramètres (#currentLangDisplay)
    populateLangSelect(currentLang) {
        // Supprimé : localStorage.setItem('selectedLang', currentLang);
        document.documentElement.lang = currentLang;

        const langDisplay = get('currentLangDisplay');
        if (!langDisplay) return;

        // 1. Affiche immédiatement le nom traduit via les clés d'i18n
        langDisplay.textContent = tr('GENERAL_OPT_' + currentLang.toUpperCase());

        // 2. Si le manifeste est disponible, remplace par le nom natif (ex: "Français", "Deutsch")
        loadLangManifest()
        .then(manifest => {
            if (manifest && manifest.langs && manifest.langs[currentLang]?.native) {
                langDisplay.textContent = manifest.langs[currentLang].native;
            }
        })
        .catch(err => {
            logger.error('Failed to load manifest for current lang display:', err);
        });
    }

    // Change la langue active sur l'ESP32 et recharche la page
    onLanguageChanged(lang, reload = true) {
        const btn = get('btnOpenLangManager');
        if (btn) btn.disabled = true;

        // Supprimé : localStorage.setItem('selectedLang', lang);

        deviceFetch('/setLang?lang=' + lang)
        .then(resp => {
            if (resp.status === "ok") {
                if (reload) {
                    window.location.reload(true);
                } else {
                    this.populateLangSelect(lang);
                    if (btn) btn.disabled = false;
                }
            } else {
                if (btn) btn.disabled = false;
            }
        })
        .catch(err => {
            logger.error("Failed to change language:", err);
            if (btn) btn.disabled = false;
        });
    }
    // --- Catalogue des langues (Phase 2 i18n) : téléchargement à la demande depuis GitHub,
    // suppression d'une langue installée, avec progression via les évènements socket
    // langDownloadProgress/langDownloadComplete (cf. procLangDownloadProgress/Complete).
    // Affiché en modal-overlay (même patron que RoomOverlay) depuis la Phase 6 -- plus un bloc
    // dépliant encastré dans la page des paramètres. ---
    openLangManager() {
        if (get('divLangManagerOverlay')) return;
        this._manualImportPending.clear();

        const div = document.createElement('div');
        div.id = 'divLangManagerOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content lang-manager-content">
        ${modalHeader('GENERAL_MANAGE_LANGS', 'svg-language', {
            subtitle: 'GENERAL_MANAGE_LANGS_MODAL_DESC',
        })}

        <div class="overlay-scroll-content">

        <div id="langCatalog" class="lang-catalog"></div>

        <!-- Bloc d'importation manuelle globale -->

        <label for="fileLangGlobalImport" class="custom-file-upload">
        <span class="file-name-display">${tr('BT_IMPORT_LANG_FILE')}</span>
        <div class="file-icon-btn"><svg><use href="#svg-upload"></use></svg></div>
        </label>
        <input id="fileLangGlobalImport" type="file" accept="application/json,.json,application/gzip,.gz" style="display:none"
        onchange="general.handleGlobalLangUpload(this)"/>
        </div>

        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnLangManagerClose" line type="button">${tr('BT_CLOSE')}</button>
        </div>
        </div>
        </div>`;

        shOverlay(div);

        div.onclick = (e) => {
            if (e.target.id === 'btnLangManagerClose' || e.target.closest('#btnLangManagerClose')) {
                requestCloseOverlay(div);
            }
        };

        this.loadLangCatalog();
    }
    handleGlobalLangUpload(input) {
        const file = input.files && input.files[0];
        if (!file) return;

        // Tente d'extraire le code du nom de fichier (ex: "es.json" -> "es", "es.json.gz" -> "es")
        // Ou lit le contenu si le code doit être extrait de la structure du fichier JSON.
        const fileName = file.name.toLowerCase();
        const codeMatch = fileName.match(/([a-z]{2})\.json(?:\.gz)?$/);
        const code = codeMatch ? codeMatch[1] : null;

        if (!code) {
            ui.serviceError({ desc: tr('ERR_INVALID_LANG_FILENAME') || "Format de fichier invalide (attendu: xx.json ou xx.json.gz)" });
            input.value = ''; // Réinitialise l'input
            return;
        }

        // L'import (importLangFileManually) puis la bascule de langue qui suit (onLanguageChanged)
        // se terminent par un rechargement complet de la page, plusieurs secondes plus tard --
        // sans indicateur, la modale ne montrait rien pendant ce temps et l'utilisateur subissait
        // un rechargement inexpliqué (même défaut déjà corrigé côté téléchargement automatique,
        // cf. MSG_LANG_DOWNLOADING_RELOAD dans acceptLangPrompt()).
        const overlay = ui.waitMessage(get('divLangManagerOverlay') || get('divContainer'), 'MSG_WAIT_LANG_IMPORT');

        // L'upload est en vol : bloque la fermeture accidentelle du catalogue tant qu'il n'a pas
        // abouti (succès ou échec) -- cf. setOverlayLock() dans 20-shell.js.
        setOverlayLock(get('divLangManagerOverlay'), 'confirm', {
            titleKey: 'PROMPT_LANG_ACTION_TITLE',
            msgKey: 'PROMPT_LANG_ACTION_MSG',
        });

        // Réutilise la fonction d'importation existante
        importLangFileManually(code, file)
        .then(() => {
            clearOverlayLock(get('divLangManagerOverlay'));
            input.value = '';
            this.onLanguageChanged(code);
        })
        .catch(err => {
            clearOverlayLock(get('divLangManagerOverlay'));
            input.value = '';
            if (overlay) overlay.remove();
            logger.error('Global manual language upload failed for ' + code + ':', err);
            ui.serviceError({ desc: err.message, service: '/uploadLang' });
        });
    }

    // Le catalogue croise l'état local de l'appareil et le manifeste distant : loadLangManifest()
    // tombe sur GitHub dès que le manifeste embarqué manque, et cet aller-retour peut prendre
    // plusieurs secondes. Sans indicateur, la modale restait vide et paraissait figée -- d'où
    // l'attente explicite, annoncée comme une récupération d'informations distantes.
    loadLangCatalog() {
        const panel = get('langCatalog');
        if (!panel) return;
        const overlay = ui.waitMessage(get('divLangManagerOverlay') || panel, 'MSG_WAIT_LANG_CATALOG');
        Promise.all([
            deviceFetch('/getAvailableLangs'),
            loadLangManifest()
        ])
        .then(([list, manifest]) => this.renderLangCatalog(list, manifest))
        .catch(err => {
            logger.error('Failed to load language catalog:', err);
            ui.serviceError(err);
        })
        .finally(() => { if (overlay) overlay.remove(); });
    }
    renderLangCatalog(list, manifest) {
        const panel = get('langCatalog');
        if (!panel) return;

        // La source de vérité est l'attribut lang de la balise <html> ---
        // window.__defaultLangCode est là en ultime sécurité (probablement injecté par le serveur)
        const activeLang = document.documentElement.lang || window.__defaultLangCode || 'en';
        panel.innerHTML = list.map(entry => {
            // Le nom natif du manifeste (Phase 3) prime sur GENERAL_OPT_<CODE> : il reste correct
            // même pour une langue absente de la traduction actuellement chargée (tr() retomberait
            // sinon sur la clé brute).
            const manifestInfo = manifest && manifest.langs ? manifest.langs[entry.code] : null;
            const label = (manifestInfo && manifestInfo.native) || tr('GENERAL_OPT_' + entry.code.toUpperCase());
            const isActive = entry.code === activeLang;

            const isPending = window.__pendingLangCode === entry.code;

            let badge = '';
            if (isActive) badge = `<span class="lang-catalog-badge active">${tr('LANG_ACTIVE')}</span>`;
            else if (entry.installed) badge = `<span class="lang-catalog-badge">${tr('LANG_INSTALLED')}</span>`;
            else if (isPending) badge = `<span class="lang-catalog-badge">${tr('LANG_PENDING_BADGE')}</span>`;

            let actions = '';
            let manualImportBlock = '';
            if (!isActive && entry.installed) {
                actions = `<button type="button" pop onclick="general.useLang('${entry.code}')">${tr('BT_USE_LANG')}</button>`;
                // La langue embarquée d'usine pour cet environnement (window.__defaultLangCode --
                // fr sur BOX, en sinon) reste le filet de sécurité universel côté backend
                // (handleLang) -- jamais supprimable.
                if (entry.code !== window.__defaultLangCode) {
                    actions += `<button type="button" pop line onclick="general.deleteLang('${entry.code}')">${tr('BT_DELETE_LANG')}</button>`;
                }
            } else if (!isActive && !entry.installed && entry.downloadable) {
                if (isPending) {
                    // Persiste côté firmware (settings.pendingLang) -- reste affiché tel quel après
                    // rechargement de page, tant que GitUpdater::checkPendingLang() n'a pas réussi
                    // ou que l'utilisateur n'a pas annulé.
                    manualImportBlock = `
                    <div class="lang-catalog-manual-import">
                        <p class="lang-catalog-manual-import-info">${tr('MSG_LANG_PENDING_INFO')}</p>
                        <button type="button" pop line onclick="general.cancelPendingLang('${entry.code}')">${tr('BT_CANCEL_PENDING')}</button>
                    </div>`;
                }
                // Le relais navigateur a confirmé qu'aucune route Internet n'existe depuis cet
                // appareil (github-fetch-failed, cf. relayLangDownload) -- on remplace le bouton
                // de téléchargement par le choix entre import manuel et mise en attente, plutôt
                // qu'un message d'erreur.
                else if (this._manualImportPending.has(entry.code)) {
                    const rawUrl = manifestInfo && manifestInfo.path ? `${GITHUB_RAW_ROOT}main/${manifestInfo.path}` : '';
                    manualImportBlock = `
                    <div class="lang-catalog-manual-import">
                        <p class="lang-catalog-manual-import-info">${tr('MSG_LANG_MANUAL_IMPORT_INFO')}</p>
                        ${rawUrl ? `<a href="${rawUrl}" target="_blank" rel="noopener" class="link" style="display:block; margin-bottom:8px;">${tr('LANG_MANUAL_IMPORT_LINK')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a>` : ''}
                        <input id="fileLangImport_${entry.code}" type="file" accept="application/json,.json,application/gzip,.gz" style="display:none"
                        onchange="general.handleManualLangImport('${entry.code}', this)"/>
                        <label for="fileLangImport_${entry.code}" class="custom-file-upload">
                        <span class="file-name-display">${tr('BT_IMPORT_LANG_FILE')}</span>
                        <div class="file-icon-btn"><svg><use href="#svg-upload"></use></svg></div>
                        </label>
                        <button type="button" pop line style="margin-top:8px;" onclick="general.setPendingLang('${entry.code}')">${tr('BT_APPLY_LATER')}</button>
                    </div>`;
                } else {
                    actions = `<button type="button" pop onclick="general.downloadLang('${entry.code}')">${tr('BT_DOWNLOAD_LANG')}</button>`;
                }
            }

            return `
            <div class="lang-catalog-row" data-code="${entry.code}">
                <div class="lang-catalog-info">
                    <span class="lang-catalog-code">${entry.code}</span>
                    <span>${label}</span>
                    ${badge}
                </div>
                <div class="lang-catalog-progress" id="langProgress_${entry.code}"><div class="lang-catalog-progress-bar"></div></div>
                <div class="lang-catalog-actions">${actions}</div>
            </div>
            ${manualImportBlock}`;
        }).join('');
    }
    useLang(code) {
        this.onLanguageChanged(code);
    }
    downloadLang(code) {
        const row = document.querySelector(`.lang-catalog-row[data-code="${code}"]`);
        if (row) {
            const actions = row.querySelector('.lang-catalog-actions');
            if (actions) actions.innerHTML = '';
            const prog = row.querySelector('.lang-catalog-progress');
            if (prog) prog.classList.add('active');
        }
        // Mode AP : l'ESP32 n'a aucune route Internet, /downloadLang échouerait à coup sûr --
        // on tente le relais navigateur (Phase 4) à la place.
        if (isApMode) {
            this.relayLangDownload(code);
            return;
        }
        // Le téléchargement est en vol : bloque la fermeture accidentelle du catalogue jusqu'à ce
        // que langDownloadComplete (succès/échec, cf. procLangDownloadComplete) confirme la fin --
        // ou, si le déclenchement lui-même échoue ci-dessous, cet évènement n'arrivera jamais et le
        // verrou doit être levé immédiatement dans les branches d'erreur.
        setOverlayLock(get('divLangManagerOverlay'), 'confirm', {
            titleKey: 'PROMPT_LANG_ACTION_TITLE',
            msgKey: 'PROMPT_LANG_ACTION_MSG',
        });
        deviceFetch('/downloadLang?code=' + code, { method: 'POST' })
        .then(resp => {
            // Le succès réel (bascule + reload) est piloté par l'évènement socket
            // langDownloadComplete, pas par cette réponse HTTP qui ne confirme que le déclenchement
            // (handleDownloadLang répond {"status":"queued"}, jamais "ok", pour cette route).
            if (resp.status !== 'queued') {
                clearOverlayLock(get('divLangManagerOverlay'));
                ui.serviceError(resp);
                this.loadLangCatalog();
            }
        })
        .catch(err => {
            clearOverlayLock(get('divLangManagerOverlay'));
            logger.error('Failed to trigger language download:', err);
            ui.serviceError(err);
            this.loadLangCatalog();
        });
    }
    // Relais navigateur (Phase 4) : best-effort, jamais bloquant -- si le navigateur n'a pas de
    // connectivité propre (PC sans 4G) ou si CompressionStream n'est pas supporté, on retombe
    // proprement sur un message plutôt que de laisser l'utilisateur face à une erreur opaque.
    relayLangDownload(code) {
        setOverlayLock(get('divLangManagerOverlay'), 'confirm', {
            titleKey: 'PROMPT_LANG_ACTION_TITLE',
            msgKey: 'PROMPT_LANG_ACTION_MSG',
        });
        relayLangViaBrowser(code)
        .then(() => { clearOverlayLock(get('divLangManagerOverlay')); this.onLanguageChanged(code); })
        .catch(err => {
            clearOverlayLock(get('divLangManagerOverlay'));
            logger.error('Browser relay failed for language ' + code + ':', err);
            // github-fetch-failed = raw.githubusercontent.com confirmé injoignable depuis cet
            // appareil (pas juste un souci passager) : pas de message d'erreur ici, on bascule
            // directement vers le fallback d'import manuel (100% fiable, sans dépendance réseau)
            // plutôt que de laisser l'utilisateur face à une impasse.
            if (err.message.startsWith('github-fetch-failed')) {
                this._manualImportPending.add(code);
                // Depuis un toast (acceptLangPrompt/reinstallActiveLang), la modale du catalogue
                // n'est pas forcément ouverte -- l'ouvrir pour que l'utilisateur voie le bloc
                // d'import qui vient d'être activé (openLangManager() réinitialise
                // _manualImportPending et recharge déjà le catalogue, donc on préserve/relance
                // séparément selon le cas pour éviter un double chargement).
                if (get('divLangManagerOverlay')) {
                    this.loadLangCatalog();
                } else {
                    const pending = new Set(this._manualImportPending);
                    this.openLangManager();
                    this._manualImportPending = pending;
                }
                return;
            }
            // Le détail technique (err.message) est volontairement ajouté au message générique --
            // c'est le seul moyen de distinguer à distance "pas d'accès Internet sur cet appareil"
            // d'un vrai échec côté ESP32 sans avoir accès à la console du navigateur du client.
            ui.serviceError({ desc: `${tr('MSG_LANG_RELAY_UNAVAILABLE')} (${err.message})`, service: '/uploadLang' });
            this.loadLangCatalog();
        });
    }
    handleManualLangImport(code, input) {
        const file = input.files && input.files[0];
        if (!file) return;
        // Même remarque que handleGlobalLangUpload() : l'import puis onLanguageChanged()
        // terminent par un rechargement de page plusieurs secondes plus tard.
        const overlay = ui.waitMessage(get('divLangManagerOverlay') || get('divContainer'), 'MSG_WAIT_LANG_IMPORT');
        setOverlayLock(get('divLangManagerOverlay'), 'confirm', {
            titleKey: 'PROMPT_LANG_ACTION_TITLE',
            msgKey: 'PROMPT_LANG_ACTION_MSG',
        });
        importLangFileManually(code, file)
        .then(() => {
            clearOverlayLock(get('divLangManagerOverlay'));
            this._manualImportPending.delete(code);
            this.onLanguageChanged(code);
        })
        .catch(err => {
            clearOverlayLock(get('divLangManagerOverlay'));
            if (overlay) overlay.remove();
            logger.error('Manual language import failed for ' + code + ':', err);
            ui.serviceError({ desc: err.message, service: '/uploadLang' });
        });
    }
    // Mise en attente (globale AP -- catalogue + wizard) : n'essaie aucun téléchargement, se
    // contente d'enregistrer le choix côté firmware. GitUpdater::checkPendingLang() se charge de
    // la résolution dès qu'une vraie connexion Internet est disponible, y compris si personne
    // n'a de navigateur ouvert à ce moment-là -- cf. localStorage 'pendingLangWatch' pour le toast
    // de confirmation au prochain chargement (checkPendingLangApplied()).
    setPendingLang(code) {
        deviceFetch('/setPendingLang?code=' + code, { method: 'POST' })
        .then(resp => {
            if (resp.status === 'ok') {
                window.__pendingLangCode = code;
                localStorage.setItem('pendingLangWatch', code);
                this._manualImportPending.delete(code);
                this.loadLangCatalog();
            } else {
                ui.serviceError(resp);
            }
        })
        .catch(err => {
            logger.error('Failed to set pending language:', err);
            ui.serviceError({ desc: err.message, service: '/setPendingLang' });
        });
    }
    cancelPendingLang(code) {
        deviceFetch('/setPendingLang?clear=1', { method: 'POST' })
        .then(resp => {
            if (resp.status === 'ok') {
                window.__pendingLangCode = '';
                localStorage.removeItem('pendingLangWatch');
                this.loadLangCatalog();
            } else {
                ui.serviceError(resp);
            }
        })
        .catch(err => logger.error('Failed to cancel pending language:', err));
    }
    deleteLang(code) {
        deviceFetch('/deleteLang?code=' + code, { method: 'POST' })
        .then(resp => {
            if (resp.status === 'ok') this.loadLangCatalog();
            else ui.serviceError(resp);
        })
        .catch(err => logger.error('Failed to delete language:', err));
    }
    procLangDownloadProgress(prog) {
        const bar = document.querySelector(`#langProgress_${prog.code} .lang-catalog-progress-bar`);
        if (!bar) return;
        const pct = prog.total > 0 ? Math.round((prog.loaded / prog.total) * 100) : 0;
        bar.style.setProperty('--progress', `${pct}%`);
    }
    procLangDownloadComplete(msg) {
        // no-op si le catalogue n'est pas ouvert (déclenché depuis un toast, cf. acceptLangPrompt).
        clearOverlayLock(get('divLangManagerOverlay'));
        const toast = get('langPromptToast');
        if (toast) toast.remove();
        const missingToast = get('langMissingToast');
        if (missingToast) missingToast.remove();
        if (msg.success) {
            // Bascule vers la langue fraîchement téléchargée puis recharge, comme un changement manuel réussi.
            this.onLanguageChanged(msg.code);
        } else {
            ui.serviceError({ desc: `${msg.code}: download failed`, service: '/downloadLang' });
            this.loadLangCatalog();
        }
    }
    // --- Suggestion discrète de langue navigateur (Phase 3 i18n), déclenchée par
    // checkBrowserLangSuggestion() -- un simple toast, pas une modale bloquante. ---
    showBrowserLangPrompt(code, info) {
        if (get('langPromptToast')) return; // déjà affiché
        const div = document.createElement('div');
        div.id = 'langPromptToast';
        div.className = 'lang-prompt-toast';
        div.innerHTML = `
        <div class="lang-prompt-text">${tr('LANG_PROMPT_MSG').replace('{LANG}', info.native)}</div>
        <div class="lang-prompt-actions">
        <button type="button" pop onclick="general.acceptLangPrompt('${code}')">${tr('BT_INSTALL_LANG')}</button>
        <button type="button" pop line onclick="general.snoozeLangPrompt()">${tr('BT_REMIND_LATER')}</button>
        <button type="button" pop line onclick="general.dismissLangPrompt('${code}')">${tr('BT_DONT_ASK_AGAIN')}</button>
        </div>`;
        document.body.appendChild(div);
    }
    acceptLangPrompt(code) {
        // Le toast n'est pas retiré mais transformé en indicateur de progression : le
        // téléchargement prend quelques secondes et se termine par un rechargement complet de la
        // page (langDownloadComplete -> onLanguageChanged). Sans ce repère, l'utilisateur clique,
        // ne voit plus rien, puis subit un rechargement inexpliqué.
        const toast = get('langPromptToast');
        if (toast) {
            toast.innerHTML = `<div class="lang-prompt-text">${tr('MSG_LANG_DOWNLOADING_RELOAD')}</div>`;
        }
        // Le succès réel (bascule + reload) est piloté par langDownloadComplete, comme depuis le
        // catalogue. handleDownloadLang répond {"status":"queued"}, jamais "ok", pour cette route.
        deviceFetch('/downloadLang?code=' + code, { method: 'POST' })
        .then(resp => { if (resp.status !== 'queued') { if (toast) toast.remove(); ui.serviceError(resp); } })
        .catch(err => {
            // Sans cette remontée, un refus du serveur (401 au corps vide quand la sécurité est
            // active, cf. deviceFetch) ne se voyait nulle part : le toast disparaissait et il ne
            // se passait plus rien.
            if (toast) toast.remove();
            logger.error('Failed to trigger language download:', err);
            ui.serviceError(err);
        });
    }
    snoozeLangPrompt() {
        // Pas de mémorisation : reproposé au prochain chargement de page.
        const toast = get('langPromptToast');
        if (toast) toast.remove();
    }
    dismissLangPrompt(code) {
        localStorage.setItem('langPromptDismissed_' + code, '1');
        const toast = get('langPromptToast');
        if (toast) toast.remove();
    }
    // --- Langue active absente du filesystem (Phase 5 i18n), déclenché par
    // checkActiveLangAvailability() -- typiquement après une mise à jour firmware qui a réécrit
    // toute la partition LittleFS sans restaurer les langues téléchargées à la demande. Pas de
    // "ne plus demander" ici (contrairement au toast Phase 3) : c'est un vrai problème fonctionnel
    // (l'utilisateur voit l'anglais sans explication), pas une simple suggestion. ---
    showLangMissingPrompt(code) {
        if (get('langMissingToast')) return; // déjà affiché
        const div = document.createElement('div');
        div.id = 'langMissingToast';
        div.className = 'lang-prompt-toast';
        div.innerHTML = `
        <div class="lang-prompt-text">${tr('LANG_MISSING_MSG').replace('{LANG}', code.toUpperCase())}</div>
        <div class="lang-prompt-actions">
        <button type="button" pop onclick="general.reinstallActiveLang('${code}')">${tr('BT_INSTALL_LANG')}</button>
        <button type="button" pop line onclick="general.dismissLangMissingPrompt()">${tr('BT_REMIND_LATER')}</button>
        </div>`;
        document.body.appendChild(div);
    }
    reinstallActiveLang(code) {
        const toast = get('langMissingToast');
        if (toast) toast.remove();
        if (isApMode) {
            this.relayLangDownload(code);
            return;
        }
        // Le succès réel (bascule + reload) est piloté par langDownloadComplete, comme depuis le
        // catalogue. handleDownloadLang répond {"status":"queued"}, jamais "ok", pour cette route.
        deviceFetch('/downloadLang?code=' + code, { method: 'POST' })
        .then(resp => { if (resp.status !== 'queued') ui.serviceError(resp); })
        .catch(err => {
            logger.error('Failed to trigger language download:', err);
            ui.serviceError(err);
        });
    }
    dismissLangMissingPrompt() {
        // Pas de mémorisation : reproposé au prochain chargement de page tant que le problème
        // n'est pas résolu (contrairement à dismissLangPrompt(), un choix délibéré de l'utilisateur).
        const toast = get('langMissingToast');
        if (toast) toast.remove();
    }
    // Confirmation "one-shot" (cf. checkPendingLangApplied()) qu'une langue mise en attente en
    // mode AP vient d'être téléchargée et appliquée automatiquement -- l'interface est déjà dans
    // cette langue au moment où ce toast s'affiche, c'est une simple notification, pas une action.
    showLangAppliedToast(code) {
        if (get('langAppliedToast')) return;
        const div = document.createElement('div');
        div.id = 'langAppliedToast';
        div.className = 'lang-prompt-toast';
        const label = tr('GENERAL_OPT_' + code.toUpperCase());
        div.innerHTML = `
        <div class="lang-prompt-text">${tr('MSG_LANG_PENDING_APPLIED').replace('{LANG}', label)}</div>
        <div class="lang-prompt-actions">
        <button type="button" pop line onclick="get('langAppliedToast').remove();">${tr('BT_CLOSE')}</button>
        </div>`;
        document.body.appendChild(div);
    }
    onModeThemeChanged() {
        const sel = get('selThemeMode');
        const val = sel.value;
        localStorage.setItem('themeMode', val);
        this.applyTheme(val);
    }
    onSecurityTypeChanged() {
        const badge = get('badgeSecurityState');
        if (!badge) return;
        badge.classList.remove('state-disabled', 'state-pin', 'state-password');

        if (this._currentSecurityType === 0) {
            badge.textContent = tr('SECURITY_DESACTIVATE');
            badge.classList.add('state-disabled');
        } else if (this._currentSecurityType === 1) {
            badge.textContent = tr('SECURITY_PIN_CODE');
            badge.classList.add('state-pin');
        } else if (this._currentSecurityType === 2) {
            badge.textContent = tr('SECURITY_PASSWORD');
            badge.classList.add('state-password');
        }
    }
    SecurityOverlay() {
        if (get('divSecurityOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divSecurityOverlay';
        div.className = 'modal-overlay';

        // Page unique : le mode (Désactivé / Code PIN / Mot de passe) se choisit sur un seul
        // SwitchBig à 3 positions, qui remplace à la fois l'ancien carrousel en 2 étapes, les deux
        // cartes radio et le bouton "Désactiver". Les radios gardent le nom secTypeGroup : c'est
        // toujours la source de vérité lue à l'enregistrement (cf. saveSecurity()).
        const currentType = this._currentSecurityType || 0;

        div.innerHTML = `
        <div class="message-content securityOverlay-content" id="divSecurityPopupContent">
        ${modalHeader('GENERAL_SECURITY', 'svg-lock', {
            subtitle: 'GENERAL_SECURITY_MODAL_DESC',
        })}

        <div class="overlay-scroll-content">

        <div class="SwitchBig SwitchBig-3 dirty-target" id="secTypeSwitch">
        <input type="radio" name="secTypeGroup" id="secType0" value="0" ${currentType === 0 ? 'checked' : ''}>
        <label for="secType0">${tr('SECURITY_DESACTIVATE')}</label>
        <input type="radio" name="secTypeGroup" id="secType1" value="1" ${currentType === 1 ? 'checked' : ''}>
        <label for="secType1">${tr('SECURITY_PIN_CODE')}</label>
        <input type="radio" name="secTypeGroup" id="secType2" value="2" ${currentType === 2 ? 'checked' : ''}>
        <label for="secType2">${tr('SECURITY_PASSWORD')}</label>
        <div class="nav-pill"></div>
        </div>
        <p id="secTypeDesc" class="sec-type-desc"></p>

        <label class="uniRow marginB25 dirty-target">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#vr-favori"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('SECURITY_SECURE_CONFIG_ONLY')}</div>
        <div class="uniStatus">${tr('SECURITY_SECURE_CONFIG_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch">
        <input id="cbSecureConfigOnly" name="hardwired" type="checkbox" data-bind="security.permissions.configOnly"/>
        <div></div>
        </span>
        </div>
        </label>

        <div id="divPopupPin" class="uniblocCol" style="display: ${currentType === 1 ? 'block' : 'none'};">
        <label class="labelMAJ">${tr('SECURITY_ENTER_PIN')}</label>
        <div style="display: flex; justify-content: center; gap: 10px;">
        <input class="pin-digit" type="password" maxlength="1">
        <input class="pin-digit" type="password" maxlength="1">
        <input class="pin-digit" type="password" maxlength="1">
        <input class="pin-digit" type="password" maxlength="1">
        </div>
        </div>

        <div id="divPopupPassword" style="display: ${currentType === 2 ? 'block' : 'none'};">
        <div class="baseFlexCol">
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-user"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldUsername">${tr('SECURITY_USERNAME')}</label>
        <input id="fldUsername" class="inputAndSelect" name="username" type="text" data-bind="security.username" maxlength="32" placeholder="${tr('SECURITY_USERNAME_PLH')}">
        </div>
        </div>
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-lock"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldPassword">${tr('SECURITY_PASSWORD')}</label>
        <input id="fldPassword" class="inputAndSelect" name="password" type="password" maxlength="32" placeholder="${tr('SECURITY_PASSWORD_PLH')}">
        <div class="password-eye" onclick="security.toggleFieldPassword('fldPassword', this)"><svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg></div>
        </div>
        </div>
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-lock"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldRenterPassword">${tr('SECURITY_CONFIRM_PASSWORD')}</label>
        <input id="fldRenterPassword" class="inputAndSelect" name="password" type="password" maxlength="32" placeholder="${tr('SECURITY_CONFIRM_PASSWORD')}">
        <div class="password-eye" onclick="security.toggleFieldPassword('fldRenterPassword', this)"><svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg></div>
        </div>
        </div>
        </div>
        </div>
        </div>

        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnSecGoBack" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnPopupSaveSec" type="button"><svg><use href="#svg-save"></use></svg><span>${tr('BT_SAVE')}</span></button>
        </div>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);

        ui.toElement(div, { security: this._securityData || { username: '', permissions: { configOnly: false } } });
        initSecretPinGroup(div.querySelectorAll('#divPopupPin .pin-digit'), this._hasPin);
        initSecretField(div.querySelector('#fldPassword'), this._hasPassword);
        watchDirty(div);

        div.querySelector('#btnSecGoBack').onclick = () => { clearDirty(); closeOverlay(div); };

        // Le switch pilote directement la description affichée ET les champs de saisie : rien à
        // saisir en mode Désactivé, le pavé PIN en mode Code PIN, le couple identifiant/mot de
        // passe en mode Mot de passe.
        const selectedType = () => {
            const checked = div.querySelector('input[name="secTypeGroup"]:checked');
            return checked ? parseInt(checked.value, 10) : 0;
        };
        const SEC_DESC = { 0: 'SECURITY_INACTIVE_DESC', 1: 'SECURITY_PIN_CODE_DESC', 2: 'SECURITY_PASSWORD_DESC' };
        const applyType = () => {
            const val = selectedType();
            div.querySelector('#divPopupPin').style.display = (val === 1) ? 'block' : 'none';
            div.querySelector('#divPopupPassword').style.display = (val === 2) ? 'block' : 'none';
            const desc = div.querySelector('#secTypeDesc');
            if (desc) {
                desc.textContent = tr(SEC_DESC[val]);
                desc.classList.toggle('is-warning', val === 0);
            }
        };
        div.querySelectorAll('input[name="secTypeGroup"]').forEach(r => r.addEventListener('change', applyType));
        applyType();

        div.querySelector('#btnPopupSaveSec').onclick = () => {
            this._currentSecurityType = selectedType();
            clearDirty();
            closeOverlay(div);
            this.saveSecurity();
        };

        const pinInputs = div.querySelectorAll('.pin-digit');
        pinInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1 && index < pinInputs.length - 1) pinInputs[index + 1].focus();
            });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) pinInputs[index - 1].focus();
                });
        });
    }
    saveSecurity() {
        const popupContent = get('divSecurityPopupContent');
        let s;
        let finalType = 0;
        let pinInputs = [];
        let pwdInput = null;
        let repeatInput = null;

        if (popupContent) {
            const boundData = ui.fromElement(popupContent);
            s = (boundData && boundData.security) ? boundData.security : { username: '', permissions: { configOnly: false } };
            pinInputs = popupContent.querySelectorAll('#divPopupPin .pin-digit');
            pwdInput = popupContent.querySelector('#fldPassword');
            repeatInput = popupContent.querySelector('#fldRenterPassword');
            // Le SwitchBig à 3 positions porte le mode voulu, "Désactivé" (valeur 0) compris :
            // c'est donc lui qui fait foi, sans drapeau d'activation séparé à tenir à jour.
            const checkedRadio = popupContent.querySelector('input[name="secTypeGroup"]:checked');
            finalType = checkedRadio ? parseInt(checkedRadio.value, 10) : this._currentSecurityType;
        } else {
            s = this._securityData || { username: '', permissions: { configOnly: false } };
            finalType = this._currentSecurityType;
        }
        // Le serveur ne renvoie jamais le PIN/mot de passe existant : un champ encore masqué par le
        // faux affichage (jamais ouvert/modifié) veut dire "non modifié", pas "à effacer".
        const pin = secretPinValue(pinInputs);
        const pinTouched = pin.length > 0;
        const password = pwdInput ? secretValue(pwdInput) : '';
        const repeatPassword = repeatInput ? secretValue(repeatInput) : '';
        const passwordTouched = !!password || !!repeatPassword;

        let confirmText = '';
        if (finalType === 0) {
            confirmText = `<p>${tr('PROMPT_SECURITY_CONFIRM_DESACTIVE')}</p>`;
        }
        else if (finalType === 1) {
            if (pinTouched) {
                if (pin.length !== 4) return this.secError('ERR_PIN_INVALID', 'ERR_PIN_INVALID_DESC');
            } else if (!this._hasPin) {
                return this.secError('ERR_PIN_INVALID', 'ERR_PIN_INVALID_DESC');
            }
            confirmText = `<p>${tr('SAVESECURITY_PIN_WARNING')}</p><p>${tr('SAVESECURITY_PIN_CONFIRM')}</p>`;
        }
        else if (finalType === 2) {
            if (!s.username) return this.secError('ERR_USERNAME_MISSING', 'ERR_USERNAME_MISSING_DESC');
            if (passwordTouched) {
                if (password !== repeatPassword) return this.secError('ERR_PASSWORD_MISMATCH', 'ERR_PASSWORD_MISMATCH_DESC');
            } else if (!this._hasPassword) {
                return this.secError('ERR_PASSWORD_MISSING', 'ERR_PASSWORD_MISSING_DESC');
            }
            confirmText = `<p>${tr('SAVESECURITY_PASSWORD_WARNING')}</p><p>${tr('SAVESECURITY_PASSWORD_CONFIRM')}</p>`;
        }

        const data = {
            type: finalType,
            username: s.username || '',
            password: passwordTouched ? password : '',
            pin: pinTouched ? pin : '',
            // Seule "permissions" est lue côté firmware (cf. SecuritySettings::fromJSON) : "perm"
            // était un doublon jamais consommé par le serveur.
            permissions: (s.permissions && s.permissions.configOnly) ? 0x01 : 0x00
        };

        const applyLocalState = () => {
            this._currentSecurityType = finalType;
            if (pinTouched) this._hasPin = true;
            if (passwordTouched) this._hasPassword = true;

            if (popupContent) this._securityData = { username: s.username, permissions: s.permissions };

            this.onSecurityTypeChanged();
        };

        const prompt = ui.promptMessage(tr('PROMPT_SECURITY_CONFIRM'), () => {
            putJSONSync('/saveSecurity', data, (e, resp) => {
                prompt.remove();
                if (e) {
                    ui.serviceError(e);
                    return;
                }
                // Le serveur recalcule un apikey sur les NOUVEAUX réglages et le renvoie ici
                // (cf. Web::handleSaveSecurity). Sans le mémoriser, activer la sécurité depuis une
                // session jusque-là non protégée laissait security.apiKey vide : tous les appels
                // suivants (rechargement socket, redémarrage...) repartaient sans clé et
                // échouaient en 401, alors que l'utilisateur venait juste de configurer l'accès.
                if (resp && resp.apiKey) security.apiKey = resp.apiKey;
                security.type = finalType;
                security.permissions = data.permissions;
                security.authenticated = (finalType !== 0);
                const cont = get('divContainer');
                if (cont) cont.setAttribute('data-securitytype', finalType);
                applyLocalState();
            });
        });
        prompt.querySelector('.sub-message').innerHTML = confirmText;
    }
    secError(title, desc) {
        ui.errorMessage(tr(title), tr(desc));
    }

    showHAOverlay() {
        const div = document.createElement('div');
        div.id = 'divHAConfig';
        div.className = 'inst-overlay';

        div.innerHTML = `
        <div class="instructions-content showHAOverlay-content">
        ${overlayHeader('HACS', 'HACS_DESC', 'svg-homeAssistant', {
            subtitle: "HACS_DESC",
            showInfo: false,
            showExpert: false
        })}
        <div class="overlay-scroll-content">
        <p><strong>${tr('HACS_PURPOSE_TITLE')}</strong></p>
        <p>${tr('HACS_PURPOSE_TEXT_1')}</p>
        <p>${tr('HACS_PURPOSE_TEXT_2')}</p>
        <p class="ha-section-title"><strong>${tr('HACS_INSTALL_TITLE')}</strong></p>
        <ol class="ha-install-list">
        <li>${tr('HACS_INSTALL_STEP_1')}</li>
        <li>${tr('HACS_INSTALL_STEP_2')}</li>
        <li>${tr('HACS_INSTALL_STEP_3')}</li>
        </ol>
        <div class="warning">
        <div class="warning-header">
        <svg><use href="#svg-warning"></use></svg>
        <b>${tr('MSG_WARNING')}</b>
        </div>
        <div class="information-text">
        <span>
        ${tr('HACS_REQ_START')}
        <a href="https://www.home-assistant.io" target="_blank" style="color: inherit; text-decoration: underline;"><strong>Home Assistant</strong></a>
        ${tr('HACS_REQ_MID')}
        <a href="https://hacs.xyz" target="_blank" style="color: inherit; text-decoration: underline;"><strong>HACS</strong></a>
        ${tr('HACS_REQ_END')}
        </span>
        </div>
        </div>
        <div class="ha-badge-container">
        <a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=xkain&repository=ESPSomfy-RTS-enhanced&category=Integration" target="_blank" class="ha-badge-button">
        <span class="ha-badge-text-main">Open HACS repository on</span>
        <span class="ha-badge-pill"><span class="ha-badge-text-pill">MY</span><svg width="18" height="18"><use href="#svg-homeAssistant"></use></svg></span>
        </a>
        <p class="ha-github-link-container">
        ${tr('HACS_OR_VISIT')} <a href="https://github.com/xkain/ESPSomfy-RTS-enhanced" target="_blank" class="ha-github-link">dépôt GitHub</a>
        </p>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
         <div class="button-container-overlay">
        <button id="btnCloseHA" type="button" onclick="closeOverlay(get('divHAConfig'))">${tr('BT_CLOSE')}</button>
        </div>
        </div>`;

        shOverlay(div);
    }
}
var general = new General();
