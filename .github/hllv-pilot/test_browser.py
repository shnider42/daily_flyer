"""Closed production shell and a synthetic managed-auth adapter; SQL tests are separate."""
import argparse,json
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',default='chromium');args=p.parse_args()
with sync_playwright() as pw:
 browser=getattr(pw,args.engine).launch();page=browser.new_page(viewport={'width':1280,'height':900},reduced_motion='reduce')
 # Explicit disconnected fixture; hosted connection has its own tests.
 page.route('**/suggestions-config.json',lambda r:r.fulfill(json={'enabled':False}))
 errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:external.append(r.url) if 'supabase.co' in r.url or 'jsdelivr.net' in r.url else None)
 page.goto(args.url,wait_until='networkidle');expect(page.locator('.top-links [data-page]')).to_have_count(3)
 timestamp=page.locator('#pageLastUpdated').inner_text();expect(page.locator('.patch-entry')).to_have_count(8)
 page.get_by_role('button',name='Suggestion Box',exact=True).click();expect(page.locator('#suggestionBox')).to_be_visible();expect(page.locator('#landing')).not_to_be_visible()
 expect(page.locator('#sgContent')).to_contain_text('not connected yet');expect(page.locator('#sgContent input')).to_have_count(0)
 page.get_by_role('button',name='Submit a suggestion',exact=True).click();expect(page.locator('#sgContent button')).to_be_disabled()
 page.get_by_role('button',name='My submissions',exact=True).click();expect(page.locator('#sgContent')).to_contain_text('not connected yet');expect(page.locator('[data-sg-view="review"]')).not_to_be_visible()
 for width in (390,320):
  page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),('overflow',width)
  for name in ('Overview','All issues','Suggestion Box'):
   page.get_by_role('button',name=name,exact=True).click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),('nav overflow',width,name)
 page.goto(args.url+'#suggestions',wait_until='networkidle');expect(page.locator('#suggestionBox')).to_be_visible()
 page.reload(wait_until='networkidle');expect(page.locator('#suggestionBox')).to_be_visible();assert page.locator('#pageLastUpdated').inner_text()==timestamp
 page.get_by_role('button',name='Overview',exact=True).click();page.locator('#patchNotesJump').click();expect(page.locator('#patch-notes')).to_be_visible()
 page.locator('.patch-entry summary').first.click();expect(page.locator('.patch-entry').first).to_have_attribute('open','')
 assert not external,external
 # A hash-only navigation reuses the loaded module; load a new document to
 # genuinely exercise the failed-asset path rather than weaken the assertion.
 page.goto('about:blank')
 page.route('**/suggestions-*.js',lambda route:route.abort())
 page.goto(args.url+'#suggestions',wait_until='networkidle')
 assert page.evaluate('typeof HLLVSuggestions')=='undefined'
 expect(page.locator('#sgStatus')).to_contain_text('could not load')
 page.get_by_role('button',name='All issues',exact=True).click();expect(page.locator('#home')).to_be_visible();assert not errors,errors;page.close()
 # Explicit test fixture, never a production auth bypass or real email request.
 page=browser.new_page();calls=[];fixture_errors=[]
 page.on('pageerror',lambda e:fixture_errors.append(str(e)))
 cfg={'enabled':True,'supabase_url':'https://qa-fixture.supabase.co','publishable_key':'sb_publishable_qa_fixture_only','participant_contact':'fixture@example.org','retention_notice':'QA fixture privacy notice for isolated browser testing.','policy_version':'pilot-2026-10-08'}
 page.route('**/suggestions-config.json',lambda r:r.fulfill(json=cfg))
 sdk="""export function createClient(){let hasSession=true;return {auth:{getSession:async()=>({data:{session:hasSession?{}:null}}),onAuthStateChange:()=>{},signOut:async()=>{hasSession=false;return{}},signInWithOtp:async()=>({}),verifyOtp:async()=>({})},rpc:async(name,args)=>{const r=await fetch('/__qa_rpc__',{method:'POST',body:JSON.stringify({name,args})});return {data:await r.json(),error:null}}}}"""
 page.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'},body=sdk))
 mine=[]
 def qa(route):
  body=json.loads(route.request.post_data);calls.append(body);name=body['name']
  if name=='hllv_profile':data={'role':'participant'}
  elif name=='hllv_pilot_status':data={'phase':'intake','intake_open':True,'voting_open':False,'policy_version':cfg['policy_version']}
  elif name=='hllv_submit':
   row={**body['args']['payload'],'id':'qa-private','state':'pending','version':1,'owner_accepted_version':1};mine.append(row);data={'id':'qa-private','state':'pending','version':1}
  elif name=='hllv_my_submissions':data=mine
  else:data=[]
  route.fulfill(json=data)
 page.route('**/__qa_rpc__',qa);page.goto(args.url+'#suggestions',wait_until='networkidle');expect(page.locator('#sgAccount')).to_contain_text('participant')
 page.get_by_role('button',name='Submit a suggestion',exact=True).click();page.fill('#sgTitle','QA private suggestion');page.fill('#sgProblem','This synthetic private wording must not be sent to any real service.');page.fill('#sgOutcome','Make the QA controls more understandable.');page.locator('[name="consent"]').check();page.get_by_role('button',name='Submit privately',exact=True).click()
 expect(page.locator('#sgContent')).to_contain_text('QA private suggestion');assert any(c['name']=='hllv_submit' for c in calls)
 page.get_by_role('button',name='Sign out',exact=True).click();expect(page.locator('#sgContent')).not_to_contain_text('QA private suggestion');assert not fixture_errors,fixture_errors
 page.close();browser.close()
 print('PILOT_BROWSER_PASS',args.engine,'closed shell, 3 routes, disabled forms, no auth requests while closed, mobile, timestamp, patch archive, true missing-module fallback, synthetic participant flow and sign-out clearing')
