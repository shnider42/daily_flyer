"""Recorded visual events. Rendering them never evaluates rules or rolls dice."""
import copy


def record_effect(state, kind, positions):
    state['effect_sequence'] = state.get('effect_sequence', 0)+1
    event = dict(sequence=state['effect_sequence'], revision=state['revision']+1,
                 kind=kind, positions=copy.deepcopy(positions))
    state['effects'] = (state.get('effects', [])+[event])[-32:]
    return event
