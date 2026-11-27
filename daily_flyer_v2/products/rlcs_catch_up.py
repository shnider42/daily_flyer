"""Reviewed RLCS catch-up edition. Dates never manufacture freshness."""
from __future__ import annotations

import json
from pathlib import Path

from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience, FlyerItem

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "rlcs_catch_up.json"


def build(context: FlyerContext) -> FlyerExperience:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return FlyerExperience(
        product="rlcs_catch_up", layout="rlcs_catch_up", title="RLCS Catch Up",
        subtitle="Pick up where you left off.", date_label=data["reviewed_at"],
        lead=FlyerItem("briefing", "RLCS Catch Up", data["coverage_note"]),
        sections=[FlyerItem("milestone", item["safe_title"], item["safe_summary"],
                            data={"id": item["id"]}) for item in data["stories"]],
        data=data, footer="An independent Daily Flyer Engine project.",
    )
