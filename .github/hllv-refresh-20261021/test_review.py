"""Regression gates for the editorial release; no live accounts or gameplay claims."""
import copy
import hashlib
import json
import re
import subprocess
import unittest
from pathlib import Path

BASE='0b0d84b467f774e3b51107bdf8ed8f948c782039'
ROOT=Path('hllv_tracker')
data=json.loads((ROOT/'data/issues.json').read_text())
features=json.loads((ROOT/'data/features.json').read_text())
report=json.loads((ROOT/'reviews/2026-10-21-patch-1-7-review.json').read_text())
issues={i['id']:i for i in data['issues']}
topics={f['id']:f for f in features['features']}

def original(path):
    return subprocess.check_output(['git','show',BASE+':'+path])

class PatchReviewTests(unittest.TestCase):
    def test_scope_and_unchanged_records(self):
        old=json.loads(original('hllv_tracker/data/issues.json'))
        self.assertEqual(len(issues),103)
        self.assertEqual(len(topics),33)
        self.assertEqual(len(report['updated_issues']),15)
        self.assertEqual(len(report['new_issues']),19)
        for before in old['issues']:
            after=issues[before['id']]
            if before['id'] not in report['updated_issues']:
                self.assertEqual(after,before)
            else:
                self.assertEqual(after['sources'][:-1],before['sources'])
                self.assertEqual(after['timeline'][:-1],before['timeline'])
        self.assertEqual(data['patch_notes'][1:],old['patch_notes'])
        self.assertEqual(data['incidents'],old['incidents'])
        self.assertEqual((ROOT/'official-feed.json').read_bytes(),original('hllv_tracker/official-feed.json'))

    def test_release_scope_does_not_close_adjacent_reports(self):
        for key in ['HLLV-061','HLLV-062']:
            self.assertEqual(issues[key]['status_key'],'shipped')
        for key in ['HLLV-003','HLLV-006','HLLV-007','HLLV-031','HLLV-033','HLLV-046','HLLV-057','HLLV-060','HLLV-067','HLLV-077','HLLV-084']:
            self.assertNotEqual(issues[key]['status_key'],'shipped',key)
        self.assertEqual(issues['HLLV-102']['status_key'],'partial')
        self.assertIn('not explicitly confirm',issues['HLLV-067']['bottom_line'])
        self.assertIn('killed driver',issues['HLLV-062']['bottom_line'])
        self.assertFalse(report['independent_gameplay_testing'])

    def test_feature_history_and_future_boundaries(self):
        old=json.loads(original('hllv_tracker/data/features.json'))
        for before in old['features']:
            after=topics[before['id']]
            if before['id'] in report['updated_features']:
                self.assertEqual(after['history'][:-1],before['history'])
            else:
                self.assertEqual(after,before)
        for key in ['HLLV-F001','HLLV-F003','HLLV-F008','HLLV-F010']:
            self.assertEqual(topics[key]['status'],'released')
            self.assertIn('patch17',topics[key]['current']['source_ids'])
        for key in ['HLLV-F004','HLLV-F009','HLLV-F028','HLLV-F029']:
            self.assertEqual(topics[key]['current']['availability'],'not_confirmed_live')
        self.assertEqual(topics['HLLV-F029']['target'],'No confirmed release date')
        self.assertIn('PS5 Pro',topics['HLLV-F010']['current']['summary'])
        self.assertEqual(topics['HLLV-F015']['status'],'under_consideration')

    def test_source_provenance(self):
        source=next(s for s in features['sources'] if s['id']=='patch17')
        self.assertEqual(source['content_sha256'],report['source']['content_sha256'])
        self.assertEqual(source['published_at'],'2026-10-21T10:00:57Z')
        self.assertEqual(source['authority'],'official_publisher')
        for key in report['updated_issues']+report['new_issues']:
            citation=issues[key]['sources'][-1]
            self.assertEqual(citation['content_sha256'],source['content_sha256'])
            self.assertTrue(citation['source_locator'])
            self.assertEqual(citation['source_reviewed_at'],'2026-10-21')

    def test_archive_and_stationary_ui_preserved(self):
        page=(ROOT/'index.html').read_text()
        before=original('hllv_tracker/index.html').decode()
        self.assertEqual(page.count('class="patch-entry"'),9)
        self.assertEqual(page.count('class="patch-latest"'),1)
        self.assertLess(page.index('id="patch-1-7"'),page.index('id="patch-1-6"'))
        self.assertIn('9 reviewed releases · August 21–October 21, 2026',page)
        self.assertEqual(page.count('id="patchDateOrder"'),1)
        self.assertNotIn('Patch 1.7 remains upcoming.',page)
        def mask(text):
            text=re.sub(r'<!-- PATCH NOTES START -->.*?<!-- PATCH NOTES END -->','ARCHIVE',text,flags=re.S)
            return re.sub(r'data/(issues|features)\.[a-f0-9]+\.json',r'data/\1.HASH.json',text)
        self.assertEqual(mask(page),mask(before),'No UI change outside the archive and data pointers')
        self.assertIn('visual-system-9d72ca7b997b829f.css',page)

    def test_published_data_matches(self):
        manifest=json.loads((ROOT/'deployment-manifest.json').read_text())
        for kind,key in [('issues','data_url'),('features','feature_data_url')]:
            raw=(ROOT/f'data/{kind}.json').read_bytes()
            immutable=manifest[key]
            self.assertIn(hashlib.sha256(raw).hexdigest()[:16],immutable)
            self.assertEqual((ROOT/immutable).read_bytes(),raw)
        self.assertEqual(data['page_updated_at'],report['page_updated_at'])

if __name__=='__main__':
    unittest.main()
