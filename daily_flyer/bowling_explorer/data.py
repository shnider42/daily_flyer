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


@lru_cache(maxsize=1)
def load_dataset():
    path = Path(__file__).resolve().parents[1] / "data" / "bowling_seasons.json"
    return json.loads(path.read_text(encoding="utf-8"))
