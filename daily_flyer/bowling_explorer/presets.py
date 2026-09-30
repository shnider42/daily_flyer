"""Public bowling presets, with isolated transactional storage and recovery."""
from copy import deepcopy
from datetime import datetime, timezone
import json
import sqlite3
from flask import Blueprint, jsonify
from .data import load_dataset, METRICS
from daily_flyer.qb_explorer.presets import Conflict, input_payload, revision
from daily_flyer.preset_storage import preset_db, storage_info

IDS = ("rivals", "slumps", "leaps", "cashes", "future")
DEFAULTS = dict(metric="average", threshold="10", view="career", layout="overlay", height="normal", timeline="calendar",
                mode="compare", normalize="raw", hand="all", search="", qual2=False, skip2020=False,
                selection="fixed", count=4, ids=["jason-belmonte", "ej-tackett", "anthony-simonsen"],
                predictor="delta", outcome="average")
CHOICES = dict(metric=tuple(METRICS), threshold=("5", "10", "15"), view=("pair", "career"),
               layout=("separate", "overlay"), height=("compact", "normal", "tall"), mode=("compare", "research"),
               normalize=("raw", "delta"), hand=("all", "R", "L"), selection=("fixed", "improved", "declined"),
               predictor=("a", "b", "delta"), outcome=("average", "cash_rate", "earnings_per_event"), timeline=("calendar", "career"))


def factory_presets():
    specs = [
        ("Belmonte · Tackett · Simonsen", "Scoring average over time — one graph, three bowlers", {}),
        ("After the drop", "What followed the largest year-two average drops?", dict(selection="declined", qual2=True)),
        ("The second-year leap", "What followed the largest year-two average gains?", dict(selection="improved", qual2=True)),
        ("Getting paid consistently", "How often did these bowlers cash?", dict(metric="cash_rate", ids=["kyle-troup", "bill-oneill", "jesper-svensson"])),
        ("Did the change last?", "Does a year-two change travel into years three to five?", dict(mode="research")),
    ]
    return [dict(id=key, label=label, title=title, note="", settings=dict(deepcopy(DEFAULTS), **settings))
            for key, (label, title, settings) in zip(IDS, specs)]


def legacy_factory_presets():
    """Exact v3.3.0 defaults; upgrade only untouched slots, never custom edits."""
    old = factory_presets()
    old[0]["title"] = "Three careers, three different starts"
    for p in old:
        p["settings"].pop("timeline")
        p["settings"]["layout"] = "separate"
    return old


def validate_presets(value):
    if not isinstance(value, list) or len(value) != len(IDS):
        raise ValueError("Include all five bowling preset slots.")
    result = deepcopy(value)
    players = {p["id"] for p in load_dataset()["players"]}
    old, current = legacy_factory_presets(), factory_presets()
    for i, p in enumerate(result):
        if p == old[i]:
            p = result[i] = deepcopy(current[i])
        if not isinstance(p, dict) or set(p) != {"id", "label", "title", "note", "settings"} or p["id"] != IDS[i]:
            raise ValueError("Keep the five bowling slot IDs and fields intact.")
        for key, limit in (("label", 48), ("title", 140), ("note", 1200)):
            if not isinstance(p[key], str) or len(p[key]) > limit or (key != "note" and not p[key].strip()):
                raise ValueError(f"{key} must be text, at most {limit} characters.")
            p[key] = p[key].strip()
        s = p["settings"]
        if isinstance(s, dict):
            # Existing custom graphs keep their prior time alignment.
            s.setdefault("timeline", "career")
        if not isinstance(s, dict) or set(s) != set(DEFAULTS):
            raise ValueError("Missing or unknown bowling view settings.")
        for key, choices in CHOICES.items():
            if not isinstance(s[key], str) or s[key] not in choices:
                raise ValueError(f"Invalid {key}.")
        if not isinstance(s["search"], str) or len(s["search"]) > 100:
            raise ValueError("Search must be text of at most 100 characters.")
        if any(type(s[k]) is not bool for k in ("qual2", "skip2020")):
            raise ValueError("Filters must be true or false.")
        if type(s["count"]) is not int or not 1 <= s["count"] <= len(players):
            raise ValueError(f"Ranking count must be between 1 and {len(players)}.")
        if not isinstance(s["ids"], list) or len(s["ids"]) > len(players) or any(not isinstance(v, str) or v not in players for v in s["ids"]):
            raise ValueError("Choose bowlers from this dataset.")
        s["ids"] = list(dict.fromkeys(s["ids"]))
    return result


def bundle(presets, updated_at=None, source="factory"):
    return dict(presets=presets, revision=revision(presets), updated_at=updated_at, source=source,
                storage=storage_info("bowling")["message"])


def read_presets():
    path = preset_db("bowling")
    if path.exists():
        with sqlite3.connect(path, timeout=5) as connection:
            if connection.execute("SELECT 1 FROM sqlite_master WHERE name='bowling_presets' AND type='table'").fetchone():
                row = connection.execute("SELECT payload, updated_at FROM bowling_presets WHERE id=1").fetchone()
                if row:
                    return bundle(validate_presets(json.loads(row[0])), row[1], "saved")
    return bundle(factory_presets())


def page_presets():
    try:
        return read_presets()
    except (OSError, sqlite3.Error, ValueError, TypeError):
        return dict(bundle(factory_presets(), source="fallback"), revision=None,
                    error="Saved bowling presets could not be read. Repair storage before saving; factory stories are shown.")


def write_presets(presets, expected):
    presets = validate_presets(presets)
    path = preset_db("bowling")
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=5) as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("CREATE TABLE IF NOT EXISTS bowling_presets (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at TEXT NOT NULL)")
        row = connection.execute("SELECT payload FROM bowling_presets WHERE id=1").fetchone()
        current = validate_presets(json.loads(row[0])) if row else factory_presets()
        if expected != revision(current):
            raise Conflict("Another editor saved first. Export your draft, then reload saved presets.")
        stamp = datetime.now(timezone.utc).isoformat()
        connection.execute("INSERT INTO bowling_presets VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at", (json.dumps(presets), stamp))
    return bundle(presets, stamp, "saved")


api = Blueprint("bowling", __name__)


@api.after_request
def no_cache(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@api.get("/api/bowling-presets")
def get_presets():
    result = page_presets()
    return jsonify(result), 503 if result.get("error") else 200


@api.post("/api/bowling-presets/validate")
def validate_route():
    try:
        return jsonify(presets=validate_presets(input_payload().get("presets")))
    except (ValueError, TypeError, UnicodeError) as exc:
        return jsonify(error=str(exc)), 400


@api.put("/api/bowling-presets")
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
