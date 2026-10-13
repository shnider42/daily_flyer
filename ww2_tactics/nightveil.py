"""Nightfall Veil: fixed forces, private deployments inside balanced sectors."""
import secrets

ID = 'nightfall_veil'


def enabled(state):
    return state.get('battlefield', {}).get('night_randomized_version') == 1


def scenario(build):
    from .nightfall import scenario as beacon
    board = beacon(build)
    sectors = []
    for group, cx, name in [('A', 8, 'Western search sector'), ('B', 22, 'Eastern search sector')]:
        sites = [[cx + dx, y] for y in (11, 12, 13) for dx in (-2, 0, 2)]
        for x, y in sites:
            board['map'][y][x] = 'building'
        sectors.append(dict(id=group, name=name, pos=[cx, 12], radius=3, sites=sites))
    board.update(id=ID, campaign=ID, name='Nightfall Veil', night_randomized_version=1,
        theater='CONCEALED NIGHT RAID · FICTIONAL 1944', night_targets=[],
        night_search_sectors=sectors,
        summary='Medium / large · concealed radar sites and randomized German defenses',
        brief='Nightfall Veil · 30×26. Search the western and eastern sectors: each hides one '
              'radar site among nine possible buildings. German Flak, Spotlights, fighters '
              'and garrisons receive fresh, constrained deployments for every battle. '
              'Use reconnaissance and flares to find the sites before bombing them. '
              'Then land paratroopers to hold the signals station for two Allied turn endings. '
              'The roster, drop dice, finite supplies and 24-round deadline match Nightfall Beacon.',
        concealment_brief='Dashed circles mark search sectors, not targets. Each sector has one radar '
              'site in one of nine marked buildings. Its actual hex and other German deployments '
              'are private until spotted. Every new battle randomizes German positions within '
              'separate zones; loading a save retains its layout, while a new battle gets a new deployment. '
              'Forces, ammunition and strength stay fixed. Heavy Flak stays behind the forward searchlights; '
              'garrisons cannot start beside the airborne objective. Bomb orders require a spotted target.')
    board['doctrine']['us'] += ' In Veil, search the marked buildings; sector centers are not confirmed targets.'
    board['doctrine']['de'] += ' Your randomized deployment is visible to your army, not the Allies.'
    return board


def candidates(state, unit):
    """Published shape constraints; no knowledge of the other army is used."""
    from .engine import distance, terrain
    board = state['battlefield']
    sector = next(s for s in board['night_search_sectors'] if s['id'] == unit['platoon'])
    cx = sector['pos'][0]
    if unit.get('mission_radar'):
        return [list(p) for p in sector['sites']]
    if unit['kind'] == 'fighter':
        rows, offsets = range(4, 7), range(-2, 3)
    elif unit['kind'] == 'spotlight':
        rows, offsets = range(17, 19), range(-2, 3)
    elif unit.get('variant') == 'heavy_flak':
        rows, offsets = range(14, 16), range(-2, 3)
    elif unit.get('variant') == 'light_flak':
        rows, offsets = range(16, 18), range(-2, 3)
    elif unit['kind'] in {'squad', 'mg'}:
        rows, offsets = range(10, 15), range(-3, 4)
    else:
        return [list(unit['pos'])]
    possible_sites = {tuple(p) for p in sector['sites']}
    return [[cx + dx, y] for y in rows for dx in offsets
        if 0 <= cx + dx < board['width'] and 0 <= y < board['height']
        and terrain(cx + dx, y, state) not in {'water', 'marsh', 'mountain'}
        and (unit['kind'] not in {'squad', 'mg'} or
             distance([cx + dx, y], board['objective']) >= 4)
        and (unit['kind'] == 'fighter' or (cx + dx, y) not in possible_sites)]


def initialize(state, rng=None):
    if not enabled(state):
        return
    from . import domains
    # Place the most constrained installations first. Unique surface starts
    # prevent accidental stacking from increasing local defensive strength.
    rng = rng or secrets.SystemRandom()
    movable = [u for u in state['units'] if u['side'] == 'de' and u['kind'] != 'airfield']
    order = sorted(movable, key=lambda u: (not u.get('mission_radar'), len(candidates(state, u)), u['id']))
    deployed = [u for u in state['units'] if u not in movable and not u.get('reserve')]
    for unit in order:
        choices = [p for p in candidates(state, unit)
                   if not any(v['pos'] == p and domains.is_air(v) == domains.is_air(unit)
                              for v in deployed)]
        if not choices:
            raise ValueError('Nightfall Veil deployment zone has no legal space.')
        unit['pos'] = list(rng.choice(choices))
        deployed.append(unit)
    # This private scouting memory is excluded from public snapshots and is
    # based on Allied sightings only, never on the true radar positions.
    state['night_search_checked'] = []


def record_search(state):
    if not enabled(state):
        return
    from .visibility import sees_hex
    checked = {tuple(p) for p in state.get('night_search_checked', [])}
    for sector in state['battlefield']['night_search_sectors']:
        for pos in sector['sites']:
            if tuple(pos) not in checked and sees_hex(state, 'us', pos, True):
                checked.add(tuple(pos))
    state['night_search_checked'] = [list(p) for p in sorted(checked)]


def search_goals(state, observed):
    """Allied AI receives only observed radars and published possible sites."""
    from .visibility import active
    seen = [u['pos'] for u in observed if u['side'] == 'de' and u.get('mission_radar') and active(u)]
    if seen:
        return seen
    checked = {tuple(p) for p in state.get('night_search_checked', [])}
    candidates = [p for sector in state['battlefield']['night_search_sectors'] for p in sector['sites']]
    # Last-known radar contacts are legitimate search information after light
    # expires; no hidden live-unit scan supplies target coordinates here.
    contacts = [u['pos'] for u in state.get('intel', {}).get('us', {}).values()
                if u['kind'] == 'radar']
    return contacts or [p for p in candidates if tuple(p) not in checked] or [state['battlefield']['objective']]


def redact(result):
    result.pop('night_search_checked', None)
    return result
