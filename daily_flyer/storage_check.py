"""Conservative startup recovery: snapshot first, rebuild indexes only."""
import os
import sqlite3
import time


def _quote(name):
    return '"' + name.replace('"', '""') + '"'


def _rebuild_from_readable_tables(snapshot, target):
    """Copy every row without using damaged indexes; refuse any unreadable data."""
    source = sqlite3.connect(snapshot)
    out = sqlite3.connect(target)
    os.chmod(target, 0o600)
    try:
        schema = source.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").fetchall()
        tables = [(name, sql) for kind, name, sql in schema if kind == 'table']
        for name, sql in tables:
            if 'VIRTUAL TABLE' in sql.upper() or 'WITHOUT ROWID' in sql.upper():
                raise sqlite3.DatabaseError('Manual recovery required for special tables.')
            out.execute(sql)
            table = _quote(name)
            rows = source.execute(f'SELECT rowid,* FROM {table} NOT INDEXED ORDER BY rowid')
            columns = ','.join(_quote(c[0]) for c in rows.description)
            placeholders = ','.join('?' for _ in rows.description)
            out.executemany(f'INSERT INTO {table} ({columns}) VALUES ({placeholders})', rows)
        for kind, name, sql in schema:
            if kind != 'table':
                out.execute(sql)
        if source.execute("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").fetchone():
            out.execute('DELETE FROM sqlite_sequence')
            out.executemany('INSERT INTO sqlite_sequence VALUES(?,?)', source.execute('SELECT name,seq FROM sqlite_sequence NOT INDEXED'))
        for pragma in ('user_version', 'application_id'):
            out.execute(f'PRAGMA {pragma}={int(source.execute("PRAGMA " + pragma).fetchone()[0])}')
        out.commit()
        if out.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise sqlite3.DatabaseError('Rebuilt database failed verification.')
        for name, sql in tables:
            query = f'SELECT rowid,* FROM {_quote(name)} NOT INDEXED ORDER BY rowid'
            before, after = source.execute(query), out.execute(query)
            while True:
                a, b = before.fetchmany(256), after.fetchmany(256)
                if a != b:
                    raise sqlite3.DatabaseError('Recovered rows differ; original database preserved.')
                if not a:
                    break
    finally:
        source.close()
        out.close()


def check_storage(path):
    if not path.exists():
        return
    db = sqlite3.connect(path, timeout=15, isolation_level=None)
    try:
        try:
            healthy = db.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
        except sqlite3.DatabaseError:
            healthy = False
        if healthy:
            return
        backup_path = path.with_name(path.name + f'.before-reindex-{time.time_ns()}.db')
        fd = os.open(backup_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
        backup = sqlite3.connect(backup_path)
        deadline = time.monotonic() + 20
        def progress(status, remaining, total):
            if time.monotonic() > deadline:
                raise TimeoutError('Database backup timed out; no repair attempted.')
        try:
            db.backup(backup, pages=256, progress=progress, sleep=0.05)
        finally:
            backup.close()
        print('[loudsource] Database snapshot saved; checking index recovery.', flush=True)
        db.execute('BEGIN IMMEDIATE')
        try:
            db.execute('REINDEX')
            if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                raise sqlite3.DatabaseError('Database needs manual recovery; original data preserved.')
            db.commit()
        except sqlite3.DatabaseError:
            db.rollback()
            # A physically damaged index page can prevent REINDEX itself. Build
            # a separate database only if every table row can be read and verified.
            rebuilt = path.with_name(path.name + f'.recovered-{time.time_ns()}.db')
            _rebuild_from_readable_tables(backup_path, rebuilt)
            db.close()
            archive = path.with_name(path.name + f'.original-{time.time_ns()}')
            moved = []
            try:
                for suffix in ('', '-wal', '-shm'):
                    old, saved = type(path)(str(path) + suffix), type(path)(str(archive) + suffix)
                    if old.exists():
                        os.replace(old, saved)
                        moved.append((old, saved))
                os.replace(rebuilt, path)
            except Exception:
                for old, saved in reversed(moved):
                    os.replace(saved, old)
                raise
        print('[loudsource] Database indexes rebuilt; integrity check passed. All table rows preserved.', flush=True)
    finally:
        db.close()
