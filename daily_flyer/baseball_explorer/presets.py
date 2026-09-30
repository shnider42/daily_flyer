"""Public, shared baseball presets; deliberately no authentication."""
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
from flask import Blueprint, jsonify
from .data import load_dataset, METRICS
from daily_flyer.qb_explorer.presets import Conflict, input_payload, revision

IDS = ("slumps", "leaps", "boston", "hall", "durable")
DEFAULTS = dict(role="batting", mode="compare", metric="ops", outcome="durable", x="b",
                search="", era="all", team="all", hof="all", qual2=False, skip2020=False,
                sort="name", view="pair", window="10", normalize="raw", scale="linear",
                layout="overlay", colors="player", selection="fixed", count=4,
                ids=["ortizda01", "bettsmo01", "troutmi01", "judgeaa01"])
CHOICES = dict(role=("batting", "pitching"), mode=("compare", "research", "scan"),
               outcome=("job", "durable", "future", "stars", "awards", "hof"), x=("a", "b", "delta"),
               era=("all", "1950", "1960", "1970", "1980", "1990", "2000", "2010", "2020"),
               hof=("all", "yes", "no"), sort=("name", "improved", "declined", "newest", "oldest", "span"),
               view=("pair", "career", "span"), window=("5", "10", "all"), normalize=("raw", "delta", "zscore"),
               scale=("linear", "density", "log", "symlog"), layout=("overlay", "separate"),
               colors=("player", "team", "hof"), selection=("fixed", "improved", "declined"))


def factory_presets():
    specs = [
        ("Biggest hitting slumps", "The biggest year-two OPS drops", dict(selection="declined", sort="declined", qual2=True, normalize="delta", layout="separate")),
        ("Pitchers who leaped", "Which pitchers cut their ERA the most?", dict(role="pitching", metric="era", selection="improved", sort="improved", qual2=True, normalize="delta", layout="separate", ids=[])),
        ("Boston beginnings", "Ortiz, Betts and Devers: what came after year two?", dict(ids=["ortizda01", "bettsmo01", "deverra01"], view="career", layout="separate")),
        ("Hall of Fame signal?", "Does year two add a Hall of Fame signal?", dict(mode="research", outcome="hof", metric="relative_ops")),
        ("Who stuck around?", "Can year-two WHIP help explain staying power?", dict(role="pitching", mode="research", metric="whip", outcome="durable", ids=[])),
    ]
    return [dict(id=key, label=label, title=title, note="", settings=dict(deepcopy(DEFAULTS), **settings)) for key, (label, title, settings) in zip(IDS, specs)]


def validate_presets(value):
    if not isinstance(value, list) or len(value) != 5:
        raise ValueError("Include all five preset slots.")
    result = deepcopy(value)
    data = load_dataset()
    for i, p in enumerate(result):
        if not isinstance(p, dict) or set(p) != {"id", "label", "title", "note", "settings"} or p["id"] != IDS[i]:
            raise ValueError("Keep the five preset slot IDs and fields intact.")
        for key, limit in (("label", 48), ("title", 140), ("note", 1200)):
            if not isinstance(p[key], str) or len(p[key]) > limit or (key != "note" and not p[key].strip()):
                raise ValueError(f"{key} must be text, at most {limit} characters.")
            p[key] = p[key].strip()
        s = p["settings"]
        if not isinstance(s, dict) or set(s) != set(DEFAULTS):
            raise ValueError("Missing or unknown view settings.")
        for key, choices in CHOICES.items():
            if not isinstance(s[key], str) or s[key] not in choices:
                raise ValueError(f"Invalid {key}.")
        if not isinstance(s["metric"], str) or s["metric"] not in METRICS[s["role"]]:
            raise ValueError("Choose a metric for this player role.")
        if not isinstance(s["team"], str) or s["team"] not in {"all", *data["teams"]}:
            raise ValueError("Unknown team.")
        if not isinstance(s["search"], str) or len(s["search"]) > 100:
            raise ValueError("Search must be text of at most 100 characters.")
        if any(type(s[k]) is not bool for k in ("qual2", "skip2020")):
            raise ValueError("Year-two qualification and 2020 filters must be true or false.")
        if type(s["count"]) is not int or not 1 <= s["count"] <= 25:
            raise ValueError("Ranking count must be between 1 and 25.")
        players = {p["id"] for p in data[s["role"]]["players"]}
        if not isinstance(s["ids"], list) or len(s["ids"]) > 100 or any(not isinstance(v, str) or v not in players for v in s["ids"]):
            raise ValueError("Select at most 100 players from this role.")
        s["ids"] = list(dict.fromkeys(s["ids"]))
    return result


def db_path():
    if os.environ.get("BASEBALL_PRESET_DB"):
        return Path(os.environ["BASEBALL_PRESET_DB"])
    if os.environ.get("QB_PRESET_DB"):
        return Path(os.environ["QB_PRESET_DB"]).with_name("baseball_presets.sqlite3")
    return Path(__file__).resolve().parents[2] / "instance" / "baseball_presets.sqlite3"


def bundle(presets, updated_at=None, source="factory"):
    return dict(presets=presets, revision=revision(presets), updated_at=updated_at, source=source,
                storage="Shared server saves survive deployment only when the database is on an attached persistent disk. Export a backup; BASEBALL_PRESET_DB sets the path, or it uses the folder containing QB_PRESET_DB.")


def read_presets():
    path = db_path()
    if path.exists():
        with sqlite3.connect(path, timeout=5) as connection:
            if connection.execute("SELECT 1 FROM sqlite_master WHERE name='baseball_presets' AND type='table'").fetchone():
                row = connection.execute("SELECT payload, updated_at FROM baseball_presets WHERE id=1").fetchone()
                if row:
                    return bundle(validate_presets(json.loads(row[0])), row[1], "saved")
    return bundle(factory_presets())


def page_presets():
    try:
        return read_presets()
    except (OSError, sqlite3.Error, ValueError, TypeError):
        return dict(bundle(factory_presets(), source="fallback"), revision=None, error="Saved baseball presets could not be read. Factory presets are shown; repair storage before saving.")


def write_presets(presets, expected):
    presets = validate_presets(presets)
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=5) as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("CREATE TABLE IF NOT EXISTS baseball_presets (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at TEXT NOT NULL)")
        row = connection.execute("SELECT payload FROM baseball_presets WHERE id=1").fetchone()
        current = validate_presets(json.loads(row[0])) if row else factory_presets()
        if expected != revision(current):
            raise Conflict("Another editor saved first. Export your draft, then reload saved presets.")
        stamp = datetime.now(timezone.utc).isoformat()
        connection.execute("INSERT INTO baseball_presets VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at", (json.dumps(presets), stamp))
    return bundle(presets, stamp, "saved")


api = Blueprint("baseball", __name__)


@api.get("/api/baseball-data/<role>")
def player_data(role):
    if role not in METRICS:
        return jsonify(error="Unknown player role"), 404
    return jsonify(load_dataset()[role])


@api.get("/api/baseball-presets")
def get_presets():
    result = page_presets()
    return jsonify(result), 503 if result.get("error") else 200


@api.after_request
def no_cache(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@api.post("/api/baseball-presets/validate")
def validate_route():
    try:
        return jsonify(presets=validate_presets(input_payload().get("presets")))
    except (ValueError, TypeError, UnicodeError) as exc:
        return jsonify(error=str(exc)), 400


@api.put("/api/baseball-presets")
def save_route():
    try:
        payload = input_payload()
        return jsonify(write_presets(payload.get("presets"), payload.get("revision")))
    except Conflict as exc:
        return jsonify(error=str(exc)), 409
    except (ValueError, TypeError, UnicodeError) as exc:
        return jsonify(error=str(exc)), 400
    except (OSError, sqlite3.Error):
        return jsonify(error="Could not save presets. Check server storage; your draft is still in the editor."), 503
