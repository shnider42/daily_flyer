/* Experience changes instruction, never a rule, legal order or difficulty.
   Text below is authored against the versioned rules used by the current map. */
'use strict';
(()=>{
 const copy={
  mission:[
   'Your goal is shown above the map. Tap that strip to see how to win. Reaching a star may not be enough: you may need to stay there, earn points, or rescue troops.',
   'Read this operation’s objective before moving. DSL maps use different victory conditions: consecutive occupation, control points, station defense or evacuation. The mission strip shows public progress.',
   'Check the scoring trigger, eligible occupiers, deadline and tiebreaker in the mission briefing. Arrival and end-turn scoring are distinct. Objective ownership is public; nearby enemy positions are not.'],
  turn:[
   'A turn is your chance to give orders to your army. YOUR TURN means you can act. OPPONENT’S TURN means you wait while the other army acts. You can select several different units before pressing End turn.',
   'You can alternate between units throughout your turn. End turn commits your orders and passes control. While the other army acts, inspect the board or review the coach; orders unlock when your turn returns.',
   'Orders are server-authorized by side and revision. End turn commits the order journal and triggers delayed effects, scoring, AP banking and the opposing turn. Replay is read-only.'],
  select:[
   'Tap one of your soldiers or vehicles on the map. Its name and available actions appear below on a phone, or beside the map on a computer. Selecting it does not spend anything.',
   'Select a counter or choose a unit from Your units. Its card shows remaining strength, AP and role. Use the unit arrows or Find to reach a ready unit without changing the turn.',
   'Selection is free. Inspect strength, current AP, ammunition, command group and status before committing an order. Full unit names distinguish roles that share similar silhouettes.'],
  move:[
   'Select your unit, then tap a highlighted hex to move there. A hex is one space on the board. Movement spends that unit’s action points. If a space is not highlighted, that move is unavailable.',
   'Legal destinations are highlighted for the selected unit. Terrain, role, AP, occupancy and status determine which are available. Read the cost before moving; roads can improve ground mobility.',
   'Movement previews use current legal options. Ground units usually step to adjacent hexes; aircraft fly complete legs. Occupancy, terrain restrictions, pins and disabled tracks can remove destinations. Reaction fire may occur en route.'],
  ap:[
   'AP means action points: how much this unit can do right now. Moving and attacking spend AP. Most attacks need 2, so moving first may leave too little to shoot. Unused AP can carry over, up to a small limit.',
   'Plan a unit’s whole activation: movement can consume the AP needed for a 2 AP attack. DSL banks at most 1 unused AP per unit, or 2 for officers. You can return to another unit without ending the turn.',
   'Budget against each role’s base AP and legal order costs. Banking caps are 1 AP, 2 for officers; this is not an unlimited reserve. Newly dropped troops cannot bank or receive officer AP on their arrival turn.'],
  orders:[
   'An unavailable action stays grey. Tap it to learn what is missing—perhaps action points, a target, or supplies. Reading that explanation spends nothing.',
   'Grey orders are capabilities your unit has but cannot currently use. Hover on desktop or tap on mobile for the reason. Check AP, range, target type, supply and once-per-turn limits.',
   'Unavailable-order explanations use the current public legal state. They do not predict a shot from an unoccupied future hex or expose hidden targets. Costs, cooldowns and target prerequisites still apply at every Experience.'],
  fire:[
   'First select your unit. Then tap a visible enemy and choose an available attack. A legal attack can still miss. Some weapons cannot hurt certain enemies, such as rifles against tanks.',
   'Select your shooter and then a visible target. Range, sight, AP and weapon compatibility decide which attacks are available. Direct fire, suppression, grenades and close assault have different purposes.',
   'Compare legal direct fire, aimed shots, suppression, area fire and assault. Sight range is not weapon range; a shared contact is not direct-fire LOS. Use the displayed attack preview for the actual threshold and modifiers.'],
  dice:[
   'The game rolls a six-sided die for attacks. “4+” means 4, 5 or 6 succeeds. A miss is possible even when you chose a valid attack. You never need to roll or calculate anything yourself.',
   'Attack previews summarize the chance of success. Cover, range, weapon and faction change the odds. Compare the purpose of a shot with the AP it costs; a low-probability shot is still a legal choice.',
   'Use the exact threshold and modifier breakdown. Modifiers are weapon-specific: armor penetration, infantry accuracy, suppression and area effects are separate resolutions. Revealed combat cannot be rerolled with Undo.'],
  cover:[
   'Woods and buildings can protect infantry. Smoke blocks sight. Dig in gives extra protection until the unit moves. Protected ground can cost more action points to enter.',
   'Cover improves infantry survival but can slow movement. Smoke blocks sight rather than repairing damage. Digging in lasts until movement or assault. Explosive damage can make buildings less safe.',
   'Inspect terrain movement cost, cover and LOS separately. Dig-in stacks with applicable cover but is lost on move or assault. Explosive structural damage can reduce cover or collapse a building; collapsed ground blocks entry until cleared.'],
  fog:[
   'You cannot see every enemy. A solid counter is visible now. A dashed contact is where an enemy was last seen; it may have moved. Empty-looking ground is not necessarily safe.',
   'Current sightings and last-known contacts are different information. Concealment, terrain and smoke affect observation. Plan around uncertainty rather than treating an old contact as a live target.',
   'Fog is authoritative. Reports retain historical position and time, not current HP, orders or movement. Legal movement and threat previews do not certify safety. Platoon-local spotting matters on communications maps.'],
  rally:[
   'Pinned troops are taking cover and cannot move or attack. Select them and use Rally self when available. Rally removes the pin; it does not restore lost strength.',
   'Rally pinned infantry before trying movement or fire. Self-rally costs 1 AP; nearby officers may rally a group. Tanks have track damage instead of infantry pins on modern combat maps.',
   'Pins block infantry movement and attacks and cancel overwatch. Self-rally costs 1 AP. Officer eligibility is group/range constrained. Track repair restores vehicle mobility, not HP; engineer repair is a separate capability.'],
  watch:[
   'Overwatch means waiting to shoot when an enemy moves into view. It costs action points now and allows one reaction later. It is different from firing immediately.',
   'Spend 2 AP to reserve one reaction along a covered enemy movement path. Smoke, range, sight and suppression can prevent that shot. Aircraft and AA use interception against air targets.',
   'Overwatch reserves one legal reaction and clears at the next friendly turn. Infantry pins cancel it. Flight paths can provoke interception along intervening hexes, not only at their endpoint. Known-lane warnings do not reveal hidden watchers.'],
  'watch-lanes':[
   'Orange movement warnings mean a known enemy could threaten that route. They do not mean your troops discovered a hidden ambush. Unmarked ground may still be dangerous.',
   'Threat warnings use enemies your platoon can already see. They show possible firing lanes, not secret overwatch orders. Use smoke, observation or another route when the crossing is exposed.',
   'Lane previews use public platoon sightings and weapon geometry, not hidden readiness. An orange hex neither guarantees a reaction nor reveals overwatch. Mortar overwatch uses the crew’s rifle, not indirect fire.'],
  tools:[
   'Smoke helps hide movement. Suppression tries to pin troops. Grenades try to hurt nearby enemies. Read an action before using it—these tools do different jobs and some have limited supplies.',
   'Use smoke to interrupt sight, suppression to deny infantry actions, and grenades for close damage. Check remaining supplies and faction effects before spending them.',
   'Smoke modifies LOS; suppress pins without strength damage; fragmentation is a separate consumable attack. Compare faction suppression thresholds with direct-fire accuracy. Area explosives can threaten friendly units.'],
  command:[
   'Officers help other troops. A Lieutenant helps his nearby platoon; a Commander reaches more units. Select the officer to see whether he can rally troops or give them extra action points.',
   'Lieutenants support their own nearby platoon; Commanders reach across platoons. Give actions costs officer AP and restores 1 AP to eligible recipients. Rally allies removes pins instead.',
   'Give actions costs 2 officer AP, once per command group per turn. Modern Commanders reach across platoons within 4 hexes; Lieutenants use local group eligibility. Recipient caps and arrival restrictions prevent repeated AP feeding.'],
  radio:[
   'Share reports tells other platoons where enemies were seen. It does not track those enemies or let everyone shoot them. A report may help a mortar crew aim at that ground.',
   'HQ shares dated contacts for 2 AP; a wireless team relays its platoon for 1 AP. Reports can support mortar aiming but do not unlock direct fire on enemies the shooter cannot see.',
   'Radio relays recent contact position and timestamp, once per unit per round. HQ costs 2 AP, wireless 1 AP. Reports expire after two rounds; they do not transmit live HP, readiness or continuing movement. Direct-fire LOS remains platoon-local.'],
  specialists:[
   'Different troops have different jobs. Mountain troops cross rough ground better. Some scouts can hide in cover. Mortars and explosive charges have limited ammunition.',
   'Specialists trade general-purpose strength for useful abilities: efficient rough-ground movement, camouflage, indirect fire or demolition. Read the full role name and the selected unit’s actual orders.',
   'Check role and faction doctrine rather than assuming identical infantry. Mountain movement, camouflage, demolition charges and mortar ammunition are separate capabilities. Concealment breaks on movement or attack and can be defeated by close observation or aerial search.'],
  support:[
   'Recon looks for enemies. Artillery attacks an area after a delay. They are different orders. A marked incoming strike can also hurt your own troops, so keep them clear.',
   'Commander recon reveals an area without attacking. Artillery is delayed area damage, with finite calls and a cooldown. Its public warning gives either side time to move out.',
   'Track finite support calls and independent cooldowns. On tactics maps, a round-1 call is ready again in round 3. Recon spends information resources; artillery commits a delayed area hazard with friendly-fire risk.'],
  armor:[
   'Rifles cannot damage tanks. Use anti-tank weapons or suitable tank ammunition. A tank with damaged tracks may still shoot. Engineers can help repair it when they have supplies.',
   'Use AP ammunition against armor and HE against infantry. Reloading costs 1 AP. Track repair restores movement; an adjacent engineer can spend AP and a repair kit to restore tank strength too.',
   'Penetration and protection govern armored damage. Loading AP or HE costs 1 AP. Explosive splash risks nearby allies. Engineer repair on tactics maps costs 2 AP plus a kit and restores 1 strength and tracks; self-repair restores tracks only.'],
  observation:[
   'Seeing a distant hex does not mean your weapon can reach it. Recon and snipers can see farther from towers, but a tower also makes them easier to spot.',
   'Compare the observation and weapon guides. Towers extend scouting but expose their occupants. Recon is for information; a sniper’s aimed shot is a separate, expensive attack.',
   'Blue observation-only markers and red firing lanes describe different ranges. Tower visibility benefits come with easier detection. Snipe costs 3 AP, targets visible infantry and exposes the firing team; recon gains no sniper attack.'],
  engineering:[
   'Engineers can open some blocked routes and build a short bridge. Select the engineer and read the action’s requirements. A completed route can be used by either army.',
   'Breach hedges and clear collapsed buildings for 2 AP. A one-hex bridge needs 3 AP and a kit, so bank an AP first. The water gap must have suitable opposite banks.',
   'Breach and rubble clearance cost 2 AP. Bridging costs 3 AP and one finite kit, spans exactly one water hex and requires opposite firm banks. Completed fieldworks are shared terrain; construction visibility remains fog-filtered.'],
  linked:[
   'This mission needs connected objectives. Open the mission to see which flags must be held together. Keeping only one flag may not win.',
   'Hold the town plus either beach exit at two consecutive Allied turn endings. Losing a required connection resets progress. Use sector navigation to follow the separated fronts.',
   'Linked-front scoring requires simultaneous eligible infantry occupation of the town and an exit. Hold progress resets immediately when the required link is lost. Scheduled reserves wait for a legal empty entry.'],
  transport:[
   'A boat or half-track can carry another unit. Loading and unloading use the passenger’s action points. Passengers cannot fight while aboard. Pick an empty, legal landing space.',
   'The carrier and passenger are separate units with separate AP. Loading and unloading cost passenger AP; landing craft unload onto adjacent land. Reserve deployment rules depend on the operation.',
   'Passengers neither spot nor fire while embarked. Check legal load/unload positions and passenger AP, not carrier AP. Landings can provoke overwatch. Commander-called airborne reserves differ from legacy spotted-hex airdrops.'],
  airlift:[
   'The Allied Commander can call a reserve squad from the air. The drop may miss the chosen hex or be lost. Troops arrive with only 1 action point, so give them a safe escape route.',
   'Call airborne costs 3 AP and one finite reserve, at most once per round. Better rolls land closer; a 1 loses the squad before it sees anything. A nearby Pathfinder beacon reduces scatter.',
   'Drop d6: 1 lost; 2 scatters 3 hexes; 3 scatters 2; 4–5 scatter 1; 6 on aim. A beacon within 2 of aim reduces scatter by 1. Occupied/obstructed landings divert one adjacent hex; off-map or no safe diversion loses the reserve. Confirmation commits undo.'],
  flak:[
   'Enemy Flak can shoot down an incoming troop transport. Hidden guns are still dangerous. Dropping elsewhere or dealing with visible Flak first can help.',
   'An unpinned Flak team near the landing can intercept the drop. Its position and readiness stay hidden unless spotted. A Pathfinder improves landing accuracy but does not protect the aircraft.',
   'One eligible unpinned Flak gun within 4 hexes of the resolved landing checks each drop; each gun checks once per round. A 1–2 interception destroys the transport before spotting. Secret readiness is never exposed by a landing preview.'],
  arrival:[
   'New paratroopers have 1 action point. If they land in water, move toward land or board a nearby transport quickly: staying in water causes damage at the end of their turn.',
   'Arrivals have 1 AP and cannot bank it or receive officer AP until their next turn. Water inflicts 2 strength damage at each own turn end, including the landing turn. A swim move costs 1 AP.',
   'Arrival-limited units cannot bank or receive command AP. Water inflicts 2 strength per friendly turn ending; rough landings cost 1. Ground overwatch resolves after landing, and survivors establish LOS only from their final hex.'],
  heavy:[
   'A heavy tank can be hard to destroy but slow to move. Use anti-tank teams, the Firefly or close engineer charges. Avoid trading rifle shots with armor.',
   'The Tiger has strong armor and a powerful AP shell, but each move costs at least 3 AP. The Firefly can penetrate heavy armor while remaining more vulnerable itself.',
   'Tiger: 6 strength, armor 3, AP damage 3, minimum move cost 3 and no road bonus. Firefly: AP damage 3 with ordinary Sherman protection and weaker HE. German Pioneers carry two demolition charges.'],
  layers:[
   'On this map, aircraft can be above troops or ships. Both, Surface and Air change which counters you see. Tap stacked counters to choose the unit you want.',
   'Fubar has separate air and surface layers: one unit from each can share a hex. The layer buttons change the view, not fog or orders. Check which layer a weapon attacks.',
   'Joint operations permit one air and one surface occupant per hex. Layer filtering is presentation-only. Fighters/AA engage air, bombers engage surface; surface smoke does not conceal aircraft.'],
  'joint-air':[
   'Fighters attack aircraft. Bombers attack ground and sea targets. Bombers have limited loads and return beside a friendly airfield to reload.',
   'Fighters fly up to 3 hexes per AP; bombers 2. Interception checks the path. Airfield service costs 2 AP and restores bombs plus 1 strength, once per turn.',
   'Use aircraft-specific paths and target domains. Radar tracks the air layer, not distant infantry. Movable planes, carrier sorties and commander recon are distinct systems with separate counters and limits.'],
  'joint-sea':[
   'Ships control the sea lane. Landing craft bring infantry ashore. Carrier support orders are different from the aircraft counters you move on the map.',
   'Use warships for the sea objective and landing craft to deliver infantry to land flags. Carriers offer search/strike sorties; destroyers have finite torpedoes; battleships can bombard guessed ground.',
   'Fubar sea scoring differs from Midway: losing a carrier alone is not defeat. Abstract carrier sorties are separate from aircraft movement. Cruiser escort protects against carrier strikes; AA/interception covers movable aircraft.'],
  fleet:[
   'Carriers search and launch air strikes. Destroyers have torpedoes. Battleships can bombard guessed hexes. Hull repair has limited uses. Protect your carriers: losing all of them loses this battle.',
   'Give ships distinct jobs: carrier search finds targets, escorts hinder air strikes, torpedoes threaten armor, and blind bombardment pressures guessed positions. Balance these against control-point scoring.',
   'Surface guns and torpedoes require clear surface sight; carrier strikes use spotted ships. Torpedoes ignore armor but have finite salvos. Blind bombardment does not disclose hidden casualties. All carriers lost is defeat on Midway, not Fubar.'],
  service:[
   'Bombers run out of bombs. Move beside a surviving friendly airfield and choose Service to reload and repair. Radar helps spot enemy aircraft automatically.',
   'Service costs 2 AP beside a friendly airfield: repair 1 strength and refill bomber loads, once per turn. Protect radar for detection and airfields for sustained sorties.',
   'Airfield service restores 1 strength and two bomber loads for 2 AP, once per turn. Radar grants air detection without exposing distant surface installations. Station loss and bomber elimination, not generic ground capture, determine this mission.'],
  undo:[
   'Undo can take back some mistakes. It cannot give you a fresh dice roll or erase everything you learned. If the game asks for Redo, restore that result before doing something else.',
   'New sightings, searches and ending your turn can commit earlier orders. When revealed combat is undone, Redo restores the same dice; alternative orders stay blocked until then.',
   'The journal prevents information fishing and rerolls. Reveal/search/turn boundaries commit snapshots. Revealed combat can require a locked redo. Airborne commitment, evacuation and locked preparation are additional irreversible boundaries.'],
  end:[
   'Check whether your other units still have useful actions. Press End turn when finished. The other army then acts. Wait for YOUR TURN before trying to move again.',
   'Before ending, check pins, unspent AP, exposed units and mission progress. End turn banks eligible AP and passes control. In solo play you can pause, step through or skip the computer replay.',
   'End turn commits the journal and resolves scoring, timers and AP handover. Consider delayed fire and airborne water damage before committing. Replay controls inspect recorded outcomes and never issue new orders.'],
  save:[
   'Home lets you leave without resigning. This browser keeps a battle shortcut. To keep solo progress on another device, generate a SAVE code in Battle options.',
   'Browser shortcuts resume the live match. SAVE restores a separate solo checkpoint. MOVE reconnects an existing multiplayer seat. A commander sign-in can link multiplayer seats across devices.',
   'SAVE clones an exact solo checkpoint including dice history; MOVE transfers live-seat access. Neither regenerates combat. Browser storage and commander-linked multiplayer are separate recovery paths. Keep a code before using private browsing.']
 };
 const core=new Set(['mission','turn','select','move','ap','orders','fire','dice','cover','fog','rally','watch','tools','command','undo','end','save','orientation','experience','platoons','results']);
 function make(id,title,texts,task,selector='#orders',orders=[],detail=''){
  return {id,title,texts,task,selector,orders,detail};
 }
 function adapt(book,s){
  const own=s.units.filter(u=>u.side===s.side),has=(...kinds)=>own.some(u=>kinds.includes(u.kind));
  const extra=[
   make('orientation','Find your way around the battlefield',[
    'Home returns to your saved battles. View opens display settings and help. The mission strip explains the goal. Tap a unit to see its actions. Zoom or pan the map to find the rest of your army.',
    'Use Home for saved games, View for Experience and Field coach, and Battle options for replay, codes and rematches. Unit arrows and Find locate troops; Overview fits the map. On a phone, pinch the map to zoom.',
    'Home preserves the live battle. View groups Experience, layout and display controls. Map-first and Panels share the same authoritative state. Pan, pinch, Overview, Find and layer/sector controls spend no AP.'
   ],'Find Home, View and the mission strip before giving an order.','#mapWrap'),
   make('experience','Choose how much explanation you want',[
    'Simple explains one idea at a time. You still have every unit and action. View → Experience lets you change the amount of detail whenever you want.',
    'Moderate assumes you know board-game basics and explains DSL’s tactical choices as they become relevant. Expand Rules & tactical detail when you want the exact limits.',
    'Expert prioritizes thresholds, action economy, interactions and commitment boundaries. Experience changes presentation and coaching only; legal actions, opponent behavior and dice are unchanged.'
   ],'Try another Experience in View. Your battle and chapter progress stay where they are.','#simpleToggle'),
   make('results','Know when the battle is over',[
    'A Victory or Defeat message appears when the battle ends. It tells you who won and why. You can inspect the final map, play again or continue WWII Journey.',
    'The result names the winner and the resolved victory condition. Dismiss it to review the battlefield. Multiplayer rematches need the other commander’s agreement; solo rematches start immediately.',
    'The result uses the server’s winner and final mission outcome. It appears after a live computer replay completes. Review remains read-only; a rematch creates the next battle and may swap armies.'
   ],'After a battle, review its outcome before choosing your next operation.','#battleReport')
  ];
  if(s.platoons||s.scenario.platoons||own.some(u=>u.platoon))extra.push(make('platoons','Use platoons without losing track of units',[
   'A platoon is a group of units. Its button helps you find those units. Each unit still has its own actions. A Lieutenant mainly helps his own nearby platoon.',
   'Platoon controls organize your force and highlight its members; they do not activate an entire group. On communications maps, platoons observe locally and share dated contacts by radio.',
   'Group filters affect selection only. LT command/rally eligibility remains local to the platoon. Signals-enabled direct fire uses group sightings; HQ reports do not turn distant contacts into live direct-fire targets.'
  ],'Choose a platoon and inspect its Lieutenant and one squad.','#platoonFilters'));
  if(s.signals_version&&has('scout','radioman','mountain','pathfinder'))extra.push(make('observe','Observe: see farther from this position',[
   'Observe helps a scouting unit see two hexes farther. It costs 1 action point. It does not make the weapon shoot farther, and the benefit ends when the unit moves or attacks.',
   'Observe costs 1 AP and adds 2 sight from the current hex. It ends on movement, attack or the next friendly turn. Use it before crossing uncertain ground or deciding where to send support.',
   'Observe adds +2 sight for eligible scout, wireless, mountain and Pathfinder units. It clears overwatch and expires on movement, attack or next friendly turn. It neither extends weapon range nor defeats every LOS blocker.'
  ],'Select an eligible scout or radio unit and inspect Observe.','#observe',['observe']));
  if(s.signals_version&&own.some(u=>u.mortar_range))extra.push(make('mortar','Mortars need reports, shells and time',[
   'A mortar attacks an area after a delay. It needs a spotted or reported target and uses a shell. The marked blast can hurt your own infantry too. A mortar with no shells cannot keep firing.',
   'Mortar fire costs 2 AP and one shell, once per round, at range 2–8. Aim at ground spotted by its platoon or named in a radio report. The blast lands after the enemy turn, allowing time to move.',
   'Indirect mortar fire requires 2 AP, finite shells, range 2–8, and group LOS or a current report at the aim hex. One shot per crew per round. The radius-1 marked area resolves after the enemy turn and threatens either side’s infantry; reports do not confirm hidden casualties.'
  ],'Select a mortar and check its shells, target reach and last-fired limit.','#mortarFire',['mortar_fire']));
  if(s.logistics_version&&has('supply'))extra.push(make('supply','Keep support units supplied',[
   'Supply squads carry a few packs. Next to a friendly mortar or engineer, they can replace some shells or a repair kit. They do not heal troops or give extra actions.',
   'Resupply costs the supply squad 2 AP and one of its finite packs. An adjacent mortar receives up to 2 shells, or an engineer 1 repair kit, without exceeding capacity. Each recipient once per round.',
   'Finite logistics: 3 packs per supply squad; 2 AP/pack delivers up to 2 shells or 1 engineer kit to an adjacent eligible recipient. Each recipient once per round. Delivery restores neither HP/AP nor the mortar firing cooldown.'
  ],'Inspect a supply squad’s packs and Resupply; move beside a depleted recipient when useful.','#resupply',['resupply']));
  if(s.front_mode==='armored_control')extra.push(make('armor-control','Score with fighting units at the flags',[
   'Kharkov has three flags. Tanks and fighting infantry earn points by holding them when their turn ends. Support units do not count. First to 10 points wins.',
   'Fuel yard and Repair works are worth 1 point; Rail junction 2. Score at your own turn end with tanks or fighting infantry. A flag’s name does not grant free fuel, repairs or ammunition.',
   'Kharkov uses weighted end-turn control: 1/2/1 points, target 10. Logistics, radio, mortars, fixed guns, reserves and passengers cannot capture. At the deadline higher score wins, Germany wins ties; army elimination also resolves victory.'
  ],'Open the mission and compare the three flag values.','@mission'));
  if(s.front_mode==='evacuation')extra.push(make('evacuation','Dunkirk: protect the rescue route',s.side==='us'?[
   'Rescue six marked infantry units. Load one into a boat, sail to the top edge of the sea and choose Evacuate. Your other troops protect the escape route.',
   'Only the eight RESCUE-marked units count. Loading costs 1 passenger AP; Evacuate costs 1 boat AP at top-edge water. Three boats shuttle one unit each. Rescue six before the deadline.',
   'Evacuate commits undo, removes one marked passenger and returns an empty boat. Six rescues win immediately. Insufficient surviving evacuees, loss of all rescue boats, deadline or army elimination can end the battle. Non-evacuee rearguards do not add to the tally.'
  ]:[
   'Stop the Allies from rescuing six marked infantry units. Threaten the routes to the boats while managing your own force. The rescue total is shown in the mission strip.',
   'Germany wins by keeping rescues below six through the deadline, making six unreachable or destroying all rescue boats. The rescue count is public; hidden passengers and their condition are not.',
   'Target evacuation feasibility and embarkation lanes. The public tally never exposes hidden manifests or individual survivor strength. Rescue boats have no automatic replacements; Allied rearguards may delay you without contributing to the quota.'
  ],'Open the mission and locate the boats, top-edge evacuation water and rescue counter.','@mission',['evacuate']));
  if(s.scenario.reinforcement_brief)extra.push(make('reinforcements','Plan for scheduled reinforcements',[
   'Some troops arrive later. Open the mission briefing to see the schedule. Keep friendly entry spaces clear so arriving units can enter.',
   'Scheduled reinforcements are separate from commander-called airborne reserves. They arrive on the listed friendly turn, waiting if their entry is blocked. Plan to connect them to your force.',
   'Use the operation’s explicit reinforcement schedule. Arrival requires a legal empty entry and does not bypass fog. Scheduled units, embarkation and finite airborne reserves are separate mechanisms.'
  ],'Read this operation’s reinforcement schedule in the mission briefing.','@mission',[],s.scenario.reinforcement_brief));
  if(s.deployment_version){
   const preparation=[make('preparation','Before round 1: arrange your force',[
    'This battle starts with planning. Select one of your units and tap a highlighted starting hex to place it. Planning is free. The enemy’s plan stays hidden.',
    'Both armies plan independently before AP turns begin. Move your fixed roster within its legal deployment zone. You cannot add units, stack them or place them in the enemy zone. Loaded passengers move with their boat.',
    'Preparation precedes turn authority: both seats may deploy, even before the opponent joins. The server validates ownership, zone, terrain and occupancy. Enemy unit positions, bunkers and fire plans remain private until resolution.'
   ],'Move one unit within its highlighted setup zone.','#deploymentPanel',['deploy_unit']),
   make('preparation-support',s.side==='de'?'Build the defensive position':'Plan blind naval fire',s.side==='de'?[
    'Choose Bunkers, then tap a legal hex to place one. Tap it again to remove it. You have a limited number. Put defenders where the bunkers can help them.',
    'Place bunkers on permitted open land, separated by at least two hexes. Roads and the objective are excluded. When both plans lock, bunker occupants start dug in and MG/AT defenders start on overwatch.',
    'German setup budget is two bunkers on Shingle Cove, four on Breakwater. Bunker placement is staged privately; terrain commits only when both plans lock. Minimum spacing 2; no road/objective placements. Bunkers absorb opening naval HP damage.'
   ]:[
    'Choose Naval fire and mark inland hexes you want shelled before the landing. You are guessing: the enemy plan is hidden. Shells can scatter and also threaten your own nearby troops.',
    'Choose two aim points on Shingle Cove or four on Breakwater, at least three hexes apart. Rolls 3–6 hit the aim; 1–2 scatter one hex. The impact and neighboring hexes can pin soft troops and deal 1 damage, leaving at least 1 strength.',
    'Blind naval setup uses two/four finite aims, spacing ≥3. d6 3–6 is direct; 1–2 scatters one adjacent hex using a second die. Radius 1 pins soft units and deals 1 HP with a 1-HP floor. Bunkers prevent HP loss; armor is unaffected. Public impact records never confirm hidden casualties.'
   ],'Use the support tab and toggle one planned placement.','#deploymentPanel',s.side==='de'?['deploy_bunker']:['deploy_fire']),
   make('preparation-lock','Review and lock your plan',[
    'Check your placements, then choose Review & lock. You can reset your own plan before locking. Once both armies lock, the opening naval fire lands and the battle starts.',
    'Locking is a commitment. Unused support placements are allowed; review the warning before confirming. A locked plan cannot be edited while waiting for the other army. After both lock, round 1 begins.',
    'Independent locks form the preparation boundary. Plans cannot change after lock, and opening bombardment cannot be rerolled through undo or reconnect. The Allies take the first combat turn; the computer resolves it automatically if you chose Germany.'
   ],'When ready, review the summary and lock. Practice is optional; do not lock solely to finish a lesson.','#deploymentLock',['deploy_lock'])];
   book=s.deployment?.phase==='planning'?[...preparation,...book]:[...book,...preparation];
  }
  book.splice(s.deployment?.phase==='planning'?3:1,0,...extra.slice(0,2));
  const finish=book.find(l=>l.id==='finish');book=book.filter(l=>l.id!=='finish');book.push(...extra.slice(2));if(finish)book.push(finish);
  if(s.scenario.id!=='iron_lantern'&&!s.joint_ops_version)book=book.filter(l=>l.id!=='heavy');
  if(s.coop){
   const texts=[
    'You share an army with other players and computer groups. Units marked Your command follow your orders. You can inspect the others. Choose Finish my orders when you are done; your friends can keep playing until they finish too. Then your computer allies act and the other army takes its turn.',
    'Your assigned group and any host-controlled commander are your command. Teammates share the army turn, but each submits their own orders and finishes independently. AI groups act after the army’s players finish. Shared orders are committed immediately. Open Team orders to see who is waiting or hand a departing player’s command to the computer.',
    'Authorization is per player and assigned group, with revision checks for concurrent orders. Army resolution waits for all living human commands to finish, then executes unclaimed AI groups under their locked Easy/Standard policy. Army AP banking, delayed effects and scoring resolve once. Takebacks are unavailable across shared orders; fog-filtered replays are generated independently for each army.'
   ];
   book.unshift(make('cooperative','Share the command',texts,'Open Team orders and identify your command and teammates.','#coopQuick',[]));
   for(const l of book){
    if(l.id==='turn'){l.texts=texts;l.task='Finish your own orders only when ready; teammates keep their turns.';}
    if(l.id==='undo'){l.texts=Array(3).fill('Orders in a shared battle are committed immediately. Undo and redo are unavailable because an order may affect a teammate’s next action. Inspect the target and cost before confirming.');l.task='Review an order before committing it.';}
    if(l.id==='preparation-lock'){l.texts=Array(3).fill('Place only units under your command, then choose Finish my preparation. Each teammate must finish before your army locks. The army captain chooses shared bunkers or naval fire. The other army’s plan stays private. Army-wide resets are unavailable in shared battles.');}
   }
   if(!s.coop.captain)book=book.filter(l=>l.id!=='preparation-support');
  }
  const level=window.ww2Experience?.level||'simple',index={simple:0,moderate:1,expert:2}[level];
  const orderNames={radioUpdate:'radio_update',callAirborne:'airborne_drop',breach:'breach',clear_wreck:'clear_wreck',bridge_gap:'bridge_gap'};
  return book.map(lesson=>{
   const variants=lesson.texts||copy[lesson.id];
   const base=lesson.text||lesson.detail||'';
   let text=variants?variants[index]:base;
   if(['move','fire','watch'].includes(lesson.id)&&(s.air_version||s.naval_version))text=index===2?base+' '+variants[2]:text+' '+(s.air_version?'Aircraft have their own flight and attack rules. Fighters fly up to 3 hexes per AP; bombers up to 2.':'Ships stay on water; landing troops can go ashore. Carriers, guns and torpedoes use different attack rules.');
   if(lesson.id==='save')text=s.ai_side?text:text.replace('To keep solo progress on another device, generate a SAVE code in Battle options.','To return on another device, use a MOVE code or link this seat to your commander.');
   const detail=variants?variants[2]+(lesson.detail?' '+lesson.detail:''):base;
   const group=lesson.id.startsWith('preparation')?'Pre-battle':core.has(lesson.id)?'Command essentials':'This operation';
   const roles={observe:['scout','radioman','mountain','pathfinder'],mortar:['mortar'],supply:['supply'],armor:['tank','engineer'],engineering:['engineer'],command:['leader','commander'],radio:['radioman','commander'],airlift:['commander'],fleet:['carrier','destroyer','battleship'],service:['bomber'],observation:['scout','sniper']};
   const defendingDrop=s.side==='de'&&['airlift','arrival'].includes(lesson.id);
   const titles={turn:'Turn resolution & commitment',select:'Read a unit’s state',ap:'AP economy & banking',mission:'Mission scoring & deadline',dice:'Thresholds, modifiers and committed dice'};
   return {...lesson,roles:defendingDrop?[]:roles[lesson.id]||[],task:defendingDrop?'Review how Allied reserves arrive. Use visible Flak, protected approaches and reaction fire to contest the landing.':lesson.task,selector:defendingDrop?'#mapWrap':lesson.selector,title:index===2&&titles[lesson.id]?titles[lesson.id]:lesson.title,text:lesson.id==='mission'?ww2Briefing.mission(s).goal+' '+text:text,detail:detail!==text?detail:'',group,orders:lesson.orders.map(id=>orderNames[id]||id)};
  });
 }
 window.ww2LearningContent={adapt};
})();
