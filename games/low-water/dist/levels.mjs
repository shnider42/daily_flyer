/**
 * LOW WATER — authored Bellwether Station campaign.
 * Rooms and ramps use minimum-corner x/z coordinates. Props, gates,
 * interactables, enemies and water use centre x/z coordinates. Metres throughout.
 * The geometry is intentionally data-driven so later chapters can share the
 * same renderer, collision, checkpoint and guidance systems.
 */

const room = (id, name, x, z, w, d, kind, extra = {}) => ({
  id, name, x, z, w, d, y: 0, h: 5, kind, color: '#65716c', ...extra,
});
const prop = (type, x, z, w, d, h, extra = {}) => ({
  type, x, z, w, d, h, y: 0, rotation: 0, solid: true, ...extra,
});
const use = (id, type, label, x, z, description, extra = {}) => ({
  id, type, label, x, z, y: 1.35, description, ...extra,
});
const gate = (id, x, z, w, d, requires, extra = {}) => ({
  id, x, z, w, d, y: 0, h: 3.6, requires, ...extra,
});

const arrivalRooms = () => [
  room('concourse', 'Arrival concourse', 0, 24, 18, 16, 'arrival', { h: 6, color: '#64716d' }),
  room('security', 'Reception / security', 16, 24, 12, 10, 'office'),
  room('lockers', 'Shift lockers', 26, 20, 16, 14, 'workshop'),
  room('staff-hall', 'Staff passage', 12, 16, 20, 6, 'corridor'),
  room('electrical', 'Auxiliary distribution', 0, 4, 18, 14, 'workshop', { color: '#756c55' }),
  room('service-link', 'Cable service passage', 12, 12, 6, 14, 'corridor'),
  room('observation', 'Turbine observation', 16, 10, 18, 10, 'office', { h: 6 }),
  room('freight', 'Freight vestibule', 32, 0, 12, 24, 'dock', { h: 7 }),
];

const LEVELS_DATA = [
  {
    id: 'night-shift', index: 0, name: 'Night Shift', kicker: '01 / ARRIVALS',
    description: 'The last ferry has left. Bellwether Station still has one maintenance call outstanding.',
    objective: 'Restore power to the freight gate.',
    hints: {
      simple: 'In Auxiliary Distribution, switch off GANTRY STANDBY, then switch on the FREIGHT GATE circuit.',
      moderate: 'The freight gate shares a limited supply with the gantry. Inspect the distribution room.',
      expert: 'AUX BUS: 3 units. Safety lighting: 1. Gantry standby: 2. Freight gate: 2.',
    },
    arrival: 'BELLWETHER STATION · 23:47. Night maintenance has one outstanding fault.',
    spawn: { x: 8, z: 35, y: 0, yaw: -0.68 },
    rooms: arrivalRooms(),
    props: [
      prop('bench', 5, 29, 5, 1.1, 0.65),
      prop('bench', 5, 38, 5, 1.1, 0.65),
      prop('desk', 23, 29, 4, 1.7, 1.05),
      prop('locker', 40.4, 26, 1.4, 8, 2.6),
      prop('bench', 33, 29, 5, 1.1, 0.65),
      prop('cabinet', 2, 12, 2, 7, 2.6),
      prop('generator', 8, 13, 3, 3, 2.2),
      prop('console', 25, 11.1, 7, 1.4, 1.1),
      prop('crate', 42, 20, 2, 2, 1.2),
      prop('crate', 33.4, 4, 1.7, 2.7, 1.7),
      prop('window', 23, 10.08, 8, 0.12, 2.5, { y: 1.1, solid: false, label: 'TURBINE HALL · WEST OBSERVATION' }),
      prop('sign', 9, 24.12, 5, 0.1, 1.2, { y: 0.6, solid: false, text: 'BELLWETHER', subtext: 'TIDAL RESEARCH STATION' }),
    ],
    interactables: [
      use('crane-breaker', 'breaker', 'Gantry standby · 2 units', 4.5, 5.1, 'The amber conduit runs toward the overhead gantry. Standby load: two units.'),
      use('exit-breaker', 'breaker', 'Freight gate · 2 units', 9, 5.1, 'The freight motor needs two units. The auxiliary bus can supply three, including one reserved for safety lighting.'),
      use('shift-note', 'note', 'Maintenance handover', 22, 27.6, 'A folded sheet beside the security monitor.'),
      use('locker-note', 'note', 'Locker 17', 37.8, 25, 'A note held to a locker with electrical tape.'),
      use('observation-note', 'note', 'Observation log', 24, 12.4, 'A clipboard left beside the turbine window.'),
      use('exit', 'exit', 'Descend to intake galleries', 38, 3.5, 'The freight lift serves the station’s lower intake galleries.', { requires: 'powerRouted' }),
    ],
    gates: [gate('freight-gate', 38, 8, 12.6, 0.7, 'powerRouted', { label: 'FREIGHT GATE · AUXILIARY SUPPLY' })],
    exit: { x: 38, z: 3.5, r: 2, requires: 'powerRouted' },
    notes: [
      { id: 'shift-note', title: 'Night maintenance / handover', text: 'The replacement distribution cabinet did not make the ferry. The freight motor is still sharing the auxiliary bus with gantry standby. Keep safety lighting on. Shed the gantry load before energising the gate. — Ellis\n\nResearch requested that the lower pumps remain running. Nobody signed the request.' },
      { id: 'locker-note', title: 'Locker 17', text: 'Mara — your torch is charged. Please put it back this time. If you hear somebody working under the intake floor, call the desk before you open anything. We have nobody scheduled down there tonight.' },
      { id: 'observation-note', title: 'Turbine observation / 22:10', text: 'Unit two has no mechanical fault. The vibration continues with the shaft stopped. Research asked us to describe it as a “persistent harmonic” on the maintenance report. I wrote down what I heard instead: three knocks, then two.' },
    ],
    enemies: [],
  },
  {
    id: 'below-the-mark', index: 1, name: 'Below the Mark', kicker: '02 / INTAKE GALLERIES',
    description: 'Blue pipes disappear beneath the floor. The service crossing is under water.',
    objective: 'Drain the lower service crossing.',
    hints: {
      simple: 'Close the intake valve in the east alcove. Open the bypass valve in the west room.',
      moderate: 'The basin is still being filled. Follow the blue pipework to both control valves.',
      expert: 'INTAKE → CROSSING BASIN → BYPASS DISCHARGE. Level gauge is above the service mark.',
    },
    arrival: 'INTAKE GALLERIES. The lift has stopped one level above the waterline.',
    spawn: { x: 6, z: 36, y: 0, yaw: -Math.PI / 2 },
    rooms: [
      room('intake-arrival', 'Lift landing', 0, 28, 14, 14, 'arrival'),
      room('pump-gallery', 'Pump gallery', 12, 22, 30, 18, 'pump', { h: 8, color: '#4e6a70' }),
      room('intake-alcove', 'Intake control', 30, 10, 14, 14, 'pump', { color: '#4e6a70' }),
      room('inspection', 'Inspection room', 2, 10, 12, 14, 'lab'),
      room('dry-route', 'Upper service walk', 12, 12, 22, 6, 'corridor'),
      room('crossing', 'Flooded service crossing', 16, 0, 12, 26, 'pump', { h: 7, color: '#42626d' }),
      room('bypass', 'Bypass discharge', 0, 0, 18, 12, 'workshop'),
      room('drain-exit', 'Lower drain access', 16, -8, 12, 10, 'corridor', { h: 4 }),
    ],
    props: [
      prop('pump', 17, 32, 4, 7, 3.4),
      prop('pump', 30, 32, 4, 7, 3.4),
      prop('tank', 40.5, 15, 3, 5, 4.2),
      prop('cabinet', 3.5, 19, 1.8, 5, 2.3),
      prop('desk', 9, 21, 4, 1.5, 1),
      prop('tank', 13, 4, 4, 4, 3.2),
      prop('crate', 3, 30, 2, 2, 1.2),
      prop('window', 2.12, 15.8, 0.12, 5, 2.2, { y: 1.1, solid: false, label: 'SUBMERGED INSPECTION PORT' }),
      prop('sign', 22, 1, 7, 0.1, 1, { y: 0.6, solid: false, text: 'LOWER SERVICE CROSSING', subtext: 'DO NOT ENTER ABOVE BLUE MARK' }),
    ],
    interactables: [
      use('intake-valve', 'valve', 'Intake valve', 34, 11.5, 'A blue pipe brings water from the tidal intake. The gauge is above the service mark.'),
      use('bypass-valve', 'valve', 'Bypass discharge valve', 5, 2, 'The bypass carries water away from the service crossing to the discharge channel.'),
      use('pump-note', 'note', 'Pump shutdown procedure', 35.7, 22.7, 'A waterproof instruction plate.'),
      use('sample-note', 'note', 'Inspection ledger', 9, 19.7, 'The last entry has been underlined twice.'),
      use('exit', 'exit', 'Enter the turbine service route', 22, -4.5, 'The exposed route passes beneath the pump gallery.', { requires: 'waterDrained' }),
    ],
    gates: [gate('water-crossing-gate', 22, -0.5, 12.6, 0.8, 'waterDrained', { label: 'FLOOD INTERLOCK · SERVICE ROUTE' })],
    exit: { x: 22, z: -4.5, r: 2, requires: 'waterDrained' },
    water: { x: 22, z: 10, w: 11.8, d: 20, high: 0.7, low: -0.4, flag: 'waterDrained' },
    notes: [
      { id: 'pump-note', title: 'Crossing basin / service procedure', text: 'First isolate the incoming flow. Then open the bypass discharge. Keep both positions until the lower-route interlock releases.\n\nThe discharge is gravity-fed. If the pumps go quiet but the water is still rising, the intake has not been isolated.' },
      { id: 'sample-note', title: 'Inspection ledger / tank C', text: '22:35 — No marine life visible in the inspection port.\n22:42 — Knock heard from the far side of the glass.\n22:43 — Pump stopped for inspection. Knock continued.\n22:44 — Repeated my knock before I finished it.\n\nDo not knock again.' },
    ],
    enemies: [],
  },
  {
    id: 'dead-load', index: 2, name: 'Dead Load', kicker: '03 / TURBINE HALL',
    description: 'An overhead gantry spans the turbine pits. The far maintenance deck remains lit.',
    objective: 'Recover the arc driver, then align the exit bridge.',
    hints: {
      simple: 'Use the gantry control to select TOOL BAY. Collect the arc driver. Return to the control and select EXIT DECK, then climb the east ramp.',
      moderate: 'The gantry has three docking positions. Service equipment is kept in the west tool bay.',
      expert: 'GANTRY STOPS: 0 PARKED · 1 TOOL BAY · 2 EXIT DECK. Bridge interlock requires an issued arc driver.',
    },
    arrival: 'TURBINE HALL. Somewhere above, the observation window is still lit.',
    spawn: { x: 5, z: 35, y: 0, yaw: -Math.PI / 2 },
    rooms: [
      room('turbine-entry', 'Coolant service landing', 0, 28, 14, 12, 'corridor'),
      room('turbine-hall', 'Turbine hall', 12, 18, 20, 22, 'gantry', { h: 14, color: '#716652' }),
      room('west-workshop', 'West maintenance workshop', 0, 12, 14, 18, 'workshop', { h: 6 }),
      room('gantry-booth', 'Gantry control', 14, 8, 12, 12, 'office'),
      room('north-service', 'North service deck', 24, 2, 14, 10, 'workshop'),
      room('tool-bay', 'Arc tool bay', 0, 0, 16, 14, 'workshop', { color: '#756b52' }),
      room('east-ramp', 'East maintenance ramp', 34, 8, 6, 18, 'corridor', { h: 10 }),
      room('east-deck', 'East maintenance mezzanine', 32, 24, 14, 8, 'gantry', { y: 2, h: 8 }),
      room('research-link', 'Research access bridge', 40, 30, 8, 12, 'corridor', { y: 2, h: 5 }),
    ],
    ramps: [{ x: 34, z: 8, w: 6, d: 18, fromY: 0, toY: 2, axis: 'z' }],
    bridge: { x: 44, z: 33, w: 8, d: 4, y: 2, axis: 'x', positionFlag: 'gantryPosition', requires: 'bridgeAligned' },
    props: [
      prop('turbine', 20, 25, 6, 8, 5),
      prop('turbine', 25, 35, 6, 7, 5),
      prop('workbench', 3, 21, 4, 2, 1.05),
      prop('cabinet', 1.3, 15.7, 1.4, 5, 2.4),
      prop('console', 20, 9.4, 7, 1.5, 1.1),
      prop('workbench', 6, 1.5, 7, 1.5, 1),
      prop('crate', 30, 4.5, 3, 3, 1.6),
      prop('locker', 15, 3, 1.4, 4, 2.5),
      prop('window', 12.1, 31, 0.12, 7, 3, { y: 6, solid: false, label: 'ARRIVALS OBSERVATION' }),
      prop('sign', 37, 8.3, 4, 0.1, 1, { y: 0.6, rotation: Math.PI, solid: false, text: 'EAST MAINTENANCE RAMP', subtext: 'RESEARCH ACCESS ABOVE' }),
    ],
    interactables: [
      use('gantry-control', 'gantry', 'Gantry docking control', 20, 11.3, 'Three stops: PARKED, TOOL BAY, EXIT DECK. Wait for the latch indication before crossing.'),
      use('gantry-control-return', 'gantry', 'Tool bay recall control', 11.5, 4, 'The local recall panel cycles the same three gantry docking stops.'),
      use('arc-tool', 'pickup', 'Take the arc driver', 6, 3.1, 'A maintenance arc driver. It can briefly stun a listener at close range. Let its charge recover between discharges.', { requires: 'toolAccessible' }),
      use('gantry-note', 'note', 'Bridge maintenance notice', 21.5, 13.3, 'A laminated gantry operation card.'),
      use('tool-note', 'note', 'Arc driver operating card', 3, 23, 'A worn card lies next to the workbench.'),
      use('exit', 'exit', 'Enter the research wing', 44, 39, 'The bridge leads into the station’s acoustic research wing.', { y: 3.35, requires: 'bridgeAligned' }),
    ],
    gates: [
      gate('tool-bay-gate', 8, 8, 16.6, 0.65, 'toolAccessible', { label: 'GANTRY STOP 1 · TOOL BAY' }),
      gate('research-bridge-gate', 44, 35, 8.6, 0.7, 'bridgeAligned', { y: 2, label: 'GANTRY STOP 2 · EXIT DECK' }),
    ],
    exit: { x: 44, z: 39, r: 2, requires: 'bridgeAligned' },
    notes: [
      { id: 'gantry-note', title: 'Maintenance gantry / docking procedure', text: 'Stop 0: PARKED.\nStop 1: TOOL BAY — retrieve a maintenance arc driver.\nStop 2: EXIT DECK — align the research access bridge.\n\nAn issued driver is required before the east bridge interlock releases. The recall panel in the tool bay operates the same stops. If you close your own gate, cycle the panel back to TOOL BAY.' },
      { id: 'tool-note', title: 'Arc driver / field use', text: 'A discharge interrupts nearby conductive equipment. The charge recovers automatically. Effective range is short.\n\nSomeone has added, in pencil: It stops when the tool flashes. Only for a moment. Make the moment count.' },
    ],
    enemies: [{ id: 'hall-listener', x: 29, z: 21, kind: 'listener' }],
  },
  {
    id: 'listening-room', index: 3, name: 'The Listening Room', kicker: '04 / ACOUSTIC RESEARCH',
    description: 'Behind the heavy doors, even the ventilation seems to be holding its breath.',
    objective: 'Stabilize the chamber with its three dampers.',
    hints: {
      simple: 'Set damper A to 2, damper B to 1, and damper C to 3. Each test cell contains its matching calibration record.',
      moderate: 'Match the three damper settings to the calibration marks in the observation cells.',
      expert: 'Reference channels A / B / C. Match each damper to its recorded pulse count.',
    },
    arrival: 'ACOUSTIC RESEARCH. The thick doors close on the turbine noise.',
    spawn: { x: 5, z: 34, y: 0, yaw: 0 },
    rooms: [
      room('research-entry', 'Acoustic vestibule', 0, 28, 12, 10, 'corridor', { color: '#747b71' }),
      room('research-reception', 'Research reception', 0, 16, 18, 14, 'office', { color: '#7b8174' }),
      room('observation-corridor', 'Test-cell observation', 16, 14, 28, 6, 'corridor', { color: '#7b8174' }),
      room('test-a', 'Reference cell A', 18, 18, 8, 14, 'lab'),
      room('test-b', 'Reference cell B', 26, 18, 10, 14, 'lab'),
      room('test-c', 'Reference cell C', 36, 18, 10, 14, 'lab'),
      room('resonance-core', 'Resonance chamber', 14, -4, 28, 20, 'core', { h: 10, color: '#655f68' }),
      room('emergency-stair', 'Emergency stair vestibule', 30, -12, 12, 10, 'corridor', { h: 6 }),
    ],
    props: [
      prop('desk', 5, 19, 5, 1.8, 1.05),
      prop('cabinet', 1.4, 24, 1.5, 5, 2.4),
      prop('tank', 22, 28, 3, 3, 3.3),
      prop('tank', 31, 28, 4, 3, 3.3),
      prop('tank', 41, 28, 3, 3, 3.3),
      prop('partition', 26, 26.5, 0.3, 11, 3.8),
      prop('partition', 36, 26.5, 0.3, 11, 3.8),
      prop('coil', 28, 5, 6, 6, 5.5),
      prop('console', 18, -2.3, 4, 1.5, 1.2),
      prop('console', 38, -2.3, 4, 1.5, 1.2),
      prop('console', 28, 13.5, 5, 1.4, 1.2),
      prop('sign', 22, 30.4, 4, 0.1, 1, { y: 0.6, rotation: Math.PI, solid: false, text: 'CHANNEL A / II', subtext: 'REFERENCE CALIBRATION' }),
      prop('sign', 31, 30.4, 4, 0.1, 1, { y: 0.6, rotation: Math.PI, solid: false, text: 'CHANNEL B / I', subtext: 'REFERENCE CALIBRATION' }),
      prop('sign', 41, 30.4, 4, 0.1, 1, { y: 0.6, rotation: Math.PI, solid: false, text: 'CHANNEL C / III', subtext: 'REFERENCE CALIBRATION' }),
    ],
    interactables: [
      use('damper-a', 'damper', 'Damper A · west channel', 18, -0.4, 'Three detents. Match the setting to reference cell A.'),
      use('damper-b', 'damper', 'Damper B · east channel', 38, -0.4, 'Three detents. Match the setting to reference cell B.'),
      use('damper-c', 'damper', 'Damper C · return channel', 28, 11.4, 'Three detents. Match the setting to reference cell C.'),
      use('calibration-a', 'note', 'Reference A · calibration', 22, 23.2, 'The recording repeats a pair of evenly spaced pulses.'),
      use('calibration-b', 'note', 'Reference B · calibration', 31, 23.2, 'The recording repeats one isolated pulse.'),
      use('calibration-c', 'note', 'Reference C · calibration', 41, 23.2, 'The recording repeats three short pulses.'),
      use('recording-note', 'note', 'Unscheduled recording', 5, 21, 'A recording log is still open on the reception desk.'),
      use('exit', 'exit', 'Take the emergency return stair', 36, -9.5, 'The emergency stair returns to the upper arrival level.', { requires: 'coreStable' }),
    ],
    gates: [gate('core-interlock', 36, -6.5, 12.6, 0.75, 'coreStable', { label: 'CHAMBER STABILITY INTERLOCK' })],
    exit: { x: 36, z: -9.5, r: 2, requires: 'coreStable' },
    solution: { dampers: [2, 1, 3] },
    notes: [
      { id: 'calibration-a', title: 'Reference channel A', text: 'Approved reference: II.\nTwo pulses per cycle.\n\nSet the WEST damper to detent 2. Leave the other channels independent until all three match.' },
      { id: 'calibration-b', title: 'Reference channel B', text: 'Approved reference: I.\nOne pulse per cycle.\n\nSet the EAST damper to detent 1. A steady indicator confirms a match.' },
      { id: 'calibration-c', title: 'Reference channel C', text: 'Approved reference: III.\nThree pulses per cycle.\n\nSet the RETURN damper to detent 3. The emergency interlock releases when all channels are stable.' },
      { id: 'recording-note', title: 'Unscheduled recording / 18:06', text: 'Audio summary: ferry docking, rain on the concourse windows, a maintenance locker opening, one person entering the freight lift.\n\nThe operator has written: This is tonight’s arrival. The ferry does not dock until 23:40.\n\nBelow that, in another hand: Do not play the final minute.' },
    ],
    enemies: [{ id: 'research-listener', x: 40, z: 20.5, kind: 'listener' }],
  },
  {
    id: 'return-tide', index: 4, name: 'Return Tide', kicker: '05 / EVACUATION',
    description: 'The concourse is familiar. The route through it has changed.',
    objective: 'Seal the intake, then reach the evacuation lift.',
    hints: {
      simple: 'Use the emergency isolation control in Auxiliary Distribution. Then reach the evacuation lift west of the concourse.',
      moderate: 'The evacuation route is interlocked with intake isolation. Return to the distribution room.',
      expert: 'EVACUATION INTERLOCK: INTAKE SEALED. Mechanical isolation control in Auxiliary Distribution.',
    },
    arrival: 'UPPER STATION. The emergency stair has brought you back to arrivals.',
    spawn: { x: 38, z: 17, y: 0, yaw: Math.PI / 2 },
    rooms: [
      ...arrivalRooms().filter(r => r.id !== 'lockers').map(r => ({
        ...r, color: r.kind === 'arrival' ? '#665951' : '#625e56',
      })),
      room('evacuation-dock', 'Evacuation lift', -10, 28, 12, 10, 'dock', { h: 6, color: '#596e67' }),
    ],
    props: [
      prop('bench', 5, 29, 5, 1.1, 0.65),
      prop('bench', 8, 36, 5, 1.1, 0.65, { rotation: 0.5 }),
      prop('desk', 23, 29, 4, 1.7, 1.05),
      prop('cabinet', 2, 12, 2, 7, 2.6),
      prop('generator', 8, 13, 3, 3, 2.2),
      prop('console', 25, 11.1, 7, 1.4, 1.1),
      prop('crate', 39, 7, 3, 3, 1.5),
      prop('crate', 15.1, 20, 2.6, 1.5, 1.2),
      prop('window', 23, 10.08, 8, 0.12, 2.5, { y: 1.1, solid: false, label: 'OBSERVATION GLASS · FRACTURED', broken: true }),
      prop('sign', -7.7, 28.2, 4, 0.1, 1, { y: 0.6, solid: false, text: 'EVACUATION', subtext: 'SURFACE LIFT' }),
    ],
    interactables: [
      use('emergency-seal', 'seal', 'Emergency intake isolation', 5, 5.4, 'The mechanical isolation control closes the intake gates and releases the evacuation lift.'),
      use('return-note', 'note', 'Final desk message', 22, 27.6, 'A message has appeared on the security terminal.'),
      use('seal-note', 'note', 'Emergency isolation procedure', 11, 5.4, 'A red plate beside the mechanical control.'),
      use('exit', 'exit', 'Take the evacuation lift', -7, 33, 'The lift travels to the top of the flood barrier.', { requires: 'evacReady' }),
    ],
    gates: [gate('evacuation-interlock', -3.4, 33, 0.75, 10.6, 'evacReady', { label: 'EVACUATION · INTAKE ISOLATION REQUIRED' })],
    exit: { x: -7, z: 33, r: 2, requires: 'evacReady' },
    water: { x: 37, z: 4, w: 11.5, d: 7.5, high: 0.3, low: -0.4, flag: 'evacReady' },
    notes: [
      { id: 'return-note', title: 'Security terminal / unsent message', text: 'All staff have left the upper station. The service passage remains clear. The evacuation lift will not release until the main intake is sealed.\n\nPlease do not wait for anyone you can hear below the floor.' },
      { id: 'seal-note', title: 'Emergency isolation', text: 'Operate the mechanical isolation control. Wait for the intake gate indication to settle. Proceed to the evacuation lift west of the arrival concourse.\n\nOnce the intake is isolated, leave the station. Do not re-enter the acoustic wing.' },
    ],
    enemies: [{ id: 'return-listener', x: 25, z: 19, kind: 'listener' }],
    ending: {
      title: 'Above the waterline',
      text: 'The lift rises above the flood barrier. Bellwether Station falls quiet beneath you. On the outside panel, one maintenance indicator begins to pulse. Twice. Once. Three times.',
    },
  },
];

export const LEVELS = LEVELS_DATA;

/** Numeric chapter index or exact chapter id; unknown values fall back safely. */
export function getLevel(index = 0) {
  if (typeof index === 'string' && !/^\d+$/.test(index)) {
    return LEVELS.find(level => level.id === index) || LEVELS[0];
  }
  const number = Number(index);
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Number.isFinite(number) ? Math.floor(number) : 0))];
}

const contains = (rect, x, z, margin = 0) =>
  x >= rect.x - margin && x <= rect.x + rect.w + margin &&
  z >= rect.z - margin && z <= rect.z + rect.d + margin;

/** Most specific/highest room, useful for the location label and material sound. */
export function roomAt(level, x, z) {
  let best = null;
  for (const candidate of level.rooms || []) {
    if (!contains(candidate, x, z)) continue;
    if (!best || (candidate.y || 0) > (best.y || 0) ||
      ((candidate.y || 0) === (best.y || 0) && candidate.w * candidate.d < best.w * best.d)) best = candidate;
  }
  return best;
}

/** Walkable floor height, including authored ramps. Returns null outside the map. */
export function floorAt(level, x, z, state = {}) {
  const bridge = level.bridge;
  if (bridge && Math.abs(x - bridge.x) <= bridge.w / 2 && Math.abs(z - bridge.z) <= bridge.d / 2) {
    // The travelling gantry deck occupies a genuine gap, overriding any room
    // rectangles that share its footprint. Closed edges are blocked by collides.
    return bridge.requires && !state[bridge.requires] ? null : bridge.y;
  }
  let height = null;
  for (const area of level.rooms || []) {
    if (contains(area, x, z)) height = Math.max(height ?? -Infinity, area.y || 0);
  }
  for (const ramp of level.ramps || []) {
    if (!contains(ramp, x, z)) continue;
    if (ramp.requires && !state[ramp.requires]) continue;
    const fraction = ramp.axis === 'x' ? (x - ramp.x) / ramp.w : (z - ramp.z) / ramp.d;
    const rise = ramp.fromY + Math.max(0, Math.min(1, fraction)) * (ramp.toY - ramp.fromY);
    height = Math.max(height ?? -Infinity, rise);
  }
  return height;
}

/** True means the gate still blocks movement. */
export function activeGate(gateObject, state = {}) {
  return gateObject.requires ? !Boolean(state[gateObject.requires]) : true;
}

function circleHitsRectangle(x, z, radius, object) {
  const rotation = object.rotation || 0;
  const dx = x - object.x, dz = z - object.z;
  const localX = dx * Math.cos(rotation) - dz * Math.sin(rotation);
  const localZ = dx * Math.sin(rotation) + dz * Math.cos(rotation);
  const halfW = (object.w || 1) / 2, halfD = (object.d || 1) / 2;
  const outsideX = Math.max(Math.abs(localX) - halfW, 0);
  const outsideZ = Math.max(Math.abs(localZ) - halfD, 0);
  return outsideX * outsideX + outsideZ * outsideZ < radius * radius;
}

/**
 * Capsule footprint collision. feetY is the player's current sole height, so a
 * two-metre mezzanine cannot be entered from its side while a shallow ramp works.
 * Eight footprint samples prevent slipping through a concave room-union corner.
 */
export function collides(level, x, z, radius = 0.3, state = {}, feetY = 0) {
  const floor = floorAt(level, x, z, state);
  if (floor === null || floor > feetY + 0.45) return true;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const edgeFloor = floorAt(level, x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, state);
    if (edgeFloor === null || edgeFloor > feetY + 0.45) return true;
  }
  const eyeClearance = 1.65;
  for (const object of [...(level.props || []).filter(item => item.solid), ...(level.gates || []).filter(item => activeGate(item, state))]) {
    const bottom = object.y ?? 0;
    const top = bottom + (object.h ?? 3);
    if (feetY >= top - 0.08 || feetY + eyeClearance <= bottom + 0.05) continue;
    if (circleHitsRectangle(x, z, radius, object)) return true;
  }
  return false;
}
