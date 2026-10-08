"""Current-only coalition operation, using the existing equipment and role rules."""
import copy

ID = 'worlds_collide'
WIDTH, HEIGHT = 64, 56
SCORE_TARGET = 40
GROUPS = (
    ('A', 'Coastal assault', 24),
    ('B', 'Armor & engineers', 38),
    ('C', 'Mountain & desert force', 55),
    ('D', 'Fleet & landing force', 9),
    ('E', 'Air & airborne force', 45),
)


def roster():
    """Copy authored templates; never alter another operation's roster."""
    from . import air, naval, combined, iron_lantern, theaters, new_fronts, observed_fronts, western
    from .campaigns import unit
    from .scenarios import get_scenario
    from .rulesets import profile

    pools = {
        'combined': combined.roster('us', HEIGHT) + combined.roster('de', HEIGHT),
        'lantern': iron_lantern.roster(),
        'apennine': theaters.roster('apennine'),
        'desert': theaters.roster('desert_signal'),
        'amba': theaters.roster('amba_dawn'),
        'kharkov': new_fronts.roster('kharkov'),
        'dunkirk': new_fronts.roster('dunkirk'),
        'belfry': observed_fronts.roster('belfry_valley'),
        'vire': observed_fronts.roster('vire_crossroads'),
        'western': western.roster('market_garden'),
        'ships': naval.initial(get_scenario('midway'), profile('dsl'))['units'],
        'planes': air.initial(get_scenario('britain'), profile('dsl'))['units'],
    }
    result, counts = [], {}

    def pick(source, kind, side, name=None, variant=None):
        return next(u for u in pools[source] if u['kind'] == kind and u['side'] == side
                    and (name is None or u.get('display_name') == name)
                    and (variant is None or u.get('variant') == variant))

    def add(template, side, group, pos=None, **extra):
        key = side, group
        counts[key] = counts.get(key, 0) + 1
        n = counts[key]
        if pos is None:
            x, y = {'A': (22, 19), 'B': (35, 17), 'C': (52, 17), 'E': (42, 15)}[group]
            pos = [x + (n-1) % 5, y + (n-1) // 5]
        pos = [pos[0], HEIGHT-1-pos[1] if side == 'us' else pos[1]]
        value = copy.deepcopy(template)
        for key in ('carrier_id', 'arrival_round', 'arrival_ap', 'evacuee', 'airlift_reserve'):
            value.pop(key, None)
        faction = value.get('faction', side)
        faction = 'gb' if faction in {'uk', 'et', 'fr'} else 'de' if faction in {'it', 'su'} else faction
        value.update(id=f'{side}-worlds-{group}-{n}', side=side, platoon=group, number=n,
                     pos=pos, reserve=False, faction=faction)
        value.update(extra)
        value.update(ap=value['base_ap'], ap_received=value['base_ap'], banked_ap=0,
                     carried_ap=0, road_pending=False, road_used=False)
        result.append(value)
        return value

    for side in ('us', 'de'):
        # A: complete infantry/support tools, an armored transport and shore troops.
        for kind in ('leader', 'scout', 'squad', 'mg', 'engineer', 'at_team', 'radioman',
                     'mortar', 'sniper', 'supply', 'halftrack', 'amphibious', 'squad'):
            source = 'vire' if kind in {'supply', 'sniper'} else 'lantern' if kind in {
                'engineer', 'at_team', 'radioman', 'mortar', 'halftrack'} else 'combined'
            if kind == 'halftrack' and side == 'de': source = 'combined'
            if kind == 'amphibious' and side == 'us': source = 'vire'
            template = pick(source, kind, side)
            add(template, side, 'A', **(dict(faction='jp') if side == 'de' and kind == 'amphibious' else {}))

        # B: every authored armor family, with the same HP/AP, ammunition and protection.
        for kind in ('leader', 'scout', 'radioman', 'engineer', 'supply', 'at_gun',
                     'at_team', 'mortar', 'squad'):
            add(pick('vire' if kind == 'supply' else 'combined' if kind in {
                'leader', 'scout', 'squad', 'at_gun', 'at_team'} else 'lantern', kind, side), side, 'B')
        tanks = ([('vire', 'us', 'Sherman'), ('lantern', 'us', 'British Sherman'),
                  ('lantern', 'us', 'Sherman Firefly'), ('dunkirk', 'us', 'Matilda rearguard'),
                  ('desert', 'us', 'Crusader tank')] if side == 'us' else
                 [('kharkov', 'de', 'Panzer III'), ('lantern', 'de', 'Panzer IV'),
                  ('lantern', 'de', 'Tiger I'), ('kharkov', 'us', 'T-34/76'),
                  ('kharkov', 'us', 'KV-1 heavy tank'), ('desert', 'de', 'Italian M13/40'),
                  ('amba', 'de', 'Italian L3 tankette')])
        for source, owner, name in tanks:
            extra = dict(faction='de', display_name='Captured ' + name.replace('Italian ', '')) if owner != side or source == 'amba' or name.startswith('Italian ') else {}
            add(pick(source, 'tank', owner, name), side, 'B', **extra)

        # C: shared mountain, desert, concealed infantry and AT-rifle profiles.
        for kind in ('leader', 'scout', 'radioman', 'mountain', 'squad', 'engineer',
                     'mortar', 'sniper', 'supply', 'commando' if side == 'us' else 'mg', 'at_team'):
            source = 'belfry' if kind in {'mortar', 'sniper', 'supply'} else 'desert' if kind == 'at_team' else 'apennine'
            extra = dict(faction='jp') if side == 'de' and kind in {'leader', 'squad', 'radioman', 'engineer'} else {}
            add(pick(source, kind, side), side, 'C', **extra)
        add(pick('amba', 'partisan' if side == 'us' else 'askari', side), side, 'C',
            faction='gb' if side == 'us' else 'jp',
            display_name='Resistance mountain scouts' if side == 'us' else 'Auxiliary mountain squad')

        # D: American fleet versus Japanese fleet; transports own their passengers.
        for i, kind in enumerate(('carrier', 'battleship', 'cruiser', 'cruiser',
                                  'destroyer', 'destroyer', 'destroyer')):
            add(pick('ships', kind, side), side, 'D', [3 + i % 4 * 3, 16 + i // 4 * 3])
        for i in range(2):
            add(pick('ships', 'amphibious', side), side, 'D', [16, 21+i*2])
            craft = add(unit(side, 'landing_craft', [0, 0], 'D', 1, hp=5, max_hp=5,
                range=0, base_ap=3, armor=0, penetration=0, smoke=2, grenades=0, personnel=3),
                side, 'D', [17, 20+i*3], faction='us' if side == 'us' else 'jp')
            passenger = add(pick('lantern', 'engineer' if i == 0 else 'squad', side),
                            side, 'D', [17, 20+i*3], faction='us' if side == 'us' else 'jp')
            passenger['carrier_id'] = craft['id']
        for i, kind in enumerate(('leader', 'radioman', 'supply')):
            add(pick('vire' if kind == 'supply' else 'lantern', kind, side), side, 'D',
                [19+i, 22], faction='gb' if side == 'us' else 'jp')

        # E: actual movable planes, AA, radar and service fields, separate from sorties.
        for i, kind in enumerate(('fighter', 'fighter', 'fighter', 'bomber', 'bomber')):
            template = pick('planes', kind, side if kind == 'fighter' else 'de')
            add(template, side, 'E', [41+i*3, 19], faction=('us' if i in {2,4} else 'gb') if side == 'us' else 'de',
                base_ap=4 if side == 'us' and kind == 'fighter' else template['base_ap'])
        for i, kind in enumerate(('aa_gun', 'aa_gun', 'radar', 'airfield', 'airfield')):
            add(pick('planes', kind, 'de' if kind == 'airfield' and side == 'de' else 'us'),
                side, 'E', [41+i*3, 14], faction='gb' if side == 'us' else 'de')
        for kind in ('leader', 'radioman', 'engineer', 'squad'):
            add(pick('lantern', kind, side), side, 'E')
        if side == 'us':
            add(pick('lantern', 'pathfinder', side), side, 'E')
            add(pick('lantern', 'paratrooper', side, 'US airborne squad'), side, 'E')
            add(pick('western', 'paratrooper', side), side, 'E', faction='gb', display_name='British airborne squad')
            for i in range(4):
                add(pick('lantern', 'paratrooper', side, 'US airborne reserve'), side, 'E', [46+i, 3],
                    reserve=True, airlift_reserve=True, faction='us' if i < 2 else 'gb',
                    display_name='US airborne reserve' if i < 2 else 'British airborne reserve')
        else:
            for i in range(2):
                add(pick('lantern', 'flak', side), side, 'E', [43+i*7, 22])
            add(pick('lantern', 'mg', side), side, 'E')
        # The existing co-op commander seat accompanies the five selectable platoons.
        add(pick('lantern', 'commander', side), side, 'B', [33, 12])
    return result


def scenario(build):
    rows = [['~' if x < 18 else 's' if x < 20 else '.' for x in range(WIDTH)] for _ in range(HEIGHT)]
    for y in range(HEIGHT):
        for x in range(20, WIDTH):
            if 23 <= x <= 33 and 10 <= y <= 45:
                rows[y][x] = 'n' if (x*3+y*7) % 17 < 3 else 'd'
                if y in (23, 32) and 26 <= x <= 31: rows[y][x] = 'w'
                if (x,y) in {(28,22),(29,22),(28,33),(29,33)}: rows[y][x] = 'o'
            elif x >= 52:
                rows[y][x] = 'r' if (x+y) % 5 == 0 else 'M'
            elif 34 <= x <= 47 and 22 <= y <= 33:
                rows[y][x] = 'B' if (x+y) % 3 else '.'
            elif (x*7+y*11) % 23 < 4:
                rows[y][x] = 'T'
            if x in (20,21) and 24 <= y <= 31: rows[y][x] = 'm'
            if x in (32,48) and 20 <= y <= 35 and y % 4: rows[y][x] = 'h'
    # Connected ocean, a shore road, three inland routes and lateral supply roads.
    for y in range(HEIGHT):
        for x in (19,24,38,55): rows[y][x] = '='
    for y in (12,21,34,43):
        for x in range(19, WIDTH): rows[y][x] = '='
    for y in (27,28):
        for x in range(18, WIDTH): rows[y][x] = '~'
        for x in (19,24,38,55): rows[y][x] = 'c' if x == 19 else '+'
    # Small offshore islands leave the main north/south fleet corridor open.
    for cx, cy in ((15,10),(15,45),(15,27)):
        for y in range(cy-1,cy+2):
            for x in range(cx-1,cx+2): rows[y][x] = 's' if x != cx else '.'
        rows[cy][cx] = 'B'
    for x,y in ((34,24),(44,31),(50,24),(59,31)): rows[y][x] = '^'
    for x,y in ((36,25),(42,30)): rows[y][x] = 'C'
    for x,y in ((20,25),(20,30),(53,25),(57,30)): rows[y][x] = 'k'
    # Clear mirrored assembly areas, not the middle of the fighting terrain.
    for x0,x1,y0,y1 in ((22,26,19,21),(35,39,17,20),(52,56,17,20),
                         (41,53,14,19),(43,50,22,22),(19,21,22,22),(33,33,12,12)):
        for y in range(y0,y1+1):
            for x in range(x0,x1+1):
                for row in (y,HEIGHT-1-y):
                    if rows[row][x] not in {'=', '+', 'c'}: rows[row][x] = '.'
    rows[26][38] = '*'
    board = build(ID, 'Worlds Collide', 'Coalition control zones', 64,
        'Current DSL · 64×56 hexes · five platoons per army. Americans and British face Germans and Japanese across an ocean, islands, landing coast, city, desert and mountain passes. Every existing unit class and terrain type is present, including supply squads and the heavy tank families. Hold six control zones: ships capture the two sea lanes, infantry capture four land flags. Each uncontested zone earns 1 point at your own turn end. First to 40 wins; after round 64, higher score wins (Axis wins a tie). Aircraft and tanks support captures but do not capture flags. Allies have four finite commander-called airborne reserves.',
        [''.join(row) for row in rows])
    board['map'][24][40] = 'rubble'
    board['map'][31][40] = 'rubble'
    board.update(dsl_only=True, campaign=ID, joint_ops=True, signals=True, airborne=True,
        logistics=True, fire_control=True, playtest=True, sight_index_version=1, joint_score_target=SCORE_TARGET,
        joint_recon_focus=[9,27], theater='WORLD COLLISION · FICTIONAL COALITION',
        summary='64×56 · five platoons each · every unit class and terrain · six control zones',
        historical_note='Fictional American/British versus German/Japanese coalition. Specialist infantry use the existing mountain/auxiliary/resistance profiles. Captured T-34, KV-1, M13/40 and L3 hulls preserve the other theaters’ equipment rules. This is a combined-arms playtest, not a historical battle.',
        factions={'us':'Americans & British','de':'Germans & Japanese'}, default_control_size='platoons',
        platoons=[dict(id=key,name=f'Platoon {key} · {name}',center=center) for key,name,center in GROUPS],
        joint_objectives=[
            dict(id='sea_west',name='Western sea lane',pos=[6,27],domain='sea',radius=1),
            dict(id='sea_coast',name='Coastal sea lane',pos=[11,28],domain='sea',radius=1),
            dict(id='island',name='Island outpost',pos=[15,27],domain='land',radius=0),
            dict(id='harbor',name='Harbor causeway',pos=[19,27],domain='land',radius=0),
            dict(id='city',name='City command square',pos=[38,26],domain='land',radius=0),
            dict(id='pass',name='Mountain crossing',pos=[55,27],domain='land',radius=0)],
        sectors=[dict(name=name,pos=pos) for name,pos in (
            ('Ocean & island landings',[10,27]),('Landing coast',[19,27]),
            ('Desert & oasis routes',[28,23]),('City & river bridges',[38,27]),
            ('Mountain passes',[55,27]))],
        doctrine={'us':'Faster American armor and fighters, British Firefly and Matilda, Commandos, Pathfinders and four airborne reserves. Coordinate five platoons; radio reports and recon direction remain local to their group.',
                  'de':'Long German gun lanes, Tiger and captured heavy armor, mountain auxiliaries and Japanese fleet torpedoes. Fixed Flak protects approaches. Axis has no paratrooper drops.'},
        reinforcement_brief='Four Allied airborne reserves: two American, two British. The army commander calls at most one per round for 3 AP using the existing scatter, Flak, water and 1-AP arrival rules. No automatic reinforcements or infinite supplies.')
    return board
