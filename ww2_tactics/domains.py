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
