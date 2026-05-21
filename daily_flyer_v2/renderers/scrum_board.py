from __future__ import annotations

from html import escape

from daily_flyer_v2.experience import FlyerExperience, FlyerItem


def _find(items: list[FlyerItem], kind: str) -> FlyerItem | None:
    for item in items:
        if item.kind == kind:
            return item
    return None


def render_scrum_board(experience: FlyerExperience) -> str:
    board = _find(experience.actions, "board")
    stories = board.data.get("stories", []) if board else []
    story_cards = "".join(
        f'<article class="sd-story" data-status="{escape(str(story.get("status", "ready")))}"><strong>{escape(str(story.get("id", "")))}</strong><span>{escape(str(story.get("title", "")))}</span><em>{escape(str(story.get("points", "?")))} pts</em><div><button>ready</button><button>doing</button><button>review</button><button>done</button></div></article>'
        for story in stories
    )
    sections = "".join(f'<section class="sd-note"><div>{escape(item.label)}</div><h3>{escape(item.title)}</h3><p>{escape(item.body)}</p></section>' for item in experience.sections)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{escape(experience.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {{ --bg:#0d1117; --panel:#161b22; --panel2:#21262d; --line:#30363d; --ink:#e6edf3; --muted:#8b949e; --blue:#58a6ff; --green:#3fb950; --orange:#d29922; --pink:#db61a2; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; color:var(--ink); background:linear-gradient(180deg,#070b10,var(--bg)); font-family:"Cascadia Mono", Consolas, monospace; }}
.sd-page {{ width:min(1240px,calc(100vw - 28px)); margin:0 auto; padding:22px 0 42px; }}
.sd-header {{ border:1px solid var(--line); border-radius:18px; padding:1rem; background:var(--panel); display:grid; grid-template-columns:1fr auto; gap:1rem; }}
.sd-kicker {{ color:var(--blue); font-weight:900; text-transform:uppercase; letter-spacing:.1em; font-size:.75rem; }}
h1 {{ margin:.25rem 0; font-size:clamp(2.4rem,6vw,5rem); line-height:.9; letter-spacing:-.06em; }}
.sd-goal {{ background:#0f1a24; border:1px solid rgba(88,166,255,.3); border-radius:16px; padding:1rem; min-width:min(340px,100%); }}
.sd-layout {{ display:grid; grid-template-columns: minmax(0,1.25fr) minmax(320px,.75fr); gap:1rem; margin-top:1rem; }}
.sd-board {{ display:grid; grid-template-columns:repeat(4,1fr); gap:.7rem; align-items:start; }}
.sd-col {{ min-height:420px; border:1px solid var(--line); border-radius:16px; background:rgba(22,27,34,.86); padding:.65rem; }}
.sd-col h2 {{ margin:.2rem 0 .7rem; color:var(--blue); font-size:.9rem; text-transform:uppercase; letter-spacing:.1em; }}
.sd-story {{ display:none; border:1px solid var(--line); border-radius:14px; padding:.7rem; margin:.55rem 0; background:var(--panel2); }}
.sd-story strong {{ color:var(--green); display:block; }} .sd-story span {{ display:block; margin:.3rem 0; line-height:1.35; }} .sd-story em {{ color:var(--orange); font-style:normal; font-size:.78rem; }}
.sd-story button {{ margin:.25rem .15rem 0 0; border:1px solid var(--line); border-radius:999px; background:#0d1117; color:var(--ink); padding:.32rem .45rem; font:inherit; font-size:.68rem; cursor:pointer; }}
.sd-col[data-col="ready"] .sd-story[data-status="ready"], .sd-col[data-col="doing"] .sd-story[data-status="doing"], .sd-col[data-col="review"] .sd-story[data-status="review"], .sd-col[data-col="done"] .sd-story[data-status="done"] {{ display:block; }}
.sd-side {{ display:grid; gap:.8rem; }} .sd-note,.sd-standup {{ border:1px solid var(--line); border-radius:16px; background:var(--panel); padding:1rem; }}
.sd-note div {{ color:var(--pink); font-weight:900; text-transform:uppercase; letter-spacing:.1em; font-size:.7rem; }} .sd-note h3 {{ margin:.3rem 0; }} .sd-note p {{ color:var(--muted); line-height:1.5; }}
.sd-standup textarea {{ width:100%; min-height:90px; margin:.35rem 0 .75rem; border:1px solid var(--line); border-radius:12px; background:#0d1117; color:var(--ink); padding:.65rem; font:inherit; }}
.sd-footer {{ margin-top:1rem; color:var(--muted); }}
@media(max-width:900px) {{ .sd-header,.sd-layout {{ grid-template-columns:1fr; }} .sd-board {{ grid-template-columns:1fr; }} .sd-col {{ min-height:auto; }} }}
</style>
</head>
<body>
<main class="sd-page">
<header class="sd-header"><div><div class="sd-kicker">Flyer Engine v2 working room</div><h1>{escape(experience.title)}</h1><p>{escape(experience.subtitle)}</p><strong>{escape(experience.date_label)}</strong></div><section class="sd-goal"><div class="sd-kicker">{escape(experience.lead.label)}</div><h2>{escape(experience.lead.title)}</h2><p>{escape(experience.lead.body)}</p></section></header>
<section class="sd-layout"><div class="sd-board"><section class="sd-col" data-col="ready"><h2>Ready</h2>{story_cards}</section><section class="sd-col" data-col="doing"><h2>Doing</h2>{story_cards}</section><section class="sd-col" data-col="review"><h2>Review</h2>{story_cards}</section><section class="sd-col" data-col="done"><h2>Done</h2>{story_cards}</section></div><aside class="sd-side">{sections}<section class="sd-standup"><div class="sd-kicker">Standup notes</div><label>Yesterday</label><textarea id="sd-y"></textarea><label>Today</label><textarea id="sd-t"></textarea><label>Blockers</label><textarea id="sd-b"></textarea></section></aside></section>
<footer class="sd-footer">{escape(experience.footer)}</footer>
</main>
<script>document.querySelectorAll('.sd-story button').forEach(function(b){{b.addEventListener('click',function(){{b.closest('.sd-story').dataset.status=b.textContent;}})}});['sd-y','sd-t','sd-b'].forEach(function(id){{var el=document.getElementById(id);if(el){{el.value=localStorage.getItem(id)||'';el.addEventListener('input',function(){{localStorage.setItem(id,el.value)}});}}}});</script>
</body>
</html>"""
