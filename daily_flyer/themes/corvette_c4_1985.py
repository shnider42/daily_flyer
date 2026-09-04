from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import e46_owner_companion_v5 as visual_base

THEME_NAME = "corvette_c4_1985"
THEME_CONFIG = {
    "page_title": "Garage Journey Workshop — 1985 Chevrolet Corvette C4",
    "header_title": "CORVETTE / C4",
    "header_subtitle": "Factory-grounded technical index for the 1985 Corvette coupe — L98 Tuned-Port Injection, C4 driveline and chassis, digital instrumentation, diagnostics, and original GM references.",
    "footer_text": "Garage Journey technical reference. Confirm VIN, transmission, Z51/G92/V08 equipment, emissions calibration, wheel/tire fitment, and prior modifications before applying configuration-specific procedures or parts.",
    "hero_kicker": "1985 // CORVETTE // C4 // L98 TPI",
    "hero_summary_pill": "SEARCH • SYSTEM • COMPONENT • SOURCE",
}

GM_KIT = "https://news.chevrolet.com/content/dam/company/no_search/heritage-archive-docs/vehicle-information-kits/chevrolet/1985-Chevrolet-Corvette.pdf"
GM_ARCHIVE = "https://www.gm.com/heritage/archive/vehicle-information-kits"
GM_MANUALS = "https://experience.gm.com/support/vehicle/manuals-guides"
CAC_SPECS = "https://corvetteactioncenter.com/specs/c4/1985/85specs.html"
CORVETTE_STORY = "https://mobile.corvettestory.com/specs/1985-Corvette-specs-options.php"

SYSTEMS = [
    {"key":"engine","index":"L98","title":"L98 / Tuned-Port Injection","subtitle":"5.7L 350-ci OHV V8 • 230 hp / 330 lb-ft","aliases":["engine","motor","l98","350","5.7","tpi","tuned port","intake","plenum","runner","fuel injection","maf","throttle","ecm"],"symptoms":["hard start","rough idle","hesitation","misfire","stall","surge","power loss","rich","lean"],"search":"engine motor l98 350 5.7 tuned port injection tpi plenum runners intake maf mass air flow throttle body iac tps fuel rail injector regulator ecm prom hei distributor ignition 230 hp 330 lb ft 4000 3200 9.0 compression","primary":"L98 5.7L Tuned-Port Injection V8","components":["TPI plenum / runners","MAF / air metering","Fuel rail / injectors","Throttle body / IAC / TPS","HEI distributor / ignition","ECM / PROM / ALDL"],"facts":["350 cu. in. / 5.7L OHV V8","230 hp @ 4,000 rpm","330 lb-ft @ 3,200 rpm","9.0:1 compression ratio","Tuned-Port fuel injection replaced the 1984 Cross-Fire system","1985 uses cast-iron cylinder heads"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("Corvette Action Center 1985 specifications",CAC_SPECS),("GM Heritage vehicle information kits",GM_ARCHIVE)]},
    {"key":"cooling","index":"V08","title":"Cooling / Lubrication","subtitle":"Radiator, electric fans, oil and heavy-duty cooling context","aliases":["cooling","coolant","radiator","fan","fans","water pump","thermostat","oil","lubrication","oil cooler","v08","overheat"],"symptoms":["overheat","runs hot","fan not running","coolant leak","oil leak","low oil pressure"],"search":"cooling coolant radiator electric fan water pump thermostat hose reservoir oil lubrication filter cooler pressure temperature overheat leak v08 heavy duty cooling","primary":"C4 engine cooling and lubrication systems","components":["Radiator / coolant circuit","Electric cooling fans","Water pump / thermostat","Engine oil system","Optional heavy-duty cooling V08","Hoses / expansion plumbing"],"facts":["Heavy-Duty Cooling was available as RPO V08","1985 cooling diagnosis should distinguish fan-control, airflow, coolant-flow and engine-condition faults","Exact capacities, bleed steps and repair procedures should be checked against GM service information for the individual car"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("GM owner/manual support",GM_MANUALS),("Corvette Story 1985 specifications",CORVETTE_STORY)]},
    {"key":"transmission","index":"4+3","title":"Transmission / Clutch","subtitle":"700-R4 automatic or Doug Nash 4+3 manual","aliases":["transmission","automatic","700r4","700-r4","4 speed automatic","manual","4+3","doug nash","overdrive","clutch","flywheel","shifter"],"symptoms":["hard shift","slip","no overdrive","overdrive fault","gear grind","clutch slip","clutch chatter","shift flare"],"search":"transmission 700r4 700-r4 automatic four speed overdrive doug nash 4+3 manual mm4 clutch flywheel shifter overdrive solenoid shift 2.73 3.07 axle","primary":"Two distinct 1985 Corvette transmission paths","components":["4-speed automatic / overdrive","Doug Nash 4+3 manual","Clutch / flywheel","Manual overdrive controls","Shifter / linkage","Transmission cooling / fluid"],"facts":["Four-speed automatic was available with a 2.73 standard axle ratio","MM4 four-speed manual uses the Doug Nash 4+3 overdrive arrangement","Manual cars use a 3.07 standard axle ratio; optional ratios vary with equipment"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("Corvette Action Center transmission data",CAC_SPECS),("Corvette Story gear-ratio reference",CORVETTE_STORY)]},
    {"key":"driveline","index":"RWD","title":"Rear Driveline / Differential","subtitle":"C4 rear-drive hardware, halfshafts and differential","aliases":["driveline","rear wheel drive","rwd","differential","rear axle","halfshaft","u joint","driveshaft","prop shaft","axle ratio","g92"],"symptoms":["clunk","whine","vibration","wheel hop","u joint noise","diff noise","leak"],"search":"rear driveline rwd differential rear axle halfshaft half shaft u joint universal joint driveshaft propeller shaft axle ratio g92 2.73 3.07 3.31","primary":"Independent C4 rear driveline","components":["Driveshaft","Rear differential","Halfshafts / U-joints","Wheel hubs / bearings","Differential mounts","Axle-ratio / G92 configuration"],"facts":["Rear-wheel drive with independent rear suspension","Axle ratio depends on transmission and performance-option configuration","Record transmission and RPO information before ordering differential or driveline parts"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("Corvette Action Center 1985 specifications",CAC_SPECS),("Corvette Story 1985 specifications",CORVETTE_STORY)]},
    {"key":"chassis","index":"C4","title":"Chassis / Steering","subtitle":"Composite transverse springs, control arms and performance options","aliases":["chassis","suspension","front suspension","rear suspension","leaf spring","fiberglass spring","control arm","steering","rack","alignment","z51","bilstein"],"symptoms":["pulling","clunk","wandering","harsh ride","alignment","uneven tire wear","steering play"],"search":"chassis suspension transverse fiberglass composite leaf spring unequal length control arms five link rear stabilizer bar steering rack alignment z51 bilstein handling","primary":"Early C4 fully independent chassis","components":["Front control arms / composite spring","Rear five-link / composite spring","Shocks / dampers","Stabilizer bars","Rack-and-pinion steering","Z51 performance handling equipment"],"facts":["Front uses unequal-length control arms with a transverse composite spring","Rear suspension is fully independent with a transverse composite spring","1985 spring rates were softened versus 1984; Z51 retained a more aggressive handling specification"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("Corvette Action Center 1985 specifications",CAC_SPECS),("GM Heritage vehicle information kits",GM_ARCHIVE)]},
    {"key":"brakes","index":"16","title":"Brakes / Wheels / Tires","subtitle":"Four-wheel vented discs and 16-inch base fitment","aliases":["brakes","brake","rotor","disc","caliper","pad","wheel","tire","tyre","16 inch","z51"],"symptoms":["brake vibration","pedal","pulling","pad wear","rotor wear","tire wear","wheel vibration"],"search":"brakes brake rotor vented disc caliper pad wheel tire 16 inch p255 50vr16 z51 8.5 9.5 alloy","primary":"C4 four-wheel disc braking and wheel/tire system","components":["Front disc brakes","Rear disc brakes","Vacuum assist / hydraulics","Base alloy wheels","P255/50VR16 tires","Z51 wheel / tire differences"],"facts":["Front and rear use 11.5-inch vented disc brakes","Base 1985 fitment used 16-inch alloy wheels with P255/50VR16 tires","Z51 wheel widths differ from base equipment; verify RPO and actual fitted wheels"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("Corvette Action Center brake / wheel data",CAC_SPECS),("Corvette Story 1985 specifications",CORVETTE_STORY)]},
    {"key":"electrical","index":"ALDL","title":"Electrical / Digital Cluster","subtitle":"ECM, PROM, ALDL and the early C4 electronic cockpit","aliases":["electrical","diagnostics","ecm","computer","prom","aldl","obd1","digital dash","cluster","instrument","battery","charging","alternator","sensor"],"symptoms":["warning light","fault code","no start","battery","charging","digital dash","cluster dark","sensor fault","stall"],"search":"electrical diagnostics ecm prom aldl obd1 computer command control digital dash instrument cluster battery alternator charging sensor check engine ses service engine soon","primary":"1985 GM engine-management and electronic-instrument architecture","components":["ECM / PROM","ALDL diagnostics","Digital instrument cluster","Battery / charging","Sensors / relays","Lighting / body electrical"],"facts":["1985 predates standardized OBD-II; diagnosis uses GM ALDL-era procedures","The C4 digital instrument cluster is a major vehicle-specific diagnostic area","PROM/calibration and emissions configuration matter when comparing ECM behavior between cars"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("GM Heritage vehicle information kits",GM_ARCHIVE),("GM owner/manual support",GM_MANUALS)]},
]

TPI_COMPONENTS = [
    {"key":"tpi_plenum","title":"TPI Plenum / Runners","group":"INTAKE TUNING","aliases":["tpi","tuned port","plenum","runner","runners","intake manifold"],"symptoms":["vacuum leak","rough idle","hesitation","power loss","intake leak"],"check":"Inspect vacuum integrity, runner/plenum sealing and throttle-side air leaks before blaming fueling or the ECM.","adjacent":"Throttle body, injector harness, fuel rail, vacuum hoses and EGR plumbing.","facts":["Tuned-Port Injection is the defining 1985 L98 change","Long intake runners are central to the TPI torque-oriented design","Many service operations expose aging vacuum hoses and gaskets at the same time"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("Corvette Action Center 1985 specifications",CAC_SPECS)]},
    {"key":"maf","title":"MAF / Air Metering","group":"AIR METERING","aliases":["maf","mass air flow","air meter","airflow","intake sensor","air cleaner"],"symptoms":["hesitation","stall","rich","lean","poor idle","power loss"],"check":"Confirm intake integrity and compare MAF-related evidence with coolant-temperature, throttle-position and oxygen-sensor inputs before replacing the meter.","adjacent":"Air cleaner duct, throttle body, IAC, TPS, grounds and ECM connectors.","facts":["The 1985 L98 system meters incoming air as part of closed-loop electronic fuel control","Air leaks downstream of metering can distort fueling diagnosis"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("GM Heritage vehicle information kits",GM_ARCHIVE)]},
    {"key":"fuel_rail","title":"Fuel Rail / Injectors","group":"FUEL DELIVERY","aliases":["fuel rail","injector","injectors","fuel pressure","regulator","fuel pump","filter"],"symptoms":["hard start","lean","rich","misfire","fuel smell","low pressure"],"check":"Measure fuel pressure and leak-down behavior before replacing injectors; separate pump/filter supply faults from regulator or individual-injector problems.","adjacent":"Fuel pump, filter, regulator vacuum reference, injector connectors and intake sealing.","facts":["1985 replaced Cross-Fire with multi-point Tuned-Port fuel injection","Fuel-pressure and injector-balance evidence are more useful than parts-swapping"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("GM Heritage vehicle information kits",GM_ARCHIVE)]},
    {"key":"throttle_iac","title":"Throttle Body / IAC / TPS","group":"IDLE / THROTTLE","aliases":["throttle body","iac","idle air control","tps","throttle position","idle","minimum air"],"symptoms":["high idle","low idle","stall","surge","tip in hesitation","throttle code"],"check":"Verify mechanical throttle condition, vacuum leaks, TPS signal and IAC control before changing base-idle or stop settings.","adjacent":"Throttle cable, cruise linkage, MAF ducting, vacuum ports and ECM learned idle control.","facts":["Idle quality depends on both mechanical airflow and ECM-controlled bypass air","Base adjustments should not be used to hide vacuum, sensor or fuel-control faults"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("GM owner/manual support",GM_MANUALS)]},
    {"key":"hei","title":"HEI Distributor / Ignition","group":"IGNITION","aliases":["hei","distributor","cap","rotor","coil","spark plug","ignition","timing","module"],"symptoms":["misfire","no start","rough idle","spark loss","timing issue"],"check":"Confirm spark quality, distributor condition, base timing procedure and ECM timing-control inputs before replacing major fuel-system parts.","adjacent":"Cap/rotor, plug wires, plugs, ignition module, grounds and ECM reference signals.","facts":["1985 remains distributor-based rather than later distributorless ignition","Age-related cap, rotor, wire and connector condition can mimic fueling faults"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("GM Heritage vehicle information kits",GM_ARCHIVE)]},
    {"key":"ecm_aldl","title":"ECM / PROM / ALDL","group":"ENGINE CONTROL","aliases":["ecm","computer","prom","chip","aldl","diagnostics","service engine soon","ses","obd1"],"symptoms":["fault code","stall","no start","rich","lean","intermittent","ses light"],"check":"Identify the exact ECM/PROM calibration and retrieve ALDL-era diagnostic information before comparing behavior with another 1985 Corvette.","adjacent":"Grounds, power feeds, sensor reference circuits, emissions equipment and transmission configuration.","facts":["1985 is pre-OBD-II and uses GM ALDL-era diagnostics","PROM/calibration revisions can matter on early electronic-control cars","Transmission and emissions configuration should be recorded with any ECM diagnosis"],"sources":[("GM 1985 Corvette vehicle information kit",GM_KIT),("GM Heritage vehicle information kits",GM_ARCHIVE)]},
]

FONT_HEAD = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
)

EXTRA_CSS = visual_base.EXTRA_CSS + r'''
:root{--irish-green:#d51f2e;--blue:#d51f2e;--teal:#f0b4b8;--gj-display:"Barlow Condensed","Arial Narrow",sans-serif;--gj-body:"Manrope",Arial,sans-serif;--gj-mono:"IBM Plex Mono",Consolas,monospace}
body{font-family:var(--gj-body);background:radial-gradient(circle at 82% 5%,rgba(213,31,46,.22),transparent 29rem),radial-gradient(circle at 12% 18%,rgba(245,245,238,.045),transparent 22rem),linear-gradient(rgba(12,10,11,.99),rgba(7,7,8,.999)),#080708}
.hero-wrap::before{height:3px;background:linear-gradient(90deg,#d51f2e 0 48%,#f3f0e8 48% 65%,#202125 65% 100%)}
.hero h1,.e46-work-title,.e46-component-title{font-family:var(--gj-display);font-weight:800;letter-spacing:-.025em}.hero-kicker,.eyebrow,.e46-search-kicker,.e46-work-kicker,.e46-system-index,.e46-component-group,.e46-source-type,.e46-data-label{font-family:var(--gj-mono);color:#f0b4b8}
.card{border-radius:28px 7px 28px 7px!important}.e46-system-grid{gap:14px;border:0!important}.e46-system{border:1px solid rgba(255,255,255,.11)!important;border-radius:20px 5px 20px 5px!important;background:linear-gradient(145deg,rgba(255,255,255,.042),rgba(255,255,255,.012))!important;overflow:hidden}.e46-system:hover,.e46-system:focus-visible{background:rgba(213,31,46,.11)!important;transform:translateY(-4px) rotate(-.12deg)}.e46-system.is-best::after{background:#f3f0e8}
.e46-system h3{font-family:var(--gj-display);font-size:2rem;letter-spacing:-.02em}.e46-search-shell{border-radius:999px;border-color:rgba(240,180,184,.46);background:rgba(255,255,255,.035)}.e46-search{font-family:var(--gj-body)}.e46-search-clear{border-radius:999px}.e46-result{border-radius:14px 4px 14px 4px!important}.e46-open,.e46-result-rank,.e46-component-open,.e46-component-back,.e46-component-source>span:last-child{color:#f0b4b8!important}.e46-ref:hover,.e46-component-source:hover{border-color:#f0b4b8}.e46-data-note{border-left-color:#d51f2e;background:rgba(213,31,46,.08)}
.e46-workshop,.e46-component-view{border-radius:24px 6px 24px 6px;overflow:hidden}.e46-work-details,.e46-component-details{background:linear-gradient(145deg,#181113,#101011)}.e46-component-nav{gap:10px;border:0!important}.e46-component-card{border:1px solid rgba(255,255,255,.10)!important;border-radius:16px 4px 16px 4px!important;background:rgba(255,255,255,.018)}.e46-component-card:hover{background:rgba(213,31,46,.10)!important}.e46-source-strip{gap:10px;border:0!important}.e46-source-tile{border:1px solid rgba(255,255,255,.09)!important;border-radius:16px 4px 16px 4px!important;background:rgba(255,255,255,.015)}
.e46-home-specs{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;border:0;margin-bottom:28px}.e46-home-specs>div{padding:13px 14px;border:1px solid rgba(255,255,255,.09);border-radius:13px 4px 13px 4px;background:rgba(255,255,255,.016)}.e46-home-specs span{display:block;color:#9d7478;font-family:var(--gj-mono);font-size:.56rem;font-weight:900;letter-spacing:.08em}.e46-home-specs strong{display:block;margin-top:7px;color:#fff;font-size:.82rem}.e46-fact-list{margin:18px 0 0;padding:0;list-style:none}.e46-fact-list li{padding:8px 0;border-top:1px solid rgba(255,255,255,.10);color:#d0c7c8;font-size:.79rem}.e46-schematic-mark{color:#f0b4b8}.e46-component-stamp{font-family:var(--gj-display);font-size:clamp(2.2rem,5vw,4.6rem)}
.card--corvette_workspace{display:none}.card--corvette_workspace.is-open{display:block}
.gj-floatnav{position:fixed;z-index:120;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:4px;border:1px solid rgba(240,180,184,.25);border-radius:999px;background:rgba(12,8,9,.76);backdrop-filter:blur(16px) saturate(125%);box-shadow:0 12px 44px rgba(0,0,0,.25)}.gj-floatnav button{min-height:38px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:#fff0f1;font-family:var(--gj-mono);font-size:.61rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase;cursor:pointer}.gj-floatnav button:hover{background:rgba(213,31,46,.20)}
@keyframes c4-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}.e46-system{animation:c4-rise .42s cubic-bezier(.2,.8,.2,1) both}.e46-system:nth-child(2){animation-delay:.04s}.e46-system:nth-child(3){animation-delay:.08s}.e46-system:nth-child(4){animation-delay:.12s}.e46-system:nth-child(5){animation-delay:.16s}.e46-system:nth-child(6){animation-delay:.20s}.e46-system:nth-child(7){animation-delay:.24s}@media(prefers-reduced-motion:reduce){.e46-system{animation:none!important;transition:none!important}}@media(max-width:900px){.e46-home-specs{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.e46-home-specs{grid-template-columns:repeat(2,1fr)}.gj-floatnav{top:8px}}
'''


def _pipes(items: list[str]) -> str:
    return "|".join(items)


def _tile(system: dict) -> str:
    attrs = (
        f'data-key="{escape(system["key"])}" data-title="{escape(system["title"], quote=True)}" '
        f'data-subtitle="{escape(system["subtitle"], quote=True)}" data-search="{escape(system["search"], quote=True)}" '
        f'data-items="{escape(_pipes(system["components"]), quote=True)}" data-aliases="{escape(_pipes(system["aliases"]), quote=True)}" '
        f'data-symptoms="{escape(_pipes(system["symptoms"]), quote=True)}"'
    )
    return f'<button class="e46-system" type="button" {attrs}><div class="e46-system-image e46-schematic"><span class="e46-schematic-mark">{escape(system["index"])}</span></div><div class="e46-system-copy"><span class="e46-system-index">SYSTEM</span><h3>{escape(system["title"])}</h3><p>{escape(system["subtitle"])}</p><span class="e46-open">Open workshop →</span></div></button>'


def _refs(sources) -> str:
    return ''.join(f'<a class="e46-ref" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer"><span>{escape(label)}</span><span>OPEN ↗</span></a>' for label, url in sources)


def _system_template(system: dict) -> str:
    components = ''.join(f'<span class="e46-component">{escape(component)}</span>' for component in system["components"])
    facts = ''.join(f'<li>{escape(fact)}</li>' for fact in system["facts"])
    drill = ''
    if system["key"] == "engine":
        drill = '<div class="e46-drill-label">Drill into L98 / TPI</div><div class="e46-component-nav">' + ''.join(
            f'<button class="e46-component-card" type="button" data-component="{escape(component["key"])}"><span class="e46-component-group">{escape(component["group"])}</span><strong>{escape(component["title"])}</strong><span>{escape(component["check"].split(",")[0])}</span><span class="e46-component-open">→</span></button>'
            for component in TPI_COMPONENTS
        ) + '</div>'
    return f'<template id="e46-template-{escape(system["key"])}"><div class="e46-workshop"><div class="e46-visual"><div class="e46-visual-head"><span>{escape(system["primary"])}</span><span>GM heritage-grounded reference</span></div><div class="e46-diagram"><div class="e46-diagram-placeholder">{escape(system["index"])}</div></div><div class="e46-source-credit">Use GM service literature and the exact VIN/RPO configuration for procedures, torque values, calibrations and parts.</div></div><div class="e46-work-details"><span class="e46-work-kicker">1985 CORVETTE / C4</span><h3 class="e46-work-title">{escape(system["title"])}</h3><p class="e46-work-primary">{escape(system["primary"])}</p><div class="e46-component-grid">{components}</div><div class="e46-ref-actions">{_refs(system["sources"])}</div><div class="e46-data-block"><div class="e46-data-label">Pinned reference facts</div><ul class="e46-fact-list">{facts}</ul></div>{drill}</div></div></template>'


def _component_template(component: dict) -> str:
    facts = ''.join(f'<li>{escape(fact)}</li>' for fact in component["facts"])
    sources = ''.join(f'<a class="e46-component-source" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer"><span><small>{escape(label)}</small><strong>Reference</strong></span><span>OPEN ↗</span></a>' for label, url in component["sources"])
    return f'<template id="e46-component-{escape(component["key"])}"><div class="e46-component-view"><div class="e46-component-visual"><div class="e46-component-visual-head"><span>L98 TPI / {escape(component["title"])}</span><span>1985 Corvette</span></div><div class="e46-component-visual-main"><div class="e46-diagram-placeholder">L98</div><span class="e46-component-stamp">{escape(component["title"])}</span></div><div class="e46-component-credit">Exact repair instructions, base adjustments, PROM/calibration details and torque specifications should come from service information for the specific VIN and RPO configuration.</div></div><div class="e46-component-details"><div class="e46-component-breadcrumb"><button class="e46-component-back" type="button">L98 / Tuned-Port Injection</button><span>/</span><span>Component</span></div><h3 class="e46-component-title">{escape(component["title"])}</h3><p class="e46-component-sub">{escape(component["group"])}</p><div class="e46-mini-data"><div><span>Check / diagnose</span><p>{escape(component["check"])}</p></div><div><span>While access is open</span><p>{escape(component["adjacent"])}</p></div></div><ul class="e46-component-parts">{facts}</ul><div class="e46-component-sources">{sources}</div></div></div></template>'


def _body() -> str:
    specs = ''.join(f'<div><span>{key}</span><strong>{value}</strong></div>' for key, value in [
        ("ENGINE", "5.7L L98 TPI"), ("POWER", "230 hp"), ("TORQUE", "330 lb-ft"),
        ("DRIVE", "Rear-wheel drive"), ("TRANS", "4AT / 4+3 manual"), ("COLOR", "Bright Red / RPO 81")
    ])
    tiles = ''.join(_tile(system) for system in SYSTEMS)
    system_templates = ''.join(_system_template(system) for system in SYSTEMS)
    component_templates = ''.join(_component_template(component) for component in TPI_COMPONENTS)
    component_index = ''.join(
        f'<span class="e46-search-doc" data-doc-type="component" data-system="engine" data-component="{escape(component["key"])}" data-title="{escape(component["title"], quote=True)}" data-search="{escape(_pipes(component["aliases"] + component["symptoms"] + component["facts"]), quote=True)}"></span>'
        for component in TPI_COMPONENTS
    )
    return f'<div class="e46-home-specs">{specs}</div><div class="e46-index-head"><div><span class="e46-search-kicker">Find anything on this 1985 C4</span><p class="e46-index-note">Search a system, symptom, RPO, specification or L98/TPI component. Factory heritage material is pinned first; exact service work remains VIN/configuration-specific.</p></div><div><div class="e46-search-shell"><input class="e46-search" type="search" aria-label="Search 1985 Corvette C4 workshop" placeholder="TPI, MAF, 4+3, digital dash, Z51, overheat..."><button class="e46-search-clear" type="button">Clear</button></div><div class="e46-search-meta"></div><div class="e46-search-results"></div><div class="e46-didyoumean">Did you mean <button class="e46-spelling" type="button"></button>?</div></div></div><div class="e46-system-grid">{tiles}</div>{component_index}{system_templates}{component_templates}'


def _workspace() -> str:
    return '<div class="e46-workspace-top"><button class="e46-back" type="button">← System index</button><span class="e46-fitment">1985 Corvette C4 Coupe • record VIN, transmission, RPOs, emissions calibration, wheel/tire equipment and modifications in Garage Journey</span></div><div class="e46-workspace-body"></div>'


def _sources() -> str:
    sources = [
        ("OFFICIAL / MY85", "GM 1985 Corvette Vehicle Information Kit", GM_KIT),
        ("OFFICIAL / ARCHIVE", "GM Heritage Vehicle Information Kits", GM_ARCHIVE),
        ("OFFICIAL / OWNER", "GM Manuals & Guides", GM_MANUALS),
        ("TECHNICAL REFERENCE", "Corvette Action Center 1985 Specifications", CAC_SPECS),
        ("TECHNICAL REFERENCE", "Corvette Story 1985 Specifications / Options", CORVETTE_STORY),
    ]
    return '<div class="e46-source-strip">' + ''.join(f'<a class="e46-source-tile" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer"><span class="e46-source-type">{escape(kind)}</span><strong>{escape(name)}</strong><span>Open source ↗</span></a>' for kind, name, url in sources) + '</div>'


EXTRA_JS = visual_base.EXTRA_JS.replace(
    "const systemsCard=document.querySelector('.card--e46_systems');",
    "const systemsCard=document.querySelector('.card--corvette_systems');",
).replace(
    "const workspaceCard=document.querySelector('.card--e46_workspace');",
    "const workspaceCard=document.querySelector('.card--corvette_workspace');",
).replace("showSystem('cooling',false)", "showSystem('engine',false)").replace("Cooling → ${item.title}", "L98 / TPI → ${item.title}") + r'''
(function(){
  if(document.querySelector('.gj-floatnav'))return;
  const nav=document.createElement('nav');nav.className='gj-floatnav';nav.setAttribute('aria-label','Garage Journey navigation');
  nav.innerHTML='<button type="button" class="gj-nav-back">← Back</button><button type="button" class="gj-nav-home">⌂ Garage Home</button>';
  document.body.appendChild(nav);
  const garage=()=>{location.href='/?theme=garage';};
  nav.querySelector('.gj-nav-back').addEventListener('click',()=>{try{const ref=document.referrer?new URL(document.referrer):null;if(ref&&ref.origin===location.origin){history.back();return;}}catch(error){}garage();});
  nav.querySelector('.gj-nav-home').addEventListener('click',garage);
})();
'''


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    del seed
    return PageContext(
        page_title=THEME_CONFIG["page_title"], header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"], today_str=today.strftime("%A, %B %d, %Y"),
        cards=[
            CardItem(card_type="corvette_systems", eyebrow="WORKSHOP INDEX", title="Find It. Then Drill In.", body=_body()),
            CardItem(card_type="corvette_workspace", eyebrow="WORKSPACE", title="System / Component", body=_workspace()),
            CardItem(card_type="corvette_library", eyebrow="SOURCE LIBRARY", title="Original References", body=_sources()),
        ],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME, "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"], "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": EXTRA_CSS, "extra_js": EXTRA_JS,
            "extra_head_html": FONT_HEAD + '<meta name="theme-color" content="#080708">',
        },
    )
