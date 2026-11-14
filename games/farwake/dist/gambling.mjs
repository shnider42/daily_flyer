/** Captain-owned table stakes. The same transactions run solo and on the authority. */
import { createGamblingSession, gamblingAction as playGamblingAction, publicGamblingSession, validateGamblingSession, gamblingEscrow, GAMBLING_STAKES } from './gambling-rules.mjs';
import { generateSurface } from './surface.mjs';
import { interactionInRange } from './live-surface.mjs';

const GAMES = new Set(['poker', 'pool', 'blackjack']);
const HISTORY_LIMIT = 16;
const fail = (reason, code = 'gambling') => ({ ok: false, reason, message: reason, code });
const clone = value => structuredClone(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const boundedText = (value, max = 160) => typeof value === 'string' && value.length > 0 && value.length <= max;

/** Animation belongs to one accepted response, not every save and motion packet. */
export function discardGamblingReplay(value) {
  const pool = value?.pool || value;
  const shots = Array.isArray(pool?.recentShots) ? pool.recentShots : [];
  for (const shot of [...shots, pool?.lastShot]) if (shot) delete shot.frames;
  return value;
}

function access(game, entityId, gameId) {
  const s = game.state;
  if (s.mode !== 'person' || s.interior || s.exploration || !game.atInhabitedPort) return fail('Walk to a gaming table in an inhabited port.', 'location');
  if (s.person.health <= 0 || s.person.down) return fail('Recover before taking a seat.', 'incapacitated');
  if (s.pendingEncounter) return fail('Finish the conversation before taking a seat.', 'encounter');
  if (typeof entityId !== 'string' || entityId.length > 160) return fail('Choose a table in this venue.', 'target');
  const surface = game._surfaceForInteraction?.() || generateSurface(game.currentBody, s.seed, s.flags);
  const entity = surface?.entities.find(value => value.id === entityId && value.type === 'gambling' && !value.hidden);
  if (!entity || !interactionInRange(game, surface, entity, 46)) return fail('Walk back to this table to play.', 'distance');
  if (!GAMES.has(gameId) || entity.data?.gameId !== gameId) return fail('That game is not offered at this table.', 'target');
  return { ok: true, entity };
}

function sessionAccess(game, session) {
  if (session.systemId !== game.state.systemId || session.locationId !== game.state.locationId) return fail('Return to the venue where you opened this round.', 'location');
  return access(game, session.entityId, session.gameId);
}

function expectedSession(session, action, required = false) {
  if (!object(action)) return fail('Choose a valid table action.', 'protocol');
  if (required || action.sessionId !== undefined || action.revision !== undefined) {
    if (action.sessionId !== session.id || action.revision !== session.revision) return fail('This round has moved on. Use the current table controls.', 'gambling-stale');
  }
  return { ok: true };
}

function settle(game) {
  const session = game.state.gamblingSession;
  if (!session || session.status !== 'complete' || session.settled) return;
  const payout = session.payout?.[0];
  // No client action can supply this figure. An invalid persisted receipt must
  // never mint credits or replace the captain's existing purse.
  if (!integer(payout) || payout > session.escrow * 3 || !integer(session.escrow)) throw new Error('Invalid gambling settlement');
  session.settled = true;
  session.creditsReturned = payout;
  session.purseChange = payout - session.escrow;
  game.state.credits += payout;
  const record = { id: session.id, gameId: session.gameId, systemId: session.systemId, locationId: session.locationId, venue: session.venue, stake: session.stake, escrow: session.escrow, returned: payout, net: session.purseChange, at: Math.floor(game.state.stats.time || 0) };
  game.state.gamblingHistory = [...(game.state.gamblingHistory || []), record].slice(-HISTORY_LIMIT);
  const change = record.net > 0 ? `+${record.net}` : String(record.net);
  game._event?.('gambling', { text: `${session.venue}: ${change} credits.`, gameId: session.gameId, net: record.net });
}

function view(game, includeReplay = true) {
  const session = game.state.gamblingSession;
  if (!session) return game.state.gamblingView ? clone(game.state.gamblingView) : null;
  return { ...publicGamblingSession(session, 0, { includeReplay }), entityId: session.entityId, systemId: session.systemId, locationId: session.locationId, venue: session.venue, settled: session.settled === true, creditsReturned: session.creditsReturned ?? null, purseChange: session.purseChange ?? null };
}

export const GamblingRules = {
  initializeGambling() {
    const s = this.state;
    s.gamblingSerial = integer(s.gamblingSerial) ? s.gamblingSerial : 0;
    s.gamblingHistory = (Array.isArray(s.gamblingHistory) ? s.gamblingHistory : []).slice(-HISTORY_LIMIT).filter(record => object(record) && typeof record.id === 'string' && GAMES.has(record.gameId) && integer(record.escrow) && integer(record.returned));
    const session = s.gamblingSession;
    if (!session) { s.gamblingSession = null; return; }
    // Every accepted action settles synchronously before it can be saved. A
    // completed but unsettled import is not a new claim against the purse.
    const receiptValid = session.status === 'complete'
      ? session.settled === true && session.creditsReturned === session.payout?.[0] && session.purseChange === session.payout?.[0] - session.escrow
      : session.settled === false && session.creditsReturned == null && session.purseChange == null;
    if (!validateGamblingSession(session) || session.id !== `table-${s.gamblingSerial}` || !boundedText(session.entityId) || !boundedText(session.systemId) || !boundedText(session.locationId) || !boundedText(session.venue, 200) || !receiptValid) {
      s.gamblingSession = null;
      delete s.gamblingView;
    }
  },
  gamblingStatus({ includeReplay = false } = {}) { return view(this, includeReplay); },
  gamblingTableInfo(entityId, gameId, stake = 10) {
    const allowed = access(this, entityId, gameId);
    if (!allowed.ok) return allowed;
    if (!GAMBLING_STAKES.includes(stake) || !((allowed.entity.data.stakes || GAMBLING_STAKES).includes(stake))) return fail('Choose one of the posted stakes.', 'stake');
    const escrow = gamblingEscrow(gameId, stake);
    return { ok: this.state.credits >= escrow, escrow, stake, credits: this.state.credits, ...(this.state.credits < escrow ? { code: 'cost', reason: `This table reserves ${escrow} credits. You have ${Math.floor(this.state.credits)}.` } : {}) };
  },
  startGambling(entityId, gameId, stake = 10) {
    if (this.state.gamblingSession?.status === 'playing') return fail('Finish or leave your current round before opening another table.', 'gambling-active');
    const info = this.gamblingTableInfo(entityId, gameId, stake);
    if (!info.ok) return info;
    const table = access(this, entityId, gameId).entity;
    const serial = (this.state.gamblingSerial || 0) + 1;
    if (!Number.isSafeInteger(serial)) return fail('This captain cannot open another round.', 'gambling-limit');
    const seed = this._gamblingSeed?.() || `${this.state.seed}:table:${serial}:${this.state.rng}:${this.state.stats.time}`;
    const created = createGamblingSession({ gameId, stake, seed, id: `table-${serial}`, playerName: this.state.captainName || 'Captain', opponentName: table.data.opponentName });
    if (!created.ok) return created;
    if (created.escrow !== info.escrow) throw new Error('Gambling escrow contract differs from table quote');
    const session = created.session;
    Object.assign(session, { entityId, venue: table.data.venueName || table.data.venueId || table.name || 'Local table', systemId: this.state.systemId, locationId: this.state.locationId, settled: false, escrow: created.escrow });
    this.state.gamblingSerial = serial;
    this.state.credits -= created.escrow;
    this.state.gamblingSession = session;
    this.state.person.weaponDrawn = false;
    settle(this);
    return { ok: true, session: view(this), text: `${created.escrow} credits reserved at ${session.venue}.` };
  },
  gamblingAction(action) {
    const session = this.state.gamblingSession;
    if (!session) return fail('Take a seat before playing.', 'gambling-empty');
    if (session.status !== 'playing') return fail('This round is complete. Choose another round at the table.', 'gambling-complete');
    const expected = expectedSession(session, action, this._gamblingAuthority === true);
    if (!expected.ok) return expected;
    const allowed = sessionAccess(this, session);
    if (!allowed.ok) return allowed;
    const result = playGamblingAction(session, action, 0);
    if (!result.ok) return result;
    settle(this);
    const publicSession = view(this);
    discardGamblingReplay(session);
    return { ok: true, session: publicSession };
  },
  leaveGambling(action = {}) {
    const session = this.state.gamblingSession;
    if (!session) return { ok: true, session: null };
    const expected = expectedSession(session, action, this._gamblingAuthority === true);
    if (!expected.ok) return expected;
    if (session.status === 'playing') {
      // Leaving is always available, even after a rescue or departure. Cards
      // resolve by the posted leave rule; pool concedes the fixed stake.
      const result = playGamblingAction(session, { type: 'leave' }, 0);
      if (!result.ok) return result;
    }
    settle(this);
    const result = view(this);
    this.state.gamblingSession = null;
    delete this.state.gamblingView;
    return { ok: true, session: result, closed: true, text: 'You leave the table.' };
  }
};

/** Public account export: current play and receipts, never undealt cards. */
export function publicGamblingAccount(state) {
  return { gamblingSerial: state.gamblingSerial || 0, gamblingHistory: clone(state.gamblingHistory || []), gamblingView: view({ state }, false) };
}
