/** Authored campaigns and return visits in places that already exist in Hearth.
 * Their agreements belong to the captain; no shared geography is rewritten.
 */
import { buildLocalAftermaths, localAftermathConsequence } from './local-aftermaths.mjs';
export { LOCAL_AFTERMATH_IDS } from './local-aftermaths.mjs';
export const LOCAL_CAMPAIGN_IDS = Object.freeze(['cold_chain', 'fair_departure', 'clear_signal']);

const options = (ids, labels = ids) => ids.map((id, i) => ({ id: String(id), label: String(labels[i]) }));
const input = (id, label, ids, labels) => ({ id, label, options: options(ids, labels) });
const choice = (id, label, detail, effects, cost = {}) => ({ id, label, detail, effects, cost });
const campaign = (id, title, focus, offeredBy, summary, reward, stages) => ({
  id, title, category: 'Hearth campaign', localCampaign: { focus, scope: 'Hearth · no fold drive required' },
  offeredBy, remoteAccept: true, summary, reward, stages,
});

export function buildLocalCampaigns(at) {
  const stage = (id, title, kind, target, text, objective, extra = {}) => ({ id, title, kind, at: at(target), text, objective, ...extra });
  const talk = (id, title, target, text, objective, extra) => stage(id, title, 'talk', target, text, objective, { actionLabel: 'Discuss this step', ...extra });
  const inspect = (id, title, target, text, objective, extra) => stage(id, title, 'inspect', target, text, objective, { actionLabel: 'Record what you find', ...extra });
  const puzzle = (id, title, target, text, objective, challenge, extra) => stage(id, title, 'puzzle', target, text, objective, { puzzle: challenge, actionLabel: 'Check and record the result', ...extra });
  const choose = (id, title, target, text, objective, values) => stage(id, title, 'choice', target, text, objective, { options: values });
  const report = (id, title, target, objective, respondTo, responses) => talk(id, title, target, 'Review the result with the person who will live with it.', objective, { respondTo, responses });
  return [
    campaign('cold_chain', 'Night Shift, No Backup', 'Engineering & care', 'mara-reed',
      'Morrow’s medicine case loses power overnight. Diagnose the supply, commit real parts or money, and prove the repair before arranging ongoing support.', 140, [
        talk('call', 'Mara’s request', 'mara-reed',
          'Mara sends a plain request: “The clinic case warms up when the orchard changes shift. Check its log, trace the supply at the pump house, and bring me a repair plan. Do not throw away the medicine before we know which batches stayed cold.”',
          'Answer Mara’s message, then inspect the Unmarked medicine case on Morrow.'),
        inspect('case-log', 'Separate the case from its contents', 'clinic-case',
          'The sealed batches remained cold; the spare compartment warmed after 22:00. The case fan still works. Its log records a voltage drop exactly when the export pump starts. You label the affected compartment and leave the sealed batches alone.',
          'Land on Morrow. Read the Unmarked medicine case beside the settlement services.'),
        puzzle('diagnosis', 'Trace the overnight supply', 'orchard-valves',
          'At the Old Orchard Pump House, the case’s auxiliary supply shares a service panel with the pumps. The clinic must keep its steady feed without interrupting drinking water. Trace the three labeled circuits before replacing anything.',
          'Enter Morrow’s Old Orchard Pump House and examine the Outer-orchard valve manifold.', {
            type: 'evidence', title: 'Match each circuit to its job',
            prompt: 'Use the measured loads, not the faded color of the wiring.',
            clues: ['Circuit A runs steadily at 2 units and stays on overnight.', 'Circuit B jumps from 0 to 5 units at the 22:00 export shift.', 'Circuit C runs at 1 unit whenever a household tap is open.'],
            inputs: [input('clinic', 'Medicine case supply', ['A', 'B', 'C']), input('export', 'Export pump', ['A', 'B', 'C']), input('water', 'Drinking-water pump', ['A', 'B', 'C'])],
            solution: ['A', 'B', 'C'],
          }),
        choose('parts', 'Choose the repair you can support', 'mara-reed',
          'Mara confirms that the auxiliary regulator is failing. Her bench can turn four units of your ship’s ore into a replacement casing, or a supplier can provide a tested regulator for 55 cr. Either repair needs a local load test. This is work on the case supply; it does not change the orchard’s water allocation.',
          'Meet Mara Reed on Morrow and commit parts or money.', [
            choice('rebuild', 'Rebuild it with 4 ore from your ship', 'Requires your own ore-carrying ship docked at Morrow. Spend 4 ore; Mara keeps the repair design locally.',
              { trust: { 'mara-reed': 2 }, rep: { freewake: 3 }, flags: ['cold_chain_local_parts'], memory: 'You supplied four units of ore to rebuild the clinic case regulator.' }, { ore: 4 }),
            choice('replace', 'Buy the tested regulator · 55 cr', 'Spend 55 cr. The supplier keeps the design, but Mara can replace the unit using ordinary tools.',
              { trust: { 'mara-reed': 1 }, rep: { meridian: 2 }, flags: ['cold_chain_bought_parts'], memory: 'You paid 55 cr for a tested replacement clinic regulator.' }, { credits: 55 }),
          ]),
        puzzle('bench-test', 'Fit and load-test the regulator', 'orchard-valves',
          'The replacement is ready. At the service panel, isolate only the case’s auxiliary circuit, connect the regulator, apply the test load, then reconnect the case. The main water circuits stay on.',
          'Return to the valve manifold inside the Old Orchard Pump House. Complete the regulator test.', {
            type: 'sequence', title: 'Safe test procedure',
            prompt: 'Put the four steps in the order shown by Mara’s work card.',
            clues: ['Isolate the auxiliary circuit before fitting the regulator.', 'Fit the regulator before applying the test load.', 'Reconnect the medicine case only after the load test passes.'],
            inputs: [0, 1, 2, 3].map(i => input(`step-${i}`, `Step ${i + 1}`, ['isolate', 'fit', 'test', 'reconnect'], ['Isolate auxiliary circuit', 'Fit regulator', 'Apply test load', 'Reconnect case'])),
            solution: ['isolate', 'fit', 'test', 'reconnect'],
          }, { completionFlag: 'cold_chain_regulator_tested', respondTo: 'parts', responses: {
            rebuild: 'Mara’s rebuilt regulator is ready. Your four units of ore are now its casing and contacts. Isolate the auxiliary circuit, fit it, test it under load, and only then reconnect the medicine case.',
            replace: 'The purchased regulator has arrived. Its factory test does not replace a test of this circuit. Isolate the auxiliary circuit, fit it, test it under load, and only then reconnect the medicine case.',
          } }),
        puzzle('verification', 'Verify the medicine case', 'clinic-case',
          'The case now logs three stable readings: 4, 5, and 4 degrees. Mara’s label allows 2–8 degrees and requires the sealed batch number to match. You can sign off the supply repair without inventing a clinical judgment about an unlabeled batch.',
          'Return to the medicine case on Morrow and verify the repair.', {
            type: 'evidence', title: 'Release the checked compartment',
            prompt: 'Record only what the displayed checks establish.',
            clues: ['Allowed storage range: 2–8 degrees. Recorded readings: 4, 5, 4.', 'The sealed batch is M-14. Its packing slip also says M-14.', 'The unlabelled spare compartment remains held for the clinic to review.'],
            inputs: [input('temperature', 'Temperature check', ['stable', 'failed'], ['Within the labeled range', 'Outside the labeled range']), input('batch', 'Sealed batch check', ['match', 'mismatch'], ['M-14 matches the packing slip', 'Batch numbers disagree']), input('unlabelled', 'Unlabelled stock', ['hold', 'release'], ['Keep held for the clinic', 'Release with the sealed stock'])],
            solution: ['stable', 'match', 'hold'],
          }, { completionFlag: 'cold_chain_verified' }),
        choose('agreement', 'Choose how Mara repays the work', 'mara-reed',
          'The case passed its checks. Mara can put your captain on the clinic’s support agreement or the workshop’s maintenance agreement. She can fund one. These terms apply to your captain at Morrow, not to every ship in the shared galaxy.',
          'Meet Mara on Morrow and choose your ongoing support.', [
            choice('care', 'Support the clinic · 25% off your Morrow infirmary visits', 'The clinic will cover a quarter of your treatment fee after this campaign is complete. Ship repairs keep their normal price.',
              { rep: { freewake: 5, lantern: 3 }, trust: { 'mara-reed': 4 }, flags: ['cold_chain_care_agreement'], memory: 'You secured a personal Morrow clinic agreement: 25% off infirmary treatment after completing the repair report.' }),
            choice('workshop', 'Support the workshop · 15% off your Morrow hull repairs', 'The workshop will cover part of your hull repair bill after this campaign is complete. Medical treatment keeps its normal price.',
              { rep: { freewake: 3, meridian: 2 }, trust: { 'mara-reed': 3 }, flags: ['cold_chain_workshop_agreement'], memory: 'You secured a personal Morrow workshop agreement: 15% off hull repairs after completing the repair report.' }),
          ]),
        report('handover', 'Leave a repair someone can maintain', 'mara-reed', 'Give Mara the completed repair and temperature records.', 'agreement', {
          care: 'Mara copies the regulator settings and batch checks into the clinic book. “Now the next shift can see what changed.” Your Morrow infirmary agreement is ready: a quarter of your treatment fee is covered once you hand over this report.',
          workshop: 'Mara pins the regulator diagram above her bench and files the case readings. “A repair is useful when the next mechanic can repeat it.” Your Morrow workshop agreement is ready: 15% of your hull repair bill is covered once you hand over this report.',
        }),
      ]),
    campaign('fair_departure', 'A Fair Departure', 'Transport & negotiation', 'len-vale',
      'Kettle’s missed connections have become everybody’s problem. Rebuild the schedule, agree whose journeys deserve support, then complete a real passenger fare to test it.', 165, [
        talk('call', 'A dispatch board nobody trusts', 'len-vale',
          'Len sends the cancelled departure list. “The freight broker says passengers miss their slots. Passengers say freight takes every slot. Read the slips, hear both sides, and help me write a timetable we can actually run.”',
          'Answer Len’s message, then read the Uncollected passage slip at Kettle.'),
        inspect('slips', 'One departure, three different times', 'passenger-slip',
          'Beneath the old medical exemption are today’s dispatch carbon copies. Passengers were told 07:10; the loading crew was told 07:20; the broker reserved the berth until 07:30. Nobody could have met all three instructions.',
          'Read the Uncollected passage slip on Kettle Station’s concourse.'),
        talk('broker', 'Ask what the berth actually needs', 'silas-voss',
          'Silas shows you the loading requirement: ten minutes for a freight move, five for a passenger boarding, and five to clear the lock between ships. “Give me a reliable slot and I can stop buying the whole morning.” He will accept a public timetable if it includes the clearance time.',
          'Speak to Silas Voss on Kettle about the loading windows.'),
        puzzle('timetable', 'Publish a timetable that fits', 'freight-register',
          'The night freight register has room for one corrected morning schedule. Put the promised freight move first, leave the required lock clearance, then board passengers. Nobody gains time by writing two ships into the same berth.',
          'Use the Night freight register on Kettle to correct the departure schedule.', {
            type: 'dials', title: 'The 07:00 dispatch window',
            prompt: 'All three entries are start times. Use the durations Silas gave you.',
            clues: ['The freight move must start at 07:00 and lasts ten minutes.', 'The lock must clear for five minutes after freight leaves.', 'Passenger boarding starts as soon as the lock is clear.'],
            inputs: [input('freight', 'Freight begins', ['00', '05', '10', '15'], ['07:00', '07:05', '07:10', '07:15']), input('clearance', 'Lock clearance begins', ['00', '05', '10', '15'], ['07:00', '07:05', '07:10', '07:15']), input('passengers', 'Passenger boarding begins', ['05', '10', '15', '20'], ['07:05', '07:10', '07:15', '07:20'])],
            solution: ['00', '10', '15'],
          }),
        choose('charter', 'Who gets the dispatch reserve?', 'len-vale',
          'There is enough reserve funding for one kind of trip on your captain’s dispatch contract. The payment goes to you for carrying eligible fares; passengers still use the ordinary public service. A trial voyage must finish before Len approves the supplement.',
          'Meet Len Vale on Kettle and choose a passenger charter.', [
            choice('care', 'Back clinic journeys · 35 cr contribution', 'Spend 35 cr. After the trial and final approval, patient fares within Hearth pay you 10 cr extra.',
              { rep: { freewake: 5, lantern: 2 }, trust: { 'len-vale': 3, 'mara-reed': 2 }, flags: ['departure_care_charter'], memory: 'You backed a clinic-passage charter, pending one completed Hearth fare and Len’s approval.' }, { credits: 35 }),
            choice('commute', 'Back shift workers · 15 cr contribution', 'Spend 15 cr. After the trial and final approval, commuter fares within Hearth pay you 6 cr extra.',
              { rep: { freewake: 4 }, trust: { 'len-vale': 4 }, flags: ['departure_commuter_charter'], memory: 'You backed a shift-worker charter, pending one completed Hearth fare and Len’s approval.' }, { credits: 15 }),
            choice('courier', 'Accept the broker’s courier reserve', 'No contribution. After the trial and final approval, courier fares within Hearth pay you 8 cr extra. Silas controls this reserve; Len wanted it shared more broadly.',
              { rep: { meridian: 5, freewake: -2 }, trust: { 'silas-voss': 3, 'len-vale': -1 }, flags: ['departure_courier_charter'], memory: 'You accepted the broker’s courier charter, pending one completed Hearth fare and Len’s approval.' }),
          ]),
        stage('trial', 'Run a real passenger service', 'passage-proof', 'len-vale',
          'Complete one passenger fare between Hearth’s inhabited ports. Use a Passage desk to accept a fare, carry the passenger aboard the same ship, and complete the booking at the destination desk. A fare you are already carrying counts if you finish it now. It pays its quoted rate; the new supplement starts only after Len approves your report.',
          'Complete a passenger fare within Hearth, then return to Len Vale at Kettle.', { actionLabel: 'Show Len the completed fare receipt', proofFlag: 'fair_departure_trial_complete' }),
        report('approval', 'A schedule that survived a journey', 'len-vale', 'Ask Len to approve the charter after reviewing your completed fare.', 'charter', {
          care: 'Len matches the completed fare receipt to the new timetable. “That is a journey, not a promise.” He approves your clinic charter. New patient fares you accept within Hearth will include a 10 cr dispatch supplement; an existing booking keeps its original quote.',
          commute: 'Len checks the fare receipt and pins up the corrected times. “People can plan a shift around a ship that actually arrives.” He approves your worker charter. New commuter fares you accept within Hearth will include a 6 cr supplement; existing bookings keep their quoted fare.',
          courier: 'Silas funds the courier reserve as agreed. Len files the completed fare but leaves the clinic funding request open. Your new Hearth courier fares will include an 8 cr supplement; other passengers and already accepted bookings keep their normal quote.',
        }),
      ]),
    campaign('clear_signal', 'The Signal We Can Trust', 'Investigation & flight', 'ada-finch',
      'A faulty time reference makes routine warnings look impossible. Compare two sources, take a real flight reading, and decide who controls the corrected report.', 185, [
        talk('call', 'A practical problem at Northwatch', 'ada-finch',
          'Ada’s message separates this job from the dome’s stranger recordings. “This is the ordinary weather receiver. Its warnings arrive with impossible timestamps. Compare its clock with Kettle’s dispatch log, take a reference reading near Morrow, and show me the error.”',
          'Answer Ada’s message, then visit the Northwatch shift recorder on Morrow.'),
        inspect('receiver', 'Read the clock, not the rumor', 'dome-recorder',
          'The weather receiver stamped a test pulse at 08:12. Its maintenance card says the pulse left Kettle at 08:00 and should take two minutes to arrive. A ten-minute clock error explains the stamp without predicting the future.',
          'Enter Northwatch Weather Dome on Morrow and read its shift recorder.'),
        talk('dispatch', 'Check an independent clock', 'len-vale',
          'Len’s berth controller confirms that the pulse left at 08:00. Its clock was checked against two arriving ferries. He gives you the dispatch copy, including a second pulse sent at 09:00. “Use both. One tidy example is not a pattern.”',
          'Speak to Len Vale on Kettle Station for the independent dispatch copy.'),
        puzzle('comparison', 'Account for the missing ten minutes', 'freight-register',
          'Kettle’s register records departures at 08:00 and 09:00. Northwatch recorded arrivals at 08:12 and 09:12. Both pulses take two minutes in transit. Choose the receiver correction that fits both observations.',
          'Compare the two pulse records at Kettle’s Night freight register.', {
            type: 'evidence', title: 'Separate transit delay from clock error',
            prompt: 'The receiver clock should show departure time plus two minutes.',
            clues: ['First expected arrival: 08:02. Recorded arrival: 08:12.', 'Second expected arrival: 09:02. Recorded arrival: 09:12.', 'Do not subtract the two-minute transit delay twice.'],
            inputs: [input('direction', 'Receiver adjustment', ['back', 'forward', 'none'], ['Move its clock back', 'Move its clock forward', 'Leave its clock unchanged']), input('minutes', 'Adjustment in minutes', ['2', '10', '12'], ['2 minutes', '10 minutes', '12 minutes'])],
            solution: ['back', '10'],
          }),
        { id: 'flight-reference', title: 'Take a reference reading in flight', kind: 'ship-scan', at: { systemId: 'hearth', x: 960, y: -420, label: 'Morrow calibration point' }, scanEnergy: 8,
          text: 'The notebook marks a safe reference point beside Morrow’s approach. Take your ship there and collect a reading from the helm. This uses 8 reactor charge and does not require a scanner upgrade or a fold drive.',
          objective: 'Launch into Hearth, follow the Morrow calibration point marker, and take the reference reading from your ship.', actionLabel: 'Take the reference reading · 8 charge',
          locationReason: 'Take the helm of your ship in Hearth to collect this reference reading.', distanceReason: 'Fly within your scanner range of the marked Morrow calibration point.' },
        puzzle('calibration', 'Verify the corrected receiver', 'dome-recorder',
          'Your flight reading agrees with Kettle. With the receiver moved back ten minutes, the next pulse sent at 10:00 should arrive at 10:02. Ada asks you to preserve the raw old log alongside the correction so someone else can check your work.',
          'Return to the Northwatch shift recorder on Morrow and verify the corrected time.', {
            type: 'evidence', title: 'Leave an auditable correction',
            prompt: 'Record the corrected arrival and decide which evidence to retain.',
            clues: ['A pulse sent at 10:00 takes two minutes to arrive.', 'The raw readings show how you found the ten-minute error.', 'A correction without the source record cannot be independently checked.'],
            inputs: [input('arrival', 'Corrected arrival', ['10:00', '10:02', '10:12']), input('record', 'Evidence record', ['both', 'corrected', 'raw'], ['Keep raw log and correction together', 'Keep only corrected timestamps', 'Keep only the faulty raw timestamps'])],
            solution: ['10:02', 'both'],
          }, { completionFlag: 'clear_signal_calibrated' }),
        choose('publication', 'Who can check the correction?', 'ada-finch',
          'The receiver is now consistent. Ada can publish the full technical report, publish a version with personal journey details removed, or license it to the freight broker. Your calibration notes work with ordinary ship signals; finishing the handover will reduce those scans from 8 to 6 charge. Story transmissions keep their existing requirements.',
          'Meet Ada Finch on Morrow and choose how to distribute the report.', [
            choice('open', 'Publish the complete technical record', 'Anyone can check the result. The attached dispatch logs include identifiable journey details. No fee.',
              { rep: { lantern: 6, freewake: 3 }, trust: { 'ada-finch': 2, 'len-vale': -1 }, flags: ['signal_report_open'], memory: 'You published the full receiver correction, including the identifiable dispatch logs.' }),
            choice('redacted', 'Pay 25 cr for a public report with private journeys removed', 'Spend 25 cr. Keep the measurements public, remove names and ticket numbers, and retain the full evidence with Ada.',
              { rep: { lantern: 5, freewake: 4 }, trust: { 'ada-finch': 4, 'len-vale': 3 }, flags: ['signal_report_redacted'], memory: 'You funded a public receiver report with private journey details removed.' }, { credits: 25 }),
            choice('licensed', 'License the report to Silas · 30 cr payment', 'Gain 30 cr. The broker gets exclusive use of the full report; Ada can keep a verification copy but cannot publish it.',
              { credits: 30, rep: { meridian: 5, lantern: -3 }, trust: { 'silas-voss': 3, 'ada-finch': -2 }, flags: ['signal_report_licensed'], memory: 'You licensed the full receiver correction to Silas instead of publishing it.' }),
          ]),
        report('handover', 'A warning with a source attached', 'len-vale', 'Return to Len at Kettle and hand over the approved receiver report.', 'publication', {
          open: 'Len posts the corrected warning times and the full report. People can check the measurements; some can also recognize their private journeys in the appendices. He thanks you for fixing the clock and asks you to think harder about names next time. Your ordinary ship scans now need 6 charge.',
          redacted: 'Len posts the corrected warning times with the public report. The measurement trail is intact, the passenger names are absent, and Ada retains the originals for review. “This I can put beside the departure board.” Your ordinary ship scans now need 6 charge.',
          licensed: 'Len receives a corrected timetable, but the supporting report now belongs to Silas. It solves today’s dispatch error while leaving the broker in charge of future access. Ada retains her private verification copy. Your ordinary ship scans now need 6 charge.',
        }),
      ]),
    ...buildLocalAftermaths(at),
  ];
}

const completed = (game, id) => game?.state?.narrative?.quests?.[id]?.status === 'completed';
export function localCampaignConsequence(id, choices = {}) {
  const aftermath = localAftermathConsequence(id, choices); if (aftermath) return aftermath;
  if (id === 'cold_chain') return choices.agreement === 'care'
    ? 'Your captain receives 25% off infirmary treatment at Morrow. Other ports and hull repairs keep their normal prices.'
    : choices.agreement === 'workshop' ? 'Your captain receives 15% off hull repairs at Morrow. Other ports and medical treatment keep their normal prices.' : null;
  if (id === 'fair_departure') return ({ care: 'New patient fares within Hearth include a 10 cr supplement for your captain.', commute: 'New commuter fares within Hearth include a 6 cr supplement for your captain.', courier: 'New courier fares within Hearth include an 8 cr broker-funded supplement for your captain.' })[choices.charter] || null;
  if (id === 'clear_signal') return ({ open: 'The full report is public, including its journey details. Your ordinary ship scans use 6 charge instead of 8.', redacted: 'The measurements are public; personal journey details are withheld. Your ordinary ship scans use 6 charge instead of 8.', licensed: 'Silas controls the report; Ada keeps a verification copy. Your ordinary ship scans use 6 charge instead of 8.' })[choices.publication] || null;
  return null;
}

export function localCampaignPresentation(definition, record) {
  if (!definition?.localCampaign) return null;
  return { ...definition.localCampaign, step: Math.min(definition.stages.length, (record?.stage || 0) + 1), total: definition.stages.length,
    consequence: record?.status === 'completed' ? localCampaignConsequence(definition.id, record.choices) : null };
}

export function localServiceBenefit(game, action) {
  if (!completed(game, 'cold_chain') || game.state.systemId !== 'hearth' || game.state.locationId !== 'morrow' || game.state.interior || game.state.mode !== 'person') return null;
  const followup = game.state.narrative.quests.cold_chain_aftercare;
  if (followup?.status === 'completed') {
    if (followup.choices?.support === 'rota' && action === 'rest') return { multiplier: .65, label: 'Verified Morrow handover agreement · 35% off total' };
    if (followup.choices?.support === 'spares' && action === 'repair') return { multiplier: .78, label: 'Verified Morrow spare-kit agreement · 22% off total' };
  }
  const agreement = game.state.narrative.quests.cold_chain.choices?.agreement;
  if (agreement === 'care' && action === 'rest') return { multiplier: .75, label: 'Morrow clinic agreement · 25% off' };
  if (agreement === 'workshop' && action === 'repair') return { multiplier: .85, label: 'Morrow workshop agreement · 15% off' };
  return null;
}

export function localScanCost(game, signal) {
  if (!signal || signal.story || signal.earthCampaign || !completed(game, 'clear_signal')) return 8;
  return completed(game, 'signal_aftercare') ? 5 : 6;
}

export function localCharterSupport(game, originSystem, typeId, { original = false } = {}) {
  if (originSystem !== 'hearth' || !completed(game, 'fair_departure')) return null;
  const charter = game.state.narrative.quests.fair_departure.choices?.charter;
  const terms = { care: { type: 'patient', bonus: 10, label: 'Clinic charter · +10 cr' }, commute: { type: 'commuter', bonus: 6, label: 'Shift-worker charter · +6 cr' }, courier: { type: 'courier', bonus: 8, label: 'Courier charter · +8 cr' } }[charter];
  if (!terms) return null;
  const followup = game.state.narrative.quests.departure_aftercare;
  if (!original && followup?.status === 'completed') {
    if (followup.choices?.reserve === 'shared' && terms.type !== typeId && ['patient', 'commuter', 'courier'].includes(typeId)) return { type: typeId, bonus: 4, label: 'Open-seat reserve · +4 cr' };
    if (followup.choices?.reserve === 'clear' && terms.type === typeId) return { ...terms, bonus: terms.bonus + 2, label: `Revised ${charter === 'care' ? 'clinic' : charter === 'commute' ? 'shift-worker' : 'courier'} charter · +${terms.bonus + 2} cr` };
  }
  return terms.type === typeId ? terms : null;
}

export function recordCampaignPassage(game, passenger, definition, followupDefinition) {
  let changed = false;
  const record = game.state.narrative?.quests?.fair_departure;
  if (record?.status === 'active' && definition?.stages[record.stage]?.id === 'trial' && passenger.originSystem === 'hearth' && passenger.targetSystem === 'hearth' && !game.hasFlag('thread:fair_departure_trial_complete')) {
    game._flag('thread:fair_departure_trial_complete');
    game._event('thread-progress', { threadId: 'fair_departure', text: 'Hearth trial fare completed. Return to Len Vale at Kettle to approve your charter.' }); changed = true;
  }
  const followup = game.state.narrative?.quests?.departure_aftercare;
  const reservation = localAftermathFare(game, { id: 'kettle' }, followupDefinition);
  if (followup?.status === 'active' && followupDefinition?.stages[followup.stage]?.id === 'trial' && isAftermathPassenger(passenger) && passenger.type === reservation?.type && passenger.name === reservation?.name && !game.hasFlag('thread:departure_aftercare_trial_complete')) {
    game._flag('thread:departure_aftercare_trial_complete');
    game._event('thread-progress', { threadId: 'departure_aftercare', text: `${passenger.name} reached Morrow. Return to Len at Kettle with this named booking’s receipt.` }); changed = true;
  }
  return changed;
}

/** Public text and the actual action resolve the same original choice. */
export function campaignStageText(game, definition, record, step) {
  const answers = step?.respondToThread ? game.state.narrative?.quests?.[step.respondToThread]?.choices : record?.choices;
  return step?.responses?.[answers?.[step.respondTo]] || step?.text || definition?.summary || '';
}

export function localAftermathFare(game, origin, definition) {
  const record = game.state.narrative?.quests?.departure_aftercare;
  if (game.state.systemId !== 'hearth' || origin?.id !== 'kettle' || record?.status !== 'active' || definition?.stages[record.stage]?.id !== 'trial' || game.hasFlag('thread:departure_aftercare_trial_complete')) return null;
  const worker = game.state.narrative.quests.fair_departure?.choices?.charter === 'care';
  return { aftermathId: 'departure_aftercare', targetBody: 'morrow', type: worker ? 'commuter' : 'patient', name: worker ? 'Tamsin Roe' : 'Eda Moss',
    text: worker ? 'Len’s reserved test booking: Tamsin needs to reach Morrow’s pump-maintenance shift. Complete this named fare at Morrow’s Passage desk.' : 'Len’s reserved test booking: Eda needs to reach her clinic appointment on Morrow. Complete this named fare at Morrow’s Passage desk.' };
}

export function isAftermathPassenger(passenger) {
  return passenger?.aftermathId === 'departure_aftercare' && passenger.id === `passenger:hearth:kettle:${passenger.serial}:aftercare` && passenger.originSystem === 'hearth' && passenger.originBody === 'kettle' && passenger.targetSystem === 'hearth' && passenger.targetBody === 'morrow' && ['patient', 'commuter'].includes(passenger.type);
}

/** What this captain can read on returning; never mutates a shared object. */
export function localCampaignObjectText(game, id) {
  const quests = game.state.narrative?.quests || {};
  if (id === 'clinic-case' && completed(game, 'cold_chain_aftercare')) return quests.cold_chain_aftercare.choices.support === 'rota'
    ? 'Beside your tested regulator record is a paid handover rota and a clear alarm card: keep the case powered, simulate the warning, acknowledge it, restore MONITOR. The next attendant has signed beneath a question of her own. Your captain’s Morrow infirmary agreement now covers 35% of the fee in total.'
    : 'Your tested regulator record now lists the labeled spare at Mara’s bench and the alarm test steps. The attendant has added the spare’s shelf location in her own handwriting. Your captain’s Morrow workshop agreement now covers 22% of hull repairs in total.';
  if (id === 'clinic-case' && completed(game, 'cold_chain')) return 'Your supply-repair tag is attached to the case. The sealed M-14 compartment passed its temperature and batch checks; the unlabelled compartment remains held for the clinic. A new handover note asks how to test the warning without warming the medicine. Mara wants to discuss it when you return.';
  if (id === 'passenger-slip' && completed(game, 'departure_aftercare')) return quests.departure_aftercare.choices.reserve === 'shared'
    ? 'Len has pinned your named passenger’s completed Kettle-to-Morrow receipt beside the rejected booking. Your dispatch terms now list an open-seat reserve: the two fare types outside your original charter receive 4 cr extra. The old rejection stays in the file so the next shift can see why the terms changed.'
    : 'Your named passenger’s completed receipt is filed beside the old rejection. The booking form now states your charter’s covered journeys before asking for a name. Your original eligible fare type receives 2 cr more; the other categories are clearly quoted at their ordinary rate.';
  if (id === 'freight-register' && completed(game, 'departure_aftercare')) return 'The 07:00 freight window and 07:15 passenger boarding remain on your corrected schedule. The revised dispatch agreement is attached beside them, with the completed named journey as its test record. An accepted fare keeps the quote written on its own ticket.';
  if (id === 'dome-recorder' && completed(game, 'signal_aftercare')) return quests.signal_aftercare.choices.record === 'consent'
    ? 'The corrected receiver carries your fresh 10:00-to-10:03 station-pulse test. Its public warning includes the clock evidence; consented journey records are kept separately for named reviewers. Earlier public or licensed copies remain in circulation. Your ordinary scanner uses the checked reference at 5 charge.'
    : 'The corrected receiver carries your fresh station-pulse test and instructions for repeating it. The public benchmark verifies warning time without identifying a passenger. Earlier public or licensed reports still exist. Your ordinary scanner uses this independently checked reference at 5 charge.';
  if (id === 'dome-recorder' && completed(game, 'clear_signal')) return 'Your ordinary weather receiver correction is recorded beside the dome’s older, stranger tapes. The clock now agrees with Kettle. Replies to the report ask who can check its evidence and who agreed to share the journey details. Ada has kept those replies for your next visit.';
  return null;
}

export function localAftermathTopic(game, contactId) {
  const q = game.state.narrative?.quests || {};
  if (contactId === 'mara-reed' && completed(game, 'cold_chain')) {
    const done = q.cold_chain_aftercare?.status === 'completed', spare = q.cold_chain_aftercare?.choices?.support === 'spares';
    if (q.cold_chain_aftercare?.status === 'active') return { id: 'mara-after-repair', label: 'How is the repair holding?', text: q.cold_chain_aftercare.choices?.support
      ? spare ? 'The spare is labeled and paid for in parts. Before I change your workshop terms, check the card against the medicine case and bring me that handover. I want the next attendant to find the same instructions at both ends.' : 'The handover time is funded. We still owe the next attendant a checked card beside the actual case. Bring that back before I file your new clinic terms. Paying for the rota was the beginning of the promise.'
      : q.cold_chain_aftercare.solved?.includes('alarm-test') ? 'The warning test passed without warming the case. Now we have to decide who answers the next call: a paid handover, or a spare the workshop can reach. I will not ask the attendant to guess again.' : 'The regulator still works. We are checking what the next attendant can understand without either of us beside her. Her note on the case and the pump-house alarm test should tell us what the handover missed.' };
    return { id: 'mara-after-repair', label: 'How is the repair holding?', text: done
      ? spare ? 'The spare is where both shifts can reach it. The new attendant labeled its shelf herself. I used to leave a finished machine and assume the handover was obvious. Your visit made me look at the person who inherits it.' : 'There is paid time for the handover now. The new attendant stayed and asked questions instead of pretending she knew the panel. The regulator mattered. So did making it safe for somebody to say she did not understand it.'
      : q.cold_chain.choices?.agreement === 'care' ? 'The regulator is holding, and your clinic agreement is in the book. The new attendant still needs a handover she can follow. Ask me about The Next Shift; I want you to see the note she left on the case.' : 'The regulator is holding. Your workshop agreement covers the hardware; the new attendant needs someone to explain the alarm. Ask me about The Next Shift. A part can be fixed while its handover is still broken.' };
  }
  if (contactId === 'len-vale' && completed(game, 'fair_departure')) {
    const done = q.departure_aftercare?.status === 'completed';
    if (q.departure_aftercare?.status === 'active') {
      const name = q.fair_departure.choices?.charter === 'care' ? 'Tamsin' : 'Eda';
      return { id: 'len-after-charter', label: 'Who is the charter working for?', text: game.hasFlag('thread:departure_aftercare_trial_complete')
        ? `${name} reached Morrow. That is the receipt I needed, with the same name as the rejected booking. Bring it through the follow-up report so I can approve the terms we agreed.`
        : q.departure_aftercare.choices?.reserve ? `${name} has a reserved booking at Kettle’s Passage desk. Carry that fare to Morrow and complete it at the destination desk. Your revised supplement is still pending; the test keeps its actual quoted fare.`
        : `${name} is still outside your original charter. We agreed to look at the rejected booking and hear Mara’s account before changing anything. A corrected timetable does not answer every question about who can use it.` };
    }
    return { id: 'len-after-charter', label: 'Who is the charter working for?', text: done
      ? q.departure_aftercare.choices?.reserve === 'shared' ? 'I keep the rejected booking beside the completed receipt. It reminds me that a spare berth and a usable passage are different promises. Your reserve is small, but the next passenger sees its actual terms before committing to a journey.' : 'Your charter still has a boundary. Now it is printed before the booking, where people can plan around it. I wanted a wider reserve. I also remember that you carried the person whose complaint started this.'
      : q.fair_departure.choices?.charter === 'care' ? 'The patient supplement works. Tamsin keeps Morrow’s pumps running and does not qualify for it. She asked me why. Ask about The People in the Margin; I kept her booking instead of filing the complaint away.' : q.fair_departure.choices?.charter === 'courier' ? 'Silas pays the courier reserve exactly as agreed. Eda’s clinic journey is outside it. That is a decision we made, not a fault in the timetable. Ask about The People in the Margin if you are ready to look at it.' : 'The shift-worker reserve works. Eda needs a clinic appointment, so the form excludes her. Ask about The People in the Margin; I would like the next passenger to understand that boundary before reaching the airlock.' };
  }
  if (contactId === 'ada-finch' && completed(game, 'clear_signal')) {
    const done = q.signal_aftercare?.status === 'completed';
    if (q.signal_aftercare?.status === 'active') return { id: 'ada-after-report', label: 'What happened after the report?', text: q.signal_aftercare.solved?.includes('verification')
      ? 'Your fresh station reference and the recorder agree. Bring me that verified record for the handover. The next watch needs the instructions with the answer; the old report remains part of what happened.'
      : q.signal_aftercare.choices?.record === 'consent' ? 'The consent register is funded. Its private journey records still need to be kept apart from the public warning. Finish the independent flight check and the recorder comparison before we put this procedure into use.'
      : q.signal_aftercare.choices?.record === 'station' ? 'We chose a public station benchmark. The flight reading and recorder comparison must show that it works without a passenger’s name. A simpler source is only useful if the next observer can check it.'
      : 'We are looking at the replies now. Len can show us what the next watch can check for itself. I want that answer before choosing how we record the next warning; the first report will stay in the record.' };
    return { id: 'ada-after-report', label: 'What happened after the report?', text: done
      ? q.signal_aftercare.choices?.record === 'consent' ? 'The next observer asked whose permission the record needed. I put that question on the form. The public clock test and the consented journey receipts now have separate purposes. Earlier copies still exist; we can be more careful with what we ask people to share next.' : 'Someone from the next watch repeated the station test without asking me to explain it. That is how I know the instructions are useful. The new warning proves its clock, not a passenger’s private life. It leaves the older report in the record where it belongs.'
      : q.clear_signal.choices?.publication === 'open' ? 'One of the passengers recognized their journey in the appendix. Existing copies cannot be recalled. Ask about A Warning People Can Use; we need a way to verify future warnings without publishing another person’s movements.' : q.clear_signal.choices?.publication === 'licensed' ? 'The next watch was quoted a fee for the evidence. Silas owns the licensed copy; we cannot pretend otherwise. Ask about A Warning People Can Use. A fresh public reference can give them a way to check the clock.' : 'The names stayed private. The next watch could not check the anonymous source without coming to me. Ask about A Warning People Can Use; I want a verification procedure that survives whoever happens to be on duty.' };
  }
  return null;
}
