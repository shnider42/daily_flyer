"""Protect factual comparisons, reviewed evidence, and the exclusion of advice."""
import copy
import json
import runpy
import unittest
from pathlib import Path

module = runpy.run_path('.github/hllv-catch-up/build.py')
features = json.loads(Path('hllv_tracker/data/features.json').read_text())

class GuideEvidenceTests(unittest.TestCase):
    def test_live_baseline_can_have_a_future_proposal(self):
        data = module['build']()
        medic = next(t for t in data['topics'] if t['id'] == 'squad-roles')
        self.assertEqual([c['date'] for c in medic['changes']], ['2026-10-07'])
        self.assertIn('two Medic slots', medic['baselines'][0]['summary'])
        self.assertNotIn('HLLV-F028', {f for t in data['topics'] for f in t['feature_ids']})

    def test_changed_rule_requires_guide_review(self):
        changed = copy.deepcopy(features)
        changed['features'][0]['current']['summary'] = 'Changed placement limits'
        with self.assertRaisesRegex(AssertionError, 'live behavior changed'):
            module['build'](features=changed)

    def test_changed_official_source_requires_review(self):
        changed = copy.deepcopy(features)
        changed['sources'][0]['content_sha256'] = '0' * 64
        with self.assertRaisesRegex(AssertionError, 'source changed'):
            module['build'](features=changed)

    def test_unreleased_mechanics_cannot_be_presented_as_live(self):
        changed = copy.deepcopy(features)
        changed['features'][0]['current']['availability'] = 'not_confirmed_live'
        with self.assertRaisesRegex(AssertionError, 'unreleased content'):
            module['build'](features=changed)

    def test_advice_field_cannot_return_to_the_factual_guide(self):
        topics = json.loads(Path('.github/hllv-catch-up/topics.json').read_text())
        topics['topics'][0]['guidance'] = 'Use this tactic'
        with self.assertRaisesRegex(AssertionError, 'not tactical advice'):
            module['build'](topics=topics)

    def test_incomplete_before_after_is_rejected(self):
        topics = json.loads(Path('.github/hllv-catch-up/topics.json').read_text())
        topics['topics'][0]['changes'][0].pop('before')
        with self.assertRaisesRegex(AssertionError, 'before and after'):
            module['build'](topics=topics)

if __name__ == '__main__':
    unittest.main()
