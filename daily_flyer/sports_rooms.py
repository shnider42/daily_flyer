"""Private hockey rooms backed by the shared JavaScript match authority.

The existing one-worker Flask deployment lazily starts one Node subprocess.
No browser is an authority, no additional public port or paid service is needed.
Rooms are transient and end when this process is redeployed or restarted.
"""
from __future__ import annotations

import atexit
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import threading
from urllib.parse import urlsplit

from flask import Blueprint, g, jsonify, request


class AuthorityUnavailable(RuntimeError):
    pass


class HockeyAuthority:
    def __init__(self, repo_root: Path, *, node_binary: str | None = None):
        self.repo_root = Path(repo_root).resolve()
        self.node_binary = node_binary
        self.process = None
        self.lock = threading.RLock()
        self.counter = 0
        self.owner_pid = os.getpid()
        atexit.register(self.close)

    def _start(self):
        if self.owner_pid != os.getpid():
            # Gunicorn may import before forking. Only the serving worker owns
            # its authority; never reuse inherited pipe handles after a fork.
            self.process = None
            self.owner_pid = os.getpid()
        if self.process is not None and self.process.poll() is None:
            return
        executable = self.node_binary or shutil.which("node")
        if not executable:
            raise AuthorityUnavailable("Online hockey is unavailable on this server. Solo still works.")
        worker = self.repo_root / "server" / "pocket-sports" / "worker.mjs"
        try:
            self.process = subprocess.Popen(
                [executable, str(worker)], cwd=self.repo_root,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1,
            )
        except OSError as exc:
            raise AuthorityUnavailable("The hockey authority could not start. Solo still works.") from exc

    def call(self, payload: dict):
        with self.lock:
            self.counter += 1
            message_id = self.counter
            try:
                wire = json.dumps({"id": message_id, "payload": payload},
                    separators=(",", ":"), ensure_ascii=False, allow_nan=False)
                if len(wire.encode("utf-8")) > 20000:
                    raise ValueError("Oversized room request")
            except (ValueError, RecursionError):
                return {"error": {"status": 400, "code": "INVALID_REQUEST", "message": "Invalid room request."}}
            self._start()
            try:
                self.process.stdin.write(wire + "\n")
                self.process.stdin.flush()
                with selectors.DefaultSelector() as selector:
                    selector.register(self.process.stdout, selectors.EVENT_READ)
                    if not selector.select(timeout=4):
                        raise TimeoutError("Hockey authority timed out")
                line = self.process.stdout.readline()
                if not line:
                    raise RuntimeError("Hockey authority exited")
                response = json.loads(line)
                if response.get("id") != message_id:
                    raise RuntimeError("Hockey authority response mismatch")
                return response
            except (OSError, ValueError, RuntimeError, TimeoutError) as exc:
                self.close()
                raise AuthorityUnavailable("The hockey room service restarted. Reconnect or create a new room; solo still works.") from exc

    def close(self):
        with self.lock:
            process, self.process = self.process, None
            if process is None or self.owner_pid != os.getpid():
                return
            try:
                if process.stdin:
                    process.stdin.close()
                process.wait(timeout=0.5)
            except (OSError, subprocess.TimeoutExpired):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=0.5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=0.5)
            finally:
                if process.stdout:
                    process.stdout.close()


def create_hockey_rooms_blueprint(repo_root: Path, *, authority=None) -> Blueprint:
    bp = Blueprint("hockey_rooms", __name__, url_prefix="/api/v1/hockey/rooms")
    bridge = authority or HockeyAuthority(repo_root)

    def perform(payload):
        try:
            result = bridge.call(payload)
        except AuthorityUnavailable as exc:
            return jsonify({"ok": False, "error": str(exc), "code": "AUTHORITY_UNAVAILABLE"}), 503
        if "error" in result:
            error = result["error"]
            return jsonify({"ok": False, "error": error["message"], "code": error.get("code")}), error.get("status", 400)
        return jsonify(result["result"])

    @bp.after_request
    def no_cache(response):
        response.headers["Cache-Control"] = "no-store"
        return response

    @bp.before_request
    def validate_request():
        if request.method == "GET":
            return None
        if request.content_length is not None and request.content_length > 16384:
            return jsonify({"ok": False, "error": "Room request is too large."}), 413
        if not request.is_json:
            return jsonify({"ok": False, "error": "Room requests must use JSON."}), 415
        origin = request.headers.get("Origin")
        if origin:
            try:
                source = urlsplit(origin)
                same_site = source.scheme in {"http", "https"} and source.netloc.lower() == request.host.lower()
            except ValueError:
                same_site = False
            if not same_site:
                return jsonify({"ok": False, "error": "Open this room from the Pocket Hockey site."}), 403
        # Bound chunked bodies too. Reject non-standard NaN/Infinity before they
        # can reach JSON-line RPC and interrupt the shared match authority.
        raw = request.stream.read(16385)
        if len(raw) > 16384:
            return jsonify({"ok": False, "error": "Room request is too large."}), 413

        def reject_constant(_value):
            raise ValueError("Non-finite JSON number")

        try:
            value = json.loads(raw, parse_constant=reject_constant)
            # The parser can turn a syntactically valid 1e999 into infinity;
            # unpaired surrogate escapes also cannot travel as UTF-8 RPC.
            json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        except (ValueError, RecursionError):
            return jsonify({"ok": False, "error": "Invalid room request."}), 400
        if not isinstance(value, dict):
            return jsonify({"ok": False, "error": "Invalid room request."}), 400
        g.hockey_room_payload = value
        return None

    def body():
        return getattr(g, "hockey_room_payload", None)

    @bp.get("/health")
    def health():
        return perform({"op": "health"})

    @bp.post("/create")
    def create():
        value = body()
        if value is None:
            return jsonify({"ok": False, "error": "Invalid room request."}), 400
        return perform({**value, "op": "create"})

    @bp.post("/join")
    def join():
        value = body()
        if value is None:
            return jsonify({"ok": False, "error": "Invalid room request."}), 400
        return perform({**value, "op": "join"})

    @bp.post("/<code>")
    def room(code):
        value = body()
        if value is None:
            return jsonify({"ok": False, "error": "Invalid room request."}), 400
        if value.get("op") not in {"poll", "configure", "ready", "start", "pause", "resume", "leave"}:
            return jsonify({"ok": False, "error": "Unknown room action."}), 400
        return perform({**value, "code": code.upper()})

    return bp
