"""Finite, adjacent supply transfers. Opt-in for newly authored operations only."""
from . import domains
from .visibility import active

VERSION = 1
ORDERS = {'resupply'}


def initialize(state):
    if not state['battlefield'].get('logistics'):
        return state
    state['logistics_version'] = VERSION
    for u in state['units']:
        if u.get('mortar_range'):
            u.setdefault('max_shells', u.get('shells', 3))
        if u['kind'] == 'engineer':
            u.setdefault('max_repair_kits', u.get('repair_kits', 3))
    return state


def delivery(unit):
    if unit.get('mortar_range') and unit.get('shells', 0) < unit.get('max_shells', 3):
        return 'shells', min(2, unit.get('max_shells', 3) - unit.get('shells', 0))
    if unit['kind'] == 'engineer' and unit.get('repair_kits', 0) < unit.get('max_repair_kits', 3):
        return 'repair_kits', 1
    return None


def options(state, unit):
    from .engine import distance
    result = dict(resupply=[])
    if (state.get('logistics_version') != VERSION or unit['kind'] != 'supply'
            or not state['ready'] or state['winner'] or state['turn'] != unit['side']
            or not active(unit) or unit['pinned'] or unit['ap'] < 2 or not unit.get('supply_packs')):
        return result
    for friend in state['units']:
        if (friend['side'] == unit['side'] and active(friend) and not friend.get('afloat')
                and friend.get('resupplied_round') != state['round']
                and domains.support_reach(state,distance(unit['pos'], friend['pos']))):
            item = delivery(friend)
            if item:
                resource, amount = item
                result['resupply'].append(dict(id=friend['id'], resource=resource, amount=amount))
    return result


def action(state, unit, order, legal):
    choice = next((c for c in legal.get('resupply', []) if c['id'] == order.get('target')), None)
    if not choice:
        raise ValueError('Resupply needs 2 AP, one pack and an adjacent friendly mortar or engineer below capacity. Each recipient can receive supplies once per round.')
    friend = next(u for u in state['units'] if u['id'] == choice['id'])
    friend[choice['resource']] = friend.get(choice['resource'], 0) + choice['amount']
    friend['resupplied_round'] = state['round']
    unit.update(ap=unit['ap']-2, supply_packs=unit['supply_packs']-1, overwatch=False, road_pending=False)
    resource = 'mortar shell(s)' if choice['resource'] == 'shells' else 'engineer repair kit'
    return f"Delivered {choice['amount']} {resource}. {unit['supply_packs']} supply packs remain. No strength, AP or fired-this-round limit was restored."
