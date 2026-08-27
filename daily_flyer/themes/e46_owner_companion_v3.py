from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "e46_owner_companion_v3"

THEME_CONFIG = {
    "page_title": "E46 Workshop — 2004 BMW 330Ci",
    "header_title": "330Ci / E46",
    "header_subtitle": "Workshop index for one 2004 330Ci — diagrams, service references, parts, diagnosis, and maintenance.",
    "footer_text": (
        "Unofficial owner-built reference hub. RealOEM, BMW TIS, Operation CHARM, and other sources remain the underlying authorities. "
        "Confirm exact VIN / production month before using part fitment or production-specific procedures."
    ),
    "hero_kicker": "2004 // E46 COUPE // M54B30",
    "hero_summary_pill": "SYSTEM INDEX • WORKSHOP • SOURCE LIBRARY",
}


REALOEM_CAR = "https://www.realoem.com/bmw/enUS/partgrp?id=BD53-USA-10-2004-E46-BMW-330Ci"
CHARM = "https://charm.li/BMW/2004/330Ci%20Coupe%20%28E46%29%20L6-3.0L%20%28M54%29/"
BMW_TIS = "https://bmwtechinfo.bmwgroup.com/tisUI/"
BMW_CLASSIC = "https://www.bmwgroup-classic.com/en/models/bmw-classics/product-description-page.ad-1002-1.bmw-330ci-coupe-e46.html"
BIMMERFORUMS = "https://www.bimmerforums.com/forum/forumdisplay.php?15-1999-2006-%28E46%29"


SYSTEMS = [
    {
        "key": "engine",
        "index": "11",
        "title": "Engine / Top End",
        "subtitle": "M54B30",
        "search": "engine m54 m54b30 valve cover gasket vanos ccv disa oil filter housing oil leak head cylinder intake crankcase",
        "image": "https://www.realoem.com/bmw/images/diag_eil.jpg",
        "realoem": REALOEM_CAR + "&mg=11",
        "primary": "Cylinder head cover / valve-cover sealing",
        "components": ["Valve cover", "VANOS", "CCV / oil separator", "DISA / intake", "OFHG", "Belts / accessories"],
        "part_numbers": ["11127512839 — cylinder head cover", "11120030496 — profile gasket set"],
        "job_notes": ["Start from the highest fresh oil source.", "Treat vacuum / crankcase ventilation faults separately from external oil leaks.", "Production month matters for several engine-side revisions."],
    },
    {
        "key": "cooling",
        "index": "17",
        "title": "Cooling",
        "subtitle": "Pump / thermostat / radiator",
        "search": "cooling coolant overheat overheating expansion tank radiator water pump thermostat hoses fan bleed pressure test",
        "image": "https://www.realoem.com/bmw/images/diag_3c1l.jpg",
        "realoem": REALOEM_CAR + "&mg=17",
        "primary": "Water pump / thermostat / cooling circuit",
        "components": ["Water pump", "Thermostat", "Expansion tank", "Radiator", "Upper / lower hoses", "Fan / shroud"],
        "part_numbers": ["11517509985 — mechanical coolant pump", "11537509227 — thermostat housing / thermostat"],
        "job_notes": ["Pressure-test before parts-cannoning a leak.", "If the system is drained, inspect the surrounding plastic and belt-drive items while access is open.", "Any active overheat is a stop-driving event."],
    },
    {
        "key": "front_axle",
        "index": "31/32",
        "title": "Front Axle / Steering",
        "subtitle": "Control arms / rack / bushings",
        "search": "front axle steering suspension control arm wishbone fcab bushing tie rod rack ball joint clunk vibration shimmy alignment",
        "image": "https://www.realoem.com/bmw/images/diag_7nzb.jpg",
        "realoem": REALOEM_CAR + "&mg=31",
        "primary": "Front axle support / wishbone",
        "components": ["Control arms", "FCABs", "Ball joints", "Tie rods", "Steering rack", "Front subframe"],
        "part_numbers": ["31111096902 — front axle support", "31126783376 — bracket / rubber mounting set"],
        "job_notes": ["Separate wheel/tire vibration from bushing and ball-joint play before ordering suspension parts.", "Alignment is part of the job after geometry-changing work.", "Check both sides while loaded and unloaded."],
    },
    {
        "key": "brakes",
        "index": "34",
        "title": "Brakes / DSC",
        "subtitle": "330Ci larger brake package",
        "search": "brakes brake rotor disc pads caliper hose dsc abs sensor wheel speed soft pedal vibration fluid",
        "image": "https://www.realoem.com/bmw/images/diag_35nq.jpg",
        "realoem": REALOEM_CAR + "&mg=34",
        "primary": "Front brake / ventilated disc",
        "components": ["Rotors", "Pads", "Calipers", "Hoses", "Pad sensors", "DSC / wheel-speed sensors"],
        "part_numbers": ["34116864047 — front ventilated brake disc (325x25)"],
        "job_notes": ["Measure / inspect before replacing by interval alone.", "Brake work should include hose, slider, sensor, fluid, and hardware condition — not only friction material.", "Use the repair manual for torque and bleed procedure."],
    },
    {
        "key": "driveline",
        "index": "21–26 / 33",
        "title": "Driveline",
        "subtitle": "Transmission / shaft / differential",
        "search": "driveline drivetrain transmission manual automatic clutch guibo flex disc driveshaft center support bearing differential rear axle shifter mount",
        "image": "",
        "realoem": REALOEM_CAR + "&mg=26",
        "primary": "Drive shaft / mounts / rear axle",
        "components": ["Transmission", "Clutch / converter", "Guibo", "CSB", "Driveshaft", "Differential / mounts"],
        "part_numbers": [],
        "job_notes": ["Transmission type must be captured before this section becomes fitment-specific.", "NVH diagnosis should separate engine/trans mounts, guibo, CSB, differential mounts, and wheel-speed-related vibration."],
    },
    {
        "key": "electrical",
        "index": "12 / 61 / 62",
        "title": "Electrical / Diagnostics",
        "subtitle": "DME / charging / modules",
        "search": "electrical dme ecu battery alternator starter sensors codes obd obd2 scan module k bus can no start crank charging parasitic drain grounds",
        "image": "",
        "realoem": REALOEM_CAR + "&mg=61",
        "primary": "Power / modules / sensors / diagnostics",
        "components": ["Battery / charging", "Starter", "DME", "Sensors", "K-bus / modules", "Grounds / distribution"],
        "part_numbers": [],
        "job_notes": ["Scan BMW modules before replacing electronics from symptom alone.", "Voltage and grounds come before module condemnation.", "Record exact codes and module names, not only generic OBD descriptions."],
    },
    {
        "key": "body",
        "index": "41 / 51 / 52 / 54",
        "title": "Body / Interior",
        "subtitle": "Coupe-specific hardware",
        "search": "body interior window regulator door lock seat sunroof trim weatherstrip coupe glass latch mirror headliner leak",
        "image": "",
        "realoem": REALOEM_CAR + "&mg=41",
        "primary": "Coupe body / trim / mechanisms",
        "components": ["Window regulators", "Door / lock hardware", "Sunroof", "Seats", "Weather seals", "Trim / glass"],
        "part_numbers": [],
        "job_notes": ["Coupe-specific glass, doors, seals, and trim should stay separated from sedan guidance.", "Use the parts diagram first when a mechanism has multiple clips, carriers, or revisions."],
    },
]


EXTRA_CSS = r"""
:root{--bg:#0e0f0f;--bg-deep:#090a0a;--bg-soft:#151616;--card:#f2f0ea;--card-strong:#faf9f5;--border:#2b2d2f;--border-strong:#0f1113;--ink:#151719;--ink-soft:#45494e;--muted:#70757b;--irish-green:#1c69d4;--gold:#d9d6cc;--teal:#5aa9e6;--blue:#1c69d4;--radius-xl:0;--radius-lg:0;--radius-md:0;--max-width:1260px}
html{background:#0e0f0f}body{background:linear-gradient(rgba(13,14,14,.97),rgba(13,14,14,.98)),repeating-linear-gradient(0deg,transparent 0 31px,rgba(255,255,255,.025) 32px),repeating-linear-gradient(90deg,transparent 0 31px,rgba(255,255,255,.025) 32px),#0e0f0f;color:#f5f5f2;font-family:Arial,Helvetica,sans-serif}
body::before,body::after{display:none}.hero-wrap{padding:0 18px}.hero-wrap::before{content:"";display:block;height:8px;max-width:var(--max-width);margin:0 auto;background:linear-gradient(90deg,#1c69d4 0 25%,#5aa9e6 25% 50%,#f5f5f2 50% 75%,transparent 75%)}
header.hero{min-height:270px;padding:34px 0 28px;border:0;border-bottom:1px solid rgba(255,255,255,.18);border-radius:0;background:transparent;box-shadow:none;color:#f5f5f2;backdrop-filter:none;overflow:visible}header.hero::before{display:none}header.hero::after{content:"M54B30 / E46-2 / 2004";position:absolute;right:0;bottom:28px;color:rgba(255,255,255,.18);font-weight:900;letter-spacing:.16em;font-size:clamp(.85rem,2vw,1.6rem)}.hero-kicker{padding:0;border:0;border-radius:0;background:transparent;color:#8dbde9;font-size:.72rem;font-weight:900;letter-spacing:.16em}.hero h1{max-width:none;margin:.55rem 0 0;font-size:clamp(4rem,11vw,9rem);line-height:.76;letter-spacing:-.075em;text-transform:uppercase;font-weight:950}.hero .subtitle{max-width:720px;margin-top:24px;color:#d1d1cd;font-size:1.02rem;line-height:1.5}.hero-meta{margin-top:18px}.hero-meta .hero-pill:first-child{display:none}.hero-pill{padding:0;border:0;border-radius:0;background:transparent;color:#8f9499;font-size:.74rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase}
main{gap:0;padding-top:0}.card{grid-column:span 12;min-height:0;margin:0;padding:42px 0;border:0;border-bottom:1px solid rgba(255,255,255,.15);border-radius:0;background:transparent;color:#f5f5f2;box-shadow:none;backdrop-filter:none;overflow:visible}.card:hover{transform:none;box-shadow:none}.card::before,.card::after{display:none}.card-head{align-items:end;margin:0 0 24px;padding:0;border:0}.eyebrow{color:#79afe3;font-size:.68rem;font-weight:900;letter-spacing:.16em}h2{color:#f5f5f2;font-size:clamp(2rem,4.8vw,4.2rem);line-height:.88;letter-spacing:-.055em;text-transform:uppercase}.icon-badge{display:none}.body{color:#d0d1cd;font-size:.98rem;line-height:1.5}.source{display:none}
.e46-index-head{display:grid;grid-template-columns:.38fr .62fr;gap:32px;align-items:end;margin-bottom:22px}.e46-index-note{max-width:560px;margin:0;color:#9fa3a7}.e46-search-shell{display:grid;grid-template-columns:1fr auto;border:1px solid rgba(255,255,255,.26);background:#101112}.e46-search{width:100%;min-height:54px;padding:0 16px;border:0;outline:0;background:transparent;color:#fff;font:inherit}.e46-search::placeholder{color:#73787e}.e46-search-clear{padding:0 18px;border:0;border-left:1px solid rgba(255,255,255,.18);background:transparent;color:#aeb3b8;font-weight:900;text-transform:uppercase;letter-spacing:.1em;cursor:pointer}.e46-search-meta{min-height:24px;margin-top:8px;color:#73787e;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase}
.e46-system-grid{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(255,255,255,.16);border-left:1px solid rgba(255,255,255,.16)}.e46-system{position:relative;display:flex;min-height:285px;flex-direction:column;padding:0;border:0;border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.025);color:#fff;text-align:left;cursor:pointer;overflow:hidden;transition:background .16s ease,transform .16s ease}.e46-system:hover,.e46-system:focus-visible{background:rgba(28,105,212,.10);transform:translateY(-2px);outline:none}.e46-system.is-filtered{display:none}.e46-system-image{height:170px;display:grid;place-items:center;padding:12px;background:#efeee9;overflow:hidden}.e46-system-image img{width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply}.e46-system-image.e46-schematic{background:linear-gradient(135deg,#181a1c,#111214);color:#86b7e4}.e46-schematic-mark{font-size:3.2rem;font-weight:950;letter-spacing:-.07em}.e46-system-copy{display:flex;flex:1;flex-direction:column;padding:18px}.e46-system-index{color:#6ea7da;font-size:.68rem;font-weight:900;letter-spacing:.16em}.e46-system h3{margin:8px 0 3px;color:#fff;font-size:1.36rem;line-height:1;letter-spacing:-.04em}.e46-system p{margin:0;color:#8f9499;font-size:.82rem}.e46-open{margin-top:auto;padding-top:18px;color:#76ade0;font-size:.7rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.card--e46_workspace{display:none}.card--e46_workspace.is-open{display:block}.e46-workspace-top{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:24px}.e46-back{border:0;background:transparent;color:#86b7e4;font-weight:900;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.e46-fitment{color:#73787e;font-size:.72rem;text-transform:uppercase;letter-spacing:.09em}.e46-workshop{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);border:1px solid rgba(255,255,255,.16)}.e46-visual{min-height:510px;display:flex;flex-direction:column;background:#efeee9;color:#17191b}.e46-visual-head{display:flex;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid #cacac5;color:#62666b;font-size:.7rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.e46-diagram{flex:1;display:grid;place-items:center;min-height:380px;padding:22px}.e46-diagram img{max-width:100%;max-height:430px;object-fit:contain}.e46-diagram-placeholder{font-size:clamp(4rem,10vw,8rem);font-weight:950;color:#d5d4cf;letter-spacing:-.08em}.e46-source-credit{padding:12px 16px;border-top:1px solid #cacac5;color:#64686d;font-size:.74rem}.e46-source-credit a{color:#155fb8}.e46-work-details{padding:26px;background:#141516}.e46-work-kicker{color:#6da6dc;font-size:.68rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.e46-work-title{margin:7px 0 5px;color:#fff;font-size:clamp(2rem,4vw,3.7rem);line-height:.9;letter-spacing:-.06em}.e46-work-primary{margin:0 0 20px;color:#8d9297}.e46-component-grid{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:24px}.e46-component{padding:7px 9px;border:1px solid rgba(255,255,255,.17);color:#d4d4d0;font-size:.78rem}.e46-ref-actions{display:grid;gap:8px;margin-bottom:24px}.e46-ref{display:flex;justify-content:space-between;gap:14px;padding:12px 13px;border:1px solid rgba(255,255,255,.16);color:#f4f4f1!important;text-decoration:none;font-weight:800}.e46-ref:hover{border-color:#6da6dc;background:rgba(28,105,212,.09);text-decoration:none}.e46-ref span:last-child{color:#6da6dc}.e46-data-block{padding-top:17px;border-top:1px solid rgba(255,255,255,.15)}.e46-data-label{margin-bottom:8px;color:#777d83;font-size:.66rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.e46-parts,.e46-notes{margin:0;padding-left:18px;color:#c1c3c3}.e46-parts li,.e46-notes li{margin:.35rem 0}.e46-data-block+.e46-data-block{margin-top:18px}
.e46-source-strip{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid rgba(255,255,255,.16);border-left:1px solid rgba(255,255,255,.16)}.e46-source-tile{min-height:150px;padding:18px;border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);color:#fff!important;text-decoration:none;background:rgba(255,255,255,.025)}.e46-source-tile:hover{background:rgba(28,105,212,.10);text-decoration:none}.e46-source-tile strong{display:block;margin-bottom:8px;color:#fff}.e46-source-tile span{color:#7d8389;font-size:.78rem}.e46-source-type{display:block!important;margin-bottom:20px!important;color:#6da6dc!important;font-size:.64rem!important;letter-spacing:.13em;text-transform:uppercase}
@media(max-width:1020px){.e46-system-grid{grid-template-columns:repeat(2,1fr)}.e46-workshop{grid-template-columns:1fr}.e46-source-strip{grid-template-columns:repeat(2,1fr)}.e46-index-head{grid-template-columns:1fr}}
@media(max-width:650px){.hero h1{font-size:clamp(3.6rem,20vw,6rem)}header.hero::after{display:none}.card{padding:30px 0}.e46-system-grid{grid-template-columns:1fr}.e46-system{min-height:235px}.e46-system-image{height:145px}.e46-source-strip{grid-template-columns:1fr}.e46-workspace-top{align-items:flex-start;flex-direction:column}.e46-visual{min-height:390px}.e46-diagram{min-height:280px}.e46-work-details{padding:20px}}
"""


EXTRA_JS = r"""
(function(){
  const systemsCard=document.querySelector('.card--e46_systems');
  const workspaceCard=document.querySelector('.card--e46_workspace');
  if(!systemsCard || !workspaceCard)return;
  const buttons=[...systemsCard.querySelectorAll('.e46-system')];
  const input=systemsCard.querySelector('.e46-search');
  const clear=systemsCard.querySelector('.e46-search-clear');
  const meta=systemsCard.querySelector('.e46-search-meta');
  const workspace=workspaceCard.querySelector('.e46-workspace-body');
  const back=workspaceCard.querySelector('.e46-back');

  function showSystem(key){
    const template=document.getElementById('e46-template-'+key);
    if(!template || !workspace)return;
    workspace.innerHTML=template.innerHTML;
    workspaceCard.classList.add('is-open');
    workspaceCard.scrollIntoView({behavior:'smooth',block:'start'});
  }

  buttons.forEach(btn=>btn.addEventListener('click',()=>showSystem(btn.dataset.key)));
  if(back)back.addEventListener('click',()=>{
    workspaceCard.classList.remove('is-open');
    systemsCard.scrollIntoView({behavior:'smooth',block:'start'});
  });

  function applySearch(){
    const q=(input?.value||'').trim().toLowerCase();
    let matches=0;
    buttons.forEach(btn=>{
      const match=!q || (btn.dataset.search||'').includes(q) || btn.textContent.toLowerCase().includes(q);
      btn.classList.toggle('is-filtered',!match);
      if(match)matches++;
    });
    if(meta)meta.textContent=q ? `${matches} system${matches===1?'':'s'} match` : 'Search systems, components, symptoms, or jobs';
  }
  if(input){
    input.addEventListener('input',applySearch);
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        const first=buttons.find(btn=>!btn.classList.contains('is-filtered'));
        if(first)showSystem(first.dataset.key);
      }
    });
  }
  if(clear)clear.addEventListener('click',()=>{if(input){input.value='';applySearch();input.focus();}});
  applySearch();
})();
"""


def _a(url: str, label: str) -> str:
    return f'<a href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">{escape(label)}</a>'


def _system_tile(system: dict) -> str:
    if system["image"]:
        visual = f'<div class="e46-system-image"><img src="{escape(system["image"], quote=True)}" alt="{escape(system["title"])} exploded diagram"></div>'
    else:
        visual = f'<div class="e46-system-image e46-schematic"><span class="e46-schematic-mark">{escape(system["index"])}</span></div>'
    return (
        f'<button class="e46-system" type="button" data-key="{escape(system["key"])}" data-search="{escape(system["search"])}">'
        + visual
        + '<div class="e46-system-copy">'
        + f'<span class="e46-system-index">GROUP {escape(system["index"])}</span>'
        + f'<h3>{escape(system["title"])}</h3><p>{escape(system["subtitle"])}</p>'
        + '<span class="e46-open">Open workshop →</span></div></button>'
    )


def _system_template(system: dict) -> str:
    if system["image"]:
        diagram = f'<img src="{escape(system["image"], quote=True)}" alt="{escape(system["primary"])} exploded diagram">'
    else:
        diagram = f'<div class="e46-diagram-placeholder">{escape(system["index"])}</div>'
    components = ''.join(f'<span class="e46-component">{escape(item)}</span>' for item in system["components"])
    parts = ''.join(f'<li>{escape(item)}</li>' for item in system["part_numbers"]) or '<li>Set VIN / production month before pinning exact fitment numbers here.</li>'
    notes = ''.join(f'<li>{escape(item)}</li>' for item in system["job_notes"])
    return (
        f'<template id="e46-template-{escape(system["key"])}">'
        '<div class="e46-workshop">'
        '<div class="e46-visual">'
        f'<div class="e46-visual-head"><span>{escape(system["primary"])}</span><span>Exploded view</span></div>'
        f'<div class="e46-diagram">{diagram}</div>'
        f'<div class="e46-source-credit">Diagram source: {_a(system["realoem"], "RealOEM")}. Open the source for numbered parts and fitment.</div>'
        '</div>'
        '<div class="e46-work-details">'
        f'<span class="e46-work-kicker">GROUP {escape(system["index"])}</span>'
        f'<h3 class="e46-work-title">{escape(system["title"])}</h3>'
        f'<p class="e46-work-primary">{escape(system["primary"])}</p>'
        f'<div class="e46-component-grid">{components}</div>'
        '<div class="e46-ref-actions">'
        f'<a class="e46-ref" href="{escape(system["realoem"], quote=True)}" target="_blank" rel="noopener noreferrer"><span>RealOEM parts / diagrams</span><span>OPEN ↗</span></a>'
        f'<a class="e46-ref" href="{escape(CHARM, quote=True)}" target="_blank" rel="noopener noreferrer"><span>2004 330Ci service manual index</span><span>OPEN ↗</span></a>'
        f'<a class="e46-ref" href="{escape(BMW_TIS, quote=True)}" target="_blank" rel="noopener noreferrer"><span>BMW Technical Information System</span><span>OPEN ↗</span></a>'
        '</div>'
        f'<div class="e46-data-block"><div class="e46-data-label">Pinned parts / references</div><ul class="e46-parts">{parts}</ul></div>'
        f'<div class="e46-data-block"><div class="e46-data-label">Workshop notes</div><ul class="e46-notes">{notes}</ul></div>'
        '</div></div></template>'
    )


def _build_systems_body() -> str:
    tiles = ''.join(_system_tile(system) for system in SYSTEMS)
    templates = ''.join(_system_template(system) for system in SYSTEMS)
    return (
        '<div class="e46-index-head"><p class="e46-index-note">Choose a system first. The detailed repair information, diagrams, part numbers, and source material live one level down.</p>'
        '<div><div class="e46-search-shell"><input class="e46-search" type="search" aria-label="Search E46 workshop" placeholder="Search: water pump, VANOS, control arm, DSC, no-start..."><button class="e46-search-clear" type="button">Clear</button></div><div class="e46-search-meta"></div></div></div>'
        f'<div class="e46-system-grid">{tiles}</div>{templates}'
    )


def _build_workspace_body() -> str:
    return '<div class="e46-workspace-top"><button class="e46-back" type="button">← System index</button><span class="e46-fitment">Working catalog: 2004 330Ci Coupe / M54 • VIN & production month still to be set</span></div><div class="e46-workspace-body"></div>'


def _build_source_body() -> str:
    sources = [
        ("Parts / exploded views", "RealOEM", REALOEM_CAR),
        ("Service manual index", "Operation CHARM", CHARM),
        ("Factory technical info", "BMW TIS", BMW_TIS),
        ("Model archive", "BMW Group Classic", BMW_CLASSIC),
        ("Community evidence", "Bimmerforums E46", BIMMERFORUMS),
    ]
    tiles = ''.join(
        f'<a class="e46-source-tile" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer"><span class="e46-source-type">{escape(kind)}</span><strong>{escape(name)}</strong><span>Open source ↗</span></a>'
        for kind, name, url in sources
    )
    return f'<div class="e46-source-strip">{tiles}</div>'


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    del seed
    cards = [
        CardItem(card_type="e46_systems", eyebrow="SYSTEM INDEX", title="Explore the Car", body=_build_systems_body()),
        CardItem(card_type="e46_workspace", eyebrow="WORKSHOP", title="System Detail", body=_build_workspace_body()),
        CardItem(card_type="e46_library", eyebrow="SOURCE LIBRARY", title="Original References", body=_build_source_body()),
    ]
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
            "extra_head_html": '<meta name="theme-color" content="#0e0f0f">',
        },
    )
