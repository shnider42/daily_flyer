"""Versioned rule profiles. Missing identity means the original Classic game."""
PROFILES = {
    'classic': dict(id='classic', version=1, name='Classic', available=True),
    'dsl': dict(id='dsl', version=1, name='Double Secret Probation Squad Leader', available=True),
    'asl': dict(id='asl', version=None, name='ASL-inspired · planned', available=False),
}


def profile(name='classic'):
    if not isinstance(name, str) or name not in PROFILES or not PROFILES[name]['available']:
        raise ValueError('Choose Classic or DSL. The ASL-inspired ruleset is not playable yet.')
    return dict(PROFILES[name])


def dsl(state):
    return state.get('ruleset') == 'dsl' and state.get('ruleset_version') == 1


def base_ap(unit):
    return 3 if unit['kind'] == 'leader' else 2


def bank_limit(unit):
    return 2 if unit['kind'] == 'leader' else 1


def turn_limit(unit):
    return base_ap(unit)+bank_limit(unit)


def command_key(unit):
    return unit['side']+':'+unit.get('platoon', '')


def road(tile):
    return tile in {'road', 'bridge'}
