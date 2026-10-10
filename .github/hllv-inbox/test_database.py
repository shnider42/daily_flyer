"""Run after the original pilot database tests, only against an isolated fixture DSN."""
import json,os,unittest,uuid
from pathlib import Path
import psycopg
DSN=os.environ['PILOT_TEST_DATABASE_URL']
class InboxTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  with psycopg.connect(DSN) as c:
   c.execute('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz)')
   c.execute("CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$")
   c.execute(Path('.github/hllv-inbox/schema.sql').read_text())
 def setUp(self):
  self.c=psycopg.connect(DSN);self.m,self.p,self.rev,self.session=[uuid.uuid4() for _ in range(4)]
  for u,role in [(self.m,'moderator'),(self.p,'participant'),(self.rev,'reviewer')]:
   self.c.execute('INSERT INTO auth.users VALUES(%s,%s,now())',(u,str(u)+'@inbox-fixture.invalid'))
   self.c.execute('INSERT INTO hllv_private.members(user_id,role) VALUES(%s,%s)',(u,role))
  self.c.execute("INSERT INTO auth.sessions VALUES(%s,%s,now()+interval '1 hour')",(self.session,self.m))
  self.c.execute("UPDATE hllv_private.settings SET phase='setup'")
  self.sid,self.stamp=self.c.execute("INSERT INTO hllv_private.submissions(owner_id,kind,title,problem,desired_outcome,policy_version) VALUES(%s,'suggestion','INBOX SYNTHETIC FIXTURE','A synthetic problem statement for database tests.','Review this synthetic problem.','fixture') RETURNING id,updated_at",(self.p,)).fetchone()
 def tearDown(self):self.c.rollback();self.c.close()
 def as_user(self,u=None,session=None):
  self.c.execute('RESET ROLE');self.c.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps({'sub':str(u),'session_id':str(session or self.session),'role':'authenticated'} if u else {'role':'anon'}),));self.c.execute('SET LOCAL ROLE '+('authenticated' if u else 'anon'))
 def admin(self,sql,params=()):self.c.execute('RESET ROLE');return self.c.execute(sql,params)
 def read(self):return self.c.execute('SELECT public.hllv_moderator_inbox()').fetchone()[0]
 def decision(self,state='needs_information',note='Please clarify the platform.',stamp=None,version=1,target=None):return self.c.execute('SELECT public.hllv_moderator_decision(%s,%s,%s,%s,%s,%s)',(self.sid,version,stamp or self.stamp,state,note,target)).fetchone()[0]
 def denied(self,fn):
  with self.assertRaises(psycopg.Error):
   with self.c.transaction():fn()
 def test_01_read_projection(self):
  self.as_user(self.m);result=self.read();s=next(s for s in result['rows'] if s['id']==str(self.sid));self.assertEqual(s['state'],'pending');self.assertFalse(result['can_moderate'])
  for term in ['@inbox-fixture.invalid','owner_id','private_reference','authorization_reference']:self.assertNotIn(term,json.dumps(result))
 def test_02_roles(self):
  for user in [None,self.p,self.rev]:self.as_user(user);self.denied(self.read)
 def test_03_session_and_membership(self):
  self.as_user(self.m,uuid.uuid4());self.denied(self.read)
  self.admin("UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id=%s",(self.session,));self.as_user(self.m);self.denied(self.read)
  self.admin("UPDATE auth.sessions SET not_after=now()+interval '1 hour' WHERE id=%s",(self.session,));self.admin('UPDATE hllv_private.members SET active=false WHERE user_id=%s',(self.m,));self.as_user(self.m);self.denied(self.read)
 def test_04_phase_gates(self):
  for phase in ['setup','voting','closed']:self.admin('UPDATE hllv_private.settings SET phase=%s',(phase,));self.as_user(self.m);self.denied(self.decision)
 def test_05_receipt_and_concurrency(self):
  self.admin("UPDATE hllv_private.settings SET phase='intake'");self.as_user(self.m);r=self.decision();self.assertEqual(r['state'],'needs_information');self.assertFalse(r['public_visible']);self.denied(lambda:self.decision('shortlisted'))
  self.decision('shortlisted',stamp=r['updated_at']);self.assertEqual(self.c.execute('SELECT public.hllv_board()').fetchone()[0],[])
 def test_06_validation(self):
  self.admin("UPDATE hllv_private.settings SET phase='review'");self.as_user(self.m)
  for action,note in [(None,'A real note'),('published','Not allowed'),('needs_information','x'),('shortlisted','x'*1001)]:self.denied(lambda a=action,n=note:self.decision(a,n))
  self.denied(lambda:self.decision(version=2));self.denied(lambda:self.decision('duplicate',target=self.sid))
 def test_07_duplicate_and_wording_acceptance(self):
  self.admin("UPDATE hllv_private.settings SET phase='review'");self.admin('UPDATE hllv_private.submissions SET owner_accepted_version=0 WHERE id=%s',(self.sid,));self.as_user(self.m);self.denied(lambda:self.decision('shortlisted'))
  self.admin('UPDATE hllv_private.submissions SET owner_accepted_version=1 WHERE id=%s',(self.sid,));target=self.admin("INSERT INTO hllv_private.submissions(owner_id,kind,title,problem,desired_outcome,policy_version) VALUES(%s,'suggestion','DUPLICATE TARGET FIXTURE','Another synthetic problem for a duplicate test.','A clearer test outcome.','fixture') RETURNING id",(self.p,)).fetchone()[0]
  self.as_user(self.m);self.assertEqual(self.decision('duplicate',target=target)['state'],'duplicate')
 def test_08_withdrawn_published_and_history(self):
  self.admin("UPDATE hllv_private.settings SET phase='review'");self.admin("UPDATE hllv_private.submissions SET state='published' WHERE id=%s",(self.sid,));self.as_user(self.m);self.denied(self.decision)
  self.admin("UPDATE hllv_private.submissions SET state='withdrawn' WHERE id=%s",(self.sid,));self.as_user(self.m);self.assertFalse(any(x['id']==str(self.sid) for x in self.read()['rows']));self.denied(self.decision)
 def test_09_anonymous_functions_and_direct_tables(self):
  self.as_user();self.denied(self.read);self.denied(self.decision)
  self.as_user(self.m);self.denied(lambda:self.c.execute('SELECT * FROM hllv_private.submissions'));self.denied(lambda:self.c.execute('SELECT hllv_private.inbox_actor()'))
if __name__=='__main__':unittest.main(verbosity=2)
