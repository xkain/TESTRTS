// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
// Télécommandes virtuelles dessinées : moteur de rendu des packs (contrat ../audit/CONTRAT-TELECOMMANDES-v1.md).
// Les packs intégrés passent par la même validation que ceux qui seront téléchargés.

// Liste blanche du SVG d'une coque : ni class ni style, aucun emploi sur une coque.
const RC_TAGS = new Set(['svg', 'defs', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'use']);
const RC_ATTRS = new Set(['id', 'href', 'viewBox', 'preserveAspectRatio', 'transform', 'd',
    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'width', 'height', 'points',
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
    'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'clip-path',
    'clip-rule', 'mask', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
    'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform', 'clipPathUnits', 'maskUnits',
    'maskContentUnits', 'xmlns', 'color', 'data-key', 'data-press', 'data-led', 'data-knob', 'data-travel', 'data-ribs']);
const RC_CMDS = new Set(['up', 'down', 'my', 'toggle', 'stop', 'favorite', 'Prog']);
const RC_LABELS = { up: 'BT_OPEN', down: 'BT_CLOSE', my: 'BT_MY', toggle: 'VR_TOGGLE', stop: 'BT_STOP', favorite: 'VR_FAVORITE', Prog: 'BT_PROG' };
const RC_PROG_ARM_MS = 1000;

const remotePacks = {
    builtin: {},
    // Lève une erreur au premier écart : le pack est alors ignoré en entier.
    sanitize(pack) {
        if (!pack || pack.contract !== 1 || !/^[a-z0-9-]{1,32}$/.test(pack.id || '')) throw new Error('header');
        const doc = new DOMParser().parseFromString(String(pack.svg || ''), 'image/svg+xml');
        const svg = doc.documentElement;
        if (doc.querySelector('parsererror') || svg.localName !== 'svg') throw new Error('invalid svg');
        for (const el of [svg, ...svg.querySelectorAll('*')]) {
            if (!RC_TAGS.has(el.localName)) throw new Error('element <' + el.localName + '>');
            for (const a of el.attributes) {
                if (!RC_ATTRS.has(a.name)) throw new Error('attribute ' + a.name);
                if (a.name === 'href' && !/^#[\w-]+$/.test(a.value)) throw new Error('external href');
                if (/url\(/i.test(a.value) && a.value.replace(/url\(#[\w-]+\)/g, '').match(/url\(/i)) throw new Error('external url()');
            }
        }
        const keys = new Map();
        for (const k of pack.keys || []) {
            if (k.does !== 'press' || !RC_CMDS.has(k.cmd)) throw new Error('key ' + k.key);
            keys.set(String(k.key), k);
        }
        for (const el of svg.querySelectorAll('[data-key]')) if (!keys.has(el.getAttribute('data-key'))) throw new Error('key without entry ' + el.getAttribute('data-key'));
        const pre = 'rc-' + pack.id + '-';
        for (const el of [svg, ...svg.querySelectorAll('*')]) {
            if (el.id) el.id = pre + el.id;
            for (const a of [...el.attributes]) {
                if (a.name === 'href') a.value = '#' + pre + a.value.slice(1);
                else if (/url\(#/.test(a.value)) a.value = a.value.replace(/url\(#([\w-]+)\)/g, `url(#${pre}$1)`);
            }
        }
        return { svg: document.importNode(svg, true), keys };
    },
    // Le choix enregistré (remoteModel) l'emporte s'il est connu ; sinon le porte-clés pour un
    // équipement à impulsion, la télécommande générique pour le reste.
    pickId(model, impulse) {
        if (model && this.builtin[model]) return model;
        return impulse ? 'keygo-rts' : 'situo-1-rts';
    },
    // onPress(el, evt) reçoit la touche, qui porte data-cmd : c'est elle que lit sendVRCommand.
    mount(host, id, onPress) {
        const pack = this.builtin[id];
        let res;
        try { res = this.sanitize(pack); }
        catch (e) { logger.error('Remote pack ' + id + ' refused:', e.message); host.replaceChildren(); return null; }
        const svg = res.svg;
        const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
        if (vb.length === 4) { svg.setAttribute('width', vb[2]); svg.setAttribute('height', vb[3]); }
        svg.classList.add('rcpack');
        if (pack.shadow === 'wall') svg.classList.add('rc-wall');
        svg.setAttribute('role', 'group');
        svg.setAttribute('aria-label', tr('SUBTAB_VIRTUAL_REMOTE_L'));
        for (const el of svg.querySelectorAll('[data-key]')) {
            const k = res.keys.get(el.getAttribute('data-key'));
            el.setAttribute('data-cmd', k.cmd);
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
            el.setAttribute('aria-label', tr(RC_LABELS[k.cmd]));
            this.bindPress(svg, el, k.cmd === 'Prog', onPress);
        }
        host.replaceChildren(svg);
        return svg;
    },
    // Prog n'émet qu'après RC_PROG_ARM_MS de maintien (contrat v1, section 4) : un effleurement ne
    // doit pas faire sortir un moteur de son appairage. La répétition, elle, reste celle de
    // sendVRCommand (mouseDown global), qui se poursuit tant que le doigt est posé.
    bindPress(svg, el, isProg, onPress) {
        let arm = null;
        const fire = (evt) => {
            svg.classList.add('rc-tx');
            clearTimeout(svg._rcTx); svg._rcTx = setTimeout(() => svg.classList.remove('rc-tx'), 900);
            onPress(el, evt);
        };
        const start = (evt) => {
            el.classList.add('is-down');
            if (!isProg) { fire(evt); return; }
            clearTimeout(arm);
            arm = setTimeout(() => { arm = null; if (el.classList.contains('is-down')) fire(); }, RC_PROG_ARM_MS);
        };
        const end = () => { el.classList.remove('is-down'); clearTimeout(arm); arm = null; };
        // Pas de preventDefault : il supprimerait le mousedown qui pose `mouseDown`, et avec lui la
        // répétition à l'appui maintenu.
        el.addEventListener('pointerdown', (evt) => { if (isPrimaryPress(evt)) start(evt); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.addEventListener(t, end));
        // Clavier : une activation = une trame, sans répétition (mouseDown reste faux) ; Prog
        // s'arme sur la touche tenue, comme au doigt.
        el.addEventListener('keydown', (evt) => {
            if (evt.key !== 'Enter' && evt.key !== ' ') return;
            evt.preventDefault();
            if (!evt.repeat) start();
        });
        el.addEventListener('keyup', end);
        el.addEventListener('blur', end);
    }
};
// Les deux télécommandes intégrées (contrat v1, section 7), générées par maquette-telecommande/gen_remotes.py.
remotePacks.builtin["situo-1-rts"] = {"contract":1,"id":"situo-1-rts","name":"Situo 1 RTS","height":402,"fits":{"bits":[56,80],"group":true},"keys":[{"key":"up","cmd":"up","does":"press"},{"key":"my","cmd":"my","does":"press"},{"key":"down","cmd":"down","does":"press"},{"key":"prog","cmd":"Prog","does":"press"}],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 124 402\"><defs><linearGradient id=\"slot\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#0e0f11\"/><stop offset=\"1\" stop-color=\"#2a2c30\"/></linearGradient><linearGradient id=\"hole\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d8d8d6\"/><stop offset=\".45\" stop-color=\"#f1f1f0\"/></linearGradient><radialGradient id=\"halo\"><stop offset=\"0\" stop-color=\"var(--color-accent)\" stop-opacity=\".22\"/><stop offset=\"1\" stop-color=\"var(--color-accent)\" stop-opacity=\"0\"/></radialGradient></defs><path d=\"M41 0H83A41 41 0 0 1 124 41V361A41 41 0 0 1 83 402H41A41 41 0 0 1 0 361V41A41 41 0 0 1 41 0Z\" fill=\"#8a8e94\"/><path d=\"M41 1H83A40 40 0 0 1 123 41V361A40 40 0 0 1 83 401H41A40 40 0 0 1 1 361V41A40 40 0 0 1 41 1Z\" fill=\"#3a3d42\"/><path d=\"M41 4H83A37 37 0 0 1 120 41V361A37 37 0 0 1 83 398H41A37 37 0 0 1 4 361V41A37 37 0 0 1 41 4Z\" fill=\"#f3f3f2\"/><path d=\"M41 8H83A33 33 0 0 1 116 41V361A33 33 0 0 1 83 394H41A33 33 0 0 1 8 361V41A33 33 0 0 1 41 8Z\" fill=\"#dcdde0\"/><path d=\"M41 9H83A32 32 0 0 1 115 41V361A32 32 0 0 1 83 393H41A32 32 0 0 1 9 361V41A32 32 0 0 1 41 9Z\" fill=\"#fff\"/><path d=\"M36 24H88A7 7 0 0 1 95 31V36A10 10 0 0 1 85 46H39A10 10 0 0 1 29 36V31A7 7 0 0 1 36 24Z\" fill=\"url(#slot)\"/><rect x=\"31\" y=\"25\" width=\"62\" height=\"2\" rx=\"1\" fill=\"#000\" fill-opacity=\".35\"/><g data-key=\"up\"><path data-press=\"\" d=\"M28 58H96A14 14 0 0 1 110 72V169A14 14 0 0 1 96 183H28A14 14 0 0 1 14 169V72A14 14 0 0 1 28 58Z\" fill=\"url(#halo)\"/><path d=\"M28 58H96A14 14 0 0 1 110 72V169A14 14 0 0 1 96 183H28A14 14 0 0 1 14 169V72A14 14 0 0 1 28 58Z\" fill=\"#000\" fill-opacity=\"0\"/><path d=\"M57 135L62 130L67 135\" fill=\"none\" stroke=\"#6a6d73\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g><g data-key=\"down\"><path data-press=\"\" d=\"M28 183H96A14 14 0 0 1 110 197V294A14 14 0 0 1 96 308H28A14 14 0 0 1 14 294V197A14 14 0 0 1 28 183Z\" fill=\"url(#halo)\"/><path d=\"M28 183H96A14 14 0 0 1 110 197V294A14 14 0 0 1 96 308H28A14 14 0 0 1 14 294V197A14 14 0 0 1 28 183Z\" fill=\"#000\" fill-opacity=\"0\"/><path d=\"M57 231L62 236L67 231\" fill=\"none\" stroke=\"#6a6d73\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g><rect x=\"6\" y=\"183\" width=\"112\" height=\"1\" fill=\"#cfd1d4\"/><g data-key=\"my\"><path d=\"M39 184a23 23 0 1 0 46 0a23 23 0 1 0 -46 0Z\" fill=\"#000\" fill-opacity=\".1\"/><path d=\"M39 183a23 23 0 1 0 46 0a23 23 0 1 0 -46 0Z\" fill=\"#c8cacd\"/><path d=\"M41 183a21 21 0 1 0 42 0a21 21 0 1 0 -42 0Z\" fill=\"#fff\"/><path data-press=\"\" d=\"M41 183a21 21 0 1 0 42 0a21 21 0 1 0 -42 0Z\" fill=\"#000\" fill-opacity=\".14\"/><path d=\"M53.17 180.8V188H55.04V183.68C55.04 182.79 55.51 182.27 56.31 182.27C56.94 182.27 57.33 182.63 57.33 183.2V188H59.19V183.68C59.19 182.8 59.67 182.27 60.47 182.27C61.1 182.27 61.49 182.63 61.49 183.2V188H63.35V182.91C63.35 181.51 62.5 180.68 61.06 180.68C60.14 180.68 59.51 181 58.95 181.75C58.61 181.07 57.89 180.68 56.99 180.68C56.17 180.68 55.63 180.95 55.02 181.69V180.8ZM69.47 180.8 67.98 186.04 66.39 180.8H64.34L67.02 188.29C67.02 189.04 66.55 189.55 65.86 189.55C65.71 189.55 65.59 189.52 65.37 189.47V190.87C65.65 190.91 65.81 190.92 66.03 190.92C66.51 190.92 67.05 190.83 67.38 190.69C67.9 190.48 68.13 190.19 68.43 189.32L71.39 180.8Z\" fill=\"#45484d\"/></g><path data-led=\"\" d=\"M60 316a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z\" fill=\"#9a9da2\"/><g data-key=\"prog\"><path d=\"M47 361a15 15 0 1 0 30 0a15 15 0 1 0 -30 0Z\" fill=\"url(#hole)\"/><path data-press=\"\" d=\"M47 361a15 15 0 1 0 30 0a15 15 0 1 0 -30 0Z\" fill=\"#000\" fill-opacity=\".14\"/><path d=\"M53.7 361.61H54.92C55.79 361.61 56.35 360.99 56.35 360.03C56.35 359.08 55.81 358.56 54.82 358.56H52.73V363.3H53.7ZM53.7 360.8V359.37H54.61C55.13 359.37 55.37 359.6 55.37 360.08C55.37 360.57 55.13 360.8 54.61 360.8ZM58.19 361.42H59.31C59.73 361.42 59.92 361.59 59.92 361.98V362.18C59.91 362.3 59.91 362.42 59.91 362.49C59.91 362.94 59.94 363.07 60.05 363.3H61.1V363.12C60.95 363.04 60.89 362.94 60.89 362.73C60.87 361.34 60.84 361.27 60.24 361.01C60.77 360.8 61.03 360.42 61.03 359.84C61.03 359.47 60.9 359.12 60.68 358.89C60.46 358.67 60.16 358.56 59.76 358.56H57.22V363.3H58.19ZM58.19 360.61V359.37H59.37C59.65 359.37 59.76 359.4 59.88 359.5C60 359.6 60.06 359.76 60.06 359.98C60.06 360.21 60 360.39 59.88 360.49C59.77 360.58 59.65 360.61 59.37 360.61ZM64.06 358.48C63.39 358.48 62.85 358.7 62.45 359.14C62.02 359.6 61.78 360.26 61.78 360.97C61.78 361.68 62.02 362.34 62.45 362.79C62.85 363.24 63.39 363.45 64.06 363.45C64.74 363.45 65.27 363.24 65.68 362.79C66.09 362.36 66.35 361.67 66.35 361C66.35 360.26 66.1 359.59 65.68 359.14C65.27 358.69 64.75 358.48 64.06 358.48ZM64.06 359.32C64.86 359.32 65.37 359.97 65.37 360.99C65.37 361.97 64.84 362.62 64.06 362.62C63.27 362.62 62.76 361.97 62.76 360.97C62.76 359.97 63.27 359.32 64.06 359.32ZM71.33 360.75H69.43V361.56H70.51C70.49 361.83 70.42 361.99 70.28 362.16C70.04 362.45 69.68 362.62 69.31 362.62C68.52 362.62 67.96 361.93 67.96 360.95C67.96 359.93 68.45 359.32 69.28 359.32C69.62 359.32 69.91 359.41 70.12 359.6C70.26 359.72 70.33 359.83 70.41 360.08H71.33C71.21 359.09 70.42 358.48 69.28 358.48C67.91 358.48 66.98 359.49 66.98 360.97C66.98 362.4 67.92 363.45 69.2 363.45C69.84 363.45 70.26 363.22 70.63 362.69L70.75 363.31H71.33Z\" fill=\"#9b9ea3\"/></g></svg>"};
remotePacks.builtin["keygo-rts"] = {"contract":1,"id":"keygo-rts","name":"Keygo RTS","height":270,"fits":{"bits":[56,80],"types":[5,6,9,11,12,13,14,15,16],"group":false},"keys":[{"key":"toggle","cmd":"toggle","does":"press"},{"key":"prog","cmd":"Prog","does":"press"}],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 156 270\"><defs><linearGradient id=\"body\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#2b2c2f\"/><stop offset=\"1\" stop-color=\"#151618\"/></linearGradient><radialGradient id=\"cup\" cx=\".5\" cy=\".3\" r=\".7\"><stop offset=\"0\" stop-color=\"#77797c\"/><stop offset=\"1\" stop-color=\"#4b4c50\"/></radialGradient><linearGradient id=\"cupsh\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#000\" stop-opacity=\".45\"/><stop offset=\".15\" stop-color=\"#000\" stop-opacity=\"0\"/></linearGradient><radialGradient id=\"btn\" cx=\".45\" cy=\".35\" r=\".75\"><stop offset=\"0\" stop-color=\"#6c6e72\"/><stop offset=\"1\" stop-color=\"#47484c\"/></radialGradient><radialGradient id=\"bump\" cx=\".4\" cy=\".35\" r=\".75\"><stop offset=\"0\" stop-color=\"#5d5f63\"/><stop offset=\"1\" stop-color=\"#35363a\"/></radialGradient><linearGradient id=\"ring\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"0\"><stop offset=\"0\" stop-color=\"#8e9297\"/><stop offset=\".5\" stop-color=\"#c9ccd0\"/><stop offset=\"1\" stop-color=\"#8e9297\"/></linearGradient></defs><path d=\"M33 200V220A45 45 0 0 0 123 220V200\" fill=\"none\" stroke=\"#000\" stroke-opacity=\".3\" stroke-width=\"6\" transform=\"translate(0 3)\"/><path d=\"M33 200V220A45 45 0 0 0 123 220V200\" fill=\"none\" stroke=\"url(#ring)\" stroke-width=\"6\"/><path d=\"M78 0H78A78 78 0 0 1 156 78V192A34 34 0 0 1 122 226H34A34 34 0 0 1 0 192V78A78 78 0 0 1 78 0Z\" fill=\"#3c3d41\"/><path d=\"M78 2H78A76 76 0 0 1 154 78V192A32 32 0 0 1 122 224H34A32 32 0 0 1 2 192V78A76 76 0 0 1 78 2Z\" fill=\"url(#body)\"/><path d=\"M78 9H78A69 69 0 0 1 147 78V192A25 25 0 0 1 122 217H34A25 25 0 0 1 9 192V78A69 69 0 0 1 78 9Z\" fill=\"#303135\"/><path d=\"M78 10H78A68 68 0 0 1 146 78V192A24 24 0 0 1 122 216H34A24 24 0 0 1 10 192V78A68 68 0 0 1 78 10Z\" fill=\"url(#body)\"/><path d=\"M60 3.8H96\" stroke=\"#fff\" stroke-opacity=\".12\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><path data-led=\"\" d=\"M71 7H85A2 2 0 0 1 87 9V9A2 2 0 0 1 85 11H71A2 2 0 0 1 69 9V9A2 2 0 0 1 71 7Z\" fill=\"#3a3b3e\"/><path d=\"M26 78a52 52 0 1 0 104 0a52 52 0 1 0 -104 0Z\" fill=\"url(#cup)\"/><path d=\"M26 78a52 52 0 1 0 104 0a52 52 0 1 0 -104 0Z\" fill=\"url(#cupsh)\"/><g data-key=\"toggle\"><path d=\"M42 81a36 36 0 1 0 72 0a36 36 0 1 0 -72 0Z\" fill=\"#000\" fill-opacity=\".35\"/><path d=\"M42 78a36 36 0 1 0 72 0a36 36 0 1 0 -72 0Z\" fill=\"url(#btn)\"/><path data-press=\"\" d=\"M42 78a36 36 0 1 0 72 0a36 36 0 1 0 -72 0Z\" fill=\"var(--color-accent)\" fill-opacity=\".3\"/><path d=\"M58 54A30 30 0 0 1 98 54\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".18\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></g><rect x=\"48\" y=\"146\" width=\"1.5\" height=\"30\" fill=\"#0c0c0d\"/><rect x=\"51.5\" y=\"146\" width=\"1.5\" height=\"30\" fill=\"#0c0c0d\"/><rect x=\"53\" y=\"146\" width=\"1\" height=\"30\" fill=\"#fff\" fill-opacity=\".07\"/><rect x=\"103\" y=\"146\" width=\"1.5\" height=\"30\" fill=\"#0c0c0d\"/><rect x=\"106.5\" y=\"146\" width=\"1.5\" height=\"30\" fill=\"#0c0c0d\"/><rect x=\"108\" y=\"146\" width=\"1\" height=\"30\" fill=\"#fff\" fill-opacity=\".07\"/><g data-key=\"prog\"><path d=\"M66 163a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z\" fill=\"#000\" fill-opacity=\".5\"/><path d=\"M66 161a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z\" fill=\"url(#bump)\"/><path data-press=\"\" d=\"M66 161a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z\" fill=\"var(--color-accent)\" fill-opacity=\".4\"/></g><path d=\"M63.43 192.4H65.3C66.64 192.4 67.5 191.45 67.5 189.97C67.5 188.51 66.67 187.71 65.16 187.71H61.93V195H63.43ZM63.43 191.15V188.96H64.83C65.63 188.96 66 189.31 66 190.05C66 190.8 65.63 191.15 64.83 191.15ZM71.55 192.11H73.27C73.92 192.11 74.2 192.37 74.2 192.97V193.27C74.19 193.46 74.19 193.64 74.19 193.75C74.19 194.44 74.23 194.65 74.41 195H76.02V194.73C75.79 194.6 75.7 194.45 75.7 194.13C75.66 191.98 75.62 191.88 74.69 191.48C75.51 191.16 75.92 190.57 75.92 189.68C75.92 189.1 75.72 188.57 75.37 188.21C75.04 187.87 74.58 187.71 73.95 187.71H70.05V195H71.55ZM71.55 190.86V188.96H73.36C73.79 188.96 73.95 189 74.15 189.15C74.33 189.3 74.42 189.55 74.42 189.89C74.42 190.24 74.33 190.52 74.15 190.67C73.98 190.81 73.79 190.86 73.36 190.86ZM81.77 187.59C80.75 187.59 79.91 187.93 79.29 188.6C78.64 189.3 78.27 190.32 78.27 191.41C78.27 192.5 78.64 193.53 79.29 194.22C79.92 194.9 80.74 195.23 81.78 195.23C82.82 195.23 83.64 194.9 84.27 194.22C84.9 193.55 85.29 192.49 85.29 191.46C85.29 190.32 84.92 189.29 84.27 188.6C83.63 187.91 82.83 187.59 81.77 187.59ZM81.78 188.87C83.01 188.87 83.79 189.87 83.79 191.45C83.79 192.95 82.98 193.95 81.78 193.95C80.56 193.95 79.77 192.95 79.77 191.41C79.77 189.87 80.56 188.87 81.78 188.87ZM94.16 191.08H91.24V192.33H92.9C92.86 192.74 92.76 192.99 92.54 193.25C92.18 193.69 91.62 193.95 91.05 193.95C89.83 193.95 88.97 192.89 88.97 191.39C88.97 189.82 89.73 188.87 91.01 188.87C91.53 188.87 91.97 189.02 92.3 189.31C92.51 189.49 92.62 189.66 92.75 190.04H94.16C93.98 188.53 92.76 187.59 91 187.59C88.9 187.59 87.47 189.14 87.47 191.41C87.47 193.62 88.91 195.23 90.88 195.23C91.86 195.23 92.52 194.88 93.08 194.06L93.26 195.02H94.16Z\" fill=\"#6e7074\"/></svg>"};
