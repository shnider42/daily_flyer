from functools import lru_cache
import json
from pathlib import Path

METRICS = {
    "average": dict(name="Scoring average", digits=2, unit="pins / game", note="Average as printed in the PBA profile. Oil patterns, venues and fields differ; this is not an era-adjusted or national Tour-only average."),
    "cash_rate": dict(name="Cash rate", digits=1, unit="%", note="Profile cashes ÷ profile events × 100. A cash means a paid finish. Changes are percentage points; cash lines and event formats vary."),
    "earnings_per_event": dict(name="Earnings per event", digits=0, unit="$ / event", note="Profile earnings ÷ profile events. Nominal US dollars; not adjusted for inflation or prize-pool changes. This is not take-home income."),
    "earnings": dict(name="Season earnings", digits=0, unit="$", note="Earnings as printed in the profile, in nominal US dollars. Schedule, event mix and prize pools matter."),
    "titles": dict(name="Profile titles", digits=0, unit="titles", note="Titles from the profile Career Stats table. These can include events beyond the national Tour; do not read them as national Tour title totals."),
    "cashes": dict(name="Paid finishes", digits=0, unit="cashes", note="Cashes as printed in the profile. More events create more opportunities to cash."),
    "events": dict(name="Events entered", digits=0, unit="events", note="Profile event count: a workload measure, not a performance grade. Event mix and season length differ."),
}

USBC_METRICS = {
    "average": dict(name="Scoring average", digits=2, unit="pins / game", note="USBC Team USA Trials scratch pinfall ÷ 30, verified against all five daily game sheets. Incomplete entries have no average. This is a single tournament, not a PBA season or league average."),
    "finish": dict(name="Overall finish", digits=0, unit="place", note="Place after round five, within the men's or women's field. Lower is better. Ties are retained. This is the ranking-points standing, not the U.S. Amateur stepladder result; field sizes vary."),
    "ranking_points": dict(name="Ranking points", digits=1, unit="points", note="Total daily ranking points as published by USBC. Lower is better; the size and strength of each year's field affect comparisons."),
    "pinfall": dict(name="Total scratch pinfall", digits=0, unit="pins", note="Total pins from the overall standings. Partial entries can have fewer games and are identified in the player details and export."),
}


@lru_cache(maxsize=1)
def load_usbc_dataset():
    path = Path(__file__).resolve().parents[1] / "data" / "bowling_usbc.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_dataset():
    path = Path(__file__).resolve().parents[1] / "data" / "bowling_seasons.json"
    return json.loads(path.read_text(encoding="utf-8"))
