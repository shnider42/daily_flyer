from __future__ import annotations

from html import escape

from daily_flyer_v2.experience import FlyerExperience, FlyerItem


def _section(item: FlyerItem, index: int) -> str:
    return f"""
    <section class="yp-step">
        <div class="yp-node">{index}</div>
        <div class="yp-card">
            <div class="yp-label">{escape(item.label)}</div>
            <h2>{escape(item.title)}</h2>
            <p>{escape(item.body)}</p>
        </div>
    </section>
    """


def _action(item: FlyerItem) -> str:
    extra = ""
    if item.kind == "quest":
        extra = "".join(f'<button>{escape(str(option[0]))}</button>' for option in item.data.get("options", []))
    elif item.kind == "shuffle":
        extra = "".join(f'<button>{escape(str(word))}</button>' for word in item.data.get("words", []))
    return f"""
    <section class="yp-action">
        <div class="yp-label">{escape(item.label)}</div>
        <h3>{escape(item.title)}</h3>
        <p>{escape(item.body)}</p>
        <div class="yp-buttons">{extra}</div>
    </section>
    """


def render_passage_path(experience: FlyerExperience) -> str:
    chips = "".join(f'<span>{escape(str(chip))}</span>' for chip in experience.data.get("chips", []))
    sections = "\n".join(_section(item, index + 1) for index, item in enumerate(experience.sections))
    actions = "\n".join(_action(item) for item in experience.actions)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{escape(experience.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {{ --navy:#09275f; --teal:#00c99a; --aqua:#c9f1f1; --cream:#fffbed; --ink:#162033; --muted:#647084; --coral:#ff9f7c; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family: Inter, system-ui, sans-serif; color:var(--ink); background: radial-gradient(circle at 78% 12%, var(--aqua), transparent 20rem), linear-gradient(180deg,#f4fcfd,#fff 48%,#f8fbf5); }}
.yp-page {{ width:min(1120px,calc(100vw - 32px)); margin:0 auto; padding:28px 0 46px; }}
.yp-hero {{ display:grid; grid-template-columns: 1.1fr .9fr; gap:1.2rem; align-items:stretch; }}
.yp-title {{ padding:2rem; border-radius:34px; background:#fff; box-shadow:0 18px 48px rgba(9,39,95,.10); }}
.yp-kicker {{ color:var(--teal); font-weight:900; letter-spacing:.12em; text-transform:uppercase; font-size:.76rem; }}
h1 {{ color:var(--navy); font-size:clamp(3.3rem,8vw,6.8rem); line-height:.86; letter-spacing:-.075em; margin:.5rem 0; }}
.yp-title p {{ font-size:1.12rem; line-height:1.55; max-width:48rem; }}
.yp-date {{ font-weight:800; color:var(--muted); }}
.yp-focus {{ padding:2rem; border-radius:34px; background:var(--navy); color:white; display:flex; flex-direction:column; justify-content:space-between; min-height:320px; }}
.yp-focus h2 {{ font-size:clamp(2rem,4vw,3.8rem); line-height:.95; letter-spacing:-.055em; margin:.7rem 0; }}
.yp-focus p {{ line-height:1.55; color:#dbe9ff; }}
.yp-chips {{ display:flex; flex-wrap:wrap; gap:.45rem; margin-top:1rem; }}
.yp-chips span {{ background:rgba(0,201,154,.15); border:1px solid rgba(0,201,154,.24); color:var(--navy); border-radius:999px; padding:.45rem .65rem; font-size:.82rem; font-weight:800; }}
.yp-path {{ position:relative; margin:2rem 0; display:grid; gap:1rem; }}
.yp-path:before {{ content:""; position:absolute; left:1.35rem; top:0; bottom:0; width:4px; border-radius:999px; background:linear-gradient(var(--teal),var(--coral)); }}
.yp-step {{ position:relative; display:grid; grid-template-columns:3rem 1fr; gap:1rem; align-items:start; }}
.yp-node {{ width:2.7rem; height:2.7rem; border-radius:999px; display:grid; place-items:center; background:var(--teal); color:var(--navy); font-weight:950; z-index:1; box-shadow:0 8px 20px rgba(0,201,154,.25); }}
.yp-card {{ background:#fff; border:1px solid rgba(9,39,95,.09); border-radius:24px; padding:1.1rem 1.2rem; box-shadow:0 12px 28px rgba(9,39,95,.07); }}
.yp-card h2,.yp-action h3 {{ color:var(--navy); margin:.35rem 0; letter-spacing:-.035em; }}
.yp-card p,.yp-action p {{ line-height:1.58; color:#26324a; }}
.yp-label {{ font-weight:950; text-transform:uppercase; letter-spacing:.1em; font-size:.72rem; color:var(--teal); }}
.yp-actions {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:1rem; }}
.yp-action {{ background:var(--cream); border:1px solid rgba(9,39,95,.10); border-radius:26px; padding:1rem; box-shadow:0 12px 26px rgba(9,39,95,.07); }}
.yp-buttons {{ display:flex; flex-wrap:wrap; gap:.5rem; margin-top:.8rem; }}
.yp-buttons button {{ border:1px solid rgba(9,39,95,.12); border-radius:999px; background:#fff; color:var(--navy); padding:.55rem .75rem; font-weight:800; }}
.yp-footer {{ margin-top:1.3rem; color:var(--muted); font-weight:700; }}
@media(max-width:760px) {{ .yp-hero {{ grid-template-columns:1fr; }} .yp-title,.yp-focus {{ padding:1.35rem; }} }}
</style>
</head>
<body>
<main class="yp-page">
    <section class="yp-hero">
        <div class="yp-title"><div class="yp-kicker">Flyer Engine v2 path page</div><h1>{escape(experience.title)}</h1><p>{escape(experience.subtitle)}</p><div class="yp-date">{escape(experience.date_label)}</div><div class="yp-chips">{chips}</div></div>
        <div class="yp-focus"><div><div class="yp-label">{escape(experience.lead.label)}</div><h2>{escape(experience.lead.title)}</h2></div><p>{escape(experience.lead.body)}</p></div>
    </section>
    <section class="yp-path">{sections}</section>
    <section class="yp-actions">{actions}</section>
    <footer class="yp-footer">{escape(experience.footer)}</footer>
</main>
</body>
</html>"""
