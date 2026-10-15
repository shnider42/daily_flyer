"""Wire collector and coverage UI into the existing pipeline; preserve app/Auth data."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,re,subprocess
R=Path('hllv_tracker');S=Path(__file__).parent

def main():
    page=R/'index.html';html=page.read_text();before=(R/'data/issues.json').read_bytes()
    protected={p:p.read_bytes() for p in R.glob('assets/*') if any(x in p.name for x in ['community-','password-','session-','submission-thread-','registration-','form-types-'])}
    nightly=Path('.github/hllv-ux-20261012/nightly.py');n=nightly.read_text()
    marker='    # Reply-level monitoring is independent of announcement collection.'
    if marker not in n:
        needle="    tmp=OUTPUT.with_suffix('.tmp');"
        assert n.count(needle)==1
        addition='''    # Reply-level monitoring is independent of announcement collection.
    import importlib.util
    module_path=Path(__file__).parent.parent/'hllv-source-responses/collector.py'
    spec=importlib.util.spec_from_file_location('hllv_source_responses',module_path)
    response_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(response_module)
    out['response_monitor']=response_module.collect(data['issues'],previous.get('response_monitor',{}),now)
    coverage=out['response_monitor']
    print('RESPONSE_COVERAGE',json.dumps({k:v for k,v in coverage.items() if k!='threads'}))
    if coverage['state'] not in ('complete','no_monitored_threads'):
        out['warnings'].append('Discussion reply coverage is incomplete; inspect response_monitor for per-thread results. Announcement freshness does not establish discussion coverage.')
'''
        n=n.replace(needle,addition+needle,1)
    if 'hllv_response_content_review' not in n:
        needle="    coverage=out['response_monitor']"
        assert n.count(needle)==1
        addition='''    quality_path=Path(__file__).parent.parent/'hllv-source-responses/content_review.py'
    quality_spec=importlib.util.spec_from_file_location('hllv_response_content_review',quality_path)
    quality=importlib.util.module_from_spec(quality_spec);quality_spec.loader.exec_module(quality)
    quality.apply(out['response_monitor'])
'''
        n=n.replace(needle,addition+needle,1)
    nightly.write_text(n)
    feed=Path('.github/hllv-ux-20261012/feed.js');js=feed.read_text()
    if 'HLLVResponses' not in js:
        js=js.replace(" function draw(){", " function draw(){\n  window.HLLVResponses?.render(feed?.response_monitor);")
        js=js.replace("}catch(_){const n=document.getElementById('sourceSyncStatus');", "}catch(_){window.HLLVResponses?.unavailable();const n=document.getElementById('sourceSyncStatus');")
        js=js.replace("'Sources checked · '","'Announcements checked · '")
        feed.write_text(js)
    def asset(path,prefix,extension):
        raw=path.read_bytes();name='assets/'+prefix+'-'+hashlib.sha256(raw).hexdigest()[:16]+extension;(R/name).write_bytes(raw);return './'+name
    script=asset(S/'responses.js','source-responses','.js');css=asset(S/'responses.css','source-responses','.css');feedurl=asset(feed,'official-feed','.js')
    if 'id="staffResponses"' not in html:
        needle='<div id="officialSourceList"></div></section>';assert html.count(needle)==1
        html=html.replace(needle,needle+'<section id="staffResponses" class="response-monitor" aria-label="Staff response monitoring"><h2>Staff responses in tracked discussions</h2><p>Checking discussion coverage…</p></section>',1)
        html=html.replace('<script id="hllv-source-feed"','<script id="hllv-source-responses" src="'+script+'" defer></script>\n  <script id="hllv-source-feed"',1)
        html=html.replace('</head>','<link id="hllv-source-responses-style" rel="stylesheet" href="'+css+'">\n</head>',1)
    for tag,url,attr in [('hllv-source-feed',feedurl,'src'),('hllv-source-responses',script,'src'),('hllv-source-responses-style',css,'href')]:
        html,count=re.subn(r'(<(?:script|link) id="'+tag+r'"[^>]*'+attr+r'=")[^"]+',lambda m:m[1]+url,html);assert count==1
    page.write_text(html)
    ledger=json.loads(before);ledger['page_updated_at']=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z');(R/'data/issues.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
    subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
    m=R/'deployment-manifest.json';manifest=json.loads(m.read_text());manifest['files']=list(dict.fromkeys(manifest['files']+['suggestions-config.json']+[u[2:] for u in re.findall(r'(?:src|href)="(\./[^"]+)"',page.read_text()) if (R/u[2:].split('?')[0]).is_file()]))
    m.write_text(json.dumps(manifest,indent=2)+'\n')
    for p,raw in protected.items():assert p.read_bytes()==raw
    assert {k:v for k,v in ledger.items() if k!='page_updated_at'}=={k:v for k,v in json.loads(before).items() if k!='page_updated_at'}
    (R/'reviews/source-responses.json').write_text(json.dumps({'page_updated_at':ledger['page_updated_at'],'scope':'existing reviewed Steam source threads only','reply_detection':True,'coverage_reporting':True,'explicit_content_review_holds':True,'new_thread_discovery':False,'affiliate_channel_collection':False,'reviewed_bug_status_changes':False,'supabase_changes':False,'auth_and_community_assets_unchanged':True},indent=2)+'\n')
    print('RESPONSE_MONITOR_INTEGRATED')
if __name__=='__main__':main()
