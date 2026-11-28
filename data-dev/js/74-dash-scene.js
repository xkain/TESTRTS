// Illustrations des tuiles du tableau de bord : l'icône du sprite recadrée bord à bord, d'après la position.
const dashScene = {
    kind(type) {
        if (type === 0) return 'roller';
        if (type === 1) return 'blind';
        if (type === 2 || type === 7 || type === 8) return 'drapery';
        if (type === 3) return 'awning';
        if (type === 5 || type === 6) return 'garage';
        if (type === 9 || type === 10) return 'switch';
        if (type >= 11 && type <= 16) return 'gate';
        return 'shutter';
    },
    ICON: ['svg-window-shade', 'svg-window-blind', 'svg-ldrapery', 'svg-awning', 'svg-shutter', 'svg-garage', 'svg-garage', 'svg-rdrapery', 'svg-cdrapery', 'svg-switch1', 'svg-switch2'],
    CROP: { shutter: '11.5 11 25 28.5', roller: '11 11 26 28.5', blind: '11.5 11 25 28.5', drapery: '3.8 5.2 40.4 38.4', awning: '4.5 6 39 37', garage: '9 17 30 25.6', switch: '11 11 26 26' },
    initTiles() {
        if (document.getElementById('dt-glass')) return;
        const src = id => { const s = document.getElementById(id); return s ? s.outerHTML : ''; };
        const swap = h => h.replaceAll('url(#shd-sky)', 'url(#dt-glass)').replaceAll('url(#shd-pvc)', 'url(#dt-frame)').replaceAll('url(#shd-int)', 'url(#dt-int)').replaceAll('var(--color-shade-refl)', 'var(--dt-refl)');
        const shadow = /<rect x="(?:9|11)" y="(?:17|11\.5)" width="(?:30|26)" height="[0-9.]+" fill="url\(#shd-sh\)"[^>]*>(<\/rect>)?/;
        const car = '<path d="M20.8 29H27.2Q28.3 29 28.8 30L30.1 32.7Q30.6 32.4 31.1 32.6Q31.8 33 31.4 33.8Q31 34.3 30.7 34.4V40Q30.7 40.8 29.9 40.8H29.2Q28.4 40.8 28.4 40V39.3H19.6V40Q19.6 40.8 18.8 40.8H18.1Q17.3 40.8 17.3 40V34.4Q17 34.3 16.6 33.8Q16.2 33 16.9 32.6Q17.4 32.4 17.9 32.7L19.2 30Q19.7 29 20.8 29Z" fill="var(--dt-car)"/>';
        let sym = '';
        ['svg-shutter', 'svg-window-shade', 'svg-window-blind', 'svg-garage'].forEach(id => {
            const base = swap(src(id)); if (!base) return;
            const g = (base.match(/<g clip-path="url\(#shd-c(?:win|rol|ga)\)">[\s\S]*?<\/g><\/g>/) || [''])[0];
            sym += base.replace(g, '').replace(`id="${id}"`, `id="dtw-${id}"`).replace(/<path d="M14 31\.5q[^"]*"[^>]*>(<\/path>)?/, car).replace(shadow, '');
            sym += `<symbol id="dtl-${id}" viewBox="0 0 48 48">${g.replace(/--travel:[23][0-9.]+/, '--travel:31.5').replace(/<rect x="9" y="42\.6"[^>]*>(<\/rect>)?/, '')}</symbol>`;
        });
        const drape = h => h.replace(/<rect x="9" y="39\.8"[^>]*>(<\/rect>)?/, '').replaceAll('url(#shd-brass)', 'var(--dt-rod)')
            .replace(/<rect x="(4\.5|24)" y="8" width="([0-9.]+)" height="40" fill="url\(#shd-pPleat\)"[^>]*>(<\/rect>)?/g, (m, xs, ws) => {
                const x = +xs, w = +ws, n = Math.max(1, Math.round(w / 4)), st = w / n;
                let d = `M${x} 8H${x + w}V41.4`;
                for (let i = n - 1; i >= 0; i--) d += `Q${(x + i * st + st / 2).toFixed(2)} 43.8 ${(x + i * st).toFixed(2)} 41.4`;
                return `<path d="${d}Z" fill="url(#shd-pPleat)"/>`;
            });
        const plate = h => h.replace(/<rect x="12\.8" y="13\.4"[^>]*>(<\/rect>)?/, '').replace(/<rect x="12" y="12" width="24" height="24"[^>]*>(<\/rect>)?/, '');
        ['svg-ldrapery', 'svg-rdrapery', 'svg-cdrapery', 'svg-awning', 'svg-switch1', 'svg-switch2'].forEach(id => {
            let h = src(id); if (!h) return;
            if (id.includes('drapery')) h = drape(h); else if (id.includes('switch')) h = plate(h);
            sym += swap(h).replace(`id="${id}"`, `id="dt-${id}"`).replace(shadow, '');
        });
        const grad = (id, x2, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="1"><stop offset="0" style="stop-color:var(${a})"/><stop offset="1" style="stop-color:var(${b})"/></linearGradient>`;
        document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${grad('dt-glass', 1, '--dt-glass1', '--dt-glass2')}${grad('dt-int', 0, '--dt-int1', '--dt-int2')}${grad('dt-frame', 0, '--dt-frame1', '--dt-frame2')}</defs>${sym}</svg>`);
    },
    tileArtClass(type) {
        const k = this.kind(type);
        return k === 'drapery' || k === 'awning' ? ' is-drape' : k === 'switch' ? ' is-switch' : '';
    },
    tileArt(shade, p, t) {
        this.initTiles();
        const k = this.kind(shade.shadeType);
        if (k === 'gate') return this.gateArt(shade.shadeType, p);
        const ic = this.ICON[shade.shadeType] || 'svg-shutter', box = `viewBox="${this.CROP[k]}"`, use = (pre) => `<use href="#${pre}${ic}" width="48" height="48"></use>`;
        const art = (pre, fit) => `<svg class="dcard-art-svg" ${box} preserveAspectRatio="${fit}" style="--shade-position:${p};--fpos:${p}%;--shade-tilt:${t}" aria-hidden="true">${use(pre)}</svg>`;
        if (k === 'switch') return art('dt-', 'xMidYMid meet');
        if (k === 'drapery' || k === 'awning') return art('dt-', 'none');
        return `<div class="dcard-art-back"><svg ${box} preserveAspectRatio="none" aria-hidden="true">${use('dtw-')}</svg></div>${art('dtl-', 'none')}`;
    },
    gateArt(type, pos) {
        const p = pos / 100, swing = type === 12 || type === 15, right = type === 13 || type === 16;
        const tr = 'transition:transform .4s ease-in-out', ns = 'vector-effect="non-scaling-stroke"';
        const leaf = (x, w) => `<rect x="${x}" y="17" width="${w}" height="53" rx="1.2" fill="var(--dt-panel)"/>`
            + Array.from({ length: 6 }, (_, i) => `<rect x="${x + 3.4}" y="${(26.5 + i * 6.6).toFixed(1)}" width="${w - 6.8}" height=".9" fill="var(--dt-filet)"/>`).join('')
            + `<rect x="${x}" y="17" width="3.4" height="53" rx="1" fill="var(--dt-stile)"/><rect x="${x + w - 3.4}" y="17" width="3.4" height="53" rx="1" fill="var(--dt-stile)"/><rect x="${x}" y="17" width="${w}" height="3" rx="1" fill="var(--dt-stile)"/>`;
        const L = 11, W = 78, mid = L + W / 2;
        const leaves = swing
            ? `<g style="transform-box:fill-box;transform-origin:left center;transform:scaleX(${p});${tr}">${leaf(L, W / 2 - .6)}</g><g style="transform-box:fill-box;transform-origin:right center;transform:scaleX(${p});${tr}">${leaf(mid + .6, W / 2 - .6)}</g>`
            : `<g style="transform:translateX(${((right ? 1 : -1) * (1 - p) * (W + 14)).toFixed(1)}px);${tr}">${leaf(L, W)}</g>`;
        const wall = (x) => `<rect x="${x}" y="11" width="7.6" height="59" fill="var(--dt-wall)"/><rect x="${x}" y="11" width="7.6" height="1.6" fill="var(--dt-wall2)"/>`;
        return `<svg class="dcard-art-svg" viewBox="0 0 100 76" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="76" fill="url(#dt-glass)"/><rect y="70" width="100" height="6" fill="var(--dt-ground)"/><path d="M0 72.6H100" stroke="var(--dt-wall2)" stroke-width="1" ${ns}/>`
            + leaves + wall(0) + wall(92.4)
            + `<rect x="7.6" y="14" width="3.6" height="58" rx=".8" fill="var(--dt-stile)"/><rect x="88.8" y="14" width="3.6" height="58" rx=".8" fill="var(--dt-stile)"/></svg>`;
    }
};
