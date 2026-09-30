#!/usr/bin/env python3
"""Compile PBA's current-season directory/profile tables; no requests at page load.

Use --cache-dir for a reproducible, locally retained copy of source responses.
Profile rows are deliberately NOT relabeled as national Tour-only records.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse, parse_qs

import requests
from bs4 import BeautifulSoup

BASE = "https://www.pba.com"
DIRECTORY = BASE + "/players?current_season=1"
FIELDS = ("events", "cashes", "match_play", "cra", "titles", "average", "earnings")
HEADERS = ["Year", "Events", "Cashes", "Match Play", "CRA", "Titles", "AVG", "Earnings"]


def number(value):
    value = value.strip().replace(",", "").replace("$", "")
    if value in ("", "-", "—", "N/A"):
        return None
    if not re.fullmatch(r"\d+(\.\d+)?", value):
        raise ValueError(f"Unrecognized numeric value: {value!r}")
    return float(value) if "." in value else int(value)


def parse_profile(html, url, through=2025):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.select_one("h1.name")
    if not title:
        raise ValueError(f"Missing player name: {url}")
    table = next((t for t in soup.select("table") if "Career Stats" in t.get_text()), None)
    if table is None:
        return None
    rows = table.select("tr")
    headers = [c.get_text(" ", strip=True) for c in rows[0].select("th,td")]
    if headers != HEADERS:
        raise ValueError(f"Changed profile schema: {url}: {headers}")
    seasons = []
    for row in rows[1:]:
        cells = [c.get_text(" ", strip=True) for c in row.select("td,th")]
        if not cells or cells[0] == "Total":
            continue
        if len(cells) != 8 or not re.fullmatch(r"\d{4}", cells[0]):
            raise ValueError(f"Unrecognized season row: {url}: {cells}")
        year = int(cells[0])
        if year > through:
            continue
        season = dict(year=year, **dict(zip(FIELDS, map(number, cells[1:]))))
        # 0.000 in a profile with no games/average is not a measured score.
        if season["average"] == 0:
            season["average"] = None
        if season["average"] is not None and not 0 < season["average"] <= 300:
            raise ValueError(f"Invalid average: {url}: {season}")
        for key in FIELDS[:5]:
            if season[key] is not None and int(season[key]) != season[key]:
                raise ValueError(f"Non-integral count: {url}: {key}")
        events = season["events"]
        if events is not None and season["cashes"] is not None and season["cashes"] > events:
            raise ValueError(f"Cashes exceed events: {url}: {year}")
        season["cash_rate"] = 100 * season["cashes"] / events if events and season["cashes"] is not None else None
        season["earnings_per_event"] = season["earnings"] / events if events and season["earnings"] is not None else None
        seasons.append(season)
    if len({s["year"] for s in seasons}) != len(seasons):
        raise ValueError(f"Duplicate season: {url}")
    if not seasons:
        return None
    def field(name):
        item = soup.select_one(f".field--name-field-{name} .field__item")
        return item.get_text(" ", strip=True) if item else None
    home = soup.select_one(".field--name-field-hometown")
    return dict(id=urlparse(url).path.rsplit("/", 1)[-1], name=title.get_text(" ", strip=True),
                hand=field("bowls"), joined=field("date-joined"),
                hometown=home.get_text(" ", strip=True) if home else "", source=url,
                seasons=sorted(seasons, key=lambda s: s["year"]))


def build(cache_dir, through):
    cache_dir.mkdir(parents=True, exist_ok=True)
    sources = {}
    def fetch(url):
        path = cache_dir / (hashlib.sha256(url.encode()).hexdigest()+".html")
        if not path.exists():
            response = requests.get(url, timeout=40, headers={"User-Agent": "DailyFlyer-Research/1.0 (PBA public profile snapshot)"})
            response.raise_for_status()
            path.write_text(response.text, encoding="utf-8")
        html = path.read_text(encoding="utf-8")
        sources[url] = dict(url=url, sha256=hashlib.sha256(html.encode()).hexdigest())
        return html
    first = BeautifulSoup(fetch(DIRECTORY), "html.parser")
    pages = {0}
    for a in first.select('a[href]'):
        query = parse_qs(urlparse(a["href"]).query)
        if query.get("current_season") == ["1"] and "page" in query:
            pages.add(int(query["page"][0]))
    maximum = max(pages)
    if maximum > 20:
        raise ValueError("Directory scope unexpectedly expanded; inspect before fetching.")
    urls = set()
    for page in range(maximum+1):
        soup = first if page == 0 else BeautifulSoup(fetch(DIRECTORY+f"&page={page}"), "html.parser")
        for a in soup.select('a[href^="/players/"]'):
            urls.add(urljoin(BASE, a["href"]))
    if len(urls) < 30:
        raise ValueError("Unexpectedly small current-season directory.")
    def player(url):
        return url, parse_profile(fetch(url), url, through)
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(player, sorted(urls)))
    players = sorted([p for _, p in results if p], key=lambda p: p["name"])
    excluded = [url for url, p in results if not p]
    stamp = datetime.now(timezone.utc).isoformat()
    meta = dict(source="PBA.com public Career Stats tables", directory=DIRECTORY,
                retrieved_at=stamp, through=through, directory_count=len(urls), players=len(players),
                season_count=sum(len(p["seasons"]) for p in players),
                scope="Profiles flagged current-season in the PBA directory at retrieval; not a complete historical Tour population.",
                caution="Profile rows can include competitions beyond the national Tour and differ from official Tour leaderboards. Titles are profile-table titles. Averages are not adjusted for oil pattern, venue or era. Earnings are nominal dollars.",
                season_rule="Use PBA's printed four-digit year labels; they are not guaranteed calendar-season boundaries. Year two means the next numeric label, never the next available row. The absent 2012 label is not filled from 2013.",
                refresh="Bundled snapshot through 2025; no live or automatic refresh. Later profile biographies do not extend statistical coverage.")
    data = dict(meta=meta, players=players)
    manifest = dict(meta=meta, sources=sorted(sources.values(), key=lambda s: s["url"]), excluded_no_seasons=excluded)
    root = Path(__file__).resolve().parents[1] / "daily_flyer" / "data"
    # All fetches and validation must succeed before touching the shipped snapshot.
    for name, value in (("bowling_seasons.json", data), ("bowling_sources.json", manifest)):
        path = root/name
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"))+"\n", encoding="utf-8")
        temp.replace(path)
    print(json.dumps({**meta, "excluded_profiles": len(excluded)}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--through", type=int, default=2025)
    args = parser.parse_args()
    build(args.cache_dir, args.through)
