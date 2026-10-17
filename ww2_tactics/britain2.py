"""Current-only Battle of Britain: finite flights and an air-defense network.

Airframes and places are historical inspiration; forces, fuel, runway tempo and
raid points are deliberately scaled game abstractions, not a dated order of battle.
"""
import copy
import math
import secrets
from . import domains, weather
from .visibility import active

ID = 'britain_2'
VERSION = 1
ORDERS = {'scramble', 'land', 'field_service', 'station_repair'}
TARGET = 9


def enabled(state):
    return state.get('britain_ops_version') == VERSION


def scenario(build):
    rows = [['~'] * 24 for _ in range(20)]
    for y in range(20):
        for x in range(24):
            coast = 7 + (1 if x > 15 else 0)
            if y <= coast or y >= 16:
                rows[y][x] = 's' if y in (coast, 16) else 'T' if (x*7+y*3) % 19 == 0 else '.'
    for x, y in ((6, 3), (17, 4), (5, 18), (18, 18)):
        rows[y][x] = '='
    rows[11][12] = '*'
    board = build(ID, 'Battle of Britain 2.0', 'No. 11 Group sector defense', 18,
        'Daylight over southern England and the Channel · 24×20. Six finite RAF flights '
        'defend two sector stations and two Chain Home radar sites against ten Luftwaffe '
        'flights. Scramble, intercept, land and service. Germany wins at 9 raid damage '
        'or by destroying both RAF stations; Britain wins by eliminating every bomber '
        'or holding below 9 through round 18.', [''.join(row) for row in rows])
    board.update(dsl_only=True, air=True, britain_ops_version=VERSION, playtest=True,
        factions={'us': 'Royal Air Force', 'de': 'Luftwaffe'},
        theater='ENGLISH CHANNEL · SUMMER 1940', default_control_size='platoons',
        summary='Finite flights · radar-guided interception · fuel and airfield turnaround',
        platoons=[dict(id='A', name='Western air group', center=6,
                       side_names={'us': 'Kenley sector', 'de': 'Western raid group'}),
                  dict(id='B', name='Eastern air group', center=17,
                       side_names={'us': 'Biggin Hill sector', 'de': 'Eastern raid group'})],
        airfields={'us': [[6, 3], [17, 4]], 'de': [[5, 18], [18, 18]]},
        raid_targets=[dict(name='RAF Kenley', pos=[6, 3]), dict(name='RAF Biggin Hill', pos=[17, 4]),
                      dict(name='Chain Home · Rye', pos=[4, 7]), dict(name='Chain Home · Dover', pos=[19, 7])],
        historical_note='A composite summer-1940 operation inspired by No. 11 Group, '
            'Chain Home and the Dowding system. Spitfire Mk I, Hurricane Mk I, Bf 109E, '
            'He 111, Do 17 and Ju 88 flights use familiar aircraft roles. Flight names, '
            'base assignments, geography, fuel units and force sizes are game abstractions, '
            'not an exact historical order of battle.',
        doctrine={'us': 'Two Spitfire flights favor fighter combat; four Hurricane flights '
            'favor bomber interception. Radar plus a nearby surviving sector station '
            'reduces RAF fighter hit thresholds by 1. Sixteen service stores; service '
            'repairs up to 2 strength. Defend the network and conserve your finite flights.',
            'de': 'Six Bf 109E-3 escort flights have fast legs, 2-damage cannon attacks '
            'and shorter fuel endurance. A fighter within two hexes of a bomber '
            'adds +1 to incoming fighter hit thresholds; this does not stack or affect AA. '
            'Two He 111 flights carry two loads each; the faster Do 17 and Ju 88 carry '
            'one, with the Ju 88 delivering heavier damage. Twenty service stores; '
            'service repairs 1 strength. Escort the raids or split the RAF defense.'},
        reinforcement_brief='No replacement aircraft. Airfields have six berths and '
            'three runway cycles per own turn, reduced to one at half strength. '
            'Launch: 1 field AP + 1 flight AP + 1 fuel. Land within one hex: 1 flight AP. '
            'Service on the ground: 1 field AP + 1 finite store, restoring fuel, bombs '
            'and up to 2 RAF / 1 German strength. Each uses one runway cycle. Landing '
            'or service delays takeoff until the next own turn. Station repair costs '
            '2 field AP + 1 cycle + 1 store for 2 strength. Destroyed fields and flights '
            'cannot be restored; grounded flights are lost with their field. Solo '
            'flights can divert to either friendly field; co-op requires the same '
            'command group. Each flight leg and each airborne own-turn ending burns '
            '1 fuel. Land before a turn ending reduces fuel to zero. Raid points '
            'count new damage to RAF stations and radar; repairing and bombing the '
            'same damage again cannot farm points. The central star is a landmark.')
    return board


def initial(board, rules):
    units = []

    def add(side, group, kind, pos, name, hp, ap, reach=0, sight=2, **traits):
        number = 1 + sum(u['side'] == side and u['platoon'] == group for u in units)
        u = dict(id=f'{side}-britain2-{group}-{number}', side=side, platoon=group,
                 number=number, kind=kind, faction='gb' if side == 'us' else 'de',
                 pos=list(pos), display_name=name, hp=hp, max_hp=hp, ap=ap, base_ap=ap,
                 ap_received=ap, range=reach, sight=sight, pinned=False, entrenched=False,
                 overwatch=False, armor=0, smoke=0, grenades=0, banked_ap=0,
                 carried_ap=0, road_pending=False, road_used=False, rearm_used=False,
                 bombs=0, britain_role=kind, **traits)
        units.append(u)
        return u

    for side in ('us', 'de'):
        for i, group in enumerate(('A', 'B')):
            pos = board['airfields'][side][i]
            name = (('RAF Kenley', 'RAF Biggin Hill') if side == 'us' else
                    ('Pas-de-Calais · West dispersal', 'Pas-de-Calais · East dispersal'))[i]
            field = add(side, group, 'airfield', pos, name, 8, 3, air_capacity=6,
                runway_used=0, air_stores=8 if side == 'us' else 10,
                max_air_stores=8 if side == 'us' else 10, service_repair=2 if side == 'us' else 1)
            roles = ['spitfire', 'hurricane', 'hurricane'] if side == 'us' else \
                    ['bf109', 'bf109', 'bf109', 'he111', 'do17' if i == 0 else 'ju88']
            for n, role in enumerate(roles):
                model, hp, ap, flight, fuel, loads, damage = {
                    'spitfire': ('Spitfire Mk I', 3, 4, 4, 12, 0, 1),
                    'hurricane': ('Hurricane Mk I', 3, 4, 3, 12, 0, 1),
                    'bf109': ('Bf 109E-3', 3, 3, 4, 10, 0, 2),
                    'he111': ('Heinkel He 111', 6, 4, 2, 18, 2, 2),
                    'do17': ('Dornier Do 17', 5, 4, 3, 18, 1, 2),
                    'ju88': ('Junkers Ju 88', 5, 4, 3, 18, 1, 3)}[role]
                kind = 'bomber' if loads else 'fighter'
                callsign = ('Blue', 'Red', 'Yellow', 'Eagle', 'Falcon')[n]
                label = ('Kenley' if i == 0 else 'Biggin') if side == 'us' else ('West' if i == 0 else 'East')
                p = add(side, group, kind, pos, f'{model} · {label} {callsign}', hp, ap,
                    1 if loads else 3, 6 if not loads else 4, flight=flight, fuel=fuel,
                    max_fuel=fuel, max_bombs=loads, home_field=field['id'],
                    carrier_id=field['id'], sortie_cooldown=False, service_used=False,
                    weapon_overrides={('bomb' if loads else 'air_gun'): dict(damage=damage,
                        structural=False, area_fire=False, label=model + (' bomb load' if loads else ' guns'))})
                p.update(britain_role=role, bombs=loads)
            add(side, group, 'aa_gun', [pos[0]+2, pos[1]],
                ('3.7-inch AA' if side == 'us' else '8.8 cm Flak') + f' · {group} battery', 3, 2, 3, 4)
    for group, pos, name in [('A', [4, 7], 'Chain Home · Rye'), ('B', [19, 7], 'Chain Home · Dover')]:
        add('us', group, 'radar', pos, name, 3, 0, sight=7)
    state = dict(ruleset='dsl', ruleset_version=rules['version'], rules_version=4,
        air_version=1, britain_ops_version=VERSION, units=units, battlefield=board,
        factions=board['factions'].copy(), turn='us', round=1, hold=0, winner=None,
        ready=False, revision=0, battle_number=1, victories={'us': 0, 'de': 0},
        smoke=[], barrages=[], support={'us': 0, 'de': 0}, fog_of_war=True,
        raid_destroyed=[], raid_sites_lost=[], raid_score=0, raid_damage={},
        log=['Battle of Britain 2.0 · Scramble from your airfields. Protect fuel and runway capacity. ' + board['brief']])
    from .visibility import update_intel
    update_intel(state)
    return state


def grounded(state, field):
    return [u for u in state['units'] if u['hp'] > 0 and u.get('carrier_id') == field['id']]


def runway_limit(field):
    return 1 if field['hp'] * 2 <= field['max_hp'] else 3


def same_command(state, plane, field):
    if plane['side'] != field['side']:
        return False
    if not state.get('coop'):
        return True
    from .cooperative import group_for
    return group_for(state, plane['id']) == group_for(state, field['id'])


def needs_service(plane):
    return plane['hp'] < plane['max_hp'] or plane['fuel'] < plane['max_fuel'] or plane['bombs'] < plane['max_bombs']


def guided(state, unit, target):
    from .engine import distance
    return (enabled(state) and unit['side'] == 'us' and unit['kind'] == 'fighter'
        and any(active(u) and u['side'] == 'us' and u['kind'] == 'radar'
                and distance(u['pos'], target['pos']) <= u['sight'] for u in state['units'])
        and any(active(u) and u['side'] == 'us' and u['kind'] == 'airfield'
                and distance(u['pos'], unit['pos']) <= 8 for u in state['units']))


def modifiers(state, unit, target):
    if not enabled(state):
        return {}
    from .engine import distance
    mods = {'radar_guidance': -1} if guided(state, unit, target) else {}
    if unit['kind'] == 'fighter' and target['kind'] == 'bomber' and any(
            active(u) and u['side'] == target['side'] and u['kind'] == 'fighter'
            and distance(u['pos'], target['pos']) <= 2 for u in state['units']):
        mods['close_escort'] = 1
    return mods


def shot(unit, target, reaction=False):
    from . import weapons
    role = unit['britain_role']
    if unit['kind'] == 'bomber':
        threshold = 3
    elif unit['kind'] == 'aa_gun':
        threshold = 5 if target['kind'] == 'fighter' else 4
    else:
        threshold = 4 if role != 'hurricane' else \
                    (5 if target['kind'] == 'fighter' else 3)
        threshold += int(reaction)
    return dict(id=target['id'], threshold=threshold, damage=weapons.damage(unit, target),
                air=True, modifiers={'reaction': int(reaction and unit['kind'] == 'fighter')})


def options(state, unit):
    from . import air
    from .engine import distance
    from .visibility import visible_ids
    result = air.options(state, unit)
    result.update(scramble=[], land=[], field_service=[], station_repair=False, rearm=False)
    if not state['ready'] or state['winner'] or unit['side'] != state['turn'] or not active(unit):
        return result
    if domains.is_air(unit):
        if unit['fuel'] <= 0:
            result['moves'] = []
        if unit['ap'] >= 1:
            seen = visible_ids(state, unit['side'])
            for field in state['units']:
                if field['kind'] == 'airfield' and active(field) and same_command(state, unit, field) \
                        and field['runway_used'] < runway_limit(field) and distance(unit['pos'], field['pos']) <= 1 \
                        and len(grounded(state, field)) < field['air_capacity'] \
                        and not domains.blocked(state, unit, field['pos'], seen):
                    result['land'].append(field['id'])
    elif unit['kind'] == 'airfield' and unit['runway_used'] < runway_limit(unit):
        seen = visible_ids(state, unit['side'])
        occupied = domains.blocked_hexes(state, dict(unit, kind='fighter'), seen)
        x, y = unit['pos']; board = state['battlefield']
        destinations = [dict(pos=[nx, ny]) for ny in range(max(0, y-1), min(board['height'], y+2))
                        for nx in range(max(0, x-1), min(board['width'], x+2))
                        if distance([nx, ny], unit['pos']) <= 1 and (nx, ny) not in occupied]
        if unit['ap'] >= 1:
            for p in grounded(state, unit):
                if not same_command(state, p, unit):
                    continue
                if p['ap'] >= 1 and p['fuel'] >= 2 and not p['sortie_cooldown'] and destinations and weather.can_launch(state,unit):
                    result['scramble'].append(dict(id=p['id'], destinations=copy.deepcopy(destinations)))
                if unit['air_stores'] and needs_service(p) and not p['service_used']:
                    result['field_service'].append(p['id'])
        result['station_repair'] = unit['ap'] >= 2 and unit['air_stores'] > 0 and unit['hp'] < unit['max_hp']
    return result


def intercept(state, plane, pos, roll, before):
    from . import air
    from .visibility import visible_ids, update_intel
    plane['pos'] = list(pos)
    for side in before:
        before[side].update(visible_ids(state, side))
    update_intel(state)
    for shooter in air.watchers(state, plane, pos):
        if not active(plane):
            break
        shooter['overwatch'] = False
        air.resolve_shot(state, shooter, plane, roll, True)


def action(state, unit, action, legal, roll, before):
    kind = action['kind']
    if kind == 'scramble':
        choice = next((c for c in legal['scramble'] if c['id'] == action.get('target')), None)
        if not choice or not any(d['pos'] == action.get('pos') for d in choice['destinations']):
            raise ValueError('Choose a ready flight and a highlighted takeoff hex.')
        plane = next(u for u in state['units'] if u['id'] == choice['id'])
        if domains.blocked(state, plane, action['pos']):
            raise ValueError('Takeoff approach blocked by a contact; choose another hex.')
        unit['ap'] -= 1; unit['runway_used'] += 1; plane['ap'] -= 1; plane['fuel'] -= 1
        plane.pop('carrier_id'); plane['overwatch'] = False
        intercept(state, plane, action['pos'], roll, before)
        return f"{plane['display_name']} scrambled from {unit['display_name']}. One runway cycle and one fuel spent."
    if kind == 'land' and action.get('target') in legal['land']:
        field = next(u for u in state['units'] if u['id'] == action['target'])
        if domains.blocked(state, unit, field['pos']):
            raise ValueError('Landing approach blocked by a contact; clear the airspace.')
        unit['ap'] -= 1; unit['overwatch'] = False; field['runway_used'] += 1
        intercept(state, unit, field['pos'], roll, before)
        if unit['hp'] <= 0:
            return 'Flight lost on landing approach; one runway cycle spent.'
        unit.update(carrier_id=field['id'], sortie_cooldown=True, ap=0, banked_ap=0)
        return f"{unit['display_name']} landed at {field['display_name']}. Service separately; ready next turn."
    if kind == 'field_service' and action.get('target') in legal['field_service']:
        plane = next(u for u in state['units'] if u['id'] == action['target'])
        unit['ap'] -= 1; unit['runway_used'] += 1; unit['air_stores'] -= 1
        plane.update(hp=min(plane['max_hp'], plane['hp']+unit['service_repair']),
            fuel=plane['max_fuel'], bombs=plane['max_bombs'], ap=0, banked_ap=0,
            sortie_cooldown=True, service_used=True)
        return f"{plane['display_name']} repaired, refueled and reloaded. {unit['air_stores']} stores left. Ready next turn."
    if kind == 'station_repair' and legal['station_repair']:
        unit['ap'] -= 2; unit['runway_used'] += 1; unit['air_stores'] -= 1
        unit['hp'] = min(unit['max_hp'], unit['hp']+2)
        return f"{unit['display_name']} repaired by 2 strength. Raid damage already scored is not erased."
    raise ValueError('Airfield order unavailable. Check AP, fuel, runway cycles, stores and flight readiness.')


def after_order(state):
    for field in state['units']:
        if field['kind'] == 'airfield' and field['hp'] <= 0:
            for plane in grounded(state, field):
                plane.update(hp=0, ap=0, banked_ap=0, overwatch=False)
        if field['side'] == 'us' and field['kind'] in {'airfield', 'radar'}:
            old = state['raid_damage'].get(field['id'], 0)
            state['raid_damage'][field['id']] = max(old, field['max_hp']-field['hp'])
    state['raid_score'] = sum(state['raid_damage'].values())
    state['raid_sites_lost'] = [list(u['pos']) for u in state['units']
        if u['side'] == 'us' and u['kind'] in {'airfield', 'radar'} and u['hp'] <= 0]
    fields = [u for u in state['units'] if u['side'] == 'us' and u['kind'] == 'airfield']
    state['raid_destroyed'] = [list(u['pos']) for u in fields if u['hp'] <= 0]
    if state['raid_score'] >= TARGET or all(u['hp'] <= 0 for u in fields):
        state['winner'] = 'de'
    elif not any(u['side'] == 'de' and u['kind'] == 'bomber' and u['hp'] > 0 for u in state['units']) \
            or state['round'] > state['battlefield']['rounds']:
        state['winner'] = 'us'


def apply(state, side, action_, roll=None):
    from . import air
    from .visibility import visible_ids, update_intel, record_reports
    state = copy.deepcopy(state); roll = roll or (lambda: secrets.randbelow(6)+1)
    before = {team: visible_ids(state, team) for team in ('us', 'de')}
    action_round = state['round']; losses = []
    if action_.get('kind') == 'end':
        other = 'de' if side == 'us' else 'us'
        for u in state['units']:
            if u['side'] == side:
                if active(u) and domains.is_air(u):
                    u['fuel'] = max(0, u['fuel']-1)
                    if not u['fuel']:
                        u.update(hp=0, ap=0, overwatch=False)
                        losses.append(f"{u['display_name']} lost: fuel exhausted before landing.")
                u['banked_ap'] = min(max(u['ap'], 0), 1) if active(u) and u['base_ap'] else 0
            else:
                carried = u.get('banked_ap', 0)
                u.update(ap=(u['base_ap']+carried) if u['hp'] > 0 else 0, ap_received=u['base_ap']+carried,
                         carried_ap=carried, banked_ap=0, overwatch=False, rearm_used=False)
                if u['kind'] == 'airfield':
                    u['runway_used'] = 0
                if domains.is_air(u):
                    u.update(sortie_cooldown=False, service_used=False)
        state['turn'] = other
        if side == 'de':
            state['round'] += 1
        message = state['factions'][side] + ' ended their turn.'
    else:
        unit = next((u for u in state['units'] if u['id'] == action_.get('unit') and u['side'] == side and active(u)), None)
        if unit is None:
            raise ValueError('Choose a surviving airfield or an active aircraft or AA battery.')
        legal = options(state, unit)
        if action_.get('kind') in ORDERS:
            message = action(state, unit, action_, legal, roll, before)
        else:
            message = air.unit_order(state, unit, action_, legal, roll, before)
            if action_['kind'] == 'move':
                unit['fuel'] = max(0, unit['fuel']-1)
    after_order(state)
    if state['winner']:
        state['round'] = min(state['round'], state['battlefield']['rounds'])
        state['victories'][state['winner']] += 1
        message += ' ' + state['factions'][state['winner']] + ' win.'
    state['log'].extend([message]+losses); state['revision'] += 1
    update_intel(state); record_reports(state, before, action_, message)
    if losses:
        state.setdefault('reports', {}).setdefault(side, dict(log=[], combat=[]))['log'].extend(losses)
    state.setdefault('action_history', []).append(dict(revision=state['revision'], round=action_round,
        side=side, action={k: copy.deepcopy(action_[k]) for k in ('kind', 'unit', 'target', 'pos') if k in action_}))
    return state


def choose_order(state, costs, visited):
    """Own flights/resources, public target landmarks and observed enemies only."""
    from . import air, computer_policy
    from .engine import distance
    side = state['turn']; seen = air.visible_ids(state, side)
    observed = [u for u in state['units'] if u['id'] in seen and u['hp'] > 0]
    enemies = [u for u in observed if u['side'] != side and active(u)]
    choices = []
    for u in observed:
        if u['side'] != side or not active(u) or not computer_policy.eligible(state, u):
            continue
        legal = options(state, u)
        def add(score, kind, **kw):
            choices.append((score, dict(kind=kind, unit=u['id'], **kw)))
        if u['kind'] == 'airfield':
            if legal['station_repair']:
                add(36 if u['hp'] <= 4 else 10, 'station_repair')
            arrivals = sum(active(v) and domains.is_air(v) and same_command(state, v, u)
                and v['fuel'] <= 3 and distance(v['pos'], u['pos']) <= v['flight']+1 for v in observed)
            if runway_limit(u)-u['runway_used'] <= arrivals:
                continue
            for uid in legal['field_service']:
                p = next(v for v in observed if v['id'] == uid)
                # A repaired bomber need not consume several extra turns and
                # stores reaching pristine strength before flying again.
                mission_ready = (p['hp'] >= (3 if p['kind'] == 'bomber' else 2)
                    and p['fuel'] == p['max_fuel'] and p['bombs'] == p['max_bombs'])
                add(16 if mission_ready else 32, 'field_service', target=uid)
            for entry in legal['scramble']:
                p = next(v for v in observed if v['id'] == entry['id'])
                goal = [u['pos'][0], 9 if side == 'us' else 7]
                dest = min(entry['destinations'], key=lambda d: distance(d['pos'], goal))['pos']
                escorts = sum(active(v) and v['kind'] == 'fighter' and v.get('home_field') == u['id'] for v in observed)
                priority = (24 if escorts >= 2 else 22) if p['kind'] == 'bomber' else 23
                add(priority, 'scramble', target=p['id'], pos=dest)
            continue
        fields = [f for f in observed if f['kind'] == 'airfield' and same_command(state, u, f)]
        home = min(fields, key=lambda f: distance(u['pos'], f['pos'])
            + (6 if f['runway_used'] >= runway_limit(f) or len(grounded(state,f)) >= f['air_capacity'] else 0)
            - (2 if f['id'] == u.get('home_field') else 0)) if fields else None
        returning = domains.is_air(u) and (u['hp'] == 1 or u['kind'] == 'bomber' and not u['bombs'] or
            home and u['fuel'] <= math.ceil(max(0, distance(u['pos'], home['pos'])-1)/min(
                weather.flight(state,u,r) for r in range(state['round'],state['round']+3)))+4)
        if returning and legal['land']:
            add(80, 'land', target=legal['land'][0])
            continue
        if legal.get('rally'):
            add(20, 'rally')
        for s in legal['targets']:
            t = next(v for v in enemies if v['id'] == s['id'])
            add((8 if returning else 26)+(7-s['threshold'])*s['damage']+
                (8 if t['kind'] in {'airfield', 'radar'} else 5 if t['kind'] == 'bomber' else 0), 'fire', target=t['id'])
        if domains.is_air(u):
            if returning and home:
                goal = home['pos']
            elif u['kind'] == 'bomber':
                lost = {tuple(p) for p in state['raid_sites_lost']}
                targets = [p['pos'] for p in state['battlefield']['raid_targets'] if tuple(p['pos']) not in lost]
                goal = min(targets or [[12, 5]], key=lambda p: distance(u['pos'], p))
            else:
                targets = [v for v in enemies if domains.is_air(v)]
                bombers = [v for v in observed if v['side'] == side and v['kind'] == 'bomber'
                           and active(v) and v['bombs'] > 0]
                escort = min(bombers, key=lambda v: distance(u['pos'], v['pos'])) if bombers else None
                if side == 'de' and escort:
                    targets = [v for v in targets if distance(v['pos'], escort['pos']) <= 4]
                    if distance(u['pos'], escort['pos']) > 2:
                        targets = []
                elif side == 'us':
                    # Guard the network instead of chasing escorts to France.
                    targets = [v for v in targets if v['pos'][1] <= 12]
                if targets:
                    goal = min(targets, key=lambda v: distance(u['pos'], v['pos'])-
                        (3 if u['britain_role'] == 'hurricane' and v['kind'] == 'bomber' else 0))['pos']
                else:
                    goal = escort['pos'] if escort else [u['pos'][0], 8]
            for m in legal['moves']:
                if tuple(m['pos']) in visited.get(u['id'], set()):
                    continue
                gain = distance(u['pos'], goal)-distance(m['pos'], goal)
                if gain <= 0 or distance(u['pos'], goal) <= (1 if returning or u['kind'] == 'bomber' else 2):
                    continue
                # Reserve a landing AP on the approach; avoid spending it on
                # a final, unnecessary one-hex move over the runway.
                score = (42 if returning else 16 if u['kind'] == 'bomber' else 4)+3*gain-2*m['threats']
                add(score, 'move', pos=m['pos'])
        if legal['overwatch'] and not returning:
            nearby = any(domains.is_air(v) and distance(u['pos'], v['pos']) <= u['range']+3 for v in enemies)
            add(12 if nearby else 2, 'overwatch')
    return computer_policy.choose(state, choices, 1.5)
