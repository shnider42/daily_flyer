import copy
import unittest

from ww2_tactics.scenarios import SCENARIOS, catalog, get_scenario
from ww2_tactics.scenario_browser import CATEGORIES, describe


class ScenarioBrowserTests(unittest.TestCase):
    def test_catalog_metadata_covers_every_map_without_changing_battles(self):
        original = copy.deepcopy(SCENARIOS)
        boards = catalog()
        self.assertEqual([b['id'] for b in boards], list(SCENARIOS))
        ranks = []
        for position, board in enumerate(boards):
            meta = board.pop('browse')
            self.assertEqual(board, get_scenario(board['id']))
            self.assertEqual(meta['release_order'], position)
            self.assertTrue(meta['focus'])
            self.assertTrue(set(meta['tags']) <= set(CATEGORIES))
            self.assertEqual(len(meta['tags']), len(set(meta['tags'])))
            ranks.append(meta['learning_order'])
        self.assertEqual(len(ranks), len(set(ranks)))
        self.assertEqual(SCENARIOS, original)
        self.assertEqual(min(catalog(), key=lambda b: b['browse']['learning_order'])['id'], 'village')

    def test_new_scenarios_get_a_safe_fallback(self):
        board = dict(id='future', air=True, playtest=True)
        meta = describe(board, 18)
        self.assertEqual(meta['tags'], ['attack-defend', 'air', 'playtest'])
        self.assertEqual(meta['learning_order'], 1000)
        self.assertNotIn('browse', board)

    def test_cross_domain_maps_are_not_forced_into_one_category(self):
        boards = {b['id']: b['browse'] for b in catalog()}
        self.assertTrue({'air', 'naval', 'combined', 'airborne', 'amphibious', 'control', 'playtest'} <= set(boards['fubar']['tags']))
        self.assertIn('amphibious', boards['midway']['tags'])
        self.assertIn('airborne', boards['market_garden']['tags'])
