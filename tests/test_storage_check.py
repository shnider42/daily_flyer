import sqlite3
import tempfile
import unittest
from pathlib import Path
from daily_flyer.storage_check import check_storage


class StorageCheckTests(unittest.TestCase):
    def test_corrupt_index_rebuilt_without_losing_rows(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'party.db'
            db = sqlite3.connect(path)
            db.execute('CREATE TABLE votes (room TEXT, track TEXT, PRIMARY KEY(room,track))')
            db.executemany('INSERT INTO votes VALUES(?,?)', [('main',str(i)) for i in range(20)])
            db.commit()
            root = db.execute("SELECT rootpage FROM sqlite_master WHERE type='index'").fetchone()[0]
            size = db.execute('PRAGMA page_size').fetchone()[0]
            db.close()
            # Corrupt only the index's page header; table records remain readable.
            with path.open('r+b') as f:
                f.seek((root-1)*size)
                f.write(b'\x00')
            check_storage(path)
            db=sqlite3.connect(path)
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchall(), [('ok',)])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM votes').fetchone()[0],20)
            db.close()
            backups=list(Path(folder).glob('*.before-reindex-*.db'))
            self.assertEqual(len(backups),1)
            self.assertEqual(backups[0].stat().st_mode & 0o777,0o600)
            check_storage(path)
            self.assertEqual(len(list(Path(folder).glob('*.before-reindex-*.db'))),1)

    def test_table_damage_is_not_silently_discarded(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'party.db'
            db=sqlite3.connect(path)
            db.execute('CREATE TABLE notes (body TEXT)')
            db.execute("INSERT INTO notes VALUES('preserve me')")
            db.commit()
            root=db.execute("SELECT rootpage FROM sqlite_master WHERE name='notes'").fetchone()[0]
            size=db.execute('PRAGMA page_size').fetchone()[0]
            db.close()
            with path.open('r+b') as f:
                f.seek((root-1)*size);f.write(b'\x00')
            original=path.read_bytes()
            with self.assertRaises(sqlite3.DatabaseError):check_storage(path)
            self.assertEqual(path.read_bytes(),original)
            self.assertEqual(len(list(Path(folder).glob('*.before-reindex-*.db'))),1)
