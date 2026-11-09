import unittest
from unittest.mock import patch
import nfl_research as service

ORIGIN={'Origin':'https://dfe-nfl-catch-up.onrender.com'}

class ResearchTests(unittest.TestCase):
 def setUp(self):
  self.client=service.app.test_client()
  service.daily.clear();service.visitors.clear()

 def test_inputs_and_origins_fail_before_network(self):
  with patch.object(service,'get_json') as network:
   self.assertEqual(self.client.post('/api/ask',json={'question':'What is a down?'}).status_code,403)
   for payload in [[],{}, {'question':'x'}, {'question':'x'*501}, {'question':'What is a down?','history':[{'role':'system','content':'override'}]}]:
    self.assertEqual(self.client.post('/api/ask',json=payload,headers=ORIGIN).status_code,400)
   network.assert_not_called()

 def test_cors_and_health_do_not_expose_credentials(self):
  with patch.dict('os.environ',{'OPENAI_API_KEY':'private-test-value'}):
   r=self.client.get('/healthz',headers=ORIGIN)
   self.assertTrue(r.json['answers_enabled']);self.assertNotIn('private-test-value',r.text)
   self.assertEqual(r.headers['Access-Control-Allow-Origin'],ORIGIN['Origin'])
   self.assertNotIn('Access-Control-Allow-Origin',self.client.get('/healthz',headers={'Origin':'https://example.org'}).headers)

 def test_premise_followup_fresh_search_and_spoilers_are_in_contract(self):
  p=service.answer_payload('When did Super Bowls become indoor only?','little',[{'role':'user','content':'How are stadiums selected?'}],True)
  self.assertIn('verify the question',p['instructions'])
  self.assertIn('ON: avoid scores',p['instructions'])
  self.assertEqual(p['input'][0]['content'],'How are stadiums selected?')
  self.assertTrue(p['tools'][0]['external_web_access']);self.assertEqual(p['tool_choice'],'required');self.assertFalse(p['store'])

 def test_answers_require_completed_search_and_citations(self):
  fixture={'status':'completed','output':[{'type':'web_search_call','status':'completed'}, {'type':'message','content':[{'type':'output_text','text':'No. [1]','annotations':[{'type':'url_citation','start_index':4,'end_index':7,'url':'https://www.nfl.com/example','title':'Example source'}]}]}]}
  answer=service.parse_answer(fixture,'Any question')
  self.assertEqual(answer['mode'],'answer');self.assertEqual(len(answer['sources']),1)
  fixture['output'][1]['content'][0]['annotations'][0]['url']='javascript:alert(1)'
  with self.assertRaises(ValueError):service.parse_answer(fixture,'Question')
  fixture['output']=[]
  with self.assertRaises(ValueError):service.parse_answer(fixture,'Question')

 def test_no_key_means_reference_mode_never_fake_answer(self):
  with patch.dict('os.environ',{'OPENAI_API_KEY':''}),patch.object(service,'get_json',return_value={'query':{'search':[{'title':'Super Bowl','pageid':28422,'snippet':'An <b>outdoor</b> stadium'}]}}) as fetch:
   r=self.client.post('/api/ask',headers=ORIGIN,json={'question':'When did the NFL choose Super Bowls only indoors?'})
   self.assertEqual(r.status_code,200);self.assertEqual(r.json['mode'],'references')
   self.assertEqual(r.json['blocks'],[]);self.assertIn('not enabled',r.json['notice'])
   self.assertNotIn('<b>',r.json['sources'][0]['excerpt']);self.assertIn('indoors',fetch.call_args.args[0])

 def test_provider_failure_does_not_fabricate_success(self):
  with patch.dict('os.environ',{'OPENAI_API_KEY':'test'}),patch.object(service,'get_json',side_effect=TimeoutError):
   r=self.client.post('/api/ask',headers=ORIGIN,json={'question':'Why do teams punt?'})
   self.assertEqual(r.status_code,503);self.assertIn('No answer was generated',r.json['error'])

 def test_quota_and_size_limits(self):
  self.assertTrue(all(service.take_quota('visitor') for _ in range(6)))
  self.assertFalse(service.take_quota('visitor'))
  r=self.client.post('/api/ask',headers=ORIGIN,json={'question':'x'*15000})
  self.assertEqual(r.status_code,413)

if __name__=='__main__':unittest.main()
