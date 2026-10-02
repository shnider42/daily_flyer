"""Versioned air playtest, isolated from existing land and Midway rules.

Aircraft use short, swept flight legs. Air spotting ignores ground cover; radar
spots aircraft only. The two persistent seat IDs remain us/de, not faction names.
"""
import copy
import secrets
from .visibility import active, update_intel, record_reports
from .combat_display import record_combat
from .effects import record_effect
from . import weapons, operations, domains

AIRCRAFT = {'fighter','bomber'}


def initial(board, rules):
    units=[]
    layouts={
        'us':[('fighter',3,5),('fighter',7,5),('fighter',14,5),('fighter',18,5),
              ('aa_gun',6,5),('aa_gun',15,5),('radar',10,2),('airfield',5,3),('airfield',16,3)],
        'de':[('fighter',4,12),('fighter',11,12),('fighter',17,12),
              ('bomber',6,14),('bomber',11,14),('bomber',16,14),('airfield',4,15),('airfield',17,15)]}
    for side,layout in layouts.items():
        counts={}
        for i,(kind,x,y) in enumerate(layout):
            hp,ap,reach,sight={'fighter':(3,4 if side=='us' else 3,3,6),'bomber':(4,3,1,4),
                                'aa_gun':(3,2,5,6),'radar':(3,0,0,10),'airfield':(4,0,0,2)}[kind]
            group='A' if kind in AIRCRAFT else 'HQ';counts[group]=counts.get(group,0)+1
            units.append(dict(id=f'{side}{i}',side=side,kind=kind,faction='uk' if side=='us' else 'de',
                pos=[x,y],hp=hp,max_hp=hp,ap=ap,base_ap=ap,ap_received=ap,range=reach,sight=sight,
                flight=3 if kind=='fighter' else 2,platoon=group,number=counts[group],
                pinned=False,entrenched=False,overwatch=kind=='aa_gun',armor=0,smoke=0,grenades=0,
                banked_ap=0,carried_ap=0,road_pending=False,road_used=False,
                bombs=2 if kind=='bomber' else 0,rearm_used=False))
    state=dict(ruleset='dsl',ruleset_version=rules['version'],rules_version=4,air_version=1,
        factions=board['factions'].copy(),units=units,battlefield=board,turn='us',round=1,hold=0,winner=None,
        ready=False,revision=0,battle_number=1,victories={'us':0,'de':0},smoke=[],barrages=[],support={'us':0,'de':0},
        fog_of_war=True,raid_destroyed=[],log=['Air playtest: RAF defend the sector stations. Luftwaffe must destroy both before round 18 ends. Destroy every bomber to win as RAF.'])
    update_intel(state)
    return state


def sees_hex(state,side,pos,ground=False):
    from .engine import distance
    if any(r['side']==side and distance(r['pos'],pos)<=r['radius'] for r in state.get('recon', [])): return True
    for u in state['units']:
        if u['side']!=side or not active(u):continue
        reach=(4 if u['kind'] in AIRCRAFT else 0 if u['kind']=='radar' else 2) if ground else u['sight']
        if distance(u['pos'],pos)<=reach:return True
    return False


def visible_ids(state,side):
    if domains.joint(state):
        from .visibility import visible_ids as joint_ids
        return joint_ids(state,side)
    return {u['id'] for u in state['units'] if u['side']==side or
            (active(u) and (not state.get('fog_of_war') or sees_hex(state,side,u['pos'],u['kind'] not in AIRCRAFT)))}


def flight_path(start,end):
    """Deterministic adjacent cells, including destination, excluding departure."""
    from .engine import cube,distance
    n=distance(start,end)
    if not n:return []
    a,b=cube(start),cube(end);result=[]
    for i in range(1,n+1):
        p=[a[j]+(b[j]-a[j])*i/n+(1e-6 if j<2 else -2e-6) for j in range(3)]
        r=[round(v) for v in p];k=max(range(3),key=lambda j:abs(r[j]-p[j]));r[k]=-sum(r[j] for j in range(3) if j!=k)
        y=r[2];result.append([r[0]+(y-(y&1))//2,y])
    return result


def watchers(state,mover,pos):
    from .engine import distance
    if mover['kind'] not in AIRCRAFT:return []
    return [u for u in state['units'] if active(u) and u['side']!=mover['side'] and u['overwatch'] and not u.get('pinned')
            and (u['kind'] in {'fighter','aa_gun'} or domains.joint(state) and u['kind']=='flak')
            and distance(u['pos'],pos)<= (u.get('aa_radius',u['range']) if u['kind']=='flak' else u['range'])
            and (joint_air_sight(state,u,pos) if domains.joint(state) else sees_hex(state,u['side'],pos))]


def joint_air_sight(state,unit,pos):
    from .visibility import sees_hex
    from . import signals
    return signals.group_sees(state,unit['side'],signals.group(unit),pos,'air') if signals.enabled(state) else sees_hex(state,unit['side'],pos,'air')


def shot(unit,target,reaction=False):
    if unit['kind']=='bomber':
        return dict(id=target['id'],threshold=3,damage=2,air=True,modifiers={'bombing':-1})
    threshold=4+int(target['kind']=='fighter')+int(reaction and unit['kind']=='fighter')
    return dict(id=target['id'],threshold=min(6,threshold),damage=2 if unit['kind']=='aa_gun' else 1,air=True,
                modifiers=dict(evasion=int(target['kind']=='fighter'),reaction=int(reaction and unit['kind']=='fighter')))


def options(state,unit):
    from .engine import distance
    result=dict(moves=[],targets=[],rally=False,smoke=[],dig=False,assaults=[],overwatch=False,
                grenades=[],suppress=[],inspire=[],barrage=[],command=[],drops=[],load=[],unload=[],rearm=False,
                ammo=[],repair_tracks=False,bombard=[])
    if not state['ready'] or state['winner'] or not active(unit) or unit['side']!=state['turn']:
        return result
    result.update(weapons.orders(state, unit))
    if weapons.enabled(state) and unit.get('pinned'):
        result['rally'] = unit['ap'] >= 1
        return result
    from .visibility import unit_visible_ids
    seen=unit_visible_ids(state,unit) if domains.joint(state) else visible_ids(state,unit['side']);board=state['battlefield']
    living=[u for u in state['units'] if active(u)]
    occupied={tuple(u['pos']) for u in living if u['id'] in seen and domains.blocks(state,unit,u)}
    planes={tuple(u['pos']) for u in living if u['id'] in seen and u['kind'] in AIRCRAFT and u['id']!=unit['id']}
    if unit['kind'] in AIRCRAFT and unit['ap']>=1:
        reach=unit['flight']
        for y in range(max(0,unit['pos'][1]-reach),min(board['height'],unit['pos'][1]+reach+1)):
            for x in range(max(0,unit['pos'][0]-reach),min(board['width'],unit['pos'][0]+reach+1)):
                if not 0<distance(unit['pos'],[x,y])<=reach or (x,y) in occupied:continue
                path=flight_path(unit['pos'],[x,y])
                if any(tuple(p) in planes or not (0<=p[0]<board['width'] and 0<=p[1]<board['height']) for p in path):continue
                # Do not disclose an observed enemy's secret overwatch state.
                threats={w['id'] for p in path for w in (living if domains.joint(state) else watchers(state,unit,p))
                         if w['id'] in seen and (not domains.joint(state) or w['side']!=unit['side'] and
                         w['kind'] in {'fighter','aa_gun','flak'} and distance(w['pos'],p)<=w.get('aa_radius',w['range']))}
                result['moves'].append(dict(pos=[x,y],cost=1,threats=len(threats),path=path))
    if unit['ap']<2:return result
    result['overwatch']=unit['kind'] in {'fighter','aa_gun'} and not unit['overwatch']
    if unit['kind'] in AIRCRAFT and not unit['rearm_used'] and (unit['hp']<unit['max_hp'] or (unit['kind']=='bomber' and unit['bombs']<2)):
        result['rearm']=any(u['side']==unit['side'] and u['kind']=='airfield' and distance(u['pos'],unit['pos'])<=1 for u in living)
    for target in living:
        if target['side']==unit['side'] or target['id'] not in seen or distance(unit['pos'],target['pos'])>unit['range']:continue
        if ((unit['kind'] in {'fighter','aa_gun'} and target['kind'] in AIRCRAFT) or
            (unit['kind']=='bomber' and unit['bombs']>0 and target['kind'] not in AIRCRAFT)):
            s = shot(unit,target)
            if not weapons.enabled(state) or weapons.damage(unit,target):
                result['targets'].append(dict(weapons.preview(unit, target, s['threshold'], s['modifiers'], state=state), air=True) if weapons.enabled(state) else s)
    return result


def resolve_shot(state,unit,target,roll,reaction=False):
    s=shot(unit,target,reaction);die=roll()
    weapon='flak' if domains.joint(state) and unit['kind']=='flak' else None
    impacts = []
    if weapons.enabled(state):
        s = weapons.preview(unit, target, s['threshold'], s['modifiers'], weapon=weapon, state=state)
        result, impacts = weapons.resolve(state, unit, target, die, s['threshold'],weapon)
    else:
        if die>=s['threshold']:target['hp']=max(0,target['hp']-s['damage'])
        if target['hp']<=0:target['overwatch']=False
        result='destroyed' if not target['hp'] else f"hit for {s['damage']}" if die>=s['threshold'] else 'missed'
    label='AA interception' if reaction and unit['kind'] in {'aa_gun','flak'} else 'Fighter interception' if reaction else 'Bombing run' if unit['kind']=='bomber' else 'Air combat'
    state['last_combat']=dict(kind=label,roll=die,threshold=s['threshold'],result=result,
        attacker=unit['id'],target=target['id'],impacts=impacts,revision=state['revision']+1)
    record_combat(state,s['modifiers'],s.get('effect_text',f"{s['damage']} damage on a hit. Aircraft do not suffer infantry pins."))
    record_effect(state,'explosion',[list(target['pos'])])
    return f'{label}: rolled {die}, needed {s["threshold"]}+. Target {result}.'


def unit_order(state, unit, action, legal, roll, before=None):
    """Resolve one validated order in-place; the caller owns turns and victory."""
    kind=action.get('kind');side=unit['side'];names=state.get('factions', {})
    before=before if before is not None else {}
    if kind in {'load_ammo', 'repair_tracks', 'bombard', 'artillery', 'field_recon'} | operations.ORDER_KINDS:
        message = weapons.action(state, unit, action, legal, roll)
    elif kind == 'rally' and legal['rally']:
        unit['pinned']=False;unit['ap']-=1;message='Gun crew rallied · 1 AP.'
    elif kind=='move':
        move=next((m for m in legal['moves'] if m['pos']==action.get('pos')),None)
        if not move:raise ValueError('Choose a highlighted flight destination.')
        unit['ap']-=1;unit['overwatch']=False;intercepted=False
        for pos in move['path']:
            # Hidden contacts may interrupt a leg, but never create stacked
            # counters or disclose hidden occupancy in legal-move previews.
            blocking=any(active(u) and u['id']!=unit['id'] and u['pos']==pos and
                         (u['kind'] in AIRCRAFT or not domains.joint(state) and pos==move['pos']) for u in state['units'])
            if blocking:break
            unit['pos']=list(pos)
            # A flight can pass through sight and leave it in the same leg.
            # Retain only sightings actually made at each intervening cell.
            for team in before:before[team].update(visible_ids(state,team))
            update_intel(state)
            for shooter in watchers(state,unit,pos):
                if not active(unit):break
                shooter['overwatch']=False;intercepted=True
                resolve_shot(state,shooter,unit,roll,True)
            if not active(unit):break
        message=f'{names[side]} aircraft completed its flight leg.'
        if unit['pos']!=move['pos']:message='Flight interrupted by a contact or interception; 1 AP spent.'
        if intercepted:message+=' Incoming interception fire; see combat report.'
    elif kind=='fire' and any(s['id']==action.get('target') for s in legal['targets']):
        target=next(u for u in state['units'] if u['id']==action['target'])
        unit['ap']-=2;unit['overwatch']=False
        if unit['kind']=='bomber':unit['bombs']-=1
        message=resolve_shot(state,unit,target,roll)
    elif kind=='overwatch' and legal['overwatch']:
        unit['ap']-=2;unit['overwatch']=True
        message='Interception set. One reaction along an enemy flight path, until this unit’s next turn.'
    elif kind=='rearm' and legal['rearm']:
        unit['ap']-=2;unit['rearm_used']=True;unit['hp']=min(unit['max_hp'],unit['hp']+1)
        if unit['kind']=='bomber':unit['bombs']=2
        message='Friendly airfield service: repair 1 strength and reload bomber ordnance. Once per turn.'
    else:raise ValueError('That air order is unavailable. Check aircraft role, sight, AP and range.')
    return message


def apply(state,side,action,roll=None):
    # General ready/winner/side authorization happens in engine.apply.
    state=copy.deepcopy(state);roll=roll or (lambda:secrets.randbelow(6)+1)
    before={team:visible_ids(state,team) for team in ('us','de')};kind=action.get('kind');action_round=state['round']
    names=state['factions']
    if kind=='end':
        operations.end_turn(state)
        from .support import resolve_barrages
        resolve_barrages(state, names, roll)
        state['recon'] = [dict(r, ttl=r['ttl']-1) for r in state.get('recon', []) if r['ttl'] > 1]
        other='de' if side=='us' else 'us'
        state['turn']=other
        if side=='de':state['round']+=1
        for u in state['units']:
            if u['side']==side:u['banked_ap']=min(u['ap'],1) if active(u) and u['base_ap'] else 0
            else:
                carried=u.get('banked_ap',0)
                u.update(ap=u['base_ap']+carried,ap_received=u['base_ap']+carried,
                         carried_ap=carried,banked_ap=0,overwatch=False,rearm_used=False)
        message=f'{names[side]} ended their turn.'
    else:
        unit=next((u for u in state['units'] if u['side']==side and u['id']==action.get('unit') and active(u)),None)
        if unit is None:raise ValueError('Choose one of your surviving aircraft or AA guns.')
        legal=options(state,unit)
        message=unit_order(state,unit,action,legal,roll,before)
    fields=[u for u in state['units'] if u['side']=='us' and u['kind']=='airfield']
    bombers=[u for u in state['units'] if u['side']=='de' and u['kind']=='bomber']
    state['raid_destroyed']=[list(u['pos']) for u in fields if not active(u)]
    if not any(active(u) for u in fields):state['winner']='de'
    elif not any(active(u) for u in bombers) or state['round']>state['battlefield']['rounds']:state['winner']='us'
    if state['winner']:
        state['round']=min(state['round'],state['battlefield']['rounds'])
        state['victories'][state['winner']]+=1;message+=f" {names[state['winner']]} win."
    state['log'].append(message);state['revision']+=1
    update_intel(state);record_reports(state,before,action,message)
    state.setdefault('action_history',[]).append(dict(revision=state['revision'],round=action_round,side=side,
        action={k:copy.deepcopy(action[k]) for k in ('kind','unit','target','pos','ammo') if k in action}))
    return state


def choose_order(state,costs,visited):
    from .engine import distance
    side=state['turn'];seen=visible_ids(state,side)
    units=[u for u in state['units'] if active(u) and u['id'] in seen]
    enemies=[u for u in units if u['side']!=side];choices=[]
    def add(score,u,kind,**kw):choices.append((score,dict(kind=kind,unit=u['id'],**kw)))
    for u in units:
        if u['side']!=side:continue
        legal=options(state,u)
        choices.extend(weapons.ai_orders(state, u, legal, units))
        if legal['rally']:add(12,u,'rally')
        for s in legal['targets']:
            target=next(t for t in enemies if t['id']==s['id'])
            priority=5 if target['kind'] in {'bomber','airfield'} else 1
            add(12+priority+(7-s['threshold'])*s['damage'],u,'fire',target=target['id'])
        if legal['rearm']:add(22 if u['kind']=='bomber' and not u['bombs'] else 8,u,'rearm')
        if u['kind'] in AIRCRAFT:
            if u['kind']=='bomber':
                if not u['bombs']:
                    goals=[v['pos'] for v in units if v['side']==side and v['kind']=='airfield']
                else:
                    # Station locations are mission briefings, not hidden unit data.
                    destroyed={tuple(p) for p in state.get('raid_destroyed',[])}
                    known=[v['pos'] for v in enemies if v['kind']=='airfield']
                    goals=known or [p for p in state['battlefield']['airfields']['us'] if tuple(p) not in destroyed]
            else:
                targets=[v for v in enemies if v['kind'] in AIRCRAFT]
                if targets:
                    goals=[min(targets,key=lambda v:(v['kind']!='bomber',distance(u['pos'],v['pos'])))['pos']]
                elif side=='de':
                    escorts=[v['pos'] for v in units if v['side']==side and v['kind']=='bomber']
                    goals=escorts or [[10,8]]
                else:goals=[[5 if u['number']%2 else 16,8]]
            if not goals:goals=[[10,8]]
            goal=min(goals,key=lambda p:distance(u['pos'],p))
            for move in legal['moves']:
                if tuple(move['pos']) in visited.get(u['id'],set()):continue
                gain=distance(u['pos'],goal)-distance(move['pos'],goal)
                score=2+gain*3-move['threats']*2
                if distance(u['pos'],goal)<=1:score-=12
                add(score,u,'move',pos=move['pos'])
        if legal['overwatch']:
            nearby=any(v['kind'] in AIRCRAFT and distance(u['pos'],v['pos'])<=u['range']+3 for v in enemies)
            add(8 if nearby else 1,u,'overwatch')
    if not choices:return dict(kind='end')
    score,action=max(choices,key=lambda p:p[0]);return action if score>1.5 else dict(kind='end')
