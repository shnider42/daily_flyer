"""Run the existing authorization suite plus new-kind and date-order cases locally only."""
import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('community_tests','.github/hllv-community/test_database.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
base=m.CommunityTests.setUpClass.__func__
def setup(cls):
    base(cls)
    m.admin(Path('.github/hllv-ux-20261012/schema.sql').read_text())
m.CommunityTests.setUpClass=classmethod(setup)
def report(self):
    s=self.submit(kind='problem_report',title='Report an unexpected voice-chat failure',desired_outcome='Voice chat could continue after switching servers.')
    self.assertEqual(s['kind'],'problem_report');self.assertEqual(m.call(None,'board')['total'],0)
    s=self.approve(s);self.assertEqual(m.call(None,'board')['rows'][0]['kind'],'problem_report')
    self.assertEqual(s['developer_review'],'Not recorded')
def priority(self):
    self.denied(m.A,'submit',{**m.P,'kind':'bug_priority','related_issue':'','request_id':str(m.uuid.uuid4())})
    self.submit(kind='problem_report',related_issue='')
    self.denied(m.B,'submit',{**m.P,'kind':'arbitrary_type','request_id':str(m.uuid.uuid4())})
def order(self):
    a=self.submit(title='Earlier voice chat opportunity');b=self.submit(title='Later voice chat opportunity')
    self.assertEqual(m.call(m.M,'queue')['rows'][0]['id'],b['id'])
    self.assertEqual(m.call(m.M,'queue',{'order':'oldest'})['rows'][0]['id'],a['id'])
    self.assertEqual(m.call(m.A,'mine')['rows'][0]['id'],b['id'])
    a=self.approve(a);b=self.approve(b)
    self.assertEqual(m.call(None,'board',{'order':'newest'})['rows'][0]['id'],b['id'])
    self.assertEqual(m.call(None,'board',{'order':'oldest'})['rows'][0]['id'],a['id'])
    m.call(m.B,'vote',{'id':a['id'],'version':1,'support':True})
    self.assertEqual(m.call(None,'board',{'order':'votes'})['rows'][0]['id'],a['id'])
m.CommunityTests.test_21_problem_report=report;m.CommunityTests.test_22_type_constraints=priority;m.CommunityTests.test_23_date_order=order
unittest.main(module=m,verbosity=2)
