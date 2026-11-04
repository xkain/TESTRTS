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

class IconPacks {
    constructor() {
        this.installed = null;  // métadonnées du pack installé sur le boîtier
        this.applied = null;    // pack affiché : installé, ou aperçu en cours
        this.ignored = null;    // raison du rejet du pack installé
        this._defaults = new Map();
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
            this.ignored = null;
        } catch (err) {
            this.ignored = err.message;
            logger.warn('Icon pack ignored:', err.message);
        }
    }
    meta(pack) {
        return { id: String(pack.id || ''), name: String(pack.name || pack.id || ''), author: String(pack.author || ''), version: String(pack.version || '') };
    }
    // Lève une erreur au premier écart : le pack est alors ignoré en entier.
    validate(pack) {
        if (!pack || typeof pack !== 'object') throw new Error('not an object');
        if (Math.floor(Number(pack.contract)) !== ICON_CONTRACT) throw new Error('contract ' + pack.contract + ' (expected ' + ICON_CONTRACT + ')');
        if (!/^[a-z0-9-]{1,32}$/.test(pack.id || '')) throw new Error('invalid id');
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
        const rename = id => (ids.has(id) && !ICON_PACK_SYMBOLS.includes(id)) ? 'pk-' + id : id;
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
    // Un <use> ne suit pas toujours le remplacement du <symbol> qu'il vise : on réaffecte son href.
    refreshUses() {
        document.querySelectorAll('use').forEach(u => {
            const h = u.getAttribute('href');
            if (h && ICON_PACK_SYMBOLS.includes(h.slice(1))) u.setAttribute('href', h);
        });
    }
}
var iconPacks = new IconPacks();
