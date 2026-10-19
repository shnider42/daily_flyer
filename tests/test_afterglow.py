"""Integration checks for the isolated Afterglow theme."""
import json
import unittest
from pathlib import Path
from datetime import date
from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from web import app


class AfterglowTests(unittest.TestCase):
    def test_dfe_pipeline_and_assets(self):
        page = build_daily_page('afterglow', '2026-10-19')
        html = build_html(page)
        self.assertEqual(page.metadata['theme_name'], 'afterglow')
        self.assertIn('id="ag-app"', html)
        self.assertIn('Your life in live music', html)
        self.assertNotIn('__CATALOG__', html)
        self.assertNotIn('<script src=', html)

    def test_flask_routes(self):
        with app.test_client() as client:
            self.assertEqual(client.get('/?theme=afterglow').status_code, 200)
            self.assertEqual(client.get('/?theme=afterglow&date=invalid').status_code, 400)
            self.assertEqual(client.get('/?theme=afterglow&seed=bad').status_code, 400)
            instrument = client.get('/?theme=instrument_journey')
            self.assertEqual(instrument.status_code, 200)
            self.assertNotIn(b'id="ag-app"', instrument.data)

    def test_source_catalog_integrity(self):
        data = json.loads(Path('daily_flyer/themes/afterglow_assets/catalog.json').read_text())
        artists = {a['id'] for a in data['artists']}
        self.assertEqual(len(artists), 9)
        self.assertEqual(len({e['id'] for e in data['events']}), len(data['events']))
        for event in data['events']:
            date.fromisoformat(event['date'])
            date.fromisoformat(event['checked'])
            self.assertTrue(set(event['artists']) <= artists)
            self.assertTrue(event['source'].startswith('https://'))
        sold = next(e for e in data['events'] if e['id']=='abgt700-2-20261029')
        self.assertEqual(sold['availability'], 'Sold out at review')


if __name__ == '__main__':
    unittest.main()
