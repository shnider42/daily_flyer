"""Current-only daytime carrier operation; aircraft are finite saved units.

Counters represent flights, not literal historical aircraft counts. Deck cycles
are a balance abstraction, shared by launches, recoveries and servicing.
"""
import copy
from . import domains, weather

ID = 'midway_2'
VERSION = 1
WIDTH, HEIGHT = 30, 26
ORDERS = {'launch', 'recover', 'deck_service'}


def enabled(state):
    return state.get('battlefield', {}).get('carrier_ops_version') == VERSION


def scenario(build):
    rows = [['~'] * WIDTH for _ in range(HEIGHT)]
    for cx, cy in ((10, 12), (20, 13)):
        for y in range(cy-2, cy+3):
            for x in range(cx-2, cx+3):
                if abs(x-cx)+abs(y-cy) <= 2:
                    rows[y][x] = 'T' if (x, y) == (cx, cy) else 's'
    rows[12][15] = '*'
    board = build(ID, 'Midway 2.0', 'Carrier battle sea lanes', 24,
        'Daytime carrier battle · 30×26 · US vs Japan. Three American carriers carry four '
        'finite aircraft flights each; four Japanese carriers carry three each. Launch, '
        'recover and service real aircraft using limited deck cycles. Sink every enemy '
        'carrier or reach 12 sea-control points. Fixed deployments and ordinary daytime sight.',
        [''.join(row) for row in rows])
    board.update(dsl_only=True, campaign=ID, joint_ops=True, fleet_battle_version=1,
        carrier_ops_version=VERSION, joint_score_target=12, playtest=True,
        default_control_size='platoons', theater='PACIFIC · DAYTIME CARRIER BATTLE',
        summary='3 US carriers vs 4 Japanese · finite air groups · launch, land & service',
        historical_note='Inspired by Midway’s three US and four Japanese fleet carriers. '
            'Aircraft counters represent small flights; air groups, escorts, geography, '
            'deck cycles and repair values are scaled for balance, not a reenactment.',
        factions={'us': 'United States Navy', 'de': 'Imperial Japanese Navy'},
        platoons=[dict(id='A', name='Western task force', center=7),
                  dict(id='B', name='Eastern task force', center=23)],
        joint_objectives=[dict(id='west', name='Western approach', pos=[5, 12], domain='sea', radius=1),
                          dict(id='center', name='Midway channel', pos=[15, 12], domain='sea', radius=1),
                          dict(id='east', name='Eastern approach', pos=[25, 12], domain='sea', radius=1)],
        doctrine={'us': 'Enterprise, Hornet and Yorktown: four flights and 8 hull each. '
            'Wildcats, two Dauntless dive-bomber flights and one weaker Devastator '
            'torpedo flight per carrier. Stronger cruiser AA, +2 aircraft service repair, '
            'eight service stores per carrier; six undamaged deck cycles across the fleet.',
            'de': 'Akagi, Kaga, Soryu and Hiryu: three flights and 6 hull each. '
            'One Zero, one Val dive bomber and one Kate torpedo bomber per carrier. '
            'Longer fighter legs, stronger torpedoes, +1 aircraft service repair and '
            'six stores per carrier; eight undamaged deck cycles across the fleet.'},
        reinforcement_brief='No replacement aircraft or abstract carrier strikes/searches. '
            'Each carrier has two deck cycles per own turn, reduced to one at half hull '
            'or below. Launch costs 1 carrier AP + 1 aircraft AP + one cycle. Land from '
            'within one hex for 1 aircraft AP + one cycle. Service aboard costs 1 carrier '
            'AP + one cycle + one store: repair and reload. Recovered or serviced flights '
            'cannot launch until their next turn. Sinking a carrier destroys only aircraft '
            'still aboard; airborne flights may divert to a friendly carrier in their '
            'own command group if it has a free berth.')
    return board


def roster():
    from . import air, naval
    from .scenarios import get_scenario
    from .rulesets import profile
    ships = naval.initial(get_scenario('midway'), profile('dsl'))['units']
    planes = air.initial(get_scenario('britain'), profile('dsl'))['units']
    result = []

    def add(template, side, group, pos, **traits):
        number = 1 + sum(u['side'] == side and u['platoon'] == group for u in result)
        u = copy.deepcopy(template)
        u.update(id=f'{side}-midway2-{group}-{number}', side=side,
                 faction='us' if side == 'us' else 'jp', platoon=group,
                 number=number, pos=list(pos), reserve=False, overwatch=False, **traits)
        u.update(ap=u['base_ap'], ap_received=u['base_ap'], banked_ap=0, carried_ap=0)
        result.append(u)
        return u

    fleets = {
        'us': [('A', 'USS Enterprise', [5, 22]), ('A', 'USS Hornet', [10, 22]),
               ('B', 'USS Yorktown', [24, 22])],
        'de': [('A', 'Akagi', [4, 3]), ('A', 'Kaga', [10, 3]),
               ('B', 'Soryu', [20, 3]), ('B', 'Hiryu', [26, 3])]}
    escorts = {'us': [('A', 'cruiser', [6, 20]), ('A', 'destroyer', [8, 19]),
                      ('B', 'cruiser', [21, 20]), ('B', 'cruiser', [26, 20]),
                      ('B', 'destroyer', [22, 19]), ('B', 'destroyer', [26, 19])],
               'de': [('A', 'cruiser', [7, 5]), ('A', 'destroyer', [4, 6]),
                      ('A', 'destroyer', [10, 6]), ('B', 'cruiser', [23, 5]),
                      ('B', 'destroyer', [20, 6]), ('B', 'destroyer', [26, 6])]}
    for side in ('us', 'de'):
        for group, name, pos in fleets[side]:
            cv = add(next(u for u in ships if u['side'] == side and u['kind'] == 'carrier'),
                side, group, pos, display_name=name, hp=8 if side == 'us' else 6,
                max_hp=8 if side == 'us' else 6, air_capacity=4 if side == 'us' else 3,
                air_stores=8 if side == 'us' else 6, max_air_stores=8 if side == 'us' else 6,
                service_repair=2 if side == 'us' else 1, deck_used=0,
                abstract_strikes=False, ship_aa_range=1,
                weapon_overrides={'flak': dict(damage=1, label='Carrier anti-aircraft fire')})
            roles = ['fighter', 'dive_bomber', 'torpedo_bomber']
            if side == 'us': roles.insert(2, 'dive_bomber')
            for role in roles:
                kind = 'fighter' if role == 'fighter' else 'bomber'
                template = next(u for u in planes if u['kind'] == kind and
                                (kind == 'bomber' or u['side'] == side))
                name = ({'fighter': 'F4F Wildcat flight', 'dive_bomber': 'SBD Dauntless flight',
                         'torpedo_bomber': 'TBD Devastator flight'} if side == 'us' else
                        {'fighter': 'A6M Zero flight', 'dive_bomber': 'D3A Val flight',
                         'torpedo_bomber': 'B5N Kate flight'})[role]
                plane = add(template, side, group, pos, display_name=name,
                    hp=3, max_hp=3, carrier_id=cv['id'], home_carrier=cv['id'],
                    deck_cooldown=False, service_used=False)
                if kind == 'fighter':
                    plane.update(flight=3 if side == 'us' else 4)
                else:
                    torpedo = role == 'torpedo_bomber'
                    threshold = (5 if side == 'us' else 4) if torpedo else (3 if side == 'us' else 4)
                    damage = 4 if side == 'de' and torpedo else 3
                    weapon = 'torpedo' if torpedo else 'bomb'
                    plane.update(variant=role, naval_strike=True, bombs=1, max_bombs=1,
                        range=2 if torpedo else 1, attack_threshold=threshold,
                        attack_label='Aerial torpedo run' if torpedo else 'Dive bombing run',
                        weapon=weapon, torpedo_damage=damage,
                        weapon_overrides={weapon: dict(damage=damage, targets=('ship',),
                            label=name.replace(' flight', ' ordnance'), structural=False, area_fire=False)})
        for group, kind, pos in escorts[side]:
            u = add(next(u for u in ships if u['side'] == side and u['kind'] == kind),
                side, group, pos, ship_aa_range=2 if kind == 'cruiser' else 1,
                weapon_overrides={'flak': dict(damage=2 if side == 'us' and kind == 'cruiser' else 1,
                                             label='Escort anti-aircraft fire')})
            if kind == 'cruiser':
                u.update(display_name='US AA escort cruiser' if side == 'us' else 'Japanese torpedo cruiser',
                         variant='aa_escort' if side == 'us' else 'torpedo_cruiser')
                if side == 'de': u.update(torpedo_launcher=True, torpedoes=3, torpedo_range=5, torpedo_damage=4)
    return result


def aboard(state, carrier):
    return [u for u in state['units'] if u['hp'] > 0 and u.get('carrier_id') == carrier['id']]


def deck_limit(carrier):
    return 1 if carrier['hp'] * 2 <= carrier['max_hp'] else 2


def deck_free(carrier):
    return carrier['hp'] > 0 and carrier.get('deck_used', 0) < deck_limit(carrier)


def same_command(state, plane, carrier):
    if plane['side'] != carrier['side'] or plane['platoon'] != carrier['platoon']: return False
    if not state.get('coop'): return True
    from .cooperative import group_for
    return group_for(state, plane['id']) == group_for(state, carrier['id'])


def needs_service(plane):
    return plane['hp'] < plane['max_hp'] or plane['kind'] == 'bomber' and plane['bombs'] < plane['max_bombs']


def options(state, unit):
    from .engine import distance
    from .visibility import active, unit_visible_ids
    result = dict(launch=[], recover=[], deck_service=[])
    if not enabled(state) or not state['ready'] or state['winner'] or unit['side'] != state['turn']:
        return result
    if unit['kind'] == 'carrier' and active(unit) and deck_free(unit):
        seen = unit_visible_ids(state, unit)
        occupied = domains.blocked_hexes(state, dict(unit, kind='fighter'), seen)
        board = state['battlefield']; x, y = unit['pos']
        destinations = [dict(pos=[nx, ny]) for ny in range(max(0, y-1), min(board['height'], y+2))
                        for nx in range(max(0, x-1), min(board['width'], x+2))
                        if distance([nx, ny], unit['pos']) <= 1 and (nx, ny) not in occupied]
        if unit['ap'] >= 1:
            for plane in aboard(state, unit):
                if not same_command(state, plane, unit): continue
                if plane['ap'] >= 1 and not plane.get('deck_cooldown') and destinations and weather.can_launch(state,unit):
                    result['launch'].append(dict(id=plane['id'], destinations=copy.deepcopy(destinations)))
                if unit['air_stores'] and needs_service(plane) and not plane.get('service_used'):
                    result['deck_service'].append(plane['id'])
    elif domains.is_air(unit) and active(unit) and unit['ap'] >= 1:
        seen = unit_visible_ids(state, unit)
        for cv in state['units']:
            if cv['kind'] == 'carrier' and active(cv) and same_command(state, unit, cv) and deck_free(cv) \
                    and distance(unit['pos'], cv['pos']) <= 1 and len(aboard(state, cv)) < cv['air_capacity'] \
                    and not domains.blocked(state, unit, cv['pos'], seen):
                result['recover'].append(cv['id'])
    return result


def _intercept(state, plane, pos, roll, before):
    from . import air
    from .visibility import active, visible_ids, update_intel
    plane['pos'] = list(pos)
    for side in before: before[side].update(visible_ids(state, side))
    update_intel(state)
    fired = False
    for shooter in air.watchers(state, plane, pos):
        if not active(plane): break
        shooter['overwatch'] = False
        air.resolve_shot(state, shooter, plane, roll, True)
        fired = True
    return fired


def action(state, unit, action, legal, roll, before):
    kind = action['kind']
    if kind == 'launch':
        choice = next((c for c in legal.get('launch', []) if c['id'] == action.get('target')), None)
        if not choice or not any(d['pos'] == action.get('pos') for d in choice['destinations']):
            raise ValueError('Choose an available aircraft and a highlighted launch hex.')
        plane = next(u for u in state['units'] if u['id'] == choice['id'])
        if domains.blocked(state, plane, action['pos']):
            raise ValueError('Launch approach blocked by a contact; choose another hex.')
        unit['ap'] -= 1; unit['deck_used'] += 1; plane['ap'] -= 1
        plane.pop('carrier_id', None); plane['overwatch'] = False
        intercepted = _intercept(state, plane, action['pos'], roll, before)
        return f"{plane['display_name']} launched from {unit['display_name']} · one deck cycle." + \
            (' Incoming interception fire; see combat report.' if intercepted else '')
    if kind == 'recover' and action.get('target') in legal.get('recover', []):
        cv = next(u for u in state['units'] if u['id'] == action['target'])
        if domains.blocked(state, unit, cv['pos']):
            raise ValueError('Recovery approach blocked by a contact; clear the airspace.')
        unit['ap'] -= 1; unit['overwatch'] = False; cv['deck_used'] += 1
        _intercept(state, unit, cv['pos'], roll, before)
        if unit['hp'] <= 0: return 'Aircraft lost on its recovery approach; one deck cycle spent.'
        unit.update(carrier_id=cv['id'], deck_cooldown=True, ap=0, banked_ap=0)
        return f"{unit['display_name']} landed aboard {cv['display_name']}. Ready next turn; service separately."
    if kind == 'deck_service' and action.get('target') in legal.get('deck_service', []):
        plane = next(u for u in state['units'] if u['id'] == action['target'])
        unit['ap'] -= 1; unit['deck_used'] += 1; unit['air_stores'] -= 1
        plane.update(hp=min(plane['max_hp'], plane['hp']+unit['service_repair']),
                     ap=0, banked_ap=0, deck_cooldown=True, service_used=True)
        if plane['kind'] == 'bomber': plane['bombs'] = plane['max_bombs']
        return f"{plane['display_name']} serviced aboard {unit['display_name']}: repair up to " \
            f"{unit['service_repair']} strength and reload. {unit['air_stores']} stores left; ready next turn."
    raise ValueError('That deck order is unavailable. Check AP, berths, deck cycles and aircraft readiness.')


def start_turn(state, side):
    if not enabled(state): return
    for u in state['units']:
        if u['side'] == side:
            if u['kind'] == 'carrier': u['deck_used'] = 0
            if domains.is_air(u):
                u['deck_cooldown'] = False
                u['service_used'] = False


def after_order(state):
    if not enabled(state): return
    for cv in state['units']:
        if cv['kind'] != 'carrier': continue
        for plane in aboard(state, cv):
            plane['pos'] = list(cv['pos'])
            if cv['hp'] <= 0: plane.update(hp=0, ap=0, banked_ap=0, overwatch=False)
    if not state['winner']:
        for side in ('us', 'de'):
            if not any(u['kind'] == 'carrier' and u['side'] == side and u['hp'] > 0 for u in state['units']):
                state['winner'] = 'de' if side == 'us' else 'us'
                break


def choices(state, unit, legal, observed, visited):
    """Use own manifests, legal orders, public lanes and observed enemies only."""
    from . import fubar
    from .engine import distance
    if unit.get('carrier_id'): return []
    if unit['kind'] == 'carrier':
        choices = []
        for uid in legal.get('deck_service', []): choices.append((22, dict(kind='deck_service', unit=unit['id'], target=uid)))
        for entry in legal.get('launch', []):
            plane = next(u for u in observed if u['id'] == entry['id'])
            pos = min(entry['destinations'], key=lambda d: distance(d['pos'], state['battlefield']['objective']))['pos']
            choices.append((18 if plane['kind'] == 'fighter' else 17,
                            dict(kind='launch', unit=unit['id'], target=plane['id'], pos=pos)))
        if legal.get('repair'): choices.append((26 if unit['hp']*2 <= unit['max_hp'] else 12, dict(kind='repair', unit=unit['id'])))
        if legal.get('overwatch'): choices.append((8, dict(kind='overwatch', unit=unit['id'])))
        for shot in legal.get('targets', []):
            if shot['damage']: choices.append((12+(7-shot['threshold'])*shot['damage'], dict(kind='fire', unit=unit['id'], target=shot['id'])))
        # Do not sail carriers into capture lanes. If threatened, retreat using
        # spotted surface ships only, never the hidden enemy deployment.
        threats = [u for u in observed if u['side'] != unit['side'] and u['hp'] > 0 and u['kind'] in domains.SHIPS]
        if threats and min(distance(unit['pos'], u['pos']) for u in threats) <= 7:
            for m in legal['moves']:
                if tuple(m['pos']) in visited.get(unit['id'], set()): continue
                gain = min(distance(m['pos'], u['pos']) for u in threats)-min(distance(unit['pos'], u['pos']) for u in threats)
                if gain > 0: choices.append((7+gain, dict(kind='move', unit=unit['id'], pos=m['pos'])))
        return choices
    if domains.is_air(unit) and (unit['hp'] < unit['max_hp'] or unit['kind'] == 'bomber' and not unit['bombs']):
        if legal.get('recover'):
            return [(30, dict(kind='recover', unit=unit['id'], target=legal['recover'][0]))]
        cvs = [u for u in observed if u['side'] == unit['side'] and u['kind'] == 'carrier' and u['hp'] > 0
               and same_command(state, unit, u) and len(aboard(state, u)) < u['air_capacity']]
        if cvs:
            goal = min(cvs, key=lambda cv: distance(unit['pos'], cv['pos']))['pos']
            return [(4+3*(distance(unit['pos'], goal)-distance(m['pos'], goal))-m.get('threats', 0)*2,
                     dict(kind='move', unit=unit['id'], pos=m['pos'])) for m in legal['moves']
                    if tuple(m['pos']) not in visited.get(unit['id'], set()) and distance(unit['pos'], goal) > 1]
    return fubar.domain_choices(state, unit, legal, observed, visited)
