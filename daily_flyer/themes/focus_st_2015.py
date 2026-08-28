from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import e46_owner_companion_v5 as visual_base

THEME_NAME = "focus_st_2015"
THEME_CONFIG = {
    "page_title": "Garage Journey Workshop — 2015 Ford Focus ST",
    "header_title": "FOCUS ST / MK3.5",
    "header_subtitle": "Factory-grounded technical index for the 2015 Focus ST — 2.0 EcoBoost, boost/air/fuel, front driveline, chassis, diagnostics, and original Ford references.",
    "footer_text": "Garage Journey technical reference. Confirm VIN, ST1/ST2/ST3 equipment, wheel/tire fitment, modifications, and build data before applying configuration-specific procedures or parts.",
    "hero_kicker": "2015 // FOCUS ST // MK3.5 // 2.0 ECOBOOST",
    "hero_summary_pill": "SEARCH • SYSTEM • COMPONENT • SOURCE",
}

ST_SUPPLEMENT = "https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/2015-Focus-ST-Supplement-version-1_st_EN-US_11_2014.pdf"
OWNER_MANUAL = "https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/2015-Focus-Owners-Manual-version-2_om_EN-US_03_2015.pdf"
FORD_ST_2015 = "https://media.ford.com/content/fordmedia/fap/en/news/2015/04/20/Fords-New-Focus-ST-Brings-Enhanced-Performance-to-China.html"
ST_OVERVIEW = "https://media.ford.com/content/dam/fordmedia/Europe/documents/productReleases/Focus%20ST/FocusST-2014_Overview_EU.pdf"
TECH_2016 = "https://media.ford.com/content/dam/fordmedia/North%20America/US/product/2016/focus/2016-Ford-Focus-ST-Tech-Specs-FINAL.pdf"
MP275 = "https://media.ford.com/content/fordmedia/fna/ca/en/news/2015/08/17/ford-performance-upgrade-kit-for-2015-focus-st-boosts-output.html"
MOTORCRAFT = "https://www.motorcraftservice.com/"

SYSTEMS = [
    {"key":"engine","index":"2.0T","title":"EcoBoost / Boost-Air-Fuel","subtitle":"Turbocharged 2.0L GTDI I-4","aliases":["engine","motor","ecoboost","2.0","turbo","boost","intake","intercooler","fuel","direct injection","tivct"],"symptoms":["misfire","rough idle","hesitation","boost loss","power loss","check engine","surge"],"search":"engine motor ecoboost 2.0 turbo boost intercooler charge air direct injection gtdi tivct twin independent variable cam timing throttle maf map fuel injector ignition spark misfire 252 hp 270 lb ft 5500 2500 9.3 compression","primary":"High-output 2.0L turbocharged EcoBoost GTDI inline-four","components":["Turbocharger / wastegate","Intercooler / charge-air","Direct injection / high-pressure fuel","Throttle / airflow sensing","Ti-VCT","Coil-on-plug ignition"],"facts":["1,999 cc aluminum block and head","252 hp @ 5,500 rpm on 93-octane fuel","270 lb-ft @ 2,500 rpm","9.3:1 compression ratio","DOHC, four valves per cylinder, twin independent variable cam timing","Gasoline direct injection"],"sources":[("2015 ST-specific supplement",ST_SUPPLEMENT),("Ford 2015 Focus ST engineering overview",FORD_ST_2015),("Closely related 2016 NA ST technical specification",TECH_2016)]},
    {"key":"cooling","index":"303","title":"Cooling / Lubrication","subtitle":"Coolant, oil and charge-temperature context","aliases":["cooling","coolant","radiator","water pump","thermostat","fan","oil","lubrication","oil filter","temperature"],"symptoms":["overheat","runs hot","coolant leak","oil pressure","oil leak","temperature warning"],"search":"cooling coolant radiator water pump thermostat fan oil lubrication filter pressure temperature overheat leak ecoboost 2.0 charge temperature heat soak","primary":"Engine cooling and lubrication systems","components":["Radiator circuit","Water pump / thermostat","Cooling fans","Engine oil system","Oil temperature / pressure monitoring","Reservoirs / hoses"],"facts":["ST center gauge pod includes boost, oil-temperature and oil-pressure information","Turbocharged operation makes oil and coolant condition central to thermal management","Exact fill, bleed, torque and repair procedures should come from Ford service information"],"sources":[("2015 ST supplement",ST_SUPPLEMENT),("2015 Focus owner manual",OWNER_MANUAL),("Ford workshop information",MOTORCRAFT)]},
    {"key":"transmission","index":"308","title":"Transmission / Clutch","subtitle":"ST-specific six-speed manual","aliases":["transmission","gearbox","manual","6 speed","six speed","clutch","flywheel","shifter","synchro"],"symptoms":["hard shift","gear grind","clutch slip","clutch chatter","shift feel","transmission noise"],"search":"transmission gearbox six speed manual clutch flywheel shifter synchro shift quality final drive 4.06 focus st","primary":"ST-specific six-speed manual transaxle","components":["Six-speed manual","Clutch / pressure plate","Flywheel","Shifter / cables","Synchronizers","Final drive"],"facts":["Six-speed manual is standard for the gasoline 2015 Focus ST","Ford describes a performance-oriented short-throw shift","Closely related NA technical data lists a 4.06:1 final drive"],"sources":[("Ford 2015 ST engineering overview",FORD_ST_2015),("2015 ST supplement",ST_SUPPLEMENT),("Ford workshop information",MOTORCRAFT)]},
    {"key":"driveline","index":"205","title":"Front Driveline / eTVC","subtitle":"FWD, halfshafts and electronic torque vectoring","aliases":["driveline","front wheel drive","fwd","halfshaft","cv axle","cv joint","torque vectoring","etvc","differential","wheel hop"],"symptoms":["wheel hop","torque steer","clunk","vibration","cv click","traction issue"],"search":"front driveline fwd halfshaft cv axle joint differential open diff electronic torque vectoring etvc brake vectoring traction wheel hop torque steer cornering understeer control","primary":"Front-wheel-drive ST driveline with electronic torque-vectoring support","components":["Front differential","Halfshafts / CV joints","Engine / transmission mounts","Electronic Torque Vectoring Control","Wheel hubs / bearings","Traction / ESC interaction"],"facts":["Front-wheel drive","Ford revised Electronic Torque Vectoring Control calibration for the facelift ST","Engine mounts were specifically engineered to improve traction and shift quality under hard acceleration"],"sources":[("Ford 2015 ST engineering overview",FORD_ST_2015),("Focus ST platform overview",ST_OVERVIEW),("Ford workshop information",MOTORCRAFT)]},
    {"key":"chassis","index":"204","title":"Chassis / Steering","subtitle":"ST springs, dampers, EPAS and multilink rear","aliases":["suspension","front suspension","rear suspension","strut","shock","spring","steering","epas","alignment","control arm","sway bar"],"symptoms":["pulling","clunk","wandering","alignment","uneven tire wear","steering feel"],"search":"chassis suspension macpherson strut reverse l lower control arm rear sla independent control arm spring damper shock stabilizer bar epas variable ratio steering alignment ets transitional stability","primary":"Facelift ST-specific suspension and steering calibration","components":["Front MacPherson struts","Front control arms / bushings","Independent rear suspension","Springs / dampers","EPAS variable-ratio steering","Alignment / stabilizer bars"],"facts":["2015 facelift received new front springs and sportier damper tuning","EPAS calibration and steering response were revised","Electronic Transitional Stability and revised eTVC were added to the dynamic-control strategy"],"sources":[("Ford 2015 ST engineering overview",FORD_ST_2015),("Focus ST platform overview",ST_OVERVIEW),("Ford workshop information",MOTORCRAFT)]},
    {"key":"brakes","index":"206","title":"Brakes / Wheels / Tires","subtitle":"Four-wheel disc braking and ST fitment","aliases":["brakes","brake","rotor","disc","caliper","pad","wheel","tire","tyre","abs"],"symptoms":["brake vibration","pedal","pad wear","rotor wear","tire wear","wheel vibration"],"search":"brakes brake rotor disc caliper pad abs esc wheel tire tyre 18 inch 235 40 r18 focus st","primary":"ST braking, wheel and tire systems","components":["Front brakes","Rear brakes","ABS / ESC","18-inch ST wheels","Tires","TPMS"],"facts":["Four-wheel disc braking with ABS/ESC architecture","18-inch ST alloy wheels are part of the 2015 ST presentation","Tire/wheel equipment can vary by market and option; confirm the individual car"],"sources":[("2015 Focus owner manual",OWNER_MANUAL),("Ford 2015 ST engineering overview",FORD_ST_2015),("Ford workshop information",MOTORCRAFT)]},
    {"key":"electrical","index":"418","title":"Electrical / Driver Controls","subtitle":"PCM, SYNC 2, ESC and ST instrumentation","aliases":["electrical","diagnostics","pcm","obd","obd2","sync","sync 2","esc","stability","boost gauge","oil temperature","oil pressure","battery"],"symptoms":["warning light","fault code","battery","no start","module","sensor","communication"],"search":"electrical diagnostics pcm obd obd2 fault code dtc battery no start module sensor sync2 sync 2 esc electronic stability transitional stability torque vectoring boost gauge oil temperature pressure","primary":"Powertrain, body and ST-specific driver-control electronics","components":["PCM / engine controls","OBD-II diagnostics","SYNC 2","ESC / ETS / eTVC","ST center gauges","Battery / charging"],"facts":["2015 ST uses a three-gauge center pod for boost, oil temperature and oil pressure information","SYNC 2 was part of the facelift technology update","Exact pinpoint tests and module programming belong in Ford service information"],"sources":[("2015 ST supplement",ST_SUPPLEMENT),("2015 Focus owner manual",OWNER_MANUAL),("Ford workshop / diagnostics",MOTORCRAFT)]},
]

BOOST_COMPONENTS = [
    {"key":"turbo_wastegate","title":"Turbocharger / Wastegate","group":"BOOST CONTROL","aliases":["turbo","turbocharger","wastegate","boost control","actuator","compressor","turbine"],"symptoms":["low boost","overboost","boost oscillation","rattle","smoke","power loss"],"check":"Separate commanded boost, charge leaks, wastegate/actuator behavior and exhaust restriction before condemning the turbocharger assembly.","adjacent":"Intercooler/charge pipes, bypass valve, oil feed/return, exhaust/catalyst and PCM calibration state.","facts":["Turbocharging is one of the three core EcoBoost technologies alongside direct injection and Ti-VCT","Boost pressure is surfaced to the driver through the ST center gauge pod","Modified calibration can materially change diagnosis, so record tune/modification state on the Garage vehicle"],"sources":[("Ford 2015 ST engineering overview",FORD_ST_2015),("2015 ST supplement",ST_SUPPLEMENT),("Workshop diagnostics",MOTORCRAFT)]},
    {"key":"intercooler","title":"Intercooler / Charge-Air","group":"CHARGE AIR","aliases":["intercooler","charge air cooler","cac","boost hose","charge pipe","cold side","hot side"],"symptoms":["boost leak","heat soak","power fade","hiss","oily coupler","low boost"],"check":"Inspect the complete charge tract for loose clamps, split couplers, impact damage and pressure leakage before changing calibration or turbo hardware.","adjacent":"Turbo outlet, throttle body, MAP/pressure sensing, intake tract and front cooling stack.","facts":["Ford Performance's 2015 MP275 package specifically used a higher-flow intercooler as part of the factory-backed power path","Charge-air temperature and leakage directly affect delivered torque on a turbocharged ST"],"sources":[("Ford Performance MP275 reference",MP275),("Ford 2015 ST engineering overview",FORD_ST_2015),("Workshop diagnostics",MOTORCRAFT)]},
    {"key":"direct_injection","title":"Direct Injection / High-Pressure Fuel","group":"FUEL DELIVERY","aliases":["direct injection","gdi","gtdi","injector","injectors","high pressure fuel pump","hpfp","fuel rail","fuel pressure"],"symptoms":["lean code","rich code","misfire","hard start","fuel smell","low rail pressure"],"check":"Use fuel-pressure, trim and cylinder-contribution evidence to separate high-pressure supply, injector and air/ignition faults.","adjacent":"Low-pressure fuel supply, intake leaks, coils/plugs, PCM calibration and EVAP connections.","facts":["Gasoline direct injection is a defining EcoBoost technology","Closely related North-American factory data identifies direct injection for the 2.0 ST engine","Exact pressure tests and component procedures should follow Ford service information"],"sources":[("Ford 2015 ST engineering overview",FORD_ST_2015),("Closely related NA ST technical data",TECH_2016),("Workshop diagnostics",MOTORCRAFT)]},
    {"key":"throttle_airflow","title":"Throttle / Airflow Sensing","group":"AIR METERING","aliases":["throttle body","electronic throttle","maf","mass air flow","map","pressure sensor","intake","airbox"],"symptoms":["hesitation","limp mode","airflow code","idle issue","throttle fault"],"check":"Verify intake integrity, airflow/pressure sensor data and throttle commanded-versus-actual behavior before replacing electronic components.","adjacent":"Air filter/intake tube, charge pipes, intercooler, PCV connections and PCM calibration.","facts":["2013–2015 Focus ST intake architecture includes a serviceable airflow sensor in the intake tract","Airflow and pressure data are central to torque/boost control"],"sources":[("2015 Focus owner manual",OWNER_MANUAL),("Ford workshop diagnostics",MOTORCRAFT),("2015 ST engineering overview",FORD_ST_2015)]},
    {"key":"tivct","title":"Ti-VCT","group":"CAM TIMING","aliases":["tivct","ti-vct","vct","variable cam timing","cam phaser","phasers","cam timing"],"symptoms":["cam timing code","rough idle","rattle","power loss","vct fault"],"check":"Start with oil level/condition, scan-data cam correlation and control evidence; distinguish actuator/control issues from mechanical timing faults.","adjacent":"Engine oil condition/pressure, timing-chain hardware, cam sensors, ignition and PCM calibration.","facts":["Twin Independent Variable Cam Timing is explicitly part of the 2.0 EcoBoost engine architecture","DOHC four-valve cylinder-head design works with independent intake/exhaust cam timing"],"sources":[("Ford 2015 ST engineering overview",FORD_ST_2015),("Closely related NA ST technical data",TECH_2016),("Workshop diagnostics",MOTORCRAFT)]},
    {"key":"ignition","title":"Coil-on-Plug / Spark","group":"IGNITION","aliases":["coil","coils","cop","coil on plug","spark plug","spark","ignition","plug gap"],"symptoms":["misfire","rough idle","load misfire","no start","spark fault"],"check":"Use cylinder-specific misfire data, plug inspection and controlled coil/plug swapping before attributing a load misfire to boost or fueling hardware.","adjacent":"Injector operation, compression, boost leaks, fuel pressure and calibration/tune state.","facts":["Turbocharged cylinder pressure makes plug condition and gap especially relevant to load-misfire diagnosis","Keep modification/calibration state attached to the individual Garage vehicle so diagnosis has context"],"sources":[("2015 ST supplement",ST_SUPPLEMENT),("2015 Focus owner manual",OWNER_MANUAL),("Workshop diagnostics",MOTORCRAFT)]},
]

FONT_HEAD = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
)

EXTRA_CSS = visual_base.EXTRA_CSS + r'''
:root{--irish-green:#4267c7;--blue:#4267c7;--teal:#88aaff;--gj-display:"Barlow Condensed","Arial Narrow",sans-serif;--gj-body:"Manrope",Arial,sans-serif;--gj-mono:"IBM Plex Mono",Consolas,monospace}
body{font-family:var(--gj-body);background:radial-gradient(circle at 82% 5%,rgba(66,103,199,.22),transparent 29rem),radial-gradient(circle at 12% 18%,rgba(227,58,66,.055),transparent 22rem),linear-gradient(rgba(10,12,18,.988),rgba(8,9,13,.998)),#090a0f}
.hero-wrap::before{height:3px;background:linear-gradient(90deg,#4267c7 0 38%,#88aaff 38% 57%,#e8ebf1 57% 76%,#e33a42 76%)}
.hero h1,.e46-work-title,.e46-component-title{font-family:var(--gj-display);font-weight:800;letter-spacing:-.025em}.hero-kicker,.eyebrow,.e46-search-kicker,.e46-work-kicker,.e46-system-index,.e46-component-group,.e46-source-type,.e46-data-label{font-family:var(--gj-mono);color:#9bb7ff}
.card{border-radius:28px 7px 28px 7px!important}.e46-system-grid{gap:14px;border:0!important}.e46-system{border:1px solid rgba(255,255,255,.11)!important;border-radius:20px 5px 20px 5px!important;background:linear-gradient(145deg,rgba(255,255,255,.042),rgba(255,255,255,.012))!important;overflow:hidden}.e46-system:hover,.e46-system:focus-visible{background:rgba(66,103,199,.12)!important;transform:translateY(-4px) rotate(-.12deg)}.e46-system.is-best::after{background:#e33a42}
.e46-system h3{font-family:var(--gj-display);font-size:2rem;letter-spacing:-.02em}.e46-search-shell{border-radius:999px;border-color:rgba(155,183,255,.46);background:rgba(255,255,255,.035)}.e46-search{font-family:var(--gj-body)}.e46-search-clear{border-radius:999px}.e46-result{border-radius:14px 4px 14px 4px!important}.e46-open,.e46-result-rank,.e46-component-open,.e46-component-back,.e46-component-source>span:last-child{color:#9bb7ff!important}.e46-ref:hover,.e46-component-source:hover{border-color:#9bb7ff}.e46-data-note{border-left-color:#4267c7;background:rgba(66,103,199,.08)}
.e46-workshop,.e46-component-view{border-radius:24px 6px 24px 6px;overflow:hidden}.e46-work-details,.e46-component-details{background:linear-gradient(145deg,#121729,#111315)}.e46-component-nav{gap:10px;border:0!important}.e46-component-card{border:1px solid rgba(255,255,255,.10)!important;border-radius:16px 4px 16px 4px!important;background:rgba(255,255,255,.018)}.e46-component-card:hover{background:rgba(66,103,199,.11)!important}.e46-source-strip{gap:10px;border:0!important}.e46-source-tile{border:1px solid rgba(255,255,255,.09)!important;border-radius:16px 4px 16px 4px!important;background:rgba(255,255,255,.015)}
.e46-home-specs{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;border:0;margin-bottom:28px}.e46-home-specs>div{padding:13px 14px;border:1px solid rgba(255,255,255,.09);border-radius:13px 4px 13px 4px;background:rgba(255,255,255,.016)}.e46-home-specs span{display:block;color:#7f89a5;font-family:var(--gj-mono);font-size:.56rem;font-weight:900;letter-spacing:.08em}.e46-home-specs strong{display:block;margin-top:7px;color:#fff;font-size:.82rem}.e46-fact-list{margin:18px 0 0;padding:0;list-style:none}.e46-fact-list li{padding:8px 0;border-top:1px solid rgba(255,255,255,.10);color:#c8cad2;font-size:.79rem}.e46-schematic-mark{color:#9bb7ff}.e46-component-stamp{font-family:var(--gj-display);font-size:clamp(2.2rem,5vw,4.6rem)}
.card--focus_workspace{display:none}.card--focus_workspace.is-open{display:block}
.gj-floatnav{position:fixed;z-index:120;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:4px;border:1px solid rgba(155,183,255,.25);border-radius:999px;background:rgba(9,11,18,.75);backdrop-filter:blur(16px) saturate(125%);box-shadow:0 12px 44px rgba(0,0,0,.25)}.gj-floatnav button{min-height:38px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:#e7eaff;font-family:var(--gj-mono);font-size:.61rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase;cursor:pointer}.gj-floatnav button:hover{background:rgba(66,103,199,.20)}
@keyframes fst-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}.e46-system{animation:fst-rise .42s cubic-bezier(.2,.8,.2,1) both}.e46-system:nth-child(2){animation-delay:.04s}.e46-system:nth-child(3){animation-delay:.08s}.e46-system:nth-child(4){animation-delay:.12s}.e46-system:nth-child(5){animation-delay:.16s}.e46-system:nth-child(6){animation-delay:.20s}.e46-system:nth-child(7){animation-delay:.24s}@media(prefers-reduced-motion:reduce){.e46-system{animation:none!important;transition:none!important}}@media(max-width:900px){.e46-home-specs{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.e46-home-specs{grid-template-columns:repeat(2,1fr)}.gj-floatnav{top:8px}}
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
        drill = '<div class="e46-drill-label">Drill into boost / air / fuel</div><div class="e46-component-nav">' + ''.join(
            f'<button class="e46-component-card" type="button" data-component="{escape(component["key"])}"><span class="e46-component-group">{escape(component["group"])}</span><strong>{escape(component["title"])}</strong><span>{escape(component["check"].split(",")[0])}</span><span class="e46-component-open">→</span></button>'
            for component in BOOST_COMPONENTS
        ) + '</div>'
    return f'<template id="e46-template-{escape(system["key"])}"><div class="e46-workshop"><div class="e46-visual"><div class="e46-visual-head"><span>{escape(system["primary"])}</span><span>Ford factory-grounded reference</span></div><div class="e46-diagram"><div class="e46-diagram-placeholder">{escape(system["index"])}</div></div><div class="e46-source-credit">Use Ford MotorcraftService for exact VIN/configuration-specific workshop procedures, torque values and diagnostics.</div></div><div class="e46-work-details"><span class="e46-work-kicker">2015 FOCUS ST / MK3.5</span><h3 class="e46-work-title">{escape(system["title"])}</h3><p class="e46-work-primary">{escape(system["primary"])}</p><div class="e46-component-grid">{components}</div><div class="e46-ref-actions">{_refs(system["sources"])}</div><div class="e46-data-block"><div class="e46-data-label">Pinned factory facts</div><ul class="e46-fact-list">{facts}</ul></div>{drill}</div></div></template>'


def _component_template(component: dict) -> str:
    facts = ''.join(f'<li>{escape(fact)}</li>' for fact in component["facts"])
    sources = ''.join(f'<a class="e46-component-source" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer"><span><small>{escape(label)}</small><strong>Ford source</strong></span><span>OPEN ↗</span></a>' for label, url in component["sources"])
    return f'<template id="e46-component-{escape(component["key"])}"><div class="e46-component-view"><div class="e46-component-visual"><div class="e46-component-visual-head"><span>2.0 EcoBoost / {escape(component["title"])}</span><span>Factory reference</span></div><div class="e46-component-visual-main"><div class="e46-diagram-placeholder">2.0T</div><span class="e46-component-stamp">{escape(component["title"])}</span></div><div class="e46-component-credit">Exact repair instructions, pinpoint tests and torque specifications should come from Ford service information for the specific VIN and modification state.</div></div><div class="e46-component-details"><div class="e46-component-breadcrumb"><button class="e46-component-back" type="button">EcoBoost / Boost-Air-Fuel</button><span>/</span><span>Component</span></div><h3 class="e46-component-title">{escape(component["title"])}</h3><p class="e46-component-sub">{escape(component["group"])}</p><div class="e46-mini-data"><div><span>Check / diagnose</span><p>{escape(component["check"])}</p></div><div><span>While access is open</span><p>{escape(component["adjacent"])}</p></div></div><ul class="e46-component-parts">{facts}</ul><div class="e46-component-sources">{sources}</div></div></div></template>'


def _body() -> str:
    specs = ''.join(f'<div><span>{key}</span><strong>{value}</strong></div>' for key, value in [
        ("ENGINE", "2.0 EcoBoost GTDI"), ("POWER", "252 hp"), ("TORQUE", "270 lb-ft"),
        ("DRIVE", "Front-wheel drive"), ("TRANS", "6-speed manual"), ("CHASSIS", "ST-specific tuning")
    ])
    tiles = ''.join(_tile(system) for system in SYSTEMS)
    system_templates = ''.join(_system_template(system) for system in SYSTEMS)
    component_templates = ''.join(_component_template(component) for component in BOOST_COMPONENTS)
    component_index = ''.join(
        f'<span class="e46-search-doc" data-doc-type="component" data-system="engine" data-component="{escape(component["key"])}" data-title="{escape(component["title"], quote=True)}" data-search="{escape(_pipes(component["aliases"] + component["symptoms"] + component["facts"]), quote=True)}"></span>'
        for component in BOOST_COMPONENTS
    )
    return f'<div class="e46-home-specs">{specs}</div><div class="e46-index-head"><div><span class="e46-search-kicker">Find anything on this Focus ST</span><p class="e46-index-note">Search a system, symptom, acronym, specification or boost/air/fuel component. Factory facts are indexed here; exact service work routes to Ford service information.</p></div><div><div class="e46-search-shell"><input class="e46-search" type="search" aria-label="Search 2015 Focus ST workshop" placeholder="boost leak, intercooler, Ti-VCT, clutch, eTVC, misfire..."><button class="e46-search-clear" type="button">Clear</button></div><div class="e46-search-meta"></div><div class="e46-search-results"></div><div class="e46-didyoumean">Did you mean <button class="e46-spelling" type="button"></button>?</div></div></div><div class="e46-system-grid">{tiles}</div>{component_index}{system_templates}{component_templates}'


def _workspace() -> str:
    return '<div class="e46-workspace-top"><button class="e46-back" type="button">← System index</button><span class="e46-fitment">2015 Focus ST / Mk3.5 • record VIN, ST trim, wheel/tire equipment, modifications and build data in Garage Journey</span></div><div class="e46-workspace-body"></div>'


def _sources() -> str:
    sources = [
        ("MY15 ST-specific guide", "2015 Focus ST Supplement", ST_SUPPLEMENT),
        ("MY15 owner manual", "2015 Focus Owner's Manual", OWNER_MANUAL),
        ("Factory facelift engineering", "Ford 2015 Focus ST engineering overview", FORD_ST_2015),
        ("Factory platform detail", "Focus ST technical overview", ST_OVERVIEW),
        ("Factory-backed performance context", "2015 Ford Performance MP275 reference", MP275),
        ("Workshop / diagnostics", "Ford MotorcraftService", MOTORCRAFT),
    ]
    return '<div class="e46-source-strip">' + ''.join(f'<a class="e46-source-tile" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer"><span class="e46-source-type">{escape(kind)}</span><strong>{escape(name)}</strong><span>Open source ↗</span></a>' for kind, name, url in sources) + '</div>'


EXTRA_JS = visual_base.EXTRA_JS.replace(
    "const systemsCard=document.querySelector('.card--e46_systems');",
    "const systemsCard=document.querySelector('.card--focus_systems');",
).replace(
    "const workspaceCard=document.querySelector('.card--e46_workspace');",
    "const workspaceCard=document.querySelector('.card--focus_workspace');",
).replace("showSystem('cooling',false)", "showSystem('engine',false)").replace("Cooling → ${item.title}", "Boost / Air / Fuel → ${item.title}") + r'''
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
            CardItem(card_type="focus_systems", eyebrow="WORKSHOP INDEX", title="Find It. Then Drill In.", body=_body()),
            CardItem(card_type="focus_workspace", eyebrow="WORKSPACE", title="System / Component", body=_workspace()),
            CardItem(card_type="focus_library", eyebrow="SOURCE LIBRARY", title="Original References", body=_sources()),
        ],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME, "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"], "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": EXTRA_CSS, "extra_js": EXTRA_JS,
            "extra_head_html": FONT_HEAD + '<meta name="theme-color" content="#090a0f">',
        },
    )
