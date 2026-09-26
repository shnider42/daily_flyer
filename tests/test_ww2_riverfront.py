import unittest
from collections import Counter
from ww2_tactics.scenarios import get_scenario
from ww2_tactics.engine import initial, apply
from ww2_tactics.computer import objective_costs, play_turn


class RiverfrontTests(unittest.TestCase):
    def test_exact_fourfold_area_and_three_distinct_platoons(self):
        board=get_scenario('riverfront')
        self.assertEqual(board['width']*board['height'],4*81)
        s=initial('riverfront');self.assertEqual(len(s['units']),30)
        self.assertEqual(len({tuple(u['pos']) for u in s['units']}),30)
        for side in ['us','de']:
            units=[u for u in s['units'] if u['side']==side]
            self.assertEqual(Counter(u['kind'] for u in units),{'squad':9,'leader':3,'mg':3})
            self.assertEqual(Counter(u['platoon'] for u in units),{'A':5,'B':5,'C':5})
        self.assertEqual(s['support'],{'us':1,'de':1})

    def test_all_units_reach_objective_and_each_bridge_has_exits(self):
        s=initial('riverfront');costs=objective_costs(s);s['ready']=True
        for u in s['units']:
            self.assertIn(tuple(u['pos']),costs)
            self.assertLess(costs[tuple(u['pos'])],s['battlefield']['rounds']*2)
        for x in [3,8,14]:
            self.assertEqual(s['battlefield']['map'][9][x],'bridge')
            self.assertIn((x,9),costs)
            for y in [8,10]:self.assertIn((x,y),costs)
        self.assertEqual(sum(tile=='water' for row in s['battlefield']['map'] for tile in row),15)

    def test_computer_uses_full_large_army_action_budget(self):
        s=initial('riverfront');s.update(ready=True,ai_side='us')
        result=play_turn(s,roll=lambda:4)
        self.assertEqual(result['turn'],'de')
        self.assertTrue(all(u['ap']==0 for u in result['units'] if u['side']=='us'))
        self.assertGreater(len(result['computer_playback']['frames']),24)
        self.assertLessEqual(len(result['computer_playback']['frames']),32)

    def test_original_force_sizes_remain_and_large_timeout_is_24(self):
        for scenario in ['village','orchard','stonebridge']:
            s=initial(scenario);self.assertEqual(len(s['units']),10)
            self.assertTrue(all('platoon' not in u for u in s['units']))
        s=initial('riverfront');s.update(ready=True,turn='de',round=24)
        self.assertEqual(apply(s,'de',dict(kind='end'))['winner'],'de')


if __name__=='__main__':unittest.main()
