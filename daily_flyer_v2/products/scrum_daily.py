from __future__ import annotations

from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience, FlyerItem


DEFAULT_STORIES = [
    {"id": "DF-101", "title": "Define the next vertical slice", "status": "ready", "points": 3},
    {"id": "DF-102", "title": "Port one product to Flyer Engine v2", "status": "doing", "points": 5},
    {"id": "DF-103", "title": "Review visual distinctiveness", "status": "review", "points": 2},
    {"id": "DF-104", "title": "Cut old theme bloat safely", "status": "later", "points": 8},
]


def build(ctx: FlyerContext) -> FlyerExperience:
    lead = FlyerItem(
        kind="sprint_goal",
        label="Sprint goal",
        title="Make the next slice visible",
        body="Use this page as a lightweight sprint desk: goal, stories, blockers, and daily notes in one place.",
    )
    sections = [
        FlyerItem(kind="today", label="Today", title="Top focus", body="Pick one story to move, one risk to reduce, and one note to carry into tomorrow."),
        FlyerItem(kind="blockers", label="Blockers", title="Watch the drag", body="If a story is fuzzy, blocked, or too large, rewrite it before doing more work."),
        FlyerItem(kind="retro", label="Micro retro", title="End-of-day question", body="What got clearer today, and what still feels heavier than it should?"),
    ]
    actions = [
        FlyerItem(kind="board", label="Board", title="Sprint board", body="Move stories by clicking status buttons. Local-only for now.", data={"stories": DEFAULT_STORIES}),
        FlyerItem(kind="notes", label="Notes", title="Daily standup notes", body="Yesterday / Today / Blockers, stored in the browser for quick working notes."),
    ]
    return FlyerExperience(
        product="scrum_daily",
        layout="scrum_board",
        title="Scrum Daily",
        subtitle="A small working board for sprint focus, stories, and daily notes.",
        date_label=ctx.display_date,
        lead=lead,
        sections=sections,
        actions=actions,
        footer="Flyer Engine v2 working-room experiment. Local browser state only for now.",
    )
