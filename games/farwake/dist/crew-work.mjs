/** Seeded work orders: authored job families, varied loads, routes and instruments. */
const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const pick = (list, seed) => list[hash(seed) % list.length];
const validPort = body => body && body.portServices !== false && body.landable !== false && !['blackhole', 'ship', 'site', 'derelict'].includes(body.kind) && !(['moon', 'asteroid'].includes(body.kind) && /barren|rock|dust/.test(body.biome || ''));
const role = (id, name, stationRole, station, reward, description) => Object.freeze({ id, name, stationRole, station, reward, description, task: 'Read the posted work order at your assigned station.' });

export const CREW_WORK_ROLES = Object.freeze([
  role('cargo', 'Cargo hand', 'engineering', 'engineering', 150, 'Check a manifest, secure a load, and account for the delivery.'),
  role('steward', 'Passenger steward', 'medical', 'medical', 160, 'Prepare an occupied cabin and help a passenger complete their journey.'),
  role('medic', 'Ship medic', 'medical', 'medical', 180, 'Check medical supplies and do a supervised care assessment aboard a working ship.'),
  role('firehand', 'Maintenance hand', 'engineering', 'engineering', 170, 'Balance coolant and service the actual equipment on a routine working run.'),
  role('surveyor', 'Survey operator', 'scanner', 'navigation', 190, 'Calibrate instruments and take readings near a real destination.'),
  role('rigger', 'Rigger', 'engineering', 'engineering', 205, 'Prepare fittings, work a construction delivery, or make a tethered hull repair.'),
  role('gunner', 'Security hand', 'weapons', 'security', 210, 'Check a valuable shipment and stand a real weapons watch if trouble finds the run.')
]);

const families = Object.freeze([
  { id: 'freight', roleId: 'cargo', title: 'A straightforward delivery', goods: ['water filters', 'grain sacks', 'replacement lamps', 'laundry bundles', 'pump fittings', 'orchard tools'], reward: 145, prep: 'manifest', finish: 'receipt', description: 'A normal load, a named destination, and a signed receipt. Check the labels and bring the paperwork back.' },
  { id: 'fragile', roleId: 'cargo', title: 'Handle with care', goods: ['ceramic valves', 'glass sample tubes', 'optical lenses', 'old survey instruments'], reward: 165, prep: 'balance', finish: 'seal', description: 'Secure a fragile load, then check its seals before handing it over. Care earns the wage.' },
  { id: 'passage', roleId: 'steward', title: 'A seat on the morning run', goods: ['a commuting mill worker', 'an orchard visitor', 'a tired relay technician', 'a visiting teacher'], reward: 160, prep: 'cabin', finish: 'comfort', description: 'Prepare a real berth and check on the person using it. The pilot handles the journey.' },
  { id: 'medical', roleId: 'medic', title: 'The clinic supply run', goods: ['sealed dressing packs', 'temperature-sensitive cultures', 'replacement diagnostic cells', 'sterile filter cartridges'], reward: 180, prep: 'coldchain', finish: 'triage', description: 'Prepare the clinic’s supplies and check a crew member’s observations before the handover. No disaster is required.' },
  { id: 'maintenance', roleId: 'firehand', title: 'Keep the service boat running', goods: ['coolant cartridges', 'air scrubber membranes', 'pump seals', 'reactor service kits'], reward: 175, prep: 'coolant', finish: 'isolate', description: 'Balance the service circuit and isolate the right assembly for a routine replacement.' },
  { id: 'survey', roleId: 'surveyor', title: 'Chart corrections', goods: ['approach-beacon readings', 'harbor-dust samples', 'thermal calibration records', 'navigation timing samples'], reward: 190, prep: 'calibrate', finish: 'survey', description: 'Calibrate on the way out, then collect a clean reading at the marked approach. The place you sample is real.' },
  { id: 'construction', roleId: 'rigger', title: 'Parts for the next shift', goods: ['habitat braces', 'docking-collar panels', 'greenhouse frame sections', 'replacement gantry feet'], reward: 205, prep: 'rigging', finish: 'assembly', description: 'Prepare a balanced sling and check the fitting order at the receiving port.' },
  { id: 'hullwork', roleId: 'rigger', title: 'Outside the pressure hull', goods: ['an external sensor bracket', 'a docking collar cover', 'a radiator service plate', 'an antenna grounding strap'], reward: 235, prep: 'suit', finish: 'eva', description: 'Check the suit aboard, then step through the real airlock for a short, tethered repair outside the ship.' },
  { id: 'escort', roleId: 'gunner', title: 'An insured shipment', goods: ['payroll seals', 'archival originals', 'a precision reactor core', 'licensed medicine stock'], reward: 210, prep: 'identity', finish: 'handover', description: 'Stand security watch over valuable freight. Most runs need careful checks, not a firefight.' }
]);

export function crewWorkOffers(game) {
  const state = game.state, origin = game.system?.bodies?.find(body => body.id === state.locationId), serial = Math.max(0, Math.floor(Number(state.npcContractSerial) || 0)) + 1;
  const ports = (game.system?.bodies || []).filter(body => validPort(body) && body.id !== origin?.id && body.id !== 'earth');
  const context = `${state.seed}:${state.systemId}:${origin?.id || 'port'}:${serial}`;
  // Every board keeps several ordinary delivery jobs. Rigging alternates its
  // second slot, giving eight offers without revealing unearned ship designs.
  const includeHullwork = hash(`${context}:rigging-board`) % 2 === 0;
  const selected = families.filter(family => includeHullwork ? family.id !== 'construction' : family.id !== 'hullwork');
  return selected.map(family => {
    const seed = `${context}:${family.id}`, definition = CREW_WORK_ROLES.find(value => value.id === family.roleId), destination = ports.length ? pick(ports, `${seed}:port`) : null;
    const cargo = pick(family.goods, `${seed}:goods`), quantity = family.id === 'passage' ? 1 : 3 + hash(`${seed}:quantity`) % 9;
    const label = family.id === 'passage' ? cargo : `${quantity} ${cargo}`;
    return { ...definition, id: definition.id, roleId: definition.id, familyId: family.id, title: family.title, offerId: `watch:${hash(seed).toString(36)}:${serial}:${family.id}`, seed,
      cargo: label, quantity, destinationId: destination?.id || null, destinationName: destination?.name || 'outer service marker',
      routeName: `${origin?.name || 'Hiring port'} → ${destination?.name || 'local service marker'} → return`,
      origin: origin?.name || null, description: family.description, task: family.description,
      reward: Math.round((family.reward + hash(`${seed}:wage`) % 21) * (game.characterEffects?.jobRewards || 1)), cost: 0,
      prepKind: family.prep, finishKind: family.finish,
      // Complications are private until they physically occur. Seeded order
      // allows a save/reconnect without rerolling either risk or wages.
      complicationSeed: hash(`${seed}:complication`) };
  });
}

export function createWorkAssignment(offer, contractId) {
  const complication = offer.complicationSeed % 100 < 8 ? offer.roleId === 'gunner' ? 'attack' : ['fire', 'illness'][offer.complicationSeed % 2] : null;
  return { version: 2, offerId: offer.offerId, seed: offer.seed, familyId: offer.familyId, title: offer.title, cargo: offer.cargo, quantity: offer.quantity,
    destinationId: offer.destinationId, destinationName: offer.destinationName,
    tasks: [{ id: `${contractId}:prep`, kind: offer.prepKind, done: false }, { id: `${contractId}:delivery`, kind: offer.finishKind, done: false }],
    visitedDestination: false, delivered: false, complication: { type: complication, started: false, resolved: !complication, warned: false },
    eva: { active: false, oxygen: 120, maxOxygen: 120, workerId: null, trips: 0, emergency: false }, comms: [] };
}

const input = (id, label, options) => ({ id, label, options: options.map(value => typeof value === 'object' ? value : { id: String(value), label: String(value) }) });
const option = (id, label) => ({ id: String(id), label });

/** Answers are reconstructed on the authority, never accepted from a client. */
export function crewTaskDefinition(contract, task = contract.assignment?.tasks?.find(value => !value.done)) {
  if (!task || !contract.assignment) return null;
  const a = contract.assignment, h = hash(`${a.seed}:${task.kind}`), index = h % 3, count = a.quantity, codes = ['AMBER', 'TEAL', 'WHITE'], code = codes[index];
  const base = { id: task.id, kind: task.kind, title: 'Work order', brief: '', station: 'engineering', stationRole: 'engineering', puzzle: { type: 'sequence', prompt: '', clues: [], inputs: [] }, solution: [] };
  const set = (title, brief, station, inputs, solution, clues = [], type = 'sequence') => Object.assign(base, { title, brief, station, stationRole: ({ security: 'weapons', navigation: 'scanner', medical: 'medical' })[station] || 'engineering', puzzle: { type, prompt: brief, clues, inputs }, solution: solution.map(String) });
  switch (task.kind) {
    case 'manifest':
      set('Check the load', 'Match the departure sheet to the labeled freight.', 'engineering', [input('count', 'Packages on the manifest', [count - 1, count, count + 1]), input('port', 'Receiving port', [option('correct', a.destinationName), option('origin', contract.origin.name), option('return', 'Return to sender')])], [count, 'correct'], [`Loading tally: ${count} packages.`, `This shipment is addressed to ${a.destinationName}.`], 'manifest'); break;
    case 'receipt':
      set('Account for the delivery', 'Match the receiving receipt to the load before releasing it.', 'engineering', [input('quantity', 'Quantity delivered', [count, count + 2, count - 1]), input('seal', 'Receipt mark', codes)], [count, code], [`The original tally was ${count}.`, `Receiving clerk’s seal: ${code}.`], 'manifest'); break;
    case 'balance': {
      const left = 2 + h % 4, right = left + 2, total = left + right;
      set('Balance the cradle', 'Set the securing straps to share the load safely.', 'engineering', [input('port', 'Port strap', [left - 1, left, left + 1]), input('starboard', 'Starboard strap', [right - 1, right, right + 1])], [left, right], [`The two straps must carry ${total} units.`, 'The starboard strap carries two units more than port.'], 'dials'); break;
    }
    case 'seal':
      set('Inspect the fragile load', 'Read the three seal lamps and record the intact sequence.', 'engineering', [0, 1, 2].map(i => input(`seal-${i}`, `Seal ${i + 1}`, codes)), [codes[index], codes[(index + 1) % 3], codes[(index + 2) % 3]], [`Inspection lights, left to right: ${[codes[index], codes[(index + 1) % 3], codes[(index + 2) % 3]].join(' · ')}.`, 'Do not swap the seals when recording the handover.'], 'sequence'); break;
    case 'cabin':
      set('Prepare the passenger berth', 'Use the passenger card to prepare a comfortable seat.', 'medical', [input('seat', 'Berth', [option('quiet', 'Quiet berth'), option('machinery', 'Beside the pump'), option('airlock', 'Entry airlock')]), input('supply', 'Set out', [option('water', 'Water and a clean cup'), option('tools', 'Maintenance tools'), option('freight', 'Cargo labels')])], ['quiet', 'water'], ['The passenger is tired and wants to rest.', 'Potable water is stocked at the medical station.'], 'care'); break;
    case 'comfort':
      set('Check on your passenger', 'The passenger feels travel-sick. Choose a calm, practical response.', 'medical', [input('first', 'First response', [option('seat', 'Help them sit and check breathing'), option('leave', 'Leave them standing'), option('dose', 'Give an unprescribed medicine')]), input('then', 'Next step', [option('water', 'Offer water and keep checking'), option('ignore', 'Ignore the call'), option('promise', 'Promise symptoms cannot worsen')])], ['seat', 'water'], ['They are awake, breathing normally, and have asked for water.', 'The care card authorizes observation and basic comfort, not medication.'], 'care'); break;
    case 'coldchain': {
      const temperature = [2, 4, 6][index];
      set('Set the supply locker', 'Match the sealed pack’s handling card.', 'medical', [input('temperature', 'Locker temperature', [2, 4, 6]), input('light', 'Light cover', [option('closed', 'Closed'), option('open', 'Open')])], [temperature, 'closed'], [`Handling card: hold at ${temperature} degrees.`, 'Keep the opaque cover closed during transit.'], 'dials'); break;
    }
    case 'triage':
      set('Read the crew observations', 'Classify the readings before signing the routine care sheet.', 'medical', [input('patient', 'Who needs checking first?', [option('ira', `${a.workerName||'The deckhand'} · dizzy, pulse 118`), option('pilot', 'Pilot · alert, pulse 72'), option('supplies', 'The sealed supply case')]), input('action', 'Immediate action', [option('observe', 'Seat the deckhand and repeat observations'), option('discharge', 'Sign everyone fit without checking'), option('drug', 'Give a drug from the cargo')])], ['ira', 'observe'], [`${a.workerName||'The deckhand'} is awake and breathing normally but feels dizzy.`, 'The supervising care plan calls for rest and repeated observations.'], 'care'); break;
    case 'coolant': {
      const cooling = index + 1, service = cooling + 1, total = cooling + service + 1;
      set('Balance the coolant loop', 'Keep the cooling and service branches supplied.', 'engineering', [input('cooling', 'Cooling branch', [1, 2, 3]), input('service', 'Service branch', [2, 3, 4]), input('bypass', 'Bypass', [0, 1, 2])], [cooling, service, 1], [`The manifold supplies ${total} units.`, `Cooling needs ${cooling}; service needs one more than cooling.`, 'Send the remaining unit through the bypass.'], 'dials'); break;
    }
    case 'isolate':
      set('Service the assembly', 'Isolate the power before replacing the service cartridge.', 'engineering', [0, 1, 2].map(i => input(`step-${i}`, `Step ${i + 1}`, [option('power', 'Open the power isolator'), option('pressure', 'Bleed residual pressure'), option('replace', 'Replace the cartridge')])), ['power', 'pressure', 'replace'], ['Never open the cartridge with power connected.', 'Residual pressure is released only after isolation.'], 'sequence'); break;
    case 'calibrate': {
      const reference = 10 + index, bias = index + 1;
      set('Calibrate the receiver', 'Remove the test beacon’s known bias.', 'navigation', [input('bias', 'Bias correction', [1, 2, 3]), input('reference', 'Corrected reading', [reference - 1, reference, reference + 1])], [bias, reference], [`The test receiver displays ${reference + bias}.`, `The certified reference is ${reference}; subtract the excess.`], 'dials'); break;
    }
    case 'survey':
      set('Take the approach reading', 'Separate the steady beacon from the changing harbor interference.', 'navigation', [input('channel', 'Stable channel', ['A', 'B', 'C']), input('record', 'Record as', [option('reference', 'Approach reference'), option('distress', 'Distress call'), option('weapon', 'Weapons target')])], [['A', 'B', 'C'][index], 'reference'], [['A', 'B', 'C'].map((channel, i) => `${channel}: ${i === index ? '42, 42, 42' : i === (index + 1) % 3 ? '12, 57, 19' : '77, 16, 65'}`).join(' · '), 'An approach reference must remain steady across all three samples.'], 'evidence'); break;
    case 'rigging': {
      const load = 6 + index * 2;
      set('Rig the frame sections', 'Share the lift evenly between two rated slings.', 'engineering', [input('left', 'Port sling', [load / 2 - 1, load / 2, load / 2 + 1]), input('right', 'Starboard sling', [load / 2 - 1, load / 2, load / 2 + 1]), input('lock', 'Lock pin', [option('closed', 'Seated and locked'), option('loose', 'Loose for speed')])], [load / 2, load / 2, 'closed'], [`The load is ${load} units and must hang level.`, 'Both slings carry equal weight; the lock pin must be seated.'], 'dials'); break;
    }
    case 'assembly':
      set('Check the receiving fit', 'Lay out the assembly in the order the receiving crew needs.', 'engineering', [0, 1, 2].map(i => input(`part-${i}`, `Part ${i + 1}`, [option('foot', 'Foundation foot'), option('brace', 'Frame brace'), option('cover', 'Protective cover')])), ['foot', 'brace', 'cover'], ['The brace mounts to the foundation foot.', 'The protective cover hides both fasteners and goes on last.'], 'sequence'); break;
    case 'suit':
      set('Check the hull-walk kit', 'Perform the suit checks before the pilot takes you out.', 'engineering', [0, 1, 2].map(i => input(`check-${i}`, `Check ${i + 1}`, [option('oxygen', 'Confirm oxygen supply'), option('seal', 'Pressure-test the suit'), option('tether', 'Clip and test the tether')])), ['oxygen', 'seal', 'tether'], ['Check the supply before pressure-testing.', 'The tether is the final check before approaching the outer hatch.'], 'sequence'); break;
    case 'eva':
      set('Secure the exterior fitting', 'Work at the marked hull panel. Follow the locking sequence.', 'eva', [0, 1, 2].map(i => input(`lock-${i}`, `Lock ${i + 1}`, codes)), [codes[index], codes[(index + 2) % 3], codes[(index + 1) % 3]], [`Panel stencil: ${code} first.`, `${codes[(index + 1) % 3]} is the final retaining lock.`, 'Seat the remaining lock between them.'], 'sequence'); base.stationRole = 'engineering'; break;
    case 'identity':
      set('Check the insured manifest', 'Compare the carrier’s codes before clearing the valuable load.', 'security', [input('seal', 'Insurer seal', codes), input('route', 'Approved destination', [option('destination', a.destinationName), option('origin', contract.origin.name), option('unknown', 'Unlisted transfer point')])], [code, 'destination'], [`Insurer’s copy: ${code}.`, `The signed route ends at ${a.destinationName}.`], 'evidence'); break;
    case 'handover':
      set('Authorize the handover', 'Release the shipment only to the matching receipt.', 'security', [input('seal', 'Receipt seal', codes), input('action', 'Authorization', [option('signed', 'Match seal and record the handover'), option('unlogged', 'Release without a log'), option('unlisted', 'Divert to an unlisted carrier')])], [code, 'signed'], [`The receiving ledger is stamped ${code}.`, 'The insurer requires a recorded transfer.'], 'evidence'); break;
    default: return null;
  }
  return base;
}

export function publicCrewTask(contract, task) {
  const definition = crewTaskDefinition(contract, task);
  if (!definition) return null;
  const { solution, ...view } = definition; return view;
}
