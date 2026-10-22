"""The War 1.0: saved, opt-in integration of the Current DSL systems.

Coalition equipment is deliberately fictional. Mission-specific instant wins
are replaced by one score; the underlying orders retain their normal costs.
"""
import copy
import secrets

ID = 'the_war_1'
VERSION = 1
WIDTH, HEIGHT = 80, 48
GROUPS = (
    ('A', 'Coral coast · marines & landing craft', 20),
    ('B', 'Stonehaven · rifles & fire support', 45),
    ('C', 'Desert corridor · armored spearhead', 32),
    ('D', 'High passes · mountain detachment', 60),
    ('E', 'Task force · fleet & carrier air group', 7),
    ('F', 'Air bridge · airborne & pathfinders', 70),
    ('G', 'Strike command · fighters, bombers & radar', 76),
)


def enabled(state):
    return state.get('battlefield', {}).get('war_version') == VERSION


def dark(state, round_number=None):
    return ((round_number or state['round']) - 1) % 6 >= 4


def scenario(build):
    rows = [['~' if x < 18 else 's' if x < 21 else '.' for x in range(WIDTH)] for _ in range(HEIGHT)]
    for y in range(HEIGHT):
        for x in range(21, WIDTH):
            if 25 <= x <= 37:
                rows[y][x] = 'n' if (x*3+y*7) % 17 < 3 else 'd'
                if y in (20, 27) and 27 <= x <= 35: rows[y][x] = 'w'
                if (x,y) in {(29,19),(30,19),(29,28),(30,28)}: rows[y][x] = 'o'
            elif 54 <= x <= 65:
                rows[y][x] = 'r' if (x+y) % 4 == 0 else 'M'
            elif 39 <= x <= 51 and 17 <= y <= 30:
                rows[y][x] = 'B' if (x+y) % 3 else '.'
            elif (x*7+y*11) % 23 < 4:
                rows[y][x] = 'T'
            if x in (22,23) and 20 <= y <= 27: rows[y][x] = 'm'
            if x in (38,52) and 16 <= y <= 31 and y % 4: rows[y][x] = 'h'
    for y in range(HEIGHT):
        for x in (20,32,45,60,73): rows[y][x] = '='
    for y in (13,20,27,34):
        for x in range(18,WIDTH): rows[y][x] = '='
    # A one-hex river permits engineer-built alternate crossings.
    for x in range(18,WIDTH): rows[24][x] = '~'
    for x in (20,32,45,60,73): rows[24][x] = 'c' if x == 20 else '+'
    for cx,cy in ((14,23),(13,10),(13,37)):
        for y in range(cy-2,cy+3):
            for x in range(cx-2,cx+3):
                if abs(x-cx)+abs(y-cy)<=3: rows[y][x]='s'
        rows[cy][cx]='B'
    for x,y in ((41,21),(49,26),(57,21),(63,26)): rows[y][x]='^'
    for x,y in ((43,22),(47,25)): rows[y][x]='C'
    for x,y in ((21,21),(21,26),(57,22),(63,25)): rows[y][x]='k'
    for x,y in ((28,21),(29,21),(34,26),(35,26)): rows[y][x]='w'
    for x,y in ((58,20),(63,23),(58,27)): rows[y][x]='r'
    # Assembly areas keep every authored start legal and roads connected.
    for y in list(range(13,18))+list(range(30,35)):
        for x in range(18,WIDTH):
            if rows[y][x] not in {'=','s'}: rows[y][x]='.'
    rows[23][45]='*'
    board=build(ID,'The War 1.0','Eight-front coalition campaign',48,
        'Massive · 80×48 · seven command groups per coalition, plus army HQ. '
        'Arrange the starting force privately, then fight across sea lanes, coral islands, '
        'a landing coast, desert, city, river and mountain passes. First to 70 campaign '
        'points wins; after round 48 the higher score wins (Axis wins a tie). '
        'Hold zones at your own turn end: the city earns 2, other zones 1. '
        'Holding the city and mountain crossing together adds 1. Ships capture sea lanes; '
        'infantry capture land flags, with armor also able to take the desert flag. '
        'Destroying each enemy airfield earns 3 once; evacuating each marked shore team earns 2. '
        'Four daylight rounds alternate with two night rounds. Weather is forecast two rounds ahead.',
        [''.join(r) for r in rows])
    board['map'][22][46]='rubble';board['map'][26][44]='rubble'
    board.update(dsl_only=True,campaign=ID,war_version=VERSION,joint_ops=True,
        signals=True,airborne=True,logistics=True,fire_control=True,ground_roles_version=1,
        small_fronts_version=1,carrier_decks_version=1,field_ops_version=1,
        night_ops_version=1,forecast_weather=True,sight_index_version=1,prebattle=True,
        joint_score_target=70,playtest=True,default_control_size='platoons',
        air_support=dict(version=1,airfield_stores=8,ship_aa_range=1),
        theater='THE WAR · FICTIONAL COALITION CAMPAIGN',
        summary='80×48 · seven fronts · all 34 unit classes · day/night, weather & finite logistics',
        historical_note='An intentionally fictional combined-theater campaign using existing '
            'WWII-inspired equipment profiles. Coalition assignments, captured armor, force sizes, '
            'day/night timing and geography are gameplay abstractions.',
        factions={'us':'Allied coalition','de':'Axis coalition'},
        platoons=[dict(id=k,name=name,center=x) for k,name,x in GROUPS],
        deployment_rules=dict(shore=18,bunkers=2,missions=2,defense_rows=[13,17],
                              landing_rows=[30,34],fire_rows=[19,27]),
        joint_objectives=[dict(id=k,name=n,pos=p,domain=d,radius=int(d=='sea'),weight=w,
                               **({'armor_capture':True} if k=='desert' else {}))
            for k,n,p,d,w in (
                ('ocean','Western sea lane',[5,23],'sea',1),
                ('strait','Coral strait',[9,24],'sea',1),
                ('island','Coral outpost',[14,23],'land',1),
                ('harbor','Harbor causeway',[20,24],'land',1),
                ('desert','Desert fuel road',[32,23],'land',1),
                ('city','Stonehaven command square',[45,23],'land',2),
                ('pass','High-pass crossing',[60,24],'land',1),
                ('depot','Eastern air depot',[73,23],'land',1))],
        sectors=[dict(name=n,pos=[x,23]) for n,x in (
            ('Task force',7),('Coral coast',20),('Desert corridor',32),
            ('Stonehaven',45),('High passes',60),('Air bridge',73))],
        aid_posts=[dict(side='us',pos=[43,30],name='Allied dressing station'),
                   dict(side='de',pos=[47,17],name='Axis field hospital')],
        cave_entrances=[dict(id=k,pos=p,name=n) for k,p,n in (
            ('north',[58,20],'North gallery'),('crest',[63,23],'Crest gallery'),
            ('south',[58,27],'South gallery'))],
        evacuation_exits=[[16,34],[17,34]],
        war_evacuation_exits={'us':[[16,34],[17,34]],'de':[[16,13],[17,13]]},
        doctrine={
            'us':'Marine landings, flexible British and American armor, rifle fire support, '
                 'six land-based strike flights and four carrier flights. Captains keep the '
                 'rifle teams moving; the major coordinates the army. Engineers open routes '
                 'and seal caves. Two commander-called airborne reserves supplement the Dakota.',
            'de':'German armor and suppression-only MG 42 teams anchor the land fronts; '
                 'Japanese naval torpedoes and cave routes threaten the flanks. Five land-based '
                 'strike flights and three carrier flights conserve resources. Mountain and '
                 'auxiliary infantry exploit rough ground. A transport carries two airborne squads.'},
        reinforcement_brief='All aircraft, airborne reserves, ammunition, medical and service '
            'stocks are finite. Each army receives one tank and one rifle reserve in round 4; '
            'blocked entries wait. Each army also has a glider reserve that can drop onto a '
            'legal hex observed by its platoon. Each carrier has two deck cycles (one at half hull); airfields '
            'have three runway cycles (one at half strength). Launch and service cost 1 base AP; '
            'launch also costs 1 flight AP and 1 fuel. Land/recover costs 1 flight AP. Service '
            'also spends a store. All three consume a cycle. Landing or service delays takeoff '
            'until next own turn. Each flight leg and airborne own-turn ending burns 1 fuel. '
            'Zero fuel at turn end loses the flight. Land-based heavy aircraft cannot use carriers. '
            'Airfield service restores fuel, ordnance, flares and strength. Naval flights may '
            'divert to an airfield; co-op recovery requires the same command group. '
            'Two marked shore teams per army can be ferried to their rear evacuation buoy. '
            'Two private Axis bunkers and two Allied naval preparation aims precede round 1.')
    return board


def roster():
    from . import worlds_collide, midway2, britain2, nightfall, ground_roles
    from .scenarios import build, get_scenario
    from .rulesets import profile
    from .campaigns import unit
    pool=worlds_collide.roster()
    night=nightfall.roster()
    fleet=midway2.roster()
    brit=britain2.initial(get_scenario('current:britain_2'),profile('dsl'))['units']
    roles=ground_roles.roster('stonebridge_2')
    result=[]

    def pick(source,kind,side,variant=None):
        candidates=[u for u in source if u['kind']==kind and u['side']==side
                    and (variant is None or u.get('variant')==variant)]
        return candidates[0] if candidates else next(u for u in source if u['kind']==kind)

    def add(template,side,group,pos,**extra):
        n=1+sum(u['side']==side and u['platoon']==group for u in result)
        u=copy.deepcopy(template)
        for key in ('carrier_id','home_carrier','home_field','drop_transport','airlift_reserve',
                    'arrival_round','arrival_ap','evacuee','mission_radar','role_orders','role_label','role_profile'):
            u.pop(key,None)
        u.update(id=f'{side}-war-{group}-{n}',side=side,platoon=group,number=n,
                 pos=[pos[0],HEIGHT-1-pos[1] if side=='us' else pos[1]],reserve=False,
                 pinned=False,entrenched=False,overwatch=False)
        if side!=template['side']:u['faction']='gb' if side=='us' else 'de'
        u.update(extra)
        u.setdefault('faction',side)
        u.update(ap=u['base_ap'],ap_received=u['base_ap'],banked_ap=0,carried_ap=0,
                 road_pending=False,road_used=False)
        if u['kind'] in {'leader','commander'}:u['rank']='major' if u['kind']=='commander' else 'captain'
        result.append(u)
        return u

    def ground(kind,side,group,pos,**extra):
        template=pick(roles if kind in {'squad','leader','mg','scout','mortar'} else pool,kind,side)
        u=add(template,side,group,pos,**extra)
        if kind in {'squad','leader','mg','scout','mortar'}:
            u.update(role_orders=list(template['role_orders']),role_label=template['role_label'],role_profile=template['role_profile'])
            # Recon must be able to direct the full mixed platoon's guns.
            if kind=='scout' and 'spot_fire' not in u['role_orders']:u['role_orders'].append('spot_fire')
        return u

    for side in ('us','de'):
        # Compact command groups begin 5–9 hexes from their nearest objectives.
        for i,kind in enumerate(('leader','squad','mg','engineer','scout','amphibious')):
            ground(kind,side,'A',[19+i%3,17-i//3],display_name=(
                'Marine' if side=='us' else 'Island guard')+' · '+kind.replace('_',' '))
        for i in range(2):
            craft=add(unit(side,'landing_craft',[0,0],'A',1,hp=5,max_hp=5,range=0,
                base_ap=3,armor=0,penetration=0,smoke=2,grenades=0,personnel=3),side,'A',[16+i,18],
                display_name='Assault / rescue landing craft')
            troop=ground('squad',side,'A',[16+i,18],display_name='Shore recovery team '+str(i+1),evacuee=True)
            troop['carrier_id']=craft['id']
        for i,kind in enumerate(('leader','squad','mg','engineer','radioman','mortar','sniper','supply','halftrack')):
            ground(kind,side,'B',[42+i%5,17-i//5],display_name='Stonehaven · '+(
                'MG 42 suppression team' if kind=='mg' and side=='de' else kind.replace('_',' ')))
        for i,kind in enumerate(('leader','scout','engineer','supply','at_gun','at_team')):
            ground(kind,side,'C',[29+i%5,16-i//5],display_name='Desert column · '+kind.replace('_',' '))
        tanks=[u for u in pool if u['side']==side and u['kind']=='tank']
        for i,tank in enumerate(tanks):
            add(tank,side,'C',[29+i%6,14-i//6])
        for i,kind in enumerate(('leader','mountain','commando' if side=='us' else 'mg',
                                  'partisan' if side=='us' else 'askari','at_team','engineer','radioman','mortar','supply')):
            ground(kind,side,'D',[57+i%5,17-i//5],display_name='High-pass · '+kind.replace('_',' '))

        cv_template=pick(fleet,'carrier',side)
        cv=add(cv_template,side,'E',[5,15],display_name='USS Resolute' if side=='us' else 'Shokaku task carrier')
        for p in [u for u in fleet if u.get('carrier_id')==cv_template['id']]:
            p=add(p,side,'E',[5,15],carrier_id=cv['id'],home_carrier=cv['id'],carrier_capable=True)
        for i,kind in enumerate(('battleship','cruiser','destroyer','destroyer')):
            template=pick(pool if kind=='battleship' else fleet,kind,side)
            add(template,side,'E',[3+i*3,18],display_name=('Allied ' if side=='us' else 'Axis ')+kind+f' {i+1}')

        # An air bridge has its own service strip, troop transport and ground scouts.
        field=add(pick(brit,'airfield',side),side,'F',[69,13],display_name='Forward air bridge strip')
        plane=add(pick(night,'transport_aircraft','us'),side,'F',[69,13],faction='gb' if side=='us' else 'de',
                  display_name='Dakota transport' if side=='us' else 'Ju 52 transport',carrier_id=field['id'],home_field=field['id'])
        for i in range(2):
            add(pick(pool,'paratrooper','us'),side,'F',[69,13],reserve=True,airlift_reserve=True,
                drop_transport=plane['id'],faction='gb' if side=='us' else 'de',display_name='Air bridge parachute section '+str(i+1))
        for i,kind in enumerate(('leader','pathfinder' if side=='us' else 'flak','paratrooper','engineer','scout')):
            ground(kind,side,'F',[68+i%4,17-i//4],**(
                dict(reserve=True,display_name='Glider reserve · airborne section') if kind=='paratrooper' else {}))
        add(pick(night,'spotlight','de'),side,'F',[71,18],display_name='Air bridge searchlight')

        field=add(pick(brit,'airfield',side),side,'G',[76,13],display_name='Westhaven sector station' if side=='us' else 'Adler sector station')
        models=([pick(brit,'fighter','us'),next(u for u in brit if u.get('britain_role')=='hurricane'),
                 pick(night,'fighter','us'),pick(night,'bomber','us','lancaster'),
                 pick(night,'bomber','us','halifax'),pick(night,'bomber','us','mosquito_pathfinder')]
                if side=='us' else [pick(brit,'fighter','de'),pick(night,'fighter','de'),
                    next(u for u in brit if u.get('britain_role')=='he111'),
                    next(u for u in brit if u.get('britain_role')=='do17'),
                    next(u for u in brit if u.get('britain_role')=='ju88')])
        for p in models:add(p,side,'G',[76,13],carrier_id=field['id'],home_field=field['id'])
        for kind,pos in (('radar',[75,18]),('aa_gun',[77,17]),('spotlight',[78,18])):
            add(pick(night if kind=='spotlight' else brit,kind,side),side,'G',pos,
                display_name='Sector '+kind.replace('_',' '))
        ground('squad',side,'G',[74,17],display_name='Air station defense section')
        major=add(pick(pool,'commander',side),side,'HQ',[49,14],display_name='Major · coalition command',command_radius=2)
        major['airlift_commander']=side=='us'
        # Preserve the off-map recon/artillery toolbox and timed reinforcements.
        for i,kind in enumerate(('squad','tank')):
            ground(kind,side,'C',[35+i,12],reserve=True,arrival_round=4,display_name='Round 4 reserve · '+kind)
        if side=='us':
            for i in range(2):
                add(pick(pool,'paratrooper','us'),side,'F',[66+i,12],reserve=True,airlift_reserve=True,
                    display_name='HQ airborne reserve '+str(i+1))
    for u in result:
        if u['kind']=='engineer':u.update(bridge_kits=1,repair_kits=2,demolition_charges=2,max_demolition_charges=2)
        if u['kind']=='mortar':u.update(shells=3,max_shells=3)
        if u.get('role_orders'):
            u['role_orders']+=['field_aid']
            if u['side']=='de':u['role_orders']+=['cave_move']
            if u['kind']=='leader' and u['platoon']=='B':u['role_orders'].append('barrage')
        if u['kind']=='airfield':u.update(air_capacity=6,runway_used=0,air_stores=8,max_air_stores=8)
        if u['kind'] in {'fighter','bomber','transport_aircraft'}:
            u.setdefault('max_bombs',u.get('bombs',0));u.setdefault('bombs',0)
            u.setdefault('max_fuel',16 if u['kind']=='fighter' else 22)
            u.update(fuel=u['max_fuel'],sortie_cooldown=False,deck_cooldown=False,service_used=False)
        u.setdefault('night_air_sight',6 if u['kind']=='radar' else 4 if u['kind']=='fighter' else 2)
        u.setdefault('night_ground_sight',3 if u['kind'] not in {'fighter','bomber','transport_aircraft','radar'} else 2)
    return result


def boat_choices(state,u,legal,observed,visited):
    from .engine import distance
    cargo=[t for t in observed if t.get('carrier_id')==u['id'] and t.get('evacuee')]
    if not cargo:return None
    if legal.get('evacuate'):return [(100,dict(kind='evacuate',unit=u['id']))]
    goal=min(state['battlefield']['war_evacuation_exits'][u['side']],key=lambda p:distance(p,u['pos']))
    result=[]
    for m in legal['moves']:
        gain=distance(u['pos'],goal)-distance(m['pos'],goal)
        if gain>0 and tuple(m['pos']) not in visited.get(u['id'],set()):
            result.append((18+gain,dict(kind='move',unit=u['id'],pos=m['pos'])))
    return result


def initialize(state):
    if not enabled(state):return state
    state.update(war_version=VERSION,field_ops_version=1,night_flares=[],support={'us':2,'de':2},
                 war_raids={'us':0,'de':0},war_rescues={'us':0,'de':0},_war_scored_fields=[],
                 _aid_stores={'us':8,'de':8})
    # Radar positions vary only inside a small, published rear search sector.
    for u in state['units']:
        if u['kind']=='radar':
            u['pos'][0]=secrets.choice((74,75,76))
    return state


def unit_options(state,u,legal):
    from . import domains,britain2,midway2,nightfall,weather,transport,deployment
    from .visibility import active
    if not enabled(state):return legal
    if deployment.active(state) or not state['ready'] or state['winner'] or u['side']!=state['turn']:return legal
    if u['kind'] in domains.AIR_UNITS:
        # Reuse the airfield order resolver, including command and occupancy checks.
        field=britain2.options(state,u)
        legal.update({k:field[k] for k in ('scramble','land','field_service','station_repair')})
        legal['rearm']=False
        if domains.is_air(u) and u['fuel']<=0:legal['moves']=[]
        if not u.get('carrier_capable'):legal['recover']=[]
        legal.update(nightfall.options(state,u))
        if not dark(state):legal['spotlight']=[]
    if u['kind']=='carrier':
        legal['launch']=[c for c in legal.get('launch',[]) if any(p['id']==c['id'] and p['fuel']>=2 and not p.get('sortie_cooldown') for p in state['units']) and weather.can_launch(state,u)]
        if active(u) and u['side']==state['turn'] and u['ap']>=1 and midway2.deck_free(u) and u.get('air_stores'):
            legal['deck_service']=[p['id'] for p in midway2.aboard(state,u) if midway2.same_command(state,p,u) and needs_service(p) and not p.get('service_used')]
    legal['evacuate']=bool(u['kind']=='landing_craft' and active(u) and u['side']==state['turn']
        and u['ap']>=1 and not u['pinned'] and u['pos'] in state['battlefield']['war_evacuation_exits'][u['side']]
        and any(t.get('evacuee') for t in transport.passengers(state,u)))
    return legal


def needs_service(p):
    return p['hp']<p['max_hp'] or p.get('fuel',0)<p.get('max_fuel',0) or p.get('bombs',0)<p.get('max_bombs',0) or p.get('flares',0)<p.get('max_flares',0)


def evacuate(state,u,legal):
    from .transport import passengers
    if not legal.get('evacuate'):raise ValueError('Load a marked shore team and reach your rear evacuation buoy with 1 boat AP.')
    troop=next(t for t in passengers(state,u) if t.get('evacuee'))
    troop.update(reserve=True,evacuated=True,ap=0)
    troop.pop('carrier_id',None);troop.pop('evacuee',None)
    u['ap']-=1
    state['war_rescues'][u['side']]+=1
    state['joint_score'][u['side']]+=2
    return 'Shore team evacuated safely · +2 campaign points. The boat can return.'


def end_turn(state,side):
    from . import fubar,domains
    from .visibility import active
    # Fuel exhaustion is resolved before scoring and before next-turn AP refresh.
    for u in state['units']:
        if u['side']==side and domains.is_air(u) and active(u):
            u['fuel']=max(0,u['fuel']-1)
            if u['fuel']==0:u.update(hp=0,ap=0,overwatch=False)
    flags={p['id']:p for p in fubar.controls(state)}
    bonus=int(all(flags[k]['owner']==side for k in ('city','pass')))
    state['joint_score'][side]+=bonus
    fubar.end_turn(state,side)
    state['night_flares']=[dict(f,ttl=f['ttl']-1) for f in state.get('night_flares',[]) if f['ttl']>1]


def start_turn(state,side):
    if not enabled(state):return
    for u in state['units']:
        if u['side']==side:
            u.pop('beam',None);u.pop('night_flash',None)
            if u['kind']=='airfield':u['runway_used']=0
            if 'fuel' in u:u.update(sortie_cooldown=False,service_used=False)


def after_order(state,action):
    from . import domains
    if not enabled(state):return
    kind=action.get('kind');units={u['id']:u for u in state['units']}
    u=units.get(action.get('unit'))
    if u and kind=='move' and domains.is_air(u):u['fuel']=max(0,u['fuel']-1)
    if kind=='launch':
        p=units[action['target']];p['fuel']=max(0,p['fuel']-1)
    if kind in {'deck_service','field_service'}:
        p=units[action['target']];p['fuel']=p['max_fuel']
        if 'max_flares' in p:p['flares']=p['max_flares']
    # Resolve dependent cargo after combat, including field and transport losses.
    for p in state['units']:
        base=units.get(p.get('carrier_id') or p.get('drop_transport'))
        if base and base['hp']<=0 and (p.get('carrier_id') or p.get('reserve')):
            p.update(hp=0,ap=0,overwatch=False,banked_ap=0)
    for field in state['units']:
        if field['kind']=='airfield' and field['hp']<=0 and field['id'] not in state['_war_scored_fields']:
            side='de' if field['side']=='us' else 'us'
            state['_war_scored_fields'].append(field['id']);state['war_raids'][side]+=3;state['joint_score'][side]+=3
    for side in ('us','de'):
        if state['joint_score'][side]>=state['battlefield']['joint_score_target'] and not state['winner']:state['winner']=side


def redact(result,state,side):
    if not enabled(state):return result
    result.pop('_war_scored_fields',None)
    result.update(war_version=VERSION,field_ops_version=1,
        war_status=dict(dark=dark(state),cycle='Four day rounds / two night rounds',
            next_night=next((r for r in range(state['round']+1,state['round']+7) if dark(state,r)!=dark(state)),None),
            raids=copy.deepcopy(state['war_raids']),rescues=copy.deepcopy(state['war_rescues'])))
    for u in result.get('units',[]):
        if u['side']!=side:
            for key in ('fuel','home_field','home_carrier','runway_used','air_stores','service_used','sortie_cooldown','deck_used','deck_cooldown'):u.pop(key,None)
    return result


def deployment_zone(state,side,unit=None):
    from . import domains,fieldworks
    b=state['battlefield'];ys=range(30,35) if side=='us' else range(13,18)
    if unit is None:return [[x,y] for y in ys for x in range(WIDTH)]
    centers={k:x for k,_,x in GROUPS};cx=centers.get(unit['platoon'],49)
    if unit['kind']=='landing_craft':cx=16
    if unit['kind'] in domains.SHIPS:cx=7
    return [[x,y] for y in ys for x in range(max(0,cx-5),min(WIDTH,cx+6))
        if (b['map'][y][x]=='water' if unit['kind'] in domains.SHIPS else
            b['map'][y][x]!='water' if unit['kind'] in {'airfield','radar','aa_gun','spotlight','at_gun','flak'} else
            True if domains.is_air(unit) else fieldworks.movement(unit,b['map'][y][x])[0])]


def choices(state,u,legal,observed,visited):
    """Bounded domain decisions, using own stores and observed targets only."""
    from . import domains,fubar,midway2,nightfall,britain2,weather
    from .engine import distance
    from .visibility import active
    if u.get('carrier_id') or u.get('reserve') or not active(u):return []
    result=[]
    def add(score,kind,**kw):result.append((score,dict(kind=kind,unit=u['id'],**kw)))
    if u['kind']=='airfield':
        if legal.get('station_repair'):add(35,'station_repair')
        for uid in legal.get('field_service',[]):add(30,'field_service',target=uid)
        for c in legal.get('scramble',[]):
            p=next(p for p in observed if p['id']==c['id'])
            if p['fuel']<p['max_fuel']//2:continue
            pos=min(c['destinations'],key=lambda m:distance(m['pos'],[73,23]))['pos']
            add(18,'scramble',target=c['id'],pos=pos)
        return result
    if u['kind']=='carrier':return midway2.choices(state,u,legal,observed,visited)
    if domains.is_air(u):
        bases=[b for b in observed if b['side']==u['side'] and active(b) and b['kind'] in {'carrier','airfield'}
               and (b['kind']=='airfield' or u.get('carrier_capable')) and britain2.same_command(state,u,b)]
        base=min(bases,key=lambda b:distance(u['pos'],b['pos'])) if bases else None
        legs=(distance(u['pos'],base['pos'])+weather.flight(state,u)-1)//weather.flight(state,u) if base else 0
        return_home=base and (u['fuel']<=legs+4 or u['hp']<=2 or u['kind']=='bomber' and not u['bombs'])
        if return_home:
            for key in ('land','recover'):
                for uid in legal.get(key,[]):add(60,key,target=uid)
            for m in legal['moves']:
                gain=distance(u['pos'],base['pos'])-distance(m['pos'],base['pos'])
                if gain>0 and tuple(m['pos']) not in visited.get(u['id'],set()):add(35+gain,'move',pos=m['pos'])
            if result:return result
    if u['kind']=='spotlight':
        if legal.get('spotlight') and not u.get('beam'):
            aim=min(legal['spotlight'],key=lambda p:distance(p,[u['pos'][0],23]))
            add(12,'spotlight',pos=aim)
        return result
    if u['kind']=='transport_aircraft':
        goal=[73,23]
        if not nightfall.drop_reserves(state,u):return []
        if legal.get('airborne_drop') and distance(u['pos'],goal)<=1:add(30,'airborne_drop',pos=goal)
        for m in legal['moves']:
            gain=distance(u['pos'],goal)-distance(m['pos'],goal)
            if gain>0 and tuple(m['pos']) not in visited.get(u['id'],set()):add(5+gain*3,'move',pos=m['pos'])
        return result
    result=fubar.domain_choices(state,u,legal,observed,visited)
    if legal.get('flare') and dark(state):
        point=min(state['battlefield']['joint_objectives'],key=lambda p:distance(p['pos'],u['pos']))['pos']
        aim=min(legal['flare'],key=lambda p:distance(p,point))
        if distance(aim,point)<=1 and not nightfall.illuminated(state,point):add(15,'flare',pos=aim)
    return result
