"""Normalize the documented PFR snapshots without downloading or scraping.

Run from the repository root; see docs/qb_year_two.md for inputs and provenance.
Additional complete PFR annual CSV exports can be passed as --annual YEAR=PATH.
"""
from __future__ import annotations
import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def number(value):
    value = str(value or "").strip().replace(",", "")
    if value in ("", "NA", "None", "nan", "--"):
        return None
    n = float(value)
    return int(n) if n.is_integer() else n


def clean_name(name):
    return name.replace("*", "").replace("+", "").strip()


def read_csv(path):
    # PFR exports contain TWO columns named Yds. DictReader alone loses passing yards.
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for headers in reader:
            if "Player" in headers or "player_id" in headers:
                break
        seen = Counter()
        unique = []
        for h in headers:
            seen[h] += 1
            unique.append(h if seen[h] == 1 else f"{h}.{seen[h]-1}")
        return [dict(zip(unique, row)) for row in reader if row]


def normalize_annual(path, year, name_map):
    output = []
    for r in read_csv(path):
        if r.get("Year") and int(r["Year"]) != year:
            continue
        if r.get("Player") in (None, "Player", "League Average", "League Totals"):
            continue
        name = clean_name(r["Player"])
        pid = r.get("Player-additional") or name_map.get(name)
        if not pid:
            raise ValueError(f"No verified PFR ID for {name}; supply Player-additional")
        mapping = {"g": "G", "gs": "GS", "cmp": "Cmp", "att": "Att", "yards": "Yds",
                   "td": "TD", "int": "Int", "sacks": "Sk", "sack_yards": "Yds.1"}
        output.append(dict(id=pid, name=name, year=year, team=r.get("Team", r.get("Tm")),
                           qb="QB" in (r.get("Pos") or ""),
                           **{key: number(r.get(col)) for key, col in mapping.items()}))
    return output


def build(args):
    people = read_csv(args.players)
    names = {r["name"]: Path(r["link"]).stem for r in people}
    # Josh Allen (QB) and Josh Allen (edge rusher) share a display name.
    names.update({r["name"]: Path(r["link"]).stem for r in people if "QB" in r["position"].split("-")})
    quarterbacks = {Path(r["link"]).stem for r in people if "QB" in r["position"].split("-")}
    primary_qbs = {Path(r["link"]).stem for r in people if r["position"].split("-")[0] == "QB"}
    rows = []
    fields = {"g": "games", "gs": "games_started", "cmp": "completed_passes", "att": "attempted_passes",
              "yards": "passing_yards", "td": "passing_touchdowns", "int": "interceptions_thrown",
              "sacks": "times_sacked", "sack_yards": "yards_lost_to_sacks"}
    for r in read_csv(args.history):
        if not re.fullmatch(r"\d{4}", r.get("year", "")) or int(r["year"]) >= 2010:
            continue
        if r["player_id"] not in quarterbacks and not number(r.get("attempted_passes")):
            continue
        if not r["team_abbreviation"]:
            continue
        rows.append(dict(id=r["player_id"], name=r["name"], year=int(r["year"]),
                         team=r["team_abbreviation"], qb=r["player_id"] in primary_qbs or bool(re.fullmatch(r"\d+-\d+-\d+", r.get("qb_record", ""))),
                         **{key: number(r[col]) for key, col in fields.items()}))
    for year in range(2010, 2024):
        rows.extend(normalize_annual(args.recent, year, names))
    years = list(range(1970, 2024))
    for item in args.annual:
        year, path = item.split("=", 1)
        year = int(year)
        annual = normalize_annual(path, year, names)
        max_g = max(r["g"] or 0 for r in annual)
        expected = 17 if year >= 2021 else 16
        if max_g < expected:
            raise ValueError(f"{year} appears partial: maximum games played = {max_g}")
        rows = [r for r in rows if r["year"] != year] + annual
        years.append(year)
    # No player/team/season may be counted twice.
    keys = [(r["id"], r["year"], r["team"]) for r in rows]
    if len(keys) != len(set(keys)):
        raise ValueError("Duplicate player/team/season in normalized data")
    for r in rows:
        if r["team"] == "BAL" and r["year"] < 1984:
            r["team"] = "BCL"
        if r["team"] == "HOU" and r["year"] < 1997:
            r["team"] = "HOO"
        if r["team"] == "STL" and r["year"] < 1988:
            r["team"] = "SLC"
    hof = {}
    for r in csv.DictReader(open(args.hof, encoding="utf-8-sig")):
        if r["name"] in names and "QB" in r["pos"]:
            hof[names[r["name"]]] = int(r["indct"])
    hof.update({"MannPe00": 2021, "BreeDr00": 2026})
    source_files = [args.history, args.recent, args.players, args.hof] + [s.split("=",1)[1] for s in args.annual]
    manifest = json.loads((ROOT / "daily_flyer/data/qb_sources.json").read_text())
    manifest.update(through=max(years), season_start=1970, built_on="2026-09-28",
                    source_hashes={Path(p).name: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in source_files})
    data = {"meta": manifest, "hall_of_fame": hof,
            "teams": json.loads((ROOT / "daily_flyer/data/qb_teams.json").read_text()),
            "rows": sorted(rows, key=lambda r:(r["id"], r["year"], r["team"]))}
    out = Path(args.output)
    out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"Wrote {len(rows)} season/team rows through {max(years)} to {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ("history", "recent", "players", "hof"):
        parser.add_argument("--"+field, required=True)
    parser.add_argument("--annual", action="append", default=[])
    parser.add_argument("--output", default=str(ROOT / "daily_flyer/data/qb_seasons.json"))
    build(parser.parse_args())
