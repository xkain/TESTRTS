/* ESPSomfy-RTS — habillage commun des pages du site GitHub Pages (docs/).
 *
 * Un seul fichier porte ce qui est identique d'une page à l'autre : sprite d'icônes, bannière,
 * pied de page, thème clair/sombre et moteur de traduction. Ajouter une page au site revient à un
 * <script> dans son <head>.
 *
 * CHARGÉ DANS <head>, EN SCRIPT CLASSIQUE (bloquant) : le thème doit être posé sur <html> avant
 * le premier rendu, sinon la page s'affiche en clair puis bascule. Les hauteurs de la bannière et
 * du pied de page étant réservées en CSS (--site-header-h / --site-footer-h), leur injection ne
 * décale rien.
 *
 * Ce que les scripts de page (js/geo.js, js/installer.js) consomment :
 *     SiteLayout.ready              promesse résolue après le premier affichage traduit
 *     SiteLayout.lang / .dict       langue active et dictionnaire brut
 *     SiteLayout.t(clé, jetons)     libellé traduit, avec substitution de {jeton}
 *     SiteLayout.apply()            retraduit le document (après injection de balisage)
 *     document 'i18n:changed'       émis à chaque traduction, y compris la première
 *
 * Chaque page peut personnaliser deux choses par attribut sur <body> :
 *     data-footer-key="..."   clé du texte affiché dans le pied de page (défaut: security_text)
 *     data-nav="home"         marque le lien de navigation correspondant à la page courante
 */
'use strict';

(function () {
    // Doit rester aligné sur les fichiers réellement présents dans docs/lang/ ; toute langue
    // demandée hors de cette liste retombe sur DEFAULT_LANG.
    const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es'];
    const DEFAULT_LANG = 'en';

    // Libellés du sélecteur, chacun dans SA propre langue (usage établi : un lecteur germanophone
    // cherche « Deutsch », pas « Allemand »). Aucune traduction à maintenir, donc.
    const LANG_NAMES = { en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español' };

    const DOC_URL = 'https://github.com/xkain/ESPSomfy-RTS/wiki';
    const HOME_URL = 'index.html';

    const STORE_THEME = 'espsomfy-theme';
    const STORE_LANG = 'espsomfy-lang';

    let dict = {};
    let lang = DEFAULT_LANG;

    /* ------------------------------------------------------------------ Stockage local */

    // localStorage est indisponible en navigation privée sur certains navigateurs, et lève à la
    // simple lecture : le site doit continuer de fonctionner sans mémoire des préférences.
    function readStore(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }

    function writeStore(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* préférence non mémorisée */ }
    }

    /* ------------------------------------------------------------------ Thème clair/sombre */

    // Le thème effectif est toujours écrit sur <html> : choix mémorisé s'il existe, sinon réglage
    // du système. C'est ce qui permet à style.css de n'avoir qu'un seul jeu de variables sombres.
    function systemTheme() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark' : 'light';
    }

    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function initTheme() {
        const stored = readStore(STORE_THEME);
        const theme = (stored === 'light' || stored === 'dark') ? stored : systemTheme();
        document.documentElement.setAttribute('data-theme', theme);

        // Tant qu'aucun choix n'a été fait ici, la page suit le système en direct.
        if (!window.matchMedia) return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const follow = () => {
            if (readStore(STORE_THEME)) return;
            document.documentElement.setAttribute('data-theme', systemTheme());
            updateThemeButton();
        };
        if (mq.addEventListener) mq.addEventListener('change', follow);
        else if (mq.addListener) mq.addListener(follow);
    }

    function toggleTheme() {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        writeStore(STORE_THEME, next);
        updateThemeButton();
    }

    // Le bouton annonce la destination, pas l'état courant : en thème clair il montre la lune et
    // propose de passer en sombre.
    function updateThemeButton() {
        const btn = document.getElementById('siteThemeBtn');
        if (!btn) return;
        const goingDark = currentTheme() === 'light';
        const icon = goingDark ? '#svg-moon' : '#svg-sun';
        const label = t(goingDark ? 'theme_to_dark' : 'theme_to_light');
        btn.innerHTML = `<svg class="site-nav-icon" width="20" height="20"><use href="${icon}"/></svg>`;
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
    }

    /* ------------------------------------------------------------------ Traductions */

    // Langue retenue, par ordre de priorité :
    //  1. ?lang=xx dans l'URL (l'interface de l'appareil le transmet : l'utilisateur y a déjà
    //     choisi sa langue, c'est l'intention la plus fiable) ;
    //  2. le choix fait ici même lors d'une visite précédente ;
    //  3. la langue du navigateur ;
    //  4. DEFAULT_LANG.
    function resolveLang() {
        const asked = new URLSearchParams(window.location.search).get('lang');
        const candidates = [asked, readStore(STORE_LANG), (navigator.language || '')].map(
            (v) => (v || '').toLowerCase().slice(0, 2)
        );
        return candidates.find((c) => SUPPORTED_LANGS.includes(c)) || DEFAULT_LANG;
    }

    async function fetchDict(code) {
        const res = await fetch(`lang/${code}.json`);
        if (!res.ok) throw new Error(`lang/${code}.json: HTTP ${res.status}`);
        return res.json();
    }

    // Un fichier manquant ne doit pas laisser la page avec des libellés incohérents : on retombe
    // sur la langue par défaut, et en dernier recours sur les libellés écrits en dur dans le HTML.
    async function loadDict(code) {
        try {
            dict = await fetchDict(code);
            lang = code;
            return;
        } catch (err) {
            console.warn('Langue indisponible, repli sur', DEFAULT_LANG, err);
        }
        if (code === DEFAULT_LANG) return;
        try {
            dict = await fetchDict(DEFAULT_LANG);
            lang = DEFAULT_LANG;
        } catch (err) {
            console.error('Aucune traduction chargeable, les libellés du HTML sont conservés', err);
        }
    }

    // Repli sur la clé elle-même si absente : ne devrait pas arriver, les 4 langues sont tenues
    // alignées (cf. version_docs.py --check).
    function t(key, tokens) {
        let s = dict[key] !== undefined ? dict[key] : key;
        if (tokens) {
            for (const [k, v] of Object.entries(tokens)) s = s.replaceAll(`{${k}}`, v);
        }
        return s;
    }

    // innerHTML volontaire : certaines valeurs contiennent du balisage (security_text,
    // footer_credit), et les dictionnaires sont livrés avec la page.
    function apply() {
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (dict[key] !== undefined) el.innerHTML = dict[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key] !== undefined) el.placeholder = dict[key];
        });
        // Les libellés d'accessibilité des icônes seules (accueil, langue) : sans eux, un lecteur
        // d'écran n'annonce qu'un lien vide.
        document.querySelectorAll('[data-i18n-label]').forEach((el) => {
            const key = el.getAttribute('data-i18n-label');
            if (dict[key] === undefined) return;
            el.setAttribute('aria-label', dict[key]);
            if (el.hasAttribute('title')) el.setAttribute('title', dict[key]);
        });
        updateThemeButton();
        document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang } }));
    }

    async function setLang(code) {
        if (!SUPPORTED_LANGS.includes(code) || code === lang) return;
        await loadDict(code);
        writeStore(STORE_LANG, lang);
        // L'URL porte la langue quand la page a été ouverte depuis l'appareil (?lang=xx) : la
        // laisser périmée ferait revenir l'ancienne langue au moindre rechargement.
        const url = new URL(window.location.href);
        if (url.searchParams.has('lang')) {
            url.searchParams.set('lang', lang);
            window.history.replaceState(null, '', url);
        }
        syncHomeLink();
        apply();
    }

    /* ------------------------------------------------------------------ Bannière et pied de page */

    // Le lien d'accueil transporte la langue active : sans ?lang=, la page d'accueil retomberait
    // sur celle du navigateur, qui n'est pas forcément celle que l'utilisateur vient de choisir
    // sur l'appareil.
    function syncHomeLink() {
        const link = document.getElementById('siteHomeLink');
        if (link) link.setAttribute('href', `${HOME_URL}?lang=${encodeURIComponent(lang)}`);
    }

    function buildSprite() {
        const svg = document.createElement('div');
        svg.innerHTML = `
        <svg class="site-sprite" aria-hidden="true">
          <symbol id="svg-logo" viewBox="0 0 48 48">
            <path d="m24 2-22 14v8l22-14 22 14v-8z" fill="currentColor"/>
            <path d="m14 40v-22l-6 4v24h38v-6z" fill="currentColor"/>
            <path d="m24 24v2h22v-2zm0 4v2h22v-2zm0 4v2h22v-2zm0-12v2h21.32v-2zm0 16v2h22v-2z" fill="currentColor"/>
          </symbol>
          <symbol id="svg-home" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3z"/>
          </symbol>
          <symbol id="svg-doc" viewBox="0 0 24 24">
            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
              <path d="M15 2.5V4c0 1.414 0 2.121.44 2.56C15.878 7 16.585 7 18 7h1.5"/>
              <path d="M4 16V8c0-2.828 0-4.243.879-5.121C5.757 2 7.172 2 10 2h4.172c.408 0 .613 0 .797.076c.183.076.328.22.617.51l3.828 3.828c.29.29.434.434.51.618c.076.183.076.388.076.796V16c0 2.828 0 4.243-.879 5.121C18.243 22 16.828 22 14 22h-4c-2.828 0-4.243 0-5.121-.879C4 20.243 4 18.828 4 16"/>
            </g>
          </symbol>
          <symbol id="svg-globe" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20m6.92 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8M12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96M4.26 14a7.8 7.8 0 0 1 0-4h3.38a16.6 16.6 0 0 0 0 4zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A8 8 0 0 1 5.08 16m2.95-8H5.08a8 8 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.03 8M12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96M14.34 14H9.66a14.8 14.8 0 0 1 0-4h4.68a14.8 14.8 0 0 1 0 4m.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8 8 0 0 1-4.33 3.56M16.36 14a16.6 16.6 0 0 0 0-4h3.38a7.8 7.8 0 0 1 0 4z"/>
          </symbol>
          <symbol id="svg-sun" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10m0 8a3 3 0 1 1 0-6a3 3 0 0 1 0 6"/>
            <path fill="currentColor" d="M11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM3.5 4.93l1.42-1.42l2.12 2.12L5.62 7.05zm13.46 13.46l1.41-1.41l2.12 2.12l-1.41 1.41zM5.62 16.95l1.42 1.41l-2.12 2.12l-1.42-1.41zM18.37 3.51l1.41 1.42l-2.12 2.12l-1.41-1.42z"/>
          </symbol>
          <symbol id="svg-moon" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12.34 2.02A10 10 0 1 0 22 13.66A8 8 0 0 1 12.34 2.02"/>
          </symbol>
          <symbol id="svg-menu" viewBox="0 0 24 24">
            <path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/>
          </symbol>
          <symbol id="svg-lock" viewBox="0 0 24 24">
            <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m-6 9c-1.1 0-2-.9-2-2s.9-2 2-2s2 .9 2 2s-.9 2-2 2M9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2z"/>
          </symbol>
        </svg>`;
        return svg.firstElementChild;
    }

    // Logo et nom à gauche, navigation à droite, sur toute la largeur de la fenêtre.
    //
    // Sur mobile, <nav> se replie derrière le bouton menu (cf. .site-nav.is-open dans style.css) :
    // à 360px, le sélecteur de langue à lui seul mangeait 130px et le nom du projet lui passait
    // dessous. La bascule de thème et le retour à l'accueil, eux, restent toujours dans la barre.
    function buildHeader() {
        const header = document.createElement('header');
        header.className = 'site-header';
        header.innerHTML = `
        <div class="site-brand">
          <svg class="site-brand-logo" width="48" height="48"><use href="#svg-logo"/></svg>
          <span class="site-brand-name">ESPSomfy-RTS</span>
        </div>
        <div class="site-actions">
          <nav class="site-nav" id="siteNav">
            <a class="site-nav-link" href="${DOC_URL}" target="_blank" rel="noopener noreferrer">
              <svg class="site-nav-icon" width="18" height="18"><use href="#svg-doc"/></svg>
              <span class="site-nav-label" data-i18n="nav_doc">Documentation</span>
            </a>
            <div class="site-lang">
              <svg class="site-nav-icon" width="18" height="18"><use href="#svg-globe"/></svg>
              <select class="site-lang-select" id="siteLangSelect" data-i18n-label="nav_lang"></select>
            </div>
          </nav>
          <button type="button" class="site-nav-link is-icon-only" id="siteThemeBtn" title=""></button>
          <button type="button" class="site-nav-link is-icon-only site-menu-btn" id="siteMenuBtn"
                  aria-expanded="false" aria-controls="siteNav" title="" data-i18n-label="nav_menu">
            <svg class="site-nav-icon" width="22" height="22"><use href="#svg-menu"/></svg>
          </button>
          <a class="site-nav-link is-icon-only site-home-link" id="siteHomeLink" href="${HOME_URL}"
             title="" data-i18n-label="nav_home">
            <svg class="site-nav-icon" width="24" height="24"><use href="#svg-home"/></svg>
          </a>
        </div>`;
        return header;
    }

    // Une seule ligne centrée, épinglée en bas de l'écran. Le texte de gauche appartient à la
    // page (cf. data-footer-key sur <body>) : rappel de confidentialité, ou provenance du
    // firmware pour l'installateur.
    function buildFooter() {
        const key = document.body.getAttribute('data-footer-key') || 'security_text';
        const footer = document.createElement('footer');
        footer.className = 'site-footer';
        footer.innerHTML = `
        <span class="site-footer-item">
          <svg class="site-footer-icon" width="14" height="14"><use href="#svg-lock"/></svg>
          <span data-i18n="${key}"></span>
        </span>
        <span class="site-footer-sep" aria-hidden="true">·</span>
        <span class="site-footer-item" data-i18n="footer_credit"></span>`;
        return footer;
    }

    // Au-dessus du seuil mobile, is-open n'a aucun effet visuel ; on la retire quand même au
    // franchissement, pour ne pas retrouver un panneau ouvert en revenant en largeur réduite.
    function closeMenu() {
        const nav = document.getElementById('siteNav');
        const btn = document.getElementById('siteMenuBtn');
        if (!nav || !btn) return;
        nav.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
    }

    function initMenu() {
        const nav = document.getElementById('siteNav');
        const btn = document.getElementById('siteMenuBtn');

        btn.addEventListener('click', (ev) => {
            // Sans ça, le clic remonte jusqu'au document et le gestionnaire "clic à l'extérieur"
            // ci-dessous refermerait le panneau dans la foulée de son ouverture.
            ev.stopPropagation();
            const open = !nav.classList.contains('is-open');
            nav.classList.toggle('is-open', open);
            btn.setAttribute('aria-expanded', String(open));
        });

        document.addEventListener('click', (ev) => {
            if (!nav.contains(ev.target)) closeMenu();
        });
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') closeMenu();
        });
        // Un lien mène ailleurs : laisser le panneau ouvert derrière soi n'aurait pas de sens.
        nav.addEventListener('click', (ev) => {
            if (ev.target.closest('a')) closeMenu();
        });

        if (!window.matchMedia) return;
        const mq = window.matchMedia('(min-width: 601px)');
        if (mq.addEventListener) mq.addEventListener('change', closeMenu);
        else if (mq.addListener) mq.addListener(closeMenu);
    }

    function buildLangSelect() {
        const sel = document.getElementById('siteLangSelect');
        if (!sel) return;
        sel.innerHTML = '';
        SUPPORTED_LANGS.forEach((code) => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = LANG_NAMES[code] || code.toUpperCase();
            sel.appendChild(opt);
        });
        sel.value = lang;
        sel.addEventListener('change', () => { closeMenu(); setLang(sel.value); });
    }

    function injectChrome() {
        document.body.prepend(buildHeader());
        document.body.prepend(buildSprite());
        document.body.appendChild(buildFooter());
        buildLangSelect();
        syncHomeLink();
        // La page courante se signale elle-même (data-nav sur <body>) : le lien correspondant
        // reste visible mais cesse d'inviter au clic.
        const current = document.body.getAttribute('data-nav');
        if (current === 'home') {
            const link = document.getElementById('siteHomeLink');
            if (link) link.setAttribute('aria-current', 'page');
        }
        document.getElementById('siteThemeBtn').addEventListener('click', toggleTheme);
        initMenu();
    }

    /* ------------------------------------------------------------------ Démarrage */

    initTheme();

    const domReady = new Promise((resolve) => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        } else {
            resolve();
        }
    });

    // Le dictionnaire part avant l'attente du DOM : les deux attentes se recouvrent.
    lang = resolveLang();
    const dictReady = loadDict(lang);

    const ready = Promise.all([dictReady, domReady]).then(() => {
        injectChrome();
        apply();
    });

    window.SiteLayout = {
        ready,
        apply,
        t,
        setLang,
        get lang() { return lang; },
        get dict() { return dict; },
        get supportedLangs() { return SUPPORTED_LANGS.slice(); },
    };
})();
