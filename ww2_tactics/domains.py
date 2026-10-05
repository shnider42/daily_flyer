"""Version-gated occupancy rules for joint air / surface operations."""
AIRCRAFT = frozenset({'fighter', 'bomber'})
AIR_UNITS = AIRCRAFT | {'aa_gun', 'radar', 'airfield'}
SHIPS = frozenset({'carrier', 'battleship', 'cruiser', 'destroyer'})


def joint(state):
    return state.get('joint_ops_version') == 1


def is_air(unit):
    return unit['kind'] in AIRCRAFT


def blocks(state, mover, other):
    """Callers still check activity/position/visibility, never hidden previews."""
    return not joint(state) or is_air(mover) == is_air(other)


def surface(state, unit):
    return not joint(state) or not is_air(unit)


def ground_stacking(state):
    return state.get('ground_stack_version') == 1


def initialize(state):
    if state.get('ruleset') == 'dsl' and state['battlefield'].get('ground_stacking'):
        state['ground_stack_version'] = 1
    return state


def blocked(state, mover, pos, seen=None):
    """Capacity uses observed occupants in previews, all occupants on execution.

    Dead units, reserves and passengers do not occupy a slot. Enemy units never
    share a ground hex; a successful assault must clear it before advancing.
    """
    from .visibility import active
    occupants = [u for u in state['units'] if u['id'] != mover['id'] and active(u)
                 and u['pos'] == pos and (seen is None or u['id'] in seen)
                 and blocks(state, mover, u)]
    return capacity_full(state,mover,occupants)


def capacity_full(state, mover, occupants):
    if not ground_stacking(state):return bool(occupants)
    from .combined import INFANTRY
    return (any(u['side'] != mover['side'] for u in occupants) or len(occupants) >= 2
            or mover['kind'] not in INFANTRY and any(u['kind'] not in INFANTRY for u in occupants))


def blocked_hexes(state, mover, seen):
    """Build all preview occupancy once per unit, not once per candidate move."""
    from .visibility import active
    groups={}
    for unit in state['units']:
        if unit['id']!=mover['id'] and unit['id'] in seen and active(unit) and blocks(state,mover,unit):
            groups.setdefault(tuple(unit['pos']),[]).append(unit)
    return {pos for pos,units in groups.items() if capacity_full(state,mover,units)}


def support_reach(state, distance):
    """Sharing a hex does not put friendly supply/repair teams out of reach."""
    return distance == 1 or ground_stacking(state) and distance == 0
