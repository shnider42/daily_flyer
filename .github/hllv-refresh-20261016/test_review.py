"""Data refresh invariants; preserve the accepted UI and unrelated ledgers."""
import hashlib,json,re,subprocess
from pathlib import Path

BASE='e5eccc0af6f8fddd38edd5cb30394bbec8d8ac51'
ROOT=Path('hllv_tracker')
original=lambda p:subprocess.check_output(['git','show',BASE+':'+p])
old=json.loads(original('hllv_tracker/data/issues.json'))
new=json.loads((ROOT/'data/issues.json').read_text())
report=json.loads((ROOT/'reviews/2026-10-16-bug-evidence-review.json').read_text())
by_id={i['id']:i for i in new['issues']}
assert len(by_id)==len(new['issues'])==83
assert new['generated_at']=='2026-10-16'
assert new['incidents']==old['incidents'] and new['method']==old['method']
assert new['patch_notes']==old['patch_notes'],'No newly released patch was found'
assert new['review_history'][:-1]==old['review_history']
assert len(report['updated_issues'])==14 and len(report['new_issues'])==8
assert new['source_access_review']==old['source_access_review'],'No global link freshness claim'
for before in old['issues']:
    after=by_id[before['id']]
    if before['id'] not in report['updated_issues']:
        assert before==after,before['id'];continue
    for field in ['sources','timeline','known','unknown']:
        assert after[field][:len(before[field])]==before[field],(before['id'],field)
    assert after['last_updated']>=before['last_updated']
    assert after['last_reviewed']=='2026-10-16'
    if before['status_key']!='shipped':assert after['status_key']!='shipped'
    for s in after['sources'][len(before['sources']):]:
        assert s['source_reviewed_at']=='2026-10-16'
        assert re.fullmatch('[a-f0-9]{64}',s['content_sha256'])
        assert not s.get('outcome_verification')
for key in report['new_issues']:
    i=by_id[key];assert i['status_key']!='shipped'
    assert i['last_updated']==max(s['date'] for s in i['sources'])
    assert all(s['date']<='2026-10-16' and s['url'].startswith('https://') for s in i['sources'])
assert by_id['HLLV-007']['last_updated']=='2026-10-16'
assert by_id['HLLV-046']['official_short']=='Some cases reproduced internally'
assert by_id['HLLV-067']==old['issues'][66],'Huey scope caveat retained'
assert by_id['HLLV-066']['status_key']=='reported','Support questions are not reproduction'
assert all('#c590691669350879924' not in s['url'] for i in new['issues'] for s in i['sources']),'Held text must not become evidence'

def normalize(markup):
    markup=re.sub(r'const TRACKER_DATA_URL = [^;]+;','SNAPSHOT_URL;',markup)
    return re.sub(r'<details class="patch-provenance"><summary>Latest developer update:.*?</details>','DEVELOPER_BRIEF',markup,count=1,flags=re.S)
assert normalize((ROOT/'index.html').read_text())==normalize(original('hllv_tracker/index.html').decode()),'Unexpected UI/script change'
for p in ['hllv_tracker/data/features.json','hllv_tracker/official-feed.json','hllv_tracker/suggestions-config.json','.github/hllv-homepage/homepage.css']:
    assert Path(p).read_bytes()==original(p),p
for p in subprocess.check_output(['git','ls-tree','-r','--name-only',BASE,'--','hllv_tracker/assets'],text=True).splitlines():
    assert Path(p).read_bytes()==original(p),p
manifest=json.loads((ROOT/'deployment-manifest.json').read_text())
assert (ROOT/manifest['data_url']).read_bytes()==(ROOT/'data/issues.json').read_bytes()
assert hashlib.sha256((ROOT/manifest['data_url']).read_bytes()).hexdigest()==manifest['data_sha256']
assert all((ROOT/p.split('?')[0]).exists() for p in manifest['files'])
print('BUG_REVIEW_PASS: 14 refreshed, 8 added, 83 total; histories preserved; no invented releases; visual assets, functionality, features and account configuration unchanged')
