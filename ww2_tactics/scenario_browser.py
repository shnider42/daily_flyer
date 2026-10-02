"""Catalog-only discovery metadata. Never part of a battle's rules snapshot.

Learning order is editorial, not AI difficulty. Release order follows catalog
registration, not invented release dates. Unannotated future maps stay visible.
"""

CATEGORIES = {
    'infantry': 'Infantry', 'combined': 'Combined arms', 'naval': 'Naval',
    'air': 'Aircraft', 'airborne': 'Airborne', 'amphibious': 'Landings',
    'attack-defend': 'Attack / defend', 'control': 'Area control',
    'playtest': 'Playtest',
}

# key: learning position, additional categories, one short learning focus
GUIDE = {
    'village': (1, ['infantry'], 'Start here: movement, cover and actions.'),
    'orchard': (2, ['infantry'], 'Use cover to cross exposed ground.'),
    'stonebridge': (3, ['infantry'], 'Fight for a narrow crossing.'),
    'riverfront': (4, ['infantry'], 'Coordinate several platoons.'),
    'frontier': (5, ['combined', 'airborne'], 'Add armor, specialists and fog of war.'),
    'stalingrad': (6, ['combined'], 'Street fighting, damaged buildings and snipers.'),
    'carentan': (7, ['combined', 'airborne'], 'Use airborne troops and observation towers.'),
    'market_garden': (8, ['combined', 'airborne'], 'Link airborne pockets with armored relief.'),
    'omaha': (9, ['combined', 'amphibious'], 'Bring infantry ashore under fire.'),
    'midway': (10, ['naval', 'amphibious'], 'Coordinate ships, searches and island landings.'),
    'britain': (11, ['air'], 'Try aircraft, interception and radar.'),
    'apennine': (12, ['combined'], 'Mountain routes and local platoon intelligence.'),
    'desert_signal': (13, ['combined'], 'Mobile armor, long gun lines and radio reports.'),
    'amba_dawn': (14, ['combined'], 'Asymmetric infantry and mountain approaches.'),
    'tidal_gate': (15, ['combined', 'amphibious', 'airborne'], 'Link landings, engineers and multiple objectives.'),
    'iron_lantern': (16, ['combined', 'airborne'], 'Call reserve drops and protect landing zones.'),
    'fubar': (17, ['combined', 'naval', 'air', 'airborne', 'amphibious'], 'All unit types together, with air and surface layers.'),
}


def describe(board, release_order):
    rank, tags, focus = GUIDE.get(board['id'], (1000, [], 'Explore this operation.'))
    tags = list(tags)
    mission = 'control' if board.get('naval') or board.get('joint_ops') else 'attack-defend'
    tags.append(mission)
    for flag, tag in [('air', 'air'), ('naval', 'naval'), ('combined_arms', 'combined'), ('playtest', 'playtest')]:
        if board.get(flag) and tag not in tags:
            tags.append(tag)
    return dict(learning_order=rank, release_order=release_order, focus=focus,
                tags=tags, labels=[CATEGORIES[tag] for tag in tags])
