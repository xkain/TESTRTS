// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
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
    frameLimit = 300;
    frameCount = 0;
    frameBaseSeq = 0;
    frameFilter = '';
    frameValidOnly = false;
    frameLogPaused = false;
    frameLogStale = false;
    frameLogBound = false;
    frameLogVisible = false;
    frameStamps = [];
    frameRateTimer = null;
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
    // le badge d'icône compact des cartes de la liste équipements (setShadesList) -- distinct de `ico`
    // (icône détaillée, réutilisée telle quelle par la carte dashboard/somfyShadeCtl). Les variantes
    // gauche/centre/droite d'une même famille (Drapery, Gate) partagent un seul indicateur.
    shadeTypes = [
        { type: 0, name: 'Roller Shade', ico: 'svg-window-shade', indic: 'svg-indicRoller', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 1, name: 'Blind', ico: 'svg-window-blind', indic: 'svg-indicblind', lift: true, tilt: true, sun: true, fcmd: true, fpos: true },
        { type: 2, name: 'Drapery (left)', ico: 'svg-ldrapery', indic: 'svg-indicDrapery', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 3, name: 'Awning', ico: 'svg-awning', indic: 'svg-indicAwning', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 4, name: 'Shutter', ico: 'svg-shutter', indic: 'svg-indicShutter', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 5, name: 'Garage (1-button)', ico: 'svg-garage', indic: 'svg-indicGarage', lift: true, fpos: true },
        { type: 6, name: 'Garage (3-button)', ico: 'svg-garage', indic: 'svg-indicGarage', lift: true, fcmd: true, fpos: true },
        { type: 7, name: 'Drapery (right)', ico: 'svg-rdrapery', indic: 'svg-indicDrapery', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 8, name: 'Drapery (center)', ico: 'svg-cdrapery', indic: 'svg-indicDrapery', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 9, name: 'Switch (1-button)', ico: 'svg-switch1', indic: 'svg-indicSwitch1', fpos: true },
        { type: 10, name: 'Switch (2-button)', ico: 'svg-switch2', indic: 'svg-indicSwitch2', fcmd: true, fpos: true },
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
    // shadeType pilotés par un UNIQUE bouton bascule : les 1-bouton de SomfyShade::isToggle(), plus
    // le contact sec 1-bouton que SomfyDispatch traite exactement comme eux (case My, branche
    // `shadeType == drycontact`). À ne pas confondre avec noMyShadeTypes ci-dessus : le contact sec
    // 2-boutons n'a pas non plus de position My, mais il se commande par deux ordres DISTINCTS --
    // Up ferme le relais, Down l'ouvre -- et My lui est un non-événement explicite côté firmware
    // (`if(shadeType == drycontact2) return;`). Lui servir une bascule revient à ne rien lui servir.
    toggleShadeTypes = [5, 9, 14, 15, 16];
    // Les deux contacts secs. Le firmware les traite ensemble partout où il les distingue du reste
    // (SomfyDispatch : Prog/MyUp/MyDown/MyUpDown/UpDown/Sensor sortent avant d'agir ; SomfyGpio :
    // le relais suit `currentPos == 100` au lieu d'une direction) -- d'où une liste à eux, que ni
    // noMyShadeTypes ni toggleShadeTypes ne recouvre.
    dryContactShadeTypes = [9, 10];
    // Les types dont la position FERMÉE est 0 et non 100. Le store banne est le seul : il est ouvert
    // quand il est déplié, c'est-à-dire en butée basse. Ce n'est pas une interprétation -- le
    // firmware le déclare déjà noir sur blanc à Home Assistant, et uniquement pour ce type :
    // `case shade_types::awning: position_open = 100, position_closed = 0` là où tous les autres
    // (roller, curtain, garage, shutter, gate) déclarent l'inverse (SomfyExpose.cpp). Toute liste
    // ajoutée ici doit l'être AUSSI là-bas, sinon le tableau de bord et Home Assistant diraient le
    // contraire l'un de l'autre sur le même équipement.
    awningShadeTypes = [3];
    // Jeton du requestAnimationFrame qui coalesce les rafraîchissements du récapitulatif de colonne
    // (cf. queueColumnSummary).
    _summaryRaf = null;
    // Couples de mots annonçant l'état d'un interrupteur, indexés par switch_vocab_t (Somfy.h).
    // Un relais pilote des choses qui ne se racontent pas pareil : une lampe est allumée, un
    // portail ouvert, une pompe en marche. L'ordre [allumé, éteint] suit celui de l'énuméré
    // firmware, et l'index vient tel quel de la configuration de l'équipement.
    // Note : en anglais et en espagnol, les deux premiers couples se traduisent à l'identique
    // (« On / Off », « Encendido / Apagado ») -- ces langues ne les distinguent pas, ce n'est pas
    // une erreur de traduction.
    stateVocabKeys = [
        ['IS_ON', 'IS_OFF'],
        ['IS_LIT', 'IS_UNLIT'],
        ['IS_OPEN', 'IS_CLOSED'],
        ['IS_ACTIVE', 'IS_INACTIVE']
    ];
    radioBoardTypes = [
        { val: 0, label: 'DEFAULT', showGPIO: false },
        { val: 1, label: 'ESP32-D1 mini', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 18, CSNPin: 5, MOSIPin: 23, MISOPin: 19, TXPin: 21, RXPin: 22 } },
        { val: 2, label: 'WT32-ETH01', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 12, MOSIPin: 15, MISOPin: 4, TXPin: 2, RXPin: 35 } },
        { val: 3, label: 'Olimex ESP32-PoE/EVB', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 13, MOSIPin: 15, MISOPin: 16, TXPin: 4, RXPin: 36 } },
        { val: 4, label: 'LilyGO T-Internet POE', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 12, MOSIPin: 15, MISOPin: 16, TXPin: 4, RXPin: 35 } },
        { val: 5, label: 'wESP POE', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 18, CSNPin: 5, MOSIPin: 13, MISOPin: 32, TXPin: 4, RXPin: 39 } },
        { val: 6, label: 'ESP-PoE-32', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 5, MOSIPin: 13, MISOPin: 32, TXPin: 4, RXPin: 35 } },
        { val: 7, label: 'ESP32-S3 Mini', showGPIO: false, chips: ['s3'], pins: { SCKPin: 7, CSNPin: 6, MOSIPin: 9, MISOPin: 8, TXPin: 3, RXPin: 4 } },
        { val: 8, label: 'XIAO-ESP32-C3', showGPIO: false, chips: ['c3'], pins: { SCKPin: 8, CSNPin: 6, MOSIPin: 10, MISOPin: 9, TXPin: 3, RXPin: 4 } },
        // Waveshare ESP32-C6-Zero, la carte 8 Mo du socle C6. Brochage repris de
        // lenoxys/somfy-thread, qui pilote un CC1101 depuis cette même carte -- valeurs éprouvées
        // sur son banc. À éviter ici : 12/13 (USB D-/D+), 14 (commutateur d'antenne RF embarqué),
        // 8 (LED RGB adressable), 23 (pastille au dos, non câblable) et 24-30 (flash en boîtier du
        // C6FH8). GPIO4/5 sont les broches du JTAG externe, libres car la console passe par
        // l'USB-Serial-JTAG interne. Doit rester jumeau du défaut de SomfyRadioDriver.cpp.
        { val: 9, label: 'ESP32-C6-Zero', showGPIO: false, chips: ['c6'], pins: { SCKPin: 19, CSNPin: 21, MOSIPin: 4, MISOPin: 20, TXPin: 22, RXPin: 5 } },
        // Waveshare ESP32-S3 Zero : même brochage que l'ESP32-S3 Mini, les six broches sortant sur ses
        // connecteurs latéraux (GPIO1 à 13), contrairement au défaut S3 dont 14/15 n'y sont pas.
        // À éviter ici : 0 (BOOT), 19/20 (USB D-/D+), 21 (LED RGB adressable) et 26 à 37 (flash et
        // PSRAM du S3FH4R2). Éprouvé sur la carte le 27/10/2026.
        { val: 10, label: 'ESP32-S3 Zero', showGPIO: false, chips: ['s3'], pins: { SCKPin: 7, CSNPin: 6, MOSIPin: 9, MISOPin: 8, TXPin: 3, RXPin: 4 } },
        { val: 255, label: 'MANUAL_SETTINGS', showGPIO: true }
    ];
    ledBoardTypes = [
        { val: -1, label: 'LED_MODAL_PIN_NONE' },
        { val: 0, label: 'LED_MODAL_PRESET_PICK', placeholder: true },
        { val: 1, label: 'WT32-ETH01', pin: 5, activeLow: true, chips: ['esp32'] },
        { val: 2, label: 'ESP32-D1 mini', pin: 2, activeLow: false, chips: ['esp32'] },
        { val: 3, label: 'XIAO ESP32-S3', pin: 21, activeLow: true, chips: ['s3'] },
        // Waveshare ESP32-C6-Zero : sa seule LED utilisateur est une WS2812 ADRESSABLE sur GPIO8,
        // pas une sortie à niveau -- d'où `addressable` et l'absence d'`activeLow`, qui n'aurait
        // aucun sens ici (un pixel n'a pas de polarité). GPIO8 est une broche de strapping du C6,
        // mais la LED y est câblée en dur et n'est pilotée qu'après le démarrage : sans effet.
        // `order: 1` = RGB et non le GRB du WS2812B standard. MESURÉ sur la carte le 06/10/2026 :
        // un orange demandé en sortait vert, ce que la permutation des deux premiers octets prédit
        // exactement. Rien dans le protocole du pixel ne révèle son câblage, c'est donc au
        // préréglage de le porter, au même titre que la broche.
        // Le préréglage du XIAO ESP32-C6 (GPIO15, actif bas) a été retiré avec le support des
        // cartes C6 de 4 Mo.
        { val: 4, label: 'ESP32-C6-Zero', pin: 8, addressable: true, order: 1, chips: ['c6'] },
        // Waveshare ESP32-S3 Zero : WS2812 adressable sur GPIO21, la même broche que la LED simple
        // du XIAO ESP32-S3 -- c'est le type qui les départage à la relecture. Ordre GRB standard,
        // contrairement à la C6-Zero : éprouvé sur la carte le 27/10/2026.
        { val: 5, label: 'ESP32-S3 Zero', pin: 21, addressable: true, chips: ['s3'] },
        { val: 255, label: 'MANUAL_SETTINGS' }
    ];
    // Écoute déléguée : les flèches du carrousel sont reconstruites à chaque setShadesList(), une
    // liaison par élément dériverait. Classe plutôt que :active, dont la durée est celle du clic.
    bindCarouselNavFeedback() {
        document.addEventListener('pointerdown', (e) => {
            const btn = e.target.closest('.btn-nav');
            if (!btn || btn.disabled) return;
            btn.classList.add('btn-nav-press');
            btn.addEventListener('animationend', () => btn.classList.remove('btn-nav-press'), { once: true });
        }, { passive: true });
    }
    init() {
        if (this.initialized) return;
        this.bindCarouselNavFeedback();
        this.bindVRKeyboard();
        initMultiClickToggle('#divTransceiverSettings .main-headerTitle', 'show-expert-gpio', 5);
        initMultiClickToggle('.sidebar-brand, #showLogoHeader', () => this.screenShade(), 5);
        this.initialized = true;
    }
    initPins() {
        // Mise en place à faire UNE SEULE fois par chargement de page : écouteurs, listes
        // d'<option> et valeurs de remplissage ci-dessous. loadGeneral() rappelle initPins() à
        // chaque réouverture du socket ; sans cette garde, chaque reconnexion rempilait un
        // écouteur 'change' et surtout rejouait le ui.toElement de valeurs par défaut plus bas,
        // écrasant le brochage réel déjà affiché par loadSomfy(). Distincte de this.initialized,
        // qui garde init() : les deux ne couvrent pas le même périmètre.
        if (this.pinsInitialized) return;
        this.pinsInitialized = true;

        const sel = get('selRadioBoardType');

        sel.addEventListener('change', e => this.onRadioBoardTypeChanged(e.target));

        this.loadPins('inout', get('selTransSCKPin'));
        this.loadPins('inout', get('selTransCSNPin'));
        this.loadPins('inout', get('selTransMOSIPin'));
        this.loadPins('input', get('selTransMISOPin'));
        this.loadPins('out', get('selTransTXPin'));
        this.loadPins('input', get('selTransRXPin'));

        if (!this._radioApplied) ui.toElement(get('divTransceiverSettings'), {
            transceiver: { config: { proto: 0, radioBoardType: 0, SCKPin: 18, CSNPin: 5, MOSIPin: 23, MISOPin: 19, TXPin: 13, RXPin: 12, frequency: 433.42, rxFrequency: 433.42, rxBandwidth: 97.96, type: 56, txPower: 10, enabled: false } }
        });

        this.loadPins('out', get('selShadeGPIOUp'));
        this.loadPins('out', get('selShadeGPIODown'));
        this.loadPins('out', get('selShadeGPIOMy'));
        this.loadRadioBoardTypes(get('selRadioBoardType'));
        this.loadRadioBoardTypes(sel);
        this.onRadioBoardTypeChanged(sel);
    }
    chipFamily() {
        const cm = (get('divContainer').getAttribute('data-chipmodel') || "").toLowerCase().trim();
        if (cm.includes("s3")) return "s3";
        if (cm.includes("c6")) return "c6";
        if (cm.includes("c3")) return "c3";
        if (cm.includes("s2")) return "s2";
        return "esp32";
    }
    loadRadioBoardTypes(sel) {
        while (sel.firstChild) sel.removeChild(sel.firstChild);

        const cm = this.chipFamily();

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
    onRadioBoardTypeChanged(sel) {
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
            // Le "?" a quitte ce resume pour le bloc du selecteur (cf. index.html) : place ici il
            // disparaissait avec le resume des qu'on passait en "Definir manuellement", c'est-a-dire
            // exactement quand l'aide sert le plus.
            let html = `<div class="gpioRadio-container">`;

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
                // Le champ manuel PART de ce qui est affiche -- donc du brochage de la carte qu'on
                // vient de quitter, que la boucle precedente a laisse dans selP puisqu'elle ne
                // s'execute pas quand target est null.
                // parseInt teste par isNaN et non par sa veracite : GPIO 0 est une broche valide,
                // qu'un `|| def[k]` remplacerait silencieusement par la valeur par defaut.
                if (isM) {
                    const courant = parseInt(selP ? selP.value : inpP.value, 10);
                    inpP.value = isNaN(courant) ? def[k] : courant;
                }
                inpP.style.display = isM ? 'inline-block' : 'none';
            }
        });

        get('divManualSafety').style.display = isM ? 'block' : 'none';
        divS.style.display = target ? 'block' : 'none';
        divG.style.display = target ? 'none' : 'inline-block';
        this.updateRadioPins();
    }
    updateRadioPins() {
        const det = get('divRadioPins'), chips = get('divRadioPinChips'), sel = get('selRadioBoardType');
        if (!det || !chips || !sel) return;
        const manual = parseInt(sel.value, 10) === 255;
        det.style.display = manual ? '' : 'none';
        chips.style.display = manual ? '' : 'none';
        if (!manual) { this._pinsAutoOpened = false; return; }
        const cb = get('cbManualSafety');
        if (cb && !cb.checked && !this._pinsAutoOpened) { det.open = true; this._pinsAutoOpened = true; }
        chips.innerHTML = [['SCK', 'SCKPin'], ['CSN', 'CSNPin'], ['MOSI', 'MOSIPin'], ['MISO', 'MISOPin'], ['TX', 'TXPin'], ['RX', 'RXPin']].map(([l, k]) => {
            const v = parseInt((get('inputTrans' + k) || {}).value, 10);
            return `<span><small>${l}</small><b>${isNaN(v) ? '--' : 'GPIO' + v}</b></span>`;
        }).join('');
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
        getJSONSync('/controller', (err, somfy) => {
            // Marqué avant le traitement (succès ou erreur) : autorise checkEmptyState() à
            // afficher enfin un état définitif -- y compris en cas d'erreur réseau, pour ne pas
            // laisser le tableau de bord bloqué indéfiniment dans son état "chargement" (colonnes
            // vides sans message) faute de réponse. Cf. this.dataLoaded.
            this.dataLoaded = true;
            // `truncated` : aveu explicite du firmware, posé quand un élément a dépassé son tampon
            // de sérialisation (cf. le filet de controllerProduceNext, WebSystem.cpp). Le document
            // est alors du JSON valide mais AMPUTÉ -- il lui manque des sections entières. Le
            // traiter comme un chargement réussi peuplerait l'interface d'un état partiel passé
            // pour complet, avec le risque qu'un enregistrement ultérieur le recopie en
            // configuration. On le traite donc comme une erreur de service.
            //
            // Code PROPRE, distinct du RESP_MALFORMED des helpers XHR : les deux situations ne
            // disent pas la même chose -- là, un corps qu'on n'arrive pas à lire (réseau,
            // mandataire, firmware qui émet n'importe quoi) ; ici, le boîtier qui avoue ne pas
            // avoir pu tout sérialiser, avec une ligne série précise à la clé. Partager le code
            // les rendait indiscernables à l'écran, serviceError() préférant le libellé traduit
            // au `desc` dès que la clé ERR_<code> existe au dictionnaire.
            if (!err && somfy && somfy.truncated) {
                err = { htmlError: 200, service: 'GET /controller', code: 'RESP_TRUNCATED',
                        desc: 'The device could not serialize its full configuration.' };
            }
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
                // ponctuellement pour ces spans) : consommé plus tard par _openEditScheduleGroup() et
                // renderScheduleBadges() pour le quota de plannings restants, potentiellement bien
                // après la résolution de ce callback -- lu depuis /controller plutôt que recopié en
                // dur côté JS, pour ne pas dériver silencieusement si SOMFY_MAX_SCHEDULES change côté
                // firmware.
                this.maxSchedules = somfy.maxSchedules - 2;

                ui.toElement(get('divTransceiverSettings'), somfy);

                if (typeof this.updateRadioGraph === 'function') {
                    this.updateRadioGraph();
                }

                this.watchRadioEdits();
                // Premiere reference de ce que la carte execute : /controller vient de la donner,
                // inutile de redemander a /getRadio dans la foulee.
                if (somfy.transceiver && somfy.transceiver.config)
                    this._radioApplied = Object.assign({}, somfy.transceiver.config);

                const selBoard = get('selRadioBoardType');
                if (selBoard) {
                    this.loadRadioBoardTypes(selBoard);
                }

                if (somfy.transceiver && somfy.transceiver.config) {
                    if (selBoard) selBoard.value = somfy.transceiver.config.radioBoardType || 0;
                    this.onRadioBoardTypeChanged(selBoard);
                }

                // --- NOUVELLE LOGIQUE INITIALISATION DU SWITCH RADIO (CHECKBOX) ---
                const cbEnableRadio = get('cbEnableRadio');
                const row = get('divRadioEnableColor');
                const radioTab = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]');

                // On initialise l'état de la checkbox suivant la configuration reçue
                const isConfigEnabled = !!(somfy.transceiver && somfy.transceiver.config && somfy.transceiver.config.enabled);
                if (cbEnableRadio) {
                    cbEnableRadio.checked = isConfigEnabled;
                    cbEnableRadio.parentElement.classList.remove('sel-pending');
                }
        
                const isRadioInit = somfy.transceiver?.config?.radioInit;
                const sideNote = get('barsideRadioDisable');
                if (radioTab) {
                    radioTab.classList.toggle('radio-error', !isRadioInit);
                    if (sideNote) sideNote.style.display = isRadioInit ? 'none' : 'inline';
                    if (row) row.classList.toggle('radioOn', !!isRadioInit);
                }
                this.renderRadioFleet();
                this.updateWelcomeSteps();
                this.setVRRadioState(isConfigEnabled && !!isRadioInit);

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
        // Les boutons +/- ne vivent que dans #divShowGpio, visible uniquement en mode manuel -- ou
        // #divGPIOSummary est justement masque. Le rafraichissement du resume qui suivait cet appel
        // ne pouvait donc jamais se voir.
        stepDeviceGpio(pinKey, direction, 'Trans', 'selRadioBoardType', val => val === 255, this.pinMaps);
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

        pk.forEach(k => {
            const el = get((isM ? 'inputTrans' : 'selTrans') + k);
            if (el) t.config[k] = parseInt(el.value, 10);
        });

        // L'interrupteur de securite et la confirmation valident un cablage manuel. Si la carte
        // execute deja la radio activee en manuel avec ces memes broches, ce cablage a deja passe
        // ce parcours : reenregistrer (frequence, protocole, ou couper la radio) ne redemande rien.
        // Une broche modifiee, un passage d'un preset vers le manuel ou l'activation d'une radio
        // coupee gardent le parcours complet.
        const ap = this._radioApplied,
        pinsTrusted = isM && !!ap?.enabled &&
            ap.radioBoardType === bv && pk.every(k => ap[k] === t.config[k]);

        if (isM && !pinsTrusted && !get('cbManualSafety')?.checked) {
            return ui.errorMessage(d, tr('ERR_RADIO_SAFETY_REQUIRED'));
        }

        // Les curseurs portent data-setonly="true", donc ui.fromElement() les SAUTE à la lecture :
        // la seule source restante pour ces clés est le <span> d'affichage, lui aussi lié. Quand ce
        // span n'est pas peuplé (réponse /controller perdue, socket qui n'a jamais abouti), on
        // envoyait "rxBandwidth":null -- et côté firmware containsKey() est VRAI pour un null, dont
        // la lecture en float donne 0. D'où les 0,00 kHz de l'issue #43 du dépôt officiel. Ici les
        // bornes de clampRadioFloat() rejettent déjà ce 0, mais le réglage ne partait tout de même
        // pas : on lit donc les curseurs explicitement, comme les broches juste au-dessus.
        // ui.getValue() applique les conversions déclarées dans index.html (data-mult, et
        // data-datatype="index" + data-values pour la puissance, INDICE côté curseur et dBm côté
        // firmware). Pas de deviation ici : le réglage a été retiré du firmware (cf. 9d642db).
        [['rxBandwidth', 'slidRxBandwidth'], ['frequency', 'slidFrequency'], ['rxFrequency', 'slidRxFrequency'], ['txPower', 'slidTxPower']]
        .forEach(([k, id]) => {
            const el = get(id);
            if (!el) return;
            const v = ui.getValue(el);
            if (typeof v === 'number' && !isNaN(v)) t.config[k] = v;
        });

            if (!t.config.type || t.config.type === 'none') {
                ui.errorMessage(d, tr('ERR_RADIO_TYPE_REQUIRED'));
                valid = false;
            }

            if (valid && !pinsTrusted) {
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

                    // La reference de ce que la CARTE execute vient de changer : sans cette mise
                    // a jour, le recapitulatif continuait de comparer aux anciennes valeurs et
                    // affichait "Modifications non enregistrees" apres un enregistrement REUSSI,
                    // jusqu'au prochain rechargement de page. La reponse du boitier fait foi --
                    // on prend res.config et non le formulaire, qui n'est qu'une intention.
                    this._radioApplied = Object.assign({}, res.config);
                    this.radioFleet = null;
                    this._radioAfterWiz = !!this._wizPending;
                    this._wizPending = false;
                    this.updateRadioGraph();

                    const init = res.config.radioInit,
                    tab = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]'),
                            sn = get('barsideRadioDisable'),
                            cb = get('cbEnableRadio');

                            if (tab) {
                                tab.classList.toggle('radio-error', !init);
                                if (sn) sn.style.display = init ? 'none' : 'inline';
                                get('divRadioEnableColor').classList.toggle('radioOn', !!init);
                            }
                            this.updateWelcomeSteps();

                            // Comparaison simple et directe avec l'état de la checkbox d'origine
                            if (cb) {
                                get('divRadioEnableStatus').textContent = tr(cb.checked === init ? (cb.checked ? 'RADIO_ENABLED' : 'RADIO_DISABLED') : 'RADIO_SAVE_REQUIRED');
                                this.renderRadioFleet();
                            }
                });
            };

            if (isM && !pinsTrusted) {
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
        { name: 'c3', maxPins: 21, inputs: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], outputs: [11, 12, 13, 14, 15, 16, 17, 21] },
        // ESP32-C6 : GPIO0 a GPIO30. Exclues des deux listes -- 12 et 13 (USB D-/D+, les couper
        // coupe la console serie ET le flashage sur une carte a USB natif comme le XIAO), et
        // 24 a 30 (bus de la flash SPI interne). Les broches de strapping (4, 5, 8, 9, 15) restent
        // proposees : elles sont utilisables une fois le demarrage passe, comme sur les autres
        // puces de cette table.
        { name: 'c6', maxPins: 30, inputs: [12, 13, 24, 25, 26, 27, 28, 29, 30], outputs: [12, 13, 24, 25, 26, 27, 28, 29, 30] }
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
            // Une broche déjà configurée sur l'appareil doit rester affichable même si la table ne
            // la propose pas (brochage manuel hors liste, ou table générique servie par défaut
            // faute de data-chipmodel) : sinon l'affectation échoue sans bruit, le select retombe
            // sur sa première <option> et l'écran annonce une broche que l'appareil n'utilise pas.
            // Même rattrapage que dans onRadioBoardTypeChanged() pour les presets de carte.
            if (![...sel.options].some(o => parseInt(o.value, 10) === currentVal)) {
                sel.options.add(new Option(`GPIO-${currentVal > 9 ? currentVal : '0' + currentVal}`, currentVal));
            }
            sel.value = currentVal;
        }
    }
    procFrequencyScan(scan) {
        // L'assistant pilote son PROPRE balayage. Sans ce retour, le scanFrequency() ci-dessous
        // construirait par-dessus lui la fenetre de depannage, que personne n'a demandee -- il
        // cree l'overlay des qu'il ne le trouve pas.
        // LE GARDE COUVRE TOUTE LA VIE DE L'ASSISTANT, PAS SEULEMENT L'ECOUTE : des qu'une mesure
        // se referme l'assistant passe en 'mesuree', et endFrequencyScan() emet encore UNE trame
        // apres l'arret (cf. SomfyRadioDriver.cpp) -- cette trame doit rester filtree elle aussi.
        // wizStopping tient jusqu'a ce que le boitier ait confirme l'arret par un scanning:false, ce
        // qui couvre aussi la fermeture de l'assistant, ou this.wiz est deja remis a null quand la
        // derniere trame arrive.
        if (this.wiz || this.wizStopping) {
            if (this.wiz && this.wiz.etat === 'ecoute') this.wizOnScan(scan);
            if (!scan.scanning) this.wizStopping = false;
            return;
        }
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

            if (this.rssiGraphWave) this.rssiGraphWave.update(scan.testRSSI);
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
        // Meme garde que le test et l'assistant : le balayage a BESOIN de la radio. Sans ce
        // controle, la fenetre de depannage s'ouvrait et tournait indefiniment sans rien trouver
        // -- exactement le "ca bugue" qu'on cherche a eviter ailleurs.
        // Seulement sur la demande explicite : procFrequencyScan() rappelle cette methode sans
        // argument a chaque trame recue, et un garde-fou la ferait echouer en plein balayage.
        if (initScan && !this.radioPrete()) return;
        // Demande EXPLICITE de l'utilisateur (bouton Scanner) : elle prime sur tout reliquat de
        // l'assistant, sinon un drapeau reste leve par une coupure reseau figerait cette fenetre.
        if (initScan) this.wizStopping = false;
        if (this.isScanClosing) return;
        let div = get('divScanFrequency');

        if (!div) {
            div = document.createElement('div');
            div.id = 'divScanFrequency';
            div.className = 'inst-overlay';

            div.innerHTML = `
            <div class="instructions-content">

            ${overlayHeader('SCANFREQ_TITLE', 'SCANFREQ_SCAN_DESC', 'svg-tabRadio', { subtitle: 'SCANFREQ_SCAN_DESC' })}
            <div class="overlay-scroll-content">

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
            </div>

            <details id="graphAccordion" class="uniblocCol scanfreq-help-accordion" open>
            <summary class="scanfreq-help-trigger">
            <div class="scanfreq-title-wrapper">
            <svg class="help-svg"><use href="#svg-wave"></use></svg>
            <span>${tr('SCANFREQ_GRAPH_TITLE')}</span>
            </div>
            <svg class="accordion-arrow"><use href="#svg-arrowDown"></use></svg>
            </summary>

            <div class="graph-zone-wrapper">
            <div id="graphCanvasContainer" class="uniblocrRssiCanvas">
            <canvas id="rssiWave"></canvas>
            </div>
            </div>
            </details>

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

            <button id="btnRestartScanning" type="button" line class="btn-scan-action btn-success" style="display:none" onclick="somfy.scanFrequency(true)" title="${tr('BT_START_SCAN')}">
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

            const graphAccordion = div.querySelector('#graphAccordion');
            if (graphAccordion) {
                graphAccordion.addEventListener('toggle', () => {
                    if (graphAccordion.open && this.rssiGraphWave) this.rssiGraphWave.draw();
                });
            }

            if (this._graphResizeObs) this._graphResizeObs.disconnect();
            if (typeof ResizeObserver === 'function') {
                this._graphResizeObs = new ResizeObserver(() => {
                    if (this.rssiGraphWave) this.rssiGraphWave.draw();
                });
                this._graphResizeObs.observe(div.querySelector('#rssiWave'));
            }

                this.rssiGraphWave = {
                    points: [],
                    maxPoints: 80,
                    canvas: get('rssiWave'),
                    freqMin: 433.00,
                    freqMax: 434.00,
                    currentIdx: 0,
                    optimalFreq: null,
                    stopped: false,

                    reset() {
                        this.currentIdx = 0;
                        this.optimalFreq = null;
                        this.stopped = false;
                        this.points = Array(this.maxPoints).fill(-110);
                    },

                    update(val, currentFreq) {
                        if (this.points.length === 0) this.points = Array(this.maxPoints).fill(-110);

                        currentFreq = get('spanTestFreq') ? get('spanTestFreq').innerText : currentFreq;

                        let v = parseInt(val);
                        if (isNaN(v) || v < -110) v = -110;
                        if (v > -30) v = -30;

                        let freq = NaN;
                        if (currentFreq !== undefined && currentFreq !== null) {
                            freq = parseFloat(String(currentFreq).replace(/[^0-9.]/g, ''));
                        }
                        if (!isNaN(freq) && freq >= this.freqMin && freq <= this.freqMax) {
                            const pct = (freq - this.freqMin) / (this.freqMax - this.freqMin);
                            this.currentIdx = Math.min(Math.max(Math.floor(pct * (this.maxPoints - 1)), 0), this.maxPoints - 1);
                        } else {
                            this.currentIdx = (this.currentIdx + 1) % this.maxPoints;
                        }
                        this.points[this.currentIdx] = v;
                        this.draw();
                    },

                    markResult(bestFreq) {
                        this.stopped = true;
                        const f = parseFloat(bestFreq);
                        this.optimalFreq = (!isNaN(f) && f > 0) ? f : null;
                        this.draw();
                    },

                    draw() {
                        const c = this.canvas;
                        if (!c) return;
                        if (typeof c.checkVisibility === 'function' && !c.checkVisibility()) return;

                        const displayW = c.clientWidth;
                        const displayH = c.clientHeight;
                        if (!displayW || !displayH) return;
                        if (this.points.length === 0) this.points = Array(this.maxPoints).fill(-110);

                        const ctx = c.getContext('2d');
                        const dpr = window.devicePixelRatio || 1;
                        c.width = displayW * dpr;
                        c.height = displayH * dpr;
                        ctx.scale(dpr, dpr);

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

                        const etendue = this.freqMax - this.freqMin;
                        const texteEchelon = (pas, unite, i, n) =>
                            (this.freqMin + i * pas).toFixed(2) + (unite && i === n - 1 ? ' MHz' : '');
                        const xEchelon = (i, n) => lblW + (i / (n - 1)) * gW;
                        const tient = (pas, unite) => {
                            const n = Math.round(etendue / pas) + 1;
                            if (n < 2) return null;
                            const emprises = [];
                            for (let i = 0; i < n; i++) {
                                const large = ctx.measureText(texteEchelon(pas, unite, i, n)).width;
                                const x = xEchelon(i, n);
                                const debut = i === 0 ? x : (i === n - 1 ? x - large : x - large / 2);
                                emprises.push([debut, debut + large]);
                            }
                            for (let i = 1; i < n; i++) {
                                if (emprises[i][0] - emprises[i - 1][1] < 6) return null;
                            }
                            return {pas, n, unite};
                        };
                        let echelle = null;
                        for (const pas of [0.10, 0.20, 0.25, 0.50, 1.00]) {
                            echelle = tient(pas, true) || tient(pas, false);
                            if (echelle) break;
                        }
                        if (!echelle) echelle = {pas: etendue, n: 2, unite: false};

                        for (let i = 0; i < echelle.n; i++) {
                            const dernier = i === echelle.n - 1;
                            ctx.textAlign = dernier ? 'right' : (i === 0 ? 'left' : 'center');
                            ctx.fillText(texteEchelon(echelle.pas, echelle.unite, i, echelle.n), xEchelon(i, echelle.n), yLabel);
                        }

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

                        if (this.stopped && this.optimalFreq !== null) {
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
        // Le balayage mesure une telecommande : il regle l'ECOUTE, jamais l'emission.
        let slid = get('slidRxFrequency');
        slid.value = Math.round(freq * 1000);
        somfy.rxFrequencyChanged(slid);
        slid.dispatchEvent(new Event('change', { bubbles: true }));
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

                if (this.rssiGraphWave) this.rssiGraphWave.markResult(freq);

                if (get('scanStatusText')) get('scanStatusText').style.display = 'none';

                if (get('btnStopScanning')) get('btnStopScanning').style.display = 'none';
                if (get('btnRestartScanning')) get('btnRestartScanning').style.display = '';

                if (typeof freq === 'number' && !isNaN(freq) && freq > 0) {
                    if (get('btnCopyFrequency')) get('btnCopyFrequency').style.display = '';
                    if (get('scanStatusResult')) get('scanStatusResult').style.display = 'none';
                } else {
                    if (get('btnCopyFrequency')) get('btnCopyFrequency').style.display = 'none';
                    if (get('scanStatusResult')) get('scanStatusResult').style.display = '';
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
        if (this._graphResizeObs) {
            this._graphResizeObs.disconnect();
            this._graphResizeObs = null;
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
        // bubbles OBLIGATOIRE : watchDirty() (20-shell.js) ecoute 'input' sur le CONTENEUR
        // (#divTransceiverSettings), pas sur chaque champ. Un Event('input')
        // nu ne remonte pas -- new Event() a bubbles:false par defaut -- si bien que les boutons
        // +/- changeaient la valeur sans jamais marquer le formulaire modifie. Deplacer le curseur
        // a la souris marchait, lui, parce que l'evenement natif remonte.
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Maintien sur les boutons +/- de la page Radio. Cadence FIXE, et c'est le pas qui grandit --
    // calculé depuis l'amplitude du curseur pour qu'un maintien continu mette toujours à peu près
    // holdSweepMs à parcourir la plage entière, quel que soit le réglage (la puissance d'émission
    // n'a que 10 crans, la bande passante 75447). La montée est quadratique : juste après le seuil
    // on avance encore cran par cran, ce qui laisse viser une valeur précise ; la pleine vitesse
    // n'est atteinte qu'au bout de holdRampMs.
    startStepHold(sliderId, direction) {
        // Nettoyage de sécurité au cas où un vieux timer traîne.
        this.stopStepHold();

        this.stepValue(sliderId, direction, 1);
        this.sliderStartTime = Date.now();

        // Pas maximal, calculé UNE fois pour ce curseur : son nombre de crans réparti sur les
        // ticks que dure un balayage complet.
        const slider = get(sliderId);
        const span = slider
            ? Math.abs(parseFloat(slider.max) - parseFloat(slider.min)) / (parseFloat(slider.step) || 1)
            : 1;
        const maxStep = Math.max(1, span * this.holdTickMs / this.holdSweepMs);

        const runHold = () => {
            const held = Date.now() - this.sliderStartTime - this.holdDelayMs;
            if (held >= 0) {
                const t = Math.min(1, held / this.holdRampMs);
                this.stepValue(sliderId, direction, Math.max(1, Math.round(maxStep * t * t)));
            }
            this.sliderTimer = setTimeout(runHold, this.holdTickMs);
        };

        this.sliderTimer = setTimeout(runHold, this.holdDelayMs);
    }

    stopStepHold() {
        if (this.sliderTimer) {
            clearTimeout(this.sliderTimer);
            this.sliderTimer = null;
        }
    }

    updateWelcomeSteps() {
        const root = get('divEmptyHome');
        if (!root) return;
        const net = typeof wifi !== 'undefined' ? wifi : {};
        const hotspot = !!net.isHotspot;
        const eth = net._netType === 'lan' || net._netType === 'poe';
        const radioOn = !!this._radioApplied?.radioInit;
        const steps = [
            ['Net', hotspot ? 'todo' : 'done', hotspot ? 'WELCOME_ST_TODO' : 'WELCOME_ST_NET_OK', hotspot ? '' : (eth ? 'Ethernet' : (net._wifiSsid || ''))],
            ['Radio', radioOn ? 'done' : 'warn', radioOn ? 'WELCOME_ST_RAD_OK' : 'WELCOME_ST_RAD_OFF', ''],
            ['Device', radioOn ? 'todo' : 'wait', radioOn ? 'WELCOME_ST_READY' : 'WELCOME_ST_WAIT', '']
        ];
        const icons = { done: 'svg-succes', warn: 'svg-warning', todo: 'svg-arrowRight', wait: 'svg-lock' };
        const current = (steps.find(s => s[1] !== 'done') || steps[2])[0];
        for (const [id, state, key, extra] of steps) {
            const card = get('divWelcome' + id);
            const dot = root.querySelector(`.welcome-dot[data-step="${id}"]`);
            if (dot) {
                dot.classList.toggle('is-done', state === 'done');
                dot.classList.toggle('is-current', id === current);
            }
            if (!card) continue;
            card.dataset.state = state;
            card.classList.toggle('is-current', id === current);
            const chip = card.querySelector('.welcome-state');
            if (!chip) continue;
            chip.querySelector('use').setAttribute('href', '#' + icons[state]);
            const label = chip.children[1];
            label.setAttribute('tr', key);
            label.textContent = tr(key);
            chip.children[2].textContent = extra;
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
        // masqué.
        const isEmptyState = totalDevices === 0 && !hasRooms;
        if (divHomePnl) divHomePnl.style.display = (isConfigOpen || isEmptyState) ? 'none' : '';

        const divGetStarted = getEl('divGetStarted');
        const divNoDevice = getEl('divNoDevice');

        if (isEmptyState) {
            setDisp(divGetStarted, !isConfigOpen, 'flex');
            this.updateWelcomeSteps();
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
        this.syncColumnSummary();
    }

    // Récapitulatif d'en-tête de colonne : « 2/10 ouvert(s) » côté équipements, le nombre de
    // groupes visibles côté groupes, et de part et d'autre un témoin qui dit qu'un mouvement est en
    // cours ailleurs dans la liste. C'est ce dernier qui justifie le tout : le halo de la carte
    // (cf. .somfyShadeCtl[data-direction] dans overlays.css) ne sert à rien quand la carte est
    // hors de la zone visible, et les listes défilent (overflow-y:auto sur #divShadeControls).
    //
    // N'interroge QUE le DOM, et aucune nouvelle source de vérité : les cartes portent déjà
    // data-position/data-direction/data-tiltdirection/data-shadetype/data-flipposition, tenus à jour
    // en direct par procShadeState() (et data-moving/data-direction pour les groupes, dérivés des
    // membres par syncGroupMovement()). Le filtre de pièce se lit sur style.display, posé par
    // selectRoom() -- exactement la lecture que fait déjà checkEmptyState() au-dessus. Donc : rien à
    // ajouter côté firmware, aucun champ de configuration, aucun octet de NVS.
    //
    // Règle d'ouverture : un équipement est FERMÉ à sa position de fermeture (closedPosition(), qui
    // reproduit la fiche Home Assistant du firmware), ouvert partout ailleurs -- y compris à
    // mi-course, ce qui est l'intuition (« il y a encore du jour qui passe »).
    // Les contacts secs sont EXCLUS du ratio, numérateur comme dénominateur : leur convention est
    // l'inverse de celle des équipements positionnés (shadeStateLabel annonce l'état haut pour
    // p >= 50, alors qu'un équipement positionné est ouvert vers 0), et leur vocabulaire n'est même
    // pas forcément celui de l'ouverture (Marche/Arrêt, Allumé/Éteint...). Les additionner sous le
    // mot « ouverts » donnerait un chiffre faux. Ils comptent en revanche pour le mouvement, qui
    // lui ne dépend d'aucune convention.
    syncColumnSummary() {
        const visible = sel => [...document.querySelectorAll(sel)].filter(el => el.style.display !== 'none');

        // --- Colonne Équipements ---
        let open = 0, positioned = 0, moving = 0, dir = 0, mixed = false;
        visible('#divShadeControls .somfyShadeCtl').forEach(c => {
            const d = parseInt(c.dataset.direction, 10) || 0;
            if (d !== 0 || (parseInt(c.dataset.tiltdirection, 10) || 0) !== 0) moving++;
            // Même arbitrage que syncGroupMovement() : le sens n'est affiché que s'il fait
            // l'unanimité, et une lame qui s'incline compte comme un mouvement sans voter sur le
            // sens, faute de haut et de bas.
            if (d !== 0) { if (dir === 0) dir = d; else if (dir !== d) mixed = true; }
            const type = parseInt(c.dataset.shadetype, 10);
            if (this.dryContactShadeTypes.includes(type)) return;
            positioned++;
            const pos = parseInt(c.dataset.position, 10) || 0;
            if (pos !== this.closedPosition(type, c.dataset.flipposition === 'true')) open++;
        });
        // positioned à 0 (parc entièrement en contacts secs, ou pièce n'en contenant que) : pas de
        // « 0/0 ouvert(s) », on se taît. Le témoin de mouvement, lui, reste.
        this.setColumnSummary('shade',
            positioned > 0 ? tr('IS_SUMMARY_OPEN').replace('{n}', open).replace('{t}', positioned) : '',
            positioned > 0 ? `${open}/${positioned}` : '',
            moving, mixed ? 0 : dir, mixed);
        const shadeCards = visible('#divShadeControls .somfyShadeCtl');
        const colCount = get('spanShadeColumnCount');
        if (colCount) colCount.textContent = shadeCards.length ? String(shadeCards.length) : '';
        const activePill = document.querySelector('.room-pill.active');
        const activeRoom = activePill ? parseInt(activePill.getAttribute('data-roomid'), 10) : 0;
        const roomLabel = document.querySelector('.dash-summary-room');
        if (roomLabel) {
            const r = activeRoom ? _rooms.find(x => x.roomId === activeRoom) : null;
            roomLabel.textContent = r ? `${r.name} :` : '';
        }
        const topbar = document.querySelector('.dash-topbar');
        if (topbar) topbar.classList.toggle('is-empty', _rooms.length <= 1 && positioned === 0 && moving === 0);
        document.querySelectorAll('#divShadeControls .dash-room-title').forEach(t => {
            const rid = parseInt(t.dataset.roomid, 10);
            let o = 0, n = 0;
            shadeCards.forEach(c => {
                if (parseInt(c.dataset.roomid, 10) !== rid) return;
                const type = parseInt(c.dataset.shadetype, 10);
                if (this.dryContactShadeTypes.includes(type)) return;
                n++;
                if ((parseInt(c.dataset.position, 10) || 0) !== this.closedPosition(type, c.dataset.flipposition === 'true')) o++;
            });
            const cnt = t.querySelector('.dash-room-count');
            if (cnt) cnt.textContent = n ? `${o}/${n}` : '';
        });

        // --- Colonne Groupes ---
        const groups = visible('#divGroupControls .somfyGroupCtl');
        let gMoving = 0, gDir = 0, gMixed = false;
        groups.forEach(c => {
            if (c.dataset.moving !== 'true') return;
            gMoving++;
            const d = parseInt(c.dataset.direction, 10) || 0;
            if (d !== 0) { if (gDir === 0) gDir = d; else if (gDir !== d) gMixed = true; }
        });
        const gCount = groups.length > 0 ? String(groups.length) : '';
        this.setColumnSummary('group', gCount, gCount, gMoving, gMixed ? 0 : gDir, gMixed);
    }
    // La position qui vaut FERMÉ pour cet équipement : 0 ou 100, jamais autre chose. Transposition
    // directe du `position_closed` que SomfyExpose.cpp publie dans la fiche de découverte Home
    // Assistant -- même table de vérité, pour que les deux interfaces ne puissent pas se contredire.
    //
    // Deux inversions s'y combinent, et une seule n'est PAS dans cette liste :
    //   - le TYPE : le store banne (awning) est ouvert déplié, donc fermé à 0 ; tous les autres
    //     types sont fermés à 100 ;
    //   - flipPosition, le réglage « Inverser la position (% d'ouverture) », qui rebascule l'un ou
    //     l'autre cas -- le firmware le consulte exactement de la même façon.
    // En revanche flipCommands (« Inverse la direction des commandes ») n'intervient PAS, et ce
    // n'est pas un oubli. Il échange les commandes radio ÉMISES pour un moteur câblé à l'envers, et
    // transformCommand() est appliquée DEUX fois sur une commande partie de l'interface : une
    // première par sendCommand() en posant lastFrame.cmd, une seconde par processFrame() qui relit
    // cette trame (Somfy.cpp / SomfyDispatch.cpp). Les deux s'annulent, et la position suit donc
    // l'intention -- Haut mène toujours vers 0. Le firmware ne le consulte pas davantage pour
    // décider de position_open/position_closed. L'ajouter ici ferait compter à l'envers tout
    // équipement au câblage inversé, et brouillerait l'accord avec Home Assistant.
    closedPosition(shadeType, flipPosition) {
        return (this.awningShadeTypes.includes(shadeType) !== !!flipPosition) ? 0 : 100;
    }
    // Deux porteurs par colonne (en-tête desktop et onglet mobile, jamais visibles ensemble), donc
    // querySelectorAll et non get() : un seul calcul remplit les deux.
    // D'où les DEUX libellés : l'onglet mobile reçoit la forme courte (« 3/11 »), l'en-tête desktop
    // la phrase entière. Les onglets se partagent 375 px à deux, et « 128/128 geöffnet » à côté du
    // mot « ÉQUIPEMENTS » n'y tient pas -- mesuré, pas supposé : à texte long, l'onglet enflait et
    // décalait de 29 px le soulignement de .mobile-tabs::after, qui est posé à width:50% et suppose
    // donc deux onglets égaux. Le mot y est de toute façon redondant avec le libellé de l'onglet
    // juste à sa gauche, et des chiffres nus ne dépendent d'aucune langue. La phrase entière reste
    // dans le title.
    setColumnSummary(col, countText, shortText, moving, dir, mixed) {
        // Le titre énonce le compte complet même quand la pastille n'affiche pas de chiffre (1 seul
        // équipement en mouvement), et ajoute la mention du sens non unanime, qui est la seule chose
        // que l'absence de flèche ne dit pas d'elle-même.
        const title = moving > 0
            ? tr('IS_SUMMARY_MOVING').replace('{n}', moving) + (mixed ? ' — ' + tr('IS_SUMMARY_MIXED') : '')
            : '';
        document.querySelectorAll(`.column-summary[data-col="${col}"]`).forEach(el => {
            el.dataset.moving = String(moving);
            el.dataset.direction = String(dir);
            const inTab = !!el.closest('.tab-btn');
            const cnt = el.querySelector('.column-summary-count');
            if (cnt) {
                cnt.textContent = inTab ? shortText : countText;
                // La phrase entière reste accessible au survol et aux technologies d'assistance là
                // où l'affichage est abrégé -- et seulement là : côté groupes, où les deux formes
                // sont le même nombre, un title ne répéterait que ce qui est déjà lisible.
                cnt.title = (inTab && countText !== shortText) ? countText : '';
            }
            // Un « 1 » à côté d'une flèche solitaire n'apprend rien : le chiffre n'apparaît qu'à
            // partir de deux équipements en mouvement -- SAUF sans flèche (dir 0 : sens non unanime,
            // ou lame qui s'incline, qui n'a ni haut ni bas), où il reste seul à remplir la pastille.
            // Sans lui elle sortirait vide, un cercle sans rien dedans.
            const mc = el.querySelector('.sum-moving-count');
            if (mc) mc.textContent = (moving > 1 || (moving === 1 && dir === 0)) ? String(moving) : '';
            const btn = el.querySelector('.column-summary-moving');
            if (btn) { btn.title = title; btn.setAttribute('aria-label', title); }
        });
    }
    // Pendant un mouvement, le firmware émet shadeState à cadence soutenue, et pour chaque
    // équipement concerné : recalculer le récapitulatif à chaque trame reviendrait à relire tout le
    // DOM des cartes plusieurs fois par image. Un seul requestAnimationFrame coalesce la rafale en
    // un rendu par image -- ce que checkEmptyState(), lui, n'a pas besoin de faire (il n'est appelé
    // qu'au rendu d'une liste ou au changement de pièce).
    queueColumnSummary() {
        if (this._summaryRaf) return;
        this._summaryRaf = requestAnimationFrame(() => {
            this._summaryRaf = null;
            this.syncColumnSummary();
        });
    }
    // Clic sur le témoin de mouvement : amène la première carte en mouvement de cette colonne dans
    // la zone visible. C'est la raison d'être du témoin -- l'annonce sans le moyen d'y aller
    // laisserait l'utilisateur chercher dans la liste.
    scrollToMovingCard(col) {
        const sel = col === 'group'
            ? '#divGroupControls .somfyGroupCtl[data-moving="true"]'
            : '#divShadeControls .somfyShadeCtl:is([data-direction="1"],[data-direction="-1"],[data-tiltdirection="1"],[data-tiltdirection="-1"])';
        const card = [...document.querySelectorAll(sel)].find(c => c.style.display !== 'none');
        if (!card) return;
        const list = card.parentElement;
        if (!list) return;
        // getBoundingClientRect et non offsetTop : les listes ne sont pas position:relative, leur
        // offsetParent est donc un ancêtre lointain et offsetTop ne mesurerait pas ce qu'on croit.
        // Les 40 px de marge compensent le mask-image des listes, qui estompe leurs 35 premiers
        // pixels (cf. #divShadeControls dans main.css) : viser le bord franc ferait arriver la
        // carte à demi fondue.
        const top = card.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 40;
        list.scrollTo({
            top: Math.max(0, top),
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
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
    // `fromUser` : seuls les onglets eux-mêmes le passent (cf. index.html). Il commande le
    // défilement vers la carte en mouvement -- l'onglet mobile porte le témoin mais ne peut pas
    // porter son propre bouton (pas de bouton dans un bouton), c'est donc lui qui enchaîne les deux
    // gestes, ce qui tombe bien : sur mobile, aller voir ce qui bouge demande de toute façon de
    // basculer sur la colonne d'abord. Les appels automatiques (defaultMobileTab au chargement, et
    // après Appliquer dans DashboardPrefsOverlay -- cf. 40-general.js) ne passent rien et ne
    // déclenchent donc aucun défilement surprise.
    switchMobileTab(tab, fromUser) {
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
        // Après la bascule : la colonne visée doit être affichée pour que ses dimensions soient
        // mesurables (scrollToMovingCard lit des getBoundingClientRect).
        if (fromUser) this.scrollToMovingCard(tab === 'devices' ? 'shade' : 'group');
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
    // Liaison d'un répéteur sur la trame reçue pendant son écran d'attente. Celle d'une télécommande
    // à un équipement passe par shadeSetup.onFrame (tâche « Lier Télécommande »).
    _handleLinkFrame(frame) {
        const repeaterDiv = get('divLinkRepeater');
        if (!repeaterDiv) return;
        const overlay = ui.waitMessage(repeaterDiv);
        putJSON('/linkRepeater', { address: frame.address }, (err, data) => {
            overlay.remove();
            repeaterDiv.remove();
            if (err) ui.serviceError(err);
            else this.setRepeaterList(data);
        });
    }
    // Rafraîchit en direct le badge de signal d'une télécommande liée affichée dans la fenêtre des
    // télécommandes (tâche « remote »), depuis le RSSI de la trame : aucun aller-retour serveur.
    _updateLiveRemoteSignal(frame) {
        document.querySelectorAll(`#divShadeSetup .somfyLinkedRemote[data-remoteaddress="${frame.address}"], #divShadeSetupList .somfyLinkedRemote[data-remoteaddress="${frame.address}"]`).forEach(row => {
            const signalEl = row.querySelector('.linkedRemote-signal');
            if (signalEl) signalEl.outerHTML = this.remoteSignalHtml(frame.rssi, frame.address);
        });
        if (typeof shadeSetup !== 'undefined') shadeSetup.onRemoteHeard(frame);
    }
    procRemoteFrame(frame) {
        this.wizOnFrame(frame);
        if (typeof shadeSetup !== 'undefined') shadeSetup.onFrame(frame);
        const dt = new Date();
        frame.time = `${dt.getHours().fmt('00')}:${dt.getMinutes().fmt('00')}:${dt.getSeconds().fmt('00')}.${dt.getMilliseconds().fmt('000')}`;

        const spanRssi = get('spanRssi');
        if (spanRssi) spanRssi.innerHTML = frame.rssi;
        const spanCount = get('spanFrameCount');
        if (spanCount) spanCount.innerHTML = parseInt(spanCount.innerHTML || 0, 10) + 1;
        const spanLast = get('spanRadioLastFrame');
        if (spanLast) {
            const known = this.frameAddressName(frame.address);
            spanLast.textContent = `${frame.time.slice(0, 8)} · ${known ? known.name : frame.address} · ${frame.command || '?'}`;
        }

        this._handleLinkFrame(frame);
        this._updateLiveRemoteSignal(frame);

        this.frames.push(frame);
        this.frameCount++;
        while (this.frames.length > this.frameLimit) {
            this.frames.shift();
            this.frameBaseSeq++;
        }
        const now = Date.now();
        this.frameStamps.push(now);
        while (this.frameStamps.length && this.frameStamps[0] < now - 60000) this.frameStamps.shift();

        if (!this.isFrameLogVisible()) {
            this.frameLogStale = true;
            return;
        }
        this.updateFrameLogStatus();
        if (this.frameLogPaused) return;
        this.renderFrameSources();
        const list = get('divFrames');
        if (!list) return;
        if (this.frameMatches(frame)) {
            this.ensureFrameLogBound();
            list.insertAdjacentHTML('afterbegin', this.frameRowHtml(frame, this.frameBaseSeq + this.frames.length - 1, true));
            while (list.children.length > this.frameLimit) list.lastElementChild.remove();
            if (list.children.length === 1) this.updateFrameLogEmptyState();
        }
        else if (this.frames.length === 1) this.updateFrameLogEmptyState();
    }
    isFrameLogVisible() {
        return this.frameLogVisible;
    }
    showFrameLog() {
        this.frameLogVisible = true;
        const lim = get('spanLogLimit');
        if (lim) lim.textContent = this.frameLimit;
        this.ensureFrameLogBound();
        if (this.frameLogStale) {
            this.frameLogStale = false;
            this.renderFrameLog();
        }
        else {
            this.updateFrameLogStatus();
            this.updateFrameLogEmptyState();
            this.renderFrameSources();
        }
        this.startFrameRateTimer();
    }
    ensureFrameLogBound() {
        if (this.frameLogBound) return;
        const list = get('divFrames');
        if (!list) return;
        list.addEventListener('click', (evt) => {
            const row = evt.target.closest('.frame-row');
            if (row) this.toggleFrameDetails(row);
        });
        const sources = get('divLogSources');
        if (sources) sources.addEventListener('click', (evt) => {
            const btn = evt.target.closest('button');
            if (!btn) return;
            const addr = btn.dataset.addr;
            this.setFrameFilter(!addr || this.frameFilter === addr ? '' : addr);
        });
        this.frameLogBound = true;
    }
    startFrameRateTimer() {
        if (this.frameRateTimer) return;
        this.frameRateTimer = setInterval(() => {
            if (!this.isFrameLogVisible()) {
                clearInterval(this.frameRateTimer);
                this.frameRateTimer = null;
                return;
            }
            const now = Date.now();
            while (this.frameStamps.length && this.frameStamps[0] < now - 60000) this.frameStamps.shift();
            this.updateFrameLogStatus();
        }, 2000);
    }
    frameBySeq(seq) {
        const idx = seq - this.frameBaseSeq;
        return (idx >= 0 && idx < this.frames.length) ? this.frames[idx] : null;
    }
    frameMatches(frame) {
        if (this.frameValidOnly && !frame.valid) return false;
        if (!this.frameFilter) return true;
        const known = this.frameAddressName(frame.address);
        const hay = [frame.address, frame.command, frame.rcode, frame.encKey, known ? known.name : ''].join(' ').toLowerCase();
        return hay.indexOf(this.frameFilter) >= 0;
    }
    frameAddressName(address) {
        const addr = Number(address);
        for (const shade of (this.shades || [])) {
            if (Number(shade.remoteAddress) === addr) return { name: shade.name, own: true };
            if ((shade.linkedRemotes || []).some(r => Number(r.remoteAddress) === addr)) return { name: shade.name, own: false };
        }
        const group = (this.groups || []).find(g => Number(g.remoteAddress) === addr);
        return group ? { name: group.name, own: true } : null;
    }
    frameProtoLabel(proto) {
        return proto === 1 ? 'RTW' : proto === 2 ? 'RTV' : 'RTS';
    }
    frameCommandIcon(command) {
        switch (String(command || '').toLowerCase()) {
            case 'up':
            case 'step up':
                return 'svg-up';
            case 'down':
            case 'step down':
                return 'svg-down';
            case 'my':
                return 'svg-my';
            case 'my+up':
            case 'my+down':
            case 'my+up+down':
            case 'up+down':
            case 'toggle':
                return 'svg-toggle';
            case 'prog':
                return 'svg-pair';
            case 'sun flag':
                return 'vr-sunflag-o';
            case 'flag':
                return 'vr-sunflag-c';
            case 'sensor':
                return 'svg-sensorlight';
            case 'favorite':
                return 'svg-favori';
            case 'stop':
                return 'svg-stop';
            default:
                return 'svg-wave';
        }
    }
    rssiLevel(rssi) {
        if (typeof rssi !== 'number' || rssi <= -128) return 'unknown';
        return rssi > -70 ? 'good' : rssi > -85 ? 'medium' : 'bad';
    }
    frameRowHtml(frame, seq, isNew) {
        const known = this.frameAddressName(frame.address);
        const step = frame.stepSize ? `<sup>${escHtml(frame.stepSize)}</sup>` : '';
        const badge = frame.valid ? '' : `<span class="frame-badge-invalid">${tr('LOG_INVALID')}</span>`;
        const name = known
            ? `<span class="frame-addr-name${known.own ? ' is-own' : ''}">${escHtml(known.name)}</span>`
            : `<span class="frame-addr-name is-unknown">${tr('LOG_UNKNOWN')}</span>`;
        return `<div class="frame-row${isNew ? ' frame-row-new' : ''}" data-seq="${seq}" data-valid="${frame.valid}">
            <div class="frame-main">
                <span class="frame-cell frame-time" data-label="${escAttr(tr('RADIO_TIME'))}">${escHtml(frame.time)}</span>
                <span class="frame-cell frame-cmd" data-label="${escAttr(tr('RADIO_COMMAND'))}"><svg class="frame-cmd-icon"><use href="#${this.frameCommandIcon(frame.command)}"></use></svg><span class="frame-cmd-text">${escHtml(frame.command)}${step}</span>${badge}</span>
                <span class="frame-cell frame-addr" data-label="${escAttr(tr('RADIO_ADRESS'))}"><span class="frame-addr-value">${escHtml(frame.address)}</span>${name}</span>
                <span class="frame-cell frame-rssi sig-${this.rssiLevel(frame.rssi)}" data-label="${escAttr(tr('SCANFREQ_RSSI'))}">${escHtml(frame.rssi)}<em>${tr('UNIT_DBM')}</em></span>
                <span class="frame-cell frame-key" data-label="${escAttr(tr('RADIO_KEY'))}">${escHtml(frame.encKey)}</span>
                <span class="frame-cell frame-code" data-label="${escAttr(tr('RADIO_CODE'))}">${escHtml(frame.rcode)}</span>
                <span class="frame-cell frame-bits" data-label="${escAttr(tr('RADIO_BITS'))}">${escHtml(frame.bits)}<em>${this.frameProtoLabel(frame.proto)}</em></span>
                <span class="frame-cell frame-toggle"><svg><use href="#svg-arrowDown"></use></svg></span>
            </div>
            <div class="frame-details"></div>
        </div>`;
    }
    frameDetailsHtml(frame) {
        const pulses = Array.isArray(frame.pulses) ? frame.pulses : [];
        const duration = pulses.reduce((sum, p) => sum + p, 0) / 1000;
        const items = [
            [tr('PROTOCOL'), this.frameProtoLabel(frame.proto)],
            [tr('LOG_SYNC'), frame.sync],
            [tr('IS_DURATION'), `${duration.toFixed(1)} ms`]
        ];
        const grid = items.map(([label, value]) =>
            `<div class="frame-detail-item"><span class="frame-detail-label">${escHtml(label)}</span><span class="frame-detail-value">${escHtml(value)}</span></div>`).join('');
        return `<div class="frame-detail-grid">${grid}</div>
        <div class="frame-pulses-block">
            <div class="frame-pulses-head"><span>${tr('LOG_PULSES')}</span><span class="frame-pulses-count">${pulses.length}</span></div>
            <div class="frame-pulses">${escHtml(pulses.join(', '))}</div>
        </div>`;
    }
    toggleFrameDetails(row) {
        const box = row.querySelector('.frame-details');
        if (!box) return;
        const open = row.classList.toggle('expanded');
        if (!open) {
            box.innerHTML = '';
            return;
        }
        const frame = this.frameBySeq(parseInt(row.dataset.seq, 10));
        box.innerHTML = frame ? this.frameDetailsHtml(frame) : '';
    }
    renderFrameLog() {
        const list = get('divFrames');
        if (!list) return;
        this.ensureFrameLogBound();
        let html = '';
        for (let i = this.frames.length - 1; i >= 0; i--) {
            if (this.frameMatches(this.frames[i])) html += this.frameRowHtml(this.frames[i], this.frameBaseSeq + i, false);
        }
        list.innerHTML = html;
        this.updateFrameLogStatus();
        this.updateFrameLogEmptyState();
        this.renderFrameSources();
    }
    renderFrameSources() {
        const box = get('divLogSources');
        if (!box) return;
        const seen = new Map();
        for (const f of this.frames) {
            const e = seen.get(f.address) || { address: f.address, count: 0 };
            e.count++;
            e.rssi = f.rssi;
            e.time = f.time;
            seen.set(f.address, e);
        }
        if (!seen.size) {
            box.innerHTML = `<p class="lg-src-empty">${tr('LOG_SRC_EMPTY')}</p>`;
            return;
        }
        const rows = [...seen.values()].sort((a, b) => b.count - a.count).map(e => {
            const known = this.frameAddressName(e.address);
            const on = this.frameFilter === String(e.address);
            const kind = known ? `${tr(known.own ? 'LOG_SRC_OWN' : 'LOG_SRC_LINKED')} · ` : '';
            return `<button type="button" class="lg-src-item${on ? ' on' : ''}${known ? '' : ' unk'}" data-addr="${escAttr(e.address)}">
                <svg><use href="#svg-remote"></use></svg>
                <div><b>${known ? escHtml(known.name) : tr('LOG_UNKNOWN')}</b><small>${kind}${escHtml(e.address)}</small><small>${e.count} ${tr('LOG_FRAMES')} · ${escHtml(String(e.time).slice(0, 8))}</small></div>
                <span class="lg-sig sig-${this.rssiLevel(e.rssi)}">${escHtml(e.rssi)}<em>${tr('UNIT_DBM')}</em></span>
            </button>`;
        }).join('');
        box.innerHTML = rows + (this.frameFilter ? `<button type="button" class="lg-src-all">${tr('LOG_SRC_ALL')}</button>` : '');
    }
    updateFrameLogStatus() {
        const count = get('spanLogCount');
        if (count) count.textContent = this.frameCount;
        const rate = get('spanLogRate');
        if (rate) rate.textContent = this.frameStamps.length;
        const last = this.frames.length ? this.frames[this.frames.length - 1] : null;
        const rssi = get('spanLogRssi');
        if (rssi) {
            rssi.textContent = last ? last.rssi : '--';
            rssi.className = `log-metric-value sig-${last ? this.rssiLevel(last.rssi) : 'unknown'}`;
        }
        const state = get('divLogLiveState');
        const text = get('spanLogLiveText');
        if (state && text) {
            const online = (typeof sockIsOpen === 'undefined') || sockIsOpen;
            const mode = this.frameLogPaused ? 'paused' : online ? 'live' : 'offline';
            const key = mode === 'paused' ? 'LOG_PAUSED' : mode === 'offline' ? 'LOG_OFFLINE' : 'LOG_LIVE';
            state.dataset.state = mode;
            text.setAttribute('tr', key);
            text.textContent = tr(key);
        }
    }
    updateFrameLogEmptyState() {
        const list = get('divFrames');
        const empty = get('divFramesEmpty');
        if (!list || !empty) return;
        const shown = list.children.length;
        list.style.display = shown ? '' : 'none';
        empty.style.display = shown ? 'none' : '';
        if (shown) return;
        const titleKey = this.frames.length ? 'LOG_NOMATCH_TITLE' : 'LOG_EMPTY_TITLE';
        const descKey = this.frames.length ? 'LOG_NOMATCH_DESC' : 'LOG_EMPTY_DESC';
        const title = get('spanFramesEmptyTitle');
        const desc = get('spanFramesEmptyDesc');
        if (title) {
            title.setAttribute('tr', titleKey);
            title.textContent = tr(titleKey);
        }
        if (desc) {
            desc.setAttribute('tr', descKey);
            desc.textContent = tr(descKey);
        }
    }
    setFrameFilter(value) {
        const raw = String(value || '');
        this.frameFilter = raw.trim().toLowerCase();
        const fld = get('fldLogFilter');
        if (fld && fld.value !== raw) fld.value = raw;
        const clear = get('btnLogFilterClear');
        if (clear) clear.style.display = this.frameFilter ? '' : 'none';
        this.renderFrameLog();
    }
    toggleFrameValidOnly() {
        this.frameValidOnly = !this.frameValidOnly;
        const btn = get('btnLogValidOnly');
        if (btn) btn.classList.toggle('active', this.frameValidOnly);
        this.renderFrameLog();
    }
    toggleFrameLogPause() {
        this.frameLogPaused = !this.frameLogPaused;
        const btn = get('btnLogPause');
        if (btn) btn.classList.toggle('active', this.frameLogPaused);
        const icon = get('svgLogPause');
        if (icon && icon.firstElementChild) icon.firstElementChild.setAttribute('href', this.frameLogPaused ? '#svg-play' : '#svg-stop');
        const label = get('spanLogPause');
        if (label) {
            const key = this.frameLogPaused ? 'BT_RESUME' : 'BT_PAUSE';
            label.setAttribute('tr', key);
            label.textContent = tr(key);
        }
        if (this.frameLogPaused) this.updateFrameLogStatus();
        else this.renderFrameLog();
    }
    clearFrames() {
        this.frames = [];
        this.frameStamps = [];
        this.frameCount = 0;
        this.frameBaseSeq = 0;
        const list = get('divFrames');
        if (list) list.innerHTML = '';
        this.updateFrameLogStatus();
        this.updateFrameLogEmptyState();
        this.renderFrameSources();
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
        const frames = this.frames.filter(f => this.frameMatches(f));
        if (typeof navigator.clipboard !== 'undefined')
            navigator.clipboard.writeText(this.JSONPretty(frames, 2));
        else {
            let dummy = document.createElement('textarea');
            document.body.appendChild(dummy);
            dummy.value = this.JSONPretty(frames, 2);
            dummy.focus();
            dummy.select();
            document.execCommand('copy');
            document.body.removeChild(dummy);
        }
    }
    // La télécommande ne se lit plus dans un sélecteur : elle s'ouvre SUR une cible, dont seuls le
    // type et l'identifiant sont mémorisés. Tout le reste (adresse, longueur de trame, type
    // d'équipement, drapeaux) est relu dans this.shades/this.groups à chaque usage, pour ne jamais
    // commander d'après un instantané périmé par un rafraîchissement de liste.
    // Renvoie null si la cible a disparu entre-temps -- suppression de l'équipement pendant que la
    // télécommande est ouverte : tous les appelants s'arrêtent alors sans rien émettre.
    vrTarget() {
        const t = this._vrTarget;
        if (!t) return null;
        if (t.type === 'group') {
            const g = (this.groups || []).find(x => x.groupId === t.id);
            return g ? { type: 'group', id: t.id, name: g.name, address: g.remoteAddress, bitLength: g.bitLength, group: g } : null;
        }
        const s = (this.shades || []).find(x => x.shadeId === t.id);
        return s ? { type: 'shade', id: t.id, name: s.name, address: s.remoteAddress, bitLength: s.bitLength, shadeType: s.shadeType, shade: s } : null;
    }
    // Le panneau de la télécommande est un bloc unique (#divVRContent) qui vit dans #divVRHome et
    // qu'on DÉPLACE dans l'overlay le temps de l'ouverture, plutôt que de le cloner : le clone
    // dupliquerait une quinzaine d'identifiants, et tous les get() de ce fichier tomberaient sur
    // l'exemplaire masqué. Le déplacement préserve aussi la traduction statique des attributs `tr`
    // et l'écouteur clavier posé une fois pour toutes par bindVRKeyboard().
    // Contrepartie : si l'overlay disparaît sans que le panneau soit rentré, il est perdu jusqu'au
    // prochain rechargement. Or trois des chemins de sortie ne transmettent AUCUN callback --
    // le clic sur le fond et la poignée mobile appellent requestCloseOverlay(overlay) tout court,
    // et clearOverlays() (changement d'onglet) fait un el.remove() sec. D'où la surveillance du
    // conteneur plutôt qu'un branchement chemin par chemin : le retour au bercail suit la
    // disparition réelle du noeud, quelle qu'en soit la cause.
    // get() passe par document.getElementById() : il ne trouve RIEN dès que le panneau voyage
    // dans un overlay pas encore inséré, ou déjà retiré. Or c'est précisément dans ces deux
    // instants qu'on a besoin de lui -- au réglage avant ouverture, et au retour après fermeture.
    // D'où cette référence, prise une fois : le noeud est statique (index.html), rien ne le
    // recrée jamais. Les champs internes se cherchent à partir de lui, et non par identifiant
    // global, pour la même raison.
    vrContent() {
        if (!this._vrContent) this._vrContent = get('divVRContent');
        return this._vrContent;
    }
    vrEl(id) {
        const content = this.vrContent();
        return content ? content.querySelector('#' + id) : null;
    }
    restoreVRHome() {
        const home = get('divVRHome');
        const content = this.vrContent();
        if (home && content && content.parentElement !== home) home.appendChild(content);
        this._vrTarget = null;
    }
    // Contrepartie visible à un appui : une commande de pas déplace réellement l'équipement, mais
    // la télécommande n'affichait rien et la carte qui l'aurait montré est cachée derrière la
    // modale. On appuyait, quelque chose se passait dans le monde réel, et l'écran ne bronchait pas.
    // Un GROUPE n'a pas de position -- elle n'existe que sur SomfyShade -- la ligne reste alors
    // vide, et la règle :empty de la CSS retire son séparateur.
    // `root` sert à l'ouverture, où l'overlay n'est pas encore inséré : querySelector ne le
    // trouverait pas et la ligne resterait vide jusqu'au premier évènement socket.
    updateVRPosition(shade, root) {
        const ov = root || document.querySelector('.vr-overlay');
        const el = ov ? ov.querySelector('.vr-target-pos') : null;
        if (!el) return;
        if (!shade || typeof shade.position !== 'number') { el.textContent = ''; return; }
        if (this.dryContactShadeTypes.includes(this.shadeTypeOf(shade))) {
            el.textContent = this.shadeStateLabel(shade.position, shade.flipPosition, this.shadeVocabOf(shade));
            return;
        }
        let txt = `${tr('POS_SHORT')} ${Math.round(shade.position)}%`;
        if (shade.tiltType) txt += ` ${tr('TILT_SHORT')} ${Math.round(shade.tiltPosition)}%`;
        el.textContent = txt;
    }
    // Fermeture SUBIE (la cible vient de disparaître), à distinguer des sorties décidées par
    // l'utilisateur : pas de passage par requestCloseOverlay(), il n'y a rien à confirmer et rien
    // à retenir. Le panneau rentre par la surveillance posée à l'ouverture.
    closeVirtualRemote() {
        const ov = document.querySelector('.vr-overlay');
        if (ov) closeOverlay(ov);
        else this.restoreVRHome();
    }
    openVirtualRemote(type, id) {
        const content = this.vrContent();
        if (!content || document.querySelector('.vr-overlay')) return;
        this._vrTarget = { type: type, id: parseInt(id, 10) };
        const info = this.vrTarget();
        if (!info) { this._vrTarget = null; return; }
        // .modal-overlay -- carte centrée sur fond assombri plein écran, feuille glissée par le bas
        // sur mobile. Son plafond de 90vh est levé pour cette carte-ci (cf. main.css) : sans quoi
        // la télécommande 80 bits, même compactée, redéborde de 17 px sur un écran de 667 et de
        // 40 px sur un 640. La carte se dimensionne alors à son contenu et ne prend toute la
        // hauteur que sur les petits écrans, là où elle en a besoin.
        // En-tête écrit ici plutôt que par modalHeader()/overlayHeader() : le premier passe en
        // colonne centrée sur mobile (badge de 60 px, deux lignes de texte), le second pose un
        // menu déroulant dont la télécommande n'a que faire, et aucun des deux ne permet la
        // réduction au seul nom de la cible.
        // Pas de bouton de fermeture en pied ni de poignée de glissement : le premier coûtait
        // 55 px de hauteur, la seconde 30, pour deux chemins de sortie de plus alors que la croix
        // et le fond cliquable au-dessus de la feuille suffisent.
        // data-radio est recopié du panneau sur l'overlay : c'est le badge de l'en-tête qui porte
        // désormais le témoin radio, et il n'existe que le temps de l'ouverture.
        let div = document.createElement('div');
        div.className = 'modal-overlay vr-overlay';
        div.setAttribute('data-radio', content.getAttribute('data-radio') || 'on');
        div.innerHTML = `
        <div class="message-content vr-overlay-content">
        <div class="overlayHeader vr-overlay-header">
        <div class="overlayHeader-block">
        <div class="overlayHeader-badge">
        <svg><use href="#${info.type === 'group' ? 'svg-group' : 'svg-remote'}"></use></svg>
        </div>
        <div class="overlayHeader-texts">
        <span class="overlayHeader-title">${tr('SUBTAB_VIRTUAL_REMOTE_L')}</span>
        <span class="overlayHeader-subtitle"><span class="vr-target-name"></span><span class="vr-target-pos"></span></span>
        </div>
        </div>
        <div class="overlayHeader-right">
        <div close title="${tr('BT_CLOSE')}"><svg><use href="#svg-closeOverlay"></use></svg></div>
        </div>
        </div>
        <div class="overlay-scroll-content"></div>
        </div>`;
        // Le nom de la cible est posé en textContent et non injecté dans le gabarit : c'est la
        // seule chaîne de cet en-tête qui vienne de l'utilisateur.
        const name = div.querySelector('.vr-target-name');
        if (name) name.textContent = info.name;
        this.updateVRPosition(info.shade, div);
        if (div.getAttribute('data-radio') === 'off') {
            const badge = div.querySelector('.overlayHeader-badge');
            if (badge) badge.setAttribute('title', tr('RADIO_DISABLED'));
        }
        // Mise en page et champs réglables AVANT le déplacement : get() passe par
        // document.getElementById(), qui ne voit rien dans un overlay pas encore inséré. Réglé
        // pendant que le panneau est encore chez lui plutôt qu'après shOverlay(), pour ne pas
        // laisser paraître l'agencement de la cible précédente le temps de l'animation d'entrée.
        this.syncVRLayout();
        this.loadVRState();
        div.querySelector('.overlay-scroll-content').appendChild(content);
        const obs = new MutationObserver(() => {
            if (div.isConnected) return;
            obs.disconnect();
            this.restoreVRHome();
        });
        obs.observe(get('divContainer'), { childList: true });
        shOverlay(div);
    }
    sendVRCommand(el, evt) {
        if (!isPrimaryPress(evt)) return;
        const info = this.vrTarget();
        if (!info) return;
        let o = {
            type: info.type,
            address: info.address,
            cmd: el.getAttribute('data-cmd')
        };
        if (info.type === 'group') o.groupId = info.id;
        else {
            o.shadeId = info.id;
            o.shadeType = info.shadeType;
        }
        // Lecture explicite des trois champs réglables, et seulement pour les commandes qui les
        // transportent. Remplace un ui.fromElement(el.parentElement.parentElement, o) qui pariait
        // sur la profondeur du bouton dans le DOM pour trouver les champs liés -- le bon ancêtre par
        // hasard pour Sensor et les flèches Pas, un conteneur sans aucun champ pour les douze autres
        // boutons. Types identiques à ceux que produisait ui.getValue() : booléens et entier.
        if (o.cmd === 'Sensor') {
            const cbSunny = this.vrEl('cbSunny'), cbWindy = this.vrEl('cbWindy');
            if (cbSunny) o.sunny = cbSunny.checked;
            if (cbWindy) o.windy = cbWindy.checked;
        }
        else if (o.cmd === 'StepUp' || o.cmd === 'StepDown') {
            const slider = this.vrEl('vrslidStepSize');
            if (slider) o.stepSize = parseInt(slider.value, 10);
        }
        let fnVRError = (err) => { if (err) ui.serviceError(err); };
        // L'inclinaison passe par une route à elle, /tiltCommand, et ne se répète PAS : il n'existe
        // pas d'équivalent de /repeatCommand pour elle, et un appui maintenu n'aurait aucun sens sur
        // un réglage de lames. Une pression, une émission.
        // Sur les ondes ce sont les mêmes trames Up/Down/My que la course -- il n'existe aucune
        // commande RTS « incliner » -- seul le nombre de répétitions les distingue, et uniquement
        // pour tiltType = tiltmotor (TILT_REPEATS = 15, cf. SomfyShade::sendTiltCommand). Pour les
        // autres types la trame est identique et c'est le suivi de position du boîtier qui change.
        if (el.getAttribute('data-tilt') === 'true') {
            if (info.type !== 'shade') return;
            logger.debug('Virtual remote tilt command:', o);
            this.pulseVRBadge();
            // Le « my » d'inclinaison ne passe PAS par la commande My : sendTiltCommand(My) fige les
            // lames où elles sont sans jamais lire myTiltPos -- l'inverse de ce qu'on attend d'un
            // favori. On vise donc explicitement la position enregistrée, par la forme `target` de
            // la route, qui passe par moveToTiltTarget() et ne touche pas à la course. C'est la
            // seule chose que le centre de la molette ne sache pas faire, lui qui déplace les deux
            // ensemble (moveToMyPosition, cf. SomfyPositioning.cpp).
            // myTiltPos circule déjà transformé (transformPosition côté firmware, dans toJSON comme
            // dans emitState) et la route le retransforme à l'entrée : l'aller-retour est neutre,
            // transformPosition étant une involution.
            if (o.cmd === 'My') {
                const my = info.shade.myTiltPos;
                if (typeof my !== 'number' || my < 0) return;
                somfy.sendTiltCommand(info.id, my, fnVRError);
            }
            else somfy.sendTiltCommand(info.id, o.cmd, fnVRError);
            return;
        }
        logger.debug('Virtual remote command:', o);
        this.pulseVRBadge();
        let fnRepeatCommand = (err, shade) => {
            if (this.btnTimer) {
                clearTimeout(this.btnTimer);
                this.btnTimer = null;
            }
            if (err) {
                ui.serviceError(err);
                return;
            }
            if (mouseDown) {
                if (o.cmd === 'Sensor')
                    somfy.sendSetSensor(o, fnVRError);
                else if (o.type === 'group')
                    somfy.sendGroupRepeat(o.groupId, o.cmd, null, fnRepeatCommand, o.stepSize);
                else
                    somfy.sendCommandRepeat(o, fnRepeatCommand);
            }
        }
        o.command = o.cmd;
        if (o.cmd === 'Sensor') {
            somfy.sendSetSensor(o, fnVRError);
        }
        else if (o.type === 'group')
            somfy.sendGroupCommand(o.groupId, o.cmd, null, (err, group) => { fnRepeatCommand(err, group); }, o.stepSize);
        else
            somfy.sendCommand(o, (err, shade) => { fnRepeatCommand(err, shade); });
    }
    sendSetSensor(obj, cb) {
        putJSON('/setSensor', obj, (err, device) => {
            if (typeof cb === 'function') cb(err, device);
        });
    }
    // Un équipement impulsionnel (garage/portail 1-bouton, contact sec 1-bouton -- cf.
    // toggleShadeTypes) n'a ni position ni mémoire My : ses flèches et son bouton My n'ont rien à
    // commander. La molette reste néanmoins en place -- c'est sa bordure qui porte le témoin radio
    // -- et son centre devient la bascule, seul organe utile pour ce type d'équipement.
    // Surtout pas noMyShadeTypes ici : le contact sec 2-boutons y figure alors que Haut et Bas sont
    // ses SEULS ordres utiles (My est coupé net par le répartiteur). Le ranger parmi les
    // impulsionnels lui retirait les flèches et ne lui laissait qu'un centre muet en 56 bits.
    // Pour un GROUPE, on suit la convention déjà retenue pour les plannings (cf.
    // groupMyIncompatible) : les commandes de position restent accessibles dès qu'au moins un
    // membre les gère. Un groupe n'est donc impulsionnel que si TOUS ses membres le sont.
    vrIsImpulse(info) {
        if (!info) return false;
        if (info.type === 'group') {
            const linked = info.group.linkedShades || [];
            return linked.length > 0 && linked.every(s => this.toggleShadeTypes.includes(s.shadeType));
        }
        return this.toggleShadeTypes.includes(info.shadeType);
    }
    // Le type d'un équipement selon la source : la liste `shades` le nomme `shadeType`, l'évènement
    // socket `type` (cf. procShadeState). Un état socket partiel peut ne porter ni l'un ni l'autre,
    // d'où le repli sur le cache.
    shadeTypeOf(shade) {
        if (!shade) return undefined;
        if (typeof shade.shadeType === 'number') return shade.shadeType;
        if (typeof shade.type === 'number') return shade.type;
        const full = (this.shades || []).find(s => s.shadeId === shade.shadeId);
        return full ? full.shadeType : undefined;
    }
    // Un contact sec n'a pas de pourcentage : sa position ne prend que deux valeurs, qui sont
    // l'état du relais (`currentPos == 100` côté firmware, cf. SomfyGpio::setGPIOs). On dit donc
    // Marche ou Arrêt là où les autres équipements affichent « POS: 60% ».
    // flipPosition joue ici comme sur l'icône : le firmware ne le consulte que pour la
    // sérialisation et la découverte Home Assistant (SomfyExpose.cpp), jamais pour piloter la
    // broche -- c'est donc bien l'état AFFICHÉ qu'il inverse, et l'inversion appartient à l'interface.
    shadeStateLabel(position, flipPosition, vocab) {
        const p = flipPosition ? 100 - position : position;
        const pair = this.stateVocabKeys[vocab] || this.stateVocabKeys[0];
        return tr(p >= 50 ? pair[0] : pair[1]);
    }
    // Le vocabulaire est une propriété de CONFIGURATION : emitState ne le transporte pas, et c'est
    // volontaire -- il ne change pas d'un évènement à l'autre. Un état socket seul ne le porte donc
    // pas, d'où le repli sur le cache `shades`, alimenté par /shades (toJSON, qui lui l'inclut) et
    // tenu à jour par procShadeState.
    // Dans l'éditeur, le sélecteur prime sur la valeur enregistrée : changer le vocabulaire doit
    // se voir tout de suite sur la ligne d'état, sans passer par un enregistrement -- même
    // principe que l'icône d'ambiance et le reste de onShadeTypeChanged.
    editorVocab(shade) {
        const el = get('selShadeStateVocab');
        if (el && el.value !== '') return parseInt(el.value, 10) || 0;
        return this.shadeVocabOf(shade);
    }
    shadeVocabOf(shade) {
        if (!shade) return 0;
        if (typeof shade.stateVocab === 'number') return shade.stateVocab;
        const full = (this.shades || []).find(s => s.shadeId === shade.shadeId);
        return (full && typeof full.stateVocab === 'number') ? full.stateVocab : 0;
    }
    // Ligne de haut de l'éditeur (#labelPosContainer, dans le bloc Contrôle) : « Position actuelle
    // ... 60 % » pour un équipement positionné, « État ... Marche » pour un contact sec. Le « % »
    // vit hors de #valPos dans le gabarit -- d'où le span dédié qu'on masque plutôt qu'un texte
    // recomposé. L'attribut `tr` suit le texte, pour le prochain passage du traducteur.
    applyEditorStateRow(shadeType) {
        const row = get('labelPosContainer');
        if (!row) return;
        const isDry = this.dryContactShadeTypes.includes(shadeType);
        const title = row.querySelector('.editDevice-info-title');
        if (title) {
            const cle = isDry ? 'IS_STATE' : 'DEVICE_POS';
            title.setAttribute('tr', cle);
            title.innerText = tr(cle);
        }
        const unit = get('valPosUnit');
        if (unit) unit.style.display = isDry ? 'none' : '';
    }
    setEditorPosValue(shadeType, position, flipPosition, vocab) {
        const val = get('valPos');
        if (!val) return;
        const isDry = this.dryContactShadeTypes.includes(shadeType);
        val.innerText = isDry ? this.shadeStateLabel(position, flipPosition, vocab) : position;
        const track = get('barPosTrack'), bar = get('barPos');
        if (track) track.style.display = isDry ? 'none' : '';
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, position || 0))}%`;
    }
    setEditorTiltValue(tilt) {
        const val = get('valTilt'), bar = get('barTilt');
        if (val) val.innerText = tilt;
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, tilt || 0))}%`;
    }
    // Un contact sec ne connaît que deux ou trois commandes (cf. le tableau de rstrouse : Toggle
    // pour le 1-bouton, Up/Down pour le 2-boutons). Les appuis combinés (MyUp, MyDown, UpDown,
    // MyUpDown) et la trame Sensor qui porte Soleil/Vent ne font pas partie de son vocabulaire :
    // la trame PART bien sur les ondes -- SomfyRemote::sendCommand() émet AVANT d'appeler
    // processFrame(), dont les gardes drycontact ne sautent que la comptabilité interne -- mais
    // elle ne rencontre personne. On retire donc les boutons plutôt que de laisser croire.
    // Prog reste : ce n'est pas une commande de pilotage mais l'appairage, sans lequel on ne peut
    // plus associer ni dissocier l'équipement. La molette reste aussi -- ses flèches ne commandent
    // rien pour un 1-bouton, mais elle porte le témoin radio et tient l'espace.
    // Même convention de groupe que vrIsImpulse : tous les membres, ou aucun.
    vrIsDryContact(info) {
        if (!info) return false;
        if (info.type === 'group') {
            const linked = info.group.linkedShades || [];
            return linked.length > 0 && linked.every(s => this.dryContactShadeTypes.includes(s.shadeType));
        }
        return this.dryContactShadeTypes.includes(info.shadeType);
    }
    // Source unique des deux attributs qui pilotent la mise en page de la télécommande. Portés par
    // #divVRContent et non par le panneau de la sous-page : c'est ce bloc-là qui voyage dans
    // l'overlay, et la CSS doit le suivre.
    // Rappelée à chaque rafraîchissement de liste (setShadesList/setGroupsList) : la longueur de
    // trame ou le type d'un équipement peuvent changer pendant que la télécommande est ouverte.
    // Ne recharge PAS les champs réglables au passage -- ils composent une commande à émettre, cf.
    // loadVRState().
    syncVRLayout() {
        const content = this.vrContent();
        if (!content) return;
        const info = this.vrTarget();
        if (!info) {
            if (this._vrTarget) this.closeVirtualRemote();
            return;
        }
        content.setAttribute('data-bitlength', info.bitLength);
        const impulse = this.vrIsImpulse(info);
        content.setAttribute('data-kind', impulse ? 'impulse' : 'standard');
        content.setAttribute('data-drycontact', this.vrIsDryContact(info) ? 'yes' : 'no');
        this.setVRCenterButton(impulse, this.vrIsMoving(info.shade));
        this.setVRSunFlag((info.shade || info.group).flags);
        this.setVRSunSensor(!!(info.shade || info.group).sunSensor);
        content.setAttribute('data-tilt', this.vrTiltUsable(info) ? 'yes' : 'no');
        this.setVRTiltMy(info.shade);
        this.setVRTiltLabels();
    }
    // Soleil/Vent et Taille du pas repartent de l'état de la cible À CHAQUE OUVERTURE : sur la page
    // persistante d'autrefois, ils restaient tels quels d'un équipement à l'autre et l'on envoyait
    // « il y a du vent » avec un réglage hérité de l'écran précédent.
    // Soleil/Vent reflètent l'état réel de l'équipement (bits Windy 0x10 et Sunny 0x20 de `flags`,
    // cf. somfy_flags_t dans src/somfy/Somfy.h). Un GROUPE n'en a pas : p_sunny/p_windy
    // n'existent que sur SomfyShade et ne sont posés qu'à la réception d'une trame Sensor -- les
    // cases repartent donc décochées.
    // Le curseur, lui, revient à sa valeur d'usine : il porte le NOMBRE DE PAS de la commande, un
    // paramètre d'appui et non une propriété d'équipement. À ne pas confondre avec shade.stepSize
    // (100 par défaut), qui est l'étalonnage du pas côté équipement et n'a rien à faire dans une
    // échelle 1-127.
    // Appelée à l'ouverture UNIQUEMENT, et volontairement pas sur l'évènement socket shadeState :
    // ces trois champs composent une commande À ÉMETTRE, les écraser sous les doigts serait pire
    // que de les laisser figés.
    loadVRState() {
        const info = this.vrTarget();
        const cbSunny = this.vrEl('cbSunny'), cbWindy = this.vrEl('cbWindy'), slider = this.vrEl('vrslidStepSize');
        const flags = (info && info.type === 'shade') ? (info.shade.flags || 0) : 0;
        if (cbSunny) cbSunny.checked = (flags & 0x20) !== 0;
        if (cbWindy) cbWindy.checked = (flags & 0x10) !== 0;
        if (slider) {
            slider.value = slider.getAttribute('value') || 1;
            syncSliderProgress(slider);
            const span = this.vrEl('vrspanStepSize');
            if (span) span.innerText = slider.value;
        }
    }
    // Le centre de la molette porte trois rôles, et c'est le SEUL organe d'arrêt : le bouton Stop
    // qui occupait sa propre rangée a disparu avec ce changement.
    //
    // La COMMANDE ne dépend que du type d'équipement, jamais de l'état :
    //   - impulsionnel (cf. noMyShadeTypes) -> `toggle`. Surtout pas `my` : pour le contact sec
    //     2-boutons, My est un non-événement explicite côté firmware (`if(shadeType ==
    //     drycontact2) return;`, dans le dispatch ET dans SomfyShade::sendCommand) -- le bouton
    //     deviendrait muet ;
    //   - positionné -> `my`. Et non `Stop` (0xF1), qui n'existe qu'en 80 bits alors que My arrête
    //     un équipement en mouvement quelle que soit la longueur de trame.
    //
    // Seule l'APPARENCE suit l'état. Ce n'est pas un artifice d'interface : pour un 1-bouton, le
    // firmware traite déjà My exactement comme Toggle (SomfyDispatch.cpp, case My sous isToggle()
    // -- mot pour mot le corps du case Toggle), c'est-à-dire « arrêt si ça bouge, bascule sinon ».
    // Et pour un équipement positionné, My arrête aussi. Le libellé ne fait donc que dire ce qui va
    // réellement se passer.
    // Un contact sec ne bouge jamais (ni direction ni position) : il reste sur son libellé de repos.
    // L'attribut `tr` est mis à jour EN PLUS du title : le title sert tout de suite, l'attribut
    // sert au prochain passage du traducteur (changement de langue, cf. translator.init()).
    setVRCenterButton(impulse, moving) {
        const btn = this.vrEl('divVRCenter');
        const icon = this.vrEl('divVRCenterIcon');
        if (!btn || !icon) return;
        const cle = moving ? 'BT_STOP' : (impulse ? 'VR_TOGGLE' : 'BT_MY');
        btn.setAttribute('data-cmd', impulse ? 'toggle' : 'my');
        btn.setAttribute('tr', cle);
        btn.setAttribute('title', tr(cle));
        icon.setAttribute('href', moving ? '#svg-toggleHand' : (impulse ? '#svg-toggle' : '#svg-my'));
    }
    // Un seul bouton pour les deux commandes RTS de l'indicateur soleil, là où il y en avait deux
    // côte à côte : SunFlag (0x9) l'active, Flag (0xA) le désactive. Le bouton porte donc l'ÉTAT
    // COURANT -- accentué quand l'indicateur est actif -- et la commande qu'il enverra est celle
    // qui change cet état. Bit 0x01 de `flags`, le même que lisent les cartes (setShadesList,
    // setGroupsList) et procGroupState.
    // L'icône change en même temps que la couleur : la couleur seule ne suffit pas à porter une
    // information, et l'infobulle annonce l'action, pas l'état.
    // Le capteur soleil est une CAPACITÉ DÉCLARÉE de l'équipement (bit SunSensor de `flags`, lu par
    // SomfyRemote::hasSunSensor()). Le firmware en tire déjà une règle asymétrique, qu'on reprend
    // telle quelle : « sunFlag/sunny seulement si hasSunSensor(), windy toujours » (cf. le
    // commentaire de publishFlags() dans Somfy.h). Sans capteur, l'indicateur soleil et la case
    // Soleil ne commandent rien ; le vent et le bouton Envoyer gardent leur sens.
    // Les cartes du tableau de bord masquent déjà leur bouton soleil dans ce cas -- la télécommande
    // était la seule à l'afficher quoi qu'il arrive.
    setVRSunSensor(has) {
        const content = this.vrContent();
        if (content) content.setAttribute('data-sunsensor', has ? 'yes' : 'no');
    }
    setVRSunFlag(flags) {
        const btn = this.vrEl('divVRSunFlag');
        const icon = this.vrEl('divVRSunFlagIcon');
        if (!btn || !icon) return;
        const on = ((flags || 0) & 0x01) === 0x01;
        const cle = on ? 'VR_SUN_FLAG_OFF' : 'VR_SUN_FLAG_ON';
        btn.setAttribute('data-on', on ? 'true' : 'false');
        btn.setAttribute('data-cmd', on ? 'Flag' : 'SunFlag');
        btn.setAttribute('tr', cle);
        btn.setAttribute('title', tr(cle));
        icon.setAttribute('href', on ? '#vr-sunflag-o' : '#vr-sunflag-c');
    }
    // L'inclinaison n'a de bouton que là où il ajoute quelque chose :
    //   - jamais pour un GROUPE : /tiltCommand est par équipement, il n'existe pas d'équivalent ;
    //   - jamais pour `none` (0), évidemment ;
    //   - jamais pour `tiltonly` (3) : le dispatch y redirige DÉJÀ Up/Down vers l'inclinaison
    //     (SomfyDispatch.cpp, `if(tiltType == tiltonly && !internal) p_tiltTarget(...)`), la molette
    //     incline donc ces équipements sans qu'on ait à faire quoi que ce soit.
    // Restent tiltmotor (1), integrated (2) et euromode (4).
    vrTiltUsable(info) {
        if (!info || info.type !== 'shade') return false;
        const t = parseInt(info.shade.tiltType, 10) || 0;
        return t === 1 || t === 2 || t === 4;
    }
    // Les trois boutons portent le même sens que ceux de la molette : sans contexte, un lecteur
    // d'écran annoncerait deux « Ouvrir » identiques dans le même panneau. Le nom est donc composé
    // à partir du libellé de la rangée, plutôt que d'ajouter trois clés de traduction pour un
    // texte que l'on sait déjà écrire.
    setVRTiltLabels() {
        const pre = tr('OPT_PAGE_TILT');
        [['divVRTiltUp', 'BT_OPEN'], ['divVRTiltMy', 'BT_MY'], ['divVRTiltDown', 'BT_CLOSE']].forEach(([id, cle]) => {
            const el = this.vrEl(id);
            if (el) el.setAttribute('title', `${pre} · ${tr(cle)}`);
        });
    }
    // Le favori d'inclinaison n'est pas toujours enregistré : myTiltPos vaut -1 tant qu'un appui
    // long (35 répétitions, cf. SETMY_REPEATS) ne l'a pas posé. Sans lui le bouton n'aurait nulle
    // part où aller.
    setVRTiltMy(shade) {
        const content = this.vrContent();
        if (!content) return;
        const my = shade ? shade.myTiltPos : -1;
        content.setAttribute('data-tiltmy', (typeof my === 'number' && my >= 0) ? 'yes' : 'no');
    }
    // Un équipement bouge s'il se déplace OU s'il s'incline (cf. SomfyShade::isIdle() côté
    // firmware, qui combine les deux). Un GROUPE n'a ni l'un ni l'autre : son centre reste fixe.
    vrIsMoving(shade) {
        if (!shade) return false;
        return (shade.direction || 0) !== 0 || (shade.tiltDirection || 0) !== 0;
    }
    // Les boutons sont des div porteuses de role="button" et tabindex="0" (cf. index.html) : le
    // navigateur ne leur accorde donc pas l'activation clavier native d'un <button>, il faut la
    // poser. Délégué sur #divVRContent -- le bloc qui voyage dans l'overlay -- plutôt que sur la
    // sous-page qu'il quitte, et plutôt que 16 onkeydown en ligne.
    // Espace déclenche le défilement de la page par défaut, d'où le preventDefault.
    // Une activation clavier n'envoie qu'UNE commande : la répétition est conditionnée à
    // `mouseDown` (cf. 10-core-utils.js), qui reste faux ici. C'est volontaire -- une répétition
    // clavier reposerait sur la répétition de touche du système, dont la cadence nous échappe.
    bindVRKeyboard() {
        const content = this.vrContent();
        if (!content) return;
        content.addEventListener('keydown', (evt) => {
            if (evt.key !== 'Enter' && evt.key !== ' ' && evt.key !== 'Spacebar') return;
            const btn = evt.target.closest('.vr-cmd-btn');
            if (!btn || !content.contains(btn)) return;
            evt.preventDefault();
            this.sendVRCommand(btn, evt);
        });
    }
    // Témoin radio, porté par le badge de l'en-tête plutôt que par la bordure de la molette (qui
    // n'existe que dans le corps de la télécommande) : le badge est visible sur mobile comme sur
    // PC, où la colonne de gauche de l'en-tête serait sinon vide.
    // Au repos, RIEN n'est ajouté -- le badge garde son aspect ordinaire : un anneau vert
    // permanent affirmerait en continu quelque chose que l'utilisateur n'a pas demandé. Seul
    // l'état anormal se signale, en rouge. L'éclat à chaque commande joue dans les deux cas, à la
    // couleur d'accentuation ou en rouge (cf. --vr-radio-color).
    // L'état est mémorisé sur #divVRContent, qui existe en permanence : setVRRadioState() est
    // appelée au chargement du contrôleur, bien avant qu'une télécommande ne soit ouverte. Il est
    // recopié sur l'overlay à l'ouverture, et mis à jour ici s'il y en a un d'ouvert.
    // Le titre n'est posé QUE sur l'état anormal : en fonctionnement normal une infobulle
    // n'apprendrait rien. Quand la radio est coupée, elle explique un anneau rouge qui, seul,
    // resterait énigmatique. L'équivalent textuel permanent va dans la région d'état masquée.
    setVRRadioState(isOn) {
        const content = this.vrContent();
        if (!content) return;
        content.setAttribute('data-radio', isOn ? 'on' : 'off');
        const txt = tr(isOn ? 'RADIO_ENABLED' : 'RADIO_DISABLED');
        const status = this.vrEl('divVRRadioStatus');
        if (status) status.innerText = txt;
        const ov = document.querySelector('.vr-overlay');
        if (!ov) return;
        ov.setAttribute('data-radio', isOn ? 'on' : 'off');
        const badge = ov.querySelector('.overlayHeader-badge');
        if (badge) {
            if (isOn) badge.removeAttribute('title');
            else badge.setAttribute('title', txt);
        }
    }
    // Anneau qui se propage depuis le badge de l'en-tête, comme le témoin d'une télécommande
    // physique. Déclenché à l'ÉMISSION de la commande et non à la réponse du boîtier : un
    // aller-retour HTTP tourne autour de 380 ms sur le banc, l'éclat paraîtrait décroché du geste.
    // Le retrait de classe suivi de la lecture de offsetWidth force un reflow : sans lui, deux
    // appuis rapprochés ne rejoueraient pas l'animation, le navigateur ne voyant aucun changement.
    pulseVRBadge() {
        const ov = document.querySelector('.vr-overlay');
        const badge = ov ? ov.querySelector('.overlayHeader-badge') : null;
        if (!badge) return;
        badge.classList.remove('pulse');
        void badge.offsetWidth;
        badge.classList.add('pulse');
        clearTimeout(badge._vrPulseTimer);
        badge._vrPulseTimer = setTimeout(() => badge.classList.remove('pulse'), 600);
    }
    // Valeurs d'usine, recopiees de src/somfy/SomfyRadioDriver.h (transceiver_config_t). Elles
    // sont volontairement en dur ICI et non demandees au boitier : le bouton doit fonctionner
    // meme quand la radio est mal reglee au point de ne plus repondre, et c'est precisement le
    // cas ou l'on veut s'en servir.
    // ATTENTION SI CES VALEURS CHANGENT COTE FIRMWARE : rien ne relie automatiquement les deux
    // fichiers. txPower vaut bien 10 dans le code -- le commentaire qui l'accompagne annonce 12,
    // il est faux.
    get radioDefaults() {
        return { frequency: 433.42, rxFrequency: 433.42, rxBandwidth: 99.97, txPower: 10 };
    }
    // "Reinitialiser" et non "Par defaut" : le bouton ne se contente plus de reposer les valeurs
    // d'usine, il jette aussi la reference de balayage. Les deux vont ensemble -- garder une
    // frequence relevee sous une configuration qu'on vient d'abandonner ferait viser l'accordeur
    // sur une mesure orpheline, et la ligne de provenance affirmerait un releve qui ne correspond
    // plus a rien.
    // CONFIRMATION AVANT D'AGIR. L'effet de ce bouton est INVISIBLE tant qu'on ne regarde pas les
    // curseurs : un clic par erreur ou par curiosite remet quatre valeurs a l'usine et efface la
    // reference de balayage sans que rien ne le signale a l'ecran. La question evite l'accident,
    // et le sous-titre dit exactement ce qui va se passer -- dont le fait que RIEN n'est ecrit
    // dans le boitier, ce qui rend le geste annulable en quittant sans enregistrer.
    // promptMessage() n'expose que son titre ; il renvoie son element, dont on remplit le
    // .sub-message laisse vide. Pas de modification du helper partage pour un seul appelant.
    resetRadioSettings() {
        const prompt = ui.promptMessage(tr('PROMPT_RADIO_RESET_TITLE'), () => this.applyRadioDefaults());
        const sub = prompt && prompt.querySelector('.sub-message');
        if (sub) sub.innerHTML = `<p>${tr('PROMPT_RADIO_RESET_MSG')}</p>`;
    }
    applyRadioDefaults() {
        const d = this.radioDefaults;
        const put = (id, v, fn) => {
            const el = get(id);
            if (!el) return;
            el.value = v;
            // On repasse par les gestionnaires existants plutot que d'ecrire les champs a la
            // main : ce sont eux qui formatent le champ numerique jumeau et redessinent le
            // graphe. Les dupliquer ici, c'est deux endroits ou se tromper.
            if (typeof this[fn] === 'function') this[fn](el);
            // watchDirty() n'ecoute que les evenements input/change (cf. 20-shell.js), et poser
            // .value en JS n'en emet aucun. Sans cette ligne la remise a zero laissait le
            // formulaire repute VIERGE tout en affichant "Enregistrez pour appliquer" : quitter la
            // page n'avertissait de rien. Aucun de ces champs n'a de gestionnaire onchange propre,
            // l'evenement ne sert donc qu'a la detection de modification.
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        put('slidFrequency', Math.round(d.frequency * 1000), 'frequencyChanged');
        put('slidRxFrequency', Math.round(d.rxFrequency * 1000), 'rxFrequencyChanged');
        put('slidRxBandwidth', Math.round(d.rxBandwidth * 100), 'rxBandwidthChanged');
        const iTx = this.txPowerLevels.indexOf(d.txPower);
        if (iTx >= 0) put('slidTxPower', iTx, 'txPowerChanged');
        // Protocole et longueur de trame : du PROTOCOLE, sans consequence physique, donc
        // legitimement reinitialisables. L'assignation GPIO (selRadioBoardType) reste
        // volontairement INTOUCHEE -- en changer reecrit les six broches via
        // onRadioBoardTypeChanged(), c'est-a-dire le cablage reel de l'appareil, que le logiciel
        // ne peut pas connaitre. Un utilisateur venu "reinitialiser" pour reparer se retrouverait
        // avec une radio muette sans jamais faire le lien.
        put('selRadioProto', 0, null);
        put('selRadioType', 56, null);

        this.updateRadioGraph();

        // On ne sauvegarde PAS : le bouton remplit les curseurs, l'utilisateur voit ce qui change
        // et valide avec Enregistrer. Un bouton qui ecrirait la configuration sans confirmation
        // serait le seul de cet ecran a le faire.
        const st = get('divRadioEnableStatus');
        if (st) st.textContent = tr('RADIO_SAVE_REQUIRED');
    }
    // ==========================================================================
    // ASSISTANT DE REGLAGE RADIO
    // ==========================================================================
    // Il MESURE les telecommandes physiques et en deduit deux valeurs -- frequence d'ecoute et
    // largeur de bande RX. Jamais la frequence d'emission : les telecommandes derivent, les moteurs
    // non. Il n'en ECRIT aucune : il remplit les curseurs en repassant par les
    // gestionnaires existants (rxFrequencyChanged / rxBandwidthChanged), exactement comme
    // resetRadioSettings(), et laisse "Enregistrer" commettre. Aucun nouveau chemin d'ecriture.
    get wizConst() {
        return {
            seuil: -75,        // seuil du firmware lui-meme (processFrequencyScan)
            pasKHz: 10,        // pas du balayage (currFreq += 0.01f)
            bwUsine: 99.97,    // plancher : on ne descend jamais sous l'usine
            bwMin: 58.03, bwMax: 812.50,
            silenceMs: 26000   // ~2,5 passes de 10,7 s : deux occasions de croiser la frequence
        };
    }
    // radioApplied garde ce que la CARTE exécute, seule référence honnête pour comparer aux
    // curseurs affichés (qui peuvent diverger de ce que le boîtier a réellement reçu).
    get radioApplied() { return this._radioApplied || null; }

    // Recharge depuis le boitier et repeuple le formulaire. Appelee a chaque entree sur la page
    // (cf. activateGrpid), ce qui rend impossible la survie d'une edition abandonnee.
    // On passe par /getRadio et non /controller : meme forme {config:{...}}, sans traîner l'etat
    // de tous les équipements. Le modele est enveloppe dans {transceiver:...} parce que c'est le chemin
    // qu'attendent les data-bind du formulaire.
    // En cas d'echec reseau on ne touche a RIEN : mieux vaut un affichage date qu'un formulaire
    // vide, et la ligne d'etat dira toujours la verite sur ce qu'on sait.
    refreshRadio() {
        getJSON('/getRadio', (err, res) => {
            if (err || !res || !res.config) return;
            this._radioApplied = Object.assign({}, res.config);
            ui.toElement(get('divTransceiverSettings'), { transceiver: res });
            const cb = get('cbEnableRadio');
            if (cb) {
                cb.checked = !!res.config.enabled;
                cb.parentElement.classList.remove('sel-pending');
            }
            const sel = get('selRadioBoardType');
            if (sel) {
                sel.value = res.config.radioBoardType || 0;
                this.onRadioBoardTypeChanged(sel);
            }
            // Le formulaire vient d'etre remis a l'image de la carte : il n'y a plus rien
            // d'en attente, et laisser un etat "modifie" ferait mentir l'alerte de sortie.
            clearDirty(get('divTransceiverSettings'));
            this.setRadioEnabled(!!res.config.enabled);
            this._wizPending = false;
            this.renderRadioFleet();
            this.updateRadioGraph();
        });
    }

    // Un SEUL ecouteur pour tout le panneau, plutot que la meme ligne recopiee dans les six
    // gestionnaires de curseur : rien a oublier le jour ou un septieme reglage apparaitra.
    // Pose une fois pour toutes (_radioEditWatched), la page n'etant jamais reconstruite.
    watchRadioEdits() {
        const panneau = get('divTransceiverSettings');
        if (!panneau || this._radioEditWatched) return;
        this._radioEditWatched = true;
        const signaler = () => {
            const st = get('divRadioEnableStatus');
            if (st) st.textContent = tr('RADIO_SAVE_REQUIRED');
            this.updateRadioCurrent();
            this.updateRadioPins();
        };
        panneau.addEventListener('input', signaler);
        panneau.addEventListener('change', signaler);
    }
    // GARDE-FOU : radio eteinte, NI le test NI l'assistant NI le balayage ne peuvent aboutir.
    // Cote firmware, beginFrequencyScan() commence par `if(this->config.enabled)` et aucune trame
    // n'est decodee : le test tournerait ses 15 secondes pour ne rien trouver et l'utilisateur
    // conclurait a un bug, alors que c'est lui qui a eteint la radio.
    //
    // CE QUI DECIDE, C'EST L'ETAT DU BOITIER, PAS LA CASE A COCHER. Premiere version : je bloquais
    // des que la case etait decochee, et je ne consultais l'etat reel qu'ensuite. Deux erreurs
    // symetriques en decoulaient :
    //   - case cochee mais changement NON ENREGISTRE -> on laissait partir un test qui ne pouvait
    //     pas aboutir, le boitier n'ayant jamais demarre sa radio (le cas remonte) ;
    //   - case decochee alors que le boitier tourne encore -> on refusait un test qui, lui,
    //     aurait parfaitement fonctionne.
    // La case ne dit donc que le CONSEIL a donner, jamais la permission.
    //
    // SOURCE DE L'ETAT REEL : la classe .radio-error de l'onglet, posee depuis config.radioInit
    // rapporte par le boitier. C'est la seule fiable ici -- somfy.transceiver n'est PAS toujours
    // peuple cote client (constate : absent alors meme que la page radio etait affichee), et un
    // `=== false` sur un undefined ne se declenche jamais. C'est deja la source qu'utilise
    // setRadioEnabled() pour son "isActuallyEnabled".
    // Onglet introuvable -> on laisse passer : dans le doute, ne pas empecher un geste legitime.
    radioPrete() {
        const onglet = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]');
        if (!onglet || !onglet.classList.contains('radio-error')) return true;
        const cb = get('cbEnableRadio');
        ui.infoMessage('RADIO_DISABLED', (cb && cb.checked) ? 'RADIO_OFF_UNSAVED' : 'RADIO_OFF_MSG');
        return false;
    }
    radioWizard(mode) {
        if (!this.radioPrete()) return;
        // Remise a zero defensive : si le boitier n'a jamais confirme l'arret precedent (coupure
        // reseau), le drapeau serait reste leve et aurait bloque la fenetre de depannage.
        this.wizStopping = false;
        if (mode === 'restart' || !this.radioFleet) this.radioFleet = { remotes: [], done: false };
        this._radioAfterWiz = false;
        const f = this.radioFleet;
        this.wiz = { etat: 'intro', pas: {}, meilleur: -100, depuis: 0, dup: null };
        if (mode === 'resume') { f.done = false; this.wiz.etat = 'decode'; }
        else if (mode === 'result') this.wiz.etat = 'resultat';
        else if (f.remotes.length) { f.remotes = []; f.done = false; }
        let div = get('divRadioWizard');
        if (!div) {
            div = document.createElement('div');
            div.id = 'divRadioWizard';
            div.className = 'inst-overlay';
            div.innerHTML = `
            <div class="instructions-content">
            ${overlayHeader('RADIO_WIZ_TITLE', 'RADIO_WIZ_DESC', 'svg-tabRadio',
                { subtitle: 'RADIO_WIZ_DESC' })}
            <div class="overlay-scroll-content">
            <div id="wizBody"></div>
            </div>
            <div class="hrDivFooter-Instruc"></div>
            <div class="button-container-overlay" id="wizFooter"></div>
            </div>`;
            shOverlay(div, () => this.wizAbandon());
        }
        if (this.wiz.etat === 'decode') this.wizDecoder();
        else this.wizRender();
        return div;
    }
    get radioWindow() {
        const a = this.radioApplied;
        if (!a || typeof a.rxFrequency !== 'number' || typeof a.rxBandwidth !== 'number') return null;
        return { min: a.rxFrequency - a.rxBandwidth / 2000, max: a.rxFrequency + a.rxBandwidth / 2000 };
    }
    wizLigne(r, i) {
        const nom = tr('RADIO_WIZ_REMOTE').replace('{n}', i + 1);
        if (r.kind === 'ok') return `${nom} — <b>${tr('RADIO_FLEET_OK')}</b> · ID ${escHtml(String(r.address))} · ${r.rssi} ${tr('UNIT_DBM')}`;
        const emet = tr('RADIO_FLEET_EMITS').replace('{freq}', r.freq.toFixed(3));
        return `${nom} — <b>${tr(r.kind === 'shift' ? 'RADIO_FLEET_SHIFT' : 'RADIO_FLEET_OTHER')}</b> · ${emet}`;
    }
    wizRender() {
        const w = this.wiz, f = this.radioFleet, body = get('wizBody'), foot = get('wizFooter');
        if (!w || !f || !body || !foot) return;
        const btn = (id, key, cls, action) =>
            `<button id="${id}" type="button" ${cls} onclick="somfy.${action}">${tr(key)}</button>`;
        const liste = () => f.remotes.length
            ? `<ul class="wiz-liste">${f.remotes.map((r, i) => `<li>${this.wizLigne(r, i)}</li>`).join('')}</ul>` : '';
        const notice = (cls, ico, titre, texte) => `<div class="wiz-notice ${cls}">
            <svg><use href="#svg-${ico}"></use></svg>
            <div class="wiz-notice-texte"><span class="wiz-title">${titre}</span><span>${texte}</span></div></div>`;
        const n = f.remotes.length;
        const dernier = f.remotes[n - 1];
        const autreOuFin = btn('btnWizMore', 'BT_ANOTHER', 'line', 'wizDecoder();') + btn('btnWizDone', 'BT_FINISH', '', 'wizTerminer();');
        switch (w.etat) {
            case 'intro':
                body.innerHTML = `
                    <div class="empty-state wiz-accueil">
                    <svg class="empty-icon"><use href="#svg-linkRemot"></use></svg>
                    <div class="label">${tr('RADIO_WIZ_STEP1_TITLE')}</div>
                    <div class="empty-subtext">${tr('RADIO_WIZ_STEP1_DESC')}</div>
                    </div>`;
                foot.innerHTML = btn('btnWizCancel', 'BT_CANCEL', 'line', 'wizFermer();')
                               + btn('btnWizGo', 'BT_BEGIN', '', 'wizDecoder();');
                break;
            case 'decode': {
                const k = w.dup;
                body.innerHTML = (k !== null
                        ? notice('info', 'info', tr('RADIO_WIZ_DUP_TITLE'), tr('RADIO_WIZ_DUP_DESC')
                            .replace('{n}', k + 1).replace('{id}', escHtml(String(f.remotes[k].address))))
                        : '')
                    + `<div class="information-text">
                    <span class="wiz-title">${tr('RADIO_WIZ_DECODE_TITLE').replace('{n}', n + 1)}</span>
                    <span>${tr('RADIO_WIZ_DECODE_DESC')}</span></div>
                    <div class="progress-bar-header">
                        <span class="progress-bar-label">${tr('RADIO_WIZ_DECODE_LISTEN')}</span>
                        <span class="progress-bar-value" id="wizChrono">0 s</span>
                    </div>
                    <div class="progress-bar" id="wizBarre"><div class="progress-bar-fill"></div></div>
                    ${liste()}`;
                foot.innerHTML = btn('btnWizStop', 'BT_STOP_HERE', 'line', 'wizFermer();')
                               + (n ? btn('btnWizNoMore', 'BT_NO_MORE', '', 'wizTerminer();') : '');
                break;
            }
            case 'reconnue':
                body.innerHTML = notice('ok', 'succes', tr('RADIO_WIZ_OK_TITLE').replace('{n}', n),
                        tr('RADIO_WIZ_OK_DESC').replace('{id}', escHtml(String(dernier.address))).replace('{rssi}', dernier.rssi)) + liste();
                foot.innerHTML = autreOuFin;
                break;
            case 'nonreconnue':
                body.innerHTML = notice('warning', 'warning', tr('RADIO_WIZ_NOTREC_TITLE').replace('{n}', n + 1), tr('RADIO_WIZ_NOTREC_DESC')) + liste();
                foot.innerHTML = btn('btnWizRetry', 'BT_RETRY', 'line', 'wizDecoder();')
                               + btn('btnWizMeasure', 'BT_MEASURE_FREQ', '', 'wizEcouter();');
                break;
            case 'ecoute':
                body.innerHTML = `<div class="information-text">
                    <span class="wiz-title">${tr('RADIO_WIZ_PRESS_TITLE').replace('{n}', n + 1)}</span>
                    <span>${tr('RADIO_WIZ_PRESS_DESC')}</span></div>
                    <div class="progress-bar-header">
                        <span class="progress-bar-label" id="wizNiveau">${tr('RADIO_WIZ_LISTENING')}</span>
                        <span class="progress-bar-value" id="wizChrono">0 s</span>
                    </div>
                    <div class="progress-bar" id="wizBarre"><div class="progress-bar-fill"></div></div>
                    ${liste()}`;
                foot.innerHTML = btn('btnWizStop', 'BT_CANCEL', 'line', 'wizFermer();');
                break;
            case 'mesuree': {
                const win = this.radioWindow;
                const texte = (dernier.kind === 'shift' ? tr('RADIO_WIZ_SHIFT_DESC') : tr('RADIO_WIZ_INWIN_DESC'))
                    .replace('{freq}', dernier.freq.toFixed(3))
                    .replace('{min}', win ? win.min.toFixed(3) : '?').replace('{max}', win ? win.max.toFixed(3) : '?');
                body.innerHTML = notice('warning', 'wave', tr('RADIO_WIZ_MEASURED_TITLE').replace('{n}', n), texte) + liste();
                foot.innerHTML = autreOuFin;
                break;
            }
            case 'silence':
                body.innerHTML = notice('warning', 'warning', tr('RADIO_WIZ_SILENT_TITLE'),
                        tr(w.meilleur > this.wizConst.seuil ? 'RADIO_WIZ_PARTIAL_DESC' : 'RADIO_WIZ_SILENT_DESC')) + liste();
                foot.innerHTML = btn('btnWizSkip', 'BT_SKIP', 'line', n ? 'wizTerminer();' : 'wizFermer();')
                               + btn('btnWizRetry', 'BT_RETRY', '', 'wizEcouter();');
                break;
            case 'fin': {
                const ok = f.remotes.filter(r => r.kind === 'ok').length;
                const autres = n - ok;
                body.innerHTML = `
                    <div class="empty-state wiz-accueil">
                    <svg class="empty-icon wiz-ok-icon"><use href="#svg-${autres ? 'warning' : 'succes'}"></use></svg>
                    <div class="label">${autres ? tr('RADIO_FLEET_OTHER_TITLE')
                        : (ok === 1 ? tr('RADIO_WIZ_END_OK_ONE') : tr('RADIO_WIZ_END_OK_TITLE').replace('{n}', ok))}</div>
                    <div class="empty-subtext">${tr(autres ? 'RADIO_WIZ_END_OTHER_DESC' : 'RADIO_WIZ_END_OK_DESC')}</div>
                    </div>${liste()}`;
                foot.innerHTML = btn('btnWizClose', 'BT_CLOSE', '', 'wizFermer();');
                break;
            }
            case 'aberrante': {
                const r = this.wizCalcul(), i = this.wizAberrante(), m = this.wizShifts()[i];
                body.innerHTML = notice('warning', 'warning', tr('RADIO_WIZ_OUTLIER_TITLE'), tr('RADIO_WIZ_OUTLIER_DESC')
                        .replace('{n}', f.remotes.indexOf(m) + 1)
                        .replace('{freq}', m.freq.toFixed(3))
                        .replace('{ecart}', Math.round(r.etendueKHz))) + liste();
                foot.innerHTML = btn('btnWizKeepAll', 'BT_CANCEL', 'line', 'wizFermer();')
                               + btn('btnWizDrop', 'BT_SKIP_DROP', '', `wizExclure(${i});`);
                break;
            }
            case 'resultat': {
                const r = this.wizCalcul();
                if (!r) { w.etat = 'fin'; this.wizRender(); return; }
                const ok = f.remotes.filter(x => x.kind === 'ok').length;
                const usine = Math.abs(r.bande - this.wizConst.bwUsine) < 0.01;
                const texte = ok
                    ? tr('RADIO_WIZ_RESULT_MIXED').replace('{ok}', ok).replace('{shift}', this.wizShifts().length)
                    : tr(usine ? 'RADIO_WIZ_RESULT_STOCK' : 'RADIO_WIZ_RESULT_WIDENED');
                body.innerHTML = `<div class="information-text">
                    <span class="wiz-title">${tr('RADIO_WIZ_RESULT_TITLE')}</span>
                    <span>${texte}</span>
                    <span>${tr('RADIO_WIZ_TX_KEPT').replace('{f}', (this.radioApplied?.frequency ?? this.radioDefaults.frequency).toFixed(3))}</span></div>
                    <div class="wiz-resultat">
                        <div><span>${tr('RADIO_RX_FREQUENCY')}</span><b>${r.centre.toFixed(3)} MHz</b></div>
                        <div><span>${tr('RADIO_RX_BANDWIDTH')}</span><b>${r.bande.toFixed(2)} kHz</b></div>
                    </div>${liste()}`;
                foot.innerHTML = btn('btnWizMore', 'BT_ANOTHER', 'line', 'wizDecoder();')
                               + btn('btnWizApply', 'BT_SAVE', '', 'wizAppliquer();');
                break;
            }
        }
        this.wizMajVerrou();
        this.renderRadioFleet();
    }
    get wizDecodeMs() { return 12000; }
    wizDecoder() {
        const w = this.wiz;
        if (!w) return;
        this.radioFleet.done = false;
        w.etat = 'decode'; w.depuis = Date.now(); w.dup = null;
        this.wizRender();
        if (this._wizTick) clearInterval(this._wizTick);
        this._wizTick = setInterval(() => {
            if (!this.wiz || this.wiz.etat !== 'decode') return;
            const ecoule = Date.now() - this.wiz.depuis;
            const c = get('wizChrono'), b = get('wizBarre');
            if (c) c.textContent = Math.max(0, Math.ceil((this.wizDecodeMs - ecoule) / 1000)) + ' s';
            if (b && b.firstElementChild) b.firstElementChild.style.width = Math.min(100, ecoule / this.wizDecodeMs * 100).toFixed(1) + '%';
            if (ecoule >= this.wizDecodeMs) {
                clearInterval(this._wizTick); this._wizTick = null;
                this.wiz.etat = 'nonreconnue';
                this.wizRender();
            }
        }, 250);
    }
    wizOnFrame(frame) {
        const w = this.wiz, f = this.radioFleet;
        if (!w || !f || w.etat !== 'decode' || !frame || frame.valid === false) return;
        const k = f.remotes.findIndex(r => r.kind === 'ok' && String(r.address) === String(frame.address));
        if (k >= 0) {
            w.dup = k; w.depuis = Date.now();
            this.wizRender();
            return;
        }
        if (this._wizTick) { clearInterval(this._wizTick); this._wizTick = null; }
        f.remotes.push({ kind: 'ok', address: frame.address, rssi: frame.rssi });
        w.etat = 'reconnue';
        this.wizRender();
    }
    wizEcouter() {
        const w = this.wiz;
        if (!w) return;
        w.etat = 'ecoute'; w.pas = {}; w.meilleur = -100; w.depuis = Date.now();
        this.wizRender();
        if (this._wizTick) clearInterval(this._wizTick);
        this._wizTick = setInterval(() => this.wizMajEcoute(), 250);
        putJSONSync('/beginFrequencyScan', {}, (err) => {
            if (err) { ui.serviceError(err); this.wizFermer(); return; }
        });
    }
    // Retour "je vous entends" -- LE point de rupture du parcours. On demande de maintenir un
    // bouton en regardant un ecran tenu dans l'autre main : sans signe de vie immediat, tout le
    // monde relache au bout de trois secondes. Rafraichi a part du rendu complet, qui ferait
    // clignoter l'ecran a la cadence des evenements.
    wizMajEcoute() {
        const w = this.wiz, C = this.wizConst;
        if (!w || w.etat !== 'ecoute') return;
        const ecoule = Date.now() - w.depuis;
        const el = get('wizNiveau');
        if (el) {
            const entendu = w.meilleur > C.seuil;
            el.textContent = entendu
                ? tr('RADIO_WIZ_HEARD').replace('{rssi}', w.meilleur)
                : tr('RADIO_WIZ_LISTENING');
            el.classList.toggle('heard', entendu);
        }
        const c = get('wizChrono');
        if (c) c.textContent = Math.floor(ecoule / 1000) + ' s';
        const b = get('wizBarre');
        if (b && b.firstElementChild)
            b.firstElementChild.style.width = Math.min(100, ecoule / C.silenceMs * 100).toFixed(1) + '%';
        this.wizVerifierDelai();
    }
    // Le delai d'abandon est verifie DEUX FOIS : ici depuis le minuteur d'affichage, et depuis
    // wizOnScan() a chaque trame recue. Ce n'est pas une ceinture-bretelles gratuite -- les deux
    // sources ont des modes de panne opposes :
    //   - onglet en arriere-plan : le navigateur bride setInterval (observe : 21 s affichees pour
    //     36 s reelles, l'assistant serait reste en ecoute indefiniment) tandis que les trames
    //     WebSocket, elles, continuent d'arriver ;
    //   - socket muette (boitier qui ne repond plus, balayage jamais demarre) : plus aucune trame,
    //     et seul le minuteur peut encore sortir l'utilisateur de l'attente.
    // Un utilisateur qui tient sa telecommande a de bonnes raisons de regarder ailleurs : le
    // premier cas est le plus probable des deux.
    wizVerifierDelai() {
        const w = this.wiz;
        if (!w || w.etat !== 'ecoute') return;
        if (Date.now() - w.depuis > this.wizConst.silenceMs) this.wizSilence();
    }
    wizOnScan(scan) {
        const w = this.wiz;
        if (!w || w.etat !== 'ecoute') return;
        const f = parseFloat(scan.testFreq), r = parseInt(scan.testRSSI, 10);
        if (!isFinite(f) || !isFinite(r)) return;
        const k = Math.round(f * 100);              // grille de 10 kHz, en centiemes de MHz
        w.pas[k] = Math.max(w.pas[k] === undefined ? -100 : w.pas[k], r);
        if (r > w.meilleur) w.meilleur = r;
        const m = this.wizFenetre();
        if (m) this.wizMesureFinie(m);
        else this.wizVerifierDelai();
    }
    // LE MILIEU DE LA FENETRE DE DETECTION, ET NON LE SOMMET DU PIC. Le filtre RX fait 100 kHz de
    // large, donc le sommet est plat sur ~70 kHz et son argmax -- ce que le firmware publie dans
    // scan.frequency / markFreq -- se promene sur 40 kHz d'une passe a l'autre pour une source
    // pourtant immobile. Les flancs, eux, chutent de 12 dB en un seul pas de 10 kHz.
    // Mesures du banc, 31/08/2026, cinq passes sur une meme telecommande :
    //   argmax           433,190 / 433,200 / 433,210 / 433,230 / 433,230  -> 40 kHz d'etendue
    //   milieu de fenetre 433,210 / 433,215 / 433,215 / 433,215 / 433,220 -> 10 kHz d'etendue
    // Les 10 kHz restants sont le pas de quantification de l'estimateur, pas du bruit.
    // C'est pour cela que scan.frequency n'est jamais lu ici.
    // La LARGEUR de la fenetre, elle, depend du niveau du signal : elle n'est pas une mesure.
    wizFenetre() {
        const w = this.wiz, C = this.wizConst;
        const cles = Object.keys(w.pas).map(Number).sort((a, b) => a - b);
        const plages = [];
        let cur = null;
        for (const k of cles) {
            if (w.pas[k] > C.seuil) {
                if (cur && k - cur.fin <= 2) cur.fin = k;   // tolere UN pas manquant au milieu
                else { if (cur) plages.push(cur); cur = { debut: k, fin: k }; }
            }
        }
        if (cur) plages.push(cur);
        if (!plages.length) return null;
        const pic = (p) => Math.max(...cles.filter(k => k >= p.debut && k <= p.fin).map(k => w.pas[k]));
        // Plusieurs sources possibles dans la bande (un voisin qui emet) : on garde la plus forte.
        plages.sort((a, b) => pic(b) - pic(a));
        const p = plages[0];
        // FERMEE DES DEUX COTES : il faut avoir VISITE le pas d'avant et celui d'apres et les
        // avoir trouves sous le seuil. Sans cette condition on mesurerait le milieu d'une fenetre
        // encore en train de s'ouvrir, et le centre serait faux de la moitie de ce qui manque.
        const avant = w.pas[p.debut - 1], apres = w.pas[p.fin + 1];
        if (avant === undefined || apres === undefined) return null;
        if (avant > C.seuil || apres > C.seuil) return null;
        return { freq: (p.debut + p.fin) / 200, rssi: pic(p) };
    }
    wizMesureFinie(m) {
        this.wizArreterBalayage();
        const win = this.radioWindow;
        const dedans = !!win && m.freq >= win.min && m.freq <= win.max;
        this.radioFleet.remotes.push({ kind: dedans ? 'other' : 'shift', freq: m.freq, rssi: m.rssi });
        this.wiz.etat = 'mesuree';
        this.wizRender();
    }
    wizSilence() {
        this.wizArreterBalayage();
        this.wiz.etat = 'silence';
        this.wizRender();
    }
    wizShifts() { return this.radioFleet ? this.radioFleet.remotes.filter(r => r.kind === 'shift') : []; }
    wizTerminer() {
        const w = this.wiz, f = this.radioFleet;
        if (!w || !f) return;
        if (!f.remotes.length) { this.wizFermer(); return; }
        f.done = true;
        if (!this.wizShifts().length) { w.etat = 'fin'; this.wizRender(); return; }
        const r = this.wizCalcul();
        w.etat = (r.horsPortee || this.wizSuspecte() !== null) ? 'aberrante' : 'resultat';
        this.wizRender();
    }
    // Un releve isole loin d'un GROUPE serre. Ce n'est pas un modele ajuste sur un cas particulier
    // mais un test de forme : le retirer fait-il s'effondrer l'etendue ? Il ne DECIDE jamais rien,
    // il pose la question a l'utilisateur -- c'est la seule chose qu'on puisse honnetement faire,
    // puisque rien ne distingue de l'exterieur une vraie telecommande excentree d'un parasite.
    // Sous trois mesures il n'y a pas de groupe auquel comparer : on ne signale rien.
    wizSuspecte() {
        const shifts = this.wizShifts();
        if (shifts.length < 3) return null;
        const etendue = (l) => (Math.max(...l) - Math.min(...l)) * 1000;
        const fs = shifts.map(m => m.freq);
        const avec = etendue(fs);
        if (avec <= 100) return null;                 // groupe deja serre : rien a signaler
        const i = this.wizAberrante();
        const sans = etendue(fs.filter((_, k) => k !== i));
        // Le retrait doit faire tomber l'etendue d'au moins 70 % : trois telecommandes reellement
        // dispersees se retirent mal, un intrus se retire tres bien.
        return (sans < 0.3 * avec) ? i : null;
    }
    // La mesure la plus eloignee de la mediane des autres : sur trois releves ou plus c'est
    // l'intrus, sur deux c'est arbitraire mais il n'y a alors pas de "groupe" a departager.
    wizAberrante() {
        const fs = this.wizShifts().map(m => m.freq);
        const med = [...fs].sort((a, b) => a - b)[Math.floor(fs.length / 2)];
        let pire = 0;
        fs.forEach((f, i) => { if (Math.abs(f - med) > Math.abs(fs[pire] - med)) pire = i; });
        return pire;
    }
    wizExclure(i) {
        const m = this.wizShifts()[i];
        this.radioFleet.remotes = this.radioFleet.remotes.filter(r => r !== m);
        this.wizTerminer();
    }
    // centre = MILIEU DES EXTREMES, qui minimise l'ecart au pire cas -- et non la moyenne, qui se
    //          laisse tirer par les valeurs groupees.
    // bande  = ce qu'exige |f - centre| <= bande/2 pour TOUTES les telecommandes, soit
    //          (max - min), plus un pas de balayage de chaque cote. Cette marge de 20 kHz sort de
    //          la RESOLUTION DE LA MESURE (grille de 10 kHz) et non d'un modele ajuste sur un cas
    //          particulier : c'est la seule qu'on puisse justifier.
    // Le plancher a la valeur d'usine est delibere : chez qui a des telecommandes groupees --
    // l'immense majorite -- l'assistant ressort EXACTEMENT les valeurs Somfy. Il confirme au lieu
    // de bricoler, et n'elargit que quand les mesures l'exigent. Elargir degrade la sensibilite.
    wizCalcul() {
        const C = this.wizConst, fs = this.wizShifts().map(m => m.freq);
        if (!fs.length) return null;
        const win = this.radioWindow;
        if (win && this.radioFleet.remotes.some(r => r.kind === 'ok')) fs.push(win.min, win.max);
        const min = Math.min(...fs), max = Math.max(...fs);
        const etendueKHz = (max - min) * 1000;
        const voulue = Math.max(C.bwUsine, etendueKHz + 2 * C.pasKHz);
        return {
            centre: (min + max) / 2,
            bande: Math.min(Math.max(voulue, C.bwMin), C.bwMax),
            min, max, etendueKHz,
            horsPortee: voulue > C.bwMax
        };
    }
    wizAppliquer() {
        const r = this.wizCalcul();
        if (!r) { this.wizFermer(); return; }
        const put = (id, v, fn) => {
            const el = get(id);
            if (!el) return;
            el.value = v;
            // On repasse par les gestionnaires existants, comme resetRadioSettings() : ce sont eux
            // qui formatent le champ numerique jumeau et redessinent le graphe.
            if (typeof this[fn] === 'function') this[fn](el);
        };
        put('slidRxFrequency', Math.round(r.centre * 1000), 'rxFrequencyChanged');
        put('slidRxBandwidth', Math.round(r.bande * 100), 'rxBandwidthChanged');
        this.updateRadioGraph();
        const st = get('divRadioEnableStatus');
        if (st) st.textContent = tr('RADIO_SAVE_REQUIRED');
        // On FERME AVANT d'enregistrer, et non l'inverse : saveRadio() valide le panneau entier
        // (broches, type de carte, securite du mode manuel) et affiche ses erreurs dans
        // divTransceiverSettings -- c'est-a-dire DERRIERE cet overlay, ou personne ne les verrait.
        // Fermer d'abord rend l'echec visible et laisse l'utilisateur devant les curseurs remplis.
        this.wizFermer();
        this._wizPending = true;
        this.saveRadio();
    }
    wizMajVerrou() {
        const div = get('divRadioWizard');
        if (!div) return;
        if (this.wiz && this.wiz.etat === 'ecoute')
            setOverlayLock(div, 'confirm', { titleKey: 'PROMPT_FREQ_SCAN_TITLE', msgKey: 'PROMPT_FREQ_SCAN_MSG' });
        else
            clearOverlayLock(div);
    }
    wizArreterBalayage() {
        // Leve AVANT le PUT : la trame finale du boitier peut arriver pendant que l'assistant se
        // ferme, donc apres que this.wiz a ete remis a null.
        this.wizStopping = true;
        if (this._wizTick) { clearInterval(this._wizTick); this._wizTick = null; }
        putJSONSync('/endFrequencyScan', {}, (err) => {
            if (err) logger.error('Failed to end frequency scan:', err);
        });
    }
    // Appele par shOverlay() sur TOUS les chemins de sortie (croix, fond, glisser mobile), donc
    // le balayage ne peut pas rester actif cote boitier apres une fermeture.
    wizAbandon() {
        if (this.wiz && this.wiz.etat === 'ecoute') this.wizArreterBalayage();
        if (this._wizTick) { clearInterval(this._wizTick); this._wizTick = null; }
        this.wiz = null;
        if (this.radioFleet && !this.radioFleet.remotes.length) this.radioFleet = null;
        this.renderRadioFleet();
    }
    wizFermer() {
        const div = get('divRadioWizard');
        this.wizAbandon();
        if (div) closeOverlay(div);
    }
    updateRadioCurrent() {
        const fr = get('slidFrequency'), rf = get('slidRxFrequency'), bw = get('slidRxBandwidth'), tx = get('slidTxPower');
        if (!fr || !rf || !bw || !tx) return;
        const v = { frequency: parseFloat(fr.value) / 1000, rxFrequency: parseFloat(rf.value) / 1000, rxBandwidth: parseFloat(bw.value) / 100, txPower: this.txPowerLevels[parseInt(tx.value, 10)] };
        const dec = { frequency: 3, rxFrequency: 3, rxBandwidth: 2, txPower: 0 };
        const mhz = (f) => isFinite(f) ? f.toFixed(3) + ' ' + tr('UNIT_MHZ') : '--';
        if (get('spanRadioTxFreq')) get('spanRadioTxFreq').textContent = mhz(v.frequency);
        if (get('spanRadioRxFreq')) get('spanRadioRxFreq').textContent = mhz(v.rxFrequency);
        if (get('spanRadioBw')) get('spanRadioBw').textContent = isFinite(v.rxBandwidth) ? v.rxBandwidth.toFixed(2) + ' ' + tr('UNIT_KHZ') : '--';
        if (get('spanRadioPwr')) get('spanRadioPwr').textContent = v.txPower === undefined ? '--' : v.txPower + ' ' + tr('UNIT_DBM');
        const a = this.radioApplied, box = get('divRadioPending');
        if (!box) return;
        const pending = !!a && Object.keys(dec).some(k => typeof a[k] === 'number' && isFinite(v[k]) && Math.abs(v[k] - a[k]) > Math.pow(10, -dec[k]) / 2);
        box.style.display = pending ? '' : 'none';
        if (pending) box.textContent = tr('RADIO_FREQ_PENDING')
            .replace('{f}', a.frequency.toFixed(3)).replace('{rx}', (a.rxFrequency ?? a.frequency).toFixed(3)).replace('{bw}', a.rxBandwidth.toFixed(2)).replace('{tx}', a.txPower);
    }
    pickRadioEnabled(on) {
        const cb = get('cbEnableRadio');
        if (cb) cb.parentElement.classList.remove('sel-pending');
        if (cb && cb.checked !== on) cb.click();
    }
    renderRadioFleet() {
        const box = get('divRadioFleet');
        if (!box) return;
        const f = this.radioFleet && this.radioFleet.remotes.length ? this.radioFleet : null;
        const tab = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]');
        const off = !!tab && tab.classList.contains('radio-error');
        const verdict = (cls, ico, t, d, action, key) => `<div class="rd-verdict ${cls}">${ico}<div><b>${t}</b><span>${d}</span></div>${
            action ? `<button type="button" class="rd-verdict-btn" onclick="somfy.${action}">${tr(key)}</button>` : ''}</div>`;
        const svg = (id) => `<svg><use href="#svg-${id}"></use></svg>`;
        const cta = `<button type="button" class="rd-cta" onclick="somfy.radioWizard('restart');">
            <span class="rd-pulse">${svg('remote')}</span>
            <span class="rd-cta-t"><b>${tr('RADIO_FLEET_CTA')}</b><small>${tr('RADIO_FLEET_CTA_DESC')}</small></span>
            <svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg></button>`;
        if (off) { box.innerHTML = verdict('off', svg('warning'), tr('RADIO_DISABLED'), tr('RADIO_REMOTES_OFF_DESC')); return; }
        if (!f) {
            box.innerHTML = (this._radioAfterWiz ? verdict('info', svg('info'), tr('RADIO_REMOTES_WIZ_DONE'), tr('RADIO_REMOTES_WIZ_DONE_DESC')) : '') + cta;
            return;
        }
        const ok = f.remotes.filter(r => r.kind === 'ok').length;
        const shifts = f.remotes.filter(r => r.kind === 'shift').length;
        let tete;
        if (!f.done) tete = verdict('info', svg('info'), tr('RADIO_FLEET_PAUSED'),
            tr('RADIO_FLEET_PAUSED_DESC').replace('{n}', f.remotes.length), "radioWizard('resume');", 'RADIO_FLEET_CONTINUE');
        else if (shifts) tete = verdict('warn', svg('warning'), tr('RADIO_FLEET_SHIFT_TITLE'), tr('RADIO_FLEET_SHIFT_DESC'), "radioWizard('result');", 'RADIO_FLEET_SHOW');
        else if (ok < f.remotes.length) tete = verdict('warn', svg('warning'), tr('RADIO_FLEET_OTHER_TITLE'), tr('RADIO_FLEET_OTHER_DESC'));
        else tete = verdict('ok', svg('succes'), tr('RADIO_FLEET_ALL_OK'), tr('RADIO_FLEET_ALL_OK_DESC'));
        const ligne = (r, i) => {
            const nom = tr('RADIO_WIZ_REMOTE').replace('{n}', i + 1);
            if (r.kind === 'ok') return `<div class="rd-row">${svg('remote')}<div class="rd-row-t"><b>${nom}</b><small>ID ${escHtml(String(r.address))}</small></div>`
                + `<span class="rd-sig sig-${this.rssiLevel(r.rssi)}">${r.rssi} ${tr('UNIT_DBM')}</span><svg class="rd-row-ok"><use href="#svg-succes"></use></svg></div>`;
            return `<div class="rd-row warn">${svg('remote')}<div class="rd-row-t"><b>${nom}</b><small>${tr('RADIO_FLEET_EMITS').replace('{freq}', r.freq.toFixed(3))}</small></div>`
                + `<span class="rd-row-tag">${tr(r.kind === 'shift' ? 'RADIO_FLEET_SHIFT' : 'RADIO_FLEET_OTHER')}</span></div>`;
        };
        box.innerHTML = tete
            + `<div class="rd-head"><span>${tr('RADIO_FLEET_TESTED')}</span><span>${tr('RADIO_FLEET_COUNT').replace('{n}', ok)}</span></div>`
            + `<div class="rd-rows">${f.remotes.map(ligne).join('')}</div>`
            + `<div class="rd-foot"><button type="button" class="rd-link" onclick="somfy.radioWizard('restart');">${tr('RADIO_FLEET_RESTART')}</button></div>`;
    }
    // Les quatre explications d'un coup, et le SEUL endroit ou elles vivent desormais : le volet
    // Manuel portait les memes textes en infobulles, une par carte, ce qui obligeait a survoler
    // quatre fois pour reconstituer le tableau. Les deux volets appellent maintenant cette meme
    // modale, donc plus aucun risque de voir les deux redactions diverger.
    radioAideOverlay() {
        if (get('divRadioAideOverlay')) return;
        // Paires explicites libelle / explication plutot qu'une cle deduite de l'autre : les deux
        // familles ne suivent PAS le meme schema (RADIO_RX_BANDWIDTH -> RADIO_HELP_RX_BANDWIDTH),
        // et une construction par concatenation s'etait deja cassee en silence lors d'un
        // renommage -- la modale affichait les noms de cles a la place des textes.
        const lignes = [
            ['RADIO_TX_FREQUENCY',   'RADIO_HELP_TX_FREQUENCY'],
            ['RADIO_TX_POWER',       'RADIO_HELP_TX_POWER'],
            ['RADIO_RX_FREQUENCY',   'RADIO_HELP_RX_FREQUENCY'],
            ['RADIO_RX_BANDWIDTH',   'RADIO_HELP_RX_BANDWIDTH']
        ];
        // MEME PATRON QUE LES AUTRES MODALES DE CONTENU (DashboardPrefsOverlay, FeedbackOverlay) :
        // en-tete, corps defilant, filet, pied. La premiere version empruntait celui des messages
        // (.info-content + .sub-message + .button-container-row), qui est taille pour UNE phrase :
        // trois explications n'y defilaient pas et debordaient sur petit ecran, et le bouton n'etait
        // pas dans le conteneur de pied du reste de l'application.
        const div = document.createElement('div');
        div.id = 'divRadioAideOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content">
        ${modalHeader('RADIO_HELP_TITLE', 'svg-info')}
        <div class="overlay-scroll-content">
        ${lignes.map(([libelle, aide]) => `
            <div class="radio-aide-item">
                <span class="radio-aide-titre">${tr(libelle)}</span>
                <span class="radio-aide-texte">${tr(aide)}</span>
            </div>`).join('')}
        </div>
        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnRadioAideOk" type="button">${tr('BT_OK')}</button>
        </div>
        </div>
        </div>`;
        get('divContainer').appendChild(div);
        shOverlay(div);
        // Fermeture posee en JS sur un bouton identifie, comme partout ailleurs, et non par un
        // onclick en ligne qui remontait au .modal-overlay avec closest() : les autres chemins de
        // sortie -- croix, clic sur le fond, glisser mobile -- passent tous par closeOverlay(div),
        // et le bouton doit emprunter le meme.
        div.querySelector('#btnRadioAideOk').onclick = () => closeOverlay(div);
    }
    // Deux liaisons sur une meme reglette :
    //     fenetre d'ecoute = frequence d'ecoute  +/-  (largeur bande RX / 2)
    // le rectangle, et la porteuse d'emission, le trait plein.
    // La FENETRE n'est jugee contre rien : elle suit des telecommandes qui derivent, s'ecarter de
    // 433,42 y est legitime. L'EMISSION seule se compare au standard -- les moteurs, eux, ne derivent
    // pas, et aucune mesure n'est possible sur une liaison sans retour. L'ancien verdict jugeait
    // l'unique frequence partagee, et accusait donc a tort un reglage d'ecoute correct.
    updateRadioGraph() {
        const g = (id) => document.getElementById(id);
        const freqTx = (parseFloat(g('slidFrequency')?.value) || 433000) / 1000;        // MHz
        const freqCentral = (parseFloat(g('slidRxFrequency')?.value) || 433000) / 1000; // MHz
        const bandeKHz = (parseFloat(g('slidRxBandwidth')?.value) || 5803) / 100;       // kHz
        const demi = (bandeKHz / 2) / 1000;                                             // MHz
        const fMin = freqCentral - demi, fMax = freqCentral + demi;

        // Echelle FIXE : les bornes des curseurs eux-memes. Une echelle qui s'ajuste au contenu
        // fait du surplace -- le dessin garde la meme allure quoi qu'on tourne, puisqu'elle
        // grandit exactement avec lui. Ici un pas de curseur deplace toujours quelque chose.
        // 20 et 760 sont l'origine et la largeur de la piste dans le viewBox (cf. index.html).
        const BAS = 433.000, HAUT = 434.399;
        const X = (f) => 20 + Math.min(Math.max((f - BAS) / (HAUT - BAS), 0), 1) * 760;

        const zone = g('tunerZone');
        if (zone) {
            const x0 = X(fMin), x1 = X(fMax);
            zone.setAttribute('x', x0.toFixed(2));
            // Plancher de 2 px : la bande minimale du CC1101 (58,03 kHz) ne fait que 4 % de la
            // reglette, et un rectangle sans largeur passerait pour un defaut d'affichage.
            zone.setAttribute('width', Math.max(x1 - x0, 2).toFixed(2));
        }
        const centre = g('tunerCenter');
        if (centre) {
            const xc = X(freqCentral).toFixed(2);
            centre.setAttribute('x1', xc); centre.setAttribute('x2', xc);
        }
        const ligneTx = g('tunerTx');
        if (ligneTx) {
            const xt = X(freqTx).toFixed(2);
            ligneTx.setAttribute('x1', xt); ligneTx.setAttribute('x2', xt);
        }
        const ecartKHz = Math.round((freqTx - this.radioDefaults.frequency) * 1000);
        const std = g('spanTxFreqStd');
        if (std) {
            std.textContent = ecartKHz === 0 ? tr('RADIO_TX_FREQ_STD')
                : tr('RADIO_TX_FREQ_OFFSET').replace('{d}', (ecartKHz > 0 ? '+' : '') + ecartKHz);
            std.classList.toggle('off', ecartKHz !== 0);
        }
        if (g('btnTxFreqStd')) g('btnTxFreqStd').disabled = ecartKHz === 0;

        // Les bornes s'affichent TELLES QUELLES, meme hors de la plage reglable : une bande large
        // posee pres d'un bord donne reellement une fenetre qui deborde, et l'arrondir a 433,000
        // ferait croire a une coincidence. Seul le rectangle est borne, parce qu'il ne peut pas
        // sortir de sa piste.
        const mhz = (v) => v.toFixed(3) + ' ' + tr('UNIT_MHZ');
        if (g('graphFreqMin')) g('graphFreqMin').textContent = mhz(fMin);
        if (g('graphFreqCentral')) g('graphFreqCentral').textContent = mhz(freqCentral);
        if (g('graphFreqMax')) g('graphFreqMax').textContent = mhz(fMax);
        // Sous la reglette, la largeur en clair : c'est la valeur du second curseur, au meme
        // endroit que le rectangle qu'elle dimensionne.
        if (g('tunerScaleMid')) g('tunerScaleMid').textContent =
            '↔ ' + bandeKHz.toFixed(2) + ' ' + tr('UNIT_KHZ');

        // preserveAspectRatio="none" interdit tout <text> lisible dans le SVG : ce <title> est le
        // seul support du lecteur d'ecran.
        const title = g('radioGraphTitle');
        if (title) {
            title.textContent = tr('RADIO_TUNER_ALT')
                .replace('{min}', fMin.toFixed(3))
                .replace('{max}', fMax.toFixed(3))
                .replace('{bande}', bandeKHz.toFixed(2))
                .replace('{tx}', freqTx.toFixed(3));
        }
        // Accroche ici plutot qu'aux quatre gestionnaires de curseur : updateRadioGraph() est
        // deja appelee par TOUS les chemins qui changent un reglage -- curseurs, Reinitialiser,
        // assistant, chargement de la page. Un seul point d'appel, donc aucun moyen d'oublier.
        this.updateRadioCurrent();
    }
    // ==========================================================================
    // CHANGER LE SLIDER -> MET À JOUR L'INPUT NUMBER
    // ==========================================================================
    rxBandwidthChanged(el) {
        get('inputRxBandwidth').value = (el.value / 100).fmt('#,##0.00');
        this.updateRadioGraph();
    }

    frequencyChanged(el) {
        get('inputFrequency').value = (el.value / 1000).fmt('#,##0.000');
        this.updateRadioGraph();
    }

    rxFrequencyChanged(el) {
        get('inputRxFrequency').value = (el.value / 1000).fmt('#,##0.000');
        this.updateRadioGraph();
    }

    // Ne touche QUE l'emission. Comme Reinitialiser, remplit le curseur et laisse Enregistrer
    // commettre ; l'evenement change sert a watchDirty() (cf. applyRadioDefaults).
    resetTxFrequency() {
        const el = get('slidFrequency');
        if (!el) return;
        el.value = Math.round(this.radioDefaults.frequency * 1000);
        this.frequencyChanged(el);
        el.dispatchEvent(new Event('change', { bubbles: true }));
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

    // Les bornes se lisent TELLES QUELLES. Le champ nombre porte min="433.000" max="434.399",
    // deja en MHz -- c'est le CURSEUR qui compte en kHz (min="433000"), et la division par 1000
    // qui vivait ici venait de lui. Toute saisie etait donc comparee a [0,433 ; 0,434399] et
    // rejetee, y compris la valeur d'usine : le champ clignotait en rouge puis revenait a ce
    // qu'affichait le curseur. Vu de l'utilisateur, la frequence tapee au clavier n'existait pas
    // et l'accordeur restait fige sur la valeur precedente.
    frequencyInputChanged(el) {
        let val = parseFloat(el.value);
        let minAllowed = parseFloat(el.getAttribute('min'));
        let maxAllowed = parseFloat(el.getAttribute('max'));

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

    rxFrequencyInputChanged(el) {
        const val = parseFloat(el.value);
        if (!isNaN(val) && val >= parseFloat(el.getAttribute('min')) && val <= parseFloat(el.getAttribute('max'))) {
            get('slidRxFrequency').value = Math.round(val * 1000);
            this.updateRadioGraph();
        } else {
            this.showInputError(el);
            this.rxFrequencyChanged(get('slidRxFrequency'));
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

    // Pendant clavier de txPowerChanged(), sur le modèle de ses trois voisines. Seule différence,
    // et elle est structurelle : la valeur saisie doit exister DANS la table (indexOf), un
    // encadrement min/max ne suffit pas -- le CC1101 n'accepte que ces onze niveaux, pas un
    // continuum. Le reste suit la même mécanique : valeur refusée = signalement visuel puis retour
    // à ce qu'affiche le curseur.
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

        // Filtre les deux types de cartes -- l'ancienne version ne touchait qu'aux équipements,
        // laissant les groupes visibles quelle que soit la pièce sélectionnée.
        document.querySelectorAll('.somfyShadeCtl, #divShadeControls .dash-room-title').forEach(x => {
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
    // Recalcule le badge de comptage (équipements + groupes) de chaque pilule de pièce, à partir des
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

            // Même design que les cartes équipement/groupe (setShadesList/setGroupsList) : carte entière
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
        el = get('divRollingCode');
        if (el) el.remove();
        // Pas d'équivalent de get('somfyShade')/get('somfyGroup') ici : contrairement à l'équipement et au
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
        // Ouverture "normale" (depuis la liste des pièces) : jamais un retour vers un équipement/groupe.
        this._roomInlineReturnContext = null;
        confirmDiscardChanges(() => this._openEditRoom(roomId));
    }
    // Création de pièce à la volée depuis l'édition d'un équipement/groupe (bouton + à côté du
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
                        // Création à la volée depuis un équipement/groupe : une fois les listes de
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
        const byRoom = new Map();
        for (let i = 0; i < shades.length; i++) {
            let shade = shades[i];
            let room = _rooms.find(x => x.roomId === shade.roomId) || { roomId: 0, name: '' };
            let isSunOn = (shade.flags & 0x01);
            let st = this.shadeTypes.find(x => x.type === shade.shadeType) || { type: shade.shadeType, ico: 'svg-window-shade', indic: 'svg-indicRoller' };

            // Carrousel de contrôles : le nombre de pages dépend des capacités réelles de l'équipement.
            // - Impulsionnel (garage/portail 1-bouton, contact sec 1-bouton, cf. toggleShadeTypes) :
            //   une seule page, un unique gros bouton (cf. SomfyShade::isToggle()).
            // - Sinon : page Boutons (Haut/My/Bas) systématique, + page Position SI l'équipement a
            //   une position (cf. noMyShadeTypes), + page Inclinaison si l'équipement gère le tilt
            //   (shade.tiltType > 0, ex: BSO/store vénitien).
            // Les deux listes ne se recouvrent pas : le contact sec 2-boutons n'est PAS impulsionnel
            // (il lui faut Haut et Bas) mais n'a pas de position pour autant -- un curseur à 60 %
            // n'aurait aucun sens pour un relais dont le firmware ne lit que `currentPos == 100`.
            const isSimpleShade = this.toggleShadeTypes.includes(shade.shadeType);
            const hasPosition = !this.noMyShadeTypes.includes(shade.shadeType);
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
            <div class="button-outline cmd-button btn-somfy-svg animScale button-sunflag" data-cmd="sunflag" data-shadeid="${shade.shadeId}" data-on="${isSunOn ? 'true' : 'false'}" title="${tr('VR_SUN_FLAG')}" style="${shade.sunSensor ? '' : 'display:none'}"><svg><use href="#svg-sun"></use></svg></div>
            </div>
            </div>`;
            const positionPage = hasPosition ? `
            <div class="carousel-page">
            <div class="slider-wrapper">
            <div class="slider-progress" style="width:${shade.position}%;"><div class="slider-thumb-line"></div></div>
            <input type="range" class="md3-range-input carousel-slider-pos" data-bubble="true" min="0" max="100" step="1" value="${shade.position}" data-realpos="${shade.position}" oninput="syncSliderProgress(this);" onpointerdown="sliderDragStart(this);" onkeydown="sliderDragStart(this, true);" onkeyup="sliderDragEnd(this);" onchange="somfy.commitSliderTarget(this, ${shade.shadeId}, false);">
            </div>
            <div class="button-outline cmd-button btn-somfy-svg animScale btn-page-my" data-cmd="my" data-shadeid="${shade.shadeId}"><svg><use href="#svg-my"></use></svg></div>
            </div>` : '';
            const tiltPage = (hasPosition && shadeHasTilt) ? `
            <div class="carousel-page">

            <div class="slider-wrapper tilt-slider">
            <div class="slider-progress" style="width:${shade.tiltPosition}%;">
            <div class="slider-thumb-line"></div>
            </div>
            <input type="range" class="md3-range-input carousel-slider-tilt" data-bubble="true" min="0" max="100" step="1" value="${shade.tiltPosition}" data-realpos="${shade.tiltPosition}" oninput="syncSliderProgress(this);" onpointerdown="sliderDragStart(this);" onkeydown="sliderDragStart(this, true);" onkeyup="sliderDragEnd(this);" onchange="somfy.commitSliderTarget(this, ${shade.shadeId}, true);">
            </div>

            <div class="button-outline cmd-button btn-somfy-svg animScale btn-page-my" data-cmd="my" data-shadeid="${shade.shadeId}"><svg><use href="#svg-my"></use></svg></div>


            </div>` : '';
            const carouselPages = [buttonsPage, positionPage, tiltPage].filter(p => p !== '');
            const totalPages = carouselPages.length;

            // Carte cliquable (comme .schedule-card) : le crayon d'édition a disparu, tout le corps
            // de la carte ouvre l'édition -- seules la poignée de drag et la poubelle isolent leur
            // clic (event.stopPropagation()) pour ne pas déclencher l'ouverture par accident.
            divCfg += `<div class="somfyShade shade-draggable" draggable="true" data-roomid="${shade.roomId}" data-mypos="${shade.myPos}" data-shadeid="${shade.shadeId}" data-remoteaddress="${shade.remoteAddress}" data-tilt="${shade.tiltType}" data-shadetype="${shade.shadeType}" data-flipposition="${shade.flipPosition ? 'true' : 'false'}" onclick="somfy.openEditShade(${shade.shadeId});"><div class="drag-handle" onclick="event.stopPropagation();"><svg class="icon-svg"><use href=#svg-drag></use></svg></div><div class="shade-icon-wrapper"><svg><use href="#${st.indic}"></use></svg></div><div class="shade-name"><div class="name-text">${escHtml(shade.name)}</div><div class="cfg-room">${escHtml(room.name)}</div></div>${typeof shadeSetup !== 'undefined' ? shadeSetup.badgeHtml(shade) : ''}<div class="idRemoteAddress"><span class="AddrId-label">${tr("ID")}</span><span class="shade-address">${shade.remoteAddress}</span></div><div class="divEditDelete-svg" onclick="event.stopPropagation(); somfy.deleteShade(${shade.shadeId});"><svg class="icon-svg" style="color: var(--color-danger);"><use href=#svg-trash></use></svg></div></div>`;

            const pagesSeg = totalPages > 1 ? `<div class="card-page-seg page-dots" id="carouselDots_${shade.shadeId}">${[['OPT_PAGE_BUTTONS', '<i class="seg-glyph seg-btns"><b></b><b></b><b></b></i>'], ['IS_POSITION', '<i class="seg-glyph seg-bar"><b></b></i>'], ['OPT_PAGE_TILT', '<i class="seg-glyph seg-tilt"></i>']].slice(0, totalPages).map(([k, g], p) => `<button type="button" class="dot${p === 0 ? ' active' : ''}" title="${tr(k)}" onclick="somfy.shadeCarouselGoTo(${shade.shadeId}, ${p});">${g}</button>`).join('')}</div>` : '';
            const iconPos = shade.flipPosition ? 100 - shade.position : shade.position;
            const card = `<div class="somfyShadeCtl" style="${roomId === 0 || roomId === room.roomId ? '' : 'display:none'}" data-shadeid="${shade.shadeId}" data-roomid="${shade.roomId}" data-direction="${shade.direction}" data-remoteaddress="${shade.remoteAddress}" data-position="${shade.position}" data-target="${shade.target}" data-mypos="${shade.myPos}" data-mytiltpos="${shade.myTiltPos}" data-shadetype="${shade.shadeType}" data-tilt="${shade.tiltType}" data-tiltposition="${shade.tiltPosition}" data-tilttarget="${shade.tiltTarget}" data-tiltdirection="${shade.tiltDirection || 0}" data-flipposition="${shade.flipPosition ? 'true' : 'false'}" data-windy="${(shade.flags & 0x10) === 0x10 ? 'true' : 'false'}" data-sunny="${(shade.flags & 0x20) === 0x20 ? 'true' : 'false'}">
            <div class="dash-card-content">
            <div class="dash-card-header">
            <div class="shade-icon" data-shadeid="${shade.shadeId}" onclick="somfy.toggleCardDetails('shade', ${shade.shadeId});">
            <svg class="somfy-shade-icon" data-shadeid="${shade.shadeId}" style="--shade-position:${iconPos}; --fpos:${iconPos}%; --shade-tilt:${shade.tiltType ? shade.tiltPosition : 0}"><use href="#${st.ico}"></use></svg>
            </div>
            <div class="shade-name" onclick="somfy.toggleCardDetails('shade', ${shade.shadeId});">
            <span class="shadectl-name">${escHtml(shade.name)}</span>
            <span class="shadectl-state"><span class="val-pos">${this.shadeStateText(shade)}</span>${shade.tiltType !== 0 ? `<span class="val-tilt"> · ∠ <span class="val-tilt-pos">${shade.tiltPosition}%</span></span>` : ''}<span class="val-my myShade-badge">${this.myBadgeText(shade)}</span></span>
            </div>
            <div class="shadectl-indicators">
            <div class="indicator indicator-wind"><svg><use href="#indic-wind"></use></svg></div>
            <div class="indicator indicator-sun"><svg><use href="#indic-sun"></use></svg></div>
            </div>
            <button type="button" class="card-expand" title="${tr('CARD_DETAILS')}" onclick="somfy.toggleCardDetails('shade', ${shade.shadeId});"><svg><use href="#svg-arrowDown"></use></svg></button>
            </div>
            <div class="shadectl-controls-wrapper">
            ${pagesSeg}
            <div class="controls-carousel-wrapper">
            <div class="carousel-viewport">
            <div class="carousel-track" id="carouselTrack_${shade.shadeId}" data-page="0" data-pages="${totalPages}">
            ${carouselPages.join('')}
            </div>
            </div>
            </div>
            </div>
            <div class="dash-card-details" id="cardDetails_shade_${shade.shadeId}"></div>
            </div>
            </div>`;
            if (!byRoom.has(shade.roomId)) byRoom.set(shade.roomId, []);
            byRoom.get(shade.roomId).push(card);
        }
        const roomOrder = _rooms.map(r => r.roomId).filter(id => byRoom.has(id));
        byRoom.forEach((v, id) => { if (!roomOrder.includes(id)) roomOrder.push(id); });
        const withTitles = _rooms.length > 1;
        roomOrder.forEach(id => {
            if (withTitles) {
                const room = _rooms.find(r => r.roomId === id) || { name: tr('HOME') };
                divCtl += `<div class="dash-room-title" data-roomid="${id}" style="${roomId === 0 || roomId === id ? '' : 'display:none'}"><span>${escHtml(room.name)}</span><span class="dash-room-count"></span></div>`;
            }
            divCtl += byRoom.get(id).join('');
        });
        this.syncVRLayout();
        get('divShadeList').innerHTML = divCfg;
        let shadeControls = get('divShadeControls');
        shadeControls.innerHTML = divCtl;
        this.checkEmptyState();
        // Appui long sur les boutons de commande : maintenir 2s sur up/down déclenche
        // l'inclinaison (équipements avec tilt) -- PLUS sur "my", qui a son propre bouton dédié
        // (icône étoile, onclick direct). Gère aussi le cas où le geste tactile se transforme en
        // défilement de page (touchmove) avant les 2s.
        let btns = shadeControls.querySelectorAll('div.cmd-button');
        const clearTiltTimer = () => {
            if (this.btnTimer) { clearTimeout(this.btnTimer); this.btnTimer = null; }
        };
        const armTiltTimer = (btn, fn) => {
            this.btnTimer = setTimeout(() => { this.btnTimer = null; fn(); }, 2000);
        };
        const onCmdButtonPress = (event) => {
            if (!isPrimaryPress(event)) return;
            const btnEl = event.currentTarget;
            clearTiltTimer();
            let elShade = btnEl.closest('div.somfyShadeCtl');
            let cmd = btnEl.getAttribute('data-cmd');
            let shadeId = parseInt(btnEl.getAttribute('data-shadeid'), 10);
            this.btnDown = new Date().getTime();
            if (cmd === 'sunflag') return;
            if (cmd !== 'my' && makeBool(elShade.getAttribute('data-tilt'))) {
                armTiltTimer(btnEl, () => this.sendTiltCommand(shadeId, cmd));
            }
        };
        const onCmdButtonRelease = (event) => {
            if (!isPrimaryPress(event)) return;
            const btnEl = event.currentTarget;
            let cmd = btnEl.getAttribute('data-cmd');
            let shadeId = parseInt(btnEl.getAttribute('data-shadeid'), 10);
            if (this.btnTimer) {
                clearTiltTimer();
                // Relâché avant le seuil de 2s : simple appui, on envoie la commande. Au-delà,
                // l'action de l'appui long est déjà partie depuis le minuteur.
                if (new Date().getTime() - this.btnDown <= 2000) this.sendCommand(shadeId, cmd);
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
        // Applique les préférences d'interface persistées par équipement (page de carrousel par
        // défaut, visibilité du badge "My") -- cf. getShadeUIPrefs/openShadeCardMenu. Fait après
        // coup plutôt que dans le template ci-dessus car shadeCarouselGoTo() a besoin du
        // data-pages déjà posé sur le DOM pour clamper correctement.
        for (let i = 0; i < shades.length; i++) {
            this.applyShadeUIPrefs(shades[i].shadeId);
        }
        this.updateRoomCounts();
        this.setListDraggable(get('divShadeList'), '.shade-draggable', (list) => {
            let items = list.querySelectorAll('.shade-draggable');
            let order = [];
            for (let i = 0; i < items.length; i++) {
                order.push(parseInt(items[i].getAttribute('data-shadeid'), 10));
            }
            putJSONSync('/shadeSortOrder', order, (err) => {
                if (err) return;
                order.forEach((id, i) => { const sh = (this.shades || []).find(x => x.shadeId === id); if (sh) sh.sortOrder = i; });
                this.setShadesList(this.shades);
            });
        });
        this._syncScheduleIndicators();
    }
    // Déplace le carrousel de contrôles d'une carte équipement vers la page pageIndex (bornée, pas de
    // boucle) : met à jour la translation du track, l'attribut data-page (source de vérité pour la
    // navigation suivante/le swipe) et l'état actif des dots.
    shadeStateText(shade) {
        const type = this.shadeTypeOf(shade);
        if (this.dryContactShadeTypes.includes(type)) return this.shadeStateLabel(shade.position, shade.flipPosition, this.shadeVocabOf(shade));
        const closed = this.closedPosition(type, shade.flipPosition);
        const dir = parseInt(shade.direction, 10) || 0;
        if (dir !== 0) return tr((dir > 0) === (closed === 100) ? 'IS_CLOSING' : 'IS_OPENING');
        if (shade.position === closed) return tr('IS_CLOSED');
        if (shade.position === 100 - closed) return tr('IS_OPEN');
        return `${shade.position}%`;
    }
    myBadgeText(shade) {
        const tiltType = shade.tiltType || 0;
        const myPos = typeof shade.myPos === 'number' ? shade.myPos : -1;
        const myTilt = typeof shade.myTiltPos === 'number' ? shade.myTiltPos : -1;
        if (!this.shadeTypeSupportsMy(this.shadeTypeOf(shade))) return '';
        if (tiltType === 3) return myTilt >= 0 ? ` · My ∠ ${myTilt}%` : '';
        if (myPos < 0) return '';
        return ` · My ${myPos}%${tiltType !== 0 && myTilt >= 0 ? ` ∠ ${myTilt}%` : ''}`;
    }
    toggleCardDetails(kind, id) {
        if (!this._expandedCards) this._expandedCards = new Set();
        const key = `${kind}_${id}`;
        if (this._expandedCards.has(key)) this._expandedCards.delete(key);
        else this._expandedCards.add(key);
        this.refreshCardDetails(kind, id);
    }
    restoreCardDetails(kind) {
        (this._expandedCards || new Set()).forEach(key => {
            const [k, id] = key.split('_');
            if (k === kind) this.refreshCardDetails(k, parseInt(id, 10));
        });
    }
    refreshCardDetails(kind, id) {
        const box = get(`cardDetails_${kind}_${id}`);
        if (!box) return;
        const card = box.closest(kind === 'shade' ? '.somfyShadeCtl' : '.somfyGroupCtl');
        const open = !!(this._expandedCards && this._expandedCards.has(`${kind}_${id}`));
        if (card) card.classList.toggle('is-expanded', open);
        box.innerHTML = open ? (kind === 'shade' ? this.shadeDetailsHtml(id) : this.groupDetailsHtml(id)) : '';
        if (open && !this._cardAgoTimer && box.querySelector('.card-ago')) this._cardAgoTimer = setInterval(() => this.tickCardAgo(), 1000);
    }
    openCardEditor(kind, id) {
        location.hash = _routeSlug(kind === 'shade' ? 'divSomfyMotors' : 'divSomfyGroups', id);
    }
    // lastSentAgo est un écart figé au moment du chargement de /shades : on le convertit une fois en
    // date absolue (_sentAt), que onCardShadeCommand() avance ensuite à chaque émission et que
    // tickCardAgo() relit chaque seconde pour faire vieillir le « il y a » sans rechargement ; le
    // texte n'est réécrit que s'il change, soit une fois par minute passé la première.
    cardAgoText(at) {
        if (typeof shadeSetup !== 'undefined' && typeof shadeSetup.agoText === 'function') return shadeSetup.agoText(at);
        return '';
    }
    tickCardAgo() {
        document.querySelectorAll('#divHomePnl .card-ago[data-at]').forEach(el => {
            const txt = this.cardAgoText(parseInt(el.dataset.at, 10));
            if (el.textContent !== txt) el.textContent = txt;
        });
        if (!document.querySelector('#divHomePnl .card-ago[data-at]')) { clearInterval(this._cardAgoTimer); this._cardAgoTimer = null; }
    }
    // Pendant de shadeSetup.onShadeCommand() pour les cartes du tableau de bord : shadeState ne porte
    // ni la dernière commande envoyée ni le RSSI d'une trame qui ne fait pas bouger l'équipement.
    onCardShadeCommand(msg) {
        const shade = (this.shades || []).find(s => s.shadeId === msg.shadeId);
        if (!shade) return;
        if (msg.source !== 'remote') { shade._sentAt = Date.now(); shade.lastSentAgo = 0; shade.lastSentCmd = msg.cmd; }
        else {
            const r = (shade.linkedRemotes || []).find(x => Number(x.remoteAddress) === Number(msg.sourceAddress));
            if (!r) return;
            r.lastRssi = msg.lastRssi;
        }
        if (this._expandedCards && this._expandedCards.has(`shade_${shade.shadeId}`)) this.refreshCardDetails('shade', shade.shadeId);
    }
    cardSchedulesHtml(kind, id) {
        const rows = (this.schedules || []).some(sc => sc.targetType === kind && sc.targetId === id)
            ? this._buildScheduleTooltipHtml(kind, id).replace(/^<div class="schedule-popover-title">[\s\S]*?<\/div>/, '')
            : `<div class="card-empty">${tr('EMPTY_SCHEDULE_TITLE')}</div>`;
        return `<div class="card-block"><div class="card-block-head"><span>${tr('SUBTAB_SCHEDULES')}</span><button type="button" class="card-link" onclick="somfy.openAddScheduleInline('${kind}', ${id});">${tr('BT_ADD')}</button></div><div class="card-sched">${rows}</div></div>`;
    }
    shadeDetailsHtml(shadeId) {
        const shade = (this.shades || []).find(x => x.shadeId === shadeId);
        if (!shade) return '';
        const type = this.shadeTypeOf(shade);
        const kv = (k, v) => `<div class="card-kv"><span>${k}</span><b>${v}</b></div>`;
        const items = [];
        if (this.shadeTypeSupportsMy(type)) {
            const my = this.myBadgeText(shade).replace(/^ · My /, '');
            items.push(kv(tr('SETMYPOS_TITLE'), `${my || tr('CARD_MY_NONE')} <button type="button" class="card-link" onclick="somfy.openShadeCardMenu(${shadeId});">${tr(my ? 'BT_EDIT' : 'CARD_MY_DEFINE')}</button>`));
        }
        if (shade.tiltType) items.push(kv(tr('OPT_PAGE_TILT'), `${shade.tiltPosition}%`));
        if (typeof shade.lastSentAgo === 'number') {
            const W = typeof shadeSetup !== 'undefined' && shadeSetup.words ? shadeSetup.words(type) : {};
            const cmd = { Up: W.up, Down: W.down }[shade.lastSentCmd] || shade.lastSentCmd || '';
            if (typeof shade._sentAt !== 'number') shade._sentAt = shade.lastSentAgo >= 0 ? Date.now() - shade.lastSentAgo * 1000 : 0;
            items.push(kv(tr('SHADE_ACT_SENT'), shade._sentAt ? `${escHtml(cmd)} · <span class="card-ago" data-at="${shade._sentAt}">${this.cardAgoText(shade._sentAt)}</span>` : tr('SHADE_ACT_NEVER')));
        }
        if (shade.sunSensor) {
            const sunny = (shade.flags & 0x20) === 0x20, windy = (shade.flags & 0x10) === 0x10;
            items.push(kv(tr('CARD_SENSORS'), sunny ? `<span class="card-tag sun">${tr('VR_SUN')}</span>` : windy ? `<span class="card-tag wind">${tr('VR_WIND')}</span>` : tr('CARD_CALM')));
            items.push(kv(tr('VR_SUN_FLAG'), tr((shade.flags & 0x01) ? 'ENABLED' : 'IS_DISABLED')));
        }
        const remotes = (shade.linkedRemotes || []).map(r => {
            let rssi = r.lastRssi;
            if (!(typeof rssi === 'number' && rssi > -128)) rssi = this._getStoredRemoteSignal(r.remoteAddress);
            const has = typeof rssi === 'number' && rssi > -128;
            return `<div class="card-li"><svg><use href="#svg-remote"></use></svg><span>${r.remoteAddress}</span><em class="sig-${has ? this.rssiLevel(rssi) : 'unknown'}">${has ? `${rssi} dBm` : '—'}</em></div>`;
        }).join('');
        return `<div class="card-grid">${items.join('')}</div>
        ${this.cardSchedulesHtml('shade', shadeId)}
        <div class="card-block"><div class="card-block-head"><span>${tr('REMOTESLIST_TITLE')}</span></div>${remotes || `<div class="card-empty">${tr('REMOTESLIST_EMPTY')}</div>`}</div>
        <div class="card-actions">
        <button type="button" class="card-btn" onclick="somfy.openVirtualRemote('shade', ${shadeId});"><svg><use href="#svg-remote"></use></svg>${tr('SUBTAB_VIRTUAL_REMOTE_S')}</button>
        <button type="button" class="card-btn ghost" onclick="somfy.openCardEditor('shade', ${shadeId});"><svg><use href="#svg-edit"></use></svg>${tr('BT_EDIT')}</button>
        <button type="button" class="card-btn ghost" onclick="somfy.openShadeCardMenu(${shadeId});"><svg><use href="#svg-menuVertical"></use></svg>${tr('BT_MORE')}</button>
        </div>`;
    }
    groupDetailsHtml(groupId) {
        const group = (this.groups || []).find(g => g.groupId === groupId);
        if (!group) return '';
        const members = (group.linkedShades || []).map(m => (this.shades || []).find(x => x.shadeId === m.shadeId) || m);
        const rows = members.map(m => {
            const st = this.shadeTypes.find(x => x.type === m.shadeType) || { ico: 'svg-window-shade' };
            const p = m.flipPosition ? 100 - m.position : m.position;
            return `<div class="card-member"><svg class="somfy-shade-icon" style="--shade-position:${p}; --fpos:${p}%; --shade-tilt:${m.tiltType ? m.tiltPosition : 0}"><use href="#${st.ico}"></use></svg><span class="card-member-name"><b>${escHtml(m.name)}</b>${m.sunSensor && (m.flags & 0x01) ? `<svg><title>${tr('VR_SUN_FLAG')}</title><use href="#svg-sun"></use></svg>` : ''}</span><div class="card-bar"><i style="width:${m.position}%"></i></div><em>${m.position}%</em></div>`;
        }).join('');
        return `<div class="card-block"><div class="card-block-head"><span>${tr('GROUP_LINKED_S')}</span></div>${rows || `<div class="card-empty">${tr('GROUP_LINKED_COUNT').replace('{n}', 0)}</div>`}</div>
        ${this.cardSchedulesHtml('group', groupId)}
        <div class="card-actions">
        <button type="button" class="card-btn" onclick="somfy.openVirtualRemote('group', ${groupId});"><svg><use href="#svg-remote"></use></svg>${tr('SUBTAB_VIRTUAL_REMOTE_S')}</button>
        <button type="button" class="card-btn ghost" onclick="somfy.openCardEditor('group', ${groupId});"><svg><use href="#svg-edit"></use></svg>${tr('BT_EDIT')}</button>
        </div>`;
    }
    shadeCarouselGoTo(shadeId, pageIndex) {
        const track = get(`carouselTrack_${shadeId}`);
        if (!track) return;
        const total = parseInt(track.getAttribute('data-pages'), 10) || 1;
        const clamped = Math.max(0, Math.min(total - 1, pageIndex));
        track.style.transform = `translateX(-${clamped * 100}%)`;
        track.setAttribute('data-page', clamped);
        const dots = get(`carouselDots_${shadeId}`);
        if (dots) dots.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === clamped));
        const wrapper = track.closest('.shadectl-controls-wrapper');
        if (wrapper) {
            const prev = wrapper.querySelector('.btn-nav-left');
            const next = wrapper.querySelector('.btn-nav-right');
            if (prev) prev.disabled = clamped === 0;
            if (next) next.disabled = clamped === total - 1;
        }
    }
    closeShadePositioners() {
        let ctls = document.querySelectorAll('.shade-positioner');
        for (let i = 0; i < ctls.length; i++) {
            ctls[i].remove();
        }
        document.querySelectorAll('.card-panel-open').forEach(c => c.classList.remove('card-panel-open'));
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
            <p class="rts-t1">${tr('ERR_RTSDEVICE_0')}</p>
            <p class="rts-t2">${tr('ERR_RTSDEVICE_1')}</p>
            <button type="button" class="rts-btn">${tr('ERR_RTSDEVICE_2')}</button>
            <p class="rts-t3">${tr('ERR_RTSDEVICE_3')}</p></div>`;

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
            // l'ancienne valeur jusqu'au prochain rechargement complet de la liste des équipements.
            const idx = (this.shades || []).findIndex(s => s.shadeId === shadeId);
            if (idx >= 0) Object.assign(this.shades[idx], response);
            // Applique aussi le résultat directement au DOM plutôt que d'attendre une éventuelle
            // diffusion WebSocket : sans ça, .myShade-badge et data-mypos restent figés sur la valeur
            // précédente jusqu'à un tout autre évènement de mouvement sur cet équipement (voir procShadeState,
            // seul autre point de mise à jour de ces éléments), ce qui donnait l'impression d'un
            // décalage d'un cran entre deux sauvegardes successives via ce popup.
            if (response && typeof response.myPos !== 'undefined') {
                document.querySelectorAll(`.somfyShadeCtl[data-shadeid="${shadeId}"]`).forEach(d => {
                    d.dataset.mypos = response.myPos;
                    d.dataset.mytiltpos = response.myTiltPos ?? -1;
                    const myBadge = d.querySelector('.myShade-badge');
                    if (myBadge && idx >= 0) myBadge.textContent = this.myBadgeText(this.shades[idx]);
                });
                this.refreshCardDetails('shade', shadeId);
            }
            ui.successMessage(tr('MSG_SAVE_SUCCESS'));
        });
    }
    // Préférences d'interface par équipement (page de carrousel par défaut, visibilité du badge "My"),
    // purement locales à ce navigateur -- stockées en un seul blob localStorage plutôt que sur
    // l'équipement côté firmware, puisqu'il s'agit de goûts d'affichage et non de configuration du matériel.
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
        const card = document.querySelector(`div.somfyShadeCtl[data-shadeid="${shadeId}"]`);
        const shade = (this.shades || []).find(x => x.shadeId === shadeId);
        if (!card || !shade) return;
        this.closeShadePositioners();

        const shadeType = this.shadeTypeOf(shade);
        const tiltType = shade.tiltType || 0;
        const hasPosition = !this.noMyShadeTypes.includes(shadeType);
        const supportsMy = this.shadeTypeSupportsMy(shadeType);
        const prefs = this.getShadeUIPrefs(shadeId);
        const st = this.shadeTypes.find(x => x.type === shadeType) || { ico: 'svg-window-shade' };

        const pageOptions = [{ value: 0, label: tr('OPT_PAGE_BUTTONS') }];
        if (hasPosition) pageOptions.push({ value: 1, label: tr('IS_POSITION') });
        if (hasPosition && tiltType > 0) pageOptions.push({ value: 2, label: tr('OPT_PAGE_TILT') });
        const pageField = pageOptions.length > 1 ? `
        <div class="positioner-field">
        <span class="positioner-label">${tr('OPT_DEFAULT_CAROUSEL_PAGE')}</span>
        <div class="positioner-seg" id="segCardDefaultPage_${shadeId}">${pageOptions.map(p => `<button type="button" data-page="${p.value}" aria-pressed="${prefs.defaultCarouselPage === p.value ? 'true' : 'false'}">${p.label}</button>`).join('')}</div>
        </div>` : '';
        const badgeField = supportsMy ? `
        <label class="positioner-switch" for="chkCardShowMyBadge_${shadeId}">
        <span class="positioner-label">${tr('OPT_SHOW_MY_BADGE')}</span>
        <span class="switch"><input id="chkCardShowMyBadge_${shadeId}" type="checkbox" ${prefs.showMyBadge ? 'checked' : ''}><div></div></span>
        </label>` : '';

        const myPos = typeof shade.myPos === 'number' ? shade.myPos : -1;
        const myTilt = typeof shade.myTiltPos === 'number' ? shade.myTiltPos : -1;
        const draft = { p: myPos >= 0 ? myPos : shade.position, t: myTilt >= 0 ? myTilt : (shade.tiltPosition || 0) };
        const lbl = shade.flipPosition ? tr('IS_OPEN') : tr('IS_CLOSED');
        const row = (tilt) => {
            const v = tilt ? draft.t : draft.p;
            return `<div class="positioner-row">
            <span class="positioner-axis">${tr(tilt ? 'TILT_SHORT' : 'POS_SHORT')}</span>
            <div class="slider-wrapper${tilt ? ' tilt-slider' : ''}"><div class="slider-progress" style="width:${v}%;"><div class="slider-thumb-line"></div></div><input class="md3-range-input" type="range" min="0" max="100" step="1" value="${v}" data-axis="${tilt ? 't' : 'p'}"></div>
            <span class="positioner-val"><span class="positioner-pct"><span class="positioner-num">${v}</span>&nbsp;%</span><span class="positioner-sens">${lbl}</span></span>
            </div>`;
        };
        const mySection = supportsMy ? `
        <div class="card-panel-sec">
        <div class="card-panel-sec-head"><svg><use href="#svg-favori"></use></svg>${tr('SETMYPOS_TITLE')}<em>${this.myBadgeText(shade).replace(/^ · My /, '') || tr('CARD_MY_NONE')}</em></div>
        <div class="card-panel-my">
        <svg class="somfy-shade-icon card-panel-preview"><use href="#${st.ico}"></use></svg>
        <div class="positioner-rows">${tiltType !== 3 ? row(false) : ''}${tiltType > 0 ? row(true) : ''}</div>
        </div>
        <div class="popup-actions">
        <button type="button" pop data-act="save"></button>
        <button type="button" pop line data-act="current">${tr('CARD_MY_CURRENT')}</button>
        </div>
        </div>` : '';

        const div = document.createElement('div');
        div.className = 'shade-positioner shade-positioner-popup card-panel';
        div.setAttribute('data-shadeid', shadeId);
        div.onclick = (e) => e.stopPropagation();
        div.innerHTML = `
        <div class="shade-positioner-inner">
        <div class="positioner-head">
        <span class="positioner-title"><svg><use href="#svg-menuVertical"></use></svg>${tr('OPTION')}</span>
        <button type="button" pop line data-act="close">${tr('BT_CLOSE')}</button>
        </div>
        <div class="card-panel-name"><svg class="somfy-shade-icon" style="--shade-position:${shade.flipPosition ? 100 - shade.position : shade.position}; --fpos:${shade.flipPosition ? 100 - shade.position : shade.position}%; --shade-tilt:${tiltType ? shade.tiltPosition : 0}"><use href="#${st.ico}"></use></svg><b>${escHtml(shade.name)}</b></div>
        ${pageField || badgeField ? `<div class="card-panel-sec"><div class="card-panel-sec-head"><svg><use href="#svg-eyeOn"></use></svg>${tr('CARD_DISPLAY')}</div><div class="positioner-rows">${pageField}${badgeField}</div></div>` : ''}
        ${mySection}
        </div>`;
        card.classList.add('card-panel-open');
        card.appendChild(div);

        const close = () => {
            div.classList.add('popup-slide-out');
            setTimeout(() => { div.remove(); card.classList.remove('card-panel-open'); }, 300);
        };
        const preview = div.querySelector('.card-panel-preview');
        const btnSave = div.querySelector('[data-act="save"]');
        const paint = () => {
            if (preview) {
                const p = shade.flipPosition ? 100 - draft.p : draft.p;
                preview.style.setProperty('--shade-position', tiltType === 3 ? (shade.flipPosition ? 100 - shade.position : shade.position) : p);
                preview.style.setProperty('--fpos', `${p}%`);
                preview.style.setProperty('--shade-tilt', tiltType ? draft.t : 0);
            }
            if (!btnSave) return;
            const same = tiltType === 3 ? draft.t === myTilt : (draft.p === myPos && (tiltType === 0 || draft.t === myTilt));
            btnSave.textContent = tr(same ? 'BT_CLEAR_MY_POSITION' : 'BT_SET_MY_POSITION');
            btnSave.classList.toggle('card-panel-clear', same);
        };
        div.querySelectorAll('.md3-range-input[data-axis]').forEach(input => {
            input.oninput = () => {
                syncSliderProgress(input);
                input.closest('.positioner-row').querySelector('.positioner-num').textContent = input.value;
                draft[input.dataset.axis] = parseInt(input.value, 10);
                paint();
            };
        });
        const seg = div.querySelector(`#segCardDefaultPage_${shadeId}`);
        if (seg) seg.querySelectorAll('button').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const page = parseInt(btn.getAttribute('data-page'), 10);
                this.setShadeUIPrefs(shadeId, { defaultCarouselPage: page });
                this.shadeCarouselGoTo(shadeId, page);
                seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
            };
        });
        const chk = div.querySelector(`#chkCardShowMyBadge_${shadeId}`);
        if (chk) chk.onchange = () => {
            this.setShadeUIPrefs(shadeId, { showMyBadge: chk.checked });
            this.applyShadeUIPrefs(shadeId);
        };
        div.querySelector('[data-act="close"]').onclick = (e) => { e.preventDefault(); close(); };
        if (btnSave) btnSave.onclick = (e) => {
            e.preventDefault();
            this.sendShadeMyPosition(shadeId, draft.p, draft.t);
        };
        const btnCur = div.querySelector('[data-act="current"]');
        if (btnCur) btnCur.onclick = (e) => {
            e.preventDefault();
            draft.p = shade.position;
            draft.t = shade.tiltPosition || 0;
            div.querySelectorAll('.md3-range-input[data-axis]').forEach(input => {
                input.value = draft[input.dataset.axis];
                syncSliderProgress(input);
                input.closest('.positioner-row').querySelector('.positioner-num').textContent = input.value;
            });
            paint();
        };
        div.querySelectorAll('.md3-range-input[data-axis]').forEach(input => syncSliderProgress(input));
        paint();
        setTimeout(() => {
            document.body.addEventListener('click', close, { once: true });
        }, 100);
    }
    // La liste des télécommandes liées vit dans la zone « Mise en service » de la fiche.
    setLinkedRemotesList(shade) {
        if (typeof shadeSetup !== 'undefined') shadeSetup.renderRemotes(shade);
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
        const level = hasSignal ? this.rssiLevel(rssi) : 'unknown';
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
        // (partagées avec setLinkedShadesList, la liste des équipements liés à un groupe) pour que
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

    procShadeState(state) {
        const g = get, sId = state.shadeId;
        // L'évènement ne rafraîchissait que le DOM : `this.shades` gardait les valeurs du dernier
        // chargement complet. Tout ce qui relit cette liste -- au premier chef vrTarget() pour la
        // télécommande -- travaillait donc sur un instantané périmé. Symptôme observé : un favori
        // d'inclinaison enregistré depuis le tableau de bord n'apparaissait dans la télécommande
        // qu'après un rechargement de page, le bouton restant masqué entre-temps (myTiltPos = -1).
        // `type` est le seul champ dont le nom diffère entre l'évènement et la liste (shadeType).
        const cached = (this.shades || []).find(s => s.shadeId === sId);
        if (cached) {
            Object.assign(cached, state);
            if (typeof state.type !== 'undefined') cached.shadeType = state.type;
        }
        if (this._vrTarget && this._vrTarget.type === 'shade' && this._vrTarget.id === sId) {
            this.updateVRPosition(state);
            // Le type vient de la cible (stable), le mouvement de l'évènement (vivant).
            this.setVRCenterButton(this.vrIsImpulse(this.vrTarget()), this.vrIsMoving(state));
            this.setVRSunFlag(state.flags);
            this.setVRSunSensor(!!state.sunSensor);
            this.setVRTiltMy(state);
        }

        document.querySelectorAll(`.somfy-shade-icon[data-shadeid="${sId}"]`).forEach(ico => {
            const p = state.flipPosition ? 100 - state.position : state.position;
            ico.style.setProperty('--shade-position', p);
            ico.style.setProperty('--fpos', p + '%');
            if (state.tiltType !== 0) ico.style.setProperty('--shade-tilt', state.tiltPosition);
        });
        if (g('spanShadeId')?.innerText == sId) {
            this.setEditorPosValue(this.shadeTypeOf(state), state.position, state.flipPosition, this.shadeVocabOf(state));
            const ed = typeof shadeSetup !== 'undefined' && shadeSetup.editShade && shadeSetup.editShade.shadeId === sId ? shadeSetup.editShade : null;
            if (ed) {
                ['myPos', 'myTiltPos'].forEach(k => { if (typeof state[k] !== 'undefined') ed[k] = state[k]; });
                this.setEditorMyValue(ed);
            }

            const lTC = g('labelTiltContainer');
            if (state.tiltType !== 0) {
                if (lTC) lTC.style.display = 'flex';
                this.setEditorTiltValue(state.tiltPosition);
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
            if (posEl) posEl.innerText = this.shadeStateText(cached || state);
            if (state.tiltType !== 0) {
                const tiltEl = d.querySelector('.val-tilt-pos');
                if (tiltEl) tiltEl.innerText = `${state.tiltPosition}%`;
            }

            // Badge "My" du pied de carte : un seul élément combiné (position + tilt séparés par
            // "·"), pas deux éléments distincts -- on reconstruit tout le contenu à chaque mise à
            // jour plutôt que de cibler des sous-éléments qui n'existent pas dans le template.
            const myBadge = d.querySelector('.myShade-badge');
            if (myBadge) myBadge.textContent = this.myBadgeText(cached || state);

            // Slider(s) du carrousel de contrôles : reflète un mouvement déclenché ailleurs (planning,
            // autre client, ou l'incrémentation en direct du mouvement qu'on vient nous-même de
            // déclencher via ce slider). On n'écrase jamais un slider que l'utilisateur est en train
            // de manipuler -- dataset.dragging (posé par sliderDragStart/sliderDragEnd, cf.
            // 20-shell.js), PAS document.activeElement : un <input type=range> reste l'élément actif
            // bien après le relâchement (jusqu'au clic/tab suivant), donc s'appuyer sur activeElement
            // gelait aussi toutes les mises à jour ultérieures, y compris l'animation de position.
            // dataset.realpos suit TOUJOURS la position réelle, même pendant que l'utilisateur
            // manipule le slider (l'équipement peut déjà être en mouvement quand il le saisit) : c'est
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
        if ((parseInt(state.direction, 10) || 0) === 0 && this._expandedCards && this._expandedCards.has(`shade_${sId}`)) this.refreshCardDetails('shade', sId);
        this.syncGroupMovement(sId);
        // Après syncGroupMovement : le récapitulatif lit les data-moving/data-direction que celui-ci
        // vient de poser sur les cartes groupe.
        this.queueColumnSummary();
    }
    // Témoin de mouvement de la carte GROUPE. La carte équipement n'a besoin de rien -- elle porte
    // déjà data-direction et data-tiltdirection, posés juste au-dessus -- mais l'évènement d'état
    // d'un groupe n'émet aucune direction (SomfyGroup::emitState, côté firmware). Elle se dérive
    // donc des membres, dont this.shades tient les directions à jour.
    // `linkedShades` porte des fiches d'équipement complètes (SomfyGroup::toJSON -> toJSONRef) et
    // non des identifiants nus, mais ces fiches sont l'instantané du dernier chargement de la
    // liste : c'est this.shades qu'il faut relire pour l'état vivant, pas elles.
    // Le sens n'est affiché que s'il fait l'unanimité. Un groupe dont un membre monte pendant qu'un
    // autre descend n'a rien d'honnête à désigner : aucun bouton ne s'accentue, le halo s'allume
    // seul. Une lame qui s'incline compte comme un mouvement mais ne vote pas sur le sens, faute
    // de haut et de bas.
    syncGroupMovement(shadeId) {
        (this.groups || []).forEach(group => {
            const members = (group.linkedShades || []).map(m => m.shadeId);
            if (typeof shadeId !== 'undefined' && !members.includes(shadeId)) return;
            let moving = false, dir = 0, mixed = false;
            members.forEach(id => {
                const shade = (this.shades || []).find(x => x.shadeId === id);
                if (!shade) return;
                const d = shade.direction || 0;
                if (d !== 0 || (shade.tiltDirection || 0) !== 0) moving = true;
                if (d !== 0) {
                    if (dir === 0) dir = d;
                    else if (dir !== d) mixed = true;
                }
            });
            let open = 0, positioned = 0;
            members.forEach(id => {
                const shade = (this.shades || []).find(x => x.shadeId === id);
                if (!shade || this.dryContactShadeTypes.includes(shade.shadeType)) return;
                positioned++;
                if (shade.position !== this.closedPosition(shade.shadeType, shade.flipPosition)) open++;
            });
            document.querySelectorAll(`.somfyGroupCtl[data-groupid="${group.groupId}"]`).forEach(d => {
                d.dataset.moving = moving ? 'true' : 'false';
                d.dataset.direction = mixed ? 0 : dir;
                const openEl = d.querySelector('.groupctl-open');
                if (openEl) openEl.textContent = positioned > 0 ? tr('IS_SUMMARY_OPEN').replace('{n}', open).replace('{t}', positioned) : tr('GROUP_LINKED_COUNT').replace('{n}', members.length);
            });
            if (!moving && this._expandedCards && this._expandedCards.has(`group_${group.groupId}`)) this.refreshCardDetails('group', group.groupId);
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
        // Icône d'ambiance de l'en-tête : suit le type sélectionné immédiatement, sans attendre
        // l'enregistrement -- même source que les cartes et les plannings (shadeTypes[].indic).
        const hdrUse = g('useShadeHeaderIndic');
        if (hdrUse) {
            const href = '#' + (st.indic || 'svg-indicShutter');
            hdrUse.setAttribute('href', href);
            hdrUse.setAttribute('xlink:href', href);
        }
        const hasLift = !!st.lift;
        const supportsMy = this.shadeTypeSupportsMy(type);
        const curTilt = st.tilt ? tilt : 0;
        const showLiftSettings = hasLift && tilt !== 3;
        const disp = (id, cond, d = 'flex') => {
            const e = g(id);
            if (e) e.style.display = cond ? d : 'none';
        };

            disp('divTiltSettings', st.tilt, 'flex');
            disp('divShadeTimings', hasLift, 'flex');
            disp('divSunSensor', st.sun);
            disp('divFlipPosition', st.fpos);
            disp('divFlipCommands', st.fcmd);
            // « Simuler la position favorite » n'a de sens que pour un équipement qui a une
            // position My. Pour les six types de noMyShadeTypes, simMy() n'est consulté par aucune
            // branche que le firmware puisse atteindre : SomfyPositioning teste `!simMy() &&
            // myPos < 0` dans le cas My, or un impulsionnel comme un contact sec a déjà quitté la
            // fonction avant d'y arriver.
            disp('divSimMy', supportsMy);


            const showStepHR = [7, 8, 2, 4, 0].includes(type) || (type === 1 && [2, 3, 4].includes(tilt));

        // Un contact sec n'a pas de course (st.lift est faux) mais il a bien un état à annoncer :
        // la ligne reste, avec le libellé qui convient.
        const isDry = this.dryContactShadeTypes.includes(type);
        // Réglages propres aux interrupteurs. La durée ne s'affiche qu'en mode impulsion : en
        // bistable le contact tient, il n'y a rien à minuter.
        disp('divShadeOutputMode', isDry, 'flex');
        disp('divShadePulseTime', isDry && g('selShadeOutputMode')?.value === '1', 'flex');
        disp('divShadeStateVocab', isDry, 'flex');
        disp('labelPosContainer', (hasLift || isDry) && !isNew);
        this.applyEditorStateRow(type);
        if (!isNew) {
            const cur = (this.shades || []).find(x => x.shadeId === parseInt(g('spanShadeId').innerText, 10));
            if (cur) this.setEditorPosValue(type, cur.position, cur.flipPosition, this.editorVocab(cur));
        }
        disp('labelTiltContainer', curTilt && !isNew);

        // Pour un contact sec, la ligne d'inversion garde tout son sens mais ne parle pas de la même
        // chose : il n'y a pas de « % d'ouverture » à inverser, seulement l'état affiché. Le libellé
        // et sa description suivent donc le type. L'attribut `tr` est mis à jour EN PLUS du texte --
        // le texte sert tout de suite, l'attribut au prochain passage du traducteur (changement de
        // langue, cf. translator.init()), même mécanique que setVRCenterButton.
        const fp = g('divFlipPosition');
        if (fp) {
            const isDry = this.dryContactShadeTypes.includes(type);
            [['.uniLabel', isDry ? 'IS_STATE' : 'IS_POSITION'],
             ['.uniStatus', isDry ? 'DEVICE_STATE_DESC' : 'DEVICE_POSITION_DESC']].forEach(([sel, cle]) => {
                const el = fp.querySelector(sel);
                if (el) { el.setAttribute('tr', cle); el.innerText = tr(cle); }
            });
        }
        if (!st.sun && g('cbHasSunsensor')) g('cbHasSunsensor').checked = false;
        if (!supportsMy && g('cbSimMy')) g('cbSimMy').checked = false;
        this.relayoutOptionGrids();
        const prev = typeof shadeSetup !== 'undefined' && shadeSetup.editShade;
        if (!isNew && prev && prev.shadeId === parseInt(g('spanShadeId').innerText, 10)) {
            const preview = Object.assign({}, prev, { shadeType: type, tiltType: curTilt });
            shadeSetup.renderEditPanel(preview);
            this.setEditorMyValue(preview);
        }
    }
    setEditorMyValue(shade) {
        const row = get('labelMyContainer'), tiltRow = get('labelMyTiltContainer');
        if (!row || !tiltRow) return;
        const my = !!shade && this.shadeTypeSupportsMy(shade.shadeType);
        const st = shade && this.shadeTypes.find(x => x.type === shade.shadeType);
        const showPos = my && shade.myPos >= 0;
        const showTilt = my && !!(st && st.tilt) && shade.tiltType > 0 && shade.myTiltPos >= 0;
        row.style.display = showPos ? 'flex' : 'none';
        tiltRow.style.display = showTilt ? 'flex' : 'none';
        if (showPos) {
            get('valMy').textContent = `${shade.myPos} %`;
            get('valMyTag').textContent = shade.simMy ? tr('CTRL_MY_SIM') : 'My';
        }
        if (showTilt) get('valMyTilt').textContent = `${shade.myTiltPos} %`;
    }
    relayoutOptionGrids() {
        document.querySelectorAll('.options-grid').forEach(grid => {
            const items = [...grid.children];
            items.forEach(e => e.classList.remove('opt-span2'));
            const vis = items.filter(e => getComputedStyle(e).display !== 'none');
            if (vis.length % 2) vis[vis.length - 1].classList.add('opt-span2');
        });
    }
    onShadeBitLengthChanged(el) {
        get('somfyShade').setAttribute('data-bitlength', el.value);
        this.onShadeTypeChanged(el);
    }
    onShadeProtoChanged(el) {
        get('somfyShade').setAttribute('data-proto', el.value);
        this.relayoutOptionGrids();
    }

    showEditShade(bShow) {
        let el = get('divLinkRepeater');
        if (el) el.remove();
        el = get('divRollingCode');
        if (el) el.remove();
        el = get('somfyShade');
        if (el) el.style.display = bShow ? '' : 'none';
        el = get('divShadeListContainer');
        if (el) el.style.display = bShow ? 'none' : '';
        if (!bShow) {
            clearDirty();
            routeSetEditor('divSomfyMotors', null);
        }
        if (bShow) {
            this.showEditGroup(false);
            this.showEditRoom(false);
        }
    }
    // Point d'entrée réel d'ouverture d'un équipement (nouveau ou existant) : garde contre la perte de
    // modifications non enregistrées si un autre équipement/groupe/planning était en cours d'édition
    // (ex: clic sur un autre équipement de la liste sans avoir enregistré le premier).
    // Le retour lumineux par équipement/groupe n'a de sens que si une LED est câblée : sans broche
    // configurée, l'interrupteur promettrait un effet qui ne se produirait jamais. window.__ledPin
    // vient de /loginContext, disponible avant toute ouverture de modale.
    applyLedFeedbackVisibility() {
        const has = typeof window.__ledPin === 'number' && window.__ledPin >= 0;
        document.querySelectorAll('.ledFeedbackRow').forEach(el => { el.style.display = has ? '' : 'none'; });
    }
    openEditShade(shadeId, opts) { confirmDiscardChanges(() => this._openEditShade(shadeId, opts)); }
    _openEditShade(shadeId, opts) {
        const g = get,
        isNew = shadeId === undefined,
        ico = g('icoShade'),
        btns = ['btnSetRollingCode'];

        if (isNew && this.shades?.length >= 30) {
            routeSetEditor('divSomfyMotors', null, { replace: true });
            return ui.errorMessage(g('divSomfySettings'), tr('ERR_DEVICE_LIMIT_REACHED'));
        }

        const s = (id, d) => { const e = g(id); if(e) e.style.display = d; };
        this.applyLedFeedbackVisibility();

        // Si c'est un nouvel équipement, on cache TOUT le bloc. Sinon on l'affiche.
        s('divControlContent', isNew ? 'none' : 'flex');
        // Une programmation cible un shadeId existant : impossible tant que l'équipement n'est pas créé.
        s('divScheduleSectionShade', isNew ? 'none' : 'flex');

        s('divshowSomfyButtons', 'flex');
        btns.forEach(id => s(id, 'none'));
        s('labelPosContainer', 'none');

        getJSONSync(isNew ? '/getNextShade' : `/shade?shadeId=${shadeId}`, (err, shade) => {
            if (err) {
                routeSetEditor('divSomfyMotors', null, { replace: true });
                return (opts && opts.silentError) ? undefined : ui.serviceError(err);
            }

            if (isNew) {
                Object.assign(shade, {
                    name: '', shadeType: 4, roomId: 0, downTime: 10000, upTime: 10000,
                    tiltTimeUp: 7000, tiltTimeDown: 7000, tiltFirstOnOpen: true, tiltFirstOnClose: true,
                    tiltType: 0, flipCommands: 0, flipPosition: 0, paired: 0, position: 0, tiltPosition: 0
                });
            }
            if (!isNew) {
                s('labelPosContainer', 'flex');
                s('btnSetRollingCode', 'flex');

                this.setEditorPosValue(shade.shadeType, shade.position, shade.flipPosition, this.editorVocab(shade));
                this.setLinkedRemotesList(shade);
                // Programmations rattachées à cet équipement (badges, bloc Options) : on recharge la
                // liste à chaque ouverture pour rester à jour même si elle a changé ailleurs.
                this.updateScheduleList(() => this.renderScheduleBadges('divShadeScheduleBadges', 'shade', shadeId));
            }
            if (typeof shadeSetup !== 'undefined') shadeSetup.renderEditPanel(isNew ? null : shade);
            this.setEditorMyValue(isNew ? null : shade);

            // --- Gestion dynamique du Titre, Description et Badge Capacity ---
            const hTitle = g('somfyHeaderTitle'), hDesc = g('somfyHeaderDesc');

            if (hTitle && hDesc) {
                if (isNew) {
                    // Mode Création : Phrase brute sans badge
                    hTitle.innerText = tr('DEVICE_CREATE_TITLE');
                    hDesc.innerText = tr('DEVICE_CREATE_DESC');
                } else {
                    // Mode Édition : Titre + Phrase avec le badge de capacité globale (ex: 2/30)
                    hTitle.innerText = tr('DEVICE_EDIT_TITLE');

                    const currentCount = this.shades ? this.shades.length : 0;
                    const formattedCapacity = `<span class="desc-highlight">${currentCount}/30</span>`;

                    hDesc.innerHTML = tr('DEVICE_EDIT_DESC').replace('%s', formattedCapacity);
                }
            }

            this.setEditorTiltValue(shade.tiltPosition || 0);


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

            // Course, temps morts et lames n'ont plus de champ : leurs tâches de la zone « Mise en
            // service » les règlent.
            ui.toElement(g('somfyShade'), shade);
            if (g('selShadeBitLength')) g('somfyShade').setAttribute('data-bitlength', g('selShadeBitLength').value);
            // data-proto ne vit que posé par onShadeProtoChanged (événement change du select) : sans ce
            // rappel explicite, ui.toElement() ci-dessus remplit bien selShadeProto mais laisse
            // l'attribut à la valeur de l'édition précédente si le nouveau formulaire ne déclenche pas
            // de change (ex: nouvel équipement par défaut sur RTS après avoir quitté un équipement en
            // IO-relay sans enregistrer) -- divGPIOControl restait alors affiché à tort.
            this.onShadeProtoChanged(g('selShadeProto'));
            this.onShadeTypeChanged(g('selShadeType'));
            this.showEditShade(true);
            routeSetEditor('divSomfyMotors', isNew ? 'new' : shadeId, { label: isNew ? tr('DEVICE_CREATE_TITLE') : shade.name });
            // Ne commence à suivre les modifications qu'une fois le formulaire rempli avec les
            // valeurs actuelles, pour ne pas marquer "modifié" ce remplissage programmatique.
            watchDirty(g('somfyShade'));
        });
    }
    // Doublé côté firmware (code -14) : ce contrôle n'existe que pour NOMMER le conflit. Domaine =
    // adresses propres des équipements et des groupes, pas les linkedRemotes (écoutées, pas émises).
    remoteAddressOwner(address, exceptShadeId, exceptGroupId) {
        const addr = Number(address);
        if (!addr) return null;
        const shade = (this.shades || []).find(s => s.shadeId !== exceptShadeId && Number(s.remoteAddress) === addr);
        if (shade) return { name: shade.name, isGroup: false };
        const group = (this.groups || []).find(g => g.groupId !== exceptGroupId && Number(g.remoteAddress) === addr);
        return group ? { name: group.name, isGroup: true } : null;
    }
    // then : appelé après un enregistrement réussi, à la place de la réouverture de la fiche
    // (cf. shadeSetup.fromEdit, qui enregistre la fiche modifiée avant de lancer une tâche).
    saveShade(then) {
        const g = get,
        sId = parseInt(g('spanShadeId').innerText, 10),
        obj = ui.fromElement(g('somfyShade')),
        settings = g('divSomfySettings');

        // Temps de course, temps morts, temps et ordre des lames ne partent plus d'ici : absents de
        // la requête, ils restent tels que leurs tâches les ont enregistrés.
        // Champ de durée d'impulsion vidé : ui.fromElement remonte alors `null`, que le firmware
        // ramènerait à sa borne basse (50 ms) -- une impulsion trop courte pour bien des relais,
        // substituée en silence. On retire plutôt la clé : absente d'une requête, elle laisse la
        // valeur enregistrée inchangée, comme tout le reste de fromJSON.
        if (obj.pulseTime === null || obj.pulseTime === '' || isNaN(obj.pulseTime)) delete obj.pulseTime;

        const checks = [
            [isNaN(obj.remoteAddress) || obj.remoteAddress < 1 || obj.remoteAddress > 16777215, 'ERR_REMOTE_ADDRESS_INVALID'],
            [!obj.name || obj.name.length > 20, 'ERR_DEVIVE_NAME_INVALID'],
        ];

        const basicError = checks.find(c => c[0]);
        if (basicError) return ui.errorMessage(settings, tr(basicError[1]));
        // sId vaut NaN sur une création : rien n'est écarté du balayage, c'est voulu. Le nom part
        // dans un innerHTML.
        const addrOwner = this.remoteAddressOwner(obj.remoteAddress, sId, 255);
        if (addrOwner) return ui.errorMessage(settings, tr(addrOwner.isGroup ? 'ERR_REMOTE_ADDRESS_USED_GROUP' : 'ERR_REMOTE_ADDRESS_USED_DEVICE').replace('{name}', escHtml(addrOwner.name)));
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
            if (typeof then === 'function') return then(shade);
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
                else this.updateScheduleList(() => {
                    const scheduleCount = (this.schedules || []).filter(sc => sc.targetType === 'shade' && sc.targetId === shadeId).length;
                    let prompt = ui.promptMessage(tr('PROMPT_DELETE_DEVICE'), () => {
                        ui.clearErrors();
                        putJSONSync('/deleteShade', { shadeId: shadeId }, (err, shade) => {
                            this.updateShadeList();
                            if (scheduleCount > 0) this.updateScheduleList();
                            prompt.remove();
                        });
                    });
                    const scheduleWarning = scheduleCount > 0 ? `<p>${tr('PROMPT_DELETE_TARGET_SCHEDULES').replace('{n}', scheduleCount)}</p>` : '';
                    prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_DELETE_DEVICE_WARNING")}</p>${scheduleWarning}<p>${tr("PROMPT_DELETE_DEVICE_CONFIRM").replace("{DEVICE_NAME}", escHtml(shade.name))}</p>`;
                });
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
            ${modalHeader('ROLLING_CODE', 'svg-warning', {
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
            <label class="label" for="fldNewRollingCode">${tr("ROLLING_CODE")}</label>
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
            div.querySelector('#btnCancel').onclick = () => requestCloseOverlay(div);
            ui.setFocus(btnCancel, true, 'var(--color-success)');
        });
    }
    // Validation d'un slider du carrousel (position ou inclinaison) : envoie la cible au firmware,
    // puis REPLACE IMMÉDIATEMENT le curseur sur la dernière position réellement connue de l'équipement.
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
        // manipule le slider (l'équipement peut déjà être en mouvement quand il le saisit).
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
        let roomId = document.querySelector('.room-pill.active') ? parseInt(document.querySelector('.room-pill.active').getAttribute('data-roomid'), 10) : 0;

        if (typeof groups !== 'undefined') {
            groups.sort((a, b) => a.sortOrder - b.sortOrder);

            for (let i = 0; i < groups.length; i++) {
                let group = groups[i];
                let room = _rooms.find(x => x.roomId === group.roomId) || { roomId: 0, name: '' };

                let memberCount = typeof group.linkedShades !== 'undefined' ? group.linkedShades.length : 0;
                let isSunActive = (group.flags & 0x01) ? 'true' : 'false';
                let equipmentText = tr('GROUP_LINKED_COUNT').replace('{n}', memberCount);

                // --- Section Configuration ---
                // Même design que la carte équipement (setShadesList) : carte entière cliquable, crayon
                // retiré, poignée/poubelle isolent leur clic (event.stopPropagation()). Seule
                // différence : un unique svg-group fixe dans .shade-icon-wrapper (pas de mapping
                // par type, les groupes n'en ont pas).
                divCfg += `<div class="somfyGroup group-draggable" draggable="true" data-roomid="${group.roomId}" data-groupid="${group.groupId}" data-remoteaddress="${group.remoteAddress}" onclick="somfy.openEditGroup(${group.groupId});"><div class="drag-handle" onclick="event.stopPropagation();"><svg class="icon-svg"><use href=#svg-drag></use></svg></div><div class="shade-icon-wrapper"><svg><use href="#svg-group"></use></svg></div><div class="group-name"><div class="name-text">${escHtml(group.name)}</div><div class="cfg-room">${escHtml(room.name)}</div></div><div class="idRemoteAddress"><span class="AddrId-label">${tr("ID")}</span><span class="group-address">${group.remoteAddress}</span></div><div class="divEditDelete-svg" onclick="event.stopPropagation(); somfy.deleteGroup(${group.groupId});"><svg class="icon-svg" style="color: var(--color-danger);"><use href=#svg-trash></use></svg></div></div>`;

                divCtl += `<div class="somfyGroupCtl" style="${roomId === 0 || roomId === room.roomId ? '' : 'display:none'}" data-groupid="${group.groupId}" data-roomid="${group.roomId}" data-remoteaddress="${group.remoteAddress}">
                <div class="dash-card-content">
                <div class="dash-card-header">
                <div class="group-icon" onclick="somfy.toggleCardDetails('group', ${group.groupId});"><div class="group-icon-wrapper"><svg><use href="#svg-group"></use></svg></div></div>
                <div class="group-name" onclick="somfy.toggleCardDetails('group', ${group.groupId});">
                <span class="groupctl-name">${escHtml(group.name)}</span>
                <span class="groupctl-shades"><span class="groupctl-open">${equipmentText}</span></span>
                </div>
                <button type="button" class="card-expand" title="${tr('CARD_DETAILS')}" onclick="somfy.toggleCardDetails('group', ${group.groupId});"><svg><use href="#svg-arrowDown"></use></svg></button>
                </div>
                <div class="groupctl-buttons">
                <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="up" data-groupid="${group.groupId}" title="${tr("BT_OPEN")}"><svg><use href="#svg-up"></use></svg></div>
                <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="my" data-groupid="${group.groupId}" title="${tr("BT_MY")}"><svg><use href="#svg-my"></use></svg></div>
                <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="down" data-groupid="${group.groupId}" title="${tr("BT_CLOSE")}"><svg><use href="#svg-down"></use></svg></div>
                <div class="button-sunflag cmd-button btn-somfy-svg animScale" data-cmd="sunflag" data-groupid="${group.groupId}" data-on="${isSunActive}" style="${!group.sunSensor ? 'display:none' : ''}" title="${tr("VR_SUN_FLAG")}"><svg><use href="#svg-sun"></use></svg></div>
                </div>
                <div class="dash-card-details" id="cardDetails_group_${group.groupId}"></div>
                </div>
                </div>`;
            }
        }
        this.syncVRLayout();
        get('divGroupList').innerHTML = divCfg;
        let groupControls = get('divGroupControls');
        groupControls.innerHTML = divCtl;
        this.checkEmptyState();
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
        this.syncGroupMovement();
        this.setListDraggable(get('divGroupList'), '.group-draggable', (list) => {
            let items = list.querySelectorAll('.group-draggable');
            let order = [];
            for (let i = 0; i < items.length; i++) {
                order.push(parseInt(items[i].getAttribute('data-groupid'), 10));
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
        const hasShades = (group.linkedShades || []).length > 0;
        get('divSomfyGroupButtons')?.classList.toggle('disabled', !hasShades);
        get('gpMembersBlock')?.classList.toggle('gp-empty', !hasShades);
        ui.setFocus(get('btnLinkShade'), !hasShades);
        groupSetup.renderMembers(group);
    }
    procGroupState(state) {
        logger.debug('Group state update:', state);
        if (this._vrTarget && this._vrTarget.type === 'group' && this._vrTarget.id === state.groupId) {
            this.setVRSunFlag(state.flags);
            this.setVRSunSensor(!!state.sunSensor);
        }
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
        el = get('divRollingCode');
        if (el) el.remove();
        el = get('somfyGroup');
        if (el) el.style.display = bShow ? '' : 'none';
        el = get('divGroupListContainer');
        if (el) el.style.display = bShow ? 'none' : '';
        if (!bShow) {
            clearDirty();
            routeSetEditor('divSomfyGroups', null);
        }
        if (bShow) {
            this.showEditRoom(false);
            this.showEditShade(false);
        }
    }

    openEditGroup(groupId, opts) { confirmDiscardChanges(() => this._openEditGroup(groupId, opts)); }
    _openEditGroup(groupId, opts) {
        const g = get,
        isNew = groupId === undefined,
        elGroup = g('somfyGroup'),
        btnSave = g('btnSaveGroup'),
        btnContainer = g('divSomfyGroupButtons'),
        membersBlock = g('gpMembersBlock'),
        blocPairParent = g('blocPairGroup');

        if (isNew && this.groups?.length >= 14) {
            routeSetEditor('divSomfyGroups', null, { replace: true });
            return ui.errorMessage(g('divSomfySettings'), tr('ERR_GROUP_LIMIT_REACHED'));
        }

        const s = (idOrElem, d) => { const e = (typeof idOrElem === 'string') ? g(idOrElem) : idOrElem; if(e) e.style.display = d; };
        this.applyLedFeedbackVisibility();
        this.relayoutOptionGrids();

        const memberList = g('divGroupMembers');
        if (memberList) memberList.innerHTML = '';

        s(btnContainer, 'flex');
        btnContainer?.classList.toggle('disabled', isNew);
        s(btnSave, 'none');
        s(blocPairParent, 'none');
        s(membersBlock, 'none');
        // Une programmation cible un groupId existant : impossible tant que le groupe n'est pas créé.
        s('divScheduleSectionGroup', isNew ? 'none' : 'flex');

        getJSONSync(isNew ? '/getNextGroup' : `/group?groupId=${groupId}`, (err, group) => {
            if (err) {
                routeSetEditor('divSomfyGroups', null, { replace: true });
                return (opts && opts.silentError) ? undefined : ui.serviceError(err);
            }

            if (isNew) {
                Object.assign(group, {
                    name: '', flipCommands: false, shades: []
                });
            }
            if (!isNew) {
                s(blocPairParent, 'flex');
                s(membersBlock, 'flex');
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
            routeSetEditor('divSomfyGroups', isNew ? 'new' : groupId, { label: isNew ? tr('GROUP_CREATE_TITLE') : group.name });
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
        // groupId vaut NaN sur une création, même exclusion que saveShade.
        const addrOwner = this.remoteAddressOwner(obj.remoteAddress, 255, groupId);
        if (addrOwner) return ui.errorMessage(tr(addrOwner.isGroup ? 'ERR_REMOTE_ADDRESS_USED_GROUP' : 'ERR_REMOTE_ADDRESS_USED_DEVICE').replace('{name}', escHtml(addrOwner.name)));
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
                    else this.updateScheduleList(() => {
                        const scheduleCount = (this.schedules || []).filter(sc => sc.targetType === 'group' && sc.targetId === groupId).length;
                        let prompt = ui.promptMessage(tr('PROMPT_DELETE_GROUP'), () => {
                            putJSONSync('/deleteGroup', { groupId: groupId }, (err, g) => {
                                if (err) ui.serviceError(err);
                                this.updateGroupList();
                                if (scheduleCount > 0) this.updateScheduleList();
                                prompt.remove();
                            });
                        });
                        const scheduleWarning = scheduleCount > 0 ? `<p>${tr('PROMPT_DELETE_TARGET_SCHEDULES').replace('{n}', scheduleCount)}</p>` : '';
                        prompt.querySelector('.sub-message').innerHTML = `${scheduleWarning}<p>${tr("PROMPT_DELETE_GROUP_CONFIRM").replace("{GROUP_NAME}", escHtml(group.name))}</p>`;
                    });
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
                this.setGroupsList(groups);
                if (typeof cb === 'function') cb();
            }
        });
    }
    sendGroupRepeat(groupId, command, repeat, cb, stepSize) {
        let obj = { groupId: groupId, command: command };
        if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        if (typeof stepSize === 'number') obj.stepSize = parseInt(stepSize);
        // Même patron que sendCommandRepeat() : `obj` (repeat/stepSize compris) part en corps JSON,
        // URL sans query string -- WebRadioCommands::handleRepeatCommand ne lit "repeat" que dans la
        // query string OU dans le corps JSON, jamais les deux à la fois.
        putJSON('/repeatCommand', obj, (err, group) => {
            if (typeof cb === 'function') cb(err, group);
        });
    }
    sendGroupCommand(groupId, command, repeat, cb, stepSize) {
        logger.debug(`Sending Group command ${groupId}-${command}`);
        let obj = { groupId: groupId };
        if (isNaN(parseInt(command, 10))) obj.command = command;
        if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        if (typeof stepSize === 'number') obj.stepSize = parseInt(stepSize);
        putJSON('/groupCommand', obj, (err, group) => {
            if (typeof cb === 'function') cb(err, group);
        });
    }


    // =========================================================================
    // SECTION : GESTION DES RÉPÉTEURS (REPEATERS)
    // =========================================================================


    setRepeaterList(addresses) {
        let divCfg = '';
        if (typeof addresses !== 'undefined') {
            for (let i = 0; i < addresses.length; i++) {
                // Même langage visuel que les cartes équipement/groupe/pièce (badge .shade-icon-wrapper,
                // poubelle ghost isolée par event.stopPropagation()), mais sans poignée de drag (pas
                // de réordonnancement) ni cursor:pointer sur la carte (pas d'édition au clic --
                // seule la suppression est possible ici).
                divCfg += `<div class="somfyRepeater" data-address="${addresses[i]}"><div class="shade-icon-wrapper"><svg><use href="#svg-emptyRepeater"></use></svg></div><div class="repeater-name-block"><div class="name-text">${tr("REPEATER_ADDRESS")}</div><div class="cfg-room">${addresses[i]}</div></div><div class="divEditDelete-svg" onclick="event.stopPropagation(); somfy.unlinkRepeater('${addresses[i]}');"><svg class="icon-svg" style="color: var(--color-danger);"><use href=#svg-trash></use></svg></div></div>`;
            }
        }
        get('divRepeatList').innerHTML = divCfg;
        this.checkEmptyState();
    }


    linkRepeatRemote() {
        let div = document.createElement('div');
        div.className = 'inst-overlay';
        div.id = 'divLinkRepeater';
        div.setAttribute('data-type', 'link-repeatremote');

        div.innerHTML = `
        <div class="instructions-content">
        ${overlayHeader("REPEAT_REMOTE_TITLE", "REPEAT_REMOTE_DESC", "svg-repeater", { subtitle: "REPEAT_REMOTE_DESC" })}
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
