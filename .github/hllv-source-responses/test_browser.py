"""Synthetic response-feed tests against the real UI; no real Auth mutations."""
import argparse,copy,json
from datetime import datetime,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',default='chromium',choices=['chromium','webkit']);p.add_argument('--system-chromium',action='store_true');a=p.parse_args()
at=datetime.now(timezone.utc).isoformat();url='https://steamcommunity.com/app/3079210/discussions/1/123/'
r={'id':'100','response_url':url+'?ctp=2#c100','published_at':'2026-08-29T15:00:00Z','source_edited_at':None,'author_label':'Verified support','source_category':'Team17 Support','change_kind':'baseline','last_seen_at':at,'observed_this_run':True,'excerpt':'An example response opening, not a claim about a real fix.'}
t={'url':url,'title':'Example tracked topic <img src=x onerror=alert(1)>','tracked_issue_ids':['HLLV-001'],'state':'complete','pages_checked':2,'pages_expected':2,'comments_seen':16,'comments_expected':16,'last_complete_at':at,'replies':[r],'identities_pending':[]}
monitor={'schema_version':1,'state':'partial','last_attempt_at':at,'last_complete_at':None,'threads_total':2,'threads_complete':1,'identities_pending':1,'threads':[t,{**t,'url':url.replace('/123/','/124/'),'title':'Unavailable example','state':'unavailable','pages_checked':0,'pages_expected':None,'comments_seen':0,'comments_expected':None,'failure_kind':'http_503','last_complete_at':None,'replies':[]}]}
feed={'schema_version':1,'state':'ok','last_success_at':at,'items':[],'link_checks':{},'response_monitor':monitor}
SDK='export function createClient(){return {auth:{onAuthStateChange:()=>({}),getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{enabled:true,rows:[],total:0}})}}'
with sync_playwright() as pw:
 b=getattr(pw,a.engine).launch(**({'executable_path':'/usr/bin/chromium'} if a.system_chromium else {}));ctx=b.new_context(viewport={'width':1280,'height':900});errors=[];posts=[]
 ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(body=SDK,content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}));ctx.route('https://*.supabase.co/**',lambda r:r.abort())
 ctx.route('**/official-feed.json',lambda route:route.fulfill(json=feed));page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:posts.append(r.url) if r.method!='GET' else None)
 page.goto(a.url,wait_until='networkidle');host=page.locator('#staffResponses');expect(host).to_contain_text('1 of 2');expect(host).to_contain_text('Coverage is incomplete');expect(host.locator('img')).to_have_count(0)
 host.locator('.response-entry>summary').first.click();expect(host).to_contain_text('Historical baseline');expect(host.locator('a',has_text='Read this staff response')).to_have_attribute('href',url+'?ctp=2#c100')
 page.select_option('#responseFilter','changes');expect(page.locator('#staffResponseList')).to_contain_text('No new or edited');expect(page.locator('#staffResponseList')).to_contain_text('Incomplete coverage')
 updated=copy.deepcopy(monitor);updated['threads'][0]['replies']+=[{**r,'id':'101','response_url':url+'#c101','published_at':'2026-10-14T15:00:00Z','change_kind':'edited','last_changed_at':at,'excerpt':'Changed synthetic response.'}]
 page.evaluate('(d)=>HLLVResponses.render(d)',updated);expect(host.locator('.response-entry')).to_have_count(1);host.locator('.response-entry>summary').first.click();expect(host).to_contain_text('Change detected')
 page.select_option('#responseFilter','all');page.select_option('#responseOrder','oldest');expect(host.locator('.response-entry time').first).to_have_attribute('datetime','2026-08-29T15:00:00Z')
 for theme in ['dark','light']:
  page.evaluate('(t)=>{if(document.documentElement.dataset.theme!==t)document.getElementById("themeToggle").click()}',theme)
  for width in [320,390,768,1280]:
   page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),(theme,width)
  page.set_viewport_size({'width':390,'height':844});Path('artifacts').mkdir(exist_ok=True);host.screenshot(path='artifacts/staff-responses-'+theme+'-'+a.engine+'.png')
 updated['last_attempt_at']='2026-01-01T00:00:00Z';updated['state']='complete';page.evaluate('(d)=>HLLVResponses.render(d)',updated);expect(host).to_contain_text('overdue');expect(host.locator('.response-coverage')).to_have_attribute('data-complete','false')
 page.evaluate('HLLVResponses.unavailable()');expect(host).to_contain_text('could not be loaded');assert not posts,posts;assert not errors,errors
 print('RESPONSE_BROWSER_PASS',a.engine,'partial/stale/unavailable coverage, baseline vs changes, ordering, direct response links, safe text and mobile dark/light; no Auth or private-data requests')
 b.close()
