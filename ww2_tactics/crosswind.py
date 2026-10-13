"""Current-only medium fleet battle. New units use saved equipment profiles.

Keep the existing ship and aircraft domains; variants add finite ordnance,
shipboard interception and platoon-owned carrier service only in this operation.
"""
import copy
from collections import deque

ID = 'crosswind_strait'
WIDTH, HEIGHT = 24, 20


def enabled(state):
    return state.get('battlefield', {}).get('fleet_battle_version') == 1


def roster():
    from . import air, naval
    from .scenarios import get_scenario
    from .rulesets import profile
    ships = naval.initial(get_scenario('midway'), profile('dsl'))['units']
    planes = air.initial(get_scenario('britain'), profile('dsl'))['units']
    result = []
    for side in ('us', 'de'):
        for group, cx in (('A', 5), ('B', 18)):
            # Four surface counters and three independently movable aircraft.
            layout = [('carrier', 0, 2), ('cruiser', 0, 4),
                      ('destroyer', -2, 5), ('destroyer', 2, 5),
                      ('fighter', -2, 4), ('fighter', 2, 4), ('bomber', 0, 3)]
            for number, (kind, dx, depth) in enumerate(layout, 1):
                pool = planes if kind in air.AIRCRAFT else ships
                owner = 'de' if kind == 'bomber' else side
                unit = copy.deepcopy(next(u for u in pool if u['side'] == owner and u['kind'] == kind))
                unit.update(id=f'{side}-crosswind-{group}-{number}', side=side,
                    faction='us' if side == 'us' else 'jp', platoon=group, number=number,
                    pos=[cx+dx, HEIGHT-1-depth if side == 'us' else depth],
                    reserve=False, overwatch=False)
                if kind in naval.SHIPS:
                    unit.update(ship_aa_range=1, weapon_overrides={'flak': dict(damage=1,
                        label='Shipboard anti-aircraft fire')})
                if kind == 'carrier':
                    unit.update(display_name='Fleet carrier', air_stores=6, abstract_strikes=False)
                elif kind == 'cruiser' and side == 'us':
                    unit.update(variant='aa_escort', display_name='Allied AA escort cruiser',
                        range=5, gun_damage=1, ship_aa_range=3,
                        weapon_overrides={'flak': dict(damage=2, label='Escort anti-aircraft battery')})
                elif kind == 'cruiser':
                    unit.update(variant='torpedo_cruiser', display_name='Axis torpedo cruiser',
                        torpedo_launcher=True, torpedoes=3, torpedo_range=5, torpedo_damage=4)
                elif kind == 'bomber':
                    if side == 'us':
                        unit.update(variant='dive_bomber', display_name='Allied dive bomber',
                            naval_strike=True, attack_label='Dive bombing run', attack_threshold=3,
                            bombs=2, max_bombs=2, weapon='bomb',
                            weapon_overrides={'bomb': dict(damage=3, targets=('ship',),
                                label='Dive-bomber ordnance', structural=False, area_fire=False)})
                    else:
                        unit.update(variant='torpedo_bomber', display_name='Axis torpedo bomber',
                            naval_strike=True, attack_label='Aerial torpedo run', attack_threshold=4,
                            range=2, bombs=1, max_bombs=1, weapon='torpedo', torpedo_damage=4,
                            weapon_overrides={'torpedo': dict(targets=('ship',),
                                label='Aerial torpedo', area_fire=False)})
                unit.update(ap=unit['base_ap'], ap_received=unit['base_ap'], banked_ap=0,
                            carried_ap=0, road_pending=False, road_used=False)
                result.append(unit)
    return result


def scenario(build):
    rows = [['~'] * WIDTH for _ in range(HEIGHT)]
    # Central islands split the sea approaches, leaving all three lanes open.
    for cx, cy in ((8, 10), (16, 9)):
        for y in range(cy-1, cy+2):
            for x in range(cx-1, cx+2):
                if abs(x-cx)+abs(y-cy) <= 1:
                    rows[y][x] = 'T' if (x, y) == (cx, cy) else 's'
    rows[10][12] = '*'
    board = build(ID, 'Crosswind Strait', 'Three sea lanes', 18,
        'Medium air and naval battle · 24×20 · two mixed platoons per side, seven units each. '
        'Play 2v2, cooperate against computer platoons, or play solo. Ships hold three sea lanes; '
        'each uncontested lane within one hex earns 1 point at your turn end. First to 12 points '
        'wins; after round 18 higher score wins (Axis wins a tie). Aircraft support the fleet '
        'and cannot capture. Each carrier has six aircraft-service uses.',
        [''.join(row) for row in rows])
    board.update(dsl_only=True, campaign=ID, joint_ops=True, fleet_battle_version=1,
        joint_score_target=12, playtest=True, default_control_size='platoons',
        theater='AIR & NAVAL · FICTIONAL STRAIT',
        summary='Medium · 2v2 mixed platoons · ships, fighters and naval strike aircraft',
        historical_note='Fictional balanced-layout playtest. Strength, range and ammunition are game values.',
        factions={'us': 'Allies · American fleet', 'de': 'Axis · Japanese fleet'},
        platoons=[dict(id='A', name='Platoon A · western air/naval force', center=5),
                  dict(id='B', name='Platoon B · eastern air/naval force', center=18)],
        joint_recon_focus=[12, 10],
        joint_objectives=[dict(id='west', name='Western sea lane', pos=[4, 10], domain='sea', radius=1),
                          dict(id='center', name='Central strait', pos=[12, 10], domain='sea', radius=1),
                          dict(id='east', name='Eastern sea lane', pos=[20, 10], domain='sea', radius=1)],
        doctrine={'us': 'AA escort cruisers intercept aircraft within three hexes for 2 damage. '
            'Dive bombers have two loads: range 1, 3+ hit, 3 hull damage. Faster destroyers and '
            'fighters support the approach; destroyer torpedoes have shorter reach.',
            'de': 'Torpedo cruisers have three salvos: range 5, 4+ hit, 4 hull damage. '
            'Torpedo bombers carry one load: range 2, 4+ hit (5+ against destroyers), 4 hull damage. '
            'Their escorts have lighter AA; preserve the bombers for decisive attacks.'},
        reinforcement_brief='No reserves or replacement units. Aircraft Service costs 2 aircraft AP, '
            'once per aircraft per turn, within one hex of its own platoon’s surviving carrier. '
            'It restores 1 strength and reloads ordnance, consuming one of that carrier’s six stores. '
            'Carriers search but have no abstract attack sorties. Losing carriers alone does not end the battle.')
    return board


def service_carrier(state, unit):
    """Do not spend a teammate's carrier stores or service from a sunk ship."""
    from .engine import distance
    from .visibility import active
    if not enabled(state): return None
    return next((u for u in state['units'] if active(u) and u['side'] == unit['side']
        and u['platoon'] == unit['platoon'] and u['kind'] == 'carrier'
        and u.get('air_stores', 0) > 0 and distance(u['pos'], unit['pos']) <= 1), None)


def ship_costs(state, goal):
    """Terrain-only routes around islands; never inspect unseen enemy positions."""
    from .engine import distance
    from .naval import navigable
    board = state['battlefield']
    costs, queue = {tuple(goal): 0}, deque([tuple(goal)])
    while queue:
        pos = queue.popleft()
        for y in range(max(0, pos[1]-1), min(board['height'], pos[1]+2)):
            for x in range(max(0, pos[0]-1), min(board['width'], pos[0]+2)):
                nxt = (x, y)
                if nxt not in costs and navigable(board['map'][y][x]) and distance(pos, nxt) == 1:
                    costs[nxt] = costs[pos]+1
                    queue.append(nxt)
    return costs


def ship_choices(state, unit, legal, visited):
    from .engine import distance
    from .fubar import controls
    # Platoons approach different flanks; they can shift to a contested center.
    points = controls(state)
    flank = 'west' if unit['platoon'] == 'A' else 'east'
    candidates = [p for p in points if p['id'] in {flank, 'center'} and
                  (p['owner'] != unit['side'] or distance(unit['pos'], p['pos']) <= 1)]
    point = min(candidates or points, key=lambda p: distance(unit['pos'], p['pos']))
    costs = ship_costs(state, point['pos'])
    choices = []
    for move in legal['moves']:
        pos = move['pos']
        if tuple(pos) in visited.get(unit['id'], set()): continue
        gap = distance(unit['pos'], point['pos'])
        gain = costs.get(tuple(unit['pos']), 999)-costs.get(tuple(pos), 999)
        score = 2+gain*3-move.get('threats', 0)*2-(8 if gap <= 1 else 0)
        if unit['kind'] == 'carrier' and distance(pos, point['pos']) < 4: score -= 6
        choices.append((score, dict(kind='move', unit=unit['id'], pos=pos)))
    return choices
