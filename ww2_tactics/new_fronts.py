"""Three authored playtests: armored control, a small ground lab, and evacuation.

Map geometry and equipment values are game design, not historical reconstruction.
No new rules are injected into an already saved battlefield.
"""
import copy
from .theaters import soldier

IDS = ('kharkov', 'relay_crossing', 'dunkirk')
VERSION = 1
ORDERS = {'evacuate'}


def support(side, kind, pos, group, number, faction, **extra):
    if kind == 'supply':
        extra = dict(hp=2, max_hp=2, range=0, weapon='none', base_ap=2,
                     smoke=1, grenades=0, supply_packs=3, display_name='Supply squad', **extra)
    return soldier(side, kind, pos, group, number, faction, **extra)


def roster(name):
    result = []
    counts = {}

    def add(side, kind, x, y, group, faction, **extra):
        key = side, group
        counts[key] = counts.get(key, 0) + 1
        u = support(side, kind, [x, y], group, counts[key], faction, **extra)
        result.append(u)
        return u

    if name == 'kharkov':
        for side in ('us', 'de'):
            y, dy, faction = (16, 1, 'su') if side == 'us' else (3, -1, 'de')
            for group, x in [('A', 3), ('B', 16)]:
                for i, kind in enumerate(('tank', 'tank', 'squad', 'leader', 'scout', 'engineer')):
                    extra = {}
                    if kind == 'tank':
                        extra.update(display_name='T-34/76' if side == 'us' else ('Panzer III' if i == 0 else 'Panzer IV'),
                                     base_ap=3 if side == 'us' else 2, range=6 if side == 'us' else 8)
                    add(side, kind, x+i%3, y+(i//3)*dy, group, faction, **extra)
            for i, kind in enumerate(('tank', 'at_gun', 'mortar', 'radioman', 'supply', 'commander')):
                extra = {}
                if kind == 'tank':
                    extra.update(display_name='KV-1 heavy tank' if side == 'us' else 'Tiger I',
                                 variant='kv1' if side == 'us' else 'tiger', hp=6, max_hp=6,
                                 armor=3, move_ap=2, range=6 if side == 'us' else 9,
                                 weapon_overrides={'ap': {'damage': 2 if side == 'us' else 3}})
                add(side, kind, 9+i%3, y+(i//3)*dy, 'HQ', faction, **extra)
            add(side, 'tank', 0 if side == 'us' else 23, 13 if side == 'us' else 6, 'R', faction,
                display_name='Flank reserve T-34' if side == 'us' else 'Flank reserve Panzer III',
                reserve=True, arrival_round=4, base_ap=3, range=6, hp=4, max_hp=4)
    elif name == 'relay_crossing':
        for side in ('us', 'de'):
            y, dy = (9, 1) if side == 'us' else (1, -1)
            for i, kind in enumerate(('leader', 'squad', 'scout', 'engineer', 'squad', 'tank', 'at_team')):
                add(side, kind, 1+i, y, 'A', side,
                    **(dict(base_ap=3 if side=='us' else 2, range=5 if side=='us' else 6) if kind=='tank' else {}))
            for i, kind in enumerate(('commander', 'radioman', 'mortar', 'supply')):
                add(side, kind, 2+i, y+dy, 'HQ', side, **(dict(artillery_charges=1, field_recon_charges=1) if kind=='commander' else {}))
    elif name == 'dunkirk':
        for i, (kind,x,y) in enumerate((('squad',3,7),('squad',8,7),('squad',12,7),('squad',15,8),
                ('leader',4,9),('engineer',9,9),('radioman',13,9),('commander',7,10))):
            add('us',kind,x,y,'A' if x<9 else 'B','gb',evacuee=True,
                **(dict(artillery_range=0,artillery_charges=0,field_recon_range=0,field_recon_charges=0) if kind=='commander' else {}))
        for kind,x,y in [('mg',5,12),('at_gun',12,12),('mortar',9,11),('supply',10,11)]:
            add('us',kind,x,y,'REAR','fr', **(dict(display_name='French 25 mm AT gun',range=8) if kind=='at_gun' else {}))
        add('us','tank',8,12,'REAR','gb',display_name='Matilda rearguard',variant='matilda',
            hp=6,max_hp=6,armor=3,base_ap=2,move_ap=2,range=5,ammo_options=['ap'])
        for x in (3,9,15):
            add('us','landing_craft',x,3,'SEA','gb',display_name='Evacuation boat',
                hp=4,max_hp=4,range=0,base_ap=3,armor=0,weapon='none',smoke=1,grenades=0,personnel=3)
        for i,kind in enumerate(('tank','squad','leader','mg','scout','squad','engineer','squad',
                                 'tank','squad','mg','commander','radioman','mortar','supply')):
            x=2+(i%5)*3; y=16+i//5
            extra={}
            if kind=='tank':extra.update(display_name='Panzer III',range=7,hp=4,max_hp=4)
            if kind=='commander':extra.update(artillery_charges=1,field_recon_range=0,field_recon_charges=0)
            add('de',kind,x,y,'A' if x<9 else 'B','de',**extra)
    else:
        raise ValueError('Unknown new-front roster')
    return result


def scenarios(build):
    result = {}
    g=[['.' for _ in range(24)] for _ in range(20)]
    for y in range(5,15):
        for x in range(24):
            if 9<=x<=14 and (x+y)%3:g[y][x]='B'
            elif (x*7+y*3)%19<2:g[y][x]='T'
            elif x in (1,2,21,22) and 8<=y<=12:g[y][x]='m'
    for x in (4,11,18):
        for y in range(20):g[y][x]='='
    for y in (5,9,10,14):
        for x in range(24):g[y][x]='='
    for x,y in ((6,7),(17,12)):g[y][x]='^'
    g[10][11]='*'
    b=build('kharkov','Kharkov · Steel Counterstroke','Rail junction',18,
        'Armored meeting engagement. Tanks can capture three flags. Fast T-34 groups face long German gun lanes and a Tiger. Flank tanks arrive in round 4. Keep engineers and finite supplies behind the armor.', [''.join(r) for r in g])
    b.update(campaign='kharkov',theater='KHARKOV · 1943-INSPIRED',factions={'us':'Soviets','de':'Germans'},
        summary='Tank-led flags · heavy armor · counterstroke reserves',front_mode='armored_control',score_target=10,
        control_points=[dict(id='fuel',name='Fuel yard',pos=[4,9],points=1),dict(id='rail',name='Rail junction',pos=[11,10],points=2),dict(id='works',name='Repair works',pos=[18,10],points=1)],
        platoons=[dict(id='A',name='West armor',center=4),dict(id='B',name='East armor',center=18),dict(id='HQ',name='Heavy & support',center=11),dict(id='R',name='Flank reserve · R4',center=0)],
        doctrine={'us':'Four fast T-34s plus a slower KV-1. Use both flanks; avoid trading at German gun range.','de':'Four medium Panzers and one slow Tiger. Win open lanes, but protect the flanks.'},
        reinforcement_brief='Each army gets one fast flank tank from round 4. A blocked entry waits. Entry sectors are public; reserve position and timing are part of the mission.',
        sectors=[dict(name='West reserve entry · R4',pos=[0,13]),dict(name='East reserve entry · R4',pos=[23,6])],
        historical_sources=[dict(title='Battles of Kharkov · historical background',url='https://www.hoover.org/research/battles-kharkov')])
    result[b['id']]=b
    rows=['....=....','....=....','.T..=..T.','..B.=.B..','.^..*....','~~+~~~+~~','..B.=.B..','.T..=h.T.','=========','....=....','....=....']
    b=build('relay_crossing','Relay Crossing','Village relay square',12,
        'The ground game in a 9×11 laboratory: one fighting platoon and HQ per army, a tank, scouts, radio, mortars, engineers and supply. Two bridges and a tower reward smoke, observation and coordinated crossings.',rows)
    b.update(campaign='relay_crossing',theater='FICTIONAL TRAINING FRONT',factions={'us':'Americans','de':'Germans'},
        summary='Small battlefield · big-map ground mechanics',
        platoons=[dict(id='A',name='Fighting platoon',center=4),dict(id='HQ',name='HQ & supplies',center=4)],
        doctrine={'us':'A quicker tank supports a compact infantry platoon. Scout first, then share sightings with HQ.','de':'A longer-ranged tank covers approaches. Keep the mortar supplied and use both bridges.'},
        sectors=[dict(name='West bridge',pos=[2,5]),dict(name='East bridge',pos=[6,5]),dict(name='Observation tower',pos=[1,4])])
    result[b['id']]=b
    g=[['.' for _ in range(18)] for _ in range(20)]
    for y in range(4):g[y]=['~']*18
    g[4]=['s']*18
    for y in range(6,14):
        for x in range(18):
            if 5<=x<=12 and (x+y)%3!=0:g[y][x]='B'
            elif (x*5+y*3)%17<3:g[y][x]='T'
    for y in range(5,20):
        for x in (3,9,15):g[y][x]='='
    for y in (6,10,14):g[y]=['=']*18
    for y in (1,2,3):g[y][14]='+'
    g[4][14]='*'
    b=build('dunkirk','Dunkirk · The Last Boat','East mole',14,
        'Evacuate six of eight marked infantry units by boat before round 14 ends. Select a boat, load adjacent troops, sail to the top sea edge and Evacuate. French rearguards buy time; German armor and mortars close the perimeter.', [''.join(r) for r in g])
    b.update(campaign='dunkirk',theater='DUNKIRK · 1940-INSPIRED',factions={'us':'British & French','de':'Germans'},
        summary='Hold the perimeter · ferry troops to safety',front_mode='evacuation',evacuation_target=6,evacuation_total=8,
        evacuation_exits=[[x,0] for x in range(18)],embarkation_points=[[3,4],[9,4],[15,4],[14,1]],
        platoons=[dict(id='A',name='West evacuation',center=3),dict(id='B',name='East evacuation',center=15),dict(id='REAR',name='Rearguard',center=9),dict(id='SEA',name='Rescue boats',center=9)],
        doctrine={'us':'Extract six marked units, not every unit. Rearguards and a slow Matilda buy time. Empty boats can return; no infinite replacement fleet.','de':'Break the routes to the beach. Mortars pressure queues; tanks cannot enter the dense town blocks. Stop six escapes by the deadline.'},
        sectors=[dict(name='West beach',pos=[3,4]),dict(name='Central beach',pos=[9,4]),dict(name='East mole',pos=[14,1]),dict(name='Evacuation edge',pos=[9,0])],
        historical_sources=[dict(title='English Heritage · Dunkirk and the fall of France',url='https://www.english-heritage.org.uk/visit/places/dover-castle/history-and-stories/fall-of-france/')])
    result[b['id']]=b
    for b in result.values():
        b.update(dsl_only=True,signals=True,logistics=True,playtest=True,
            historical_note='Fictional compressed playtest inspired by its setting, not a historical reconstruction. Unit counts, ranges, timers and resupply are game-balance assumptions.')
        for u in roster(b['id']):
            x,y=u['pos']
            if u['kind']=='landing_craft':b['map'][y][x]='water'
            elif b['map'][y][x] not in {'road','bridge','objective'}:b['map'][y][x]='field'
    return result


def enabled(state):
    return state.get('front_version') == VERSION


def initialize(state):
    mode=state['battlefield'].get('front_mode')
    if mode:
        state.update(front_version=VERSION,front_mode=mode)
        if mode=='armored_control':
            state['front_score']={'us':0,'de':0}
            state['log']=['Capture flags with infantry or armor. Score 1 / 2 / 1 at your turn end. First to 10; higher score at the round limit, Germans win an exact tie.']
        else:
            state.update(evacuated_count=0,evacuated_manifest=[])
            state['log']=['Rescue six marked infantry units. Load a boat, sail to the top sea edge, then Evacuate for 1 boat AP. Boats can return. The deadline is the end of round 14.']
    return state


def controls(state):
    from .visibility import active
    return [dict(p,owner=next((u['side'] for u in state['units'] if active(u)
            and (u['kind']=='tank' or u['kind'] in {'squad','leader','engineer','scout','commander','mg','at_team'})
            and u['pos']==p['pos']),None)) for p in state['battlefield'].get('control_points',[])]


def public_fields(state, side):
    if not enabled(state):return {}
    if state['front_mode']=='armored_control':return dict(front_control=controls(state), front_score=copy.deepcopy(state['front_score']))
    # Only the total is public mission intelligence. Enemy names and strengths
    # on evacuated manifests are not revealed by the mission score.
    return dict(evacuated_count=state['evacuated_count'], evacuated_manifest=copy.deepcopy(state.get('evacuated_manifest',[])) if side=='us' else [])


def options(state, u):
    from .transport import passengers
    from .visibility import active
    return dict(evacuate=bool(enabled(state) and state['front_mode']=='evacuation'
        and state['ready'] and not state['winner'] and state['turn']==u['side']=='us'
        and u['kind']=='landing_craft' and active(u) and not u['pinned'] and u['ap']>=1
        and u['pos'] in state['battlefield']['evacuation_exits']
        and any(t.get('evacuee') for t in passengers(state,u))))


def action(state,u,order,legal):
    from .transport import passengers
    if not legal.get('evacuate'):
        raise ValueError('Evacuate needs a boat at the top sea edge, 1 boat AP and a marked infantry passenger.')
    troop=next(t for t in passengers(state,u) if t.get('evacuee'))
    state['evacuated_manifest'].append({k:copy.deepcopy(troop[k]) for k in ('id','kind','hp','personnel')})
    state['units'].remove(troop)
    state['evacuated_count']+=1
    u.update(ap=u['ap']-1,overwatch=False,road_pending=False)
    return f"One infantry unit evacuated safely. {state['evacuated_count']}/{state['battlefield']['evacuation_target']} rescued. The empty boat can return."


def check_result(state):
    if not enabled(state) or state['front_mode']!='evacuation':return
    target=state['battlefield']['evacuation_target'];saved=state['evacuated_count']
    if saved>=target:state['winner']='us'
    elif saved+sum(u['hp']>0 and u.get('evacuee',False) for u in state['units'])<target:
        state['winner']='de'
    elif not any(u['side']=='us' and u['kind']=='landing_craft' and u['hp']>0 for u in state['units']):
        state['winner']='de'


def end_turn(state, side):
    if state['front_mode']=='armored_control':
        state['front_score'][side]+=sum(p['points'] for p in controls(state) if p['owner']==side)
        if state['front_score'][side]>=state['battlefield']['score_target']:state['winner']=side
    else:check_result(state)
    if side=='de':
        if not state['winner'] and state['round']>=state['battlefield']['rounds']:
            state['winner']=('us' if state['front_score']['us']>state['front_score']['de'] else 'de') if state['front_mode']=='armored_control' else 'de'
        elif not state['winner']:state['round']+=1


def goal(state, unit, default):
    from .engine import distance
    if not enabled(state):return default
    if state['front_mode']=='armored_control':
        points=controls(state)
        own=next((p for p in points if p['pos']==unit['pos'] and p['owner']==unit['side']),None)
        if own:return own['pos']
        open_points=[p for p in points if p['owner']!=unit['side']]
        return min(open_points or points,key=lambda p:distance(unit['pos'],p['pos']))['pos']
    if unit['side']=='us' and unit.get('evacuee'):
        # Only own positions and published embarkation points determine routes.
        points=[p for p in state['battlefield']['embarkation_points'] if not any(
            t['side']=='us' and t['id']!=unit['id'] and t['hp']>0 and not t.get('carrier_id') and t['pos']==p for t in state['units'])]
        return min(points or state['battlefield']['embarkation_points'],key=lambda p:distance(unit['pos'],p))
    return [9,10] if unit['side']=='us' else [9,4]


def boat_choices(state, boat, legal):
    """Evacuation AI follows public coastal geometry and its own passengers."""
    from .engine import distance
    from .transport import passengers
    result=[]
    def add(score,kind,**extra):result.append((score,dict(kind=kind,unit=boat['id'],**extra)))
    if legal.get('evacuate'):add(100,'evacuate')
    for uid in legal.get('load',[]):
        t=next(u for u in state['units'] if u['id']==uid)
        if t.get('evacuee'):add(70,'load',target=uid)
    from collections import deque
    from .fieldworks import map_for
    board=state['battlefield'];known=map_for(state,boat['side'])
    blocked={tuple(u['pos']) for u in state['units'] if u['side']==boat['side'] and u['id']!=boat['id'] and u['hp']>0 and not u.get('carrier_id') and not u.get('reserve')}
    aboard=passengers(state,boat)
    if aboard:
        targets=board['evacuation_exits']
    else:
        waiting=[u for u in state['units'] if u['side']=='us' and u['hp']>0 and u.get('evacuee') and not u.get('carrier_id')]
        if not waiting:return result
        troop=min(waiting,key=lambda u:distance(boat['pos'],u['pos']))
        points=[[3,3],[9,3],[15,3],[13,1],[15,1]]
        available=[p for p in points if tuple(p) not in blocked]
        targets=[min(available or points,key=lambda p:distance(p,troop['pos'])+distance(p,boat['pos'])*.2)]
    # Coastal structures can defeat greedy distance (the mole blocks a diagonal).
    # Route using known water and own occupancy, never a hidden enemy position.
    costs={tuple(p):0 for p in targets if tuple(p) not in blocked};queue=deque(costs)
    from .fieldworks import neighbors
    while queue:
        pos=queue.popleft()
        for nxt in neighbors(state,pos):
            key=tuple(nxt)
            if key not in costs and key not in blocked and known[nxt[1]][nxt[0]]=='water':
                costs[key]=costs[pos]+1;queue.append(key)
    for m in legal['moves']:
        gain=costs.get(tuple(boat['pos']),1000)-costs.get(tuple(m['pos']),1000)
        if gain>0:add(12+gain*3-m.get('threats',0)*2,'move',pos=m['pos'])
    return result
