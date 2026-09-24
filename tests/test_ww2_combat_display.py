import copy
import unittest
from ww2_tactics.engine import initial, apply, react
from ww2_tactics.combat_display import record_combat


class CombatDisplayTests(unittest.TestCase):
    def test_fire_records_actual_roll_and_modifiers_without_changing_outcome(self):
        s=initial();s['ready']=True
        s['units'][0]['pos']=[3,5];s['units'][5]['pos']=[3,4]
        before=copy.deepcopy(s)
        result=apply(s,'us',dict(kind='fire',unit='us0',target='de0'),roll=lambda:5)
        event=result['combat_history'][0]
        self.assertEqual(event['roll'],5)
        self.assertEqual(event['threshold'],5)
        self.assertEqual(event['modifiers']['cover'],1)
        self.assertIn('DE rifle squad',event['target_label'])
        self.assertEqual(result['units'][5]['hp'],2)
        self.assertEqual(s,before)

    def test_each_overwatch_roll_is_retained(self):
        s=initial();s['ready']=True
        s['units'][0]['pos']=[3,4]
        s['units'][5].update(pos=[2,4],overwatch=True)
        s['units'][6].update(pos=[4,4],overwatch=True)
        react(s,s['units'][0],lambda:1)
        self.assertEqual(len(s['combat_history']),2)
        self.assertEqual([e['sequence'] for e in s['combat_history']],[1,2])
        self.assertTrue(all(e['modifiers']['reaction']==1 for e in s['combat_history']))

    def test_history_bounded_and_snapshots_independent(self):
        s=initial()
        for i in range(45):
            s['last_combat']=dict(kind='Fire',roll=1,threshold=4,result='missed',attacker='us0')
            record_combat(s,{'cover':0})
        self.assertEqual(len(s['combat_history']),40)
        self.assertEqual(s['combat_history'][0]['sequence'],6)
        label=s['combat_history'][0]['attacker_label']
        s['units'][0]['pos']=[0,0]
        self.assertEqual(s['combat_history'][0]['attacker_label'],label)

    def test_no_roll_actions_are_explicit_and_old_saves_gain_history(self):
        s=initial();s['ready']=True
        s['units'][2]['pos']=[3,5];s['units'][5]['pos']=[3,4]
        result=apply(s,'us',dict(kind='suppress',unit='us2',target='de0'))
        self.assertNotIn('roll',result['last_combat'])
        self.assertIn('does not roll',result['last_combat']['note'])
        self.assertNotIn('combat_history',s)


if __name__=='__main__':unittest.main()
