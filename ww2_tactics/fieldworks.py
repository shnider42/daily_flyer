"""Versioned ground engineering, with remembered terrain rather than global leaks."""
import copy

VERSION = 1
ORDERS = {'breach', 'clear_wreck', 'bridge_gap'}
COSTS = {'breach': 2, 'clear_wreck': 2, 'bridge_gap': 3}
CONCEALMENT = {'woods', 'building', 'bocage', 'bunker', 'mountain', 'ridge', 'wadi', 'oasis'}


def key(pos):
    return f'{pos[0]},{pos[1]}'


def initialize(state):
    if state.get('ruleset') != 'dsl' or state.get('naval_version') or state.get('air_version'):
        return state
    state.setdefault('fieldworks_version', VERSION)
    state.setdefault('fieldworks', {})
    state.setdefault('fieldworks_intel', {'us': {}, 'de': {}})
    for u in state['units']:
        if u['kind'] == 'engineer': u.setdefault('bridge_kits', 1)
    return state


def known(state, side=None):
    if side is not None and state.get('fog_of_war'):
        return state.get('fieldworks_intel', {}).get(side, {})
    return state.get('fieldworks', {})


def map_for(state, side):
    board = copy.deepcopy(state['battlefield']['map'])
    for coord, tile in known(state, side).items():
        x, y = map(int, coord.split(',')); board[y][x] = tile
    return board


def movement(unit, tile):
    """Shared entry rules used by movement, unloading and pathfinding."""
    if unit['kind'] in {'at_gun','flak'}: return False, 1
    if unit.get('afloat'):return tile not in {'mountain','tower','bunker'},1
    if unit.get('move_ap'):
        basic=dict(unit);basic.pop('move_ap')
        passable,cost=movement(basic,tile)
        return passable,max(cost,unit['move_ap'])
    if unit['kind'] == 'landing_craft': return tile == 'water', 1
    if tile=='mountain': return unit['kind'] not in {'tank','halftrack','amphibious'}, 1 if unit.get('mountain_movement') else 3
    if tile in {'ridge','wadi'}: return unit['kind'] not in {'tank','halftrack','amphibious'}, 1 if unit.get('mountain_movement') else 2
    if tile=='dune': return True, 2 if unit['kind'] in {'tank','halftrack','amphibious'} else 1
    if tile=='oasis': return unit['kind'] not in {'tank','halftrack','amphibious'}, 2
    if tile == 'water': return unit['kind'] == 'amphibious', 1
    if tile == 'marsh': return unit['kind'] not in {'tank', 'halftrack'}, 1 if unit['kind'] == 'amphibious' else 2
    if tile in {'woods', 'building', 'tower', 'bocage', 'bunker'}:
        return unit['kind'] not in {'tank', 'halftrack', 'amphibious'}, 2
    return True, 2 if tile == 'rubble' else 1


def neighbors(state, pos):
    from .engine import distance
    b = state['battlefield']; x, y = pos
    return [[nx, ny] for ny in range(max(0, y-1), min(b['height'], y+2))
            for nx in range(max(0, x-1), min(b['width'], x+2)) if distance(pos, [nx, ny]) == 1]


def bridgeable(state, pos, side=None):
    from .engine import terrain, cube
    def tile(p): return known(state, side).get(key(p), state['battlefield']['map'][p[1]][p[0]])
    if tile(pos) != 'water': return False
    banks = [p for p in neighbors(state, pos) if tile(p) in {'field', 'road', 'beach', 'rubble', 'objective'}]
    center = cube(pos)
    # Opposite firm banks only: a single-hex stream, never open sea or a wide river.
    return any(all(a+b == 2*c for a, b, c in zip(cube(p), cube(q), center))
               for p in banks for q in banks if p != q)


def options(state, unit):
    from .engine import terrain
    from .visibility import active
    from .buildings import condition
    result = {k: [] for k in ORDERS}
    if not state.get('fieldworks_version') or not state['ready'] or state.get('winner') or unit['side'] != state['turn'] or unit['kind'] != 'engineer' or not active(unit) or unit['pinned']:
        return result
    for p in neighbors(state, unit['pos']):
        if unit['ap'] >= 2:
            if terrain(*p, state) == 'bocage': result['breach'].append(p)
            if condition(state, p, unit['side']) == 'destroyed': result['clear_wreck'].append(p)
        if unit['ap'] >= 3 and unit.get('bridge_kits') and bridgeable(state, p, unit['side']): result['bridge_gap'].append(p)
    return result


def action(state, unit, order, legal):
    from .visibility import sees_hex
    kind, pos = order['kind'], order.get('pos')
    if pos not in legal.get(kind, []): raise ValueError('Engineer order unavailable: check adjacent terrain, AP and bridge kits.')
    observers = [s for s in ('us', 'de') if not state.get('fog_of_war') or sees_hex(state, s, pos)]
    tile = {'breach': 'field', 'clear_wreck': 'rubble', 'bridge_gap': 'bridge'}[kind]
    state['fieldworks'][key(pos)] = tile
    for side in observers: state['fieldworks_intel'][side][key(pos)] = tile
    unit.update(ap=unit['ap']-COSTS[kind], overwatch=False, road_pending=False)
    if kind == 'bridge_gap': unit['bridge_kits'] -= 1
    return {'breach': 'Engineers opened a gap in the bocage. The gap now admits vehicles and exposes a firing lane.',
            'clear_wreck': 'Engineers cleared the collapsed structure. Rubble is passable for 2 AP and provides light cover.',
            'bridge_gap': 'Engineers built a field bridge between firm banks. Either army can use it.'}[kind]


def observe(state):
    from .visibility import sees_hex
    for side in ('us', 'de'):
        for coord, tile in state.get('fieldworks', {}).items():
            if known(state, side).get(coord) != tile and (not state.get('fog_of_war') or sees_hex(state, side, list(map(int, coord.split(','))))):
                state.setdefault('fieldworks_intel', {}).setdefault(side, {})[coord] = tile


def revealed(before, after):
    return any(tile != known(before, side).get(coord) and before.get('fieldworks', {}).get(coord) == after.get('fieldworks', {}).get(coord)
               for side in ('us', 'de') for coord, tile in known(after, side).items())
