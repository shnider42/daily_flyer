"""Fictional DSL naval sandbox; the two persistent player seats remain us/de.

Faction identity is saved separately: Midway's second seat commands Japan.
"""
from .coordinates import column
import copy
import secrets
from .rulesets import base_ap, bank_limit
from .visibility import active, visible_ids, update_intel, record_reports
from .combat_display import record_combat
from .effects import record_effect
from . import weapons, operations, domains

SHIPS={'battleship','carrier','cruiser','destroyer'}
FACTIONS={'us':'Americans','de':'Japanese'}


def initial(board, rules):
    units=[]
    for side in ('us','de'):
        us=side=='us'
        for group,cx in [('A',6),('B',19)]:
            layout=[('carrier',0,3),('battleship',0,5),('cruiser',-2,5),('cruiser',2,5),
                    ('destroyer',-2,7),('destroyer',0,7),('destroyer',2,7)]
            for number,(kind,dx,depth) in enumerate(layout,1):
                hp,reach,ap,damage={'carrier':(6,3,3,1),'battleship':(8,9 if us else 10,2,3),
                                    'cruiser':(5,6,3,2),'destroyer':(3,4,4 if us else 3,1)}[kind]
                units.append(dict(id=f'{side}{len(units)%14}',side=side,faction='us' if us else 'jp',kind=kind,
                                  pos=[cx+dx,board['height']-1-depth if us else depth],hp=hp,max_hp=hp,
                                  range=reach,ap=ap,base_ap=ap,gun_damage=damage,sight=(9 if us else 8) if kind=='cruiser' else 7,
                                  armor=int(kind=='battleship'),pinned=False,entrenched=False,overwatch=False,
                                  smoke=2 if kind=='destroyer' else 0,grenades=0,platoon=group,number=number,
                                  torpedoes=(2 if us else 3) if kind=='destroyer' else 0,
                                  torpedo_range=3 if us else 5,torpedo_damage=3 if us else 4,
                                  strike_range=12 if us else 14,strike_damage=2 if us else 3,
                                  recon_range=16 if us else 14,repair_amount=2 if us else 1,repairs=2,
                                  air_used=False,recon_used=False,torpedo_used=False,repair_used=False,
                                  ap_received=ap,banked_ap=0,carried_ap=0,road_pending=False,road_used=False))
    if board.get('island_objectives'):
        for side in ('us','de'):
            for group,cx in [('A',6),('B',19)]:
                for number,dx in [(8,-1),(9,1)]:
                    template=copy.deepcopy(next(u for u in units if u['side']==side and u['kind']=='destroyer'))
                    template.update(id=f'{side}_landing_{group}{number}',kind='amphibious',platoon=group,number=number,
                        pos=[cx+dx,21 if side=='us' else 8],hp=4,max_hp=4,range=2,ap=3,base_ap=3,
                        ap_received=3,gun_damage=1,sight=5,armor=0,torpedoes=0,smoke=1,repairs=0)
                    units.append(template)
    s=dict(ruleset='dsl',ruleset_version=rules['version'],naval_version=1,factions=FACTIONS.copy(),
           units=units,turn='us',round=1,hold=0,winner=None,rules_version=4,smoke=[],barrages=[],support={'us':0,'de':0},
           battlefield=board,battle_number=1,victories={'us':0,'de':0},sea_score={'us':0,'de':0},recon=[],
           revision=0,ready=False,fog_of_war=True,log=['Midway · fictional naval sandbox. Sink both enemy carriers or earn 6 sea-control points.'])
    update_intel(s)
    return s


def navigable(tile):
    return tile in {'water','objective'}


def passable(unit,tile):
    return unit['kind']=='amphibious' or navigable(tile)


def options(state, unit):
    from . import buildings
    from .engine import distance,line_clear,terrain
    result=dict(moves=[],targets=[],rally=False,smoke=[],dig=False,assaults=[],overwatch=False,
                grenades=[],suppress=[],inspire=[],barrage=[],command=[],drops=[],airstrikes=[],torpedoes=[],recon=[],repair=False,
                ammo=[],repair_tracks=False,bombard=[])
    if not state['ready'] or state['winner'] or not active(unit) or unit['side']!=state['turn']:
        return result
    result.update(weapons.orders(state, unit))
    if weapons.enabled(state) and unit.get('pinned'):
        result['rally'] = unit['ap'] >= 1
        return result
    from .visibility import unit_visible_ids
    board=state['battlefield'];seen=unit_visible_ids(state,unit) if domains.joint(state) else visible_ids(state,unit['side'])
    living=[u for u in state['units'] if active(u)]
    occupied={tuple(u['pos']) for u in living if u['id'] in seen and domains.blocks(state,unit,u)}
    if unit['ap']>=1:
        for y in range(max(0,unit['pos'][1]-1),min(board['height'],unit['pos'][1]+2)):
            for x in range(max(0,unit['pos'][0]-1),min(board['width'],unit['pos'][0]+2)):
                tile=terrain(x,y,state)
                cost=2 if unit['kind']=='amphibious' and tile in {'woods','building','tower'} else 1
                if distance(unit['pos'],[x,y])==1 and passable(unit,tile) and buildings.enterable(state,[x,y],unit['side']) and unit['ap']>=cost and (x,y) not in occupied and not (weapons.enabled(state) and unit.get('immobilized')):
                    from .engine import preview_threats
                    result['moves'].append(dict(pos=[x,y],cost=cost,threats=preview_threats(state,unit,[x,y],seen) if domains.joint(state) else 0))
        if unit.get('smoke') and not any(s['pos']==unit['pos'] for s in state['smoke']):
            result['smoke']=[list(unit['pos'])]
        if unit['kind']=='carrier' and not unit['recon_used']:
            result['recon']=[[x,y] for y in range(board['height']) for x in range(board['width'])
                             if distance(unit['pos'],[x,y])<=unit['recon_range'] and navigable(terrain(x,y,state))]
    if unit['ap']<2:
        return result
    result['repair']=unit['hp']<unit.get('max_hp',unit['hp']) and unit.get('repairs',0)>0 and not unit.get('repair_used')
    for target in living:
        if target['side']==unit['side'] or target['id'] not in seen:
            continue
        gap=distance(unit['pos'],target['pos'])
        clear=line_clear(unit['pos'],target['pos'],state['smoke'],state)
        if gap<=unit['range'] and clear:
            mods=dict(distance=int(gap>5),evasion=int(target['kind']=='destroyer'),cover=buildings.cover(state,target['pos'],objective=False))
            if weapons.enabled(state):
                if weapons.damage(unit, target): result['targets'].append(dict(weapons.preview(unit, target, 4+sum(mods.values()), mods, state=state), naval=True))
            else:
                result['targets'].append(dict(id=target['id'],threshold=4+sum(mods.values()),modifiers=mods,
                                              damage=max(1,unit['gun_damage']-target['armor']),naval=True))
        from .engine import line_cells
        water_route=not domains.joint(state) or all(navigable(terrain(x,y,state)) for x,y in line_cells(tuple(unit['pos']),tuple(target['pos'])))
        if unit['kind']=='destroyer' and target['kind'] in SHIPS and unit['torpedoes']>0 and not unit['torpedo_used'] and gap<=unit['torpedo_range'] and clear and water_route:
            result['torpedoes'].append(dict(id=target['id'],threshold=4,damage=unit['torpedo_damage']))
        if unit['kind']=='carrier' and not unit['air_used'] and gap<=unit['strike_range'] and (not domains.joint(state) or weapons.damage(unit,target,'airstrike')):
            # Only observed escorts affect the preview; nearby water contacts are normally spotted together.
            escort=any(u['kind']=='cruiser' and u['side']==target['side'] and u['id'] in seen and distance(u['pos'],target['pos'])<=2 for u in living)
            result['airstrikes'].append(dict(id=target['id'],threshold=(3 if unit['side']=='us' else 4)+int(escort),
                                            damage=unit['strike_damage'],aa=int(escort)))
    if weapons.enabled(state):
        for key, weapon in [('torpedoes', 'torpedo'), ('airstrikes', 'airstrike')]:
            result[key] = [dict(s, **{k:v for k,v in weapons.preview(unit, next(t for t in living if t['id']==s['id']), s['threshold'], weapon=weapon, state=state).items()})
                           for s in result[key]]
    return result


def unit_order(state, unit, action, legal, roll, before=None):
    """Resolve one validated order in-place; the caller owns turns and victory."""
    kind=action.get('kind');side=unit['side'];names=state.get('factions', {})
    if kind in {'load_ammo', 'repair_tracks', 'bombard', 'artillery', 'field_recon'} | operations.ORDER_KINDS:
        message = weapons.action(state, unit, action, legal, roll)
    elif kind == 'rally' and legal['rally']:
        unit['pinned']=False;unit['ap']-=1;message='Infantry rallied · 1 AP.'
    elif kind=='move' and any(m['pos']==action.get('pos') for m in legal['moves']):
        from .buildings import enterable
        if not enterable(state, action['pos']):
            raise ValueError('That building has collapsed. Choose another route.')
        if domains.joint(state) and any(active(u) and domains.blocks(state,unit,u) and u['pos']==action['pos'] for u in state['units']):
            raise ValueError('Movement blocked by a contact. Scout or choose another approach.')
        cost=next(m['cost'] for m in legal['moves'] if m['pos']==action['pos'])
        unit['pos']=list(action['pos']);unit['ap']-=cost
        message=f"{names.get(side, FACTIONS[side])} {unit['kind']} moved to {column(unit['pos'][0])}{unit['pos'][1]+1}."
    elif kind=='recon' and action.get('pos') in legal['recon']:
        unit['ap']-=1;unit['recon_used']=True
        from .signals import alert
        alert(state,side,action['pos'],'recon')
        state['recon'].append(dict(side=side,pos=list(action['pos']),radius=3,ttl=2))
        message='Scout aircraft reported contacts within 3 hexes of the search point. Reports expire after the enemy turn.'
    elif kind=='repair' and legal['repair']:
        amount=min(unit['repair_amount'],unit['max_hp']-unit['hp'])
        unit['hp']+=amount;unit['ap']-=2;unit['repairs']-=1;unit['repair_used']=True
        message=f"{names.get(side, FACTIONS[side])} {unit['kind']} damage control restored {amount} hull."
    elif kind=='smoke' and action.get('pos') in legal['smoke']:
        unit['ap']-=1;unit['smoke']-=1;state['smoke'].append(dict(pos=list(unit['pos']),ttl=2))
        record_effect(state,'smoke',[unit['pos']]);message='Unit laid a smoke screen. It blocks surface sight, guns and torpedoes.'
    elif kind in {'fire','airstrike','torpedo'}:
        key={'fire':'targets','airstrike':'airstrikes','torpedo':'torpedoes'}[kind]
        shot=next((s for s in legal[key] if s['id']==action.get('target')),None)
        if shot is None:raise ValueError('No legal naval attack: check sight, range, AP and weapon readiness.')
        target=next(u for u in state['units'] if u['id']==shot['id']);die=roll();unit['ap']-=2
        if kind=='airstrike':unit['air_used']=True
        if kind=='torpedo':unit['torpedo_used']=True;unit['torpedoes']-=1
        impacts = []
        if weapons.enabled(state):
            result, impacts = weapons.resolve(state, unit, target, die, shot['threshold'], shot['weapon'])
        else:
            if die>=shot['threshold']:target['hp']=max(0,target['hp']-shot['damage'])
            result='sunk' if not target['hp'] else f"hit for {shot['damage']} hull" if die>=shot['threshold'] else 'missed'
        message=f"{names.get(side, FACTIONS[side])} {unit['kind']} {kind}: rolled {die}, needed {shot['threshold']}+. Target {result}."
        state['last_combat']=dict(kind={'fire':'Naval guns','airstrike':'Air strike','torpedo':'Torpedoes'}[kind],
             roll=die,threshold=shot['threshold'],result=result,attacker=unit['id'],target=target['id'],impacts=impacts,revision=state['revision']+1)
        record_combat(state,shot.get('modifiers'),shot.get('effect_text',f"{shot['damage']} hull on a hit. Ships do not suffer infantry pins.")+(' Cruiser AA cover adds +1.' if shot.get('aa') else ''))
        record_effect(state,'explosion',[target['pos']])
    else:raise ValueError('That naval order is unavailable.')
    return message


def apply(state,side,action,roll=None):
    from .engine import distance
    state=copy.deepcopy(state);roll=roll or (lambda:secrets.randbelow(6)+1)
    before={team:visible_ids(state,team) for team in ('us','de')};kind=action.get('kind');action_round=state['round']
    if kind=='end':
        operations.end_turn(state)
        from .support import resolve_barrages
        resolve_barrages(state, FACTIONS, roll)
        zone=state['battlefield']['objective']
        holders={u['side'] for u in state['units'] if active(u) and distance(u['pos'],zone)<=2}
        if holders=={side}:state['sea_score'][side]+=1
        for point in state['battlefield'].get('island_objectives',[]):
            if any(active(u) and u['side']==side and u['kind']=='amphibious' and u['pos']==point for u in state['units']):
                state['sea_score'][side]+=1
        state['smoke']=[dict(s,ttl=s['ttl']-1) for s in state['smoke'] if s['ttl']>1]
        state['recon']=[dict(s,ttl=s['ttl']-1) for s in state['recon'] if s['ttl']>1]
        other='de' if side=='us' else 'us';state['turn']=other
        if side=='de':state['round']+=1
        for u in state['units']:
            if u['side']==side:u['banked_ap']=min(u['ap'],bank_limit(u)) if active(u) else 0
            else:
                carried=u.get('banked_ap',0);u.update(ap=base_ap(u)+carried,ap_received=base_ap(u)+carried,
                    carried_ap=carried,banked_ap=0,air_used=False,recon_used=False,torpedo_used=False,repair_used=False)
        message=f"{FACTIONS[side]} ended their turn. Sea control {state['sea_score'][side]}/6."
    else:
        unit=next((u for u in state['units'] if u['id']==action.get('unit') and u['side']==side and active(u)),None)
        if unit is None:raise ValueError('Choose one of your surviving units.')
        legal=options(state,unit)
        message=unit_order(state,unit,action,legal,roll,before)
    for team in ('us','de'):
        if not any(active(u) and u['side']==team and u['kind']=='carrier' for u in state['units']):
            state['winner']='de' if team=='us' else 'us'
        if state['sea_score'][team]>=6:state['winner']=team
    if not state['winner'] and state['round']>state['battlefield']['rounds']:
        # Public tie-break: sea control, then surviving hull, then Japanese defense.
        state['winner']=max(('us','de'),key=lambda team:(state['sea_score'][team],sum(u['hp'] for u in state['units'] if u['side']==team),team=='de'))
        state['round']=state['battlefield']['rounds']
    if state['winner']:
        state['victories'][state['winner']]+=1;message+=f" {FACTIONS[state['winner']]} win."
    state['log'].append(message);state['revision']+=1
    update_intel(state);record_reports(state,before,action,message)
    state.setdefault('action_history',[]).append(dict(revision=state['revision'],round=action_round,side=side,
        action={k:copy.deepcopy(action[k]) for k in ('kind','unit','target','pos','ammo') if k in action}))
    return state


def choose_order(state,costs,visited):
    from . import computer_policy
    from .engine import distance
    seen=visible_ids(state,state['turn']);units={u['id']:u for u in state['units'] if active(u) and u['id'] in seen}
    choices=[];goal=state['battlefield']['objective']
    def add(score,u,kind,**data):choices.append((score,dict(kind=kind,unit=u['id'],**data)))
    for u in units.values():
        if u['side']!=state['turn'] or not computer_policy.eligible(state,u):continue
        legal=options(state,u)
        choices.extend(weapons.ai_orders(state, u, legal, units.values()))
        if legal['rally']: add(10, u, 'rally')
        for key,kind in [('targets','fire'),('airstrikes','airstrike'),('torpedoes','torpedo')]:
            for shot in legal[key]:
                target=units[shot['id']]
                risk = sum(6 for friend in units.values() if friend['side']==u['side'] and distance(friend['pos'],target['pos'])<=1 and weapons.protection(friend)=='infantry') if weapons.enabled(state) and weapons.profile(u, shot.get('weapon')).get('splash') else 0
                add(5+(7-shot['threshold'])/6*shot['damage']*3+(3 if target['kind']=='carrier' else 0)+(2 if target['hp']<=shot['damage'] else 0)-risk,u,kind,target=target['id'])
        if legal['repair']:add(4+min(u['repair_amount'],u['max_hp']-u['hp'])*2,u,'repair')
        if legal['recon']:
            # Search along the approach, using only known terrain and contacts.
            enemies=[v for v in units.values() if v['side']!=u['side']]
            desired=min(enemies,key=lambda v:distance(u['pos'],v['pos']))['pos'] if enemies else [goal[0],min(state['battlefield']['height']-1,goal[1]+(4 if u['side']=='de' else -4))]
            point=min(legal['recon'],key=lambda p:distance(p,desired))
            covered=any(r['side']==u['side'] and distance(r['pos'],point)<=2 for r in state['recon'])
            if not covered:add(8,u,'recon',pos=point)
        for move in legal['moves']:
            pos=move['pos']
            if tuple(pos) in visited.get(u['id'],set()):continue
            goal_for_unit=goal
            if u['kind']=='amphibious' and state['battlefield'].get('island_objectives'):
                points=state['battlefield']['island_objectives']
                available=[p for p in points if not any(v['side']==u['side'] and v['id']!=u['id'] and v['pos']==p for v in units.values())]
                goal_for_unit=min(available or points,key=lambda p:distance(u['pos'],p))
            gain=(distance(u['pos'],goal_for_unit)-distance(pos,goal_for_unit)) if u['kind']=='amphibious' else costs.get(tuple(u['pos']),100)-costs.get(tuple(pos),100)
            score=2+gain*2
            if (u['kind']=='amphibious' and u['pos']==goal_for_unit) or (u['kind']!='amphibious' and distance(u['pos'],goal)<=2):score-=7
            if u['kind']=='carrier' and distance(pos,goal)<6:score-=6
            add(score,u,'move',pos=pos)
        if legal['smoke'] and u['hp']<=2 and any(v['side']!=u['side'] and distance(v['pos'],u['pos'])<=6 for v in units.values()):
            add(6,u,'smoke',pos=list(u['pos']))
    return computer_policy.choose(state, choices, 1.5)
