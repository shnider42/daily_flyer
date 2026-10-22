"""Catalog-only discovery metadata. Never part of a battle's rules snapshot.

Learning order is editorial, not AI difficulty. Release order follows catalog
registration, not invented release dates. Unannotated future maps stay visible.
"""

CATEGORIES = {
    'infantry': 'Infantry', 'combined': 'Combined arms', 'naval': 'Naval',
    'air': 'Aircraft', 'airborne': 'Airborne', 'amphibious': 'Landings',
    'attack-defend': 'Attack / defend', 'control': 'Area control',
    'playtest': 'Playtest', 'evacuation':'Evacuation', 'armor':'Armor', 'prebattle':'Pre-battle',
}

# key: learning position, additional categories, one short learning focus
GUIDE = {
    'the_war_1': (30, ['combined','armor','naval','air','airborne','amphibious','control','evacuation','prebattle','playtest'], 'Massive 80×48 campaign: all 34 unit classes, seven command groups, eight zones, weather, day/night and finite supplies.'),
    'village_2': (2, ['infantry','playtest'], 'Compact 2.0: distinct loadouts, officer recovery and suppression-only MG 42 teams.'),
    'stonebridge_2': (3, ['infantry','playtest'], 'Two specialist platoons: scouts direct mortars, engineers open river crossings, officers rally teams.'),
    'foy': (4, ['infantry','attack-defend','playtest'], 'Compact winter village: withdraw wounded infantry to finite aid posts.'),
    'peleliu': (5, ['infantry','attack-defend','playtest'], 'Compact island assault: cave relocation versus engineer sealing charges.'),
    'britain_2': (14, ['air','attack-defend'], 'Defend the radar network or escort finite raids: fuel, runway cycles, recovery and servicing.'),
    'midway_2': (13, ['naval','air','control'], 'Daytime carrier battle: finite air groups, launch/recovery cycles, repair and reloading aboard.'),
    'nightfall_beacon': (14, ['air','airborne','attack-defend'], 'Night bombing and airborne raid: short sight, aimed Spotlights, flares and Dakota drops.'),
    'nightfall_veil': (15, ['air','airborne','attack-defend'], 'Concealed night raid: search two sectors for radar sites amid constrained randomized defenses.'),
    'crosswind_strait': (12, ['naval','air','control'], 'Medium 2v2: two mixed air/naval platoons per side; carrier service and shipboard AA.'),
    'worlds_collide': (24, ['combined','armor','naval','air','airborne','amphibious','control'], 'Five platoons per coalition, every unit class and terrain, six control zones.'),
    'vire_crossroads': (22, ['combined','armor','control'], 'Lower density: two platoons, 17 units per side; one ground unit per hex.'),
    'belfry_valley': (23, ['combined','control'], 'Shared hexes: two friendly units per hex; three platoons, recon, mortars and snipers.'),
    'shingle_cove': (20, ['combined','amphibious','prebattle'], 'Learn private deployment, bunkers and blind naval preparation.'),
    'breakwater': (21, ['combined','amphibious','prebattle'], 'Plan a larger landing across several coastal approaches.'),
    'relay_crossing': (4, ['combined'], 'Small-map lab: scouts, radios, mortars, supply and armor.'),
    'kharkov': (18, ['combined','armor','control'], 'Tank-led flags, heavy armor and a scheduled counterstroke.'),
    'dunkirk': (19, ['combined','amphibious','evacuation'], 'Load boats and save infantry while the rearguard holds.'),
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
    source = board.get('source_id', board['id'])
    rank, tags, focus = GUIDE.get(source, (1000, [], 'Explore this operation.'))
    if source!='relay_crossing' and 4<=rank<1000:rank+=1
    if board.get('edition') == 'current' and not board.get('fleet_battle_version'):
        focus = ('Lower density: two platoons, 17 units per side; shared ground hexes.' if source == 'vire_crossroads' else focus)
        focus += ' Current DSL: two friendly ground units per hex; separate air layer.'
    tags = list(tags)
    mission = 'attack-defend' if board.get('night_ops_version') and not board.get('war_version') else 'control' if board.get('naval') or board.get('joint_ops') or board.get('front_mode')=='armored_control' else 'evacuation' if board.get('front_mode')=='evacuation' else 'attack-defend'
    if mission not in tags:tags.append(mission)
    for flag, tag in [('air', 'air'), ('naval', 'naval'), ('combined_arms', 'combined'), ('playtest', 'playtest')]:
        if board.get(flag) and tag not in tags:
            tags.append(tag)
    return dict(learning_order=rank, release_order=release_order, focus=focus,
                tags=tags, labels=[CATEGORIES[tag] for tag in tags])
