"""Password/session UI tests. All identities, credentials and Auth responses are synthetic.
--standalone exercises the modules and account integration without the repository page.
Without it, the same checks exercise the installed tracker. Never sends real Auth mail.
"""
import argparse,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',choices=['chromium','webkit'],default='chromium');p.add_argument('--standalone',action='store_true');a=p.parse_args()
SRC=Path(__file__).parent
BASE=a.url
EMAIL='moderator@example.invalid';PW='Synthetic-test-only-12345'
SDK=r"""export function createClient(url,key,options){
 const st=options.auth.storage,sk=options.auth.storageKey;let listener=()=>{},callbackHandled=false;
 const invoke=async(operation,payload={})=>{const r=await fetch('/__auth_fixture__',{method:'POST',body:JSON.stringify({operation,payload})});return r.json()};
 const session=async()=>{const raw=await st.getItem(sk);return raw?JSON.parse(raw):null;};
 const save=async s=>{await st.setItem(sk,JSON.stringify(s));};
 return {auth:{
  onAuthStateChange:f=>{listener=f;return {data:{subscription:{unsubscribe(){}}}}},
  getSession:async()=>{const cb=new URLSearchParams(location.hash.slice(1));if(cb.has('access_token')&&!callbackHandled){callbackHandled=true;await save({access_token:'SYNTHETIC',refresh_token:'SYNTHETIC',user:{id:'fixture-user',email:'moderator@example.invalid'}});if(cb.get('type')==='recovery')listener('PASSWORD_RECOVERY');}return {data:{session:await session()},error:null}},
  getUser:async()=>({data:{user:(await session())?.user||null},error:null}),
  signInWithPassword:async arg=>{const r=await invoke('password-login',arg);if(!r.error){await save(r.data.session);listener('SIGNED_IN');}return r;},
  updateUser:async arg=>invoke('password-save',arg),
  resetPasswordForEmail:async(email,opts)=>invoke('reset-email',{email,...opts}),
  signInWithOtp:async arg=>invoke('email-login',arg),
  verifyOtp:async arg=>{const r=await invoke('verify',arg);if(!r.error)await save(r.data.session);return r;},
  signOut:async()=>{await st.removeItem(sk);listener('SIGNED_OUT');return {error:null}}
 },rpc:async(name,args)=>invoke(name,args)}
}"""

def shell():
    integration=(SRC/'account-integration.txt').read_text()
    js="""let client,profile=null,accountEmail='',epoch=0,loadSerial=0,myRows=[],queue=[],board=[],view='board',persistence,pendingAccountTarget='',identityTimer,logoutInProgress=false,initialized=true,initializing=false;
const el=id=>document.getElementById(id);const content=html=>el('sgContent').innerHTML=html;const message=(s)=>el('sgStatus').textContent=s;
const configuration={};function validOperatorConfig(){return true}function validReadOnlyConfig(){return false}
async function rpc(name,args){let r=await client.rpc(name,args);if(r.error)throw r.error;return r.data;}
async function render(){await rpc('hllv_pilot_status');if(profile)await rpc('hllv_queue');content(profile?'<h2>Private review desk</h2>No submissions awaiting review.':'<h2>Bulletin Board</h2>No published suggestions yet.');}
"""+integration+"""
persistence=HLLVSession.create();const sdk=await import('https://cdn.jsdelivr.net/fixture.mjs');client=sdk.createClient('', '', {auth:{storage:persistence.storage,storageKey:persistence.key}});persistence.onChange(refreshIdentitySoon);
HLLVPassword.markRecovery(new URLSearchParams(location.hash.slice(1)).get('type')==='recovery');
document.addEventListener('hllv-account-open',e=>{requestAccount(e.detail);account();render()});document.addEventListener('hllv-account-signout',signOut);
await loadIdentity();
"""
    return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__account.css"><style>body{margin:0;font-family:system-ui;background:#f4f1e8}.sg-form{display:grid;gap:10px}#sgAccount,#sgContent{max-width:900px;margin:auto;padding:20px}input,button{font:inherit;min-width:0;box-sizing:border-box}.sg-actions{display:flex;gap:10px}button{padding:12px}.sg-check{display:flex;align-items:center;gap:8px}</style></head><body><div id="hllvAccountBar" class="account-bar"></div><div id="suggestionBox"><button data-sg-view="review" hidden>Review desk</button><p id="sgStatus"></p><div id="sgAccount"></div><div id="sgContent"></div></div><script src="/__session.js"></script><script src="/__password.js"></script><script type="module">'+js+'</script></body></html>'

with sync_playwright() as pw:
    opts={}
    if a.engine=='chromium' and os.environ.get('CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
    browser=getattr(pw,a.engine).launch(**opts)
    def context(role='moderator',email_error=False):
        ctx=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce');calls=[];errors=[]
        ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(body=SDK,content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}))
        ctx.route('https://*.supabase.co/**',lambda r:r.abort())
        if a.standalone:
            ctx.route(BASE+'**',lambda r:r.fulfill(body=shell().replace('https://cdn.jsdelivr.net/fixture.mjs','/__fixture_sdk.mjs'),content_type='text/html'))
            ctx.route('**/__fixture_sdk.mjs',lambda r:r.fulfill(body=SDK,content_type='application/javascript'))
            for route,filename,mime in [('**/__session.js','session.js','application/javascript'),('**/__password.js','password.js','application/javascript'),('**/__account.css','account.css','text/css')]:
                ctx.route(route,lambda r,f=filename,t=mime:r.fulfill(body=(SRC/f).read_text(),content_type=t))
        def respond(route):
            body=json.loads(route.request.post_data);op=body['operation'];payload=body.get('payload') or {};calls.append(body)
            user={'id':'fixture-user','email':EMAIL};session={'user':user,'access_token':'SYNTHETIC-NOT-A-REAL-TOKEN','refresh_token':'SYNTHETIC'}
            error=None
            if op=='password-login':
                data={'session':session};error=None if payload.get('email')==EMAIL and payload.get('password')==PW else {'code':'invalid_credentials'}
            elif op=='password-save':data={'user':user}
            elif op=='verify':data={'session':session};error=None if payload.get('token')=='123456' else {'code':'otp_expired'}
            elif op in ['email-login','reset-email']:data={};error={'status':429,'code':'over_email_send_rate_limit'} if email_error else None
            elif op=='hllv_profile':data={'role':role}
            elif op=='hllv_pilot_status':data={'phase':'setup','intake_open':False,'voting_open':False}
            elif op in ['hllv_queue','hllv_board']:data=[]
            else:raise AssertionError('Unexpected operation: '+op)
            route.fulfill(json={'data':data,'error':error})
        ctx.route('**/__auth_fixture__',respond)
        ctx.on('page',lambda page:page.on('pageerror',lambda e:errors.append(str(e))))
        return ctx,calls,errors
    def signin(page,remember=False):
        page.goto(BASE+'#suggestions',wait_until='networkidle');expect(page.locator('#sgPasswordLogin')).to_be_visible()
        page.fill('#sgLoginEmail',EMAIL);page.fill('#sgLoginPassword',PW)
        if remember:page.locator('#authRemember').check()
        page.get_by_role('button',name='Sign in with password',exact=True).click()
        expect(page.locator('#hllvAccountBar')).to_contain_text('Signed in')
        expect(page.locator('#sgAccount')).to_contain_text('invited moderator')

    ctx,calls,errors=context();page=ctx.new_page();signin(page)
    assert not any(c['operation'] in ['email-login','reset-email'] for c in calls)
    other=ctx.new_page();other.goto(BASE+'#suggestions',wait_until='networkidle');expect(other.locator('#sgAccount')).to_contain_text('invited moderator')
    page.locator('#hllvAccountBar [data-account="password"]').click();expect(page.locator('#sgNewPassword')).to_be_visible()
    page.fill('#sgNewPassword','A-new-synthetic-password-123');page.fill('#sgConfirmPassword','Different-test-password-123')
    page.get_by_role('button',name='Save password',exact=True).click();expect(page.locator('#authFeedback')).to_contain_text('do not match');assert not any(c['operation']=='password-save' for c in calls)
    page.fill('#sgConfirmPassword','A-new-synthetic-password-123');page.locator('#authRemember').check();page.get_by_role('button',name='Save password',exact=True).click()
    expect(page.locator('#authFeedback')).to_contain_text('Password saved');assert page.locator('#sgNewPassword').input_value()==''
    keys=page.evaluate('Object.keys(localStorage).map(k=>localStorage[k]).join(" ")');assert 'A-new-synthetic-password-123' not in keys
    for width in [390,320]:
        page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),('overflow',width)
    page.reload(wait_until='networkidle');expect(page.locator('#sgAccount')).to_contain_text('moderator')
    page.locator('#globalSignOut').click();expect(page.locator('#sgPasswordLogin')).to_be_visible();expect(other.locator('#sgPasswordLogin')).to_be_visible()
    assert not errors,errors;ctx.close()

    ctx,calls,errors=context();page=ctx.new_page();signin(page,remember=True);saved=ctx.storage_state();ctx.close()
    ctx,calls,errors=context();page=ctx.new_page();page.goto(BASE+'#suggestions',wait_until='networkidle')
    expect(page.locator('#sgPasswordLogin')).to_be_visible()
    for origin in saved.get('origins',[]):
        page.evaluate('(entries)=>entries.forEach(e=>localStorage.setItem(e.name,e.value))',origin.get('localStorage',[]))
    page.reload(wait_until='networkidle');expect(page.locator('#sgAccount')).to_contain_text('moderator');ctx.close()

    ctx,calls,errors=context();page=ctx.new_page();page.goto(BASE+'#suggestions',wait_until='networkidle');expect(page.locator('#sgPasswordLogin')).to_be_visible()
    page.fill('#sgLoginEmail',EMAIL);page.fill('#sgLoginPassword','incorrect-test-password');page.get_by_role('button',name='Sign in with password',exact=True).click();expect(page.locator('#authFeedback')).to_contain_text('not confirmed');expect(page.locator('#sgSecurity')).to_have_count(0);assert not errors;ctx.close()

    ctx,calls,errors=context(email_error=True);page=ctx.new_page();page.goto(BASE+'#suggestions',wait_until='networkidle');page.locator('#sgPasswordHelp summary').click();page.fill('#sgEmail',EMAIL);page.get_by_role('button',name='Email me a sign-in link or code',exact=True).click();expect(page.locator('#authFeedback')).to_contain_text('Email sending is temporarily rate-limited');expect(page.locator('#sgCode')).to_be_visible();assert not errors;ctx.close()

    ctx,calls,errors=context();page=ctx.new_page();page.goto(BASE+'#access_token=synthetic&refresh_token=synthetic&type=recovery',wait_until='networkidle');expect(page.locator('#sgSecurity')).to_have_attribute('open','');expect(page.locator('#sgNewPassword')).to_be_visible();assert not errors;ctx.close()

    ctx,calls,errors=context();page=ctx.new_page();page.goto(BASE+'#suggestions',wait_until='networkidle');page.locator('#sgPasswordHelp summary').click();page.fill('#sgEmail',EMAIL);page.locator('#sgResetPassword').click();expect(page.locator('#authFeedback')).to_contain_text('request accepted');assert any(c['operation']=='reset-email' for c in calls)
    page.fill('#sgCode','123456');page.get_by_role('button',name='Verify code',exact=True).click();expect(page.locator('#sgSecurity')).to_have_attribute('open','');assert any(c['operation']=='verify' and c['payload']['type']=='recovery' for c in calls);assert not errors;ctx.close()

    ctx,calls,errors=context(role='participant');page=ctx.new_page();page.goto(BASE+'#access_token=synthetic&refresh_token=synthetic&type=magiclink',wait_until='networkidle');expect(page.locator('#sgStatus')).to_contain_text('no active staff invitation');expect(page.locator('#sgSecurity')).to_have_count(0);assert not any(c['operation']=='hllv_queue' for c in calls);assert not errors;ctx.close()
    browser.close()
print('PASSWORD_BROWSER_PASS',a.engine,'standalone' if a.standalone else 'integrated tracker','synthetic password sign-in/setup, same-account update, cross-tab login/logout, persistence, separate browser, mismatch/invalid login, recovery link/code, email limits, participant rejection, mobile. No real credentials, email, or community writes.')
