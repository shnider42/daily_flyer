"""Focused integration checks for the independently selectable Passages theme."""
import json
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup

from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.themes import your_passage
from web import app


class YourPassageTests(unittest.TestCase):
    def render(self, date="2026-10-16", seed=None):
        return build_html(build_daily_page("your_passage", date_str=date, seed=seed))

    def payload(self, html):
        return json.loads(BeautifulSoup(html, "html.parser").find(id="yp-data").string)

    def test_flask_accepts_both_spellings_and_validates_inputs(self):
        client = app.test_client()
        for name in ["your_passage", "your-passage"]:
            response = client.get(f"/?theme={name}&date=2026-10-16")
            self.assertEqual(response.status_code, 200)
            self.assertIn(b"New Passage", response.data)
        for query in ["date=not-a-date", "seed=not-a-number"]:
            self.assertEqual(client.get("/?theme=your-passage&" + query).status_code, 400)

    def test_date_rotation_and_seed_are_reproducible(self):
        self.assertEqual(self.render(), self.render())
        choices = {self.payload(self.render(f"2026-10-{day}"))["selected"] for day in range(16, 20)}
        self.assertEqual(len(choices), 4)
        self.assertEqual(self.payload(self.render(seed=2))["selected"],
                         self.payload(self.render(date="2026-11-05", seed=2))["selected"])

    def test_export_is_self_contained_and_links_resolve(self):
        html = self.render()
        soup = BeautifulSoup(html, "html.parser")
        ids = [node["id"] for node in soup.select("[id]")]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertFalse(soup.select("script[src], link[rel=stylesheet]"))
        images = soup.select("img[src]")
        self.assertEqual(len(images), 1)
        self.assertTrue(images[0]["src"].startswith("data:image/webp;base64,"))
        self.assertIn("Tim Holtsnider", images[0]["alt"])
        self.assertNotIn("__YP_", html)
        for link in soup.select('a[href^="#"]'):
            self.assertIn(link["href"][1:], ids)
        for tab in soup.select('[role="tab"]'):
            self.assertIsNotNone(soup.find(id=tab["aria-controls"]))

    def test_render_requires_no_network_providers(self):
        with patch("requests.sessions.Session.request", side_effect=AssertionError("Unexpected network call")):
            self.assertIn("New Passage", self.render())

    def test_content_cannot_break_out_of_data_or_text(self):
        entry = dict(your_passage.DAILY_PASSAGES[0])
        attack = '</script><script id="injected">alert(1)</script>'
        entry["passage"] = attack
        with patch.object(your_passage, "DAILY_PASSAGES", [entry] * 4):
            html = self.render(seed=0)
        soup = BeautifulSoup(html, "html.parser")
        self.assertIsNone(soup.find(id="injected"))
        self.assertEqual(self.payload(html)["exercises"][0]["title"], attack)

    def test_original_passages_route_still_works(self):
        response = app.test_client().get("/?theme=topic-signal-daily&date=2026-10-16")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Passages Daily", response.data)


if __name__ == "__main__":
    unittest.main()
