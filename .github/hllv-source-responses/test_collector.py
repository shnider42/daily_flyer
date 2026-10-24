"""Synthetic-only parser and coverage regressions. No network or real users."""
import copy, importlib.util, json, unittest
from datetime import datetime,timezone
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('responses',Path(__file__).with_name('collector.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
NOW=datetime(2026,10,15,14,tzinfo=timezone.utc);URL='https://steamcommunity.com/app/3079210/discussions/1/123/'
STAFF='76561199418165143';OTHER='76561198363837070'
REG=[{'steam_id':STAFF,'label':'Verified support','category':'Team17 Support','active':True,'review_due_at':'2027-01-01T00:00:00Z'}]
ISSUES=[{'id':'HLLV-001','sources':[{'url':URL}]}]
def comment(cid='100',staff=True,identity=STAFF,body='We have asked the team to investigate.',posted=1791970000):
 cls='commentthread_author_developer' if staff else ''
 return f'<div class="commentthread_comment" id="comment_{cid}"><div class="commentthread_comment_author"><a class="commentthread_author_link {cls}" data-miniprofile="{int(identity)-c.BASE_ID}" href="https://steamcommunity.com/profiles/{identity}">Team17_Service</a>'+('<span class="commentthread_workshop_authorbadge"> [developer]</span>' if staff else '')+f'<div class="commentthread_comment_timestamp" data-timestamp="{posted}"></div></div><div class="commentthread_comment_text">{body}</div><a href="#c{cid}">1</a></div>'
def page(comments=None,total=None,start=0,size=15):
 comments=comments if comments is not None else [comment()];total=len(comments) if total is None else total
 m={'feature2':'123','total_count':total,'start':start,'pagesize':size,'oldestfirst':True,'extended_data':json.dumps({'forum_appid':3079210,'forum_public':1})}
 return '<div class="forum_op" id="forum_op_123"><div id="forum_op_topic_123">Example discussion</div></div><script>InitializeCommentThread("ForumTopic","thread",'+json.dumps(m)+');</script>'+''.join(comments)
def collect(html,old=None):return c.collect(ISSUES,old or {},NOW,lambda u:html,REG)
class Tests(unittest.TestCase):
 def test_actual_staff_id_not_display_name(self):
  r=collect(page([comment(),comment('101',False,OTHER,body='[developer] Team17_Service')]))
  self.assertEqual(len(r['threads'][0]['replies']),1);self.assertEqual(r['threads_complete'],1)
 def test_unreviewed_developer_pending(self):
  r=collect(page([comment(identity=OTHER)]));self.assertEqual(r['identities_pending'],1);self.assertEqual(r['verified_responses_retained'],0)
 def test_quote_in_player_not_staff(self):
  r=collect(page([comment(staff=False,identity=OTHER,body='<blockquote><a class="commentthread_author_developer">Team17</a>[developer] Fix shipped</blockquote>Player reply')]))
  self.assertEqual(r['verified_responses_retained'],0)
 def test_staff_quote_not_staff_statement(self):
  r=collect(page([comment(body='<blockquote>Fixed in 1.7</blockquote>We are still investigating.')]))
  self.assertEqual(r['threads'][0]['replies'][0]['excerpt'],'We are still investigating.')
 def test_later_page(self):
  pages=[page([comment('101',False,OTHER)],total=2,size=1),page([comment('102')],total=2,size=1,start=1)]
  r=c.collect(ISSUES,{},NOW,lambda u:pages[int(c.parse_qs(c.urlsplit(u).query)['ctp'][0])-1],REG)
  self.assertEqual(r['threads_complete'],1);self.assertEqual(r['threads'][0]['pages_checked'],2);self.assertIn('?ctp=2#c102',r['threads'][0]['replies'][0]['response_url'])
 def test_failed_later_page_is_partial(self):
  old=collect(page());old['threads'][0]['last_complete_at']='2026-10-14T00:00:00Z'
  def get(u):
   if 'ctp=2' in u:raise c.CoverageError('http_503')
   return page(total=2,size=1)
  r=c.collect(ISSUES,old,NOW,get,REG);self.assertEqual(r['state'],'partial');self.assertEqual(r['threads'][0]['last_complete_at'],'2026-10-14T00:00:00Z');self.assertEqual(r['threads'][0]['pages_expected'],2)
 def test_incomplete_html_not_empty(self):
  r=collect('<html>Sign in</html>');self.assertEqual(r['threads_complete'],0);self.assertEqual(r['threads'][0]['failure_kind'],'missing_thread_markup')
 def test_comment_count_mismatch(self):
  self.assertEqual(collect(page(total=3))['threads_complete'],0)
 def test_duplicate_pages(self):
  def get(u):return page(total=2,size=1,start=1 if 'ctp=2' in u else 0)
  r=c.collect(ISSUES,{},NOW,get,REG);self.assertEqual(r['threads'][0]['failure_kind'],'duplicate_page')
 def test_changing_total_never_complete(self):
  def get(u):return page(total=3 if 'ctp=2' in u else 2,size=1,start=1 if 'ctp=2' in u else 0)
  self.assertEqual(c.collect(ISSUES,{},NOW,get,REG)['threads'][0]['failure_kind'],'thread_changed_during_scan')
 def test_baseline_is_not_new_activity(self):
  r=collect(page());self.assertEqual(r['new_replies_this_run'],0);self.assertEqual(r['threads'][0]['replies'][0]['change_kind'],'baseline')
 def test_edit_once_and_preserve_hash(self):
  old=collect(page());changed=collect(page([comment(body='Updated support response with more detail')]),old)
  self.assertEqual(changed['edited_replies_this_run'],1);self.assertEqual(len(changed['threads'][0]['replies'][0]['previous_hashes']),1)
  again=collect(page([comment(body='Updated support response with more detail')]),changed);self.assertEqual(again['edited_replies_this_run'],0)
 def test_historical_discovery_not_fresh(self):
  old=collect(page());r=collect(page([comment(),comment('101')]),old)
  self.assertEqual(r['new_replies_this_run'],0);self.assertEqual(r['threads'][0]['changes_this_run'][0]['kind'],'historical_discovery')
 def test_new_reply_after_baseline(self):
  old=collect(page());old['threads'][0]['baseline_at']='2026-10-01T00:00:00Z'
  r=collect(page([comment(),comment('101')]),old);self.assertEqual(r['new_replies_this_run'],1)
 def test_outage_keeps_evidence_and_original_dates(self):
  old=collect(page());r=collect('<html>Unavailable</html>',old)
  self.assertEqual(r['state'],'unavailable');self.assertEqual(r['threads'][0]['replies'][0]['published_at'],old['threads'][0]['replies'][0]['published_at']);self.assertFalse(r['threads'][0]['replies'][0]['observed_this_run'])
 def test_missing_reply_not_claimed_deleted(self):
  old=collect(page());r=collect(page([]),old);self.assertEqual(r['threads_complete'],1);self.assertEqual(r['verified_responses_retained'],1);self.assertFalse(r['threads'][0]['replies'][0]['observed_this_run'])
 def test_unsafe_sources(self):
  for url in ['http://steamcommunity.com/app/3079210/discussions/1/123/','https://steamcommunity.com.evil.invalid/app/3079210/discussions/1/123/','https://user:pass@steamcommunity.com/app/3079210/discussions/1/123/','https://steamcommunity.com/app/3079210/discussions/1/123/?redirect=x','https://steamcommunity.com/app/686810/discussions/1/123/','https://127.0.0.1/x']:
   with self.assertRaises(c.CoverageError):c.thread_url(url)
 def test_expired_registry_is_review_gap(self):
  reg=copy.deepcopy(REG);reg[0]['review_due_at']='2026-01-01T00:00:00Z'
  r=c.collect(ISSUES,{},NOW,lambda u:page(),reg);self.assertEqual(r['identities_pending'],1);self.assertEqual(r['verified_responses_retained'],0)
 def test_badge_removed_not_freshly_verified(self):
  self.assertEqual(collect(page([comment(staff=False)]))['verified_responses_retained'],0)
 def test_future_dates_fail(self):
  self.assertEqual(collect(page([comment(posted=1999999999)]))['threads_complete'],0)
 def test_identity_conflict_fails(self):
  html=page().replace('data-miniprofile="1457899415"','data-miniprofile="403571342"')
  self.assertEqual(collect(html)['threads_complete'],0)
 def test_bound_pages(self):
  with patch.object(c,'MAX_PAGES',1):r=collect(page(total=2,size=1))
  self.assertEqual(r['threads'][0]['failure_kind'],'page_budget')
 def test_excerpt_budget_and_no_player_text(self):
  r=collect(page([comment(),comment('101',body='Another staff response'),comment('102',False,OTHER,body='PRIVATE-PLAYER-CONTENT')]))
  text=json.dumps(r);self.assertNotIn('PRIVATE-PLAYER-CONTENT',text);self.assertNotIn('_text',text);self.assertLessEqual(sum(len(x.get('excerpt','').split()) for x in r['threads'][0]['replies']),18)
 def test_robots_denial_no_thread_fetch(self):
  client=c.Client();client.rules=c.RobotFileParser();client.rules.parse(['User-agent: *','Disallow: /']);client.opener=unittest.mock.Mock()
  with self.assertRaisesRegex(c.CoverageError,'robots_restricted'):client.get(URL)
  client.opener.open.assert_not_called()
 def test_access_restriction_stops_following_requests(self):
  client=c.Client();client.blocked='rate_limited';client.opener=unittest.mock.Mock()
  with self.assertRaisesRegex(c.CoverageError,'deferred_rate_limited'):client.get(URL)
  client.opener.open.assert_not_called()
if __name__=='__main__':unittest.main(verbosity=2)
