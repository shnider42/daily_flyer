"""Public QB preset configuration. No authentication; inputs are still constrained.

SQLite coordinates Gunicorn workers. Set QB_PRESET_DB to a file on an attached
persistent volume for durable saves; the default Render filesystem is temporary.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from functools import lru_cache
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import sqlite3
from urllib.parse import urlsplit

from flask import Blueprint, jsonify, request

from .data import load_dataset

IDS = ("slumps", "leaps", "rivals", "hall", "rings")
MAX_BYTES = 65536
METRICS = ("relative_anya", "anya", "rating", "cmp_pct", "ypg", "td_pct", "int_pct", "yards", "td", "int", "gs")
ERAS = ("all", "1970", "1980", "1990", "2000", "2010", "2020")
FILM = dict(search="", era="all", hof="all", team="all", sort="name", y2qual=False,
            metric="relative_anya", colors="team", window="5", view="year2",
            scale="linear", normalize="raw", layout="separate", range="fit", ymin="", ymax="",
            points="all", opacity=75, height="compact", ids=[], selection="fixed", count=4)
RESEARCH = dict(metric="relative_anya", outcome="hof", x="b", era="all", hof=True, field=True)


def factory_presets():
    labels = ("Biggest slumps", "Biggest leaps", "Brady vs. Manning", "Hall of Fame signal?", "Slumps & Super Bowls")
    titles = ("The biggest year-two slumps", "The biggest year-two leaps",
              "Brady vs. Manning: two very different year twos", "Does year two add a Hall of Fame signal?",
              "Did a year-two slump rule out a later ring?")
    presets = []
    for key, label, title in zip(IDS, labels, titles):
        p = dict(id=key, label=label, title=title, note="", mode="research" if key in ("hall", "rings") else "film",
                 film=deepcopy(FILM), research=deepcopy(RESEARCH))
        if key in ("slumps", "leaps"):
            p["film"].update(selection="declined" if key == "slumps" else "improved", y2qual=True, normalize="delta",
                             sort="declined" if key == "slumps" else "improved")
        if key == "rivals":
            p["film"].update(ids=["BradTo00", "MannPe00"], view="performance", window="10")
        if key == "rings":
            p["research"].update(outcome="sb", x="delta")
        presets.append(p)
    return presets


@lru_cache(maxsize=1)
def dataset_options():
    data = load_dataset()
    return {p["id"] for p in data["players"]}, {s["team"] for p in data["players"] for s in p["seasons"]} | {
        t["team"] for p in data["players"] for s in p["seasons"] for t in s["teams"]}


def validate_presets(value):
    """Canonical, bounded configuration only. No HTML, JS, paths or URLs execute."""
    if not isinstance(value, list) or len(value) != len(IDS):
        raise ValueError("Include exactly the five preset slots.")
    players, teams = dataset_options()

    def shape(obj, keys, name):
        if not isinstance(obj, dict) or set(obj) != set(keys):
            raise ValueError(f"{name}: missing or unknown fields.")

    def choice(obj, key, choices, name):
        if not isinstance(obj[key], str) or obj[key] not in choices:
            raise ValueError(f"{name}: invalid {key}.")

    def boolean(obj, key, name):
        if type(obj[key]) is not bool:
            raise ValueError(f"{name}: {key} must be true or false.")

    result = deepcopy(value)
    for i, p in enumerate(result):
        shape(p, ("id", "label", "title", "note", "mode", "film", "research"), f"Preset {i+1}")
        if p["id"] != IDS[i]:
            raise ValueError("Keep the five slot IDs in their original order.")
        name = IDS[i]
        for key, maximum in (("label", 48), ("title", 140), ("note", 1200)):
            if not isinstance(p[key], str) or len(p[key]) > maximum or (key != "note" and not p[key].strip()):
                raise ValueError(f"{name}: {key} must be text of at most {maximum} characters.")
            p[key] = p[key].strip()
        choice(p, "mode", ("film", "research"), name)
        f, r = p["film"], p["research"]
        shape(f, FILM, name + " film settings")
        shape(r, RESEARCH, name + " research settings")
        for key, options in dict(era=ERAS+("pre1970",), hof=("all", "yes", "no"), team=teams|{"all"},
                                 sort=("name", "improved", "declined", "newest", "oldest", "span"), metric=METRICS,
                                 colors=("team", "hof", "player"), window=("5", "10", "all"),
                                 view=("year2", "performance", "career"), scale=("linear", "density", "log", "symlog"),
                                 normalize=("raw", "delta", "zscore"), layout=("overlay", "separate"),
                                 range=("fit", "middle", "zero", "custom"), points=("auto", "all", "year2"),
                                 height=("compact", "normal", "tall"), selection=("fixed", "improved", "declined")).items():
            choice(f, key, options, name)
        boolean(f, "y2qual", name)
        if not isinstance(f["search"], str) or len(f["search"]) > 100:
            raise ValueError(f"{name}: search must be at most 100 characters.")
        for key, lo, hi in (("count", 1, 25), ("opacity", 15, 100)):
            if type(f[key]) is not int or not lo <= f[key] <= hi or (key == "opacity" and f[key] % 5):
                raise ValueError(f"{name}: invalid {key}.")
        if not isinstance(f["ids"], list) or len(f["ids"]) > len(players) or any(not isinstance(v, str) or v not in players for v in f["ids"]):
            raise ValueError(f"{name}: select only quarterbacks in this dataset.")
        f["ids"] = list(dict.fromkeys(f["ids"]))
        for key in ("ymin", "ymax"):
            raw = f[key]
            if raw == "":
                continue
            try:
                number = float(raw)
            except (ValueError, TypeError, OverflowError):
                raise ValueError(f"{name}: {key} must be a number or blank.") from None
            if isinstance(raw, bool) or not math.isfinite(number) or abs(number) > 1e9:
                raise ValueError(f"{name}: {key} is outside the allowed numeric range.")
            f[key] = str(number)
        if f["range"] == "custom" and ("" in (f["ymin"], f["ymax"]) or float(f["ymin"]) >= float(f["ymax"])):
            raise ValueError(f"{name}: custom bounds need a minimum smaller than the maximum.")
        for key, options in dict(metric=METRICS, outcome=("hof", "sb", "job", "efficiency"), x=("a", "b", "delta"), era=ERAS).items():
            choice(r, key, options, name)
        for key in ("hof", "field"):
            boolean(r, key, name)
    return result


def db_path():
    return Path(os.environ.get("QB_PRESET_DB") or Path(__file__).resolve().parents[2] / "instance" / "qb_presets.sqlite3")


def storage_info():
    configured = bool(os.environ.get("QB_PRESET_DB"))
    return dict(configured=configured, message=(
        "Shared server storage uses QB_PRESET_DB. It survives redeploys ONLY if that path is on an attached persistent disk."
        if configured else "Shared temporary server storage: changes can be lost on Render restarts or redeploys. Export a backup. For durable saves, attach a persistent disk and set QB_PRESET_DB to a file on it."))


def revision(presets):
    return sha256(json.dumps(presets, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def read_presets():
    defaults = factory_presets()
    bundle = dict(presets=defaults, revision=revision(defaults), updated_at=None, storage=storage_info(), source="factory")
    path = db_path()
    if path.exists():
        with sqlite3.connect(path, timeout=5) as connection:
            if not connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='qb_presets'").fetchone():
                return bundle
            row = connection.execute("SELECT payload, updated_at FROM qb_presets WHERE id=1").fetchone()
        if row:
            bundle.update(presets=validate_presets(json.loads(row[0])), updated_at=row[1], source="saved")
            bundle["revision"] = revision(bundle["presets"])
    return bundle


def page_presets():
    try:
        return read_presets()
    except (OSError, sqlite3.Error, ValueError, TypeError):
        return dict(presets=factory_presets(), revision=None, updated_at=None, source="fallback",
                    storage=storage_info(), error="Saved presets could not be read. Factory presets are shown; repair storage before saving.")


class Conflict(Exception):
    pass


def write_presets(presets, expected_revision):
    presets = validate_presets(presets)
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=5) as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("CREATE TABLE IF NOT EXISTS qb_presets (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at TEXT NOT NULL)")
        row = connection.execute("SELECT payload FROM qb_presets WHERE id=1").fetchone()
        current = validate_presets(json.loads(row[0])) if row else factory_presets()
        if expected_revision != revision(current):
            raise Conflict("Someone else saved presets since this editor loaded. Export your draft, then reload saved presets before trying again.")
        timestamp = datetime.now(timezone.utc).isoformat()
        connection.execute("INSERT INTO qb_presets VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at",
                           (json.dumps(presets), timestamp))
    return dict(presets=presets, revision=revision(presets), updated_at=timestamp, source="saved", storage=storage_info())


api = Blueprint("qb_presets", __name__)


@api.after_request
def no_cache(response):
    response.headers["Cache-Control"] = "no-store"
    return response


def input_payload():
    if request.mimetype != "application/json":
        raise ValueError("Send an application/json request.")
    origin = request.headers.get("Origin")
    if request.headers.get("Sec-Fetch-Site") == "cross-site" or (origin and urlsplit(origin).netloc != request.host):
        raise ValueError("Use the preset editor on this site, not a cross-site form.")
    raw = request.stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("Preset document is too large (64 KiB maximum).")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Expected a JSON object.")
    return payload


@api.get("/api/qb-presets")
def get_presets():
    result = page_presets()
    return jsonify(result), 503 if result.get("error") else 200


@api.post("/api/qb-presets/validate")
def validate_route():
    try:
        return jsonify(presets=validate_presets(input_payload().get("presets")))
    except (ValueError, TypeError, UnicodeError) as exc:
        return jsonify(error=str(exc)), 400


@api.put("/api/qb-presets")
def save_route():
    try:
        payload = input_payload()
        if not isinstance(payload.get("revision"), str):
            raise ValueError("Reload saved presets to obtain their current revision.")
        return jsonify(write_presets(payload.get("presets"), payload["revision"]))
    except Conflict as exc:
        return jsonify(error=str(exc)), 409
    except (ValueError, TypeError, UnicodeError) as exc:
        return jsonify(error=str(exc)), 400
    except (OSError, sqlite3.Error):
        return jsonify(error="Presets could not be saved. Check server storage permissions and retry; your draft is still in the editor."), 503
