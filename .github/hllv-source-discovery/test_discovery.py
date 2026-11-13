"""Synthetic discovery/identity/budget tests. No network and no app identities."""
import copy,importlib.util,json,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
from unittest.mock import patch

def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
S=Path(__file__).parent;d=load('discovery',S/'discovery.py');fixtures=load('reply_fixtures',S.parent/'hllv-source-responses/test_collector.py')
NOW=fixtures.NOW;REG=fixtures.REG;C=d.c;URL=fixtures.URL

def listing(section='1',page=1,ids=None,size=1,total=2):
 ids=ids or [str(200+(int(section)*10)+page)]
 meta={'appid':3079210,'feature':section,'is_public':1,'forum_url':C.HOST+'/app/3079210/discussions/'+section+'/', 'total_count':total,'start':(page-1)*size,'pagesize':size}
 rows=''.join('<div class="forum_topic" data-gidforumtopic="'+i+'"><a class="forum_topic_overlay" href="'+C.HOST+'/app/3079210/discussions/'+section+'/'+i+'/"></a><div class="forum_topic_name">Synthetic discovery '+i+'</div><div class="forum_topic_reply_count">1</div><div class="forum_topic_lastpost" data-timestamp="1791970000"></div><div class="forum_topic_op">Team17_fake_Untrusted_Name</div></div>' for i in ids)
 return '<script>InitializeForum("example",'+json.dumps(meta)+');</script>'+rows
class Client:
 def __init__(self,body='We are requesting reproduction details.'):self.urls=[];self.body=body
 def get(self,url):
  self.urls.append(url);section=url.split('/discussions/')[1][0];path=C.urlsplit(url).path
  if path.rstrip('/').endswith('/'+section):
   page=int(C.parse_qs(C.urlsplit(url).query)['fp'][0]);return listing(section,page)
  topic=path.rstrip('/').split('/')[-1]
  return fixtures.page([fixtures.comment(body=self.body)]).replace('123',topic)
class Tests(unittest.TestCase):
 def test_listing_parser_checks_source_not_poster_name(self):
  p=d.parse_listing(listing(), '1',1,NOW);self.assertEqual(len(p['rows']),1);self.assertNotIn('Team17_fake',json.dumps(p));self.assertEqual(p['rows'][0]['listed_reply_count'],1)
 def test_wrong_app_forum_and_count_rejected(self):
  for html in [listing().replace('3079210','686810'),listing().replace('"feature": "1"','"feature": "0"'),listing().replace('forum_topic"','missing"')]:
   with self.assertRaises(C.CoverageError):d.parse_listing(html,'1',1,NOW)
 def test_wrong_page_and_empty_markup_are_not_all_clear(self):
  for html in [listing(page=1),'<html>Sign in required</html>']:
   with self.assertRaises(C.CoverageError):d.parse_listing(html,'1',2,NOW)
 def test_safe_listing_destinations(self):
  self.assertEqual(C.collection_url(C.HOST+'/app/3079210/discussions/1/?fp=2&l=english'),C.HOST+'/app/3079210/discussions/1/')
  for u in [C.HOST+'/app/686810/discussions/1/',C.HOST+'/app/3079210/discussions/1/?fp=2&fp=1',C.HOST+'/app/3079210/discussions/1/?url=https://bad.invalid/',C.HOST+'/app/3079210/discussions/1/?fp=999',C.HOST+'/app/3079210/discussions/1/?l=bad','https://127.0.0.1/app/3079210/discussions/1/']:
   with self.assertRaises(C.CoverageError):C.collection_url(u)
 def test_first_scan_baseline_no_new_bug_records(self):
  issues=copy.deepcopy(fixtures.ISSUES);original=copy.deepcopy(issues)
  r=d.collect(issues,{},NOW,Client(),REG);self.assertEqual(r['staff_response_threads_retained'],4);self.assertEqual(r['new_replies_this_run'],0);self.assertEqual(issues,original)
  self.assertTrue(all(t['tracked_issue_ids']==[] for t in r['threads']));self.assertNotIn('_text',json.dumps(r));self.assertFalse(r['reviewed_issue_records_changed'])
 def test_known_source_not_scanned_twice(self):
  url=C.HOST+'/app/3079210/discussions/1/211/';client=Client();r=d.collect([{'id':'HLLV-002','sources':[{'url':url}]}],{},NOW,client,REG)
  self.assertFalse(any(url+'?' in u for u in client.urls));self.assertEqual(r['candidate_count'],3)
 def test_backlog_rotates_and_does_not_claim_full_coverage(self):
  with patch.object(d,'THREADS_PER_PASS',1):
   first=d.collect([],{},NOW,Client(),REG);second=d.collect([],first,NOW+timedelta(hours=1),Client(),REG)
  self.assertEqual(first['state'],'partial');self.assertEqual(first['awaiting_first_complete_scan'],3);self.assertEqual(second['awaiting_first_complete_scan'],2)
  self.assertFalse(next(t for t in second['threads'] if t['url']==first['threads'][0]['url'])['replies'][0]['observed_this_run'])
 def test_failed_second_listing_page_keeps_earlier_results(self):
  class Broken(Client):
   def get(self,u):
    if 'fp=2' in u:raise C.CoverageError('http_503')
    return super().get(u)
  r=d.collect([],{},NOW,Broken(),REG);self.assertEqual(r['state'],'partial');self.assertEqual(r['listings'][0]['pages_checked'],1);self.assertEqual(len(r['threads']),2)
 def test_duplicate_pages_are_incomplete(self):
  class Duplicate(Client):
   def get(self,u):
    if 'fp=' in u:
     sect=u.split('/discussions/')[1][0];page=int(C.parse_qs(C.urlsplit(u).query)['fp'][0]);return listing(sect,page,ids=['311' if sect=='1' else '411'])
    return super().get(u)
  r=d.collect([],{},NOW,Duplicate(),REG);self.assertEqual(r['listings'][0]['failure_kind'],'duplicate_listing_page')
 def test_later_comment_pages_are_read(self):
  class Later(Client):
   def get(self,u):
    if 'fp=' in u:return super().get(u)
    topic=C.urlsplit(u).path.rstrip('/').split('/')[-1];n=int(C.parse_qs(C.urlsplit(u).query)['ctp'][0])
    return fixtures.page([fixtures.comment('201',False,fixtures.OTHER)] if n==1 else [fixtures.comment('202')],total=2,size=1,start=n-1).replace('123',topic)
  r=d.collect([],{},NOW,Later(),REG);self.assertEqual(r['threads_complete_this_run'],4);self.assertTrue(all(t['pages_checked']==2 for t in r['threads']))
 def test_impostor_developer_badge_requires_identity_review(self):
  class Other(Client):
   def get(self,u):return super().get(u).replace(fixtures.STAFF,fixtures.OTHER).replace(str(int(fixtures.STAFF)-C.BASE_ID),str(int(fixtures.OTHER)-C.BASE_ID))
  r=d.collect([],{},NOW,Other(),REG);self.assertEqual(r['staff_responses_retained'],0);self.assertEqual(r['identities_pending'],1)
 def test_edits_detected_once(self):
  aa=d.collect([],{},NOW,Client(),REG);b=d.collect([],aa,NOW+timedelta(hours=1),Client('An updated response.'),REG);cc=d.collect([],b,NOW+timedelta(hours=2),Client('An updated response.'),REG)
  self.assertEqual(b['edited_replies_this_run'],4);self.assertEqual(cc['edited_replies_this_run'],0)
 def test_outage_retains_previous_evidence_without_reverification(self):
  aa=d.collect([],{},NOW,Client(),REG)
  class Offline:
   def get(self,u):raise C.CoverageError('access_restricted')
  b=d.collect([],aa,NOW+timedelta(days=1),Offline(),REG)
  self.assertEqual(b['state'],'unavailable');self.assertEqual(b['staff_responses_retained'],aa['staff_responses_retained']);self.assertTrue(all(not x['observed_this_run'] for t in b['threads'] for x in t['replies']))
 def test_new_thread_old_response_is_historical_discovery(self):
  old={'monitoring_started_at':'2026-10-15T00:00:00Z'};r=d.collect([],old,NOW,Client(),REG)
  self.assertEqual(r['new_replies_this_run'],0);self.assertTrue(all(x['change_kind']=='historical_discovery' for t in r['threads'] for x in t['replies']))
 def test_new_thread_recent_response_is_new_reply(self):
  old={'monitoring_started_at':'2026-10-01T00:00:00Z'};r=d.collect([],old,NOW,Client(),REG);self.assertEqual(r['new_replies_this_run'],4)
 def test_rate_limit_stops_public_client(self):
  client=C.Client();client.blocked='rate_limited'
  with self.assertRaisesRegex(C.CoverageError,'deferred_rate_limited'):client.get(C.HOST+'/app/3079210/discussions/1/?fp=1')
 def test_body_and_player_name_not_in_saved_discovery(self):
  r=d.collect([],{},NOW,Client('word '*100),REG);s=json.dumps(r);self.assertNotIn('Team17_fake_Untrusted_Name',s);self.assertNotIn('word '*25,s)
if __name__=='__main__':unittest.main(verbosity=2)
