"""Fictional engagements in historical theaters; roster traits, not racial bonuses."""
from .campaigns import unit

IDS = ('apennine', 'desert_signal', 'amba_dawn')


def soldier(side, kind, pos, group, number, base_faction, **changes):
    # Override inherited US/DE defaults explicitly for every new faction.
    base = dict(faction=base_faction, accuracy_bonus=0, suppression=4, hp=3, max_hp=3,
                range=4, base_ap=2, personnel=9, armor=0, penetration=0, smoke=1, grenades=0)
    roles = {
        'leader':dict(hp=2,max_hp=2,base_ap=3,range=3),
        'commander':dict(hp=2,max_hp=2,base_ap=3,range=2,artillery_charges=1,field_recon_charges=1),
        'radioman':dict(hp=2,max_hp=2,base_ap=3,range=2,radio=True),
        'scout':dict(hp=2,max_hp=2,base_ap=3,range=3,sight=9),
        'commando':dict(hp=3,max_hp=3,base_ap=3,range=3,grenades=2,smoke=2,stealth=True),
        'mountain':dict(base_ap=2,range=4,mountain_movement=True,grenades=1),
        'partisan':dict(hp=3,max_hp=3,base_ap=3,range=3,mountain_movement=True,stealth=True,grenades=1),
        'askari':dict(hp=3,max_hp=3,range=4,mountain_movement=True,suppression=4,grenades=1),
        'mortar':dict(hp=2,max_hp=2,range=2,mortar_range=8,shells=3,smoke=0),
        'engineer':dict(range=3,smoke=3,grenades=2),
        'mg':dict(range=7,suppression=3,smoke=0),
        'tank':dict(hp=4,max_hp=4,base_ap=2,range=7,armor=2,penetration=2,smoke=0),
        'at_gun':dict(hp=3,max_hp=3,range=9,penetration=3,smoke=0),
        'at_team':dict(hp=2,max_hp=2,range=3,penetration=2,smoke=0),
        'halftrack':dict(hp=3,max_hp=3,base_ap=3,range=5,armor=1,suppression=4,smoke=0),
        'squad':dict(grenades=1),
    }
    base.update(roles.get(kind, {}))
    base['personnel']={'leader':2,'commander':2,'radioman':2,'scout':2,'commando':6,'mortar':3,'engineer':6,'mg':3,'tank':4,'at_gun':4,'at_team':2,'halftrack':6}.get(kind,9)
    base.update(changes)
    return unit(side,kind,pos,group,number,**base)


def roster(name):
    forces=[]
    if name=='apennine':
        factions={'us':'gb','de':'de'}
        wings={'us':['leader','mountain','squad','commando','engineer','scout'],
               'de':['leader','mountain','squad','mg','engineer','scout']}
        support={'us':['commander','radioman','mortar','tank','at_team'],
                 'de':['commander','radioman','mortar','at_gun','tank']}
    elif name=='desert_signal':
        factions={'us':'gb','de':'it'}
        wings={'us':['leader','squad','scout','commando','engineer','at_team'],
               'de':['leader','squad','scout','mg','engineer','at_team']}
        support={'us':['commander','radioman','mortar','tank','tank','tank','halftrack'],
                 'de':['commander','radioman','mortar','tank','tank','at_gun','at_gun']}
    else:
        factions={'us':'et','de':'it'}
        wings={'us':['leader','partisan','partisan','mountain','scout','engineer'],
               'de':['leader','askari','askari','mg','mountain','engineer']}
        support={'us':['commander','radioman','mortar','partisan'],
                 'de':['commander','radioman','mortar','tank']}
    width,height=(32,26) if name=='desert_signal' else (26,28) if name=='apennine' else (26,30)
    for side in ('us','de'):
        y=height-5 if side=='us' else 5
        for group,cx in [('A',5),('B',width-7)]:
            for i,kind in enumerate(wings[side],1):
                pos=[cx+(i-1)%3,y+(i-1)//3*(1 if side=='us' else -1)]
                extra={}
                if name=='apennine':
                    if side=='de':extra['suppression']=3
                    elif kind in {'squad','mountain'}:extra['smoke']=2
                    if kind=='commando':extra['display_name']='British Commandos'
                    if side=='de' and kind=='mountain':extra['display_name']='Gebirgsjäger'
                if name=='desert_signal' and side=='de' and group=='B':
                    extra.update(faction='de',suppression=3)
                if name=='desert_signal' and kind=='at_team':
                    extra.update(weapon='at_rifle',range=5,penetration=1,display_name='Boys AT rifle team' if side=='us' else 'AT rifle team')
                if kind=='askari':extra['display_name']='Eritrean Ascaris'
                if kind=='partisan':extra['display_name']='Ethiopian Patriots'
                forces.append(soldier(side,kind,pos,group,i,factions[side],**extra))
        cy=height-3 if side=='us' else 2
        for i,kind in enumerate(support[side],1):
            extra={}
            if name=='apennine' and side=='us' and kind=='at_team':
                extra.update(display_name='PIAT team',weapon_overrides={'rocket':{'label':'PIAT bomb'}})
            if name=='desert_signal' and kind=='tank':
                if side=='us':extra.update(display_name='Crusader tank',base_ap=3,range=6,hp=3,max_hp=3)
                elif i==4:extra.update(display_name='Italian M13/40',hp=3,max_hp=3,range=6)
                else:extra.update(display_name='Panzer III',faction='de',range=8)
            if name=='amba_dawn':
                if kind=='commander':extra.update(artillery_range=0,artillery_charges=0,field_recon_range=0,field_recon_charges=0)
                if side=='us' and kind=='radioman':extra.update(display_name='Liaison wireless team',range=2,faction='gb')
                if kind=='tank':extra.update(display_name='Italian L3 tankette',hp=2,max_hp=2,armor=1,protection='light_armor',base_ap=3,range=4,
                    weapon='machine_gun',ammo_options=[],penetration=0)
                if kind=='mortar':extra['shells']=2
            forces.append(soldier(side,kind,[width//2-3+(i-1)%5,cy+(i-1)//5*(1 if side=='us' else -1)],'HQ',i,factions[side],**extra))
    return forces


def scenarios(build):
    result={}
    specs=[('apennine','Apennine Relay','Mountain relay post',26,28,28,'ITALY · 1944',{'us':'British & Commonwealth','de':'Germans'}),
           ('desert_signal','Desert Signal','Desert supply junction',32,26,26,'NORTH AFRICA · 1942',{'us':'British & Commonwealth','de':'Italian–German force'}),
           ('amba_dawn','Amba Dawn','Highland garrison',26,30,30,'ETHIOPIA · 1941',{'us':'Ethiopian Patriots','de':'Italian colonial garrison'})]
    for name,title,objective,w,h,rounds,theater,factions in specs:
        desert=name=='desert_signal'
        grid=[['d' if desert else '.' for _ in range(w)] for _ in range(h)]
        for y in range(3,h-3):
            for x in range(w):
                if desert:
                    if (x*5+y*7)%31<4:grid[y][x]='n'
                    if y in (11,12) and x not in (5,6,15,16,25,26):grid[y][x]='r'
                    if y==17 and 7<x<25:grid[y][x]='w'
                else:
                    if (x<4 or 9<=x<=11 or 17<=x<=19 or x>w-4) and (x+y)%7!=0:grid[y][x]='M'
                    elif (x*5+y*3)%13<3:grid[y][x]='T' if name=='apennine' else 'r'
                    if y in (12,13,18) and x%7 not in (4,5):grid[y][x]='r'
        # Three continuous valley routes, joined laterally; no forced single chokepoint.
        for y in range(h):
            for x in (6,w//2,w-6):grid[y][x]='='
        for y in (7,h-8):
            for x in range(4,w-3):grid[y][x]='='
        oy=8 if name!='amba_dawn' else 9
        for x,y in [(w//2-1,oy),(w//2+1,oy),(w//2,oy-1)]:grid[y][x]='B'
        if desert:
            for x,y in [(4,16),(5,16),(26,9),(27,9)]:grid[y][x]='o'
        grid[oy][w//2]='*'
        descriptions={
            'apennine':'Mountain infantry take ridges while Commandos work around the valley guns. Observe before committing; radio reports connect separated platoons.',
            'desert_signal':'Fast British cruiser tanks face Italian armor and long German gun lanes. Dunes slow vehicles; wadis shelter infantry. Keep wireless teams alive.',
            'amba_dawn':'Ethiopian Patriots use mountain paths against an Italian garrison and colonial infantry. A liaison wireless team links dispersed fighters; a tankette cannot follow them onto the heights.'}
        board=build(name,title,objective,rounds,descriptions[name],[''.join(row) for row in grid])
        board.update(dsl_only=True,campaign=name,theater=theater,factions=factions,signals=True,playtest=True,
            summary={'apennine':'Mountain flanks · Commandos · platoon reports','desert_signal':'Mobile armor · gun lines · desert cover','amba_dawn':'Patriot mountain routes · Italian garrison'}[name],
            historical_note='Fictional compressed engagement in a historical theater. Unit traits model equipment, training and battlefield roles; this is a balance playtest.',
            platoons=[dict(id='A',name='West group',center=6),dict(id='B',name='East group',center=w-6),dict(id='HQ',name='Command & support',center=w//2)],
            sectors=[dict(name='West approach',pos=[6,h//2]),dict(name='East approach',pos=[w-6,h//2]),dict(name='Objective',pos=[w//2,oy])],
            doctrine={'apennine':{'us':'More smoke and mobile raiders; armor depends on valley roads.','de':'Longer MG lanes and strong suppression; mountain troops cover the flanks.'},
                'desert_signal':{'us':'Three fast, lighter cruiser tanks; win by maneuver, not trading shells.','de':'Two tanks plus two fixed guns; stronger prepared lanes, less mobile armor.'},
                'amba_dawn':{'us':'More mobile mountain infantry and hidden approaches; little heavy support.','de':'Machine guns, mortars and a small tankette; roads and passes limit movement.'}}[name])
        for u in roster(name):
            x,y=u['pos'];board['map'][y][x]='desert' if desert else 'field'
        result[name]=board
    return result
