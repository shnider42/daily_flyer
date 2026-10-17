"""Add member registration UI; no hosted settings, roles, keys, or records modified."""
from pathlib import Path
from datetime import datetime,timezone
import re,json,hashlib,subprocess
ROOT=Path('hllv_tracker');SRC=Path(__file__).parent

def one(s,a,b):
    if b in s:return s
    assert s.count(a)==1,'Changed integration point: '+a[:90]
    return s.replace(a,b,1)

def main():
    page=ROOT/'index.html';html=page.read_text()
    if 'id="hllv-registration-module"' in html:raise RuntimeError('Registration already installed; update explicitly, do not replay')
    before=json.loads((ROOT/'data/issues.json').read_text())
    protected={p:(ROOT/p).read_bytes() for p in ['evidence.js','official-feed.json']}
    session_url=re.search(r'<script id="hllv-session-module"[^>]+src="([^"]+)"',html)[1]
    session=(ROOT/session_url.removeprefix('./')).read_bytes()
    p=Path('.github/hllv-password/password.js');s=p.read_text()
    s=s.replace('/* Account forms use the existing, verified Supabase user. No registration/admin API. */','/* Account forms use Supabase Auth. Member signup is separate; no administrator API. */')
    s=one(s," const knownRole=", " const roleName=r=>r==='participant'?'Member':r;\n const knownRole=")
    s=s.replace('${esc(profile.role)}</span>','${esc(roleName(profile.role))}</span>')
    s=one(s,"<strong>Signed in as an invited ${esc(profile.role)}</strong>","<strong>${profile.role==='participant'?'Signed in as a Member':'Signed in as an invited '+esc(profile.role)}</strong>")
    s=one(s,"'<span>Not signed in</span><button type=\"button\" data-account=\"sign-in\">Sign in</button>'", "'<span>Not signed in</span><div class=\"account-bar-actions\"><button type=\"button\" data-account=\"sign-in\">Sign in</button>'+((typeof window!==\"undefined\"&&window.HLLVRegistration)?'<button type=\"button\" data-account=\"create-account\">Create account</button>':'')+'</div>'")
    s=one(s,"  const host=active;\n  const panel=", "  const host=active;\n  if(target==='create-account'&&window.HLLVRegistration?.open())return;\n  const register=host.querySelector('#sgCreateAccount');if(register)register.hidden=true;\n  const signin=host.querySelector('#sgSignIn');if(signin)signin.hidden=false;\n  const panel=")
    s=one(s,"  active=container;", "  if(typeof window!=='undefined')window.HLLVRegistration?.clear();\n  active=container;")
    s=s.replace('Invited accounts only. Use your email and your Infierno Liberado password.','Use your verified email and your Infierno Liberado password.')
    s=s.replace('Invited email address','Your account email address')
    s=one(s,"  let requestEmail='',codeType='email';", "  if(window.HLLVRegistration?.enabled()){\n   const button=document.createElement('button');button.type='button';button.className='sg-button secondary';button.id='sgGoCreateAccount';button.textContent='New here? Create account';button.onclick=()=>open('create-account');find('sgSignIn').appendChild(button);\n   HLLVRegistration.mount({container,client,isCurrent});\n  }\n  let requestEmail='',codeType='email';")
    s=one(s,"  if(operation==='password-login')return", "  if(operation==='password-login'&&code==='email_not_confirmed')return 'Verify your email before signing in. Use Create account → Need a verification email? to request a fresh confirmation.';\n  if(operation==='password-login')return")
    p.write_text(s)
    p=Path('.github/hllv-community/app.js');s=p.read_text()
    s=one(s,"   const callback=isAuthCallback(location.hash),recover=", "   window.HLLVRegistration?.configure(cfg);\n   const callback=isAuthCallback(location.hash),signupReturn=new URLSearchParams(location.hash.replace(/^#/, '')).get('type')==='signup',recover=")
    s=s.replace('Submissions stay private until a moderator approves them. Use an existing site account; pilot accounts are currently invited.','Create a Member account and verify your email, or sign in. Submissions stay private until moderator approval.')
    s=one(s,'<button id="cbLogin" class="sg-button">Sign in to submit</button></div>','<div class="sg-actions"><button id="cbLogin" class="sg-button">Sign in to submit</button><button id="cbCreateAccount" class="sg-button secondary">Create account</button></div></div>')
    s=one(s,"el('cbLogin').onclick=signInForAction;return;}\n   form(null);", "el('cbLogin').onclick=signInForAction;el('cbCreateAccount').onclick=()=>{authVisible=true;requested='create-account';auth();};return;}\n   form(null);")
    s=one(s,"   await loadIdentity();if(callback)history.replaceState", "   await loadIdentity();if(callback&&signupReturn){if(profile)notice('Email verified. You are signed in. Choose Submit a suggestion or support an entry on the Bulletin Board.');else{authVisible=true;requested='create-account';auth();notice('Email verification could not be confirmed in this tab. Try signing in, or request a fresh verification email.',true);}}\n   if(callback)history.replaceState")
    p.write_text(s)
    p=Path('.github/hllv-community/section.html');section=p.read_text()
    section=section.replace('Existing site accounts can sign in. Account invitations and moderator appointments are controlled by the site owner. No new accounts are automatically registered by a suggestion or vote.','Create a Member account using your email and a unique site password, then verify your email before submitting or voting. Members can see only their own private submissions and moderator replies. Only the site owner appoints moderators. A submission or vote does not create an account by itself.')
    p.write_text(section)
    html=one(html,'Existing site accounts can sign in. Account invitations and moderator appointments are controlled by the site owner. No new accounts are automatically registered by a suggestion or vote.','Create a Member account using your email and a unique site password, then verify your email before submitting or voting. Members can see only their own private submissions and moderator replies. Only the site owner appoints moderators. A submission or vote does not create an account by itself.')
    def asset(path,prefix,ext):
        b=path.read_bytes();name='assets/'+prefix+'-'+hashlib.sha256(b).hexdigest()[:16]+ext;(ROOT/name).write_bytes(b);return './'+name
    registration=asset(SRC/'registration.js','registration','.js');css=asset(SRC/'registration.css','registration','.css')
    password=asset(Path('.github/hllv-password/password.js'),'password','.js');app=asset(Path('.github/hllv-community/app.js'),'community','.js')
    for tag,url in [('hllv-password-module',password),('suggestions-module',app)]:
        html,n=re.subn(r'(<script id="'+tag+r'"[^>]*src=")[^"]+',lambda m:m[1]+url,html);assert n==1
    html=one(html,'  <script id="hllv-password-module"','  <script id="hllv-registration-module" src="'+registration+'"></script>\n  <script id="hllv-password-module"')
    html=one(html,'</head>','<link id="hllv-registration-style" rel="stylesheet" href="'+css+'">\n</head>')
    page.write_text(html)
    config=ROOT/'suggestions-config.json';cfg=json.loads(config.read_text());cfg['account_registration']='self_service';cfg['email_verification_required']=True;config.write_text(json.dumps(cfg,indent=2)+'\n')
    updated={**before,'page_updated_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')}
    (ROOT/'data/issues.json').write_text(json.dumps(updated,ensure_ascii=False,indent=2)+'\n');subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
    m=ROOT/'deployment-manifest.json';manifest=json.loads(m.read_text());manifest['files']=list(dict.fromkeys(manifest['files']+['suggestions-config.json']+[u[2:] for u in re.findall(r'(?:src|href)="(\./[^"]+)"',page.read_text()) if (ROOT/u[2:].split('?')[0]).is_file()]))
    m.write_text(json.dumps(manifest,indent=2)+'\n')
    assert (ROOT/session_url[2:]).read_bytes()==session
    for path,content in protected.items():assert (ROOT/path).read_bytes()==content
    assert {k:v for k,v in updated.items() if k!='page_updated_at'}=={k:v for k,v in before.items() if k!='page_updated_at'}
    (ROOT/'reviews/member-registration.json').write_text(json.dumps({'page_updated_at':updated['page_updated_at'],'self_service_registration_ui':True,'requires_email_verification':True,'visible_participant_name':'Member','moderator_permissions_unchanged':True,'member_submission_limit_per_24_hours':3,'moderator_daily_limit':None,'session_module_unchanged':True,'reviewed_evidence_and_nightly_unchanged':True,'auth_settings_changed':False,'external_email_delivery_verified':False},indent=2)+'\n')
    print('MEMBER_REGISTRATION_READY: public Auth signup; verification required; no role or Auth-setting changes')
if __name__=='__main__':main()
