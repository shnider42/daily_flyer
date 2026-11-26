/** Late, physically collected evidence. Never grant these entries on entering a system. */
export const EARTH_EVIDENCE = Object.freeze({
  'earth-deep-observation': {
    id: 'earth-deep-observation', title: 'Earth survey · Outside the shelters',
    text: 'Sirius Transfer has ninety-three years of independent observations. The improved air readings all follow the same inhabited districts. Beyond their sealed boundaries, the old seasonal exchange of carbon and water has stopped. This proves that the shelter measurements are local; it does not yet explain what replaced the missing cycles.'
  },
  'earth-breakwater-order': {
    id: 'earth-breakwater-order', title: 'Breakwater · Trial and emergency order',
    text: 'The signed Breakwater files identify a human project of the former Basin Recovery Board. Its engineers adapted an ordinary deep-ocean organism into a living filter for salt, industrial waste and excess heat. Each culture was meant to die after one maintenance cycle. During the power crisis, the board approved a self-renewing strain to keep the cooling works running. The field team warned that this removed their only reliable limit. The board released it anyway. Earth was not attacked by an outside fleet: an emergency repair became an uncontrolled replacement for the environment it was meant to protect.'
  },
  'earth-cartridge-route': {
    id: 'earth-cartridge-route', title: 'Breakwater · The outward cargo route',
    text: 'The original shipping seals, a retained wet cartridge and the production ledger agree. Living Breakwater filters left Earth inside emergency cooling equipment before the cordon. Failed cargo sterilization seeded several other sites. Mature deposits leave silver, black and amber mineral bands; dry residue alone is not alive. The organism spreads in surviving material, not in radio messages. Dry breaks and verified heat treatment can contain an isolated shipment. None of this makes ordinary wildlife or every damaged station part of the same organism.'
  },
  'earth-limits-of-repair': {
    id: 'earth-limits-of-repair', title: 'Earth survey · What cannot be restored',
    text: 'Nacre tested living samples, dead samples and untouched controls. Tau Ceti compared those results with the deep survey and the original design. Breakwater has consumed the soils, marine nursery beds and shallow carbon stores that the old biosphere depended on. Removing a growth stops its activity; it does not turn the consumed material back into an ecosystem. At planetary scale, killing the network would also remove the processes now holding the remaining air and water in balance. The independently checked removal models leave no self-sustaining human environment. Sealed shelters can buy people time. They cannot restore Earth. There is no uninfected planetary system underneath waiting to restart.'
  },
  'earth-reservoir-account': {
    id: 'earth-reservoir-account', title: 'Recorded contact · The Reservoir',
    text: 'A coordinating intelligence now calls the connected growth the Reservoir. Its first recorded responses came decades after the release, so it did not authorize the original Breakwater order. It can sense connected living tissue and negotiate through an isolated terminal. It cannot know what happens beyond that network without an observer. It offers cooperation to captains who remain able to travel and choose. Its wish to keep growing does not make a human return safe. The verified history comes from the records and measurements, not from accepting its promises.'
  }
});

export const EARTH_FINAL_LORE = Object.freeze(Object.values(EARTH_EVIDENCE).map(record => Object.freeze({ ...record, physicalSourceOnly: true })));

/** Callback text uses actual completed work, never an imagined rescue or friendship. */
export function earthContinuingLives(game) {
  const delivered = game.state.narrative?.quests?.earth_long_silence?.earth?.delivered || [];
  const messages = [];
  if (delivered.includes('engineer-aru')) messages.push('Aru calls from Kettle. The shielding bench is back in use. They have saved a place for your next repair.');
  if (delivered.includes('witness-sada')) messages.push('Sada sends Nacre’s receiving schedule. There are beds for the people coming out, and work for anyone who can help the next shift.');
  if (game.hasFlag?.('water_repaired')) messages.push('Morrow’s condenser is still supplying the district you helped. Its next maintenance date is on your messages.');
  if (game.state.narrative?.quests?.cold_chain?.status === 'completed') messages.push('Mara’s clinic still has the medicine case you helped repair. She needs a delivery next week.');
  if (!messages.length) messages.push('Kettle’s ordinary departure board keeps updating. Families are going to work, school and homes built long after the evacuation.');
  return `${messages.slice(0, 3).join(' ')} Lio puts down the survey. “I wanted another answer. I still do.” Nobody asks you to be glad. The next departure is yours to choose.`;
}

export function earthSponsorText(game) {
  const id = game.state.narrative?.pledge || ['concord', 'freewake', 'meridian', 'lantern', 'cinder'].find(faction => game.hasFlag?.(`allied_${faction}`));
  return ({
    concord: 'Suri can put a verified warning on the rescue-service channel. A restoration caucus wants the restrictions lifted; Suri refuses to call an unsafe world safe.',
    freewake: 'Tess offers the Union’s public kitchens and dispatch boards. Some local councils want every record now; others ask you to remove the names of people still inside Sol.',
    meridian: 'Eren can attach the findings to every freight contract. A migration broker wants a saleable homecoming. Eren tells you exactly which claims the evidence will support.',
    lantern: 'Jun offers independent copies and a public method for checking them. Other researchers want exclusive access first. You can choose who gets to see the evidence.',
    cinder: 'Ot can put your account on the salvage channels. Some crews want a permanent prohibition; others want first claim. No clan gets to decide what you say.'
  })[id] || 'No sponsor owns the record. You can ask for a publisher, keep independent copies or issue your own account.';
}
