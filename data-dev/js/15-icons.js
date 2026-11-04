// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS

// Packs d'icônes d'équipement (contrat v1, cf. CONTRAT-ICONES-v1). Le pack par défaut vit dans
// index.html et n'est jamais retiré : un pack ne fait que remplacer, symbole par symbole, ceux
// qu'il redéfinit, et tout échec de contrôle laisse la page sur le défaut. Outre les jetons
// --color-shade-*, un pack peut déclarer ses propres couleurs clair/sombre en --pk-*.
const ICON_CONTRACT = 1;
const ICON_PACK_MAX = 16 * 1024;
const ICON_PACK_SYMBOLS = ['svg-window-shade', 'svg-window-blind', 'svg-ldrapery', 'svg-awning', 'svg-shutter',
    'svg-garage', 'svg-rdrapery', 'svg-cdrapery', 'svg-switch1', 'svg-switch2', 'svg-lgate', 'svg-cgate', 'svg-rgate'];
const ICON_PACK_TOKENS = ['fab', 'fab-l', 'fab-d', 'sky1', 'sky2', 'pvc1', 'pvc2', 'alu1', 'alu2', 'alu3', 'stone1',
    'stone2', 'edge', 'glow-op', 'int1', 'int2', 'leaf1', 'leaf2', 'cream', 'brass1', 'brass2', 'refl', 'shadow-op']
    .map(t => '--color-shade-' + t);
const ICON_PACK_TAGS = new Set(['svg', 'defs', 'symbol', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'use']);
const ICON_PACK_ATTRS = new Set(['id', 'class', 'style', 'href', 'viewBox', 'preserveAspectRatio', 'transform', 'd',
    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'width', 'height', 'points',
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
    'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'clip-path',
    'clip-rule', 'mask', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
    'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform', 'clipPathUnits', 'maskUnits',
    'maskContentUnits', 'data-my', 'xmlns', 'xmlns:xlink', 'xlink:href']);
const ICON_PACK_CLASSES = new Set(['lattes-group', 'move-up', 'move-left', 'move-right', 'blind-slat', 'gate-leaf-l',
    'gate-leaf-r', 'switch-top', 'switch-bottom', 'switch-led', 'switch-glow']);
const ICON_PACK_REF = /url\(\s*['"]?#([\w-]+)['"]?\s*\)/g;
const ICON_PACK_ID = /^[a-z0-9-]{1,32}$/;

class IconPacks {
    constructor() {
        this.installed = null;  // métadonnées du pack installé sur le boîtier
        this.applied = null;    // pack affiché : installé, ou aperçu en cours
        this.ignored = null;    // raison du rejet du pack installé
        this._defaults = new Map();
        this._packs = {};       // packs déjà téléchargés ou importés, par id
    }
    // Ne bloque jamais le démarrage : sans pack, ou pack refusé, la page reste sur le défaut.
    async loadInstalled() {
        let pack;
        try {
            const resp = await fetch(baseUrl + '/icons');
            if (resp.status === 404) return;
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            pack = await resp.json();
        } catch (err) {
            logger.warn('Icon pack not loaded:', err.message);
            return;
        }
        try {
            this.apply(pack);
            this.installed = this.meta(pack);
            this._installedPack = pack;
            this.ignored = null;
        } catch (err) {
            this.ignored = err.message;
            logger.warn('Icon pack ignored:', err.message);
        }
        this.showCurrent();
    }
    showCurrent() {
        const el = get('currentIconPackDisplay');
        if (!el) return;
        // L'attribut tr seulement pour le libellé par défaut : le traducteur écraserait un nom de pack.
        if (this.installed) el.removeAttribute('tr');
        else el.setAttribute('tr', 'ICONS_DEFAULT');
        el.textContent = this.installed ? this.installed.name : tr('ICONS_DEFAULT');
    }
    meta(pack) {
        return { id: String(pack.id || ''), name: String(pack.name || pack.id || ''), author: String(pack.author || ''), version: String(pack.version || '') };
    }
    // Lève une erreur au premier écart : le pack est alors ignoré en entier.
    validate(pack, prefix = 'pk-') {
        if (!pack || typeof pack !== 'object') throw new Error('not an object');
        if (Math.floor(Number(pack.contract)) !== ICON_CONTRACT) throw new Error('contract ' + pack.contract + ' (expected ' + ICON_CONTRACT + ')');
        if (!ICON_PACK_ID.test(pack.id || '')) throw new Error('invalid id');
        const doc = new DOMParser().parseFromString(String(pack.svg || ''), 'image/svg+xml');
        const root = doc.documentElement;
        if (doc.querySelector('parsererror') || root.localName !== 'svg') throw new Error('invalid svg');
        const ids = new Set();
        for (const el of root.querySelectorAll('*')) {
            if (!ICON_PACK_TAGS.has(el.localName)) throw new Error('element <' + el.localName + '>');
            for (const a of el.attributes) {
                if (!ICON_PACK_ATTRS.has(a.name)) throw new Error('attribute ' + a.name);
                const v = a.value;
                if ((a.name === 'href' || a.name === 'xlink:href') && !/^#[\w-]+$/.test(v)) throw new Error('external href');
                if (/url\(/i.test(v) && v.replace(ICON_PACK_REF, '').match(/url\(/i)) throw new Error('external url()');
                if (a.name === 'style' && !/^\s*--travel\s*:\s*[\d.]+\s*;?\s*$/.test(v)) throw new Error('style');
                if (a.name === 'class' && v.split(/\s+/).some(c => c && !ICON_PACK_CLASSES.has(c))) throw new Error('class ' + v);
            }
            if (el.id) ids.add(el.id);
        }
        const symbols = [...root.children].filter(el => el.localName === 'symbol');
        if (!symbols.length) throw new Error('no symbol');
        for (const s of symbols) {
            if (!ICON_PACK_SYMBOLS.includes(s.id)) throw new Error('unknown symbol ' + s.id);
            if (s.getAttribute('viewBox') !== '0 0 48 48') throw new Error('viewBox of ' + s.id);
        }
        const tokens = { light: {}, dark: {} };
        for (const theme of ['light', 'dark']) {
            const src = (pack.tokens && pack.tokens[theme]) || {};
            for (const [k, v] of Object.entries(src)) {
                if (!ICON_PACK_TOKENS.includes(k) && !/^--pk-[a-z0-9-]{1,24}$/.test(k)) throw new Error('token ' + k);
                if (typeof v !== 'string' || !/^[#a-z0-9(),.%\s-]{1,80}$/i.test(v) || /url/i.test(v)) throw new Error('value of ' + k);
                tokens[theme][k] = v;
            }
        }
        // Les matières du pack sont préfixées : un pack partiel ne doit pas écraser les shd-* dont
        // dépendent les icônes par défaut qu'il ne redéfinit pas. Les id de symboles restent.
        const rename = id => (ids.has(id) && !ICON_PACK_SYMBOLS.includes(id)) ? prefix + id : id;
        for (const el of root.querySelectorAll('*')) {
            for (const a of [...el.attributes]) {
                if (a.name === 'id') el.id = rename(a.value);
                else if (a.name === 'href' || a.name === 'xlink:href') {
                    el.removeAttribute(a.name);
                    el.setAttribute('href', '#' + rename(a.value.slice(1)));
                }
                else if (a.value.includes('url(')) el.setAttribute(a.name, a.value.replace(ICON_PACK_REF, (m, id) => `url(#${rename(id)})`));
            }
        }
        const defs = [...root.children].filter(el => el.localName === 'defs');
        return { symbols, defs, tokens };
    }
    apply(pack) {
        const v = this.validate(pack);
        this.restoreDefaults();
        for (const s of v.symbols) {
            const current = document.getElementById(s.id);
            if (!current) continue;
            this._defaults.set(s.id, current);
            current.replaceWith(document.importNode(s, true));
        }
        // Hors du sprite en display:none, comme les matières du défaut (cf. index.html).
        const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        host.id = 'iconPackDefs';
        host.setAttribute('width', '0');
        host.setAttribute('height', '0');
        host.setAttribute('aria-hidden', 'true');
        host.style.position = 'absolute';
        v.defs.forEach(d => host.appendChild(document.importNode(d, true)));
        document.body.appendChild(host);
        const css = ['light', 'dark'].map(t => {
            const decl = Object.entries(v.tokens[t]).map(([k, val]) => `${k}:${val};`).join('');
            return decl ? `:root[data-theme="${t}"]{${decl}}` : '';
        }).join('');
        if (css) {
            const style = document.createElement('style');
            style.id = 'iconPackTokens';
            style.textContent = css;
            document.head.appendChild(style);
        }
        this.applied = this.meta(pack);
        this.refreshUses();
    }
    restoreDefaults() {
        for (const [id, el] of this._defaults) {
            const current = document.getElementById(id);
            if (current) current.replaceWith(el);
        }
        this._defaults.clear();
        get('iconPackDefs')?.remove();
        get('iconPackTokens')?.remove();
        this.applied = null;
        this.refreshUses();
    }
    // --- Catalogue : toucher une tuile l'affiche en aperçu (page seulement) ; seule l'action du pied
    // de la modale écrit sur le boîtier. La tuile par défaut se choisit comme les autres.
    openManager() {
        const div = document.createElement('div');
        div.id = 'divIconManagerOverlay';
        div.className = 'modal-overlay';
        const scene = ['svg-shutter', 'svg-window-blind', 'svg-cdrapery', 'svg-awning', 'svg-garage', 'svg-cgate']
            .map(i => `<svg viewBox="0 0 48 48"><use href="#${i}"></use></svg>`).join('');
        div.innerHTML = `
        <div class="message-content icon-pack-content">
        ${modalHeader('ICONS_TITLE', 'svg-indicShutter', { subtitle: 'ICONS_TITLE_DESC' })}
        <div class="icon-pack-scene">
            <div class="icon-pack-scene-icons">${scene}</div>
        </div>
        <div class="icon-pack-body">
            <div class="icon-pack-label">${tr('ICONS_SECTION_DEFAULT')}</div>
            <div class="icon-pack-tile is-default" data-pack="" onclick="iconPacks.select('')">
                <div class="icon-pack-thumb" id="iconThumbDefault"></div>
                <div class="icon-pack-txt"><div class="icon-pack-name">${tr('ICONS_DEFAULT')}</div><div class="icon-pack-meta">${tr('ICONS_DEFAULT_DESC')}</div></div>
                <span class="icon-pack-tag"></span>
            </div>
            <div class="icon-pack-label icon-pack-label-dl">${tr('ICONS_SECTION_DOWNLOAD')}<span id="iconPackCount"></span></div>
            <p id="iconPackNotice" class="lang-catalog-manual-import-info margin0"></p>
            <div class="icon-pack-grid-wrap"><div class="icon-pack-grid" id="iconCatalog"></div></div>
            ${fileDropZone('fileIconImport', 'FILE_PICK_ICONS')}
            <input id="fileIconImport" type="file" accept="application/json,.json" style="display:none" onchange="iconPacks.importFile(this)"/>
        </div>
        <div class="hrModal margin0"></div>
        <p class="lang-catalog-manual-import-info icon-pack-foot-txt" id="iconPackFootTxt"></p>
        <div class="button-container-modal"><div class="button-content-modal" id="iconPackFoot"></div></div>
        </div>`;
        shOverlay(div);
        div.onclick = (e) => {
            if (e.target.closest('[data-icon-close]')) requestCloseOverlay(div);
        };
        // Quelle que soit la façon dont la modale se ferme, un aperçu non installé ne survit pas.
        new MutationObserver((m, obs) => {
            if (div.isConnected) return;
            obs.disconnect();
            this.cancelPreview();
        }).observe(get('divContainer'), { childList: true });
        this._catalog = null;
        this._packs = this._packs || {};
        if (this._installedPack) this._packs[this._installedPack.id] = this._installedPack;
        this._selected = this.installed ? this.installed.id : '';
        get('iconThumbDefault').innerHTML = this.thumbHtml(null);
        this.renderCatalog();
        this.animateScene();
        fetch(GITHUB_RAW_ROOT + 'main/icons/manifest.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
            .then(m => { this._catalog = m && m.packs ? m.packs : {}; })
            .catch(err => { logger.warn('Icon catalog unavailable:', err.message); this._catalog = false; })
            .finally(() => {
                this.renderCatalog();
                // Vignettes chargées une à une : chaque tuile se dessine dans le style de son pack.
                Object.keys(this._catalog || {}).filter(id => ICON_PACK_ID.test(id)).forEach(id => this.fetchPack(id).then(() => this.renderThumb(id), () => {}));
            });
    }
    fetchPack(id) {
        if (this._packs[id]) return Promise.resolve(this._packs[id]);
        return fetch(GITHUB_RAW_ROOT + 'main/icons/' + encodeURIComponent(id) + '.json', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
            .then(p => { if (p.id !== id) throw new Error('id mismatch'); this._packs[id] = p; return p; });
    }
    // Vignette autonome : symboles et matières recopiés sous un préfixe propre à la tuile, et
    // jetons de couleur limités à elle, pour ne rien emprunter au pack affiché par la page.
    thumbHtml(pack) {
        const ids = ['svg-shutter', 'svg-garage', 'svg-cgate'];
        if (!pack) {
            return ids.map(i => {
                const el = this._defaults.get(i) || document.getElementById(i);
                return `<svg viewBox="0 0 48 48">${el ? el.innerHTML : ''}</svg>`;
            }).join('');
        }
        this._thumbSeq = (this._thumbSeq || 0) + 1;
        const v = this.validate(pack, `th${this._thumbSeq}-`);
        const defs = v.defs.map(d => d.outerHTML).join('');
        return ids.map((i, n) => {
            const sym = v.symbols.find(x => x.id === i) || this._defaults.get(i) || document.getElementById(i);
            return `<svg viewBox="0 0 48 48">${n === 0 ? defs : ''}${sym ? sym.innerHTML : ''}</svg>`;
        }).join('');
    }
    renderThumb(id) {
        const el = document.querySelector(`#iconCatalog [data-pack="${id}"] .icon-pack-thumb`);
        if (!el || !this._packs[id]) return;
        try {
            el.innerHTML = this.thumbHtml(this._packs[id]);
            const v = this.validate(this._packs[id], 'x-');
            const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
            Object.entries(v.tokens[theme]).forEach(([k, val]) => el.style.setProperty(k, val));
        } catch (err) {
            el.closest('.icon-pack-tile').classList.add('is-broken');
        }
    }
    // Relance le cycle de démonstration : retirer puis reposer la classe ne suffit pas sans reflow.
    animateScene() {
        const el = document.querySelector('#divIconManagerOverlay .icon-pack-scene');
        if (!el) return;
        el.classList.remove('is-animating');
        void el.offsetWidth;
        el.classList.add('is-animating');
    }
    renderCatalog() {
        const grid = get('iconCatalog');
        if (!grid) return;
        const inst = this.installed ? this.installed.id : '';
        const sel = this._selected;
        const tag = id => id === inst ? `<span class="lang-catalog-badge active">${tr('ICONS_INSTALLED')}</span>`
            : id === sel ? `<span class="lang-catalog-badge">${tr('ICONS_PREVIEW')}</span>` : '';
        const name = id => id ? ((this._packs[id] && this._packs[id].name) || (this._catalog && this._catalog[id] && this._catalog[id].name) || id) : tr('ICONS_DEFAULT');
        const def = document.querySelector('#divIconManagerOverlay .icon-pack-tile.is-default');
        def.classList.toggle('selected', sel === '');
        def.querySelector('.icon-pack-tag').innerHTML = tag('');
        // Grille
        const packs = Object.assign({}, this._catalog || {});
        Object.values(this._packs).forEach(p => { if (!packs[p.id]) packs[p.id] = this.meta(p); });
        const ids = Object.keys(packs).filter(id => ICON_PACK_ID.test(id));
        get('iconPackCount').textContent = ids.length ? tr('ICONS_COUNT').replace('{N}', ids.length) : '';
        const notice = get('iconPackNotice');
        const msg = this._catalog === false ? tr('ICONS_CATALOG_UNAVAILABLE') : (this.ignored ? tr('ICONS_IGNORED').replace('{REASON}', this.ignored) : '');
        notice.textContent = msg;
        notice.style.display = msg ? '' : 'none';
        grid.innerHTML = ids.map(id => {
            const p = packs[id];
            const size = p.size ? ` · ${(p.size / 1024).toFixed(1).replace('.', ',')} Ko` : '';
            return `<div class="icon-pack-tile${id === sel ? ' selected' : ''}" data-pack="${id}" onclick="iconPacks.select('${id}')">
                <div class="icon-pack-thumb"></div>
                <div class="icon-pack-name">${escHtml(p.name || id)}</div>
                <div class="icon-pack-meta">${escHtml(p.author || '')}${size}</div>
                <span class="icon-pack-tag">${tag(id)}</span></div>`;
        }).join('');
        ids.forEach(id => this.renderThumb(id));
        // Pied : une seule action, celle qui correspond à la tuile choisie
        const btn = (label, go, attr) => `<button type="button" ${attr} onclick="iconPacks.${go}()">${label}</button>`;
        let st, actions;
        if (sel === inst) {
            st = inst ? tr('ICONS_FOOT_INSTALLED').replace('{NAME}', escHtml(name(inst))) : tr('ICONS_FOOT_DEFAULT');
            actions = `<button type="button" line data-icon-close>${tr('BT_CLOSE')}</button>`;
        } else if (sel === '') {
            st = tr('ICONS_FOOT_PREVIEW_DEFAULT').replace('{NAME}', escHtml(name(inst)));
            actions = btn(tr('BT_CANCEL'), 'cancelPreview', 'line') + btn(tr('ICONS_BACK_DEFAULT'), 'install', '');
        } else {
            st = tr('ICONS_FOOT_PREVIEW').replace('{NAME}', escHtml(name(sel))) + (inst ? ' ' + tr('ICONS_FOOT_REPLACES').replace('{NAME}', escHtml(name(inst))) : '');
            actions = btn(tr('BT_CANCEL'), 'cancelPreview', 'line') + btn(tr('BT_INSTALL_LANG'), 'install', '');
        }
        get('iconPackFootTxt').innerHTML = st;
        get('iconPackFoot').innerHTML = actions;
    }
    async select(id) {
        try {
            if (id === '') this.restoreDefaults();
            else this.apply(await this.fetchPack(id));
            this._selected = id;
            this.animateScene();
        } catch (err) {
            ui.serviceError({ desc: tr('ERR_ICONS_INVALID').replace('{REASON}', escHtml(err.message)) });
        }
        this.renderCatalog();
    }
    importFile(input) {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        file.text().then(txt => {
            const pack = JSON.parse(txt);
            this.validate(pack);
            this._packs[pack.id] = pack;
            return this.select(pack.id);
        }).catch(err => {
            ui.serviceError({ desc: tr('ERR_ICONS_INVALID').replace('{REASON}', escHtml(err.message)) });
            this.renderCatalog();
        });
    }
    cancelPreview() {
        const inst = this.installed ? this.installed.id : '';
        if (this._selected === undefined || this._selected === inst) return;
        this._selected = inst;
        if (this._installedPack) this.apply(this._installedPack);
        else this.restoreDefaults();
        this.renderCatalog();
    }
    async install() {
        if (this._selected === '') return this.useDefault();
        const pack = this._packs[this._selected];
        if (!pack) return;
        const div = get('divIconManagerOverlay');
        setOverlayLock(div, 'confirm', {});
        try {
            const gz = await new Response(new Blob([JSON.stringify(pack)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
            if (gz.size > ICON_PACK_MAX) throw new Error(tr('ERR_ICONS_TOO_LARGE'));
            const fd = new FormData();
            fd.append('file', gz, 'pack.json.gz');
            const resp = await fetch(baseUrl + '/uploadIcons', { method: 'POST', body: fd, headers: { apikey: security.apiKey || '' } });
            if (resp.status === 413) throw new Error(tr('ERR_ICONS_TOO_LARGE'));
            const json = await resp.json().catch(() => ({}));
            if (json.status !== 'ok') throw new Error(json.error || json.desc || ('HTTP ' + resp.status));
            this.installed = this.meta(pack);
            this._installedPack = pack;
            this.ignored = null;
        } catch (err) {
            ui.serviceError({ desc: escHtml(err.message), service: '/uploadIcons' });
        }
        clearOverlayLock(div);
        this.showCurrent();
        this.renderCatalog();
    }
    async useDefault() {
        try {
            const resp = await deviceFetch('/deleteIcons', { method: 'POST' });
            if (resp.status !== 'ok') throw resp;
            this.installed = null;
            this._installedPack = null;
            this.ignored = null;
            this._selected = '';
            this.restoreDefaults();
        } catch (err) {
            ui.serviceError(err);
        }
        this.showCurrent();
        this.renderCatalog();
    }
    // Un <use> ne suit pas toujours le remplacement du <symbol> qu'il vise : on réaffecte son href.
    refreshUses() {
        document.querySelectorAll('use').forEach(u => {
            const h = u.getAttribute('href');
            if (h && ICON_PACK_SYMBOLS.includes(h.slice(1))) u.setAttribute('href', h);
        });
    }
}
var iconPacks = new IconPacks();
