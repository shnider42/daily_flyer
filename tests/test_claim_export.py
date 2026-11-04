import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest
from daily_flyer.renderer import build_html
from daily_flyer.theme_loader import load_theme

ROOT=Path(__file__).resolve().parents[1]

class ClaimExportTests(unittest.TestCase):
    def test_dfe_theme_and_browser_source_imports(self):
        theme=load_theme('claim_denied')
        html=build_html(theme.build_theme_page(date_str='2026-11-03',seed=42))
        self.assertIn('/daily_flyer/themes/claim_denied_assets/',html)
        self.assertNotIn('__CLAIM_DENIED_',html)
        self.assertTrue((theme.ASSET_DIRECTORY/'vendor/three.module.js').is_file())

    def test_export_resolves_every_local_import_and_preserves_vendor_license(self):
        spec=importlib.util.spec_from_file_location('build_claim',ROOT/'scripts/build_claim_denied.py')
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        with tempfile.TemporaryDirectory() as tmp:
            mod.export(Path(tmp)/'game');target=Path(tmp)/'game'
            self.assertIn('<base href="./">',(target/'index.html').read_text())
            for p in [*target.rglob('*.mjs'),*target.rglob('*.js')]:
                for dependency in re.findall(r"\bfrom\s*['\"]([^'\"]+)['\"]",p.read_text()):
                    self.assertTrue((p.parent/dependency).is_file(),str(p)+' -> '+dependency)
            manifest=json.loads((target/'build-manifest.json').read_text())
            self.assertEqual(manifest['version'],'0.1.1')
            self.assertIn('vendor/THREE-LICENSE.txt',manifest['files'])
            self.assertNotIn('qa-mobile.html',manifest['files'])

if __name__=='__main__': unittest.main()
