//var hst = '192.168.1.56';
//var hst = '192.168.4.1';
var hst = '192.168.1.13';
//var hst = '192.168.1.49';
//var hst = '192.168.2.232';

var _rooms = [];
let LANG = {};
// Dictionnaire de secours : la langue embarquée au build, utilisée clé par clé quand la langue
// active (pack téléchargé, potentiellement plus ancien) ne connaît pas encore une clé.
let LANG_FALLBACK = {};
// Mode dev : sert data-dev/ via file:// ou un serveur local (localhost/127.0.0.1) pour développer
// sans reflasher, en pointant les appels API/WebSocket vers le vrai device défini par `hst`.
const isDevHost = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
var baseUrl = isDevHost ? `http://${hst}` : '';
const GITHUB_RAW_ROOT = 'https://raw.githubusercontent.com/xkain/TESTRTS/';
// Page externe (HTTPS, GitHub Pages) pour la détection de position géo : navigator.geolocation
// exige un "contexte sécurisé" (HTTPS ou localhost) -- indisponible ici puisque l'ESP32 sert
// l'interface en HTTP simple sur son réseau local. La page externe, elle, tourne en HTTPS et peut
// donc utiliser la géolocalisation native du navigateur ; elle renvoie ensuite lat/lon en
// paramètres d'URL (cf. plus bas). Offre aussi une recherche de ville en repli.
// Source : docs/geolocalisation.html du dépôt, publié par GitHub Pages. Renommer ce fichier
// impose de mettre à jour cette constante.
const GEO_HELPER_URL = 'https://xkain.github.io/TESTRTS/docs/geolocalisation.html';
const GEO_HELPER_ORIGIN = new URL(GEO_HELPER_URL).origin;
// Capturé au tout premier chargement de script, avant même que le DOM/general.init() n'existent :
// si l'utilisateur revient depuis GEO_HELPER_URL avec ?lat=..&lon=.., on le garde de côté pour
// pré-remplir general.GeoOverlay() dès que les réglages généraux seront chargés (cf. loadGeneral).
// L'URL est nettoyée immédiatement (historique réécrit) pour qu'un simple rechargement de page
// ne la réapplique pas indéfiniment.
// Ce repli par URL ne sert plus qu'aux cas où postMessage est indisponible (cf. écouteur 'message'
// ci-dessous, chemin normal depuis un onglet ouvert par btnGeoExternal) : popup bloquée, page
// ouverte à la main/mise en favori, ou navigateur qui referme window.opener au clic sur un lien.
let _pendingGeoFromUrl = null;
(function() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('lat') || !params.has('lon')) return;
    const lat = parseFloat(params.get('lat'));
    const lon = parseFloat(params.get('lon'));
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        _pendingGeoFromUrl = { lat, lon };
    }
    params.delete('lat');
    params.delete('lon');
    const qs = params.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
})();
// Chemin normal de retour depuis GEO_HELPER_URL : l'onglet externe nous poste directement les
// coordonnées puis se referme (cf. sendToESP() dans docs/js/geo.js), au lieu de naviguer et de
// laisser un onglet ESP dupliqué. Origine vérifiée pour n'accepter que notre propre page GitHub
// Pages. La modale, si déjà ouverte (l'utilisateur ne l'a pas refermée avant d'aller sur l'onglet
// externe), est mise à jour sur place ; sinon on la rouvre pré-remplie -- l'utilisateur ayant
// forcément déjà ouvert general.GeoOverlay() une première fois pour atteindre btnGeoExternal, les
// réglages généraux sont nécessairement déjà chargés ici.
// L'accusé de réception ('espsomfy-geo-ack') est ce qui permet à l'onglet externe de savoir qu'il
// peut se refermer en toute sécurité (cf. sendToESP()) : docs/ et le firmware se déploient
// indépendamment, sans lui un firmware pas encore à jour laisserait l'onglet se refermer sans
// avoir rien transmis.
window.addEventListener('message', (event) => {
    if (event.origin !== GEO_HELPER_ORIGIN) return;
    const d = event.data;
    if (!d || d.source !== 'espsomfy-geo') return;
    const lat = Number(d.lat), lon = Number(d.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return;
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return;
    if (get('inputGeoLat') && get('inputGeoLon')) {
        get('inputGeoLat').value = lat.toFixed(2);
        get('inputGeoLon').value = lon.toFixed(2);
    } else {
        general.GeoOverlay({ lat, lon });
    }
    event.source?.postMessage({ source: 'espsomfy-geo-ack' }, event.origin);
});
// Manifeste de découverte des langues (Phase 3 i18n) : fichier statique maintenu indépendamment
// des releases firmware (raw.githubusercontent.com autorise le CORS en lecture), qui donne les
// noms lisibles/natifs de toute langue du projet -- y compris celles absentes de la traduction
// actuellement chargée (tr() retomberait sinon sur la clé brute GENERAL_OPT_XX). Volontairement
// lu sur `main` (pas figé par tag) : c'est un catalogue de découverte, pensé pour évoluer
// indépendamment des releases firmware -- contrairement au CONTENU d'une langue (cf.
// fetchGithubRawContent), qui lui doit rester verrouillé sur le tag exact du firmware.
const LANG_MANIFEST_URL = GITHUB_RAW_ROOT + 'main/locales/manifest.json';
// Phase 4 i18n : en mode AP/hotspot (premier démarrage sans WiFi configuré), l'ESP32 sert la
// page depuis l'IP par défaut de son propre point d'accès -- déjà utilisé ailleurs (index.js)
// comme heuristique de détection identique (cf. wifi.isHotspot côté socket).
const isApMode = window.location.hostname === '192.168.4.1';
var waitLoad;
const get = id => document.getElementById(id);

