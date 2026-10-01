"""Operation Tidal Gate: a fictional compressed Normandy combined-arms operation."""
from .campaigns import unit


def roster():
    result = []
    counts = {}
    def add(side, kind, x, y, group, **extra):
        k = (side, group); counts[k] = counts.get(k, 0)+1
        u = unit(side, kind, [x,y], group, counts[k], **extra); result.append(u)
        return u
    # Two landings, each with infantry and engineers aboard independent boats.
    for group, xs in [('A', (5,8)), ('B', (27,30))]:
        for x, kind in zip(xs, ('squad','engineer')):
            craft = add('us','landing_craft',x,37,group,hp=5,max_hp=5,range=0,base_ap=3,
                        armor=0,penetration=0,smoke=2,grenades=0,personnel=3)
            add('us',kind,x,37,group,carrier_id=craft['id'])
    for group,x in [('A',6),('B',29)]:
        for kind,dx,y in [('leader',0,33),('squad',-1,33),('mg',1,32),('engineer',-2,32),
                          ('tank',0,32),('amphibious',3,34)]:
            add('us',kind,x+dx,y,group)
    # Pathfinders already inland; reinforcements in reserve still require sight.
    for group,x in [('C',7),('D',28)]:
        for kind,dx,y in [('paratrooper',0,20),('scout',1,20),('sniper',-1,21),('at_team',2,21),('leader',0,21)]:
            add('us',kind,x+dx,y,group)
    add('us','commander',18,33,'HQ')
    add('us','at_gun',18,31,'HQ')
    add('us','paratrooper',17,42,'HQ',reserve=True)
    add('us','paratrooper',19,42,'HQ',reserve=True)
    add('us','tank',17,34,'HQ',reserve=True,arrival_round=5)
    add('us','engineer',19,34,'HQ',reserve=True,arrival_round=5)
    # 28 defenders, including a timed armored reserve. Strength, not headcount.
    for group,x in [('A',6),('B',29)]:
        for kind,dx,y in [('mg',0,30),('squad',1,29),('at_gun',-2,23),('leader',0,23),
                          ('squad',0,24),('engineer',2,23),('scout',-2,19),('at_team',1,22)]:
            add('de',kind,x+dx,y,group,entrenched=kind in {'mg','at_gun'},overwatch=kind in {'mg','at_gun'})
    for kind,x,y,group in [('mg',16,11,'C'),('squad',18,10,'C'),('sniper',20,12,'C'),
            ('leader',18,11,'C'),('at_gun',18,15,'C'),('squad',21,13,'D'),
            ('commander',18,8,'HQ'),('tank',18,13,'HQ'),('halftrack',29,18,'D'),('engineer',27,18,'D')]:
        add('de',kind,x,y,group,entrenched=kind in {'mg','at_gun'})
    add('de','tank',18,2,'HQ',reserve=True,arrival_round=6)
    add('de','halftrack',20,2,'HQ',reserve=True,arrival_round=6)
    return result


def scenario(build):
    width,height = 36,44
    rows = [['.']*width for _ in range(height)]
    for y in range(height):
        for x in range(width):
            if y>=35: rows[y][x]='~'
            elif y>=32: rows[y][x]='s'
            elif 25<=y<=29: rows[y][x]='m'
            elif 7<=y<=23 and (x*11+y*7)%31<3: rows[y][x]='T'
    # Interlocking hedgerows make small fields; intentional gaps permit infantry
    # approaches while armor has several roads and engineer-created alternatives.
    for y in (13,20):
        for x in range(2,width-2):
            if x not in (5,6,7,17,18,19,28,29,30): rows[y][x]='h'
    for x in (12,23):
        for y in range(8,25):
            if y not in (12,17,22): rows[y][x]='h'
    for y in range(35):
        for x in (6,18,29): rows[y][x]='c' if 25<=y<=29 else '='
    for y in (4,10,22,31):
        for x in range(width): rows[y][x]='='
    # A one-hex river can be bridged; the flooded belt cannot be paved over.
    rows[17]=['~']*width
    for x in (6,18,29): rows[17][x]='+'
    for y in range(8,13):
        for x in range(14,23):
            if x!=18 and y!=10 and (x+y)%3: rows[y][x]='B'
    for x,y in [(7,22),(28,22),(20,12)]: rows[y][x]='^'
    for x,y in [(6,30),(29,30),(4,23),(27,23),(16,11)]: rows[y][x]='k'
    rows[10][18]='*'
    board = build('tidal_gate','Operation Tidal Gate','Inland command post',44,
        'Huge combined-arms playtest · 36×44 · 64 units across 14 roles. Land two beach groups, link with airborne troops, breach bocage and hold the inland command post plus either causeway exit for two American turn endings. Fresh reserves arrive in rounds 5 and 6. Fictional Normandy-inspired terrain and timings.',
        [''.join(r) for r in rows])
    board.update(dsl_only=True,campaign='tidal_gate',playtest=True,theater='NORMANDY · JUNE 1944 INSPIRED',
        summary='Two landings · airborne linkup · engineering · armored counterattack',
        factions={'us':'Americans','de':'Germans'},building_conditions={'damaged':20,'destroyed':10},
        linked_objectives=[dict(id='west',name='West causeway exit',role='exit',pos=[6,24]),
                           dict(id='east',name='East causeway exit',role='exit',pos=[29,24]),
                           dict(id='town',name='Inland command post',role='command',pos=[18,10])],
        sectors=[dict(name='Beachhead',pos=[18,33]),dict(name='Causeways',pos=[18,27]),
                 dict(name='Airborne',pos=[18,20]),dict(name='Bocage',pos=[18,14]),dict(name='Town',pos=[18,10])],
        reinforcement_brief='US: tank and engineer at R5, beach assembly points. Germany: tank and half-track at R6, north road. Each arrives at its own turn start; an occupied entry hex delays it.',
        platoons=[dict(id='A',name='West force',side_names={'us':'West landing','de':'West defense'},center=6),dict(id='B',name='East force',side_names={'us':'East landing','de':'East defense'},center=29),
                  dict(id='C',name='West airborne',side_names={'us':'West airborne','de':'Town garrison'},center=7),dict(id='D',name='East airborne',side_names={'us':'East airborne','de':'Mobile reserve'},center=28),
                  dict(id='HQ',name='Command & armor',center=18)])
    for u in roster():
        x,y=u['pos']
        if u['kind']=='landing_craft' or u.get('carrier_id') or (u.get('reserve') and not u.get('arrival_round')): continue
        tile=board['map'][y][x]
        if u['kind'] in {'tank','halftrack','amphibious'} and tile not in {'road','beach','field','causeway'}:
            board['map'][y][x]='field'
        elif tile in {'woods','bocage','water','marsh'}: board['map'][y][x]='field'
    # Markers are distinct from terrain; exits retain their road movement.
    return board
