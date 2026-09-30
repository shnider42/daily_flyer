#!/usr/bin/env python3
"""Build a separately scoped USBC Trials snapshot from official public results.

Requires requests, beautifulsoup4 and the Poppler pdftotext executable. Source
bytes are cached and hashed; no live requests are made by the application.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata
from urllib.parse import quote, urljoin

from bs4 import BeautifulSoup
import requests

ARCHIVE = "https://bowl.com/tournaments/team-usa-trials/past-results"
MEMBERS = "https://bowl.com/team-usa/team-members"
YEARS = range(2022, 2027)


def name_key(name):
    name = re.sub(r"\s*\((?:JR|AQ|WD)\)", "", name, flags=re.I)
    key = re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower())
    # The result sheets explicitly print this nickname in parentheses.
    return key.replace("terrancetjrock", "tjrock")


def clean_name(name):
    return re.sub(r"\s*\((?:JR|AQ|WD)\)", "", name, flags=re.I).strip()


def parse_overall(text, year, division, source):
    rows = []
    for line in text.splitlines():
        match = re.match(r"^\s*(\d+)\s+(.+?)\s+(\d+)\s+(\d+(?:\.\d+)?)\s*$", line)
        if not match:
            if re.match(r"^\s*\d+\s+\S", line):
                raise ValueError(f"Unparsed overall row: {line}")
            continue
        rank, prefix, a, b = match.groups()
        if year == 2026:
            parts = re.split(r"\s+", prefix)
            # Five daily position/pin pairs precede total position points/pins.
            daily = parts[-10:]
            if not all(s.isdigit() for s in daily):
                raise ValueError(f"Bad daily pairs: {line}")
            prefix = re.sub(r"(?:\s+\d+){10}$", "", prefix)
            points, pinfall = int(a), int(b)
            if sum(map(int, daily[1::2])) != pinfall:
                raise ValueError(f"Daily pinfall does not match: {line}")
        else:
            pinfall, points = int(a), float(b)
        # Class may touch a name in the compact 2022 women's PDF.
        fields = re.split(r"\s{2,}", prefix.strip())
        name = clean_name(fields[0])
        rest = fields[1:]
        category = rest.pop(0) if rest and re.fullmatch(r"(?:AM|P|Y|Y/P|YP|JR)", rest[0]) else ""
        hometown = " ".join(rest)
        if not hometown or len(name.split()) < 2:
            raise ValueError(f"Incomplete identity: {line}")
        rows.append(dict(name=name, source_name=fields[0], hometown=hometown, category=category,
                         year=year, division=division, finish=int(rank), pinfall=pinfall,
                         ranking_points=points, source=source))
    if not 70 <= len(rows) <= 250 or max(r["finish"] for r in rows) > len(rows):
        raise ValueError(f"Unexpected standings size: {year} {division}: {len(rows)}")
    keys = [name_key(r["name"]) for r in rows]
    if len(keys) != len(set(keys)):
        raise ValueError(f"Duplicate names require review: {year} {division}")
    for r in rows:
        r["field_size"] = len(rows)
    return rows


def parse_daily(text, rows):
    """Only return verified six-game blocks; partial/WD rows remain incomplete."""
    blocks = re.split(r"(?m)^\s*(?=\d+\s+\D)", text)
    result = {}
    for block in blocks:
        if not re.match(r"\d+\s+\D", block):
            continue
        # Wrapped names and class/city text precede six game scores and a total.
        first = re.sub(r"^\d+\s+", "", block)
        key = name_key(first)
        matches = [r for r in rows if key.startswith(name_key(r["name"]))]
        if len(matches) != 1:
            # Daily sheets may include withdrawals absent from final standings.
            # Never guess their identity; unmatched final entries lose averages.
            continue
        player = name_key(matches[0]["name"])
        if player in result:
            raise ValueError(f"Duplicate daily row: {player}")
        # Long hometowns can wrap state abbreviations into the game columns.
        # Recover a six-game run only when its following scratch total agrees.
        numbers = [float(v) for v in re.findall(r"\d+(?:\.\d+)?", first)]
        scores = []
        for i in range(len(numbers)-6):
            candidate = numbers[i:i+6]
            if all(v.is_integer() and 0<=v<=300 for v in candidate) and sum(candidate)==numbers[i+6] and sum(candidate)>0:
                scores = list(map(int,candidate))
                break
        result[player] = scores if len(scores)==6 and min(scores)>0 else None
    return result


def parse_profile(html, url):
    soup = BeautifulSoup(html, "html.parser")
    marker = soup.find(string=lambda s:s and s.strip()=="Resides:")
    if not marker:
        raise ValueError(f"Profile has no biographical fields: {url}")
    cell = marker.find_parent("td")
    lines = cell.get_text("\n", strip=True).splitlines()
    result = dict(name=lines[0], source=url)
    for label, key in (("Resides:","hometown"),("Throws:","throws"),("College:","college")):
        if label in lines:
            result[key] = lines[lines.index(label)+1]
    text = soup.get_text(" ", strip=True)
    for label, key in (("Team USA", "team_usa_years"),("Junior Team USA", "junior_team_usa_years")):
        m = re.search(r"Years on "+label+r"\s*\(\d+\):\s*(\d{4}(?:\s*[-–]\s*\d{4})?(?:,\s*\d{4}(?:\s*[-–]\s*\d{4})?)*)", text)
        if m:result[key]=m.group(1).strip()
    result["hand"] = "L" if "left" in result.get("throws","").lower() else "R" if "right" in result.get("throws","").lower() else ""
    return result


def build(cache, output):
    cache.mkdir(parents=True, exist_ok=True)
    sources = {}

    def fetch(url):
        ext = ".pdf" if url.lower().endswith(".pdf") else ".html"
        path = cache / (hashlib.sha256(url.encode()).hexdigest()+ext)
        if not path.exists():
            response = requests.get(url, timeout=90)
            response.raise_for_status()
            path.write_bytes(response.content)
        raw = path.read_bytes()
        sources[url] = dict(url=quote(url, safe=":/?=&%'"), sha256=hashlib.sha256(raw).hexdigest())
        if ext==".pdf":
            return subprocess.check_output(["pdftotext","-layout",str(path),"-"], text=True)
        return raw.decode("utf-8-sig")

    soup = BeautifulSoup(fetch(ARCHIVE), "html.parser")
    results = {y:{d:{} for d in ("men","women")} for y in YEARS}
    for label, key in [("After Round 5","overall")]+[(f"Round {i}",str(i)) for i in range(1,6)]:
        urls = [a["href"].replace("http:","https:") for a in soup.find_all("a") if a.get_text(" ",strip=True)==label][:10]
        if len(urls)!=10 or not all(str(2026-i//2) in url for i,url in enumerate(urls)):
            raise ValueError("Archive order changed; review the requested year/division links.")
        for i,url in enumerate(urls):
            results[2026-i//2]["women" if i%2 else "men"][key]=url
    urls = [url for divs in results.values() for rounds in divs.values() for url in rounds.values()]
    with ThreadPoolExecutor(max_workers=4) as pool:
        texts = dict(zip(urls, pool.map(fetch, urls)))
    players = {}
    reports = []
    for year, divs in results.items():
        for division, urls in divs.items():
            rows = parse_overall(texts[urls["overall"]],year,division,quote(urls["overall"],safe=":/?=&%'"))
            days = [parse_daily(texts[urls[str(day)]], rows) for day in range(1,6)]
            complete = 0
            for row in rows:
                key=name_key(row["name"])
                games=[day.get(key) for day in days]
                full=all(games)
                if full and sum(sum(game) for game in games)!=row["pinfall"]:
                    raise ValueError(f"Overall/daily totals disagree: {year} {row['name']}")
                row.update(games=30 if full else None, average=round(row["pinfall"]/30,6) if full else None,
                           average_status="30 verified game scores" if full else "Incomplete or unverified 30-game entry; average withheld")
                complete+=bool(full)
                id="usbc-"+division+"-"+key
                p=players.setdefault(id,dict(id=id,name=row["name"],dataset="usbc",division=division,hand="",source=ARCHIVE,seasons=[]))
                p["hometown"]=row["hometown"]
                p["name"]=row["name"]
                p["seasons"].append(row)
            reports.append(dict(year=year,division=division,entries=len(rows),complete_30_games=complete,
                                average_withheld=[r["name"] for r in rows if r["average"] is None],
                                overall=sources[urls["overall"]]["url"],daily=[sources[urls[str(d)]]["url"] for d in range(1,6)]))
            print(f"{year} {division}: {len(rows)} entries; {complete} verified averages",flush=True)
    members=BeautifulSoup(fetch(MEMBERS),"html.parser")
    profile_urls=[]
    roster_names={}
    for a in members.select('a[href^="/team-usa/"]'):
        if a.find("br") and a.find_parent("td") and a.get("href"):
            profile_urls.append(urljoin(MEMBERS,a["href"]))
            roster_names[profile_urls[-1]]=a.get_text("\n",strip=True).splitlines()[0]
    if len(profile_urls)!=26:raise ValueError(f"Team USA roster changed: {len(profile_urls)}")
    with ThreadPoolExecutor(max_workers=4) as pool:
        profiles=[parse_profile(html,url) for url,html in zip(profile_urls,pool.map(fetch,profile_urls))]
    for profile in profiles:
        profile["roster_name"]=roster_names[profile["source"]]
        found=[p for p in players.values() if name_key(p["name"]) in {name_key(profile["name"]),name_key(profile["roster_name"])}]
        if len(found)==1:
            found[0]["profile"]=profile
            found[0]["hand"]=profile["hand"]
    ordered=sorted(players.values(),key=lambda p:p["name"].lower())
    meta=dict(source="USBC / bowl.com Team USA Trials", directory=ARCHIVE, retrieved_at=datetime.now(timezone.utc).isoformat(),
              first_year=min(YEARS), through=max(YEARS), players=len(ordered),season_count=sum(len(p["seasons"]) for p in ordered),
              profile_count=len(profiles), complete_averages=sum(r["complete_30_games"] for r in reports),
              scope="Men's and women's overall standings after round five, 2022–2026. Separate from PBA profile seasons and U.S. Amateur stepladder results.",
              identity="Names are matched within division after punctuation, case and accent normalization. Unverified aliases or name changes remain separate records; no global member IDs are supplied.",
              average="Total scratch pins / 30, only after all 30 positive game scores in the five daily sheets sum to the overall total. Partial, absent or ambiguous scores withhold the average; they do not become zero.",
              clock="First complete 30-game entry in this 2022–2026 snapshot, not a bowler's debut or first professional year.",
              refresh="Bundled official-results snapshot; run the USBC builder to refresh. No live lookup or league-average data.")
    output.mkdir(parents=True,exist_ok=True)
    for name,data in (("bowling_usbc.json",dict(meta=meta,players=ordered,profiles=profiles)),
                      ("bowling_usbc_sources.json",dict(meta=meta,events=reports,sources=sorted(sources.values(),key=lambda s:s["url"])))):
        (output/name).write_text(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print(json.dumps(meta,indent=2))


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir",type=Path,required=True)
    parser.add_argument("--output-dir",type=Path,default=Path(__file__).resolve().parents[1]/"daily_flyer/data")
    args=parser.parse_args()
    build(args.cache_dir,args.output_dir)
