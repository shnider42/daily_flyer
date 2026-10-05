"""Opt-in platoon fire direction. Existing saved battles keep their rules.

Marks describe observed hexes, never hidden occupants or tracking targets.
Human and computer orders use the same previews and ownership checks.
"""
from .visibility import active, unit_sees_hex

VERSION = 1
SCOUTS = {'scout', 'pathfinder'}
GUNS = {'tank', 'at_gun'}


def enabled(state):
    return state.get('fire_control_version') == VERSION


def initialize(state):
    if state.get('ruleset') == 'dsl' and state['battlefield'].get('fire_control'):
        state['fire_control_version'] = VERSION
    return state


def spotter(state, unit, pos):
    if not enabled(state) or state['turn'] != unit['side']:
        return None
    for scout in state['units']:
        mark = scout.get('fire_mark', {})
        if (scout['side'] == unit['side'] and scout.get('platoon') == unit.get('platoon')
                and scout['kind'] in SCOUTS and active(scout) and not scout['pinned']
                and scout.get('observing') and mark.get('round') == state['round']
                and mark.get('pos') == pos and unit_sees_hex(state, scout, pos)):
            return scout
    return None


def modifiers(state, unit, pos):
    from .engine import distance
    if unit['kind'] not in GUNS or not spotter(state, unit, pos):
        return {}
    return dict(recon_support=-1, extended_range=int(distance(unit['pos'], pos) > unit['range']))


def direct_range(state, unit, pos):
    return unit['range'] + int(unit['kind'] in GUNS and bool(spotter(state, unit, pos)))


def options(state, unit):
    from .operations import cells
    from .operations import sight_range
    result = dict(spot_fire=[])
    if (not enabled(state) or unit['kind'] not in SCOUTS or not active(unit)
            or not state['ready'] or state.get('winner') or unit['side'] != state['turn']
            or unit['pinned'] or unit['ap'] < 1 or not unit.get('observing')
            or unit.get('spot_round') == state['round']):
        return result
    result['spot_fire'] = [p for p in cells(state, unit['pos'], sight_range(state, unit))
                           if unit_sees_hex(state, unit, p)]
    return result


def mark(state, unit, action, legal):
    from .coordinates import column
    pos = action.get('pos')
    if pos not in legal.get('spot_fire', []):
        raise ValueError('Spot for fire needs active Observe, 1 AP and a hex this recon team can see. Once per turn.')
    unit.update(ap=unit['ap']-1, spot_round=state['round'],
                fire_mark=dict(pos=list(pos), round=state['round']), overwatch=False)
    return f"Platoon {unit.get('platoon', 'HQ')} fire direction at {column(pos[0])}{pos[1]+1}. Same-platoon guns gain -1 to hit; one extra hex cancels that bonus. Mortars need 4+ instead of 5+. Ends with this army turn or loss of observation."


def mortar_hexes(state, unit):
    from .operations import cells
    from .engine import distance
    from . import signals
    if not enabled(state) or not unit.get('mortar_range') or not unit.get('shells') or unit.get('mortar_round') == state['round']:
        return []
    reports = {tuple(c['pos']) for c in signals.reports_for(state, unit['side'])}
    return [dict(pos=p, threshold=4 if spotter(state, unit, p) else 5,
                 guided=bool(spotter(state, unit, p)), indirect=True, fringe=False)
            for p in cells(state, unit['pos'], unit['mortar_range']) if distance(unit['pos'], p) >= 2
            and (signals.group_sees(state, unit['side'], signals.group(unit), p) or tuple(p) in reports)]


def mortar_action(state, unit, action, legal):
    from .operations import cells
    shot = next((s for s in legal.get('area_fire_details', []) if s['pos'] == action.get('pos')), None)
    if not shot or not shot.get('indirect'):
        raise ValueError('Indirect fire needs 2 AP, a shell, and a locally observed or radio-reported hex inside the mortar range. Once per turn.')
    unit.update(ap=unit['ap']-2, shells=unit['shells']-1, mortar_round=state['round'], overwatch=False)
    state.setdefault('barrages', []).append(dict(side=unit['side'], pos=list(shot['pos']),
        area=cells(state, shot['pos'], 1), ttl=2, attacker=unit['id'], weapon='observed_mortar',
        threshold=shot['threshold'], guided=shot['guided']))
    return f"Indirect mortar fire ordered: 2 AP and one shell. {shot['threshold']}+ to land after the enemy turn; all infantry in the marked area is at risk."


def ai_choices(state, unit, legal, seen):
    """Only visible contacts and own platoon equipment inform a fire direction."""
    from .engine import distance, line_clear
    from . import weapons
    if not enabled(state) or unit['kind'] not in SCOUTS:
        return []
    choices = []
    friends = [u for u in state['units'] if u['side'] == unit['side'] and active(u)
               and u.get('platoon') == unit.get('platoon') and not u['pinned'] and u['ap'] >= 2]
    for enemy in seen:
        if enemy['side'] == unit['side'] or not active(enemy) or not unit_sees_hex(state, unit, enemy['pos']):
            continue
        useful = sum(1 for friend in friends if (
            friend['kind'] in GUNS and weapons.damage(friend, enemy)
            and distance(friend['pos'], enemy['pos']) <= friend['range']+1
            and line_clear(friend['pos'], enemy['pos'], state.get('smoke', []), state)) or (
            friend.get('mortar_range') and friend.get('shells') and friend.get('mortar_round') != state['round']
            and weapons.protection(enemy) == 'infantry'
            and 2 <= distance(friend['pos'], enemy['pos']) <= friend['mortar_range']))
        if not useful or spotter(state, unit, enemy['pos']):
            continue
        if legal.get('observe') and unit['ap'] >= 2:
            choices.append((13+useful, dict(kind='observe', unit=unit['id'])))
        elif enemy['pos'] in legal.get('spot_fire', []):
            choices.append((14+useful, dict(kind='spot_fire', unit=unit['id'], pos=list(enemy['pos']))))
    return choices
