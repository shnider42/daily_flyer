"""One-unit half-track transport; passengers stay in saves, not on the battlefield."""
from . import combined
from .visibility import active, visible_ids


def passengers(state, carrier):
    return [u for u in state['units'] if u['hp'] > 0 and u.get('carrier_id') == carrier['id']]


def options(state, carrier):
    from .engine import distance, terrain, watchers
    result = dict(load=[], unload=[])
    if not combined.enabled(state) or carrier['kind'] != 'halftrack' or not active(carrier):
        return result
    aboard = passengers(state, carrier)
    if not aboard:
        if not carrier['pinned']:
            result['load'] = [u['id'] for u in state['units'] if active(u)
                              and u['side'] == carrier['side'] and u['kind'] in combined.INFANTRY
                              and not u['pinned'] and u['ap'] >= 1 and not u.get('transport_used')
                              and distance(u['pos'], carrier['pos']) == 1]
    elif aboard[0]['ap'] >= 1:
        troop = aboard[0]
        seen = visible_ids(state, carrier['side'])
        occupied = [u['pos'] for u in state['units'] if active(u) and u['id'] in seen]
        board = state['battlefield']
        result['unload'] = [dict(pos=[x, y], cost=1,
                                 threats=sum(w['id'] in seen for w in watchers(state, troop, [x, y])))
                            for y in range(max(0, carrier['pos'][1]-1), min(board['height'], carrier['pos'][1]+2))
                            for x in range(max(0, carrier['pos'][0]-1), min(board['width'], carrier['pos'][0]+2))
                            if distance(carrier['pos'], [x, y]) == 1 and terrain(x, y, state) != 'water'
                            and [x, y] not in occupied]
    return result


def follow(state, carrier):
    for troop in passengers(state, carrier):
        troop['pos'] = list(carrier['pos'])


def bail_out(state, carrier):
    """Destroyed carrier frees its hex. Survivors cannot immediately fight or reboard."""
    for troop in passengers(state, carrier):
        troop.pop('carrier_id', None)
        troop.update(pos=list(carrier['pos']), hp=max(0, troop['hp']-1), pinned=True,
                     ap=0, banked_ap=0, overwatch=False, entrenched=False, road_pending=False,
                     transport_used=True)
