from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "e46_owner_companion_v4"

THEME_CONFIG = {
    "page_title": "E46 Workshop — 2004 BMW 330Ci",
    "header_title": "330Ci / E46",
    "header_subtitle": "One-car workshop index: diagrams, fitment, service references, diagnosis, parts, and maintenance.",
    "footer_text": (
        "Unofficial owner-built reference hub. Source material remains with its original publisher. "
        "Confirm VIN / production month before relying on fitment or production-specific procedures."
    ),
    "hero_kicker": "2004 // E46 COUPE // M54B30",
    "hero_summary_pill": "SEARCH • SYSTEMS • WORKSHOP • SOURCES",
}


REALOEM_CAR = "https://www.realoem.com/bmw/enUS/partgrp?id=BD53-USA-10-2004-E46-BMW-330Ci"
CHARM = "https://charm.li/BMW/2004/330Ci%20Coupe%20%28E46%29%20L6-3.0L%20%28M54%29/"
BMW_TIS = "https://bmwtechinfo.bmwgroup.com/tisUI/"
BMW_CLASSIC = "https://www.bmwgroup-classic.com/en/models/bmw-classics/product-description-page.ad-1002-1.bmw-330ci-coupe-e46.html"
BIMMERFORUMS = "https://www.bimmerforums.com/forum/forumdisplay.php?15-1999-2006-%28E46%29"
FCP_COOLING = "https://www.fcpeuro.com/BMW-parts/330Ci/Cooling-System/"


SYSTEMS = [
    {
        "key": "engine",
        "index": "11",
        "title": "Engine / Top End",
        "subtitle": "M54B30",
        "aliases": ["motor", "top end", "cylinder head", "head", "intake", "vacuum", "crankcase"],
        "symptoms": ["oil leak", "burning oil", "rough idle", "vacuum leak", "misfire", "lean code", "rattle"],
        "search": "engine motor m54 m54b30 valve cover gasket valvecover vcg vanos ccv pcv disa oil separator oil filter housing ofhg oil leak head cylinder intake crankcase vacuum rough idle misfire lean rattle",
        "image": "https://www.realoem.com/bmw/images/diag_eil.jpg",
        "realoem": REALOEM_CAR + "&mg=11",
        "primary": "Cylinder head / induction / accessory drive",
        "components": ["Valve cover", "VANOS", "CCV / oil separator", "DISA / intake", "Oil filter housing", "Belts / accessories"],
        "part_numbers": ["11127512839 — cylinder head cover", "11120030496 — profile gasket set"],
        "job_notes": ["Trace leaks from the highest fresh source.", "Keep crankcase-ventilation / vacuum faults separate from external oil leaks.", "Production month matters for several engine-side revisions."],
    },
    {
        "key": "cooling",
        "index": "17",
        "title": "Cooling",
        "subtitle": "Pump / thermostat / radiator",
        "aliases": ["coolant system", "water system", "temperature", "temp", "cooling loop"],
        "symptoms": ["overheat", "overheating", "runs hot", "coolant leak", "low coolant", "no heat", "pressure loss"],
        "search": "cooling coolant overheat overheating hot temperature temp expansion tank radiator water pump waterpump pump thermostat thermstat hoses fan shroud bleed bleeding pressure test leak low coolant no heat",
        "image": "https://www.realoem.com/bmw/images/diag_3c1l.jpg",
        "realoem": REALOEM_CAR + "&mg=17",
        "primary": "Coolant pump / thermostat / radiator circuit",
        "components": ["Water pump", "Thermostat", "Expansion tank", "Radiator", "Upper / lower hoses", "Fan / shroud"],
        "part_numbers": ["11517509985 — mechanical coolant pump", "11537509227 — thermostat housing / thermostat"],
        "job_notes": ["Pressure-test before chasing a vague leak.", "If drained, inspect adjacent plastic and belt-drive items while access is open.", "Any active overheat is a stop-driving event."],
    },
    {
        "key": "front_axle",
        "index": "31 / 32",
        "title": "Front Axle / Steering",
        "subtitle": "Control arms / rack / bushings",
        "aliases": ["front end", "front suspension", "suspension", "steering", "front subframe", "wheel alignment"],
        "symptoms": ["clunk", "shake", "shimmy", "wandering", "vibration", "play", "pulling", "loose steering"],
        "search": "front axle front end steering suspension control arm wishbone fcab bushing tie rod rack ball joint clunk shake vibration shimmy alignment wandering pull play loose steering subframe",
        "image": "https://www.realoem.com/bmw/images/diag_7nzb.jpg",
        "realoem": REALOEM_CAR + "&mg=31",
        "primary": "Front axle support / wishbone / steering linkage",
        "components": ["Control arms", "FCABs", "Ball joints", "Tie rods", "Steering rack", "Front subframe"],
        "part_numbers": ["31111096902 — front axle support", "31126783376 — bracket / rubber mounting set"],
        "job_notes": ["Separate wheel/tire vibration from bushing and ball-joint play.", "Alignment follows geometry-changing work.", "Check both sides loaded and unloaded."],
    },
    {
        "key": "brakes",
        "index": "34",
        "title": "Brakes / DSC",
        "subtitle": "Hydraulics / friction / wheel speed",
        "aliases": ["braking", "stopping", "abs", "traction control", "stability control"],
        "symptoms": ["soft pedal", "brake vibration", "pulling under braking", "abs light", "dsc light", "grinding", "squeal"],
        "search": "brakes braking brake stopping rotor disc pads caliper hose dsc abs traction stability sensor wheel speed soft pedal vibration fluid bleed grinding squeal pull",
        "image": "https://www.realoem.com/bmw/images/diag_35nq.jpg",
        "realoem": REALOEM_CAR + "&mg=34",
        "primary": "330Ci brake hardware / hydraulics / DSC inputs",
        "components": ["Rotors", "Pads", "Calipers", "Hoses", "Pad sensors", "DSC / wheel-speed sensors"],
        "part_numbers": ["34116864047 — front ventilated brake disc (325x25)"],
        "job_notes": ["Measure and inspect instead of replacing by interval alone.", "Include hoses, sliders, sensors, fluid, and hardware condition.", "Use a service source for torque and bleed sequence."],
    },
    {
        "key": "driveline",
        "index": "21–26 / 33",
        "title": "Driveline",
        "subtitle": "Transmission / shaft / differential",
        "aliases": ["drivetrain", "drive train", "powertrain", "prop shaft", "rear end"],
        "symptoms": ["driveline vibration", "clunk on shift", "shudder", "gearbox noise", "diff whine", "mount movement"],
        "search": "driveline drivetrain drive train powertrain transmission gearbox manual automatic clutch converter guibo flex disc flexdisc driveshaft drive shaft prop shaft center support bearing csb differential diff rear axle shifter mount clunk shudder vibration whine",
        "image": "",
        "realoem": REALOEM_CAR + "&mg=26",
        "primary": "Transmission / prop shaft / differential path",
        "components": ["Transmission", "Clutch / converter", "Guibo / flex disc", "Center support bearing", "Driveshaft", "Differential / mounts"],
        "part_numbers": [],
        "job_notes": ["Transmission type must be captured before fitment becomes specific.", "NVH diagnosis should separate mounts, guibo, CSB, differential, and wheel-speed-related vibration."],
    },
    {
        "key": "electrical",
        "index": "12 / 61 / 62",
        "title": "Electrical / Diagnostics",
        "subtitle": "DME / charging / modules",
        "aliases": ["electronics", "wiring", "diagnostics", "computer", "ecu", "module", "charging system"],
        "symptoms": ["no start", "no crank", "dead battery", "battery drain", "warning light", "fault code", "charging issue"],
        "search": "electrical electronics wiring diagnostic diagnostics dme ecu computer battery alternator starter sensors codes fault code obd obd2 scan scanner module k bus can bus no start nostart no crank crank charging parasitic drain grounds warning light",
        "image": "",
        "realoem": REALOEM_CAR + "&mg=61",
        "primary": "Power distribution / DME / modules / diagnosis",
        "components": ["Battery / charging", "Starter", "DME", "Sensors", "K-bus / modules", "Grounds / distribution"],
        "part_numbers": [],
        "job_notes": ["Scan BMW modules before replacing electronics from symptom alone.", "Voltage and grounds come before module condemnation.", "Record exact codes and module names, not only generic OBD descriptions."],
    },
    {
        "key": "body",
        "index": "41 / 51 / 52 / 54",
        "title": "Body / Interior",
        "subtitle": "Coupe-specific hardware",
        "aliases": ["cabin", "interior", "exterior", "door", "trim", "glass"],
        "symptoms": ["window stuck", "door won't lock", "sunroof leak", "water leak", "rattle", "seat issue"],
        "search": "body cabin interior exterior window regulator door lock seat sunroof trim weatherstrip weather seal coupe glass latch mirror headliner leak water leak rattle window stuck",
        "image": "",
        "realoem": REALOEM_CAR + "&mg=41",
        "primary": "Coupe body / trim / mechanisms",
        "components": ["Window regulators", "Door / lock hardware", "Sunroof", "Seats", "Weather seals", "Trim / glass"],
        "part_numbers": [],
        "job_notes": ["Keep coupe-specific glass, door, seal, and trim guidance separate from sedan guidance.", "Use the parts diagram first when mechanisms contain multiple clips, carriers, or revisions."],
    },
]


EXTRA_CSS = r"""
:root{--bg:#0c0d0e;--paper:#efeee8;--paper2:#f7f6f1;--line:rgba(255,255,255,.17);--blue:#1c69d4;--blue2:#62aae3;--text:#f5f5f1;--muted:#979ca2;--max-width:1280px;--radius-xl:0;--radius-lg:0;--radius-md:0}
html{background:var(--bg)}body{background:linear-gradient(rgba(11,12,13,.965),rgba(11,12,13,.985)),repeating-linear-gradient(0deg,transparent 0 39px,rgba(255,255,255,.025) 40px),repeating-linear-gradient(90deg,transparent 0 39px,rgba(255,255,255,.025) 40px),var(--bg);color:var(--text);font-family:Arial,Helvetica,sans-serif}body::before,body::after{display:none}.hero-wrap{padding:0 18px}.hero-wrap::before{content:"";display:block;height:8px;max-width:var(--max-width);margin:0 auto;background:linear-gradient(90deg,#1c69d4 0 25%,#5aa9e6 25% 50%,#f5f5f2 50% 75%,transparent 75%)}
header.hero{min-height:250px;padding:34px 0 26px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;box-shadow:none;color:var(--text);backdrop-filter:none;overflow:visible}header.hero::before{display:none}header.hero::after{content:"E46-2 / BD53 / M54B30";position:absolute;right:0;bottom:27px;color:rgba(255,255,255,.15);font-weight:900;letter-spacing:.16em;font-size:clamp(.82rem,2vw,1.45rem)}.hero-kicker{padding:0;border:0;background:transparent;color:#8dbde9;font-size:.7rem;font-weight:900;letter-spacing:.18em}.hero h1{max-width:none;margin:.55rem 0 0;font-size:clamp(4rem,11vw,8.6rem);line-height:.76;letter-spacing:-.075em;text-transform:uppercase;font-weight:950}.hero .subtitle{max-width:760px;margin-top:22px;color:#c9cbc9;font-size:1rem;line-height:1.45}.hero-meta{margin-top:17px}.hero-meta .hero-pill:first-child{display:none}.hero-pill{padding:0;border:0;background:transparent;color:#82878c;font-size:.7rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
main{gap:0;padding-top:0}.card{grid-column:span 12;min-height:0;margin:0;padding:38px 0;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;color:var(--text);box-shadow:none;backdrop-filter:none;overflow:visible}.card:hover{transform:none;box-shadow:none}.card::before,.card::after{display:none}.card-head{align-items:end;margin:0 0 22px;padding:0;border:0}.eyebrow{color:#79afe3;font-size:.66rem;font-weight:900;letter-spacing:.17em}h2{color:var(--text);font-size:clamp(2rem,4.8vw,4.1rem);line-height:.88;letter-spacing:-.055em;text-transform:uppercase}.icon-badge,.source{display:none}.body{color:#ced0ce;font-size:.97rem;line-height:1.5}
.e46-index-head{display:grid;grid-template-columns:.31fr .69fr;gap:36px;align-items:start;margin-bottom:22px}.e46-index-note{max-width:380px;margin:6px 0 0;color:#8d9297;font-size:.9rem}.e46-search-zone{position:relative}.e46-search-shell{display:grid;grid-template-columns:auto 1fr auto;align-items:center;border:1px solid rgba(255,255,255,.34);background:#0f1113;box-shadow:0 0 0 1px rgba(0,0,0,.65),0 14px 34px rgba(0,0,0,.25)}.e46-search-icon{padding-left:17px;color:#6fa9df;font-size:1.15rem}.e46-search{width:100%;min-height:66px;padding:0 14px;border:0;outline:0;background:transparent;color:#fff;font:700 1.04rem Arial,Helvetica,sans-serif}.e46-search::placeholder{color:#70767c;font-weight:500}.e46-search-clear{height:66px;padding:0 18px;border:0;border-left:1px solid rgba(255,255,255,.16);background:transparent;color:#aeb3b8;font-weight:900;text-transform:uppercase;letter-spacing:.1em;cursor:pointer}.e46-search-shell:focus-within{border-color:#5d9edb;box-shadow:0 0 0 1px #1c69d4,0 18px 42px rgba(0,0,0,.32)}.e46-search-meta{min-height:24px;margin-top:8px;color:#7a8086;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase}.e46-search-results{display:none;margin-top:8px;border:1px solid rgba(255,255,255,.18);background:#111315}.e46-search-results.is-open{display:block}.e46-result{display:grid;width:100%;grid-template-columns:1fr auto;gap:16px;align-items:center;padding:12px 14px;border:0;border-bottom:1px solid rgba(255,255,255,.11);background:transparent;color:#fff;text-align:left;cursor:pointer}.e46-result:last-child{border-bottom:0}.e46-result:hover,.e46-result:focus-visible{background:rgba(28,105,212,.12);outline:none}.e46-result-system{display:block;color:#fff;font-weight:900}.e46-result-hit{display:block;margin-top:3px;color:#898f95;font-size:.78rem}.e46-result-rank{color:#6fa9df;font-size:.66rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.e46-didyoumean{display:none;margin-top:8px;color:#8b9197;font-size:.8rem}.e46-didyoumean.is-open{display:block}.e46-spelling{padding:0;border:0;background:transparent;color:#78b2e7;font:inherit;font-weight:900;cursor:pointer}
.e46-system-grid{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-left:1px solid var(--line)}.e46-system{position:relative;display:flex;min-height:295px;flex-direction:column;padding:0;border:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(255,255,255,.025);color:#fff;text-align:left;cursor:pointer;overflow:hidden;transition:background .16s ease,transform .16s ease,opacity .16s ease}.e46-system:hover,.e46-system:focus-visible{background:rgba(28,105,212,.10);transform:translateY(-2px);outline:none}.e46-system.is-filtered{display:none}.e46-system.is-best{background:linear-gradient(180deg,rgba(28,105,212,.13),rgba(255,255,255,.025))}.e46-system.is-best::after{content:"BEST MATCH";position:absolute;top:10px;right:10px;padding:5px 7px;background:#1c69d4;color:white;font-size:.58rem;font-weight:900;letter-spacing:.12em}.e46-system-image{height:174px;display:grid;place-items:center;padding:12px;background:var(--paper);overflow:hidden}.e46-system-image img{width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply;filter:contrast(1.04)}.e46-system-image.e46-schematic{position:relative;background:linear-gradient(135deg,#1a1c1e,#101113);color:#83b6e5}.e46-system-image.e46-schematic::before,.e46-system-image.e46-schematic::after{content:"";position:absolute;background:rgba(111,169,223,.16)}.e46-system-image.e46-schematic::before{width:70%;height:1px}.e46-system-image.e46-schematic::after{width:1px;height:70%}.e46-schematic-mark{z-index:1;font-size:3.05rem;font-weight:950;letter-spacing:-.07em}.e46-system-copy{display:flex;flex:1;flex-direction:column;padding:18px}.e46-system-index{color:#6ea7da;font-size:.66rem;font-weight:900;letter-spacing:.16em}.e46-system h3{margin:8px 0 3px;color:#fff;font-size:1.38rem;line-height:1;letter-spacing:-.04em}.e46-system p{margin:0;color:#8f9499;font-size:.8rem}.e46-open{margin-top:auto;padding-top:18px;color:#76ade0;font-size:.68rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.card--e46_workspace{display:none}.card--e46_workspace.is-open{display:block}.e46-workspace-top{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:24px}.e46-back{border:0;background:transparent;color:#86b7e4;font-weight:900;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.e46-fitment{color:#73787e;font-size:.7rem;text-transform:uppercase;letter-spacing:.09em}.e46-workshop{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(330px,.82fr);border:1px solid var(--line);box-shadow:0 22px 60px rgba(0,0,0,.22)}.e46-visual{min-height:520px;display:flex;flex-direction:column;background:var(--paper);color:#17191b}.e46-visual-head{display:flex;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid #cacac5;color:#62666b;font-size:.68rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.e46-diagram{flex:1;display:grid;place-items:center;min-height:390px;padding:22px}.e46-diagram img{max-width:100%;max-height:445px;object-fit:contain;mix-blend-mode:multiply}.e46-diagram-placeholder{font-size:clamp(4rem,10vw,8rem);font-weight:950;color:#d5d4cf;letter-spacing:-.08em}.e46-source-credit{padding:12px 16px;border-top:1px solid #cacac5;color:#64686d;font-size:.72rem}.e46-source-credit a{color:#155fb8}.e46-work-details{padding:27px;background:#131516}.e46-work-kicker{color:#6da6dc;font-size:.66rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.e46-work-title{margin:7px 0 5px;color:#fff;font-size:clamp(2rem,4vw,3.7rem);line-height:.9;letter-spacing:-.06em}.e46-work-primary{margin:0 0 20px;color:#8d9297}.e46-component-grid{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:24px}.e46-component{padding:7px 9px;border:1px solid rgba(255,255,255,.17);color:#d4d4d0;font-size:.76rem}.e46-ref-actions{display:grid;gap:8px;margin-bottom:24px}.e46-ref{display:flex;justify-content:space-between;gap:14px;padding:12px 13px;border:1px solid rgba(255,255,255,.16);color:#f4f4f1!important;text-decoration:none;font-weight:800}.e46-ref:hover{border-color:#6da6dc;background:rgba(28,105,212,.09);text-decoration:none}.e46-ref span:last-child{color:#6da6dc}.e46-data-block{padding-top:17px;border-top:1px solid rgba(255,255,255,.15)}.e46-data-label{margin-bottom:8px;color:#777d83;font-size:.64rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.e46-parts,.e46-notes{margin:0;padding-left:18px;color:#c1c3c3}.e46-parts li,.e46-notes li{margin:.35rem 0}.e46-data-block+.e46-data-block{margin-top:18px}
.e46-source-strip{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);border-left:1px solid var(--line)}.e46-source-tile{min-height:142px;padding:18px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);color:#fff!important;text-decoration:none;background:rgba(255,255,255,.025)}.e46-source-tile:hover{background:rgba(28,105,212,.10);text-decoration:none}.e46-source-tile strong{display:block;margin-bottom:8px;color:#fff}.e46-source-tile span{color:#7d8389;font-size:.76rem}.e46-source-type{display:block!important;margin-bottom:18px!important;color:#6da6dc!important;font-size:.62rem!important;letter-spacing:.13em;text-transform:uppercase}
@media(max-width:1020px){.e46-system-grid{grid-template-columns:repeat(2,1fr)}.e46-workshop{grid-template-columns:1fr}.e46-source-strip{grid-template-columns:repeat(2,1fr)}.e46-index-head{grid-template-columns:1fr}}
@media(max-width:650px){.hero h1{font-size:clamp(3.6rem,20vw,6rem)}header.hero::after{display:none}.card{padding:30px 0}.e46-system-grid,.e46-source-strip{grid-template-columns:1fr}.e46-system{min-height:238px}.e46-system-image{height:145px}.e46-workspace-top{align-items:flex-start;flex-direction:column}.e46-visual{min-height:390px}.e46-diagram{min-height:280px}.e46-work-details{padding:20px}.e46-search{font-size:.94rem}.e46-search-clear{padding:0 12px}}
"""


EXTRA_JS = r"""
(function(){
  const systemsCard=document.querySelector('.card--e46_systems');
  const workspaceCard=document.querySelector('.card--e46_workspace');
  if(!systemsCard || !workspaceCard)return;
  const grid=systemsCard.querySelector('.e46-system-grid');
  const buttons=[...systemsCard.querySelectorAll('.e46-system')];
  const input=systemsCard.querySelector('.e46-search');
  const clear=systemsCard.querySelector('.e46-search-clear');
  const meta=systemsCard.querySelector('.e46-search-meta');
  const results=systemsCard.querySelector('.e46-search-results');
  const didYouMean=systemsCard.querySelector('.e46-didyoumean');
  const spelling=systemsCard.querySelector('.e46-spelling');
  const workspace=workspaceCard.querySelector('.e46-workspace-body');
  const back=workspaceCard.querySelector('.e46-back');
  const generalTerms=['car','vehicle','engine','motor','coolant','brakes','steering','suspension','driveline','electrical','body','interior','diagnostics'];

  const normalize=value=>(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const compact=value=>normalize(value).replace(/\s+/g,'');
  function levenshtein(a,b){
    a=normalize(a);b=normalize(b);
    if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
    const prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      let diag=prev[0];prev[0]=i;
      for(let j=1;j<=b.length;j++){
        const old=prev[j];
        prev[j]=Math.min(prev[j]+1,prev[j-1]+1,diag+(a[i-1]===b[j-1]?0:1));
        diag=old;
      }
    }
    return prev[b.length];
  }
  function similarity(a,b){
    const aa=normalize(a),bb=normalize(b);const m=Math.max(aa.length,bb.length);return m?1-levenshtein(aa,bb)/m:1;
  }
  function termScore(query,term){
    const q=normalize(query),t=normalize(term);if(!q||!t)return 0;
    if(q===t)return 1;
    if(compact(q)===compact(t))return .98;
    if(t.startsWith(q) && q.length>=2)return .94;
    if(q.startsWith(t) && t.length>=3)return .86;
    if(compact(t).includes(compact(q)) && compact(q).length>=3)return .88;
    const sim=similarity(q,t);
    const threshold=q.length<=2?.92:q.length===3?.64:q.length===4?.66:.7;
    return sim>=threshold?sim*.86:0;
  }

  const docs=buttons.map((btn,index)=>{
    btn.dataset.order=String(index);
    const title=btn.dataset.title||btn.querySelector('h3')?.textContent||'';
    const items=(btn.dataset.items||'').split('|').filter(Boolean);
    const aliases=(btn.dataset.aliases||'').split('|').filter(Boolean);
    const symptoms=(btn.dataset.symptoms||'').split('|').filter(Boolean);
    const raw=[title,btn.dataset.subtitle||'',btn.dataset.search||'',...items,...aliases,...symptoms].join(' ');
    const tokens=[...new Set(normalize(raw).split(' ').filter(Boolean))];
    const phrases=[title,...items,...aliases,...symptoms].filter(Boolean);
    return {btn,index,key:btn.dataset.key,title,items,aliases,symptoms,tokens,phrases};
  });
  const lexicon=[...new Set([...generalTerms,...docs.flatMap(d=>d.phrases),...docs.flatMap(d=>d.tokens)])];

  function bestHit(doc,q){
    const nq=normalize(q);if(!nq)return {score:1,label:doc.title};
    if(nq==='car'||nq==='vehicle')return {score:.58,label:'Whole vehicle'};
    let best={score:0,label:doc.title};
    for(const phrase of doc.phrases){const s=termScore(nq,phrase);if(s>best.score)best={score:s,label:phrase};}
    const qTokens=nq.split(' ').filter(Boolean);
    let tokenTotal=0;
    for(const qt of qTokens){let local=0;let label='';for(const token of doc.tokens){const s=termScore(qt,token);if(s>local){local=s;label=token;}}tokenTotal+=local;if(local>best.score)best={score:local,label};}
    if(qTokens.length>1)best.score=Math.max(best.score,tokenTotal/qTokens.length*.96);
    const whole=normalize([doc.title,...doc.phrases,...doc.tokens].join(' '));
    if(whole.includes(nq))best.score=Math.max(best.score,.97);
    return best;
  }

  function nearestTerm(q){
    const nq=normalize(q);if(nq.length<3)return null;
    let best=null;
    for(const term of lexicon){const nt=normalize(term);if(!nt||nt===nq||Math.abs(nt.length-nq.length)>4)continue;const s=similarity(nq,nt);if(!best||s>best.score)best={term,score:s};}
    return best&&best.score>=.62?best:null;
  }

  function showSystem(key){
    const template=document.getElementById('e46-template-'+key);if(!template||!workspace)return;
    workspace.innerHTML=template.innerHTML;workspaceCard.classList.add('is-open');workspaceCard.scrollIntoView({behavior:'smooth',block:'start'});
  }
  buttons.forEach(btn=>btn.addEventListener('click',()=>showSystem(btn.dataset.key)));
  if(back)back.addEventListener('click',()=>{workspaceCard.classList.remove('is-open');systemsCard.scrollIntoView({behavior:'smooth',block:'start'});});

  function applySearch(){
    const q=normalize(input?.value||'');
    const scored=docs.map(doc=>({...doc,hit:bestHit(doc,q)})).sort((a,b)=>b.hit.score-a.hit.score||a.index-b.index);
    const threshold=q?(q.length<=3?.5:.48):0;
    const visible=q?scored.filter(x=>x.hit.score>=threshold):scored;
    buttons.forEach(btn=>{btn.classList.remove('is-best');btn.classList.toggle('is-filtered',q&&!visible.some(x=>x.btn===btn));});
    if(q&&visible[0])visible[0].btn.classList.add('is-best');
    if(grid){(q?scored.sort((a,b)=>b.hit.score-a.hit.score||a.index-b.index):docs).forEach(x=>grid.appendChild(x.btn));}
    if(meta)meta.textContent=q?(visible.length?`${visible.length} system${visible.length===1?'':'s'} ranked • typo + partial matching on`:'No strong system match'):'Search systems, components, symptoms, jobs, or abbreviations';
    if(results){
      results.innerHTML='';
      if(q&&visible.length){visible.slice(0,4).forEach((item,i)=>{const row=document.createElement('button');row.type='button';row.className='e46-result';row.innerHTML=`<span><span class="e46-result-system">${item.title}</span><span class="e46-result-hit">Matched: ${item.hit.label}</span></span><span class="e46-result-rank">${i===0?'Best match':'Open'}</span>`;row.addEventListener('click',()=>showSystem(item.key));results.appendChild(row);});results.classList.add('is-open');}else results.classList.remove('is-open');
    }
    const near=q?nearestTerm(q):null;
    const strongest=visible[0]?.hit.score||0;
    if(didYouMean&&spelling){
      if(near&&near.term&&strongest<.86){spelling.textContent=near.term;spelling.dataset.term=near.term;didYouMean.classList.add('is-open');}
      else didYouMean.classList.remove('is-open');
    }
  }

  if(input){input.addEventListener('input',applySearch);input.addEventListener('keydown',event=>{if(event.key==='Enter'){const first=buttons.find(btn=>!btn.classList.contains('is-filtered'));if(first)showSystem(first.dataset.key);}});}
  if(clear)clear.addEventListener('click',()=>{if(input){input.value='';applySearch();input.focus();}});
  if(spelling)spelling.addEventListener('click',()=>{if(input&&spelling.dataset.term){input.value=spelling.dataset.term;applySearch();input.focus();}});
  applySearch();
})();
"""


def _a(url: str, label: str) -> str:
    return f'<a href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">{escape(label)}</a>'


def _pipes(items: list[str]) -> str:
    return "|".join(items)


def _system_tile(system: dict) -> str:
    if system["image"]:
        visual = f'<div class="e46-system-image"><img src="{escape(system["image"], quote=True)}" alt="{escape(system["title"])} exploded diagram"></div>'
    else:
        visual = f'<div class="e46-system-image e46-schematic"><span class="e46-schematic-mark">{escape(system["index"])}</span></div>'
    attrs = (
        f'data-key="{escape(system["key"])}" data-title="{escape(system["title"], quote=True)}" '
        f'data-subtitle="{escape(system["subtitle"], quote=True)}" data-search="{escape(system["search"], quote=True)}" '
        f'data-items="{escape(_pipes(system["components"]), quote=True)}" data-aliases="{escape(_pipes(system["aliases"]), quote=True)}" '
        f'data-symptoms="{escape(_pipes(system["symptoms"]), quote=True)}"'
    )
    return (
        f'<button class="e46-system" type="button" {attrs}>' + visual + '<div class="e46-system-copy">'
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
    extra_ref = ''
    if system["key"] == "cooling":
        extra_ref = f'<a class="e46-ref" href="{escape(FCP_COOLING, quote=True)}" target="_blank" rel="noopener noreferrer"><span>FCP Euro 330Ci cooling catalog</span><span>OPEN ↗</span></a>'
    return (
        f'<template id="e46-template-{escape(system["key"])}"><div class="e46-workshop"><div class="e46-visual">'
        f'<div class="e46-visual-head"><span>{escape(system["primary"])}</span><span>Exploded view</span></div>'
        f'<div class="e46-diagram">{diagram}</div>'
        f'<div class="e46-source-credit">Diagram source: {_a(system["realoem"], "RealOEM")}. Use the source page for numbered callouts and fitment.</div>'
        '</div><div class="e46-work-details">'
        f'<span class="e46-work-kicker">GROUP {escape(system["index"])}</span><h3 class="e46-work-title">{escape(system["title"])}</h3>'
        f'<p class="e46-work-primary">{escape(system["primary"])}</p><div class="e46-component-grid">{components}</div>'
        '<div class="e46-ref-actions">'
        f'<a class="e46-ref" href="{escape(system["realoem"], quote=True)}" target="_blank" rel="noopener noreferrer"><span>RealOEM parts / diagrams</span><span>OPEN ↗</span></a>'
        f'<a class="e46-ref" href="{escape(CHARM, quote=True)}" target="_blank" rel="noopener noreferrer"><span>2004 330Ci service manual index</span><span>OPEN ↗</span></a>'
        f'<a class="e46-ref" href="{escape(BMW_TIS, quote=True)}" target="_blank" rel="noopener noreferrer"><span>BMW Technical Information System</span><span>OPEN ↗</span></a>{extra_ref}'
        '</div>'
        f'<div class="e46-data-block"><div class="e46-data-label">Pinned parts / references</div><ul class="e46-parts">{parts}</ul></div>'
        f'<div class="e46-data-block"><div class="e46-data-label">Workshop notes</div><ul class="e46-notes">{notes}</ul></div>'
        '</div></div></template>'
    )


def _build_systems_body() -> str:
    tiles = ''.join(_system_tile(system) for system in SYSTEMS)
    templates = ''.join(_system_template(system) for system in SYSTEMS)
    return (
        '<div class="e46-index-head"><p class="e46-index-note">Pick a system or search naturally. Partial words, abbreviations, symptoms, and small typos are ranked instead of rejected.</p>'
        '<div class="e46-search-zone"><div class="e46-search-shell"><span class="e46-search-icon">⌕</span><input class="e46-search" type="search" autocomplete="off" spellcheck="false" aria-label="Search E46 workshop" placeholder="water pump, thermstat, shake, flexdisc, no crank..."><button class="e46-search-clear" type="button">Clear</button></div>'
        '<div class="e46-search-meta" aria-live="polite"></div><div class="e46-didyoumean">Did you mean <button class="e46-spelling" type="button"></button>?</div><div class="e46-search-results"></div></div></div>'
        f'<div class="e46-system-grid">{tiles}</div>{templates}'
    )


def _build_workspace_body() -> str:
    return '<div class="e46-workspace-top"><button class="e46-back" type="button">← System index</button><span class="e46-fitment">Working catalog: 2004 330Ci Coupe / M54 • VIN & production month still to be set</span></div><div class="e46-workspace-body"></div>'


def _build_source_body() -> str:
    sources = [
        ("Parts / exploded views", "RealOEM", REALOEM_CAR),
        ("Service-manual index", "Operation CHARM", CHARM),
        ("Factory technical info", "BMW TIS", BMW_TIS),
        ("Model archive", "BMW Group Classic", BMW_CLASSIC),
        ("Community evidence", "Bimmerforums E46", BIMMERFORUMS),
        ("Parts cross-check", "FCP Euro — 330Ci Cooling", FCP_COOLING),
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
        CardItem(card_type="e46_systems", eyebrow="WORKSHOP INDEX", title="Find Anything on the Car", body=_build_systems_body()),
        CardItem(card_type="e46_workspace", eyebrow="SYSTEM WORKSPACE", title="Workshop", body=_build_workspace_body()),
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
            "extra_head_html": '<meta name="theme-color" content="#0c0d0e">',
        },
    )
