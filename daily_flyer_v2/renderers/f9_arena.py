from __future__ import annotations

import json
from html import escape

from daily_flyer_v2.experience import FlyerExperience, FlyerItem


def _as_text(value) -> str:
    return escape(str(value or ""))


def _attr(value) -> str:
    return escape(str(value or ""), quote=True)


def _json_attr(value) -> str:
    return escape(json.dumps(value, ensure_ascii=False), quote=True)


def _find(items: list[FlyerItem], kind: str) -> FlyerItem | None:
    for item in items:
        if item.kind == kind:
            return item
    return None


def _chips(item: FlyerItem) -> str:
    chips = item.data.get("chips", [])
    if not chips:
        return ""
    return '<div class="fa-chips">' + "".join(f"<span>{_as_text(chip)}</span>" for chip in chips) + "</div>"


def _button(url: str | None, label: str, variant: str = "") -> str:
    if not url:
        return ""
    classes = "fa-button" + (f" fa-button--{variant}" if variant else "")
    return f'<a class="{classes}" href="{_attr(url)}" target="_blank" rel="noopener noreferrer">{_as_text(label)}</a>'


def _hud(label: str, value: str, sub: str = "") -> str:
    sub_html = f'<small>{_as_text(sub)}</small>' if sub else ""
    return f'<section class="fa-hud"><span>{_as_text(label)}</span><strong>{_as_text(value)}</strong>{sub_html}</section>'


def _feature_card(item: FlyerItem) -> str:
    return f"""
    <article class="fa-feature fa-feature--{_attr(item.kind)}">
        <div class="fa-label">{_as_text(item.label)}</div>
        <h3>{_as_text(item.title)}</h3>
        <p>{_as_text(item.body)}</p>
        {_chips(item)}
        {_button(item.url, "Open source", "ghost") if item.url else ""}
    </article>
    """


def _tournament_panel(item: FlyerItem) -> str:
    roster_url = str(item.data.get("roster_url", "") or "")
    roster_attr = f' data-fa-roster-url="{_attr(roster_url)}"' if roster_url else ""
    roster_text = "Live roster disabled until F9_TOURNEY_URL is set."
    if roster_url:
        roster_text = "Checking live roster…"

    return f"""
    <section class="fa-panel fa-panel--queue">
        <div class="fa-panel-top"><span>{_as_text(item.label)}</span><span>2V2</span></div>
        <h2>{_as_text(item.title)}</h2>
        <p>{_as_text(item.body)}</p>
        {_chips(item)}
        <div class="fa-actions">
            {_button(item.url, "Open signup hub")}
            {_button(str(item.data.get("repo_url", "")), "Repo", "ghost")}
        </div>
        <div class="fa-roster"{roster_attr}><span>Roster</span><strong>{_as_text(roster_text)}</strong></div>
    </section>
    """


def _watch_panel(item: FlyerItem) -> str:
    return f"""
    <section class="fa-panel fa-panel--watch">
        <div class="fa-panel-top"><span>{_as_text(item.label)}</span><span>RLCS</span></div>
        <h2>{_as_text(item.title)}</h2>
        <p>{_as_text(item.body)}</p>
        {_chips(item)}
        <div class="fa-actions">{_button(item.url, "Open latest RL Esports news")}</div>
    </section>
    """


def _guess_pro_panel(item: FlyerItem) -> str:
    clues = item.data.get("clues", [])
    first = clues[0] if clues else "No clue loaded."
    answer = f'{item.data.get("name", "")} — {item.data.get("role", "")}'
    return f"""
    <section class="fa-game fa-game--pro" data-fa-pro-answer="{_attr(answer)}" data-fa-pro-clues="{_json_attr(clues)}">
        <div class="fa-panel-top"><span>{_as_text(item.label)}</span><span>Guess</span></div>
        <h2>{_as_text(item.title)}</h2>
        <p>{_as_text(item.body)}</p>
        <div class="fa-clue">Clue 1: {_as_text(first)}</div>
        <div class="fa-actions">
            <button class="fa-button" type="button" data-fa-action="next-clue">Next clue</button>
            <button class="fa-button fa-button--ghost" type="button" data-fa-action="reveal-pro">Reveal</button>
        </div>
        <div class="fa-answer" hidden>{_as_text(answer)}</div>
    </section>
    """


def _jiporady_panel(item: FlyerItem) -> str:
    active = item.data.get("active_pack", {})
    packs = item.data.get("packs", [])
    return f"""
    <section class="fa-game fa-game--jiporady" data-fa-jiporady="{_json_attr(packs)}">
        <div class="fa-panel-top"><span>{_as_text(item.label)}</span><span>Board</span></div>
        <h2>{_as_text(item.title)}</h2>
        <p>{_as_text(item.body)}</p>
        <div class="fa-pack">
            <span>{_as_text(active.get("name", ""))}</span>
            <strong>{_as_text(active.get("sample_question", ""))}</strong>
            <em hidden>{_as_text(active.get("sample_answer", ""))}</em>
        </div>
        <div class="fa-actions">
            <button class="fa-button" type="button" data-fa-action="next-pack">Switch pack</button>
            <button class="fa-button fa-button--ghost" type="button" data-fa-action="reveal-pack">Reveal answer</button>
            {_button(item.url, "Jiporady source", "ghost")}
        </div>
    </section>
    """


def render_f9_arena(experience: FlyerExperience) -> str:
    lead = experience.lead
    sections = {item.kind: item for item in experience.sections}
    tournament = sections.get("tournament")
    watch = sections.get("watch")
    garage = sections.get("garage")
    arena = sections.get("arena")
    warmup = sections.get("warmup")
    house_rule = sections.get("house_rule")
    fun_fact = sections.get("fun_fact")

    guess_pro = _find(experience.actions, "guess_pro")
    jiporady = _find(experience.actions, "jiporady")

    logo_url = str(experience.data.get("logo_url", "") or "")
    stadium_url = str(experience.data.get("stadium_url", "") or "")
    boost = int(lead.data.get("boost", 66))
    kickoff_call = str(lead.data.get("kickoff_call", "LEFT GOES"))
    playlist = str(lead.data.get("playlist", "2v2"))
    lanes = experience.data.get("lanes", [])

    lane_html = "".join(
        f'<article><span>{_as_text(lane.get("label", ""))}</span><strong>{_as_text(lane.get("value", ""))}</strong></article>'
        for lane in lanes
    )

    css = """
    :root {
        --fa-bg: #05070c;
        --fa-ink: #fff8ee;
        --fa-muted: #c6d0dc;
        --fa-faint: #8492a6;
        --fa-panel: rgba(8, 13, 23, 0.78);
        --fa-panel-strong: rgba(15, 22, 36, 0.90);
        --fa-line: rgba(255, 255, 255, 0.13);
        --fa-orange: #ff8a3d;
        --fa-orange-deep: #e15b3e;
        --fa-blue: #59e0ff;
        --fa-blue-deep: #2678ff;
        --fa-green: #7dff9b;
        --fa-gold: #e1b53e;
        --fa-shadow: 0 28px 90px rgba(0, 0, 0, 0.46);
    }

    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--fa-bg); }
    body {
        min-height: 100%;
        margin: 0;
        color: var(--fa-ink);
        background:
            radial-gradient(circle at 12% 12%, rgba(255, 138, 61, .22), transparent 25rem),
            radial-gradient(circle at 88% 10%, rgba(89, 224, 255, .16), transparent 25rem),
            linear-gradient(180deg, #081018 0%, #05070c 72%);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow-x: hidden;
    }

    a { color: inherit; }

    .fa-page {
        position: relative;
        isolation: isolate;
        min-height: 100vh;
        width: min(1360px, calc(100vw - 24px));
        margin: 0 auto;
        padding: 16px 0 40px;
    }

    .fa-page::before {
        content: "";
        position: fixed;
        inset: -4%;
        z-index: -3;
        background:
            linear-gradient(180deg, rgba(5, 7, 12, .42), rgba(5, 7, 12, .92)),
            var(--fa-stadium) center / cover no-repeat;
        filter: saturate(1.1) contrast(1.05) brightness(.52);
        transform: scale(1.03);
        opacity: .72;
    }

    .fa-page::after {
        content: "";
        position: fixed;
        inset: 0;
        z-index: -2;
        background:
            linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
        background-size: 46px 46px;
        mask-image: linear-gradient(180deg, transparent, #000 14%, #000 82%, transparent);
        transform: perspective(900px) rotateX(62deg) translateY(24%);
        transform-origin: center bottom;
        opacity: .36;
        pointer-events: none;
    }

    .fa-scoreboard {
        position: sticky;
        top: 12px;
        z-index: 10;
        display: grid;
        grid-template-columns: 1fr minmax(220px, 360px) 1fr;
        border: 1px solid var(--fa-line);
        border-radius: 24px;
        overflow: hidden;
        background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)), rgba(5,7,12,.78);
        box-shadow: 0 16px 52px rgba(0,0,0,.38);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
    }

    .fa-team, .fa-clock {
        min-height: 82px;
        display: grid;
        place-items: center;
        text-align: center;
        padding: .75rem 1rem;
        font-family: Rajdhani, Inter, sans-serif;
        text-transform: uppercase;
    }

    .fa-team span, .fa-date, .fa-kicker, .fa-panel-top, .fa-label, .fa-hud span, .fa-lanes span {
        font-family: Rajdhani, Inter, sans-serif;
        letter-spacing: .16em;
        text-transform: uppercase;
        font-weight: 700;
    }

    .fa-team span { color: var(--fa-faint); font-size: .78rem; }
    .fa-team strong { display: block; font-size: clamp(2rem, 4vw, 3.5rem); line-height: .85; letter-spacing: -.04em; }
    .fa-team--orange { background: linear-gradient(90deg, rgba(255,138,61,.28), transparent); }
    .fa-team--blue { background: linear-gradient(270deg, rgba(38,120,255,.26), transparent); }
    .fa-clock { border-inline: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.035); }
    .fa-clock img { width: 62px; height: auto; filter: drop-shadow(0 12px 24px rgba(0,0,0,.65)); }
    .fa-time { color: var(--fa-green); font-size: clamp(2.4rem, 5vw, 4.4rem); line-height: .78; font-weight: 700; text-shadow: 0 0 30px rgba(125,255,155,.34); }
    .fa-date { margin-top: .4rem; color: var(--fa-muted); font-size: .72rem; }

    .fa-hero {
        display: grid;
        grid-template-columns: minmax(0, 1.12fr) minmax(320px, .88fr);
        gap: clamp(16px, 4vw, 54px);
        align-items: end;
        min-height: min(650px, calc(100vh - 118px));
        padding: clamp(26px, 6vw, 76px) 0;
    }

    .fa-hero-copy {
        position: relative;
        overflow: hidden;
        padding: clamp(24px, 4vw, 46px);
        border: 1px solid var(--fa-line);
        border-radius: 34px;
        background:
            linear-gradient(145deg, rgba(255,138,61,.17), rgba(38,120,255,.08)),
            linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.025)),
            var(--fa-panel);
        box-shadow: var(--fa-shadow);
    }

    .fa-hero-copy::before {
        content: "";
        position: absolute;
        inset: -50%;
        background: linear-gradient(110deg, transparent 42%, rgba(255,255,255,.12) 49%, transparent 56%);
        transform: translateX(-38%) rotate(8deg);
        animation: fa-sweep 7s ease-in-out infinite;
        pointer-events: none;
    }

    @keyframes fa-sweep {
        0%, 42% { transform: translateX(-55%) rotate(8deg); opacity: 0; }
        56% { opacity: .72; }
        100% { transform: translateX(50%) rotate(8deg); opacity: 0; }
    }

    .fa-hero-copy > * { position: relative; z-index: 1; }
    .fa-kicker { color: var(--fa-green); font-size: .82rem; }
    h1 {
        max-width: 10.5ch;
        margin: .72rem 0 0;
        font-family: Rajdhani, Inter, sans-serif;
        font-size: clamp(3.8rem, 8vw, 8.2rem);
        line-height: .82;
        letter-spacing: -.07em;
        text-shadow: 0 0 34px rgba(255,138,61,.22), 0 0 74px rgba(89,224,255,.12);
    }
    .fa-hero-copy p {
        max-width: 64ch;
        margin: 1.2rem 0 0;
        color: var(--fa-muted);
        font-size: clamp(1rem, 1.25vw, 1.14rem);
        line-height: 1.72;
    }

    .fa-actions, .fa-chips { display: flex; flex-wrap: wrap; gap: .65rem; align-items: center; }
    .fa-actions { margin-top: 1.2rem; }
    .fa-button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 1rem;
        border-radius: 999px;
        border: 1px solid rgba(255,138,61,.36);
        background: linear-gradient(135deg, var(--fa-orange), var(--fa-orange-deep));
        color: #130f0a;
        font: inherit;
        font-weight: 850;
        text-decoration: none;
        cursor: pointer;
        transition: transform .16s ease, filter .16s ease;
    }
    .fa-button:hover { transform: translateY(-1px); filter: brightness(1.08); }
    .fa-button--ghost { color: var(--fa-ink); background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.14); }

    .fa-console { display: grid; gap: 18px; justify-items: center; }
    .fa-boost {
        --boost: 66%;
        width: min(318px, 72vw);
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        border-radius: 999px;
        border: 1px solid var(--fa-line);
        background:
            radial-gradient(circle at center, rgba(5,7,12,.98) 0 52%, transparent 53%),
            conic-gradient(var(--fa-orange) 0 var(--boost), rgba(255,255,255,.11) var(--boost) 100%);
        box-shadow: 0 0 80px rgba(255,138,61,.18), inset 0 0 54px rgba(255,255,255,.045);
        font-family: Rajdhani, Inter, sans-serif;
    }
    .fa-boost strong { display: block; font-size: clamp(4rem, 11vw, 8rem); line-height: .78; }
    .fa-boost span { display: block; color: var(--fa-orange); font-weight: 700; letter-spacing: .18em; text-align: center; }

    .fa-hud-stack { width: 100%; display: grid; gap: 12px; }
    .fa-hud, .fa-panel, .fa-feature, .fa-game, .fa-lanes article {
        border: 1px solid var(--fa-line);
        background: linear-gradient(180deg, rgba(255,255,255,.066), rgba(255,255,255,.024)), var(--fa-panel);
        box-shadow: 0 16px 44px rgba(0,0,0,.24);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
    }
    .fa-hud {
        min-height: 106px;
        display: grid;
        align-content: start;
        gap: .45rem;
        padding: 1rem;
        border-radius: 20px;
    }
    .fa-hud span { color: var(--fa-green); font-size: .72rem; }
    .fa-hud strong { font-family: Rajdhani, Inter, sans-serif; font-size: 1.55rem; line-height: 1; }
    .fa-hud small { color: var(--fa-muted); line-height: 1.5; }

    .fa-primary, .fa-games {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr);
        gap: 18px;
        margin-top: 18px;
    }

    .fa-panel, .fa-game {
        position: relative;
        overflow: hidden;
        min-height: 260px;
        padding: clamp(22px, 3vw, 34px);
        border-radius: 28px;
    }
    .fa-panel--queue { background: radial-gradient(circle at top right, rgba(255,138,61,.18), transparent 30%), linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.026)), rgba(8,13,23,.82); }
    .fa-panel--watch { background: radial-gradient(circle at top left, rgba(89,224,255,.16), transparent 30%), linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.026)), rgba(8,13,23,.82); }

    .fa-panel-top {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        color: var(--fa-green);
        font-size: .78rem;
    }
    .fa-panel h2, .fa-game h2 {
        margin: .7rem 0 0;
        font-family: Rajdhani, Inter, sans-serif;
        font-size: clamp(2rem, 4vw, 3.4rem);
        line-height: .94;
        letter-spacing: -.04em;
    }
    .fa-panel p, .fa-game p, .fa-feature p { color: var(--fa-muted); line-height: 1.68; }
    .fa-chips { margin-top: 1rem; }
    .fa-chips span {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 .72rem;
        border-radius: 999px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.11);
        color: var(--fa-ink);
        font-size: .76rem;
        font-weight: 780;
    }

    .fa-roster, .fa-clue, .fa-pack, .fa-answer {
        margin-top: 1rem;
        padding: .9rem 1rem;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.055);
    }
    .fa-roster { display: grid; gap: .25rem; color: var(--fa-muted); }
    .fa-roster span { color: var(--fa-green); font-family: Rajdhani, Inter, sans-serif; letter-spacing: .16em; text-transform: uppercase; font-weight: 700; font-size: .74rem; }

    .fa-lanes {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 18px;
    }
    .fa-lanes article {
        min-height: 112px;
        padding: 1rem;
        border-radius: 20px;
    }
    .fa-lanes span { color: var(--fa-green); font-size: .72rem; }
    .fa-lanes strong { display: block; margin-top: .45rem; font-family: Rajdhani, Inter, sans-serif; font-size: 1.42rem; line-height: 1; }

    .fa-wall {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 14px;
        margin-top: 18px;
    }
    .fa-feature {
        min-height: 242px;
        padding: 1rem;
        border-radius: 22px;
        overflow: hidden;
        transform: skewY(-1.2deg);
    }
    .fa-feature > * { transform: skewY(1.2deg); }
    .fa-feature--garage { border-color: rgba(255,138,61,.28); }
    .fa-feature--arena { border-color: rgba(89,224,255,.24); }
    .fa-feature--warmup { border-color: rgba(125,255,155,.24); }
    .fa-feature--house_rule { border-color: rgba(225,181,62,.28); }
    .fa-feature--fun_fact { border-color: rgba(255,255,255,.16); }
    .fa-label { color: var(--fa-green); font-size: .72rem; }
    .fa-feature h3 {
        margin: .65rem 0 0;
        font-family: Rajdhani, Inter, sans-serif;
        font-size: 1.65rem;
        line-height: .98;
        letter-spacing: -.035em;
    }

    .fa-game--pro { background: radial-gradient(circle at top right, rgba(225,181,62,.18), transparent 32%), linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.026)), rgba(8,13,23,.84); }
    .fa-game--jiporady { background: radial-gradient(circle at top left, rgba(89,224,255,.16), transparent 30%), radial-gradient(circle at bottom right, rgba(255,138,61,.14), transparent 30%), linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.026)), rgba(8,13,23,.84); }
    .fa-clue, .fa-pack { display: grid; gap: .5rem; font-weight: 760; }
    .fa-pack span { color: var(--fa-green); font-family: Rajdhani, Inter, sans-serif; letter-spacing: .16em; text-transform: uppercase; font-size: .74rem; }
    .fa-pack em { color: var(--fa-ink); font-style: normal; }

    .fa-footer {
        margin-top: 22px;
        color: var(--fa-faint);
        font-weight: 740;
        text-align: center;
    }

    @media (max-width: 1020px) {
        .fa-scoreboard, .fa-hero, .fa-primary, .fa-games { grid-template-columns: 1fr; }
        .fa-scoreboard { position: relative; top: 0; }
        .fa-team { display: none; }
        .fa-clock { border-inline: 0; }
        .fa-lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .fa-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .fa-hero { min-height: auto; }
    }

    @media (max-width: 640px) {
        .fa-page { width: min(100vw - 16px, 1360px); padding-top: 8px; }
        h1 { font-size: clamp(3.2rem, 19vw, 5rem); }
        .fa-hero-copy, .fa-panel, .fa-game { border-radius: 22px; }
        .fa-lanes, .fa-wall { grid-template-columns: 1fr; }
        .fa-feature, .fa-feature > * { transform: none; }
    }

    @media (prefers-reduced-motion: reduce) {
        .fa-hero-copy::before { animation: none; }
    }
    """

    js = """
    (function () {
        document.querySelectorAll("[data-fa-roster-url]").forEach(function (root) {
            var rosterUrl = root.getAttribute("data-fa-roster-url");
            if (!rosterUrl) return;

            fetch(rosterUrl, { cache: "no-store" })
                .then(function (response) { return response.ok ? response.json() : null; })
                .then(function (payload) {
                    if (!payload) return;
                    var entries = Array.isArray(payload.entries) ? payload.entries : [];
                    var status = payload.signups_open ? "open" : "closed";
                    root.innerHTML = "<span>Roster</span><strong>" + entries.length + " registered • signups " + status + "</strong>";
                })
                .catch(function () {
                    root.innerHTML = "<span>Roster</span><strong>Roster feed configured, but unavailable.</strong>";
                });
        });

        document.querySelectorAll("[data-fa-pro-clues]").forEach(function (root) {
            var clues = [];
            try { clues = JSON.parse(root.getAttribute("data-fa-pro-clues") || "[]"); } catch (err) { clues = []; }
            var clueEl = root.querySelector(".fa-clue");
            var answerEl = root.querySelector(".fa-answer");
            var nextBtn = root.querySelector("[data-fa-action='next-clue']");
            var revealBtn = root.querySelector("[data-fa-action='reveal-pro']");
            var index = 0;

            if (nextBtn) {
                nextBtn.addEventListener("click", function () {
                    index = Math.min(index + 1, Math.max(clues.length - 1, 0));
                    if (clueEl) clueEl.textContent = "Clue " + (index + 1) + ": " + (clues[index] || "");
                });
            }
            if (revealBtn) {
                revealBtn.addEventListener("click", function () {
                    if (answerEl) answerEl.hidden = false;
                });
            }
        });

        document.querySelectorAll("[data-fa-jiporady]").forEach(function (root) {
            var packs = [];
            try { packs = JSON.parse(root.getAttribute("data-fa-jiporady") || "[]"); } catch (err) { packs = []; }
            if (!packs.length) return;

            var index = 0;
            var nameEl = root.querySelector(".fa-pack span");
            var clueEl = root.querySelector(".fa-pack strong");
            var answerEl = root.querySelector(".fa-pack em");
            var nextBtn = root.querySelector("[data-fa-action='next-pack']");
            var revealBtn = root.querySelector("[data-fa-action='reveal-pack']");

            function renderPack() {
                var pack = packs[index % packs.length] || {};
                if (nameEl) nameEl.textContent = pack.name || "";
                if (clueEl) clueEl.textContent = pack.sample_question || "";
                if (answerEl) {
                    answerEl.textContent = pack.sample_answer || "";
                    answerEl.hidden = true;
                }
            }

            if (nextBtn) {
                nextBtn.addEventListener("click", function () {
                    index = (index + 1) % packs.length;
                    renderPack();
                });
            }
            if (revealBtn) {
                revealBtn.addEventListener("click", function () {
                    if (answerEl) answerEl.hidden = false;
                });
            }
        });
    })();
    """

    wall_items = [item for item in [garage, arena, warmup, house_rule, fun_fact] if item is not None]
    wall_html = "".join(_feature_card(item) for item in wall_items)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{_as_text(experience.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
<style>{css}</style>
</head>
<body>
<main class="fa-page" style="--fa-stadium: url('{_attr(stadium_url)}')">
    <header class="fa-scoreboard">
        <section class="fa-team fa-team--orange"><div><span>Orange</span><strong>F9</strong></div></section>
        <section class="fa-clock">
            <div>
                <img src="{_attr(logo_url)}" alt="F9 logo" loading="lazy">
                <div class="fa-time">5:00</div>
                <div class="fa-date">{_as_text(experience.date_label)}</div>
            </div>
        </section>
        <section class="fa-team fa-team--blue"><div><span>Blue</span><strong>Daily</strong></div></section>
    </header>

    <section class="fa-hero">
        <div class="fa-hero-copy">
            <div class="fa-kicker">{_as_text(lead.label)}</div>
            <h1>{_as_text(lead.title)}</h1>
            <p>{_as_text(lead.body)}</p>
            <div class="fa-actions">
                {_button(str(experience.data.get("tournament_url", "")), "Signup hub")}
                {_button(str(experience.data.get("rl_esports_news_url", "")), "RLCS news", "ghost")}
                {_button(str(experience.data.get("jiporady_repo_url", "")), "Jiporady source", "ghost")}
            </div>
        </div>

        <aside class="fa-console">
            <div class="fa-boost" style="--boost:{boost}%"><div><strong>{boost}</strong><span>BOOST</span></div></div>
            <div class="fa-hud-stack">
                {_hud("Kickoff call", kickoff_call)}
                {_hud("Playlist", playlist)}
                {_hud("Renderer", "F9 Arena", "Flyer Engine v2")}
            </div>
        </aside>
    </section>

    <section class="fa-lanes">{lane_html}</section>

    <section class="fa-primary">
        {_tournament_panel(tournament) if tournament else ""}
        {_watch_panel(watch) if watch else ""}
    </section>

    <section class="fa-wall">{wall_html}</section>

    <section class="fa-games">
        {_guess_pro_panel(guess_pro) if guess_pro else ""}
        {_jiporady_panel(jiporady) if jiporady else ""}
    </section>

    <footer class="fa-footer">{_as_text(experience.footer)}</footer>
</main>
<script>{js}</script>
</body>
</html>"""
