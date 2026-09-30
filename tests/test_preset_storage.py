import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from daily_flyer.preset_storage import preset_db
from daily_flyer.baseball_explorer.presets import factory_presets, validate_presets, read_presets, write_presets


class StorageTests(unittest.TestCase):
    def test_path_priority_and_real_mount_detection(self):
        with patch.dict(os.environ, {}, clear=True), patch('os.path.ismount', return_value=False):
            self.assertEqual(preset_db('qb').parent.name, 'instance')
            with patch('os.path.ismount', side_effect=lambda p: str(p) == '/var/data'):
                self.assertEqual(preset_db('baseball'), Path('/var/data/baseball_presets.sqlite3'))
            with patch.dict(os.environ, {'YEAR_TWO_DATA_DIR': '/attached'}):
                self.assertEqual(preset_db('qb'), Path('/attached/qb_presets.sqlite3'))
                with patch.dict(os.environ, {'QB_PRESET_DB': '/old/qb.sqlite3'}):
                    self.assertEqual(preset_db('baseball'), Path('/old/baseball_presets.sqlite3'))
                    with patch.dict(os.environ, {'BASEBALL_PRESET_DB': '/specific/bb.sqlite3'}):
                        self.assertEqual(preset_db('baseball'), Path('/specific/bb.sqlite3'))

    def test_old_presets_keep_edits_and_gain_height(self):
        presets = factory_presets()
        for p in presets:
            del p['settings']['height']
        presets[2]['label'] = 'My saved Boston story'
        presets[2]['settings']['window'] = '5'
        migrated = validate_presets(presets)
        self.assertEqual(migrated[2]['label'], 'My saved Boston story')
        self.assertEqual(migrated[2]['settings']['window'], '5')
        self.assertEqual(migrated[2]['settings']['height'], 'normal')

    def test_shared_directory_keeps_values_between_reads(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'YEAR_TWO_DATA_DIR': folder}, clear=True):
            first = read_presets()
            self.assertFalse(preset_db('baseball').exists())
            first['presets'][2]['settings']['height'] = 'tall'
            write_presets(first['presets'], first['revision'])
            self.assertEqual(read_presets()['presets'][2]['settings']['height'], 'tall')


if __name__ == '__main__':
    unittest.main()
