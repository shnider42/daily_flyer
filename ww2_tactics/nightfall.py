"""Nightfall Beacon: scoped darkness, searchlights and transport-led airlifts."""
import copy

ID = 'nightfall_beacon'
WIDTH, HEIGHT = 30, 26


def enabled(state):
    return state.get('battlefield', {}).get('night_ops_version') == 1


def roster():
    from .air import initial
    from .campaigns import unit
    from .scenarios import get_scenario
    from .rulesets import profile
    pool = initial(get_scenario('britain'), profile('dsl'))['units']
    result = []
    def add(side, kind, pos, group, **extra):
        source = 'fighter' if kind == 'transport_aircraft' else 'radar' if kind == 'spotlight' else kind
        template = (next(u for u in pool if u['kind']==source) if source in
            {'fighter','bomber','aa_gun','radar','airfield'} else unit(side,source,pos,group,1))
        u=copy.deepcopy(template)
        n=1+sum(v['side']==side and v['platoon']==group for v in result)
        u.update(id=f'{side}-night-{group}-{n}',side=side,kind=kind,faction='gb' if side=='us' else 'de',
                 platoon=group,number=n,pos=list(pos),reserve=False,overwatch=False,
                 night_air_sight=2,night_ground_sight=2)
        u.update(extra)
        u.update(ap=u['base_ap'],ap_received=u['base_ap'],banked_ap=0,carried_ap=0,
                 road_pending=False,road_used=False)
        result.append(u)
        return u
    for group,cx in [('A',8),('B',22)]:
        for dx in (-2,2):
            add('us','fighter',[cx+dx,22],group,display_name='Mosquito night fighter',
                variant='mosquito_fighter',base_ap=4,flight=3,night_air_sight=4)
        add('us','bomber',[cx-1,23],group,display_name='Lancaster heavy bomber',variant='lancaster',
            hp=6,max_hp=6,bombs=3,max_bombs=3,base_ap=3,flight=2,range=1,
            weapon_overrides={'bomb':dict(damage=3,label='Heavy bomb load',area_fire=False)})
        add('us','bomber',[cx+1,23],group,display_name='Halifax tactical bomber',variant='halifax',
            hp=5,max_hp=5,bombs=2,max_bombs=2,base_ap=3,flight=2,range=2,
            weapon_overrides={'bomb':dict(damage=2,label='Tactical bomb load',area_fire=False)})
        add('us','bomber',[cx,21],group,display_name='Mosquito Pathfinder',variant='mosquito_pathfinder',
            hp=3,max_hp=3,bombs=2,max_bombs=2,base_ap=4,flight=3,range=1,flares=2,max_flares=2,
            weapon_overrides={'bomb':dict(damage=1,label='Light bomb load',area_fire=False)})
        plane=add('us','transport_aircraft',[cx,24],group,display_name='Dakota troop transport',
            variant='dakota',hp=5,max_hp=5,base_ap=4,flight=2,range=0,weapon='none',
            protection='aircraft',night_ground_sight=1,bombs=0,max_bombs=0)
        for _ in range(2):
            add('us','paratrooper',[cx,24],group,display_name='British airborne squad',
                reserve=True,airlift_reserve=True,drop_transport=plane['id'],base_ap=3,hp=4,max_hp=4,
                range=4,night_air_sight=1,night_ground_sight=3)
        add('us','airfield',[cx,25],group,display_name='Allied service strip',air_stores=6,
            night_air_sight=0,night_ground_sight=1)

        add('de','fighter',[cx,5],group,display_name='Messerschmitt Bf 110 night fighter',variant='bf110',
            base_ap=3,flight=3,night_air_sight=5,
            weapon_overrides={'air_gun':dict(damage=2,label='Night-fighter cannon')})
        add('de','aa_gun',[cx-2,15],group,display_name='Heavy Flak battery',variant='heavy_flak',
            range=6,aa_radius=6,night_ground_sight=1,
            weapon_overrides={'flak':dict(damage=2,label='Heavy anti-aircraft burst')})
        add('de','aa_gun',[cx+2,16],group,display_name='Light Flak battery',variant='light_flak',
            range=4,aa_radius=4,night_ground_sight=1,
            weapon_overrides={'flak':dict(damage=1,label='Light anti-aircraft burst')})
        for dx,y in [(-3,18),(3,14)]:
            add('de','spotlight',[cx+dx,y],group,display_name='Spotlight',hp=2,max_hp=2,base_ap=2,
                range=0,weapon='none',protection='installation',night_ground_sight=1,night_air_sight=1)
        add('de','radar',[cx,12],group,display_name='Western radar site' if group=='A' else 'Eastern radar site',
            hp=5,max_hp=5,mission_radar=True,night_air_sight=6,night_ground_sight=0)
        for dx,y,kind in [(-2,11,'squad'),(1,13,'squad'),(0,14,'mg')]:
            add('de',kind,[cx+dx,y],group,display_name='Signals garrison' if kind=='squad' else 'Garrison machine gun',
                night_air_sight=1,night_ground_sight=3)
        add('de','airfield',[cx,3],group,display_name='German service field',air_stores=6,
            night_air_sight=0,night_ground_sight=1)
    return result


def scenario(build):
    rows=[['.']*WIDTH for _ in range(HEIGHT)]
    for y in range(HEIGHT):
        for x in (8,15,22):rows[y][x]='='
    for y in (9,14,20):rows[y]=['=']*WIDTH
    for y in range(6,21):
        for x in range(WIDTH):
            if rows[y][x]=='.' and (x*7+y*11)%23<3:rows[y][x]='T'
    for x in range(11,19):rows[17][x]='~'
    rows[17][15]='+'
    for cx in (8,22):
        for x,y in [(cx,12),(cx-1,10),(cx+1,10),(cx,3),(cx,25)]:rows[y][x]='B'
    rows[13][15]='*'
    for x,y in [(14,12),(16,12),(14,14),(16,14)]:rows[y][x]='B'
    for group,cx in [('A',8),('B',22)]:
        for x,y in [(cx-2,15),(cx+2,16),(cx-3,18),(cx+3,14),(cx-2,11),(cx+1,13),(cx,14)]:rows[y][x]='.'
    board=build(ID,'Nightfall Beacon','Signals station',24,
        'Night bombing and airborne raid · 30×26 · RAF versus German night defense. '
        'Bomb both radar sites, then hold the signals station with an unpinned landed paratrooper '
        'for two consecutive Allied turn endings. Germans must break the raid or hold out through round 24. '
        'Short night sight, aimed spotlights, flares and actual Dakota flight paths decide the approach.',
        [''.join(row) for row in rows])
    board.update(dsl_only=True,campaign=ID,joint_ops=True,night_ops_version=1,airborne=True,
        default_control_size='platoons',playtest=True,theater='NIGHT AIRBORNE RAID · FICTIONAL 1944',
        summary='Medium / large · darkness, bombers, spotlights and Dakota paratrooper drops',
        historical_note='Fictional operation using historical aircraft roles. Hex ranges and dice are game balance values.',
        factions={'us':'Allies · RAF & British airborne','de':'Germans · Luftwaffe & signals garrison'},
        platoons=[dict(id='A',name='Western raid / defense',center=8),dict(id='B',name='Eastern raid / defense',center=22)],
        night_targets=[dict(name='Western radar site',pos=[8,12]),dict(name='Eastern radar site',pos=[22,12])],
        joint_objectives=[dict(id='signals',name='Signals station · paratroopers',pos=[15,13],domain='land',radius=0)],
        doctrine={'us':'Mosquito escorts and Pathfinders, Lancaster heavy bombers, Halifax tactical bombers, two Dakotas and four finite airborne squads. Use flares to identify targets and guide drops, but illuminated aircraft become easier targets.',
                  'de':'Two Bf 110 night fighters, four Flak batteries, four aimed Spotlights, two radar sites and a ground garrison. Searchlights extend detection and improve AA accuracy, but active emitters reveal themselves.'},
        reinforcement_brief='Dakotas must fly within 1 hex of the chosen drop aim. Drop costs 3 AP, once per Dakota per round; each carries two squads. Roll 1 loses the squad, 2 scatters 3 hexes, 3 scatters 2, 4–5 scatter 1, 6 is exact if legal. Friendly flare or beacon reduces scatter by 1. Flak coverage is 2 hexes in darkness or the listed AA radius when illuminated; an approach roll of 1–2 loses the squad. Survivors have 1 AP; rough landings cost 1 strength, water costs 2 strength at each own turn end. Service fields have six finite uses per platoon.')
    return board


def initialize(state):
    if enabled(state):
        state.update(night_hold=0,night_flares=[])
        from .nightveil import initialize as initialize_veil
        initialize_veil(state)
        state['log']=[state['battlefield']['name']+' · '+state['battlefield']['brief']]
    return state


def light_cells(state, ground=False):
    """Public illumination, computed only in a read scope and never cached in saves."""
    from .engine import distance, line_cells
    from .visibility import active, sight_cache
    key=('night_light',ground);cache=sight_cache(state)
    if cache is not None and key in cache:return cache[key]
    cells=set();board=state['battlefield']
    sources=[(f['pos'],2) for f in state.get('night_flares',[])]
    if not ground:
        for u in state['units']:
            if active(u) and u['kind']=='spotlight' and u.get('beam'):
                cells.update(line_cells(tuple(u['pos']),tuple(u['beam'])))
                cells.add(tuple(u['pos']));sources.append((u['beam'],1))
    for pos,radius in sources:
        for y in range(max(0,pos[1]-radius),min(board['height'],pos[1]+radius+1)):
            for x in range(max(0,pos[0]-radius),min(board['width'],pos[0]+radius+1)):
                if distance(pos,[x,y])<=radius:cells.add((x,y))
    if cache is not None:cache[key]=cells
    return cells


def illuminated(state,pos):
    return tuple(pos) in light_cells(state)


def flash_cells(state):
    """Public emitters, cached only within one unchanged visibility read."""
    from .visibility import active,sight_cache
    cache=sight_cache(state);key=('night_flash_cells',)
    if cache is not None and key in cache:return cache[key]
    cells={tuple(u['pos']) for u in state['units'] if active(u) and
           (u.get('night_flash') or u['kind']=='spotlight' and u.get('beam'))}
    if cache is not None:cache[key]=cells
    return cells


def unit_sees(state,unit,pos,concealed=False):
    from .engine import distance,line_clear
    from .visibility import active
    if not active(unit):return False
    flying=concealed=='air'
    if not flying and any(s['pos']==pos for s in state.get('smoke',[])):return False
    if tuple(pos) in light_cells(state,not flying):return True
    if tuple(pos) in flash_cells(state):return True
    reach=unit.get('night_air_sight',2) if flying else unit.get('night_ground_sight',2)
    if state['battlefield'].get('war_version'):
        from .weather import sight
        reach=sight(state,unit,reach)
    if not flying and concealed:reach=min(reach,1)
    gap=distance(unit['pos'],pos)
    return gap<=reach and (flying or unit['kind'] in {'fighter','bomber','transport_aircraft'} or gap<=1 or line_clear(unit['pos'],pos,state.get('smoke',[]),state))


def drop_reserves(state,plane):
    return [u for u in state['units'] if u.get('drop_transport')==plane['id'] and u.get('reserve') and u['hp']>0]


def options(state,u):
    from .engine import distance
    from .visibility import active
    result=dict(spotlight=[],flare=[])
    if not enabled(state) or not state['ready'] or state['winner'] or not active(u) or u['side']!=state['turn'] or u.get('pinned'):return result
    board=state['battlefield']
    if u['kind']=='spotlight' and u['ap']>=1:
        result['spotlight']=[[x,y] for y in range(max(0,u['pos'][1]-8),min(board['height'],u['pos'][1]+9))
            for x in range(max(0,u['pos'][0]-8),min(board['width'],u['pos'][0]+9)) if 0<distance(u['pos'],[x,y])<=8]
    if u.get('flares',0)>0 and u['ap']>=2:
        result['flare']=[[x,y] for y in range(max(0,u['pos'][1]-5),min(board['height'],u['pos'][1]+6))
            for x in range(max(0,u['pos'][0]-5),min(board['width'],u['pos'][0]+6)) if distance(u['pos'],[x,y])<=5]
    if u['kind']=='transport_aircraft':
        result['airborne_drop']=bool(u['ap']>=3 and drop_reserves(state,u) and u.get('drop_round')!=state['round'])
    return result


def action(state,u,order,legal):
    kind=order['kind'];pos=order.get('pos')
    if kind not in {'spotlight','flare'} or pos not in legal.get(kind,[]):raise ValueError('Choose a highlighted night-operation aim point.')
    if kind=='spotlight':
        u.update(ap=u['ap']-1,beam=list(pos))
        return 'Spotlight aimed: its narrow air search reaches 8 hexes. The active emitter is visible to both armies.'
    u.update(ap=u['ap']-2,flares=u['flares']-1)
    state['night_flares'].append(dict(side=u['side'],pos=list(pos),ttl=2))
    return 'Pathfinder flare: radius 2 visible to both armies through the opposing turn. Guides Allied drops, but also helps German AA.'


def modifiers(state,u,target):
    if state['battlefield'].get('war_version'):
        from .the_war import dark
        if not dark(state):return {}
    if not enabled(state) or illuminated(state,target['pos']):return {}
    return {'darkness':2 if u['kind']=='aa_gun' else 1}


def service_field(state,u):
    from .engine import distance
    from .visibility import active
    return next((v for v in state['units'] if active(v) and v['side']==u['side'] and v['kind']=='airfield'
        and v['platoon']==u['platoon'] and v.get('air_stores',0)>0 and distance(v['pos'],u['pos'])<=1),None)


def guided(state,side,pos):
    from .engine import distance
    return any(f['side']==side and distance(f['pos'],pos)<=2 for f in state.get('night_flares',[]))


def start_turn(state,side):
    if not enabled(state):return
    for u in state['units']:
        if u['side']==side:u.pop('beam',None);u.pop('night_flash',None)


def before_order(state,u,kind):
    if enabled(state) and kind=='move':u.pop('night_flash',None)


def after_order(state):
    from .visibility import active
    if not enabled(state):return
    if state['battlefield'].get('war_version'):return
    from .nightveil import record_search
    record_search(state)
    for u in state['units']:
        if u['kind']=='transport_aircraft' and not active(u):
            for troop in drop_reserves(state,u):troop.update(hp=0,ap=0,banked_ap=0)
    possible=any(u['side']=='us' and u['kind']=='paratrooper' and u['hp']>0 and
        (not u.get('reserve') or any(active(v) and v['id']==u.get('drop_transport') for v in state['units'])) for u in state['units'])
    if not possible and not state['winner']:state['winner']='de'
    report=status(state)
    if report['radars_destroyed']<2 or not report['station_held']:state['night_hold']=0


def status(state):
    from .visibility import active
    from .combined import INFANTRY
    from .engine import distance
    pos=state['battlefield']['objective']
    destroyed=sum(u.get('mission_radar',False) and u['hp']<=0 for u in state['units'])
    holder=any(u['side']=='us' and u['kind']=='paratrooper' and active(u) and not u.get('pinned') and not u.get('afloat') and u['pos']==pos for u in state['units'])
    contested=any(u['side']=='de' and u['kind'] in INFANTRY and active(u) and distance(u['pos'],pos)<=1 for u in state['units'])
    return dict(radars_destroyed=destroyed,radars_total=2,station_held=holder and not contested,
                hold=state.get('night_hold',0),required_hold=2)


def end_turn(state,side):
    report=status(state)
    if side=='us':
        state['night_hold']=state.get('night_hold',0)+1 if report['radars_destroyed']==2 and report['station_held'] else 0
        if state['night_hold']>=2:state['winner']='us'
    else:
        if state['round']>=state['battlefield']['rounds'] and not state['winner']:state['winner']='de'
        elif not state['winner']:state['round']+=1
    state['night_flares']=[dict(f,ttl=f['ttl']-1) for f in state.get('night_flares',[]) if f['ttl']>1]


def public_fields(state):
    from .visibility import active
    result=dict(night_lights=[dict(pos=list(u['pos']),aim=list(u['beam']))
        for u in state['units'] if active(u) and u['kind']=='spotlight' and u.get('beam')],
        night_flares=copy.deepcopy(state.get('night_flares',[])))
    if not state['battlefield'].get('war_version'):result['night_status']=status(state)
    return result


def choices(state,u,legal,observed,visited):
    """Only observed enemies, own cargo, and published mission geometry."""
    from .engine import distance
    from .visibility import active
    from . import fubar
    if u['kind']=='spotlight':
        enemies=[v for v in observed if v['side']!=u['side'] and v['kind'] in {'fighter','bomber','transport_aircraft'} and active(v)]
        focus=min(enemies,key=lambda v:distance(u['pos'],v['pos']))['pos'] if enemies else [u['pos'][0],min(HEIGHT-1,u['pos'][1]+6)]
        aim=min(legal['spotlight'],key=lambda p:distance(p,focus)) if legal['spotlight'] else None
        return [(12,dict(kind='spotlight',unit=u['id'],pos=aim))] if aim and not u.get('beam') else []
    result=fubar.domain_choices(state,u,legal,observed,visited)
    if u.get('flares') and legal.get('flare'):
        from . import nightveil
        goals=(nightveil.search_goals(state,observed) if nightveil.enabled(state) and u['side']=='us' else
               [p['pos'] for p in state['battlefield']['night_targets']])+[state['battlefield']['objective']]
        point=min(goals,key=lambda p:distance(u['pos'],p))
        aim=min(legal['flare'],key=lambda p:distance(p,point))
        if distance(aim,point)<=1 and not illuminated(state,point):result.append((15,dict(kind='flare',unit=u['id'],pos=aim)))
    if u['kind'] in {'bomber','transport_aircraft'}:
        result=[c for c in result if c[1]['kind']!='move']
        if u['kind']=='transport_aircraft':
            goal=state['battlefield']['objective']
            if legal.get('airborne_drop') and distance(u['pos'],goal)<=1:
                result.append((30,dict(kind='airborne_drop',unit=u['id'],pos=list(goal))))
            if not drop_reserves(state,u):return result
        else:
            targets=[v['pos'] for v in observed if v['side']!=u['side'] and v.get('mission_radar') and active(v)]
            from . import nightveil
            remaining=(nightveil.search_goals(state,observed) if nightveil.enabled(state) and u['side']=='us' else
                [p['pos'] for p in state['battlefield']['night_targets'] if not any(v.get('mission_radar') and v['hp']<=0 and v['pos']==p['pos'] for v in state['units'])])
            goal=min(targets or remaining or [state['battlefield']['objective']],key=lambda p:distance(u['pos'],p))
            if not u['bombs']:
                field=next((v for v in observed if v['side']==u['side'] and v['kind']=='airfield' and v['platoon']==u['platoon'] and v.get('air_stores',0)>0 and active(v)),None)
                if not field:return result
                goal=field['pos']
        for move in legal['moves']:
            if tuple(move['pos']) in visited.get(u['id'],set()):continue
            gap=distance(u['pos'],goal)
            result.append((2+(gap-distance(move['pos'],goal))*3-move.get('threats',0)*2-(10 if gap<=1 else 0),dict(kind='move',unit=u['id'],pos=move['pos'])))
    return result
