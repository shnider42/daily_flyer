from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request

app = Flask(__name__)

DATA_PATH = Path("data/scrum_daily.json")
VALID_STATUSES = {"backlog", "in_progress", "done"}
VALID_PRIORITIES = {"P0", "P1", "P2"}
DEFAULT_EPICS = [
    {"key": "positioning", "label": "Positioning"},
    {"key": "sre_lab", "label": "SRE Lab"},
    {"key": "observability", "label": "Observability"},
    {"key": "applications", "label": "Applications"},
    {"key": "interview_prep", "label": "Interview Prep"},
    {"key": "board_improvements", "label": "Board Improvements"},
]
DEFAULT_STATE = {
    "activeSprint": "SRE Sprint 1 — Positioning + Lab Foundation",
    "wipLimit": 3,
    "epics": DEFAULT_EPICS,
    "stories": [],
}


def _slug(value: Any) -> str:
    raw = str(value or "general").strip().lower()
    slug = "".join(char if char.isalnum() else "_" for char in raw)
    while "__" in slug:
        slug = slug.replace("__", "_")
    return slug.strip("_") or "general"


def _label_from_key(key: str) -> str:
    return " ".join(part.capitalize() for part in key.replace("-", "_").split("_") if part) or "General"


def normalize_epic(epic: Any) -> dict[str, str]:
    if isinstance(epic, str):
        key = _slug(epic)
        return {"key": key, "label": _label_from_key(key)}

    if not isinstance(epic, dict):
        return {"key": "general", "label": "General"}

    key = _slug(epic.get("key") or epic.get("label") or "general")
    label = str(epic.get("label") or _label_from_key(key)).strip() or _label_from_key(key)
    return {"key": key, "label": label}


def normalize_story(story: Any) -> dict[str, str]:
    source = story if isinstance(story, dict) else {}
    status = str(source.get("status") or "backlog")
    priority = str(source.get("priority") or "P2").upper()

    return {
        "id": str(source.get("id") or ""),
        "title": str(source.get("title") or "Untitled story"),
        "epic": _slug(source.get("epic") or "general"),
        "status": status if status in VALID_STATUSES else "backlog",
        "priority": priority if priority in VALID_PRIORITIES else "P2",
        "due": str(source.get("due") or ""),
        "acceptanceCriteria": str(
            source.get("acceptanceCriteria") or source.get("acceptance") or ""
        ),
        "notes": str(source.get("notes") or ""),
    }


def normalize_state(payload: Any) -> dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}
    raw_stories = source.get("stories") if isinstance(source.get("stories"), list) else []
    stories = [normalize_story(story) for story in raw_stories]

    configured_epics = source.get("epics") if isinstance(source.get("epics"), list) else DEFAULT_EPICS
    epics_by_key = {epic["key"]: epic for epic in (normalize_epic(epic) for epic in configured_epics)}
    for story in stories:
        epics_by_key.setdefault(story["epic"], {"key": story["epic"], "label": _label_from_key(story["epic"])})

    try:
        wip_limit = max(1, int(source.get("wipLimit", DEFAULT_STATE["wipLimit"])))
    except (TypeError, ValueError):
        wip_limit = DEFAULT_STATE["wipLimit"]

    return {
        "activeSprint": str(source.get("activeSprint") or DEFAULT_STATE["activeSprint"]),
        "wipLimit": wip_limit,
        "epics": list(epics_by_key.values()),
        "stories": stories,
    }


def load_state() -> dict[str, Any]:
    if not DATA_PATH.exists():
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(DEFAULT_STATE, indent=2), encoding="utf-8")
        return DEFAULT_STATE.copy()

    try:
        return normalize_state(json.loads(DATA_PATH.read_text(encoding="utf-8")))
    except json.JSONDecodeError:
        return DEFAULT_STATE.copy()


def save_state(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_state(payload)
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = DATA_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(normalized, indent=2), encoding="utf-8")
    tmp_path.replace(DATA_PATH)
    return normalized


@app.get("/api/scrum-daily/state")
def get_scrum_state():
    return jsonify(load_state())


@app.post("/api/scrum-daily/state")
def save_scrum_state():
    payload = request.get_json(force=True, silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Expected a JSON object"}), 400

    normalized = save_state(payload)
    return jsonify({"ok": True, "state": normalized})


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
