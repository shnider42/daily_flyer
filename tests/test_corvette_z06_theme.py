"""Focused regression checks for the seventh recovery-branch Garage vehicle."""
import json
import re
import unittest

from daily_flyer.themes import garage_journey_v16 as previous
from daily_flyer.themes import garage_journey_v17 as garage
from daily_flyer.themes import corvette_c8_z06_2024 as workshop
from web import app


class CorvetteZ06Tests(unittest.TestCase):
    def test_catalog_preserves_existing_vehicles(self):
        page = garage.build_theme_page()
        payload = re.search(r'<script id="gj-data" type="application/json">(.*?)</script>', page.cards[0].body).group(1)
        vehicles = json.loads(payload)
        self.assertEqual(vehicles[:6], previous.VEHICLES)
        self.assertEqual(len({v['key'] for v in vehicles}), 7)
        self.assertFalse(vehicles[-1]['default_in_garage'])
        self.assertEqual(vehicles[-1]['workshop_url'], '/?theme=corvette_z06_workshop')
        self.assertIn('LT6', vehicles[-1]['powertrain'])
        self.assertEqual(len(previous.VEHICLES), 6)  # no shared-global mutation

    def test_recovery_behavior_is_preserved(self):
        old, new = previous.build_theme_page(), garage.build_theme_page()
        js = new.metadata['extra_js']
        self.assertTrue(new.metadata['extra_css'].startswith(old.metadata['extra_css']))
        self.assertEqual(js.count('MutationObserver'), old.metadata['extra_js'].count('MutationObserver'))
        for key in ('garage-journey-membership-v2', 'garage-journey-profiles-v1', 'garage-journey-onboarding-v1'):
            self.assertEqual(js.count(key), old.metadata['extra_js'].count(key))
        self.assertIn('class="gj-manage-photo-img"', js)
        self.assertIn("if(v.key==='corvette_c8_z06_2024')return 'Z06'", js)
        self.assertIn("v.key==='corvette_c8_z06_2024'?'Z06'", js)

    def test_workshop_templates_and_search(self):
        body = workshop.build_theme_page().cards[0].body
        self.assertEqual(len(workshop.SYSTEMS), 8)
        self.assertEqual(len(workshop.ENGINE_COMPONENTS), 7)
        for item in workshop.SYSTEMS:
            self.assertIn('id="e46-template-' + item['key'] + '"', body)
            self.assertIn('data-key="' + item['key'] + '"', body)
        for item in workshop.ENGINE_COMPONENTS:
            self.assertIn('id="e46-component-' + item['key'] + '"', body)
            self.assertIn('data-component="' + item['key'] + '"', body)
        for term in ('LT6', 'flat-plane crank', 'dry sump', 'DCT', 'eLSD', 'Mag Ride', 'PTM', 'overheating', 'misfire', 'oil pressure', 'brake vibration', 'PDR'):
            self.assertIn(term.lower(), body.lower())
        self.assertNotIn('NISSAN', body)
        self.assertIn('General diagnostic guidance', body)

    def test_routes_render_atomically(self):
        client = app.test_client()
        for route in ('garage', 'garage_journey', 'e46_owner_companion', 'garage_journey_v17', 'corvette_z06_workshop', 'corvette_c4_workshop', 'nissan_z_workshop'):
            with self.subTest(route=route):
                self.assertEqual(client.get('/?theme=' + route).status_code, 200)
        self.assertIn(b'corvette_c8_z06_2024', client.get('/?theme=garage').data)
        self.assertNotIn(b'corvette_c8_z06_2024', client.get('/?theme=garage_journey_v16').data)


if __name__ == '__main__':
    unittest.main()
