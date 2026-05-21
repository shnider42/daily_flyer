from __future__ import annotations

from html import escape

from daily_flyer_v2.experience import FlyerExperience, FlyerItem


MONTHS = [
    (1, "Jan"), (2, "Feb"), (3, "Mar"), (4, "Apr"), (5, "May"), (6, "Jun"),
    (7, "Jul"), (8, "Aug"), (9, "Sep"), (10, "Oct"), (11, "Nov"), (12, "Dec"),
]


def _find(items: list[FlyerItem], kind: str) -> FlyerItem | None:
    for item in items:
        if item.kind == kind:
            return item
    return None


def _calendar(month: int, day: int) -> str:
    blocks = []
    for month_num, month_name in MONTHS:
        links = []
        for d in range(1, 32):
            active = month_num == month and d == day
            links.append(f'<a class="bh-day {"is-active" if active else ""}" href="/v2?product=birthday_helper&date=2026-{month_num:02d}-{d:02d}">{d}</a>')
        blocks.append(f'<section class="bh-month"><h3>{month_name}</h3><div>{"".join(links)}</div></section>')
    return "".join(blocks)


def render_birthday_helper(experience: FlyerExperience) -> str:
    people = _find(experience.sections, "people")
    recipients = _find(experience.sections, "recipients")
    message = _find(experience.sections, "message")
    month = int(experience.data.get("month", 1))
    day = int(experience.data.get("day", 1))
    names = people.data.get("names", []) if people else []
    names_html = "".join(f'<li>{escape(str(name))}</li>' for name in names) or '<li>No birthday person listed.</li>'
    to_field = escape(str(recipients.data.get("to_field", "") if recipients else ""))
    message_text = escape(str(message.data.get("message", "") if message else ""))
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{escape(experience.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {{ --pink:#ffd9e6; --rose:#c73f6b; --cream:#fff9f0; --ink:#332126; --muted:#7d656c; --green:#277a55; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; color:var(--ink); font-family: ui-rounded, "Trebuchet MS", system-ui, sans-serif; background: radial-gradient(circle at 15% 10%, #fff, transparent 12rem), linear-gradient(135deg,var(--pink),var(--cream)); }}
.bh-page {{ width:min(1180px,calc(100vw - 28px)); margin:0 auto; padding:24px 0 44px; }}
.bh-header {{ display:grid; grid-template-columns:1fr auto; gap:1rem; align-items:end; padding:1.2rem; border-radius:28px; background:#fff; box-shadow:0 18px 44px rgba(130,50,80,.12); }}
.bh-kicker {{ color:var(--rose); font-weight:950; letter-spacing:.12em; text-transform:uppercase; font-size:.75rem; }}
h1 {{ margin:.25rem 0; font-size:clamp(2.8rem,7vw,5.8rem); line-height:.9; letter-spacing:-.06em; }}
.bh-date {{ font-size:1.1rem; color:var(--muted); font-weight:800; }}
.bh-status {{ padding:1rem; border-radius:24px; background:var(--rose); color:#fff; min-width:min(280px,100%); }}
.bh-status h2 {{ margin:.2rem 0; font-size:1.65rem; }}
.bh-grid {{ display:grid; grid-template-columns: minmax(0,.85fr) minmax(360px,1.15fr); gap:1rem; margin-top:1rem; }}
.bh-panel {{ background:#fff; border:1px solid rgba(199,63,107,.12); border-radius:26px; padding:1rem; box-shadow:0 12px 28px rgba(130,50,80,.08); }}
.bh-panel h2 {{ margin:.2rem 0 .7rem; }}
.bh-label {{ color:var(--rose); font-weight:950; letter-spacing:.1em; text-transform:uppercase; font-size:.72rem; }}
.bh-names {{ padding-left:1.2rem; font-size:1.1rem; line-height:1.6; }}
.bh-field {{ width:100%; min-height:5rem; resize:vertical; border:2px dashed rgba(199,63,107,.25); border-radius:18px; padding:.8rem; font:inherit; background:#fff9fc; color:var(--ink); }}
.bh-copy {{ border:0; border-radius:999px; padding:.7rem .9rem; background:var(--green); color:#fff; font-weight:950; margin-top:.6rem; cursor:pointer; }}
.bh-calendar {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:.65rem; }}
.bh-month {{ border-radius:18px; padding:.65rem; background:#fff8fb; border:1px solid rgba(199,63,107,.12); }}
.bh-month h3 {{ margin:0 0 .45rem; color:var(--rose); }}
.bh-month div {{ display:grid; grid-template-columns:repeat(7,1fr); gap:.18rem; }}
.bh-day {{ display:grid; place-items:center; aspect-ratio:1; border-radius:999px; text-decoration:none; color:var(--ink); font-weight:800; font-size:.78rem; }}
.bh-day:hover,.bh-day.is-active {{ background:var(--rose); color:#fff; }}
.bh-footer {{ margin-top:1rem; color:var(--muted); font-weight:800; }}
@media(max-width:840px) {{ .bh-header,.bh-grid {{ grid-template-columns:1fr; }} }}
</style>
</head>
<body>
<main class="bh-page">
<header class="bh-header"><div><div class="bh-kicker">Private helper</div><h1>{escape(experience.title)}</h1><p>{escape(experience.subtitle)}</p><div class="bh-date">{escape(experience.date_label)}</div></div><section class="bh-status"><div class="bh-label">{escape(experience.lead.label)}</div><h2>{escape(experience.lead.title)}</h2><p>{escape(experience.lead.body)}</p></section></header>
<section class="bh-grid">
<div class="bh-panel"><div class="bh-label">Birthday person</div><h2>{escape(people.title if people else "Nobody listed")}</h2><ul class="bh-names">{names_html}</ul><div class="bh-label">Recipients</div><textarea class="bh-field" id="bh-to">{to_field}</textarea><button class="bh-copy" data-copy="bh-to">Copy recipient list</button><div class="bh-label" style="margin-top:1rem">Message</div><textarea class="bh-field" id="bh-message">{message_text}</textarea><button class="bh-copy" data-copy="bh-message">Copy message</button></div>
<div class="bh-panel"><div class="bh-label">Pick a day</div><h2>Year-at-a-glance</h2><div class="bh-calendar">{_calendar(month, day)}</div></div>
</section>
<footer class="bh-footer">{escape(experience.footer)}</footer>
</main>
<script>document.querySelectorAll('[data-copy]').forEach(function(b){{b.addEventListener('click',function(){{var el=document.getElementById(b.dataset.copy);if(el){{el.select();document.execCommand('copy');b.textContent='Copied';}}}})}});</script>
</body>
</html>"""
