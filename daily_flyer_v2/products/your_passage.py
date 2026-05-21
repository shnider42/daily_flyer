from __future__ import annotations

import random

from daily_flyer.themes.topic_signal_daily import DAILY_PASSAGES
from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience, FlyerItem


def _choose_passage(ctx: FlyerContext) -> dict:
    selector = ctx.seed if ctx.seed is not None else ctx.selected_date.toordinal()
    return DAILY_PASSAGES[selector % len(DAILY_PASSAGES)]


def build(ctx: FlyerContext) -> FlyerExperience:
    rng = random.Random(ctx.seed)
    passage = _choose_passage(ctx)
    steps = list(passage.get("steps", []))
    rng.shuffle(steps)

    lead = FlyerItem(
        kind="path_focus",
        label="Today's passage",
        title=str(passage.get("passage", "Finding a First Direction")),
        body=str(passage.get("audience", "A practical next step for young adults and the people helping them.")),
    )

    sections = [
        FlyerItem(kind="signal", label="Signal", title="What is underneath this?", body=str(passage.get("why", ""))),
        FlyerItem(kind="tension", label="Name it", title="What this can feel like", body=str(passage.get("feeling", ""))),
        FlyerItem(kind="skill", label="Practice", title=str(passage.get("skill", "One small skill")), body="This is the small behavior to practice today."),
        FlyerItem(kind="step", label="Next move", title="Do one of these", body=" | ".join(steps[:3])),
        FlyerItem(kind="conversation", label="Conversation", title="Ask this better question", body=str(passage.get("prompt", "What would make the next step feel clearer?"))),
    ]

    actions = [
        FlyerItem(kind="quest", label="Mini quest", title=str(passage.get("quest_question", "What is the strongest next move?")), body="Choose the option that lowers pressure and creates clarity.", data={"options": passage.get("quest_options", [])}),
        FlyerItem(kind="shuffle", label="Tiny mantra", title="Build today's reminder", body=str(passage.get("shuffle_answer", "one step gives me momentum")), data={"words": passage.get("shuffle_words", [])}),
        FlyerItem(kind="mentor", label="For the helper", title="Support without taking over", body=str(passage.get("parent_note", "Ask what kind of help would actually feel useful."))),
    ]

    return FlyerExperience(
        product="your_passage",
        layout="passage_path",
        title="Your Passage",
        subtitle="A small daily path from pressure toward one useful next step.",
        date_label=ctx.display_date,
        lead=lead,
        sections=sections,
        actions=actions,
        footer="A Flyer Engine v2 path page inspired by MyPassages.",
        data={"chips": passage.get("chips", [])},
    )
