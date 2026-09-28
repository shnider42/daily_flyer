"""Local diagnostic import and regression evidence. Never run on a live database."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from .admin import ROOT, build_version


def import_snapshot(source, destination):
    if os.environ.get('RENDER'):
        raise ValueError('Diagnostic import is local-only. Download the snapshot to your computer first.')
    destination = Path(destination).resolve()
    live = os.environ.get('WW2_DB_PATH')
    if live and destination == Path(live).resolve():
        raise ValueError('Choose a new database, not WW2_DB_PATH.')
    source = Path(source)
    if source.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('Diagnostic snapshot is too large (64 MB maximum).')
    payload = json.loads(source.read_text())
    if not isinstance(payload, dict) or payload.get('format') != 'dsl-diagnostic-v1':
        raise ValueError('Expected a DSL diagnostic export.')
    state = payload.get('state')
    if not isinstance(state, dict) or not all(key in state for key in ('units', 'revision', 'round', 'turn', 'ready')):
        raise ValueError('Diagnostic export is missing game state.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents accidentally overwriting any existing game DB.
    with destination.open('x'):
        pass
    previous = os.environ.get('WW2_DB_PATH')
    os.environ['WW2_DB_PATH'] = str(destination)
    try:
        from ww2_web import create_app
        create_app(str(destination))
        code = secrets.token_hex(5).upper()
        owners = {side: hashlib.sha256(secrets.token_bytes(32)).hexdigest() for side in ('us', 'de')}
        tickets = {}
        with sqlite3.connect(destination) as db:
            db.execute('INSERT INTO match(code,host,guest,state) VALUES (?,?,?,?)',
                       (code, owners['us'], owners['de'] if state['ready'] else None, json.dumps(state)))
            db.execute('UPDATE lobby_names SET name=? WHERE code=?', ('LOCAL REPRO · '+code, code))
            for side in ('us', 'de'):
                if (side == 'de' and not state['ready']) or state.get('ai_side') == side:
                    continue
                raw = secrets.token_hex(16).upper()
                ticket = 'MOVE-'+'-'.join(raw[i:i+4] for i in range(0, len(raw), 4))
                digest = hashlib.sha256(ticket.replace('-', '').encode()).hexdigest()
                db.execute('INSERT INTO transfers VALUES (?,?,?,?)', (digest, code, owners[side], time.time()+900))
                tickets[side] = ticket
        return dict(code=code, db=str(destination), tickets=tickets, source_version=payload.get('version'))
    finally:
        if previous is None:
            os.environ.pop('WW2_DB_PATH', None)
        else:
            os.environ['WW2_DB_PATH'] = previous


def run_tests(report_path):
    version = build_version()
    started = time.time()
    # Importing ww2_web creates its module-level Flask app. Isolate even that
    # initialization from a configured production path during build-time tests.
    with tempfile.TemporaryDirectory(prefix='dsl-regressions-') as folder:
        with patch.dict(os.environ, WW2_DB_PATH=str(Path(folder) / 'bootstrap.sqlite3')):
            suite = unittest.defaultTestLoader.discover(str(ROOT / 'tests'), pattern='test_ww2*.py')
            result = unittest.TextTestRunner(verbosity=1).run(suite)
    report = dict(format='dsl-tests-v1', **version, finished_at=time.time(),
                  duration_seconds=round(time.time()-started, 2), tests_run=result.testsRun,
                  failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
                  success=result.wasSuccessful())
    path = Path(report_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.' + secrets.token_hex(4) + '.tmp')
    temp.write_text(json.dumps(report, indent=2)+'\n')
    temp.replace(path)
    print(f'Test report: {path.resolve()}')
    return 0 if result.wasSuccessful() else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    imp = sub.add_parser('import', help='Create a disposable local battle from an admin export')
    imp.add_argument('snapshot')
    imp.add_argument('--db', required=True, help='New database path; must not already exist')
    test = sub.add_parser('test', help='Run regressions and write test evidence for the console')
    test.add_argument('--report', default=os.environ.get('WW2_TEST_REPORT_PATH', 'instance/ww2-test-report.json'))
    args = parser.parse_args()
    if args.command == 'test':
        return run_tests(args.report)
    try:
        data = import_snapshot(args.snapshot, args.db)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(f"Created local match {data['code']} in {data['db']}")
    print('Run this copy (bind to localhost only):')
    import shlex
    print(f"WW2_DB_PATH={shlex.quote(data['db'])} python -m gunicorn ww2_web:app --bind 127.0.0.1:8000 --workers 1 --threads 4 --timeout 120")
    print('Open http://127.0.0.1:8000 and use Load code. These local codes expire in 15 minutes:')
    for side, code in data['tickets'].items():
        print(f'{side}: {code}')
    print('Use separate browser profiles for the two seats. Production credentials were not imported.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
