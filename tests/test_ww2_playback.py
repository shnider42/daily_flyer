import copy
import unittest
from unittest.mock import patch
from ww2_tactics.engine import initial, apply
from ww2_tactics.computer import play_turn


class PlaybackTests(unittest.TestCase):
    def test_snapshots_chain_to_exact_final_state_without_nested_history(self):
        s=initial();s.update(ready=True,ai_side='us')
        original=copy.deepcopy(s)
        result=play_turn(s,roll=lambda:4)
        frames=result['computer_playback']['frames']
        self.assertTrue(frames)
        self.assertLessEqual(len(frames),25)
        self.assertEqual(frames[0]['before']['units'],s['units'])
        for a,b in zip(frames,frames[1:]):self.assertEqual(a['after'],b['before'])
        self.assertEqual(frames[-1]['after']['units'],result['units'])
        self.assertEqual(frames[-1]['after']['turn'],result['turn'])
        self.assertEqual(result['computer_playback']['id'],result['revision'])
        self.assertEqual(s,original)
        self.assertNotIn('computer_playback',frames[0]['before'])

    def test_actual_die_is_recorded_once_and_effect_matches(self):
        s=initial();s.update(ready=True,ai_side='us')
        s['units'][0]['pos']=[3,5];s['units'][5]['pos']=[3,4]
        rolls=[]
        def roll():rolls.append(5);return 5
        actions=iter([dict(kind='fire',unit='us0',target='de0'),dict(kind='end')])
        with patch('ww2_tactics.computer.choose_order',side_effect=lambda *args:next(actions)):
            result=play_turn(s,roll=roll)
        frame=result['computer_playback']['frames'][0]
        self.assertEqual(rolls,[5])
        self.assertEqual(frame['combat'][0]['roll'],5)
        self.assertEqual(frame['before']['units'][5]['hp'],3)
        self.assertEqual(frame['after']['units'][5]['hp'],2)
        self.assertTrue(frame['after']['units'][5]['pinned'])

    def test_next_turn_replaces_recording_and_human_actions_keep_it(self):
        s=initial();s.update(ready=True,ai_side='us')
        s=play_turn(s,roll=lambda:4)
        recorded=copy.deepcopy(s['computer_playback'])
        s=apply(s,'de',dict(kind='end'))
        self.assertEqual(s['computer_playback'],recorded)
        s=play_turn(s,roll=lambda:4)
        self.assertGreater(s['computer_playback']['id'],recorded['id'])


if __name__=='__main__':unittest.main()
