"""Narrow Type styling and copy change. No authentication or database changes."""
import hashlib,json,re,subprocess
from pathlib import Path
from datetime import datetime,timezone
R=Path('hllv_tracker');P=Path(__file__).parent
page=R/'index.html';html=page.read_text()
if 'id="type-emphasis-style"' in html:raise SystemExit('Type emphasis already installed; no rewrite made.')
protected={p:p.read_bytes() for p in [R/'official-feed.json',R/'suggestions-config.json']}
for u in re.findall(r'<script id="hllv-(?:session|password)-module"[^>]*src="\./([^"]+)"',html):protected[R/u]=(R/u).read_bytes()
def once(s,a,b):
 assert s.count(a)==1,'Integration changed: '+a[:80]
 return s.replace(a,b,1)
def asset(p,prefix,extension):
 raw=p.read_bytes();name='assets/'+prefix+'-'+hashlib.sha256(raw).hexdigest()[:16]+extension;(R/name).write_bytes(raw);return './'+name
def script_path(tag):return R/re.search(r'<script id="'+tag+r'"[^>]*src="\./([^"]+)"',html).group(1)
app=Path('.github/hllv-community/app.js');types=Path('.github/hllv-ux-20261012/form-types.js')
assert script_path('suggestions-module').read_bytes()==app.read_bytes()
assert script_path('hllv-form-types').read_bytes()==types.read_bytes()
s=app.read_text()
s=once(s,'<label for="cbKind">Type<select name="kind" id="cbKind">','<label for="cbKind" class="cb-type-field"><span class="cb-type-label"><span id="cbTypeName">Type</span><small id="cbTypeHint">Guides the questions below</small></span><select name="kind" id="cbKind" aria-labelledby="cbTypeName" aria-describedby="cbTypeHint cbTypeHelp">')
s=once(s,'<span id="cbProblemLabel">What could be better or added?</span>','<span id="cbProblemLabel">What inspired this idea?</span>')
s=once(s,'Choose a type to guide your submission. Switching types keeps what you have already written.','Switching types keeps what you have already written.')
app.write_text(s)
s=types.read_text()
for old,new in [('An idea can improve something that exists or add something new. Describe the opportunity and your idea.','Describe the need first, then the change you have in mind.'),('What could be better or added?','What inspired this idea?'),('Describe an opportunity, a missing feature, or something that could be easier.','Describe the situation, unmet need, or frustration behind it. Save the proposed solution for the next field.'),('Explain your idea and how it could help players.','Describe your idea and how it would work.'),("problemHeading:'The opportunity'","problemHeading:'The need behind the idea'"),("outcomeHeading:'The idea'","outcomeHeading:'The proposed idea'")]:s=once(s,old,new)
types.write_text(s)
for tag,p,prefix in [('suggestions-module',app,'community'),('hllv-form-types',types,'form-types')]:
 url=asset(p,prefix,'.js');html,n=re.subn(r'(<script id="'+tag+r'"[^>]*src=")[^"]+',lambda m:m[1]+url,html);assert n==1
css=asset(P/'type-emphasis.css','type-emphasis','.css');html=once(html,'</head>','<link id="type-emphasis-style" rel="stylesheet" href="'+css+'">\n</head>')
page.write_text(html)
ledger=R/'data/issues.json';before=json.loads(ledger.read_text());after={**before,'page_updated_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')}
ledger.write_text(json.dumps(after,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
html=page.read_text();mf=R/'deployment-manifest.json';manifest=json.loads(mf.read_text())
manifest['files']=list(dict.fromkeys(manifest['files']+['suggestions-config.json']+[u for u in re.findall(r'(?:src|href)="\./([^"]+)"',html) if (R/u.split('?')[0]).is_file()]))
mf.write_text(json.dumps(manifest,indent=2)+'\n')
for p,b in protected.items():assert p.read_bytes()==b,str(p)
assert {k:v for k,v in after.items() if k!='page_updated_at'}=={k:v for k,v in before.items() if k!='page_updated_at'}
test=Path('.github/hllv-ux-20261012/test_browser.py');test.write_text(once(test.read_text(),"to_have_text('What could be better or added?')","to_have_text('What inspired this idea?')"))
(R/'reviews/type-emphasis.json').write_text(json.dumps({'page_updated_at':after['page_updated_at'],'changes':['theme-aware Type emphasis','distinct idea context and proposal'],'auth_unchanged':True,'database_unchanged':True,'reviewed_evidence_unchanged':True,'nightly_feed_unchanged':True},indent=2)+'\n')
print('TYPE_UI_READY: authentication, moderation and evidence unchanged')
