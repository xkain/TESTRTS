// Scènes des cartes d'équipement du tableau de bord : la maison et son équipement, dessinés en SVG
// d'après la position. Couleurs portées par les variables CSS de .dcard (overlays.css), clair et sombre.
const dashScene = {
    // Sol à y = 160 ; maison commune (façade 40-280, toit à deux pans jusqu'à y = 18).
    G: 160,
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
    // Ouverture du portail : 'l' ou 'r' pour un vantail unique, 'c' pour deux.
    gateSide(type) { return type === 11 || type === 14 ? 'l' : type === 13 || type === 16 ? 'r' : 'c'; },
    curtainSide(type) { return type === 2 ? 'l' : type === 7 ? 'r' : 'c'; },
    LINE: {
        garage: '<path d="M4 14 16 5l12 9v14H4z"/><path d="M9 28V17h14v11M9 21h14M9 25h14"/>',
        gate: '<path d="M4 28V9M28 28V9M4 13h24M8 13v15M12 13v15M16 13v15M20 13v15M24 13v15M2 28h28"/>',
        shutter: '<rect x="5" y="4" width="22" height="5" rx="1"/><path d="M7 9v19h18V9M7 13h18M7 17h18M7 21h18"/>',
        roller: '<rect x="5" y="4" width="22" height="5" rx="2.5"/><path d="M7 9v19h18V9M7 20h18"/>',
        blind: '<path d="M5 5h22M7 5v23M25 5v23M9 10h14M9 14h14M9 18h14M9 22h14M16 5v20"/>',
        drapery: '<path d="M4 5h24M7 5c2 8 2 15 0 23M25 5c-2 8-2 15 0 23M11 5c1 8 1 15 0 23M21 5c-1 8-1 15 0 23"/>',
        awning: '<path d="M4 7h24v4l-3 6H7l-3-6z"/><path d="M10 7v10M16 7v10M22 7v10M7 17v10M25 17v10"/>',
        switch: '<rect x="8" y="5" width="16" height="22" rx="3"/><circle cx="16" cy="12" r="2.5"/><path d="M12 20h8"/>'
    },
    lineIcon(kind) { return `<svg viewBox="0 0 32 32" aria-hidden="true">${this.LINE[kind] || this.LINE.shutter}</svg>`; },
    // p : position affichée (0-100, flipPosition déjà appliqué), t : inclinaison, flags : bits Somfy.
    svg(shade, p, t) {
        const G = this.G, k = this.kind(shade.shadeType), u = 'dsc' + shade.shadeId, f = shade.flags || 0;
        const tr = 'transition:transform .6s ease-in-out';
        const defs = `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--dsc-sk1)"/><stop offset="1" style="stop-color:var(--dsc-sk2)"/></linearGradient><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--dsc-gl1)"/><stop offset="1" style="stop-color:var(--dsc-gl2)"/></linearGradient><linearGradient id="${u}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".5"/><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"/></linearGradient><radialGradient id="${u}r"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".75"/><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"/></radialGradient>`;
        const bg = `<rect x="-800" width="1920" height="${G}" fill="url(#${u}s)"/><rect x="-800" y="${G}" width="1920" height="40" fill="var(--dsc-gnd)"/>`;
        const bush = `<g fill="var(--dsc-bush)"><ellipse cx="-22" cy="${G}" rx="34" ry="28"/><ellipse cx="20" cy="${G + 2}" rx="26" ry="20"/><ellipse cx="300" cy="${G + 1}" rx="28" ry="22"/><ellipse cx="340" cy="${G}" rx="34" ry="28"/></g>`;
        const house = `<path d="M40 ${G}V76h240v${G - 76}z" fill="var(--dsc-wall)"/><path d="M40 77 160 26 280 77z" fill="var(--dsc-wall2)"/><path d="M22 80 160 18 298 80 290 87 160 28 30 87z" fill="var(--dsc-roof)"/><circle cx="160" cy="54" r="8" fill="url(#${u}g)"/><circle cx="160" cy="54" r="8" fill="#ffd98a" style="opacity:var(--dsc-glow)"/><circle cx="160" cy="54" r="9" fill="none" stroke="var(--dsc-trim)" stroke-width="2.5"/>`;
        const lamp = (x, y) => `<path d="M${x - 3} ${y + 10}L${x - 28} ${G}H${x + 28}L${x + 3} ${y + 10}Z" fill="url(#${u}c)" style="opacity:var(--dsc-cone)"/><rect x="${x - 4}" y="${y}" width="8" height="12" rx="2" fill="var(--dsc-lamp)"/><rect x="${x - 2}" y="${y + 7}" width="4" height="4" rx="1" fill="#ffe2a0" style="opacity:var(--dsc-cone)"/>`;
        let body = '';
        if (k === 'garage') {
            const dx = 98, dy = 96, dw = 124, dh = G - dy;
            body = `<clipPath id="${u}w"><rect x="${dx}" y="${dy}" width="${dw}" height="${dh}"/></clipPath></defs>${bg}${house}<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" fill="var(--dsc-int)"/><g clip-path="url(#${u}w)"><g style="transform:translateY(${((p / 100 - 1) * dh).toFixed(1)}px);${tr}"><rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" fill="var(--dsc-door)"/><path d="M${dx} ${dy + 15.5}h${dw}M${dx} ${dy + 31.5}h${dw}M${dx} ${dy + 47.5}h${dw}M${dx} ${dy + 63.5}h${dw}" stroke="var(--dsc-line)"/></g></g><path d="M${dx - 2} ${G}V${dy - 2}H${dx + dw + 2}V${G}" fill="none" stroke="var(--dsc-trim)" stroke-width="3"/>${lamp(72, 102)}${lamp(248, 102)}${bush}`;
        } else if (k === 'gate') {
            const side = this.gateSide(shade.shadeType), gy = 102, s = (0.08 + 0.92 * p / 100).toFixed(3);
            const leaf = (x, w, origin) => `<g style="transform-box:fill-box;transform-origin:${origin} center;transform:scaleX(${s});${tr}"><rect x="${x}" y="${gy}" width="${w}" height="${G - gy - 3}" fill="none" stroke="var(--dsc-slat)" stroke-width="4"/><path d="${Array.from({ length: Math.round(w / 9) }, (_, n) => `M${(x + 7 + n * 8.8).toFixed(1)} ${gy + 2}v${G - gy - 6}`).join('')}M${x} ${gy + 25}h${w}" stroke="var(--dsc-slat)" stroke-width="3"/></g>`;
            const leaves = side === 'l' ? leaf(74, 172, 'left') : side === 'r' ? leaf(74, 172, 'right') : leaf(74, 86, 'left') + leaf(160, 86, 'right');
            body = `</defs>${bg}<path d="M74 ${G}H246L300 200H20Z" fill="var(--dsc-drive)"/><rect x="-800" y="116" width="856" height="${G - 116}" fill="var(--dsc-wall2)"/><rect x="264" y="116" width="856" height="${G - 116}" fill="var(--dsc-wall2)"/><rect x="-800" y="112" width="856" height="5" fill="var(--dsc-roof)"/><rect x="264" y="112" width="856" height="5" fill="var(--dsc-roof)"/><rect x="56" y="80" width="18" height="${G - 80}" fill="var(--dsc-wall)"/><rect x="52" y="74" width="26" height="8" rx="2" fill="var(--dsc-roof)"/><rect x="246" y="80" width="18" height="${G - 80}" fill="var(--dsc-wall)"/><rect x="242" y="74" width="26" height="8" rx="2" fill="var(--dsc-roof)"/><circle cx="65" cy="64" r="20" fill="url(#${u}r)" style="opacity:var(--dsc-cone)"/><circle cx="255" cy="64" r="20" fill="url(#${u}r)" style="opacity:var(--dsc-cone)"/><circle cx="65" cy="66" r="5.5" fill="var(--dsc-lamp)"/><circle cx="255" cy="66" r="5.5" fill="var(--dsc-lamp)"/>${leaves}${bush}`;
        } else if (k === 'awning') {
            const d = p / 100, fy = 90 + 40 * d, fx = 18 * d, w0 = 136 / 9, w1 = (136 + 2 * fx) / 9;
            const canvas = Array.from({ length: 9 }, (_, n) => { const a = 92 + n * w0, b = 92 - fx + n * w1; return `<path d="M${a.toFixed(1)} 86H${(a + w0).toFixed(1)}L${(b + w1).toFixed(1)} ${fy.toFixed(1)}v5a${(w1 / 2).toFixed(1)} 4 0 0 1-${w1.toFixed(1)} 0Z" fill="var(--dsc-can${n % 2 ? 'B' : 'A'})"/>`; }).join('');
            body = `</defs>${bg}${house}<rect x="122" y="100" width="76" height="${G - 100}" fill="url(#${u}g)"/><rect x="122" y="100" width="76" height="${G - 100}" fill="#ffd98a" style="opacity:var(--dsc-glow)"/><rect x="159" y="100" width="2" height="${G - 100}" fill="var(--dsc-trim)"/><path d="M120 ${G}V98H200V${G}" fill="none" stroke="var(--dsc-trim)" stroke-width="3"/>${canvas}${d > 0.02 ? `<path d="M96 128L${(98 - fx).toFixed(1)} ${fy.toFixed(1)}M224 128L${(222 + fx).toFixed(1)} ${fy.toFixed(1)}" stroke="var(--dsc-line)" stroke-width="2.5"/>` : ''}<rect x="88" y="80" width="144" height="8" rx="3" fill="var(--dsc-roof)"/>${lamp(60, 100)}${bush}`;
        } else if (k === 'switch') {
            // Contact sec : un boîtier et son témoin, sans préjuger de ce que le relais commande.
            const on = p >= 50;
            body = `</defs>${bg}${house}<rect x="134" y="98" width="52" height="${G - 98}" rx="2" fill="var(--dsc-door)"/><path d="M131 ${G}V95H189V${G}" fill="none" stroke="var(--dsc-trim)" stroke-width="3"/><circle cx="178" cy="130" r="2.5" fill="var(--dsc-trim)"/><circle cx="226" cy="110" r="${on ? 26 : 0}" fill="url(#${u}r)" style="opacity:${on ? 1 : 0}"/><rect x="212" y="96" width="28" height="30" rx="5" fill="var(--dsc-wall2)" stroke="var(--dsc-trim)" stroke-width="2"/><circle cx="226" cy="106" r="4" fill="${on ? '#4ade80' : 'var(--dsc-line)'}"/><rect x="219" y="114" width="14" height="6" rx="3" fill="var(--dsc-line)"/>${bush}`;
        } else {
            // Fenêtre : volet roulant, store enrouleur, store vénitien ou rideaux.
            const sx = 108, sy = 90, w = 104, h = 56, ty = `transform:translateY(${((p / 100 - 1) * h).toFixed(1)}px);${tr}`;
            let cover;
            if (k === 'blind') {
                const sh = (1.2 + 4.2 * t / 100).toFixed(1);
                cover = `<g style="${ty}">${Array.from({ length: 9 }, (_, n) => `<rect x="${sx}" y="${sy + 2 + n * 6}" width="${w}" height="${sh}" fill="var(--dsc-slat)"/>`).join('')}<rect x="${sx}" y="${sy + h - 4}" width="${w}" height="4" fill="var(--dsc-line)"/><path d="M${sx + 30} ${sy}V${sy + h}M${sx + 74} ${sy}V${sy + h}" stroke="var(--dsc-line)"/></g>`;
            } else if (k === 'roller') {
                cover = `<g style="${ty}"><rect x="${sx}" y="${sy}" width="${w}" height="${h}" fill="var(--dsc-fab)"/><rect x="${sx}" y="${sy + h - 4}" width="${w}" height="4" rx="2" fill="var(--dsc-line)"/></g>`;
            } else if (k === 'drapery') {
                const side = this.curtainSide(shade.shadeType), c = p / 100;
                const panel = (x0, wd) => `<rect x="${x0.toFixed(1)}" y="${sy}" width="${wd.toFixed(1)}" height="${h}" fill="var(--dsc-fab)"/>`;
                cover = side === 'l' ? panel(sx, Math.max(8, w * c)) : side === 'r' ? panel(sx + w - Math.max(8, w * c), Math.max(8, w * c)) : panel(sx, Math.max(6, w / 2 * c)) + panel(sx + w - Math.max(6, w / 2 * c), Math.max(6, w / 2 * c));
            } else {
                cover = `<g style="${ty}"><rect x="${sx}" y="${sy}" width="${w}" height="${h}" fill="var(--dsc-slat)"/><path d="${Array.from({ length: 9 }, (_, n) => `M${sx} ${sy + 5.6 + n * 6}h${w}`).join('')}" stroke="var(--dsc-slat2)" stroke-width="1.2"/><rect x="${sx}" y="${sy + h - 4}" width="${w}" height="4" fill="var(--dsc-line)"/></g>`;
            }
            body = `<clipPath id="${u}w"><rect x="${sx}" y="${sy}" width="${w}" height="${h}"/></clipPath></defs>${bg}${house}<rect x="${sx}" y="${sy}" width="${w}" height="${h}" fill="url(#${u}g)"/><rect x="${sx}" y="${sy}" width="${w}" height="${h}" fill="#ffd98a" style="opacity:var(--dsc-glow)"/><path d="M${sx + 14} ${sy + h - 8} ${sx + 38} ${sy + 8}M${sx + 58} ${sy + h - 4} ${sx + 84} ${sy + 10}" stroke="rgba(255,255,255,.25)" stroke-width="6"/><rect x="${sx + w / 2 - 1}" y="${sy}" width="2" height="${h}" fill="var(--dsc-trim)"/><g clip-path="url(#${u}w)">${cover}</g><rect x="${sx - 3}" y="${sy - 1}" width="${w + 6}" height="${h + 2}" fill="none" stroke="var(--dsc-trim)" stroke-width="3"/><rect x="${sx - 7}" y="${sy - 12}" width="${w + 14}" height="12" rx="2" fill="var(--dsc-roof)"/><rect x="${sx - 8}" y="${sy + h + 1}" width="${w + 16}" height="5" rx="1" fill="var(--dsc-trim)"/>${lamp(72, 100)}${lamp(248, 100)}${bush}`;
        }
        // Soleil (bit 0x20) et vent (bit 0x10) dans le ciel.
        const sky = ((f & 0x20) ? `<g fill="#ffc94a" stroke="#ffc94a" stroke-width="2.5" stroke-linecap="round" transform="translate(16 12)"><circle cx="14" cy="28" r="9" stroke="none"/><path d="M14 11v4M14 41v4M-3 28h4M27 28h4M2 16l3 3M23 37l3 3M2 40l3-3M23 19l3-3"/></g>` : '')
            + ((f & 0x10) ? `<g fill="none" stroke="var(--dsc-line)" stroke-width="2.5" stroke-linecap="round" transform="translate(18 14)"><path d="M-4 22h34a6 6 0 1 0-6-6M-4 34h46a6 6 0 1 1-6 6M-4 28h20"/></g>` : '');
        return `<svg viewBox="10 16 300 154" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${defs}${body}${sky}</svg>`;
    }
};
