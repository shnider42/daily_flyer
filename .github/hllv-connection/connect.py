"""Connect the installed pilot to its dedicated backend in read-only setup mode.
No auth credentials, invitations, private records or publication authority are created.
"""
from pathlib import Path
import json
import subprocess

SRC=Path('.github/hllv-pilot/suggestions.js')
ROOT=Path('hllv_tracker')

def once(s,old,new):
    if s.count(old)!=1:
        raise RuntimeError('Reconcile changed integration point: '+old[:100])
    return s.replace(old,new,1)

before=json.loads((ROOT/'data/issues.json').read_text())
s=SRC.read_text()
if 'function validReadOnlyConfig' not in s:
    s=once(s,"c.enabled===true&&", "c.enabled===true&&c.connection_mode!=='read_only'&&")
    insert=r'''
 // Setup connection only: no Auth SDK, identity lookup, email form or write RPC.
 function validReadOnlyConfig(c){return !!(c&&c.enabled===false&&c.connection_mode==='read_only'&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.supabase_url)&&/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(c.publishable_key));}
 function readOnlyClient(c){
  if(!validReadOnlyConfig(c))throw new Error('Invalid read-only connection.');
  return {rpc:async name=>{
   if(!['hllv_pilot_status','hllv_board'].includes(name))return {data:null,error:{message:'Sign-in and private actions are not enabled.'}};
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{
    const response=await fetch(c.supabase_url+'/rest/v1/rpc/'+name,{method:'POST',credentials:'omit',cache:'no-store',headers:{apikey:c.publishable_key,'Content-Type':'application/json'},body:'{}',signal:controller.signal});
    if(!response.ok)throw new Error('The Suggestion Box database could not be reached. Please retry.');
    const data=await response.json();
    if(name==='hllv_board'&&!Array.isArray(data))throw new Error('Unexpected board response.');
    if(name==='hllv_pilot_status'&&(!data||typeof data.phase!=='string'||typeof data.intake_open!=='boolean'||typeof data.voting_open!=='boolean'))throw new Error('Unexpected pilot status.');
    return {data,error:null};
   }catch(_){return {data:null,error:{message:'The Suggestion Box database could not be reached. No submission or vote was sent.'}};}
   finally{clearTimeout(timer);}
  }};
 }
'''
    s=once(s,' function related(',insert+' function related(')
    s=once(s,"  if(!client){el('sgAccount').replaceChildren();return;}","  if(!client){el('sgAccount').replaceChildren();return;}\n  if(validReadOnlyConfig(configuration)){el('sgAccount').innerHTML='<p class=\"sg-muted\">Read-only setup connection. Invitation sign-in is not enabled yet.</p>';return;}")
    s=once(s,"configuration=await r.json();if(!validConfig(configuration))", "configuration=await r.json();if(validReadOnlyConfig(configuration)){client=readOnlyClient(configuration);account();await render();return;}if(!validConfig(configuration))")
    s=once(s,"message(pilot.phase==='setup'?", "message(pilot.phase==='setup'?")
    s=once(s,"'Pilot setup: intake and voting are closed.'", "'Database connected. Pilot setup: intake and voting are closed.'")
    s=once(s,"if(!profile){content('<h2>Invitation required</h2>","if(!profile&&validReadOnlyConfig(configuration)){content('<h2>'+ (view==='mine'?'My submissions':'Submit a suggestion') +'</h2><div class=\"sg-empty\"><h3>Sign-in is not open yet.</h3><p>The private database is connected. Email sign-in, participant notices and authorized reviewer access still need to be configured and tested before anyone can submit.</p><p>No email addresses or suggestions are being collected by this page.</p></div><button class=\"sg-button secondary\" type=\"button\" disabled>Pilot sign-in — not open yet</button>');return;}\n   if(!profile){content('<h2>Invitation required</h2>")
    # The SDK returns most auth errors in a resolved result, not by rejecting.
    s=once(s,"await client.auth.signInWithOtp({email:requestEmail,options:{shouldCreateUser:false}});message(","const {error}=await client.auth.signInWithOtp({email:requestEmail,options:{shouldCreateUser:false}});if(error)throw error;message(")
    s=once(s,'{show,validConfig,escape,related,sorted,boardMarkup}','{show,validConfig,validReadOnlyConfig,readOnlyClient,escape,related,sorted,boardMarkup}')
    SRC.write_text(s)
config_path=ROOT/'suggestions-config.json'
cfg=json.loads(config_path.read_text())
if cfg.get('enabled') is not False:
    raise RuntimeError('Do not replace an already activated pilot configuration.')
cfg.update(connection_mode='read_only',supabase_url='https://uwbhjgvpaetrhfvcpvsg.supabase.co',publishable_key='sb_publishable_S_ZARhEa6AK4BJyG6_Lhmw_tsCUFOn5')
config_path.write_text(json.dumps(cfg,indent=2)+'\n')
# Retain the original disconnected/no-network test as an explicit fixture.
p=Path('.github/hllv-pilot/test_browser.py');t=p.read_text()
if '# Explicit disconnected fixture' not in t:
    t=once(t," errors=[];external=[]", " # Explicit disconnected fixture; hosted connection has its own tests.\n page.route('**/suggestions-config.json',lambda r:r.fulfill(json={'enabled':False}))\n errors=[];external=[]")
    p.write_text(t)
subprocess.run(['python3','.github/hllv-pilot/install.py'],check=True)
after=json.loads((ROOT/'data/issues.json').read_text())
assert {k:v for k,v in before.items() if k!='page_updated_at'}=={k:v for k,v in after.items() if k!='page_updated_at'}
print('CONNECTED_CONFIGURATION_READY: read-only backend; no Auth, invitations or intake enabled')
