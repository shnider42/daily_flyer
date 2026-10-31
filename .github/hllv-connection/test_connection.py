"""Actual hosted public-API probes and browsers. Never sends email or creates users."""
import argparse,json
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',choices=['chromium','webkit'],default='chromium');args=p.parse_args()
cfg=json.loads(Path('hllv_tracker/suggestions-config.json').read_text())
assert cfg['enabled'] is False and cfg['connection_mode']=='read_only'
base=cfg['supabase_url'];assert base=='https://uwbhjgvpaetrhfvcpvsg.supabase.co'
headers={'apikey':cfg['publishable_key'],'Content-Type':'application/json'}
def request(path,payload=None,extra=None):
    req=Request(base+path,data=None if payload is None else json.dumps(payload).encode(),headers={**headers,**(extra or {})})
    try:
        with urlopen(req,timeout=15) as r:return r.status,json.load(r)
    except HTTPError as e:
        try:body=json.load(e)
        except Exception:body={}
        return e.code,body
status,state=request('/rest/v1/rpc/hllv_pilot_status',{})
assert status==200 and state['phase']=='setup' and state['intake_open'] is False and state['voting_open'] is False,(status,state)
status,board=request('/rest/v1/rpc/hllv_board',{})
assert status==200 and board==[],(status,board)
# These denial probes have no personal data and never invoke Auth creation.
for name,payload in [('hllv_submit',{'payload':{}}),('hllv_queue',{}),('hllv_my_submissions',{}),('hllv_profile',{}),('hllv_publish_batch',{'suggestions':[]})]:
    code,result=request('/rest/v1/rpc/'+name,payload)
    assert code in (401,403,404),(name,code,result)
for table in ['members','submissions','reviews','votes','audit','board','settings']:
    code,result=request('/rest/v1/'+table+'?select=*',extra={'Accept-Profile':'hllv_private'})
    assert code in (401,403,404,406),(table,code,result)
# Read PUBLIC Auth flags only. Does not verify SMTP, templates or deliverability.
code,auth=request('/auth/v1/settings')
flags={k:auth.get(k) for k in ['disable_signup','mailer_autoconfirm','external']}
print('HOSTED_PUBLIC_API_PASS',json.dumps({'phase':state['phase'],'intake_open':state['intake_open'],'voting_open':state['voting_open'],'board_entries':len(board),'anonymous_write_and_private_reads':'denied','public_auth_settings_status':code,'auth_flags':flags}))
with sync_playwright() as pw:
    browser=getattr(pw,args.engine).launch()
    context=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce')
    page=context.new_page();errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url))
    response=page.goto(args.url,wait_until='networkidle');assert response.status==200
    expect(page.locator('.patch-entry')).to_have_count(8)
    stamp=page.locator('#pageLastUpdated').inner_text()
    page.get_by_role('button',name='Suggestion Box',exact=True).click()
    expect(page.locator('#sgStatus')).to_contain_text('Database connected',timeout=20000)
    expect(page.locator('#sgContent')).to_contain_text('No published suggestions yet.')
    expect(page.locator('#sgAccount input')).to_have_count(0)
    expect(page.locator('[data-sg-view="review"]')).not_to_be_visible()
    for name in ['Submit a suggestion','My submissions']:
        page.get_by_role('button',name=name,exact=True).click()
        expect(page.locator('#sgContent')).to_contain_text('Sign-in is not open yet.')
        expect(page.locator('#sgContent input')).to_have_count(0)
        expect(page.locator('#sgContent button')).to_be_disabled()
    for width in [390,320]:
        page.set_viewport_size({'width':width,'height':844})
        for name in ['Overview','All issues','Suggestion Box']:
            page.get_by_role('button',name=name,exact=True).click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),(width,name)
    page.goto(args.url+'#suggestions',wait_until='networkidle');page.reload(wait_until='networkidle')
    expect(page.locator('#sgStatus')).to_contain_text('Database connected',timeout=20000)
    assert page.locator('#pageLastUpdated').inner_text()==stamp
    external=[u for u in requests if urlparse(u).hostname==urlparse(base).hostname]
    assert external and all('/rest/v1/rpc/hllv_pilot_status' in u or '/rest/v1/rpc/hllv_board' in u for u in external),external
    assert not any('jsdelivr.net' in u or '/auth/v1/' in u for u in requests)
    assert not errors,errors
    # Outages must not be displayed as an empty, healthy board.
    page.goto('about:blank');page.route(base+'/**',lambda r:r.abort())
    page.goto(args.url+'#suggestions',wait_until='networkidle')
    expect(page.locator('#sgContent')).to_contain_text('This view could not be loaded.',timeout=20000)
    expect(page.locator('#sgStatus')).to_have_attribute('data-error','true')
    expect(page.locator('#sgContent input')).to_have_count(0)
    page.get_by_role('button',name='Overview',exact=True).click();expect(page.locator('.patch-entry')).to_have_count(8)
    assert not errors,errors
    browser.close()
print('HOSTED_CONNECTION_BROWSER_PASS',args.engine,'actual read-only RPC, no Auth/email/SDK requests, closed forms, navigation, 320/390px, saved timestamp and outage handling')
