import importlib.util,unittest,json
from pathlib import Path
from datetime import datetime,timezone
s=importlib.util.spec_from_file_location('aff',Path(__file__).with_name('affiliates.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
NOW=datetime(2026,10,15,14,tzinfo=timezone.utc)
GOOD=b'<a href="https://www.youtube.com/@SoulSniperYT">SoulSniper</a><a href="https://www.youtube.com/@GebatronGaming">Gebatron</a>'
def get(u):return b'User-agent: *\nDisallow:\n' if u.endswith('robots.txt') else GOOD
class Tests(unittest.TestCase):
 def test_directory_is_not_comment_coverage(self):
  r=a.collect({},NOW,get);self.assertEqual(r['directory_verified_count'],2);self.assertEqual(r['state'],'not_connected');self.assertFalse(r['content_collection_enabled'])
 def test_same_name_wrong_url_not_verified(self):
  r=a.collect({},NOW,lambda u:get(u).replace(b'@SoulSniperYT',b'@impostor'));self.assertEqual(r['directory_verified_count'],1)
 def test_same_url_wrong_label_not_verified(self):
  r=a.collect({},NOW,lambda u:get(u).replace(b'>SoulSniper<',b'>Not verified<'));self.assertEqual(r['directory_verified_count'],1)
 def test_robots_denial_no_directory_fetch(self):
  seen=[]
  def f(u):seen.append(u);return b'User-agent: *\nDisallow: /'
  r=a.collect({},NOW,f);self.assertEqual(len(seen),1);self.assertEqual(r['directory_verified_count'],0)
 def test_outage_keeps_date_not_false_current_verification(self):
  old=a.collect({},NOW,get)
  def f(u):raise TimeoutError()
  r=a.collect(old,NOW,f);self.assertEqual(r['directory_verified_count'],0);self.assertEqual(r['channels'][0]['last_directory_verified_at'],old['channels'][0]['last_directory_verified_at'])
 def test_unsafe_channel_links(self):
  for u in ['http://www.youtube.com/@SoulSniperYT','https://www.youtube.com.evil.invalid/@SoulSniperYT','https://www.youtube.com/@SoulSniperYT?redirect=x','https://www.youtube.com/watch?v=fake','https://user@www.youtube.com/@SoulSniperYT']:
   self.assertIsNone(a.canonical_channel(u))
if __name__=='__main__':unittest.main(verbosity=2)
