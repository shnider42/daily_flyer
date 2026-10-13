"""Recorded visual events. Rendering them never evaluates rules or rolls dice."""
import copy


def record_effect(state, kind, positions, **details):
    state['effect_sequence'] = state.get('effect_sequence', 0)+1
    event = dict(sequence=state['effect_sequence'], revision=state['revision']+1,
                 kind=kind, positions=copy.deepcopy(positions), **copy.deepcopy(details))
    state['effects'] = (state.get('effects', [])+[event])[-32:]
    return event


def record_shot_effect(state, unit, target, hit, kind=None):
    """Use the resolved shot, never another roll, for presentation-only cues."""
    from .domains import is_air
    kind = kind or ('bombing' if unit['kind'] == 'bomber' else
                    'anti_air' if unit['kind'] in {'aa_gun', 'flak'} or unit.get('ship_aa_range')
                    else 'air_fire')
    return record_effect(state, kind, [target['pos']],
                         origin=unit['pos'], origin_unit=unit['id'], origin_layer='air' if is_air(unit) else 'ground',
                         layer='air' if is_air(target) else 'ground', hit=bool(hit),
                         battery='light' if unit['kind'] == 'flak' or unit.get('aa_radius', unit['range']) < 5 else 'heavy')


def visible_effects(state, side, events, snapshots=None):
    """Keep visible impacts while removing unobserved firing coordinates.

    Replay uses its recorded before/after sight, so later sight cannot disclose
    the source of an earlier shot. Air flashes use air sight, not ground sight.
    """
    from .visibility import fog, sees_hex, visible_ids
    if not fog(state):
        result = copy.deepcopy(events)
        for event in result:
            event.pop('origin_unit', None)
        return result

    def seen(pos, layer):
        if snapshots is not None:
            key = 'visible_air_hexes' if layer == 'air' else 'visible_hexes'
            return any(pos in snapshot.get(key, snapshot.get('visible_hexes', []))
                       for snapshot in snapshots)
        return sees_hex(state, side, pos, 'air' if layer == 'air' else False)

    def source_seen(event):
        if event.get('origin_unit'):
            units = (unit for snapshot in snapshots for unit in snapshot.get('units', [])) if snapshots is not None else state['units']
            return any(unit['id'] == event['origin_unit'] and unit['pos'] == event['origin']
                       and (snapshots is not None or unit['id'] in visible_ids(state, side)) for unit in units)
        # Older/custom events without an actor need conservative sight: a
        # visible ground hex does not reveal an infantry gun hidden in cover.
        if snapshots is not None:
            return any(unit.get('pos') == event['origin'] for snapshot in snapshots
                       for unit in snapshot.get('units', []))
        return sees_hex(state, side, event['origin'], 'air' if event.get('origin_layer') == 'air' else True)

    result = []
    for event in events:
        if not all(seen(pos, event.get('layer', 'ground')) for pos in event['positions']):
            continue
        safe = copy.deepcopy(event)
        safe.pop('origin_unit', None)
        if safe.get('origin') is not None and not source_seen(event):
            safe.pop('origin', None)
            safe.pop('origin_layer', None)
        result.append(safe)
    return result
