"""Real page and real registration component; synthetic Auth responses, no emails sent."""
import os
from pathlib import Path
source=Path('.github/hllv-community/test_browser.py').read_text()
source=source.replace('import argparse,json,uuid','import argparse,json,uuid,os')
if os.environ.get('CHROMIUM_EXECUTABLE'):
    source=source.replace("browser=getattr(pw,a.engine).launch()", "browser=getattr(pw,a.engine).launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') if a.engine=='chromium' else None)")
source=source.replace("updateUser:async arg=>req('password-save',arg)", "signUp:async arg=>req('signup',arg),resend:async arg=>req('resend',arg),updateUser:async arg=>req('password-save',arg)")
source=source.replace("getSession:async()=>({data:{session:await session()},error:null})", "getSession:async()=>{if(location.hash.includes('access_token=member-confirmed')){const result=await req('confirmed');await st.setItem(k,JSON.stringify(result.data.session));history.replaceState(null,'',location.pathname+'#access_token=consumed&type=signup');}return {data:{session:await session()},error:null}}")
source=source.replace("  ctx.on('page'", "  ctx.route('https://*.supabase.co/auth/v1/settings',lambda r:r.fulfill(json={'disable_signup':flags.get('signup_disabled',False),'mailer_autoconfirm':flags.get('autoconfirm',False),'external':{'email':True}},headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey'}))\n  ctx.on('page'")
source=source.replace("   if op=='password':", """   if op=='signup':
    assert set(payload)=={'email','password','options'} and set(payload['options'])=={'emailRedirectTo'}
    assert payload['options']['emailRedirectTo']=='https://hllv-bug-track.onrender.com/'
    if flags.get('lost_signup'):route.abort();return
    error={'code':flags['signup_error']} if flags.get('signup_error') else None
    data={'user':{'id':uid,'email':email},'session':None}
   elif op=='resend':
    assert payload['type']=='signup' and 'password' not in payload and 'role' not in payload
    data={}
   elif op=='confirmed':data={'session':{'user':{'id':uid,'email':email,'email_confirmed_at':'2026-10-12T18:00:00Z'},'access_token':'SYNTHETIC','refresh_token':'SYNTHETIC'}}
   elif op=='password':""")
# Settings fixtures return no role privilege; members still see the actual gated UI.
checks='''
 member,member_id,member_email,rcalls,rerrors,rflags=context(identity='new-member')
 rp=member.new_page();rp.goto(BASE,wait_until='networkidle');rp.locator('#hllvAccountBar [data-account="create-account"]').click();expect(rp.locator('#sgSignupForm')).to_be_visible()
 expect(rp.locator('#sgPasswordLogin')).not_to_be_visible()
 assert rp.locator('#sgSignupForm [name="role"]').count()==0
 rp.fill('#sgSignupEmail',member_email);rp.fill('#sgSignupPassword',PW);rp.fill('#sgSignupConfirm','Different-synthetic-password');rp.locator('#sgSignupConsent').check();rp.locator('#sgSignupSend').click();expect(rp.locator('#signupFeedback')).to_contain_text('do not match');assert not any(x['op']=='signup' for x in rcalls)
 rp.fill('#sgSignupConfirm',PW);rp.locator('#sgSignupSend').dblclick();expect(rp.locator('#sgSignupReceipt')).to_be_visible();expect(rp.locator('#sgSignupReceiptEmail')).to_have_text(member_email);expect(rp.locator('#hllvAccountBar')).to_contain_text('Not signed in')
 assert sum(x['op']=='signup' for x in rcalls)==1;assert rp.locator('#sgSignupPassword').input_value()=='' and rp.locator('#sgSignupConfirm').input_value()==''
 assert PW not in rp.evaluate('JSON.stringify({...localStorage})+JSON.stringify({...sessionStorage})')
 rp.locator('#sgSignupEmailHelp summary').click();rp.locator('#sgSignupResend').click();expect(rp.locator('#signupFeedback')).to_contain_text('wait at least a minute');assert not any(x['op']=='resend' for x in rcalls)
 # Confirmation can open in a separate tab; the account is still a member and can submit.
 confirmed=member.new_page();confirmed.goto(BASE+'#access_token=member-confirmed&refresh_token=fixture&type=signup',wait_until='networkidle');expect(confirmed.locator('#hllvAccountBar')).to_contain_text('Member');expect(confirmed.locator('#sgStatus')).to_contain_text('Email verified');expect(confirmed.locator('[data-cb-view="queue"]')).not_to_be_visible();assert 'access_token' not in confirmed.url
 form(confirmed,'A newly verified member can propose an idea');send(confirmed);expect(confirmed.locator('#cbReceiptQueue')).to_have_count(0);assert store[next(reversed(store))]['state']=='pending'
 # Sign out does not make pending text public, and normal password login still works.
 confirmed.locator('#globalSignOut').click();expect(confirmed.locator('#hllvAccountBar')).to_contain_text('Not signed in');login(confirmed,member_email);expect(confirmed.locator('#hllvAccountBar')).to_contain_text('Member');assert not rerrors,rerrors
 for setting in ['signup_disabled','autoconfirm']:
  ctx,_,mail,calls,errors,flags=context();flags[setting]=True;page=ctx.new_page();page.goto(BASE+'#suggestions',wait_until='networkidle');page.locator('#hllvAccountBar [data-account="create-account"]').click();page.fill('#sgSignupEmail',mail);page.fill('#sgSignupPassword',PW);page.fill('#sgSignupConfirm',PW);page.locator('#sgSignupConsent').check();page.locator('#sgSignupSend').click();expect(page.locator('#signupFeedback')).to_contain_text('paused' if setting=='signup_disabled' else 'not configured correctly');assert not any(x['op']=='signup' for x in calls);assert not errors;ctx.close()
 for error in ['over_email_send_rate_limit','email_address_not_authorized','weak_password','user_already_exists']:
  ctx,_,mail,calls,errors,flags=context();flags['signup_error']=error;page=ctx.new_page();page.goto(BASE+'#suggestions',wait_until='networkidle');page.locator('#communitySubmit').click();page.locator('#cbCreateAccount').click();page.fill('#sgSignupEmail',mail);page.fill('#sgSignupPassword',PW);page.fill('#sgSignupConfirm',PW);page.locator('#sgSignupConsent').check();page.locator('#sgSignupSend').click();expect(page.locator('#signupFeedback')).to_have_attribute('data-error','true');expect(page.locator('#sgSignupReceipt')).not_to_be_visible();assert page.locator('#sgSignupPassword').input_value()=='';assert page.locator('#sgSignupEmail').input_value()==mail;assert not errors;ctx.close()
 ctx,_,mail,calls,errors,flags=context();page=ctx.new_page();page.goto(BASE+'#suggestions',wait_until='networkidle');page.locator('#hllvAccountBar [data-account="create-account"]').click();page.locator('#sgSignupEmailHelp summary').click();page.fill('#sgVerificationEmail',mail);page.locator('#sgSignupResend').click();expect(page.locator('#signupFeedback')).to_contain_text('Request accepted');assert sum(x['op']=='resend' for x in calls)==1 and not any(x['op']=='signup' for x in calls)
 for mode in ['dark','light']:
  if page.locator('html').get_attribute('data-theme')!=mode:page.locator('#themeToggle').click()
  for width in [320,390,1280]:
   page.set_viewport_size({'width':width,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),(mode,width)
  page.set_viewport_size({'width':390,'height':900});page.screenshot(path='artifacts/member-signup-'+mode+'-'+a.engine+'.png',full_page=True)
 assert not errors,errors;ctx.close()
 print('MEMBER_REGISTRATION_BROWSER_PASS',a.engine,'signup/verification/new-tab return/member isolation, resend and cooldown, configuration failures, email errors, password clearing, theme/mobile and existing community journeys. Synthetic responses only; real delivery not tested.')
'''
source=source.replace(' browser.close()',checks+'\n browser.close()')
exec(compile(source,'.github/hllv-community/test_browser.py','exec'),{'__name__':'__main__'})
