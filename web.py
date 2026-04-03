from pathlib import Path

from flask import Flask, Response, send_from_directory

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html

app = Flask(__name__)
REPO_ROOT = Path(__file__).resolve().parent


@app.route("/")
def home():
    context = build_daily_page(theme_name="irish_today")
    html = build_html(context)
    return Response(html, mimetype="text/html")


@app.route("/daily_flyer/<path:filename>")
def daily_flyer_static(filename: str):
    return send_from_directory(REPO_ROOT / "daily_flyer", filename)