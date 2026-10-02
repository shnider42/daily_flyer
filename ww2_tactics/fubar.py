"""Fubar: intentionally ahistorical, versioned combined-domain playtest."""
import copy
from . import domains


def roster():
    from . import air, naval, combined, iron_lantern, theaters, western
    from .campaigns import unit
    from .scenarios import get_scenario
    from .rulesets import profile
    pool = iron_lantern.roster()
    pool.extend(western.roster('carentan'))
    for name in theaters.IDS:
        pool.extend(theaters.roster(name))
    for side in ('us', 'de'):
        pool.extend(combined.roster(side, 32))
    planes = air.initial(get_scenario('britain'), profile('dsl'))['units']
    ships = naval.initial(get_scenario('midway'), profile('dsl'))['units']
    result = []

    def add(template, side, pos, group, **extra):
        u = copy.deepcopy(template)
        number = 1 + sum(v['side'] == side and v['platoon'] == group for v in result)
        u.update(id=f'{side}-fubar-{group}-{number}', side=side, pos=list(pos),
                 platoon=group, number=number, reserve=False, **extra)
        u.pop('carrier_id', None)
        u.update(ap=u['base_ap'], ap_received=u['base_ap'])
        result.append(u)
        return u

    for side in ('us', 'de'):
        y = 25 if side == 'us' else 6
        dy = 2 if side == 'us' else -2
        kinds = ['commander', 'leader', 'squad', 'mg', 'scout', 'engineer', 'at_team',
                 'radioman', 'mortar', 'sniper', 'tank', 'halftrack', 'at_gun', 'mountain']
        kinds += ['pathfinder', 'commando', 'partisan', 'paratrooper'] if side == 'us' else ['flak', 'askari', 'squad', 'engineer']
        for i, kind in enumerate(kinds):
            candidates = [u for u in pool if u['side'] == side and u['kind'] == kind]
            template = candidates[0]
            # Give both armor schools an appearance: Firefly versus Tiger.
            if kind == 'tank':
                template = next(u for u in candidates if u.get('variant') == ('firefly' if side == 'us' else 'tiger'))
            add(template, side, [14 + (i % 7)*3, y + (i//7)*dy], 'A' if i%7 < 3 else 'B')
        # Fast standard armor complements the slow specialist tank.
        tank = next(u for u in pool if u['side'] == side and u['kind'] == 'tank' and not u.get('variant'))
        add(tank, side, [26, y+2*dy], 'B')
        for i, kind in enumerate(('carrier', 'battleship', 'cruiser', 'destroyer')):
            add(next(u for u in ships if u['side']==side and u['kind']==kind), side,
                [2+i*2, y], 'SEA')
        craft = add(unit(side, 'landing_craft', [11,y], 'SEA', 1, hp=5,max_hp=5,
                         base_ap=3,range=0,armor=0,smoke=2,grenades=0,personnel=3), side, [11,y], 'SEA')
        passenger = add(next(u for u in pool if u['side']==side and u['kind']=='engineer'), side, [11,y], 'SEA')
        passenger['carrier_id'] = craft['id']
        add(next(u for u in pool if u['side']==side and u['kind']=='amphibious'), side, [10,y-1 if side=='us' else y+1], 'SEA')
        for i, kind in enumerate(('fighter', 'fighter', 'bomber', 'aa_gun', 'radar', 'airfield')):
            # Britain has no Allied bomber / Axis radar template; retain role stats,
            # then apply the coalition seat and its existing fighter AP asymmetry.
            template = next(u for u in planes if u['kind']==kind and (u['side']==side or kind in {'bomber','aa_gun','radar'}))
            pos = [20+i*3, y] if i < 3 else [17+(i-3)*6, y+3*dy]
            changes = dict(faction='gb' if side=='us' else 'de')
            if kind=='fighter':changes['base_ap']=4 if side=='us' else 3
            add(template, side, pos, 'AIR', **changes)
    # Finite, commander-delivered airborne reserves. Axis has no paratroopers.
    for i in range(2):
        u=add(next(u for u in pool if u.get('airlift_reserve')), 'us', [34+i,31], 'R')
        u.update(reserve=True,airlift_reserve=True)
    return result


def scenario(build):
    w,h=36,32
    rows=[['~' if x<=11 else 's' if x==12 else '.' for x in range(w)] for _ in range(h)]
    for y in range(9,23):
        for x in range(13,w):
            if (x*7+y*11)%29<4:rows[y][x]='T'
            if x>=31 and (x+y)%4:rows[y][x]='M'
            if 19<=x<=28 and 11<=y<=20 and (x+y)%3==0:rows[y][x]='B'
    for y in (10,21):
        for x in range(13,35):rows[y][x]='='
    for y in range(h):
        for x in (17,26):rows[y][x]='='
    for x in range(13,w):rows[16][x]='~'
    for x in (17,26):rows[16][x]='+'
    for x,y in ((21,13),(29,19)):rows[y][x]='^'
    for x,y in ((14,13),(14,19)):rows[y][x]='k'
    for x in (19,20,22,23):rows[11][x]='h';rows[20][x]='h'
    rows[16][13]='c';rows[14][26]='*'
    board=build('fubar','Fubar','Joint-operations objectives',36,
        'Everything on one battlefield. A fictional Allied–Axis coalition sandbox: fleets, landing craft, armor, specialist infantry and a separate aircraft layer. Hold the sea zone with ships or the two land flags with infantry. Each uncontested flag earns 1 point at the end of your turn; first to 10 wins. After round 36, higher score wins (Axis wins a tie). Aircraft cannot capture flags.',
        [''.join(r) for r in rows])
    board.update(dsl_only=True,campaign='fubar',joint_ops=True,signals=True,airborne=True,playtest=True,
        theater='JOINT OPERATIONS · FICTIONAL SANDBOX',summary='Every unit class · air / surface layers · three objectives',
        historical_note='Deliberately ahistorical coalition equipment showcase, not a reenactment. Unit profiles are shared with the existing theaters; this large mixed roster needs playtesting.',
        factions={'us':'Allied coalition','de':'Axis coalition'},
        joint_objectives=[dict(id='sea',name='Sea lane',pos=[5,16],domain='sea',radius=1),
                          dict(id='coast',name='Harbor causeway',pos=[13,16],domain='land',radius=0),
                          dict(id='town',name='Town junction',pos=[26,14],domain='land',radius=0)],
        platoons=[dict(id='A',name='Assault group',center=17),dict(id='B',name='Inland group',center=29),
                  dict(id='SEA',name='Fleet & landing force',center=6),dict(id='AIR',name='Air wing & stations',center=23),dict(id='R',name='Airborne reserve',center=34)],
        doctrine={'us':'Fast fighters, a Firefly, commandos and two finite airborne reserves. Radio teams share reports; use carriers to scout the coast.',
                  'de':'Tiger armor, Flak, specialists and longer-reaching Japanese torpedoes. Ships, ground troops and aircraft each have a distinct job.'},
        reinforcement_brief='Allies have two commander-directed airborne reserve squads. No automatic reinforcements. Neither side wins simply by destroying one carrier, bomber or airfield.')
    return board


def initialize(state):
    if not state['battlefield'].get('joint_ops'):return state
    state.update(joint_ops_version=1,joint_score={'us':0,'de':0},recon=[])
    state['log']=['Fubar · '+state['battlefield']['brief']]
    for u in state['units']:
        if u['kind']=='flak':u.setdefault('weapon_overrides',{})['flak']={'damage':1,'label':'20 mm anti-aircraft burst'}
        if u['kind']=='aa_gun':u['aa_radius']=u['range']
    return state


def controls(state):
    from .engine import distance
    from .visibility import active
    from .combined import INFANTRY
    result=[]
    for point in state['battlefield']['joint_objectives']:
        sides={u['side'] for u in state['units'] if active(u) and not u.get('afloat')
               and (u['kind'] in domains.SHIPS if point['domain']=='sea' else u['kind'] in INFANTRY)
               and distance(u['pos'],point['pos'])<=point['radius']}
        result.append(dict(point,owner=next(iter(sides)) if len(sides)==1 else None,contested=len(sides)>1))
    return result


def end_turn(state, side):
    state['joint_score'][side]+=sum(p['owner']==side for p in controls(state))
    if state['joint_score'][side]>=10:state['winner']=side
    if side=='de':
        if state['round']>=state['battlefield']['rounds'] and not state['winner']:
            state['winner']=max(('us','de'),key=lambda s:(state['joint_score'][s],s=='de'))
        elif not state['winner']:state['round']+=1


def ground_goal(state, unit):
    from .engine import distance
    points=[p for p in controls(state) if p['domain']=='land']
    available=[p for p in points if p['owner']!=unit['side'] or p['pos']==unit['pos']]
    return min(available or points,key=lambda p:distance(unit['pos'],p['pos']))['pos']


def domain_choices(state, unit, legal, observed, visited):
    """Bounded air / fleet AI using only observed units and public objectives."""
    from .engine import distance
    from . import weapons
    side=unit['side'];choices=list(weapons.ai_orders(state,unit,legal,observed))
    enemies=[u for u in observed if u['side']!=side and u['hp']>0 and not u.get('reserve') and not u.get('carrier_id')]
    def add(score,kind,**data):choices.append((score,dict(kind=kind,unit=unit['id'],**data)))
    if legal['rally']:add(12,'rally')
    for key,kind in [('targets','fire'),('airstrikes','airstrike'),('torpedoes','torpedo')]:
        for shot in legal.get(key,[]):
            if shot.get('damage',0) and shot['threshold']<=6:
                add(12+(7-shot['threshold'])*shot['damage'],kind,target=shot['id'])
    if legal.get('rearm'):add(25 if unit['kind']=='bomber' and not unit['bombs'] else 9,'rearm')
    if legal.get('repair'):add(8+min(unit['repair_amount'],unit['max_hp']-unit['hp'])*2,'repair')
    if legal.get('recon') and not any(r['side']==side for r in state.get('recon',[])):
        add(7,'recon',pos=min(legal['recon'],key=lambda p:distance(p,[12,16])))
    if legal.get('overwatch'):add(5 if enemies else 1,'overwatch')
    if domains.is_air(unit):
        targets=[u['pos'] for u in enemies if (domains.is_air(u) if unit['kind']=='fighter' else weapons.damage(unit,u))]
        if unit['kind']=='bomber' and not unit['bombs']:
            targets=[u['pos'] for u in observed if u['side']==side and u['kind']=='airfield' and u['hp']>0]
        goals=targets or [p['pos'] for p in state['battlefield']['joint_objectives']]
        goal=min(goals,key=lambda p:distance(unit['pos'],p))
        for move in legal['moves']:
            if tuple(move['pos']) in visited.get(unit['id'],set()):continue
            gain=distance(unit['pos'],goal)-distance(move['pos'],goal)
            add(2+gain*3-move.get('threats',0)*2-(10 if distance(unit['pos'],goal)<=1 else 0),'move',pos=move['pos'])
    elif unit['kind'] in domains.SHIPS:
        # Fubar's open ocean flank has no islands blocking the approach.
        goal=next(p['pos'] for p in state['battlefield']['joint_objectives'] if p['domain']=='sea')
        for move in legal['moves']:
            if tuple(move['pos']) in visited.get(unit['id'],set()):continue
            gap=distance(unit['pos'],goal);dest=distance(move['pos'],goal)
            add(2+(gap-dest)*2-move.get('threats',0)*2-(8 if gap<=1 else 0)-(6 if unit['kind']=='carrier' and dest<5 else 0),'move',pos=move['pos'])
    return choices
