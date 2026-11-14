import unittest
from pathlib import Path
from daily_flyer_v2 import build_flyer_experience, build_flyer_html
from daily_flyer_v2.renderers.huddle_soccer import render_huddle_soccer

ROOT = Path(__file__).resolve().parents[1]


class SoccerExportTests(unittest.TestCase):
    def test_registered_product_and_exports_match(self):
        soccer = build_flyer_html('huddle-soccer')
        self.assertEqual(soccer, (ROOT / 'nfl_catchup/soccer/index.html').read_text(encoding='utf-8'))
        self.assertIn('lang="pt-BR"', soccer)
        self.assertIn('data-sport="soccer"', soccer)
        self.assertIn('id="sport-select"', soccer)
        self.assertNotIn('@@', soccer)
        nfl = build_flyer_html('nfl_catch_up')
        self.assertEqual(nfl, (ROOT / 'nfl_catchup/index.html').read_text(encoding='utf-8'))
        self.assertIn('id="sport-select"', nfl)
        self.assertIn('value="de-AT"', nfl)
        self.assertIn('value="hi-IN"', nfl)
        self.assertIn('value="gu-IN"', nfl)

    def test_json_text_cannot_escape_the_data_element(self):
        experience = build_flyer_experience('huddle_soccer')
        experience.data['injection'] = '</script><script>alert(1)</script>'
        html = render_huddle_soccer(experience)
        self.assertNotIn('</script><script>alert(1)', html)
        self.assertIn('\\u003c/script>', html)


if __name__ == '__main__':
    unittest.main()
