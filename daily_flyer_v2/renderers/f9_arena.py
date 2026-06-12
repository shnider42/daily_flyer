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


def _menu_row(label: str, href: str = "#", active: bool = False, badge: str = "") -> str:
    klass = "fa-menu-row is-active" if active else "fa-menu-row"
    badge_html = f'<em>{_e(badge)}</em>' if badge else ""
    return f'<a class="{klass}" href="{_a(href)}"><span>{_e(label)}</span>{badge_html}</a>'


def _roster_html(item: FlyerItem) -> str:
    roster_url = item.data.get("roster_url", "")
    attr = f' data-fa-roster-url="{_a(roster_url)}"' if roster_url else ""
    text = "Checking live roster…" if roster_url else "Live roster disabled until F9_TOURNEY_URL is set."
    return f'<div class="fa-roster"{attr}><span>Roster feed</span><strong>{_e(text)}</strong></div>'


def _queue_section(item: FlyerItem) -> str:
    return f"""
    <section class="fa-stage fa-stage--queue" id="queue">
        <aside class="fa-section-menu" aria-label="F9 queue menu">
            {_menu_row("PLAY ONLINE", "#queue", True, "A")}
            {_menu_row("PLAY LOCAL", "#queue")}
            {_menu_row("PRIVATE MATCH", "#queue")}
            {_menu_row("TOURNAMENTS", "#queue")}
            {_menu_row("CREATE CLUB", "#queue")}
        </aside>
        <div class="fa-menu-detail">
            <div class="fa-detail-topline"><span>QUEUE DESK</span><strong>F9 2V2</strong></div>
            <h2>{_e(item.title)}</h2>
            <p>{_e(item.body)}</p>
            {_chips(item)}
            <div class="fa-actions">
                {_button(item.url, "Open signup hub")}
                {_button(str(item.data.get("repo_url", "")), "Repo", True)}
            </div>
            {_roster_html(item)}
        </div>
    </section>
    """


def _watch_section(item: FlyerItem) -> str:
    return f"""
    <section class="fa-stage fa-stage--broadcast" id="watch">
        <div class="fa-news-board">
            <div class="fa-news-hero">
                <span>NEWS</span>
                <strong>RLCS WATCH DESK</strong>
            </div>
            <div class="fa-news-grid">
                <article><span>TICKETS AVAILABLE NOW</span></article>
                <article><span>ESPORTS SHOP UPDATE</span></article>
            </div>
        </div>
        <div class="fa-menu-detail">
            <div class="fa-detail-topline"><span>{_e(item.label)}</span><strong>LIVE FEED</strong></div>
            <h2>{_e(item.title)}</h2>
            <p>{_e(item.body)}</p>
            {_chips(item)}
            <div class="fa-actions">{_button(item.url, "Open RL Esports", True)}</div>
        </div>
    </section>
    """


def _feature_section(item: FlyerItem, index: int) -> str:
    return f"""
    <section class="fa-option-card fa-option-card--{_a(item.kind)}" id="{_a(item.kind)}">
        <a class="fa-menu-row is-active" href="#{_a(item.kind)}"><span>{_e(item.label)}</span><em>{index:02d}</em></a>
        <div class="fa-option-body">
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
        <a class="fa-menu-row is-active" href="#games"><span>{_e(item.title)}</span><em>?</em></a>
        <div class="fa-game-body">
            <div class="fa-label">{_e(item.label)}</div>
            <p>{_e(item.body)}</p>
            <div class="fa-clue">Clue 1: {_e(first)}</div>
            <div class="fa-actions">
                <button class="fa-btn" type="button" data-fa-action="next-clue">Next clue</button>
                <button class="fa-btn fa-btn--ghost" type="button" data-fa-action="reveal-pro">Reveal</button>
            </div>
            <div class="fa-answer" hidden>{_e(answer)}</div>
        </div>
    </article>
    """


def _jiporady_section(item: FlyerItem) -> str:
    active = item.data.get("active_pack", {})
    packs = item.data.get("packs", [])
    return f"""
    <article class="fa-game fa-game--jiporady" data-fa-jiporady="{_json(packs)}">
        <a class="fa-menu-row is-active" href="#games"><span>{_e(item.title)}</span><em>J</em></a>
        <div class="fa-game-body">
            <div class="fa-label">{_e(item.label)}</div>
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

    menu_html = "".join([
        _menu_row("SHOP", "#top"),
        _menu_row("ROCKET PASS", "#queue", False, "1"),
        _menu_row("PLAY", "#queue", True),
        _menu_row("GARAGE", "#garage"),
        _menu_row("TRAINING", "#warmup"),
        _menu_row("CAREER", "#watch"),
        _menu_row("EXTRAS", "#games"),
        _menu_row("OPTIONS", "#games"),
        _menu_row("EXIT GAME", "#footer"),
    ])
    sub_menu_html = "".join(
        _menu_row(str(lane.get("label", "")), "#" + str(lane.get("label", "")).lower(), index == 0)
        for index, lane in enumerate(lanes)
    )
    feature_html = "".join(_feature_section(item, index + 1) for index, item in enumerate(features))
    games_html = "".join(
        html for html in [
            _guess_pro_section(guess) if guess else "",
            _jiporady_section(jiporady) if jiporady else "",
        ]
    )

    css = """
    :root {
        --bg:#05070c; --ink:#f5f9ff; --muted:#c6d0dc; --faint:#8090a3;
        --line:rgba(255,255,255,.14); --glass:rgba(6,12,18,.70);
        --rl-blue:#58c9ff; --rl-blue2:#d7f6ff; --rl-blue3:#0a86c4;
        --rl-dark:rgba(0,0,0,.68); --rl-dark2:rgba(4,8,10,.86);
        --orange:#ff8a3d; --orange2:#e15b3e; --green:#7dff9b; --gold:#e1b53e;
        --boost:0%;
    }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; background:var(--bg); }
    body { margin:0; color:var(--ink); background:linear-gradient(180deg,#081018,#05070c); font-family:Inter,system-ui,sans-serif; overflow-x:hidden; }
    a { color:inherit; }
    .fa-page { position:relative; isolation:isolate; width:min(1360px,calc(100vw - 20px)); margin:0 auto; padding:16px 0 48px; min-height:100vh; }
    .fa-page:before { content:""; position:fixed; inset:-4%; z-index:-3; background:linear-gradient(90deg,rgba(0,0,0,.18),rgba(0,0,0,.70) 60%,rgba(0,0,0,.90)),linear-gradient(180deg,rgba(5,7,12,.32),rgba(5,7,12,.88)),var(--stadium) center/cover no-repeat; filter:saturate(1.08) brightness(.60); transform:scale(1.03); }
    .fa-page:after { content:""; position:fixed; left:0; right:0; bottom:0; height:42vh; z-index:-2; pointer-events:none; background:linear-gradient(180deg,transparent,rgba(0,0,0,.72)),repeating-linear-gradient(0deg,rgba(83,201,255,.20) 0 2px,transparent 2px 16px); opacity:.32; transform:skewY(-1deg); transform-origin:bottom left; }
    .fa-corner-mark { position:fixed; top:14px; left:14px; z-index:8; display:flex; gap:.7rem; align-items:center; max-width:min(420px,calc(100vw - 150px)); padding:.54rem .74rem; border:1px solid rgba(88,201,255,.36); border-radius:6px; background:linear-gradient(90deg,rgba(8,39,58,.88),rgba(5,13,18,.56)); box-shadow:0 0 0 1px rgba(0,0,0,.55),0 14px 44px rgba(0,0,0,.28); text-decoration:none; clip-path:polygon(0 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,0 100%); }
    .fa-corner-mark img { width:32px; height:auto; filter:drop-shadow(0 8px 18px rgba(0,0,0,.55)); }
    .fa-corner-mark span { display:block; font-family:Rajdhani,Inter,sans-serif; text-transform:uppercase; letter-spacing:.16em; color:var(--rl-blue2); font-weight:800; font-size:.72rem; }
    .fa-corner-mark strong { display:block; font-size:.86rem; color:#d9f4ff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .fa-boost-meter { position:fixed; top:14px; right:14px; z-index:9; width:116px; aspect-ratio:1; display:grid; place-items:center; border-radius:999px; border:1px solid rgba(255,255,255,.16); background:radial-gradient(circle at center,rgba(5,7,12,.96) 0 54%,transparent 55%),conic-gradient(var(--orange) 0 var(--boost),rgba(255,255,255,.12) var(--boost) 100%); box-shadow:0 0 54px rgba(255,138,61,.24),inset 0 0 34px rgba(255,255,255,.04); backdrop-filter:blur(12px); }
    .fa-boost-meter strong { display:block; font-family:Rajdhani,Inter,sans-serif; font-size:2.25rem; line-height:.82; text-align:center; }
    .fa-boost-meter span { display:block; margin-top:.16rem; color:var(--orange); font-size:.62rem; font-weight:900; letter-spacing:.16em; text-align:center; }
    .fa-hero { min-height:94vh; display:grid; grid-template-columns:minmax(235px,.34fr) minmax(0,1fr) minmax(320px,.72fr); gap:clamp(16px,3vw,42px); align-items:center; padding:86px 0 38px; }
    .fa-main-menu,.fa-sub-menu { display:grid; gap:5px; align-content:center; }
    .fa-main-menu { max-width:260px; }
    .fa-menu-row { position:relative; min-height:31px; display:flex; align-items:center; justify-content:space-between; gap:.75rem; padding:.3rem .78rem .28rem 1rem; color:#edf6ff; text-decoration:none; font-family:Rajdhani,Inter,sans-serif; font-weight:700; letter-spacing:.04em; text-transform:uppercase; background:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.58)); border-left:3px solid rgba(255,255,255,.08); clip-path:polygon(0 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,0 100%); text-shadow:0 1px 1px #000; transition:transform .14s ease,filter .14s ease; }
    .fa-menu-row:hover { transform:translateX(4px); filter:brightness(1.18); }
    .fa-menu-row.is-active { color:#062033; background:linear-gradient(90deg,#eafcff 0%,#85ddff 48%,#30aeea 80%,rgba(48,174,234,.28)); border-left-color:#d8f8ff; box-shadow:0 0 0 1px rgba(255,255,255,.24),0 0 20px rgba(88,201,255,.42); }
    .fa-menu-row em { min-width:22px; height:22px; display:grid; place-items:center; border-radius:999px; color:#06314a; background:linear-gradient(#eafcff,#65cfff); font-style:normal; font-size:.74rem; box-shadow:0 0 0 1px rgba(0,0,0,.3); }
    .fa-title { align-self:end; padding-bottom:9vh; }
    .fa-label { font-family:Rajdhani,Inter,sans-serif; letter-spacing:.16em; text-transform:uppercase; color:var(--rl-blue); font-weight:800; font-size:.76rem; }
    .fa-title h1 { max-width:10.5ch; margin:.8rem 0 0; font-family:Rajdhani,Inter,sans-serif; font-size:clamp(4rem,8vw,8.8rem); line-height:.78; letter-spacing:-.075em; text-shadow:0 0 40px rgba(255,138,61,.22); }
    .fa-title p { max-width:62ch; margin:1.2rem 0 0; color:var(--muted); line-height:1.7; font-size:1.08rem; }
    .fa-actions,.fa-chips { display:flex; flex-wrap:wrap; gap:.65rem; align-items:center; margin-top:1rem; }
    .fa-btn { display:inline-flex; align-items:center; justify-content:center; min-height:38px; padding:0 .95rem; border-radius:4px; border:1px solid rgba(88,201,255,.38); background:linear-gradient(180deg,#6dd7ff,#128ec9); color:#062033; font:inherit; font-weight:850; text-decoration:none; cursor:pointer; margin:.35rem .35rem 0 0; text-transform:uppercase; clip-path:polygon(0 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,0 100%); }
    .fa-btn--ghost { color:#d9f4ff; background:linear-gradient(90deg,rgba(0,0,0,.78),rgba(0,0,0,.42)); border-color:rgba(255,255,255,.14); }
    .fa-sub-menu { align-self:end; padding-bottom:13vh; max-width:285px; opacity:.78; }
    .fa-track { display:grid; gap:clamp(18px,3vw,34px); }
    .fa-stage { border:1px solid rgba(88,201,255,.22); box-shadow:0 22px 70px rgba(0,0,0,.36); background:linear-gradient(180deg,rgba(8,24,34,.82),rgba(3,8,12,.72)); backdrop-filter:blur(10px); }
    .fa-stage--queue { min-height:56vh; display:grid; grid-template-columns:minmax(230px,.32fr) minmax(0,1fr); gap:0; border-radius:8px; overflow:hidden; }
    .fa-section-menu { display:grid; gap:6px; align-content:start; padding:1.15rem .85rem; background:linear-gradient(90deg,rgba(0,0,0,.54),rgba(0,0,0,.18)); border-right:1px solid rgba(88,201,255,.18); }
    .fa-menu-detail { padding:clamp(22px,4vw,44px); }
    .fa-detail-topline { display:flex; justify-content:space-between; gap:1rem; margin-bottom:1rem; color:var(--rl-blue); font-family:Rajdhani,Inter,sans-serif; letter-spacing:.14em; text-transform:uppercase; font-weight:800; }
    .fa-stage h2,.fa-option-card h3,.fa-game h3 { margin:.45rem 0 0; font-family:Rajdhani,Inter,sans-serif; line-height:.92; letter-spacing:-.045em; }
    .fa-stage h2 { font-size:clamp(2.7rem,5vw,5.8rem); }
    .fa-stage p,.fa-option-card p,.fa-game p { color:var(--muted); line-height:1.68; }
    .fa-roster,.fa-clue,.fa-pack,.fa-answer { margin-top:1rem; padding:.9rem 1rem; border-radius:4px; background:rgba(0,0,0,.36); border:1px solid rgba(88,201,255,.18); }
    .fa-roster span { display:block; color:var(--rl-blue); font-family:Rajdhani,Inter,sans-serif; letter-spacing:.16em; text-transform:uppercase; font-weight:800; font-size:.72rem; }
    .fa-stage--broadcast { display:grid; grid-template-columns:1.1fr .9fr; gap:0; align-items:stretch; border-radius:8px; overflow:hidden; }
    .fa-news-board { min-height:430px; padding:1rem; background:linear-gradient(180deg,rgba(6,18,28,.94),rgba(0,0,0,.74)); border-right:1px solid rgba(88,201,255,.18); }
    .fa-news-hero { height:260px; display:flex; flex-direction:column; justify-content:flex-end; padding:1rem; border:1px solid rgba(88,201,255,.22); background:radial-gradient(circle at 72% 38%,rgba(255,138,61,.44),transparent 9rem),linear-gradient(135deg,rgba(88,201,255,.18),rgba(0,0,0,.22)); }
    .fa-news-hero span,.fa-news-grid span { color:#bfefff; font-family:Rajdhani,Inter,sans-serif; letter-spacing:.12em; text-transform:uppercase; font-weight:800; }
    .fa-news-hero strong { font-family:Rajdhani,Inter,sans-serif; font-size:2.6rem; line-height:.9; }
    .fa-news-grid { display:grid; grid-template-columns:1fr 1fr; gap:.7rem; margin-top:.75rem; }
    .fa-news-grid article { min-height:110px; padding:.8rem; display:flex; align-items:end; background:linear-gradient(135deg,rgba(255,138,61,.18),rgba(88,201,255,.12)),rgba(0,0,0,.42); border:1px solid rgba(88,201,255,.16); }
    .fa-option-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .fa-option-card { display:grid; grid-template-rows:auto 1fr; min-height:210px; }
    .fa-option-card > .fa-menu-row { min-height:38px; font-size:1.03rem; }
    .fa-option-body { margin-top:3px; padding:1rem; background:linear-gradient(90deg,rgba(0,0,0,.76),rgba(0,0,0,.42)); border-left:3px solid rgba(88,201,255,.28); min-height:170px; clip-path:polygon(0 0,calc(100% - 18px) 0,100% 10px,100% 100%,0 100%); }
    .fa-option-card--warmup .fa-menu-row,.fa-option-card--garage .fa-menu-row { background:linear-gradient(90deg,#eafcff,#7fdcff 50%,#1597d0); color:#062033; }
    .fa-option-card--house_rule .fa-menu-row { background:linear-gradient(90deg,#fff4ce,#e1b53e 70%,rgba(225,181,62,.28)); color:#221904; }
    .fa-chips span { display:inline-flex; min-height:26px; align-items:center; padding:0 .58rem; border-radius:3px; background:rgba(88,201,255,.10); border:1px solid rgba(88,201,255,.18); color:#d9f4ff; font-size:.72rem; font-weight:800; text-transform:uppercase; }
    .fa-games { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .fa-game { min-height:320px; display:grid; grid-template-rows:auto 1fr; }
    .fa-game-body { margin-top:3px; padding:1rem; background:linear-gradient(180deg,rgba(0,0,0,.68),rgba(0,0,0,.42)); border:1px solid rgba(88,201,255,.16); }
    .fa-pack { display:grid; gap:.5rem; } .fa-pack span { color:var(--rl-blue); font-weight:850; } .fa-pack em { font-style:normal; }
    .fa-footer { margin-top:24px; text-align:center; color:var(--faint); font-weight:750; }
    @media(max-width:1050px){ .fa-hero { grid-template-columns:minmax(220px,.38fr) 1fr; } .fa-sub-menu { display:none; } .fa-stage--broadcast,.fa-stage--queue,.fa-games { grid-template-columns:1fr; } .fa-news-board { border-right:0; border-bottom:1px solid rgba(88,201,255,.18); } }
    @media(max-width:720px){ .fa-page { width:calc(100vw - 16px); } .fa-boost-meter { width:92px; } .fa-boost-meter strong { font-size:1.85rem; } .fa-corner-mark strong { display:none; } .fa-hero,.fa-option-grid { grid-template-columns:1fr; } .fa-main-menu { max-width:100%; padding-top:96px; } .fa-title { padding-bottom:0; } .fa-title h1 { font-size:clamp(3.3rem,20vw,5.4rem); } }
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
    <section class="fa-hero" id="top"><nav class="fa-main-menu" aria-label="Rocket League inspired main menu">{menu_html}</nav><div class="fa-title"><div class="fa-label">{_e(lead.label)}</div><h1>{_e(lead.title)}</h1><p>{_e(lead.body)}</p><div class="fa-actions">{_button(str(experience.data.get("tournament_url", "")), "Signup hub")}{_button(str(experience.data.get("rl_esports_news_url", "")), "RLCS news", True)}{_button(str(experience.data.get("jiporady_repo_url", "")), "Jiporady source", True)}</div></div><nav class="fa-sub-menu" aria-label="F9 Daily sections">{sub_menu_html}</nav></section>
    <div class="fa-track">{_queue_section(tournament) if tournament else ""}{_watch_section(watch) if watch else ""}<section class="fa-option-grid">{feature_html}</section><section class="fa-games" id="games">{games_html}</section></div>
    <footer class="fa-footer" id="footer">{_e(experience.footer)}</footer>
</main><script>{js}</script></body></html>"""
