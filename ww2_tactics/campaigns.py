"""Historical settings, deliberately fictional small-unit playtest layouts."""
import copy
from .combined import roster


def unit(side, kind, pos, group, number, **changes):
    source = {'supply':'squad','radioman':'scout','pathfinder':'scout','flak':'mg','commando':'squad','mountain':'squad','partisan':'squad','askari':'squad','mortar':'mg'}.get(kind,kind)
    source = 'amphibious' if kind == 'landing_craft' else 'scout' if kind=='sniper' else source
    value = copy.deepcopy(next(u for u in roster('de' if source=='halftrack' else side, 24) if u['kind'] == source))
    value.update(id=f'{side}-{group}-{number}', side=side, kind=kind, pos=list(pos), platoon=group,
                 number=number, reserve=False)
    if kind=='sniper':
        value.update(hp=2,max_hp=2,base_ap=3 if side=='us' else 2,range=4,sight=8,
                     snipe_range=6 if side=='us' else 7,personnel=2,smoke=1,grenades=0,accuracy_bonus=0)
    value.update(changes)
    value.update(ap=value['base_ap'], ap_received=value['base_ap'])
    return value


def stalingrad_roster():
    result = []
    for side in ('us', 'de'):
        depth = 17 if side == 'us' else 2
        layout = [('squad',2,depth,'A'),('leader',3,depth,'A'),('engineer',4,depth,'A'),
                  ('mg',5,depth,'A'),('scout',6,depth,'A'),('squad',10,depth,'B'),
                  ('leader',11,depth,'B'),('engineer' if side=='us' else 'mg',12,depth,'B'),
                  ('sniper',13,depth,'B'),('at_team',14,depth,'B'),
                  ('commander',8,depth,'HQ'),('tank',3,depth-1 if side=='us' else depth+1,'HQ'),
                  ('tank',11,depth-1 if side=='us' else depth+1,'HQ')]
        counts = {}
        for kind,x,y,group in layout:
            counts[group] = counts.get(group,0)+1
            extra = dict(faction='su' if side=='us' else 'de', accuracy_bonus=0,
                         suppression=4 if side=='us' else 3)
            if side=='us' and kind=='engineer':
                extra.update(smoke=3, grenades=3)
            result.append(unit(side,kind,[x,y],group,counts[group],**extra))
    return result


def omaha_roster():
    result = []
    for i,(x,y,kind) in enumerate([(3,16,'squad'),(6,16,'engineer'),(11,16,'squad'),(14,16,'leader')],1):
        group = 'A' if i<=2 else 'B'
        craft = unit('us','landing_craft',[x,y],group,i*2-1,hp=5,max_hp=5,range=0,
                     base_ap=3,armor=0,penetration=0,smoke=2,grenades=0,personnel=3)
        troop = unit('us',kind,[x,y],group,i*2,carrier_id=craft['id'])
        result.extend([craft,troop])
    for i,(kind,x,y) in enumerate([('commander',9,12),('tank',3,12),('tank',14,12),
                                   ('amphibious',1,15),('amphibious',16,15),('mg',8,12)],1):
        result.append(unit('us',kind,[x,y],'HQ',i))
    for i,(kind,x,y) in enumerate([('mg',3,9),('mg',9,9),('mg',14,9),
            ('at_gun',5,7),('at_gun',12,7),('squad',2,7),('squad',8,7),('squad',15,7),
            ('leader',4,6),('commander',9,5),('at_team',14,6),('halftrack',9,3)],1):
        result.append(unit('de',kind,[x,y],'HQ' if kind in {'commander','halftrack'} else 'A' if x<9 else 'B',i,
                           entrenched=kind in {'mg','at_gun'},overwatch=kind in {'mg','at_gun'}))
    return result


def setup(board):
    if board['campaign'] in {'vire_crossroads', 'belfry_valley'}:
        from .observed_fronts import roster as observed_roster
        return observed_roster(board['campaign'])
    if board.get('prebattle'):
        from .deployment import roster as deployment_roster
        return deployment_roster(board.get('source_id', board['id']))
    if board['campaign'] in {'kharkov','relay_crossing','dunkirk'}:
        from .new_fronts import roster as front_roster
        return front_roster(board['campaign'])
    if board['campaign']=='fubar':
        from .fubar import roster
        return roster()
    if board['campaign']=='iron_lantern':
        from .iron_lantern import roster
        return roster()
    if board['campaign'] in {'apennine','desert_signal','amba_dawn'}:
        from .theaters import roster as theater_roster
        return theater_roster(board['campaign'])
    if board['campaign']=='tidal_gate':
        from .tidal_gate import roster as tidal_roster
        return tidal_roster()
    if board['campaign']=='stalingrad':return stalingrad_roster()
    if board['campaign']=='omaha':return omaha_roster()
    from .western import roster as western_roster
    return western_roster(board['campaign'])


def add_scenarios(build):
    city = [['.' for _ in range(18)] for _ in range(20)]
    for y in range(20):
        for x in range(18):
            if x>=16: city[y][x]='~'
            elif x in (3,8,11) or y in (3,7,11,15): city[y][x]='='
            elif 4<=y<=15 and (x+y)%5: city[y][x]='B'
            elif 4<=y<=15 and (x*3+y)%7==0: city[y][x]='T'
    city[6][8]='*'
    city[9][5]='^';city[10][13]='^'
    stalingrad=build('stalingrad','Stalingrad','Factory command post',22,
        'Soviet counterattack through factory blocks. Buildings begin intact, damaged or collapsed. Damaged shelter can collapse under explosives; tanks need the streets. Hold the command post for two Soviet turns.', [''.join(r) for r in city])
    stalingrad.update(dsl_only=True,campaign='stalingrad',theater='EASTERN FRONT',
        building_conditions={'damaged':30,'destroyed':10},
        factions={'us':'Soviets','de':'Germans'},summary='Street fighting · Soviet counterattack',
        platoons=[dict(id='A',name='West assault group',center=3),dict(id='B',name='East assault group',center=11),dict(id='HQ',name='Armor & command',center=8)])
    coast=[['.' for _ in range(18)] for _ in range(20)]
    for y in range(20):
        for x in range(18):
            if y>=13: coast[y][x]='~'
            elif x in (3,9,14): coast[y][x]='='
            elif y in (7,8) and x not in (2,4,8,10,13,15): coast[y][x]='B'
            elif 2<=y<=8 and (x*7+y*3)%11<2: coast[y][x]='T'
    coast[5][9]='*'
    omaha=build('omaha','Omaha Beach','Beach-exit command post',24,
        'Bring four loaded landing craft ashore. Smoke the approach, unload infantry, and open the beach exit. German MGs and fixed guns begin on overwatch.', [''.join(r) for r in coast])
    omaha.update(dsl_only=True,campaign='omaha',theater='NORMANDY',summary='Landing craft · infantry assault',
        factions={'us':'Americans','de':'Germans'},platoons=[dict(id='A',name='West landing',center=3),dict(id='B',name='East landing',center=14),dict(id='HQ',name='Beach support',center=9)])
    for board in (stalingrad,omaha):
        for u in setup(board):
            x,y=u['pos']
            if u['kind']!='landing_craft' and not u.get('carrier_id') and board['map'][y][x] not in {'road','water','objective'}:
                board['map'][y][x]='field'
    sky=[['~']*22 for _ in range(18)]
    for y in range(18):
        for x in range(22):
            if y<6+(x%7==0) or y>12+(x%5==0):
                sky[y][x]='T' if (x*5+y*3)%13==0 else '.'
    for x,y in [(5,3),(16,3),(10,2),(4,15),(17,15)]:sky[y][x]='B'
    sky[8][10]='*'
    britain=build('britain','Battle of Britain','Channel airspace',18,
        'Air-combat sandbox. RAF fighters and radar defend two sector stations; the Luftwaffe escorts bombers across the Channel. AA and interceptors react along each flight path.', [''.join(r) for r in sky])
    britain.update(dsl_only=True,air=True,playtest=True,theater='ENGLISH CHANNEL',summary='Aircraft · radar · anti-aircraft fire',
        factions={'us':'RAF','de':'Luftwaffe'},airfields={'us':[[5,3],[16,3]],'de':[[4,15],[17,15]]},
        platoons=[dict(id='A',name='Aircraft',center=10),dict(id='HQ',name='Ground stations',center=5)])
    from .western import scenarios as western_scenarios
    return {b['id']:b for b in (stalingrad,britain,omaha,*western_scenarios(build))}
