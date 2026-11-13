/** Place identities shared by the chart, flight renderer, landings and authority.
 * Independent hash streams keep released names, coordinates and story IDs fixed.
 */
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return(h^(h>>>16))>>>0;};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const pick=(items,key)=>items[hash(key)%items.length];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const WORLD_TYPES_VERSION=1;

const station=(id,name,shape,sizeClass,scale,radius,portType,colors,description,activity)=>({id,name,shape,sizeClass,scale,radius,portType,palette:{hull:colors[0],edge:colors[1],window:colors[2],floor:colors[3],accent:colors[2]},description,activity});
export const STATION_TYPES=freeze([
 station('civic-concourse','Civic concourse','square','regional',1,70,'regional',['#4b6772','#8fa7ad','#d5bb80','#304852'],'A square public concourse places its workshops, clinic and common room around a central crossing.','Passenger services and local contracts'),
 station('wheel-habitat','Habitat ring','ring','metropolitan',1.45,140,'hub',['#526b71','#a0bab4','#c2d39a','#354b47'],'Homes follow a continuous circular corridor around an open central well. The arrival board stays busy through every shift.','Passenger transport and residential supplies'),
 station('survey-sphere','Survey sphere','circle','compact',.85,58,'research',['#4e667e','#91b6cd','#bddce0','#334758'],'A compact circular laboratory shares one pressure hull with the scientists who live there.','Survey couriers and field samples'),
 station('refinery-cross','Refinery cross','cross','industrial',1.3,116,'industrial',['#73644c','#ae9875','#e1b666','#4e4638'],'Four refining arms meet at a shielded control crossing. Ore carriers berth at the working ends.','Ore hauling and industrial repair'),
 station('relay-spindle','Relay spindle','spindle','compact',.8,52,'research',['#55607b','#9baac8','#a1cbdc','#343d51'],'A long narrow communications spine carries relay rooms between two antenna towers.','Dispatches and communications maintenance'),
 station('twin-harbor','Twin harbor','twin','regional',1.2,105,'regional',['#4f7073','#8eafb1','#b8d8bf','#304b50'],'Two inhabited docking lobes share a protected connecting bridge. Freight and passenger arrivals use separate halls.','Regional ferries and cross-dock cargo'),
 station('frontier-triangle','Frontier triangle','triangle','compact',.85,60,'outpost',['#6b6357','#b4a18b','#d1b883','#443d35'],'Three pressure wings surround a small triangular public hall. Visiting crews share tools and a short departure board.','Small craft service and frontier supplies'),
 station('trade-hexagon','Trade hexagon','hexagon','metropolitan',1.35,126,'hub',['#5e6a59','#a4b69b','#d5c28a','#3d4939'],'Six market sectors open into a hexagonal exchange. Cargo handlers and passengers use the same central concourse.','Bulk trade and scheduled passenger liners'),
 station('hospital-octagon','Hospital octagon','octagon','regional',1.05,88,'regional',['#547777','#a0c4bd','#c4e6cc','#354f50'],'An eight-sided hospital station keeps treatment rooms close to a broad, clearly marked circulation loop.','Medical transfers and relief supplies'),
 station('orbital-wheel','Orbital wheel','wheel','metropolitan',1.5,146,'hub',['#62687a','#b0b8cc','#ded4ac','#414658'],'Radial passageways connect a busy central hub to the inhabited outer wheel. Long-haul liners dominate its berths.','Interchange transport and large crew changes'),
 station('telescope-crescent','Telescope crescent','crescent','research',1.05,92,'research',['#565b7c','#9fa6d2','#c6b9e9','#373b59'],'A curved observatory keeps its occupied rooms on the crescent while the open side faces deep space.','Observation work and specialist survey traffic'),
 station('repair-horseshoe','Repair horseshoe','horseshoe','industrial',1.25,115,'industrial',['#726455','#b7a18d','#e2bd83','#4a4238'],'A U-shaped pressure hull wraps an open service yard. Mechanics cross the rear gallery between repair bays.','Ship repairs and salvage tugs'),
 station('freight-trident','Freight trident','trident','industrial',1.4,130,'industrial',['#646d70','#a5b5b4','#d6aa75','#414a4c'],'Three freight piers feed a common customs hall. Warehouses occupy the long arms between docking collars.','Heavy freight and container transfers'),
 station('defense-star','Naval star fort','star','capital',1.5,158,'military',['#56636f','#9eacbb','#c4d2dd','#35424c'],'Five protected wings radiate from a naval command center. Civilian captains still need the usual faction clearance.','Fleet patrols and military tenders'),
 station('agricultural-ladder','Agricultural ladder','ladder','regional',1.25,106,'regional',['#586d52','#a6bd8f','#c8dba0','#3a4c35'],'Long growing galleries connect two service spines. The crossways smell of wet soil and warm irrigation pipes.','Food shipments and greenhouse maintenance'),
 station('forge-hammer','Forge hammer','hammer','industrial',1.35,130,'industrial',['#775d50','#b5917a','#efb47b','#4d3b34'],'A broad fabrication head sits at the end of a reinforced service spine. Foundry crews share the narrow residential deck.','Fabrication freight and foundry support'),
 station('customs-diamond','Customs diamond','diamond','regional',1.1,94,'regional',['#68646b','#b1abb6','#dbcb9b','#45424a'],'A diamond-shaped inspection hall separates incoming holds from cleared departures along opposite diagonals.','Cargo inspection and regional escorts'),
 station('greenhouse-clover','Greenhouse clover','clover','regional',1.35,122,'regional',['#54705a','#9dbda0','#cae0a3','#354b3e'],'Four rounded habitat lobes meet around a communal garden. Each lobe keeps its own crop calendar.','Agriculture and settlement ferries'),
 station('transit-hub','Transfer hub','hub','metropolitan',1.4,136,'hub',['#506e78','#9dbbc2','#dfcf9d','#354c57'],'An arrival rotunda distributes passengers through four transfer arms. The station is designed around changing ships.','Passenger interchange and long-haul liners'),
 station('archive-arc','Archive arc','arc','research',1,84,'research',['#665d78','#b1a5c7','#dfceec','#443c53'],'A bent archive gallery keeps sealed records at its quiet inner edge and public reading rooms along the outer curve.','Archive couriers and research expeditions'),
 station('rescue-fork','Rescue fork','fork','regional',1.1,98,'regional',['#786555','#bc9f83','#f0c399','#4e443b'],'Two arrival prongs let rescue crews unload casualties separately from damaged equipment. Both lead to a common triage hall.','Rescue launches and medical transfers'),
 station('tether-spine','Tether spine','spine','industrial',1.35,125,'industrial',['#5f6d71','#a4b8bd','#d2d8b2','#3c4b50'],'A sequence of working modules runs along a narrow tether spine, with short cross-passages at every attachment.','Orbital construction and maintenance tenders'),
 station('hive-habitat','Hive habitat','honeycomb','metropolitan',1.65,165,'hub',['#786d56','#c0af8b','#ead6a0','#504935'],'Interlocking hexagonal neighborhoods form a large inhabited cluster. Public passages connect the cells like streets.','Residential supplies and mass passenger transport'),
 station('embassy-pentagon','Embassy pentagon','pentagon','regional',1.2,112,'hub',['#5d6b76','#adbec6','#d3c2e0','#3d4957'],'Five public wings share a neutral meeting court. Delegations, translators and visiting crews use the same walkways.','Diplomatic couriers and civilian arrivals'),
 station('salvage-stack','Salvage stack','stacked','industrial',1.15,104,'industrial',['#72645e','#af9991','#d6b98c','#4d413b'],'Offset salvaged modules make a stepped outline. Marked connecting galleries turn the assembled hulls into one working station.','Salvage handling and reclaimed parts')
]);

export const WORLD_SIZES=freeze({
 moon:{name:'Moon',surfaceScale:.70,radius:76},
 dwarf:{name:'Dwarf world',surfaceScale:.85,radius:96},
 terrestrial:{name:'Terrestrial world',surfaceScale:1,radius:122},
 'super-earth':{name:'Super-Earth',surfaceScale:1.3,radius:184},
 supermassive:{name:'Supermassive terrestrial world',surfaceScale:1.65,radius:272}
});
const planet=(id,name,biomes,terrain,colors,description,sizeClass='terrestrial')=>({id,biome:biomes[0],compatibleBiomes:biomes,terrain,sizeClass,...WORLD_SIZES[sizeClass],name,palette:{land:colors[0],water:colors[1],ice:colors[2],atmosphere:colors[3],accent:colors[4]},description});
export const PLANET_TYPES=freeze([
 planet('garden','Garden world',['temperate','forest'],'grassland',['#527c59','#285e78','#d0dec6','#8dbab2','#b3cd88'],'Fields, public wells and wooded ridges surround settlements that have had time to put down roots.'),
 planet('prairie','Prairie world',['temperate'],'steppe',['#8b9059','#3e707e','#d7ddbc','#bfccab','#ded09a'],'Open grasslands and windbreak farms leave long sightlines between settlements and scattered field stations.'),
 planet('twilight','Twilight world',['temperate','arid'],'terminator',['#735f7e','#37576e','#c7bed8','#b098c3','#d4b1dd'],'Settlements follow a narrow temperate band between a sunward desert and the cold dark side.'),
 planet('supercontinent','Supercontinent world',['temperate','forest'],'continental',['#668365','#315e77','#d4d4bd','#9dbbc3','#c1ca86'],'A vast connected landmass makes local districts feel small against the distances between inhabited regions.','supermassive'),
 planet('canopy','Canopy world',['forest'],'rainforest',['#32634a','#24536a','#bccdb9','#7ab0a5','#8dc078'],'Deep canopy, wet paths and clearings shape every approach to the settlement.'),
 planet('fungal','Fungal world',['forest'],'spores',['#725b7a','#485c70','#cec4de','#ad99c7','#c1a4da'],'Broad fungal growths replace familiar trees, and spore gardens glow beside the maintained walking routes.'),
 planet('mangrove','Mangrove world',['forest','ocean'],'wetlands',['#547367','#376e73','#c6d4be','#92bfb4','#c1c58b'],'Raised paths cross wetlands between rooted islands and sheltered estuaries.'),
 planet('dune','Dune world',['desert','arid'],'dunes',['#a7895a','#3c666b','#ded0aa','#c7aa83','#e4c487'],'Wind-cut dunes and buried machinery surround compact water-conscious settlements.'),
 planet('salt','Salt-flat world',['desert','arid'],'saltflats',['#c1b6a5','#6c8c91','#e4e1d2','#d1c6b9','#e7d3ab'],'Pale salt pans reflect the sky between low settlements and old brine works.'),
 planet('canyon','Canyon world',['arid','desert'],'mesas',['#976651','#3f6874','#d4c2a9','#c59d86','#dbb47a'],'Mesa shelves and narrow canyons make winding routes between the landing field and outlying homes.'),
 planet('obsidian','Obsidian world',['volcanic'],'obsidian',['#514955','#492f35','#b1a3a8','#a78491','#d4a0b5'],'Black glass ridges surround sheltered industrial districts built on the oldest cooled flows.'),
 planet('lava','Lava world',['volcanic'],'lavafields',['#6e4b42','#b04e32','#c7b4a8','#c69a79','#f0ad65'],'Cooled ground and maintained bridges connect districts divided by glowing lava channels.'),
 planet('ash','Ashfall world',['volcanic','barren'],'ashlands',['#796b64','#5d4e4e','#c3b7ac','#b9a69a','#d2b798'],'Ash drifts cover retired landing pads and the dark roofs of the inhabited quarter.'),
 planet('glacier','Glacier world',['ice'],'icefields',['#89b2bc','#32637c','#e1eeea','#b3d7d9','#bce4e4'],'Glacial ridges and deep blue crevasses make the heated paths easy to recognize.'),
 planet('tundra','Tundra world',['ice','temperate'],'tundra',['#819186','#47727e','#d5e0d1','#aec7bf','#c5d39f'],'Low scrub and thaw pools break up broad frozen plains around insulated settlements.'),
 planet('frozen-sea','Frozen ocean',['ice'],'frozen-ocean',['#7594ac','#2b5273','#d7e5ec','#a4c8dd','#b5d6e8'],'Pressure ridges rise from a frozen sea. Occupied buildings cluster beside the dependable heat sources.'),
 planet('archipelago','Archipelago world',['ocean'],'islands',['#6e9476','#285e89','#e0e8ca','#9fc6d2','#ccdaa5'],'Small islands, ferry landings and causeways divide an inhabited ocean into separate neighborhoods.'),
 planet('reef','Reef world',['ocean'],'reefs',['#8fa58a','#287e8c','#e5e2bf','#9ddbd3','#e2cbb0'],'Bright shallow reefs shelter circular lagoons and settlements raised clear of the tide.'),
 planet('storm-ocean','Storm ocean',['ocean'],'stormcoast',['#586f7f','#26445f','#c3d3d8','#849fb5','#b7c5cf'],'Dark water, storm breaks and high seawalls give every sheltered landing its importance.'),
 planet('forge','Forge world',['industrial'],'factory',['#796a5c','#465e65','#c8bbb0','#b7a18c','#e0b17b'],'Factory yards and heat exchangers occupy the space between residential districts and freight aprons.'),
 planet('ecumenopolis','City world',['industrial','ruin'],'city',['#758185','#3b647b','#d2d3cd','#b3bec2','#e4d0a0'],'Dense blocks, civic squares and freight routes spread beyond the visible landing district.','super-earth'),
 planet('reclaimed','Reclaimed world',['industrial','ruin','temperate'],'ruins',['#748170','#4f737b','#cbd0c4','#aeb9a0','#d0c899'],'New gardens and occupied rooms interrupt the ruins of an older industrial civilization.'),
 planet('crater','Cratered world',['barren','rock','dust'],'craters',['#7d7e80','#424e5e','#c9c9c4','#929ca6','#b6b0a0'],'Impact rims, exposed rock and isolated pressure shelters define the landing region.'),
 planet('rust','Rust world',['barren','arid'],'red-rock',['#9f6754','#4d5c66','#d2b6a4','#bb9680','#d9a879'],'Iron-rich stone and rust-colored dust stretch between low ridges and weathered survey shelters.'),
 planet('crystal','Crystal world',['barren','ice'],'crystals',['#7e7a9f','#45557b','#d9d2ea','#aca9cd','#d3c0eb'],'Mineral spires and fractured stone catch the starlight around a compact mining settlement.')
]);

const system=(id,name,colors,companions,starScale,traffic,asteroids,crystal,signalNames,description)=>({id,name,stellar:{colors,companions,scale:starScale},activity:{traffic,asteroids,crystal},signalNames,description});
export const SYSTEM_TYPES=freeze([
 system('crossroads','Settled crossroads',['#e5ac72'],0,1,1,1,1,['Inbound traffic register','Freight lane transponder','Transit timing array','Public navigation buoy','Outbound customs marker'],'Frequent passenger and freight movements connect public ports under an established traffic watch.'),
 system('agricultural','Agricultural circuit',['#e5cc91'],0,.85,.9,1,1,['Harvest freight beacon','Irrigation survey link','Seed-bank telemetry','Farm ferry marker','Water allocation buoy'],'Agricultural ports move food, water and workers between inhabited worlds.'),
 system('forge','Industrial foundry system',['#df9b6f'],0,1.15,1.25,1.8,.8,['Foundry shift broadcast','Ore assay buoy','Tow-lane clearance','Smelter telemetry','Industrial navigation buoy'],'Ore belts and industrial berths support heavy working ships and long freight schedules.'),
 system('research','Research enclave',['#b6d5e6'],0,.75,.65,1.1,1.45,['Calibration array','Survey reference point','Spectral recorder','Research relay','Deep-field instrument'],'Research craft visit instruments and laboratories, with more crystal-bearing survey material in the belts.'),
 system('naval','Naval staging system',['#d3dde7'],0,1.05,1.1,1,1,['Fleet weather relay','Convoy assembly marker','Range exclusion buoy','Patrol checkpoint','Fleet logistics relay'],'Fleet berths share local space with civilian support traffic. Ordinary faction access rules remain in force.'),
 system('salvage','Salvage convergence',['#d99a71'],0,.9,.8,1.65,1.1,['Tow registry beacon','Salvage claim marker','Hull-fragment survey','Reclamation relay','Unclaimed debris buoy'],'Working tugs and recovery crews use a cluttered resource field around established salvage ports.'),
 system('nebula','Nebular veil',['#a6a0d8','#c19abf'],1,.9,.6,1.2,1.6,['Dust-front recorder','Nebular survey buoy','Ion spectrum relay','Visibility reference marker','Gas-cloud instrument'],'Colored interstellar dust gives the sky a different light while survey crews work the mineral-rich outskirts.'),
 system('contested','Contested crossing',['#c9b49b'],0,1,.75,1.25,1.1,['Border traffic marker','Convoy watch relay','Ceasefire recorder','Escort assembly buoy','Civilian routing beacon'],'Border traffic shares the lanes with armed patrols and cautious cargo convoys.'),
 system('pilgrimage','Pilgrim route',['#e2cbac'],0,.85,1.2,1,.9,['Memorial approach buoy','Pilgrim ferry relay','Visitor registry','Sanctuary radio','Safe-passage marker'],'Passenger craft bring visitors to memorials and long-established places of refuge.'),
 system('graveyard','Ship graveyard',['#92a8c2'],0,.65,.45,1.9,1.2,['Debris perimeter buoy','Lost registry echo','Structural survey marker','Salvage safety relay','Drift tracking array'],'Old shipping losses have left a broad field of recoverable material and remembered names.'),
 system('quarantine','Quarantine watch',['#d8c48e'],0,1,.4,1.1,1.25,['Quarantine boundary marker','Medical telemetry relay','Restricted approach buoy','Watch handover channel','Silent traffic register'],'A sparse watch surrounds a place whose approaches remain controlled by its existing story and faction restrictions.'),
 system('beacon-chain','Beacon chain',['#f1d1a2'],0,.8,.7,1.1,1.3,['Long-range relay one','Clock synchronization buoy','Emergency channel monitor','Lane anchor marker','Beacon maintenance link'],'A sequence of relay stations keeps distant settlements connected across otherwise quiet space.'),
 system('binary','Close binary',['#e3b37b','#b6cee4'],1,1.1,.85,1.4,1.15,['Binary ephemeris buoy','Double-shadow survey','Tidal recorder','Orbital timing relay','Shared-light marker'],'Two nearby suns give traffic crews a distinctive sky and a busy orbital survey schedule.'),
 system('red-dwarf','Red-dwarf enclave',['#d17b67'],0,.65,.65,1.3,.95,['Flare watch buoy','Red-band receiver','Heat budget relay','Shelter supply marker','Close-orbit recorder'],'Small, carefully supplied settlements work under the deep red light of a cool star.'),
 system('blue-giant','Blue-giant frontier',['#89b7e2'],0,1.5,.5,1.45,1.5,['Radiation survey array','Blue-spectrum recorder','Shielding supply buoy','High-energy relay','Outer-orbit marker'],'A brilliant blue sun dominates broad, sparsely settled approaches and survey routes.'),
 system('white-dwarf','White-dwarf remnant',['#dce9f0'],0,.45,.45,1.55,1.65,['Remnant spectrum array','Old-orbit recorder','White-light survey buoy','Cooling-curve relay','Debris-field marker'],'A small pale remnant shines over old orbital material and a handful of working ports.'),
 system('young-cluster','Young stellar cluster',['#c3dbed','#e5c5b3','#b7c6e6'],2,1.2,.55,1.9,1.4,['Accretion survey buoy','Young-star recorder','Dust lane transponder','Formation-field relay','Outer ring marker'],'Multiple young stars illuminate dense mineral belts and unfinished settlement projects.'),
 system('mineral-belt','Mineral belt system',['#d5b497'],0,.9,1.1,2.2,1.2,['Prospector claim buoy','Ore seam survey','Miner transfer marker','Assay station relay','Belt safety transponder'],'Large accessible resource belts draw mining craft, refinery traffic and industrial tenders.'),
 system('ocean-confluence','Ocean-world confluence',['#abd3de'],0,1,1.05,1.15,1,['Water freight relay','Island ferry registry','Storm-season recorder','Ocean survey marker','Harbor navigation buoy'],'Ocean settlements exchange passengers and supplies through active orbital harbors.'),
 system('cryogenic','Cryogenic frontier',['#bccedd'],0,.7,.6,1.5,1.5,['Heat convoy beacon','Ice-core relay','Shelter status recorder','Cold-storage marker','Winter navigation buoy'],'Heat, power and reliable transport matter most along these cold outlying routes.'),
 system('refuge','Refuge settlement chain',['#e3bb96'],0,.95,1.15,1,.85,['Arrival count relay','Relief convoy marker','Settlement supply buoy','Family message repeater','Public shelter channel'],'Passenger ferries and relief shipments connect settlements built to receive people from elsewhere.'),
 system('archive-array','Archive constellation',['#b8a6d8'],0,.8,.55,1.2,1.35,['Archive checksum beacon','Historical signal recorder','Ephemeris library relay','Long-memory array','Witness telemetry buoy'],'Patient receivers and isolated archives preserve records that other systems have lost.'),
 system('frontier-crossing','Frontier transfer route',['#c2b88f'],0,.85,.8,1.4,1.1,['Outward passage marker','Supply rendezvous buoy','Frontier weather relay','Local claim register','Return-route transponder'],'Small working ports connect remote settlements to the inhabited lanes.'),
 system('stellar-remnant','Stellar-remnant observatory',['#a994b6','#d2a078'],1,.55,.5,1.65,1.7,['Gravity survey reference','Probe return recorder','Tidal warning repeater','Accretion instrument','Observatory timing buoy'],'Observatories watch a stellar remnant from marked approaches. Existing gravity hazards remain where they were charted.'),
 system('garden-chain','Garden-world chain',['#d4d49e'],0,1.05,1.3,1.05,1,['Greenhouse supply relay','Settlement ferry marker','Watershed survey buoy','Ecology recorder','Interworld harvest channel'],'Several settled landscapes support busy passenger routes and an economy of food, water and skilled work.')
]);

const stationById=new Map(STATION_TYPES.map(type=>[type.id,type]));
const planetById=new Map(PLANET_TYPES.map(type=>[type.id,type]));
const systemById=new Map(SYSTEM_TYPES.map(type=>[type.id,type]));
const militaryIds=new Set(['common-watch','bastion-yard','combine-garrison','lantern-guard','ember-muster']);
const publicStations=STATION_TYPES.filter(type=>type.portType!=='military');
const authoredStations={kettle:'civic-concourse',weighhouse:'agricultural-ladder',ledger:'trade-hexagon',listening:'archive-arc',bastion:'customs-diamond',patchwork:'salvage-stack',blindpost:'survey-sphere',checkpoint:'customs-diamond',porch:'frontier-triangle',census:'relay-spindle',threshold:'telescope-crescent',door:'archive-arc','glass-harbor':'wheel-habitat','umbra-watch':'survey-sphere','ravel-market':'hive-habitat','still-berth':'twin-harbor','brass-customs':'freight-trident','kindred-port':'rescue-fork','lacuna-observatory':'telescope-crescent','greenwake-depot':'greenhouse-clover'};
const authoredPlanets={morrow:'garden',tinbell:'crater',orchard:'prairie',serein:'dune',cairn:'canyon',lilt:'archipelago',stillwater:'reclaimed',ward:'tundra',kiln:'forge',tallow:'obsidian',newshore:'reef',palimpsest:'reclaimed',earth:'reclaimed',wide:'prairie',chora:'reef',moth:'frozen-sea',tessera:'salt','low-water':'glacier','brassfall-works':'forge','kindred-landing':'garden',noonless:'glacier','ochre-garden':'canopy',reedbank:'mangrove',avel:'twilight',hadrun:'canyon'};
const authoredSystems={hearth:'crossroads',brindle:'agricultural',meridian:'forge',vesper:'archive-array',nacre:'naval',cinder:'salvage',hush:'nebula',sable:'contested',farwake:'frontier-crossing',witness:'graveyard',sol:'quarantine',afterlight:'beacon-chain',chorus:'ocean-confluence',umbra:'stellar-remnant',ravel:'salvage',cairnsea:'cryogenic',brassfall:'forge',kindred:'refuge',lacuna:'stellar-remnant',greenwake:'garden-chain'};
// A system's purpose biases its public berths and compatible landscapes without
// rewriting the released biome, faction or access permissions of any body.
const systemPlaces={
 crossroads:[['civic-concourse','transit-hub','twin-harbor'],['garden','prairie','ecumenopolis']],
 agricultural:[['agricultural-ladder','greenhouse-clover'],['prairie','garden','mangrove']],
 forge:[['forge-hammer','refinery-cross','freight-trident'],['forge','obsidian','lava']],
 research:[['survey-sphere','telescope-crescent','archive-arc'],['crystal','twilight','frozen-sea']],
 naval:[['customs-diamond','repair-horseshoe','freight-trident'],['forge','canyon','tundra']],
 salvage:[['salvage-stack','repair-horseshoe'],['ash','reclaimed','crater']],
 nebula:[['survey-sphere','relay-spindle'],['fungal','crystal','storm-ocean']],
 contested:[['customs-diamond','rescue-fork','frontier-triangle'],['ash','canyon','rust']],
 pilgrimage:[['wheel-habitat','embassy-pentagon'],['reclaimed','garden','salt']],
 graveyard:[['salvage-stack','archive-arc'],['crater','ash','reclaimed']],
 quarantine:[['hospital-octagon','rescue-fork'],['reclaimed','fungal','rust']],
 'beacon-chain':[['relay-spindle','transit-hub'],['twilight','tundra','dune']],
 binary:[['twin-harbor','orbital-wheel'],['twilight','lava','canyon']],
 'red-dwarf':[['greenhouse-clover','frontier-triangle'],['twilight','rust','tundra']],
 'blue-giant':[['telescope-crescent','survey-sphere'],['salt','obsidian','crystal']],
 'white-dwarf':[['archive-arc','relay-spindle'],['crater','glacier','frozen-sea']],
 'young-cluster':[['tether-spine','refinery-cross'],['lava','ash','storm-ocean']],
 'mineral-belt':[['refinery-cross','freight-trident','forge-hammer'],['crystal','crater','rust']],
 'ocean-confluence':[['twin-harbor','transit-hub','orbital-wheel'],['archipelago','reef','storm-ocean','mangrove']],
 cryogenic:[['agricultural-ladder','frontier-triangle'],['glacier','frozen-sea','tundra']],
 refuge:[['hospital-octagon','hive-habitat','rescue-fork'],['reclaimed','prairie','garden']],
 'archive-array':[['archive-arc','survey-sphere'],['reclaimed','crater','twilight']],
 'frontier-crossing':[['frontier-triangle','tether-spine'],['dune','canyon','prairie']],
 'stellar-remnant':[['telescope-crescent','relay-spindle'],['crater','crystal','obsidian']],
 'garden-chain':[['greenhouse-clover','wheel-habitat','trade-hexagon'],['garden','supercontinent','canopy','prairie']]
};
function biasedPick(pool,preferred,key){
 const themed=pool.filter(type=>preferred?.includes(type.id));
 return pick(themed.length&&hash(`${key}:preference`)%100<74?themed:pool,key);
}

export function stationTypeFor(body={}){
 if(stationById.has(body.stationTypeId))return stationById.get(body.stationTypeId);
 if(militaryIds.has(body.id)||body.portType==='military')return stationById.get('defense-star');
 return stationById.get(authoredStations[body.id])||pick(publicStations,`${body.id||body.name||'station'}:station-type-v1`);
}
export function planetTypeFor(body={}){
 const compatible=PLANET_TYPES.filter(type=>type.compatibleBiomes.includes(String(body.biome||'temperate')));
 const type=planetById.get(body.planetTypeId)||planetById.get(authoredPlanets[body.id])||pick(compatible.length?compatible:PLANET_TYPES,`${body.id||body.name||'planet'}:planet-type-v1`);
 const sizeClass=['moon','asteroid'].includes(body.kind)?'moon':WORLD_SIZES[body.sizeClass]?body.sizeClass:type.sizeClass;
 return{...type,...WORLD_SIZES[sizeClass],name:type.name,sizeClass};
}
export function systemTypeFor(value={}){
 return systemById.get(value.systemTypeId)||systemById.get(authoredSystems[value.id])||pick(SYSTEM_TYPES,`${value.id||'system'}:system-type-v1`);
}
function assignPlanetType(body,seed,systemId,systemTypeId){
 const compatible=PLANET_TYPES.filter(type=>type.compatibleBiomes.includes(String(body.biome||'temperate')));
 return planetById.get(body.planetTypeId)||planetById.get(authoredPlanets[body.id])||biasedPick(compatible.length?compatible:PLANET_TYPES,systemPlaces[systemTypeId]?.[1],`${seed}:${systemId}:${body.id}:planet-type-v1`);
}

/** Add descriptive metadata without changing any released orbit, identity or rule gate. */
export function decorateGalaxyTypes(galaxy,seed='farwake'){
 return galaxy.map(system=>{
  const type=systemById.get(system.systemTypeId)||systemById.get(authoredSystems[system.id])||pick(SYSTEM_TYPES,`${seed}:${system.id}:system-type-v1`);
  const bodies=system.bodies.map(body=>{
   if(body.kind==='station'){
    const stationType=stationById.get(body.stationTypeId)||(militaryIds.has(body.id)||body.portType==='military'?stationById.get('defense-star'):stationById.get(authoredStations[body.id])||biasedPick(publicStations,systemPlaces[type.id]?.[0],`${seed}:${system.id}:${body.id}:station-type-v1`));
    return{...body,stationTypeId:stationType.id,sizeClass:stationType.sizeClass,typeLabel:stationType.name,typeDescription:stationType.description,
     // Existing authored capacities and all existing access declarations remain authoritative.
     ...(!system.authored&&!body.portType?{portType:stationType.portType}:{}),visualRadius:system.authored?70:stationType.radius};
   }
   if(['planet','moon','asteroid'].includes(body.kind)){
    const planetType=assignPlanetType(body,seed,system.id,type.id),roll=hash(`${seed}:${system.id}:${body.id}:world-size-v1`)%100;
    const sizeClass=['moon','asteroid'].includes(body.kind)?'moon':WORLD_SIZES[body.sizeClass]?body.sizeClass:system.authored?'terrestrial':planetType.sizeClass!=='terrestrial'?planetType.sizeClass:roll<12?'dwarf':roll<76?'terrestrial':roll<95?'super-earth':'supermassive';
    return{...body,planetTypeId:planetType.id,sizeClass,typeLabel:planetType.name,typeDescription:planetType.description,visualRadius:WORLD_SIZES[sizeClass].radius};
   }
   return{...body};
  });
  return{...system,bodies,systemTypeId:type.id,typeLabel:type.name,typeDescription:type.description,stellar:type.stellar,activity:type.activity};
 });
}

export function bodyVisualRadius(body={}){
 if(Number.isFinite(body.visualRadius)&&body.visualRadius>0)return clamp(body.visualRadius,30,320);
 if(body.kind==='station')return body.id==='kettle'?70:stationTypeFor(body).radius;
 if(['planet','moon','asteroid'].includes(body.kind))return planetTypeFor(body).radius;
 return Number.isFinite(body.radius)?body.radius:70;
}

/** Pure one-time pose repair shared by solo saves and canonical server vessels.
 * Bodies must carry their current system-space positions. Callers persist the
 * version on their owning save; valid poses are returned by reference unchanged.
 */
export function migrateExpandedBodyPose(pose,bodies=[],{fromVersion=0}={}){
 if(Number(fromVersion)>=WORLD_TYPES_VERSION||!pose||!Number.isFinite(pose.x)||!Number.isFinite(pose.y))return pose;
 let next=pose;
 for(const body of bodies){
  if(!['station','planet','moon','asteroid'].includes(body.kind)||!Number.isFinite(body.x)||!Number.isFinite(body.y))continue;
  const oldRadius=body.kind==='planet'?122:body.kind==='moon'?76:70,newRadius=bodyVisualRadius(body);
  if(newRadius<=oldRadius)continue;
  const dx=next.x-body.x,dy=next.y-body.y,distance=Math.hypot(dx,dy);
  if(distance>=newRadius+30)continue;
  const angle=distance>.001?Math.atan2(dy,dx):Number.isFinite(next.angle)?next.angle:-Math.PI/2;
  next={...next,x:body.x+Math.cos(angle)*(newRadius+75),y:body.y+Math.sin(angle)*(newRadius+75),vx:0,vy:0,angularVelocity:0};
 }
 return next;
}

/** Geography still owns safety; type changes working traffic without creating raids. */
export function applySystemActivity(system,context){
 if(!system?.systemTypeId||system.id==='hearth')return context;
 const type=systemTypeFor(system),minimum=context.region==='core'?16:context.region==='settled'?5:1;
 return{...context,typeLabel:type.name,trafficCount:clamp(Math.round(context.trafficCount*type.activity.traffic),minimum,24)};
}

/** A known physical incident retains its name; ordinary instruments describe their place. */
export function flavorSystemSignals(system,signals){
 if(!system?.systemTypeId)return signals;
 const type=systemTypeFor(system);
 return signals.map((signal,index)=>signal.story||signal.encounterId?signal:{...signal,name:type.signalNames[index%type.signalNames.length]+(index>=type.signalNames.length?` ${Math.floor(index/type.signalNames.length)+1}`:''),description:type.description});
}
