"""Integrate conversations without changing login, registration, votes, or reviewed evidence."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,re,subprocess
ROOT=Path('hllv_tracker');HERE=Path(__file__).parent

def once(s,a,b):
    if s.count(a)!=1:raise RuntimeError('Changed integration point: '+a[:100])
    return s.replace(a,b,1)

def main():
    page=ROOT/'index.html';html=page.read_text()
    if 'id="hllv-thread-module"' in html:raise RuntimeError('Conversations already integrated; update explicitly.')
    data=json.loads((ROOT/'data/issues.json').read_text());original=data.copy()
    protected={p:(ROOT/p).read_bytes() for p in ['official-feed.json','suggestions-config.json','evidence.js']}
    auth_urls=re.findall(r'<script id="hllv-(?:session|password|registration)-module"[^>]*src="([^"]+)"',html)
    for url in auth_urls:protected[url.removeprefix('./')]=(ROOT/url.removeprefix('./')).read_bytes()
    p=Path('.github/hllv-community/app.js');s=p.read_text()
    s=once(s,' const el=id=>', ' let threadController=null;\n const el=id=>')
    s=once(s," function html(value){el('sgContent').innerHTML=value;}"," function html(value){threadController?.dispose();threadController=null;el('sgContent').innerHTML=value;}")
    s=once(s,'async function call(action,payload={})','async function call(action,payload={},functionName=\'hllv_community\')')
    s=once(s,"client.rpc('hllv_community',{action,payload})","client.rpc(functionName,{action,payload})")
    s=once(s,"+related(s)+'</div></article>';","+related(s)+(window.HLLVThread?.publicCards(s)||'')+(profile?.role==='moderator'?'<button type=\"button\" class=\"cb-text-button\" data-board-thread=\"'+esc(s.id)+'\">Open conversation / add moderator comment</button>':'')+'</div></article>';")
    hook="""   window.HLLVThread?.bindPublic({container:el('sgContent'),rpc:(action,payload)=>call(action,payload,'hllv_submission_thread'),isCurrent:()=>t===epoch&&ticket===serial});
   for(const b of el('sgContent').querySelectorAll('[data-board-thread]'))b.onclick=async()=>{if(busy)return;busy=true;try{const r=await call('read',{id:b.dataset.boardThread},'hllv_submission_thread');if(t!==epoch||ticket!==serial)return;view='queue';selected=r.submission;detail();}catch(_){notice('This conversation could not be opened. Refresh and check your moderator access.',true);}finally{busy=false;}};
"""
    s=once(s,"   el('sgContent').querySelectorAll('[data-vote]')",hook+"   el('sgContent').querySelectorAll('[data-vote]')")
    s=once(s,'<button class="sg-button" id="cbReceiptMine">','<button class="sg-button" id="cbReceiptThread">'+"'+(profile?.role==='moderator'?'Conversation &amp; public comments':'Open conversation')+'"+'</button><button class="sg-button" id="cbReceiptMine">')
    s=once(s,"focus();el('cbReceiptMine').onclick", "focus();el('cbReceiptThread').onclick=()=>{view=profile?.role==='moderator'?'queue':'mine';selected=receipt;detail();};el('cbReceiptMine').onclick")
    s=once(s,"+'<div id=\"cbDecisionFeedback\"", "+'<div id=\"submissionThread\"></div><div id=\"cbDecisionFeedback\"")
    s=once(s,"+(s.submitter_note?'<aside class=\"cb-note\"><strong>Moderator reply · private</strong><p>'+esc(s.submitter_note)+'</p></aside>':'')",'')
    start=s.index("+'<details class=\"cb-history\">")
    end=s.index("</details></article>');focus();",start)
    s=s[:start]+"+'</article>');focus();"+s[end+len("</details></article>');focus();"):]
    marker="  el('cbBack').onclick="
    mount="""  const threadEpoch=epoch;
  threadController=window.HLLVThread?.mount({container:el('submissionThread'),submission:s,moderator,
   rpc:(action,payload)=>call(action,payload,'hllv_submission_thread'),isCurrent:()=>threadEpoch===epoch&&selected===s,
   onDirty:hasDraft=>{dirty=hasDraft||!!el('cbModNote')?.value.trim();},onBusy:value=>{busy=value;},
   onRecord:row=>{Object.assign(s,row);const badge=el('sgContent').querySelector('.cb-detail>.cb-tag');if(badge){badge.textContent=states[s.state]||s.state;badge.classList.toggle('approved',s.state==='published');}}});
  const threadDraft=()=>{if(threadController?.hasDraft()){el('cbDecisionFeedback').textContent='Send or clear your conversation draft before making another change.';return true;}return false;};
"""
    s=once(s,marker,mount+marker)
    s=once(s,"async function change(action,payload){if(busy||uncertain)return;", "async function change(action,payload){if(busy||uncertain||threadDraft())return;")
    s=once(s,"el('cbModNote').oninput=()=>dirty=true;", "el('cbModNote').oninput=()=>{dirty=!!el('cbModNote').value.trim()||!!threadController?.hasDraft();};")
    s=once(s,"el('cbCheckDecision').onclick=async()=>{if(busy)return;", "el('cbCheckDecision').onclick=async()=>{if(busy||threadDraft())return;")
    s=once(s,"if(el('cbEdit'))el('cbEdit').onclick=()=>form(s);", "if(el('cbEdit'))el('cbEdit').onclick=()=>{if(!busy&&!threadDraft())form(s);};")
    s=once(s,"s.id,s.version,s.votes,s.approved_at", "s.id,s.version,s.votes,s.approved_at,s.public_comments")
    s=s.replace('new suggestions and votes.', 'new suggestions, votes, and moderator comments.')
    p.write_text(s)
    note='Private replies stay between the submitter and site moderators, even after approval. Only comments deliberately posted as public appear on the Bulletin Board. Conversations retain saved replies, decisions, and wording revisions; no email notifications are sent.'
    html=once(html,'<details id="communityPrivacy"','<p class="cb-small">'+note+'</p>\n<details id="communityPrivacy"')
    def asset(p,prefix,ext):
        b=p.read_bytes();url='assets/'+prefix+'-'+hashlib.sha256(b).hexdigest()[:16]+ext;(ROOT/url).write_bytes(b);return './'+url
    app=asset(p,'community','.js');js=asset(HERE/'thread.js','submission-thread','.js');css=asset(HERE/'thread.css','submission-thread','.css')
    html,n=re.subn(r'(<script id="suggestions-module"[^>]*src=")[^"]+',lambda m:m[1]+app,html);assert n==1
    html=once(html,'  <script id="suggestions-module"','  <script id="hllv-thread-module" src="'+js+'"></script>\n  <script id="suggestions-module"')
    html=once(html,'</head>','<link id="hllv-thread-style" rel="stylesheet" href="'+css+'">\n</head>');page.write_text(html)
    data['page_updated_at']=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    (ROOT/'data/issues.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
    p=ROOT/'deployment-manifest.json';m=json.loads(p.read_text());m['files']=list(dict.fromkeys(m['files']+['suggestions-config.json']+[u.removeprefix('./') for u in re.findall(r'(?:src|href)="(\./[^"]+)"',page.read_text()) if (ROOT/u.removeprefix('./').split('?')[0]).is_file()]));p.write_text(json.dumps(m,indent=2)+'\n')
    assert all((ROOT/p).read_bytes()==b for p,b in protected.items())
    assert {k:v for k,v in original.items() if k!='page_updated_at'}=={k:v for k,v in data.items() if k!='page_updated_at'}
    (ROOT/'reviews/submission-threads.json').write_text(json.dumps({'page_updated_at':data['page_updated_at'],'private_conversation':True,'explicit_public_moderator_comments':True,'legacy_replies_remain_private':True,'newest_first_paginated_history':True,'no_emails_sent':True,'auth_roles_quotas_votes_evidence_and_nightly_unchanged':True},indent=2)+'\n')
    print('THREAD_UI_READY')
if __name__=='__main__':main()
