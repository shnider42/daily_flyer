from __future__ import annotations

from daily_flyer.utils import resolve_date
from daily_flyer_v2.context import FlyerContext
from daily_flyer_v2.experience import FlyerExperience
from daily_flyer_v2.products import f9_hub
from daily_flyer_v2.renderers.f9_arena import render_f9_arena


PRODUCT_BUILDERS = {
    "f9": f9_hub.build,
    "f9_hub": f9_hub.build,
    "f9_daily": f9_hub.build,
}

RENDERERS = {
    "f9_arena": render_f9_arena,
}


def build_flyer_experience(product: str, date_str: str | None = None, seed: int | None = None) -> FlyerExperience:
    product_key = (product or "f9_hub").strip().replace("-", "_") or "f9_hub"
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
