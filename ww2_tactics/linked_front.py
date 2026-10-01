"""Optional linked objectives and scheduled reserves, driven by scenario data."""
from .visibility import active
from .combined import INFANTRY


def initialize(state):
    if not state['battlefield'].get('linked_objectives'): return state
    state['linked_front_version'] = 1
    refresh(state)
    state['log'] = [state['battlefield'].get('linked_brief') or 'Operation Tidal Gate · Americans must hold the inland command post AND either causeway exit with infantry for two consecutive turn endings. Germans must break that link or hold out through round '+str(state['battlefield']['rounds'])+'.']
    return state


def refresh(state):
    if not state.get('linked_front_version'): return
    points = state['battlefield']['linked_objectives']
    # Objective garrisons transmit flags openly. No nearby/hidden enemy counts.
    state['objective_control'] = {p['id']: next((u['side'] for u in state['units']
        if active(u) and u['kind'] in INFANTRY and u['pos'] == p['pos']), None) for p in points}
    if not connected(state): state['hold'] = 0


def connected(state):
    points = state['battlefield']['linked_objectives']; control = state['objective_control']
    return all(control[p['id']] == 'us' for p in points if p['role'] == 'command') and any(
        control[p['id']] == 'us' for p in points if p['role'] == 'exit')


def end_turn(state, side):
    refresh(state)
    if side == 'us':
        state['hold'] = state['hold']+1 if connected(state) else 0
        if state['hold'] >= 2: state['winner'] = 'us'
    elif state['round'] >= state['battlefield']['rounds']: state['winner'] = 'de'
    else: state['round'] += 1


def arrive(state, react, roll):
    """A blocked entry waits; no teleporting, stacking or automatic scouting."""
    messages = []
    for u in state['units']:
        if u['side'] != state['turn'] or not u.get('reserve') or not u.get('arrival_round') or u['arrival_round'] > state['round'] or u['hp'] <= 0:
            continue
        if any(active(other) and other['pos'] == u['pos'] for other in state['units']): continue
        u.update(reserve=False, ap=u['base_ap'], ap_received=u['base_ap'], carried_ap=0, banked_ap=0)
        messages.append(f"{state.get('factions', {}).get(u['side'], u['side'])} reserves arrived.")
        messages.extend(react(state, u, roll))
    return messages


def goal(state, unit):
    """Split computer formations using published objective locations only."""
    points = state['battlefield'].get('linked_objectives')
    if not points: return state['battlefield']['objective']
    target = 'west' if unit.get('platoon') == 'A' else 'east' if unit.get('platoon') == 'B' else 'town'
    return next(p['pos'] for p in points if p['id'] == target)
