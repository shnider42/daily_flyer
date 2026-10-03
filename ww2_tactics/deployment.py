"""Private, simultaneous preparation, opt-in for two new landing playtests.

Plans are committed once. No sight, AP, dice or combat occur while arranging
forces. The published terrain survey never contains player-placed defenses.
"""
import copy
import secrets

VERSION = 1
IDS = ('shingle_cove', 'breakwater')
ORDERS = {'deploy_unit', 'deploy_bunker', 'deploy_fire', 'deploy_reset', 'deploy_lock'}


def scenarios(build):
    result = {}
    for key, name, w, h, shore, rounds, bunkers, missions in (
        ('shingle_cove', 'Shingle Cove', 10, 12, 8, 14, 2, 2),
        ('breakwater', 'Operation Breakwater', 22, 22, 15, 24, 4, 4),
    ):
        g = [['.' for _ in range(w)] for _ in range(h)]
        lanes = [2, w//2, w-3]
        for y in range(h):
            for x in range(w):
                if y >= shore: g[y][x] = '~'
                elif y >= shore-2: g[y][x] = 's'
                elif x in lanes or y == 2: g[y][x] = '='
                elif y == shore-3 and x not in {n+d for n in lanes for d in (-1,0,1)}: g[y][x] = 'h'
                elif 2 < y < shore-4 and (x*5+y*3)%13 == 0: g[y][x] = 'T'
        g[2][w//2] = '*'
        b = build(key, name, 'Beach-exit command post', rounds,
            f'Pre-battle playtest · {w}×{h}. Arrange your force in private. Germans place {bunkers} bunkers; Americans choose landing lanes and up to {missions} blind naval fire missions. Lock both plans, land troops, then hold the command post for two American turn endings.',
            [''.join(row) for row in g])
        b.update(dsl_only=True, campaign=key, prebattle=True, signals=True, logistics=True,
            playtest=True, theater='NORMANDY-INSPIRED · PRE-BATTLE',
            summary='Private setup · learn a beach landing' if key=='shingle_cove' else 'Private setup · broad-front coastal assault',
            factions={'us':'Americans', 'de':'Germans'},
            historical_note='Fictional Omaha-inspired playtest, not a historical reconstruction. Forces, budgets and ranges are balance assumptions.',
            deployment_rules=dict(shore=shore, bunkers=bunkers, missions=missions,
                defense_rows=[1, shore-3], landing_rows=[shore+1, h-1], fire_rows=[0, shore-3]),
            platoons=[dict(id='A',name='West force',center=2),dict(id='B',name='East force',center=w-3),dict(id='HQ',name='Support',center=w//2)],
            sectors=[dict(name='West landing',pos=[2,shore]),dict(name='East landing',pos=[w-3,shore]),dict(name='Command post',pos=[w//2,2])])
        result[key] = b
    return result


def roster(key):
    from .new_fronts import support
    large = key == 'breakwater'
    w, shore = (22,15) if large else (10,8)
    result, counts = [], {}
    def add(side, kind, pos, group, **extra):
        counts[side,group] = counts.get((side,group),0)+1
        u = support(side,kind,pos,group,counts[side,group],side,**extra)
        result.append(u)
        return u
    kinds = ['squad','engineer','leader','radioman']
    if large: kinds += ['squad','commander','mortar','supply']
    for i,kind in enumerate(kinds):
        x = 1+i*2
        group = 'A' if i<len(kinds)//2 else 'B'
        boat = add('us','landing_craft',[x,shore+1],group,hp=5,max_hp=5,
            range=0,base_ap=3,armor=0,weapon='none',smoke=2,grenades=0,personnel=3)
        extra = dict(artillery_charges=0,field_recon_charges=1) if kind=='commander' else {}
        add('us',kind,boat['pos'],group,carrier_id=boat['id'],**extra)
    for x in (0,w-1): add('us','amphibious',[x,shore+2],'HQ')
    defenders = ['mg','squad','leader','mg','at_gun','radioman']
    if large: defenders += ['mg','squad','leader','squad','mortar','supply']
    for i,kind in enumerate(defenders):
        x = 1+i% (w-2)
        y = shore-4-i//(w-2)
        add('de',kind,[x,y],'A' if x<w//2 else 'B')
    return result


def active(state):
    return state.get('deployment_version') == VERSION and state.get('deployment',{}).get('phase') == 'planning' and not state.get('winner')


def initialize(state):
    if not state['battlefield'].get('prebattle'): return state
    state.update(deployment_version=VERSION, deployment=dict(phase='planning', locked={'us':False,'de':False}, bunkers=[], fire=[]))
    # Initialization of legacy systems may have surveyed default spawn positions.
    # Preparation explicitly discards that transient information.
    clear_intel(state)
    state['log'] = ['Pre-battle: arrange your own force, then lock your plan. Enemy preparations are hidden.']
    return state


def clear_intel(state):
    for key in ('intel','platoon_intel','radio_reports'):
        state[key] = {'us':{},'de':{}}
    state['reports'] = {'us':{'log':[],'combat':[]},'de':{'log':[],'combat':[]}}


def zone(state, side):
    b = state['battlefield']; lo,hi = b['deployment_rules']['landing_rows' if side=='us' else 'defense_rows']
    allowed={'water'} if side=='us' else {'field','road','woods','beach'}
    return [[x,y] for y in range(lo,hi+1) for x in range(b['width']) if b['map'][y][x] in allowed]


def bunker_zone(state):
    b = state['battlefield']
    return [p for p in zone(state,'de') if b['map'][p[1]][p[0]] in {'field','beach'}]


def fire_zone(state):
    b = state['battlefield']; lo,hi=b['deployment_rules']['fire_rows']
    return [[x,y] for y in range(lo,hi+1) for x in range(b['width']) if b['map'][y][x]!='water']


def fields(state, side):
    """One shared placement zone per army, not a copy for every unit."""
    p = state['deployment']; rules = state['battlefield']['deployment_rules']
    return dict(phase=p['phase'], locked=copy.deepcopy(p['locked']),
        zone=zone(state,side), bunker_zone=bunker_zone(state) if side=='de' else [],
        fire_zone=fire_zone(state) if side=='us' else [],
        bunkers=copy.deepcopy(p['bunkers']) if side=='de' else [],
        fire=copy.deepcopy(p['fire']) if side=='us' else [],
        bunker_budget=rules['bunkers'], fire_budget=rules['missions'])


def public_planning(state, side):
    result = copy.deepcopy(state)
    result['units'] = [u for u in result['units'] if u['side']==side]
    result['deployment'] = fields(state,side)
    result.update(contacts=[],visible_hexes=[],platoon_views={},barrages=[],effects=[],
                  combat_history=[],last_combat=None,action_history=[],computer_orders=[])
    for key in ('intel','reports','platoon_intel','radio_reports','building_intel','fieldworks_intel','_order_history','computer_playback'):
        result.pop(key,None)
    result['log'] = ['Private preparation. Enemy units, bunkers and fire plans stay hidden until battle begins and normal sight applies.']
    # Only this side's planned structures are drawn; the server board is untouched.
    board = result['battlefield']['map']
    if side=='de':
        for x,y in state['deployment']['bunkers']: board[y][x] = 'bunker'
    result['map'] = board
    return result


def redact(result):
    """After deployment, never publish either side's old secret placement plan."""
    if result.get('deployment_version'):
        result['deployment'] = dict(phase='battle',locked={'us':True,'de':True})
    return result


def validate_pos(pos):
    if not isinstance(pos,list) or len(pos)!=2 or any(type(n) is not int for n in pos):
        raise ValueError('Choose a highlighted hex on the map.')


def apply(state, side, order, roll=None):
    from .engine import distance
    from .transport import follow
    if side not in ('us','de') or not active(state): raise ValueError('Preparation is not available in this battle.')
    kind = order.get('kind')
    if kind not in ORDERS: raise ValueError('Finish pre-battle preparation before issuing combat orders.')
    if state.get('rematch'): raise ValueError('Resolve the next-battle proposal first.')
    if state['deployment']['locked'][side]: raise ValueError('Your plan is locked. Waiting for the other commander.')
    result = copy.deepcopy(state); p=result['deployment']; rules=result['battlefield']['deployment_rules']
    if kind=='deploy_unit':
        u=next((u for u in result['units'] if u['id']==order.get('unit') and u['side']==side),None)
        if not u or u.get('carrier_id') or u['hp']<=0: raise ValueError('Select your own unit; passengers move with their boat.')
        pos=order.get('pos');validate_pos(pos)
        if pos not in zone(result,side): raise ValueError('Place units inside your highlighted deployment zone.')
        if any(t['id']!=u['id'] and not t.get('carrier_id') and t['pos']==pos for t in result['units']):
            raise ValueError('That deployment hex is occupied. Choose another.')
        u['pos']=list(pos);follow(result,u)
    elif kind in {'deploy_bunker','deploy_fire'}:
        defense=kind=='deploy_bunker'
        if side!=('de' if defense else 'us'): raise ValueError('That preparation belongs to the other army.')
        pos=order.get('pos');validate_pos(pos)
        if pos not in (bunker_zone(result) if defense else fire_zone(result)):
            raise ValueError('Choose a highlighted defense or inland fire hex.')
        positions=p['bunkers' if defense else 'fire'];budget=rules['bunkers' if defense else 'missions']
        if pos in positions: positions.remove(pos)
        else:
            if len(positions)>=budget: raise ValueError('Budget used. Tap an existing marker to remove it first.')
            if any(distance(pos,q)<(2 if defense else 3) for q in positions):
                raise ValueError('Leave at least one hex between bunkers, or two between naval aim points.')
            positions.append(list(pos))
    elif kind=='deploy_reset':
        defaults={u['id']:u for u in roster(result['battlefield']['id'])}
        for u in result['units']:
            if u['side']==side: u['pos']=list(defaults[u['id']]['pos'])
        p['bunkers' if side=='de' else 'fire']=[]
    else:
        p['locked'][side]=True
        if all(p['locked'].values()) and result['ready']: begin(result,roll)
    result['revision']+=1
    return result


def begin(state, roll=None):
    from . import fieldworks
    from .visibility import active as alive, update_intel
    from .effects import record_effect
    p=state['deployment'];die=roll or (lambda:secrets.randbelow(6)+1)
    for pos in p['bunkers']:
        key=fieldworks.key(pos)
        state['fieldworks'][key]='bunker'
        state['fieldworks_intel']['de'][key]='bunker'
        state['buildings'][key]='intact'
        state['building_intel']['de'][key]='intact'
    # Prepared weapons watch their approach. Suppression from naval fire can
    # cancel this; ordinary combat still requires actual spotting and range.
    for u in state['units']:
        if u['side']=='de':
            u['entrenched']=u['pos'] in p['bunkers']
            u['overwatch']=u['kind'] in {'mg','at_gun'}
    clear_intel(state)
    reports=[]
    for aim in p['fire']:
        value=die();impact=list(aim)
        if value<=2:
            adjacent=fieldworks.neighbors(state,aim)
            impact=adjacent[(die()-1)%len(adjacent)]
        area=[impact]+fieldworks.neighbors(state,impact)
        for u in state['units']:
            if not alive(u) or u['pos'] not in area or u.get('armor',0)>0: continue
            # Naval preparation is suppression, not a free army wipe. Intact
            # bunkers absorb damage; no building-collapse lottery before play.
            if u['pos'] not in p['bunkers']: u['hp']=max(1,u['hp']-1)
            u.update(pinned=True,overwatch=False,entrenched=False)
        record_effect(state,'explosion',area)
        reports.append(dict(aim=list(aim),impact=impact,roll=value))
    p.update(phase='battle')
    state['prebattle_impacts']=reports  # Public shell locations, never hit/miss or casualties.
    state.update(turn='us',round=1,hold=0)
    update_intel(state)
    message='Both plans locked. Naval preparation resolved; enemy casualties are unconfirmed. Americans begin round 1.'
    state['log']=[message]
    for side in ('us','de'): state['reports'][side]['log']=[message]


def prepare_computer(state, roll=None):
    """Uses only published geography and its own force, never enemy placements."""
    if not active(state) or not state.get('ai_side'): return state
    side=state['ai_side']
    if state['deployment']['locked'][side]: return state
    result=state
    rules=state['battlefield']['deployment_rules'];w=state['battlefield']['width']
    if side=='de':
        candidates=bunker_zone(state)
        for i in range(rules['bunkers']):
            aim=[round((i+1)*w/(rules['bunkers']+1)),rules['defense_rows'][1]]
            from .engine import distance
            legal=[p for p in candidates if all(distance(p,q)>=2 for q in result['deployment']['bunkers'])]
            if not legal: break
            pos=min(legal,key=lambda p:distance(p,aim))
            result=apply(result,side,dict(kind='deploy_bunker',pos=pos))
        # Place machine guns in the planned bunkers, swapping own occupants.
        result=copy.deepcopy(result)
        guns=[u for u in result['units'] if u['side']==side and u['kind']=='mg']
        for u,pos in zip(guns,result['deployment']['bunkers']):
            other=next((t for t in result['units'] if t['side']==side and t['id']!=u['id'] and t['pos']==pos),None)
            if other: other['pos']=list(u['pos'])
            u['pos']=list(pos)
    else:
        from .engine import distance
        for i in range(rules['missions']):
            aim=[round((i+1)*w/(rules['missions']+1)),rules['defense_rows'][1]]
            candidates=[p for p in fire_zone(state) if all(distance(p,q)>=3 for q in result['deployment']['fire'])]
            if not candidates: break
            result=apply(result,side,dict(kind='deploy_fire',pos=min(candidates,key=lambda p:distance(p,aim))))
    return apply(result,side,dict(kind='deploy_lock'),roll=roll)
