"""Rebuild the licensed Lahman snapshot from downloaded, unmodified CSV tables.

Usage: python -m scripts.build_baseball_data /path/to/lahman_2025_csv
No scraping, downloads, or requests occur in this builder or at application runtime.
"""
from collections import defaultdict
import argparse
import csv
import gzip
import hashlib
import json
from pathlib import Path
from daily_flyer.baseball_explorer.data import DATA_PATH, METRICS, batting_metrics, pitching_metrics, total, ratio

SOURCE = "https://sabr.org/lahman-database/"
MIRROR = "https://github.com/cbwinslow/lahman-database-csv/tree/0377e0b8d3f1b8f6710cc4faee7d842d0e81f344/data"
BAT = dict(g="G", ab="AB", r="R", h="H", doubles="2B", triples="3B", hr="HR", rbi="RBI", sb="SB", cs="CS", bb="BB", so="SO", ibb="IBB", hbp="HBP", sh="SH", sf="SF", gidp="GIDP")
PITCH = dict(g="G", gs="GS", w="W", l="L", cg="CG", sho="SHO", sv="SV", outs="IPouts", h="H", r="R", er="ER", hr="HR", bb="BB", so="SO", ibb="IBB", wp="WP", hbp="HBP", bk="BK", bfp="BFP", gf="GF", sh="SH", sf="SF", gidp="GIDP")
FIELD = dict(po="PO", assists="A", errors="E", dp="DP")


def number(value):
    return int(value) if value not in ("", None, "NA") else None


def aggregate(rows, mapping):
    numeric = [{key: number(row.get(source)) for key, source in mapping.items()} for row in rows]
    return {key: total(numeric, key) for key in mapping}


def build(root):
    hashes = {}

    def table(name):
        path = next((p for p in root.iterdir() if p.name.lower() == name.lower()+".csv"), None)
        if path is None:
            raise ValueError(f"Missing {name}.csv")
        hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        return list(csv.DictReader(path.open(encoding="utf-8-sig", newline="")))

    people = {p["playerID"]: p for p in table("People")}
    hof = {}
    for r in table("HallOfFame"):
        if r["inducted"] == "Y" and r["category"] == "Player" and int(r["yearid"]) <= 2025:
            hof[r["playerID"]] = min(hof.get(r["playerID"], 9999), int(r["yearid"]))
    awards, stars = defaultdict(set), defaultdict(set)
    for r in table("AwardsPlayers"):
        if r["awardID"] in ("Most Valuable Player", "Cy Young Award") and r.get("lgID") in ("AL", "NL", "ML"):
            awards[r["playerID"]].add(int(r["yearID"]))
    for r in table("AllStarFull"):
        if r.get("lgID") in ("AL", "NL"):
            stars[r["playerID"]].add(int(r["yearID"]))
    teams = {r["teamID"]: r["name"] for r in sorted(table("Teams"), key=lambda r: int(r["yearID"])) if r["lgID"] in ("AL", "NL")}
    field = defaultdict(list)
    for r in table("Fielding"):
        if r["lgID"] in ("AL", "NL"):
            field[(r["playerID"], int(r["yearID"]))].append(r)
    fields = {}
    for key, rows in field.items():
        f = aggregate(rows, FIELD)
        f["fpct"] = ratio(f["po"]+f["assists"], f["po"]+f["assists"]+f["errors"]) if all(f[k] is not None for k in ("po", "assists", "errors")) else None
        fields[key] = f
    output = {}
    counts = {}
    for role, name, mapping, metrics in [("batting", "Batting", BAT, batting_metrics), ("pitching", "Pitching", PITCH, pitching_metrics)]:
        groups = defaultdict(list)
        for r in table(name):
            if r["lgID"] in ("AL", "NL"):
                groups[(r["playerID"], int(r["yearID"]))].append(r)
        season_rows, league = {}, defaultdict(list)
        for (pid, year), rows in groups.items():
            numeric = aggregate(rows, mapping)
            # Sacrifice flies were not separately recorded before 1954. Leave PA/OBP
            # unavailable instead of silently treating historically missing data as zero.
            s = metrics(numeric)
            s.update(year=year, team=" / ".join(dict.fromkeys(r["teamID"] for r in rows)))
            s.update(fields.get((pid, year), {}))
            s["qualifies"] = bool((s.get("pa") or 0) >= 300) if role == "batting" else bool((s.get("outs") or 0) >= 150)
            season_rows[(pid, year)] = s
            league[year].append(numeric)
        # Aggregate totals BEFORE computing league rates. Exclude zero-PA batting
        # records, but retain zero-out pitchers: they can still allow earned runs.
        baselines = {}
        for year, rows in league.items():
            active = [r for r in rows if sum(r.get(k) or 0 for k in ("ab", "bb", "hbp", "sh", "sf")) > 0] if role == "batting" else rows
            baselines[year] = metrics({k: total(active, k) for k in mapping})
        careers = defaultdict(list)
        for (pid, year), s in season_rows.items():
            base = baselines[year].get("ops" if role == "batting" else "era")
            value = s.get("ops" if role == "batting" else "era")
            s["relative_ops" if role == "batting" else "relative_era"] = ((value-base) if role == "batting" else (base-value)) if value is not None and base is not None else None
            careers[pid].append(s)
        columns = ["year", "team", "qualifies", *METRICS[role]]
        players = []
        for pid, seasons in careers.items():
            seasons.sort(key=lambda s: s["year"])
            qualifying = [s for s in seasons if s["qualifies"]]
            if not qualifying:
                continue
            first = qualifying[0]["year"]
            # Reliable, common batting PA components start in 1954. Pitchers use
            # the same entry window, and full earlier histories prevent false anchors.
            if first < 1954:
                continue
            # A batter with an earlier 300-AB season is an established player even
            # when historical PA is incomplete; don't mislabel 1954 as their year one.
            if role == "batting" and any(s["year"] < first and (s.get("ab") or 0)+(s.get("bb") or 0)+(s.get("hbp") or 0)+(s.get("sh") or 0) >= 300 for s in seasons):
                continue
            person = people.get(pid)
            if person is None:
                raise ValueError(f"Missing person: {pid}")
            career = [s for s in seasons if s["year"] >= first]
            players.append(dict(id=pid, name=(person["nameFirst"]+" "+person["nameLast"]).strip(), bref=person.get("bbrefID") or None,
                                first=first, last=career[-1]["year"], hof=hof.get(pid), awards=sorted(awards[pid]), stars=sorted(stars[pid]),
                                seasons=[[round(s.get(k), 6) if isinstance(s.get(k), float) else s.get(k) for k in columns] for s in career]))
        output[role] = dict(columns=columns, players=sorted(players, key=lambda p: p["name"]))
        counts[role] = dict(players=len(players), seasons=sum(len(p["seasons"]) for p in players))
    meta = dict(from_year=1954, through=2025, hof_through=2025, source=SOURCE, mirror=MIRROR,
                license="https://creativecommons.org/licenses/by-sa/3.0/", attribution="Lahman Baseball Database © 1996–2025 SABR, via Sean Lahman. CC BY-SA 3.0.",
                changes="AL/NL subset; combined team stints, calculated rates, first qualifying season, compacted observations. Derived data licensed CC BY-SA 3.0.",
                scope="AL/NL players whose first qualifying season was 1954–2025. Earlier career history checked for established players. No minor, postseason, or Negro League statistics in this study.",
                files=hashes, counts=counts)
    return dict(meta=meta, metrics=METRICS, teams=teams, **output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_directory", type=Path)
    args = parser.parse_args()
    result = build(args.csv_directory)
    encoded = json.dumps(result, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    DATA_PATH.write_bytes(gzip.compress(encoded, mtime=0))
    DATA_PATH.with_name("baseball_sources.json").write_text(json.dumps(result["meta"], indent=2)+"\n")
    print(json.dumps(dict(bytes=len(encoded), compressed=DATA_PATH.stat().st_size, **result["meta"]["counts"]), indent=2))
