"""Local, bounded tactical opponent. Uses public information and legal engine orders."""
import heapq

from .engine import apply, options, distance, terrain
from .scenarios import battlefield


def objective_costs(state):
    board = battlefield(state)
    goal = tuple(board['objective'])
    costs, queue = {goal: 0}, [(0, goal)]
    cells = [(x, y) for y in range(board['height']) for x in range(board['width'])
             if terrain(x, y, state) != 'water']
    while queue:
        cost, pos = heapq.heappop(queue)
        if cost != costs[pos]:
            continue
        step = 2 if terrain(*pos, state) in {'woods', 'building'} else 1
        for nxt in cells:
            if distance(pos, nxt) == 1 and cost+step < costs.get(nxt, float('inf')):
                costs[nxt] = cost+step
                heapq.heappush(queue, (cost+step, nxt))
    return costs


def choose_order(state, costs, visited):
    side = state['turn']
    board = battlefield(state)
    units = {u['id']: u for u in state['units'] if u['hp'] > 0}
    choices = []

    def add(score, unit, kind, **data):
        choices.append((score, dict(kind=kind, unit=unit['id'], **data)))

    for unit in units.values():
        if unit['side'] != side:
            continue
        legal = options(state, unit)
        if legal['rally']:
            add(9, unit, 'rally')
        if legal['inspire']:
            add(12+len(legal['inspire']), unit, 'inspire')
        for shot in legal['targets']:
            target = units[shot['id']]
            chance = max(0, (7-shot['threshold'])/6)
            if chance:
                add(3+chance*7+(2 if target['hp'] == 1 else 0)
                    + (3 if target['pos'] == board['objective'] else 0), unit, 'fire', target=target['id'])
        for shot in legal['grenades']:
            target = units[shot['id']]
            add(4+(7-shot['threshold'])/6*9+(2 if target['hp'] <= 2 else 0), unit, 'grenade', target=target['id'])
        for shot in legal['assaults']:
            target = units[shot['id']]
            score = (7-shot['threshold'])/6*10-1+(4 if target['pos'] == board['objective'] else 0)
            if target['hp'] <= 2:
                score += 3
            if unit['hp'] == 1:
                score -= 3
            add(score, unit, 'assault', target=target['id'])
        for target_id in legal['suppress']:
            target = units[target_id]
            add(6+(4 if target.get('overwatch') else 0), unit, 'suppress', target=target_id)
        for pos in legal['barrage']:
            nearby = [u for u in units.values() if distance(u['pos'], pos) <= 1]
            enemies = [u for u in nearby if u['side'] != side]
            value = sum(3+(2 if u.get('entrenched') else 0) for u in enemies)
            value -= sum(5 for u in nearby if u['side'] == side)
            if enemies and value >= 5:
                add(value, unit, 'barrage', pos=pos)
        imminent = [b for b in state.get('barrages', []) if b['ttl'] == 1]
        danger = any(unit['pos'] in b['area'] for b in imminent)
        holding = unit['pos'] == board['objective']
        for move in legal['moves']:
            pos = move['pos']
            if tuple(pos) in visited.get(unit['id'], set()):
                continue
            exposed = any(pos in b['area'] for b in imminent)
            gain = costs.get(tuple(unit['pos']), 100)-costs.get(tuple(pos), 100)
            score = 2+gain*2-move.get('threats', 0)*2
            score += .6 if terrain(*pos, state) in {'woods', 'building', 'objective'} else 0
            if pos == board['objective']:
                score += 9
            if holding:
                score -= 15  # A pin does not interrupt objective occupation.
            if danger and not exposed and not holding:
                score += 16
            if exposed:
                score -= 10
            add(score, unit, 'move', pos=pos)
        near = costs.get(tuple(unit['pos']), 100) <= 2
        if legal['overwatch']:
            add(3 if near else .5, unit, 'overwatch')
        if legal['dig']:
            add(4 if holding else 1 if near else .1, unit, 'dig')
        # Smoke buys cover when crossing a watched approach without a viable attack.
        if legal['smoke'] and any(m.get('threats') for m in legal['moves']):
            add(5, unit, 'smoke', pos=list(unit['pos']))
    if not choices:
        return dict(kind='end')
    score, action = max(choices, key=lambda item: item[0])
    return action if score > 0 else dict(kind='end')


def play_turn(state, roll=None):
    if not state.get('ai_side') or state['turn'] != state['ai_side'] or state['winner']:
        return state
    costs = objective_costs(state)
    visited = {u['id']: {tuple(u['pos'])} for u in state['units']}
    orders = []
    # Five units with two AP: bounded even if additional abilities are added later.
    for _ in range(24):
        action = choose_order(state, costs, visited)
        state = apply(state, state['ai_side'], action, roll=roll)
        actor = next((u for u in state['units'] if u['id'] == action.get('unit')), None)
        target = next((u for u in state['units'] if u['id'] == action.get('target')), None)
        orders.extend(['Turn ended.'] if action['kind'] == 'end' else
                      [f"{actor['kind'].capitalize()}: {action['kind']}" +
                       (f" → {chr(65+action['pos'][0])}{action['pos'][1]+1}" if 'pos' in action else
                        f" → enemy {target['kind']}" if target else '')])
        for unit in state['units']:
            visited[unit['id']].add(tuple(unit['pos']))
        if state['winner'] or state['turn'] != state['ai_side']:
            break
    else:
        state = apply(state, state['ai_side'], dict(kind='end'), roll=roll)
    state['computer_orders'] = orders
    return state
