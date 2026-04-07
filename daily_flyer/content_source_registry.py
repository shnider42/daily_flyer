from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


CARD_TYPES = (
    "classic_rock",
    "irish_history",
    "boston_sports",
    "famous_person_birthday",
    "fun_fact",
    "mom_daily",
)


@dataclass(frozen=True)
class SourceCandidate:
    card_type: str
    name: str
    domain: str
    primary_use: str
    cadence_support: str
    role: str
    notes: str = ""


SOURCE_CANDIDATES: tuple[SourceCandidate, ...] = (
    SourceCandidate(
        card_type="classic_rock",
        name="This Day in Music",
        domain="thisdayinmusic.com",
        primary_use="music anniversaries, album releases, artist milestones",
        cadence_support="day_or_week_of",
        role="discovery",
        notes="Best as a lead source for ideas; confirm major facts with a second source.",
    ),
    SourceCandidate(
        card_type="classic_rock",
        name="Ultimate Classic Rock",
        domain="ultimateclassicrock.com",
        primary_use="classic rock history, releases, band milestones",
        cadence_support="day_or_week_of",
        role="discovery",
        notes="Good editorial source for candidate facts and anniversaries.",
    ),
    SourceCandidate(
        card_type="classic_rock",
        name="Rock & Roll Hall of Fame",
        domain="rockhall.com",
        primary_use="artist background and significance",
        cadence_support="evergreen_validation",
        role="validation",
        notes="Good for concise artist context after a date-based fact is identified elsewhere.",
    ),
    SourceCandidate(
        card_type="classic_rock",
        name="Billboard",
        domain="billboard.com",
        primary_use="chart history and song popularity context",
        cadence_support="day_or_week_of",
        role="validation",
        notes="Useful for top-song tie-ins and chart-based mom_daily flavor.",
    ),
    SourceCandidate(
        card_type="irish_history",
        name="History Ireland",
        domain="historyireland.com",
        primary_use="Irish history features and readable historical context",
        cadence_support="day_or_week_of",
        role="discovery_and_validation",
        notes="Probably the best single editorial source to seed a curated Irish history pool.",
    ),
    SourceCandidate(
        card_type="irish_history",
        name="Century Ireland",
        domain="centuryireland.ie",
        primary_use="structured timelines and modern Irish history",
        cadence_support="day_or_week_of",
        role="discovery_and_validation",
        notes="Especially strong for 1912-1923 era and adjacent events.",
    ),
    SourceCandidate(
        card_type="irish_history",
        name="RTÉ",
        domain="rte.ie",
        primary_use="accessible history/culture explainers and event writeups",
        cadence_support="day_or_week_of",
        role="discovery_and_validation",
        notes="Good public-facing source with tone similar to Daily Flyer cards.",
    ),
    SourceCandidate(
        card_type="irish_history",
        name="National Library of Ireland",
        domain="nli.ie",
        primary_use="archival material and institutional validation",
        cadence_support="evergreen_validation",
        role="validation",
        notes="Best for confirmation and richer primary-source-style context.",
    ),
    SourceCandidate(
        card_type="irish_history",
        name="Dictionary of Irish Biography",
        domain="dib.ie",
        primary_use="biographical validation for notable Irish figures",
        cadence_support="evergreen_validation",
        role="validation",
        notes="Excellent when an Irish history fact centers on a person.",
    ),
    SourceCandidate(
        card_type="boston_sports",
        name="Baseball-Reference",
        domain="baseball-reference.com",
        primary_use="Red Sox player/game/stat history",
        cadence_support="day_or_week_of",
        role="validation",
        notes="Backbone source for Red Sox facts and birthdays.",
    ),
    SourceCandidate(
        card_type="boston_sports",
        name="Hockey-Reference",
        domain="hockey-reference.com",
        primary_use="Bruins player/game/stat history",
        cadence_support="day_or_week_of",
        role="validation",
        notes="Backbone source for Bruins facts and birthdays.",
    ),
    SourceCandidate(
        card_type="boston_sports",
        name="Basketball-Reference",
        domain="basketball-reference.com",
        primary_use="Celtics player/game/stat history",
        cadence_support="day_or_week_of",
        role="validation",
        notes="Backbone source for Celtics facts and birthdays.",
    ),
    SourceCandidate(
        card_type="boston_sports",
        name="Pro-Football-Reference",
        domain="pro-football-reference.com",
        primary_use="Patriots player/game/stat history",
        cadence_support="day_or_week_of",
        role="validation",
        notes="Backbone source for Patriots facts and birthdays.",
    ),
    SourceCandidate(
        card_type="boston_sports",
        name="NESN",
        domain="nesn.com",
        primary_use="Boston-specific story framing and local context",
        cadence_support="day_or_week_of",
        role="discovery",
        notes="Useful for finding candidate moments before validating stats elsewhere.",
    ),
    SourceCandidate(
        card_type="famous_person_birthday",
        name="On This Day",
        domain="onthisday.com",
        primary_use="discovery of famous birthdays and historical day-based events",
        cadence_support="day_or_week_of",
        role="discovery",
        notes="Excellent lead source; best cross-checked before a fact is promoted to verified.",
    ),
    SourceCandidate(
        card_type="famous_person_birthday",
        name="Britannica",
        domain="britannica.com",
        primary_use="biographical validation and concise educational summaries",
        cadence_support="evergreen_validation",
        role="validation",
        notes="Strong follow-up source for notable figures.",
    ),
    SourceCandidate(
        card_type="famous_person_birthday",
        name="Biography.com",
        domain="biography.com",
        primary_use="popular biographical context",
        cadence_support="evergreen_validation",
        role="validation",
        notes="Useful as a secondary cross-check.",
    ),
    SourceCandidate(
        card_type="fun_fact",
        name="Library of Congress Today in History",
        domain="loc.gov",
        primary_use="educational historical facts and cultural moments",
        cadence_support="day_or_week_of",
        role="validation",
        notes="Great source for real educational fun facts.",
    ),
    SourceCandidate(
        card_type="fun_fact",
        name="National Geographic",
        domain="nationalgeographic.com",
        primary_use="science/nature/culture explainers",
        cadence_support="evergreen_validation",
        role="validation",
        notes="Good when a fun fact needs stronger educational grounding.",
    ),
    SourceCandidate(
        card_type="fun_fact",
        name="National Day Calendar",
        domain="nationaldaycalendar.com",
        primary_use="quirky observances and novelty day flavor",
        cadence_support="day_of",
        role="flavor_only",
        notes="Use as seasoning, not as the backbone of a factual card.",
    ),
    SourceCandidate(
        card_type="fun_fact",
        name="Days of the Year",
        domain="daysoftheyear.com",
        primary_use="novelty observances and lifestyle tie-ins",
        cadence_support="day_of",
        role="flavor_only",
        notes="Same role as National Day Calendar; good for mom_daily voice.",
    ),
    SourceCandidate(
        card_type="mom_daily",
        name="Internal curated fact pool",
        domain="local_json",
        primary_use="assembled family-friendly summary card using pre-vetted facts",
        cadence_support="day_or_week_of",
        role="primary",
        notes="Mom daily should be built from curated facts, not raw live scraping.",
    ),
)


def get_card_types() -> tuple[str, ...]:
    return CARD_TYPES



def get_sources(card_type: str) -> list[SourceCandidate]:
    card_key = (card_type or "").strip().lower()
    return [item for item in SOURCE_CANDIDATES if item.card_type == card_key]



def source_registry_as_dict() -> dict[str, list[dict[str, str]]]:
    registry: dict[str, list[dict[str, str]]] = {card_type: [] for card_type in CARD_TYPES}
    for item in SOURCE_CANDIDATES:
        registry[item.card_type].append(
            {
                "name": item.name,
                "domain": item.domain,
                "primary_use": item.primary_use,
                "cadence_support": item.cadence_support,
                "role": item.role,
                "notes": item.notes,
            }
        )
    return registry



def source_summary_lines(card_type: str | None = None) -> list[str]:
    items: Iterable[SourceCandidate]
    if card_type:
        items = get_sources(card_type)
    else:
        items = SOURCE_CANDIDATES

    lines: list[str] = []
    for item in items:
        lines.append(
            f"[{item.card_type}] {item.name} ({item.domain}) — {item.primary_use} [{item.role}]"
        )
    return lines
