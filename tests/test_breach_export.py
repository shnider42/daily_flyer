"""Integration coverage for the playable export and the existing DFE renderer."""

from __future__ import annotations

import importlib.util
import json
import re
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

from daily_flyer.models import CardItem, PageContext
from daily_flyer.renderer import build_html
from daily_flyer.theme_loader import load_theme

ROOT = Path(__file__).resolve().parents[1]


class ResourceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.resources = []
        self.base = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "base":
            self.base = attrs.get("href")
        if tag in {"script", "img", "audio"} and attrs.get("src"):
            self.resources.append(attrs["src"])
        if tag == "link" and attrs.get("href"):
            self.resources.append(attrs["href"])


class BreachExportTests(unittest.TestCase):
    def test_theme_uses_existing_dfe_contract_and_web_asset_route(self):
        context = load_theme("breach").build_theme_page(date_str="2026-10-29", seed=42)
        html = build_html(context)
        self.assertIn('"seed": 42', html)
        self.assertIn('"date": "2026-10-29"', html)
        self.assertNotIn("__BREACH_", html)
        parser = ResourceParser()
        parser.feed(html)
        self.assertEqual(parser.base, "/daily_flyer/themes/breach_assets/")

    def test_static_export_has_complete_local_module_and_resource_graph(self):
        spec = importlib.util.spec_from_file_location("build_breach", ROOT / "scripts/build_breach.py")
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "site"
            builder.export(target)
            html = (target / "index.html").read_text()
            parser = ResourceParser()
            parser.feed(html)
            self.assertEqual(parser.base, "./")
            for resource in parser.resources:
                self.assertFalse(resource.startswith(("http:", "https:", "//")), resource)
                if resource.startswith("data:"):
                    continue
                path = target / resource.split("?", 1)[0]
                self.assertTrue(path.is_file(), resource)
                self.assertGreater(path.stat().st_size, 0)
            for module in [*target.rglob("*.mjs"), *target.rglob("*.js")]:
                for dependency in re.findall(r"\bfrom\s*['\"]([^'\"]+)['\"]", module.read_text()):
                    self.assertTrue(dependency.startswith("."), f"Unbundled module: {dependency}")
                    self.assertTrue((module.parent / dependency).is_file(), f"Missing {module.name} -> {dependency}")
            manifest = json.loads((target / "build-manifest.json").read_text())
            self.assertEqual(manifest["theme"], "breach")
            self.assertIn("core.mjs", manifest["files"])

    def test_regular_dfe_pages_still_render_cards(self):
        context = PageContext(
            page_title="Existing DFE page", header_title="Existing theme", header_subtitle="Subtitle",
            today_str="2026-10-29", footer_text="Footer",
            cards=[CardItem(card_type="history", eyebrow="History", title="Preserved card", body="Original content")],
        )
        html = build_html(context)
        self.assertIn("Preserved card", html)
        self.assertIn("Original content", html)
        self.assertIn('class="page-shell"', html)
        self.assertNotIn("BREACH", html)


if __name__ == "__main__":
    unittest.main()
