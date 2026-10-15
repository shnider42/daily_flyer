import importlib.util,json,unittest,tempfile
from unittest.mock import patch
from datetime import datetime,timezone
from pathlib import Path
spec=importlib.util.spec_from_file_location('nightly',Path(__file__).with_name('nightly.py'));n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
class FeedTests(unittest.TestCase):
 def fixture(self,**extra):return json.dumps({'appnews':{'appid':3079210,'newsitems':[{'gid':'12345','date':1791367263,'title':'Patch 1.6 announcement','url':'https://steamcommunity.com/games/3079210/announcements/detail/12345','feedname':'steam_community_announcements','contents':'<p>Publisher text with crashes and stability corrections.</p><script>never run me</script>',**extra}]}}).encode()
 def test_safe_preview_and_matches(self):
  a=n.normalize(self.fixture(),datetime(2026,10,12,tzinfo=timezone.utc),[{'id':'HLLV-003','title':'Crashes and stability'}])[0]
  self.assertLessEqual(len(a['title'].split())+len(a['excerpt'].split()),24);self.assertNotIn('never run',a['excerpt']);self.assertEqual(a['candidate_issue_ids'],['HLLV-003']);self.assertEqual(a['review_state'],'automatically_collected')
 def test_untrusted_urls(self):
  for url in ['http://steamcommunity.com/x','https://steamcommunity.com.evil.invalid/x','https://user:pass@steamcommunity.com/x','https://127.0.0.1/x','https://steamcommunity.com:8443/x']:
   self.assertFalse(n.allowed(url))
   with self.assertRaises(ValueError):n.normalize(self.fixture(url=url),datetime.now(timezone.utc),[])
 def test_empty_wrong_and_future(self):
  for raw in [b'{}',b'{"appnews":{"appid":3079210,"newsitems":[]}}',self.fixture(date=9999999999)]:
   with self.assertRaises(ValueError):n.normalize(raw,datetime.now(timezone.utc),[])
 def test_filter_nonofficial(self):
  with self.assertRaises(ValueError):n.normalize(self.fixture(feedname='gaming_news'),datetime.now(timezone.utc),[])
 def test_content_changes_detectable(self):
  a=n.normalize(self.fixture(),datetime.now(timezone.utc),[])[0];b=n.normalize(self.fixture(contents='Changed official text'),datetime.now(timezone.utc),[])[0]
  self.assertNotEqual(a['content_sha256'],b['content_sha256'])
 def test_failed_feed_preserves_previous_success_and_ledger(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'data').mkdir();raw=b'{"issues":[]}';(root/'data/issues.json').write_bytes(raw)
   old={'schema_version':1,'items':[{'id':'12345','title':'Previous announcement','published_at':'2026-10-07T12:00:00Z'}],'last_success_at':'2026-10-07T13:00:00Z','link_checks':{}}
   (root/'official-feed.json').write_text(json.dumps(old))
   with patch.object(n,'ROOT',root),patch.object(n,'OUTPUT',root/'official-feed.json'),patch.object(n,'fetch',side_effect=RuntimeError('offline')), patch.object(n,'collect_responses',return_value={'schema_version':1,'state':'unavailable','threads':[]}):n.main()
   saved=json.loads((root/'official-feed.json').read_text());self.assertEqual(saved['last_success_at'],old['last_success_at']);self.assertEqual(saved['items'],old['items']);self.assertEqual(saved['state'],'feed_unavailable');self.assertEqual((root/'data/issues.json').read_bytes(),raw)
if __name__=='__main__':unittest.main(verbosity=2)
