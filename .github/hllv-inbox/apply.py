"""Install the moderator inbox; preserve passwords, sessions, evidence and pilot settings."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path('hllv_tracker');SRC=Path('.github/hllv-inbox')
def once(s,old,new):
    if s.count(old)!=1:raise RuntimeError('Integration changed: '+old[:90])
    return s.replace(old,new,1)
def main():
    before=json.loads((ROOT/'data/issues.json').read_text());config=(ROOT/'suggestions-config.json').read_bytes()
    assert json.loads(config)['connection_mode']=='operator_only' and not json.loads(config)['enabled']
    protected={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path('.github/hllv-password/password.js'),Path('.github/hllv-password/session.js'),Path('.github/hllv-rehearsal/practice.js')]}
    p=Path('.github/hllv-pilot/suggestions.js');js=p.read_text()
    if 'function mountModeratorInbox(' not in js:
        js=once(js,"!(name==='hllv_rehearsal'&&profile?.role==='moderator')", "!(['hllv_rehearsal','hllv_moderator_inbox','hllv_moderator_decision'].includes(name)&&profile?.role==='moderator')")
        helper=""" function mountModeratorInbox(generation,serial){
  let deskSerial=0,controller=null;
  content('<h2>Private review desk</h2><p class="sg-muted">Review real submissions here. Your private practice is kept separate.</p><nav class="desk-views" aria-label="Review desk views"><button type="button" class="sg-button secondary" id="deskReal" aria-pressed="true">Submitted suggestions</button><button type="button" class="sg-button secondary" id="deskPractice" aria-pressed="false">Private practice</button></nav><div id="moderatorWorkspace"></div>');
  function choose(mode){
   if(controller?.canLeave&&!controller.canLeave())return;
   const ticket=++deskSerial;controller=null;
   el('deskReal').setAttribute('aria-pressed',String(mode==='real'));el('deskPractice').setAttribute('aria-pressed',String(mode==='practice'));
   const host=el('moderatorWorkspace');host.replaceChildren();
   const isCurrent=()=>generation===epoch&&serial===loadSerial&&ticket===deskSerial&&view==='review'&&profile?.role==='moderator'&&!el('suggestionBox').classList.contains('hidden');
   if(mode==='real'){
    if(window.HLLVInbox)controller=HLLVInbox.mount({container:host,rpc,issues,isCurrent});
    else host.textContent='The moderator inbox could not load. Refresh this page; no moderation action was sent.';
   }else if(window.HLLVPractice){
    const practice=document.createElement('div');practice.id='privatePractice';host.appendChild(practice);HLLVPractice.mount({container:practice,rpc,issues,isCurrent});
   }else host.textContent='Private practice could not load. Your saved practice has not been changed.';
  }
  el('deskReal').onclick=()=>choose('real');el('deskPractice').onclick=()=>choose('practice');choose('real');
 }
"""
        js=once(js,' function mountPractice(',helper+' function mountPractice(')
        js=once(js,"    queue=await rpc('hllv_queue');", "    if(profile.role==='moderator'){mountModeratorInbox(generation,serial);return;}\n    queue=await rpc('hllv_queue');")
        p.write_text(js)
    page=ROOT/'index.html';html=page.read_text()
    for name,tag in [('inbox.js','hllv-inbox-module'),('inbox.css','hllv-inbox-style')]:
        raw=(SRC/name).read_bytes();base,ext=name.split('.');asset='assets/'+base+'-'+hashlib.sha256(raw).hexdigest()[:16]+'.'+ext;(ROOT/asset).write_bytes(raw)
        if 'id="'+tag+'"' in html:
            attr='src' if ext=='js' else 'href';html,n=re.subn(r'((?:<script|<link) id="'+tag+'"[^>]*'+attr+'=")[^"]+',lambda m:m[1]+'./'+asset,html);assert n==1
        elif ext=='js':html=once(html,'  <script id="suggestions-module"','  <script id="'+tag+'" src="./'+asset+'"></script>\n  <script id="suggestions-module"')
        else:html=once(html,'</head>','  <link id="'+tag+'" rel="stylesheet" href="./'+asset+'">\n</head>')
    page.write_text(html)
    subprocess.run(['python3','.github/hllv-pilot/install.py'],check=True)
    mf=ROOT/'deployment-manifest.json';manifest=json.loads(mf.read_text())
    manifest['files']=list(dict.fromkeys(manifest['files']+re.findall(r'(?:src|href)="\./([^"#]+)"',page.read_text())))
    mf.write_text(json.dumps(manifest,indent=2)+'\n')
    test=Path('.github/hllv-password/test_browser.py');value=test.read_text()
    if "elif op=='hllv_moderator_inbox'" not in value:
        value=once(value,"            elif op in ['hllv_queue','hllv_board']:data=[]", "            elif op=='hllv_moderator_inbox':data={'phase':'setup','can_moderate':False,'checked_at':'2026-10-09T00:00:00Z','rows':[]}\n            elif op in ['hllv_queue','hllv_board']:data=[]")
        test.write_text(value)
    after=json.loads((ROOT/'data/issues.json').read_text())
    assert {k:v for k,v in before.items() if k!='page_updated_at'}=={k:v for k,v in after.items() if k!='page_updated_at'}
    assert config==(ROOT/'suggestions-config.json').read_bytes()
    assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in protected.items())
    print('INBOX_INSTALLED: working login/session/practice code and game evidence unchanged; public pilot still closed')
if __name__=='__main__':main()
