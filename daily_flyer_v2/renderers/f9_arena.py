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
    if not chips:
        return ""
    return '<div class="fa-chips">' + "".join(f"<span>{_e(chip)}</span>" for chip in chips) + "</div>"


def _roster_html(item: FlyerItem) -> str:
    roster_url = item.data.get("roster_url", "")
    attr = f' data-fa-roster-url="{_a(roster_url)}"' if roster_url else ""
    text = "Checking live roster…" if roster_url else "Live roster disabled until F9_TOURNEY_URL is set."
    return f'<div class="fa-roster"{attr}><span>Roster feed</span><strong>{_e(text)}</strong></div>'


def _queue_section(item: FlyerItem) -> str:
    return f"""
    <section class="fa-stage fa-stage--queue" id="queue">
        <div class="fa-terminal">
            <div class="fa-terminal-bar"><span></span><span></span><span></span><strong>queue://f9-2v2</strong></div>
            <div class="fa-label">{_e(item.label)}</div>
            <h2>{_e(item.title)}</h2>
            <p>{_e(item.body)}</p>
            {_chips(item)}
            <div class="fa-actions">
                {_button(item.url, "Open signup hub")}
                {_button(str(item.data.get("repo_url", "")), "Repo", True)}
            </div>
            {_roster_html(item)}
        </div>
        <aside class="fa-queue-side">
            <span class="fa-side-number">01</span>
            <strong>Queue desk</strong>
            <p>Not a normal flyer card: this section behaves like the tournament lobby entry point.</p>
        </aside>
    </section>
    """


def _watch_section(item: FlyerItem) -> str:
    return f"""
    <section class="fa-stage fa-stage--broadcast" id="watch">
        <div class="fa-broadcast-copy">
            <div class="fa-label">{_e(item.label)}</div>
            <h2>{_e(item.title)}</h2>
            <p>{_e(item.body)}</p>
            {_chips(item)}
            <div class="fa-actions">{_button(item.url, "Open RL Esports", True)}</div>
        </div>
        <div class="fa-broadcast-screen" aria-hidden="true">
            <div class="fa-screen-top">F9 WATCH DESK</div>
            <div class="fa-screen-pitch"><span></span><span></span><span></span></div>
            <div class="fa-ticker">RLCS prompt • replay review • panic clear tracking • boost routes</div>
        </div>
    </section>
    """


def _feature_section(item: FlyerItem, index: int) -> str:
    return f"""
    <section class="fa-feature fa-feature--{_a(item.kind)}" id="{_a(item.kind)}">
        <div class="fa-feature-index">{index:02d}</div>
        <div>
            <div class="fa-label">{_e(item.label)}</div>
            <h3>{_e(item.title)}</h3>
            <p>{_e(item.body)}</p>
            {_chips(item)}
        </div>
    </section>
    """


def _guess_pro_section(item: FlyerItem) -> str:
    clues = item.data.get("clues", [])
    first = clues[0] if clues else "No clue loaded."
    answer = f'{item.data.get("name", "")} — {item.data.get("role", "")}'
    return f"""
    <article class="fa-game fa-game--pro" data-fa-pro-clues="{_json(clues)}">
        <div class="fa-label">{_e(item.label)}</div>
        <h3>{_e(item.title)}</h3>
        <p>{_e(item.body)}</p>
        <div class="fa-clue">Clue 1: {_e(first)}</div>
        <div class="fa-actions">
            <button class="fa-btn" type="button" data-fa-action="next-clue">Next clue</button>
            <button class="fa-btn fa-btn--ghost" type="button" data-fa-action="reveal-pro">Reveal</button>
        </div>
        <div class="fa-answer" hidden>{_e(answer)}</div>
    </article>
    """


def _jiporady_section(item: FlyerItem) -> str:
    active = item.data.get("active_pack", {})
    packs = item.data.get("packs", [])
    return f"""
    <article class="fa-game fa-game--jiporady" data-fa-jiporady="{_json(packs)}">
        <div class="fa-label">{_e(item.label)}</div>
        <h3>{_e(item.title)}</h3>
        <p>{_e(item.body)}</p>
        <div class="fa-pack">
            <span>{_e(active.get("name"))}</span>
            <strong>{_e(active.get("sample_question"))}</strong>
            <em hidden>{_e(active.get("sample_answer"))}</em>
        </div>
        <div class="fa-actions">
            <button class="fa-btn" type="button" data-fa-action="next-pack">Switch pack</button>
            <button class="fa-btn fa-btn--ghost" type="button" data-fa-action="reveal-pack">Reveal answer</button>
            {_button(item.url, "Source", True)}
        </div>
    </article>
    """


def render_f9_arena(experience: FlyerExperience) -> str:
    lead = experience.lead
    sections = {item.kind: item for item in experience.sections}
    tournament = sections.get("tournament")
    watch = sections.get("watch")
    features = [item for item in experience.sections if item.kind not in {"tournament", "watch"}]
    guess = _find(experience.actions, "guess_pro")
    jiporady = _find(experience.actions, "jiporady")

    logo_url = str(experience.data.get("logo_url", "") or "")
    stadium_url = str(experience.data.get("stadium_url", "") or "")
    lanes = experience.data.get("lanes", [])

    lane_html = "".join(
        f'<a href="#{_a(str(lane.get("label", "")).lower())}"><span>{_e(lane.get("label"))}</span><strong>{_e(lane.get("value"))}</strong></a>'
        for lane in lanes
    )
    feature_html = "".join(_feature_section(item, index + 2) for index, item in enumerate(features))
    games_html = "".join(
        html for html in [
            _guess_pro_section(guess) if guess else "",
            _jiporady_section(jiporady) if jiporady else "",
        ]
    )

    css = """
    :root {
        --bg:#05070c; --ink:#fff8ee; --muted:#c6d0dc; --faint:#8492a6;
        --line:rgba(255,255,255,.14); --glass:rgba(8,13,23,.72);
        --orange:#ff8a3d; --orange2:#e15b3e; --blue:#59e0ff; --blue2:#2678ff;
        --green:#7dff9b; --gold:#e1b53e; --boost:0%;
    }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; background:var(--bg); }
    body { margin:0; color:var(--ink); background:radial-gradient(circle at 15% 8%,rgba(255,138,61,.22),transparent 24rem),radial-gradient(circle at 88% 12%,rgba(89,224,255,.16),transparent 24rem),linear-gradient(180deg,#081018,#05070c); font-family:Inter,system-ui,sans-serif; overflow-x:hidden; }
    a { color:inherit; }
    .fa-page { position:relative; isolation:isolate; width:min(1320px,calc(100vw - 24px)); margin:0 auto; padding:18px 0 48px; min-height:100vh; }
    .fa-page:before { content:""; position:fixed; inset:-4%; z-index:-3; background:linear-gradient(180deg,rgba(5,7,12,.46),rgba(5,7,12,.94)),var(--stadium) center/cover no-repeat; filter:saturate(1.12) brightness(.52); transform:scale(1.03); }
    .fa-page:after { content:""; position:fixed; inset:0; z-index:-2; pointer-events:none; opacity:.28; background:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px); background-size:44px 44px; mask-image:linear-gradient(180deg,transparent,#000 12%,#000 82%,transparent); transform:perspective(900px) rotateX(62deg) translateY(24%); transform-origin:center bottom; }
    .fa-corner-mark { position:fixed; top:14px; left:14px; z-index:8; display:flex; gap:.7rem; align-items:center; max-width:min(420px,calc(100vw - 150px)); padding:.58rem .72rem; border:1px solid var(--line); border-radius:999px; background:rgba(5,7,12,.66); backdrop-filter:blur(16px); box-shadow:0 14px 44px rgba(0,0,0,.28); text-decoration:none; }
    .fa-corner-mark img { width:32px; height:auto; filter:drop-shadow(0 8px 18px rgba(0,0,0,.55)); }
    .fa-corner-mark span { display:block; font-family:Rajdhani,Inter,sans-serif; text-transform:uppercase; letter-spacing:.16em; color:var(--green); font-weight:800; font-size:.72rem; }
    .fa-corner-mark strong { display:block; font-size:.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .fa-boost-meter { position:fixed; top:14px; right:14px; z-index:9; width:116px; aspect-ratio:1; display:grid; place-items:center; border-radius:999px; border:1px solid rgba(255,255,255,.16); background:radial-gradient(circle at center,rgba(5,7,12,.96) 0 54%,transparent 55%),conic-gradient(var(--orange) 0 var(--boost), rgba(255,255,255,.12) var(--boost) 100%); box-shadow:0 0 54px rgba(255,138,61,.24), inset 0 0 34px rgba(255,255,255,.04); backdrop-filter:blur(12px); }
    .fa-boost-meter strong { display:block; font-family:Rajdhani,Inter,sans-serif; font-size:2.25rem; line-height:.82; text-align:center; }
    .fa-boost-meter span { display:block; margin-top:.16rem; color:var(--orange); font-size:.62rem; font-weight:900; letter-spacing:.16em; text-align:center; }
    .fa-hero { min-height:92vh; display:grid; grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr); gap:clamp(18px,5vw,70px); align-items:center; padding:96px 0 42px; }
    .fa-label { font-family:Rajdhani,Inter,sans-serif; letter-spacing:.16em; text-transform:uppercase; color:var(--green); font-weight:800; font-size:.76rem; }
    .fa-title h1 { max-width:10.5ch; margin:.8rem 0 0; font-family:Rajdhani,Inter,sans-serif; font-size:clamp(4rem,9vw,9.4rem); line-height:.78; letter-spacing:-.075em; text-shadow:0 0 40px rgba(255,138,61,.22); }
    .fa-title p { max-width:62ch; margin:1.2rem 0 0; color:var(--muted); line-height:1.7; font-size:1.08rem; }
    .fa-actions,.fa-chips { display:flex; flex-wrap:wrap; gap:.65rem; align-items:center; margin-top:1rem; }
    .fa-btn { display:inline-flex; align-items:center; justify-content:center; min-height:42px; padding:0 .95rem; border-radius:999px; border:1px solid rgba(255,138,61,.38); background:linear-gradient(135deg,var(--orange),var(--orange2)); color:#130f0a; font:inherit; font-weight:850; text-decoration:none; cursor:pointer; margin:.35rem .35rem 0 0; }
    .fa-btn--ghost { color:var(--ink); background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.14); }
    .fa-lane-nav { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .fa-lane-nav a { min-height:126px; padding:1rem; border:1px solid var(--line); border-radius:26px; background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.025)),rgba(8,13,23,.70); text-decoration:none; box-shadow:0 18px 52px rgba(0,0,0,.26); backdrop-filter:blur(14px); transform:skewY(-1.2deg); }
    .fa-lane-nav a > * { transform:skewY(1.2deg); }
    .fa-lane-nav span { display:block; color:var(--green); font-family:Rajdhani,Inter,sans-serif; letter-spacing:.16em; text-transform:uppercase; font-weight:800; font-size:.72rem; }
    .fa-lane-nav strong { display:block; margin-top:.5rem; font-family:Rajdhani,Inter,sans-serif; font-size:1.8rem; line-height:.95; }
    .fa-track { display:grid; gap:clamp(20px,4vw,42px); }
    .fa-stage { min-height:58vh; border:1px solid var(--line); overflow:hidden; position:relative; background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.022)),var(--glass); box-shadow:0 24px 72px rgba(0,0,0,.34); backdrop-filter:blur(14px); }
    .fa-stage--queue { display:grid; grid-template-columns:minmax(0,1fr) minmax(240px,.34fr); gap:0; border-radius:34px; }
    .fa-terminal { padding:clamp(22px,4vw,44px); background:radial-gradient(circle at top right,rgba(255,138,61,.18),transparent 32%); }
    .fa-terminal-bar { display:flex; align-items:center; gap:.45rem; padding:.65rem .75rem; border:1px solid rgba(255,255,255,.10); border-radius:16px; background:rgba(0,0,0,.28); color:var(--faint); font-family:ui-monospace,Menlo,Consolas,monospace; font-size:.78rem; margin-bottom:1.35rem; }
    .fa-terminal-bar span { width:.7rem; aspect-ratio:1; border-radius:999px; background:var(--orange); }
    .fa-terminal-bar span:nth-child(2) { background:var(--gold); } .fa-terminal-bar span:nth-child(3) { background:var(--green); }
    .fa-stage h2,.fa-feature h3,.fa-game h3 { margin:.45rem 0 0; font-family:Rajdhani,Inter,sans-serif; line-height:.92; letter-spacing:-.045em; }
    .fa-stage h2 { font-size:clamp(2.7rem,6vw,6.2rem); }
    .fa-stage p,.fa-feature p,.fa-game p { color:var(--muted); line-height:1.68; }
    .fa-queue-side { display:flex; flex-direction:column; justify-content:space-between; padding:1.25rem; background:linear-gradient(180deg,rgba(255,138,61,.18),rgba(255,255,255,.04)); border-left:1px solid rgba(255,255,255,.11); }
    .fa-side-number { font-family:Rajdhani,Inter,sans-serif; font-size:5rem; line-height:.8; color:rgba(255,255,255,.20); }
    .fa-roster,.fa-clue,.fa-pack,.fa-answer { margin-top:1rem; padding:.9rem 1rem; border-radius:18px; background:rgba(255,255,255,.055); border:1px solid rgba(255,255,255,.10); }
    .fa-roster span { display:block; color:var(--green); font-family:Rajdhani,Inter,sans-serif; letter-spacing:.16em; text-transform:uppercase; font-weight:800; font-size:.72rem; }
    .fa-stage--broadcast { display:grid; grid-template-columns:.82fr 1.18fr; align-items:center; gap:clamp(18px,4vw,46px); padding:clamp(22px,4vw,44px); border-radius:46px 18px 46px 18px; }
    .fa-broadcast-screen { min-height:360px; border:1px solid rgba(89,224,255,.26); border-radius:28px; background:linear-gradient(180deg,rgba(89,224,255,.12),rgba(0,0,0,.26)); overflow:hidden; box-shadow:inset 0 0 40px rgba(89,224,255,.10); }
    .fa-screen-top,.fa-ticker { padding:.8rem 1rem; font-family:ui-monospace,Menlo,Consolas,monospace; color:var(--green); background:rgba(0,0,0,.28); }
    .fa-screen-pitch { height:260px; display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:linear-gradient(90deg,rgba(255,255,255,.10) 1px,transparent 1px),radial-gradient(circle at center,transparent 0 52px,rgba(255,255,255,.16) 53px 55px,transparent 56px); background-size:50% 100%,100% 100%; }
    .fa-screen-pitch span { border:1px solid rgba(255,255,255,.09); }
    .fa-feature-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }
    .fa-feature { min-height:300px; display:flex; flex-direction:column; justify-content:space-between; padding:1.1rem; border:1px solid var(--line); box-shadow:0 18px 52px rgba(0,0,0,.26); background:rgba(8,13,23,.75); backdrop-filter:blur(14px); overflow:hidden; }
    .fa-feature-index { font-family:Rajdhani,Inter,sans-serif; font-size:3.8rem; line-height:.8; color:rgba(255,255,255,.18); }
    .fa-feature--garage { border-radius:28px 28px 8px 28px; background:linear-gradient(180deg,rgba(255,138,61,.14),rgba(8,13,23,.75)); }
    .fa-feature--arena { border-radius:8px 32px 32px 32px; background:linear-gradient(180deg,rgba(89,224,255,.13),rgba(8,13,23,.75)); }
    .fa-feature--warmup { border-radius:32px 8px 32px 32px; background:linear-gradient(180deg,rgba(125,255,155,.12),rgba(8,13,23,.75)); }
    .fa-feature--house_rule { border-radius:32px 32px 32px 8px; background:linear-gradient(180deg,rgba(225,181,62,.12),rgba(8,13,23,.75)); }
    .fa-feature h3 { font-size:2rem; }
    .fa-chips span { display:inline-flex; min-height:28px; align-items:center; padding:0 .65rem; border-radius:999px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.11); font-size:.74rem; font-weight:800; }
    .fa-games { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    .fa-game { min-height:340px; padding:1.2rem; border:1px solid var(--line); border-radius:30px; background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.025)),rgba(8,13,23,.82); box-shadow:0 18px 52px rgba(0,0,0,.26); }
    .fa-game--pro { border-color:rgba(225,181,62,.28); } .fa-game--jiporady { border-color:rgba(89,224,255,.24); }
    .fa-pack { display:grid; gap:.5rem; } .fa-pack span { color:var(--green); font-weight:850; } .fa-pack em { font-style:normal; }
    .fa-footer { margin-top:24px; text-align:center; color:var(--faint); font-weight:750; }
    @media(max-width:960px){ .fa-corner-mark { max-width:calc(100vw - 128px); } .fa-hero,.fa-stage--queue,.fa-stage--broadcast,.fa-games { grid-template-columns:1fr; } .fa-hero { min-height:auto; padding-top:110px; } .fa-feature-grid { grid-template-columns:repeat(2,1fr); } .fa-queue-side { border-left:0; border-top:1px solid rgba(255,255,255,.11); } }
    @media(max-width:640px){ .fa-page { width:calc(100vw - 16px); } .fa-boost-meter { width:92px; } .fa-boost-meter strong { font-size:1.85rem; } .fa-corner-mark strong { display:none; } .fa-lane-nav,.fa-feature-grid { grid-template-columns:1fr; } .fa-title h1 { font-size:clamp(3.3rem,20vw,5.4rem); } }
    """

    js = """
    (function () {
        var boostMeter = document.querySelector("[data-fa-boost-meter]");
        var boostValue = document.querySelector("[data-fa-boost-value]");
        var ticking = false;
        function setBoost() { var doc = document.documentElement; var max = Math.max(1, doc.scrollHeight - window.innerHeight); var pct = Math.max(0, Math.min(100, Math.round((window.scrollY / max) * 100))); doc.style.setProperty("--boost", pct + "%"); if (boostValue) boostValue.textContent = String(pct); if (boostMeter) boostMeter.setAttribute("aria-valuenow", String(pct)); ticking = false; }
        function requestBoostUpdate() { if (!ticking) { window.requestAnimationFrame(setBoost); ticking = true; } }
        window.addEventListener("scroll", requestBoostUpdate, { passive: true }); window.addEventListener("resize", requestBoostUpdate); setBoost();
        document.querySelectorAll("[data-fa-roster-url]").forEach(function(root){ var u = root.getAttribute("data-fa-roster-url"); if (!u) return; fetch(u,{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(p){ if(!p) return; var e = Array.isArray(p.entries) ? p.entries : []; root.innerHTML = "<span>Roster feed</span><strong>" + e.length + " registered • signups " + (p.signups_open ? "open" : "closed") + "</strong>"; }).catch(function(){ root.innerHTML = "<span>Roster feed</span><strong>Roster feed unavailable.</strong>"; }); });
        document.querySelectorAll("[data-fa-pro-clues]").forEach(function(root){ var clues = []; try { clues = JSON.parse(root.getAttribute("data-fa-pro-clues") || "[]"); } catch(e) {} var i = 0; var clue = root.querySelector(".fa-clue"); var ans = root.querySelector(".fa-answer"); var next = root.querySelector("[data-fa-action='next-clue']"); var reveal = root.querySelector("[data-fa-action='reveal-pro']"); if (next) next.addEventListener("click", function(){ i = Math.min(i + 1, Math.max(clues.length - 1, 0)); if (clue) clue.textContent = "Clue " + (i + 1) + ": " + (clues[i] || ""); }); if (reveal) reveal.addEventListener("click", function(){ if (ans) ans.hidden = false; }); });
        document.querySelectorAll("[data-fa-jiporady]").forEach(function(root){ var packs = []; try { packs = JSON.parse(root.getAttribute("data-fa-jiporady") || "[]"); } catch(e) {} if (!packs.length) return; var i = 0; var n = root.querySelector(".fa-pack span"); var q = root.querySelector(".fa-pack strong"); var a = root.querySelector(".fa-pack em"); function render(){ var p = packs[i % packs.length] || {}; if (n) n.textContent = p.name || ""; if (q) q.textContent = p.sample_question || ""; if (a) { a.textContent = p.sample_answer || ""; a.hidden = true; } } var next = root.querySelector("[data-fa-action='next-pack']"); var reveal = root.querySelector("[data-fa-action='reveal-pack']"); if (next) next.addEventListener("click", function(){ i = (i + 1) % packs.length; render(); }); if (reveal) reveal.addEventListener("click", function(){ if (a) a.hidden = false; }); });
    })();
    """

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>{_e(experience.title)}</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet"><style>{css}</style></head>
<body>
<main class="fa-page" style="--stadium:url('{_a(stadium_url)}')">
    <a class="fa-corner-mark" href="#top" aria-label="Back to top"><img src="{_a(logo_url)}" alt="F9 logo"><span>F9 Daily</span><strong>{_e(experience.date_label)}</strong></a>
    <div class="fa-boost-meter" data-fa-boost-meter role="meter" aria-label="Scroll boost" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div><strong data-fa-boost-value>0</strong><span>BOOST</span></div></div>
    <section class="fa-hero" id="top"><div class="fa-title"><div class="fa-label">{_e(lead.label)}</div><h1>{_e(lead.title)}</h1><p>{_e(lead.body)}</p><div class="fa-actions">{_button(str(experience.data.get("tournament_url", "")), "Signup hub")}{_button(str(experience.data.get("rl_esports_news_url", "")), "RLCS news", True)}{_button(str(experience.data.get("jiporady_repo_url", "")), "Jiporady source", True)}</div></div><nav class="fa-lane-nav" aria-label="F9 Daily sections">{lane_html}</nav></section>
    <div class="fa-track">{_queue_section(tournament) if tournament else ""}{_watch_section(watch) if watch else ""}<section class="fa-feature-grid">{feature_html}</section><section class="fa-games">{games_html}</section></div>
    <footer class="fa-footer">{_e(experience.footer)}</footer>
</main><script>{js}</script></body></html>"""
