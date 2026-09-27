import copy
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from ww2_tactics.engine import initial
from ww2_tactics.order_history import perform, status, KEY
from ww2_web import create_app


class OrderHistoryTests(unittest.TestCase):
    def battle(self):
        s = initial('village', 'dsl')
        s['ready'] = True
        return s

    def test_move_undo_redo_restores_every_field_with_monotonic_revision(self):
        before = self.battle()
        moved = perform(before, 'us', dict(kind='move', unit='us0', pos=[1, 7]))
        undone = perform(moved, 'us', dict(kind='undo'))
        expected = copy.deepcopy(before)
        expected['revision'] = 2
        self.assertEqual({k:v for k,v in undone.items() if k != KEY}, expected)
        redone = perform(undone, 'us', dict(kind='redo'))
        moved['revision'] = 3
        self.assertEqual({k:v for k,v in redone.items() if k != KEY}, {k:v for k,v in moved.items() if k != KEY})
        self.assertEqual(before['revision'], 0)

    def test_dice_redo_never_rolls_and_branching_cannot_escape_known_roll(self):
        s = self.battle()
        s['units'][0]['pos'] = [3, 5]
        s['units'][5]['pos'] = [3, 4]
        with patch('ww2_tactics.order_history.secrets.randbelow', return_value=1) as rng:
            shot = perform(s, 'us', dict(kind='fire', unit='us0', target='de0'))
            undone = perform(shot, 'us', dict(kind='undo'))
            for action in [dict(kind='fire', unit='us0', target='de0'), dict(kind='dig', unit='us0'), dict(kind='end')]:
                with self.assertRaisesRegex(ValueError, 'Redo resolved dice'):
                    perform(undone, 'us', action)
            redo = perform(undone, 'us', dict(kind='redo'))
            self.assertEqual(redo['last_combat'], shot['last_combat'])
            self.assertEqual(redo['units'], shot['units'])
            self.assertEqual(rng.call_count, 1)

    def test_branch_after_quiet_order_clears_redo(self):
        s = perform(self.battle(), 'us', dict(kind='move', unit='us0', pos=[1, 7]))
        s = perform(s, 'us', dict(kind='undo'))
        s = perform(s, 'us', dict(kind='dig', unit='us0'))
        self.assertFalse(status(s, 'us')['can_redo'])
        self.assertTrue(s['units'][0]['entrenched'])

    def test_multiple_undo_cannot_step_behind_dice_and_branch(self):
        s = self.battle();s['units'][0]['pos']=[3,5];s['units'][5]['pos']=[3,4]
        s = perform(s,'us',dict(kind='dig',unit='us2'))
        s = perform(s,'us',dict(kind='fire',unit='us0',target='de0'))
        s = perform(s,'us',dict(kind='undo'))
        s = perform(s,'us',dict(kind='undo'))
        with self.assertRaisesRegex(ValueError,'Redo resolved dice'):
            perform(s,'us',dict(kind='move',unit='us0',pos=[2,5]))
        s = perform(s,'us',dict(kind='redo'))
        self.assertTrue(status(s,'us')['redo_required'])
        s = perform(s,'us',dict(kind='redo'))
        self.assertFalse(status(s,'us')['redo_required'])

    def test_naval_move_and_transport_restore_all_state(self):
        from ww2_tactics.engine import options
        naval = initial('midway','dsl');naval['ready']=True;naval['fog_of_war']=False
        unit=next(u for u in naval['units'] if u['side']=='us')
        move=options(naval,unit)['moves'][0]
        transported=initial('frontier','dsl');transported.update(ready=True,turn='de',fog_of_war=False)
        carrier=next(u for u in transported['units'] if u['kind']=='halftrack')
        troop=next(u for u in transported['units'] if u['side']=='de' and u['kind']=='squad')
        carrier['pos'],troop['pos']=[5,5],[6,5]
        for original,side,action in [(naval,'us',dict(kind='move',unit=unit['id'],pos=move['pos'])),
                                     (transported,'de',dict(kind='load',unit=carrier['id'],target=troop['id']))]:
            after=perform(original,side,action);undone=perform(after,side,dict(kind='undo'))
            self.assertEqual(undone['units'],original['units'])
            redone=perform(undone,side,dict(kind='redo'))
            self.assertEqual(redone['units'],after['units'])

    def test_turn_boundary_and_other_seat(self):
        s = perform(self.battle(), 'us', dict(kind='dig', unit='us0'))
        with self.assertRaises(ValueError):
            perform(s, 'de', dict(kind='undo'))
        s = perform(s, 'us', dict(kind='end'))
        self.assertFalse(status(s, 'us')['can_undo'])
        self.assertFalse(status(s, 'de')['can_undo'])

    def test_reveal_commits_earlier_orders(self):
        s = initial('frontier', 'dsl');s['ready'] = True
        s['battlefield']['map'] = [['field'] * 24 for _ in range(24)]
        us = next(u for u in s['units'] if u['side']=='us' and u['kind']=='squad')
        de = next(u for u in s['units'] if u['side']=='de' and u['kind']=='squad')
        us['pos'],de['pos'] = [5,5],[12,5]
        s['units'] = [us,de]
        s = perform(s,'us',dict(kind='move',unit=us['id'],pos=[6,5]))
        self.assertFalse(status(s,'us')['can_undo'])
        self.assertIn('sighting',status(s,'us')['reason'])

    def test_api_private_history_stale_revision_and_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = create_app(os.path.join(tmp,'history.sqlite')).test_client()
            seat = client.post('/api/match',json=dict(opponent='computer',ruleset='dsl')).get_json()
            url = '/api/match/'+seat['code'];headers = {'Authorization':'Bearer '+seat['token']}
            moved = client.post(url,headers=headers,json=dict(kind='move',unit='us0',pos=[1,7],revision=0)).get_json()
            self.assertTrue(moved['order_history']['can_undo'])
            self.assertNotIn(KEY,json.dumps(moved))
            self.assertNotIn('snapshot',json.dumps(moved))
            self.assertEqual(client.post(url,headers=headers,json=dict(kind='undo',revision=0)).status_code,409)
            undo = client.post(url,headers=headers,json=dict(kind='undo',revision=1)).get_json()
            self.assertEqual(undo['revision'],2)
            reload = client.get(url,headers=headers).get_json()
            self.assertTrue(reload['order_history']['can_redo'])
            self.assertEqual(client.post(url,json=dict(kind='redo',revision=2)).status_code,403)
            redo = client.post(url,headers=headers,json=dict(kind='redo',revision=2)).get_json()
            self.assertEqual(redo['units'],moved['units'])
            self.assertEqual(redo['revision'],3)


if __name__ == '__main__':
    unittest.main()
