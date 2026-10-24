"""Install password UI without changing users, Auth configuration or pilot permissions."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re, subprocess
ROOT=Path('hllv_tracker'); SRC=Path('.github/hllv-password')
def once(s,old,new):
    if s.count(old)!=1: raise RuntimeError('Integration point changed: '+old[:100])
    return s.replace(old,new,1)
def main():
    before=json.loads((ROOT/'data/issues.json').read_text())
    config=(ROOT/'suggestions-config.json').read_bytes()
    assert json.loads(config)['connection_mode']=='operator_only' and not json.loads(config)['enabled']
    path=Path('.github/hllv-pilot/suggestions.js'); js=path.read_text()
    if 'HLLVSession.create()' not in js:
        js=once(js,"accountEmail='',initializing=false;","accountEmail='',initializing=false;\n let persistence=null,pendingAccountTarget='',identityTimer=null,logoutInProgress=false;")
        start=js.index(' function account(){');end=js.index(' function mountPractice(',start)
        js=js[:start]+(SRC/'account-integration.txt').read_text()+js[end:]
        old="client=sdk.createClient(configuration.supabase_url,configuration.publishable_key,{auth:{persistSession:true,storage:sessionStorage,storageKey:'hllv-pilot-session',detectSessionInUrl:true,flowType:'implicit',autoRefreshToken:true}});"
        new="""if(!window.HLLVSession||!window.HLLVPassword)throw new Error('Account module unavailable');
    persistence=HLLVSession.create();
    HLLVPassword.markRecovery(new URLSearchParams(location.hash.replace(/^#/,'' )).get('type')==='recovery');
    client=sdk.createClient(configuration.supabase_url,configuration.publishable_key,{auth:{persistSession:true,storage:persistence.storage,storageKey:persistence.key,detectSessionInUrl:true,flowType:'implicit',autoRefreshToken:true}});
    persistence.onChange(refreshIdentitySoon);"""
        js=once(js,old,new)
        old="client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){profile=null;accountEmail='';myRows=[];queue=[];board=[];view='board';account();content('<p>Signed out. Private content cleared.</p>');}});"
        new="""client.auth.onAuthStateChange(event=>{
     if(event==='PASSWORD_RECOVERY'){HLLVPassword.markRecovery(true);if(!initializing)refreshIdentitySoon();}
     if(event==='SIGNED_OUT'){epoch++;loadSerial++;profile=null;accountEmail='';myRows=[];queue=[];board=[];view='board';content('<p>Signed out. Private content cleared.</p>');HLLVPassword.status();if(!logoutInProgress)refreshIdentitySoon();}
    });"""
        js=once(js,old,new)
        js=once(js,'  }else await render();','  }else {account();await render();}')
        js=once(js,'return Object.freeze({show,validConfig,','return Object.freeze({show,requestAccount,signOut,validConfig,')
        js=once(js,"client=null;closedView();}","client=null;window.HLLVPassword?.status({available:false});closedView();}")
        path.write_text(js)
    page=ROOT/'index.html';html=page.read_text()
    files=[]
    for name,tag in [('session.js','hllv-session-module'),('password.js','hllv-password-module')]:
        data=(SRC/name).read_bytes();asset='assets/'+name.removesuffix('.js')+'-'+hashlib.sha256(data).hexdigest()[:16]+'.js'
        (ROOT/asset).write_bytes(data);files.append(asset)
        if f'id="{tag}"' in html:
            html,n=re.subn(r'(<script id="'+tag+r'"[^>]*src=")[^"]+',lambda m:m[1]+'./'+asset,html);assert n==1
        else:html=once(html,'  <script id="suggestions-module"','  <script id="'+tag+'" src="./'+asset+'"></script>\n  <script id="suggestions-module"')
    css=(SRC/'account.css').read_bytes();asset='assets/account-'+hashlib.sha256(css).hexdigest()[:16]+'.css';(ROOT/asset).write_bytes(css);files.append(asset)
    if 'id="hllv-account-style"' in html:
        html,n=re.subn(r'(<link id="hllv-account-style"[^>]*href=")[^"]+',lambda m:m[1]+'./'+asset,html);assert n==1
    else:html=once(html,'</head>','  <link id="hllv-account-style" rel="stylesheet" href="./'+asset+'">\n</head>')
    if 'id="hllvAccountBar"' not in html:
        html=once(html,'  <div class="page-freshness"','  <div id="hllvAccountBar" class="account-bar" aria-label="Account"><span>Checking sign-in…</span></div>\n  <div class="page-freshness"')
        handlers="""    document.addEventListener('hllv-account-open',event=>{window.HLLVSuggestions?.requestAccount(event.detail);showSuggestions(true);});
    document.addEventListener('hllv-account-signout',()=>window.HLLVSuggestions?.signOut());
    if(!AUTH_RETURN_TO_SUGGESTIONS&&location.hash!=='#suggestions')window.HLLVSuggestions?.show([]);
"""
        html=once(html,"    if(location.hash==='#suggestions'||AUTH_RETURN_TO_SUGGESTIONS)showSuggestions(false);",handlers+"    if(location.hash==='#suggestions'||AUTH_RETURN_TO_SUGGESTIONS)showSuggestions(false);")
    html=html.replace('This pilot uses a tab-scoped sign-in session, not public browser storage for your submissions.','Keep me signed in is optional. Open tabs can share a session; other browsers and devices require their own login. Your submissions are not stored in browser storage.')
    page.write_text(html)
    updated={**before,'page_updated_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')}
    (ROOT/'data/issues.json').write_text(json.dumps(updated,ensure_ascii=False,indent=2)+'\n')
    subprocess.run(['python3','.github/hllv-pilot/install.py'],check=True)
    manifest_file=ROOT/'deployment-manifest.json';manifest=json.loads(manifest_file.read_text())
    practice=re.search(r'<script id="practice-module" src="\./([^"]+)"',html)
    if practice:files.append(practice[1])
    manifest['files']=list(dict.fromkeys(manifest['files']+files))
    manifest_file.write_text(json.dumps(manifest,indent=2)+'\n')
    after=json.loads((ROOT/'data/issues.json').read_text())
    assert {k:v for k,v in before.items() if k!='page_updated_at'}=={k:v for k,v in after.items() if k!='page_updated_at'}
    assert (ROOT/'suggestions-config.json').read_bytes()==config
    print('PASSWORD_UI_PREPARED: existing user identity, data and pilot configuration unchanged')
if __name__=='__main__':main()
