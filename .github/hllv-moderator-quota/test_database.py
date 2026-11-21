"""Existing community authorization suite plus moderator quota regressions. Local DB only."""
import importlib.util,unittest,uuid,concurrent.futures
from pathlib import Path
spec=importlib.util.spec_from_file_location('community_tests','.github/hllv-community/test_database.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
base=m.CommunityTests.setUpClass.__func__
def setup(cls):
    base(cls)
    m.admin(Path('.github/hllv-ux-20261012/schema.sql').read_text())
    m.admin(Path('.github/hllv-moderator-quota/schema.sql').read_text())
m.CommunityTests.setUpClass=classmethod(setup)

def mod_unlimited(self):
    rows=[self.submit(m.M,kind=kind) for kind in ['suggestion','problem_report','bug_priority'] for _ in range(3)]
    self.assertEqual(len({r['id'] for r in rows}),9)
    self.assertEqual(m.call(m.M,'mine')['total'],9)
    self.assertEqual(m.call(None,'board')['total'],0)

def nonmods(self):
    for user in [m.A,m.R]:
        for kind in ['suggestion','problem_report','bug_priority']:self.submit(user,kind=kind)
        self.denied(user,'submit',{**m.P,'request_id':str(uuid.uuid4())})
        self.assertEqual(m.call(user,'mine')['total'],3)

def spoof(self):
    for _ in range(3):self.submit(role='moderator',daily_submission_limit=None)
    self.denied(m.A,'submit',{**m.P,'request_id':str(uuid.uuid4()),'role':'moderator','daily_submission_limit':None})
    self.assertEqual(m.call(m.A,'profile')['daily_submission_limit'],3)

def demotion(self):
    for _ in range(4):self.submit(m.M)
    m.admin("UPDATE hllv_private.members SET role='participant' WHERE user_id=%s",(m.M,))
    self.assertEqual(m.call(m.M,'profile')['daily_submission_limit'],3)
    self.denied(m.M,'submit',{**m.P,'request_id':str(uuid.uuid4())})
    m.admin("UPDATE hllv_private.members SET role='moderator',active=false WHERE user_id=%s",(m.M,))
    self.denied(m.M,'submit',{**m.P,'request_id':str(uuid.uuid4())})
    m.admin('UPDATE hllv_private.members SET active=true WHERE user_id=%s',(m.M,))
    self.denied(m.M,'submit',{**m.P,'request_id':str(uuid.uuid4())},session=False)

def retry_window(self):
    req=str(uuid.uuid4());a=self.submit(request_id=req)
    for _ in range(2):self.submit()
    self.assertEqual(m.call(m.A,'submit',{**m.P,'request_id':req})['id'],a['id'])
    self.denied(m.A,'submit',{**m.P,'request_id':str(uuid.uuid4())})
    m.admin("UPDATE hllv_private.submissions SET created_at=now()-interval '25 hours' WHERE id=%s",(a['id'],))
    self.submit();self.assertEqual(m.call(m.A,'mine')['total'],4)

def votes(self):
    rows=[self.approve(self.submit(m.M)) for _ in range(6)]
    for row in rows:m.call(m.M,'vote',{'id':row['id'],'version':1,'support':True})
    first=rows[0]
    m.call(m.M,'vote',{'id':first['id'],'version':1,'support':True})
    self.assertTrue(all(r['votes']==1 for r in m.call(None,'board')['rows']))
    m.call(m.M,'vote',{'id':first['id'],'version':1,'support':False})
    m.call(m.M,'vote',{'id':first['id'],'version':1,'support':True})
    self.assertTrue(all(r['votes']==1 for r in m.call(None,'board')['rows']))

def burst(self):
    req=str(uuid.uuid4())
    for _ in range(30):m.call(m.M,'submit',{**m.P,'request_id':req})
    self.denied(m.M,'submit',{**m.P,'request_id':req})
    self.assertEqual(m.call(m.M,'mine')['total'],1)

def profile(self):
    self.assertIsNone(m.call(m.M,'profile')['daily_submission_limit'])
    for u in [m.A,m.R]:self.assertEqual(m.call(u,'profile')['daily_submission_limit'],3)
    status=m.call(None,'status');self.assertEqual(status['daily_submission_limit'],3)
    self.assertIs(status['moderator_submission_limit_exempt'],True)
    self.denied(None,'profile')

def concurrent_quota(self):
    def attempt(user):
        try:return bool(self.submit(user)['id'])
        except m.psycopg.Error:return False
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        self.assertEqual(sum(pool.map(attempt,[m.A]*4)),3)
        self.assertEqual(sum(pool.map(attempt,[m.M]*6)),6)
for name,fn in [('21_moderators_across_all_types',mod_unlimited),('22_every_nonmoderator_stays_capped',nonmods),('23_client_role_spoofing_cannot_exempt',spoof),('24_demotion_and_session_checks',demotion),('25_retry_and_rolling_window',retry_window),('26_moderator_votes_remain_unique',votes),('27_burst_protection_remains',burst),('28_profile_limits',profile),('29_parallel_submission_quotas',concurrent_quota)]:
    setattr(m.CommunityTests,'test_'+name,fn)
unittest.main(module=m,verbosity=2)
