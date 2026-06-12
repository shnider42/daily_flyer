import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Flask, Response, abort, request, send_file, send_from_directory

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.theme_validation import ThemeNotFoundError, ThemeValidationError
from daily_flyer_v2 import build_flyer_html

app = Flask(__name__)
REPO_ROOT = Path(__file__).resolve().parent

DEFAULT_THEME = os.environ.get("DEFAULT_THEME", "irish_today")
THEME_ROUTE_ALIASES = {
    "irish_today": "irish_today_improved_layout",
    "irish_today_improved": "irish_today_improved_layout",
    "irish_today_visual_lab": "irish_today_visual_lab_debug_safe",
}

F9_ITEM_IMAGE_SOURCES = {
    "cristiano": ["https://rocketleague.fandom.com/wiki/Special:FilePath/Cristiano_wheels_icon.png"],
    "zomba": ["https://rocketleague.fandom.com/wiki/Special:FilePath/Zomba_wheels_icon.png"],
    "standard": ["https://rocketleague.fandom.com/wiki/Special:FilePath/Standard_rocket_boost_icon.png"],
    "big-splash": ["https://rocketleague.fandom.com/wiki/Special:FilePath/Big_Splash_goal_explosion_icon.png"],
    "dueling-dragons": ["https://rocketleague.fandom.com/wiki/Special:FilePath/Dueling_Dragons_goal_explosion_icon.png"],
}
F9_ITEM_IMAGE_LABELS = {
    "cristiano": "Cristiano wheels",
    "zomba": "Titanium White Zomba",
    "standard": "Standard boost",
    "big-splash": "Big Splash",
    "dueling-dragons": "Dueling Dragons",
}


def _normalize_theme_name(raw: str | None) -> str:
    """Return a Python module-safe Daily Flyer theme name.

    Render env vars and URLs are easy places to type theme names with hyphens
    (`topic-signal-daily`), while Daily Flyer theme modules use underscores
    (`topic_signal_daily`). Accept both spellings at the web boundary.
    """
    theme_name = (raw or DEFAULT_THEME).strip().replace("-", "_")
    if not theme_name:
        theme_name = DEFAULT_THEME.strip().replace("-", "_")

    if not theme_name.replace("_", "").isalnum():
        abort(400, description="Invalid theme name.")

    return THEME_ROUTE_ALIASES.get(theme_name, theme_name)


# Backward-compatible name for existing tests/imports.
_clean_theme_name = _normalize_theme_name


def _parse_seed(raw: str | None) -> int | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        abort(400, description="Invalid seed value.")


def _f9_item_fallback_svg(slug: str) -> str:
    label = F9_ITEM_IMAGE_LABELS.get(slug, "F9 Item")
    accent = {
        "cristiano": "#d9d2b6",
        "zomba": "#59e0ff",
        "standard": "#7dff9b",
        "big-splash": "#2bc7ff",
        "dueling-dragons": "#ff8a3d",
    }.get(slug, "#ff8a3d")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 620" role="img" aria-label="{label}">
  <defs>
    <radialGradient id="g" cx="68%" cy="38%" r="62%">
      <stop offset="0" stop-color="{accent}" stop-opacity="0.88"/>
      <stop offset="0.5" stop-color="{accent}" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#05070c" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="900" height="620" fill="url(#g)"/>
  <g filter="url(#glow)" transform="translate(140 86)">
    <path d="M90 278c0-110 90-200 200-200s200 90 200 200-90 200-200 200S90 388 90 278Z" fill="none" stroke="{accent}" stroke-width="26" opacity="0.82"/>
    <path d="M173 278c0-64 53-117 117-117s117 53 117 117-53 117-117 117-117-53-117-117Z" fill="none" stroke="#fff8ee" stroke-width="16" opacity="0.56"/>
    <path d="M36 278h508M290 24v508" stroke="#fff8ee" stroke-width="8" opacity="0.24"/>
  </g>
  <text x="56" y="560" fill="#fff8ee" font-family="Rajdhani, Arial, sans-serif" font-size="58" font-weight="800">{label}</text>
  <text x="58" y="600" fill="{accent}" font-family="Rajdhani, Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="8">GARAGE PICK</text>
</svg>"""


@app.route("/")
def home():
    theme_name = _normalize_theme_name(request.args.get("theme"))
    date_str = (request.args.get("date") or "").strip() or None
    seed = _parse_seed(request.args.get("seed"))

    try:
        context = build_daily_page(
            theme_name=theme_name,
            date_str=date_str,
            seed=seed,
        )
    except ThemeNotFoundError as exc:
        abort(400, description=str(exc))
    except ThemeValidationError as exc:
        abort(400, description=str(exc))
    except ValueError as exc:
        abort(400, description=str(exc) or "Invalid request.")

    html = build_html(context)
    return Response(html, mimetype="text/html")


@app.route("/v2")
def flyer_engine_v2():
    product = (request.args.get("product") or "f9_daily").strip() or "f9_daily"
    date_str = (request.args.get("date") or "").strip() or None
    seed = _parse_seed(request.args.get("seed"))

    try:
        html = build_flyer_html(product=product, date_str=date_str, seed=seed)
    except ValueError as exc:
        abort(400, description=str(exc) or "Invalid Flyer Engine v2 request.")

    return Response(html, mimetype="text/html")


@app.route("/f9-logo-debug.png")
def f9_logo_debug():
    logo_path = REPO_ROOT / "static" / "f9_logo.png"
    if not logo_path.exists():
        abort(404, description=f"F9 logo missing at {logo_path}")
    response = send_file(logo_path, mimetype="image/png", max_age=0)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["X-F9-Logo-Path"] = str(logo_path)
    response.headers["X-F9-Logo-Bytes"] = str(logo_path.stat().st_size)
    return response


@app.route("/f9-item-image/<slug>")
def f9_item_image(slug: str):
    slug = slug.strip().lower()
    if slug not in F9_ITEM_IMAGE_SOURCES:
        abort(404, description="Unknown F9 item image.")

    if request.args.get("fallback") != "1":
        for source_url in F9_ITEM_IMAGE_SOURCES[slug]:
            try:
                req = Request(source_url, headers={"User-Agent": "DailyFlyer/1.0 (+F9 Hub item image proxy)"})
                with urlopen(req, timeout=3) as upstream:
                    content_type = upstream.headers.get("Content-Type", "")
                    payload = upstream.read(1_500_000)
                if payload and content_type.startswith("image/"):
                    response = Response(payload, mimetype=content_type.split(";", 1)[0])
                    response.headers["Cache-Control"] = "public, max-age=21600"
                    response.headers["X-F9-Item-Image-Source"] = source_url
                    return response
            except (HTTPError, URLError, TimeoutError, ValueError, OSError):
                continue

    svg = _f9_item_fallback_svg(slug)
    response = Response(svg, mimetype="image/svg+xml")
    response.headers["Cache-Control"] = "public, max-age=3600"
    response.headers["X-F9-Item-Image-Source"] = "fallback"
    return response


@app.route("/daily_flyer/<path:filename>")
def daily_flyer_static(filename: str):
    return send_from_directory(REPO_ROOT / "daily_flyer", filename)


if __name__ == "__main__":
    app.run(debug=True)
