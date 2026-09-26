"""Original fictional battlefields. Each new match saves its own map snapshot."""
import copy

TILES = {'.': 'field', '=': 'road', 'T': 'woods', 'B': 'building',
         '*': 'objective', '~': 'water', '+': 'bridge'}


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


def get_scenario(key='village'):
    if not isinstance(key, str) or key not in SCENARIOS:
        raise ValueError('Choose a battlefield from the scenario list.')
    return copy.deepcopy(SCENARIOS[key])


def battlefield(state):
    # Version 1/2 saves have no snapshot: their board remains the original village.
    return state.get('battlefield') or SCENARIOS['village']


def catalog():
    return [get_scenario(key) for key in SCENARIOS]
