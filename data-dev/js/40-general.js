// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
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
        this._savedTheme = savedTheme;
        this.applyTheme(savedTheme);
        this._defaultAccent = this.readAccent();
        const savedColor = localStorage.getItem('accentColor');
        if (savedColor) {
            document.documentElement.style.setProperty('--color-accent', savedColor);
        }
        this.bindAccentColor(savedColor || this._defaultAccent);
        this.applyFeedbackPrefs();
        this.setAppVersion();
        this.setTimeZones();
        this._bindGeneralPage();
        if (sockIsOpen && ui.isConfigOpen()) socket.send('join:0');
        ui.toElement(get('divSystemSettings'), {
            general: { hostname: 'ESPSomfyRTS', username: '', password: '', posixZone: 'UTC0', ntpServer: 'pool.ntp.org' }
        });

        this.initialized = true;
    }
    // =====================================================================
    // SECTION : PAGE GÉNÉRAL (onglets, colonne d'identité, compteur de modifications)
    // =====================================================================
    _bindGeneralPage() {
        const page = get('divSystemOptions');
        get('genTabs').addEventListener('click', (e) => {
            const tab = e.target.closest('.gen-tab');
            if (tab) this.showGeneralTab(parseInt(tab.dataset.tab, 10));
        });
        bindTabSwipe(get('genPanels'), () => this._generalTab || 0, 4, (i) => this.showGeneralTab(i));
        page.querySelectorAll('input[name="genTheme"]').forEach(r => r.addEventListener('change', () => {
            const sel = get('selThemeMode');
            sel.value = r.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }));
        get('genSwatches').addEventListener('click', (e) => {
            const sw = e.target.closest('.gen-swatch');
            if (!sw) return;
            const input = get('fldAccentColor');
            input.value = sw.dataset.color;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        get('fldHostname').addEventListener('input', () => this._renderHero());
        get('selTimeZone').addEventListener('change', () => this._renderHero());
        // Après _markDirty (écouteur posé par watchDirty sur l'ancêtre #divSystemSettings, donc
        // appelé APRÈS celui-ci) : différé d'un tour pour compter le champ qui vient d'être marqué.
        ['input', 'change'].forEach(evt => page.addEventListener(evt, () => setTimeout(() => this.updateDirtyCount(), 0)));
        this._bindGeo();
        this.renderSecurityTile();
    }
    showGeneralTab(i) {
        if (i < 0 || i > 3) return;
        this._generalTab = i;
        document.querySelectorAll('#genTabs .gen-tab').forEach(t => {
            const on = parseInt(t.dataset.tab, 10) === i;
            t.classList.toggle('selected', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) t.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
        document.querySelectorAll('#genPanels > [data-tab]').forEach(p => { p.hidden = parseInt(p.dataset.tab, 10) !== i; });
    }
    // La protection de l'interface s'enregistre à part (bouton de sa tuile, cf. saveSecurity) :
    // elle n'entre ni dans le compteur ni dans Enregistrer/Annuler du bas de page.
    _pageDirtyTargets() {
        const sec = get('genSecTile');
        return Array.from(get('divSystemOptions').querySelectorAll('.dirty-target'))
            .filter(t => !sec.contains(t) && t.querySelector('.is-dirty'));
    }
    updateDirtyCount() {
        const text = get('genDirtyText');
        if (!text) return;
        const n = this._pageDirtyTargets().length;
        text.textContent = n === 0 ? tr('GENERAL_DIRTY_NONE') : n === 1 ? tr('GENERAL_DIRTY_ONE') : tr('GENERAL_DIRTY_MANY').replace('{N}', n);
        get('btnGenRevert').hidden = n === 0;
        get('btnGenSecApply').disabled = !get('genSecTile').querySelector('.is-dirty');
    }
    _clearPageDirty() {
        const sec = get('genSecTile');
        get('divSystemSettings').querySelectorAll('.is-dirty').forEach(el => { if (!sec.contains(el)) el.classList.remove('is-dirty'); });
        _recomputeIsDirty();
        if (!isDirty) document.body.classList.remove('dirty-alerted');
        this.updateDirtyCount();
    }
    revertGeneral() {
        if (this._lastSettings) ui.toElement(get('divSystemOptions'), { general: this._lastSettings });
        this._renderGeo();
        this._renderFeedback();
        this.revertClientPreviews();
        this._clearPageDirty();
        this._renderHero();
    }
    _renderHero() {
        const set = (id, v) => { const el = get(id); if (el) el.textContent = v; };
        const host = get('fldHostname')?.value || '';
        set('genHeroHost', host);
        set('genHeroUrl', host ? `http://${host.toLowerCase()}.local` : '');
        set('genChipLang', get('currentLangDisplay')?.textContent || '');
        const tz = get('selTimeZone');
        set('genChipTz', tz && tz.selectedIndex >= 0 ? tz.options[tz.selectedIndex].text : '');
        const theme = document.querySelector('input[name="genTheme"]:checked');
        set('genChipTheme', theme ? theme.nextElementSibling.textContent : '');
        set('genChipSec', this._securityLabel(this._currentSecurityType || 0));
    }
    readAccent() {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
        return /^#[0-9a-f]{6}$/i.test(v) ? v : '#1a5fb4';
    }
    bindAccentColor(saved) {
        const input = get('fldAccentColor');
        if (!input) return;
        this._savedAccent = saved;
        input.value = saved;
        this._syncSwatches();
        input.addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--color-accent', e.target.value);
            this._syncSwatches();
        });
    }
    _syncSwatches() {
        const v = (get('fldAccentColor')?.value || '').toLowerCase();
        document.querySelectorAll('#genSwatches .gen-swatch').forEach(b => b.classList.toggle('selected', b.dataset.color === v));
    }
    revertAccentPreview(scope) {
        if (!this._savedAccent) return;
        const input = get('fldAccentColor');
        if (scope && !(input && scope.contains(input))) return;
        document.documentElement.style.setProperty('--color-accent', this._savedAccent);
        if (input) input.value = this._savedAccent;
        this._syncSwatches();
    }
    revertThemePreview(scope) {
        if (!this._savedTheme) return;
        const sel = get('selThemeMode');
        if (scope && !(sel && scope.contains(sel))) return;
        this.applyTheme(this._savedTheme);
    }
    revertClientPreviews(scope) {
        this.revertAccentPreview(scope);
        this.revertThemePreview(scope);
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
        document.querySelectorAll('input[name="genTheme"]').forEach(r => { r.checked = r.value === String(val); });
        this._renderHero();
    }
    // =====================================================================
    // SECTION : RETOURS TACTILE & VISUEL (tuile #genFeedbackTile de la page Général)
    // =====================================================================
    // Préférence 100% client, jamais synchronisée au firmware -- même patron
    // que getShadeUIPrefs() plus loin dans ce fichier : un unique blob JSON en
    // localStorage. Le thème et la couleur d'accent, eux, sont bien persistés
    // côté boîtier (themeMode/accentColor, cf. ConfigSettings.h) ; localStorage
    // n'en est que le cache d'amorce, relu avant le premier pixel.
    // Le STOCKAGE est donc local, mais la SAISIE suit le bouton Enregistrer de
    // la page, comme les réglages serveur (cf. setGeneral()).
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
    // navigator.vibrate existe comme fonction sur la plupart des navigateurs desktop (Chrome/Firefox),
    // même sans moteur de vibration : il faut croiser avec un écran tactile pour savoir s'il agit.
    _hapticSupported() {
        const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        return !!navigator.vibrate && hasTouch;
    }
    _renderFeedback() {
        const tile = get('genFeedbackTile');
        if (!tile) return;
        const p = this.getFeedbackPrefs();
        const pick = (name, on, style) => {
            const v = on ? (style === 'flash' ? 'flash' : 'scale') : 'off';
            tile.querySelectorAll(`input[name="${name}"]`).forEach(r => { r.checked = r.value === v; });
        };
        pick('genFbCommands', p.visualCommands, p.styleCommands);
        pick('genFbUi', p.visualUI, p.style);
        get('cbFeedbackForms').checked = p.visualForms;
        const haptic = get('cbFeedbackHaptic');
        const supported = this._hapticSupported();
        haptic.checked = p.haptic;
        haptic.disabled = !supported;
        get('genHapticDesc').textContent = tr(supported ? 'FEEDBACK_HAPTIC_TOGGLE_DESC' : 'FEEDBACK_HAPTIC_UNSUPPORTED');
    }
    _readFeedback() {
        const radio = (name) => get('genFeedbackTile').querySelector(`input[name="${name}"]:checked`)?.value || 'scale';
        const cmd = radio('genFbCommands'), ui = radio('genFbUi');
        // « Aucun » coupe l'effet mais garde le style choisi avant, pour le retrouver en le rallumant.
        const prev = this.getFeedbackPrefs();
        return {
            haptic: get('cbFeedbackHaptic').checked,
            visualCommands: cmd !== 'off',
            styleCommands: cmd === 'off' ? prev.styleCommands : cmd,
            visualUI: ui !== 'off',
            style: ui === 'off' ? prev.style : ui,
            visualForms: get('cbFeedbackForms').checked
        };
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

            get('spanFwVersion').innerText = settings.fwVersion;
            get('spanHwVersion').innerText = settings.chipModel.length > 0 ? '-' + settings.chipModel : '';
            get('divContainer').setAttribute('data-chipmodel', settings.chipModel);

            // initPins() APRÈS data-chipmodel : loadPins() lit cet attribut pour choisir la table
            // de broches (pinMaps). Appelé avant, il ne trouvait rien et retombait sur la table
            // générique ESP32, qui exclut GPIO 6/7/8/9 (flash SPI du 32 classique) et 3 (UART0).
            // Un brochage légitime posé sur ces broches -- cas du XIAO-C3 -- n'avait alors aucune
            // <option> correspondante : le select retombait sur sa première entrée (GPIO-02) et
            // l'écran affichait 2 à la place de la vraie valeur (issue #42 du dépôt officiel).
            if (typeof somfy !== 'undefined') somfy.initPins();
            // Jeton matériel du nom d'asset, calculé par le firmware (FwInfo::boardToken)
            // et non plus déduit ici du modèle de puce -- cf. assetNameParts() dans 95-firmware.js.
            get('divContainer').setAttribute('data-assetdevice', settings.assetDevice || '');

            if (settings.hardwareProfile) {
                get('divContainer').setAttribute('data-hardwareprofile', settings.hardwareProfile);
                get('info-hwprofile').innerText = tr(settings.hardwareProfile);
            }
            this.setAppVersion();

            // La LED vit désormais dans sa propre modale (general.LedOverlay()), hors de
            // #divSystemSettings : on garde juste l'état à jour pour peupler la modale à
            // l'ouverture et pour rafraîchir le badge de la tuile.
            this._ledSettings = { ledPin: settings.ledPin, ledActiveLow: settings.ledActiveLow, ledAddressable: settings.ledAddressable,
                                  ledColorActivity: settings.ledColorActivity, ledColorOrder: settings.ledColorOrder, ledRfBlink: settings.ledRfBlink };
            window.__ledPin = typeof settings.ledPin === 'number' ? settings.ledPin : -1;
            this.updateLedBadge();

            // Position géo (lever/coucher du soleil, cf. Plannings) : geoLat=99 est la sentinelle
            // "non configuré" côté firmware (cf. ConfigSettings.h) -- hors de la plage valide -90..90.
            this._geoSettings = { geoLat: settings.geoLat, geoLon: settings.geoLon };
            this._renderGeo();
            this._renderFeedback();
            this._lastSettings = settings;

            // Personnalisation dashboard/header (general.DashboardPrefsOverlay()) : synchronisée
            // côté firmware, comme le thème et la couleur d'accent ci-dessus (seuls les retours
            // haptiques restent 100% client), pour survivre à un changement de navigateur ou
            // d'appareil.
            this._dashboardPrefs = {
                headerMobileDisplay: typeof settings.headerMobileDisplay === 'number' ? settings.headerMobileDisplay : 0,
                reverseDashboardColumns: !!settings.reverseDashboardColumns,
                defaultMobileTab: settings.defaultMobileTab === 'devices' ? 'devices' : 'groups',
                showRadioActivity: !!settings.showRadioActivity,
                // Activé par défaut côté firmware : une valeur absente (réponse d'un boîtier plus
                // ancien) doit donc valoir true, pas false -- d'où le test sur !== false plutôt
                // qu'une double négation.
                showMovementIndicator: settings.showMovementIndicator !== false
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

            loadLang(() => {
                ui.toElement(pnl, { general: settings });

                this.populateLangSelect(settings.language);
                this._renderHero();
            });
            if (settings.accentColor) {
                this._savedAccent = settings.accentColor;
                localStorage.setItem('accentColor', settings.accentColor);
            }
            else {
                this._savedAccent = this._defaultAccent;
                localStorage.removeItem('accentColor');
            }
            if (typeof settings.themeMode !== 'undefined') {
                this._savedTheme = String(settings.themeMode);
                localStorage.setItem('themeMode', this._savedTheme);
            }
            this.revertClientPreviews();

            watchDirty(pnl);
            // Retour depuis la page externe de détection de position (cf. GEO_HELPER_URL) : les
            // champs sont pré-remplis APRÈS watchDirty, pour compter comme une modification à
            // enregistrer -- jamais d'enregistrement automatique sans le geste de l'utilisateur.
            if (_pendingGeoFromUrl) {
                const prefill = _pendingGeoFromUrl;
                _pendingGeoFromUrl = null;
                this.applyGeoPrefill(prefill);
            }
            this.updateDirtyCount();
        });
    }

    // L'interface est compilée dans le firmware : plus de version d'application distincte à afficher.
    setAppVersion() { const el = get('spanAppVersion'); if (el) el.innerText = this.appVersion; }
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
        const geo = valid ? this._readGeo() : null;
        if (valid && !geo) valid = false;
        if (valid) {
            obj.geoLat = geo.geoLat;
            obj.geoLon = geo.geoLon;
            putJSONSync('/setgeneral', obj, (err, response) => {
                if (err) {
                    if (err.code === 'GEO_LAT_INVALID' || err.code === 'GEO_LON_INVALID') ui.errorMessage(tr('GENERAL_GEO_TITLE'), tr('ERR_' + err.code));
                    else ui.serviceError(err);
                } else {
                    ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                    logger.debug('General settings saved:', response);
                    if (obj.accentColor) {
                        this._savedAccent = obj.accentColor;
                        localStorage.setItem('accentColor', obj.accentColor);
                    }
                    if (typeof obj.themeMode !== 'undefined') {
                        this._savedTheme = String(obj.themeMode);
                        localStorage.setItem('themeMode', this._savedTheme);
                    }
                    this._geoSettings = geo;
                    this._lastSettings = Object.assign(this._lastSettings || {}, obj);
                    this.setFeedbackPrefs(this._readFeedback());
                    this._clearPageDirty();
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
            badge.textContent = tr('IS_DISABLED');
            badge.classList.add('state-disabled');
        }
    }
    // geoLat=99 (hors -90..90) est la sentinelle "non configuré" côté firmware, cf. ConfigSettings.h :
    // elle s'affiche en champs vides, et deux champs vidés la renvoient.
    _renderGeo() {
        const s = this._geoSettings || { geoLat: 99, geoLon: 0 };
        const isSet = s.geoLat >= -90 && s.geoLat <= 90;
        get('inputGeoLat').value = isSet ? s.geoLat.toFixed(2) : '';
        get('inputGeoLon').value = isSet ? s.geoLon.toFixed(2) : '';
    }
    _readGeo() {
        const rawLat = get('inputGeoLat').value.trim(), rawLon = get('inputGeoLon').value.trim();
        if (rawLat === '' && rawLon === '') return { geoLat: 99, geoLon: 0 };
        const lat = parseFloat(rawLat), lon = parseFloat(rawLon);
        const fail = (key) => { this.showGeneralTab(1); ui.errorMessage(tr('GENERAL_GEO_TITLE'), tr(key)); return null; };
        if (isNaN(lat) || lat < -90 || lat > 90) return fail('ERR_GEO_LAT_INVALID');
        if (isNaN(lon) || lon < -180 || lon > 180) return fail('ERR_GEO_LON_INVALID');
        return { geoLat: lat, geoLon: lon };
    }
    // Remplit la tuile comme une saisie (événements compris) : la valeur reçue compte comme une
    // modification non enregistrée, l'utilisateur vérifie puis enregistre lui-même.
    applyGeoPrefill(pos) {
        if (currentLeafId !== 'divSystemOptions') activateGrpid('divSystemOptions');
        this.showGeneralTab(1);
        [['inputGeoLat', pos.lat], ['inputGeoLon', pos.lon]].forEach(([id, v]) => {
            const el = get(id);
            el.value = Number(v).toFixed(2);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
    _bindGeo() {
        // Reconnaît une paire "lat, lon" collée en bloc (ex: copiée depuis Google Maps :
        // "43.4, -0.57") pour remplir les deux champs au lieu d'écraser un seul d'entre eux.
        const GEO_PASTE_RE = /^(-?\d+(?:[.,]\d+)?)[\s,;]+(-?\d+(?:[.,]\d+)?)$/;
        const smartPaste = (e) => {
            const raw = ((e.clipboardData || window.clipboardData)?.getData('text') || '').trim();
            const m = raw.match(GEO_PASTE_RE);
            if (!m) return;
            const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
            if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return;
            e.preventDefault();
            this.applyGeoPrefill({ lat, lon });
        };
        get('inputGeoLat').addEventListener('paste', smartPaste);
        get('inputGeoLon').addEventListener('paste', smartPaste);

        // navigator.geolocation exige un contexte sécurisé : sur l'appareil, servi en HTTP simple,
        // la détection échouerait toujours en silence -- le bouton n'existe qu'en HTTPS/localhost.
        const detect = get('btnGeoDetect');
        if (!window.isSecureContext) detect.remove();
        else detect.addEventListener('click', () => {
            if (!navigator.geolocation) { ui.errorMessage(tr('GENERAL_GEO_TITLE'), tr('ERR_GEO_UNAVAILABLE')); return; }
            navigator.geolocation.getCurrentPosition(
                (pos) => this.applyGeoPrefill({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                () => ui.errorMessage(tr('GENERAL_GEO_TITLE'), tr('ERR_GEO_DENIED')),
                { timeout: 10000 }
            );
        });
        get('btnGeoExternal').onclick = () => {
            // `return` : l'origine de CET appareil, pour que la page externe sache où renvoyer les
            // coordonnées. `lang` : la langue choisie ici, plutôt que celle du navigateur.
            const params = new URLSearchParams({ return: window.location.origin });
            const lang = localStorage.getItem('selectedLang');
            if (lang) params.set('lang', lang);
            // PAS de 'noopener' : le popup a besoin de window.opener pour nous renvoyer les
            // coordonnées par postMessage puis se refermer (cf. sendToESP() dans docs/js/geo.js).
            window.open(`${GEO_HELPER_URL}?${params.toString()}`, '_blank');
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
        // Le CSS lit :not([data-show-movement="off"]) et non ="on" : tant que /general n'a pas
        // répondu, l'attribut est absent et les cartes affichent leur témoin, ce qui est le
        // défaut. L'inverse aurait fait apparaître le halo après coup sur un équipement déjà en
        // mouvement au chargement de la page.
        root.setAttribute('data-show-movement', p.showMovementIndicator ? 'on' : 'off');
        // Posée sur #divHomePnl (ancêtre commun à .mobile-tabs ET .dashboard-split-container),
        // pas sur #dashboardContainer directement : un seul toggle pilote l'inversion desktop
        // (colonnes) ET son pendant mobile (ordre des onglets Groupes/Équipements), cf. overlays.css.
        const homePnl = get('divHomePnl');
        if (homePnl) homePnl.classList.toggle('reverse-columns', !!p.reverseDashboardColumns);
    }
    // Réglage serveur (NVS + /setgeneral), contrairement aux retours d'appui ci-dessus qui restent
    // 100% client -- mais même déroulé de saisie dans les deux cas : sauvegarde par bouton
    // "Appliquer" unique, comme LedOverlay(), plutôt qu'application immédiate par
    // champ. Ici s'ajoute une raison propre au réseau : une coupure en cours de modification ne
    // doit pas laisser un sous-ensemble de champs appliqué silencieusement.
    DashboardPrefsOverlay() {
        if (get('divDashboardPrefsOverlay')) return;
        const p = this._dashboardPrefs || { headerMobileDisplay: 0, reverseDashboardColumns: false, defaultMobileTab: 'groups', showRadioActivity: false, showMovementIndicator: true };

        const div = document.createElement('div');
        div.id = 'divDashboardPrefsOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content" id="divDashboardPrefsPopupContent">
        ${modalHeader('TAB_DASHBOARD', 'svg-tabHome', { subtitle: 'DASHB_PREFS_MODAL_DESC' })}

        <div class="overlay-scroll-content">

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('DASHB_PREFS_SECTION_HEADER')}</h3>
        <div class="uniRow dirty-target">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-header"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selHeaderMobileDisplay">${tr('DASHB_PREFS_HEADER_MOBILE_DISPLAY')}</label>
        <select id="selHeaderMobileDisplay" class="inputAndSelect">
        <option value="0" ${p.headerMobileDisplay === 0 ? 'selected' : ''}>${tr('DASHB_PREFS_HEADER_MOBILE_ALL')}</option>
        <option value="1" ${p.headerMobileDisplay === 1 ? 'selected' : ''}>${tr('DASHB_PREFS_HEADER_MOBILE_NET')}</option>
        <option value="2" ${p.headerMobileDisplay === 2 ? 'selected' : ''}>${tr('DASHB_PREFS_HEADER_MOBILE_UPTIME')}</option>
        <option value="3" ${p.headerMobileDisplay === 3 ? 'selected' : ''}>${tr('DASHB_PREFS_HEADER_MOBILE_NONE')}</option>
        </select>
        </div>
        </div>
        </div>
        </div>

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('DASHB_PREFS_SECTION_HEADER_1')}</h3>
        <label class="uniRow dirty-target" for="cbShowRadioActivity">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-tabRadio"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('DASHB_PREFS_RADIO_ACTIVITY')}</div>
        <div class="uniStatus">${tr('DASHB_PREFS_RADIO_ACTIVITY_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbShowRadioActivity" type="checkbox" ${p.showRadioActivity ? 'checked' : ''}><div></div></span>
        </div>
        </label>

        <label class="uniRow dirty-target" for="cbShowMovementIndicator">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-dashIndic"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('DASHB_PREFS_MOVEMENT_INDICATOR')}</div>
        <div class="uniStatus">${tr('DASHB_PREFS_MOVEMENT_INDICATOR_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbShowMovementIndicator" type="checkbox" ${p.showMovementIndicator ? 'checked' : ''}><div></div></span>
        </div>
        </label>
        </div>

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('DASHB_PREFS_SECTION_HEADER_2')}</h3>
        <label class="uniRow dirty-target" for="cbReverseDashboardColumns">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-column"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('DASHB_PREFS_REVERSE_COLUMNS')}</div>
        <div class="uniStatus">${tr('DASHB_PREFS_REVERSE_COLUMNS_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbReverseDashboardColumns" type="checkbox" ${p.reverseDashboardColumns ? 'checked' : ''}><div></div></span>
        </div>
        </label>

        <div class="unibloc-container">
        <div class="unifield-content">
        <label class="label">${tr('DASHB_PREFS_DEFAULT_TAB')}</label>

        </div>
        <div class="SwitchBig SwitchBig-2 dirty-target" id="dashboardDefaultTabSwitch">
        <input type="radio" name="defaultMobileTab" id="defaultTabGroups" value="groups" ${p.defaultMobileTab !== 'devices' ? 'checked' : ''}>
        <label for="defaultTabGroups">${tr('SUBTAB_GROUPS')}</label>
        <input type="radio" name="defaultMobileTab" id="defaultTabDevices" value="devices" ${p.defaultMobileTab === 'devices' ? 'checked' : ''}>
        <label for="defaultTabDevices">${tr('SUBTAB_DEVICES')}</label>
        <div class="nav-pill"></div>
        </div>
        </div>
        </div>

        </div>

        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnDashboardPrefsCancel" line type="button">${tr('BT_CANCEL')}</button>
        <button id="btnDashboardPrefsApply" type="button"><svg><use href="#svg-save"></use></svg><span>${tr('BT_SAVE')}</span></button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);
        watchDirty(div);

        get('btnDashboardPrefsCancel').onclick = () => requestCloseOverlay(div);
        get('btnDashboardPrefsApply').onclick = () => {
            const payload = {
                headerMobileDisplay: parseInt(get('selHeaderMobileDisplay').value, 10),
                reverseDashboardColumns: get('cbReverseDashboardColumns').checked,
                defaultMobileTab: div.querySelector('input[name="defaultMobileTab"]:checked')?.value || 'groups',
                showRadioActivity: get('cbShowRadioActivity').checked,
                showMovementIndicator: get('cbShowMovementIndicator').checked
            };
            putJSONSync('/setgeneral', payload, (err) => {
                if (err) { ui.serviceError(err); return; }
                this._dashboardPrefs = payload;
                this.applyDashboardPrefs(payload);
                // Contrairement à l'application au chargement (loadGeneral(), gardée à UNE seule
                // fois pour ne pas arracher l'utilisateur de l'onglet où il se trouve lors d'un
                // rechargement de settings passif), ici l'utilisateur vient de choisir CET onglet
                // par défaut explicitement et de cliquer Appliquer : le rejouer immédiatement est
                // attendu, pas une surprise -- sinon le changement restait invisible jusqu'au
                // prochain rechargement complet de page.
                if (typeof somfy !== 'undefined' && typeof somfy.switchMobileTab === 'function') {
                    somfy.switchMobileTab(payload.defaultMobileTab);
                }
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
    // reste la validation qui fait foi (il connaît aussi les relais d'équipements).
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
        // Mêmes défauts que ConfigSettings.h, pour que la modale ouverte avant toute réponse du
        // firmware montre l'état réel d'une carte neuve et pas une couleur inventée.
        const s = this._ledSettings || { ledPin: -1, ledActiveLow: false, ledAddressable: false,
                                         ledColorActivity: '#ffffff', ledColorOrder: 0, ledRfBlink: false };

        // NONE (-1) et PICK (0) sont deux états distincts : "pas de LED" contre "activée mais pas
        // encore attribuée". Le 0 est une valeur fantôme, jamais enregistrée telle quelle.
        const NONE = -1, PICK = 0, MANUAL = 255;
        const chip = (typeof somfy !== 'undefined' && somfy.chipFamily) ? somfy.chipFamily() : 'esp32';
        const ledOpts = ((typeof somfy !== 'undefined' && somfy.ledBoardTypes) || [])
            .filter(b => !b.chips || b.chips.includes(chip));
        // « Manuel » n'est pas persisté : il se déduit de l'absence d'un préréglage qui reproduise
        // EXACTEMENT la configuration -- broche, type, puis polarité (LED simple) ou ordre des
        // couleurs (adressable). Pas de repli sur la seule broche : deux cartes partagent le GPIO21
        // (XIAO ESP32-S3 en LED simple, ESP32-S3 Zero en RGB), et un réglage manuel rouvert sous
        // le nom d'un préréglage serait réécrit avec ses valeurs au prochain enregistrement.
        const preset = ledOpts.find(b => b.pin === s.ledPin && !!b.addressable === !!s.ledAddressable
                                         && (b.addressable ? (b.order || 0) === (s.ledColorOrder || 0)
                                                           : b.activeLow === !!s.ledActiveLow));
        let presetVal = String(NONE);
        if (preset) presetVal = String(preset.val);
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
        ${modalHeader('FW_LED_TITLE', 'svg-led', {
            subtitle: 'LED_MODAL_DESC',
        })}
        <div class="overlay-scroll-content">

        ${isGeneric ? `
        <div class="SwitchBig marginB25" id="ledEnableSwitch">
        <input id="cbLedEnabled" type="checkbox" ${enabled ? 'checked' : ''}>
        <label for="cbLedEnabled" class="label-left">${tr('IS_DISABLED')}</label>
        <label for="cbLedEnabled" class="label-right">${tr('ENABLED')}</label>
        <div class="nav-pill"></div>
        </div>

        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('LED_MODAL_PIN_SECTION')}</h3>



        <div class="uniStatus ledPinWarn" id="ledPinError" style="display:none"></div>






        <div class="baseFlexCol ">
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-esp"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selLedBoardPreset">${tr('LED_MODAL_BOARD_PRESET')}</label>
        <select id="selLedBoardPreset" class="inputAndSelect">
        ${ledOpts.map(b => `<option value="${b.val}" ${b.placeholder ? 'disabled hidden' : ''} ${presetVal === String(b.val) ? 'selected' : ''}>${tr(b.label)}</option>`).join('')}
        </select>
        </div>
        </div>







        <div id="divLedManualBlock" style="display:${presetVal === String(MANUAL) ? 'block' : 'none'};">
        <div class="gpio-main-wrapper">
        <div class="gpio-group-block">
        <div class="gpio-flex-container">
        <div class="gpio-card">
        <div class="input-number-custom dirty-target" id="divLedPinCustom">
        <label class="input-label" for="inputLedPinManual">GPIO</label>
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
        </div>
        <div class="manual-safety-block">
        <label class="safety-label" for="cbLedManualSafety">
        <span class="switch"><input id="cbLedManualSafety" type="checkbox"><div></div></span>
        <span class="safety-text">${tr('RADIO_SAFETY_TEXT')}</span>
        </label>
        </div>
        </div>
        </div>

        <div class="baseFlexCol">
        <div class="uniStatus led-pin-help">${tr('LED_MODAL_PIN_DESC')}</div>
        </div>

        <div class="SwitchBig SwitchBig-2 dirty-target marginB25" id="ledTypeSwitch">
        <input type="radio" name="ledType" id="rbLedPlain" value="plain" ${!s.ledAddressable ? 'checked' : ''}>
        <label for="rbLedPlain">${tr('LED_MODAL_TYPE_PLAIN')}</label>
        <input type="radio" name="ledType" id="rbLedRgb" value="rgb" ${s.ledAddressable ? 'checked' : ''}>
        <label for="rbLedRgb">${tr('LED_MODAL_TYPE_RGB')}</label>
        <div class="nav-pill"></div>
        </div>

        <label class="uniRow dirty-target" for="cbLedActiveLow" id="rowLedActiveLow">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-gpioUp"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('LED_MODAL_ACTIVE_LOW')}</div>
        <div class="uniStatus">${tr('LED_MODAL_ACTIVE_LOW_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbLedActiveLow" type="checkbox" ${s.ledActiveLow ? 'checked' : ''}><div></div></span>
        </div>
        </label>

        <label class="uniRow dirty-target" for="fldLedColorActivity" id="rowLedColorActivity">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-wave"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('LED_MODAL_COLOR_ACTIVITY')}</div>
        <div class="uniStatus">${tr('LED_MODAL_COLOR_ACTIVITY_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="accent-swatch led-swatch" id="swLedColorActivity" style="--led-swatch:${s.ledColorActivity || '#ffffff'}">
        <input id="fldLedColorActivity" class="general-accent-color" type="color" value="${s.ledColorActivity || '#ffffff'}">
        </span>
        </div>
        </label>

        <label class="uniRow dirty-target" for="cbLedColorOrder" id="rowLedColorOrder">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-commandInverse"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('LED_MODAL_COLOR_SWAP')}</div>
        <div class="uniStatus">${tr('LED_MODAL_COLOR_SWAP_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbLedColorOrder" type="checkbox" ${s.ledColorOrder ? 'checked' : ''}><div></div></span>
        </div>
        </label>

        <div class="baseFlexCol" id="rowLedTest">
        <button id="btnLedTest" line type="button"><svg><use href="#svg-led"></use></svg><span>${tr('LED_MODAL_TEST')}</span></button>
        </div>

        </div>
        ` : ''}

        <label class="uniRow dirty-target" for="cbLedRfBlink">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-wave"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('LED_MODAL_RF_BLINK')}</div>
        <div class="uniStatus">${tr('LED_MODAL_RF_BLINK_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch"><input id="cbLedRfBlink" type="checkbox" ${s.ledRfBlink ? 'checked' : ''}><div></div></span>
        </div>
        </label>

        ${!isGeneric ? `
        <div class="baseFlexCol" id="rowLedTest">
        <button id="btnLedTest" line type="button"><svg><use href="#svg-led"></use></svg><span>${tr('LED_MODAL_TEST')}</span></button>
        </div>
        ` : ''}
        </div>


        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnLedCancel" line type="button">${tr('BT_CANCEL')}</button>
        <button id="btnLedApply" type="button" disabled><svg><use href="#svg-save"></use></svg><span>${tr('BT_SAVE')}</span></button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);
        watchDirty(div);

        const markDirty = () => { get('btnLedApply').disabled = false; };

        const btnTest = get('btnLedTest');
        const sendTest = (payload) => {
            this._setLedPinError(null);
            btnTest.disabled = true;
            putJSON('/testLed', payload, (err) => {
                if (err) {
                    if (err.code === 'LED_PIN_IN_USE') this._setLedPinError('ERR_LED_PIN_IN_USE_SHORT', { pin: err.pin, owner: err.owner || '?' });
                    else if (err.code === 'LED_PIN_INVALID') this._setLedPinError('ERR_LED_PIN_INVALID');
                    else if (err.code !== 'LED_TEST_BUSY') ui.serviceError(err);
                    btnTest.disabled = false;
                    return;
                }
                setTimeout(() => { btnTest.disabled = false; }, 2000);
            });
        };

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
                warn12.textContent = risky ? tr('LED_MODAL_PIN_WARN_12') : '';
                warn12.style.display = risky ? '' : 'none';
            };
            updateWarn();

            // Deux règles se superposent ici.
            //
            // (1) Un préréglage de carte connue DÉCRIT le câblage : le type de LED, la polarité et
            // l'ordre des couleurs en découlent, syncPreset() les pose, et les afficher ne ferait
            // qu'inviter l'utilisateur à contredire sa propre carte. Seul le mode Manuel les expose,
            // puisque là personne d'autre ne les connaît.
            //
            // (2) Polarité et ordre des couleurs s'excluent, parce que le type les départage : une
            // LED adressable n'a pas de polarité, une sortie à niveau n'a pas d'ordre de couleurs.
            //
            // La pastille échappe aux deux règles : une couleur n'est pas du câblage mais
            // une préférence, elle reste donc offerte dès que la LED est adressable, préréglage ou
            // non. Tout est MASQUÉ plutôt que grisé -- il n'y a rien à lire dans un réglage qui ne
            // s'applique pas.
            const syncAddressable = () => {
                const addr = get('rbLedRgb').checked;
                const manuel = parseInt(presetSel.value, 10) === MANUAL;
                const vis = (id, on) => { const row = get(id); if (row) row.style.display = on ? '' : 'none'; };
                vis('ledTypeSwitch', manuel);
                vis('rowLedActiveLow', manuel && !addr);
                vis('rowLedColorOrder', manuel && addr);
                vis('rowLedColorActivity', addr);
            };
            syncAddressable();

            // La pastille ne se repeint pas toute seule : sa teinte vient d'une propriété posée en
            // ligne (cf. .led-swatch, main.css), l'<input type="color"> ne fait que porter la valeur.
            const bindSwatch = (fldId, swId) => {
                const fld = get(fldId);
                const sw = get(swId);
                if (!fld || !sw) return;
                fld.addEventListener('input', () => {
                    sw.style.setProperty('--led-swatch', fld.value);
                    markDirty();
                });
            };
            bindSwatch('fldLedColorActivity', 'swLedColorActivity');

            const syncPreset = () => {
                const val = parseInt(presetSel.value, 10);
                manualBlock.style.display = (val === MANUAL) ? 'block' : 'none';
                // Le switch et le sélecteur décrivent la même chose : "aucune broche" ne peut pas
                // coexister avec un témoin activé, dans un sens comme dans l'autre.
                swEnabled.checked = (val !== NONE);
                // Les présets correspondent au câblage réel des cartes : aligner la polarité ET le
                // type évite le piège d'une LED qui s'allume à l'envers, ou qui ne s'allume pas du
                // tout parce qu'on la pilote comme une sortie alors que c'est un pixel.
                const board = ledOpts.find(b => b.val === val);
                if (board && typeof board.activeLow === 'boolean') get('cbLedActiveLow').checked = board.activeLow;
                // `typeof` serait faux ici : un préréglage NON adressable ne porte pas le champ du
                // tout, et il doit quand même remettre la case à zéro -- sinon un passage d'une
                // carte adressable à une autre laisserait le type collé sur l'ancienne valeur.
                // Les deux radios sont posées explicitement : contrairement à une case à cocher,
                // décocher l'une ne coche pas l'autre, et un groupe sans aucun radio actif laisserait
                // la pastille du contrôle segmenté nulle part.
                if (board && !board.placeholder && val !== MANUAL) {
                    get('rbLedRgb').checked = !!board.addressable;
                    get('rbLedPlain').checked = !board.addressable;
                }
                // Même règle que la case ci-dessus, et pour la même raison : un préréglage qui ne
                // déclare pas d'ordre revient au GRB standard, au lieu de garder celui de la carte
                // précédente -- qui ferait sortir les couleurs fausses sur la nouvelle.
                if (board && !board.placeholder && val !== MANUAL) get('cbLedColorOrder').checked = (board.order || 0) === 1;
                syncAddressable();
                if (val === MANUAL) updateWarn();
                this._setLedPinError(null);
            };

            presetSel.addEventListener('change', () => { syncPreset(); markDirty(); });

            btnTest.addEventListener('click', () => {
                const val = parseInt(presetSel.value, 10);
                if (val === NONE || val === PICK) { this._setLedPinError('ERR_LED_PIN_UNSET'); return; }
                const board = ledOpts.find(b => b.val === val);
                let pin = board?.pin ?? val;
                if (val === MANUAL) {
                    pin = parseInt(inputPin.value, 10);
                    if (isNaN(pin) || pin < 0 || pin > pm.maxPins) {
                        this._setLedPinError('ERR_GPIO_NOT_EXIST', { pin: inputPin.value, maxPins: pm.maxPins });
                        this._shakeLedPinInput();
                        return;
                    }
                    if (!get('cbLedManualSafety')?.checked) { this._setLedPinError('ERR_LED_SAFETY_REQUIRED'); return; }
                }
                const owner = this._ledPinConflict(pin);
                if (owner) {
                    this._setLedPinError('ERR_LED_PIN_IN_USE_SHORT', { pin: pin, owner: owner });
                    this._shakeLedPinInput();
                    return;
                }
                sendTest({
                    ledPin: pin,
                    ledActiveLow: !!get('cbLedActiveLow').checked,
                    ledAddressable: !!get('rbLedRgb').checked,
                    ledColorActivity: String(get('fldLedColorActivity').value || '#ffffff').toLowerCase(),
                    ledColorOrder: get('cbLedColorOrder').checked ? 1 : 0
                });
            });

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

            // Branché ICI et non plus bas avec les autres cases : syncAddressable() n'existe que
            // dans cette portée, et le contrôle lui-même n'est rendu que sur un profil générique --
            // un boîtier force ledAddressable à false côté firmware, son câblage faisant autorité.
            ['rbLedPlain', 'rbLedRgb'].forEach(id =>
                get(id).addEventListener('change', () => { syncAddressable(); markDirty(); }));
            get('cbLedColorOrder').addEventListener('change', markDirty);

            this._ledPinMax = pm.maxPins;
        }

        get('cbLedActiveLow')?.addEventListener('change', markDirty);
        get('cbLedRfBlink').addEventListener('change', markDirty);
        if (!isGeneric) btnTest.addEventListener('click', () => sendTest({}));

        get('btnLedCancel').onclick = () => requestCloseOverlay(div);
        get('btnLedApply').onclick = () => this.saveLedSettings(div, isGeneric);
    }
    saveLedSettings(div, isGeneric) {
        const payload = { ledRfBlink: !!get('cbLedRfBlink').checked };

        if (isGeneric) {
            const NONE = -1, PICK = 0, MANUAL = 255;
            const presetVal = parseInt(get('selLedBoardPreset').value, 10);
            const board = ((typeof somfy !== 'undefined' && somfy.ledBoardTypes) || []).find(b => b.val === presetVal);
            let pin = board?.pin ?? presetVal;

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
            payload.ledAddressable = !!get('rbLedRgb').checked;
            // Postée même quand la rangée est masquée (LED non adressable) : le champ garde
            // alors sa valeur, au lieu de se faire écraser par un défaut au prochain basculement.
            // /setgeneral refuse tout ce qui n'est pas #rrggbb, d'où la normalisation en minuscules
            // -- <input type="color"> renvoie déjà cette forme, mais rien ne l'impose.
            payload.ledColorActivity = String(get('fldLedColorActivity').value || '#ffffff').toLowerCase();
            // 0 = GRB (WS2812B standard), 1 = RGB. Le champ reste un entier côté firmware, ouvert
            // à d'autres ordres si une carte en impose un ; l'interface ne propose que les deux cas
            // réellement rencontrés.
            payload.ledColorOrder = get('cbLedColorOrder').checked ? 1 : 0;
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
                ledAddressable: typeof payload.ledAddressable === 'boolean' ? payload.ledAddressable : this._ledSettings.ledAddressable,
                ledColorActivity: typeof payload.ledColorActivity === 'string' ? payload.ledColorActivity : this._ledSettings.ledColorActivity,
                ledColorOrder: typeof payload.ledColorOrder === 'number' ? payload.ledColorOrder : this._ledSettings.ledColorOrder,
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
        prompt.querySelector('#btnYes use').setAttribute('href', '#svg-restart');
    }

    // Affiche la langue active dans le bouton de réglages (#currentLangDisplay). Le libellé vient du
    // nom natif porté par le manifeste (cf. langLabel()) et non d'une clé de traduction : une langue
    // téléchargeable n'a aucune raison d'avoir une entrée dédiée dans chacune des autres.
    // Le CHOIX d'une langue, lui, se fait dans la modale du gestionnaire (openLangManager()).
    populateLangSelect(currentLang) {
        document.documentElement.lang = currentLang;

        const langDisplay = get('currentLangDisplay');
        if (!langDisplay) return;

        // Affiche immédiatement ce que le cache du manifeste permet (ou le code en majuscules).
        langDisplay.textContent = langLabel(currentLang);
        this._renderHero();

        // Si le manifeste est disponible, remplace par le nom natif (ex: "Français", "Deutsch").
        loadLangManifest()
        .then(manifest => {
            if (manifest && manifest.langs && manifest.langs[currentLang]?.native) {
                langDisplay.textContent = manifest.langs[currentLang].native;
                this._renderHero();
            }
        })
        .catch(err => {
            logger.error('Failed to load manifest for current lang display:', err);
        });
    }

    // Change la langue active sur l'ESP32 et recharge la page. Retourne la Promise : un import
    // manuel affiche un ui.waitMessage() AVANT d'appeler cette méthode
    // (handleGlobalLangUpload/handleManualLangImport), qui compte entièrement sur
    // window.location.reload() pour le faire disparaître en détruisant toute la page -- sans AUCUN
    // filet si le rechargement ne se produit pas, l'indicateur resterait affiché indéfiniment. Que
    // ce soit un beforeunload silencieusement bloquant (verrou 'hard' resté posé ailleurs dans le
    // DOM, cf. anyHardLockPending() dans 20-shell.js) ou un fetch() qui ne se règle jamais, retourner
    // la Promise permet à CHAQUE appelant de garantir le nettoyage de son propre indicateur via
    // .catch()/.finally(), au lieu de dépendre aveuglément d'un rechargement qui peut ne jamais
    // arriver.
    onLanguageChanged(lang, reload = true) {
        const btn = get('btnOpenLangManager');
        if (btn) btn.disabled = true;

        return deviceFetch('/setLang?lang=' + lang)
        .then(resp => {
            if (resp.status !== "ok") throw new Error('unexpected /setLang response: ' + JSON.stringify(resp));
            if (!reload) {
                this.populateLangSelect(lang);
                if (btn) btn.disabled = false;
                return;
            }
            // Filet de sécurité : si le rechargement est bloqué (beforeunload, cf. commentaire
            // ci-dessus) window.location.reload() ne fait rien de visible et l'exécution continue
            // normalement ICI -- sans ce délai, rien ne le détecterait jamais. S'il aboutit
            // normalement en revanche, toute cette page (et son minuteur) est détruite bien avant
            // qu'il n'ait une chance de se déclencher : ce rejet ne surviendrait alors jamais.
            return new Promise((resolve, reject) => {
                setTimeout(() => reject(new Error('reload-blocked: le rechargement de page n\'a pas eu lieu (fermeture bloquée ?)')), 5000);
                // appInitiatedReload() et non window.location.reload() : neutralise le garde-fou
                // beforeunload, qui n'a de sens que face à une navigation accidentelle (cf.
                // 20-shell.js). Sans cela, un verrou 'hard' resté posé -- typiquement l'overlay
                // d'installation OTA d'un appareil qui a redémarré en cours de route, cf.
                // Firmware.procFwStatus -- faisait afficher une confirmation de sortie et ce
                // rechargement n'aboutissait jamais.
                appInitiatedReload();
            });
        })
        .catch(err => {
            logger.error("Failed to change language:", err);
            if (btn) btn.disabled = false;
            throw err;
        });
    }
    // --- Catalogue des langues : téléchargement à la demande depuis GitHub, suppression d'une
    // langue installée, avec progression via les évènements socket
    // langDownloadProgress/langDownloadComplete (cf. procLangDownloadProgress/Complete).
    // Même mise en page que le gestionnaire de packs d'icônes (classes icon-pack-*) : toucher une
    // tuile la sélectionne, seul le pied de la modale agit sur la langue choisie. ---
    openLangManager() {
        if (get('divLangManagerOverlay')) return;
        this._manualImportPending.clear();
        this._langSel = null;
        this._langBusy = false;

        const div = document.createElement('div');
        div.id = 'divLangManagerOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content icon-pack-content">
        ${modalHeader('GENERAL_LANGUAGE', 'svg-language', {
            subtitle: 'LANG_MODAL_TITLE_DESC',
        })}
        <div class="icon-pack-body">
            <div class="icon-pack-label"><span id="langCount"></span>
                <label for="fileLangGlobalImport" class="icon-pack-import"><svg><use href="#svg-upload"></use></svg>${tr('FILE_PICK_LANG')}</label></div>
            <p id="langNotice" class="lang-catalog-manual-import-info margin0" style="display:none"></p>
            <div class="icon-pack-grid-wrap"><div class="icon-pack-grid" id="langCatalog"></div></div>
            <div id="langSelInfo"></div>
            <div class="icon-pack-drop">${fileDropZone('fileLangGlobalImport', 'FILE_PICK_LANG')}</div>
            <input id="fileLangGlobalImport" type="file" accept="application/json,.json,application/gzip,.gz" style="display:none"
            onchange="general.handleGlobalLangUpload(this)"/>
        </div>
        <div class="hrModal margin0"></div>
        <div class="button-container-modal"><div class="button-content-modal" id="langFoot">
            <button id="btnLangManagerClose" line type="button">${tr('BT_CLOSE')}</button>
        </div></div>
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

        // Extrait le code du nom de fichier (ex: "es.json" -> "es", "es.json.gz" -> "es").
        const fileName = file.name.toLowerCase();
        const codeMatch = fileName.match(/([a-z]{2})\.json(?:\.gz)?$/);
        const code = codeMatch ? codeMatch[1] : null;

        if (!code) {
            ui.serviceError({ desc: tr('ERR_INVALID_LANG_FILENAME') });
            input.value = '';
            return;
        }

        // L'import (importLangFileManually) puis la bascule de langue qui suit (onLanguageChanged)
        // se terminent par un rechargement complet de la page, plusieurs secondes plus tard --
        // sans indicateur, la modale ne montrerait rien pendant ce temps (même mécanisme que
        // TOAST_LANG_DOWNLOADING_RELOAD dans acceptLangPrompt()).
        const overlay = ui.waitMessage(get('divLangManagerOverlay') || get('divContainer'), 'WAIT_MSG_LANG_IMPORT');

        // L'upload est en vol : bloque la fermeture accidentelle du catalogue tant qu'il n'a pas
        // abouti (succès ou échec) -- cf. setOverlayLock() dans 20-shell.js.
        setOverlayLock(get('divLangManagerOverlay'), 'confirm', {
            titleKey: 'PROMPT_LANG_ACTION_TITLE',
            msgKey: 'PROMPT_LANG_ACTION_MSG',
        });

        importLangFileManually(code, file)
        .then(() => {
            clearOverlayLock(get('divLangManagerOverlay'));
            input.value = '';
            // `return` (absent jusqu'ici) : sans lui, un échec APRÈS ce point (ex: rechargement
            // bloqué, cf. onLanguageChanged()) n'était jamais rattrapé par le .catch() ci-dessous --
            // l'indicateur d'attente (`overlay`) restait alors affiché indéfiniment, jamais retiré.
            return this.onLanguageChanged(code);
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
        const overlay = ui.waitMessage(get('divLangManagerOverlay') || panel, 'WAIT_MSG_LANG_CATALOG');
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
    // Sans argument, redessine la grille depuis le dernier catalogue reçu (changement de sélection).
    renderLangCatalog(list, manifest) {
        const grid = get('langCatalog');
        if (!grid) return;
        if (list) {
            this._langCatalog = { list, manifest };
            this._langBusy = false;
        }
        if (!this._langCatalog) return;
        ({ list, manifest } = this._langCatalog);

        // La source de vérité est l'attribut lang de la balise <html> ---
        // window.__defaultLangCode est là en ultime sécurité (probablement injecté par le serveur)
        const activeLang = document.documentElement.lang || window.__defaultLangCode || 'en';
        const installed = list.filter(e => e.installed).length;
        const full = installed >= LANG_MAX_INSTALLED;
        if (!list.some(e => e.code === this._langSel)) this._langSel = activeLang;
        const sel = this._langSel;

        get('langCount').textContent = tr('LANG_COUNT').replace('{N}', installed).replace('{MAX}', LANG_MAX_INSTALLED);
        const notice = get('langNotice');
        notice.textContent = full ? tr('ERR_LANG_NO_SPACE') : '';
        notice.style.display = full ? '' : 'none';

        grid.innerHTML = list.map(entry => {
            // Le nom natif du manifeste prime sur GENERAL_OPT_<CODE> : il reste correct
            // même pour une langue absente de la traduction actuellement chargée (tr() retomberait
            // sinon sur la clé brute).
            const manifestInfo = manifest && manifest.langs ? manifest.langs[entry.code] : null;
            const label = (manifestInfo && manifestInfo.native) || langLabel(entry.code);
            const english = manifestInfo && manifestInfo.name && manifestInfo.name !== label ? manifestInfo.name : '';
            const isPending = window.__pendingLangCode === entry.code;

            let badge = '';
            if (entry.code === activeLang) badge = `<span class="lang-catalog-badge active">${tr('LANG_MODAL_ACTIVE')}</span>`;
            else if (entry.installed) badge = `<span class="lang-catalog-badge">${tr('LANG_MODAL_INSTALLED')}</span>`;
            else if (isPending) badge = `<span class="lang-catalog-badge">${tr('LANG_PENDING_BADGE')}</span>`;

            // Boîtier plein : une langue en ligne ne peut plus être choisie, sauf celle déjà mise
            // en attente (il faut pouvoir l'annuler).
            const off = !entry.installed && !isPending && (full || !entry.downloadable);
            const cls = (entry.installed ? '' : ' is-remote') + (off ? ' is-disabled' : '') + (entry.code === sel ? ' selected' : '');
            return `<div class="icon-pack-tile${cls}" data-lang="${entry.code}" onclick="general.selectLang('${entry.code}')">
                <span class="lang-catalog-code">${entry.code}</span>
                <div class="icon-pack-name">${label}</div>
                <div class="icon-pack-meta">${english}</div>
                <div class="lang-catalog-progress" id="langProgress_${entry.code}">
                    <div class="progress-bar"><div class="progress-bar-fill"></div></div>
                    <span class="progress-bar-value">0%</span>
                </div>
                <span class="icon-pack-tag">${badge}</span></div>`;
        }).join('');

        // Sous la grille : ce qu'il faut savoir de la langue choisie quand elle ne peut pas
        // simplement être téléchargée (mise en attente, ou import manuel faute d'Internet).
        const entry = list.find(e => e.code === sel);
        const manifestInfo = manifest && manifest.langs ? manifest.langs[sel] : null;
        let info = '';
        if (window.__pendingLangCode === sel && !entry.installed) {
            // Persiste côté firmware (settings.pendingLang) -- reste affiché tel quel après
            // rechargement de page, tant que un navigateur ne l'a pas relayée (checkPendingLangApplied)
            // ou que l'utilisateur n'a pas annulé.
            info = `
            <div class="lang-catalog-manual-import">
                <p class="lang-catalog-manual-import-info">${tr('MSG_LANG_PENDING_INFO')}</p>
                <button type="button" pop line onclick="general.cancelPendingLang('${sel}')">${tr('BT_CANCEL_PENDING')}</button>
            </div>`;
        }
        // Le relais navigateur a confirmé qu'aucune route Internet n'existe depuis cet
        // appareil (github-fetch-failed, cf. relayLangDownload) -- on remplace le bouton
        // de téléchargement par le choix entre import manuel et mise en attente, plutôt
        // qu'un message d'erreur.
        else if (this._manualImportPending.has(sel)) {
            const rawUrl = manifestInfo && manifestInfo.path ? `${GITHUB_RAW_ROOT}main/${manifestInfo.path}` : '';
            info = `
            <div class="lang-catalog-manual-import">
                <p class="lang-catalog-manual-import-info">${tr('MSG_LANG_MANUAL_IMPORT_INFO')}</p>
                ${rawUrl ? `<a href="${rawUrl}" target="_blank" rel="noopener" class="link" style="display:block; margin-bottom:8px;">${tr('LANG_MANUAL_IMPORT_LINK')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a>` : ''}
                <input id="fileLangImport_${sel}" type="file" accept="application/json,.json,application/gzip,.gz" style="display:none"
                onchange="general.handleManualLangImport('${sel}', this)"/>
                ${fileDropZone(`fileLangImport_${sel}`, 'FILE_PICK_LANG')}
                <button type="button" pop line style="margin-top:8px;" onclick="general.setPendingLang('${sel}')">${tr('BT_APPLY_LATER')}</button>
            </div>`;
        }
        get('langSelInfo').innerHTML = info;

        // Pied : les actions possibles sur la langue choisie, à côté de Fermer.
        let actions = '';
        if (sel !== activeLang && !info) {
            if (entry.installed) {
                // La langue embarquée d'usine pour cet environnement (window.__defaultLangCode --
                // fr sur BOX, en sinon) reste le filet de sécurité universel côté backend
                // (handleLang) -- jamais supprimable.
                if (sel !== window.__defaultLangCode) {
                    actions += `<button type="button" lineRed onclick="general.deleteLang('${sel}')">${tr('LANG_MODAL_DELETE_LANG')}</button>`;
                }
                actions += `<button type="button" onclick="general.useLang('${sel}')">${tr('LANG_MODAL_USE_LANG')}</button>`;
            } else if (entry.downloadable && !full) {
                actions = `<button type="button" onclick="general.downloadLang('${sel}')">${tr('LANG_MODAL_DOWNLOAD')}</button>`;
            }
        }
        get('langFoot').innerHTML = `<button id="btnLangManagerClose" line type="button">${tr('BT_CLOSE')}</button>${actions}`;
    }
    // Ignorée pendant un téléchargement : redessiner la grille effacerait sa barre de progression.
    selectLang(code) {
        if (this._langBusy) return;
        this._langSel = code;
        this.renderLangCatalog();
    }
    useLang(code) {
        this.onLanguageChanged(code).catch(err => ui.serviceError({ desc: err.message, service: '/setLang' }));
    }
    downloadLang(code) {
        this.showLangProgress(code);
        // Le boîtier ne télécharge plus rien lui-même (plus de client TLS) : c'est toujours le
        // navigateur qui relaie le pack, en mode AP comme sur le réseau local.
        this.relayLangDownload(code);
    }
    // Relais navigateur : best-effort, jamais bloquant -- si le navigateur n'a pas de
    // connectivité propre (PC sans 4G) ou si CompressionStream n'est pas supporté, on retombe
    // proprement sur un message plutôt que de laisser l'utilisateur face à une erreur opaque.
    relayLangDownload(code) {
        setOverlayLock(get('divLangManagerOverlay'), 'confirm', {
            titleKey: 'PROMPT_LANG_ACTION_TITLE',
            msgKey: 'PROMPT_LANG_ACTION_MSG',
        });
        // `return` : reinstallActiveLang() a besoin de savoir quand la chaîne est retombée pour
        // retirer son toast. L'appelant du catalogue (ligne ~1586) ignore la valeur, sans effet.
        return relayLangViaBrowser(code)
        .then(() => { clearOverlayLock(get('divLangManagerOverlay')); return this.onLanguageChanged(code); })
        .catch(err => {
            clearOverlayLock(get('divLangManagerOverlay'));
            logger.error('Browser relay failed for language ' + code + ':', err);
            // github-fetch-failed = raw.githubusercontent.com confirmé injoignable depuis cet
            // appareil (pas juste un souci passager) : pas de message d'erreur ici, on bascule
            // directement vers le fallback d'import manuel (100% fiable, sans dépendance réseau)
            // plutôt que de laisser l'utilisateur face à une impasse.
            if (err.code === 'lang-limit') {
                ui.serviceError({ desc: err.message, service: '/uploadLang' });
                this.loadLangCatalog();
                return;
            }
            if (err.message.startsWith('github-fetch-failed')) {
                this._manualImportPending.add(code);
                this._langSel = code;
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
                    this._langSel = code;
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
        const overlay = ui.waitMessage(get('divLangManagerOverlay') || get('divContainer'), 'WAIT_MSG_LANG_IMPORT');
        setOverlayLock(get('divLangManagerOverlay'), 'confirm', {
            titleKey: 'PROMPT_LANG_ACTION_TITLE',
            msgKey: 'PROMPT_LANG_ACTION_MSG',
        });
        importLangFileManually(code, file)
        .then(() => {
            clearOverlayLock(get('divLangManagerOverlay'));
            this._manualImportPending.delete(code);
            // Même correctif que handleGlobalLangUpload() : sans ce `return`, un rechargement
            // bloqué laissait cet indicateur d'attente affiché indéfiniment.
            return this.onLanguageChanged(code);
        })
        .catch(err => {
            clearOverlayLock(get('divLangManagerOverlay'));
            if (overlay) overlay.remove();
            logger.error('Manual language import failed for ' + code + ':', err);
            ui.serviceError({ desc: err.message, service: '/uploadLang' });
        });
    }
    // Mise en attente (globale AP -- catalogue + wizard) : n'essaie aucun téléchargement, se
    // contente d'enregistrer le choix côté firmware. Le premier navigateur connecté hors mode AP se charge de
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
            ui.serviceError({ desc: err.htmlError === 409 ? tr('ERR_LANG_NO_SPACE') : (err.message || err.desc), service: '/setPendingLang' });
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
            if (resp.status !== 'ok') return ui.serviceError(resp);
            // La tuile supprimée resterait choisie, en langue à télécharger : on revient à l'active.
            this._langSel = null;
            this.loadLangCatalog();
        })
        .catch(err => logger.error('Failed to delete language:', err));
    }
    // Affiche la barre de progression d'une tuile du catalogue et retire les actions du pied
    // (Fermer excepté), au déclenchement du téléchargement. La sélection reste figée jusqu'au
    // prochain rendu du catalogue (cf. selectLang).
    showLangProgress(code) {
        const prog = get(`langProgress_${code}`);
        if (!prog) return;
        prog.classList.add('active');
        this._langBusy = true;
        get('langFoot').querySelectorAll('button:not(#btnLangManagerClose)').forEach(b => b.remove());
    }
    procLangDownloadProgress(prog) {
        const block = get(`langProgress_${prog.code}`);
        if (!block) return;
        const bar = block.querySelector('.progress-bar');
        if (!bar) return;
        const pct = prog.total > 0 ? Math.round((prog.loaded / prog.total) * 100) : 0;
        bar.style.setProperty('--progress', `${pct}%`);
        const value = block.querySelector('.progress-bar-value');
        if (value) value.textContent = `${pct}%`;
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
            this.onLanguageChanged(msg.code).catch(err => ui.serviceError({ desc: err.message, service: '/setLang' }));
        } else {
            // msg.err porte désormais la raison de l'échec (cf. emitLangDownloadComplete) : -47
            // signifie que le filesystem n'a plus la place, seul cas où réessayer ne sert à rien
            // et où le message doit dire quoi faire. Les autres échecs -- code HTTP, transfert
            // interrompu, gzip invalide -- restent sur le message générique, faute d'une clé de
            // traduction dédiée.
            const e = errors.find(x => x.code === msg.err);
            ui.serviceError({ desc: e ? e.desc : `${msg.code}: download failed`, service: '/downloadLang' });
            this.loadLangCatalog();
        }
    }
    // --- Suggestion discrète de langue navigateur, déclenchée par
    // checkBrowserLangSuggestion() -- un simple toast, pas une modale bloquante. ---
    showBrowserLangPrompt(code, info) {
        if (get('langPromptToast')) return; // déjà affiché
        const div = document.createElement('div');
        div.id = 'langPromptToast';
        div.className = 'lang-prompt-toast';
        div.innerHTML = `
        <div class="lang-prompt-text">${tr('TOAST_LANG_MSG').replace('{LANG}', info.native)}</div>
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
            toast.innerHTML = `<div class="lang-prompt-text">${tr('TOAST_LANG_DOWNLOADING_RELOAD')}</div>`;
        }
        // Relais navigateur : le succès bascule la langue et recharge la page (onLanguageChanged) ;
        // en cas d'échec relayLangDownload affiche l'erreur ou ouvre l'import manuel.
        const done = () => { const t = get('langPromptToast'); if (t) t.remove(); };
        const chain = this.relayLangDownload(code);
        if (chain && typeof chain.then === 'function') chain.then(done, done);
        else done();
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
    // --- Langue active absente du filesystem, déclenché par checkActiveLangAvailability() --
    // typiquement après une mise à jour firmware qui a réécrit toute la partition LittleFS sans
    // restaurer les langues téléchargées à la demande. Pas de "ne plus demander" ici : c'est un
    // vrai problème fonctionnel (l'utilisateur voit l'anglais sans explication), pas une simple
    // suggestion. ---
    showLangMissingPrompt(code) {
        if (get('langMissingToast')) return; // déjà affiché
        const div = document.createElement('div');
        div.id = 'langMissingToast';
        div.className = 'lang-prompt-toast';
        div.innerHTML = `
        <div class="lang-prompt-text">${tr('TOAST_LANG_MISSING_MSG').replace('{LANG}', code.toUpperCase())}</div>
        <div class="lang-prompt-actions">
        <button type="button" pop onclick="general.reinstallActiveLang('${code}')">${tr('BT_INSTALL_LANG')}</button>
        <button type="button" pop line onclick="general.dismissLangMissingPrompt()">${tr('BT_REMIND_LATER')}</button>
        </div>`;
        document.body.appendChild(div);
    }
    reinstallActiveLang(code) {
        // Le toast n'est PAS retiré mais transformé en indicateur de progression, comme le fait
        // déjà acceptLangPrompt() pour le toast de suggestion : le téléchargement prend quelques
        // secondes et se termine par un rechargement complet de la page (langDownloadComplete ->
        // onLanguageChanged), sans quoi l'utilisateur cliquerait "Installer" sans plus rien voir
        // avant un rechargement inexpliqué. Son retrait est assuré par procLangDownloadComplete()
        // en cas de succès, et par les branches d'échec ci-dessous.
        const toast = get('langMissingToast');
        if (toast) {
            toast.innerHTML = `<div class="lang-prompt-text">${tr('TOAST_LANG_DOWNLOADING_RELOAD')}</div>`;
        }
        // Le relais navigateur pose son verrou sur la modale du catalogue -- or elle n'est pas
        // ouverte quand on arrive d'un toast (setOverlayLock sort aussitôt sur un élément nul),
        // donc ce toast est le SEUL repère visible de toute l'opération. Le succès recharge la
        // page ; en cas d'échec relayLangDownload affiche l'erreur ou bascule vers l'import
        // manuel, et le toast n'a alors plus lieu d'être.
        const done = () => { const t = get('langMissingToast'); if (t) t.remove(); };
        const chain = this.relayLangDownload(code);
        if (chain && typeof chain.then === 'function') chain.then(done, done);
        else done();
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
        const label = langLabel(code);
        div.innerHTML = `
        <div class="lang-prompt-text">${tr('TOAST_LANG_PENDING_APPLIED').replace('{LANG}', label)}</div>
        <div class="lang-prompt-actions">
        <button type="button" pop line onclick="get('langAppliedToast').remove();">${tr('BT_CLOSE')}</button>
        </div>`;
        document.body.appendChild(div);
    }
    onModeThemeChanged() {
        const sel = get('selThemeMode');
        this.applyTheme(sel.value);
    }
    onSecurityTypeChanged() {
        this._renderHero();
        this.renderSecurityTile();
    }
    _securityLabel(type) {
        return tr(['IS_DISABLED', 'SECURITY_PIN_CODE', 'SECURITY_PASSWORD'][type] || 'IS_DISABLED');
    }
    // La tuile est reconstruite à partir du seul état enregistré (_securityData/_hasPin/_hasPassword,
    // alimentés par setSecurityConfig depuis le serveur) : une saisie abandonnée ne survit pas à
    // un nouvel enregistrement ni à un rechargement. Les champs secrets sont réinitialisés à chaque
    // rendu, la confirmation comprise : le gestionnaire de mots de passe du navigateur peut repeupler
    // un champ juste après l'insertion (d'où aussi les attributs autocomplete).
    renderSecurityTile() {
        const tile = get('genSecTile'), body = get('genSecBody');
        if (!tile || !body) return;
        const currentType = this._currentSecurityType || 0;
        const radio = (v, key) => `<label><input type="radio" name="secTypeGroup" value="${v}" ${currentType === v ? 'checked' : ''}><span>${tr(key)}</span></label>`;
        body.innerHTML = `
        <div class="gen-seg dirty-target">${radio(0, 'IS_DISABLED')}${radio(1, 'SECURITY_PIN_CODE')}${radio(2, 'SECURITY_PASSWORD')}</div>
        <p id="secTypeDesc" class="gen-tile-desc"></p>

        <div id="divPopupPin" class="gen-field">
        <span class="gen-field-label">${tr('SECURITY_ENTER_PIN')}</span>
        <div class="pin-digit-row dirty-target">
        <input class="pin-digit" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off">
        <input class="pin-digit" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off">
        <input class="pin-digit" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off">
        <input class="pin-digit" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off">
        </div>
        <p id="secPinHint" class="gen-tile-desc"></p>
        </div>

        <div id="divPopupPassword" class="gen-sec-pwd">
        <div class="gen-field">
        <label class="gen-field-label" for="fldUsername">${tr('SECURITY_USERNAME')}</label>
        <div class="gen-input-box dirty-target"><input id="fldUsername" class="gen-input" name="secUsername" autocomplete="off" type="text" data-bind="security.username" placeholder="${tr('SECURITY_USERNAME_PLH')}"></div>
        </div>
        <div class="gen-field-pair">
        <div class="gen-field">
        <label class="gen-field-label" for="fldPassword">${tr('SECURITY_PASSWORD')}</label>
        <div class="gen-input-box dirty-target">
        <input id="fldPassword" class="gen-input" name="secNewPassword" autocomplete="new-password" type="password" placeholder="${tr('SECURITY_PASSWORD_PLH')}">
        <div class="password-eye" onclick="security.toggleFieldPassword('fldPassword', this)"><svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg></div>
        </div>
        </div>
        <div class="gen-field">
        <label class="gen-field-label" for="fldRenterPassword">${tr('SECURITY_CONFIRM_PASSWORD')}</label>
        <div class="gen-input-box dirty-target">
        <input id="fldRenterPassword" class="gen-input" name="secConfirmPassword" autocomplete="new-password" type="password" placeholder="${tr('SECURITY_CONFIRM_PASSWORD')}">
        <div class="password-eye" onclick="security.toggleFieldPassword('fldRenterPassword', this)"><svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg></div>
        </div>
        </div>
        </div>
        <p id="secPasswordHint" class="gen-tile-desc"></p>
        </div>

        <label id="genSecConfigOnly" class="gen-row dirty-target" for="cbSecureConfigOnly">
        <span class="gen-row-text"><b>${tr('SECURITY_SECURE_CONFIG_ONLY')}</b><span>${tr('SECURITY_SECURE_CONFIG_DESC')}</span></span>
        <span class="switch"><input id="cbSecureConfigOnly" name="hardwired" type="checkbox" data-bind="security.permissions.configOnly"><div></div></span>
        </label>`;

        ui.toElement(body, { security: this._securityData || { username: '', permissions: { configOnly: false } } });
        initSecretPinGroup(body.querySelectorAll('#divPopupPin .pin-digit'), this._hasPin);
        initSecretField(body.querySelector('#fldPassword'), this._hasPassword);
        initSecretField(body.querySelector('#fldRenterPassword'), false);
        // Le masque factice dit seulement "un secret existe" : à l'écran, rien ne le distinguait
        // d'une saisie qu'on aurait conservée. Ce libellé lève l'ambiguïté.
        const setHint = (id, key, show) => {
            const el = body.querySelector(id);
            el.textContent = tr(key);
            el.style.display = show ? '' : 'none';
        };
        setHint('#secPasswordHint', 'SECURITY_PASSWORD_STORED', this._hasPassword);
        setHint('#secPinHint', 'SECURITY_PIN_STORED', this._hasPin);

        // Le choix du mode pilote la description ET les champs : rien à saisir en mode Désactivé,
        // le pavé PIN en mode Code PIN, le couple identifiant/mot de passe en mode Mot de passe.
        const SEC_DESC = { 0: 'SECURITY_INACTIVE_DESC', 1: 'SECURITY_PIN_CODE_DESC', 2: 'SECURITY_PASSWORD_DESC' };
        const applyType = () => {
            const val = parseInt(body.querySelector('input[name="secTypeGroup"]:checked')?.value || '0', 10);
            body.querySelector('#divPopupPin').hidden = val !== 1;
            body.querySelector('#divPopupPassword').hidden = val !== 2;
            body.querySelector('#genSecConfigOnly').hidden = val === 0;
            const desc = body.querySelector('#secTypeDesc');
            desc.textContent = tr(SEC_DESC[val]);
            desc.classList.toggle('is-warning', val === 0);
        };
        body.querySelectorAll('input[name="secTypeGroup"]').forEach(r => r.addEventListener('change', applyType));
        applyType();

        const pinInputs = body.querySelectorAll('.pin-digit');
        pinInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                // Le PIN est numérique de bout en bout (char[5] comparé tel quel, cf. WebAuth.cpp) :
                // on filtre à la frappe, le contrôle de saveSecurity reste pour le collage et
                // l'autoremplissage.
                e.target.value = (e.target.value || '').replace(/\D/g, '');
                if (e.target.value.length === 1 && index < pinInputs.length - 1) pinInputs[index + 1].focus();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) pinInputs[index - 1].focus();
            });
        });
        clearDirty(tile);
    }
    saveSecurity() {
        const popupContent = get('genSecBody');
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
            // Les 3 radios portent le mode voulu, "Désactivé" (valeur 0) compris :
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

        // Un seul mode de sécurité peut être actif : les secrets des modes NON retenus sont
        // supprimés par ce même enregistrement. Passer au code PIN efface donc le mot de passe,
        // et désactiver la sécurité efface les deux -- ce que le panneau montre devient ce que
        // l'appareil contient, sans état dormant invisible (jusqu'ici, un mot de passe survivait
        // à la désactivation de la sécurité sans que rien ne le signale nulle part).
        // Corollaire : le garde-fou firmware (refus d'effacer le secret dont dépend le mode
        // demandé) devient structurellement inatteignable depuis l'interface, puisqu'on n'efface
        // jamais que les autres.
        const clearPassword = finalType !== 2 && this._hasPassword;
        const clearPin = finalType !== 1 && this._hasPin;
        // Prévenir AVANT d'enregistrer, et seulement quand il y a réellement quelque chose à
        // perdre : c'est le seul moment où l'utilisateur peut encore revenir en arrière.
        const clearWarning = (clearPassword || clearPin) ? `<p class="is-warning">${tr('PROMPT_SECURITY_CLEAR_SECRET_DESC')}</p>` : '';

        let confirmText = '';
        if (finalType === 0) {
            confirmText = `<p>${tr('PROMPT_SECURITY_CONFIRM_DESACTIVE')}</p>${clearWarning}`;
        }
        else if (finalType === 1) {
            if (pinTouched) {
                // Quatre CHIFFRES : le filtre de frappe (cf. renderSecurityTile) écarte déjà les
                // lettres case par case, mais un collage ou un autoremplissage peut peupler les
                // champs sans passer par lui.
                if (!/^[0-9]{4}$/.test(pin)) return this.secError('ERR_PIN_INVALID', 'ERR_PIN_INVALID_DESC');
            } else if (!this._hasPin) {
                return this.secError('ERR_PIN_INVALID', 'ERR_PIN_INVALID_DESC');
            }
            confirmText = `<p>${tr('PROMPT_SECURITY_PIN_WARNING')}</p><p>${tr('PROMPT_SECURITY_PIN_CONFIRM')}</p>${clearWarning}`;
        }
        else if (finalType === 2) {
            if (!s.username) return this.secError('ERR_USERNAME_MISSING', 'ERR_USERNAME_MISSING_DESC');
            // Pas de maxlength sur ces trois champs, délibérément : il bornait la saisie en silence.
            // Quelqu'un qui compose un mot de passe de 40 caractères en obtenait 32 sans le savoir
            // et repartait convaincu d'avoir défini un secret plus fort qu'il ne l'est. Un refus
            // explicite au moment d'enregistrer dit la contrainte et laisse corriger, là où la
            // troncature muette ne disait rien. Même choix que le formulaire MQTT (cf. 90-mqtt.js).
            // Ne rend pas le contrôle firmware superflu : /saveSecurity refuse aussi au-delà de 32
            // (WebAuth.cpp), seule protection valable pour les clients hors interface.
            if (s.username.length > 32) return this.secError('ERR_USERNAME_INVALID', 'ERR_USERNAME_MAX_LENGTH_32');
            if (passwordTouched) {
                // passwordTouched vaut vrai dès que l'un des DEUX champs est rempli : on distingue
                // donc le mot de passe absent, la confirmation absente et la vraie divergence,
                // plutôt que de renvoyer "les mots de passe ne correspondent pas" dans les trois cas.
                if (!password) return this.secError('ERR_PASSWORD_MISSING', 'ERR_PASSWORD_MISSING_DESC');
                if (password.length > 32) return this.secError('ERR_PASSWORD_INVALID', 'ERR_PASSWORD_MAX_LENGTH_32');
                if (!repeatPassword) return this.secError('ERR_PASSWORD_CONFIRM_MISSING', 'ERR_PASSWORD_CONFIRM_MISSING_DESC');
                if (password !== repeatPassword) return this.secError('ERR_PASSWORD_MISMATCH', 'ERR_PASSWORD_MISMATCH_DESC');
            } else if (!this._hasPassword) {
                return this.secError('ERR_PASSWORD_MISSING', 'ERR_PASSWORD_MISSING_DESC');
            }
            confirmText = `<p>${tr('PROMPT_SECURITY_PASSWORD_WARNING')}</p><p>${tr('PROMPT_SECURITY_PASSWORD_CONFIRM')}</p>${clearWarning}`;
        }

        const data = {
            type: finalType,
            username: s.username || '',
            password: passwordTouched ? password : '',
            pin: pinTouched ? pin : '',
            // Sentinelles dédiées : une chaîne vide veut dire "inchangé" côté firmware
            // (parseSecretString), elle ne peut donc pas exprimer une suppression.
            clearPassword: clearPassword,
            clearPin: clearPin,
            // Seule "permissions" est lue côté firmware (cf. SecuritySettings::fromJSON) : "perm"
            // était un doublon jamais consommé par le serveur.
            permissions: (s.permissions && s.permissions.configOnly) ? 0x01 : 0x00
        };

        const applyLocalState = () => {
            this._currentSecurityType = finalType;
            if (pinTouched) this._hasPin = true;
            if (passwordTouched) this._hasPassword = true;
            if (clearPin) this._hasPin = false;
            if (clearPassword) this._hasPassword = false;

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
                // Persiste (ou purge) la cle pour la duree de l'onglet, comme le fait un login
                // normal -- cf. SECURITY_SESSION_KEY dans 35-security.js. Sans cette ligne,
                // activer la securite depuis une session non protegee fonctionnait jusqu'au
                // premier rechargement de page, ou la cle toute neuve etait perdue et le PIN
                // redemande immediatement apres l'avoir defini. La desactiver (finalType === 0)
                // doit au contraire effacer le stockage : plus aucune session n'a de sens.
                if (finalType === 0) { security.apiKey = ''; security._clearSessionKey(); }
                else security._persistSessionKey();
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
            subtitle: "HACS_DESC"
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
        ${tr('HACS_OR_VISIT')} <a href="https://github.com/xkain/ESPSomfy-RTS-enhanced" target="_blank" class="ha-github-link">${tr('HACS_GITHUB_LINK')}</a>
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
