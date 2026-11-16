/** Return visits to the three Hearth campaigns. All records are the captain's;
 * existing people, objects and services are reused without changing geography. */
export const LOCAL_AFTERMATH_IDS = Object.freeze(['cold_chain_aftercare', 'departure_aftercare', 'signal_aftercare']);
const choices = (ids, labels = ids) => ids.map((id, i) => ({ id, label: labels[i] }));
const input = (id, label, ids, labels) => ({ id, label, options: choices(ids, labels) });
const option = (id, label, detail, effects, cost = {}) => ({ id, label, detail, effects, cost });

export function buildLocalAftermaths(at) {
  const stage = (id, title, kind, target, text, objective, extra = {}) => ({ id, title, kind, at: at(target), text, objective, ...extra });
  const talk = (id, title, target, text, objective, extra = {}) => stage(id, title, 'talk', target, text, objective, { actionLabel: 'Discuss this step', ...extra });
  const inspect = (id, title, target, text, objective, extra = {}) => stage(id, title, 'inspect', target, text, objective, { actionLabel: 'Record what you find', ...extra });
  const puzzle = (id, title, target, text, objective, challenge, extra = {}) => stage(id, title, 'puzzle', target, text, objective, { actionLabel: 'Check and record the result', puzzle: challenge, ...extra });
  const choose = (id, title, target, text, objective, values) => stage(id, title, 'choice', target, text, objective, { options: values });
  const followup = (id, original, title, focus, offeredBy, summary, reward, stages) => ({
    id, title, category: 'Hearth aftermath', offeredBy, requires: { completed: [original] }, remoteAccept: false,
    localCampaign: { focus, scope: 'Hearth · return visit · no fold drive required', aftermathOf: original }, summary, reward, stages,
  });
  return [
    followup('cold_chain_aftercare', 'cold_chain', 'The Next Shift', 'Repair & responsibility', 'mara-reed',
      'The regulator still works. The next shift needs to understand its alarm and know who owns the handover. Return to Mara, test the warning circuit, and leave support somebody can actually use.', 90, [
        talk('return', 'A repair after you leave', 'mara-reed',
          'Mara has kept your repair card. “The regulator is holding. The night attendant unplugged the alarm because nobody showed her how to test it. She was afraid of throwing away a good batch. Help me leave the next person more than a signature.”',
          'Return to Mara Reed on Morrow to discuss the repair’s next shift.', { respondToThread: 'cold_chain', respondTo: 'agreement', responses: {
            care: 'Mara has your clinic agreement beside the handover book. “You backed the people doing the night work. They still need someone to explain the alarm. The regulator is holding; the new attendant unplugged its warning because nobody showed her how to test it.” She asks you to check what the next shift actually inherited.',
            workshop: 'Mara taps the maintenance agreement you chose. “You paid attention to what breaks. Here is what happens after it is fixed: a new attendant finds an unfamiliar alarm and no one to ask.” The regulator is holding. She wants you to test the warning circuit and leave a usable handover.',
          } }),
        inspect('handover-log', 'What the attendant was handed', 'clinic-case',
          'The case stayed at 5 degrees. A handwritten note says: “Alarm disconnected, not broken. I could not tell whether TEST would warm the medicine.” The repair card describes the regulator but says nothing about the alarm’s separate test input. Mara has crossed out the attendant’s apology.',
          'Read the handover note on the Unmarked medicine case on Morrow.'),
        puzzle('alarm-test', 'Test the warning without warming the case', 'orchard-valves',
          'The pump-house panel has a separate alarm simulation. It can exercise the warning while the medicine case keeps its steady supply. The attendant’s concern was reasonable: two switches share an old label. Leave both the test result and the correct switch names.',
          'At the Outer-orchard valve manifold, complete the warning-circuit test.', {
            type: 'sequence', title: 'Alarm test and handover', prompt: 'The medicine case must stay powered throughout this test.',
            clues: ['Keep the case supply ON before testing its separate warning input.', 'Use SIMULATE to raise the warning, then confirm that ACKNOWLEDGE quiets it.', 'Restore the alarm to MONITOR before leaving the panel.'],
            inputs: [0, 1, 2, 3].map(i => input(`step-${i}`, `Step ${i + 1}`, ['supply', 'simulate', 'acknowledge', 'monitor'], ['Keep case supply on', 'Simulate alarm input', 'Acknowledge the warning', 'Restore monitoring'])),
            solution: ['supply', 'simulate', 'acknowledge', 'monitor'],
          }),
        choose('support', 'Who will answer the next call?', 'mara-reed',
          'Mara offers two additions to your support agreement. A paid handover rota gives the next attendant a named person to call. A labeled spare regulator gives the workshop a replacement it can fit without waiting for your ship. Neither option rewrites the town’s water rights or another captain’s agreement.',
          'Meet Mara and fund either the handover rota or a spare regulator kit.', [
            option('rota', 'Fund paid handovers · 45 cr', 'Spend 45 cr. After verification and handover, your Morrow infirmary discount is 35% total. Any existing hull-repair agreement stays unchanged.',
              { trust: { 'mara-reed': 3 }, rep: { freewake: 3, lantern: 2 }, flags: ['clinic_paid_handovers'], memory: 'You funded paid handovers so the next clinic attendant has a named person to ask.' }, { credits: 45 }),
            option('spares', 'Leave a labeled spare regulator · 3 ore', 'Your own supply ship must be docked at Morrow. Spend 3 ore. After verification and handover, your Morrow hull-repair discount is 22% total. Any existing infirmary agreement stays unchanged.',
              { trust: { 'mara-reed': 2 }, rep: { freewake: 2, meridian: 2 }, flags: ['clinic_spare_regulator'], memory: 'You left a labeled spare regulator and a tested replacement card at Mara’s bench.' }, { ore: 3 }),
          ]),
        inspect('check-handover', 'A test somebody else can repeat', 'clinic-case',
          'The alarm card now names each switch and states that the case stays powered. You compare its final MONITOR setting with the panel record and leave a signed copy at the case. The sealed compartment is still at 5 degrees. The attendant has added her own question in the margin, without an apology.',
          'Return to the medicine case and verify that the monitoring and handover records match.', { respondTo: 'support', responses: {
            rota: 'The paid rota names a relief attendant and a number to call. The alarm card keeps the case supply on, and the panel record ends at MONITOR. You check the case’s 5-degree reading and sign the handover. There is now time on the rota for the next person’s questions.',
            spares: 'The spare regulator’s bag has the same part number as the tested unit. Its replacement card keeps the medicine case powered until the auxiliary supply is isolated. You check the 5-degree reading and sign the handover. The attendant has written where the spare is kept.',
          } }),
        talk('handover', 'Leave the questions in the book', 'mara-reed',
          'Mara turns the book toward the next shift. “A repair is allowed to need questions. People are allowed to be paid while they learn the answer.” She keeps your original agreement and files the addition you funded.',
          'Return to Mara with the verified handover card.', { respondTo: 'support', responses: {
            rota: 'Mara has put the handover time on the paid rota. “She stayed and asked three questions. Last week she would have tried to guess.” Your Morrow infirmary agreement now covers 35% of the fee in total. Your existing hull-repair terms, if any, stay in place.',
            spares: 'Mara puts the tested spare where both shifts can reach it. “She asked to label the second bag herself.” Your Morrow workshop agreement now covers 22% of hull repairs in total. Your existing infirmary terms, if any, stay in place.',
          } }),
      ]),
    followup('departure_aftercare', 'fair_departure', 'The People in the Margin', 'Passage & access', 'len-vale',
      'Your charter is working for the people it covers. Len asks about a passenger it leaves out. Check the rejected booking, hear the clinic’s account, and test a named journey before revising your dispatch agreement.', 110, [
        talk('return', 'The fare your charter did not cover', 'len-vale',
          'Len has kept the corrected timetable. A rejected booking lies beside it. “The ships arrive. That part worked. I need you to look at the person we still could not fit into your agreement.”',
          'Return to Len Vale at Kettle and ask who your charter leaves out.', { respondToThread: 'fair_departure', respondTo: 'charter', responses: {
            care: 'Len taps a note from Tamsin Roe, who keeps Morrow’s pumps running on the night shift. “Your patient reserve is doing its job. Tamsin is travelling to work, so it does not cover her. She asked why helping keep the clinic’s water on did not count.” The corrected timetable is still working; its funding boundary is the problem.',
            commute: 'Len puts Eda Moss’s rejected booking beside the worker rota. “Your shift reserve is working. Eda needs a clinic appointment, not a shift. We told her the ship had room, then told her your agreement did not cover her.” He wants the fallback written before the next person is turned away.',
            courier: 'Len unfolds Eda Moss’s rejected clinic booking. “Silas’s courier reserve pays exactly what it promised. Eda is not carrying a parcel.” Silas has fulfilled his contract. Len asks whether you want your dispatch agreement to stop there.',
          } }),
        inspect('rejected-booking', 'Read the reason in the margin', 'passenger-slip',
          'The rejected booking is dated after your charter began. A seat was available, but the dispatch supplement covered another kind of journey. The passenger was not told this until reaching the desk. Len has written: “Give the reason before asking somebody to pack.”',
          'Read the rejected booking on the Uncollected passage slip at Kettle.'),
        talk('clinic-account', 'A journey crosses several budgets', 'mara-reed',
          'Mara lays a clinic appointment beside a pump-maintenance rota. “Someone travels here to be treated. Someone else travels here to keep the water running. A dispatch form only gives them one box.” She asks for honest terms and a small reserve for the journeys that fall between them.',
          'Ask Mara Reed on Morrow how the missing passage affects the clinic.'),
        choose('reserve', 'Make the boundary explicit', 'len-vale',
          'Len can add a small open-seat reserve to your dispatch agreement, or keep its original scope and pay you a little more for reliable, clearly advertised service. Both versions must survive a real test journey. The test passenger pays the existing quoted fare; the revised terms begin only after approval.',
          'Return to Len at Kettle and choose how your dispatch agreement handles the gap.', [
            option('shared', 'Add an open-seat reserve · 30 cr', 'Spend 30 cr. After the test and approval, your two previously uncovered Hearth fare types receive +4 cr each. Your original charter supplement stays the same.',
              { trust: { 'len-vale': 3, 'mara-reed': 2 }, rep: { freewake: 3 }, flags: ['departure_open_reserve'], memory: 'You added a small open-seat reserve to your own Hearth dispatch agreement.' }, { credits: 30 }),
            option('clear', 'Keep a narrow charter with clear terms', 'No contribution. After the test and approval, the original charter’s eligible fare type earns +2 cr more. Other fare types keep their ordinary quote; the desk says so before booking.',
              { trust: { 'len-vale': 1, 'silas-voss': 2 }, rep: { meridian: 2 }, flags: ['departure_clear_terms'], memory: 'You kept your original charter’s scope and required its limits to be stated before booking.' }),
          ]),
        stage('trial', 'Carry the passenger behind the form', 'passage-proof', 'len-vale',
          'A named booking is reserved at Kettle’s Passage desk for a trip to Morrow. Take that fare in your own ship, bring the passenger to Morrow’s Passage desk, and complete the booking there. An older or unrelated receipt cannot stand in for this passenger.',
          'Carry the reserved Kettle-to-Morrow passenger, complete the booking at Morrow’s Passage desk, then return to Len.', { actionLabel: 'Show Len the named passenger’s receipt', proofFlag: 'departure_aftercare_trial_complete',
            proofReason: 'Complete the reserved Kettle-to-Morrow booking from Kettle’s Passage desk. This follow-up needs that passenger’s actual delivery receipt.' }),
        talk('approval', 'One name outside the categories', 'len-vale',
          'Len matches the name on the completed receipt to the rejected booking. The timetable has carried the person who started the complaint. He files your revised terms where the next passenger can read them before committing.',
          'Return to Len at Kettle with the reserved passenger’s completed receipt.', { respondTo: 'reserve', responses: {
            shared: 'Len puts the completed receipt beside the rejected booking. “Same person. Different answer at the desk.” Your open-seat reserve is approved: new Hearth fares outside your original charter receive +4 cr. Your original supplement stays unchanged. Mara has added your passenger’s arrival to her book.',
            clear: 'Len pins up the charter’s limits before the booking form. “I would have liked a wider reserve. I will settle for nobody finding out at the airlock.” Your original charter’s eligible Hearth fares now pay +2 cr more. Other fare types keep their normal quote. The named test passenger reached Morrow on the terms you actually offered.',
          } }),
      ]),
    followup('signal_aftercare', 'clear_signal', 'A Warning People Can Use', 'Evidence & consent', 'ada-finch',
      'The clock is fixed. Now the people using the report have a question about its evidence and access. Revisit the consequences of your publication choice, collect an independent flight check, and leave a warning procedure others can verify.', 120, [
        talk('return', 'What followed the correction', 'ada-finch',
          'Ada keeps the corrected clock beside a stack of replies. “The reading was right. We should look at what happened when other people tried to use it.”',
          'Return to Ada Finch on Morrow to review how your report was used.', { respondToThread: 'clear_signal', respondTo: 'publication', responses: {
            open: 'Ada has a reply from a passenger whose journey appeared in your public appendix. “The clock was wrong. Their journey was not public business.” Existing copies cannot be recalled. She asks you to help make future warnings verifiable without publishing another passenger’s movements.',
            redacted: 'Ada has a careful question from the next watch: the public times are correct, but its anonymous trip numbers cannot be checked against a source they can access. “We protected the names. Now we need a verification route that does not make me the only person anyone can trust.”',
            licensed: 'Ada shows you a request that Silas’s office returned with a license price. “Your correction works. The next watch cannot afford to check the evidence behind it.” The licensed originals remain his. She wants to collect a new reference that ordinary crews can use without buying that report.',
          } }),
        inspect('used-report', 'A correction beside a person’s journey', 'passenger-slip',
          'Len’s dispatch copy separates the corrected warning time from the passenger’s name. A new annotation asks who may check the underlying event. A public timestamp is useful; a personal travel record needs a separate reason to be shared.',
          'Read the report annotation on Kettle’s Uncollected passage slip.'),
        talk('dispatch-check', 'What the next watch can actually check', 'len-vale',
          'Len offers a clock pulse from the berth controller. It identifies the station and time, not a passenger. He can also keep consented journey receipts behind the desk for a named reviewer. “Give the next watch a procedure, not a request to believe whichever one of us is on duty.”',
          'Speak to Len Vale at Kettle about independent verification.'),
        choose('record', 'Choose a source for future warnings', 'ada-finch',
          'Both methods use fresh evidence and retain your original correction. A consent register can verify the full journey while limiting who sees it; a public station benchmark verifies the clock alone. Neither option erases copies of an earlier report or rewrites Silas’s existing license.',
          'Return to Ada and choose the evidence future warnings will carry.', [
            option('consent', 'Fund a consent register · 20 cr', 'Spend 20 cr. Named reviewers can check only the journeys their passengers agree to share. The public warning carries the correction and its station reference, without passenger names.',
              { trust: { 'ada-finch': 3, 'len-vale': 2 }, rep: { lantern: 3, freewake: 2 }, flags: ['signal_consent_register'], memory: 'You funded a consent register for new journey evidence instead of treating publication as permission.' }, { credits: 20 }),
            option('station', 'Use a public station benchmark', 'No fee. Publish a fresh station-clock reference that anyone can repeat. It verifies the warning time without proving a particular passenger’s journey.',
              { trust: { 'ada-finch': 2, 'len-vale': 1 }, rep: { lantern: 2, freewake: 2 }, flags: ['signal_station_reference'], memory: 'You established a new public station-clock reference without using personal journey records.' }),
          ]),
        { id: 'independent-reading', title: 'Check from the other approach', kind: 'ship-scan', at: { systemId: 'hearth', x: 1350, y: 120, label: 'Independent Hearth timing point' }, scanEnergy: 6,
          text: 'Len’s new pulse is measured at a second safe position in Hearth. Take your actual ship to the marked point and record it from the helm. This costs 6 reactor charge. The reading establishes a fresh check; it does not change the report already distributed.',
          objective: 'Launch into Hearth, reach the Independent Hearth timing point, and take a reference reading from the helm.', actionLabel: 'Take the independent reading · 6 charge',
          locationReason: 'Take the helm of your ship in Hearth to collect the independent reading.', distanceReason: 'Fly within scanner range of the Independent Hearth timing point.' },
        puzzle('verification', 'Leave a test the next watch can repeat', 'dome-recorder',
          'The berth pulse left at 10:00. Your independent reading arrived at 10:03; Northwatch’s corrected clock recorded the same event at 10:03. The warning can cite a station, a departure time and a measured delay without publishing a passenger’s name.',
          'At the Northwatch shift recorder, verify the fresh station reference.', {
            type: 'evidence', title: 'A reproducible warning record', prompt: 'Record the measured delay and the evidence the public warning actually needs.',
            clues: ['Pulse departure: 10:00. Independent arrival and corrected receiver: 10:03.', 'The station reference identifies the test without naming a passenger.', 'A matching clock record does not establish the contents of a person’s journey.'],
            inputs: [input('delay', 'Measured delay', ['0', '3', '10'], ['0 minutes', '3 minutes', '10 minutes']), input('public-record', 'Public warning source', ['station', 'names', 'license'], ['Station and pulse timestamps', 'Full passenger names', 'Existing licensed appendix']), input('claim', 'What the test establishes', ['clock', 'journey'], ['The warning clock agrees', 'Every passenger record is proven'])],
            solution: ['3', 'station', 'clock'],
          }),
        talk('handover', 'An answer that survives your departure', 'ada-finch',
          'Ada has the next watch repeat the calculation from your fresh reading. They reach the same answer without asking her to translate it. Your ordinary scanner can now use the checked reference with 5 charge; story transmissions still need their own equipment and power.',
          'Return to Ada with the independently verified warning record.', { respondTo: 'record', responses: {
            consent: 'Ada files the consented receipts apart from the public warning. “The next observer asked whose permission she needed. That is the question I wanted on the form.” Your checked reference brings ordinary scans to 5 charge. Your original publication remains part of the record; new warnings use the consent procedure you funded.',
            station: 'Ada pins the station-pulse procedure beside the receiver. “The next observer checked it without asking me. I am trying to get used to how pleased that makes me.” Your verified reference brings ordinary scans to 5 charge. Future warnings can be checked without passenger records; earlier published or licensed copies still exist.',
          } }),
      ]),
  ];
}

export function localAftermathConsequence(id, answers = {}) {
  if (id === 'cold_chain_aftercare') return answers.support === 'rota'
    ? 'You verified the alarm handover and funded paid cover. Your Morrow infirmary discount is 35% total; any original hull-repair agreement remains.'
    : answers.support === 'spares' ? 'You verified the alarm handover and left a labeled spare. Your Morrow hull-repair discount is 22% total; any original infirmary agreement remains.' : null;
  if (id === 'departure_aftercare') return answers.reserve === 'shared'
    ? 'The named passenger reached Morrow. New Hearth fares outside your original charter receive +4 cr; its original supplement remains unchanged.'
    : answers.reserve === 'clear' ? 'The named passenger reached Morrow and your limits are posted before booking. Your original charter’s eligible Hearth fares pay +2 cr more; other types retain their normal quote.' : null;
  if (id === 'signal_aftercare') return answers.record === 'consent'
    ? 'Future warnings use a checked station reference and a separate consent register. Earlier reports still exist. Ordinary scans now use 5 charge; story requirements remain.'
    : answers.record === 'station' ? 'Future warnings use a public station benchmark without passenger records. Earlier reports still exist. Ordinary scans now use 5 charge; story requirements remain.' : null;
  return null;
}
