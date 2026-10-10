"""Guarded staff-login integration. No database grants, real accounts or messages."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path('hllv_tracker');SRC=Path('.github/hllv-operator');JS=Path('.github/hllv-pilot/suggestions.js')
def once(s,old,new):
    if s.count(old)!=1:raise RuntimeError('Integration point changed: '+old[:100])
    return s.replace(old,new,1)
def main():
    before=json.loads((ROOT/'data/issues.json').read_text());page_before=(ROOT/'index.html').read_text()
    s=JS.read_text()
    if 'function validOperatorConfig' not in s:
        s=once(s,"c.connection_mode!=='read_only'","!['read_only','operator_only'].includes(c.connection_mode)")
        helpers=r'''
 function validOperatorConfig(c){return !!(c&&c.enabled===false&&c.connection_mode==='operator_only'&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.supabase_url)&&/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(c.publishable_key)&&c.policy_version==='pilot-2026-10-08');}
 function operatorRead(name){return ['hllv_board','hllv_pilot_status','hllv_profile','hllv_queue'].includes(name);}
 function isAuthCallback(hash){const p=new URLSearchParams(String(hash||'').replace(/^#/,''));return ['access_token','refresh_token','error','error_code','error_description'].some(k=>p.has(k));}
'''
        s=once(s,' function related(',helpers+' function related(')
        s=once(s,"requestEmail='';","requestEmail='',accountEmail='',initializing=false;")
        start=s.index(' function account(){');end=s.index(' function fieldForm(',start)
        s=s[:start]+(SRC/'account.js.txt').read_text()+s[end:]
        s=once(s,"const {data,error}=await client.rpc(name,args);","if(validOperatorConfig(configuration)&&!operatorRead(name))throw new Error('Staff setup is read-only; participant actions and publication remain closed.');const {data,error}=await client.rpc(name,args);")
        s=once(s,"profile?.role==='participant'&&pilot.voting_open","profile?.role==='participant'&&pilot.voting_open&&!validOperatorConfig(configuration)")
        s=once(s,"   if(!profile){content('<h2>Invitation required", "   if(validOperatorConfig(configuration)&&view!=='board'&&view!=='review'){content('<h2>'+ (view==='mine'?'My submissions':'Submit a suggestion') +'</h2><div class=\"sg-empty\"><h3>Participant intake is closed.</h3><p>Staff can sign in above to verify access to the Review desk. Community submissions and voting will open only after the remaining pilot requirements are completed.</p></div>');return;}\n   if(!profile){content('<h2>Invitation required")
        s=once(s,"    content('<h2>Private review desk", "    if(validOperatorConfig(configuration)){content('<h2>Private review desk</h2><p class=\"sg-muted\">Staff access is working. This setup view is read-only: no review decisions, edits, publication or voting can be sent from here.</p>'+ (queue.length?queue.map(s=>'<article class=\"sg-row\"><h3>'+escape(s.title)+'</h3><p>'+escape(s.problem)+'</p><p>'+escape(s.desired_outcome)+'</p><p>'+escape(stateLabel[s.state]||s.state)+'</p></article>').join(''):'<div class=\"sg-empty\"><h3>No submissions awaiting review.</h3><p>The community pilot has not opened yet. Your moderator role does not grant developer-review authority.</p></div>'));return;}\n    content('<h2>Private review desk")
        s=once(s,"if(!root)return;\n  if(!initialized)","if(!root)return;if(initializing)return;\n  if(!initialized)")
        s=once(s,"if(!initialized){initialized=true;","if(!initialized){initialized=true;initializing=true;")
        s=once(s,"if(!validConfig(configuration)){", "if(!validConfig(configuration)&&!validOperatorConfig(configuration)){")
        s=once(s,"    const sdk=await import", "    const callback=isAuthCallback(location.hash);\n    const sdk=await import")
        s=once(s,'detectSessionInUrl:false','detectSessionInUrl:true,flowType:\'implicit\'')
        s=once(s,"client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){epoch++;profile=null;myRows=[];queue=[];board=[];account();if(!root.classList.contains('hidden'))render();}});", "client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){profile=null;accountEmail='';myRows=[];queue=[];board=[];view='board';account();content('<p>Signed out. Private content cleared.</p>');}});")
        s=once(s,'    await loadIdentity();',"    await loadIdentity();\n    if(callback)history.replaceState(null,'',location.pathname+location.search+'#suggestions');")
        s=once(s,"client=null;closedView();}\n  }else", "client=null;closedView();}\n   finally{initializing=false;if(isAuthCallback(location.hash))history.replaceState(null,'',location.pathname+location.search+'#suggestions');}\n  }else")
        s=once(s,'{show,validConfig,validReadOnlyConfig,','{show,validConfig,validOperatorConfig,operatorRead,isAuthCallback,validReadOnlyConfig,')
        JS.write_text(s)
    page=(ROOT/'index.html').read_text()
    if 'const AUTH_RETURN_TO_SUGGESTIONS' not in page:
        needle='    const TRACKER_DATA_URL ='
        page=once(page,needle,"    const AUTH_RETURN_TO_SUGGESTIONS = Boolean(window.HLLVSuggestions?.isAuthCallback(location.hash));\n"+needle)
        page=once(page,"if(location.hash==='#suggestions'){showSuggestions(false);return;}","if(location.hash==='#suggestions'||(AUTH_RETURN_TO_SUGGESTIONS&&window.HLLVSuggestions?.isAuthCallback(location.hash))){showSuggestions(false);return;}")
        page=once(page,"if(location.hash==='#suggestions')showSuggestions(false);","if(location.hash==='#suggestions'||AUTH_RETURN_TO_SUGGESTIONS)showSuggestions(false);")
        if 'name="referrer"' not in page:page=page.replace('<head>','<head>\n  <meta name="referrer" content="no-referrer">',1)
        (ROOT/'index.html').write_text(page)
    cfg=json.loads((ROOT/'suggestions-config.json').read_text())
    if cfg.get('enabled') is not False or cfg.get('connection_mode') not in ['read_only','operator_only']:raise RuntimeError('Pilot configuration changed; reconcile instead of opening it.')
    cfg['connection_mode']='operator_only'
    (ROOT/'suggestions-config.json').write_text(json.dumps(cfg,indent=2)+'\n')
    subprocess.run(['python3','.github/hllv-pilot/install.py'],check=True)
    after=json.loads((ROOT/'data/issues.json').read_text())
    assert {k:v for k,v in before.items() if k!='page_updated_at'}=={k:v for k,v in after.items() if k!='page_updated_at'}
    a=page_before.split('<!-- PATCH NOTES START -->')[1].split('<!-- PATCH NOTES END -->')[0]
    b=(ROOT/'index.html').read_text().split('<!-- PATCH NOTES START -->')[1].split('<!-- PATCH NOTES END -->')[0]
    assert a==b,'Patch archive changed'
    # Old synthetic adapter must model getUser, which the live path now verifies.
    p=Path('.github/hllv-pilot/test_browser.py');test=p.read_text()
    needle='getSession:async()=>({data:{session:hasSession?{}:null}}),'
    if 'getUser:async' not in test:
        test=once(test,needle,needle+"getUser:async()=>({data:{user:hasSession?{email:'fixture@example.org'}:null},error:null}),")
        p.write_text(test)
    print('STAFF_LOGIN_READY: participant enabled=false, operator read-only mode; no role, account, email, database or game-evidence changes')
if __name__=='__main__':main()
