"""New-match DSL editions. Original scenario IDs and saved rules stay Legacy.

Current adapts the authored scenario, not its force or victory conditions. This
policy is applied only by creation, never by loading or projecting an old save.
"""
import copy
from . import air_support, carrier_decks

VERSION = 1
PREFIX = 'current:'
EDITIONS = [
    dict(id='current', name='Current', version=VERSION,
         brief='Shared DSL ground rules; original forces, terrain and missions.'),
    dict(id='legacy', name='Legacy', version=1,
         brief='The original maps and their existing scenario rules.'),
]


def current(state):
    return state.get('edition') == 'current' and state.get('edition_version') == VERSION


def scenario(board):
    """Return an isolated Current counterpart; the original remains untouched."""
    result = copy.deepcopy(board)
    result.update(id=PREFIX+board['id'], source_id=board['id'], edition='current',
                  edition_version=VERSION, dsl_only=True, ground_stacking=True)
    air_support.configure(result)
    carrier_decks.configure(result)
    ground = not (board.get('naval') or board.get('air') or board.get('fleet_battle_version') or board.get('night_ops_version'))
    if ground:
        result.update(signals=True, fire_control=True, logistics=True)
        # The original compact infantry maps become one explicit platoon. Do
        # not inflate their roster with HQ, armor or specialist counters.
        if not result.get('platoons'):
            result['roster_platoons'] = None
            result['platoons'] = [dict(id='A', name='Infantry platoon', center=board['width']//2)]
    rules = ['weapons', 'structures', 'layered_occupancy', 'ground_stacking']
    if board.get('night_ops_version'):rules += ['night_sight','searchlights','flares','transport_airlifts','finite_service']
    if board.get('carrier_ops_version'):rules += ['daytime_sight','finite_air_groups','carrier_decks','finite_service']
    if result.get('air_support'):
        rules += ['finite_service']
        if result['air_support']['ship_aa_range']:rules += ['shipboard_interception']
    if result.get('carrier_decks_version'):rules += ['finite_air_groups','carrier_decks','finite_service','shipboard_interception']
    if ground:
        rules += ['fog', 'platoon_intelligence', 'fire_direction', 'indirect_mortars',
                  'engineering', 'finite_supply']
    result['current_rules'] = dict(version=VERSION, systems=rules,
        ground_limit=2, heavy_ground_limit=1, air_limit=1, vessel_limit=1,
        exceptions=(['Fleet sight, naval orders and sea victory remain fleet rules.'] if board.get('naval') else
                    ['Aircraft sight, interception and station victory remain air rules.'] if board.get('air') else []))
    result['summary'] = (board.get('summary') or 'Original infantry force and mission')
    result['summary'] = result['summary'].replace('one unit per hex', 'two ground units per hex')
    return result


def initialize(state):
    """Save identity/capacity before shared systems and sight are initialized."""
    board = state['battlefield']
    if board.get('edition') != 'current':
        return state
    state.update(edition='current', edition_version=VERSION,
                 rule_manifest=copy.deepcopy(board['current_rules']),
                 ground_stack_version=1, layered_occupancy_version=1)
    if not (board.get('naval') or board.get('air')):
        state['fog_of_war'] = True
        for unit in state['units']:
            if not unit.get('platoon'):
                unit.update(platoon='A', number=int(unit['id'][2:])+1)
    return carrier_decks.initialize(air_support.initialize(state))
