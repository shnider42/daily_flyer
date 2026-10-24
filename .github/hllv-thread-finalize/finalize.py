"""Do not let a thread refresh silently approve wording the moderator hasn't read."""
from pathlib import Path
from datetime import datetime,timezone
import json,re,hashlib,subprocess
root=Path('hllv_tracker');page=root/'index.html';html=page.read_text()
def once(s,a,b):
    if s.count(a)!=1:raise RuntimeError('Changed integration point: '+a[:80])
    return s.replace(a,b,1)
p=Path('.github/hllv-submission-threads/thread.js');s=p.read_text()
s=once(s,"attempt=null,retryAttempt=null,uncertain=false;", "attempt=null,retryAttempt=null,uncertain=false,wordingChanged=false;")
s=once(s,"const update=row=>{if(!live()||!row||row.id!==submission.id)return;Object.assign(submission,row);onRecord(row);};", "const update=row=>{if(!live()||!row||row.id!==submission.id)return;if(row.version!==submission.version){wordingChanged=true;say('The submission wording changed. Return to the list and reopen it before replying or making a decision. Your draft is still here.',true);return;}Object.assign(submission,row);onRecord(row);};")
s=once(s,"if(busy||loading||uncertain||!live())return;const pub=", "if(busy||loading||uncertain||!live())return;if(wordingChanged){say('The submission wording changed. Return to the list and reopen it before replying. Your draft is still here.',true);return;}const pub=")
s=once(s,"return {hasDraft:draft,dispose()", "return {hasDraft:draft,isStale:()=>wordingChanged,dispose()")
p.write_text(s)
a=Path('.github/hllv-community/app.js');s=a.read_text();s=once(s,"const threadDraft=()=>{if(threadController?.hasDraft())", "const threadDraft=()=>{if(threadController?.isStale()){el('cbDecisionFeedback').textContent='The wording changed. Return to the list and reopen this submission before making a decision.';return true;}if(threadController?.hasDraft())");a.write_text(s)
c=Path('.github/hllv-submission-threads/thread.css');c.write_text(c.read_text()+'\n.submission-thread textarea::placeholder{color:var(--muted);opacity:1}\n')
t=Path('.github/hllv-submission-threads/test_browser.py');s=t.read_text()
s=once(s,"mp.evaluate(\"document.documentElement.dataset.theme='\"+theme+\"'\");mp.set_viewport_size", "mp.evaluate(\"value=>{if(document.documentElement.dataset.theme!==value)document.getElementById('themeToggle').click();}\",theme);mp.set_viewport_size")
s=once(s,"pub.evaluate(\"document.documentElement.dataset.theme='\"+theme+\"'\");pub.set_viewport_size", "pub.evaluate(\"value=>{if(document.documentElement.dataset.theme!==value)document.getElementById('themeToggle').click();}\",theme);pub.set_viewport_size")
extra=''' login(mp,memail);mp.locator('[data-cb-view="board"]').click();mp.locator('[data-board-thread="'+sid+'"]').click();expect(mp.locator('#threadChecked')).to_contain_text('Checked')
 store[sid].update(version=2,title='Changed wording awaiting a fresh review',state='pending',updated_at=stamp(),supporters=set())
 mp.locator('#threadRefresh').click();expect(mp.locator('#threadFeedback')).to_contain_text('wording changed');mp.once('dialog',lambda d:d.accept());mp.locator('#cbApprove').click();expect(mp.locator('#cbDecisionFeedback')).to_contain_text('wording changed');assert store[sid]['state']=='pending'
 mp.locator('#cbBack').click();mp.locator('[data-open="'+sid+'"]').click();expect(mp.locator('.cb-detail h2')).to_contain_text('Changed wording');expect(mp.locator('#threadChecked')).to_contain_text('Checked');mp.once('dialog',lambda d:d.accept());mp.locator('#cbApprove').click();expect(mp.locator('.cb-receipt')).to_contain_text('Approved and published');assert store[sid]['version']==2
 print('WORDING_REFRESH_GUARD_PASS',a.engine,'Thread refresh never silently authorizes a newer unseen wording version')
'''
s=once(s," assert not errs+merrs+perrs,errs+merrs+perrs\n print('THREAD_BROWSER_PASS'",extra+" assert not errs+merrs+perrs,errs+merrs+perrs\n print('THREAD_BROWSER_PASS'");t.write_text(s)
def asset(path,prefix,ext):
    b=path.read_bytes();u='assets/'+prefix+'-'+hashlib.sha256(b).hexdigest()[:16]+ext;(root/u).write_bytes(b);return './'+u
for ident,path,prefix,ext in [('hllv-thread-module',p,'submission-thread','.js'),('suggestions-module',a,'community','.js'),('hllv-thread-style',c,'submission-thread','.css')]:
    u=asset(path,prefix,ext);attr='href' if ext=='.css' else 'src';html,n=re.subn(r'(<(?:script|link) id="'+ident+'"[^>]*'+attr+'=")[^"]+',lambda m:m[1]+u,html);assert n==1
page.write_text(html)
p=root/'data/issues.json';data=json.loads(p.read_text());data['page_updated_at']=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z');p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
p=root/'deployment-manifest.json';m=json.loads(p.read_text());m['files']=list(dict.fromkeys(m['files']+['suggestions-config.json']+[u.removeprefix('./') for u in re.findall(r'(?:src|href)="(\./[^"]+)"',page.read_text()) if (root/u.removeprefix('./').split('?')[0]).is_file()]));p.write_text(json.dumps(m,indent=2)+'\n')
p=root/'reviews/submission-threads.json';d=json.loads(p.read_text());d.update(page_updated_at=data['page_updated_at'],stale_wording_requires_reopen=True,real_theme_toggle_tested=True);p.write_text(json.dumps(d,indent=2)+'\n')
print('Conversation wording guard ready. Authentication and hosted schema unchanged.')
