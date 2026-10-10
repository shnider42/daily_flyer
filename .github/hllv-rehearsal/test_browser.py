"""Public probes plus isolated moderator browser fixture; never send real mail."""
import argparse,json
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',default='chromium',choices=['chromium','webkit']);a=p.parse_args()
cfg=json.loads(Path('hllv_tracker/suggestions-config.json').read_text());BASE=cfg['supabase_url'];assert cfg['connection_mode']=='operator_only' and not cfg['enabled']
req=Request(BASE+'/rest/v1/rpc/hllv_rehearsal',data=b'{}',headers={'apikey':cfg['publishable_key'],'Content-Type':'application/json'})
try:
 with urlopen(req,timeout=15) as r:raise AssertionError('Anonymous practice access unexpectedly succeeded')
except HTTPError as e:assert e.code in (401,403),e.code
with sync_playwright() as pw:
 browser=getattr(pw,a.engine).launch();ctx=browser.new_context();page=ctx.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.goto(a.url+'#suggestions',wait_until='networkidle');expect(page.locator('#sgSignIn')).to_be_attached(timeout=30000);expect(page.locator('#practiceStart')).to_have_count(0);assert not any('/auth/v1/otp' in x or '/auth/v1/verify' in x for x in requests);assert not errors,errors;ctx.close()
 for role in ('moderator','reviewer','participant'):
  ctx=browser.new_context(viewport={'width':1280,'height':900});page=ctx.new_page();errors=[];calls=[];store={'row':None,'failure':False};page.on('pageerror',lambda e:errors.append(str(e)))
  sdk="""export function createClient(){let signed=true,listener=()=>{};return {auth:{getSession:async()=>({data:{session:signed?{}:null},error:null}),getUser:async()=>({data:{user:{email:'practice-fixture@example.invalid'}},error:null}),onAuthStateChange:f=>{listener=f;return{}},signOut:async()=>{signed=false;listener('SIGNED_OUT');return {error:null}}},rpc:async(name,args)=>{let r=await fetch('/__practice_fixture__',{method:'POST',body:JSON.stringify({name,args})});return r.json()}}}"""
  page.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(body=sdk,content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}));page.route(BASE+'/**',lambda r:r.abort())
  def respond(route):
   call=json.loads(route.request.post_data);calls.append(call);name=call['name'];data=None;error=None
   if name=='hllv_profile':data={'role':role}
   elif name=='hllv_pilot_status':data={'phase':'setup','intake_open':False,'voting_open':False}
   elif name in ('hllv_queue','hllv_board'):data=[]
   elif name=='hllv_rehearsal':
    assert role=='moderator';arg=call['args'];action=arg['action']
    if store['failure']:store['failure']=False;error={'message':'Synthetic practice outage'}
    elif action=='get':data=store['row']
    elif action=='remove':store['row']=None
    else:
     old=store['row'];v=(old['version']+1) if old else 1
     if action=='save':r={**arg['payload'],'id':'practice-fixture','version':v,'state':'pending','history':[], 'practice_only':True,'can_publish':False}
     else:r={**old,'state':action,'version':v,'note':arg['payload'].get('note','')}
     r['history']=[*(old['history'] if old else []),{'state':r['state'],'version':v,'at':'2026-10-08T00:00:00Z'}];store['row']=r;data=r
   else:raise AssertionError('Unexpected private/public write: '+name)
   route.fulfill(json={'data':data,'error':error})
  page.route('**/__practice_fixture__',respond);page.goto(a.url+'#suggestions',wait_until='networkidle')
  if role!='moderator':
   expect(page.locator('#practiceStart')).to_have_count(0);assert not any(x['name']=='hllv_rehearsal' for x in calls);assert not errors,errors;ctx.close();continue
  expect(page.locator('#sgAccount')).to_contain_text('moderator');expect(page.locator('#practiceStart')).to_be_visible();assert not any(x['name']=='hllv_rehearsal' for x in calls)
  page.locator('#practiceStart').click();expect(page.locator('#practiceForm')).to_be_visible();page.locator('#practiceExample').click();assert store['row'] is None
  page.locator('[name="practice_ack"]').check();page.locator('#practiceIssue').select_option('HLLV-007');page.get_by_role('button',name='Save private practice',exact=True).click();expect(page.locator('#practiceDecision')).to_be_visible();expect(page.locator('#practiceMessage')).to_contain_text('Saved privately');assert store['row']['practice_only']
  for width in (320,390):page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),width
  page.locator('#practiceState').select_option('shortlisted');page.get_by_role('button',name='Save practice decision',exact=True).click();expect(page.locator('#privatePractice')).to_contain_text('Shortlisted in practice — not sent to anyone')
  page.locator('#practiceEdit').click();page.fill('#practiceTitle','Private practice <img src=x onerror=alert(1)>');page.locator('[name="practice_ack"]').check();page.get_by_role('button',name='Save private practice',exact=True).click();expect(page.locator('#privatePractice')).to_contain_text('Awaiting practice moderation');expect(page.locator('#privatePractice img')).to_have_count(0)
  store['failure']=True;page.locator('#practiceState').select_option('shortlisted');page.get_by_role('button',name='Save practice decision',exact=True).click();expect(page.locator('#practiceMessage')).to_contain_text('could not be completed');expect(page.locator('#practiceDelete')).to_be_enabled()
  page.get_by_role('button',name='Bulletin Board',exact=True).click();expect(page.locator('#sgContent')).not_to_contain_text('Private practice <img');page.get_by_role('button',name='Review desk',exact=True).click();page.locator('#practiceStart').click();expect(page.locator('#practiceDecision')).to_be_visible()
  page.reload(wait_until='networkidle');page.locator('#practiceStart').click();expect(page.locator('#practiceDecision')).to_be_visible();page.once('dialog',lambda d:d.accept());page.locator('#practiceDelete').click();expect(page.locator('#practiceMessage')).to_contain_text('Practice deleted');assert store['row'] is None
  page.get_by_role('button',name='Sign out',exact=True).click();expect(page.locator('#practiceStart')).to_have_count(0);expect(page.locator('#privatePractice')).to_have_count(0);assert not errors,errors;ctx.close()
 browser.close()
print('PRIVATE_PRACTICE_BROWSER_PASS',a.engine,'hosted anonymous denial; synthetic moderator save/revise/decision/reload/delete/signout; reviewer/participant exclusion, escaping, mobile, failure handling; no real Auth or publication calls')
