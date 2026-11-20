// Authored story data for SUNCOAST. Choices rejoin the same playable route;
// their cash, reputation, flags, and heat remain in the saved world.
export const PROTAGONIST = {
  name: 'Lucía Reyes',
  age: 32,
  bio: 'Cuban. Mechanic. Recovery driver. Back in Bahía Lucero with a borrowed room, a useful set of hands, and no intention of letting someone else choose her life.',
  background: 'Lucía moved from Havana at nineteen. She knows engines, remembers favors, and has a dry answer for almost everything. Coming home was supposed to be temporary. Then the city started putting a price on everyone she knew.',
};

export const CONTACTS = {
  ines: { name: 'Inés Reyes', role: 'Aunt · Café Inés', color: '#f1bc73' },
  tomi: { name: 'Tomás “Tomi” Ramos', role: 'Mechanic · Santa Elena', color: '#70d6c4' },
  nadia: { name: 'Nadia Baptiste', role: 'Reporter · Radio Lucero', color: '#87c3ec' },
  voss: { name: 'Adrian Voss', role: 'Fixer · Cayo Espejo', color: '#dca5e2' },
  ward: { name: 'Celia Ward', role: 'Developer · Suncoast Group', color: '#f0a091' },
  lucia: { name: 'Lucía Reyes', role: 'Your life. Your decisions.', color: '#efca79' },
};

export const ARCS = [
  { id: 1, title: 'People who know your name', island: 'Santa Elena', description: 'A delivery, a stack of seizure notices, and a neighborhood being quietly sold.' },
  { id: 2, title: 'The view costs extra', island: 'Cayo Espejo', description: 'Hotel money, nightclub favors, and the people who decide which doors open.' },
  { id: 3, title: 'Who gets to stay', island: 'Puerto Umbral', description: 'The port holds the proof. What you do with it will decide whose city this becomes.' },
];

export const MISSIONS = [
  {
    id: 'first_favor', title: 'Before the Coffee Gets Cold', arc: 1, contact: 'ines', location: 'cafe', requires: [], reward: 180,
    description: 'Your first day home. Inés needs a cooler of medicine taken to the clinic, and Tomi has a vehicle you can borrow. Learn the neighborhood before it asks more of you.',
    steps: [
      { type: 'enter', location: 'cafe', text: 'Go inside Café Inés.', hint: 'Walk to the marked door, then use Interact. On a keyboard, press E. You can enter every named building.', dialogue: [{ speaker: 'Lucía', text: 'Six hours back in town. Already running errands. Qué maravilla.' }] },
      { type: 'interact', location: 'cafe', text: 'Talk to Inés at the counter and collect the cooler.', hint: 'Move to the gold marker inside, then use Interact. The next destination will appear automatically.', dialogue: [{ speaker: 'Inés', text: 'Café first. Then the clinic. The medicine is packed cold, so nobody needs you racing.' }, { speaker: 'Lucía', text: 'Dale. And the car?' }, { speaker: 'Inés', text: 'Tomi left you a loaner outside his garage. Bring yourself back in one piece.' }] },
      { type: 'go', location: 'garage', text: 'Leave the café and walk to Tomi’s Garage.', hint: 'Use Interact at the exit door. Follow the gold destination marker; open the map if you want the whole route.' },
      { type: 'drive', location: 'garage', text: 'Get into a road vehicle outside the garage.', hint: 'Stand beside a parked vehicle and use Interact. Your loaner is legal to use. Taking someone else’s car can attract witnesses.', dialogue: [{ speaker: 'Tomi', text: 'It runs. It stops. The radio has opinions. I call that a complete vehicle.' }] },
      { type: 'go', location: 'clinic', text: 'Drive the cooler to Harbor Clinic.', hint: 'Keyboard: W accelerates, S reverses, A/D steer, Space brakes. On touch, point the left stick where you want to drive. Slow down before turning.' },
      { type: 'enter', location: 'clinic', text: 'Park, get out, and enter the clinic.', hint: 'Stop near the marked door. Use Interact to get out, then walk to the door and use it again. Vehicles stay where you leave them.' },
      { type: 'interact', location: 'clinic', text: 'Give the cooler to the clinic staff.', hint: 'Go to the interior marker and use Interact. You can return here for treatment later.', dialogue: [{ speaker: 'Clinic staff', text: 'Insulin made it. Thank you. There is a delivery fee, if you need it. And please tell Inés her coffee is still terrible.' }, { speaker: 'Lucía', text: 'I’m brave. I’m not that brave.' }] },
      { type: 'choice', location: 'clinic', text: 'Decide what to do with the clinic’s delivery fee.', hint: 'Choices tell you their immediate tradeoff. Making an honest living is a valid path.', choices: [
        { id: 'take_fee', label: 'Take the $120 delivery fee', detail: 'Earn $120. You did the work; the clinic budgeted for it.', result: 'You accept the fee. The nurse thanks you for arriving carefully, and Inés is relieved you are working again.', cash: 120, flag: 'first_fee_taken' },
        { id: 'leave_fee', label: 'Leave the fee with the clinic', detail: 'Gain 2 community reputation. Your standard mission payment is still yours.', result: 'The clinic puts the fee toward someone else’s prescription. Word travels quickly on Santa Elena.', rep: { community: 2 }, flag: 'clinic_favor' },
      ] },
      { type: 'return', location: 'home', text: 'Head home. Your first job is done.', hint: 'Your progress saves as you play. Home is a safe place to stop. After this job, open the phone to choose the next story or take a paid side job.', dialogue: [{ speaker: 'Inés', text: 'Bienvenida a casa, Lucía. Welcome home. There is something else you should see: three more buildings got eviction notices this morning.' }] },
    ],
  },
  {
    id: 'paper_trail', title: 'Paper Doors', arc: 1, contact: 'nadia', location: 'market', requires: ['first_favor'], reward: 240,
    description: 'Nadia thinks the seizure notices are connected. The depot keeps the public register—and a second ledger nobody wants discussed.',
    steps: [
      { type: 'enter', location: 'depot', text: 'Enter the Santa Elena depot.', hint: 'Named buildings have marked doors. You can leave your vehicle outside.', dialogue: [{ speaker: 'Nadia', text: 'A storm closes two bridges. Then the same company buys everything behind the barriers. That is either remarkable luck or a story.' }] },
      { type: 'interact', location: 'depot', text: 'Ask for the property-seizure records.', hint: 'The public register is legal to request. Taking the private ledger is a different decision.', dialogue: [{ speaker: 'Depot clerk', text: 'The public list is on the counter. The other book belongs to management. I would remember anyone who walked off with it.' }, { speaker: 'Lucía', text: 'Good. I prefer to know when I’m memorable.' }] },
      { type: 'choice', text: 'Choose which paper trail to follow.', choices: [
        { id: 'public_register', label: 'Request a copy of the public register', detail: 'Gain 2 truth and 1 community reputation. No police heat.', result: 'A clean copy, a dated receipt, and a clerk willing to confirm it. Nadia can work with this.', rep: { truth: 2, community: 1 }, flag: 'public_register' },
        { id: 'private_ledger', label: 'Take the private ledger for Voss', detail: 'Earn $320 and gain 2 underworld reputation. The clerk reports the theft: 2 stars.', result: 'Voss pays for the names in the margins. The clerk makes a call. Police now know what happened here.', cash: 320, rep: { underworld: 2 }, wanted: 2, flag: 'private_ledger' },
      ] },
      { type: 'escape', text: 'Make sure the police are no longer looking for you.', hint: 'If you have stars, leave the last place police saw you. Break their line of sight, then stay out of sight until the search clears. You can also surrender.' },
      { type: 'return', location: 'market', text: 'Bring what you learned back to the market.', hint: 'The gold marker shows Nadia’s meeting point. Your choices have already changed who trusts you.', dialogue: [{ speaker: 'Nadia', text: 'Every notice has the same emergency authorization. Suncoast Group did not just buy the land. Someone cleared the way for them.' }] },
    ],
  },
  {
    id: 'borrowed_wheels', title: 'Borrowed Wheels', arc: 1, contact: 'tomi', location: 'garage', requires: ['paper_trail'], reward: 320,
    description: 'Tomi’s customers cannot work because their vehicles keep getting seized. Run the release papers to the depot, collect the keys, and bring them back through the neighborhood—your way.',
    steps: [
      { type: 'drive', location: 'garage', text: 'Get a road vehicle for the trip to the depot.', hint: 'Any road vehicle will do. Small cars turn easily, trucks absorb more damage, and motorcycles trade protection for speed.', dialogue: [{ speaker: 'Tomi', text: 'A work van is not a luxury. No van, no job. No job, no rent. You see where they are going with this?' }] },
      { type: 'go', location: 'depot', text: 'Drive to the depot with Tomi’s release paperwork.', hint: 'Use the roads and brake for corners. A damaged vehicle can be repaired at the garage.' },
      { type: 'choice', text: 'Decide how the drivers get their vehicles back.', choices: [
        { id: 'appeal', label: 'File the documented appeal', detail: 'Gain 2 community and 1 truth reputation. Keep the release legal.', result: 'The dates do not match. The clerk authorizes the releases, and the drivers know who did the legwork.', rep: { community: 2, truth: 1 }, flag: 'drivers_appeal' },
        { id: 'voss_release', label: 'Use Voss’s off-book release', detail: 'Earn $250 and gain 2 underworld reputation. A supervisor reports the arrangement: 2 stars.', result: 'The release is fast and the paperwork is dirty. Voss remembers the favor. So does the supervisor who called it in.', cash: 250, rep: { underworld: 2 }, wanted: 2, flag: 'voss_release' },
      ] },
      { type: 'go', location: 'market', text: 'Bring the released keys to the drivers at the market.', hint: 'There is a road south from the depot. If police saw the handoff, take care on the drive. You can break sight behind buildings.', dialogue: [{ speaker: 'Market driver', text: 'My keys. I can actually work tomorrow. Tell Tomi I owe him dinner.' }] },
      { type: 'escape', text: 'Clear any police search before heading back to Tomi.', hint: 'At low wanted levels, surrender is another way out. Arrest costs money and confiscates equipment, but it does not erase completed stories.' },
      { type: 'return', location: 'garage', text: 'Return to Tomi’s Garage.', hint: 'Bring a damaged vehicle close to the garage if you want repairs after the job.', dialogue: [{ speaker: 'Tomi', text: 'The drivers have their keys. That matters. Just remember: a favor can become a bill with no number on it.' }] },
    ],
  },
  {
    id: 'open_water', title: 'Open Water', arc: 1, contact: 'nadia', location: 'radio', requires: ['borrowed_wheels'], reward: 600, unlockIsland: 1,
    description: 'The storm inspection says the west crossing is safe. The closure order says otherwise. Find the signed report at the docks and decide who gets to announce it.',
    steps: [
      { type: 'enter', location: 'radio', text: 'Meet Nadia inside Radio Lucero.', hint: 'This job opens Cayo Espejo. Puerto Umbral will stay restricted until a later investigation.', dialogue: [{ speaker: 'Nadia', text: 'The bridge passed inspection four days ago. Someone buried the report and kept the emergency cordon.' }] },
      { type: 'interact', location: 'radio', text: 'Get the inspection number from Nadia.', hint: 'The report is at the docks on this island. There is no reason to cross the restriction yet.' },
      { type: 'go', location: 'docks', text: 'Head to the Santa Elena docks.', hint: 'Boats let you explore the channels, but reaching restricted land early still brings a six-star response.' },
      { type: 'enter', location: 'docks', text: 'Enter the dock office.', hint: 'The dock office holds the original signed inspection.' },
      { type: 'interact', location: 'docks', text: 'Collect the signed bridge inspection.', hint: 'A signature and a date turn a rumor into something the city has to answer.', dialogue: [{ speaker: 'Dock engineer', text: 'My bridge is safe. My signature is real. Whoever hid this can explain themselves on the evening news.' }] },
      { type: 'choice', text: 'Choose how to get the crossing reopened.', choices: [
        { id: 'broadcast_report', label: 'Let Nadia broadcast the full report', detail: 'Gain 3 truth and 1 community reputation. Cayo Espejo opens.', result: 'The report goes live. Residents demand answers, and the city lifts the Cayo Espejo cordon. One crossing is open. Puerto Umbral remains restricted.', rep: { truth: 3, community: 1 }, flag: 'bridge_public' },
        { id: 'broker_opening', label: 'Let Voss broker a quiet reopening', detail: 'Earn $350 and gain 3 underworld reputation. Cayo Espejo opens.', result: 'Voss trades the report for a reopened crossing and a useful contact at city hall. Cayo Espejo is open. Puerto Umbral remains restricted.', cash: 350, rep: { underworld: 3 }, flag: 'bridge_brokered' },
      ] },
    ],
  },
  {
    id: 'blue_hour', title: 'Blue Hour', arc: 2, contact: 'voss', location: 'club', requires: ['open_water'], reward: 420,
    description: 'Across the bridge, the city sells a better version of itself. Voss wants a hotel contract collected from Club Mirador. Inés recognizes the name of the building being sold.',
    steps: [
      { type: 'drive', location: 'garage', text: 'Find a road vehicle for Cayo Espejo.', hint: 'The west bridge is open now. Use the map to check where the remaining restriction begins.' },
      { type: 'go', location: 'club', text: 'Drive to Club Mirador on Cayo Espejo.', hint: 'The next island has its own streets, buildings, and vehicles. Your home and earlier services remain available.', dialogue: [{ speaker: 'Voss', text: 'Welcome to the view. Everything looks affordable from the right balcony.' }, { speaker: 'Lucía', text: 'Whose balcony?' }] },
      { type: 'enter', location: 'club', text: 'Go inside Club Mirador.', hint: 'Look for the marked door. You can explore inside before approaching the contact.' },
      { type: 'interact', location: 'club', text: 'Collect the hotel redevelopment contract.', hint: 'Contracts connect the neighborhood seizures to the money across the water.', dialogue: [{ speaker: 'Voss', text: 'Deliver it sealed and there is a tip. Let Nadia copy it and you might get a thank-you on the radio. Your evening, your decision.' }] },
      { type: 'choice', text: 'Choose what travels with the contract.', choices: [
        { id: 'copy_contract', label: 'Make a copy for Nadia', detail: 'Gain 2 truth and 1 community reputation. Keep the hotel delivery on schedule.', result: 'Nadia gets a copy. Voss gets his delivery. He notices the delay, and understands what it means.', rep: { truth: 2, community: 1 }, flag: 'hotel_copy' },
        { id: 'sealed_contract', label: 'Keep Voss’s delivery private', detail: 'Earn a $400 tip and gain 2 underworld reputation.', result: 'You deliver on the terms you accepted. Voss starts treating you as someone he can hire for more than errands.', cash: 400, rep: { underworld: 2 }, flag: 'voss_confidence' },
      ] },
      { type: 'return', location: 'hotel', text: 'Deliver the contract to Hotel Mar Azul.', hint: 'Reach the hotel entrance to finish the delivery.', dialogue: [{ speaker: 'Inés', text: 'The name on that contract? That was where your mother worked her first year here. This is not an empty city, mija.' }] },
    ],
  },
  {
    id: 'the_guest_list', title: 'The Guest List', arc: 2, contact: 'nadia', location: 'hotel', requires: ['blue_hour'], reward: 500,
    description: 'Public officials keep meeting Suncoast representatives at the hotel. Compare the meeting schedule with the property records before someone explains it all away.',
    steps: [
      { type: 'enter', location: 'hotel', text: 'Enter Hotel Mar Azul.', hint: 'This is a records job. You do not have to hurt anyone to finish it.' },
      { type: 'interact', location: 'hotel', text: 'Speak to the hotel staff about the meeting schedule.', hint: 'The staff are tired of being told not to remember familiar faces.', dialogue: [{ speaker: 'Hotel employee', text: 'It is always the same room. Always the same men asking us to forget their names. I kept the function schedule.' }, { speaker: 'Lucía', text: 'People who think nobody sees them usually stand somewhere expensive.' }] },
      { type: 'go', location: 'records', text: 'Bring the schedule to the municipal records annex.', hint: 'The records annex is on Cayo Espejo. Puerto Umbral is still off-limits.' },
      { type: 'enter', location: 'records', text: 'Enter the records annex.', hint: 'Records are useful even when the person behind the counter wishes they were not.' },
      { type: 'interact', location: 'records', text: 'Match the meetings to the emergency property transfers.', hint: 'The dates link the hotel meetings to the seizures.', dialogue: [{ speaker: 'Nadia', text: 'The votes came first. The public hearings came later. They had already decided who was going to lose a home.' }] },
      { type: 'choice', text: 'Decide who gets the documented timeline.', choices: [
        { id: 'timeline_public', label: 'Give Nadia a documented timeline', detail: 'Gain 3 truth and 1 community reputation.', result: 'Nadia checks every date and protects the hotel employee’s name. The story can withstand questions.', rep: { truth: 3, community: 1 }, flag: 'timeline_public' },
        { id: 'timeline_private', label: 'Sell Voss the meeting connections', detail: 'Earn $650 and gain 3 underworld reputation.', result: 'Voss buys the connections. He is less interested in stopping the machine than knowing which hands turn it.', cash: 650, rep: { underworld: 3 }, flag: 'timeline_private' },
      ] },
    ],
  },
  {
    id: 'dead_air', title: 'Dead Air', arc: 2, contact: 'nadia', location: 'marina', requires: ['the_guest_list'], reward: 650,
    description: 'A former Suncoast dispatcher has kept recordings. Pick up the archive at the marina, collect its missing backup at the hotel, and drive it back to Radio Lucero. How you handle the handoff changes the trip home.',
    steps: [
      { type: 'enter', location: 'marina', text: 'Collect the dispatcher’s archive in the marina office.', hint: 'The marina also gives you access to boats for exploring the coast.', dialogue: [{ speaker: 'Dispatcher', text: 'I was told to delay supply trucks, not evict families. Then I heard the recordings. Take the archive. My friend at the hotel has the missing backup.' }] },
      { type: 'choice', text: 'Decide how to handle the archive.', choices: [
        { id: 'archive_receipt', label: 'Document the handoff for Nadia', detail: 'Gain 3 truth reputation. No added wanted level.', result: 'The dispatcher signs a statement. The archive has a clear chain of custody and a reporter expecting it.', rep: { truth: 3 }, flag: 'archive_documented' },
        { id: 'archive_sale', label: 'Sell Voss an advance copy', detail: 'Earn $750 and gain 3 underworld reputation. A witness reports the illicit handoff: 3 stars.', result: 'Voss gets his advance copy. A nervous witness calls the police before you leave the marina.', cash: 750, rep: { underworld: 3 }, wanted: 3, flag: 'archive_sold' },
      ] },
      { type: 'drive', location: 'marina', text: 'Get a road vehicle for the return trip.', hint: 'If police are pursuing you, distance alone is not enough: break their line of sight. Use a different street from the one they last saw.' },
      { type: 'go', location: 'hotel', text: 'Drive to Hotel Mar Azul and collect the backup at the entrance.', hint: 'Follow the northbound streets to the hotel. The contact can make the handoff outside; you do not need to enter.', dialogue: [{ speaker: 'Hotel employee', text: 'Here. Same voices, different day. Please get this to somebody who will actually listen.' }] },
      { type: 'escape', text: 'Lose any police pursuit before returning to the station.', hint: 'Do not lead a pursuit straight to your contact. Wait until the wanted display says the search has cleared.' },
      { type: 'return', location: 'radio', text: 'Bring the archive to Radio Lucero.', hint: 'Reach the station entrance to finish the delivery.', dialogue: [{ speaker: 'Nadia', text: '“Keep the east cordon until the acquisition closes.” That is a voice, a date, and an instruction. Now we can get to the port.' }] },
    ],
  },
  {
    id: 'customs_and_favors', title: 'Customs and Favors', arc: 2, contact: 'voss', location: 'records', requires: ['dead_air'], reward: 850, unlockIsland: 2,
    description: 'Puerto Umbral hides behind an emergency port cordon. The archive can force a public review, or Voss can turn it into a private travel clearance. Either route reaches the last island.',
    steps: [
      { type: 'enter', location: 'records', text: 'Enter the municipal records annex.', hint: 'Finish this job before crossing to Puerto Umbral. Early entry still brings six stars.' },
      { type: 'interact', location: 'records', text: 'Get the port’s emergency authorization file.', hint: 'The bridge and port closures used different orders. Opening one did not open the other.', dialogue: [{ speaker: 'Records clerk', text: 'The port order expires when the review is filed. Unless someone keeps postponing the review. Which, apparently, someone has.' }] },
      { type: 'go', location: 'marina', text: 'Take the authorization file to the marina.', hint: 'A port inspector is waiting in the marina office on this island.' },
      { type: 'enter', location: 'marina', text: 'Meet the inspector inside the marina office.', hint: 'The inspector can validate the file without you entering the restricted port.' },
      { type: 'interact', location: 'marina', text: 'Have the inspector validate the closure dates.', hint: 'One decision remains: make the review public, or let Voss manage the clearance.', dialogue: [{ speaker: 'Port inspector', text: 'This was supposed to protect workers after the storm. Somebody turned it into a sales office with a barricade.' }, { speaker: 'Lucía', text: 'Entonces, ábrelo. Then open it.' }] },
      { type: 'choice', text: 'Choose how to open Puerto Umbral.', choices: [
        { id: 'public_review', label: 'File the public emergency review', detail: 'Gain 3 truth and 2 community reputation. Puerto Umbral opens.', result: 'The review is filed where it cannot quietly disappear. The city lifts the final cordon. All three islands are open to you.', rep: { truth: 3, community: 2 }, flag: 'port_public' },
        { id: 'voss_clearance', label: 'Accept Voss’s clearance arrangement', detail: 'Earn $500 and gain 3 underworld reputation. Puerto Umbral opens.', result: 'The clearance arrives with Voss’s name attached. The last crossing opens. You have access, money, and a fixer who considers you part of his business.', cash: 500, rep: { underworld: 3 }, flag: 'port_voss' },
      ] },
    ],
  },
  {
    id: 'concrete_promises', title: 'Concrete Promises', arc: 3, contact: 'tomi', location: 'port', requires: ['customs_and_favors'], reward: 800,
    description: 'The port paperwork shows what was bought with the seized properties. Follow the title transfers to Ward House and decide who should hold the originals.',
    steps: [
      { type: 'enter', location: 'port', text: 'Enter the Puerto Umbral terminal office.', hint: 'All three islands are open now. The port still has ordinary police patrols.', dialogue: [{ speaker: 'Tomi', text: 'My customers’ vans paid for somebody’s marble lobby. I would like to know whose.' }] },
      { type: 'interact', location: 'port', text: 'Collect the property-transfer references.', hint: 'The records point to originals held at Ward House.', dialogue: [{ speaker: 'Terminal worker', text: 'Containers go out. Contracts come in. For a while I thought it was normal business. Then I recognized my own street.' }] },
      { type: 'go', location: 'estate', text: 'Follow the transfers to Ward House.', hint: 'You can drive there or approach on foot. No combat objective is required.' },
      { type: 'enter', location: 'estate', text: 'Go inside Ward House for the scheduled meeting.', hint: 'Ward invited you because she wants to know what you intend to do.', dialogue: [{ speaker: 'Celia Ward', text: 'I invest in places people have given up on.' }, { speaker: 'Lucía', text: 'No me vendas humo. Show me the paperwork.' }] },
      { type: 'choice', text: 'Decide what happens to the title-transfer originals.', choices: [
        { id: 'titles_residents', label: 'Obtain certified copies for the residents', detail: 'Gain 3 community and 2 truth reputation. No added heat.', result: 'Ward would rather give you copies than refuse in front of witnesses. The residents finally have documents they can challenge.', rep: { community: 3, truth: 2 }, flag: 'titles_residents' },
        { id: 'titles_leverage', label: 'Take the originals as private leverage', detail: 'Earn $1,000 from Voss and gain 3 underworld reputation. Ward reports the theft: 3 stars.', result: 'The originals are worth money to Voss. Ward orders her staff to call the police. You have made this personal.', cash: 1000, rep: { underworld: 3 }, wanted: 3, flag: 'titles_leverage' },
      ] },
      { type: 'escape', text: 'Leave Ward House and clear any police response.', hint: 'A successful exit matters more than a fight. Surrender remains an option if the pursuit goes badly.' },
    ],
  },
  {
    id: 'the_long_receipt', title: 'The Long Receipt', arc: 3, contact: 'nadia', location: 'port', requires: ['concrete_promises'], reward: 950,
    description: 'A supply payment connects every closure to Suncoast’s central account. Bring the paper trail to the company tower and make them answer it.',
    steps: [
      { type: 'enter', location: 'port', text: 'Return to the port terminal office.', hint: 'The terminal worker has found the matching supply payments.' },
      { type: 'interact', location: 'port', text: 'Collect the payment schedule.', hint: 'The same account funded the closures and bought the buildings.', dialogue: [{ speaker: 'Nadia', text: 'We have names, dates, signatures, and now the account. This is not a coincidence anyone can afford to keep calling a coincidence.' }] },
      { type: 'go', location: 'tower', text: 'Bring the schedule to Suncoast Tower.', hint: 'The tower is on Puerto Umbral. Go to the marked public entrance.' },
      { type: 'enter', location: 'tower', text: 'Enter Suncoast Tower.', hint: 'The lobby is open to visitors. Your choices determine what you are here to ask for.' },
      { type: 'interact', location: 'tower', text: 'Ask Suncoast to account for the payments.', hint: 'Ward has sent an offer. Read what it buys before accepting it.', dialogue: [{ speaker: 'Suncoast counsel', text: 'We could fund repairs, compensate affected businesses, and put this behind everyone. Or spend three years arguing about a storm.' }, { speaker: 'Lucía', text: 'Funny how the money appears when the receipts do.' }] },
      { type: 'choice', text: 'Choose your negotiating position.', choices: [
        { id: 'resident_claims', label: 'Put the residents’ claims on record', detail: 'Gain 3 community and 2 truth reputation.', result: 'You put names beside the losses. Counsel can no longer pretend this is a dispute between two companies.', rep: { community: 3, truth: 2 }, flag: 'resident_claims' },
        { id: 'business_retainer', label: 'Take a recovery-business retainer', detail: 'Earn $1,200 and gain 3 underworld reputation. Keep the evidence for your next decision.', result: 'Suncoast pays for your future services. You keep the evidence and gain a seat at a table you once delivered packages to.', cash: 1200, rep: { underworld: 3 }, flag: 'suncoast_retainer' },
      ] },
    ],
  },
  {
    id: 'hurricane_clause', title: 'The Hurricane Clause', arc: 3, contact: 'ward', location: 'estate', requires: ['the_long_receipt'], reward: 1100,
    description: 'Ward is willing to show you the clause that made the whole scheme possible. The meeting can produce sworn evidence or one very expensive bargaining chip.',
    steps: [
      { type: 'enter', location: 'estate', text: 'Meet Ward at her house.', hint: 'You can finish this meeting without firing a shot.', dialogue: [{ speaker: 'Celia Ward', text: 'A city cannot rebuild on sentiment.' }, { speaker: 'Lucía', text: 'It also cannot rebuild if nobody who lives here can afford to stay.' }] },
      { type: 'interact', location: 'estate', text: 'Read the emergency acquisition clause.', hint: 'The clause permitted temporary access. Someone used it to transfer permanent ownership.', dialogue: [{ speaker: 'Celia Ward', text: 'I used the language they wrote. You have to decide whether you want to fix the language or take advantage of it.' }] },
      { type: 'choice', text: 'Choose what leaves the meeting with you.', choices: [
        { id: 'sworn_statement', label: 'Secure a signed statement for the record', detail: 'Gain 4 truth and 1 community reputation. No added wanted level.', result: 'Ward signs a narrow statement to protect herself. It is still enough to connect the scheme to the people who authorized it.', rep: { truth: 4, community: 1 }, flag: 'ward_statement' },
        { id: 'private_clause', label: 'Take the private agreement as leverage', detail: 'Earn $1,200 and gain 4 underworld reputation. The removal is reported: 3 stars.', result: 'You leave holding the document everyone wants back. Voss pays for a share of that leverage. Ward calls the police.', cash: 1200, rep: { underworld: 4 }, wanted: 3, flag: 'ward_leverage' },
      ] },
      { type: 'escape', text: 'Clear any wanted level before reaching Nadia.', hint: 'Police search the last place they saw you. Put buildings between you and the patrols, then keep out of sight.' },
      { type: 'enter', location: 'radio', text: 'Return to Radio Lucero and go inside.', hint: 'This is the last evidence handoff. The final decision is yours.' },
      { type: 'interact', location: 'radio', text: 'Lay out the complete case with Nadia.', hint: 'The next job offers three endings. Finishing the story will leave the city open for free roam.', dialogue: [{ speaker: 'Nadia', text: 'We can publish it, negotiate with it, or let you hold the city over a barrel. I know which one I want. I am asking which one you want.' }, { speaker: 'Lucía', text: 'For once, everyone is asking.' }] },
    ],
  },
  {
    id: 'the_city_we_keep', title: 'The City We Keep', arc: 3, contact: 'lucia', location: 'tower', requires: ['hurricane_clause'], reward: 1500,
    description: 'The whole story fits in a small folder. Go to Suncoast Tower, choose what your name will mean in Bahía Lucero, and come home.',
    steps: [
      { type: 'enter', location: 'tower', text: 'Enter Suncoast Tower for the final meeting.', hint: 'You have three paths. Each has a real reward and a different place for you in the city.' },
      { type: 'interact', location: 'tower', text: 'Put the complete case on the table.', hint: 'Your earlier choices remain part of your reputation. This decision settles the main story.', dialogue: [{ speaker: 'Celia Ward', text: 'Tell me what you want.' }, { speaker: 'Lucía', text: 'You keep asking what this is worth. I’ve been asking who pays for it.' }] },
      { type: 'choice', text: 'Choose the city Lucía will help create.', choices: [
        { id: 'public', label: 'Put the truth in public hands', detail: 'Earn $800; gain 5 community and 5 truth reputation. A public case and a neighborhood that knows you stood with it.', result: 'Nadia publishes the case. The acquisitions face public challenge, and residents organize their claims. It will take work, but the city cannot quietly forget them again. Inés sets a place for you before you even call.', cash: 800, rep: { community: 5, truth: 5 }, flag: 'ending_public' },
        { id: 'deal', label: 'Negotiate a protected future', detail: 'Earn $3,000; gain 2 community and 3 underworld reputation. Protect the neighborhood and build your own recovery business.', result: 'You negotiate compensation, protected leases, and a contract for your own recovery business. The deal leaves powerful people in place. It also puts real keys and money into residents’ hands. Inés says she hopes you read every page.', cash: 3000, rep: { community: 2, underworld: 3 }, flag: 'ending_deal' },
        { id: 'takeover', label: 'Keep the leverage. Take control.', detail: 'Earn $2,000 and gain 7 underworld reputation; lose 2 community reputation. A reported coercion attempt brings 4 stars.', result: 'The evidence stays in your hands. Voss becomes a partner who knows better than to call you an employee. You have influence, money, and people who fear what you know. Inés leaves the café light on, but asks what this is going to cost you.', cash: 2000, rep: { underworld: 7, community: -2 }, wanted: 4, flag: 'ending_takeover' },
      ] },
      { type: 'escape', text: 'Clear any police response before going home.', hint: 'This is still your city to move through. Escape or surrender; either way, the decision you made stands.' },
      { type: 'return', location: 'cafe', text: 'Return to Café Inés.', hint: 'All three islands stay open. Your money, reputation, vehicles, completed jobs, and choices remain available after the ending.' },
      { type: 'enter', location: 'cafe', text: 'Go inside. There is coffee waiting.', hint: 'After the ending, keep exploring or use the phone for taxi, courier, and boat work.', dialogue: [{ speaker: 'Inés', text: 'Sit down, mija. Tomorrow can wait until tomorrow.' }, { speaker: 'Lucía', text: 'For once, I might let it.' }] },
    ],
  },
  {
    id: 'tomi_not_scrap', title: 'Not Scrap Yet', arc: 1, optional: true, thread: 'Tomi · What a repair is worth', contact: 'tomi', location: 'garage', requires: ['borrowed_wheels'], reward: 280,
    description: 'An old friend of Tomi’s has a broken work vehicle and a mechanic’s quote she cannot afford. Take his tools across the neighborhood, then decide what the repair should cost.',
    steps: [
      { type: 'enter', location: 'garage', text: 'Meet Tomi inside the garage.', hint: 'This is an optional personal story. It does not block the main investigation.', dialogue: [{ speaker: 'Tomi', text: 'Rosa’s delivery car is older than her business. Another shop called it scrap. I called it a bad fuel relay.' }, { speaker: 'Lucía', text: 'You always did have expensive arguments with pessimists.' }] },
      { type: 'interact', location: 'garage', text: 'Pick up Tomi’s field tools and the replacement relay.', hint: 'A small tool case is all you need. Bring any road vehicle.' },
      { type: 'drive', location: 'garage', text: 'Get a vehicle outside the garage.', hint: 'Use a vehicle you own to keep the trip legal. Tomi’s pickup is available if you left it here.' },
      { type: 'go', location: 'market', text: 'Bring the tools to Rosa at the market.', hint: 'Head south to the market entrance. Rosa is waiting by her stall.', dialogue: [{ speaker: 'Rosa', text: 'It started. Listen to that. I was about to sell the whole business for parts.' }, { speaker: 'Lucía', text: 'Not scrap yet. Neither of you.' }] },
      { type: 'choice', text: 'Settle the repair with Rosa.', choices: [
        { id: 'fair_repair', label: 'Charge only for the replacement part', detail: 'Earn $80 and gain 3 community reputation.', result: 'Rosa keeps the van and her delivery route. Tomi hears about your price before you get back.', cash: 80, rep: { community: 3 }, flag: 'rosa_fair_price' },
        { id: 'priority_repair', label: 'Accept Rosa’s rush-service payment', detail: 'Earn $300. The repair still costs far less than replacing her vehicle.', result: 'Rosa pays the agreed rush rate. The van runs, the route survives, and you have cash toward your own future.', cash: 300, flag: 'rosa_rush_payment' },
      ] },
      { type: 'return', location: 'garage', text: 'Return Tomi’s tools to the garage.', hint: 'Tomi’s second story becomes available after the crossing opens.', dialogue: [{ speaker: 'Tomi', text: 'There is another offer on my desk. More money than repairs. I have not answered it yet.' }] },
    ],
  },
  {
    id: 'tomi_parts_unknown', title: 'Parts Unknown', arc: 1, optional: true, thread: 'Tomi · What a repair is worth', contact: 'tomi', location: 'garage', requires: ['tomi_not_scrap', 'open_water'], reward: 420,
    description: 'A buyer wants Tomi to service vehicles with suspicious histories. Drive to the depot meeting and decide whether his garage becomes part of that business.',
    steps: [
      { type: 'enter', location: 'garage', text: 'Hear Tomi out inside the garage.', hint: 'Your choice changes the future of his shop and your relationship with its customers.', dialogue: [{ speaker: 'Tomi', text: 'They pay in advance. No questions about the cars. My landlord has questions about the rent, so I listened.' }, { speaker: 'Lucía', text: 'And then you called me. Good. That was the useful part.' }] },
      { type: 'drive', location: 'garage', text: 'Take a vehicle to the buyer’s meeting.', hint: 'Use any road vehicle. There is no required race or fight.' },
      { type: 'go', location: 'depot', text: 'Meet the buyer outside the tow depot.', hint: 'The depot is north of the garage. Keep your escape route in mind if you choose the illegal contract.', dialogue: [{ speaker: 'Buyer', text: 'Engines, bodywork, fresh paint. Leave the ownership problems to us. Your friend just needs to decide whether he likes being poor.' }] },
      { type: 'choice', text: 'Decide what work Tomi’s garage will take.', choices: [
        { id: 'legitimate_shop', label: 'Reject the contract and document the stolen cars', detail: 'Gain 3 community and 2 truth reputation. No added heat.', result: 'You record enough for a formal complaint and walk away. Tomi keeps the garage legitimate. Rosa starts sending him paying customers.', rep: { community: 3, truth: 2 }, flag: 'tomi_legitimate' },
        { id: 'quiet_shop', label: 'Take the buyer’s repair contract', detail: 'Earn $900 and gain 4 underworld reputation. The reported arrangement brings 3 stars.', result: 'The advance clears. The garage has work, and some of it comes from people who do not own what they drive. A witness reports the meeting.', cash: 900, rep: { underworld: 4 }, wanted: 3, flag: 'tomi_offbook' },
      ] },
      { type: 'escape', text: 'Lose any police attention before going back to the shop.', hint: 'Do not bring a pursuit to Tomi’s door. Break sight, then stay clear while the search runs out.' },
      { type: 'return', location: 'garage', text: 'Return to Tomi and tell him what you chose.', hint: 'Your decision is saved even if the trip back goes badly.', dialogue: [{ speaker: 'Tomi', text: 'It is my name above that door. Whatever happens next, I need to be able to say I chose it too.' }] },
    ],
  },
  {
    id: 'ines_after_hours', title: 'After Hours', arc: 1, optional: true, thread: 'Inés · The people upstairs', contact: 'ines', location: 'cafe', requires: ['first_favor'], reward: 220,
    description: 'The clinic is short on delivery staff and Inés is worried about a neighbor at Las Palmas. Make an after-hours medicine run and learn why your aunt never really closes the café.',
    steps: [
      { type: 'enter', location: 'cafe', text: 'Find Inés inside the café.', hint: 'This optional story is available early. There is no hidden countdown.', dialogue: [{ speaker: 'Inés', text: 'Rafael upstairs missed his delivery. He says he is fine. Men his age use “fine” to mean anything up to and including on fire.' }, { speaker: 'Lucía', text: 'I’ll get the medicine. Tell him no speeches until I get there.' }] },
      { type: 'drive', text: 'Get a road vehicle for the clinic run.', hint: 'Any road vehicle works. A careful arrival is more useful than a fast crash.' },
      { type: 'go', location: 'clinic', text: 'Drive to Harbor Clinic.', hint: 'Park near the door. Medical transport jobs are also available here when you are between stories.' },
      { type: 'enter', location: 'clinic', text: 'Collect Rafael’s prepared medicine inside the clinic.', hint: 'The staff have the package ready at the entrance.', dialogue: [{ speaker: 'Clinic staff', text: 'Correct name, correct address. Thank you for checking. Inés has been calling every ten minutes.' }] },
      { type: 'return', location: 'home', text: 'Bring Rafael’s medicine to Las Palmas.', hint: 'Return to the building you call home. Rafael’s neighbor can finish the handoff at the entrance.', dialogue: [{ speaker: 'Rafael', text: 'I used to help your mother with that car of hers. She never trusted a mechanic who had clean shoes.' }, { speaker: 'Lucía', text: 'She would have liked mine.' }] },
      { type: 'choice', text: 'Decide how to finish the neighborhood run.', choices: [
        { id: 'neighbor_favor', label: 'Keep this one between neighbors', detail: 'Gain 3 community reputation. Leave Rafael’s offered tip with him.', result: 'Rafael keeps the tip. Inés sends you home with enough food for three people and says none of it is negotiable.', rep: { community: 3 }, flag: 'rafael_favor' },
        { id: 'paid_route', label: 'Accept the tip and offer a regular delivery route', detail: 'Earn $180 and gain 1 community reputation.', result: 'Rafael pays for reliable work. Inés starts writing down the names of neighbors who need the same service.', cash: 180, rep: { community: 1 }, flag: 'neighborhood_route' },
      ] },
    ],
  },
  {
    id: 'ines_lights_on', title: 'Leave a Light On', arc: 1, optional: true, thread: 'Inés · The people upstairs', contact: 'ines', location: 'cafe', requires: ['ines_after_hours', 'paper_trail'], reward: 360,
    description: 'Another power cut has turned the café into the neighborhood’s waiting room. Inés needs a portable generator from the depot. You can arrange a documented loan or take the one Voss has marked for pickup.',
    steps: [
      { type: 'enter', location: 'cafe', text: 'Meet Inés at the café.', hint: 'This is a community delivery with a choice about how to obtain the equipment.', dialogue: [{ speaker: 'Inés', text: 'The food will keep for a while. The people need somewhere to sit, charge a phone, and complain properly.' }, { speaker: 'Lucía', text: 'So we are restoring a vital public service.' }] },
      { type: 'drive', text: 'Get a road vehicle for the equipment run.', hint: 'The equipment delivery is part of the mission; you do not need to buy a special vehicle.' },
      { type: 'go', location: 'depot', text: 'Drive to the depot’s equipment pickup.', hint: 'A documented emergency loan is available. Voss has also offered a quicker, less legal arrangement.' },
      { type: 'choice', text: 'Choose how the generator leaves the depot.', choices: [
        { id: 'generator_loan', label: 'Sign the emergency community loan', detail: 'Gain 3 community and 1 truth reputation. No added heat.', result: 'You sign the equipment out in the café’s name. The depot clerk quietly includes enough fuel to get through the evening.', rep: { community: 3, truth: 1 }, flag: 'community_generator' },
        { id: 'generator_voss', label: 'Take the unit Voss marked for collection', detail: 'Earn $400 and gain 2 underworld reputation. The missing equipment is reported: 2 stars.', result: 'The unit is ready to go. It is also not Voss’s to give. The café will have power, and the depot has filed a theft report.', cash: 400, rep: { underworld: 2 }, wanted: 2, flag: 'voss_generator' },
      ] },
      { type: 'escape', text: 'Clear any police search before delivering the generator.', hint: 'The café is full of neighbors. Finish the pursuit before going back.' },
      { type: 'return', location: 'cafe', text: 'Bring the generator to Café Inés.', hint: 'Return to the entrance. Inés and the neighbors will handle the setup.', dialogue: [{ speaker: 'Inés', text: 'Lights, cold water, and twenty people arguing about baseball. Así sí. Now this feels like home.' }, { speaker: 'Lucía', text: 'You forgot the terrible coffee.' }, { speaker: 'Inés', text: 'Outside. Immediately.' }] },
    ],
  },
  {
    id: 'voss_three_stops', title: 'Three Stops, No Excuses', arc: 2, optional: true, thread: 'Voss · After the last song', contact: 'voss', location: 'club', requires: ['blue_hour'], reward: 400,
    description: 'Voss has a driving route through the hotel district, the club, and the marina. Run it once and decide whether you are building a legitimate late-night service or joining his private racing circle.',
    steps: [
      { type: 'drive', location: 'club', text: 'Get a road vehicle near Club Mirador.', hint: 'This first run is a route rehearsal. Timed checkpoint races are available separately at Tomi’s Garage.', dialogue: [{ speaker: 'Voss', text: 'Hotel, club, marina. Three stops. People pay a lot not to wait in this part of town.' }, { speaker: 'Lucía', text: 'I assume they pay even more for whatever you are not saying.' }] },
      { type: 'go', location: 'hotel', text: 'First stop: Hotel Mar Azul.', hint: 'Use the northbound streets. Brake before the turn into the hotel frontage.' },
      { type: 'go', location: 'club', text: 'Second stop: return to Club Mirador.', hint: 'A fast car needs more room to slow down. Smooth turns beat damaged bodywork.' },
      { type: 'go', location: 'marina', text: 'Third stop: Espejo Marina.', hint: 'The marina sits on the southeast shore. Follow the coastal streets to the marked entrance.', dialogue: [{ speaker: 'Voss', text: 'You know the route. I have clients who need drivers, and drivers who need somebody to beat. Which list gets your name?' }] },
      { type: 'choice', text: 'Choose what the route becomes for you.', choices: [
        { id: 'night_service', label: 'Build a reliable late-night delivery service', detail: 'Earn $180 and gain 2 community reputation.', result: 'Hotel staff and club workers get a driver who turns up when promised. Voss admits that reliability can be profitable too.', cash: 180, rep: { community: 2 }, flag: 'night_service' },
        { id: 'racing_circle', label: 'Join Voss’s off-book racing circle', detail: 'Earn $550 and gain 3 underworld reputation. The organizer’s reported handoff brings 1 star.', result: 'Your name enters the private driver list. The sponsor pays upfront. A patrol is already asking about the cash changing hands at the marina.', cash: 550, rep: { underworld: 3 }, wanted: 1, flag: 'voss_racer' },
      ] },
      { type: 'escape', text: 'Clear any police attention after the meeting.', hint: 'A low-level search can still escalate if you hit people or fire a weapon. Leave the area cleanly.' },
    ],
  },
  {
    id: 'voss_low_tide', title: 'Low Tide, High Price', arc: 2, optional: true, thread: 'Voss · After the last song', contact: 'voss', location: 'marina', requires: ['voss_three_stops', 'customs_and_favors'], reward: 600,
    description: 'Voss offers a coastal cargo run. Take a boat from the marina waters to Santa Elena, then decide which shipment you are willing to put your name on.',
    steps: [
      { type: 'enter', location: 'marina', text: 'Hear the cargo offer in the marina office.', hint: 'All islands are open for this job. You can inspect the choice without accepting an illegal shipment.', dialogue: [{ speaker: 'Voss', text: 'Two shipments, same dock. Clinic supplies have a manifest. The other one has a much better margin.' }, { speaker: 'Lucía', text: 'You must get tired of describing a police problem as a business opportunity.' }] },
      { type: 'drive', vehicle: 'boat', text: 'Get into a boat for the coastal run.', hint: 'Boats are in the water beside the docks and marina. You can swim a short distance to reach one. Bring it alongside the shore before getting out.' },
      { type: 'go', location: 'docks', text: 'Land at Santa Elena and reach the El Bajo dock office.', hint: 'Sail west along the coast, approach land slowly, get out near the shoreline, and walk to the gold marker.' },
      { type: 'choice', text: 'Choose the shipment you will sign for.', choices: [
        { id: 'manifest_cargo', label: 'Deliver the documented clinic shipment', detail: 'Earn $250 and gain 3 community and 1 truth reputation.', result: 'You put your name on a manifest you can stand behind. The clinics get their supplies, and Voss finds someone else for his other problem.', cash: 250, rep: { community: 3, truth: 1 }, flag: 'coast_manifest' },
        { id: 'offbook_cargo', label: 'Take responsibility for Voss’s off-book cargo', detail: 'Earn $1,200 and gain 4 underworld reputation. A port witness reports the handoff: 4 stars.', result: 'The payment is real. So is the port witness who reports the pickup. Voss calls you dependable; the police have another word for it.', cash: 1200, rep: { underworld: 4 }, wanted: 4, flag: 'coast_offbook' },
      ] },
      { type: 'escape', text: 'Clear any pursuit from the dock handoff.', hint: 'You can escape by road or water. The police stop searching only after you break contact and remain unseen.' },
      { type: 'return', location: 'marina', text: 'Return to Espejo Marina and settle with Voss.', hint: 'Boat or bridge: the return route is your choice.', dialogue: [{ speaker: 'Voss', text: 'You know, you could make a very comfortable living doing this.' }, { speaker: 'Lucía', text: 'Comfortable and easy are two different things.' }] },
    ],
  },
];

export const JOBS = [
  { id: 'courier', title: 'Neighborhood courier', description: 'Visit the market or depot for a legal delivery. Your phone marks a destination on an open island.', reward: 120, requiresIsland: 0, vehicle: null, contact: 'ines', pickupText: 'Collect a neighborhood delivery.', deliveryText: 'Bring the delivery to the marked destination.' },
  { id: 'taxi', title: 'Last fare of the night', description: 'Ask at Café Inés or the garage for a fare. Get a road vehicle and bring the passenger to the marked destination.', reward: 100, requiresIsland: 0, vehicle: null, contact: 'tomi', pickupText: 'Pick up a waiting passenger.', deliveryText: 'Bring your passenger to the marked destination.' },
  { id: 'boat', title: 'Harbor run', description: 'Ask at the docks or marina for a harbor delivery. Take a boat to the marked offshore buoy.', reward: 160, requiresIsland: 0, vehicle: 'boat', contact: 'voss', pickupText: 'Collect a harbor delivery.', deliveryText: 'Bring the package to the marked offshore buoy.' },
  { id: 'race', title: 'City circuit', description: 'Ask at Tomi’s Garage for a timed route. Pass three road checkpoints within 110 seconds to get paid.', reward: 220, requiresIsland: 0, vehicle: null, contact: 'tomi', pickupText: 'Get a road vehicle and begin the circuit.', deliveryText: 'Pass all three marked road checkpoints before the timer expires.' },
  { id: 'rescue', title: 'Medical transport', description: 'Ask at Harbor Clinic for a transport call. Pick up the waiting patient and bring them safely to the clinic. Completion also earns 1 community reputation.', reward: 140, requiresIsland: 0, vehicle: null, contact: 'ines', pickupText: 'Collect the waiting patient at the marked pickup.', deliveryText: 'Bring the patient to Harbor Clinic.' },
];

export const ENDINGS = {
  ending_public: { title: 'A city that remembers', text: 'Nadia’s case is public. Residents have a voice in what comes next. Lucía is known as the woman who made the paperwork matter.', tone: 'Community & truth', color: '#78d7bd' },
  ending_deal: { title: 'A place at the table', text: 'Protected leases, compensation, and a recovery business with Lucía’s name on the door. She knows the agreement will need watching.', tone: 'Independence & compromise', color: '#efc36f' },
  ending_takeover: { title: 'Your name opens doors', text: 'Lucía kept the leverage and took her place in the city’s private business. People answer her calls. Some of them wish they did not have to.', tone: 'Influence & consequence', color: '#df9fd0' },
};

export const HELP = [
  { title: 'Start with the gold marker', text: 'The current objective says where to go and what to do. Gold marks the destination. Named buildings can be entered; use Interact at the door and again at the interior contact.' },
  { title: 'Own your route', text: 'Follow the story from your phone, explore the city, or take a paid job. Main missions do not require killing. The story has choices with visible cash, reputation, and police consequences.' },
  { title: 'Driving takes room', text: 'Brake before a turn. A small car is easier to place than a truck; motorcycles are quick but exposed. Boats use the channels. Stop before entering or leaving a vehicle.' },
  { title: 'Seen, pursued, searched for', text: 'Witnesses can report crimes. Police pursue when they can see you, then search your last known position. Break their line of sight and stay hidden until the wanted level clears.' },
  { title: 'The cordons are real', text: 'Cayo Espejo opens after Open Water. Puerto Umbral opens after Customs and Favors. Reaching either early by bridge or water brings six stars. The map marks the restricted islands.' },
  { title: 'A bad ending to a day is not the end', text: 'Hospital treatment and arrest cost you, but completed stories and island access stay saved. You can continue from recovery or retry the active job. A lawful surrender is always an option during a wanted state.' },
  { title: 'People remember', text: 'Community, underworld, and truth reputation describe different relationships. Choices can change more than your wallet. You can change direction later without erasing what you have already done.' },
];
