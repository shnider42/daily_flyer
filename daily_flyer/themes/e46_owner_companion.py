from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "e46_owner_companion"

THEME_CONFIG = {
    "page_title": "E46 Owner Companion — 2004 BMW 330Ci",
    "header_title": "E46 OWNER COMPANION",
    "header_subtitle": (
        "One place to get this 2004 BMW 330Ci running, understand what failed, plan the repair, "
        "and turn an old BMW into a dependable daily driver."
    ),
    "footer_text": (
        "Unofficial owner-built troubleshooting companion for a 2004 BMW E46 330Ci. "
        "Verify repair procedures, torque specifications, fluids, and part fitment against BMW technical information "
        "or a trusted repair manual before working on the car."
    ),
    "hero_kicker": "2004 BMW 330Ci // E46 // M54B30",
    "hero_summary_pill": "Current mission: diagnose first • repair correctly • build a reliable daily driver",
}


VEHICLE = {
    "year": "2004",
    "model": "BMW 330Ci",
    "chassis": "E46 coupe",
    "engine": "M54B30 3.0L inline-six",
    "mission": "Return the car to service, then establish a known maintenance baseline.",
    "unknowns": "Mileage, transmission, fault codes, recent repairs, and the exact current symptom still need to be recorded.",
}


TRIAGE_PATHS = [
    {
        "key": "overheat",
        "label": "Overheating / temperature rising",
        "headline": "Treat overheating as a stop-driving problem",
        "body": (
            "Shut the engine down before the temperature continues climbing. Let it cool completely and never open the "
            "cooling system while hot. Start with visible coolant loss, belt condition, expansion-tank and hose connections, "
            "then verify circulation and the water-pump / thermostat side of the system."
        ),
    },
    {
        "key": "coolant",
        "label": "Coolant leak / low coolant",
        "headline": "Find where the cooling system is losing pressure or coolant",
        "body": (
            "With the engine cold, inspect the expansion tank and cap area, upper and lower radiator hose connections, "
            "radiator necks, thermostat housing area, water-pump area, and evidence of dried coolant. A pressure test is often "
            "more useful than replacing the first wet-looking part."
        ),
    },
    {
        "key": "oil",
        "label": "Oil leak / burning-oil smell",
        "headline": "Separate top-of-engine leaks from front-of-engine leaks",
        "body": (
            "Inspect the valve-cover perimeter and spark-plug wells first, then look lower at the oil-filter-housing area. "
            "Oil reaching hot exhaust components can create a burning smell or smoke, so identify the highest fresh wet point "
            "instead of assuming every visible drip is the source."
        ),
    },
    {
        "key": "nostart",
        "label": "Cranks / will not start",
        "headline": "Do not force a cooling-system answer onto a no-start symptom",
        "body": (
            "Record exactly what happens: no crank, slow crank, normal crank with no start, starts then dies, warning lights, "
            "and stored fault codes. Battery voltage, fuel, spark, air, immobilizer behavior, and engine-management faults belong "
            "to a different diagnostic tree than hoses or gaskets."
        ),
    },
]


ISSUES = [
    {
        "card_type": "e46_cooling",
        "eyebrow": "COMMON FAILURE FAMILY // HIGH PRIORITY",
        "title": "Cooling System: Treat It as a System",
        "body": (
            "The E46 cooling system has several aging plastic and wear components living in the same environment. "
            "A leak at one component does not prove the rest are healthy. For a car with unknown service history, document the "
            "age/condition of the expansion tank, cap, upper and lower hoses, radiator, thermostat, water pump, belts, and pulleys."
        ),
        "checks": "Cold visual inspection • pressure test if available • belt/pulley inspection • confirm service history",
        "while_in_there": "If the system must be drained, inspect adjacent hoses, thermostat, expansion tank, pump, belts, and pulleys before refilling.",
    },
    {
        "card_type": "e46_water_pump",
        "eyebrow": "COMMON ISSUE // COOLING",
        "title": "Water Pump",
        "body": (
            "A failing pump can leak, develop bearing play/noise, or stop circulating coolant effectively. "
            "Do not diagnose it from the word 'overheating' alone: inspect for leakage around the pump, pulley play/noise, "
            "belt condition, and other cooling-system faults before condemning it."
        ),
        "checks": "Leak evidence near pump • pulley play/noise • belt drive condition • overheating pattern",
        "while_in_there": "Thermostat, belts, tensioner/idler condition, nearby hoses, and the rest of the cooling-system baseline.",
    },
    {
        "card_type": "e46_vcg",
        "eyebrow": "COMMON ISSUE // OIL LEAK",
        "title": "Valve Cover Gasket",
        "body": (
            "Age and heat can harden the valve-cover gasket and sealing grommets. Typical clues include fresh oil around the "
            "cover perimeter, oil in spark-plug wells, or oil reaching the exhaust side and creating a burning smell. "
            "Verify the leak from the highest wet point before ordering parts."
        ),
        "checks": "Cover perimeter • spark-plug wells • rear of cylinder head • fresh oil above lower leaks",
        "while_in_there": "Inspect the valve cover itself, ignition coils/boots, spark plugs, crankcase-ventilation hoses, and obvious vacuum-hose deterioration.",
    },
]


RELIABILITY_BASELINE = [
    ("Safety first", "Tires, brakes, steering/suspension play, exterior lights, wipers, leaks near hot parts, and anything affecting safe control of the car."),
    ("Keep the engine alive", "Cooling-system integrity, correct oil level, belts/pulleys, fluid leaks, warning lights, and stored fault codes."),
    ("Establish known fluids", "Engine oil plus documented condition/history for coolant, brake fluid, transmission fluid, differential fluid, and power steering fluid."),
    ("Catch E46 age items", "Cooling plastics, rubber hoses, bushings, engine mounts, vacuum leaks, CCV/DISA condition, oil leaks, window regulators, and other age-related wear."),
    ("Record everything", "Date, mileage, symptom, diagnosis, parts used, brand/part number, fluid used, torque/source reference, and next inspection interval."),
]


SOURCE_LAYERS = [
    ("Primary / fitment", "BMW technical information, VIN-specific parts information, and RealOEM-style diagrams for part relationships and fitment."),
    ("Repair procedure", "A trusted E46 repair manual or reputable BMW specialist procedure for sequence, torque values, fluids, and cautions."),
    ("Community evidence", "E46Fanatics, Bimmerforums, owner write-ups, and videos are excellent for patterns and practical tips, but should not be the sole authority for a critical specification."),
    ("This companion", "Use the site to connect symptoms, likely causes, tests, repair plans, maintenance history, and sources into one workflow."),
]


EXTRA_CSS = r"""
:root{--bg:#0b0d10;--bg-deep:#07080a;--bg-soft:#12161b;--card:#f2f4f6;--card-strong:#ffffff;--border:#222831;--border-strong:#11151a;--ink:#14181d;--ink-soft:#343b44;--muted:#65707d;--irish-green:#1c69d4;--gold:#7da7df;--teal:#3f7ecf;--blue:#1c69d4;--radius-xl:18px;--radius-lg:14px;--radius-md:10px;--max-width:1280px}
html{background:#0b0d10}body{color:#e9edf2;background:radial-gradient(circle at 86% 8%,rgba(28,105,212,.22),transparent 26%),linear-gradient(180deg,#0b0d10,#11161d 58%,#0a0d11);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body::before{width:560px;height:560px;top:-260px;left:-180px;background:conic-gradient(from 45deg,rgba(28,105,212,.12),transparent 20%,rgba(255,255,255,.03),transparent 50%,rgba(28,105,212,.08));filter:blur(3px)}
.hero-wrap{padding-top:24px}header.hero{min-height:330px;padding:36px clamp(22px,5vw,64px);border:1px solid rgba(255,255,255,.14);color:#f7f9fb;background:linear-gradient(115deg,rgba(14,18,23,.96),rgba(26,34,44,.95));box-shadow:0 28px 70px rgba(0,0,0,.35);overflow:hidden}header.hero::before{opacity:1;background:linear-gradient(90deg,#1c69d4 0 9px,transparent 9px 20px,#f5f7fa 20px 29px,transparent 29px 40px,#59a7e8 40px 49px,transparent 49px);width:58px;right:34px;left:auto}header.hero::after{content:"DAILY DRIVER RECOVERY";position:absolute;right:clamp(24px,5vw,64px);bottom:30px;color:rgba(255,255,255,.16);font-size:clamp(1.1rem,3vw,2.8rem);font-weight:900;letter-spacing:.14em}.hero-kicker,.hero-pill{position:relative;z-index:2}.hero h1{position:relative;z-index:2;max-width:11ch;font-size:clamp(3rem,8vw,6.7rem);line-height:.86;letter-spacing:-.05em}.hero .subtitle{position:relative;z-index:2;max-width:72ch;color:#c8d0da}.hero-meta{position:relative;z-index:2}
main{gap:18px;padding-top:26px}.card{grid-column:span 4;min-height:250px;padding:1.2rem;border:1px solid #d7dce2;color:#14181d;background:linear-gradient(180deg,#fff,#eef1f4);box-shadow:0 16px 36px rgba(0,0,0,.23)}.card:hover{transform:translateY(-2px)}.card--e46_triage{grid-column:span 12;min-height:0;background:linear-gradient(135deg,#f8fbff,#e8f1fc)}.card--e46_vehicle{grid-column:span 5}.card--e46_status{grid-column:span 7;background:linear-gradient(135deg,#171d25,#202a36);color:#f5f7fa;border-color:#354352}.card--e46_status h2,.card--e46_status .body,.card--e46_status .body strong{color:#f5f7fa}.card--e46_status .eyebrow{color:#80b8ff}.card--e46_cooling{grid-column:span 12}.card--e46_water_pump,.card--e46_vcg{grid-column:span 6}.card--e46_baseline,.card--e46_sources{grid-column:span 6}.card-head{border-bottom:1px solid #cbd2da}.eyebrow{color:#1c69d4;font-weight:850;letter-spacing:.12em}h2{color:#11161c;letter-spacing:-.025em}.body{color:#353d46;line-height:1.65}.body strong{color:#12171d}.source{border-top:1px solid #d3d8de}a{color:#145bb8}
.e46-grid{display:grid;grid-template-columns:minmax(135px,.34fr) 1fr;gap:.65rem 1rem}.e46-label{font-size:.74rem;font-weight:850;letter-spacing:.09em;text-transform:uppercase;color:#647180}.e46-value{color:#222a33}.e46-callout{margin-top:1rem;padding:.8rem .9rem;border-left:5px solid #1c69d4;background:rgba(28,105,212,.08)}.e46-warning{border-left-color:#b53b32;background:rgba(181,59,50,.08)}
.e46-symptoms{display:flex;flex-wrap:wrap;gap:.55rem;margin:.85rem 0 1rem}.e46-symptom{appearance:none;border:1px solid #b9c4d0;border-radius:999px;padding:.62rem .86rem;background:#fff;color:#1a222b;font:inherit;font-weight:760;cursor:pointer}.e46-symptom:hover,.e46-symptom[aria-pressed="true"]{border-color:#1c69d4;background:#1c69d4;color:#fff}.e46-path{display:none;padding:1rem;border:1px solid #ccd4dd;border-radius:12px;background:rgba(255,255,255,.72)}.e46-path.is-active{display:block}.e46-path h3{margin:0 0 .45rem;color:#141a20;font-size:1.12rem}.e46-path p{margin:0}.e46-list{display:grid;gap:.7rem;margin-top:.8rem}.e46-list-row{padding:.75rem .82rem;border:1px solid #d3d9df;border-radius:10px;background:rgba(255,255,255,.66)}.e46-list-row strong{display:block;margin-bottom:.2rem;color:#151b22}.e46-source-layer{display:grid;gap:.25rem;margin-bottom:.72rem}.e46-source-layer strong{color:#151b22}
@media(max-width:980px){.card--e46_vehicle,.card--e46_status,.card--e46_water_pump,.card--e46_vcg,.card--e46_baseline,.card--e46_sources{grid-column:span 12}}
@media(max-width:720px){header.hero{min-height:0;padding:26px 18px}.hero h1{max-width:none;font-size:clamp(2.8rem,15vw,4.8rem)}header.hero::after{display:none}main{grid-template-columns:1fr!important;gap:14px;padding:16px 12px 24px}.card,.card--e46_triage,.card--e46_vehicle,.card--e46_status,.card--e46_cooling,.card--e46_water_pump,.card--e46_vcg,.card--e46_baseline,.card--e46_sources{grid-column:1/-1!important;min-height:0}.e46-grid{grid-template-columns:1fr}.e46-label{margin-top:.35rem}}
"""


EXTRA_JS = r"""
(function(){
  const root=document.querySelector('.card--e46_triage');
  if(!root)return;
  const buttons=[...root.querySelectorAll('.e46-symptom')];
  const paths=[...root.querySelectorAll('.e46-path')];
  const activate=(key)=>{
    buttons.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.key===key)));
    paths.forEach(panel=>panel.classList.toggle('is-active',panel.dataset.key===key));
  };
  buttons.forEach(btn=>btn.addEventListener('click',()=>activate(btn.dataset.key)));
  if(buttons.length)activate(buttons[0].dataset.key);
})();
"""


def _rows(items: list[tuple[str, str]]) -> str:
    return '<div class="e46-grid">' + ''.join(
        f'<div class="e46-label">{escape(label)}</div><div class="e46-value">{escape(value)}</div>'
        for label, value in items
    ) + '</div>'


def _callout(label: str, text: str, warning: bool = False) -> str:
    css = "e46-callout e46-warning" if warning else "e46-callout"
    return f'<div class="{css}"><strong>{escape(label)}:</strong> {escape(text)}</div>'


def _card(card_type: str, eyebrow: str, title: str, body: str, source_url: str | None = None) -> CardItem:
    return CardItem(
        card_type=card_type,
        eyebrow=eyebrow,
        title=title,
        body=body,
        source_url=source_url,
    )


def _build_triage_body() -> str:
    buttons = ''.join(
        f'<button class="e46-symptom" type="button" data-key="{escape(path["key"])}" aria-pressed="false">{escape(path["label"])}</button>'
        for path in TRIAGE_PATHS
    )
    panels = ''.join(
        '<section class="e46-path" data-key="{key}"><h3>{headline}</h3><p>{body}</p></section>'.format(
            key=escape(path["key"]),
            headline=escape(path["headline"]),
            body=escape(path["body"]),
        )
        for path in TRIAGE_PATHS
    )
    return (
        '<p><strong>Start with the symptom, not the famous E46 failure.</strong> Choose the closest description. '
        'The purpose of this first screen is to decide what evidence to gather before buying parts.</p>'
        f'<div class="e46-symptoms" aria-label="Current symptom">{buttons}</div>{panels}'
        + _callout(
            "Next evidence to record",
            "Exact symptom, when it happens, dashboard warnings, fluid levels/leaks, noises, recent work, and BMW-capable scan codes.",
        )
    )


def _build_issue_body(issue: dict[str, str]) -> str:
    return (
        f'<p>{escape(issue["body"])}</p>'
        + _callout("Check before parts", issue["checks"])
        + _callout("While you're in there", issue["while_in_there"])
    )


def _build_baseline_body() -> str:
    rows = ''.join(
        f'<div class="e46-list-row"><strong>{escape(title)}</strong>{escape(body)}</div>'
        for title, body in RELIABILITY_BASELINE
    )
    return '<p>Once the immediate failure is fixed, stop treating each repair as an isolated emergency.</p><div class="e46-list">' + rows + '</div>'


def _build_sources_body() -> str:
    rows = ''.join(
        f'<div class="e46-source-layer"><strong>{escape(title)}</strong><span>{escape(body)}</span></div>'
        for title, body in SOURCE_LAYERS
    )
    return '<p>The long-term goal is aggregation without flattening source quality.</p>' + rows


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    del seed  # This theme is vehicle-state driven rather than randomized.

    vehicle_body = _rows([
        ("Vehicle", f'{VEHICLE["year"]} {VEHICLE["model"]}'),
        ("Chassis", VEHICLE["chassis"]),
        ("Engine", VEHICLE["engine"]),
        ("End state", VEHICLE["mission"]),
        ("Still unknown", VEHICLE["unknowns"]),
    ])

    status_body = (
        '<p><strong>The car is currently out of service.</strong> The first objective is not preventative maintenance; '
        'it is to identify the current failure with enough confidence to repair the correct system.</p>'
        + _callout(
            "Rule for this project",
            "No parts cannon. Every proposed repair should connect symptom → evidence/test → diagnosis → parts/procedure → verification.",
            True,
        )
    )

    cards: list[CardItem] = [
        _card("e46_status", "CURRENT STATE // CAR DOWN", "Get This Car Running First", status_body),
        _card("e46_vehicle", "VEHICLE PROFILE // FIXED CONTEXT", "The Car We're Diagnosing", vehicle_body),
        _card("e46_triage", "START HERE // SYMPTOM-DRIVEN", "What Is the Car Doing?", _build_triage_body()),
    ]

    for issue in ISSUES:
        cards.append(
            _card(
                issue["card_type"],
                issue["eyebrow"],
                issue["title"],
                _build_issue_body(issue),
            )
        )

    cards.extend([
        _card("e46_baseline", "PHASE TWO // DAILY DRIVER", "Build a Known Reliability Baseline", _build_baseline_body()),
        _card("e46_sources", "KNOWLEDGE MODEL // TRUST LAYERS", "One Site, Without One-Source Thinking", _build_sources_body()),
    ])

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": EXTRA_CSS,
            "extra_js": EXTRA_JS,
            "extra_head_html": '<meta name="theme-color" content="#0b0d10">',
        },
    )
