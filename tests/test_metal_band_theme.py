"""Integration boundaries for the isolated metal-band theme."""
import unittest
from unittest.mock import patch

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from web import app, _normalize_theme_name


class MetalBandThemeTests(unittest.TestCase):
    def test_custom_theme_builds_without_provider_requests(self):
        with patch("requests.sessions.Session.request", side_effect=AssertionError("Unexpected network request")):
            context = build_daily_page("metal_band", date_str="2026-09-30")
            html = build_html(context)
        self.assertEqual(context.metadata["theme_name"], "metal_band")
        self.assertIn('id="mb-app"', html)
        self.assertIn('id="mb-song-form"', html)
        self.assertIn("dfe.metal_band.workspace.v1", html)
        self.assertNotIn("MutationObserver", html)
        self.assertNotIn('<script src=', html)
        self.assertIn('sandbox="allow-popups allow-popups-to-escape-sandbox"', html)

    def test_routes_and_invalid_dates(self):
        client = app.test_client()
        for theme in ("metal_band", "metal-band"):
            response = client.get(f"/?theme={theme}&date=2026-09-30")
            self.assertEqual(response.status_code, 200)
            self.assertIn(b"First Riff", response.data)
        self.assertEqual(client.get("/?theme=metal_band&date=invalid").status_code, 400)

    def test_garage_route_and_javascript_remain_independent(self):
        self.assertEqual(_normalize_theme_name("garage"), "garage_journey_v17")
        html = app.test_client().get("/?theme=garage").get_data(as_text=True)
        self.assertIn("Garage Journey", html)
        self.assertNotIn('id="mb-app"', html)
        self.assertNotIn("dfe.metal_band.workspace.v1", html)


if __name__ == "__main__":
    unittest.main()
