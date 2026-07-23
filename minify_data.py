
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

# Extensions à traiter (Minify + Gzip)
MINIFY_AND_GZIP = {".html", ".htm", ".css", ".js", ".json", ".svg", ".xml"}
WEBP_EXTENSIONS = {".webp"}

def _project_dir():
    return env.subst("$PROJECT_DIR")

def _src_dir():
    return os.path.join(_project_dir(), SRC_DIR_NAME)

def _dst_dir():
    return os.path.join(_project_dir(), DST_DIR_NAME)

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
    text = re.sub(r"", "", text, flags=re.DOTALL)
    text = re.sub(r">\s+<", "> <", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()

def minify_css(text: str) -> str:
    # 1. Supprimer les commentaires
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    
    # 2. Remplacer les retours à la ligne et tabulations par des espaces simples
    text = re.sub(r"\s+", " ", text)
    
    # 3. Supprimer les espaces inutiles autour des caractères de structure CSS
    text = re.sub(r"\s*([:{};,])\s*", r"\1", text)
    
    # 4. ASTUCE POUR FIREFOX : On isole les règles -webkit- en réinjectant un espace 
    # après chaque fermeture d'accolade qui les concerne pour casser le bloc unique.
    text = re.sub(r"([^{]*?-webkit-[^}]+})", r"\1\n", text)
    
    return text.strip()

def minify_js(text: str) -> str:
    return text

def minify_json(text: str) -> str:
    try:
        data = json.loads(text)
        return json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    except:
        return text

def minify_svg(text: str) -> str:
    text = re.sub(r"", "", text, flags=re.DOTALL)
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

    for root, dirs, files in os.walk(src_dir):
        for fname in sorted(files):
            if fname.startswith(".") or fname.endswith("~"): continue

            src_path = os.path.join(root, fname)
            rel_path = os.path.relpath(src_path, src_dir)
            dst_path = os.path.join(dst_dir, rel_path)

            action, old_sz, new_sz = process_file(src_path, dst_path, build_version)

            saved = old_sz - new_sz
            pct = (saved / old_sz * 100) if old_sz > 0 else 0
            print(f"  {rel_path:<30} {old_sz:>7} -> {new_sz:>7} B ({pct:>3.0f}%) [{action}]")

# Lancement
minify_all()
