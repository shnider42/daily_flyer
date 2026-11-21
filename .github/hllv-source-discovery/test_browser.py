"""Real interface with synthetic source data only; never uses real sign-in."""
import argparse,copy,json
from datetime import datetime,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',default='chromium',choices=['chromium','webkit']);a=p.parse_args()
at=datetime.now(timezone.utc).isoformat();url='https://steamcommunity.com/app/3079210/discussions/1/123/'
r={'id':'100','response_url':url+'?ctp=2#c100','published_at':'2026-08-29T15:00:00Z','source_edited_at':None,'author_label':'Verified support','source_category':'Team17 Support','change_kind':'baseline','last_seen_at':at,'observed_this_run':True,'excerpt':'Synthetic support response, not evidence of a real fix.'}
t={'url':url,'title':'Existing source example','tracked_issue_ids':['HLLV-001'],'state':'complete','pages_checked':2,'pages_expected':2,'comments_seen':16,'comments_expected':16,'last_complete_at':at,'replies':[r],'identities_pending':[]}
newurl=url.replace('/123/','/125/');nt={**t,'url':newurl,'title':'New discussion <img src=x onerror=alert(1)>','tracked_issue_ids':[],'source_origin':'discovered','observed_this_run':True,'replies':[{**r,'response_url':newurl+'?ctp=2#c100'}]}
d={'enabled':True,'state':'partial','last_attempt_at':at,'pages_per_forum':2,'thread_limit_per_pass':24,'listings':[{'url':'https://steamcommunity.com/app/3079210/discussions/1/','label':'Report a Problem','pages_checked':2,'pages_planned':2,'state':'window_checked'}],'threads_attempted_this_run':1,'threads_complete_this_run':1,'awaiting_first_complete_scan':5,'not_fully_scanned_this_run':5,'zero_reply_leads_not_scanned':1,'threads':[nt]}
aff={'state':'not_connected','content_collection_enabled':False,'channels':[{'name':'SoulSniper','channel_url':'https://www.youtube.com/@SoulSniperYT','directory_status':'listed','last_directory_verified_at':at}]}
m={'schema_version':1,'state':'complete','last_attempt_at':at,'last_complete_at':at,'threads_total':1,'threads_complete':1,'threads':[t],'discovery':d,'affiliate_monitor':aff}
feed={'schema_version':1,'state':'ok','last_success_at':at,'items':[],'link_checks':{},'response_monitor':m}
SDK='export function createClient(){return {auth:{onAuthStateChange:()=>({}),getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{enabled:true,rows:[],total:0}})}}'
with sync_playwright() as pw:
 b=getattr(pw,a.engine).launch();ctx=b.new_context(viewport={'width':1280,'height':900});errors=[];posts=[]
 ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(body=SDK,content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}));ctx.route('https://*.supabase.co/**',lambda r:r.abort())
 ctx.route('**/official-feed.json',lambda r:r.fulfill(json=feed));page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:posts.append(r.url) if r.method!='GET' else None)
 page.goto(a.url,wait_until='networkidle');host=page.locator('#staffResponses');expect(host.locator('img')).to_have_count(0)
 expect(page.locator('#discoveryCoverage')).to_contain_text('5 candidates await');expect(page.locator('#discoveryCoverage .response-coverage')).to_have_attribute('data-complete','false')
 page.select_option('#responseScope','discovered');expect(host.locator('.response-entry')).to_have_count(1);host.locator('.response-entry>summary').first.click();expect(host).to_contain_text('not yet linked');expect(host).to_contain_text('Historical baseline')
 page.select_option('#responseFilter','changes');expect(page.locator('#staffResponseList')).to_contain_text('No new or edited');expect(page.locator('#staffResponseList')).to_contain_text('Incomplete coverage')
 page.select_option('#responseFilter','all');page.locator('#affiliateCoverage>summary').click();expect(page.locator('#affiliateCoverage')).to_contain_text('Replies not monitored');expect(page.locator('#affiliateCoverage')).to_contain_text('content monitoring not connected')
 retained=copy.deepcopy(m);retained['discovery']['threads'][0]['observed_this_run']=False;retained['discovery']['threads'][0]['replies'][0]['observed_this_run']=False
 page.evaluate('(m)=>HLLVResponses.render(m)',retained);host.locator('.response-entry>summary').first.click();expect(host).to_contain_text('Previously collected; not reverified')
 held=copy.deepcopy(m);held['discovery']['threads'][0]['replies'][0]['content_review']={'state':'needs_review','reason':'Synthetic review hold'};held['discovery']['threads'][0]['replies'][0]['excerpt']='MUST-NOT-DISPLAY'
 page.evaluate('(m)=>HLLVResponses.render(m)',held);expect(host).not_to_contain_text('MUST-NOT-DISPLAY');host.locator('.response-entry>summary').first.click();expect(host).to_contain_text('Preview withheld')
 for theme in ['dark','light']:
  page.evaluate('(t)=>{if(document.documentElement.dataset.theme!==t)document.getElementById("themeToggle").click()}',theme)
  for width in [320,390,768,1280]:
   page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),(theme,width)
  page.set_viewport_size({'width':390,'height':844});page.locator('#affiliateCoverage>summary').click();Path('artifacts').mkdir(exist_ok=True);host.screenshot(path='artifacts/discovery-'+theme+'-'+a.engine+'.png')
  page.locator('#affiliateCoverage>summary').click()
 stale=copy.deepcopy(m);stale['discovery']['state']='window_checked';stale['discovery']['last_attempt_at']='2026-01-01T00:00:00Z'
 page.evaluate('(m)=>HLLVResponses.render(m)',stale);expect(page.locator('#discoveryCoverage')).to_contain_text('overdue');expect(page.locator('#discoveryCoverage .response-coverage')).to_have_attribute('data-complete','false')
 assert not errors,errors;assert not posts,posts
 print('DISCOVERY_BROWSER_PASS',a.engine,'source separation, baseline, backlog, stale scan, affiliate not-connected, XSS escaping, review holds, mobile dark/light; no private-data mutations')
 b.close()
