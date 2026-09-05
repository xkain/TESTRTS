// Emplacement de la cle de session dans sessionStorage (audit authentification, 23/08/2026).
// sessionStorage et NON localStorage : la cle survit aux rechargements de page de CET onglet --
// et il y en a beaucoup, chaque installation de langue et chaque mise a jour firmware se terminant
// par un window.location.reload() -- mais disparait a la fermeture de l'onglet. C'est exactement
// la duree de vie que decrit "tant qu'il est connecte" : une session, pas une confiance permanente
// accordee au navigateur. Un onglet ferme puis rouvert redemande le code, ce qui est le
// comportement attendu sur un appareil protege par un PIN.
// Ce que ce stockage n'aggrave PAS : la cle est deja lisible par le JavaScript de la page (elle
// voyage en clair dans un en-tete `apikey` a chaque requete, sur du HTTP local sans TLS), et elle
// est de toute facon deterministe -- HMAC(secret, PIN + IP), cf. Web::createAPIToken. La stocker
// dans l'onglet ne cree donc aucune exposition nouvelle ; elle evite en revanche une resaisie du
// PIN a chaque rechargement, laquelle poussait surtout l'utilisateur a choisir un code trivial.
const SECURITY_SESSION_KEY = 'espsomfy.apiKey';

class Security {
    type = 0;
    authenticated = false;
    apiKey = '';
    permissions = 0;
    // Les trois acces a sessionStorage sont enveloppes : l'API leve (SecurityError) quand le
    // stockage est desactive par la configuration du navigateur ou par une politique d'entreprise.
    // Un echec ici ne doit jamais empecher de se connecter -- on retombe simplement sur le
    // comportement d'avant, une session en memoire vive perdue au rechargement.
    _restoreSessionKey() {
        try {
            const k = window.sessionStorage.getItem(SECURITY_SESSION_KEY);
            if (k) this.apiKey = k;
        } catch (err) { logger.debug('sessionStorage unavailable, session will not survive reloads'); }
    }
    _persistSessionKey() {
        try {
            if (this.apiKey) window.sessionStorage.setItem(SECURITY_SESSION_KEY, this.apiKey);
            else window.sessionStorage.removeItem(SECURITY_SESSION_KEY);
        } catch (err) { /* stockage indisponible : sans effet, cf. _restoreSessionKey */ }
    }
    _clearSessionKey() {
        try { window.sessionStorage.removeItem(SECURITY_SESSION_KEY); } catch (err) { /* idem */ }
    }
    async init() {
        // Nouvel essai des vérifications de langue (Phase 3/5 i18n) une fois la session
        // réellement authentifiée -- elles s'étaient abstenues tant que l'auth était requise et
        // non effective (cf. loadContext()).
        get('divContainer').addEventListener('afterlogin', () => {
            checkActiveLangAvailability(window.__activeLangCode);
        });

        // Navigation clavier sur le formulaire nom d'utilisateur / mot de passe :
        // Entrée dans le nom d'utilisateur passe au mot de passe s'il est vide, sinon soumet ;
        // Entrée dans le mot de passe soumet toujours.
        const userFld = get('divUnauthenticated').querySelector('#fldLoginUsername');
        const pwdFld = get('divUnauthenticated').querySelector('#fldLoginPassword');
        if (userFld) {
            userFld.addEventListener('keydown', (evt) => {
                if (evt.key !== 'Enter') return;
                evt.preventDefault();
                if (pwdFld && pwdFld.value.length === 0) pwdFld.focus();
                else security.login();
            });
        }
        if (pwdFld) {
            pwdFld.addEventListener('keydown', (evt) => {
                if (evt.key !== 'Enter') return;
                evt.preventDefault();
                security.login();
            });
        }

        // AVANT loadContext() : c'est loadContext() qui interroge /loginContext, et getJSONSync()
        // pose l'en-tete `apikey` a partir de security.apiKey au moment de l'appel. Restaurer
        // ensuite arriverait trop tard -- le firmware aurait deja repondu "authenticated: false"
        // faute d'avoir vu la cle, et l'ecran de connexion se serait affiche pour rien.
        this._restoreSessionKey();
        await this.loadContext();
        // `|| this.authenticated` : session restauree et validee par le firmware (cf. loadContext).
        // Sans ce troisieme cas, une session pourtant valide restait bloquee derriere l'ecran de
        // connexion en securite complete, et surtout la socket ne s'ouvrait pas.
        if (this.type === 0 || (this.permissions & 0x01) === 0x01 || this.authenticated) { // No login required, only the config is protected, or session restored.
            this._ensureSockets();
            //ui.setMode(mode);
            get('divUnauthenticated').style.display = 'none';
            showAuthenticatedShellOrWizard();
            get('divContainer').setAttribute('data-auth', true);
        }
    }
    // Ouvre la connexion socket si elle ne l'est pas déjà -- appelé aussi bien quand aucune
    // connexion n'est requise (init()) qu'après un login réussi (login()), d'où la factorisation.
    _ensureSockets() {
        if (typeof socket === 'undefined' || !socket) (async () => { await initSockets(); })();
    }
    async loadContext() {
        const pnl = get('divUnauthenticated');
        if (!pnl) return;

        // Cache groupé des éléments de login
        const qs = (s) => pnl.querySelector(s);
        const btn = qs('#loginButtons'), pwd = qs('#divLoginPassword'), pin = qs('#divLoginPin');
        pnl.style.display = btn.style.display = pwd.style.display = pin.style.display = 'none';

        return new Promise(res => {
            loadLang(() => {
                getJSONSync('/loginContext', (err, ctx) => {
                    if (err) return ui.serviceError(err), res();

                    // Uptime & Info CPU
                    if (ctx.uptime !== undefined) {
                        deviceUptimeSeconds = ctx.uptime;
                        displayUptime(deviceUptimeSeconds, 'uptime-display');
                    }
                    if (ctx.netUptime !== undefined) {
                        netUptimeSeconds = ctx.netUptime;
                        displayUptime(netUptimeSeconds, 'net-display');
                    }
                    // Label de la ligne "Réseau" de la pop-up uptime : reflète l'interface RÉELLEMENT
                    // active côté firmware (ctx.netMode = "ap"|"eth"|"wifi", cf. WebAuth::handleLoginContext),
                    // pas la config statique -- reste correct même pendant un repli AP temporaire.
                    updateNetUptimeLabel(ctx.netMode);
                    // Badges WIFI/LAN/POE de l'en-tête. Servis ici et pas seulement par
                    // Wifi.loadNetwork() : /networksettings est protégé, et l'en-tête reste affiché
                    // derrière l'écran de connexion comme en mode "config seule" -- aucun badge ne
                    // s'y allumait donc tant qu'on n'était pas authentifié. ctx.netType est public
                    // (cf. WebAuth::handleLoginContext) ; absent sur un firmware antérieur, auquel
                    // cas on laisse l'ancien comportement plutôt que d'éteindre un badge correct.
                    if (ctx.netType && typeof wifi !== 'undefined') wifi.applyNetType(ctx.netType);

                    // Relancer le rafraîchissement en temps réel sans doublons.
                    // `ctx.uptime !== undefined` en garde (M-17) : en sécurité complète et avant
                    // connexion, /loginContext ne sert plus l'uptime -- démarrer le minuteur ferait
                    // alors tourner un incrément sur `undefined` (donc NaN) une fois par seconde
                    // derrière l'écran de connexion, pour un en-tête qui n'est même pas affiché.
                    // La relecture qui suit la connexion (cf. Security.login) le démarre pour de
                    // bon, avec une vraie valeur de départ.
                    if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; }
                    if (ctx.uptime !== undefined) uptimeInterval = setInterval(() => {
                        // On ajoute une seconde à l'uptime de l'appareil
                        deviceUptimeSeconds++;
                        displayUptime(deviceUptimeSeconds, 'uptime-display');

                        // On ajoute une seconde à l'uptime réseau uniquement s'il est connecté (> 0)
                        if (netUptimeSeconds > 0) {
                            netUptimeSeconds++;
                            displayUptime(netUptimeSeconds, 'net-display');
                        }
                    }, 1000);

                    if (ctx.cpuFreq) get('info-cpu').textContent = `${ctx.cores > 1 ? 'Dual' : 'Single'}-Core @ ${ctx.cpuFreq} ${tr('UNIT_MHZ')}`;
                    // Flash & FileSystem (Regroupé)
                    if (ctx.flashSize) {
                        get('info-flash').innerHTML = `<span>${tr('FW_TOTAL')}: </span><span class="status-detail">${ctx.flashSize}</span> ${tr('UNIT_MO')} (<span class="hide550">${tr('FW_SPEED')}: </span><span class="status-detail">${ctx.flashSpeed}</span> ${tr('UNIT_MHZ')})`;
                    }
                    if (ctx.fsTotal) {
                        const free = ctx.fsTotal - ctx.fsUsed, pct = Math.round((ctx.fsUsed / ctx.fsTotal) * 100);
                        const el = get('info-fs-status');
                        if (el) el.innerHTML = `<span class="status-detail">${free}</span> ${tr('UNIT_KO')} ${tr('FW_FREE_SUFFIX')}<span class="hide550"> ${tr('FW_ON')} <span class="status-detail">${ctx.fsTotal}</span></span>`;


                        // --- MISE À JOUR DU CERCLE FLASH VIA BACKGROUND DIRECT ---
                        const cFlash = get('circle-flash');
                        if (cFlash) {
                            cFlash.style.background = `conic-gradient(#12b17c ${pct}%, var(--color-circle-indicator) 0%)`;
                            cFlash.innerHTML = `<span>${pct}%</span>`;
                        }
                    }
                    // MAC Addresses
                    if (ctx.mac) document.querySelectorAll('.spanMacAddress').forEach(el => el.textContent = ctx.mac);

                    this.type = ctx.type;
                    this.permissions = ctx.permissions;
                    // Verdict du FIRMWARE sur la cle qui vient d'etre presentee avec cette requete
                    // (champ `authenticated` de /loginContext, cf. WebAuth::handleLoginContext) --
                    // pas une deduction cote navigateur. C'est ce qui rend la restauration de
                    // session sure : une cle perimee (PIN change depuis un autre appareil, IP du
                    // client changee, secret NVS regenere par un effacement) est rejetee ici et
                    // l'ecran de connexion reapparait, au lieu de laisser l'interface se croire
                    // connectee puis collectionner les 401.
                    // Le cas type === 0 reste `false` a dessein : sans securite il n'y a pas de
                    // session, et tout le reste du code teste `security.type === 0 ||
                    // security.authenticated` -- inverser ce drapeau ici changerait ces branches
                    // sans rien apporter.
                    this.authenticated = (ctx.type !== 0) && !!ctx.authenticated;
                    // Cle refusee : on ne la garde pas d'un rechargement a l'autre, sinon chaque
                    // chargement de page repart avec une cle morte et redeclenche un cycle 401.
                    if (ctx.type !== 0 && !this.authenticated) {
                        this.apiKey = '';
                        this._clearSessionKey();
                    }

                    const cont = get('divContainer');
                    if (cont) cont.setAttribute('data-securitytype', ctx.type);
                    // Gestion du Login -- uniquement si la session n'est PAS deja valide.
                    if (ctx.type !== 0 && !this.authenticated) {
                        btn.style.display = '';
                        const targetDiv = ctx.type === 1 ? pin : pwd;

                        targetDiv.style.display = '';
                        this.focusLoginField();

                        const typeFld = qs('#fldLoginType');
                        if (typeFld) typeFld.value = ctx.type;
                        pnl.style.display = 'flex';

                        // Le libellé du bouton dépend du contexte : "Annuler" s'il existe un dashboard
                        // public où revenir (sécurité "config only"), "Effacer" sinon (rien à annuler).
                        const cancelBtn = qs('#btnCancelLogin');
                        if (cancelBtn) {
                            const configOnly = (ctx.permissions & 0x01) === 0x01;
                            cancelBtn.setAttribute('tr', configOnly ? 'BT_CANCEL_1' : 'BT_CLEAR');
                            if (typeof translator !== 'undefined') translator.translate(cancelBtn);
                        }
                    }
                    // Mémorisé pour le nouvel essai déclenché par 'afterlogin' si l'auth était requise.
                    window.__activeLangCode = ctx.language;
                    // Tag exact du firmware en cours (ex: "v3.0.1") -- sert à verrouiller la version
                    // du contenu de langue récupéré par le relais navigateur (Phase 4 i18n), pour
                    // éviter une dérive avec une branche main ayant évolué depuis ce firmware.
                    window.__fwVersionTag = ctx.version;
                    // Langue embarquée d'usine pour cet environnement de build (fr sur BOX, en
                    // sinon) -- protégée contre la suppression dans le catalogue (cf.
                    // renderLangCatalog), à la place d'un "en" en dur qui ne serait plus forcément
                    // exact selon la variante matérielle.
                    window.__defaultLangCode = ctx.defaultLang;
                    // Langue en attente (mode AP, cf. /setPendingLang) -- chaîne vide si aucune.
                    // Reflète l'état persistant côté firmware, donc correct même après un rechargement
                    // de page ou depuis un autre appareil que celui qui a fait la demande initiale.
                    window.__pendingLangCode = ctx.pendingLang || '';
                    checkPendingLangApplied(ctx.language, window.__pendingLangCode);
                    checkActiveLangAvailability(ctx.language);
                    // Assistant de premier démarrage (cf. showAuthenticatedShellOrWizard()) et nom
                    // d'hôte actuel, pré-rempli dans la modale de confirmation réseau qui conclut
                    // l'assistant (cf. Wifi.networkConfirmationOverlay()).
                    window.__onboardingDone = !!ctx.onboardingDone;
                    window.__currentHostname = ctx.hostname || '';
                    // Disponible dès ce tout premier appel (avant l'ouverture du Wizard) pour que
                    // le panneau Réseau connaisse le profil matériel sans dépendre d'un fetch séparé
                    // vers /modulesettings une fois le Wizard déjà affiché -- ce délai provoquait
                    // une réapparition tardive de la ligne Ethernet et donc un changement de hauteur
                    // de la carte quelques secondes après le premier affichage.
                    window.__hardwareProfile = ctx.hardwareProfile || '';
                    // Limite réelle du pool WebSocket (WEBSOCKETS_SERVER_CLIENT_MAX), servie par
                    // /loginContext plutôt que redite en dur ici -- cf. le message d'erreur socket
                    // dans 20-shell.js, qui annonçait 5 alors que le firmware en accepte 10.
                    window.__maxClients = ctx.maxClients || 0;
                    // Marqueur attendu dans une image de firmware (cf. FW_IMAGE_MARKER) :
                    // permet à Firmware.uploadFile de refuser un binaire incompatible avant
                    // de le téléverser. Vide si le firmware est antérieur à ce mécanisme.
                    window.__fwImageMarker = ctx.fwImageMarker || '';
                    // Taille de la partition de fichiers : sert à valider la géométrie déclarée
                    // par une image LittleFS avant envoi (cf. Firmware.fsImageGeometryOk).
                    window.__fsPartitionSize = ctx.fsPartitionSize || 0;
                    // -1 = aucune LED câblée. Les options de retour lumineux des modales
                    // équipement/Groupe s'y réfèrent, elles s'ouvrent souvent avant /modulesettings.
                    window.__ledPin = typeof ctx.ledPin === 'number' ? ctx.ledPin : -1;
                    res();
                });
            });
        });
    }
    authUser() {
        get('divAuthenticated').style.display = 'none';
        // Pas la peine de forcer divUnauthenticated.style.display ici : loadContext() le remet à
        // 'none' dès sa première ligne (synchrone), avant de le repasser à 'flex' une fois
        // /loginContext répondu (cf. plus bas) -- écrire '' ici n'avait donc aucun effet visible.
        // Même chose pour btnCancelLogin : sa visibilité suit déjà celle de son parent
        // #loginButtons (loadContext()) ; le forcer ici à 'inline-block' écrasait en plus le
        // `display:flex` du style commun `button {}` (base.css) qui centre son contenu.
        return this.loadContext().then(() => {
            // La session tenait encore : loadContext() n'a pas affiche l'ecran de connexion, mais
            // divAuthenticated vient d'etre masque ci-dessus -- sans ce rattrapage l'utilisateur se
            // retrouvait devant une page vide. Le cas se produit des qu'un appelant demande une
            // authentification "au cas ou" (garde de route profonde dans activateGrpid) alors que
            // la cle restauree est parfaitement valide.
            if (this.type !== 0 && this.authenticated) {
                get('divUnauthenticated').style.display = 'none';
                showAuthenticatedShellOrWizard();
                get('divContainer').setAttribute('data-auth', true);
            }
        });
    }
    // Place le focus dans le premier champ de saisie du formulaire de connexion (PIN ou
    // utilisateur/mot de passe selon le type de sécurité actif), pour permettre à
    // l'utilisateur de taper directement sans avoir à cliquer.
    focusLoginField() {
        const pnl = get('divUnauthenticated');
        if (!pnl) return;
        const fld = this.type === 1
            ? pnl.querySelector('.pin-digit[data-bind="login.pin.d0"]')
            : pnl.querySelector('#fldLoginUsername');
        if (fld) setTimeout(() => fld.focus(), 100);
    }
    cancelLogin() {
        const configOnly = (this.permissions & 0x01) === 0x01;
        if (this.type === 0 || configOnly) {
            // Le dashboard est accessible sans connexion : on referme l'écran de login et on y revient.
            let evt = new CustomEvent('afterlogin', { detail: { authenticated: this.authenticated } });
            showAuthenticatedShellOrWizard();
            get('divUnauthenticated').style.display = 'none';
            get('divContainer').dispatchEvent(evt);
        } else {
            // Sécurité complète : aucune page publique où revenir, on se contente de réinitialiser le formulaire.
            this.resetLoginForm();
        }
    }
    // Filet de sécurité commun à tous les helpers HTTP : un 401 signifie que la clé de session
    // n'est plus valable (sécurité activée ou modifiée depuis un autre appareil, redémarrage,
    // changement d'IP client -- le jeton est calculé à partir de celle-ci, cf. Web::createAPIToken).
    // Plutôt que d'empiler des "Unauthorized" dans la console sans que rien ne bouge à l'écran, on
    // ramène l'utilisateur à l'authentification. Le drapeau évite qu'une rafale d'appels simultanés
    // (rechargement socket : général + somfy + réseau + MQTT) ne déclenche autant de bascules.
    handleUnauthorized() {
        if (this._reauthPending) return;
        this._reauthPending = true;
        this.authenticated = false;
        this.apiKey = '';
        // La cle stockee est morte elle aussi : la laisser en place ferait repartir le prochain
        // chargement de page avec une cle deja refusee.
        this._clearSessionKey();
        setTimeout(() => { this._reauthPending = false; }, 2000);
        logger.warn('Session no longer authorized, prompting for login again');
        this.authUser();
    }
    resetLoginForm() {
        const pnl = get('divUnauthenticated');
        if (!pnl) return;
        const msg = pnl.querySelector('#spanLoginMessage');
        if (msg) msg.innerHTML = '';
        pnl.querySelectorAll('.pin-digit').forEach(inp => inp.value = '');
        const userFld = pnl.querySelector('#fldLoginUsername');
        if (userFld) userFld.value = '';
        const pwdFld = pnl.querySelector('#fldLoginPassword');
        if (pwdFld) pwdFld.value = '';
        this.focusLoginField();
    }
    login(event) {
        // Si la fonction est appelée par la soumission du formulaire, on bloque le rechargement
        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }

        let pnl = get('divUnauthenticated');
        let btn = pnl.querySelector('#btnLogin');
        if (btn && btn.disabled) return; // Verrou anti brute-force actif : on ignore toute soumission.

        let msg = pnl.querySelector('#spanLoginMessage');
        msg.innerHTML = '';
        let sec = ui.fromElement(pnl).login;
        let pin = '';
        switch (sec.type) {
            case 1:
                for (let i = 0; i < 4; i++) {
                    pin += sec.pin[`d${i}`];
                }
                if (pin.length !== 4) return;
                break;
            case 2:
                break;
        }
        sec.pin = pin;
        putJSONSync('/login', sec, (err, log) => {
            if (err) {
                if (err.htmlError === 429 && err.retryAfter) this.startLoginLockout(err.retryAfter);
                else ui.serviceError(err);
            }
            else {
                if (log.success) {
                    // apiKey posée AVANT _ensureSockets() : la poignée de main WebSocket transporte
                    // désormais la clé dans son URL (cf. initSockets() dans 20-shell.js), qui la lit
                    // au moment de l'appel. Dans l'ordre inverse, la socket s'ouvrait avec une clé
                    // encore vide et le serveur la refusait -- l'interface restait alors bloquée sur
                    // "connexion en cours" jusqu'à la première tentative de reconnexion.
                    this.apiKey = log.apiKey;
                    this.authenticated = true;
                    // Memorisee pour la duree de l'onglet : c'est ce qui evite la resaisie du PIN
                    // apres les rechargements de page declenches par l'application elle-meme
                    // (installation de langue, fin de mise a jour firmware).
                    this._persistSessionKey();
                    this._ensureSockets();

                    get('divUnauthenticated').style.display = 'none';
                    showAuthenticatedShellOrWizard();
                    get('divContainer').setAttribute('data-auth', true);
                    // Relecture de /loginContext AVEC la cle (M-17, 23/08/2026). Depuis que cette
                    // route ne sert plus les informations d'appareil a un appelant anonyme (MAC,
                    // nom d'hote, version, CPU, flash, uptime, ledPin, fwImageMarker,
                    // fsPartitionSize...), le premier appel -- fait avant connexion -- ne les
                    // rapporte pas. Sans cette seconde lecture, l'en-tete et les panneaux
                    // d'information resteraient vides pour TOUTE la session, et window.__ledPin /
                    // __fwImageMarker / __fsPartitionSize garderaient leurs valeurs de repli, ce
                    // qui degraderait silencieusement les controles de televersement de firmware.
                    // L'evenement afterlogin n'est emis qu'APRES : ses abonnes (rechargement des
                    // panneaux dans 20-shell.js, verification de langue) doivent trouver un
                    // contexte complet, pas celui d'avant la connexion.
                    this.loadContext().then(() => {
                        let evt = new CustomEvent('afterlogin', { detail: { authenticated: true } });
                        get('divContainer').dispatchEvent(evt);
                    });
                }
                else {
                    let text = tr(log.msg);
                    if (log.maxAttempts) text += ` (${tr('LOGIN_ATTEMPT_LABEL')} ${log.attempt}/${log.maxAttempts})`;
                    msg.innerHTML = text;
                }
            }
        });
    }
    startLoginLockout(seconds) {
        const pnl = get('divUnauthenticated');
        const msg = pnl.querySelector('#spanLoginMessage');
        const btn = pnl.querySelector('#btnLogin');
        if (this._lockoutInterval) clearInterval(this._lockoutInterval);

        let remaining = Math.max(1, parseInt(seconds, 10) || 0);
        if (btn) { btn.disabled = true; btn.classList.add('disabled'); }

        const render = () => {
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            const time = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
            msg.innerHTML = `${tr('ERR_LOGIN_LOCKED')} ${time}`;
        };
        render();

        this._lockoutInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(this._lockoutInterval);
                this._lockoutInterval = null;
                if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
                msg.innerHTML = '';
            } else {
                render();
            }
        }, 1000);
    }
    toggleFieldPassword(fieldId, el) {
        const fld = get(fieldId);
        const ico = el.querySelector('use');

        if (fld.type === 'password') {
            fld.type = 'text';
            if(ico) ico.setAttribute('href', '#svg-eyeOn');
        } else {
            fld.type = 'password';
            if(ico) ico.setAttribute('href', '#svg-eyeOff');
        }
    }
}
var security = new Security();
