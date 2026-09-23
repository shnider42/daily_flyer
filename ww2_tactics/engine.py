"""Pure rules; every move is validated again on the server."""
import copy
import secrets
from .scenarios import battlefield, get_scenario

WIDTH, HEIGHT = 7, 9
OBJECTIVE = [3, 4]
NAMES = {"us": "Americans", "de": "Germans"}
STATS = {"squad": (3, 4), "mg": (3, 6), "leader": (2, 3)}


def terrain(x, y, state=None):
    if state is not None and state.get('battlefield'):
        return state['battlefield']['map'][y][x]
    if [x, y] == OBJECTIVE:
        return "objective"
    if (x, y) in {(2, 3), (4, 3), (2, 5), (4, 5)}:
        return "building"
    if (x, y) in {(0, 2), (1, 3), (5, 3), (6, 2), (0, 5), (1, 6), (5, 6), (6, 5)}:
        return "woods"
    return "road" if x == 3 or y == 4 else "field"


def cube(pos):
    x, y = pos
    q = x - (y - (y & 1)) // 2
    return (q, -q-y, y)


def distance(a, b):
    return max(abs(x-y) for x, y in zip(cube(a), cube(b)))


def line_clear(a, b, smoke=(), state=None):
    if any(s['pos'] in (a, b) for s in smoke):
        return False
    n = distance(a, b)
    ac, bc = cube(a), cube(b)
    for i in range(1, n):
        # Consistent tiny nudge resolves lines exactly on hex edges.
        p = [ac[j] + (bc[j]-ac[j])*i/n + (1e-6 if j < 2 else -2e-6) for j in range(3)]
        r = [round(v) for v in p]
        k = max(range(3), key=lambda j: abs(r[j]-p[j]))
        r[k] = -sum(r[j] for j in range(3) if j != k)
        y = r[2]
        x = r[0] + (y-(y & 1))//2
        if terrain(x, y, state) in {"building", "woods"} or any(s['pos'] == [x, y] for s in smoke):
            return False
    return True


def initial(scenario='village'):
    board = get_scenario(scenario)
    units = []
    for side, row in [("us", board['height']-1), ("de", 0)]:
        for i, (kind, col) in enumerate([("squad", 1), ("leader", 2), ("mg", 3), ("squad", 4), ("squad", 5)]):
            hp, reach = STATS[kind]
            units.append(dict(id=f"{side}{i}", side=side, kind=kind, pos=[col+(board['width']-7)//2, row], hp=hp,
                              range=reach, ap=2, pinned=False, entrenched=False,
                              overwatch=False, smoke=1 if kind == 'squad' else 0))
    return dict(units=units, turn="us", round=1, hold=0, winner=None, rules_version=3, smoke=[], battlefield=board,
                battle_number=1, victories={'us': 0, 'de': 0},
                log=[f"{board['name']} · Americans move first. Hold the objective at the end of two consecutive American turns. German defense wins after round {board['rounds']}."],
                revision=0, ready=False)


def fire_modifiers(state, unit, target):
    cover = terrain(*target["pos"], state) in {"building", "woods", "objective"}
    supported = any(u["side"] == unit["side"] and u["kind"] == "leader" and u["hp"] > 0
                    and distance(u["pos"], unit["pos"]) <= 1 for u in state["units"])
    return dict(cover=int(cover), distance=int(distance(unit['pos'], target['pos']) > 3),
                leader=-int(supported), machine_gun=-int(unit['kind'] == 'mg'),
                dug_in=int(state.get('rules_version', 1) >= 2 and target.get('entrenched', False)))


def fire_threshold(state, unit, target):
    return max(2, 4 + sum(fire_modifiers(state, unit, target).values()))


def watchers(state, target, pos):
    """Eligible reaction shooters at the destination, in stable unit order."""
    if state.get('rules_version', 1) < 3:
        return []
    destination = dict(target, pos=pos, entrenched=False)
    return [u for u in state['units'] if u['side'] != target['side'] and u['hp'] > 0
            and u.get('overwatch') and not u['pinned']
            and distance(u['pos'], pos) <= u['range']
            and line_clear(u['pos'], pos, state.get('smoke', []), state)
            and fire_threshold(state, u, destination)+1 <= 6]


def react(state, mover, roll):
    messages = []
    for shooter in watchers(state, mover, mover['pos']):
        if mover['hp'] <= 0:
            break
        shooter['overwatch'] = False
        die = roll()
        threshold = fire_threshold(state, shooter, mover)+1
        if die >= threshold:
            mover['hp'] -= 1
            mover['pinned'] = True
            mover['overwatch'] = False
        result = 'eliminated' if mover['hp'] <= 0 else 'hit and pinned' if die >= threshold else 'missed'
        messages.append(f"{NAMES[shooter['side']]} {shooter['kind']} overwatch: rolled {die}, needed {threshold}+. Target {result}.")
        state['last_combat'] = dict(kind='Overwatch', roll=die, threshold=threshold, result=result,
                                    attacker=shooter['id'], target=mover['id'], revision=state['revision']+1)
    return messages


def options(state, unit):
    moves, targets = [], []
    board = battlefield(state)
    extras = dict(smoke=[], dig=False, assaults=[], overwatch=False)
    if not state["ready"] or state["winner"] or unit["hp"] <= 0 or unit["side"] != state["turn"]:
        return dict(moves=moves, targets=targets, rally=False, **extras)
    occupied = [u["pos"] for u in state["units"] if u["hp"] > 0]
    if not unit["pinned"]:
        for y in range(board['height']):
            for x in range(board['width']):
                tile = terrain(x, y, state)
                cost = 2 if tile in {"woods", "building"} else 1
                if tile != 'water' and distance(unit["pos"], [x, y]) == 1 and [x, y] not in occupied and unit["ap"] >= cost:
                    moves.append(dict(pos=[x, y], cost=cost, threats=len(watchers(state, unit, [x, y]))))
        if unit["ap"] >= 2:
            for target in state["units"]:
                if target["side"] != unit["side"] and target["hp"] > 0 and distance(unit["pos"], target["pos"]) <= unit["range"] and line_clear(unit["pos"], target["pos"], state.get('smoke', []), state):
                    targets.append(dict(id=target["id"], threshold=fire_threshold(state, unit, target), modifiers=fire_modifiers(state, unit, target)))
        if state.get('rules_version', 1) >= 2:
            extras['dig'] = unit['ap'] >= 2 and not unit.get('entrenched', False)
            if unit['ap'] >= 1 and unit.get('smoke', 0):
                extras['smoke'] = [[x, y] for y in range(board['height']) for x in range(board['width'])
                                   if distance(unit['pos'], [x, y]) <= 1
                                   and not any(s['pos'] == [x, y] for s in state.get('smoke', []))]
            if unit['kind'] != 'mg' and unit['ap'] >= 2:
                extras['assaults'] = [dict(id=t['id'], threshold=3 if t['pinned'] else 4)
                                     for t in state['units'] if t['hp'] > 0 and t['side'] != unit['side']
                                     and distance(unit['pos'], t['pos']) == 1]
        extras['overwatch'] = state.get('rules_version', 1) >= 3 and unit['ap'] >= 2 and not unit.get('overwatch', False)
    return dict(moves=moves, targets=targets, rally=unit["pinned"] and unit["ap"] >= 1, **extras)


def apply(state, side, action, roll=None):
    if not state["ready"]:
        raise ValueError("Waiting for the second player.")
    if state["winner"]:
        raise ValueError("This match has ended.")
    if state["turn"] != side:
        raise ValueError("It is your opponent's turn.")
    state = copy.deepcopy(state)
    board = battlefield(state)
    roll_die = roll or (lambda: secrets.randbelow(6)+1)
    kind = action.get("kind")
    message = ""
    reactions = []
    if kind == "end":
        state['smoke'] = [dict(s, ttl=s['ttl']-1) for s in state.get('smoke', []) if s['ttl'] > 1]
        if side == "us":
            held = any(u["side"] == "us" and u["hp"] > 0 and u["pos"] == board['objective'] for u in state["units"])
            state["hold"] = state["hold"] + 1 if held else 0
            if state["hold"] >= 2:
                state["winner"] = "us"
        elif state["round"] >= board['rounds']:
            state["winner"] = "de"
        else:
            state["round"] += 1
        state["turn"] = "de" if side == "us" else "us"
        for u in state["units"]:
            if u["side"] == state["turn"]:
                u["ap"] = 2
                u['overwatch'] = False
        message = f"{NAMES[side]} ended their turn."
    else:
        unit = next((u for u in state["units"] if u["id"] == action.get("unit") and u["hp"] > 0 and u["side"] == side), None)
        if unit is None:
            raise ValueError("Choose one of your surviving units.")
        legal = options(state, unit)
        if kind == "move":
            move = next((m for m in legal["moves"] if m["pos"] == action.get("pos")), None)
            if not move:
                raise ValueError("That hex is not a legal move.")
            unit["pos"] = move["pos"]
            unit["ap"] -= move["cost"]
            unit['entrenched'] = False
            message = f"{NAMES[side]} {unit['kind']} moved to {chr(65+unit['pos'][0])}{unit['pos'][1]+1}."
            reactions = react(state, unit, roll_die)
        elif kind == "fire":
            shot = next((t for t in legal["targets"] if t["id"] == action.get("target")), None)
            if not shot:
                raise ValueError("Target is blocked, out of range, or you need 2 actions.")
            target = next(u for u in state["units"] if u["id"] == shot["id"])
            die = (roll or (lambda: secrets.randbelow(6)+1))()
            unit["ap"] -= 2
            hit = die >= shot["threshold"]
            if hit:
                target["hp"] -= 1
                target["pinned"] = True
                target['overwatch'] = False
            result = "eliminated" if target["hp"] <= 0 else "hit and pinned" if hit else "missed"
            message = f"{NAMES[side]} {unit['kind']} fired: rolled {die}, needed {shot['threshold']}+. Target {result}."
            state['last_combat'] = dict(kind='Fire', roll=die, threshold=shot['threshold'], result=result,
                                        attacker=unit['id'], target=target['id'], revision=state['revision']+1)
        elif kind == 'dig' and legal['dig']:
            unit['ap'] -= 2
            unit['entrenched'] = True
            message = f"{NAMES[side]} {unit['kind']} dug in. Incoming fire needs +1 until this unit moves."
        elif kind == 'overwatch' and legal['overwatch']:
            unit['ap'] -= 2
            unit['overwatch'] = True
            message = f"{NAMES[side]} {unit['kind']} is on overwatch until its next turn."
        elif kind == 'smoke' and action.get('pos') in legal['smoke']:
            unit['ap'] -= 1
            unit['smoke'] -= 1
            state.setdefault('smoke', []).append(dict(pos=action['pos'], ttl=2))
            message = f"{NAMES[side]} {unit['kind']} threw smoke. It blocks fire until the end of the opponent's turn."
        elif kind == 'assault':
            assault = next((a for a in legal['assaults'] if a['id'] == action.get('target')), None)
            if not assault:
                raise ValueError('Assault requires an unpinned squad or leader, 2 actions, and an adjacent enemy.')
            target = next(u for u in state['units'] if u['id'] == assault['id'])
            die = (roll or (lambda: secrets.randbelow(6)+1))()
            unit['ap'] -= 2
            unit['entrenched'] = False
            if die >= assault['threshold']:
                target['hp'] -= 2
                target['pinned'] = True
                target['overwatch'] = False
                result = 'eliminated; attacker advanced' if target['hp'] <= 0 else 'hit for 2 and pinned'
                if target['hp'] <= 0:
                    unit['pos'] = list(target['pos'])
            else:
                unit['hp'] -= 1
                unit['pinned'] = True
                result = 'repulsed; attacker lost 1 and pinned' if unit['hp'] > 0 else 'repulsed; attacker eliminated'
            message = f"{NAMES[side]} assaulted: rolled {die}, needed {assault['threshold']}+. {result}."
            state['last_combat'] = dict(kind='Assault', roll=die, threshold=assault['threshold'], result=result,
                                        attacker=unit['id'], target=target['id'], revision=state['revision']+1)
            if target['hp'] <= 0 and unit['hp'] > 0:
                reactions = react(state, unit, roll_die)
        elif kind == "rally" and legal["rally"]:
            unit["pinned"] = False
            unit["ap"] -= 1
            message = f"{NAMES[side]} {unit['kind']} rallied (1 action)."
        else:
            raise ValueError("Invalid action.")
    for team in ("us", "de"):
        if not any(u["hp"] > 0 and u["side"] == team for u in state["units"]):
            state["winner"] = "de" if team == "us" else "us"
    # Losing the objective breaks the consecutive-turn hold immediately.
    if not any(u["side"] == "us" and u["hp"] > 0 and u["pos"] == board['objective'] for u in state["units"]):
        state["hold"] = 0
    state["log"] = (state["log"] + [message] + reactions)[-40:]
    if state["winner"]:
        state["log"].append(f"{NAMES[state['winner']]} win.")
        wins = state.setdefault('victories', {'us': 0, 'de': 0})
        wins[state['winner']] += 1
    state["revision"] += 1
    return state
