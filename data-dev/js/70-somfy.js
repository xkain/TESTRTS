class Somfy {
    // =========================================================================
    // SECTION : CŒUR / RADIO / TRANSCEIVER / DIAGNOSTICS RF
    // =========================================================================
    initialized = false;
    // Passe à true une fois la toute première réponse de /controller traitée (loadSomfy()) --
    // tant que c'est faux, checkEmptyState() ne touche à aucun affichage (cf. son garde-fou en
    // tête de fonction). Corrige le flash "divGetStarted/divXxxEmptyState" au chargement/F5 :
    // avant ce correctif, checkEmptyState() tournait en synchrone dès activateGrpid() (donc
    // avant même que le socket ne soit ouvert et que /controller ait répondu), voyait 0
    // room/shade/group et affichait l'état vide/l'écran de bienvenue, pour le remplacer par le
    // vrai contenu une fois les données arrivées quelques centaines de ms à ~1s plus tard.
    dataLoaded = false;
    frames = [];
    isScanClosing = false;
    scanObserver = null;
    // Puissances d'émission du CC1101, en dBm. Le curseur #slidTxPower ne transporte PAS ces
    // valeurs mais leur INDICE (min=0 max=10, cf. index.html) : la table n'est donc pas un simple
    // encadrement min/max comme pour fréquence, bande passante et déviation, et une valeur
    // intermédiaire (3 dBm par exemple) n'est pas représentable. Source unique : elle était
    // recopiée dans updateRadioGraph() et txPowerChanged(), et txPowerInputChanged() en aurait
    // fait une troisième.
    txPowerLevels = [-30, -20, -15, -10, -6, 0, 5, 7, 10, 11, 12];
    // indic : pictogramme simplifié (sprite <symbol id="svg-indic*">, cf. index.html) utilisé dans
    // le badge d'icône compact des cartes de la liste volets (setShadesList) -- distinct de `ico`
    // (icône détaillée, réutilisée telle quelle par la carte dashboard/somfyShadeCtl). Les variantes
    // gauche/centre/droite d'une même famille (Drapery, Gate) partagent un seul indicateur.
    shadeTypes = [
        { type: 0, name: 'Roller Shade', ico: 'svg-window-shade', indic: 'svg-indicRoller', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 1, name: 'Blind', ico: 'svg-window-blind', indic: 'svg-indicblind', lift: true, tilt: true, sun: true, fcmd: true, fpos: true },
        { type: 2, name: 'Drapery (left)', ico: 'svg-ldrapery', indic: 'svg-indicDrapery', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 3, name: 'Awning', ico: 'svg-awning', indic: 'svg-indicAwning', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 4, name: 'Shutter', ico: 'svg-shutter', indic: 'svg-indicShutter', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 5, name: 'Garage (1-button)', ico: 'svg-garage', indic: 'svg-indicGarage', lift: true, light: true, fpos: true },
        { type: 6, name: 'Garage (3-button)', ico: 'svg-garage', indic: 'svg-indicGarage', lift: true, light: true, fcmd: true, fpos: true },
        { type: 7, name: 'Drapery (right)', ico: 'svg-rdrapery', indic: 'svg-indicDrapery', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 8, name: 'Drapery (center)', ico: 'svg-cdrapery', indic: 'svg-indicDrapery', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 9, name: 'Dry Contact (1-button)', ico: 'svg-contactBulb', indic: 'svg-indicDryContact', fpos: true },
        { type: 10, name: 'Dry Contact (2-button)', ico: 'svg-contactBulb', indic: 'svg-indicDryContact', fcmd: true, fpos: true },
        { type: 11, name: 'Gate (left)', ico: 'svg-lgate', indic: 'svg-indicGate', lift: true, fcmd: true, fpos: true },
        { type: 12, name: 'Gate (center)', ico: 'svg-cgate', indic: 'svg-indicGate', lift: true, fcmd: true, fpos: true },
        { type: 13, name: 'Gate (right)', ico: 'svg-rgate', indic: 'svg-indicGate', lift: true, fcmd: true, fpos: true },
        { type: 14, name: 'Gate (1-button left)', ico: 'svg-lgate', indic: 'svg-indicGate', lift: true, fcmd: true, fpos: true },
        { type: 15, name: 'Gate (1-button center)', ico: 'svg-cgate', indic: 'svg-indicGate', lift: true, fcmd: true, fpos: true },
        { type: 16, name: 'Gate (1-button right)', ico: 'svg-rgate', indic: 'svg-indicGate', lift: true, fcmd: true, fpos: true },
    ];
    // shadeType n'ayant aucune notion de position "My" mémorisée : les 1-bouton (garage/portail, cf.
    // SomfyShade::isToggle() côté firmware, qui traite tout mouvement comme un simple bascule) ainsi
    // que les Dry Contact (relais tout-ou-rien, aucune notion de position du tout). Utilisé par
    // ScheduleOverlay pour masquer le bouton "MY" quand il n'aurait aucun sens pour la cible choisie.
    noMyShadeTypes = [5, 9, 10, 14, 15, 16];
    radioBoardTypes = [
        { val: 0, label: 'DEFAULT', showGPIO: false },
        { val: 1, label: 'ESP32-D1 mini', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 18, CSNPin: 5, MOSIPin: 23, MISOPin: 19, TXPin: 21, RXPin: 22 } },
        { val: 2, label: 'WT32-ETH01', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 12, MOSIPin: 15, MISOPin: 4, TXPin: 2, RXPin: 35 } },
        { val: 3, label: 'Olimex ESP32-PoE/EVB', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 13, MOSIPin: 15, MISOPin: 16, TXPin: 4, RXPin: 36 } },
        { val: 4, label: 'LilyGO T-Internet POE', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 12, MOSIPin: 15, MISOPin: 16, TXPin: 4, RXPin: 35 } },
        { val: 5, label: 'wESP POE', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 18, CSNPin: 5, MOSIPin: 13, MISOPin: 32, TXPin: 4, RXPin: 39 } },
        { val: 6, label: 'ESP-PoE-32', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 5, MOSIPin: 13, MISOPin: 32, TXPin: 4, RXPin: 35 } },
        { val: 7, label: 'ESP32s3 Mini', showGPIO: false, chips: ['s3'], pins: { SCKPin: 7, CSNPin: 6, MOSIPin: 9, MISOPin: 8, TXPin: 3, RXPin: 4 } },
        { val: 8, label: 'XIAO-ESP32-C3', showGPIO: false, chips: ['c3'], pins: { SCKPin: 8, CSNPin: 6, MOSIPin: 10, MISOPin: 9, TXPin: 3, RXPin: 4 } },
        { val: 255, label: 'MANUAL_SETTINGS', showGPIO: true }
    ];
    init() {
        if (this.initialized) return;
        initMultiClickToggle('#divTransceiverSettings .main-headerTitle', 'show-expert-gpio', 5);
        initMultiClickToggle('.sidebar-brand, #showLogoHeader', () => this.screenShade(), 5);
        this.initialized = true;
    }
    initPins() {
        document
        .getElementById('selRadioBoardType')
        .addEventListener('change', e => this.onRadioBoardTypeChanged(e.target));

        const sel = get('selRadioBoardType');

        sel.addEventListener('change', e => this.onRadioBoardTypeChanged(e.target));

        this.loadPins('inout', get('selTransSCKPin'));
        this.loadPins('inout', get('selTransCSNPin'));
        this.loadPins('inout', get('selTransMOSIPin'));
        this.loadPins('input', get('selTransMISOPin'));
        this.loadPins('out', get('selTransTXPin'));
        this.loadPins('input', get('selTransRXPin'));

        ui.toElement(get('divTransceiverSettings'), {
            transceiver: { config: { proto: 0, radioBoardType: 0, SCKPin: 18, CSNPin: 5, MOSIPin: 23, MISOPin: 19, TXPin: 13, RXPin: 12, frequency: 433.42, rxBandwidth: 97.96, type: 56, deviation: 11.43, txPower: 10, enabled: false } }
        });

        this.loadPins('out', get('selShadeGPIOUp'));
        this.loadPins('out', get('selShadeGPIODown'));
        this.loadPins('out', get('selShadeGPIOMy'));
        this.loadRadioBoardTypes(get('selRadioBoardType'));
        this.loadRadioBoardTypes(sel);
        this.onRadioBoardTypeChanged(sel);
    }
    loadRadioBoardTypes(sel) {
        while (sel.firstChild) sel.removeChild(sel.firstChild);

        let rawCm = get('divContainer').getAttribute('data-chipmodel') || "";
        let cm = rawCm.toLowerCase().trim();

        if (cm.includes("s3")) cm = "s3";
        else if (cm.includes("c3")) cm = "c3";
        else if (cm.includes("s2")) cm = "s2";
        else cm = "esp32";

        this.radioBoardTypes.forEach(t => {
            if (t.chips && !t.chips.includes(cm)) {
                return;
            }

            // AJUSTEMENT DYNAMIQUE DU NOM POUR L'OPTION PAR DÉFAUT
            let labelKey = t.label;
            if (t.val === 0 && labelKey === 'DEFAULT') {
                labelKey = `BOARD_DEFAULT_${cm.toUpperCase()}`; // Génère BOARD_DEFAULT_ESP32, BOARD_DEFAULT_S3, etc.
            }

            const labelText = tr(labelKey);
            sel.options.add(new Option(labelText, t.val));
        });
    }
    onRadioBoardTypeChanged(sel, isInit = false) {
        const val = parseInt(sel.value, 10),
        cm = (get('divContainer').getAttribute('data-chipmodel') || "").toLowerCase(),
        divS = get('divGPIOSummary'),
        divG = get('divShowGpio'),
        pk = ['SCKPin', 'CSNPin', 'MOSIPin', 'MISOPin', 'TXPin', 'RXPin'],
        isM = (val === 255),
        board = this.radioBoardTypes.find(t => t.val === val);

        let def = { SCKPin: 18, CSNPin: 5, MOSIPin: 23, MISOPin: 19, TXPin: 13, RXPin: 12 };
        if (cm === "s3") def = { SCKPin: 12, CSNPin: 10, MOSIPin: 11, MISOPin: 13, TXPin: 15, RXPin: 14 };
        else if (cm === "s2") def = { SCKPin: 36, CSNPin: 34, MOSIPin: 35, MISOPin: 37, TXPin: 15, RXPin: 14 };
        else if (cm === "c3") def = { SCKPin: 15, CSNPin: 14, MOSIPin: 16, MISOPin: 17, TXPin: 13, RXPin: 12 };

        const target = val === 0 ? def : (board?.pins || null);

        if (target) {
            const labels = ['SCK:', 'CSN:', 'MOSI:', 'MISO:', 'TX:', 'RX:'];
            const gpioTooltipTitle = escAttr(tr('RADIO_TOOLTIP_GPIO_0'));
            const gpioTooltipText = escAttr(`${tr('RADIO_TOOLTIP_GPIO_1')}<br>${tr('RADIO_TOOLTIP_GPIO_2')}<br><br><i>${tr('RADIO_TOOLTIP_GPIO_3')}</i>`);
            let html = `<div class="gpioRadio-container"><div class="help-container" data-tooltip-title="${gpioTooltipTitle}" data-tooltip-text="${gpioTooltipText}"><svg class="help-svg"><use href=#icon-question></use></svg></div>`;

            pk.forEach((k, i) => {
                const v = target[k], selP = get(`selTrans${k}`), inpP = get(`inputTrans${k}`);
                if (selP) {
                    if (![...selP.options].some(o => parseInt(o.value, 10) === v)) {
                        selP.options.add(new Option(`GPIO-${v < 10 ? '0' + v : v}`, v));
                    }
                    selP.value = v;
                }
                if (inpP) inpP.value = v;
                html += `<div class="gpioRadio-item"><span class="gpioRadio-label">${labels[i]}</span><span class="gpioRadio-val">GPIO${v}</span></div>${i < 5 ? `<div class="gpioRadio-sep${i === 2 ? ' gpioRadioSep' : ''}">|</div>` : ''}`;
            });
            divS.innerHTML = html + `</div>`;
        }

        pk.forEach(k => {
            const selP = get(`selTrans${k}`), inpP = get(`inputTrans${k}`);
            if (selP) selP.style.display = target ? 'inline-block' : 'none';
            if (inpP) {
                if (isM) inpP.value = (isInit && parseInt(selP?.value || inpP.value, 10)) || def[k];
                inpP.style.display = isM ? 'inline-block' : 'none';
            }
        });

        get('divManualSafety').style.display = isM ? 'block' : 'none';
        divS.style.display = target ? 'block' : 'none';
        divG.style.display = target ? 'none' : 'inline-block';
    }

    setRadioEnabled(isEnabled) {
        const txtStatus = get('divRadioEnableStatus');
        const radioTab = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]');
        const isActuallyEnabled = radioTab && !radioTab.classList.contains('radio-error');

        if (txtStatus) {
            if (isEnabled === isActuallyEnabled) {
                txtStatus.textContent = isEnabled ? tr('RADIO_ENABLED') : tr('RADIO_DISABLED');
            } else {
                txtStatus.textContent = tr('RADIO_SAVE_REQUIRED');
            }
        }
    }

    async loadSomfy() {
        //console.trace("Appel à loadSomfy");
        getJSONSync('/controller', (err, somfy) => {
            // Marqué avant le traitement (succès ou erreur) : autorise checkEmptyState() à
            // afficher enfin un état définitif -- y compris en cas d'erreur réseau, pour ne pas
            // laisser le tableau de bord bloqué indéfiniment dans son état "chargement" (colonnes
            // vides sans message) faute de réponse. Cf. this.dataLoaded.
            this.dataLoaded = true;
            if (err) {
                logger.error('Failed to load Somfy controller data:', err);
                ui.serviceError(err);
                this.checkEmptyState();
            } else {
                logger.debug('Somfy controller data loaded');
                const spanMaxRooms = get('spanMaxRooms');
                const spanMaxShades = get('spanMaxShades');
                const spanMaxGroups = get('spanMaxGroups');

                if (spanMaxRooms)  spanMaxRooms.innerText = (somfy.maxRooms - 2);
                if (spanMaxShades) spanMaxShades.innerText = (somfy.maxShades - 2);
                if (spanMaxGroups) spanMaxGroups.innerText = (somfy.maxGroups - 2);

                // Persisté (contrairement à maxRooms/Shades/Groups ci-dessus, seulement utilisés
                // ponctuellement pour ces spans) : consommé plus tard par _openEditSchedule() et
                // renderScheduleBadges() pour le quota de plannings restants, potentiellement bien
                // après la résolution de ce callback -- SOMFY_MAX_SCHEDULES (32) était jusqu'ici
                // recopié en dur côté JS plutôt que lu depuis /controller, un risque de dérive
                // silencieuse si cette constante change un jour côté firmware.
                this.maxSchedules = somfy.maxSchedules;

                ui.toElement(get('divTransceiverSettings'), somfy);

                if (typeof this.updateRadioGraph === 'function') {
                    this.updateRadioGraph();
                }

                const selBoard = get('selRadioBoardType');
                if (selBoard) {
                    this.loadRadioBoardTypes(selBoard);
                }

                if (somfy.transceiver && somfy.transceiver.config) {
                    if (selBoard) selBoard.value = somfy.transceiver.config.radioBoardType || 0;
                    this.onRadioBoardTypeChanged(selBoard, true);
                }

                // --- NOUVELLE LOGIQUE INITIALISATION DU SWITCH RADIO (CHECKBOX) ---
                const cbEnableRadio = get('cbEnableRadio');
                const row = get('divRadioEnableColor');
                const radioTab = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]');

                // On initialise l'état de la checkbox suivant la configuration reçue
                const isConfigEnabled = !!(somfy.transceiver && somfy.transceiver.config && somfy.transceiver.config.enabled);
                if (cbEnableRadio) {
                    cbEnableRadio.checked = isConfigEnabled;
                }

                const isRadioInit = somfy.transceiver?.config?.radioInit;
                const sideNote = get('barsideRadioDisable');
                if (radioTab) {
                    radioTab.classList.toggle('radio-error', !isRadioInit);
                    if (sideNote) sideNote.style.display = isRadioInit ? 'none' : 'inline';
                    if (row) row.classList.toggle('radioOn', !!isRadioInit);
                }

                // Met à jour l'affichage du texte d'état
                this.setRadioEnabled(isConfigEnabled);
                // -------------------------------------------------------------------
                watchDirty(get('divTransceiverSettings'));

                this.setRoomsList(somfy.rooms);
                this.setShadesList(somfy.shades);
                this.setGroupsList(somfy.groups);
                this.setRepeaterList(somfy.repeaters);
                this.setScheduleList(somfy.schedules);
                if (typeof somfy.version !== 'undefined') {
                    firmware.procFwStatus(somfy.version);
                }
            }
        });
    }
    stepGpio(pinKey, direction) {
        const newValue = stepDeviceGpio(pinKey, direction, 'Trans', 'selRadioBoardType', val => val === 255, this.pinMaps);
        if (newValue === undefined) return;

        const targetLabel = pinKey.replace('Pin', '').toUpperCase() + ':';
        document.querySelectorAll('#divGPIOSummary .gpioRadio-label').forEach(lbl => {
            const text = lbl.textContent.trim();
            if (text === targetLabel || (targetLabel === 'SCK:' && text === 'SCLK:')) {
                const valSpan = lbl.nextElementSibling;
                if (valSpan && valSpan.classList.contains('gpioRadio-val')) valSpan.textContent = `GPIO${newValue}`;
            }
        });
    }
    saveRadio() {
        let valid = true;
        const d = get('divTransceiverSettings'),
        t = ui.fromElement(d).transceiver,
        pk = ['SCKPin', 'CSNPin', 'MOSIPin', 'MISOPin', 'TXPin', 'RXPin'],
        bv = parseInt(get('selRadioBoardType').value, 10),
        isM = (bv === 255);

        if (!t.config) t.config = {};
        t.config.radioBoardType = bv;

        if (isM && !get('cbManualSafety')?.checked) {
            return ui.errorMessage(d, tr('ERR_RADIO_SAFETY_REQUIRED'));
        }

        pk.forEach(k => {
            const el = get((isM ? 'inputTrans' : 'selTrans') + k);
            if (el) t.config[k] = parseInt(el.value, 10);
        });

            if (!t.config.type || t.config.type === 'none') {
                ui.errorMessage(d, tr('ERR_RADIO_TYPE_REQUIRED'));
                valid = false;
            }

            if (valid) {
                const cm = (get('divContainer').getAttribute('data-chipmodel') || "").toLowerCase(),
                pm = this.pinMaps.find(x => x.name === cm) || { maxPins: 39 };

                try {
                    for (const k of pk) {
                        const v = t.config[k];
                        if (v === undefined || isNaN(v)) {
                            ui.errorMessage(d, tr('ERR_RADIO_PINS_REQUIRED'));
                            valid = false; break;
                        }
                        if (v < 0 || v > pm.maxPins) {
                            ui.errorMessage(d, tr('ERR_GPIO_NOT_EXIST').replace('{pin}', v).replace('{maxPins}', pm.maxPins));
                            valid = false; break;
                        }
                        for (let s in t.config) {
                            if (s.endsWith('Pin') && s !== k && t.config[s] === v) {
                                if ((k === 'TXPin' && s === 'RXPin') || (k === 'RXPin' && s === 'TXPin')) continue;
                                ui.errorMessage(d, tr('ERR_GPIO_PIN_DUPLICATED').replace('%1', k.replace('Pin', '')).replace('%2', s.replace('Pin', '')));
                                valid = false; break;
                            }
                        }
                        if (!valid) break;
                    }
                } catch (err) {
                    logger.error('Radio settings validation error:', err);
                    valid = false;
                }
            }

            if (!valid) return;

            const proceedSave = () => {
                putJSONSync('/saveRadio', t, (err, res) => {
                    if (err) return ui.serviceError(err);

                    ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                    clearDirty();
                    get('btnSaveRadio').classList.remove('disabled');

                    const init = res.config.radioInit,
                    tab = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]'),
                            sn = get('barsideRadioDisable'),
                            cb = get('cbEnableRadio');

                            if (tab) {
                                tab.classList.toggle('radio-error', !init);
                                if (sn) sn.style.display = init ? 'none' : 'inline';
                                get('divRadioEnableColor').classList.toggle('radioOn', !!init);
                            }

                            // Comparaison simple et directe avec l'état de la checkbox d'origine
                            if (cb) {
                                get('divRadioEnableStatus').textContent = tr(cb.checked === init ? (cb.checked ? 'RADIO_ENABLED' : 'RADIO_DISABLED') : 'RADIO_SAVE_REQUIRED');
                            }
                });
            };

            if (isM) {
                let prompt = ui.promptMessage(get('divContainer'), tr('PROMPT_RADIO_MANUAL_TITLE'), () => {
                    proceedSave();
                });
                prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_RADIO_MANUAL_WARNING")}</p>`;
            } else {
                proceedSave();
            }
    }
    pinMaps = [
        { name: '', maxPins: 39, inputs: [0, 1, 6, 7, 8, 9, 10, 11, 37, 38], outputs: [3, 6, 7, 8, 9, 10, 11, 34, 35, 36, 37, 38, 39] },
        { name: 's2', maxPins: 46, inputs: [0, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 45], outputs: [0, 19, 20, 26, 27, 28, 29, 30, 31, 32, 45, 46]},
        { name: 's3', maxPins: 48, inputs: [19, 20, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32], outputs: [19, 20, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32] },
        { name: 'c3', maxPins: 21, inputs: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], outputs: [11, 12, 13, 14, 15, 16, 17, 21] }
    ];
    loadPins(type, sel, opt) {
        if (!sel) return;
        let currentVal = (typeof opt !== 'undefined') ? opt : parseInt(sel.value, 10);
        while (sel.firstChild) sel.removeChild(sel.firstChild);

        let cm = get('divContainer').getAttribute('data-chipmodel');
        let pm = this.pinMaps.find(x => x.name === cm);
        if (!pm) {
            pm = { name: '', maxPins: 39, inputs: [0, 1, 6, 7, 8, 9, 10, 11, 37, 38], outputs: [3, 6, 7, 8, 9, 10, 11, 34, 35, 36, 37, 38, 39] };
        }

        for (let i = 0; i <= pm.maxPins; i++) {
            if (type.includes('in') && pm.inputs.includes(i)) continue;
            if (type.includes('out') && pm.outputs.includes(i)) continue;

            sel.options[sel.options.length] = new Option(
                `GPIO-${i > 9 ? i.toString() : '0' + i.toString()}`,
                                                         i
            );
        }
        if (!isNaN(currentVal)) {
            sel.value = currentVal;
        }
    }
    procFrequencyScan(scan) {
        // console.log(scan);
        let div = this.scanFrequency();
        let spanTestFreq = get('spanTestFreq');
        let spanTestRSSI = get('spanTestRSSI');
        let spanBestFreq = get('spanBestFreq');
        let spanBestRSSI = get('spanBestRSSI');

        if (spanBestFreq) {
            spanBestFreq.innerHTML = scan.RSSI !== -100 ? scan.frequency.fmt('###.00') : '----';
        }
        if (spanBestRSSI) {
            const bestRSSIVal = scan.RSSI !== -100 ? scan.RSSI : '----';
            spanBestRSSI.innerHTML = bestRSSIVal;

            // MÀJ dynamique de la couleur de la carte de DROITE (Optimal)
            this.updateCardState(document.querySelector('.scan-card.optimal'), bestRSSIVal);
        }
        if (spanTestFreq) {
            spanTestFreq.innerHTML = scan.testFreq.fmt('###.00');
        }
        if (spanTestRSSI) {
            const testRSSIVal = scan.testRSSI !== -100 ? scan.testRSSI : '----';
            spanTestRSSI.innerHTML = testRSSIVal;

            // MÀJ dynamique de la couleur de la carte de GAUCHE (Balayage actuel)
            this.updateCardState(document.querySelector('.scan-card:not(.optimal)'), testRSSIVal);

            // L'ancien graphique en barres/lignes verticales (si tu le gardes)
            if (this.rssiGraphWave) {
                this.rssiGraphWave.update(scan.testRSSI);
            }

            // --- C'EST ICI QU'ON AJOUTE TON NOUVEAU GRAPHIQUE SPECTRE SWEEP ---
            if (this.rssiGraphSignal) {
                this.rssiGraphSignal.update(scan.testRSSI, scan.testFreq);
            }
        }
        if (scan.RSSI !== -100)
            div.setAttribute('data-frequency', scan.frequency);
    }

    // Fonction générique ultra propre pour appliquer les états aux cartes
    updateCardState(cardElement, rssiVal) {
        if (!cardElement) return;

        // On nettoie les anciennes classes
        cardElement.classList.remove('state-success', 'state-warning', 'state-error');

        const v = parseInt(rssiVal);
        if (isNaN(v) || rssiVal === '----') return; // Style neutre d'origine si vide

        // Application des paliers de couleur (-30 à -60 / -60 à -90 / -90 et moins)
        if (v >= -60) {
            cardElement.classList.add('state-success');
        } else if (v < -60 && v >= -90) {
            cardElement.classList.add('state-warning');
        } else {
            cardElement.classList.add('state-error');
        }
    }
    scanFrequency(initScan) {
        if (this.isScanClosing) return;
        let div = get('divScanFrequency');

        if (!div) {
            div = document.createElement('div');
            div.id = 'divScanFrequency';
            div.className = 'inst-overlay';

            // Récupération du mode sauvegardé : 'wave', 'bar' ou 'none'
            const savedMode = localStorage.getItem('espsomfy_graph_mode') || 'wave';

            div.innerHTML = `
            <div class="instructions-content">

            ${overlayHeader('SCANFREQ_TITLE', 'SCANFREQ_DESC', 'svg-tabRadio', false)}
            <div class="overlay-scroll-content">

            <div class="information-text scanInfo">
            </span>${tr('SCANFREQ_SCAN_DESC')}</span>
            </div>


            <div class="scan-cards">
            <div class="scan-card">
            <div class="labelMAJ">${tr("SCANFREQ_SCAN")}</div>
            <div class="scan-card-content">
            <div class="scan-card-icon">
            <svg><use href="#svg-search"></use></svg>
            </div>
            <div class="scan-card-info">
            <div class="scan-card-main">
            <span id="spanTestFreq">433.14</span>
            <small>${tr("UNIT_MHZ")}</small>
            </div>
            <div class="scan-card-rssi-row">
            <span class="rssi-label">${tr('SCANFREQ_DIV_RSSI')}</span>
            <strong id="spanTestRSSI" class="rssi-value">----</strong>
            <small class="rssi-unit">${tr("UNIT_DBM")}</small>
            </div>
            </div>
            </div>
            </div>

            <div class="scan-card optimal">
            <div class="labelMAJ">${tr("SCANFREQ_FREQUENCY")}</div>
            <div class="scan-card-content">
            <div class="scan-card-icon target">
            <svg><use href="#svg-target"></use></svg>
            </div>
            <div class="scan-card-info">
            <div class="scan-card-main best">
            <span id="spanBestFreq">---.--</span>
            <small>${tr("UNIT_MHZ")}</small>
            </div>
            <div class="scan-card-rssi-row best">
            <span class="rssi-label">${tr('SCANFREQ_DIV_RSSI')}</span>
            <strong id="spanBestRSSI" class="rssi-value">----</strong>
            <small class="rssi-unit">${tr("UNIT_DBM")}</small>
            </div>
            </div>
            </div>
            </div>
            </div>

            <div class="scan-dashboard-bloc">
            <div class="graph-dropdown-container">
            <button id="btnGraphDropdown" type="button" class="btn-dashboard-action" title="${tr('SCANFREQ_GRAPH_TITLE')}">
            <svg><use href="#svg-menu"></use></svg>
            </button>

            <div id="graphDropdownMenu" class="graph-dropdown-menu">
            <div class="dropdown-item ${savedMode === 'wave' ? 'active' : ''}" data-mode="wave">
            <svg><use href="#svg-wave"></use></svg> ${tr('M_WAVE')}
            </div>

            <div class="dropdown-item ${savedMode === 'signal' ? 'active' : ''}" data-mode="signal">
            <svg><use href="#svg-signal"></use></svg> ${tr('M_SIGNAL')}
            </div>

            <div class="dropdown-item ${savedMode === 'none' ? 'active' : ''}" data-mode="none">
            <svg><use href="#svg-placeholder"></use></svg> ${tr('M_DISABLED')}
            </div>
            </div>
            </div>

            <div class="dashboard-main-action">
            <div id="scanStatusText" class="scan-status-waiting-text">
            <span class="spinner-inline"></span>${tr('WAIT_MSG_SCANNING')}
            </div>

            <div id="scanStatusResult" class="scan-status-result-text" style="display:none">
            <span>${tr('SCANFREQ_NO_SIGNAL')}</span>
            </div>

            <button id="btnCopyFrequency" type="button" class="btn-scan-main" style="display:none" onclick="somfy.setScannedFrequency()">
            <svg class="icon-btn"><use href="#svg-save"></use></svg>
            ${tr("BT_COPY_FREQUENCY")}
            </button>
            </div>

            <div class="dashboard-controls-right"></div>
            </div>

            <div class="graph-zone-wrapper">
            <div id="graphCanvasContainer" class="uniblocrRssiCanvas" data-active-mode="${savedMode}" style="${savedMode === 'none' ? 'display:none;' : ''}">
            <canvas id="rssiWave" style="display: ${savedMode === 'wave' ? 'block' : 'none'}; width:100%; height:100%;"></canvas>
            <canvas id="rssiSignal" style="display: ${savedMode === 'signal' ? 'block' : 'none'}; width:100%; height:100%;"></canvas>
            </div>
            </div>

            <details class="uniblocCol scanfreq-help-accordion">
            <summary class="scanfreq-help-trigger">
            <div class="scanfreq-title-wrapper">
            <svg class="help-svg"><use href="#icon-question"></use></svg>
            <span>${tr('SCANFREQ_UNDERSTANDING_RSSI')}</span>
            </div>
            <svg class="accordion-arrow"><use href="#svg-arrowDown"></use></svg>
            </summary>

            <div class="rssi-scale-container">
            <div class="rssi-scale-zone zone-success">
            <div class="rssi-zone-header">
            <span class="rssi-badge">
            <svg class="icon-inline"><use href="#svg-succes"></use></svg>
            ${tr('SCANFREQ_RSSI_EXCELLENT')}
            </span>
            </div>
            <p class="rssi-zone-desc">${tr('SCANFREQ_RSSI_EXCELLENT_DESC')}</p>
            <div class="rssi-visual-bar bar-success">
            <span></span><span></span><span></span><span></span><span></span><span class="off"></span><span class="off"></span>
            </div>
            </div>

            <div class="rssi-scale-zone zone-warning">
            <div class="rssi-zone-header">
            <span class="rssi-badge">
            <svg class="icon-inline"><use href="#svg-warning"></use></svg>
            ${tr('SCANFREQ_RSSI_WEAK')}
            </span>
            </div>
            <p class="rssi-zone-desc">${tr('SCANFREQ_RSSI_WEAK_DESC')}</p>
            <div class="rssi-visual-bar bar-warning">
            <span></span><span></span><span></span><span class="off"></span><span class="off"></span><span class="off"></span><span class="off"></span>
            </div>
            </div>

            <div class="rssi-scale-zone zone-error">
            <div class="rssi-zone-header">
            <span class="rssi-badge">
            <svg class="icon-inline"><use href="#svg-error"></use></svg>
            ${tr('SCANFREQ_RSSI_NOISE')}
            </span>
            </div>
            <p class="rssi-zone-desc">${tr('SCANFREQ_RSSI_NOISE_DESC')}</p>
            <div class="rssi-visual-bar bar-error">
            <span></span><span class="off"></span><span class="off"></span><span class="off"></span><span class="off"></span><span class="off"></span><span class="off"></span>
            </div>
            </div>
            </div>
            </details>
            </div>

            <div class="hrDivFooter-Instruc"></div>

            <div class="button-container-overlay footer-controls-row">
            <button id="btnCloseScanning" type="button" line class="btn-scan-action btn-secondary">${tr("BT_CLOSE")}</button>

            <button id="btnRestartScanning" type="button" class="btn-scan-action btn-success" style="display:none" onclick="somfy.scanFrequency(true)" title="${tr('BT_START_SCAN')}">
            <svg class="icon-btn"><use href="#svg-play"></use></svg>
            <span>${tr('BT_START')}</span>
            </button>
            <button id="btnStopScanning" type="button" class="btn-scan-action btn-danger" onclick="somfy.stopScanningFrequency(true)" title="${tr('BT_STOP_SCAN')}">
            <svg class="icon-btn"><use href="#svg-stop"></use></svg>
            <span>${tr('BT_STOP')}</span>
            </button>

            </div>
            </div>`;

            shOverlay(div);
            div.querySelector('#btnCloseScanning').onclick = () => requestCloseOverlay(div);

            if (this.scanObserver) this.scanObserver.disconnect();
            this.scanObserver = new MutationObserver(() => { if (!get('divScanFrequency')) this.terminateScanUI(true); });
            this.scanObserver.observe(get('divContainer'), { childList: true });

            const dropBtn = div.querySelector('#btnGraphDropdown');
            const dropMenu = div.querySelector('#graphDropdownMenu');

            dropBtn.onclick = (e) => {
                e.stopPropagation();
                dropMenu.classList.toggle('show');
            };

            // Référencé pour pouvoir le retirer dans terminateScanUI() : sans ça, rouvrir cet
            // overlay plusieurs fois dans la même session accumule un listener sur document à
            // chaque ouverture (jamais nettoyé jusqu'ici -- fuite mineure mais réelle).
            this._scanDropdownCloseHandler = () => { if (dropMenu) dropMenu.classList.remove('show'); };
            document.addEventListener('click', this._scanDropdownCloseHandler);

                dropMenu.querySelectorAll('.dropdown-item').forEach(item => {
                    item.onclick = (e) => {
                        const selectedMode = item.getAttribute('data-mode');
                        localStorage.setItem('espsomfy_graph_mode', selectedMode);

                        dropMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');

                        const container = get('graphCanvasContainer');
                        if (container) {
                            container.setAttribute('data-active-mode', selectedMode);
                            container.style.display = selectedMode === 'none' ? 'none' : '';
                            get('rssiWave').style.display = selectedMode === 'wave' ? 'block' : 'none';
                            get('rssiSignal').style.display = selectedMode === 'signal' ? 'block' : 'none';
                        }
                    };
                });

                this.rssiGraphWave = {
                    points: [],
                    maxPoints: 80,
                    canvas: get('rssiWave'),
                    freqMin: 433.00,
                    freqMax: 434.00,
                    currentIdx: 0,
                    optimalFreq: null,

                    reset() {
                        this.currentIdx = 0;
                        this.optimalFreq = null;
                        this.points = Array(this.maxPoints).fill(-110);
                    },


                    update(val, currentFreq, isStopped = false, bestFreq = null) {
                        const c = this.canvas;
                        if (!c || c.style.display === 'none') return;

                        // --- SÉCURISATION ET FORCE DE LA VRAIE FRÉQUENCE ---
                        currentFreq = get('spanTestFreq') ? get('spanTestFreq').innerText : currentFreq;

                        const ctx = c.getContext('2d');
                        const dpr = window.devicePixelRatio || 1;
                        const displayW = c.clientWidth;
                        const displayH = c.clientHeight;

                        c.width = displayW * dpr;
                        c.height = displayH * dpr;
                        ctx.scale(dpr, dpr);

                        if (this.points.length === 0) {
                            this.points = Array(this.maxPoints).fill(-110);
                        }
                        if (bestFreq) this.optimalFreq = parseFloat(bestFreq);

                        let v = parseInt(val);
                        if (isNaN(v) || v < -110) v = -110;
                        if (v > -30) v = -30;
                        // Extraction numérique de la fréquence (ex: "433.48" -> 433.48)
                        let freq = NaN;
                        if (currentFreq !== undefined && currentFreq !== null) {
                            let cleanFreq = String(currentFreq).replace(/[^0-9.]/g, '');
                            freq = parseFloat(cleanFreq);
                        }
                        // --- PLACEMENT GÉOGRAPHIQUE DU CURSEUR (0% à 100%) ---
                        if (!isNaN(freq) && freq >= this.freqMin && freq <= this.freqMax) {
                            let pct = (freq - this.freqMin) / (this.freqMax - this.freqMin);

                            // Calcule l'index exact de gauche (0) à droite (79)
                            this.currentIdx = Math.floor(pct * (this.maxPoints - 1));
                            if (this.currentIdx < 0) this.currentIdx = 0;
                            if (this.currentIdx >= this.maxPoints) this.currentIdx = this.maxPoints - 1;
                        } else if (!isStopped) {
                            // Au cas où l'affichage repasse temporairement à vide pendant le scan
                            this.currentIdx = (this.currentIdx + 1) % this.maxPoints;
                        }

                        // Stockage du RSSI au bon endroit sur la courbe
                        if (!isStopped) {
                            this.points[this.currentIdx] = v;
                        }

                        ctx.clearRect(0, 0, displayW, displayH);

                        const rootStyles = getComputedStyle(document.documentElement);
                        let accent = rootStyles.getPropertyValue('--color-accent').trim() || '#1a5fb4';
                        let subTextColor = rootStyles.getPropertyValue('--color-text-secondary').trim() || '#888888';

                        const lblW = 30;
                        const gW = displayW - lblW - 35;
                        const paddingT = 20;
                        const paddingB = 25;
                        const graphH = displayH - paddingT - paddingB;
                        const getPointY = (rssiVal) => displayH - (((rssiVal + 110) / 80) * graphH) - paddingB;
                        const getPointX = (index) => lblW + (index * (gW / (this.maxPoints - 1)));

                        // Grille dBm
                        ctx.strokeStyle = `color-mix(in srgb, ${subTextColor} 10%, transparent)`;
                        ctx.font = "9px monospace";
                        ctx.fillStyle = subTextColor;
                        ctx.lineWidth = 0.5;
                        ctx.textAlign = "left";

                        ctx.save();
                        ctx.font = "bold 9px monospace"; // Un peu plus lisible
                        ctx.fillText("dBm", 2, getPointY(-30) - 12);
                        ctx.restore();

                        [-30, -50, -70, -90, -110].forEach(lv => {
                            const y = getPointY(lv);
                            ctx.beginPath();
                            ctx.moveTo(lblW, y);
                            ctx.lineTo(lblW + gW, y);
                            ctx.stroke();
                            ctx.fillText(lv, 2, y + 3);
                        });

                        // Légende Fréquences Fixe
                        ctx.fillStyle = subTextColor;
                        ctx.font = "9px monospace";
                        ctx.textBaseline = "top";
                        const yLabel = displayH - paddingB + 6;

                        const labelsFixes = ["433.00", "433.20", "433.40", "433.60", "433.80", "434.00 MHz"];
                        labelsFixes.forEach((lbl, i) => {
                            let labelPct = i / (labelsFixes.length - 1);
                            let xLabel = lblW + (labelPct * gW);

                            if (i === labelsFixes.length - 1) {
                                ctx.textAlign = "right";
                            } else if (i === 0) {
                                ctx.textAlign = "left";
                            } else {
                                ctx.textAlign = "center";
                            }
                            ctx.fillText(lbl, xLabel, yLabel);
                        });

                        // Remplissage de la courbe
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(getPointX(0), getPointY(this.points[0]));
                        for (let i = 0; i < this.points.length - 1; i++) {
                            const x1 = getPointX(i);
                            const y1 = getPointY(this.points[i]);
                            const x2 = getPointX(i + 1);
                            const y2 = getPointY(this.points[i + 1]);
                            ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
                        }
                        ctx.lineTo(getPointX(this.points.length - 1), displayH - paddingB);
                        ctx.lineTo(getPointX(0), displayH - paddingB);
                        ctx.closePath();

                        const fillGrad = ctx.createLinearGradient(0, paddingT, 0, displayH - paddingB);
                        fillGrad.addColorStop(0, `color-mix(in srgb, ${accent} 35%, transparent)`);
                        fillGrad.addColorStop(0.7, `color-mix(in srgb, ${accent} 5%, transparent)`);
                        fillGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        ctx.fillStyle = fillGrad;
                        ctx.fill();
                        ctx.restore();

                        // Ligne Néon
                        ctx.save();
                        ctx.strokeStyle = `color-mix(in srgb, ${accent} 85%, #ffffff)`;
                        ctx.lineWidth = 2.5;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = accent;
                        ctx.beginPath();
                        ctx.moveTo(getPointX(0), getPointY(this.points[0]));
                        for (let i = 0; i < this.points.length - 1; i++) {
                            const x1 = getPointX(i);
                            const y1 = getPointY(this.points[i]);
                            const x2 = getPointX(i + 1);
                            const y2 = getPointY(this.points[i + 1]);
                            ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
                        }
                        ctx.stroke();
                        ctx.restore();

                        // Dessin du Curseur
                        let centerX = getPointX(this.currentIdx);
                        let centerY = getPointY(this.points[this.currentIdx]);
                        let lineStyle = `color-mix(in srgb, ${accent} 60%, transparent)`;
                        let isTargetMode = false;

                        if (isStopped && this.optimalFreq !== null) {
                            let optPct = (this.optimalFreq - this.freqMin) / (this.freqMax - this.freqMin);
                            if (optPct >= 0 && optPct <= 1) {
                                let optIdx = Math.floor(optPct * (this.maxPoints - 1));
                                centerX = getPointX(optIdx);
                                centerY = getPointY(this.points[optIdx]);
                                lineStyle = '#47a4f5';
                                isTargetMode = true;
                            }
                        }

                        ctx.save();
                        ctx.strokeStyle = lineStyle;
                        ctx.lineWidth = isTargetMode ? 1.5 : 1;
                        ctx.setLineDash(isTargetMode ? [] : [3, 3]);
                        ctx.beginPath();
                        ctx.moveTo(centerX, paddingT);
                        ctx.lineTo(centerX, displayH - paddingB);
                        ctx.stroke();
                        ctx.restore();

                        ctx.save();
                        ctx.fillStyle = '#ffffff';
                        ctx.strokeStyle = isTargetMode ? '#47a4f5' : accent;
                        ctx.lineWidth = 3;
                        ctx.shadowBlur = 12;
                        ctx.shadowColor = isTargetMode ? '#47a4f5' : accent;
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        ctx.restore();

                        if (isTargetMode) {
                            ctx.save();
                            ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
                            ctx.strokeStyle = "rgba(71, 164, 245, 0.5)";
                            ctx.lineWidth = 1;

                            const txt1 = `${this.optimalFreq.toFixed(2)} MHz`;
                            const idxForDbm = Math.floor((centerX - lblW) / (gW / (this.maxPoints - 1)));
                            const txt2 = `${this.points[idxForDbm] || -110} dBm`;

                            ctx.font = "9px Arial";
                            const boxW = Math.max(ctx.measureText(txt1).width, ctx.measureText(txt2).width) + 16;
                            const boxH = 30;
                            const boxX = Math.max(lblW, Math.min(centerX - boxW / 2, (lblW + gW) - boxW));
                            const boxY = Math.max(5, centerY - boxH - 10);

                            ctx.beginPath();
                            ctx.roundRect(boxX, boxY, boxW, boxH, 4);
                            ctx.fill();
                            ctx.stroke();

                            ctx.fillStyle = "#ffffff";
                            ctx.textAlign = "center";
                            ctx.fillText(txt1, boxX + boxW / 2, boxY + 10);
                            ctx.fillStyle = "#47a4f5";
                            ctx.fillText(txt2, boxX + boxW / 2, boxY + 22);
                            ctx.restore();
                        }
                    }
                };
                /// --- 2. MOTEUR GRAPH_BAR (VAGUES RADAR / SONAR) ---
                this.rssiGraphSignal = {
                    canvas: get('rssiSignal'),
                    lastIntensity: 0,

                    update(val) {
                        const c = this.canvas;
                        if (!c || c.style.display === 'none') return;

                        const ctx = c.getContext('2d');
                        const dpr = window.devicePixelRatio || 1;
                        const displayW = c.clientWidth;
                        const displayH = c.clientHeight;

                        c.width = displayW * dpr;
                        c.height = displayH * dpr;
                        ctx.scale(dpr, dpr);

                        let v = parseInt(val);
                        if (isNaN(v) || v < -110) v = -110;
                        if (v > -30) v = -30;

                        const targetIntensity = (v + 110) / 80;

                        if (targetIntensity > this.lastIntensity) {
                            this.lastIntensity = targetIntensity;
                        } else {
                            this.lastIntensity += (targetIntensity - this.lastIntensity) * 0.15;
                        }

                        ctx.clearRect(0, 0, displayW, displayH);

                        const rootStyles = getComputedStyle(document.documentElement);
                        let accent = rootStyles.getPropertyValue('--color-accent').trim() || '#1a5fb4';
                        let subTextColor = rootStyles.getPropertyValue('--color-text-secondary').trim() || '#888888';

                        const centerX = displayW / 2;
                        const centerY = displayH - 5;
                        const maxRadius = (displayW / 2) - 4;
                        const totalArcs = 14;

                        ctx.lineWidth = 3;
                        ctx.lineCap = 'round';

                        for (let i = 1; i <= totalArcs; i++) {
                            const arcRadius = (maxRadius / totalArcs) * i;
                            const arcTriggerThreshold = i / totalArcs;

                            ctx.beginPath();
                            ctx.arc(centerX, centerY, arcRadius, Math.PI * 1.0, Math.PI * 2.0);

                            if (this.lastIntensity >= arcTriggerThreshold) {
                                const alpha = 0.2 + (arcTriggerThreshold * 0.8);
                                ctx.strokeStyle = `color-mix(in srgb, ${accent} ${alpha * 100}%, #ffffff ${(i === totalArcs && this.lastIntensity > 0.9) ? '30%' : '0%'})`;
                                ctx.globalAlpha = 1.0;
                            } else {
                                ctx.strokeStyle = subTextColor;
                                ctx.globalAlpha = 0.12;
                            }
                            ctx.stroke();
                        }
                        // --- POINT CENTRAL ---
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
                        ctx.fillStyle = this.lastIntensity > 0.2 ? accent : subTextColor;
                        ctx.globalAlpha = this.lastIntensity > 0.2 ? 1.0 : 0.3;
                        if (this.lastIntensity > 0.2) {
                            ctx.shadowBlur = 8;
                            ctx.shadowColor = accent;
                        }
                        ctx.fill();
                        ctx.restore();
                    }
                };
        }
        if (initScan) {
            div.setAttribute('data-initscan', true);

            // ICI : On réinitialise immédiatement le graphique à l'instant du clic
            if (this.rssiGraphWave && typeof this.rssiGraphWave.reset === 'function') {
                this.rssiGraphWave.reset();
            }

            putJSONSync('/beginFrequencyScan', {}, (err) => {
                if (!err) {
                    if(get('scanStatusText')) get('scanStatusText').style.display = '';
                    if(get('scanStatusResult')) get('scanStatusResult').style.display = 'none';
                    if(get('btnStopScanning')) get('btnStopScanning').style.display = '';
                    ['btnRestartScanning', 'btnCopyFrequency'].forEach(id => {
                        if(get(id)) get(id).style.display = 'none';
                    });
                    // Pas de onConfirm ici : le MutationObserver posé plus haut (cf. scanObserver)
                    // déclenche déjà terminateScanUI(true) -- donc l'arrêt propre côté firmware
                    // (/endFrequencyScan) -- dès que ce div quitte le DOM, quel que soit le chemin
                    // de fermeture emprunté (bouton dédié ou requestCloseOverlay ci-dessous).
                    setOverlayLock(div, 'confirm', {
                        titleKey: 'PROMPT_FREQ_SCAN_TITLE',
                        msgKey: 'PROMPT_FREQ_SCAN_MSG',
                    });
                }
            });
        }
        return div;
    }

    setScannedFrequency() {
        let div = get('divScanFrequency');
        let freq = parseFloat(div.getAttribute('data-frequency'));
        let slid = get('slidFrequency');
        slid.value = Math.round(freq * 1000);
        somfy.frequencyChanged(slid);
        closeOverlay(div);
    }
    stopScanningFrequency(killScan) {
        let div = get('divScanFrequency');
        if (!div) return;
        if (killScan !== true) {
            closeOverlay(div);
            return;
        }
        putJSONSync('/endFrequencyScan', {}, (err, trans) => {
            if (err) {
                ui.serviceError(err);
            } else {
                let freqAttr = div.getAttribute('data-frequency');
                let freq = parseFloat(freqAttr);

                // Le scan est terminé (résultat reçu) : l'overlay peut de nouveau se fermer
                // librement, sans confirmation -- cf. setOverlayLock() posé dans scanFrequency().
                clearOverlayLock(div);

                // 1. On cache TOUJOURS le texte de recherche en cours
                if (get('scanStatusText')) get('scanStatusText').style.display = 'none';

                // 2. Gestion des boutons du footer (Stop -> Play)
                if (get('btnStopScanning')) get('btnStopScanning').style.display = 'none';
                if (get('btnRestartScanning')) get('btnRestartScanning').style.display = '';

                // 3. Analyse du résultat du scan
                if (typeof freq === 'number' && !isNaN(freq) && freq > 0) {
                    // Une fréquence a été trouvée !
                    if (get('btnCopyFrequency')) get('btnCopyFrequency').style.display = '';
                    if (get('scanStatusResult')) get('scanStatusResult').style.display = 'none'; // On cache le texte d'échec
                } else {
                    // Aucune fréquence trouvée
                    if (get('btnCopyFrequency')) get('btnCopyFrequency').style.display = 'none';
                    if (get('scanStatusResult')) get('scanStatusResult').style.display = ''; // On affiche "Aucun signal détecté..."
                }
            }
        });
    }
    terminateScanUI(killScan) {
        this.isScanClosing = true;

        if (this.scanObserver) {
            this.scanObserver.disconnect();
            this.scanObserver = null;
        }
        if (this._scanDropdownCloseHandler) {
            document.removeEventListener('click', this._scanDropdownCloseHandler);
            this._scanDropdownCloseHandler = null;
        }
        if (killScan) {
            putJSONSync('/endFrequencyScan', {}, (err) => {
                if (err) logger.error('Failed to end frequency scan:', err);
            });
        }
        let div = get('divScanFrequency');
        if (div) closeOverlay(div);
        setTimeout(() => { this.isScanClosing = false; }, 1000);
    }

    btnDown = null;
    btnTimer = null;

    // --- Maintien sur les boutons +/- de la page Radio ---------------------------------------
    // Cadence unique du defilement. Au-dessus du plancher des navigateurs (~4 ms pour setTimeout)
    // et assez fluide pour que la valeur ne paraisse pas sauter.
    holdTickMs = 60;
    // Temps que met un maintien, une fois a pleine vitesse, pour parcourir TOUTE la plage du
    // reglage. C'est ce budget qui rend l'acceleration comparable d'un curseur a l'autre.
    holdSweepMs = 6000;
    // Montee en regime apres le seuil de declenchement.
    holdRampMs = 2000;
    // Delai avant que le maintien ne prenne le relais du premier clic.
    holdDelayMs = 500;

    stepValue(sliderId, direction, multiplier = 1) {
        const slider = get(sliderId);
        if (!slider) return;
        const currentVal = parseFloat(slider.value);
        const step = parseFloat(slider.step) || 1;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        let newVal = currentVal + (step * direction * multiplier);
        if (newVal < min) newVal = min;
        if (newVal > max) newVal = max;

        slider.value = newVal;
        // bubbles OBLIGATOIRE : watchDirty() ecoute 'input' sur le CONTENEUR
        // (#divTransceiverSettings, cf. 20-shell.js:384), pas sur chaque champ. Un Event('input')
        // nu ne remonte pas -- new Event() a bubbles:false par defaut -- si bien que les boutons
        // +/- changeaient la valeur sans jamais marquer le formulaire modifie. Deplacer le curseur
        // a la souris marchait, lui, parce que l'evenement natif remonte.
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Maintien sur les boutons +/- de la page Radio.
    //
    // CE QUI N'ALLAIT PAS. Le multiplicateur était ABSOLU -- 1, puis 10, 100 et jusqu'à 1000 crans
    // par tick -- avec en prime un tick tombant à 0,5 ms. Or les quatre réglages n'ont pas du tout
    // la même amplitude : 10 crans pour la puissance d'émission, 1399 pour la fréquence, 37927 pour
    // la déviation, 75447 pour la bande passante. Le même « x1000 » franchissait donc tout le
    // domaine de la puissance en UN tick, et traversait la bande passante en une fraction de
    // seconde -- le 58,03 -> 812,50 constaté. (Le 0,5 ms était de toute façon fictif : les
    // navigateurs plafonnent setTimeout autour de 4 ms.)
    //
    // CE QUI LE REMPLACE. Cadence FIXE, et c'est le pas qui grandit -- calculé depuis l'amplitude
    // du curseur pour qu'un maintien continu mette toujours à peu près holdSweepMs à parcourir la
    // plage entière, quel que soit le réglage. La montée est quadratique : juste après le seuil on
    // avance encore cran par cran, ce qui laisse viser une valeur précise ; la pleine vitesse
    // n'est atteinte qu'au bout de holdRampMs.
    startStepHold(sliderId, direction) {
        // Nettoyage de sécurité au cas où un vieux timer traîne
        this.stopStepHold();

        // 1. Premier clic immédiat
        this.stepValue(sliderId, direction, 1);
        this.sliderStartTime = Date.now();

        // 2. Pas maximal, calculé UNE fois pour ce curseur : son nombre de crans réparti sur les
        // ticks que dure un balayage complet.
        const slider = get(sliderId);
        const span = slider
            ? Math.abs(parseFloat(slider.max) - parseFloat(slider.min)) / (parseFloat(slider.step) || 1)
            : 1;
        const maxStep = Math.max(1, span * this.holdTickMs / this.holdSweepMs);

        // 3. Boucle de défilement (fonction fléchée pour conserver le "this")
        const runHold = () => {
            const held = Date.now() - this.sliderStartTime - this.holdDelayMs;
            if (held >= 0) {
                const t = Math.min(1, held / this.holdRampMs);
                this.stepValue(sliderId, direction, Math.max(1, Math.round(maxStep * t * t)));
            }
            this.sliderTimer = setTimeout(runHold, this.holdTickMs);
        };

        // Lance le premier cycle
        this.sliderTimer = setTimeout(runHold, this.holdDelayMs);
    }

    stopStepHold() {
        // Arrêt immédiat et nettoyage propre
        if (this.sliderTimer) {
            clearTimeout(this.sliderTimer);
            this.sliderTimer = null;
        }
    }

    checkEmptyState() {
        // #divGetStarted est un SIBLING de #divAuthenticated dans le DOM (pas un descendant) --
        // masquer divAuthenticated pendant l'onboarding ne le cache donc jamais. Cette fonction est
        // déclenchée entre autres par les évènements socket procRoomsList/procShadesList, qui
        // arrivent de façon autonome dès que la connexion socket s'établit (initSockets(), lancé
        // sans condition dans Security.init()) -- indépendamment de tout clic ou navigation, donc
        // le garde-fou dans activateGrpid() seul ne suffit pas ici. Cf. bug réel : divGetStarted
        // s'affichait par-dessus le wizard quelques centaines de ms après le premier chargement.
        if (isApMode && !window.__onboardingDone) return;
        // Tant que loadSomfy() n'a pas traité sa première réponse, on ne sait pas encore s'il y a
        // vraiment 0 room/shade/group ou si les données n'ont simplement pas fini d'arriver --
        // ne rien faire ici laisse le DOM dans son état HTML par défaut (colonnes vides mais pas
        // de message "vide"/wizard) le temps du premier chargement, cf. commentaire sur
        // this.dataLoaded. Idempotent : chaque setXxxList()/procXxx appelle de toute façon
        // checkEmptyState() une fois les données réellement là.
        if (!this.dataLoaded) return;
        const getEl = id => get(id);
        const setDisp = (el, show, style = 'block') => { if (el) el.style.display = show ? style : 'none'; };
        const togglePair = (hasData, emptyId, contentId) => {
            setDisp(getEl(emptyId), !hasData);
            setDisp(getEl(contentId), hasData);
        };

        const divShadeControls = getEl('divShadeControls');
        const divGroupControls = getEl('divGroupControls');
        const divConfigPnl = getEl('divConfigPnl');
        const divHomePnl = getEl('divHomePnl');
        if (!divShadeControls || !divGroupControls) return;

        const activePill = document.querySelector('.room-pill.active');
        const currentRoomId = activePill ? parseInt(activePill.getAttribute('data-roomid'), 10) : 0;
        const isConfigOpen = divConfigPnl && divConfigPnl.style.display !== 'none';

        const shades = divShadeControls.querySelectorAll('.somfyShadeCtl');
        const groups = divGroupControls.querySelectorAll('.somfyGroupCtl');
        const hasRooms = _rooms.length > 1;
        const totalDevices = shades.length + groups.length;

        togglePair(hasRooms, 'divRoomEmptyState', 'divRoomListContent');
        togglePair(groups.length > 0, 'divGroupEmptyState', 'divGroupListContent');
        togglePair(shades.length > 0, 'divShadeEmptyState', 'divShadeListContent');

        const divRepeatList = getEl('divRepeatList');
        togglePair(divRepeatList && divRepeatList.children.length > 0, 'divRepeaterEmptyState', 'divRepeaterListContent');

        let visibleShadesCount = 0, visibleGroupsCount = 0;
        shades.forEach(el => { if (currentRoomId === 0 || parseInt(el.getAttribute('data-roomid'), 10) === currentRoomId) visibleShadesCount++; });
        groups.forEach(el => { if (currentRoomId === 0 || parseInt(el.getAttribute('data-roomid'), 10) === currentRoomId) visibleGroupsCount++; });
        const visibleCount = visibleShadesCount + visibleGroupsCount;
        const showLogoHeader = getEl('showLogoHeader');
        if (showLogoHeader) {
            showLogoHeader.style.visibility = (isConfigOpen || totalDevices > 0 || hasRooms) ? 'visible' : 'hidden';
        }
        // divGetStarted et divHomePnl sont mutuellement exclusifs : le premier ne doit s'afficher
        // QUE dans l'état vide (aucun équipement/room/groupe), auquel cas divHomePnl doit rester
        // masqué -- sinon les deux se retrouvaient affichés en même temps (divHomePnl ne dépendait
        // jusque-là que de isConfigOpen, pas de l'état vide).
        const isEmptyState = totalDevices === 0 && !hasRooms;
        if (divHomePnl) divHomePnl.style.display = (isConfigOpen || isEmptyState) ? 'none' : '';

        const divGetStarted = getEl('divGetStarted');
        const divNoDevice = getEl('divNoDevice');

        if (isEmptyState) {
            setDisp(divGetStarted, !isConfigOpen, 'flex');
            setDisp(divNoDevice, false);
            setDisp(divShadeControls, false);
            setDisp(divGroupControls, false);
        } else {
            setDisp(divGetStarted, false);
            setDisp(divNoDevice, visibleCount === 0 && !isConfigOpen, 'flex');

            if (divShadeControls) divShadeControls.style.display = isConfigOpen ? 'none' : '';
            if (divGroupControls) divGroupControls.style.display = isConfigOpen ? 'none' : '';

            const divShadeListContent = getEl('divShadeListContent');
            const divGroupListContent = getEl('divGroupListContent');
            if (divShadeListContent) divShadeListContent.style.display = visibleShadesCount === 0 ? 'none' : '';
            if (divGroupListContent) divGroupListContent.style.display = visibleGroupsCount === 0 ? 'none' : '';
        }

        // Colonne Groupes masquée / Équipements pleine largeur + centrée si aucun groupe n'est
        // visible dans la room active (couvre à la fois "0 groupe globalement" et "0 groupe dans
        // cette room précise" -- cf. .dashboard-split-container.no-groups dans base.css).
        if (divHomePnl) divHomePnl.classList.toggle('no-groups', visibleGroupsCount === 0);
    }

    // Reçoit l'événement socket 'radioActivity' (cf. emitRadioActivity() dans src/somfy/Somfy.cpp,
    // émis SANS condition -- la garde general.showRadioActivity est déjà faite côté firmware, donc
    // si ce message arrive c'est que le réglage est actif). Deux éléments partagent la classe
    // .radio-activity-dot (header mobile ET desktop, cf. index.html) : un seul appel les couvre
    // tous les deux, chacun avec son propre timer pour tolérer des pulses rapprochés sans que l'un
    // ne coupe prématurément l'éclat de l'autre.
    pulseRadioActivity() {
        document.querySelectorAll('.radio-activity-dot').forEach(el => {
            el.classList.add('pulse');
            clearTimeout(el._radioActivityTimer);
            el._radioActivityTimer = setTimeout(() => el.classList.remove('pulse'), 200);
        });
    }
    switchMobileTab(tab) {
        const container = get('dashboardContainer');
        const btnGroups = get('tabGroups');
        const btnDevices = get('tabDevices');

        if (tab === 'devices') {
            container?.classList.add('show-devices');
            btnDevices?.classList.add('active');
            btnGroups?.classList.remove('active');
        } else {
            container?.classList.remove('show-devices');
            btnGroups?.classList.add('active');
            btnDevices?.classList.remove('active');
        }
    }
    setListDraggable(list, cl, cb) {
        let el = null, gh = null, ch = false, sA = null;
        let r = null, sY = 0, cY = 0, its = [];

        const stop = () => { if(sA) cancelAnimationFrame(sA); sA = null; };
        const scroll = (y) => {
            stop();
            let sp = 0;
            if (y < 100) sp = -14;
            else if (y > window.innerHeight - 100) sp = 14;

            if (sp && gh) {
                window.scrollBy(0, sp);
                cY += sp;
                gh.style.transform = "translateY(" + (cY - sY) + "px)";
                sA = requestAnimationFrame(() => scroll(y));
                sort();
            }
        };
        const sort = () => {
            if (!el || !gh) return;
            let mid = gh.getBoundingClientRect().top + (r.height / 2);
            let idx = its.indexOf(el);

            its.forEach((it, i) => {
                if (it === el) return;
                let iM = it.getBoundingClientRect().top + (r.height / 2);
                let o = 0;
                if (mid < iM && its.indexOf(el) > i) {
                    o = r.height + 10;
                    if(i < idx) idx = i;
                } else if (mid > iM && its.indexOf(el) < i) {
                    o = -(r.height + 10);
                    if(i >= idx) idx = i + 1;
                }
                it.style.transform = o ? "translateY(" + o + "px)" : "";
            });
            el.dataset.idx = idx;
        };
        const end = () => {
            stop();
            if (gh) { gh.remove(); gh = null; }
            if (el) {
                el.classList.remove('drag-orig');
                let n = parseInt(el.dataset.idx, 10), o = its.indexOf(el);
                if (!isNaN(n) && n !== o) {
                    list.insertBefore(el, its[n] || null);
                    ch = true;
                }
            }
            its.forEach(it => it.style.transform = "");
            if (ch && typeof cb === 'function') cb(list);
            el = null; ch = false; its = [];
            list.classList.remove('dragging-active');
            // Retire les écouteurs globaux posés par start() pour CETTE session de drag -- ne
            // touche à rien qui appartienne à un autre appel de setListDraggable() (voir le
            // commentaire de start() : chaque liste room/shade/group a désormais sa propre paire
            // move/end, plus de variables globales window._drag* partagées entre elles).
            window.removeEventListener('touchmove', move);
            window.removeEventListener('touchend', end);
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', end);
        };
        const move = (e) => {
            if (!gh) return;
            if (e.cancelable) e.preventDefault();
            let t = e.touches ? e.touches[0] : e;
            cY = t.clientY;
            gh.style.transform = "translateY(" + (cY - sY) + "px)";
            scroll(cY);
            sort();
        };
        const start = (e, it) => {
            if (e.type === 'mousedown') e.preventDefault();
            el = it;
            r = el.getBoundingClientRect();
            its = Array.prototype.slice.call(list.querySelectorAll(cl));
            let t = e.touches ? e.touches[0] : e;
            sY = cY = t.clientY;

            gh = el.cloneNode(true);
            gh.className = 'drag-ghost';

            const style = window.getComputedStyle(el);
            Object.assign(gh.style, {
                width: r.width + 'px',
                height: r.height + 'px',
                top: r.top + 'px',
                left: r.left + 'px',
            });
            document.body.appendChild(gh);
            el.classList.add('drag-orig');
            // Coupe le scroll interne de la liste (overflow-y:auto, cf. .edit-motorlist/.edit-
            // roomlist/.edit-grouplist dans main.css) pendant la session de drag : sort() décale
            // les cartes voisines via transform (translateY), qui peut gonfler transitoirement le
            // débordement scrollable perçu par le moteur de rendu -- observé sur Vivaldi (barre de
            // défilement qui clignote brièvement pendant le drag, absent sur Chrome/Firefox). Le
            // scroll de la liste elle-même n'est de toute façon jamais utilisé pendant un drag :
            // scroll() plus haut ne défile QUE la page (window.scrollBy), jamais ce conteneur.
            list.classList.add('dragging-active');
            if (navigator.vibrate) navigator.vibrate(30);

            // Écouteurs globaux posés ICI (par session de drag), pas au setup de la liste --
            // setListDraggable() est appelé une fois par liste (rooms/shades/groups), et à chaque
            // rafraîchissement de chacune (setRoomsList/setShadesList/setGroupsList rappellent
            // toutes systématiquement setListDraggable() en fin de rendu). L'ancienne implémentation
            // gardait move/end dans UNE SEULE paire de handlers globaux (window._dragMoveHandler
            // etc.), partagée par les 3 listes : le dernier appel à setListDraggable() "gagnait"
            // toujours ces handlers globaux, et les 2 autres listes perdaient alors tout mousemove/
            // mouseup fonctionnel -- leur start() créait bien un ghost (mousedown/touchstart restent
            // attachés séparément par liste, ligne plus bas), mais plus rien ne le faisait suivre la
            // souris ni ne le nettoyait au relâchement : ghost bloqué indéfiniment à l'écran. Chaque
            // session de drag pose maintenant SA PROPRE paire (ajoutée ici, retirée dans end()), sans
            // dépendre d'un état partagé entre les 3 listes.
            window.addEventListener('touchmove', move, {passive:false});
            window.addEventListener('touchend', end);
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', end);
        };

        list.querySelectorAll(cl).forEach(it => {
            let h = it.querySelector('.drag-handle');
            if (h) {
                h.addEventListener('touchstart', (e) => start(e, it), {passive:true});
                h.addEventListener('mousedown', (e) => start(e, it));
            }
        });
    }
    // Gère la liaison auto-déclenchée par une trame RF reçue en mode "écoute" : soit un répéteur
    // (divLinkRepeater, écran d'attente dédié inchangé), soit une télécommande à lier à un volet
    // (overlay fusionné divRemotesOverlay, piloté par l'attribut data-searching plutôt que par la
    // présence d'une div dédiée -- cf. buildRemotesOverlay). On ignore aussi une div déjà en cours
    // de fermeture (classe overlay-exit) : sans ça, une trame reçue pendant les ~300ms d'animation
    // de fermeture pourrait encore déclencher une liaison après que l'utilisateur ait fermé la page.
    // data-searchbusy protège contre une deuxième trame reçue pendant qu'un premier POST
    // /linkRemote est encore en vol (télécommande maintenue enfoncée = trames répétées) : sans ce
    // verrou, chaque trame relancerait sa propre requête de liaison en parallèle.
    _handleLinkFrame(frame) {
        const repeaterDiv = get('divLinkRepeater');
        if (repeaterDiv) {
            const overlay = ui.waitMessage(repeaterDiv);
            putJSON('/linkRepeater', { address: frame.address }, (err, data) => {
                overlay.remove();
                repeaterDiv.remove();
                if (err) ui.serviceError(err);
                else this.setRepeaterList(data);
            });
            return;
        }

        const div = get('divRemotesOverlay');
        if (!div || div.dataset.searching !== 'true' || div.classList.contains('overlay-exit') || div.dataset.searchbusy === 'true') return;

        const shadeId = parseInt(div.dataset.shadeid, 10);
        div.dataset.searchbusy = 'true';
        putJSON('/linkRemote', { shadeId, remoteAddress: frame.address, rollingCode: frame.rcode }, (err, data) => {
            delete div.dataset.searchbusy;
            if (err) { ui.serviceError(err); return; }

            // La trame qui vient de déclencher la liaison porte déjà un RSSI exploitable : on
            // l'applique tout de suite plutôt que d'attendre que lastRssi (calculé côté firmware,
            // cf. SomfyShade::processFrame) se mette à jour à la prochaine pression sur cette
            // télécommande -- sinon le badge de signal afficherait "--" juste après la liaison.
            const linked = (data.linkedRemotes || []).find(r => r.remoteAddress === frame.address);
            if (linked && (typeof linked.lastRssi !== 'number' || linked.lastRssi <= -128)) linked.lastRssi = frame.rssi;

            this.setRemoteSearchState(div, false);
            this.setLinkedRemotesList(data);
            ui.successMessage(tr('MSG_REMOTE_LINKED_SUCCESS').replace('%s', frame.rssi));
        });
    }
    // Rafraîchit en direct le badge de signal d'une télécommande déjà liée quand l'overlay est
    // ouvert et qu'une trame lui correspond -- pur DOM/JS, aucun aller-retour serveur nécessaire
    // puisque le RSSI de la trame est déjà disponible côté client. Ne fait rien si la ligne n'est
    // pas affichée (autre volet ouvert, ou télécommande pas encore liée -- ce cas relève de
    // _handleLinkFrame ci-dessus). Inoffensif si _handleLinkFrame vient de lier/relier cette même
    // trame : le re-rendu complet qu'il déclenche affichera de toute façon la même valeur.
    _updateLiveRemoteSignal(frame) {
        const overlay = get('divRemotesOverlay');
        if (!overlay) return;
        const row = overlay.querySelector(`.somfyLinkedRemote[data-remoteaddress="${frame.address}"]`);
        if (!row) return;
        const signalEl = row.querySelector('.linkedRemote-signal');
        if (signalEl) signalEl.outerHTML = this.remoteSignalHtml(frame.rssi, frame.address);
    }
    procRemoteFrame(frame) {
        const qs = (s) => get(s);
        qs('spanRssi').innerHTML = frame.rssi;
        qs('spanFrameCount').innerHTML = parseInt(qs('spanFrameCount').innerHTML || 0, 10) + 1;

        this._handleLinkFrame(frame);
        this._updateLiveRemoteSignal(frame);

        const dt = new Date();
        const timeStr = `${dt.getHours().fmt('00')}:${dt.getMinutes().fmt('00')}:${dt.getSeconds().fmt('00')}.${dt.getMilliseconds().fmt('000')}`;
        const protos = { 1: '-W', 2: '-V' };
        const proto = protos[frame.proto] || '-S';
        const row = document.createElement('div');
        row.className = 'frame-row';
        row.dataset.valid = frame.valid;

        row.innerHTML = `<span>${frame.encKey}</span><span>${frame.address}</span><span>${frame.command}<sup>${frame.stepSize || ''}</sup></span><span>${frame.rcode}</span><span>${frame.rssi}dBm</span><span>${frame.bits}${proto}</span><span>${timeStr}</span><div class="frame-pulses">${frame.pulses.join(',')}</div>`;

        qs('divFrames').prepend(row);
        this.frames.push(frame);
    }
    JSONPretty(obj, indent = 2) {
        if (Array.isArray(obj)) {
            let output = '[';
            for (let i = 0; i < obj.length; i++) {
                if (i !== 0) output += ',\n';
                output += this.JSONPretty(obj[i], indent);
            }
            output += ']';
            return output;
        }
        else {
            let output = JSON.stringify(obj, function (k, v) {
                if (Array.isArray(v)) return JSON.stringify(v);
                return v;
            }, indent).replace(/\\/g, '')
            .replace(/\"\[/g, '[')
            .replace(/\]\"/g, ']')
            .replace(/\"\{/g, '{')
            .replace(/\}\"/g, '}')
            .replace(/\{\n\s+/g, '{');
            return output;
        }
    }
    framesToClipboard() {
        if (typeof navigator.clipboard !== 'undefined')
            navigator.clipboard.writeText(this.JSONPretty(this.frames, 2));
        else {
            let dummy = document.createElement('textarea');
            document.body.appendChild(dummy);
            dummy.value = this.JSONPretty(this.frames, 2);
            dummy.focus();
            dummy.select();
            document.execCommand('copy');
            document.body.removeChild(dummy);
        }
    }
    sendVRCommand(el) {
        let pnl = get('divVirtualRemote');
        let dd = pnl.querySelector('#selVRMotor');
        let opt = dd.selectedOptions[0];
        let o = {
            type: opt.getAttribute('data-type'),
            address: opt.getAttribute('data-address'),
            cmd: el.getAttribute('data-cmd')
        };
        ui.fromElement(el.parentElement.parentElement, o);
        switch (o.type) {
            case 'shade':
                o.shadeId = parseInt(opt.getAttribute('data-shadeId'), 10);
                o.shadeType = parseInt(opt.getAttribute('data-shadeType'), 10);
                break;
            case 'group':
                o.groupId = parseInt(opt.getAttribute('data-groupId'), 10);
                break;
        }
        logger.debug('Virtual remote command:', o);
        let fnRepeatCommand = (err, shade) => {
            if (this.btnTimer) {
                clearTimeout(this.btnTimer);
                this.btnTimer = null;
            }
            if (err) return;
            if (mouseDown) {
                if (o.cmd === 'Sensor')
                    somfy.sendSetSensor(o);
                else if (o.type === 'group')
                    somfy.sendGroupRepeat(o.groupId, o.cmd, null, fnRepeatCommand);
                else
                    somfy.sendCommandRepeat(o, fnRepeatCommand);
            }
        }
        o.command = o.cmd;
        if (o.cmd === 'Sensor') {
            somfy.sendSetSensor(o);
        }
        else if (o.type === 'group')
            somfy.sendGroupCommand(o.groupId, o.cmd, null, (err, group) => { fnRepeatCommand(err, group); });
        else
            somfy.sendCommand(o, (err, shade) => { fnRepeatCommand(err, shade); });
    }
    sendSetSensor(obj, cb) {
        putJSON('/setSensor', obj, (err, device) => {
            if (typeof cb === 'function') cb(err, device);
        });
    }
    updateRadioGraph() {
        const g = (id) => document.getElementById(id);
        const freqRaw = parseFloat(g('slidFrequency')?.value) || 433000;
        const bwRaw = parseFloat(g('slidRxBandwidth')?.value) || 5803;
        const devRaw = parseFloat(g('slidDeviation')?.value) || 158;
        const txRaw = parseInt(g('slidTxPower')?.value, 10) || 0;
        const freqCentral = freqRaw / 1000;
        const rxBandwidthMHz = (bwRaw / 100) / 1000;
        const deviationMHz = (devRaw / 100) / 1000;
        const txPower = this.txPowerLevels[txRaw];
        const freqMin = freqCentral - (rxBandwidthMHz / 2);
        const freqMax = freqCentral + (rxBandwidthMHz / 2);

        // Les trois valeurs vivent dans des <span> HTML au-dessus du graphe, jamais dans le SVG :
        // #radioGraphSvg est en preserveAspectRatio="none" pour que la courbe s'étire sur toute la
        // largeur disponible, ce qui déformerait horizontalement n'importe quel <text> qu'on y
        // mettrait. Trois lignes visant des #textFreqMin/Central/Max survivaient ici et ne
        // trouvaient rien -- ces identifiants n'existent pas, et il ne faut pas les recréer dans
        // le SVG : c'est précisément ce que ce découpage évite. Même famille de vestige que le
        // #inputStepSize documenté dans stepSizeChanged() plus bas.
        if (g('graphFreqMin')) g('graphFreqMin').textContent = freqMin.toFixed(3) + " MHz";
        if (g('graphFreqCentral')) g('graphFreqCentral').textContent = freqCentral.toFixed(3) + " MHz";
        if (g('graphFreqMax')) g('graphFreqMax').textContent = freqMax.toFixed(3) + " MHz";

        const xCentral = 400;
        const yBaseline = 100;
        const slidRx = g('slidRxBandwidth');
        const maxBwSliderReal = slidRx ? (parseFloat(slidRx.max) / 100) / 1000 : 0.8125;

        const maxWidthUtilePx = 740;
        let rxWidthPx = (rxBandwidthMHz / maxBwSliderReal) * maxWidthUtilePx;

        const minWidthPx = 140;
        rxWidthPx = Math.min(Math.max(rxWidthPx, minWidthPx), maxWidthUtilePx);

        const xMin = xCentral - (rxWidthPx / 2);
        const xMax = xCentral + (rxWidthPx / 2);

        let devWidthPx = ((deviationMHz * 2) / maxBwSliderReal) * maxWidthUtilePx;
        devWidthPx = Math.min(Math.max(devWidthPx, 8), 780);

        const xDevMin = xCentral - (devWidthPx / 2);
        const xDevMax = xCentral + (devWidthPx / 2);
        const minTx = -30;
        const maxTx = 12;
        let txPct = (txPower - minTx) / (maxTx - minTx);
        txPct = Math.min(Math.max(txPct, 0), 1);

        const ySommet = yBaseline - (txPct * 200);
        const ySommetReel = (yBaseline + ySommet) / 2;
        const curve = g('graphCurve');
        if (curve) {
            curve.setAttribute('d', `M ${xMin},${yBaseline} Q ${xCentral},${ySommet} ${xMax},${yBaseline}`);

            if (txPower > 5) {
                // Mets ici la couleur de ton choix, par exemple du rouge ou ta variable accent-color
                curve.style.stroke = 'var(--color-accent)';
            } else {
                // Si inférieur à 5, on vide le style inline pour que le CSS prenne le relais
                curve.style.stroke = '';
            }
        }
        const devArea = g('graphDeviationArea');
        if (devArea) {
            devArea.setAttribute('d', `M ${xDevMin},${yBaseline} Q ${xCentral},${ySommet + 4} ${xDevMax},${yBaseline}`);

            if (deviationMHz * 2 > rxBandwidthMHz) {
                devArea.style.stroke = '#FF5252';
                devArea.style.fill = 'rgba(255, 82, 82, 0.15)';
            } else {
                devArea.style.stroke = 'color-mix(in srgb, var(--color-accent) 60%, transparent)';
                devArea.style.fill = 'color-mix(in srgb, var(--color-accent) 10%, transparent)';
            }
        }
        const lMin = g('graphLineMin');
        if (lMin) { lMin.setAttribute('x1', xMin); lMin.setAttribute('x2', xMin); }
        const lMax = g('graphLineMax');
        if (lMax) { lMax.setAttribute('x1', xMax); lMax.setAttribute('x2', xMax); }

        const lCentral = g('graphLineCentral');
        if (lCentral) {
            lCentral.setAttribute('x1', xCentral); lCentral.setAttribute('y1', yBaseline);
            lCentral.setAttribute('x2', xCentral); lCentral.setAttribute('y2', ySommetReel);
        }
    }
    // ==========================================================================
    // CHANGER LE SLIDER -> MET À JOUR L'INPUT NUMBER
    // ==========================================================================
    deviationChanged(el) {
        get('inputDeviation').value = (el.value / 100).fmt('#,##0.00');
        this.updateRadioGraph();
    }

    rxBandwidthChanged(el) {
        get('inputRxBandwidth').value = (el.value / 100).fmt('#,##0.00');
        this.updateRadioGraph();
    }

    frequencyChanged(el) {
        get('inputFrequency').value = (el.value / 1000).fmt('#,##0.000');
        this.updateRadioGraph();
    }

    txPowerChanged(el) {
        // Va chercher la valeur correspondante à l'index du slider (0 à 10)
        const lvls = this.txPowerLevels;
        get('inputTxPower').value = lvls[el.value] !== undefined ? lvls[el.value] : '';
        this.updateRadioGraph();
    }

    stepSizeChanged(el) {
        // La valeur s'affiche dans un <span> (#spanStepSize), pas dans un <input> : c'est
        // innerText qu'il faut écrire, pas .value. L'ancien code visait un #inputStepSize qui
        // n'a jamais existé dans le HTML, d'où un TypeError à chaque mouvement du curseur.
        // Le masque reprend le data-fmtmask du span, pour rester cohérent avec la valeur que
        // ui.toElement y écrit au chargement.
        const span = get('spanStepSize');
        if (span) span.innerText = parseInt(el.value, 10).fmt('#,##0');
    }

    // ==========================================================================
    // NOUVEAU : CHANGER L'INPUT NUMBER (CLAVIER) -> MET À JOUR LE SLIDER
    // ==========================================================================

    frequencyInputChanged(el) {
        let val = parseFloat(el.value);
        // On récupère les limites du HTML (converties selon ton multiplicateur x1000)
        let minAllowed = parseFloat(el.getAttribute('min')) / 1000;
        let maxAllowed = parseFloat(el.getAttribute('max')) / 1000;

        if (!isNaN(val) && val >= minAllowed && val <= maxAllowed) {
            get('slidFrequency').value = Math.round(val * 1000);
            this.updateRadioGraph();
        } else {
            // Erreur : valeur hors limites ou invalide
            this.showInputError(el);
            // Optionnel : on restaure la valeur valide du slider
            this.frequencyChanged(get('slidFrequency'));
        }
    }

    rxBandwidthInputChanged(el) {
        let val = parseFloat(el.value);
        let minAllowed = parseFloat(el.getAttribute('min'));
        let maxAllowed = parseFloat(el.getAttribute('max'));

        if (!isNaN(val) && val >= minAllowed && val <= maxAllowed) {
            get('slidRxBandwidth').value = Math.round(val * 100);
            this.updateRadioGraph();
        } else {
            this.showInputError(el);
            this.rxBandwidthChanged(get('slidRxBandwidth'));
        }
    }

    deviationInputChanged(el) {
        let val = parseFloat(el.value);
        // Dans ton HTML min="158" et max="38085" (ce qui correspond à /100)
        let minAllowed = parseFloat(el.getAttribute('min')) / 100;
        let maxAllowed = parseFloat(el.getAttribute('max')) / 100;

        if (!isNaN(val) && val >= minAllowed && val <= maxAllowed) {
            get('slidDeviation').value = Math.round(val * 100);
            this.updateRadioGraph();
        } else {
            this.showInputError(el);
            this.deviationChanged(get('slidDeviation'));
        }
    }

    // Pendant clavier de txPowerChanged(), sur le modèle de ses trois voisines -- il manquait, si
    // bien que l'onchange de #inputTxPower (index.html) levait un TypeError : la puissance était le
    // seul des quatre réglages radio dont la saisie au clavier ne suivait pas le curseur.
    // Seule différence avec les trois autres, et elle est structurelle : la valeur saisie doit
    // exister DANS la table (indexOf), un encadrement min/max ne suffit pas -- le CC1101 n'accepte
    // que ces onze niveaux, pas un continuum. Le reste suit la même mécanique : valeur refusée =
    // signalement visuel puis retour à ce qu'affiche le curseur.
    txPowerInputChanged(el) {
        const ndx = this.txPowerLevels.indexOf(parseFloat(el.value));
        if (ndx !== -1) {
            get('slidTxPower').value = ndx;
            this.updateRadioGraph();
        } else {
            this.showInputError(el);
            this.txPowerChanged(get('slidTxPower'));
        }
    }

    showInputError(el) {
        el.classList.add('input-error');
        // On retire la classe après 500ms pour pouvoir re-déclencher l'animation plus tard
        setTimeout(() => {
            el.classList.remove('input-error');
        }, 500);
    }


    // =========================================================================
    // SECTION : GESTION DES PIÈCES (ROOMS)
    // =========================================================================
    procRoomAdded(room) {
        let r = _rooms.find(x => x.roomId === room.roomId);
        if (typeof r === 'undefined' || !r) {
            _rooms.push(room);
            _rooms.sort((a, b) => { return a.sortOrder - b.sortOrder });
            this.setRoomsList(_rooms);
            this.checkEmptyState();
        }
    }
    procRoomRemoved(room) {
        if (room.roomId === 0) return;
        let r = _rooms.find(x => x.roomId === room.roomId);
        if (typeof r !== 'undefined' && r.roomId === room.roomId) {
            // !== , pas === : on retire la pièce supprimée et on garde toutes les autres. Tel
            // quel (===), le filtre ne gardait QUE la pièce en train d'être supprimée et effaçait
            // toutes les autres de _rooms -- reproductible en direct dès qu'un événement socket
            // 'roomRemoved' arrive (ex: pièce supprimée depuis un autre onglet/appareil).
            _rooms = _rooms.filter(x => x.roomId !== room.roomId);
            _rooms.sort((a, b) => { return a.sortOrder - b.sortOrder });
            this.setRoomsList(_rooms);
            this.checkEmptyState();
            let rs = get('divRoomSelector');
            let ss = get('divShadeControls');
            let gs = get('divGroupControls');
            let ctls = ss.querySelectorAll('.somfyShadeCtl');
            for (let i = 0; i < ctls.length; i++) {
                let x = ctls[i];
                if (parseInt(x.getAttribute('data-roomid'), 10) === room.roomId)
                    x.setAttribute('data-roomid', '0');
            }
            ctls = gs.querySelectorAll('.somfyGroupCtl');
            for (let i = 0; i < ctls.length; i++) {
                let x = ctls[i];
                if (parseInt(x.getAttribute('data-roomid'), 10) === room.roomId)
                    x.setAttribute('data-roomid', '0');
            }
            if (parseInt(rs.getAttribute('data-roomid'), 10) === room.roomId) this.selectRoom(0);
        }
    }
    selectRoom(roomId) {
        document.querySelectorAll('.room-pill').forEach(pill => {
            const pId = parseInt(pill.getAttribute('data-roomid'), 10);
            pill.classList.toggle('active', pId === roomId);
        });

        // Filtre les deux types de cartes -- l'ancienne version ne touchait qu'aux volets,
        // laissant les groupes visibles quelle que soit la pièce sélectionnée.
        document.querySelectorAll('.somfyShadeCtl').forEach(x => {
            const rId = parseInt(x.getAttribute('data-roomid'), 10);
            x.style.display = (roomId === 0 || rId === roomId) ? '' : 'none';
        });
        document.querySelectorAll('.somfyGroupCtl').forEach(x => {
            const rId = parseInt(x.getAttribute('data-roomid'), 10);
            x.style.display = (roomId === 0 || rId === roomId) ? '' : 'none';
        });

        // Auto-scroll vers la pilule cliquée.
        const activePill = document.querySelector(`.room-pill[data-roomid="${roomId}"]`);
        if (activePill) {
            activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }

        this.checkEmptyState();
    }
    // Recalcule le badge de comptage (volets + groupes) de chaque pilule de pièce, à partir des
    // tableaux déjà maintenus par la classe (this.shades/this.groups) plutôt que du DOM, pour
    // rester correct même quand une colonne est masquée (0 groupe) ou filtrée par room.
    updateRoomCounts() {
        const shades = this.shades || [];
        const groups = this.groups || [];
        document.querySelectorAll('.room-pill').forEach(pill => {
            const roomId = parseInt(pill.getAttribute('data-roomid'), 10);
            const countEl = pill.querySelector('.room-count');
            if (!countEl) return;
            const count = (roomId === 0)
                ? shades.length + groups.length
                : shades.filter(s => s.roomId === roomId).length + groups.filter(g => g.roomId === roomId).length;
            countEl.innerText = count;
        });
    }

    setRoomsList(rooms) {
        let divCfg = '';
        const homeName = tr('HOME');
        const slider = get('divRoomSelector');
        let divPills = `<div class="room-pill active" data-roomid="0" onclick="somfy.selectRoom(0)"><span>${homeName}</span><span class="room-count">0</span></div>`;
        let divOpts = `<option value="0">${homeName}</option>`;
        _rooms = [{ roomId: 0, name: homeName }];

        rooms.sort((a, b) => a.sortOrder - b.sortOrder);
        rooms.forEach(room => {
            divPills += `<div class="room-pill animScale" data-roomid="${room.roomId}" onclick="somfy.selectRoom(${room.roomId})"><span>${escHtml(room.name)}</span><span class="room-count">0</span></div>`;

            // Même design que les cartes volet/groupe (setShadesList/setGroupsList) : carte entière
            // cliquable, crayon retiré, poignée/poubelle isolent leur clic (event.stopPropagation()).
            // Différences propres à la pièce : pas d'idRemoteAddress (une pièce n'a pas d'ID radio)
            // et icône fixe svg-emptyRoom (pas de mapping par type).
            divCfg += `<div class="somfyRoom room-draggable" data-roomid="${room.roomId}" onclick="somfy.openEditRoom(${room.roomId});">
            <div class="drag-handle" onclick="event.stopPropagation();"><svg class="icon-svg"><use href=#svg-drag></use></svg></div>
            <div class="shade-icon-wrapper"><svg><use href="#svg-emptyRoom"></use></svg></div>
            <div class="room-name"><span class="name-text">${escHtml(room.name)}</span></div>
            <div class="divEditDelete-svg" onclick="event.stopPropagation(); somfy.deleteRoom(${room.roomId});"><svg class="icon-svg" style="color: var(--color-danger);"><use href=#svg-trash></use></svg></div>
            </div>`;

            divOpts += `<option value="${room.roomId}">${escHtml(room.name)}</option>`;
            _rooms.push(room);
        });

        slider.innerHTML = divPills;
        slider.style.display = 'flex';

        const navContainer = document.querySelector('.room-nav-container');
        if(navContainer) navContainer.style.display = rooms.length === 0 ? 'none' : 'flex';

        get('divRoomList').innerHTML = divCfg;
        get('selShadeRoom').innerHTML = divOpts;
        get('selGroupRoom').innerHTML = divOpts;

        this.checkEmptyState();
        this.updateRoomCounts();
        this.setListDraggable(get('divRoomList'), '.room-draggable', (list) => {
            let order = Array.from(list.querySelectorAll('.room-draggable')).map(item =>
            parseInt(item.getAttribute('data-roomid'), 10)
            );
            putJSONSync('/roomSortOrder', order, (err) => {
                if (err) ui.serviceError(err);
                else this.updateRoomsList();
            });
        });

        this.initRoomScroll(slider);
    }
    initRoomScroll(c) {
        if (!c) return;
        const parent = c.parentElement; // .room-nav-container

        // setRoomsList() ré-appelle initRoomScroll() à chaque rafraîchissement de la liste
        // des pièces, sur ce même élément <div id="divRoomSelector"> (jamais recréé, seul son
        // innerHTML change). On n'attache donc les écouteurs qu'une seule fois par élément,
        // sous peine de les empiler à chaque rafraîchissement (ex. le wheel-scroll deviendrait
        // N fois plus rapide après N rechargements de la liste).
        if (!c._scrollInit) {
            c._scrollInit = true;

            // Gestion dynamique du masque selon la position du scroll. Rangée sur l'élément
            // pour rester rappelable (resize, rendu suivant) sans réattacher les écouteurs.
            c._updateRoomMasks = () => {
                if (!parent) return;

                const maxScroll = c.scrollWidth - c.clientWidth;

                // S'il n'y a pas assez d'éléments pour scroller, on retire les masques
                if (maxScroll <= 5) {
                    parent.classList.remove('mask-right', 'mask-both', 'mask-left');
                    parent.classList.add('mask-none');
                    return;
                }

                const currentScroll = c.scrollLeft;
                const isAtStart = currentScroll <= 5;
                const isAtEnd = currentScroll >= maxScroll - 5;

                parent.classList.remove('mask-none', 'mask-right', 'mask-both', 'mask-left');
                parent.classList.add(isAtStart ? 'mask-right' : (isAtEnd ? 'mask-left' : 'mask-both'));
            };

            // Écoute du défilement, throttlée sur requestAnimationFrame : un scroll (molette,
            // tactile, drag) peut déclencher l'événement bien plus vite qu'une frame d'écran,
            // inutile de recalculer/relire scrollWidth à chaque occurrence.
            let scrollTicking = false;
            c.addEventListener('scroll', () => {
                if (scrollTicking) return;
                scrollTicking = true;
                requestAnimationFrame(() => { c._updateRoomMasks(); scrollTicking = false; });
            }, { passive: true });

            // Recalcul sur redimensionnement (rotation mobile, repli de sidebar, zoom
            // navigateur...) : le nombre de pastilles visibles peut changer sans que la liste
            // des pièces soit re-rendue.
            window.addEventListener('resize', () => c._updateRoomMasks());

            // Un onglet chargé en arrière-plan (ou minimisé) suspend requestAnimationFrame :
            // le recalcul planifié par _scheduleRoomMaskUpdate() ne se déclenche alors qu'au
            // retour au premier plan.
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') c._updateRoomMasks();
            });

            // Scroll à la molette — seulement si la barre déborde réellement, pour ne pas
            // capturer le scroll vertical de la page quand tout tient déjà à l'écran.
            c.addEventListener('wheel', (e) => {
                if (!e.deltaY) return;
                if (c.scrollWidth - c.clientWidth <= 5) return;
                e.preventDefault();
                c.scrollLeft += e.deltaY * 2.5;
            }, { passive: false });

            // Drag-to-scroll à la souris (PC)
            let isDown = false, startX, scrollLeft;
            c.onmousedown = (e) => {
                isDown = true;
                c.style.cursor = 'grabbing';
                startX = e.pageX - c.offsetLeft;
                scrollLeft = c.scrollLeft;
            };

            const stop = () => {
                isDown = false;
                c.style.cursor = 'grab';
            };
            c.onmouseleave = c.onmouseup = stop;

            c.onmousemove = (e) => {
                if (!isDown) return;
                e.preventDefault();
                c.scrollLeft = scrollLeft - (e.pageX - c.offsetLeft - startX) * 1.5;
            };
        }

        // Recalcul après (re)rendu de la liste : le nombre/largeur des pastilles a pu changer
        // (ajout/suppression de pièce, changement de langue...).
        this._scheduleRoomMaskUpdate();
    }
    // Planifie un recalcul du masque en laissant le navigateur poser le layout du innerHTML
    // injecté avant de mesurer scrollWidth. Double rAF dans le cas normal (attend la frame
    // suivant le layout) ; si l'onglet est en arrière-plan, requestAnimationFrame est suspendu
    // par le navigateur et ne se déclenchera qu'au retour au premier plan (couvert par
    // l'écouteur visibilitychange), donc on passe par un setTimeout classique à la place.
    _scheduleRoomMaskUpdate() {
        const c = get('divRoomSelector');
        if (!c || !c._updateRoomMasks) return;
        if (document.visibilityState === 'hidden') {
            setTimeout(() => c._updateRoomMasks(), 100);
        } else {
            requestAnimationFrame(() => requestAnimationFrame(() => c._updateRoomMasks()));
        }
    }

    showEditRoom(bShow) {
        let el = get('divLinkRepeater');
        if (el) el.remove();
        el = get('divPairing');
        if (el) el.remove();
        el = get('divRollingCode');
        if (el) el.remove();
        el = get('divRemotesOverlay');
        if (el) el.remove();
        // Pas d'équivalent de get('somfyShade')/get('somfyGroup') ici : contrairement au volet et au
        // groupe, l'édition d'une pièce se fait dans une modale construite à la volée
        // (RoomOverlay -> #divEditRoomOverlay), pas dans un panneau en place qu'il faudrait
        // afficher. Un get('somfyRoom') survivait de la conception précédente et ne trouvait
        // jamais rien -- PIÈGE : `somfyRoom` existe toujours, mais comme CLASSE portée par chaque
        // carte de la liste (cf. setRoomsList). Le "réparer" en querySelector('.somfyRoom')
        // masquerait une carte au lieu d'ouvrir quoi que ce soit.
        el = get('divRoomListContainer');
        if (el) el.style.display = bShow ? 'none' : '';
        if (bShow) {
            this.showEditGroup(false);
            this.showEditShade(false);
        }
    }
    openEditRoom(roomId) {
        // Ouverture "normale" (depuis la liste des pièces) : jamais un retour vers un volet/groupe.
        this._roomInlineReturnContext = null;
        confirmDiscardChanges(() => this._openEditRoom(roomId));
    }
    // Création de pièce à la volée depuis l'édition d'un volet/groupe (bouton + à côté du
    // sélecteur de pièce) : contourne volontairement confirmDiscardChanges, le formulaire d'origine
    // reste ouvert derrière et ses modifications ne doivent pas être remises en cause. `context`
    // ('shade' ou 'group') indique quel sélecteur re-sélectionner automatiquement après la création.
    openAddRoomInline(context) {
        this._roomInlineReturnContext = context;
        this._openEditRoom(undefined);
    }
    _openEditRoom(roomId) {
        if (typeof roomId === 'undefined') {
            if (_rooms.length >= 15) {
                ui.errorMessage(get('divSomfySettings'), tr('ERR_ROOM_LIMIT_REACHED'));
                return;
            }
            getJSONSync('/getNextRoom', (err, room) => {
                if (err) ui.serviceError(err);
                else {
                    room.name = '';
                    this.RoomOverlay('*', room);
                }
            });
        }
        else {
            getJSONSync(`/room?roomId=${roomId}`, (err, room) => {
                if (err) ui.serviceError(err);
                else {
                    this.RoomOverlay(roomId, room);
                }
            });
        }
    }

    RoomOverlay(roomId, roomData) {
        if (get('divEditRoomOverlay')) return;

        // Déduction automatique : si roomId est '*' ou falsy => Mode Ajout, sinon => Mode Édition
        const isEdit = roomId && roomId !== '*';

        const titleKey   = isEdit ? 'ROOM_TITLE_EDIT' : 'ROOM_TITLE_ADD';
        const descKey     = isEdit ? 'ROOM_TITLE_EDIT_DESC' : 'ROOM_TITLE_ADD_DESC';
        const buttonText = isEdit ? tr('BT_SAVE') : tr('BT_CREATE');
        const iconHref   = isEdit ? '#svg-save' : '#svg-add';

        let div = document.createElement('div');
        div.id = 'divEditRoomOverlay';
        div.className = 'modal-overlay';
        div.setAttribute('data-roomid', roomId);

        const presetsHTML = Array.from({ length: 8 }, (_, i) =>
        `<span class="preset-badge">${tr(`ROOM_PRESET_${i}`)}</span>`
        ).join('');

        div.innerHTML = `
        <div class="message-content room-content">
        ${modalHeader(titleKey, 'svg-emptyRoom', {
            subtitle: descKey,
            rightContent: `<div class="somfyMaxId"><span id="spanRoomId">${roomId}</span>/<span id="spanMaxRooms">${roomData.maxRooms || 14}</span></div>`
        })}
        <div class="overlay-scroll-content">
        <div class="uniblocCol dirty-target">
        <label class="label" for="fldRoomName">${tr('NAME')}</label>
        <input id="fldRoomName" class="inputAndSelect" name="roomName" data-bind="name" type="text" length=20 placeholder="${tr('ROOM_NAME_PHL')}">
        </div>
        <div class="room-presets">
        ${presetsHTML}
        </div>
        </div>
        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnRoomGoBack" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnSaveRoom" type="button">
        <svg><use id="useSaveRoomIcon" href="${iconHref}"></use></svg>
        <span id="btnSaveRoomText">${buttonText}</span>
        </button>
        </div>
        </div>
        </div>`;

        shOverlay(div);
        ui.toElement(div, roomData);
        watchDirty(div);

        div.onclick = (e) => {
            const target = e.target;

            if (target.classList.contains('preset-badge')) {
                const input = div.querySelector('#fldRoomName');
                input.value = target.innerText;
                // bubbles: meme raison qu'en stepValue -- watchDirty() ecoute sur `div`.
                input.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
            if (target.id === 'btnRoomGoBack' || target.closest('#btnRoomGoBack')) {
                confirmDiscardChanges(() => {
                    this._roomInlineReturnContext = null;
                    closeOverlay(div);
                });
                return;
            }
            if (target.id === 'btnSaveRoom' || target.closest('#btnSaveRoom')) {
                this.saveRoom(div);
                return;
            }
        };
    }
    saveRoom(overlayEl) {
        if (!overlayEl) overlayEl = get('divEditRoomOverlay');
        if (!overlayEl) return;

        let roomId = parseInt(overlayEl.querySelector('#spanRoomId').innerText, 10);
        let obj = ui.fromElement(overlayEl);
        let valid = true;

        if (valid && (typeof obj.name !== 'string' || obj.name === '' || obj.name.length > 20)) {
            ui.errorMessage(get('divSomfySettings'), tr('ERR_ROOM_NAME_INVALID'));
            valid = false;
        }

        if (valid) {
            if (isNaN(roomId) || roomId === 0) {
                putJSONSync('/addRoom', obj, (err, room) => {
                    if (err) {
                        ui.serviceError(err);
                        logger.error('Failed to add room:', err);
                    }
                    else {
                        logger.debug('Room added:', room);
                        ui.successMessage(tr('MSG_ADD_SUCCESS'));
                        clearDirty(overlayEl);
                        // Création à la volée depuis un volet/groupe : une fois les listes de
                        // pièces rafraîchies (la nouvelle option doit exister avant qu'on puisse
                        // la sélectionner), on resélectionne automatiquement la pièce créée dans
                        // le formulaire d'origine, resté ouvert derrière cet overlay.
                        const returnCtx = this._roomInlineReturnContext;
                        this._roomInlineReturnContext = null;
                        this.updateRoomsList(() => {
                            if (!returnCtx) return;
                            const sel = get(returnCtx === 'group' ? 'selGroupRoom' : 'selShadeRoom');
                            if (!sel) return;
                            sel.value = room.roomId;
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                        closeOverlay(overlayEl);
                    }
                });
            }
            else {
                obj.roomId = roomId;
                putJSONSync('/saveRoom', obj, (err, room) => {
                    if (err) {
                        ui.serviceError(err);
                        logger.error('Failed to save room:', err);
                    } else {
                        ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                        logger.debug('Room saved:', room);
                        clearDirty(overlayEl);
                        this.updateRoomsList();
                        closeOverlay(overlayEl);
                    }
                });
            }
        }
    }
    deleteRoom(roomId) {
        let valid = true;
        if (isNaN(roomId) || roomId >= 255 || roomId <= 0) {
            ui.errorMessage(tr('ERR_ROOM_ID_REQUIRED'));
            valid = false;
        }
        if (valid) {
            getJSONSync(`/room?roomId=${roomId}`, (err, room) => {
                if (err) ui.serviceError(err);
                else {
                    let prompt = ui.promptMessage(tr('PROMPT_DELETE_ROOM'), () => {
                        ui.clearErrors();
                        putJSONSync('/deleteRoom', { roomId: roomId }, (err, room) => {
                            prompt.remove();
                            if (err) ui.serviceError(err);
                            else
                                this.updateRoomsList();
                        });
                    });
                    prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_DELETE_ROOM_WARNING")}</p>`;
                }
            });
        }
    }
    updateRoomsList(cb) {
        getJSONSync('/rooms', (err, shades) => {
            if (err) {
                logger.error('Failed to load rooms:', err);
                ui.serviceError(err);
            }
            else {
                this.setRoomsList(shades);
                if (typeof cb === 'function') cb();
            }
        });
    }

    // =========================================================================
    // SECTION : GESTION DES ÉQUIPEMENTS (DEVICES/SHADES)
    // =========================================================================

    setShadesList(shades) {
        this.shades = shades;
        let divCfg = '';
        let divCtl = '';
        shades.sort((a, b) => { return a.sortOrder - b.sortOrder });
        logger.debug('Shade list updated,', shades.length, 'shades');
        let roomId = document.querySelector('.room-pill.active') ? parseInt(document.querySelector('.room-pill.active').getAttribute('data-roomid'), 10) : 0;
        let vrList = get('selVRMotor');
        // First get the optiongroup for the shades.
        let optGroup = get('optgrpVRShades');
        if (typeof shades === 'undefined' || shades.length === 0) {
            if (optGroup && typeof optGroup !== 'undefined') optGroup.remove();
        }
        else {
            if (typeof optGroup === 'undefined' || !optGroup) {
                optGroup = document.createElement('optgroup');
                optGroup.setAttribute('id', 'optgrpVRShades');
                optGroup.setAttribute('label', tr('SUBTAB_DEVICES'));
                vrList.appendChild(optGroup);
            }
            else {
                optGroup.innerHTML = '';
            }
        }
        for (let i = 0; i < shades.length; i++) {
            let shade = shades[i];
            let room = _rooms.find(x => x.roomId === shade.roomId) || { roomId: 0, name: '' };
            let isLightOn = (shade.flags & 0x08);
            let isSunOn = (shade.flags & 0x01);
            let st = this.shadeTypes.find(x => x.type === shade.shadeType) || { type: shade.shadeType, ico: 'svg-window-shade', indic: 'svg-indicRoller' };

            // Carrousel de contrôles : le nombre de pages dépend des capacités réelles du volet.
            // - Impulsionnel (garage/portail 1-bouton, contact sec, cf. noMyShadeTypes -- même liste
            //   que celle utilisée pour masquer le bouton MY des plannings) : une seule page, un
            //   unique gros bouton (pas de notion de position réelle, cf. SomfyShade::isToggle()).
            // - Sinon : page Boutons (Haut/My/Bas) systématique, + page Position, + page Inclinaison
            //   si le volet gère le tilt (shade.tiltType > 0, ex: BSO/store vénitien).
            const isSimpleShade = this.noMyShadeTypes.includes(shade.shadeType);
            const shadeHasTilt = shade.tiltType > 0;
            const buttonsPage = isSimpleShade ? `
            <div class="carousel-page">
            <div class="shadectl-buttons groupctl-buttons" data-shadeType="${shade.shadeType}">
            <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="toggle" data-shadeid="${shade.shadeId}"><svg><use href="#svg-toggle"></use></svg></div>
            </div>
            </div>` : `
            <div class="carousel-page">
            <div class="shadectl-buttons groupctl-buttons" data-shadeType="${shade.shadeType}">
            <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="up" data-shadeid="${shade.shadeId}"><svg><use href="#svg-up"></use></svg></div>
            <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="my" data-shadeid="${shade.shadeId}"><svg><use href="#svg-my"></use></svg></div>
            <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="down" data-shadeid="${shade.shadeId}"><svg><use href="#svg-down"></use></svg></div>
            </div>
            </div>`;
            const positionPage = !isSimpleShade ? `
            <div class="carousel-page">
            <div class="slider-wrapper">
            <div class="slider-progress" style="width:${shade.position}%;"><div class="slider-thumb-line"></div></div>
            <input type="range" class="md3-range-input carousel-slider-pos" min="0" max="100" step="1" value="${shade.position}" data-realpos="${shade.position}" oninput="syncSliderProgress(this);" onpointerdown="sliderDragStart(this);" onkeydown="sliderDragStart(this);" onkeyup="sliderDragEnd(this);" onchange="somfy.commitSliderTarget(this, ${shade.shadeId}, false);">
            </div>
            <div class="button-outline cmd-button btn-somfy-svg animScale btn-page-my" data-cmd="my" data-shadeid="${shade.shadeId}"><svg><use href="#svg-my"></use></svg></div>
            </div>` : '';
            const tiltPage = (!isSimpleShade && shadeHasTilt) ? `
            <div class="carousel-page">

            <div class="slider-wrapper tilt-slider">
            <div class="slider-progress" style="width:${shade.tiltPosition}%;">
            <div class="slider-thumb-line"></div>
            </div>
            <input type="range" class="md3-range-input carousel-slider-tilt" min="0" max="100" step="1" value="${shade.tiltPosition}" data-realpos="${shade.tiltPosition}" oninput="syncSliderProgress(this);" onpointerdown="sliderDragStart(this);" onkeydown="sliderDragStart(this);" onkeyup="sliderDragEnd(this);" onchange="somfy.commitSliderTarget(this, ${shade.shadeId}, true);">
            </div>

            <div class="button-outline cmd-button btn-somfy-svg animScale btn-page-my" data-cmd="my" data-shadeid="${shade.shadeId}"><svg><use href="#svg-my"></use></svg></div>


            </div>` : '';
            const carouselPages = [buttonsPage, positionPage, tiltPage].filter(p => p !== '');
            const totalPages = carouselPages.length;

            // Carte cliquable (comme .schedule-card) : le crayon d'édition a disparu, tout le corps
            // de la carte ouvre l'édition -- seules la poignée de drag et la poubelle isolent leur
            // clic (event.stopPropagation()) pour ne pas déclencher l'ouverture par accident.
            divCfg += `<div class="somfyShade shade-draggable" draggable="true" data-roomid="${shade.roomId}" data-mypos="${shade.myPos}" data-shadeid="${shade.shadeId}" data-remoteaddress="${shade.remoteAddress}" data-tilt="${shade.tiltType}" data-shadetype="${shade.shadeType}" data-flipposition="${shade.flipPosition ? 'true' : 'false'}" onclick="somfy.openEditShade(${shade.shadeId});"><div class="drag-handle" onclick="event.stopPropagation();"><svg class="icon-svg"><use href=#svg-drag></use></svg></div><div class="shade-icon-wrapper"><svg><use href="#${st.indic}"></use></svg></div><div class="shade-name"><div class="name-text">${escHtml(shade.name)}</div><div class="cfg-room">${escHtml(room.name)}</div></div><div class="idRemoteAddress"><span class="AddrId-label">${tr("ID")}</span><span class="shade-address">${shade.remoteAddress}</span></div><div class="divEditDelete-svg" onclick="event.stopPropagation(); somfy.deleteShade(${shade.shadeId});"><svg class="icon-svg" style="color: var(--color-danger);"><use href=#svg-trash></use></svg></div></div>`;

            // --- SECTION CONTROLE ---
            divCtl += `<div class="somfyShadeCtl" style="${roomId === 0 || roomId === room.roomId ? '' : 'display:none'}" data-shadeid="${shade.shadeId}" data-roomid="${shade.roomId}" data-direction="${shade.direction}" data-remoteaddress="${shade.remoteAddress}" data-position="${shade.position}" data-target="${shade.target}" data-mypos="${shade.myPos}" data-mytiltpos="${shade.myTiltPos}" data-shadetype="${shade.shadeType}" data-tilt="${shade.tiltType}" data-tilttarget="${shade.tiltTarget}" data-flipposition="${shade.flipPosition ? 'true' : 'false'}"
            data-windy="${(shade.flags & 0x10) === 0x10 ? 'true' : 'false'}" data-sunny="${(shade.flags & 0x20) === 0x20 ? 'true' : 'false'}">


            <div class="dash-card-content">

            <!-- Ligne 1 : En-tête -->
            <div class="dash-card-header">
            <div class="shade-icon" data-shadeid="${shade.shadeId}">
            <svg class="somfy-shade-icon" data-shadeid="${shade.shadeId}" style="--shade-position:${shade.flipPosition ? 100 - shade.position : shade.position}; --fpos:${shade.flipPosition ? 100 - shade.position : shade.position}%">
            <use href="#${st.ico}"></use>
            </svg>
            </div>
            <div class="shade-name">
            <span class="shadectl-name">${escHtml(shade.name)}</span>
            <span class="shadectl-room">${escHtml(room.name)}</span>
            <div class="shadectl-mypos">
            <span class="val-pos-label">${tr('POS_SHORT')}</span> <span class="val-pos">${shade.position}%</span>`;
            if (shade.tiltType !== 0) divCtl += ` <span class="val-tilt-label">${tr('TILT_SHORT')}</span> <span class="val-tilt-pos">${shade.tiltPosition}%</span>`;
            divCtl += `</div>
            </div>
            <div class="header-actions">`;
            if (shade.sunSensor) {
                divCtl += `<div class="button-sunflag cmd-button" data-cmd="sunflag" data-shadeid="${shade.shadeId}" data-on="${isSunOn ? 'true' : 'false'}">
                <svg><use href="#svg-sun"></use></svg>
                </div>`;
            }
            divCtl += `<div class="button-my" onclick="event.stopPropagation(); somfy.openSetMyPosition(${shade.shadeId});">
            <svg><use href="#svg-favori"></use></svg>
            </div>
            <div class="button-menu" title="${tr("OPTION")}" onclick="event.stopPropagation(); somfy.openShadeCardMenu(${shade.shadeId});">
            <svg width="18" height="18"><use href="#svg-menuVertical"></use></svg>
            </div>
            </div>
            </div>

            <!-- Ligne 2 : Carrousel (Boutons / Position / Inclinaison selon les capacités) -->
            <div class="shadectl-controls-wrapper">`;
            if (totalPages > 1) divCtl += `
            <button class="btn-nav btn-nav-left" type="button" onclick="somfy.shadeCarouselNav(${shade.shadeId}, -1);">
            <svg><use href="#svg-arrowLeft"></use></svg>
            </button>`;
            divCtl += `
            <div class="controls-carousel-wrapper">
            <div class="carousel-viewport">
            <div class="carousel-track" id="carouselTrack_${shade.shadeId}" data-page="0" data-pages="${totalPages}">
            ${carouselPages.join('')}
            </div>
            </div>
            </div>`;
            if (totalPages > 1) divCtl += `
            <button class="btn-nav btn-nav-right" type="button" onclick="somfy.shadeCarouselNav(${shade.shadeId}, 1);">
            <svg><use href="#svg-arrowRight"></use></svg>
            </button>`;
            divCtl += `
            </div>

            <!-- Ligne 3 : Pied de carte (Badges & Pagination) -->
            <div class="shadectl-status-bar">
            <div class="shadectl-status-left">
            <div class="indicator indicator-clock schedule-indicator no-schedule" data-schedule-target="shade" data-schedule-id="${shade.shadeId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
            <div class="indicator indicator-wind"><svg><use href="#indic-wind"></use></svg></div>
            <div class="indicator indicator-sun"><svg><use href="#indic-sun"></use></svg></div>
            <div class="val-my myShade-badge">
            My: <strong>${shade.myPos === -1 ? '---' : shade.myPos + '%'}</strong>${shade.tiltType !== 0 ? ` · <strong>${shade.myTiltPos === -1 ? '---' : shade.myTiltPos + '%'}</strong>` : ''}
            </div>
            </div>`;
            if (totalPages > 1) {
                divCtl += `
            <!-- Indicateurs de page (Pills) -->
            <div class="page-dots" id="carouselDots_${shade.shadeId}">`;
                for (let p = 0; p < totalPages; p++) {
                    divCtl += `<span class="dot${p === 0 ? ' active' : ''}" onclick="somfy.shadeCarouselGoTo(${shade.shadeId}, ${p});"></span>`;
                }
                divCtl += `</div>`;
            }
            divCtl += `
            </div>


            </div>
            </div>`;


            let opt = document.createElement('option');
            opt.textContent = shade.name;

            opt.setAttribute('data-address', shade.remoteAddress);
            opt.setAttribute('data-type', 'shade');
            opt.setAttribute('data-shadetype', shade.shadeType);
            opt.setAttribute('data-shadeid', shade.shadeId);
            opt.setAttribute('data-bitlength', shade.bitLength);
            optGroup.appendChild(opt);
        }
        let sopt = vrList.options[vrList.selectedIndex];
        get('divVirtualRemote').setAttribute('data-bitlength', sopt ? sopt.getAttribute('data-bitlength') : 'none');
        get('divShadeList').innerHTML = divCfg;
        let shadeControls = get('divShadeControls');
        shadeControls.innerHTML = divCtl;
        this.checkEmptyState();
        // Appui long sur les boutons de commande : maintenir 2s sur up/down déclenche
        // l'inclinaison (volets avec tilt) -- PLUS sur "my", qui a désormais son propre bouton
        // dédié (icône étoile, onclick direct) rendant ce chemin redondant (retiré, cf. audit
        // comparatif avec le fork amont). Gère aussi le cas où le geste tactile se transforme en
        // défilement de page (touchmove) avant les 2s.
        let btns = shadeControls.querySelectorAll('div.cmd-button');
        const clearTiltTimer = () => {
            if (this.btnTimer) { clearTimeout(this.btnTimer); this.btnTimer = null; }
        };
        const armTiltTimer = (btn, fn) => {
            this.btnTimer = setTimeout(() => { this.btnTimer = null; fn(); }, 2000);
        };
        const onCmdButtonPress = (event) => {
            const btnEl = event.currentTarget;
            clearTiltTimer();
            let elShade = btnEl.closest('div.somfyShadeCtl');
            let cmd = btnEl.getAttribute('data-cmd');
            let shadeId = parseInt(btnEl.getAttribute('data-shadeid'), 10);
            this.btnDown = new Date().getTime();
            if (cmd === 'light' || cmd === 'sunflag') return;
            if (cmd !== 'my' && makeBool(elShade.getAttribute('data-tilt'))) {
                armTiltTimer(btnEl, () => this.sendTiltCommand(shadeId, cmd));
            }
        };
        const onCmdButtonRelease = (event) => {
            const btnEl = event.currentTarget;
            let cmd = btnEl.getAttribute('data-cmd');
            let shadeId = parseInt(btnEl.getAttribute('data-shadeid'), 10);
            if (this.btnTimer) {
                clearTiltTimer();
                // Relâché avant le seuil de 2s : simple appui, on envoie la commande. Au-delà,
                // l'action de l'appui long est déjà partie depuis le minuteur.
                if (new Date().getTime() - this.btnDown <= 2000) this.sendCommand(shadeId, cmd);
            }
            else if (cmd === 'light') {
                btnEl.setAttribute('data-on', !makeBool(btnEl.getAttribute('data-on')));
            }
            else if (cmd === 'sunflag') {
                if (makeBool(btnEl.getAttribute('data-on')))
                    this.sendCommand(shadeId, 'flag');
                else
                    this.sendCommand(shadeId, 'sunflag');
            }
            else this.sendCommand(shadeId, cmd);
        };
        for (let i = 0; i < btns.length; i++) {
            btns[i].addEventListener('mousedown', onCmdButtonPress, true);
            btns[i].addEventListener('mouseup', onCmdButtonRelease, true);
            btns[i].addEventListener('mouseleave', clearTiltTimer, true);
            btns[i].addEventListener('touchstart', (event) => { this._cmdTouchScrolled = false; onCmdButtonPress(event); }, true);
            // Un défilement qui démarre sur le bouton ne doit pas déclencher la commande.
            btns[i].addEventListener('touchmove', (event) => { this._cmdTouchScrolled = true; clearTiltTimer(); }, true);
            // preventDefault ici : empêche le navigateur de synthétiser un mouseup ensuite, qui
            // redéclencherait la commande une seconde fois.
            btns[i].addEventListener('touchend', (event) => {
                event.preventDefault();
                if (!this._cmdTouchScrolled) onCmdButtonRelease(event); else clearTiltTimer();
            }, true);
            btns[i].addEventListener('touchcancel', clearTiltTimer, true);
        }
        // Applique les préférences d'interface persistées par volet (page de carrousel par
        // défaut, visibilité du badge "My") -- cf. getShadeUIPrefs/openShadeCardMenu. Fait après
        // coup plutôt que dans le template ci-dessus car shadeCarouselGoTo() a besoin du
        // data-pages déjà posé sur le DOM pour clamper correctement.
        for (let i = 0; i < shades.length; i++) {
            this.applyShadeUIPrefs(shades[i].shadeId);
        }
        this.updateRoomCounts();
        this.setListDraggable(get('divShadeList'), '.shade-draggable', (list) => {
            // Get the shade order
            let items = list.querySelectorAll('.shade-draggable');
            let order = [];
            for (let i = 0; i < items.length; i++) {
                order.push(parseInt(items[i].getAttribute('data-shadeid'), 10));
                // Reorder the shades on the main page.
            }
            putJSONSync('/shadeSortOrder', order, (err) => {
                for (let i = order.length - 1; i >= 0; i--) {
                    let el = shadeControls.querySelector(`.somfyShadeCtl[data-shadeid="${order[i]}"`);
                    if (el) {
                        shadeControls.prepend(el);
                    }
                }
            });
        });
        this._syncScheduleIndicators();
    }
    // Déplace le carrousel de contrôles d'une carte volet vers la page pageIndex (bornée, pas de
    // boucle) : met à jour la translation du track, l'attribut data-page (source de vérité pour la
    // navigation suivante/le swipe) et l'état actif des dots.
    shadeCarouselGoTo(shadeId, pageIndex) {
        const track = get(`carouselTrack_${shadeId}`);
        if (!track) return;
        const total = parseInt(track.getAttribute('data-pages'), 10) || 1;
        const clamped = Math.max(0, Math.min(total - 1, pageIndex));
        track.style.transform = `translateX(-${clamped * 100}%)`;
        track.setAttribute('data-page', clamped);
        const dots = get(`carouselDots_${shadeId}`);
        if (dots) dots.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === clamped));
    }
    shadeCarouselNav(shadeId, dir) {
        const track = get(`carouselTrack_${shadeId}`);
        if (!track) return;
        const current = parseInt(track.getAttribute('data-page'), 10) || 0;
        this.shadeCarouselGoTo(shadeId, current + dir);
    }
    closeShadePositioners() {
        let ctls = document.querySelectorAll('.shade-positioner');
        for (let i = 0; i < ctls.length; i++) {
            ctls[i].remove();
        }
    }
    screenShade() {
        // Jamais par-dessus une installation en cours (.inst-overlay porte alors une
        // barre de progression) ni pendant l'onboarding, et jamais deux fois.
        if (document.querySelector('.rts-shade, .inst-overlay')) return;
        if (document.body.classList.contains('onboarding-active')) return;
        // Durées alignées sur rts-close / rts-raise (overlays.css), repli compris.
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const downMs = reduced ? 300 : 2600;
        const upMs = reduced ? 300 : 2200;

        const el = document.createElement('div');
        el.className = 'rts-shade';
        el.innerHTML = `<div class="rts-msg">
            <p class="rts-t1">${tr('ERR_RTSSHADE_0')}</p>
            <p class="rts-t2">${tr('ERR_RTSSHADE_1')}</p>
            <button type="button" class="rts-btn">${tr('ERR_RTSSHADE_2')}</button>
            <p class="rts-t3">${tr('ERR_RTSSHADE_3')}</p></div>`;

        let running = true, asked = false, done = false;
        const raise = () => {
            if (done) return;
            // Demande reçue avant la fin de la course : différée jusqu'à la butée
            // plutôt que de couper l'animation en cours, qui sauterait visiblement.
            if (running) { asked = true; return; }
            done = true;
            clearTimeout(safety);
            document.removeEventListener('keydown', onKey, true);
            el.classList.add('rts-open');
            setTimeout(() => el.remove(), upMs);
        };
        // Une touche morte enfoncée seule ne compte pas.
        const onKey = (e) => {
            if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
            raise();
        };
        // Écouteur porté par l'élément et non par document : celui-ci recevrait
        // aussi le clic qui vient de le créer.
        el.addEventListener('click', raise);
        document.addEventListener('keydown', onKey, true);
        const safety = setTimeout(raise, downMs + 30000);
        setTimeout(() => { running = false; if (asked) raise(); }, downMs);

        document.body.appendChild(el);
    }
    openSetMyPosition(shadeId) {
        if (typeof shadeId === 'undefined') return;

        const shade = document.querySelector(`div.somfyShadeCtl[data-shadeid="${shadeId}"]`);
        if (!shade) return;

        const arrowUse = shade.querySelector('.handle-icon use');

        document.querySelectorAll('.shade-positioner').forEach(el => {
            el.remove();
            document.querySelectorAll('.handle-icon use').forEach(u => u.setAttribute('href', '#svg-arrowRight'));
        });

        const currPos = parseInt(shade.getAttribute('data-position'), 10) || 0;
        const currTiltPos = parseInt(shade.getAttribute('data-tiltposition'), 10) || 0;
        const myPos = parseInt(shade.getAttribute('data-mypos'), 10);
        const myTiltPos = parseInt(shade.getAttribute('data-mytiltpos'), 10);
        const tiltType = parseInt(shade.getAttribute('data-tilt'), 10) || 0;
        const lbl = makeBool(shade.getAttribute('data-flipposition')) ? `% ${tr('SETMYPOS_OPEN')}` : `% ${tr('SETMYPOS_CLOSED')}`;

        const positionSlider = (tiltType !== 3) ? `
        <div class="slider-group">
        <div class="slider-header"><span class="title">${tr('SETMYPOS_TARGET_POS')}</span><span class="val"><span id="spanShadeTarget">${currPos}</span> ${lbl}</span></div>
        <div class="slider-wrapper">
        <div class="slider-progress" style="width:${currPos}%;"><div class="slider-thumb-line"></div></div>
        <input id="slidShadeTarget" class="md3-range-input" type="range" min="0" max="100" step="1" value="${currPos}">
        </div>
        </div>` : '';

        const tiltSlider = (tiltType > 0) ? `
        <div class="slider-group">
        <div class="slider-header"><span class="title">${tr('SETMYPOS_TARGET_TILT_POS')}</span><span class="val"><span id="spanShadeTiltTarget">${currTiltPos}</span> ${lbl}</span></div>
        <div class="slider-wrapper tilt-slider">
        <div class="slider-progress" style="width:${currTiltPos}%;"><div class="slider-thumb-line"></div></div>
        <input id="slidShadeTiltTarget" class="md3-range-input" type="range" min="0" max="100" step="1" value="${currTiltPos}">
        </div>
        </div>` : '';

        const div = document.createElement('div');
        div.className = 'shade-positioner shade-positioner-popup';
        div.setAttribute('data-shadeid', shadeId);
        div.onclick = (e) => e.stopPropagation();
        div.innerHTML = `
        <div class="shade-positioner-inner">
        ${positionSlider}${tiltSlider}
        <div class="popup-actions">
        <button id="btnSetMyPosition" pop type="button">${tr("BT_SET_MY_POSITION")}</button>
        <button id="btnCancelMy" pop line type="button">${tr("BT_CANCEL_1")}</button>
        </div>
        </div>`;

        shade.appendChild(div);
        if (arrowUse) arrowUse.setAttribute('href', '#svg-arrowLeft');

        const animateClose = () => {
            div.classList.add('popup-slide-out');
            if (arrowUse) arrowUse.setAttribute('href', '#svg-arrowRight');
            setTimeout(() => { div.remove(); }, 300);
        };
        const elTarget = div.querySelector('#slidShadeTarget');
        const elTiltTarget = div.querySelector('#slidShadeTiltTarget');
        const elBtnSave = div.querySelector('#btnSetMyPosition');
        const elBtnCancel = div.querySelector('#btnCancelMy');
        const fnUpdateUI = () => {
            const pos = elTarget ? parseInt(elTarget.value, 10) : 0;
            const tilt = elTiltTarget ? parseInt(elTiltTarget.value, 10) : 0;
            const isSameAsMy = (tiltType === 3) ? (tilt === myTiltPos) : (pos === myPos && (tiltType === 0 || tilt === myTiltPos));

            if (isSameAsMy) {
                elBtnSave.innerHTML = tr('BT_CLEAR_MY_POSITION');
                elBtnSave.style.background = 'var(--color-text-warning)';
            } else {
                elBtnSave.innerHTML = tr('BT_SET_MY_POSITION');
                elBtnSave.style.background = '';
            }
        };
        if (elTarget) elTarget.oninput = () => {
            syncSliderProgress(elTarget);
            get('spanShadeTarget').innerHTML = elTarget.value;
            fnUpdateUI();
        };
        if (elTiltTarget) elTiltTarget.oninput = () => {
            syncSliderProgress(elTiltTarget);
            get('spanShadeTiltTarget').innerHTML = elTiltTarget.value;
            fnUpdateUI();
        };

        elBtnCancel.onclick = (e) => { e.preventDefault(); animateClose(); };
        elBtnSave.onclick = (e) => {
            e.preventDefault();
            const pos = elTarget ? parseInt(elTarget.value, 10) : 0;
            const tilt = elTiltTarget ? parseInt(elTiltTarget.value, 10) : 0;
            somfy.sendShadeMyPosition(shadeId, pos, tilt);
            animateClose();
        };

        setTimeout(() => {
            document.body.addEventListener('click', animateClose, { once: true });
        }, 100);

        fnUpdateUI();
    }
    sendShadeMyPosition(shadeId, pos, tilt) {
        logger.debug(`Sending My Position for shade id ${shadeId} to ${pos} and ${tilt}`);
        let overlay = ui.waitMessage(get('divContainer'));
        putJSON('/setMyPosition', { shadeId: shadeId, pos: pos, tilt: tilt }, (err, response) => {
            this.closeShadePositioners();
            overlay.remove();
            if (err) { logger.error('Failed to set My Position:', err); ui.serviceError(err); return; }
            logger.debug('My Position command sent:', response);
            // Recale le cache local (myPos/myTiltPos) sur la réponse du firmware, déjà à jour puisque
            // setMyPosition() les fixe de façon synchrone avant de répondre. Sans ça, l'audit shadeType
            // du bouton MY des plannings (ScheduleOverlay) et le badge "My: x%" resteraient figés sur
            // l'ancienne valeur jusqu'au prochain rechargement complet de la liste des volets.
            const idx = (this.shades || []).findIndex(s => s.shadeId === shadeId);
            if (idx >= 0) Object.assign(this.shades[idx], response);
            // Applique aussi le résultat directement au DOM plutôt que d'attendre une éventuelle
            // diffusion WebSocket : sans ça, .myShade-badge et data-mypos restent figés sur la valeur
            // précédente jusqu'à un tout autre évènement de mouvement sur ce volet (voir procShadeState,
            // seul autre point de mise à jour de ces éléments), ce qui donnait l'impression d'un
            // décalage d'un cran entre deux sauvegardes successives via ce popup.
            if (response && typeof response.myPos !== 'undefined') {
                document.querySelectorAll(`.somfyShadeCtl[data-shadeid="${shadeId}"]`).forEach(d => {
                    d.dataset.mypos = response.myPos;
                    d.dataset.mytiltpos = response.myTiltPos ?? -1;
                    const myBadge = d.querySelector('.myShade-badge');
                    if (myBadge) {
                        let html = `My: <strong>${response.myPos === -1 ? '---' : response.myPos + '%'}</strong>`;
                        if (response.tiltType !== 0) {
                            const myTilt = response.myTiltPos ?? -1;
                            html += ` · <strong>${myTilt === -1 ? '---' : myTilt + '%'}</strong>`;
                        }
                        myBadge.innerHTML = html;
                    }
                });
            }
            ui.successMessage(tr('MSG_SAVE_SUCCESS'));
        });
    }
    // Préférences d'interface par volet (page de carrousel par défaut, visibilité du badge "My"),
    // purement locales à ce navigateur -- stockées en un seul blob localStorage plutôt que sur le
    // volet côté firmware, puisqu'il s'agit de goûts d'affichage et non de configuration du matériel.
    getShadeUIPrefs(shadeId) {
        let all = {};
        try { all = JSON.parse(localStorage.getItem('somfyShadeUIPrefs') || '{}'); } catch (e) { all = {}; }
        const p = all[shadeId] || {};
        return {
            defaultCarouselPage: typeof p.defaultCarouselPage === 'number' ? p.defaultCarouselPage : 0,
            showMyBadge: typeof p.showMyBadge === 'boolean' ? p.showMyBadge : true
        };
    }
    setShadeUIPrefs(shadeId, patch) {
        let all = {};
        try { all = JSON.parse(localStorage.getItem('somfyShadeUIPrefs') || '{}'); } catch (e) { all = {}; }
        all[shadeId] = Object.assign(this.getShadeUIPrefs(shadeId), patch);
        localStorage.setItem('somfyShadeUIPrefs', JSON.stringify(all));
    }
    applyShadeUIPrefs(shadeId) {
        const prefs = this.getShadeUIPrefs(shadeId);
        const card = document.querySelector(`.somfyShadeCtl[data-shadeid="${shadeId}"]`);
        if (!card) return;
        const badge = card.querySelector('.myShade-badge');
        if (badge) badge.style.display = prefs.showMyBadge ? '' : 'none';
        this.shadeCarouselGoTo(shadeId, prefs.defaultCarouselPage);
    }
    openShadeCardMenu(shadeId) {
        if (typeof shadeId === 'undefined') return;

        const shade = document.querySelector(`div.somfyShadeCtl[data-shadeid="${shadeId}"]`);
        if (!shade) return;

        document.querySelectorAll('.shade-positioner').forEach(el => el.remove());

        const shadeType = parseInt(shade.getAttribute('data-shadetype'), 10);
        const tiltType = parseInt(shade.getAttribute('data-tilt'), 10) || 0;
        const isSimpleShade = this.noMyShadeTypes.includes(shadeType);
        const shadeHasTilt = tiltType > 0;
        const prefs = this.getShadeUIPrefs(shadeId);

        // Les pages proposées ici doivent rester en phase avec la construction du carrousel dans
        // setShadesList() (buttonsPage/positionPage/tiltPage) : même logique isSimpleShade/shadeHasTilt.
        const pageOptions = [{ value: 0, label: tr('OPT_PAGE_BUTTONS') }];
        if (!isSimpleShade) pageOptions.push({ value: 1, label: tr('OPT_PAGE_POSITION') });
        if (!isSimpleShade && shadeHasTilt) pageOptions.push({ value: 2, label: tr('OPT_PAGE_TILT') });
        const selectOptions = pageOptions.map(p => `<option value="${p.value}" ${prefs.defaultCarouselPage === p.value ? 'selected' : ''}>${p.label}</option>`).join('');

        const div = document.createElement('div');
        div.className = 'shade-positioner shade-positioner-popup';
        div.setAttribute('data-shadeid', shadeId);
        div.onclick = (e) => e.stopPropagation();
        div.innerHTML = `
        <div class="shade-positioner-inner">
        <div class="popup-actions">
        <button id="btnCloseCardMenu_${shadeId}" pop line type="button">${tr('BT_CLOSE')}</button>
        </div>

        <div class="uniRow soft dirty-target">
        <div class="unifield-content">
        <label class="label">${tr('OPT_DEFAULT_CAROUSEL_PAGE')}</label>
        <select id="selCardDefaultPage_${shadeId}" class="inputAndSelect">${selectOptions}</select>
        </select>
        </div>
        </div>
        <hr>
        <label class="uniRow soft dirty-target" for="chkCardShowMyBadge_${shadeId}">
        <div class="uniText"><div class="uniLabel">${tr('OPT_SHOW_MY_BADGE')}</div></div>
        <div class="uniRight">
        <span class="switch">
        <input id="chkCardShowMyBadge_${shadeId}" type="checkbox" ${prefs.showMyBadge ? 'checked' : ''}>
        <div></div>
        </span>
        </div>
        </label>

        </div>`;

        shade.appendChild(div);

        const animateClose = () => {
            div.classList.add('popup-slide-out');
            setTimeout(() => { div.remove(); }, 300);
        };

        const selEl = div.querySelector(`#selCardDefaultPage_${shadeId}`);
        const chkEl = div.querySelector(`#chkCardShowMyBadge_${shadeId}`);
        if (selEl) selEl.onchange = () => {
            const page = parseInt(selEl.value, 10);
            this.setShadeUIPrefs(shadeId, { defaultCarouselPage: page });
            this.shadeCarouselGoTo(shadeId, page);
        };
        if (chkEl) chkEl.onchange = () => {
            this.setShadeUIPrefs(shadeId, { showMyBadge: chkEl.checked });
            this.applyShadeUIPrefs(shadeId);
        };

        div.querySelector(`#btnCloseCardMenu_${shadeId}`).onclick = (e) => { e.preventDefault(); animateClose(); };

        setTimeout(() => {
            document.body.addEventListener('click', animateClose, { once: true });
        }, 100);
    }
    setLinkedRemotesList(shade) {
        const badgeCount = get('badgeRemoteCount');
        const remotes = shade.linkedRemotes || [];

        if (badgeCount) {
            badgeCount.innerText = remotes.length;
            badgeCount.style.display = remotes.length > 0 ? 'inline-block' : 'none';
        }

        // L'overlay fusionné (liste + recherche, cf. buildRemotesOverlay) peut rester ouvert même
        // quand la liste redevient vide (suppression du dernier élément) : l'utilisateur doit
        // pouvoir relancer une recherche depuis cet état plutôt que de se faire fermer la page.
        const currentOverlay = get('divRemotesOverlay');
        if (currentOverlay) {
            const scrollContent = get('divRemotesScrollContentInner');
            if (scrollContent) scrollContent.innerHTML = this.modalRemotesListHtml(shade);
        }
    }
    // Cache navigateur (localStorage) du dernier RSSI connu par télécommande, pour éviter que le
    // badge signal affiche un champ vide juste après un redémarrage de l'ESP32 : lastRssi est une
    // valeur RAM côté firmware (cf. SomfyLinkedRemote::lastRssi), jamais persistée en Flash, donc
    // le firmware repart toujours à -128 au boot. On ne demande PAS au firmware de la garder --
    // juste au navigateur de se souvenir de la dernière valeur vue. Clé par remoteAddress (unique
    // toutes télécommandes confondues), volontairement pas par shadeId.
    _remoteSignalCacheKey() { return 'somfyRemoteSignalCache'; }
    _getStoredRemoteSignal(remoteAddress) {
        try {
            const cache = JSON.parse(localStorage.getItem(this._remoteSignalCacheKey()) || '{}');
            const v = cache[remoteAddress];
            return typeof v === 'number' ? v : null;
        } catch (e) { return null; }
    }
    _storeRemoteSignal(remoteAddress, rssi) {
        try {
            const cache = JSON.parse(localStorage.getItem(this._remoteSignalCacheKey()) || '{}');
            cache[remoteAddress] = rssi;
            localStorage.setItem(this._remoteSignalCacheKey(), JSON.stringify(cache));
        } catch (e) { /* localStorage indisponible (navigation privée, quota plein...) -- pas bloquant */ }
    }
    // Ligne "SIGNAL | -63 dBm" d'une télécommande liée, à partir de lastRssi (valeur RAM côté
    // firmware, cf. SomfyLinkedRemote::lastRssi -- rafraîchie à chaque trame reçue de cette
    // télécommande, jamais persistée en Flash). -128 = aucune trame reçue depuis le dernier
    // redémarrage de l'ESP32 : dans ce cas on retombe sur le dernier RSSI mis en cache côté
    // navigateur (cf. _getStoredRemoteSignal) plutôt que d'afficher un tiret, tant qu'une valeur y
    // est connue. Le niveau (sig-good/medium/bad/unknown) colore l'icône ET la valeur -- jamais le
    // libellé "SIGNAL" ni le séparateur, qui restent neutres. Racine gardée en
    // ".linkedRemote-signal" : c'est ce que _updateLiveRemoteSignal() cible pour patcher un badge
    // en direct sans tout re-render.
    remoteSignalHtml(rssi, remoteAddress) {
        let hasSignal = typeof rssi === 'number' && rssi > -128;
        if (hasSignal && remoteAddress) {
            this._storeRemoteSignal(remoteAddress, rssi);
        } else if (!hasSignal && remoteAddress) {
            const stored = this._getStoredRemoteSignal(remoteAddress);
            if (typeof stored === 'number') {
                rssi = stored;
                hasSignal = true;
            }
        }
        const level = !hasSignal ? 'unknown' : rssi > -70 ? 'good' : rssi > -85 ? 'medium' : 'bad';
        const valueText = hasSignal ? `${rssi} dBm` : '—';
        return `
        <div class="linkedRemote-signal">
        <svg class="linkedRemote-signal-icon sig-${level}"><use href="#svg-tabRadio"></use></svg>
        <span class="linkedRemote-signal-label">${tr('M_SIGNAL')}</span>
        <span class="linkedRemote-sep">|</span>
        <span class="linkedRemote-signal-value sig-${level}">${valueText}</span>
        </div>`;
    }
    modalRemotesListHtml(shade) {
        const remotes = shade.linkedRemotes || [];
        if (remotes.length === 0) {
            return `
            <div class="empty-state">
            <svg class="empty-icon"><use href="#svg-linkRemot"></use></svg>
            <div class="label">${tr('REMOTESLIST_EMPTY')}</div>
            <div class="empty-subtext">${tr('REMOTESLIST_EMPTY_DESC')}</div>
            </div>`;
        }
        // .linkedRemoteCard qualifie ce réemploi de .somfyLinkedRemote/.linkedWrap/.linkedContent
        // (partagées avec setLinkedShadesList, la liste des volets liés à un groupe) pour que
        // l'agrandissement de l'icône, le titre mis en avant et le bouton de suppression rond ne
        // s'appliquent QU'à cette carte-ci, sans déteindre sur cette autre liste.
        // Carte scindée en deux blocs empilés : .remote-card-top (icône + infos + poubelle, alignés
        // verticalement entre eux) et .remote-card-bottom (ligne signal), séparés par un filet --
        // sans ça l'icône/la poubelle se recentraient sur toute la hauteur de la carte, signal
        // inclus, cf. [[tooltip-unification-project]] pour le contexte de cette session de retouches.
        return remotes.map((remote, i) => `
        <div class="somfyLinkedRemote linkedRemoteCard" data-shadeid="${shade.shadeId}" data-remoteaddress="${remote.remoteAddress}">
        <div class="remote-card-top">
        <div class="linkedWrap">
        <svg class="icon-svg"><use href="#svg-linkRemot"></use></svg>
        </div>
        <div class="linkedContent">
        <div class="linkedRemote-title">${tr("REMOTESLIST_LINKED")} ${i + 1}</div>
        <div class="linkedRemote-meta">
        <span>${tr("ADDR")} ${remote.remoteAddress}</span>
        <span class="linkedRemote-sep">|</span>
        <span>${tr("CODE")} ${remote.lastRollingCode}</span>
        </div>
        </div>
        <div class="linkedRemote-btn-delete" onclick="somfy.unlinkRemote(${shade.shadeId}, '${remote.remoteAddress}');">
        <svg><use href="#svg-trash"></use></svg>
        </div>
        </div>
        <div class="remote-card-bottom">
        ${this.remoteSignalHtml(remote.lastRssi, remote.remoteAddress)}
        </div>
        </div>
        `).join('');
    }

    // Point d'entrée unique pour la gestion des télécommandes liées à un volet : liste de celles
    // déjà liées + bouton pour en rechercher une nouvelle, réunis dans un seul overlay (fusion de
    // l'ancien écran d'attente dédié "divLinking" et de la simple liste "divRemotesOverlay").
    // Accepte soit l'objet volet déjà chargé (ex: depuis setLinkedRemotesList), soit juste son
    // shadeId (ex: depuis le bouton "Lier Télécommande" du formulaire d'édition), auquel cas on
    // va le chercher avant de construire l'overlay.
    buildRemotesOverlay(shadeOrId) {
        if (get('divRemotesOverlay')) return;
        if (shadeOrId === null || typeof shadeOrId !== 'object') {
            getJSONSync(`/shade?shadeId=${shadeOrId}`, (err, shade) => {
                if (err) return ui.serviceError(err);
                this._buildRemotesOverlay(shade);
            });
            return;
        }
        this._buildRemotesOverlay(shadeOrId);
    }
    _buildRemotesOverlay(shade) {
        if (get('divRemotesOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divRemotesOverlay';
        div.className = 'modal-overlay';
        // data-shadeid/-searching/-searchbusy pilotent l'état "recherche" : lu par _handleLinkFrame()
        // à chaque trame RF reçue (cf. procRemoteFrame), sans dépendre d'une div dédiée comme avant.
        div.setAttribute('data-shadeid', shade.shadeId);
        div.setAttribute('data-searching', 'false');
        // ui.clearErrors() (appelé par ui.successMessage(), cf. le toast de liaison réussie dans
        // _handleLinkFrame) ne ferme que les modales d'ALERTE (.prompt-content/.error-content/
        // .info-content, cf. 30-ui-binder.js) : cette fenêtre de travail y survit, alors qu'un
        // ratissage de tout .modal-overlay la refermait sous les pieds de l'utilisateur juste
        // après une liaison pourtant réussie.
        div.innerHTML = `
        <div class="message-content remotes-content" id="divRemotesPopupContent">

        ${modalHeader('REMOTESLIST_TITLE', 'svg-remote', {
            subtitle: 'REMOTESLIST_TITLE_DESC',
        })}

        <div id="divRemotesScrollContent">

        <div class="overlay-scroll-content" id="divRemotesScrollContentInner">
        ${this.modalRemotesListHtml(shade)}
        </div>
        </div>

        <div id="divRemoteSearchStatus" class="information remote-search-status" style="display:none;">
        <div class="information-header">
        <span class="remote-search-spinner"></span>
        <b id="spanRemoteSearchStatusText">${tr('REMOTESLIST_SEARCH')}</b>
        </div>
        </div>

        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnRemotesGoBack" line type="button">${tr('BT_CLOSE')}</button>


        <button id="btnRemoteSearchToggle" type="button">
        <svg><use id="useRemoteSearchIcon" href="#svg-search"></use></svg>
        <span id="spanRemoteSearchBtnLabel">${tr('BT_SEARCH')}</span>
        </button>
        </div>
        </div>
        </div>`;

        shOverlay(div);

        div.querySelector('#btnRemotesGoBack').onclick = () => {
            this.stopRemoteSearch(div);
            closeOverlay(div);
        };
        div.querySelector('#btnRemoteSearchToggle').onclick = () => this.toggleRemoteSearch(div);
    }
    toggleRemoteSearch(div) {
        if (!div) return;
        this.setRemoteSearchState(div, div.dataset.searching !== 'true');
    }
    stopRemoteSearch(div) {
        this.setRemoteSearchState(div || get('divRemotesOverlay'), false);
    }
    // Bascule visuelle + logique de l'état "écoute" : le bouton devient "Annuler la recherche", un
    // bandeau d'attente apparaît, et data-searching='true' est ce que _handleLinkFrame() surveille
    // à chaque trame RF reçue pour savoir s'il doit tenter une liaison. On efface systématiquement
    // data-searchbusy au passage pour ne jamais rester bloqué sur un verrou orphelin.
    setRemoteSearchState(div, on) {
        if (!div) return;
        div.dataset.searching = on ? 'true' : 'false';
        delete div.dataset.searchbusy;

        // Une recherche en écoute doit être arrêtée proprement (stopRemoteSearch) avant de pouvoir
        // fermer l'overlay -- sans ça, une fermeture accidentelle (clic sur le fond, glisser
        // mobile) laisserait croire à l'utilisateur qu'il a annulé alors que _handleLinkFrame()
        // pourrait encore lier une télécommande sur la prochaine trame reçue avant que le DOM ne
        // soit retiré. Cf. requestCloseOverlay()/setOverlayLock() dans 20-shell.js.
        if (on) {
            setOverlayLock(div, 'confirm', {
                onConfirm: () => this.stopRemoteSearch(div),
                titleKey: 'PROMPT_REMOTE_SEARCH_TITLE',
                msgKey: 'PROMPT_REMOTE_SEARCH_MSG',
            });
        } else {
            clearOverlayLock(div);
        }

        const btn = div.querySelector('#btnRemoteSearchToggle');
        const closeBtn = div.querySelector('#btnRemotesGoBack');
        const label = div.querySelector('#spanRemoteSearchBtnLabel');
        const icon = div.querySelector('#useRemoteSearchIcon');
        const status = div.querySelector('#divRemoteSearchStatus');

        // Réutilise le variant [red] déjà défini pour les boutons d'action destructive/annulation
        // (cf. base.css) plutôt que d'inventer une classe de couleur dédiée à ce seul bouton.
        if (btn) btn.toggleAttribute('red', on);
        // Pendant la recherche, "Fermer" fait doublon avec "Annuler la recherche" (stopRemoteSearch
        // arrête déjà la recherche avant de fermer) : on le masque pour ne garder qu'une action.
        if (closeBtn) closeBtn.style.display = on ? 'none' : '';
        if (label) label.innerText = tr(on ? 'BT_CANCEL' : 'BT_SEARCH');
        if (icon) {
            const href = on ? '#svg-close' : '#svg-linkRemot';
            icon.setAttribute('href', href);
            icon.setAttribute('xlink:href', href);
        }
        if (status) status.style.display = on ? 'flex' : 'none';
    }
    procShadeState(state) {
        const g = get, sId = state.shadeId;

        document.querySelectorAll(`.somfy-shade-icon[data-shadeid="${sId}"]`).forEach(ico => {
            const p = state.flipPosition ? 100 - state.position : state.position;
            ico.style.setProperty('--shade-position', p);
            ico.style.setProperty('--fpos', state.position + '%');
        });
        if (g('spanShadeId')?.innerText == sId) {
            if (g('valPos')) g('valPos').innerText = state.position;

            const lTC = g('labelTiltContainer'), sVT = g('valTilt');
            if (state.tiltType !== 0) {
                if (lTC) lTC.style.display = 'flex';
                if (sVT) sVT.innerText = state.tiltPosition;
            } else if (lTC) {
                lTC.style.display = 'none';
            }
        }
        document.querySelectorAll(`.button-sunflag[data-shadeid="${sId}"]`).forEach(btn => {
            btn.style.display = state.sunSensor ? '' : 'none';
            btn.dataset.on = (state.flags & 0x01) === 0x01;
        });
        document.querySelectorAll(`.somfyShadeCtl[data-shadeid="${sId}"]`).forEach(d => {
            Object.assign(d.dataset, {
                direction: state.direction,
                position: state.position,
                target: state.target,
                mypos: state.myPos,
                windy: (state.flags & 0x10) === 0x10,
                          sunny: (state.flags & 0x20) === 0x20,
                          mytiltpos: state.myTiltPos ?? -1
            });

            if (state.tiltType !== 0) {
                Object.assign(d.dataset, {
                    tiltdirection: state.tiltDirection,
                    tiltposition: state.tiltPosition,
                    tilttarget: state.tiltTarget
                });
            }
            // En-tête (shadectl-mypos) : .val-pos/.val-tilt-pos ne portent que la valeur, le libellé
            // ("POS"/"TILT") est déjà un texte statique séparé dans le template -- ne PAS réinjecter
            // de préfixe ici, sous peine de doublon ("POS Pos: 100%").
            const posEl = d.querySelector('.val-pos');
            if (posEl) posEl.innerText = `${state.position}%`;
            if (state.tiltType !== 0) {
                const tiltEl = d.querySelector('.val-tilt-pos');
                if (tiltEl) tiltEl.innerText = `${state.tiltPosition}%`;
            }

            // Badge "My" du pied de carte : un seul élément combiné (position + tilt séparés par
            // "·"), pas deux éléments distincts -- on reconstruit tout le contenu à chaque mise à
            // jour plutôt que de cibler des sous-éléments qui n'existent pas dans le template.
            const myBadge = d.querySelector('.myShade-badge');
            if (myBadge) {
                let html = `My: <strong>${state.myPos === -1 ? '---' : state.myPos + '%'}</strong>`;
                if (state.tiltType !== 0) {
                    const myTilt = state.myTiltPos ?? -1;
                    html += ` · <strong>${myTilt === -1 ? '---' : myTilt + '%'}</strong>`;
                }
                myBadge.innerHTML = html;
            }

            // Slider(s) du carrousel de contrôles : reflète un mouvement déclenché ailleurs (planning,
            // autre client, ou l'incrémentation en direct du mouvement qu'on vient nous-même de
            // déclencher via ce slider). On n'écrase jamais un slider que l'utilisateur est en train
            // de manipuler -- dataset.dragging (posé par sliderDragStart/sliderDragEnd, cf.
            // 20-shell.js), PAS document.activeElement : un <input type=range> reste l'élément actif
            // bien après le relâchement (jusqu'au clic/tab suivant), donc s'appuyer sur activeElement
            // gelait aussi toutes les mises à jour ultérieures, y compris l'animation de position.
            // dataset.realpos suit TOUJOURS la position réelle, même pendant que l'utilisateur
            // manipule le slider (le volet peut déjà être en mouvement quand il le saisit) : c'est
            // le point de départ sur lequel commitSliderTarget() replace le curseur au relâchement.
            // Seule l'affectation VISUELLE (value) est gelée pendant le geste.
            const posSlider = d.querySelector('.carousel-slider-pos');
            if (posSlider) {
                posSlider.dataset.realpos = state.position;
                if (posSlider.dataset.dragging !== 'true') {
                    posSlider.value = state.position;
                    syncSliderProgress(posSlider);
                }
            }
            if (state.tiltType !== 0) {
                const tiltSlider = d.querySelector('.carousel-slider-tilt');
                if (tiltSlider) {
                    tiltSlider.dataset.realpos = state.tiltPosition;
                    if (tiltSlider.dataset.dragging !== 'true') {
                        tiltSlider.value = state.tiltPosition;
                        syncSliderProgress(tiltSlider);
                    }
                }
            }
        });
    }
    onShadeTypeChanged(el) {
        const g = get,
        type = parseInt(g('selShadeType').value, 10),
        tilt = parseInt(g('selTiltType').value, 10),
        bitL = g('selShadeBitLength')?.value,
        ico = g('icoShade'),
        isNew = g('spanShadeId').innerText === '*',
        st = this.shadeTypes.find(x => x.type === type) || { type };

        ['somfyShade', 'divSomfyButtons'].forEach(id => g(id)?.setAttribute('data-shadetype', type));

        if (ico) {

            this.shadeTypes.forEach(t => t.ico !== st.ico && ico.classList.remove(t.ico));

            const use = ico.querySelector('use');
            if (use && st.ico) {
                const href = '#' + st.ico;
                use.setAttribute('href', href);
                use.setAttribute('xlink:href', href);
            }
        }
        const hasLift = !!st.lift;
        const curTilt = st.tilt ? tilt : 0;
        const showLiftSettings = hasLift && tilt !== 3;
        const disp = (id, cond, d = 'flex') => {
            const e = g(id);
            if (e) e.style.display = cond ? d : 'none';
        };

            disp('divTiltSettings', st.tilt, 'flex');
            disp('divShadeTimings', hasLift, 'flex');
            disp('divLiftSettings', showLiftSettings, 'flex');
            disp('divSunSensor', st.sun);
            disp('divLightSwitch', st.light);
            disp('divFlipPosition', st.fpos);
            disp('divFlipCommands', st.fcmd);

            disp('divFldTiltTimeContainer', curTilt, 'flex');
            // L'ordre tilt/translation n'a de sens que pour un tilt intégré (un seul moteur qui
            // fait les deux) -- un tiltmotor/tiltonly/euromode n'a pas cette ambiguïté.
            disp('divTiltOrderContainer', tilt === 2, 'flex');
            // La présence (ou non) du tilt change ce qu'affiche la carte-résumé du mode Assistant.
            this.updateCalibrationSummary();

            const showStepHR = [7, 8, 2, 4, 0].includes(type) || (type === 1 && [2, 3, 4].includes(tilt));

        disp('labelPosContainer', hasLift && !isNew);
        disp('labelTiltContainer', curTilt && !isNew);

        if (!st.light && g('cbHasLight')) g('cbHasLight').checked = false;
        if (!st.sun && g('cbHasSunsensor')) g('cbHasSunsensor').checked = false;
    }
    // Bascule entre la carte-résumé cliquable (mode par défaut, ouvre l'assistant) et les champs de
    // saisie manuelle -- les deux panneaux restent dans le DOM en permanence (juste affichés/masqués)
    // puisque ui.toElement()/ui.fromElement() opèrent sur tout *[data-bind] qu'il soit visible ou non.
    setCalibrationMode(mode) {
        const g = get,
        isWizard = mode !== 'manual';
        if (g('divCalModeWizard')) g('divCalModeWizard').style.display = isWizard ? '' : 'none';
        if (g('divCalModeManual')) g('divCalModeManual').style.display = isWizard ? 'none' : 'flex';
        // Pastille/couleur pilotées par CSS via :checked (même mécanique que #cbEnableRadio, cf.
        // main.css) -- une seule case à cocher, décochée = Assistant, cochée = Manuel.
        if (g('calModeWizardRadio')) g('calModeWizardRadio').checked = !isWizard;
        if (isWizard) this.updateCalibrationSummary();
    }
    // Récapitule les temps actuels (secondes, 1 décimale) sur la carte-résumé du mode Assistant --
    // lit directement les champs du mode Manuel plutôt qu'un état à part, pour ne jamais désynchroniser
    // les deux vues (une seule source de vérité : le DOM du formulaire).
    updateCalibrationSummary() {
        const g = get,
        badge = g('calSummaryBadge');
        if (!badge) return;
        const secVal = (id) => { const el = g(id); const v = el ? parseFloat(el.value) : NaN; return isNaN(v) ? 0 : v; };
        const tiltType = g('selTiltType') ? parseInt(g('selTiltType').value, 10) : 0;
        const parts = [
            `${tr('SHADE_LABEL_UP')} ${secVal('fldShadeUpTime').toFixed(1)}s`,
            `${tr('SHADE_LABEL_DOWN')} ${secVal('fldShadeDownTime').toFixed(1)}s`
        ];
        if (tiltType > 0) parts.push(`${tr('SHADE_LABEL_TILT')} ${secVal('fldTiltTimeUp').toFixed(1)}s / ${secVal('fldTiltTimeDown').toFixed(1)}s`);
        badge.textContent = parts.join(' · ');
    }
    onShadeBitLengthChanged(el) {
        get('somfyShade').setAttribute('data-bitlength', el.value);
        this.onShadeTypeChanged(el);
    }
    onShadeProtoChanged(el) {
        get('somfyShade').setAttribute('data-proto', el.value);
    }

    showEditShade(bShow) {
        let el = get('divLinkRepeater');
        if (el) el.remove();
        el = get('divPairing');
        if (el) el.remove();
        el = get('divRollingCode');
        if (el) el.remove();
        // L'overlay fusionné liste/recherche (cf. buildRemotesOverlay) est modal et bloque toute
        // autre interaction tant qu'il est ouvert, donc ce cas ne devrait jamais se produire en
        // pratique -- filet de sécurité si l'édition du volet se ferme par un autre chemin.
        el = get('divRemotesOverlay');
        if (el) el.remove();
        el = get('somfyShade');
        if (el) el.style.display = bShow ? '' : 'none';
        el = get('divShadeListContainer');
        if (el) el.style.display = bShow ? 'none' : '';
        if (!bShow) clearDirty();
        if (bShow) {
            this.showEditGroup(false);
            this.showEditRoom(false);
        }
    }
    // Point d'entrée réel d'ouverture d'un volet (nouveau ou existant) : garde contre la perte de
    // modifications non enregistrées si un autre volet/groupe/planning était en cours d'édition
    // (ex: clic sur un autre volet de la liste sans avoir enregistré le premier).
    // Le retour lumineux par volet/groupe n'a de sens que si une LED est câblée : sans broche
    // configurée, l'interrupteur promettrait un effet qui ne se produirait jamais. window.__ledPin
    // vient de /loginContext, disponible avant toute ouverture de modale.
    applyLedFeedbackVisibility() {
        const has = typeof window.__ledPin === 'number' && window.__ledPin >= 0;
        document.querySelectorAll('.ledFeedbackRow').forEach(el => { el.style.display = has ? '' : 'none'; });
    }
    openEditShade(shadeId) { confirmDiscardChanges(() => this._openEditShade(shadeId)); }
    _openEditShade(shadeId) {
        const g = get,
        isNew = shadeId === undefined,
        ico = g('icoShade'),
        btns = ['btnPairShade', 'btnUnpairShade', 'btnLinkRemote', 'btnSetRollingCode'];

        if (isNew && this.shades?.length >= 30)
            return ui.errorMessage(g('divSomfySettings'), tr('ERR_DEVICE_LIMIT_REACHED'));

        const s = (id, d) => { const e = g(id); if(e) e.style.display = d; };
        this.applyLedFeedbackVisibility();

        // 1. GESTION DU BLOC GLOBAL DE CONTRÔLE
        // Si c'est un nouvel équipement, on cache TOUT le bloc. Sinon on l'affiche.
        s('divControlContent', isNew ? 'none' : 'flex');
        // Une programmation cible un shadeId existant : impossible tant que le volet n'est pas créé.
        s('divScheduleSectionShade', isNew ? 'none' : 'flex');

        s('divshowSomfyButtons', 'flex');
        btns.forEach(id => s(id, 'none'));
        ['blocPairDevice', 'divLinkedRemoteList', 'labelPosContainer'].forEach(id => s(id, 'none'));

        getJSONSync(isNew ? '/getNextShade' : `/shade?shadeId=${shadeId}`, (err, shade) => {
            if (err) return ui.serviceError(err);

            if (isNew) {
                Object.assign(shade, {
                    name: '', shadeType: 4, roomId: 0, downTime: 10000, upTime: 10000,
                    tiltTimeUp: 7000, tiltTimeDown: 7000, tiltFirstOnOpen: true, tiltFirstOnClose: true,
                    tiltType: 0, flipCommands: 0, flipPosition: 0, paired: 0
                });
            }
            if (!isNew) {
                s('labelPosContainer', 'flex');
                s('blocPairDevice', 'flex');
                ['btnLinkRemote', 'btnSetRollingCode'].forEach(id => s(id, 'flex'));
                s(shade.paired ? 'btnUnpairShade' : 'btnPairShade', 'flex');

                if (g('valPos')) g('valPos').innerText = shade.position;
                this.setLinkedRemotesList(shade);
                // Programmations rattachées à ce volet (badges, bloc Options) : on recharge la
                // liste à chaque ouverture pour rester à jour même si elle a changé ailleurs.
                this.updateScheduleList(() => this.renderScheduleBadges('divShadeScheduleBadges', 'shade', shadeId));
            }

            // --- Gestion dynamique du Titre, Description et Badge Capacity ---
            const hTitle = g('somfyHeaderTitle'), hDesc = g('somfyHeaderDesc');

            if (hTitle && hDesc) {
                if (isNew) {
                    // Mode Création : Phrase brute sans badge
                    hTitle.innerText = tr('SHADE_CREATE_TITLE');
                    hDesc.innerText = tr('SHADE_CREATE_DESC');
                } else {
                    // Mode Édition : Titre + Phrase avec le badge de capacité globale (ex: 2/30)
                    hTitle.innerText = tr('SHADE_EDIT_TITLE');

                    const currentCount = this.shades ? this.shades.length : 0;
                    const formattedCapacity = `<span class="desc-highlight">${currentCount}/30</span>`;

                    hDesc.innerHTML = tr('SHADE_EDIT_DESC').replace('%s', formattedCapacity);
                }
            }

            if (g('valTilt')) g('valTilt').innerText = shade.tiltPosition || 0;

            ui.setFocus('btnPairShade', !isNew && !shade.paired);

            const rev = shade.flipPosition,
            p = rev ? 100 - shade.position : shade.position,
            tp = rev ? 100 - shade.tiltPosition : shade.tiltPosition;

            if (ico) {
                const st = ico.style;
                st.setProperty('--shade-position', p);
                st.setProperty('--fpos', p + '%');
                st.setProperty('--tilt-position', tp + '%');
                ico.setAttribute('data-shadeid', isNew ? '*' : shadeId);
            }
            g('btnSaveShadeText').innerText = tr(isNew ? 'BT_CREATE' : 'BT_SAVE');
            g('useSaveShadeIcon').setAttribute('href', isNew ? '#svg-add' : '#svg-save');
            g('spanShadeId').innerText = isNew ? '*' : shadeId;

            // Champs virtuels en secondes pour l'affichage (mode Manuel) -- le firmware ne connaît
            // que des millisecondes (upTime/downTime/tiltTimeUp/tiltTimeDown), la conversion inverse
            // se fait dans saveShade() juste avant l'envoi.
            shade.upTimeSec = Math.round(shade.upTime / 100) / 10;
            shade.downTimeSec = Math.round(shade.downTime / 100) / 10;
            shade.tiltTimeUpSec = Math.round((shade.tiltTimeUp || 0) / 100) / 10;
            shade.tiltTimeDownSec = Math.round((shade.tiltTimeDown || 0) / 100) / 10;
            ui.toElement(g('somfyShade'), shade);
            if (g('selShadeBitLength')) g('somfyShade').setAttribute('data-bitlength', g('selShadeBitLength').value);
            this.onShadeTypeChanged(g('selShadeType'));
            // Assistant par défaut pour un volet existant (le résumé a un sens) ; Manuel pour une
            // création (pas encore de shadeId, l'assistant ne pourrait de toute façon rien chronométrer).
            this.setCalibrationMode(isNew ? 'manual' : 'wizard');
            this.showEditShade(true);
            // Ne commence à suivre les modifications qu'une fois le formulaire rempli avec les
            // valeurs actuelles, pour ne pas marquer "modifié" ce remplissage programmatique.
            watchDirty(g('somfyShade'));
        });
    }
    saveShade() {
        const g = get,
        sId = parseInt(g('spanShadeId').innerText, 10),
        obj = ui.fromElement(g('somfyShade')),
        settings = g('divSomfySettings');

        // Les champs de saisie sont en secondes (upTimeSec/...) ; le firmware attend des
        // millisecondes (upTime/...) -- reconversion avant les contrôles de bornes ci-dessous, qui
        // portent sur obj.upTime etc.
        ['upTime', 'downTime', 'tiltTimeUp', 'tiltTimeDown'].forEach((f) => {
            const sec = obj[`${f}Sec`];
            if (typeof sec !== 'undefined' && !isNaN(sec)) obj[f] = Math.round(sec * 1000);
            delete obj[`${f}Sec`];
        });

        const checks = [
            [isNaN(obj.remoteAddress) || obj.remoteAddress < 1 || obj.remoteAddress > 16777215, 'ERR_REMOTE_ADDRESS_INVALID'],
            [!obj.name || obj.name.length > 20, 'ERR_DEVIVE_NAME_INVALID'],
            [isNaN(obj.upTime) || obj.upTime < 1 || obj.upTime > 180000, 'ERR_UP_TIME_INVALID'],
            [isNaN(obj.downTime) || obj.downTime < 1 || obj.downTime > 180000, 'ERR_DOWN_TIME_INVALID'],
            [isNaN(obj.tiltTimeUp) || obj.tiltTimeUp < 1 || obj.tiltTimeUp > 180000, 'ERR_TILT_TIME_UP_INVALID'],
            [isNaN(obj.tiltTimeDown) || obj.tiltTimeDown < 1 || obj.tiltTimeDown > 180000, 'ERR_TILT_TIME_DOWN_INVALID']
        ];

        const basicError = checks.find(c => c[0]);
        if (basicError) return ui.errorMessage(settings, tr(basicError[1]));
        if (obj.proto === 8 || obj.proto === 9) {
            const isSp = [5, 14, 15, 16, 10].includes(obj.shadeType);

            if (obj.gpioUp === obj.gpioDown && !(isSp && obj.proto === 9)) {
                return ui.errorMessage(settings, tr('ERR_GPIO_UP_DOWN_NOT_UNIQUE'));
            }
            if (!isSp && obj.proto === 9 && (obj.gpioMy === obj.gpioUp || obj.gpioMy === obj.gpioDown)) {
                return ui.errorMessage(settings, tr('ERR_GPIO_UP_DOWN_MY_NOT_UNIQUE'));
            }
        }
        const isNew = isNaN(sId) || sId >= 255;
        if (!isNew) obj.shadeId = sId;

        putJSONSync(isNew ? '/addShade' : '/saveShade', obj, (err, shade) => {
            if (err) return ui.serviceError(err);

            logger.debug("Shade saved/added:", shade);
            const msg = isNew ? tr('MSG_ADD_SUCCESS') : tr('MSG_SAVE_SUCCESS');
            ui.successMessage(msg);
            clearDirty();
            this.updateShadeList()
            this.openEditShade(shade.shadeId);
        });
    }
    deleteShade(shadeId) {
        let valid = true;
        if (isNaN(shadeId) || shadeId >= 255 || shadeId <= 0) {
            ui.errorMessage(tr('ERR_DEVICE_ID_REQUIRED'));
            valid = false;
        }
        if (valid) {
            getJSONSync(`/shade?shadeId=${shadeId}`, (err, shade) => {
                if (err) ui.serviceError(err);
                else if (shade.inGroup) ui.errorMessage(tr('ERR_DEVICE_IN_GROUP'));
                else {
                    let prompt = ui.promptMessage(tr('PROMPT_DELETE_SHADE'), () => {
                        ui.clearErrors();
                        putJSONSync('/deleteShade', { shadeId: shadeId }, (err, shade) => {
                            this.updateShadeList();
                            prompt.remove();
                        });
                    });
                    prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_DELETE_SHADE_WARNING")}</p><p>${tr("PROMPT_DELETE_SHADE_CONFIRM").replace("{SHADE_NAME}", escHtml(shade.name))}</p>`;
                }
            });
        }
    }
    updateShadeList(cb) {
        getJSONSync('/shades', (err, shades) => {
            if (err) {
                logger.error('Failed to load shades:', err);
                ui.serviceError(err);
            }
            else {
                //console.log(shades);
                // Create the shades list.
                this.setShadesList(shades);
                if (typeof cb === 'function') cb();
            }
        });
    }

    setRollingCode(shadeId, rollingCode) {
        putJSONSync('/setRollingCode', { shadeId: shadeId, rollingCode: rollingCode }, (err, shade) => {
            if (err) ui.serviceError(get('divSomfySettings'), err);
            else {
                let dlg = get('divRollingCode');
                if (dlg) { clearDirty(dlg); dlg.remove(); }
            }
        });
    }

    openSetRollingCode(shadeId) {
        let overlay = ui.waitMessage(get('divContainer'));
        getJSON(`/shade?shadeId=${shadeId}`, (err, shade) => {
            overlay.remove();
            if (err) return ui.serviceError(err);

            let div = document.createElement('div');
            div.id = 'divRollingCode';
            div.className = 'modal-overlay';

            div.innerHTML = `
            <div class="message-content">
            ${modalHeader('ROLLING_CODE_TITLE', 'svg-warning', {
                subtitle: 'ROLLING_CODE_DESC',
            })}
            <div class="overlay-scroll-content">

            <div class="error">
            <div class="error-header">
            <svg><use href="#svg-warning"></use></svg>
            <b>${tr("MSG_DANGER")}</b>
            </div>

            <div class="information-text">
            <span>${tr("ROLLING_CODE_WARNING_DESC_1")}</span>
            </div>
            </div>

            <div class="uniblocStep">${tr("ROLLING_CODE_WARNING_DESC_2")}</div>
            <div class="uniblocCol uniblocRollingCode dirty-target">
            <label class="label" for="fldNewRollingCode">${tr("BT_ROLLING_CODE")}</label>
            <input id="fldNewRollingCode" class="inputAndSelect" min="0" max="65535" name="newRollingCode" type="number" value="${shade.lastRollingCode}">
            </div>


            </div>

            <div class="hrModal margin0"></div>
            <div class="button-container-modal">
            <div class="button-content-modal">

            <button id="btnChangeRollingCode" class="bouton-Danger" type="button" onclick="somfy.setRollingCode(${shadeId}, parseInt(get('fldNewRollingCode').value, 10));">${tr("BT_SET_ROLLING_CODE")}</button>
            <button id="btnCancel" line type="button">${tr("BT_CANCEL_1")} </button>
            </div>
            </div>
            </div>`;

            shOverlay(div);
            watchDirty(div);
            div.querySelector('#btnCancel').onclick = () => confirmDiscardChanges(() => closeOverlay(div));
            ui.setFocus(btnCancel, true, 'var(--color-success)');
        });
    }
    setPaired(shadeId, paired) {
        let obj = { shadeId: shadeId, paired: paired || false };
        let div = get('divPairing');
        let overlay = typeof div === 'undefined' ? undefined : ui.waitMessage(div);
        putJSONSync('/setPaired', obj, (err, shade) => {
            if (overlay) overlay.remove();
            if (err) {
                logger.error('Failed to set pairing state:', err);
                ui.errorMessage(err.message);
            }
            else if (div) {
                logger.debug('Pairing state updated:', shade);
                this.showEditShade(true);
                get('btnSaveShade').style.display = 'flex';
                get('btnLinkRemote').style.display = '';
                if (shade.paired) {
                    get('btnUnpairShade').style.display = 'flex';
                    get('btnPairShade').style.display = 'none';
                }
                else {
                    get('btnPairShade').style.display = 'flex';
                    get('btnUnpairShade').style.display = 'none';
                }
                this.setLinkedRemotesList(shade);
                closeOverlay(div);
            }
        });
    }
    _shWiz(shadeId, isUnpair) {
        const sType = parseInt(get('somfyShade').getAttribute('data-shadetype'), 10);
        const isG = (sType === 5 || sType === 6);
        const pre = isUnpair ? 'UNPAIR' : 'PAIR';
        const dev = isG ? 'GARAGE' : 'SHADE';
        const progId = isUnpair ? 'btnSendUnpairing' : 'btnSendPairing';
        const stopId = isUnpair ? 'btnStopUnpairing' : 'btnStopPairing';
        const sucBtnId = isUnpair ? 'btnUnpairShade' : 'btnPairShade';
        const sucVal = isUnpair ? 0 : 1;
        const focusVal = isUnpair ? 1 : 0;
        const sucAction = `somfy.setPaired(${shadeId},${sucVal});ui.setFocus('${sucBtnId}',${focusVal});closeOverlay(get('divPairing'));`;
        const descKey = `${pre}_${dev}_DESC`;
        const stepTitles = ["WIZ_TITLE_STEP1", `${pre}_TITLE_STEP2`, "WIZ_TITLE_STEP3"];
        const t = (s, l) => {
            const sk = `${pre}_${dev}_STEP_${s}_${l}`, fk = `WIZ_${dev}_STEP_${s}_${l}`, r = tr(sk);
            return (r === sk) ? tr(fk) : r;
        };
        const it = (n, s, l) => `<div class="step-item"><div class="step-number">${n}</div><div class="step-text">${t(s, l)}</div></div>`;
        const txt = (s, l) => `<div class="step-text">${t(s, l)}</div>`;
        const inf = (s, l) => `
        <div class="information wizard-step" data-stepid="${s}"><div class="information-header"><svg><use href="#svg-info"></use></svg><b>${tr("MSG_NOTE")}</b></div><div class="information-text"><span>${t(s, l)}</span></div></div>`;

        let div = document.createElement('div');
        div.className = `inst-overlay wizard${ui.isExpertMode ? ' is-expert' : ''}`;
        div.id = 'divPairing';
        div.setAttribute('data-stepid', '1');
        div.setAttribute('data-type', 'link-remote');
        div.setAttribute('data-shadeid', shadeId);

        div.innerHTML = `
        <div class="instructions-content">

        ${overlayHeader(isUnpair ? "UNPAIR_TITLE" : "PAIR_TITLE", descKey, isG ? "svg-simpleGarage" : "svg-simpleShutter", {
            subtitle: false, // Exemple de sous-titre optionnel
            showInfo: true,                      // Mettre à false pour masquer le '?'
            showExpert: true                    // Desactive/Active le menu expert
        })}

        <div class="overlay-scroll-content">

        ${wizardStepper(stepTitles)}
        <div class="blocsteps">
        <div class="uniblocStep wizard-step" data-stepid="1">
        ${it('a', 1, 1)} ${it('b', 1, 2)} ${isG ? it('c', 1, 3) : ''}
        </div>
        ${!isG ? inf(1, 3) : ''}
        <div class="button-container-col wizard-step marginB25" data-expert data-stepid="2">
        <button id="${progId}" type="button">${tr("BT_PROG")}</button>
        </div>
        <div class="uniblocStep wizard-step" data-stepid="2">
        ${it('a', 2, 1)} ${it('b', 2, 2)} ${!isG ? it('c', 2, 3) : ''}
        </div>
        ${!isG ? inf(2, 4) : ''}
        <div class="button-container-col wizard-step marginB25" data-expert data-stepid="0">
        <button id="btnWizMarkSuc" type="button" class="btn-success" onclick="${sucAction}">${tr("BT_SAVE")}</button>
        </div>
        <div class="empty-state wizard-step" data-stepid="3"><svg class="empty-icon"><use href=#svg-succes></use></svg></div>
        <div class="uniblocStep wizard-step" data-stepid="3">${txt(3, 1)}</div>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="expert-only-buttons" data-expert>
        <button type="button" line onclick="const o=this.closest('.inst-overlay'); confirmDiscardChanges(() => closeOverlay(o), null, criticalStepGuard(o));">${tr("BT_CANCEL_1")}</button>
        </div>
        <div class="button-container-overlay">
        <button id="${stopId}" class="wizard-step" data-stepid="1" line type="button">${tr("BT_CLOSE")}</button>
        <button id="btnWizPrev" class="wizard-step" data-mstepid="2,3" line type="button" onclick="ui.wizSetPrevStep(this.closest('.wizard'));">${tr("BT_GO_BACK")}</button>
        <button id="btnWizNext" class="wizard-step" data-mstepid="1,2" type="button" onclick="ui.wizSetNextStep(this.closest('.wizard'));">${tr("BT_NEXT")}</button>
        <button id="btnWizMarkSuc" class="wizard-step btn-success" data-stepid="3" type="button" onclick="${sucAction}">${tr("BT_SAVE")}</button>
        </div>
        </div>`;

        const clearT = () => { if (this.btnTimer) { clearInterval(this.btnTimer); this.btnTimer = null; } };
        const fnRep = (err, shade) => {
            clearT();
            if (!err && mouseDown) somfy.sendCommandRepeat(shadeId, 'prog', null, fnRep);
        };

        let btnProg = div.querySelector(`#${progId}`);
        if (btnProg) {
            const onP = () => { somfy.sendCommand(shadeId, 'prog', null, fnRep); };
            btnProg.addEventListener('mousedown', onP, true);
            // preventDefault ici (pas sur mousedown) : évite le mousedown synthétique que les
            // navigateurs mobiles émettent après un touchstart, qui déclencherait sendCommand()
            // une seconde fois pour un seul appui.
            btnProg.addEventListener('touchstart', (e) => { e.preventDefault(); onP(); }, true);
        }
        div.querySelectorAll(`#${stopId}`).forEach(btn => {
            btn.onclick = () => confirmDiscardChanges(() => closeOverlay(div, clearT), null, criticalStepGuard(div));
        });

        // Étape 2 : la commande radio "prog" a pu être envoyée au volet -- cf. criticalStepGuard().
        markCriticalStepReached(div, 2);
        ui.wizSetStep(div, 1);
        shOverlay(div, clearT);

        return div;
    }
    pairShade(shadeId) {
        return this._shWiz(shadeId, false);
    }

    unpairShade(shadeId) {
        return this._shWiz(shadeId, true);
    }
    // Assistant de calibration : chronomètre les temps de montée/descente/tilt d'un équipement en
    // le faisant réellement bouger (Démarrer -> commande radio + chrono client, Stop -> commande
    // d'arrêt + calcul du delta), et diagnostique l'ordre tilt/translation par l'observation de
    // l'utilisateur (RTS ne renvoie aucun état, donc aucune de ces informations n'est mesurable
    // autrement que par ce que l'utilisateur voit et déclenche lui-même). Étapes générées
    // dynamiquement selon les capacités de l'équipement (pas de tilt -> pas d'étape tilt) plutôt
    // que de numéroter des étapes fixes à sauter : plus simple que d'étendre le mécanisme
    // générique data-stepid/wizSetStep pour un cas d'usage à lui seul.
    // Cas particulier des types à tilt (store vénitien) : leurs 5 configurations possibles (aucune,
    // moteur séparé, intégré, orientation seule, mode Euro -- cf. tilt_types côté firmware) changent
    // radicalement le nombre d'étapes, et le champ selTiltType du formulaire caché derrière est
    // souvent encore sur sa valeur par défaut ("Aucune") sur un équipement neuf pas encore configuré
    // -- s'y fier ferait sauter silencieusement les étapes de tilt. On repose donc la question en
    // langage wizard à l'étape 1 (pré-remplie avec la valeur actuelle du formulaire), et on
    // reconstruit dynamiquement les étapes suivantes (stepper + corps + navigation) une fois la
    // réponse connue -- cf. renderSteps() plus bas, seul endroit qui retouche le DOM déjà affiché.
    openCalibrationWizard() {
        const g = get;
        const shadeId = parseInt(g('spanShadeId').innerText, 10);
        if (isNaN(shadeId)) return;
        const shadeType = parseInt(g('somfyShade').getAttribute('data-shadetype'), 10);
        const st = this.shadeTypes.find(x => x.type === shadeType) || {};
        if (!st.lift && !st.tilt) return;

        // st.tilt (pas juste shadeType === Blind) : reste correct si un autre type gagnait un jour
        // la capacité de tilt dans this.shadeTypes.
        const showTiltQuestion = !!st.tilt;
        let tiltType = g('selTiltType') ? parseInt(g('selTiltType').value, 10) : 0;
        let steps = [];
        let totalSteps = 0;
        const measured = {};
        // Bornes de plausibilité d'une mesure chronométrée (Démarrer -> Stop) : en dessous, aucun
        // mouvement réel n'a pu se produire (mis-clic, Stop relâché quasi immédiatement) ; au-delà,
        // l'utilisateur a probablement oublié de cliquer Stop. 180s reprend la même borne haute que
        // la validation du formulaire manuel (cf. checks dans saveShade()) -- rester cohérent entre
        // les deux chemins de saisie plutôt que d'inventer une seconde limite.
        const CAL_MIN_DURATION_MS = 500;
        const CAL_MAX_DURATION_MS = 180000;
        // Pas de l'ajustement fin post-mesure ("trop tôt"/"trop tard", cf. renderSteps()) -- même
        // granularité que le rafraîchissement du chrono affiché (setInterval 100ms plus bas), pour
        // qu'un clic corresponde visuellement au plus petit incrément déjà visible à l'écran.
        const CAL_ADJUST_STEP_MS = 100;

        const buildSteps = (tt) => {
            const hasLift = !!st.lift && tt !== 3;
            const hasTilt = tt > 0;
            const isIntegrated = tt === 2;
            const arr = [{ key: 'intro', titleKey: 'CAL_STEP_INTRO' }];
            if (hasLift) arr.push({ key: 'up', titleKey: 'CAL_STEP_UP', field: 'upTime', tilt: false, dir: 'Up', instrKey: 'CAL_UP_INSTRUCTION', prepKey: 'CAL_UP_PREP', prepCmd: 'Down' });
            if (hasLift) arr.push({ key: 'down', titleKey: 'CAL_STEP_DOWN', field: 'downTime', tilt: false, dir: 'Down', instrKey: 'CAL_DOWN_INSTRUCTION', prepKey: 'CAL_DOWN_PREP', prepCmd: 'Up' });
            if (hasTilt) arr.push({ key: 'tiltUp', titleKey: 'CAL_STEP_TILT_UP', field: 'tiltTimeUp', tilt: true, dir: 'Up', instrKey: isIntegrated ? 'CAL_TILT_UP_INSTRUCTION_INTEGRATED' : 'CAL_TILT_UP_INSTRUCTION', prepKey: 'CAL_TILT_UP_PREP', prepCmd: 'Down' });
            if (hasTilt) arr.push({ key: 'tiltDown', titleKey: 'CAL_STEP_TILT_DOWN', field: 'tiltTimeDown', tilt: true, dir: 'Down', instrKey: isIntegrated ? 'CAL_TILT_DOWN_INSTRUCTION_INTEGRATED' : 'CAL_TILT_DOWN_INSTRUCTION', prepKey: 'CAL_TILT_DOWN_PREP', prepCmd: 'Up' });
            if (isIntegrated) arr.push({ key: 'order', titleKey: 'CAL_STEP_ORDER' });
            arr.push({ key: 'summary', titleKey: 'CAL_STEP_SUMMARY' });
            return arr;
        };

        // Les 5 catégories exposées par selTiltType côté formulaire, reformulées en langage wizard
        // (label + description) au lieu du jargon compact de ce champ -- cf. locales *_CAL_BLIND_OPT_*.
        const blindOptions = [
            { v: 0, key: 'NONE' },
            { v: 1, key: 'TILTMOTOR' },
            { v: 2, key: 'INTEGRATED' },
            { v: 3, key: 'TILTONLY' },
            { v: 4, key: 'EUROMODE' }
        ];
        const introStepHtml = (n) => `
        <div class="uniblocStep wizard-step" data-stepid="${n}">
            <div class="information"><div class="information-text"><span>${tr('CAL_INTRO_TEXT')}</span></div></div>
            ${showTiltQuestion ? `
            <h3 class="unibloc-title" style="margin-top:16px;">${tr('CAL_BLIND_Q_TITLE')}</h3>
            ${blindOptions.map(o => `
            <label class="uniRow dirty-target" for="calBlindType${o.v}">
                <div class="uniLeft">
                    <div class="uniText">
                        <div class="uniLabel">${tr('CAL_BLIND_OPT_' + o.key)}</div>
                        <div class="uniStatus">${tr('CAL_BLIND_OPT_' + o.key + '_DESC')}</div>
                    </div>
                </div>
                <div class="uniRight"><input type="radio" name="calBlindType" id="calBlindType${o.v}" value="${o.v}" ${o.v === tiltType ? 'checked' : ''}></div>
            </label>`).join('')}` : ''}
        </div>`;

        const measureStepHtml = (n, s) => `
        <div class="uniblocStep wizard-step" data-stepid="${n}">
            <div class="information">
                <div class="information-header"><svg><use href="#svg-info"></use></svg><b>${tr('MSG_NOTE')}</b></div>
                <div class="information-text"><span>${tr(s.instrKey)}</span></div>
            </div>
            <div class="button-container-col marginB25">
                <button type="button" line data-cal-prep="${s.key}">${tr(s.prepKey)}</button>
            </div>
            <div class="cal-timer" data-cal-timer="${s.key}" style="font-size:2.2em;font-variant-numeric:tabular-nums;text-align:center;margin:10px 0;">0.0 s</div>
            <div class="button-container-col">
                <button type="button" class="btn-success" data-cal-start="${s.key}">${tr('BT_START')}</button>
                <button type="button" class="btn-success" data-cal-stop="${s.key}" style="display:none;">${tr('BT_STOP')}</button>
                <button type="button" line data-cal-cancel="${s.key}" style="display:none;">${tr('BT_CANCEL')}</button>
            </div>
            <div class="step-text" data-cal-result="${s.key}" style="display:none;text-align:center;margin-top:8px;"></div>
            <div data-cal-adjust="${s.key}" style="display:none;text-align:center;margin-top:6px;">
                <div class="uniStatus" style="margin-bottom:6px;">${tr('CAL_ADJUST_INTRO')}</div>
                <div class="button-container-row" style="justify-content:center;gap:8px;">
                    <button type="button" line data-cal-adjust-dir="early" title="${tr('CAL_ADJUST_TOO_EARLY_DESC')}">${tr('CAL_ADJUST_TOO_EARLY')}</button>
                    <button type="button" line data-cal-adjust-dir="late" title="${tr('CAL_ADJUST_TOO_LATE_DESC')}">${tr('CAL_ADJUST_TOO_LATE')}</button>
                </div>
            </div>
        </div>`;

        const orderStepHtml = (n) => `
        <div class="uniblocStep wizard-step" data-stepid="${n}">
            <div class="information">
                <div class="information-header"><svg><use href="#svg-info"></use></svg><b>${tr('MSG_NOTE')}</b></div>
                <div class="information-text"><span>${tr('CAL_ORDER_INTRO')}</span></div>
            </div>
            <div class="button-container-col marginB25"><button type="button" line data-cal-test="open">${tr('CAL_ORDER_TEST_OPEN')}</button></div>
            <label class="uniRow dirty-target" for="calTiltFirstOnOpen">
                <div class="uniLeft">
                    <div class="uniblocSvg-S"><svg><use href="#svg-upTime"></use></svg></div>
                    <div class="uniText">
                        <div class="uniLabel">${tr('CAL_ORDER_QUESTION_OPEN')}</div>
                        <div class="uniStatus">${tr('CAL_ORDER_QUESTION_OPEN_DESC')}</div>
                    </div>
                </div>
                <div class="uniRight"><span class="switch"><input id="calTiltFirstOnOpen" type="checkbox"/><div></div></span></div>
            </label>
            <div class="button-container-col marginB25"><button type="button" line data-cal-test="close">${tr('CAL_ORDER_TEST_CLOSE')}</button></div>
            <label class="uniRow dirty-target" for="calTiltFirstOnClose">
                <div class="uniLeft">
                    <div class="uniblocSvg-S"><svg><use href="#svg-downTime"></use></svg></div>
                    <div class="uniText">
                        <div class="uniLabel">${tr('CAL_ORDER_QUESTION_CLOSE')}</div>
                        <div class="uniStatus">${tr('CAL_ORDER_QUESTION_CLOSE_DESC')}</div>
                    </div>
                </div>
                <div class="uniRight"><span class="switch"><input id="calTiltFirstOnClose" type="checkbox"/><div></div></span></div>
            </label>
        </div>`;

        const summaryStepHtml = (n) => `
        <div class="uniblocStep wizard-step" data-stepid="${n}">
            <div class="empty-state"><svg class="empty-icon"><use href="#svg-succes"></use></svg></div>
            <div class="step-text">${tr('CAL_SUMMARY_TEXT')}</div>
            <div id="calSummaryTable" style="margin:10px 0;"></div>
        </div>`;

        const bodyHtml = () => {
            let idx = 0;
            return steps.map((s) => {
                idx++;
                if (s.key === 'intro') return introStepHtml(idx);
                if (s.key === 'order') return orderStepHtml(idx);
                if (s.key === 'summary') return summaryStepHtml(idx);
                return measureStepHtml(idx, s);
            }).join('');
        };

        let div = document.createElement('div');
        div.className = 'inst-overlay wizard';
        div.id = 'divCalibration';
        div.setAttribute('data-stepid', '1');
        div.setAttribute('data-type', 'calibration');
        div.setAttribute('data-shadeid', shadeId);
        div.innerHTML = `
        <div class="instructions-content">
        ${overlayHeader('CAL_TITLE', 'CAL_DESC', 'svg-simpleShutter', { showInfo: true })}
        <div class="overlay-scroll-content"></div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay">
        <button id="btnCalClose" class="wizard-step" data-stepid="1" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnCalPrev" class="wizard-step" line type="button" onclick="ui.wizSetPrevStep(this.closest('.wizard'));">${tr('BT_GO_BACK')}</button>
        <button id="btnCalNext" class="wizard-step" type="button">${tr('BT_NEXT')}</button>
        <button id="btnCalSave" class="wizard-step btn-success" type="button">${tr('BT_SAVE')}</button>
        </div>
        </div>`;

        const scrollContent = div.querySelector('.overlay-scroll-content');
        const btnPrev = div.querySelector('#btnCalPrev');
        const btnNext = div.querySelector('#btnCalNext');
        const btnSave = div.querySelector('#btnCalSave');
        const btnClose = div.querySelector('#btnCalClose');

        // Pendant qu'un chrono est en cours (entre le clic sur Démarrer et celui sur Stop), la
        // commande radio de mouvement a déjà été envoyée au volet -- changer d'étape ou fermer
        // l'assistant à ce moment-là laisserait le moteur tourner sans qu'on puisse plus l'arrêter
        // depuis l'UI (le bouton Stop de cette étape disparaîtrait avec le reste). On verrouille
        // donc toute la navigation du footer tant qu'aucun Stop n'a été cliqué.
        const setNavLocked = (locked) => {
            [btnPrev, btnNext, btnClose, btnSave].forEach(btn => { if (btn) btn.disabled = locked; });
        };

        const fieldLabelKeys = { upTime: 'SHADE_UP_TIME', downTime: 'SHADE_DOWN_TIME', tiltTimeUp: 'SHADE_TILT_TIME_UP', tiltTimeDown: 'SHADE_TILT_TIME_DOWN' };
        const buildSummary = () => {
            const tbl = div.querySelector('#calSummaryTable');
            if (!tbl) return;
            const cbOpen = div.querySelector('#calTiltFirstOnOpen');
            const cbClose = div.querySelector('#calTiltFirstOnClose');
            let html = '';
            Object.keys(measured).forEach(field => {
                html += `<div class="uniRow"><div class="uniLabel">${tr(fieldLabelKeys[field])}</div><div>${(measured[field] / 1000).toFixed(1)} s</div></div>`;
            });
            if (steps.some(s => s.key === 'order')) {
                html += `<div class="uniRow"><div class="uniLabel">${tr('CAL_ORDER_QUESTION_OPEN')}</div><div>${(cbOpen && cbOpen.checked) ? tr('BT_YES') : tr('BT_NO')}</div></div>`;
                html += `<div class="uniRow"><div class="uniLabel">${tr('CAL_ORDER_QUESTION_CLOSE')}</div><div>${(cbClose && cbClose.checked) ? tr('BT_YES') : tr('BT_NO')}</div></div>`;
            }
            tbl.innerHTML = html || `<div class="step-text">${tr('CAL_SUMMARY_EMPTY')}</div>`;
        };
        div.addEventListener('stepchanged', (e) => { if (e.detail.newStep === totalSteps) buildSummary(); });

        // (Re)construit le stepper + le corps des étapes pour le tiltType courant et met à jour la
        // navigation (mstepid/stepid dépendent de totalSteps, donc jamais figés dans le template
        // HTML) -- appelé une première fois à l'ouverture, puis à nouveau seulement si la réponse à
        // la question de tilt (étape 1) change, cf. btnNext.onclick plus bas.
        const renderSteps = () => {
            steps = buildSteps(tiltType);
            totalSteps = steps.length;
            scrollContent.innerHTML = `${wizardStepper(steps.map(s => s.titleKey))}<div class="blocsteps">${bodyHtml()}</div>`;

            const prevSteps = [], nextSteps = [];
            for (let i = 2; i <= totalSteps; i++) prevSteps.push(i);
            for (let i = 1; i < totalSteps; i++) nextSteps.push(i);
            btnPrev.setAttribute('data-mstepid', prevSteps.join(','));
            btnNext.setAttribute('data-mstepid', nextSteps.join(','));
            btnSave.setAttribute('data-stepid', String(totalSteps));

            // À l'étape 1 d'un type à tilt, la séquence exacte (nombre/nature des étapes) dépend de
            // la réponse à la question ci-dessus -- afficher les puces du stepper avant qu'elle ne
            // soit connue montrerait un décompte qui se réajuste sous les yeux de l'utilisateur dès
            // le clic sur Suivant. On masque donc les puces tant qu'on est à l'étape 1, et elles
            // n'apparaissent qu'à partir de l'étape 2 (même ensemble de steps que le bouton Retour :
            // prevSteps). Le titre de l'étape courante (step-title-container) n'est pas concerné --
            // il reste correct dès l'étape 1 ("Introduction").
            const stepperWrap = scrollContent.querySelector('.stepper-wrapper');
            if (stepperWrap) {
                if (showTiltQuestion) stepperWrap.setAttribute('data-mstepid', prevSteps.join(','));
                else stepperWrap.removeAttribute('data-mstepid');
            }

            div.querySelectorAll('[data-cal-prep]').forEach(btn => {
                const s = steps.find(x => x.key === btn.getAttribute('data-cal-prep'));
                btn.onclick = () => { if (s.tilt) somfy.sendTiltCommand(shadeId, s.prepCmd); else somfy.sendCommand(shadeId, s.prepCmd); };
            });

            div.querySelectorAll('[data-cal-start]').forEach(startBtn => {
                const key = startBtn.getAttribute('data-cal-start');
                const s = steps.find(x => x.key === key);
                const stopBtn = div.querySelector(`[data-cal-stop="${key}"]`);
                const cancelBtn = div.querySelector(`[data-cal-cancel="${key}"]`);
                const timerEl = div.querySelector(`[data-cal-timer="${key}"]`);
                const resultEl = div.querySelector(`[data-cal-result="${key}"]`);
                const adjustRow = div.querySelector(`[data-cal-adjust="${key}"]`);

                // Ajustement fin post-mesure ("trop tôt"/"trop tard") : corrige measured[s.field] par
                // petits pas sans repasser par un Démarrer/Stop complet -- utile pour compenser le
                // temps de réaction de l'utilisateur (quelques centaines de ms) plutôt que de tout
                // rejouer pour un écart mineur. Ne s'applique qu'à une mesure déjà valide (le bouton
                // n'est affiché qu'à ce moment-là, cf. plus bas) ; reste dans les mêmes bornes de
                // plausibilité que la mesure initiale.
                const applyAdjust = (deltaMs) => {
                    const cur = measured[s.field];
                    if (typeof cur === 'undefined') return;
                    const next = Math.max(CAL_MIN_DURATION_MS, Math.min(CAL_MAX_DURATION_MS, cur + deltaMs));
                    measured[s.field] = next;
                    timerEl.textContent = (next / 1000).toFixed(1) + ' s';
                    resultEl.textContent = `${tr('CAL_RESULT_LABEL')} ${(next / 1000).toFixed(1)} s`;
                };
                if (adjustRow) {
                    const btnEarly = adjustRow.querySelector('[data-cal-adjust-dir="early"]');
                    const btnLate = adjustRow.querySelector('[data-cal-adjust-dir="late"]');
                    // "Trop tôt" = Stop cliqué avant la fin réelle du mouvement -> la vraie durée est
                    // plus longue -> on ajoute. "Trop tard" = l'inverse -> on retire.
                    if (btnEarly) btnEarly.onclick = () => applyAdjust(CAL_ADJUST_STEP_MS);
                    if (btnLate) btnLate.onclick = () => applyAdjust(-CAL_ADJUST_STEP_MS);
                }

                // Bouton de secours à côté de "Stop" (visible seulement pendant le chrono) : Stop
                // dit "le mouvement est terminé, voici la vraie durée" (validée, potentiellement
                // enregistrée) ; Annuler dit "j'abandonne cet essai" -- même arrêt radio (le moteur
                // est déjà en mouvement, il faut le stopper dans tous les cas), mais sans toucher à
                // measured[s.field] ni valider quoi que ce soit : traité comme si l'essai n'avait
                // jamais eu lieu.
                let iv = null;
                const endMeasurement = () => {
                    clearInterval(iv);
                    stopBtn.style.display = 'none';
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    startBtn.style.display = '';
                    setNavLocked(false);
                };
                startBtn.onclick = () => {
                    const t0 = Date.now();
                    resultEl.style.display = 'none';
                    if (adjustRow) adjustRow.style.display = 'none';
                    startBtn.style.display = 'none';
                    stopBtn.style.display = '';
                    if (cancelBtn) cancelBtn.style.display = '';
                    setNavLocked(true);
                    iv = setInterval(() => { timerEl.textContent = ((Date.now() - t0) / 1000).toFixed(1) + ' s'; }, 100);
                    if (s.tilt) somfy.sendTiltCommand(shadeId, s.dir); else somfy.sendCommand(shadeId, s.dir);
                    if (cancelBtn) cancelBtn.onclick = () => {
                        if (s.tilt) somfy.sendTiltCommand(shadeId, 'My'); else somfy.sendCommand(shadeId, 'My');
                        endMeasurement();
                        timerEl.textContent = '0.0 s';
                        resultEl.style.display = '';
                        resultEl.style.color = '';
                        resultEl.textContent = tr('CAL_MEASURE_CANCELLED');
                        if (adjustRow) adjustRow.style.display = 'none';
                        // "Refaire" (pas "Démarrer") si une mesure valide antérieure subsiste --
                        // l'annulation ne touche jamais measured[s.field], cf. commentaire ci-dessus.
                        startBtn.textContent = tr(typeof measured[s.field] !== 'undefined' ? 'CAL_BTN_REDO' : 'BT_START');
                    };
                    stopBtn.onclick = () => {
                        const elapsedMs = Date.now() - t0;
                        if (s.tilt) somfy.sendTiltCommand(shadeId, 'My'); else somfy.sendCommand(shadeId, 'My');
                        endMeasurement();
                        timerEl.textContent = (elapsedMs / 1000).toFixed(1) + ' s';
                        resultEl.style.display = '';
                        // Mesure hors bornes : ignorée plutôt qu'enregistrée -- measured[s.field] n'est
                        // PAS touché (ni assigné, ni supprimé) : un Refaire raté après une mesure déjà
                        // valide dans cette même session ne doit pas effacer cette dernière, il doit
                        // juste ne pas la remplacer. Même filet que CAL_SUMMARY_TEXT pour une étape
                        // jamais mesurée : la valeur actuelle (mesure précédente ou stockage existant)
                        // est conservée, l'utilisateur reste libre de recommencer ou de passer à la suite.
                        if (elapsedMs < CAL_MIN_DURATION_MS || elapsedMs > CAL_MAX_DURATION_MS) {
                            resultEl.style.color = 'var(--color-danger)';
                            resultEl.textContent = elapsedMs < CAL_MIN_DURATION_MS ? tr('CAL_ERR_DURATION_TOO_SHORT') : tr('CAL_ERR_DURATION_TOO_LONG');
                            if (adjustRow) adjustRow.style.display = 'none';
                            // "Refaire" (pas "Démarrer") si une mesure valide antérieure subsiste encore
                            // dans measured -- cf. commentaire ci-dessus, elle n'a pas été effacée.
                            startBtn.textContent = tr(typeof measured[s.field] !== 'undefined' ? 'CAL_BTN_REDO' : 'BT_START');
                            return;
                        }
                        measured[s.field] = elapsedMs;
                        resultEl.style.color = '';
                        resultEl.textContent = `${tr('CAL_RESULT_LABEL')} ${(elapsedMs / 1000).toFixed(1)} s`;
                        if (adjustRow) adjustRow.style.display = '';
                        startBtn.textContent = tr('CAL_BTN_REDO');
                    };
                };
            });

            const cbOpen = div.querySelector('#calTiltFirstOnOpen');
            const cbClose = div.querySelector('#calTiltFirstOnClose');
            if (cbOpen) cbOpen.checked = g('cbTiltFirstOnOpen') ? g('cbTiltFirstOnOpen').checked : true;
            if (cbClose) cbClose.checked = g('cbTiltFirstOnClose') ? g('cbTiltFirstOnClose').checked : true;
            div.querySelectorAll('[data-cal-test]').forEach(btn => {
                const which = btn.getAttribute('data-cal-test');
                btn.onclick = () => {
                    somfy.sendCommand(shadeId, which === 'open' ? 'Up' : 'Down');
                    setTimeout(() => somfy.sendCommand(shadeId, 'My'), 1000);
                };
            });
        };
        renderSteps();

        // Ne relit/reconstruit que si la réponse a réellement changé -- purge aussi measured{} dans
        // ce cas : une mesure déjà prise avant un changement d'avis (ex. montée chronométrée, puis
        // retour à l'étape 1 pour choisir un autre tiltType) porterait sur des étapes qui peuvent ne
        // plus exister dans le nouveau parcours, et resterait sinon silencieusement dans le PATCH
        // final malgré une UI repartie à zéro.
        let lastTiltType = tiltType;
        btnNext.onclick = () => {
            if (showTiltQuestion && ui.wizCurrentStep(div) === 1) {
                const picked = div.querySelector('input[name="calBlindType"]:checked');
                tiltType = picked ? parseInt(picked.value, 10) : tiltType;
                if (tiltType !== lastTiltType) {
                    Object.keys(measured).forEach(k => delete measured[k]);
                    lastTiltType = tiltType;
                }
                renderSteps();
            }
            ui.wizSetNextStep(div);
        };

        btnSave.onclick = () => {
            const obj = { shadeId: shadeId };
            Object.assign(obj, measured);
            if (showTiltQuestion) obj.tiltType = tiltType;
            const cbOpen = div.querySelector('#calTiltFirstOnOpen');
            const cbClose = div.querySelector('#calTiltFirstOnClose');
            if (cbOpen) obj.tiltFirstOnOpen = cbOpen.checked;
            if (cbClose) obj.tiltFirstOnClose = cbClose.checked;
            putJSON('/saveShade', obj, (err, shade) => {
                if (err) return ui.errorMessage(div, tr('CAL_ERR_SAVE'));
                // Les champs du mode Manuel sont désormais liés en secondes (upTimeSec/...) -- même
                // conversion que _openEditShade().
                ['upTime', 'downTime', 'tiltTimeUp', 'tiltTimeDown'].forEach((f) => {
                    const el = g({ upTime: 'fldShadeUpTime', downTime: 'fldShadeDownTime', tiltTimeUp: 'fldTiltTimeUp', tiltTimeDown: 'fldTiltTimeDown' }[f]);
                    if (el && typeof shade[f] !== 'undefined') el.value = Math.round(shade[f] / 100) / 10;
                });
                if (g('cbTiltFirstOnOpen') && typeof shade.tiltFirstOnOpen !== 'undefined') g('cbTiltFirstOnOpen').checked = shade.tiltFirstOnOpen;
                if (g('cbTiltFirstOnClose') && typeof shade.tiltFirstOnClose !== 'undefined') g('cbTiltFirstOnClose').checked = shade.tiltFirstOnClose;
                // Le choix fait à l'étape 1 devient la config persistée -- resynchronise le
                // formulaire caché derrière (visibilité des champs de tilt, étape d'ordre) pour
                // qu'il reflète le nouveau tiltType sans attendre une réouverture du formulaire.
                if (showTiltQuestion && g('selTiltType') && typeof shade.tiltType !== 'undefined') {
                    g('selTiltType').value = shade.tiltType;
                    somfy.onShadeTypeChanged(g('selTiltType'));
                }
                somfy.updateCalibrationSummary();
                div.removeAttribute('data-radio-committed');
                closeOverlay(div);
            });
        };

        // Câblage explicite plutôt que l'attribut générique [close] : overlayHeader() pose déjà son
        // propre [close] (icône X) plus haut dans le DOM, et shOverlay() ne branche que le PREMIER
        // [close] trouvé -- un second [close] ici serait ignoré (cf. _shWiz/_gpWiz, même pattern).
        btnClose.onclick = () => confirmDiscardChanges(() => closeOverlay(div), null, criticalStepGuard(div));

        markCriticalStepReached(div, 2);
        ui.wizSetStep(div, 1);
        shOverlay(div);
        return div;
    }
    // Validation d'un slider du carrousel (position ou inclinaison) : envoie la cible au firmware,
    // puis REPLACE IMMÉDIATEMENT le curseur sur la dernière position réellement connue du volet.
    //
    // Sans ce repositionnement explicite, le curseur restait sur la valeur lâchée par l'utilisateur
    // (100%) jusqu'à l'arrivée du premier shadeState de mouvement -- or ce délai n'est pas
    // déterministe : le firmware doit d'abord émettre la trame RF (avec ses répétitions) avant que
    // checkMovement() ne commence à publier des positions intermédiaires. Selon que ce premier
    // message arrivait tôt ou tard, l'utilisateur voyait tantôt l'animation repartir de 33%, tantôt
    // un simple saut à 100% -- deuxième source d'aléatoire, indépendante du drapeau dragging.
    // En repartant nous-mêmes de la position réelle, l'animation 33% -> 100% est garantie, et les
    // shadeState successifs ne font plus que la dérouler.
    commitSliderTarget(el, shadeId, isTilt) {
        sliderDragEnd(el);
        const target = parseInt(el.value, 10);
        if (isTilt) this.sendTiltCommand(shadeId, target);
        else this.sendCommand(shadeId, target);
        // dataset.realpos est tenu à jour par procShadeState(), y compris pendant que l'utilisateur
        // manipule le slider (le volet peut déjà être en mouvement quand il le saisit).
        const real = parseInt(el.dataset.realpos, 10);
        if (!isNaN(real)) {
            el.value = real;
            syncSliderProgress(el);
        }
    }
    sendCommand(shadeId, command, repeat, cb) {
        let obj = {};
        if (typeof shadeId.shadeId !== 'undefined') {
            obj = shadeId;
            cb = command;
            shadeId = obj.shadeId;
            repeat = obj.repeat;
            command = obj.command;
        }
        else {
            obj = { shadeId: shadeId };
            if (isNaN(parseInt(command, 10))) obj.command = command;
            else obj.target = parseInt(command, 10);
            if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        }
        logger.debug('Sending shade command:', obj);
        putJSON('/shadeCommand', obj, (err, shade) => {
            if (typeof cb === 'function') cb(err, shade);
        });
    }
    sendCommandRepeat(shadeId, command, repeat, cb) {
        //console.log(`Sending Shade command ${shadeId}-${command}`);
        let obj = {};
        if (typeof shadeId.shadeId !== 'undefined') {
            obj = shadeId;
            cb = command;
            shadeId = obj.shadeId;
            repeat = obj.repeat;
            command = obj.command;
        }
        else {
            obj = { shadeId: shadeId, command: command };
            if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        }
        putJSON('/repeatCommand', obj, (err, shade) => {
            if (typeof cb === 'function') cb(err, shade);
        });
    }
    sendTiltCommand(shadeId, command, cb) {
        logger.debug(`Sending Tilt command ${shadeId}-${command}`);
        if (isNaN(parseInt(command, 10)))
            putJSON('/tiltCommand', { shadeId: shadeId, command: command }, (err, shade) => {
                if (typeof cb === 'function') cb(err, shade);
            });
                else
                    putJSON('/tiltCommand', { shadeId: shadeId, target: parseInt(command, 10) }, (err, shade) => {
                        if (typeof cb === 'function') cb(err, shade);
                    });
    }
    unlinkRemote(shadeId, remoteAddress) {
        let prompt = ui.promptMessage(tr('PROMPT_UNLINK_REMOTE'), () => {
            let obj = {
                shadeId: shadeId,
                remoteAddress: remoteAddress
            };
            putJSONSync('/unlinkRemote', obj, (err, shade) => {
                logger.debug('Remote unlinked:', shade);
                prompt.remove();
                this.setLinkedRemotesList(shade);
            });
        });
    }

    // =========================================================================
    // SECTION : GESTION DES GROUPES (GROUPS)
    // =========================================================================

    setGroupsList(groups) {
        this.groups = groups;
        let divCfg = '';
        let divCtl = '';
        let vrList = get('selVRMotor');
        let optGroup = get('optgrpVRGroups');

        if (typeof groups === 'undefined' || groups.length === 0) {
            if (optGroup) optGroup.remove();
        } else {
            if (!optGroup) {
                optGroup = document.createElement('optgroup');
                optGroup.setAttribute('id', 'optgrpVRGroups');
                optGroup.setAttribute('label', tr('SUBTAB_GROUPS'));
                vrList.appendChild(optGroup);
            } else {
                optGroup.innerHTML = '';
            }
        }
        let roomId = document.querySelector('.room-pill.active') ? parseInt(document.querySelector('.room-pill.active').getAttribute('data-roomid'), 10) : 0;

        if (typeof groups !== 'undefined') {
            groups.sort((a, b) => a.sortOrder - b.sortOrder);

            for (let i = 0; i < groups.length; i++) {
                let group = groups[i];
                let room = _rooms.find(x => x.roomId === group.roomId) || { roomId: 0, name: '' };

                let memberCount = typeof group.linkedShades !== 'undefined' ? group.linkedShades.length : 0;
                let isSunActive = (group.flags & 0x01) ? 'true' : 'false';
                let equipmentText = memberCount > 1 ? `${memberCount} équipements associés` : `${memberCount} équipement associé`;

                // --- Section Configuration ---
                // Même design que la carte volet (setShadesList) : carte entière cliquable, crayon
                // retiré, poignée/poubelle isolent leur clic (event.stopPropagation()). Seule
                // différence : un unique svg-group fixe dans .shade-icon-wrapper (pas de mapping
                // par type, les groupes n'en ont pas).
                divCfg += `<div class="somfyGroup group-draggable" draggable="true" data-roomid="${group.roomId}" data-groupid="${group.groupId}" data-remoteaddress="${group.remoteAddress}" onclick="somfy.openEditGroup(${group.groupId});"><div class="drag-handle" onclick="event.stopPropagation();"><svg class="icon-svg"><use href=#svg-drag></use></svg></div><div class="shade-icon-wrapper"><svg><use href="#svg-group"></use></svg></div><div class="group-name"><div class="name-text">${escHtml(group.name)}</div><div class="cfg-room">${escHtml(room.name)}</div></div><div class="idRemoteAddress"><span class="AddrId-label">${tr("ID")}</span><span class="group-address">${group.remoteAddress}</span></div><div class="divEditDelete-svg" onclick="event.stopPropagation(); somfy.deleteGroup(${group.groupId});"><svg class="icon-svg" style="color: var(--color-danger);"><use href=#svg-trash></use></svg></div></div>`;

                // --- Section Contrôle (divCtl) ---
                divCtl += `<div class="somfyGroupCtl" style="${roomId === 0 || roomId === room.roomId ? '' : 'display:none'}" data-groupid="${group.groupId}" data-roomid="${group.roomId}" data-remoteaddress="${group.remoteAddress}">


                <div class="dash-card-content">

                <!-- Ligne 1 : En-tête -->
                <div class="dash-card-header">

                <div class="group-icon">
                <div class="group-icon-wrapper">
                    <svg width="22" height="22"><use href="#svg-group"></use></svg>
                </div>
                </div>
                <div class="group-name">

                <span class="groupctl-name">${escHtml(group.name)}</span>
                <span class="groupctl-room">${escHtml(room.name)}</span>
                <div class="groupctl-shades">
                <span>${equipmentText}</span>
                </div>
                </div>

                <div class="header-actions">
                <button class="btn-icon-header" title="${tr("OPTION")}" onclick="somfy.openEditGroup(${group.groupId});">
                <svg width="18" height="18"><use href="#svg-menuVertical"></use></svg>
                </button>
                </div>
                </div>

                <!-- BOUTONS DE COMMANDE GLOBALE -->
                <div class="groupctl-buttons">
                <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="up" data-groupid="${group.groupId}" title="${tr("BT_OPEN")}">
                <svg><use href="#svg-up"></use></svg>
                </div>
                <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="my" data-groupid="${group.groupId}" title="${tr("BT_MY")}">
                <svg><use href="#svg-my"></use></svg>
                </div>
                <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="down" data-groupid="${group.groupId}" title="${tr("BT_CLOSE")}">
                <svg><use href="#svg-down"></use></svg>
                </div>
                <div class="button-sunflag cmd-button btn-somfy-svg animScale" data-cmd="sunflag" data-groupid="${group.groupId}" data-on="${isSunActive}" style="${!group.sunSensor ? 'display:none' : ''}" title="${tr("VR_SUN_FLAG")}">
                <svg width="18" height="18"><use href="#vr-sunflag-o"></use></svg>
                </div>
                </div>

                <!-- FOOTER : CAPTEURS ET INDICATEURS -->
                <div class="group-footer">
                <div class="sensor-indicators">
                <div class="group-sensor-item schedule-indicator no-schedule" data-schedule-target="group" data-schedule-id="${group.groupId}">
                <svg width="16" height="16"><use href="#svg-horloge"></use></svg>
                </div>
                </div>
                </div>

                </div>
                </div>`;

                let opt = document.createElement('option');
                opt.textContent = group.name;
                opt.setAttribute('data-address', group.remoteAddress);
                opt.setAttribute('data-type', 'group');
                opt.setAttribute('data-groupid', group.groupId);
                opt.setAttribute('data-bitlength', group.bitLength);
                optGroup.appendChild(opt);
            }
        }


        let sopt = vrList.options[vrList.selectedIndex];
        get('divVirtualRemote').setAttribute('data-bitlength', sopt ? sopt.getAttribute('data-bitlength') : 'none');
        get('divGroupList').innerHTML = divCfg;
        let groupControls = get('divGroupControls');
        groupControls.innerHTML = divCtl;
        this.checkEmptyState();
        // Attach the timer for setting the My Position for the Group.
        let btns = groupControls.querySelectorAll('div.cmd-button');
        for (let i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', (event) => {
                let groupId = parseInt(event.currentTarget.getAttribute('data-groupid'), 10);
                let cmd = event.currentTarget.getAttribute('data-cmd');
                if (cmd === 'sunflag') {
                    if (makeBool(event.currentTarget.getAttribute('data-on')))
                        this.sendGroupCommand(groupId, 'flag');
                    else
                        this.sendGroupCommand(groupId, 'sunflag');
                }
                else
                    this.sendGroupCommand(groupId, cmd);
            }, true);
        }
        this.updateRoomCounts();
        this.setListDraggable(get('divGroupList'), '.group-draggable', (list) => {
            // Get the shade order
            let items = list.querySelectorAll('.group-draggable');
            let order = [];
            for (let i = 0; i < items.length; i++) {
                order.push(parseInt(items[i].getAttribute('data-groupid'), 10));
                // Reorder the shades on the main page.
            }
            putJSONSync('/groupSortOrder', order, (err) => {
                for (let i = order.length - 1; i >= 0; i--) {
                    let el = groupControls.querySelector(`.somfyGroupCtl[data-groupid="${order[i]}"`);
                    if (el) {
                        groupControls.prepend(el);
                    }
                }
            });
        });
        this._syncScheduleIndicators();
    }
    setLinkedShadesList(group) {
        const container = get('divLinkedShadeList');
        const btnContainer = get('divSomfyGroupButtons');
        const btnLink = get('btnLinkShade');
        const shades = group.linkedShades || [];

        if (shades.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
        }
        const hasShades = shades.length > 0;
        if (btnContainer) {
            if (!hasShades) {
                btnContainer.classList.add('disabled');
            } else {
                btnContainer.classList.remove('disabled');
            }
        }
        ui.setFocus(btnLink, !hasShades);

        if (!hasShades) return;

        let html = `<div class="linkedRheader">${tr("GROUP_LINKED_S")}</div>`;

        html += `<div class="linkedScrollArea">`;
        // Reprend le design des cartes .somfyShade/.shade-draggable (setShadesList, cf. plus haut) :
        // icône selon shadeType, titre en gras, ligne "id:" -- mais scopé via .linkedShadeCard
        // (pas .shade-draggable) puisqu'ici pas de drag&drop ni d'édition au clic (cf. overlays.css).
        html += shades.map((shade, i) => {
            const st = this.shadeTypes.find(x => x.type === shade.shadeType) || { type: shade.shadeType, ico: 'svg-window-shade', indic: 'svg-indicRoller' };
            return `
        <div class="somfyLinkedRemote linkedShadeCard" data-shadeid="${shade.shadeId}" data-remoteaddress="${shade.remoteAddress}">
        <div class="shade-icon-wrapper"><svg><use href="#${st.indic}"></use></svg></div><div class="shade-name"><div class="name-text">${escHtml(shade.name)}</div></div><div class="idRemoteAddress"><span class="AddrId-label">id:</span><span class="shade-address">${shade.remoteAddress}</span></div><div class="divEditDelete-svg" onclick="somfy.unlinkGroupShade(${group.groupId}, ${shade.shadeId});"><svg class="icon-svg" style="color: var(--color-danger);"><use href=#svg-unlink></use></svg></div></div>
        `;
        }).join('');

        html += `</div>`;

        container.innerHTML = html;
    }
    procGroupState(state) {
        logger.debug('Group state update:', state);
        let flags = document.querySelectorAll(`.button-sunflag[data-groupid="${state.groupId}"]`);
        for (let i = 0; i < flags.length; i++) {
            flags[i].style.display = state.sunSensor ? '' : 'none';
            // SunFlag = 0x01 (Sunny = 0x20 est l'état du capteur, pas celui du mode soleil) :
            // setGroupsList lit bien 0x01, seul ce rafraîchissement live lisait le mauvais bit.
            flags[i].setAttribute('data-on', (state.flags & 0x01) === 0x01 ? 'true' : 'false');
        }
    }


    showEditGroup(bShow) {
        let el = get('divLinkRepeater');
        if (el) el.remove();
        el = get('divPairing');
        if (el) el.remove();
        el = get('divRollingCode');
        if (el) el.remove();
        el = get('divRemotesOverlay');
        if (el) el.remove();
        el = get('somfyGroup');
        if (el) el.style.display = bShow ? '' : 'none';
        el = get('divGroupListContainer');
        if (el) el.style.display = bShow ? 'none' : '';
        if (!bShow) clearDirty();
        if (bShow) {
            this.showEditRoom(false);
            this.showEditShade(false);
        }
    }

    openEditGroup(groupId) { confirmDiscardChanges(() => this._openEditGroup(groupId)); }
    _openEditGroup(groupId) {
        const g = get,
        isNew = groupId === undefined,
        elGroup = g('somfyGroup'),
        btnLink = g('btnLinkShade'),
        btnSave = g('btnSaveGroup'),
        btnContainer = g('divSomfyGroupButtons'),
        divLinkedShades = g('divLinkedShadeList'),
        blocPairParent = g('blocPairGroup');

        if (isNew && this.groups?.length >= 14)
            return ui.errorMessage(g('divSomfySettings'), tr('ERR_GROUP_LIMIT_REACHED'));

        const s = (idOrElem, d) => { const e = (typeof idOrElem === 'string') ? g(idOrElem) : idOrElem; if(e) e.style.display = d; };
        this.applyLedFeedbackVisibility();

        divLinkedShades.innerHTML = '';

        s(btnContainer, 'flex');
        btnContainer?.classList.toggle('disabled', isNew);
        s(btnLink, 'none');
        s(btnSave, 'none');
        s(blocPairParent, 'none');
        s(divLinkedShades, 'none');
        // Une programmation cible un groupId existant : impossible tant que le groupe n'est pas créé.
        s('divScheduleSectionGroup', isNew ? 'none' : 'flex');

        getJSONSync(isNew ? '/getNextGroup' : `/group?groupId=${groupId}`, (err, group) => {
            if (err) return ui.serviceError(err);

            if (isNew) {
                Object.assign(group, {
                    name: '', flipCommands: false, shades: []
                });
            }
            if (!isNew) {
                s(btnLink, 'flex');
                s(blocPairParent, 'flex');
                s(divLinkedShades, 'block');

                const hasShades = (group.shades && group.shades.length > 0);
                btnContainer?.classList.toggle('disabled', !hasShades);

                ui.setFocus(btnLink, !isNew && !hasShades);
                this.setLinkedShadesList(group);
                // Programmations rattachées à ce groupe (badges, bloc Options) : on recharge la
                // liste à chaque ouverture pour rester à jour même si elle a changé ailleurs.
                this.updateScheduleList(() => this.renderScheduleBadges('divGroupScheduleBadges', 'group', groupId));
            }


            // --- Gestion dynamique du Titre et de la Description avec capacité (Style Badge) ---
            const hTitle = g('somfyGroupHeaderTitle'), hDesc = g('somfyGroupHeaderDesc');

            if (hTitle && hDesc) {
                if (isNew) {
                    // Mode Création : Phrase simple sans badge
                    hTitle.innerText = tr('GROUP_CREATE_TITLE');
                    hDesc.innerText = tr('GROUP_CREATE_DESC');
                } else {
                    // Mode Édition : Titre + Description agrémentée du badge de quota
                    hTitle.innerText = tr('GROUP_EDIT_TITLE');

                    const currentCount = this.groups ? this.groups.length : 0;
                    const formattedCapacity = `<span class="desc-highlight">${currentCount}/14</span>`;

                    hDesc.innerHTML = tr('GROUP_EDIT_DESC').replace('%s', formattedCapacity);
                }
            }

            g('btnSaveGroupText').innerText = tr(isNew ? 'BT_CREATE' : 'BT_SAVE');
            g('useSaveGroupIcon').setAttribute('href', isNew ? '#svg-add' : '#svg-save');

            s(btnSave, 'flex');
            g('spanGroupId').innerText = isNew ? '*' : groupId;

            ui.toElement(elGroup, group);
            this.showEditGroup(true);
            watchDirty(elGroup);
        });
    }
    saveGroup() {
        const g = get,
        sId = g('spanGroupId').innerText,
        groupId = parseInt(sId, 10),
        obj = ui.fromElement(g('somfyGroup')),
        isNew = isNaN(groupId) || groupId >= 255;

        const checks = [
            [isNaN(obj.remoteAddress) || obj.remoteAddress < 1 || obj.remoteAddress > 16777215, 'ERR_REMOTE_ADDRESS_INVALID'],
            [!obj.name || obj.name.length > 20, 'ERR_DEVIVE_NAME_INVALID']
        ];
        const error = checks.find(c => c[0]);
        if (error) return ui.errorMessage(tr(error[1]));
        if (!isNew) obj.groupId = groupId;

        putJSONSync(isNew ? '/addGroup' : '/saveGroup', obj, (err, group) => {
            if (err) return ui.serviceError(err);

            logger.debug("Group saved:", group);
            const msg = isNew ? tr('MSG_ADD_SUCCESS') : tr('MSG_SAVE_SUCCESS');
            ui.successMessage(msg);
            clearDirty();

            // SÉCURITÉ COMPTEUR : Si c'est un nouveau groupe, on l'ajoute temporairement au tableau local
            // pour que openEditGroup() calcule tout de suite le bon nombre.
            if (isNew) {
                if (!this.groups) this.groups = [];
                // On vérifie s'il n'est pas déjà dedans pour éviter les doublons
                if (!this.groups.some(g => g.groupId === group.groupId)) {
                    this.groups.push(group);
                }
            }

            // On affiche instantanément tout le bloc de contrôle (ton comportement initial parfait)
            this.openEditGroup(group.groupId);

            // On rafraîchit proprement la liste en arrière-plan depuis le serveur
            this.updateGroupList(() => {
                this.openEditGroup(group.groupId);
            });
        });
    }
    deleteGroup(groupId) {
        let valid = true;
        if (isNaN(groupId) || groupId >= 255 || groupId <= 0) {
            ui.errorMessage(tr('ERR_INVALID_GROUP_ID'));
            valid = false;
        }
        if (valid) {
            getJSONSync(`/group?groupId=${groupId}`, (err, group) => {
                if (err) ui.serviceError(err);
                else {
                    if (group.linkedShades.length > 0) {
                        ui.errorMessage(tr('ERR_GROUP_NOT_EMPTY'));
                    }
                    else {
                        let prompt = ui.promptMessage(tr('PROMPT_DELETE_GROUP'), () => {
                            putJSONSync('/deleteGroup', { groupId: groupId }, (err, g) => {
                                if (err) ui.serviceError(err);
                                this.updateGroupList();
                                prompt.remove();
                            });
                        });
                        prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_DELETE_GROUP_CONFIRM").replace("{GROUP_NAME}", escHtml(group.name))}</p>`;
                    }
                }
            });
        }
    }
    updateGroupList(cb) {
        getJSONSync('/groups', (err, groups) => {
            if (err) {
                logger.error('Failed to load groups:', err);
                ui.serviceError(err);
            }
            else {
                logger.debug('Group list updated,', groups.length, 'groups');
                // Create the groups list.
                this.setGroupsList(groups);
                if (typeof cb === 'function') cb();
            }
        });
    }
    sendGroupRepeat(groupId, command, repeat, cb) {
        let obj = { groupId: groupId, command: command };
        if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        // `obj` (donc repeat) était construit puis jamais transmis : le corps envoyé était `null`
        // et l'URL ne portait que groupId/command en query string -- WebRadioCommands::
        // handleRepeatCommand ne lit "repeat" que dans la query string OU dans le corps JSON (pas
        // les deux à la fois), jamais rejoint ici. Repeat retombait donc toujours sur le réglage
        // par défaut du groupe (group->repeats), quelle que soit la valeur demandée. Inatteignable
        // avec les appelants actuels (ils passent tous `null`, cf. sendVRCommand/openSetRollingCode),
        // mais cassé pour le prochain qui passerait une vraie valeur. Corrigé pour suivre le même
        // patron que sendCommandRepeat() : `obj` en corps JSON, URL sans query string.
        putJSON('/repeatCommand', obj, (err, group) => {
            if (typeof cb === 'function') cb(err, group);
        });
    }
    sendGroupCommand(groupId, command, repeat, cb) {
        logger.debug(`Sending Group command ${groupId}-${command}`);
        let obj = { groupId: groupId };
        if (isNaN(parseInt(command, 10))) obj.command = command;
        if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        putJSON('/groupCommand', obj, (err, group) => {
            if (typeof cb === 'function') cb(err, group);
        });
    }

    _gpWiz(groupId, isUnlink, shadeId = null) {
        const pre = isUnlink ? 'UNLINK' : 'LINK';
        const stepsCount = isUnlink ? 3 : 4;
        const btnActionId = isUnlink ? 'btnUnpairFromGroup' : 'btnPairToGroup';
        // Libellé court partagé avec l'appairage d'un volet (SHADE_PAIR/SHADE_UNPAIR) : le bouton
        // vit maintenant dans la barre de boutons du bas, où "Appairer au groupe" débordait.
        const btnActionLabel = tr(isUnlink ? 'SHADE_UNPAIR' : 'SHADE_PAIR');
        const titleKey = `${pre}_GROUP_TITLE`;
        const descKey = `${pre}_GROUP_DESC`;
        const t = (s, l) => {
            const sk = `${pre}_GROUP_STEP_${s}_${l}`;
            const fk = `WIZ_LINK_GROUP_STEP_${s}_${l}`;
            const r = tr(sk);
            return (r === sk) ? tr(fk) : r;
        };
        const it = (n, s, l) => `<div class="step-item"><div class="step-number">${n}</div><div class="step-text">${t(s, l)}</div></div>`;
        const inf = (s, l) => `
        <div class="information wizard-step" data-stepid="${s}">
        <div class="information-header">
        <svg><use href="#svg-info"></use></svg>
        <b>${tr("MSG_NOTE")}</b>
        </div>
        <div class="information-text">
        <span>${t(s, l)}</span>
        </div>
        </div>`;

        let div = document.createElement('div');
        div.className = `inst-overlay wizard${ui.isExpertMode ? ' is-expert' : ''}`;
        div.id = isUnlink ? 'divUnlinkGroup' : 'divLinkGroup';
        div.setAttribute('data-groupid', groupId);
        div.setAttribute('data-stepid', '1');

        const stepTitles = [];
        for (let i = 1; i <= stepsCount; i++) {
            let titleIndex = i;
            if (isUnlink && i === 2) titleIndex = 3;
            if (isUnlink && i === 3) titleIndex = 3;

            let tk = `WIZ_LINK_GROUP_TITLE_STEP${titleIndex}`;
            if (tr(tk) === tk || (isUnlink && i === 3) || (!isUnlink && i === 2) || (!isUnlink && i === 4)) {
                tk = `${pre}_GROUP_TITLE_STEP${isUnlink && i === 3 ? '_3' : titleIndex}`;
            }
            stepTitles.push(tk);
        }

        div.innerHTML = `
        <div class="instructions-content">

        ${overlayHeader(titleKey, descKey, "svg-simpleShutter" , {
            subtitle: true,
            showInfo: false,
            showExpert: true
        })}

        <div class="overlay-scroll-content">

        ${wizardStepper(stepTitles)}
        <div class="blocGroupsteps">
        ${inf(1, 1)}
        <div class="uniblocStep wizard-step" data-stepid="1">
        ${it('a', 1, 2)} ${it('c', 1, 3)}
        </div>
        ${!isUnlink ? `
        <div class="uniblocCol LinkGroupSelect wizard-step" data-expert data-stepid="2">
        <label class="label" for="selAvailShades">${tr("LINK_GROUP_SELECT_SHADE")}</label>
        <select id="selAvailShades" class="inputAndSelect" data-bind="shadeId" onchange="document.querySelectorAll('.divWizShadeName').forEach(el => el.textContent = this.options[this.selectedIndex].text);"></select>
        </div>
        <div class="uniblocStep wizard-step" data-stepid="2">
        ${it('a', 2, 1)} ${it('b', 2, 2)}
        </div>
        ${inf(2, 3)}
        ` : ''}
        <div class="blocsteps-row wizard-step" data-expert data-stepid="${isUnlink ? 2 : 3}">
        <div class="divWizShadeName"></div>
        <button type="button" id="btnOpenMemory">${tr("BT_OPEN_MEMORY")}</button>
        </div>
        <div class="uniblocStep wizard-step" data-stepid="${isUnlink ? 2 : 3}">
        ${it('a', isUnlink ? 2 : 3, 1)}
        ${it('b', isUnlink ? 2 : 3, 2)}
        </div>
        ${isUnlink ? inf(2, 3) : inf(3, 3)}
        <div class="button-container-col wizard-step marginB25" data-expert data-stepid="0">
        <button id="${btnActionId}" type="button">${btnActionLabel}</button>
        </div>
        <div class="uniblocStep wizard-step" data-stepid="${isUnlink ? 3 : 4}">
        ${it('a', isUnlink ? 3 : 4, 1)}
        ${it('b', isUnlink ? 3 : 4, 2)}
        <div class="empty-state"><svg class="empty-icon"><use href=#svg-succes></use></svg></div>
        </div>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="expert-only-buttons" data-expert>
        <button type="button" line onclick="const o=this.closest('.inst-overlay'); confirmDiscardChanges(() => closeOverlay(o), null, criticalStepGuard(o));">${tr("BT_CANCEL_1")}</button>
        </div>
        <div class="button-container-overlay">
        <button id="btnWizStop" class="wizard-step" data-stepid="1" line type="button">${tr("BT_CANCEL_1")}</button>
        <button id="btnWizPrev" class="wizard-step" data-mstepid="${isUnlink ? '2,3' : '2,3,4'}" line type="button" onclick="ui.wizSetPrevStep(this.closest('.wizard'));">${tr("BT_GO_BACK")}</button>
        <button id="btnWizNext" class="wizard-step" data-mstepid="${isUnlink ? '1,2' : '1,2,3'}" type="button" onclick="ui.wizSetNextStep(this.closest('.wizard'));">${tr("BT_NEXT")}</button>
        <button id="${btnActionId}" class="wizard-step" data-stepid="${stepsCount}" type="button">${btnActionLabel}</button>
        </div>
        </div>`;

        const clearT = () => { if (this.btnTimer) { clearTimeout(this.btnTimer); this.btnTimer = null; } };

        div.querySelectorAll('#btnWizStop').forEach(btn => btn.onclick = () => confirmDiscardChanges(() => closeOverlay(div, clearT), null, criticalStepGuard(div)));

        const hP = div.querySelector('.instructions-header p');
        if (hP) hP.innerHTML += ' <span id="spanGroupName" class="groupNameSpan"></span>';

        div.querySelector('#btnOpenMemory').onclick = () => {
            const sId = isUnlink ? shadeId : ui.fromElement(div).shadeId;
            putJSONSync('/shadeCommand', { shadeId: sId, command: 'prog', repeat: 40 }, (err) => {
                if (err) ui.serviceError(err);
                else {
                    let prompt = ui.promptMessage(tr('PROMPT_CONFIRM_MOTOR_RESPONSE'), () => {
                        ui.wizSetNextStep(div);
                        closeOverlay(prompt);
                    });
                    // METHOD_2 accompagne obligatoirement METHOD_1 : la première propose d'ouvrir la mémoire
                    // avec sa propre télécommande, auquel cas le moteur ne réagit PAS à la commande envoyée
                    // par l'appareil -- il faut donc répondre NON, que le texte au-dessus présente comme
                    // "réessayez". Sans la seconde, on proposait un contournement sans dire comment le mener
                    // à terme, et l'assistant bouclait.
                    prompt.querySelector('.sub-message').innerHTML = isUnlink ?
                    `<hr><p>${tr("PROMPT_SHADE_MOVE_CONFIRM")}</p><p>${tr("UNLINK_GROUP_METHOD_1")}</p><p>${tr("UNLINK_GROUP_METHOD_2")}</p>` :
                    `<p>${tr("PROMPT_SHADE_MOVE_CONFIRM")}</p><p>${tr("LINK_GROUP_MEMORY_READY_FOR_GROUP")}</p>`;
                }
            });
        };
        // Deux exemplaires portent le même id (pied de page pour l'assistant, bloc data-expert pour
        // le mode expert) : on câble les deux, comme btnWizMarkSuc dans l'assistant d'appairage.
        const btnActions = div.querySelectorAll(`#${btnActionId}`);
        let fnRepeat = (err, o) => {
            clearT();
            if (!err && mouseDown) {
                if (o.cmd === 'Sensor') somfy.sendSetSensor(o);
                else if (o.groupId !== undefined) somfy.sendGroupRepeat(o.groupId, 'prog', null, fnRepeat);
                else somfy.sendCommandRepeat(o.shadeId, 'prog', null, fnRepeat);
            }
        };
        if (isUnlink) {
            const onUnlinkPress = () => {
                putJSONSync('/groupCommand', { groupId: groupId, command: 'prog', repeat: 1 }, (err) => {
                    if (err) ui.serviceError(err);
                    else {
                        let prompt = ui.promptMessage(tr('PROMPT_CONFIRM_MOTOR_RESPONSE'), () => {
                            putJSONSync('/unlinkFromGroup', { groupId: groupId, shadeId: shadeId }, (err, group) => {
                                somfy.setLinkedShadesList(group);
                                this.updateGroupList();
                            });
                            closeOverlay(prompt);
                            closeOverlay(div, clearT);
                        });
                        prompt.querySelector('.sub-message').innerHTML = `<hr><p>${tr("PROMPT_SHADE_MOVE_CONFIRM")}</p><p>${tr("PROMPT_SHADE_MOVE_DONE")}</p>`;
                    }
                });
            };
            btnActions.forEach(btn => btn.onclick = onUnlinkPress);
        } else {
            const onActionPress = () => {
                somfy.sendGroupCommand(groupId, 'prog', null, fnRepeat);
            };
            btnActions.forEach(btn => btn.addEventListener('mousedown', onActionPress));
            // preventDefault ici (pas sur mousedown) : évite le mousedown/mouseup synthétiques
            // que les navigateurs mobiles émettent après un touch, qui redéclencheraient tout le
            // flux (envoi + prompt de confirmation) une seconde fois pour un seul appui. Absent
            // jusqu'ici -- ce bouton n'avait aucun support tactile.
            btnActions.forEach(btn => btn.addEventListener('touchstart', (e) => { e.preventDefault(); onActionPress(); }));
            const onActionRelease = () => {
                let obj = ui.fromElement(div);
                let prompt = ui.promptMessage(tr('PROMPT_CONFIRM_MOTOR_RESPONSE'), () => {
                    putJSONSync('/linkToGroup', { groupId: groupId, shadeId: obj.shadeId }, (err, group) => {
                        somfy.setLinkedShadesList(group);
                        this.updateGroupList();
                    });
                    closeOverlay(prompt);
                    closeOverlay(div, clearT);
                });
                prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_SHADE_GROUP_LINK_CONFIRM")}</p><p>${tr("LINK_GROUP_LINK_DONE")}</p>`;
            };
            btnActions.forEach(btn => {
                btn.addEventListener('mouseup', onActionRelease);
                btn.addEventListener('touchend', onActionRelease);
            });
        }
        const urlInit = isUnlink ? `/group?groupId=${groupId}` : `/groupOptions?groupId=${groupId}`;
        getJSONSync(urlInit, (err, data) => {
            if (err) {
                ui.serviceError(err);
                return;
            }
            let canShow = false;
            const spanName = div.querySelector('#spanGroupName');

            if (isUnlink) {
                const shade = data.linkedShades.find(x => x.shadeId === shadeId);
                if (shade) {
                    if (spanName) spanName.textContent = data.name;
                    div.querySelectorAll('.divWizShadeName').forEach(el => el.textContent = shade.name);
                    canShow = true;
                } else {
                    ui.errorMessage(tr('ERR_DEVICE_NOT_FOUND_GROUP'));
                }
            } else {
                if (data.availShades && data.availShades.length > 0) {
                    if (spanName) spanName.textContent = data.name;
                    let selAvail = div.querySelector('#selAvailShades');
                    data.availShades.forEach(s => selAvail.options.add(new Option(s.name, s.shadeId)));
                    div.querySelectorAll('.divWizShadeName').forEach(el => el.textContent = data.availShades[0].name);
                    canShow = true;
                } else {
                    ui.errorMessage(tr('ERR_NO_DEVICE_AVAILABLE_GROUP'));
                }
            }
            if (canShow) {
                // "Ouvrir la mémoire" (btnOpenMemory) envoie déjà une commande radio "prog" au
                // volet/groupe à cette étape -- cf. criticalStepGuard(). Étape 3 en liaison, 2 en
                // déliaison (un flux à une étape de moins, cf. isUnlink plus haut).
                markCriticalStepReached(div, isUnlink ? 2 : 3);
                ui.wizSetStep(div, 1);
                shOverlay(div, clearT);
            }
        });
        return div;
    }
    linkGroupShade(groupId) { return this._gpWiz(groupId, false); }
    unlinkGroupShade(groupId, shadeId) { return this._gpWiz(groupId, true, shadeId); }

    // =========================================================================
    // SECTION : PROGRAMMATION HORAIRE (SCHEDULES)
    // =========================================================================


    updateScheduleList(cb) {
        getJSONSync('/schedules', (err, schedules) => {
            if (err) {
                logger.error('Failed to load schedules:', err);
                ui.serviceError(err);
            }
            else this.setScheduleList(schedules);
            if (typeof cb === 'function') cb();
        });
    }
    // Rendu des programmations rattachées à un volet/groupe précis, sous forme de cartes pleine
    // largeur (une par ligne), dans le bloc "Options" de son formulaire d'édition (voir
    // openAddScheduleInline/openEditScheduleInline). Cliquer la carte ouvre l'édition complète ;
    // l'icône poubelle supprime directement (confirmation via deleteSchedule) sans l'ouvrir.
    // Activé/désactivé (dimming de la carte) reste piloté depuis l'édition (switch de l'overlay) --
    // pas d'action rapide sur la carte elle-même.
    // Trie une liste de plannings par heure EFFECTIVE (minutes locales depuis minuit, décalage
    // solaire déjà appliqué), pas sur hour/minute bruts : une règle solaire n'a pas d'heure fixe
    // pertinente dans ces deux champs (reliquat non utilisé côté firmware, cf.
    // Schedule.cpp::checkSchedules) -- trier dessus mélangeait l'ordre affiché. Partagé par
    // renderScheduleBadges (bloc Options d'un volet/groupe) et setScheduleList (page Plannings).
    _sortSchedulesByEffectiveTime(list) {
        const geo = (typeof general !== 'undefined' && general._geoSettings) || {};
        const hasGeo = typeof geo.geoLat === 'number' && geo.geoLat >= -90 && geo.geoLat <= 90;
        const sunTimes = hasGeo ? computeSunUtcMinutes(geo.geoLat, geo.geoLon, new Date()) : null;
        const withEffective = list.map(sc => {
            let effectiveMinutes;
            if (sc.timeRef === 'sunrise' || sc.timeRef === 'sunset') {
                const baseUtc = sunTimes ? (sc.timeRef === 'sunrise' ? sunTimes.sunriseUtcMinutes : sunTimes.sunsetUtcMinutes) : null;
                const baseLocal = baseUtc !== null ? sunUtcMinutesToLocal(baseUtc) : null;
                effectiveMinutes = baseLocal !== null ? baseLocal + (sc.sunOffset || 0) : null;
            } else {
                effectiveMinutes = sc.hour * 60 + sc.minute;
            }
            return { sc, effectiveMinutes };
        });
        withEffective.sort((a, b) => (a.effectiveMinutes ?? 9999) - (b.effectiveMinutes ?? 9999));
        return withEffective;
    }
    // Construit le HTML d'une carte de planning (.schedule-card, cf. overlays.css). Partagé par
    // renderScheduleBadges (cible déjà connue/verrouillée : pas de badge cible, clic -> édition
    // inline sans changer la cible) et setScheduleList (page Plannings globale, cibles mélangées :
    // badge cible affiché, clic -> édition complète avec cible modifiable), via editFn/showTarget.
    _buildScheduleCardHtml(sc, effectiveMinutes, { showTarget, editFn }) {
        const { main: timeMain, ampm } = formatMinutesOfDay(effectiveMinutes);

        const actionText = this._scheduleActionText(sc);

        let triggerInfo;
        if (sc.timeRef === 'sunrise' || sc.timeRef === 'sunset') {
            const isRise = sc.timeRef === 'sunrise';
            const phaseLabel = tr(isRise ? 'SCHEDULE_TIME_REF_SUNRISE' : 'SCHEDULE_TIME_REF_SUNSET');
            const offset = sc.sunOffset || 0;
            const offsetSuffix = offset !== 0 ? ` (${offset > 0 ? '+' : ''}${offset}m)` : '';
            const iconHref = isRise ? '#indic-sun' : '#svg-night';
            triggerInfo = `<svg class="schedule-trigger-icon"><use href="${iconHref}"></use></svg>${phaseLabel}${offsetSuffix}`;
        } else {
            triggerInfo = tr('SCHEDULE_TIME_REF_CLOCK');
        }

        // Les jours restent toujours affichés (référence visuelle de la programmation). Le badge
        // d'action (Ouvrir/Fermer/MY/%) vit dans col-days-label, à la place de "Répéter (N)"
        // (retries) -- ça libère la ligne du titre pour le nom (et, page Plannings, le badge cible).
        const daysHtml = SCHEDULE_DAY_DEFS.map(d => {
            const active = (sc.dayMask & d.bit) !== 0;
            return `<span${active ? ' class="active"' : ''}>${tr(d.key).charAt(0)}</span>`;
        }).join('');
        const rowBottomHtml = `<div class="schedule-row-bottom">
        <div class="col-days-label"><span class="schedule-badge-action">${actionText}</span></div>
        <div class="col-days-list">${daysHtml}</div>
        </div>`;

        const title = (sc.name && sc.name.length > 0) ? sc.name : timeMain;
        const targetBadgeHtml = showTarget
            ? `<span class="schedule-badge-target">${this.scheduleTargetName(sc)}</span>`
            : '';

        return `<div class="schedule-card${sc.enabled ? '' : ' disabled'}" data-scheduleid="${sc.id}" onclick="somfy.${editFn}(${sc.id});">
        <div class="schedule-content-left">
        <div class="schedule-row-top">
        <div class="col-time">
        <span class="schedule-time">${timeMain}${ampm ? `<span class="ampm">${ampm}</span>` : ''}</span>
        </div>
        <div class="col-info">
        <div class="schedule-title-row">
        <div class="schedule-title">${title}</div>
        ${targetBadgeHtml}
        </div>
        <span class="schedule-trigger-info">${triggerInfo}</span>
        </div>
        </div>
        ${rowBottomHtml}
        </div>
        <div class="divEditDelete-svg" onclick="event.stopPropagation(); somfy.deleteSchedule(${sc.id});">
        <svg class="icon-svg" style="color: var(--color-danger);"><use href="#svg-trash"></use></svg>
        </div>
        </div>`;
    }
    // Texte d'action affiché pour un planning (badge de carte, résumé au survol de l'icône
    // horloge...) -- extrait de _buildScheduleCardHtml pour être partagé avec
    // _buildScheduleTooltipHtml. Mêmes raccourcis Ouvrir/Fermer que ScheduleOverlay.setQuickPos.
    _scheduleActionText(sc) {
        if (sc.positionMode === 'my') return 'MY';
        if (sc.positionMode === 'tiltonly') return `${sc.targetTilt}%`;
        if (sc.targetPos === 0) return tr('SCHEDULE_POS_OPEN');
        if (sc.targetPos === 100) return tr('SCHEDULE_POS_CLOSE');
        return `${sc.targetPos}%`;
    }
    // Résumé compact des plannings d'un volet/groupe (popover affiché au survol/tap de l'icône
    // horloge des cartes dashboard, cf. showScheduleIndicatorPopover) : heure, jours, position --
    // même tri/mêmes libellés que _buildScheduleCardHtml, mais en lecture seule (pas
    // d'édition/suppression depuis ce popover, qui doit rester un simple coup d'oeil).
    _buildScheduleTooltipHtml(targetType, targetId) {
        const titleHtml = `<div class="schedule-popover-title">${tr('SUBTAB_SCHEDULES')}</div>`;
        const list = (this.schedules || []).filter(sc => sc.targetType === targetType && sc.targetId === targetId);
        if (list.length === 0) {
            return `${titleHtml}<div class="schedule-popover-empty">${tr('EMPTY_SCHEDULE_TITLE')}</div>`;
        }
        const rowsHtml = this._sortSchedulesByEffectiveTime(list).map(({ sc, effectiveMinutes }) => {
            const { main: timeMain, ampm } = formatMinutesOfDay(effectiveMinutes);
            const daysHtml = SCHEDULE_DAY_DEFS.map(d => {
                const active = (sc.dayMask & d.bit) !== 0;
                return `<span${active ? ' class="active"' : ''}>${tr(d.key).charAt(0)}</span>`;
            }).join('');
            return `<div class="schedule-popover-row${sc.enabled ? '' : ' disabled'}">
            <span class="schedule-popover-time">${timeMain}${ampm ? `<span class="ampm">${ampm}</span>` : ''}${this._scheduleTriggerBadgeHtml(sc)}</span>
            <span class="schedule-popover-days">${daysHtml}</span>
            <span class="schedule-popover-pos">${this._scheduleActionText(sc)}</span>
            </div>`;
        }).join('');
        return `${titleHtml}${rowsHtml}`;
    }
    // Icône lever/coucher (#indic-sun/#svg-night) pour un planning déclenché au soleil -- imbriquée
    // dans .schedule-popover-time et positionnée en absolu (cf. CSS) plutôt qu'en enfant flex du
    // rang, pour ne jamais décaler le bloc des jours à droite qu'elle soit présente ou non. Vide
    // pour un déclenchement à heure fixe.
    _scheduleTriggerBadgeHtml(sc) {
        if (sc.timeRef !== 'sunrise' && sc.timeRef !== 'sunset') return '';
        const iconHref = sc.timeRef === 'sunrise' ? '#indic-sun' : '#svg-night';
        return `<svg class="schedule-popover-trigger-icon"><use href="${iconHref}"></use></svg>`;
    }
    // Un planning au moins cible ce volet/groupe ? Pilote l'atténuation (.no-schedule) de l'icône
    // horloge dans les cartes dashboard -- cf. _syncScheduleIndicators.
    _hasSchedulesFor(targetType, targetId) {
        return (this.schedules || []).some(sc => sc.targetType === targetType && sc.targetId === targetId);
    }
    // Met à jour l'atténuation des icônes horloge du dashboard (volets/groupes) sans reconstruire
    // les cartes. Appelé après tout (re)chargement des plannings (setScheduleList) ou des cartes
    // elles-mêmes (setShadesList/setGroupsList) : l'ordre entre ces chargements n'est pas garanti
    // au démarrage (cf. loadSomfy), donc chacun se resynchronise indépendamment plutôt que de
    // supposer que this.schedules est déjà peuplé.
    _syncScheduleIndicators() {
        document.querySelectorAll('.schedule-indicator').forEach(el => {
            const targetType = el.getAttribute('data-schedule-target');
            const targetId = parseInt(el.getAttribute('data-schedule-id'), 10);
            el.classList.toggle('no-schedule', !this._hasSchedulesFor(targetType, targetId));
        });
    }
    renderScheduleBadges(containerId, targetType, targetId) {
        const container = get(containerId);
        if (!container) return;

        // Quota GLOBAL (SOMFY_MAX_SCHEDULES côté firmware, partagé par tous les volets/groupes,
        // pas un quota par cible) : mis à jour à chaque rendu de ce bloc, y compris si CETTE
        // cible précise n'a elle-même aucun planning.
        const quotaSpan = get(containerId === 'divShadeScheduleBadges' ? 'spanScheduleSlotsShade' : 'spanScheduleSlotsGroup');
        if (quotaSpan) {
            const max = this.maxSchedules || 32;
            const remaining = Math.max(0, max - (this.schedules || []).length);
            quotaSpan.textContent = tr('SCHEDULE_SLOTS_REMAINING').replace('{n}', remaining);
        }

        const list = (this.schedules || []).filter(sc => sc.targetType === targetType && sc.targetId === targetId);
        if (list.length === 0) {
            container.innerHTML = `<span class="schedule-badge-empty">${tr('EMPTY_SCHEDULE_TITLE')}</span>`;
            return;
        }

        const withEffective = this._sortSchedulesByEffectiveTime(list);
        container.innerHTML = withEffective.map(({ sc, effectiveMinutes }) =>
            this._buildScheduleCardHtml(sc, effectiveMinutes, { showTarget: false, editFn: 'openEditScheduleInline' })
        ).join('');
    }
    // Après un ajout/édition/suppression de planning, remet à jour les badges du formulaire
    // Volet/Groupe actuellement ouvert (le cas échéant), qu'il s'agisse de l'ouverture normale
    // (liste des plannings) ou du flux à la volée depuis ce même formulaire.
    refreshOpenTargetScheduleBadges() {
        const shadeForm = get('somfyShade');
        if (shadeForm && shadeForm.style.display !== 'none') {
            const shadeId = parseInt(get('spanShadeId').innerText, 10);
            if (!isNaN(shadeId)) this.renderScheduleBadges('divShadeScheduleBadges', 'shade', shadeId);
        }
        const groupForm = get('somfyGroup');
        if (groupForm && groupForm.style.display !== 'none') {
            const groupId = parseInt(get('spanGroupId').innerText, 10);
            if (!isNaN(groupId)) this.renderScheduleBadges('divGroupScheduleBadges', 'group', groupId);
        }
    }
    scheduleTargetName(sc) {
        if (!sc) return '';
        if (sc.targetType === 'group') {
            const grp = (this.groups || []).find(x => x.groupId === sc.targetId);
            return grp ? grp.name : `${tr('SUBTAB_GROUPS')} #${sc.targetId}`;
        }
        const shd = (this.shades || []).find(x => x.shadeId === sc.targetId);
        return shd ? shd.name : `${tr('SUBTAB_DEVICES')} #${sc.targetId}`;
    }
    // Page Plannings globale (#schedules) : mêmes cartes que renderScheduleBadges (bloc Options
    // d'un volet/groupe), avec en plus un badge cible (showTarget) puisque cette liste mélange
    // toutes les cibles -- et une édition non verrouillée (openEditSchedule, cible modifiable).
    // Pas de drag & drop : la liste est simplement triée par heure effective.
    setScheduleList(schedules) {
        this.schedules = schedules || [];

        // Quota GLOBAL (SOMFY_MAX_SCHEDULES côté firmware, partagé par tous les volets/groupes) :
        // phrase complète dans le même emplacement que .dragtxt (texte d'aide au-dessus des listes
        // Volets/Groupes/Pièces) plutôt qu'un badge compact -- ce total-ci n'est pas rattaché à un
        // seul bouton "Ajouter" comme dans les formulaires volet/groupe (cf. spanScheduleSlots*),
        // donc une phrase autonome est plus claire ici. Bouton désactivé (même convention
        // button:disabled que partout ailleurs, cf. base.css) une fois le quota atteint, en plus du
        // garde-fou déjà en place dans _openEditSchedule.
        const max = this.maxSchedules || 32;
        const used = this.schedules.length;
        const quotaText = get('divScheduleQuotaText');
        if (quotaText) quotaText.textContent = tr('SCHEDULE_QUOTA_GLOBAL').replace('{n}', used).replace('{max}', max);
        const btnAdd = get('btnAddSchedule');
        if (btnAdd) btnAdd.disabled = used >= max;

        const withEffective = this._sortSchedulesByEffectiveTime(this.schedules);
        get('divScheduleList').innerHTML = withEffective.map(({ sc, effectiveMinutes }) =>
            this._buildScheduleCardHtml(sc, effectiveMinutes, { showTarget: true, editFn: 'openEditSchedule' })
        ).join('');

        const hasSchedules = this.schedules.length > 0;
        const empty = get('divScheduleEmptyState'), content = get('divScheduleListContent');
        if (empty) empty.style.display = hasSchedules ? 'none' : 'block';
        if (content) content.style.display = hasSchedules ? '' : 'none';

        this._syncScheduleIndicators();
    }
    populateScheduleTargetSelect(selectedType, selectedId) {
        const sel = get('selScheduleTarget');
        if (!sel) return;
        sel.innerHTML = '';

        const shadeGrp = document.createElement('optgroup');
        shadeGrp.setAttribute('label', tr('SUBTAB_DEVICES'));
        (this.shades || []).forEach(s => {
            const opt = document.createElement('option');
            opt.value = `shade:${s.shadeId}`;
            opt.text = s.name;
            shadeGrp.appendChild(opt);
        });
        if (shadeGrp.children.length > 0) sel.appendChild(shadeGrp);

        const groupGrp = document.createElement('optgroup');
        groupGrp.setAttribute('label', tr('SUBTAB_GROUPS'));
        (this.groups || []).forEach(grp => {
            const opt = document.createElement('option');
            opt.value = `group:${grp.groupId}`;
            opt.text = grp.name;
            groupGrp.appendChild(opt);
        });
        if (groupGrp.children.length > 0) sel.appendChild(groupGrp);

        if (selectedType && typeof selectedId !== 'undefined') sel.value = `${selectedType}:${selectedId}`;
    }
    // Ouverture "normale" depuis la page générale des Plannings : la cible reste librement
    // sélectionnable (aucun formulaire Volet/Groupe parent n'impose de contexte).
    openEditSchedule(scheduleId) { confirmDiscardChanges(() => this._openEditSchedule(scheduleId, undefined, false)); }
    // Ajout de planning à la volée depuis l'édition d'un volet/groupe (bouton + à côté du bloc
    // Pièce) : contourne volontairement confirmDiscardChanges, le formulaire d'origine reste ouvert
    // derrière et ses modifications ne doivent pas être remises en cause. La programmation est
    // pré-ciblée sur ce volet/groupe (sélecteur de cible verrouillé, cf. ScheduleOverlay) ;
    // contrairement à la pièce, il n'existe pas de champ planning dans le formulaire volet/groupe
    // à resélectionner après création (relation 1-N).
    openAddScheduleInline(targetType, targetId) {
        if (isNaN(targetId)) return;
        this._openEditSchedule(undefined, { targetType, targetId }, true);
    }
    // Édition d'un planning depuis un badge du bloc Options (volet/groupe potentiellement modifié) :
    // même logique que openAddScheduleInline (cible verrouillée, isDirty du parent préservé).
    openEditScheduleInline(scheduleId) {
        this._openEditSchedule(scheduleId, undefined, true);
    }
    _openEditSchedule(scheduleId, presetTarget, lockedTarget) {
        const isNew = typeof scheduleId === 'undefined';

        // this.maxSchedules vient de /controller (cf. loadSomfy) -- 32 en repli si ce chargement
        // n'a pas encore résolu, pour matcher SOMFY_MAX_SCHEDULES par défaut sans bloquer l'UI.
        if (isNew && this.schedules && this.schedules.length >= (this.maxSchedules || 32))
            return ui.errorMessage(get('divSomfySettings'), tr('ERR_SCHEDULE_LIMIT_REACHED'));

        if (isNew) {
            const targetType = (presetTarget && presetTarget.targetType) || 'shade';
            let targetId = presetTarget ? presetTarget.targetId : undefined;
            if (typeof targetId === 'undefined') {
                const firstShade = (this.shades && this.shades.length > 0) ? this.shades[0] : undefined;
                targetId = firstShade ? firstShade.shadeId : undefined;
            }
            this.ScheduleOverlay(undefined, {
                name: '', dayMask: 0, hour: 9, minute: 0,
                targetType, targetId, targetPos: 0, enabled: true, retries: 0
            }, lockedTarget);
        } else {
            getJSONSync(`/schedule?scheduleId=${scheduleId}`, (err, sc) => {
                if (err) return ui.serviceError(err);
                this.ScheduleOverlay(scheduleId, sc, lockedTarget);
            });
        }
    }
    // Détermine si un shadeType donné supporte la position "My" (voir noMyShadeTypes).
    shadeTypeSupportsMy(shadeType) {
        return !this.noMyShadeTypes.includes(shadeType);
    }

    ScheduleOverlay(scheduleId, scheduleData, lockedTarget) {
        if (get('divEditScheduleOverlay')) return;

        const isEdit = typeof scheduleId !== 'undefined';
        const titleKey = isEdit ? 'SCHEDULE_EDIT_TITLE' : 'SCHEDULE_CREATE_TITLE';
        const descKey = isEdit ? 'SCHEDULE_EDIT_DESC' : 'SCHEDULE_CREATE_DESC';
        const buttonText = isEdit ? tr('BT_SAVE') : tr('BT_CREATE');
        const iconHref = isEdit ? '#svg-save' : '#svg-add';

        let div = document.createElement('div');
        div.id = 'divEditScheduleOverlay';
        div.className = 'inst-overlay';
        div.setAttribute('data-scheduleid', isEdit ? scheduleId : '');
        // Toujours renseignés, y compris en mode "cible libre" (ce sont eux qui font foi tant que
        // l'utilisateur n'a pas changé la sélection) : sert de repli dans saveSchedule() quand le
        // sélecteur est verrouillé/absent, cf. lockedTarget ci-dessous.
        div.setAttribute('data-targettype', scheduleData.targetType || 'shade');
        div.setAttribute('data-targetid', scheduleData.targetId);

        const dayBtn = (bit, key) => `<button type="button" class="schedule-day-btn" data-bit="${bit}" onclick="this.classList.toggle('active'); this.dispatchEvent(new Event('change', {bubbles:true}));">${tr(key)}</button>`;

        // Normalise timeRef en une valeur exacte parmi les 3 options du sélecteur : toute valeur
        // absente/inconnue (nouveau planning) retombe sur "clock".
        const effectiveTimeRef = (scheduleData.timeRef === 'sunrise' || scheduleData.timeRef === 'sunset') ? scheduleData.timeRef : 'clock';

        // Sélecteur de cible libre (page générale des Plannings) vs. bloc verrouillé (ouvert depuis
        // l'édition d'un Volet/Groupe précis : la cible est déjà imposée par le formulaire parent).
        const targetBlock = lockedTarget ? `
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-indicShutter"></use></svg></div>
        <div class="unifield-content">
        <label class="label">${tr('SCHEDULE_TARGET')}</label>
        <div class="inputAndSelect schedule-target-locked">${this.scheduleTargetName(scheduleData)}</div>
        </div>
        </div>` : `
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-indicShutter"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selScheduleTarget">${tr('SCHEDULE_TARGET')}</label>
        <select id="selScheduleTarget" class="inputAndSelect"></select>
        </div>
        </div>`;

        div.innerHTML = `
        <div class="instructions-content">
        ${overlayHeader(titleKey, descKey, 'svg-schedule', { subtitle: descKey })}
        <div class="overlay-scroll-content">
        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('GENERAL_INFO')}</h3>
        <div class="uniblocRow">
        <div class="uniRow dirty-target">
        <div class="unifield-content">
        <label class="label" for="fldScheduleName">${tr('NAME')}</label>
        <input id="fldScheduleName" class="inputAndSelect" name="scheduleName" type="text" length="20" placeholder="">
        </div>
        </div>
        ${targetBlock}
        </div>
        </div>
        <div class="unibloc-container">
        <div class="schedule-days-header">
        <h3 class="unibloc-title">${tr('SCHEDULE_DAYS')}</h3>
        <button type="button" id="btnScheduleAllDays" class="schedule-alldays-btn">${tr('BT_SELECT_ALL_DAYS')}</button>
        </div>
        <div id="divScheduleDayPicker" class="schedule-day-picker">
        ${dayBtn(2, 'SCHEDULE_MON')}${dayBtn(4, 'SCHEDULE_TUE')}${dayBtn(8, 'SCHEDULE_WED')}${dayBtn(16, 'SCHEDULE_THU')}${dayBtn(32, 'SCHEDULE_FRI')}${dayBtn(64, 'SCHEDULE_SAT')}${dayBtn(1, 'SCHEDULE_SUN')}
        </div>
        </div>
        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('SCHEDULE_TIME')}</h3>

        <!-- Un unique sélecteur à 3 options (Heure fixe / Lever / Coucher) remplace les deux
        SwitchBig-2 en cascade d'origine (étape 1 Heure fixe-Soleil, étape 2 Levé-Couché) : plus
        lisible et allège le code (une seule source de vérité pour timeRef, plus de synchronisation
        entre deux groupes de radios). -->
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-schedule"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selScheduleTimeRef">${tr('SCHEDULE_TIME_REF')}</label>
        <select id="selScheduleTimeRef" class="inputAndSelect">
        <option value="clock" ${effectiveTimeRef === 'clock' ? 'selected' : ''}>${tr('SCHEDULE_TIME_REF_CLOCK')}</option>
        <option value="sunrise" ${effectiveTimeRef === 'sunrise' ? 'selected' : ''}>${tr('SCHEDULE_TIME_REF_OPT_SUNRISE')}</option>
        <option value="sunset" ${effectiveTimeRef === 'sunset' ? 'selected' : ''}>${tr('SCHEDULE_TIME_REF_OPT_SUNSET')}</option>
        </select>
        </div>
        </div>

        <div id="divScheduleClockTime" class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-schedule"></use></svg></div>
        <div class="unifield-content">
        <input id="fldScheduleTime" class="inputAndSelect" type="time">
        </div>
        </div>

        <div id="divScheduleSunBlock" style="display:none;">

        <div id="divScheduleSunTimeInfo" class="schedule-sun-time-info"></div>

        <label class="uniRow dirty-target" for="cbScheduleSunOffsetEnabled">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-sun"></use></svg></div>
        <div class="uniText"><div class="uniLabel">${tr('SCHEDULE_SUN_OFFSET_ENABLE')}</div></div>
        </div>
        <div class="uniRight">
        <span class="switch">
        <input id="cbScheduleSunOffsetEnabled" type="checkbox">
        <div></div>
        </span>
        </div>
        </label>

        <div id="divScheduleSunOffsetBlock" class="dirty-target" style="display:none;">
        <label class="label" for="inputScheduleSunOffset">${tr('SCHEDULE_SUN_OFFSET')}</label>
        <div class="schedule-sun-offset-row">
        <div class="slider-wrapper schedule-sun-offset-slider">
        <div class="slider-progress"><div class="slider-thumb-line"></div></div>
        <input id="slidScheduleSunOffset" class="md3-range-input" type="range" min="-720" max="720" step="1" value="0">
        </div>
        <input id="inputScheduleSunOffset" class="schedule-sun-offset-number" type="number" min="-720" max="720" step="1" value="0">
        </div>
        <div id="divScheduleSunOffsetSummary" class="uniStatus"></div>
        </div>

        </div>
        </div>
        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('SHADE_POSITION')}</h3>
        <div class="schedule-position-quick">
        <button type="button" id="btnSchedulePosOpen" class="schedule-quickpos-btn"><svg><use href="#svg-up"></use></svg></button>
        <button type="button" id="btnSchedulePosClose" class="schedule-quickpos-btn"><svg><use href="#svg-down"></use></svg></button>
        <button type="button" id="btnSchedulePosTiltOnly" class="schedule-quickpos-btn" style="display:none;">${tr('SCHEDULE_POS_TILT_ONLY')}</button>
        <button type="button" id="btnSchedulePosMy" class="schedule-quickpos-btn"><svg><use href="#svg-my"></use></svg></button>
        </div>
        <div id="divScheduleMyGroupNote" class="uniStatus schedule-my-note" style="display:none;"></div>
        <input type="hidden" id="fldSchedulePositionMode" value="position">
        <div id="divScheduleSliderGroup" class="slider-group">
        <div class="slider-header"><span class="title">${tr('SETMYPOS_TARGET_POS')}</span><span class="val"><span id="spanScheduleTargetPos">0</span> %</span></div>
        <div class="slider-wrapper">
        <div class="slider-progress"><div class="slider-thumb-line"></div></div>
        <input id="slidScheduleTargetPos" class="md3-range-input" type="range" min="0" max="100" step="1" value="0" oninput="syncSliderProgress(this); get('spanScheduleTargetPos').innerText = this.value;">
        </div>
        </div>
        <div id="divScheduleTiltSliderGroup" class="slider-group" style="display:none;">
        <div class="slider-header"><span class="title">${tr('SETMYPOS_TARGET_TILT_POS')}</span><span class="val"><span id="spanScheduleTargetTilt">0</span> %</span></div>
        <div class="slider-wrapper">
        <div class="slider-progress"><div class="slider-thumb-line"></div></div>
        <input id="slidScheduleTargetTilt" class="md3-range-input" type="range" min="0" max="100" step="1" value="0" oninput="syncSliderProgress(this); get('spanScheduleTargetTilt').innerText = this.value;">
        </div>
        </div>
        </div>
        <div class="unibloc-container">
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-repeat"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selScheduleRetries">${tr('SCHEDULE_RETRIES')}</label>
        <select id="selScheduleRetries" class="inputAndSelect">
        <option value="0">${tr('OPT_NO_REPEAT')}</option>
        <option value="1">${tr('OPT_1TIME')}</option>
        <option value="2">${tr('OPT_2TIME')}</option>
        <option value="3">${tr('OPT_3TIME')}</option>
        <option value="4">${tr('OPT_4TIME')}</option>
        <option value="5">${tr('OPT_5TIME')}</option>
        <option value="6">${tr('OPT_6TIME')}</option>
        <option value="7">${tr('OPT_7TIME')}</option>
        <option value="8">${tr('OPT_8TIME')}</option>
        <option value="9">${tr('OPT_9TIME')}</option>
        <option value="10">${tr('OPT_10TIME')}</option>
        </select>
        </div>
        </div>
        <div class="uniStatus schedule-retries-desc">${tr('SCHEDULE_RETRIES_DESC')}</div>
        </div>
        <div class="unibloc-container">
        <label class="uniRow dirty-target" for="cbScheduleEnabled">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-schedule"></use></svg></div>
        <div class="uniText"><div class="uniLabel">${tr('SCHEDULE_ENABLED')}</div></div>
        </div>
        <div class="uniRight">
        <span class="switch">
        <input id="cbScheduleEnabled" type="checkbox" checked/>
        <div></div>
        </span>
        </div>
        </label>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay">
        <button id="btnScheduleGoBack" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnSaveSchedule" type="button">
        <svg><use id="useSaveScheduleIcon" href="${iconHref}"></use></svg>
        <span id="btnSaveScheduleText">${buttonText}</span>
        </button>
        </div>
        </div>`;

        shOverlay(div);

        if (!lockedTarget) this.populateScheduleTargetSelect(scheduleData.targetType, scheduleData.targetId);
        div.querySelector('#fldScheduleName').value = scheduleData.name || '';

        div.querySelectorAll('.schedule-day-btn').forEach(btn => {
            const bit = parseInt(btn.getAttribute('data-bit'), 10);
            btn.classList.toggle('active', ((scheduleData.dayMask || 0) & bit) !== 0);
        });

        const hh = (scheduleData.hour || 0).toString().padStart(2, '0');
        const mm = (scheduleData.minute || 0).toString().padStart(2, '0');
        div.querySelector('#fldScheduleTime').value = `${hh}:${mm}`;

        // Bloc "Heure de déclenchement" : Étape 1 (Heure fixe/Soleil) affiche l'étape 2 (Levé/Couché)
        // + l'aperçu de l'heure solaire du jour ; le décalage (slider + champ nombre synchronisés)
        // n'apparaît que si l'utilisateur l'active explicitement, avec une phrase récapitulative.
        const clockRow = div.querySelector('#divScheduleClockTime');
        const sunBlock = div.querySelector('#divScheduleSunBlock');
        const sunTimeInfo = div.querySelector('#divScheduleSunTimeInfo');
        const offsetToggle = div.querySelector('#cbScheduleSunOffsetEnabled');
        const offsetBlock = div.querySelector('#divScheduleSunOffsetBlock');
        const offsetSlider = div.querySelector('#slidScheduleSunOffset');
        const offsetNumber = div.querySelector('#inputScheduleSunOffset');
        const offsetSummary = div.querySelector('#divScheduleSunOffsetSummary');

        const initialOffset = (typeof scheduleData.sunOffset === 'number') ? scheduleData.sunOffset : 0;
        offsetSlider.value = initialOffset;
        offsetNumber.value = initialOffset;
        offsetToggle.checked = initialOffset !== 0;
        syncSliderProgress(offsetSlider);

        // geoLat=99 = position non configurée côté firmware (cf. ConfigSettings.h) ; general._geoSettings
        // est peuplé par general.loadGeneral() au démarrage de l'appli (cf. class General).
        const geo = (typeof general !== 'undefined' && general._geoSettings) || {};
        const hasGeo = typeof geo.geoLat === 'number' && geo.geoLat >= -90 && geo.geoLat <= 90;
        const sunTimes = hasGeo ? computeSunUtcMinutes(geo.geoLat, geo.geoLon, new Date()) : null;

        const timeRefSelect = div.querySelector('#selScheduleTimeRef');
        const currentPhase = () => timeRefSelect.value === 'sunset' ? 'sunset' : 'sunrise';

        const updateSunTimeInfo = () => {
            if (!hasGeo) {
                sunTimeInfo.textContent = tr('SCHEDULE_SUN_NOT_CONFIGURED');
            } else if (!sunTimes) {
                sunTimeInfo.textContent = tr('SCHEDULE_SUN_NO_EVENT_TODAY');
            } else {
                const isRise = currentPhase() === 'sunrise';
                const utcMinutes = isRise ? sunTimes.sunriseUtcMinutes : sunTimes.sunsetUtcMinutes;
                const key = isRise ? 'SCHEDULE_SUN_TIME_SUNRISE_TODAY' : 'SCHEDULE_SUN_TIME_SUNSET_TODAY';
                sunTimeInfo.textContent = tr(key).replace('{time}', formatSunTime(utcMinutes));
            }
        };

        const updateOffsetSummary = () => {
            if (!sunTimes) { offsetSummary.textContent = ''; return; }
            const isRise = currentPhase() === 'sunrise';
            const phaseNoun = tr(isRise ? 'SCHEDULE_SUN_PHASE_SUNRISE_NOUN' : 'SCHEDULE_SUN_PHASE_SUNSET_NOUN');
            const baseUtc = isRise ? sunTimes.sunriseUtcMinutes : sunTimes.sunsetUtcMinutes;
            const minutes = parseInt(offsetNumber.value, 10) || 0;
            const resultTime = formatSunTime(baseUtc + minutes);

            let key = 'SCHEDULE_SUN_OFFSET_SUMMARY_NONE';
            if (minutes > 0) key = 'SCHEDULE_SUN_OFFSET_SUMMARY_AFTER';
            else if (minutes < 0) key = 'SCHEDULE_SUN_OFFSET_SUMMARY_BEFORE';

            offsetSummary.textContent = tr(key)
                .replace('{minutes}', Math.abs(minutes))
                .replace('{phase}', phaseNoun)
                .replace('{time}', resultTime);
        };

        const syncModeUI = () => {
            const isClock = timeRefSelect.value === 'clock';
            clockRow.style.display = isClock ? '' : 'none';
            sunBlock.style.display = isClock ? 'none' : '';
            if (!isClock) { updateSunTimeInfo(); updateOffsetSummary(); }
        };

        const syncOffsetUI = () => {
            offsetBlock.style.display = offsetToggle.checked ? '' : 'none';
            if (!offsetToggle.checked) {
                offsetNumber.value = 0;
                offsetSlider.value = 0;
                syncSliderProgress(offsetSlider);
            }
            updateOffsetSummary();
        };

        syncModeUI();
        syncOffsetUI();

        timeRefSelect.addEventListener('change', syncModeUI);
        offsetToggle.addEventListener('change', syncOffsetUI);
        offsetSlider.addEventListener('input', () => {
            offsetNumber.value = offsetSlider.value;
            syncSliderProgress(offsetSlider);
            updateOffsetSummary();
        });
        offsetNumber.addEventListener('input', () => {
            let v = parseInt(offsetNumber.value, 10);
            if (isNaN(v)) return;
            v = Math.min(720, Math.max(-720, v));
            offsetSlider.value = v;
            syncSliderProgress(offsetSlider);
            updateOffsetSummary();
        });

        div.querySelector('#slidScheduleTargetPos').value = scheduleData.targetPos || 0;
        div.querySelector('#spanScheduleTargetPos').innerText = scheduleData.targetPos || 0;
        syncSliderProgress(div.querySelector('#slidScheduleTargetPos'));

        const initialTilt = (typeof scheduleData.targetTilt !== 'undefined' && scheduleData.targetTilt >= 0) ? scheduleData.targetTilt : 0;
        div.querySelector('#slidScheduleTargetTilt').value = initialTilt;
        div.querySelector('#spanScheduleTargetTilt').innerText = initialTilt;
        syncSliderProgress(div.querySelector('#slidScheduleTargetTilt'));

        div.querySelector('#cbScheduleEnabled').checked = (typeof scheduleData.enabled === 'undefined') ? true : makeBool(scheduleData.enabled);
        div.querySelector('#selScheduleRetries').value = scheduleData.retries || 0;

        // Trois modes d'action, mutuellement exclusifs : Position (& Tilt le cas échéant), Tilt seul
        // (ajuste uniquement l'inclinaison, hauteur inchangée -- utile pour un store vénitien/BSO
        // qu'on veut juste réorienter en cours de journée) et MY (vraie commande RTS "My", reste à
        // jour si l'utilisateur redéfinit sa position favorite plus tard). "Tilt seul" et le slider
        // Tilt en mode Position ne sont proposés que si la cible gère réellement l'inclinaison (cf.
        // updateModeAvailability) ; mémorisé ici pour que setPositionMode puisse le consulter sans
        // redupliquer le calcul.
        let targetSupportsTilt = false;
        const updateSliderVisibility = () => {
            const mode = div.querySelector('#fldSchedulePositionMode').value;
            div.querySelector('#divScheduleSliderGroup').style.display = (mode === 'position') ? '' : 'none';
            div.querySelector('#divScheduleTiltSliderGroup').style.display =
                (mode === 'tiltonly' || (mode === 'position' && targetSupportsTilt)) ? '' : 'none';
        };
        const setPositionMode = (mode, markDirty) => {
            const hidden = div.querySelector('#fldSchedulePositionMode');
            hidden.value = mode;
            div.querySelector('#btnSchedulePosMy').classList.toggle('active', mode === 'my');
            div.querySelector('#btnSchedulePosTiltOnly').classList.toggle('active', mode === 'tiltonly');
            updateSliderVisibility();
            updateIncompatibilityNote();
            if (markDirty) hidden.dispatchEvent(new Event('change', { bubbles: true }));
        };

        // Note d'incompatibilité sous les boutons d'action : son texte dépend du mode actuellement
        // sélectionné (les équipements du groupe qui ignoreront MY ne sont pas les mêmes que ceux qui
        // ignoreront Tilt seul).
        let groupMyIncompatible = false, groupTiltIncompatible = false;
        const updateIncompatibilityNote = () => {
            const mode = div.querySelector('#fldSchedulePositionMode').value;
            const note = div.querySelector('#divScheduleMyGroupNote');
            if (mode === 'my' && groupMyIncompatible) {
                note.innerText = tr('SCHEDULE_MY_GROUP_NOTE');
                note.style.display = '';
            } else if (mode === 'tiltonly' && groupTiltIncompatible) {
                note.innerText = tr('SCHEDULE_TILT_GROUP_NOTE');
                note.style.display = '';
            } else {
                note.style.display = 'none';
            }
        };

        setPositionMode(scheduleData.positionMode === 'my' ? 'my' : scheduleData.positionMode === 'tiltonly' ? 'tiltonly' : 'position', false);

        // Audit shadeType : le bouton MY n'a de sens que pour un équipement capable de mémoriser une
        // position (cf. noMyShadeTypes), et Tilt seul/le slider Tilt uniquement pour un équipement
        // gérant l'inclinaison (tiltType). Pour un groupe, les deux restent accessibles dès qu'AU
        // MOINS un membre est compatible, avec une note si certains ne le sont pas. Réévalué à chaque
        // changement de cible (sélecteur libre uniquement -- en mode verrouillé la cible ne change
        // jamais après ouverture).
        const updateModeAvailability = (targetType, targetId) => {
            const myBtn = div.querySelector('#btnSchedulePosMy');
            const tiltOnlyBtn = div.querySelector('#btnSchedulePosTiltOnly');
            let supportsMy = true;
            groupMyIncompatible = false;
            groupTiltIncompatible = false;
            if (targetType === 'group') {
                const group = (this.groups || []).find(g => g.groupId === targetId);
                const linked = (group && group.linkedShades) || [];
                groupMyIncompatible = linked.some(s => this.noMyShadeTypes.includes(s.shadeType));
                targetSupportsTilt = linked.some(ls => {
                    const full = (this.shades || []).find(s => s.shadeId === ls.shadeId);
                    return full && full.tiltType > 0;
                });
                groupTiltIncompatible = targetSupportsTilt && linked.some(ls => {
                    const full = (this.shades || []).find(s => s.shadeId === ls.shadeId);
                    return !full || !(full.tiltType > 0);
                });
            } else {
                let shadeType, tiltType;
                if (lockedTarget) {
                    // Ouvert depuis editShade : ce formulaire est forcément affiché derrière cet
                    // overlay (lui seul peut avoir ouvert cette programmation). On lit ses valeurs
                    // EN DIRECT plutôt que le cache somfy.shades, qui ne sera à jour qu'après un
                    // "Enregistrer" explicite -- sans ça, choisir un type Store Vénitien (ou changer
                    // le type d'un volet existant) puis ajouter aussitôt une programmation sans
                    // sauvegarder d'abord masquerait à tort "Inclinaison seule".
                    const typeEl = get('selShadeType');
                    if (typeEl) {
                        shadeType = parseInt(typeEl.value, 10);
                        const st = this.shadeTypes.find(x => x.type === shadeType);
                        const tiltEl = get('selTiltType');
                        tiltType = (st && st.tilt && tiltEl) ? parseInt(tiltEl.value, 10) : 0;
                    }
                }
                if (typeof shadeType === 'undefined') {
                    const shade = (this.shades || []).find(s => s.shadeId === targetId);
                    shadeType = shade ? shade.shadeType : undefined;
                    tiltType = shade ? shade.tiltType : 0;
                }
                supportsMy = (typeof shadeType === 'undefined') ? true : this.shadeTypeSupportsMy(shadeType);
                targetSupportsTilt = !!(tiltType > 0);
            }
            myBtn.style.display = supportsMy ? '' : 'none';
            myBtn.disabled = !supportsMy;
            tiltOnlyBtn.style.display = targetSupportsTilt ? '' : 'none';
            tiltOnlyBtn.disabled = !targetSupportsTilt;
            const currentMode = div.querySelector('#fldSchedulePositionMode').value;
            if ((!supportsMy && currentMode === 'my') || (!targetSupportsTilt && currentMode === 'tiltonly')) {
                // La nouvelle cible ne supporte plus le mode actif : on revient sur une position simple.
                setPositionMode('position', true);
                div.querySelector('#slidScheduleTargetPos').value = 0;
                div.querySelector('#spanScheduleTargetPos').innerText = 0;
                syncSliderProgress(div.querySelector('#slidScheduleTargetPos'));
            } else {
                updateSliderVisibility();
                updateIncompatibilityNote();
            }
        };
        updateModeAvailability(scheduleData.targetType, scheduleData.targetId);
        if (!lockedTarget) {
            div.querySelector('#selScheduleTarget').addEventListener('change', (e) => {
                const [tType, tIdStr] = (e.target.value || '').split(':');
                updateModeAvailability(tType, parseInt(tIdStr, 10));
            });
        }

        watchDirty(div);

        // Raccourci "Tous les jours" : bascule les 7 jours ensemble (tout cocher / tout décocher
        // selon l'état actuel), en redéclenchant un `change` par bouton pour le suivi isDirty.
        div.querySelector('#btnScheduleAllDays').onclick = () => {
            const dayBtns = div.querySelectorAll('.schedule-day-btn');
            const allActive = Array.from(dayBtns).every(b => b.classList.contains('active'));
            dayBtns.forEach(b => {
                b.classList.toggle('active', !allActive);
                b.dispatchEvent(new Event('change', { bubbles: true }));
            });
        };
        // Raccourcis Ouvrir/Fermer : repassent en mode Position et placent le slider à 0%/100%
        // (convention de l'appli : 0% = volet ouvert, 100% = volet fermé, cf. SomfyShade::moveToTarget).
        const setQuickPos = (val) => {
            setPositionMode('position', true);
            const slider = div.querySelector('#slidScheduleTargetPos');
            slider.value = val;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        };
        div.querySelector('#btnSchedulePosOpen').onclick = () => setQuickPos(0);
        div.querySelector('#btnSchedulePosClose').onclick = () => setQuickPos(100);
        div.querySelector('#btnSchedulePosTiltOnly').onclick = () => setPositionMode('tiltonly', true);
        div.querySelector('#btnSchedulePosMy').onclick = () => setPositionMode('my', true);

        div.querySelector('#btnScheduleGoBack').onclick = () => confirmDiscardChanges(() => closeOverlay(div));
        div.querySelector('#btnSaveSchedule').onclick = () => this.saveSchedule(div);
    }
    saveSchedule(overlayEl) {
        if (!overlayEl) overlayEl = get('divEditScheduleOverlay');
        if (!overlayEl) return;

        const scheduleIdAttr = overlayEl.getAttribute('data-scheduleid');
        const isNew = !scheduleIdAttr;

        let dayMask = 0;
        overlayEl.querySelectorAll('.schedule-day-btn.active').forEach(btn => {
            dayMask |= parseInt(btn.getAttribute('data-bit'), 10);
        });

        // Cible verrouillée (ouvert depuis un Volet/Groupe) : pas de sélecteur, on retombe sur les
        // data-attributes posés à la construction de l'overlay (cf. ScheduleOverlay).
        const targetSel = overlayEl.querySelector('#selScheduleTarget');
        let targetType, targetId;
        if (targetSel) {
            const targetVal = targetSel.value || '';
            [targetType, targetId] = targetVal.split(':');
            targetId = parseInt(targetId, 10);
        } else {
            targetType = overlayEl.getAttribute('data-targettype');
            targetId = parseInt(overlayEl.getAttribute('data-targetid'), 10);
        }

        const timeVal = overlayEl.querySelector('#fldScheduleTime').value || '00:00';
        const [hourStr, minuteStr] = timeVal.split(':');

        // -1 = non applicable (cf. Schedule.h) : cible sans tilt, ou slider masqué (mode MY, où la
        // commande gère sa propre inclinaison mémorisée) -- on n'envoie une valeur que si le slider
        // Tilt était réellement visible/pertinent au moment de la sauvegarde.
        const tiltGroup = overlayEl.querySelector('#divScheduleTiltSliderGroup');
        const targetTilt = (tiltGroup && tiltGroup.style.display !== 'none')
            ? parseInt(overlayEl.querySelector('#slidScheduleTargetTilt').value, 10)
            : -1;

        const obj = {
            name: overlayEl.querySelector('#fldScheduleName').value || '',
            dayMask: dayMask,
            hour: parseInt(hourStr, 10),
            minute: parseInt(minuteStr, 10),
            targetType: targetType,
            targetId: targetId,
            targetPos: parseInt(overlayEl.querySelector('#slidScheduleTargetPos').value, 10),
            targetTilt: targetTilt,
            positionMode: overlayEl.querySelector('#fldSchedulePositionMode').value || 'position',
            enabled: overlayEl.querySelector('#cbScheduleEnabled').checked,
            retries: parseInt(overlayEl.querySelector('#selScheduleRetries').value, 10),
            timeRef: overlayEl.querySelector('#selScheduleTimeRef')?.value || 'clock',
            sunOffset: overlayEl.querySelector('#cbScheduleSunOffsetEnabled').checked
                ? (parseInt(overlayEl.querySelector('#inputScheduleSunOffset').value, 10) || 0)
                : 0
        };

        const checks = [
            [dayMask === 0, 'ERR_SCHEDULE_NO_DAYS'],
            [!targetType || isNaN(targetId), 'ERR_SCHEDULE_NO_TARGET']
        ];
        const error = checks.find(c => c[0]);
        if (error) return ui.errorMessage(tr(error[1]));

        if (!isNew) obj.id = parseInt(scheduleIdAttr, 10);

        putJSONSync(isNew ? '/addSchedule' : '/saveSchedule', obj, (err, sc) => {
            if (err) return ui.serviceError(err);
            logger.debug('Schedule saved:', sc);
            ui.successMessage(tr(isNew ? 'MSG_ADD_SUCCESS' : 'MSG_SAVE_SUCCESS'));
            clearDirty(overlayEl);
            this.updateScheduleList(() => this.refreshOpenTargetScheduleBadges());
            closeOverlay(overlayEl);
        });
    }
    deleteSchedule(scheduleId) {
        const sc = (this.schedules || []).find(x => x.id === scheduleId);
        const desc = sc ? `${sc.hour.toString().padStart(2, '0')}:${sc.minute.toString().padStart(2, '0')} - ${this.scheduleTargetName(sc)}` : '';
        let prompt = ui.promptMessage(tr('PROMPT_DELETE_SCHEDULE'), () => {
            putJSONSync('/deleteSchedule', { id: scheduleId }, (err) => {
                if (err) ui.serviceError(err);
                this.updateScheduleList(() => this.refreshOpenTargetScheduleBadges());
                prompt.remove();
            });
        });
        const subMsg = prompt.querySelector('.sub-message');
        if (subMsg) subMsg.innerHTML = `<p>${tr('PROMPT_DELETE_SCHEDULE_CONFIRM').replace('{SCHEDULE_DESC}', desc)}</p>`;
    }

    // =========================================================================
    // SECTION : GESTION DES RÉPÉTEURS (REPEATERS)
    // =========================================================================


    setRepeaterList(addresses) {
        let divCfg = '';
        if (typeof addresses !== 'undefined') {
            for (let i = 0; i < addresses.length; i++) {
                // Même langage visuel que les cartes volet/groupe/pièce (badge .shade-icon-wrapper,
                // poubelle ghost isolée par event.stopPropagation()), mais sans poignée de drag (pas
                // de réordonnancement) ni cursor:pointer sur la carte (pas d'édition au clic --
                // seule la suppression est possible ici).
                divCfg += `<div class="somfyRepeater" data-address="${addresses[i]}"><div class="shade-icon-wrapper"><svg><use href="#svg-emptyRepeater"></use></svg></div><div class="repeater-name-block"><div class="name-text">${tr("REPEATER_ADDRESS")}</div><div class="cfg-room">${addresses[i]}</div></div><div class="divEditDelete-svg" onclick="event.stopPropagation(); somfy.unlinkRepeater('${addresses[i]}');"><svg class="icon-svg" style="color: var(--color-danger);"><use href=#svg-trash></use></svg></div></div>`;
            }
        }
        get('divRepeatList').innerHTML = divCfg;
        this.checkEmptyState();
    }


    updateRepeatList() {
        getJSONSync('/repeaters', (err, repeaters) => {
            if (err) {
                logger.error('Failed to load repeaters:', err);
                ui.serviceError(err);
            }
            else this.setRepeaterList(repeaters);
        });
    }
    linkRepeatRemote() {
        let div = document.createElement('div');
        div.className = 'inst-overlay';
        div.id = 'divLinkRepeater';
        div.setAttribute('data-type', 'link-repeatremote');

        div.innerHTML = `
        <div class="instructions-content">
        ${overlayHeader("REPEAT_REMOTE_TITLE", "REPEAT_REMOTE_DESC", "svg-repeater")}
        <div class="overlay-scroll-content">

        <div class="uniblocStep">
        <div class="step-item"><div class="step-number">a</div><div class="step-text">${tr("REPEAT_REMOTE_DESC_1")}</div></div>
        <div class="step-item"><div class="step-number">b</div><div class="step-text">${tr("REPEAT_REMOTE_DESC_2")}</div></div>
        <div class="step-item"><div class="step-number">c</div><div class="step-text">${tr("REPEAT_REMOTE_DESC_5")}</div></div>
        </div>

        <div class="warning">
        <div class="warning-header">
        <svg><use href="#svg-warning"></use></svg>
        <b>${tr("MSG_ALERT")}</b>
        </div>

        <div class="information-text">
        <span>${tr("REPEAT_REMOTE_DESC_4")}<br><br>${tr("REPEAT_REMOTE_DESC_3")}</span>
        </div>
        </div>

        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay">
        <button id="btnStopLinking" type="button" line>${tr("BT_CANCEL_1")}</button>
        </div>
        </div>`;

        div.querySelector('#btnStopLinking').onclick = () => requestCloseOverlay(div);
        shOverlay(div);

        // En écoute dès l'ouverture et pendant toute sa durée de vie (jusqu'à réception d'une
        // trame ou fermeture manuelle) -- cf. _handleLinkFrame() : rien à arrêter côté firmware à
        // la fermeture (pas de commande /endXxx dédiée), donc pas de onConfirm nécessaire ici.
        setOverlayLock(div, 'confirm', {
            titleKey: 'PROMPT_LINK_REPEATER_TITLE',
            msgKey: 'PROMPT_LINK_REPEATER_MSG',
        });

        return div;
    }

    unlinkRepeater(address) {
        let prompt = ui.promptMessage(tr('PROMPT_UNLINK_REPEATER'), () => {
            putJSONSync('/unlinkRepeater', { address: address }, (err, repeaters) => {
                if (err) ui.serviceError(err);
                else this.setRepeaterList(repeaters);
                prompt.remove();
            });
        });
    }

}
var somfy = new Somfy();
