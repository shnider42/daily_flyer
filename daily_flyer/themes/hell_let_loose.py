from __future__ import annotations

import hashlib
import random
from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "hell_let_loose"

THEME_CONFIG = {
    "page_title": "Hell Let Loose Field Brief — Daily Flyer",
    "header_title": "HELL LET LOOSE // FIELD BRIEF",
    "header_subtitle": (
        "A daily operations board about leadership, communication, logistics, historical "
        "battlefields, and the squad that eventually remembers someone has to build the garrison."
    ),
    "footer_text": (
        "Unofficial fan-made Daily Flyer theme. Hell Let Loose belongs to its respective rights holders. "
        "Build spawns, mark threats, and keep command chat useful."
    ),
    "hero_kicker": "DAILY FLYER // OPERATIONS ORDER",
    "hero_summary_pill": "50v50 combined arms • teamwork over K/D • briefing rotates daily",
}


# title, theater, in-game note, historical note, tactical note, source
MAPS = [
    (
        "Juno Beach",
        "Normandy, France — 7 June 1944",
        "Update 20 added Juno Beach with Canadian forces, moving from coast and marina through farms, waterways, and inland villages.",
        "Canadian troops secured the Juno beachhead on D-Day and continued their push inland the following day.",
        "Water, walls, and built-up lanes make lateral movement and fallback garrisons unusually valuable.",
        "https://www.hellletloose.com/blog/update-20-changelog",
    ),
    (
        "Smolensk",
        "Western Russia — Eastern Front",
        "Update 19 introduced the game's largest urban battlefield, with dense blocks, industrial ground, and multi-story fighting.",
        "Smolensk sat on a strategic route toward Moscow; the 1941 battle delayed the German advance while Soviet forces reorganized.",
        "Clear adjacent buildings and rooflines together. One cleared room is not an urban strategy.",
        "https://www.hellletloose.com/blog/update-19-changelog",
    ),
    (
        "Remagen",
        "Rhine River, Germany — March 1945",
        "Patch 19.1 refreshed the Ludendorff Bridge battlefield and added more ways to contest the crossing.",
        "U.S. forces captured the bridge on 7 March 1945 and established an unexpected Rhine bridgehead.",
        "The bridge matters, but all fifty players are not legally required to stand on the same ten meters of it.",
        "https://www.hellletloose.com/blog/patch-19-1-changelog",
    ),
    (
        "Carentan",
        "Normandy, France — June 1944",
        "Streets, courtyards, rail lines, waterways, and open approaches force squads to alternate between clearing and overwatch.",
        "Carentan linked the Utah and Omaha beachheads and became a major objective for U.S. airborne forces.",
        "Use short urban instructions: one element watches, one clears, and nobody starts a command-chat podcast.",
        "https://www.army.mil/article/252544/the_battle_of_carentan",
    ),
    (
        "Foy",
        "Belgium — Battle of the Bulge",
        "Snow, open fields, and long sightlines punish unsupported movement and reward armor-infantry coordination.",
        "Foy changed hands during the fighting north of Bastogne and became associated with the 101st Airborne's defense.",
        "The open snowfield is not cover, even when six squadmates enter it together with confidence.",
        "https://www.army.mil/botb/",
    ),
    (
        "Stalingrad",
        "Volga River, Soviet Union — 1942–43",
        "Industrial ruins, rail yards, trenches, rubble, and broad lanes make local information sharing essential.",
        "The battle ended with the surrender of the encircled German Sixth Army after months of catastrophic fighting.",
        "Rubble provides concealment, not a written guarantee that the machine gunner across the yard cannot see you.",
        "https://www.hellletloose.com/blog/update-18-changelog",
    ),
    (
        "Kursk",
        "Soviet Union — July 1943",
        "Wide fields, trenches, rolling ground, and armor lanes make marking and anti-tank positioning more important than reaction speed.",
        "The battle around the Kursk salient became one of history's largest armored confrontations.",
        "Mark the tank before saying 'tank on me.' Command does not know your spiritual location.",
        "https://www.britannica.com/event/Battle-of-Kursk",
    ),
    (
        "El Alamein",
        "Egypt — North African Campaign",
        "Sparse cover, ridgelines, and exposed approaches increase the value of smoke, armor support, and deliberate movement.",
        "The Second Battle of El Alamein helped turn the North African campaign toward the Allies in late 1942.",
        "When a map has three bushes, assume all three already contain an enemy player.",
        "https://www.iwm.org.uk/history/what-you-need-to-know-about-the-battle-of-el-alamein",
    ),
    (
        "Purple Heart Lane",
        "Normandy, France — June 1944",
        "Flooded fields, causeways, ditches, and hedgerows channel movement into predictable and dangerous lanes.",
        "The area reflects the difficult advance toward Carentan across exposed roads and flooded Normandy ground.",
        "The obvious road is obvious to both teams. Build another spawn before discovering this experimentally.",
        "https://www.army.mil/article/252544/the_battle_of_carentan",
    ),
    (
        "Driel",
        "Netherlands — Operation Market Garden",
        "Open fields, dikes, villages, and river approaches reward smoke, transport, and layered spawn networks.",
        "Polish paratroopers landed near Driel and tried to support the isolated Allied forces at Arnhem.",
        "Smoke is a temporary wall, not a temporary vacation from communication.",
        "https://www.iwm.org.uk/history/what-was-operation-market-garden",
    ),
]


# title, lesson, leadership use, common failure, source
MECHANICS = [
    (
        "Garrisons: The Actual Front Line",
        "Team-wide spawns create options, reveal pressure when locked, and decide whether a team can recover after losing ground.",
        "Ask where the team will spawn after the current position fails. Build before the emergency.",
        "Winning the firefight, taking the sector, and realizing every friendly spawn is two grids away.",
        "https://hellletloose.com/blog/faqs",
    ),
    (
        "Outposts: Squad Tempo",
        "An outpost sustains one squad's local pressure and should move whenever the squad's mission changes.",
        "Place it close enough to matter but far enough away that one grenade does not convert the squad into spectators.",
        "Keeping an outpost 600 meters behind the unit because it is still technically alive.",
        "https://hellletloose.com/blog/faqs",
    ),
    (
        "Supplies: Strategy in a Box",
        "Supplies turn intentions into garrisons, nodes, defenses, repair stations, and other infrastructure.",
        "Tell Support where to drop and why. 'Somewhere around here' is not a logistics plan.",
        "A crate sits thirty meters from the perfect garrison while everyone debates geometry.",
        "https://hellletloose.com/blog/faqs",
    ),
    (
        "Nodes and the Invisible War",
        "Nodes support the commander's resource economy and therefore vehicles, reconnaissance, supply drops, and major abilities.",
        "Assign builders early and protect the quiet work long enough for it to finish.",
        "Requesting heavy tanks and bombing runs while producing resources at the rate of a small bakery.",
        "https://hellletloose.com/blog/faqs",
    ),
    (
        "Redeploy: Strategic Teleportation with Paperwork",
        "Redeploying abandons an irrelevant position so a player can re-enter through a useful spawn.",
        "Name the destination before giving the order, or the squad will materialize at three different garrisons.",
        "Jogging four minutes to defend the point that fell three minutes ago.",
        "https://hellletloose.com/blog/faqs",
    ),
    (
        "Suppression Creates Time",
        "Suppression disrupts enemy vision and accuracy and can enable movement without producing a clean elimination.",
        "Pair fire with a named maneuver. Noise without movement is only an aggressive soundtrack.",
        "The machine gun suppresses perfectly while the assault element watches from the same hedge.",
        "https://hellletloose.com/blog/faqs",
    ),
    (
        "Armor Is a Three-Person Conversation",
        "A crew's commander, gunner, and driver combine awareness, movement, and firepower; communication matters more than solo mechanics.",
        "Use short directional calls and share infantry map marks before the tank discovers the threat itself.",
        "The driver turns, the gunner fires, the commander asks why, and the enemy tank answers.",
        "https://www.hellletloose.com/blog/update-20-changelog",
    ),
    (
        "Artillery and the Map-Marker Contract",
        "Artillery converts map information into distant fire support and depends on accurate marks, timing, and resource awareness.",
        "Confirm the mark, announce the mission, and stop firing when friendlies enter the area.",
        "The marker moved, the infantry pushed, and the shell remained deeply committed to the original plan.",
        "https://www.hellletloose.com/blog/update-19-changelog",
    ),
]


# title, job, best habit
ROLES = [
    ("Officer / Squad Leader", "Turn commander's intent into one achievable squad mission, maintain the outpost, mark threats, and manage both radios.", "Give the squad a verb: defend, screen, flank, build, clear, escort, or observe."),
    ("Support", "Carry the supplies that connect squad movement to the team's spawn and defensive infrastructure.", "Stay near the officer until the supplies have become something useful."),
    ("Engineer", "Build nodes, defenses, repair stations, obstacles, mines, and satchel opportunities that shape the battle.", "Ask what the team needs before constructing a fortress in an abandoned sector."),
    ("Machine Gunner", "Control lanes, suppress positions, protect movement, and punish predictable approaches.", "Relocate after revealing the position; the muzzle flash submitted your address."),
    ("Anti-Tank", "Threaten armor, deny roads, and coordinate rockets, guns, mines, or satchels.", "Mark the vehicle and say whether you need supplies, a flank, or ten seconds of cover."),
    ("Medic", "Preserve local pressure by returning nearby casualties when the route from the spawn is long or exposed.", "Revive where the casualty will not immediately demonstrate the same ballistic result."),
    ("Automatic Rifleman", "Provide mobile automatic fire for assaults, short crossings, and close defensive angles.", "Move with the maneuver element instead of becoming an independent noise source."),
    ("Rifleman", "Provide reliable infantry fire and faction-dependent ammunition support.", "Watch the unglamorous sector nobody else is watching."),
]


# title, personnel, mission
LOADOUTS = [
    ("The Garrison Crew", "Officer • Support • Engineer • Rifleman • Machine Gunner • Anti-Tank", "Build a forward garrison, establish infrastructure, and hold the route long enough for the team to use it."),
    ("The Deliberate Attack", "Officer • Support • Assault • Automatic Rifleman • Machine Gunner • Medic", "Use suppression and smoke for one controlled crossing, then clear the objective in bounded steps."),
    ("The Armor Escort", "Officer • Engineer • Support • Anti-Tank • Rifleman • Automatic Rifleman", "Screen a friendly tank from enemy AT, repair it, mark opposing armor, and clear nearby terrain."),
    ("The Elastic Defense", "Officer • Support • Engineer • Machine Gunner • Anti-Tank • Medic", "Build more than one spawn, cover approaches, and preserve a fallback before the strongpoint fails."),
    ("The Wide Flank", "Officer • Support • Rifleman • Automatic Rifleman • Anti-Tank • Medic", "Avoid unnecessary fights, establish a hidden outpost, and convert the route into a spawn or infrastructure attack."),
    ("The Urban Clearing Team", "Officer • Assault • Automatic Rifleman • Support • Medic • Anti-Tank", "Clear one block at a time, smoke exposed crossings, and keep the outpost outside the building being contested."),
    ("The Logistics Security Detail", "Officer • Support • Engineer • Rifleman • Machine Gunner • Medic", "Escort supplies, protect the build, and transition back into infantry work instead of guarding lumber forever."),
    ("The Reconnaissance Screen", "Officer • Rifleman • Automatic Rifleman • Anti-Tank • Support • Medic", "Observe a broad approach, report movement, destroy exposed spawns, and avoid turning every sighting into a fight."),
]


# title, historical fact, field note, source
WEAPONS = [
    ("M1 Garand", "The U.S. semi-automatic service rifle fed from an eight-round en-bloc clip.", "Fast follow-up shots do not remove the need for cover and spacing.", "https://www.nps.gov/spar/learn/historyculture/m1-garand.htm"),
    ("Karabiner 98k", "Germany's standard bolt-action service rifle developed from the Mauser 98 system.", "The slower action rewards the unfashionable skill of aiming.", "https://www.iwm.org.uk/collections/item/object/30029425"),
    ("Lee-Enfield No. 4 Mk I", "The British and Commonwealth rifle used a ten-round magazine and smooth bolt action.", "A fast bolt is still weaker than a squad that identified the correct hedge.", "https://www.iwm.org.uk/collections/item/object/30035386"),
    ("Bren Gun", "The Bren was a magazine-fed light machine gun used throughout British and Commonwealth forces.", "Use the bipod and a useful field of fire, not merely the dramatic silhouette.", "https://www.iwm.org.uk/collections/item/object/30029443"),
    ("StG 44", "The selective-fire StG 44 used an intermediate cartridge and is often described as an early assault rifle.", "Automatic fire is a setting, not a personality.", "https://www.iwm.org.uk/collections/item/object/30029439"),
    ("M1918A2 BAR", "The BAR gave U.S. squads mobile automatic fire, though its magazine limited sustained fire.", "Controlled bursts work better than treating it like a belt-fed weapon with optimism.", "https://www.iwm.org.uk/collections/item/object/30029444"),
    ("M1 Carbine", "The lightweight U.S. carbine armed officers and troops who needed something handier than a full rifle.", "Handy does not mean magical at every range on a two-kilometer map.", "https://www.nps.gov/articles/000/m1-carbine.htm"),
    ("Lanchester SMG", "The British submachine gun returned with the Canadian Forces in Update 20.", "Close-range fire is useful; narrating every missed burst is optional.", "https://www.hellletloose.com/blog/update-20-changelog"),
]


# title, objective, principle, radio
COMMAND_INTENTS = [
    ("Create Two Ways Back Into the Fight", "Build or preserve two useful team spawns before committing the main attack.", "Resilience is decided before the team needs it.", "Identify the defensive garrison, attacking garrison, and owner of the next build."),
    ("Defend the Approaches", "Detect and delay enemy movement before it reaches the strongpoint.", "A capture circle full of defenders can still be blind.", "Assign north, east, south, or west instead of saying 'watch everywhere.'"),
    ("One Squad, One Clear Job", "Give every unit a specific mission and stop stacking three squads on one vague flank.", "Coordination begins when responsibilities stop overlapping accidentally.", "Use squad names and verbs: Able screens; Baker builds; Charlie attacks."),
    ("Move the Spawn, Then the Line", "Advance infrastructure before asking the team to hold newly captured ground.", "Momentum without logistics is a temporary field trip.", "Support stays with the officer until the new spawn is confirmed."),
    ("Protect the Quiet Work", "Secure engineers, supply vehicles, and support players while they build.", "Unglamorous work still requires explicit ownership.", "Request one covering squad, not the entire army."),
    ("Mark Before You Shoot", "Convert sightings into team-wide map information before or while engaging.", "One mark lets fifty players benefit from one player's awareness.", "Type, direction, grid, movement: 'heavy tank, E5, moving west.'"),
    ("Know When the Attack Failed", "Stop feeding an exposed lane, preserve the spawn, and change the geometry.", "Persistence is not repeating a disproven idea.", "State the new axis and who holds the old one during transition."),
    ("Short Radios, Long Awareness", "Keep transmissions concise enough that urgent information can interrupt them.", "The best leaders communicate more meaning with fewer words.", "Pause after the call so the recipient can acknowledge or correct it."),
]


# title, lesson, joke
RADIO_NOTES = [
    ("The Useful Contact Report", "Say what it is, where it is, and what it is doing: 'enemy half-track, F6 keypad 3, stationary behind the barn.'", "Avoid 'over there,' 'on my body,' and 'you know where I mean.'"),
    ("Separate Squad and Command Chat", "Squad details belong in squad chat; information affecting other units belongs in command chat.", "Command probably does not need the emotional history of the machine gunner in the attic."),
    ("Acknowledge Orders", "A short 'copy,' 'unable,' or 'after current task' tells a leader whether the plan exists outside their imagination.", "Silence can mean agreement, confusion, disconnection, or eating."),
    ("Use Map Marks as Shared Memory", "Mark armor, infantry, garrisons, supplies, routes, and requests so the call persists after the sentence ends.", "A five-second mark often outlives a five-minute explanation."),
    ("Report Results", "After acting, say what happened: spawn built, tank destroyed, route blocked, position lost, or task impossible.", "Without feedback, command chat becomes unresolved side quests."),
    ("Do Not Compete for Airtime", "Wait for urgent calls to finish, then transmit the minimum useful information.", "Three people talking louder is not redundancy."),
    ("Use a Shared Reference", "Use bearings for nearby squad calls and grids or marks for wider team calls.", "Your personal 'left' becomes another player's 'why is the tank behind us?'"),
    ("Correct Without Performing", "Update bad information neutrally, move the mark, and continue the mission.", "Public humiliation has never built a garrison."),
]


COMMUNITY_NOTES = [
    ("The Blueberry Migration", "When friendlies move in one unexplained direction, check whether they know something—or whether one player started running and created a folk tradition."),
    ("The Abandoned Supply Truck", "A truck in a ditch is often a complete logistics plan waiting for a driver with patience and a working reverse gear."),
    ("The Strongpoint Gravity Well", "Players collapse onto the circle. Good defense also owns the routes and terrain the enemy must cross first."),
    ("The Commander Without Officers", "A commander cannot lead fifty individuals directly. Officers convert one strategy into local actions."),
    ("The Heroic Solo Flank", "A flank becomes strategy when it creates a spawn, destroys infrastructure, marks threats, or coordinates an attack."),
    ("The Truck Full of Optimists", "A transport truck moves fastest when its passengers agree on a destination before passing the intersection."),
    ("The Invisible Defender", "The player watching an empty approach appears unproductive right until the approach stops being empty."),
    ("The Final Thirty Seconds", "Late-match urgency makes concise communication more important, not less."),
]


MONTHLY_HISTORY = {
    1: ("Foy Changes Hands — January 1945", "Fighting around Foy formed part of the struggle north of Bastogne, where observation and coordinated movement mattered across exposed winter ground.", "https://www.army.mil/botb/"),
    2: ("The Hürtgen Campaign Ends — February 1945", "Months of combat in the Hürtgen Forest showed how dense terrain could disrupt visibility, movement, supply, and command.", "https://www.army.mil/article/47366/the_battle_of_hurtgen_forest"),
    3: ("The Bridge at Remagen — March 1945", "U.S. forces captured the Ludendorff Bridge on 7 March 1945. Hell Let Loose refreshed the map in Patch 19.1.", "https://www.hellletloose.com/blog/patch-19-1-changelog"),
    4: ("Juno Beach Testing — April 2026", "Dev Brief #217 introduced the Juno Beach experiment, set during the Canadian push inland on D-Day +1.", "https://www.hellletloose.com/blog/dev-brief-217-juno-beach"),
    5: ("Update 20 Experimental Branch — May 2026", "Players tested Juno Beach, the Canadian Forces, and armor changes before the full update.", "https://www.hellletloose.com/blog/dev-brief-218-u20-exp-branch"),
    6: ("Early Access and Update 20 — June", "Hell Let Loose entered Steam Early Access in June 2019; Update 20 arrived seven years later with Juno Beach and Canada.", "https://www.hellletloose.com/blog/update-20-changelog"),
    7: ("Full PC Release — July 2021", "Hell Let Loose left Steam Early Access in July 2021 with player-built spawns, leadership channels, and combined-arms coordination at its core.", "https://store.steampowered.com/news/app/686810/view/2998819983302580037"),
    8: ("The Battle for Hill 400", "The Hürtgen terrain represented by Hill 400 demonstrates how elevation and forest can dominate observation and reinforcement.", "https://www.army.mil/article/47366/the_battle_of_hurtgen_forest"),
    9: ("Operation Market Garden — September 1944", "Driel represents the difficult attempt by Polish paratroopers to support the isolated Arnhem bridgehead.", "https://www.iwm.org.uk/history/what-was-operation-market-garden"),
    10: ("Console Launch and Stalingrad Refresh — October", "The console edition launched in October 2021; Update 18 later refreshed Stalingrad and expanded the armor rework.", "https://www.hellletloose.com/blog/update-18-changelog"),
    11: ("Operation Uranus — November 1942", "The Soviet counteroffensive encircled Axis forces around Stalingrad and transformed the campaign.", "https://www.nationalww2museum.org/war/articles/battle-of-stalingrad"),
    12: ("Update 19 and the Ardennes — December", "Update 19 brought Smolensk, artillery squads, and self-propelled artillery; December also marks the opening of the 1944 Ardennes offensive.", "https://www.hellletloose.com/blog/update-19-changelog"),
}


EXTRA_CSS = r"""
:root{--bg:#151711;--bg-deep:#0d0f0b;--bg-soft:#20231a;--card:#dfd2aa;--card-strong:#e6d9b0;--border:#171912;--border-strong:#171912;--ink:#191b15;--ink-soft:#2c3026;--muted:#555b47;--irish-green:#525943;--gold:#c7aa64;--teal:#70785b;--blue:#9b4f31;--radius-xl:0;--radius-lg:0;--radius-md:0;--max-width:1240px}
html{background:#151711}body{font-family:"Courier New",monospace;color:#e5dcc2;background:linear-gradient(rgba(22,24,18,.92),rgba(15,17,13,.98)),repeating-linear-gradient(0deg,transparent 0 39px,rgba(215,199,155,.09) 40px),repeating-linear-gradient(90deg,transparent 0 39px,rgba(215,199,155,.09) 40px),#181a14}
body::before{width:580px;height:580px;top:-220px;left:-180px;background:radial-gradient(circle,transparent 0 22%,rgba(215,199,155,.08) 22.5% 23%,transparent 23.5% 38%,rgba(215,199,155,.08) 38.5% 39%,transparent 39.5%),linear-gradient(45deg,transparent 49.5%,rgba(215,199,155,.09) 50%,transparent 50.5%),linear-gradient(-45deg,transparent 49.5%,rgba(215,199,155,.09) 50%,transparent 50.5%);filter:none;opacity:1}
body::after{width:460px;height:460px;right:-160px;top:32%;background:radial-gradient(circle,transparent 0 9%,rgba(155,79,49,.16) 9.5% 10%,transparent 10.5% 28%,rgba(155,79,49,.12) 28.5% 29%,transparent 29.5%);filter:none;opacity:1}
.hero-wrap{padding-top:24px}header.hero{min-height:360px;padding:30px clamp(22px,5vw,58px) 34px;border:3px solid #11130e;border-radius:0;color:#191b15;background:linear-gradient(100deg,rgba(227,214,173,.97),rgba(207,193,148,.95));box-shadow:14px 16px 0 rgba(0,0,0,.34);clip-path:polygon(0 0,calc(100% - 24px) 0,100% 24px,100% 100%,20px 100%,0 calc(100% - 20px));backdrop-filter:none}
header.hero::before{opacity:.48;background:repeating-linear-gradient(0deg,transparent 0 31px,rgba(43,46,37,.16) 32px),repeating-linear-gradient(90deg,transparent 0 31px,rgba(43,46,37,.16) 32px),radial-gradient(circle at 86% 38%,transparent 0 62px,rgba(127,49,37,.24) 63px 66px,transparent 67px)}
header.hero::after{content:"OPERATIONS\A ORDER";white-space:pre;position:absolute;right:clamp(20px,5vw,64px);top:32px;padding:10px 14px 8px;border:4px double rgba(127,49,37,.72);color:rgba(127,49,37,.76);font-family:Impact,"Arial Narrow",sans-serif;font-size:clamp(1rem,2.6vw,1.7rem);line-height:.94;letter-spacing:.08em;text-align:center;transform:rotate(4deg)}
.hero-kicker,.hero-pill{position:relative;z-index:1;border:2px solid #191b15;border-radius:0;background:rgba(255,255,255,.12);color:#191b15;font-weight:900}.hero h1{position:relative;z-index:1;max-width:12ch;margin-top:1.4rem;color:#10120d;font-family:Impact,"Arial Narrow",sans-serif;font-size:clamp(3.25rem,8.4vw,7.1rem);line-height:.84;letter-spacing:.035em;text-transform:uppercase}.hero .subtitle{position:relative;z-index:1;max-width:68ch;padding-top:14px;border-top:3px solid #191b15;color:#303329;font-weight:700}.hero-meta{position:relative;z-index:1}
.hll-day-nav{position:relative;z-index:2;display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.hll-day-nav__label,.hll-day-nav__link{min-height:40px;display:inline-flex;align-items:center;justify-content:center;border:2px solid #191b15;border-radius:0;color:#191b15;background:rgba(255,255,255,.12);font-weight:900;text-transform:uppercase;text-decoration:none}.hll-day-nav__label{padding:8px 12px;background:#191b15;color:#dfd2aa;font-size:.72rem;letter-spacing:.08em}.hll-day-nav__link{padding:8px 14px}.hll-day-nav__link:hover,.hll-day-nav__link--today{background:#9b4f31;color:#fff4d8;text-decoration:none}
main{gap:20px;padding-top:30px}.card{grid-column:span 4;min-height:250px;padding:1.15rem;border:3px solid #171912;border-radius:0;color:#191b15;background:linear-gradient(rgba(228,216,177,.97),rgba(207,195,153,.97));box-shadow:9px 10px 0 rgba(0,0,0,.29);clip-path:polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,12px 100%,0 calc(100% - 12px));backdrop-filter:none;transition:transform 130ms ease,box-shadow 130ms ease}.card:nth-child(even){background:linear-gradient(rgba(207,205,170,.97),rgba(188,188,151,.97))}.card:hover{transform:translate(-2px,-2px);box-shadow:13px 14px 0 rgba(0,0,0,.31)}.card::before{background:repeating-linear-gradient(0deg,transparent 0 27px,rgba(45,48,38,.08) 28px)}.card::after{top:auto;bottom:0;height:8px;background:repeating-linear-gradient(135deg,#24271e 0 12px,#9b4f31 12px 24px)}
.card--hll_orders{grid-column:span 12;min-height:0}.card--hll_map{grid-column:span 7}.card--hll_mechanic{grid-column:span 5}.card--hll_history,.card--hll_leadership{grid-column:span 6}.card--hll_radio{background:linear-gradient(rgba(196,201,165,.97),rgba(177,185,146,.97))}
.card-head{position:relative;z-index:1;padding-bottom:.72rem;border-bottom:3px solid rgba(34,37,29,.75)}.eyebrow{color:#555a47;font-size:.76rem;font-weight:900;letter-spacing:.15em}h2{color:#161811;font-family:Impact,"Arial Narrow",sans-serif;font-size:clamp(1.45rem,2.9vw,2.2rem);line-height:1;letter-spacing:.04em;text-transform:uppercase}.icon-badge{width:56px;height:44px;border:2px solid #2d3026;border-radius:0;background:rgba(255,255,255,.12);color:transparent;font-size:0}.icon-badge::before{color:#20231b;font-family:Impact,"Arial Narrow",sans-serif;font-size:.76rem;letter-spacing:.06em}.card--hll_orders .icon-badge::before{content:"CMD"}.card--hll_map .icon-badge::before{content:"MAP"}.card--hll_mechanic .icon-badge::before{content:"SYS"}.card--hll_role .icon-badge::before{content:"MOS"}.card--hll_weapon .icon-badge::before{content:"ARMS"}.card--hll_loadout .icon-badge::before{content:"UNIT"}.card--hll_radio .icon-badge::before{content:"COMMS"}.card--hll_history .icon-badge::before{content:"HIST"}.card--hll_leadership .icon-badge::before{content:"AAR"}
.body{position:relative;z-index:1;color:#2b2e25;font-weight:600;line-height:1.6}.body strong,.body b{color:#11130e}.brief-grid{display:grid;grid-template-columns:minmax(122px,.3fr) 1fr;gap:.55rem .95rem}.brief-label{color:#5b604c;font-size:.74rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.brief-value{color:#20231b}.orders-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem}.order-box{min-height:130px;padding:.82rem;border:2px solid #464a3a;background:rgba(255,255,255,.12)}.order-box span{display:block;margin-bottom:.45rem;color:#5c614d;font-size:.72rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.hll-callout{margin-top:.9rem;padding:.72rem .82rem;border-left:7px solid #5f6946;background:rgba(95,105,70,.12)}.hll-warning{border-left-color:#9b4f31;background:rgba(155,79,49,.1)}.source{border-top:2px dashed rgba(44,47,37,.35)}a{color:#354426;text-decoration:underline;text-underline-offset:3px}.footer-inner{border:2px solid rgba(216,207,179,.22);border-radius:0;color:#c9c0a6;background:rgba(0,0,0,.2)}
@media(max-width:980px){.card--hll_map,.card--hll_mechanic,.card--hll_history,.card--hll_leadership{grid-column:span 12}.card--hll_role,.card--hll_weapon,.card--hll_loadout,.card--hll_radio{grid-column:span 6}.orders-list{grid-template-columns:1fr}}
@media(max-width:720px){header.hero{min-height:0;padding:24px 18px;box-shadow:7px 8px 0 rgba(0,0,0,.32)}header.hero::after{position:relative;display:inline-block;right:auto;top:auto;margin-top:16px;font-size:1rem}.hero h1{max-width:none;font-size:clamp(2.7rem,15vw,4.7rem)}.hll-day-nav__label{flex:1 0 100%}.hll-day-nav__link{flex:1 1 0;padding-inline:8px;font-size:.78rem}main{grid-template-columns:1fr!important;gap:14px;padding:16px 12px 24px}.card,.card--hll_orders,.card--hll_map,.card--hll_mechanic,.card--hll_role,.card--hll_weapon,.card--hll_loadout,.card--hll_radio,.card--hll_history,.card--hll_leadership{grid-column:1/-1!important;min-height:0;padding:1rem;box-shadow:6px 7px 0 rgba(0,0,0,.28)}.brief-grid{grid-template-columns:1fr}.brief-label{margin-top:.4rem}}
"""

EXTRA_JS = r"""
(function(){
 const hero=document.querySelector("header.hero");if(!hero||document.querySelector(".hll-day-nav"))return;
 const pad=v=>String(v).padStart(2,"0");
 const localToday=()=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate())};
 const parse=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||"");return m?new Date(+m[1],+m[2]-1,+m[3]):localToday()};
 const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const href=(offset,todayMode)=>{const p=new URLSearchParams(location.search),d=todayMode?localToday():parse(p.get("date"));d.setDate(d.getDate()+offset);p.set("theme","hell_let_loose");p.set("date",iso(d));p.delete("seed");return `${location.pathname}?${p}`};
 const nav=document.createElement("nav");nav.className="hll-day-nav";nav.setAttribute("aria-label","Hell Let Loose Field Brief date navigation");
 nav.innerHTML=`<span class="hll-day-nav__label">Briefing controls</span><a class="hll-day-nav__link" href="${href(-1,false)}">← Previous</a><a class="hll-day-nav__link hll-day-nav__link--today" href="${href(0,true)}">Current brief</a><a class="hll-day-nav__link" href="${href(1,false)}">Next →</a>`;
 const meta=hero.querySelector(".hero-meta");if(meta)meta.insertAdjacentElement("afterend",nav);else hero.appendChild(nav);
})();
"""


def _rng(day_key: str, namespace: str, seed: int | None) -> random.Random:
    raw = f"{THEME_NAME}|{day_key}|{namespace}|{seed if seed is not None else 'daily'}"
    return random.Random(int.from_bytes(hashlib.sha256(raw.encode()).digest()[:8], "big"))


def _pick(items, day_key: str, namespace: str, seed: int | None):
    return _rng(day_key, namespace, seed).choice(items)


def _week_pick(items, today, namespace: str):
    year, week, _ = today.isocalendar()
    raw = f"{THEME_NAME}|{year}-W{week:02d}|{namespace}"
    index = int.from_bytes(hashlib.sha256(raw.encode()).digest()[:4], "big") % len(items)
    return items[index]


def _rows(rows: list[tuple[str, str]]) -> str:
    return '<div class="brief-grid">' + "".join(
        f'<div class="brief-label">{escape(label)}</div><div class="brief-value">{escape(value)}</div>'
        for label, value in rows
    ) + "</div>"


def _callout(label: str, text: str, warning: bool = False) -> str:
    cls = "hll-callout hll-warning" if warning else "hll-callout"
    return f'<div class="{cls}"><strong>{escape(label)}:</strong> {escape(text)}</div>'


def _card(card_type: str, eyebrow: str, title: str, body: str, source: str | None = None) -> CardItem:
    return CardItem(card_type=card_type, eyebrow=eyebrow, title=title, body=body, source_url=source)


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    day_key = today.isoformat()
    year, week, _ = today.isocalendar()

    map_title, theater, game_note, history, tactical, map_source = _pick(MAPS, day_key, "map", seed)
    mechanic_title, lesson, mechanic_leadership, failure, mechanic_source = _pick(MECHANICS, day_key, "mechanic", seed)
    weapon_title, weapon_fact, weapon_note, weapon_source = _pick(WEAPONS, day_key, "weapon", seed)
    intent_title, objective, principle, radio = _pick(COMMAND_INTENTS, day_key, "intent", seed)
    radio_title, radio_lesson, radio_joke = _pick(RADIO_NOTES, day_key, "radio", seed)
    community_title, community_body = _pick(COMMUNITY_NOTES, day_key, "community", seed)
    role_title, role_job, role_habit = _week_pick(ROLES, today, "role")
    loadout_title, personnel, mission = _week_pick(LOADOUTS, today, "loadout")
    month_title, month_body, month_source = MONTHLY_HISTORY[today.month]

    cards = [
        _card("hll_orders", "COMMANDER'S INTENT // DAILY", intent_title,
              '<div class="orders-list">'
              f'<div class="order-box"><span>Primary objective</span>{escape(objective)}</div>'
              f'<div class="order-box"><span>Leadership principle</span>{escape(principle)}</div>'
              f'<div class="order-box"><span>Radio check</span>{escape(radio)}</div></div>'),
        _card("hll_map", "MAP OF THE DAY // CURRENT BATTLEFIELD POOL", map_title,
              _rows([("Theater", theater), ("In the game", game_note), ("Historical ground", history), ("Tactical take", tactical)]), map_source),
        _card("hll_mechanic", "GAME MECHANIC OF THE DAY", mechanic_title,
              f"<p>{escape(lesson)}</p>" + _callout("Leadership use", mechanic_leadership) + _callout("Common failure", failure, True), mechanic_source),
        _card("hll_role", f"CLASS OF THE WEEK // W{week:02d}", role_title,
              f"<p>{escape(role_job)}</p>" + _callout("Best habit", role_habit), "https://hellletloose.com/blog/faqs"),
        _card("hll_weapon", "WEAPON OF THE DAY", weapon_title,
              f"<p>{escape(weapon_fact)}</p>" + _callout("Field note", weapon_note, True), weapon_source),
        _card("hll_loadout", f"SQUAD LOADOUT OF THE WEEK // {year}-W{week:02d}", loadout_title,
              _rows([("Personnel", personnel), ("Mission", mission)])),
        _card("hll_radio", "RADIO DISCIPLINE // DAILY", radio_title,
              f"<p>{escape(radio_lesson)}</p>" + _callout("Community translation", radio_joke, True)),
        _card("hll_history", "THIS MONTH IN HELL LET LOOSE HISTORY", month_title,
              f"<p>{escape(month_body)}</p>", month_source),
        _card("hll_leadership", "AFTER-ACTION NOTE // COMMUNITY WISDOM", community_title,
              f"<p>{escape(community_body)}</p>" + _callout("Corrective action", "Communicate, mark, build the next spawn, and only then repeat the experiment."),
              "https://www.hellletloose.com/game/hll"),
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
            "extra_head_html": '<meta name="theme-color" content="#151711">',
        },
    )
