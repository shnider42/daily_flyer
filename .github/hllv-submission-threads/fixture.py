"""Extend browser fixture only; these responses never reach Supabase."""
from pathlib import Path
p=Path('.github/hllv-community/test_browser.py');s=p.read_text()
if '# Conversation fixture' not in s:
 s=s.replace("store={};tick=0", "store={};threads={};tick=0")
 s=s.replace(" d.update(votes=", " d.update(public_comments=[{k:e[k] for k in ['id','body','version','created_at','author_label']} for e in threads.get(s['id'],[]) if e['visibility']=='public' and not e.get('hidden') and e['version']==s['version'] and s['state']=='published'][:3]);d['public_comment_count']=sum(e['visibility']=='public' and not e.get('hidden') and e['version']==s['version'] and s['state']=='published' for e in threads.get(s['id'],[]))\n d.update(votes=")
 extra='''   # Conversation fixture
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
'''
 s=s.replace("   elif op=='hllv_community':",extra+"   elif op=='hllv_community':")
 s=s.replace("      if s['state']=='published':", "      if s['submitter_note']:threads.setdefault(s['id'],[]).append({'id':str(uuid.uuid4()),'body':s['submitter_note'],'version':s['version'],'visibility':'private','created_at':stamp(),'author':uid,'author_label':'Site moderator','hidden':False})\n      if s['state']=='published':")
 s=s.replace("['password','hllv_community','password-save','hllv_rehearsal']", "['password','hllv_community','password-save','hllv_rehearsal','hllv_submission_thread']")
 p.write_text(s)
