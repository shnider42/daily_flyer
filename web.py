import gzip
import os
import time
from copy import deepcopy
from pathlib import Path

from flask import Flask, Response, abort, request, send_from_directory

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.theme_validation import ThemeNotFoundError, ThemeValidationError
from daily_flyer.utils import resolve_date

app = Flask(__name__)
REPO_ROOT = Path(__file__).resolve().parent

DEFAULT_THEME = os.environ.get("DEFAULT_THEME", "irish_today")
THEME_ROUTE_ALIASES = {
    "irish_today": "irish_today_improved_layout",
    "irish_today_improved": "irish_today_improved_layout",
    "irish_today_visual_lab": "irish_today_visual_lab_debug_safe",
    "e46_owner_companion": "garage_journey_v13",
    "garage": "garage_journey_v13",
    "garage_journey": "garage_journey_v13",
    "e46_workshop": "e46_owner_companion_v7",
    "porsche_gt4_workshop": "porsche_718_cayman_gt4_2023_v4",
    "mustang_gt_workshop": "mustang_gt_2016",
    "focus_st_workshop": "focus_st_2015",
}

# These pages are server-static for a code version. Personal Garage/profile
# state lives in localStorage and is applied by browser-side JS, so it is safe
# to reuse one compiled PageContext per Gunicorn worker.
CACHEABLE_VEHICLE_THEMES = {
    "garage_journey_v13",
    "e46_owner_companion_v7",
    "porsche_718_cayman_gt4_2023_v4",
    "mustang_gt_2016",
    "focus_st_2015",
}
_STATIC_CONTEXT_CACHE: dict[str, object] = {}

THEME_ASSET_KEYS = {
    "e46_owner_companion_v7": "e46-workshop-v7",
    "porsche_718_cayman_gt4_2023_v4": "porsche-gt4-workshop-v4",
    "mustang_gt_2016": "mustang-gt-workshop-v1",
    "focus_st_2015": "focus-st-workshop-v1",
}
ASSET_KEY_THEMES = {value: key for key, value in THEME_ASSET_KEYS.items()}
_THEME_ASSET_CACHE: dict[str, tuple[str, str]] = {}


def _normalize_theme_name(raw: str | None) -> str:
    theme_name = (raw or DEFAULT_THEME).strip().replace("-", "_")
    if not theme_name:
        theme_name = DEFAULT_THEME.strip().replace("-", "_")
    if not theme_name.replace("_", "").isalnum():
        abort(400, description="Invalid theme name.")
    return THEME_ROUTE_ALIASES.get(theme_name, theme_name)


_clean_theme_name = _normalize_theme_name


def _parse_seed(raw: str | None) -> int | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        abort(400, description="Invalid seed value.")


def _versioned_asset_response(content: str, mimetype: str) -> Response:
    response = Response(content, mimetype=mimetype)
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


def _build_context(theme_name: str, date_str: str | None, seed: int | None):
    if theme_name not in CACHEABLE_VEHICLE_THEMES:
        return build_daily_page(theme_name=theme_name, date_str=date_str, seed=seed)

    today = resolve_date(date_str)
    template = _STATIC_CONTEXT_CACHE.get(theme_name)
    if template is None:
        context = build_daily_page(theme_name=theme_name, date_str=date_str, seed=seed)
        _STATIC_CONTEXT_CACHE[theme_name] = deepcopy(context)
        return context

    context = deepcopy(template)
    context.today_str = today.strftime("%A, %B %d, %Y")
    context.metadata["date_key"] = today.strftime("%m-%d")
    return context


def _externalize_workshop_assets(theme_name: str, context):
    asset_key = THEME_ASSET_KEYS.get(theme_name)
    if not asset_key:
        return context

    css = context.metadata.get("extra_css", "") or ""
    js = context.metadata.get("extra_js", "") or ""
    _THEME_ASSET_CACHE[asset_key] = (css, js)

    head = context.metadata.get("extra_head_html", "") or ""
    if css:
        head += f'<link rel="stylesheet" href="/theme-assets/{asset_key}.css">'
    if js:
        head += f'<script defer src="/theme-assets/{asset_key}.js"></script>'

    context.metadata["extra_css"] = ""
    context.metadata["extra_js"] = ""
    context.metadata["extra_head_html"] = head
    return context


def _compiled_workshop_assets(asset_key: str) -> tuple[str, str]:
    cached = _THEME_ASSET_CACHE.get(asset_key)
    if cached is not None:
        return cached

    theme_name = ASSET_KEY_THEMES.get(asset_key)
    if not theme_name:
        abort(404)

    context = build_daily_page(theme_name=theme_name)
    assets = (
        context.metadata.get("extra_css", "") or "",
        context.metadata.get("extra_js", "") or "",
    )
    _THEME_ASSET_CACHE[asset_key] = assets
    _STATIC_CONTEXT_CACHE.setdefault(theme_name, deepcopy(context))
    return assets


@app.route("/garage-journey-assets-v13.css")
def garage_journey_css():
    from daily_flyer.themes import garage_journey_v13
    return _versioned_asset_response(garage_journey_v13.asset_css(), "text/css")


@app.route("/garage-journey-assets-v13.js")
def garage_journey_js():
    from daily_flyer.themes import garage_journey_v13
    return _versioned_asset_response(
        garage_journey_v13.asset_js(), "application/javascript"
    )


@app.route("/theme-assets/<asset_key>.css")
def vehicle_theme_css(asset_key: str):
    css, _ = _compiled_workshop_assets(asset_key)
    return _versioned_asset_response(css, "text/css")


@app.route("/theme-assets/<asset_key>.js")
def vehicle_theme_js(asset_key: str):
    _, js = _compiled_workshop_assets(asset_key)
    return _versioned_asset_response(js, "application/javascript")


@app.after_request
def compress_text_response(response: Response):
    if request.method != "GET" or response.status_code != 200:
        return response
    if response.direct_passthrough or response.headers.get("Content-Encoding"):
        return response
    if "gzip" not in request.headers.get("Accept-Encoding", "").lower():
        return response

    content_type = response.headers.get("Content-Type", "").lower()
    if not (
        content_type.startswith("text/")
        or "javascript" in content_type
        or "json" in content_type
        or "xml" in content_type
    ):
        return response

    data = response.get_data()
    if len(data) < 1024:
        return response
    compressed = gzip.compress(data, compresslevel=5)
    if len(compressed) >= len(data):
        return response

    response.set_data(compressed)
    response.headers["Content-Encoding"] = "gzip"
    response.headers["Content-Length"] = str(len(compressed))
    vary = response.headers.get("Vary", "")
    response.headers["Vary"] = "Accept-Encoding" if not vary else f"{vary}, Accept-Encoding"
    return response


@app.route("/")
def home():
    theme_name = _normalize_theme_name(request.args.get("theme"))
    date_str = (request.args.get("date") or "").strip() or None
    seed = _parse_seed(request.args.get("seed"))

    started = time.perf_counter()
    try:
        context = _build_context(theme_name, date_str, seed)
    except ThemeNotFoundError as exc:
        abort(400, description=str(exc))
    except ThemeValidationError as exc:
        abort(400, description=str(exc))
    except ValueError as exc:
        abort(400, description=str(exc) or "Invalid request.")
    theme_ms = (time.perf_counter() - started) * 1000

    context = _externalize_workshop_assets(theme_name, context)

    render_started = time.perf_counter()
    html = build_html(context)
    render_ms = (time.perf_counter() - render_started) * 1000

    response = Response(html, mimetype="text/html")
    response.headers["Server-Timing"] = (
        f"theme;dur={theme_ms:.1f}, render;dur={render_ms:.1f}"
    )

    # Garage + vehicle Workshop HTML is identical for all users; localStorage
    # applies ownership/profile state after load. Give browsers/proxies a short
    # cache window so repeat navigation can avoid the Render worker entirely.
    if theme_name in CACHEABLE_VEHICLE_THEMES and not date_str and seed is None:
        response.headers["Cache-Control"] = "public, max-age=120, stale-while-revalidate=600"

    return response


@app.route("/daily_flyer/<path:filename>")
def daily_flyer_static(filename: str):
    return send_from_directory(REPO_ROOT / "daily_flyer", filename)
