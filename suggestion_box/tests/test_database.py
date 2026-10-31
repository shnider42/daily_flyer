"""Real PostgreSQL workflow/permission tests using synthetic Auth identities.
This does not claim to test hosted Supabase Auth, email delivery, or real reviewers.
"""
import concurrent.futures,json,os,uuid,unittest
from pathlib import Path
import psycopg
from psycopg.types.json import Jsonb
DSN=os.environ['PILOT_TEST_DATABASE_URL']
A,B,M,R,U,V=[str(uuid.uuid4()) for _ in range(6)]
PAYLOAD={'kind':'suggestion','title':'Clearer control descriptions','problem':'The controls are confusing to new players in this isolated test.','desired_outcome':'Explain the controls with clearer labels.','related_issue':'HLLV-007','policy_version':'pilot-2026-10-08','consent':True}
def admin(sql,args=()):
 with psycopg.connect(DSN) as c:
  return c.execute(sql,args).fetchall() if sql.lstrip().upper().startswith('SELECT') else c.execute(sql,args)
def call(user,fn,args=()):
 with psycopg.connect(DSN) as c:
  c.execute('SET LOCAL ROLE '+('authenticated' if user else 'anon'))
  c.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps({'sub':user,'role':'authenticated'} if user else {'role':'anon'}),))
  return c.execute('SELECT public.'+fn+'('+','.join(['%s']*len(args))+')',args).fetchone()[0]
def bootstrap():
 with psycopg.connect(DSN,autocommit=True) as c:
  c.execute('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);')
  c.execute("CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$; GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;")
  c.execute(Path('suggestion_box/migrations/001_pilot.sql').read_text())
  c.execute("INSERT INTO hllv_private.issue_links VALUES ('HLLV-007')")
class PilotTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):bootstrap()
 def setUp(self):
  with psycopg.connect(DSN) as c:
   c.execute('TRUNCATE hllv_private.audit,hllv_private.rate_limits,hllv_private.votes,hllv_private.board,hllv_private.reviews,hllv_private.versions,hllv_private.submissions,hllv_private.members,auth.users CASCADE')
   c.execute("UPDATE hllv_private.settings SET phase='setup',publication_authorized=false,protocol_reference=NULL,voting_until=NULL")
   for uid,role in [(A,'participant'),(B,'participant'),(M,'moderator'),(R,'reviewer'),(U,None),(V,'participant')]:
    c.execute('INSERT INTO auth.users VALUES(%s,%s,%s)',(uid,uid+'@test.invalid',None if uid==V else '2026-01-01T00:00:00Z'))
    if role:c.execute("INSERT INTO hllv_private.members(user_id,role,public_label,authorization_reference,authorized_until) VALUES(%s,%s,'QA fixture reviewer','PRIVATE-AUTHORIZATION-FIXTURE',now()+interval '30 days')",(uid,role))
 def open_intake(self):admin("UPDATE hllv_private.settings SET phase='intake',publication_authorized=true,protocol_reference='PRIVATE-PROTOCOL-FIXTURE'")
 def submit(self,user=A):return call(user,'hllv_submit',(Jsonb(PAYLOAD),))['id']
 def shortlist(self,sid,version=1):return call(M,'hllv_moderate',(sid,version,'shortlisted','Screened in test.',None))
 def clear(self,sid,version=1):return call(R,'hllv_review',(sid,version,'cleared','no_commitment','No commitment; QA fixture only.','PRIVATE-CORRESPONDENCE-FIXTURE'))
 def publish(self,ids):
  admin("UPDATE hllv_private.settings SET phase='review'")
  return call(M,'hllv_publish_batch',([uuid.UUID(s) for s in ids],))
 def make_public(self):
  self.open_intake();sid=self.submit();self.shortlist(sid);self.clear(sid);self.publish([sid]);return sid
 def denied(self,user,fn,args=()):
  with self.assertRaises(psycopg.Error):call(user,fn,args)
 def test_01_closed_by_default_and_anonymous_read_only(self):
  self.assertFalse(call(None,'hllv_pilot_status')['intake_open']);self.assertEqual(call(None,'hllv_board'),[])
  self.denied(None,'hllv_submit',(Jsonb(PAYLOAD),));self.denied(A,'hllv_submit',(Jsonb(PAYLOAD),))
 def test_02_review_authorization_gates_intake(self):
  admin("UPDATE hllv_private.settings SET phase='intake'");self.denied(A,'hllv_submit',(Jsonb(PAYLOAD),))
  self.open_intake();admin("UPDATE hllv_private.members SET authorized_until=now()-interval '1 day' WHERE role='reviewer'");self.denied(A,'hllv_submit',(Jsonb(PAYLOAD),))
 def test_03_membership_and_email_verification(self):
  self.open_intake();self.denied(U,'hllv_submit',(Jsonb(PAYLOAD),));self.denied(V,'hllv_submit',(Jsonb(PAYLOAD),));self.denied(M,'hllv_submit',(Jsonb(PAYLOAD),))
 def test_04_pending_private_and_cross_user_inaccessible(self):
  self.open_intake();sid=self.submit();self.assertEqual(call(None,'hllv_board'),[]);self.assertEqual(call(B,'hllv_board'),[])
  self.assertEqual(call(B,'hllv_my_submissions'),[]);self.assertEqual(call(A,'hllv_my_submissions')[0]['id'],sid)
  self.denied(B,'hllv_edit',(sid,1,Jsonb(PAYLOAD)));self.denied(B,'hllv_withdraw',(sid,));self.denied(B,'hllv_queue')
 def test_05_raw_tables_and_role_escalation_are_denied(self):
  for table in ['members','submissions','reviews','board','audit','versions','settings']:
   with self.assertRaises(psycopg.Error):
    with psycopg.connect(DSN) as c:c.execute('SET LOCAL ROLE authenticated');c.execute('SELECT * FROM hllv_private.'+table)
  with self.assertRaises(psycopg.Error):
   with psycopg.connect(DSN) as c:c.execute('SET LOCAL ROLE authenticated');c.execute("UPDATE hllv_private.members SET role='reviewer'")
 def test_06_moderator_cannot_clear_reviewer_cannot_publish(self):
  self.open_intake();sid=self.submit();self.shortlist(sid)
  self.denied(M,'hllv_review',(sid,1,'cleared','no_commitment','','PRIVATE-FAKE-REF'))
  self.denied(R,'hllv_publish_batch',([uuid.UUID(sid)],));self.denied(B,'hllv_moderate',(sid,1,'shortlisted','',None));self.denied(M,'hllv_publish_batch',([uuid.UUID(sid)],))
 def test_07_complete_cycle_public_projection_excludes_private_fields(self):
  sid=self.make_public();result=call(None,'hllv_board');self.assertEqual(len(result),1);public=json.dumps(result)
  for secret in ['PRIVATE-',A,M,R,'@test.invalid','owner_id','private_reference','authorization_reference']:self.assertNotIn(secret,public)
  self.assertEqual(result[0]['id'],sid);self.assertEqual(result[0]['implementation'],'no_commitment')
 def test_08_duplicate_votes_idempotent_and_removable(self):
  sid=self.make_public()
  for _ in range(3):call(B,'hllv_vote',(sid,1,True))
  self.assertEqual(call(None,'hllv_board')[0]['votes'],1);call(B,'hllv_vote',(sid,1,False));self.assertEqual(call(None,'hllv_board')[0]['votes'],0)
 def test_09_simultaneous_votes_are_not_double_counted(self):
  sid=self.make_public()
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(lambda _:call(B,'hllv_vote',(sid,1,True)),range(6)))
  self.assertEqual(call(None,'hllv_board')[0]['votes'],1)
 def test_10_voting_requires_active_invite_and_open_window(self):
  sid=self.make_public();self.denied(U,'hllv_vote',(sid,1,True));self.denied(None,'hllv_vote',(sid,1,True));self.denied(M,'hllv_vote',(sid,1,True))
  admin("UPDATE hllv_private.settings SET voting_until=now()-interval '1 second'");self.denied(B,'hllv_vote',(sid,1,True))
 def test_11_edit_unpublishes_and_old_clearance_cannot_apply(self):
  sid=self.make_public();call(B,'hllv_vote',(sid,1,True));call(A,'hllv_edit',(sid,1,Jsonb({**PAYLOAD,'title':'An edited control proposal'})))
  self.assertEqual(call(None,'hllv_board'),[]);self.shortlist(sid,2);self.denied(R,'hllv_review',(sid,1,'cleared','no_commitment','','PRIVATE-REF'))
  self.denied(M,'hllv_publish_batch',([uuid.UUID(sid)],));self.clear(sid,2);self.publish([sid]);self.assertEqual(call(None,'hllv_board')[0]['votes'],0)
  self.assertEqual(admin('SELECT count(*) FROM hllv_private.versions')[0][0],2)
 def test_12_moderator_rewrite_requires_owner_acceptance(self):
  self.open_intake();sid=self.submit();call(M,'hllv_edit',(sid,1,Jsonb(PAYLOAD)))
  self.denied(M,'hllv_moderate',(sid,2,'shortlisted','',None));self.denied(B,'hllv_accept_version',(sid,2))
  call(A,'hllv_accept_version',(sid,2));self.shortlist(sid,2);self.clear(sid,2);self.publish([sid])
 def test_13_withdraw_unpublishes_and_cannot_be_voted_on(self):
  sid=self.make_public();call(A,'hllv_withdraw',(sid,));self.assertEqual(call(None,'hllv_board'),[]);self.denied(B,'hllv_vote',(sid,1,True))
 def test_14_revoked_reviewer_fails_closed(self):
  sid=self.make_public();admin("UPDATE hllv_private.members SET active=false WHERE role='reviewer'");self.assertEqual(call(None,'hllv_board'),[]);self.denied(B,'hllv_vote',(sid,1,True))
 def test_15_two_per_person_capacity_includes_withdrawals(self):
  self.open_intake();sid=self.submit();call(A,'hllv_withdraw',(sid,));self.submit();self.denied(A,'hllv_submit',(Jsonb(PAYLOAD),))
 def test_16_global_capacity_serialized(self):
  self.open_intake()
  for n in range(14):
   uid=str(uuid.uuid4());admin('INSERT INTO auth.users VALUES(%s,%s,now())',(uid,'fixture@test.invalid'));admin("INSERT INTO hllv_private.members(user_id,role) VALUES(%s,'participant')",(uid,));self.submit(uid)
  def attempt(uid):
   try:self.submit(uid);return True
   except psycopg.Error:return False
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(attempt,[A,B]))
  self.assertEqual(sum(results),1)
 def test_17_atomic_batch_does_not_publish_uncleared_item(self):
  self.open_intake();a=self.submit();b=self.submit(B);self.shortlist(a);self.shortlist(b);self.clear(a);admin("UPDATE hllv_private.settings SET phase='review'")
  self.denied(M,'hllv_publish_batch',([uuid.UUID(a),uuid.UUID(b)],));self.assertEqual(call(None,'hllv_board'),[])
 def test_18_payload_cannot_override_owner_review_or_state(self):
  self.open_intake();r=call(A,'hllv_submit',(Jsonb({**PAYLOAD,'owner_id':B,'state':'published','reviewed':True,'votes':999}),))
  self.assertEqual(r['state'],'pending');self.assertEqual(call(B,'hllv_my_submissions'),[]);self.assertEqual(call(None,'hllv_board'),[])
 def test_19_validation_and_unlisted_issue(self):
  self.open_intake()
  for bad in [{**PAYLOAD,'related_issue':'HLLV-999999'},{**PAYLOAD,'title':'x'},{**PAYLOAD,'kind':'bug_priority','related_issue':''},{**PAYLOAD,'consent':False}]:self.denied(A,'hllv_submit',(Jsonb(bad),))
 def test_20_review_hold_supersedes_publication(self):
  sid=self.make_public();call(R,'hllv_review',(sid,1,'hold','no_commitment','','PRIVATE-HOLD-REF'));self.assertEqual(call(None,'hllv_board'),[]);self.denied(B,'hllv_vote',(sid,1,True))
 def test_21_shortlist_capacity(self):
  self.open_intake();ids=[]
  for n in range(6):
   uid=str(uuid.uuid4());admin('INSERT INTO auth.users VALUES(%s,%s,now())',(uid,'fixture@test.invalid'));admin("INSERT INTO hllv_private.members(user_id,role) VALUES(%s,'participant')",(uid,));ids.append(self.submit(uid))
  for sid in ids[:5]:self.shortlist(sid)
  self.denied(M,'hllv_moderate',(ids[-1],1,'shortlisted','',None))
 def test_22_rate_limit(self):
  self.open_intake();sid=self.submit()
  for _ in range(29):call(A,'hllv_accept_version',(sid,1))
  self.denied(A,'hllv_accept_version',(sid,1))
 def test_23_all_private_tables_have_rls_no_grants(self):
  self.assertTrue(all(row[0] for row in admin("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hllv_private' AND c.relkind='r'")))
  self.assertFalse(any(row[0] for row in admin("SELECT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hllv_private' AND c.relkind='r'")))
 def test_24_review_queue_and_duplicate_do_not_leak_identity(self):
  self.open_intake();a=self.submit();b=self.submit(B);self.shortlist(a);q=json.dumps(call(R,'hllv_queue'));self.assertNotIn(B,q);self.assertNotIn(A,q);self.assertNotIn(b,q)
  call(M,'hllv_moderate',(b,1,'duplicate','Already represented in the shortlist.',a));self.assertEqual(call(B,'hllv_my_submissions')[0]['state'],'duplicate')
if __name__=='__main__':unittest.main(verbosity=2)
