"""Shared, read-only catalogue API for DFE sports. No network fetch in a request."""
import hashlib
import json
from pathlib import Path
from flask import Blueprint, abort, jsonify, request, send_from_directory, redirect

SPORTS = {"hockey": {"title": "Pocket Hockey", "players_per_side": 6, "periods": 3},
          "soccer": {"title": "Pocket Soccer", "players_per_side": 11, "periods": 2}}

def load_catalogue(asset_root: Path, sport: str) -> dict:
    if sport not in SPORTS:
        raise ValueError("Unknown sport")
    data = json.loads((asset_root / "data" / f"teams-{sport}.json").read_text(encoding="utf-8"))
    expected = 32 if sport == "hockey" else 19
    if len(data.get("teams", [])) != expected:
        raise ValueError("Incomplete roster snapshot")
    ids = [team["id"] for team in data["teams"]]
    if len(set(ids)) != expected:
        raise ValueError("Duplicate team IDs")
    for team in data["teams"]:
        if len(team["players"]) != SPORTS[sport]["players_per_side"]:
            raise ValueError("Incomplete playable lineup")
    return data

def create_sports_blueprint(asset_root: Path) -> Blueprint:
    root = Path(asset_root).resolve()
    bp = Blueprint("pocket_sports", __name__)

    @bp.get("/pocket-sports/")
    def hub():
        return send_from_directory(root, "hub.html")

    @bp.get("/sports/", defaults={"filename": "index.html"})
    @bp.get("/sports/<path:filename>")
    def assets(filename):
        return send_from_directory(root, filename)

    # PGI is served at /gridiron/, so its relative ../pocket_sports_assets/
    # import needs a URL alias as well as the adjacent filesystem directory.
    @bp.get("/pocket_sports_assets/<path:filename>")
    def shared_assets(filename):
        return send_from_directory(root, filename)

    @bp.get("/hockey/")
    def hockey():
        return redirect("/sports/?sport=hockey")

    @bp.get("/soccer/")
    def soccer():
        return redirect("/sports/?sport=soccer")

    @bp.get("/api/v1/sports")
    def registry():
        return jsonify({"schema_version": 1, "engine_version": "1.6.0", "sports": SPORTS,
                        "hub": "/pocket-sports/", "games": {
                            "gridiron": {"title": "Pocket Gridiron", "url": "/gridiron/"},
                            "soccer": {"title": "Pocket Soccer", "url": "/sports/?sport=soccer"},
                            "hockey": {"title": "Pocket Hockey", "url": "/sports/?sport=hockey"}}})

    @bp.get("/api/v1/sports/<sport>/teams")
    def teams(sport):
        if sport not in SPORTS:
            abort(404)
        try:
            data = load_catalogue(root, sport)
        except (OSError, ValueError, KeyError):
            return jsonify({"error": "Roster snapshot is unavailable"}), 503
        # ETag includes metadata and roster content: no stale date-only validator.
        body = json.dumps({"schema_version": 1, **data}, ensure_ascii=False, sort_keys=True)
        from flask import Response
        response = Response(body, mimetype="application/json")
        response.set_etag(hashlib.sha256(body.encode()).hexdigest())
        response.headers["Cache-Control"] = "public, max-age=300"
        return response.make_conditional(request)

    return bp
