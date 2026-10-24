"""Integrated UI journeys with synthetic identities. Never send real Auth emails or votes."""
import argparse,json,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--engine',default='chromium',choices=['chromium','webkit']);a=p.parse_args()
BASE=a.url;PW='Synthetic-fixture-only-Password-42';store={};threads={};tick=0
SDK=r'''export function createClient(url,key,opts){let listener=()=>{};const st=opts.auth.storage,k=opts.auth.storageKey;
const req=async(op,payload={})=>{const r=await fetch('/__community_fixture__',{method:'POST',body:JSON.stringify({op,payload})});return r.json()};
const session=async()=>{const v=await st.getItem(k);return v?JSON.parse(v):null;};
return {auth:{onAuthStateChange:f=>{listener=f;return{}},getSession:async()=>({data:{session:await session()},error:null}),getUser:async()=>({data:{user:(await session())?.user||null},error:null}),
signInWithPassword:async arg=>{const r=await req('password',arg);if(!r.error)await st.setItem(k,JSON.stringify(r.data.session));return r;},
updateUser:async arg=>req('password-save',arg),signOut:async()=>{await st.removeItem(k);listener('SIGNED_OUT');return {error:null}}},rpc:async(name,args)=>req(name,args)}}'''
def stamp():
 global tick;tick+=1;return '2026-10-11T20:%02d:%02dZ'%((tick//60)%60,tick%60)
def project(s,owner,private=False):
 d={k:v for k,v in s.items() if k not in ('owner','supporters','submitter_note','request_id','history')}
 d.update(public_comments=[{k:e[k] for k in ['id','body','version','created_at','author_label']} for e in threads.get(s['id'],[]) if e['visibility']=='public' and not e.get('hidden') and e['version']==s['version'] and s['state']=='published'][:3]);d['public_comment_count']=sum(e['visibility']=='public' and not e.get('hidden') and e['version']==s['version'] and s['state']=='published' for e in threads.get(s['id'],[]))
 d.update(votes=len(s['supporters']),my_vote=owner in s['supporters'])
 if private:d.update({k:s[k] for k in ['submitter_note','request_id','history']})
 return d
with sync_playwright() as pw:
 browser=getattr(pw,a.engine).launch()
 def context(role='participant',identity=None):
  uid=identity or str(uuid.uuid4());email=uid+'@example.invalid';ctx=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce');calls=[];errors=[];flags={'lose_save':False,'fail_save':False}
  ctx.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(body=SDK,content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'}))
  ctx.route('https://*.supabase.co/**',lambda r:r.abort())
  ctx.on('page',lambda page:page.on('pageerror',lambda e:errors.append(str(e))))
  def respond(route):
   b=json.loads(route.request.post_data);calls.append(b);op=b['op'];payload=b.get('payload') or {};error=None;data=None
   if op=='password':
    error=None if payload.get('email')==email and payload.get('password')==PW else {'code':'invalid_credentials'}
    data={'session':{'user':{'id':uid,'email':email},'access_token':'SYNTHETIC-NOT-REAL','refresh_token':'SYNTHETIC'}}
   elif op=='password-save':data={'user':{'id':uid,'email':email}}
   elif op=='hllv_rehearsal':data=None
   # Conversation fixture
   elif op=='hllv_submission_thread':
    act=payload['action'];arg=payload.get('payload') or {};s=store[arg['id']];events=threads.setdefault(s['id'],[])
    assert act=='public' or role=='moderator' or s['owner']==uid
    if act in ['read','public']:
     chosen=[{**e,'at':e['created_at'],'kind':'message','is_mine':e['author']==uid} for e in events if act!='public' or (e['visibility']=='public' and not e.get('hidden') and e['version']==s['version'] and s['state']=='published')]
     chosen.sort(key=lambda e:e['at'],reverse=arg.get('order')!='oldest');pg=arg.get('page',0)
     data={'entries':chosen[pg*30:(pg+1)*30],'total':len(chosen),'page':pg,'page_size':30,'checked_at':stamp()}
     if act=='read':data.update(submission=project(s,uid,True),can_reply=s['state']!='withdrawn',can_post_public=role=='moderator' and s['state']=='published',moderator=role=='moderator')
    elif act=='check':
     saved=next((e for e in events if e.get('request_id')==arg['request_id'] and e['author']==uid),None)
     data={'message_id':saved['id'],'saved_at':saved['created_at'],'visibility':saved['visibility'],'submission':project(s,uid,True)} if saved else None
    elif act=='hide_public_comment':
     assert role=='moderator';saved=next(e for e in events if e['id']==arg['message_id']);saved['hidden']=True
     data={'message_id':saved['id'],'hidden':True,'submission':project(s,uid,True)}
    else:
     assert act in ['reply','public_comment']
     if flags.get('fail_reply'):flags['fail_reply']=False;route.abort();return
     if act=='public_comment':assert role=='moderator' and arg['public_consent'] is True and s['state']=='published'
     saved=next((e for e in events if e.get('request_id')==arg['request_id'] and e['author']==uid),None)
     if not saved:
      saved={'id':str(uuid.uuid4()),'body':arg['body'],'version':s['version'],'visibility':'public' if act=='public_comment' else 'private','created_at':stamp(),'author':uid,'author_label':'Site moderator' if role=='moderator' else 'Member (submitter)','request_id':arg['request_id'],'hidden':False};events.append(saved);s['updated_at']=stamp()
      if role!='moderator' and act=='reply' and s['state']=='needs_information':s['state']='pending'
     data={'message_id':saved['id'],'saved_at':saved['created_at'],'visibility':saved['visibility'],'submission':project(s,uid,True)}
     if flags.get('lose_reply'):flags['lose_reply']=False;route.abort();return
   elif op=='hllv_community':
    act=payload['action'];arg=payload.get('payload') or {}
    if act=='status':data={'enabled':True,'approval_mode':'community','policy_version':'community-v1'}
    elif act=='profile':data={'role':role,'can_moderate':role=='moderator'}
    elif act in ['board','mine','queue']:
     items=[s for s in store.values() if (s['state']=='published' if act=='board' else s['owner']==uid if act=='mine' else s['state']!='withdrawn')]
     if arg.get('state','all')!='all':items=[s for s in items if s['state']==arg['state']]
     if arg.get('query'):items=[s for s in items if arg['query'].lower() in (s['title']+' '+s['problem']).lower()]
     if act=='board' and arg.get('order')=='votes':items.sort(key=lambda s:len(s['supporters']),reverse=True)
     pg=arg.get('page',0);data={'rows':[project(s,uid,act!='board') for s in items[pg*20:(pg+1)*20]],'total':len(items),'page':pg,'page_size':20,'enabled':True,'checked_at':stamp()}
    elif act=='find_submission':data=next((project(s,uid,True) for s in store.values() if s['owner']==uid and s['request_id']==arg['request_id']),None)
    elif act=='submit':
     if flags['fail_save']:flags['fail_save']=False;route.abort();return
     existing=next((s for s in store.values() if s['owner']==uid and s['request_id']==arg['request_id']),None)
     if existing:data=project(existing,uid,True)
     else:
      sid=str(uuid.uuid4());time=stamp();s={**{k:arg[k] for k in ['title','problem','desired_outcome','kind','related_issue']},'id':sid,'owner':uid,'request_id':arg['request_id'],'state':'pending','version':1,'created_at':time,'updated_at':time,'approved_at':None,'approval_mode':'community','approval_label':None,'developer_review':'Not recorded','submitter_note':'','history':[{'action':'community_submitted_private','version':1,'at':time}],'supporters':set()};store[sid]=s;data=project(s,uid,True)
     if flags['lose_save']:flags['lose_save']=False;route.abort();return
    elif act in ['edit','withdraw','moderate','vote']:
     if act=='edit' and flags.get('fail_edit'):flags['fail_edit']=False;route.abort();return
     s=store[arg['id']]
     if act=='vote':
      assert s['state']=='published';s['supporters'].add(uid) if arg['support'] else s['supporters'].discard(uid)
     elif arg.get('updated_at')!=s['updated_at']:error={'code':'40001'}
     elif act=='edit':
      for k in ['title','problem','desired_outcome','kind','related_issue']:s[k]=arg[k]
      s.update(state='pending',version=s['version']+1,supporters=set(),approval_label=None)
     elif act=='withdraw':s['state']='withdrawn'
     else:
      assert role=='moderator';s['state']=arg['decision'];s['submitter_note']=arg.get('note','')
      if s['submitter_note']:threads.setdefault(s['id'],[]).append({'id':str(uuid.uuid4()),'body':s['submitter_note'],'version':s['version'],'visibility':'private','created_at':stamp(),'author':uid,'author_label':'Site moderator','hidden':False})
      if s['state']=='published':s.update(approved_at=stamp(),approval_label='Moderator approved')
     s['updated_at']=stamp();data=project(s,uid,act!='vote')
     if act=='edit' and flags.get('lose_edit'):flags['lose_edit']=False;route.abort();return
    else:raise AssertionError('Unexpected action '+act)
   else:raise AssertionError('Unexpected API operation '+op)
   route.fulfill(json={'data':data,'error':error})
  ctx.route('**/__community_fixture__',respond)
  return ctx,uid,email,calls,errors,flags
 def login(page,email):
  page.goto(BASE+'#suggestions',wait_until='networkidle');page.locator('#hllvAccountBar [data-account="sign-in"]').click();expect(page.locator('#sgPasswordLogin')).to_be_visible();page.fill('#sgLoginEmail',email);page.fill('#sgLoginPassword',PW);page.get_by_role('button',name='Sign in with password',exact=True).click();expect(page.locator('#hllvAccountBar')).to_contain_text('Signed in')
 def form(page,title='Clearer helicopter control descriptions'):
  page.locator('#communitySubmit').click();expect(page.locator('#cbSubmitForm')).to_be_visible();page.fill('#cbTitle',title);page.fill('#cbProblem','It is difficult to tell which controls change flight behavior.');page.fill('#cbOutcome','Add clearer labels for each flight control.');page.locator('#cbConsent').check()
 def send(page):page.locator('#cbSend').click();expect(page.locator('.cb-receipt')).to_contain_text('Your suggestion is saved')
 public,_,_,_,perrs,_=context();pub=public.new_page();pub.goto(BASE+'#suggestions',wait_until='networkidle');expect(pub.locator('.cb-empty')).to_contain_text('next idea could be yours');expect(pub.locator('[data-cb-view="queue"]')).not_to_be_visible()
 for width in [390,320]:
  pub.set_viewport_size({'width':width,'height':844});box=pub.locator('#communitySubmit').bounding_box();assert box and box['y']+box['height']<=844,box;assert pub.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
 pub.locator('#communitySubmit').click();expect(pub.locator('#cbLogin')).to_be_visible();expect(pub.locator('#cbSubmitForm')).to_have_count(0)
 user,uid,email,calls,errs,flags=context(identity='author');page=user.new_page();login(page,email);form(page);send(page);assert len(store)==1
 pub.reload(wait_until='networkidle');expect(pub.locator('[data-board-id]')).to_have_count(0)
 page.locator('#cbReceiptMine').click();expect(page.locator('.cb-entry')).to_contain_text('Awaiting moderator review')
 mod,_,memail,mcalls,merrs,_=context(role='moderator',identity='moderator');mp=mod.new_page();login(mp,memail);mp.locator('[data-cb-view="queue"]').click();expect(mp.locator('.cb-entry')).to_have_count(1);mp.locator('.cb-entry').click();expect(mp.locator('#cbApprove')).to_be_visible();mp.fill('#cbModNote','PRIVATE-REPLY-NOT-FOR-THE-BOARD');mp.once('dialog',lambda d:d.accept());mp.locator('#cbApprove').click();expect(mp.locator('.cb-receipt')).to_contain_text('Approved and published')
 pub.reload(wait_until='networkidle');expect(pub.locator('[data-board-id]')).to_have_count(1);assert 'PRIVATE-REPLY-NOT-FOR-THE-BOARD' not in pub.inner_text('body');pub.locator('[data-vote]').click();expect(pub.locator('#sgPasswordLogin')).to_be_visible()
 page.locator('[data-cb-view="board"]').click();page.locator('[data-vote]').click();expect(page.locator('[data-vote]')).to_have_attribute('aria-pressed','true');expect(page.locator('[data-vote] strong')).to_have_text('1');page.locator('[data-vote]').click();expect(page.locator('[data-vote] strong')).to_have_text('0')
 page.locator('[data-cb-view="mine"]').click();page.locator('.cb-entry').click();page.locator('#cbEdit').click();page.fill('#cbTitle','Revised <img src=x onerror=alert(1)> controls');page.locator('#cbConsent').check();send(page);expect(page.locator('.cb-receipt img')).to_have_count(0);pub.reload(wait_until='networkidle');expect(pub.locator('[data-board-id]')).to_have_count(0)
 # Failed revision check must preserve the draft and explicitly identify the older saved version.
 page.locator('#cbReceiptMine').click();page.locator('.cb-entry').first.click();page.locator('#cbEdit').click();page.fill('#cbOutcome','This revision did not reach the server on its first attempt.');page.locator('#cbConsent').check();flags['fail_edit']=True;page.locator('#cbSend').click();expect(page.locator('#cbCheckSave')).to_be_visible();page.locator('#cbCheckSave').click();expect(page.locator('#cbFormFeedback')).to_contain_text('this revision is not confirmed');assert page.locator('#cbOutcome').input_value()=='This revision did not reach the server on its first attempt.';expect(page.locator('#cbSend')).to_be_enabled();send(page)
 # A genuinely saved revision with a dropped response is recovered only by matching its wording/version.
 page.locator('#cbReceiptMine').click();page.locator('.cb-entry').first.click();page.locator('#cbEdit').click();page.fill('#cbOutcome','This revision was saved but its confirmation response was lost.');page.locator('#cbConsent').check();flags['lose_edit']=True;page.locator('#cbSend').click();expect(page.locator('#cbCheckSave')).to_be_visible();page.locator('#cbCheckSave').click();expect(page.locator('.cb-receipt')).to_contain_text('Your suggestion is saved')
 page.locator('#cbReceiptBoard').click();flags['lose_save']=True;form(page,'Lost response should still be recoverable');page.locator('#cbSend').click();expect(page.locator('#cbCheckSave')).to_be_visible();assert page.locator('#cbTitle').input_value()=='Lost response should still be recoverable';count=len(store);page.locator('#cbCheckSave').click();expect(page.locator('.cb-receipt')).to_contain_text('Your suggestion is saved');assert len(store)==count
 page.locator('#cbReceiptBoard').click();flags['fail_save']=True;form(page,'Failure must preserve this unsaved text');page.locator('#cbSend').click();expect(page.locator('#cbCheckSave')).to_be_visible();page.locator('#cbCheckSave').click();expect(page.locator('#cbSend')).to_be_enabled();assert page.locator('#cbTitle').input_value()=='Failure must preserve this unsaved text';page.once('dialog',lambda d:d.accept());page.locator('#cbCancel').click()
 # Reapprove after revision; the public presentation is visibly site-moderated, not developer-reviewed.
 mp.locator('#cbReceiptQueue').click();mp.locator('.cb-entry').first.click();mp.once('dialog',lambda d:d.accept());mp.locator('#cbApprove').click();expect(mp.locator('.cb-receipt')).to_contain_text('Approved and published');pub.reload(wait_until='networkidle')
 for width in [320,390,768,1280]:
  pub.set_viewport_size({'width':width,'height':844});assert pub.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),width
  page.set_viewport_size({'width':width,'height':844});page.locator('[data-cb-view="mine"]').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),width
 Path('artifacts').mkdir(exist_ok=True);pub.set_viewport_size({'width':390,'height':844});pub.screenshot(path='artifacts/community-mobile-'+a.engine+'.png',full_page=True);pub.set_viewport_size({'width':1280,'height':900});pub.screenshot(path='artifacts/community-desktop-'+a.engine+'.png',full_page=True)
 page.locator('#globalSignOut').click();expect(page.locator('#hllvAccountBar')).to_contain_text('Not signed in');expect(page.locator('#cbSubmitForm')).to_have_count(0);expect(page.locator('[data-cb-view="queue"]')).not_to_be_visible()
 assert not errs+merrs+perrs,errs+merrs+perrs
 assert all(c['op'] in ['password','hllv_community','password-save','hllv_rehearsal','hllv_submission_thread'] for c in calls+mcalls)
 browser.close()
print('COMMUNITY_BROWSER_PASS',a.engine,'integrated password login; visible mobile CTA; private submit and receipt; moderator publish; signed-out reads; authenticated votes; revision unpublishes; lost-response recovery; private-note exclusion; escaping; mobile and sign-out. Synthetic identities only.')
