/** Personal allegiance and verifiable sorties within the shared Crosswind war. */
import { FACTIONS } from './content.mjs';
import { CROSSWIND_SYSTEM_ID, CROSSWIND_BODY_IDS } from './warzone-content.mjs';
import { generateSurface } from './surface.mjs';
import { warzoneRelation } from './warzone-allegiance.mjs';

const SIDES = ['freewake', 'meridian'];
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const bounded = (value, max = 1e9) => Math.max(0, Math.min(max, finite(value)));
const name = id => FACTIONS.find(faction => faction.id === id)?.name || 'Unaligned';
const opposite = id => SIDES.find(side => side !== id);
const conscious = game => game.state.person.health > 0 && !game.state.person.down;

export function normalizeWarzone(raw = {}) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
  const mission = raw.mission && SIDES.includes(raw.mission.factionId) ? {
    id: 'crosswind-relief-approach', factionId: raw.mission.factionId,
    damage: bounded(raw.mission.damage, 180), seconds: bounded(raw.mission.seconds, 45),
    status: raw.mission.status === 'complete' ? 'complete' : 'active',
    paid: raw.mission.paid === true || raw.mission.status === 'complete'
  } : null;
  return { version: 1, side: SIDES.includes(raw.side) ? raw.side : null,
    hostileFactions: [...new Set((Array.isArray(raw.hostileFactions) ? raw.hostileFactions : []).filter(id => SIDES.includes(id)))],
    visits: Math.floor(bounded(raw.visits)), acknowledged: raw.acknowledged === true,
    mission, lastHail: typeof raw.lastHail === 'string' ? raw.lastHail.slice(0, 120) : null };
}

export const WarzoneRules = {
  initializeWarzone() { this.state.warzone = normalizeWarzone(this.state.warzone); return this.state.warzone; },
  warzoneServiceFaction() {
    const career = this.state.professions?.careers?.military;
    return career?.enlisted && SIDES.includes(career.factionId) && finite(this.state.rep?.[career.factionId]) > -25 ? career.factionId : null;
  },
  warzoneFaction() {
    const career = this.state.professions?.careers?.military;
    if (career?.enlisted && SIDES.includes(career.factionId)) return this.warzoneServiceFaction();
    return this.state.warzone?.side || null;
  },
  warzoneHostilities() {
    const side = this.warzoneFaction();
    return [...new Set([...(this.state.warzone?.hostileFactions || []), ...(side ? [opposite(side)] : [])])];
  },
  warzoneRelation(factionId) {
    return warzoneRelation(factionId, { factionId: this.warzoneFaction(), hostileFactions: this.warzoneHostilities() });
  },
  warzoneCeasefireStatus() {
    const s = this.state, service = s.professions?.careers?.military, side = this.warzoneFaction();
    const factionId = side || (service?.enlisted && SIDES.includes(service.factionId) ? service.factionId : null);
    const context = this._warzoneCeasefireContext?.() || {};
    const needed = !!factionId && [...(s.warzone?.hostileFactions || []), ...(context.hostileFactions || [])].includes(factionId);
    let reason = !factionId ? 'You have no side to request a ceasefire with. Attacks on neutral factions are not cleared here.'
      : service?.enlisted && SIDES.includes(service.factionId) && !this.warzoneServiceFaction() ? 'Your military clearance is suspended. Repair your standing with your own faction first.'
      : !needed ? 'Your side is not hostile to you.'
      : s.systemId !== CROSSWIND_SYSTEM_ID || s.mode !== 'person' || s.locationId !== CROSSWIND_BODY_IDS.orsa || s.interior || s.exploration ? 'Land on Orsa and walk to its outdoor landing area to request a ceasefire.'
      : !conscious(this) ? 'Recover before requesting a ceasefire.'
      : s.boarding?.phase === 'active' || s.pendingEncounter || this._hitTimer > 0 || context.reason ? context.reason || 'Finish the immediate fight or conversation before requesting a ceasefire.' : null;
    if (!reason) {
      const body = this.system.bodies.find(body => body.id === CROSSWIND_BODY_IDS.orsa);
      const key = `${s.systemId}:${s.flags?.length || 0}`;
      if (!body) reason = 'Orsa’s landing is unavailable here.';
      else {
        if (this._warzoneCeasefireLanding?.key !== key) this._warzoneCeasefireLanding = { key, spawn: generateSurface(body, s.seed, s.flags).spawn };
        const { spawn } = this._warzoneCeasefireLanding;
        if (!Number.isFinite(s.person.x) || !Number.isFinite(s.person.y) || Math.hypot(s.person.x - spawn.x, s.person.y - spawn.y) > 100) reason = 'Return to Orsa’s outdoor landing area to request a ceasefire.';
      }
    }
    return { needed, available: !reason, reason, action: 'ceasefire', actionLabel: 'Request a ceasefire with your side', factionId, factionName: name(factionId), target: { systemId: CROSSWIND_SYSTEM_ID, bodyId: CROSSWIND_BODY_IDS.orsa, label: 'Orsa landing' } };
  },
  warzoneArrival({ restored = false } = {}) {
    if (this.state.systemId !== CROSSWIND_SYSTEM_ID) return;
    const state = this.state.warzone || this.initializeWarzone();
    if (restored && state.visits > 0) return;
    state.visits++; state.acknowledged = false;
    const side = this.warzoneFaction(), picket = this.system.enemies?.find(ship => ship.warzone && ship.hp > 0 && (ship.warzonePicket || ship.warzoneSize === 'medium') && (!side || ship.faction === side))
      || this.system.enemies?.find(ship => ship.warzone && ship.hp > 0 && ['kestrel','corvette','marten'].includes(ship.classId) && (!side || ship.faction === side));
    state.lastHail = picket?.name || `${name(side || 'freewake')} picket`;
    const text = side ? `${state.lastHail}: Your ${name(side)} clearance is recognized. Vey's relief approach is under fire. Check your warzone briefing for immediate orders.`
      : `${state.lastHail}: Civilian vessel, this is an active warzone. Withdraw to Hearth or keep to Orsa's outer relief approach. If you stay and take a side, the opposing fleet may engage you. Bigger hulls draw more attention.`;
    this._log('Crosswind arrival warning', text, 'story');
    this._event('warzone-arrival', { text, factionId: side, sourceId: picket?.id || null });
    if (side) this._assignWarzoneSortie(side);
  },
  _assignWarzoneSortie(factionId) {
    const state = this.state.warzone || this.initializeWarzone();
    if (state.mission || !SIDES.includes(factionId)) return;
    state.mission = { id: 'crosswind-relief-approach', factionId, damage: 0, seconds: 0, status: 'active', paid: false };
    this._log('Immediate orders: keep the relief approach open', `${name(factionId)} asks your crew to screen Vey's relief approach. Spend 45 seconds within 1,200 units of Vey and inflict 180 hull damage on opposing warships. Your crew's confirmed hits count. Return visits retain your progress. Payment is 220 credits once; this sortie cannot end the war.`, 'job');
    this._event('warzone-orders', { text: 'Immediate orders received. Open the Crosswind briefing to see the relief sortie and mark Vey.' });
  },
  recordWarzoneAggression(factionId, details = {}) {
    if (this.state.systemId !== CROSSWIND_SYSTEM_ID || !SIDES.includes(factionId)) return false;
    const state = this.state.warzone || this.initializeWarzone();
    if (!state.hostileFactions.includes(factionId)) {
      state.hostileFactions.push(factionId);
      this._event('warzone-hostility', { text: `${name(factionId)} has identified your attack. Its nearby units may now engage you; the main fleet battle continues.` });
      this._log('Crosswind: weapons committed', `You attacked ${name(factionId)} ${details.ground ? 'infantry' : 'ships'}. That faction now treats you as hostile in Crosswind.`, 'combat');
    }
    return true;
  },
  recordWarzoneDamage(factionId, amount) {
    const mission = this.state.warzone?.mission;
    if (this.state.systemId !== CROSSWIND_SYSTEM_ID || !mission || mission.status !== 'active' || this.warzoneFaction() !== mission.factionId || factionId !== opposite(mission.factionId)) return;
    mission.damage = Math.min(180, mission.damage + bounded(amount, 1e5));
    this._completeWarzoneSortie();
  },
  stepWarzoneDuty(dt, { ship = this.state.ship, eligible = true } = {}) {
    const mission = this.state.warzone?.mission;
    if (this.state.systemId !== CROSSWIND_SYSTEM_ID || !mission || mission.status !== 'active' || !eligible || !conscious(this) || this.warzoneFaction() !== mission.factionId) return;
    const vey = this.system.bodies.find(body => body.id === CROSSWIND_BODY_IDS.vey);
    if (vey && ship.hull > 0 && !ship.destroyed && Math.hypot(ship.x - vey.x, ship.y - vey.y) <= 1200) mission.seconds = Math.min(45, mission.seconds + bounded(dt, .1));
    this._completeWarzoneSortie();
  },
  _completeWarzoneSortie() {
    const mission = this.state.warzone?.mission;
    if (!mission || mission.status !== 'active' || mission.paid || mission.damage < 180 || mission.seconds < 45) return;
    mission.status = 'complete'; mission.paid = true;
    this.state.credits += 220;
    this.state.rep[mission.factionId] = Math.min(100, finite(this.state.rep[mission.factionId]) + 2);
    this._flag('crosswind_relief_sortie_complete');
    this._log('Relief screen acknowledged', `The relief controller confirms your crew's work on Vey's approach. ${name(mission.factionId)} paid 220 credits. A convoy made its crossing; the war continues.`, 'job');
    this._event('job-complete', { text: 'Relief screen complete · 220 CR. A convoy crossed the approach. Crosswind is still at war.' });
  },
  warzoneAction({ action, factionId } = {}) {
    if (this.state.systemId !== CROSSWIND_SYSTEM_ID) return this._fail('Crosswind orders are available inside the warzone.', 'location');
    if (!conscious(this)) return this._fail('Recover before answering the military channel.', 'down');
    const state = this.state.warzone || this.initializeWarzone();
    if (action === 'ceasefire') {
      const check = this.warzoneCeasefireStatus();
      if (factionId && factionId !== check.factionId) return this._fail('You can request a ceasefire only with your own side.', 'faction');
      if (!check.available) return this._fail(check.reason, 'ceasefire');
      state.hostileFactions = state.hostileFactions.filter(id => id !== check.factionId);
      const text = `${name(check.factionId)} accepted your ceasefire. Your side will stop treating you as an attacker. Your service, rank, and mission progress stay the same; the opposing side remains hostile.`;
      this._log('Ceasefire with your side', text, 'story');
      this._event('warzone-ceasefire', { factionId: check.factionId, text });
      return this._ok({ factionId: check.factionId, text });
    }
    if (action === 'acknowledge') { state.acknowledged = true; return this._ok({ text: 'Warning acknowledged. Orsa and Third Light are on the outer relief approach.' }); }
    if (action !== 'join' || !SIDES.includes(factionId)) return this._fail('Choose a listed faction or remain unaligned.', 'action');
    const service = this.state.professions?.careers?.military;
    if (service?.enlisted && SIDES.includes(service.factionId) && (service.factionId !== factionId || !this.warzoneServiceFaction())) return this._fail('Your current military service controls your clearance. Resolve your service or suspended standing at a recruiting desk first.', 'service');
    if (state.side && state.side !== factionId || state.mission && state.mission.factionId !== factionId) return this._fail('You already committed to the other side in Crosswind. You cannot switch colors during this campaign.', 'allegiance');
    if (state.hostileFactions.includes(factionId)) return this._fail('That faction has identified your attacks and will not accept your offer of support.', 'hostile');
    state.side = factionId; state.acknowledged = true;
    this._assignWarzoneSortie(factionId);
    this._log('A side in Crosswind', `You offered local support to ${name(factionId)}. ${name(opposite(factionId))} may now engage you. This does not enlist you in a profession or promise safe passage through the main battle.`, 'story');
    return this._ok({ text: `${name(factionId)} accepts your local support. Immediate orders are in this briefing.` });
  },
  warzoneStatus() {
    const state = this.state.warzone || this.initializeWarzone(), side = this.warzoneFaction(), inWarzone = this.state.systemId === CROSSWIND_SYSTEM_ID;
    const mission = state.mission, service = this.state.professions?.careers?.military;
    return { inWarzone, factionId: side, factionName: name(side), service: !!this.warzoneServiceFaction(),
      ceasefire: this.warzoneCeasefireStatus(),
      hostileFactions: this.warzoneHostilities(), source: state.lastHail || 'Crosswind military channel', acknowledged: state.acknowledged,
      mission: mission ? { ...mission, title: 'Keep the relief approach open',
        objective: mission.status === 'complete' ? 'Your relief screen is complete. The fleet war and ground front continue.' : `Screen Vey's approach: ${Math.floor(mission.seconds)}/45 seconds within 1,200 units · ${Math.floor(mission.damage)}/180 opposing hull damage.`,
        reward: 220, target: { systemId: CROSSWIND_SYSTEM_ID, bodyId: CROSSWIND_BODY_IDS.vey } } : null,
      choices: SIDES.map(factionId => { const reason = !inWarzone ? 'Enter Crosswind to answer this channel.' : state.hostileFactions.includes(factionId) ? 'Your attacks have made this faction hostile.' : service?.enlisted && SIDES.includes(service.factionId) && (service.factionId !== factionId || !this.warzoneServiceFaction()) ? 'Your current military service controls your clearance.' : (state.side && state.side !== factionId || mission && mission.factionId !== factionId) ? 'You already committed to the other faction.' : side === factionId ? 'Your current affiliation.' : null;
        return { factionId, label: `Support ${name(factionId)}`, reason, available: !reason }; }),
      target: { systemId: CROSSWIND_SYSTEM_ID, bodyId: CROSSWIND_BODY_IDS.vey }, refuge: { systemId: CROSSWIND_SYSTEM_ID, bodyId: CROSSWIND_BODY_IDS.orsa }
    };
  }
};
