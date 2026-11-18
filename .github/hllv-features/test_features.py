"""Tests of the editorial/collection boundary, with synthetic network responses."""
import copy
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj)
    return obj

v=module('feature_validation','.github/hllv-features/validate.py')
n=module('feature_collector','.github/hllv-ux-20261012/nightly.py')
data=json.loads(Path('hllv_tracker/data/features.json').read_text())
issues=json.loads(Path('hllv_tracker/data/issues.json').read_text())

class FeatureTests(unittest.TestCase):
    def with_developer_statement(self):
        fixture=copy.deepcopy(data)
        fixture['sources'].append({
            'id':'reviewed_statement_fixture',
            'source_type':'official_developer_statement',
            'title':'Synthetic developer statement',
            'publisher':'Verified developer on PlayStation Blog',
            'authority':'verified_developer',
            'url':'https://blog.playstation.com/example/',
            'reviewed_via':'https://blog.playstation.com/example/',
            'source_locator':'Named developer section in the article body',
            'hash_basis':'Title + newline + normalized visible article body, excluding comments',
            'content_sha256':'1'*64,
            'published_at':fixture['reviewed_at']+'T00:00:00Z',
            'reviewed_at':fixture['reviewed_at'],
            'review_scope':'Synthetic schema fixture; not a game-release claim.',
        })
        return fixture

    def test_reviewed_records(self):
        self.assertGreaterEqual(len(data['features']),33)
        self.assertEqual(v.validate(data,issues['issues']),len(data['features']))

    def test_verified_external_statement_does_not_require_fake_steam_id(self):
        fixture=self.with_developer_statement()
        self.assertEqual(v.validate(fixture,issues['issues']),len(data['features']))
        self.assertNotIn('announcement_id',fixture['sources'][-1])

    def test_external_statement_keeps_narrow_source_requirements(self):
        changes=[
            lambda s:s.update(authority='official_publisher'),
            lambda s:s.update(announcement_id='123456'),
            lambda s:s.pop('source_locator'),
            lambda s:s.update(hash_basis=''),
            lambda s:s.pop('source_type'),
            lambda s:s.update(source_type='community_blog'),
            lambda s:s.update(url='https://blog.playstation.com.evil.example/post'),
            lambda s:s.update(url='https://blog.playstation.com@evil.example/post'),
            lambda s:s.update(url='https://user@blog.playstation.com/post'),
            lambda s:s.update(url='http://blog.playstation.com/post'),
            lambda s:s.update(url='https://blog.playstation.com:444/post'),
            lambda s:s.update(reviewed_via='https://untrusted.example/post'),
        ]
        for number,change in enumerate(changes):
            with self.subTest(case=number):
                bad=self.with_developer_statement();change(bad['sources'][-1])
                with self.assertRaises(AssertionError):v.validate(bad,issues['issues'])

    def test_steam_sources_still_require_numeric_identity_and_original_hosts(self):
        for change in [lambda s:s.pop('announcement_id'),
                       lambda s:s.update(announcement_id='not-numeric'),
                       lambda s:s.update(url='https://blog.playstation.com/example/')]:
            bad=copy.deepcopy(data)
            source=next(s for s in bad['sources'] if s.get('source_type','steam_announcement')=='steam_announcement')
            change(source)
            with self.assertRaises(AssertionError):v.validate(bad,issues['issues'])

    def test_invalid_authority_live_claim_and_relationship(self):
        changes=[lambda d:d['sources'][0].update(authority='community_moderator'),
                 lambda d:d['features'][0]['current'].update(source_ids=[]),
                 lambda d:d['features'][0].update(related_issue_ids=['HLLV-999']),
                 lambda d:d['features'][0].update(status='planned'),
                 lambda d:d['sources'][0].update(url='javascript:alert(1)')]
        for change in changes:
            bad=copy.deepcopy(data);change(bad)
            with self.assertRaises(AssertionError):v.validate(bad,issues['issues'])

    def test_matching_cannot_advance_status(self):
        before=copy.deepcopy(data)
        matched=n.match_features('Barbed Wire change cancelled; controller customisation discussed.',data['features'])
        self.assertIn('HLLV-F001',matched)
        self.assertEqual(data,before)
        self.assertNotIn('HLLV-F009',matched)
        self.assertEqual(n.match_features('boathouse', [dict(id='boat',monitor_terms=['boat'])]),[])

    def test_collector_preserves_both_ledgers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'data').mkdir()
            issuebytes=json.dumps({'issues':[]}).encode();featurebytes=json.dumps(data).encode()
            (root/'data/issues.json').write_bytes(issuebytes);(root/'data/features.json').write_bytes(featurebytes)
            output=root/'official-feed.json'
            old={'schema_version':1,'items':[{'id':'existing','title':'Saved source','published_at':'2026-10-01T00:00:00Z'}],'last_success_at':'2026-10-01T00:00:00Z','link_checks':{}}
            output.write_text(json.dumps(old))
            with patch.object(n,'ROOT',root),patch.object(n,'OUTPUT',output),patch.object(n,'fetch',side_effect=RuntimeError('offline')),patch.object(n,'collect_responses',return_value={'schema_version':1,'state':'unavailable','threads':[]}):
                n.main()
            self.assertEqual((root/'data/issues.json').read_bytes(),issuebytes)
            self.assertEqual((root/'data/features.json').read_bytes(),featurebytes)
            out=json.loads(output.read_text());self.assertEqual(out['items'],old['items']);self.assertEqual(out['last_success_at'],old['last_success_at'])

    def test_normalization_retains_candidate_only_semantics(self):
        now=datetime.now(timezone.utc)
        raw=json.dumps({'appnews':{'appid':3079210,'newsitems':[{'feedname':'steam_community_announcements','gid':'12345','title':'Future patch discussion','url':'https://steamcommunity.com/games/3079210/announcements/detail/12345','date':int(now.timestamp()),'contents':'Barbed Wire is only being discussed, not released.'}]}})
        item=n.normalize(raw,now,[],data['features'])[0]
        self.assertIn('HLLV-F001',item['candidate_feature_ids'])
        self.assertEqual(item['review_state'],'automatically_collected')
        self.assertNotIn('status',item)

if __name__=='__main__':unittest.main()
