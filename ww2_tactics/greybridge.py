"""Compact, saved mission rules for the fictional Greybridge linked operation.

Only the operation's authored Current boards opt in. Mission results, extraction
and the relay consequence are authoritative game state, independent of the UI.
"""
import copy

VERSION = 1
STAGES = ('raid', 'crossing', 'hold', 'withdrawal')
ORDERS = {'sabotage_relay', 'extract'}


def scenarios(build):
    raid_rows = [
        '....=.....', '.TT.=..TT.', '.T.B=B....', '..B.*B.T..',
        '.T..=..T..', '....==....', '.TT.=.B.T.', '..T.=...T.',
        '....=TT...', '.TT.===...', '...T....=.', '.......===',
    ]
    valley_rows = [
        '...=....=...', '.T.=.TT.=.T.', '..B=....=B..', '===B=====B==',
        '.T.=.T..=.T.', '...=.B*B=...', 'T..=....=..T', '~~~+~~~~+~~~',
        'T..=....=..T', '.T.=.TT.=.T.', '============', '...=.B..=...',
        '.TT=....=TT.', '...=....=...',
    ]
    specs = {
        'raid': ('Night Raid', 'Radio relay', 10,
            'Extract at least two infantry teams at the southeast exits by the end of round 10. '
            'Optionally disable the relay: any unpinned infantry team on or adjacent to it can spend 2 AP. '
            'The relay result survives a failed extraction. A disabled relay delays the crossing reserve from round 4 to round 6. '
            'Night sight is 3 hexes, or 4 for scouts; terrain still blocks sight. Extraction costs 1 AP per team.'),
        'crossing': ('Dawn Crossing', 'North-bank depot', 12,
            'Hold the north-bank depot with infantry at the end of two consecutive American turns by the end of round 12. '
            'Use either bridge and the cover on both banks. Two German reserve teams enter from the north in round 4; '
            'disabling the relay in the raid delays them to round 6. Success leads to a bridgehead defense; failure leads to a fighting withdrawal.'),
        'hold': ('Hold the Bridgehead', 'North-bank depot', 8,
            'Hold the north-bank depot with infantry at the end of four consecutive American turns by the end of round 8. '
            'The platoon begins at the captured crossing while German infantry counterattacks from the north. '
            'Losing the depot breaks the consecutive hold; retaking it starts a new count.'),
        'withdrawal': ('Fighting Withdrawal', 'Fallback route', 10,
            'Extract at least four infantry teams at either marked south-edge exit by the end of round 10. '
            'Extraction costs 1 AP per unpinned team on an exit. Hold the approaches long enough for the platoon to get clear. '
            'An orderly withdrawal saves the formation, but the operation has failed to secure the crossing.'),
    }
    result = {}
    for stage, (title, objective, rounds, brief) in specs.items():
        rows = raid_rows if stage == 'raid' else list(valley_rows)
        if stage == 'withdrawal':
            rows[5] = rows[5].replace('*', '.')
            rows[11] = rows[11][:6]+'*'+rows[11][7:]
        board = build('greybridge_'+stage, 'Greybridge · '+title, objective, rounds,
                      brief, rows)
        exits = [[8, 11], [9, 11]] if stage == 'raid' else [[3, 13], [8, 13]] if stage == 'withdrawal' else []
        markers = [dict(id='relay' if stage == 'raid' else 'depot',
                        kind='relay' if stage == 'raid' else 'objective',
                        label=objective, pos=board['objective'][:])]
        markers += [dict(id='exit-'+str(i+1), kind='exit', label='Extraction · 1 AP', pos=p[:])
                    for i, p in enumerate(exits)]
        if stage == 'crossing':
            markers.append(dict(id='reserve', kind='reserve', label='German reserves · round 4', pos=[5, 0]))
        board.update(dsl_only=True, campaign=board['id'], greybridge_version=VERSION,
            greybridge_stage=stage, operation_only=True, playtest=True,
            theater='GREYBRIDGE · FICTIONAL 1944', factions={'us': 'Americans', 'de': 'Germans'},
            summary='Linked operation · compact infantry mission', objective_description=brief,
            historical_note='Fictional operation. Terrain, force sizes and deadlines are playtest values, not historical reconstruction.',
            platoons=[dict(id='A', name='Greybridge platoon', center=4 if stage == 'raid' else 6)],
            greybridge_exits=exits, greybridge_markers=markers,
            greybridge_required=2 if stage in {'raid', 'crossing'} else 4)
        if stage == 'raid':
            board['greybridge_relay'] = board['objective'][:]
        if stage == 'crossing':
            board['reinforcement_brief'] = 'Two German infantry teams enter the north edge in round 4. A blocked entry waits.'
        result[board['id']] = board
    return result


def roster(stage):
    from .theaters import soldier
    core = ['leader', 'squad', 'squad', 'scout', 'engineer', 'mg']
    kinds = core if stage == 'raid' else core + ['squad', 'mortar']
    positions = {
        'raid': {'us': [[1, 9], [2, 9], [1, 10], [2, 8], [3, 9], [2, 10]],
                 'de': [[4, 2], [3, 3], [6, 4], [7, 6], [5, 7], [8, 8]]},
        'crossing': {'us': [[3, 11], [3, 12], [8, 12], [8, 11], [4, 11], [2, 11], [5, 12], [7, 12]],
                     'de': [[6, 3], [6, 5], [3, 5], [8, 4], [9, 6], [4, 4], [3, 0], [8, 0]]},
        'hold': {'us': [[6, 5], [3, 6], [8, 6], [8, 5], [5, 6], [4, 5], [6, 6], [7, 8]],
                 'de': [[5, 1], [3, 2], [8, 2], [9, 3], [2, 3], [6, 2], [3, 0], [8, 0]]},
        'withdrawal': {'us': [[6, 8], [3, 8], [8, 8], [9, 9], [4, 9], [5, 10], [7, 10], [3, 10]],
                       'de': [[6, 4], [3, 6], [8, 6], [9, 5], [4, 5], [6, 5], [3, 4], [8, 3]]},
    }
    if stage not in positions:
        raise ValueError('Unknown Greybridge mission.')
    names = ['Platoon command', 'Able rifle section', 'Baker rifle section',
             'Recon patrol', 'Combat engineers', 'Browning support team',
             'Charlie rifle section', '60 mm mortar team']
    result = []
    for side in ('us', 'de'):
        for i, (kind, pos) in enumerate(zip(kinds, positions[stage][side])):
            reserve = side == 'de' and stage == 'crossing' and i >= 6
            # Reserve support is two ordinary rifle teams, not a fresh mortar.
            if reserve:
                kind = 'squad'
            extra = dict(display_name=names[i] if side == 'us' else
                         ('North-edge reserve '+str(i-5) if reserve else 'German '+kind.replace('_', ' ')+' team'),
                         accuracy_bonus=int(side == 'us'), suppression=3 if kind == 'mg' else 4,
                         sight=4 if stage == 'raid' and kind == 'scout' else 3 if stage == 'raid' else 8 if kind == 'scout' else 6,
                         reserve=reserve)
            if kind == 'mg':
                extra['range'] = 6 if side == 'us' else 7
            if kind == 'mortar':
                extra.update(shells=2, max_shells=2, mortar_range=6, range=2)
            if kind == 'engineer':
                extra.update(bridge_kits=0, demolition_charges=0, repair_kits=0)
            if reserve:
                extra.update(arrival_round=4, greybridge_reserve=True)
            unit = soldier(side, kind, pos, 'A', i+1, side, **extra)
            unit['id'] = side+'-greybridge-'+str(i+1)
            if side == 'us':
                unit['operation_slot'] = 'core-'+str(i+1)
            result.append(unit)
    return result


def enabled(state):
    return (state.get('ruleset') == 'dsl' and state.get('edition') == 'current'
            and state.get('battlefield', {}).get('greybridge_version') == VERSION)


def initialize(state):
    if not enabled(state) or 'greybridge' in state:
        return state
    board = state['battlefield']
    stage = board['greybridge_stage']
    state['greybridge'] = dict(version=VERSION, stage=stage, relay_disabled=False,
        extracted=0, required=board['greybridge_required'], hold=0,
        reserve_round=4 if stage == 'crossing' else None, reserve_arrived=False,
        objective_completed=False, outcome_reason='')
    state.update(evacuated_count=0, evacuated_manifest=[], support={'us': 0, 'de': 0})
    state['log'] = [board['name']+' · '+board['brief']]
    return state


def configure(state, inherited=None):
    """Apply one saved relay result to a fresh, isolated mission template.

    Callers must pass the authoritative previous result, never request-body
    flags. A started mission cannot be reconfigured or have its arrivals reset.
    """
    if not enabled(state):
        return state
    if state.get('revision', 0):
        raise ValueError('A Greybridge mission already in progress cannot be reconfigured.')
    initialize(state)
    status = state['greybridge']
    status['relay_disabled'] = (status['stage'] != 'raid' and isinstance(inherited, dict)
                                and inherited.get('relay_disabled') is True)
    if status['stage'] == 'crossing':
        arrival = 6 if status['relay_disabled'] else 4
        status['reserve_round'] = arrival
        for unit in state['units']:
            if unit.get('greybridge_reserve'):
                unit['arrival_round'] = arrival
        board = state['battlefield']
        board['reinforcement_brief'] = f'Two German infantry teams enter the north edge in round {arrival}. A blocked entry waits.'
        for marker in board['greybridge_markers']:
            if marker['kind'] == 'reserve':
                marker['label'] = f'German reserves · round {arrival}'
        status['consequence'] = ('The relay was disabled. German reserves are delayed from round 4 to round 6.'
                                 if status['relay_disabled'] else 'The relay remained active. German reserves arrive in round 4.')
        state['log'] = [board['name']+' · '+board['brief'], status['consequence']]
    return state


def options(state, unit):
    from .combined import INFANTRY
    from .visibility import active
    from .engine import distance
    result = dict(sabotage_relay=False, extract=False)
    if (not enabled(state) or not state['ready'] or state['winner'] or state['turn'] != 'us'
            or unit['side'] != 'us' or not active(unit) or unit['pinned'] or unit['kind'] not in INFANTRY):
        return result
    status = state['greybridge']
    board = state['battlefield']
    if status['stage'] == 'raid' and not status['relay_disabled'] and unit['ap'] >= 2:
        result['sabotage_relay'] = distance(unit['pos'], board['greybridge_relay']) <= 1
    if status['stage'] in {'raid', 'withdrawal'} and unit['ap'] >= 1:
        result['extract'] = unit['pos'] in board['greybridge_exits']
    return result


def action(state, unit, order, legal):
    kind = order['kind']
    if not enabled(state) or not legal.get(kind):
        raise ValueError('That Greybridge mission order is not available for this team.')
    status = state['greybridge']
    if kind == 'sabotage_relay':
        unit.update(ap=unit['ap']-2, overwatch=False, road_pending=False)
        status['relay_disabled'] = True
        return 'Relay disabled. German reserves in the crossing mission will be delayed from round 4 to round 6.'
    if kind == 'extract':
        unit.update(ap=unit['ap']-1, overwatch=False, road_pending=False)
        state['evacuated_manifest'].append({key: copy.deepcopy(unit[key])
            for key in ('id', 'kind', 'hp', 'display_name', 'operation_slot') if key in unit})
        state['units'].remove(unit)
        status['extracted'] += 1
        state['evacuated_count'] = status['extracted']
        message = f"{unit.get('display_name', 'Infantry team')} extracted safely. {status['extracted']}/{status['required']} teams clear."
        # The removed actor cannot be found by the normal fog report recorder.
        if state.get('fog_of_war'):
            state.setdefault('reports', {}).setdefault('us', dict(log=[], combat=[]))['log'].append(message)
        return message
    raise ValueError('Unknown Greybridge mission order.')


def controlled(state):
    from .combined import INFANTRY
    from .visibility import active
    return any(unit['side'] == 'us' and active(unit) and unit['kind'] in INFANTRY
               and unit['pos'] == state['battlefield']['objective'] for unit in state['units'])


def finish(state, success, reason):
    state['winner'] = 'us' if success else 'de'
    state['greybridge'].update(objective_completed=success, outcome_reason=reason)


def after_order(state):
    if not enabled(state):
        return
    from .combined import INFANTRY
    from .visibility import active
    status = state['greybridge']
    reserves = [u for u in state['units'] if u.get('greybridge_reserve')]
    status['reserve_arrived'] = bool(reserves) and all(not u.get('reserve') for u in reserves)
    if status['stage'] in {'crossing', 'hold'} and not controlled(state):
        state['hold'] = status['hold'] = 0
    if state['winner']:
        return
    remaining = sum(u['side'] == 'us' and active(u) and u['kind'] in INFANTRY for u in state['units'])
    if status['stage'] in {'raid', 'withdrawal'}:
        if status['extracted'] >= status['required']:
            finish(state, True, 'Two infantry teams extracted; the raid extraction objective is complete.' if status['stage'] == 'raid' else
                   'Four teams completed an orderly withdrawal. The crossing remains lost to the operation.')
        elif status['extracted'] + remaining < status['required']:
            finish(state, False, 'Too few surviving infantry teams remain to complete the extraction.')
    elif remaining == 0:
        finish(state, False, 'No surviving American infantry remains to secure the crossing.')


def end_turn(state, side):
    status = state['greybridge']
    if side == 'us' and status['stage'] in {'crossing', 'hold'}:
        state['hold'] = state['hold']+1 if controlled(state) else 0
        status['hold'] = state['hold']
        if state['hold'] >= status['required']:
            finish(state, True, 'The crossing was secured through two consecutive American turn endings.'
                   if status['stage'] == 'crossing' else 'The bridgehead held through four consecutive American turn endings.')
    after_order(state)
    if side == 'de' and not state['winner']:
        if state['round'] >= state['battlefield']['rounds']:
            finish(state, False, 'The mission deadline passed before the required extraction.'
                   if status['stage'] in {'raid', 'withdrawal'} else 'The mission deadline passed before the required consecutive hold.')
        else:
            state['round'] += 1


def goal(state, unit, fallback):
    """German goals use only authored geography, never unseen Allied positions."""
    if not enabled(state) or unit['side'] != 'de':
        return fallback
    stage = state['greybridge']['stage']
    if stage == 'raid' and unit.get('number', 0) >= 4:
        return [5, 7]
    if stage == 'withdrawal':
        return [3, 10] if unit.get('number', 0) % 2 else [8, 10]
    return state['battlefield']['objective']


def night_limit(state, unit):
    if enabled(state) and state['battlefield']['greybridge_stage'] == 'raid':
        return 4 if unit['kind'] == 'scout' else 3
    return None


def redact(result, state, side):
    result.pop('_operation', None)
    if enabled(state):
        result['greybridge'] = copy.deepcopy(state['greybridge'])
        if side != 'us':
            result.pop('evacuated_manifest', None)
    return result
