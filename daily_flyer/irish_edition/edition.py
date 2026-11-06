"""The dated, offline-readable editorial edition shared by HTML and JSON."""
from __future__ import annotations

import hashlib
import json
import random
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

from daily_flyer.providers.county import COUNTIES
from daily_flyer.themes.irish_today import HISTORY_THIS_DAY, THEME_CONFIG as IRISH_BRANDING, WORDS
from daily_flyer.themes.irish_today_interactive_showcase import TRIVIA_QUESTIONS

DUBLIN = ZoneInfo("Europe/Dublin")
ROOT = Path(__file__).parent
ASSETS = "daily_flyer/irish_edition/assets/"
ROLES = ("feature", "language", "county", "curiosity", "challenge", "sport", "visual", "discovery")
NAV_LINKS = {
    "feature": ("feature", "The edition", None),
    "language": ("gaeilge", "Gaeilge", "ga"),
    "county": ("counties", "Counties", None),
    "challenge": ("challenge", "Challenge", None),
}
PROVINCES = {
    "Leinster": "Carlow Dublin Kildare Kilkenny Laois Longford Louth Meath Offaly Westmeath Wexford Wicklow",
    "Munster": "Clare Cork Kerry Limerick Tipperary Waterford",
    "Connacht": "Galway Leitrim Mayo Roscommon Sligo",
    "Ulster": "Antrim Armagh Cavan Donegal Down Fermanagh Londonderry Monaghan Tyrone",
}
PROVINCE_BY_COUNTY = {name: province for province, names in PROVINCES.items() for name in names.split()}


@lru_cache(maxsize=1)
def content():
    return json.loads((ROOT / "content.json").read_text(encoding="utf-8"))


def dublin_today():
    return datetime.now(DUBLIN).date()


def edition_date(value):
    return date.fromisoformat(value) if value else dublin_today()


def rotation(pool, ordinal, role, seed):
    # A full cycle visits each item once. A seed offsets only its own desk.
    key = f"irish-today/v1/{role}/{seed if seed is not None else 'daily'}"
    offset = int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "big")
    return pool[(ordinal + offset) % len(pool)]


def county_atlas():
    atlas = []
    for county in COUNTIES:
        short = county["name"].removeprefix("County ")
        display = "Derry / Londonderry" if short == "Londonderry" else short
        atlas.append({
            "name": display, "slug": short.lower(), "title": "County " + display,
            "body": county["summary"], "province": PROVINCE_BY_COUNTY[short],
            "source": {"label": "County guide", "url": f"https://en.wikipedia.org/wiki/County_{short}"},
        })
    return atlas


def daily_challenge(day, seed, word, atlas):
    rng = random.Random(f"irish-today/challenge/{day.isoformat()}/{seed}")
    county = rng.choice(atlas)
    if day.weekday() in (1, 4):
        choices = sorted(PROVINCES)
        prompt = f"Which province is home to {county['title']}?"
        answer = county["province"]
        explanation = county["body"]
        source = county["source"]
    elif day.weekday() in (0, 3):
        other_meanings = sorted({w["english"] for w in WORDS} - {word["body"]})
        choices = [word["body"], *rng.sample(other_meanings, 3)]
        prompt = f"What does “{word['title']}” mean?"
        answer = word["body"]
        explanation = f"{word['example']} — {word['translation']}"
        source = word["source"]
    else:
        q = rotation(TRIVIA_QUESTIONS, day.toordinal(), "trivia", seed)
        choices = list(q["options"])
        prompt, answer, explanation = q["prompt"], choices[q["answerIndex"]], q["explanation"]
        source = None

    rng.shuffle(choices)
    return {
        "title": "Split the posts" if day.weekday() == 5 else "The daily question",
        "mode": "hurling" if day.weekday() == 5 else "quiz",
        "body": prompt, "choices": choices, "answer": choices.index(answer),
        "explanation": explanation, "source": source,
        "key": f"irish-today.v1.{day.isoformat()}.{seed if seed is not None else 'daily'}",
    }


def archive_note(day):
    # Compare dates in the edition's calendar year, including leap years.
    # Pick from the full annual archive even at the two ISO date boundaries.
    candidates = []
    for year in range(max(1, day.year - 1), min(9999, day.year + 1) + 1):
        for mmdd, item in HISTORY_THIS_DAY.items():
            if not item.get("source_url"):
                continue
            when = date.fromisoformat(f"{year:04}-{mmdd}")
            candidates.append((abs((when - day).days), when, item))
    _, when, item = min(candidates, key=lambda x: (x[0], x[1]))
    return {"title": when.strftime("%d %B").lstrip("0"),
            "body": item["body"], "anniversary": when == day,
            "source": {"label": "Historical background", "url": item["source_url"]}}


def make_edition(day, seed=None):
    data = content()
    number = day.toordinal()
    week = (number - 1) // 7  # 0001-01-01 was Monday.
    photos = {p["id"]: p for p in data["photos"]}
    features = data["features"]
    # An editor can schedule a particular issue or a recurring anniversary.
    dated = next((f for f in features if day.isoformat() in f.get("edition_dates", [])), None)
    anniversary = next((f for f in features if f.get("anniversary") == day.strftime("%m-%d")), None)
    feature = dict(dated or anniversary or rotation(features, number, "feature", seed))
    feature["photo"] = photos[feature["photo"]]
    word_pool = [w for w in WORDS if w["native_text"] in data["examples"]]
    chosen = rotation(word_pool, number, "language", seed)
    term = chosen["native_text"]
    example, translation = data["examples"][term]
    language = {"title": term, "body": chosen["english"], "sounds": chosen["pronunciation"],
                "example": example, "translation": translation,
                "source": {"label": "Hear the dialects", "url": "https://www.teanglann.ie/en/fuaim/" + quote(term.lower())}}
    atlas = county_atlas()
    county = rotation(atlas, week, "county", seed)
    visual = rotation([p for p in data["photos"] if p["id"] != feature["photo"]["id"]
                       and "unsplash.com" in p["source"]], number, "visual", seed)
    sections = dict(feature=feature, language=language, county=county,
                    curiosity=rotation(data["curiosity"], number, "curiosity", seed),
                    challenge=daily_challenge(day, seed, language, atlas),
                    sport=rotation(data["sport"], week, "sport", seed),
                    visual={"title": "In the frame", "body": visual["caption"], "photo": visual},
                    discovery=archive_note(day))
    return {"version": 1, "date": day.isoformat(), "timezone": DUBLIN.key, "seed": seed,
            "sections": sections}


def render_edition(edition, current_day=None):
    template = _template()
    day = date.fromisoformat(edition["date"])
    current = current_day or dublin_today()
    sections = edition["sections"]
    panels = [role for role in ROLES[1:] if role in sections]
    navigation = [NAV_LINKS[role] for role in ("feature", *panels) if role in NAV_LINKS]
    return template.render(edition=edition, s=sections, assets=ASSETS, day=day,
                           panels=panels, navigation=navigation, logo_src=IRISH_BRANDING["header_title_image"],
                           today=current, atlas=sorted(county_atlas(), key=lambda x: x["name"]),
                           previous=day-timedelta(days=1) if day > date.min else None,
                           following=day+timedelta(days=1) if day < current else None)


@lru_cache(maxsize=1)
def _template():
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    env = Environment(loader=FileSystemLoader(ROOT), autoescape=select_autoescape(["html"]),
                      trim_blocks=True, lstrip_blocks=True)
    return env.get_template("edition.html")
