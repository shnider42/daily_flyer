"""Isolated PostgreSQL only. Reuses baseline tests and adds conversation boundaries."""
import importlib.util,unittest,uuid,json,concurrent.futures
from pathlib import Path
spec=importlib.util.spec_from_file_location('community_tests','.github/hllv-community/test_database.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
base=m.CommunityTests.setUpClass.__func__
def setup(cls):
    base(cls)
    m.admin(Path('.github/hllv-ux-20261012/schema.sql').read_text())
    m.admin(Path('.github/hllv-moderator-quota/schema.sql').read_text())
    m.admin(Path('.github/hllv-submission-threads/schema.sql').read_text())
m.CommunityTests.setUpClass=classmethod(setup)
def thread(user,action,row,**extra):
    with m.psycopg.connect(m.DSN) as c:
        c.execute('SET LOCAL ROLE '+('authenticated' if user else 'anon'))
        claims={'sub':user,'role':'authenticated','session_id':m.SESS.get(user),'user_metadata':{'role':'moderator'}} if user else {'role':'anon'}
        c.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps(claims),))
        return c.execute('SELECT public.hllv_submission_thread(%s,%s)',(action,m.Jsonb({'id':row['id'],'version':row['version'],**extra}))).fetchone()[0]
def reply(user,row,body='PRIVATE-REPLY-FIXTURE',**extra):return thread(user,'reply',row,body=body,request_id=str(uuid.uuid4()),**extra)
def messages(user,row):return [e for e in thread(user,'read',row)['entries'] if e['kind']=='message']
def publish_note(row,body='PUBLIC-MODERATOR-FIXTURE',**extra):return thread(m.M,'public_comment',row,body=body,request_id=str(uuid.uuid4()),public_consent=True,**extra)
def captured(self):
    s=self.submit();s=m.call(m.M,'moderate',{**m.target(s),'decision':'needs_information','note':'PRIVATE-FIRST-QUESTION'})
    reply(m.A,s,'PRIVATE-MEMBER-ANSWER');s=thread(m.M,'read',s)['submission'];self.assertEqual(s['state'],'pending')
    s=m.call(m.M,'moderate',{**m.target(s),'decision':'needs_information','note':'PRIVATE-SECOND-QUESTION'})
    got=messages(m.M,s);self.assertEqual({x['body'] for x in got},{'PRIVATE-FIRST-QUESTION','PRIVATE-MEMBER-ANSWER','PRIVATE-SECOND-QUESTION'})
    self.assertEqual(len(messages(m.A,s)),3);self.assertEqual(m.call(None,'board')['total'],0)
def private_boundary(self):
    s=self.submit();reply(m.A,s)
    for u in [None,m.B,m.R,m.I,m.N,m.X]:
        for action in ['read','reply','check']:
            with self.assertRaises(m.psycopg.Error):thread(u,action,s,body='FORGED',request_id=str(uuid.uuid4()))
    for action in ['public_comment','hide_public_comment']:
        with self.assertRaises(m.psycopg.Error):thread(m.A,action,s,body='FORGED',request_id=str(uuid.uuid4()),public_consent=True)
    with m.psycopg.connect(m.DSN) as c:
        c.execute('SET LOCAL ROLE authenticated')
        with self.assertRaises(m.psycopg.Error):c.execute('SELECT * FROM hllv_private.submission_messages')
def explicit_public(self):
    s=self.submit();reply(m.A,s);s=thread(m.M,'read',s)['submission'];s=self.approve(s)
    self.assertEqual(m.call(None,'board')['rows'][0]['public_comments'],[])
    with self.assertRaises(m.psycopg.Error):thread(m.M,'public_comment',s,body='not consented',request_id=str(uuid.uuid4()))
    publish_note(s);raw=json.dumps(m.call(None,'board'))
    for secret in ['PRIVATE-REPLY-FIXTURE','PRIVATE-MODERATOR-NOTE','author_id',m.M,m.A,'request_id','example.invalid']:self.assertNotIn(secret,raw)
    self.assertIn('PUBLIC-MODERATOR-FIXTURE',raw);self.assertEqual(len(thread(None,'public',s)['entries']),1)
def versions(self):
    s=self.approve(self.submit());publish_note(s);s=thread(m.A,'read',s)['submission']
    s=m.call(m.A,'edit',{**m.target(s),**m.P,'title':'Revised wording for conversation test'})
    self.assertEqual(m.call(None,'board')['rows'],[])
    with self.assertRaises(m.psycopg.Error):thread(None,'public',s)
    s=self.approve(s);self.assertEqual(m.call(None,'board')['rows'][0]['public_comments'],[])
    versions=[e for e in thread(m.M,'read',s)['entries'] if e['kind']=='version'];self.assertEqual({v['version'] for v in versions},{1,2})
    self.assertTrue(any(e['visibility']=='public' and e['version']==1 for e in messages(m.M,s)))
def duplicate(self):
    s=self.submit();req=str(uuid.uuid4());args={'request_id':req,'body':'Same reply'}
    a=thread(m.A,'reply',s,**args);b=thread(m.A,'reply',s,**args);self.assertEqual(a['message_id'],b['message_id'])
    self.assertEqual(thread(m.A,'check',s,request_id=req)['message_id'],a['message_id'])
    self.assertIsNone(thread(m.M,'check',s,request_id=req));self.assertEqual(len(messages(m.A,s)),1)
    with self.assertRaises(m.psycopg.Error):thread(m.A,'reply',s,request_id=req,body='different')
def hide(self):
    s=self.approve(self.submit());p=publish_note(s)
    thread(m.M,'hide_public_comment',s,message_id=p['message_id']);self.assertEqual(m.call(None,'board')['rows'][0]['public_comment_count'],0)
    self.assertTrue(next(e for e in messages(m.M,s) if e['id']==p['message_id'])['hidden'])
def paged(self):
    s=self.submit()
    for i in range(38):m.admin("INSERT INTO hllv_private.submission_messages(suggestion_id,version,author_id,author_role,body,created_at) VALUES(%s,1,%s,'member',%s,now()+(%s||' seconds')::interval)",(s['id'],m.A,'private '+str(i),i))
    first=thread(m.M,'read',s);second=thread(m.M,'read',s,page=1);self.assertEqual(len(first['entries']),30);self.assertEqual(first['total'],40);self.assertEqual(len(second['entries']),10)
    dates=[x['at'] for x in first['entries']+second['entries']];self.assertEqual(dates,sorted(dates,reverse=True))
    oldest=thread(m.A,'read',s,order='oldest');d=[x['at'] for x in oldest['entries']];self.assertEqual(d,sorted(d))
def quotas(self):
    ss=[self.submit() for _ in range(3)]
    for i in range(5):reply(m.A,ss[0],str(i))
    self.denied(m.A,'submit',{**m.P,'request_id':str(uuid.uuid4())})
    for _ in range(6):self.submit(m.M)
    self.assertEqual(m.call(m.M,'mine')['total'],6)
def parallel(self):
    s=self.submit()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as p:list(p.map(lambda i:reply(m.A,s,'Parallel '+str(i)),range(4)))
    self.assertEqual(len(messages(m.M,s)),4)
def stale(self):
    s=self.submit();reply(m.A,s);self.denied(m.M,'moderate',{**m.target(s),'decision':'published'})
    s=thread(m.M,'read',s)['submission'];s=self.approve(s);m.call(m.B,'vote',{'id':s['id'],'version':1,'support':True});reply(m.A,s)
    self.assertEqual(m.call(None,'board')['rows'][0]['votes'],1)
def withdrawn(self):
    s=self.submit();reply(m.A,s);s=thread(m.A,'read',s)['submission'];m.call(m.A,'withdraw',m.target(s))
    self.assertEqual(len(messages(m.M,s)),1)
    with self.assertRaises(m.psycopg.Error):reply(m.A,s)
def validation(self):
    s=self.submit()
    for b in ['',' '*5,'x'*2001]:
        with self.assertRaises(m.psycopg.Error):reply(m.A,s,b)
    with self.assertRaises(m.psycopg.Error):publish_note(s)
    m.admin('DELETE FROM auth.sessions WHERE user_id=%s',(m.M,))
    with self.assertRaises(m.psycopg.Error):thread(m.M,'read',s)
for i,(name,fn) in enumerate([('decision_replies_preserved',captured),('private_boundaries',private_boundary),('explicit_public_only',explicit_public),('version_scope_and_history',versions),('idempotent_reply',duplicate),('hide_keeps_private_history',hide),('pagination_order',paged),('replies_not_new_submissions',quotas),('parallel_append',parallel),('concurrency_and_votes',stale),('withdrawn_read_only',withdrawn),('validation_and_revocation',validation)],21):setattr(m.CommunityTests,f'test_{i}_{name}',fn)
unittest.main(module=m,verbosity=2)
