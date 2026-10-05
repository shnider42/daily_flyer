"""Two fictional, opt-in combined-arms and observation playtests."""
from .new_fronts import support

IDS = ('vire_crossroads', 'belfry_valley')


def roster(name):
    forces = []
    if name == 'vire_crossroads':
        height, starts = 17, (2, 10)
        formations = {
            'us': [('leader','scout','tank','tank','squad','engineer','supply','at_team'),
                   ('leader','scout','tank','commando','amphibious','mortar','radioman','sniper')],
            'de': [('leader','scout','tank','at_gun','mg','engineer','squad','supply'),
                   ('leader','scout','tank','halftrack','mortar','radioman','squad','sniper')]}
    elif name == 'belfry_valley':
        height, starts = 22, (2, 7, 13)
        formations = {
            'us': [('leader','scout','mortar','squad','sniper','engineer','supply'),
                   ('leader','scout','mortar','commando','squad','radioman','tank'),
                   ('leader','scout','mortar','squad','sniper','engineer','supply')],
            'de': [('leader','scout','mortar','squad','sniper','engineer','supply'),
                   ('leader','scout','mortar','mg','squad','radioman','tank'),
                   ('leader','scout','mortar','mg','sniper','engineer','supply')]}
    else:
        raise ValueError('Unknown observation front.')
    for side in ('us', 'de'):
        y, dy = (height-4, 1) if side == 'us' else (3, -1)
        for group, x, kinds in zip(('A','B','C'), starts, formations[side]):
            faction = 'gb' if side == 'us' and (group == 'B' or name == 'belfry_valley') else side
            for i, kind in enumerate(kinds):
                extra = dict(suppression=3 if side == 'de' else 4 if faction == 'gb' else 5)
                if faction == 'us' and kind in {'squad','engineer','commando'}:
                    extra['accuracy_bonus'] = 1
                if kind == 'tank':
                    extra.update(display_name='Sherman' if faction == 'us' else 'Sherman Firefly' if group == 'B' else 'Cromwell' if side == 'us' else 'Panzer IV',
                                 hp=4 if side == 'us' else 5, max_hp=4 if side == 'us' else 5,
                                 base_ap=3 if faction == 'us' else 2, range=6 if faction == 'us' else 8)
                    if side == 'de': extra['display_name'] = 'Panzer IV'
                if kind == 'sniper':
                    extra.update(hp=2, max_hp=2, range=4, sight=8, personnel=2,
                                 base_ap=3 if side == 'us' else 2, snipe_range=6 if side == 'us' else 7,
                                 display_name='Scout sniper team' if side == 'us' else 'Marksman team')
                if name == 'belfry_valley' and kind == 'mortar':
                    extra.update(mortar_range=8 if side == 'us' else 9, shells=3, max_shells=3,
                                 display_name='Mobile mortar team' if side == 'us' else 'Long-range mortar team',
                                 base_ap=3 if side == 'us' else 2)
                if kind == 'amphibious':
                    extra.update(display_name='Amphibious carrier', base_ap=3, hp=4, max_hp=4,
                                 armor=1, range=3, penetration=0, weapon='machine_gun', personnel=3)
                pos = [2,4] if name == 'vire_crossroads' and side == 'de' and kind == 'at_gun' else [x+i%3, y+(i//3)*dy]
                forces.append(support(side, kind, pos, group, i+1, faction, **extra))
        forces.append(support(side, 'commander', [7 if name == 'vire_crossroads' else 8, height-1 if side == 'us' else 0],
                              'HQ', 1, 'gb' if name == 'belfry_valley' and side == 'us' else side))
    return forces


def scenarios(build):
    result = {}
    g = [['.' for _ in range(16)] for _ in range(17)]
    for y in range(17):
        for x in (2,7,12): g[y][x] = '='
    for y in (5,11): g[y] = ['=']*16
    for x,y in ((0,6),(1,6),(4,7),(5,7),(10,6),(14,7),(15,7),
                (0,9),(1,9),(4,10),(5,10),(10,9),(14,10),(15,10)):
        g[y][x] = 'T'
    for x,y in ((3,6),(8,6),(11,7),(3,10),(8,10),(11,9)): g[y][x] = 'B'
    g[8] = ['~']*16
    for x in (2,7,12): g[8][x] = '+'
    g[6][5] = '^'; g[10][10] = '^'; g[8][7] = '*'
    b = build('vire_crossroads', 'Vire Crossroads', 'River junction', 20,
        'Lower-density playtest: two platoons and a commander per side, 17 units each. American mobility and British precision armor face heavier German gun lines, suppression and a half-track. Recon directs its own platoon; spread out to seize three crossings. One ground unit per hex.', [''.join(row) for row in g])
    b.update(summary='16×17 · 17 units per side · two platoons · one unit per hex',
        factions={'us':'Americans & British','de':'Germans'},
        doctrine={'us':'Two fast Shermans and a British Firefly, raiders and an amphibious flank. Scout before trading shots; each platoon has its own recon.',
                  'de':'Two tougher Panzers, a fixed AT gun, machine-gun support and a half-track. Hold lanes with recon support; infantry must protect the guns.'},
        control_points=[dict(id='west',name='West crossing',pos=[2,8],points=1),dict(id='center',name='River junction',pos=[7,8],points=2),dict(id='east',name='East crossing',pos=[12,8],points=1)],
        platoons=[dict(id='A',name='Platoon A · armor',center=3),dict(id='B',name='Platoon B · fire support & maneuver',center=11)])
    result[b['id']] = b

    g = [['.' for _ in range(18)] for _ in range(22)]
    for y in range(22):
        for x in (3,8,14): g[y][x] = '='
    for y in (6,10,15): g[y] = ['=']*18
    # Offset villages screen direct shots. Observation points can see across
    # one low obstacle; mortar positions can remain behind those screens.
    for x,y in ((2,7),(4,8),(6,9),(9,8),(11,9),(13,8),(15,7),
                (2,14),(4,13),(6,12),(9,13),(11,12),(13,13),(15,14)):
        g[y][x] = 'B'
    for x,y in ((0,8),(1,8),(5,8),(7,7),(10,7),(16,9),(17,9),
                (0,13),(1,13),(5,13),(7,14),(10,14),(16,12),(17,12)):
        g[y][x] = 'T'
    for y in range(8,14): g[y][11] = '~'
    for y in (9,12): g[y][11] = '+'
    for x,y in ((4,7),(13,14)): g[y][x] = 'C'
    for x,y in ((4,14),(13,7)): g[y][x] = '^'
    g[10][8] = '*'
    b = build('belfry_valley', 'Belfry Valley', 'Market square', 24,
        'Shared-hex playtest: three platoons and a commander per side, 22 units each. Up to two friendly ground units may share a hex, with at most one vehicle or fixed gun. Churches and clock towers overlook offset villages. Recon directs mortars and armor; snipers hunt observers. Explosives make crowded hexes risky.', [''.join(row) for row in g])
    b.update(summary='18×22 · 22 units per side · three platoons · two per hex', ground_stacking=True,
        factions={'us':'British & Commonwealth','de':'Germans'},
        doctrine={'us':'Faster mortar crews and mobile raiders; shorter mortar and sniper reach. Change position between fire missions and use smoke to cut enemy observation.',
                  'de':'Mortars reach nine hexes; snipers reach seven but need banked AP for aimed shots. Longer reach comes with slower support teams.'},
        control_points=[dict(id='west',name='West lane',pos=[3,11],points=1),dict(id='market',name='Market square',pos=[8,10],points=2),dict(id='east',name='East lane',pos=[14,10],points=1)],
        platoons=[dict(id='A',name='Platoon A · west observers',center=3),dict(id='B',name='Platoon B · central support',center=8),dict(id='C',name='Platoon C · east observers',center=14)],
        sectors=[dict(name='West church',pos=[4,7]),dict(name='East church',pos=[13,14]),dict(name='West clock tower',pos=[4,14]),dict(name='East clock tower',pos=[13,7])])
    result[b['id']] = b
    for b in result.values():
        b.update(dsl_only=True, campaign=b['id'], theater='FICTIONAL WESTERN FRONT · FIRE DIRECTION PLAYTEST',
                 signals=True, logistics=True, fire_control=True, playtest=True,
                 front_mode='armored_control', score_target=10,
                 historical_note='Original fictional maps. Forces, terrain and equipment values are balance experiments, not historical reconstructions.')
        for u in roster(b['id']):
            x,y = u['pos']
            if b['map'][y][x] not in {'road','bridge','objective'}: b['map'][y][x] = 'field'
    return result
