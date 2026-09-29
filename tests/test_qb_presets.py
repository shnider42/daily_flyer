from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from web import app
from daily_flyer.qb_explorer.presets import factory_presets, read_presets, validate_presets


class PresetTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="qb-presets-test-")
        self.path = Path(self.directory.name) / "presets.sqlite3"
        self.env = patch.dict("os.environ", {"QB_PRESET_DB": str(self.path)})
        self.env.start()
        self.client = app.test_client()

    def tearDown(self):
        self.env.stop()
        self.directory.cleanup()

    def save(self, presets, revision, client=None):
        return (client or self.client).put('/api/qb-presets', json=dict(presets=presets, revision=revision))

    def test_factory_is_valid_and_reads_do_not_create_storage(self):
        result = self.client.get('/api/qb-presets')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.headers['Cache-Control'], 'no-store')
        self.assertEqual(validate_presets(result.json['presets']), factory_presets())
        self.assertFalse(self.path.exists())

    def test_saved_values_are_shared_and_embedded_on_next_page(self):
        initial = self.client.get('/api/qb-presets').json
        values = deepcopy(initial['presets'])
        values[0]['film'].update(count=2, metric='rating', y2qual=False)
        values[0]['label'] = '<img src=x onerror=alert(1)>'
        result = self.save(values, initial['revision'])
        self.assertEqual(result.status_code, 200)
        self.assertNotEqual(result.json['revision'], initial['revision'])
        self.assertEqual(app.test_client().get('/api/qb-presets').json['presets'], values)
        html = self.client.get('/?theme=qb_year_two').get_data(as_text=True)
        payload = json.loads(re.search(r'id="qb-data">(.*?)</script>', html, re.S).group(1))
        self.assertEqual(payload['preset_config']['presets'], values)
        self.assertNotIn('<img src=x onerror=alert(1)>', html)
        self.assertEqual(read_presets()['presets'], values)

    def test_conflicting_edit_does_not_overwrite_saved_values(self):
        first = self.client.get('/api/qb-presets').json
        values = deepcopy(first['presets']);values[0]['label'] = 'Editor one'
        self.assertEqual(self.save(values, first['revision']).status_code, 200)
        other = deepcopy(first['presets']);other[0]['label'] = 'Editor two'
        self.assertEqual(self.save(other, first['revision']).status_code, 409)
        self.assertEqual(read_presets()['presets'][0]['label'], 'Editor one')

    def test_first_conflict_does_not_break_default_reads(self):
        self.assertEqual(self.save(factory_presets(), 'stale').status_code, 409)
        self.assertEqual(self.client.get('/api/qb-presets').status_code, 200)

    def test_simultaneous_writers_use_revision_check_inside_transaction(self):
        initial = self.client.get('/api/qb-presets').json
        def write(label):
            values = deepcopy(initial['presets']);values[0]['label'] = label
            return self.save(values, initial['revision'], app.test_client()).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(write, ['One', 'Two']))
        self.assertEqual(sorted(results), [200, 409])

    def test_validate_is_read_only_and_rejects_bad_shapes_and_values(self):
        for mutate in [
            lambda p: p.pop(),
            lambda p: p[0].update(unknown='script'),
            lambda p: p[0]['film'].update(metric='unknown'),
            lambda p: p[0]['film'].update(ids=['not-a-player']),
            lambda p: p[0]['film'].update(count=200),
            lambda p: p[0]['film'].update(opacity=True),
            lambda p: p[0]['film'].update(ymin='Infinity'),
            lambda p: p[0]['film'].update(range='custom', ymin='5', ymax='1'),
            lambda p: p[0]['research'].update(hof='true'),
            lambda p: p[0].update(note='x'*1201),
        ]:
            values = factory_presets();mutate(values)
            self.assertEqual(self.client.post('/api/qb-presets/validate', json={'presets':values}).status_code,400)
        self.assertEqual(self.client.post('/api/qb-presets/validate',json={'presets':factory_presets()}).status_code,200)
        self.assertFalse(self.path.exists())

    def test_public_api_still_requires_bounded_same_origin_json(self):
        initial = self.client.get('/api/qb-presets').json
        body = dict(presets=initial['presets'],revision=initial['revision'])
        self.assertEqual(self.client.put('/api/qb-presets',json=body,headers={'Origin':'https://unrelated.example'}).status_code,400)
        self.assertEqual(self.client.put('/api/qb-presets',data='{}',content_type='text/plain').status_code,400)
        self.assertEqual(self.client.put('/api/qb-presets',data='x'*65537,content_type='application/json').status_code,400)
        self.assertEqual(self.client.put('/api/qb-presets',data='{invalid',content_type='application/json').status_code,400)
        self.assertEqual(self.client.put('/api/qb-presets',json=body,headers={'Origin':'http://localhost'}).status_code,200)

    def test_unreadable_storage_keeps_site_available_without_silently_saving(self):
        self.path.write_bytes(b'not a sqlite database')
        self.assertEqual(self.client.get('/api/qb-presets').status_code,503)
        html=self.client.get('/?theme=qb_year_two')
        self.assertEqual(html.status_code,200)
        self.assertIn(b'Saved presets could not be read',html.data)
        self.assertEqual(self.save(factory_presets(),'anything').status_code,503)
        self.assertEqual(self.path.read_bytes(),b'not a sqlite database')


if __name__ == '__main__':
    unittest.main()
