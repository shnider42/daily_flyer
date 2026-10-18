"""Saved, opt-in infantry roles for compact 2.0 playtests.

Capabilities belong to the unit snapshot. The same list gates legal previews,
execution and client discovery. Original maps and saved armies keep their rules.
"""
VERSION=1
IDS={'village_2','stonebridge_2'}
ORDER_FIELDS={'move':'moves','fire':'targets','rally':'rally','smoke':'smoke',
    'grenade':'grenades','assault':'assaults','suppress':'suppress','dig':'dig',
    'overwatch':'overwatch','inspire':'inspire','command':'command','barrage':'barrage',
    'artillery':'artillery','field_recon':'field_recon','observe':'observe',
    'spot_fire':'spot_fire','radio_update':'radio_update','conceal':'conceal',
    'area_fire':'area_fire','mortar_fire':'mortar_fire','snipe':'snipe',
    'repair_tank':'repair_tank','repair_tracks':'repair_tracks','demolition':'demolition',
    'breach':'breach','clear_wreck':'clear_wreck','bridge_gap':'bridge_gap',
    'bombard':'bombard','load_ammo':'ammo','drop':'drops','load':'load','unload':'unload'}


def scenarios(build):
    village=build('village_2','Village Crossing 2.0','Village square',10,
        'Compact role playtest · 9×11 · 8 units per army. Americans cross the village approaches and hold the square for two consecutive own-turn endings. Germans hold out through round 10. Rifle teams carry frags, scouts carry smoke, and officers rally and coordinate. The German MG 42 pins infantry at 2–6 hexes, with base sight 4, but cannot make damaging attacks or overwatch. Units without self-rally recover after a full own turn spent pinned.',[
        '....=....','....=....','.TT.=.TT.','.T.B=B.T.',
        '====*====','.T.B=B.T.','.TT.=.TT.','....=....',
        '.T..=..T.','....=....','....=....'])
    bridge=build('stonebridge_2','Stonebridge 2.0','North-bank depot',12,
        'Compact role playtest · 11×13 · 9 units per army. Two bridges cross the river; engineers can create a third crossing with their one bridge kit. Americans must hold the north-bank depot for two consecutive own-turn endings; Germans hold out through round 12. Coordinate two specialist platoons and a major. MG 42 support pins at 2–6 hexes; officers restore pinned teams sooner than their end-turn recovery.',[
        '...=....=..','.T.=..T.=..','..B=...B=..','===B=*B====',
        '.T.=.T..=T.','...=....=..','~~~+~~~~+~~','...=....=..',
        '.T.=..T.=T.','===========','...=....=..','...=....=..','...=....=..'])
    for b in (village,bridge):
        b.update(dsl_only=True,campaign=b['id'],ground_roles_version=VERSION,
                 playtest=True,theater='WESTERN FRONT',factions={'us':'Americans','de':'Germans'},
                 summary='Compact 2.0 · distinct infantry roles & officer-led recovery',
                 platoons=[dict(id='A',name='Assault platoon',center=3)]+(
                     [dict(id='B',name='Support platoon',center=8)] if b is bridge else []))
    return {b['id']:b for b in (village,bridge)}


def roster(name):
    from .theaters import soldier
    result=[]
    for side in ('us','de'):
        us=side=='us'
        if name=='village_2':
            y=8 if us else 2
            layout=[('leader',3,y,'A'),('squad',2,y,'A'),('squad',6,y,'A'),
                    ('mg',4,y,'A'),('engineer',5,y,'A'),('scout',7,y,'A'),
                    ('mortar' if us else 'squad',2,y+1 if us else y-1,'A'),
                    ('commander',4,10 if us else 0,'HQ')]
        else:
            y=10 if us else 2
            layout=[('leader',2,y,'A'),('squad',3,y,'A'),('mg',1,y,'A'),
                    ('engineer',4,y,'A'),('leader',8,y,'B'),('squad',7,y,'B'),
                    ('scout',9,y,'B'),('mortar',8,y+1 if us else y-1,'B'),
                    ('commander',5,11 if us else 0,'HQ')]
        counts={}
        for kind,x,y,group in layout:
            counts[group]=counts.get(group,0)+1
            orders=['move','dig'];label='';extra=dict(accuracy_bonus=1 if us else 0,suppression=5 if us else 3,smoke=0,grenades=0,sight=5)
            if kind=='squad':
                orders+=['fire','overwatch','grenade','assault'];label='Rifle infantry'
                extra.update(grenades=1,range=4,display_name='Garand rifle section' if us else 'Karabiner rifle section')
            elif kind in {'leader','commander'}:
                orders+=['fire','rally','smoke','inspire','command'];label='Platoon officer' if kind=='leader' else 'Company command'
                extra.update(smoke=1,rank='captain' if kind=='leader' else 'major',
                    display_name=('Captain' if kind=='leader' else 'Major')+' · '+('assault command' if group=='A' else 'support command' if group=='B' else 'company command'),
                    command_radius=1 if kind=='leader' else 2,artillery_range=0,artillery_charges=0,
                    field_recon_range=0,field_recon_charges=0)
            elif kind=='mg':
                orders+=['suppress'];label='Fire support' if us else 'Suppression team'
                if us:orders+=['fire','overwatch']
                extra.update(range=5 if us else 6,sight=5 if us else 4,
                    suppress_min=1 if us else 2,suppress_range=4 if us else 6,
                    display_name='Browning fire-support team' if us else 'MG 42 suppression team')
            elif kind=='scout':
                orders+=['fire','rally','smoke','observe'];label='Reconnaissance'
                if name=='stonebridge_2' or us:orders+=['spot_fire']
                extra.update(smoke=2,sight=7,range=3,display_name='Recon patrol')
            elif kind=='engineer':
                orders+=['fire','grenade','assault','smoke','clear_wreck'];label='Assault engineers'
                if name=='stonebridge_2':orders+=['bridge_gap']
                extra.update(smoke=2,grenades=2,repair_kits=0,demolition_charges=0,
                    bridge_kits=int(name=='stonebridge_2'),display_name='Combat engineer team')
            elif kind=='mortar':
                orders+=['area_fire'];label='Indirect fire'
                extra.update(range=0,mortar_range=6,shells=3,max_shells=3,sight=4,
                    display_name='60 mm mortar team' if us else 'Light mortar team')
            extra.update(role_orders=orders,role_label=label,role_profile=kind if kind!='mg' or us else 'suppression_mg')
            result.append(soldier(side,kind,[x,y],group,counts[group],side,**extra))
    return result


def enabled(state):return state.get('ground_roles_version')==VERSION


def allowed(state,unit,kind):
    return not enabled(state) or kind in unit.get('role_orders',())


def initialize(state):
    if state['battlefield'].get('ground_roles_version')==VERSION:
        state.update(ground_roles_version=VERSION,support={'us':0,'de':0})
        start_turn(state,state['turn'])
    return state


def filter_options(state,unit,legal):
    if not enabled(state):return legal
    from .engine import distance
    for kind,field in ORDER_FIELDS.items():
        if field in legal and not allowed(state,unit,kind):
            value=legal[field];legal[field]=[] if isinstance(value,list) else False
    if legal.get('suppress'):
        legal['suppress']=[uid for uid in legal['suppress'] if any(
            u['id']==uid and unit.get('suppress_min',1)<=distance(unit['pos'],u['pos'])<=unit['suppress_range'] for u in state['units'])]
    return legal


def start_turn(state,side):
    if enabled(state):
        for u in state['units']:
            if u['side']==side:u['role_pinned_start']=bool(u['pinned'])


def end_turn(state,side):
    """Recover only after a full own turn; pending artillery resolves afterward."""
    from .visibility import active
    if not enabled(state):return []
    count=0
    for u in state['units']:
        if u['side']==side and active(u) and not allowed(state,u,'rally') and u['pinned'] and u.get('role_pinned_start'):
            u['pinned']=False;count+=1
    # Only the army receives the count; reports to the other army stay generic.
    return [f'{count} team(s) recovered after a full own turn pinned.'] if count else []


def goal(state,unit,fallback):
    from .engine import distance
    from .visibility import active
    if not enabled(state) or unit['kind'] not in {'leader','commander'}:return fallback
    friends=[u for u in state['units'] if u['side']==unit['side'] and active(u) and u['pinned']
             and not allowed(state,u,'rally') and (unit['kind']=='commander' or u['platoon']==unit['platoon'])
             and unit.get('command_radius',1)<distance(unit['pos'],u['pos'])<=4]
    return min(friends,key=lambda u:distance(unit['pos'],u['pos']))['pos'] if friends else fallback


def threatens(state,unit,pos):
    from .engine import distance
    gap=distance(unit['pos'],pos)
    return ((allowed(state,unit,'fire') and gap<=unit['range']) or
            (enabled(state) and allowed(state,unit,'suppress') and unit.get('suppress_min',1)<=gap<=unit.get('suppress_range',0)))


def redact(result,state,side):
    if enabled(state):
        result['ground_roles_version']=VERSION
        for u in result.get('units',[]):
            if u['side']!=side:u.pop('role_pinned_start',None)
    return result
