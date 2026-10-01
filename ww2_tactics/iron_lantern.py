"""Fictional 1944 airborne/armored linkup; a sandbox for airlift rules."""
from .theaters import soldier


def roster():
    units=[];counts={}
    def add(side,kind,pos,group,faction,**extra):
        key=(side,group);counts[key]=counts.get(key,0)+1
        u=soldier(side,kind,pos,group,counts[key],faction,**extra);units.append(u);return u
    for side in ('us','de'):
        for group,cx in [('A',5),('B',23)]:
            kinds=(['leader','squad','mg','pathfinder','engineer','at_team','paratrooper'] if group=='A' else
                   ['leader','squad','mg','scout','engineer','at_team','commando']) if side=='us' else ['leader','squad','mg','scout','engineer','at_team']
            for i,kind in enumerate(kinds):
                faction='de' if side=='de' else 'us' if group=='A' else 'gb'
                pos=[cx+i%3,(26 if side=='us' else 16 if group=='A' else 13)+(i//3)*(1 if side=='us' else -1)]
                extra=dict(suppression=3 if side=='de' else 5 if faction=='us' else 4,
                           accuracy_bonus=-1 if faction=='us' else 0)
                if kind=='pathfinder':extra.update(display_name='US Pathfinder team',beacon_charges=1,sight=9,base_ap=3,hp=2,max_hp=2,range=3,personnel=4)
                if kind=='paratrooper':extra.update(display_name='US airborne squad',base_ap=3,hp=3,max_hp=3,range=4,grenades=1)
                if side=='de' and kind=='engineer':extra.update(display_name='German Pioneers',demolition_charges=2)
                if faction=='gb' and kind=='at_team':extra.update(display_name='British PIAT team',weapon_overrides={'rocket':{'label':'PIAT bomb'}})
                add(side,kind,pos,group,faction,**extra)
    for kind,pos,extra in [
        ('commander',[13,30],dict(display_name='US airborne commander',airlift_commander=True,artillery_charges=1,field_recon_charges=1)),
        ('radioman',[14,30],{}),('mortar',[16,30],{}),
        ('tank',[6,25],dict(display_name='British Sherman',base_ap=3,range=6)),
        ('tank',[15,26],dict(display_name='Sherman Firefly',variant='firefly',base_ap=2,range=8,
            weapon_overrides={'ap':dict(label='17-pounder AP',penetration=4,damage=3,light_damage=3),
                              'he':dict(label='17-pounder HE',infantry_damage=1,splash=0)})),
        ('halftrack',[24,25],dict(display_name='Allied half-track')),('engineer',[17,30],{})]:
        add('us',kind,pos,'HQ','us' if kind in {'commander','radioman','mortar'} else 'gb',**extra)
    for x in (12,14,16):
        add('us','paratrooper',[x,33],'R','us',display_name='US airborne reserve',reserve=True,airlift_reserve=True,
            base_ap=3,range=4,hp=3,max_hp=3,grenades=1,personnel=8,accuracy_bonus=-1,suppression=5)
    for kind,pos,extra in [
        ('commander',[15,4],dict(artillery_charges=1,field_recon_charges=1)),('radioman',[16,4],{}),('mortar',[14,4],{}),
        ('tank',[15,9],dict(display_name='Tiger I',variant='tiger',hp=6,max_hp=6,armor=3,base_ap=3,range=9,move_ap=3,no_road_bonus=True,
            weapon_overrides={'ap':dict(label='88 mm AP',penetration=4,damage=3,light_damage=3),'he':dict(label='88 mm HE')})),
        ('tank',[24,10],dict(display_name='Panzer IV',base_ap=2,range=8)),
        ('flak',[10,9],dict(display_name='20 mm Flak team',weapon='light_flak',aa_radius=4,hp=3,max_hp=3,range=6,smoke=0,entrenched=True)),
        ('flak',[21,14],dict(display_name='20 mm Flak team',weapon='light_flak',aa_radius=4,hp=3,max_hp=3,range=6,smoke=0,entrenched=True)),
        ('at_gun',[13,8],dict(entrenched=True)),('sniper',[17,8],{}),
        ('engineer',[16,7],dict(display_name='German Pioneers',demolition_charges=2))]:
        add('de',kind,pos,'HQ','de',suppression=3,**extra)
    return units


def scenario(build):
    w,h=30,34;rows=[['.']*w for _ in range(h)]
    for y in range(3,31):
        for x in range(w):
            if (x*7+y*11)%37<5:rows[y][x]='T'
            if y in (15,24) and x%9 not in (4,5,6):rows[y][x]='h'
    for y in (12,19,20):rows[y]=['~']*w
    for y in range(h):
        for x in (6,15,24):rows[y][x]='+' if y in (12,19,20) else '='
    for y in (10,17,22,29):
        for x in range(2,w-2):rows[y][x]='='
    for y in range(5,10):
        for x in range(12,19):
            if x!=15 and (x+y)%2:rows[y][x]='B'
    for x,y in ((8,17),(22,17),(11,25),(19,25)):rows[y][x]='^'
    rows[7][15]='*'
    board=build('iron_lantern','Operation Iron Lantern','Canal command post',32,
        'Airborne sandbox · 30×34 · US airborne and British armor against German Flak and a Tiger. Link the command post to either northern canal exit with infantry for two turn endings. Three commander-directed airborne squads, risky scatter, water landings and Pathfinder beacons.',
        [''.join(row) for row in rows])
    board.update(dsl_only=True,campaign='iron_lantern',playtest=True,signals=True,airborne=True,
        theater='LOW COUNTRIES · AUTUMN 1944 INSPIRED',factions={'us':'US airborne & British armor','de':'German battle group'},
        summary='Commander airlifts · Pathfinder beacons · Flak · Tiger versus Firefly',
        historical_note='Fictional compressed 1944 operation. Airlift probabilities, strength and AP are balance experiments, not historical statistics.',
        linked_brief='Hold the canal command post AND either northern canal exit with infantry for two consecutive Allied turn endings. Germans win after round 32. Objective flags are public.',
        link_label='canal exit',
        linked_objectives=[dict(id='west',name='West canal exit',role='exit',pos=[6,18]),dict(id='east',name='East canal exit',role='exit',pos=[24,18]),dict(id='town',name='Canal command post',role='command',pos=[15,7])],
        reinforcement_brief='Allies have three finite airborne reserve squads. A US/British commander calls one for 3 AP, at most once per round. There are no automatic reinforcements.',
        doctrine={'us':'Airborne reach and fast Shermans; a Firefly counters heavy armor. Scout Flak, use beacons and establish a canal link.',
                  'de':'One Tiger and two fixed Flak teams. Slow heavy armor cannot cover every crossing; suppress Pathfinders and break the infantry link.'},
        platoons=[dict(id='A',name='US west force',center=6),dict(id='B',name='British east force',center=24),dict(id='HQ',name='Command & armor',center=15),dict(id='R',name='Airborne reserve',center=14)],
        sectors=[dict(name='Southern assembly',pos=[15,28]),dict(name='West canal',pos=[6,18]),dict(name='East canal',pos=[24,18]),dict(name='Command post',pos=[15,7])])
    for u in roster():
        x,y=u['pos']
        if board['map'][y][x] not in {'road','bridge','objective'}:board['map'][y][x]='field'
    return board
