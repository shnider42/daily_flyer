"""Shared armies with server-enforced command assignments and bounded AI turns.

The existing two-seat protocol stays unchanged. Cooperative credentials live in
a separate table; the game snapshot contains public player IDs, never keys.
"""
from . import deployment

DIFFICULTIES = ('easy', 'standard')


def install(db):
    db.execute('''CREATE TABLE IF NOT EXISTS cooperative_players (
        code TEXT NOT NULL, player_id TEXT NOT NULL, owner_hash TEXT NOT NULL UNIQUE,
        PRIMARY KEY(code, player_id))''')
    db.execute('''CREATE TRIGGER IF NOT EXISTS cooperative_match_delete AFTER DELETE ON match BEGIN
        DELETE FROM cooperative_players WHERE code=OLD.code; END''')


def member(db, row, owner):
    seat = db.execute('SELECT player_id,owner_hash FROM cooperative_players WHERE code=? AND owner_hash=?',
                      (row['code'], owner)).fetchone()
    return dict(seat) if seat else None


def linked_member(db, row, commander):
    if not commander:
        return None
    seat = db.execute('''SELECT p.player_id,p.owner_hash FROM cooperative_players p
        JOIN commander_seats c ON c.owner_hash=p.owner_hash WHERE p.code=? AND c.commander_id=?''',
                      (row['code'], commander['id'])).fetchone()
    return dict(seat) if seat else None


def player_name(value):
    if not isinstance(value, str):
        raise ValueError('Choose a player name.')
    value = ' '.join(value.split())
    if not 2 <= len(value) <= 28 or any(ord(c) < 32 for c in value):
        raise ValueError('Use a player name between 2 and 28 characters.')
    return value


def difficulty(value):
    if value not in DIFFICULTIES:
        raise ValueError('Choose Easy or Standard computer difficulty.')
    return value


def initialize(state, body, pid, name):
    size = body.get('control_size', 'units')
    if size not in ('units', 'platoons'):
        raise ValueError('Choose squad / unit control or platoon control.')
    level = difficulty(body.get('difficulty', 'standard'))
    side = body.get('side', 'us')
    if side not in ('us', 'de'):
        raise ValueError('Choose an army.')
    groups = {}
    units = state['units']
    unit_keys = {u['id']: u['side'] + ':section-' + str(i + 1) for i, u in enumerate(units)}
    labels = {p['id']: p for p in state['battlefield'].get('platoons', [])}
    # Preloaded passengers always belong with their transport, including maps
    # whose passenger platoon differs from the boat's platoon.
    def key(u):
        if u.get('carrier_id'):
            return key(next(v for v in units if v['id'] == u['carrier_id']))
        if u['kind'] == 'commander' or u.get('airlift_reserve'):
            return u['side'] + ':command'
        return u['side'] + ':' + u['platoon'] if size == 'platoons' and u.get('platoon') else unit_keys[u['id']]
    for u in units:
        gid = key(u)
        if gid not in groups:
            p = labels.get(u.get('platoon'), {})
            label = 'Army commander' if gid.endswith(':command') else (
                p.get('side_names', {}).get(u['side'], p.get('name')) if size == 'platoons' else None)
            label = label or u.get('display_name') or {'squad': 'Rifle squad', 'leader': 'Lieutenant', 'mg': 'Machine gun'}.get(u['kind'], u['kind'].replace('_', ' ').capitalize())
            if size == 'units' and not gid.endswith(':command'):
                label += ' ' + (str(u.get('platoon', '')) + str(u.get('number', units.index(u) + 1)))
            groups[gid] = dict(id=gid, side=u['side'], label=label, units=[], owner=None,
                               difficulty=level, command=gid.endswith(':command'))
        groups[gid]['units'].append(u['id'])
    state['coop'] = dict(version=1, phase='lobby', host=pid, control_size=size,
                         players={pid: dict(id=pid, name=player_name(name), side=side, group=None)},
                         groups=groups, done=[], captains={}, default_difficulty=level, transport_consent=[])
    state.update(ready=False, created_side=side)
    state.pop('team_assignment', None)
    available = [g for g in groups.values() if g['side'] == side and not g['command']]
    if not available:
        raise ValueError('This map has no selectable command groups.')
    claim(state, pid, side, available[0]['id'])
    return state


def claim(state, pid, side, gid):
    c = state['coop']
    if c['phase'] != 'lobby':
        raise ValueError('Armies and command groups are locked after the host starts.')
    group = c['groups'].get(gid) if isinstance(gid, str) else None
    if side not in ('us', 'de') or not group or group['side'] != side or group['command']:
        raise ValueError('Choose an available squad or platoon in that army.')
    if group['owner'] not in (None, pid):
        raise ValueError('Another player already controls that group. Choose another.')
    for g in c['groups'].values():
        if g['owner'] == pid:
            g['owner'] = None
    group['owner'] = pid
    c['players'][pid].update(side=side, group=gid, retired=False)
    if pid == c['host']:
        state['created_side'] = side
        command = c['groups'].get(side + ':command')
        if command:
            command['owner'] = pid


def group_for(state, uid):
    return next((g for g in state['coop']['groups'].values() if uid in g['units']), None)


def controlled(state, pid):
    return {uid for g in state['coop']['groups'].values() if g['owner'] == pid for uid in g['units']}


def pending(state, side):
    c = state['coop']
    living = {u['id'] for u in state['units'] if u['hp'] > 0 and not u.get('evacuated')}
    return [pid for pid, p in c['players'].items() if p['side'] == side and
            pid not in c['done'] and living.intersection(controlled(state, pid))]


def humans_alive(state):
    owned = {uid for g in state['coop']['groups'].values() if g['owner'] for uid in g['units']}
    return any(u['id'] in owned and u['hp'] > 0 and not u.get('evacuated') for u in state['units'])


def transport_allowed(state, action, pid):
    """Transport must never let a player/AI commandeer somebody else's infantry."""
    def permitted(uid):
        group = group_for(state, uid)
        return bool(group and (group['owner'] == pid or group['owner'] in state['coop'].get('transport_consent', [])))
    if action.get('kind') == 'load':
        return permitted(action.get('target'))
    if action.get('kind') in ('unload', 'evacuate'):
        return all(permitted(u['id'])
                   for u in state['units'] if u.get('carrier_id') == action.get('unit'))
    return True


def blank_legal():
    return dict(moves=[], targets=[], assaults=[], grenades=[], suppress=[], barrage=[],
                smoke=[], drops=[], inspire=[], command=[], rally=False, dig=False, overwatch=False)


def filter_legal(state, pid, unit, legal):
    c = state['coop']
    if c['phase'] != 'battle' or pid in c['done'] or unit['id'] not in controlled(state, pid):
        return blank_legal()
    if 'load' in legal:
        legal['load'] = [uid for uid in legal['load'] if transport_allowed(state, dict(kind='load', target=uid), pid)]
    for kind in ('unload', 'evacuate'):
        if not transport_allowed(state, dict(kind=kind, unit=unit['id']), pid):
            legal[kind] = [] if isinstance(legal.get(kind), list) else False
    return legal


def public(state, pid):
    c = state['coop']; p = c['players'][pid]; side = p['side']
    # Group rosters are setup metadata. Never publish hidden enemy unit IDs,
    # dynamic casualty counts or the other army's readiness during combat.
    players = [dict(v, captain=c['captains'].get(v['side']) == k,
                    done=k in c['done'] if v['side'] == side else False)
               for k, v in c['players'].items()]
    groups = [{k: v for k, v in g.items() if k != 'units'} | {'count': len(g['units'])}
              for g in c['groups'].values()]
    own = controlled(state, pid)
    needs_advance = c['phase'] == 'battle' and not state.get('winner') and not deployment.active(state) and not pending(state, state['turn'])
    return dict(version=1, phase=c['phase'], host=c['host'], me=pid, is_host=pid == c['host'],
                control_size=c['control_size'], players=players, groups=groups,
                default_difficulty=c['default_difficulty'],
                controlled=sorted(own), done=pid in c['done'],
                transport_consent=pid in c.get('transport_consent', []),
                aboard=any(u['id'] in own and u.get('carrier_id') for u in state['units']),
                waiting_for=pending(state, side), captain=c['captains'].get(side) == pid,
                needs_advance=needs_advance, resolving=c.get('resolving', False),
                auto_advance=bool(needs_advance and c.get('driver') == pid and humans_alive(state)),
                controllers={u['id']: (group_for(state, u['id']) or {}).get('owner')
                             for u in state['units'] if u['side'] == side})


def setup_action(state, pid, body):
    c = state['coop']; operation = body.get('operation')
    if operation == 'claim':
        claim(state, pid, body.get('side'), body.get('group'))
    elif operation == 'difficulty':
        if pid != c['host'] or c['phase'] != 'lobby':
            raise ValueError('Only the host can set computer difficulty before starting.')
        level = difficulty(body.get('difficulty'))
        gid = body.get('group')
        if gid is not None and (not isinstance(gid, str) or gid not in c['groups']):
            raise ValueError('Choose a computer group.')
        for g in c['groups'].values():
            if (gid is None or g['id'] == gid) and g['owner'] is None:
                g['difficulty'] = level
        if gid is None:
            c['default_difficulty'] = level
    elif operation == 'start':
        if pid != c['host'] or c['phase'] != 'lobby':
            raise ValueError('Only the host can start this battle, once.')
        if any(not p.get('group') and not p.get('retired') for p in c['players'].values()):
            raise ValueError('Every joined player must choose a command group before starting.')
        c['phase'] = 'battle'; c['driver'] = pid; state['ready'] = True
        c['captains'] = {side: next((k for k, p in c['players'].items() if p['side'] == side and p.get('group')), None)
                         for side in ('us', 'de')}
        c['captains'][c['players'][c['host']]['side']] = c['host']
        if deployment.active(state):
            for side in ('us', 'de'):
                if not c['captains'][side]:
                    state = deployment.prepare_computer(dict(state, ai_side=side))
                    state.pop('ai_side', None)
        else:
            state = advance(state)
    elif operation == 'handoff':
        target = body.get('player', pid)
        if not isinstance(target, str) or target not in c['players'] or (pid != target and pid != c['host']):
            raise ValueError('Only the player or host can hand a command to the computer.')
        if target == c['host']:
            raise ValueError('The host keeps command. Other players can hand their groups to the computer.')
        for g in c['groups'].values():
            if g['owner'] == target:
                g['owner'] = None
        c['players'][target].update(group=None, retired=True)
        for side in ('us', 'de'):
            if c['captains'].get(side) == target:
                c['captains'][side] = next((k for k, p in c['players'].items()
                    if p['side'] == side and controlled(state, k)), None)
        if c['phase'] == 'battle':
            c['driver'] = pid
            if deployment.active(state):
                state = finish_preparation(state)
            else:
                state = advance(state)
    elif operation == 'transport':
        if c['phase'] != 'battle' or state.get('winner') or type(body.get('allow')) is not bool or not controlled(state, pid):
            raise ValueError('Only an active player can authorize allied transport for their own troops.')
        consent = c.setdefault('transport_consent', [])
        if not body['allow'] and any(u['id'] in controlled(state, pid) and u.get('carrier_id') for u in state['units']):
            raise ValueError('Disembark your troops before withdrawing transport permission.')
        if body['allow'] and pid not in consent:
            consent.append(pid)
        elif not body['allow'] and pid in consent:
            consent.remove(pid)
    elif operation == 'advance':
        if c['phase'] != 'battle' or deployment.active(state) or pending(state, state['turn']):
            raise ValueError('Players still have orders to finish.')
        c['driver'] = pid
        state = advance(state)
    else:
        raise ValueError('Unknown cooperative lobby action.')
    state['revision'] += 1
    return state


def finish_preparation(state):
    from .engine import apply
    for side in ('us', 'de'):
        if not deployment.active(state) or state['deployment']['locked'][side]:
            continue
        if not pending(state, side):
            if not state['coop']['captains'].get(side):
                state = deployment.prepare_computer(dict(state, ai_side=side))
                state.pop('ai_side', None)
            else:
                state = apply(state, side, dict(kind='deploy_lock'))
    if not deployment.active(state):
        state['coop']['done'] = []
        state = advance(state)
    return state


def order(state, pid, action):
    from .engine import apply
    from .order_history import resign
    c = state['coop']; p = c['players'][pid]; side = p['side']; kind = action.get('kind')
    if not isinstance(kind, str):
        raise ValueError('Choose an order.')
    if c['phase'] != 'battle' or not state['ready'] or state.get('winner'):
        raise ValueError('Wait for the host to start an active battle.')
    if kind in ('undo', 'redo'):
        raise ValueError('Shared battle orders are committed immediately so teammates cannot undo each other.')
    if kind == 'resign':
        if c['captains'].get(side) != pid:
            raise ValueError('Only your army captain can concede the whole army. You can hand your group to the computer.')
        return resign(state, side)
    if pid in c['done']:
        raise ValueError('Your orders are finished. Wait for the next turn.')
    if not controlled(state, pid):
        raise ValueError('You have handed your command to the computer.')
    if deployment.active(state):
        if kind == 'deploy_lock':
            c['done'].append(pid); c['driver'] = pid; state['revision'] += 1
            return finish_preparation(state)
        if kind in ('deploy_bunker', 'deploy_fire'):
            if c['captains'].get(side) != pid:
                raise ValueError('Your army captain sets the shared bunkers and naval fire.')
        elif kind != 'deploy_unit':
            raise ValueError('Place your units, then finish your preparation. Army-wide resets are unavailable in shared battles.')
    elif state['turn'] != side:
        raise ValueError('Wait for your army’s turn.')
    elif kind == 'end':
        c['done'].append(pid); c['driver'] = pid; state['revision'] += 1
        return advance(state)
    if kind not in ('deploy_bunker', 'deploy_fire') and action.get('unit') not in controlled(state, pid):
        raise ValueError('That unit belongs to another player or the computer.')
    if not transport_allowed(state, action, pid):
        raise ValueError('The troop owner must allow allied transport in Team orders before you can carry them.')
    before = {u['id'] for u in state['units']}
    movies = state.get('_coop_replays')
    current = {k:v for k,v in state.items() if k != '_coop_replays'}
    result = apply(current, side, action)
    if movies is not None:
        result['_coop_replays'] = movies
    if result.get('action_history'):
        result['action_history'][-1]['player'] = pid
    group = group_for(result, action.get('unit'))
    if group:
        group['units'].extend(u['id'] for u in result['units'] if u['id'] not in before)
    return result


def advance(state):
    """Small maps: at most two turns. Large maps: short resumable AI batches."""
    from .computer import play_turn
    large = len(state['units']) > 40
    continuing = state['coop'].get('resolving') and humans_alive(state)
    movies = {side: list(state.get('_coop_replays', {}).get(side, {}).get('frames', [])) if continuing else [] for side in ('us', 'de')}
    changed = False
    for _ in range(2):
        if state.get('winner') or deployment.active(state) or pending(state, state['turn']):
            break
        before_side = state['turn']
        state = play_turn(dict(state, ai_side=before_side), observers=('us', 'de'), max_orders=6 if large else None)
        state.pop('ai_side', None)
        for side in movies:
            movies[side].extend(state['_coop_replays'][side]['frames'])
        if state['turn'] != before_side:
            state['coop']['done'] = []
        changed = True
        if large:
            break
    if changed:
        state['_coop_replays'] = {side: dict(id=state['revision'], frames=frames) for side, frames in movies.items()}
    state['coop']['resolving'] = bool(large and not state.get('winner') and not pending(state, state['turn']) and humans_alive(state))
    return state
