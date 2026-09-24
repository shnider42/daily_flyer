"""Presentation-only snapshots; no dice or rules are evaluated here."""
import copy


def record_combat(state, modifiers=None, note=None):
    event = copy.deepcopy(state['last_combat'])
    event['round'] = state['round']
    if modifiers is not None:
        event['modifiers'] = dict(modifiers)
    if note:
        event['note'] = note
    for key in ('attacker', 'target'):
        unit = next((u for u in state['units'] if u['id'] == event.get(key)), None)
        if unit:
            role = {'squad': 'rifle squad', 'leader': 'leader', 'mg': 'MG'}[unit['kind']]
            event[key+'_label'] = f"{unit['side'].upper()} {role} · {chr(65+unit['pos'][0])}{unit['pos'][1]+1}"
    state['combat_sequence'] = state.get('combat_sequence', 0)+1
    event['sequence'] = state['combat_sequence']
    state['last_combat'] = event
    state['combat_history'] = (state.get('combat_history', [])+[event])[-40:]
