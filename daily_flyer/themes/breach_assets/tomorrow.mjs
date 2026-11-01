// The Wrong Side of Tomorrow — an authored, shared, impossible civic building.
// Every route and decision is simulated on the authoritative Game instance.
// Remembered controls, not an extra bag of unsaved flags, define its three endings.
export const TOMORROW_ID = 'wrong-side-of-tomorrow';
export const TOMORROW_WORLD_REVISION = 1;
export const TOMORROW_ANCHORS = Object.freeze(['memory-orchard', 'memory-aquarium', 'memory-museum']);
export const TOMORROW_ENDINGS = Object.freeze({
  escape: Object.freeze({ id: 'escape', title: 'An Unfinished Escape', subtitle: 'You leave. Tomorrow follows.',
    text: 'The lift opens onto an ordinary street. Behind you, the building keeps making rooms. Your reflection arrives home a second before you do.', accent: '#e6b96e' }),
  seal: Object.freeze({ id: 'seal', title: 'The Last Ordinary Day', subtitle: 'The breach closes. The lost remain lost.',
    text: 'You turn the engine inward. The teeth become stone, the clocks stop swimming, and every borrowed face goes dark. The city wakes to one sky. It will never know what was left inside.', accent: '#8bd6dc' }),
  rewrite: Object.freeze({ id: 'rewrite', title: 'A Door for Everyone', subtitle: 'You return what the building stole.',
    text: 'Three remembered lives hold the Null field steady. The unfinished sun folds into a doorway. The people with borrowed faces step through it; your own reflection waits its turn.', accent: '#d5a1ee' }),
});

function createTomorrow() {
  const width = 91, height = 91;
  const cells = Array.from({ length: height }, () => Array(width).fill('#'));
  const carve = (x1, z1, x2, z2, value = '.') => {
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z][x] = value;
  };
  const sectors = [
    ['orchard', 'The Teeth Orchard', 4, 64, 26, 86, 'foundry', '#efcba1', 'porcelain-roots', 'Pale teeth grow through rust-red soil; the roots form firing cover.'],
    ['arrivals', 'The Inverted Waiting Room', 34, 64, 56, 86, 'arrival', '#d6a5e6', 'upside-down-furniture', 'Benches and departure boards hang above a floor that still remembers rain.'],
    ['aquarium', 'The Aquarium of Hours', 64, 64, 86, 86, 'floodworks', '#76dcd8', 'swimming-clocks', 'Clock faces drift behind glass while their hands cast shadows in the wrong direction.'],
    ['wardrobe', 'The Wardrobe of Other People', 4, 34, 26, 56, 'archives', '#de8a9e', 'borrowed-faces', 'Unworn faces watch from revolving wardrobes. Some lanterns are breathing.'],
    ['exchange', 'Exchange for Lost Tomorrows', 34, 34, 56, 56, 'hub', '#e4d181', 'impossible-stair', 'A staircase returns to its own underside above a deserted municipal exchange.'],
    ['sunday', 'The Sunday That Never Was', 64, 34, 86, 56, 'rail', '#97b7ee', 'indoor-horizon', 'A miniature neighbourhood folds around a black horizon inside an ordinary room.'],
    ['museum', 'Museum of Misremembered Doors', 4, 4, 26, 26, 'archives', '#bbabe9', 'nested-doorframes', 'Doorframes repeat inside one another. The museum remembers places its doors have never been.'],
    ['court', 'Court of the Unborn Sun', 34, 4, 56, 26, 'reactor', '#e6976e', 'broken-orbit', 'An unfinished sun sits inside a courthouse of bent rings and suspended verdicts.'],
    ['weather', 'The Weather Inside Your Head', 64, 4, 86, 26, 'reactor', '#91d8a1', 'bottled-storm', 'Storms are filed inside glass columns, labelled with the names of people who have not arrived.'],
  ];
  for (const [, , x1, z1, x2, z2] of sectors) carve(x1, z1, x2, z2);
  // Three horizontal and three vertical spines make genuine loops. No role,
  // simultaneous switch, doorway trick or optional weapon is required to reunite.
  for (const z of [14, 44, 74]) { carve(26, z, 34, z + 3); carve(56, z, 64, z + 3); }
  for (const x of [14, 44, 74]) { carve(x, 26, x + 3, 34); carve(x, 56, x + 3, 64); }
  // Arrival vestibules shield separated players while they read their location.
  carve(4, 78, 23, 78, '#'); carve(67, 78, 86, 78, '#');
  carve(67, 48, 86, 48, '#');
  const doors = [], interactables = [], pickups = [], enemies = [], landmarks = [], wallNotices = [], surrealProps = [];
  const item = (id, type, x, z, label, extra = {}) => {
    const result = { id, type, x: x + .5, z: z + .5, label, ...extra }; interactables.push(result); return result;
  };
  const supply = (id, type, x, z, amount = 1, extra = {}) => pickups.push({ id, type, x: x + .5, z: z + .5, amount, ...extra });
  const foe = (id, type, x, z, health, extra = {}) => enemies.push({ id, type, x: x + .5, z: z + .5, health, maxHealth: health, alive: true, ...extra });
  const prop = (id, type, x, z, w, d, zoneId) => {
    carve(x, z, x + w - 1, z + d - 1, '#');
    landmarks.push({ id, type, x: x + w / 2, z: z + d / 2, width: w, depth: d, axis: w > d ? 'x' : 'z', tomorrowDistrict: zoneId });
  };
  const notice = (id, x, z, title, sub, extra = {}) => wallNotices.push({ id, x, z, dx: 0, dz: -1, width: 3.2, height: .95, bottom: 1.05, title, sub, ...extra });
  const gate = (id, x1, z1, x2, z2, axis, requires, extra = {}) => {
    carve(x1, z1, x2, z2, '#');
    const x = Math.floor((x1 + x2) / 2), z = Math.floor((z1 + z2) / 2);
    carve(x, z, x, z); doors.push({ id, x: x + .5, z: z + .5, axis, requires, open: false, ...extra });
  };
  gate('court-south', 44, 30, 47, 30, 'x', 'relays', { label: 'Open the court of the unborn sun' });
  gate('court-west', 30, 14, 30, 17, 'z', 'relays', { label: 'Open the museum court passage' });
  gate('court-east', 60, 14, 60, 17, 'z', 'relays', { label: 'Open the weather court passage' });
  // When a relay is restored a previously false doorway becomes a real shortcut.
  // The broad spines remain available before and after both changes.
  carve(24, 26, 25, 34); gate('remembered-west', 24, 30, 25, 30, 'x', 'power', { controlledBy: 'relay-west', label: 'A remembered museum door' });
  carve(84, 26, 85, 34); gate('remembered-east', 84, 30, 85, 30, 'x', 'power', { controlledBy: 'relay-east', label: 'A remembered weather door' });

  item('aux-power', 'power', 39, 50, 'Wake the municipal exchange', { tomorrowAction: 'power' });
  item('relay-west', 'relay', 8, 38, 'Give the faces their names', { tomorrowAction: 'relay', requires: 'power', relayName: 'Names', opensDoor: 'remembered-west' });
  item('relay-east', 'relay', 82, 8, 'Give the weather its time', { tomorrowAction: 'relay', requires: 'power', relayName: 'Hours', opensDoor: 'remembered-east' });
  // A key earned from the two relays permits the deliberate coward's route.
  // The boss is a real additional requirement for containment and restoration.
  supply('access-key', 'key', 50, 50, 1, { requires: 'relays' });
  item('extraction', 'exit', 50, 83, 'Leave the anomaly running', { tomorrowAction: 'ending', ending: 'escape', requires: 'key', repeatable: true });
  item('ending-seal', 'exit', 38, 8, 'Seal the unfinished sun', { tomorrowAction: 'ending', ending: 'seal', requires: 'key', repeatable: true });
  item('ending-rewrite', 'exit', 52, 8, 'Rewrite the stolen tomorrow', { tomorrowAction: 'ending', ending: 'rewrite', requires: 'key', repeatable: true });

  supply('pump-shotgun', 'shotgun', 41, 79, 24);
  supply('rivet-repeater', 'repeater', 20, 70, 110);
  supply('tomorrow-rebound', 'ricochet', 69, 70, 28);
  supply('tomorrow-thumper', 'grenade', 21, 50, 9, { requires: 'power' });
  supply('null-projector', 'nullgun', 8, 20, 45, { requires: 'power' });
  supply('breach-lance', 'lance', 71, 21, 30, { requires: 'power' });
  supply('health-expansion', 'healthExpansion', 82, 40, 25, { requires: 'power' });
  for (const [id, x, z] of [['waiting-refuge', 37, 83], ['exchange-refuge', 52, 53], ['wardrobe-refuge', 7, 53], ['sunday-refuge', 81, 53], ['museum-refuge', 7, 24]]) {
    item(id, 'refuge', x, z, 'Rest at the blue waiting light', { requires: 'power', repeatable: true });
  }

  item('memory-orchard', 'tomorrow-anchor', 7, 68, 'Remember the gardener', { tomorrowAction: 'anchor', requires: 'power', memory: 'A gardener who planted the last honest seed.', anchorNumber: 1 });
  item('memory-aquarium', 'tomorrow-anchor', 82, 68, 'Remember the clockmaker', { tomorrowAction: 'anchor', requires: 'power', memory: 'A clockmaker who gave the city one more minute.', anchorNumber: 2 });
  item('memory-museum', 'tomorrow-anchor', 7, 8, 'Remember the child at the door', { tomorrowAction: 'anchor', requires: 'weapon:nullgun', memory: 'A child who held the door for someone already forgotten.', anchorNumber: 3 });
  // Transit is an openly advertised impossibility. The destination is displayed
  // before USE, changes after the relays, and never strands or moves other players.
  const folds = [
    ['fold-waiting', 53, 67, 'The door that missed its appointment', 'fold-sunday', 'fold-museum'],
    ['fold-sunday', 67, 38, 'The door from another Sunday', 'fold-waiting', 'fold-weather'],
    ['fold-museum', 23, 23, 'The museum’s incorrectly remembered exit', 'fold-weather', 'fold-waiting'],
    ['fold-weather', 68, 24, 'The door under the bottled storm', 'fold-museum', 'fold-sunday'],
  ];
  for (const [id, x, z, label, before, after] of folds) item(id, 'tomorrow-fold', x, z, label, { tomorrowAction: 'fold', requires: 'power', repeatable: true, destinations: [before, after], landing: { x: x + .5, z: z + 1.5, angle: 0 } });

  const records = [
    ['record-arrival', 48, 79, '01 / Please remain where you were not', 'ARRIVALS OFFICE: Parties are occasionally filed on different platforms. Follow the station signs to the central exchange. Your companions are real. Your weapons cannot tell the difference.'],
    ['record-exchange', 37, 38, '02 / We misplaced tomorrow', 'The city asked for one more day. We borrowed it from people who had not been born. Now it keeps arriving in the wrong rooms. Names in the west; hours in the northeast. The two registers print a departure pass here.'],
    ['record-orchard', 24, 68, '03 / The gardener', 'These are not teeth, said the gardener. They are the parts of a promise that still remember how to bite. She left a name under the smallest tree.'],
    ['record-aquarium', 68, 66, '04 / The clockmaker', 'The clocks drowned slowly. Each held one minute from a life we had borrowed. The clockmaker put his own minute in last.'],
    ['record-wardrobe', 7, 46, '05 / Return your borrowed face', 'Once the names register turns, a false door becomes solid. Do not trust the old route printed on your ticket. The door itself will tell you where it goes.'],
    ['record-sunday', 69, 51, '06 / An exit is not a cure', 'The departure lift accepts the two-register pass. You can leave before facing the sun. The building will remain awake. That is still a choice.'],
    ['record-museum', 21, 7, '07 / How to give a day back', 'Three remembered lives, held in a Null field, can give the borrowed day back. Without them the engine can only be shut. The people inside it will not return.'],
    ['record-weather', 82, 22, '08 / Forecast: yesterday', 'When the hours register answers the names, the court opens and the folded doors change destinations. The coloured rings show the present route. Read before stepping.'],
    ['record-court', 37, 24, '09 / The final form', 'ESCAPE: leave the machine running. SEAL: destroy its keeper and fold it inward. REWRITE: keep three memories intact, bring the Null projector, and return the stolen day. Nothing asks you to sacrifice another operator.'],
  ];
  for (const [id, x, z, label, text] of records) item(id, 'record', x, z, label, { repeatable: true, text });

  prop('arrival-bench', 'tomorrow-bench', 40, 70, 4, 2, 'arrivals');
  prop('arrival-clock', 'tomorrow-clock', 49, 73, 2, 2, 'arrivals');
  prop('orchard-molar-west', 'tomorrow-teeth', 10, 69, 3, 4, 'orchard');
  prop('orchard-molar-east', 'tomorrow-teeth', 19, 65, 3, 3, 'orchard');
  prop('aquarium-tank', 'tomorrow-clock', 74, 68, 4, 6, 'aquarium');
  prop('aquarium-pressure', 'glass-lab', 81, 73, 3, 3, 'aquarium');
  prop('wardrobe-west', 'tomorrow-faces', 11, 40, 3, 7, 'wardrobe');
  prop('wardrobe-east', 'tomorrow-faces', 19, 44, 3, 4, 'wardrobe');
  prop('exchange-stair', 'tomorrow-stairs', 43, 42, 5, 5, 'exchange');
  prop('exchange-desk', 'tomorrow-bench', 37, 44, 3, 2, 'exchange');
  prop('sunday-house', 'tomorrow-window', 73, 37, 4, 5, 'sunday');
  prop('sunday-horizon', 'tomorrow-window', 81, 34, 4, 3, 'sunday');
  prop('museum-door-west', 'tomorrow-door', 10, 10, 3, 7, 'museum');
  prop('museum-door-east', 'tomorrow-door', 19, 15, 3, 5, 'museum');
  prop('weather-vial-west', 'tomorrow-storm', 68, 9, 3, 5, 'weather');
  prop('weather-vial-east', 'tomorrow-storm', 78, 15, 3, 4, 'weather');
  prop('court-unborn-sun', 'tomorrow-core', 43, 10, 5, 5, 'court');
  prop('court-cover-west', 'tomorrow-door', 37, 16, 3, 3, 'court');
  prop('court-cover-east', 'tomorrow-door', 50, 16, 3, 3, 'court');

  const spectacle = (id, kind, x, z, y, width, depth, zoneId, extra = {}) => surrealProps.push({ id, kind, x, z, y, width, depth, zoneId, ...extra });
  spectacle('ceiling-benches', 'inverted-benches', 45, 76, 3.3, 13, 11, 'arrivals');
  spectacle('orchard-crown', 'porcelain-crown', 15, 70, 3.5, 15, 12, 'orchard');
  spectacle('fish-clock-school', 'orbit-clocks', 69.5, 69.5, 3.4, 15, 13, 'aquarium');
  spectacle('faces-constellation', 'borrowed-faces', 16, 44, 3.25, 17, 14, 'wardrobe', { changedBy: 'relay-west' });
  spectacle('stair-ouroboros', 'impossible-stairs', 45.5, 51.5, 3.4, 14, 14, 'exchange');
  spectacle('sunday-miniature', 'inside-horizon', 77, 40, 3.4, 18, 12, 'sunday');
  spectacle('doors-in-doors', 'nested-doors', 16, 16, 3.3, 18, 15, 'museum');
  spectacle('unborn-orbit', 'broken-orbit', 45.5, 19.5, 3.8, 18, 15, 'court');
  spectacle('forecast-in-bottles', 'bottled-storm', 76, 15, 3.4, 17, 15, 'weather', { changedBy: 'relay-east' });

  notice('arrival-title', 45, 64.02, 'THE WRONG SIDE OF TOMORROW', 'NAMES WEST / HOURS NORTHEAST / EXCHANGE AT THE CENTRE');
  notice('arrival-warning', 35.02, 80, 'LIVE WEAPONS / REAL COMPANIONS', 'NUMBERED MARKERS ARE YOUR TEAM / FRIENDLY FIRE IS ON', { dx: 1, dz: 0 });
  notice('orchard-entry', 15, 78.02, 'WEST ARRIVALS / TEETH ORCHARD', 'EAST TO THE WAITING ROOM / NORTH TO THE NAMES REGISTER');
  notice('aquarium-entry', 76, 78.02, 'EAST ARRIVALS / AQUARIUM OF HOURS', 'WEST TO THE WAITING ROOM / NORTH TO THE HOURS REGISTER');
  notice('sunday-entry', 77, 48.02, 'YOU ARRIVED LAST SUNDAY', 'WEST TO THE EXCHANGE / YOUR TEAM IS STILL HERE');
  notice('exchange-title', 45, 34.02, 'DEPARTMENT OF UNFINISHED DAYS', 'RESTORE THE EXCHANGE / RECONNECT BOTH REGISTERS');
  notice('wardrobe-title', 16, 34.02, 'RETURN YOUR BORROWED FACE', 'MOVE OUT OF THE TETHER / WATCH THE LANTERNS');
  notice('museum-title', 16, 4.02, 'THE MUSEUM REMEMBERS INCORRECTLY', 'FOLDED DOORS CHANGE WHEN BOTH REGISTERS ANSWER');
  notice('court-verdict', 45, 4.02, 'THREE WAYS TO LEAVE A TOMORROW', 'ESCAPE / SEAL / REMEMBER');
  notice('weather-title', 76, 4.02, 'FORECAST: SOMEBODY ELSE’S CHILDHOOD', 'THE HOURS REGISTER / NORTHEAST CORNER');

  // Threats are placed beyond protected arrivals. Every warning has cover and
  // room to move; mixes combine the four latest roles rather than only add HP.
  foe('orchard-sower', 'cinder-sower', 16, 67, 88, { introduction: true });
  foe('orchard-maw', 'lantern-maw', 24, 71, 90);
  foe('aquarium-skimmer', 'glass-skimmer', 69, 68, 78, { introduction: true });
  foe('aquarium-spitter', 'spitter', 83, 65, 80);
  foe('wardrobe-widow', 'tether-widow', 15, 37, 102, { introduction: true });
  foe('wardrobe-maw', 'lantern-maw', 24, 43, 96, { introduction: true });
  foe('wardrobe-runner', 'runner', 7, 42, 65);
  foe('sunday-maw', 'lantern-maw', 69, 43, 96);
  foe('sunday-skimmer', 'glass-skimmer', 81, 42, 78);
  foe('museum-widow', 'tether-widow', 16, 10, 108);
  foe('museum-sower', 'cinder-sower', 23, 8, 94);
  foe('museum-bulwark', 'bulwark', 16, 23, 170);
  foe('weather-sower', 'cinder-sower', 74, 8, 94);
  foe('weather-skimmer', 'glass-skimmer', 83, 14, 82);
  foe('weather-mender', 'mender', 72, 22, 84);
  foe('tomorrow-guardian', 'brute', 45, 22, 620, { guardian: true, bossGroup: 'tomorrow', bossName: 'The Unfinished Tomorrow' });
  foe('court-widow', 'tether-widow', 37, 10, 102);
  foe('court-skimmer', 'glass-skimmer', 53, 13, 82);
  foe('court-maw', 'lantern-maw', 50, 24, 96);

  // Supplies sit on edges so they do not occupy a combat lane or an arrival.
  for (const [id, , x1, z1, x2, z2] of sectors) {
    supply(`${id}-ammo`, 'ammo', x1 + 1, z2 - 2, 100);
    supply(`${id}-shells`, 'shells', x2 - 1, z2 - 2, 26);
    supply(`${id}-health`, 'health', x1 + 2, z1 + 2, 55);
    supply(`${id}-armor`, 'armor', x2 - 2, z2 - 1, 45);
    if (id !== 'arrivals') {
      supply(`${id}-cells`, 'cells', x1 + 1, z1 + 1, 28);
      supply(`${id}-slugs`, 'slugs', x2 - 1, z1 + 2, 24);
    }
  }
  const together = [{ x: 44.5, z: 84.5, angle: 0 }, { x: 46.5, z: 84.5, angle: 0 }, { x: 44.5, z: 82.5, angle: 0 }, { x: 46.5, z: 82.5, angle: 0 }];
  const pairs = [{ x: 7.5, z: 83.5, angle: Math.PI / 2 }, { x: 9.5, z: 83.5, angle: Math.PI / 2 }, { x: 81.5, z: 83.5, angle: -Math.PI / 2 }, { x: 83.5, z: 83.5, angle: -Math.PI / 2 }];
  const scattered = [{ x: 45.5, z: 84.5, angle: 0 }, pairs[0], pairs[3], { x: 83.5, z: 53.5, angle: -Math.PI / 2 }];
  const zones = sectors.map(([id, name, x1, z1, x2, z2, palette, accent, motif, description]) => ({ id, name, shortName: name, identity: name, x1, z1, x2: x2 + 1, z2: z2 + 1, palette, accent, motif, description, landmarkLabel: landmarks.find(p => p.tomorrowDistrict === id)?.id || name }));
  const gardenZones = [
    { id: 'rain-in-the-waiting-room', zoneId: 'arrivals', x: 46, z: 78, width: 16, depth: 14, type: 'water', palette: 'violet' },
    { id: 'aquarium-overflow', zoneId: 'aquarium', x: 76, z: 70, width: 19, depth: 12, type: 'water', palette: 'cyan' },
    { id: 'porcelain-soil', zoneId: 'orchard', x: 16, z: 69, width: 19, depth: 10, type: 'garden', palette: 'amber' },
    { id: 'storm-runoff', zoneId: 'weather', x: 76, z: 17, width: 18, depth: 12, type: 'water', palette: 'green' },
  ];
  return { id: 'wrong-side-of-tomorrow-v1', missionId: TOMORROW_ID, name: 'The Wrong Side of Tomorrow', signCode: 'TM-09', tomorrow: true, tomorrowRevision: TOMORROW_WORLD_REVISION,
    exploration: true, friendlyFire: true, upgradeNames: {}, enemyAwarenessDistance: 19, width, height, grid: cells.map(row => row.join('')),
    spawn: together[0], coopSpawns: together, coopSpawnVariants: [together, pairs, scattered], coopSpawnVariantLabels: ['One platform', 'Two misfiled platforms', 'Four different arrivals'],
    guardianId: 'tomorrow-guardian', guardianName: 'The Unfinished Tomorrow', doors, interactables, pickups, enemies, landmarks, wallNotices, surrealProps, gardenZones,
    zones, hazards: [], platformRooms: [], skylights: [{ id: 'sunday-ceiling', zoneId: 'sunday', x: 76, z: 40, width: 18, depth: 12, fractured: true }],
  };
}

export const TOMORROW = createTomorrow();
export const TOMORROW_MISSION = Object.freeze({ id: TOMORROW_ID, levelId: TOMORROW.id, name: TOMORROW.name, number: '009',
  subtitle: 'Your arrival was filed under somebody else.',
  briefing: 'An impossible civic building has borrowed a day from people who do not exist yet. Reunite at the central exchange, find the names and hours registers, and decide what deserves to leave. Teeth grow in the orchard, clocks swim behind glass, and doors change their destinations. The newest threats share the corridors. Escape early, seal the unfinished sun, or recover three memories and rewrite its future. Solo or two to four operators; friendly fire is live in this mission and some teams arrive on different platforms.',
  steps: ['Reach and wake the central exchange', 'Reconnect the names and hours registers', 'Recover your departure pass at the exchange', 'Choose escape, containment, or three-memory restoration', 'Watch your team’s firing lines'],
});

const stateOf = game => game?.state || game;
const used = (game, id) => stateOf(game)?.interactables?.some(o => o.id === id && o.used === true) === true;
const bothRegisters = game => used(game, 'relay-west') && used(game, 'relay-east');
const keeperDown = game => stateOf(game)?.enemies?.some(e => e.id === 'tomorrow-guardian' && e.alive === false) === true;
const hasPass = game => stateOf(game)?.player?.key === true;
const anchorCount = game => TOMORROW_ANCHORS.filter(id => used(game, id)).length;
const find = (game, id) => [...game.state.interactables, ...game.state.pickups, ...game.state.enemies, ...game.state.doors].find(o => o.id === id);

export function tomorrowEnding(game) {
  if (!game) return null;
  const id = Object.keys(TOMORROW_ENDINGS).find(key => used(game, key === 'escape' ? 'extraction' : `ending-${key}`));
  return id ? TOMORROW_ENDINGS[id] : null;
}

export function tomorrowProgress(game) {
  return { anchors: anchorCount(game), anchorsTotal: TOMORROW_ANCHORS.length,
    registers: Number(used(game, 'relay-west')) + Number(used(game, 'relay-east')),
    phase: bothRegisters(game) ? 'rewritten-routes' : stateOf(game)?.power ? 'awake' : 'dormant', ending: tomorrowEnding(game) };
}

export function tomorrowFoldDestination(game, object) {
  if (!object?.destinations) return null;
  return game.state.interactables.find(o => o.id === object.destinations[bothRegisters(game) ? 1 : 0]) || null;
}

export function tomorrowInteractionInfo(game, object) {
  if (!object?.tomorrowAction) return null;
  const s = game.state, active = s.status === 'playing' && s.player.alive !== false && !s.player.jump;
  const result = (text, label, canUse, extra = {}) => ({ text, label, canUse: active && canUse, ...extra });
  if (object.tomorrowAction === 'power') return result('Wake the exchange. Blue waiting lights become refuges.', 'POWER', !object.used);
  if (!s.power) return result('Wake the municipal exchange at the centre first', 'OFFLINE', false);
  if (object.tomorrowAction === 'relay') return result(`${object.label}. A false doorway will become a real shortcut.`, 'RESTORE', !object.used);
  if (object.tomorrowAction === 'anchor') {
    if (object.requires === 'weapon:nullgun' && !s.player.hasNull) return result('This memory flickers. Bring the Null projector from the museum.', 'NULL', false);
    return result(object.used ? 'Memory returned to the team' : `${object.label} · ${anchorCount(game)}/3 held`, object.used ? 'HELD' : 'REMEMBER', !object.used);
  }
  if (object.tomorrowAction === 'fold') {
    const destination = tomorrowFoldDestination(game, object);
    const zone = destination && game.level.zones.find(z => destination.x >= z.x1 && destination.x < z.x2 && destination.z >= z.z1 && destination.z < z.z2);
    return result(`Step through to ${zone?.name || 'the other doorway'}${bothRegisters(game) ? ' · route changed' : ''}`, 'FOLD', !!destination, { destinationId: destination?.id });
  }
  if (object.tomorrowAction === 'ending') {
    if (!bothRegisters(game)) return result('Reconnect the names and hours registers first', 'LOCKED', false);
    if (!hasPass(game)) return result('Collect the printed departure pass at the exchange', 'PASS', false);
    if (object.ending !== 'escape' && !keeperDown(game)) return result('The Unfinished Tomorrow still holds the court', 'KEEPER', false);
    if (object.ending === 'rewrite' && (anchorCount(game) !== 3 || !s.player.hasNull)) return result(`Rewrite needs all three memories and the Null projector · ${anchorCount(game)}/3 held`, 'MEMORIES', false);
    const descriptor = TOMORROW_ENDINGS[object.ending];
    return result(`${object.label}. ${descriptor.subtitle} This ends the run for the whole team.`, object.ending === 'escape' ? 'ESCAPE' : object.ending === 'seal' ? 'SEAL' : 'REWRITE', !tomorrowEnding(game), { ending: descriptor.id });
  }
  return null;
}

export function useTomorrowInteraction(game, object) {
  const info = tomorrowInteractionInfo(game, object);
  if (!info?.canUse) { if (info) game._events.push({ type: 'message', text: info.text }); return false; }
  const s = game.state, p = s.player;
  if (object.tomorrowAction === 'power') {
    object.used = true; s.power = true; s.checkpoint = true;
    game._replenishAtStation?.();
    game._events.push({ type: 'power' }, { type: 'message', text: 'The exchange wakes. Find Names in the west and Hours in the northeast. Blue waiting lights are now refuges.' });
    game._saveCheckpoint?.('Checkpoint saved at the exchange. Every arrival route meets here.');
  } else if (object.tomorrowAction === 'relay') {
    object.used = true;
    const door = s.doors.find(d => d.id === object.opensDoor); if (door) door.open = true;
    game._pathTimer = 0;
    const complete = bothRegisters(game);
    const text = complete ? 'Both registers answered. Your departure pass is at the exchange. The court opens; folded doors now lead elsewhere. Read the destination before stepping.' : `${object.relayName} returned. A false doorway became a shortcut. One register still waits.`;
    game._events.push({ type: 'relay', id: object.id, count: complete ? 2 : 1, total: 2, text }, { type: 'tomorrow-shift', id: object.id, phase: complete ? 2 : 1, x: object.x, z: object.z }, { type: 'message', text });
    s.effects.push({ id: `tomorrow-shift-${++game._serial}`, type: 'teleport', x: object.x, z: object.z, life: .8 });
    if (complete) { s.checkpoint = true; game._saveCheckpoint?.('Both registers remembered. Choose what to do with tomorrow.'); }
  } else if (object.tomorrowAction === 'anchor') {
    object.used = true;
    const count = anchorCount(game), text = `Memory ${count}/3 held: ${object.memory}`;
    game._events.push({ type: 'tomorrow-memory', id: object.id, count, total: 3, x: object.x, z: object.z, text }, { type: 'message', text });
    s.effects.push({ id: `tomorrow-memory-${++game._serial}`, type: 'teleport', x: object.x, z: object.z, life: .8 });
  } else if (object.tomorrowAction === 'fold') {
    const destination = tomorrowFoldDestination(game, object);
    let landing = destination?.landing;
    const occupied = Object.values(s.players || {}).filter(other => other !== p && other.alive !== false);
    if (landing && occupied.some(other => Math.hypot(other.x - landing.x, other.z - landing.z) < .7) && game._spawnNear) {
      landing = game._spawnNear(landing, occupied);
    }
    if (!landing || !game._clearCircle(landing.x, landing.z, .22)) return false;
    // Dynamic occupants do not turn a safe authored arrival into an immediate
    // collision. Deny the optional shortcut while a hostile or fire occupies it.
    if (s.enemies.some(e => e.alive && Math.hypot(e.x - landing.x, e.z - landing.z) < 3)
      || (s.shadowHazards || []).some(h => h.remaining > 0 && Math.hypot(h.x - landing.x, h.z - landing.z) < h.radius + 1)) {
      game._events.push({ type: 'message', text: 'Movement beyond the frame. Clear the far doorway or take the walking route.' }); return false;
    }
    object.used = true;
    p.x = landing.x; p.z = landing.z; p.angle = landing.angle || 0; p.moving = false; game._pathTimer = 0;
    game._events.push({ type: 'transit', ...(p.id ? { playerId: p.id } : {}), from: object.id, to: destination.id, x: p.x, z: p.z }, { type: 'message', ...(p.id ? { playerId: p.id } : {}), text: `The room kept a different appointment. ${game.level.zones.find(z => p.x >= z.x1 && p.x < z.x2 && p.z >= z.z1 && p.z < z.z2)?.name || ''}` });
    s.effects.push({ id: `tomorrow-fold-${++game._serial}`, type: 'teleport', x: p.x, z: p.z, life: .7 });
  } else if (object.tomorrowAction === 'ending') {
    object.used = true; s.status = 'won';
    const ending = TOMORROW_ENDINGS[object.ending];
    game._events.push({ type: 'win', time: s.time, ending: ending.id, title: ending.title, text: ending.text });
  }
  game._syncPermanentProgress?.();
  return true;
}

export function tomorrowObjective(game) {
  const s = game.state;
  const at = (id, title, detail, stage, action = 'interact') => { const target = find(game, id); return { title, detail, stage, action, x: target.x, z: target.z }; };
  const ending = tomorrowEnding(game);
  if (ending) return at(ending.id === 'escape' ? 'extraction' : `ending-${ending.id}`, ending.title, ending.text, 'complete', null);
  if (!s.power) return at('aux-power', 'Find the central exchange', 'All arrival platforms lead to the centre. Wake the municipal exchange; regroup at its blue waiting light.', 'power');
  const nextRelay = s.interactables.filter(o => o.type === 'relay' && !o.used).sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];
  if (nextRelay) return at(nextRelay.id, nextRelay.label, 'Names are in the western wardrobe; Hours are in the northeast weather room. Either register can be restored first. Memories in the orchard, aquarium and museum open another ending.', 'relays');
  if (!s.player.key) return at('access-key', 'Collect the departure pass', 'Both registers printed it at the central exchange. Take it, then choose: leave the machine running, seal it, or give the stolen day back.', 'key', 'collect');
  if (!keeperDown(game)) return at('tomorrow-guardian', 'Decide what deserves to leave', 'You can escape now from the southern waiting room. To seal or rewrite the anomaly, open the northern court and defeat the Unfinished Tomorrow.', 'choice', 'fight');
  if (anchorCount(game) === 3 && s.player.hasNull) return at('ending-rewrite', 'Return the stolen tomorrow', 'The violet terminal can restore the three remembered lives. The cyan terminal seals the anomaly without them. Each choice ends this run for the team.', 'ending');
  return at('ending-seal', 'Choose what remains', `Seal the anomaly at the cyan terminal, or keep exploring for the restoration ending: ${anchorCount(game)}/3 memories and the museum’s Null projector. Escape is still possible at the southern lift.`, 'ending');
}

export function tomorrowStateValid(snapshot) {
  const s = stateOf(snapshot);
  if (!s || !Array.isArray(s.interactables) || !Array.isArray(s.enemies)) return false;
  if (s.tomorrowRevision !== undefined && s.tomorrowRevision !== TOMORROW_WORLD_REVISION) return false;
  const endings = ['extraction', 'ending-seal', 'ending-rewrite'].filter(id => used(s, id));
  if (endings.length > 1) return false;
  if (!s.power && (used(s, 'relay-west') || used(s, 'relay-east') || anchorCount(s))) return false;
  if (used(s, 'memory-museum') && !s.player?.hasNull) return false;
  if (endings.length && (!s.power || !bothRegisters(s) || !s.player?.key)) return false;
  if ((used(s, 'ending-seal') || used(s, 'ending-rewrite')) && !keeperDown(s)) return false;
  if (used(s, 'ending-rewrite') && (anchorCount(s) !== 3 || !s.player?.hasNull)) return false;
  return true;
}
