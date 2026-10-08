"""Add the closed-by-default pilot while preserving game evidence and history."""
from datetime import datetime,timezone
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path('hllv_tracker');SRC=Path('.github/hllv-pilot')
def once(s,old,new):
 if s.count(old)!=1:raise RuntimeError('Integration point changed: '+old[:80])
 return s.replace(old,new,1)
def main():
 page=ROOT/'index.html';html=page.read_text();before=json.loads((ROOT/'data/issues.json').read_text());original=html
 js=(SRC/'suggestions.js').read_bytes();css=(SRC/'suggestions.css').read_bytes()
 jsname='assets/suggestions-'+hashlib.sha256(js).hexdigest()[:16]+'.js';cssname='assets/suggestions-'+hashlib.sha256(css).hexdigest()[:16]+'.css'
 (ROOT/'assets').mkdir(exist_ok=True);(ROOT/jsname).write_bytes(js);(ROOT/cssname).write_bytes(css)
 if 'id="suggestionBox"' not in html:
  html=once(html,'<button class="top-link" data-page="issues">All issues</button>','<button class="top-link" data-page="issues">All issues</button><button class="top-link" data-page="suggestions">Suggestion Box</button>')
  html=once(html,'  <div class="home hidden" id="home">',(SRC/'suggestions.html').read_text()+'\n  <div class="home hidden" id="home">')
  html=once(html,'</head>','  <link id="suggestions-style" rel="stylesheet" href="./'+cssname+'">\n</head>')
  html=once(html,'  <script>\n','  <script id="suggestions-module" src="./'+jsname+'"></script>\n  <script>\n')
  html=once(html,'function setTop(page){',"function setTop(page){document.getElementById('suggestionBox').classList.toggle('hidden',page!=='suggestions');")
  fn='''    function showSuggestions(push=false){if(push)history.pushState(null,'','#suggestions');['landing','home','app'].forEach(id=>document.getElementById(id).classList.add('hidden'));setTop('suggestions');document.title='Suggestion Box · Infierno Liberado';window.scrollTo({top:0,behavior:'instant'});if(window.HLLVSuggestions)HLLVSuggestions.show(dataset?.issues||[]);else document.getElementById('sgStatus').textContent='Suggestion Box could not load. No submissions are being collected.';}
'''
  html=once(html,'    function route(){',fn+"    function route(){if(location.hash==='#suggestions'){showSuggestions(false);return;}")
  html=once(html,"b.dataset.page==='landing'?showLanding(true):showHome(true)","b.dataset.page==='landing'?showLanding(true):b.dataset.page==='suggestions'?showSuggestions(true):showHome(true)")
  html=once(html,"    fetch(TRACKER_DATA_URL",'''    document.addEventListener('click',event=>{const a=event.target.closest('[data-suggestion-issue]');if(a&&dataset?.issues.some(i=>i.id===a.dataset.suggestionIssue)){event.preventDefault();selectIssue(a.dataset.suggestionIssue,true);}});
    if(location.hash==='#suggestions')showSuggestions(false);
    fetch(TRACKER_DATA_URL''')
 else:
  html,n=re.subn(r'(<link id="suggestions-style"[^>]*href=")[^"]+',lambda m:m[1]+'./'+cssname,html);assert n==1
  html,n=re.subn(r'(<script id="suggestions-module"[^>]*src=")[^"]+',lambda m:m[1]+'./'+jsname,html);assert n==1
 cfg=ROOT/'suggestions-config.json'
 if not cfg.exists():cfg.write_bytes((SRC/'suggestions-config.json').read_bytes())
 if html!=original:
  updated={**before,'page_updated_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')}
  (ROOT/'data/issues.json').write_text(json.dumps(updated,ensure_ascii=False,indent=2)+'\n')
 page.write_text(html);subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
 manifest=json.loads((ROOT/'deployment-manifest.json').read_text());manifest['files'] += [jsname,cssname,'suggestions-config.json']
 (ROOT/'deployment-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 after=json.loads((ROOT/'data/issues.json').read_text())
 assert {k:v for k,v in before.items() if k!='page_updated_at'}=={k:v for k,v in after.items() if k!='page_updated_at'}
 ids=[i['id'] for i in before['issues']];assert all(re.fullmatch(r'HLLV-[0-9]{3,6}',i) for i in ids)
 Path('suggestion_box/migrations/002_issue_catalog.sql').write_text('INSERT INTO hllv_private.issue_links(id) VALUES\n'+',\n'.join("('"+i+"')" for i in ids)+'\nON CONFLICT DO NOTHING;\n')
 readme=ROOT/'README.md'
 if '## Suggestion Box pilot' not in readme.read_text():readme.write_text(readme.read_text()+'\n## Suggestion Box pilot\n\nThe third navigation section is a closed-by-default invitation-only pilot. UI assets are content-addressed. Its separate Supabase schema, permissions, tests and activation checklist live in `suggestion_box/`; no private submissions or reviewer correspondence belong in this repository. Production sign-in, submissions and voting stay disabled until the external connection, reviewer authorization and privacy settings are configured. Run `.github/hllv-pilot/install.py` after deliberate pilot UI edits. The existing game evidence is not refreshed by this feature.\n')
 print('PILOT_INSTALLED',json.dumps({'intake_enabled':json.loads(cfg.read_text())['enabled'],'issues_unchanged':len(ids),'page_updated_at':after['page_updated_at'],'assets':[jsname,cssname]}))
if __name__=='__main__':main()
