"""Server-side sight and remembered contacts. Never send the hidden state to a client."""
import copy


def fog(state):
    return bool(state.get('fog_of_war'))


def active(unit):
    return unit['hp'] > 0 and not unit.get('reserve')


def sees_hex(state, side, pos, concealed=False):
    from .engine import distance, line_clear
    for scout in state['units']:
        if scout['side'] != side or not active(scout):
            continue
        reach = 9 if scout['kind']=='scout' else max(6,scout['range']) if scout['kind'] in {'tank','at_gun'} else 6
        if concealed:
            reach = 4 if scout['kind']=='scout' else 2
        gap = distance(scout['pos'], pos)
        if gap <= 1 or (gap <= reach and line_clear(scout['pos'], pos, state.get('smoke', []), state)):
            return True
    return False


def visible_ids(state, side):
    from .engine import terrain
    if not fog(state):
        return {u['id'] for u in state['units']}
    return {u['id'] for u in state['units'] if u['side']==side or
            (active(u) and sees_hex(state, side, u['pos'],
             not u.get('armor') and terrain(*u['pos'],state) in {'woods','building'}))}


def update_intel(state):
    from .engine import terrain
    if not fog(state):
        return
    for side in ('us','de'):
        seen = visible_ids(state, side)
        memory = state.setdefault('intel', {}).setdefault(side, {})
        for uid, contact in list(memory.items()):
            if sees_hex(state, side, contact['pos'], contact['kind'] not in {'tank','amphibious','halftrack'} and terrain(*contact['pos'],state) in {'woods','building'}):
                del memory[uid]
        for unit in state['units']:
            if unit['side'] != side and unit['id'] in seen and active(unit):
                memory[unit['id']] = {k: copy.deepcopy(unit[k]) for k in ('id','side','kind','pos')}
                memory[unit['id']].update(last_seen_round=state['round'],last_seen_turn=state['turn'])


def view(state, side, terrain_visibility=True):
    seen = visible_ids(state, side)
    result = dict(units=copy.deepcopy([u for u in state['units'] if u['id'] in seen]),
                  contacts=copy.deepcopy([u for uid,u in state.get('intel',{}).get(side,{}).items() if uid not in seen]),
                  smoke=copy.deepcopy([s for s in state.get('smoke', []) if sees_hex(state,side,s['pos'])]), barrages=copy.deepcopy(state.get('barrages', [])),
                  round=state['round'], turn=state['turn'], hold=state['hold'], winner=state['winner'])
    if terrain_visibility:
        board=state['battlefield']
        result['visible_hexes']=[[x,y] for y in range(board['height']) for x in range(board['width']) if sees_hex(state,side,[x,y])]
    return result


def record_reports(state, before, action, message):
    if not fog(state):
        return
    for side in ('us','de'):
        seen = before[side] | visible_ids(state,side)
        report=state.setdefault('reports',{}).setdefault(side,dict(log=[],combat=[]))
        actor=next((u for u in state['units'] if u['id']==action.get('unit')),None)
        if action['kind']=='end':
            report['log'].append('Turn ended.' + (' Battle complete.' if state['winner'] else ''))
        elif actor and actor['side']==side:
            report['log'].append(message)
        elif actor and actor['id'] in seen:
            report['log'].append(f"Observed {actor['side'].upper()} {actor['kind']}: {action['kind']}.")
        for event in state.get('combat_history',[]):
            if event.get('revision') != state['revision']:
                continue
            if not any(event.get(k) in seen for k in ('attacker','target')):
                continue
            safe=copy.deepcopy(event)
            for key in ('attacker','target'):
                if safe.get(key) not in seen:
                    safe.pop(key,None)
                    safe[key+'_label']='Unidentified unit'
            if 'recipients' in safe: safe['recipients']=[uid for uid in safe['recipients'] if uid in seen]
            report['combat'].append(safe)


def public_state(state, side):
    if not fog(state):
        return state
    result=copy.deepcopy(state)
    result.update(view(state,side))
    report=state.get('reports',{}).get(side,{})
    result['log']=report.get('log') or ['Fog of war: scout ahead. Dashed contacts mark last sightings, not current positions.']
    result['combat_history']=copy.deepcopy(report.get('combat',[]))
    result['last_combat']=result['combat_history'][-1] if result['combat_history'] else None
    result['action_history']=[a for a in result.get('action_history',[]) if a['side']==side]
    result['effects']=[e for e in result.get('effects',[]) if all(sees_hex(state,side,p) for p in e['positions'])]
    result['computer_orders']=['Only observed enemy actions appear in the replay.'] if result.get('computer_playback') else []
    result.pop('intel',None)
    result.pop('reports',None)
    result.pop('command_used',None)
    return result
