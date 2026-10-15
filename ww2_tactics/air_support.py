"""Opt-in air support backports, saved only in newly created Current battles.

Keep the original rosters and combat profiles. Six service uses per field match
the newer operations; light, short-range ship AA is not an AA-escort upgrade.
Never infer these capabilities from a map ID when loading an existing battle.
"""
from . import crosswind, domains
from .visibility import active

VERSION = 1
MAPS = {'britain', 'fubar', 'worlds_collide'}


def configure(board):
    if board.get('source_id') not in MAPS:
        return
    board['air_support'] = dict(version=VERSION, airfield_stores=6,
                               ship_aa_range=1 if board.get('joint_ops') else 0)
    board['brief'] += (' Airfield service uses six finite stores per field: '
        '2 aircraft AP, once per aircraft per turn, repairs 1 strength and reloads bombs. '
        'Use your own platoon’s field or an army HQ field within one hex; stores do not regenerate.')
    if board['air_support']['ship_aa_range']:
        board['brief'] += (' Warships also have light AA: 2 AP to fire at an aircraft or '
            'prepare one flight-path interception, range 1, damage 1. Moving or firing '
            'cancels interception. Carrier search and abstract strike sorties are unchanged.')


def enabled(state):
    return state.get('air_support_version') == VERSION


def initialize(state):
    config = state['battlefield'].get('air_support', {})
    if config.get('version') != VERSION or enabled(state):
        return state
    state['air_support_version'] = VERSION
    for unit in state['units']:
        if unit['kind'] == 'airfield':
            unit.update(air_stores=config['airfield_stores'], max_air_stores=config['airfield_stores'])
        elif unit['kind'] in domains.SHIPS and config['ship_aa_range']:
            unit['ship_aa_range'] = config['ship_aa_range']
            unit.setdefault('weapon_overrides', {})['flak'] = dict(damage=1, label='Light shipboard anti-aircraft fire')
    return state


def ship_aa(state, unit):
    """Existing fleet battles keep their exact authored AA profiles."""
    return bool((crosswind.enabled(state) or enabled(state)) and unit.get('ship_aa_range'))


def service_fields(state, unit):
    """Own resources only; never spend another platoon's stores."""
    if not enabled(state):
        return []
    return [u for u in state['units'] if active(u) and u['side'] == unit['side']
            and u['kind'] == 'airfield' and u.get('air_stores', 0) > 0
            and (u.get('platoon') == unit.get('platoon') or u.get('platoon') == 'HQ')]


def service_field(state, unit):
    from .engine import distance
    return next((u for u in service_fields(state, unit) if distance(u['pos'], unit['pos']) <= 1), None)
