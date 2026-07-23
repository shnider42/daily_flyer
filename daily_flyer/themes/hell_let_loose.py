from __future__ import annotations

import random
from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "hell_let_loose"

THEME_CONFIG = {
    "page_title": "Hell Let Loose Field Brief — Daily Flyer",
    "header_title": "HELL LET LOOSE // FIELD BRIEF",
    "header_subtitle": (
        "A daily operations sheet about the part of Hell Let Loose that matters most: "
        "leadership, communication, logistics, history, and the occasional heroic failure to read the map."
    ),
    "footer_text": (
        "Unofficial fan-made Daily Flyer theme. Hell Let Loose is owned by its respective rights holders. "
        "Build the garrison, mark the tank, and keep command chat useful."
    ),
    "hero_kicker": "DAILY FLYER // OPERATIONS ORDER",
    "hero_summary_pill": "50v50 combined arms • teamwork over K/D • field notes rotate daily",
}

MAPS = [
    {
        "title": "Juno Beach",
        "theater": "Normandy, France",
        "game_note": (
            "Introduced with Update 20 alongside the Canadian Forces. The map mixes flooded fields, "
            "industrial spaces, waterways, and close urban fighting as the line moves inland."
        ),
        "history": (
            "Juno was one of the five Allied landing beaches on 6 June 1944. Canadian troops of the 3rd "
            "Infantry Division led the assault and pushed farther inland than any other Allied beach force that day."
        ),
        "source_url": "https://www.hellletloose.com/blog/update-20-changelog",
    },
    {
        "title": "Smolensk",
        "theater": "Western Russia",
        "game_note": (
            "Added in Update 19 as a dense Eastern Front city map built around industrial districts, "
            "tight streets, river approaches, and unusually vertical urban sightlines."
        ),
        "history": (
            "Smolensk sits on the Dnieper and has long been a strategic route toward Moscow. In 1941, "
            "major fighting around the city slowed the German advance while Soviet forces reorganized farther east."
        ),
        "source_url": "https://www.hellletloose.com/blog/update-19-changelog",
    },
    {
        "title": "Carentan",
        "theater": "Normandy, France",
        "game_note": (
            "A layered infantry map where streets, courtyards, rail lines, and fields force squads to switch "
            "between close clearing drills and long-range overwatch."
        ),
        "history": (
            "Carentan was a critical road junction between the Utah and Omaha beachheads. U.S. airborne troops "
            "fought to capture the town in June 1944 so the two landing areas could be linked."
        ),
        "source_url": "https://www.army.mil/article/252544/the_battle_of_carentan",
    },
    {
        "title": "Foy",
        "theater": "Belgium",
        "game_note": (
            "Snow, open fields, thin treelines, and exposed approaches reward patient armor-infantry coordination. "
            "Running directly across the white field remains a popular but scientifically questionable plan."
        ),
        "history": (
            "Foy lies north of Bastogne and changed hands during the Battle of the Bulge. Fighting there became "
            "closely associated with the U.S. 101st Airborne Division's defense of the Bastogne perimeter."
        ),
        "source_url": "https://www.army.mil/botb/",
    },
    {
        "title": "Remagen",
        "theater": "Rhineland, Germany",
        "game_note": (
            "The Ludendorff Bridge dominates the tactical problem, but the refreshed map adds more crossing and "
            "maneuver choices so the bridge is a centerpiece rather than the only sentence in the plan."
        ),
        "history": (
            "On 7 March 1945, U.S. forces captured the Ludendorff Bridge while it was still standing, creating an "
            "unexpected bridgehead across the Rhine."
        ),
        "source_url": "https://www.hellletloose.com/blog/patch-19-1-changelog",
    },
    {
        "title": "Kursk",
        "theater": "Soviet Union",
        "game_note": (
            "Long sightlines, trenches, rolling ground, and armor lanes make information-sharing more valuable than "
            "individual marksmanship. A tank you fail to mark becomes everyone's surprise."
        ),
        "history": (
            "The Battle of Kursk in July and August 1943 centered on a huge German offensive against a Soviet salient. "
            "Prepared defenses and powerful Soviet counterattacks helped end Germany's strategic initiative in the east."
        ),
        "source_url": "https://www.britannica.com/event/Battle-of-Kursk",
    },
    {
        "title": "Stalingrad",
        "theater": "Soviet Union",
        "game_note": (
            "A shattered industrial city of rubble, rail lines, broken structures, and lethal angles. Movement is less "
            "about speed than about reducing the number of windows that can currently ruin your afternoon."
        ),
        "history": (
            "The battle lasted from 1942 into early 1943 and ended with the destruction of the German Sixth Army. "
            "It became one of the decisive turning points of the war in Europe."
        ),
        "source_url": "https://www.britannica.com/event/Battle-of-Stalingrad",
    },
    {
        "title": "El Alamein",
        "theater": "Egypt",
        "game_note": (
            "Sparse cover and broad sightlines turn terrain folds, smoke, and coordinated movement into survival tools. "
            "The desert is not empty; it is simply honest about how visible you are."
        ),
        "history": (
            "The Second Battle of El Alamein in late 1942 broke the Axis position in Egypt and began a westward retreat "
            "across North Africa."
        ),
        "source_url": "https://www.britannica.com/event/battles-of-El-Alamein",
    },
    {
        "title": "Driel",
        "theater": "Netherlands",
        "game_note": (
            "Open river country, dikes, villages, and long approaches make transport, smoke, and decentralized squad "
            "movement more useful than one enormous heroic column."
        ),
        "history": (
            "Driel became the landing area for the Polish 1st Independent Parachute Brigade during Operation Market "
            "Garden, as Allied forces tried to reinforce troops isolated near Arnhem."
        ),
        "source_url": "https://www.britannica.com/event/Operation-Market-Garden",
    },
    {
        "title": "Mortain",
        "theater": "Normandy, France",
        "game_note": (
            "Hedgerows, hills, farms, and broken lines of sight reward short, clear orders and local initiative. "
            "Your squad cannot execute a nine-part flank if part two was 'everyone gets lost in a hedge.'"
        ),
        "history": (
            "In August 1944, German forces launched Operation Lüttich near Mortain in an attempt to cut off the U.S. "
            "breakout from Normandy. The counteroffensive failed under determined resistance and Allied air power."
        ),
        "source_url": "https://www.nationalww2museum.org/war/articles/operation-luttich-mortain",
    },
    {
        "title": "Tobruk",
        "theater": "Libya",
        "game_note": (
            "Fortifications, town fighting, desert approaches, and hard cover create a battlefield where engineers and "
            "support players can reshape how an objective is attacked or held."
        ),
        "history": (
            "The Libyan port of Tobruk endured a long Axis siege in 1941. Its defenders, including large Australian "
            "contingents, held the port and disrupted Axis operations in North Africa."
        ),
        "source_url": "https://www.awm.gov.au/articles/encyclopedia/tobruk",
    },
    {
        "title": "Elsenborn Ridge",
        "theater": "Belgium",
        "game_note": (
            "Forested ridges, snow, and constrained routes create a defensive chessboard for artillery, armor, and "
            "infantry. The best firing position is still useless if nobody tells the squad it exists."
        ),
        "history": (
            "During the Battle of the Bulge, U.S. forces held the northern shoulder around Elsenborn Ridge, denying the "
            "German advance key roads toward Liège and helping contain the offensive."
        ),
        "source_url": "https://history.army.mil/books/wwii/7-8/7-8_8.htm",
    },
]

WEAPONS = [
    {"title": "M1 Garand", "fact": "The U.S. semi-automatic service rifle fed from an eight-round en-bloc clip and gave rifle squads a high practical rate of fire.", "field_note": "Fast follow-up shots are useful; eight panicked shots at the same hedge are still eight panicked shots.", "source_url": "https://www.nps.gov/spar/learn/historyculture/m1-garand-rifle.htm"},
    {"title": "Karabiner 98k", "fact": "Germany's standard bolt-action service rifle was compact, rugged, and based on the Mauser 98 action.", "field_note": "Pick the angle, work the bolt from cover, and do not confuse historical accuracy with a requirement to miss historically.", "source_url": "https://www.iwm.org.uk/collections/item/object/30029367"},
    {"title": "Mosin–Nagant 91/30", "fact": "The Soviet 91/30 was a modernization of the long-lived Mosin rifle and became one of the Red Army's principal rifles of World War II.", "field_note": "Its cadence rewards calm target selection. Your squad leader saying 'hold fire' is also a weapon system.", "source_url": "https://www.iwm.org.uk/collections/item/object/30029532"},
    {"title": "Lee–Enfield No. 4 Mk I", "fact": "The No. 4 combined a ten-round magazine with a notably smooth bolt action and served widely across British and Commonwealth forces.", "field_note": "A rifleman with good cover and good callouts contributes more than a sprinter collecting scenic deaths.", "source_url": "https://www.iwm.org.uk/collections/item/object/30034990"},
    {"title": "StG 44", "fact": "The StG 44 paired an intermediate cartridge with selective fire and strongly influenced later assault-rifle development.", "field_note": "Excellent close-to-midrange flexibility does not grant permission to abandon the sector your squad is defending.", "source_url": "https://www.iwm.org.uk/collections/item/object/30029369"},
    {"title": "Thompson M1A1", "fact": "The simplified wartime Thompson was a heavy but controllable submachine gun used by U.S. and Allied troops.", "field_note": "Best paired with smoke, short movement, and a teammate who knows which building you are entering.", "source_url": "https://www.iwm.org.uk/collections/item/object/30029293"},
    {"title": "MP 40", "fact": "The German MP 40 was a compact 9 mm submachine gun issued primarily to leaders, vehicle crews, and specialist troops.", "field_note": "Use mobility and corners. The open field remains undefeated against submachine-gun optimism.", "source_url": "https://www.iwm.org.uk/collections/item/object/30029370"},
    {"title": "Bren Gun", "fact": "The Bren was a magazine-fed light machine gun prized for reliability and accuracy in British and Commonwealth sections.", "field_note": "Think controlled support fire, not a personal audition to become the loudest object in Normandy.", "source_url": "https://www.iwm.org.uk/collections/item/object/30029292"},
    {"title": "MG 42", "fact": "The MG 42 combined a very high rate of fire with a quick-change barrel system and served as the core of many German infantry squads.", "field_note": "Your job is often to control movement. Suppression that enables a friendly push is worth more than an impressive empty belt.", "source_url": "https://www.iwm.org.uk/collections/item/object/30029368"},
    {"title": "PPSh-41", "fact": "The Soviet PPSh-41 was designed for rapid mass production and became closely associated with Red Army assault troops.", "field_note": "Close-range volume is powerful. So is waiting three seconds for your squad to arrive before entering the room.", "source_url": "https://www.iwm.org.uk/collections/item/object/30029291"},
    {"title": "Canadian Sten Mk II", "fact": "Update 20 introduced Canadian forces with Canadian-manufactured Sten Mk II submachine guns among their weapon set.", "field_note": "New faction, same ancient rule: communicate before you cross another squad's line of fire.", "source_url": "https://www.hellletloose.com/blog/update-20-changelog"},
    {"title": "Lanchester", "fact": "The Lanchester was a British submachine gun derived from the German MP 28 pattern and used heavily by naval personnel.", "field_note": "A rare weapon is still just a tool. The exotic part should not be your decision to defend the objective.", "source_url": "https://www.hellletloose.com/blog/update-20-changelog"},
]

MECHANICS = [
    {"title": "Garrison Network", "lesson": "Garrisons are team-level spawn infrastructure. A useful network gives the team depth: attack, defense, and a route back into the fight when one position collapses.", "leadership": "The officer who builds the unglamorous backup garrison may have just won a fight that has not happened yet.", "failure": "Symptom: the whole team is walking from HQ. Diagnosis: everyone assumed someone else had supplies.", "source_url": "https://www.hellletloose.com/the-game/"},
    {"title": "Outposts", "lesson": "An outpost is the squad's local spawn and a statement of intent. Move it as the squad's mission changes; protect it when it anchors a defense.", "leadership": "A squad leader should place the OP before beginning the inspirational speech about the next push.", "failure": "The most dangerous sentence in unit chat: 'I was just about to update it.'", "source_url": "https://www.hellletloose.com/the-game/"},
    {"title": "Supplies", "lesson": "Supplies turn plans into physical objects: garrisons, defenses, nodes, guns, and other deployables. Logistics is the permission layer beneath tactics.", "leadership": "Ask for the supply location and purpose, not merely 'can someone go Support?'", "failure": "A crate in the wrong field is a very historically accurate box and a very modern tactical problem.", "source_url": "https://store.steampowered.com/news/posts/?appids=686810&enddate=1617290831&feed=steam_community_announcements"},
    {"title": "Resource Nodes", "lesson": "Engineers use supplies to build nodes that support the commander's resource economy. They are rear-area construction with front-line consequences.", "leadership": "A commander with resources has options. A commander without resources has a microphone and increasingly philosophical opinions.", "failure": "Nodes do not improve K/D, which is why they improve the team's chance to win.", "source_url": "https://www.hellletloose.com/the-game/"},
    {"title": "Suppression", "lesson": "Fire does not need to hit to shape behavior. Suppression can pin defenders, obscure awareness, and create time for another element to move.", "leadership": "State the purpose: 'MG suppress the barn; assault move left.' Noise without a maneuver is mostly a concert.", "failure": "Firing continuously until empty proves the weapon works and may conclude the useful portion of your plan.", "source_url": "https://www.hellletloose.com/the-game/"},
    {"title": "Map Markers", "lesson": "Markers create a shared tactical language across proximity, unit, and command channels. A precise mark reduces long explanations and prevents duplicated effort.", "leadership": "Mark first, then describe: type, direction, movement, and urgency.", "failure": "'Tank over there' is a report. 'Tiger moving south on Able armor mark' is information.", "source_url": "https://www.team17.com/news/hell-let-loose-faq"},
    {"title": "Redeploying", "lesson": "Redeploy is strategic mobility. Leaving a quiet sector to reinforce a threatened one can matter more than preserving a life in the wrong place.", "leadership": "Give the destination before the order so the squad understands why it is disappearing from the map.", "failure": "The defense point was lost while twelve people protected the memory of the previous attack.", "source_url": "https://www.hellletloose.com/the-game/"},
    {"title": "Warfare vs. Offensive", "lesson": "Warfare creates a shifting contest over the center and connected sectors. Offensive gives one side the attack and the other the defense through staged objectives.", "leadership": "The mode changes what 'forward' means. Read the map before issuing orders inherited from the previous match.", "failure": "Defending the locked point is a magnificent demonstration of loyalty to obsolete information.", "source_url": "https://www.hellletloose.com/the-game/"},
    {"title": "Armor Crew Coordination", "lesson": "Driver, gunner, and commander solve different parts of the same problem. A tank becomes dangerous when the crew shares orientation, target priority, and escape routes.", "leadership": "Use clock directions consistently and distinguish hull direction from turret direction.", "failure": "Driver: 'tree.' Gunner: 'what tree?' Tank: tree.", "source_url": "https://www.hellletloose.com/the-game/"},
    {"title": "Artillery & SPAs", "lesson": "Update 19 reorganized artillery around a dedicated squad and introduced self-propelled artillery vehicles, adding mobility and counter-battery considerations to indirect fire.", "leadership": "Coordinate targets and expenditure with command. Friendly infantry should learn about the fire mission before the first shell does.", "failure": "The word 'danger close' is not a decorative subtitle.", "source_url": "https://www.hellletloose.com/blog/update-19-changelog"},
    {"title": "Recon's Real Mission", "lesson": "Recon can observe, disrupt logistics, hunt spawn infrastructure, and report movement behind the line. The sniper rifle is part of the toolkit, not the job description.", "leadership": "A useful recon report changes a friendly decision: enemy garrison, armor route, artillery location, or weak flank.", "failure": "Thirty kills and no map information is a successful solo performance in the wrong game.", "source_url": "https://www.team17.com/news/hell-let-loose-faq"},
    {"title": "Strongpoint vs. Sector Control", "lesson": "The visible strongpoint is important, but the surrounding sector controls approaches, spawn placement, and encirclement. The circle is the objective; the map around it is the battle.", "leadership": "Assign at least one element to watch the route everyone assumes is empty.", "failure": "Six squads inside one barn can still be surrounded by geography.", "source_url": "https://www.hellletloose.com/the-game/"},
]

ROLES = [
    ("Commander", "Set priorities, manage resources, create a command climate, and make the team feel like one force rather than fifty unrelated emergencies.", "Best habit: communicate intent and constraints, then let officers solve local problems."),
    ("Officer", "Lead a unit, maintain the outpost, build garrisons, mark information, and translate command chat into an achievable squad mission.", "Best habit: say where, why, and what success looks like—in that order."),
    ("Support", "Carry the supplies that turn leadership decisions into spawns, defenses, nodes, and specialist emplacements.", "Best habit: stay near the officer long enough for the box to become infrastructure."),
    ("Engineer", "Build nodes and defenses, place mines, repair armor, and alter the physical problem facing both teams.", "Best habit: ask what the team needs now, not what is most entertaining to construct."),
    ("Anti-Tank", "Protect infantry from armor through rockets, guns, mines, satchels, and patient positioning.", "Best habit: identify tank type and orientation before spending limited ammunition."),
    ("Machine Gunner", "Control lanes, suppress positions, deny movement, and create the conditions for the squad to maneuver.", "Best habit: relocate after revealing the position; every tracer is also a reply address."),
    ("Medic", "Recover casualties, preserve local momentum, and use smoke to create a temporary rescue corridor.", "Best habit: tell the downed player you are coming so they do not release one second before arrival."),
    ("Rifleman", "Provide dependable fire, ammunition support, and the flexible manpower every squad needs.", "Best habit: watch the direction the specialist roles cannot watch while doing their jobs."),
    ("Assault", "Close distance with smoke, grenades, and automatic fire to clear positions that cannot be solved from the hedgerow.", "Best habit: coordinate the breach; entering first is only leadership when someone follows."),
    ("Automatic Rifleman", "Blend mobility with suppressive fire and reinforce the squad's ability to move under pressure.", "Best habit: fire in useful bursts and preserve ammunition for the moment the squad actually moves."),
    ("Spotter", "Lead recon, place its spawn, mark high-value information, and direct the sniper toward targets that matter to the team.", "Best habit: treat command chat as the customer for your intelligence."),
    ("Sniper", "Remove exposed specialists, observe routes, and support the spotter's wider disruption mission.", "Best habit: prioritize effects—artillery crews, officers, garrison builders, and repeated routes."),
    ("Tank Commander", "Build crew awareness, choose engagements, communicate with command, and keep the vehicle alive enough to influence several fights.", "Best habit: announce the plan before the driver must make the turn."),
    ("Crewman", "Drive, gun, spot, repair, and rotate roles as the crew's situation demands.", "Best habit: repeat critical calls; engine noise is not an attentive listener."),
]

SQUAD_LOADOUTS = [
    ("The Garrison Crew", "Officer + Support + one escort", "Move supplies, place a useful spawn, then defend it long enough to matter. The escort's glamorous job is watching the officer stare at a pocket watch."),
    ("The Node Detail", "Engineer + Support + supply-truck driver", "Build the resource base early, return or reposition the truck, and rejoin the main effort. Logistics is a mission, not exile."),
    ("The Armor Ambush", "Anti-Tank + Rifleman/Support + Officer", "Mark the vehicle, establish its direction, deny the easy escape, and feed ammunition or supplies to the anti-armor plan."),
    ("The Base of Fire", "Machine Gunner + Rifleman + Officer", "The MG fixes the enemy, the rifleman supplies and watches the flank, and the officer moves the rest of the squad."),
    ("The Breach Team", "Assault + Automatic Rifleman + Medic", "Smoke the approach, suppress the opening, enter together, and preserve momentum with fast revives behind cover."),
    ("The Defensive Works Party", "Engineer + Support + Machine Gunner", "Build cover that supports real firing lanes, not an elaborate museum that traps friendly vehicles."),
    ("The Recon Interdiction Pair", "Spotter + Sniper", "Find infrastructure and movement routes, report first, disrupt second, and avoid becoming emotionally attached to one distant rooftop."),
    ("The Three-Seat Tank", "Tank Commander + Driver + Gunner", "Keep all seats filled, use consistent callouts, and choose a reverse route before the first shot announces the tank."),
    ("The Mobile Defense", "Officer + Support + Anti-Tank", "Maintain a fallback OP, carry supplies for a replacement garrison, and protect the sector against the armor route everyone ignored."),
    ("The Artillery Link", "Artillery Observer + gun crew + command contact", "Confirm target, friendly proximity, duration, and ammunition priorities before beginning the fire mission."),
]

COMMAND_INTENTS = [
    ("BUILD DEPTH BEFORE SPEED", "Establish a primary and fallback spawn before the main push.", "Teams recover faster when leaders create options before the crisis.", "Radio check: Who has supplies, and where is the backup route?"),
    ("DEFEND WITH INFORMATION", "Watch likely approaches outside the strongpoint, not only the capture circle.", "A defense should detect the attack early enough to make a decision.", "Radio check: Which flank has no eyes on it?"),
    ("MAKE ONE CLEAR MAIN EFFORT", "Name the sector, route, and immediate obstacle the team is solving.", "Coordination improves when supporting actions know what they are supporting.", "Radio check: Can every squad leader state the current priority in one sentence?"),
    ("SHORT ORDERS, LONG AWARENESS", "Give concise directions and keep listening for changes.", "Leadership is not the amount of audio transmitted; it is the quality of shared understanding.", "Radio check: Did the squad acknowledge the order or merely receive sound?"),
    ("LOGISTICS IS COMBAT POWER", "Move supplies and build the network that lets good fighting happen repeatedly.", "A team that can only attack once does not have a strategy; it has an opening scene.", "Radio check: What will the team spawn on if the current garrison disappears?"),
    ("CONTROL THE TEMPO", "Pause a failed attack, rebuild, mark threats, then commit together.", "Repeated individual effort is not persistence when the conditions never change.", "Radio check: What is different about the next push?"),
]

COMMUNITY_NOTES = [
    ("The Supply Truck Is Not a Personal Taxi", "It is a mobile logistics asset with the turning radius of a municipal building. Deliver the supplies, preserve the truck when practical, and resist parking it sideways in the only road."),
    ("If Everyone Is Flanking, Nobody Is Defending", "A flank is defined by its relationship to a main effort. Five independent scenic tours are not operational art."),
    ("Command Chat Has Limited Bandwidth", "Transmit decisions, threats, requests, and acknowledgements. Your complete emotional journey through the last death can remain a director's commentary track."),
    ("The Enemy Did Not Hack the Game", "They probably built a spawn behind the team, watched the same undefended route remain open, and repeated the idea until it looked supernatural."),
    ("Please Wait for the Medic", "When a medic is close and the position is recoverable, give them a moment. Releasing at the instant they arrive is the traditional HLL method of testing a stranger's character."),
    ("Your Binoculars Are a Weapon", "Observation, marks, and good calls let the whole squad shoot the right problem. The binocular kill count is always zero and the strategic value is not."),
    ("One More Backup Garrison", "No team has ever complained after a lost point that it possessed too many sensible fallback spawns."),
    ("Tank Mark Accuracy Challenge", "Place the mark on the tank rather than the general county in which the tank has been emotionally perceived."),
]

MONTHLY_HISTORY = {
    1: ("January 2026 — Community Map Vote", "The development team revealed Seelow Heights as the winner of a community map vote and outlined more of the 2026 roadmap, including Juno Beach and the planned Conquest mode.", "https://www.hellletloose.com/blog/dev-brief-212-map-vote-reveal-roadmap-breakdown"),
    2: ("February — From Hobby Project to Team Game", "The original developers described Hell Let Loose as beginning as a small Unreal Engine forum hobby project before growing through crowdfunding, testing, and community feedback.", "https://store.steampowered.com/news/posts/?appids=686810&enddate=1560872764"),
    3: ("March 2026 — Remagen Refresh", "Patch 19.1 refreshed Remagen and added more strategic crossing options while preserving the Ludendorff Bridge as the map's defining feature.", "https://www.hellletloose.com/blog/patch-19-1-changelog"),
    4: ("April 2026 — Juno Beach Testing", "The first Juno Beach experimental-branch briefing introduced the map's historical setting and connected it to the arrival of Canadian forces.", "https://www.hellletloose.com/blog/dev-brief-217-juno-beach"),
    5: ("May 2026 — Update 20 Experimental Branch", "Players tested Juno Beach, Canadian forces, and major armor changes before the live release, continuing the game's long practice of community-assisted iteration.", "https://www.hellletloose.com/blog/dev-brief-218-u20-exp-branch"),
    6: ("June — Two Launch Milestones", "Hell Let Loose entered Steam Early Access on 6 June 2019. Seven years later, Update 20 launched Juno Beach and the Canadian Forces in June 2026.", "https://store.steampowered.com/news/posts/?appids=686810&enddate=1560872764"),
    7: ("July 2021 — Version 1.0", "Hell Let Loose reached its full PC release on 27 July 2021 after more than two years in Steam Early Access.", "https://store.steampowered.com/app/686810/Hell_Let_Loose/"),
    8: ("August 2025 — A Wider Franchise", "Team17 announced Hell Let Loose: Vietnam as a separate entry intended to carry the franchise's 50v50 coordination and strategic identity into a new conflict.", "https://www.hellletloose.com/blog/what-does-vietnam-mean-for-hell-let-loose"),
    9: ("September 2025 — Smolensk Revealed", "Dev Brief #208 introduced Smolensk as a large urban Eastern Front battlefield requested by the community.", "https://www.hellletloose.com/blog/dev-brief-208-smolensk"),
    10: ("October 2025 — Stalingrad Refresh", "Update 18 overhauled Stalingrad's performance, cover, routes, visual detail, and lighting while beginning a major armor rework.", "https://www.hellletloose.com/blog/update-18-changelog"),
    11: ("November 2025 — Update 19 Feedback Cycle", "Experimental tests and community questions shaped the artillery and Smolensk work that would become Update 19.", "https://www.hellletloose.com/blog/dev-brief-210-community-questions-ddos-update"),
    12: ("December 2025 — Smolensk & SPAs", "Update 19 launched Smolensk, a dedicated artillery squad, and self-propelled artillery vehicles across the factions.", "https://www.hellletloose.com/blog/update-19-changelog"),
}

EXTRA_CSS = r"""
:root { --bg:#1e211b; --bg-deep:#11130f; --bg-soft:#2a2d24; --card:#d8cfb3; --card-strong:#e5dcc1; --border:#313328; --border-strong:#11130f; --ink:#191b16; --ink-soft:#303329; --muted:#5b5e4d; --irish-green:#5f6946; --gold:#b58b3b; --teal:#69705b; --blue:#6f7664; --shadow-lg:12px 14px 0 rgba(0,0,0,.30); --shadow-md:7px 8px 0 rgba(0,0,0,.24); --radius-xl:0; --radius-lg:0; --radius-md:0; --max-width:1320px; }
body { font-family:"Courier New",Courier,monospace; color:#e7dfc5; background:linear-gradient(rgba(13,15,11,.82),rgba(13,15,11,.94)),repeating-linear-gradient(0deg,transparent 0 39px,rgba(190,180,139,.08) 40px),repeating-linear-gradient(90deg,transparent 0 39px,rgba(190,180,139,.08) 40px),#25281f; }
.site-bg { display:none; }
body::before { width:100%; height:100%; inset:0; top:0; left:0; background:linear-gradient(90deg,transparent 49.8%,rgba(181,139,59,.10) 50%,transparent 50.2%),linear-gradient(0deg,transparent 49.8%,rgba(181,139,59,.10) 50%,transparent 50.2%); opacity:.45; filter:none; }
body::after { width:220px; height:220px; right:-50px; top:35%; border:2px solid rgba(216,207,179,.12); border-radius:50%; background:radial-gradient(circle,transparent 0 46%,rgba(216,207,179,.12) 47% 48%,transparent 49%); filter:none; opacity:.6; }
.hero-wrap { padding-top:22px; }
header.hero { border:3px solid #171913; border-radius:0; clip-path:polygon(0 0,calc(100% - 34px) 0,100% 34px,100% 100%,34px 100%,0 calc(100% - 34px)); background:repeating-linear-gradient(135deg,rgba(30,33,27,.035) 0 2px,transparent 2px 7px),#d8cfb3; color:#171913; box-shadow:var(--shadow-lg); }
header.hero::before { background:repeating-linear-gradient(135deg,#171913 0 12px,#b58b3b 12px 24px); height:12px; bottom:auto; opacity:1; }
.hero-kicker { border:2px solid #2f3327; border-radius:0; background:transparent; color:#34372c; font-weight:900; letter-spacing:.18em; }
.hero h1 { max-width:none; font-family:Impact,"Arial Narrow",sans-serif; letter-spacing:.035em; font-size:clamp(2.6rem,7vw,5.8rem); line-height:.9; text-shadow:none; }
.hero .subtitle { color:#35382d; max-width:78ch; font-weight:700; }
.hero-meta { gap:.55rem; }
.hero-pill { border:2px solid #3d4034; border-radius:0; background:rgba(255,255,255,.16); color:#20231b; font-weight:800; box-shadow:3px 3px 0 rgba(0,0,0,.14); }
main { gap:20px; padding-top:22px; }
.card { grid-column:span 4; min-height:230px; border:3px solid #171913; border-radius:0; clip-path:polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,18px 100%,0 calc(100% - 18px)); background:repeating-linear-gradient(0deg,transparent 0 31px,rgba(45,48,38,.055) 32px),linear-gradient(180deg,rgba(255,255,255,.16),rgba(0,0,0,.025)),#d8cfb3; color:#191b16; box-shadow:var(--shadow-md); backdrop-filter:none; -webkit-backdrop-filter:none; transition:transform 110ms ease,box-shadow 110ms ease; }
.card:hover { transform:translate(-2px,-2px); border-color:#171913; box-shadow:11px 12px 0 rgba(0,0,0,.28); }
.card::before { background:linear-gradient(90deg,rgba(95,105,70,.14),transparent 28%,rgba(181,139,59,.10)); }
.card::after { height:10px; background:repeating-linear-gradient(135deg,#171913 0 10px,#b58b3b 10px 20px); }
.card--hll_orders { grid-column:span 12; background-color:#e4d5a9; }
.card--hll_map { grid-column:span 7; background-color:#d0c8a9; }
.card--hll_mechanic { grid-column:span 5; background-color:#d9d1b7; }
.card--hll_history,.card--hll_community { grid-column:span 6; }
.card--hll_role { background-color:#c9cfb4; }
.card--hll_weapon { background-color:#d7c7aa; }
.card--hll_loadout { background-color:#c5c7ad; }
.card-head { border-bottom:2px solid #444738; padding-bottom:.75rem; }
.eyebrow { color:#555947; font-size:.78rem; letter-spacing:.16em; font-weight:900; }
h2 { font-family:Impact,"Arial Narrow",sans-serif; letter-spacing:.035em; font-size:clamp(1.35rem,2.5vw,2rem); }
.body { color:#2b2e25; line-height:1.58; font-weight:600; }
.body strong,.body b { color:#12140f; }
.icon-badge { width:50px; height:42px; border:2px solid #2d3026; border-radius:0; background:rgba(255,255,255,.18); color:transparent; font-size:0; font-family:Impact,sans-serif; }
.icon-badge::before { color:#20231b; font-size:.75rem; letter-spacing:.06em; }
.card--hll_orders .icon-badge::before { content:"CMD"; }
.card--hll_map .icon-badge::before { content:"MAP"; }
.card--hll_mechanic .icon-badge::before { content:"SYS"; }
.card--hll_role .icon-badge::before { content:"MOS"; }
.card--hll_weapon .icon-badge::before { content:"ARMS"; }
.card--hll_loadout .icon-badge::before { content:"UNIT"; }
.card--hll_history .icon-badge::before { content:"HIST"; }
.card--hll_community .icon-badge::before { content:"AAR"; }
.brief-grid { display:grid; grid-template-columns:minmax(120px,.32fr) 1fr; gap:.5rem .9rem; margin-top:.2rem; }
.brief-label { color:#555947; text-transform:uppercase; letter-spacing:.08em; font-size:.78rem; font-weight:900; }
.brief-value { color:#20231b; }
.hll-callout { margin-top:.9rem; padding:.72rem .8rem; border-left:6px solid #5f6946; background:rgba(95,105,70,.12); }
.hll-warning { border-left-color:#a45b35; background:rgba(164,91,53,.10); }
.orders-list { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.75rem; margin-top:.25rem; }
.order-box { border:2px solid #484b3c; padding:.75rem; background:rgba(255,255,255,.12); }
.order-box span { display:block; color:#626650; font-size:.72rem; letter-spacing:.1em; text-transform:uppercase; font-weight:900; margin-bottom:.35rem; }
.source { border-top:2px dashed rgba(44,47,37,.35); }
a { color:#3b4b2b; text-decoration:underline; text-underline-offset:3px; }
footer { font-family:"Courier New",monospace; }
.footer-inner { border:2px solid rgba(216,207,179,.22); border-radius:0; color:#c3baa0; background:rgba(0,0,0,.18); }
@media (max-width:980px) { .card--hll_map,.card--hll_mechanic,.card--hll_history,.card--hll_community { grid-column:span 12; } .card--hll_role,.card--hll_weapon,.card--hll_loadout { grid-column:span 6; } .orders-list { grid-template-columns:1fr; } }
@media (max-width:720px) { .card--hll_orders,.card--hll_map,.card--hll_mechanic,.card--hll_role,.card--hll_weapon,.card--hll_loadout,.card--hll_history,.card--hll_community { grid-column:auto; } .brief-grid { grid-template-columns:1fr; } .brief-label { margin-top:.35rem; } }
"""


def _brief_rows(rows: list[tuple[str, str]]) -> str:
    return '<div class="brief-grid">' + ''.join(
        f'<div class="brief-label">{escape(label)}</div><div class="brief-value">{escape(value)}</div>'
        for label, value in rows
    ) + '</div>'


def _card(card_type: str, eyebrow: str, title: str, body: str, source_url: str | None = None) -> CardItem:
    return CardItem(card_type=card_type, eyebrow=eyebrow, title=title, body=body, source_url=source_url)


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    day_seed = seed if seed is not None else today.toordinal()
    rng = random.Random(day_seed)

    map_pick = rng.choice(MAPS)
    weapon_pick = rng.choice(WEAPONS)
    mechanic_pick = rng.choice(MECHANICS)
    intent_pick = rng.choice(COMMAND_INTENTS)
    community_pick = rng.choice(COMMUNITY_NOTES)

    iso_year, iso_week, _ = today.isocalendar()
    role_pick = ROLES[(iso_year * 53 + iso_week) % len(ROLES)]
    loadout_pick = SQUAD_LOADOUTS[(iso_year * 53 + iso_week) % len(SQUAD_LOADOUTS)]
    month_title, month_body, month_source = MONTHLY_HISTORY[today.month]

    intent_title, objective, leadership, radio = intent_pick
    role_title, role_job, role_habit = role_pick
    loadout_title, loadout_members, loadout_job = loadout_pick
    community_title, community_body = community_pick

    cards = [
        _card("hll_orders", "COMMANDER'S INTENT // DAILY", intent_title, '<div class="orders-list">' + f'<div class="order-box"><span>Primary objective</span>{escape(objective)}</div>' + f'<div class="order-box"><span>Leadership principle</span>{escape(leadership)}</div>' + f'<div class="order-box"><span>Radio check</span>{escape(radio)}</div>' + '</div>'),
        _card("hll_map", "MAP BRIEFING // DAILY ROTATION", map_pick["title"], _brief_rows([("Theater", map_pick["theater"]), ("In the game", map_pick["game_note"]), ("Historical ground", map_pick["history"])]), map_pick["source_url"]),
        _card("hll_mechanic", "SYSTEM OF THE DAY", mechanic_pick["title"], f'<p>{escape(mechanic_pick["lesson"])}</p><div class="hll-callout"><strong>Leadership use:</strong> {escape(mechanic_pick["leadership"])}</div><div class="hll-callout hll-warning"><strong>Common failure:</strong> {escape(mechanic_pick["failure"])}</div>', mechanic_pick["source_url"]),
        _card("hll_role", f"ROLE OF WEEK {iso_week:02d}", role_title, f'<p>{escape(role_job)}</p><div class="hll-callout"><strong>Best habit:</strong> {escape(role_habit)}</div>', "https://www.team17.com/news/hell-let-loose-faq"),
        _card("hll_weapon", "WEAPON OF THE DAY", weapon_pick["title"], f'<p>{escape(weapon_pick["fact"])}</p><div class="hll-callout hll-warning"><strong>Field note:</strong> {escape(weapon_pick["field_note"])}</div>', weapon_pick["source_url"]),
        _card("hll_loadout", "SQUAD LOADOUT OF THE WEEK", loadout_title, _brief_rows([("Personnel", loadout_members), ("Mission", loadout_job)])),
        _card("hll_history", "THIS MONTH IN HLL HISTORY", month_title, f'<p>{escape(month_body)}</p>', month_source),
        _card("hll_community", "AFTER-ACTION NOTE // COMMUNITY WISDOM", community_title, f'<p>{escape(community_body)}</p><div class="hll-callout"><strong>Corrective action:</strong> communicate, mark, and build the next spawn before repeating the experiment.</div>', "https://www.hellletloose.com/game/hll"),
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
            "extra_head_html": '<meta name="theme-color" content="#1e211b">',
        },
    )
