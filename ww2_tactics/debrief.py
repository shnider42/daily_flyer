"""Compact factual battle accounting. Private records never leave the server.

Each commander receives only their army's statistics plus public objective
progress. Undo restores the record with the game snapshot; redo never counts
an order twice. Old battles get an explicitly partial record, never invented
history. The record stays bounded for ordinary per-order state copies.
"""
import copy

VERSION = 1
KEY = '_battle_record'
AIR = {'fighter', 'bomber', 'transport_aircraft'}
RESOURCES = {'air_stores': 'service stores', 'supply_packs': 'supply packs',
             'shells': 'mortar shells', 'repair_kits': 'repair kits',
             'bombs': 'bomb loads', 'torpedoes': 'torpedoes', 'fuel': 'fuel'}


def objective(state):
    """Only counters already advertised as public mission progress."""
    from .scenarios import battlefield
    board = battlefield(state)
    if board.get('war_version'):
        return dict(label='Campaign points',values=copy.deepcopy(state['joint_score']),target=70)
    if state.get('britain_ops_version'):
        return dict(label='Raid damage', values={'de': state.get('raid_score', 0)}, target=9)
    if board.get('night_ops_version'):
        return dict(label='Signals station hold', values={'us': state.get('night_hold',0)}, target=2)
    for key, label, target in [('front_score','Control points',board.get('score_target',10)),
                              ('joint_score','Sea / objective control',board.get('joint_score_target',10)),
                              ('sea_score','Sea control',6)]:
        if key in state:
            return dict(label=label, values=copy.deepcopy(state[key]), target=target)
    if state.get('front_mode') == 'evacuation':
        return dict(label='Units evacuated', values={'us': state.get('evacuated_count',0)}, target=6)
    if state.get('air_version'):
        return dict(label='RAF stations lost', values={'de': len(state.get('raid_destroyed',[]))}, target=2)
    return dict(label='Objective hold', values={'us': state.get('hold',0)}, target=2)


def initialize(state, complete=True):
    if KEY in state:
        return state
    armies = {}
    for side in ('us','de'):
        units = [u for u in state['units'] if u['side'] == side and u['hp'] > 0]
        armies[side] = dict(starting_units=len(units), starting_strength=sum(u['hp'] for u in units),
            orders=0, attack_rolls=0, successful_rolls=0, launches=0, landings=0,
            services=0, strength_restored=0, aircraft_lost=0,
            losses={'combat':0, 'fuel':0, 'aboard':0, 'other':0},
            resources={key:0 for key in RESOURCES}, events=[], events_total=0)
    state[KEY] = dict(version=VERSION, complete=complete, start_round=state['round'],
                      pending=state.get('deployment',{}).get('phase') == 'planning',
                      armies=armies, progress=[dict(round=state['round'], side=state['turn'], **objective(state))],
                      weather=[])
    return state


def record(before, after, side, action):
    from .scenarios import battlefield
    if before.get(KEY,{}).get('pending'):
        if after.get('deployment',{}).get('phase') == 'planning' and not after.get('winner'):
            return
        source = after if before.get('deployment',{}).get('phase') == 'planning' else before
        seed = {k:v for k,v in source.items() if k != KEY}
        initialize(seed)
        seed[KEY]['pending'] = False
        after[KEY] = seed[KEY]
        if source is after:
            return
    if KEY not in after:
        # Record the state before the first order on an older saved battle.
        seed = {k:v for k,v in before.items() if k != KEY}
        initialize(seed, complete=False)
        after[KEY] = seed[KEY]
    ledger = after[KEY]
    armies = ledger['armies']; stats = armies[side]
    kind = action.get('kind')
    if kind not in {'end', 'resign'}:
        stats['orders'] += 1
    stats['launches'] += int(kind in {'launch','scramble'})
    stats['landings'] += int(kind in {'land','recover'} and any(
        u['id'] == action.get('unit') and u['hp'] > 0 and u.get('carrier_id') for u in after['units']))
    stats['services'] += int(kind in {'field_service','deck_service','rearm'})
    if kind in {'field_aid','cave_move','seal_cave'}:
        stats[kind]=stats.get(kind,0)+1
    if kind=='field_aid':
        stats['resources']['medical_supplies']=stats['resources'].get('medical_supplies',0)+1
    old_units = {u['id']:u for u in before['units']}
    new_units = {u['id']:u for u in after['units']}
    sequence = before.get('combat_sequence',0)
    combats = []
    for event in reversed(after.get('combat_history',[])):
        if event.get('sequence',0) <= sequence:
            break
        combats.append(event)
    combat_targets = {e.get('target') for e in combats}
    combat_targets.update(impact.get('id') for event in combats for impact in event.get('impacts',[]))
    for event in combats:
        actor = new_units.get(event.get('attacker'))
        if actor and isinstance(event.get('roll'),int) and isinstance(event.get('threshold'),int):
            owner = armies[actor['side']]
            owner['attack_rolls'] += 1
            owner['successful_rolls'] += int(event['roll'] >= event['threshold'])
    def highlight(team, text, pos=None):
        owner = armies[team]
        owner['events_total'] += 1
        owner['events'].append(dict(round=before['round'], revision=after['revision'], text=text,
                                    **({'pos':list(pos)} if pos else {})))
        owner['events'] = owner['events'][-40:]
    for uid, unit in new_units.items():
        old = old_units.get(uid)
        if old is None:
            continue
        owner = armies[unit['side']]
        owner['strength_restored'] += max(0, unit['hp']-old['hp'])
        for resource in RESOURCES:
            owner['resources'][resource] += max(0, old.get(resource,0)-unit.get(resource,0))
        spent=max(0,old.get('demolition_charges',0)-unit.get('demolition_charges',0))
        if spent:owner['resources']['demolition_charges']=owner['resources'].get('demolition_charges',0)+spent
        if old['hp'] > 0 and unit['hp'] <= 0:
            parent = new_units.get(old.get('carrier_id'))
            fuel = (kind == 'end' and (before.get('britain_ops_version') or before.get('war_version')) and unit['side'] == side
                    and unit['kind'] in AIR and not old.get('carrier_id') and old.get('fuel',2) <= 1)
            cause = ('aboard' if parent and parent['hp'] <= 0 else 'fuel' if fuel else
                     'combat' if uid in combat_targets or kind in {'fire','assault','grenade','bombard','area_fire','snipe','strike'} else 'other')
            owner['losses'][cause] += 1
            owner['aircraft_lost'] += int(unit['kind'] in AIR)
            reason = {'aboard':'lost aboard a destroyed carrier, transport or airfield',
                      'fuel':'lost to fuel exhaustion','combat':'lost in combat','other':'lost (other cause)'}[cause]
            label = unit.get('display_name') or unit['kind'].replace('_',' ').capitalize()
            highlight(unit['side'], f'{label}: {reason}.', old['pos'])
    point = objective(after)
    previous = ledger['progress'][-1]
    changed = point['values'] != previous['values']
    if changed or kind == 'end' or after.get('winner'):
        ledger['progress'].append(dict(round=min(before['round'],battlefield(after)['rounds']), side=side, **point))
        ledger['progress'] = ledger['progress'][-100:]
    if changed:
        text = point['label']+': '+', '.join(f'{after.get("factions",{}).get(team,team.upper())} {n}' for team,n in point['values'].items())+'.'
        for team in armies:
            highlight(team,text)
    from . import weather
    current = weather.condition(after)
    if weather.enabled(after) and (not ledger['weather'] or ledger['weather'][-1]['condition'] != current):
        ledger['weather'].append(dict(round=after['round'],condition=current,name=weather.CONDITIONS[current]['name']))


def summary(state, side):
    if not state.get('winner'):
        return None
    own = [u for u in state['units'] if u['side'] == side]
    ledger = state.get(KEY)
    result = dict(version=VERSION, side=side, surviving_units=sum(u['hp']>0 for u in own),
                  surviving_strength=sum(max(0,u['hp']) for u in own),
                  evacuated=state.get('war_rescues',{}).get(side,0) if state.get('war_version') else state.get('evacuated_count',0) if side == 'us' else 0,
                  scope='Your army and public objective progress. Enemy private resources are not disclosed.')
    if not ledger:
        return dict(result, available=False, complete=False,
                    note='This saved battle predates detailed recording. Only its final surviving force is available.')
    result.update(available=True, complete=ledger['complete'], start_round=ledger['start_round'],
                  preparation_excluded=bool(state.get('deployment_version')),
                  statistics=copy.deepcopy(ledger['armies'][side]),
                  progress=copy.deepcopy(ledger['progress']), weather=copy.deepcopy(ledger['weather']))
    return result


def redact(result, state, side):
    result.pop(KEY, None)
    if state.get('winner'):
        result['debrief'] = summary(state,side)
    else:
        result.pop('debrief',None)
    return result
