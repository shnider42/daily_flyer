"""Saved, bounded weather for new Midway/Britain 2.0 battles only.

Weather never consumes combat dice. The next two full rounds are a commitment,
not a probability: both armies get the same advance warning and conditions.
"""
import copy
import random
import secrets

VERSION = 1
MAPS = {'current:midway_2', 'current:britain_2'}
CONDITIONS = {
    'clear': dict(name='Clear', sight_penalty=0, flight_penalty=0, bombing_penalty=0,
                  launch_limit=None, description='Normal sight, flight distance and launches.'),
    'haze': dict(name='Haze', sight_penalty=2, flight_penalty=0, bombing_penalty=0,
                 launch_limit=None, description='Visual spotting −2 hexes (minimum 1). Radar retains its range.'),
    'rain': dict(name='Rain', sight_penalty=2, flight_penalty=1, bombing_penalty=1,
                 launch_limit=1, description='Visual spotting −2; flight legs −1 hex; bombing needs +1. '
                 'One launch per airfield/carrier per own turn. Landing and service keep normal rules.'),
}


def enabled(state):
    return state.get('weather_version') == VERSION and bool(state.get('_weather_plan'))


def initialize(state, seed=None):
    if state['battlefield']['id'] not in MAPS and not state['battlefield'].get('forecast_weather'):
        return state
    rng = random.Random(secrets.randbits(128) if seed is None else seed)
    plan = ['clear', 'clear']
    # Draw one- or two-round blocks; rain is followed by at least one clear
    # round. No surprise closures or weather damage to aircraft.
    while len(plan) < state['battlefield']['rounds']:
        condition = 'clear' if plan[-1] == 'rain' else rng.choices(
            ['clear', 'haze', 'rain'], weights=[4, 3, 3])[0]
        duration = rng.choice([1, 2])
        plan.extend([condition] * duration)
    state.update(weather_version=VERSION, _weather_plan=plan[:state['battlefield']['rounds']])
    for unit in state['units']:
        if unit['kind'] in {'carrier', 'airfield'}:
            unit['weather_launches'] = 0
    return state


def condition(state, round_number=None):
    if not enabled(state):
        return 'clear'
    plan = state['_weather_plan']
    return plan[min(max(0, (round_number or state['round'])-1), len(plan)-1)]


def profile(state, round_number=None):
    return CONDITIONS[condition(state, round_number)]


def public(state):
    if not enabled(state):
        return None
    current = min(state['round'], state['battlefield']['rounds'])
    def item(r):
        key = condition(state, r)
        return dict(round=r, condition=key, **copy.deepcopy(CONDITIONS[key]))
    return dict(version=VERSION, current=item(current),
                forecast=[item(r) for r in range(current+1, min(current+3, len(state['_weather_plan'])+1))],
                notice='Changes at the start of a full round, for both armies. The next two rounds are confirmed.')


def sight(state, unit, reach):
    if unit['kind'] == 'radar' or not enabled(state) or reach <= 0:
        return reach
    return max(1, reach-profile(state)['sight_penalty'])


def flight(state, unit, round_number=None):
    return max(1, unit['flight']-profile(state, round_number)['flight_penalty'])


def modifiers(state, unit):
    penalty = profile(state)['bombing_penalty'] if unit['kind'] == 'bomber' else 0
    return {'rain': penalty} if penalty else {}


def can_launch(state, unit):
    limit = profile(state)['launch_limit']
    return limit is None or unit.get('weather_launches', 0) < limit


def after_order(before, after, action):
    if not enabled(after):
        return
    if action['kind'] in {'launch', 'scramble'}:
        unit = next(u for u in after['units'] if u['id'] == action['unit'])
        unit['weather_launches'] = unit.get('weather_launches', 0)+1
    if before['turn'] != after['turn']:
        for unit in after['units']:
            if unit['side'] == after['turn'] and unit['kind'] in {'carrier', 'airfield'}:
                unit['weather_launches'] = 0
    if condition(before) != condition(after):
        from .visibility import update_intel
        update_intel(after)


def redact(result, state, side=None):
    result.pop('_weather_plan', None)
    value = public(state)
    if value:
        result['weather'] = value
        raw = {u['id']:u for u in state['units']}
        for unit in result.get('units',[]):
            if 'flight' in unit:
                unit['normal_flight'] = raw[unit['id']]['flight']
                unit['flight'] = flight(state,raw[unit['id']])
            if side and unit['side'] != side:
                unit.pop('weather_launches',None)
    return result
