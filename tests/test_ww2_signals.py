import copy
import unittest
from collections import deque
from unittest.mock import patch

from ww2_tactics import signals, fieldworks, weapons, operations, buildings
from ww2_tactics.engine import initial, apply, options, terrain, watchers
from ww2_tactics.theaters import soldier, IDS
from ww2_tactics.visibility import public_state, update_intel, visible_ids, unit_visible_ids, sight_calculations
from ww2_tactics.order_history import perform, status
from ww2_tactics.computer import objective_costs, choose_order


class SignalsTests(unittest.TestCase):
    def field(self):
        s=initial('apennine','dsl')
        s.update(ready=True,units=[],buildings={},building_intel={},intel={},platoon_intel={},radio_reports={'us':{},'de':{}},fieldworks={},fieldworks_intel={})
        s['battlefield']['map']=[['field']*26 for _ in range(28)]
        return s

    def add(self,s,kind,pos,side='us',group='A',**extra):
        u=soldier(side,kind,pos,group,len(s['units'])+1,'gb' if side=='us' else 'de',**extra)
        s['units'].append(u);weapons.initialize(s);signals.initialize(s)
        return u

    def act(self,s,u,kind,**data):return apply(s,u['side'],dict(kind=kind,unit=u['id'],**data),roll=lambda:6)

    def test_rosters_paths_and_version_gate(self):
        for name in IDS:
            s=initial(name,'dsl');b=s['battlefield']
            self.assertEqual(len(s['units']),len({tuple(u['pos']) for u in s['units']}))
            self.assertEqual(len(s['units']),len({u['id'] for u in s['units']}))
            self.assertEqual(s['signals_version'],1)
            self.assertTrue(all(u['accuracy_bonus']==0 for u in s['units']))
            for u in s['units']:
                if u['kind']=='at_gun':continue
                seen={tuple(u['pos'])};q=deque(seen)
                while q:
                    for n in fieldworks.neighbors(s,q.popleft()):
                        if tuple(n) not in seen and fieldworks.movement(u,terrain(*n,s))[0] and buildings.enterable(s,n):
                            seen.add(tuple(n));q.append(tuple(n))
                self.assertIn(tuple(b['objective']),seen,(name,u['id']))
            with self.assertRaises(ValueError):initial(name,'classic')
        self.assertNotIn('signals_version',initial('tidal_gate','dsl'))
        s=initial('amba_dawn','dsl')
        self.assertTrue(all(u['suppression']==4 for u in s['units'] if u['kind'] in {'partisan','askari'}))
        tank=next(u for u in s['units'] if u['kind']=='tank')
        self.assertEqual(weapons.profile(tank)['id'],'machine_gun')
        self.assertEqual(tank['ammo_options'],[])
        s=initial('desert_signal','dsl')
        self.assertTrue(all(u['weapon']=='at_rifle' for u in s['units'] if u['kind']=='at_team'))

    def test_terrain_mobility_and_ai_routes(self):
        s=initial('amba_dawn','dsl')
        mountain=next(u for u in s['units'] if u['kind']=='partisan')
        tank=next(u for u in s['units'] if u['kind']=='tank')
        foot=next(u for u in s['units'] if u['kind']=='engineer')
        self.assertEqual(fieldworks.movement(mountain,'mountain'),(True,1))
        self.assertEqual(fieldworks.movement(foot,'mountain'),(True,3))
        self.assertFalse(fieldworks.movement(tank,'mountain')[0])
        self.assertEqual(fieldworks.movement(tank,'dune'),(True,2))
        costs=objective_costs(s,unit=tank)
        self.assertIn(tuple(tank['pos']),costs)
        self.assertTrue(all(terrain(*p,s) not in {'mountain','ridge','wadi'} for p in costs))

    def test_radio_cost_private_dated_reports_and_local_fire(self):
        s=self.field();scout=self.add(s,'scout',[7,5]);enemy=self.add(s,'squad',[10,5],'de')
        commander=self.add(s,'commander',[2,20],group='HQ');mortar=self.add(s,'mortar',[10,12],group='HQ')
        s['battlefield']['map'][5][10]='woods';update_intel(s)
        self.assertIn(enemy['id'],visible_ids(s,'us'))
        self.assertNotIn(enemy['id'],unit_visible_ids(s,mortar))
        self.assertNotIn(enemy['pos'],options(s,mortar)['mortar_fire'])
        s=perform(s,'us',dict(kind='radio_update',unit=commander['id']))
        commander=next(u for u in s['units'] if u['kind']=='commander');mortar=next(u for u in s['units'] if u['kind']=='mortar')
        self.assertEqual(commander['ap'],1);self.assertFalse(status(s,'us')['can_undo'])
        self.assertFalse(options(s,commander)['radio_update'])
        self.assertIn([10,5],options(s,mortar)['mortar_fire'])
        self.assertNotIn(enemy['id'],[t['id'] for t in options(s,mortar)['targets']])
        before=copy.deepcopy(signals.reports_for(s,'us'))
        next(u for u in s['units'] if u['side']=='de').update(pos=[24,2],hp=1)
        update_intel(s)
        self.assertEqual(signals.reports_for(s,'us'),before)
        own=public_state(s,'us');other=public_state(s,'de')
        self.assertNotIn('platoon_intel',own);self.assertEqual(other['radio_reports'],[])
        self.assertFalse(any(k in before[0] for k in ('hp','ap','overwatch')))
        self.assertEqual(other['signal_alerts'][0]['kind'],'radio')
        self.assertNotIn('pos',other['signal_alerts'][0]);self.assertEqual(own['signal_alerts'],[])
        self.assertEqual(own['platoon_views']['HQ']['contacts'][0]['pos'],[10,5])
        s['round']+=2;signals.start_turn(s,'us');self.assertEqual(signals.reports_for(s,'us'),[])

    def test_radioman_only_relays_own_group_and_spends_one(self):
        s=self.field();radio=self.add(s,'radioman',[3,4]);self.add(s,'squad',[5,4],'de')
        update_intel(s);self.assertTrue(options(s,radio)['radio_update'])
        s=self.act(s,radio,'radio_update');self.assertEqual(s['units'][0]['ap'],2)
        radio=s['units'][0];radio.update(platoon='B',radio_round=None)
        self.assertFalse(options(s,radio)['radio_update'])

    def test_observe_camouflage_and_reaction(self):
        s=self.field();scout=self.add(s,'scout',[5,5]);enemy=self.add(s,'partisan',[9,5],'de')
        s['battlefield']['map'][5][9]='woods';enemy['camouflaged']=True
        self.assertNotIn(enemy['id'],visible_ids(s,'us'))
        s=self.act(s,scout,'observe');scout,enemy=s['units']
        self.assertIn(enemy['id'],visible_ids(s,'us'));self.assertEqual(scout['range'],3)
        self.assertEqual(operations.sight_range(s,scout),11)
        s=self.act(s,scout,'move',pos=[6,5]);self.assertNotIn('observing',s['units'][0])
        s['units'][0].update(pos=[8,5],overwatch=True,range=4)
        self.assertIn(enemy['id'],visible_ids(s,'us'))
        self.assertEqual(len(watchers(s,s['units'][1],[9,5])),1)
        s['turn']='de';s['units'][1].update(ap=3,camouflaged=False)
        s=self.act(s,s['units'][1],'conceal');self.assertTrue(s['units'][1]['camouflaged'])
        s['units'][0]['overwatch']=False;s=self.act(s,s['units'][1],'move',pos=[10,5])
        self.assertNotIn('camouflaged',s['units'][1])

    def test_recon_warns_only_enemy_sector_and_works_on_older_maps(self):
        s=initial('frontier','dsl');s['ready']=True
        commander=next(u for u in s['units'] if u['side']=='us' and u['kind']=='commander')
        pos=options(s,commander)['field_recon'][0]
        s=self.act(s,commander,'field_recon',pos=pos)
        own=public_state(s,'us');enemy=public_state(s,'de')
        self.assertEqual(own['signal_alerts'],[]);self.assertEqual(enemy['recon'],[])
        alert=enemy['signal_alerts'][0]
        self.assertEqual(alert['kind'],'recon')
        self.assertEqual(set(alert),{'kind','sector','round','expires_round','revision'})
        self.assertEqual(alert['sector'],signals.sector(s,pos))

    def test_overwatch_preview_cannot_disclose_readiness_or_hidden_watchers(self):
        s=self.field();scout=self.add(s,'scout',[5,5]);enemy=self.add(s,'mg',[9,5],'de')
        first=options(s,scout)['moves'];self.assertTrue(any(m['threats'] for m in first))
        enemy['overwatch']=True;self.assertEqual(first,options(s,scout)['moves'])
        self.assertFalse(next(u for u in public_state(s,'us')['units'] if u['side']=='de')['overwatch'])
        enemy['pos']=[20,20];hidden=options(s,scout)['moves'];enemy.update(pos=[21,21],overwatch=False)
        self.assertEqual(hidden,options(s,scout)['moves'])

    def test_mortar_supply_delay_friendly_fire_and_illegal_order(self):
        s=self.field();mortar=self.add(s,'mortar',[5,5]);enemy=self.add(s,'squad',[8,5],'de');friend=self.add(s,'squad',[8,6]);tank=self.add(s,'tank',[9,5],'de')
        s=self.act(s,mortar,'mortar_fire',pos=[8,5])
        self.assertEqual(s['units'][0]['shells'],2);self.assertEqual(s['units'][0]['ap'],0)
        self.assertEqual(s['barrages'][0]['ttl'],2)
        with self.assertRaises(ValueError):self.act(s,s['units'][0],'mortar_fire',pos=[8,5])
        s=apply(s,'us',{'kind':'end'});self.assertEqual(s['units'][1]['hp'],3)
        s=apply(s,'de',{'kind':'end'},roll=lambda:1)
        self.assertEqual([u['hp'] for u in s['units']],[2,2,2,4]);self.assertEqual(s['barrages'],[])

    def test_demolition_dice_cannot_be_rerolled_and_passenger_is_inactive(self):
        s=self.field();u=self.add(s,'engineer',[5,5]);tank=self.add(s,'tank',[6,5],'de');update_intel(s)
        with patch('ww2_tactics.order_history.secrets.randbelow',return_value=5):
            s=perform(s,'us',dict(kind='demolition',unit=u['id'],target=tank['id']))
        self.assertEqual(s['units'][1]['hp'],2);self.assertEqual(s['units'][0]['demolition_charges'],0)
        s=perform(s,'us',{'kind':'undo'});self.assertTrue(status(s,'us')['redo_required'])
        with self.assertRaises(ValueError):perform(s,'us',dict(kind='dig',unit=u['id']))
        s=perform(s,'us',{'kind':'redo'});self.assertEqual(s['units'][1]['hp'],2)
        s['units'][0].update(carrier_id='test',ap=3)
        self.assertFalse(any(options(s,s['units'][0]).values()))

    def test_ai_orders_and_scoped_sight_equal_uncached(self):
        s=initial('desert_signal','dsl');s['ready']=True
        with patch('ww2_tactics.visibility.sight_cache',return_value=None):expected=public_state(s,'us')
        with sight_calculations(s):self.assertEqual(public_state(s,'us'),expected)
        costs=objective_costs(s);shared={};visited={}
        for _ in range(8):
            order=choose_order(s,costs,visited,shared)
            self.assertIsNotNone(order);s=apply(s,'us',order,roll=lambda:3)

    def test_unload_preview_and_ai_ignore_secret_overwatch_readiness(self):
        s=self.field();carrier=self.add(s,'halftrack',[5,5]);troop=self.add(s,'squad',[5,5],carrier_id=carrier['id'])
        enemy=self.add(s,'mg',[9,5],'de');gun=self.add(s,'mg',[6,5])
        first=options(s,carrier)['unload'];costs=objective_costs(s);order=choose_order(s,costs,{})
        enemy['overwatch']=True
        self.assertEqual(options(s,carrier)['unload'],first)
        self.assertEqual(choose_order(s,costs,{}),order)

    def test_recon_replay_never_discloses_search_hex(self):
        from ww2_tactics.computer import play_turn
        s=self.field();self.add(s,'scout',[5,5]);commander=self.add(s,'commander',[6,5],'de')
        s.update(turn='de',ai_side='de')
        with patch('ww2_tactics.computer.choose_order',side_effect=[dict(kind='field_recon',unit=commander['id'],pos=[10,5]),dict(kind='end')]):
            result=play_turn(s)
        frame=next(f for f in result['computer_playback']['frames'] if f['action']['kind']=='field_recon')
        self.assertNotIn('pos',frame['action'])
        self.assertEqual(frame['after']['recon'],[])
        self.assertEqual(frame['after']['signal_alerts'][0]['kind'],'recon')

    def test_new_maps_multiplayer_api_redaction_and_save_restore(self):
        import json, os, sqlite3, tempfile
        from ww2_web import create_app
        with tempfile.TemporaryDirectory() as tmp:
            path=os.path.join(tmp,'games.sqlite');client=create_app(path).test_client()
            for name in IDS:
                host=client.post('/api/match',json=dict(scenario=name,ruleset='dsl')).get_json()
                url='/api/match/'+host['code'];guest=client.post(url+'/join',json={}).get_json()
                with sqlite3.connect(path) as db:
                    s=json.loads(db.execute('SELECT state FROM match WHERE code=?',(host['code'],)).fetchone()[0])
                    report=dict(id='private-report',side='de',kind='tank',pos=[1,1],last_seen_round=1,last_seen_turn='us',source='radio',expires_round=3)
                    s['radio_reports']['us']={'private-report':report}
                    db.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),host['code']))
                for seat in (host,guest):
                    auth={'Authorization':'Bearer '+seat['token']};response=client.get(url,headers=auth)
                    self.assertEqual(response.status_code,200);v=response.get_json()
                    self.assertEqual(v['signals_version'],1);self.assertNotIn('platoon_intel',v);self.assertNotIn('_order_history',v)
                    self.assertEqual(len(v['radio_reports']),int(v['side']=='us'))
                    self.assertTrue(all(u['id'] not in v['legal'] for u in v['units'] if u['side']!=v['side']))
                solo=client.post('/api/match',json=dict(opponent='computer',scenario=name,ruleset='dsl')).get_json()
                auth={'Authorization':'Bearer '+solo['token']};url='/api/match/'+solo['code'];before=client.get(url,headers=auth).get_json()
                saved=client.post(url+'/save',headers=auth,json={'revision':before['revision']}).get_json()
                restored=client.post('/api/restore',json={'code':saved['save_code']}).get_json()
                after=client.get('/api/match/'+restored['code'],headers={'Authorization':'Bearer '+restored['token']}).get_json()
                for key in ('units','legal','platoon_views','radio_reports','signals_version','map'):
                    self.assertEqual(before[key],after[key],key)


if __name__=='__main__':unittest.main()
