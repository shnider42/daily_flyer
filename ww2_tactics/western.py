"""Carentan and Market Garden: historical inspiration, fictional tactical scale."""
from .campaigns import unit


def roster(campaign):
    if campaign=='carentan':
        layouts={
            'us':[('paratrooper',3,3,'A'),('paratrooper',5,3,'A'),('leader',4,2,'A'),('mg',6,2,'A'),
                  ('engineer',7,3,'A'),('scout',10,4,'B'),('sniper',12,3,'B'),('paratrooper',13,3,'B'),
                  ('leader',11,2,'B'),('at_team',14,2,'B'),('commander',9,1,'HQ'),('tank',4,1,'HQ'),
                  ('paratrooper',8,0,'HQ'),('paratrooper',10,0,'HQ')],
            'de':[('squad',3,17,'A'),('squad',7,17,'A'),('leader',4,18,'A'),('mg',5,15,'A'),
                  ('engineer',7,19,'A'),('scout',13,18,'B'),('sniper',12,17,'B'),('squad',14,18,'B'),
                  ('leader',11,18,'B'),('mg',12,14,'B'),('commander',9,20,'HQ'),('tank',12,19,'HQ'),
                  ('halftrack',4,19,'HQ'),('at_gun',10,16,'HQ')]}
    elif campaign=='market_garden':
        layouts={
            'us':[('paratrooper',5,14,'A'),('paratrooper',7,15,'A'),('leader',5,15,'A'),('scout',6,15,'A'),
                  ('sniper',4,16,'A'),('engineer',7,16,'A'),('paratrooper',17,13,'B'),('paratrooper',18,14,'B'),
                  ('leader',17,14,'B'),('mg',16,15,'B'),('sniper',18,16,'B'),('at_team',16,16,'B'),
                  ('commander',10,25,'HQ'),('tank',11,25,'HQ'),('tank',12,24,'HQ'),('engineer',10,24,'HQ'),
                  ('squad',9,25,'HQ'),('amphibious',8,24,'HQ'),('paratrooper',5,27,'A'),('paratrooper',17,27,'B')],
            'de':[('squad',8,4,'A'),('leader',9,3,'A'),('mg',10,4,'A'),('sniper',13,4,'A'),
                  ('at_gun',12,5,'A'),('engineer',10,3,'A'),('scout',15,5,'A'),('squad',16,4,'A'),
                  ('squad',3,12,'B'),('leader',3,13,'B'),('mg',4,11,'B'),('sniper',19,12,'B'),
                  ('squad',19,15,'B'),('at_team',20,16,'B'),('engineer',18,17,'B'),('at_gun',13,12,'B'),
                  ('commander',11,2,'HQ'),('tank',11,3,'HQ'),('tank',19,17,'HQ'),('halftrack',19,20,'HQ')]}
    else:raise ValueError('Unknown western campaign.')
    result=[]
    for side,layout in layouts.items():
        counts={}
        for kind,x,y,group in layout:
            counts[group]=counts.get(group,0)+1
            faction='de' if side=='de' else 'uk' if campaign=='market_garden' and group in {'B','HQ'} else 'us'
            extra=dict(faction=faction,accuracy_bonus=int(faction=='us' and kind in {'squad','paratrooper','mg','engineer','scout'}),
                       suppression=3 if faction=='de' else 4 if faction=='uk' else 5)
            if side=='us' and kind=='paratrooper':extra['reserve']=y in (0,27)
            if kind=='at_gun':extra.update(entrenched=True,overwatch=True)
            # One Firefly-style long-range tank trades mobility for reach, rather
            # than giving the Allied army the best of both armor profiles.
            if campaign=='market_garden' and side=='us' and kind=='tank' and x==12:
                extra.update(base_ap=2,range=8)
            result.append(unit(side,kind,[x,y],group,counts[group],**extra))
    return result


def scenarios(build):
    town=[['.']*18 for _ in range(22)]
    for y in range(22):
        for x in range(18):
            if x in (4,12) or y in (4,10,13,18):town[y][x]='='
            elif 10<=y<=17 and 3<=x<=14 and (x+y)%3:town[y][x]='B'
            elif (x*7+y*3)%17<3:town[y][x]='T'
    for y in (6,7):
        town[y]=['~']*18
        for x in (4,12):town[y][x]='+'
    town[13][9]='*';town[11][6]='^';town[16][13]='^'
    carentan=build('carentan','Carentan','Town road junction',24,
        'Airborne infantry push south across flooded causeways into the town. Clear the church approaches, cover engineers and link up with armor. Hold the road junction for two American turn endings. A fictional June 1944 playtest.', [''.join(r) for r in town])
    carentan.update(campaign='carentan',dsl_only=True,theater='NORMANDY · JUNE 1944',summary='Causeways · airborne troops · church towers',
        factions={'us':'Americans','de':'Germans'},platoons=[dict(id='A',name='West airborne',center=4),dict(id='B',name='East airborne',center=12),dict(id='HQ',name='Armor & reserves',center=9)])
    corridor=[['.']*22 for _ in range(28)]
    for y in range(28):
        for x in range(22):
            if x in (5,11,17) or y in (5,14,23):corridor[y][x]='='
            elif (4<=y<=7 or 12<=y<=16 or 22<=y<=24) and 3<=x<=19 and (x+y)%4==0:corridor[y][x]='B'
            elif (x*11+y*7)%23<3:corridor[y][x]='T'
    for y in (9,18,19):
        corridor[y]=['~']*22
        for x in (5,11,17):corridor[y][x]='+'
    corridor[6][11]='*'
    for x,y in [(6,14),(16,12),(8,6),(14,22)]:corridor[y][x]='^'
    garden=build('market_garden','Market Garden','North-bank command post',34,
        'American and British airborne groups hold forward pockets while British armor advances from the south. Cross two river belts, use the towers to observe—not shoot through—cover, and hold the north-bank post twice. A fictional September 1944 corridor.', [''.join(r) for r in corridor])
    garden.update(campaign='market_garden',dsl_only=True,theater='NETHERLANDS · SEPTEMBER 1944',summary='Airborne pockets · armored relief · river bridges',
        factions={'us':'Allies','de':'Germans'},platoons=[dict(id='A',name='US airborne',center=5),dict(id='B',name='British airborne',center=17),dict(id='HQ',name='Armored relief',center=11)])
    for board in (carentan,garden):
        for u in roster(board['campaign']):
            x,y=u['pos']
            if board['map'][y][x] not in {'road','bridge','objective'}:board['map'][y][x]='field'
    return carentan,garden
