class Wifi {
    initialized = false;
    ethBoardTypes = [];
    ethClockModes = [];
    ethPhyTypes = [];

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
    }
    updateEthernetSummary(pinKey, value) {
        const targetLabel = pinKey.replace('Pin', '').toUpperCase() + ':';
        document.querySelectorAll('#divEthernetSummary .gpioRadio-label').forEach(lbl => {
            const text = lbl.textContent.trim();
            if (text === targetLabel) {
                const valSpan = lbl.nextElementSibling;
                if (valSpan && valSpan.classList.contains('gpioRadio-val')) {
                    valSpan.textContent = (value === -1 || value === 'None') ? 'None' : `GPIO${value}`;
                }
            }
        });
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
            this.updateEthernetSummary('PWRPin', 0);
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

        this.updateEthernetSummary(pinKey, newValue);
    }
    setPowerToNone() {
        const inputPwr = get('inputETHPWRPin');
        if (!inputPwr) return;
        if (inputPwr.value === 'None') {
            inputPwr.type = 'number';
            inputPwr.value = 0;
            inputPwr.dispatchEvent(new Event('change', { bubbles: true }));
            this.updateEthernetSummary('PWRPin', 0);
            this.togglePowerIcon(false);
            return;
        }
        inputPwr.type = 'text';
        inputPwr.value = -1;
        inputPwr.dispatchEvent(new Event('change', { bubbles: true }));
        inputPwr.type = 'text';
        inputPwr.value = 'None';

        this.updateEthernetSummary('PWRPin', -1);
        this.togglePowerIcon(true); // Mode None -> Icône OFF
    }
    loadNetwork() {
        let pnl = get('divNetAdapter');
        getJSONSync('/networksettings', (err, settings) => {
            if (err) {
                ui.serviceError(err);
                return;
            }

            // 1. Configuration des boutons switch globaux (Connexion & Fallback)
            get('cbHardwired').checked = settings.connType >= 2;
            get('cbFallbackWireless').checked = settings.connType === 3;

            // Injection des données réseau dans le panneau principal
            ui.toElement(pnl, settings);

            // 2. Gestion de la broche d'alimentation Ethernet (PWRPin)
            const inputPwr = get('inputETHPWRPin');
            if (inputPwr && settings.ethernet && settings.ethernet.PWRPin !== undefined) {
                const pwrVal = parseInt(settings.ethernet.PWRPin, 10);
                const isNone = (pwrVal === -1);

                if (isNone) {
                    inputPwr.type = 'text';
                    inputPwr.value = 'None';
                } else {
                    inputPwr.type = 'number';
                    inputPwr.value = pwrVal;
                }
                this.togglePowerIcon(isNone);
                this.updateEthernetSummary('PWRPin', pwrVal);
            }

            // 3. Sauvegarde locale des données IP pour l'overlay DHCP
            this._ipData = settings.ip || { dhcp: true, ip: '', subnet: '', gateway: '', dns1: '', dns2: '' };
            // Le serveur ne renvoie jamais les secrets réels, seulement s'ils sont définis :
            // les champs de saisie correspondants démarrent donc toujours vides.
            this._hasApPassword = !!(settings.wifi && settings.wifi.hasApPassword);
            this._hasPassphrase = !!(settings.wifi && settings.wifi.hasPassphrase);

            // 4. Mise à jour de l'interface et des badges
            this.updateDHCPBadge(this._ipData.dhcp);
            get('divETHSettings').style.display = settings.ethernet.boardType === 0 ? '' : 'none';
            get('spanCurrentIP').innerHTML = this._ipData.ip;

            // 5. Synchronisation des comportements UI restants
            this.updateStatusBadge(settings);
            this.setConnectionType(settings.connType >= 2);
            this.useEthernetClicked();
            this.hiddenSSIDClicked();

            // =========================================================================
            // 6. Écouteurs d'événements pour les nouveaux boutons d'action Wi-Fi
            // =========================================================================
            const btnScan = get('btnOpenScanWifi');
            if (btnScan) {
                btnScan.onclick = () => {
                    this.wifiOverlay(tr('CONNEXION_MODAL_SELECT_TITLE'), false);
                };
            }

            const btnManual = get('btnOpenManualWifi');
            if (btnManual) {
                btnManual.onclick = () => {
                    this.wifiOverlay(tr('CONNEXION_MODAL_SELECT_M_TITLE'), true);
                };
            }

            watchDirty(pnl);
        });
    }
    updateStatusBadge(settings) {
        const wifiBadge = document.getElementById('wifiBadge');

        if (wifiBadge) {
            if (this.isHotspot) {
                wifiBadge.textContent = "AP";
                wifiBadge.setAttribute('data-conn', 'hotspot');
                wifiBadge.setAttribute('title', tr('TOPBAR_TOOLTIP_AP'));
            } else {
                wifiBadge.textContent = "WIFI";
                wifiBadge.setAttribute('data-conn', 'wifi');
                wifiBadge.setAttribute('title', tr('TOPBAR_TOOLTIP_WIFI'));
            }
        }
        const options = document.querySelectorAll('.opt-badge');
        if (!options.length) return;

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
        options.forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-conn') === activeType);
        });
        // Le MODE actif vient des réglages (connType + profil Ethernet) et ne change qu'ici ;
        // l'ÉTAT du lien, lui, arrive par les évènements socket (cf. updateMobileNetStatus).
        this._netType = activeType;
        this.updateMobileNetStatus();
    }
    // Indicateur réseau de l'en-tête mobile. Deux sources distinctes, volontairement : le mode
    // détermine l'icône, l'état du lien détermine la couleur de la pastille. Les deux
    // procWifiStrength()/procEthernet() sont aussi ce que socket.onclose force à "déconnecté", donc
    // une perte de connexion allume le rouge sans traitement supplémentaire.
    updateMobileNetStatus() {
        const use = get('mobileNetIcon'), dot = get('mobileNetDot'), wrap = get('mobileNetStatus');
        if (!use || !dot) return;
        const type = this._netType || (this.isHotspot ? 'hotspot' : 'wifi');
        const ICONS = { hotspot: '#svg-hotspot', wifi: '#svg-wifi', lan: '#svg-ethernet', poe: '#svg-ethernet0' };
        use.setAttribute('href', ICONS[type] || '#svg-wifi');

        // Le hotspot est monté par l'appareil lui-même : il n'y a pas de lien distant à perdre,
        // donc jamais d'état "déconnecté" à signaler pour ce mode.
        const up = (type === 'hotspot') ? true
                 : (type === 'wifi') ? !!this._wifiLinkUp
                 : !!this._ethLinkUp;
        dot.classList.toggle('is-up', up);
        dot.classList.toggle('is-down', !up);
        if (wrap) {
            const label = (type === 'hotspot') ? 'HOTSPOT' : type.toUpperCase();
            wrap.setAttribute('title', `${label} — ${tr(up ? 'NET_STATUS_UP' : 'NET_STATUS_DOWN')}`);
        }
    }
    setConnectionType(isEthernet) {
        this.useEthernetClicked();
    }
    useEthernetClicked() {
        let useEthernet = get('cbHardwired').checked;

        get('divWiFiMode').style.display = useEthernet ? 'none' : '';
        get('divRoaming').style.display = useEthernet ? 'none' : '';
        get('divHiddenSSID').style.display = useEthernet ? 'none' : '';
        get('divEthernetSection').style.display = useEthernet ? '' : 'none';
        get('divEthernetMode').style.display = useEthernet ? '' : 'none';
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

    apPasswordOverlay() {
        if (get('divAPPasswordOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divAPPasswordOverlay';
        div.className = 'modal-overlay';

        div.innerHTML = `
        <div class="message-content apPassword-content">
        ${modalHeader('CONNEXION_AP_TITLE', 'svg-hotspot', {
            subtitle: 'AP_MODAL_TITLE_DESC',
        })}

        <div class="overlay-scroll-content">
        <div class="uniblocCol">
        <p>${tr('AP_MODAL_DESC')}</p>
        </div>
        <div class="uniblocCol dirty-target">
        <label class="label" for="fldAPPassword">${tr('CONNEXION_AP_PASSWORD')}</label>
        <div class="password-container">
        <input id="fldAPPassword" class="inputAndSelect" name="apPassword" type="password" minlength="8" maxlength="63" placeholder="${tr('SECURITY_PASSWORD_PLH_SIMPLE')}">
        <div class="password-eye" onclick="security.toggleFieldPassword('fldAPPassword', this)"><svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg></div>
        </div>
        </div>
        <div class="warning">
        <div class="warning-header">
        <svg><use href="#svg-warning"></use></svg>
        <b>${tr('MSG_WARNING')}</b>
        </div>
        <div class="information-text">
        <span>${tr('AP_MODAL_WARNING')}</span>
        </div>
        </div>
        </div>
        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnAPPasswordClose" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnSaveAPPassword" type="button">
        <svg><use href="#svg-save"></use></svg>
        <span>${tr('BT_SAVE')}</span>
        </button>
        </div>
        </div>
        </div>`;

        shOverlay(div);
        initSecretField(div.querySelector('#fldAPPassword'), this._hasApPassword);
        watchDirty(div);

        div.querySelector('#btnAPPasswordClose').onclick = () => confirmDiscardChanges(() => closeOverlay(div));
        div.querySelector('#btnSaveAPPassword').onclick = () => this.saveAPPassword(div);
    }
    saveAPPassword(overlayEl) {
        if (!overlayEl) overlayEl = get('divAPPasswordOverlay');
        if (!overlayEl) return;

        // Chaîne vide si le masque factice n'a jamais été effacé (= non modifié).
        const pwd = secretValue(overlayEl.querySelector('#fldAPPassword'));

        if (pwd.length > 0 && pwd.length < 8) {
            ui.errorMessage(tr('ERR_AP_PASSWORD_INVALID'), tr('ERR_AP_PASSWORD_INVALID_DESC'));
            return;
        }

        putJSONSync('/setNetwork', { wifi: { apPassword: pwd } }, (err, response) => {
            if (err) {
                ui.serviceError(err);
            } else {
                if (pwd.length > 0) this._hasApPassword = true;
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                clearDirty();
                closeOverlay(overlayEl);
            }
        });
    }
    // onCapture (facultatif) fait basculer la modale en mode CAPTURE : "Confirmer" retient le
    // réseau et rend la main à l'appelant au lieu d'enchaîner sur l'enregistrement. Utilisé par
    // l'assistant de premier démarrage, où l'Ethernet et le Wi-Fi de secours doivent partir dans un
    // seul /setNetwork (cf. Onboarding._openWifiCapture()) -- et où c'est donc le pied de la carte,
    // pas cette modale, qui conclut. Rien à capturer explicitement : les identifiants sont déjà
    // recopiés en direct dans #fldSsid/#fldPassphrase par les oninput ci-dessous et par
    // selectSSID(), et ni cancelScan() ni closeOverlay() ne les effacent.
    wifiOverlay(modalTitle, startAtPage2 = false, onCapture = null) {
        if (get('divWifiScanOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divWifiScanOverlay';
        div.className = 'modal-overlay';

        div.innerHTML = `
        <div class="message-content wifiOverlay-content">
        ${modalHeader(modalTitle, 'svg-wifi', {
            subtitle: startAtPage2 ? 'CONNEXION_MODAL_SELECT_M_DESC' : 'CONNEXION_MODAL_SELECT_DESC',
            rightContent: `<!-- Ton contenu de droite si nécessaire -->`
        })}
        <!-- Seule cette zone défile -- le header et le pied de page restent fixes, comme sur
        les autres modal-overlay (cf. apPasswordOverlay/ledOverlay). -->
        <div class="overlay-scroll-content">
        <!-- CARROUSEL CONTAINER -->
        <div id="wifiCarousel">
        <!-- PAGE 1 : Liste des réseaux -->
        <div id="wifiPage1" class="wifiChoosePage">
        <div class="blocdivApsOverlay"><div id="divApsOverlay" data-lastloaded="0"></div></div>
        <div class="divbtsTButton">
        <button id="btnManualWifi" type="button" btsText><svg><use href="#svg-add"></use></svg><span>${tr("BT_ADD_MANUAL")}</span></button>
        <button id="btnRefreshWifiInModal" type="button" btsText><svg><use href="#svg-retry"></use></svg><span>${tr("BT_RETRY")}</span></button>
        </div>
        </div>

        <!-- PAGE 2 : Saisie SSID & Mot de passe -->
        <div id="wifiPage2" class="wifiChoosePage">
        <!-- On affiche le bouton Retour UNIQUEMENT si on n'a pas démarré directement à la page 2 -->
        <div class="marginB" style="display: ${startAtPage2 ? 'none' : 'flex'};">
        <button id="btnModalBackToPage1" type="button" btsText><svg><use href="#svg-arrowLeft"></use></svg><span>${tr("BT_GO_BACK")}</span></button>
        </div>
        <!-- Marge de compensation si le bouton retour est masqué -->
        <div style="height: ${startAtPage2 ? '25px' : '0px'};"></div>
        <!-- Bloc des inputs -->
        <div class="baseFlexCol">
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-ssid"></use></svg></div>
        <div class="unifield-content" style="width: 100%;">
        <label class="label">${tr("CONNEXION_WIFI_SSID")}</label>
        <input id="modalFldSsid" class="inputAndSelect" type="text" tr="CONNEXION_WIFI_ENTER_SSID" placeholder="Entrer votre SSID">
        </div>
        </div>
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-lock"></use></svg></div>
        <div class="unifield-content">
        <label class="label">${tr("SECURITY_PASSWORD")}</label>
        <input id="modalFldPassphrase" class="inputAndSelect" type="password" placeholder="${tr("SECURITY_PASSWORD_PLH")}">
        <div class="password-eye" onclick="security.toggleFieldPassword('modalFldPassphrase', this)">
        <svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg>
        </div>
        </div>
        </div>
        </div>
        </div>
        </div>
        </div>
        <!-- Pied de page commun aux 2 pages : hors du carrousel qui glisse (donc fixe, comme
        sur les autres modal-overlay), son contenu bascule au fil de slideCarousel(). -->
        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal" id="wifiFooterPage1">
        <button id="btnWifiGoBack" line type="button">${tr('BT_CLOSE')}</button>
        </div>
        <div class="button-content-modal" id="wifiFooterPage2" style="display: none;">
        <button id="btnModalCancelWifi2" line type="button">${tr('BT_CANCEL_1')}</button>
        <button id="btnModalSaveWifi" type="button"><svg><use href="#svg-succes"></use></svg><span>${tr("BT_CONFIRM")}</span></button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);
        watchDirty(div);

        get('btnRefreshWifiInModal').onclick = () => this.loadAPs(true);
        // cancelScan() route désormais elle-même via requestCloseOverlay(), qui appelle
        // confirmDiscardChanges() en interne (donc l'alerte "modifications non enregistrées"
        // reste posée exactement comme avant) tout en respectant en plus le verrou de scan en
        // cours (cf. setOverlayLock() dans loadAPs()) -- plus besoin de l'enrober ici.
        get('btnWifiGoBack').onclick = () => this.cancelScan();
        get('btnManualWifi').onclick = () => {
            this.setupManualInputMode();
            this.slideCarousel(1);
            setTimeout(() => { get('modalFldSsid').focus(); }, 350);
        };
        get('btnModalBackToPage1').onclick = () => this.slideCarousel(0);

        const btnCancel2 = get('btnModalCancelWifi2');
        if (btnCancel2) {
            btnCancel2.onclick = () => this.cancelScan();
        }

        get('btnModalSaveWifi').onclick = () => {
            const ssidVal = get('modalFldSsid').value || '';
            const passVal = get('modalFldPassphrase').value || '';

            if (!ssidVal.trim()) {
                ui.errorMessage(tr('ERR_WIFI_SSID_INVALID'));
                return;
            }
            if (ssidVal.length > 64) {
                ui.errorMessage(tr('ERR_WIFI_SSID_INVALID'), tr('ERR_WIFI_SSID_MAX_LENGTH_64'));
                return;
            }
            if (passVal.length > 64) {
                ui.errorMessage(tr('ERR_WIFI_PASSPHRASE_INVALID'), tr('ERR_WIFI_PASSPHRASE_MAX_LENGTH_64'));
                return;
            }

            this.cancelScan();
            if (typeof onCapture === 'function') { onCapture(); return; }
            // window.__currentHostname vient de /loginContext, donc disponible dès le boot -- y
            // compris pendant l'onboarding, où window.settings n'a jamais été chargé (la page
            // Système n'est pas atteinte) et retombait donc systématiquement sur le nom générique.
            const currentHostname = window.__currentHostname || (window.settings && window.settings.hostname) || 'espsomfyrts';
            this.networkConfirmationOverlay(currentHostname);
        };

        get('modalFldSsid').oninput = (e) => {
            const realSsid = document.getElementsByName('ssid')[0];
            if (realSsid) {
                realSsid.value = e.target.value;
                realSsid.dispatchEvent(new Event('input'));
            }
        };
        get('modalFldPassphrase').oninput = (e) => {
            const realPass = document.getElementsByName('passphrase')[0];
            if (realPass) {
                realPass.value = e.target.value;
                realPass.dispatchEvent(new Event('input'));
            }
        };

        if (startAtPage2) {
            this.setupManualInputMode();
            const carousel = get('wifiCarousel');
            carousel.style.transition = 'none';
            this.slideCarousel(1);
            setTimeout(() => {
                carousel.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
                get('modalFldSsid').focus();
            }, 50);
        } else {
            this.loadAPs(true);
        }
    }
    setupManualInputMode() {
        const modalSsid = get('modalFldSsid');
        if (modalSsid) {
            modalSsid.value = document.getElementsByName('ssid')[0]?.value || '';
            modalSsid.removeAttribute('readonly');
            modalSsid.style.opacity = '1';
            modalSsid.style.background = 'none';
        }
        const modalPass = get('modalFldPassphrase');
        if (modalPass) {
            modalPass.value = document.getElementsByName('passphrase')[0]?.value || '';
        }
    }
    slideCarousel(pageIndex) {
        const carousel = get('wifiCarousel');
        if (carousel) {
            carousel.style.transform = `translateX(-${pageIndex * 50}%)`;
        }
        // Le pied de page est commun aux 2 pages (hors du carrousel) : on bascule son contenu en
        // même temps que la page affichée.
        const footer1 = get('wifiFooterPage1');
        const footer2 = get('wifiFooterPage2');
        if (footer1) footer1.style.display = pageIndex === 0 ? 'flex' : 'none';
        if (footer2) footer2.style.display = pageIndex === 1 ? 'flex' : 'none';
    }

    async loadAPs(forceLoader = false) {
        const btnScan = get('btnScanAPs');
        const divAps = get('divApsOverlay');
        if (!divAps) {
            this.wifiOverlay();
            return;
        }
        if (btnScan && btnScan.classList.contains('disabled')) return;

        divAps.innerHTML = `<div class="no-wifi"><div class="wifiConnectScan"><div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div></div><div class="loadAPScan">${tr("WAIT_MSG_SCANNING")}</div></div>`;

        if (btnScan) btnScan.classList.add('disabled');

        const overlay = get('divWifiScanOverlay');
        // Scan court et autonome (pas de commande à annuler côté device) : verrou 'confirm' plutôt
        // que 'hard', juste pour éviter qu'un clic accidentel sur le fond referme l'overlay pendant
        // ce court instant sans que l'utilisateur s'en rende compte.
        setOverlayLock(overlay, 'confirm', {
            onConfirm: () => { if (btnScan) btnScan.classList.remove('disabled'); },
            titleKey: 'PROMPT_WIFI_SCAN_TITLE',
            msgKey: 'PROMPT_WIFI_SCAN_MSG',
        });

        // Le scan Wi-Fi est désormais bloquant côté device (WebNetwork::handleScanAps, comme
        // /getReleases pour GitHub) : un seul appel, réponse complète directement, plus de statut
        // "scanning" à repoller.
        setTimeout(() => {
            getJSON('/scanaps', (err, aps) => {
                if (err) logger.error('Wi-Fi scan failed:', err);
                else logger.debug('Wi-Fi scan found', aps?.accessPoints?.length || 0, 'access points');

                if (btnScan) btnScan.classList.remove('disabled');
                clearOverlayLock(overlay);
                if (err || !aps || !aps.accessPoints) {
                    this.displayAPs({ accessPoints: [] });
                } else {
                    this.displayAPs(aps);
                }
            });
        }, forceLoader ? 100 : 0);
    }

    displayAPs(aps) {
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

        let div = "";
        if (nets.length > 0) {
            for (let i = 0; i < nets.length; i++) {
                let ap = nets[i];
                div += `<div class="network-wifi-row" onclick="wifi.selectSSID(this);" data-channel="${ap.channel}" data-encryption="${ap.encryption}" data-strength="${ap.strength}" data-mac="${ap.macAddress}"><span class="ssid">${ap.name}</span><span class="strength">${this.displaySignal(ap.strength)}</span></div>`;
            }
        } else {
            div = `<div class="no-wifi"><div>${tr("ERR_NO_WIFI_FOUND")}</div></div>`;
        }

        let divAps = get('divApsOverlay');
        if (divAps) {
            divAps.setAttribute('data-lastloaded', new Date().getTime());
            divAps.innerHTML = div;
        }
    }
    cancelScan() {
        const overlay = get('divWifiScanOverlay');
        if (!overlay) return;
        clearDirty(overlay);
        // Le retrait de la classe 'disabled' de #btnScanAPs pendant un scan actif est désormais
        // géré par le onConfirm du verrou (cf. setOverlayLock() dans loadAPs()) : requestCloseOverlay()
        // ne l'exécute qu'une fois la fermeture réellement confirmée/effective.
        requestCloseOverlay(overlay);
    }
    selectSSID(el) {
        let obj = {
            name: el.querySelector('span.ssid').innerHTML,
            encryption: el.getAttribute('data-encryption'),
            strength: parseInt(el.getAttribute('data-strength'), 10),
            channel: parseInt(el.getAttribute('data-channel'), 10)
        };
        logger.debug('SSID selected:', obj);
        const realSsidField = document.getElementsByName('ssid')[0];
        if (realSsidField) {
            realSsidField.value = obj.name;
            realSsidField.dispatchEvent(new Event('input'));
        }
        const modalSsidField = get('modalFldSsid');
        if (modalSsidField) {
            modalSsidField.value = obj.name;
        }
        const realPassField = document.getElementsByName('passphrase')[0];
        const modalPassField = get('modalFldPassphrase');
        if (realPassField && modalPassField) {
            modalPassField.value = realPassField.value;
        }
        this.slideCarousel(1);
        setTimeout(() => {
            if (modalPassField) modalPassField.focus();
        }, 350);
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
        <input id="txtConfirmHostname" class="inputAndSelect" type="text" length="32" value="${host}">
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
            if (hostFld && (!hostVal || !/^[a-zA-Z0-9-]+$/.test(hostVal) || hostVal.length > 32)) {
                ui.errorMessage(tr('ERR_HOSTNAME'), tr('ERR_HOSTNAME_CHARS'));
                return;
            }
            // On ne ferme plus la fenêtre : l'ESP32 enregistre puis redémarre son réseau, donc la
            // connexion va être coupée. On affiche un indicateur de chargement à la place pour que
            // l'utilisateur comprenne que quelque chose est en cours plutôt que de croire à un bug.
            get('btnConfirmNetCancel').disabled = true;
            get('btnConfirmNetSave').disabled = true;
            // La sauvegarde réseau déclenche un ui.successMessage() qui appelle ui.clearErrors() :
            // celle-ci ne ferme que les modales d'ALERTE (cf. 30-ui-binder.js), donc cette fenêtre
            // reste affichée le temps que l'ESP32 termine réellement de basculer de réseau.
            ui.waitMessage(div, 'WAIT_MSG_NET_SWITCH');
            // Ethernet : l'objet réseau est déjà constitué (cf. saveNetwork()), on l'envoie tel
            // quel. Wi-Fi : on repasse par saveNetwork(), qui relit les champs à cet instant.
            const proceed = () => {
                if (pendingObj) this.sendNetworkSettings(pendingObj);
                else if (this.saveNetwork) this.saveNetwork();
            };
            // Le nom d'hôte part AVANT /setNetwork : ce dernier peut programmer un redémarrage
            // (cf. Web.cpp) qui couperait la session en cours et ferait perdre la valeur saisie.
            if (hostVal && hostVal !== (window.__currentHostname || '')) {
                putJSONSync('/setgeneral', { hostname: hostVal }, (err) => {
                    if (err) logger.error('Failed to save hostname from network confirmation:', err);
                    else window.__currentHostname = hostVal;
                    proceed();
                });
            }
            else proceed();
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
    displaySignal(sig) {
        let level = this.calcWaveStrength(sig);
        if (level > 3) level = 3;

        // Détermination de la couleur en fonction du niveau, mêmes variables --color-signal-*
        // que #divWiFiStrength (main.css) -- pas de --sig-*-color, qui n'existe nulle part et
        // laissait ces icônes sans couleur (fill invalide).
        let colorSuffix = 'bad';
        if (level >= 2) colorSuffix = 'good';
        else if (level === 1) colorSuffix = 'medium';

        const getPart = (idNum) => {
            const active = idNum <= level;
            const fillColor = active ? `var(--color-signal-${colorSuffix})` : '#ccc';
            return `<use href="#svg-wifi-${idNum}" fill="${fillColor}" style="opacity:${active ? '1' : '0.3'}" />`;
        };

        return `
        <div class="signal">
        <svg>
        ${getPart(0)}
        ${getPart(1)}
        ${getPart(2)}
        ${getPart(3)}
        </svg>
        </div>`;
    }

    DHCPOverlay() {
        // Évite les doublons d'overlay
        if (get('divDHCPOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divDHCPOverlay';
        div.className = 'inst-overlay'; // Utilise le style d'overlay étendu

        div.innerHTML = `
        <div class="instructions-content overlaydhcp" id="divDHCPPopupContent">

        ${overlayHeader("CONNEXION_DHCP", "CONNEXION_DHCP_DESC", "svg-hostName")}

        <div class="overlay-scroll-content" id="divDHCPScrollContent">

        <div class="unibloc-container">
        <div class="uniValue" tr="CONNEXION_DHCP_DESC">Obtenir une adresse IP automatiquement depuis le routeur.</div>

        <div class="SwitchBig">
        <input id="cbPopupDHCP" type="checkbox" name="dhcp" data-bind="ip.dhcp"/>
        <label for="cbPopupDHCP" class="label-left" >${tr('CONNEXION_BADGE_STATIC')}</label>
        <label for="cbPopupDHCP" class="label-right" >${tr('CONNEXION_BADGE_DHCP')}</label>
        <div class="nav-pill"></div>
        </div>
        </div>

        <div id="divPopupStaticIP" style="display: none; margin-top: 15px;">
        <div class="uniblocCol">

        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-ip"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldIPAddress" tr="DHCP_OVERLAY_STATIC_IP"></label>
        <input id="fldIPAddress" class="inputAndSelect" name="staticIP" type="text" data-bind="ip.ip" length=32 placeholder="0.0.0.0">
        </div>
        </div>

        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-gatewayMask"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldSubnetMask" tr="DHCP_OVERLAY_SUBNET_MASK"></label>
        <input id="fldSubnetMask" class="inputAndSelect" name="subnet" type="text" data-bind="ip.subnet" length=32 placeholder="0.0.0.0">
        </div>
        </div>

        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-gateway"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldGateway" tr="DHCP_OVERLAY_GATEWAY"></label>
        <input id="fldGateway" class="inputAndSelect" name="gateway" type="text" data-bind="ip.gateway" length=32 placeholder="0.0.0.0">
        </div>
        </div>

        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-dns1"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldDNS1" tr="DHCP_OVERLAY_DNS1"></label>
        <input id="fldDNS1" class="inputAndSelect" name="dns1" type="text" data-bind="ip.dns1" length=32 placeholder="0.0.0.0">
        </div>
        </div>

        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-dns2"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldDNS2" tr="DHCP_OVERLAY_DNS2"></label>
        <input id="fldDNS2" class="inputAndSelect" name="dns2" type="text" data-bind="ip.dns2" length=32 placeholder="0.0.0.0">
        </div>
        </div>

        </div>
        </div>

        <div class="information">
        <div class="information-header">
        <svg><use href="#svg-info"></use></svg>
        <b>${tr('MSG_INFO')}</b>
        </div>
        <div class="information-text">
        <span>${tr('DHCP_OVERLAY_REBOOT_INFO')}</span>
        </div>
        </div>

        </div>
        <div class="hrDivFooter"></div>
        <div class="button-container-overlay">
        <button id="btnDHCPGoBack" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnPopupSaveIPSettings" type="button">
        <svg><use href="#svg-save"></use></svg>
        <span>${tr('BT_SAVE')}</span>
        </button>
        </div>

        </div>`;

        // Affiche l'overlay à l'écran
        shOverlay(div);

        // Initialisation du data-binding (calqué sur ton système, utilise tes variables de stockage globales ou locales)
        ui.toElement(div, { ip: this._ipData || { dhcp: true, ip: '', subnet: '', gateway: '', dns1: '', dns2: '' } });
        watchDirty(div);

        const cbDHCP = div.querySelector('#cbPopupDHCP');
        const divStatic = div.querySelector('#divPopupStaticIP');

        // Fonction interne pour masquer/afficher le bloc IP statique selon l'état du switch
        const toggleStaticFields = (isDhcpEnabled) => {
            divStatic.style.display = isDhcpEnabled ? 'none' : 'block';
        };

        // Initialisation de l'affichage au chargement du modal
        if (cbDHCP) {
            toggleStaticFields(cbDHCP.checked);

            // Événement lors du clic sur le switch DHCP
            cbDHCP.onclick = (e) => {
                toggleStaticFields(e.target.checked);
            };
        }

        // Gestion de la fermeture (Bouton Fermer)
        div.querySelector('#btnDHCPGoBack').onclick = () => confirmDiscardChanges(() => closeOverlay(div));

        // Gestion de la sauvegarde (Bouton Enregistrer)
        div.querySelector('#btnPopupSaveIPSettings').onclick = () => {
            clearDirty();
            // Appelle ta fonction existante de sauvegarde
            this.saveIPSettings();
            // Ferme le modal après enregistrement
            closeOverlay(div);
        };
    }

    updateDHCPBadge(isDhcp) {
        const badge = get('badgeDHCPState');
        if (badge) {
            if (isDhcp) {
                badge.innerText = tr('CONNEXION_BADGE_DHCP');
            } else {
                badge.innerText = tr('CONNEXION_BADGE_STATIC');
            }
        }
    }

    saveIPSettings() {
        let overlay = get('divDHCPOverlay');
        if (!overlay) return;

        // Correction de 'pnl' -> 'overlay'
        let obj = ui.fromElement(overlay).ip;
        logger.debug('Saving IP settings:', obj);

        if (!obj.dhcp) {
            let fnValidateIP = (addr) => {
                return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(addr);
            };

            if (typeof obj.ip !== 'string' || obj.ip.length === 0 || obj.ip === '0.0.0.0') {
                ui.errorMessage(tr('ERR_STATIC_IP_REQUIRED'));
                return;
            }
            else if (!fnValidateIP(obj.ip)) {
                ui.errorMessage(tr('ERR_STATIC_IP_INVALID'));
                return;
            }
            if (typeof obj.subnet !== 'string' || obj.subnet.length === 0 || obj.subnet === '0.0.0.0') {
                ui.errorMessage(tr('ERR_NETMASK_REQUIRED'));
                return;
            }
            else if (!fnValidateIP(obj.subnet)) {
                ui.errorMessage(tr('ERR_NETMASK_INVALID'));
                return;
            }
            if (typeof obj.gateway !== 'string' || obj.gateway.length === 0 || obj.gateway === '0.0.0.0') {
                ui.errorMessage(tr('ERR_GATEWAY_REQUIRED'));
                return;
            }
            else if (!fnValidateIP(obj.gateway)) {
                ui.errorMessage(tr('ERR_GATEWAY_INVALID'));
                return;
            }
            if (obj.dns1.length !== 0 && !fnValidateIP(obj.dns1)) {
                ui.errorMessage(tr('ERR_DNS1_INVALID'));
                return;
            }
            if (obj.dns2.length !== 0 && !fnValidateIP(obj.dns2)) {
                ui.errorMessage(tr('ERR_DNS2_INVALID'));
                return;
            }
        }

        putJSONSync('/setIP', obj, (err, response) => {
            if (err) {
                ui.serviceError(err);
            } else {
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                logger.debug('IP settings saved:', response);

                // SAUVEGARDE RÉUSSIE :
                this._ipData = obj; // On synchronise notre variable locale
                this.updateDHCPBadge(obj.dhcp); // On actualise le badge sur le bouton principal
                closeOverlay(overlay); // Fermeture propre du modal
            }
        });
    }

    saveNetwork() {
        let pnl = get('divNetAdapter'), obj = ui.fromElement(pnl);

        // --- SÉCURISATION DE LA LECTURE DU TYPE DE CONNEXION ---
        // On s'assure d'avoir l'objet ethernet initié
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

        // On force la valeur de hardwired en lisant l'état réel de la checkbox dans le DOM
        const cbHardwired = get('cbHardwired');
        if (cbHardwired) {
            obj.ethernet.hardwired = cbHardwired.checked;
        }

        const eth = obj.ethernet;

        // Si la valeur extraite est NaN, vide ou "None", on la remet proprement à -1
        if (isNaN(eth.PWRPin) || eth.PWRPin === 'None' || eth.PWRPin === '') {
            eth.PWRPin = -1;
        }

        // Calcul du connType (Sera désormais correctement >= 2 si Ethernet est sélectionné)
        obj.connType = eth.hardwired ? (eth.wirelessFallback ? 3 : 2) : 1;

        // Ethernet : parcours en DEUX temps. D'abord un récapitulatif matériel dédié
        // (ethernetConfirmationOverlay) pour relire les broches GPIO, puis seulement la modale
        // finale d'enregistrement commune au Wi-Fi (nom d'hôte + adresses d'accès). Le boîtier
        // BOX-ETH court-circuite le récapitulatif : câblage fixe et validé, il n'y a rien à
        // relire -- il rejoint donc directement la modale finale.
        if (obj.connType >= 2) {
            const container = get('divContainer');
            const isBOXEth = container && container.getAttribute('data-hardwareprofile') === 'BOX-ETH';
            if (isBOXEth) this.networkConfirmationOverlay(this._currentHostname(), obj);
            else this.ethernetConfirmationOverlay(obj);
            return;
        }
        this.sendNetworkSettings(obj);
    }
    _currentHostname() {
        return window.__currentHostname || (window.settings && window.settings.hostname) || 'espsomfyrts';
    }
    // Étape intermédiaire du parcours Ethernet : récapitulatif en lecture seule de la
    // configuration matérielle retenue, pour que l'utilisateur relise les broches GPIO avant
    // d'aller plus loin. Purement informatif -- l'ancienne case à cocher de sécurité, qui
    // maintenait le bouton désactivé tant qu'elle n'était pas cochée, a été retirée. "Confirmer"
    // enchaîne sur la modale finale d'enregistrement (networkConfirmationOverlay).
    ethernetConfirmationOverlay(obj) {
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

        get('btnEthConfirmCancel').onclick = () => closeOverlay(div);
        get('btnEthConfirmNext').onclick = () => {
            closeOverlay(div);
            this.networkConfirmationOverlay(this._currentHostname(), obj);
        };
    }
    // Récapitulatif en lecture seule de la configuration Ethernet retenue.
    _ethSummaryHtml(eth) {
        const board = this.ethBoardTypes.find(e => eth.boardType === e.val);
        const phy = this.ethPhyTypes.find(e => eth.phyType === e.val);
        const clk = this.ethClockModes.find(e => eth.CLKMode === e.val);
        const line = (labelKey, value) => `<div class="eth-setting-line"><label>${tr(labelKey)}</label><span>${value}</span></div>`;
        return `
        <div class="blocEthBoardSettings">
        <div>
        ${line("ETH_SETTINGS_BOARD_TYPE", `${board ? board.label : tr("MANUAL_SETTINGS")} [${board ? board.val : 0}]`)}
        ${line("ETH_SETTINGS_PHY_TYPE", `${phy ? phy.label : '---'} [${phy ? phy.val : 0}]`)}
        ${line("ETH_SETTINGS_PHY_ADDRESS", eth.phyAddress ?? 0)}
        ${line("ETH_SETTINGS_CLOCK_MODE", `${clk ? clk.label : '---'} [${clk ? clk.val : 0}]`)}
        ${line("ETH_SETTINGS_POWER_PIN", (eth.PWRPin === undefined || eth.PWRPin === -1) ? tr("NONE") : eth.PWRPin)}
        ${line("ETH_SETTINGS_MDC_PIN", eth.MDCPin ?? 0)}
        ${line("ETH_SETTINGS_MDIO_PIN", eth.MDIOPin ?? 0)}
        </div>
        </div>`;
    }
    sendNetworkSettings(obj) {
        // Enregistrer le réseau est l'action qui conclut RÉELLEMENT l'assistant de premier
        // démarrage : l'utilisateur valide par btnConfirmNetSave (Wi-Fi) ou btnSaveEthernet
        // (Ethernet), puis attend la bascule du hotspot vers le réseau local -- il ne repasse
        // jamais par "Ignorer", seule autre sortie de l'assistant, donc onboarding.skip() n'est
        // pas appelé. Tout ce qui doit être appliqué en fin d'assistant doit donc l'être ici aussi.
        const isOnboarding = isApMode && !window.__onboardingDone;
        const doSend = () => {
            putJSONSync('/setNetwork', obj, (err, response) => {
                if (err) {
                    ui.serviceError(err);
                    return;
                }
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                logger.debug("Network settings updated:", response);
                clearDirty();
            });
        };
        // Enregistrer un Wi-Fi depuis l'assistant de premier démarrage (mode AP) coupe le hotspot
        // pour rejoindre ce réseau -- l'utilisateur perdrait l'accès à toute étape restante du
        // wizard (Nom d'hôte/Sécurité/Terminer), qui n'existeront plus une fois basculé sur le
        // réseau local. On valide donc l'onboarding AVANT d'envoyer les paramètres réseau
        // (attendu, pour garantir l'ordre malgré deux requêtes distinctes) : l'appareil retrouve
        // directement le tableau de bord normal une fois reconnecté, plutôt que de rester en
        // attente d'une étape désormais inaccessible.
        if (isOnboarding) {
            // Sans réessai (markDone(0), le défaut) : la sauvegarde réseau enchaîne juste derrière
            // et ne peut pas s'offrir plusieurs secondes d'attente. En cas d'échec on envoie quand
            // même -- perdre le drapeau ne coûte qu'une réapparition de l'assistant.
            onboarding.markDone()
            .then(doSend)
            .catch(err => {
                logger.error('Failed to auto-complete onboarding before network save:', err);
                doSend();
            });
        } else {
            doSend();
        }
    }

    procWifiStrength(strength) {
        if (!strength) return;

        const ssid = strength.ssid || strength.name;
        const sVal = parseInt(strength.strength);
        const elSSID = get('spanNetworkSSID');
        const elChan = get('spanNetworkChannel');
        const elStrength = get('spanNetworkStrength');
        const elSvgCont = get('divWiFiStrength'); // On récupère le conteneur du SVG

        if (elSSID) elSSID.innerHTML = !ssid || ssid === '' ? '-------------' : ssid;
        if (elChan) elChan.innerHTML = isNaN(strength.channel) || strength.channel < 0 ? '--' : strength.channel;
        if (elStrength) elStrength.innerHTML = isNaN(sVal) || sVal <= -100 ? '----' : sVal;

        let level = (isNaN(sVal) || sVal >= 0 || sVal <= -100) ? -1 : this.calcWaveStrength(sVal);
        if (level >= 3) level = 3;

        // -100 dBm est la valeur que socket.onclose injecte pour signifier "plus de lien" : le même
        // test sert donc pour une vraie perte de signal et pour une coupure de la liaison socket.
        this._wifiLinkUp = level >= 0;
        this.updateMobileNetStatus();

        // 1. Mise à jour des vagues SVG (Actives vs Inactives)
        for (let i = 0; i <= 3; i++) {
            const part = get('wifi_' + i);
            if (part) {
                if (i <= level) {
                    part.classList.add('active');
                } else {
                    part.classList.remove('active');
                }
            }
        }

        // 2. --- GESTION DYNAMIQUE DES COULEURS (dBm & SVG) ---
        if (elStrength && elSvgCont) {
            // On nettoie d'abord les anciennes classes de couleur
            const classes = ['sig-good', 'sig-medium', 'sig-bad'];
            elStrength.classList.remove(...classes);
            elSvgCont.classList.remove(...classes);

            if (!isNaN(sVal) && sVal < 0 && sVal > -100) {
                // Excellent / Bon signal (Niveau 2 et 3) : sVal > -70 dBm
                if (level >= 2) {
                    elStrength.classList.add('sig-good');
                    elSvgCont.classList.add('sig-good');
                }
                // Signal moyen (Niveau 1) : sVal entre -70 et -80 dBm
                else if (level === 1) {
                    elStrength.classList.add('sig-medium');
                    elSvgCont.classList.add('sig-medium');
                }
                // Signal mauvais (Niveau 0 ou -1) : sVal <= -80 dBm
                else {
                    elStrength.classList.add('sig-bad');
                    elSvgCont.classList.add('sig-bad');
                }
            }
        }
    }
    procEthernet(ethernet) {
        logger.debug('Ethernet status:', ethernet);
        const spanStatus = get('spanEthernetStatus');
        const divStatus = get('divEthernetStatus');
        const divWifi = get('divWiFiStrength');
        const spanSpeedVal = get('spanEthernetSpeedVal');
        const spanSpeedDetails = get('spanEthernetSpeedDetails');

        const isConnected = ethernet.connected;
        this._ethLinkUp = !!isConnected;
        this.updateMobileNetStatus();

        // 1. Affichage des blocs principaux
        // 1. Affichage des blocs principaux (Sécurisé !)
        if (divStatus) divStatus.style.display = isConnected ? '' : 'none';
        if (divWifi) divWifi.style.display = isConnected ? 'none' : '';

        spanStatus.innerHTML = isConnected ? 'Connected' : 'Disconnected';
        spanStatus.style.color = isConnected ? 'var(--color-signal-good)' : '';

        // 3. Gestion dynamique des couleurs (Icône & Vitesse)
        if (isConnected) {
            // L'icône générale de la ligne Ethernet s'allume en vert
            divStatus.classList.add('sig-good');
            divStatus.classList.remove('sig-bad');

            const speed = parseInt(ethernet.speed);

            // Affichage de la vitesse et de son mode duplex
            spanSpeedVal.innerHTML = isNaN(speed) ? '--' : speed;
            spanSpeedDetails.innerHTML = ` Mbps ${ethernet.fullduplex ? 'Full-duplex' : 'Half-duplex'}`;

            // Nettoyage des anciennes classes sur la valeur numérique
            spanSpeedVal.classList.remove('sig-good', 'sig-medium');

            // Attribution de la couleur selon la vitesse négociée
            if (!isNaN(speed) && speed >= 100) {
                spanSpeedVal.classList.add('sig-good'); // Vert si >= 100 Mbps
            } else {
                spanSpeedVal.classList.add('sig-medium'); // Orange si 10 Mbps ou moins
            }
        } else {
            // Si déconnecté, on remet à zéro et l'icône repasse en neutre/gris
            divStatus.classList.remove('sig-good', 'sig-bad');
            spanSpeedVal.innerHTML = '--';
            spanSpeedDetails.innerHTML = '';
            spanSpeedVal.classList.remove('sig-good', 'sig-medium');
        }
    }
}
var wifi = new Wifi();
// Assistant de premier démarrage (Onboarding Wizard) : affiché à la place du tableau de bord en
// mode AP tant qu'il n'est pas terminé/ignoré (cf. showAuthenticatedShellOrWizard()), ou ouvert
// manuellement depuis Système ("Relancer l'assistant"). Conteneur entièrement construit au moment
// de l'ouverture (comme les autres assistants du projet -- pairshade, link/unlink), et non pré-écrit
// en HTML statique. Contrairement à ces assistants-là il n'a NI stepper (ui.wizSetStep() et le
// marqueur .wizard associé ne le concernent pas : un seul panneau, pas d'étapes), NI le chrome
// .inst-overlay/.modal-overlay habituel -- c'est un écran plein, sans nav ni header, au même
// niveau que #divAuthenticated/#divUnauthenticated.
