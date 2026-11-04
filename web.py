import os
from pathlib import Path

from flask import Flask, Response, abort, redirect, request, send_from_directory, url_for

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.theme_validation import ThemeNotFoundError, ThemeValidationError

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
    if theme_name == "saltbound":
        return redirect(url_for("saltbound"))
    if theme_name == "last_exit":
        return redirect(url_for("last_exit"))
    if theme_name == "pocket_gridiron":
        return redirect(url_for("pocket_gridiron"))
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


@app.route("/daily_flyer/<path:filename>")
def daily_flyer_static(filename: str):
    return send_from_directory(REPO_ROOT / "daily_flyer", filename)

@app.route("/gridiron/", defaults={"filename": "index.html"})
@app.route("/gridiron/<path:filename>")
def pocket_gridiron(filename: str):
    from daily_flyer.themes.pocket_gridiron import ASSET_DIR, fetch_roster
    if filename == "api/roster":
        try:
            text, fetched_at = fetch_roster()
        except (OSError, ValueError, RuntimeError):
            return {"error": "Roster source unavailable; keep the working snapshot."}, 503
        return Response(text, mimetype="text/csv", headers={
            "X-Roster-Fetched-At": fetched_at,
            "Cache-Control": "public, max-age=3600",
        })
    return send_from_directory(ASSET_DIR, filename)


@app.route("/last-exit/", defaults={"filename": "index.html"})
@app.route("/last-exit/<path:filename>")
def last_exit(filename: str):
    from daily_flyer.themes.last_exit import ASSET_DIR
    return send_from_directory(ASSET_DIR, filename)


@app.route("/saltbound/", defaults={"filename": "index.html"})
@app.route("/saltbound/<path:filename>")
def saltbound(filename: str):
    from daily_flyer.themes.saltbound import ASSET_DIR
    return send_from_directory(ASSET_DIR, filename)

