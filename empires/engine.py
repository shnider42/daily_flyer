"""Small, authoritative empire game. Same hex geometry as DSL; independent rules.

Every command is checked here, including AI commands. The browser receives only
its own economy, remembered terrain and currently visible enemies.
"""
import copy
import random
import secrets
from collections import deque

from hex_geometry import distance, line_cells, neighbors

WIDTH, HEIGHT, LAST_ROUND = 16, 12, 40
SIDES = ('river', 'highland')
FACTIONS = {
    'river': {'name': 'River League', 'bonus': '+1 food per city each turn'},
    'highland': {'name': 'Highland Compact', 'bonus': '+1 production per city each turn'},
}
UNITS = {
    'scout': dict(name='Scout', hp=3, ap=3, sight=4, reach=1, cost=12, attack=1, upkeep=1, role='Fast reconnaissance; woods cost 1 AP.'),
    'spearman': dict(name='Spearmen', hp=5, ap=2, sight=3, reach=1, cost=16, attack=2, upkeep=1, role='Front-line infantry; captures cities and holds ground.'),
    'archer': dict(name='Archers', hp=3, ap=2, sight=3, reach=3, cost=18, attack=2, upkeep=1, role='Ranged fire; intervening woods and mountains block shots.'),
    'builder': dict(name='Builders', hp=2, ap=2, sight=2, reach=0, cost=14, attack=0, upkeep=0, role='Build farms, mines and roads near your cities; three charges.'),
    'settler': dict(name='Settlers', hp=2, ap=2, sight=2, reach=0, cost=30, attack=0, upkeep=0, role='Found a city at least 4 hexes from another city.'),
    'galley': dict(name='Galley', hp=6, ap=3, sight=4, reach=2, cost=26, attack=2, upkeep=2, tech='sailing', role='Naval reconnaissance and coastal fire; travels on water.'),
}
BUILDINGS = {
    'granary': dict(name='Granary', cost=20, benefit='+2 food per turn'),
    'workshop': dict(name='Workshop', cost=22, benefit='+2 production per turn'),
    'library': dict(name='Library', cost=24, tech='writing', benefit='+2 knowledge per turn'),
    'market': dict(name='Market', cost=20, benefit='+3 gold per turn'),
    'walls': dict(name='Walls', cost=22, tech='masonry', benefit='+4 city strength and +1 cover'),
}
TECHS = {
    'agriculture': dict(name='Agriculture', cost=14, requires=[], benefit='Farms produce +1 additional food'),
    'masonry': dict(name='Masonry', cost=16, requires=[], benefit='Unlock city walls'),
    'writing': dict(name='Writing', cost=18, requires=[], benefit='Unlock libraries'),
    'sailing': dict(name='Sailing', cost=18, requires=[], benefit='Unlock galleys in coastal cities'),
    'bronze': dict(name='Bronze working', cost=26, requires=['masonry'], benefit='Spearmen deal +1 damage'),
    'engineering': dict(name='Engineering', cost=28, requires=['masonry'], benefit='Mines produce +1 additional production'),
    'cartography': dict(name='Cartography', cost=28, requires=['sailing'], benefit='All units gain +1 sight'),
    'scholarship': dict(name='Scholarship', cost=32, requires=['writing'], benefit='Every city produces +2 knowledge'),
}
PROJECTS = {**UNITS, **BUILDINGS}
TERRAIN_YIELDS = {'grass': (2, 0, 0), 'woods': (1, 1, 0), 'hill': (0, 2, 0), 'water': (1, 0, 1), 'bridge': (0, 0, 1), 'mountain': (0, 0, 0)}


def other(side):
    return SIDES[1] if side == SIDES[0] else SIDES[0]


def key(pos):
    return f'{pos[0]},{pos[1]}'


def tile(s, pos):
    return s['map'][pos[1]][pos[0]]


def around(pos):
    return neighbors(pos, WIDTH, HEIGHT)


def city_at(s, pos):
    return next((c for c in s['cities'] if c['pos'] == list(pos)), None)


def occupants(s, pos):
    return [u for u in s['units'] if u['pos'] == list(pos) and u['hp'] > 0]


def log(s, text, viewers=SIDES):
    s['journal'].append(dict(round=s['round'], text=text, viewers=list(viewers)))
    s['journal'] = s['journal'][-100:]


def new_unit(s, side, kind, pos):
    s['serial'] += 1
    u = dict(id=f'u{s["serial"]}', side=side, kind=kind, pos=list(pos), hp=UNITS[kind]['hp'], ap=UNITS[kind]['ap'], fortified=False, shaken=False, road_used=False, road_bonus=False)
    if kind == 'builder':
        u['charges'] = 3
    s['units'].append(u)
    return u


def new_city(s, side, pos, capital=False):
    names = {'river': ['Hearthford', 'Willowmere', 'Kingsport', 'Eastreach'], 'highland': ['Stonewatch', 'Alderhall', 'Highmere', 'Westhaven']}
    number = s['players'][side]['founded']
    s['players'][side]['founded'] += 1
    s['serial'] += 1
    c = dict(id=f'c{s["serial"]}', side=side, pos=list(pos), name=names[side][min(number, 3)], capital=capital, hp=8, population=1, food=0, production=0, project='granary', buildings=[])
    s['cities'].append(c)
    tile(s, pos).update(terrain='grass', road=True, improvement=None, resource=None)
    return c


def initial(faction='river', mode='solo', difficulty='standard', seed=None):
    if faction not in SIDES or mode not in ('solo', 'human') or difficulty not in ('easy', 'standard'):
        raise ValueError('Choose a valid faction, opponent and difficulty.')
    seed = secrets.randbits(48) if seed is None else seed
    rng = random.Random(seed)
    board = [[dict(terrain='grass', resource=None, improvement=None, road=False) for _ in range(WIDTH)] for _ in range(HEIGHT)]
    for y in range(HEIGHT):
        for x in range(WIDTH // 2):
            t = 'water' if y >= 10 or x == 7 else rng.choices(['grass', 'woods', 'hill', 'mountain'], [53, 25, 19, 3])[0]
            if x == 7 and y in (3, 7):
                t = 'bridge'
            resource = rng.choice(['grain', None, None]) if t == 'grass' else ('iron' if t == 'hill' and rng.random() < .4 else None)
            for xx in (x, WIDTH-1-x):
                board[y][xx].update(terrain=t, resource=resource, road=t == 'bridge')
    # Mirrored approaches give both capitals usable land and a coastal route.
    for x in (2, 3, 4, 5, 6, 9, 10, 11, 12, 13):
        board[5][x].update(terrain='grass', resource=None)
        board[7][x].update(terrain='grass', resource=None)
    for x in (2, 13):
        for y in (4, 6, 8, 9):
            board[y][x].update(terrain='grass', resource=None)
    for x in (4, 11):
        board[4][x].update(terrain='hill', resource='iron')
        board[8][x].update(terrain='grass', resource='ruins')
    s = dict(version=1, revision=0, round=1, turn=faction, human=faction, mode=mode, difficulty=difficulty,
             map=board, cities=[], units=[], players={}, intel={}, journal=[], serial=0,
             diplomacy=dict(war=False, trade=False, offer=None, met=False), winner=None,
             result=None, rng_seed=seed, rolls=0)
    for side in SIDES:
        s['players'][side] = dict(gold=18, knowledge=0, research='agriculture' if side == 'river' else 'masonry', techs=[], discoveries=0, founded=0)
        s['intel'][side] = dict(tiles={}, cities={})
        x = 2 if side == 'river' else 13
        new_city(s, side, [x, 5], True)
        new_unit(s, side, 'spearman', [x, 5])
        new_unit(s, side, 'scout', [x+1 if side == 'river' else x-1, 5])
        new_unit(s, side, 'builder', [x, 6])
        new_unit(s, side, 'settler', [x, 4])
    update_intel(s)
    log(s, 'Two young nations take root in the Riverlands. Develop your cities, explore, or capture the rival capital.')
    return s


def clear_line(s, a, b):
    return all(tile(s, p)['terrain'] not in ('woods', 'mountain') for p in line_cells(tuple(a), tuple(b)))


def visible(s, side):
    sources = [(c['pos'], 3) for c in s['cities'] if c['side'] == side]
    sources += [(u['pos'], UNITS[u['kind']]['sight'] + ('cartography' in s['players'][side]['techs'])) for u in s['units'] if u['side'] == side]
    return {key((x, y)) for y in range(HEIGHT) for x in range(WIDTH)
            if any(distance(p, (x, y)) <= radius and clear_line(s, p, (x, y)) for p, radius in sources)}


def update_intel(s):
    for side in SIDES:
        seen = visible(s, side)
        memory = s['intel'][side]
        for k in seen:
            x, y = map(int, k.split(','))
            memory['tiles'][k] = copy.deepcopy(s['map'][y][x])
            c = city_at(s, [x, y])
            if c:
                memory['cities'][c['id']] = {k: copy.deepcopy(c[k]) for k in ('id', 'side', 'name', 'pos', 'capital', 'hp', 'population')}
                memory['cities'][c['id']]['last_seen'] = s['round']
            if any(u['side'] != side for u in occupants(s, [x, y])) or c and c['side'] != side:
                if not s['diplomacy']['met']:
                    s['diplomacy']['met'] = True
                    log(s, 'First contact. Diplomacy and trade are now available.')


def territory(s, pos, side):
    return any(c['side'] == side and distance(c['pos'], pos) <= 2 for c in s['cities'])


def allowed_move(s, u, pos):
    t = tile(s, pos)
    if (u['kind'] == 'galley') != (t['terrain'] == 'water') or t['terrain'] == 'mountain':
        return False
    here = occupants(s, pos)
    if any(v['side'] != u['side'] for v in here) or len(here) >= 2:
        return False
    c = city_at(s, pos)
    if c and c['side'] != u['side']:
        return False
    return True


def move_cost(s, u, pos):
    road = tile(s, u['pos'])['road'] and tile(s, pos)['road']
    if road:
        return 0 if u['road_bonus'] else 1
    return 2 if tile(s, pos)['terrain'] in ('woods', 'hill') and not (u['kind'] == 'scout' and tile(s, pos)['terrain'] == 'woods') else 1


def shot(s, u, target, city=False):
    t = tile(s, target['pos'])
    cover = int(t['terrain'] in ('woods', 'hill')) + int(target.get('fortified', False))
    if city:
        cover += 1 + int('walls' in target['buildings'])
    return dict(threshold=min(6, 4+min(2, cover)), damage=UNITS[u['kind']]['attack'] + int(u['kind'] == 'spearman' and 'bronze' in s['players'][u['side']]['techs']))


def legal(s, u, seen=None):
    result = dict(moves=[], attacks=[], actions=[])
    if s['winner'] or s['turn'] != u['side']:
        return result
    seen = visible(s, u['side']) if seen is None else seen
    if u['shaken']:
        if u['ap'] >= 1:
            result['actions'].append('rally')
        return result
    for pos in around(u['pos']):
        cost = move_cost(s, u, pos)
        if key(pos) in seen and allowed_move(s, u, pos) and u['ap'] >= cost:
            result['moves'].append(dict(pos=list(pos), cost=cost))
    if u['ap'] >= 2:
        if UNITS[u['kind']]['attack']:
            result['actions'].append('fortify')
        if s['diplomacy']['war']:
            for t in s['units']:
                if t['side'] != u['side'] and key(t['pos']) in seen and 0 < distance(u['pos'], t['pos']) <= UNITS[u['kind']]['reach'] and clear_line(s, u['pos'], t['pos']):
                    result['attacks'].append(dict(id=t['id'], pos=t['pos'], **shot(s, u, t)))
            if u['kind'] == 'spearman':
                for c in s['cities']:
                    if c['side'] != u['side'] and distance(u['pos'], c['pos']) == 1 and not occupants(s, c['pos']):
                        result['attacks'].append(dict(id=c['id'], pos=c['pos'], city=True, **shot(s, u, c, True)))
        t = tile(s, u['pos'])
        if u['kind'] == 'settler' and t['terrain'] in ('grass', 'woods', 'hill') and len([c for c in s['cities'] if c['side'] == u['side']]) < 4 and all(distance(c['pos'], u['pos']) >= 4 for c in s['cities']):
            result['actions'].append('found')
        if u['kind'] == 'builder' and territory(s, u['pos'], u['side']) and not territory(s, u['pos'], other(u['side'])) and not city_at(s, u['pos']):
            if not t['improvement'] and t['terrain'] == 'grass':
                result['actions'].append('farm')
            if not t['improvement'] and t['terrain'] == 'hill':
                result['actions'].append('mine')
            if not t['road'] and t['terrain'] in ('grass', 'woods', 'hill'):
                result['actions'].append('road')
    if u['ap'] >= 1 and u['hp'] < UNITS[u['kind']]['hp'] and territory(s, u['pos'], u['side']):
        result['actions'].append('rest')
    return result


def available_projects(s, c):
    techs = s['players'][c['side']]['techs']
    return {k: v for k, v in PROJECTS.items() if k not in c['buildings'] and
            (not v.get('tech') or v['tech'] in techs) and
            (k != 'settler' or len([v for v in s['cities'] if v['side'] == c['side']]) < 4) and
            (k != 'galley' or any(tile(s, p)['terrain'] == 'water' for p in around(c['pos'])))}


def land_yields(t, techs=()):
    """Potential income from one worked tile; also used for remembered-map help."""
    food, production, gold = TERRAIN_YIELDS[t['terrain']]
    food += int(t['resource'] == 'grain')
    production += int(t['resource'] == 'iron')
    if t['improvement'] == 'farm':
        food += 2 + int('agriculture' in techs)
    if t['improvement'] == 'mine':
        production += 2 + int('engineering' in techs)
    return dict(food=food, production=production, gold=gold)


def city_yields(s, c):
    techs = s['players'][c['side']]['techs']
    values = []
    for y in range(HEIGHT):
        for x in range(WIDTH):
            p = [x, y]
            if p == c['pos'] or distance(c['pos'], p) > 2:
                continue
            # Each hex can support only its nearest city. Stable IDs break ties.
            nearest = min(s['cities'], key=lambda v: (distance(v['pos'], p), v['id']))
            if nearest['id'] != c['id']:
                continue
            value = land_yields(tile(s, p), techs)
            food, production, gold = value['food'], value['production'], value['gold']
            values.append((food+production+gold, food, production, gold, p))
    worked = sorted(values, key=lambda v: (-v[0], -v[1], v[-1]))[:c['population']]
    return dict(food=2 + sum(v[1] for v in worked) + 2*('granary' in c['buildings']) + (c['side'] == 'river') - c['population'],
                production=2 + sum(v[2] for v in worked) + 2*('workshop' in c['buildings']) + (c['side'] == 'highland'),
                gold=2 + sum(v[3] for v in worked) + 3*('market' in c['buildings']),
                knowledge=1 + 2*('library' in c['buildings']) + 2*('scholarship' in techs),
                worked=[v[-1] for v in worked])


def economy(s, side):
    yields = [city_yields(s, c) for c in s['cities'] if c['side'] == side]
    totals = {k: sum(v[k] for v in yields) for k in ('food', 'production', 'gold', 'knowledge')}
    totals['upkeep'] = sum(UNITS[u['kind']]['upkeep'] for u in s['units'] if u['side'] == side)
    totals['gold'] += 3*int(s['diplomacy']['trade']) - totals['upkeep']
    totals['shortage'] = max(0, -s['players'][side]['gold']-totals['gold'])
    return totals


def score(s, side):
    cities = [c for c in s['cities'] if c['side'] == side]
    return 4*len(cities) + sum(c['population'] for c in cities) + 3*len(s['players'][side]['techs']) + s['players'][side]['discoveries']


def spawn_position(s, c, kind):
    options = [tuple(c['pos']), *around(c['pos'])]
    proxy = dict(kind=kind, side=c['side'])
    return next((list(p) for p in options if allowed_move(s, proxy, p)), None)


def finish_production(s, c):
    project = c['project']
    if not project or c['production'] < PROJECTS[project]['cost']:
        return
    if project not in available_projects(s, c):
        c['project'] = None
        return
    if project in UNITS:
        pos = spawn_position(s, c, project)
        if pos is None or sum(u['side'] == c['side'] for u in s['units']) >= 24:
            return
        new_unit(s, c['side'], project, pos)
    else:
        c['buildings'].append(project)
        if project == 'walls':
            c['hp'] += 4
    c['production'] -= PROJECTS[project]['cost']
    c['project'] = None
    log(s, f'{c["name"]} completed {PROJECTS[project]["name"]}.', [c['side']])


def advance(s):
    side = s['turn']
    player = s['players'][side]
    e = economy(s, side)
    player['gold'] = max(0, player['gold']+e['gold'])
    player['knowledge'] += e['knowledge']
    shortage = e['shortage']
    for c in [v for v in s['cities'] if v['side'] == side]:
        y = city_yields(s, c)
        c['food'] += y['food']
        if c['food'] >= 6+c['population']*4 and c['population'] < 6:
            c['food'] -= 6+c['population']*4
            c['population'] += 1
            log(s, f'{c["name"]} grew to population {c["population"]}.', [side])
        if c['food'] < 0:
            c['food'] = 0
            c['population'] = max(1, c['population']-1)
        penalty = min(shortage, y['production'])
        shortage -= penalty
        c['production'] = min(80, c['production']+y['production']-penalty)
        finish_production(s, c)
        c['hp'] = min(8+4*('walls' in c['buildings']), c['hp']+1)
    research = player['research']
    if research and player['knowledge'] >= TECHS[research]['cost']:
        player['knowledge'] -= TECHS[research]['cost']
        player['techs'].append(research)
        player['research'] = None
        log(s, f'{TECHS[research]["name"]} discovered.', [side])
    if side != s['human']:
        if s['round'] >= LAST_ROUND:
            scores = {v: score(s, v) for v in SIDES}
            s['winner'] = 'draw' if scores[SIDES[0]] == scores[SIDES[1]] else max(scores, key=scores.get)
            s['result'] = 'The Riverlands chronicle is complete. Development score decides the campaign.'
            log(s, s['result'])
            return
        s['round'] += 1
    s['turn'] = other(side)
    for u in s['units']:
        if u['side'] == s['turn']:
            u['ap'] = UNITS[u['kind']]['ap'] + min(1, u['ap'])
            u['road_used'] = u['road_bonus'] = False
    update_intel(s)


def apply(s, side, command):
    if not isinstance(command, dict):
        raise ValueError('An order must be an object.')
    if s['winner']:
        raise ValueError('This campaign has ended.')
    if s['turn'] != side:
        raise ValueError('Wait for your turn.')
    kind = command.get('kind')
    player = s['players'][side]
    if kind == 'end':
        advance(s)
    elif kind == 'research':
        name = command.get('tech')
        if name not in TECHS or name in player['techs'] or not set(TECHS[name]['requires']) <= set(player['techs']):
            raise ValueError('That technology is not available.')
        player['research'] = name
    elif kind in ('produce', 'rush'):
        c = next((c for c in s['cities'] if c['id'] == command.get('city') and c['side'] == side), None)
        if not c:
            raise ValueError('Choose one of your cities.')
        if kind == 'produce':
            project = command.get('project')
            if project not in available_projects(s, c):
                raise ValueError('That project is not available in this city.')
            c['project'] = project
        else:
            project = c['project']
            cost = max(0, PROJECTS[project]['cost']-c['production'])*3 if project else 0
            if not cost or player['gold'] < cost:
                raise ValueError('You need 3 gold per missing production to rush this project.')
            if project in UNITS and (spawn_position(s, c, project) is None or sum(u['side'] == side for u in s['units']) >= 24):
                raise ValueError('Make room around this city before completing the unit.')
            player['gold'] -= cost
            c['production'] = PROJECTS[project]['cost']
            finish_production(s, c)
    elif kind == 'diplomacy':
        d = s['diplomacy']
        action = command.get('action')
        if not d['met']:
            raise ValueError('Explore until you meet the other civilization.')
        if action == 'war' and not d['war']:
            d.update(war=True, trade=False, offer=None)
            log(s, f'{FACTIONS[side]["name"]} declared war. Trade is suspended.')
        elif action in ('trade', 'peace') and (action == 'peace') == d['war'] and not (action == 'trade' and d['trade']):
            d['offer'] = dict(side=side, kind=action)
            log(s, f'{FACTIONS[side]["name"]} offered {action}.')
        elif action == 'accept' and d['offer'] and d['offer']['side'] != side:
            offer = d['offer']['kind']
            if offer == 'peace':
                d['war'] = False
            else:
                d['trade'] = True
            d['offer'] = None
            log(s, 'Peace agreed.' if offer == 'peace' else 'Trade agreed: both civilizations earn +3 gold per turn.')
        elif action == 'decline' and d['offer'] and d['offer']['side'] != side:
            d['offer'] = None
            log(s, 'The diplomatic offer was declined.')
        else:
            raise ValueError('That diplomatic action is unavailable.')
    elif kind == 'resign':
        s['winner'] = other(side)
        s['result'] = f'{FACTIONS[side]["name"]} conceded the campaign.'
        log(s, s['result'])
    else:
        u = next((u for u in s['units'] if u['id'] == command.get('unit') and u['side'] == side), None)
        if not u:
            raise ValueError('Select one of your units.')
        options = legal(s, u)
        if kind == 'move':
            move = next((m for m in options['moves'] if m['pos'] == command.get('pos')), None)
            if not move:
                raise ValueError('That hex is not a legal move. Check AP, terrain and occupancy.')
            road = tile(s, u['pos'])['road'] and tile(s, move['pos'])['road']
            free = road and u['road_bonus']
            u['road_bonus'] = bool(road and not free and not u['road_used'])
            if u['road_bonus']:
                u['road_used'] = True
            u.update(pos=move['pos'], ap=u['ap']-move['cost'], fortified=False)
            t = tile(s, u['pos'])
            if t['resource'] == 'ruins':
                t['resource'] = None
                player['gold'] += 8
                player['discoveries'] += 1
                log(s, 'Ancient ruins explored: +8 gold and +1 development point.', [side])
        elif kind == 'attack':
            attack = next((a for a in options['attacks'] if a['id'] == command.get('target')), None)
            if not attack:
                raise ValueError('No legal attack on that target. Check war status, sight, range and AP.')
            target = next(t for t in s['cities' if attack.get('city') else 'units'] if t['id'] == attack['id'])
            u['ap'] -= 2
            u['road_bonus'] = False
            s['rolls'] += 1
            roll = random.Random(s['rng_seed']+s['rolls']*7919).randint(1, 6)
            hit = roll >= attack['threshold']
            audience = [v for v in SIDES if key(u['pos']) in visible(s, v) or v == target['side']]
            log(s, f'{UNITS[u["kind"]]["name"]}: rolled {roll}, needed {attack["threshold"]}+. '+(f'{attack["damage"]} damage.' if hit else 'Missed.'), audience)
            if hit:
                target['hp'] -= attack['damage']
                if not attack.get('city') and target['hp'] > 0:
                    target['shaken'] = True
                    target['fortified'] = False
                if target['hp'] <= 0 and attack.get('city'):
                    target.update(side=side, hp=4, project=None, production=0)
                    log(s, f'{target["name"]} was captured.')
                    if target['capital']:
                        s['winner'] = side
                        s['result'] = f'{FACTIONS[side]["name"]} captured the rival capital.'
            s['units'] = [v for v in s['units'] if v['hp'] > 0]
        elif kind in options['actions']:
            u['road_bonus'] = False
            if kind == 'rally':
                u['shaken'] = False
                u['ap'] -= 1
            elif kind == 'rest':
                u['hp'] = min(UNITS[u['kind']]['hp'], u['hp']+1)
                u['ap'] = 0
            elif kind == 'fortify':
                u['ap'] -= 2
                u['fortified'] = True
            elif kind == 'found':
                c = new_city(s, side, u['pos'])
                s['units'].remove(u)
                log(s, f'{c["name"]} founded.', [side])
            else:
                t = tile(s, u['pos'])
                if kind == 'road':
                    t['road'] = True
                else:
                    t['improvement'] = kind
                u['ap'] -= 2
                u['charges'] -= 1
                log(s, f'{kind.capitalize()} completed at {key(u["pos"])}.', [side])
                if u['charges'] == 0:
                    s['units'].remove(u)
        else:
            raise ValueError('That unit cannot perform this order now.')
    s['revision'] += 1
    update_intel(s)
    return s


def public(s, side):
    seen = visible(s, side)
    memory = s['intel'][side]
    cities = []
    for c in s['cities']:
        if c['side'] == side:
            cities.append(dict(copy.deepcopy(c), yields=city_yields(s, c), projects=available_projects(s, c), visible=True))
        elif c['id'] in memory['cities']:
            cities.append(dict(copy.deepcopy(memory['cities'][c['id']]), visible=key(c['pos']) in seen))
    units = [copy.deepcopy(u) for u in s['units'] if u['side'] == side or key(u['pos']) in seen]
    for u in units:
        if u['side'] != side:
            for k in ('ap', 'road_bonus', 'road_used', 'charges'):
                u.pop(k, None)
    return dict(version=s['version'], revision=s['revision'], round=s['round'], last_round=LAST_ROUND,
                turn=s['turn'], side=side, mode=s['mode'], difficulty=s['difficulty'], width=WIDTH, height=HEIGHT,
                map=[[copy.deepcopy(memory['tiles'].get(key((x,y)))) for x in range(WIDTH)] for y in range(HEIGHT)],
                land_yields={k: land_yields(t, s['players'][side]['techs']) for k, t in memory['tiles'].items()},
                visible=list(seen), units=units, cities=cities, player=copy.deepcopy(s['players'][side]),
                economy=economy(s, side), score=score(s, side), scores={v: score(s,v) for v in SIDES} if s['winner'] else None,
                diplomacy=copy.deepcopy(s['diplomacy']), winner=s['winner'], result=s['result'],
                legal={u['id']: legal(s,u,seen) for u in s['units'] if u['side'] == side},
                journal=[dict(round=v['round'], text=v['text']) for v in s['journal'] if side in v['viewers']],
                factions=FACTIONS, unit_types=UNITS, technologies=TECHS)


def path_step(s, u, goals, seen):
    """Search only remembered terrain; unknown enemies never steer the AI."""
    if not goals:
        return None
    goals = {tuple(p) for p in goals}
    known = s['intel'][u['side']]['tiles']
    start = tuple(u['pos'])
    queue = deque([start]); previous = {start: None}
    while queue:
        p = queue.popleft()
        if p in goals and p != start:
            while previous[p] != start:
                p = previous[p]
            return list(p)
        for nxt in around(p):
            if nxt in previous or key(nxt) not in known:
                continue
            t = known[key(nxt)]['terrain']
            if t == 'mountain' or (u['kind'] == 'galley') != (t == 'water'):
                continue
            if key(nxt) in seen and not allowed_move(s,u,nxt):
                continue
            previous[nxt] = p;queue.append(nxt)
    return None


def computer_turn(s):
    """Bounded heuristic AI; all choices go back through the normal validator."""
    side = s['turn']
    p = s['players'][side]
    d = s['diplomacy']
    if d['offer'] and d['offer']['side'] != side:
        apply(s, side, dict(kind='diplomacy', action='accept'))
    own = [u for u in s['units'] if u['side'] == side]
    if d['met'] and not d['war'] and not d['trade'] and not d['offer']:
        apply(s, side, dict(kind='diplomacy', action='trade'))
    # Standard can choose war, but considers only observed military strength.
    enemies = [u for u in s['units'] if u['side'] != side and key(u['pos']) in visible(s, side)]
    if s['difficulty'] == 'standard' and s['round'] >= 18 and d['met'] and not d['war'] and not d['trade'] and enemies and sum(u['hp'] for u in own if UNITS[u['kind']]['attack']) > 2*sum(u['hp'] for u in enemies):
        apply(s, side, dict(kind='diplomacy', action='war'))
    if not p['research']:
        choice = next((k for k,v in TECHS.items() if k not in p['techs'] and set(v['requires']) <= set(p['techs'])), None)
        if choice:
            apply(s,side,dict(kind='research',tech=choice))
    for c in [c for c in s['cities'] if c['side'] == side and not c['project']]:
        options = available_projects(s,c)
        count = lambda k: sum(u['kind'] == k for u in s['units'] if u['side'] == side) + sum(v['project'] == k for v in s['cities'] if v['side'] == side)
        choices = ([] if count('settler') else ['settler']) + ([] if count('builder') >= 2 else ['builder'])
        if d['war']:
            choices = ['spearman' if count('spearman') < 5 else 'archer'] + choices
        choices += ['workshop','granary','library','market','walls']
        if len(own) < (10 if s['difficulty'] == 'standard' else 7):
            choices += ['spearman','archer','scout']
        choice = next((k for k in choices if k in options), None)
        if choice:
            apply(s,side,dict(kind='produce',city=c['id'],project=choice))
    budget = 72
    for u in list(s['units']):
        if u['side'] != side:
            continue
        for _ in range(5):
            if budget <= 0 or s['winner'] or u not in s['units']:
                break
            seen = visible(s, side)
            opts = legal(s,u,seen)
            cmd = None
            for action in ('rally','found','mine','farm','rest'):
                if action in opts['actions']:
                    cmd = dict(kind=action, unit=u['id']);break
            if not cmd and opts['attacks']:
                target = min(opts['attacks'], key=lambda v: (v['threshold'], not v.get('city',False)))
                cmd = dict(kind='attack',unit=u['id'],target=target['id'])
            if not cmd and opts['moves']:
                known = s['intel'][side]['tiles']
                cells = [list(map(int,k.split(','))) for k in known]
                cities = [c for c in s['cities'] if c['side'] == side] + [c for c in s['intel'][side]['cities'].values() if c['side'] != side]
                if u['kind'] == 'settler':
                    goals = [pos for pos in cells if known[key(pos)]['terrain'] in ('grass','woods','hill') and all(distance(pos,c['pos']) >= 4 for c in cities)]
                elif u['kind'] == 'builder':
                    goals = [pos for pos in cells if known[key(pos)]['terrain'] in ('grass','hill') and not known[key(pos)]['improvement'] and territory(s,pos,side) and not city_at(s,pos)]
                else:
                    targets = [v['pos'] for v in enemies] if d['war'] else []
                    targets += [c['pos'] for c in s['intel'][side]['cities'].values() if c['side'] != side] if d['war'] else []
                    if targets and UNITS[u['kind']]['attack']:
                        goals = [pos for pos in cells if any(0 < distance(pos,t) <= UNITS[u['kind']]['reach'] for t in targets)]
                    else:
                        goals = [pos for pos in cells if any(key(n) not in known for n in around(pos))]
                nxt = path_step(s,u,goals,seen)
                move = next((v for v in opts['moves'] if v['pos'] == nxt), None)
                if move:
                    cmd = dict(kind='move', unit=u['id'], pos=move['pos'])
            if not cmd:
                break
            apply(s,side,cmd);budget -= 1
    if not s['winner']:
        apply(s,side,dict(kind='end'))
    return s
