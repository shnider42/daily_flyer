"""Compact, historically inspired playtests; terrain and forces are abstracted.

Versioned, map-local mechanics. Medical stock is private army information;
cave entrances and their permanent closures are public infrastructure.
"""
import copy

VERSION = 1
IDS = {'foy', 'peleliu'}
ORDERS = {'field_aid', 'cave_move', 'seal_cave'}


def scenarios(build):
    foy = build('foy', 'Foy · Winter Assault', 'Village command post', 12,
        'January 1945, Ardennes · 10×12 · 9 American / 8 German units. Cross the winter fields from the southern woodline and hold the village command post for two consecutive American turns. Defenders win after round 12. Limited aid posts restore wounded infantry: 2 AP and one medical supply restore 1 strength, once per unit per round. Terrain and forces are abstracted for balance.', [
        '...==.....', '..B=B..B..', '.TB=B..B.T', '..B=*BB...',
        '.T.B=B..T.', '..T.=.B...', '.T..=...T.', '....=.....',
        '.T..=..T..', 'TTTT=TTTTT', 'TT..=..TTT', 'TT..=...TT'])
    foy.update(aid_posts=[dict(side='us',pos=[3,9],name='Woodline dressing station'),
                         dict(side='de',pos=[7,2],name='Farm cellar aid post')])
    peleliu = build('peleliu', 'Peleliu · Coral Pocket', 'Ridge command post', 12,
        'September 1944, Pacific · 12×12 · 10 American / 9 Japanese units. The first wave is ashore. Fight inland and hold the ridge command post for two consecutive American turns; defenders win after round 12. Japanese infantry can move between open cave entrances for 2 AP, ending their actions. American engineers can seal an adjacent, enemy-free entrance for 2 AP and one demolition charge. Entrances and closures are public; underground movement is not. Abstracted terrain and forces.', [
        '~~s...TT....', '~~s..TT.rr..', '~~s...T.r.T.', '~~s.T..r..T.',
        '~~s...r..r..', '~~s..T..*r..', '~~s...r..rT.', '~~s.T..T....',
        '~~s...Tr..T.', '~~s..T..r...', '~~s...TT....', '~~s....T....'])
    peleliu.update(cave_entrances=[dict(id='north',pos=[7,3],name='North cave'),
        dict(id='rear',pos=[9,5],name='Ridge cave'),dict(id='south',pos=[7,8],name='South cave')])
    for board in (foy, peleliu):
        board.update(dsl_only=True, campaign=board['id'], small_fronts_version=VERSION,
            playtest=True, theater='ARDENNES' if board['id']=='foy' else 'PACIFIC',
            factions={'us':'Americans', 'de':'Germans' if board['id']=='foy' else 'Japanese'},
            summary='Compact infantry · limited aid posts' if board['id']=='foy' else 'Compact island assault · cave network',
            platoons=[dict(id='A',name='First platoon',center=3),dict(id='B',name='Second platoon',center=7)])
    return {b['id']:b for b in (foy,peleliu)}


def roster(name):
    from .theaters import soldier
    if name == 'foy':
        layouts = {
            'us':[('leader',2,9,'A','E Company command'),('squad',2,10,'A','506th rifle section'),
                  ('squad',4,9,'A','Village assault section'),('engineer',3,10,'A','Assault pioneers'),
                  ('mg',1,9,'A','Browning support team'),('leader',7,9,'B','I Company command'),
                  ('squad',7,10,'B','Woodline rifle section'),('scout',8,9,'B','Flank patrol'),('mortar',6,10,'B','60 mm mortar team')],
            'de':[('leader',3,2,'A','Village command'),('squad',2,3,'A','West rifle section'),
                  ('mg',3,4,'A','MG 42 west position'),('sniper',2,1,'A','Village marksmen'),
                  ('leader',7,2,'B','Farm command'),('squad',6,4,'B','East rifle section'),
                  ('mg',6,3,'B','MG 42 east position'),('engineer',8,2,'B','Village pioneers')]}
    else:
        layouts = {
            'us':[('leader',3,3,'A','Marine assault command'),('squad',3,4,'A','Marine rifle section A'),
                  ('squad',4,4,'A','Marine rifle section B'),('engineer',3,5,'A','Demolition team A'),
                  ('mg',4,3,'A','Browning support team'),('leader',3,8,'B','Marine support command'),
                  ('squad',3,9,'B','Marine rifle section C'),('scout',4,8,'B','Ridge reconnaissance'),
                  ('engineer',4,9,'B','Demolition team B'),('mortar',3,10,'B','60 mm mortar team')],
            'de':[('leader',9,3,'A','Northern sector command'),('squad',7,3,'A','Northern rifle section'),
                  ('mg',8,2,'A','Type 92 gun team'),('scout',8,4,'A','Ridge patrol'),
                  ('leader',9,8,'B','Southern sector command'),('squad',7,8,'B','Southern rifle section'),
                  ('squad',9,5,'B','Cave reserve section'),('mg',8,7,'B','Type 99 gun team'),
                  ('mortar',10,7,'B','Light mortar team')]}
    result=[]
    for side, layout in layouts.items():
        counts={}
        for kind,x,y,group,label in layout:
            counts[group]=counts.get(group,0)+1
            extra=dict(display_name=label,accuracy_bonus=1 if side=='us' else 0,
                       suppression=3 if kind=='mg' else 4)
            if kind=='sniper':extra.update(hp=2,max_hp=2,personnel=2,range=4,sight=8,snipe_range=7,smoke=1)
            if kind=='mortar':extra.update(shells=2,max_shells=2,mortar_range=6)
            if kind=='engineer':extra.update(demolition_charges=1,max_demolition_charges=1)
            result.append(soldier(side,kind,[x,y],group,counts[group],
                                 'jp' if side=='de' and name=='peleliu' else side,**extra))
    return result


def enabled(state):
    return state.get('small_fronts_version') == VERSION


def initialize(state):
    board=state['battlefield']
    if board.get('small_fronts_version') != VERSION:return state
    state.update(small_fronts_version=VERSION, support={'us':0,'de':0})
    if board.get('aid_posts'):state['_aid_stores']={'us':4,'de':3}
    if board.get('cave_entrances'):state['sealed_caves']=[]
    return state


def aid_post(state, side):
    return next((p for p in state['battlefield'].get('aid_posts',[]) if p['side']==side),None)


def open_caves(state):
    return [p for p in state['battlefield'].get('cave_entrances',[]) if p['id'] not in state.get('sealed_caves',[])]


def enemy_at(state, side, pos):
    from .visibility import active
    return any(active(u) and u['side']!=side and u['pos']==pos for u in state['units'])


def options(state, unit):
    from .combined import INFANTRY
    from .visibility import active, unit_visible_ids
    from .engine import distance
    from . import buildings, domains
    result=dict(field_aid=False,cave_move=[],seal_cave=[])
    if not enabled(state) or not state['ready'] or state['winner'] or unit['side']!=state['turn'] or not active(unit) or unit['pinned'] or unit['ap']<2 or unit['kind'] not in INFANTRY:
        return result
    post=aid_post(state,unit['side'])
    if post:
        result['field_aid']=bool(unit['hp']<unit['max_hp'] and unit.get('aid_round')!=state['round']
            and state.get('_aid_stores',{}).get(unit['side'],0)>0 and distance(unit['pos'],post['pos'])<=1
            and buildings.enterable(state,post['pos']) and not enemy_at(state,unit['side'],post['pos']))
    caves=open_caves(state)
    if unit['side']=='de' and any(p['pos']==unit['pos'] for p in caves):
        seen=unit_visible_ids(state,unit)
        result['cave_move']=[p['pos'][:] for p in caves if p['pos']!=unit['pos'] and buildings.enterable(state,p['pos']) and not domains.blocked(state,unit,p['pos'],seen)]
    if unit['side']=='us' and unit['kind']=='engineer' and unit.get('demolition_charges',0)>0:
        result['seal_cave']=[p['pos'][:] for p in caves if distance(unit['pos'],p['pos'])<=1 and not enemy_at(state,unit['side'],p['pos'])]
    return result


def action(state, unit, action, legal, roll, react):
    from . import domains
    kind=action['kind'];pos=action.get('pos')
    if kind=='field_aid' and legal.get(kind):
        unit['hp']=min(unit['max_hp'],unit['hp']+1)
        unit.update(ap=unit['ap']-2,aid_round=state['round'],overwatch=False)
        state['_aid_stores'][unit['side']]-=1
        return 'Field aid restored 1 strength; one medical supply spent.',[]
    if kind=='cave_move' and pos in legal.get(kind,[]):
        if domains.blocked(state,unit,pos):raise ValueError('The cave exit is blocked by contact. Choose another exit.')
        unit.update(pos=list(pos),ap=0,overwatch=False,entrenched=False,observing=False,camouflaged=False,road_pending=False)
        unit.pop('fire_mark',None)
        return 'Infantry relocated through the cave network; remaining actions ended.',react(state,unit,roll)
    if kind=='seal_cave' and pos in legal.get(kind,[]):
        cave=next(p for p in open_caves(state) if p['pos']==pos)
        state['sealed_caves'].append(cave['id'])
        unit.update(ap=unit['ap']-2,demolition_charges=unit['demolition_charges']-1,overwatch=False)
        return f"{cave['name']} sealed; one demolition charge spent.",[]
    raise ValueError('That small-front order is not available.')


def redact(result, state, side):
    result.pop('_aid_stores',None)
    if enabled(state):
        result['small_fronts_version']=VERSION
        if '_aid_stores' in state:result['medical_supplies']=state['_aid_stores'].get(side,0)
        if 'sealed_caves' in state:result['sealed_caves']=copy.deepcopy(state['sealed_caves'])
        for u in result.get('units',[]):
            if u['side']!=side:u.pop('aid_round',None)
    return result


def goal(state, unit, fallback):
    from .engine import distance
    if not enabled(state):return fallback
    post=aid_post(state,unit['side'])
    if post and unit['hp']==1 and unit['max_hp']>1 and state['_aid_stores'].get(unit['side'],0)>0 and distance(unit['pos'],post['pos'])<=3:
        return post['pos']
    if unit['side']=='us' and unit['kind']=='engineer' and unit.get('demolition_charges'):
        caves=open_caves(state)
        if caves:
            nearest=min(caves,key=lambda p:distance(unit['pos'],p['pos']))
            if distance(unit['pos'],nearest['pos'])<=3:return nearest['pos']
    return fallback


def choices(state, unit, legal, goal, visited):
    from .engine import distance
    result=[]
    def add(score,kind,**data):result.append((score,dict(kind=kind,unit=unit['id'],**data)))
    if legal.get('field_aid'):add(18,'field_aid')
    for pos in legal.get('seal_cave',[]):add(14,'seal_cave',pos=pos)
    for pos in legal.get('cave_move',[]):
        gain=distance(unit['pos'],goal)-distance(pos,goal)
        if gain>0 and tuple(pos) not in visited.get(unit['id'],set()):add(6+2*gain,'cave_move',pos=pos)
    return result
