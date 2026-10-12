"""Exercise the real Gunicorn lifecycle, including Render's preloaded master."""
import concurrent.futures
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request

from ww2_web import create_app

ROOT = Path(__file__).resolve().parents[1]


class ServerStartupTests(unittest.TestCase):
    def test_import_does_not_start_computer_in_preloading_process(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, '-c',
                "from ww2_web import app; "
                "assert app.config['WW2_BACKGROUND_AI']; "
                "assert app.extensions['ww2_computer_queue'].thread is None"],
                cwd=ROOT, env=dict(os.environ, WW2_BACKGROUND_AI='1',
                                  WW2_DB_PATH=directory + '/game.sqlite'),
                capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_worker_health_and_browser_independent_recovery_with_and_without_preload(self):
        for preload in (False, True):
            with self.subTest(preload=preload), tempfile.TemporaryDirectory() as directory:
                path = directory + '/game.sqlite'
                app = create_app(path, background_ai=True, start_worker=False)
                client = app.test_client()
                seat = client.post('/api/match', json=dict(opponent='computer', ruleset='dsl')).json
                url = '/api/match/' + seat['code']
                auth = {'Authorization': 'Bearer ' + seat['token'], 'X-WW2-Protocol': '2'}
                state = client.get(url, headers=auth).json
                self.assertEqual(client.post(url, headers=auth,
                    json=dict(kind='end', revision=state['revision'])).status_code, 200)
                with socket.socket() as sock:
                    sock.bind(('127.0.0.1', 0))
                    port = sock.getsockname()[1]
                base = f'http://127.0.0.1:{port}'
                args = [sys.executable, '-m', 'gunicorn', 'ww2_web:app', '--bind',
                        f'127.0.0.1:{port}', '--workers', '1', '--threads', '4', '--timeout', '15']
                if preload:
                    args.append('--preload')
                env = dict(os.environ, WW2_DB_PATH=path, WW2_BACKGROUND_AI='1', RENDER='true',
                           GUNICORN_CMD_ARGS='')
                with open(directory + '/server.log', 'w+') as log:
                    server = subprocess.Popen(args, cwd=ROOT, env=env, stdout=log, stderr=log)
                    try:
                        deadline = time.monotonic() + 10
                        while True:
                            try:
                                request = urllib.request.Request(base + '/', method='HEAD')
                                with urllib.request.urlopen(request, timeout=1) as response:
                                    self.assertEqual(response.status, 200)
                                break
                            except OSError:
                                if server.poll() is not None or time.monotonic() >= deadline:
                                    self.fail('Gunicorn failed to start')
                                time.sleep(.05)

                        def healthy(_):
                            with urllib.request.urlopen(base + '/healthz', timeout=3) as response:
                                return response.status
                        with concurrent.futures.ThreadPoolExecutor(8) as pool:
                            self.assertEqual(list(pool.map(healthy, range(24))), [200] * 24)

                        # No browser or HTTP progression calls: read the saved checkpoint only.
                        deadline = time.monotonic() + 10
                        while True:
                            with sqlite3.connect(path) as db:
                                live = json.loads(db.execute('SELECT state FROM match WHERE code=?',
                                                             (seat['code'],)).fetchone()[0])
                            if live['turn'] == 'us' and live['round'] == 2:
                                break
                            self.assertLess(time.monotonic(), deadline, 'AI recovery stalled')
                            time.sleep(.03)
                        self.assertEqual(healthy(0), 200)
                    finally:
                        server.terminate()
                        try:
                            server.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            server.kill()
                            server.wait()
                        log.seek(0)
                        output = log.read()
                    started = re.findall(r'DSL computer queue started in worker pid (\d+)', output)
                    booted = re.findall(r'Booting worker with pid: (\d+)', output)
                    self.assertEqual(started, booted, output)
                    self.assertEqual(len(started), 1, output)
                    self.assertNotEqual(int(started[0]), server.pid, output)
                    self.assertIn('DSL startup complete:', output)
                    self.assertEqual(server.returncode, 0, output)
