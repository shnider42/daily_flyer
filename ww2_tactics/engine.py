"""Pure rules; every move is validated again on the server."""
from .coordinates import column
import copy
import secrets
from functools import lru_cache
from .scenarios import battlefield, get_scenario
from .support import role_options, role_action, resolve_barrages
from .combat_display import record_combat
from .rulesets import profile, dsl, base_ap, bank_limit, turn_limit, road
from .effects import record_effect
from . import combined, naval, transport, campaigns, air, weapons, buildings, operations, fieldworks, linked_front, signals, airborne, domains, fubar, logistics, new_fronts, deployment
from .visibility import fog, active, visible_ids, unit_visible_ids, sees_hex, update_intel, record_reports

WIDTH, HEIGHT = 7, 9
OBJECTIVE = [3, 4]
NAMES = {"us": "Americans", "de": "Germans"}
STATS = {"squad": (3, 4), "mg": (3, 6), "leader": (2, 3)}


def terrain(x, y, state=None):
    if state is not None and state.get('battlefield'):
        return state.get('fieldworks', {}).get(f'{x},{y}', state['battlefield']['map'][y][x])
    if [x, y] == OBJECTIVE:
        return "objective"
    if (x, y) in {(2, 3), (4, 3), (2, 5), (4, 5)}:
        return "building"
    if (x, y) in {(0, 2), (1, 3), (5, 3), (6, 2), (0, 5), (1, 6), (5, 6), (6, 5)}:
        return "woods"
    return "road" if x == 3 or y == 4 else "field"


def cube(pos):
    x, y = pos
    q = x - (y - (y & 1)) // 2
    return (q, -q-y, y)


def distance(a, b):
    ax, ay = a; bx, by = b
    dq = ax - (ay - (ay & 1)) // 2 - bx + (by - (by & 1)) // 2
    dy = ay - by
    return max(abs(dq), abs(dy), abs(dq+dy))


@lru_cache(maxsize=16384)
def line_cells(a, b):
    """Immutable geometry only; blockers are checked against live state below."""
    n = distance(a, b)
    ac, bc = cube(a), cube(b)
    cells = []
    for i in range(1, n):
        # Consistent tiny nudge resolves lines exactly on hex edges.
        p = [ac[j] + (bc[j]-ac[j])*i/n + (1e-6 if j < 2 else -2e-6) for j in range(3)]
        r = [round(v) for v in p]
        k = max(range(3), key=lambda j: abs(r[j]-p[j]))
        r[k] = -sum(r[j] for j in range(3) if j != k)
        y = r[2]
        x = r[0] + (y-(y & 1))//2
        cells.append((x,y))
    return tuple(cells)


def line_clear(a, b, smoke=(), state=None, high_ground=False):
    if any(s['pos'] in (a, b) for s in smoke):
        return False
    low_obstacles = 0
    for x,y in line_cells(tuple(a),tuple(b)):
        if state and state.get('battlefield') and not (0<=y<state['battlefield']['height'] and 0<=x<state['battlefield']['width']):
            return False
        tile=terrain(x,y,state)
        coastal_block=state and state.get('naval_version') and not naval.navigable(tile) and (naval.navigable(terrain(*a,state)) or naval.navigable(terrain(*b,state)))
        if coastal_block or tile in {'tower','bunker','mountain','ridge'} or any(s['pos'] == [x, y] for s in smoke):
            return False
        if tile in {'building','woods','bocage','oasis'}:
            low_obstacles+=1
            if not high_ground or low_obstacles>1:return False
    return True


def initial(scenario='village', ruleset='classic'):
    rules = profile(ruleset)
    board = get_scenario(scenario)
    if board.get('dsl_only') and ruleset != 'dsl':
        raise ValueError(f"{board['name']} requires the DSL ruleset.")
    if board.get('naval'):
        return weapons.initialize(naval.initial(board,rules))
    if board.get('air'):
        return weapons.initialize(air.initial(board,rules))
    units = []
    for side, row in [("us", board['height']-1), ("de", 0)]:
        formation = []
        if board.get('platoons'):
            for platoon in board['platoons']:
                for number, (kind, offset) in enumerate([('squad',-2),('leader',-1),('mg',0),('squad',1),('squad',2)],1):
                    formation.append((kind, platoon['center']+offset, platoon['id'], number))
            row = board['height']-2 if side == 'us' else 1
        else:
            formation = [(kind,col+(board['width']-7)//2,None,None) for kind,col in
                         [('squad',1),('leader',2),('mg',3),('squad',4),('squad',5)]]
        for i, (kind, col, platoon, number) in enumerate(formation):
            hp, reach = STATS[kind]
            units.append(dict(id=f"{side}{i}", side=side, kind=kind, pos=[col, row], hp=hp,
                              range=reach, ap=2, pinned=False, entrenched=False,
                              overwatch=False, smoke=1 if kind == 'squad' else 0,
                              grenades=1 if kind == 'squad' else 0))
            if ruleset == 'dsl':
                units[-1].update(ap=base_ap(units[-1]), ap_received=base_ap(units[-1]), banked_ap=0, carried_ap=0, road_pending=False, road_used=False)
            if platoon:
                units[-1].update(platoon=platoon, number=number)
    if board.get('combined_arms'):
        units=combined.roster('us',board['height'])+combined.roster('de',board['height'])
    if board.get('campaign'):
        units=campaigns.setup(board)
    state = dict(ruleset=ruleset, ruleset_version=rules['version'], units=units, turn="us", round=1, hold=0, winner=None, rules_version=4, smoke=[], battlefield=board,
                support={'us': 1, 'de': 1}, barrages=[],
                battle_number=1, victories={'us': 0, 'de': 0},
                log=[f"{board['name']} · Americans move first. Hold the objective at the end of two consecutive American turns. German defense wins after round {board['rounds']}."],
                revision=0, ready=False)
    if board.get('campaign'):
        state['factions']=board['factions'].copy()
        state['log']=[f"{board['name']} · {state['factions']['us']} move first. Hold {board['objective_name']} for two consecutive turns; defenders win after round {board['rounds']}."]
    fubar.initialize(state)
    if board.get('combined_arms') or board.get('campaign'):
        state.update(dsl_expansion=1,fog_of_war=True)
        update_intel(state)
    return deployment.initialize(logistics.initialize(new_fronts.initialize(airborne.initialize(signals.initialize(linked_front.initialize(weapons.initialize(state)))))))


def fire_modifiers(state, unit, target):
    cover = buildings.cover(state, target['pos'])
    supported = any(u["side"] == unit["side"] and u["kind"] in {"leader","commander"} and active(u)
                    and distance(u["pos"], unit["pos"]) <= (2 if u['kind']=='commander' else 1) for u in state["units"])
    mods = dict(cover=int(cover), distance=int(distance(unit['pos'], target['pos']) > (5 if unit['kind'] in {'tank','at_gun'} else 3)),
                leader=-int(supported), machine_gun=-int(unit['kind'] == 'mg'),
                dug_in=int(state.get('rules_version', 1) >= 2 and target.get('entrenched', False)))
    if combined.enabled(state):
        mods.update(faction=-unit.get('accuracy_bonus',int(unit['side']=='us' and unit['kind'] not in {'tank','at_gun','at_team','amphibious'})),
                    armor=int(target.get('armor',0)>0 and not (target['kind']=='halftrack' and unit['kind'] in {'tank','at_gun'})),anti_tank=-int(unit['kind']=='at_gun' and target.get('armor',0)>0))
    return mods


def fire_threshold(state, unit, target):
    if weapons.enabled(state) and not weapons.damage(unit, target):
        return 7
    if not weapons.enabled(state) and combined.enabled(state) and not combined.can_damage(unit,target):
        return 7
    threshold = max(2, 4 + sum(fire_modifiers(state, unit, target).values()))
    return weapons.preview(unit, target, threshold)['threshold'] if weapons.enabled(state) else threshold


def watchers(state, target, pos):
    """Eligible reaction shooters at the destination, in stable unit order."""
    if state.get('rules_version', 1) < 3:
        return []
    destination = dict(target, pos=pos, entrenched=False)
    return [u for u in state['units'] if u['side'] != target['side'] and active(u)
            and u.get('overwatch') and not u['pinned']
            and distance(u['pos'], pos) <= u['range']
            and line_clear(u['pos'], pos, state.get('smoke', []), state)
            and (not fog(state) or (signals.group_sees(state,u['side'],signals.group(u),pos,signals.concealed(state,destination)) if signals.enabled(state)
                 else sees_hex(state,u['side'],pos,not target.get('armor') and not target.get('exposed_turns') and terrain(*pos,state) in fieldworks.CONCEALMENT)))
            and fire_threshold(state, u, destination)+1 <= 6]


def preview_threats(state,unit,pos,seen):
    if not signals.enabled(state):return sum(w['id'] in seen for w in watchers(state,unit,pos))
    return sum(active(u) and u['side']!=unit['side'] and u['id'] in seen and u['range']>0
               and distance(u['pos'],pos)<=u['range'] and line_clear(u['pos'],pos,state.get('smoke',[]),state)
               and weapons.damage(u,unit)>0 for u in state['units'])


def react(state, mover, roll):
    names=state.get('factions',NAMES)
    messages = []
    for shooter in watchers(state, mover, mover['pos']):
        if mover['hp'] <= 0:
            break
        shooter['overwatch'] = False
        signals.before_order(shooter,'fire')
        airborne.before_order(shooter,'fire')
        if operations.enabled(state) and shooter['kind']=='sniper':shooter['exposed_turns']=2
        die = roll()
        threshold = fire_threshold(state, shooter, mover)+1
        modifiers = dict(fire_modifiers(state, shooter, mover), reaction=1)
        impacts = []
        if weapons.enabled(state):
            result, impacts = weapons.resolve(state, shooter, mover, die, threshold)
        elif combined.enabled(state):
            result=combined.resolve_fire(state,shooter,mover,die,threshold)
        elif die >= threshold:
            mover['hp'] -= 1
            mover['pinned'] = True
            mover['overwatch'] = False
        if not combined.enabled(state) and not weapons.enabled(state):
            result = 'eliminated' if mover['hp'] <= 0 else 'hit and pinned' if die >= threshold else 'missed'
        messages.append(f"{names[shooter['side']]} {shooter['kind']} overwatch: rolled {die}, needed {threshold}+. Target {result}.")
        state['last_combat'] = dict(kind='Overwatch', roll=die, threshold=threshold, result=result,
                                    attacker=shooter['id'], target=mover['id'], impacts=impacts, revision=state['revision']+1)
        record_combat(state, modifiers)
    return messages


def options(state, unit):
    if deployment.active(state):
        return dict(moves=[],targets=[],smoke=[],barrage=[],assaults=[],grenades=[],suppress=[],inspire=[],command=[],rally=False)
    if domains.joint(state):
        if unit['kind'] in domains.AIR_UNITS:return air.options(state,unit)
        if unit['kind'] in domains.SHIPS:return naval.options(state,unit)
    if state.get('naval_version'):
        return naval.options(state,unit)
    if state.get('air_version'):
        return air.options(state,unit)
    moves, targets = [], []
    board = battlefield(state)
    extras = dict(smoke=[], dig=False, assaults=[], overwatch=False,
                  grenades=[], suppress=[], inspire=[], barrage=[], command=[], drops=[], load=[], unload=[],
                  ammo=[], repair_tracks=False, bombard=[])
    extras.update(weapons.orders(state, unit))
    extras.update(fieldworks.options(state, unit))
    extras.update(signals.options(state,unit))
    extras.update(airborne.options(state,unit))
    if state.get("logistics_version"):extras.update(logistics.options(state,unit))
    if new_fronts.enabled(state):extras.update(new_fronts.options(state,unit))
    if not state["ready"] or state["winner"] or unit["hp"] <= 0 or unit["side"] != state["turn"]:
        return dict(moves=moves, targets=targets, rally=False, **extras)
    seen=unit_visible_ids(state,unit)
    occupied = [u["pos"] for u in state["units"] if active(u) and u['id'] in seen and domains.blocks(state,unit,u)]
    if unit.get('carrier_id'):
        return dict(moves=[], targets=[], rally=False, **extras)
    extras.update(transport.options(state, unit))
    if unit.get('reserve'):
        if unit['ap']>=2 and not unit.get('arrival_round') and not unit.get('airlift_reserve'):
            extras['drops']=[[x,y] for y in range(2,board['height']-2) for x in range(board['width'])
                             if terrain(x,y,state) in {'field','road'} and [x,y] not in occupied
                             and sees_hex(state,unit['side'],[x,y])]
        return dict(moves=[],targets=[],rally=False,**extras)
    if not unit["pinned"]:
        for y in range(max(0,unit['pos'][1]-1),min(board['height'],unit['pos'][1]+2)):
            for x in range(max(0,unit['pos'][0]-1),min(board['width'],unit['pos'][0]+2)):
                tile = terrain(x, y, state)
                free_road = dsl(state) and not unit.get('no_road_bonus') and not unit.get('afloat') and unit.get('road_pending', False) and (unit['kind']=='halftrack' or not unit.get('road_used', False)) and road(terrain(*unit['pos'], state)) and road(tile)
                passable, cost = fieldworks.movement(unit, tile)
                if free_road: cost = 0
                if weapons.enabled(state) and unit.get('immobilized'): passable=False
                if not buildings.enterable(state, [x, y], unit['side']): passable=False
                if passable and distance(unit["pos"], [x, y]) == 1 and [x, y] not in occupied and unit["ap"] >= cost:
                    moves.append(dict(pos=[x, y], cost=cost, threats=preview_threats(state,unit,[x,y],seen), **({'road_bonus': True} if free_road else {})))
        if unit["ap"] >= 2:
            for target in state["units"]:
                if target["side"] != unit["side"] and active(target) and target['id'] in seen and distance(unit["pos"], target["pos"]) <= unit["range"] and line_clear(unit["pos"], target["pos"], state.get('smoke', []), state):
                    if weapons.enabled(state):
                        if not weapons.damage(unit, target): continue
                        targets.append(weapons.preview(unit, target, fire_threshold(state, unit, target), fire_modifiers(state, unit, target), state=state))
                    else:
                        if combined.enabled(state) and not combined.can_damage(unit,target): continue
                        targets.append(dict(id=target["id"], threshold=fire_threshold(state, unit, target), modifiers=fire_modifiers(state, unit, target), **(dict(damage=combined.damage(unit,target),suppression_threshold=combined.suppression_threshold(unit) if not target.get('armor') else None) if combined.enabled(state) else {})))
        if state.get('rules_version', 1) >= 2:
            extras['dig'] = unit['ap'] >= 2 and not unit.get('entrenched', False) and unit['kind'] not in combined.VEHICLES
            if unit['ap'] >= 1 and unit.get('smoke', 0):
                extras['smoke'] = [[x,y] for y in range(max(0,unit['pos'][1]-1),min(board['height'],unit['pos'][1]+2))
                                   for x in range(max(0,unit['pos'][0]-1),min(board['width'],unit['pos'][0]+2))
                                   if distance(unit['pos'],[x,y])<=1 and not any(s['pos']==[x,y] for s in state.get('smoke',[]))]
            if unit['kind'] in combined.INFANTRY-{'mg'} and unit['ap'] >= 2:
                extras['assaults'] = [dict(id=t['id'], threshold=3 if t['pinned'] else 4)
                                     for t in state['units'] if active(t) and t['side'] != unit['side'] and t['id'] in seen and not t.get('armor')
                                     and (not weapons.enabled(state) or weapons.protection(t) == 'infantry')
                                     and terrain(*t['pos'],state)!='water'
                                     and buildings.enterable(state, t['pos'], unit['side'])
                                     and distance(unit['pos'], t['pos']) == 1]
        extras['overwatch'] = state.get('rules_version', 1) >= 3 and unit['ap'] >= 2 and unit['range']>0 and not unit.get('overwatch', False)
        extras.update(role_options(state, unit, distance, line_clear, terrain, board))
    if unit.get('afloat'):
        extras={k:(v if k=='load' else [] if isinstance(v,list) else None if k=='range_guide' else False) for k,v in extras.items()}
        targets=[]
    if domains.joint(state) and unit['kind']=='flak' and not unit['pinned'] and unit['ap']>=2:
        for target in state['units']:
            if active(target) and target['side']!=unit['side'] and domains.is_air(target) and target['id'] in seen and distance(unit['pos'],target['pos'])<=unit.get('aa_radius',4):
                shot=air.shot(unit,target)
                targets.append(dict(weapons.preview(unit,target,shot['threshold'],shot['modifiers'],weapon='flak',state=state),air=True))
    return dict(moves=moves, targets=targets, rally=unit["pinned"] and unit["ap"] >= 1, **extras)


def apply(state, side, action, roll=None):
    if deployment.active(state):
        return deployment.apply(state,side,action,roll)
    if not state["ready"]:
        raise ValueError("Waiting for the second player.")
    if state["winner"]:
        raise ValueError("This match has ended.")
    if state["turn"] != side:
        raise ValueError("It is your opponent's turn.")
    if state.get('naval_version'):
        return naval.apply(state,side,action,roll)
    if state.get('air_version'):
        return air.apply(state,side,action,roll)
    names=state.get('factions',NAMES)
    state = copy.deepcopy(state)
    before_sight={team:visible_ids(state,team) for team in ('us','de')} if fog(state) else {}
    action_round = state["round"]
    board = battlefield(state)
    roll_die = roll or (lambda: secrets.randbelow(6)+1)
    kind = action.get("kind")
    message = ""
    reactions = []
    if kind == "end":
        operations.end_turn(state)
        reactions = resolve_barrages(state, names, roll_die) if state.get('rules_version', 1) >= 4 else []
        reactions.extend(airborne.end_turn(state,side))
        state['smoke'] = [dict(s, ttl=s['ttl']-1) for s in state.get('smoke', []) if s['ttl'] > 1]
        state['recon'] = [dict(r, ttl=r['ttl']-1) for r in state.get('recon', []) if r['ttl'] > 1]
        if new_fronts.enabled(state):
            new_fronts.end_turn(state,side)
        elif domains.joint(state):
            fubar.end_turn(state,side)
        elif state.get('linked_front_version'):
            linked_front.end_turn(state, side)
        elif side == "us":
            held = any(u["side"] == "us" and active(u) and u["pos"] == board['objective'] for u in state["units"])
            state["hold"] = state["hold"] + 1 if held else 0
            if state["hold"] >= 2:
                state["winner"] = "us"
        elif state["round"] >= board['rounds']:
            state["winner"] = "de"
        else:
            state["round"] += 1
        state["turn"] = "de" if side == "us" else "us"
        signals.start_turn(state,state['turn'])
        state['command_used'] = [key for key in state.get('command_used', []) if not key.startswith(state['turn']+':')]
        for u in state["units"]:
            if dsl(state) and u['side'] == side:
                u['banked_ap'] = min(max(0, u['ap']), bank_limit(u)) if u['hp'] > 0 else 0
                u['road_pending'] = False
            if u["side"] == state["turn"]:
                u.pop('landing_limited',None)
                if dsl(state):
                    u['carried_ap'] = u.get('banked_ap', 0)
                    u['ap'] = base_ap(u)+u['carried_ap']
                    u.update(ap_received=u['ap'], banked_ap=0, road_pending=False, road_used=False, transport_used=False)
                else:
                    u["ap"] = 2
                u['overwatch'] = False
                if domains.joint(state):
                    u.update(air_used=False,recon_used=False,torpedo_used=False,repair_used=False,rearm_used=False)
        if not state["winner"]: reactions.extend(linked_front.arrive(state, react, roll_die))
        message = f"{names[side]} ended their turn."
    else:
        unit = next((u for u in state["units"] if u["id"] == action.get("unit") and u["hp"] > 0 and u["side"] == side), None)
        if unit is None:
            raise ValueError("Choose one of your surviving units.")
        legal = options(state, unit)
        signals.before_order(unit,kind)
        airborne.before_order(unit,kind)
        if dsl(state) and kind != 'move':
            unit['road_pending'] = False
        if domains.joint(state) and unit['kind'] in domains.AIR_UNITS:
            message=air.unit_order(state,unit,action,legal,roll_die,before_sight)
        elif domains.joint(state) and unit['kind'] in domains.SHIPS:
            message=naval.unit_order(state,unit,action,legal,roll_die)
            if kind=='move':reactions=react(state,unit,roll_die)
        elif kind in airborne.ORDERS:
            message,reactions=airborne.action(state,unit,action,legal,roll_die,react)
        elif kind in logistics.ORDERS:
            message=logistics.action(state,unit,action,legal)
        elif kind in new_fronts.ORDERS:
            message=new_fronts.action(state,unit,action,legal)
        elif kind in signals.ORDERS:
            message=signals.action(state,unit,action,legal,roll_die)
        elif kind == 'load' and action.get('target') in legal['load']:
            troop = next(u for u in state['units'] if u['id'] == action['target'])
            airborne.before_order(troop,'load')
            troop.update(carrier_id=unit['id'], pos=list(unit['pos']), ap=troop['ap']-1,
                         entrenched=False, overwatch=False, road_pending=False, transport_used=True)
            message = f"{names[side]} {troop['kind']} boarded transport; infantry spent 1 AP."
        elif kind == 'unload' and action.get('pos') in [m['pos'] for m in legal['unload']]:
            if not buildings.enterable(state, action['pos']):
                raise ValueError('That building has collapsed. Choose another hex.')
            if any(active(u) and domains.blocks(state,unit,u) and u['pos'] == action['pos'] for u in state['units']):
                raise ValueError('That disembark hex is occupied. Choose another hex.')
            troop = transport.passengers(state, unit)[0]
            troop.pop('carrier_id', None)
            troop.update(pos=list(action['pos']), ap=troop['ap']-1, road_pending=False)
            message = f"{names[side]} {troop['kind']} disembarked; infantry spent 1 AP."
            reactions = react(state, troop, roll_die)
        elif kind in fieldworks.ORDERS:
            message = fieldworks.action(state, unit, action, legal)
        elif kind in {'load_ammo', 'repair_tracks', 'bombard', 'artillery', 'field_recon'} | operations.ORDER_KINDS:
            message = weapons.action(state, unit, action, legal, roll_die)
        elif kind in {'grenade', 'suppress', 'inspire', 'barrage', 'command'}:
            message = role_action(state, unit, action, legal, roll_die, distance, names)
        elif kind == 'drop' and action.get('pos') in legal['drops']:
            if domains.joint(state) and any(active(u) and domains.blocks(state,unit,u) and u['pos']==action['pos'] for u in state['units']):
                raise ValueError('Landing blocked by a contact. Choose another approach.')
            unit.update(pos=list(action['pos']),reserve=False,ap=unit['ap']-2)
            message=f"{names[side]} paratroopers landed at {column(unit['pos'][0])}{unit['pos'][1]+1}."
            record_effect(state,'smoke',[unit['pos']])
            reactions=react(state,unit,roll_die)
        elif kind == "move":
            move = next((m for m in legal["moves"] if m["pos"] == action.get("pos")), None)
            if not move:
                raise ValueError("That hex is not a legal move.")
            if not buildings.enterable(state, move['pos']):
                raise ValueError('That building has collapsed. Choose another route.')
            if dsl(state):
                both_road = road(terrain(*unit['pos'], state)) and road(terrain(*move['pos'], state))
                if move.get('road_bonus'):
                    unit.update(road_used=True, road_pending=False)
                else:
                    unit['road_pending'] = both_road and not unit.get('no_road_bonus') and not unit.get('afloat') and (unit['kind']=='halftrack' or not unit.get('road_used', False))
            if any(active(u) and u['id']!=unit['id'] and domains.blocks(state,unit,u) and u['pos']==move['pos'] for u in state['units']):
                raise ValueError('Movement blocked by a contact. Scout or choose another approach.')
            unit["pos"] = move["pos"]
            unit["ap"] -= move["cost"]
            unit['entrenched'] = False
            transport.follow(state, unit)
            message = f"{names[side]} {unit['kind']} moved to {column(unit['pos'][0])}{unit['pos'][1]+1}."
            reactions = react(state, unit, roll_die)
            if dsl(state) and unit['pinned']:
                unit['road_pending'] = False
            if move.get('road_bonus'):
                message += ' Road bonus: no AP spent.'
        elif kind == "fire":
            shot = next((t for t in legal["targets"] if t["id"] == action.get("target")), None)
            if not shot:
                raise ValueError("Target is blocked, out of range, or you need 2 actions.")
            target = next(u for u in state["units"] if u["id"] == shot["id"])
            die = (roll or (lambda: secrets.randbelow(6)+1))()
            unit["ap"] -= 2
            if operations.enabled(state) and unit['kind']=='sniper':unit['exposed_turns']=2
            hit = die >= shot["threshold"]
            impacts = []
            if weapons.enabled(state):
                result, impacts = weapons.resolve(state, unit, target, die, shot['threshold'],shot.get('weapon'))
                if weapons.profile(unit)['penetration']: record_effect(state, 'explosion', [target['pos']])
            elif combined.enabled(state):
                result=combined.resolve_fire(state,unit,target,die,shot['threshold'])
                if unit['kind'] in {'tank','at_gun','at_team'}: record_effect(state,'explosion',[target['pos']])
            elif hit:
                target["hp"] -= 1
                target["pinned"] = True
                target['overwatch'] = False
            if not combined.enabled(state) and not weapons.enabled(state):
                result = "eliminated" if target["hp"] <= 0 else "hit and pinned" if hit else "missed"
            message = f"{names[side]} {unit['kind']} fired: rolled {die}, needed {shot['threshold']}+. Target {result}."
            state['last_combat'] = dict(kind='Fire', roll=die, threshold=shot['threshold'], result=result,
                                        attacker=unit['id'], target=target['id'], impacts=impacts, revision=state['revision']+1)
            record_combat(state, shot['modifiers'], shot.get('effect_text'))
        elif kind == 'dig' and legal['dig']:
            unit['ap'] -= 2
            unit['entrenched'] = True
            message = f"{names[side]} {unit['kind']} dug in. Incoming fire needs +1 until this unit moves."
        elif kind == 'overwatch' and legal['overwatch']:
            unit['ap'] -= 2
            unit['overwatch'] = True
            message = f"{names[side]} {unit['kind']} is on overwatch until its next turn."
        elif kind == 'smoke' and action.get('pos') in legal['smoke']:
            unit['ap'] -= 1
            unit['smoke'] -= 1
            state.setdefault('smoke', []).append(dict(pos=action['pos'], ttl=2))
            message = f"{names[side]} {unit['kind']} threw smoke. It blocks fire until the end of the opponent's turn."
        elif kind == 'assault':
            assault = next((a for a in legal['assaults'] if a['id'] == action.get('target')), None)
            if not assault:
                raise ValueError('Assault requires an unpinned squad or leader, 2 actions, and an adjacent enemy.')
            target = next(u for u in state['units'] if u['id'] == assault['id'])
            die = (roll or (lambda: secrets.randbelow(6)+1))()
            unit['ap'] -= 2
            unit['entrenched'] = False
            if die >= assault['threshold']:
                target['hp'] -= 2
                target['pinned'] = True
                target['overwatch'] = False
                result = 'eliminated; attacker advanced' if target['hp'] <= 0 else 'hit for 2 and pinned'
                if target['hp'] <= 0:
                    unit['pos'] = list(target['pos'])
            else:
                unit['hp'] -= 1
                unit['pinned'] = True
                result = 'repulsed; attacker lost 1 and pinned' if unit['hp'] > 0 else 'repulsed; attacker eliminated'
            message = f"{names[side]} assaulted: rolled {die}, needed {assault['threshold']}+. {result}."
            state['last_combat'] = dict(kind='Assault', roll=die, threshold=assault['threshold'], result=result,
                                        attacker=unit['id'], target=target['id'], revision=state['revision']+1)
            record_combat(state, {'pinned_target': -1 if assault['threshold'] == 3 else 0},
                          'Success: 2 damage and pin; advance on elimination. Failure: attacker loses 1 strength and is pinned.')
            if target['hp'] <= 0 and unit['hp'] > 0:
                reactions = react(state, unit, roll_die)
        elif kind == "rally" and legal["rally"]:
            unit["pinned"] = False
            unit["ap"] -= 1
            message = f"{names[side]} {unit['kind']} rallied (1 action)."
        else:
            raise ValueError("Invalid action.")
    if kind == 'smoke':
        record_effect(state, 'smoke', [action['pos']])
    elif kind == 'grenade':
        target = next(u for u in state['units'] if u['id'] == action['target'])
        record_effect(state, 'explosion', [target['pos']])
    for carrier in state['units']:
        if carrier['hp']<=0 and carrier['kind']=='landing_craft':transport.bail_out(state,carrier)
    airborne.after_order(state)
    for team in ("us", "de"):
        if not any(u["hp"] > 0 and u["side"] == team for u in state["units"]):
            state["winner"] = "de" if team == "us" else "us"
    new_fronts.check_result(state)
    # Losing any required link immediately breaks consecutive occupation.
    linked_front.refresh(state)
    if not state.get('linked_front_version') and not any(u["side"] == "us" and active(u) and u["pos"] == board['objective'] for u in state["units"]):
        state["hold"] = 0
    state["log"] = state["log"] + [message] + reactions
    if state["winner"]:
        state["log"].append(f"{names[state['winner']]} win.")
        wins = state.setdefault('victories', {'us': 0, 'de': 0})
        wins[state['winner']] += 1
    state["revision"] += 1
    update_intel(state)
    record_reports(state,before_sight,action,message)
    state.setdefault('action_history', []).append(dict(
        revision=state['revision'], round=action_round, side=side,
        action=copy.deepcopy({k: action[k] for k in ('kind', 'unit', 'target', 'pos', 'ammo') if k in action})))
    return state
