"""DSL combat v1: weapon effects and protection shared by every battlefield.

Profiles are capabilities, not scenario rules. New unit types can supply weapon,
protection, tracked, ammo_options and weapon_overrides without changing resolvers.
The version lives in the saved match; old matches retain their original rules.
"""
from .coordinates import column
from .visibility import active
from . import buildings, operations, fieldworks

VERSION = 1
PROFILES = {
    'small_arms': dict(label='Small arms', penetration=0, damage=1, targets=('infantry', 'vehicle', 'installation'), suppress=True),
    'machine_gun': dict(label='Machine-gun fire', penetration=0, damage=1, targets=('infantry', 'vehicle', 'installation'), suppress=True),
    'ap': dict(label='Armor-piercing shell', penetration=3, damage=2, infantry_damage=1, ship_damage=1, light_damage=3, penetrating=True),
    'he': dict(label='High-explosive shell', penetration=1, damage=1, infantry_damage=2, splash=1),
    'at_shell': dict(label='Anti-tank shell', penetration=3, damage=2, infantry_damage=1, ship_damage=1, light_damage=3, penetrating=True),
    'rocket': dict(label='Anti-tank rocket', penetration=3, damage=2, infantry_damage=1, ship_damage=1, penetrating=True),
    'naval_shell': dict(label='Naval shell', penetration=4, damage=2, infantry_damage=2, splash=1, penetrating=True, critical_infantry=True),
    'torpedo': dict(label='Torpedo', penetration=4, damage=3, targets=('ship', 'vehicle', 'light_armor')),
    'airstrike': dict(label='Strike ordnance', penetration=4, damage=2, penetrating=True),
    'bomb': dict(label='Aerial bomb', penetration=3, damage=2, penetrating=True),
    'air_gun': dict(label='Aircraft guns', penetration=0, damage=1, targets=('aircraft',)),
    'flak': dict(label='Anti-aircraft fire', penetration=0, damage=2, targets=('aircraft',)),
    'fragmentation': dict(label='Fragmentation', penetration=0, damage=2, targets=('infantry',)),
    'mortar': dict(label='Mortar fragments', penetration=0, damage=1, targets=('infantry',)),
    'artillery': dict(label='Heavy artillery', penetration=3, damage=2, ship_damage=1, splash=1, penetrating=True),
    'none': dict(label='Unarmed', penetration=0, damage=0, targets=()),
    'sniper_round': dict(label='Aimed rifle shot', penetration=0, damage=1, targets=('infantry',)),
}
for _weapon in ('ap', 'he', 'at_shell', 'rocket', 'naval_shell', 'airstrike', 'bomb', 'artillery'):
    PROFILES[_weapon]['structural'] = True
    PROFILES[_weapon]['area_fire'] = _weapon not in {'airstrike','artillery'}
DEFAULT_WEAPONS = dict(tank='ap', at_gun='at_shell', at_team='rocket', mg='machine_gun',
    halftrack='machine_gun', battleship='naval_shell', cruiser='naval_shell',
    destroyer='naval_shell', carrier='naval_shell', fighter='air_gun', aa_gun='flak',
    bomber='bomb', radar='none', airfield='none', landing_craft='none')
SHIPS = {'battleship', 'cruiser', 'destroyer', 'carrier'}


def enabled(state):
    return state.get('combat_version') == VERSION


def protection(unit):
    if 'protection' in unit:
        return unit['protection']
    kind = unit['kind']
    if kind in SHIPS: return 'ship'
    if kind in {'fighter', 'bomber'}: return 'aircraft'
    if kind in {'radar', 'airfield'}: return 'installation'
    if kind == 'tank' or unit.get('armor', 0) >= 2: return 'heavy_armor'
    if unit.get('armor'): return 'light_armor'
    if kind == 'landing_craft': return 'vehicle'
    return 'infantry'


def initialize(state):
    if state.get('ruleset') != 'dsl': return state
    state['combat_version'] = VERSION
    for unit in state['units']:
        unit.setdefault('protection', protection(unit))
        unit.setdefault('weapon', DEFAULT_WEAPONS.get(unit['kind'], 'small_arms'))
        unit.setdefault('tracked', unit['kind'] == 'tank')
        if unit['kind'] == 'tank': unit.setdefault('ammo_options', ['ap', 'he'])
        if unit.get('ammo_options'): unit.setdefault('ammo', unit['ammo_options'][0])
        if unit['kind'] == 'battleship': unit.setdefault('bombard_range', unit['range'] + 3)
        if unit['kind'] == 'commander':
            for key, value in dict(command_radius=4, artillery_range=12, artillery_charges=2,
                                   field_recon_range=12, field_recon_charges=2).items():
                unit.setdefault(key, value)
    return fieldworks.initialize(buildings.initialize(operations.initialize(state)))


def profile(unit, weapon=None):
    key = weapon or unit.get('ammo') or unit.get('weapon') or DEFAULT_WEAPONS.get(unit['kind'], 'small_arms')
    result = dict(PROFILES[key])
    if key == 'naval_shell':
        result['damage'] = unit.get('gun_damage', result['damage'])
        if result['damage'] < 2: result.update(splash=0, critical_infantry=False, infantry_damage=1, structural=False)
    if key == 'torpedo': result['damage'] = unit.get('torpedo_damage', 3)
    if key == 'airstrike': result['damage'] = unit.get('strike_damage', 2)
    result.update(unit.get('weapon_overrides', {}).get(key, {}))
    result['id'] = key
    return result


def damage(unit, target, weapon=None):
    p = profile(unit, weapon); kind = protection(target)
    # Surface weapons cannot attack aircraft unless the profile explicitly allows it.
    if kind not in p.get('targets', ('infantry', 'vehicle', 'light_armor', 'heavy_armor', 'ship', 'installation')): return 0
    armor = max(target.get('armor', 0), {'heavy_armor': 2, 'light_armor': 1, 'ship': 3}.get(kind, 0))
    if p['penetration'] < armor: return 0
    if kind == 'infantry': return p.get('infantry_damage', p['damage'])
    if kind == 'light_armor': return p.get('light_damage', p['damage'])
    if kind == 'ship':
        if p['id'] == 'naval_shell': return max(1, p['damage'] - target.get('armor', 0))
        return p.get('ship_damage', p['damage'])
    return p['damage']


def suppression(unit):
    return unit.get('suppression', 3 if unit['side'] == 'de' else 5)


def preview(unit, target, threshold, modifiers=None, weapon=None, state=None):
    p = profile(unit, weapon); infantry = protection(target) == 'infantry'
    modifiers = dict(modifiers or {})
    if infantry and p.get('critical_infantry'):
        modifiers['shore_bombardment'] = max(0, 6 - threshold)
        threshold = max(6, threshold)
    amount = damage(unit, target, weapon)
    text = f'{amount} damage on a hit'
    if infantry: text += '; pins surviving infantry'
    if target.get('tracked') and p.get('penetrating'): text += '; a hit on 5–6 also immobilizes (can still fire)'
    if infantry and p.get('critical_infantry'): text += '; a natural 6 destroys the primary infantry target'
    if p.get('splash'): text += '; 1 damage + pin to adjacent infantry, including friendlies'
    if state and buildings.enabled(state) and p.get('structural') and buildings.condition(state, target['pos'], unit['side']):
        text += '; a hit collapses this damaged building and eliminates ground occupants' if buildings.condition(state, target['pos'], unit['side']) == 'damaged' else '; a hit damages this building'
    return dict(id=target['id'], threshold=threshold if amount else 7, modifiers=modifiers,
        damage=amount, weapon=p['id'], weapon_label=p['label'], effect_text=text,
        suppression_threshold=suppression(unit) if infantry and p.get('suppress') else None)


def impact(state, target, amount, *, immobilize=False, strip_cover=False):
    """Apply an already resolved effect. No randomness or faction assumptions."""
    from .transport import bail_out
    target['hp'] = max(0, target['hp'] - amount)
    infantry = protection(target) == 'infantry'
    target['pinned'] = infantry and target['hp'] > 0
    if infantry or not target['hp']: target['overwatch'] = False
    if strip_cover: target['entrenched'] = False
    if immobilize and target.get('tracked') and target['hp'] > 0:
        target.update(immobilized=True, road_pending=False)
    if not target['hp']:
        bail_out(state, target)
        return 'destroyed'
    result = f'hit for {amount}' if amount else 'suppressed; no damage'
    if infantry: result += '; pinned'
    if immobilize and target.get('tracked'): result += '; immobilized, can still fire'
    return result


def impact_record(target, result):
    return dict(id=target['id'], pos=list(target['pos']), kind=target['kind'], result=result)


def splash(state, pos, *, exclude=None, radius=1):
    from .engine import distance
    impacts = []
    for target in state['units']:
        if active(target) and target['id'] != exclude and protection(target) == 'infantry' and distance(pos, target['pos']) <= radius:
            impacts.append(impact_record(target, impact(state, target, 1)))
    return impacts


def resolve(state, unit, target, die, threshold, weapon=None):
    """Return the primary result and separate impacts for per-viewer redaction."""
    p = profile(unit, weapon); amount = damage(unit, target, weapon)
    if die >= threshold and amount:
        impacts = buildings.hit(state, target['pos']) if p.get('structural') and protection(target) != 'aircraft' else []
        if target['hp'] <= 0:
            result = 'eliminated in building collapse'
            if p.get('splash'): impacts += splash(state, target['pos'], exclude=target['id'])
            return result, impacts
        if p.get('critical_infantry') and die == 6 and protection(target) == 'infantry': amount = target['hp']
        result = impact(state, target, amount, immobilize=p.get('penetrating') and die >= 5)
        impacts.append(impact_record(target, result))
        if p.get('splash'): impacts += splash(state, target['pos'], exclude=target['id'])
        return result, impacts
    if amount and p.get('suppress') and protection(target) == 'infantry' and die >= suppression(unit):
        result = impact(state, target, 0)
        return result, [impact_record(target, result)]
    return 'missed', []


def orders(state, unit):
    result = dict(ammo=[], repair_tracks=False, bombard=[], artillery=[], field_recon=[])
    result.update(operations.orders(state,unit))
    if not enabled(state) or not state['ready'] or state.get('winner') or not active(unit) or unit['side'] != state['turn'] or unit.get('pinned'):
        return result
    if unit['ap'] >= 1: result['ammo'] = [key for key in unit.get('ammo_options', []) if key != unit.get('ammo')]
    result['repair_tracks'] = bool(unit.get('immobilized') and unit.get('tracked') and unit['ap'] >= 2)
    if unit['ap'] >= 2 and any(unit.get(k) for k in ('bombard_range', 'artillery_range', 'field_recon_range')):
        from .engine import distance
        board = state['battlefield']
        # Geometry only: legal aiming points never consult hidden occupancy or LOS.
        for kind in ('bombard', 'artillery', 'field_recon'):
            reach = unit.get(kind + '_range', 0)
            if kind != 'bombard' and not unit.get(kind + '_charges'): continue
            if operations.cooldown(state,unit,kind):continue
            result[kind] = [[x, y] for y in range(board['height']) for x in range(board['width'])
                            if distance(unit['pos'], [x, y]) <= reach] if reach else []
    return result


def action(state, unit, order, legal, roll):
    from .combat_display import record_combat
    from .effects import record_effect
    kind = order['kind']
    if kind in operations.ORDER_KINDS:
        return operations.action(state,unit,order,legal,roll)
    if kind == 'load_ammo' and order.get('ammo') in legal.get('ammo', []):
        unit.update(ammo=order['ammo'], ap=unit['ap']-1, overwatch=False, road_pending=False)
        return f"Loaded {profile(unit)['label'].lower()}s · 1 AP."
    if kind == 'repair_tracks' and legal.get('repair_tracks'):
        unit.update(immobilized=False, ap=unit['ap']-2, overwatch=False, road_pending=False)
        return 'Tracks repaired · 2 AP. Movement restored; no strength restored.'
    if kind in {'artillery', 'field_recon'} and order.get('pos') in legal.get(kind, []):
        from .engine import distance
        pos = list(order['pos']); unit['ap'] -= 2; unit[kind + '_charges'] -= 1
        operations.start_cooldown(state,unit,kind)
        if kind == 'field_recon':
            state.setdefault('recon', []).append(dict(side=unit['side'], pos=pos, radius=3, ttl=2))
            return 'Recon plane searched a 3-hex radius, including concealed troops. Sight lasts through the enemy turn · 2 AP.'
        board = state['battlefield']
        area = [[x, y] for y in range(board['height']) for x in range(board['width']) if distance(pos, [x, y]) <= 1]
        state.setdefault('barrages', []).append(dict(side=unit['side'], pos=pos, area=area, ttl=2,
                                                    attacker=unit['id'], weapon='artillery'))
        return f"Artillery called at {column(pos[0])}{pos[1]+1}. Impact at the end of the enemy turn; clear marked hexes. 2 AP."
    if kind == 'bombard' and order.get('pos') in legal.get('bombard', []):
        pos = list(order['pos']); die = roll(); unit['ap'] -= 2
        unit.update(overwatch=False, road_pending=False)
        impacts = []
        if die == 6:
            primary = next((t for t in state['units'] if active(t) and t['pos'] == pos), None)
            if primary:
                _, impacts = resolve(state, unit, primary, die, 6)
                # Even an immune primary does not shield nearby infantry from fragments.
                if not impacts:
                    impacts = buildings.hit(state, pos) + splash(state, pos, exclude=primary['id'])
            else: impacts = buildings.hit(state, pos) + splash(state, pos)
        result = 'Shells landed on the aimed hex; unobserved effects unknown' if die == 6 else 'Salvo missed; no damage'
        state['last_combat'] = dict(kind='Area bombardment', attacker=unit['id'], roll=die, threshold=6,
            result=result, impacts=impacts, aim=pos, revision=state['revision']+1)
        record_combat(state, note='2 AP. No sight required. Natural 6 hits the aimed hex; infantry there is destroyed, adjacent infantry takes 1 damage and pins. Friendly fire applies. Hidden results stay unknown.')
        record_effect(state, 'explosion', [pos])
        return f"Bombardment at {column(pos[0])}{pos[1]+1}: rolled {die}, needed 6. {result}."
    raise ValueError('That ammunition, track repair or bombardment order is unavailable.')


def resolve_artillery(state, strike, roll):
    """Delayed fire uses the same damage/track/splash resolver as direct fire."""
    from .combat_display import record_combat
    attacker = next(u for u in state['units'] if u['id'] == strike['attacker'])
    die = roll(); impacts = []; pos = strike['pos']
    if die >= 4:
        primary = next((u for u in state['units'] if active(u) and u['pos'] == pos), None)
        if primary:
            _, impacts = resolve(state, attacker, primary, die, 4, 'artillery')
            if not impacts:
                impacts = buildings.hit(state, pos) + splash(state, pos, exclude=primary['id'])
        else: impacts = buildings.hit(state, pos) + splash(state, pos)
    result = 'Artillery landed; unobserved effects unknown' if die >= 4 else 'Artillery missed; no damage'
    state['last_combat'] = dict(kind='Heavy artillery', attacker=attacker['id'], aim=list(pos),
        roll=die, threshold=4, result=result, impacts=impacts, revision=state['revision']+1)
    record_combat(state, note='4+ hits: 2 damage at the aim point (1 against ships); 5–6 also immobilizes tracked armor. Adjacent infantry takes 1 damage and pins. Friendly fire applies.')
    return result + '.'


def ai_orders(state, unit, legal, observed):
    """Extra orders scored using observed units and remembered contacts only."""
    from .engine import distance, fire_threshold, line_clear
    from .visibility import sees_hex
    if not enabled(state) or not any(legal.get(k) for k in ('ammo','repair_tracks','bombard','artillery','field_recon','repair_tank','snipe','area_fire')): return []
    observed=list(observed)
    choices = operations.ai_orders(state,unit,legal,observed); side = unit['side']
    def add(score, kind, **data):
        choices.append((score, dict(kind=kind, unit=unit['id'], **data)))
    enemies = [u for u in observed if active(u) and u['side'] != side]
    friends = [u for u in observed if active(u) and u['side'] == side]
    if legal.get('repair_tracks'): add(8, 'repair_tracks')
    # Compare ammunition against the same visible, reachable targets. Switching
    # back cannot improve this score, so the AI cannot oscillate between loads.
    targets = [t for t in enemies if distance(unit['pos'], t['pos']) <= unit['range']
               and line_clear(unit['pos'], t['pos'], state.get('smoke', []), state)] if unit.get('ammo') else []
    def ammo_value(ammo):
        gun = dict(unit, ammo=ammo)
        return max((damage(gun, t) * max(0, 7-fire_threshold(state, gun, t)) / 6
                    - (sum(distance(f['pos'], t['pos']) <= 1 for f in friends)*.8 if profile(gun).get('splash') else 0)
                    for t in targets), default=0)
    if unit.get('ammo'):
        current = ammo_value(unit['ammo'])
        for ammo in legal.get('ammo', []):
            better = ammo_value(ammo)
            if better > current + .25 and (unit['ap'] >= 3 or current == 0):
                add(12 + better if unit['ap'] >= 3 else 5, 'load_ammo', ammo=ammo)
    contacts = [c for uid,c in state.get('intel', {}).get(side, {}).items() if uid not in {e['id'] for e in enemies}]
    for kind in ('bombard', 'artillery'):
        allowed = {tuple(p) for p in legal.get(kind, [])}
        for candidate in enemies + contacts:
            pos = candidate['pos']
            if tuple(pos) not in allowed: continue
            known = sum(3 if protection(e) == 'infantry' else 2 for e in enemies if distance(pos, e['pos']) <= 1)
            remembered = 2 if candidate in contacts else 0
            friendly = sum(8 for f in friends if distance(pos, f['pos']) <= 1)
            value = known + remembered - friendly
            if value > 0: add(2 + value, kind, pos=list(pos))
    if legal.get('field_recon') and state.get('fog_of_war'):
        desired = min(contacts, key=lambda c: distance(unit['pos'], c['pos']))['pos'] if contacts else state['battlefield']['objective']
        point = min(legal['field_recon'], key=lambda p: distance(p, desired))
        if not sees_hex(state, side, point): add(7, 'field_recon', pos=list(point))
    return choices
