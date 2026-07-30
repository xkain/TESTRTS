/* ESPSomfy-RTS — page externe de géolocalisation (GitHub Pages, HTTPS).
 *
 * Rôle : produire un couple latitude/longitude, puis le renvoyer à l'interface de l'ESP32 en
 * paramètres d'URL (?lat=..&lon=..), que celle-ci relit au chargement pour préremplir sa modale
 * « Position géographique ». Tout se passe dans le navigateur : aucune donnée n'est envoyée
 * ailleurs que vers l'appareil de l'utilisateur.
 *
 * Toute modification de ce fichier impose d'incrémenter le ?v=... dans geolocalisation.html.
 */
'use strict';

// Langues fournies dans lang/. Doit rester aligné sur les fichiers réellement présents ; toute
// langue demandée hors de cette liste retombe sur DEFAULT_LANG.
const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es'];
const DEFAULT_LANG = 'en';

// Codes ISO 3166-1 alpha-2 des pays proposés dans le filtre de recherche. Volontairement réduit
// aux CODES : les libellés sont produits dans la langue active par Intl.DisplayNames, donc
// ajouter un pays ne demande aucune traduction — une seule ligne suffit ici.
const COUNTRY_CODES = [
    'af', 'za', 'de', 'sa', 'ar', 'au', 'bb', 'be', 'bm', 'ca', 'cl', 'cn', 'cy', 'co', 'kr',
    'cu', 'eg', 'es', 'us', 'fj', 'fr', 'gr', 'gl', 'hk', 'in', 'id', 'ir', 'il', 'it', 'jp',
    'jo', 'lb', 'mg', 'mx', 'md', 'np', 'ng', 'nz', 'pk', 'py', 'ph', 'pt', 'gb', 'ru', 'ss',
    'lk', 'ch', 'sy', 'tn'
];

// Nominatim demande au maximum une requête par seconde. Le délai d'inactivité avant envoi tient
// cette limite pour une frappe humaine normale, tout en restant réactif.
const SEARCH_DEBOUNCE_MS = 600;

let selectedLat = null, selectedLon = null;   // null = aucune position choisie pour l'instant
let searchTimeout = null;
let t = {};                                   // dictionnaire de la langue active
let activeLang = DEFAULT_LANG;

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ Traductions */

// Langue retenue, par ordre de priorité :
//  1. ?lang=xx transmis par l'interface de l'ESP32 (l'utilisateur y a déjà choisi sa langue,
//     c'est donc l'intention la plus fiable) ;
//  2. la langue du navigateur ;
//  3. DEFAULT_LANG.
function resolveLang() {
    const asked = new URLSearchParams(window.location.search).get('lang');
    const candidates = [asked, (navigator.language || '')].map(
        (v) => (v || '').toLowerCase().slice(0, 2)
    );
    return candidates.find((c) => SUPPORTED_LANGS.includes(c)) || DEFAULT_LANG;
}

async function loadLanguage(lang) {
    const fetchLang = async (code) => {
        const res = await fetch(`lang/${code}.json`);
        if (!res.ok) throw new Error(`lang/${code}.json: HTTP ${res.status}`);
        return res.json();
    };
    try {
        t = await fetchLang(lang);
        activeLang = lang;
    } catch (err) {
        // Repli sur la langue par défaut : un fichier manquant ne doit pas laisser la page
        // avec des libellés incohérents.
        console.warn('Langue indisponible, repli sur', DEFAULT_LANG, err);
        if (lang !== DEFAULT_LANG) {
            try {
                t = await fetchLang(DEFAULT_LANG);
                activeLang = DEFAULT_LANG;
            } catch (e2) {
                console.error('Aucune traduction chargeable, les libellés du HTML sont conservés', e2);
                return;
            }
        } else {
            return;
        }
    }
    applyTranslations();
}

function applyTranslations() {
    document.documentElement.lang = activeLang;
    // innerHTML est volontaire : certaines valeurs contiennent du balisage (ex: security_text).
    // Les dictionnaires sont livrés avec la page, ce ne sont pas des données externes.
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.innerHTML = t[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key]) el.placeholder = t[key];
    });
    // Ces deux-là ne portent pas d'attribut data-i18n : leur contenu est réécrit dynamiquement.
    if (selectedLat === null) setText($('coordsText'), t.coords_empty || 'Lat : -- | Lon : --');
    buildCountrySelect();
}

/* ------------------------------------------------------------------ Utilitaires */

function setText(el, txt) { if (el) el.textContent = txt; }

function showMsg(el, txt) {
    if (!el) return;
    el.textContent = txt || '';
    el.hidden = !txt;
}

/* ------------------------------------------------------------------ Liste des pays */

function buildCountrySelect() {
    const sel = $('country');
    if (!sel) return;
    const previous = sel.value;

    let names = null;
    try {
        names = new Intl.DisplayNames([activeLang], { type: 'region' });
    } catch (e) {
        names = null;   // navigateur sans Intl.DisplayNames : on retombe sur le code brut
    }

    const items = COUNTRY_CODES.map((code) => {
        let label = code.toUpperCase();
        if (names) {
            try {
                const n = names.of(code.toUpperCase());
                if (n) label = n;
            } catch (e) { /* code inconnu du navigateur : on garde le code brut */ }
        }
        return { code, label };
    }).sort((a, b) => a.label.localeCompare(b.label, activeLang));

    sel.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = t.all_countries || 'Tous les pays';
    sel.appendChild(optAll);
    items.forEach(({ code, label }) => {
        const o = document.createElement('option');
        o.value = code;
        o.textContent = label;
        sel.appendChild(o);
    });
    // Conserve le choix courant s'il existe encore (la liste est reconstruite à chaque
    // changement de langue), sinon aucun filtre.
    sel.value = previous && COUNTRY_CODES.includes(previous) ? previous : '';
}

/* ------------------------------------------------------------------ 1. GPS natif */

function getGPS() {
    showMsg($('gpsError'), '');
    if (!navigator.geolocation) {
        showMsg($('gpsError'), t.err_gps_unsupported || 'Géolocalisation non supportée par votre navigateur.');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => setCoordinates(pos.coords.latitude, pos.coords.longitude),
        (err) => showMsg($('gpsError'), (t.err_gps_prefix || 'Erreur GPS : ') + err.message),
        { timeout: 10000, enableHighAccuracy: false }
    );
}

/* ------------------------------------------------------------------ 2. Recherche de ville */

function runSearch() {
    const cityInput = $('citySearch');
    const box = $('suggestions');
    const query = cityInput.value.trim();
    const country = $('country') ? $('country').value : '';

    showMsg($('searchError'), '');
    if (query.length < 2) { box.style.display = 'none'; return; }

    let url = 'https://nominatim.openstreetmap.org/search'
            + `?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`
            + `&accept-language=${encodeURIComponent(activeLang)}`;
    if (country) url += `&countrycodes=${encodeURIComponent(country)}`;

    fetch(url)
        .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .then((data) => {
            box.innerHTML = '';
            if (!Array.isArray(data) || data.length === 0) {
                box.style.display = 'none';
                showMsg($('searchError'), t.err_no_results || 'Aucun résultat.');
                return;
            }
            data.forEach((place) => {
                const addr = place.address || {};
                const city = String(place.display_name || '').split(',')[0];
                const postcode = addr.postcode ? ` (${addr.postcode})` : '';
                const region = [addr.state || addr.county || '', addr.country || '']
                    .filter(Boolean).join(' ');

                // Construction par noeuds texte plutôt qu'innerHTML : le contenu vient d'une API
                // externe, il ne doit jamais être interprété comme du balisage.
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                const strong = document.createElement('strong');
                strong.textContent = city + postcode;
                const small = document.createElement('small');
                small.textContent = region;
                item.append(strong, small);

                item.onclick = () => {
                    cityInput.value = city + postcode;
                    box.style.display = 'none';
                    setCoordinates(parseFloat(place.lat), parseFloat(place.lon));
                };
                box.appendChild(item);
            });
            box.style.display = 'block';
        })
        .catch(() => {
            box.style.display = 'none';
            showMsg($('searchError'), t.err_search_failed || 'La recherche a échoué (connexion internet requise).');
        });
}

/* ------------------------------------------------------------------ 3. Coordonnées retenues */

function setCoordinates(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    // Arrondi à 2 décimales (~1 km), exactement ce que le firmware conserve de toute façon :
    // autant que l'utilisateur voie dès ici la précision réellement enregistrée.
    selectedLat = Math.round(lat * 100) / 100;
    selectedLon = Math.round(lon * 100) / 100;

    setText($('coordsText'), `Lat : ${selectedLat} | Lon : ${selectedLon}`);
    showMsg($('sendMsg'), '');

    const box = $('resultBox');
    box.classList.add('active');
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ------------------------------------------------------------------ 4. Renvoi vers l'ESP32 */

// Nom d'hôte ou IPv4 : lettres, chiffres, tirets et points. Volontairement strict -- on ne vise
// qu'un appareil du réseau local, pas une URL arbitraire.
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

function buildEspUrl(rawHost) {
    let raw = (rawHost || '').trim() || 'espsomfyrts.local';
    if (!/^https?:\/\//i.test(raw)) raw = 'http://' + raw;
    // L'objet URL gère proprement le slash final, un éventuel chemin et les paramètres déjà
    // présents -- une concaténation manuelle produisait des URLs du type "http://host//?lat=".
    const u = new URL(raw);
    // new URL() ne valide PAS le nom d'hôte : "ht!tp://[bad" en ressort avec host="ht!tp", et
    // "a b c" avec host="a%20b%20c". Sans ce contrôle, une faute de frappe enverrait
    // silencieusement l'utilisateur vers une adresse absurde au lieu de l'avertir.
    if (!HOSTNAME_RE.test(u.hostname)) throw new Error('nom d\'hôte invalide : ' + u.hostname);
    u.searchParams.set('lat', String(selectedLat));
    u.searchParams.set('lon', String(selectedLon));
    return u.toString();
}

function sendToESP() {
    showMsg($('sendMsg'), '');
    if (selectedLat === null) {
        showMsg($('sendMsg'), t.err_no_position || 'Choisissez d\'abord une position.');
        return;
    }
    let target;
    try {
        target = buildEspUrl($('espIp').value);
    } catch (e) {
        showMsg($('sendMsg'), t.err_bad_host || 'Adresse d\'appareil invalide.');
        return;
    }
    window.location.href = target;
}

/* ------------------------------------------------------------------ 5. Copie */

function copyCoords() {
    if (selectedLat === null) {
        showMsg($('sendMsg'), t.err_no_position || 'Choisissez d\'abord une position.');
        return;
    }
    const txt = `${selectedLat}, ${selectedLon}`;
    const done = () => showMsg($('sendMsg'), t.msg_coords_copied || 'Coordonnées copiées !');
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(txt).then(done, () => showMsg($('sendMsg'), txt));
    } else {
        // Contexte non sécurisé (ouverture locale du fichier) : on affiche la valeur à recopier.
        showMsg($('sendMsg'), txt);
    }
}

/* ------------------------------------------------------------------ Initialisation */

document.addEventListener('DOMContentLoaded', () => {
    // Adresse de l'appareil transmise par l'interface (?return=http://192.168.1.x) : elle évite
    // à l'utilisateur de la ressaisir, et garantit qu'on renvoie bien vers SON appareil.
    const params = new URLSearchParams(window.location.search);
    const ret = params.get('return');
    if (ret) {
        const espInput = $('espIp');
        if (espInput) espInput.value = ret;
    }

    $('btnGps').addEventListener('click', getGPS);
    $('btnSend').addEventListener('click', sendToESP);
    $('btnCopy').addEventListener('click', copyCoords);

    const cityInput = $('citySearch');
    const box = $('suggestions');
    cityInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        if (cityInput.value.trim().length < 2) { box.style.display = 'none'; return; }
        searchTimeout = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
    });
    // Relance la recherche quand le filtre pays change, si une saisie est déjà en cours.
    if ($('country')) {
        $('country').addEventListener('change', () => {
            if (cityInput.value.trim().length >= 2) runSearch();
        });
    }
    document.addEventListener('click', (e) => {
        if (!cityInput.contains(e.target) && !box.contains(e.target)) box.style.display = 'none';
    });

    loadLanguage(resolveLang());
});
