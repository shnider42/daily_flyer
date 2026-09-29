"""Local, bounded tactical opponent. Uses public information and legal engine orders."""
import heapq
import copy

from .engine import apply, options, distance, terrain
from .scenarios import battlefield
from .rulesets import dsl, turn_limit
from .visibility import fog, view, visible_ids
from . import naval, air


def objective_costs(state):
    if state.get('air_version'):return {}
    board = battlefield(state)
    goal = tuple(board['objective'])
    costs, queue = {goal: 0}, [(0, goal)]
    while queue:
        cost, pos = heapq.heappop(queue)
        if cost != costs[pos]:
            continue
        step = 2 if terrain(*pos, state) in {'woods', 'building'} else 1
        neighbors=((x,y) for y in range(max(0,pos[1]-1),min(board['height'],pos[1]+2))
                   for x in range(max(0,pos[0]-1),min(board['width'],pos[0]+2)))
        for nxt in neighbors:
            tile=terrain(*nxt,state)
            if (state.get('naval_version') and not naval.navigable(tile)) or (not state.get('naval_version') and tile=='water'):continue
            if distance(pos, nxt) == 1 and cost+step < costs.get(nxt, float('inf')):
                costs[nxt] = cost+step
                heapq.heappush(queue, (cost+step, nxt))
    return costs


def choose_order(state, costs, visited):
    if state.get('naval_version'):
        return naval.choose_order(state,costs,visited)
    if state.get('air_version'):
        return air.choose_order(state,costs,visited)
    side = state['turn']
    board = battlefield(state)
    seen=visible_ids(state,side)
    units = {u['id']: u for u in state['units'] if u['hp'] > 0 and u['id'] in seen}
    choices = []

    def add(score, unit, kind, **data):
        choices.append((score, dict(kind=kind, unit=unit['id'], **data)))

    for unit in units.values():
        if unit['side'] != side:
            continue
        legal = options(state, unit)
        # Embark on a distant approach; deploy near the fight, before using support fire.
        if unit['kind']=='halftrack' and legal.get('load') and costs.get(tuple(unit['pos']),100)>5 and not any(
                u['side']!=side and distance(u['pos'],unit['pos'])<=6 for u in units.values()):
            for uid in legal['load']:
                if units[uid]['ap']>=2:
                    add(7,unit,'load',target=uid)
        if legal.get('unload'):
            threatened=any(u['side']!=side and distance(u['pos'],unit['pos'])<=5 for u in units.values())
            if unit['kind']=='landing_craft' or threatened or unit['pinned'] or unit['hp']<3 or costs.get(tuple(unit['pos']),100)<=4:
                for move in legal['unload']:
                    cover=terrain(*move['pos'],state) in {'woods','building','objective'}
                    add(14+int(cover)-move['threats']*3-costs.get(tuple(move['pos']),100)*.1,unit,'unload',pos=move['pos'])
        for pos in legal.get('drops',[]):
            add(20-costs.get(tuple(pos),100)*.6,unit,'drop',pos=pos)
        if legal['rally']:
            add(9, unit, 'rally')
        if legal['inspire']:
            add(12+len(legal['inspire']), unit, 'inspire')
        if dsl(state) and legal['command']:
            ready_shots = sum(units[i]['ap'] == 1 and any(enemy['side'] != side and distance(units[i]['pos'], enemy['pos']) <= units[i]['range'] for enemy in units.values()) for i in legal['command'])
            add(5+len(legal['command'])+ready_shots*2, unit, 'command')
        for target_id in ([] if dsl(state) else legal['command']):
            recipient = units[target_id]
            # Prefer restoring a second AP for an attack, otherwise aid an advance.
            armed = recipient['ap'] == 1 and any(u['side'] != side and distance(recipient['pos'], u['pos']) <= recipient['range'] for u in units.values())
            add(8 if armed else 4.5, unit, 'command', target=target_id)
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
        landing_goal=None
        if unit['kind']=='landing_craft':
            shores=[[x,y] for y in range(board['height']) for x in range(board['width']) if terrain(x,y,state)=='water'
                    and any(distance([x,y],[nx,ny])==1 and terrain(nx,ny,state)!='water'
                            for nx,ny in ((x,y-1),(x,y+1),(x-1,y),(x+1,y)) if 0<=nx<board['width'] and 0<=ny<board['height'])]
            if shores:landing_goal=min(shores,key=lambda p:distance(unit['pos'],p))
        for move in legal['moves']:
            if unit['kind']=='landing_craft' and not any(v.get('carrier_id')==unit['id'] for v in units.values()):continue
            pos = move['pos']
            if tuple(pos) in visited.get(unit['id'], set()):
                continue
            exposed = any(pos in b['area'] for b in imminent)
            goal=landing_goal or board['objective']
            gain = (distance(unit['pos'],goal)-distance(pos,goal)) if unit['kind'] in {'amphibious','landing_craft'} else costs.get(tuple(unit['pos']), 100)-costs.get(tuple(pos), 100)
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
            # A second smoke screen cannot be placed on an already smoked hex.
            pos=unit['pos'] if unit['pos'] in legal['smoke'] else min(legal['smoke'],key=lambda p:distance(p,landing_goal or board['objective']))
            add(5, unit, 'smoke', pos=list(pos))
    if not choices:
        return dict(kind='end')
    score, action = max(choices, key=lambda item: item[0])
    return action if score > (1.5 if dsl(state) else 0) else dict(kind='end')


def play_turn(state, roll=None):
    if not state.get('ai_side') or state['turn'] != state['ai_side'] or state['winner']:
        return state
    costs = objective_costs(state)
    visited = {u['id']: {tuple(u['pos'])} for u in state['units']}
    orders = []
    frames = []
    def snapshot(value):
        if fog(value):
            return view(value,'us' if value['ai_side']=='de' else 'de')
        return copy.deepcopy({key: value.get(key) for key in
                              ('units', 'smoke', 'barrages', 'round', 'turn', 'hold', 'winner')})
    def perform(action):
        nonlocal state
        before = snapshot(state)
        sequence = state.get('combat_sequence', 0)
        effect_sequence = state.get('effect_sequence', 0)
        state = apply(state, state['ai_side'], action, roll=roll)
        after=snapshot(state)
        safe_action=copy.deepcopy(action)
        effects=[e for e in state.get('effects', []) if e['sequence'] > effect_sequence]
        combat=[e for e in state.get('combat_history', []) if e.get('sequence', 0) > sequence]
        if fog(state):
            seen={u['id'] for u in before['units']+after['units']}
            for key in ('unit','target'):
                if safe_action.get(key) not in seen: safe_action.pop(key,None)
            tiles=before['visible_hexes']+after['visible_hexes']
            if safe_action.get('pos') not in tiles: safe_action.pop('pos',None)
            if action['kind'] in {'move','drop'} and action.get('unit') not in {u['id'] for u in after['units']}:
                safe_action.pop('pos',None)
            effects=[e for e in effects if all(p in tiles for p in e['positions'])]
            human='us' if state['ai_side']=='de' else 'de'
            combat=[e for e in state.get('reports',{}).get(human,{}).get('combat',[]) if e.get('sequence',0)>sequence]
            if 'unit' not in safe_action and action['kind']!='end':
                if before==after and not combat: return
                safe_action={'kind':'contact'}
        frames.append(dict(action=safe_action,before=before,after=after,effects=copy.deepcopy(effects),combat=copy.deepcopy(combat)))
    # Scale the guard to the army's AP budget, including the larger scenario.
    budget = max(24, sum((turn_limit(u)+(turn_limit(u) if u['kind']=='halftrack' else 1) if dsl(state) else 2) for u in state['units'] if u['side']==state['ai_side'] and u['hp']>0)+1)
    for _ in range(budget):
        action = choose_order(state, costs, visited)
        perform(action)
        actor = next((u for u in state['units'] if u['id'] == action.get('unit')), None)
        target = next((u for u in state['units'] if u['id'] == action.get('target')), None)
        orders.extend(['Turn ended.'] if action['kind'] == 'end' else
                      [f"{actor['kind'].capitalize()}: {action['kind']}" +
                       (f" → {chr(65+action['pos'][0])}{action['pos'][1]+1}" if 'pos' in action else
                        f" → {'friendly' if target['side']==actor['side'] else 'enemy'} {target['kind']}" if target else '')])
        for unit in state['units']:
            visited[unit['id']].add(tuple(unit['pos']))
        if state['winner'] or state['turn'] != state['ai_side']:
            break
    else:
        perform(dict(kind='end'))
    state['computer_orders'] = orders
    state['computer_playback'] = dict(id=state['revision'], frames=frames)
    return state
