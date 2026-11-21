"""Isolated PostgreSQL checks. Refuses non-local connections; no real accounts."""
import os,json,uuid,unittest,concurrent.futures
from pathlib import Path
import psycopg
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from psycopg.types.json import Jsonb
base=os.environ['PILOT_TEST_DATABASE_URL'];parts=conninfo_to_dict(base)
assert parts['host'] in ('localhost','127.0.0.1') and parts['dbname']=='pilot_test'
with psycopg.connect(base,autocommit=True) as c:c.execute('CREATE DATABASE practice_test')
DSN=make_conninfo(base,dbname='practice_test')
M,N,P,R=[str(uuid.uuid4()) for _ in range(4)];sessions={u:str(uuid.uuid4()) for u in (M,N,P,R)}
payload={'kind':'suggestion','title':'Synthetic private practice','problem':'This is synthetic practice text, not a real bug report.','desired_outcome':'Understand the private test workflow.','practice_ack':True,'related_issue':'HLLV-007'}
with psycopg.connect(DSN,autocommit=True) as c:
 c.execute("CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);")
 c.execute("CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;GRANT USAGE ON SCHEMA auth TO anon,authenticated;GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated;")
 c.execute(Path('suggestion_box/migrations/001_pilot.sql').read_text());c.execute("INSERT INTO hllv_private.issue_links VALUES ('HLLV-007')")
 c.execute(Path('.github/hllv-rehearsal/schema.sql').read_text())
 for u,role in [(M,'moderator'),(N,'moderator'),(P,'participant'),(R,'reviewer')]:
  c.execute('INSERT INTO auth.users VALUES(%s,%s,now())',(u,u+'@example.invalid'))
  c.execute('INSERT INTO auth.sessions VALUES(%s,%s,NULL)',(sessions[u],u))
  c.execute("INSERT INTO hllv_private.members(user_id,role,public_label,authorization_reference,authorized_until) VALUES(%s,%s,'Synthetic reviewer','TEST-PRIVATE-REF',now()+interval '1 day')",(u,role))
def call(user=M,action='get',data=None,row=None,session='default'):
 claims={'role':'authenticated','sub':user,'session_id':sessions.get(user)} if user else {'role':'anon'}
 if session!='default':claims['session_id']=session
 with psycopg.connect(DSN) as c:
  c.execute('SET LOCAL ROLE '+('authenticated' if user else 'anon'));c.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps(claims),))
  return c.execute('SELECT public.hllv_rehearsal(%s,%s,%s,%s)',(action,Jsonb(data or {}),row['id'] if row else None,row['version'] if row else None)).fetchone()[0]
def sql(q,args=()):
 with psycopg.connect(DSN) as c:
  r=c.execute(q,args);return r.fetchall() if r.description else None
class Tests(unittest.TestCase):
 def setUp(self):
  sql('TRUNCATE hllv_private.rehearsals,hllv_private.rate_limits');sql('UPDATE auth.sessions SET not_after=NULL');sql('UPDATE hllv_private.members SET active=true')
 def test_01_roles(self):
  self.assertIsNone(call())
  for u in (None,P,R):
   with self.assertRaises(psycopg.Error):call(u)
 def test_02_private_projection_and_owned_read(self):
  r=call(action='save',data={**payload,'owner_id':N,'state':'published','can_publish':True});self.assertTrue(r['practice_only']);self.assertFalse(r['can_publish']);self.assertNotIn('owner_id',r);self.assertEqual(r['state'],'pending');self.assertEqual(call()['id'],r['id']);self.assertIsNone(call(N))
 def test_03_other_moderator_cannot_edit_or_remove(self):
  r=call(action='save',data=payload)
  for action in ('save','remove','shortlisted'):
   with self.assertRaises(psycopg.Error):call(N,action,payload,r)
 def test_04_exact_revision_required(self):
  r=call(action='save',data=payload);v=call(action='shortlisted',row=r);self.assertEqual(v['version'],2)
  with self.assertRaises(psycopg.Error):call(action='pending',row=r)
 def test_05_notes_and_edit_reset(self):
  r=call(action='save',data=payload)
  with self.assertRaises(psycopg.Error):call(action='needs_information',row=r)
  r=call(action='needs_information',data={'note':'Explain this test.'},row=r);r=call(action='save',data=payload,row=r);self.assertEqual(r['state'],'pending');self.assertEqual(len(r['history']),3)
 def test_06_no_public_actions_or_public_rows(self):
  r=call(action='save',data=payload)
  for action in ('publish','clear','vote',None):
   with self.assertRaises(psycopg.Error):call(action=action,row=r)
  self.assertEqual(sql('SELECT count(*) FROM hllv_private.submissions')[0][0],0);self.assertEqual(sql('SELECT public.hllv_board()')[0][0],[]);self.assertFalse(sql('SELECT public.hllv_pilot_status()')[0][0]['intake_open'])
 def test_07_delete_and_stale_id(self):
  r=call(action='save',data=payload);self.assertIsNone(call(action='remove',row=r));self.assertIsNone(call());new=call(action='save',data=payload);self.assertNotEqual(new['id'],r['id'])
  with self.assertRaises(psycopg.Error):call(action='save',data=payload,row=r)
 def test_08_sessions_and_revoked_membership(self):
  for sid in (None,str(uuid.uuid4()),sessions[N]):
   with self.assertRaises(psycopg.Error):call(session=sid)
  sql("UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE user_id=%s",(M,))
  with self.assertRaises(psycopg.Error):call()
  sql('UPDATE auth.sessions SET not_after=NULL');sql('UPDATE hllv_private.members SET active=false WHERE user_id=%s',(M,))
  with self.assertRaises(psycopg.Error):call()
 def test_09_concurrent_create(self):
  def attempt(_):
   try:call(action='save',data=payload);return True
   except psycopg.Error:return False
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(attempt,range(2)))
  self.assertEqual(sum(results),1);self.assertEqual(sql('SELECT count(*) FROM hllv_private.rehearsals')[0][0],1)
 def test_10_required_fields_and_ack(self):
  for p in [{**payload,'practice_ack':False},{**payload,'title':'x'},{**payload,'related_issue':'HLLV-999'},{**payload,'kind':'bug_priority','related_issue':None}]:
   with self.assertRaises(psycopg.Error):call(action='save',data=p)
 def test_11_raw_table_denied(self):
  for role in ('anon','authenticated'):
   with self.assertRaises(psycopg.Error):
    with psycopg.connect(DSN) as c:c.execute('SET LOCAL ROLE '+role);c.execute('SELECT * FROM hllv_private.rehearsals')
 def test_12_history_bounded(self):
  r=call(action='save',data=payload)
  for _ in range(29):r=call(action='pending',row=r)
  self.assertEqual(len(r['history']),30);sql('TRUNCATE hllv_private.rate_limits')
  with self.assertRaises(psycopg.Error):call(action='pending',row=r)
  self.assertIsNone(call(action='remove',row=r))
if __name__=='__main__':unittest.main(verbosity=2)
