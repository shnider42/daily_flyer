from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import e46_owner_companion_v5 as visual_base

THEME_NAME = 'corvette_c8_z06_2024'
THEME_CONFIG = {
    'page_title': 'Garage Journey Workshop — 2024 Corvette Z06 2LZ',
    'header_title': 'CORVETTE Z06 / LT6',
    'header_subtitle': '2024 C8 Z06 2LZ in Red Mist Metallic Tintcoat. Follow a symptom into a system, then into the LT6 components and original factory references.',
    'footer_text': 'Confirm VIN, equipment and service history. Diagnostic guidance is a starting point, not a substitute for GM service procedures.',
    'hero_kicker': '2024 // CHEVROLET // C8 Z06 // 2LZ',
    'hero_summary_pill': '5.5L LT6 • NATURALLY ASPIRATED • 8-SPEED DCT',
}
BROCHURE = 'https://media.chevrolet.com/content/dam/Media/images/US/Vehicles/Chevrolet/Cars/Corvette_Z06/2024/2024-Chevrolet-Corvette-Z06-082323.pdf'
OWNER_MANUAL = 'https://www.corvetteblogger.com/docs/2024CorvetteOwnersManual.pdf'
ORDER_GUIDE = 'https://www.corvetteblogger.com/docs/2024CorvetteOrderGuide_070723.pdf'
LT6_REFERENCE = 'https://media.chevrolet.com/media/us/en/chevrolet/home.detail.html/content/Pages/news/us/en/2021/oct/1026-corvette-z06.html'
PARTS = 'https://www.acdelcotds.com/'
MANUALS = 'https://www.chevrolet.com/support/vehicle/manuals-guides'
RECALLS = 'https://www.nhtsa.gov/recalls'
SOURCE_LIBRARY = [
    ('FACTORY / MY2024', 'Chevrolet 2024 Z06 fact sheet', BROCHURE),
    ('GM ORIGINAL / ARCHIVED COPY', '2024 Corvette Owner’s Manual — CorvetteBlogger-hosted PDF', OWNER_MANUAL),
    ('GM ORIGINAL / JULY 7, 2023', '2024 US order guide — CorvetteBlogger-hosted PDF', ORDER_GUIDE),
    ('FACTORY / ENGINE ARCHITECTURE', '2023 Z06 launch: LT6 engineering background, not 2024 equipment proof', LT6_REFERENCE),
    ('CURRENT / SELECT 2024', 'Chevrolet manuals and guides', MANUALS),
    ('VIN-SPECIFIC / SUBSCRIPTION', 'GM Service Information through ACDelco TDS', PARTS),
    ('LIVE / VIN LOOKUP', 'NHTSA open recall lookup', RECALLS),
]
COMPONENT_SOURCES = [('GM LT6 engineering background (2023 launch)', LT6_REFERENCE),
                     ('2024 Corvette Owner’s Manual', OWNER_MANUAL),
                     ('GM VIN-specific service information', PARTS)]


def _system(key, index, title, subtitle, aliases, symptoms, components, facts, guidance):
    return dict(key=key, index=index, title=title, subtitle=subtitle, primary=subtitle,
                aliases=aliases, symptoms=symptoms, components=components, facts=facts,
                guidance=guidance, sources=[('2024 Z06 fact sheet', BROCHURE),
                ('2024 GM order guide', ORDER_GUIDE), ('2024 owner manual', OWNER_MANUAL),
                ('GM service information', PARTS)])


SYSTEMS = [
    _system('engine', 'LT6', 'LT6 Engine / Induction / Fuel', '5.5L naturally aspirated flat-plane-crank V8',
            ['LT6', 'engine', 'flat-plane crank', 'flat plane', 'DOHC', 'induction', 'fuel', 'injector', 'ignition'],
            ['misfire', 'rough idle', 'hesitation', 'power loss', 'check engine', 'noise'],
            ['Crankshaft / rotating assembly', 'DOHC heads / valvetrain', 'Active intake', 'Direct injection', 'Exhaust / engine controls'],
            ['2024 factory rating: 670 hp / 460 lb-ft; eight-speed dual-clutch transmission.',
             'The 2024 fact sheet identifies DOHC heads, a flat-plane crankshaft and an 8,600-rpm redline.',
             'LT6 is the Z06 engine; the Stingray’s LT2 specifications do not apply.'],
            'Capture stored and pending codes, freeze-frame data, fuel history and cold-versus-hot behavior before clearing anything. Separate cylinder-specific misfires from system-wide fueling or electrical problems. A flashing check-engine lamp or severe rough running warrants stopping the drive and following the owner manual. Use the component pages below to organize the evidence.'),
    _system('cooling', 'OIL', 'Cooling / Dry-Sump Lubrication', 'Heat rejection, oil supply and track preparation',
            ['cooling', 'dry sump', 'dry-sump', 'oil pressure', 'radiator', 'fan', 'coolant', 'oil level', 'thermal'],
            ['cooling', 'overheating', 'overheat', 'oil pressure', 'oil leak', 'coolant leak', 'heat soak'],
            ['Dry-sump tank / scavenge stages', 'Oil cooler', 'Radiators / air paths', 'Fans / temperature sensing', 'Coolant plumbing'],
            ['The 2024 manual has separate 5.5L engine-oil instructions; use the Z06 section.',
             'The LT6 launch engineering reference describes six-stage dry-sump lubrication and individual crank-bay scavenging.',
             'Track preparation is configuration-specific; the owner manual distinguishes brake, tire and aero equipment.'],
            'Record oil and coolant temperatures, ambient temperature, speed and warning text. Inspect visible airflow paths for debris and look for leaks only when safe and cool. Do not open a hot cooling system. A low-oil-pressure warning is a stop-engine issue, not an invitation to repeat a high-rpm test. Follow the 5.5L running-engine oil-check procedure exactly; a cold reading can mislead. The oil-life percentage does not measure oil level.'),
    _system('transmission', 'DCT', 'Eight-Speed DCT / Driveline', 'Dual clutches, transmission cooling and rear halfshafts',
            ['DCT', 'transmission', 'dual clutch', 'gearbox', 'driveline', 'clutch', 'halfshaft', 'fluid filter'],
            ['harsh shift', 'shift delay', 'shudder', 'vibration', 'transmission hot', 'leak'],
            ['Dual-clutch transmission', 'Fluid / external filter', 'Clutch controls', 'Cooling', 'Mounts / halfshafts'],
            ['The 2024 Z06 uses an eight-speed dual-clutch transmission.',
             'The owner manual distinguishes transmission fluid life from the external filter service reminder.',
             'The 2024 order guide specifies rear-wheel drive and a Z06-specific final-drive configuration.'],
            'Write down the selected gear, drive mode, fluid temperature, load and whether the symptom occurs cold or hot. Preserve transmission-module codes and compare with engine and ABS data. Ask for fluid/filter service records rather than assuming a reset proves service occurred. Do not apply conventional automatic-transmission fluid or fill methods; level setting and adaptation work require the correct GM procedure.'),
    _system('traction', 'PTM', 'Electronic Differential / Traction', 'eLSD, PTM and stability control work together',
            ['eLSD', 'electronic limited slip', 'differential', 'PTM', 'performance traction management', 'StabiliTrak', 'traction'],
            ['wheel spin', 'traction issue', 'clunk', 'differential warning', 'reduced power', 'wheel hop'],
            ['Electronic limited-slip differential', 'Wheel-speed inputs', 'PTM', 'ABS / stability control', 'Tire circumference'],
            ['The 2024 Z06 equipment guide lists electronic limited-slip differential and Performance Traction Management.',
             'Driver mode and PTM selection alter vehicle behavior; the owner manual explains the operating limits.'],
            'Record the exact mode, road conditions, tire fitment and dashboard message. An intervention can be a response to low grip rather than a broken differential. Check for mismatched tires, wheel-speed faults and recent alignment or tire work before blaming eLSD hardware. Keep exploratory diagnosis on the road within normal driving limits; PTM track settings are not a repair for a fault.'),
    _system('chassis', 'FE6', 'Chassis / Steering / Mag Ride', 'Magnetic Selective Ride Control and electric steering',
            ['Mag Ride', 'magride', 'Magnetic Ride Control', 'suspension', 'steering', 'alignment', 'FE6', 'FE7', 'front lift'],
            ['pulling', 'clunk', 'uneven tire wear', 'harsh ride', 'steering vibration', 'service suspension'],
            ['Adaptive dampers', 'Control arms / joints', 'Electric steering', 'Alignment', 'Front lift if fitted'],
            ['The 2024 order guide lists FE6 Magnetic Selective Ride Control for Z06.',
             'Z07 adds FE7 suspension with a different Magnetic Ride calibration; 2LZ does not establish Z07 fitment.',
             'Front lift is equipment-dependent; its presence on this car is unconfirmed.'],
            'Start with cold tire pressures from the placard, tire condition, selected mode and the actual suspension package. Note speed dependence and which corner makes noise. Inspect for damage, damper leaks and disturbed connectors without disconnecting live systems. Alignment targets must match road/track use and equipment; do not copy another C8’s settings blindly.'),
    _system('brakes', 'STOP', 'Brakes / Wheels / Tires', 'Confirm iron versus carbon ceramic before planning work',
            ['brake', 'brakes', 'Brembo', 'wheel', 'tire', 'carbon ceramic', 'iron rotor', 'Z07', 'TPMS'],
            ['brake vibration', 'pulsation', 'squeal', 'soft pedal', 'uneven wear', 'wheel vibration'],
            ['Calipers / pads / rotors', 'Brake fluid', 'ABS', '20-inch front / 21-inch rear wheels', 'Tire compound / pressure'],
            ['The 2024 guide lists 20-inch front and 21-inch rear Z06 wheels.',
             'Carbon-ceramic brakes are optional and included with Z07; carbon-fiber wheels are separate optional equipment.',
             'The 2024 owner manual separates track preparation by brake and tire configuration.'],
            'For brake vibration, distinguish braking-only pulsation from a vibration present while coasting. Record recent wheel removal, tire damage, pad changes and track heat cycles. Rotor condition, pad transfer and hub/wheel issues require measurement; do not automatically label every pulsation a warped rotor. Confirm rotor material before cleaning, measuring or selecting pads. Stop driving for loss of braking, a sinking pedal or a serious warning.'),
    _system('electrical', 'PDR', 'Electrical / Diagnostics / PDR', 'Module evidence, battery health and performance recordings',
            ['PDR', 'performance data recorder', 'electrical', 'diagnostics', 'OBD', 'battery', 'charging', 'ECM', 'DTC'],
            ['no start', 'warning light', 'fault code', 'communication', 'recording', 'SD card', 'battery drain'],
            ['12V supply / grounds', 'Module scan', 'Engine controls', 'Infotainment', 'PDR / storage media'],
            ['The 2024 order guide includes Performance Data Recorder in the 2LZ equipment group.',
             'The 2024 manual describes PDR recording, storage and privacy considerations.',
             'Recall status belongs to the individual VIN, not every car of this model year.'],
            'Preserve a full module scan with code status and timestamps before disconnecting the battery or clearing faults. Low voltage can produce multiple secondary warnings, so validate supply health first. For PDR issues, follow the 2024 manual’s card and formatting instructions and back up recordings before formatting. A PDR video adds context but cannot replace diagnostic data. Check NHTSA and the dealer for VIN-specific campaigns.'),
    _system('body', 'AERO', 'Aerodynamics / Body', 'Z06 airflow, underbody panels and equipment-specific aero',
            ['aerodynamics', 'aero', 'body', 'splitter', 'spoiler', 'wing', 'undertray', 'Z07', 'convertible', 'coupe'],
            ['rattle', 'scrape', 'panel damage', 'wind noise', 'cooling airflow', 'loose panel'],
            ['Front fascia / splitter', 'Side air inlets', 'Rear spoiler / optional wing', 'Underbody panels', 'Roof configuration'],
            ['The 2024 fact sheet lists both coupe and hardtop convertible Z06 body styles.',
             'Carbon Aero and Z07 are optional; neither follows from the 2LZ designation.',
             'Wide Z06 bodywork supports different airflow and tire packaging from Stingray.'],
            'Photograph the actual splitter, rear spoiler or wing and underbody configuration before ordering parts. Inspect for loose or damaged panels after a scrape; airflow obstruction can contribute to thermal symptoms. Use approved lift points and the model-specific aero instructions. Do not infer a factory aero package from representative photos or mix road and track configurations without the factory guidance.'),
]

ENGINE_COMPONENTS = [
    dict(key='crank', title='Flat-Plane Crankshaft / Rotating Assembly', group='ROTATING ASSEMBLY',
         check='Separate a new vibration or knock from the engine’s normal character. Record rpm, load, temperature and oil-pressure warnings; avoid repeated revving when noise is unexplained.',
         adjacent='Oil-service history, mounts, exhaust contact and cylinder-specific misfire evidence. Internal inspection and balancing decisions belong to qualified LT6 service work.',
         facts=['GM describes a low-inertia flat-plane crank and short-stroke design.', 'Forged aluminum pistons and titanium connecting rods reduce rotating/reciprocating mass.', 'Individual crank-bay scavenging is part of the dry-sump design.']),
    dict(key='heads', title='DOHC Heads / Valvetrain', group='AIRFLOW / VALVE CONTROL',
         check='Correlate cam-related codes, commanded-versus-actual timing and oil condition. A noise alone does not identify a failed lifter, valve or camshaft.',
         adjacent='Harnesses, oil supply and mechanical condition. Do not transfer LT2 pushrod-engine adjustment procedures to the LT6.',
         facts=['GM specifies dual-overhead-cam heads with mechanical finger followers.', 'The launch reference identifies titanium intake valves, sodium-filled exhaust valves and dual-coil springs.', 'The 2024 order guide identifies variable valve timing for LT6.']),
    dict(key='intake', title='Active Intake / Throttle Bodies', group='INDUCTION',
         check='For hesitation or uneven response, inspect filter condition, visible intake connections and scan evidence for throttle or intake-control faults before replacing parts.',
         adjacent='Recent intake work, air leaks, wiring and engine calibration. Record modifications separately from factory equipment.',
         facts=['LT6 is naturally aspirated; turbocharger and boost-leak procedures are not applicable.', 'The GM engineering release describes an active split intake and two 87 mm throttle bodies.']),
    dict(key='fuel', title='Direct Injection / Ignition', group='FUEL / COMBUSTION',
         check='For misfire, save freeze-frame data and compare cylinder misfire counts, fuel trims and requested-versus-actual rail pressure with appropriate scan equipment.',
         adjacent='Recent refueling, fuel quality, ignition components and mechanical compression. High-pressure fuel work needs the specified depressurization and safety procedure.',
         facts=['The 2024 order guide identifies direct injection on the 5.5L LT6.', 'Engine-management diagnosis must use LT6 service data rather than LT2 targets.']),
    dict(key='dry_sump', title='Dry-Sump Tank / Scavenge System', group='LUBRICATION',
         check='Use the 2024 manual’s 5.5L-specific oil-level procedure. Note oil type, fill/service history and conditions when a warning occurred; never chase a cold reading by adding oil blindly.',
         adjacent='External leaks, tank and plumbing condition, oil cooler and oil-pressure sensor evidence. Stop the engine safely for a low-pressure warning.',
         facts=['GM describes six-stage dry-sump lubrication with separate crank-bay scavenging.', 'The owner manual distinguishes 5.5L Z06 oil-check instructions from the 6.2L engine.', 'Oil-life monitoring does not determine the amount of oil in the tank.']),
    dict(key='thermal', title='Cooling / Thermal Management', group='HEAT REJECTION',
         check='For overheating, capture warning text and conditions; inspect accessible inlets for blockage and look for leaks only after the system cools. Never remove a hot pressure cap.',
         adjacent='Fan control, heat exchangers, hoses, coolant history and underbody airflow. Factory fill and bleed instructions matter after any opened circuit.',
         facts=['GM’s Z06 launch reference describes five heat exchangers, including a center unit fed by the front fascia.', 'Z06-specific air openings support engine, brake and transaxle cooling.']),
    dict(key='exhaust', title='Exhaust / Engine Management', group='EXHAUST / CONTROL',
         check='For a new rattle or changed sound, record whether it follows drive mode or engine load. Compare exhaust-valve commands and relevant codes rather than assuming every sound is normal flat-plane character.',
         adjacent='Heat shields, exhaust clearance, sensors, wiring and any tune or aftermarket exhaust. Check the exact calibration and emissions configuration before repair.',
         facts=['GM describes four-into-two-into-one stainless exhaust headers in the LT6 launch architecture.', 'The 2024 Z06 guide lists performance exhaust with sound that varies by driver mode.']),
]


def _configuration_note():
    return ('<aside class="z06-configuration"><strong>Your car: 2024 Z06 • 2LZ • Red Mist Metallic Tintcoat</strong>'
            '<p>Body style, interior color, Z07 package, carbon-ceramic brakes, carbon-fiber wheels, aero and front lift: '
            '<b>not yet confirmed</b>. Check the window sticker/build record and actual equipment. '
            'Representative photographs do not establish your options.</p>'
            '<p>Owner starting point: record VIN and mileage in Garage Journey; gather oil/DCT service records, '
            'identify tires and brakes, then check <a href="https://www.nhtsa.gov/recalls" target="_blank" '
            'rel="noopener noreferrer">open recalls by VIN ↗</a>. No open recall is asserted here.</p></aside>')

FONT_HEAD = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">'

EXTRA_CSS = visual_base.EXTRA_CSS + r'''
:root{--irish-green:#861d35;--blue:#861d35;--teal:#efb3be;--gj-display:"Barlow Condensed","Arial Narrow",sans-serif;--gj-body:"Manrope",Arial,sans-serif;--gj-mono:"IBM Plex Mono",Consolas,monospace}
body{font-family:var(--gj-body);background:radial-gradient(circle at 82% 5%,rgba(134,29,53,.19),transparent 29rem),linear-gradient(rgba(8,9,12,.989),rgba(5,6,8,.999)),#07080a}.hero-wrap::before{height:3px;background:linear-gradient(90deg,#861d35 0 40%,#f4f4f4 40% 57%,#35383c 57%)}
.hero h1,.e46-work-title,.e46-component-title{font-family:var(--gj-display);font-weight:800;letter-spacing:-.025em}.hero-kicker,.eyebrow,.e46-search-kicker,.e46-work-kicker,.e46-system-index,.e46-component-group,.e46-source-type,.e46-data-label{font-family:var(--gj-mono);color:#efb3be}
.card{border-radius:28px 7px 28px 7px!important}.e46-system-grid{gap:14px;border:0!important}.e46-system{border:1px solid rgba(255,255,255,.11)!important;border-radius:20px 5px 20px 5px!important;background:linear-gradient(145deg,rgba(255,255,255,.042),rgba(255,255,255,.012))!important}.e46-system:hover,.e46-system:focus-visible{background:rgba(134,29,53,.11)!important;transform:translateY(-4px)}.e46-system h3{font-family:var(--gj-display);font-size:2rem}.e46-search-shell{border-radius:999px;border-color:rgba(239,179,190,.45);background:rgba(255,255,255,.035)}.e46-open,.e46-result-rank,.e46-component-open,.e46-component-back{color:#efb3be!important}.e46-workshop,.e46-component-view{border-radius:24px 6px 24px 6px;overflow:hidden}.e46-work-details,.e46-component-details{background:linear-gradient(145deg,#15171b,#101114)}.e46-component-nav,.e46-source-strip{gap:10px;border:0!important}.e46-component-card,.e46-source-tile{border:1px solid rgba(255,255,255,.10)!important;border-radius:16px 4px 16px 4px!important;background:rgba(255,255,255,.018)}.e46-component-card:hover{background:rgba(134,29,53,.10)!important}.e46-home-specs{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;border:0;margin-bottom:28px}.e46-home-specs>div{padding:13px 14px;border:1px solid rgba(255,255,255,.09);border-radius:13px 4px 13px 4px;background:rgba(255,255,255,.016)}.e46-home-specs span{display:block;color:#848a93;font-family:var(--gj-mono);font-size:.56rem;font-weight:900;letter-spacing:.08em}.e46-home-specs strong{display:block;margin-top:7px;color:#fff;font-size:.82rem}.e46-fact-list{margin:18px 0 0;padding:0;list-style:none}.e46-fact-list li{padding:8px 0;border-top:1px solid rgba(255,255,255,.10);color:#c8cad2;font-size:.79rem}.e46-schematic-mark{color:#efb3be}.card--z06_workspace{display:none}.card--z06_workspace.is-open{display:block}.gj-floatnav{position:fixed;z-index:120;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:4px;padding:4px;border:1px solid rgba(239,179,190,.25);border-radius:999px;background:rgba(8,9,12,.78);backdrop-filter:blur(16px)}.gj-floatnav button{min-height:38px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:#fff;font-family:var(--gj-mono);font-size:.61rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.gj-floatnav button:hover{background:rgba(134,29,53,.18)}
@media(max-width:900px){.e46-home-specs{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.e46-home-specs{grid-template-columns:repeat(2,1fr)}.gj-floatnav{top:auto;bottom:calc(8px + env(safe-area-inset-bottom))}.e46-system-grid{grid-template-columns:1fr!important}.e46-system{min-height:160px}}
'''


EXTRA_CSS += r'''
.z06-configuration{border-left:3px solid #861d35;padding:18px 22px;margin-bottom:24px;background:#1b1419;color:#ded5da;line-height:1.65;font-size:.85rem}
.z06-configuration a{color:#efb3be}.e46-work-details p{line-height:1.65}
.e46-system h3,.e46-work-title,.e46-component-title{overflow-wrap:anywhere}
.e46-work-details,.e46-component-details{min-width:0}
body{padding-bottom:calc(80px + env(safe-area-inset-bottom))}
@media(max-width:650px){.e46-system-copy{min-width:0}.gj-floatnav{max-width:calc(100vw - 20px)}.e46-workshop,.e46-component-view{scroll-margin-bottom:85px}}
'''


def _pipes(items): return "|".join(items)
def _refs(sources): return ''.join(f'<a class="e46-ref" href="{escape(url,quote=True)}" target="_blank" rel="noopener noreferrer"><span>{escape(label)}</span><span>OPEN ↗</span></a>' for label,url in sources)
def _tile(s):
    attrs=f'data-key="{escape(s["key"])}" data-title="{escape(s["title"],quote=True)}" data-subtitle="{escape(s["subtitle"],quote=True)}" data-search="{escape(_pipes(s["aliases"]+s["symptoms"]+s["facts"]),quote=True)}" data-items="{escape(_pipes(s["components"]),quote=True)}" data-aliases="{escape(_pipes(s["aliases"]),quote=True)}" data-symptoms="{escape(_pipes(s["symptoms"]),quote=True)}"'
    return f'<button class="e46-system" type="button" {attrs}><div class="e46-system-image e46-schematic"><span class="e46-schematic-mark">{escape(s["index"])}</span></div><div class="e46-system-copy"><span class="e46-system-index">SYSTEM</span><h3>{escape(s["title"])}</h3><p>{escape(s["subtitle"])}</p><span class="e46-open">Open workshop →</span></div></button>'
def _system_template(s):
    comps=''.join(f'<span class="e46-component">{escape(x)}</span>' for x in s['components']); facts=''.join(f'<li>{escape(x)}</li>' for x in s['facts']); drill=''
    if s['key']=='engine': drill='<div class="e46-drill-label">Drill into LT6 components</div><div class="e46-component-nav">'+''.join(f'<button class="e46-component-card" type="button" data-component="{c["key"]}"><span class="e46-component-group">{escape(c["group"])}</span><strong>{escape(c["title"])}</strong><span>{escape(c["check"].split(",")[0])}</span><span class="e46-component-open">→</span></button>' for c in ENGINE_COMPONENTS)+'</div>'
    return f'<template id="e46-template-{s["key"]}"><div class="e46-workshop"><div class="e46-visual"><div class="e46-visual-head"><span>{escape(s["primary"])}</span><span>GM factory-grounded reference</span></div><div class="e46-diagram"><div class="e46-diagram-placeholder">{escape(s["index"])}</div></div><div class="e46-source-credit">Use GM service information for exact VIN/configuration-specific procedures, torque values and diagnostics.</div></div><div class="e46-work-details"><span class="e46-work-kicker">2024 CORVETTE Z06 / C8</span><h3 class="e46-work-title">{escape(s["title"])}</h3><p class="e46-work-primary">{escape(s["primary"])}</p><div class="e46-component-grid">{comps}</div><div class="e46-ref-actions">{_refs(s["sources"])}</div><div class="e46-data-block"><div class="e46-data-label">Pinned factory facts</div><ul class="e46-fact-list">{facts}</ul></div><div class="e46-data-block"><div class="e46-data-label">General diagnostic guidance</div><p>{escape(s['guidance'])}</p></div>{drill}</div></div></template>'
def _component_template(c):
    facts=''.join(f'<li>{escape(x)}</li>' for x in c['facts'])
    return f'<template id="e46-component-{c["key"]}"><div class="e46-component-view"><div class="e46-component-visual"><div class="e46-component-visual-head"><span>LT6 / {escape(c["title"])}</span><span>Factory reference</span></div><div class="e46-component-visual-main"><div class="e46-diagram-placeholder">LT6</div><span class="e46-component-stamp">{escape(c["title"])}</span></div></div><div class="e46-component-details"><div class="e46-component-breadcrumb"><button class="e46-component-back" type="button">LT6 / Engine</button><span>/</span><span>Component</span></div><h3 class="e46-component-title">{escape(c["title"])}</h3><p class="e46-component-sub">{escape(c["group"])}</p><div class="e46-mini-data"><div><span>General diagnostic guidance</span><p>{escape(c["check"])}</p></div><div><span>Related checks / owner record</span><p>{escape(c["adjacent"])}</p></div></div><div class="e46-data-label">Factory architecture reference</div><ul class="e46-component-parts">{facts}</ul><div class="e46-component-sources">{_refs(COMPONENT_SOURCES)}</div></div></div></template>'

def _body():
    specs=''.join(f'<div><span>{k}</span><strong>{v}</strong></div>' for k,v in [("ENGINE","5.5L LT6 V8"),("POWER","670 hp"),("TORQUE","460 lb-ft"),("DRIVE","Rear-wheel drive"),("TRANS","8-speed DCT"),("TRIM","2LZ / Red Mist")])
    tiles=''.join(_tile(s) for s in SYSTEMS); templates=''.join(_system_template(s) for s in SYSTEMS); components=''.join(_component_template(c) for c in ENGINE_COMPONENTS)
    index=''.join(f'<span class="e46-search-doc" data-doc-type="component" data-system="engine" data-component="{c["key"]}" data-title="{escape(c["title"],quote=True)}" data-search="{escape(_pipes([c["title"],c["group"],c["check"]]+c["facts"]),quote=True)}"></span>' for c in ENGINE_COMPONENTS)
    return f'<div class="e46-home-specs">{specs}</div>{_configuration_note()}<div class="e46-index-head"><div><span class="e46-search-kicker">Find your Z06 system</span><p class="e46-index-note">Search a system, symptom, specification or LT6 component. Factory facts and general diagnostic guidance are labeled separately. Enthusiast reports are not verified faults. Exact procedures, parts and torque values belong in VIN-specific GM service information.</p></div><div><div class="e46-search-shell"><input class="e46-search" type="search" aria-label="Search 2024 Corvette Z06 workshop" placeholder="LT6, dry sump, DCT, eLSD, Mag Ride, PTM, PDR..."><button class="e46-search-clear" type="button">Clear</button></div><div class="e46-search-meta"></div><div class="e46-search-results"></div><div class="e46-didyoumean">Did you mean <button class="e46-spelling" type="button"></button>?</div></div></div><div class="e46-system-grid">{tiles}</div>{index}{templates}{components}'

def _workspace(): return '<div class="e46-workspace-top"><button class="e46-back" type="button">← System index</button><span class="e46-fitment">2024 Corvette Z06 2LZ / C8 • confirm VIN, body style, interior, Z07, brake material, wheels, aero and modifications</span></div><div class="e46-workspace-body"></div>'
def _sources():
    sources=SOURCE_LIBRARY
    return '<div class="e46-source-strip">'+''.join(f'<a class="e46-source-tile" href="{escape(url,quote=True)}" target="_blank" rel="noopener noreferrer"><span class="e46-source-type">{escape(kind)}</span><strong>{escape(name)}</strong><span>Open source ↗</span></a>' for kind,name,url in sources)+'</div>'

EXTRA_JS = visual_base.EXTRA_JS.replace("const systemsCard=document.querySelector('.card--e46_systems');","const systemsCard=document.querySelector('.card--z06_systems');").replace("const workspaceCard=document.querySelector('.card--e46_workspace');","const workspaceCard=document.querySelector('.card--z06_workspace');").replace("showSystem('cooling',false)","showSystem('engine',false)").replace("Cooling → ${item.title}","LT6 → ${item.title}") + r'''
(function(){if(document.querySelector('.gj-floatnav'))return;const nav=document.createElement('nav');nav.className='gj-floatnav';nav.setAttribute('aria-label','Garage Journey navigation');nav.innerHTML='<button type="button" class="gj-nav-back">← Back</button><button type="button" class="gj-nav-home">⌂ Garage Home</button>';document.body.appendChild(nav);const garage=()=>{location.href='/?theme=garage';};nav.querySelector('.gj-nav-back').addEventListener('click',()=>{try{const ref=document.referrer?new URL(document.referrer):null;if(ref&&ref.origin===location.origin){history.back();return;}}catch(error){}garage();});nav.querySelector('.gj-nav-home').addEventListener('click',garage);})();
'''

def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today=resolve_date(date_str);del seed
    return PageContext(page_title=THEME_CONFIG['page_title'],header_title=THEME_CONFIG['header_title'],header_subtitle=THEME_CONFIG['header_subtitle'],today_str=today.strftime('%A, %B %d, %Y'),cards=[CardItem(card_type='z06_systems',eyebrow='WORKSHOP INDEX',title='Find It. Then Drill In.',body=_body()),CardItem(card_type='z06_workspace',eyebrow='WORKSPACE',title='System / Component',body=_workspace()),CardItem(card_type='z06_library',eyebrow='SOURCE LIBRARY',title='Original References',body=_sources())],footer_text=THEME_CONFIG['footer_text'],metadata={'theme_name':THEME_NAME,'date_key':today.strftime('%m-%d'),'hero_kicker':THEME_CONFIG['hero_kicker'],'hero_summary_pill':THEME_CONFIG['hero_summary_pill'],'extra_css':EXTRA_CSS,'extra_js':EXTRA_JS,'extra_head_html':FONT_HEAD+'<meta name="theme-color" content="#07080a">'})
