"""Focused integration checks for the standalone build and DFE adapter."""

import importlib.util
import tempfile
import unittest
from pathlib import Path

from daily_flyer.renderer import build_html
from daily_flyer.theme_loader import load_theme


ROOT = Path(__file__).resolve().parents[1]


class RoastMachineThemeTests(unittest.TestCase):
    def test_dfe_adapter_embeds_the_working_app_without_external_assets(self):
        theme = load_theme("roast_machine")
        context = theme.build_theme_page(date_str="2026-11-10", seed=1)
        html = build_html(context)
        self.assertEqual(context.page_title, "Roast Machine")
        self.assertEqual(len(context.cards), 1)
        self.assertIn('class="rm-app"', html)
        self.assertIn("RoastMachine", html)
        self.assertNotIn('src="engine.js"', html)
        self.assertNotIn('src="app.js"', html)
        self.assertIn("connect-src 'none'", html)
        self.assertIn("form-action 'none'", html)
        self.assertIn("noindex, nofollow", html)

    def test_static_build_publishes_only_app_assets(self):
        spec = importlib.util.spec_from_file_location("roast_build", ROOT / "scripts" / "build_roast_machine.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            output = module.build(Path(directory))
            self.assertEqual(
                {item.name for item in output.iterdir()},
                {"index.html", "styles.css", "engine.js", "app.js", "favicon.svg", "robots.txt"},
            )
            for name in module.FILES:
                self.assertEqual((output / name).read_bytes(), (module.SOURCE / name).read_bytes())
            self.assertIn("Disallow: /", (output / "robots.txt").read_text())


if __name__ == "__main__":
    unittest.main()
