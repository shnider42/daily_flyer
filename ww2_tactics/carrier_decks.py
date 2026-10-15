"""Saved Crosswind backport of Midway 2.0's deck orders, not its mission.

Use the same authoritative order resolver, AP costs, deck limits and command
checks. Crosswind keeps its existing deployed flights, profiles and sea-lane
victory; recovery now replaces adjacent, airborne carrier servicing.
"""
from . import domains, midway2
from .visibility import active

VERSION = 1
ORDERS = midway2.ORDERS
action = midway2.action


def enabled(state):
    return state.get('carrier_decks_version') == VERSION


def configure(board):
    if board.get('source_id') != 'crosswind_strait':
        return
    board['carrier_decks_version'] = VERSION
    board['brief'] += (' The three existing flights per platoon start airborne. '
        'Recover them aboard their carrier to repair, reload and relaunch; no replacement flights. '
        'Carriers have two deck cycles per own turn, reduced to one at half hull. '
        'Launch costs 1 carrier AP and 1 aircraft AP; recovery costs 1 aircraft AP; '
        'aboard service costs 1 carrier AP and one finite store. Each uses a deck cycle. '
        'Recovered or serviced aircraft cannot relaunch until their next turn. '
        'Reconnaissance uses actual aircraft, not abstract search sorties.')
    board['reinforcement_brief'] = ('No reserves or replacement aircraft. Three finite flights '
        'and three berths per carrier; six service stores. Recover within one hex to your '
        'own command group’s carrier. Service aboard restores 1 strength and full ordnance. '
        'Two deck cycles per own turn, one at half hull; each launch, recovery or service '
        'uses one cycle. Launch: 1 carrier + 1 aircraft AP. Recover: 1 aircraft AP. '
        'Service: 1 carrier AP + 1 store. Recovered/serviced flights are ready next turn. '
        'Sinking a carrier destroys only aircraft still aboard; airborne flights survive. '
        'Losing carriers alone does not end this sea-lane battle.')


def initialize(state):
    if state['battlefield'].get('carrier_decks_version') != VERSION or enabled(state):
        return state
    state['carrier_decks_version'] = VERSION
    for cv in state['units']:
        if cv['kind'] != 'carrier':
            continue
        flights = [u for u in state['units'] if domains.is_air(u)
                   and u['side'] == cv['side'] and u['platoon'] == cv['platoon']]
        cv.update(air_capacity=len(flights), max_air_stores=cv['air_stores'], service_repair=1, deck_used=0)
        for plane in flights:
            plane.update(home_carrier=cv['id'], deck_cooldown=False, service_used=False)
            plane.setdefault('display_name', 'Fleet fighter' if plane['kind'] == 'fighter' else 'Naval strike bomber')
    return state


def options(state, unit):
    from .engine import distance
    from .visibility import unit_visible_ids
    result = dict(launch=[], recover=[], deck_service=[])
    if not enabled(state) or not state['ready'] or state['winner'] or unit['side'] != state['turn']:
        return result
    if unit['kind'] == 'carrier' and active(unit) and midway2.deck_free(unit):
        seen = unit_visible_ids(state, unit)
        occupied = domains.blocked_hexes(state, dict(unit, kind='fighter'), seen)
        board = state['battlefield']; x, y = unit['pos']
        destinations = [dict(pos=[nx, ny]) for ny in range(max(0, y-1), min(board['height'], y+2))
                        for nx in range(max(0, x-1), min(board['width'], x+2))
                        if distance([nx, ny], unit['pos']) <= 1 and (nx, ny) not in occupied]
        if unit['ap'] >= 1:
            for plane in midway2.aboard(state, unit):
                if not midway2.same_command(state, plane, unit): continue
                if plane['ap'] >= 1 and not plane.get('deck_cooldown') and destinations:
                    result['launch'].append(dict(id=plane['id'], destinations=destinations))
                if unit['air_stores'] and midway2.needs_service(plane) and not plane.get('service_used'):
                    result['deck_service'].append(plane['id'])
    elif domains.is_air(unit) and active(unit) and unit['ap'] >= 1:
        seen = unit_visible_ids(state, unit)
        for cv in state['units']:
            if cv['kind'] == 'carrier' and active(cv) and midway2.same_command(state, unit, cv) and midway2.deck_free(cv) \
                    and distance(unit['pos'], cv['pos']) <= 1 and len(midway2.aboard(state, cv)) < cv['air_capacity'] \
                    and not domains.blocked(state, unit, cv['pos'], seen):
                result['recover'].append(cv['id'])
    return result


def start_turn(state, side):
    if not enabled(state): return
    for u in state['units']:
        if u['side'] == side:
            if u['kind'] == 'carrier': u['deck_used'] = 0
            if domains.is_air(u):
                u.update(deck_cooldown=False, service_used=False)


def after_order(state):
    if not enabled(state): return
    for cv in state['units']:
        if cv['kind'] != 'carrier': continue
        for plane in midway2.aboard(state, cv):
            plane['pos'] = list(cv['pos'])
            if cv['hp'] <= 0: plane.update(hp=0, ap=0, banked_ap=0, overwatch=False)
    # Deliberately no Midway 2.0 carrier-elimination victory condition.


def choices(state, unit, legal, observed, visited):
    # Keep the proven finite-flight AI. Empty carriers can still recover planes
    # for safety, but the computer should not seek them for unavailable service.
    if domains.is_air(unit) and active(unit) and midway2.needs_service(unit):
        stocked = {cv['id'] for cv in observed if cv['kind'] == 'carrier' and cv['side'] == unit['side']
                   and active(cv) and cv.get('air_stores', 0) > 0 and midway2.same_command(state, unit, cv)}
        if not stocked:
            from .fubar import domain_choices
            return domain_choices(state, unit, legal, observed, visited)
    return midway2.choices(state, unit, legal, observed, visited)
