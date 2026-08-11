
import gzip
import hashlib
import os
import re
import shutil
import subprocess
import json
from SCons.Script import Import

Import("env")

# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
SRC_DIR_NAME = "data-dev"
DST_DIR_NAME = "data"
# Répertoire UNIQUE regroupant toutes les langues du projet (en, fr, de, es, ... + manifest.json),
# à la racine du dépôt -- plus de scission entre data-dev/locale/ (embarquées) et locales/
# (téléchargeables) : une seule langue en est extraite et embarquée par build (cf.
# _embed_default_language), les autres restent des fichiers sources ordinaires, toutes publiées
# individuellement par package_langs.py quelle que soit la plateforme.
LOCALES_DIR_NAME = "locales"

# Extensions à traiter (Minify + Gzip)
MINIFY_AND_GZIP = {".html", ".htm", ".css", ".js", ".json", ".svg", ".xml"}
WEBP_EXTENSIONS = {".webp"}

def _project_dir():
    return env.subst("$PROJECT_DIR")

def _src_dir():
    return os.path.join(_project_dir(), SRC_DIR_NAME)

def _dst_dir():
    return os.path.join(_project_dir(), DST_DIR_NAME)

def _locales_dir():
    return os.path.join(_project_dir(), LOCALES_DIR_NAME)

# ──────────────────────────────────────────────
# Langue embarquée par défaut selon l'environnement de build : fr pour les boîtiers BOX (marché
# francophone), en pour tout le reste. env.GetProjectOption("build_flags") reflète les build_flags
# réellement résolus pour l'environnement PlatformIO en cours de build (contrairement à
# env["CPPDEFINES"], absent à ce stade du pre-script).
def _get_build_flags():
    try:
        return env.GetProjectOption("build_flags")
    except Exception:
        return []

def _embedded_lang_for_env():
    flags = " ".join(_get_build_flags())
    if "HARDWARE_BOX_WIFI" in flags or "HARDWARE_BOX_ETH" in flags:
        return "fr"
    return "en"

# ──────────────────────────────────────────────
# Cache-busting : résolution du numéro de version pour ?v=
#
# - Release propre (HEAD sur un tag Git, arbre non modifié) : on utilise le tag
#   tel quel (ex: v3.0.1 -> "3.0.1"), pour un ?v= propre sur les releases publiées.
# - Sinon (dev / build local, entre deux releases ou avec des modifs non commit) :
#   on part du numéro de base (fichier `appversion`) et on lui ajoute un suffixe
#   qui change à chaque modification, pour que le cache-busting soit automatique :
#     - arbre Git propre : hash de commit court (ex: 3.0.0-dev-a1b2c3d)
#     - arbre Git modifié (ou pas de dépôt Git) : empreinte du contenu des fichiers
#       de data-dev/, puisqu'un hash de commit ne changerait pas tant qu'on n'a pas
#       commit les modifs locales (ex: 3.0.0-dev-9f3c1a2)
# ──────────────────────────────────────────────

def _run_git(args):
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=_project_dir(),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return result.stdout.strip()
    except Exception:
        return None

def _git_exact_tag():
    return _run_git(["describe", "--tags", "--exact-match", "HEAD"])

def _git_is_dirty():
    status = _run_git(["status", "--porcelain"])
    return status is None or len(status) > 0

def _git_short_hash():
    return _run_git(["rev-parse", "--short=7", "HEAD"])

def _base_version():
    appversion_file = os.path.join(_src_dir(), "appversion")
    if os.path.exists(appversion_file):
        try:
            with open(appversion_file, "r", encoding="utf-8") as vf:
                v = vf.read().strip()
                if v:
                    return v
        except Exception:
            pass
    return "0.0.0"

def _content_fingerprint():
    # Empreinte du contenu de data-dev/, utilisée comme suffixe de cache-busting
    # quand l'arbre Git est modifié (ou absent) : un hash de commit seul ne
    # changerait pas tant que les modifs locales ne sont pas commit.
    h = hashlib.sha1()
    src_dir = _src_dir()
    for root, dirs, files in os.walk(src_dir):
        for fname in sorted(files):
            if fname.startswith(".") or fname.endswith("~"):
                continue
            try:
                with open(os.path.join(root, fname), "rb") as f:
                    h.update(f.read())
            except Exception:
                pass
    return h.hexdigest()[:7]

def resolve_build_version():
    tag = _git_exact_tag()
    dirty = _git_is_dirty()
    if tag and not dirty:
        return tag.lstrip("vV")
    base = _base_version()
    if dirty:
        suffix = _content_fingerprint()
    else:
        suffix = _git_short_hash() or _content_fingerprint()
    return f"{base}-dev-{suffix}"

# ──────────────────────────────────────────────
# Minificateurs
# ──────────────────────────────────────────────

def minify_html(text: str) -> str:
    # Les blocs <script>/<pre>/<textarea> sont mis de côté avant les passes de compactage
    # ci-dessous : leur contenu a des espaces significatifs (un template JS multi-lignes,
    # une chaîne avec 2+ espaces...) que la passe \s{2,} -> " " altérerait sinon.
    protected = []
    def _stash(m):
        protected.append(m.group(0))
        return f"\x00{len(protected) - 1}\x00"
    text = re.sub(r"<(script|pre|textarea)\b[^>]*>.*?</\1>", _stash, text,
                  flags=re.DOTALL | re.IGNORECASE)

    # Suppression des commentaires HTML. L'ancien pattern `r""` (chaîne vide) ne matchait
    # rien : re.sub("", "", texte) est un no-op garanti, aucun commentaire n'a donc jamais
    # été retiré par cette ligne.
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = re.sub(r">\s+<", "> <", text)
    text = re.sub(r"\s{2,}", " ", text)
    text = text.strip()

    for i, block in enumerate(protected):
        text = text.replace(f"\x00{i}\x00", block, 1)
    return text

# Un seul scanner pour les trois constructions CSS dont le contenu est une donnée
# littérale : commentaires, chaînes entre guillemets et url(...). L'ordre compte : un
# commentaire est reconnu avant une chaîne (un guillemet dans un commentaire ne doit pas
# ouvrir une fausse chaîne), et url() est reconnu en dernier car une url() entre guillemets
# est de toute façon couverte par la branche chaîne de son alternative interne.
_CSS_LITERALS = re.compile(
    r"""
      /\*.*?\*/                                    # commentaire
    | "(?:\\.|[^"\\\n])*"                          # chaîne entre guillemets doubles
    | '(?:\\.|[^'\\\n])*'                          # chaîne entre guillemets simples
    | url\(\s*(?:"(?:\\.|[^"\\\n])*"
              |'(?:\\.|[^'\\\n])*'
              |[^)"'\n]*)\s*\)                     # url(), avec ou sans guillemets
    """,
    re.DOTALL | re.VERBOSE | re.IGNORECASE,
)

def minify_css(text: str) -> str:
    # 1. Mettre de côté commentaires, chaînes et url() : les passes de compactage
    # ci-dessous ne doivent JAMAIS s'appliquer à l'intérieur d'une valeur littérale. Sans
    # cette protection, `content: "a, b"` pouvait devenir `content:"a,b"` et une data-URI
    # SVG dans un url(...) pouvait être tronquée sur un ':' ou un ';' interne -- rien ne
    # casse aujourd'hui par chance (aucun de nos littéraux n'a d'espace collé à ces
    # caractères), mais c'était fragile au premier ajout de CSS qui en aurait un.
    literals = []
    def _stash(m):
        token = m.group(0)
        if token.startswith("/*"):  # commentaire : supprimé, pas conservé
            return " "
        literals.append(token)
        return f"\x00{len(literals) - 1}\x00"
    text = _CSS_LITERALS.sub(_stash, text)

    # 2. Remplacer les retours à la ligne et tabulations par des espaces simples
    text = re.sub(r"\s+", " ", text)

    # 3. Supprimer les espaces inutiles autour des caractères de structure CSS
    text = re.sub(r"\s*([:{};,])\s*", r"\1", text)

    # 4. ASTUCE POUR FIREFOX : On isole les règles -webkit- en réinjectant un espace
    # après chaque fermeture d'accolade qui les concerne pour casser le bloc unique.
    text = re.sub(r"([^{]*?-webkit-[^}]+})", r"\1\n", text)

    text = text.strip()

    # 5. Réinjecter les littéraux protégés à l'étape 1, intacts.
    for i, token in enumerate(literals):
        text = text.replace(f"\x00{i}\x00", token, 1)
    return text

_JS_BACKSLASH = "\\"

def minify_js(text: str) -> str:
    """Retire commentaires et mise en forme du JS source, octet pour octet identique à
    l'intérieur de chaque token. data-dev/index.js garde ses commentaires pour rester
    éditable ; seul index.js.gz embarqué est allégé -- sur nos 575 Ko de source c'est de
    loin le plus gros gain disponible dans ce pipeline (index.js était jusqu'ici recopié
    tel quel par cette fonction, cf. `return text`).

    Toute la difficulté est de distinguer un '/' qui ouvre une regex d'une division, et de
    savoir si on est dans un template literal (backticks) dont un ${...} peut contenir
    n'importe quel code, y compris un autre template imbriqué. `stack` porte cet état ; tout
    ce qui est à l'intérieur d'un littéral (chaîne, regex, template) est recopié sans y
    toucher, seuls les espaces et commentaires en contexte code sont retirés.
    """
    out = []
    i, n = 0, len(text)
    prev = ""     # dernier caractère de code significatif : distingue regex et division
    stack = []    # 'tpl' = dans un template literal, 'expr' = dans son ${...}
    pending = ""  # séparateur (" " ou "\n") en attente avant le prochain vrai token : un
                  # commentaire supprimé peut se glisser ENTRE l'espace qui le précède et le
                  # saut de ligne qui le suit ("code; // note\ncode();") -- sans ce report, les
                  # deux survivraient côte à côte au lieu de fusionner en un seul séparateur.

    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if stack and stack[-1] == "tpl":
            if c == _JS_BACKSLASH:
                out.append(text[i:i + 2]); i += 2; continue
            if c == "`":
                if pending: out.append(pending); pending = ""
                out.append(c); i += 1; stack.pop(); prev = "`"; continue
            if c == "$" and nxt == "{":
                if pending: out.append(pending); pending = ""
                out.append("${"); i += 2; stack.append("expr"); prev = "{"; continue
            out.append(c); i += 1
            continue

        if c == "/" and nxt == "/":
            while i < n and text[i] not in "\r\n":
                i += 1
            continue
        if c == "/" and nxt == "*":
            i += 2
            while i < n and not (text[i] == "*" and i + 1 < n and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        if c in ('"', "'"):
            if pending: out.append(pending); pending = ""
            quote = c
            out.append(c); i += 1
            while i < n:
                if text[i] == _JS_BACKSLASH:
                    out.append(text[i:i + 2]); i += 2; continue
                out.append(text[i])
                if text[i] == quote:
                    i += 1; break
                i += 1
            prev = quote
            continue
        if c == "`":
            if pending: out.append(pending); pending = ""
            out.append(c); i += 1; stack.append("tpl"); prev = "`"
            continue
        if c == "}" and stack and stack[-1] == "expr":
            if pending: out.append(pending); pending = ""
            out.append(c); i += 1; stack.pop(); prev = "}"
            continue
        if c == "/" and (prev == "" or prev in "(,=:[!&|?{};+-*%~^<>"):
            # Un '/' ne peut ouvrir une regex qu'après un opérateur/mot-clé -- jamais après
            # un identifiant, un nombre, ')' ou ']', auquel cas c'est une division.
            if pending: out.append(pending); pending = ""
            out.append(c); i += 1
            in_class = False
            while i < n:
                if text[i] == _JS_BACKSLASH:
                    out.append(text[i:i + 2]); i += 2; continue
                ch = text[i]
                if ch in "\r\n":  # regex non refermée avant fin de ligne : source invalide,
                    break         # on abandonne plutôt que d'avaler la suite du fichier.
                out.append(ch); i += 1
                if ch == "[":
                    in_class = True
                elif ch == "]":
                    in_class = False
                elif ch == "/" and not in_class:
                    break
            prev = "/"
            continue

        if c.isspace():
            j, newline = i, False
            while j < n and text[j].isspace():
                if text[j] in "\r\n":
                    newline = True
                j += 1
            # Un retour à la ligne doit survivre en tant que tel : l'insertion automatique
            # de point-virgule (ASI) en dépend. On ne l'écrit pas tout de suite (out peut être
            # vide en tout début de fichier, et un commentaire supprimé peut suivre) : c'est
            # `pending` qui porte le séparateur jusqu'au prochain vrai token, un saut de ligne
            # l'emportant toujours sur un simple espace déjà en attente.
            if out or pending:
                pending = "\n" if (newline or pending == "\n") else " "
            i = j
            continue

        if pending: out.append(pending); pending = ""
        out.append(c)
        prev = c
        i += 1

    return "".join(out)

def minify_json(text: str) -> str:
    try:
        data = json.loads(text)
        return json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    except:
        return text

def minify_svg(text: str) -> str:
    # Suppression des commentaires SVG/XML : même bug que minify_html, l'ancien pattern vide
    # (`r""`) ne retirait jamais rien.
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    return re.sub(r">\s+<", "><", text).strip()

MINIFIERS = {
    ".html": minify_html,
    ".htm":  minify_html,
    ".css":  minify_css,
    ".js":   minify_js,
    ".json": minify_json,
    ".svg":  minify_svg,
    ".xml":  minify_svg,
}

# Les 3 feuilles de style de data-dev/ restent séparées côté source (cascade base -> main ->
# overlays, chacune éditable indépendamment) mais sont concaténées en un seul index.css.gz -- même
# convention de nommage que index.js, déjà un bundle unique. Contrairement au JS (pas de tags à
# fusionner, data-dev/index.html ne référence déjà qu'un seul index.js), l'HTML source référence
# encore les 3 fichiers séparément : on adapte plutôt data-dev/index.html pour ne référencer que
# index.css, plus simple que de réécrire les <link> à la volée ici. Le gain n'est pas qu'au premier
# chargement (contrairement à un cache immuable classique) : ces fichiers sont revalidés à chaque
# requête (Cache-Control: no-cache, cf. Web.cpp), donc passer de 3 requêtes à 1 se répète à chaque
# rendu de la page.
CSS_CHUNKS = ("base.css", "main.css", "overlays.css")

def concat_css_chunks(src_dir: str, dst_dir: str):
    parts = []
    total = 0
    for name in CSS_CHUNKS:
        path = os.path.join(src_dir, name)
        if not os.path.isfile(path):
            return
        total += os.path.getsize(path)
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            parts.append(minify_css(f.read()))
    gz_path = os.path.join(dst_dir, "index.css.gz")
    # Jointure par un retour à la ligne : un fichier sans retour à la ligne final ne doit pas
    # coller sa dernière règle à la première du fichier suivant.
    with gzip.open(gz_path, "wb", compresslevel=9) as gz:
        gz.write("\n".join(parts).encode("utf-8"))
    new_sz = os.path.getsize(gz_path)
    pct = ((total - new_sz) / total * 100) if total else 0
    print(f"  {'*.css -> index.css':<30} {total:>7} -> {new_sz:>7} B ({pct:>3.0f}%) [concat+minify+gzip]")

# Même logique que CSS_CHUNKS/concat_css_chunks ci-dessus, appliquée au JS : data-dev/js/ garde le
# code applicatif en chunks nommés et ordonnés par domaine (plus maintenable qu'un index.js
# monolithique), le firmware ne sert toujours qu'UN SEUL index.js.gz. Contrairement au CSS (pas de
# contrainte d'ordre d'exécution), l'ordre ici est significatif -- tous les chunks partagent le
# même scope global JS, et les suivants référencent des helpers/classes définis par les
# précédents -- d'où le tuple ordonné plutôt qu'un simple tri alphabétique du dossier. Les
# préfixes numériques (00/10/20...) laissent des trous pour insérer un futur chunk sans renommer
# les autres. data-dev/index.html doit rester en phase (cf. window.__loadJsFallback, même ordre).
JS_CHUNKS_DIR = "js"
JS_CHUNKS = (
    "00-bootstrap.js",    # constantes globales, config dev/geo, get()
    "10-core-utils.js",   # i18n, calcul solaire/uptime, helpers HTTP
    "20-shell.js",        # websocket, overlays, dirty-tracking, routeur de navigation, init()
    "30-ui-binder.js",    # class UIBinder (moteur de binding générique)
    "35-security.js",     # class Security
    "40-general.js",      # class General (réglages généraux)
    "50-wifi.js",         # class Wifi
    "60-onboarding.js",   # class Onboarding
    "70-somfy.js",        # class Somfy (volets + rooms/devices/groups/schedules/repeaters)
    "90-mqtt.js",         # class MQTT
    "95-firmware.js",     # class Firmware
)

def concat_js_chunks(src_dir: str, dst_dir: str):
    js_dir = os.path.join(src_dir, JS_CHUNKS_DIR)
    parts = []
    total = 0
    for name in JS_CHUNKS:
        path = os.path.join(js_dir, name)
        if not os.path.isfile(path):
            raise RuntimeError(f"concat_js_chunks: chunk manquant : {JS_CHUNKS_DIR}/{name}")
        total += os.path.getsize(path)
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            parts.append(minify_js(f.read()))
    gz_path = os.path.join(dst_dir, "index.js.gz")
    # Jointure par un retour à la ligne : l'ASI (insertion automatique de point-virgule) dépend
    # d'un vrai saut de ligne entre la dernière instruction d'un chunk et la première du suivant.
    with gzip.open(gz_path, "wb", compresslevel=9) as gz:
        gz.write("\n".join(parts).encode("utf-8"))
    new_sz = os.path.getsize(gz_path)
    pct = ((total - new_sz) / total * 100) if total else 0
    print(f"  {'js/*.js -> index.js':<30} {total:>7} -> {new_sz:>7} B ({pct:>3.0f}%) [concat+minify+gzip]")

# ──────────────────────────────────────────────
# Cache HTTP des assets versionnés (index.js/index.css) : immuable un an SEULEMENT sur une
# release propre. En dev, resolve_build_version() change le ?v= à chaque contenu modifié, mais un
# hard-refresh est facile à oublier pendant un test répété -- et ce cache a déjà produit deux
# incidents réels ici (JS/CSS périmé après reflash/AP/erase, cf. commits "fix cache statique" et
# "Corrige définitivement le cache statique...", tous deux découverts EN TESTANT activement).
# On réserve donc l'immuable aux builds propres, où ce risque d'itération rapide ne se pose pas :
# le flag est un define C++ (pas un fichier LittleFS) pour rester décidé une fois pour toutes à la
# compilation, sans lecture ni stockage supplémentaire sur le device.
# ──────────────────────────────────────────────

def _set_build_cache_flag(build_version: str):
    is_release = "-dev-" not in build_version
    env.Append(CPPDEFINES=[("BUILD_ASSET_CACHE_IMMUTABLE", "1" if is_release else "0")])

# ──────────────────────────────────────────────
# Logique de traitement
# ──────────────────────────────────────────────

def process_file(src_path: str, dst_path: str, build_version: str):
    ext = os.path.splitext(src_path)[1].lower()
    original_size = os.path.getsize(src_path)

    os.makedirs(os.path.dirname(dst_path), exist_ok=True)

    # Traitement des fichiers WebP (Compression via cwebp)
    if ext in WEBP_EXTENSIONS:
        try:
            # -q 75 : Règle la qualité à 75%
            subprocess.run(
                ["cwebp", "-q", "75", src_path, "-o", dst_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            final_size = os.path.getsize(dst_path)
            return "webp-compress", original_size, final_size
        except Exception:
            shutil.copy2(src_path, dst_path)
            return "copy (webp fail)", original_size, original_size

    # Traitement Textes (Minify + Gzip)
    if ext in MINIFY_AND_GZIP:
        with open(src_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        # --- Injection de la version (cache-busting ?v=) dans l'HTML ---
        if ext in {".html", ".htm"}:
            content = content.replace("{{VERSION}}", build_version)

        minifier = MINIFIERS.get(ext)
        if minifier:
            content = minifier(content)
            action = "minify+gzip"
        else:
            action = "gzip"

        gz_path = dst_path + ".gz"
        with gzip.open(gz_path, "wb", compresslevel=9) as gz:
            gz.write(content.encode("utf-8"))

        final_size = os.path.getsize(gz_path)
        return action, original_size, final_size

    shutil.copy2(src_path, dst_path)
    return "copy", original_size, original_size

def _embed_default_language(dst_dir, build_version):
    """Copie (minifiée + gzippée) la seule langue embarquée par défaut pour cet environnement de
    build, depuis locales/<code>.json vers data/locale/<code>.json.gz -- même format que les
    autres fichiers de langue, lu tel quel par handleLang() (Content-Encoding: gzip)."""
    lang = _embedded_lang_for_env()
    src_path = os.path.join(_locales_dir(), f"{lang}.json")
    if not os.path.isfile(src_path):
        print(f"[minify] ATTENTION : langue par défaut '{lang}' introuvable dans {LOCALES_DIR_NAME}/ ({src_path})")
        return
    rel_path = os.path.join("locale", f"{lang}.json")
    dst_path = os.path.join(dst_dir, rel_path)
    action, old_sz, new_sz = process_file(src_path, dst_path, build_version)
    saved = old_sz - new_sz
    pct = (saved / old_sz * 100) if old_sz > 0 else 0
    print(f"  {rel_path:<30} {old_sz:>7} -> {new_sz:>7} B ({pct:>3.0f}%) [{action}] (embarquée d'usine)")

def _embed_manifest(dst_dir):
    """Copie locales/manifest.json -- minifié mais SANS gzip, contrairement aux fichiers de
    langue -- vers data/manifest.json. Lu directement par le backend C++ (handleGetAvailableLangs,
    ArduinoJson) qui n'a pas de capacité de décompression gzip ; permet au catalogue des langues
    de rester utilisable hors-ligne (mode AP/hotspot), sans dépendre d'une requête GitHub."""
    src_path = os.path.join(_locales_dir(), "manifest.json")
    if not os.path.isfile(src_path):
        print(f"[minify] ATTENTION : manifest.json introuvable dans {LOCALES_DIR_NAME}/")
        return
    old_sz = os.path.getsize(src_path)
    with open(src_path, "r", encoding="utf-8") as f:
        content = minify_json(f.read())
    dst_path = os.path.join(dst_dir, "manifest.json")
    with open(dst_path, "w", encoding="utf-8") as f:
        f.write(content)
    new_sz = os.path.getsize(dst_path)
    pct = ((old_sz - new_sz) / old_sz * 100) if old_sz > 0 else 0
    print(f"  {'manifest.json':<30} {old_sz:>7} -> {new_sz:>7} B ({pct:>3.0f}%) [minify, no gzip]")

def minify_all():
    src_dir = _src_dir()
    dst_dir = _dst_dir()

    if not os.path.isdir(src_dir):
        return

    if os.path.exists(dst_dir):
        shutil.rmtree(dst_dir)
    os.makedirs(dst_dir, exist_ok=True)

    build_version = resolve_build_version()
    print(f"\n[minify] Optimisation des assets : {SRC_DIR_NAME} -> {DST_DIR_NAME}")
    print(f"[minify] Cache-busting version (?v=): {build_version}")
    _set_build_cache_flag(build_version)

    concat_css_chunks(src_dir, dst_dir)
    concat_js_chunks(src_dir, dst_dir)

    js_dir = os.path.join(src_dir, JS_CHUNKS_DIR)
    for root, dirs, files in os.walk(src_dir):
        # data-dev/js/*.js vient d'être fusionné dans index.js.gz ci-dessus : ce dossier n'est
        # qu'une source, jamais livré tel quel (comme base.css/main.css/overlays.css plus bas).
        if root == js_dir:
            dirs[:] = []
            continue
        for fname in sorted(files):
            if fname.startswith(".") or fname.endswith("~"): continue
            # base.css/main.css/overlays.css viennent d'être fusionnées dans index.css.gz ci-dessus.
            if root == src_dir and fname in CSS_CHUNKS: continue

            src_path = os.path.join(root, fname)
            rel_path = os.path.relpath(src_path, src_dir)
            dst_path = os.path.join(dst_dir, rel_path)

            action, old_sz, new_sz = process_file(src_path, dst_path, build_version)

            saved = old_sz - new_sz
            pct = (saved / old_sz * 100) if old_sz > 0 else 0
            print(f"  {rel_path:<30} {old_sz:>7} -> {new_sz:>7} B ({pct:>3.0f}%) [{action}]")

    print(f"[minify] Langue embarquée par défaut pour cet environnement : {_embedded_lang_for_env()}")
    _embed_default_language(dst_dir, build_version)
    _embed_manifest(dst_dir)

# Lancement
minify_all()
