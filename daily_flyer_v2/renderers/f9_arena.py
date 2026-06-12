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
    return next((item for item in items if item.kind == kind), None)


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


def _queue_section(item: FlyerItem) -> str:
    roster_url = item.data.get("roster_url", "")
    roster_attr = f' data-fa-roster-url="{_a(roster_url)}"' if roster_url else ""
    return f"""
    <section class="fa-stage fa-stage--queue" id="queue">
        <div class="fa-stage-copy">
            <div class="fa-terminal-bar"><span></span><span></span><span></span><strong>queue://f9-2v2</strong></div>
            <div class="fa-label">{_e(item.label)}</div>
            <h2>{_e(item.title)}</h2>
            <p>{_e(item.body)}</p>
            {_chips(item)}
            <div class="fa-actions">{_button(item.url, "Open signup hub")}</div>
            <div class="fa-roster"{roster_attr}><span>Roster feed</span><strong>Checking live roster…</strong></div>
        </div>
        <aside class="fa-pos-card"><span>01</span><strong>Signup live</strong><p>This panel only appears when an F9 event is active.</p></aside>
    </section>
    """


def _watch_section(item: FlyerItem) -> str:
    return f"""
    <section class="fa-stage fa-stage--broadcast" id="watch">
        <div class="fa-stage-copy">
            <div class="fa-label">{_e(item.label)}</div>
            <h2>{_e(item.title)}</h2>
            <p>{_e(item.body)}</p>
            {_chips(item)}
            <div class="fa-actions">{_button(item.url, "Open RL Esports", True)}</div>
        </div>
        <aside class="fa-pos-card fa-pos-card--field" aria-label="Rocket League field positioning idea card">
            <span>POS</span>
            <strong>Position board placeholder</strong>
            <div class="fa-mini-field"><i></i><i></i><i></i><b></b></div>
            <p>Future idea: show rotation/positioning prompts here instead of generic news art.</p>
        </aside>
    </section>
    """


def _feature_section(item: FlyerItem, index: int) -> str:
    return f"""
    <section class="fa-feature fa-feature--{_a(item.kind)}" id="{_a(item.kind)}">
        <div class="fa-slant-tab"><span>{_e(item.label)}</span><em>{index:02d}</em></div>
        <div class="fa-feature-body">
            <h3>{_e(item.title)}</h3>
            <p>{_e(item.body)}</p>
            {_chips(item)}
        </div>
    </section>
    """


def _rlcs_daily_section(item: FlyerItem) -> str:
    clues = item.data.get("clues", [])
    first = clues[0] if clues else "No clue loaded."
    options = item.data.get("options", [])
    options_html = "".join(f'<button class="fa-choice" type="button" data-fa-choice="{_a(option)}">{_e(option)}</button>' for option in options)
    return f"""
    <article class="fa-game fa-game--rlcs" data-fa-rlcs-answer="{_a(item.data.get("answer", ""))}" data-fa-rlcs-role="{_a(item.data.get("role", ""))}" data-fa-rlcs-clues="{_json(clues)}">
        <div class="fa-slant-tab"><span>{_e(item.title)}</span><em>{_e(item.data.get("pool_size", ""))}</em></div>
        <div class="fa-game-body">
            <div class="fa-label">{_e(item.label)}</div>
            <p>{_e(item.body)}</p>
            <div class="fa-clue">Clue 1: {_e(first)}</div>
            <div class="fa-choice-grid">{options_html}</div>
            <div class="fa-actions"><button class="fa-btn" type="button" data-fa-action="next-rlcs-clue">Next clue</button><button class="fa-btn fa-btn--ghost" type="button" data-fa-action="reveal-rlcs">Reveal</button></div>
            <div class="fa-answer" hidden></div>
        </div>
    </article>
    """


def _jiporady_section(item: FlyerItem) -> str:
    board = item.data.get("board", [])
    launch = _button(item.url, "Open live Jiporady demo", True)
    return f"""
    <article class="fa-game fa-game--jiporady" data-fa-jiporady-board="{_json(board)}">
        <div class="fa-slant-tab"><span>{_e(item.title)}</span><em>J</em></div>
        <div class="fa-game-body">
            <div class="fa-label">{_e(item.label)}</div>
            <p>{_e(item.body)}</p>
            <div class="fa-jip-board"><div class="fa-jip-category"></div><div class="fa-jip-clues"></div></div>
            <div class="fa-pack" data-fa-jip-output><span>Choose a clue</span><strong>Pick a value to show the question here.</strong><em hidden></em></div>
            <div class="fa-actions"><button class="fa-btn" type="button" data-fa-action="next-jip-category">Switch category</button><button class="fa-btn fa-btn--ghost" type="button" data-fa-action="reveal-jip-answer">Reveal answer</button>{launch}</div>
        </div>
    </article>
    """


def render_f9_arena(experience: FlyerExperience) -> str:
    lead = experience.lead
    sections = {item.kind: item for item in experience.sections}
    tournament = sections.get("tournament")
    watch = sections.get("watch")
    features = [item for item in experience.sections if item.kind not in {"tournament", "watch"}]
    rlcs_daily = _find(experience.actions, "rlcs_daily")
    jiporady = _find(experience.actions, "jiporady")

    logo_url = str(experience.data.get("logo_url", "") or "")
    stadium_url = str(experience.data.get("stadium_url", "") or "")
    discord_url = str(experience.data.get("discord_url", "") or "")
    lanes = experience.data.get("lanes", [])

    lane_html = "".join(f'<a class="fa-lane-option" href="#{_a(str(lane.get("label", "")).lower())}"><span>{_e(lane.get("label"))}</span><strong>{_e(lane.get("value"))}</strong></a>' for lane in lanes)
    feature_html = "".join(_feature_section(item, index + 1) for index, item in enumerate(features))
    games_html = "".join(html for html in [_rlcs_daily_section(rlcs_daily) if rlcs_daily else "", _jiporady_section(jiporady) if jiporady else ""])

    css = """
    :root { --bg:#05070c; --ink:#fff8ee; --muted:#c6d0dc; --faint:#8492a6; --line:rgba(255,255,255,.14); --glass:rgba(8,13,23,.72); --orange:#ff8a3d; --orange2:#e15b3e; --blue:#59e0ff; --green:#7dff9b; --gold:#e1b53e; --f9-cyan:#2bc7ff; --boost:0%; }
    * { box-sizing:border-box; } html { scroll-behavior:smooth; background:var(--bg); }
    body { margin:0; color:var(--ink); background:radial-gradient(circle at 12% 10%,rgba(43,199,255,.16),transparent 26%),radial-gradient(circle at 84% 8%,rgba(255,138,61,.18),transparent 24%),linear-gradient(180deg,#071018 0%,#0a1017 44%,#05070c 100%); font-family:Inter,system-ui,sans-serif; overflow-x:hidden; }
    a { color:inherit; } .fa-page { position:relative; isolation:isolate; width:min(1320px,calc(100vw - 24px)); margin:0 auto; padding:18px 0 48px; min-height:100vh; }
    .fa-page:before { content:""; position:fixed; inset:-4%; z-index:-3; background:linear-gradient(180deg,rgba(5,7,12,.46),rgba(5,7,12,.94)),var(--stadium) center/cover no-repeat; filter:saturate(1.12) brightness(.52); transform:scale(1.03); }
    .fa-page:after { content:""; position:fixed; inset:0; z-index:-2; pointer-events:none; opacity:.24; background:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px); background-size:44px 44px; mask-image:linear-gradient(180deg,transparent,#000 12%,#000 82%,transparent); transform:perspective(900px) rotateX(62deg) translateY(24%); transform-origin:center bottom; }
    .fa-corner-mark { position:fixed; top:14px; left:14px; z-index:8; display:flex; gap:.85rem; align-items:center; max-width:min(460px,calc(100vw - 150px)); padding:.54rem .92rem .54rem .62rem; border:1px solid rgba(43,199,255,.45); border-radius:999px; background:linear-gradient(135deg,rgba(7,21,34,.88),rgba(43,199,255,.10) 46%,rgba(255,138,61,.14)); backdrop-filter:blur(16px); box-shadow:0 0 0 1px rgba(255,255,255,.04),0 14px 44px rgba(0,0,0,.30),0 0 34px rgba(43,199,255,.16); text-decoration:none; }
    .fa-corner-mark img { width:54px; height:54px; object-fit:contain; border-radius:14px; padding:4px; background:rgba(255,255,255,.06); filter:drop-shadow(0 0 18px rgba(43,199,255,.46)); }
    .fa-corner-mark span { display:block; font-family:Rajdhani,Inter,sans-serif; text-transform:uppercase; letter-spacing:.16em; color:var(--f9-cyan); font-weight:900; font-size:.72rem; }
    .fa-corner-mark strong { display:block; font-size:.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#f7fbff; }
    .fa-boost-meter { position:fixed; top:14px; right:14px; z-index:9; width:116px; aspect-ratio:1; display:grid; place-items:center; border-radius:999px; border:1px solid rgba(255,255,255,.16); background:radial-gradient(circle at center,rgba(5,7,12,.96) 0 54%,transparent 55%),conic-gradient(var(--orange) 0 var(--boost), rgba(255,255,255,.12) var(--boost) 100%); box-shadow:0 0 54px rgba(255,138,61,.24), inset 0 0 34px rgba(255,255,255,.04); backdrop-filter:blur(12px); }
    .fa-boost-meter strong { display:block; font-family:Rajdhani,Inter,sans-serif; font-size:2.25rem; line-height:.82; text-align:center; } .fa-boost-meter span { display:block; margin-top:.16rem; color:var(--orange); font-size:.62rem; font-weight:900; letter-spacing:.16em; text-align:center; }
    .fa-hero { min-height:92vh; display:grid; grid-template-columns:minmax(0,1.08fr) minmax(300px,.92fr); gap:clamp(18px,5vw,70px); align-items:center; padding:112px 0 42px; position:relative; }
    .fa-hero:before { content:""; position:absolute; right:5%; top:11%; width:min(36vw,470px); height:min(36vw,470px); border-radius:999px; background:radial-gradient(circle,rgba(255,138,61,.24),rgba(255,138,61,.10) 34%,transparent 72%); filter:blur(18px); z-index:-1; }
    .fa-hero:after { content:""; position:absolute; right:13%; top:20%; width:min(18vw,220px); height:min(18vw,220px); border-radius:50%; border:1px solid rgba(43,199,255,.22); box-shadow:0 0 0 24px rgba(43,199,255,.04),0 0 0 56px rgba(255,138,61,.025); z-index:-1; }
    .fa-hero-logo { display:flex; align-items:center; gap:1rem; margin-bottom:1.1rem; } .fa-hero-logo img { width:96px; height:96px; object-fit:contain; filter:drop-shadow(0 0 32px rgba(43,199,255,.45)); } .fa-hero-logo span { font-family:Rajdhani,Inter,sans-serif; color:var(--f9-cyan); letter-spacing:.18em; text-transform:uppercase; font-weight:900; }
    .fa-label,.fa-section-kicker { position:relative; display:inline-block; padding-left:18px; font-family:Rajdhani,Inter,sans-serif; letter-spacing:.16em; text-transform:uppercase; color:var(--green); font-weight:800; font-size:.76rem; } .fa-label:before,.fa-section-kicker:before { content:""; position:absolute; left:0; top:.52rem; width:8px; height:1px; background:currentColor; }
    .fa-title { max-width:800px; padding:54px 0 24px; } .fa-title h1 { max-width:11.5ch; margin:14px 0 0; font-family:"Space Grotesk",Inter,system-ui,sans-serif; font-size:clamp(3.9rem,8vw,7.9rem); line-height:.88; letter-spacing:-.06em; font-weight:700; text-wrap:balance; text-shadow:0 0 40px rgba(255,138,61,.16); } .fa-title p { max-width:56ch; margin:32px 0 0; color:var(--muted); line-height:1.82; font-size:1.05rem; }
    .fa-actions,.fa-chips { display:flex; flex-wrap:wrap; gap:.65rem; align-items:center; margin-top:1rem; } .fa-btn { display:inline-flex; align-items:center; justify-content:center; min-height:42px; padding:0 .95rem; border-radius:999px; border:1px solid rgba(255,138,61,.38); background:linear-gradient(135deg,var(--orange),var(--orange2)); color:#130f0a; font:inherit; font-weight:850; text-decoration:none; cursor:pointer; margin:.35rem .35rem 0 0; } .fa-btn--ghost { color:var(--ink); background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.14); }
    .fa-lane-nav { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; } .fa-lane-option { position:relative; min-height:126px; padding:1rem 1.25rem 1rem 1rem; border:1px solid rgba(89,224,255,.22); background:linear-gradient(90deg,rgba(0,0,0,.76),rgba(8,13,23,.62)); text-decoration:none; box-shadow:0 18px 52px rgba(0,0,0,.26); backdrop-filter:blur(14px); clip-path:polygon(0 0,calc(100% - 22px) 0,100% 50%,calc(100% - 22px) 100%,0 100%); transition:transform .14s ease,filter .14s ease; } .fa-lane-option:hover { transform:translateX(4px); filter:brightness(1.14); } .fa-lane-option:first-child { background:linear-gradient(90deg,#eafcff 0%,#83dcff 54%,#28a9df 82%,rgba(40,169,223,.32)); color:#062033; box-shadow:0 0 0 1px rgba(255,255,255,.22),0 0 24px rgba(89,224,255,.32); } .fa-lane-option span { display:block; color:var(--green); font-family:Rajdhani,Inter,sans-serif; letter-spacing:.16em; text-transform:uppercase; font-weight:800; font-size:.72rem; } .fa-lane-option:first-child span { color:#06415e; } .fa-lane-option strong { display:block; margin-top:.5rem; font-family:Rajdhani,Inter,sans-serif; font-size:1.8rem; line-height:.95; }
    .fa-track { display:grid; gap:clamp(20px,4vw,42px); } .fa-feature-head { display:flex; justify-content:space-between; gap:1rem; align-items:end; margin-bottom:-20px; } .fa-feature-head h2 { margin:0; font-family:Space Grotesk,Inter,sans-serif; font-size:clamp(2rem,4vw,3.8rem); line-height:.9; letter-spacing:-.05em; }
    .fa-stage { min-height:52vh; border:1px solid rgba(89,224,255,.20); overflow:hidden; position:relative; background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.022)),var(--glass); box-shadow:0 24px 72px rgba(0,0,0,.34); backdrop-filter:blur(14px); clip-path:polygon(0 0,calc(100% - 34px) 0,100% 34px,100% 100%,34px 100%,0 calc(100% - 34px)); } .fa-stage--queue,.fa-stage--broadcast { display:grid; grid-template-columns:minmax(0,1fr) minmax(240px,.38fr); gap:0; } .fa-stage--broadcast { grid-template-columns:.82fr 1.18fr; padding:clamp(22px,4vw,44px); gap:clamp(18px,4vw,46px); align-items:center; }
    .fa-stage-copy { padding:clamp(22px,4vw,44px); } .fa-stage h2 { margin:.45rem 0 0; font-family:Rajdhani,Inter,sans-serif; font-size:clamp(2.7rem,6vw,6.2rem); line-height:.92; letter-spacing:-.045em; } .fa-stage p,.fa-feature p,.fa-game p { color:var(--muted); line-height:1.68; }
    .fa-terminal-bar { display:flex; align-items:center; gap:.45rem; padding:.65rem .75rem; border:1px solid rgba(255,255,255,.10); border-radius:4px; background:rgba(0,0,0,.28); color:var(--faint); font-family:ui-monospace,Menlo,Consolas,monospace; font-size:.78rem; margin-bottom:1.35rem; clip-path:polygon(0 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,0 100%); } .fa-terminal-bar span { width:.7rem; aspect-ratio:1; border-radius:999px; background:var(--orange); } .fa-terminal-bar span:nth-child(2){background:var(--gold)} .fa-terminal-bar span:nth-child(3){background:var(--green)}
    .fa-pos-card { display:flex; flex-direction:column; justify-content:space-between; padding:1.25rem; background:linear-gradient(180deg,rgba(255,138,61,.18),rgba(255,255,255,.04)); border-left:1px solid rgba(255,255,255,.11); } .fa-pos-card span { font-family:Rajdhani,Inter,sans-serif; font-size:4.2rem; line-height:.8; color:rgba(255,255,255,.20); } .fa-pos-card--field { border-left:0; border:1px solid rgba(89,224,255,.26); clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,0 100%); } .fa-mini-field { position:relative; height:190px; margin:1rem 0; border:1px solid rgba(89,224,255,.30); background:radial-gradient(circle at center,transparent 0 38px,rgba(89,224,255,.24) 39px 41px,transparent 42px),linear-gradient(90deg,transparent calc(50% - 1px),rgba(89,224,255,.22) 50%,transparent calc(50% + 1px)); } .fa-mini-field i,.fa-mini-field b { position:absolute; width:14px; height:14px; border-radius:999px; background:var(--orange); box-shadow:0 0 18px rgba(255,138,61,.55); } .fa-mini-field i:nth-child(1){left:18%;top:52%}.fa-mini-field i:nth-child(2){left:46%;top:30%}.fa-mini-field i:nth-child(3){left:72%;top:62%}.fa-mini-field b{background:var(--f9-cyan);left:54%;top:50%}
    .fa-roster,.fa-clue,.fa-pack,.fa-answer { margin-top:1rem; padding:.9rem 1rem; border-radius:4px; background:rgba(255,255,255,.055); border:1px solid rgba(255,255,255,.10); } .fa-roster span { display:block; color:var(--green); font-family:Rajdhani,Inter,sans-serif; letter-spacing:.16em; text-transform:uppercase; font-weight:800; font-size:.72rem; }
    .fa-feature-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; } .fa-feature,.fa-game { min-height:300px; display:grid; grid-template-rows:auto 1fr; filter:drop-shadow(0 18px 38px rgba(0,0,0,.28)); } .fa-slant-tab { display:flex; align-items:center; justify-content:space-between; gap:.7rem; min-height:38px; padding:.35rem .9rem .32rem 1rem; background:linear-gradient(90deg,#eafcff,#86ddff 52%,#2aa9df 82%,rgba(42,169,223,.24)); color:#062033; font-family:Rajdhani,Inter,sans-serif; text-transform:uppercase; letter-spacing:.06em; font-weight:800; clip-path:polygon(0 0,calc(100% - 18px) 0,100% 50%,calc(100% - 18px) 100%,0 100%); } .fa-slant-tab em { min-width:24px; height:24px; padding:0 .35rem; display:grid; place-items:center; border-radius:999px; background:rgba(255,255,255,.72); color:#06314a; font-style:normal; font-size:.72rem; } .fa-feature-body,.fa-game-body { margin-top:3px; min-height:240px; padding:1rem; border:1px solid rgba(89,224,255,.18); background:linear-gradient(90deg,rgba(0,0,0,.74),rgba(8,13,23,.58)); clip-path:polygon(0 0,calc(100% - 18px) 0,100% 10px,100% 100%,0 100%); } .fa-feature--arena .fa-slant-tab{background:linear-gradient(90deg,#dff8ff,#59e0ff 62%,rgba(89,224,255,.24))}.fa-feature--warmup .fa-slant-tab{background:linear-gradient(90deg,#e8fff0,#7dff9b 62%,rgba(125,255,155,.22))}.fa-feature--house_rule .fa-slant-tab{background:linear-gradient(90deg,#fff5d1,#e1b53e 62%,rgba(225,181,62,.22))} .fa-feature h3,.fa-game h3 { margin:.45rem 0 0; font-family:Rajdhani,Inter,sans-serif; font-size:2rem; line-height:.92; letter-spacing:-.045em; } .fa-chips span { display:inline-flex; min-height:26px; align-items:center; padding:0 .58rem; border-radius:3px; background:rgba(89,224,255,.10); border:1px solid rgba(89,224,255,.18); color:#d9f4ff; font-size:.72rem; font-weight:800; text-transform:uppercase; }
    .fa-games { display:grid; grid-template-columns:1fr 1fr; gap:18px; } .fa-game--rlcs .fa-slant-tab{background:linear-gradient(90deg,#fff5d1,#e1b53e 62%,rgba(225,181,62,.22))}.fa-game--jiporady .fa-slant-tab{background:linear-gradient(90deg,#eafcff,#59e0ff 62%,rgba(89,224,255,.22))} .fa-choice-grid,.fa-jip-clues { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.55rem; margin-top:1rem; } .fa-choice,.fa-jip-clue { min-height:38px; padding:.55rem .65rem; border:1px solid rgba(89,224,255,.24); background:rgba(89,224,255,.08); color:#eafcff; font:inherit; font-weight:800; cursor:pointer; text-align:left; clip-path:polygon(0 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,0 100%); } .fa-choice.is-correct{background:rgba(125,255,155,.22);border-color:rgba(125,255,155,.55)}.fa-choice.is-wrong{background:rgba(255,102,102,.18);border-color:rgba(255,102,102,.45)} .fa-jip-category { padding:.65rem .8rem; color:#062033; background:linear-gradient(90deg,#eafcff,#59e0ff); font-family:Rajdhani,Inter,sans-serif; font-weight:900; letter-spacing:.08em; text-transform:uppercase; clip-path:polygon(0 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,0 100%); } .fa-pack{display:grid;gap:.5rem}.fa-pack span{color:var(--green);font-weight:850}.fa-pack em{font-style:normal;color:#f8fdff}.fa-footer{margin-top:24px;text-align:center;color:var(--faint);font-weight:750}
    @media(max-width:960px){ .fa-corner-mark{max-width:calc(100vw - 128px)} .fa-hero,.fa-stage--queue,.fa-stage--broadcast,.fa-games{grid-template-columns:1fr}.fa-hero{min-height:auto;padding-top:130px}.fa-feature-grid{grid-template-columns:repeat(2,1fr)}.fa-pos-card{border-left:0;border-top:1px solid rgba(255,255,255,.11)} } @media(max-width:640px){ .fa-page{width:calc(100vw - 16px)}.fa-boost-meter{width:92px}.fa-boost-meter strong{font-size:1.85rem}.fa-corner-mark strong{display:none}.fa-corner-mark img{width:44px;height:44px}.fa-lane-nav,.fa-feature-grid,.fa-choice-grid,.fa-jip-clues{grid-template-columns:1fr}.fa-title h1{font-size:clamp(3.3rem,20vw,5.4rem)} }
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
        document.querySelectorAll("[data-fa-rlcs-answer]").forEach(function(root){ var clues=[]; try{clues=JSON.parse(root.getAttribute("data-fa-rlcs-clues")||"[]");}catch(e){} var answer=root.getAttribute("data-fa-rlcs-answer")||""; var role=root.getAttribute("data-fa-rlcs-role")||""; var i=0; var clue=root.querySelector(".fa-clue"); var output=root.querySelector(".fa-answer"); function showAnswer(prefix){ if(output){ output.hidden=false; output.innerHTML="<span>"+prefix+"</span><strong>"+answer+"</strong><em>"+role+"</em>"; }} root.querySelectorAll("[data-fa-choice]").forEach(function(btn){ btn.addEventListener("click",function(){ var pick=btn.getAttribute("data-fa-choice")||""; root.querySelectorAll("[data-fa-choice]").forEach(function(other){ other.disabled=true; if((other.getAttribute("data-fa-choice")||"")===answer) other.classList.add("is-correct"); }); btn.classList.add(pick===answer?"is-correct":"is-wrong"); showAnswer(pick===answer?"Correct":"Answer"); }); }); var next=root.querySelector("[data-fa-action='next-rlcs-clue']"); if(next) next.addEventListener("click",function(){ i=Math.min(i+1,Math.max(clues.length-1,0)); if(clue) clue.textContent="Clue "+(i+1)+": "+(clues[i]||""); }); var reveal=root.querySelector("[data-fa-action='reveal-rlcs']"); if(reveal) reveal.addEventListener("click",function(){ showAnswer("Answer"); }); });
        document.querySelectorAll("[data-fa-jiporady-board]").forEach(function(root){ var board=[]; try{board=JSON.parse(root.getAttribute("data-fa-jiporady-board")||"[]");}catch(e){} if(!board.length)return; var index=0; var category=root.querySelector(".fa-jip-category"); var clueGrid=root.querySelector(".fa-jip-clues"); var output=root.querySelector("[data-fa-jip-output]"); function renderCategory(){ var cat=board[index%board.length]||{}; if(category) category.textContent=cat.category||""; if(clueGrid){ clueGrid.innerHTML=""; (cat.clues||[]).forEach(function(clue){ var btn=document.createElement("button"); btn.className="fa-jip-clue"; btn.type="button"; btn.textContent=clue.value||""; btn.addEventListener("click",function(){ if(output){ output.innerHTML="<span>"+(cat.category||"Clue")+"</span><strong>"+(clue.question||"")+"</strong><em hidden>"+(clue.answer||"")+"</em>"; } }); clueGrid.appendChild(btn); }); } if(output){ output.innerHTML="<span>Choose a clue</span><strong>Pick a value to show the question here.</strong><em hidden></em>"; } } var next=root.querySelector("[data-fa-action='next-jip-category']"); if(next) next.addEventListener("click",function(){ index=(index+1)%board.length; renderCategory(); }); var reveal=root.querySelector("[data-fa-action='reveal-jip-answer']"); if(reveal) reveal.addEventListener("click",function(){ var em=output?output.querySelector("em"):null; if(em) em.hidden=false; }); renderCategory(); });
    })();
    """

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>{_e(experience.title)}</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet"><style>{css}</style></head>
<body>
<main class="fa-page" style="--stadium:url('{_a(stadium_url)}')">
    <a class="fa-corner-mark" href="#top" aria-label="Back to top"><img src="{_a(logo_url)}" alt="F9 logo"><span>{_e(experience.title)}</span><strong>{_e(experience.date_label)}</strong></a>
    <div class="fa-boost-meter" data-fa-boost-meter role="meter" aria-label="Scroll boost" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div><strong data-fa-boost-value>0</strong><span>BOOST</span></div></div>
    <section class="fa-hero" id="top"><div class="fa-title"><div class="fa-hero-logo"><img src="{_a(logo_url)}" alt="F9 logo"><span>F9 Community Control</span></div><div class="fa-label">{_e(lead.label)}</div><h1>{_e(experience.title)}</h1><p>{_e(lead.title)} {_e(lead.body)}</p><div class="fa-actions">{_button(discord_url, "Join F9 Discord")}{_button(str(experience.data.get("tournament_url", "")), "Signup hub")}{_button(str(experience.data.get("rl_esports_news_url", "")), "RLCS news", True)}{_button(str(experience.data.get("jiporady_url", "")), "Open live Jiporady", True)}</div></div><nav class="fa-lane-nav" aria-label="F9 Hub sections">{lane_html}</nav></section>
    <div class="fa-track">{_queue_section(tournament) if tournament else ""}{_watch_section(watch) if watch else ""}<div class="fa-feature-head"><div><div class="fa-section-kicker">Featured cards</div><h2>Featured cards</h2></div></div><section class="fa-feature-grid">{feature_html}</section><section class="fa-games" id="games">{games_html}</section></div>
    <footer class="fa-footer">{_e(experience.footer)}</footer>
</main><script>{js}</script></body></html>"""
