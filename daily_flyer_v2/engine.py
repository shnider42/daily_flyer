from __future__ import annotations

from daily_flyer.utils import resolve_date
from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience
from daily_flyer_v2.products import birthday_helper, irish_today, scrum_daily, your_passage
from daily_flyer_v2.renderers.birthday_helper import render_birthday_helper
from daily_flyer_v2.renderers.passage_path import render_passage_path
from daily_flyer_v2.renderers.publication import render_publication
from daily_flyer_v2.renderers.scrum_board import render_scrum_board


PRODUCT_BUILDERS = {
    "irish_today": irish_today.build,
    "your_passage": your_passage.build,
    "topic_signal_daily": your_passage.build,
    "this_day_birthday": birthday_helper.build,
    "birthday_helper": birthday_helper.build,
    "scrum_daily": scrum_daily.build,
}

RENDERERS = {
    "publication": render_publication,
    "passage_path": render_passage_path,
    "birthday_helper": render_birthday_helper,
    "scrum_board": render_scrum_board,
}


def build_flyer_experience(product: str, date_str: str | None = None, seed: int | None = None) -> FlyerExperience:
    product_key = (product or "irish_today").strip().replace("-", "_") or "irish_today"
    if product_key not in PRODUCT_BUILDERS:
        raise ValueError("Unknown Flyer Engine v2 product: " + product_key)

    selected_date = resolve_date(date_str)
    resolved_seed = seed if seed is not None else selected_date.toordinal()
    context = FlyerContext(product=product_key, selected_date=selected_date, seed=resolved_seed)
    return PRODUCT_BUILDERS[product_key](context)


def build_flyer_html(product: str, date_str: str | None = None, seed: int | None = None) -> str:
    experience = build_flyer_experience(product=product, date_str=date_str, seed=seed)
    renderer = RENDERERS.get(experience.layout)
    if not renderer:
        raise ValueError("Unknown Flyer Engine v2 layout: " + experience.layout)
    return renderer(experience)
