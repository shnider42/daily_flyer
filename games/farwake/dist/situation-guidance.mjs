import { FACTIONS } from './content.mjs';
import { militaryServiceRank } from './military-ranks.mjs';
import { warzoneRelation } from './warzone-allegiance.mjs';

const shortName = id => ({ freewake: 'Freewake', meridian: 'Meridian' })[id] || FACTIONS.find(f => f.id === id)?.name || 'No side';
const otherSide = id => id === 'freewake' ? 'meridian' : id === 'meridian' ? 'freewake' : null;

/** Describe the captain and the vessel separately: a passenger keeps their own service record. */
export function situationView(game) {
  const state = game.state, rank = militaryServiceRank(game), inWarzone = state.systemId === 'crosswind';
  const war = state.warzoneView || game.warzoneStatus?.() || {};
  const sharedShip = inWarzone && state.multiplayer?.aboardVesselId && Object.hasOwn(game.system?.warzone || {}, 'viewerFaction') && game.system.warzone;
  const factionId = sharedShip ? sharedShip.viewerFaction : war.factionId;
  const hostileFactions = [...new Set([...(sharedShip ? sharedShip.hostileFactions || [] : war.hostileFactions || []), ...(otherSide(factionId) ? [otherSide(factionId)] : [])])];
  const suspended = rank.enlisted && !!rank.suspended;
  const branch = rank.branchId === 'army' ? 'Army' : rank.branchId === 'navy' ? 'Navy' : 'service';
  const identity = rank.enlisted ? `${shortName(rank.factionId)} ${branch} · ${rank.rank}` : war.factionId ? `${shortName(war.factionId)} supporter` : 'Civilian · no side chosen';
  const personalHostilities = war.hostileFactions || [];
  const differentShip = !!sharedShip && (factionId !== (rank.enlisted ? rank.factionId : war.factionId) || hostileFactions.some(id => !personalHostilities.includes(id)) || personalHostilities.some(id => !hostileFactions.includes(id)));
  const ownHostile = inWarzone && !!factionId && hostileFactions.includes(factionId);
  let detail = suspended ? 'Service suspended · Help' : 'Orders & what you can do';
  if (inWarzone) detail = hostileFactions.length > 1 ? 'Both armies hostile · Help' : hostileFactions.length ? `Enemy: ${hostileFactions.map(shortName).join(', ')} · Help` : 'No declared enemy · Watch for crossfire';
  if (differentShip) detail = `Ship: ${shortName(factionId)} · ${hostileFactions.length > 1 ? 'both armies hostile' : hostileFactions.length ? 'enemy ' + hostileFactions.map(shortName).join(', ') : 'no declared enemy'}`;
  return { visible: rank.enlisted || inWarzone, identity, detail, rank, suspended, war, inWarzone, factionId, hostileFactions, ownHostile, differentShip,
    tone: ownHostile || suspended || hostileFactions.length > 1 ? 'warning' : factionId ? 'allied' : 'neutral' };
}

/** One next step for the open war; the full briefing remains one tap away. */
export function warzoneGuidePrompt(game, { touch = false } = {}) {
  const state = game.state;
  if (state.systemId !== 'crosswind' || state.boarding) return null;
  const view = situationView(game), { rank, suspended, war, factionId, hostileFactions } = view;
  const open = touch ? 'Tap Your side' : 'Open Your side';
  const ally = factionId && !hostileFactions.includes(factionId) ? shortName(factionId) : null;
  const sides = ally ? `${ally} is on your side. ${hostileFactions.map(shortName).join(' and ') || 'No army'} ${hostileFactions.length > 1 ? 'are' : 'is'} your enemy.` : hostileFactions.length ? `${hostileFactions.map(shortName).join(' and ')} ${hostileFactions.length > 1 ? 'are' : 'is'} hostile to you.` : 'You have not chosen a side. Both armies are fighting each other.';
  let title = 'This is an ongoing war', compactBody = `${sides} ${open} for your choices.`;
  let body = `${sides} An enemy may be busy fighting another ship; that does not make it friendly. ${open} to see your choices, find Vey, or leave safely.`;
  if (view.differentShip) {
    title = hostileFactions.length > 1 ? 'Both armies are targeting this ship' : 'This ship has its own side';
    compactBody = `This ship flies for ${shortName(factionId)}. Your personal service stays the same.`;
    body = `${compactBody} The person flying the ship decides its side in space. Attacks recorded against the ship also affect everyone aboard. ${sides} ${open} for the ship’s situation and ways out. A personal ceasefire may not clear another commander’s ship.`;
  } else if (view.ownHostile || hostileFactions.length > 1) {
    title = 'Your side has recorded an attack';
    compactBody = `Both armies may attack you. ${open} for a ceasefire or a way out.`;
    body = `Your service record and rank are still saved. An earlier attack by you or this ship has made your own side hostile here as well. ${open} for the ceasefire conditions and a route to Orsa. The opposing army stays hostile.`;
    if (!factionId) { title = 'Both armies are hostile'; body = `Both armies have recorded attacks from you or this ship. You have no active side to request a ceasefire from. ${open} to find Orsa or plot a return to Hearth.`; compactBody = `Both armies may attack you. ${open} to find a way out.`; }
  } else if (state.exploration?.encounter?.warzoneGround) {
    title = 'You are on Vey’s battlefield';
    compactBody = `${sides} Move behind cover; watch the blast circles.`;
    body = `${compactBody} The fighting continues as new troops arrive. You can help civilians or leave using the landing shuttle. ${open} for directions.`;
  } else if (rank.enlisted && rank.branchId === 'army' && !suspended) {
    title = 'Army fighting is on Vey';
    compactBody = `${sides} Land on Vey to fight on foot.`;
    body = `${compactBody} ${open}, then choose the Vey marker. Your Army rank carries over from the starter system. This ongoing battle is separate from your assigned Army missions. You can fly your own ship, but Army rank does not give you a Navy gun station or another ship’s controls. Orsa is the safer place to withdraw.`;
  } else if (!factionId) {
    title = suspended ? 'Your military service is suspended' : 'You have not chosen a side';
    compactBody = suspended ? `${open} to see what is blocking your service.` : `${open} to choose a side, visit the refuge, or leave.`;
    body = suspended ? `Your rank is saved, but your faction reputation is too low for duty. ${sides} ${open} for your current status and an exit route.` : `Both armies are fighting each other. You are a civilian until you choose a side. Shots and explosions can still hurt you. ${open} to see what joining means, or mark Orsa’s refuge.`;
  }
  return { id: `warzone-help:${factionId || 'neutral'}:${hostileFactions.join(',')}:${state.mode}:${!!state.exploration?.encounter?.warzoneGround}:${title}`, title, body, compactBody, flow: 'route', topicId: 'warzone-situation', controlTarget: 'situationButton' };
}

/** Friendly and neutral fleet contacts must not suppress ordinary guidance. */
export function nearbyShipThreat(game, range = 800) {
  const view = situationView(game), ship = game.state.ship;
  return (game.system?.enemies || []).some(contact => contact.hp > 0 && !contact.disabled &&
    (!contact.warzone || warzoneRelation(contact.faction, view) === 'hostile') && Math.hypot(contact.x - ship.x, contact.y - ship.y) < range);
}
