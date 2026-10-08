"""Original fictional battlefields. Each new match saves its own map snapshot."""
import copy

TILES = {'.': 'field', '=': 'road', 'T': 'woods', 'B': 'building',
         '*': 'objective', '~': 'water', '+': 'bridge', '^': 'tower', 'C': 'church',
         's': 'beach', 'm': 'marsh', 'h': 'bocage', 'k': 'bunker', 'c': 'causeway', 'M':'mountain', 'r':'ridge', 'd':'desert', 'n':'dune', 'w':'wadi', 'o':'oasis'}


def build(key, name, label, rounds, brief, rows):
    board = [[TILES[t] for t in row] for row in rows]
    assert len({len(row) for row in board}) == 1
    objectives = [[x, y] for y, row in enumerate(rows) for x, t in enumerate(row) if t == '*']
    assert len(objectives) == 1
    return dict(id=key, name=name, objective_name=label, rounds=rounds, brief=brief,
                width=len(rows[0]), height=len(rows), objective=objectives[0], map=board)


SCENARIOS = {
    'village': build('village', 'Village Crossing', 'Village square', 8,
                     'The familiar village. Buildings shelter the approaches; the central road is exposed.', [
        '...=...', '...=...', 'T..=..T', '.TB=BT.', '===*===', 'T.B=B.T', '.T.=.T.', '...=...', '...=...',
    ]),
    'orchard': build('orchard', 'Orchard Road', 'Farm crossroads', 10,
                     'A wider battlefield with wooded flanks. Work around the orchard or contest the farm road.', [
        '....=....', '....=....', '.TT.=.TT.', '.T.B=B.T.', '====*====', '.T.B=B.T.', '.TT.=.TT.', '....=....', '....=....',
    ]),
    'stonebridge': build('stonebridge', 'Stonebridge', 'North-bank depot', 12,
                         'Two bridges cross an impassable river. Screen your crossing, then seize the depot on the far bank.', [
        '...=...', '...=...', '.T.=.T.', '..B*B..', '.T.=.T.', '~+~~~+~', '.T.=.T.', '..B=B..', 'T..=..T', '...=...', '...=...',
    ]),
}

# Three approach lanes with lateral roads on both banks. Sparse cover breaks long
# firing corridors without sealing off flanking paths or the bridge exits.
def river_front():
    rows = [['.' for _ in range(18)] for _ in range(18)]
    for y in range(18):
        for x in (3, 8, 14): rows[y][x] = '='
    for y in (5, 6, 12, 15): rows[y] = ['=']*18
    for x, y in [(1,3),(2,3),(5,3),(6,4),(11,3),(12,3),(16,4),
                 (0,7),(1,7),(5,7),(11,7),(16,7),(17,7),
                 (1,10),(5,10),(11,10),(16,10),(2,13),(5,13),
                 (6,14),(10,13),(12,14),(16,13)]: rows[y][x]='T'
    for x, y in [(2,4),(4,4),(7,5),(9,5),(7,7),(9,7),(13,4),(15,5),
                 (2,11),(4,11),(7,11),(9,11),(13,11),(15,11)]: rows[y][x]='B'
    rows[9]=['~']*18
    for x in (3,8,14): rows[9][x]='+'
    rows[6][8]='*'
    board=build('riverfront','Riverfront Offensive','Rail junction',24,
                'Large operation · 18×18 hexes · 15 units per army. Alpha approaches the west bridge, Bravo the center, Charlie the east. Cross the river, use the lateral roads to shift forces, then hold the north-bank rail junction. 24 rounds.',
                [''.join(row) for row in rows])
    board['platoons']=[dict(id='A',name='Alpha',center=3),dict(id='B',name='Bravo',center=8),dict(id='C',name='Charlie',center=14)]
    return board


SCENARIOS['riverfront']=river_front()


def frontier():
    rows=[['.' for _ in range(24)] for _ in range(24)]
    for y in range(24):
        for x in (4,11,19): rows[y][x]='='
    for y in (6,9,14,17): rows[y]=['=']*24
    for y in range(4,20):
        for x in range(24):
            if rows[y][x]=='.' and (x*7+y*11)%19 in (0,1,2): rows[y][x]='T'
    for x,y in [(3,8),(5,8),(10,9),(12,9),(18,8),(20,8),(3,15),(5,15),(10,15),(12,15),(18,15),(20,15)]: rows[y][x]='B'
    for y in (11,12):
        rows[y]=['~']*24
        for x in (4,11,19): rows[y][x]='+'
    rows[9][11]='*'
    board=build('frontier','Operation Long Reach','Forward command depot',36,
                'DSL combined arms · 24×24 · 20 units per army · fog of war. Scout wooded approaches, cross three bridges or ford the river with amphibious troops, and secure the north-bank depot. Commanders, armor, anti-tank guns and airborne reserves. 36 rounds.',
                [''.join(row) for row in rows])
    board.update(dsl_only=True,combined_arms=True,platoons=[dict(id='A',name='Alpha',center=4),dict(id='B',name='Bravo',center=19),dict(id='HQ',name='Command & support',center=11)])
    from .combined import roster
    for side in ('us','de'):
        for u in roster(side,24):
            x,y=u['pos']
            if board['map'][y][x] not in {'road','bridge'}: board['map'][y][x]='field'
    return board


SCENARIOS['frontier']=frontier()


def midway():
    rows=[['~']*26 for _ in range(30)]
    # Broad island chains leave the central channel and both fleet starts open.
    for cx,cy in [(6,14),(19,15),(2,19),(23,10)]:
        for y in range(max(0,cy-3),min(30,cy+4)):
            for x in range(max(0,cx-3),min(26,cx+4)):
                if abs(x-cx)+abs(y-cy)<=4:
                    rows[y][x]='T' if abs(x-cx)+abs(y-cy)<=2 else '.'
    for x,y in [(6,14),(19,15)]:rows[y][x]='B'
    rows[15][13]='*'
    board=build('midway','Midway','Midway sea-control zone',30,
                'DSL island campaign · 26×30 · US vs Japan · 14 warships and 4 amphibious sections per side. Land troops on the island outposts for control points, contest the central sea zone, or sink both enemy carriers. Fictional sandbox, not a historical reenactment.',
                [''.join(row) for row in rows])
    board.update(dsl_only=True,naval=True,island_objectives=[[6,14],[19,15]],platoons=[dict(id='A',name='Task Force A',center=6),dict(id='B',name='Task Force B',center=19)])
    return board


SCENARIOS['midway']=midway()

from .campaigns import add_scenarios
SCENARIOS.update(add_scenarios(build))
from .tidal_gate import scenario as tidal_scenario
SCENARIOS['tidal_gate'] = tidal_scenario(build)
from .theaters import scenarios as theater_scenarios
SCENARIOS.update(theater_scenarios(build))
from .iron_lantern import scenario as lantern_scenario
SCENARIOS['iron_lantern']=lantern_scenario(build)
from .fubar import scenario as fubar_scenario
SCENARIOS['fubar']=fubar_scenario(build)
from .new_fronts import scenarios as new_front_scenarios
SCENARIOS.update(new_front_scenarios(build))
from .deployment import scenarios as deployment_scenarios
SCENARIOS.update(deployment_scenarios(build))
from .observed_fronts import scenarios as observed_scenarios
SCENARIOS.update(observed_scenarios(build))

# New Current operations have no Legacy counterpart. Keep the original catalog
# and its saved IDs frozen rather than automatically creating a Legacy edition.
from .worlds_collide import scenario as worlds_scenario
CURRENT_SCENARIOS = {'worlds_collide': worlds_scenario(build)}


def get_scenario(key='village'):
    from .editions import PREFIX, scenario
    if isinstance(key, str) and key.startswith(PREFIX):
        source = key[len(PREFIX):]
        if source in SCENARIOS:
            return scenario(SCENARIOS[source])
        if source in CURRENT_SCENARIOS:
            return scenario(CURRENT_SCENARIOS[source])
    if not isinstance(key, str) or key not in SCENARIOS:
        raise ValueError('Choose a battlefield from the scenario list.')
    return copy.deepcopy(SCENARIOS[key])


def battlefield(state):
    # Version 1/2 saves have no snapshot: their board remains the original village.
    return state.get('battlefield') or SCENARIOS['village']


def catalog(edition='legacy'):
    from .scenario_browser import describe
    from .editions import PREFIX
    if edition not in {'legacy', 'current'}:
        raise ValueError('Choose Current or Legacy.')
    boards = [get_scenario((PREFIX if edition == 'current' else '')+key) for key in SCENARIOS]
    if edition == 'current':
        boards += [get_scenario(PREFIX+key) for key in CURRENT_SCENARIOS]
    for position, board in enumerate(boards):
        board['browse'] = describe(board, position)
    return boards
