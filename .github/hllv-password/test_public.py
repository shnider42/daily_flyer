"""Signed-out SDK smoke test. No real password, code, email request or private data."""
import argparse,json
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',choices=['chromium','webkit'],default='chromium');a=p.parse_args()
cfg=json.loads(Path('hllv_tracker/suggestions-config.json').read_text());assert cfg['connection_mode']=='operator_only' and not cfg['enabled']
with sync_playwright() as pw:
 b=getattr(pw,a.engine).launch();page=b.new_page(viewport={'width':1280,'height':900});errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.goto(a.url,wait_until='networkidle');expect(page.locator('#hllvAccountBar')).to_contain_text('Not signed in',timeout=30000)
 expect(page.locator('.patch-entry')).to_have_count(8)
 page.locator('#hllvAccountBar [data-account="sign-in"]').click();expect(page.locator('#sgPasswordLogin')).to_be_visible()
 expect(page.locator('#sgLoginPassword')).to_have_attribute('autocomplete','current-password')
 expect(page.locator('#authRemember')).not_to_be_checked()
 expect(page.locator('[data-sg-view="review"]')).not_to_be_visible()
 for width in [390,320]:
  page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),width
 expect(page.locator('#sgStatus')).to_contain_text('intake and voting are closed')
 assert not any('/auth/v1/otp' in u or '/auth/v1/verify' in u or '/auth/v1/token' in u or '/auth/v1/recover' in u or '/auth/v1/signup' in u for u in requests)
 assert not errors,errors
 b.close()
for name in ['hllv_pilot_status','hllv_board','hllv_profile','hllv_queue']:
 req=Request(cfg['supabase_url']+'/rest/v1/rpc/'+name,data=b'{}',headers={'apikey':cfg['publishable_key'],'Content-Type':'application/json'})
 try:
  with urlopen(req,timeout=15) as r:code=r.status;data=json.load(r)
 except HTTPError as e:code=e.code;data=None
 if name=='hllv_pilot_status':assert code==200 and not data['intake_open'] and not data['voting_open']
 elif name=='hllv_board':assert code==200 and data==[]
 else:assert code in (401,403)
print('PUBLIC_PASSWORD_SMOKE_PASS',a.engine,'real SDK signed-out initialization, visible password form, no credential/email requests, unchanged closed pilot and anonymous denial')
