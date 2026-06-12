import os
from pathlib import Path

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


@app.route("/daily_flyer/<path:filename>")
def daily_flyer_static(filename: str):
    return send_from_directory(REPO_ROOT / "daily_flyer", filename)


if __name__ == "__main__":
    app.run(debug=True)
