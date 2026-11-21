"""Isolated PostgreSQL authorization/workflow tests. NEVER run against a hosted project."""
import concurrent.futures,json,os,unittest,uuid
from pathlib import Path
import psycopg
from psycopg.types.json import Jsonb
from urllib.parse import urlsplit
DSN=os.environ['COMMUNITY_TEST_DATABASE_URL'];assert urlsplit(DSN).hostname in ('localhost','127.0.0.1')
A,B,M,R,I,N,X=[str(uuid.uuid4()) for _ in range(7)];SESS={u:str(uuid.uuid4()) for u in [A,B,M,R,I,N,X]}
P={'kind':'suggestion','title':'Clearer helicopter controls','problem':'It is hard to identify which bindings control helicopter actions.','desired_outcome':'Give each flight control a clearer description.','related_issue':'HLLV-007','consent':True,'policy_version':'community-v1'}
def admin(sql,args=()):
    with psycopg.connect(DSN) as c:
        r=c.execute(sql,args)
        return r.fetchall() if r.description else None

def call(user,action,payload=None,session=True):
    with psycopg.connect(DSN) as c:
        c.execute('SET LOCAL ROLE '+('authenticated' if user else 'anon'))
        claims={'sub':user,'role':'authenticated','session_id':SESS.get(user) if session else str(uuid.uuid4()),'user_metadata':{'role':'moderator'}} if user else {'role':'anon'}
        c.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps(claims),))
        return c.execute('SELECT public.hllv_community(%s,%s)',(action,Jsonb(payload or {}))).fetchone()[0]

def target(s):return {k:s[k] for k in ('id','version','updated_at')}
class CommunityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with psycopg.connect(DSN,autocommit=True) as c:
            c.execute('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false,banned_until timestamptz); CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users,not_after timestamptz);')
            c.execute("CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$; GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid() TO anon,authenticated;")
            c.execute(Path('suggestion_box/migrations/001_pilot.sql').read_text())
            c.execute(Path('.github/hllv-community/schema.sql').read_text())
            c.execute("INSERT INTO hllv_private.issue_links VALUES('HLLV-007')")
    def setUp(self):
        admin('TRUNCATE hllv_private.audit,hllv_private.votes,hllv_private.board,hllv_private.reviews,hllv_private.community_approvals,hllv_private.versions,hllv_private.submissions,hllv_private.rate_limits,hllv_private.members,auth.sessions,auth.users CASCADE')
        admin('UPDATE hllv_private.community_settings SET enabled=true')
        for u in SESS:
            admin('INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous) VALUES(%s,%s,%s,%s)',(u,u+'@example.invalid',None if u==N else '2026-01-01',u==X))
            admin('INSERT INTO auth.sessions(id,user_id) VALUES(%s,%s)',(SESS[u],u))
        admin("INSERT INTO hllv_private.members(user_id,role,active) VALUES(%s,'moderator',true),(%s,'reviewer',true),(%s,'participant',false)",(M,R,I))
    def submit(self,user=A,**extra):return call(user,'submit',{**P,'request_id':str(uuid.uuid4()),**extra})
    def approve(self,s):return call(M,'moderate',{**target(s),'decision':'published','note':'PRIVATE-MODERATOR-NOTE'})
    def denied(self,u,action,payload=None,session=True):
        with self.assertRaises(psycopg.Error):call(u,action,payload,session)
    def test_01_public_reads_private_writes(self):
        self.assertEqual(call(None,'board')['rows'],[])
        for a in ['profile','mine','queue','submit','moderate','vote','find_submission']:self.denied(None,a)
    def test_02_verified_account_without_pilot_membership_can_submit(self):
        self.assertEqual(call(A,'profile')['role'],'participant');self.assertEqual(self.submit()['state'],'pending')
        self.assertEqual(admin('SELECT count(*) FROM hllv_private.members WHERE user_id=%s',(A,))[0][0],0)
    def test_03_account_and_session_checks(self):
        for u in [I,N,X]:self.denied(u,'profile')
        self.denied(A,'profile',session=False)
        admin("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=%s",(A,));self.denied(A,'profile')
    def test_04_private_submission_is_not_public(self):
        s=self.submit();self.assertEqual(call(None,'board')['total'],0);self.assertEqual(call(B,'mine')['rows'],[])
        self.denied(B,'edit',{**target(s),**P});self.denied(B,'withdraw',target(s))
        self.assertIsNone(call(B,'find_submission',{'request_id':s['request_id']}))
    def test_05_only_owner_selected_moderators_approve(self):
        s=self.submit()
        for u in [A,B,R]:
            self.denied(u,'queue');self.denied(u,'moderate',{**target(s),'decision':'published'})
        self.assertEqual(self.approve(s)['approval_label'],'Moderator approved')
    def test_06_no_forged_developer_review_or_private_public_data(self):
        s=self.approve(self.submit(state='published',role='moderator',developer_review='approved'))
        board=call(None,'board')['rows'];self.assertEqual(len(board),1);raw=json.dumps(board)
        for secret in [A,M,'PRIVATE-MODERATOR-NOTE','owner_id','moderator_id','request_id','submitter_note','history','example.invalid']:self.assertNotIn(secret,raw)
        self.assertEqual(board[0]['developer_review'],'Not recorded');self.assertEqual(admin('SELECT count(*) FROM hllv_private.reviews')[0][0],0)
    def test_07_support_idempotent_removable(self):
        s=self.approve(self.submit())
        for _ in range(3):call(B,'vote',{'id':s['id'],'version':s['version'],'support':True})
        self.assertEqual(call(None,'board')['rows'][0]['votes'],1)
        call(B,'vote',{'id':s['id'],'version':s['version'],'support':False});self.assertEqual(call(None,'board')['rows'][0]['votes'],0)
    def test_08_parallel_votes_count_once(self):
        s=self.approve(self.submit())
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as p:list(p.map(lambda _:call(B,'vote',{'id':s['id'],'version':s['version'],'support':True}),range(5)))
        self.assertEqual(call(None,'board')['rows'][0]['votes'],1)
    def test_09_voting_rejects_unpublished_and_anonymous(self):
        s=self.submit();self.denied(B,'vote',{'id':s['id'],'version':1,'support':True});s=self.approve(s);self.denied(None,'vote',{'id':s['id'],'version':1,'support':True})
    def test_10_idempotent_submit_after_lost_response(self):
        request=str(uuid.uuid4());s=self.submit(request_id=request);again=call(A,'submit',{**P,'request_id':request})
        self.assertEqual(s['id'],again['id']);self.assertEqual(call(A,'mine')['total'],1)
    def test_11_revised_wording_loses_publication_and_old_votes(self):
        s=self.approve(self.submit());call(B,'vote',{'id':s['id'],'version':1,'support':True})
        s=call(A,'edit',{**target(s),**P,'title':'Revised helicopter controls request'})
        self.assertEqual(s['state'],'pending');self.assertEqual(s['version'],2);self.assertEqual(call(None,'board')['rows'],[])
        s=self.approve(s);self.assertEqual(s['votes'],0);self.denied(B,'vote',{'id':s['id'],'version':1,'support':True})
    def test_12_withdraw_removes_publication(self):
        s=self.approve(self.submit());call(A,'withdraw',target(s));self.assertEqual(call(None,'board')['total'],0)
        self.assertEqual(call(M,'queue')['total'],0)
    def test_13_stale_moderator_decision_rejected(self):
        s=self.submit();self.approve(s);self.denied(M,'moderate',{**target(s),'decision':'declined','note':'Not selected in stale request.'})
    def test_14_clarification_stays_private(self):
        s=self.submit();s=call(M,'moderate',{**target(s),'decision':'needs_information','note':'Please include reproduction steps.'})
        self.assertEqual(call(A,'mine')['rows'][0]['submitter_note'],'Please include reproduction steps.');self.assertEqual(call(None,'board')['rows'],[])
    def test_15_moderators_can_submit_and_support(self):
        s=self.approve(self.submit(M));call(M,'vote',{'id':s['id'],'version':1,'support':True});self.assertEqual(call(None,'board')['rows'][0]['votes'],1)
    def test_16_limits_and_consent(self):
        self.denied(A,'submit',{**P,'request_id':str(uuid.uuid4()),'consent':False})
        for _ in range(3):self.submit()
        self.denied(A,'submit',{**P,'request_id':str(uuid.uuid4())})
    def test_17_raw_access_and_helper_denied(self):
        for sql in ['SELECT * FROM hllv_private.submissions','SELECT * FROM hllv_private.community_approvals',"UPDATE hllv_private.members SET role='moderator'","SELECT hllv_private.community_actor()"]:
            with self.assertRaises(psycopg.Error):
                with psycopg.connect(DSN) as c:c.execute('SET LOCAL ROLE authenticated');c.execute(sql)
    def test_18_paused_intake_not_an_auth_bypass(self):
        s=self.approve(self.submit());admin('UPDATE hllv_private.community_settings SET enabled=false')
        self.assertFalse(call(None,'status')['enabled']);self.assertEqual(call(None,'board')['total'],1)
        self.denied(B,'vote',{'id':s['id'],'version':1,'support':True});self.denied(B,'submit',{**P,'request_id':str(uuid.uuid4())});call(A,'withdraw',target(s))
    def test_19_legacy_authority_not_changed(self):
        self.approve(self.submit());state=admin('SELECT public.hllv_pilot_status()')[0][0];self.assertEqual(state['phase'],'setup');self.assertFalse(state['intake_open']);self.assertEqual(admin('SELECT public.hllv_board()')[0][0],[])
    def test_20_unpublish_and_invalid_transitions(self):
        s=self.approve(self.submit());s=call(M,'moderate',{**target(s),'decision':'needs_information','note':'Clarification required before republication.'});self.assertEqual(call(None,'board')['total'],0)
        self.denied(M,'moderate',{**target(s),'decision':'developer_approved'});self.denied(B,'edit',{**target(s),**P})
if __name__=='__main__':unittest.main(verbosity=2)
