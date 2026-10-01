"""First DSL combined-arms playtest. Saved operations keep their own unit stats."""


def enabled(state):
    return state.get('dsl_expansion') == 1


INFANTRY = {'squad', 'scout', 'sniper', 'engineer', 'paratrooper', 'leader', 'commander', 'mg', 'at_team', 'radioman', 'commando', 'mountain', 'partisan', 'askari', 'mortar', 'pathfinder'}
VEHICLES = {'tank', 'amphibious', 'halftrack', 'landing_craft'}


def roster(side, height):
    """Strength represents staying power, not an individual soldier count."""
    us = side == 'us'
    specs = {
        'squad': (4 if us else 3, 4, 2, 12 if us else 9, 0, 0),
        'leader': (2, 3, 3, 2, 0, 0),
        'mg': (3, 6 if us else 7, 2, 4 if us else 3, 0, 0),
        'scout': (2, 3, 3, 4, 0, 0),
        'engineer': (3, 3, 2, 6, 0, 1),
        'at_team': (2, 4 if us else 3, 2, 2, 0, 2),
        'commander': (2, 2, 3, 3, 0, 0),
        'tank': (4 if us else 5, 6 if us else 8, 3 if us else 2, 5, 2, 2),
        'at_gun': (3, 9 if us else 10, 2, 5, 0, 3),
        'amphibious': (4, 3, 3, 8, 1, 1),
        'paratrooper': (3, 4, 3, 8 if us else 6, 0, 1),
        'halftrack': (3, 5, 3, 8, 1, 0),
    }
    layout = [('squad',2,3,'A'),('leader',3,3,'A'),('mg',4,3,'A'),
              ('scout',5,4,'A'),('engineer',6,3,'A'),('at_team',7,3,'A'),
              ('squad',16,3,'B'),('leader',17,3,'B'),('mg',18,3,'B'),
              ('scout',19,4,'B'),('engineer',20,3,'B'),('at_team',21,3,'B'),
              ('commander',11,2,'HQ'),('tank',9,4,'HQ'),('tank',14,4,'HQ'),
              ('at_gun',8,7,'HQ'),('at_gun',15,7,'HQ'),
              ('amphibious',1,5,'HQ'),('paratrooper',11,1,'HQ'),('paratrooper',12,1,'HQ')]
    units = []
    counts = {}
    for i, (kind, x, depth, platoon) in enumerate(layout):
        if not us and kind=='paratrooper':
            kind='halftrack'
            depth=6  # Forward reserve can respond to spotted US landing zones.
        hp, reach, ap, size, armor, penetration = specs[kind]
        counts[platoon] = counts.get(platoon, 0)+1
        units.append(dict(id=f'{side}{i}', side=side, kind=kind,
                          pos=[x, height-1-depth if us else depth], hp=hp, max_hp=hp,
                          range=reach, ap=ap, base_ap=ap, personnel=size, armor=armor,
                          penetration=penetration, pinned=False, entrenched=kind=='at_gun',
                          overwatch=False, smoke=2 if kind=='engineer' else int(kind in INFANTRY-{'mg','at_team'}),
                          grenades=2 if kind=='engineer' else int(kind in {'squad','paratrooper'}),
                          platoon=platoon, number=counts[platoon], reserve=kind=='paratrooper',
                          ap_received=ap, banked_ap=0, carried_ap=0, road_pending=False, road_used=False))
    return units


def can_damage(unit, target):
    return unit.get('penetration', 0) >= target.get('armor', 0)


def damage(unit, target):
    if target['kind'] == 'halftrack' and unit['kind'] in {'tank', 'at_gun'}:
        return 3
    return 2 if unit['kind'] in {'tank','at_gun','at_team'} and target.get('armor') else 1


def suppression_threshold(unit):
    return unit.get('suppression',3 if unit['side']=='de' else 5)


def resolve_fire(state, unit, target, die, threshold):
    hit = die >= threshold and can_damage(unit, target)
    suppressed = not target.get('armor') and die >= suppression_threshold(unit)
    if hit:
        target['hp'] = max(0, target['hp']-damage(unit, target))
    if hit or suppressed:
        target['pinned'], target['overwatch'] = True, False
    if target['hp'] <= 0:
        from .transport import bail_out
        bail_out(state, target)
    return 'eliminated' if target['hp'] <= 0 else f'hit for {damage(unit,target)} and pinned' if hit else 'suppressed; no damage' if suppressed else 'missed'
