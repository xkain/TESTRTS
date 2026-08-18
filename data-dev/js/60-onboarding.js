// Assistant de premier démarrage en DEUX étapes : on demande d'abord comment l'appareil doit
// rejoindre le réseau, puis on ne montre que les réglages correspondant à cette réponse. Le
// panneau unique précédent ne savait exprimer que Wi-Fi OU Ethernet (bascule à deux positions) :
// la combinaison "Ethernet avec repli Wi-Fi" (connType 3, ethernetpref) était donc inatteignable
// depuis l'assistant, alors même que l'avertissement de l'étape Ethernet conseillait de la mettre
// en place -- cf. Network::preferredConnType(), qui fait retomber l'appareil sur le point d'accès
// de configuration si le lien Ethernet tombe sans repli.
// Tout le reste (langue, nom d'hôte, sécurité) se règle toujours mieux une fois sur le réseau
// local : le nom d'hôte est demandé au moment où il devient concret, dans la modale de confirmation
// réseau (cf. Wifi.networkConfirmationOverlay()), et la langue via langPromptToast, volontairement
// supprimé du hotspot (cf. checkBrowserLangSuggestion()) puisqu'aucun téléchargement n'y est
// possible. "Ignorer" reste disponible en haut à droite, à tout moment et aux deux étapes.
class Onboarding {
    // 1 = choix du mode de connexion, 2 = configuration correspondante.
    _step = 1;
    // 'wifi' (connType 1) | 'eth' (connType 2) | 'both' (connType 3, Ethernet + repli Wi-Fi).
    _mode = 'wifi';
    // Type de carte Ethernet choisi par l'utilisateur, mémorisé pour survivre à une réouverture
    // de l'assistant (relaunch() -> open() -> _paint(), qui reconstruit le <select> ; les
    // allers-retours entre étapes, eux, ne le touchent plus -- cf. _populateEthBoardTypes()).
    _ethBoardType = null;

    open() {
        const div = get('divOnboardingWizard');
        if (!div) return;
        this._mode = 'wifi';
        this._step = this._isModeChoiceUseful() ? 1 : 2;
        div.style.display = 'flex';
        this._paint();
    }
    // Le boîtier BOX-WIFI est le seul dépourvu de toute broche Ethernet : la question de l'étape 1
    // n'y admet qu'une seule réponse. On l'escamote entièrement plutôt que de présenter un choix
    // unique, et le bouton Retour de l'étape 2 disparaît avec elle (rien où revenir). Remplace le
    // masquage de l'ancienne ligne de bascule dans _applyHardwareProfile().
    _isModeChoiceUseful() {
        return (window.__hardwareProfile || '') !== 'BOX-WIFI';
    }
    // Seul point qui réécrit l'innerHTML de la carte, et donc seul endroit où poser le garde-fou
    // #divETHSettings. Ce bloc (broches GPIO) est DÉPLACÉ dans la carte quand l'Ethernet est actif
    // (cf. _hostEthSettings()) ; réécrire sans l'avoir restitué d'abord le supprimerait purement et
    // simplement du DOM. Il porte les data-bind que relit Wifi.saveNetwork() : la page Réseau se
    // retrouverait amputée pour tout le reste de la session, et les broches saisies perdues à
    // l'enregistrement.
    // Les DEUX étapes sont rendues d'un coup, côte à côte dans la piste du carrousel : changer
    // d'étape ne fait plus que déplacer la piste (cf. _goToStep()), sans repasser par ici -- c'est
    // ce qui met ce piège hors d'atteinte de la navigation.
    _paint() {
        const div = get('divOnboardingWizard');
        if (!div) return;
        this._hostEthSettings(false);
        div.innerHTML = this._render();
        this._applyHardwareProfile();
        this._applyMode();
        // Sans animation : on prend la position de départ, on ne "glisse" pas vers elle.
        this._goToStep(this._step, false);
    }
    // Glissement d'une étape à l'autre. La piste fait 200% de large et contient deux pages à 50% :
    // afficher l'étape N revient à la décaler de (N-1) x 50% (même calcul que Wifi.slideCarousel()).
    _goToStep(step, animate = true) {
        this._step = step;
        const track = get('onboardingTrack');
        if (track) {
            // Un changement de transform dans la même frame que le passage à 'none' serait quand
            // même animé : on force un reflow entre les deux pour figer l'état sans transition.
            if (!animate) track.style.transition = 'none';
            track.style.transform = `translateX(-${(step - 1) * 50}%)`;
            if (!animate) { void track.offsetWidth; track.style.transition = ''; }
        }
        this._applyStepChrome();
    }
    // L'en-tête (Retour) et le pied (Enregistrer) vivent hors de la piste, ils ne défilent donc pas
    // avec elle : leur visibilité suit l'étape à la main.
    // inert sur la page hors écran : elle reste dans le DOM pendant tout l'assistant, donc dans
    // l'ordre de tabulation. Sans ça, une tabulation depuis l'étape 2 emmènerait le focus sur les
    // cartes de choix invisibles à côté (même raison que la sidebar, cf. setOnboardingLock()).
    _applyStepChrome() {
        const atChoice = (this._step === 1);
        const back = get('onboardingBackBtn');
        if (back) back.style.display = (!atChoice && this._isModeChoiceUseful()) ? '' : 'none';
        const foot = get('onboardingFooter');
        if (foot) foot.style.display = atChoice ? 'none' : '';
        const choice = get('onboardingModePanel');
        const net = get('onboardingNetPanel');
        if (choice) choice.inert = !atChoice;
        if (net) net.inert = atChoice;
    }
    goToModeChoice() {
        this._goToStep(1);
    }
    chooseMode(mode) {
        this._mode = mode;
        this._applyMode();
        this._goToStep(2);
    }
    // Le profil matériel (BOX-WIFI/BOX-ETH/GENERIC) est connu de façon SYNCHRONE ici :
    // window.__hardwareProfile vient de /loginContext (cf. Security.loadContext()), reçu avant même
    // l'ouverture de l'assistant, pas d'un second aller-retour vers /modulesettings une fois
    // l'assistant déjà affiché -- un tel fetch tardif révélait la ligne Ethernet quelques secondes
    // après le premier rendu, changeant la hauteur de la carte entre-temps.
    // Le sélecteur de type de carte reste masqué pour TOUT boîtier BOX (matériel fixe, déjà
    // préréglé), générique uniquement sinon. Même règle que [data-hardwareprofile^="BOX-WIFI"]
    // .ifBOX-Wifi (main.css, page Réseau standard).
    _applyHardwareProfile() {
        const profile = window.__hardwareProfile || '';
        // Wifi.saveNetwork() lit cet attribut (pas window.__hardwareProfile) pour court-circuiter
        // le récapitulatif broches GPIO sur le boîtier BOX-ETH -- même mécanisme que
        // General.loadGeneral(), qui ne s'exécute normalement que si on ouvre la page Système,
        // jamais atteinte pendant l'onboarding.
        const container = get('divContainer');
        if (container) container.setAttribute('data-hardwareprofile', profile);
        const boardRow = get('onboardingEthBoardRow');
        if (boardRow) boardRow.style.display = profile.startsWith('BOX') ? 'none' : '';
    }
    // Les deux étapes sont émises ensemble, dans l'ordre, à l'intérieur de la piste : leur
    // visibilité ne tient qu'à la position de celle-ci (cf. _goToStep()). Le boîtier BOX-WIFI, qui
    // démarre directement à l'étape 2 et n'a pas de bouton Retour, garde la page de choix rendue
    // mais inatteignable -- la piste reste ainsi à deux pages dans tous les cas, sans arithmétique
    // de largeur conditionnelle.
    _render() {
        return `
        <div class="Network-Ap-card" id="onboardingWizardRoot">
            <div class="onboarding-skip-wrap">
                <button id="onboardingBackBtn" type="button" class="onboarding-back" btsText style="display:none;" onclick="onboarding.goToModeChoice();"><svg><use href="#svg-arrowLeft"></use></svg><span>${tr('BT_GO_BACK')}</span></button>
                <button type="button" btsText onclick="onboarding.skip();"><span>${tr('FIRST_CONNECT_SKIP')}</span><svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg></button>
            </div>
            <div class="onboarding-viewport">
                <div id="onboardingTrack" class="onboarding-track">
                    ${this._modeChoicePanel()}
                    ${this._networkPanel()}
                </div>
            </div>
            ${this._footer()}
        </div>`;
    }
    // Étape 1 : la question. Reprend .setup-guide/.welcomeCard (main.css), le motif carte-de-choix
    // déjà utilisé en grille de trois sur l'écran d'accueil vide -- même vocabulaire visuel, aucun
    // style à inventer. Le libellé de la troisième carte est composé à partir des deux clés
    // existantes ("Ethernet" + "Secours Wi-Fi") plutôt que dupliqué dans une clé de plus.
    _modeChoicePanel() {
        const card = (mode, icon, title, desc) => `
                <div class="welcomeCard" onclick="onboarding.chooseMode('${mode}');">
                    <svg><use href="#${icon}"></use></svg>
                    <div class="welcomeCard-content">
                        <h1>${title}</h1>
                        <p>${desc}</p>
                    </div>
                </div>`;
        return `
        <div id="onboardingModePanel" class="onboarding-panel">
            <h1 class="onboarding-panel-title">${tr('FIRST_CONNECT_MODE_TITLE')}</h1>
            <p class="onboarding-panel-desc">${tr('FIRST_CONNECT_MODE_DESC')}</p>
            <div class="setup-guide onboarding-modes">
                ${card('wifi', 'svg-wifi', tr('CONNEXION_WIFI'), tr('FIRST_CONNECT_MODE_WIFI_DESC'))}
                ${card('eth', 'svg-ethernet', tr('CONNEXION_ETHERNET'), tr('FIRST_CONNECT_MODE_ETH_DESC'))}
                ${card('both', 'svg-backWireless', `${tr('CONNEXION_ETHERNET')} + ${tr('CONNEXION_WIFI_FALLBACK')}`, tr('CONNEXION_WIFI_FALLBACK_DESC'))}
            </div>
        </div>`;
    }
    // Étape 2 : les DEUX blocs de réglages, dont la visibilité seule dépend du mode (cf.
    // _applyMode()) -- "Ethernet + repli" les affiche tous les deux, c'est tout ce qui distingue ce
    // mode des deux autres.
    // L'Ethernet pilote en parallèle les VRAIS champs de la page Réseau standard (#cbHardwired,
    // #cbFallbackWireless, #selETHBoardType, hors écran), pour que Wifi.saveNetwork() -- appelé tel
    // quel, sans duplication -- retrouve exactement l'état attendu : bascule interne
    // (Wifi.useEthernetClicked()), auto-remplissage des broches par type de carte
    // (Wifi.onETHBoardTypeChanged()), et le court-circuit déjà en place pour le boîtier BOX-ETH
    // (pas de récapitulatif broches, matériel fixe/validé) vs. le récapitulatif de confirmation
    // existant pour tout matériel générique.
    _networkPanel() {
        return `
        <div id="onboardingNetPanel" class="onboarding-panel">
            <h1 class="onboarding-panel-title">${tr('TAB_NETWORK')}</h1>
            <p id="onboardingNetDesc" class="onboarding-panel-desc" style="display:none;">${tr('FIRST_CONNECT_NET_DESC')}</p>
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
                     ici tant que l'Ethernet est actif -- cf. Onboarding._hostEthSettings(). -->
                <div id="onboardingEthSettingsHost"></div>
            </div>
            <div id="onboardingWifiBlock" style="display:none;">
                <div id="onboardingFallbackInfo" class="information" style="display:none;">
                    <div class="information-text"><span>${tr('CONNEXION_WIFI_FALLBACK_DESC')}</span></div>
                </div>
                <button type="button" class="buttonUpdate unibuttonPad" onclick="onboarding.findWifi();">
                    <div class="uniLeft">
                        <div class="uniblocSvg-S"><svg><use href="#svg-addWifiAuto"></use></svg></div>
                        <div class="devButtonUpdate">
                            <div>${tr('CONNEXION_FIND_WIFI')}</div>
                            <div class="uniStatus">${tr('CONNEXION_FIND_WIFI_DESC')}</div>
                        </div>
                    </div>
                    <svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg>
                </button>
                <button type="button" class="buttonUpdate unibuttonPad" onclick="onboarding.addWifiManual();">
                    <div class="uniLeft">
                        <div class="uniblocSvg-S"><svg><use href="#svg-addWifiManuel"></use></svg></div>
                        <div class="devButtonUpdate">
                            <div>${tr('CONNEXION_ADD_WIFI_MANUAL')}</div>
                            <div class="uniStatus">${tr('CONNEXION_ADD_WIFI_MANUAL_DESC')}</div>
                        </div>
                    </div>
                    <svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg>
                </button>
                <!-- Retour visible après une saisie Wi-Fi : la modale se contente désormais de
                     RETENIR le réseau (cf. findWifi()), sans rien envoyer -- sans ce récapitulatif,
                     la fermeture de la modale donnerait l'impression que rien ne s'est passé. -->
                <div id="onboardingWifiStaged" class="uniRow" style="display:none;">
                    <div class="uniLeft">
                        <div class="uniblocSvg-S"><svg><use href="#svg-ssid"></use></svg></div>
                        <div class="uniText">
                            <div class="uniLabel" id="onboardingWifiStagedLabel"></div>
                            <div class="uniStatus" id="onboardingWifiStagedSsid"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="onboardingEthWarning" class="warning" style="display:none;">
                <div class="warning-header"><svg><use href="#svg-warning"></use></svg><b>${tr('MSG_WARNING')}</b></div>
                <div class="information-text"><span>${tr('FIRST_CONNECT_ETH_WIFI_FALLB_WARNING')}</span></div>
            </div>
        </div>`;
    }
    // Un SEUL bouton d'enregistrement, en pied de carte, pour les trois modes. L'ancien assistant
    // enregistrait le Wi-Fi depuis l'intérieur de la modale de recherche et l'Ethernet depuis le
    // pied : deux points de validation pour une même action, impossibles à concilier dès lors qu'un
    // mode a besoin des deux configurations dans un seul /setNetwork.
    _footer() {
        return `
        <div id="onboardingFooter" class="button-container-overlay onboarding-footer">
            <button id="onboardingSaveBtn" type="button" class="buttonUpdate unibuttonPad" onclick="onboarding.save();">
                <div class="uniLeft">
                    <div class="uniblocSvg-S"><svg><use href="#svg-save"></use></svg></div>
                    <div class="devButtonUpdate">
                        <div>${tr('BT_SAVE')}</div>
                        <div class="uniStatus">${tr('FIRST_CONNECT_SAVE_DESC')}</div>
                    </div>
                </div>
                <svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg>
            </button>
        </div>`;
    }
    // Applique le mode retenu à l'étape 2. Seule la visibilité change d'un mode à l'autre : les
    // deux blocs sont les mêmes, et c'est ce qui rend "Ethernet + repli" quasi gratuit.
    _applyMode() {
        const mode = this._mode;
        const usesEth = (mode !== 'wifi');
        const usesWifi = (mode !== 'eth');
        const show = (id, visible) => { const el = get(id); if (el) el.style.display = visible ? '' : 'none'; };
        show('onboardingEthBlock', usesEth);
        show('onboardingWifiBlock', usesWifi);
        // Le Wi-Fi n'est le réseau principal qu'en mode 'wifi' : en mode 'both' il n'est qu'un
        // secours, et la description "connectez-vous à votre réseau habituel" serait trompeuse --
        // c'est CONNEXION_WIFI_FALLBACK_DESC (#onboardingFallbackInfo) qui prend le relais.
        show('onboardingNetDesc', mode === 'wifi');
        show('onboardingFallbackInfo', mode === 'both');
        this._hostEthSettings(usesEth);
        this._syncRealNetFields(mode);
        if (usesEth) this._populateEthBoardTypes();
        this._updateWifiStaged();
        this._updateEthWarning();
    }
    // Recopie le mode retenu sur les VRAIS champs (hors écran, page Réseau), puis laisse
    // Wifi.useEthernetClicked() en tirer les conséquences, sans dupliquer sa logique. C'est de ces
    // deux cases que Wifi.saveNetwork() déduit le connType : 1, 2 ou 3.
    //
    // Réaffirmé à CHAQUE point de délégation (rendu, entrées Wi-Fi, enregistrement) et pas
    // seulement au changement de mode : Wifi.loadNetwork() s'exécute de façon autonome sur
    // socket.onopen et y écrit `cbHardwired.checked = settings.connType >= 2`, donc potentiellement
    // APRÈS le rendu de l'assistant. Sur un appareil déjà réglé en Ethernet mais retombé sur le
    // point d'accès (lien coupé, cf. Network::preferredConnType()), l'assistant relancé depuis
    // Système affichait "Wi-Fi" pendant que la vraie case disait "Ethernet" : enregistrer un réseau
    // sans fil produisait alors connType >= 2 et partait sur le récapitulatif Ethernet, empilé
    // par-dessus la modale de confirmation déjà ouverte et verrouillée -- le Wi-Fi choisi ne
    // devenait jamais le type de connexion actif.
    _syncRealNetFields(mode) {
        const cbHardwired = get('cbHardwired');
        if (!cbHardwired) return;
        cbHardwired.checked = (mode !== 'wifi');
        const cbFallback = get('cbFallbackWireless');
        if (cbFallback) cbFallback.checked = (mode === 'both');
        wifi.useEthernetClicked();
    }
    // Les deux entrées Wi-Fi passent par ici plutôt que d'appeler wifi.wifiOverlay() directement
    // depuis l'attribut onclick, pour trois raisons. D'abord ouvrir la modale en mode CAPTURE : le
    // rappel passé en 3e argument lui dit de retenir le réseau et de rendre la main, au lieu
    // d'enchaîner sur l'enregistrement -- indispensable en mode 'both', où Ethernet et Wi-Fi
    // doivent partir dans un seul /setNetwork. Ensuite réaffirmer le mode sur les vrais champs
    // (cf. _syncRealNetFields()). Enfin sortir les chaînes traduites du contexte attribut HTML :
    // interpolées dans onclick="...('${tr(...)}')", une simple apostrophe dans la traduction
    // cassait l'attribut et rendait le bouton inerte, sans aucun message d'erreur -- risque bien
    // réel dès qu'une locale téléchargée (relais navigateur, Phase 4 i18n) formule ces libellés
    // autrement.
    findWifi() {
        this._openWifiCapture(tr('CONNEXION_FIND_WIFI'), false);
    }
    addWifiManual() {
        this._openWifiCapture(tr('CONNEXION_ADD_WIFI_MANUAL'), true);
    }
    _openWifiCapture(title, manual) {
        this._syncRealNetFields(this._mode);
        wifi.wifiOverlay(title, manual, () => {
            this._updateWifiStaged();
            this._updateEthWarning();
        });
    }
    // Récapitulatif du réseau retenu mais pas encore enregistré. Le SSID vient d'un champ libre ou
    // d'un scan : posé en textContent, jamais en innerHTML.
    _updateWifiStaged() {
        const row = get('onboardingWifiStaged');
        if (!row) return;
        const ssidFld = get('fldSsid');
        const ssid = ((ssidFld && ssidFld.value) || '').trim();
        row.style.display = ssid ? '' : 'none';
        if (!ssid) return;
        const lbl = get('onboardingWifiStagedLabel');
        const val = get('onboardingWifiStagedSsid');
        if (lbl) lbl.textContent = tr(this._mode === 'both' ? 'CONNEXION_WIFI_FALLBACK' : 'CONNEXION_WIFI');
        if (val) val.textContent = ssid;
    }
    // L'avertissement ne concerne plus que le mode 'both' resté sans réseau de secours saisi :
    // c'est le seul cas où l'utilisateur a demandé un repli sans (encore) l'avoir fourni. En mode
    // 'eth' il a explicitement choisi "Ethernet seul" à l'étape 1 -- le lui reprocher ensuite
    // n'apporte rien, la carte du choix porte déjà la nuance. Et il est désormais ACTIONNABLE
    // depuis l'écran où il s'affiche : le bloc Wi-Fi est juste au-dessus.
    _updateEthWarning() {
        const warn = get('onboardingEthWarning');
        if (!warn) return;
        const ssidFld = get('fldSsid');
        const hasSsid = !!((ssidFld && ssidFld.value) || '').trim();
        warn.style.display = (this._mode === 'both' && !hasSsid) ? '' : 'none';
    }
    _populateEthBoardTypes() {
        const sel = get('onboardingEthBoardType');
        if (!sel || sel.options.length > 0) return;
        // Rempli une seule fois par ouverture de l'assistant (le garde ci-dessus) : on restitue le
        // choix précédent de l'utilisateur s'il en a fait un, sinon on présélectionne WT32-ETH01
        // (val 1), la carte la plus courante -- jamais "Configuration Manuelle" (val 0), qui
        // exposerait d'emblée les broches GPIO. Relire le vrai <select> à la place ne conviendrait
        // pas : Wifi.loadNetwork() y met le boardType de l'appareil, dont la valeur par défaut est
        // justement 0 sur matériel générique (cf. ConfigSettings.h::EthernetSettings).
        wifi.loadETHDropdown(sel, wifi.ethBoardTypes, this._ethBoardType === null ? 1 : this._ethBoardType);
        this.onEthBoardTypeChanged(sel);
    }
    // Répercute le choix sur le VRAI select (hors écran, page Réseau) : c'est lui que
    // Wifi.onETHBoardTypeChanged() utilise pour remplir les broches, et que
    // Wifi.saveNetwork()/ui.fromElement() relira au moment d'enregistrer. C'est aussi lui qui
    // affiche/masque #divETHSettings selon que la carte est "Configuration Manuelle" (val 0) ou
    // non -- rien à piloter ici, le bloc est déjà rapatrié dans le panneau.
    onEthBoardTypeChanged(sel) {
        this._ethBoardType = parseInt(sel.value, 10);
        const realSel = get('selETHBoardType');
        if (realSel) {
            realSel.value = sel.value;
            wifi.onETHBoardTypeChanged(realSel);
        }
    }
    // Rapatrie le VRAI bloc de réglages GPIO (#divETHSettings) dans le panneau tant que l'Ethernet
    // est actif, puis le remet à sa place d'origine sinon. On DÉPLACE le noeud existant plutôt que
    // d'en dupliquer un : c'est lui qui porte les data-bind lus à l'enregistrement, et c'est lui que
    // Wifi.onETHBoardTypeChanged() remplit/affiche selon le type de carte. Le déplacement le sort
    // de #divNetAdapter, d'où la relecture explicite dans Wifi.saveNetwork().
    _hostEthSettings(usesEth) {
        const settings = get('divETHSettings');
        const host = get('onboardingEthSettingsHost');
        if (!settings || !host) return;
        if (usesEth) {
            if (!this._ethSettingsHome) this._ethSettingsHome = settings.parentElement;
            if (settings.parentElement !== host) host.appendChild(settings);
        }
        else if (this._ethSettingsHome && settings.parentElement === host) {
            this._ethSettingsHome.appendChild(settings);
        }
    }
    // Enregistrement, unique pour les trois modes. Wi-Fi seul (connType 1) : saveNetwork() envoie
    // directement, sans passer par la modale nom d'hôte -- on l'ouvre donc nous-mêmes, c'est elle
    // qui rappellera saveNetwork() après validation. Dès qu'il y a de l'Ethernet (connType >= 2),
    // saveNetwork() enchaîne déjà de lui-même sur le récapitulatif broches puis la modale nom
    // d'hôte, il n'y a qu'à le laisser faire.
    save() {
        this._syncRealNetFields(this._mode);
        if (this._mode === 'wifi') {
            const ssidFld = get('fldSsid');
            if (!((ssidFld && ssidFld.value) || '').trim()) {
                // Réutilise la clé existante plutôt que d'en inventer une : "SSID invalide" est un
                // peu large pour "aucun réseau saisi", une clé dédiée serait plus juste (cf. note
                // laissée avec les libellés à écrire).
                ui.errorMessage(tr('ERR_WIFI_SSID_INVALID'));
                return;
            }
            wifi.networkConfirmationOverlay(wifi._currentHostname());
            return;
        }
        wifi.saveNetwork();
    }
    // Persiste "assistant terminé" côté firmware. Volontairement DISSOCIÉ de la transition
    // d'interface (cf. skip()) et exposé pour Wifi.sendNetworkSettings(), qui doit lui l'attendre :
    // le drapeau doit être enregistré AVANT /setNetwork, dont le redémarrage réseau coupe la
    // session en cours.
    // window.__onboardingDone passe à true tout de suite, pas dans le .then : c'est ce drapeau que
    // lisent activateGrpid(), checkEmptyState() et showAuthenticatedShellOrWizard() pour cesser de
    // verrouiller l'écran, et rien de tout ça ne doit attendre le réseau.
    // `retries` par défaut à 0 pour l'appelant pressé (sendNetworkSettings enchaîne aussitôt sur la
    // sauvegarde réseau, il ne peut pas s'offrir plusieurs secondes d'attente) ; skip() en demande
    // quelques-uns puisque, lui, n'attend plus rien.
    markDone(retries = 0) {
        window.__onboardingDone = true;
        return deviceFetch('/setOnboardingDone?done=1', { method: 'POST' })
        .catch(err => {
            if (retries <= 0) throw err;
            return new Promise(res => setTimeout(res, 1500)).then(() => this.markDone(retries - 1));
        });
    }
    // Sortie de l'assistant ("Ignorer", disponible aux deux étapes). Transition en direct vers le
    // tableau de bord plutôt qu'un rechargement de page : évite toute dépendance à la latence du
    // round-trip HTTP juste avant que l'ESP32 ne bascule éventuellement de mode AP à Station.
    //
    // L'interface bascule IMMÉDIATEMENT, sans attendre la réponse de /setOnboardingDone. Faire
    // dépendre la sortie d'un aller-retour réseau la rendait faillible : un rejet de deviceFetch()
    // n'était que journalisé, et laissait l'utilisateur enfermé (assistant toujours affiché,
    // #divAuthenticated masqué, sidebar inerte, activateGrpid() verrouillé par le drapeau resté à
    // false) sans autre issue qu'un rechargement de page -- pour un simple clic sur "Ignorer".
    // La persistance suit en arrière-plan avec quelques réessais ; si elle échoue malgré tout, la
    // seule conséquence est la réapparition de l'assistant au prochain chargement, qu'on signale
    // sans rien bloquer.
    //
    // showAuthenticatedShellOrWizard() (et non une manipulation DOM à la main) rétablit la coque
    // authentifiée -- markDone() vient de passer window.__onboardingDone à true, il prend donc sa
    // branche "pas d'assistant". activateGrpid() se charge ensuite de l'en-tête/du panneau
    // d'accueil ET de rappeler checkEmptyState(), dont le garde-fou laisse lui aussi passer
    // désormais.
    skip() {
        // #divETHSettings a pu être déplacé dans la carte (cf. _hostEthSettings()) : on le restitue
        // AVANT de masquer l'assistant, sinon ce bloc reste orphelin dans un DOM caché -- invisible
        // sur la page Réseau pour le reste de la session, et supprimé à la prochaine ouverture.
        this._hostEthSettings(false);
        const persisted = this.markDone(3);
        showAuthenticatedShellOrWizard();
        activateGrpid('divHomePnl', { updateHash: false });
        persisted.catch(err => {
            logger.error('Failed to persist onboarding completion:', err);
            ui.serviceError(err);
        });
    }
    // Relance manuelle (menu Système) : ouvre directement l'assistant, sans dépendre du mode AP
    // ni recharger la page -- contrairement à showAuthenticatedShellOrWizard(), qui ne gère que
    // l'affichage automatique au tout premier chargement.
    relaunch() {
        const auth = get('divAuthenticated');
        if (auth) auth.style.display = 'none';
        setOnboardingLock(true);
        this.open();
    }
}
var onboarding = new Onboarding();
