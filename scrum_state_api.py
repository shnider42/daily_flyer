from __future__ import annotations

import json
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)

DATA_PATH = Path("data/scrum_daily.json")
DEFAULT_STATE = {
    "activeSprint": "Sprint 1",
    "stories": [],
}


def load_state() -> dict:
    if not DATA_PATH.exists():
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(DEFAULT_STATE, indent=2), encoding="utf-8")
        return DEFAULT_STATE.copy()

    try:
        return json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return DEFAULT_STATE.copy()


def save_state(payload: dict) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


@app.get("/api/scrum-daily/state")
def get_scrum_state():
    return jsonify(load_state())


@app.post("/api/scrum-daily/state")
def save_scrum_state():
    payload = request.get_json(force=True, silent=False)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Expected a JSON object"}), 400

    save_state(payload)
    return jsonify({"ok": True})


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
