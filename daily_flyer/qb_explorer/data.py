"""Cohort rules and metrics. Missing observations are never replaced with zero."""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import json

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "qb_seasons.json"
TOTAL_TEAMS = {"2TM", "3TM", "4TM", "TOT"}


def passer_rating(cmp, att, yards, td, ints):
    if not att:
        return None
    clamp = lambda v: max(0, min(2.375, v))
    return (clamp((cmp / att - .3) * 5) + clamp((yards / att - 3) * .25)
            + clamp(td / att * 20) + clamp(2.375 - ints / att * 25)) / 6 * 100


def metrics(row):
    r = dict(row)
    att, g = r.get("att"), r.get("g")
    r["cmp_pct"] = 100 * r["cmp"] / att if att and r.get("cmp") is not None else None
    r["td_pct"] = 100 * r["td"] / att if att and r.get("td") is not None else None
    r["int_pct"] = 100 * r["int"] / att if att and r.get("int") is not None else None
    r["ypg"] = r["yards"] / g if g and r.get("yards") is not None else None
    if all(r.get(k) is not None for k in ("cmp", "att", "yards", "td", "int")):
        r["rating"] = passer_rating(r["cmp"], att, r["yards"], r["td"], r["int"])
    else:
        r["rating"] = None
    needed = ("att", "yards", "td", "int", "sacks", "sack_yards")
    if all(r.get(k) is not None for k in needed) and att + r["sacks"] > 0:
        r["anya"] = (r["yards"] + 20*r["td"] - 45*r["int"] - r["sack_yards"]) / (att + r["sacks"])
    else:
        r["anya"] = None
    return r


def summarize_season(rows):
    """Use a PFR total once; retain team splits separately for qualification."""
    totals = [r for r in rows if r["team"] in TOTAL_TEAMS]
    parts = [r for r in rows if r["team"] not in TOTAL_TEAMS]
    if len(totals) > 1:
        raise ValueError("Duplicate season total")
    if totals:
        result = dict(totals[0])
    elif len(parts) == 1:
        result = dict(parts[0])
    else:
        result = dict(rows[0], team="2TM")
        for key in ("g", "gs", "cmp", "att", "yards", "td", "int", "sacks", "sack_yards"):
            result[key] = sum(r[key] for r in parts) if all(r.get(key) is not None for r in parts) else None
    result["teams"] = [{"team": r["team"], "gs": r["gs"]} for r in parts]
    result["qualifies"] = any(r.get("gs") is not None and r["gs"] >= 12 for r in parts)
    result["unresolved_split"] = bool(totals and not parts and (result.get("gs") or 0) >= 12)
    return metrics(result)


def build_dataset(raw):
    grouped = defaultdict(list)
    for row in raw["rows"]:
        grouped[(row["id"], row["year"])].append(row)
    seasons = [summarize_season(rows) for rows in grouped.values()]
    # Include all passers in the same-season, attempt-weighted league baseline.
    league = defaultdict(list)
    for row in seasons:
        league[row["year"]].append(row)
    baseline = {}
    for year, rows in league.items():
        keys = ("cmp", "att", "yards", "td", "int", "sacks", "sack_yards")
        sums = {k: sum(r.get(k) or 0 for r in rows) for k in keys}
        # Do not make a baseline out of an incomplete column.
        if any(r.get("sacks") is None or r.get("sack_yards") is None for r in rows if r.get("att")):
            sums["sacks"] = sums["sack_yards"] = None
        baseline[year] = metrics(sums)
    players = defaultdict(list)
    for row in seasons:
        if row["qb"]:
            base = baseline[row["year"]]
            row["relative_anya"] = row["anya"] - base["anya"] if row["anya"] is not None and base["anya"] is not None else None
            players[row["id"]].append(row)
    result = []
    unresolved = []
    for pid, career in players.items():
        career.sort(key=lambda r: r["year"])
        qualifying = [r for r in career if r["qualifies"]]
        if not any(r["year"] >= 1970 for r in qualifying):
            if any(r["unresolved_split"] and r["year"] >= 1970 for r in career):
                unresolved.append(career[0]["name"])
            continue
        first = qualifying[0]["year"]
        anchor_uncertain = any(r["unresolved_split"] and r["year"] < first for r in career)
        observations = [dict(r, starter_year=r["year"]-first+1) for r in career if r["year"] >= max(1970, first)]
        last = max(r["year"] for r in observations)
        result.append({"id": pid, "name": career[0]["name"], "first": first,
                       "anchor_uncertain": anchor_uncertain,
                       "hof": raw["hall_of_fame"].get(pid), "last": last,
                       "span": last-first+1, "observed_seasons": len(observations),
                       "qualifying_seasons": sum(r["qualifies"] for r in observations),
                       "seasons": observations})
    missing_baselines = sorted(year for year, r in baseline.items() if year >= 1970 and r["anya"] is None)
    return {"meta": dict(raw["meta"], unresolved_players=unresolved, missing_baseline_years=missing_baselines),
            "players": sorted(result, key=lambda p: p["name"]), "teams": raw["teams"]}


def load_dataset():
    return build_dataset(json.loads(DATA_PATH.read_text(encoding="utf-8")))
