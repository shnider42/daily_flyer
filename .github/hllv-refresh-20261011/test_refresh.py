"""Content/unchanged-feature invariants and a no-credentials page smoke test."""
import argparse,copy,hashlib,importlib.util,json,re,subprocess
from pathlib import Path
from urllib.request import urlopen

p=argparse.ArgumentParser();p.add_argument('--url');a=p.parse_args()
ROOT=Path('hllv_tracker');BASE='3e986f5e1417f90a015e9ba0f01a40ae4bb99244'
def original(path):return subprocess.check_output(['git','show',BASE+':'+path])
spec=importlib.util.spec_from_file_location('review',Path(__file__).with_name('refresh.py'));review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
data=json.loads((ROOT/'data/issues.json').read_text());old=json.loads(original('hllv_tracker/data/issues.json'))
assert data['generated_at']=='2026-10-11' and data['review_release']==review.RELEASE
assert len(data['issues'])==75 and data['incidents']==old['incidents']
assert [i['id'] for i in data['issues']]==[i['id'] for i in old['issues']]
link_keys={'link_check','link_checked_at'}
for before,after in zip(old['issues'],data['issues']):
    key=before['id']
    assert after['timeline'][:len(before['timeline'])]==before['timeline']
    assert after['known'][:len(before['known'])]==before['known']
    assert after['unknown'][:len(before['unknown'])]==before['unknown']
    for old_source,new_source in zip(before['sources'],after['sources']):
        assert {k:v for k,v in old_source.items() if k not in link_keys}=={k:v for k,v in new_source.items() if k not in link_keys}
    if key in review.CHANGES:
        assert len(after['sources'])==len(before['sources'])+1
        assert after['last_updated']=='2026-10-09' and after['last_reviewed']=='2026-10-11'
        assert after['sources'][-1]['url']==review.SOURCE
        assert after['sources'][-1]['source_reviewed_at']=='2026-10-11'
        assert not after['sources'][-1].get('outcome_verification')
    else:
        def stripped(i):
            i=copy.deepcopy(i)
            for s in i['sources']:
                for k in link_keys:s.pop(k,None)
            return i
        assert stripped(before)==stripped(after),key
assert sum(len(i['sources']) for i in data['issues'])==sum(len(i['sources']) for i in old['issues'])+10
by_id={i['id']:i for i in data['issues']}
assert by_id['HLLV-067']['status_key']=='partial'
assert by_id['HLLV-046']['status_key']=='partial'
assert by_id['HLLV-060']['status_key']==old['issues'][59]['status_key']
assert all(by_id[i]['status_key']=='shipped' for i in ['HLLV-058','HLLV-063','HLLV-068'])
assert len(data['patch_notes'])==8 and data['developer_updates'][-1]['type']=='official update'
assert data['developer_updates'][-1]['date']=='2026-10-09'
for n in data['patch_notes']:
    assert n['reviewed_at']==('2026-10-11' if n['id'] in ['patch-1-6','hotfix-1-5-2'] else '2026-10-07')
    assert n['date']<='2026-10-07'
for folder in ['.github/hllv-password','.github/hllv-pilot','.github/hllv-rehearsal','.github/hllv-inbox','suggestion_box']:
    tracked=subprocess.check_output(['git','ls-tree','-r','--name-only',BASE,'--',folder],text=True).splitlines()
    for name in tracked:assert Path(name).read_bytes()==original(name),name
for name in ['hllv_tracker/suggestions-config.json','hllv_tracker/evidence.js','hllv_tracker/freshness.js']:
    assert Path(name).read_bytes()==original(name),name
old_html=original('hllv_tracker/index.html').decode();new_html=(ROOT/'index.html').read_text()
def normalize(markup):
    markup=re.sub(r'<!-- PATCH NOTES START -->.*?<!-- PATCH NOTES END -->','PATCH_ARCHIVE',markup,flags=re.S)
    return re.sub(r'const TRACKER_DATA_URL = [^;]+;','const TRACKER_DATA_URL = SNAPSHOT;',markup)
assert normalize(old_html)==normalize(new_html),'Unexpected markup/script change outside archive and snapshot URL'
manifest=json.loads((ROOT/'deployment-manifest.json').read_text());old_manifest=json.loads(original('hllv_tracker/deployment-manifest.json'))
assert hashlib.sha256((ROOT/manifest['data_url']).read_bytes()).hexdigest()==manifest['data_sha256']
assert (ROOT/manifest['data_url']).read_bytes()==(ROOT/'data/issues.json').read_bytes()
for path in old_manifest['files']:
    if path in [old_manifest['data_url'],old_manifest['evidence_js_url']]:continue
    assert path in manifest['files'] and (ROOT/path.split('?')[0]).read_bytes()==original('hllv_tracker/'+path.split('?')[0]),path
assert new_html.count('class="patch-entry"')==8
assert 'Community Feedback #7' in new_html and 'not a patch' in new_html
assert 'Summary reviewed 2026-10-11.' in new_html and 'Summary reviewed 2026-10-07.' in new_html
print('CONTENT_INVARIANTS_PASS: 75 IDs, all histories/claims retained, 10 reviewed additions; source dates separate; 8 releases and one developer brief; login/moderation/practice code unchanged')

if a.url:
    from playwright.sync_api import sync_playwright,expect
    with sync_playwright() as pw:
        for engine in ['chromium','webkit']:
            browser=getattr(pw,engine).launch();context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
            page=context.new_page();errors=[];requests=[]
            page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
            page.goto(a.url,wait_until='networkidle');expect(page.locator('#pageLastUpdated')).to_contain_text('October 11',timeout=30000)
            stamp=page.locator('#pageLastUpdated').inner_text()
            expect(page.locator('#latestChange')).to_contain_text('Community Feedback #7')
            expect(page.locator('.patch-entry')).to_have_count(8)
            brief=page.locator('#patch-notes > details.patch-provenance')
            expect(brief).to_have_count(1);brief.locator('summary').click();expect(brief).to_contain_text('not submissions to this site')
            page.locator('#patch-1-6 > summary').click();expect(page.locator('#patch-1-6')).to_contain_text('Huey M60')
            page.locator('#patch-1-6 a[data-patch-issue="HLLV-067"]').click();expect(page.locator('#dossier')).to_contain_text('1.7')
            page.get_by_role('button',name='Sources',exact=True).click();expect(page.locator('#dossier')).to_contain_text('Community Feedback #7')
            page.get_by_role('button',name='Suggestion Box',exact=True).click();expect(page.locator('#sgPasswordLogin')).to_be_visible(timeout=30000)
            page.get_by_role('button',name='Overview',exact=True).click()
            for width in [320,390,1280]:
                page.set_viewport_size({'width':width,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),(engine,width)
            page.reload(wait_until='networkidle');assert page.locator('#pageLastUpdated').inner_text()==stamp
            assert not any('/auth/v1/otp' in r or '/auth/v1/verify' in r or '/auth/v1/token' in r or '/auth/v1/signup' in r for r in requests),'Unexpected real auth request'
            assert not errors,errors
            browser.close()
            print('REFRESH_BROWSER_PASS',engine,'dated overview, brief, patch caveat, related issue, source view, unchanged signed-out password UI; no credentials/emails/submissions')
