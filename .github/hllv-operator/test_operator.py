"""Staff login UI plus hosted public reads. Login fixtures never send real emails."""
import argparse,json
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',choices=['chromium','webkit'],default='chromium');a=p.parse_args()
cfg=json.loads(Path('hllv_tracker/suggestions-config.json').read_text())
assert cfg['enabled'] is False and cfg['connection_mode']=='operator_only'
BASE=cfg['supabase_url'];assert BASE=='https://uwbhjgvpaetrhfvcpvsg.supabase.co'
def req(path,data=None,extra=None):
 q=Request(BASE+path,data=None if data is None else json.dumps(data).encode(),headers={'apikey':cfg['publishable_key'],'Content-Type':'application/json',**(extra or {})})
 try:
  with urlopen(q,timeout=15) as r:return r.status,json.load(r)
 except HTTPError as e:return e.code,{}
code,state=req('/rest/v1/rpc/hllv_pilot_status',{});assert code==200 and state['phase']=='setup' and state['intake_open'] is False and state['voting_open'] is False
code,board=req('/rest/v1/rpc/hllv_board',{});assert code==200 and board==[]
for name,payload in [('hllv_profile',{}),('hllv_queue',{}),('hllv_submit',{'payload':{}}),('hllv_publish_batch',{'suggestions':[]})]:
 code,_=req('/rest/v1/rpc/'+name,payload);assert code in (401,403,404),(name,code)
for table in ['members','submissions','reviews','votes','audit']:
 code,_=req('/rest/v1/'+table+'?select=*',extra={'Accept-Profile':'hllv_private'});assert code in (401,403,404,406)
code,auth=req('/auth/v1/settings');print('HOSTED_SETUP_BOUNDARY',json.dumps({'setup':True,'intake':False,'voting':False,'private_anonymous_reads':'denied','disable_signup':auth.get('disable_signup'),'email_confirmation_required':auth.get('mailer_autoconfirm') is False}))
with sync_playwright() as pw:
 browser=getattr(pw,a.engine).launch();context=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce');page=context.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.goto(a.url,wait_until='networkidle');expect(page.locator('.patch-entry')).to_have_count(8);stamp=page.locator('#pageLastUpdated').inner_text()
 page.get_by_role('button',name='Suggestion Box',exact=True).click();expect(page.locator('#sgStatus')).to_contain_text('Database connected',timeout=30000)
 expect(page.locator('#sgContent')).to_contain_text('No published suggestions yet.')
 page.locator('#sgSignIn summary').click();expect(page.locator('#sgEmail')).to_be_visible();expect(page.locator('[data-sg-view="review"]')).not_to_be_visible()
 for name in ['Submit a suggestion','My submissions']:
  page.get_by_role('button',name=name,exact=True).click();expect(page.locator('#sgContent')).to_contain_text('Participant intake is closed.');expect(page.locator('#sgContent input')).to_have_count(0)
 for width in [390,320]:
  page.set_viewport_size({'width':width,'height':844})
  for name in ['Overview','All issues','Suggestion Box']:
   page.get_by_role('button',name=name,exact=True).click();assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'),(width,name)
 page.reload(wait_until='networkidle');expect(page.locator('#sgSignIn')).to_be_attached(timeout=30000);assert page.locator('#pageLastUpdated').inner_text()==stamp
 assert not any('/auth/v1/otp' in r or '/auth/v1/verify' in r or '/auth/v1/signup' in r for r in requests), 'Real email/auth write attempted'
 assert not errors,errors
 page.close();context.close()
 # Synthetic SDK exercises app behavior; genuine hosted Auth credentials are never used.
 def fixture(role='moderator',initial=False,otp_error=False,callback_error=False):
  context=browser.new_context(reduced_motion='reduce');page=context.new_page();calls=[];errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  code='''export function createClient(url,key,options){
   window.__staffOptions=options.auth;window.__staffOTP=null;
   const callback=new URLSearchParams(location.hash.slice(1));
   let session=INITIAL || (options.auth.detectSessionInUrl&&callback.has('access_token'));let listener=()=>{};
   return {auth:{
    getSession:async()=>{if(callback.has('error')||CALLBACK_ERROR)return {data:{session:null},error:{message:'fixture internal error must not be shown'}};if(session)history.replaceState(null,'',location.pathname+location.search);return {data:{session:session?{}:null},error:null}},
    getUser:async()=>({data:{user:session?{email:'staff-fixture@example.invalid'}:null},error:null}),
    onAuthStateChange:f=>{listener=f;return {data:{subscription:{unsubscribe(){}}}}},
    signInWithOtp:async arg=>{window.__staffOTP=arg;return {data:{user:null,session:null},error:OTP_ERROR?{status:429,code:'over_email_send_rate_limit'}:null}},
    verifyOtp:async()=>{session=true;return {data:{session:{}},error:null}},
    signOut:async()=>{session=false;listener('SIGNED_OUT');return {error:null}}
   },rpc:async(name,args)=>{const r=await fetch('/__staff_fixture__',{method:'POST',body:JSON.stringify({name,args})});return await r.json()}}
  }'''.replace('INITIAL',json.dumps(initial)).replace('OTP_ERROR',json.dumps(otp_error)).replace('CALLBACK_ERROR',json.dumps(callback_error))
  page.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(body=code,content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}))
  # Catch all provider traffic in fixtures, even if app code changes unexpectedly.
  page.route(BASE+'/**',lambda r:r.abort())
  def answer(route):
   body=json.loads(route.request.post_data);calls.append(body);name=body['name']
   if name=='hllv_profile':data={'role':role}
   elif name=='hllv_pilot_status':data=state
   elif name=='hllv_queue':data=[{'id':'fixture-row','title':'PRIVATE FIXTURE ONLY','problem':'Private fixture never saved on the hosted service.','desired_outcome':'Test account boundaries.','state':'pending'}]
   else:data=[]
   route.fulfill(json={'data':data,'error':None})
  page.route('**/__staff_fixture__',answer)
  return context,page,calls,errs
 ctx,page,calls,errs=fixture();page.goto(a.url+'#suggestions',wait_until='networkidle');page.locator('#sgSignIn summary').click();page.fill('#sgEmail','staff-fixture@example.invalid');page.get_by_role('button',name='Email me a sign-in link or code',exact=True).click();expect(page.locator('#sgCode')).to_be_visible()
 opts=page.evaluate('window.__staffOTP');assert opts['options']['shouldCreateUser'] is False;assert opts['options']['emailRedirectTo']==a.url.rstrip('/')+'/'
 page.fill('#sgCode','123456');page.get_by_role('button',name='Verify code',exact=True).click();expect(page.locator('#sgAccount')).to_contain_text('moderator');expect(page.locator('#sgContent')).to_contain_text('PRIVATE FIXTURE ONLY');expect(page.locator('#sgContent')).to_contain_text('read-only');expect(page.locator('#sgContent form')).to_have_count(0);expect(page.locator('#sgPublish')).to_have_count(0)
 page.get_by_role('button',name='Sign out',exact=True).click();expect(page.locator('#sgContent')).not_to_contain_text('PRIVATE FIXTURE ONLY');expect(page.locator('[data-sg-view="review"]')).not_to_be_visible();assert all(c['name'] in ['hllv_profile','hllv_pilot_status','hllv_board','hllv_queue'] for c in calls);assert not errs,errs;ctx.close()
 ctx,page,calls,errs=fixture();page.goto(a.url+'#access_token=synthetic_fixture_only&refresh_token=synthetic_fixture_only&type=magiclink',wait_until='networkidle');expect(page.locator('#sgAccount')).to_contain_text('moderator');expect(page.locator('#suggestionBox')).to_be_visible();assert page.url.endswith('#suggestions');assert 'synthetic_fixture_only' not in page.inner_text('body');assert page.evaluate('window.__staffOptions.detectSessionInUrl') is True;assert not errs,errs;ctx.close()
 ctx,page,calls,errs=fixture(role='participant',initial=True);page.goto(a.url+'#suggestions',wait_until='networkidle');expect(page.locator('#sgStatus')).to_contain_text('no active staff invitation');expect(page.locator('[data-sg-view="review"]')).not_to_be_visible();assert not any(c['name']=='hllv_queue' for c in calls);assert not errs,errs;ctx.close()
 ctx,page,calls,errs=fixture(otp_error=True);page.goto(a.url+'#suggestions',wait_until='networkidle');page.locator('#sgSignIn summary').click();page.fill('#sgEmail','staff-fixture@example.invalid');page.get_by_role('button',name='Email me a sign-in link or code',exact=True).click();expect(page.locator('#sgStatus')).to_contain_text('Too many sign-in');expect(page.locator('#sgCodeForm')).not_to_be_visible();assert not errs,errs;ctx.close()
 ctx,page,calls,errs=fixture(callback_error=True);page.goto(a.url+'#error=access_denied&error_description=untrusted_description',wait_until='networkidle');expect(page.locator('#sgStatus')).to_contain_text('could not be verified');assert page.url.endswith('#suggestions');assert 'untrusted_description' not in page.inner_text('body');assert not errs,errs;ctx.close()
 browser.close()
print('STAFF_BROWSER_PASS',a.engine,'real SDK initialization/public backend, staff sign-in UI, closed intake, mobile, saved timestamp; isolated code/link/role denial/rate-limit/error/signout fixtures. No real email or tokens used.')
