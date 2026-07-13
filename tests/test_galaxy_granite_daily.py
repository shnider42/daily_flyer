from __future__ import annotations

import unittest

from web import app


class GalaxyGraniteDailyThemeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app.test_client()

    def test_galaxy_granite_daily_renders_simple_blog(self) -> None:
        response = self.client.get(
            "/?theme=galaxy_granite_daily&date=2026-07-13&seed=0"
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Galaxy Granite", response.data)
        self.assertIn(b"Countertop Ideas, Made Simple", response.data)
        self.assertIn(b"Quartz or Granite?", response.data)
        self.assertIn(b"Today\xe2\x80\x99s Article", response.data)
        self.assertIn(b"Related Topic", response.data)
        self.assertIn(b"Quote \xe2\x86\x92 Measure \xe2\x86\x92 Fabricate &amp; Install", response.data)
        self.assertIn(b"Get a Quote", response.data)
        self.assertIn(b"data-gg-day", response.data)
        self.assertIn(b"card--gg_feature", response.data)
        self.assertIn(b"gg-process-grid", response.data)

    def test_galaxy_granite_daily_accepts_hyphenated_name(self) -> None:
        response = self.client.get(
            "/?theme=galaxy-granite-daily&date=2026-07-13&seed=2"
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Countertop Edges", response.data)
        self.assertIn(b"Compare edge profiles", response.data)

    def test_seed_rotates_the_featured_post(self) -> None:
        first = self.client.get(
            "/?theme=galaxy_granite_daily&date=2026-07-13&seed=0"
        )
        second = self.client.get(
            "/?theme=galaxy_granite_daily&date=2026-07-13&seed=1"
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertIn(b"Quartz or Granite?", first.data)
        self.assertIn(b"Template Appointment", second.data)
        self.assertNotEqual(first.data, second.data)


if __name__ == "__main__":
    unittest.main()
