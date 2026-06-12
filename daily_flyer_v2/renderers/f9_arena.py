from __future__ import annotations

import json
from html import escape

from daily_flyer_v2.experience import FlyerExperience, FlyerItem


def _e(value) -> str:
    return escape(str(value or ""))


def _a(value) -> str:
    return escape(str(value or ""), quote=True)


def _json(value) -> str:
    return escape(json.dumps(value, ensure_ascii=False), quote=True)


def _find(items: list[FlyerItem], kind: str) -> FlyerItem | None:
    for item in items:
        if item.kind == kind:
            return item
    return None


def _button(url: str | None, label: str, ghost: bool = False) -> str:
    if not url:
        return ""
    klass = "fa-btn fa-btn--ghost" if ghost else "fa-btn"
    return f'<a class="{klass}" href="{_a(url)}" target="_blank" rel="noopener noreferrer">{_e(label)}</a>'


def _chips(item: FlyerItem) -> str:
    chips = item.data.get("chips", [])
    return "".join(f'<span>{_e(chip)}</span>' for chip in chips)


def _panel(item: FlyerItem, extra: str = "") -> str:
    return f"""
    <article class="fa-panel fa-panel--{_a(item.kind)}">
        <div class="fa-label">{_e(item.label)}</div>
        <h3>{_e(item.title)}</h3>
        <p>{_e(item.body)}</p>
        <div class="fa-chips">{_chips(item)}</div>
        {extra}
    </article>
    """


def render_f9_arena(experience: FlyerExperience) -> str:
    lead = experience.lead
    sections = {item.kind: item for item in experience.sections}
    tournament = sections.get("tournament")
    watch = sections.get("watch")
    feature_items = [item for item in experience.sections if item.kind not in {"tournament", "watch"}]
    guess = _find(experience.actions, "guess_pro")
    jiporady = _find(experience.actions, "jiporady")

    logo_url = str(experience.data.get("logo_url", "") or "")
    stadium_url = str(experience.data.get("stadium_url", "") or "")
    boost = int(lead.data.get("boost", 66))
    lanes = experience.data.get("lanes", [])

    lane_html = "".join(f'<div><span>{_e(lane.get("label"))}</span><strong>{_e(lane.get("value"))}</strong></div>' for lane in lanes)
    features_html = "".join(_panel(item) for item in feature_items)

    roster = ""
    if tournament:
        roster_url = tournament.data.get("roster_url", "")
        attr = f' data-fa-roster-url="{_a(roster_url)}"' if roster_url else ""
        roster = f'<div class="fa-roster"{attr}><span>Roster</span><strong>{"Checking live roster…" if roster_url else "Live roster disabled until F9_TOURNEY_URL is set."}</strong></div>'

    guess_html = ""
    if guess:
        clues = guess.data.get("clues", [])
        answer = f'{guess.data.get("name", "")} — {guess.data.get("role", "")}'
        first = clues[0] if clues else "No clue loaded."
        guess_html = f"""
        <article class="fa-game" data-fa-pro-clues="{_json(clues)}">
            <div class="fa-label">{_e(guess.label)}</div>
            <h3>{_e(guess.title)}</h3>
            <p>{_e(guess.body)}</p>
            <div class="fa-clue">Clue 1: {_e(first)}</div>
            <button class="fa-btn" type="button" data-fa-action="next-clue">Next clue</button>
            <button class="fa-btn fa-btn--ghost" type="button" data-fa-action="reveal-pro">Reveal</button>
            <div class="fa-answer" hidden>{_e(answer)}</div>
        </article>
        """

    jiporady_html = ""
    if jiporady:
        active = jiporady.data.get("active_pack", {})
        packs = jiporady.data.get("packs", [])
        jiporady_html = f"""
        <article class="fa-game" data-fa-jiporady="{_json(packs)}">
            <div class="fa-label">{_e(jiporady.label)}</div>
            <h3>{_e(jiporady.title)}</h3>
            <p>{_e(jiporady.body)}</p>
            <div class="fa-pack"><span>{_e(active.get("name"))}</span><strong>{_e(active.get("sample_question"))}</strong><em hidden>{_e(active.get("sample_answer"))}</em></div>
            <button class="fa-btn" type="button" data-fa-action="next-pack">Switch pack</button>
            <button class="fa-btn fa-btn--ghost" type="button" data-fa-action="reveal-pack">Reveal answer</button>
            {_button(jiporady.url, "Source", True)}
        </article>
        """

    css = """
    :root { --bg:#05070c; --ink:#fff8ee; --muted:#c6d0dc; --faint:#8492a6; --panel:rgba(8,13,23,.78); --line:rgba(255,255,255,.14); --orange:#ff8a3d; --orange2:#e15b3e; --blue:#59e0ff; --green:#7dff9b; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:radial-gradient(circle at 15% 10%,rgba(255,138,61,.22),transparent 24rem),radial-gradient(circle at 85% 10%,rgba(89,224,255,.16),transparent 24rem),linear-gradient(180deg,#081018,#05070c); font-family:Inter,system-ui,sans-serif; }
    a { color:inherit; }
    .fa-page { position:relative; isolation:isolate; width:min(1320px,calc(100vw - 24px)); margin:0 auto; padding:16px 0 38px; min-height:100vh; }
    .fa-page:before { content:""; position:fixed; inset:-4%; z-index:-2; background:linear-gradient(180deg,rgba(5,7,12,.45),rgba(5,7,12,.92)),var(--stadium) center/cover no-repeat; filter:saturate(1.1) brightness(.52); transform:scale(1.03); }
    .fa-scoreboard { position:sticky; top:12px; z-index:5; display:grid; grid-template-columns:1fr minmax(220px,340px) 1fr; border:1px solid var(--line); border-radius:24px; overflow:hidden; background:rgba(5,7,12,.78); backdrop-filter:blur(18px); box-shadow:0 16px 52px rgba(0,0,0,.38); }
    .fa-team,.fa-clock { min-height:82px; display:grid; place-items:center; text-align:center; font-family:Rajdhani,Inter,sans-serif; text-transform:uppercase; }
    .fa-team span,.fa-date,.fa-label,.fa-lanes span { letter-spacing:.16em; text-transform:uppercase; font-weight:800; color:var(--faint); font-size:.76rem; }
    .fa-team strong { display:block; font-size:clamp(2rem,4vw,3.5rem); line-height:.85; letter-spacing:-.04em; }
    .fa-team:first-child { background:linear-gradient(90deg,rgba(255,138,61,.28),transparent); } .fa-team:last-child { background:linear-gradient(270deg,rgba(38,120,255,.26),transparent); }
    .fa-clock { border-inline:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.035); } .fa-clock img { width:62px; filter:drop-shadow(0 12px 24px rgba(0,0,0,.65)); } .fa-time { color:var(--green); font-size:clamp(2.4rem,5vw,4.4rem); line-height:.78; font-weight:900; }
    .fa-hero { display:grid; grid-template-columns:minmax(0,1.12fr) minmax(320px,.88fr); gap:clamp(16px,4vw,54px); align-items:end; min-height:min(650px,calc(100vh - 118px)); padding:clamp(26px,6vw,76px) 0; }
    .fa-copy,.fa-console,.fa-panel,.fa-game,.fa-lanes div { border:1px solid var(--line); background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.025)),var(--panel); box-shadow:0 20px 62px rgba(0,0,0,.28); backdrop-filter:blur(14px); }
    .fa-copy { padding:clamp(24px,4vw,46px); border-radius:34px; background:linear-gradient(145deg,rgba(255,138,61,.18),rgba(38,120,255,.08)),var(--panel); }
    h1 { max-width:10.5ch; margin:.72rem 0 0; font-family:Rajdhani,Inter,sans-serif; font-size:clamp(3.8rem,8vw,8.2rem); line-height:.82; letter-spacing:-.07em; }
    .fa-copy p,.fa-panel p,.fa-game p { color:var(--muted); line-height:1.68; }
    .fa-actions,.fa-chips { display:flex; flex-wrap:wrap; gap:.65rem; align-items:center; margin-top:1rem; }
    .fa-btn { display:inline-flex; align-items:center; justify-content:center; min-height:42px; padding:0 .9rem; border-radius:999px; border:1px solid rgba(255,138,61,.38); background:linear-gradient(135deg,var(--orange),var(--orange2)); color:#130f0a; font:inherit; font-weight:850; text-decoration:none; cursor:pointer; margin:.35rem .35rem 0 0; }
    .fa-btn--ghost { color:var(--ink); background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.14); }
    .fa-console { display:grid; gap:14px; padding:1rem; border-radius:28px; }
    .fa-boost { --boost:66%; width:min(300px,70vw); aspect-ratio:1; margin:auto; display:grid; place-items:center; border-radius:999px; background:radial-gradient(circle,rgba(5,7,12,.98) 0 52%,transparent 53%),conic-gradient(var(--orange) 0 var(--boost),rgba(255,255,255,.12) var(--boost) 100%); }
    .fa-boost strong { display:block; font-family:Rajdhani,Inter,sans-serif; font-size:clamp(4rem,11vw,8rem); line-height:.8; } .fa-boost span { color:var(--orange); font-weight:900; letter-spacing:.18em; }
    .fa-hud { border:1px solid var(--line); border-radius:18px; padding:.9rem; background:rgba(255,255,255,.045); } .fa-hud span { display:block; color:var(--green); font-weight:850; text-transform:uppercase; letter-spacing:.12em; font-size:.72rem; } .fa-hud strong { font-family:Rajdhani,Inter,sans-serif; font-size:1.45rem; }
    .fa-lanes,.fa-primary,.fa-games { display:grid; gap:16px; margin-top:18px; } .fa-lanes { grid-template-columns:repeat(4,1fr); } .fa-primary,.fa-games { grid-template-columns:1fr 1fr; } .fa-wall { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:18px; }
    .fa-lanes div,.fa-panel,.fa-game { border-radius:24px; padding:1rem; } .fa-lanes div { min-height:105px; } .fa-lanes strong { display:block; margin-top:.45rem; font-family:Rajdhani,Inter,sans-serif; font-size:1.42rem; }
    .fa-panel h3,.fa-game h3 { margin:.45rem 0 0; font-family:Rajdhani,Inter,sans-serif; font-size:clamp(1.8rem,3vw,3rem); line-height:.96; letter-spacing:-.04em; }
    .fa-chips span { display:inline-flex; min-height:28px; align-items:center; padding:0 .65rem; border-radius:999px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.11); font-size:.74rem; font-weight:800; }
    .fa-roster,.fa-clue,.fa-pack,.fa-answer { margin-top:1rem; padding:.85rem 1rem; border-radius:18px; background:rgba(255,255,255,.055); border:1px solid rgba(255,255,255,.10); } .fa-pack { display:grid; gap:.5rem; } .fa-pack em { font-style:normal; }
    .fa-footer { margin-top:22px; text-align:center; color:var(--faint); font-weight:750; }
    @media(max-width:960px){ .fa-scoreboard,.fa-hero,.fa-primary,.fa-games{grid-template-columns:1fr}.fa-team{display:none}.fa-lanes,.fa-wall{grid-template-columns:repeat(2,1fr)}.fa-hero{min-height:auto}.fa-scoreboard{position:relative;top:0} }
    @media(max-width:620px){ .fa-page{width:calc(100vw - 16px)} h1{font-size:clamp(3.2rem,19vw,5rem)} .fa-lanes,.fa-wall{grid-template-columns:1fr} }
    """

    js = """
    document.querySelectorAll('[data-fa-roster-url]').forEach(function(root){var u=root.getAttribute('data-fa-roster-url');if(!u)return;fetch(u,{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(p){if(!p)return;var e=Array.isArray(p.entries)?p.entries:[];root.innerHTML='<span>Roster</span><strong>'+e.length+' registered • signups '+(p.signups_open?'open':'closed')+'</strong>';}).catch(function(){root.innerHTML='<span>Roster</span><strong>Roster feed unavailable.</strong>';});});
    document.querySelectorAll('[data-fa-pro-clues]').forEach(function(root){var clues=[];try{clues=JSON.parse(root.getAttribute('data-fa-pro-clues')||'[]')}catch(e){}var i=0,clue=root.querySelector('.fa-clue'),ans=root.querySelector('.fa-answer');root.querySelector('[data-fa-action="next-clue"]')?.addEventListener('click',function(){i=Math.min(i+1,Math.max(clues.length-1,0));if(clue)clue.textContent='Clue '+(i+1)+': '+(clues[i]||'');});root.querySelector('[data-fa-action="reveal-pro"]')?.addEventListener('click',function(){if(ans)ans.hidden=false;});});
    document.querySelectorAll('[data-fa-jiporady]').forEach(function(root){var packs=[];try{packs=JSON.parse(root.getAttribute('data-fa-jiporady')||'[]')}catch(e){}if(!packs.length)return;var i=0,n=root.querySelector('.fa-pack span'),q=root.querySelector('.fa-pack strong'),a=root.querySelector('.fa-pack em');function render(){var p=packs[i%packs.length]||{};if(n)n.textContent=p.name||'';if(q)q.textContent=p.sample_question||'';if(a){a.textContent=p.sample_answer||'';a.hidden=true;}}root.querySelector('[data-fa-action="next-pack"]')?.addEventListener('click',function(){i=(i+1)%packs.length;render();});root.querySelector('[data-fa-action="reveal-pack"]')?.addEventListener('click',function(){if(a)a.hidden=false;});});
    """

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>{_e(experience.title)}</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet"><style>{css}</style></head>
<body>
<main class="fa-page" style="--stadium:url('{_a(stadium_url)}')">
<header class="fa-scoreboard"><section class="fa-team"><div><span>Orange</span><strong>F9</strong></div></section><section class="fa-clock"><div><img src="{_a(logo_url)}" alt="F9 logo"><div class="fa-time">5:00</div><div class="fa-date">{_e(experience.date_label)}</div></div></section><section class="fa-team"><div><span>Blue</span><strong>Daily</strong></div></section></header>
<section class="fa-hero"><div class="fa-copy"><div class="fa-label">{_e(lead.label)}</div><h1>{_e(lead.title)}</h1><p>{_e(lead.body)}</p><div class="fa-actions">{_button(str(experience.data.get('tournament_url','')), 'Signup hub')}{_button(str(experience.data.get('rl_esports_news_url','')), 'RLCS news', True)}{_button(str(experience.data.get('jiporady_repo_url','')), 'Jiporady source', True)}</div></div><aside class="fa-console"><div class="fa-boost" style="--boost:{boost}%"><div><strong>{boost}</strong><span>BOOST</span></div></div><div class="fa-hud"><span>Kickoff call</span><strong>{_e(lead.data.get('kickoff_call'))}</strong></div><div class="fa-hud"><span>Playlist</span><strong>{_e(lead.data.get('playlist'))}</strong></div></aside></section>
<section class="fa-lanes">{lane_html}</section>
<section class="fa-primary">{_panel(tournament, roster) if tournament else ''}{_panel(watch, _button(watch.url, 'Open RL Esports', True)) if watch else ''}</section>
<section class="fa-wall">{features_html}</section>
<section class="fa-games">{guess_html}{jiporady_html}</section>
<footer class="fa-footer">{_e(experience.footer)}</footer>
</main><script>{js}</script></body></html>"""
