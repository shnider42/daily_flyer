"""Cross-browser identity, public discovery and protection of occupied seats."""
import concurrent.futures
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ww2_web import create_app


class LobbyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp.name, 'games.sqlite3')
        self.app = create_app(self.path)
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp.cleanup()

    def player(self, name):
        response = self.client.post('/api/commander/register', json={'name': name, 'password': 'memorable-password'})
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()

    def headers(self, player=None, seat=None):
        return {**({'X-Commander-Token': player['token']} if player else {}),
                **({'Authorization': 'Bearer '+seat['token']} if seat else {})}

    def create(self, player=None, name=None, solo=False):
        body = {'scenario': 'village', 'ruleset': 'dsl', 'opponent': 'computer' if solo else 'human'}
        if name is not None:
            body['name'] = name
        response = self.client.post('/api/match', headers=self.headers(player), json=body)
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()

    def state(self, seat):
        response = self.client.get('/api/match/'+seat['code'], headers=self.headers(seat=seat))
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def post(self, seat, suffix, body=None, player=None):
        return self.client.post('/api/match/'+seat['code']+suffix, headers=self.headers(player, seat), json=body or {})

    def games(self, player=None, query=''):
        return self.client.get('/api/lobby'+query, headers=self.headers(player)).get_json()['games']

    def test_fresh_browser_recovers_multiple_games_without_codes_or_mutation(self):
        chris, dad, friend = self.player('Chris'), self.player('Dad'), self.player('Friend')
        a, b = self.create(chris, 'Sunday with Dad'), self.create(chris, 'Friday with Friend')
        for seat, opponent in ((a, dad), (b, friend)):
            self.assertEqual(self.client.post('/api/match/'+seat['code']+'/join', headers=self.headers(opponent), json={}).status_code, 200)
        original = [self.state(a), self.state(b)]
        fresh = create_app(self.path).test_client()
        login = fresh.post('/api/commander/login', json={'name':'cHrIs', 'password':'memorable-password'}).get_json()
        listed = fresh.get('/api/lobby?mine=1', headers=self.headers(login)).get_json()['games']
        self.assertEqual({g['name'] for g in listed}, {'Sunday with Dad', 'Friday with Friend'})
        self.assertTrue(all(g['your_side']=='us' and g['full'] for g in listed))
        for i, seat in enumerate((a, b)):
            recovered = fresh.post('/api/match/'+seat['code']+'/resume', headers=self.headers(login), json={})
            self.assertEqual(recovered.status_code, 200)
            self.assertEqual(self.state(recovered.get_json()), original[i])
            # Join links are safe to reuse, even for the host of a full game.
            rejoin = fresh.post('/api/match/'+seat['code']+'/join', headers=self.headers(login), json={})
            self.assertEqual(self.state(rejoin.get_json()), original[i])
        self.assertEqual([self.state(a), self.state(b)], original)

    def test_directory_is_summary_only_includes_legacy_and_excludes_solo(self):
        chris = self.player('Chris')
        named, old, solo = self.create(chris, '<Game & name>'), self.create(), self.create(solo=True)
        games = self.games()
        self.assertEqual({g['code'] for g in games}, {named['code'], old['code']})
        self.assertTrue(all(g['your_side'] is None for g in games))
        self.assertIn(old['code'][-4:], next(g['name'] for g in games if g['code']==old['code']))
        allowed = {'code','name','updated','scenario','edition','ruleset','round','turn','winner','ready','phase','opponent','allies','host_name','guest_name','full','open_side','your_side'}
        self.assertTrue(all(set(g)==allowed for g in games))
        self.assertTrue(all(g['edition']=='legacy' for g in games))
        self.assertEqual(self.games(chris, '?mine=1')[0]['code'], named['code'])
        self.assertEqual(self.games(query='?q=chris')[0]['code'], named['code'])
        self.assertEqual(self.client.get('/api/match/'+named['code']).status_code, 403)
        self.assertEqual(self.client.post('/api/match/'+named['code'], json={'kind':'end','revision':0}).status_code, 403)
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE match SET state=json_set(state,'$.winner','de') WHERE code=?", (named['code'],))
        self.assertEqual(len(self.games()), 1)
        self.assertEqual(len(self.games(query='?finished=1')), 2)
        self.assertNotIn(solo['code'], json.dumps(self.games(query='?finished=1')))

    def test_legacy_link_requires_seat_key_and_cannot_steal_or_link_both_sides(self):
        a, b = self.player('Alice'), self.player('Bob')
        old = self.create()
        guest = self.client.post('/api/match/'+old['code']+'/join', json={}).get_json()
        self.assertEqual(self.client.post('/api/match/'+old['code']+'/link', json={}, headers=self.headers(a)).status_code, 403)
        before = self.state(old)
        self.assertEqual(self.post(old, '/link', player=a).status_code, 200)
        self.assertEqual(self.post(old, '/link', player=b).status_code, 409)
        self.assertEqual(self.post(guest, '/link', player=a).status_code, 409)
        self.assertEqual(self.post(guest, '/link', player=b).status_code, 200)
        self.assertEqual(self.state(old), before)
        self.assertEqual(self.games(a, '?mine=1')[0]['your_side'], 'us')
        self.assertEqual(self.games(b, '?mine=1')[0]['your_side'], 'de')
        outsider = self.player('Outsider')
        self.assertEqual(self.post(old, '/resume', player=outsider).status_code, 403)
        self.assertEqual(self.client.post('/api/match/'+old['code']+'/join', json={}, headers=self.headers(outsider)).status_code, 409)

    def test_linked_ownership_follows_army_swaps_and_new_invitation(self):
        a, b = self.player('Alice'), self.player('Bob')
        seat = self.create(a, 'Ongoing rivalry')
        guest = self.client.post('/api/match/'+seat['code']+'/join', headers=self.headers(b), json={}).get_json()
        self.assertEqual(self.post(seat, '/rematch', {'operation':'propose','revision':1,'scenario':'orchard','swap':True}).status_code, 200)
        self.assertEqual(self.post(guest, '/rematch', {'operation':'accept','revision':2}).status_code, 200)
        self.assertEqual(self.games(a)[0]['your_side'], 'de')
        self.assertEqual(self.games(b)[0]['your_side'], 'us')
        resumed = self.post(seat, '/resume', player=a).get_json()
        self.assertEqual(self.state(resumed)['side'], 'de')
        self.assertEqual(self.state(resumed)['match_name'], 'Ongoing rivalry')
        renamed = self.post(guest, '/name', {'name':'Round two'})
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(self.state(seat)['match_name'], 'Round two')
        reset = self.post(guest, '/reset').get_json()
        self.assertEqual(self.games(b, '?mine=1')[0]['code'], reset['code'])
        self.assertEqual(self.games(a, '?mine=1'), [])

    def test_auth_expiry_logout_validation_and_password_storage(self):
        a = self.player('Alice')
        self.assertEqual(self.client.post('/api/commander/register', json={'name':'alice','password':'other-password'}).status_code, 409)
        self.assertEqual(self.client.post('/api/commander/login', json={'name':'Alice','password':'wrong-password'}).status_code, 401)
        with sqlite3.connect(self.path) as db:
            hashed = db.execute('SELECT password_hash FROM commanders').fetchone()[0]
            self.assertNotEqual(hashed, 'memorable-password')
            self.assertNotEqual(db.execute('SELECT key_hash FROM commander_sessions').fetchone()[0], a['token'])
        self.assertEqual(self.client.post('/api/match', json={'name':'Named game'}).status_code, 401)
        for bad in ('', 'xx', 'x'*65, 12):
            self.assertEqual(self.client.post('/api/match', json={'name':bad}, headers=self.headers(a)).status_code, 400)
        with patch('ww2_tactics.lobby.time.time', return_value=10**12):
            self.assertEqual(self.client.get('/api/commander', headers=self.headers(a)).status_code, 401)
        self.client.post('/api/commander/logout', headers=self.headers(a))
        self.assertEqual(self.client.get('/api/commander', headers=self.headers(a)).status_code, 401)
        for _ in range(15):
            self.client.post('/api/commander/login', json={'name':'Alice','password':'wrong-password'})
        self.assertEqual(self.client.post('/api/commander/login', json={'name':'Alice','password':'wrong-password'}).status_code, 429)

    def test_racing_joiners_do_not_overwrite_another_commander(self):
        host, a, b = self.player('Host'), self.player('Alpha'), self.player('Bravo')
        seat = self.create(host, 'One open seat')
        def join(player):
            return self.app.test_client().post('/api/match/'+seat['code']+'/join', json={}, headers=self.headers(player)).status_code
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(join, (a,b))), [200,409])
        self.assertEqual(sum(bool(self.games(p, '?mine=1')) for p in (a,b)), 1)


if __name__ == '__main__':
    unittest.main()
