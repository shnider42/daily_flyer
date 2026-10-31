"""Integrated inbox browser fixtures. Public probes never send email or use real credentials."""
import argparse,copy,json
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',choices=['chromium','webkit'],default='chromium');a=p.parse_args()
cfg=json.loads(Path('hllv_tracker/suggestions-config.json').read_text());BASE=cfg['supabase_url']
assert cfg['connection_mode']=='operator_only' and cfg['enabled'] is False
for name,body in [('hllv_moderator_inbox',{}),('hllv_moderator_decision',{'suggestion':'00000000-0000-0000-0000-000000000000','expected_version':1,'expected_updated_at':'2026-01-01T00:00:00Z','decision':'pending','note':'Anonymous denial probe','duplicate_of':None})]:
 try:
  with urlopen(Request(BASE+'/rest/v1/rpc/'+name,data=json.dumps(body).encode(),headers={'apikey':cfg['publishable_key'],'Content-Type':'application/json'}),timeout=15) as r:raise AssertionError('Anonymous private access succeeded')
 except HTTPError as e:assert e.code in (401,403),(name,e.code)
SDK="""export function createClient(){let signed=true,listener=()=>{};return {auth:{getSession:async()=>({data:{session:signed?{}:null},error:null}),getUser:async()=>({data:{user:signed?{id:'test-user',email:'inbox-fixture@example.invalid'}:null},error:null}),onAuthStateChange:f=>{listener=f;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{signed=false;listener('SIGNED_OUT');return {error:null}}},rpc:async(name,args)=>{let r=await fetch('/__inbox_fixture__',{method:'POST',body:JSON.stringify({name,args})});return r.json()}}}"""
row={'id':'fixture-one','version':1,'owner_accepted_version':1,'state':'pending','kind':'suggestion','title':'INBOX FIXTURE controls','problem':'PRIVATE TEST TEXT <img src=x onerror=alert(1)>','desired_outcome':'Explain the controls.','related_issue':'HLLV-007','created_at':'2026-10-08T00:00:00Z','updated_at':'2026-10-08T00:00:00Z','public_visible':False,'history':[],'submitter_note':''}
with sync_playwright() as pw:
 browser=getattr(pw,a.engine).launch()
 for role,phase in [('moderator','setup'),('moderator','review'),('reviewer','setup'),('participant','setup')]:
  ctx=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=ctx.new_page();errors=[];calls=[];store={'rows':[copy.deepcopy(row)],'lost':False,'failread':False,'tick':0}
  page.on('pageerror',lambda e:errors.append(str(e)))
  ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(body=SDK,content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}));ctx.route(BASE+'/**',lambda r:r.abort())
  def answer(route):
   body=json.loads(route.request.post_data);calls.append(body);name=body['name'];args=body.get('args') or {};error=None
   if name=='hllv_profile':data={'role':role}
   elif name=='hllv_pilot_status':data={'phase':'setup','intake_open':False,'voting_open':False}
   elif name in ('hllv_queue','hllv_board'):data=[]
   elif name=='hllv_moderator_inbox':
    data={'phase':phase,'can_moderate':phase=='review','checked_at':'2026-10-09T00:00:00Z','rows':copy.deepcopy(store['rows'])}
    if store['failread']:error={'message':'Synthetic read failure'}
   elif name=='hllv_moderator_decision':
    assert phase=='review' and role=='moderator';s=store['rows'][0];assert args['expected_updated_at']==s['updated_at'];assert args['expected_version']==s['version'];store['tick']+=1
    s.update(state=args['decision'],submitter_note=args['note'],updated_at=f"2026-10-09T00:00:{store['tick']:02d}Z")
    data={k:s[k] for k in ['id','state','version','updated_at','submitter_note','public_visible']}
    if store['lost']:error={'message':'Synthetic lost save response'};store['lost']=False
   elif name=='hllv_rehearsal':assert args['action']=='get';data=None
   else:raise AssertionError('Unexpected operation: '+name)
   route.fulfill(json={'data':data,'error':error})
  ctx.route('**/__inbox_fixture__',answer)
  page.goto(a.url+'#suggestions',wait_until='networkidle')
  if role!='moderator':
   expect(page.locator('#deskReal')).to_have_count(0);assert not any(c['name']=='hllv_moderator_inbox' for c in calls);assert not errors;ctx.close();continue
  expect(page.locator('#deskReal')).to_be_visible();expect(page.locator('[data-mi-id]')).to_have_count(1)
  page.locator('#miSearch').fill('no matching submission');expect(page.locator('#miRows')).to_contain_text('No matching');page.locator('#miSearch').fill('HLLV-007');expect(page.locator('[data-mi-id]')).to_have_count(1)
  page.locator('[data-mi-id]').click();expect(page.locator('#miBody')).to_contain_text('PRIVATE TEST TEXT');expect(page.locator('#miBody img')).to_have_count(0)
  if phase=='setup':
   expect(page.locator('#miForm')).to_have_count(0);expect(page.locator('#miBody')).to_contain_text('Live decisions are disabled')
  else:
   assert page.locator('#miDecision').input_value()=='';page.locator('#miDecision').select_option('needs_information');page.fill('#miNote','Please clarify the platform.');page.locator('#miSave').click();expect(page.locator('#miStatus')).to_contain_text('Moderation saved');expect(page.locator('#miStateLabel')).to_have_text('Needs clarification')
   store['lost']=True;page.locator('#miDecision').select_option('shortlisted');page.fill('#miNote','Clear enough for the shortlist.');page.locator('#miSave').click();expect(page.locator('#miCheck')).to_be_visible();expect(page.locator('#miSave')).to_be_disabled();assert page.locator('#miNote').input_value()=='Clear enough for the shortlist.'
   writes=sum(c['name']=='hllv_moderator_decision' for c in calls);page.locator('#miCheck').click();expect(page.locator('#miStateLabel')).to_have_text('Shortlisted');assert sum(c['name']=='hllv_moderator_decision' for c in calls)==writes
   page.once('dialog',lambda d:d.accept())
  page.locator('#deskPractice').click();expect(page.locator('#practiceStart')).to_be_visible();expect(page.locator('#miBody')).to_have_count(0)
  page.locator('#deskReal').click();expect(page.locator('[data-mi-id]')).to_have_count(1)
  for width in [320,390,1280]:page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),width
  page.reload(wait_until='networkidle');expect(page.locator('[data-mi-id]')).to_have_count(1)
  store['rows']=[];page.locator('#miRefresh').click();expect(page.locator('#miRows')).to_contain_text('No community submissions received yet.');expect(page.locator('#miRows')).to_contain_text('Private practice')
  store['failread']=True;page.locator('#deskPractice').click();page.locator('#deskReal').click();expect(page.locator('#moderatorWorkspace')).to_contain_text('Inbox unavailable');expect(page.locator('#moderatorWorkspace')).not_to_contain_text('No community submissions received yet.')
  page.locator('#globalSignOut').click();expect(page.locator('#moderatorWorkspace')).to_have_count(0);expect(page.locator('#sgAccount')).to_contain_text('Sign in');assert not errors,errors
  assert all(c['name'] in ['hllv_profile','hllv_pilot_status','hllv_board','hllv_queue','hllv_moderator_inbox','hllv_moderator_decision','hllv_rehearsal'] for c in calls)
  ctx.close()
 browser.close()
print('INBOX_BROWSER_PASS',a.engine,'integrated synthetic roles, real/private separation, filters, detail, scope, phase gate, save receipt, lost-response recovery without resubmission, safe text, reload, 320px layout, signout, error vs empty state. Hosted anonymous API denied; no real mail or accounts used.')
