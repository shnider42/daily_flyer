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


def get_scenario(key='village'):
    if not isinstance(key, str) or key not in SCENARIOS:
        raise ValueError('Choose Village Crossing, Orchard Road, or Stonebridge.')
    return copy.deepcopy(SCENARIOS[key])


def battlefield(state):
    # Version 1/2 saves have no snapshot: their board remains the original village.
    return state.get('battlefield') or SCENARIOS['village']


def catalog():
    return [get_scenario(key) for key in SCENARIOS]
