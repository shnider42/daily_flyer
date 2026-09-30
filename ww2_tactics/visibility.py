"""Server-side sight and remembered contacts. Never send the hidden state to a client."""
import copy


def fog(state):
    return bool(state.get('fog_of_war'))


def active(unit):
    return unit['hp'] > 0 and not unit.get('reserve') and not unit.get('carrier_id')


def unit_sees_hex(state, scout, pos, concealed=False):
    from .engine import distance, line_clear, terrain
    from . import operations
    if not active(scout):return False
    gap=distance(scout['pos'],pos)
    high=operations.tower(state,scout)
    landmark=operations.enabled(state) and terrain(*pos,state)=='tower'
    reach=operations.sight_range(state,scout,concealed and not landmark)
    if landmark:reach=max(reach,12)  # Elevated silhouettes work both ways.
    return gap<=1 or (gap<=reach and line_clear(scout['pos'],pos,state.get('smoke',[]),state,high_ground=high or landmark))


def sees_hex(state, side, pos, concealed=False):
    if state.get('air_version'):
        from .air import sees_hex as air_sight
        return air_sight(state,side,pos)
    from .engine import distance, line_clear
    if any(r['side']==side and distance(r['pos'],pos)<=r['radius'] for r in state.get('recon',[])):
        return True
    for scout in state['units']:
        if scout['side'] != side or not active(scout):
            continue
        if unit_sees_hex(state,scout,pos,concealed):
            return True
    return False


def visible_ids(state, side):
    if state.get('air_version'):
        from .air import visible_ids as air_visible
        return air_visible(state,side)
    from .engine import terrain
    if not fog(state):
        return {u['id'] for u in state['units'] if u['side']==side or not u.get('carrier_id')}
    return {u['id'] for u in state['units'] if u['side']==side or
            (active(u) and sees_hex(state, side, u['pos'],
             not u.get('armor') and not u.get('exposed_turns') and terrain(*u['pos'],state) in {'woods','building'}))}


def update_intel(state):
    from .engine import terrain
    from .buildings import observe
    observe(state)
    if not fog(state):
        return
    for side in ('us','de'):
        seen = visible_ids(state, side)
        memory = state.setdefault('intel', {}).setdefault(side, {})
        for uid, contact in list(memory.items()):
            if state.get('air_version'):
                from .air import sees_hex as air_sight, AIRCRAFT
                clear=air_sight(state,side,contact['pos'],contact['kind'] not in AIRCRAFT)
            else:
                clear=sees_hex(state, side, contact['pos'], contact['kind'] not in {'tank','amphibious','halftrack','landing_craft'} and terrain(*contact['pos'],state) in {'woods','building'})
            if clear:
                del memory[uid]
        for unit in state['units']:
            if unit['side'] != side and unit['id'] in seen and active(unit):
                memory[unit['id']] = {k: copy.deepcopy(unit[k]) for k in ('id','side','kind','pos')}
                memory[unit['id']].update(last_seen_round=state['round'],last_seen_turn=state['turn'])


def view(state, side, terrain_visibility=True):
    from .buildings import known
    seen = visible_ids(state, side)
    result = dict(units=copy.deepcopy([u for u in state['units'] if u['id'] in seen]),
                  contacts=copy.deepcopy([u for uid,u in state.get('intel',{}).get(side,{}).items() if uid not in seen]),
                  smoke=copy.deepcopy([s for s in state.get('smoke', []) if sees_hex(state,side,s['pos'])]),
                  barrages=copy.deepcopy([{k:v for k,v in b.items() if k != 'attacker'} for b in state.get('barrages', [])]),
                  recon=copy.deepcopy([r for r in state.get('recon', []) if r['side']==side]),
                  round=state['round'], turn=state['turn'], hold=state['hold'], winner=state['winner'])
    if state.get('building_version'):
        result['buildings'] = dict(known(state, side))
    if state.get('naval_version'):
        result.update(sea_score=copy.deepcopy(state['sea_score']),recon=copy.deepcopy([r for r in state.get('recon',[]) if r['side']==side]))
    if state.get('air_version'):
        result['raid_destroyed']=copy.deepcopy(state.get('raid_destroyed',[]))
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
            faction=state.get('factions',{}).get(actor['side'],actor['side'].upper())
            report['log'].append(f"Observed {faction} {actor['kind']}: {action['kind']}.")
        for event in state.get('combat_history',[]):
            if event.get('revision') != state['revision']:
                continue
            changes = [{k:v for k,v in c.items() if k != 'observers'} for c in event.get('terrain_changes', [])
                       if side in c.get('observers', []) or sees_hex(state, side, c['pos'])]
            if not changes and not any(event.get(k) in seen for k in ('attacker','target')) and not any(i['id'] in seen for i in event.get('impacts', [])):
                continue
            safe=copy.deepcopy(event)
            if 'terrain_changes' in safe: safe['terrain_changes'] = changes
            if state.get('combat_version') and event.get('target') and event['target'] not in seen:
                safe['result'] = 'Fire resolved; target not observed'
                for key in ('threshold', 'modifiers'): safe.pop(key, None)
            for key in ('attacker','target'):
                if safe.get(key) not in seen:
                    safe.pop(key,None)
                    safe[key+'_label']='Unidentified unit'
            if 'recipients' in safe: safe['recipients']=[uid for uid in safe['recipients'] if uid in seen]
            if 'impacts' in safe: safe['impacts']=[i for i in safe['impacts'] if i['id'] in seen]
            # A bombardment coordinate belongs to its shooter or an observer of
            # that hex. Receiving adjacent shrapnel does not reveal the aim point.
            if safe.get('aim') is not None and safe.get('attacker') not in seen and not sees_hex(state, side, safe['aim']):
                safe.pop('aim', None)
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
    result.pop('building_intel',None)
    result.pop('_structure_events',None)
    return result
