import copy,importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('review',Path(__file__).with_name('content_review.py'));q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
class ReviewTests(unittest.TestCase):
 def setUp(self):
  self.data={'state':'complete','threads_total':1,'threads_complete':1,'verified_responses_retained':1,'threads':[{'url':'https://steamcommunity.com/app/3079210/discussions/1/123/','replies':[{'id':'456','content_sha256':'observed','excerpt':'Unrelated text','author_label':'Verified support','published_at':'2026-01-01T00:00:00Z'}]}]}
  self.rules=[{'thread_url':self.data['threads'][0]['url'],'response_id':'456','content_sha256':'observed','reason':'Needs context','flagged_at':'2026-10-15T00:00:00Z'}]
 def test_withholds_preview_not_attribution(self):
  r=q.apply(copy.deepcopy(self.data),self.rules);reply=r['threads'][0]['replies'][0]
  self.assertNotIn('excerpt',reply);self.assertEqual(reply['author_label'],'Verified support');self.assertEqual(reply['content_sha256'],'observed');self.assertEqual(r['content_reviews_pending'],1);self.assertEqual(r['threads_complete'],1)
 def test_different_hash_not_held(self):
  d=copy.deepcopy(self.data);d['threads'][0]['replies'][0]['content_sha256']='changed';r=q.apply(d,self.rules)
  self.assertEqual(r['content_reviews_pending'],0);self.assertIn('excerpt',r['threads'][0]['replies'][0])
 def test_different_thread_not_held(self):
  d=copy.deepcopy(self.data);d['threads'][0]['url']+='different';self.assertEqual(q.apply(d,self.rules)['content_reviews_pending'],0)
 def test_removal_does_not_mark_editorially_approved(self):
  d=q.apply(copy.deepcopy(self.data),self.rules);q.apply(d,[]);self.assertNotIn('content_review',d['threads'][0]['replies'][0]);self.assertNotIn('editorially_approved',str(d))
 def test_repeated_application_is_idempotent(self):
  once=q.apply(copy.deepcopy(self.data),self.rules);self.assertEqual(once,q.apply(copy.deepcopy(once),self.rules))
if __name__=='__main__':unittest.main(verbosity=2)
