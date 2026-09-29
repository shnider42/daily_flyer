"""Role abilities and delayed support. Legal choices are shared with every client."""
from .combat_display import record_combat
from .rulesets import dsl, command_key, turn_limit
from .effects import record_effect
from .visibility import active, visible_ids
from . import combined, weapons


def role_options(state, unit, distance, line_clear, terrain, board):
    result = dict(grenades=[], suppress=[], inspire=[], barrage=[], command=[])
    if state.get('rules_version', 1) < 4 or unit['pinned']:
        return result
    living = [u for u in state['units'] if active(u)]
    commander=unit['kind']=='commander'
    radius = unit.get('command_radius', 2 if commander else 1) if weapons.enabled(state) else 2 if commander else 1
    if unit['kind'] in {'leader','commander'} and unit['ap'] >= 1:
        result['inspire'] = [u['id'] for u in living if u['side'] == unit['side']
                             and u['pinned'] and distance(unit['pos'], u['pos']) <= radius
                             and (commander or not unit.get('platoon') or u.get('platoon') == unit['platoon'])]
    if unit['ap'] < 2:
        return result
    key = command_key(unit)
    if dsl(state) and unit['kind'] in {'leader','commander'} and key not in state.get('command_used', []):
        result['command'] = [u['id'] for u in living if u['side'] == unit['side']
                             and (commander or u.get('platoon') == unit.get('platoon')) and u['kind'] not in {'leader','commander'}
                             and not u['pinned'] and u.get('ap_received', 2) < turn_limit(u)
                             and 0 < distance(unit['pos'], u['pos']) <= radius]
    elif unit['kind'] == 'leader' and unit.get('platoon') and key not in state.get('command_used', []):
        result['command'] = [u['id'] for u in living if u['side'] == unit['side']
                             and u.get('platoon') == unit['platoon'] and u['kind'] != 'leader'
                             and not u['pinned'] and u['ap'] < 2 and distance(unit['pos'], u['pos']) == 1]
    seen=visible_ids(state,unit['side'])
    visible = [u for u in living if u['side'] != unit['side'] and u['id'] in seen
               and line_clear(unit['pos'], u['pos'], state.get('smoke', []), state)]
    if unit['kind'] in {'squad','engineer','paratrooper'} and unit.get('grenades', 0):
        result['grenades'] = [dict(id=u['id'], threshold=5 if terrain(*u['pos'], state)
                                  in {'woods', 'building', 'objective'} else 4)
                              for u in visible if distance(unit['pos'], u['pos']) <= 2 and not u.get('armor')
                              and (not weapons.enabled(state) or weapons.damage(unit, u, 'fragmentation'))]
    if unit['kind'] in {'mg','halftrack'}:
        reach=5 if unit['kind']=='halftrack' else 6 if combined.enabled(state) and unit['side']=='de' else 4
        result['suppress'] = [u['id'] for u in visible if distance(unit['pos'], u['pos']) <= reach
                              and not u['pinned'] and not u.get('armor')
                              and (not weapons.enabled(state) or weapons.protection(u) == 'infantry')]
    if unit['kind'] in {'leader','commander'} and state.get('support', {}).get(unit['side'], 0) and not (weapons.enabled(state) and unit.get('artillery_range')):
        result['barrage'] = [[x, y] for y in range(board['height']) for x in range(board['width'])
                             if distance(unit['pos'], [x, y]) <= (8 if commander else 6)
                             and line_clear(unit['pos'], [x, y], state.get('smoke', []), state)]
    return result


def role_action(state, unit, action, legal, roll, distance, names):
    kind, side = action['kind'], unit['side']
    if kind == 'command' and dsl(state) and legal['command']:
        if action.get('target') is not None:
            raise ValueError('DSL On your feet affects the eligible platoon group; do not select a single target.')
        recipients = [u for u in state['units'] if u['id'] in legal['command']]
        unit['ap'] -= 2
        for target in recipients:
            target['ap'] += 1
            target['ap_received'] = target.get('ap_received', 2)+1
        state.setdefault('command_used', []).append(command_key(unit))
        state['last_combat'] = dict(kind='On your feet', result=f'{len(recipients)} platoon units gained 1 AP each',
                                   attacker=unit['id'], recipients=[u['id'] for u in recipients], revision=state['revision']+1)
        record_combat(state, note=f"Costs 2 AP. Commander: radius {unit.get('command_radius',2)} across platoons; LT: adjacent own platoon. Officers excluded. Each recipient is limited to base AP plus its banking allowance; once per command group per turn.")
        return f"{names[side]} {unit['kind']} issued On your feet: {len(recipients)} units each gained 1 AP."
    if kind == 'command' and action.get('target') in legal['command']:
        target = next(u for u in state['units'] if u['id'] == action['target'])
        unit['ap'] -= 2
        target['ap'] += 1
        state.setdefault('command_used', []).append(side+':'+unit['platoon'])
        state['last_combat'] = dict(kind='On your feet', result='one action restored to platoon unit',
                                    attacker=unit['id'], target=target['id'], revision=state['revision']+1)
        record_combat(state, note='Costs the LT 2 actions. Adjacent, unpinned squad or MG in his own platoon; maximum 2 actions. Once per platoon per turn.')
        return f"{names[side]} LT {unit['platoon']}{unit['number']} restored one action to {target['platoon']}{target['number']}."
    if kind == 'inspire' and legal['inspire']:
        for u in state['units']:
            if u['id'] in legal['inspire']:
                u['pinned'] = False
        unit['ap'] -= 1
        return f"{names[side]} leader rallied {len(legal['inspire'])} nearby unit(s). Their actions are preserved."
    if kind == 'suppress' and action.get('target') in legal['suppress']:
        target = next(u for u in state['units'] if u['id'] == action['target'])
        die=roll() if combined.enabled(state) or weapons.enabled(state) else None
        success=die is None or die>=combined.suppression_threshold(unit)
        if success: target['pinned'], target['overwatch'] = True, False
        unit['ap'] -= 2
        state['last_combat'] = dict(kind='Suppressive fire', result='target pinned; no strength lost' if success else 'suppression failed',
                                    attacker=unit['id'], target=target['id'], revision=state['revision']+1)
        if die is not None: state['last_combat'].update(roll=die,threshold=combined.suppression_threshold(unit))
        record_combat(state, note='DSL combined arms: German suppression 3+, US 5+; no damage.' if die is not None else 'Automatic effect: a legal suppression order does not roll a die.')
        return f"{names[side]} {unit['kind']} suppressive fire: {'target pinned, overwatch cancelled' if success else 'failed'}; no damage."
    if kind == 'grenade':
        shot = next((s for s in legal['grenades'] if s['id'] == action.get('target')), None)
        if shot:
            target = next(u for u in state['units'] if u['id'] == shot['id'])
            unit['ap'] -= 2
            unit['grenades'] -= 1
            die = roll()
            impacts = []
            if weapons.enabled(state):
                result, impacts = weapons.resolve(state, unit, target, die, shot['threshold'], 'fragmentation')
            elif die >= shot['threshold']:
                target['hp'] = max(0, target['hp']-2)
                target['pinned'], target['overwatch'] = True, False
            if not weapons.enabled(state):
                result = 'eliminated' if target['hp'] <= 0 else 'hit for 2 and pinned' if die >= shot['threshold'] else 'missed'
            state['last_combat'] = dict(kind='Grenade', roll=die, threshold=shot['threshold'], result=result,
                                        attacker=unit['id'], target=target['id'], impacts=impacts, revision=state['revision']+1)
            record_combat(state, {'cover': shot['threshold']-4}, 'One frag spent. A hit deals 2 damage and pins; no advance.')
            return f"{names[side]} threw a fragmentation grenade: rolled {die}, needed {shot['threshold']}+. Target {result}."
    if kind == 'barrage' and action.get('pos') in legal['barrage']:
        unit['ap'] -= 2
        state['support'][side] -= 1
        pos = list(action['pos'])
        area = [[x, y] for y, row in enumerate(state['battlefield']['map']) for x in range(len(row))
                if distance(pos, [x, y]) <= 1]
        state.setdefault('barrages', []).append(dict(side=side, pos=pos, area=area, ttl=2, attacker=unit['id']))
        return f"{names[side]} called a mortar barrage at {chr(65+pos[0])}{pos[1]+1}. Impact at the end of the opponent's turn. Clear all marked hexes!"
    raise ValueError('That role ability is unavailable. Check the unit, actions, range and sight lines.')


def resolve_barrages(state, names, roll=None):
    messages, remaining = [], []
    for strike in state.get('barrages', []):
        if strike['ttl'] > 1:
            remaining.append(dict(strike, ttl=strike['ttl']-1))
            continue
        record_effect(state, 'explosion', strike['area'])
        if weapons.enabled(state) and strike.get('weapon') == 'artillery':
            messages.append(weapons.resolve_artillery(state, strike, roll))
            continue
        affected = [u for u in state['units'] if active(u) and u['pos'] in strike['area']]
        if weapons.enabled(state):
            impacts = [weapons.impact_record(u, weapons.impact(state, u, 1, strip_cover=True))
                       for u in affected if weapons.protection(u) == 'infantry']
            result = 'Mortar fragments hit the marked area; unobserved effects unknown'
            messages.append(result + '.')
            state['last_combat'] = dict(kind='Mortar barrage', attacker=strike.get('attacker'), impacts=impacts,
                                       result=result, revision=state['revision']+1)
            record_combat(state, note='Infantry in the area takes 1 damage, is pinned and loses dug-in cover, including friendlies. Vehicles, armor, ships and aircraft are unaffected. No roll.')
            continue
        for u in affected:
            u['pinned'], u['overwatch'], u['entrenched'] = True, False, False
        result = f"{len(affected)} unit(s) pinned and stripped of dug-in cover; no strength lost"
        messages.append(f"{names[strike['side']]} mortar barrage landed: {result}.")
        state['last_combat'] = dict(kind='Mortar barrage', result=result, revision=state['revision']+1)
        record_combat(state, note='Automatic effect: all units in the marked area are pinned and lose dug-in cover. No damage roll.')
    state['barrages'] = remaining
    return messages
