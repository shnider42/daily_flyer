"""Local, bounded tactical opponent. Uses public information and legal engine orders."""
from .coordinates import column
import heapq
import copy

from .engine import apply, options, distance, terrain, line_clear
from .scenarios import battlefield
from .rulesets import dsl, turn_limit
from .visibility import fog, view, visible_ids, active, sight_reader
from . import naval, air, weapons, buildings, operations, fieldworks, linked_front, signals, airborne, domains, fubar, new_fronts, logistics


def objective_costs(state, goal=None, unit=None):
    if state.get('air_version'):return {}
    if state.get('fieldworks_version'):
        state = dict(state, fieldworks=dict(fieldworks.known(state, state['turn'])))
    board = battlefield(state)
    goal = tuple(goal or board['objective'])
    costs, queue = {goal: 0}, [(0, goal)]
    while queue:
        cost, pos = heapq.heappop(queue)
        if cost != costs[pos]:
            continue
        step = 2 if terrain(*pos, state) in {'woods', 'building', 'tower', 'bocage', 'bunker', 'marsh', 'rubble', 'mountain', 'ridge', 'wadi', 'oasis', 'dune'} else 1
        if unit:
            passable,step=fieldworks.movement(unit,terrain(*pos,state))
            if not passable:continue
        neighbors=((x,y) for y in range(max(0,pos[1]-1),min(board['height'],pos[1]+2))
                   for x in range(max(0,pos[0]-1),min(board['width'],pos[0]+2)))
        for nxt in neighbors:
            tile=terrain(*nxt,state)
            if not buildings.enterable(state, list(nxt), state['turn']):continue
            if unit and not fieldworks.movement(unit,tile)[0]:continue
            if (state.get('naval_version') and not naval.navigable(tile)) or (not state.get('naval_version') and tile=='water'):continue
            if distance(pos, nxt) == 1 and cost+step < costs.get(nxt, float('inf')):
                costs[nxt] = cost+step
                heapq.heappush(queue, (cost+step, nxt))
    return costs


@sight_reader
def choose_order(state, costs, visited, front_costs=None):
    if state.get('naval_version'):
        return naval.choose_order(state,costs,visited)
    if state.get('air_version'):
        return air.choose_order(state,costs,visited)
    side = state['turn']
    board = battlefield(state)
    seen=visible_ids(state,side)
    units = {u['id']: u for u in state['units'] if u['hp'] > 0 and u['id'] in seen}
    if signals.enabled(state) and fog(state):
        units={uid:(dict(u,overwatch=False) if u['side']!=side else u) for uid,u in units.items()}
    choices = []
    known_ground=fieldworks.map_for(state,side) if airborne.enabled(state) else None

    def add(score, unit, kind, **data):
        choices.append((score, dict(kind=kind, unit=unit['id'], **data)))

    objective_maps = front_costs if front_costs is not None else {p['id']: objective_costs(state, p['pos']) for p in board.get('linked_objectives', [])}
    mobility=objective_maps.setdefault('_mobility',{}) if signals.enabled(state) else {}
    for unit in units.values():
        if unit['side'] != side:
            continue
        if domains.joint(state) and unit['kind'] in domains.AIR_UNITS | domains.SHIPS:
            choices.extend(fubar.domain_choices(state,unit,options(state,unit),list(units.values()),visited))
            continue
        if new_fronts.enabled(state) and state['front_mode']=='evacuation' and unit['kind']=='landing_craft':
            choices.extend(new_fronts.boat_choices(state, unit, options(state, unit)))
            continue
        goal = new_fronts.goal(state, unit, fubar.ground_goal(state,unit) if domains.joint(state) else linked_front.goal(state, unit))
        if state.get('logistics_version') and unit['kind']=='supply' and unit.get('supply_packs'):
            needs=[v for v in state['units'] if v['side']==side and active(v) and logistics.delivery(v)]
            if needs:goal=min(needs,key=lambda v:distance(unit['pos'],v['pos']))['pos']
        unit_costs = next((objective_maps[p['id']] for p in board.get('linked_objectives', []) if p['pos'] == goal), costs)
        if signals.enabled(state) and unit['kind']!='at_gun':
            key=(tuple(goal),unit['kind'] if unit.get('armor') else 'mountain' if unit.get('mountain_movement') else 'foot',unit.get('move_ap'),bool(unit.get('afloat')))
            if key not in mobility:mobility[key]=objective_costs(state,goal,unit)
            unit_costs=mobility[key]
        legal = options(state, unit)
        for supply in legal.get('resupply', []):add(15, unit, 'resupply', target=supply['id'])
        if legal.get('airborne_drop'):
            candidates=[[x,y] for y in range(board['height']) for x in range(board['width']) if known_ground[y][x] in {'field','road','objective','beach'}
                        and not any(t['pos']==[x,y] for t in units.values())]
            def drop_score(pos):
                # Static geography, own beacons and spotted guns only. Unknown
                # Flak cannot influence destination selection or risk estimates.
                nearby=fieldworks.neighbors(state,pos)
                hazard=sum(known_ground[p[1]][p[0]] in {'water','woods','building','tower','bunker'} for p in nearby)
                known_flak=any(t['side']!=side and t.get('aa_radius') and not t['pinned'] and distance(t['pos'],pos)<=t['aa_radius'] for t in units.values())
                return -distance(pos,goal)-hazard*.7-8*known_flak+2*airborne.beacon_near(state,side,pos)
            if candidates:add(9,unit,'airborne_drop',pos=max(candidates,key=drop_score))
        if legal.get('mark_lz'):add(6 if distance(unit['pos'],goal)<=8 else .1,unit,'mark_lz')
        if legal.get('radio_update'):add(5,unit,'radio_update')
        if legal.get('observe'):add(1.5 if distance(unit['pos'],goal)<8 else .1,unit,'observe')
        if legal.get('conceal'):add(3 if unit['pos']==goal else .1,unit,'conceal')
        for uid in legal.get('demolition',[]):add(14,unit,'demolition',target=uid)
        for pos in legal.get('mortar_fire',[]):
            value=sum((4 if t['side']!=side else -6) for t in units.values() if distance(t['pos'],pos)<=1 and weapons.protection(t)=='infantry')
            if value>=4:add(value,unit,'mortar_fire',pos=pos)
        for kind in fieldworks.ORDERS:
            for pos in legal.get(kind, []):
                if distance(pos, goal) < distance(unit['pos'], goal):
                    helps_armor = any(friend['side']==side and friend['kind'] in {'tank','halftrack'} and active(friend) and distance(friend['pos'],pos)<=3 for friend in units.values())
                    add(9 if helps_armor else 6, unit, kind, pos=pos)
        choices.extend(weapons.ai_orders(state, unit, legal, units.values()))
        # A low-AP marksman with a useful long shot banks instead of spending
        # the last action walking into rifle range. Escape incoming fire first.
        if operations.enabled(state) and unit['kind']=='sniper' and 0<unit['ap']<3 and not unit['pinned'] and not any(
                unit['pos'] in b['area'] and b['ttl']==1 for b in state.get('barrages',[])) and any(
                enemy['side']!=side and active(enemy) and weapons.protection(enemy)=='infantry'
                and not enemy.get('armor') and distance(unit['pos'],enemy['pos'])<=operations.snipe_range(state,unit)
                and line_clear(unit['pos'],enemy['pos'],state.get('smoke',[]),state) for enemy in units.values()):
            continue
        # Embark on a distant approach; deploy near the fight, before using support fire.
        if unit['kind']=='halftrack' and legal.get('load') and unit_costs.get(tuple(unit['pos']),100)>5 and not any(
                u['side']!=side and distance(u['pos'],unit['pos'])<=6 for u in units.values()):
            for uid in legal['load']:
                if units[uid]['ap']>=2:
                    add(7,unit,'load',target=uid)
        if legal.get('unload'):
            threatened=any(u['side']!=side and distance(u['pos'],unit['pos'])<=5 for u in units.values())
            if unit['kind']=='landing_craft' or threatened or unit['pinned'] or unit['hp']<3 or unit_costs.get(tuple(unit['pos']),100)<=4:
                for move in legal['unload']:
                    cover=buildings.cover(state,move['pos'],side=side)
                    add(14+int(cover)-move['threats']*3-unit_costs.get(tuple(move['pos']),100)*.1,unit,'unload',pos=move['pos'])
        for pos in legal.get('drops',[]):
            add(20-unit_costs.get(tuple(pos),100)*.6,unit,'drop',pos=pos)
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
                splash_risk = sum(5 for friend in units.values() if friend['side']==side and distance(friend['pos'], target['pos'])<=1) if weapons.enabled(state) and weapons.profile(unit).get('splash') else 0
                collapse = buildings.condition(state,target['pos'],side)=='damaged' and weapons.profile(unit).get('structural')
                add(3+chance*7+(2 if target['hp'] == 1 else 0)+chance*4*bool(collapse)-splash_risk
                    + (3 if target['pos'] == goal else 0), unit, 'fire', target=target['id'])
        for shot in legal['grenades']:
            target = units[shot['id']]
            add(4+(7-shot['threshold'])/6*9+(2 if target['hp'] <= 2 else 0), unit, 'grenade', target=target['id'])
        for shot in legal['assaults']:
            target = units[shot['id']]
            score = (7-shot['threshold'])/6*10-1+(4 if target['pos'] == goal else 0)
            if target['hp'] <= 2:
                score += 3
            if unit['hp'] == 1:
                score -= 3
            add(score, unit, 'assault', target=target['id'])
        for target_id in legal['suppress']:
            target = units[target_id]
            add(6+(4 if target.get('overwatch') else 0), unit, 'suppress', target=target_id)
        for pos in legal['barrage']:
            nearby = [u for u in units.values() if distance(u['pos'], pos) <= 1 and (not weapons.enabled(state) or weapons.protection(u)=='infantry')]
            enemies = [u for u in nearby if u['side'] != side]
            value = sum(3+(2 if u.get('entrenched') else 0) for u in enemies)
            value -= sum(5 for u in nearby if u['side'] == side)
            if enemies and value >= 5:
                add(value, unit, 'barrage', pos=pos)
        imminent = [b for b in state.get('barrages', []) if b['ttl'] == 1]
        danger = any(unit['pos'] in b['area'] for b in imminent)
        holding = unit['pos'] == goal
        landing_goal=None
        if unit['kind']=='landing_craft':
            shores=[[x,y] for y in range(board['height']) for x in range(board['width']) if terrain(x,y,state)=='water'
                    and any(distance([x,y],[nx,ny])==1 and terrain(nx,ny,state)!='water'
                            for nx,ny in ((x,y-1),(x,y+1),(x-1,y),(x+1,y)) if 0<=nx<board['width'] and 0<=ny<board['height'])]
            if shores:landing_goal=min(shores,key=lambda p:distance(unit['pos'],p))
        for move in legal['moves']:
            if unit['kind']=='landing_craft' and not any(v.get('carrier_id')==unit['id'] for v in units.values()):continue
            pos = move['pos']
            if board.get('linked_objectives') and unit['kind'] not in linked_front.INFANTRY and any(pos == p['pos'] for p in board['linked_objectives']): continue
            if tuple(pos) in visited.get(unit['id'], set()):
                continue
            exposed = any(pos in b['area'] for b in imminent)
            move_goal=landing_goal or goal
            gain = (distance(unit['pos'],move_goal)-distance(pos,move_goal)) if unit['kind'] in {'amphibious','landing_craft'} else unit_costs.get(tuple(unit['pos']), 100)-unit_costs.get(tuple(pos), 100)
            score = 2+gain*2-move.get('threats', 0)*2
            if unit.get('afloat'):
                # Survive before pursuing objectives. Move toward any dry bank.
                dry=[[x,y] for y in range(board['height']) for x in range(board['width']) if known_ground[y][x]!='water' and fieldworks.movement(unit,known_ground[y][x])[0] and buildings.enterable(state,[x,y],side)]
                if dry:score=25-min(distance(pos,p) for p in dry)*3+(10 if known_ground[pos[1]][pos[0]]!='water' else 0)
            score += .6 * buildings.cover(state,pos,side=side)
            if unit['kind'] in {'scout','sniper'} and terrain(*pos,state)=='tower':score+=2
            if unit.get('repair_kits') and any(friend['side']==side and friend['kind']=='tank'
                    and friend['hp']<friend.get('max_hp',friend['hp']) and distance(pos,friend['pos'])==1 for friend in units.values()):score+=4
            if buildings.condition(state,pos,side)=='damaged':
                score -= 3 * any(enemy['side']!=side and weapons.profile(enemy).get('structural')
                                 and distance(enemy['pos'],pos)<=enemy['range'] for enemy in units.values())
            if pos == goal:
                score += 9
            if holding:
                score -= 15  # A pin does not interrupt objective occupation.
            if danger and not exposed and not holding:
                score += 16
            if exposed:
                score -= 10
            if new_fronts.enabled(state) and state['front_mode']=='evacuation' and unit.get('evacuee') and gain>0:score+=8
            add(score, unit, 'move', pos=pos)
        near = unit_costs.get(tuple(unit['pos']), 100) <= 2
        if legal['overwatch']:
            add(3 if near else .5, unit, 'overwatch')
        if legal['dig']:
            add(4 if holding else 1 if near else .1, unit, 'dig')
        # Smoke buys cover when crossing a watched approach without a viable attack.
        if legal['smoke'] and any(m.get('threats') for m in legal['moves']):
            # A second smoke screen cannot be placed on an already smoked hex.
            pos=unit['pos'] if unit['pos'] in legal['smoke'] else min(legal['smoke'],key=lambda p:distance(p,landing_goal or goal))
            add(5, unit, 'smoke', pos=list(pos))
    if not choices:
        return dict(kind='end')
    score, action = max(choices, key=lambda item: item[0])
    return action if score > (1.5 if dsl(state) else 0) else dict(kind='end')


def play_turn(state, roll=None):
    if not state.get('ai_side') or state['turn'] != state['ai_side'] or state['winner']:
        return state
    costs = objective_costs(state)
    front_costs = {p['id']: objective_costs(state, p['pos']) for p in battlefield(state).get('linked_objectives', [])}
    terrain_memory = (dict(buildings.known(state, state['ai_side'])), dict(fieldworks.known(state, state['ai_side'])))
    visited = {u['id']: {tuple(u['pos'])} for u in state['units']}
    orders = []
    frames = []
    def snapshot(value):
        if fog(value):
            return view(value,'us' if value['ai_side']=='de' else 'de')
        result=copy.deepcopy({key: value.get(key) for key in
                              ('units', 'smoke', 'barrages', 'round', 'turn', 'hold', 'winner', 'buildings', 'fieldworks', 'objective_control')})
        result.update(new_fronts.public_fields(value, 'us' if value['ai_side']=='de' else 'de'))
        return result
    previous_snapshot = snapshot(state)
    def perform(action):
        nonlocal state, previous_snapshot
        before = previous_snapshot
        sequence = state.get('combat_sequence', 0)
        effect_sequence = state.get('effect_sequence', 0)
        state = apply(state, state['ai_side'], action, roll=roll)
        after=snapshot(state)
        previous_snapshot=after
        safe_action=copy.deepcopy(action)
        effects=[e for e in state.get('effects', []) if e['sequence'] > effect_sequence]
        combat=[e for e in state.get('combat_history', []) if e.get('sequence', 0) > sequence]
        if fog(state):
            seen={u['id'] for u in before['units']+after['units']}
            for key in ('unit','target'):
                if safe_action.get(key) not in seen: safe_action.pop(key,None)
            tiles=before['visible_hexes']+after['visible_hexes']
            if safe_action.get('pos') not in tiles: safe_action.pop('pos',None)
            if action['kind'] in {'recon','field_recon','airborne_drop'}:safe_action.pop('pos',None)
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
        memory = (dict(buildings.known(state, state['ai_side'])), dict(fieldworks.known(state, state['ai_side'])))
        if memory != terrain_memory:
            costs = objective_costs(state)
            front_costs = {p['id']: objective_costs(state, p['pos']) for p in battlefield(state).get('linked_objectives', [])}
            terrain_memory = memory
        action = choose_order(state, costs, visited, front_costs)
        perform(action)
        actor = next((u for u in state['units'] if u['id'] == action.get('unit')), None)
        target = next((u for u in state['units'] if u['id'] == action.get('target')), None)
        orders.extend(['Turn ended.'] if action['kind'] == 'end' else
                      [f"{actor['kind'].capitalize()}: {action['kind']}" +
                       (f" → {column(action['pos'][0])}{action['pos'][1]+1}" if 'pos' in action else
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
