from __future__ import annotations

from html import escape

from daily_flyer_v2.experience import FlyerExperience, FlyerItem


def _item_html(item: FlyerItem) -> str:
    source = ""
    if item.url:
        source = f'<a class="v2-source" href="{escape(item.url)}" target="_blank" rel="noopener noreferrer">Source</a>'
    return f"""
        <article class="v2-note v2-note--{escape(item.kind)}">
            <div class="v2-label">{escape(item.label)}</div>
            <h3>{escape(item.title)}</h3>
            <p>{escape(item.body)}</p>
            {source}
        </article>
    """


def render_publication(experience: FlyerExperience) -> str:
    masthead_image = escape(str(experience.data.get("masthead_image", "") or ""))
    if masthead_image:
        masthead = f'<img class="v2-masthead-image" src="/{masthead_image}" alt="{escape(experience.title)}">'
    else:
        masthead = f'<h1>{escape(experience.title)}</h1>'

    sections = "\n".join(_item_html(item) for item in experience.sections)
    actions = "\n".join(_item_html(item) for item in experience.actions)
    lead_source = ""
    if experience.lead.url:
        lead_source = f'<a class="v2-source" href="{escape(experience.lead.url)}" target="_blank" rel="noopener noreferrer">Source</a>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{escape(experience.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {{
    --paper: #f8efd9;
    --paper-deep: #ead7ad;
    --ink: #161615;
    --muted: #645b4b;
    --rule: #1f1b15;
    --green: #0f6b3f;
    --orange: #c35a2c;
}}
* {{ box-sizing: border-box; }}
body {{
    margin: 0;
    color: var(--ink);
    background:
        linear-gradient(90deg, rgba(15,107,63,0.10), transparent 18%, transparent 82%, rgba(195,90,44,0.10)),
        repeating-linear-gradient(0deg, rgba(40,32,18,0.035) 0 1px, transparent 1px 7px),
        var(--paper);
    font-family: Georgia, "Times New Roman", serif;
}}
a {{ color: var(--green); font-weight: 700; }}
.v2-page {{ width: min(1120px, calc(100vw - 32px)); margin: 0 auto; padding: 24px 0 42px; }}
.v2-topline {{ display: flex; justify-content: space-between; gap: 1rem; padding: 0.35rem 0; border-top: 3px solid var(--rule); border-bottom: 1px solid var(--rule); font: 700 0.78rem/1.2 system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }}
.v2-masthead {{ text-align: center; padding: 1.1rem 0 0.9rem; border-bottom: 3px double var(--rule); }}
.v2-masthead h1 {{ margin: 0; font-size: clamp(3rem, 9vw, 7rem); line-height: 0.85; letter-spacing: -0.06em; }}
.v2-masthead-image {{ display: block; margin: 0 auto; width: min(620px, 92%); height: auto; }}
.v2-subtitle {{ margin: 0.65rem auto 0; max-width: 48rem; color: var(--muted); font: 600 1rem/1.45 system-ui, sans-serif; }}
.v2-layout {{ display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.75fr); gap: 1.2rem; padding-top: 1.2rem; }}
.v2-lead {{ padding: 1rem 1.1rem 1.15rem; border: 2px solid var(--rule); background: rgba(255,255,255,0.28); box-shadow: 7px 7px 0 rgba(31,27,21,0.12); }}
.v2-lead .v2-label {{ color: #fff; background: var(--orange); display: inline-block; padding: 0.25rem 0.45rem; font: 800 0.72rem/1 system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.08em; }}
.v2-lead h2 {{ margin: 0.65rem 0 0; font-size: clamp(2.2rem, 6vw, 4.9rem); line-height: 0.92; letter-spacing: -0.055em; }}
.v2-lead p {{ max-width: 62ch; font-size: clamp(1.05rem, 1.7vw, 1.34rem); line-height: 1.55; }}
.v2-side {{ display: grid; gap: 0.8rem; align-content: start; }}
.v2-note {{ border-top: 2px solid var(--rule); padding: 0.72rem 0 0.78rem; }}
.v2-note h3 {{ margin: 0.25rem 0 0; font-size: 1.3rem; line-height: 1.08; }}
.v2-note p {{ margin: 0.45rem 0 0; color: #2d2a24; line-height: 1.48; }}
.v2-label {{ font: 800 0.72rem/1.2 system-ui, sans-serif; letter-spacing: 0.10em; text-transform: uppercase; color: var(--green); }}
.v2-action-strip {{ grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.9rem; border-top: 3px double var(--rule); margin-top: 0.8rem; padding-top: 0.9rem; }}
.v2-footer {{ margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--rule); color: var(--muted); font: 700 0.82rem/1.4 system-ui, sans-serif; }}
@media (max-width: 780px) {{
    .v2-layout {{ grid-template-columns: 1fr; }}
    .v2-topline {{ flex-direction: column; }}
}}
</style>
</head>
<body>
    <main class="v2-page">
        <div class="v2-topline"><span>Flyer Engine v2 proof</span><span>{escape(experience.date_label)}</span></div>
        <header class="v2-masthead">
            {masthead}
            <p class="v2-subtitle">{escape(experience.subtitle)}</p>
        </header>
        <section class="v2-layout">
            <article class="v2-lead">
                <div class="v2-label">{escape(experience.lead.label)}</div>
                <h2>{escape(experience.lead.title)}</h2>
                <p>{escape(experience.lead.body)}</p>
                {lead_source}
            </article>
            <aside class="v2-side">
                {sections}
            </aside>
            <section class="v2-action-strip">
                {actions}
            </section>
        </section>
        <footer class="v2-footer">{escape(experience.footer)}</footer>
    </main>
</body>
</html>
"""
