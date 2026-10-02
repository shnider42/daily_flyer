"""Shared DSL support, observation and precision-fire capabilities, version 1.

No map-name branches: a saved match opts in, units supply capabilities, and the
terrain supplies height. Legal previews never consult hidden occupancy.
"""
from .coordinates import column
VERSION = 1
ORDER_KINDS = {'area_fire', 'repair_tank', 'snipe'}


def enabled(state):
    return state.get('tactics_version') == VERSION


def initialize(state):
    if state.get('ruleset') != 'dsl': return state
    state['tactics_version'] = VERSION
    for unit in state['units']:
        if unit['kind'] == 'engineer': unit.setdefault('repair_kits', 3)
        if unit['kind'] == 'commander': unit.setdefault('cooldowns', {})
    return state


def cooldown(state, unit, kind):
    return max(0, unit.get('cooldowns', {}).get(kind, 0) - state['round']) if enabled(state) else 0


def start_cooldown(state, unit, kind):
    if enabled(state): unit.setdefault('cooldowns', {})[kind] = state['round'] + 2


def end_turn(state):
    if enabled(state):
        for u in state['units']:
            if u.get('exposed_turns'): u['exposed_turns'] -= 1


def tower(state, unit):
    from .engine import terrain
    from .visibility import active
    from .domains import surface
    return enabled(state) and active(unit) and surface(state,unit) and terrain(*unit['pos'], state) == 'tower'


def sight_range(state, unit, concealed=False):
    base = unit.get('sight', 9 if unit['kind'] in {'scout','pathfinder'} else max(6, unit['range']) if unit['kind'] in {'tank','at_gun'} else 6)
    if tower(state, unit):
        base = 6 if concealed else 12 if unit['kind'] in {'scout','sniper','pathfinder'} else 8
    elif concealed: base = 4 if unit['kind'] in {'scout','sniper','pathfinder'} else 2
    return base + (2 if unit.get('observing') else 0)


def snipe_range(state, unit):
    reach=unit.get('snipe_range', 0)
    return reach + (2 if reach and tower(state, unit) else 0)


def cells(state, pos, reach):
    from .engine import distance
    b = state['battlefield']
    return [[x,y] for y in range(max(0,pos[1]-reach), min(b['height'],pos[1]+reach+1))
            for x in range(max(0,pos[0]-reach), min(b['width'],pos[0]+reach+1)) if distance(pos,[x,y]) <= reach]


def range_guide(state, unit):
    from .engine import distance, line_clear
    from .visibility import active, unit_sees_hex
    if not enabled(state) or not active(unit) or unit['kind'] not in {'scout','sniper','pathfinder'}: return None
    reach = sight_range(state, unit); aimed = snipe_range(state, unit)
    points = cells(state, unit['pos'], max(reach, aimed))
    return dict(tower=tower(state,unit), sight_range=reach, fire_range=unit['range'], snipe_range=aimed,
        sight=[p for p in points if unit_sees_hex(state,unit,p)],
        fire=[p for p in points if p!=unit['pos'] and distance(unit['pos'],p)<=unit['range'] and line_clear(unit['pos'],p,state.get('smoke',[]),state)],
        snipe=[p for p in points if aimed and p!=unit['pos'] and distance(unit['pos'],p)<=aimed and line_clear(unit['pos'],p,state.get('smoke',[]),state)])


def aim_hexes(state, unit):
    from .engine import distance, line_clear
    from . import weapons, domains
    p = weapons.profile(unit)
    if not p.get('area_fire') or (p['id']=='bomb' and not unit.get('bombs')): return []
    normal = min(unit['range'], sight_range(state,unit))
    # Bombers already fly over terrain: use their current short bombing range,
    # with no speculative extra hex that would evade AA by doubling bomb reach.
    reach = normal + (0 if p['id']=='bomb' else 1)
    return [dict(pos=pos, threshold=6 if distance(unit['pos'],pos)>normal else 5,
                 fringe=distance(unit['pos'],pos)>normal)
            for pos in cells(state,unit['pos'],reach)
            if (pos != unit['pos'] or domains.joint(state) and p['id']=='bomb') and (p['id']=='bomb' or line_clear(unit['pos'],pos,state.get('smoke',[]),state))]


def snipe_preview(state, unit, target):
    from . import buildings
    mods = dict(precision=-1, cover=buildings.cover(state,target['pos']), dug_in=int(target.get('entrenched',False)))
    return dict(id=target['id'], threshold=4+sum(mods.values()), modifiers=mods, damage=1,
                effect_text='1 damage + pin; costs 3 AP; firing exposes the team through the enemy turn')


def orders(state, unit):
    from .engine import distance, line_clear
    from .visibility import active, unit_visible_ids
    from . import weapons
    result = dict(area_fire=[], area_fire_details=[], repair_tank=[], snipe=[], range_guide=range_guide(state,unit))
    if not enabled(state) or not state['ready'] or state.get('winner') or not active(unit) or unit['side']!=state['turn'] or unit.get('pinned'):
        return result
    if unit['ap']>=2:
        result['area_fire_details'] = aim_hexes(state,unit)
        result['area_fire'] = [m['pos'] for m in result['area_fire_details']]
        if unit.get('repair_kits'):
            result['repair_tank'] = [u['id'] for u in state['units'] if active(u) and u['side']==unit['side']
                and u['kind']=='tank' and distance(unit['pos'],u['pos'])==1 and u.get('repair_round')!=state['round']
                and (u['hp']<u.get('max_hp',u['hp']) or u.get('immobilized'))]
    if unit.get('snipe_range') and unit['ap']>=3:
        seen = unit_visible_ids(state,unit)
        result['snipe'] = [snipe_preview(state,unit,u) for u in state['units'] if active(u) and u['side']!=unit['side']
            and u['id'] in seen and weapons.protection(u)=='infantry' and not u.get('armor')
            and distance(unit['pos'],u['pos'])<=snipe_range(state,unit)
            and line_clear(unit['pos'],u['pos'],state.get('smoke',[]),state)]
    return result


def target_threshold(state, unit, target):
    """Area fire never bypasses a unit's normal cover/armor hit threshold."""
    from .engine import fire_threshold, distance
    from . import weapons, buildings, domains
    if state.get('air_version') or domains.joint(state) and unit['kind']=='bomber': return 3
    if state.get('naval_version') or domains.joint(state) and unit['kind'] in domains.SHIPS:
        base=4+int(distance(unit['pos'],target['pos'])>5)+int(target['kind']=='destroyer')+buildings.cover(state,target['pos'],objective=False)
        return weapons.preview(unit,target,base)['threshold']
    return fire_threshold(state,unit,target)


def action(state, unit, order, legal, roll):
    from . import weapons, buildings
    from .visibility import active
    from .combat_display import record_combat
    from .effects import record_effect
    kind = order['kind']
    if kind=='repair_tank' and order.get('target') in legal['repair_tank']:
        target=next(u for u in state['units'] if u['id']==order['target'])
        amount=min(1,target.get('max_hp',target['hp'])-target['hp'])
        target.update(hp=target['hp']+amount, immobilized=False, repair_round=state['round'], overwatch=False, road_pending=False)
        unit.update(ap=unit['ap']-2, repair_kits=unit['repair_kits']-1, overwatch=False, road_pending=False)
        result=f'Restored {amount} tank strength; tracks operational'
        state['last_combat']=dict(kind='Engineer repair',attacker=unit['id'],target=target['id'],result=result,revision=state['revision']+1)
        record_combat(state,note='2 engineer AP and one kit. Adjacent friendly tank only; once per tank per turn. Cannot exceed starting strength or recover a destroyed tank.')
        return result+'.'
    if kind=='snipe':
        shot=next((s for s in legal['snipe'] if s['id']==order.get('target')),None)
        if shot:
            target=next(u for u in state['units'] if u['id']==shot['id']);die=roll()
            unit.update(ap=unit['ap']-3,exposed_turns=2,overwatch=False,road_pending=False)
            result,impacts=weapons.resolve(state,unit,target,die,shot['threshold'],'sniper_round')
            state['last_combat']=dict(kind='Aimed sniper shot',attacker=unit['id'],target=target['id'],roll=die,
                threshold=shot['threshold'],result=result,impacts=impacts,revision=state['revision']+1)
            record_combat(state,shot['modifiers'],shot['effect_text'])
            return f"Sniper rolled {die}, needed {shot['threshold']}+. Target {result}. Team exposed through the enemy turn."
    if kind=='area_fire':
        shot=next((s for s in legal['area_fire_details'] if s['pos']==order.get('pos')),None)
        if shot:
            pos=list(shot['pos']);die=roll();p=weapons.profile(unit);impacts=[]
            unit.update(ap=unit['ap']-2,overwatch=False,road_pending=False)
            if p['id']=='bomb':unit['bombs']-=1
            if die>=shot['threshold']:
                primary=next((u for u in state['units'] if active(u) and u['pos']==pos and weapons.protection(u)!='aircraft'),None)
                needed=max(shot['threshold'],target_threshold(state,unit,primary)) if primary else 7
                if p.get('structural'):impacts+=buildings.hit(state,pos)
                if primary and active(primary) and die>=needed and weapons.damage(unit,primary):
                    amount=weapons.damage(unit,primary)
                    if p.get('critical_infantry') and die==6 and weapons.protection(primary)=='infantry':amount=primary['hp']
                    result=weapons.impact(state,primary,amount,immobilize=p.get('penetrating') and die>=5)
                    impacts.append(weapons.impact_record(primary,result))
                if p.get('splash'):impacts+=weapons.splash(state,pos,exclude=primary['id'] if primary else None)
            result='Round landed on the aimed hex; unobserved effects unknown' if die>=shot['threshold'] else 'Area fire missed; no damage'
            state['last_combat']=dict(kind='Area fire',attacker=unit['id'],aim=pos,roll=die,threshold=shot['threshold'],
                result=result,impacts=impacts,revision=state['revision']+1)
            record_combat(state,note='2 AP. 5+ lands; speculative fringe needs 6. Direct unit cover/armor thresholds still apply. Heavy rounds damage the aimed structure. Friendly fire and loaded-ammunition effects apply; hidden results stay unknown.')
            record_effect(state,'explosion',[pos])
            return f"Area fire at {column(pos[0])}{pos[1]+1}: rolled {die}, needed {shot['threshold']}+. {result}."
    raise ValueError('That support or precision order is unavailable. Check AP, range, supplies and cooldown.')


def ai_orders(state, unit, legal, observed):
    from .engine import distance
    from .visibility import active
    from . import buildings, weapons
    if not enabled(state):return []
    choices=[];seen=list(observed);side=unit['side']
    def add(score,kind,**data):choices.append((score,dict(kind=kind,unit=unit['id'],**data)))
    for uid in legal.get('repair_tank',[]):
        tank=next(u for u in seen if u['id']==uid)
        add(10+3*bool(tank.get('immobilized')),'repair_tank',target=uid)
    for shot in legal.get('snipe',[]):
        add(5+(7-shot['threshold'])/6*8,'snipe',target=shot['id'])
    points={tuple(m['pos']):m for m in legal.get('area_fire_details',[])}
    contacts=[c for c in state.get('intel',{}).get(side,{}).values() if c['id'] not in {u['id'] for u in seen}]
    candidates=[u for u in seen if active(u) and u['side']!=side]+contacts
    for target in candidates:
        pos=target['pos'];shot=points.get(tuple(pos))
        if not shot:continue
        risk=sum(8 for u in seen if active(u) and u['side']==side and distance(pos,u['pos'])<=(1 if weapons.profile(unit).get('splash') else 0))
        collapse=buildings.condition(state,pos,side)=='damaged'
        if collapse or target in contacts:add(4+3*collapse-risk-int(shot['fringe']),'area_fire',pos=list(pos))
    return choices
