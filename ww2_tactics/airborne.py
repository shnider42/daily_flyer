"""Commander airlifts: resolve every hazard before activating the new observer."""
import copy
from .visibility import active

VERSION=1
DIRECTIONS=((1,-1,0),(1,0,-1),(0,1,-1),(-1,1,0),(-1,0,1),(0,-1,1))
SCATTER={1:0,2:3,3:2,4:1,5:1,6:0}
ORDERS={'airborne_drop','mark_lz'}


def enabled(state):return state.get('airborne_version')==VERSION


def initialize(state):
    if state['battlefield'].get('airborne'):
        state.update(airborne_version=VERSION,airlift_rounds={},airlift_reports={})
    return state


def reserves(state,side):
    return [u for u in state['units'] if u['side']==side and u['kind']=='paratrooper' and u.get('airlift_reserve') and u.get('reserve') and u['hp']>0]


def options(state,u):
    result=dict(airborne_drop=False,mark_lz=False)
    if not enabled(state) or not state['ready'] or state['winner'] or not active(u) or u['pinned'] or u['side']!=state['turn'] or u.get('afloat'):return result
    result['airborne_drop']=bool(u['kind']=='commander' and u.get('airlift_commander') and u.get('faction',u['side']) in {'us','gb'}
        and u['ap']>=3 and reserves(state,u['side']) and state.get('airlift_rounds',{}).get(u['side'])!=state['round'])
    result['mark_lz']=bool(u.get('beacon_charges') and not u.get('beacon_active') and u['ap']>=2)
    return result


def inside(state,pos):
    b=state['battlefield']
    return isinstance(pos,list) and len(pos)==2 and all(type(v) is int for v in pos) and 0<=pos[0]<b['width'] and 0<=pos[1]<b['height']


def step(pos,direction,count=1):
    from .engine import cube
    a=cube(pos);d=DIRECTIONS[(direction-1)%6];q,_,y=[a[i]+d[i]*count for i in range(3)]
    return [q+(y-(y&1))//2,y]


def beacon_near(state,side,pos):
    from .engine import distance
    return any(u['side']==side and active(u) and not u['pinned'] and u.get('beacon_active') and distance(u['pos'],pos)<=2 for u in state['units'])


def landing_space(state,pos):
    from .engine import terrain
    from .buildings import enterable
    from .domains import surface
    return inside(state,pos) and terrain(*pos,state) not in {'mountain','tower', 'church','bunker'} and enterable(state,pos) and not any(active(u) and surface(state,u) and u['pos']==pos for u in state['units'])


def action(state,commander,order,legal,roll,react):
    from .engine import terrain, distance
    from . import signals
    kind=order['kind']
    if not legal.get(kind):raise ValueError('Order unavailable: check role, AP, reserves and the once-per-round airlift limit.')
    if kind=='mark_lz':
        commander.update(ap=commander['ap']-2,beacon_charges=commander['beacon_charges']-1,beacon_active=True,overwatch=False)
        signals.alert(state,commander['side'],commander['pos'],'radio')
        return 'Pathfinder beacon active: aims within 2 hexes scatter one hex less. Moving or attacking ends it; pinning disables it. Natural 1 and Flak remain dangerous.',[]
    aim=order.get('pos')
    if not inside(state,aim):raise ValueError('Choose a hex inside this battlefield.')
    troop=reserves(state,commander['side'])[0]
    commander.update(ap=commander['ap']-3,overwatch=False)
    state['airlift_rounds'][commander['side']]=state['round']
    die=roll();guided=beacon_near(state,commander['side'],aim)
    report=dict(round=state['round'],revision=state['revision']+1,unit=troop['id'],aim=list(aim),roll=die,guided=guided,landed=False)
    signals.alert(state,commander['side'],aim,'airlift')
    reason='Transport lost before landing; no sight established.'
    pos=None
    if die>1:
        scatter=max(0,SCATTER[die]-int(guided));direction=roll() if scatter else 1
        pos=step(aim,direction,scatter);report.update(scatter=scatter,direction=direction if scatter else None)
        if not inside(state,pos):
            pos=None;reason='Scattered outside the battlefield; squad lost without establishing sight.'
        elif not landing_space(state,pos):
            adjacent=[step(pos,(direction+i-1)%6+1) for i in range(6)]
            pos=next((p for p in adjacent if landing_space(state,p)),None)
            report['diverted']=True
            if pos is None:reason='No safe landing space; squad lost without establishing sight.'
        # Always roll approach risk after a non-1 landing roll: hidden gun count
        # never changes the public dice stream. Never publish a gun ID or hex.
        interception=roll()
        if pos is not None:
            guns=[u for u in state['units'] if u['side']!=commander['side'] and active(u) and not u['pinned'] and u.get('aa_radius')
                  and u.get('aa_round')!=state['round'] and distance(u['pos'],pos)<=u['aa_radius']]
            if guns:
                gun=min(guns,key=lambda u:(distance(u['pos'],pos),u['id']));gun['aa_round']=state['round']
                if interception<=2:pos=None;reason='Transport lost on approach; squad lost without establishing sight. Gun locations remain unknown.'
    reactions=[]
    if pos is None:
        report.pop('diverted',None)  # A failed approach cannot disclose hidden occupancy.
        troop.update(hp=0,ap=0,ap_received=0,banked_ap=0)
    else:
        tile=terrain(*pos,state)
        rough=tile in {'woods','building','bocage','ridge','wadi','oasis','marsh'}
        troop.update(pos=list(pos),reserve=False,hp=troop['hp']-int(rough),ap=1,ap_received=1,landing_limited=True,
                     banked_ap=0,carried_ap=0,road_pending=False,road_used=False,overwatch=False,entrenched=False,pinned=False)
        troop.pop('airlift_reserve',None)
        if tile=='water':troop['afloat']=True
        report.update(landed=True,pos=list(pos),rough=rough,afloat=tile=='water')
        reason='Landed with 1 AP.'+(' Rough landing: lost 1 strength.' if rough else '')+(' In water: swim to land; lose 2 strength at each own turn end while afloat.' if tile=='water' else '')
        # Only the resolved landing location can establish sight or draw reactions.
        reactions=react(state,troop,roll)
        report['survived']=troop['hp']>0
    report['result']=reason
    state['airlift_reports'][commander['side']]=report
    return f'Airborne drop rolled {die}. '+reason,reactions


def before_order(u,kind):
    if kind in {'move','fire','assault','grenade','area_fire','demolition','mortar_fire','snipe','suppress','load','unload'}:u.pop('beacon_active',None)


def after_order(state):
    from .engine import terrain
    if not enabled(state):return
    for u in state['units']:
        if u.get('afloat') and active(u) and terrain(*u['pos'],state)!='water':u.pop('afloat',None)


def end_turn(state,side):
    from .engine import terrain
    from .combat_display import record_combat
    if not enabled(state):return []
    lost=[]
    for u in state['units']:
        if u['side']==side and active(u) and u.get('afloat') and terrain(*u['pos'],state)=='water':
            u.update(hp=max(0,u['hp']-2),overwatch=False)
            if not u['hp']:u.update(ap=0,banked_ap=0)
            lost.append(dict(id=u['id'],pos=list(u['pos']),kind=u['kind'],result='Lost 2 strength in water'+('; eliminated' if not u['hp'] else '')))
    if lost:
        state['last_combat']=dict(kind='Water landing',impacts=lost,result='Units still afloat lose 2 strength at their own turn end.',revision=state['revision']+1)
        record_combat(state,note='No roll. Swim ashore or board an adjacent friendly transport before ending your turn.')
    return ['Water landing casualties resolved.'] if lost else []


def public_fields(state,side):
    return dict(airlift_report=copy.deepcopy(state.get('airlift_reports',{}).get(side)),airlift_round=state.get('airlift_rounds',{}).get(side))
