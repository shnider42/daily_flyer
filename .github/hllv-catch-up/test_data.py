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

    def test_reviewed_announcement_does_not_become_a_release(self):
        data = module['build']()
        self.assertIn('cf9', {s['id'] for s in data['sources']})
        self.assertEqual(data['coverage_through'], '2026-11-19')
        self.assertEqual(data['reviewed_at'], '2026-11-26')
        self.assertNotIn('cf9', {c['source_id'] for t in data['topics'] for c in t['changes']})
        # The current frontend compares announcement IDs/hashes and uses the
        # newest reviewed source as its review boundary. Its data now includes
        # the checked post without treating it as a released change.
        source = next(s for s in data['sources'] if s['id'] == 'cf9')
        self.assertEqual(source['announcement_id'], '1848664643345363')
        self.assertEqual(source['content_sha256'], 'b59bbce41a03e7d1da32b151a3ae1b7ead4f266a4698860535a7aa69ff8f7c02')

    def test_edited_reviewed_announcement_requires_another_review(self):
        changed = copy.deepcopy(features)
        next(s for s in changed['sources'] if s['id'] == 'cf9')['content_sha256'] = '0' * 64
        with self.assertRaisesRegex(AssertionError, 'source changed'):
            module['build'](features=changed)

    def test_delay_notice_and_map_preview_remain_unreleased(self):
        data = module['build']()
        expected = {
            'release_dates_20261112': ('1849192144183671', '5ba8287d6c31db900b2a056c54362044b6bbf926fc1b8db24263344e80fcf1db'),
            'khe_sanh_preview_20261113': ('1849192144188312', 'b69919ad7760c05eeea6952960e9cc239aca97aea3d69680949d28433be83df0'),
        }
        by_source = {s['id']: s for s in data['sources']}
        for sid, (announcement_id, content_hash) in expected.items():
            self.assertIn(sid, data['reviewed_source_ids'])
            self.assertEqual(by_source[sid]['announcement_id'], announcement_id)
            self.assertEqual(by_source[sid]['content_sha256'], content_hash)
        self.assertFalse(set(expected) & {c['source_id'] for t in data['topics'] for c in t['changes']})
        self.assertNotIn('HLLV-F009', {f for t in data['topics'] for f in t['feature_ids']})
        self.assertEqual(max(c['date'] for t in data['topics'] for c in t['changes']), '2026-11-19')
        for sid in expected:
            with self.subTest(source=sid):
                changed = copy.deepcopy(features)
                next(s for s in changed['sources'] if s['id'] == sid)['content_sha256'] = '0' * 64
                with self.assertRaisesRegex(AssertionError, 'source changed'):
                    module['build'](features=changed)

    def test_unknown_reviewed_announcement_is_rejected(self):
        topics = json.loads(Path('.github/hllv-catch-up/topics.json').read_text())
        topics['reviewed_source_ids'] = ['unreviewed-post']
        with self.assertRaisesRegex(AssertionError, 'missing from the source ledger'):
            module['build'](topics=topics)

    def test_hotfix_advances_only_the_released_comparisons(self):
        data = module['build']()
        self.assertEqual(data['release'], 'Hotfix 1.7.1')
        source = next(s for s in data['sources'] if s['id'] == 'hotfix171')
        self.assertEqual(source['announcement_id'], '1849827110428418')
        self.assertEqual(source['content_sha256'], '365d239d0a36e6d4ce7a8d687c4f9f10d573cdb735203b228afb3c87aafb96a8')
        hotfix_changes = [c for t in data['topics'] for c in t['changes'] if c['source_id'] == 'hotfix171']
        self.assertTrue(hotfix_changes)
        self.assertEqual({c['date'] for c in hotfix_changes}, {'2026-11-19'})
        self.assertNotIn('HLLV-F038', {f for t in data['topics'] for f in t['feature_ids']})
        self.assertNotIn('HLLV-F046', {f for t in data['topics'] for f in t['feature_ids']})

    def test_qssr_is_live_without_promoting_xbox_or_roadmap_content(self):
        data = module['build']()
        graphics = next(t for t in data['topics'] if t['id'] == 'graphics-options')
        qssr = next(f for f in graphics['baselines'] if f['id'] == 'HLLV-F029')
        self.assertIn('enabled by default', qssr['summary'])
        self.assertIn('base PS5', qssr['summary'])
        by_feature = {f['id']: f for f in features['features']}
        for fid in ['HLLV-F009', 'HLLV-F028', 'HLLV-F050', 'HLLV-F055']:
            self.assertEqual(by_feature[fid]['current']['availability'], 'not_confirmed_live')

    def test_series_s_target_does_not_close_the_regression(self):
        data = module['build']()
        performance = next(t for t in data['topics'] if t['id'] == 'console-stability-vegetation')
        issue = next(i for i in performance['issues'] if i['id'] == 'HLLV-124')
        self.assertEqual(issue['status_key'], 'investigating')
        self.assertEqual(issue['last_updated'], '2026-11-19')
        self.assertIn('release unconfirmed', issue['status_label'])
        self.assertIn('release remains unconfirmed', performance['caution'])

    def test_review_does_not_relock_unrelated_rules(self):
        review = json.loads(Path('hllv_tracker/reviews/2026-11-26-hotfix-1-7-1-review.json').read_text())
        old_lock = {
            'features': review['catch_up']['baseline_locks_before'],
            'sources': review['catch_up']['source_locks_before'],
        }
        new_lock = json.loads(Path('.github/hllv-catch-up/review-lock.json').read_text())
        changed = {key for key, value in old_lock['features'].items() if new_lock['features'][key] != value}
        self.assertEqual(changed, {'HLLV-F006', 'HLLV-F026'})
        for key, value in old_lock['sources'].items():
            self.assertEqual(new_lock['sources'][key], value)

if __name__ == '__main__':
    unittest.main()
