import os
import tempfile
os.environ['LOUDSOURCE_DISABLE_MONITOR']='1'
os.environ['LOUDSOURCE_DATABASE_PATH']=os.path.join(tempfile.mkdtemp(), 'startup.db')
import unittest
import sqlite3
import subprocess
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch, Mock
from web import app
from daily_flyer import loudsource_feature as ls, party_api as party

class PartyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.db_patch=patch.object(ls,'DB_PATH',Path(self.temp.name)/'party.db');self.db_patch.start()
        ls.init_storage();party.init_party();party._limits.clear()
        app.config.update(TESTING=True)
        self.client=app.test_client()
        self.host=self.join('Chris',True)
        self.guest=self.join('Alex')
        for i in range(8):
            ls.upsert_track(str(i)*22, {'name':f'Track {i}','artist':'Test artist'})
    def tearDown(self):
        self.db_patch.stop();self.temp.cleanup()
    def join(self,name,host=False,room='main',token=''):
        r=self.client.post(f'/api/party/{room}/join',json={'name':name,'host':host},headers={'X-Party-Token':token})
        self.assertEqual(r.status_code,200,r.json)
        return r.json['token']
    def post(self,path,data,token=None,room='main'):
        return self.client.post(f'/api/party/{room}'+path,json=data,headers={'X-Party-Token':token or self.guest})
    def state(self,token=None,room='main'):
        return self.client.get(f'/api/party/{room}/state',headers={'X-Party-Token':token or self.guest}).json
    def allow_spotify(self):
        ls.save_token('main',{'access_token':'test-only','refresh_token':'test-refresh','expires_at':9999999999})
        ls.start_control_session('main')
    def test_duplicate_music_votes_are_idempotent_and_request_cap_is_three(self):
        for i in range(3):
            for _ in range(2):
                self.assertEqual(self.post('/vote',{'track_id':str(i)*22,'active':True}).status_code,200)
        self.assertEqual(self.post('/vote',{'track_id':'3'*22,'active':True}).status_code,409)
        s=self.state();self.assertEqual(len(s['mine']),3);self.assertEqual(sum(t['votes'] for t in s['music']['queue']),3)
        self.post('/vote',{'track_id':'0'*22,'active':False})
        self.assertEqual(self.post('/vote',{'track_id':'3'*22,'active':True}).status_code,200)
    def test_full_request_budget_does_not_block_votes_for_other_songs(self):
        for i in range(3):self.post('/vote',{'track_id':str(i)*22,'active':True})
        for i in range(3,6):self.post('/vote',{'track_id':str(i)*22,'active':True},self.host)
        for i in range(3,6):
            for _ in range(2):
                self.assertEqual(self.post('/vote',{'track_id':str(i)*22,'active':True}).status_code,200)
        state=self.state()
        self.assertEqual(len(state['mine']),6)
        self.assertEqual(len(state['requests']),3)
        self.assertEqual([t['votes'] for t in state['music']['queue'][:3]],[2,2,2])
        self.assertEqual(self.post('/vote',{'track_id':'6'*22,'active':True}).status_code,409)
    def test_unvoting_shared_request_keeps_ownership_until_played(self):
        self.post('/vote',{'track_id':'0'*22,'active':True})
        self.post('/vote',{'track_id':'0'*22,'active':True},self.host)
        self.post('/vote',{'track_id':'0'*22,'active':False})
        self.assertEqual(self.state()['requests'],['0'*22])
        ls.remove_vote('main','0'*22)
        self.assertEqual(self.state()['requests'],[])
    def test_votes_work_without_spotify_and_never_access_accounts(self):
        with patch.object(ls,'_user_sp',side_effect=AssertionError('Spotify playback called')),patch.object(ls,'_oauth',side_effect=AssertionError('Spotify sign-in called')):
            self.assertEqual(self.post('/vote',{'track_id':'0'*22,'active':True}).status_code,200)
            self.assertEqual(self.state()['music']['queue'][0]['votes'],1)
    def test_concurrent_adds_create_only_one_request_owner(self):
        def vote(token):
            with app.test_client() as client:
                return client.post('/api/party/main/vote',json={'track_id':'0'*22,'active':True},headers={'X-Party-Token':token}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(vote,[self.host,self.guest])),[200,200])
        self.assertEqual(len(self.state()['requests'])+len(self.state(self.host)['requests']),1)
    def test_guest_cannot_remove_someone_elses_vote(self):
        self.post('/vote',{'track_id':'0'*22,'active':True},self.host)
        self.post('/vote',{'track_id':'0'*22,'active':False})
        self.assertEqual(self.state()['music']['queue'][0]['votes'],1)
    def test_played_track_returns_everyones_budget(self):
        for token in (self.host,self.guest):self.post('/vote',{'track_id':'0'*22,'active':True},token)
        ls.remove_vote('main','0'*22)
        self.assertEqual(self.state()['mine'],[]);self.assertEqual(self.state(self.host)['mine'],[])
    def test_concurrent_votes_do_not_lose_updates(self):
        tokens=[self.join(f'Guest {i}') for i in range(40)]
        def vote(t):
            with app.test_client() as c:
                return c.post('/api/party/main/vote',json={'track_id':'0'*22,'active':True},headers={'X-Party-Token':t}).status_code
        with ThreadPoolExecutor(max_workers=12) as pool:self.assertEqual(set(pool.map(vote,tokens)),{200})
        self.assertEqual(self.state()['music']['queue'][0]['votes'],40)
    def test_cap_survives_competing_requests(self):
        def vote(i):
            with app.test_client() as c:
                return c.post('/api/party/main/vote',json={'track_id':str(i)*22,'active':True},headers={'X-Party-Token':self.guest}).status_code
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(vote,range(8)))
        self.assertEqual(results.count(200),3);self.assertEqual(results.count(409),5)
    def test_room_isolation_and_reconnect(self):
        other=self.join('Other',True,'other')
        r=self.client.get('/api/party/other/state',headers={'X-Party-Token':self.guest});self.assertEqual(r.status_code,401)
        again=self.join('Renamed',room='main',token=self.guest);self.assertEqual(again,self.guest)
        self.assertEqual(len(self.state()['people']),2)
        self.assertEqual(self.state()['me']['name'],'Renamed')
    def test_host_cannot_be_stolen_and_can_transfer(self):
        r=self.post('/join',{'name':'Alex','host':True});self.assertEqual(r.status_code,403)
        guest_id=self.state()['me']['id']
        r=self.post('/host',{'action':'transfer','person_id':guest_id},self.host);self.assertEqual(r.status_code,200)
        self.assertTrue(self.state()['me']['host'])
        self.assertEqual(self.post('/host',{'action':'prompt'},self.host).status_code,403)
    def test_legacy_controls_are_host_only(self):
        for action in ('play-first','clear','connect'):
            r=self.client.post('/api/loudsource/main/'+action,json={},headers={'X-Party-Token':self.guest})
            self.assertEqual(r.status_code,403)
        self.assertEqual(self.client.post('/api/loudsource/main/clear',json={}).status_code,401)
    def test_trivia_answers_are_secret_and_first_submission_wins(self):
        r=self.client.get('/api/party/main/trivia/music',headers={'X-Party-Token':self.guest})
        q=r.json['questions'][0];self.assertNotIn('answer',q);self.assertNotIn('explanation',q)
        first=self.post('/answer',{'question':q['id'],'choice':1}).json
        second=self.post('/answer',{'question':q['id'],'choice':0}).json
        self.assertEqual(first,second);self.assertEqual(second['correct'],0)
        me=next(p for p in self.state()['people'] if p['id']==self.state()['me']['id']);self.assertEqual(me['attempted'],1)
    def test_invalid_answers_and_injection_rejected(self):
        for data in ({'question':'music--1','choice':0},{'question':'music-100','choice':0},{'question':'music-0','choice':True},{'question':'music-0','choice':-1}):
            self.assertEqual(self.post('/answer',data).status_code,400)
        self.assertEqual(self.post('/vote',{'track_id':"';DROP TABLE party_people;",'active':True}).status_code,400)
        self.assertEqual(self.post('/vote',{'track_id':'0'*22,'active':'true'}).status_code,400)
    def test_poll_changes_keep_one_ballot(self):
        self.post('/poll',{'poll':0,'choice':0});self.post('/poll',{'poll':0,'choice':1})
        poll=self.state()['polls'][0];self.assertEqual(poll['counts'],[0,1,0,0]);self.assertEqual(poll['mine'],1)
    def test_guest_polling_never_calls_spotify(self):
        with patch.object(ls,'_user_sp',side_effect=AssertionError('Spotify called')),patch.object(ls,'get_token',side_effect=AssertionError('token refresh called')):
            for _ in range(10):self.assertEqual(self.state()['room'],'main')
    def test_clear_is_atomic_and_preserves_spotify_auth(self):
        ls.save_token('main',{'access_token':'test-only','refresh_token':'test-refresh','expires_at':9999999999})
        self.post('/vote',{'track_id':'0'*22,'active':True})
        self.client.post('/api/loudsource/main/clear',json={},headers={'X-Party-Token':self.host})
        self.assertEqual(self.state()['mine'],[]);self.assertTrue(self.state()['music']['authed'])
        self.assertNotIn('test-only',str(self.state()))
    def test_wrong_origin_and_missing_oauth_state(self):
        r=self.client.post('/api/party/main/poll',json={'poll':0,'choice':0},headers={'Origin':'https://evil.example','X-Party-Token':self.guest});self.assertEqual(r.status_code,403)
        self.assertEqual(self.client.get('/api/loudsource/callback?code=fake&state=fake').status_code,400)
    def test_qr_home_and_health(self):
        self.assertEqual(self.client.get('/').status_code,200)
        qr=self.client.get('/api/party/main/qr.svg');self.assertEqual(qr.status_code,200);self.assertIn(b'<svg',qr.data)
        self.assertEqual(self.client.get('/health').json['app'],'loudsource-party')
    def test_storage_survives_reinitialization(self):
        self.post('/poll',{'poll':1,'choice':2});ls.init_storage();party.init_party()
        self.assertEqual(self.state()['polls'][1]['mine'],2)
    def test_pause_does_not_enable_auto_resume(self):
        self.allow_spotify()
        fake=Mock();ls.update_state('main',auto_enabled=True)
        with patch.object(ls,'_user_sp',return_value=fake):
            self.assertEqual(self.post('/host',{'action':'pause'},self.host).status_code,200)
        fake.pause_playback.assert_called_once();self.assertFalse(ls.get_state('main')['auto_enabled'])
    def test_spotify_link_search_and_cache(self):
        self.allow_spotify()
        fake=Mock();fake.track.return_value={'id':'a'*22,'name':'Song','artists':[{'name':'Artist'}],'album':{'images':[]}}
        ls._SEARCH_CACHE.clear()
        with patch.object(ls,'sp_search',fake):
            for _ in range(2):self.assertIn('a'*22,ls.search_tracks('https://open.spotify.com/track/'+'a'*22+'?si=abc','main'))
        fake.track.assert_called_once_with('a'*22)

    def test_invalid_refresh_ends_permission_and_reconnection_recovers(self):
        ls.save_token('main',{'access_token':'expired-test','refresh_token':'invalid-test','expires_at':1})
        ls.start_control_session('main')
        fake=Mock();fake.refresh_access_token.side_effect=RuntimeError('invalid_grant')
        with patch.object(ls,'_oauth',return_value=fake):
            for _ in range(5):self.assertIsNone(ls.get_token('main'))
            fake.refresh_access_token.assert_called_once()
        self.assertFalse(ls.control_session_payload('main')['active'])
        self.assertEqual(ls.control_session_payload('main')['ended_reason'],'connection-error')
        ls.save_token('main',{'access_token':'fresh-test','refresh_token':'fresh-refresh','expires_at':9999999999})
        ls.end_control_session('main','reconnected')
        ls.start_control_session('main')
        self.assertEqual(ls.get_token('main')['access_token'],'fresh-test')
        self.assertNotIn('main',ls._TOKEN_RETRY_AFTER)

    def test_database_connection_is_closed_on_exit(self):
        with ls._connect() as db:
            self.assertEqual(db.execute('SELECT 1').fetchone()[0],1)
        with self.assertRaises(sqlite3.ProgrammingError):db.execute('SELECT 1')

    def test_index_recovery_preserves_party_and_spotify_records(self):
        from daily_flyer.storage_check import check_storage
        ls.save_token('main',{'access_token':'test-secret','refresh_token':'test-refresh','expires_at':9999999999})
        self.post('/vote',{'track_id':'0'*22,'active':True})
        self.post('/poll',{'poll':0,'choice':1})
        with ls._connect() as db:
            db.execute('INSERT INTO loudsource_history(session_slug,track_id,played_at) VALUES(?,?,?)',('main','0'*22,123))
            root=db.execute("SELECT rootpage FROM sqlite_master WHERE type='index' AND tbl_name='loudsource_votes'").fetchone()[0]
            size=db.execute('PRAGMA page_size').fetchone()[0]
        before=self.state()
        with ls.DB_PATH.open('r+b') as f:
            f.seek((root-1)*size);f.write(b'\x00')
        check_storage(ls.DB_PATH)
        self.assertEqual(self.state(),before)
        with ls._connect() as db:
            self.assertEqual(db.execute('SELECT spotify_refresh_token FROM loudsource_sessions WHERE session_slug=?',('main',)).fetchone()[0],'test-refresh')
        self.assertEqual(self.post('/vote',{'track_id':'1'*22,'active':True}).status_code,200)

    def test_preload_import_does_not_start_background_thread(self):
        env=dict(os.environ,LOUDSOURCE_DATABASE_PATH=str(Path(self.temp.name)/'preload.db'))
        env.pop('LOUDSOURCE_DISABLE_MONITOR',None)
        result=subprocess.check_output([sys.executable,'-c','import web; from daily_flyer import loudsource_feature as ls; print(ls._BG_STARTED)'],env=env,text=True)
        self.assertEqual(result.strip().splitlines()[-1],'False')

if __name__=='__main__':unittest.main()
