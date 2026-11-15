// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
// Assistant de première connexion, dans la coque wiz- des autres assistants (overlays.css) :
// colonne des étapes à gauche, contenu à droite, pied Retour / Ignorer / action principale.
// Trois étapes : le mode de connexion, les réglages de ce mode (avec le nom d'hôte), puis où
// retrouver l'appareil. Le boîtier BOX-WIFI saute la première, il n'a pas d'Ethernet.
// Ce n'est pas un .modal-overlay : un clic dehors ou clearOverlays() le fermeraient, et laisseraient
// l'utilisateur devant un écran vide (#divAuthenticated est masqué tant qu'il est ouvert).
class Onboarding {
    _step = 'mode';
    // 'wifi' (connType 1) | 'eth' (connType 2) | 'both' (connType 3, Ethernet + repli Wi-Fi).
    _mode = 'wifi';
    // Survit à une réouverture : le <select> est reconstruit à chaque rendu de l'étape.
    _ethBoardType = null;
    // Panneau où revenir en quittant ; null = tableau de bord (vrai premier démarrage).
    _returnGrpid = null;
    // 5 clics sur le titre de l'étape 1 rendent « Ethernet seul » au boîtier BOX : dépannage,
    // remis à false à chaque ouverture.
    _ethModeRevealed = false;
    // null tant qu'on ne sait pas si le firmware connaît déjà l'assistant comme terminé.
    _donePersisted = null;
    // Liste des réseaux proches (WifiNear, 50-wifi.js), recréée à chaque ouverture.
    _near = null;
    _ssid = '';
    _pass = '';
    _host = '';
    _busy = false;

    open() {
        const div = get('divOnboardingWizard');
        if (!div) return;
        this._mode = this._modeChoices()[0];
        this._ethModeRevealed = false;
        this._returnGrpid = null;
        this._near = new WifiNear('onbNets', { picked: () => this._ssid, onPick: (name) => this._pickNet(name) });
        this._busy = false;
        this._ssid = ((get('fldSsid') || {}).value || '').trim();
        this._pass = '';
        this._host = wifi._currentHostname();
        this._step = this._isModeChoiceUseful() ? 'mode' : 'net';
        this._hostEthSettings(false);
        this._applyHardwareProfile();
        div.innerHTML = `<div class="wiz-window onb-window">
            <aside class="wiz-side onb-side">
            <div class="onb-brand"><svg class="onb-logo"><use href="#svg-logo"></use></svg><span>ESPSomfy-RTS</span>
            <button type="button" class="wiz-link onb-skip-in" onclick="onboarding.skip()">${tr('BT_IGNORE')}</button></div>
            <div class="onb-welcome"><h2 class="wiz-title">${tr('FIRST_CONNECT_WELCOME')}</h2><p class="onb-welcome-desc"></p></div>
            <ol class="wiz-steps"></ol><div class="wiz-pbar" aria-hidden="true"></div>
            ${isApMode ? `<p class="onb-ap">${tr('FIRST_CONNECT_AP_NOTE')}</p>` : ''}
            </aside>
            <section class="wiz-main"></section>
            <footer class="wiz-foot"></footer></div>`;
        div.style.display = 'flex';
        this._render();
    }
    _isModeChoiceUseful() {
        return (window.__hardwareProfile || '') !== 'BOX-WIFI';
    }
    // Un boîtier BOX n'a rien à régler côté Ethernet : « Ethernet seul » mènerait à une étape vide.
    _boxAuto() {
        return (window.__hardwareProfile || '').startsWith('BOX') && !this._ethModeRevealed;
    }
    _modeChoices() {
        if (!this._isModeChoiceUseful()) return ['wifi'];
        return this._boxAuto() ? ['wifi', 'both'] : ['wifi', 'eth', 'both'];
    }
    // Wifi.saveNetwork() lit l'attribut de #divContainer, pas window.__hardwareProfile, pour
    // sauter le récapitulatif des broches du BOX-ETH ; la page Système qui le pose n'est jamais
    // atteinte pendant l'assistant.
    _applyHardwareProfile() {
        const container = get('divContainer');
        if (container) container.setAttribute('data-hardwareprofile', window.__hardwareProfile || '');
    }
    _revealEthMode() {
        if (this._ethModeRevealed) return;
        this._ethModeRevealed = true;
        this._render();
    }
    $(sel) { return document.querySelector(`#divOnboardingWizard ${sel}`); }

    _render() {
        // #divETHSettings (broches, data-bind lus par saveNetwork()) peut se trouver dans la tuile
        // Ethernet : réécrire le contenu sans l'avoir rendu à la page Réseau le supprimerait.
        this._hostEthSettings(false);
        this._renderSide();
        this._renderMain();
        this._renderFoot();
    }
    _steps() {
        const s = [];
        if (this._isModeChoiceUseful()) s.push(['mode', 'FIRST_CONNECT_STEP_MODE', 'FIRST_CONNECT_STEP_MODE_DESC']);
        s.push(['net', 'FIRST_CONNECT_STEP_NET', this._mode === 'eth' ? 'FIRST_CONNECT_STEP_NET_ETH' : 'FIRST_CONNECT_STEP_NET_WIFI']);
        s.push(['done', 'FIRST_CONNECT_STEP_DONE', 'FIRST_CONNECT_STEP_DONE_DESC']);
        return s;
    }
    _renderSide() {
        const steps = this._steps(), cur = steps.findIndex(x => x[0] === this._step);
        const bar = wizStepsHtml(steps.map(([, t, d], i) => ({ title: tr(t), desc: tr(d), state: i === cur ? 'on' : i < cur ? 'done' : '' })));
        this.$('.wiz-steps').innerHTML = bar.steps;
        this.$('.wiz-pbar').innerHTML = bar.bar;
        this.$('.onb-welcome-desc').textContent = tr('FIRST_CONNECT_WELCOME_DESC').replace('{N}', steps.length);
    }
    _head(title) {
        const steps = this._steps(), cur = steps.findIndex(x => x[0] === this._step);
        const kick = tr('FIRST_CONNECT_KICK').replace('{N}', cur + 1).replace('{T}', steps.length);
        const mode = this._step === 'net' ? ' · ' + this._modeLabel() : '';
        return `<div class="wiz-head"><div class="wiz-kick">${kick}${mode}</div><h2 class="wiz-h">${title}</h2></div>`;
    }
    _modeLabel(m = this._mode) {
        return m === 'eth' ? tr('CONNEXION_ETHERNET')
            : m === 'both' ? `${tr('CONNEXION_ETHERNET')} + ${tr('CONNEXION_WIFI_FALLBACK')}` : tr('CONNEXION_WIFI');
    }
    _renderMain() {
        const main = this.$('.wiz-main');
        main.scrollTop = 0;
        if (this._step === 'mode') main.innerHTML = this._modeHtml();
        else if (this._step === 'net') main.innerHTML = this._netHtml();
        else main.innerHTML = this._doneHtml();
        if (this._step === 'mode') initMultiClickToggle('#divOnboardingWizard .wiz-h', () => this._revealEthMode(), 5);
        if (this._step === 'net') this._mountNet();
    }

    // ---------- Étape 1 : le mode de connexion ----------
    _modeHtml() {
        const cards = {
            wifi: ['svg-wifi', tr('CONNEXION_WIFI'), tr('FIRST_CONNECT_MODE_WIFI_DESC'), tr('FIRST_CONNECT_MODE_TAG')],
            eth: ['svg-ethernet', tr('CONNEXION_ETHERNET'), tr('FIRST_CONNECT_MODE_ETH_DESC')],
            both: ['svg-backWireless', this._modeLabel('both'), tr('FIRST_CONNECT_MODE_BOTH_DESC')]
        };
        return `${this._head(tr('FIRST_CONNECT_MODE_TITLE'))}
            <p class="wiz-lead">${tr('FIRST_CONNECT_MODE_DESC')}</p>
            <div class="onb-cards">${this._modeChoices().map(m => {
                const [ico, title, desc, tag] = cards[m], on = m === this._mode;
                return `<button type="button" class="onb-card${on ? ' on' : ''}" aria-pressed="${on}" onclick="onboarding.pickMode('${m}')">
                <span class="onb-card-ico"><svg><use href="#${ico}"></use></svg></span><b>${title}</b>
                <span class="onb-card-desc">${desc}</span>${tag ? `<span class="onb-card-tag">${tag}</span>` : ''}</button>`;
            }).join('')}</div>${this._restoreHtml()}`;
    }
    pickMode(mode) {
        this._mode = mode;
        this._goTo('net');
    }
    // Entrée de restauration, sur le premier écran rencontré : « mode », ou « net » quand le choix
    // du mode est sauté (BOX-WIFI). Ouvre la fenêtre de restauration de l'onglet Appareil,
    // préréglée migration : tout sauf le réseau, que l'assistant configure juste après.
    _restoreHtml() {
        return `<p class="onb-restore">${tr('WELCOME_REPLACE')} <a href="#" onclick="onboarding.openRestore(); return false;">${tr('WELCOME_RESTORE_LINK')}</a></p>`;
    }
    openRestore() { firmware.restore({ migrate: true }); }
    _goTo(step) {
        this._step = step;
        this._render();
    }

    // ---------- Étape 2 : les réglages du mode ----------
    _netHtml() {
        const m = this._mode, usesEth = m !== 'wifi', usesWifi = m !== 'eth', box = this._boxAuto();
        const title = tr(m === 'eth' ? 'FIRST_CONNECT_NET_TITLE_ETH' : m === 'both' ? 'FIRST_CONNECT_NET_TITLE_BOTH' : 'FIRST_CONNECT_NET_TITLE_WIFI');
        const lead = tr(m === 'wifi' ? 'FIRST_CONNECT_NET_LEAD_WIFI' : box ? 'FIRST_CONNECT_ETH_BOX_DESC'
            : m === 'eth' ? 'FIRST_CONNECT_ETH_SECTION_DESC' : 'FIRST_CONNECT_NET_LEAD_BOTH');
        // Tuiles numérotées dans l'ordre où on les remplit : le nombre dépend du mode.
        let n = 0;
        const h = (key) => `<h3 class="onb-tile-h"><span class="wiz-sec-n">${++n}</span>${tr(key)}</h3>`;
        const eth = !usesEth ? '' : `<div class="gen-tile">${h(box ? 'FIRST_CONNECT_T_ETH_BOX' : 'FIRST_CONNECT_T_ETH_BOARD')}
            ${box ? '' : `<div class="gen-field"><label class="gen-field-label" for="onbEthBoard">${tr('SETTINGS_BOARD_TYPE')}</label>
            <div class="gen-input-box"><select id="onbEthBoard" class="gen-input" onchange="onboarding.onEthBoardTypeChanged(this)"></select></div></div>
            <div id="onbEthSettingsHost"></div>`}
            <p class="gen-tile-desc">${tr('FIRST_CONNECT_ETH_AUTO')}</p></div>`;
        const wifiTiles = !usesWifi ? '' : `<div class="gen-tile">${h(m === 'both' ? 'FIRST_CONNECT_T_NETS_FALLBACK' : 'FIRST_CONNECT_T_NETS')}
            <div id="onbNets" class="wifi-near"></div></div>
            <div class="gen-tile">${h('FIRST_CONNECT_T_PASS')}
            <div class="gen-field"><label class="gen-field-label" for="onbSsid">${tr('CONNEXION_WIFI_SSID')}</label>
            <div class="gen-input-box"><input id="onbSsid" class="gen-input" type="text" maxlength="32" autocomplete="off" placeholder="${escAttr(tr('FIRST_CONNECT_SSID_PLH'))}" value="${escAttr(this._ssid)}" oninput="onboarding.onSsid(this.value)"></div></div>
            <div class="gen-field"><label class="gen-field-label" for="onbPass">${tr('SECURITY_PASSWORD')}</label>
            <div class="gen-input-box"><input id="onbPass" class="gen-input" type="password" maxlength="64" autocomplete="new-password" value="${escAttr(this._pass)}" oninput="onboarding.onPass(this.value)">
            <div class="password-eye" onclick="security.toggleFieldPassword('onbPass', this)"><svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg></div></div></div>
            <p class="gen-tile-desc">${tr('FIRST_CONNECT_PASS_HINT')}</p></div>`;
        const host = `<div class="gen-tile">${h('FIRST_CONNECT_T_HOST')}
            <div class="gen-field"><label class="gen-field-label" for="onbHost">${tr('GENERAL_HOSTNAME')}</label>
            <div class="gen-input-box"><input id="onbHost" class="gen-input" type="text" maxlength="31" autocomplete="off" value="${escAttr(this._host)}" oninput="onboarding.onHost(this.value)"></div></div>
            <p class="gen-tile-desc">${tr('FIRST_CONNECT_HOSTNAME_DESC')}</p>
            <span class="onb-addr" id="onbAddr" style="--chars: ${this._hostUrl().length}">${escHtml(this._hostUrl())}</span></div>`;
        return `${this._head(title)}<p class="wiz-lead">${lead}</p><div class="wiz-grid">${eth}${wifiTiles}${host}</div>${this._isModeChoiceUseful() ? '' : this._restoreHtml()}`;
    }
    _mountNet() {
        const usesEth = this._mode !== 'wifi';
        this._syncRealNetFields();
        if (usesEth && !this._boxAuto()) {
            this._populateEthBoardTypes();
            this._hostEthSettings(true);
        }
        if (this._mode !== 'eth') {
            // Ici on cherche tout de suite : l'assistant ne sert qu'en point d'accès ou sur demande.
            if (this._near.nets === undefined) this._near.scan();
            else this._near.render();
        }
    }
    // Le mode retenu est recopié sur les VRAIS champs de la page Réseau, hors écran, d'où
    // Wifi.saveNetwork() déduit le connType. Réaffirmé à chaque délégation : Wifi.loadNetwork()
    // peut réécrire #cbHardwired après le rendu (socket.onopen), et un Wi-Fi enregistré partait
    // alors en connType 2 sur un appareil déjà réglé en Ethernet.
    _syncRealNetFields() {
        const cbHardwired = get('cbHardwired');
        if (!cbHardwired) return;
        cbHardwired.checked = (this._mode !== 'wifi');
        cbHardwired.parentElement.classList.remove('sel-pending');
        const cbFallback = get('cbFallbackWireless');
        if (cbFallback) cbFallback.checked = (this._mode === 'both');
        wifi.useEthernetClicked();
    }
    _populateEthBoardTypes() {
        const sel = get('onbEthBoard');
        if (!sel) return;
        // La valeur 0 de l'appareil (« Configuration manuelle ») est aussi le défaut d'usine du
        // matériel générique : la retenir ouvrirait l'assistant sur les broches. On part alors de
        // WT32-ETH01, la plus courante.
        const realSel = get('selETHBoardType');
        const deviceType = realSel ? parseInt(realSel.value, 10) : NaN;
        const preselect = (this._ethBoardType !== null) ? this._ethBoardType : ((deviceType > 0) ? deviceType : 1);
        wifi.loadETHDropdown(sel, wifi.ethBoardTypes, preselect);
        this.onEthBoardTypeChanged(sel);
    }
    // Le vrai select remplit les broches et affiche #divETHSettings en « Configuration manuelle ».
    onEthBoardTypeChanged(sel) {
        this._ethBoardType = parseInt(sel.value, 10);
        const realSel = get('selETHBoardType');
        if (realSel) {
            realSel.value = sel.value;
            wifi.onETHBoardTypeChanged(realSel);
        }
    }
    // On DÉPLACE le bloc de broches de la page Réseau plutôt que de le copier : c'est lui qui
    // porte les data-bind, et saveNetwork() le relit à part quand il n'est plus dans #divNetAdapter.
    _hostEthSettings(usesEth) {
        const settings = get('divETHSettings');
        if (!settings) return;
        const host = get('onbEthSettingsHost');
        if (usesEth && host) {
            if (!this._ethSettingsHome) this._ethSettingsHome = settings.parentElement;
            if (settings.parentElement !== host) host.appendChild(settings);
        }
        else if (this._ethSettingsHome && settings.parentElement !== this._ethSettingsHome) {
            this._ethSettingsHome.appendChild(settings);
        }
    }
    // Réseau choisi : le nom se remplit et la main passe au mot de passe ; vide = réseau caché.
    _pickNet(name) {
        const ssid = get('onbSsid');
        if (!ssid) return;
        ssid.value = name;
        this.onSsid(name);
        (name ? get('onbPass') : ssid).focus();
    }
    // Les identifiants vont aussitôt dans les vrais champs, que saveNetwork() relit.
    onSsid(v) {
        this._ssid = v.trim();
        const real = get('fldSsid');
        if (real) real.value = this._ssid;
        this._renderFoot();
    }
    onPass(v) {
        this._pass = v;
        const real = get('fldPassphrase');
        if (real) {
            real.value = v;
            real.dataset.secretDummy = 'false';
        }
        this._renderFoot();
    }
    onHost(v) {
        this._host = v.trim();
        const addr = get('onbAddr');
        if (addr) {
            addr.textContent = this._hostUrl();
            addr.style.setProperty('--chars', this._hostUrl().length);
        }
        this._renderFoot();
    }
    _hostUrl() {
        return `http://${(this._host || 'espsomfyrts').toLowerCase()}.local`;
    }
    // Le scan ne dit pas si un réseau est protégé : un mot de passe vide reste permis (réseau
    // ouvert, ou mot de passe déjà enregistré et inchangé), seule une longueur WPA impossible bloque.
    _netHint() {
        if (this._mode !== 'eth') {
            if (!this._ssid) return tr(this._mode === 'both' ? 'FIRST_CONNECT_HINT_FALLBACK' : 'FIRST_CONNECT_HINT_WIFI');
            if (this._pass.length > 0 && this._pass.length < 8) return tr('FIRST_CONNECT_HINT_PASS');
        }
        if (!this._host || !/^[a-zA-Z0-9-]+$/.test(this._host)) return tr('ERR_HOSTNAME_CHARS');
        // char hostname[32] côté firmware : au-delà de 31, le nom serait coupé en silence.
        if (this._host.length > 31) return tr('ERR_HOSTNAME_LENGTH');
        return '';
    }
    save() {
        if (this._busy || this._netHint()) return;
        this._busy = true;
        this._renderFoot();
        this._syncRealNetFields();
        // Le nom d'hôte part dans le même /setNetwork que le réseau ; saveNetwork() ouvre encore le
        // récapitulatif des broches sur carte générique avant d'envoyer.
        wifi.saveNetwork({
            hostname: this._host !== (window.__currentHostname || '') ? this._host : undefined,
            onSent: () => this._goTo('done'),
            onFail: () => { this._busy = false; this._renderFoot(); }
        });
    }

    // ---------- Étape 3 : où retrouver l'appareil ----------
    _doneHtml() {
        const target = this._mode === 'eth' ? tr('FIRST_CONNECT_DONE_CABLE') : `« ${escHtml(this._ssid)} »`;
        const url = this._hostUrl();
        let n = 0;
        const h = (key) => `<h3 class="onb-tile-h"><span class="wiz-sec-n">${++n}</span>${tr(key)}</h3>`;
        // Le lien ne répond qu'une fois revenu sur son réseau : c'est ce que dit la tuile.
        return `${this._head(tr('FIRST_CONNECT_DONE_TITLE').replace('{target}', target))}
            <p class="wiz-ok"><svg><use href="#svg-check"></use></svg>${tr('FIRST_CONNECT_DONE_OK')}</p>
            <div class="wiz-grid onb-done">
            <div class="gen-tile">${h('FIRST_CONNECT_DONE_BACK_T')}<p class="gen-tile-desc">${tr('FIRST_CONNECT_DONE_BACK_D')}</p></div>
            <div class="gen-tile">${h('FIRST_CONNECT_DONE_OPEN_T')}
            <a class="onb-addr onb-addr-big" href="${escAttr(url)}" target="_blank" rel="noopener" style="--chars: ${url.length}"><span>${escHtml(url)}</span><svg aria-hidden="true"><use href="#svg-linkOut"></use></svg></a>
            <p class="gen-tile-desc">${tr('FIRST_CONNECT_DONE_OPEN_D')}</p></div>
            <div class="gen-tile">${h('FIRST_CONNECT_DONE_IP_T')}
            <p class="gen-tile-desc">${tr('FIRST_CONNECT_DONE_IP_D').replace('{host}', escHtml(this._host || 'espsomfyrts'))}</p></div>
            </div>
            <p class="wiz-info">${tr('FIRST_CONNECT_DONE_NEXT')}</p>`;
    }

    _renderFoot() {
        const foot = this.$('.wiz-foot');
        if (!foot) return;
        const btn = (cls, attrs, label) => `<button type="button" class="gen-btn${cls}" ${attrs}>${label}</button>`;
        const quit = btn(' wiz-quit onb-quit', 'onclick="onboarding.skip()"', tr('FIRST_CONNECT_SKIP'));
        if (this._step === 'mode') {
            foot.innerHTML = quit;
        } else if (this._step === 'net') {
            const hint = this._netHint(), off = !!hint || this._busy;
            const back = this._isModeChoiceUseful() ? btn('', `onclick="onboarding._goTo('mode')"${this._busy ? ' disabled' : ''}`, tr('BT_GO_BACK')) : '';
            const label = this._busy ? `<span class="wiz-spin"></span>${tr('BT_SAVE_AND_CONNECT')}` : tr('BT_SAVE_AND_CONNECT');
            foot.innerHTML = `${back}${this._busy ? '' : quit}<span class="wiz-foot-gap"></span><span class="wiz-foot-hint">${escHtml(hint)}</span>
            ${btn(' gen-btn-primary' + (this._busy ? ' wiz-busy' : ''), `onclick="onboarding.save()"${off && !this._busy ? ' disabled' : ''}${this._busy ? ' aria-disabled="true"' : ''}`, label)}`;
        } else {
            // En point d'accès il n'y a plus rien à faire ici : l'appareil quitte ce réseau. Relancé
            // depuis la page Réseau, on peut revenir à l'interface.
            foot.innerHTML = isApMode ? '' : `<span class="wiz-foot-gap"></span>${btn(' gen-btn-primary', 'onclick="onboarding.skip()"', tr('BT_CLOSE'))}`;
        }
    }

    // Persiste « assistant terminé ». window.__onboardingDone passe à true tout de suite : c'est
    // lui que lisent activateGrpid(), checkEmptyState() et showAuthenticatedShellOrWizard(). L'état
    // de référence est lu au premier appel seulement, avant cette affectation optimiste ; le succès
    // n'est retenu qu'à la réponse, pour qu'un appel suivant réessaie après un échec.
    markDone(retries = 0) {
        if (this._donePersisted === null) this._donePersisted = !!window.__onboardingDone;
        if (this._donePersisted) return Promise.resolve();
        window.__onboardingDone = true;
        return deviceFetch('/setOnboardingDone?done=1', { method: 'POST' })
        .then(resp => { this._donePersisted = true; return resp; })
        .catch(err => {
            if (retries <= 0) throw err;
            return new Promise(res => setTimeout(res, 1500)).then(() => this.markDone(retries - 1));
        });
    }
    // L'interface bascule tout de suite, sans attendre /setOnboardingDone : un rejet laissait
    // l'utilisateur enfermé dans l'assistant. Un échec ne coûte qu'une réapparition au prochain
    // chargement.
    skip() {
        this._hostEthSettings(false);
        const persisted = this.markDone(3);
        showAuthenticatedShellOrWizard();
        activateGrpid(this._returnGrpid || 'divHomePnl', { updateHash: false });
        persisted.catch(err => {
            logger.error('Failed to persist onboarding completion:', err);
            ui.serviceError(err);
        });
    }
    // Relance depuis la page Réseau : l'assistant écrit dans ses vrais champs et déplace
    // #divETHSettings, d'où la confirmation d'abandon d'une saisie en cours.
    relaunch() {
        confirmDiscardChanges(() => this._openManually());
    }
    _openManually() {
        // Capturé AVANT open(), qui remet _returnGrpid au tableau de bord.
        const from = ROUTE_SLUG_TO_GRPID[location.hash.slice(1)] || null;
        const auth = get('divAuthenticated');
        if (auth) auth.style.display = 'none';
        setOnboardingLock(true);
        this.open();
        this._returnGrpid = from;
    }
}
var onboarding = new Onboarding();
