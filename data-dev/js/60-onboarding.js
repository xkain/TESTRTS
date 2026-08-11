class Onboarding {
    open() {
        const div = get('divOnboardingWizard');
        if (!div) return;
        div.innerHTML = this._render();
        div.style.display = 'flex';
        this._applyHardwareProfile();
    }
    // La mention/le choix Ethernet n'a de sens que si le matériel le permet réellement -- le
    // profil matériel (BOX-WIFI/BOX-ETH/GENERIC) est déjà connu de façon SYNCHRONE ici :
    // window.__hardwareProfile vient de /loginContext (cf. Security.loadContext()), attendu avant
    // même l'ouverture du Wizard, pas d'un second aller-retour séparé vers /modulesettings une
    // fois le Wizard déjà affiché -- un tel fetch tardif révélait la ligne Ethernet quelques
    // secondes après le premier rendu, changeant la hauteur de la carte entre-temps (les 4 étapes
    // sont égalisées par align-items:stretch sur la plus haute, recalculée en continu). La ligne de
    // bascule Wi-Fi/Ethernet reste masquée pour le boîtier BOX-WIFI (le seul dépourvu de toute
    // broche Ethernet). Même règle que [data-hardwareprofile^="BOX-WIFI"] .ifBOX-Wifi (main.css,
    // page Réseau standard) : le sélecteur de type de carte reste lui masqué pour TOUT boîtier BOX
    // (matériel fixe, déjà préréglé), générique uniquement sinon.
    _applyHardwareProfile() {
        const profile = window.__hardwareProfile || '';
        // Wifi.saveNetwork() lit cet attribut (pas window.__hardwareProfile) pour court-circuiter
        // l'avertissement broches GPIO sur le boîtier BOX-ETH -- même mécanisme que
        // General.loadGeneral(), qui ne s'exécute normalement que si on ouvre la page Système,
        // jamais atteinte pendant l'onboarding.
        const container = get('divContainer');
        if (container) container.setAttribute('data-hardwareprofile', profile);
        const toggleRow = get('onboardingEthToggleRow');
        if (toggleRow) toggleRow.style.display = (profile === 'BOX-WIFI') ? 'none' : '';
        const boardRow = get('onboardingEthBoardRow');
        if (boardRow) boardRow.style.display = profile.indexOf('BOX') === 0 ? 'none' : '';
    }
    // Panneau unique, sans stepper ni navigation multi-étapes : en mode hotspot, la seule chose
    // que l'appareil puisse réellement accomplir est de rejoindre un réseau. Tout le reste
    // (langue, nom d'hôte, sécurité) se règle mieux une fois sur le réseau local -- le nom d'hôte
    // est demandé au moment où il devient concret, dans la modale de confirmation Wi-Fi
    // (cf. Wifi.networkConfirmationOverlay()), et la langue via langPromptToast, volontairement
    // supprimé du hotspot (cf. checkBrowserLangSuggestion()) puisqu'aucun téléchargement n'y est
    // possible. "Ignorer" reste disponible en haut à droite pour sortir sans rien configurer.
    _render() {
        return `
        <div class="wizard Network-Ap-card" id="onboardingWizardRoot">
            <div class="onboarding-skip-wrap">
                <button type="button" btsText onclick="onboarding.skip();"><span>${tr('BT_SKIP_WIZARD')}</span><svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg></button>
            </div>
            ${this._stepNetwork()}
            <div class="button-container-overlay onboarding-panel-footer">
                <p id="onboardingWifiFootNote" class="onboarding-info-text">${tr('ONBOARDING_ETHERNET_NOTE')}</p>
                <button id="onboardingEthSaveBtn" type="button" class="buttonUpdate unibuttonPad" style="display:none;" onclick="onboarding.saveEthernet();">
                    <div class="uniLeft">
                        <div class="uniblocSvg-S"><svg><use href="#svg-save"></use></svg></div>
                        <div class="devButtonUpdate">
                            <div>${tr('BT_SAVE')}</div>
                            <div class="uniStatus">${tr('ONBOARDING_ETH_SAVE_DESC')}</div>
                        </div>
                    </div>
                    <svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg>
                </button>
            </div>
        </div>`;
    }
    // Dernière étape : la sauvegarde Wi-Fi (via wifi.wifiOverlay() -> networkConfirmationOverlay() ->
    // Wifi.sendNetworkSettings(), qui valide déjà onboardingDone avant d'envoyer /setNetwork,
    // cf. sendNetworkSettings()) coupe le hotspot AP. Un utilisateur qui ne veut pas configurer le
    // Wi-Fi maintenant (déjà câblé en Ethernet, ou le fera plus tard depuis Système) reste libre
    // de cliquer directement sur "Terminer" (data-stepid=4, cf. _render()) sans passer par ces
    // boutons -- même effet que "Ignorer", disponible à tout moment.
    // La bascule Wi-Fi/Ethernet (masquée pour le boîtier BOX-WIFI, seul dépourvu de toute broche
    // Ethernet, cf. _applyHardwareProfile()) pilote en
    // parallèle les VRAIS champs de la page Réseau standard (#cbHardwired/#selETHBoardType,
    // hors écran), pour que Wifi.saveNetwork() -- appelé tel quel, sans duplication -- retrouve
    // exactement l'état attendu : bascule interne (Wifi.useEthernetClicked()), auto-remplissage
    // des broches par type de carte (Wifi.onETHBoardTypeChanged()), et surtout le court-circuit
    // déjà en place pour le boîtier BOX-ETH (pas d'avertissement broches, matériel fixe/validé)
    // vs. l'avertissement de confirmation existant pour tout matériel générique.
    _stepNetwork() {
        return `
        <div class="onboarding-step">
            <h1 class="onboarding-step-title">${tr('TAB_NETWORK')}</h1>
            <p class="onboarding-step-desc">${tr('ONBOARDING_NETWORK_DESC')}</p>
            <div id="onboardingEthToggleRow" class="SwitchBig" style="display:none;">
                <input id="onboardingEthSwitch" type="checkbox" onclick="onboarding.onNetModeChanged(this.checked);">
                <label for="onboardingEthSwitch" class="label-left">${tr('CONNEXION_WIFI')}</label>
                <label for="onboardingEthSwitch" class="label-right">${tr('CONNEXION_ETHERNET')}</label>
                <div class="nav-pill"></div>
            </div>
            <div id="onboardingWifiBlock">
                <button type="button" class="buttonUpdate unibuttonPad" onclick="wifi.wifiOverlay('${tr('CONNEXION_FIND_WIFI')}', false);">
                    <div class="uniLeft">
                        <div class="uniblocSvg-S"><svg><use href="#svg-addWifiAuto"></use></svg></div>
                        <div class="devButtonUpdate">
                            <div>${tr('CONNEXION_FIND_WIFI')}</div>
                            <div class="uniStatus">${tr('CONNEXION_FIND_WIFI_DESC')}</div>
                        </div>
                    </div>
                    <svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg>
                </button>
                <button type="button" class="buttonUpdate unibuttonPad" onclick="wifi.wifiOverlay('${tr('CONNEXION_ADD_WIFI_MANUAL')}', true);">
                    <div class="uniLeft">
                        <div class="uniblocSvg-S"><svg><use href="#svg-addWifiManuel"></use></svg></div>
                        <div class="devButtonUpdate">
                            <div>${tr('CONNEXION_ADD_WIFI_MANUAL')}</div>
                            <div class="uniStatus">${tr('CONNEXION_ADD_WIFI_MANUAL_DESC')}</div>
                        </div>
                    </div>
                    <svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg>
                </button>
            </div>
            <div id="onboardingEthBlock" style="display:none;">
                <div id="onboardingEthBoardRow" class="uniRow dirty-target">
                    <div class="uniLeft">
                        <div class="uniblocSvg-S"><svg><use href="#svg-esp"></use></svg></div>
                        <div class="unifield-content">
                            <label class="label" for="onboardingEthBoardType">${tr('CONNEXION_ETH_BOARD_TYPE')}</label>
                            <select id="onboardingEthBoardType" class="inputAndSelect" onchange="onboarding.onEthBoardTypeChanged(this);"></select>
                        </div>
                    </div>
                </div>
                <!-- Accueille le VRAI bloc #divETHSettings (broches GPIO) de la page Réseau, déplacé
                     ici tant que le mode Ethernet est actif -- cf. Onboarding._hostEthSettings(). -->
                <div id="onboardingEthSettingsHost"></div>
                <div id="onboardingEthWarning" class="warning" style="display:none;">
                    <div class="warning-header"><svg><use href="#svg-warning"></use></svg><b>${tr('MSG_WARNING')}</b></div>
                    <div class="information-text"><span>${tr('ONBOARDING_ETH_WIFI_FALLBACK_WARNING')}</span></div>
                </div>
            </div>
        </div>`;
    }
    // Bascule Wi-Fi/Ethernet de l'étape Réseau -- synchronise les VRAIS champs (hors écran) de la
    // page Réseau standard pour que Wifi.saveNetwork()/useEthernetClicked() gardent un état
    // cohérent, sans dupliquer leur logique.
    onNetModeChanged(isEthernet) {
        const wifiBlock = get('onboardingWifiBlock');
        const ethBlock = get('onboardingEthBlock');
        if (wifiBlock) wifiBlock.style.display = isEthernet ? 'none' : '';
        if (ethBlock) ethBlock.style.display = isEthernet ? '' : 'none';
        this._hostEthSettings(isEthernet);
        // Le pied de page accueille l'un OU l'autre selon le mode : la note d'information Ethernet
        // en Wi-Fi (elle explique justement qu'un câble suffit), le bouton d'enregistrement en
        // Ethernet -- épinglé en bas sur mobile dans les deux cas.
        const footNote = get('onboardingWifiFootNote');
        const ethSaveBtn = get('onboardingEthSaveBtn');
        if (footNote) footNote.style.display = isEthernet ? 'none' : '';
        if (ethSaveBtn) ethSaveBtn.style.display = isEthernet ? '' : 'none';
        const cbHardwired = get('cbHardwired');
        if (cbHardwired) {
            cbHardwired.checked = isEthernet;
            wifi.useEthernetClicked();
        }
        if (isEthernet) {
            this._populateEthBoardTypes();
            this._updateEthWarning();
        }
    }
    _populateEthBoardTypes() {
        const sel = get('onboardingEthBoardType');
        if (!sel || sel.options.length > 0) return;
        // Présélectionne WT32-ETH01 (val 1) : la carte la plus courante, jamais "Configuration
        // Manuelle" (val 0) par défaut, pour éviter d'exposer d'emblée les broches GPIO.
        wifi.loadETHDropdown(sel, wifi.ethBoardTypes, 1);
        this.onEthBoardTypeChanged(sel);
    }
    // Répercute le choix sur le VRAI select (hors écran, page Réseau) : c'est lui que
    // Wifi.onETHBoardTypeChanged() utilise pour remplir les broches, et que
    // Wifi.saveNetwork()/ui.fromElement() relira au moment d'enregistrer. C'est aussi lui qui
    // affiche/masque #divETHSettings selon que la carte est "Configuration Manuelle" (val 0) ou
    // non -- rien à piloter ici, le bloc est déjà rapatrié dans le panneau.
    onEthBoardTypeChanged(sel) {
        const realSel = get('selETHBoardType');
        if (realSel) {
            realSel.value = sel.value;
            wifi.onETHBoardTypeChanged(realSel);
        }
    }
    // Rapatrie le VRAI bloc de réglages GPIO (#divETHSettings) dans le panneau tant que le mode
    // Ethernet est actif, puis le remet à sa place d'origine sinon. On DÉPLACE le noeud existant
    // plutôt que d'en dupliquer un : c'est lui qui porte les data-bind lus à l'enregistrement, et
    // c'est lui que Wifi.onETHBoardTypeChanged() remplit/affiche selon le type de carte. Le
    // déplacement le sort de #divNetAdapter, d'où la relecture explicite dans Wifi.saveNetwork().
    _hostEthSettings(isEthernet) {
        const settings = get('divETHSettings');
        const host = get('onboardingEthSettingsHost');
        if (!settings || !host) return;
        if (isEthernet) {
            if (!this._ethSettingsHome) this._ethSettingsHome = settings.parentElement;
            if (settings.parentElement !== host) host.appendChild(settings);
        }
        else if (this._ethSettingsHome && settings.parentElement === host) {
            this._ethSettingsHome.appendChild(settings);
        }
    }
    // N'affiche l'avertissement que si aucun Wi-Fi n'a encore été renseigné (cf. audit demandé :
    // perdre l'Ethernet sans repli Wi-Fi fait retomber l'appareil sur le point d'accès de
    // configuration -- Network::preferredConnType(), pas un blocage total, mais un accès coupé
    // tant qu'il n'est pas rétabli).
    _updateEthWarning() {
        const warn = get('onboardingEthWarning');
        if (!warn) return;
        const ssidFld = get('fldSsid');
        warn.style.display = (ssidFld && ssidFld.value) ? 'none' : '';
    }
    saveEthernet() {
        this._updateEthWarning();
        wifi.saveNetwork();
    }
    skip() {
        this.finish();
    }
    // Transition en direct vers le tableau de bord plutôt qu'un rechargement de page : évite toute
    // dépendance à la latence du round-trip HTTP juste avant que l'ESP32 ne bascule éventuellement
    // de mode AP à Station (réseau configuré). activateGrpid() (et non une manipulation DOM à la
    // main) se charge de remettre en place l'en-tête/le panneau d'accueil ET de rappeler
    // checkEmptyState() -- son garde-fou laisse maintenant passer puisque window.__onboardingDone
    // vient de passer à true.
    finish() {
        deviceFetch('/setOnboardingDone?done=1', { method: 'POST' })
        .then(() => {
            window.__onboardingDone = true;
            const wiz = get('divOnboardingWizard');
            if (wiz) wiz.style.display = 'none';
            document.body.classList.remove('onboarding-active');
            get('divAuthenticated').style.display = '';
            activateGrpid('divHomePnl', { updateHash: false });
        })
        .catch(err => logger.error('Failed to finish onboarding:', err));
    }
    // Relance manuelle (menu Système) : ouvre directement l'assistant, sans dépendre du mode AP
    // ni recharger la page -- contrairement à showAuthenticatedShellOrWizard(), qui ne gère que
    // l'affichage automatique au tout premier chargement.
    relaunch() {
        const auth = get('divAuthenticated');
        if (auth) auth.style.display = 'none';
        document.body.classList.add('onboarding-active');
        this.open();
    }
}
var onboarding = new Onboarding();
