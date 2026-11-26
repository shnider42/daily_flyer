/** Personal aftermath views and earned agreements. Never changes the shared galaxy's history. */
import { earthAftermathDefinitions } from './earth-aftermath-content.mjs';

const done = (game, id) => game.state.narrative?.quests?.[id]?.status === 'completed';
const answers = game => game.state.narrative?.quests?.earth_long_silence?.choices || {};
const has = (game, flag) => game.hasFlag?.(flag) || game.state.flags?.includes(flag);
const accounts = { public: 'Verified public findings', sanitized: 'Infrastructure cover story', 'false-return': 'Knowingly false all-clear', custody: 'Independent evidence custody' };
const allegiances = { concord: 'Continuity containment crews', freewake: 'Freewake relief network', meridian: 'Audited Meridian carriers', lantern: 'Lantern independent observers', cinder: 'Cinder rescue compact', rogue: 'Independent captain', reservoir: 'Reservoir field contact' };
const agreements = [
  { thread: 'earth_public_followup', label: 'Listening House verification desk', systemId: 'vesper', bodyId: 'listening', rest: .8 },
  { thread: 'earth_cover_followup', label: 'Ledger checked-work agreement', systemId: 'meridian', bodyId: 'ledger', repair: .85 },
  { thread: 'earth_custody_followup', label: 'Blindpost independent custody', systemId: 'hush', bodyId: 'blindpost', repair: .8 },
  { thread: 'earth_service_concord', label: 'Threshold departure watch', systemId: 'sol', bodyId: 'threshold', repair: .75, rest: .75 },
  { thread: 'earth_service_freewake', label: 'Weighhouse receiving agreement', systemId: 'brindle', bodyId: 'weighhouse', rest: .7 },
  { thread: 'earth_service_meridian', label: 'Ledger audited carrier agreement', systemId: 'meridian', bodyId: 'ledger', repair: .75 },
  { thread: 'earth_service_cinder', label: 'Patchwork refuge compact', systemId: 'cinder', bodyId: 'patchwork', repair: .75 },
  { thread: 'earth_service_rogue', label: 'Kettle independent berth', systemId: 'hearth', bodyId: 'kettle', repair: .8 },
  { thread: 'earth_service_reservoir', label: 'Earth contained-contact service', systemId: 'sol', bodyId: 'earth', repair: .6, rest: .6, activeContact: true }
];

export function earthAftermathServiceBenefit(game, action) {
  if (game.state.mode !== 'person' || game.state.interior) return null;
  const eligible = agreements.filter(agreement => done(game, agreement.thread) && agreement.systemId === game.state.systemId && agreement.bodyId === game.state.locationId && agreement[action] && (!agreement.activeContact || !has(game, 'thread:earth_reservoir_left')));
  const best = eligible.sort((a, b) => a[action] - b[action])[0];
  return best ? { multiplier: best[action], label: `${best.label} · ${Math.round((1 - best[action]) * 100)}% off` } : null;
}

export function earthAftermathScanCost(game, signal) {
  return signal && !signal.story && !signal.earthCampaign && done(game, 'earth_service_lantern') ? 4 : null;
}

/** Display completed work without revealing the late finding to a new captain. */
export function earthAftermathStatus(game) {
  const choices = answers(game), accountId = choices['earth-account'], originalAllegiance = choices['earth-allegiance'];
  const allegianceId = originalAllegiance === 'reservoir' && has(game, 'thread:earth_reservoir_left') ? 'rogue' : originalAllegiance;
  const truthKnown = ['earth-breakwater-order', 'earth-cartridge-route', 'earth-limits-of-repair'].every(id => game.state.knownLore?.includes(id));
  const completed = done(game, 'earth_long_silence');
  const nextThreads = completed ? earthAftermathDefinitions().filter(definition => {
    const record = game.state.narrative?.quests?.[definition.id], need = definition.requires || {};
    if (record?.status === 'active') return true;
    if (record?.status === 'completed' && !definition.repeatable) return false;
    if (need.completed?.some(id => !done(game, id)) || need.flags?.some(flag => !has(game, flag)) || need.notFlags?.some(flag => has(game, flag))) return false;
    return true;
  }).map(definition => {
    const record = game.state.narrative?.quests?.[definition.id], step = definition.stages[record?.status === 'active' ? record.stage : 0];
    return { id: definition.id, title: definition.title, systemId: step.at.systemId, bodyId: step.at.bodyId || step.at.anchorBody };
  }) : [];
  return {
    truthKnown,
    account: accounts[accountId] ? { id: accountId, label: accountId === 'sanitized' && has(game, 'thread:earth_cover_corrected') ? 'Cover story followed by a public correction' : accounts[accountId] } : null,
    allegiance: allegiances[allegianceId] ? { id: allegianceId, label: allegiances[allegianceId] } : null,
    completed, continuing: true, nextThreads,
    agreements: agreements.filter(agreement => done(game, agreement.thread) && (!agreement.activeContact || !has(game, 'thread:earth_reservoir_left'))).map(({ label, systemId, bodyId }) => ({ label, systemId, bodyId }))
  };
}

export function earthAftermathObjectText(game, id) {
  if (id === 'earth-recall-console' && done(game, 'earth_return_followup')) {
    const route = game.state.narrative.quests.earth_return_followup.choices.route;
    return route === 'recall'
      ? 'Ira Fen’s signed account records your false all-clear, its later retraction and the passenger transports returned to screened berths. Her actual rescue and delivery are recorded separately. The original lie has not been deleted.'
      : 'Ira Fen’s signed account records your repeated false all-clear, the two transports lost beyond the screened route and the one that turned back. Your convoy’s losses remain attributable to your message. Other captains retain their own missions and choices.';
  }
  if (id === 'earth-ledger-contract' && done(game, 'earth_cover_followup')) return game.state.narrative.quests.earth_cover_followup.choices.reply === 'correct'
    ? 'Your false infrastructure explanation remains in the file beside your signed correction and the biological evidence it now acknowledges.'
    : 'Your infrastructure explanation remains beside the witness report it contradicts. You signed a second statement maintaining the false explanation.';
  if (id === 'earth-isolated-link' && done(game, 'earth_service_reservoir')) return has(game, 'thread:earth_reservoir_left')
    ? 'The physical break remains closed. Your old cooperation agreement is preserved beside your refusal. No continuing service discount or obligation is active.'
    : 'Your contained contact agreement is filed here. You retain your ship and initiative. Only the observations you choose to submit leave the isolated recorder; living material cannot cross into the shelter.';
  return null;
}
