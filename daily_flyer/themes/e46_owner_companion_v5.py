from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import e46_owner_companion_v4 as base


THEME_NAME = "e46_owner_companion_v5"

THEME_CONFIG = {
    "page_title": "E46 Workshop — 2004 BMW 330Ci",
    "header_title": "330Ci / E46",
    "header_subtitle": "Search the car, open a system, drill into a component, then work from diagrams and original references.",
    "footer_text": (
        "Unofficial owner-built reference hub. Source material remains with its original publisher. "
        "Confirm VIN, production month, and transmission before relying on fitment or production-specific procedures."
    ),
    "hero_kicker": "2004 // E46 COUPE // M54B30",
    "hero_summary_pill": "SEARCH • SYSTEM • COMPONENT • SOURCE",
}

REALOEM_CAR = base.REALOEM_CAR
CHARM = base.CHARM
BMW_TIS = base.BMW_TIS
BMW_CLASSIC = base.BMW_CLASSIC
BIMMERFORUMS = base.BIMMERFORUMS
FCP_COOLING = base.FCP_COOLING

REALOEM_WATERPUMP = "https://www.realoem.com/bmw/enUS/showparts?diagId=11_9915&id=BN53-USA---E46-BMW-330Ci"
REALOEM_WATER_HOSES = "https://www.realoem.com/bmw/enUS/showparts?diagId=11_2200&id=BN53-USA---E46-BMW-330Ci"
REALOEM_EXPANSION_MANUAL = "https://www.realoem.com/bmw/enUS/showparts?diagId=17_2195&id=BD52-EUR-09_2002_E46_BMW_330Ci"
REALOEM_EXPANSION_AUTO = "https://www.realoem.com/bmw/enUS/showparts?diagId=17_0141&id=BD53-USA-02-2003-E46-BMW-330Ci"

SYSTEMS = base.SYSTEMS

COOLING_COMPONENTS = [
    {
        "key": "water_pump",
        "title": "Water Pump",
        "group": "11",
        "aliases": ["waterpump", "coolant pump", "mechanical pump", "pump bearing", "pump pulley"],
        "symptoms": ["overheating", "coolant leak", "bearing noise", "pulley play", "poor circulation"],
        "part_numbers": [
            "11517509985 — coolant pump, mechanical",
            "11511711484 — pump O-ring, 68x5",
        ],
        "check": "Leak path at pump, shaft/pulley play, bearing noise, belt drive, circulation evidence.",
        "adjacent": "Thermostat, pump pulley, belts, tensioner/idler condition, nearby hoses, coolant refill/bleed.",
        "sources": [
            ("Exploded view + numbered parts", "RealOEM — Waterpump / Thermostat", REALOEM_WATERPUMP),
            ("Service / repair / specifications", "Operation CHARM — 2004 330Ci", CHARM),
            ("Parts cross-check", "FCP Euro — 330Ci Cooling", FCP_COOLING),
        ],
    },
    {
        "key": "thermostat",
        "title": "Thermostat",
        "group": "11",
        "aliases": ["thermostat housing", "thermostat assembly", "thermostsat", "thermostat map cooling"],
        "symptoms": ["runs hot", "runs cold", "overheating", "slow warmup", "coolant leak", "temperature fault"],
        "part_numbers": ["11537509227 — thermostat housing with thermostat"],
        "check": "Temperature behavior, fault data, housing leakage, cooling-system pressure integrity, circulation context.",
        "adjacent": "Water pump, belts/access, hose condition, coolant, bleed procedure.",
        "sources": [
            ("Exploded view + numbered parts", "RealOEM — Waterpump / Thermostat", REALOEM_WATERPUMP),
            ("Cooling-system repair index", "Operation CHARM — 2004 330Ci", CHARM),
            ("Factory technical information", "BMW TechInfo / ISTA-AIR entry point", BMW_TIS),
        ],
    },
    {
        "key": "expansion_tank",
        "title": "Expansion Tank",
        "group": "17",
        "aliases": ["exp tank", "reservoir", "coolant reservoir", "header tank", "coolant bottle"],
        "symptoms": ["coolant leak", "low coolant", "cracked tank", "pressure loss", "coolant smell"],
        "part_numbers": ["Fitment depends on transmission / production data — do not pin a single tank yet."],
        "check": "Tank seams/body, cap area, level sensor area, mounting plate connections, dried coolant tracks, pressure test.",
        "adjacent": "Cap, level sensor, mounting plate, lower connection, nearby hoses, transmission-specific hardware.",
        "sources": [
            ("Manual-transmission layout", "RealOEM — Expansion tank (manual)", REALOEM_EXPANSION_MANUAL),
            ("Automatic-transmission layout", "RealOEM — Expansion tank (automatic)", REALOEM_EXPANSION_AUTO),
            ("Cooling-system service index", "Operation CHARM — 2004 330Ci", CHARM),
        ],
    },
    {
        "key": "water_hoses",
        "title": "Cooling Hoses / Pipes",
        "group": "11 / 17",
        "aliases": ["hoses", "water hose", "coolant hose", "hard pipe", "heater pipe", "return hose", "vent screw"],
        "symptoms": ["coolant leak", "dried coolant", "hose split", "connector leak", "low coolant", "no heat"],
        "part_numbers": [
            "17127510952 — water hose",
            "11531436408 — water hose",
            "11531436410 — return hose",
            "11537502525 — water pipe",
            "13621433077 — coolant temperature sensor",
        ],
        "check": "Quick-connect ends, O-rings, hard pipes, heater connections, vent/bleed hardware, leak tracks under pressure.",
        "adjacent": "Expansion tank, thermostat connection, radiator necks, heater circuit, coolant temperature sensors.",
        "sources": [
            ("Exploded hose routing + numbers", "RealOEM — Cooling System Water Hoses", REALOEM_WATER_HOSES),
            ("Leak test / bleed / service", "Operation CHARM — 2004 330Ci", CHARM),
        ],
    },
    {
        "key": "radiator",
        "title": "Radiator",
        "group": "17",
        "aliases": ["rad", "radiator core", "radiator neck", "cooling core"],
        "symptoms": ["coolant leak", "overheating", "damaged fins", "cracked neck", "poor cooling"],
        "part_numbers": ["Set VIN / transmission / production month before pinning exact radiator fitment."],
        "check": "End tanks/necks, core condition, connection points, fan-side obstruction, pressure test, evidence of prior impact.",
        "adjacent": "Expansion tank/mounting plate, upper/lower hose connections, fan/shroud, coolant sensor circuit.",
        "sources": [
            ("Vehicle-specific parts group", "RealOEM — Radiator group", REALOEM_CAR + "&mg=17"),
            ("Radiator service / diagnosis", "Operation CHARM — 2004 330Ci", CHARM),
        ],
    },
    {
        "key": "fan_bleed",
        "title": "Fan / Bleed / Sensors",
        "group": "17 / 64",
        "aliases": ["fan", "electric fan", "aux fan", "bleed", "bleeder", "vent screw", "temp sensor", "temperature sensor"],
        "symptoms": ["overheats at idle", "fan not running", "air pocket", "no heat", "temperature reading wrong"],
        "part_numbers": ["13621433077 — coolant temperature sensor appears in the 330Ci hose circuit catalog."],
        "check": "Fan command/operation, sensor data, connector integrity, bleed state, heat output, coolant level and circulation.",
        "adjacent": "Radiator, hose routing, expansion tank, thermostat, DME cooling-fan control/diagnostics.",
        "sources": [
            ("Cooling fan / sensor / bleed procedures", "Operation CHARM — 2004 330Ci", CHARM),
            ("Hose / sensor exploded view", "RealOEM — Cooling System Water Hoses", REALOEM_WATER_HOSES),
            ("Factory diagnostics", "BMW TechInfo / ISTA-AIR entry point", BMW_TIS),
        ],
    },
]


EXTRA_CSS = base.EXTRA_CSS + r"""
/* v5: system -> component -> source flow */
.e46-index-note{font-size:.92rem;max-width:430px}.e46-search-shell{min-height:66px;border-color:rgba(122,178,231,.48);box-shadow:0 0 0 1px rgba(28,105,212,.12),0 16px 50px rgba(0,0,0,.24)}.e46-search{font-size:1.02rem}.e46-search-kicker{display:block;margin-bottom:7px;color:#75abe0;font-size:.66rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.e46-search-results{border-color:rgba(122,178,231,.30)}
.e46-result-type{display:inline-block;margin-right:8px;padding:3px 6px;border:1px solid rgba(255,255,255,.16);color:#7fb4e6;font-size:.58rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.e46-result-path{display:block;margin-top:4px;color:#777e84;font-size:.69rem}.e46-system.is-best::after{content:"BEST MATCH";position:absolute;right:10px;top:10px;padding:5px 7px;background:#1c69d4;color:#fff;font-size:.56rem;font-weight:900;letter-spacing:.11em}.e46-work-details{position:relative}.e46-drill-label{margin:24px 0 9px;color:#777d83;font-size:.64rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.e46-component-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid rgba(255,255,255,.15);border-left:1px solid rgba(255,255,255,.15)}.e46-component-card{position:relative;min-height:118px;padding:14px;border:0;border-right:1px solid rgba(255,255,255,.15);border-bottom:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.025);color:#fff;text-align:left;cursor:pointer}.e46-component-card:hover,.e46-component-card:focus-visible{outline:none;background:rgba(28,105,212,.12)}.e46-component-group{display:block;color:#6fa8dc;font-size:.58rem;font-weight:900;letter-spacing:.13em}.e46-component-card strong{display:block;margin:8px 0 4px;font-size:1rem}.e46-component-card span:last-child{color:#81878c;font-size:.72rem}.e46-component-open{position:absolute;right:12px;bottom:11px;color:#6fa8dc!important;font-weight:900}.e46-component-view{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(330px,.92fr);border:1px solid rgba(255,255,255,.16)}.e46-component-visual{display:flex;min-height:540px;flex-direction:column;background:#efeee9;color:#191b1d}.e46-component-visual-head{display:flex;justify-content:space-between;gap:15px;padding:13px 16px;border-bottom:1px solid #c8c8c3;color:#64696d;font-size:.68rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.e46-component-visual-main{position:relative;display:grid;flex:1;place-items:center;min-height:380px;padding:28px}.e46-component-visual-main img{max-width:100%;max-height:440px;object-fit:contain;mix-blend-mode:multiply}.e46-component-stamp{position:absolute;left:18px;bottom:18px;color:rgba(21,23,25,.13);font-size:clamp(3rem,8vw,6rem);font-weight:950;letter-spacing:-.07em;text-transform:uppercase}.e46-component-credit{padding:12px 16px;border-top:1px solid #c8c8c3;color:#64696d;font-size:.72rem}.e46-component-details{padding:26px;background:#141516}.e46-component-breadcrumb{display:flex;align-items:center;gap:9px;margin-bottom:15px;color:#7a8085;font-size:.65rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.e46-component-back{padding:0;border:0;background:transparent;color:#75abe0;font:inherit;cursor:pointer}.e46-component-title{margin:0;color:#fff;font-size:clamp(2.5rem,5vw,4.4rem);line-height:.84;letter-spacing:-.065em}.e46-component-sub{margin:10px 0 22px;color:#8c9297}.e46-mini-data{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid rgba(255,255,255,.15);border-left:1px solid rgba(255,255,255,.15)}.e46-mini-data>div{padding:14px;border-right:1px solid rgba(255,255,255,.15);border-bottom:1px solid rgba(255,255,255,.15)}.e46-mini-data span{display:block;margin-bottom:5px;color:#777d83;font-size:.58rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.e46-mini-data p{margin:0;color:#c4c6c7;font-size:.79rem;line-height:1.45}.e46-component-parts{margin:20px 0 0;padding:0;list-style:none}.e46-component-parts li{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.11);color:#c7c9ca;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.78rem}.e46-component-sources{display:grid;gap:8px;margin-top:20px}.e46-component-source{display:grid;grid-template-columns:1fr auto;gap:14px;padding:12px;border:1px solid rgba(255,255,255,.15);color:#fff!important;text-decoration:none}.e46-component-source:hover{border-color:#6fa8dc;background:rgba(28,105,212,.08);text-decoration:none}.e46-component-source small{display:block;margin-bottom:4px;color:#71777d;font-size:.58rem;letter-spacing:.12em;text-transform:uppercase}.e46-component-source strong{font-size:.8rem}.e46-component-source>span:last-child{align-self:center;color:#70a9dd;font-size:.7rem;font-weight:900}.e46-data-note{margin-top:18px;padding:12px;border-left:3px solid #6fa8dc;background:rgba(28,105,212,.07);color:#9ea3a7;font-size:.75rem;line-height:1.45}
@media(max-width:900px){.e46-component-view{grid-template-columns:1fr}.e46-component-visual{min-height:390px}}
@media(max-width:650px){.e46-component-nav,.e46-mini-data{grid-template-columns:1fr}.e46-component-card{min-height:104px}.e46-component-details{padding:20px}.e46-component-visual-main{min-height:270px}}
"""


def _pipes(items: list[str]) -> str:
    return "|".join(items)


def _system_tile(system: dict) -> str:
    if system["image"]:
        visual = f'<div class="e46-system-image"><img src="{escape(system["image"], quote=True)}" alt="{escape(system["title"])} exploded diagram"></div>'
    else:
        visual = f'<div class="e46-system-image e46-schematic"><span class="e46-schematic-mark">{escape(system["index"])}</span></div>'
    extra_components = []
    if system["key"] == "cooling":
        extra_components = [item["title"] for item in COOLING_COMPONENTS]
    items = system["components"] + extra_components
    attrs = (
        f'data-key="{escape(system["key"])}" data-title="{escape(system["title"], quote=True)}" '
        f'data-subtitle="{escape(system["subtitle"], quote=True)}" data-search="{escape(system["search"], quote=True)}" '
        f'data-items="{escape(_pipes(items), quote=True)}" data-aliases="{escape(_pipes(system["aliases"]), quote=True)}" '
        f'data-symptoms="{escape(_pipes(system["symptoms"]), quote=True)}"'
    )
    return (
        f'<button class="e46-system" type="button" {attrs}>' + visual + '<div class="e46-system-copy">'
        + f'<span class="e46-system-index">GROUP {escape(system["index"])}</span>'
        + f'<h3>{escape(system["title"])}</h3><p>{escape(system["subtitle"])}</p>'
        + '<span class="e46-open">Open workshop →</span></div></button>'
    )


def _component_nav() -> str:
    return '<div class="e46-component-nav">' + ''.join(
        f'<button class="e46-component-card" type="button" data-component="{escape(item["key"])}">'
        f'<span class="e46-component-group">GROUP {escape(item["group"])}</span>'
        f'<strong>{escape(item["title"])}</strong>'
        f'<span>{escape(item["check"].split(",")[0])}</span><span class="e46-component-open">→</span></button>'
        for item in COOLING_COMPONENTS
    ) + '</div>'


def _system_template(system: dict) -> str:
    if system["key"] != "cooling":
        return base._system_template(system)
    diagram = f'<img src="{escape(system["image"], quote=True)}" alt="Cooling system exploded diagram">'
    return (
        '<template id="e46-template-cooling"><div class="e46-workshop">'
        '<div class="e46-visual">'
        '<div class="e46-visual-head"><span>Cooling system</span><span>System overview</span></div>'
        f'<div class="e46-diagram">{diagram}</div>'
        f'<div class="e46-source-credit">Exploded-view language from <a href="{escape(system["realoem"], quote=True)}" target="_blank" rel="noopener noreferrer">RealOEM</a>. Open original source for numbered fitment.</div>'
        '</div><div class="e46-work-details">'
        '<span class="e46-work-kicker">GROUP 11 / 17 / 64</span><h3 class="e46-work-title">Cooling</h3>'
        '<p class="e46-work-primary">Choose the component you are actually working on.</p>'
        '<div class="e46-ref-actions">'
        f'<a class="e46-ref" href="{escape(system["realoem"], quote=True)}" target="_blank" rel="noopener noreferrer"><span>RealOEM cooling catalog</span><span>OPEN ↗</span></a>'
        f'<a class="e46-ref" href="{escape(CHARM, quote=True)}" target="_blank" rel="noopener noreferrer"><span>2004 330Ci repair / diagnosis index</span><span>OPEN ↗</span></a>'
        '</div><div class="e46-drill-label">Drill into component</div>' + _component_nav() +
        '<div class="e46-data-note">The vehicle profile still needs transmission, VIN and production month. Where those affect cooling fitment, this workspace intentionally shows the fork instead of guessing.</div>'
        '</div></div></template>'
    )


def _component_template(item: dict) -> str:
    cooling = next(system for system in SYSTEMS if system["key"] == "cooling")
    diagram = f'<img src="{escape(cooling["image"], quote=True)}" alt="{escape(item["title"])} cooling-system reference diagram">'
    parts = ''.join(f'<li>{escape(value)}</li>' for value in item["part_numbers"])
    sources = ''.join(
        f'<a class="e46-component-source" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">'
        f'<span><small>{escape(kind)}</small><strong>{escape(label)}</strong></span><span>OPEN ↗</span></a>'
        for kind, label, url in item["sources"]
    )
    return (
        f'<template id="e46-component-{escape(item["key"])}"><div class="e46-component-view">'
        '<div class="e46-component-visual">'
        f'<div class="e46-component-visual-head"><span>Cooling / {escape(item["title"])}</span><span>Reference view</span></div>'
        f'<div class="e46-component-visual-main">{diagram}<span class="e46-component-stamp">{escape(item["title"])}</span></div>'
        '<div class="e46-component-credit">Use the linked RealOEM page for numbered components and exact catalog context; use the service source for procedure/specification context.</div>'
        '</div><div class="e46-component-details">'
        '<div class="e46-component-breadcrumb"><button class="e46-component-back" type="button">Cooling</button><span>/</span><span>Component</span></div>'
        f'<h3 class="e46-component-title">{escape(item["title"])}</h3><p class="e46-component-sub">GROUP {escape(item["group"])}</p>'
        '<div class="e46-mini-data">'
        f'<div><span>Check / diagnose</span><p>{escape(item["check"])}</p></div>'
        f'<div><span>While access is open</span><p>{escape(item["adjacent"])}</p></div></div>'
        f'<ul class="e46-component-parts">{parts}</ul><div class="e46-component-sources">{sources}</div>'
        '</div></div></template>'
    )


def _build_systems_body() -> str:
    tiles = ''.join(_system_tile(system) for system in SYSTEMS)
    system_templates = ''.join(_system_template(system) for system in SYSTEMS)
    component_templates = ''.join(_component_template(item) for item in COOLING_COMPONENTS)
    component_index = ''.join(
        f'<span class="e46-search-doc" data-doc-type="component" data-system="cooling" data-component="{escape(item["key"])}" '
        f'data-title="{escape(item["title"], quote=True)}" data-search="{escape(_pipes(item["aliases"] + item["symptoms"] + item["part_numbers"]), quote=True)}"></span>'
        for item in COOLING_COMPONENTS
    )
    return (
        '<div class="e46-index-head"><div><span class="e46-search-kicker">Find anything on this car</span>'
        '<p class="e46-index-note">Search by component, symptom, abbreviation, part number, or system. Or browse visually.</p></div>'
        '<div><div class="e46-search-shell"><input class="e46-search" type="search" aria-label="Search E46 workshop" placeholder="water pump, P0174, shimmy, 11517509985, flex disc..."><button class="e46-search-clear" type="button">Clear</button></div><div class="e46-search-meta"></div><div class="e46-search-results"></div><div class="e46-didyoumean">Did you mean <button class="e46-spelling" type="button"></button>?</div></div></div>'
        f'<div class="e46-system-grid">{tiles}</div>{component_index}{system_templates}{component_templates}'
    )


def _build_workspace_body() -> str:
    return '<div class="e46-workspace-top"><button class="e46-back" type="button">← System index</button><span class="e46-fitment">2004 330Ci Coupe / M54 • transmission + VIN + production month still to be set</span></div><div class="e46-workspace-body"></div>'


def _build_source_body() -> str:
    sources = [
        ("Parts / exploded views", "RealOEM", REALOEM_CAR),
        ("Repair / diagnosis", "Operation CHARM", CHARM),
        ("Factory technical info", "BMW TechInfo / ISTA-AIR", BMW_TIS),
        ("Parts / DIY ecosystem", "FCP Euro", FCP_COOLING),
        ("Community evidence", "Bimmerforums E46", BIMMERFORUMS),
    ]
    return '<div class="e46-source-strip">' + ''.join(
        f'<a class="e46-source-tile" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer"><span class="e46-source-type">{escape(kind)}</span><strong>{escape(name)}</strong><span>Open source ↗</span></a>'
        for kind, name, url in sources
    ) + '</div>'


EXTRA_JS = r"""
(function(){
  const systemsCard=document.querySelector('.card--e46_systems');
  const workspaceCard=document.querySelector('.card--e46_workspace');
  if(!systemsCard||!workspaceCard)return;
  const grid=systemsCard.querySelector('.e46-system-grid');
  const buttons=[...systemsCard.querySelectorAll('.e46-system')];
  const componentDocs=[...systemsCard.querySelectorAll('.e46-search-doc')];
  const input=systemsCard.querySelector('.e46-search');
  const clear=systemsCard.querySelector('.e46-search-clear');
  const meta=systemsCard.querySelector('.e46-search-meta');
  const results=systemsCard.querySelector('.e46-search-results');
  const didYouMean=systemsCard.querySelector('.e46-didyoumean');
  const spelling=systemsCard.querySelector('.e46-spelling');
  const workspace=workspaceCard.querySelector('.e46-workspace-body');
  const back=workspaceCard.querySelector('.e46-back');

  const normalize=v=>(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const compact=v=>normalize(v).replace(/\s+/g,'');
  function lev(a,b){a=normalize(a);b=normalize(b);if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;const p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let d=p[0];p[0]=i;for(let j=1;j<=b.length;j++){const o=p[j];p[j]=Math.min(p[j]+1,p[j-1]+1,d+(a[i-1]===b[j-1]?0:1));d=o;}}return p[b.length];}
  function sim(a,b){const aa=normalize(a),bb=normalize(b),m=Math.max(aa.length,bb.length);return m?1-lev(aa,bb)/m:1;}
  function scoreTerm(q,t){q=normalize(q);t=normalize(t);if(!q||!t)return 0;if(q===t)return 1;if(compact(q)===compact(t))return .99;if(t.startsWith(q)&&q.length>=2)return .95;if(q.startsWith(t)&&t.length>=3)return .87;if(compact(t).includes(compact(q))&&compact(q).length>=3)return .9;const s=sim(q,t),th=q.length<=3?.62:q.length===4?.66:.7;return s>=th?s*.87:0;}
  function makeDoc(obj){const raw=[obj.title,obj.subtitle||'',obj.search||'',...(obj.items||[]),...(obj.aliases||[]),...(obj.symptoms||[])];const phrases=raw.filter(Boolean);const tokens=[...new Set(normalize(raw.join(' ')).split(' ').filter(Boolean))];return {...obj,phrases,tokens};}
  const docs=[];
  buttons.forEach((btn,index)=>{btn.dataset.order=String(index);docs.push(makeDoc({type:'system',key:btn.dataset.key,title:btn.dataset.title||btn.querySelector('h3')?.textContent||'',subtitle:btn.dataset.subtitle||'',search:btn.dataset.search||'',items:(btn.dataset.items||'').split('|').filter(Boolean),aliases:(btn.dataset.aliases||'').split('|').filter(Boolean),symptoms:(btn.dataset.symptoms||'').split('|').filter(Boolean),button:btn,index}));});
  componentDocs.forEach((node,index)=>docs.push(makeDoc({type:'component',system:node.dataset.system,component:node.dataset.component,title:node.dataset.title||'',search:node.dataset.search||'',index:100+index})));
  const lexicon=[...new Set(docs.flatMap(d=>[...d.phrases,...d.tokens]))];
  function best(doc,q){const nq=normalize(q);let hit={score:0,label:doc.title};for(const phrase of doc.phrases){const s=scoreTerm(nq,phrase);if(s>hit.score)hit={score:s,label:phrase};}const qts=nq.split(' ').filter(Boolean);let total=0;for(const qt of qts){let local=0,label='';for(const token of doc.tokens){const s=scoreTerm(qt,token);if(s>local){local=s;label=token;}}total+=local;if(local>hit.score)hit={score:local,label};}if(qts.length>1)hit.score=Math.max(hit.score,total/qts.length*.96);return hit;}
  function nearest(q){q=normalize(q);if(q.length<3)return null;let b=null;for(const term of lexicon){const nt=normalize(term);if(!nt||nt===q||Math.abs(nt.length-q.length)>4)continue;const s=sim(q,nt);if(!b||s>b.score)b={term,score:s};}return b&&b.score>=.63?b:null;}
  function showSystem(key,scroll=true){const template=document.getElementById('e46-template-'+key);if(!template||!workspace)return;workspace.innerHTML=template.innerHTML;workspaceCard.classList.add('is-open');if(scroll)workspaceCard.scrollIntoView({behavior:'smooth',block:'start'});}
  function showComponent(key){const template=document.getElementById('e46-component-'+key);if(!template||!workspace)return;workspace.innerHTML=template.innerHTML;workspaceCard.classList.add('is-open');workspaceCard.scrollIntoView({behavior:'smooth',block:'start'});}
  function openDoc(doc){if(doc.type==='component')showComponent(doc.component);else showSystem(doc.key);}
  buttons.forEach(btn=>btn.addEventListener('click',()=>showSystem(btn.dataset.key)));
  workspaceCard.addEventListener('click',event=>{const component=event.target.closest('.e46-component-card');if(component){showComponent(component.dataset.component);return;}const componentBack=event.target.closest('.e46-component-back');if(componentBack){showSystem('cooling',false);}});
  if(back)back.addEventListener('click',()=>{workspaceCard.classList.remove('is-open');systemsCard.scrollIntoView({behavior:'smooth',block:'start'});});
  function apply(){const q=normalize(input?.value||'');const scored=docs.map(d=>({...d,hit:q?best(d,q):{score:1,label:d.title}})).sort((a,b)=>b.hit.score-a.hit.score||a.index-b.index);const threshold=q?(q.length<=3?.49:.47):0;const visible=q?scored.filter(x=>x.hit.score>=threshold):scored;buttons.forEach(btn=>{const related=!q||visible.some(x=>(x.type==='system'&&x.key===btn.dataset.key)||(x.type==='component'&&x.system===btn.dataset.key));btn.classList.toggle('is-filtered',!related);btn.classList.remove('is-best');});if(q&&visible[0]){const key=visible[0].type==='component'?visible[0].system:visible[0].key;buttons.find(b=>b.dataset.key===key)?.classList.add('is-best');}if(grid&&q){const systemScores=buttons.map(btn=>({btn,score:Math.max(0,...visible.filter(x=>(x.type==='system'&&x.key===btn.dataset.key)||(x.type==='component'&&x.system===btn.dataset.key)).map(x=>x.hit.score)),order:Number(btn.dataset.order)})).sort((a,b)=>b.score-a.score||a.order-b.order);systemScores.forEach(x=>grid.appendChild(x.btn));}else if(grid){buttons.sort((a,b)=>Number(a.dataset.order)-Number(b.dataset.order)).forEach(btn=>grid.appendChild(btn));}
    if(meta)meta.textContent=q?(visible.length?`${visible.length} ranked result${visible.length===1?'':'s'} • components + systems`:'No strong indexed match yet'):'Search systems, components, symptoms, jobs, abbreviations, or part numbers';
    if(results){results.innerHTML='';if(q&&visible.length){visible.slice(0,6).forEach((item,i)=>{const row=document.createElement('button');row.type='button';row.className='e46-result';const path=item.type==='component'?`Cooling → ${item.title}`:item.title;row.innerHTML=`<span><span class="e46-result-type">${item.type}</span><span class="e46-result-system">${item.title}</span><span class="e46-result-path">${path} • matched ${item.hit.label}</span></span><span class="e46-result-rank">${i===0?'Best match':'Open'}</span>`;row.addEventListener('click',()=>openDoc(item));results.appendChild(row);});results.classList.add('is-open');}else results.classList.remove('is-open');}
    const near=q?nearest(q):null,strong=visible[0]?.hit.score||0;if(didYouMean&&spelling){if(near&&strong<.86){spelling.textContent=near.term;spelling.dataset.term=near.term;didYouMean.classList.add('is-open');}else didYouMean.classList.remove('is-open');}
    return visible;
  }
  if(input){input.addEventListener('input',apply);input.addEventListener('keydown',event=>{if(event.key==='Enter'){const visible=apply();if(visible[0])openDoc(visible[0]);}});}
  if(clear)clear.addEventListener('click',()=>{if(input){input.value='';apply();input.focus();}});
  if(spelling)spelling.addEventListener('click',()=>{if(input&&spelling.dataset.term){input.value=spelling.dataset.term;apply();input.focus();}});
  apply();
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    del seed
    cards = [
        CardItem(card_type="e46_systems", eyebrow="WORKSHOP INDEX", title="Find It. Then Drill In.", body=_build_systems_body()),
        CardItem(card_type="e46_workspace", eyebrow="WORKSPACE", title="System / Component", body=_build_workspace_body()),
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
