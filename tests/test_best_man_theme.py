"""Integration checks for the notebook's DFE adapter and safe static publication."""

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from daily_flyer.renderer import build_html
from daily_flyer.theme_loader import load_theme


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("best_man_build", ROOT / "scripts" / "build_best_man.py")
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def write_source(directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    files = {
        "index.html": '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head>'
        '<body class="notebook-body"><div class="bm-app"><main>For my brother</main></div>'
        '<script src="store.js"></script><script src="cloud.js"></script><script src="app.js"></script></body></html>',
        "styles.css": ".bm-app { color: #20352a; }",
        "store.js": "window.NotebookStore = {};",
        "cloud.js": "window.NotebookCloud = {};",
        "app.js": "window.NotebookApp = {};",
    }
    for name, content in files.items():
        (directory / name).write_text(content, encoding="utf-8")


class BestManThemeTests(unittest.TestCase):
    def test_dfe_adapter_embeds_app_without_external_scripts_or_platform_chrome(self):
        theme = load_theme("best_man")
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "assets"
            write_source(source)
            with patch.object(theme, "ASSETS", source):
                context = theme.build_theme_page(date_str="2026-11-10")
                html = build_html(context)
        self.assertEqual(context.page_title, "For my brother")
        self.assertEqual(len(context.cards), 1)
        self.assertIn('class="bm-app"', html)
        self.assertIn("window.NotebookStore", html)
        self.assertIn("window.NotebookCloud", html)
        self.assertIn("window.NotebookApp", html)
        self.assertNotIn('src="store.js"', html)
        self.assertNotIn('src="cloud.js"', html)
        self.assertNotIn('src="app.js"', html)
        self.assertIn('.page-shell > .hero-wrap, .page-shell > footer { display: none; }', html)
        self.assertIn("connect-src https://uwbhjgvpaetrhfvcpvsg.supabase.co;", html)
        self.assertIn("form-action 'none'", html)
        self.assertIn("noindex, nofollow", html)
        self.assertIn('document.body.classList.add(...["notebook-body"]);', html)

    def test_static_build_copies_only_owned_assets_and_refreshes_fingerprints(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root / "assets", root / "public"
            write_source(source)
            (source / "private-note.txt").write_text("not a public asset")
            output.mkdir()
            (output / "unrelated.txt").write_text("keep me")
            (output / "unrelated-directory").mkdir()
            (output / "styles.000000000000.css").write_text("old style")
            with patch.object(BUILDER, "SOURCE", source):
                BUILDER.build(output)
                names = {name: BUILDER.asset_name(name, (source / name).read_bytes()) for name in BUILDER.REQUIRED_FILES}
                html = (output / "index.html").read_text()
                for original in BUILDER.FINGERPRINTED:
                    self.assertIn(names[original], html)
                    self.assertEqual((output / names[original]).read_bytes(), (source / original).read_bytes())
                self.assertIn("noindex, nofollow", html)
                self.assertEqual((output / "robots.txt").read_text(), "User-agent: *\nDisallow: /\n")
                self.assertFalse((output / "private-note.txt").exists())
                self.assertFalse((output / "styles.000000000000.css").exists())
                self.assertEqual((output / "unrelated.txt").read_text(), "keep me")
                self.assertTrue((output / "unrelated-directory").is_dir())
                original_files = {path.name: path.read_bytes() for path in output.iterdir() if path.is_file()}
                BUILDER.build(output)
                self.assertEqual(original_files, {path.name: path.read_bytes() for path in output.iterdir() if path.is_file()})

    def test_builder_rejects_source_and_ancestor_or_descendant_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "assets"
            write_source(source)
            before = (source / "index.html").read_bytes()
            with patch.object(BUILDER, "SOURCE", source):
                for destination in (source, root, source / "dist"):
                    with self.subTest(destination=destination), self.assertRaises(SystemExit):
                        BUILDER.build(destination)
            self.assertEqual(before, (source / "index.html").read_bytes())
            self.assertFalse((source / "dist").exists())

    def test_missing_referenced_icon_fails_before_mutating_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root / "assets", root / "public"
            write_source(source)
            html_path = source / "index.html"
            html_path.write_text(html_path.read_text().replace("</head>", '<link rel="icon" href="favicon.svg"></head>'))
            with patch.object(BUILDER, "SOURCE", source), self.assertRaisesRegex(SystemExit, "missing asset: favicon.svg"):
                BUILDER.build(output)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
