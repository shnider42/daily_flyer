"""Pure rules; every move is validated again on the server."""
import copy
import secrets

WIDTH, HEIGHT = 7, 9
OBJECTIVE = [3, 4]
NAMES = {"us": "Americans", "de": "Germans"}
STATS = {"squad": (3, 4), "mg": (3, 6), "leader": (2, 3)}


def terrain(x, y):
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


def line_clear(a, b):
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
        if terrain(x, y) in {"building", "woods"}:
            return False
    return True


def initial():
    units = []
    for side, row in [("us", 8), ("de", 0)]:
        for i, (kind, col) in enumerate([("squad", 1), ("leader", 2), ("mg", 3), ("squad", 4), ("squad", 5)]):
            hp, reach = STATS[kind]
            units.append(dict(id=f"{side}{i}", side=side, kind=kind, pos=[col, row], hp=hp,
                              range=reach, ap=2, pinned=False))
    return dict(units=units, turn="us", round=1, hold=0, winner=None,
                log=["Village Crossing · Americans move first. Hold the square at the end of two consecutive American turns. German defense wins after round 8."],
                revision=0, ready=False)


def fire_threshold(state, unit, target):
    cover = terrain(*target["pos"]) in {"building", "woods", "objective"}
    supported = any(u["side"] == unit["side"] and u["kind"] == "leader" and u["hp"] > 0
                    and distance(u["pos"], unit["pos"]) <= 1 for u in state["units"])
    return max(2, 4 + int(cover) + int(distance(unit["pos"], target["pos"]) > 3)
               - int(supported) - int(unit["kind"] == "mg"))


def options(state, unit):
    moves, targets = [], []
    if not state["ready"] or state["winner"] or unit["hp"] <= 0 or unit["side"] != state["turn"]:
        return dict(moves=moves, targets=targets, rally=False)
    occupied = [u["pos"] for u in state["units"] if u["hp"] > 0]
    if not unit["pinned"]:
        for y in range(HEIGHT):
            for x in range(WIDTH):
                cost = 2 if terrain(x, y) in {"woods", "building"} else 1
                if distance(unit["pos"], [x, y]) == 1 and [x, y] not in occupied and unit["ap"] >= cost:
                    moves.append(dict(pos=[x, y], cost=cost))
        if unit["ap"] >= 2:
            for target in state["units"]:
                if target["side"] != unit["side"] and target["hp"] > 0 and distance(unit["pos"], target["pos"]) <= unit["range"] and line_clear(unit["pos"], target["pos"]):
                    targets.append(dict(id=target["id"], threshold=fire_threshold(state, unit, target)))
    return dict(moves=moves, targets=targets, rally=unit["pinned"] and unit["ap"] >= 1)


def apply(state, side, action, roll=None):
    if not state["ready"]:
        raise ValueError("Waiting for the second player.")
    if state["winner"]:
        raise ValueError("This match has ended.")
    if state["turn"] != side:
        raise ValueError("It is your opponent's turn.")
    state = copy.deepcopy(state)
    kind = action.get("kind")
    message = ""
    if kind == "end":
        if side == "us":
            held = any(u["side"] == "us" and u["hp"] > 0 and u["pos"] == OBJECTIVE for u in state["units"])
            state["hold"] = state["hold"] + 1 if held else 0
            if state["hold"] >= 2:
                state["winner"] = "us"
        elif state["round"] >= 8:
            state["winner"] = "de"
        else:
            state["round"] += 1
        state["turn"] = "de" if side == "us" else "us"
        for u in state["units"]:
            if u["side"] == state["turn"]:
                u["ap"] = 2
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
            message = f"{NAMES[side]} {unit['kind']} moved to {chr(65+unit['pos'][0])}{unit['pos'][1]+1}."
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
            result = "eliminated" if target["hp"] <= 0 else "hit and pinned" if hit else "missed"
            message = f"{NAMES[side]} {unit['kind']} fired: rolled {die}, needed {shot['threshold']}+. Target {result}."
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
    if not any(u["side"] == "us" and u["hp"] > 0 and u["pos"] == OBJECTIVE for u in state["units"]):
        state["hold"] = 0
    state["log"] = (state["log"] + [message])[-40:]
    if state["winner"]:
        state["log"].append(f"{NAMES[state['winner']]} win.")
    state["revision"] += 1
    return state
