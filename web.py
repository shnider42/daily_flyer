from pathlib import Path

from flask import Flask, Response, abort, request, send_from_directory

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html

app = Flask(__name__)
REPO_ROOT = Path(__file__).resolve().parent

DEFAULT_THEME = "irish_today"


def _clean_theme_name(raw: str | None) -> str:
    theme_name = (raw or DEFAULT_THEME).strip()
    if not theme_name:
        return DEFAULT_THEME

    if not theme_name.replace("_", "").isalnum():
        abort(400, description="Invalid theme name.")

    return theme_name


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
    theme_name = _clean_theme_name(request.args.get("theme"))
    date_str = (request.args.get("date") or "").strip() or None
    seed = _parse_seed(request.args.get("seed"))

    context = build_daily_page(
        theme_name=theme_name,
        date_str=date_str,
        seed=seed,
    )
    html = build_html(context)
    return Response(html, mimetype="text/html")


@app.route("/daily_flyer/<path:filename>")
def daily_flyer_static(filename: str):
    return send_from_directory(REPO_ROOT / "daily_flyer", filename)
