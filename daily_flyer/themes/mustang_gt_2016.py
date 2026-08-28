from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import e46_owner_companion_v5 as visual_base

THEME_NAME = "mustang_gt_2016"
THEME_CONFIG = {
    "page_title": "Garage Journey Workshop — 2016 Ford Mustang GT",
    "header_title": "MUSTANG GT / S550",
    "header_subtitle": "Factory-grounded technical index for the 2016 Mustang GT — Gen-2 Coyote, driveline, chassis, diagnostics, and original Ford references.",
    "footer_text": "Garage Journey technical reference. Confirm VIN, transmission, axle ratio, Performance Package equipment, wheel/brake fitment, and build data before applying configuration-specific procedures or parts.",
    "hero_kicker": "2016 // MUSTANG GT // S550 // GEN-2 COYOTE 5.0",
    "hero_summary_pill": "SEARCH • SYSTEM • COMPONENT • SOURCE",
}

TECH_SPECS = "https://media.ford.com/content/dam/lincolnmedia/lna/us/product/2016/2016-Ford-Mustang-Tech-Specs.pdf"
PRODUCT_SHEET = "https://media.ford.com/content/dam/lincolnmedia/lna/us/product/2016/2016-Ford-Mustang-Product-Sheet.pdf"
S550_PRESS = "https://media.ford.com/content/dam/fordmedia/North%20America/US/2014/08/21/mustang/15mustang-kit.pdf"
COYOTE_GEN2 = "https://performanceparts.ford.com/download/PDFS/FPP_Gen_2_Coyote_Technical_Reference_2-16.pdf"
QRG_2016 = "https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/updated-2016-Mustang-QRG-Version-1_QG_EN-US_07_2015.pdf"
MOTORCRAFT = "https://www.motorcraftservice.com/"
FP_MANUAL = "https://performanceparts.ford.com/part/M-6017-504V"
FP_AUTO = "https://performanceparts.ford.com/part/M-6017-M50A"

SYSTEMS = [
    {"key":"engine","index":"5.0","title":"Coyote / Air-Fuel","subtitle":"Gen-2 5.0 Ti-VCT V8","aliases":["engine","motor","coyote","5.0","v8","gen 2","gen2","intake","fuel","throttle","cmcv"],"symptoms":["misfire","rough idle","power loss","hesitation","engine noise","check engine"],"search":"engine motor coyote gen2 gen 2 5.0 4951 v8 ti-vct tivct dohc 4 valve intake cmcv charge motion throttle maf fuel injector ignition misfire 435 hp 400 lb ft 6500 4250 11.0 compression","primary":"2015–17 Mustang Gen-2 5.0L Ti-VCT Coyote V8","components":["Cylinder heads / valvetrain","Ti-VCT / cam phasers","Intake manifold / CMCV","Electronic throttle / MAF","Port fuel injection","Coil-on-plug ignition"],"facts":["4,951 cc displacement","435 hp @ 6,500 rpm","400 lb-ft @ 4,250 rpm","11.0:1 compression ratio","DOHC, four valves per cylinder, twin independent variable cam timing"],"sources":[("2016 factory technical specifications",TECH_SPECS),("Ford Performance Gen-2 Coyote reference",COYOTE_GEN2),("Ford S550 technical press kit",S550_PRESS)]},
    {"key":"cooling","index":"303","title":"Cooling / Lubrication","subtitle":"Coolant, oil, thermal management","aliases":["cooling","coolant","radiator","water pump","thermostat","oil","lubrication","oil cooler","filter"],"symptoms":["overheat","runs hot","coolant leak","oil pressure","oil leak","temperature"],"search":"cooling coolant radiator water pump thermostat fan oil lubrication oil cooler filter pressure temperature overheat leak coyote 5.0","primary":"Coyote engine cooling and lubrication systems","components":["Radiator circuit","Water pump / thermostat","Cooling fans","Engine oil system","Standard oil cooler","Hoses / reservoirs"],"facts":["Gen-2 technical reference identifies a standard oil cooler","Performance-package cooling equipment can change vehicle-specific context","Use MotorcraftService for exact fill, bleed, torque and repair procedures"],"sources":[("Gen-2 Coyote technical reference",COYOTE_GEN2),("2016 owner quick reference",QRG_2016),("Ford workshop information",MOTORCRAFT)]},
    {"key":"transmission","index":"308","title":"Transmission / Clutch","subtitle":"6MT or 6-speed SelectShift automatic","aliases":["transmission","gearbox","manual","mt82","mt-82","automatic","6r80","clutch","shifter","selectshift"],"symptoms":["hard shift","gear grind","clutch","shift flare","transmission noise","won't shift"],"search":"transmission gearbox six speed manual mt82 mt-82 automatic 6r80 selectshift clutch shifter flywheel torque converter paddle shift","primary":"Rear-drive six-speed transmission choices","components":["6-speed manual","Clutch / flywheel","6-speed automatic","Torque converter","Shifter / linkage","Transmission control"],"facts":["Six-speed manual offered","Six-speed SelectShift automatic offered","Automatic control-pack documentation identifies 6R80 compatibility","Record the individual car's transmission before fitment work"],"sources":[("2016 factory technical specifications",TECH_SPECS),("Ford Performance manual control reference",FP_MANUAL),("Ford Performance 6R80 control reference",FP_AUTO)]},
    {"key":"driveline","index":"205","title":"Rear Axle / Driveline","subtitle":"Differential, halfshafts, prop shaft","aliases":["differential","diff","rear axle","halfshaft","half shaft","driveshaft","prop shaft","final drive","torsen","limited slip"],"symptoms":["clunk","whine","vibration","wheel hop","axle noise","driveline lash"],"search":"rear axle differential diff limited slip torsen performance package final drive gear ratio halfshaft cv axle driveshaft prop shaft wheel hop clunk whine vibration","primary":"S550 rear-wheel-drive driveline","components":["Rear differential","Final-drive ratio","Halfshafts / CV joints","Prop shaft","Differential mounts","Wheel hubs / bearings"],"facts":["Rear-wheel drive","Axle ratio and differential equipment vary by configuration/package","Integral-link IRS changes driveline mounting and halfshaft context versus earlier solid-axle Mustangs"],"sources":[("2016 factory technical specifications",TECH_SPECS),("S550 chassis technical press kit",S550_PRESS),("Ford workshop information",MOTORCRAFT)]},
    {"key":"chassis","index":"204","title":"Chassis / Steering","subtitle":"Double-ball-joint front / integral-link IRS","aliases":["suspension","front suspension","rear suspension","irs","independent rear","steering","epas","alignment","strut","control arm"],"symptoms":["pulling","clunk","wandering","alignment","uneven tire wear","steering feel"],"search":"chassis suspension double ball joint macpherson strut integral link independent rear suspension irs control arm toe link camber link aluminum knuckle epas steering alignment","primary":"S550 independent front and rear chassis architecture","components":["Front MacPherson struts","Double-ball-joint front links","Integral-link IRS","Rear aluminum knuckles","EPAS steering","Alignment / bushings"],"facts":["Double-ball-joint front MacPherson strut layout","Integral-link independent rear suspension","Aluminum rear knuckles reduce unsprung mass","Electric power-assisted steering"],"sources":[("Ford S550 chassis technical press kit",S550_PRESS),("2016 factory technical specifications",TECH_SPECS),("Ford workshop information",MOTORCRAFT)]},
    {"key":"brakes","index":"206","title":"Brakes / Wheels / Tires","subtitle":"GT brakes / Performance Package forks","aliases":["brakes","brake","brembo","rotor","caliper","wheel","tire","tyre","performance pack"],"symptoms":["brake vibration","pedal","pad wear","rotor wear","tire wear","wheel vibration"],"search":"brake brakes brembo performance package rotor disc caliper pad wheel tire tyre abs advance trac 19 inch 18 inch fitment","primary":"Mustang GT braking and contact-patch systems","components":["Front brakes","Rear brakes","Performance Package brakes","ABS / AdvanceTrac","Wheels","Tires"],"facts":["Four-wheel disc brakes with ABS/AdvanceTrac architecture","Brake and wheel packages vary substantially with Performance Package equipment","Exact rotor/caliper/wheel/tire fitment must follow the individual vehicle configuration"],"sources":[("2016 factory technical specifications",TECH_SPECS),("S550 chassis technical press kit",S550_PRESS),("Ford workshop information",MOTORCRAFT)]},
    {"key":"electrical","index":"418","title":"Electrical / Driver Controls","subtitle":"PCM, OBD-II, drive modes, Track Apps","aliases":["electrical","diagnostics","pcm","obd","obd2","ids","fjds","track apps","drive modes","advance trac","launch control","line lock","battery"],"symptoms":["warning light","fault code","battery","no start","module","sensor","communication"],"search":"electrical diagnostics pcm obd obd2 ids fjds fault code dtc battery no start module sensor track apps line lock launch control drive mode advance trac epas","primary":"Powertrain, body and driver-control electronics","components":["PCM / engine controls","OBD-II diagnostics","Drive Modes","Track Apps / Line Lock","AdvanceTrac","Battery / charging"],"facts":["OBD-II is part of the Coyote control architecture","Selectable drive/steering modes and Track Apps are vehicle-feature context","Ford service diagnostics and workshop literature are indexed through MotorcraftService"],"sources":[("2016 quick reference guide",QRG_2016),("Ford Performance control-pack diagnostics",FP_MANUAL),("Ford service / diagnostics",MOTORCRAFT)]},
]

ENGINE_COMPONENTS = [
    {"key":"heads_valvetrain","title":"Cylinder Heads / Valvetrain","group":"GEN-2 COYOTE","aliases":["heads","cylinder head","valves","valve springs","camshaft","cams","roller follower"],"symptoms":["valvetrain noise","misfire","compression","top end noise","high rpm issue"],"check":"Separate mechanical valvetrain noise, compression/sealing, cam timing and ignition/fueling faults before condemning cylinder-head hardware.","adjacent":"Ti-VCT phasers, timing chains/tensioners, spark plugs/coils, intake sealing and oil condition.","facts":["New Gen-2 cylinder-head casting with revised straighter ports","Larger intake and exhaust valves","Revised intake and exhaust camshafts","Stiffer valve springs for high-rpm control"],"sources":[("Ford Performance Gen-2 reference",COYOTE_GEN2),("2016 factory engine specifications",TECH_SPECS),("Workshop procedures",MOTORCRAFT)]},
    {"key":"tivct","title":"Ti-VCT / Cam Phasers","group":"CAM TIMING","aliases":["tivct","ti-vct","vct","cam phaser","phasers","variable cam timing","mid lock"],"symptoms":["cam timing code","rattle","rough idle","power loss","vct fault"],"check":"Start with oil level/condition and scan-data/cam-correlation evidence; distinguish actuator/control faults from mechanical timing-chain or phaser problems.","adjacent":"Oil pressure/quality, timing chains/tensioners, cam sensors, PCM calibration and cylinder-head condition.","facts":["Twin independent variable camshaft timing","Gen-2 intake VCT uses mid-lock phasers","Gen-2 changes broaden valve-timing control range"],"sources":[("Ford Performance Gen-2 reference",COYOTE_GEN2),("2016 factory engine specifications",TECH_SPECS),("Workshop diagnostics",MOTORCRAFT)]},
    {"key":"intake_cmcv","title":"Intake Manifold / CMCV","group":"AIR MANAGEMENT","aliases":["intake","intake manifold","cmcv","charge motion","charge motion control valve","runner control"],"symptoms":["rough idle","hesitation","runner code","power loss","vacuum leak"],"check":"Inspect manifold sealing, charge-motion actuator/linkage behavior and related DTC/command data before replacing the manifold assembly.","adjacent":"Throttle body, MAF/intake tube, vacuum/EVAP connections, injector sealing and calibration state.","facts":["Gen-2 composite intake manifold uses charge motion control valves","CMCV partially restricts port flow at lower speed to increase charge tumble/swirl","Ford cites idle stability, emissions and fuel-mixing benefits"],"sources":[("Ford Performance Gen-2 reference",COYOTE_GEN2),("S550 factory technical press kit",S550_PRESS),("Workshop diagnostics",MOTORCRAFT)]},
    {"key":"throttle_maf","title":"Electronic Throttle / MAF","group":"AIR METERING","aliases":["throttle body","electronic throttle","etc","maf","mass air flow","airbox","intake tube"],"symptoms":["throttle fault","hesitation","limp mode","airflow code","idle issue"],"check":"Verify intake tract integrity, MAF contamination/data, throttle command/actual position and wiring before replacing electronic components.","adjacent":"Air filter/intake tube, CMCV, PCM, pedal position sensors and vacuum leaks.","facts":["Electronic throttle control is part of the 2015–17 Coyote control architecture","MAF, airbox and intake tube are explicitly part of Ford Performance's 2015–17 control package"],"sources":[("Ford Performance 2015–17 control reference",FP_MANUAL),("2016 factory technical specifications",TECH_SPECS),("Workshop diagnostics",MOTORCRAFT)]},
    {"key":"fuel_injection","title":"Port Fuel Injection","group":"FUEL DELIVERY","aliases":["injector","injectors","fuel rail","fuel pump","port injection","fuel pressure"],"symptoms":["lean code","rich code","misfire","fuel smell","hard start","low pressure"],"check":"Use fuel-trim, injector contribution, pressure and leak evidence to separate injector faults from air leaks, ignition problems and pump/supply issues.","adjacent":"MAF/intake leaks, coils/plugs, EVAP, fuel pump/control and PCM calibration.","facts":["2016 GT Gen-2 Coyote predates the Gen-3 dual port/direct-injection system","Fuel delivery and calibration are configuration-sensitive; use Ford service information for exact testing"],"sources":[("2016 factory technical specifications",TECH_SPECS),("Ford Performance Gen-2 reference",COYOTE_GEN2),("Workshop diagnostics",MOTORCRAFT)]},
    {"key":"ignition","title":"Coil-on-Plug Ignition","group":"IGNITION","aliases":["coil","coils","cop","coil on plug","spark plug","spark","ignition"],"symptoms":["misfire","rough idle","no start","spark fault","load misfire"],"check":"Use cylinder-specific misfire data, plug inspection and controlled coil/plug swapping before attributing a misfire to mechanical or fueling causes.","adjacent":"Spark plugs, injector operation, compression, cam timing and harness/PCM outputs.","facts":["Distributor-less coil-on-plug ignition","Eight-cylinder architecture allows cylinder-specific coil and plug diagnosis"],"sources":[("2016 factory technical specifications",TECH_SPECS),("Ford Performance control reference",FP_MANUAL),("Workshop diagnostics",MOTORCRAFT)]},
]

FONT_HEAD = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
)

EXTRA_CSS = visual_base.EXTRA_CSS + r'''
:root{--irish-green:#2f6db3;--blue:#2f6db3;--teal:#d8dde3;--gj-display:"Barlow Condensed","Arial Narrow",sans-serif;--gj-body:"Manrope",Arial,sans-serif;--gj-mono:"IBM Plex Mono",Consolas,monospace}
body{font-family:var(--gj-body);background:radial-gradient(circle at 82% 5%,rgba(47,109,179,.16),transparent 29rem),radial-gradient(circle at 12% 18%,rgba(182,30,45,.055),transparent 22rem),linear-gradient(rgba(10,13,17,.985),rgba(8,9,11,.997)),#090b0e}
.hero-wrap::before{height:3px;background:linear-gradient(90deg,#2f6db3 0 31%,#f0f1f2 31% 52%,#b51f32 52% 64%,#34383d 64%)}
.hero h1,.e46-work-title,.e46-component-title{font-family:var(--gj-display);font-weight:800;letter-spacing:-.025em}.hero-kicker,.eyebrow,.e46-search-kicker,.e46-work-kicker,.e46-system-index,.e46-component-group,.e46-source-type,.e46-data-label{font-family:var(--gj-mono);color:#b8c9dd}
.card{border-radius:28px 7px 28px 7px!important}.e46-system-grid{gap:14px;border:0!important}.e46-system{border:1px solid rgba(255,255,255,.11)!important;border-radius:20px 5px 20px 5px!important;background:linear-gradient(145deg,rgba(255,255,255,.042),rgba(255,255,255,.012))!important;overflow:hidden}.e46-system:hover,.e46-system:focus-visible{background:rgba(47,109,179,.11)!important;transform:translateY(-4px) rotate(-.12deg)}.e46-system.is-best::after{background:#b51f32}
.e46-system h3{font-family:var(--gj-display);font-size:2rem;letter-spacing:-.02em}.e46-search-shell{border-radius:999px;border-color:rgba(184,201,221,.46);background:rgba(255,255,255,.035)}.e46-search{font-family:var(--gj-body)}.e46-search-clear{border-radius:999px}.e46-result{border-radius:14px 4px 14px 4px!important}.e46-open,.e46-result-rank,.e46-component-open,.e46-component-back,.e46-component-source>span:last-child{color:#8eb6df!important}.e46-ref:hover,.e46-component-source:hover{border-color:#8eb6df}.e46-data-note{border-left-color:#2f6db3;background:rgba(47,109,179,.075)}
.e46-workshop,.e46-component-view{border-radius:24px 6px 24px 6px;overflow:hidden}.e46-work-details,.e46-component-details{background:linear-gradient(145deg,#111821,#111315)}.e46-component-nav{gap:10px;border:0!important}.e46-component-card{border:1px solid rgba(255,255,255,.10)!important;border-radius:16px 4px 16px 4px!important;background:rgba(255,255,255,.018)}.e46-component-card:hover{background:rgba(47,109,179,.10)!important}.e46-source-strip{gap:10px;border:0!important}.e46-source-tile{border:1px solid rgba(255,255,255,.09)!important;border-radius:16px 4px 16px 4px!important;background:rgba(255,255,255,.015)}
.e46-home-specs{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;border:0;margin-bottom:28px}.e46-home-specs>div{padding:13px 14px;border:1px solid rgba(255,255,255,.09);border-radius:13px 4px 13px 4px;background:rgba(255,255,255,.016)}.e46-home-specs span{display:block;color:#78828d;font-family:var(--gj-mono);font-size:.56rem;font-weight:900;letter-spacing:.08em}.e46-home-specs strong{display:block;margin-top:7px;color:#fff;font-size:.82rem}.e46-fact-list{margin:18px 0 0;padding:0;list-style:none}.e46-fact-list li{padding:8px 0;border-top:1px solid rgba(255,255,255,.10);color:#c7cbd0;font-size:.79rem}.e46-schematic-mark{color:#b8c9dd}.e46-component-stamp{font-family:var(--gj-display);font-size:clamp(2.2rem,5vw,4.6rem)}
.card--mustang_workspace{display:none}.card--mustang_workspace.is-open{display:block}
.gj-floatnav{position:fixed;z-index:120;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:4px;border:1px solid rgba(184,201,221,.25);border-radius:999px;background:rgba(8,12,17,.74);backdrop-filter:blur(16px) saturate(125%);box-shadow:0 12px 44px rgba(0,0,0,.25)}.gj-floatnav button{min-height:38px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:#e6ebf0;font-family:var(--gj-mono);font-size:.61rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase;cursor:pointer}.gj-floatnav button:hover{background:rgba(47,109,179,.18)}
@keyframes mst-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}.e46-system{animation:mst-rise .42s cubic-bezier(.2,.8,.2,1) both}.e46-system:nth-child(2){animation-delay:.04s}.e46-system:nth-child(3){animation-delay:.08s}.e46-system:nth-child(4){animation-delay:.12s}.e46-system:nth-child(5){animation-delay:.16s}.e46-system:nth-child(6){animation-delay:.20s}.e46-system:nth-child(7){animation-delay:.24s}@media(prefers-reduced-motion:reduce){.e46-system{animation:none!important;transition:none!important}}@media(max-width:900px){.e46-home-specs{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.e46-home-specs{grid-template-columns:repeat(2,1fr)}.gj-floatnav{top:8px}}
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
        drill = '<div class="e46-drill-label">Drill into the Gen-2 Coyote</div><div class="e46-component-nav">' + ''.join(
            f'<button class="e46-component-card" type="button" data-component="{escape(component["key"])}"><span class="e46-component-group">{escape(component["group"])}</span><strong>{escape(component["title"])}</strong><span>{escape(component["check"].split(",")[0])}</span><span class="e46-component-open">→</span></button>'
            for component in ENGINE_COMPONENTS
        ) + '</div>'
    return f'<template id="e46-template-{escape(system["key"])}"><div class="e46-workshop"><div class="e46-visual"><div class="e46-visual-head"><span>{escape(system["primary"])}</span><span>Ford factory-grounded reference</span></div><div class="e46-diagram"><div class="e46-diagram-placeholder">{escape(system["index"])}</div></div><div class="e46-source-credit">Use Ford MotorcraftService for exact VIN/configuration-specific workshop procedures, torque values and diagnostics.</div></div><div class="e46-work-details"><span class="e46-work-kicker">2016 MUSTANG GT / S550</span><h3 class="e46-work-title">{escape(system["title"])}</h3><p class="e46-work-primary">{escape(system["primary"])}</p><div class="e46-component-grid">{components}</div><div class="e46-ref-actions">{_refs(system["sources"])}</div><div class="e46-data-block"><div class="e46-data-label">Pinned factory facts</div><ul class="e46-fact-list">{facts}</ul></div>{drill}</div></div></template>'


def _component_template(component: dict) -> str:
    facts = ''.join(f'<li>{escape(fact)}</li>' for fact in component["facts"])
    sources = ''.join(f'<a class="e46-component-source" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer"><span><small>{escape(label)}</small><strong>Ford source</strong></span><span>OPEN ↗</span></a>' for label, url in component["sources"])
    return f'<template id="e46-component-{escape(component["key"])}"><div class="e46-component-view"><div class="e46-component-visual"><div class="e46-component-visual-head"><span>Gen-2 Coyote / {escape(component["title"])}</span><span>Factory reference</span></div><div class="e46-component-visual-main"><div class="e46-diagram-placeholder">5.0</div><span class="e46-component-stamp">{escape(component["title"])}</span></div><div class="e46-component-credit">Exact repair instructions, pinpoint tests and torque specifications should come from Ford service information for the specific VIN/configuration.</div></div><div class="e46-component-details"><div class="e46-component-breadcrumb"><button class="e46-component-back" type="button">Coyote / Air-Fuel</button><span>/</span><span>Component</span></div><h3 class="e46-component-title">{escape(component["title"])}</h3><p class="e46-component-sub">{escape(component["group"])}</p><div class="e46-mini-data"><div><span>Check / diagnose</span><p>{escape(component["check"])}</p></div><div><span>While access is open</span><p>{escape(component["adjacent"])}</p></div></div><ul class="e46-component-parts">{facts}</ul><div class="e46-component-sources">{sources}</div></div></div></template>'


def _body() -> str:
    specs = ''.join(f'<div><span>{key}</span><strong>{value}</strong></div>' for key, value in [
        ("ENGINE", "5.0 Gen-2 Coyote"), ("POWER", "435 hp"), ("TORQUE", "400 lb-ft"),
        ("DRIVE", "Rear-wheel drive"), ("CHASSIS", "Integral-link IRS"), ("TRANS", "6MT / 6AT")
    ])
    tiles = ''.join(_tile(system) for system in SYSTEMS)
    system_templates = ''.join(_system_template(system) for system in SYSTEMS)
    component_templates = ''.join(_component_template(component) for component in ENGINE_COMPONENTS)
    component_index = ''.join(
        f'<span class="e46-search-doc" data-doc-type="component" data-system="engine" data-component="{escape(component["key"])}" data-title="{escape(component["title"], quote=True)}" data-search="{escape(_pipes(component["aliases"] + component["symptoms"] + component["facts"]), quote=True)}"></span>'
        for component in ENGINE_COMPONENTS
    )
    return f'<div class="e46-home-specs">{specs}</div><div class="e46-index-head"><div><span class="e46-search-kicker">Find anything on this Mustang GT</span><p class="e46-index-note">Search a system, symptom, acronym, specification or Gen-2 Coyote component. Factory facts are indexed here; exact service work routes to Ford service information.</p></div><div><div class="e46-search-shell"><input class="e46-search" type="search" aria-label="Search 2016 Mustang GT workshop" placeholder="Coyote, CMCV, MT82, 6R80, IRS, Brembo, misfire..."><button class="e46-search-clear" type="button">Clear</button></div><div class="e46-search-meta"></div><div class="e46-search-results"></div><div class="e46-didyoumean">Did you mean <button class="e46-spelling" type="button"></button>?</div></div></div><div class="e46-system-grid">{tiles}</div>{component_index}{system_templates}{component_templates}'


def _workspace() -> str:
    return '<div class="e46-workspace-top"><button class="e46-back" type="button">← System index</button><span class="e46-fitment">2016 Mustang GT / S550 • record VIN, transmission, axle ratio, Performance Package/brakes and build data in Garage Journey</span></div><div class="e46-workspace-body"></div>'


def _sources() -> str:
    sources = [
        ("Factory technical specs", "2016 Mustang technical specifications", TECH_SPECS),
        ("Factory Gen-2 engine reference", "Ford Performance Gen-2 Coyote technical reference", COYOTE_GEN2),
        ("Factory platform detail", "S550 Mustang technical press kit", S550_PRESS),
        ("MY16 vehicle guide", "2016 Mustang Quick Reference Guide", QRG_2016),
        ("Workshop / diagnostics", "Ford MotorcraftService", MOTORCRAFT),
        ("Powertrain controls", "2015–17 Coyote manual control reference", FP_MANUAL),
    ]
    return '<div class="e46-source-strip">' + ''.join(f'<a class="e46-source-tile" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer"><span class="e46-source-type">{escape(kind)}</span><strong>{escape(name)}</strong><span>Open source ↗</span></a>' for kind, name, url in sources) + '</div>'


EXTRA_JS = visual_base.EXTRA_JS.replace(
    "const systemsCard=document.querySelector('.card--e46_systems');",
    "const systemsCard=document.querySelector('.card--mustang_systems');",
).replace(
    "const workspaceCard=document.querySelector('.card--e46_workspace');",
    "const workspaceCard=document.querySelector('.card--mustang_workspace');",
).replace("showSystem('cooling',false)", "showSystem('engine',false)").replace("Cooling → ${item.title}", "Coyote / Air-Fuel → ${item.title}") + r'''
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
            CardItem(card_type="mustang_systems", eyebrow="WORKSHOP INDEX", title="Find It. Then Drill In.", body=_body()),
            CardItem(card_type="mustang_workspace", eyebrow="WORKSPACE", title="System / Component", body=_workspace()),
            CardItem(card_type="mustang_library", eyebrow="SOURCE LIBRARY", title="Original References", body=_sources()),
        ],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME, "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"], "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": EXTRA_CSS, "extra_js": EXTRA_JS,
            "extra_head_html": FONT_HEAD + '<meta name="theme-color" content="#090b0e">',
        },
    )
