//var hst = '192.168.1.56';
var hst = '192.168.4.1';
//var hst = '192.168.1.13';
//var hst = '192.168.1.49';
//var hst = '192.168.2.232';

var _rooms = [];
let LANG = {};
// Mode dev : sert data-dev/ via file:// ou un serveur local (localhost/127.0.0.1) pour développer
// sans reflasher, en pointant les appels API/WebSocket vers le vrai device défini par `hst`.
const isDevHost = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
var baseUrl = isDevHost ? `http://${hst}` : '';
var waitLoad;
var mouseDown = false;
const get = id => document.getElementById(id);

let deviceUptimeSeconds = 0;
let netUptimeSeconds = 0;
let uptimeInterval = null;

// Logger centralisé : debug/info ne s'affichent que si l'utilisateur a activé "Logs de debug"
// (Système > Firmware). warn/error restent toujours visibles : ce sont de vrais problèmes
// techniques (fichier de langue manquant, déconnexion socket, requête API en échec...) qu'on
// veut voir même sans avoir activé le mode debug. Synchronisé via logger.setDebugEnabled()
// dans general.loadGeneral() et general.setGeneral().
const logger = {
    _debugEnabled: false,
    setDebugEnabled(enabled) { this._debugEnabled = !!enabled; },
    debug(...args) { if (this._debugEnabled) console.log(...args); },
    info(...args) { if (this._debugEnabled) console.info(...args); },
    warn(...args) { console.warn(...args); },
    error(...args) { console.error(...args); }
};

function initEasterEggToggle(triggerSelector, targetClassName, requiredClicks = 3) {
    const trigger = document.querySelector(triggerSelector);
    if (!trigger) return;

    let clickCount = 0;
    let clickTimeout;

    trigger.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;

        clickCount++;
        clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => { clickCount = 0; }, 2000);

        if (clickCount >= requiredClicks) {
            document.body.classList.add(targetClassName);
            if (typeof ui?.successMessage === 'function') {
                ui.successMessage("Mode avancé débloqué.");
            }
            clickCount = 0;
        }
    });
}


if (typeof ui !== 'undefined' && ui.waitMessage) {
    waitLoad = ui.waitMessage(document.body);
}
window.tr = function(id) {
    return (LANG && LANG[id]) ? LANG[id] : id;
};
const translator = {
    isInitialized: false,
    observer: null,

    translate(el) {
        const key = el.getAttribute('tr');
        if (!key) return;

        const text = tr(key);
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
        } else if (el.hasAttribute('title')) {
            el.title = text;
        } else {
            el.textContent = text;
        }
    },
    init() {
        document.querySelectorAll('[tr]').forEach(el => this.translate(el));
        if (this.isInitialized) return;

        this.observer = new MutationObserver((mutations) => {
            mutations.forEach(m => m.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.hasAttribute('tr')) this.translate(node);
                    node.querySelectorAll('[tr]').forEach(el => this.translate(el));
                }
            }));
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.isInitialized = true;
    }
};
function loadLang(callback) {
    if (Object.keys(LANG).length > 0) {
        logger.debug("Language already cached, skipping reload");
        if (callback) callback();
        return;
    }
    fetch(baseUrl + '/lang')
    .then(r => r.json())
    .then(dict => {
        LANG = dict;
        translator.init();
        finishLoad(callback);
    })
    .catch(err => {
        logger.error("Failed to load language file, falling back to defaults", err);
        LANG = { "BT_LOGIN": "Login", "HOME": "Maison" };
        translator.init();
        finishLoad(callback);
    });
}
function finishLoad(callback) {
    document.body.classList.add('lang-loaded');
    if (waitLoad && typeof waitLoad.remove === 'function') {
        waitLoad.remove();
    }
    if (callback) callback();
}
function displayUptime(totalSeconds, className) {
    const elements = document.querySelectorAll('.' + className);
    if (elements.length === 0 || isNaN(totalSeconds)) return;

    let seconds = parseInt(totalSeconds, 10);
    let days = Math.floor(seconds / (24 * 3600));
    seconds %= (24 * 3600);
    let hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    let minutes = Math.floor(seconds / 60);

    const fH = hours.toString().padStart(2, '0');
    const fM = minutes.toString().padStart(2, '0');
    const timeString = `${days}${tr('DAY')} ${fH}${tr('HOUR')} ${fM}${tr('MIN')}`;

    elements.forEach(el => {
        el.textContent = timeString;
    });
}
var errors = [
    { code: -10, key: 'ERR_PIN_TRANSCEIVER' },
    { code: -11, key: 'ERR_PIN_ETHERNET' },
    { code: -12, key: 'ERR_PIN_MOTOR' },
    { code: -21, key: 'ERR_GIT_FLASH_WRITE' },
    { code: -22, key: 'ERR_GIT_FLASH_ERASE' },
    { code: -23, key: 'ERR_GIT_FLASH_READ' },
    { code: -24, key: 'ERR_GIT_SPACE' },
    { code: -25, key: 'ERR_GIT_FILE_SIZE' },
    { code: -26, key: 'ERR_GIT_TIMEOUT' },
    { code: -27, key: 'ERR_GIT_MD5' },
    { code: -28, key: 'ERR_GIT_MAGIC_BYTE' },
    { code: -29, key: 'ERR_GIT_ACTIVATE' },
    { code: -30, key: 'ERR_GIT_PARTITION' },
    { code: -31, key: 'ERR_GIT_ARGUMENT' },
    { code: -32, key: 'ERR_GIT_ABORTED' },
    { code: -40, key: 'ERR_GIT_HTTP' },
    { code: -41, key: 'ERR_GIT_BUFFER' },
    { code: -42, key: 'ERR_GIT_CONNECT' },
    { code: -43, key: 'ERR_GIT_DL_TIMEOUT' }
].map(err => {

    return {
        code: err.code,
        key: err.key,
        get desc() { return tr(this.key); }
    };
});
document.oncontextmenu = (event) => {
    if (event.target && event.target.tagName.toLowerCase() === 'input' && (event.target.type.toLowerCase() === 'text' || event.target.type.toLowerCase() === 'password'))
        return;
    else {
        event.preventDefault(); event.stopPropagation(); return false;
    }
};
Date.prototype.toJSON = function () {
    const tz = this.getTimezoneOffset();
    const sign = tz > 0 ? '-' : '+';
    const absTz = Math.abs(tz);
    const f = (n, c) => n.toString().padStart(c, '0');

    return `${this.getFullYear()}-${f(this.getMonth() + 1, 2)}-${f(this.getDate(), 2)}T${f(this.getHours(), 2)}:${f(this.getMinutes(), 2)}:${f(this.getSeconds(), 2)}.${f(this.getMilliseconds(), 3)}${sign}${f(Math.floor(absTz / 60), 2)}${f(absTz % 60, 2)}`;
};
Date.prototype.fmt = function (fmtMask, emptyMask) {
    const mask = fmtMask || 'MM-dd-yyyy HH:mm:ss';
    if (mask.match(/[hHmt]/) && this.isDateTimeEmpty?.()) return emptyMask ?? '';
    if (mask.match(/[Mdy]/) && this.isDateEmpty?.()) return emptyMask ?? '';

    const d = this;
    const y = d.getFullYear();
    const H = d.getHours();
    const m = d.getMonth();
    const map = {
        yyyy: y,
        yy: String(y).slice(-2),
        MMMM: formatType.MONTHS[m],
        MMM: formatType.MONTHS[m]?.substring(0, 3),
        MM: String(m + 1).padStart(2, '0'),
        M: m + 1,
        dddd: formatType.DAYS[d.getDay()],
        ddd: formatType.DAYS[d.getDay()]?.substring(0, 3),
        dd: String(d.getDate()).padStart(2, '0'),
        d: d.getDate(),
        HH: String(H).padStart(2, '0'),
        H: H,
        hh: String(H % 12 || 12).padStart(2, '0'),
        h: (H % 12 || 12),
        mm: String(d.getMinutes()).padStart(2, '0'),
        m: d.getMinutes(),
        ss: String(d.getSeconds()).padStart(2, '0'),
        s: d.getSeconds(),
        tt: H < 12 ? 'am' : 'pm',
        t: H < 12 ? 'a' : 'p'
    };

    return mask.replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t/g, t => map[t]);
};
Number.prototype.round = function (dec) { return Number(Math.round(this + 'e' + dec) + 'e-' + dec); };
Number.prototype.fmt = function (format, empty) {
    if (isNaN(this)) return empty || '';
    if (typeof format === 'undefined') return this.toString();
    let isNegative = this < 0;
    let tok = ['#', '0'];
    let pfx = '', sfx = '', fmt = format.replace(/[^#\.0\,]/g, '');
    let dec = fmt.lastIndexOf('.') > 0 ? fmt.length - (fmt.lastIndexOf('.') + 1) : 0,
    fw = '', fd = '', vw = '', vd = '', rw = '', rd = '';
    let val = String(Math.abs(this).round(dec));
    let ret = '', commaChar = ',', decChar = '.';
    for (var i = 0; i < format.length; i++) {
        let c = format.charAt(i);
        if (c === '#' || c === '0' || c === '.' || c === ',')
            break;
        pfx += c;
    }
    for (let i = format.length - 1; i >= 0; i--) {
        let c = format.charAt(i);
        if (c === '#' || c === '0' || c === '.' || c === ',')
            break;
        sfx = c + sfx;
    }
    if (dec > 0) {
        let dp = val.lastIndexOf('.');
        if (dp === -1) {
            val += '.'; dp = 0;
        }
        else
            dp = val.length - (dp + 1);
        while (dp < dec) {
            val += '0';
            dp++;
        }
        fw = fmt.substring(0, fmt.lastIndexOf('.'));
        fd = fmt.substring(fmt.lastIndexOf('.') + 1);
        vw = val.substring(0, val.lastIndexOf('.'));
        vd = val.substring(val.lastIndexOf('.') + 1);
        let ds = val.substring(val.lastIndexOf('.'), val.length);
        for (let i = 0; i < fd.length; i++) {
            if (fd.charAt(i) === '#' && vd.charAt(i) !== '0') {
                rd += vd.charAt(i);
                continue;
            } else if (fd.charAt(i) === '#' && vd.charAt(i) === '0') {
                var np = vd.substring(i);
                if (np.match('[1-9]')) {
                    rd += vd.charAt(i);
                    continue;
                }
                else
                    break;
            }
            else if (fd.charAt(i) === '0' || fd.charAt(i) === '#')
                rd += vd.charAt(i);
        }
        if (rd.length > 0) rd = decChar + rd;
    }
    else {
        fw = fmt;
        vw = val;
    }
    var cg = fw.lastIndexOf(',') >= 0 ? fw.length - fw.lastIndexOf(',') - 1 : 0;
    var nw = Math.abs(Math.floor(this.round(dec)));
    if (!(nw === 0 && fw.substr(fw.length - 1) === '#') || fw.substr(fw.length - 1) === '0') {
        var gc = 0;
        for (let i = vw.length - 1; i >= 0; i--) {
            rw = vw.charAt(i) + rw;
            gc++;
            if (gc === cg && i !== 0) {
                rw = commaChar + rw;
                gc = 0;
            }
        }
        if (fw.length > rw.length) {
            var pstart = fw.indexOf('0');
            if (pstart >= 0) {
                var plen = fw.length - pstart;
                var pos = fw.length - rw.length - 1;
                while (rw.length < plen) {
                    let pc = fw.charAt(pos);
                    if (pc === ',') pc = commaChar;
                    rw = pc + rw;
                    pos--;
                }
            }
        }
    }
    if (isNegative) rw = '-' + rw;
    if (rd.length === 0 && rw.length === 0) return '';
    return pfx + rw + rd + sfx;
};
function makeBool(val) {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'undefined') return false;
    if (typeof val === 'number') return val >= 1;
    if (typeof val === 'string') {
        if (val === '') return false;
        switch (val.toLowerCase().trim()) {
            case 'on':
            case 'true':
            case 'yes':
            case 'y':
                return true;
            case 'off':
            case 'false':
            case 'no':
            case 'n':
                return false;
        }
        if (!isNaN(parseInt(val, 10))) return parseInt(val, 10) >= 1;
    }
    return false;
}
var httpStatusText = {
    '200': 'OK',
    '201': 'Created',
    '202': 'Accepted',
    '203': 'Non-Authoritative Information',
    '204': 'No Content',
    '205': 'Reset Content',
    '206': 'Partial Content',
    '300': 'Multiple Choices',
    '301': 'Moved Permanently',
    '302': 'Found',
    '303': 'See Other',
    '304': 'Not Modified',
    '305': 'Use Proxy',
    '306': 'Unused',
    '307': 'Temporary Redirect',
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '402': 'Payment Required',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '406': 'Not Acceptable',
    '407': 'Proxy Authentication Required',
    '408': 'Request Timeout',
    '409': 'Conflict',
    '410': 'Gone',
    '411': 'Length Required',
    '412': 'Precondition Required',
    '413': 'Request Entry Too Large',
    '414': 'Request-URI Too Long',
    '415': 'Unsupported Media Type',
    '416': 'Requested Range Not Satisfiable',
    '417': 'Expectation Failed',
    '418': 'I\'m a teapot',
    '429': 'Too Many Requests',
    '500': 'Internal Server Error',
    '501': 'Not Implemented',
    '502': 'Bad Gateway',
    '503': 'Service Unavailable',
    '504': 'Gateway Timeout',
    '505': 'HTTP Version Not Supported'
};
function getJSON(url, cb) {
    let xhr = new XMLHttpRequest();
    logger.debug('GET', url);
    xhr.open('GET', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
    xhr.setRequestHeader('apikey', security.apiKey);
    xhr.responseType = 'json';
    xhr.onload = () => {
        let status = xhr.status;
        if (status !== 200) {
            let err = xhr.response || {};
            err.htmlError = status;
            err.service = `GET ${url}`;
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            cb(err, null);
        }
        else {
            cb(null, xhr.response);
        }
    };
    xhr.onerror = (evt) => {
        let err = {
            htmlError: xhr.status || 500,
            service: `GET ${url}`
        };
        if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
        cb(err, null);
    };
    xhr.send();
}
function getJSONSync(url, cb) {
    let overlay = ui.waitMessage(get('divContainer'));
    let xhr = new XMLHttpRequest();
    logger.debug('GET', url);
    xhr.responseType = 'json';
    xhr.onload = () => {
        let status = xhr.status;
        if (status !== 200) {
            let err = xhr.response || {};
            err.htmlError = status;
            err.service = `GET ${url}`;
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            cb(err, null);
        }
        else {
            cb(null, xhr.response);
        }
        if (typeof overlay !== 'undefined') overlay.remove();
    };

        xhr.onerror = (evt) => {
            let err = {
                htmlError: xhr.status || 500,
                service: `GET ${url}`
            };
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            cb(err, null);
            if (typeof overlay !== 'undefined') overlay.remove();
        };
            xhr.onabort = (evt) => {
                if (typeof overlay !== 'undefined') overlay.remove();
            };
                xhr.open('GET', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
                xhr.setRequestHeader('apikey', security.apiKey);
                xhr.send();
}

function postJSONSync(url, data, cb) {
    let overlay = ui.waitMessage(get('divContainer'));
    try {
        let xhr = new XMLHttpRequest();
        logger.debug('POST', url, data);
        let fd = new FormData();
        for (let name in data) {
            fd.append(name, data[name]);
        }
        xhr.open('POST', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
        xhr.responseType = 'json';
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('apikey', security.apiKey);
        xhr.onload = () => {
            let status = xhr.status;
            if (status !== 200) {
                let err = xhr.response || {};
                err.htmlError = status;
                err.service = `POST ${url}`;
                err.data = data;
                if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
                cb(err, null);
            }
            else {
                cb(null, xhr.response);
            }
            overlay.remove();
        };
        xhr.onerror = (evt) => {
            logger.error('POST failed:', url, xhr.status, xhr.statusText);
            let err = {
                htmlError: xhr.status || 500,
                service: `POST ${url}`
            };
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            cb(err, null);
            overlay.remove();
        };
        xhr.send(fd);
    } catch (err) { ui.serviceError(get('divContainer'), err); }
}
function putJSON(url, data, cb) {
    let xhr = new XMLHttpRequest();
    logger.debug('PUT', url, data);
    xhr.open('PUT', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
    xhr.responseType = 'json';
    xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('apikey', security.apiKey);
    xhr.onload = () => {
        let status = xhr.status;
        if (status !== 200) {
            let err = xhr.response || {};
            err.htmlError = status;
            err.service = `PUT ${url}`;
            err.data = data;
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            cb(err, null);
        }
        else {
            cb(null, xhr.response);
        }
    };
    xhr.onerror = (evt) => {
        logger.error('PUT failed:', url, xhr.status, xhr.statusText);
        let err = {
            htmlError: xhr.status || 500,
            service: `PUT ${url}`
        };
        if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
        cb(err, null);
    };
    xhr.send(JSON.stringify(data));
}
function putJSONSync(url, data, cb) {
    let overlay = ui.waitMessage(get('divContainer'));
    try {
        let xhr = new XMLHttpRequest();
        logger.debug('PUT', url, data);
        //xhr.open('PUT', url, true);
        xhr.open('PUT', baseUrl.length > 0 ? `${baseUrl}${url}` : url, true);
        xhr.responseType = 'json';
        xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('apikey', security.apiKey);
        xhr.onload = () => {
            let status = xhr.status;
            if (status !== 200) {
                let err = xhr.response || {};
                err.htmlError = status;
                err.service = `PUT ${url}`;
                err.data = data;
                if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
                cb(err, null);
            }
            else {
                cb(null, xhr.response);
            }
            overlay.remove();
        };
        xhr.onerror = (evt) => {
            logger.error('PUT failed:', url, xhr.status, xhr.statusText);
            let err = {
                htmlError: xhr.status || 500,
                service: `PUT ${url}`
            };
            if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
            cb(err, null);
            overlay.remove();
        };
        xhr.send(JSON.stringify(data));
    } catch (err) { ui.serviceError(get('divContainer'), err); }
}
var socket;
var tConnect = null;
var sockIsOpen = false;
var connecting = false;
var connects = 0;
var connectFailed = 0;
async function initSockets() {
    if (connecting) return;
    logger.debug('Connecting to socket...');
    connecting = true;
    if (tConnect) clearTimeout(tConnect);
    tConnect = null;
    let wms = document.getElementsByClassName('socket-wait');
    for (let i = 0; i < wms.length; i++) {
        wms[i].remove();
    }
    ui.waitMessage(get('divContainer')).classList.add('socket-wait');
    let host = isDevHost ? hst : window.location.hostname;
    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const port = window.location.protocol === 'https:' ? '' : ':8080';
        socket = new WebSocket(`${protocol}//${host}${port}/`);
        socket.onmessage = (evt) => {
            if (evt.data.startsWith('42')) {
                let ndx = evt.data.indexOf(',');
                let eventName = evt.data.substring(3, ndx);
                let data = evt.data.substring(ndx + 1, evt.data.length - 1);
                try {
                    var reISO = /^(\d{4}|\+010000)-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
                    var reMsAjax = /^\/Date\((d|-|.*)\)[\/|\\]$/;
                    var msg = JSON.parse(data, (key, value) => {
                        if (typeof value === 'string') {
                            var a = reISO.exec(value);
                            if (a) return new Date(value);
                            a = reMsAjax.exec(value);
                            if (a) {
                                var b = a[1].split(/[-+,.]/);
                                return new Date(b[0] ? +b[0] : 0 - +b[1]);
                            }
                        }
                        return value;
                    });
                    switch (eventName) {
                        case 'memStatus':
                            firmware.procMemoryStatus(msg);
                            break;
                        case 'updateProgress':
                            firmware.procUpdateProgress(msg);
                            break;
                        case 'fwStatus':
                            firmware.procFwStatus(msg);
                            break;
                        case 'remoteFrame':
                            somfy.procRemoteFrame(msg);
                            break;
                        case 'groupState':
                            somfy.procGroupState(msg);
                            break;
                        case 'shadeState':
                            somfy.procShadeState(msg);
                            break;
                        case 'shadeCommand':
                            logger.debug('Shade command received:', msg);
                            break;
                        case 'roomRemoved':
                            somfy.procRoomRemoved(msg);
                            break;
                        case 'roomAdded':
                            somfy.procRoomAdded(msg);
                            break;
                        case 'shadeRemoved':
                            break;
                        case 'shadeAdded':
                            break;
                        case 'ethernet':
                            wifi.procEthernet(msg);
                            break;
                        case 'wifiStrength':
                            wifi.procWifiStrength(msg);
                            break;
                        case 'packetPulses':
                            logger.debug('RF packet pulses:', msg);
                            break;
                        case 'frequencyScan':
                            somfy.procFrequencyScan(msg);
                            break;
                    }
                } catch (err) {
                    logger.error('Error processing socket event', eventName, err);
                }
            }
        };
        socket.onopen = (evt) => {
            if (tConnect) clearTimeout(tConnect);
            tConnect = null;
            logger.debug('Socket connected');

            if (evt.target && evt.target.url && evt.target.url.includes('192.168.4.1')) {
                logger.debug("Hotspot mode detected (192.168.4.1)");
                wifi.isHotspot = true;
                document.body.classList.add('mode-hotspot');
            } else {
                wifi.isHotspot = false;
                document.body.classList.remove('mode-hotspot');
            }
            sockIsOpen = true;
            connecting = false;
            connects++;
            connectFailed = 0;
            let wms = document.getElementsByClassName('socket-wait');
            for (let i = 0; i < wms.length; i++) {
                wms[i].remove();
            }
            let errs = document.getElementsByClassName('socket-error');
            for (let i = 0; i < errs.length; i++)
                errs[i].remove();
            if (general.reloadApp) {
                general.reload();
            }
            else {
                (async () => {
                    ui.clearErrors();
                    // Le serveur protège désormais les réglages réseau/MQTT/config par une authentification :
                    // on ne précharge que ce que la politique de sécurité autorise à cet instant, pour éviter
                    // des erreurs 401 visibles avant une éventuelle connexion.
                    const configOnly = (security.permissions & 0x01) === 0x01;
                    const dashboardAccessible = security.type === 0 || security.authenticated || configOnly;
                    const configAccessible = security.type === 0 || security.authenticated;

                    if (dashboardAccessible) {
                        await general.loadGeneral();
                        await somfy.loadSomfy();
                    }
                    if (configAccessible) {
                        await wifi.loadNetwork();
                        await mqtt.loadMQTT();
                    }
                    if (ui.isConfigOpen()) socket.send('join:0');
                })();
            }
        };
        socket.onclose = (evt) => {
            wifi.procWifiStrength({ ssid: '', channel: -1, strength: -100 });
            wifi.procEthernet({ connected: false, speed: 0, fullduplex: false });
            if (document.getElementsByClassName('socket-wait').length === 0)
                ui.waitMessage(get('divContainer')).classList.add('socket-wait');
            if (evt.wasClean) {
                logger.debug('Socket closed cleanly');
                connectFailed = 0;
                tConnect = setTimeout(async () => { await reopenSocket(); }, 7000);
                logger.debug('Reconnecting socket in 7 seconds');
            }
            else {
                logger.warn('Socket closed unexpectedly, reconnecting...', evt.reason);
                if (connects > 0) {
                    logger.debug('Reconnecting socket in 3 seconds');
                    tConnect = setTimeout(async () => { await reopenSocket(); }, 3000);
                }
                else {
                    if (connecting) {
                        connectFailed++;
                        let timeout = Math.min(connectFailed * 500, 10000);
                        logger.debug(`Initial socket did not connect try again (server was busy and timed out ${connectFailed} times)`);
                        tConnect = setTimeout(async () => { await reopenSocket(); }, timeout);
                        if (connectFailed === 5) {
                            ui.socketError('Too many clients connected.  A maximum of 5 clients may be connected at any one time.  Close some connections to the ESP Somfy RTS device to proceed.');
                        }
                        let spanAttempts = get('spanSocketAttempts');
                        if (spanAttempts) spanAttempts.innerHTML = connectFailed.fmt("#,##0");
                    }
                    else {
                        logger.debug('Connecting socket in .5 seconds');
                        tConnect = setTimeout(async () => { await reopenSocket(); }, 500);
                    }
                }
            }
            connecting = false;
        };
        socket.onerror = (evt) => {
            logger.warn('Socket error', evt);
        };
    } catch (err) {
        logger.error('Failed to open WebSocket connection', err);
        tConnect = setTimeout(async () => { await reopenSocket(); }, 5000);
    }
}



function shOverlay(div, onClose) {
    if (!div) return;

    const btn = div.querySelector('[close]');
    if (btn) btn.onclick = () => closeOverlay(div, onClose);

    // Si c'est une modale, on bloque le scroll
    if (div.classList.contains('modal-overlay')) {
        document.body.classList.add('modal-open');
    } else {
        // On ne remonte la page principale que si c'est inst-overlay
        window.scrollTo(0, 0);
    }

    get('divContainer').appendChild(div);
}

const closeOverlay = (div, callback) => {
    if (!div) return;

    // 1. On lance l'animation de sortie
    div.classList.add('overlay-exit');

    // 2. On attend la fin de l'animation avant de nettoyer le DOM
    setTimeout(() => {
        div.remove();

        // Seuls les .modal-overlay gèrent le verrouillage du scroll.
        // On regarde s'il reste une modale active (en excluant celle qui finit de s'animer).
        const remainingModal = document.querySelector('.modal-overlay:not(.overlay-exit)');

        if (!remainingModal) {
            document.body.classList.remove('modal-open');
        }

        if (typeof callback === 'function') callback();
    }, 300);
};
function handleMobileDismiss(handleElement) {
    // Trouve l'overlay parent le plus proche (.modal-overlay ou .inst-overlay)
    const topOverlay = handleElement.closest('.modal-overlay, .inst-overlay');
    if (topOverlay) {
        closeOverlay(topOverlay);
    }
}

function clearOverlays() {
    const selectors = ['.inst-overlay', '.modal-overlay', '.instructions', '#divGitInstall'];
    selectors.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
    document.body.classList.remove('modal-open');
}

// =========================================================================
// SECTION : PROTECTION CONTRE LA PERTE DE MODIFICATIONS NON ENREGISTRÉES
// =========================================================================
// Plusieurs conteneurs peuvent être suivis en parallèle : au chargement, Général/Réseau/MQTT/Radio
// se peuplent quasiment en même temps (chacun appelle watchDirty() dans son propre callback), donc
// un unique conteneur "actif" écraserait les précédents avant même que l'utilisateur ne touche à
// rien. isDirty reste un drapeau global unique (recalculé), mais l'écoute est additive par conteneur.
let isDirty = false;
const _dirtyWatchContainers = new Set();

// N'ajoute/enlève JAMAIS de classe sur un parent : seul l'élément modifié reçoit .is-dirty. La mise
// en évidence d'un conteneur englobant est entièrement déléguée au CSS (voir base.css, règle
// .dirty-target:has(.is-dirty)) -- à placer manuellement dans le HTML sur les blocs voulus.
function _markDirty(evt) {
    const el = evt.target;
    if (!el || !el.classList) return;
    el.classList.add('is-dirty');
    isDirty = true;
}
function _recomputeIsDirty() {
    isDirty = !!document.querySelector('.is-dirty');
}

/**
 * Attache une écoute déléguée sur `container` : toute saisie/changement utilisateur sur un champ
 * (input/select/textarea, y compris les cases à cocher et sliders) à l'intérieur marque l'état
 * "modifié" et ajoute .is-dirty sur ce champ précis. À appeler UNE FOIS le formulaire rempli avec
 * ses valeurs actuelles (ui.toElement...), pour ne pas marquer "modifié" le simple remplissage
 * programmatique. Un même conteneur peut être réutilisé d'une ouverture à l'autre (même div pour
 * chaque volet édité) : on repart alors d'un état visuel propre, sans dupliquer l'écoute.
 * @param {Element} container
 */
function watchDirty(container) {
    if (!container) return;
    if (!_dirtyWatchContainers.has(container)) {
        _dirtyWatchContainers.add(container);
        container.addEventListener('input', _markDirty);
        container.addEventListener('change', _markDirty);
    }
    container.querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty'));
    _recomputeIsDirty();
}
// À appeler après une sauvegarde réussie ou un clic explicite sur Annuler/Fermer (Quitter sans
// enregistrer inclus). Sans argument : remet à zéro l'état visuel ET l'alerte pour TOUS les
// conteneurs suivis. Avec un `container` : ne nettoie que celui-ci puis recalcule isDirty/l'alerte
// -- indispensable quand un formulaire peut s'ouvrir par-dessus un autre encore non enregistré
// (ex: création de pièce à la volée depuis l'édition d'un volet/groupe) : sauvegarder/annuler la
// pièce ne doit pas effacer les modifications en attente du formulaire parent resté ouvert derrière.
function clearDirty(container) {
    if (container) {
        container.querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty'));
        _recomputeIsDirty();
        if (!isDirty) document.body.classList.remove('dirty-alerted');
        return;
    }
    _dirtyWatchContainers.forEach(c => c.querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty')));
    document.body.classList.remove('dirty-alerted');
    isDirty = false;
}

/**
 * Si isDirty, affiche une modale de confirmation ("Modifications non enregistrées") avant
 * d'exécuter onLeave ; sinon exécute onLeave immédiatement. onLeave n'est appelé que si
 * l'utilisateur choisit "Quitter sans enregistrer" (isDirty est alors réinitialisé avant).
 * onStay (optionnel) s'exécute si l'utilisateur choisit "Annuler" (reste sur la page) -- dans ce
 * cas l'alerte visuelle (niveau 2, orange) N'EST PAS retirée : elle doit rester affichée tant que
 * les modifications ne sont ni enregistrées ni abandonnées.
 * @param {Function} onLeave
 * @param {Function} [onStay]
 */
function confirmDiscardChanges(onLeave, onStay) {
    if (!isDirty) { onLeave(); return; }
    // Passage au niveau 2 (avertissement) : la simple tentative de sortie escalade la mise en
    // évidence, même si l'utilisateur annule ensuite -- il doit repérer immédiatement les champs
    // à traiter s'il retente de quitter.
    document.body.classList.add('dirty-alerted');
    let div = document.createElement('div');
    div.className = 'modal-overlay';
    div.innerHTML = `
    <div class="message-content prompt-content">
    ${modalHeader('UNSAVED_CHANGES_TITLE', 'svg-info', { type: 'small' })}
    <div class="sub-message"><p>${tr('UNSAVED_CHANGES_MSG')}</p></div>
    <div class="button-container-row">
    <button id="btnUnsavedStay" line type="button">${tr('BT_CANCEL')}</button>
    <button id="btnUnsavedLeave" red type="button"><span>${tr('BT_LEAVE_WITHOUT_SAVING')}</span></button>
    </div>
    </div>`;
    shOverlay(div);
    div.querySelector('#btnUnsavedStay').onclick = () => {
        closeOverlay(div);
        if (typeof onStay === 'function') onStay();
    };
    div.querySelector('#btnUnsavedLeave').onclick = () => {
        clearDirty();
        closeOverlay(div);
        onLeave();
    };
}

// =========================================================================
// SECTION : ROUTEUR DE NAVIGATION (deep-linking par hash d'URL)
// =========================================================================
// Table de routage centrale : un seul point de vérité pour la correspondance entre les
// panneaux (data-grpid du DOM) et les slugs d'URL adressables (#dashboard, #shades...).
// Seule une "feuille" (panneau réellement affiché) possède un slug ; une section de premier
// niveau (System/Network/Somfy/Radio) résout automatiquement vers son sous-onglet par défaut.
//
// Le sous-onglet par défaut n'est PAS codé en dur : il est résolu dynamiquement (voir
// _resolveDefaultChild ci-dessous) comme le premier <span data-grpid> réellement présent dans le
// .subtab-container de la section, pour que la navigation suive toujours l'ordre visuel du HTML
// -- y compris après une réorganisation manuelle des onglets, sans synchronisation JS à refaire.
const ROUTE_TOP_LEVEL_IDS = new Set(['divSystemSettings', 'divNetworkSettings', 'divSomfySettings', 'divRadioSettings']);
function _resolveDefaultChild(grpid) {
    if (!ROUTE_TOP_LEVEL_IDS.has(grpid)) return grpid;
    // Recherche par id stable (subtabContainer-<grpid>), pas par position dans le DOM : sur
    // mobile, _mountMobileSubtab() déplace le .subtab-container de la section active hors de son
    // parent d'origine (voir plus bas), donc `:scope > .subtab-container` ne le retrouverait plus
    // dès la 2e visite de cette section.
    const subtabContainer = get('subtabContainer-' + grpid);
    const firstSpan = subtabContainer ? subtabContainer.querySelector('span[data-grpid]') : null;
    return firstSpan ? firstSpan.getAttribute('data-grpid') : grpid;
}
const ROUTE_LEAF_PARENT = {
    divSystemOptions: 'divSystemSettings',
    divFirmware: 'divSystemSettings',
    divNetAdapter: 'divNetworkSettings',
    divMQTT: 'divNetworkSettings',
    divSomfyRooms: 'divSomfySettings',
    divSomfyMotors: 'divSomfySettings',
    divSomfyGroups: 'divSomfySettings',
    divRepeater: 'divSomfySettings',
    divVirtualRemote: 'divSomfySettings',
    divSomfySchedules: 'divSomfySettings',
    divTransceiverSettings: 'divRadioSettings',
    divFrameLog: 'divRadioSettings',
};
const ROUTE_SLUGS = {
    divHomePnl: 'dashboard',
    divSystemOptions: 'general',
    divFirmware: 'firmware',
    divNetAdapter: 'connection',
    divMQTT: 'mqtt',
    divSomfyRooms: 'rooms',
    divSomfyMotors: 'shades',
    divSomfyGroups: 'groups',
    divRepeater: 'repeaters',
    divVirtualRemote: 'virtual-remote',
    divSomfySchedules: 'schedules',
    divTransceiverSettings: 'radio',
    divFrameLog: 'radio-logs',
};
const ROUTE_SLUG_TO_GRPID = Object.fromEntries(Object.entries(ROUTE_SLUGS).map(([id, slug]) => [slug, id]));
// N'importe quel appelant (sidebar, onglets mobiles, boutons du dashboard, retour F5/historique)
// passe par isApplyingHash pour éviter qu'un hashchange déclenché par nous-mêmes ne relance une
// seconde fois la même navigation.
let isApplyingHash = false;
// Slug réellement affiché à l'écran en ce moment (mis à jour uniquement quand activateGrpid va
// au bout de sa bascule DOM) : sert de point de "retour" quand on doit annuler visuellement une
// navigation par bouton Précédent/Suivant bloquée par des modifications non enregistrées.
let currentSlug = 'dashboard';

// TEST fil d'Ariane (desktop) : lit les libellés déjà traduits depuis la sidebar (section) et le
// .subtab-container (feuille) plutôt que de dupliquer une table de traduction -- reste donc
// automatiquement à jour avec la langue active et un éventuel renommage des onglets.
function _updateBreadcrumb(topId, leafId) {
    const bc = get('divSectionBreadcrumb');
    if (!bc) return;
    const parentEl = bc.querySelector('.section-breadcrumb-parent');
    const activeEl = bc.querySelector('.section-breadcrumb-active');
    if (topId === 'divHomePnl') {
        parentEl.textContent = '';
        activeEl.textContent = '';
        return;
    }
    const topLabel = document.querySelector(`.nav-item[data-grpid="${topId}"] span`)?.textContent.trim() || '';
    const leafLabel = document.querySelector(`.subtab-container > span[data-grpid="${leafId}"]`)?.textContent.trim() || '';
    parentEl.textContent = topLabel;
    // Feuille identique à la section (ex: Radio > Radio) : laisser vide masque le séparateur et
    // le second niveau via CSS (:empty), pour ne pas afficher "Radio › Radio".
    activeEl.textContent = (leafLabel && leafLabel !== topLabel) ? leafLabel : '';
}

/**
 * Point d'entrée UNIQUE de la navigation : résout n'importe quel data-grpid (section de premier
 * niveau ou feuille) vers le panneau réellement à afficher, applique tous les effets de bord
 * (auth, socket join/leave, fermeture des formulaires d'édition volet/groupe...), synchronise
 * la sidebar/les onglets/les sous-onglets, puis reflète le résultat dans le hash de l'URL.
 * Remplace les anciens syncNavigationState()/selectTab()/setHomePanel()/_executeOpenConfig().
 * @param {string} grpid - data-grpid ciblé (section ou feuille)
 * @param {{updateHash?: boolean}} opts - updateHash=false quand l'appel provient déjà du hash
 *        (hashchange ou restauration au chargement), pour ne pas re-déclencher le routeur.
 * @returns {string} le slug résolu (utile pour la restauration initiale via replaceState)
 */
function activateGrpid(grpid, { updateHash = true } = {}) {
    if (!grpid || !get(grpid)) grpid = 'divHomePnl';
    const leafId = _resolveDefaultChild(grpid);
    const topId = (leafId === 'divHomePnl') ? 'divHomePnl' : (ROUTE_LEAF_PARENT[leafId] || leafId);
    const isDashboard = (topId === 'divHomePnl');

    // Garde d'authentification : reproduit le comportement historique (setConfigPanel/afterlogin)
    // avant toute bascule DOM, pour qu'un lien profond (#schedules) demande bien un login au lieu
    // de l'exposer silencieusement.
    if (!isDashboard && typeof security !== 'undefined' && !security.authenticated && security.type !== 0) {
        get('divContainer').addEventListener('afterlogin', () => {
            if (security.authenticated) activateGrpid(grpid, { updateHash });
        }, { once: true });
        security.authUser();
        return ROUTE_SLUGS[leafId] || 'dashboard';
    }

    clearOverlays();

    if (isDashboard) {
        if (typeof security !== 'undefined' && security.type !== 0 && !security.authenticated) {
            const configOnly = (security.permissions & 0x01) === 0x01;
            if (!configOnly) {
                // Sécurité complète : le dashboard exige aussi une authentification.
                security.authUser();
                return 'dashboard';
            }
            // Sécurité "config only" : le dashboard reste public, on referme l'écran de login s'il est affiché.
            get('divUnauthenticated').style.display = 'none';
            get('divAuthenticated').style.display = '';
        }
        const divCfg = get('divConfigPnl'), divHome = get('divHomePnl'), header = get('appHeader');
        if (divHome) divHome.style.display = '';
        if (header) header.style.display = '';
        if (divCfg) divCfg.style.display = 'none';
        somfy.checkEmptyState();
        if (sockIsOpen) socket.send('leave:0');
        general.setSecurityConfig({ type: 0, username: '', password: '', pin: '', permissions: 0 });
        somfy.showEditShade(false);
        somfy.showEditGroup(false);
        _updateBreadcrumb('divHomePnl', null);
    } else {
        const wasClosed = window.getComputedStyle(get('divConfigPnl')).display === 'none';
        const divCfg = get('divConfigPnl'), divHome = get('divHomePnl'), header = get('appHeader');
        if (divHome) divHome.style.display = 'none';
        if (header) header.style.display = 'none';
        if (divCfg) divCfg.style.display = '';
        somfy.checkEmptyState();

        if (wasClosed) {
            if (sockIsOpen) socket.send('join:0');
            let overlay = ui.waitMessage(get('divSystemOptions'));
            if (overlay) {
                overlay.style.borderRadius = '5px';
                getJSON('/getSecurity', (err, sec) => {
                    overlay.remove();
                    if (err) ui.serviceError(err);
                    else general.setSecurityConfig(sec);
                });
            }
        }

        if (topId !== 'divSomfySettings' && typeof somfy !== 'undefined') {
            somfy.showEditShade(false);
            somfy.showEditGroup(false);
        }
        if (topId === 'divNetworkSettings' && typeof wifi !== 'undefined') wifi.loadNetwork();

        // Sections de premier niveau : sidebar (.nav-item + son .submenu) et onglets (.tab-container).
        document.querySelectorAll('.nav-item[data-grpid]').forEach(i => i.classList.toggle('active', i.getAttribute('data-grpid') === topId));
        document.querySelectorAll('.nav-group .submenu').forEach(s => {
            s.style.display = (s.previousElementSibling?.getAttribute('data-grpid') === topId) ? 'flex' : 'none';
        });
        document.querySelectorAll('.tab-container > span[data-grpid]').forEach(t => {
            const id = t.getAttribute('data-grpid');
            t.classList.toggle('selected', id === topId);
            const panel = get(id);
            if (panel) panel.style.display = (id === topId) ? '' : 'none';
        });

        // Sous-onglet réellement visible : sidebar (.sub-nav-item) et .subtab-container de la section active.
        document.querySelectorAll('.sub-nav-item[data-grpid]').forEach(i => i.classList.toggle('active', i.getAttribute('data-grpid') === leafId));
        document.querySelectorAll('.subtab-container > span[data-grpid]').forEach(t => {
            const id = t.getAttribute('data-grpid');
            t.classList.toggle('selected', id === leafId);
            const panel = get(id);
            if (panel) panel.style.display = (id === leafId) ? '' : 'none';
        });

        _updateBreadcrumb(topId, leafId);
        _mountMobileSubtab(topId);
    }

    const slug = ROUTE_SLUGS[leafId] || 'dashboard';
    currentSlug = slug;
    if (updateHash && location.hash.slice(1) !== slug) {
        isApplyingHash = true;
        location.hash = slug;
    }
    return slug;
}

// TEST navigation sticky mobile : .tab-container et le .subtab-container de la section active
// partagent désormais UN SEUL bloc sticky (#divMobileStickyNav, voir main.css) au lieu de deux
// position:sticky indépendants qui pouvaient se repeindre à des instants légèrement différents
// pendant le scroll (décalage visuel de 1-2px constaté en test). Chaque section garde son propre
// .subtab-container (identifié par un id stable, subtabContainer-<grpid>) : on le déplace dans le
// slot partagé -- appendChild() le détache automatiquement de son ancien parent, pas besoin de le
// replacer manuellement quand on quitte la section, il suffit de toujours le retrouver par id.
function _mountMobileSubtab(topId) {
    const slot = get('divMobileSubtabSlot');
    if (!slot) return;
    // Renvoie tout ce qui occupe déjà le slot vers sa section d'origine avant d'y déposer celui
    // de la section active : sans ça, les .subtab-container s'empileraient au fil des
    // navigations au lieu de n'en garder qu'un seul à la fois dans le bloc sticky.
    Array.from(slot.children).forEach(child => {
        const ownerGrpid = child.id.replace('subtabContainer-', '');
        const owner = get(ownerGrpid);
        if (owner) owner.prepend(child);
    });
    const subtab = get('subtabContainer-' + topId);
    if (subtab) slot.appendChild(subtab);
}

function bindNavigation() {
    document.querySelectorAll('.nav-item, .sub-nav-item, .tab-container > span, .subtab-container > span').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const grpid = item.getAttribute('data-grpid');
            if (grpid) confirmDiscardChanges(() => activateGrpid(grpid));
        });
    });
    window.addEventListener('hashchange', () => {
        // Le hashchange qu'on vient de déclencher nous-même (dans activateGrpid, ou le
        // rétablissement au chargement) ne doit pas relancer une seconde navigation ; celui
        // provoqué par le bouton Précédent/Suivant ou une saisie manuelle de l'URL, si.
        if (isApplyingHash) { isApplyingHash = false; return; }
        const targetSlug = location.hash.slice(1);
        if (isDirty) {
            // Un hashchange déjà survenu (Précédent/Suivant) ne peut pas être annulé : on
            // rétablit immédiatement l'URL affichée avant de demander confirmation ; si
            // l'utilisateur choisit de quitter sans enregistrer, on réapplique la cible voulue.
            isApplyingHash = true;
            location.hash = currentSlug;
            confirmDiscardChanges(() => activateGrpid(ROUTE_SLUG_TO_GRPID[targetSlug] || 'divHomePnl'));
            return;
        }
        const grpid = ROUTE_SLUG_TO_GRPID[targetSlug] || 'divHomePnl';
        activateGrpid(grpid, { updateHash: false });
    });
    // Fermeture d'onglet/fenêtre ou rechargement (F5) : seul le popup natif du navigateur peut
    // bloquer un déchargement de page -- son texte est imposé par le navigateur lui-même depuis
    // plusieurs années (aucun message personnalisé possible), d'où l'absence de modale custom ici.
    // Note : ce listener avait été retiré temporairement, soupçonné de retarder la fermeture
    // propre du WebSocket lors d'un rechargement rapide (connexions accumulées côté ESP32) ; le
    // lien de cause à effet n'a jamais été formellement confirmé (l'incident initial venait en
    // fait d'un test en mode hotspot sur le mauvais hostname). Remis en place sur demande -- à
    // surveiller spécifiquement lors de rechargements rapprochés pendant les tests.
    window.addEventListener('beforeunload', (e) => {
        if (!isDirty) return;
        e.preventDefault();
        e.returnValue = '';
        return '';
    });
}
function stepDeviceGpio(pinKey, direction, prefix, boardSelectId, isManualCallback, pinMaps) {
    const selBoard = get(boardSelectId);
    if (!selBoard) return;

    const isM = isManualCallback(parseInt(selBoard.value, 10));
    const el = get((isM ? 'input' : 'sel') + prefix + pinKey);
    if (!el) return;

    let newValue;

    if (isM) {
        let current = parseInt(el.value, 10);
        if (isNaN(current)) current = 0;

        let next = current + direction;
        const cm = (get('divContainer').getAttribute('data-chipmodel') || "").toLowerCase();
        const pm = pinMaps.find(x => x.name === cm) || { maxPins: 39 };

        if (next < 0 || next > pm.maxPins) return;

        el.value = next;
        newValue = next;

        const selPin = get(`sel${prefix}${pinKey}`);
        if (selPin) selPin.value = next;
    } else {
        const nextIndex = el.selectedIndex + direction;
        if (nextIndex < 0 || nextIndex >= el.options.length) return;

        el.selectedIndex = nextIndex;
        newValue = el.value;

        const inpP = get(`input${prefix}${pinKey}`);
        if (inpP) inpP.value = newValue;
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));

    return newValue;
}

























// --- Champs de secret (mot de passe/PIN) : le serveur ne renvoie jamais la valeur réelle, juste
// un booléen "défini/pas défini". Ces helpers affichent un masque factice (des puces) quand un
// secret existe déjà, le font disparaître dès que l'utilisateur interagit avec le champ pour
// saisir une nouvelle valeur, et permettent de distinguer "toujours factice" (= non modifié) de
// "réellement saisi" au moment de la sauvegarde — sans jamais confondre les puces factices avec
// une vraie valeur à envoyer au serveur.
const SECRET_DUMMY_CHAR = '•';
const SECRET_DUMMY_TEXT = SECRET_DUMMY_CHAR.repeat(10);

function initSecretField(input, hasValue) {
    if (!input) return;
    const eye = input.parentElement ? input.parentElement.querySelector('.password-eye') : null;
    const showDummy = () => {
        input.value = SECRET_DUMMY_TEXT;
        input.dataset.secretDummy = 'true';
        if (eye) eye.style.display = 'none';
    };
    const reveal = () => {
        if (input.dataset.secretDummy === 'true') {
            input.value = '';
            input.dataset.secretDummy = 'false';
            if (eye) eye.style.display = '';
        }
    };
    input.dataset.hadValue = hasValue ? 'true' : 'false';
    if (hasValue) showDummy();
    else {
        input.value = '';
        input.dataset.secretDummy = 'false';
        if (eye) eye.style.display = '';
    }
    input.addEventListener('focus', reveal);
    input.addEventListener('input', reveal);
    input.addEventListener('blur', () => {
        // L'utilisateur a révélé le champ (masque effacé) mais l'a quitté sans rien saisir :
        // on remet le masque factice plutôt que de laisser un champ vide trompeur.
        if (input.dataset.hadValue === 'true' && input.dataset.secretDummy === 'false' && input.value === '') {
            showDummy();
        }
    });
}
// Valeur réelle d'un champ secret : chaîne vide tant que le masque factice n'a pas été effacé,
// même si l'utilisateur n'a jamais cliqué dedans (ex: sauvegarde sans avoir touché au champ).
function secretValue(input) {
    if (!input) return '';
    return input.dataset.secretDummy === 'true' ? '' : input.value;
}
function initSecretPinGroup(inputs, hasValue) {
    const list = Array.from(inputs || []);
    if (list.length === 0) return;
    const hadValue = !!hasValue;
    const showDummy = () => {
        list.forEach(inp => { inp.value = SECRET_DUMMY_CHAR; inp.dataset.secretDummy = 'true'; });
    };
    const reveal = () => {
        if (list[0].dataset.secretDummy === 'true') {
            // On efface les 4 cases ensemble (un PIN se ressaisit en entier), sans voler le focus
            // à la case que l'utilisateur vient de cliquer.
            list.forEach(inp => { inp.value = ''; inp.dataset.secretDummy = 'false'; });
        }
    };
    list.forEach(inp => {
        inp.value = hasValue ? SECRET_DUMMY_CHAR : '';
        inp.dataset.secretDummy = hasValue ? 'true' : 'false';
        inp.addEventListener('focus', reveal);
        inp.addEventListener('blur', () => {
            // On laisse le temps au focus de se poser sur la case suivante/précédente du même
            // groupe (tabulation interne) avant de juger que l'utilisateur a quitté le PIN entier.
            setTimeout(() => {
                const stillInGroup = list.includes(document.activeElement);
                const allEmpty = list.every(i => i.value === '');
                if (!stillInGroup && hadValue && list[0].dataset.secretDummy === 'false' && allEmpty) {
                    showDummy();
                }
            }, 0);
        });
    });
}
function secretPinValue(inputs) {
    const list = Array.from(inputs || []);
    if (list.length === 0 || list[0].dataset.secretDummy === 'true') return '';
    return list.map(inp => inp.value || '').join('');
}

function modalHeader(title, icon = 'svg-simpleShutter', options = {}) {
    const subtitle = options.subtitle ? `<span class="modalHeader-subtitle">${tr(options.subtitle) || options.subtitle}</span>` : '';
    const rightContent = options.rightContent || '';

    // Les types restent sous la forme 'header-danger' ou 'header-small'
    const headerTypeClass = options.type ? options.type.split(' ').map(t => `header-${t}`).join(' ') : '';

    return `
    <!-- Poignée visible uniquement sur Mobile -->
    <div class="modalHeader-handle" onclick="handleMobileDismiss(this)"></div>

    <div class="modalHeader ${headerTypeClass}">
    <div class="modalHeader-block">
    <!-- Badge Icône Premium -->
    <div class="modalHeader-badge">
    <svg><use href="#${icon}"></use></svg>
    </div>

    <!-- Bloc Textes (Titre + Sous-titre facultatif) -->
    <div class="modalHeader-texts">
    <span class="modalHeader-title">${tr(title) || title}</span>
    ${subtitle}
    </div>
    </div>

    <!-- Contenu additionnel à droite -->
    <div class="modalHeader-right">${rightContent}</div>
    </div>`;
}



function overlayHeader(title, desc, icon = 'svg-simpleShutter', options = {}) {
    if (typeof options === 'boolean') {
        options = { showExpert: options };
    }

    const subtitle = options.subtitle ? `<span class="overlayHeader-subtitle">${tr(options.subtitle) || options.subtitle}</span>` : '';
    const showInfo = options.showInfo !== undefined ? options.showInfo : true;
    const showExpert = options.showExpert || false;

    const safeTitle = (title || '').replace(/'/g, "\\'");
    const safeDesc = (desc || '').replace(/'/g, "\\'");

    const infoAction = `(typeof ui !== 'undefined' && ui.infoMessage) ? ui.infoMessage('${safeTitle}', '${safeDesc}') : infoMessage('${safeTitle}', '${safeDesc}');`;

    let actionHTML = '';

    if (showExpert) {
        actionHTML = `
        <div class="overlayHeader-dropdown-container">
        <button type="button" class="overlayHeader-btn-action" title="Options" onclick="
        event.stopPropagation();
        const menu = this.nextElementSibling;
        const isExp = (typeof ui !== 'undefined' && ui) ? ui.isExpertMode : false;

        const optExp = menu.querySelector('.opt-expert');
        const optNorm = menu.querySelector('.opt-normal');

        // On réinitialise et on applique .active sur le BON bouton uniquement
        if (optExp && optNorm) {
            optExp.classList.remove('active');
            optNorm.classList.remove('active');
            if (isExp) {
                optExp.classList.add('active');
            } else {
                optNorm.classList.add('active');
            }
        }

        menu.classList.toggle('show');
        ">
        <svg><use href="#svg-menuVertical"></use></svg>
        </button>
        <div class="overlayHeader-dropdown-menu">
        ${showInfo ? `<div class="dropdown-item" onclick="this.parentElement.classList.remove('show'); ${infoAction}"><svg><use href="#svg-info"></use></svg> Information</div>` : ''}

        <div class="dropdown-item opt-expert" onclick="
        this.parentElement.classList.remove('show');
        if(typeof ui !== 'undefined' && ui && !ui.isExpertMode) {
            ui.toggleExpertMode(this.closest('.inst-overlay, .modal-overlay'));
        }
        ">
        <svg><use href="#svg-check"></use></svg> Mode Expert
        </div>

        <div class="dropdown-item opt-normal" onclick="
        this.parentElement.classList.remove('show');
        if(typeof ui !== 'undefined' && ui && ui.isExpertMode) {
            ui.toggleExpertMode(this.closest('.inst-overlay, .modal-overlay'));
        }
        ">
        <svg><use href="#svg-close"></use></svg> Mode Simple Utilisateur
        </div>
        </div>
        </div>`;
    } else if (showInfo) {
        actionHTML = `
        <button type="button" class="overlayHeader-btn-action" title="Aide" onclick="${infoAction}">
        <svg><use href="#svg-info"></use></svg>
        </button>`;
    }

    return `
    <div class="overlayHeader">
    <div class="overlayHeader-block">
    <div class="overlayHeader-badge">
    <svg><use href="#${icon}"></use></svg>
    </div>
    <div class="overlayHeader-texts">
    <span class="overlayHeader-title">${tr(title) || title}</span>
    ${subtitle}
    </div>
    </div>
    <div class="overlayHeader-right">
    ${actionHTML}
    <div close onclick="closeOverlay(this.closest('.inst-overlay, .modal-overlay'))">
    <svg><use href="#svg-closeOverlay"></use></svg>
    </div>
    </div>
    </div>`;
}

// Écouteur global pour fermer les menus déroulants lors d'un clic extérieur
document.addEventListener('click', () => {
    document.querySelectorAll('.overlayHeader-dropdown-menu.show').forEach(menu => menu.classList.remove('show'));
});








/*
function overlayHeader(title, desc, icon = 'svg-simpleShutter', options = {}) {
    // Gestion de la rétrocompatibilité si options est un booléen (showExpert)
    if (typeof options === 'boolean') {
        options = { showExpert: options };
    }

    const subtitle = options.subtitle ? `<span class="overlayHeader-subtitle">${tr(options.subtitle) || options.subtitle}</span>` : '';
    const showInfo = options.showInfo !== undefined ? options.showInfo : true; // Activé par défaut
    const showExpert = options.showExpert || false;

    const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
    const isExpert = ui ? ui.isExpertMode : false;

    // Construction de la zone de droite
    let actionHTML = '';

    if (showExpert) {
        actionHTML = `
        <div class="overlayHeader-dropdown-container">
        <button id="btnMenu_${uniqueId}" type="button" class="overlayHeader-btn-action" title="Options">
        <svg><use href="#svg-menuVertical"></use></svg>
        </button>
        <div id="menu_${uniqueId}" class="overlayHeader-dropdown-menu">
        ${showInfo ? `<div class="dropdown-item" id="optInfo_${uniqueId}"><svg><use href="#svg-info"></use></svg> Information</div>` : ''}
        <div class="dropdown-item ${isExpert ? 'active' : ''}" id="optExpert_${uniqueId}">
        <svg><use href="#svg-check"></use></svg> Mode Expert
        </div>
        <div class="dropdown-item ${!isExpert ? 'active' : ''}" id="optNormal_${uniqueId}">
        <svg><use href="#svg-close"></use></svg> Mode Simple Utilisateur
        </div>
        </div>
        </div>`;
    } else if (showInfo) {
        actionHTML = `
        <button id="btnHelp_${uniqueId}" type="button" class="overlayHeader-btn-action" title="Aide">
        <svg><use href="#svg-info"></use></svg>
        </button>`;
    }

    // Fonction d'ouverture du message d'information
    const triggerInfo = () => {
        // Appelle ui.infoMessage(title, msg) avec le titre de la modale et sa description
        if (typeof ui !== 'undefined' && typeof ui.infoMessage === 'function') {
            ui.infoMessage(title, desc);
        } else if (typeof infoMessage === 'function') {
            infoMessage(title, desc);
        }
    };

    // Attachement des événements une fois le DOM prêt
    setTimeout(() => {
        // Clic sur le bouton d'aide simple
        const btnHelp = get(`btnHelp_${uniqueId}`);
        if (btnHelp) {
            btnHelp.onclick = triggerInfo;
        }

        // Clics dans le menu déroulant
        const btnMenu = get(`btnMenu_${uniqueId}`);
        const menuContainer = get(`menu_${uniqueId}`);

        if (btnMenu && menuContainer) {
            const currentOverlay = btnMenu.closest('.inst-overlay, .modal-overlay');

            btnMenu.onclick = (e) => {
                e.stopPropagation();
                menuContainer.classList.toggle('show');
            };

            const closeMenuGlobal = () => menuContainer.classList.remove('show');
            document.addEventListener('click', closeMenuGlobal);

            if (currentOverlay) {
                currentOverlay.addEventListener('remove', () => document.removeEventListener('click', closeMenuGlobal), { once: true });
            }

            // Option 1 : Information (depuis le menu expert)
            const optInfo = get(`optInfo_${uniqueId}`);
            if (optInfo) {
                optInfo.onclick = () => {
                    menuContainer.classList.remove('show');
                    triggerInfo();
                };
            }

            // Option 2 : Mode Expert
            const optExpert = get(`optExpert_${uniqueId}`);
            if (optExpert) {
                optExpert.onclick = () => {
                    if (ui && !ui.isExpertMode) {
                        ui.toggleExpertMode(currentOverlay);
                        optExpert.classList.add('active');
                        get(`optNormal_${uniqueId}`)?.classList.remove('active');
                    }
                };
            }

            // Option 3 : Mode Normal
            const optNormal = get(`optNormal_${uniqueId}`);
            if (optNormal) {
                optNormal.onclick = () => {
                    if (ui && ui.isExpertMode) {
                        ui.toggleExpertMode(currentOverlay);
                        optNormal.classList.add('active');
                        get(`optExpert_${uniqueId}`)?.classList.remove('active');
                    }
                };
            }
        }
    }, 50);

    return `
    <div class="overlayHeader">
    <div class="overlayHeader-block">
    <div class="overlayHeader-badge">
    <svg><use href="#${icon}"></use></svg>
    </div>
    <div class="overlayHeader-texts">
    <span class="overlayHeader-title">${tr(title) || title}</span>
    ${subtitle}
    </div>
    </div>
    <div class="overlayHeader-right">
    ${actionHTML}
    <div close onclick="closeOverlay(this.closest('.inst-overlay, .modal-overlay'))">
    <svg><use href="#svg-closeOverlay"></use></svg>
    </div>
    </div>
    </div>`;
}
*/

/*
/${overlayHeader('HACS', 'HACS_DESC', 'svg-homeAssistant', {
    subtitle: 'Intégration Domotique', // Exemple de sous-titre optionnel
    showInfo: true,                      // Mettre à false pour masquer le '?'
    showExpert: false                    // Desactive/Active le menu expert
})}
*/

/*
 f u*nction overlayHeader(title, desc, icon = 'svg-simpleShutter', showExpert = false) {
 const expertSwitch = showExpert ? `<div class="expert-mode-container"><span class="expert-label">${tr("BT_EXPERT_MODE")}</span><span class="switch expert-switch"><input id="cbExpertMode" type="checkbox" ${ui.isExpertMode ? 'checked' : ''} onchange="ui.toggleExpertMode(this.closest('.inst-overlay'));" onclick="event.stopPropagation();"><div></div></span></div>` : '';

 return `<div class="overlay-header">${expertSwitch}<div close onclick="closeOverlay(this.closest('.inst-overlay'))"><svg class="closeShow-desktop"><use href=#svg-close></use></svg></div></div><div class="instructions-header"><div><h2>${tr(title)}</h2><p>${tr(desc)}</p></div><svg class="instructions-headerLogo"><use href=#${icon}></use></svg></div>`;
 }
 */


function wizardStepper(stepsData, translationPrefix) {
    let stepsHtml = '';
    let titlesHtml = '';

    const isArray = Array.isArray(stepsData);
    const totalSteps = isArray ? stepsData.length : stepsData;

    for (let i = 1; i <= totalSteps; i++) {
        stepsHtml += `<div class="stepper-item" data-stepid="${i}"><div class="step-counter">${i}</div></div>`;

        let titleKey;
        if (isArray) {
            titleKey = stepsData[i - 1];
        } else {
            titleKey = `${translationPrefix}_STEP${i}`;
        }
        titlesHtml += `<h3 class="step-title wizard-step" data-stepid="${i}">${tr(titleKey)}</h3>`;
    }
    return `
    <div class="stepper-wrapper" style="--steps: ${totalSteps};">
    ${stepsHtml}
    </div>
    <div class="step-title-container">
    ${titlesHtml}
    </div>`;
}

function toggleTooltip(el) {
    const tooltip = el.querySelector('.tooltip-text');
    const isVisible = tooltip.style.display === 'block';

    document.querySelectorAll('.tooltip-text').forEach(t => t.style.display = 'none');
    tooltip.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
        setTimeout(() => {
            window.addEventListener('click', function closeMenu() {
                tooltip.style.display = 'none';
                window.removeEventListener('click', closeMenu);
            }, { once: true });
        }, 10);
    }
}
async function reopenSocket() {
    if (tConnect) clearTimeout(tConnect);
    tConnect = null;
    await initSockets();
}
async function init() {
    await security.init();
    general.init();
    wifi.init();
    somfy.init();
    mqtt.init();
    firmware.init();


    bindNavigation();
    // Restaure la route depuis le hash de l'URL au chargement (deep-link direct ou F5) ; par
    // défaut le Dashboard si absent/inconnu. replaceState (réécriture manuelle ci-dessous) pour
    // ne pas ajouter une entrée d'historique superflue au tout premier chargement.
    const initialGrpid = ROUTE_SLUG_TO_GRPID[location.hash.slice(1)] || 'divHomePnl';
    const resolvedSlug = activateGrpid(initialGrpid, { updateHash: false });
    if (location.hash.slice(1) !== resolvedSlug) {
        history.replaceState(null, '', location.pathname + location.search + '#' + resolvedSlug);
    }

    // En sécurité complète, le préchargement initial (socket.onopen) saute général/somfy/réseau/MQTT
    // tant que l'utilisateur n'est pas authentifié (le serveur les protège désormais). On les
    // recharge donc dès qu'une connexion réussit, sinon le dashboard et les réglages resteraient
    // vides après un login sans rechargement de page.
    get('divContainer').addEventListener('afterlogin', (evt) => {
        if (!evt.detail || !evt.detail.authenticated || !sockIsOpen) return;
        (async () => {
            await general.loadGeneral();
            await wifi.loadNetwork();
            await somfy.loadSomfy();
            await mqtt.loadMQTT();
        })();
    });
}
class UIBinder {
    setValue(el, val) {
        if (el instanceof HTMLInputElement) {
            switch (el.type.toLowerCase()) {
                case 'checkbox':
                    el.checked = makeBool(val);
                    break;
                case 'range':
                    let dt = el.getAttribute('data-datatype');
                    let mult = parseInt(el.getAttribute('data-mult') || 1, 10);
                    switch (dt) {
                        // We always range with integers
                        case 'float':
                            el.value = Math.round(parseInt(val * mult, 10));
                            break;
                        case 'index':
                            let ivals = JSON.parse(el.getAttribute('data-values'));
                            for (let i = 0; i < ivals.length; i++) {
                                if (ivals[i].toString() === val.toString()) {
                                    el.value = i;
                                    break;
                                }
                            }
                            break;
                        default:
                            el.value = parseInt(val, 10) * mult;
                            break;
                    }
                    break;
                        default:
                            el.value = val;
                            break;
            }
        }
        else if (el instanceof HTMLSelectElement) {
            let ndx = 0;
            for (let i = 0; i < el.options.length; i++) {
                let opt = el.options[i];
                if (opt.value === val.toString()) {
                    ndx = i;
                    break;
                }
            }
            el.selectedIndex = ndx;
        }
        else if (el instanceof HTMLElement) el.innerHTML = val;
    }
    getValue(el, defVal) {
        let val = defVal;
        if (el instanceof HTMLInputElement) {
            switch (el.type.toLowerCase()) {
                case 'checkbox':
                    val = el.checked;
                    break;
                case 'range':
                    let dt = el.getAttribute('data-datatype');
                    let mult = parseInt(el.getAttribute('data-mult') || 1, 10);
                    switch (dt) {
                        // We always range with integers
                        case 'float':
                            val = parseInt(el.value, 10) / mult;
                            break;
                        case 'index':
                            let ivals = JSON.parse(el.getAttribute('data-values'));
                            val = ivals[parseInt(el.value, 10)];
                            break;
                        default:
                            val = parseInt(el.value / mult, 10);
                            break;
                    }
                    break;
                        default:
                            val = el.value;
                            break;
            }
        }
        else if (el instanceof HTMLSelectElement) val = el.value;
        else if (el instanceof HTMLElement) val = el.innerHTML;
        return val;
    }
    toElement(el, val) {
        let flds = el.querySelectorAll('*[data-bind]');
        flds.forEach((fld) => {
            let prop = fld.getAttribute('data-bind');
            let arr = prop.split('.');
            let tval = val;
            for (let i = 0; i < arr.length; i++) {
                var s = arr[i];
                if (typeof s === 'undefined' || !s) continue;
                let ndx = s.indexOf('[');
                if (ndx !== -1) {
                    ndx = parseInt(s.substring(ndx + 1, s.indexOf(']') - 1), 10);
                    s = s.substring(0, ndx - 1);
                }
                tval = tval[s];
                if (typeof tval === 'undefined') break;
                if (ndx >= 0) tval = tval[ndx];
            }
            if (typeof tval !== 'undefined') {
                if (typeof fld.val === 'function') this.val(tval);
                else {
                    switch (fld.getAttribute('data-fmttype')) {
                        case 'time':
                        {
                            var dt = new Date();
                            dt.setHours(0, 0, 0);
                            dt.addMinutes(tval);
                            tval = dt.fmt(fld.getAttribute('data-fmtmask'), fld.getAttribute('data-fmtempty') || '');
                        }
                        break;
                        case 'date':
                        case 'datetime':
                        {
                            let dt = new Date(tval);
                            tval = dt.fmt(fld.getAttribute('data-fmtmask'), fld.getAttribute('data-fmtempty') || '');
                        }
                        break;
                        case 'number':
                            if (typeof tval !== 'number') tval = parseFloat(tval);
                            tval = tval.fmt(fld.getAttribute('data-fmtmask'), fld.getAttribute('data-fmtempty') || '');
                        break;
                        case 'duration':
                            tval = ui.formatDuration(tval, $this.attr('data-fmtmask'));
                            break;
                    }
                    this.setValue(fld, tval);
                }
            }
        });
    }
    fromElement(el, obj, arrayRef) {
        if (typeof arrayRef === 'undefined' || arrayRef === null) arrayRef = [];
        if (typeof obj === 'undefined' || obj === null) obj = {};
        if (typeof el.getAttribute('data-bind') !== 'undefined') this._bindValue(obj, el, this.getValue(el), arrayRef);
        let flds = el.querySelectorAll('*[data-bind]');
        flds.forEach((fld) => {
            if (!makeBool(fld.getAttribute('data-setonly')))
                this._bindValue(obj, fld, this.getValue(fld), arrayRef);
        });
        return obj;
    }
    parseNumber(val) {
        if (val === null) return;
        if (typeof val === 'undefined') return val;
        if (typeof val === 'number') return val;
        if (typeof val.getMonth === 'function') return val.getTime();
        var tval = val.replace(/[^0-9\.\-]+/g, '');
        return tval.indexOf('.') !== -1 ? parseFloat(tval) : parseInt(tval, 10);
    }
    _bindValue(obj, el, val, arrayRef) {
        var binding = el.getAttribute('data-bind');
        var dataType = el.getAttribute('data-datatype');
        if (binding && binding.length > 0) {
            var sRef = '';
            var arr = binding.split('.');
            var t = obj;
            for (var i = 0; i < arr.length - 1; i++) {
                let s = arr[i];
                if (typeof s === 'undefined' || s.length === 0) continue;
                sRef += '.' + s;
                var ndx = s.lastIndexOf('[');
                if (ndx !== -1) {
                    var v = s.substring(0, ndx);
                    var ndxEnd = s.lastIndexOf(']');
                    var ord = parseInt(s.substring(ndx + 1, ndxEnd), 10);
                    if (isNaN(ord)) ord = 0;
                    if (typeof arrayRef[sRef] === 'undefined') {
                        if (typeof t[v] === 'undefined') {
                            t[v] = new Array();
                            t[v].push(new Object());
                            t = t[v][0];
                            arrayRef[sRef] = ord;
                        }
                        else {
                            k = arrayRef[sRef];
                            if (typeof k === 'undefined') {
                                a = t[v];
                                k = a.length;
                                arrayRef[sRef] = k;
                                a.push(new Object());
                                t = a[k];
                            }
                            else
                                t = t[v][k];
                        }
                    }
                    else {
                        k = arrayRef[sRef];
                        if (typeof k === 'undefined') {
                            a = t[v];
                            k = a.length;
                            arrayRef[sRef] = k;
                            a.push(new Object());
                            t = a[k];
                        }
                        else
                            t = t[v][k];
                    }
                }
                else if (typeof t[s] === 'undefined') {
                    t[s] = new Object();
                    t = t[s];
                }
                else
                    t = t[s];
            }
            if (typeof dataType === 'undefined') dataType = 'string';
            t[arr[arr.length - 1]] = this.parseValue(val, dataType);
        }
    }
    parseValue(val, dataType) {
        switch (dataType) {
            case 'int':
                return Math.floor(this.parseNumber(val));
            case 'uint':
                return Math.abs(this.parseNumber(val));
            case 'float':
            case 'real':
            case 'double':
            case 'decimal':
            case 'number':
                return this.parseNumber(val);
            case 'date':
                if (typeof val === 'string') return Date.parseISO(val);
                else if (typeof val === 'number') return new Date(number);
                else if (typeof val.getMonth === 'function') return val;
                return undefined;
            case 'time':
                var dt = new Date();
                if (typeof val === 'number') {
                    dt.setHours(0, 0, 0);
                    dt.addMinutes(tval);
                    return dt;
                }
                else if (typeof val === 'string' && val.indexOf(':') !== -1) {
                    var n = val.lastIndexOf(':');
                    var min = this.parseNumber(val.substring(n));
                    var nsp = val.substring(0, n).lastIndexOf(' ') + 1;
                    var hrs = this.parseNumber(val.substring(nsp, n));
                    dt.setHours(0, 0, 0);
                    if (hrs <= 12 && val.substring(n).indexOf('p')) hrs += 12;
                    dt.addMinutes(hrs * 60 + min);
                    return dt;
                }
                break;
            case 'duration':
                if (typeof val === 'number') return val;
                return Math.floor(this.parseNumber(val));
            default:
                return val;
        }
    }
    formatValue(val, dataType, fmtMask, emptyMask) {
        var v = this.parseValue(val, dataType);
        if (typeof v === 'undefined') return emptyMask || '';
        switch (dataType) {
            case 'int':
            case 'uint':
            case 'float':
            case 'real':
            case 'double':
            case 'decimal':
            case 'number':
                return v.fmt(fmtMask, emptyMask || '');
            case 'time':
            case 'date':
            case 'dateTime':
                return v.fmt(fmtMask, emptyMask || '');
        }
        return v;
    }
    waitMessage(el) {
        let div = document.createElement('div');
        div.innerHTML = '<div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>';
        div.classList.add('wait-overlay');
        if (typeof el === 'undefined') el = get('divContainer');
        el.appendChild(div);
        return div;
    }
    serviceError(el, err) {
        let title = tr('ERROR_SERVICE_TITLE') || 'Service Error'; // Utilise la traduction si dispo, sinon fallback
        if (arguments.length === 1) {
            err = el;
            el = get('divContainer');
        }
        let msg = '';
        if (typeof err === 'string' && err.startsWith('{')) {
            let e = JSON.parse(err);
            if (typeof e !== 'undefined' && typeof e.desc === 'string') msg = e.desc;
            else msg = err;
        }
        else if (typeof err === 'string') msg = err;
        else if (typeof err === 'number') {
            switch (err) {
                case 404:
                    msg = `404: Service not found`;
                    break;
                default:
                    msg = `${err}: Service Error`;
                    break;
            }
        }
        else if (typeof err !== 'undefined') {
            if (typeof err.desc === 'string') {
                msg = typeof err.desc !== 'undefined' ? err.desc : err.message;
                if (typeof err.code === 'number') {
                    let e = errors.find(x => x.code === err.code) || { code: err.code, desc: 'Unspecified error' };
                    msg = e.desc;
                    title = err.desc;
                }
            }
        }
        logger.error('Service error:', err);

        // On appelle notre errorMessage tout beau, tout neuf !
        let div = this.errorMessage(el, `${err.htmlError || 500}: ${title}`);
        let sub = div.querySelector('.sub-message');

        // On injecte les détails avec notre charte graphique (sans le font-size de 22px qui casserait l'harmonie)
        sub.innerHTML = `
        <div style="margin-bottom: 10px;">
        <strong style="opacity: 0.7;">Service:</strong> ${err.service || 'Unknown'}
        </div>
        <div style="font-weight: 600; opacity: 0.9;">
        ${msg}
        </div>
        `;
        return div;
    }


    /*
    serviceError(el, err) {
        let title = 'Service Error'
        if (arguments.length === 1) {
            err = el;
            el = get('divContainer');
        }
        let msg = '';
        if (typeof err === 'string' && err.startsWith('{')) {
            let e = JSON.parse(err);
            if (typeof e !== 'undefined' && typeof e.desc === 'string') msg = e.desc;
            else msg = err;
        }
        else if (typeof err === 'string') msg = err;
        else if (typeof err === 'number') {
            switch (err) {
                case 404:
                    msg = `404: Service not found`;
                    break;
                default:
                    msg = `${err}: Service Error`;
                    break;
            }
        }
        else if (typeof err !== 'undefined') {
            if (typeof err.desc === 'string') {
                msg = typeof err.desc !== 'undefined' ? err.desc : err.message;
                if (typeof err.code === 'number') {
                    let e = errors.find(x => x.code === err.code) || { code: err.code, desc: 'Unspecified error' };
                    msg = e.desc;
                    title = err.desc;
                }
            }
        }
        console.log(err);
        let div = this.errorMessage(`${err.htmlError || 500}:${title}`);
        let sub = div.querySelector('.sub-message');
        sub.innerHTML = `<div><label>Service:</label>${err.service}</div><div style="font-size:22px;">${msg}</div>`;
        return div;
    }

    */



    socketError(el, msg) {
        if (arguments.length === 1) {
            msg = el;
            el = get('divContainer');
        }
        let existing = document.querySelector('.socket-error');
        if (existing) {
            // Si l'overlay existe déjà, on met juste à jour le message d'erreur interne au cas où il change
            let subMsg = existing.querySelector('.sub-message-text');
            if (subMsg) subMsg.innerHTML = msg;
            return existing;
        }

        let div = document.createElement('div');
        div.className = 'error-message socket-error modal-overlay';

        // Structure générique avec textes en dur (Anglais)
        div.innerHTML = `
        <div class="message-content error-content">
        ${modalHeader('Connection Error', 'svg-error', { type: 'small danger' })}
        <div class="sub-message">
        <p style="font-weight: 600; margin-bottom: 8px;">Unable to connect to the server</p>
        <p class="sub-message-text" style="font-size: 0.85em; opacity: 0.8;">${msg}</p>

        <!-- Compteur de tentatives stylisé en bas du message -->
        <div id="divSocketAttempts" class="socketAttempts" style="margin-top: 20px; font-size: 0.85em; opacity: 0.6;">
        <span>Connection attempts: </span><span id="spanSocketAttempts" style="font-weight: 600;">1</span>
        </div>
        </div>
        </div>`;

        el.appendChild(div);
        shOverlay(div);
        return div;
    }


























    errorMessage(el, title, subMsg, extraMsg) {
        this.clearErrors();

        // 1. Si le premier argument n'est pas un élément HTML, c'est une chaîne de caractères
        let container = el;
        let args = [title, subMsg, extraMsg];

        if (!(el instanceof HTMLElement)) {
            container = get('divContainer');
            // Si 'el' n'est pas un élément, c'était le premier texte passé !
            args = [el, title, subMsg, extraMsg].filter(a => a !== undefined && a !== null && a !== '');
        } else {
            args = args.filter(a => a !== undefined && a !== null && a !== '');
        }

        let headerTitle = tr('ERROR'); // Titre par défaut
        let bodyMessages = [];

        // 2. Gestion selon le nombre d'arguments textuels passés
        if (args.length === 1) {
            // 1 seul argument -> Titre par défaut ("ERROR"), le texte va dans le sous-message
            bodyMessages.push(args[0]);
        } else if (args.length === 2) {
            // 2 arguments -> Le 1er est le titre, le 2ème est le sous-message
            headerTitle = args[0];
            bodyMessages.push(args[1]);
        } else if (args.length >= 3) {
            // 3 arguments (ou +) -> Le 1er est le titre, tous les suivants sont regroupés dans le sous-message
            headerTitle = args[0];
            bodyMessages = args.slice(1);
        }

        // Construction du HTML du sous-message
        const bodyContent = bodyMessages.map(msg => `<p>${msg}</p>`).join('');

        let div = document.createElement('div');
        div.className = 'error-message modal-overlay';

        div.innerHTML = `
        <div class="message-content error-content">
        ${modalHeader(headerTitle, 'svg-error', { type: 'small danger' })}
        <div class="sub-message">
        ${bodyContent}
        </div>
        <div class="button-container-row">
        <button type="button" onclick="ui.clearErrors();">${tr('BT_CLOSE')}</button>
        </div>
        </div>`;

        container.appendChild(div);
        shOverlay(div);
        return div;
    }
    promptMessage(el, msg, onYes, isDanger = false, iconId = null) {
        // Gestion des arguments dynamiques d'origine
        if (arguments.length === 2 || (arguments.length === 3 && typeof msg === 'function')) {
            if (typeof msg === 'function') {
                isDanger = onYes;
                onYes = msg;
                msg = el;
                el = get('divContainer');
            }
        }
        if (!iconId) {
            iconId = isDanger ? 'svg-reboot' : 'svg-info'; // Remplace 'svg-info' par ton id d'icône par défaut si besoin
        }

        let div = document.createElement('div');
        div.className = 'modal-overlay';
        const redAttr = isDanger ? 'red' : '';
        const modalType = isDanger ? 'small danger' : 'small';
        // Nouvelle structure avec le conteneur d'icône "prompt-header-block"
        div.innerHTML = `
        <div class="message-content prompt-content">
        ${modalHeader(msg, iconId, { type: modalType })}

        <div class="sub-message"></div>
        <div class="button-container-row">
        <button line type="button" onclick="ui.clearErrors();">${tr('BT_NO')}</button>
        <button id="btnYes" ${redAttr} type="button">
        ${isDanger ? `<svg><use href="#svg-retry"></use></svg>` : ''} <span>${tr('BT_YES')}</span>
        </button>
        </div>
        </div>`;

        el.appendChild(div);
        shOverlay(div);

        div.querySelector('#btnYes').onclick = () => {
            if (typeof onYes === 'function') onYes();
            ui.clearErrors();
        };
        return div;
    }
    infoMessage(el, title, msg, onOk) {
        this.clearErrors();

        // Gestion dynamique des arguments (si "el" n'est pas fourni)
        if (typeof el === 'string') {
            onOk = msg;
            msg = title;
            title = el;
            el = get('divContainer');
        }

        let div = document.createElement('div');
        div.className = 'info-message modal-overlay';

        // Traduction automatique du titre et du message si ce sont des clés de langue
        const headerTitle = tr(title) || title || tr('INFORMATION');
        const contentMsg = (msg !== undefined && msg !== null) ? (tr(msg) || msg) : '';

        div.innerHTML = `
        <div class="message-content info-content">
        ${modalHeader(headerTitle, 'svg-info', { type: 'small' })}

        <div class="sub-message">
        ${contentMsg ? `<p>${contentMsg}</p>` : ''}
        </div>

        <div class="button-container-row">
        <button id="btnOk" type="button">${tr('BT_OK')}</button>
        </div>
        </div>`;

        el.appendChild(div);
        shOverlay(div);

        const btnOk = div.querySelector('#btnOk');
        btnOk.onclick = () => {
            if (typeof onOk === 'function') onOk();
            ui.clearErrors();
        };

        return div;
    }


    clearErrors() {
        let errors = document.querySelectorAll('div.modal-overlay');
        errors.forEach((el) => {
            // Certaines fenêtres (ex: la confirmation de sauvegarde réseau) doivent rester ouvertes
            // même quand un message de succès s'affiche ailleurs (successMessage() appelle
            // clearErrors()), le temps que l'ESP32 termine réellement sa reconnexion.
            if (el.dataset.keepOpen === 'true') return;
            closeOverlay(el);
        });
    }
    successMessage(msg) {
        this.clearErrors();
        let el = get('divContainer');

        let div = document.createElement('div');
        div.innerHTML = `<div class="success-content"><svg class="icon-svg"><use href="#svg-succes"></use></svg><span>${msg}</span></div>`;

        div.classList.add('success-toast');
        el.appendChild(div);

        setTimeout(() => {
            div.classList.add('hide');
            setTimeout(() => {
                if (div.parentNode) div.remove();
            }, 400);

        }, 3500);
        return div;
    }
    toggleExpertMode(el) {
        this.isExpertMode = !this.isExpertMode;
        localStorage.setItem('expertMode', this.isExpertMode);

        if (el) {
            el.classList.toggle('is-expert', this.isExpertMode);
            if (!this.isExpertMode) {
                this.wizSetStep(el, this.wizCurrentStep(el));
            }
        }
    }
    /**Dirige l'attention de l'utilisateur sur un élément spécifique
     * @param {string|HTMLElement} target - ID de l'élément ou l'élément lui-même
     * @param {boolean} activate - Activer ou désactiver l'animation
     * @param {string} color - Couleur spécifique (ex: 'red', '#FFA500')
     */
    setFocus(target, activate = true, color = null) {
        let el = (typeof target === 'string') ? document.getElementById(target) : target;
        if (!el) return;
        if (el.id === 'btnPairShade' || el.id === 'btnUnpairShade') {
            el = el.closest('.uniblocCol.divButton') || el;
        }
        else if (el.tagName === 'BUTTON' && el.classList.contains('unibutton')) {
            el = el.closest('.uniblocCol') || el;
        }

        if (activate) {
            if (color) el.style.setProperty('--pulse-color', color);
            el.classList.add('ui-pulse');
        } else {
            el.classList.remove('ui-pulse');
            el.style.removeProperty('--pulse-color');
        }
    }
    wizSetPrevStep(el) { this.wizSetStep(el, Math.max(this.wizCurrentStep(el) - 1, 1)); }
    wizSetNextStep(el) { this.wizSetStep(el, this.wizCurrentStep(el) + 1); }
    wizSetStep(el, step) {
        let curr = this.wizCurrentStep(el);
        let sStep = step.toString();
        const isExpert = el.classList.contains('is-expert');

        el.setAttribute('data-stepid', step);
        el.querySelectorAll('[data-stepid], [data-ustepid], [data-mstepid]').forEach(item => {
            if (item.classList.contains('stepper-item')) return;
            if (item === el) return;

            let show = true;

            if (isExpert) {
                show = item.hasAttribute('data-expert');
            }
            else {
                if (item.hasAttribute('data-stepid')) {
                    show = item.getAttribute('data-stepid') === sStep;
                }
                else if (item.hasAttribute('data-ustepid')) {
                    show = item.getAttribute('data-ustepid') !== sStep;
                }
                else if (item.hasAttribute('data-mstepid')) {
                    let steps = item.getAttribute('data-mstepid').split(',');
                    show = steps.includes(sStep);
                }
            }
            item.style.display = show ? '' : 'none';
        });
        if (curr !== step) {
            let evt = new CustomEvent('stepchanged', { detail: { oldStep: curr, newStep: step }, bubbles: true });
            el.dispatchEvent(evt);
        }
    }
    wizCurrentStep(el) { return parseInt(el.getAttribute('data-stepid') || 1, 10); }
    pinKeyPressed(evt) {
        let el = evt.target || evt.srcElement;
        let parent = el.parentElement;
        let digits = Array.from(parent.querySelectorAll('.pin-digit'));
        let index = digits.indexOf(el);
        switch (evt.key) {
            case 'Backspace':
                if (el.value === '' && index > 0) digits[index - 1].focus();
                return;
            case 'ArrowLeft':
                if (index > 0) digits[index - 1].focus();
                return;
            case 'ArrowRight':
                if (index < digits.length - 1) digits[index + 1].focus();
                return;
            case 'Enter':
                if (typeof security !== 'undefined') security.login();
                return;
        }
        setTimeout(() => {
            if (el.value.length > 1) el.value = el.value.slice(-1);
            if (el.value !== "" && index < digits.length - 1) {
                digits[index + 1].focus();
            }
            const pin = digits.map(d => d.value).join('');
            if (pin.length === 4) {
                if (typeof security !== 'undefined') {
                    security.login();
                } else if (typeof general !== 'undefined' && typeof general.login === 'function') {
                    general.login();
                }
            }
        }, 20);
    }
    pinDigitFocus(evt) {
        evt.srcElement.select();
    }
    isConfigOpen() { return window.getComputedStyle(get('divConfigPnl')).display !== 'none'; }

    // Point d'entrée générique "ouvrir la config" (bouton engrenage) : conserve le comportement
    // historique d'atterrir sur Système par défaut. Toute la logique d'ouverture (auth, socket
    // join, bascule DOM, hash) vit désormais dans activateGrpid(), point d'entrée unique du routeur.
    setConfigPanel() { activateGrpid('divSystemSettings'); }
    setHomePanel() { activateGrpid('divHomePnl'); }
    showNetworkConfig() { activateGrpid('divNetAdapter'); }
    showRadioConfig() { activateGrpid('divTransceiverSettings'); }
    showSystemConfig() { activateGrpid('divSystemSettings'); }
    showShadeConfig() {
        activateGrpid('divSomfyMotors');
        if (typeof somfy !== 'undefined') {
            somfy.showEditShade(true);
            somfy.openEditShade();
        }
    }
}
var ui = new UIBinder();
class Security {
    type = 0;
    authenticated = false;
    apiKey = '';
    permissions = 0;
    async init() {
        get('divUnauthenticated').querySelector('.pin-digit[data-bind="login.pin.d3"]').addEventListener('digitentered', (evt) => {
            security.login();
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

        await this.loadContext();
        if (this.type === 0 || (this.permissions & 0x01) === 0x01) { // No login required or only the config is protected.
            if (typeof socket === 'undefined' || !socket) (async () => { await initSockets(); })();
            //ui.setMode(mode);
            get('divUnauthenticated').style.display = 'none';
            get('divAuthenticated').style.display = '';
            get('divContainer').setAttribute('data-auth', true);
        }
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



                    // Uptime & Info CPU
                    if (ctx.uptime !== undefined) {
                        deviceUptimeSeconds = ctx.uptime;
                        displayUptime(deviceUptimeSeconds, 'uptime-display');
                    }
                    if (ctx.netUptime !== undefined) {
                        netUptimeSeconds = ctx.netUptime;
                        displayUptime(netUptimeSeconds, 'net-display');
                    }

                    // Relancer le rafraîchissement en temps réel sans doublons
                    if (uptimeInterval) clearInterval(uptimeInterval);
                    uptimeInterval = setInterval(() => {
                        // On ajoute une seconde à l'uptime de l'appareil
                        deviceUptimeSeconds++;
                        displayUptime(deviceUptimeSeconds, 'uptime-display');

                        // On ajoute une seconde à l'uptime réseau uniquement s'il est connecté (> 0)
                        if (netUptimeSeconds > 0) {
                            netUptimeSeconds++;
                            displayUptime(netUptimeSeconds, 'net-display');
                        }
                    }, 1000);







                    /*
                    if (ctx.uptime) displayUptime(ctx.uptime, 'uptime-display');
                    if (ctx.netUptime) displayUptime(ctx.netUptime, 'net-display');


                */



                    if (ctx.cpuFreq) get('info-cpu').textContent = `${ctx.cores > 1 ? 'Dual' : 'Single'}-Core @ ${ctx.cpuFreq} ${tr('MHZ')}`;
                    // Flash & FileSystem (Regroupé)
                    if (ctx.flashSize) {
                        get('info-flash').innerHTML = `<span>${tr('FW_TOTAL')}: </span><span class="status-detail">${ctx.flashSize}</span> Mo (<span class="hide550">${tr('FW_SPEED')}: </span><span class="status-detail">${ctx.flashSpeed}</span> ${tr('MHZ')})`;
                    }
                    if (ctx.fsTotal) {
                        const free = ctx.fsTotal - ctx.fsUsed, pct = Math.round((ctx.fsUsed / ctx.fsTotal) * 100);
                        const el = get('info-fs-status');
                        if (el) el.innerHTML = `<span class="status-detail">${free}</span> ${tr('FW_UNIT_KO')} ${tr('FW_FREE_SUFFIX')}<span class="hide550"> ${tr('FW_ON')} <span class="status-detail">${ctx.fsTotal}</span></span>`;


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

                    const cont = get('divContainer');
                    if (cont) cont.setAttribute('data-securitytype', ctx.type);
                    // Gestion du Login
                    if (ctx.type !== 0) {
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
                    res();
                });
            });
        });
    }
    authUser() {
        get('divAuthenticated').style.display = 'none';
        get('divUnauthenticated').style.display = '';
        this.loadContext();
        get('btnCancelLogin').style.display = 'inline-block';
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
            get('divAuthenticated').style.display = '';
            get('divUnauthenticated').style.display = 'none';
            get('divContainer').dispatchEvent(evt);
        } else {
            // Sécurité complète : aucune page publique où revenir, on se contente de réinitialiser le formulaire.
            this.resetLoginForm();
        }
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
                    if (typeof socket === 'undefined' || !socket) (async () => { await initSockets(); })();

                    get('divUnauthenticated').style.display = 'none';
                    get('divAuthenticated').style.display = '';
                    get('divContainer').setAttribute('data-auth', true);
                    this.apiKey = log.apiKey;
                    this.authenticated = true;
                    let evt = new CustomEvent('afterlogin', { detail: { authenticated: true } });
                    get('divContainer').dispatchEvent(evt);
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
class General {
    initialized = false;
    appVersion = 'v3.0.0';
    reloadApp = false;
    _securityEnabled = false;
    _currentSecurityType = 0;
    init() {
        if (this.initialized) return;

        const savedTheme = localStorage.getItem('themeMode') || '0';
        this.applyTheme(savedTheme);
        const savedColor = localStorage.getItem('accentColor');
        if (savedColor) {
            document.documentElement.style.setProperty('--color-accent', savedColor);
        }
        this.setAppVersion();
        this.setTimeZones();
        if (sockIsOpen && ui.isConfigOpen()) socket.send('join:0');
        ui.toElement(get('divSystemSettings'), {
            general: { hostname: 'ESPSomfyRTS', username: '', password: '', posixZone: 'UTC0', ntpServer: 'pool.ntp.org' }
        });

        this.initialized = true;
    }
    applyTheme(val) {
        if (val === '1') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else if (val === '2') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        }
        const sel = get('selThemeMode');
        if (sel) sel.value = val;
    }
    onModeThemeChanged() {
        const sel = get('selThemeMode');
        const val = sel.value;
        localStorage.setItem('themeMode', val);
        this.applyTheme(val);
    }
    getCookie(cname) {
        let n = cname + '=';
        let cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let c = cookies[i];
            while (c.charAt(0) === ' ') c = c.substring(0);
            if (c.indexOf(n) === 0) return c.substring(n.length, c.length);
        }
        return '';
    }
    reload() {
        let addMetaTag = (name, content) => {
            let meta = document.createElement('meta');
            meta.httpEquiv = name;
            meta.content = content;
            document.getElementsByTagName('head')[0].appendChild(meta);
        };
        addMetaTag('pragma', 'no-cache');
        addMetaTag('expires', '0');
        addMetaTag('cache-control', 'no-cache');
        document.location.reload();
    }
    timeZones = [
        "Africa/Cairo|EET-2",
        "Africa/Johannesburg|SAST-2",
        "Africa/Juba|CAT-2",
        "Africa/Lagos|WAT-1",
        "Africa/Mogadishu|EAT-3",
        "Africa/Tunis|CET-1",
        "America/Adak|HST10HDT,M3.2.0,M11.1.0",
        "America/Anchorage|AKST9AKDT,M3.2.0,M11.1.0",
        "America/Asuncion|<-04>4<-03>,M10.1.0/0,M3.4.0/0",
        "America/Bahia_Banderas|CST6CDT,M4.1.0,M10.5.0",
        "America/Barbados|AST4",
        "America/Bermuda|AST4ADT,M3.2.0,M11.1.0",
        "America/Cancun|EST5",
        "America/Central_Time|CST6CDT,M3.2.0,M11.1.0",
        "America/Chihuahua|MST7MDT,M4.1.0,M10.5.0",
        "America/Eastern_Time|EST5EDT,M3.2.0,M11.1.0",
        "America/Godthab|<-03>3<-02>,M3.5.0/-2,M10.5.0/-1",
        "America/Havana|CST5CDT,M3.2.0/0,M11.1.0/1",
        "America/Mexico_City|CST6",
        "America/Miquelon|<-03>3<-02>,M3.2.0,M11.1.0",
        "America/Mountain_Time|MST7MDT,M3.2.0,M11.1.0",
        "America/Pacific_Time|PST8PDT,M3.2.0,M11.1.0",
        "America/Phoenix|MST7",
        "America/Santiago|<-04>4<-03>,M9.1.6/24,M4.1.6/24",
        "America/St_Johns|NST3:30NDT,M3.2.0,M11.1.0",
        "Antarctica/Troll|<+00>0<+02>-2,M3.5.0/1,M10.5.0/3",
        "Asia/Amman|EET-2EEST,M2.5.4/24,M10.5.5/1",
        "Asia/Beirut|EET-2EEST,M3.5.0/0,M10.5.0/0",
        "Asia/Colombo|<+0530>-5:30",
        "Asia/Damascus|EET-2EEST,M3.5.5/0,M10.5.5/0",
        "Asia/Gaza|EET-2EEST,M3.4.4/50,M10.4.4/50",
        "Asia/Hong_Kong|HKT-8",
        "Asia/Jakarta|WIB-7",
        "Asia/Jayapura|WIT-9",
        "Asia/Jerusalem|IST-2IDT,M3.4.4/26,M10.5.0",
        "Asia/Kabul|<+0430>-4:30",
        "Asia/Karachi|PKT-5",
        "Asia/Kathmandu|<+0545>-5:45",
        "Asia/Kolkata|IST-5:30",
        "Asia/Makassar|WITA-8",
        "Asia/Manila|PST-8",
        "Asia/Seoul|KST-9",
        "Asia/Shanghai|CST-8",
        "Asia/Tehran|<+0330>-3:30",
        "Asia/Tokyo|JST-9",
        "Atlantic/Azores|<-01>1<+00>,M3.5.0/0,M10.5.0/1",
        "Australia/Adelaide|ACST-9:30ACDT,M10.1.0,M4.1.0/3",
        "Australia/Brisbane|AEST-10",
        "Australia/Darwin|ACST-9:30",
        "Australia/Eucla|<+0845>-8:45",
        "Australia/Lord_Howe|<+1030>-10:30<+11>-11,M10.1.0,M4.1.0",
        "Australia/Melbourne|AEST-10AEDT,M10.1.0,M4.1.0/3",
        "Australia/Perth|AWST-8",
        "Etc/GMT-1|<+01>-1",
        "Etc/GMT-2|<+02>-2",
        "Etc/GMT-3|<+03>-3",
        "Etc/GMT-4|<+04>-4",
        "Etc/GMT-5|<+05>-5",
        "Etc/GMT-6|<+06>-6",
        "Etc/GMT-7|<+07>-7",
        "Etc/GMT-8|<+08>-8",
        "Etc/GMT-9|<+09>-9",
        "Etc/GMT-10|<+10>-10",
        "Etc/GMT-11|<+11>-11",
        "Etc/GMT-12|<+12>-12",
        "Etc/GMT-13|<+13>-13",
        "Etc/GMT-14|<+14>-14",
        "Etc/GMT+0|GMT0",
        "Etc/GMT+1|<-01>1",
        "Etc/GMT+2|<-02>2",
        "Etc/GMT+3|<-03>3",
        "Etc/GMT+4|<-04>4",
        "Etc/GMT+5|<-05>5",
        "Etc/GMT+6|<-06>6",
        "Etc/GMT+7|<-07>7",
        "Etc/GMT+8|<-08>8",
        "Etc/GMT+9|<-09>9",
        "Etc/GMT+10|<-10>10",
        "Etc/GMT+11|<-11>11",
        "Etc/GMT+12|<-12>12",
        "Etc/UTC|UTC0",
        "Europe/Athens|EET-2EEST,M3.5.0/3,M10.5.0/4",
        "Europe/Berlin|CEST-1CET,M3.2.0/2:00:00,M11.1.0/2:00:00",
        "Europe/Brussels|CET-1CEST,M3.5.0,M10.5.0/3",
        "Europe/Chisinau|EET-2EEST,M3.5.0,M10.5.0/3",
        "Europe/Dublin|IST-1GMT0,M10.5.0,M3.5.0/1",
        "Europe/Lisbon|WET0WEST,M3.5.0/1,M10.5.0",
        "Europe/London|GMT0BST,M3.5.0/1,M10.5.0",
        "Europe/Moscow|MSK-3",
        "Europe/Paris|CET-1CEST-2,M3.5.0/02:00:00,M10.5.0/03:00:00",
        "Indian/Cocos|<+0630>-6:30",
        "Pacific/Auckland|NZST-12NZDT,M9.5.0,M4.1.0/3",
        "Pacific/Chatham|<+1245>-12:45<+1345>,M9.5.0/2:45,M4.1.0/3:45",
        "Pacific/Easter|<-06>6<-05>,M9.1.6/22,M4.1.6/22",
        "Pacific/Fiji|<+12>-12<+13>,M11.2.0,M1.2.3/99",
        "Pacific/Guam|ChST-10",
        "Pacific/Honolulu|HST10",
        "Pacific/Marquesas|<-0930>9:30",
        "Pacific/Midway|SST11",
        "Pacific/Norfolk|<+11>-11<+12>,M10.1.0,M4.1.0/3"
    ];
    loadGeneral() {
        // divSystemSettings englobe les deux sous-onglets (Général + Firmware) : certains
        // champs "general.*" (ex: enableDebugLogs) vivent dans Firmware, pas Général.
        const pnl = get('divSystemSettings');

        getJSONSync('/modulesettings', (err, settings) => {
            if (err) {
                logger.error('Failed to load general settings:', err);
                return;
            }
            logger.setDebugEnabled(settings.enableDebugLogs);
            logger.debug('General settings loaded:', settings);
            if (typeof somfy !== 'undefined') somfy.initPins();

            get('spanFwVersion').innerText = settings.fwVersion;
            get('spanHwVersion').innerText = settings.chipModel.length > 0 ? '-' + settings.chipModel : '';
            get('divContainer').setAttribute('data-chipmodel', settings.chipModel);

            if (settings.hardwareProfile) {
                get('divContainer').setAttribute('data-hardwareprofile', settings.hardwareProfile);
                get('info-lbc').innerText = tr(settings.hardwareProfile);
            }
            this.setAppVersion();

            loadLang(() => {

                ui.toElement(pnl, { general: settings });

                const langSelect = get('langSelect');
                if (langSelect) {
                    const languages = [ 'en', 'fr', 'de', 'es', /*'it' */ ];
                    const selectedLang = languages[settings.language] || 'en';
                    localStorage.setItem('selectedLang', selectedLang);
                    document.documentElement.lang = selectedLang;
                    langSelect.value = selectedLang;
                    langSelect.onchange = (e) => {
                        this.onLanguageChanged(e.target.value);
                    };
                }
            });
            if (settings.accentColor) {
                document.documentElement.style.setProperty('--color-accent', settings.accentColor);
                localStorage.setItem('accentColor', settings.accentColor);

                const accentInput = get('fldAccentColor');
                if (accentInput) {
                    accentInput.value = settings.accentColor;
                    accentInput.addEventListener('input', (e) => {
                        document.documentElement.style.setProperty('--color-accent', e.target.value);
                        localStorage.setItem('accentColor', e.target.value);
                    });
                }
            }

            watchDirty(pnl);
        });
    }

    setAppVersion() { get('spanAppVersion').innerText = this.appVersion; }
    setTimeZones() {
        const dd = get('selTimeZone');
        dd.innerHTML = this.timeZones.map(tz => {
            const [city, code] = tz.split('|');
            return `<option value="${code}">${city}</option>`;
        }).join('');

        dd.value = 'UTC0';
    }
    setGeneral() {
        let valid = true;
        let pnl = get('divSystemSettings');
        let obj = ui.fromElement(pnl).general;
        logger.setDebugEnabled(obj.enableDebugLogs);
        const msg = tr('ERR_HOSTNAME');

        if (typeof obj.hostname === 'undefined' || !obj.hostname || obj.hostname === '') {
            ui.errorMessage(msg, tr('ERR_INVALID_HOSTNAME'));
            valid = false;
        }
        if (valid && !/^[a-zA-Z0-9-]+$/.test(obj.hostname)) {
            ui.errorMessage(msg, tr('ERR_HOSTNAME_CHARS'));
            valid = false;
        }
        if (valid && obj.hostname.length > 32) {
            ui.errorMessage(msg, tr('ERR_HOSTNAME_LENGTH'));
            valid = false;
        }
        if (valid && typeof obj.ntpServer === 'string' && obj.ntpServer.length > 64) {
            ui.errorMessage(msg, tr('ERR_NTP_LENGTH'));
            valid = false;
        }
        if (valid) {
            putJSONSync('/setgeneral', obj, (err, response) => {
                if (err) {
                    ui.serviceError(err);
                } else {
                    ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                    logger.debug('General settings saved:', response);
                    clearDirty();
                }
            });
        }
    }
    setSecurityConfig(security) {
        this._currentSecurityType = security.type;
        this._securityEnabled = (security.type !== 0);
        // Le serveur ne renvoie plus jamais le PIN/mot de passe réel, seulement s'il est défini :
        // les champs de saisie démarrent donc toujours vides, jamais pré-remplis avec le secret.
        this._hasPin = !!security.hasPin;
        this._hasPassword = !!security.hasPassword;
        this._securityData = {
            username: security.username || '',
            password: '',
            repeatpassword: '',
            permissions: { configOnly: makeBool(security.permissions & 0x01) },
            pin: { d0: '', d1: '', d2: '', d3: '' }
        };
        this.onSecurityTypeChanged();
    }
    disableSecurityDirectly() {
        this._securityEnabled = false;
        this.saveSecurity();
    }
    toggleSecurityState() {
        this._securityEnabled = !this._securityEnabled;
        if (this._securityEnabled) {
            const pnl = get('divSecurityPopupContent') || get('divSystemOptions');
            let checkedRadio = pnl.querySelector('input[name="secTypeGroup"]:checked');
            if (!checkedRadio) {
                this._currentSecurityType = 1;
            }
        }
        this.onSecurityTypeChanged();
    }
    rebootDevice() {
        let prompt = ui.promptMessage(
            get('divContainer'),
            tr('PROMPT_REBOOT_CONFIRM_TITLE'),
            () => {
                if(typeof socket !== 'undefined') socket.close(3000, 'reboot');
                putJSONSync('/reboot', {}, (err, response) => {
                    get('btnSaveGeneral').classList.remove('disabled');
                    logger.debug('Reboot requested:', response);
                });
                ui.clearErrors();
            },
            true,'svg-reboot'
        );
        prompt.querySelector('.sub-message').innerHTML = `<p>${tr('PROMPT_REBOOT_CONFIRM_SUB')}</p>`;
    }
    onLanguageChanged(lang, reload = true) {
        const sel = get('langSelect');
        if (sel) sel.disabled = true;
        localStorage.setItem('selectedLang', lang);

        fetch(baseUrl + '/setLang?lang=' + lang)
        .then(r => r.json())
        .then(resp => {
            if (resp.status === "ok") {
                if (reload) {
                    window.location.reload(true);
                } else {
                    if (sel) {
                        sel.value = lang;
                        sel.disabled = false;
                    }
                }
            }
        })
        .catch(err => {
            logger.error("Failed to change language:", err);
            if (sel) sel.disabled = false;
        });
    }
    onModeThemeChanged() {
        const sel = get('selThemeMode');
        const val = sel.value;
        localStorage.setItem('themeMode', val);

        if (val === '1') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else if (val === '2') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        }
    }
    onSecurityTypeChanged() {
        const badge = get('badgeSecurityState');
        if (!badge) return;
        badge.classList.remove('state-disabled', 'state-pin', 'state-password');

        if (!this._securityEnabled || this._currentSecurityType === 0) {
            badge.textContent = tr('SECURITY_DESACTIVATE');
            badge.classList.add('state-disabled');
        } else if (this._currentSecurityType === 1) {
            badge.textContent = tr('SECURITY_PIN_CODE');
            badge.classList.add('state-pin');
        } else if (this._currentSecurityType === 2) {
            badge.textContent = tr('SECURITY_PASSWORD');
            badge.classList.add('state-password');
        }
    }
    SecurityOverlay() {
        if (get('divSecurityOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divSecurityOverlay';
        div.className = 'inst-overlay';

        const isCurrentlyActive = (this._currentSecurityType !== 0 && this._securityEnabled);
        const currentType = isCurrentlyActive ? this._currentSecurityType : 1;

        div.innerHTML = `
        <div class="sec-slider-modal" id="divSecurityPopupContent">
        <div class="sec-slider-view">
        <div class="sec-slider-track" id="secCarouselWrapper">

        <!-- Page 1 : Toujours présente -->
        <div class="slider-page1">
        <div id="secScreenWelcome" class="securityPageUnlock">
        <svg class="security-icon"><use href="#svg-unlock"></use></svg>
        <h3>${tr('SECURITY_INACTIVE')}</h3>
        <p>${tr('SECURITY_INACTIVE_DESC')}</p>
        </div>
        <div class="button-container-col">
        <button id="btnSecWelcomeActivate" type="button"><svg><use href="#svg-add"></use></svg><span>${tr('SECURITY_ACTIVATE')}</span></button>
        <button id="btnSecWelcomeClose" line type="button">${tr('BT_CLOSE')}</button>
        </div>
        </div>

        <!-- Page 2 : Toujours présente -->
        <div class="slider-page2">



        ${overlayHeader("GENERAL_SECURITY", "LINK_REMOTE_DESC", "svg-lock", {
            subtitle: 'HACS_DESC',
        })}



        <div class="sec-slider-scroll" id="divSecurityScrollContent">
        <div id="secScreenForm" class="securityPagelock">
        <div class="security-cards-container">
        <label class="security-card">
        <input type="radio" name="secTypeGroup" value="1" ${currentType === 1 ? 'checked' : ''}>
        <div class="security-card-content">
        <div class="security-card-top">
        <svg><use href="#svg-lock"></use></svg>
        <span class="security-title">${tr('SECURITY_PIN_CODE')}</span>
        <span class="security-desc">${tr('SECURITY_PIN_CODE_DESC')}</span>
        </div>
        <div class="security-radio"><div class="custom-radio-circle"></div></div>
        </div>
        </label>
        <label class="security-card">
        <input type="radio" name="secTypeGroup" value="2" ${currentType === 2 ? 'checked' : ''}>
        <div class="security-card-content">
        <div class="security-card-top">
        <svg><use href="#svg-usermqtt"></use></svg>
        <span class="security-title">${tr('SECURITY_PASSWORD')}</span>
        <span class="security-desc">${tr('SECURITY_PASSWORD_DESC')}</span>
        </div>
        <div class="security-radio"><div class="custom-radio-circle"></div></div>
        </div>
        </label>
        </div>

        <label class="uniRow marginB25">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#vr-favori"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('SECURITY_SECURE_CONFIG_ONLY')}</div>
        <div class="uniStatus">${tr('SECURITY_SECURE_CONFIG_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch">
        <input id="cbSecureConfigOnly" name="hardwired" type="checkbox" data-bind="security.permissions.configOnly"/>
        <div></div>
        </span>
        </div>
        </label>

        <div id="divPopupPin" class="uniblocCol" style="display: ${currentType === 1 ? 'block' : 'none'};">
        <label class="labelMAJ">${tr('SECURITY_ENTER_PIN') || 'Définir le code PIN'}</label>
        <div style="display: flex; justify-content: center; gap: 10px;">
        <input class="pin-digit" type="password" maxlength="1">
        <input class="pin-digit" type="password" maxlength="1">
        <input class="pin-digit" type="password" maxlength="1">
        <input class="pin-digit" type="password" maxlength="1">
        </div>
        </div>

        <div id="divPopupPassword" style="display: ${currentType === 2 ? 'block' : 'none'};">
        <div class="baseFlexCol">
        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-user"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldUsername">${tr('SECURITY_USERNAME')}</label>
        <input id="fldUsername" class="inputAndSelect" name="username" type="text" data-bind="security.username" maxlength="32" placeholder="Entrer un nom d'utilisateur">
        </div>
        </div>
        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-lock"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldPassword">${tr('SECURITY_PASSWORD')}</label>
        <input id="fldPassword" class="inputAndSelect" name="password" type="password" maxlength="32" placeholder="${tr('SECURITY_PASSWORD_PLH')}">
        <div class="password-eye" onclick="security.toggleFieldPassword('fldPassword', this)"><svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg></div>
        </div>
        </div>
        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-lock"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldRenterPassword">${tr('SECURITY_CONFIRM_PASSWORD')}</label>
        <input id="fldRenterPassword" class="inputAndSelect" name="password" type="password" maxlength="32" placeholder="${tr('SECURITY_CONFIRM_PASSWORD')}">
        <div class="password-eye" onclick="security.toggleFieldPassword('fldRenterPassword', this)"><svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg></div>
        </div>
        </div>
        </div>
        </div>
        </div>
        <div class="button-container-row">
        <button id="btnPopupDisableSec" redFit type="button">Désactiver</button>
        </div>
        </div>

        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay">
        <button id="btnSecGoBack" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnPopupSaveSec" type="button"><svg><use href="#svg-save"></use></svg><span>${tr('BT_SAVE')}</span></button>
        </div>
        </div>
        </div>
        </div>
        </div>`;

        shOverlay(div);

        const wrapper = div.querySelector('#secCarouselWrapper');


        // Si la sécurité est DÉJÀ active, on glisse sur la page 2 au chargement
        if (isCurrentlyActive && wrapper) {
            wrapper.classList.add('slide-active');
        }


        const btnActivate = div.querySelector('#btnSecWelcomeActivate');
        if (btnActivate) {
            btnActivate.onclick = () => wrapper.classList.add('slide-active');
        }

        ui.toElement(div, { security: this._securityData || { username: '', permissions: { configOnly: false } } });
        initSecretPinGroup(div.querySelectorAll('#divPopupPin .pin-digit'), this._hasPin);
        initSecretField(div.querySelector('#fldPassword'), this._hasPassword);
        watchDirty(div);

        if (div.querySelector('#btnSecWelcomeClose')) div.querySelector('#btnSecWelcomeClose').onclick = () => { clearDirty(); closeOverlay(div); };
        div.querySelector('#btnSecGoBack').onclick = () => { clearDirty(); closeOverlay(div); };

        const btnDisable = div.querySelector('#btnPopupDisableSec');
        if (btnDisable && !this._securityEnabled) btnDisable.style.display = 'none';
        if (btnDisable) {
            btnDisable.onclick = () => {
                this._securityEnabled = false;
                this._currentSecurityType = 0;
                clearDirty();
                closeOverlay(div);
                this.saveSecurity();
            };
        }

        div.querySelector('#btnPopupSaveSec').onclick = () => {
            const selectedRadio = div.querySelector('input[name="secTypeGroup"]:checked');
            this._currentSecurityType = selectedRadio ? parseInt(selectedRadio.value, 10) : 1;
            this._securityEnabled = true;
            clearDirty();
            closeOverlay(div);
            this.saveSecurity();
        };

        const radios = div.querySelectorAll('input[name="secTypeGroup"]');
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const val = parseInt(e.target.value, 10);
                div.querySelector('#divPopupPin').style.display = (val === 1) ? 'block' : 'none';
                div.querySelector('#divPopupPassword').style.display = (val === 2) ? 'block' : 'none';
            });
        });

        const pinInputs = div.querySelectorAll('.pin-digit');
        pinInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1 && index < pinInputs.length - 1) pinInputs[index + 1].focus();
            });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) pinInputs[index - 1].focus();
                });
        });
    }
    saveSecurity() {
        const popupContent = get('divSecurityPopupContent');
        let s;
        let finalType = 0;
        let pinInputs = [];
        let pwdInput = null;
        let repeatInput = null;

        if (popupContent) {
            const boundData = ui.fromElement(popupContent);
            s = (boundData && boundData.security) ? boundData.security : { username: '', permissions: { configOnly: false } };
            pinInputs = popupContent.querySelectorAll('#divPopupPin .pin-digit');
            pwdInput = popupContent.querySelector('#fldPassword');
            repeatInput = popupContent.querySelector('#fldRenterPassword');
            if (this._securityEnabled) {
                const checkedRadio = popupContent.querySelector('input[name="secTypeGroup"]:checked');
                finalType = checkedRadio ? parseInt(checkedRadio.value, 10) : 1;
            }
        } else {
            s = this._securityData || { username: '', permissions: { configOnly: false } };
            finalType = this._currentSecurityType;
        }
        // Le serveur ne renvoie jamais le PIN/mot de passe existant : un champ encore masqué par le
        // faux affichage (jamais ouvert/modifié) veut dire "non modifié", pas "à effacer".
        const pin = secretPinValue(pinInputs);
        const pinTouched = pin.length > 0;
        const password = pwdInput ? secretValue(pwdInput) : '';
        const repeatPassword = repeatInput ? secretValue(repeatInput) : '';
        const passwordTouched = !!password || !!repeatPassword;

        let confirmText = '';
        if (finalType === 0) {
            confirmText = `<p>${tr('PROMPT_SECURITY_CONFIRM_DESACTIVE')}</p>`;
        }
        else if (finalType === 1) {
            if (pinTouched) {
                if (pin.length !== 4) return this.secError('ERR_PIN_INVALID', 'ERR_PIN_INVALID_DESC');
            } else if (!this._hasPin) {
                return this.secError('ERR_PIN_INVALID', 'ERR_PIN_INVALID_DESC');
            }
            confirmText = `<p>${tr('SAVESECURITY_PIN_WARNING')}</p><p>${tr('SAVESECURITY_PIN_CONFIRM')}</p>`;
        }
        else if (finalType === 2) {
            if (!s.username) return this.secError('ERR_USERNAME_MISSING', 'ERR_USERNAME_MISSING_DESC');
            if (passwordTouched) {
                if (password !== repeatPassword) return this.secError('ERR_PASSWORD_MISMATCH', 'ERR_PASSWORD_MISMATCH_DESC');
            } else if (!this._hasPassword) {
                return this.secError('ERR_PASSWORD_MISSING', 'ERR_PASSWORD_MISSING_DESC');
            }
            confirmText = `<p>${tr('SAVESECURITY_PASSWORD_WARNING')}</p><p>${tr('SAVESECURITY_PASSWORD_CONFIRM')}</p>`;
        }

        const data = {
            type: finalType,
            username: s.username || '',
            password: passwordTouched ? password : '',
            pin: pinTouched ? pin : '',
            perm: (s.permissions && s.permissions.configOnly) ? 1 : 0,
            permissions: (s.permissions && s.permissions.configOnly) ? 0x01 : 0x00
        };

        const prompt = ui.promptMessage(tr('PROMPT_SECURITY_CONFIRM'), () => {
            putJSONSync('/saveSecurity', data, (e) => {
                prompt.remove();
                if (e) {
                    ui.serviceError(e);
                } else {
                    this._currentSecurityType = finalType;
                    this._securityEnabled = (finalType !== 0);
                    if (pinTouched) this._hasPin = true;
                    if (passwordTouched) this._hasPassword = true;

                    if (popupContent) this._securityData = { username: s.username, permissions: s.permissions };

                    const overlay = get('divSecurityOverlay');
                    if (overlay) closeOverlay(overlay);

                    this.onSecurityTypeChanged();
                }
            });
        });
        prompt.querySelector('.sub-message').innerHTML = confirmText;
    }
    secError(title, desc) {
        ui.errorMessage(tr(title), tr(desc));
    }
    showHAOverlay() {
        const div = document.createElement('div');
        div.id = 'divHAConfig';
        div.className = 'inst-overlay';

        div.innerHTML = `
        <div class="instructions-content">

        ${overlayHeader('HACS', 'HACS_DESC', 'svg-homeAssistant', {
            subtitle: false, // Exemple de sous-titre optionnel
            showInfo: true,                      // Mettre à false pour masquer le '?'
            showExpert: false                    // Desactive/Active le menu expert
        })}


        <div class="overlay-scroll-content">

        <p><strong>${tr('HACS_PURPOSE_TITLE')}</strong></p>
        <p>${tr('HACS_PURPOSE_TEXT_1')}</p>
        <p>${tr('HACS_PURPOSE_TEXT_2')}</p>
        <p class="ha-section-title"><strong>${tr('HACS_INSTALL_TITLE')}</strong></p>
        <ol class="ha-install-list">
        <li>${tr('HACS_INSTALL_STEP_1')}</li>
        <li>${tr('HACS_INSTALL_STEP_2')}</li>
        <li>${tr('HACS_INSTALL_STEP_3')}</li>
        <li>${tr('HACS_INSTALL_STEP_4')}</li>
        </ol>
        <div class="warning">
        <div class="warning-header">
        <svg><use href="#svg-warning"></use></svg>
        <b>${tr('MSG_WARNING')}</b>
        </div>

        <div class="information-text">
        <span>
        ${tr('HACS_REQ_START')}
        <a href="https://www.home-assistant.io" target="_blank" style="color: inherit; text-decoration: underline;"><strong>Home Assistant</strong></a>
        ${tr('HACS_REQ_MID')}
        <a href="https://hacs.xyz" target="_blank" style="color: inherit; text-decoration: underline;"><strong>HACS</strong></a>
        ${tr('HACS_REQ_END')}
        </span>
        </div>
        </div>
        <div class="ha-badge-container">
        <a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=xkain&repository=ESPSomfy-RTS-enhanced&category=integration" target="_blank" class="ha-badge-button">
        <span class="ha-badge-text-main">Open HACS repository on</span>
        <span class="ha-badge-pill"><span class="ha-badge-text-pill">MY</span><svg width="18" height="18"><use href="#svg-homeAssistant"></use></svg></span>
        </a>
        <p class="ha-github-link-container">
        ${tr('HACS_OR_VISIT')} <a href="https://github.com/xkain/ESPSomfy-RTS-enhanced" target="_blank" class="ha-github-link">dépôt GitHub</a>
        </p>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
         <div class="button-container-overlay">
        <button id="btnCloseHA" type="button" onclick="closeOverlay(get('divHAConfig'))">${tr('BT_CLOSE')}</button>
        </div>
        </div>`;

        shOverlay(div);
    }
}
var general = new General();

class Wifi {
    initialized = false;
    ethBoardTypes = [];
    ethClockModes = [];
    ethPhyTypes = [];

    init() {
        this.ethBoardTypes = [
            { val: 0, label: tr("MANUAL_SETTINGS") || "Configuration Manuelle" },
            { val: 1, label: 'WT32-ETH01 - Wireless Tag', clk: 0, ct: 0, addr: 1, pwr: 16, mdc: 23, mdio: 18 },
            { val: 7, label: 'EST-PoE-32 - Everything Smart', clk: 3, ct: 0, addr: 0, pwr: 12, mdc: 23, mdio: 18 },
            { val: 3, label: 'ESP32-EVB - Olimex', clk: 0, ct: 0, addr: 0, pwr: -1, mdc: 23, mdio: 18 },
            { val: 2, label: 'ESP32-POE - Olimex', clk: 3, ct: 0, addr: 0, pwr: 12, mdc: 23, mdio: 18 },
            { val: 4, label: 'T-Internet POE - LILYGO', clk: 3, ct: 0, addr: 0, pwr: 16, mdc: 23, mdio: 18 },
            { val: 5, label: 'wESP32 v7+ - Silicognition', clk: 0, ct: 2, addr: 0, pwr: -1, mdc: 16, mdio: 17 },
            { val: 6, label: 'wESP32 < v7 - Silicognition', clk: 0, ct: 0, addr: 0, pwr: -1, mdc: 16, mdio: 17 }
        ];
        this.ethClockModes = [
            { val: 0, label: 'GPIO0 IN' },
            { val: 1, label: 'GPIO0 OUT' },
            { val: 2, label: 'GPIO16 OUT' },
            { val: 3, label: 'GPIO17 OUT' }
        ];
        this.ethPhyTypes = [
            { val: 0, label: 'LAN8720' },
            { val: 1, label: 'TLK110' },
            { val: 2, label: 'RTL8201' },
            { val: 3, label: 'DP83848' },
            { val: 4, label: 'DM9051' },
            { val: 5, label: 'KZ8081' }
        ];

        const divStrength = get("divWiFiStrength");
        this.procWifiStrength({strength: -100, ssid: '', channel: -1});

        if (this.initialized) return;

        this.loadETHDropdown(get('selETHClkMode'), this.ethClockModes);
        this.loadETHDropdown(get('selETHPhyType'), this.ethPhyTypes);
        this.loadETHDropdown(get('selETHBoardType'), this.ethBoardTypes);

        let addr = [];
        for (let i = 0; i < 32; i++) {
            addr.push({ val: i, label: `PHY ${i}` });
        }
        this.loadETHDropdown(get('selETHAddress'), addr);

        ui.toElement(get('divNetAdapter'), {
            wifi: { ssid: '', passphrase: '' },
            ethernet: {
                boardType: 1,
                wirelessFallback: false,
                dhcp: true,
                dns1: '',
                dns2: '',
                ip: '',
                gateway: ''
            }
        });
        this.onETHBoardTypeChanged(get('selETHBoardType'));
        this.initialized = true;

        const inputPwr = get('inputETHPWRPin');
        if (inputPwr) {
            inputPwr.addEventListener('focus', () => {
                if (inputPwr.value === 'None') {
                    inputPwr.type = 'number';
                    inputPwr.value = -1;
                }
            });
            inputPwr.addEventListener('blur', () => {
                if (inputPwr.value === '-1' || inputPwr.value === '') {
                    inputPwr.type = 'text';
                    inputPwr.value = 'None';
                }
            });
        }
    }
    loadETHPins(sel, type, selected) {
        let arr = [];
        switch (type) {
            case 'power':
                arr.push({ val: -1, label: 'None' });
                break;
        }
        for (let i = 0; i < 36; i++) {
            if (i === 2) continue;
            arr.push({ val: i, label: `GPIO ${i > 9 ? i : '0' + i}` });
        }
        this.loadETHDropdown(sel, arr, selected);
    }
    loadETHDropdown(sel, arr, selected) {
        if (!sel) return;
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        for (let i = 0; i < arr.length; i++) {
            let elem = arr[i];
            sel.options[sel.options.length] = new Option(elem.label, elem.val, elem.val === selected, elem.val === selected);
        }
    }
    onETHBoardTypeChanged(sel) {
        if (!sel) return;
        let type = this.ethBoardTypes.find(elem => parseInt(sel.value, 10) === elem.val);
        if (typeof type !== 'undefined') {
            if (typeof type.ct !== 'undefined') get('selETHPhyType').value = type.ct;
            if (typeof type.clk !== 'undefined') get('selETHClkMode').value = type.clk;
            if (typeof type.addr !== 'undefined') get('selETHAddress').value = type.addr;

            const inputPwr = get('inputETHPWRPin');
            if (inputPwr && typeof type.pwr !== 'undefined') {
                const isNone = (type.pwr === -1);
                if (isNone) {
                    inputPwr.type = 'text';
                    inputPwr.value = 'None';
                } else {
                    inputPwr.type = 'number';
                    inputPwr.value = type.pwr;
                }
                this.togglePowerIcon(isNone);
            }

            if (typeof type.mdc !== 'undefined') get('inputETHMDCPin').value = type.mdc;
            if (typeof type.mdio !== 'undefined') get('inputETHMDIOPin').value = type.mdio;

            get('divETHSettings').style.display = type.val === 0 ? '' : 'none';
        }
    }
    updateEthernetSummary(pinKey, value) {
        const targetLabel = pinKey.replace('Pin', '').toUpperCase() + ':';
        document.querySelectorAll('#divEthernetSummary .gpioRadio-label').forEach(lbl => {
            const text = lbl.textContent.trim();
            if (text === targetLabel) {
                const valSpan = lbl.nextElementSibling;
                if (valSpan && valSpan.classList.contains('gpioRadio-val')) {
                    valSpan.textContent = (value === -1 || value === 'None') ? 'None' : `GPIO${value}`;
                }
            }
        });
    }
    togglePowerIcon(isNone) {
        const btnIcon = document.querySelector('#btnEthPwrShortcut use');
        if (btnIcon) {
            btnIcon.setAttribute('href', isNone ? '#svg-powerOff' : '#svg-power');
        }
    }
    stepGpio(pinKey, direction) {
        const inputEl = get(`inputETH${pinKey}`);

        if (pinKey === 'PWRPin' && inputEl && inputEl.value === 'None' && direction === 1) {
            inputEl.type = 'number';
            inputEl.value = 0;
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            this.updateEthernetSummary('PWRPin', 0);
            this.togglePowerIcon(false); // Mode numérique -> Icône ON
            return;
        }

        const newValue = stepDeviceGpio(pinKey, direction, 'ETH', 'selETHBoardType', val => val === 0, this.pinMaps || [{ name: '', maxPins: 39 }]);

        if (newValue === undefined) return;
        if (pinKey === 'PWRPin' && inputEl) {
            const isNone = (parseInt(newValue, 10) === -1 || newValue === '');
            if (isNone) {
                inputEl.type = 'text';
                inputEl.value = 'None';
            } else {
                inputEl.type = 'number';
            }
            this.togglePowerIcon(isNone);
        }

        this.updateEthernetSummary(pinKey, newValue);
    }
    setPowerToNone() {
        const inputPwr = get('inputETHPWRPin');
        if (!inputPwr) return;
        if (inputPwr.value === 'None') {
            inputPwr.type = 'number';
            inputPwr.value = 0;
            inputPwr.dispatchEvent(new Event('change', { bubbles: true }));
            this.updateEthernetSummary('PWRPin', 0);
            this.togglePowerIcon(false);
            return;
        }
        inputPwr.type = 'text';
        inputPwr.value = -1;
        inputPwr.dispatchEvent(new Event('change', { bubbles: true }));
        inputPwr.type = 'text';
        inputPwr.value = 'None';

        this.updateEthernetSummary('PWRPin', -1);
        this.togglePowerIcon(true); // Mode None -> Icône OFF
    }
    onDHCPClicked(cb) { get('divStaticIP').style.display = cb.checked ? 'none' : ''; }


    loadNetwork() {
        let pnl = get('divNetAdapter');
        getJSONSync('/networksettings', (err, settings) => {
            if (err) {
                ui.serviceError(err);
                return;
            }

            // 1. Configuration des boutons switch globaux (Connexion & Fallback)
            get('cbHardwired').checked = settings.connType >= 2;
            get('cbFallbackWireless').checked = settings.connType === 3;

            // Injection des données réseau dans le panneau principal
            ui.toElement(pnl, settings);

            // 2. Gestion de la broche d'alimentation Ethernet (PWRPin)
            const inputPwr = get('inputETHPWRPin');
            if (inputPwr && settings.ethernet && settings.ethernet.PWRPin !== undefined) {
                const pwrVal = parseInt(settings.ethernet.PWRPin, 10);
                const isNone = (pwrVal === -1);

                if (isNone) {
                    inputPwr.type = 'text';
                    inputPwr.value = 'None';
                } else {
                    inputPwr.type = 'number';
                    inputPwr.value = pwrVal;
                }
                this.togglePowerIcon(isNone);
                this.updateEthernetSummary('PWRPin', pwrVal);
            }

            // 3. Sauvegarde locale des données IP pour l'overlay DHCP
            this._ipData = settings.ip || { dhcp: true, ip: '', subnet: '', gateway: '', dns1: '', dns2: '' };
            // Le serveur ne renvoie jamais les secrets réels, seulement s'ils sont définis :
            // les champs de saisie correspondants démarrent donc toujours vides.
            this._hasApPassword = !!(settings.wifi && settings.wifi.hasApPassword);
            this._hasPassphrase = !!(settings.wifi && settings.wifi.hasPassphrase);

            // 4. Mise à jour de l'interface et des badges
            this.updateDHCPBadge(this._ipData.dhcp);
            get('divETHSettings').style.display = settings.ethernet.boardType === 0 ? '' : 'none';
            get('spanCurrentIP').innerHTML = this._ipData.ip;

            // 5. Synchronisation des comportements UI restants
            this.updateStatusBadge(settings);
            this.setConnectionType(settings.connType >= 2);
            this.useEthernetClicked();
            this.hiddenSSIDClicked();

            // =========================================================================
            // 6. Écouteurs d'événements pour les nouveaux boutons d'action Wi-Fi
            // =========================================================================
            const btnScan = get('btnOpenScanWifi');
            if (btnScan) {
                btnScan.onclick = () => {
                    this.wifiOverlay('Sélectionner un réseau', false);
                };
            }

            const btnManual = get('btnOpenManualWifi');
            if (btnManual) {
                btnManual.onclick = () => {
                    this.wifiOverlay('Configuration manuelle', true);
                };
            }

            watchDirty(pnl);
        });
    }
    updateStatusBadge(settings) {
        const wifiBadge = document.getElementById('wifiBadge');

        if (wifiBadge) {
            if (this.isHotspot) {
                wifiBadge.textContent = "HOTSPOT";
                wifiBadge.setAttribute('data-conn', 'hotspot');
            } else {
                wifiBadge.textContent = "WIFI";
                wifiBadge.setAttribute('data-conn', 'wifi');
            }
        }
        const options = document.querySelectorAll('.opt-badge');
        if (!options.length) return;

        let activeType = "wifi";

        if (this.isHotspot) {
            activeType = "hotspot";
        }
        else if (settings && parseInt(settings.connType) >= 2) {
            const boardType = (settings.ethernet && settings.ethernet.boardType !== undefined) ? parseInt(settings.ethernet.boardType) : 0;
            const pwrPin = (settings.ethernet && settings.ethernet.PWRPin !== undefined) ? parseInt(settings.ethernet.PWRPin) : -1;
            if (boardType === 1) {
                activeType = "lan";
            } else if (pwrPin !== -1) {
                activeType = "poe";
            } else {
                activeType = "lan";
            }
        }
        options.forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-conn') === activeType);
        });
    }
    setConnectionType(isEthernet) {
        this.useEthernetClicked();
    }
    useEthernetClicked() {
        let useEthernet = get('cbHardwired').checked;

        get('divWiFiMode').style.display = useEthernet ? 'none' : '';
        get('divRoaming').style.display = useEthernet ? 'none' : '';
        get('divHiddenSSID').style.display = useEthernet ? 'none' : '';
        get('divEthernetSection').style.display = useEthernet ? '' : 'none';
        get('divEthernetMode').style.display = useEthernet ? '' : 'none';
    }
    hiddenSSIDClicked() {
        const cbHidden = get('cbHiddenSSID');
        const cbRoaming = get('cbRoaming');
        const divRoaming = get('divRoaming');

        if (!cbHidden || !cbRoaming) return;

        const isHiddenActive = cbHidden.checked;

        if (isHiddenActive) {
            cbRoaming.checked = false;
        }
        cbRoaming.disabled = isHiddenActive;

        if (divRoaming) {
            if (isHiddenActive) {
                divRoaming.classList.add('is-disabled');
            } else {
                divRoaming.classList.remove('is-disabled');
            }
        }
    }



    apPasswordOverlay() {
        if (get('divAPPasswordOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divAPPasswordOverlay';
        div.className = 'modal-overlay';

        div.innerHTML = `
        <div class="message-content apPassword-content">
        ${modalHeader('CONNEXION_TITLE_AP', 'svg-hotspot')}
        <div class="overlay-scroll-content">
        <div class="uniblocCol">
        <p>${tr('CONNEXION_AP_OVERLAY_DESC')}</p>
        </div>
        <div class="uniblocCol">
        <label class="label" for="fldAPPassword">${tr('CONNEXION_AP_PASSWORD')}</label>
        <div class="password-container">
        <input id="fldAPPassword" class="inputAndSelect" name="apPassword" type="password" minlength="8" maxlength="63" placeholder="${tr('SECURITY_PASSWORD_PLH_SIMPLE')}">
        <div class="password-eye" onclick="security.toggleFieldPassword('fldAPPassword', this)"><svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg></div>
        </div>
        </div>
        <div class="warning">
        <div class="warning-header">
        <svg><use href="#svg-warning"></use></svg>
        <b>${tr('MSG_WARNING')}</b>
        </div>
        <div class="information-text">
        <span>${tr('CONNEXION_AP_WARNING')}</span>
        </div>
        </div>
        </div>
        <div class="hrModal marginB0"></div>
        <div class="button-container-modal">
        <button id="btnAPPasswordClose" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnSaveAPPassword" type="button">
        <svg><use href="#svg-save"></use></svg>
        <span>${tr('BT_SAVE')}</span>
        </button>
        </div>
        </div>`;

        shOverlay(div);
        initSecretField(div.querySelector('#fldAPPassword'), this._hasApPassword);
        watchDirty(div);

        div.querySelector('#btnAPPasswordClose').onclick = () => { clearDirty(); closeOverlay(div); };
        div.querySelector('#btnSaveAPPassword').onclick = () => this.saveAPPassword(div);
    }
    saveAPPassword(overlayEl) {
        if (!overlayEl) overlayEl = get('divAPPasswordOverlay');
        if (!overlayEl) return;

        // Chaîne vide si le masque factice n'a jamais été effacé (= non modifié).
        const pwd = secretValue(overlayEl.querySelector('#fldAPPassword'));

        if (pwd.length > 0 && pwd.length < 8) {
            ui.errorMessage(tr('ERR_AP_PASSWORD_INVALID'), tr('ERR_AP_PASSWORD_INVALID_DESC'));
            return;
        }

        putJSONSync('/setNetwork', { wifi: { apPassword: pwd } }, (err, response) => {
            if (err) {
                ui.serviceError(err);
            } else {
                if (pwd.length > 0) this._hasApPassword = true;
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                clearDirty();
                closeOverlay(overlayEl);
            }
        });
    }
    wifiOverlay(modalTitle, startAtPage2 = false) {
        if (get('divWifiScanOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divWifiScanOverlay';
        div.className = 'modal-overlay';

        div.innerHTML = `
        <div class="message-content">
        ${modalHeader('CONNEXION_MODAL_SELECT_TITLE', 'svg-wifi', {
            subtitle: 'Choisissez le réseau Wi-Fi auquel connecter votre appareil.',
            rightContent: `<!-- Ton contenu de droite si nécessaire -->`
        })}
        <!-- CARROUSEL CONTAINER -->
        <div id="wifiCarousel">
        <!-- PAGE 1 : Liste des réseaux -->
        <div id="wifiPage1" class="wifiChoosePage">
        <div>
        <div class="blocdivApsOverlay"><div id="divApsOverlay" data-lastloaded="0"></div></div>
        <div class="divbtsTButton">
        <button id="btnManualWifi" type="button" btsText><svg><use href="#svg-add"></use></svg><span>${tr("BT_ADD_MANUAL")}</span></button>
        <button id="btnRefreshWifiInModal" type="button" btsText><svg><use href="#svg-retry"></use></svg><span>${tr("BT_RETRY")}</span></button>
        </div>
        </div>
        <div class="hrModal marginB0"></div>
        <div class="button-container-modal">
        <button id="btnWifiGoBack" line type="button">${tr('BT_CLOSE')}</button>
        </div>
        </div>

        <!-- PAGE 2 : Saisie SSID & Mot de passe -->
        <div id="wifiPage2" class="wifiChoosePage">
        <!-- Zone supérieure flexible -->
        <div class="wifiPage2Flex">
        <!-- On affiche le bouton Retour UNIQUEMENT si on n'a pas démarré directement à la page 2 -->
        <div class="marginB" style="display: ${startAtPage2 ? 'none' : 'flex'};">
        <button id="btnModalBackToPage1" type="button" btsText><svg><use href="#svg-arrowLeft"></use></svg><span>${tr("BT_GO_BACK")}</span></button>
        </div>
        <!-- Marge de compensation si le bouton retour est masqué -->
        <div style="height: ${startAtPage2 ? '25px' : '0px'};"></div>
        <!-- Bloc des inputs -->
        <div class="baseFlexCol">
        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-ssid"></use></svg></div>
        <div class="unifield-content" style="width: 100%;">
        <label class="label">${tr("CONNEXION_WIFI_SSID")}</label>
        <input id="modalFldSsid" class="inputAndSelect" type="text" tr="CONNEXION_WIFI_ENTER_SSID" placeholder="Entrer votre SSID">
        </div>
        </div>
        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-lock"></use></svg></div>
        <div class="unifield-content">
        <label class="label">${tr("SECURITY_PASSWORD")}</label>
        <input id="modalFldPassphrase" class="inputAndSelect" type="password" placeholder="${tr("SECURITY_PASSWORD_PLH")}">
        <div class="password-eye" onclick="security.toggleFieldPassword('modalFldPassphrase', this)">
        <svg class="pwd-icon pwd-iconeye"><use href="#svg-eyeOff"></use></svg>
        </div>
        </div>
        </div>
        </div>
        </div>
        <!-- Pied de page avec bouton Fermer/Annuler dynamique si startAtPage2 est vrai -->
        <div class="hrModal marginB0"></div>
        <div class="button-container-modal">
        <!-- Bouton Annuler visible uniquement en accès direct manuel -->
        <button id="btnModalCancelWifi2" line type="button">${tr('BT_CANCEL_1')}</button>
        <button id="btnModalSaveWifi" type="button"><svg><use href="#svg-succes"></use></svg><span>${tr("BT_CONFIRM")}</span></button>
        </div>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);

        get('btnRefreshWifiInModal').onclick = () => this.loadAPs(true);
        get('btnWifiGoBack').onclick = () => this.cancelScan();
        get('btnManualWifi').onclick = () => {
            this.setupManualInputMode();
            this.slideCarousel(1);
            setTimeout(() => { get('modalFldSsid').focus(); }, 350);
        };
        get('btnModalBackToPage1').onclick = () => this.slideCarousel(0);

        const btnCancel2 = get('btnModalCancelWifi2');
        if (btnCancel2) {
            btnCancel2.onclick = () => this.cancelScan();
        }

        get('btnModalSaveWifi').onclick = () => {
            const ssidVal = get('modalFldSsid').value || '';
            const passVal = get('modalFldPassphrase').value || '';

            if (!ssidVal.trim()) {
                ui.errorMessage(tr('ERR_WIFI_SSID_INVALID'));
                return;
            }
            if (ssidVal.length > 64) {
                ui.errorMessage(tr('ERR_WIFI_SSID_INVALID'), tr('ERR_WIFI_SSID_MAX_LENGTH_64'));
                return;
            }
            if (passVal.length > 64) {
                ui.errorMessage(tr('ERR_WIFI_PASSPHRASE_INVALID'), tr('ERR_WIFI_PASSPHRASE_MAX_LENGTH_64'));
                return;
            }

            this.cancelScan();
            const currentHostname = (window.settings && window.settings.hostname) || 'espsomfyrts';
            this.wifiConfirmationOverlay(currentHostname);
        };

        get('modalFldSsid').oninput = (e) => {
            const realSsid = document.getElementsByName('ssid')[0];
            if (realSsid) {
                realSsid.value = e.target.value;
                realSsid.dispatchEvent(new Event('input'));
            }
        };
        get('modalFldPassphrase').oninput = (e) => {
            const realPass = document.getElementsByName('passphrase')[0];
            if (realPass) {
                realPass.value = e.target.value;
                realPass.dispatchEvent(new Event('input'));
            }
        };

        if (startAtPage2) {
            this.setupManualInputMode();
            const carousel = get('wifiCarousel');
            carousel.style.transition = 'none';
            this.slideCarousel(1);
            setTimeout(() => {
                carousel.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
                get('modalFldSsid').focus();
            }, 50);
        } else {
            this.loadAPs(true);
        }
    }
    setupManualInputMode() {
        const modalSsid = get('modalFldSsid');
        if (modalSsid) {
            modalSsid.value = document.getElementsByName('ssid')[0]?.value || '';
            modalSsid.removeAttribute('readonly');
            modalSsid.style.opacity = '1';
            modalSsid.style.background = 'none';
        }
        const modalPass = get('modalFldPassphrase');
        if (modalPass) {
            modalPass.value = document.getElementsByName('passphrase')[0]?.value || '';
        }
    }
    slideCarousel(pageIndex) {
        const carousel = get('wifiCarousel');
        if (carousel) {
            carousel.style.transform = `translateX(-${pageIndex * 50}%)`;
        }
    }

    async loadAPs(forceLoader = false) {
        const btnScan = get('btnScanAPs');
        const divAps = get('divApsOverlay');
        if (!divAps) {
            this.wifiOverlay();
            return;
        }
        if (btnScan && btnScan.classList.contains('disabled')) return;

        divAps.innerHTML = `<div class="no-wifi"><div class="wifiConnectScan"><div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div></div><div class="loadAPScan">${tr("CONNEXION_SCANNING")}</div></div>`;

        if (btnScan) btnScan.classList.add('disabled');

        setTimeout(() => {
            getJSON('/scanaps', (err, aps) => {
                if (err) logger.error('Wi-Fi scan failed:', err);
                else logger.debug('Wi-Fi scan found', aps?.accessPoints?.length || 0, 'access points');

                if (btnScan) btnScan.classList.remove('disabled');
                if (err || !aps || !aps.accessPoints) {
                    this.displayAPs({ accessPoints: [] });
                } else {
                    this.displayAPs(aps);
                }
            });
        }, forceLoader ? 100 : 0);
    }
















    displayAPs(aps) {
        let nets = [];
        if (aps && aps.accessPoints) {
            for (let i = 0; i < aps.accessPoints.length; i++) {
                let ap = aps.accessPoints[i];
                let p = nets.find(elem => elem.name === ap.name);
                if (p) {
                    p.channel = p.strength > ap.strength ? p.channel : ap.channel;
                    p.macAddress = p.strength > ap.strength ? p.macAddress : ap.macAddress;
                    p.strength = Math.max(p.strength, ap.strength);
                } else {
                    nets.push(ap);
                }
            }
        }
        nets.sort((a, b) => b.strength - a.strength);

        let div = "";
        if (nets.length > 0) {
            for (let i = 0; i < nets.length; i++) {
                let ap = nets[i];
                div += `<div class="network-wifi-row" onclick="wifi.selectSSID(this);" data-channel="${ap.channel}" data-encryption="${ap.encryption}" data-strength="${ap.strength}" data-mac="${ap.macAddress}"><span class="ssid">${ap.name}</span><span class="strength">${this.displaySignal(ap.strength)}</span></div>`;
            }
        } else {
            div = `<div class="no-wifi"><div>${tr("ERR_NO_WIFI_FOUND")}</div></div>`;
        }

        let divAps = get('divApsOverlay');
        if (divAps) {
            divAps.setAttribute('data-lastloaded', new Date().getTime());
            divAps.innerHTML = div;
        }
    }
    cancelScan() {
        const btnScan = get('btnScanAPs');
        if (btnScan) btnScan.classList.remove('disabled');

        const overlay = get('divWifiScanOverlay');
        if (overlay) {
            closeOverlay(overlay);
        }
    }
    selectSSID(el) {
        let obj = {
            name: el.querySelector('span.ssid').innerHTML,
            encryption: el.getAttribute('data-encryption'),
            strength: parseInt(el.getAttribute('data-strength'), 10),
            channel: parseInt(el.getAttribute('data-channel'), 10)
        };
        logger.debug('SSID selected:', obj);
        const realSsidField = document.getElementsByName('ssid')[0];
        if (realSsidField) {
            realSsidField.value = obj.name;
            realSsidField.dispatchEvent(new Event('input'));
        }
        const modalSsidField = get('modalFldSsid');
        if (modalSsidField) {
            modalSsidField.value = obj.name;
        }
        const realPassField = document.getElementsByName('passphrase')[0];
        const modalPassField = get('modalFldPassphrase');
        if (realPassField && modalPassField) {
            modalPassField.value = realPassField.value;
        }
        this.slideCarousel(1);
        setTimeout(() => {
            if (modalPassField) modalPassField.focus();
        }, 350);
    }
    wifiConfirmationOverlay(hostname) {
        if (get('divWifiConfirmationOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divWifiConfirmationOverlay';
        div.className = 'modal-overlay';
        const host = hostname || 'espsomfyrts';

        div.innerHTML = `
        <div class="message-content confirmWifi-content">
        <div class="modal-mobile-handle" onclick="handleMobileDismiss(this)"></div>
        <div class="overlay-scroll-content">
        <div class="confirmWifi-header">
        <div class="confirmWifi-icon"><svg><use href="#svg-download"></use></svg></div>
        <h3>${tr("SAVEWIFI_TITLE")}</h3>
        </div>
        <div class="confirmWifi-body">
        <p class="confirmWifi-intro">${tr("SAVEWIFI_INTRO")}</p>
        <div>
        <div class="alert-title">${tr("SAVEWIFI_ACCES_AFTER")}</div>
        <p class="alert-desc-sub">${tr("SAVEWIFI_ACCES_AFTER_DESC_0")}</p>
        <div class="links-container">
        <a href="http://${host}.local" target="_blank">http://${host}.local</a>
        <span class="or-separator">${tr("SAVEWIFI_ACCES_AFTER_DESC_1")}</span>
        <a href="http://${host}" target="_blank">http://${host}</a>
        </div>
        <p class="alert-desc-sub">${tr("SAVEWIFI_ACCES_AFTER_DESC_2")}</p>
        </div>
        </div>
        <div class="hrMessage"></div>
        <div class="confSaveWifi-divStepsTitle">
        <div class="confSaveWifi-stepsTitle">${tr("CONFIRMWIFI_TITLE_STEP")}</div>
        <ol class="confSaveWifi-steps">
        <li>${tr("CONFIRMWIFI_TITLE_STEP_0")}</li>
        <li>${tr("CONFIRMWIFI_TITLE_STEP_1")}</li>
        <li>${tr("CONFIRMWIFI_TITLE_STEP_2")}</li>
        </ol>
        </div>
        </div>
        <div class="hrModal marginB0"></div>
        <div class="button-container-modal">
        <button id="btnConfirmNetCancel" type="button" line>${tr("BT_CANCEL_1")}</button>
        <button id="btnConfirmNetSave" type="button">
        <svg><use href="#svg-download"></use></svg>
        <span>${tr("BT_SAVE")}</span>
        </button>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);

        get('btnConfirmNetCancel').onclick = () => closeOverlay(div);
        get('btnConfirmNetSave').onclick = () => {
            // On ne ferme plus la fenêtre : l'ESP32 enregistre puis redémarre son réseau, donc la
            // connexion va être coupée. On affiche un indicateur de chargement à la place pour que
            // l'utilisateur comprenne que quelque chose est en cours plutôt que de croire à un bug.
            get('btnConfirmNetCancel').disabled = true;
            get('btnConfirmNetSave').disabled = true;
            // La sauvegarde réseau déclenche un ui.successMessage() qui, lui, appelle
            // ui.clearErrors() et fermerait cette fenêtre bien avant que l'ESP32 ait fini de basculer
            // de réseau. On la marque pour qu'elle survive à cet appel.
            div.dataset.keepOpen = 'true';
            ui.waitMessage(div);
            if (this.saveNetwork) {
                this.saveNetwork();
            }
        };
    }
    calcWaveStrength(sig) {
        let wave = 0;
        if (sig > -90) wave = 0;
        if (sig > -80) wave = 1;
        if (sig > -70) wave = 2;
        if (sig > -60) wave = 3;
        return wave;
    }
    displaySignal(sig) {
        let level = this.calcWaveStrength(sig);
        if (level > 3) level = 3;

        // Détermination de la couleur en fonction du niveau pour l'autre composant
        let colorClass = 'sig-bad';
        if (level >= 2) colorClass = 'sig-good';
        else if (level === 1) colorClass = 'sig-medium';

        const getPart = (idNum) => {
            const active = idNum <= level;
            // On utilise les CSS variables associées à nos classes de couleur
            const fillColor = active ? `var(--${colorClass}-color)` : '#ccc';
            return `<use href="#svg-wifi-${idNum}" fill="${fillColor}" style="opacity:${active ? '1' : '0.3'}" />`;
        };

        return `
        <div class="signal">
        <svg>
        ${getPart(0)}
        ${getPart(1)}
        ${getPart(2)}
        ${getPart(3)}
        </svg>
        </div>`;
    }


    DHCPOverlay() {
        // Évite les doublons d'overlay
        if (get('divDHCPOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divDHCPOverlay';
        div.className = 'inst-overlay'; // Utilise le style d'overlay étendu

        div.innerHTML = `
        <div class="instructions-content overlaydhcp" id="divDHCPPopupContent">


        ${overlayHeader("CONNEXION_DHCP", "CONNEXION_DHCP_DESC", "svg-hostName")}

        <div class="overlay-scroll-content" id="divDHCPScrollContent">




        <div class="unibloc-container">
        <div class="uniValue" tr="CONNEXION__DHCP_DESC">Obtenir une adresse IP automatiquement depuis le routeur.</div>

        <div class="SwitchBig">
        <input id="cbPopupDHCP" type="checkbox" name="dhcp" data-bind="ip.dhcp"/>
        <label for="cbPopupDHCP" class="label-left" >IP Statique</label>
        <label for="cbPopupDHCP" class="label-right" >DHCP</label>
        <div class="nav-pill"></div>
        </div>
        </div>






        <div id="divPopupStaticIP" style="display: none; margin-top: 15px;">
        <div class="uniblocCol">


        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-ip"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldIPAddress" tr="CONNEXION_STATIC_IP"></label>
        <input id="fldIPAddress" class="inputAndSelect" name="staticIP" type="text" data-bind="ip.ip" length=32 placeholder="0.0.0.0">
        </div>
        </div>


        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-gatewayMask"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldSubnetMask" tr="CONNEXION_SUBNET_MASK"></label>
        <input id="fldSubnetMask" class="inputAndSelect" name="subnet" type="text" data-bind="ip.subnet" length=32 placeholder="0.0.0.0">
        </div>
        </div>


        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-gateway"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldGateway" tr="CONNEXION_GATEWAY"></label>
        <input id="fldGateway" class="inputAndSelect" name="gateway" type="text" data-bind="ip.gateway" length=32 placeholder="0.0.0.0">
        </div>
        </div>


        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-dns1"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldDNS1" tr="CONNEXION_DNS1"></label>
        <input id="fldDNS1" class="inputAndSelect" name="dns1" type="text" data-bind="ip.dns1" length=32 placeholder="0.0.0.0">
        </div>
        </div>


        <div class="uniRow">
        <div class="uniblocSvg-S"><svg><use href="#svg-dns2"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="fldDNS2" tr="CONNEXION_DNS2"></label>
        <input id="fldDNS2" class="inputAndSelect" name="dns2" type="text" data-bind="ip.dns2" length=32 placeholder="0.0.0.0">
        </div>
        </div>



        </div>
        </div>

        <div class="information">
        <div class="information-header">
        <svg><use href="#svg-info"></use></svg>
        <b>${tr('MSG_INFO')}</b>
        </div>
        <div class="information-text">
        <span>${tr('CONNEXION_REBOOT_INFO')}</span>
        </div>
        </div>

        </div>
        <div class="hrDivFooter"></div>
        <div class="button-container-overlay">
        <button id="btnDHCPGoBack" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnPopupSaveIPSettings" type="button">
        <svg><use href="#svg-download"></use></svg>
        <span>${tr('BT_SAVE')}</span>
        </button>
        </div>

        </div>`;

        // Affiche l'overlay à l'écran
        shOverlay(div);

        // Initialisation du data-binding (calqué sur ton système, utilise tes variables de stockage globales ou locales)
        ui.toElement(div, { ip: this._ipData || { dhcp: true, ip: '', subnet: '', gateway: '', dns1: '', dns2: '' } });
        watchDirty(div);

        const cbDHCP = div.querySelector('#cbPopupDHCP');
        const divStatic = div.querySelector('#divPopupStaticIP');

        // Fonction interne pour masquer/afficher le bloc IP statique selon l'état du switch
        const toggleStaticFields = (isDhcpEnabled) => {
            divStatic.style.display = isDhcpEnabled ? 'none' : 'block';
        };

        // Initialisation de l'affichage au chargement du modal
        if (cbDHCP) {
            toggleStaticFields(cbDHCP.checked);

            // Événement lors du clic sur le switch DHCP
            cbDHCP.onclick = (e) => {
                toggleStaticFields(e.target.checked);
                // Si tu as besoin d'exécuter une ancienne logique de ton fichier, décommente la ligne ci-dessous :
                // this.onDHCPClicked(e.target);
            };
        }

        // Gestion de la fermeture (Bouton Fermer)
        div.querySelector('#btnDHCPGoBack').onclick = () => { clearDirty(); closeOverlay(div); };

        // Gestion de la sauvegarde (Bouton Enregistrer)
        div.querySelector('#btnPopupSaveIPSettings').onclick = () => {
            clearDirty();
            // Appelle ta fonction existante de sauvegarde
            this.saveIPSettings();
            // Ferme le modal après enregistrement
            closeOverlay(div);
        };
    }

    updateDHCPBadge(isDhcp) {
        const badge = get('badgeDHCPState');
        if (badge) {
            if (isDhcp) {
                badge.innerText = tr('CONNEXION_BADGE_DHCP') || 'DHCP';
            } else {
                badge.innerText = tr('CONNEXION_BADGE_STATIC') || 'Statique';
            }
        }
    }



    saveIPSettings() {
        let overlay = get('divDHCPOverlay');
        if (!overlay) return;

        // Correction de 'pnl' -> 'overlay'
        let obj = ui.fromElement(overlay).ip;
        logger.debug('Saving IP settings:', obj);

        if (!obj.dhcp) {
            let fnValidateIP = (addr) => {
                return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(addr);
            };

            if (typeof obj.ip !== 'string' || obj.ip.length === 0 || obj.ip === '0.0.0.0') {
                ui.errorMessage(tr('ERR_STATIC_IP_REQUIRED'));
                return;
            }
            else if (!fnValidateIP(obj.ip)) {
                ui.errorMessage(tr('ERR_STATIC_IP_INVALID'));
                return;
            }
            if (typeof obj.subnet !== 'string' || obj.subnet.length === 0 || obj.subnet === '0.0.0.0') {
                ui.errorMessage(tr('ERR_NETMASK_REQUIRED'));
                return;
            }
            else if (!fnValidateIP(obj.subnet)) {
                ui.errorMessage(tr('ERR_NETMASK_INVALID'));
                return;
            }
            if (typeof obj.gateway !== 'string' || obj.gateway.length === 0 || obj.gateway === '0.0.0.0') {
                ui.errorMessage(tr('ERR_GATEWAY_REQUIRED'));
                return;
            }
            else if (!fnValidateIP(obj.gateway)) {
                ui.errorMessage(tr('ERR_GATEWAY_INVALID'));
                return;
            }
            if (obj.dns1.length !== 0 && !fnValidateIP(obj.dns1)) {
                ui.errorMessage(tr('ERR_DNS1_INVALID'));
                return;
            }
            if (obj.dns2.length !== 0 && !fnValidateIP(obj.dns2)) {
                ui.errorMessage(tr('ERR_DNS2_INVALID'));
                return;
            }
        }

        putJSONSync('/setIP', obj, (err, response) => {
            if (err) {
                ui.serviceError(err);
            } else {
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                logger.debug('IP settings saved:', response);

                // SAUVEGARDE RÉUSSIE :
                this._ipData = obj; // On synchronise notre variable locale
                this.updateDHCPBadge(obj.dhcp); // On actualise le badge sur le bouton principal
                closeOverlay(overlay); // Fermeture propre du modal
            }
        });
    }

    saveNetwork() {
        let pnl = get('divNetAdapter'), obj = ui.fromElement(pnl);

        // --- SÉCURISATION DE LA LECTURE DU TYPE DE CONNEXION ---
        // On s'assure d'avoir l'objet ethernet initié
        if (!obj.ethernet) obj.ethernet = {};

        // On force la valeur de hardwired en lisant l'état réel de la checkbox dans le DOM
        const cbHardwired = get('cbHardwired');
        if (cbHardwired) {
            obj.ethernet.hardwired = cbHardwired.checked;
        }

        const eth = obj.ethernet;

        // Si la valeur extraite est NaN, vide ou "None", on la remet proprement à -1
        if (isNaN(eth.PWRPin) || eth.PWRPin === 'None' || eth.PWRPin === '') {
            eth.PWRPin = -1;
        }

        // Calcul du connType (Sera désormais correctement >= 2 si Ethernet est sélectionné)
        obj.connType = eth.hardwired ? (eth.wirelessFallback ? 3 : 2) : 1;

        // --- LOGIQUE DE SHUNT POUR LE BOITIER OFFICIEL BOX-ETH ---
        const container = get('divContainer');
        const isBOXEth = container && container.getAttribute('data-hardwareprofile') === 'BOX-ETH';

        if (isBOXEth) {
            // Si c'est le boîtier Ethernet, on applique directement sans afficher l'avertissement
            this.sendNetworkSettings(obj);
            return;
        }

        if (obj.connType >= 2) {
            const [board, phy, clk] = [
                this.ethBoardTypes.find(e => eth.boardType === e.val),
                this.ethPhyTypes.find(e => eth.phyType === e.val),
                this.ethClockModes.find(e => eth.CLKMode === e.val)
            ];

            let boardLabel = board ? board.label : tr("MANUAL_SETTINGS");
            let boardVal = board ? board.val : 0;
            let phyLabel = phy ? phy.label : '---';
            let phyVal = phy ? phy.val : 0;
            let clkLabel = clk ? clk.label : '---';
            let clkVal = clk ? clk.val : 0;

            let div = document.createElement('div');
            div.className = 'inst-overlay';
            div.innerHTML = `
            <div class="instructions-content">
            ${overlayHeader('ETH_SETTINGS_TITLE', 'ETH_SETTINGS_DESC', 'svg-ethernet')}
            <div class="overlay-scroll-content">

            <div class="uniblocCol"><p>${tr("ETH_SETTINGS_WARNING_DESC_1")}</p></div>
            <div class="blocEthBoardSettings">
            <div>
            <div class="eth-setting-line"><label>${tr("ETH_SETTINGS_BOARD_TYPE")}</label><span>${boardLabel} [${boardVal}]</span></div>
            <div class="eth-setting-line"><label>${tr("ETH_SETTINGS_PHY_TYPE")}</label><span>${phyLabel} [${phyVal}]</span></div>
            <div class="eth-setting-line"><label>${tr("ETH_SETTINGS_PHY_ADDRESS")}</label><span>${eth.phyAddress ?? 0}</span></div>
            <div class="eth-setting-line"><label>${tr("ETH_SETTINGS_CLOCK_MODE")}</label><span>${clkLabel} [${clkVal}]</span></div>
            <div class="eth-setting-line"><label>${tr("ETH_SETTINGS_POWER_PIN")}</label><span>${(eth.PWRPin === undefined || eth.PWRPin === -1) ? tr("NONE") : eth.PWRPin}</span></div>
            <div class="eth-setting-line"><label>${tr("ETH_SETTINGS_MDC_PIN")}</label><span>${eth.MDCPin ?? 0}</span></div>
            <div class="eth-setting-line"><label>${tr("ETH_SETTINGS_MDIO_PIN")}</label><span>${eth.MDIOPin ?? 0}</span></div>
            </div>
            </div>
            <div class="error">
            <label class="safety-checkbox-container">
            <div><input type="checkbox" id="chkConfirmEth"><span class="custom-checkbox"></span></div>
            <div><b>${tr('MSG_DANGER')}</b> <span>${tr("ETH_SETTINGS_WARNING_DESC_2")}</span></div>
            </label>
            </div>
            </div>
            <div class="hrDivFooter-Instruc"></div>
            <div class="button-container-overlay">
            <button id="btnCancel" line type="button">${tr("BT_CANCEL_1")}</button>
            <button id="btnSaveEthernet" style="background:#ccc;cursor:not-allowed" type="button" disabled>${tr("BT_SAVE")}</button>
            </div>
            </div>
            </div>`;

            shOverlay(div);

            const chk = div.querySelector('#chkConfirmEth'), btn = div.querySelector('#btnSaveEthernet');
            chk.onchange = () => {
                const ok = chk.checked;
                btn.disabled = !ok;
                btn.style.background = ok ? "var(--color-text-warning)" : "#ccc";
                btn.style.cursor = ok ? "pointer" : "not-allowed";
            };
            btn.onclick = () => { this.sendNetworkSettings(obj); closeOverlay(div); };
            div.querySelector('#btnCancel').onclick = () => closeOverlay(div);
        } else {
            this.sendNetworkSettings(obj);
        }
    }
    sendNetworkSettings(obj) {
        putJSONSync('/setNetwork', obj, (err, response) => {
            if (err) {
                ui.serviceError(err);
            } else {
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                logger.debug("Network settings updated:", response);
                clearDirty();
            }
        });
    }



    procWifiStrength(strength) {
        if (!strength) return;

        const ssid = strength.ssid || strength.name;
        const sVal = parseInt(strength.strength);
        const elSSID = get('spanNetworkSSID');
        const elChan = get('spanNetworkChannel');
        const elStrength = get('spanNetworkStrength');
        const elSvgCont = get('divWiFiStrength'); // On récupère le conteneur du SVG

        if (elSSID) elSSID.innerHTML = !ssid || ssid === '' ? '-------------' : ssid;
        if (elChan) elChan.innerHTML = isNaN(strength.channel) || strength.channel < 0 ? '--' : strength.channel;
        if (elStrength) elStrength.innerHTML = isNaN(sVal) || sVal <= -100 ? '----' : sVal;

        let level = (isNaN(sVal) || sVal >= 0 || sVal <= -100) ? -1 : this.calcWaveStrength(sVal);
        if (level >= 3) level = 3;

        // 1. Mise à jour des vagues SVG (Actives vs Inactives)
        for (let i = 0; i <= 3; i++) {
            const part = get('wifi_' + i);
            if (part) {
                if (i <= level) {
                    part.classList.add('active');
                } else {
                    part.classList.remove('active');
                }
            }
        }

        // 2. --- GESTION DYNAMIQUE DES COULEURS (dBm & SVG) ---
        if (elStrength && elSvgCont) {
            // On nettoie d'abord les anciennes classes de couleur
            const classes = ['sig-good', 'sig-medium', 'sig-bad'];
            elStrength.classList.remove(...classes);
            elSvgCont.classList.remove(...classes);

            if (!isNaN(sVal) && sVal < 0 && sVal > -100) {
                // Excellent / Bon signal (Niveau 2 et 3) : sVal > -70 dBm
                if (level >= 2) {
                    elStrength.classList.add('sig-good');
                    elSvgCont.classList.add('sig-good');
                }
                // Signal moyen (Niveau 1) : sVal entre -70 et -80 dBm
                else if (level === 1) {
                    elStrength.classList.add('sig-medium');
                    elSvgCont.classList.add('sig-medium');
                }
                // Signal mauvais (Niveau 0 ou -1) : sVal <= -80 dBm
                else {
                    elStrength.classList.add('sig-bad');
                    elSvgCont.classList.add('sig-bad');
                }
            }
        }
    }
    procEthernet(ethernet) {
        logger.debug('Ethernet status:', ethernet);
        const spanStatus = get('spanEthernetStatus');
        const divStatus = get('divEthernetStatus');
        const divWifi = get('divWiFiStrength');
        const spanSpeedVal = get('spanEthernetSpeedVal');
        const spanSpeedDetails = get('spanEthernetSpeedDetails');

        const isConnected = ethernet.connected;

        // 1. Affichage des blocs principaux
        // 1. Affichage des blocs principaux (Sécurisé !)
        if (divStatus) divStatus.style.display = isConnected ? '' : 'none';
        if (divWifi) divWifi.style.display = isConnected ? 'none' : '';

        spanStatus.innerHTML = isConnected ? 'Connected' : 'Disconnected';
        spanStatus.style.color = isConnected ? 'var(--color-signal-good)' : '';

        // 3. Gestion dynamique des couleurs (Icône & Vitesse)
        if (isConnected) {
            // L'icône générale de la ligne Ethernet s'allume en vert
            divStatus.classList.add('sig-good');
            divStatus.classList.remove('sig-bad');

            const speed = parseInt(ethernet.speed);

            // Affichage de la vitesse et de son mode duplex
            spanSpeedVal.innerHTML = isNaN(speed) ? '--' : speed;
            spanSpeedDetails.innerHTML = ` Mbps ${ethernet.fullduplex ? 'Full-duplex' : 'Half-duplex'}`;

            // Nettoyage des anciennes classes sur la valeur numérique
            spanSpeedVal.classList.remove('sig-good', 'sig-medium');

            // Attribution de la couleur selon la vitesse négociée
            if (!isNaN(speed) && speed >= 100) {
                spanSpeedVal.classList.add('sig-good'); // Vert si >= 100 Mbps
            } else {
                spanSpeedVal.classList.add('sig-medium'); // Orange si 10 Mbps ou moins
            }
        } else {
            // Si déconnecté, on remet à zéro et l'icône repasse en neutre/gris
            divStatus.classList.remove('sig-good', 'sig-bad');
            spanSpeedVal.innerHTML = '--';
            spanSpeedDetails.innerHTML = '';
            spanSpeedVal.classList.remove('sig-good', 'sig-medium');
        }
    }
}
var wifi = new Wifi();
class Somfy {
    initialized = false;
    frames = [];
    isScanClosing = false;
    scanObserver = null;
    shadeTypes = [
        { type: 0, name: 'Roller Shade', ico: 'svg-window-shade', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 1, name: 'Blind', ico: 'svg-window-blind', lift: true, tilt: true, sun: true, fcmd: true, fpos: true },
        { type: 2, name: 'Drapery (left)', ico: 'svg-ldrapery', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 3, name: 'Awning', ico: 'svg-awning', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 4, name: 'Shutter', ico: 'svg-shutter', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 5, name: 'Garage (1-button)', ico: 'svg-garage', lift: true, light: true, fpos: true },
        { type: 6, name: 'Garage (3-button)', ico: 'svg-garage', lift: true, light: true, fcmd: true, fpos: true },
        { type: 7, name: 'Drapery (right)', ico: 'svg-rdrapery', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 8, name: 'Drapery (center)', ico: 'svg-cdrapery', lift: true, sun: true, fcmd: true, fpos: true },
        { type: 9, name: 'Dry Contact (1-button)', ico: 'svg-contactBulb', fpos: true },
        { type: 10, name: 'Dry Contact (2-button)', ico: 'svg-contactBulb', fcmd: true, fpos: true },
        { type: 11, name: 'Gate (left)', ico: 'svg-lgate', lift: true, fcmd: true, fpos: true },
        { type: 12, name: 'Gate (center)', ico: 'svg-cgate', lift: true, fcmd: true, fpos: true },
        { type: 13, name: 'Gate (right)', ico: 'svg-rgate', lift: true, fcmd: true, fpos: true },
        { type: 14, name: 'Gate (1-button left)', ico: 'svg-lgate', lift: true, fcmd: true, fpos: true },
        { type: 15, name: 'Gate (1-button center)', ico: 'svg-cgate', lift: true, fcmd: true, fpos: true },
        { type: 16, name: 'Gate (1-button right)', ico: 'svg-rgate', lift: true, fcmd: true, fpos: true },
    ];
    radioBoardTypes = [
        { val: 0, label: 'DEFAULT', showGPIO: false },
        { val: 1, label: 'ESP32-D1 mini', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 18, CSNPin: 5, MOSIPin: 23, MISOPin: 19, TXPin: 21, RXPin: 22 } },
        { val: 2, label: 'WT32-ETH01', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 12, MOSIPin: 15, MISOPin: 4, TXPin: 2, RXPin: 35 } },
        { val: 3, label: 'Olimex ESP32-PoE/EVB', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 13, MOSIPin: 15, MISOPin: 16, TXPin: 4, RXPin: 36 } },
        { val: 4, label: 'LilyGO T-Internet POE', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 12, MOSIPin: 15, MISOPin: 16, TXPin: 4, RXPin: 35 } },
        { val: 5, label: 'wESP POE', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 18, CSNPin: 5, MOSIPin: 13, MISOPin: 32, TXPin: 4, RXPin: 39 } },
        { val: 6, label: 'ESP-PoE-32', showGPIO: false, chips: ['esp32'], pins: { SCKPin: 14, CSNPin: 5, MOSIPin: 13, MISOPin: 32, TXPin: 4, RXPin: 35 } },
        { val: 7, label: 'ESP32s3 Mini', showGPIO: false, chips: ['s3'], pins: { SCKPin: 7, CSNPin: 6, MOSIPin: 9, MISOPin: 8, TXPin: 3, RXPin: 4 } },
        { val: 8, label: 'XIAO-ESP32-C3', showGPIO: false, chips: ['c3'], pins: { SCKPin: 8, CSNPin: 6, MOSIPin: 10, MISOPin: 9, TXPin: 3, RXPin: 4 } },
        { val: 255, label: 'MANUAL_SETTINGS', showGPIO: true }
    ];
    init() {
        if (this.initialized) return;
        initEasterEggToggle('#divTransceiverSettings .main-headerTitle', 'show-expert-gpio', 5);
        this.initialized = true;
    }
    initPins() {
        document
        .getElementById('selRadioBoardType')
        .addEventListener('change', e => this.onRadioBoardTypeChanged(e.target));

        const sel = get('selRadioBoardType');

        sel.addEventListener('change', e => this.onRadioBoardTypeChanged(e.target));

        this.loadPins('inout', get('selTransSCKPin'));
        this.loadPins('inout', get('selTransCSNPin'));
        this.loadPins('inout', get('selTransMOSIPin'));
        this.loadPins('input', get('selTransMISOPin'));
        this.loadPins('out', get('selTransTXPin'));
        this.loadPins('input', get('selTransRXPin'));

        ui.toElement(get('divTransceiverSettings'), {
            transceiver: { config: { proto: 0, radioBoardType: 0, SCKPin: 18, CSNPin: 5, MOSIPin: 23, MISOPin: 19, TXPin: 13, RXPin: 12, frequency: 433.42, rxBandwidth: 97.96, type: 56, deviation: 11.43, txPower: 10, enabled: false } }
        });

        this.loadPins('out', get('selShadeGPIOUp'));
        this.loadPins('out', get('selShadeGPIODown'));
        this.loadPins('out', get('selShadeGPIOMy'));
        this.loadRadioBoardTypes(get('selRadioBoardType'));
        this.loadRadioBoardTypes(sel);
        this.onRadioBoardTypeChanged(sel);
    }
    loadRadioBoardTypes(sel) {
        while (sel.firstChild) sel.removeChild(sel.firstChild);

        let rawCm = get('divContainer').getAttribute('data-chipmodel') || "";
        let cm = rawCm.toLowerCase().trim();

        if (cm.includes("s3")) cm = "s3";
        else if (cm.includes("c3")) cm = "c3";
        else if (cm.includes("s2")) cm = "s2";
        else cm = "esp32";

        this.radioBoardTypes.forEach(t => {
            if (t.chips && !t.chips.includes(cm)) {
                return;
            }

            // AJUSTEMENT DYNAMIQUE DU NOM POUR L'OPTION PAR DÉFAUT
            let labelKey = t.label;
            if (t.val === 0 && labelKey === 'DEFAULT') {
                labelKey = `BOARD_DEFAULT_${cm.toUpperCase()}`; // Génère BOARD_DEFAULT_ESP32, BOARD_DEFAULT_S3, etc.
            }

            const labelText = tr(labelKey);
            sel.options.add(new Option(labelText, t.val));
        });
    }
    onRadioBoardTypeChanged(sel, isInit = false) {
        const val = parseInt(sel.value, 10),
        cm = (get('divContainer').getAttribute('data-chipmodel') || "").toLowerCase(),
        divS = get('divGPIOSummary'),
        divG = get('divShowGpio'),
        pk = ['SCKPin', 'CSNPin', 'MOSIPin', 'MISOPin', 'TXPin', 'RXPin'],
        isM = (val === 255),
        board = this.radioBoardTypes.find(t => t.val === val);

        let def = { SCKPin: 18, CSNPin: 5, MOSIPin: 23, MISOPin: 19, TXPin: 13, RXPin: 12 };
        if (cm === "s3") def = { SCKPin: 12, CSNPin: 10, MOSIPin: 11, MISOPin: 13, TXPin: 15, RXPin: 14 };
        else if (cm === "s2") def = { SCKPin: 36, CSNPin: 34, MOSIPin: 35, MISOPin: 37, TXPin: 15, RXPin: 14 };
        else if (cm === "c3") def = { SCKPin: 15, CSNPin: 14, MOSIPin: 16, MISOPin: 17, TXPin: 13, RXPin: 12 };

        const target = val === 0 ? def : (board?.pins || null);

        if (target) {
            const labels = ['SCK:', 'CSN:', 'MOSI:', 'MISO:', 'TX:', 'RX:'];
            let html = `<div class="gpioRadio-container"><div class="help-container" onclick="toggleTooltip(this)"><svg class="help-svg"><use href=#icon-question></use></svg><div class="tooltip-text"><b>${tr('RADIO_TOOLTIP_GPIO_0')}</b><br><br>${tr('RADIO_TOOLTIP_GPIO_1')}<br>${tr('RADIO_TOOLTIP_GPIO_2')}<br><br><i>${tr('RADIO_TOOLTIP_GPIO_3')}</i><br><br></div></div>`;

            pk.forEach((k, i) => {
                const v = target[k], selP = get(`selTrans${k}`), inpP = get(`inputTrans${k}`);
                if (selP) {
                    if (![...selP.options].some(o => parseInt(o.value, 10) === v)) {
                        selP.options.add(new Option(`GPIO-${v < 10 ? '0' + v : v}`, v));
                    }
                    selP.value = v;
                }
                if (inpP) inpP.value = v;
                html += `<div class="gpioRadio-item"><span class="gpioRadio-label">${labels[i]}</span><span class="gpioRadio-val">GPIO${v}</span></div>${i < 5 ? `<div class="gpioRadio-sep${i === 2 ? ' gpioRadioSep' : ''}">|</div>` : ''}`;
            });
            divS.innerHTML = html + `</div>`;
        }

        pk.forEach(k => {
            const selP = get(`selTrans${k}`), inpP = get(`inputTrans${k}`);
            if (selP) selP.style.display = target ? 'inline-block' : 'none';
            if (inpP) {
                if (isM) inpP.value = (isInit && parseInt(selP?.value || inpP.value, 10)) || def[k];
                inpP.style.display = isM ? 'inline-block' : 'none';
            }
        });

        get('divManualSafety').style.display = isM ? 'block' : 'none';
        divS.style.display = target ? 'block' : 'none';
        divG.style.display = target ? 'none' : 'inline-block';
    }

    setRadioEnabled(isEnabled) {
        const txtStatus = get('divRadioEnableStatus');
        const radioTab = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]');
        const isActuallyEnabled = radioTab && !radioTab.classList.contains('radio-error');

        if (txtStatus) {
            if (isEnabled === isActuallyEnabled) {
                txtStatus.textContent = isEnabled ? tr('RADIO_ENABLED') : tr('RADIO_DISABLED');
            } else {
                txtStatus.textContent = tr('RADIO_SAVE_REQUIRED');
            }
        }
    }



    async loadSomfy() {
        //console.trace("Appel à loadSomfy");
        getJSONSync('/controller', (err, somfy) => {
            if (err) {
                logger.error('Failed to load Somfy controller data:', err);
                ui.serviceError(err);
            } else {
                logger.debug('Somfy controller data loaded');
                const spanMaxRooms = get('spanMaxRooms');
                const spanMaxShades = get('spanMaxShades');
                const spanMaxGroups = get('spanMaxGroups');

                if (spanMaxRooms)  spanMaxRooms.innerText = (somfy.maxRooms - 2);
                if (spanMaxShades) spanMaxShades.innerText = (somfy.maxShades - 2);
                if (spanMaxGroups) spanMaxGroups.innerText = (somfy.maxGroups - 2);

                ui.toElement(get('divTransceiverSettings'), somfy);

                if (typeof this.updateRadioGraph === 'function') {
                    this.updateRadioGraph();
                }

                const selBoard = get('selRadioBoardType');
                if (selBoard) {
                    this.loadRadioBoardTypes(selBoard);
                }

                if (somfy.transceiver && somfy.transceiver.config) {
                    if (selBoard) selBoard.value = somfy.transceiver.config.radioBoardType || 0;
                    this.onRadioBoardTypeChanged(selBoard, true);
                }

                // --- NOUVELLE LOGIQUE INITIALISATION DU SWITCH RADIO (CHECKBOX) ---
                const cbEnableRadio = get('cbEnableRadio');
                const row = get('divRadioEnableColor');
                const radioTab = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]');

                // On initialise l'état de la checkbox suivant la configuration reçue
                const isConfigEnabled = !!(somfy.transceiver && somfy.transceiver.config && somfy.transceiver.config.enabled);
                if (cbEnableRadio) {
                    cbEnableRadio.checked = isConfigEnabled;
                }

                const isRadioInit = somfy.transceiver?.config?.radioInit;
                const sideNote = get('barsideRadioDisable');
                if (radioTab) {
                    radioTab.classList.toggle('radio-error', !isRadioInit);
                    if (sideNote) sideNote.style.display = isRadioInit ? 'none' : 'inline';
                    if (row) row.classList.toggle('radioOn', !!isRadioInit);
                }

                // Met à jour l'affichage du texte d'état
                this.setRadioEnabled(isConfigEnabled);
                // -------------------------------------------------------------------
                watchDirty(get('divTransceiverSettings'));

                this.setRoomsList(somfy.rooms);
                this.setShadesList(somfy.shades);
                this.setGroupsList(somfy.groups);
                this.setRepeaterList(somfy.repeaters);
                this.setScheduleList(somfy.schedules);
                if (typeof somfy.version !== 'undefined') {
                    firmware.procFwStatus(somfy.version);
                }
            }
        });
    }
    stepGpio(pinKey, direction) {
        const newValue = stepDeviceGpio(pinKey, direction, 'Trans', 'selRadioBoardType', val => val === 255, this.pinMaps);
        if (newValue === undefined) return;

        const targetLabel = pinKey.replace('Pin', '').toUpperCase() + ':';
        document.querySelectorAll('#divGPIOSummary .gpioRadio-label').forEach(lbl => {
            const text = lbl.textContent.trim();
            if (text === targetLabel || (targetLabel === 'SCK:' && text === 'SCLK:')) {
                const valSpan = lbl.nextElementSibling;
                if (valSpan && valSpan.classList.contains('gpioRadio-val')) valSpan.textContent = `GPIO${newValue}`;
            }
        });
    }
    saveRadio() {
        let valid = true;
        const d = get('divTransceiverSettings'),
        t = ui.fromElement(d).transceiver,
        pk = ['SCKPin', 'CSNPin', 'MOSIPin', 'MISOPin', 'TXPin', 'RXPin'],
        bv = parseInt(get('selRadioBoardType').value, 10),
        isM = (bv === 255);

        if (!t.config) t.config = {};
        t.config.radioBoardType = bv;

        if (isM && !get('cbManualSafety')?.checked) {
            return ui.errorMessage(d, tr('ERR_RADIO_SAFETY_REQUIRED'));
        }

        pk.forEach(k => {
            const el = get((isM ? 'inputTrans' : 'selTrans') + k);
            if (el) t.config[k] = parseInt(el.value, 10);
        });

            if (!t.config.type || t.config.type === 'none') {
                ui.errorMessage(d, tr('ERR_RADIO_TYPE_REQUIRED'));
                valid = false;
            }

            if (valid) {
                const cm = (get('divContainer').getAttribute('data-chipmodel') || "").toLowerCase(),
                pm = this.pinMaps.find(x => x.name === cm) || { maxPins: 39 };

                try {
                    for (const k of pk) {
                        const v = t.config[k];
                        if (v === undefined || isNaN(v)) {
                            ui.errorMessage(d, tr('ERR_RADIO_PINS_REQUIRED'));
                            valid = false; break;
                        }
                        if (v < 0 || v > pm.maxPins) {
                            ui.errorMessage(d, tr('ERR_GPIO_NOT_EXIST').replace('{pin}', v).replace('{maxPins}', pm.maxPins));
                            valid = false; break;
                        }
                        for (let s in t.config) {
                            if (s.endsWith('Pin') && s !== k && t.config[s] === v) {
                                if ((k === 'TXPin' && s === 'RXPin') || (k === 'RXPin' && s === 'TXPin')) continue;
                                ui.errorMessage(d, tr('ERR_GPIO_PIN_DUPLICATED').replace('%1', k.replace('Pin', '')).replace('%2', s.replace('Pin', '')));
                                valid = false; break;
                            }
                        }
                        if (!valid) break;
                    }
                } catch (err) {
                    logger.error('Radio settings validation error:', err);
                    valid = false;
                }
            }

            if (!valid) return;

            const proceedSave = () => {
                putJSONSync('/saveRadio', t, (err, res) => {
                    if (err) return ui.serviceError(err);

                    ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                    clearDirty();
                    get('btnSaveRadio').classList.remove('disabled');

                    const init = res.config.radioInit,
                    tab = document.querySelector('.tab-container span[data-grpid="divRadioSettings"]'),
                            sn = get('barsideRadioDisable'),
                            cb = get('cbEnableRadio');

                            if (tab) {
                                tab.classList.toggle('radio-error', !init);
                                if (sn) sn.style.display = init ? 'none' : 'inline';
                                get('divRadioEnableColor').classList.toggle('radioOn', !!init);
                            }

                            // Comparaison simple et directe avec l'état de la checkbox d'origine
                            if (cb) {
                                get('divRadioEnableStatus').textContent = tr(cb.checked === init ? (cb.checked ? 'RADIO_ENABLED' : 'RADIO_DISABLED') : 'RADIO_SAVE_REQUIRED');
                            }
                });
            };

            if (isM) {
                let prompt = ui.promptMessage(get('divContainer'), tr('PROMPT_RADIO_MANUAL_TITLE'), () => {
                    proceedSave();
                });
                prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_RADIO_MANUAL_WARNING")}</p>`;
            } else {
                proceedSave();
            }
    }
    pinMaps = [
        { name: '', maxPins: 39, inputs: [0, 1, 6, 7, 8, 9, 10, 11, 37, 38], outputs: [3, 6, 7, 8, 9, 10, 11, 34, 35, 36, 37, 38, 39] },
        { name: 's2', maxPins: 46, inputs: [0, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 45], outputs: [0, 19, 20, 26, 27, 28, 29, 30, 31, 32, 45, 46]},
        { name: 's3', maxPins: 48, inputs: [19, 20, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32], outputs: [19, 20, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32] },
        { name: 'c3', maxPins: 21, inputs: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], outputs: [11, 12, 13, 14, 15, 16, 17, 21] }
    ];
    loadPins(type, sel, opt) {
        if (!sel) return;
        let currentVal = (typeof opt !== 'undefined') ? opt : parseInt(sel.value, 10);
        while (sel.firstChild) sel.removeChild(sel.firstChild);

        let cm = get('divContainer').getAttribute('data-chipmodel');
        let pm = this.pinMaps.find(x => x.name === cm);
        if (!pm) {
            pm = { name: '', maxPins: 39, inputs: [0, 1, 6, 7, 8, 9, 10, 11, 37, 38], outputs: [3, 6, 7, 8, 9, 10, 11, 34, 35, 36, 37, 38, 39] };
        }

        for (let i = 0; i <= pm.maxPins; i++) {
            if (type.includes('in') && pm.inputs.includes(i)) continue;
            if (type.includes('out') && pm.outputs.includes(i)) continue;

            sel.options[sel.options.length] = new Option(
                `GPIO-${i > 9 ? i.toString() : '0' + i.toString()}`,
                                                         i
            );
        }
        if (!isNaN(currentVal)) {
            sel.value = currentVal;
        }
    }
    procFrequencyScan(scan) {
        // console.log(scan);
        let div = this.scanFrequency();
        let spanTestFreq = get('spanTestFreq');
        let spanTestRSSI = get('spanTestRSSI');
        let spanBestFreq = get('spanBestFreq');
        let spanBestRSSI = get('spanBestRSSI');

        if (spanBestFreq) {
            spanBestFreq.innerHTML = scan.RSSI !== -100 ? scan.frequency.fmt('###.00') : '----';
        }
        if (spanBestRSSI) {
            const bestRSSIVal = scan.RSSI !== -100 ? scan.RSSI : '----';
            spanBestRSSI.innerHTML = bestRSSIVal;

            // MÀJ dynamique de la couleur de la carte de DROITE (Optimal)
            this.updateCardState(document.querySelector('.scan-card.optimal'), bestRSSIVal);
        }
        if (spanTestFreq) {
            spanTestFreq.innerHTML = scan.testFreq.fmt('###.00');
        }
        if (spanTestRSSI) {
            const testRSSIVal = scan.testRSSI !== -100 ? scan.testRSSI : '----';
            spanTestRSSI.innerHTML = testRSSIVal;

            // MÀJ dynamique de la couleur de la carte de GAUCHE (Balayage actuel)
            this.updateCardState(document.querySelector('.scan-card:not(.optimal)'), testRSSIVal);

            // L'ancien graphique en barres/lignes verticales (si tu le gardes)
            if (this.rssiGraphWave) {
                this.rssiGraphWave.update(scan.testRSSI);
            }

            // --- C'EST ICI QU'ON AJOUTE TON NOUVEAU GRAPHIQUE SPECTRE SWEEP ---
            if (this.rssiGraphSignal) {
                this.rssiGraphSignal.update(scan.testRSSI, scan.testFreq);
            }
        }
        if (scan.RSSI !== -100)
            div.setAttribute('data-frequency', scan.frequency);
    }

    // Fonction générique ultra propre pour appliquer les états aux cartes
    updateCardState(cardElement, rssiVal) {
        if (!cardElement) return;

        // On nettoie les anciennes classes
        cardElement.classList.remove('state-success', 'state-warning', 'state-error');

        const v = parseInt(rssiVal);
        if (isNaN(v) || rssiVal === '----') return; // Style neutre d'origine si vide

        // Application des paliers de couleur (-30 à -60 / -60 à -90 / -90 et moins)
        if (v >= -60) {
            cardElement.classList.add('state-success');
        } else if (v < -60 && v >= -90) {
            cardElement.classList.add('state-warning');
        } else {
            cardElement.classList.add('state-error');
        }
    }
    scanFrequency(initScan) {
        if (this.isScanClosing) return;
        let div = get('divScanFrequency');

        if (!div) {
            div = document.createElement('div');
            div.id = 'divScanFrequency';
            div.className = 'inst-overlay';

            // Récupération du mode sauvegardé : 'wave', 'bar' ou 'none'
            const savedMode = localStorage.getItem('espsomfy_graph_mode') || 'wave';

            div.innerHTML = `
            <div class="instructions-content">




            ${overlayHeader('SCANFREQ_TITLE', 'SCANFREQ_DESC', 'svg-tabRadio', false)}
            <div class="overlay-scroll-content">



            <div class="information-text scanInfo">
            </span>${tr('SCANFREQ_SCAN_DESC')}</span>
            </div>


            <div class="scan-cards">
            <div class="scan-card">
            <div class="labelMAJ">${tr("SCANFREQ_SCAN")}</div>
            <div class="scan-card-content">
            <div class="scan-card-icon">
            <svg><use href="#svg-search"></use></svg>
            </div>
            <div class="scan-card-info">
            <div class="scan-card-main">
            <span id="spanTestFreq">433.14</span>
            <small>${tr("MHZ")}</small>
            </div>
            <div class="scan-card-rssi-row">
            <span class="rssi-label">RSSI:</span>
            <strong id="spanTestRSSI" class="rssi-value">----</strong>
            <small class="rssi-unit">${tr("DBM")}</small>
            </div>
            </div>
            </div>
            </div>

            <div class="scan-card optimal">
            <div class="labelMAJ">${tr("SCANFREQ_FREQUENCY")}</div>
            <div class="scan-card-content">
            <div class="scan-card-icon target">
            <svg><use href="#svg-target"></use></svg>
            </div>
            <div class="scan-card-info">
            <div class="scan-card-main best">
            <span id="spanBestFreq">---.--</span>
            <small>${tr("MHZ")}</small>
            </div>
            <div class="scan-card-rssi-row best">
            <span class="rssi-label">RSSI:</span>
            <strong id="spanBestRSSI" class="rssi-value">----</strong>
            <small class="rssi-unit">${tr("DBM")}</small>
            </div>
            </div>
            </div>
            </div>
            </div>

            <div class="scan-dashboard-bloc">
            <div class="graph-dropdown-container">
            <button id="btnGraphDropdown" type="button" class="btn-dashboard-action" title="Type d'affichage">
            <svg><use href="#svg-menu"></use></svg>
            </button>

            <div id="graphDropdownMenu" class="graph-dropdown-menu">
            <div class="dropdown-item ${savedMode === 'wave' ? 'active' : ''}" data-mode="wave">
            <svg><use href="#svg-wave"></use></svg> Wave
            </div>

            <div class="dropdown-item ${savedMode === 'signal' ? 'active' : ''}" data-mode="signal">
            <svg><use href="#svg-signal"></use></svg> Signal
            </div>

            <div class="dropdown-item ${savedMode === 'none' ? 'active' : ''}" data-mode="none">
            <svg><use href="#svg-placeholder"></use></svg> Désactiver
            </div>
            </div>
            </div>

            <div class="dashboard-main-action">
            <div id="scanStatusText" class="scan-status-waiting-text">
            <span class="spinner-inline"></span>${tr('CONNEXION_SCANNING')}
            </div>

            <div id="scanStatusResult" class="scan-status-result-text" style="display:none">
            <span>${tr('SCANFREQ_NO_SIGNAL')}</span>
            </div>

            <button id="btnCopyFrequency" type="button" class="btn-scan-main" style="display:none" onclick="somfy.setScannedFrequency()">
            <svg class="icon-btn"><use href="#svg-download"></use></svg>
            ${tr("BT_COPY_FREQUENCY")}
            </button>
            </div>

            <div class="dashboard-controls-right"></div>
            </div>

            <div class="graph-zone-wrapper">
            <div id="graphCanvasContainer" class="uniblocrRssiCanvas" data-active-mode="${savedMode}" style="${savedMode === 'none' ? 'display:none;' : ''}">
            <canvas id="rssiWave" style="display: ${savedMode === 'wave' ? 'block' : 'none'}; width:100%; height:100%;"></canvas>
            <canvas id="rssiSignal" style="display: ${savedMode === 'signal' ? 'block' : 'none'}; width:100%; height:100%;"></canvas>
            </div>
            </div>

            <details class="uniblocCol scanfreq-help-accordion">
            <summary class="scanfreq-help-trigger">
            <div class="scanfreq-title-wrapper">
            <svg class="help-svg"><use href="#icon-question"></use></svg>
            <span>${tr('SCANFREQ_UNDERSTANDING_RSSI')}</span>
            </div>
            <svg class="accordion-arrow"><use href="#svg-arrowDown"></use></svg>
            </summary>

            <div class="rssi-scale-container">
            <div class="rssi-scale-zone zone-success">
            <div class="rssi-zone-header">
            <span class="rssi-badge">
            <svg class="icon-inline"><use href="#svg-succes"></use></svg>
            ${tr('SCANFREQ_RSSI_EXCELLENT')}
            </span>
            </div>
            <p class="rssi-zone-desc">${tr('SCANFREQ_RSSI_EXCELLENT_DESC')}</p>
            <div class="rssi-visual-bar bar-success">
            <span></span><span></span><span></span><span></span><span></span><span class="off"></span><span class="off"></span>
            </div>
            </div>

            <div class="rssi-scale-zone zone-warning">
            <div class="rssi-zone-header">
            <span class="rssi-badge">
            <svg class="icon-inline"><use href="#svg-warning"></use></svg>
            ${tr('SCANFREQ_RSSI_WEAK')}
            </span>
            </div>
            <p class="rssi-zone-desc">${tr('SCANFREQ_RSSI_WEAK_DESC')}</p>
            <div class="rssi-visual-bar bar-warning">
            <span></span><span></span><span></span><span class="off"></span><span class="off"></span><span class="off"></span><span class="off"></span>
            </div>
            </div>

            <div class="rssi-scale-zone zone-error">
            <div class="rssi-zone-header">
            <span class="rssi-badge">
            <svg class="icon-inline"><use href="#svg-error"></use></svg>
            ${tr('SCANFREQ_RSSI_NOISE')}
            </span>
            </div>
            <p class="rssi-zone-desc">${tr('SCANFREQ_RSSI_NOISE_DESC')}</p>
            <div class="rssi-visual-bar bar-error">
            <span></span><span class="off"></span><span class="off"></span><span class="off"></span><span class="off"></span><span class="off"></span><span class="off"></span>
            </div>
            </div>
            </div>
            </details>
            </div>

            <div class="hrDivFooter-Instruc"></div>

            <div class="button-container-overlay footer-controls-row">
            <button id="btnCloseScanning" type="button" line class="btn-scan-action btn-secondary">${tr("BT_CLOSE")}</button>

            <button id="btnRestartScanning" type="button" class="btn-scan-action btn-success" style="display:none" onclick="somfy.scanFrequency(true)" title="${tr('BT_START_SCAN')}">
            <svg class="icon-btn"><use href="#svg-play"></use></svg>
            <span>Démarrer</span>
            </button>
            <button id="btnStopScanning" type="button" class="btn-scan-action btn-danger" onclick="somfy.stopScanningFrequency(true)" title="${tr('BT_STOP_SCAN')}">
            <svg class="icon-btn"><use href="#svg-stop"></use></svg>
            <span>Arrêter</span>
            </button>

            </div>
            </div>`;

            shOverlay(div);
            div.querySelector('#btnCloseScanning').onclick = () => closeOverlay(div);

            if (this.scanObserver) this.scanObserver.disconnect();
            this.scanObserver = new MutationObserver(() => { if (!get('divScanFrequency')) this.terminateScanUI(true); });
            this.scanObserver.observe(get('divContainer'), { childList: true });

            const dropBtn = div.querySelector('#btnGraphDropdown');
            const dropMenu = div.querySelector('#graphDropdownMenu');

            dropBtn.onclick = (e) => {
                e.stopPropagation();
                dropMenu.classList.toggle('show');
            };

            document.addEventListener('click', () => {
                if (dropMenu) dropMenu.classList.remove('show');
            }, { once: false });

                dropMenu.querySelectorAll('.dropdown-item').forEach(item => {
                    item.onclick = (e) => {
                        const selectedMode = item.getAttribute('data-mode');
                        localStorage.setItem('espsomfy_graph_mode', selectedMode);

                        dropMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');

                        const container = get('graphCanvasContainer');
                        if (container) {
                            container.setAttribute('data-active-mode', selectedMode);
                            container.style.display = selectedMode === 'none' ? 'none' : '';
                            get('rssiWave').style.display = selectedMode === 'wave' ? 'block' : 'none';
                            get('rssiSignal').style.display = selectedMode === 'signal' ? 'block' : 'none';
                        }
                    };
                });

                this.rssiGraphWave = {
                    points: [],
                    maxPoints: 80,
                    canvas: get('rssiWave'),
                    freqMin: 433.00,
                    freqMax: 434.00,
                    currentIdx: 0,
                    optimalFreq: null,

                    reset() {
                        this.currentIdx = 0;
                        this.optimalFreq = null;
                        this.points = Array(this.maxPoints).fill(-110);
                    },


                    update(val, currentFreq, isStopped = false, bestFreq = null) {
                        const c = this.canvas;
                        if (!c || c.style.display === 'none') return;

                        // --- SÉCURISATION ET FORCE DE LA VRAIE FRÉQUENCE ---
                        currentFreq = get('spanTestFreq') ? get('spanTestFreq').innerText : currentFreq;

                        const ctx = c.getContext('2d');
                        const dpr = window.devicePixelRatio || 1;
                        const displayW = c.clientWidth;
                        const displayH = c.clientHeight;

                        c.width = displayW * dpr;
                        c.height = displayH * dpr;
                        ctx.scale(dpr, dpr);

                        if (this.points.length === 0) {
                            this.points = Array(this.maxPoints).fill(-110);
                        }
                        if (bestFreq) this.optimalFreq = parseFloat(bestFreq);

                        let v = parseInt(val);
                        if (isNaN(v) || v < -110) v = -110;
                        if (v > -30) v = -30;
                        // Extraction numérique de la fréquence (ex: "433.48" -> 433.48)
                        let freq = NaN;
                        if (currentFreq !== undefined && currentFreq !== null) {
                            let cleanFreq = String(currentFreq).replace(/[^0-9.]/g, '');
                            freq = parseFloat(cleanFreq);
                        }
                        // --- PLACEMENT GÉOGRAPHIQUE DU CURSEUR (0% à 100%) ---
                        if (!isNaN(freq) && freq >= this.freqMin && freq <= this.freqMax) {
                            let pct = (freq - this.freqMin) / (this.freqMax - this.freqMin);

                            // Calcule l'index exact de gauche (0) à droite (79)
                            this.currentIdx = Math.floor(pct * (this.maxPoints - 1));
                            if (this.currentIdx < 0) this.currentIdx = 0;
                            if (this.currentIdx >= this.maxPoints) this.currentIdx = this.maxPoints - 1;
                        } else if (!isStopped) {
                            // Au cas où l'affichage repasse temporairement à vide pendant le scan
                            this.currentIdx = (this.currentIdx + 1) % this.maxPoints;
                        }

                        // Stockage du RSSI au bon endroit sur la courbe
                        if (!isStopped) {
                            this.points[this.currentIdx] = v;
                        }

                        ctx.clearRect(0, 0, displayW, displayH);

                        const rootStyles = getComputedStyle(document.documentElement);
                        let accent = rootStyles.getPropertyValue('--color-accent').trim() || '#1a5fb4';
                        let subTextColor = rootStyles.getPropertyValue('--color-text-secondary').trim() || '#888888';

                        const lblW = 30;
                        const gW = displayW - lblW - 35;
                        const paddingT = 20;
                        const paddingB = 25;
                        const graphH = displayH - paddingT - paddingB;
                        const getPointY = (rssiVal) => displayH - (((rssiVal + 110) / 80) * graphH) - paddingB;
                        const getPointX = (index) => lblW + (index * (gW / (this.maxPoints - 1)));

                        // Grille dBm
                        ctx.strokeStyle = `color-mix(in srgb, ${subTextColor} 10%, transparent)`;
                        ctx.font = "9px monospace";
                        ctx.fillStyle = subTextColor;
                        ctx.lineWidth = 0.5;
                        ctx.textAlign = "left";

                        ctx.save();
                        ctx.font = "bold 9px monospace"; // Un peu plus lisible
                        ctx.fillText("dBm", 2, getPointY(-30) - 12);
                        ctx.restore();

                        [-30, -50, -70, -90, -110].forEach(lv => {
                            const y = getPointY(lv);
                            ctx.beginPath();
                            ctx.moveTo(lblW, y);
                            ctx.lineTo(lblW + gW, y);
                            ctx.stroke();
                            ctx.fillText(lv, 2, y + 3);
                        });

                        // Légende Fréquences Fixe
                        ctx.fillStyle = subTextColor;
                        ctx.font = "9px monospace";
                        ctx.textBaseline = "top";
                        const yLabel = displayH - paddingB + 6;

                        const labelsFixes = ["433.00", "433.20", "433.40", "433.60", "433.80", "434.00 MHz"];
                        labelsFixes.forEach((lbl, i) => {
                            let labelPct = i / (labelsFixes.length - 1);
                            let xLabel = lblW + (labelPct * gW);

                            if (i === labelsFixes.length - 1) {
                                ctx.textAlign = "right";
                            } else if (i === 0) {
                                ctx.textAlign = "left";
                            } else {
                                ctx.textAlign = "center";
                            }
                            ctx.fillText(lbl, xLabel, yLabel);
                        });

                        // Remplissage de la courbe
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(getPointX(0), getPointY(this.points[0]));
                        for (let i = 0; i < this.points.length - 1; i++) {
                            const x1 = getPointX(i);
                            const y1 = getPointY(this.points[i]);
                            const x2 = getPointX(i + 1);
                            const y2 = getPointY(this.points[i + 1]);
                            ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
                        }
                        ctx.lineTo(getPointX(this.points.length - 1), displayH - paddingB);
                        ctx.lineTo(getPointX(0), displayH - paddingB);
                        ctx.closePath();

                        const fillGrad = ctx.createLinearGradient(0, paddingT, 0, displayH - paddingB);
                        fillGrad.addColorStop(0, `color-mix(in srgb, ${accent} 35%, transparent)`);
                        fillGrad.addColorStop(0.7, `color-mix(in srgb, ${accent} 5%, transparent)`);
                        fillGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        ctx.fillStyle = fillGrad;
                        ctx.fill();
                        ctx.restore();

                        // Ligne Néon
                        ctx.save();
                        ctx.strokeStyle = `color-mix(in srgb, ${accent} 85%, #ffffff)`;
                        ctx.lineWidth = 2.5;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = accent;
                        ctx.beginPath();
                        ctx.moveTo(getPointX(0), getPointY(this.points[0]));
                        for (let i = 0; i < this.points.length - 1; i++) {
                            const x1 = getPointX(i);
                            const y1 = getPointY(this.points[i]);
                            const x2 = getPointX(i + 1);
                            const y2 = getPointY(this.points[i + 1]);
                            ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
                        }
                        ctx.stroke();
                        ctx.restore();

                        // Dessin du Curseur
                        let centerX = getPointX(this.currentIdx);
                        let centerY = getPointY(this.points[this.currentIdx]);
                        let lineStyle = `color-mix(in srgb, ${accent} 60%, transparent)`;
                        let isTargetMode = false;

                        if (isStopped && this.optimalFreq !== null) {
                            let optPct = (this.optimalFreq - this.freqMin) / (this.freqMax - this.freqMin);
                            if (optPct >= 0 && optPct <= 1) {
                                let optIdx = Math.floor(optPct * (this.maxPoints - 1));
                                centerX = getPointX(optIdx);
                                centerY = getPointY(this.points[optIdx]);
                                lineStyle = '#47a4f5';
                                isTargetMode = true;
                            }
                        }

                        ctx.save();
                        ctx.strokeStyle = lineStyle;
                        ctx.lineWidth = isTargetMode ? 1.5 : 1;
                        ctx.setLineDash(isTargetMode ? [] : [3, 3]);
                        ctx.beginPath();
                        ctx.moveTo(centerX, paddingT);
                        ctx.lineTo(centerX, displayH - paddingB);
                        ctx.stroke();
                        ctx.restore();

                        ctx.save();
                        ctx.fillStyle = '#ffffff';
                        ctx.strokeStyle = isTargetMode ? '#47a4f5' : accent;
                        ctx.lineWidth = 3;
                        ctx.shadowBlur = 12;
                        ctx.shadowColor = isTargetMode ? '#47a4f5' : accent;
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        ctx.restore();

                        if (isTargetMode) {
                            ctx.save();
                            ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
                            ctx.strokeStyle = "rgba(71, 164, 245, 0.5)";
                            ctx.lineWidth = 1;

                            const txt1 = `${this.optimalFreq.toFixed(2)} MHz`;
                            const idxForDbm = Math.floor((centerX - lblW) / (gW / (this.maxPoints - 1)));
                            const txt2 = `${this.points[idxForDbm] || -110} dBm`;

                            ctx.font = "9px Arial";
                            const boxW = Math.max(ctx.measureText(txt1).width, ctx.measureText(txt2).width) + 16;
                            const boxH = 30;
                            const boxX = Math.max(lblW, Math.min(centerX - boxW / 2, (lblW + gW) - boxW));
                            const boxY = Math.max(5, centerY - boxH - 10);

                            ctx.beginPath();
                            ctx.roundRect(boxX, boxY, boxW, boxH, 4);
                            ctx.fill();
                            ctx.stroke();

                            ctx.fillStyle = "#ffffff";
                            ctx.textAlign = "center";
                            ctx.fillText(txt1, boxX + boxW / 2, boxY + 10);
                            ctx.fillStyle = "#47a4f5";
                            ctx.fillText(txt2, boxX + boxW / 2, boxY + 22);
                            ctx.restore();
                        }
                    }
                };
                /// --- 2. MOTEUR GRAPH_BAR (VAGUES RADAR / SONAR) ---
                this.rssiGraphSignal = {
                    canvas: get('rssiSignal'),
                    lastIntensity: 0,

                    update(val) {
                        const c = this.canvas;
                        if (!c || c.style.display === 'none') return;

                        const ctx = c.getContext('2d');
                        const dpr = window.devicePixelRatio || 1;
                        const displayW = c.clientWidth;
                        const displayH = c.clientHeight;

                        c.width = displayW * dpr;
                        c.height = displayH * dpr;
                        ctx.scale(dpr, dpr);

                        let v = parseInt(val);
                        if (isNaN(v) || v < -110) v = -110;
                        if (v > -30) v = -30;

                        const targetIntensity = (v + 110) / 80;

                        if (targetIntensity > this.lastIntensity) {
                            this.lastIntensity = targetIntensity;
                        } else {
                            this.lastIntensity += (targetIntensity - this.lastIntensity) * 0.15;
                        }

                        ctx.clearRect(0, 0, displayW, displayH);

                        const rootStyles = getComputedStyle(document.documentElement);
                        let accent = rootStyles.getPropertyValue('--color-accent').trim() || '#1a5fb4';
                        let subTextColor = rootStyles.getPropertyValue('--color-text-secondary').trim() || '#888888';

                        const centerX = displayW / 2;
                        const centerY = displayH - 5;
                        const maxRadius = (displayW / 2) - 4;
                        const totalArcs = 14;

                        ctx.lineWidth = 3;
                        ctx.lineCap = 'round';

                        for (let i = 1; i <= totalArcs; i++) {
                            const arcRadius = (maxRadius / totalArcs) * i;
                            const arcTriggerThreshold = i / totalArcs;

                            ctx.beginPath();
                            ctx.arc(centerX, centerY, arcRadius, Math.PI * 1.0, Math.PI * 2.0);

                            if (this.lastIntensity >= arcTriggerThreshold) {
                                const alpha = 0.2 + (arcTriggerThreshold * 0.8);
                                ctx.strokeStyle = `color-mix(in srgb, ${accent} ${alpha * 100}%, #ffffff ${(i === totalArcs && this.lastIntensity > 0.9) ? '30%' : '0%'})`;
                                ctx.globalAlpha = 1.0;
                            } else {
                                ctx.strokeStyle = subTextColor;
                                ctx.globalAlpha = 0.12;
                            }
                            ctx.stroke();
                        }
                        // --- POINT CENTRAL ---
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
                        ctx.fillStyle = this.lastIntensity > 0.2 ? accent : subTextColor;
                        ctx.globalAlpha = this.lastIntensity > 0.2 ? 1.0 : 0.3;
                        if (this.lastIntensity > 0.2) {
                            ctx.shadowBlur = 8;
                            ctx.shadowColor = accent;
                        }
                        ctx.fill();
                        ctx.restore();
                    }
                };
                /// --- 3. OBJET MAÎTRE DE ROUTAGE AUTOMATIQUE ---
                this.rssiGraph = {
                    parent: this,
                    update(val, currentFreq, isStopped = false, bestFreq = null) {
                        const container = get('graphCanvasContainer');
                        if (!container) return;
                        const activeMode = container.getAttribute('data-active-mode');

                        if (activeMode === 'wave') {
                            this.parent.rssiGraphWave.update(val, currentFreq, isStopped, bestFreq);
                        } else if (activeMode === 'bar') {
                            this.parent.rssiGraphBar.update(val);
                        }
                    }
                };
        }
        if (initScan) {
            div.setAttribute('data-initscan', true);

            // ICI : On réinitialise immédiatement le graphique à l'instant du clic
            if (this.rssiGraphWave && typeof this.rssiGraphWave.reset === 'function') {
                this.rssiGraphWave.reset();
            }

            putJSONSync('/beginFrequencyScan', {}, (err) => {
                if (!err) {
                    if(get('scanStatusText')) get('scanStatusText').style.display = '';
                    if(get('scanStatusResult')) get('scanStatusResult').style.display = 'none';
                    if(get('btnStopScanning')) get('btnStopScanning').style.display = '';
                    ['btnRestartScanning', 'btnCopyFrequency'].forEach(id => {
                        if(get(id)) get(id).style.display = 'none';
                    });
                }
            });
        }
        return div;
    }




    setScannedFrequency() {
        let div = get('divScanFrequency');
        let freq = parseFloat(div.getAttribute('data-frequency'));
        let slid = get('slidFrequency');
        slid.value = Math.round(freq * 1000);
        somfy.frequencyChanged(slid);
        closeOverlay(div);
    }
    stopScanningFrequency(killScan) {
        let div = get('divScanFrequency');
        if (!div) return;
        if (killScan !== true) {
            closeOverlay(div);
            return;
        }
        putJSONSync('/endFrequencyScan', {}, (err, trans) => {
            if (err) {
                ui.serviceError(err);
            } else {
                let freqAttr = div.getAttribute('data-frequency');
                let freq = parseFloat(freqAttr);

                // 1. On cache TOUJOURS le texte de recherche en cours
                if (get('scanStatusText')) get('scanStatusText').style.display = 'none';

                // 2. Gestion des boutons du footer (Stop -> Play)
                if (get('btnStopScanning')) get('btnStopScanning').style.display = 'none';
                if (get('btnRestartScanning')) get('btnRestartScanning').style.display = '';

                // 3. Analyse du résultat du scan
                if (typeof freq === 'number' && !isNaN(freq) && freq > 0) {
                    // Une fréquence a été trouvée !
                    if (get('btnCopyFrequency')) get('btnCopyFrequency').style.display = '';
                    if (get('scanStatusResult')) get('scanStatusResult').style.display = 'none'; // On cache le texte d'échec
                } else {
                    // Aucune fréquence trouvée
                    if (get('btnCopyFrequency')) get('btnCopyFrequency').style.display = 'none';
                    if (get('scanStatusResult')) get('scanStatusResult').style.display = ''; // On affiche "Aucun signal détecté..."
                }
            }
        });
    }
    terminateScanUI(killScan) {
        this.isScanClosing = true;

        if (this.scanObserver) {
            this.scanObserver.disconnect();
            this.scanObserver = null;
        }
        if (killScan) {
            putJSONSync('/endFrequencyScan', {}, (err) => {
                if (err) logger.error('Failed to end frequency scan:', err);
            });
        }
        let div = get('divScanFrequency');
        if (div) closeOverlay(div);
        setTimeout(() => { this.isScanClosing = false; }, 1000);
    }

    btnDown = null;
    btnTimer = null;

    stepValue(sliderId, direction) {
        const slider = get(sliderId);
        if (!slider) return;
        const currentVal = parseFloat(slider.value);
        const step = parseFloat(slider.step) || 1;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        let newVal = currentVal + (step * direction);
        if (newVal < min) newVal = min;
        if (newVal > max) newVal = max;

        slider.value = newVal;
        slider.dispatchEvent(new Event('input'));
    }



    startStepHold(sliderId, direction) {
        // Nettoyage de sécurité au cas où un vieux timer traîne
        this.stopStepHold();

        // 1. Premier clic immédiat
        this.stepValue(sliderId, direction, 1);
        this.sliderStartTime = Date.now();

        // 2. Boucle de défilement (Fonction fléchée () => pour conserver le "this")
        const runHold = () => {
            const duration = Date.now() - this.sliderStartTime;
            let multiplier = 1;
            let speed = 100;

            if (duration > 4000) {
                multiplier = 1000;
                speed = 0.5;
            } else if (duration > 2500) {
                multiplier = 100;
                speed = 45;
            } else if (duration > 1200) {
                multiplier = 10;
                speed = 65;
            } else if (duration > 500) {
                multiplier = 1;
                speed = 100;
            }

            if (duration > 500) {
                this.stepValue(sliderId, direction, multiplier);
            }

            // IMPORTANT : bien réassigner à "this.sliderTimer"
            this.sliderTimer = setTimeout(runHold, speed);
        };

        // Lance le premier cycle
        this.sliderTimer = setTimeout(runHold, 500);
    }

    stopStepHold() {
        // Arrêt immédiat et nettoyage propre
        if (this.sliderTimer) {
            clearTimeout(this.sliderTimer);
            this.sliderTimer = null;
        }
    }

/*



*/


















    checkEmptyState() {
        const getEl = id => get(id);
        const setDisp = (el, show, style = 'block') => { if (el) el.style.display = show ? style : 'none'; };
        const togglePair = (hasData, emptyId, contentId) => {
            setDisp(getEl(emptyId), !hasData);
            setDisp(getEl(contentId), hasData);
        };

        const divShadeControls = getEl('divShadeControls');
        const divGroupControls = getEl('divGroupControls');
        const divConfigPnl = getEl('divConfigPnl');
        const divHomePnl = getEl('divHomePnl');
        if (!divShadeControls || !divGroupControls) return;

        const activePill = document.querySelector('.room-pill.active');
        const currentRoomId = activePill ? parseInt(activePill.getAttribute('data-roomid'), 10) : 0;
        const isConfigOpen = divConfigPnl && divConfigPnl.style.display !== 'none';

        const shades = divShadeControls.querySelectorAll('.somfyShadeCtl');
        const groups = divGroupControls.querySelectorAll('.somfyGroupCtl');
        const hasRooms = _rooms.length > 1;
        const totalDevices = shades.length + groups.length;

        togglePair(hasRooms, 'divRoomEmptyState', 'divRoomListContent');
        togglePair(groups.length > 0, 'divGroupEmptyState', 'divGroupListContent');
        togglePair(shades.length > 0, 'divShadeEmptyState', 'divShadeListContent');

        const divRepeatList = getEl('divRepeatList');
        togglePair(divRepeatList && divRepeatList.children.length > 0, 'divRepeaterEmptyState', 'divRepeaterListContent');

        let visibleShadesCount = 0, visibleGroupsCount = 0;
        shades.forEach(el => { if (currentRoomId === 0 || parseInt(el.getAttribute('data-roomid'), 10) === currentRoomId) visibleShadesCount++; });
        groups.forEach(el => { if (currentRoomId === 0 || parseInt(el.getAttribute('data-roomid'), 10) === currentRoomId) visibleGroupsCount++; });
        const visibleCount = visibleShadesCount + visibleGroupsCount;
        const showLogoHeader = getEl('showLogoHeader');
        if (showLogoHeader) {
            showLogoHeader.style.visibility = (isConfigOpen || totalDevices > 0 || hasRooms) ? 'visible' : 'hidden';
        }
        if (divHomePnl) divHomePnl.style.display = isConfigOpen ? 'none' : '';

        const divGetStarted = getEl('divGetStarted');
        const divNoDevice = getEl('divNoDevice');

        if (totalDevices === 0 && !hasRooms) {
            setDisp(divGetStarted, !isConfigOpen, 'flex');
            setDisp(divNoDevice, false);
            setDisp(divShadeControls, false);
            setDisp(divGroupControls, false);
        } else {
            setDisp(divGetStarted, false);
            setDisp(divNoDevice, visibleCount === 0 && !isConfigOpen, 'flex');

            if (divShadeControls) divShadeControls.style.display = isConfigOpen ? 'none' : '';
            if (divGroupControls) divGroupControls.style.display = isConfigOpen ? 'none' : '';

            const divShadeListContent = getEl('divShadeListContent');
            const divGroupListContent = getEl('divGroupListContent');
            if (divShadeListContent) divShadeListContent.style.display = visibleShadesCount === 0 ? 'none' : '';
            if (divGroupListContent) divGroupListContent.style.display = visibleGroupsCount === 0 ? 'none' : '';
        }
    }
    procRoomAdded(room) {
        let r = _rooms.find(x => x.roomId === room.roomId);
        if (typeof r === 'undefined' || !r) {
            _rooms.push(room);
            _rooms.sort((a, b) => { return a.sortOrder - b.sortOrder });
            this.setRoomsList(_rooms);
            this.checkEmptyState();
        }
    }
    procRoomRemoved(room) {
        if (room.roomId === 0) return;
        let r = _rooms.find(x => x.roomId === room.roomId);
        if (typeof r !== 'undefined' && r.roomId === room.roomId) {
            _rooms = _rooms.filter(x => x.roomId === room.roomId);
            _rooms.sort((a, b) => { return a.sortOrder - b.sortOrder });
            this.setRoomsList(_rooms);
            this.checkEmptyState();
            let rs = get('divRoomSelector');
            let ss = get('divShadeControls');
            let gs = get('divGroupControls');
            let ctls = ss.querySelectorAll('.somfyShadeCtl');
            for (let i = 0; i < ctls.length; i++) {
                let x = ctls[i];
                if (parseInt(x.getAttribute('data-roomid'), 10) === room.roomId)
                    x.setAttribute('data-roomid', '0');
            }
            ctls = gs.querySelectorAll('.somfyGroupCtl');
            for (let i = 0; i < ctls.length; i++) {
                let x = ctls[i];
                if (parseInt(x.getAttribute('data-roomid'), 10) === room.roomId)
                    x.setAttribute('data-roomid', '0');
            }
            if (parseInt(rs.getAttribute('data-roomid'), 10) === room.roomId) this.selectRoom(0);
        }
    }
    selectRoom(roomId) {
        document.querySelectorAll('.room-pill').forEach(pill => {
            const pId = parseInt(pill.getAttribute('data-roomid'), 10);
            pill.classList.toggle('active', pId === roomId);
        });

        const ctls = document.querySelectorAll('.somfyShadeCtl');
        ctls.forEach(x => {
            const rId = parseInt(x.getAttribute('data-roomid'), 10);
            x.style.display = (roomId === 0 || rId === roomId) ? '' : 'none';
        });
        this.checkEmptyState();
    }
    setRoomsList(rooms) {
        let divCfg = '';
        const homeName = tr('HOME');
        const slider = get('divRoomSelector');
        let divPills = `<div class="room-pill active" data-roomid="0" onclick="somfy.selectRoom(0)">${homeName}</div>`;
        let divOpts = `<option value="0">${homeName}</option>`;
        _rooms = [{ roomId: 0, name: homeName }];

        rooms.sort((a, b) => a.sortOrder - b.sortOrder);
        rooms.forEach(room => {
            divPills += `<div class="room-pill animScale" data-roomid="${room.roomId}" onclick="somfy.selectRoom(${room.roomId})">${room.name}</div>`;
            // ... foreach room ...
            divCfg += `<div class="somfyRoom room-draggable" data-roomid="${room.roomId}">
            <div class="drag-handle"><svg class="icon-svg"><use href=#svg-drag></use></svg></div>
            <div class="room-name"><span class="name-text">${room.name}</span></div><span class="vr"></span>
            <div class="divEditDelete-svg" onclick="somfy.openEditRoom(${room.roomId});"><svg class="icon-svg"><use href=#svg-edit></use></svg></div>
            <div class="divEditDelete-svg" onclick="somfy.deleteRoom(${room.roomId});"><svg class="icon-svg"><use href=#svg-close></use></svg></div>
            </div>`;

            divOpts += `<option value="${room.roomId}">${room.name}</option>`;
            _rooms.push(room);
        });

        slider.innerHTML = divPills;
        slider.style.display = 'flex';

        const navContainer = document.querySelector('.room-nav-container');
        if(navContainer) navContainer.style.display = rooms.length === 0 ? 'none' : 'flex';

        get('divRoomList').innerHTML = divCfg;
        get('selShadeRoom').innerHTML = divOpts;
        get('selGroupRoom').innerHTML = divOpts;

        this.checkEmptyState();
        this.setListDraggable(get('divRoomList'), '.room-draggable', (list) => {
            let order = Array.from(list.querySelectorAll('.room-draggable')).map(item =>
            parseInt(item.getAttribute('data-roomid'), 10)
            );
            putJSONSync('/roomSortOrder', order, (err) => {
                if (err) ui.serviceError(err);
                else this.updateRoomsList();
            });
        });
        this.initRoomScroll(slider);
    }
    initRoomScroll(c) {
        const update = () => {
            const btnL = get('btnScrollLeft'), btnR = get('btnScrollRight');
            if (c && btnL && btnR) {
                btnL.style.display = c.scrollLeft > 10 ? 'block' : 'none';
                btnR.style.display = c.scrollWidth > (c.scrollLeft + c.clientWidth + 10) ? 'block' : 'none';
            }
        };
        let isDown = 0, startX, scrollLeft;

        c.addEventListener('wheel', (e) => {
            if (e.deltaY) { e.preventDefault(); c.scrollLeft += e.deltaY; }
        }, { passive: false });

        c.onmousedown = (e) => {
            isDown = 1;
            c.style.cursor = 'grabbing';
            startX = e.pageX - c.offsetLeft;
            scrollLeft = c.scrollLeft;
        };

        const stop = () => { isDown = 0; c.style.cursor = 'grab'; };
        c.onmouseleave = c.onmouseup = stop;

        c.onmousemove = (e) => {
            if (!isDown) return;
            e.preventDefault();
            c.scrollLeft = scrollLeft - (e.pageX - c.offsetLeft - startX) * 2;
        };

        c.onscroll = update;
        window.onresize = update;
        setTimeout(update, 150);
        this.checkArrows = update;
    }
    scrollRooms(dir) {
        get('divRoomSelector')?.scrollBy({ left: dir * 200, behavior: 'smooth' });
    }
    setRepeaterList(addresses) {
        let divCfg = '';
        if (typeof addresses !== 'undefined') {
            for (let i = 0; i < addresses.length; i++) {

                divCfg += `<div class="somfyRepeater" data-address="${addresses[i]}"><div class="idRemoteAddress"><span class="AddrId-label">${tr("ADDR")}</span><span class="repeater-name">${addresses[i]}</span></div><div class="divEditDelete-svg" onclick="somfy.unlinkRepeater('${addresses[i]}');"><svg class="icon-svg"><use href=#svg-close></use></svg></div></div>`;
            }
        }
        get('divRepeatList').innerHTML = divCfg;
        this.checkEmptyState();
    }
    setShadesList(shades) {
        this.shades = shades;
        let divCfg = '';
        let divCtl = '';
        shades.sort((a, b) => { return a.sortOrder - b.sortOrder });
        logger.debug('Shade list updated,', shades.length, 'shades');
        let roomId = document.querySelector('.room-pill.active') ? parseInt(document.querySelector('.room-pill.active').getAttribute('data-roomid'), 10) : 0;
        let vrList = get('selVRMotor');
        // First get the optiongroup for the shades.
        let optGroup = get('optgrpVRShades');
        if (typeof shades === 'undefined' || shades.length === 0) {
            if (optGroup && typeof optGroup !== 'undefined') optGroup.remove();
        }
        else {
            if (typeof optGroup === 'undefined' || !optGroup) {
                optGroup = document.createElement('optgroup');
                optGroup.setAttribute('id', 'optgrpVRShades');
                optGroup.setAttribute('label', 'Shades');
                vrList.appendChild(optGroup);
            }
            else {
                optGroup.innerHTML = '';
            }
        }
        for (let i = 0; i < shades.length; i++) {
            let shade = shades[i];
            let room = _rooms.find(x => x.roomId === shade.roomId) || { roomId: 0, name: '' };
            let isLightOn = (shade.flags & 0x08);
            let isSunOn = (shade.flags & 0x01);
            let st = this.shadeTypes.find(x => x.type === shade.shadeType) || { type: shade.shadeType, ico: 'svg-window-shade' };

            divCfg += `<div class="somfyShade shade-draggable" draggable="true" data-roomid="${shade.roomId}" data-mypos="${shade.myPos}" data-shadeid="${shade.shadeId}" data-remoteaddress="${shade.remoteAddress}" data-tilt="${shade.tiltType}" data-shadetype="${shade.shadeType}" data-flipposition="${shade.flipPosition ? 'true' : 'false'}"><div class="drag-handle"><svg class="icon-svg"><use href=#svg-drag></use></svg></div><div class="shade-name"><div class="cfg-room">${room.name}</div><div class="name-text">${shade.name}</div></div><div class="idRemoteAddress"><span class="AddrId-label">${tr("ID")}</span><span class="shade-address">${shade.remoteAddress}</span></div><span class="vr"></span><div class="divEditDelete-svg" onclick="somfy.openEditShade(${shade.shadeId});"><svg class="icon-svg"><use href=#svg-edit></use></svg></div><div class="divEditDelete-svg" onclick="somfy.deleteShade(${shade.shadeId});"><svg class="icon-svg"><use href=#svg-close></use></svg></div></div>`;
            // --- SECTION CONTROLE ---
            divCtl += `<div class="somfyShadeCtl" style="${roomId === 0 || roomId === room.roomId ? '' : 'display:none'}" data-shadeid="${shade.shadeId}" data-roomid="${shade.roomId}" data-direction="${shade.direction}" data-remoteaddress="${shade.remoteAddress}" data-position="${shade.position}" data-target="${shade.target}" data-mypos="${shade.myPos}" data-mytiltpos="${shade.myTiltPos}" data-shadetype="${shade.shadeType}" data-tilt="${shade.tiltType}" data-flipposition="${shade.flipPosition ? 'true' : 'false'}"
            data-windy="${(shade.flags & 0x10) === 0x10 ? 'true' : 'false'}" data-sunny="${(shade.flags & 0x20) === 0x20 ? 'true' : 'false'}">
            <div class="shadectl-side-handle" onclick="event.stopPropagation(); somfy.openSetPosition(${shade.shadeId});"><svg class="handle-icon"><use href="#svg-arrowRight"></use></svg></div>
            <div class="shadectl-right-content">
            <div class="shadectl-main-content">
            <div class="shadectl-header-row"><span class="shadectl-name">${shade.name}</span></div>
            <div class="shade-icon" data-shadeid="${shade.shadeId}">
            <svg class="somfy-shade-icon" data-shadeid="${shade.shadeId}" style="--shade-position:${shade.flipPosition ? 100 - shade.position : shade.position}; --fpos:${shade.flipPosition ? 100 - shade.position : shade.position}%">
            <use href="#${st.ico}"></use>
            </svg>
            </div>
            <div class="shade-name">
            <span class="shadectl-room">${room.name}</span>`;
            divCtl += `<span class="shadectl-mypos"><span class="val-pos">Pos: ${shade.position}%</span>`;
            if (shade.tiltType !== 0) divCtl += `<span class="val-pos"> Tilt: ${shade.tiltPosition}%</span>`;
            divCtl += `</span></div>
            <div class="shadectl-buttons" data-shadeType="${shade.shadeType}">
            <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="up" data-shadeid="${shade.shadeId}"><svg><use href="#svg-up"></use></svg></div>
            <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="my" data-shadeid="${shade.shadeId}"><svg><use href="#svg-my"></use></svg></div>
            <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="down" data-shadeid="${shade.shadeId}"><svg><use href="#svg-down"></use></svg></div>
            <div class="button-outline cmd-button btn-somfy-svg-wide animScale" data-cmd="toggle" data-shadeid="${shade.shadeId}"><svg><use href="#svg-toggle"></use></svg></div>
            </div>
            <div class="shadectl-status-bar">
            <div class="shadectl-status-left">
            <div class="indicator indicator-wind"><svg><use href="#indic-wind"></use></svg></div>
            <div class="indicator indicator-sun"><svg><use href="#indic-sun"></use></svg></div>
            <div class="val-my myShade-badge">My: ${shade.myPos === -1 ? '---' : shade.myPos + '%'}</div>`;
            if (shade.tiltType !== 0) divCtl += `<div class="val-tilt myShade-badge">My Tilt: ${shade.myTiltPos === -1 ? '---' : shade.myTiltPos + '%'}</div>`;
            divCtl += `</div>
            <div class="status-group-right">
            <div class="button-light cmd-button" data-cmd="light" data-shadeid="${shade.shadeId}" data-on="${isLightOn ? 'true' : 'false'}" style="${!shade.light ? 'display:none' : ''}">
            <svg><use href="#svg-lightbulb"></use></svg>
            </div>`;
            if (shade.sunSensor) {
                divCtl += `<div class="button-sunflag cmd-button" data-cmd="sunflag" data-shadeid="${shade.shadeId}" data-on="${isSunOn ? 'true' : 'false'}">
                <svg><use href="#svg-sun"></use></svg>
                </div>`;
            }
            divCtl += `<div class="button-my" onclick="event.stopPropagation(); somfy.openSetMyPosition(${shade.shadeId});">
            <svg><use href="#svg-favori"></use></svg>
            </div></div></div></div></div></div></div>`;

            let opt = document.createElement('option');
            opt.innerHTML = shade.name;

            opt.setAttribute('data-address', shade.remoteAddress);
            opt.setAttribute('data-type', 'shade');
            opt.setAttribute('data-shadetype', shade.shadeType);
            opt.setAttribute('data-shadeid', shade.shadeId);
            opt.setAttribute('data-bitlength', shade.bitLength);
            optGroup.appendChild(opt);
        }
        let sopt = vrList.options[vrList.selectedIndex];
        get('divVirtualRemote').setAttribute('data-bitlength', sopt ? sopt.getAttribute('data-bitlength') : 'none');
        get('divShadeList').innerHTML = divCfg;
        let shadeControls = get('divShadeControls');
        shadeControls.innerHTML = divCtl;
        this.checkEmptyState();
        // Attach the timer for setting the My Position for the shade.
        let btns = shadeControls.querySelectorAll('div.cmd-button');
        for (let i = 0; i < btns.length; i++) {
            btns[i].addEventListener('mouseup', (event) => {
                let cmd = event.currentTarget.getAttribute('data-cmd');
                let shadeId = parseInt(event.currentTarget.getAttribute('data-shadeid'), 10);
                if (this.btnTimer) {
                    clearTimeout(this.btnTimer);
                    this.btnTimer = null;
                    if (new Date().getTime() - this.btnDown > 2000) event.preventDefault();
                    else this.sendCommand(shadeId, cmd);
                }
                else if (cmd === 'light') {
                    event.currentTarget.setAttribute('data-on', !makeBool(event.currentTarget.getAttribute('data-on')));
                }
                else if (cmd === 'sunflag') {
                    if (makeBool(event.currentTarget.getAttribute('data-on')))
                        this.sendCommand(shadeId, 'flag');
                    else
                        this.sendCommand(shadeId, 'sunflag');
                }
                else this.sendCommand(shadeId, cmd);
            }, true);
            btns[i].addEventListener('mousedown', (event) => {
                if (this.btnTimer) {
                    clearTimeout(this.btnTimer);
                    this.btnTimer = null;
                }
                let elShade = event.currentTarget.closest('div.somfyShadeCtl');
                let cmd = event.currentTarget.getAttribute('data-cmd');
                let shadeId = parseInt(event.currentTarget.getAttribute('data-shadeid'), 10);
                let el = event.currentTarget.closest('.somfyShadeCtl');
                this.btnDown = new Date().getTime();
                if (cmd === 'my') {
                    if (parseInt(el.getAttribute('data-direction'), 10) === 0) {
                        this.btnTimer = setTimeout(() => {
                            // Open up the set My Position dialog.  We will allow the user to change the position to match
                            // the desired position.
                            this.openSetMyPosition(shadeId);
                        }, 2000);
                    }
                }
                else if (cmd === 'light') return;
                else if (cmd === 'sunflag') return;
                else if (makeBool(elShade.getAttribute('data-tilt'))) {
                    this.btnTimer = setTimeout(() => {
                        this.sendTiltCommand(shadeId, cmd);
                    }, 2000);
                }
            }, true);
            btns[i].addEventListener('touchstart', (event) => {
                if (this.btnTimer) {
                    clearTimeout(this.btnTimer);
                    this.btnTimer = null;
                }
                let elShade = event.currentTarget.closest('div.somfyShadeCtl');
                let cmd = event.currentTarget.getAttribute('data-cmd');
                let shadeId = parseInt(event.currentTarget.getAttribute('data-shadeid'), 10);
                let el = event.currentTarget.closest('.somfyShadeCtl');
                this.btnDown = new Date().getTime();
                if (parseInt(el.getAttribute('data-direction'), 10) === 0) {
                    if (cmd === 'my') {
                        this.btnTimer = setTimeout(() => {
                            // Open up the set My Position dialog.  We will allow the user to change the position to match
                            // the desired position.
                            this.openSetMyPosition(shadeId);
                        }, 2000);
                    }
                    else {
                        if (makeBool(elShade.getAttribute('data-tilt'))) {
                            this.btnTimer = setTimeout(() => {
                                this.sendTiltCommand(shadeId, cmd);
                            }, 2000);
                        }
                    }
                }
            }, true);
        }
        this.setListDraggable(get('divShadeList'), '.shade-draggable', (list) => {
            // Get the shade order
            let items = list.querySelectorAll('.shade-draggable');
            let order = [];
            for (let i = 0; i < items.length; i++) {
                order.push(parseInt(items[i].getAttribute('data-shadeid'), 10));
                // Reorder the shades on the main page.
            }
            putJSONSync('/shadeSortOrder', order, (err) => {
                for (let i = order.length - 1; i >= 0; i--) {
                    let el = shadeControls.querySelector(`.somfyShadeCtl[data-shadeid="${order[i]}"`);
                    if (el) {
                        shadeControls.prepend(el);
                    }
                }
            });
        });
    }
    setListDraggable(list, cl, cb) {
        let el = null, gh = null, ch = false, sA = null;
        let r = null, sY = 0, cY = 0, its = [];

        const stop = () => { if(sA) cancelAnimationFrame(sA); sA = null; };
        const scroll = (y) => {
            stop();
            let sp = 0;
            if (y < 100) sp = -14;
            else if (y > window.innerHeight - 100) sp = 14;

            if (sp && gh) {
                window.scrollBy(0, sp);
                cY += sp;
                gh.style.transform = "translateY(" + (cY - sY) + "px)";
                sA = requestAnimationFrame(() => scroll(y));
                sort();
            }
        };
        const sort = () => {
            if (!el || !gh) return;
            let mid = gh.getBoundingClientRect().top + (r.height / 2);
            let idx = its.indexOf(el);

            its.forEach((it, i) => {
                if (it === el) return;
                let iM = it.getBoundingClientRect().top + (r.height / 2);
                let o = 0;
                if (mid < iM && its.indexOf(el) > i) {
                    o = r.height + 10;
                    if(i < idx) idx = i;
                } else if (mid > iM && its.indexOf(el) < i) {
                    o = -(r.height + 10);
                    if(i >= idx) idx = i + 1;
                }
                it.style.transform = o ? "translateY(" + o + "px)" : "";
            });
            el.dataset.idx = idx;
        };
        const end = () => {
            stop();
            if (gh) { gh.remove(); gh = null; }
            if (el) {
                el.classList.remove('drag-orig');
                let n = parseInt(el.dataset.idx, 10), o = its.indexOf(el);
                if (!isNaN(n) && n !== o) {
                    list.insertBefore(el, its[n] || null);
                    ch = true;
                }
            }
            its.forEach(it => it.style.transform = "");
            if (ch && typeof cb === 'function') cb(list);
            el = null; ch = false; its = [];
        };
        const move = (e) => {
            if (!gh) return;
            if (e.cancelable) e.preventDefault();
            let t = e.touches ? e.touches[0] : e;
            cY = t.clientY;
            gh.style.transform = "translateY(" + (cY - sY) + "px)";
            scroll(cY);
            sort();
        };
        const start = (e, it) => {
            if (e.type === 'mousedown') e.preventDefault();
            el = it;
            r = el.getBoundingClientRect();
            its = Array.prototype.slice.call(list.querySelectorAll(cl));
            let t = e.touches ? e.touches[0] : e;
            sY = cY = t.clientY;

            gh = el.cloneNode(true);
            gh.className = 'drag-ghost';

            const style = window.getComputedStyle(el);
            Object.assign(gh.style, {
                width: r.width + 'px',
                height: r.height + 'px',
                top: r.top + 'px',
                left: r.left + 'px',
            });
            document.body.appendChild(gh);
            el.classList.add('drag-orig');
            if (navigator.vibrate) navigator.vibrate(30);
        };

            list.querySelectorAll(cl).forEach(it => {
                let h = it.querySelector('.drag-handle');
                if (h) {
                    h.addEventListener('touchstart', (e) => start(e, it), {passive:true});
                    h.addEventListener('mousedown', (e) => start(e, it));
                }
            });
            if (window._dragMoveHandler) window.removeEventListener('touchmove', window._dragMoveHandler);
            if (window._dragEndHandler) window.removeEventListener('touchend', window._dragEndHandler);
            if (window._dragMouseMoveHandler) window.removeEventListener('mousemove', window._dragMouseMoveHandler);
            if (window._dragMouseUpHandler) window.removeEventListener('mouseup', window._dragMouseUpHandler);

        window._dragMoveHandler = move;
        window._dragEndHandler = end;
        window._dragMouseMoveHandler = move;
        window._dragMouseUpHandler = end;
        window.addEventListener('touchmove', move, {passive:false});
        window.addEventListener('touchend', end);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
    }
    setGroupsList(groups) {
        this.groups = groups;
        let divCfg = '';
        let divCtl = '';
        let vrList = get('selVRMotor');
        let optGroup = get('optgrpVRGroups');

        if (typeof groups === 'undefined' || groups.length === 0) {
            if (optGroup) optGroup.remove();
        } else {
            if (!optGroup) {
                optGroup = document.createElement('optgroup');
                optGroup.setAttribute('id', 'optgrpVRGroups');
                optGroup.setAttribute('label', 'Groups');
                vrList.appendChild(optGroup);
            } else {
                optGroup.innerHTML = '';
            }
        }
        let roomId = document.querySelector('.room-pill.active') ? parseInt(document.querySelector('.room-pill.active').getAttribute('data-roomid'), 10) : 0;

        if (typeof groups !== 'undefined') {
            groups.sort((a, b) => a.sortOrder - b.sortOrder);

            for (let i = 0; i < groups.length; i++) {
                let group = groups[i];
                let room = _rooms.find(x => x.roomId === group.roomId) || { roomId: 0, name: '' };
                // --- Section Configuration ---
                divCfg += `<div class="somfyGroup group-draggable" draggable="true" data-roomid="${group.roomId}" data-groupid="${group.groupId}" data-remoteaddress="${group.remoteAddress}"><div class="drag-handle"><svg class="icon-svg"><use href=#svg-drag></use></svg></div> <div class="group-name"><div class="cfg-room">${room.name}</div><div class="name-text">${group.name}</div></div><div class="idRemoteAddress"><span class="AddrId-label">${tr("ID")}</span><span class="group-address">${group.remoteAddress}</span></div><span class="vr"></span><div class="divEditDelete-svg" onclick="somfy.openEditGroup(${group.groupId});"><svg class="icon-svg"><use href=#svg-edit></use></svg></div><div class="divEditDelete-svg" onclick="somfy.deleteGroup(${group.groupId});"><svg class="icon-svg" style="color: var(--color-danger);"><use href=#svg-close></use></svg></div></div>`;
                // --- Section Contrôle (divCtl) ---
                divCtl += `<div class="somfyGroupCtl" style="${roomId === 0 || roomId === room.roomId ? '' : 'display:none'}" data-groupId="${group.groupId}" data-roomid="${group.roomId}" data-remoteaddress="${group.remoteAddress}">
                <div class="group-name">
                <span class="groupctl-room">${room.name}</span>
                <span class="groupctl-name">${group.name}</span>
                <div class="groupctl-shades">`;
                if (typeof group.linkedShades !== 'undefined') {
                    divCtl += `<label>Members:</label><span>${group.linkedShades.length}</span>`;
                }
                divCtl += `</div></div>
                <div class="groupctl-buttons">
                <div class="button-sunflag cmd-button" data-cmd="sunflag" data-groupid="${group.groupId}" data-on="${(group.flags & 0x01) ? 'true' : 'false'}" style="${!group.sunSensor ? 'display:none' : ''}"><svg><use href="#svg-sun"></use></svg></div>
                <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="up" data-groupid="${group.groupId}"><svg><use href="#svg-up"></use></svg></div>
                <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="my" data-groupid="${group.groupId}"><svg><use href="#svg-my"></use></svg></div>
                <div class="button-outline cmd-button btn-somfy-svg animScale" data-cmd="down" data-groupid="${group.groupId}"><svg><use href="#svg-down"></use></svg></div>
                </div>
                </div>`;

                let opt = document.createElement('option');
                opt.innerHTML = group.name;
                opt.setAttribute('data-address', group.remoteAddress);
                opt.setAttribute('data-type', 'group');
                opt.setAttribute('data-groupid', group.groupId);
                opt.setAttribute('data-bitlength', group.bitLength);
                optGroup.appendChild(opt);
            }
        }
        let sopt = vrList.options[vrList.selectedIndex];
        get('divVirtualRemote').setAttribute('data-bitlength', sopt ? sopt.getAttribute('data-bitlength') : 'none');
        get('divGroupList').innerHTML = divCfg;
        let groupControls = get('divGroupControls');
        groupControls.innerHTML = divCtl;
        this.checkEmptyState();
        // Attach the timer for setting the My Position for the Group.
        let btns = groupControls.querySelectorAll('div.cmd-button');
        for (let i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', (event) => {
                let groupId = parseInt(event.currentTarget.getAttribute('data-groupid'), 10);
                let cmd = event.currentTarget.getAttribute('data-cmd');
                if (cmd === 'sunflag') {
                    if (makeBool(event.currentTarget.getAttribute('data-on')))
                        this.sendGroupCommand(groupId, 'flag');
                    else
                        this.sendGroupCommand(groupId, 'sunflag');
                }
                else
                    this.sendGroupCommand(groupId, cmd);
            }, true);
        }
        this.setListDraggable(get('divGroupList'), '.group-draggable', (list) => {
            // Get the shade order
            let items = list.querySelectorAll('.group-draggable');
            let order = [];
            for (let i = 0; i < items.length; i++) {
                order.push(parseInt(items[i].getAttribute('data-groupid'), 10));
                // Reorder the shades on the main page.
            }
            putJSONSync('/groupSortOrder', order, (err) => {
                for (let i = order.length - 1; i >= 0; i--) {
                    let el = groupControls.querySelector(`.somfyGroupCtl[data-groupid="${order[i]}"`);
                    if (el) {
                        groupControls.prepend(el);
                    }
                }
            });
        });
    }
    closeShadePositioners() {
        let ctls = document.querySelectorAll('.shade-positioner');
        for (let i = 0; i < ctls.length; i++) {
            ctls[i].remove();
        }
    }
    openSetMyPosition(shadeId) {
        if (typeof shadeId === 'undefined') return;

        const shade = document.querySelector(`div.somfyShadeCtl[data-shadeid="${shadeId}"]`);
        if (!shade) return;

        const arrowUse = shade.querySelector('.handle-icon use');

        document.querySelectorAll('.shade-positioner').forEach(el => {
            el.remove();
            document.querySelectorAll('.handle-icon use').forEach(u => u.setAttribute('href', '#svg-arrowRight'));
        });

        const currPos = parseInt(shade.getAttribute('data-position'), 10) || 0;
        const currTiltPos = parseInt(shade.getAttribute('data-tiltposition'), 10) || 0;
        const myPos = parseInt(shade.getAttribute('data-mypos'), 10);
        const myTiltPos = parseInt(shade.getAttribute('data-mytiltpos'), 10);
        const tiltType = parseInt(shade.getAttribute('data-tilt'), 10) || 0;
        const lbl = makeBool(shade.getAttribute('data-flipposition')) ? `% ${tr('POPUP_OPEN')}` : `% ${tr('POPUP_CLOSED')}`;

        const positionSlider = (tiltType !== 3) ? `
        <div class="slider-group">
        <div class="slider-header"><span class="title">${tr('POPUP_TARGET_POSITION')}</span><span class="val"><span id="spanShadeTarget">${currPos}</span> ${lbl}</span></div>
        <input id="slidShadeTarget" type="range" min="0" max="100" step="1" value="${currPos}" oninput="get('spanShadeTarget').innerHTML=this.value;">
        </div>` : '';

        const tiltSlider = (tiltType > 0) ? `
        <div class="slider-group">
        <div class="slider-header"><span class="title">${tr('POPUP_TARGET_TILT_POSITION')}</span><span class="val"><span id="spanShadeTiltTarget">${currTiltPos}</span> ${lbl}</span></div>
        <input id="slidShadeTiltTarget" type="range" min="0" max="100" step="1" value="${currTiltPos}" oninput="get('spanShadeTiltTarget').innerHTML=this.value;">
        </div>` : '';

        const div = document.createElement('div');
        div.className = 'shade-positioner shade-positioner-popup';
        div.setAttribute('data-shadeid', shadeId);
        div.onclick = (e) => e.stopPropagation();
        div.innerHTML = `
        <div class="shade-positioner-inner">
        ${positionSlider}${tiltSlider}
        <div class="popup-actions">
        <button id="btnSetMyPosition" pop type="button">${tr("BT_SET_MY_POSITION")}</button>
        <button id="btnCancelMy" pop line type="button">${tr("BT_CANCEL_1")}</button>
        </div>
        </div>`;

        shade.appendChild(div);
        if (arrowUse) arrowUse.setAttribute('href', '#svg-arrowLeft');

        const animateClose = () => {
            div.classList.add('popup-slide-out');
            if (arrowUse) arrowUse.setAttribute('href', '#svg-arrowRight');
            setTimeout(() => { div.remove(); }, 300);
        };
        const elTarget = div.querySelector('#slidShadeTarget');
        const elTiltTarget = div.querySelector('#slidShadeTiltTarget');
        const elBtnSave = div.querySelector('#btnSetMyPosition');
        const elBtnCancel = div.querySelector('#btnCancelMy');
        const fnUpdateUI = () => {
            const pos = elTarget ? parseInt(elTarget.value, 10) : 0;
            const tilt = elTiltTarget ? parseInt(elTiltTarget.value, 10) : 0;
            const isSameAsMy = (tiltType === 3) ? (tilt === myTiltPos) : (pos === myPos && (tiltType === 0 || tilt === myTiltPos));

            if (isSameAsMy) {
                elBtnSave.innerHTML = tr('BT_CLEAR_MY_POSITION');
                elBtnSave.style.background = 'var(--color-text-warning)';
            } else {
                elBtnSave.innerHTML = tr('BT_SET_MY_POSITION');
                elBtnSave.style.background = '';
            }
        };
        if (elTarget) elTarget.oninput = () => {
            get('spanShadeTarget').innerHTML = elTarget.value;
            fnUpdateUI();
        };
        if (elTiltTarget) elTiltTarget.oninput = () => {
            get('spanShadeTiltTarget').innerHTML = elTiltTarget.value;
            fnUpdateUI();
        };

        elBtnCancel.onclick = (e) => { e.preventDefault(); animateClose(); };
        elBtnSave.onclick = (e) => {
            e.preventDefault();
            const pos = elTarget ? parseInt(elTarget.value, 10) : 0;
            const tilt = elTiltTarget ? parseInt(elTiltTarget.value, 10) : 0;
            somfy.sendShadeMyPosition(shadeId, pos, tilt);
            animateClose();
        };

        setTimeout(() => {
            document.body.addEventListener('click', animateClose, { once: true });
        }, 100);

        fnUpdateUI();
    }
    sendShadeMyPosition(shadeId, pos, tilt) {
        logger.debug(`Sending My Position for shade id ${shadeId} to ${pos} and ${tilt}`);
        let overlay = ui.waitMessage(get('divContainer'));
        putJSON('/setMyPosition', { shadeId: shadeId, pos: pos, tilt: tilt }, (err, response) => {
            this.closeShadePositioners();
            overlay.remove();
            if (err) logger.error('Failed to set My Position:', err);
            else logger.debug('My Position command sent:', response);
        });
    }
    setLinkedRemotesList(shade) {
        const badgeCount = get('badgeRemoteCount');
        const btnContent = badgeCount?.closest('.editDevice-pair-btn-content');
        const remotes = shade.linkedRemotes || [];
        let badgeEdit = get('badgeRemoteEdit');

        if (remotes.length === 0) {
            if (badgeCount) {
                badgeCount.innerText = '0';
                badgeCount.style.display = 'none';
            }
            if (badgeEdit) badgeEdit.remove();

            const currentOverlay = get('divRemotesOverlay');
            if (currentOverlay) closeOverlay(currentOverlay);
            return;
        }
        if (badgeCount) {
            badgeCount.innerText = remotes.length;
            badgeCount.style.display = 'inline-block';
            badgeCount.onclick = null;
        }
        if (!badgeEdit && btnContent) {
            badgeEdit = document.createElement('div');
            badgeEdit.id = 'badgeRemoteEdit';
            badgeEdit.className = 'badge-edit-action';
            badgeEdit.innerText = tr('EDIT') || 'Éditer';

            btnContent.appendChild(badgeEdit);
        }
        if (badgeEdit) {
            badgeEdit.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.buildRemotesOverlay(shade);
            };
        }
        const currentOverlay = get('divRemotesOverlay');
        if (currentOverlay) {
            const scrollContent = get('divRemotesScrollContentInner');
            if (scrollContent) {
                scrollContent.innerHTML = this.modalRemotesListHtml(shade);
            }
        }
    }
    modalRemotesListHtml(shade) {
        const remotes = shade.linkedRemotes || [];
        return remotes.map((remote, i) => `
        <div class="somfyLinkedRemote" data-shadeid="${shade.shadeId}" data-remoteaddress="${remote.remoteAddress}" style="margin: 10px 0;">
        <div class="linkedWrap">
        <svg class="icon-svg"><use href="#svg-linkRemot"></use></svg>
        </div>
        <div class="linkedContent">
        <div class="label">${tr("LINKED_R_T")} ${i + 1}</div>
        <div>
        <span class="uniStatus">${tr("ADDR")} ${remote.remoteAddress}, </span>
        <span class="uniStatus">${tr("CODE")} ${remote.lastRollingCode}</span>
        </div>
        </div>
        <div class="button-outline-svg svgDelete" onclick="somfy.unlinkRemote(${shade.shadeId}, '${remote.remoteAddress}');">
        <svg class="icon-svg"><use href="#svg-close"></use></svg>
        </div>
        </div>
        `).join('');
    }



























    buildRemotesOverlay(shade) {
        if (get('divRemotesOverlay')) return;

        let div = document.createElement('div');
        div.id = 'divRemotesOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content remotes-content" id="divRemotesPopupContent">
        <div id="divRemotesScrollContent">
        ${modalHeader('LINKED_R', 'svg-remote')}
        <div class="overlay-scroll-content" id="divRemotesScrollContentInner">
        ${this.modalRemotesListHtml(shade)}
        </div>
        </div>
        <div id="remotesPopupFooter" style="width: 100%;">
        <div class="hrModal marginB0"></div>
        <div class="button-container-modal">
        <button id="btnRemotesGoBack" line type="button" style="width:100%;">${tr('BT_CLOSE')}</button>
        </div>
        </div>
        </div>`;

        shOverlay(div);

        div.querySelector('#btnRemotesGoBack').onclick = () => closeOverlay(div);
    }
    setLinkedShadesList(group) {
        const container = get('divLinkedShadeList');
        const btnContainer = get('divSomfyGroupButtons');
        const btnLink = get('btnLinkShade');
        const shades = group.linkedShades || [];

        if (shades.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
        }
        const hasShades = shades.length > 0;
        if (btnContainer) {
            if (!hasShades) {
                btnContainer.classList.add('disabled');
            } else {
                btnContainer.classList.remove('disabled');
            }
        }
        ui.setFocus(btnLink, !hasShades);

        if (!hasShades) return;

        let html = `<div class="linkedRheader">${tr("GROUP_LINKED_S")}</div>`;

        html += `<div class="linkedScrollArea">`;
        html += shades.map((shade, i) => `
        <div class="somfyLinkedRemote" data-shadeid="${shade.shadeId}" data-remoteaddress="${shade.remoteAddress}">
        <div class="linkedWrap"><svg class="icon-svg"><use href=#svg-simpleShutter></use></svg></div><div class="linkedContent"><div class="label">${shade.name}</div><div><span class="uniStatus">${tr("ADDR")} ${shade.remoteAddress}</span></div></div><div class="button-outline-svg svgDelete" onclick="somfy.unlinkGroupShade(${group.groupId}, ${shade.shadeId});"><svg class="icon-svg"><use href=#svg-unlink></use></svg></div></div>
        `).join('');

        html += `</div>`;

        container.innerHTML = html;
    }
    procGroupState(state) {
        logger.debug('Group state update:', state);
        let flags = document.querySelectorAll(`.button-sunflag[data-groupid="${state.groupId}"]`);
        for (let i = 0; i < flags.length; i++) {
            flags[i].style.display = state.sunSensor ? '' : 'none';
            flags[i].setAttribute('data-on', state.flags & 0x20 === 0x20 ? 'true' : 'false');
        }
    }
    procShadeState(state) {
        const g = get, sId = state.shadeId;

        document.querySelectorAll(`.somfy-shade-icon[data-shadeid="${sId}"]`).forEach(ico => {
            const p = state.flipPosition ? 100 - state.position : state.position;
            ico.style.setProperty('--shade-position', p);
            ico.style.setProperty('--fpos', state.position + '%');
        });
        if (g('spanShadeId')?.innerText == sId) {
            if (g('valPos')) g('valPos').innerText = state.position;

            const lTC = g('labelTiltContainer'), sVT = g('valTilt');
            if (state.tiltType !== 0) {
                if (lTC) lTC.style.display = 'block';
                if (sVT) sVT.innerText = state.tiltPosition;
            } else if (lTC) {
                lTC.style.display = 'none';
            }
        }
        document.querySelectorAll(`.button-sunflag[data-shadeid="${sId}"]`).forEach(btn => {
            btn.style.display = state.sunSensor ? '' : 'none';
            btn.dataset.on = (state.flags & 0x01) === 0x01;
        });
        document.querySelectorAll(`.somfyShadeCtl[data-shadeid="${sId}"]`).forEach(d => {
            Object.assign(d.dataset, {
                direction: state.direction,
                position: state.position,
                target: state.target,
                mypos: state.myPos,
                windy: (state.flags & 0x10) === 0x10,
                          sunny: (state.flags & 0x20) === 0x20,
                          mytiltpos: state.myTiltPos ?? -1
            });

            if (state.tiltType !== 0) {
                Object.assign(d.dataset, {
                    tiltdirection: state.tiltDirection,
                    tiltposition: state.tiltPosition,
                    tilttarget: state.tiltTarget
                });
            }
            const spans = d.querySelectorAll('.val-pos');
            if (spans[0]) spans[0].innerText = `Pos: ${state.position}%`;
            if (state.tiltType !== 0 && spans[1]) spans[1].innerText = `Tilt: ${state.tiltPosition}%`;

            const upTxt = (sel, pre, val) => {
                const el = d.querySelector(sel);
                if (el) el.innerText = `${pre}: ${val !== undefined && val >= 0 ? val + '%' : '---'}`;
            };
            upTxt('.val-my', 'My', state.myPos);
            upTxt('.val-tilt', 'My Tilt', state.myTiltPos);
        });
    }
    procRemoteFrame(frame) {
        const qs = (s) => get(s);
        qs('spanRssi').innerHTML = frame.rssi;
        qs('spanFrameCount').innerHTML = parseInt(qs('spanFrameCount').innerHTML || 0, 10) + 1;

        const lnk = qs('divLinking') || qs('divLinkRepeater');
        if (lnk) {
            const isRepeater = lnk.id === 'divLinkRepeater';
            const url = isRepeater ? '/linkRepeater' : '/linkRemote';
            const obj = isRepeater ? {address: frame.address} : {
                shadeId: parseInt(lnk.dataset.shadeid, 10),
                remoteAddress: frame.address,
                rollingCode: frame.rcode
            };

            const overlay = ui.waitMessage(lnk);
            putJSON(url, obj, (err, data) => {
                overlay.remove();
                lnk.remove();
                if (err) ui.serviceError(err);
                else isRepeater ? this.setRepeaterList(data) : this.setLinkedRemotesList(data);
            });
        }
        const dt = new Date();
        const timeStr = `${dt.getHours().fmt('00')}:${dt.getMinutes().fmt('00')}:${dt.getSeconds().fmt('00')}.${dt.getMilliseconds().fmt('000')}`;
        const protos = { 1: '-W', 2: '-V' };
        const proto = protos[frame.proto] || '-S';
        const row = document.createElement('div');
        row.className = 'frame-row';
        row.dataset.valid = frame.valid;

        row.innerHTML = `<span>${frame.encKey}</span><span>${frame.address}</span><span>${frame.command}<sup>${frame.stepSize || ''}</sup></span><span>${frame.rcode}</span><span>${frame.rssi}dBm</span><span>${frame.bits}${proto}</span><span>${timeStr}</span><div class="frame-pulses">${frame.pulses.join(',')}</div>`;

        qs('divFrames').prepend(row);
        this.frames.push(frame);
    }
    JSONPretty(obj, indent = 2) {
        if (Array.isArray(obj)) {
            let output = '[';
            for (let i = 0; i < obj.length; i++) {
                if (i !== 0) output += ',\n';
                output += this.JSONPretty(obj[i], indent);
            }
            output += ']';
            return output;
        }
        else {
            let output = JSON.stringify(obj, function (k, v) {
                if (Array.isArray(v)) return JSON.stringify(v);
                return v;
            }, indent).replace(/\\/g, '')
            .replace(/\"\[/g, '[')
            .replace(/\]\"/g, ']')
            .replace(/\"\{/g, '{')
                .replace(/\}\"/g, '}')
                .replace(/\{\n\s+/g, '{');
                    return output;
                }
        }
    JSONPretty(obj, indent = 2) {
        if (Array.isArray(obj)) {
            let output = '[';
            for (let i = 0; i < obj.length; i++) {
                if (i !== 0) output += ',\n';
                output += this.JSONPretty(obj[i], indent);
            }
            output += ']';
            return output;
        }
        else {
            let output = JSON.stringify(obj, function (k, v) {
                if (Array.isArray(v)) return JSON.stringify(v);
                return v;
            }, indent).replace(/\\/g, '')
            .replace(/\"\[/g, '[')
            .replace(/\]\"/g, ']')
            .replace(/\"\{/g, '{')
            .replace(/\}\"/g, '}')
            .replace(/\{\n\s+/g, '{');
                return output;
            }
    }
    framesToClipboard() {
        if (typeof navigator.clipboard !== 'undefined')
            navigator.clipboard.writeText(this.JSONPretty(this.frames, 2));
        else {
            let dummy = document.createElement('textarea');
            document.body.appendChild(dummy);
            dummy.value = this.JSONPretty(this.frames, 2);
            dummy.focus();
            dummy.select();
            document.execCommand('copy');
            document.body.removeChild(dummy);
        }
    }
    onShadeTypeChanged(el) {
        const g = get,
        type = parseInt(g('selShadeType').value, 10),
        tilt = parseInt(g('selTiltType').value, 10),
        bitL = g('selShadeBitLength')?.value,
        ico = g('icoShade'),
        isNew = g('spanShadeId').innerText === '*',
        st = this.shadeTypes.find(x => x.type === type) || { type };

        ['somfyShade', 'divSomfyButtons'].forEach(id => g(id)?.setAttribute('data-shadetype', type));

        if (ico) {

            this.shadeTypes.forEach(t => t.ico !== st.ico && ico.classList.remove(t.ico));

            const use = ico.querySelector('use');
            if (use && st.ico) {
                const href = '#' + st.ico;
                use.setAttribute('href', href);
                use.setAttribute('xlink:href', href);
            }
        }
        const hasLift = !!st.lift;
        const curTilt = st.tilt ? tilt : 0;
        const showLiftSettings = hasLift && tilt !== 3;
        const disp = (id, cond, d = 'block') => {
            const e = g(id);
            if (e) e.style.display = cond ? d : 'none';
        };

            disp('divTiltSettings', st.tilt, 'flex');
            disp('divShadeTimings', hasLift, 'flex');
            disp('divLiftSettings', showLiftSettings, 'flex');
            disp('divSunSensor', st.sun);
            disp('divLightSwitch', st.light);
            disp('divFlipPosition', st.fpos);
            disp('divFlipCommands', st.fcmd);

            disp('divFldTiltTimeContainer', curTilt, 'flex');

            const showStepHR = [7, 8, 2, 4, 0].includes(type) || (type === 1 && [2, 3, 4].includes(tilt));



        disp('labelPosContainer', hasLift && !isNew);
        disp('labelTiltContainer', curTilt && !isNew);

        if (!st.light && g('cbHasLight')) g('cbHasLight').checked = false;
        if (!st.sun && g('cbHasSunsensor')) g('cbHasSunsensor').checked = false;
    }
    onShadeBitLengthChanged(el) {
        get('somfyShade').setAttribute('data-bitlength', el.value);
        this.onShadeTypeChanged(el);
    }
    onShadeProtoChanged(el) {
        get('somfyShade').setAttribute('data-proto', el.value);
    }












// =========================================================================
// SECTION : GESTION DES PIÈCES (ROOMS)
// =========================================================================
    showEditRoom(bShow) {
        let el = get('divLinking');
        if (el) el.remove();
        el = get('divLinkRepeater');
        if (el) el.remove();
        el = get('divPairing');
        if (el) el.remove();
        el = get('divRollingCode');
        if (el) el.remove();
        el = get('somfyRoom');
        if (el) el.style.display = bShow ? '' : 'none';
        el = get('divRoomListContainer');
        if (el) el.style.display = bShow ? 'none' : '';
        if (bShow) {
            this.showEditGroup(false);
            this.showEditShade(false);
        }
    }
    openEditRoom(roomId) {
        // Ouverture "normale" (depuis la liste des pièces) : jamais un retour vers un volet/groupe.
        this._roomInlineReturnContext = null;
        confirmDiscardChanges(() => this._openEditRoom(roomId));
    }
    // Création de pièce à la volée depuis l'édition d'un volet/groupe (bouton + à côté du
    // sélecteur de pièce) : contourne volontairement confirmDiscardChanges, le formulaire d'origine
    // reste ouvert derrière et ses modifications ne doivent pas être remises en cause. `context`
    // ('shade' ou 'group') indique quel sélecteur re-sélectionner automatiquement après la création.
    openAddRoomInline(context) {
        this._roomInlineReturnContext = context;
        this._openEditRoom(undefined);
    }
    _openEditRoom(roomId) {
        if (typeof roomId === 'undefined') {
            if (_rooms.length >= 15) {
                ui.errorMessage(get('divSomfySettings'), tr('ERR_ROOM_LIMIT_REACHED'));
                return;
            }
            getJSONSync('/getNextRoom', (err, room) => {
                if (err) ui.serviceError(err);
                else {
                    room.name = '';
                    this.RoomOverlay('*', room);
                }
            });
        }
        else {
            getJSONSync(`/room?roomId=${roomId}`, (err, room) => {
                if (err) ui.serviceError(err);
                else {
                    this.RoomOverlay(roomId, room);
                }
            });
        }
    }











    RoomOverlay(roomId, roomData) {
        if (get('divEditRoomOverlay')) return;

        // Déduction automatique : si roomId est '*' ou falsy => Mode Ajout, sinon => Mode Édition
        const isEdit = roomId && roomId !== '*';

        const titleKey   = isEdit ? 'ROOM_TITLE_EDIT' : 'ROOM_TITLE_ADD';
        const buttonText = isEdit ? tr('BT_SAVE') : tr('BT_CREATE');
        const iconHref   = isEdit ? '#svg-download' : '#svg-add';

        let div = document.createElement('div');
        div.id = 'divEditRoomOverlay';
        div.className = 'modal-overlay';
        div.setAttribute('data-roomid', roomId);

        const presetsHTML = Array.from({ length: 8 }, (_, i) =>
        `<span class="preset-badge">${tr(`ROOM_PRESET_${i}`)}</span>`
        ).join('');

        div.innerHTML = `
        <div class="message-content room-content">
        ${modalHeader(titleKey, 'svg-emptyRoom', {
            rightContent: `<div class="somfyMaxId"><span id="spanRoomId">${roomId}</span>/<span id="spanMaxRooms">${roomData.maxRooms || 14}</span></div>`
        })}
        <div class="overlay-scroll-content">
        <div class="uniblocCol">
        <label class="label" for="fldRoomName">${tr('NAME')}</label>
        <input id="fldRoomName" class="inputAndSelect" name="roomName" data-bind="name" type="text" length=20 placeholder="${tr('ROOM_NAME_PHL')}">
        </div>
        <div class="room-presets">
        ${presetsHTML}
        </div>

        <div class="hrModal marginB0"></div>
        <div class="button-container-modal">
        <button id="btnRoomGoBack" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnSaveRoom" type="button">
        <svg><use id="useSaveRoomIcon" href="${iconHref}"></use></svg>
        <span id="btnSaveRoomText">${buttonText}</span>
        </button>
        </div>
        </div>
        </div>`;

        shOverlay(div);
        ui.toElement(div, roomData);
        watchDirty(div);

        div.onclick = (e) => {
            const target = e.target;

            if (target.classList.contains('preset-badge')) {
                const input = div.querySelector('#fldRoomName');
                input.value = target.innerText;
                input.dispatchEvent(new Event('input'));
                return;
            }
            if (target.id === 'btnRoomGoBack' || target.closest('#btnRoomGoBack')) {
                clearDirty(div);
                this._roomInlineReturnContext = null;
                closeOverlay(div);
                return;
            }
            if (target.id === 'btnSaveRoom' || target.closest('#btnSaveRoom')) {
                this.saveRoom(div);
                return;
            }
        };
    }
    saveRoom(overlayEl) {
        if (!overlayEl) overlayEl = get('divEditRoomOverlay');
        if (!overlayEl) return;

        let roomId = parseInt(overlayEl.querySelector('#spanRoomId').innerText, 10);
        let obj = ui.fromElement(overlayEl);
        let valid = true;

        if (valid && (typeof obj.name !== 'string' || obj.name === '' || obj.name.length > 20)) {
            ui.errorMessage(get('divSomfySettings'), tr('ERR_ROOM_NAME_INVALID'));
            valid = false;
        }

        if (valid) {
            if (isNaN(roomId) || roomId === 0) {
                putJSONSync('/addRoom', obj, (err, room) => {
                    if (err) {
                        ui.serviceError(err);
                        logger.error('Failed to add room:', err);
                    }
                    else {
                        logger.debug('Room added:', room);
                        ui.successMessage(tr('MSG_ADD_SUCCESS'));
                        clearDirty(overlayEl);
                        // Création à la volée depuis un volet/groupe : une fois les listes de
                        // pièces rafraîchies (la nouvelle option doit exister avant qu'on puisse
                        // la sélectionner), on resélectionne automatiquement la pièce créée dans
                        // le formulaire d'origine, resté ouvert derrière cet overlay.
                        const returnCtx = this._roomInlineReturnContext;
                        this._roomInlineReturnContext = null;
                        this.updateRoomsList(() => {
                            if (!returnCtx) return;
                            const sel = get(returnCtx === 'group' ? 'selGroupRoom' : 'selShadeRoom');
                            if (!sel) return;
                            sel.value = room.roomId;
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                        closeOverlay(overlayEl);
                    }
                });
            }
            else {
                obj.roomId = roomId;
                putJSONSync('/saveRoom', obj, (err, room) => {
                    if (err) {
                        ui.serviceError(err);
                        logger.error('Failed to save room:', err);
                    } else {
                        ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                        logger.debug('Room saved:', room);
                        clearDirty(overlayEl);
                        this.updateRoomsList();
                        closeOverlay(overlayEl);
                    }
                });
            }
        }
    }
    deleteRoom(roomId) {
        let valid = true;
        if (isNaN(roomId) || roomId >= 255 || roomId <= 0) {
            ui.errorMessage(tr('ERR_ROOM_ID_REQUIRED'));
            valid = false;
        }
        if (valid) {
            getJSONSync(`/room?roomId=${roomId}`, (err, room) => {
                if (err) ui.serviceError(err);
                else {
                    let prompt = ui.promptMessage(tr('PROMPT_DELETE_ROOM'), () => {
                        ui.clearErrors();
                        putJSONSync('/deleteRoom', { roomId: roomId }, (err, room) => {
                            prompt.remove();
                            if (err) ui.serviceError(err);
                            else
                                this.updateRoomsList();
                        });
                    });
                    prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_DELETE_ROOM_WARNING")}</p>`;
                }
            });
        }
    }
    updateRoomsList(cb) {
        getJSONSync('/rooms', (err, shades) => {
            if (err) {
                logger.error('Failed to load rooms:', err);
                ui.serviceError(err);
            }
            else {
                this.setRoomsList(shades);
                if (typeof cb === 'function') cb();
            }
        });
    }
// =========================================================================
// SECTION : GESTION DES ÉQUIPEMENTS (DEVICES)
// =========================================================================

    showEditShade(bShow) {
        let el = get('divLinking');
        if (el) el.remove();
        el = get('divLinkRepeater');
        if (el) el.remove();
        el = get('divPairing');
        if (el) el.remove();
        el = get('divRollingCode');
        if (el) el.remove();
        el = get('somfyShade');
        if (el) el.style.display = bShow ? '' : 'none';
        el = get('divShadeListContainer');
        if (el) el.style.display = bShow ? 'none' : '';
        if (!bShow) clearDirty();
        if (bShow) {
            this.showEditGroup(false);
            this.showEditRoom(false);
        }
    }
    // Point d'entrée réel d'ouverture d'un volet (nouveau ou existant) : garde contre la perte de
    // modifications non enregistrées si un autre volet/groupe/planning était en cours d'édition
    // (ex: clic sur un autre volet de la liste sans avoir enregistré le premier).
    openEditShade(shadeId) { confirmDiscardChanges(() => this._openEditShade(shadeId)); }
    _openEditShade(shadeId) {
        const g = get,
        isNew = shadeId === undefined,
        ico = g('icoShade'),
        btns = ['btnPairShade', 'btnUnpairShade', 'btnLinkRemote', 'hrSetRollingC', 'btnSetRollingCode'];

        if (isNew && this.shades?.length >= 30)
            return ui.errorMessage(g('divSomfySettings'), tr('ERR_DEVICE_LIMIT_REACHED'));

        const s = (id, d) => { const e = g(id); if(e) e.style.display = d; };

        // 1. GESTION DU BLOC GLOBAL DE CONTRÔLE
        // Si c'est un nouvel équipement, on cache TOUT le bloc. Sinon on l'affiche.
        s('divControlContent', isNew ? 'none' : 'flex');

        s('divshowSomfyButtons', 'flex');
        btns.forEach(id => s(id, 'none'));
        ['blocPairDevice', 'divLinkedRemoteList', 'labelPosContainer'].forEach(id => s(id, 'none'));

        getJSONSync(isNew ? '/getNextShade' : `/shade?shadeId=${shadeId}`, (err, shade) => {
            if (err) return ui.serviceError(err);

            if (isNew) {
                Object.assign(shade, {
                    name: '', shadeType: 4, roomId: 0, downTime: 10000, upTime: 10000,
                    tiltTime: 7000, tiltType: 0, flipCommands: 0, flipPosition: 0, paired: 0
                });
            }
            if (!isNew) {
                s('labelPosContainer', 'block');
                s('blocPairDevice', 'flex');
                ['btnLinkRemote', 'btnSetRollingCode'].forEach(id => s(id, 'flex'));
                s('hrSetRollingC', 'block');
                s(shade.paired ? 'btnUnpairShade' : 'btnPairShade', 'flex');

                if (g('valPos')) g('valPos').innerText = shade.position;
                this.setLinkedRemotesList(shade);
            }

            // --- Gestion dynamique du Titre, Description et Badge Capacity ---
            // --- Gestion dynamique du Titre et de la Description avec capacité ---
            const hTitle = g('somfyHeaderTitle'), hDesc = g('somfyHeaderDesc');

            if (hTitle && hDesc) {
                if (isNew) {
                    // Mode Création : Phrase brute sans badge
                    hTitle.innerText = tr('SHADE_CREATE_TITLE');
                    hDesc.innerText = tr('SHADE_CREATE_DESC');
                } else {
                    // Mode Édition : Titre + Phrase avec le badge de capacité globale (ex: 2/30)
                    hTitle.innerText = tr('SHADE_EDIT_TITLE');

                    const currentCount = this.shades ? this.shades.length : 0;
                    const formattedCapacity = `<span class="desc-highlight">${currentCount}/30</span>`;

                    hDesc.innerHTML = tr('SHADE_EDIT_DESC').replace('%s', formattedCapacity);
                }
            }



            if (g('valTilt')) g('valTilt').innerText = shade.tiltPosition || 0;

            ui.setFocus('btnPairShade', !isNew && !shade.paired);

            const rev = shade.flipPosition,
            p = rev ? 100 - shade.position : shade.position,
            tp = rev ? 100 - shade.tiltPosition : shade.tiltPosition;

            if (ico) {
                const st = ico.style;
                st.setProperty('--shade-position', p);
                st.setProperty('--fpos', p + '%');
                st.setProperty('--tilt-position', tp + '%');
                ico.setAttribute('data-shadeid', isNew ? '*' : shadeId);
            }
            g('btnSaveShadeText').innerText = tr(isNew ? 'BT_CREATE' : 'BT_SAVE');
            g('useSaveShadeIcon').setAttribute('href', isNew ? '#svg-add' : '#svg-download');
            g('spanShadeId').innerText = isNew ? '*' : shadeId;

            ui.toElement(g('somfyShade'), shade);
            if (g('selShadeBitLength')) g('somfyShade').setAttribute('data-bitlength', g('selShadeBitLength').value);
            this.onShadeTypeChanged(g('selShadeType'));
            this.showEditShade(true);
            // Ne commence à suivre les modifications qu'une fois le formulaire rempli avec les
            // valeurs actuelles, pour ne pas marquer "modifié" ce remplissage programmatique.
            watchDirty(g('somfyShade'));
        });
    }
    saveShade() {
        const g = get,
        sId = parseInt(g('spanShadeId').innerText, 10),
        obj = ui.fromElement(g('somfyShade')),
        settings = g('divSomfySettings');

        const checks = [
            [isNaN(obj.remoteAddress) || obj.remoteAddress < 1 || obj.remoteAddress > 16777215, 'ERR_REMOTE_ADDRESS_INVALID'],
            [!obj.name || obj.name.length > 20, 'ERR_DEVIVE_NAME_INVALID'],
            [isNaN(obj.upTime) || obj.upTime < 1 || obj.upTime > 180000, 'ERR_UP_TIME_INVALID'],
            [isNaN(obj.downTime) || obj.downTime < 1 || obj.downTime > 180000, 'ERR_DOWN_TIME_INVALID']
        ];

        const basicError = checks.find(c => c[0]);
        if (basicError) return ui.errorMessage(settings, tr(basicError[1]));
        if (obj.proto === 8 || obj.proto === 9) {
            const isSp = [5, 14, 15, 16, 10].includes(obj.shadeType);

            if (obj.gpioUp === obj.gpioDown && !(isSp && obj.proto === 9)) {
                return ui.errorMessage(settings, tr('ERR_GPIO_UP_DOWN_NOT_UNIQUE'));
            }
            if (!isSp && obj.proto === 9 && (obj.gpioMy === obj.gpioUp || obj.gpioMy === obj.gpioDown)) {
                return ui.errorMessage(settings, tr('ERR_GPIO_UP_DOWN_MY_NOT_UNIQUE'));
            }
        }
        const isNew = isNaN(sId) || sId >= 255;
        if (!isNew) obj.shadeId = sId;

        putJSONSync(isNew ? '/addShade' : '/saveShade', obj, (err, shade) => {
            if (err) return ui.serviceError(err);

            logger.debug("Shade saved/added:", shade);
            const msg = isNew ? tr('MSG_ADD_SUCCESS') : tr('MSG_SAVE_SUCCESS');
            ui.successMessage(msg);
            clearDirty();
            this.updateShadeList()
            this.openEditShade(shade.shadeId);
        });
    }
    deleteShade(shadeId) {
        let valid = true;
        if (isNaN(shadeId) || shadeId >= 255 || shadeId <= 0) {
            ui.errorMessage(tr('ERR_DEVICE_ID_REQUIRED'));
            valid = false;
        }
        if (valid) {
            getJSONSync(`/shade?shadeId=${shadeId}`, (err, shade) => {
                if (err) ui.serviceError(err);
                else if (shade.inGroup) ui.errorMessage(tr('ERR_DEVICE_IN_GROUP'));
                else {
                    let prompt = ui.promptMessage(tr('PROMPT_DELETE_SHADE'), () => {
                        ui.clearErrors();
                        putJSONSync('/deleteShade', { shadeId: shadeId }, (err, shade) => {
                            this.updateShadeList();
                            prompt.remove;
                        });
                    });
                    prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_DELETE_SHADE_WARNING")}</p><p>${tr("PROMPT_DELETE_SHADE_CONFIRM").replace("{SHADE_NAME}", shade.name)}</p>`;
                }
            });
        }
    }
    updateShadeList() {
        getJSONSync('/shades', (err, shades) => {
            if (err) {
                logger.error('Failed to load shades:', err);
                ui.serviceError(err);
            }
            else {
                //console.log(shades);
                // Create the shades list.
                this.setShadesList(shades);
                if (typeof cb === 'function') cb();
            }
        });
    }





// =========================================================================
// SECTION : GESTION DES GROUPES (GROUP)
// =========================================================================

    showEditGroup(bShow) {
        let el = get('divLinking');
        if (el) el.remove();
        el = get('divLinkRepeater');
        if (el) el.remove();
        el = get('divPairing');
        if (el) el.remove();
        el = get('divRollingCode');
        if (el) el.remove();
        el = get('somfyGroup');
        if (el) el.style.display = bShow ? '' : 'none';
        el = get('divGroupListContainer');
        if (el) el.style.display = bShow ? 'none' : '';
        if (!bShow) clearDirty();
        if (bShow) {
            this.showEditRoom(false);
            this.showEditShade(false);
        }
    }

    openEditGroup(groupId) { confirmDiscardChanges(() => this._openEditGroup(groupId)); }
    _openEditGroup(groupId) {
        const g = get,
        isNew = groupId === undefined,
        elGroup = g('somfyGroup'),
        btnLink = g('btnLinkShade'),
        btnSave = g('btnSaveGroup'),
        btnContainer = g('divSomfyGroupButtons'),
        divLinkedShades = g('divLinkedShadeList'),
        blocPairParent = g('blocPairGroup');

        if (isNew && this.groups?.length >= 14)
            return ui.errorMessage(g('divSomfySettings'), tr('ERR_GROUP_LIMIT_REACHED'));

        const s = (idOrElem, d) => { const e = (typeof idOrElem === 'string') ? g(idOrElem) : idOrElem; if(e) e.style.display = d; };

        divLinkedShades.innerHTML = '';

        s(btnContainer, 'flex');
        btnContainer?.classList.toggle('disabled', isNew);
        s(btnLink, 'none');
        s(btnSave, 'none');
        s(blocPairParent, 'none');
        s(divLinkedShades, 'none');

        getJSONSync(isNew ? '/getNextGroup' : `/group?groupId=${groupId}`, (err, group) => {
            if (err) return ui.serviceError(err);

            if (isNew) {
                Object.assign(group, {
                    name: '', flipCommands: false, shades: []
                });
            }
            if (!isNew) {
                s(btnLink, 'flex');
                s(blocPairParent, 'flex');
                s(divLinkedShades, 'block');

                const hasShades = (group.shades && group.shades.length > 0);
                btnContainer?.classList.toggle('disabled', !hasShades);

                ui.setFocus(btnLink, !isNew && !hasShades);
                this.setLinkedShadesList(group);
            }


            // --- Gestion dynamique du Titre et de la Description avec capacité (Style Badge) ---
            const hTitle = g('somfyGroupHeaderTitle'), hDesc = g('somfyGroupHeaderDesc');

            if (hTitle && hDesc) {
                if (isNew) {
                    // Mode Création : Phrase simple sans badge
                    hTitle.innerText = tr('GROUP_CREATE_TITLE');
                    hDesc.innerText = tr('GROUP_CREATE_DESC');
                } else {
                    // Mode Édition : Titre + Description agrémentée du badge de quota
                    hTitle.innerText = tr('GROUP_EDIT_TITLE');

                    const currentCount = this.groups ? this.groups.length : 0;
                    const formattedCapacity = `<span class="desc-highlight">${currentCount}/14</span>`;

                    hDesc.innerHTML = tr('GROUP_EDIT_DESC').replace('%s', formattedCapacity);
                }
            }

            g('btnSaveGroupText').innerText = tr(isNew ? 'BT_CREATE' : 'BT_SAVE');
            g('useSaveGroupIcon').setAttribute('href', isNew ? '#svg-add' : '#svg-download');

            s(btnSave, 'flex');
            g('spanGroupId').innerText = isNew ? '*' : groupId;

            ui.toElement(elGroup, group);
            this.showEditGroup(true);
            watchDirty(elGroup);
        });
    }
    saveGroup() {
        const g = get,
        sId = g('spanGroupId').innerText,
        groupId = parseInt(sId, 10),
        obj = ui.fromElement(g('somfyGroup')),
        isNew = isNaN(groupId) || groupId >= 255;

        const checks = [
            [isNaN(obj.remoteAddress) || obj.remoteAddress < 1 || obj.remoteAddress > 16777215, 'ERR_REMOTE_ADDRESS_INVALID'],
            [!obj.name || obj.name.length > 20, 'ERR_DEVIVE_NAME_INVALID']
        ];
        const error = checks.find(c => c[0]);
        if (error) return ui.errorMessage(tr(error[1]));
        if (!isNew) obj.groupId = groupId;

        putJSONSync(isNew ? '/addGroup' : '/saveGroup', obj, (err, group) => {
            if (err) return ui.serviceError(err);

            logger.debug("Group saved:", group);
            const msg = isNew ? tr('MSG_ADD_SUCCESS') : tr('MSG_SAVE_SUCCESS');
            ui.successMessage(msg);
            clearDirty();

            // SÉCURITÉ COMPTEUR : Si c'est un nouveau groupe, on l'ajoute temporairement au tableau local
            // pour que openEditGroup() calcule tout de suite le bon nombre.
            if (isNew) {
                if (!this.groups) this.groups = [];
                // On vérifie s'il n'est pas déjà dedans pour éviter les doublons
                if (!this.groups.some(g => g.groupId === group.groupId)) {
                    this.groups.push(group);
                }
            }

            // On affiche instantanément tout le bloc de contrôle (ton comportement initial parfait)
            this.openEditGroup(group.groupId);

            // On rafraîchit proprement la liste en arrière-plan depuis le serveur
            this.updateGroupList(() => {
                this.openEditGroup(group.groupId);
            });
        });
    }
    deleteGroup(groupId) {
        let valid = true;
        if (isNaN(groupId) || groupId >= 255 || groupId <= 0) {
            ui.errorMessage(tr('ERR_INVALID_GROUP_ID'));
            valid = false;
        }
        if (valid) {
            getJSONSync(`/group?groupId=${groupId}`, (err, group) => {
                if (err) ui.serviceError(err);
                else {
                    if (group.linkedShades.length > 0) {
                        ui.errorMessage(tr('ERR_GROUP_NOT_EMPTY'));
                    }
                    else {
                        let prompt = ui.promptMessage(tr('PROMPT_DELETE_GROUP'), () => {
                            putJSONSync('/deleteGroup', { groupId: groupId }, (err, g) => {
                                if (err) ui.serviceError(err);
                                this.updateGroupList();
                                prompt.remove();
                            });
                        });
                        prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_DELETE_GROUP_CONFIRM").replace("{GROUP_NAME}", group.name)}</p>`;
                    }
                }
            });
        }
    }
    updateGroupList() {
        getJSONSync('/groups', (err, groups) => {
            if (err) {
                logger.error('Failed to load groups:', err);
                ui.serviceError(err);
            }
            else {
                logger.debug('Group list updated,', groups.length, 'groups');
                // Create the groups list.
                this.setGroupsList(groups);
                if (typeof cb === 'function') cb();
            }
        });
    }




// =========================================================================
// SECTION : PROGRAMMATION HORAIRE (SCHEDULES)
// =========================================================================

    updateScheduleList() {
        getJSONSync('/schedules', (err, schedules) => {
            if (err) {
                logger.error('Failed to load schedules:', err);
                ui.serviceError(err);
            }
            else this.setScheduleList(schedules);
        });
    }
    // dayMask : bit0=dimanche ... bit6=samedi (aligné sur struct tm::tm_wday côté firmware).
    dayMaskLabel(dayMask) {
        const days = [
            [2, 'DAY_MON'], [4, 'DAY_TUE'], [8, 'DAY_WED'], [16, 'DAY_THU'],
            [32, 'DAY_FRI'], [64, 'DAY_SAT'], [1, 'DAY_SUN']
        ];
        return days.filter(d => dayMask & d[0]).map(d => tr(d[1])).join(' ');
    }
    scheduleTargetName(sc) {
        if (!sc) return '';
        if (sc.targetType === 'group') {
            const grp = (this.groups || []).find(x => x.groupId === sc.targetId);
            return grp ? grp.name : `${tr('SCHEDULE_TARGET_TYPE_GROUP')} #${sc.targetId}`;
        }
        const shd = (this.shades || []).find(x => x.shadeId === sc.targetId);
        return shd ? shd.name : `${tr('SCHEDULE_TARGET_TYPE_SHADE')} #${sc.targetId}`;
    }
    setScheduleList(schedules) {
        this.schedules = schedules || [];
        this.schedules.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
        let divCfg = '';
        for (let i = 0; i < this.schedules.length; i++) {
            const sc = this.schedules[i];
            const hh = sc.hour.toString().padStart(2, '0');
            const mm = sc.minute.toString().padStart(2, '0');
            const targetName = this.scheduleTargetName(sc);
            const label = (sc.name && sc.name.length > 0) ? sc.name : targetName;
            divCfg += `<div class="uniRow${sc.enabled ? '' : ' disabled'}" data-scheduleid="${sc.id}">
            <div class="uniLeft">
            <div class="uniblocSvg-S"><svg><use href="#svg-schedule"></use></svg></div>
            <div class="uniText">
            <div class="uniLabel">${label}</div>
            <div class="uniStatus">${this.dayMaskLabel(sc.dayMask)} &middot; ${hh}:${mm} &middot; ${targetName} &middot; ${sc.targetPos}%</div>
            </div>
            </div>
            <div class="uniRight">
            <div class="divEditDelete-svg" onclick="somfy.openEditSchedule(${sc.id});"><svg class="icon-svg"><use href="#svg-edit"></use></svg></div>
            <div class="divEditDelete-svg" onclick="somfy.deleteSchedule(${sc.id});"><svg class="icon-svg" style="color: var(--color-danger);"><use href="#svg-close"></use></svg></div>
            </div>
            </div>`;
        }
        get('divScheduleList').innerHTML = divCfg;
        const hasSchedules = this.schedules.length > 0;
        const empty = get('divScheduleEmptyState'), content = get('divScheduleListContent');
        if (empty) empty.style.display = hasSchedules ? 'none' : 'flex';
        if (content) content.style.display = hasSchedules ? '' : 'none';
    }
    showEditSchedule(bShow) {
        let el = get('somfySchedule');
        if (el) el.style.display = bShow ? '' : 'none';
        el = get('divScheduleListContainer');
        if (el) el.style.display = bShow ? 'none' : '';
        if (!bShow) clearDirty();
        if (bShow) {
            this.showEditRoom(false);
            this.showEditShade(false);
            this.showEditGroup(false);
        }
    }
    populateScheduleTargetSelect(selectedType, selectedId) {
        const sel = get('selScheduleTarget');
        if (!sel) return;
        sel.innerHTML = '';

        const shadeGrp = document.createElement('optgroup');
        shadeGrp.setAttribute('label', tr('SCHEDULE_TARGET_TYPE_SHADE'));
        (this.shades || []).forEach(s => {
            const opt = document.createElement('option');
            opt.value = `shade:${s.shadeId}`;
            opt.text = s.name;
            shadeGrp.appendChild(opt);
        });
        if (shadeGrp.children.length > 0) sel.appendChild(shadeGrp);

        const groupGrp = document.createElement('optgroup');
        groupGrp.setAttribute('label', tr('SCHEDULE_TARGET_TYPE_GROUP'));
        (this.groups || []).forEach(grp => {
            const opt = document.createElement('option');
            opt.value = `group:${grp.groupId}`;
            opt.text = grp.name;
            groupGrp.appendChild(opt);
        });
        if (groupGrp.children.length > 0) sel.appendChild(groupGrp);

        if (selectedType && typeof selectedId !== 'undefined') sel.value = `${selectedType}:${selectedId}`;
    }
    openEditSchedule(scheduleId) { confirmDiscardChanges(() => this._openEditSchedule(scheduleId)); }
    _openEditSchedule(scheduleId) {
        const isNew = typeof scheduleId === 'undefined';
        const g = get;

        if (isNew && this.schedules && this.schedules.length >= 32)
            return ui.errorMessage(g('divSomfySettings'), tr('ERR_SCHEDULE_LIMIT_REACHED'));

        const afterLoad = (sc) => {
            this.populateScheduleTargetSelect(sc.targetType, sc.targetId);
            g('fldScheduleName').value = sc.name || '';

            document.querySelectorAll('.schedule-day-btn').forEach(btn => {
                const bit = parseInt(btn.getAttribute('data-bit'), 10);
                btn.classList.toggle('active', ((sc.dayMask || 0) & bit) !== 0);
            });

            const hh = (sc.hour || 0).toString().padStart(2, '0');
            const mm = (sc.minute || 0).toString().padStart(2, '0');
            g('fldScheduleTime').value = `${hh}:${mm}`;

            g('slidScheduleTargetPos').value = sc.targetPos || 0;
            g('spanScheduleTargetPos').innerText = sc.targetPos || 0;

            g('cbScheduleEnabled').checked = (typeof sc.enabled === 'undefined') ? true : makeBool(sc.enabled);

            g('somfyScheduleHeaderTitle').innerText = tr(isNew ? 'SCHEDULE_CREATE_TITLE' : 'SCHEDULE_EDIT_TITLE');
            g('somfyScheduleHeaderDesc').innerText = tr(isNew ? 'SCHEDULE_CREATE_DESC' : 'SCHEDULE_EDIT_DESC');
            g('btnSaveScheduleText').innerText = tr(isNew ? 'BT_CREATE' : 'BT_SAVE');
            g('useSaveScheduleIcon').setAttribute('href', isNew ? '#svg-add' : '#svg-download');
            g('somfySchedule').setAttribute('data-scheduleid', isNew ? '' : scheduleId);

            this.showEditSchedule(true);
            watchDirty(g('somfySchedule'));
        };

        if (isNew) {
            const firstShade = (this.shades && this.shades.length > 0) ? this.shades[0] : undefined;
            afterLoad({
                name: '', dayMask: 0, hour: 9, minute: 0,
                targetType: 'shade', targetId: firstShade ? firstShade.shadeId : undefined,
                targetPos: 0, enabled: true
            });
        } else {
            getJSONSync(`/schedule?scheduleId=${scheduleId}`, (err, sc) => {
                if (err) return ui.serviceError(err);
                afterLoad(sc);
            });
        }
    }
    saveSchedule() {
        const g = get;
        const scheduleIdAttr = g('somfySchedule').getAttribute('data-scheduleid');
        const isNew = !scheduleIdAttr;

        let dayMask = 0;
        document.querySelectorAll('.schedule-day-btn.active').forEach(btn => {
            dayMask |= parseInt(btn.getAttribute('data-bit'), 10);
        });

        const targetVal = g('selScheduleTarget').value || '';
        const [targetType, targetIdStr] = targetVal.split(':');
        const targetId = parseInt(targetIdStr, 10);

        const timeVal = g('fldScheduleTime').value || '00:00';
        const [hourStr, minuteStr] = timeVal.split(':');

        const obj = {
            name: g('fldScheduleName').value || '',
            dayMask: dayMask,
            hour: parseInt(hourStr, 10),
            minute: parseInt(minuteStr, 10),
            targetType: targetType,
            targetId: targetId,
            targetPos: parseInt(g('slidScheduleTargetPos').value, 10),
            enabled: g('cbScheduleEnabled').checked
        };

        const checks = [
            [dayMask === 0, 'ERR_SCHEDULE_NO_DAYS'],
            [!targetType || isNaN(targetId), 'ERR_SCHEDULE_NO_TARGET']
        ];
        const error = checks.find(c => c[0]);
        if (error) return ui.errorMessage(tr(error[1]));

        if (!isNew) obj.id = parseInt(scheduleIdAttr, 10);

        putJSONSync(isNew ? '/addSchedule' : '/saveSchedule', obj, (err, sc) => {
            if (err) return ui.serviceError(err);
            logger.debug('Schedule saved:', sc);
            ui.successMessage(tr(isNew ? 'MSG_ADD_SUCCESS' : 'MSG_SAVE_SUCCESS'));
            this.showEditSchedule(false);
            this.updateScheduleList();
        });
    }
    deleteSchedule(scheduleId) {
        const sc = (this.schedules || []).find(x => x.id === scheduleId);
        const desc = sc ? `${sc.hour.toString().padStart(2, '0')}:${sc.minute.toString().padStart(2, '0')} - ${this.scheduleTargetName(sc)}` : '';
        let prompt = ui.promptMessage(tr('PROMPT_DELETE_SCHEDULE'), () => {
            putJSONSync('/deleteSchedule', { id: scheduleId }, (err) => {
                if (err) ui.serviceError(err);
                this.updateScheduleList();
                prompt.remove();
            });
        });
        const subMsg = prompt.querySelector('.sub-message');
        if (subMsg) subMsg.innerHTML = `<p>${tr('PROMPT_DELETE_SCHEDULE_CONFIRM').replace('{SCHEDULE_DESC}', desc)}</p>`;
    }




// =========================================================================
// SECTION : GESTION DES REPETEURS (REPEATER)
// =========================================================================

    updateRepeatList() {
        getJSONSync('/repeaters', (err, repeaters) => {
            if (err) {
                logger.error('Failed to load repeaters:', err);
                ui.serviceError(err);
            }
            else this.setRepeaterList(repeaters);
        });
    }






    setRollingCode(shadeId, rollingCode) {
        putJSONSync('/setRollingCode', { shadeId: shadeId, rollingCode: rollingCode }, (err, shade) => {
            if (err) ui.serviceError(get('divSomfySettings'), err);
            else {
                let dlg = get('divRollingCode');
                if (dlg) dlg.remove();
            }
        });
    }
    openSetRollingCode(shadeId) {
        let overlay = ui.waitMessage(get('divContainer'));
        getJSON(`/shade?shadeId=${shadeId}`, (err, shade) => {
            overlay.remove();
            if (err) return ui.serviceError(err);

            let div = document.createElement('div');
            div.id = 'divRollingCode';
            div.className = 'inst-overlay';

            div.innerHTML = `
            <div class="instructions-content">
            <div class="overlay-scroll-content">
            ${overlayHeader("ROLLING_CODE_TITLE", "ROLLING_CODE_DESC", "svg-warning")}



            <div class="error">
            <div class="error-header">
            <svg><use href="#svg-warning"></use></svg>
            <b>${tr("MSG_DANGER")}</b>
            </div>

            <div class="information-text">
            <span>${tr("ROLLING_CODE_WARNING_DESC_1")}</span>
            </div>
            </div>





            <div class="uniblocStep">${tr("ROLLING_CODE_WARNING_DESC_2")}</div>
            <div class="uniblocCol uniblocRollingCode">
            <label class="label" for="fldNewRollingCode">${tr("BT_ROLLING_CODE")}</label>
            <input id="fldNewRollingCode" class="inputAndSelect" min="0" max="65535" name="newRollingCode" type="number" value="${shade.lastRollingCode}">
            </div>
            </div>
            <div class="hrDivFooter-Instruc"></div>
            <div class="button-container-overlay">
            <button id="btnChangeRollingCode" class="bouton-Danger" type="button" onclick="somfy.setRollingCode(${shadeId}, parseInt(get('fldNewRollingCode').value, 10));">${tr("BT_SET_ROLLING_CODE")}</button>
            <button id="btnCancel" line type="button">${tr("BT_CANCEL_1")} </button>
            </div>
            </div>`;

            shOverlay(div);
            div.querySelector('#btnCancel').onclick = () => closeOverlay(div);
            ui.setFocus(btnCancel, true, 'var(--color-success)');
        });
    }
    setPaired(shadeId, paired) {
        let obj = { shadeId: shadeId, paired: paired || false };
        let div = get('divPairing');
        let overlay = typeof div === 'undefined' ? undefined : ui.waitMessage(div);
        putJSONSync('/setPaired', obj, (err, shade) => {
            if (overlay) overlay.remove();
            if (err) {
                logger.error('Failed to set pairing state:', err);
                ui.errorMessage(err.message);
            }
            else if (div) {
                logger.debug('Pairing state updated:', shade);
                this.showEditShade(true);
                get('btnSaveShade').style.display = 'flex';
                get('btnLinkRemote').style.display = '';
                if (shade.paired) {
                    get('btnUnpairShade').style.display = 'flex';
                    get('btnPairShade').style.display = 'none';
                }
                else {
                    get('btnPairShade').style.display = 'flex';
                    get('btnUnpairShade').style.display = 'none';
                }
                this.setLinkedRemotesList(shade);
                closeOverlay(div);
            }
        });
    }
    _shWiz(shadeId, isUnpair) {
        const sType = parseInt(get('somfyShade').getAttribute('data-shadetype'), 10);
        const isG = (sType === 5 || sType === 6);
        const pre = isUnpair ? 'UNPAIR' : 'PAIR';
        const dev = isG ? 'GARAGE' : 'SHADE';
        const progId = isUnpair ? 'btnSendUnpairing' : 'btnSendPairing';
        const stopId = isUnpair ? 'btnStopUnpairing' : 'btnStopPairing';
        const sucBtnId = isUnpair ? 'btnUnpairShade' : 'btnPairShade';
        const sucVal = isUnpair ? 0 : 1;
        const focusVal = isUnpair ? 1 : 0;
        const sucAction = `somfy.setPaired(${shadeId},${sucVal});ui.setFocus('${sucBtnId}',${focusVal});closeOverlay(get('divPairing'));`;
        const descKey = `${pre}_${dev}_DESC`;
        const stepTitles = ["WIZ_TITLE_STEP1", `${pre}_TITLE_STEP2`, "WIZ_TITLE_STEP3"];
        const t = (s, l) => {
            const sk = `${pre}_${dev}_STEP_${s}_${l}`, fk = `WIZ_${dev}_STEP_${s}_${l}`, r = tr(sk);
            return (r === sk) ? tr(fk) : r;
        };
        const it = (n, s, l) => `<div class="step-item"><div class="step-number">${n}</div><div class="step-text">${t(s, l)}</div></div>`;
        const inf = (s, l) => `
        <div class="information wizard-step" data-stepid="${s}"><div class="information-header"><svg><use href="#svg-info"></use></svg><b>${tr("MSG_NOTE")}</b></div><div class="information-text"><span>${t(s, l)}</span></div></div>`;

        let div = document.createElement('div');
        div.className = `inst-overlay wizard${ui.isExpertMode ? ' is-expert' : ''}`;
        div.id = 'divPairing';
        div.setAttribute('data-stepid', '1');
        div.setAttribute('data-type', 'link-remote');
        div.setAttribute('data-shadeid', shadeId);

        div.innerHTML = `
        <div class="instructions-content">

        ${overlayHeader(isUnpair ? "UNPAIR_TITLE" : "PAIR_TITLE", descKey, isG ? "svg-simpleGarage" : "svg-simpleShutter", {
            subtitle: false, // Exemple de sous-titre optionnel
            showInfo: true,                      // Mettre à false pour masquer le '?'
            showExpert: true                    // Desactive/Active le menu expert
        })}



        <div class="overlay-scroll-content">

        ${wizardStepper(stepTitles)}
        <div class="blocsteps">
        <div class="uniblocStep wizard-step" data-stepid="1">
        ${it('a', 1, 1)} ${it('b', 1, 2)} ${isG ? it('c', 1, 3) : ''}
        </div>
        ${!isG ? inf(1, 3) : ''}
        <div class="button-container-col wizard-step marginB25" data-expert data-stepid="2">
        <button id="${progId}" type="button">${tr("BT_PROG")}</button>
        </div>
        <div class="uniblocStep wizard-step" data-stepid="2">
        ${it('a', 2, 1)} ${it('b', 2, 2)} ${!isG ? it('c', 2, 3) : ''}
        </div>
        ${!isG ? inf(2, 4) : ''}
        <div class="button-container-col wizard-step marginB25" data-expert data-stepid="3">
        <button id="btnWizMarkSuc" type="button" class="btn-success" onclick="${sucAction}">${tr(isUnpair ? "BT_UNPAIRING_SUCCESS" : "BT_PAIRING_SUCCESS")}</button>
        </div>
        <div class="uniblocStep wizard-step" data-stepid="3">${it('a', 3, 1)}</div>
        <div class="empty-state wizard-step" data-stepid="3"><svg class="empty-icon"><use href=#svg-succes></use></svg></div>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="expert-only-buttons" data-expert>
        <button type="button" line onclick="closeOverlay(this.closest('.inst-overlay'))">${tr("BT_CANCEL_1")}</button>
        </div>
        <div class="button-container-overlay">
        <button id="${stopId}" class="wizard-step" data-stepid="1" line type="button">${tr("BT_CLOSE")}</button>
        <button id="btnWizPrev" class="wizard-step" data-mstepid="2,3" line type="button" onclick="ui.wizSetPrevStep(this.closest('.wizard'));">${tr("BT_GO_BACK")}</button>
        <button id="btnWizNext" class="wizard-step" data-mstepid="1,2" type="button" onclick="ui.wizSetNextStep(this.closest('.wizard'));">${tr("BT_NEXT")}</button>
        <button id="btnWizEnd" class="wizard-step" data-stepid="3" type="button">${tr(isG ? "BT_CLOSE" : "BT_CANCEL_1")}</button>
        </div>
        </div>`;

        const clearT = () => { if (this.btnTimer) { clearInterval(this.btnTimer); this.btnTimer = null; } };
        const fnRep = (err, shade) => {
            clearT();
            if (!err && mouseDown) somfy.sendCommandRepeat(shadeId, 'prog', null, fnRep);
        };

        let btnProg = div.querySelector(`#${progId}`);
        if (btnProg) {
            const onP = () => somfy.sendCommand(shadeId, 'prog', null, fnRep);
            btnProg.addEventListener('mousedown', onP, true);
            btnProg.addEventListener('touchstart', onP, true);
        }
        div.querySelectorAll(`#${stopId}, #btnWizEnd`).forEach(btn => {
            btn.onclick = () => closeOverlay(div, clearT);
        });

        ui.wizSetStep(div, 1);
        shOverlay(div, clearT);

        return div;
    }
    pairShade(shadeId) {
        return this._shWiz(shadeId, false);
    }

    unpairShade(shadeId) {
        return this._shWiz(shadeId, true);
    }
    sendCommand(shadeId, command, repeat, cb) {
        let obj = {};
        if (typeof shadeId.shadeId !== 'undefined') {
            obj = shadeId;
            cb = command;
            shadeId = obj.shadeId;
            repeat = obj.repeat;
            command = obj.command;
        }
        else {
            obj = { shadeId: shadeId };
            if (isNaN(parseInt(command, 10))) obj.command = command;
            else obj.target = parseInt(command, 10);
            if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        }
        logger.debug('Sending shade command:', obj);
        putJSON('/shadeCommand', obj, (err, shade) => {
            if (typeof cb === 'function') cb(err, shade);
        });
    }
    sendCommandRepeat(shadeId, command, repeat, cb) {
        //console.log(`Sending Shade command ${shadeId}-${command}`);
        let obj = {};
        if (typeof shadeId.shadeId !== 'undefined') {
            obj = shadeId;
            cb = command;
            shadeId = obj.shadeId;
            repeat = obj.repeat;
            command = obj.command;
        }
        else {
            obj = { shadeId: shadeId, command: command };
            if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        }
        putJSON('/repeatCommand', obj, (err, shade) => {
            if (typeof cb === 'function') cb(err, shade);
        });
    }
    sendGroupRepeat(groupId, command, repeat, cb) {
        let obj = { groupId: groupId, command: command };
        if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        putJSON(`/repeatCommand?groupId=${groupId}&command=${command}`, null, (err, group) => {
            if (typeof cb === 'function') cb(err, group);
        });
    }
    sendVRCommand(el) {
        if (typeof mouseDown === 'undefined') window.mouseDown = false;
        let pnl = get('divVirtualRemote');
        let dd = pnl.querySelector('#selVRMotor');
        let opt = dd.selectedOptions[0];
        let o = {
            type: opt.getAttribute('data-type'),
            address: opt.getAttribute('data-address'),
            cmd: el.getAttribute('data-cmd')
        };
        ui.fromElement(el.parentElement.parentElement, o);
        switch (o.type) {
            case 'shade':
                o.shadeId = parseInt(opt.getAttribute('data-shadeId'), 10);
                o.shadeType = parseInt(opt.getAttribute('data-shadeType'), 10);
                break;
            case 'group':
                o.groupId = parseInt(opt.getAttribute('data-groupId'), 10);
                break;
        }
        logger.debug('Virtual remote command:', o);
        let fnRepeatCommand = (err, shade) => {
            if (this.btnTimer) {
                clearTimeout(this.btnTimer);
                this.btnTimer = null;
            }
            if (err) return;
            if (mouseDown) {
                if (o.cmd === 'Sensor')
                    somfy.sendSetSensor(o);
                else if (o.type === 'group')
                    somfy.sendGroupRepeat(o.groupId, o.cmd, null, fnRepeatCommand);
                else
                    somfy.sendCommandRepeat(o, fnRepeatCommand);
            }
        }
        o.command = o.cmd;
        if (o.cmd === 'Sensor') {
            somfy.sendSetSensor(o);
        }
        else if (o.type === 'group')
            somfy.sendGroupCommand(o.groupId, o.cmd, null, (err, group) => { fnRepeatCommand(err, group); });
        else
            somfy.sendCommand(o, (err, shade) => { fnRepeatCommand(err, shade); });
    }
    sendSetSensor(obj, cb) {
        putJSON('/setSensor', obj, (err, device) => {
            if (typeof cb === 'function') cb(err, device);
        });
    }
    sendGroupCommand(groupId, command, repeat, cb) {
        logger.debug(`Sending Group command ${groupId}-${command}`);
        let obj = { groupId: groupId };
        if (isNaN(parseInt(command, 10))) obj.command = command;
        if (typeof repeat === 'number') obj.repeat = parseInt(repeat);
        putJSON('/groupCommand', obj, (err, group) => {
            if (typeof cb === 'function') cb(err, group);
        });
    }
    sendTiltCommand(shadeId, command, cb) {
        logger.debug(`Sending Tilt command ${shadeId}-${command}`);
        if (isNaN(parseInt(command, 10)))
            putJSON('/tiltCommand', { shadeId: shadeId, command: command }, (err, shade) => {
                if (typeof cb === 'function') cb(err, shade);
            });
                else
                    putJSON('/tiltCommand', { shadeId: shadeId, target: parseInt(command, 10) }, (err, shade) => {
                        if (typeof cb === 'function') cb(err, shade);
                    });
    }
    linkRemote(shadeId) {
        let div = document.createElement('div');
        div.className = 'inst-overlay';
        div.id = 'divLinking';
        div.setAttribute('data-type', 'link-remote');
        div.setAttribute('data-shadeid', shadeId);

        div.innerHTML = `
        <div class="instructions-content">
        ${overlayHeader("PAIR_TITLE", "LINK_REMOTE_DESC", "svg-remote")}
        <div class="overlay-scroll-content">

        <div class="uniblocStep">${tr("LINK_REMOTE_DESC_1")}</div>

        <div class="information">
        <div class="information-header">
        <svg><use href="#svg-info"></use></svg>
        <b>${tr("MSG_NOTE")}</b>
        </div>
        <div class="information-text">
        <span>${tr("LINK_REMOTE_DESC_2")}</span>
        </div>
        </div>

        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay">
        <button id="btnStopLink" line type="button">${tr("BT_CANCEL_1")}</button>
        </div>
        </div>
        </div>`;

        shOverlay(div);
        div.querySelector('#btnStopLink').onclick = () => closeOverlay(div);

        return div;
    }
    linkRepeatRemote() {
        let div = document.createElement('div');
        div.className = 'inst-overlay';
        div.id = 'divLinkRepeater';
        div.setAttribute('data-type', 'link-repeatremote');

        div.innerHTML = `
        <div class="instructions-content">
        ${overlayHeader("REPEAT_REMOTE_TITLE", "REPEAT_REMOTE_DESC", "svg-repeater")}
        <div class="overlay-scroll-content">




        <div class="uniblocStep">
        <div class="step-item"><div class="step-number">a</div><div class="step-text">${tr("REPEAT_REMOTE_DESC_1")}</div></div>
        <div class="step-item"><div class="step-number">b</div><div class="step-text">${tr("REPEAT_REMOTE_DESC_2")}</div></div>
        <div class="step-item"><div class="step-number">c</div><div class="step-text">${tr("REPEAT_REMOTE_DESC_5")}</div></div>
        </div>



        <div class="warning">
        <div class="warning-header">
        <svg><use href="#svg-warning"></use></svg>
        <b>${tr("MSG_ALERT")}</b>
        </div>

        <div class="information-text">
        <span>${tr("REPEAT_REMOTE_DESC_4")}<br><br>${tr("REPEAT_REMOTE_DESC_3")}</span>
        </div>
        </div>








        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay">
        <button id="btnStopLinking" type="button" line>${tr("BT_CANCEL_1")}</button>
        </div>
        </div>`;

        div.querySelector('#btnStopLinking').onclick = () => closeOverlay(div);
        shOverlay(div);

        return div;
    }




    _gpWiz(groupId, isUnlink, shadeId = null) {
        const pre = isUnlink ? 'UNLINK' : 'LINK';
        const stepsCount = isUnlink ? 3 : 4;
        const btnActionId = isUnlink ? 'btnUnpairFromGroup' : 'btnPairToGroup';
        const titleKey = `${pre}_GROUP_TITLE`;
        const descKey = `${pre}_GROUP_DESC`;
        const t = (s, l) => {
            const sk = `${pre}_GROUP_STEP_${s}_${l}`;
            const fk = `WIZ_LINK_GROUP_STEP_${s}_${l}`;
            const r = tr(sk);
            return (r === sk) ? tr(fk) : r;
        };
        const it = (n, s, l) => `<div class="step-item"><div class="step-number">${n}</div><div class="step-text">${t(s, l)}</div></div>`;
        const inf = (s, l) => `
        <div class="information wizard-step" data-stepid="${s}">
        <div class="information-header">
        <svg><use href="#svg-info"></use></svg>
        <b>${tr("MSG_NOTE")}</b>
        </div>
        <div class="information-text">
        <span>${t(s, l)}</span>
        </div>
        </div>`;

        let div = document.createElement('div');
        div.className = `inst-overlay wizard${ui.isExpertMode ? ' is-expert' : ''}`;
        div.id = isUnlink ? 'divUnlinkGroup' : 'divLinkGroup';
        div.setAttribute('data-groupid', groupId);
        div.setAttribute('data-stepid', '1');

        const stepTitles = [];
        for (let i = 1; i <= stepsCount; i++) {
            let titleIndex = i;
            if (isUnlink && i === 2) titleIndex = 3;
            if (isUnlink && i === 3) titleIndex = 3;

            let tk = `WIZ_LINK_GROUP_TITLE_STEP${titleIndex}`;
            if (tr(tk) === tk || (isUnlink && i === 3) || (!isUnlink && i === 2) || (!isUnlink && i === 4)) {
                tk = `${pre}_GROUP_TITLE_STEP${isUnlink && i === 3 ? '_3' : titleIndex}`;
            }
            stepTitles.push(tk);
        }

        div.innerHTML = `
        <div class="instructions-content">

        ${overlayHeader(titleKey, descKey, "svg-simpleShutter" , {
            subtitle: false,
            showInfo: true,
            showExpert: true
        })}

        <div class="overlay-scroll-content">

        ${wizardStepper(stepTitles)}
        <div class="blocGroupsteps">
        ${inf(1, 1)}
        <div class="uniblocStep wizard-step" data-stepid="1">
        ${it('a', 1, 2)} ${it('c', 1, 3)}
        </div>
        ${!isUnlink ? `
        <div class="uniblocCol LinkGroupSelect wizard-step" data-expert data-stepid="2">
        <label class="label" for="selAvailShades">${tr("LINK_GROUP_SELECT_SHADE")}</label>
        <select id="selAvailShades" class="inputAndSelect" data-bind="shadeId" onchange="document.querySelectorAll('.divWizShadeName').forEach(el => el.innerHTML = this.options[this.selectedIndex].text);"></select>
        </div>
        <div class="uniblocStep wizard-step" data-stepid="2">
        ${it('a', 2, 1)} ${it('b', 2, 2)}
        </div>
        ${inf(2, 3)}
        ` : ''}
        <div class="blocsteps-row wizard-step" data-expert data-stepid="${isUnlink ? 2 : 3}">
        <div class="divWizShadeName"></div>
        <button type="button" id="btnOpenMemory">${tr("BT_OPEN_MEMORY")}</button>
        </div>
        <div class="uniblocStep wizard-step" data-stepid="${isUnlink ? 2 : 3}">
        ${it('a', isUnlink ? 2 : 3, 1)}
        ${it('b', isUnlink ? 2 : 3, 2)}
        </div>
        ${isUnlink ? inf(2, 3) : inf(3, 3)}
        <div class="blocsteps-row wizard-step" data-expert data-stepid="${isUnlink ? 3 : 4}">
        <div class="divWizShadeName"></div>
        <button id="${btnActionId}" type="button">${tr(isUnlink ? "BT_UNPAIR_GROUP" : "BT_PAIR_TO_GROUP")}</button>
        </div>
        <div class="uniblocStep wizard-step" data-stepid="${isUnlink ? 3 : 4}">
        ${it('a', isUnlink ? 3 : 4, 1)}
        ${it('b', isUnlink ? 3 : 4, 2)}
        <div class="empty-state"><svg class="empty-icon"><use href=#svg-succes></use></svg></div>
        </div>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="expert-only-buttons" data-expert>
        <button type="button" line onclick="closeOverlay(this.closest('.inst-overlay'))">${tr("BT_CANCEL_1")}</button>
        </div>
        <div class="button-container-overlay">
        <button id="btnWizStop" class="wizard-step" data-stepid="1" line type="button">${tr("BT_CANCEL_1")}</button>
        <button id="btnWizPrev" class="wizard-step" data-mstepid="${isUnlink ? '2,3' : '2,3,4'}" line type="button" onclick="ui.wizSetPrevStep(this.closest('.wizard'));">${tr("BT_GO_BACK")}</button>
        <button id="btnWizNext" class="wizard-step" data-mstepid="${isUnlink ? '1,2' : '1,2,3'}" type="button" onclick="ui.wizSetNextStep(this.closest('.wizard'));">${tr("BT_NEXT")}</button>
        <button id="btnWizEnd" class="wizard-step" data-stepid="${stepsCount}" type="button">${tr("BT_CANCEL_1")}</button>
        </div>
        </div>`;

        const clearT = () => { if (this.btnTimer) { clearTimeout(this.btnTimer); this.btnTimer = null; } };

        div.querySelectorAll('#btnWizStop, #btnWizEnd').forEach(btn => btn.onclick = () => closeOverlay(div, clearT));

        const hP = div.querySelector('.instructions-header p');
        if (hP) hP.innerHTML += ' <span id="spanGroupName" class="groupNameSpan"></span>';

        div.querySelector('#btnOpenMemory').onclick = () => {
            const sId = isUnlink ? shadeId : ui.fromElement(div).shadeId;
            putJSONSync('/shadeCommand', { shadeId: sId, command: 'prog', repeat: 40 }, (err) => {
                if (err) ui.serviceError(err);
                else {
                    let prompt = ui.promptMessage(tr('PROMPT_CONFIRM_MOTOR_RESPONSE'), () => {
                        ui.wizSetNextStep(div);
                        closeOverlay(prompt);
                    });
                    prompt.querySelector('.sub-message').innerHTML = isUnlink ?
                    `<hr><p>${tr("PROMPT_SHADE_MOVE_CONFIRM")}</p><p>${tr("UNLINK_GROUP_METHOD_1")}</p>` :
                    `<p>${tr("PROMPT_SHADE_MOVE_CONFIRM")}</p><p>${tr("LINK_GROUP_MEMORY_READY_FOR_GROUP")}</p>`;
                }
            });
        };
        const btnAction = div.querySelector(`#${btnActionId}`);
        let fnRepeat = (err, o) => {
            clearT();
            if (!err && mouseDown) {
                if (o.cmd === 'Sensor') somfy.sendSetSensor(o);
                else if (o.groupId !== undefined) somfy.sendGroupRepeat(o.groupId, 'prog', null, fnRepeat);
                else somfy.sendCommandRepeat(o.shadeId, 'prog', null, fnRepeat);
            }
        };
        if (isUnlink) {
            btnAction.onclick = () => {
                putJSONSync('/groupCommand', { groupId: groupId, command: 'prog', repeat: 1 }, (err) => {
                    if (err) ui.serviceError(err);
                    else {
                        let prompt = ui.promptMessage(tr('PROMPT_CONFIRM_MOTOR_RESPONSE'), () => {
                            putJSONSync('/unlinkFromGroup', { groupId: groupId, shadeId: shadeId }, (err, group) => {
                                somfy.setLinkedShadesList(group);
                                this.updateGroupList();
                            });
                            closeOverlay(prompt);
                            closeOverlay(div, clearT);
                        });
                        prompt.querySelector('.sub-message').innerHTML = `<hr><p>${tr("PROMPT_SHADE_MOVE_CONFIRM")}</p><p>${tr("PROMPT_SHADE_MOVE_DONE")}</p>`;
                    }
                });
            };
        } else {
            btnAction.onmousedown = () => {
                mouseDown = true;
                somfy.sendGroupCommand(groupId, 'prog', null, fnRepeat);
            };
            btnAction.onmouseup = () => {
                mouseDown = false;
                let obj = ui.fromElement(div);
                let prompt = ui.promptMessage(tr('PROMPT_CONFIRM_MOTOR_RESPONSE'), () => {
                    putJSONSync('/linkToGroup', { groupId: groupId, shadeId: obj.shadeId }, (err, group) => {
                        somfy.setLinkedShadesList(group);
                        this.updateGroupList();
                    });
                    closeOverlay(prompt);
                    closeOverlay(div, clearT);
                });
                prompt.querySelector('.sub-message').innerHTML = `<p>${tr("PROMPT_SHADE_GROUP_LINK_CONFIRM")}</p><p>${tr("LINK_GROUP_LINK_DONE")}</p>`;
            };
        }
        const urlInit = isUnlink ? `/group?groupId=${groupId}` : `/groupOptions?groupId=${groupId}`;
        getJSONSync(urlInit, (err, data) => {
            if (err) {
                ui.serviceError(err);
                return;
            }
            let canShow = false;
            const spanName = div.querySelector('#spanGroupName');

            if (isUnlink) {
                const shade = data.linkedShades.find(x => x.shadeId === shadeId);
                if (shade) {
                    if (spanName) spanName.innerHTML = data.name;
                    div.querySelectorAll('.divWizShadeName').forEach(el => el.innerHTML = shade.name);
                    canShow = true;
                } else {
                    ui.errorMessage(tr('ERR_DEVICE_NOT_FOUND_GROUP'));
                }
            } else {
                if (data.availShades && data.availShades.length > 0) {
                    if (spanName) spanName.innerHTML = data.name;
                    let selAvail = div.querySelector('#selAvailShades');
                    data.availShades.forEach(s => selAvail.options.add(new Option(s.name, s.shadeId)));
                    div.querySelectorAll('.divWizShadeName').forEach(el => el.innerHTML = data.availShades[0].name);
                    canShow = true;
                } else {
                    ui.errorMessage(tr('ERR_NO_DEVICE_AVAILABLE_GROUP'));
                }
            }
            if (canShow) {
                ui.wizSetStep(div, 1);
                shOverlay(div, clearT);
            }
        });
        return div;
    }
    linkGroupShade(groupId) { return this._gpWiz(groupId, false); }
    unlinkGroupShade(groupId, shadeId) { return this._gpWiz(groupId, true, shadeId); }

    unlinkRepeater(address) {
        let prompt = ui.promptMessage(tr('PROMPT_UNLINK_REPEATER'), () => {
            putJSONSync('/unlinkRepeater', { address: address }, (err, repeaters) => {
                if (err) ui.serviceError(err);
                else this.setRepeaterList(repeaters);
                prompt.remove();
            });
        });
    }
    unlinkRemote(shadeId, remoteAddress) {
        let prompt = ui.promptMessage(tr('PROMPT_UNLINK_REMOTE'), () => {
            let obj = {
                shadeId: shadeId,
                remoteAddress: remoteAddress
            };
            putJSONSync('/unlinkRemote', obj, (err, shade) => {
                logger.debug('Remote unlinked:', shade);
                prompt.remove();
                this.setLinkedRemotesList(shade);
            });
        });
    }
    updateRadioGraph() {
        const g = (id) => document.getElementById(id);
        const freqRaw = parseFloat(g('slidFrequency')?.value) || 433000;
        const bwRaw = parseFloat(g('slidRxBandwidth')?.value) || 5803;
        const devRaw = parseFloat(g('slidDeviation')?.value) || 158;
        const txRaw = parseInt(g('slidTxPower')?.value, 10) || 0;
        const freqCentral = freqRaw / 1000;
        const rxBandwidthMHz = (bwRaw / 100) / 1000;
        const deviationMHz = (devRaw / 100) / 1000;
        const lvls = [-30, -20, -15, -10, -6, 0, 5, 7, 10, 11, 12];
        const txPower = lvls[txRaw];
        const freqMin = freqCentral - (rxBandwidthMHz / 2);
        const freqMax = freqCentral + (rxBandwidthMHz / 2);

        if (g('graphFreqMin')) g('graphFreqMin').textContent = freqMin.toFixed(3) + " MHz";
        if (g('graphFreqCentral')) g('graphFreqCentral').textContent = freqCentral.toFixed(3) + " MHz";
        if (g('graphFreqMax')) g('graphFreqMax').textContent = freqMax.toFixed(3) + " MHz";
        if (g('textFreqMin')) g('textFreqMin').textContent = freqMin.toFixed(3);
        if (g('textFreqCentral')) g('textFreqCentral').textContent = freqCentral.toFixed(3);
        if (g('textFreqMax')) g('textFreqMax').textContent = freqMax.toFixed(3);

        const xCentral = 400;
        const yBaseline = 100;
        const slidRx = g('slidRxBandwidth');
        const maxBwSliderReal = slidRx ? (parseFloat(slidRx.max) / 100) / 1000 : 0.8125;

        const maxWidthUtilePx = 740;
        let rxWidthPx = (rxBandwidthMHz / maxBwSliderReal) * maxWidthUtilePx;

        const minWidthPx = 140;
        rxWidthPx = Math.min(Math.max(rxWidthPx, minWidthPx), maxWidthUtilePx);

        const xMin = xCentral - (rxWidthPx / 2);
        const xMax = xCentral + (rxWidthPx / 2);

        let devWidthPx = ((deviationMHz * 2) / maxBwSliderReal) * maxWidthUtilePx;
        devWidthPx = Math.min(Math.max(devWidthPx, 8), 780);

        const xDevMin = xCentral - (devWidthPx / 2);
        const xDevMax = xCentral + (devWidthPx / 2);
        const minTx = -30;
        const maxTx = 12;
        let txPct = (txPower - minTx) / (maxTx - minTx);
        txPct = Math.min(Math.max(txPct, 0), 1);

        const ySommet = yBaseline - (txPct * 200);
        const ySommetReel = (yBaseline + ySommet) / 2;
        const curve = g('graphCurve');
        if (curve) {
            curve.setAttribute('d', `M ${xMin},${yBaseline} Q ${xCentral},${ySommet} ${xMax},${yBaseline}`);

            if (txPower > 5) {
                // Mets ici la couleur de ton choix, par exemple du rouge ou ta variable accent-color
                curve.style.stroke = 'var(--color-accent)';
            } else {
                // Si inférieur à 5, on vide le style inline pour que le CSS prenne le relais
                curve.style.stroke = '';
            }
        }
        const devArea = g('graphDeviationArea');
        if (devArea) {
            devArea.setAttribute('d', `M ${xDevMin},${yBaseline} Q ${xCentral},${ySommet + 4} ${xDevMax},${yBaseline}`);

            if (deviationMHz * 2 > rxBandwidthMHz) {
                devArea.style.stroke = '#FF5252';
                devArea.style.fill = 'rgba(255, 82, 82, 0.15)';
            } else {
                devArea.style.stroke = 'color-mix(in srgb, var(--color-accent) 60%, transparent)';
                devArea.style.fill = 'color-mix(in srgb, var(--color-accent) 10%, transparent)';
            }
        }
        const lMin = g('graphLineMin');
        if (lMin) { lMin.setAttribute('x1', xMin); lMin.setAttribute('x2', xMin); }
        const lMax = g('graphLineMax');
        if (lMax) { lMax.setAttribute('x1', xMax); lMax.setAttribute('x2', xMax); }

        const lCentral = g('graphLineCentral');
        if (lCentral) {
            lCentral.setAttribute('x1', xCentral); lCentral.setAttribute('y1', yBaseline);
            lCentral.setAttribute('x2', xCentral); lCentral.setAttribute('y2', ySommetReel);
        }
    }
    // ==========================================================================
    // CHANGER LE SLIDER -> MET À JOUR L'INPUT NUMBER
    // ==========================================================================
    deviationChanged(el) {
        get('inputDeviation').value = (el.value / 100).fmt('#,##0.00');
        this.updateRadioGraph();
    }

    rxBandwidthChanged(el) {
        get('inputRxBandwidth').value = (el.value / 100).fmt('#,##0.00');
        this.updateRadioGraph();
    }

    frequencyChanged(el) {
        get('inputFrequency').value = (el.value / 1000).fmt('#,##0.000');
        this.updateRadioGraph();
    }

    txPowerChanged(el) {
        let lvls = [-30, -20, -15, -10, -6, 0, 5, 7, 10, 11, 12];
        // Va chercher la valeur correspondante à l'index du slider (0 à 10)
        get('inputTxPower').value = lvls[el.value] !== undefined ? lvls[el.value] : '';
        this.updateRadioGraph();
    }

    stepSizeChanged(el) {
        get('inputStepSize').value = parseInt(el.value, 10).fmt('#,##0');
    }

    // ==========================================================================
    // NOUVEAU : CHANGER L'INPUT NUMBER (CLAVIER) -> MET À JOUR LE SLIDER
    // ==========================================================================

    frequencyInputChanged(el) {
        let val = parseFloat(el.value);
        // On récupère les limites du HTML (converties selon ton multiplicateur x1000)
        let minAllowed = parseFloat(el.getAttribute('min')) / 1000;
        let maxAllowed = parseFloat(el.getAttribute('max')) / 1000;

        if (!isNaN(val) && val >= minAllowed && val <= maxAllowed) {
            get('slidFrequency').value = Math.round(val * 1000);
            this.updateRadioGraph();
        } else {
            // Erreur : valeur hors limites ou invalide
            this.showInputError(el);
            // Optionnel : on restaure la valeur valide du slider
            this.frequencyChanged(get('slidFrequency'));
        }
    }

    rxBandwidthInputChanged(el) {
        let val = parseFloat(el.value);
        let minAllowed = parseFloat(el.getAttribute('min'));
        let maxAllowed = parseFloat(el.getAttribute('max'));

        if (!isNaN(val) && val >= minAllowed && val <= maxAllowed) {
            get('slidRxBandwidth').value = Math.round(val * 100);
            this.updateRadioGraph();
        } else {
            this.showInputError(el);
            this.rxBandwidthChanged(get('slidRxBandwidth'));
        }
    }

    deviationInputChanged(el) {
        let val = parseFloat(el.value);
        // Dans ton HTML min="158" et max="38085" (ce qui correspond à /100)
        let minAllowed = parseFloat(el.getAttribute('min')) / 100;
        let maxAllowed = parseFloat(el.getAttribute('max')) / 100;

        if (!isNaN(val) && val >= minAllowed && val <= maxAllowed) {
            get('slidDeviation').value = Math.round(val * 100);
            this.updateRadioGraph();
        } else {
            this.showInputError(el);
            this.deviationChanged(get('slidDeviation'));
        }
    }



    showInputError(el) {
        el.classList.add('input-error');
        // On retire la classe après 500ms pour pouvoir re-déclencher l'animation plus tard
        setTimeout(() => {
            el.classList.remove('input-error');
        }, 500);
    }






    processShadeTarget(el, shadeId) {
        let positioner = document.querySelector(`.shade-positioner[data-shadeid="${shadeId}"]`);
        if (positioner) {
            positioner.querySelector(`.shade-target`).innerHTML = el.value;
            somfy.sendCommand(shadeId, el.value);
        }
    }
    processShadeTiltTarget(el, shadeId) {
        let positioner = document.querySelector(`.shade-positioner[data-shadeid="${shadeId}"]`);
        if (positioner) {
            positioner.querySelector(`.shade-tilt-target`).innerHTML = el.value;
            somfy.sendTiltCommand(shadeId, el.value);
        }
    }
    openSelectRoom() {
        this.closeShadePositioners();
        let list = get('divRoomSelector-list');
        list.style.display = 'block';
        document.body.addEventListener('click', () => {
            list.style.display = '';
        }, { once: true });
    }
    openSetPosition(shadeId) {
        if (typeof shadeId === 'undefined') return;

        let shade = document.querySelector(`div.somfyShadeCtl[data-shadeid="${shadeId}"]`);
        if (!shade) return;

        let arrowUse = shade.querySelector('.handle-icon use');
        let existing = shade.querySelector('.shade-positioner');

        if (existing) {
            existing.classList.add('popup-slide-out');
            if (arrowUse) arrowUse.setAttribute('href', '#svg-arrowRight');
            setTimeout(() => { existing.remove(); }, 300);
            return;
        }
        document.querySelectorAll('.shade-positioner').forEach(el => {
            el.remove();
            document.querySelectorAll('.handle-icon use').forEach(u => u.setAttribute('href', '#svg-arrowRight'));
        });
        switch (parseInt(shade.getAttribute('data-shadetype'), 10)) {
            case 5: case 9: case 10: case 14: case 15: case 16: return;
        }

        let tiltType = parseInt(shade.getAttribute('data-tilt'), 10) || 0;
        let currPos = parseInt(shade.getAttribute('data-target'), 10) || 0;
        let currTiltPos = parseInt(shade.getAttribute('data-tilttarget'), 10) || 0;
        let lbl = makeBool(shade.getAttribute('data-flipposition')) ? `% ${tr('POPUP_OPEN')}` : `% ${tr('POPUP_CLOSED')}`;

        const positionSlider = (tiltType !== 3) ? `
        <div class="slider-group">
        <div class="slider-header">
        <span class="title">${tr('POPUP_TARGET_POSITION')}</span>
        <span class="val"><span id="spanShadeTarget" class="shade-target">${currPos}</span> ${lbl}</span>
        </div>
        <input id="slidShadeTarget" name="shadeTarget" type="range" min="0" max="100" step="1" value="${currPos}" onchange="somfy.processShadeTarget(this, ${shadeId});" oninput="get('spanShadeTarget').innerHTML = this.value;" />
        </div>` : '';

        const tiltSlider = (tiltType > 0) ? `
        <div class="slider-group" ${(tiltType !== 3) ? 'style="margin-top:10px;"' : ''}>
        <div class="slider-header">
        <span class="title">${tr('POPUP_TARGET_TILT_POSITION')}</span>
        <span class="val"><span id="spanShadeTiltTarget" class="shade-tilt-target">${currTiltPos}</span> ${lbl}</span>
        </div>
        <input id="slidShadeTiltTarget" name="shadeTarget" type="range" min="0" max="100" step="1" value="${currTiltPos}" onchange="somfy.processShadeTiltTarget(this, ${shadeId});" oninput="get('spanShadeTiltTarget').innerHTML = this.value;" />
        </div>` : '';

        let div = document.createElement('div');
        div.setAttribute('class', 'shade-positioner shade-positioner-popup');
        div.setAttribute('data-shadeid', shadeId);
        div.onclick = (event) => { event.stopPropagation(); };

        div.innerHTML = `
        <div class="shade-positioner-inner">
        ${positionSlider}
        ${tiltSlider}
        </div>`;

        shade.appendChild(div);
        if (arrowUse) arrowUse.setAttribute('href', '#svg-arrowLeft');

        document.body.addEventListener('click', () => {
            let ctls = document.querySelectorAll('.shade-positioner');
            ctls.forEach(ctl => {
                ctl.classList.add('popup-slide-out');
                let parentShade = ctl.closest('.somfyShadeCtl');
                if (parentShade) {
                    let u = parentShade.querySelector('.handle-icon use');
                    if (u) u.setAttribute('href', '#svg-arrowRight');
                }
                setTimeout(() => { ctl.remove(); }, 300);
            });
        }, { once: true });
    }
}
var somfy = new Somfy();

class MQTT {
    initialized = false;
    init() { this.initialized = true; }

    async loadMQTT() {
        getJSONSync('/mqttsettings', (err, settings) => {
            if (err) {
                ui.serviceError(err);
            } else {
                ui.toElement(get('divMQTT'), { mqtt: settings });
                // Le serveur ne renvoie jamais le mot de passe existant, seulement s'il est défini :
                // masque factice si déjà configuré, jamais de pré-remplissage avec le vrai secret.
                initSecretField(get('fldMqttPassword'), settings.hasPassword);
                get('divDiscoveryTopic').style.display = settings.pubDisco ? '' : 'none';
                watchDirty(get('divMQTT'));
            }
        });
    }

    connectMQTT() {
        const d = get('divMQTT');
        let obj = ui.fromElement(d);
        // Chaîne vide si le masque factice n'a jamais été effacé (= mot de passe non modifié).
        obj.mqtt.password = secretValue(get('fldMqttPassword'));

        // 1. Validation du Hostname (si MQTT est activé OU si le champ est rempli)
        if (obj.mqtt.enabled && (typeof obj.mqtt.hostname !== 'string' || obj.mqtt.hostname.length === 0)) {
            ui.errorMessage(tr('ERR_HOSTNAME'), tr('ERR_MQTT_HOSTNAME_REQUIRED'));
            return;
        }
        if (typeof obj.mqtt.hostname === 'string' && obj.mqtt.hostname.length > 64) {
            ui.errorMessage(tr('ERR_HOSTNAME'), tr('ERR_HOSTNAME_MAX_LENGTH_64'));
            return;
        }

        // 2. Validation du Port
        if (isNaN(obj.mqtt.port) || obj.mqtt.port < 0) {
            ui.errorMessage(tr('ERR_PORT_INVALID'), tr('ERR_MQTT_PORT_HINT'));
            return;
        }

        // 3. Validation de la longueur du Nom d'utilisateur (> 32)
        if (typeof obj.mqtt.username === 'string' && obj.mqtt.username.length > 32) {
            ui.errorMessage(tr('ERR_USERNAME_INVALID'), tr('ERR_USERNAME_MAX_LENGTH_32'));
            return;
        }

        // 4. Validation du Mot de passe (> 32)
        if (typeof obj.mqtt.password === 'string' && obj.mqtt.password.length > 32) {
            ui.errorMessage(tr('ERR_PASSWORD_INVALID'), tr('ERR_PASSWORD_MAX_LENGTH_32'));
            return;
        }

        // 5. Validation du Root Topic (> 64)
        if (typeof obj.mqtt.rootTopic === 'string' && obj.mqtt.rootTopic.length > 64) {
            ui.errorMessage(tr('ERR_ROOT_TOPIC_INVALID'), tr('ERR_ROOT_TOPIC_MAX_LENGTH_64'));
            return;
        }

        // Si toutes les validations passent, on enregistre
        putJSONSync('/connectmqtt', obj.mqtt, (err, response) => {
            if (err) {
                ui.serviceError(err);
                logger.error('Failed to save MQTT settings:', err);
            } else {
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                logger.debug('MQTT settings saved:', response);
                clearDirty();
            }
        });
    }
}

var mqtt = new MQTT();
class Firmware {
    initialized = false;
    init() { this.initialized = true; }
    isMobile() {
        let agt = navigator.userAgent.toLowerCase();
        return /Android|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent);
    }
    async backup() {
        let overlay = ui.waitMessage(get('divContainer'));
        return await new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.responseType = 'blob';
            xhr.onreadystatechange = (evt) => {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    let obj = window.URL.createObjectURL(xhr.response);
                    var link = document.createElement('a');
                    document.body.appendChild(link);
                    let header = xhr.getResponseHeader('content-disposition');
                    let fname = 'backup';
                    if (typeof header !== 'undefined') {
                        let start = header.indexOf('filename="');
                        if (start >= 0) {
                            let length = header.length;
                            fname = header.substring(start + 10, length - 1);
                        }
                    }
                    logger.debug('Backup file downloaded:', fname);
                    link.setAttribute('download', fname);
                    link.setAttribute('href', obj);
                    link.click();
                    link.remove();
                    setTimeout(() => { window.URL.revokeObjectURL(obj); }, 0);
                }
            };
            xhr.onload = (evt) => {
                if (typeof overlay !== 'undefined') overlay.remove();
                let status = xhr.status;
                if (status !== 200) {
                    let err = xhr.response || {};
                    err.htmlError = status;
                    err.service = `GET /backup`;
                    if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
                    logger.error('Backup download failed:', err);
                    reject(err);
                }
                else {
                    resolve();
                }
            };
            xhr.onerror = (evt) => {
                if (typeof overlay !== 'undefined') overlay.remove();
                let err = {
                    htmlError: xhr.status || 500,
                    service: `GET /backup`
                };
                if (typeof err.desc === 'undefined') err.desc = xhr.statusText || httpStatusText[xhr.status || 500];
                logger.error('Backup request failed:', err);
                reject(err);
            };
            xhr.onabort = (evt) => {
                if (typeof overlay !== 'undefined') overlay.remove();
                reject({ htmlError: status, service: 'GET /backup' });
            };
            xhr.open('GET', baseUrl.length > 0 ? `${baseUrl}/backup` : '/backup', true);
            xhr.send();
        });
    }

    restore() {
        let div = this.createFileUploader('/restore');
        // Le parent direct est maintenant instructions-content
        let instContent = div.querySelector('.instructions-content');
        //[id, bind, texte, checked]
        const opts = [
            ['cbRestoreShades', 'shades', 'RESTORE_SHADES_GROUPS', 1],
            ['cbRestoreRepeaters', 'repeaters', 'RESTORE_REPEATERS', 0],
            ['cbRestoreSystem', 'settings', 'RESTORE_SYSTEM_SETTINGS', 0],
            ['cbRestoreNetwork', 'network', 'RESTORE_NETWORK_SETTINGS', 0],
            ['cbRestoreMQTT', 'mqtt', 'RESTORE_MQTT_SETTINGS', 0],
            ['cbRestoreTransceiver', 'transceiver', 'RESTORE_RADIO_SETTINGS', 0]
        ];

        let html = opts.map(o => `
        <label class="uniRow">
        <div class="uniLabel">${tr(o[2])}</div>
        <div class="uniRight">
        <span class="switch">
        <input id="${o[0]}" type="checkbox" data-bind="${o[1]}" ${o[3]?'checked':''}>
        <div></div>
        </span>
        </div>
        </label>`).join('');

        let divInstText = div.querySelector('#divInstText');
        if (divInstText) {
            divInstText.innerHTML = `
            <div class="uniblocStep"><div>${tr('RESTORE_SELECT_FILE')}</div></div>
            <div id="jsUniRestore" class="uniblocCol">${html}</div>`;
        }
        instContent.insertAdjacentHTML('afterbegin', overlayHeader('RESTORE_TITLE', 'RESTORE_DESC', 'svg-restore'));

        shOverlay(div);
    }

    createFileUploader(service) {
        const isRestore = service === '/restore', isMob = this.isMobile(), div = document.createElement('div');
        div.id = 'divUploadFile';
        div.className = 'inst-overlay';

        const step = (n, content, hide = false) => hide ? '' : `
        <div class="v-step-item">
        <div class="v-step-left"><div class="step-counter">${n}</div><div class="v-step-line"></div></div>
        <div class="v-step-right"><div>${content}</div></div>
        </div>`;

        const firmwareHelp = service === '/updateFirmware' ? `
        <div class="help-container" onclick="toggleTooltip(this)">
        <svg class="help-svg"><use href="#icon-question"></use></svg>
        <div class="tooltip-text">${tr('FIRMWARE_UPDATE_SYSTEM_TOOLTIP')}</div>
        </div>` : service === '/updateApplication' ? `
        <div class="help-container" onclick="toggleTooltip(this)">
        <svg class="help-svg"><use href="#icon-question"></use></svg>
        <div class="tooltip-text">${tr('FIRMWARE_UPDATE_LITTLEFS_TOOLTIP')}</div>
        </div>` : '';

        // Modifié : Le overlayHeader sera injecté dynamiquement ou est absent par défaut ici
        // pour laisser la méthode appelante (comme restore() ou updateManual()) le placer au début de .instructions-content
        div.innerHTML = `
        <div class="instructions-content UploadFile-content">
        <div class="overlay-scroll-content">
        <form method="POST" action="#" enctype="multipart/form-data" id="frmUploadApp">
        <div id="divInstText"></div>
        <div class="vertical-steps-container">
        ${step(1, `
        <div>${tr(service === '/updateFirmware' ? 'FIRMWARE_UPDATE_SYSTEM' : 'FIRMWARE_UPDATE_LITTLEFS')}${firmwareHelp}</div>
        <a href="https://github.com/xkain/TESTRTS/releases" target="_blank" class="link" style="display:block; margin-top:5px;">${tr('FIRMWARE_UPDATE_FROM_GITHUB')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a>
        `, isRestore)}
        <div class="v-step-item ${isRestore ? '' : 'has-extra-content'}" style="${isRestore ? 'height:auto;margin:15px 0 0' : ''}">
        <div class="v-step-left" style="${isRestore ? 'display:none' : ''}">
        <div class="step-counter">2</div><div class="v-step-line"></div>
        </div>
        <div class="v-step-right" style="${isRestore ? 'padding-left:0' : ''}">
        <input id="fileName" type="file" name="updateFS" style="display:none"
        onchange="const f=this.files[0];if(f){const s=get('span-selected-file');s.innerText=f.name;s.style.opacity='1';firmware.checkBackupVersion(f)}"/>
        <label for="fileName" class="custom-file-upload">
        <span id="span-selected-file" class="file-name-display">${tr('CHOOSE_FILE')}</span>
        <div class="file-icon-btn"><svg><use href="#svg-upload"></use></svg></div>
        </label>
        </div>
        </div>
        <div class="v-step-item" style="${isRestore ? 'display:none' : ''}">
        <div class="v-step-left"><div class="step-counter">3</div></div>
        <div class="v-step-right"><div>${tr('FIRMWARE_UPDATE_VERIFY_0')} <svg class="svgInText"><use href="#svg-download"></use></svg> ${tr('FIRMWARE_UPDATE_VERIFY_1')}</div></div>
        </div>
        </div>

        <div class="warning" style="${isRestore ? '' : 'display:none'}">
        <div class="warning-header">
        <svg><use href="#svg-warning"></use></svg>
        <b>${tr('MSG_ALERT')}</b>
        </div>
        <div class="information-text">
        <span>${tr('RESTORE_NETWORK_WARNING')}</span>
        </div>
        </div>

        <div class="progress-bar" id="progFileUpload" style="display:none;margin:15px 0"></div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay"><div class="footer-sticky-content">
        <div class="uniRow backup-row" style="${isRestore ? 'display:none' : ''}">
        <div class="uniText">
        <span class="uniLabel">${tr('FIRMWARE_SAVE_BACKUP')}</span>
        <span class="uniStatus">${tr(isMob ? 'FIRMWARE_SAVE_BACKUP_DESC_MOB' : 'FIRMWARE_SAVE_BACKUP_DESC')}</span>
        </div>
        <div id="btnBackupCfg" class="gitBackup" onclick="firmware.backup()"><svg><use href="#svg-download"></use></svg></div>
        </div>
        <div class="button-container-row">
        <button id="btnClose" line type="button" onclick="closeOverlay(get('divUploadFile'))">${tr('BT_CANCEL_1')}</button>
        <button id="btnUploadFile" type="button" onclick="firmware.uploadFile('${service}',get('divUploadFile'),ui.fromElement(get('divUploadFile')))">${tr('BT_UPLOAD_FILE')}</button>
        </div>
        </div></div>
        </form>
        </div>
        </div>`;

        return div;
    }
    checkBackupVersion(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split('\n');
            if (lines.length > 0) {
                const ver = parseInt(lines[0].split(',')[0]);
                if (!isNaN(ver) && ver < 25) {
                    let prompt = ui.promptMessage(tr('PROMPT_RESTORE_FILE_TITLE'), () => closeOverlay(prompt));

                    prompt.querySelector('.sub-message').innerHTML = `<p style="color:var(--color-warning); font-weight:bold;"><p>${tr('PROMPT_RESTORE_FILE_DESC')}</p><p><b>${tr('PROMPT_RESTORE_FILE_DESC_1')}</b></p><p>${tr('PROMPT_RESTORE_FILE_DESC_2')}</p>`;

                    const btnCan = prompt.querySelector('button[line]');
                    if (btnCan) {
                        btnCan.onclick = () => {
                            get('fileName').value = "";
                            get('span-selected-file').innerText = tr('CHOOSE_FILE');
                            closeOverlay(prompt);
                        };
                    }
                }
            }
        };
        reader.readAsText(file.slice(0, 100));
    }
    procMemoryStatus(mem) {
        let sp = get('spanFreeMemory');
        if (sp) sp.innerHTML = mem.free.fmt("#,##0 ");
        sp = get('spanMaxMemory');
        if (sp) sp.innerHTML = mem.max.fmt('#,##0 ');
        sp = get('spanMinMemory');
        if (sp) sp.innerHTML = mem.min.fmt('#,##0 ');

        // --- MISE À JOUR DU CERCLE RAM VIA BACKGROUND DIRECT ---
        if (mem && mem.free) {
            const totalRam = mem.total ? mem.total : 265672;
            const ramUsedPct = Math.min(100, Math.max(0, Math.round(((totalRam - mem.free) / totalRam) * 100)));

            const cRam = get('circle-ram');
            if (cRam) {
                cRam.style.background = `conic-gradient(#3b82f6 ${ramUsedPct}%, var(--color-circle-indicator) 0%)`;
                cRam.innerHTML = `<span>${ramUsedPct}%</span>`;
            }
        }
    }
    procFwStatus(rel) {
        const divsGlobal = document.querySelectorAll('.firmware-message');
        const btnGit = get('btnUpdateGithub');
        const gitDesc = get('gitUpdateDesc');
        const statusRight = get('gitUpdateStatusRight');

        if (divsGlobal.length === 0) return;
        divsGlobal.forEach(div => {
            div.classList.remove('procFwStatusshow');
            div.onclick = null;
        });

        // --- CAS 1 : UNE MISE À JOUR EST DISPONIBLE ---
        if (rel.available && rel.status === 0 && rel.checkForUpdate !== false) {
            divsGlobal.forEach(div => {
                div.classList.add('procFwStatusshow');
                div.style.cursor = 'pointer';
                div.onclick = () => { firmware.updateGithub(); };
                div.innerHTML = `<span>${tr('FW_UPDATE_AVAILABLE')}</span>`;
            });

            if (btnGit) {
                const currentMajor = this.getMainVersion(rel.appVersion?.name || get('spanFwVersion')?.innerText);
                const targetMajor = this.getMainVersion(rel.latest?.name);
                const isBlocked = (currentMajor < 3 && targetMajor >= 3) || (currentMajor >= 3 && targetMajor < 3);

                if (gitDesc) {
                    // Utilisation de ta clé exacte FW_UPDATE_ACTION_DESC
                    gitDesc.innerHTML = isBlocked
                    ? tr('FW_UPDATE_USB_DESC').replace('%1', rel.latest.name)
                    : tr('FW_UPDATE_ACTION_DESC').replace('%1', rel.latest.name);
                }

                if (statusRight) {
                    const badgeText = isBlocked ? "USB REQUIS" : `v${rel.latest.name}`;
                    statusRight.innerHTML = `<span class="status-badge state-disabled">${badgeText}</span>`;
                }
            }
        }
        // --- CAS 2 : ERREUR DE VÉRIFICATION ---
        else if (rel.status === 4 && rel.error !== 0) {
            let e = errors.find(x => x.code === rel.error) || { desc: tr('ERR_UNSPECIFIED') };
            let inst = get('divGitInstall');
            if (inst) inst.remove();
            ui.errorMessage(e.desc);
        }
        // --- CAS 3 : LE SYSTÈME EST À JOUR ---
        else {
            if (btnGit) {
                // Utilisation de ta clé exacte FW_UPDATE_UPTODATE
                if (gitDesc) gitDesc.innerHTML = tr('FW_UPDATE_UPTODATE');

                if (statusRight) {
                    const currentVersion = rel.appVersion?.name || get('spanFwVersion')?.innerText || "";
                    statusRight.innerHTML = `<span class="status-badge state-success">v${currentVersion}</span>`;
                }
            }
        }
    }

    procUpdateProgress(prog) {
        const pct = Math.round((prog.loaded / prog.total) * 100);
        general.reloadApp = true;
        const git = get('divGitInstall');

        if (git) {
            if (pct >= 100 && prog.part === 100) {
                git.remove();

                // Message de succès avec titre et sous-message
                const subMsg = `${tr('GIT_RELEASE_SUCCES_1')}<br>${tr('GIT_RELEASE_SUCCES_2')}`;
                ui.successMessage(tr('GIT_RELEASE_SUCCESS_TITLE'), subMsg);

            } else {
                if (prog.part === 100) {
                    const btnCancel = get('btnCancelUpdate');
                    if (btnCancel) btnCancel.style.display = 'none';
                }
                const p = (prog.part === 100) ?
                get('progApplicationDownload') :
                get('progFirmwareDownload');

                if (p) {
                    p.style.setProperty('--progress', `${pct}%`);
                    p.setAttribute('data-progress', `${pct}%`);
                }
            }
        }
    }

    // Extrait juste le premier nombre après le 'v' (ex: "v2.5.2" -> 2, "v3.0.0" -> 3, "3.1.2" -> 3)
    getMainVersion(verStr) {
        if (!verStr) return 0;
        const match = verStr.match(/[vV]?(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    async installGitRelease(div) {
        let obj = ui.fromElement(div);

        if (!this.isMobile()) {
            try { await firmware.backup(); }
            catch (err) { return ui.serviceError(div, err); }
        }
        putJSONSync(`/downloadFirmware?ver=${obj.version}`, {}, (err, ver) => {
            if (err) return ui.serviceError(err);
            general.reloadApp = true;
            const desc = tr('GIT_RELEASE_DESC').replace('%1', ver.name);

            // Modifié : Ici overlayHeader est maintenant le premier enfant direct de .instructions-content
            div.innerHTML = `
            <div class="instructions-content">
            ${overlayHeader('GIT_RELEASE_TITLE', '', 'svg-github')}

            <div class="warning">
            <div class="warning-header">
            <svg><use href="#svg-warning"></use></svg>
            <b>${tr('MSG_WARNING')}</b>
            </div>
            <div class="information-text">
            <b>${tr('GIT_RELEASE_WAIT_WARNING')}</b>
            <span>${tr('GIT_RELEASE_WAIT_WARNING_1')}</span>
            </div>
            </div>

            <div class="progress-bar" id="progFirmwareDownload"></div>
            <label for="progFirmwareDownload">${tr('GIT_RELEASE_FIRMWARE_INSTALL_PROGRESS')}</label>
            <div class="progress-bar" id="progApplicationDownload"></div>
            <label for="progApplicationDownload">${tr('GIT_RELEASE_APPLICATION_INSTALL_PROGRESS')}</label>
            <div class="button-container-col">
            <button id="btnCancelUpdate" line type="button">${tr('BT_CANCEL_1')}</button>
            </div>
            </div>`;

            const hP = div.querySelector('.instructions-header p');
            if (hP) hP.innerHTML = desc;

            div.querySelector('[close]').onclick = () => closeOverlay(div);
            div.querySelector('#btnCancelUpdate').onclick = () => firmware.cancelInstallGit(div);
        });
    }
    updateGithub() {
        getJSONSync('/getReleases', (err, rel) => {
            if (err) return ui.serviceError(err);
            const div = document.createElement('div'), isMob = this.isMobile();
            const chip = (get('divContainer').getAttribute('data-chipmodel') || "").toLowerCase();
            div.id = 'divGitInstall';
            div.className = 'inst-overlay';

            // --- INJECTION DE LA VERSION COURANTE DE L'ESP ---
            div.setAttribute('data-currentver', rel.appVersion.name);

            rel.releases.sort((a, b) => a.preRelease === b.preRelease && b.draft === a.draft ? 0 : a.preRelease ? 1 : -1);

            // --- FILTRAGE DES OPTIONS DU SÉLECTEUR ---
            const optsHtml = rel.releases.map(r => {
                const name = r.name.toLowerCase();
                if (name === 'main' || name === 'master' || (r.hwVersions.length > 0 && r.hwVersions.indexOf(chip) < 0)) return '';

                // Si la version de la release GitHub est inférieure à la v3.0.0, on ne l'affiche pas du tout
                const targetMajor = this.getMainVersion(r.version.name);
                if (targetMajor < 3) return '';

                return `<option value="${r.version.name}" data-prerelease="${r.preRelease}">${r.name}${r.preRelease ? ' - Pre' : ''}</option>`;
            }).join('');

            div.innerHTML = `
            <div class="instructions-content github-content">
            ${overlayHeader('UPDATE_GIT_TITLE', 'UPDATE_GIT_DESC', 'svg-github')}

            <!-- Zone statique du haut (Sélecteurs + Lien) -->
            <div class="overlay-static-content">
            <div class="baseFlexRow"><span class="uniLabel">${tr('FIRMWARE_INSTALLED')}</span><span class="labelgrey">${rel.appVersion.name}</span></div>
            <div class="baseFlexRow">
            <span class="uniLabel">${tr('FIRMWARE_AVAILABLE')}</span>
            <select id="selVersion" class="selectCompac" data-bind="version">${optsHtml}</select>
            </div>
            <a id="lnkGithubRelease" href="#" target="_blank" class="link">${tr('FIRMWARE_NOTE_GITHUB')}<svg class="svgInTextSmall"><use href="#svg-linkOut"></use></svg></a>


            </div> <!-- <-- ICI : Elle s'arrête bien juste après le lien 'lnkGithubRelease' -->
            <div class="hrModal"></div>

            <!-- Zone défilante pour les alertes et les notes de version -->
            <div class="overlay-scroll-content">
            <div id="divPrereleaseWarning" class="error" style="display:none;">
            <div class="error-header">
            <svg><use href="#svg-error"></use></svg>
            <b>${tr('MSG_ALERT')}</b>
            </div>
            <div class="information-text">
            <span id="spanUpdateWarning"></span>
            </div>
            </div>


            <div class="warningText"><svg><use href="#svg-warning"></use></svg><span>${tr('FIRMWARE_CACHE')}</span></div>

            <!-- Conteneur des notes dynamique (prend le scroll) -->
            <div id="notesPreview" class="release-notes-preview">
            <div class="wifiConnectScan">
            <div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
            </div>
            </div>
            </div>

            <!-- Footer collant en bas -->
            <div class="hrDivFooter-Instruc"></div>
            <div class="button-container-overlay">
            <div class="footer-sticky-content">
            <div class="uniRow">
            <div class="uniText"><span class="uniLabel">${tr('FIRMWARE_SAVE_BACKUP')}</span><span class="uniStatus">${tr(isMob ? 'FIRMWARE_SAVE_BACKUP_DESC_MOB' : 'FIRMWARE_SAVE_BACKUP_DESC')}</span></div>
            <div id="btnBackupCfg" class="gitBackup" onclick="firmware.backup()"><svg><use href="#svg-download"></use></svg></div>
            </div>
            <div class="button-container-row">
            <button id="btnClose" line type="button" onclick="closeOverlay(get('divGitInstall'))">${tr('BT_CANCEL_1')}</button>
            <button id="btnUpdate" type="button" class="btn-main" onclick="firmware.installGitRelease(get('divGitInstall'))">${tr('BT_UPDATE')}</button>
            </div>
            </div>
            </div>
            </div>`;

            shOverlay(div);
            const sel = div.querySelector('#selVersion');

            const updateNotes = async () => {
                const nDiv = div.querySelector('#notesPreview'), lnk = div.querySelector('#lnkGithubRelease');
                if (!nDiv) return;

                nDiv.innerHTML = '<div class="wifiConnectScan"><div class="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div></div>';

                try {
                    const r = await firmware.getReleaseInfo(sel.value, true);
                    if (r?.info?.body) {
                        nDiv.innerHTML = firmware.parseMarkdown(r.info.body);
                        if (lnk && r.info.html_url) lnk.href = r.info.html_url;
                    } else {
                        throw new Error("No body");
                    }
                } catch (e) {
                    nDiv.innerHTML = `
                    <div class="divGitNoteError">
                    <div class="gitNoteError">${tr('ERR_GIT_NOTE')}</div>
                    <div class="gitNoteErrorSub">${tr('UPDATE_GIT_NOTE')}</div>
                    </div>`;
                }
            };
            sel.addEventListener('change', () => { this.gitReleaseSelected(div); updateNotes(); });
            this.gitReleaseSelected(div);
            updateNotes();
        });
    }
    gitReleaseSelected(div) {
        const sel = div.querySelector('#selVersion');
        if (!sel || sel.selectedIndex === -1) return;

        const opt = sel.options[sel.selectedIndex];
        const isPre = opt.getAttribute('data-prerelease') === "true";
        const divPre = div.querySelector('#divPrereleaseWarning');
        const spanWarning = div.querySelector('#spanUpdateWarning');
        const btnUpdate = div.querySelector('#btnUpdate');

        if (btnUpdate) btnUpdate.disabled = false;

        if (divPre) {
            if (isPre) {
                if (spanWarning) spanWarning.innerHTML = tr('UPDATE_GIT_RELEASE_BETA');
                divPre.style.display = 'flex';
            } else {
                divPre.style.display = 'none';
            }
        }
    }
    async getReleaseInfo(tag, silent = false) {
        let overlay = null;
        if (!silent) overlay = ui.waitMessage(document.getElementById('divContainer'));
        try {
            let ret = { resp: { ok: false }, info: null };
            ret.resp = await fetch(`https://api.github.com/repos/xkain/TESTRTS/releases/tags/${tag}`);
            if (ret.resp.ok) {
                ret.info = await ret.resp.json();
            }
            return ret;
        }
        catch (err) {
            return { resp: { ok: false }, err: err };
        }
        finally {
            if (overlay) overlay.remove();
        }
    }
    formatInlineMarkdown(txt) {
        if (!txt) return '';
        return txt
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`([^`]+)`/g, '<code class="md-code-inline">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="md-link">$1</a>')
        .replace(/(?<!["=>])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="md-link-auto">$1</a>');
    }
    parseMarkdown(bodyText) {
        const self = this;
        const ctx = {
            lines: (bodyText || "").split(/\r?\n/),
            ndx: 0,
            html: '',
            token(txt) {
                const trimmed = txt.trim();
                if (!trimmed) return { type: 'empty' };
                const firstChar = txt.match(/\S/);
                const indent = firstChar ? txt.indexOf(firstChar[0]) : 0;
                if (trimmed.startsWith('#')) return { type: 'head', txt: trimmed, indent };
                if (trimmed.startsWith('* ')) return { type: 'list', txt: trimmed.substring(2), indent };
                return { type: 'text', txt: trimmed, indent };
            },
            renderHead(token) {
                const level = (token.txt.match(/^#+/) || ["#"])[0].length;
                const content = token.txt.replace(/^#+\s*/, '');
                return `<h${level} style="margin: 10px 0 5px 0;">${self.formatInlineMarkdown(content)}</h${level}>`;
            },
            renderList() {
                let listHtml = '<ul class="md-list" style="padding:0; margin:5px 0;">';
                while (this.ndx < this.lines.length) {
                    const t = this.token(this.lines[this.ndx]);
                    if (t.type !== 'list') break;
                    const margin = (t.indent * 8) + 20;
                    listHtml += `<li style="margin-left:${margin}px; text-align:left; list-style-type:disc;">${self.formatInlineMarkdown(t.txt)}</li>`;
                    this.ndx++;
                }
                listHtml += '</ul>';
                return listHtml;
            },
            parse() {
                while (this.ndx < this.lines.length) {
                    const t = this.token(this.lines[this.ndx]);
                    switch (t.type) {
                        case 'head': this.html += this.renderHead(t); this.ndx++; break;
                        case 'list': this.html += this.renderList(); break;
                        case 'empty': this.html += '<div style="height:8px"></div>'; this.ndx++; break;
                        default:
                            const margin = (t.indent * 8) + (t.indent > 0 ? 20 : 0);
                            this.html += `<p style="margin: 2px 0; margin-left:${margin}px; text-align:left; line-height:1.4;">${self.formatInlineMarkdown(t.txt)}</p>`;
                            this.ndx++;
                            break;
                    }
                }
            }
        };
        ctx.parse();
        return ctx.html;
    }
    updateManual(isApp = false) {
        const service = isApp ? '/updateApplication' : '/updateFirmware';
        const div = this.createFileUploader(service);

        if (isApp) general.reloadApp = true;
        const currentVer = isApp ? (general?.appVersion || this.appVersion) : (get('spanFwVersion').innerText || '?.?.?');

        // Modifié : Ajout de overlayHeader directement comme premier enfant de .instructions-content
        let instContent = div.querySelector('.instructions-content');
        instContent.insertAdjacentHTML('afterbegin', overlayHeader('MANUAL_UPDATE_TITLE', isApp ? 'UPDATE_LITTLEFS_DESC' : 'UPDATE_FIRMWARE_DESC', 'svg-update'));

        div.querySelector('#divInstText').innerHTML = `



        <div class="overlay-static-content">
        <div class="baseFlexRow"><span class="uniLabel">${tr('FIRMWARE_INSTALLED')}</span><span class="labelgrey">${currentVer}</span></div>
        <div class="warningText"><span>${tr('FIRMWARE_CACHE')}</span></div></div>



        </div> <!-- <-- ICI : Elle s'arrête bien juste après le lien 'lnkGithubRelease' -->
        <div class="hrModal"></div>`;

        div.className += isApp ? ' mode-app-update' : ' mode-firm-update';
        shOverlay(div);

        const btnB = div.querySelector('#btnBackupCfg');
        if (btnB) {
            btnB.style.display = 'flex';
            btnB.onclick = () => firmware.backup();
        }
    }
    async uploadFile(service, el, data) {
        let field = el.querySelector('input[type="file"]'),
        filename = field.value,
        file = field.files[0],
        title = tr('MSG_ALERT'),
        err = null,
        customErrMsg = null;

        if (!filename) {
            err = (service === '/restore')
            ? 'ERR_NO_FILE_BACKUP_SELECTED'
            : (service === '/updateApplication' ? 'ERR_NO_FILE_LITTLEFS_SELECTED' : 'ERR_NO_FILE_FIRMWARE_SELECTED');
        }
        else {
            // Extrait uniquement le nom du fichier (supprime le C:\fakepath\)
            const cleanFileName = filename.split(/(\\|\/)/).pop();

            // --- INTERCEPTION SPÉCIFIQUE DES ANCIENNES VERSIONS V2 (SomfyController) ---
            if (cleanFileName.includes('SomfyController')) {
                const isOldFS = cleanFileName.includes('littlefs');
                const fileTypeKey = isOldFS ? 'ERR_FIRMWARE_TYPE_LITTLEFS' : 'ERR_FIRMWARE_TYPE_FIRMWARE';

                customErrMsg = tr('ERR_FIRMWARE_V2_INCOMPATIBLE')
                .replace('%file%', cleanFileName)
                .replace('%type%', tr(fileTypeKey));
            }
            // --- VALIDATIONS STRICTES V3 + ---
            // Validation LittleFS V3 + : Doit strictement respecter le nommage 'ESPSomfyRTS_..._littlefs.bin'
            else if (service === '/updateApplication' && (!cleanFileName.startsWith('ESPSomfyRTS_') || !cleanFileName.endsWith('_littlefs.bin'))) {
                err = 'ERR_INVALID_FILE_LITTLEFS';
            }
            // Validation Firmware V3 + : Doit commencer par 'ESPSomfyRTS_', finir par '.bin' et ne pas être le fichier LittleFS
            else if (service === '/updateFirmware' && (!cleanFileName.startsWith('ESPSomfyRTS_') || cleanFileName.includes('_littlefs') || !cleanFileName.endsWith('.bin'))) {
                err = 'ERR_INVALID_FILE_FIRMWARE';
            }
            else if (service === '/restore') {
                if (file.size > 20480) {
                    const msg = tr('ERR_BACKUP_TOO_LARGE').replace('%s', file.size.fmt("#,##0"));
                    ui.errorMessage(title, msg);
                    return;
                }
                if (!cleanFileName.endsWith('.backup')) err = 'ERR_INVALID_FILE_BACKUP';
                else if (!['shades', 'settings', 'network', 'transceiver', 'repeaters', 'mqtt'].some(k => data[k])) err = 'ERR_NO_RESTORE_OPTION';
            }
        }

        // Affichage de l'erreur si déclenchée
        if (customErrMsg || err) {
            const message = customErrMsg ? customErrMsg : tr(err);
            ui.errorMessage(title, message);
            return;
        }

        if (service !== '/restore' && !this.isMobile()) {
            try { await firmware.backup(); }
            catch (e) { return ui.serviceError(el, e); }
        }

        let formData = new FormData();
        formData.append('file', file);
        if (service === '/restore') formData.append('data', JSON.stringify(data));

        ['btnBackupCfg', 'btnUploadFile'].forEach(id => { let b = el.querySelector('#' + id); if (b) b.style.display = 'none'; });
        field.disabled = true;
        let steps = el.querySelector('.vertical-steps-container');
        if (steps) steps.style.display = 'none';
        let prog = el.querySelector('#progFileUpload'),
        btnCancel = el.querySelector('#btnClose');
        prog.style.display = '';

        let xhr = new XMLHttpRequest();
        xhr.open('POST', baseUrl ? `${baseUrl}${service}` : service, true);

        xhr.upload.onprogress = (evt) => {
            let pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
            prog.style.setProperty('--progress', `${pct}%`);
            prog.setAttribute('data-progress', `${pct}%`);
        };

        xhr.onload = async () => {
            btnCancel.innerText = tr('BT_CLOSE');
            if (service === '/restore') {
                await somfy.init();
                closeOverlay(get('divUploadFile'));
            }
        };
        xhr.onerror = () => ui.serviceError(el, 'Upload Failed');
        btnCancel.onclick = () => { xhr.abort(); closeOverlay(el); };
        xhr.send(formData);
    }
}
var firmware = new Firmware();
