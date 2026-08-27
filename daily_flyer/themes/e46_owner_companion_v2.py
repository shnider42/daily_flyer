from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "e46_owner_companion_v2"

THEME_CONFIG = {
    "page_title": "E46 Owner Companion — 2004 BMW 330Ci",
    "header_title": "E46 OWNER COMPANION",
    "header_subtitle": (
        "A permanent home base for one 2004 BMW 330Ci: troubleshoot problems, learn the car, "
        "find trustworthy technical references, plan maintenance, and explore the E46 platform."
    ),
    "footer_text": (
        "Unofficial owner-built knowledge hub for a 2004 BMW E46 330Ci. "
        "Always verify fitment, torque specifications, fluids, and safety-critical procedures against "
        "VIN-specific BMW information or another authoritative service source."
    ),
    "hero_kicker": "2004 BMW 330Ci // E46 COUPE // M54B30",
    "hero_summary_pill": "Diagnose • Learn • Maintain • Explore",
}


VEHICLE = {
    "year": "2004",
    "model": "BMW 330Ci",
    "chassis": "E46 coupe",
    "engine": "M54B30 3.0L inline-six",
    "purpose": "Keep one aging E46 understandable, repairable, maintainable, and usable as a daily driver.",
    "current_note": "Current condition: not running / diagnosis still being documented.",
    "unknowns": "Mileage, transmission, VIN/production month, fault codes, and complete maintenance history still need to be recorded.",
}


SOURCES = {
    "bmw_tis": {
        "name": "BMW Technical Information System (TIS)",
        "kind": "Factory technical information",
        "url": "https://bmwtechinfo.bmwgroup.com/tisUI/",
        "note": "Use for BMW repair information, service data, bulletins, and VIN-aware technical references. Access may require a subscription.",
    },
    "realoem": {
        "name": "RealOEM — 2004 330Ci Coupe",
        "kind": "Parts catalog / exploded diagrams",
        "url": "https://www.realoem.com/bmw/enUS/partgrp?id=BD53-USA-10-2004-E46-BMW-330Ci",
        "note": "Useful for assemblies, OEM part numbers, and relationships between parts. This link is a 2004 USA coupe catalog; confirm exact production month or VIN before ordering.",
    },
    "charm": {
        "name": "Operation CHARM — 2004 330Ci Coupe M54",
        "kind": "Service-manual index",
        "url": "https://charm.li/BMW/2004/330Ci%20Coupe%20%28E46%29%20L6-3.0L%20%28M54%29/",
        "note": "A vehicle-specific service-manual index with repair/diagnosis categories, specifications, maintenance information, and diagrams.",
    },
    "bimmerforums": {
        "name": "Bimmerforums — E46",
        "kind": "Community experience / DIY",
        "url": "https://www.bimmerforums.com/forum/forumdisplay.php?15-1999-2006-%28E46%29",
        "note": "Useful for failure patterns, practical experience, and DIY discussion. Treat community posts as evidence to verify, not as the authority for critical specifications.",
    },
}


TRIAGE_PATHS = [
    {
        "key": "overheat",
        "label": "Overheating",
        "headline": "Temperature rising / overheating",
        "body": (
            "Treat an active overheat as a stop-driving condition. Once cold, start with coolant level and visible leakage, "
            "belt drive condition, expansion-tank and hose connections, then move toward circulation, thermostat, pump, fan, "
            "and pressure-testing evidence instead of guessing from one symptom."
        ),
    },
    {
        "key": "coolant",
        "label": "Coolant loss",
        "headline": "Coolant leak / low coolant",
        "body": (
            "Inspect the expansion tank and cap area, radiator and hose connections, thermostat housing area, water-pump area, "
            "and evidence of dried coolant. A cold pressure test can turn a vague 'E46 cooling problem' into a specific leak."
        ),
    },
    {
        "key": "oil",
        "label": "Oil leak",
        "headline": "Oil leak / burning-oil smell",
        "body": (
            "Find the highest fresh wet point. On the M54, the valve-cover area and oil-filter-housing area deserve attention, "
            "but the diagnosis should follow the evidence. Oil reaching hot exhaust components can create smoke or a burning smell."
        ),
    },
    {
        "key": "nostart",
        "label": "No start",
        "headline": "Crank / no-start / electrical start problem",
        "body": (
            "First separate no-crank, slow-crank, normal-crank/no-start, and starts-then-dies behavior. Record battery voltage, "
            "warning lights, recent work, and BMW-capable scan codes before choosing a fuel, spark, air, sensor, or immobilizer path."
        ),
    },
]


ISSUES = [
    {
        "card_type": "e46_cooling",
        "eyebrow": "SYSTEM GUIDE // COOLING",
        "title": "Cooling System",
        "body": (
            "Think of cooling as a connected system rather than a list of famous E46 parts. Aging plastic, rubber, bearings, "
            "seals, the thermostat, pump, radiator, expansion tank, fan system, belts, and pulleys can all affect the same symptom."
        ),
        "checks": "Cold visual inspection • pressure test • belt/pulley condition • fan operation • service history • scan data when useful",
        "while_in_there": "When the system is drained, inspect the neighboring hoses, tank, thermostat, pump, belts, pulleys, radiator connections, and bleeder hardware.",
        "sources": ("charm", "realoem", "bmw_tis"),
    },
    {
        "card_type": "e46_water_pump",
        "eyebrow": "COMPONENT GUIDE // COOLING",
        "title": "Water Pump",
        "body": (
            "A water pump can leak, develop bearing play or noise, or fail to circulate coolant correctly. Overheating alone is "
            "not enough to condemn it; compare pump evidence with thermostat, belt-drive, fan, leak, and bleeding/air-pocket evidence."
        ),
        "checks": "Leak evidence near pump • pulley play/noise • belt drive • overheating pattern • cooling-system leak/bleed history",
        "while_in_there": "Thermostat, belts, tensioner/idler condition, nearby hoses, expansion tank condition, and the rest of the cooling baseline.",
        "sources": ("charm", "realoem"),
    },
    {
        "card_type": "e46_vcg",
        "eyebrow": "COMPONENT GUIDE // OIL LEAK",
        "title": "Valve Cover & Gasket",
        "body": (
            "Heat and age can harden sealing material, and the cover itself should not automatically be assumed healthy. "
            "Look for fresh oil around the perimeter, rear of the head, and spark-plug wells, then distinguish that leak from oil coming from lower areas."
        ),
        "checks": "Cover perimeter • plug wells • rear of cylinder head • fresh oil path • nearby vacuum/CCV deterioration",
        "while_in_there": "Inspect the cover, coils/boots, spark plugs, accessible CCV/vacuum hoses, and anything obviously brittle or oil-soaked.",
        "sources": ("charm", "realoem", "bmw_tis"),
    },
]


RELIABILITY_BASELINE = [
    ("Safety", "Tires, brakes, steering/suspension play, lights, wipers, seat belts, and any leak or defect that affects safe control."),
    ("Engine survival", "Cooling-system integrity, oil level/condition, belts and pulleys, major leaks, warning lights, and stored fault codes."),
    ("Known fluids", "Document engine oil, coolant, brake fluid, transmission fluid, differential fluid, and power-steering fluid condition/history."),
    ("E46 age items", "Cooling plastics, hoses, bushings, mounts, vacuum leaks, CCV/DISA condition, oil leaks, window regulators, and electrical wear."),
    ("Ownership record", "Date, mileage, symptom, test, diagnosis, part numbers, brands, fluids, source references, and next inspection interval."),
]


EXTRA_CSS = r"""
:root{--bg:#171714;--bg-deep:#0d0e0d;--bg-soft:#20211e;--card:#f2efe7;--card-strong:#fbfaf6;--border:#252824;--border-strong:#101210;--ink:#181b18;--ink-soft:#41463f;--muted:#737b71;--irish-green:#1a5fa8;--gold:#d9b45f;--teal:#65a9dd;--blue:#1a5fa8;--radius-xl:3px;--radius-lg:3px;--radius-md:2px;--max-width:1320px}
html{background:#111310}body{color:#e8e7df;background:linear-gradient(rgba(13,15,13,.88),rgba(13,15,13,.96)),repeating-linear-gradient(0deg,transparent 0 47px,rgba(255,255,255,.035) 48px),repeating-linear-gradient(90deg,transparent 0 47px,rgba(255,255,255,.028) 48px),#161814;font-family:"Arial Narrow","Roboto Condensed",Inter,system-ui,sans-serif}
body::before{width:720px;height:720px;top:-360px;left:-300px;opacity:.55;filter:none;background:radial-gradient(circle,rgba(76,150,215,.18),transparent 64%)}body::after{width:520px;height:520px;right:-250px;top:340px;opacity:.38;filter:none;background:radial-gradient(circle,rgba(217,180,95,.13),transparent 65%)}
.hero-wrap{padding-top:18px}header.hero{min-height:310px;padding:34px clamp(22px,5vw,62px) 30px;border:1px solid #4b5049;border-radius:0;color:#f2f2eb;background:linear-gradient(90deg,rgba(255,255,255,.025),transparent 38%),repeating-linear-gradient(90deg,transparent 0 119px,rgba(255,255,255,.025) 120px),#1c201c;box-shadow:12px 12px 0 #0a0b0a;overflow:hidden;backdrop-filter:none}header.hero::before{inset:0 auto 0 0;width:9px;opacity:1;background:linear-gradient(#1c69d4 0 34%,#f3f3ef 34% 66%,#6ab2e5 66% 100%)}header.hero::after{content:"E46 / M54B30";position:absolute;right:28px;top:26px;color:#70786e;font:800 clamp(1rem,2.2vw,1.8rem)/1 "Courier New",monospace;letter-spacing:.18em}.hero-kicker{position:relative;z-index:2;border:0;border-radius:0;background:none;padding:0;color:#83b9e3;font:700 .78rem/1.2 "Courier New",monospace;letter-spacing:.14em}.hero h1{position:relative;z-index:2;margin-top:2rem;max-width:14ch;color:#f4f3ec;font:900 clamp(3rem,7.5vw,6.4rem)/.82 "Arial Narrow","Roboto Condensed",sans-serif;letter-spacing:-.045em;text-transform:uppercase}.hero .subtitle{position:relative;z-index:2;max-width:72ch;margin-top:1.25rem;padding-top:1rem;border-top:1px solid #596057;color:#c7ccc4;font-size:1rem}.hero-meta{position:relative;z-index:2}.hero-meta .hero-pill:first-child{display:none}.hero-pill{border-radius:0;background:#282d27;border:1px solid #4b5349;color:#e9e9e2;font:700 .82rem/1 "Courier New",monospace;letter-spacing:.05em}
main{gap:14px;padding-top:24px}.card{grid-column:span 4;min-height:230px;padding:1.15rem;border:1px solid #a7aaa3;border-radius:0;color:#181b18;background:repeating-linear-gradient(0deg,transparent 0 27px,rgba(30,35,29,.035) 28px),#f0eee6;box-shadow:7px 7px 0 rgba(0,0,0,.36);backdrop-filter:none;transition:transform 120ms ease,box-shadow 120ms ease}.card::before{display:none}.card::after{height:3px;background:#1a5fa8}.card:hover{transform:translate(-2px,-2px);box-shadow:10px 10px 0 rgba(0,0,0,.4)}.card-head{padding-bottom:.75rem;border-bottom:1px solid #9da29a}.eyebrow{color:#59665a;font:800 .72rem/1.2 "Courier New",monospace;letter-spacing:.12em}h2{margin-top:.25rem;color:#151815;font:900 clamp(1.35rem,2.4vw,2rem)/.96 "Arial Narrow","Roboto Condensed",sans-serif;letter-spacing:-.02em;text-transform:uppercase}.icon-badge{width:48px;height:40px;border-radius:0;border:1px solid #7f877d;background:#deddd5;color:transparent;font-size:0}.icon-badge::before{color:#293029;font:800 .68rem/1 "Courier New",monospace;letter-spacing:.06em}.card--e46_explore .icon-badge::before{content:"IDX"}.card--e46_vehicle .icon-badge::before{content:"VIN"}.card--e46_triage .icon-badge::before{content:"DX"}.card--e46_cooling .icon-badge::before{content:"17"}.card--e46_water_pump .icon-badge::before{content:"WP"}.card--e46_vcg .icon-badge::before{content:"VC"}.card--e46_baseline .icon-badge::before{content:"PM"}.card--e46_sources .icon-badge::before{content:"SRC"}.body{color:#3e463d;line-height:1.58}.body strong,.body b{color:#151815}.source{border-top:1px solid #afb2ab}a{color:#145b9f;text-decoration:underline;text-underline-offset:2px}
.card--e46_explore{grid-column:span 12;min-height:0;background:#ddd9cc;border-color:#8c9088}.card--e46_vehicle{grid-column:span 4}.card--e46_triage{grid-column:span 8;min-height:0;background:#f5f2e8}.card--e46_cooling{grid-column:span 12}.card--e46_water_pump,.card--e46_vcg{grid-column:span 6}.card--e46_baseline{grid-column:span 5}.card--e46_sources{grid-column:span 7;background:#e7e4d9}
.e46-grid{display:grid;grid-template-columns:minmax(128px,.32fr) 1fr;gap:.58rem .9rem}.e46-label{font:800 .68rem/1.25 "Courier New",monospace;letter-spacing:.08em;text-transform:uppercase;color:#687166}.e46-value{color:#252b25}.e46-current-note{margin-top:.85rem;padding:.7rem;border:1px dashed #858c82;background:rgba(255,255,255,.36);font-size:.9rem}.e46-callout{margin-top:.9rem;padding:.72rem .8rem;border-left:4px solid #1a5fa8;background:rgba(26,95,168,.07)}.e46-warning{border-left-color:#a24c39;background:rgba(162,76,57,.07)}
.e46-search-shell{display:grid;grid-template-columns:1fr auto;gap:.65rem;margin:.95rem 0 .55rem}.e46-search{width:100%;min-height:48px;border:1px solid #777f76;border-radius:0;background:#faf9f3;color:#1c211c;padding:.75rem .85rem;font:700 1rem/1.2 "Courier New",monospace;outline:none}.e46-search:focus{border-color:#1a5fa8;box-shadow:0 0 0 2px rgba(26,95,168,.14)}.e46-search-clear{min-height:48px;padding:0 .95rem;border:1px solid #777f76;border-radius:0;background:#242a24;color:#f0f0e9;font:800 .72rem/1 "Courier New",monospace;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.e46-search-meta{display:flex;justify-content:space-between;gap:1rem;color:#61695f;font-size:.84rem}.e46-search-modes{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.75rem}.e46-mode{border:1px solid #8f958c;padding:.35rem .5rem;background:rgba(255,255,255,.3);font:700 .68rem/1 "Courier New",monospace;text-transform:uppercase;letter-spacing:.07em}
.e46-symptoms{display:flex;flex-wrap:wrap;gap:.45rem;margin:.8rem 0 .9rem}.e46-symptom{appearance:none;border:1px solid #858c82;border-radius:0;padding:.55rem .68rem;background:#e7e4da;color:#222822;font:800 .72rem/1.2 "Courier New",monospace;text-transform:uppercase;cursor:pointer}.e46-symptom:hover,.e46-symptom[aria-pressed="true"]{border-color:#1a5fa8;background:#1a5fa8;color:#fff}.e46-path{display:none;padding:.85rem;border:1px solid #a5aaa2;background:rgba(255,255,255,.45)}.e46-path.is-active{display:block}.e46-path h3{margin:0 0 .4rem;color:#171b17;font-size:1.08rem}.e46-path p{margin:0}
.e46-list{display:grid;gap:.55rem;margin-top:.75rem}.e46-list-row{padding:.65rem .7rem;border:1px solid #b5b8b1;background:rgba(255,255,255,.34)}.e46-list-row strong{display:block;margin-bottom:.18rem;color:#181c18}.e46-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;margin-top:.8rem}.e46-source{padding:.72rem;border:1px solid #a8aca4;background:rgba(255,255,255,.34)}.e46-source-type{display:block;margin-bottom:.25rem;color:#667065;font:800 .66rem/1.2 "Courier New",monospace;text-transform:uppercase;letter-spacing:.08em}.e46-source a{font-weight:850}.e46-source p{margin:.4rem 0 0;font-size:.88rem;line-height:1.45}.e46-source-links{display:flex;flex-wrap:wrap;gap:.38rem;margin-top:.78rem}.e46-source-link{display:inline-flex;padding:.38rem .5rem;border:1px solid #9aa096;background:rgba(255,255,255,.32);font-size:.78rem}.e46-hidden-by-search{display:none!important}.e46-no-results{display:none;grid-column:span 12;padding:1rem;border:1px dashed #81877f;color:#d5d8d1;font-family:"Courier New",monospace}.e46-no-results.is-visible{display:block}footer .footer-inner{border-radius:0;border:1px solid #363b35;background:#171a17;color:#959c92}
@media(max-width:980px){.card--e46_vehicle,.card--e46_triage,.card--e46_water_pump,.card--e46_vcg,.card--e46_baseline,.card--e46_sources{grid-column:span 12}}@media(max-width:720px){header.hero{min-height:0;padding:26px 18px;box-shadow:6px 6px 0 #090a09}header.hero::after{display:none}.hero h1{max-width:none;font-size:clamp(2.7rem,14vw,4.4rem)}main{grid-template-columns:1fr!important;gap:12px;padding:14px 10px 24px}.card,.card--e46_explore,.card--e46_vehicle,.card--e46_triage,.card--e46_cooling,.card--e46_water_pump,.card--e46_vcg,.card--e46_baseline,.card--e46_sources{grid-column:1/-1!important;min-height:0;box-shadow:5px 5px 0 rgba(0,0,0,.36)}.e46-grid,.e46-source-grid{grid-template-columns:1fr}.e46-label{margin-top:.3rem}.e46-search-shell{grid-template-columns:1fr}.e46-search-clear{min-height:42px}}
"""


EXTRA_JS = r"""
(function(){
  const triage=document.querySelector('.card--e46_triage');
  if(triage){
    const buttons=[...triage.querySelectorAll('.e46-symptom')];
    const paths=[...triage.querySelectorAll('.e46-path')];
    const activate=(key)=>{
      buttons.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.key===key)));
      paths.forEach(panel=>panel.classList.toggle('is-active',panel.dataset.key===key));
    };
    buttons.forEach(btn=>btn.addEventListener('click',()=>activate(btn.dataset.key)));
    if(buttons.length)activate(buttons[0].dataset.key);
  }
  const explore=document.querySelector('.card--e46_explore');
  const input=explore && explore.querySelector('.e46-search');
  const clear=explore && explore.querySelector('.e46-search-clear');
  const count=explore && explore.querySelector('.e46-search-count');
  const main=document.querySelector('main');
  if(!input || !main)return;
  const protectedTypes=['e46_explore','e46_vehicle'];
  const searchable=[...main.querySelectorAll('.card')].filter(card=>!protectedTypes.some(type=>card.classList.contains('card--'+type)));
  const noResults=document.createElement('div');
  noResults.className='e46-no-results';
  noResults.textContent='No indexed guide cards match that search yet. The long-term search layer will extend beyond the local guide into curated external sources.';
  main.appendChild(noResults);
  const apply=()=>{
    const q=input.value.trim().toLowerCase();
    let visible=0;
    searchable.forEach(card=>{
      const match=!q || card.textContent.toLowerCase().includes(q);
      card.classList.toggle('e46-hidden-by-search',!match);
      if(match)visible+=1;
    });
    if(count)count.textContent=q ? `${visible} guide section${visible===1?'':'s'} matched` : `${searchable.length} guide sections indexed`;
    noResults.classList.toggle('is-visible',Boolean(q) && visible===0);
  };
  input.addEventListener('input',apply);
  if(clear)clear.addEventListener('click',()=>{input.value='';apply();input.focus();});
  apply();
})();
"""


def _link(source_key: str, label: str | None = None) -> str:
    source = SOURCES[source_key]
    text = label or source["name"]
    return f'<a href="{escape(source["url"], quote=True)}" target="_blank" rel="noopener noreferrer">{escape(text)}</a>'


def _rows(items: list[tuple[str, str]]) -> str:
    return '<div class="e46-grid">' + ''.join(f'<div class="e46-label">{escape(label)}</div><div class="e46-value">{escape(value)}</div>' for label, value in items) + '</div>'


def _callout(label: str, text: str, warning: bool = False) -> str:
    css = "e46-callout e46-warning" if warning else "e46-callout"
    return f'<div class="{css}"><strong>{escape(label)}:</strong> {escape(text)}</div>'


def _card(card_type: str, eyebrow: str, title: str, body: str, source_url: str | None = None) -> CardItem:
    return CardItem(card_type=card_type, eyebrow=eyebrow, title=title, body=body, source_url=source_url)


def _build_explore_body() -> str:
    return ('<p><strong>Search the guide by symptom, component, system, maintenance item, or concept.</strong> Right now this searches the local E46 knowledge cards on this page. The same interface can later become the front door to indexed manuals, diagrams, community evidence, maintenance history, and external source search.</p><div class="e46-search-shell"><input class="e46-search" type="search" placeholder="Try: coolant, water pump, oil leak, brakes, CCV..." aria-label="Search the E46 owner companion"><button class="e46-search-clear" type="button">Clear</button></div><div class="e46-search-meta"><span class="e46-search-count">Guide sections indexed</span><span>Local index v0.1</span></div><div class="e46-search-modes"><span class="e46-mode">Problems</span><span class="e46-mode">Education</span><span class="e46-mode">Maintenance</span><span class="e46-mode">Parts & diagrams</span><span class="e46-mode">Exploration</span></div>')


def _build_triage_body() -> str:
    buttons = ''.join(f'<button class="e46-symptom" type="button" data-key="{escape(path["key"])}" aria-pressed="false">{escape(path["label"])}</button>' for path in TRIAGE_PATHS)
    panels = ''.join('<section class="e46-path" data-key="{key}"><h3>{headline}</h3><p>{body}</p></section>'.format(key=escape(path["key"]),headline=escape(path["headline"]),body=escape(path["body"])) for path in TRIAGE_PATHS)
    return ('<p><strong>Problem-solving is one part of the site, not the whole site.</strong> When something is wrong, start from what the car is actually doing and gather evidence before choosing a repair.</p>' + f'<div class="e46-symptoms" aria-label="Problem starting points">{buttons}</div>{panels}' + _callout("Useful evidence", "Exact symptom, when it happens, dashboard warnings, leaks/fluid levels, noises, recent work, and BMW-capable scan codes."))


def _source_links(keys: tuple[str, ...]) -> str:
    return '<div class="e46-source-links">' + ''.join(f'<span class="e46-source-link">{_link(key, SOURCES[key]["name"])}</span>' for key in keys) + '</div>'


def _build_issue_body(issue: dict) -> str:
    return f'<p>{escape(issue["body"])}</p>' + _callout("Check before parts", issue["checks"]) + _callout("While you're in there", issue["while_in_there"]) + _source_links(issue["sources"])


def _build_baseline_body() -> str:
    rows = ''.join(f'<div class="e46-list-row"><strong>{escape(title)}</strong>{escape(body)}</div>' for title, body in RELIABILITY_BASELINE)
    return '<p>This is the ownership side of the site: the car should remain useful even when nothing is currently broken.</p><div class="e46-list">' + rows + '</div>'


def _build_sources_body() -> str:
    cards = ''.join('<div class="e46-source">' + f'<span class="e46-source-type">{escape(source["kind"])}</span>' + _link(key) + f'<p>{escape(source["note"])}</p></div>' for key, source in SOURCES.items())
    return '<p><strong>The companion is the index, not the authority.</strong> It should aggregate good sources, explain what each one is useful for, and preserve the path back to the underlying evidence.</p>' + f'<div class="e46-source-grid">{cards}</div>'


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    del seed
    vehicle_body = _rows([("Vehicle", f'{VEHICLE["year"]} {VEHICLE["model"]}'),("Chassis", VEHICLE["chassis"]),("Engine", VEHICLE["engine"]),("Purpose", VEHICLE["purpose"]),("Still to record", VEHICLE["unknowns"])]) + f'<div class="e46-current-note"><strong>Owner note:</strong> {escape(VEHICLE["current_note"])}</div>'
    cards: list[CardItem] = [
        _card("e46_explore", "OWNER INDEX // SEARCH & EXPLORE", "What Do You Want to Know?", _build_explore_body()),
        _card("e46_vehicle", "VEHICLE PROFILE // PERSISTENT CONTEXT", "The Car", vehicle_body),
        _card("e46_triage", "DIAGNOSE // WHEN SOMETHING IS WRONG", "Start From the Symptom", _build_triage_body()),
    ]
    for issue in ISSUES:
        cards.append(_card(issue["card_type"], issue["eyebrow"], issue["title"], _build_issue_body(issue)))
    cards.extend([
        _card("e46_baseline", "OWNERSHIP // MAINTENANCE", "Daily-Driver Baseline", _build_baseline_body()),
        _card("e46_sources", "SOURCE BAY // OPEN THE ORIGINAL", "Technical Library", _build_sources_body()),
    ])
    return PageContext(page_title=THEME_CONFIG["page_title"],header_title=THEME_CONFIG["header_title"],header_subtitle=THEME_CONFIG["header_subtitle"],today_str=today.strftime("%A, %B %d, %Y"),cards=cards,footer_text=THEME_CONFIG["footer_text"],metadata={"theme_name":THEME_NAME,"date_key":today.strftime("%m-%d"),"hero_kicker":THEME_CONFIG["hero_kicker"],"hero_summary_pill":THEME_CONFIG["hero_summary_pill"],"extra_css":EXTRA_CSS,"extra_js":EXTRA_JS,"extra_head_html":'<meta name="theme-color" content="#171714">'},)
