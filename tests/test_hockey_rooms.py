import shutil
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from flask import Flask

from daily_flyer.sports_rooms import AuthorityUnavailable, HockeyAuthority, create_hockey_rooms_blueprint


ROOT = Path(__file__).resolve().parents[1]
PREFIX = "/api/v1/hockey/rooms"


class FakeAuthority:
    def __init__(self):
        self.calls = []
        self.response = {"result": {"ok": True}}

    def call(self, payload):
        self.calls.append(payload)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class HockeyRoomRoutes(unittest.TestCase):
    def setUp(self):
        self.authority = FakeAuthority()
        app = Flask(__name__)
        app.register_blueprint(create_hockey_rooms_blueprint(ROOT, authority=self.authority))
        self.client = app.test_client()

    def test_health_and_tokens_are_not_cached(self):
        response = self.client.get(PREFIX + "/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        response = self.client.post(PREFIX + "/abc123", json={"op": "poll", "token": "private", "seq": 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(self.authority.calls[-1], {"op": "poll", "token": "private", "seq": 0, "code": "ABC123"})

    def test_invalid_and_oversized_payloads_do_not_reach_authority(self):
        self.assertEqual(self.client.post(PREFIX + "/create", data="not json").status_code, 415)
        self.assertEqual(self.client.post(PREFIX + "/create", json=[]).status_code, 400)
        self.assertEqual(self.client.post(PREFIX + "/create", data="{", content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(PREFIX + "/create", data='{"duration":NaN}', content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(PREFIX + "/create", data='{"x":Infinity}', content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(PREFIX + "/create", data='{"x":1e999}', content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(PREFIX + "/create", data='{"name":"\\ud800"}', content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(PREFIX + "/create", json={"name": "x" * 16385}).status_code, 413)
        self.assertEqual(self.client.post(PREFIX + "/abc123", json={"op": "create"}).status_code, 400)
        self.assertEqual(self.authority.calls, [])

    def test_foreign_origin_is_rejected_and_same_origin_is_accepted(self):
        self.assertEqual(self.client.post(PREFIX + "/join", json={}, headers={"Origin": "https://elsewhere.example"}).status_code, 403)
        self.assertEqual(self.client.post(PREFIX + "/join", json={}, headers={"Origin": "null"}).status_code, 403)
        self.assertEqual(self.client.post(PREFIX + "/join", json={}, headers={"Origin": "http://[broken"}).status_code, 403)
        self.assertEqual(self.client.post(PREFIX + "/join", json={}, headers={"Origin": "http://localhost"}).status_code, 200)
        self.assertEqual(len(self.authority.calls), 1)

    def test_route_operation_and_room_code_cannot_be_overridden(self):
        self.client.post(PREFIX + "/create", json={"op": "leave"})
        self.assertEqual(self.authority.calls[-1]["op"], "create")
        self.client.post(PREFIX + "/join", json={"op": "start", "code": "ABC123"})
        self.assertEqual(self.authority.calls[-1]["op"], "join")
        self.client.post(PREFIX + "/abc123", json={"op": "poll", "code": "OTHER"})
        self.assertEqual(self.authority.calls[-1]["code"], "ABC123")

    def test_authority_errors_keep_their_status_and_unavailable_is_explicit(self):
        self.authority.response = {"error": {"status": 403, "code": "INVALID_TOKEN", "message": "Invalid reconnect pass."}}
        response = self.client.post(PREFIX + "/abc123", json={"op": "poll"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json["code"], "INVALID_TOKEN")
        self.authority.response = AuthorityUnavailable("Authority is unavailable.")
        response = self.client.get(PREFIX + "/health")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json["code"], "AUTHORITY_UNAVAILABLE")


@unittest.skipUnless(shutil.which("node"), "Node is required for the match authority")
class HockeyAuthorityIntegration(unittest.TestCase):
    def test_real_worker_runs_shared_match_and_closes_with_the_bridge(self):
        bridge = HockeyAuthority(ROOT)
        try:
            health = bridge.call({"op": "health"})["result"]
            self.assertEqual(health["authority"], "server")
            self.assertEqual(health["maxPlayers"], 4)
            live_process = bridge.process
            self.assertEqual(bridge.call({"op": "create", "name": "\ud800"})["error"]["status"], 400)
            self.assertEqual(bridge.call({"op": "create", "duration": float("inf")})["error"]["status"], 400)
            self.assertEqual(bridge.call({"op": "create", "name": "x" * 20000})["error"]["status"], 400)
            self.assertIs(bridge.process, live_process)
            self.assertEqual(bridge.call({"op": "health"})["result"]["authority"], "server")
            # A valid bounded UTF-8 request must not expand into an oversized
            # ASCII-escaped RPC message and restart everybody's rooms.
            host = bridge.call({"op": "create", "homeTeamId": "bos", "awayTeamId": "mtl", "name": "雪" * 4000})["result"]
            self.assertEqual(host["room"]["players"][0]["name"], "雪" * 24)
            code = host["room"]["code"]
            guest = bridge.call({"op": "join", "code": code})["result"]
            teammates = [bridge.call({"op": "join", "code": code})["result"] for _ in range(2)]
            seats = [host, guest, *teammates]
            for seat in seats:
                bridge.call({"op": "ready", "code": code, "token": seat["token"]})
            started = bridge.call({"op": "start", "code": code, "token": host["token"]})["result"]
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = [pool.submit(bridge.call, {"op": "poll", "code": code, "token": seat["token"], "seq": 0, "input": {"x": 1}}) for seat in seats]
                replies = [future.result()["result"] for future in futures]
            self.assertEqual([reply["seatId"] for reply in replies], [seat["seatId"] for seat in seats])
            polled = replies[1]
            self.assertEqual(started["matchId"], polled["matchId"])
            self.assertEqual(polled["room"]["status"], "playing")
            self.assertEqual(len(polled["state"]["controllers"]), 4)
            self.assertEqual(polled["state"]["score"], [0, 0])
            self.assertNotIn("token", polled)
            process = bridge.process
        finally:
            bridge.close()
        self.assertIsNotNone(process.poll())
        self.assertIsNone(bridge.process)


if __name__ == "__main__":
    unittest.main()
