// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
class Wifi {
    initialized = false;
    ethBoardTypes = [];
    ethClockModes = [];
    ethPhyTypes = [];
    // Sur le point d'accès, aucun type de connexion n'est présélectionné : l'utilisateur choisit.
    _pending = false;

    init() {
        this.ethBoardTypes = [
            { val: 0, label: tr("MANUAL_SETTINGS") },
            { val: 1, label: 'WT32-ETH01 - Wireless Tag', clk: 0, ct: 0, addr: 1, pwr: 16, mdc: 23, mdio: 18 },
            { val: 7, label: 'EST-PoE-32 - Everything Smart', clk: 3, ct: 0, addr: 0, pwr: 12, mdc: 23, mdio: 18 },
            { val: 3, label: 'ESP32-EVB - Olimex', clk: 0, ct: 0, addr: 0, pwr: -1, mdc: 23, mdio: 18 },
            { val: 2, label: 'ESP32-POE - Olimex', clk: 3, ct: 0, addr: 0, pwr: 12, mdc: 23, mdio: 18 },
            { val: 4, label: 'T-Internet POE - LILYGO', clk: 3, ct: 0, addr: 0, pwr: 16, mdc: 23, mdio: 18 },
            { val: 5, label: 'wESP32 v7+ - Silicognition', clk: 0, ct: 2, addr: 0, pwr: -1, mdc: 16, mdio: 17 },
            { val: 6, label: 'wESP32 < v7 - Silicognition', clk: 0, ct: 0, addr: 0, pwr: -1, mdc: 16, mdio: 17 }
        ];
        this.ethClockModes = [
            { val: 0, label: 'GPIO0 IN' },
            { val: 1, label: 'GPIO0 OUT' },
            { val: 2, label: 'GPIO16 OUT' },
            { val: 3, label: 'GPIO17 OUT' }
        ];
        this.ethPhyTypes = [
            { val: 0, label: 'LAN8720' },
            { val: 1, label: 'TLK110' },
            { val: 2, label: 'RTL8201' },
            { val: 3, label: 'DP83848' },
            { val: 4, label: 'DM9051' },
            { val: 5, label: 'KZ8081' }
        ];

        this.procWifiStrength({strength: -100, ssid: '', channel: -1});

        if (this.initialized) return;

        this.loadETHDropdown(get('selETHClkMode'), this.ethClockModes);
        this.loadETHDropdown(get('selETHPhyType'), this.ethPhyTypes);
        this.loadETHDropdown(get('selETHBoardType'), this.ethBoardTypes);

        let addr = [];
        for (let i = 0; i < 32; i++) {
            addr.push({ val: i, label: `PHY ${i}` });
        }
        this.loadETHDropdown(get('selETHAddress'), addr);

        // Cinq clics sur le nom affiché en tête révèlent la carte Ethernet sur BOX-ETH (cf. main.css).
        // Même classe `show-expert-gpio` que les broches de la radio ; l'onglet Ethernet en dépend,
        // d'où le nouveau rendu.
        initMultiClickToggle('#netHeroName', () => {
            document.body.classList.add('show-expert-gpio');
            ui.toast("Mode avancé débloqué.");
            this.useEthernetClicked();
        }, 5);

        ui.toElement(get('divNetAdapter'), {
            wifi: { ssid: '', passphrase: '' },
            ethernet: {
                boardType: 1,
                wirelessFallback: false,
                dhcp: true,
                dns1: '',
                dns2: '',
                ip: '',
                gateway: ''
            }
        });
        this.onETHBoardTypeChanged(get('selETHBoardType'));
        this._bindNetPage();
        this.initialized = true;

        const inputPwr = get('inputETHPWRPin');
        if (inputPwr) {
            inputPwr.addEventListener('focus', () => {
                if (inputPwr.value === 'None') {
                    inputPwr.type = 'number';
                    inputPwr.value = -1;
                }
            });
            inputPwr.addEventListener('blur', () => {
                if (inputPwr.value === '-1' || inputPwr.value === '') {
                    inputPwr.type = 'text';
                    inputPwr.value = 'None';
                }
            });
        }
    }
    loadETHDropdown(sel, arr, selected) {
        if (!sel) return;
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        for (let i = 0; i < arr.length; i++) {
            let elem = arr[i];
            sel.options[sel.options.length] = new Option(elem.label, elem.val, elem.val === selected, elem.val === selected);
        }
    }
    onETHBoardTypeChanged(sel) {
        if (!sel) return;
        let type = this.ethBoardTypes.find(elem => parseInt(sel.value, 10) === elem.val);
        if (typeof type !== 'undefined') {
            if (typeof type.ct !== 'undefined') get('selETHPhyType').value = type.ct;
            if (typeof type.clk !== 'undefined') get('selETHClkMode').value = type.clk;
            if (typeof type.addr !== 'undefined') get('selETHAddress').value = type.addr;

            const inputPwr = get('inputETHPWRPin');
            if (inputPwr && typeof type.pwr !== 'undefined') {
                const isNone = (type.pwr === -1);
                if (isNone) {
                    inputPwr.type = 'text';
                    inputPwr.value = 'None';
                } else {
                    inputPwr.type = 'number';
                    inputPwr.value = type.pwr;
                }
                this.togglePowerIcon(isNone);
            }

            if (typeof type.mdc !== 'undefined') get('inputETHMDCPin').value = type.mdc;
            if (typeof type.mdio !== 'undefined') get('inputETHMDIOPin').value = type.mdio;

            get('divETHSettings').style.display = type.val === 0 ? '' : 'none';
        }
        if (this.initialized) {
            this._renderEth();
            this._renderSummary();
        }
    }
    togglePowerIcon(isNone) {
        const btnIcon = document.querySelector('#btnEthPwrShortcut use');
        if (btnIcon) {
            btnIcon.setAttribute('href', isNone ? '#svg-powerOff' : '#svg-power');
        }
    }
    stepGpio(pinKey, direction) {
        const inputEl = get(`inputETH${pinKey}`);

        if (pinKey === 'PWRPin' && inputEl && inputEl.value === 'None' && direction === 1) {
            inputEl.type = 'number';
            inputEl.value = 0;
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            this.togglePowerIcon(false); // Mode numérique -> Icône ON
            return;
        }

        // pinMaps (par variante de puce -- S2/S3/C3 ont un nombre de GPIO différent de l'ESP32
        // d'origine) est une donnée de la classe Somfy (cf. 70-somfy.js), jamais dupliquée ici :
        // `this.pinMaps` sur `wifi` n'a jamais existé, ce qui retombait silencieusement sur le
        // repli { maxPins: 39 } pour TOUTE puce -- trop restrictif sur S2/S3 (46/48 broches
        // réelles, le +/- refusait d'aller au-delà de 39) et trop permissif sur C3 (21 broches
        // réelles, le +/- laissait monter jusqu'à 39, vers des GPIO qui n'existent pas).
        const newValue = stepDeviceGpio(pinKey, direction, 'ETH', 'selETHBoardType', val => val === 0, (typeof somfy !== 'undefined' && somfy.pinMaps) || [{ name: '', maxPins: 39 }]);

        if (newValue === undefined) return;
        if (pinKey === 'PWRPin' && inputEl) {
            const isNone = (parseInt(newValue, 10) === -1 || newValue === '');
            if (isNone) {
                inputEl.type = 'text';
                inputEl.value = 'None';
            } else {
                inputEl.type = 'number';
            }
            this.togglePowerIcon(isNone);
        }
    }
    setPowerToNone() {
        const inputPwr = get('inputETHPWRPin');
        if (!inputPwr) return;
        if (inputPwr.value === 'None') {
            inputPwr.type = 'number';
            inputPwr.value = 0;
            inputPwr.dispatchEvent(new Event('change', { bubbles: true }));
            this.togglePowerIcon(false);
            return;
        }
        inputPwr.type = 'text';
        inputPwr.value = -1;
        inputPwr.dispatchEvent(new Event('change', { bubbles: true }));
        inputPwr.type = 'text';
        inputPwr.value = 'None';
        this.togglePowerIcon(true); // Mode None -> Icône OFF
    }
    // =====================================================================
    // SECTION : PAGE CONNEXION (onglets suivant le type, résumé, barre d'enregistrement)
    // =====================================================================
    _bindNetPage() {
        const page = get('divNetAdapter');
        this._tabs = bindGenTabs(page, { tabs: 'netTabs', panels: 'netPanels', pager: 'netPager', prev: 'btnNetPrev', next: 'btnNetNext' });
        get('cbNetDhcp').addEventListener('change', () => this._renderIp());
        get('cbNetApProtect').addEventListener('change', () => this._renderAp());
        get('netSummary').addEventListener('click', (e) => {
            const row = e.target.closest('.net-sum-row');
            if (row) this._goTab(parseInt(row.dataset.tab, 10));
        });
        // Différé d'un tour : _markDirty (watchDirty) passe après cet écouteur.
        ['input', 'change'].forEach(evt => page.addEventListener(evt, () => setTimeout(() => this.updateDirtyCount(), 0)));
        this._saveBar = new SaveBar(page, { onSave: () => this.savePage(), onRevert: () => this.revertPage() });
        // Un réseau choisi remplit le nom et passe la main au mot de passe ; « réseau caché » vide le nom.
        this._near = new WifiNear('netNear', {
            picked: () => (get('fldSsid').value || '').trim(),
            onPick: (name) => {
                const fld = get('fldSsid');
                fld.value = name;
                fld.dispatchEvent(new Event('input', { bubbles: true }));
                (name ? get('fldPassphrase') : fld).focus();
            }
        });
        this._near.render();
    }
    loadNetwork() {
        getJSONSync('/networksettings', (err, settings) => {
            if (err) {
                ui.serviceError(err);
                return;
            }
            this._settings = settings;
            this._applySettings();
            watchDirty(get('divNetAdapter'));
            this.updateDirtyCount();
        });
    }
    // Remet à l'écran l'état enregistré : au chargement, après un enregistrement et sur « Annuler ».
    _applySettings() {
        const s = this._settings, pnl = get('divNetAdapter');
        const ct = parseInt(s.connType, 10);
        this._pending = !!this.isHotspot || !(ct >= 1 && ct <= 3);
        ui.toElement(pnl, s);
        get('fldHostname').value = s.hostname || '';
        get('cbHardwired').checked = ct >= 2;
        get('cbFallbackWireless').checked = ct === 3;

        const inputPwr = get('inputETHPWRPin');
        if (inputPwr && s.ethernet && s.ethernet.PWRPin !== undefined) {
            const isNone = parseInt(s.ethernet.PWRPin, 10) === -1;
            inputPwr.type = isNone ? 'text' : 'number';
            inputPwr.value = isNone ? 'None' : parseInt(s.ethernet.PWRPin, 10);
            this.togglePowerIcon(isNone);
        }
        this._ipData = s.ip || { dhcp: true, ip: '', subnet: '', gateway: '', dns1: '', dns2: '' };
        // Le serveur ne renvoie jamais les secrets, seulement s'ils sont définis.
        this._hasApPassword = !!(s.wifi && s.wifi.hasApPassword);
        this._hasPassphrase = !!(s.wifi && s.wifi.hasPassphrase);
        resetSecretField(get('fldPassphrase'), this._hasPassphrase);
        get('cbNetApProtect').checked = this._hasApPassword;
        resetSecretField(get('fldAPPassword'), this._hasApPassword);
        get('divETHSettings').style.display = s.ethernet && s.ethernet.boardType === 0 ? '' : 'none';

        this.updateStatusBadge(s);
        this.hiddenSSIDClicked();
        this._renderIp();
        this._renderAp();
        this.useEthernetClicked();
        this._renderHero();
    }
    // Pose le type de connexion sur l'en-tête : libellé du badge Wi-Fi/AP, badge allumé parmi
    // WIFI/LAN/POE, et indicateur réseau mobile. Séparé de updateStatusBadge() parce que ce dernier
    // ne s'alimente que de /networksettings, route protégée par l'authentification : sous PIN,
    // l'en-tête -- qui reste affiché, il vit hors de #divAuthenticated -- n'allumait aucun badge
    // tant que l'utilisateur n'était pas connecté. Security.loadContext() appelle donc ceci avec
    // ctx.netType, que /loginContext sert publiquement (cf. WebAuth::handleLoginContext).
    // type attendu : "hotspot" | "wifi" | "lan" | "poe".
    applyNetType(type) {
        const isAP = type === 'hotspot';
        const wifiBadge = document.getElementById('wifiBadge');
        if (wifiBadge) {
            wifiBadge.textContent = isAP ? 'AP' : 'WIFI';
            wifiBadge.setAttribute('data-conn', isAP ? 'hotspot' : 'wifi');
            wifiBadge.setAttribute('title', tr(isAP ? 'TOPBAR_TOOLTIP_AP' : 'TOPBAR_TOOLTIP_WIFI'));
        }
        const options = document.querySelectorAll('.opt-badge');
        if (!options.length) return;
        options.forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-conn') === type);
        });
        // Le MODE actif ne change qu'ici ; l'ÉTAT du lien, lui, arrive par les évènements socket
        // (cf. updateMobileNetStatus).
        this._netType = type;
        this.updateMobileNetStatus();
    }
    // Recalcule le MODE actif depuis les réglages (connType + profil Ethernet) une fois
    // /networksettings lisible. Même règle de départage lan/poe que WebAuth::handleLoginContext,
    // pour que les deux sources désignent le même badge et qu'il ne saute pas à la connexion.
    updateStatusBadge(settings) {
        let activeType = "wifi";

        if (this.isHotspot) {
            activeType = "hotspot";
        }
        else if (settings && parseInt(settings.connType) >= 2) {
            const boardType = (settings.ethernet && settings.ethernet.boardType !== undefined) ? parseInt(settings.ethernet.boardType) : 0;
            const pwrPin = (settings.ethernet && settings.ethernet.PWRPin !== undefined) ? parseInt(settings.ethernet.PWRPin) : -1;
            if (boardType === 1) {
                activeType = "lan";
            } else if (pwrPin !== -1) {
                activeType = "poe";
            } else {
                activeType = "lan";
            }
        }
        this.applyNetType(activeType);
    }
    // Indicateur réseau de l'en-tête mobile. Deux sources distinctes, volontairement : le mode
    // détermine l'icône, l'état du lien détermine la couleur de la pastille. Les deux
    // procWifiStrength()/procEthernet() sont aussi ce que socket.onclose force à "déconnecté", donc
    // une perte de connexion allume le rouge sans traitement supplémentaire.
    updateMobileNetStatus() {
        if (typeof somfy !== 'undefined') somfy.updateWelcomeSteps();
        const use = get('mobileNetIcon'), dot = get('mobileNetDot'), wrap = get('mobileNetStatus');
        const type = this._netType || (this.isHotspot ? 'hotspot' : 'wifi');
        const ICONS = { hotspot: '#svg-hotspot', wifi: '#svg-wifi', lan: '#svg-ethernet', poe: '#svg-ethernet0' };
        // Le hotspot est monté par l'appareil lui-même : il n'y a pas de lien distant à perdre,
        // donc jamais d'état "déconnecté" à signaler pour ce mode.
        const up = (type === 'hotspot') ? true
                 : (type === 'wifi') ? !!this._wifiLinkUp
                 : !!this._ethLinkUp;
        get('sidebarNetIcon')?.setAttribute('href', ICONS[type] || '#svg-wifi');
        get('sidebarNetDot')?.classList.toggle('is-up', up);
        get('sidebarNetDot')?.classList.toggle('is-down', !up);
        if (!use || !dot) return;
        use.setAttribute('href', ICONS[type] || '#svg-wifi');

        dot.classList.toggle('is-up', up);
        dot.classList.toggle('is-down', !up);
        if (wrap) {
            const label = (type === 'hotspot') ? 'HOTSPOT' : type.toUpperCase();
            wrap.setAttribute('title', `${label} — ${tr(up ? 'NET_STATUS_UP' : 'NET_STATUS_DOWN')}`);
        }
    }
    // mode : 1 Wi-Fi, 2 Ethernet, 3 Ethernet + Wi-Fi de secours (= connType).
    pickConnType(mode) {
        this._pending = false;
        get('cbHardwired').checked = mode >= 2;
        get('cbFallbackWireless').checked = mode === 3;
        this.useEthernetClicked();
        this.updateDirtyCount();
    }
    _mode() {
        if (this._pending) return 0;
        return get('cbHardwired').checked ? (get('cbFallbackWireless').checked ? 3 : 2) : 1;
    }
    _savedMode() {
        const ct = parseInt(this._settings && this._settings.connType, 10);
        return ct >= 1 && ct <= 3 ? ct : 0;
    }
    // Sur un boîtier, la carte Ethernet est figée : sans le mode avancé, l'onglet n'aurait rien
    // à montrer.
    _ethEditable() {
        const profile = (get('divContainer') && get('divContainer').getAttribute('data-hardwareprofile')) || '';
        return !profile.startsWith('BOX') || document.body.classList.contains('show-expert-gpio');
    }
    // Onglets et tuiles suivent le type choisi, avant même l'enregistrement. L'assistant de première
    // connexion l'appelle aussi, après avoir posé les vraies cases.
    useEthernetClicked() {
        const m = this._mode(), usesWifi = m === 1 || m === 3, usesEth = m >= 2 && this._ethEditable();
        const active = this.isHotspot ? 0 : this._savedMode();
        get('netTypeList').querySelectorAll('.net-type-btn').forEach(b => {
            const v = parseInt(b.dataset.mode, 10);
            b.classList.toggle('selected', v === m);
            b.setAttribute('aria-pressed', v === m ? 'true' : 'false');
            b.classList.toggle('is-active', v === active);
        });
        get('netApNote').hidden = !this.isHotspot;
        const wifiKey = m === 3 ? 'CONNEXION_WIFI_FALLBACK' : 'CONNEXION_WIFI';
        get('divNetAdapter').querySelectorAll('.net-wifi-tab, .net-wifi-title').forEach(el => {
            el.setAttribute('tr', wifiKey);
            el.textContent = tr(wifiKey);
        });
        [[1, usesEth], [2, usesWifi]].forEach(([i, on]) => {
            get('netTabs').querySelector(`[data-tab="${i}"]`).hidden = !on;
            get('netPanels').querySelector(`:scope > [data-tab="${i}"]`).classList.toggle('net-off', !on);
        });
        fillGenSecMini(Array.from(get('netPanels').children).filter(p => !p.classList.contains('net-off')));
        if (this._tabs) {
            const cur = get('netTabs').querySelector(`[data-tab="${this._tabs.current()}"]`);
            if (!cur || cur.hidden) this._tabs.show(0);
            else this._tabs.update();
        }
        this._renderEth();
        this._renderSummary();
    }
    _renderEth() {
        const board = parseInt(get('selETHBoardType').value, 10) || 0;
        const det = get('netEthDetail'), btn = get('btnNetEthDetail');
        get('netEthManualTile').hidden = board !== 0;
        get('netEthPresetTile').hidden = board === 0;
        if (board === 0) det.hidden = true;
        btn.querySelector('span').textContent = tr(det.hidden ? 'CONNEXION_SHOW_DETAIL' : 'CONNEXION_HIDE_DETAIL');
        if (!det.hidden) det.innerHTML = this._ethDetailHtml();
        genGridSpan(get('netPanels').querySelector(':scope > [data-tab="1"]'));
    }
    toggleEthDetail() {
        const det = get('netEthDetail');
        det.hidden = !det.hidden;
        this._renderEth();
    }
    // Libellés venus des listes de cartes et de puces : aucune saisie libre.
    _ethDetailHtml() {
        const text = (id) => { const s = get(id); return s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : '--'; };
        const pwr = get('inputETHPWRPin').value;
        const row = (key, value) => `<div class="ed-ro"><span>${tr(key)}</span><b>${value}</b></div>`;
        return row('ETH_SETTINGS_PHY_TYPE', text('selETHPhyType'))
            + row('ETH_SETTINGS_PHY_ADDRESS', text('selETHAddress'))
            + row('ETH_SETTINGS_CLOCK_MODE', text('selETHClkMode'))
            + row('ETH_SETTINGS_POWER_PIN', pwr === 'None' || pwr === '-1' ? tr('ETH_SETTINGS_NONE') : escHtml(pwr))
            + row('ETH_SETTINGS_MDC_PIN', escHtml(get('inputETHMDCPin').value))
            + row('ETH_SETTINGS_MDIO_PIN', escHtml(get('inputETHMDIOPin').value));
    }
    hiddenSSIDClicked() {
        const cbHidden = get('cbHiddenSSID');
        const cbRoaming = get('cbRoaming');
        const divRoaming = get('divRoaming');

        if (!cbHidden || !cbRoaming) return;

        const isHiddenActive = cbHidden.checked;

        if (isHiddenActive) {
            cbRoaming.checked = false;
        }
        cbRoaming.disabled = isHiddenActive;

        if (divRoaming) {
            if (isHiddenActive) {
                divRoaming.classList.add('is-disabled');
            } else {
                divRoaming.classList.remove('is-disabled');
            }
        }
    }

    _renderIp() {
        const dhcp = get('cbNetDhcp').checked;
        get('netStaticIp').hidden = dhcp;
        get('netIpTip').hidden = !dhcp;
        this._renderSummary();
    }
    _renderAp() {
        const on = get('cbNetApProtect').checked;
        get('netApPwdField').hidden = !on;
        get('netApWarning').textContent = tr(on ? 'AP_MODAL_WARNING' : 'AP_MODAL_OPEN_WARNING');
        this._renderSummary();
    }
    // Ce qui partirait à l'enregistrement, sans attendre : une ligne manquante passe en orange.
    _renderSummary() {
        const box = get('netSummary');
        if (!box || !this._settings) return;
        const m = this._mode(), rows = [];
        const add = (key, value, tab, missing = false) => rows.push({ key, value, tab, missing });
        const host = get('fldHostname').value.trim();
        add('GENERAL_HOSTNAME', host || tr('CONNEXION_TO_FILL'), 3, !host);
        if (m === 1 || m === 3) {
            const ssid = get('fldSsid').value.trim();
            add(m === 3 ? 'CONNEXION_WIFI_FALLBACK' : 'CONNEXION_TITLE_WIFI', ssid || tr('CONNEXION_TO_FILL'), 2, !ssid);
            add('CONNEXION_ROAMING', tr(get('cbRoaming').checked ? 'BT_YES' : 'BT_NO'), 2);
        }
        if (m >= 2) {
            const sel = get('selETHBoardType');
            add('CONNEXION_ETH_BOARD', sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '--', 1);
        }
        const dhcp = get('cbNetDhcp').checked;
        add('CONNEXION_CURRENT_IP', dhcp ? tr('CONNEXION_IP_AUTO') : `${tr('CONNEXION_IP_STATIC')} · ${get('fldIPAddress').value.trim()}`, 3);
        const protect = get('cbNetApProtect').checked;
        add('CONNEXION_AP_TITLE', tr(protect ? 'CONNEXION_BADGE_AP_PROTECTED' : 'IS_OPEN'), 3,
            protect && !this._hasApPassword && secretValue(get('fldAPPassword')).length < 8);
        // SSID et adresses viennent de champs libres : textContent, jamais innerHTML.
        box.replaceChildren(...rows.map(r => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'net-sum-row' + (r.missing ? ' is-missing' : '');
            b.dataset.tab = r.tab;
            b.innerHTML = '<span></span><b></b><svg><use href="#svg-arrowRight"></use></svg>';
            b.children[0].textContent = tr(r.key);
            b.children[1].textContent = r.value;
            return b;
        }));
    }
    // Sous 768 px il n'y a plus d'onglets : on descend jusqu'à la section.
    _goTab(i) {
        const tab = get('netTabs').querySelector(`[data-tab="${i}"]`);
        if (!tab || tab.hidden) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        if (window.matchMedia('(max-width: 767px)').matches) {
            get('netPanels').querySelector(`:scope > [data-tab="${i}"]`).scrollIntoView({ block: 'start', behavior: reduce });
            return;
        }
        this._tabs.show(i);
        get('netTabs').scrollIntoView({ block: 'start', behavior: reduce });
    }
    // Chaque réglage modifié, avec son groupe : chacun part par sa propre route.
    _netFields() {
        const s = this._settings || {}, w = s.wifi || {}, e = s.ethernet || {}, ip = s.ip || {};
        const yesNo = (v) => tr(v ? 'BT_YES' : 'BT_NO');
        const modeKeys = { 1: 'CONNEXION_WIFI', 2: 'CONNEXION_ETHERNET', 3: 'CONNEXION_ETH_FALLBACK' };
        const selText = (id) => (v) => { const o = Array.from(get(id).options).find(x => x.value === String(v)); return o ? o.text : v; };
        const pin = (v) => (v === 'None' || v === '' || v === undefined || v === null) ? '-1' : String(v);
        const field = (group, label, el, saved, now, show = (v) => v, secret = false) => ({ group, label, el, saved, now, show, secret });
        const savedMode = this._savedMode();
        const board = get('selETHBoardType').value;
        const dhcp = get('cbNetDhcp').checked;
        const list = [
            field('host', 'GENERAL_HOSTNAME', get('fldHostname'), s.hostname || '', get('fldHostname').value.trim()),
            field('conn', 'CONNEXION_TYPE', get('cbHardwired'), savedMode, this._pending ? savedMode : this._mode(), (v) => modeKeys[v] ? tr(modeKeys[v]) : ''),
            field('conn', 'CONNEXION_WIFI_SSID', get('fldSsid'), w.ssid || '', get('fldSsid').value),
            field('conn', 'SECURITY_PASSWORD', get('fldPassphrase'), '', secretValue(get('fldPassphrase')), undefined, true),
            field('conn', 'CONNEXION_HIDDEN_SSID', get('cbHiddenSSID'), !!w.hidden, get('cbHiddenSSID').checked, yesNo),
            field('conn', 'CONNEXION_ROAMING', get('cbRoaming'), !!w.roaming, get('cbRoaming').checked, yesNo),
            field('conn', 'SETTINGS_BOARD_TYPE', get('selETHBoardType'), String(e.boardType ?? 0), board, selText('selETHBoardType'))
        ];
        // Une carte connue fixe d'elle-même puce et broches : seule la carte compte alors.
        if (board === '0') list.push(
            field('conn', 'ETH_SETTINGS_PHY_TYPE', get('selETHPhyType'), String(e.phyType ?? 0), get('selETHPhyType').value, selText('selETHPhyType')),
            field('conn', 'ETH_SETTINGS_PHY_ADDRESS', get('selETHAddress'), String(e.phyAddress ?? 0), get('selETHAddress').value, selText('selETHAddress')),
            field('conn', 'ETH_SETTINGS_CLOCK_MODE', get('selETHClkMode'), String(e.CLKMode ?? 0), get('selETHClkMode').value, selText('selETHClkMode')),
            field('conn', 'ETH_SETTINGS_POWER_PIN', get('inputETHPWRPin'), pin(e.PWRPin), pin(get('inputETHPWRPin').value)),
            field('conn', 'ETH_SETTINGS_MDC_PIN', get('inputETHMDCPin'), String(e.MDCPin ?? ''), get('inputETHMDCPin').value),
            field('conn', 'ETH_SETTINGS_MDIO_PIN', get('inputETHMDIOPin'), String(e.MDIOPin ?? ''), get('inputETHMDIOPin').value));
        list.push(field('ip', 'CONNEXION_ADDRESSING', get('cbNetDhcp'), ip.dhcp !== false, dhcp, (v) => tr(v ? 'CONNEXION_IP_AUTO' : 'CONNEXION_IP_STATIC')));
        if (!dhcp) [['DHCP_OVERLAY_STATIC_IP', 'fldIPAddress', 'ip'], ['DHCP_OVERLAY_SUBNET_MASK', 'fldSubnetMask', 'subnet'],
            ['DHCP_OVERLAY_GATEWAY', 'fldGateway', 'gateway'], ['DHCP_OVERLAY_DNS1', 'fldDNS1', 'dns1'], ['DHCP_OVERLAY_DNS2', 'fldDNS2', 'dns2']]
            .forEach(([label, id, k]) => list.push(field('ip', label, get(id), ip[k] || '', get(id).value.trim())));
        const protect = get('cbNetApProtect').checked;
        list.push(field('ap', 'CONNEXION_AP_PASSWORD', get('cbNetApProtect'), this._hasApPassword, protect, yesNo));
        if (protect) list.push(field('ap', 'SECURITY_PASSWORD', get('fldAPPassword'), '', secretValue(get('fldAPPassword')), undefined, true));
        return list.filter(f => String(f.saved) !== String(f.now));
    }
    // Page cachée : rien à compter, et l'assistant de première connexion écrit dans ces champs.
    updateDirtyCount() {
        if (!this._saveBar || !this._settings || !get('divNetAdapter').offsetParent) return;
        get('divNetAdapter').querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty'));
        const diffs = this._netFields();
        diffs.forEach(f => f.el.classList.add('is-dirty'));
        _recomputeIsDirty();
        if (!isDirty) document.body.classList.remove('dirty-alerted');
        this._saveBar.update(diffs.map(f => ({ label: tr(f.label), from: f.show(f.saved), to: f.show(f.now), secret: f.secret })));
        this._renderSummary();
    }
    revertPage() {
        if (!this._settings) return;
        this._applySettings();
        this.updateDirtyCount();
    }
    // Quatre routes : le nom d'hôte, le mot de passe du point d'accès et l'adresse IP s'appliquent
    // sans redémarrage, la connexion en dernier, puisqu'elle peut couper la session.
    savePage() {
        const diffs = this._netFields(), has = (g) => diffs.some(f => f.group === g);
        const m = this._mode();
        if ((m === 1 || m === 3) && !get('fldSsid').value.trim()) {
            ui.errorMessage(tr('ERR_WIFI_SSID_INVALID'));
            this._goTab(2);
            return;
        }
        const protect = get('cbNetApProtect').checked, apPwd = secretValue(get('fldAPPassword'));
        if (has('ap') && protect) {
            // 63 : limite du protocole WPA2, pas du tampon firmware.
            if ((apPwd.length === 0 && !this._hasApPassword) || (apPwd.length > 0 && apPwd.length < 8)) {
                ui.errorMessage(tr('ERR_AP_PASSWORD_INVALID'), tr('ERR_AP_PASSWORD_INVALID_DESC'));
                return;
            }
            if (apPwd.length > 63) {
                ui.errorMessage(tr('ERR_AP_PASSWORD_INVALID'), tr('ERR_AP_PASSWORD_MAX_LENGTH_63'));
                return;
            }
        }
        // Le firmware garde 31 caractères (char hostname[32]) et coupe le reste sans prévenir.
        const host = get('fldHostname').value.trim();
        if (has('host')) {
            const why = !host ? 'ERR_INVALID_HOSTNAME' : !/^[a-zA-Z0-9-]+$/.test(host) ? 'ERR_HOSTNAME_CHARS' : host.length > 31 ? 'ERR_HOSTNAME_LENGTH' : '';
            if (why) {
                ui.errorMessage(tr('ERR_HOSTNAME'), tr(why));
                this._goTab(3);
                return;
            }
        }
        const ip = { dhcp: get('cbNetDhcp').checked };
        ['ip', 'subnet', 'gateway', 'dns1', 'dns2'].forEach((k, i) => { ip[k] = get(['fldIPAddress', 'fldSubnetMask', 'fldGateway', 'fldDNS1', 'fldDNS2'][i]).value.trim(); });
        if (has('ip') && !this._validateIp(ip)) return;

        const put = (url, body) => new Promise((resolve, reject) => putJSONSync(url, body, (err) => err ? reject(err) : resolve()));
        // Nom d'hôte en premier : la connexion, enregistrée en dernier, peut redémarrer l'appareil.
        let chain = Promise.resolve();
        if (has('host')) chain = chain
            .then(() => put('/setNetwork', { hostname: host }))
            .then(() => this._hostnameSaved(host));
        if (has('ap')) chain = chain
            // Champ vide = « inchangé » côté firmware : pour ouvrir le point d'accès, apPasswordClear.
            .then(() => put('/setNetwork', { wifi: protect ? { apPassword: apPwd } : { apPasswordClear: true } }))
            .then(() => {
                this._hasApPassword = protect && (apPwd.length > 0 || this._hasApPassword);
                this._settings.wifi = Object.assign({}, this._settings.wifi, { hasApPassword: this._hasApPassword });
                resetSecretField(get('fldAPPassword'), this._hasApPassword);
            });
        if (has('ip')) chain = chain
            .then(() => put('/setIP', ip))
            .then(() => { this._settings.ip = ip; this._ipData = ip; });
        chain.then(() => {
            if (has('conn')) { this.saveNetwork(); return; }
            ui.toast(tr('MSG_SAVE_SUCCESS'));
            this.updateDirtyCount();
            this._renderHero();
        }).catch(err => ui.serviceError(err));
    }
    _validateIp(obj) {
        if (obj.dhcp) return true;
        const valid = (a) => /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(a);
        const checks = [
            ['ip', 'ERR_STATIC_IP_REQUIRED', 'ERR_STATIC_IP_INVALID'],
            ['subnet', 'ERR_NETMASK_REQUIRED', 'ERR_NETMASK_INVALID'],
            ['gateway', 'ERR_GATEWAY_REQUIRED', 'ERR_GATEWAY_INVALID']
        ];
        for (const [k, required, invalid] of checks) {
            if (!obj[k] || obj[k] === '0.0.0.0') { ui.errorMessage(tr(required)); return false; }
            if (!valid(obj[k])) { ui.errorMessage(tr(invalid)); return false; }
        }
        if (obj.dns1 && !valid(obj.dns1)) { ui.errorMessage(tr('ERR_DNS1_INVALID')); return false; }
        if (obj.dns2 && !valid(obj.dns2)) { ui.errorMessage(tr('ERR_DNS2_INVALID')); return false; }
        return true;
    }
    // Tête de page : ce que fait l'appareil maintenant, pas ce qui est réglé.
    _renderHero() {
        const hero = get('netHero');
        if (!hero) return;
        const ap = !!this.isHotspot, eth = !ap && !!this._ethLinkUp;
        const kind = ap ? 'ap' : eth ? 'eth' : 'wifi';
        const s = this._settings || {};
        hero.dataset.net = kind;
        get('netHeroWave').style.display = kind === 'wifi' ? '' : 'none';
        get('netHeroIconSvg').style.display = kind === 'wifi' ? 'none' : '';
        get('netHeroIcon').setAttribute('href', ap ? '#svg-hotspot' : '#svg-ethernet');
        get('netHeroState').textContent = tr({ ap: 'CONNEXION_HERO_AP', eth: 'CONNEXION_HERO_ETH', wifi: 'CONNEXION_HERO_WIFI' }[kind]);
        get('netHeroName').textContent = ap ? (window.__currentHostname || 'ESPSomfy RTS')
            : eth ? tr('CONNEXION_ETHERNET') : (this._wifiSsid || (s.wifi && s.wifi.ssid) || '--');
        let qKey = '', qCls = '';
        if (eth) qKey = 'CONNEXION_LINK_UP';
        else if (!ap && !this._wifiLinkUp) { qKey = 'NET_STATUS_DOWN'; qCls = 'is-bad'; }
        else if (!ap) {
            const lvl = this.calcWaveStrength(this._wifiRssi);
            qKey = lvl >= 2 ? 'CONNEXION_SIGNAL_GOOD' : lvl === 1 ? 'CONNEXION_SIGNAL_MEDIUM' : 'CONNEXION_SIGNAL_BAD';
            qCls = lvl >= 2 ? '' : lvl === 1 ? 'is-medium' : 'is-bad';
        }
        // Le halo prend la couleur du signal et n'allume que les arcs atteints.
        const lvl = this._wifiLinkUp ? this.calcWaveStrength(this._wifiRssi) : -1;
        get('netHeroWave').querySelectorAll('use').forEach((u, i) => u.classList.toggle('on', i <= lvl));
        get('netHeroHalo').className = 'gen-hero-halo ' + (ap ? 'is-ap' : qCls);
        const q = get('netHeroQuality');
        q.hidden = !qKey;
        q.className = 'net-hero-quality ' + qCls;
        q.textContent = qKey ? tr(qKey) : '';
        // En DHCP, NetManager recopie l'adresse obtenue dans les réglages : ip.ip est l'adresse réelle.
        const host = window.location.hostname;
        const known = this._ipData && this._ipData.ip && this._ipData.ip !== '0.0.0.0' ? this._ipData.ip : '';
        const ipNow = known || (/^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : '--');
        get('spanCurrentIP').textContent = ap ? '192.168.4.1' : ipNow;
        get('netHeroAddr').textContent = tr(this._ipData && this._ipData.dhcp === false ? 'CONNEXION_IP_STATIC' : 'CONNEXION_IP_AUTO');
        get('netHeroSignalRow').hidden = kind !== 'wifi' || !this._wifiLinkUp;
        get('netHeroSignal').textContent = `${this._wifiChannel} · ${this._wifiRssi} ${tr('UNIT_DBM')}`;
        get('netHeroSpeedRow').hidden = !eth;
        get('netHeroSpeed').textContent = isNaN(this._ethSpeed) ? '--' : `${this._ethSpeed} Mbit/s${this._ethDuplex ? ' · full duplex' : ''}`;
    }
    // Un réseau par nom, au signal le plus fort, du plus fort au plus faible.
    groupAPs(aps) {
        let nets = [];
        if (aps && aps.accessPoints) {
            for (let i = 0; i < aps.accessPoints.length; i++) {
                let ap = aps.accessPoints[i];
                let p = nets.find(elem => elem.name === ap.name);
                if (p) {
                    p.channel = p.strength > ap.strength ? p.channel : ap.channel;
                    p.macAddress = p.strength > ap.strength ? p.macAddress : ap.macAddress;
                    p.strength = Math.max(p.strength, ap.strength);
                } else {
                    nets.push(ap);
                }
            }
        }
        nets.sort((a, b) => b.strength - a.strength);
        return nets;
    }
    // Modale FINALE d'enregistrement, commune aux deux modes de connexion (d'où son nom : ni
    // "wifi", ni "ethernet"). Sans pendingObj, elle conclut le parcours Wi-Fi et rappelle
    // saveNetwork() (qui relira les champs à ce moment-là) ; avec un pendingObj, elle conclut le
    // parcours Ethernet et envoie directement cet objet déjà constitué par saveNetwork() -- ce qui
    // évite de repasser par saveNetwork() et de rouvrir cette modale en boucle.
    // Elle ne contient volontairement AUCUN récapitulatif de broches : celui-ci appartient à
    // l'étape précédente du parcours Ethernet (cf. ethernetConfirmationOverlay()).
    networkConfirmationOverlay(hostname, pendingObj) {
        if (get('divNetworkConfirmationOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divNetworkConfirmationOverlay';
        div.className = 'modal-overlay';
        const host = hostname || 'espsomfyrts';
        // Les URL annoncées sont toujours en minuscules : mDNS et les noms d'hôte y sont
        // insensibles à la casse, mais afficher "http://Salon.local" laisserait croire que la
        // casse compte. Le champ, lui, garde la saisie telle quelle (cf. syncHostLinks()).
        const hostUrl = host.toLowerCase();

        div.innerHTML = `
        <div class="message-content confirmNetwork-content">
        <div class="modal-mobile-handle" onclick="handleMobileDismiss(this)"></div>
        <!-- Pas de modalHeader() ici (confirmNetwork-header est un en-tête custom), mais on
        garde le même principe que les autres modal-overlay : l'en-tête reste hors de
        overlay-scroll-content pour rester fixe pendant que le corps défile. -->
        <div class="confirmNetwork-header">
        <div class="confirmNetwork-icon"><svg><use href="#svg-save"></use></svg></div>
        <h3>${tr("SAVEWIFI_TITLE")}</h3>
        </div>
        <p class="confirmNetwork-intro">${tr("SAVEWIFI_INTRO")}</p>
        <div class="overlay-scroll-content">
        <div class="confirmNetwork-body">

        <p class="alert-desc-sub">${tr("FIRST_CONNECT_HOSTNAME_DESC")}</p>
        <div class="uniRow dirty-target">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-hostName"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="txtConfirmHostname">${tr("GENERAL_HOSTNAME")}</label>
        <input id="txtConfirmHostname" class="inputAndSelect" type="text" maxlength="31" value="${host}">
        </div>
        </div>
        </div>
        <div>
        <div class="alert-title">${tr("SAVEWIFI_ACCES_AFTER")}</div>
        <p class="alert-desc-sub">${tr("SAVEWIFI_AFTER_DESC_0")}</p>
        <div class="links-container">
        <a id="lnkConfirmHostLocal" href="http://${hostUrl}.local" target="_blank">http://${hostUrl}.local</a>
        <span class="or-separator">${tr("SAVEWIFI_AFTER_DESC_1")}</span>
        <a id="lnkConfirmHostPlain" href="http://${hostUrl}" target="_blank">http://${hostUrl}</a>
        </div>
        <p class="alert-desc-sub">${tr("SAVEWIFI_AFTER_DESC_2")}</p>
        </div>
        </div>
        <div class="hrMessage"></div>
        <div class="confSaveWifi-divStepsTitle">
        <div class="confSaveWifi-stepsTitle">${tr("SAVEWIFI_STEP")}</div>
        <ol class="confSaveWifi-steps">
        <li>${tr("SAVEWIFI_STEP_0")}</li>
        <li>${tr("SAVEWIFI_STEP_1")}</li>
        <li>${tr("SAVEWIFI_STEP_2")}</li>
        </ol>
        </div>
        </div>

        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnConfirmNetCancel" type="button" line>${tr("BT_CANCEL_1")}</button>
        <button id="btnConfirmNetSave" type="button">
        <svg><use href="#svg-save"></use></svg>
        <span>${tr("BT_SAVE")}</span>
        </button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);

        get('btnConfirmNetCancel').onclick = () => closeOverlay(div);

        // Les adresses d'accès annoncées juste au-dessus dépendent directement du nom d'hôte : on
        // les réécrit à chaque frappe pour que l'utilisateur voie exactement l'URL qu'il devra
        // saisir après la bascule. textContent/href assignés en propriété (jamais par innerHTML) --
        // la valeur vient d'un champ libre.
        const hostFld = get('txtConfirmHostname');
        const lnkLocal = get('lnkConfirmHostLocal');
        const lnkPlain = get('lnkConfirmHostPlain');
        const syncHostLinks = () => {
            // Toujours en minuscules, quelle que soit la saisie : les URL affichées doivent être
            // celles réellement utilisables, sans laisser penser que la casse compte.
            const h = ((hostFld.value || '').trim() || 'espsomfyrts').toLowerCase();
            if (lnkLocal) { lnkLocal.href = `http://${h}.local`; lnkLocal.textContent = `http://${h}.local`; }
            if (lnkPlain) { lnkPlain.href = `http://${h}`; lnkPlain.textContent = `http://${h}`; }
        };
        if (hostFld) hostFld.oninput = syncHostLinks;

        get('btnConfirmNetSave').onclick = () => {
            // Même validation que General.setGeneral(), mais bloquante ici : contrairement à
            // l'ancienne étape d'assistant, c'est la dernière occasion de corriger le nom d'hôte
            // avant que l'appareil ne change de réseau.
            const hostVal = hostFld ? (hostFld.value || '').trim() : '';
            if (hostFld && (!hostVal || !/^[a-zA-Z0-9-]+$/.test(hostVal) || hostVal.length > 31)) {
                ui.errorMessage(tr('ERR_HOSTNAME'), tr('ERR_HOSTNAME_CHARS'));
                return;
            }
            // On ne ferme plus la fenêtre : l'ESP32 enregistre puis redémarre son réseau, donc la
            // connexion va être coupée. On affiche un indicateur de chargement à la place pour que
            // l'utilisateur comprenne que quelque chose est en cours plutôt que de croire à un bug.
            get('btnConfirmNetCancel').disabled = true;
            get('btnConfirmNetSave').disabled = true;
            ui.waitMessage(div, 'WAIT_MSG_NET_SWITCH');
            // Ethernet : l'objet réseau est déjà constitué (cf. saveNetwork()), on l'envoie tel
            // quel. Wi-Fi : on repasse par saveNetwork(), qui relit les champs à cet instant.
            // Le nom d'hôte voyage dans le même /setNetwork : le firmware l'enregistre avant de
            // programmer un éventuel redémarrage.
            const hostname = hostVal && hostVal !== (window.__currentHostname || '') ? hostVal : undefined;
            if (pendingObj) {
                if (hostname) pendingObj.hostname = hostname;
                this.sendNetworkSettings(pendingObj);
            }
            else this.saveNetwork({ hostname });
        };
    }
    calcWaveStrength(sig) {
        let wave = 0;
        if (sig > -90) wave = 0;
        if (sig > -80) wave = 1;
        if (sig > -70) wave = 2;
        if (sig > -60) wave = 3;
        return wave;
    }
    // opts : { hostname, onSent, onFail }. hostname part dans le même /setNetwork. Avec onSent
    // (assistant de première connexion), la fenêtre de confirmation n'est pas ouverte : le nom
    // d'hôte y est déjà saisi.
    saveNetwork(opts = null) {
        let pnl = get('divNetAdapter'), obj = ui.fromElement(pnl);

        if (!obj.ethernet) obj.ethernet = {};

        // Pendant l'onboarding, #divETHSettings est déplacé dans le panneau (cf.
        // Onboarding._hostEthSettings()) et sort donc de #divNetAdapter : ui.fromElement()
        // ci-dessus ne voit plus ses data-bind. On relit ce bloc à part et on fusionne, sans quoi
        // toutes les broches GPIO saisies manuellement seraient perdues à l'enregistrement.
        const ethPnl = get('divETHSettings');
        if (ethPnl && !pnl.contains(ethPnl)) {
            const extra = ui.fromElement(ethPnl);
            if (extra && extra.ethernet) obj.ethernet = Object.assign({}, obj.ethernet, extra.ethernet);
        }

        const cbHardwired = get('cbHardwired');
        if (cbHardwired) {
            obj.ethernet.hardwired = cbHardwired.checked;
        }
        // Masque factice = inchangé : le firmware garde la phrase de passe sur une chaîne vide.
        if (obj.wifi) obj.wifi.passphrase = secretValue(get('fldPassphrase'));
        delete obj.ip;
        if (opts && opts.hostname) obj.hostname = opts.hostname;

        const eth = obj.ethernet;

        if (isNaN(eth.PWRPin) || eth.PWRPin === 'None' || eth.PWRPin === '') {
            eth.PWRPin = -1;
        }

        obj.connType = eth.hardwired ? (eth.wirelessFallback ? 3 : 2) : 1;

        // Ethernet : parcours en DEUX temps. D'abord un récapitulatif matériel dédié
        // (ethernetConfirmationOverlay) pour relire les broches GPIO, puis seulement la modale
        // finale d'enregistrement commune au Wi-Fi (nom d'hôte + adresses d'accès). Le boîtier
        // BOX-ETH court-circuite le récapitulatif : câblage fixe et validé, il n'y a rien à
        // relire -- il rejoint donc directement la modale finale.
        if (obj.connType >= 2) {
            const container = get('divContainer');
            const isBOXEth = container && container.getAttribute('data-hardwareprofile') === 'BOX-ETH';
            if (opts && opts.onSent) {
                if (isBOXEth) this.sendNetworkSettings(obj, opts);
                else this.ethernetConfirmationOverlay(obj, () => this.sendNetworkSettings(obj, opts), opts.onFail);
            }
            else if (isBOXEth) this.networkConfirmationOverlay(this._currentHostname(), obj);
            else this.ethernetConfirmationOverlay(obj);
            return;
        }
        this.sendNetworkSettings(obj, opts);
    }
    // Nom d'hôte accepté par le firmware : la page, le reste de l'interface et Général le reprennent.
    _hostnameSaved(host) {
        if (this._settings) this._settings.hostname = host;
        window.__currentHostname = host;
        general.onHostnameSaved(host);
    }
    _currentHostname() {
        return window.__currentHostname || (window.settings && window.settings.hostname) || 'espsomfyrts';
    }
    // Étape intermédiaire du parcours Ethernet : récapitulatif en lecture seule de la
    // configuration matérielle retenue, pour que l'utilisateur relise les broches GPIO avant
    // d'aller plus loin. Purement informatif -- l'ancienne case à cocher de sécurité, qui
    // maintenait le bouton désactivé tant qu'elle n'était pas cochée, a été retirée. "Confirmer"
    // enchaîne sur la modale finale d'enregistrement (networkConfirmationOverlay).
    ethernetConfirmationOverlay(obj, onConfirm = null, onCancel = null) {
        if (get('divEthernetConfirmationOverlay')) return;

        const div = document.createElement('div');
        div.id = 'divEthernetConfirmationOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content">
        ${modalHeader('ETH_SETTINGS_TITLE', 'svg-ethernet', {
            subtitle: 'ETH_SETTINGS_DESC',
        })}
        <div class="overlay-scroll-content">
        <div class="uniblocCol"><p>${tr("ETH_SETTINGS_WARNING_DESC_1")}</p></div>
        ${this._ethSummaryHtml(obj.ethernet)}
        </div>
        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnEthConfirmCancel" line type="button">${tr("BT_CANCEL_1")}</button>
        <button id="btnEthConfirmNext" type="button">
        <span>${tr("BT_CONFIRM")}</span>
        <svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg>
        </button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);

        // Toute sortie autre que Confirmer (bouton, clic dehors, poignée) rend la main à l'appelant.
        div._onClosed = () => { if (!div._confirmed && onCancel) onCancel(); };
        get('btnEthConfirmCancel').onclick = () => closeOverlay(div);
        get('btnEthConfirmNext').onclick = () => {
            div._confirmed = true;
            closeOverlay(div);
            if (onConfirm) onConfirm();
            else this.networkConfirmationOverlay(this._currentHostname(), obj);
        };
    }
    _ethSummaryHtml(eth) {
        const board = this.ethBoardTypes.find(e => eth.boardType === e.val);
        const phy = this.ethPhyTypes.find(e => eth.phyType === e.val);
        const clk = this.ethClockModes.find(e => eth.CLKMode === e.val);
        const line = (labelKey, value) => `<div class="eth-setting-line"><label>${tr(labelKey)}</label><span>${value}</span></div>`;
        return `
        <div class="blocEthBoardSettings">
        <div>
        ${line("SETTINGS_BOARD_TYPE", `${board ? board.label : tr("MANUAL_SETTINGS")} [${board ? board.val : 0}]`)}
        ${line("ETH_SETTINGS_PHY_TYPE", `${phy ? phy.label : '---'} [${phy ? phy.val : 0}]`)}
        ${line("ETH_SETTINGS_PHY_ADDRESS", eth.phyAddress ?? 0)}
        ${line("ETH_SETTINGS_CLOCK_MODE", `${clk ? clk.label : '---'} [${clk ? clk.val : 0}]`)}
        ${line("ETH_SETTINGS_POWER_PIN", (eth.PWRPin === undefined || eth.PWRPin === -1) ? tr("ETH_SETTINGS_NONE") : eth.PWRPin)}
        ${line("ETH_SETTINGS_MDC_PIN", eth.MDCPin ?? 0)}
        ${line("ETH_SETTINGS_MDIO_PIN", eth.MDIOPin ?? 0)}
        </div>
        </div>`;
    }
    sendNetworkSettings(obj, opts = null) {
        // Enregistrer le réseau est l'action qui conclut RÉELLEMENT l'assistant de premier
        // démarrage : l'utilisateur valide par « Enregistrer et connecter », puis attend la
        // bascule du hotspot vers le réseau local -- il ne repasse
        // jamais par "Ignorer", seule autre sortie de l'assistant, donc onboarding.skip() n'est
        // pas appelé. Tout ce qui doit être appliqué en fin d'assistant doit donc l'être ici aussi.
        const isOnboarding = isApMode && !window.__onboardingDone;
        const doSend = () => {
            putJSONSync('/setNetwork', obj, (err, response) => {
                if (err) {
                    ui.serviceError(err);
                    if (opts && opts.onFail) opts.onFail();
                    return;
                }
                if (obj.hostname) this._hostnameSaved(obj.hostname);
                if (opts && opts.onSent) opts.onSent();
                else ui.toast(tr('MSG_SAVE_SUCCESS'));
                logger.debug("Network settings updated:", response);
                clearDirty();
                this._rebaseline(obj);
            });
        };
        // Enregistrer un Wi-Fi depuis l'assistant de premier démarrage (mode AP) coupe le hotspot
        // pour rejoindre ce réseau -- l'utilisateur perdrait l'accès à toute étape restante du
        // wizard (Nom d'hôte/Sécurité/Terminer), qui n'existeront plus une fois basculé sur le
        // réseau local. On valide donc l'onboarding AVANT d'envoyer les paramètres réseau
        // (attendu, pour garantir l'ordre malgré deux requêtes distinctes) : l'appareil retrouve
        // directement le tableau de bord normal une fois reconnecté, plutôt que de rester en
        // attente d'une étape désormais inaccessible.
        const go = () => {
            if (!isOnboarding) return doSend();
            // Sans réessai (markDone(0), le défaut) : la sauvegarde réseau enchaîne juste derrière
            // et ne peut pas s'offrir plusieurs secondes d'attente. En cas d'échec on envoie quand
            // même -- perdre le drapeau ne coûte qu'une réapparition de l'assistant.
            onboarding.markDone()
            .then(doSend)
            .catch(err => {
                logger.error('Failed to auto-complete onboarding before network save:', err);
                doSend();
            });
        };
        go();
    }

    // Pas de relecture du serveur : l'appareil peut redémarrer dans la seconde.
    _rebaseline(obj) {
        if (!this._settings) return;
        const s = this._settings, w = obj.wifi || {};
        s.connType = obj.connType;
        s.wifi = Object.assign({}, s.wifi, { ssid: w.ssid, hidden: w.hidden, roaming: w.roaming, hasPassphrase: this._hasPassphrase || !!w.passphrase });
        s.ethernet = Object.assign({}, s.ethernet, obj.ethernet);
        this._applySettings();
        this.updateDirtyCount();
    }
    procWifiStrength(strength) {
        if (!strength) return;
        const ssid = strength.ssid || strength.name;
        this._wifiSsid = ssid || '';
        this._wifiRssi = parseInt(strength.strength);
        this._wifiChannel = parseInt(strength.channel);
        // -100 dBm est la valeur que socket.onclose injecte pour signifier "plus de lien".
        this._wifiLinkUp = !isNaN(this._wifiRssi) && this._wifiRssi < 0 && this._wifiRssi > -100;
        this.updateMobileNetStatus();
        this._renderHero();
    }
    procEthernet(ethernet) {
        logger.debug('Ethernet status:', ethernet);
        this._ethLinkUp = !!ethernet.connected;
        this._ethSpeed = parseInt(ethernet.speed);
        this._ethDuplex = !!ethernet.fullduplex;
        this.updateMobileNetStatus();
        this._renderHero();
    }
}
var wifi = new Wifi();

// Liste des réseaux proches, la même dans l'assistant de première connexion et dans l'onglet Wi-Fi.
// nets : undefined = pas encore cherché, null = recherche en cours, [] = rien trouvé.
// /scanaps est bloquant côté appareil (~3 s, HTTP gelé), et coupe la station si le point d'accès
// est ouvert : on ne le lance donc jamais tout seul depuis la page Connexion.
class WifiNear {
    constructor(boxId, { picked, onPick }) {
        this.boxId = boxId;
        this.picked = picked;
        this.onPick = onPick;
        this.nets = undefined;
    }
    scan() {
        if (this.nets === null) return;
        this.nets = null;
        this.render();
        getJSON('/scanaps', (err, aps) => {
            if (err) logger.error('Wi-Fi scan failed:', err);
            this.nets = err ? [] : wifi.groupAPs(aps);
            this.render();
        });
    }
    render() {
        const box = get(this.boxId);
        if (!box) return;
        box.onclick = (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.act === 'scan') this.scan();
            else if (b.dataset.act === 'hidden') this.onPick('');
            else if (b.dataset.i) this.onPick(this.nets[parseInt(b.dataset.i, 10)].name);
            this.render();
        };
        const links = `<div class="wifi-near-links">
            <button type="button" class="wiz-link" data-act="hidden">${tr('WIFI_HIDDEN_NET')}</button>
            <button type="button" class="wiz-link" data-act="scan">${tr('BT_RESCAN')}</button></div>`;
        if (this.nets === undefined) {
            box.innerHTML = `<p class="gen-tile-desc">${tr('CONNEXION_NEAR_IDLE')}</p>
            <button type="button" class="gen-btn gen-btn-primary" data-act="scan"><svg><use href="#svg-search"></use></svg><span>${tr('CONNEXION_FIND_WIFI')}</span></button>`;
        } else if (this.nets === null) {
            box.innerHTML = `<p class="wifi-near-wait"><span class="wiz-spin"></span>${tr('WAIT_MSG_SCANNING')}</p>`;
        } else if (!this.nets.length) {
            box.innerHTML = `<p class="gen-tile-desc">${tr('ERR_NO_WIFI_FOUND')}</p>${links}`;
        } else {
            const cur = this.picked();
            box.innerHTML = `<div class="wifi-near-list">${this.nets.map((ap, i) => {
                const lvl = wifi.calcWaveStrength(ap.strength), on = ap.name === cur;
                const q = tr(lvl >= 2 ? 'CONNEXION_SIGNAL_GOOD' : lvl === 1 ? 'CONNEXION_SIGNAL_MEDIUM' : 'CONNEXION_SIGNAL_BAD');
                return `<button type="button" class="wifi-near-net${on ? ' on' : ''}" aria-pressed="${on}" data-i="${i}">
                <span class="wifi-near-bars lvl-${lvl}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                <span class="wifi-near-text"><b>${escHtml(ap.name)}</b><small>${q}</small></span></button>`;
            }).join('')}</div>${links}`;
        }
    }
}
