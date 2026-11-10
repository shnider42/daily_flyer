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
            names = {
                name: module.asset_name(name, (module.SOURCE / name).read_bytes())
                for name in module.FILES
            }
            self.assertEqual(
                {item.name for item in output.iterdir()},
                set(names.values()) | {"robots.txt"},
            )
            html = (output / "index.html").read_text()
            for name in module.FILES:
                if name == "index.html":
                    continue
                self.assertEqual((output / names[name]).read_bytes(), (module.SOURCE / name).read_bytes())
                self.assertIn(names[name], html)
            self.assertIn("Disallow: /", (output / "robots.txt").read_text())
            self.assertNotIn('href="styles.css"', html)
            self.assertNotIn('src="engine.js"', html)
            # A second build remains deterministic and clears obsolete assets.
            (output / "styles.000000000000.css").write_text("stale")
            module.build(output)
            self.assertEqual({item.name for item in output.iterdir()}, set(names.values()) | {"robots.txt"})


if __name__ == "__main__":
    unittest.main()
