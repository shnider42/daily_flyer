"""Lahman-derived statistics. A missing input never becomes an observed zero."""
from functools import lru_cache
import gzip
import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "baseball_2025.json.gz"


def stat(name, digits=0, direction=1, note="Season total; playing time and schedule length affect this measure.", group="Counting"):
    return dict(name=name, digits=digits, direction=direction, note=note, group=group)


BATTING = {
    "ops": stat("OPS", 3, note="On-base percentage + slugging percentage. Not park- or era-adjusted.", group="Rates"),
    "relative_ops": stat("OPS vs. league", 3, note="OPS minus the combined AL/NL season OPS. Zero = league baseline. Not OPS+; no park adjustment.", group="Rates"),
    "avg": stat("Batting average", 3, note="Hits / at-bats.", group="Rates"),
    "obp": stat("On-base percentage", 3, note="(Hits + walks + hit by pitch) / (at-bats + walks + hit by pitch + sacrifice flies).", group="Rates"),
    "slg": stat("Slugging percentage", 3, note="Total bases / at-bats.", group="Rates"),
    "iso": stat("Isolated power (ISO)", 3, note="Slugging percentage minus batting average.", group="Rates"),
    "babip": stat("BABIP", 3, 0, "(Hits − home runs) / (at-bats − strikeouts − home runs + sacrifice flies). Context, defense and luck matter.", "Rates"),
    "bb_pct": stat("Walk rate", 1, note="Walks / plate appearances × 100. Changes are percentage points.", group="Rates"),
    "k_pct": stat("Strikeout rate", 1, -1, "Strikeouts / plate appearances × 100. Changes are percentage points.", "Rates"),
    "hr_pct": stat("Home-run rate", 1, note="Home runs / plate appearances × 100. Changes are percentage points.", group="Rates"),
    "sb_pct": stat("Steal success rate", 1, note="Stolen bases / (stolen bases + caught stealing) × 100. Undefined with no attempts.", group="Rates"),
}
for key, name in [("g", "Games"), ("pa", "Plate appearances"), ("ab", "At-bats"), ("r", "Runs"), ("h", "Hits"), ("doubles", "Doubles"), ("triples", "Triples"), ("hr", "Home runs"), ("rbi", "Runs batted in"), ("sb", "Stolen bases"), ("cs", "Caught stealing"), ("bb", "Walks"), ("so", "Strikeouts"), ("ibb", "Intentional walks"), ("hbp", "Hit by pitch"), ("sh", "Sacrifice hits"), ("sf", "Sacrifice flies"), ("gidp", "Grounded into double plays"), ("tb", "Total bases")]:
    BATTING[key] = stat(name, direction=-1 if key in ("cs", "so", "gidp") else 0 if key in ("ibb", "hbp", "sh", "sf") else 1)

PITCHING = {
    "era": stat("ERA", 2, -1, "Earned runs × 27 / outs recorded. Lower is better; not park-adjusted.", "Rates"),
    "relative_era": stat("ERA better than league", 2, 1, "Combined AL/NL ERA minus pitcher ERA. Positive = better than league. Not ERA+; no park adjustment.", "Rates"),
    "whip": stat("WHIP", 2, -1, "(Walks + hits allowed) × 3 / outs recorded.", "Rates"),
    "k9": stat("Strikeouts / 9 IP", 2, 1, "Strikeouts × 27 / outs recorded.", "Rates"),
    "bb9": stat("Walks / 9 IP", 2, -1, "Walks × 27 / outs recorded.", "Rates"),
    "h9": stat("Hits / 9 IP", 2, -1, "Hits allowed × 27 / outs recorded.", "Rates"),
    "hr9": stat("Home runs / 9 IP", 2, -1, "Home runs allowed × 27 / outs recorded.", "Rates"),
    "k_bb": stat("Strikeout / walk ratio", 2, 1, "Strikeouts / walks. Undefined when walks = 0.", "Rates"),
    "k_pct": stat("Strikeout rate", 1, 1, "Strikeouts / batters faced × 100.", "Rates"),
    "bb_pct": stat("Walk rate", 1, -1, "Walks / batters faced × 100.", "Rates"),
    "k_bb_pct": stat("Strikeout minus walk rate", 1, 1, "(Strikeouts − walks) / batters faced × 100.", "Rates"),
    "ip": stat("Innings pitched", 2, 1, "Outs / 3. Displayed as decimal innings (e.g. 5.33), NOT baseball's 5.1 / 5.2 notation."),
}
for key, name in [("g", "Games"), ("gs", "Games started"), ("w", "Wins"), ("l", "Losses"), ("cg", "Complete games"), ("sho", "Shutouts"), ("sv", "Saves"), ("h", "Hits allowed"), ("r", "Runs allowed"), ("er", "Earned runs"), ("hr", "Home runs allowed"), ("bb", "Walks allowed"), ("so", "Strikeouts"), ("ibb", "Intentional walks"), ("wp", "Wild pitches"), ("hbp", "Hit batters"), ("bk", "Balks"), ("bfp", "Batters faced"), ("gf", "Games finished"), ("sh", "Sacrifice hits allowed"), ("sf", "Sacrifice flies allowed"), ("gidp", "Double plays induced")]:
    PITCHING[key] = stat(name, direction=-1 if key in ("l", "h", "r", "er", "hr", "bb", "wp", "hbp", "bk") else 0 if key in ("ibb", "sh", "sf") else 1)

FIELDING = {
    "po": stat("Putouts", direction=0, group="Fielding"),
    "assists": stat("Fielding assists", direction=0, group="Fielding"),
    "errors": stat("Fielding errors", direction=-1, group="Fielding"),
    "dp": stat("Fielding double plays", direction=0, group="Fielding"),
    "fpct": stat("Fielding percentage", 3, 1, "(Putouts + assists) / (putouts + assists + errors). Not adjusted for position or chances; not a defensive-value metric.", "Fielding"),
}
METRICS = {"batting": BATTING | FIELDING, "pitching": PITCHING | FIELDING}


def total(rows, key):
    values = [r.get(key) for r in rows]
    return sum(values) if values and all(v is not None for v in values) else None


def ratio(numerator, denominator, factor=1):
    return factor * numerator / denominator if numerator is not None and denominator is not None and denominator > 0 else None


def batting_metrics(r):
    r = dict(r)
    r["pa"] = sum(r[k] for k in ("ab", "bb", "hbp", "sh", "sf")) if all(r.get(k) is not None for k in ("ab", "bb", "hbp", "sh", "sf")) else None
    r["tb"] = r["h"] + r["doubles"] + 2*r["triples"] + 3*r["hr"] if all(r.get(k) is not None for k in ("h", "doubles", "triples", "hr")) else None
    r["avg"], r["slg"] = ratio(r.get("h"), r.get("ab")), ratio(r["tb"], r.get("ab"))
    r["obp"] = ratio(r["h"] + r["bb"] + r["hbp"], r["ab"] + r["bb"] + r["hbp"] + r["sf"]) if all(r.get(k) is not None for k in ("h", "ab", "bb", "hbp", "sf")) else None
    r["ops"] = r["obp"] + r["slg"] if r["obp"] is not None and r["slg"] is not None else None
    r["iso"] = r["slg"] - r["avg"] if r["slg"] is not None and r["avg"] is not None else None
    r["babip"] = ratio(r["h"]-r["hr"], r["ab"]-r["so"]-r["hr"]+r["sf"]) if all(r.get(k) is not None for k in ("h", "hr", "ab", "so", "sf")) else None
    for target, source in (("bb_pct", "bb"), ("k_pct", "so"), ("hr_pct", "hr")):
        r[target] = ratio(r.get(source), r["pa"], 100)
    r["sb_pct"] = ratio(r["sb"], r["sb"]+r["cs"], 100) if r.get("sb") is not None and r.get("cs") is not None else None
    return r


def pitching_metrics(r):
    r = dict(r)
    outs = r.get("outs")
    r["ip"], r["era"] = ratio(outs, 3), ratio(r.get("er"), outs, 27)
    r["whip"] = ratio(r["bb"]+r["h"], outs, 3) if r.get("bb") is not None and r.get("h") is not None else None
    for key, source in (("k9", "so"), ("bb9", "bb"), ("h9", "h"), ("hr9", "hr")):
        r[key] = ratio(r.get(source), outs, 27)
    r["k_bb"] = ratio(r.get("so"), r.get("bb"))
    r["k_pct"], r["bb_pct"] = ratio(r.get("so"), r.get("bfp"), 100), ratio(r.get("bb"), r.get("bfp"), 100)
    r["k_bb_pct"] = r["k_pct"]-r["bb_pct"] if r["k_pct"] is not None and r["bb_pct"] is not None else None
    return r


@lru_cache(maxsize=1)
def load_dataset():
    with gzip.open(DATA_PATH, "rt", encoding="utf-8") as stream:
        return json.load(stream)
