"""Persistent structures over the existing terrain grid, with per-army memory.

The base tile stays 'building': wrecks still block sight and conceal units.
Only new matches opt in. No random terrain changes occur when loading a save.
"""
import secrets

VERSION = 1
STATES = ('intact', 'damaged', 'destroyed')
TILES = {'building', 'tower', 'church', 'bunker'}


def enabled(state):
    return state.get('building_version') == VERSION


def key(pos):
    return f'{pos[0]},{pos[1]}'


def positions(state):
    return [[x, y] for y, row in enumerate(state['battlefield']['map'])
            for x, tile in enumerate(row) if tile in TILES]


def initialize(state, rng=None):
    if state.get('ruleset') != 'dsl' or enabled(state):
        return state
    state['building_version'] = VERSION
    tiles = positions(state)
    occupied = {key(u['pos']) for u in state['units'] if u['hp'] > 0}
    protected = {key(p) for p in tiles if key(p) in occupied or state['battlefield']['map'][p[1]][p[0]] in {'tower','church'}}
    eligible = [p for p in tiles if key(p) not in protected]
    conditions = ['intact'] * len(eligible)
    distribution = state['battlefield'].get('building_conditions', {})
    if distribution:
        # Fixed proportions keep random layouts comparable; never trap a spawn.
        n = len(eligible)
        conditions = ['destroyed'] * (n * distribution.get('destroyed', 0) // 100)
        conditions += ['damaged'] * (n * distribution.get('damaged', 0) // 100)
        conditions += ['intact'] * (n - len(conditions))
        (rng or secrets.SystemRandom()).shuffle(conditions)
    state['buildings'] = {key(p):c for p,c in zip(eligible,conditions)}
    state['buildings'].update({coord:'intact' for coord in protected})
    # Both armies start with the same terrain survey. Later changes require sight.
    state['building_intel'] = {side: dict(state['buildings']) for side in ('us', 'de')}
    return state


def known(state, side=None):
    if side is not None and state.get('fog_of_war'):
        return state.get('building_intel', {}).get(side, {})
    return state.get('buildings', {})


def condition(state, pos, side=None):
    from .engine import terrain
    if not enabled(state) or terrain(*pos, state) not in TILES:
        return None
    return known(state, side).get(key(pos), 'intact')


def enterable(state, pos, side=None):
    return condition(state, pos, side) != 'destroyed'


def cover(state, pos, *, objective=True, side=None):
    from .engine import terrain
    tile = terrain(*pos, state)
    if tile == 'bunker': return 1 if condition(state, pos, side) == 'damaged' else 2
    return int(tile in ({'woods', 'building', 'tower', 'church', 'bocage', 'rubble', 'mountain', 'ridge', 'wadi', 'oasis', 'objective'} if objective else {'woods', 'building', 'tower', 'church', 'bocage', 'rubble', 'mountain', 'ridge', 'wadi', 'oasis'})
               and condition(state, pos, side) != 'damaged')


def observe(state):
    if not enabled(state):
        return
    from .visibility import sees_hex
    for side in ('us', 'de'):
        memory = state.setdefault('building_intel', {}).setdefault(side, {})
        for coord, value in state.get('buildings', {}).items():
            if memory.get(coord, 'intact') != value:
                pos = [int(n) for n in coord.split(',')]
                if not state.get('fog_of_war') or sees_hex(state, side, pos):
                    memory[coord] = value


def hit(state, pos):
    """One structural hit, returning casualties separately for sight redaction."""
    before = condition(state, pos)
    if before not in {'intact', 'damaged'}:
        return []
    from .visibility import sees_hex
    observers = [side for side in ('us', 'de') if not state.get('fog_of_war') or sees_hex(state, side, pos)]
    after = 'damaged' if before == 'intact' else 'destroyed'
    state['buildings'][key(pos)] = after
    for side in observers:
        state.setdefault('building_intel', {}).setdefault(side, {})[key(pos)] = after
    state.setdefault('_structure_events', []).append(dict(pos=list(pos), before=before, after=after, observers=observers))
    impacts = []
    if after == 'destroyed':
        from .weapons import protection, impact_record
        for unit in state['units']:
            if unit['hp'] > 0 and not unit.get('reserve') and unit['pos'] == pos and protection(unit) != 'aircraft':
                unit.update(hp=0, ap=0, pinned=False, overwatch=False, entrenched=False)
                unit.pop('carrier_id', None)
                impacts.append(impact_record(unit, 'eliminated in building collapse'))
    return impacts


def revealed(before, after):
    """Newly scouted damage commits undo; damage caused by this order does not."""
    if not enabled(before) or not before.get('fog_of_war'):
        return False
    return any(value != known(before, side).get(coord, 'intact')
               and before.get('buildings', {}).get(coord) == after.get('buildings', {}).get(coord)
               for side in ('us', 'de') for coord, value in known(after, side).items())
