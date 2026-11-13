import { AIRCRAFT } from './campaign.mjs';

// Campaign progress keeps its original key. These records describe flights made
// after the flight log was introduced; they never infer past flying statistics.
export const LOGBOOK_KEY = 'dfe.skyward.flights.v1';
export const LOGBOOK_LIMIT = 24;
export const RECORD_LIMIT = 96;
export const SEEN_RUN_LIMIT = 128;
const MAX_STORAGE_LENGTH = 400000;
const MEDAL_RANK = { bronze: 1, silver: 2, gold: 3 };
const COUNT_FIELDS = ['landings', 'airKills', 'groundKills', 'gatesReached'];
const STAT_FIELDS = ['airTime', 'distance', 'damageTaken', ...COUNT_FIELDS];
const TOTAL_FIELDS = ['sorties', 'completed', 'failed', 'ended', ...STAT_FIELDS];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, limit = 100) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) : '';
const bounded = (value, max = 1e10, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
const rounded = value => Math.round(value * 1000) / 1000;
const count = value => Math.floor(bounded(value, 1e9));
const titleCase = value => value.charAt(0).toUpperCase() + value.slice(1);

function emptyTotals() {
  return Object.fromEntries(TOTAL_FIELDS.map(key => [key, 0]));
}

export function createLogbook() {
  return { version: 1, flights: [], records: [], seenIds: [], totals: emptyTotals(), aircraft: {} };
}

function normalizeMedals(value) {
  const source = object(value), medals = {};
  for (const tier of ['gold', 'silver']) {
    const rule = object(source[tier]);
    if (Number.isFinite(rule.time) && rule.time > 0 && Number.isFinite(rule.health)) {
      medals[tier] = { time: bounded(rule.time, 1e7), health: bounded(rule.health, 100) };
    }
  }
  return medals;
}

/** Medals describe successful operation recovery, elapsed time and airframe health. */
export function medalAssessment({ outcome, duration = 0, health = 0, medals = {}, recordEligible = true } = {}) {
  if (outcome !== 'success' || !recordEligible) return { medal: null, target: null, eligible: false };
  const rules = normalizeMedals(medals);
  let medal = 'bronze';
  for (const tier of ['gold', 'silver']) {
    const rule = rules[tier];
    if (rule && Number.isFinite(duration) && duration >= 0 && duration <= rule.time && Number.isFinite(health) && health >= rule.health) {
      medal = tier;
      break;
    }
  }
  const next = medal === 'bronze' ? rules.silver ? 'silver' : rules.gold ? 'gold' : null : medal === 'silver' && rules.gold ? 'gold' : null;
  return { medal, target: next ? { medal: next, ...rules[next] } : null, eligible: true };
}

function normalizeCondition(value) {
  const source = object(value), weather = object(source.weather), wind = object(weather.wind);
  const finite = (v, fallback = 0) => Number.isFinite(v) ? Math.max(-1e7, Math.min(1e7, v)) : fallback;
  return {
    aircraft: Object.hasOwn(AIRCRAFT, source.aircraft) ? source.aircraft : '',
    assist: ['assisted', 'standard', 'expert'].includes(source.assist) ? source.assist : 'assisted',
    autoLevel: source.autoLevel !== false,
    payload: ['conventional', 'atomic', 'hydrogen', 'tsar'].includes(source.payload) ? source.payload : 'conventional',
    weatherPreset: text(source.weatherPreset, 32) || 'authored',
    weather: {
      wind: { x: finite(wind.x), z: finite(wind.z) },
      cloudBase: finite(weather.cloudBase), cloudTop: finite(weather.cloudTop),
      fog: finite(weather.fog), timeOfDay: text(weather.timeOfDay, 24) || 'day',
    },
    revision: count(source.revision) || 1,
    medals: normalizeMedals(source.medals),
  };
}

function flightCondition(mission, settings = {}, aircraft = mission.aircraft, payload = mission.payload) {
  return normalizeCondition({ aircraft, assist: settings.assist, autoLevel: settings.autoLevel,
    payload, weatherPreset: mission.weatherPreset, weather: mission.weather,
    revision: mission.operation?.version, medals: mission.operation?.medals });
}

function conditionKey(operationId, condition) {
  return JSON.stringify([operationId, condition]);
}

function conditionLabel(condition) {
  const weather = condition.weatherPreset === 'authored' ? titleCase(condition.weather.timeOfDay) : titleCase(condition.weatherPreset);
  return `${titleCase(condition.assist)} · Auto-level ${condition.autoLevel ? 'on' : 'off'} · ${weather}`;
}

function normalizeStats(value) {
  const source = object(value), stats = {};
  for (const key of STAT_FIELDS) stats[key] = COUNT_FIELDS.includes(key) ? count(source[key]) : rounded(bounded(source[key]));
  const landing = object(source.lastLanding);
  stats.lastLanding = Number.isFinite(landing.sinkRate) && Number.isFinite(landing.speed) ? {
    sinkRate: rounded(bounded(Math.abs(landing.sinkRate), 1000)),
    speed: rounded(bounded(landing.speed, 10000)),
    runwayIndex: Number.isInteger(landing.runwayIndex) ? Math.max(-1, Math.min(1000, landing.runwayIndex)) : -1,
    quality: text(landing.quality, 24) || 'safe',
  } : null;
  return stats;
}

function normalizeReport(value) {
  const source = object(value), id = text(source.id, 128), missionId = text(source.missionId, 100);
  if (!id || !missionId || !Object.hasOwn(AIRCRAFT, source.aircraft) || !['success', 'failed', 'ended'].includes(source.outcome)) return null;
  const condition = normalizeCondition({ ...object(source.condition), aircraft: source.aircraft });
  const operationId = text(source.operationId, 100) || null;
  const duration = rounded(bounded(source.duration, 1e7)), health = rounded(bounded(source.health, 100));
  const stats = normalizeStats(source.stats);
  stats.airTime = Math.min(stats.airTime, duration);
  const recordEligible = source.recordEligible !== false;
  const medals = normalizeMedals(source.medalRules || condition.medals);
  condition.medals = medals;
  const assessment = operationId ? medalAssessment({ outcome: source.outcome, duration, health, medals, recordEligible }) : { medal: null, target: null };
  return {
    id, missionId, operationId, title: text(source.title, 120) || missionId,
    aircraft: source.aircraft, aircraftName: AIRCRAFT[source.aircraft].name,
    outcome: source.outcome, duration, health, score: count(source.score),
    endedAt: Math.floor(bounded(source.endedAt, 8.64e15)), stats,
    condition, conditionKey: conditionKey(operationId, condition),
    conditionLabel: conditionLabel(condition), recordEligible,
    recordReason: recordEligible ? '' : 'Handling changed during flight',
    medal: assessment.medal, medalTarget: assessment.target, medalRules: medals,
  };
}

/** Reuse the launch-time runId when the same result is rendered or saved again. */
export function buildSortieReport(sim, { runId, endedAt = Date.now(), outcome, settings = sim?.settings || {}, recordEligible = true } = {}) {
  if (!sim?.mission || sim.multiplayer || sim.crew || !text(runId, 128)) return null;
  const mission = sim.mission, player = sim.player || {}, aircraft = player.aircraft || mission.aircraft;
  if (!Object.hasOwn(AIRCRAFT, aircraft)) return null;
  const result = outcome ?? (sim.status === 'success' || sim.status === 'failed' ? sim.status : 'ended');
  return normalizeReport({
    id: runId, missionId: mission.id, operationId: mission.operation?.id,
    title: mission.title, aircraft, outcome: result, endedAt,
    duration: sim.time, health: bounded(player.health / AIRCRAFT[aircraft].health * 100, 100),
    score: sim.score, stats: sim.sortieStats,
    condition: flightCondition(mission, settings, aircraft, player.payload),
    medalRules: mission.operation?.medals, recordEligible,
  });
}

function betterRecord(candidate, current) {
  if (!current) return true;
  const rank = (MEDAL_RANK[candidate.medal] || 0) - (MEDAL_RANK[current.medal] || 0);
  return rank > 0 || rank === 0 && (candidate.duration < current.duration || candidate.duration === current.duration && candidate.health > current.health);
}

function isRecord(report) {
  return !!(report.operationId && report.outcome === 'success' && report.recordEligible && report.medal);
}

function addTotals(totals, report) {
  totals.sorties = count(totals.sorties + 1);
  const outcome = report.outcome === 'success' ? 'completed' : report.outcome;
  totals[outcome] = count(totals[outcome] + 1);
  for (const key of STAT_FIELDS) totals[key] = rounded(bounded(totals[key] + report.stats[key], 1e12));
}

function normalizedTotals(value, minimum = emptyTotals()) {
  const source = object(value), totals = emptyTotals();
  for (const key of TOTAL_FIELDS) {
    const n = bounded(source[key], 1e12, minimum[key]);
    totals[key] = Math.max(minimum[key], ['sorties', 'completed', 'failed', 'ended', ...COUNT_FIELDS].includes(key) ? count(n) : rounded(n));
  }
  totals.sorties = Math.max(totals.sorties, totals.completed + totals.failed + totals.ended);
  return totals;
}

export function normalizeLogbook(value) {
  const source = object(value), book = createLogbook();
  if (source.version !== undefined && source.version !== 1) return book;
  const unique = new Set();
  for (const entry of (Array.isArray(source.flights) ? source.flights : []).slice(0, LOGBOOK_LIMIT * 4)) {
    const report = normalizeReport(entry);
    if (report && !unique.has(report.id)) { unique.add(report.id); book.flights.push(report); }
  }
  book.flights.sort((a, b) => b.endedAt - a.endedAt);
  book.flights = book.flights.slice(0, LOGBOOK_LIMIT);
  const recordMap = new Map();
  for (const entry of [...(Array.isArray(source.records) ? source.records.slice(0, RECORD_LIMIT * 2) : []), ...book.flights]) {
    const report = normalizeReport(entry);
    if (report && isRecord(report) && betterRecord(report, recordMap.get(report.conditionKey))) recordMap.set(report.conditionKey, report);
  }
  book.records = [...recordMap.values()].sort((a, b) => b.endedAt - a.endedAt).slice(0, RECORD_LIMIT);
  book.seenIds = [...new Set([...book.flights.map(flight => flight.id), ...(Array.isArray(source.seenIds) ? source.seenIds.slice(0, SEEN_RUN_LIMIT) : []).map(id => text(id, 128)), ...book.records.map(record => record.id)].filter(Boolean))].slice(0, SEEN_RUN_LIMIT);
  const recentTotals = emptyTotals(), recentAircraft = {};
  for (const report of book.flights) {
    addTotals(recentTotals, report);
    recentAircraft[report.aircraft] ||= { ...emptyTotals(), lastFlown: 0 };
    addTotals(recentAircraft[report.aircraft], report);
    recentAircraft[report.aircraft].lastFlown = Math.max(recentAircraft[report.aircraft].lastFlown, report.endedAt);
  }
  book.totals = normalizedTotals(source.totals, recentTotals);
  const rawAircraft = object(source.aircraft);
  for (const aircraft of Object.keys(AIRCRAFT)) {
    if (!Object.hasOwn(rawAircraft, aircraft) && !recentAircraft[aircraft]) continue;
    const raw = object(rawAircraft[aircraft]), recent = recentAircraft[aircraft];
    book.aircraft[aircraft] = { ...normalizedTotals(raw, recent || emptyTotals()), lastFlown: Math.max(bounded(raw.lastFlown, 8.64e15), recent?.lastFlown || 0) };
  }
  return book;
}

export function loadLogbook(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(LOGBOOK_KEY);
    return typeof raw === 'string' && raw.length <= MAX_STORAGE_LENGTH ? normalizeLogbook(JSON.parse(raw)) : createLogbook();
  } catch { return createLogbook(); }
}

export function saveLogbook(logbook, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(LOGBOOK_KEY, JSON.stringify(normalizeLogbook(logbook)));
    return true;
  } catch { return false; }
}

/** Pure update: the caller can retain the returned log in memory even when storage is blocked. */
export function recordSortie(logbook, value) {
  const book = normalizeLogbook(logbook), report = normalizeReport(value);
  if (!report || book.seenIds.includes(report.id) || book.records.some(record => record.id === report.id)) return { logbook: book, report, added: false, newBest: false };
  book.flights.unshift(report); book.flights = book.flights.slice(0, LOGBOOK_LIMIT);
  book.seenIds.unshift(report.id); book.seenIds = book.seenIds.slice(0, SEEN_RUN_LIMIT);
  addTotals(book.totals, report);
  book.aircraft[report.aircraft] ||= { ...emptyTotals(), lastFlown: 0 };
  addTotals(book.aircraft[report.aircraft], report);
  book.aircraft[report.aircraft].lastFlown = Math.max(book.aircraft[report.aircraft].lastFlown, report.endedAt);
  const previous = book.records.find(record => record.conditionKey === report.conditionKey);
  const newBest = isRecord(report) && betterRecord(report, previous);
  if (newBest) book.records = [report, ...book.records.filter(record => record.conditionKey !== report.conditionKey)].slice(0, RECORD_LIMIT);
  return { logbook: book, report, added: true, newBest };
}

/** A board lookup compares only the same aircraft, handling, weather and authored medal rules. */
export function operationRecord(logbook, mission, settings = {}) {
  if (!mission?.operation?.id) return null;
  const key = conditionKey(mission.operation.id, flightCondition(mission, settings));
  return normalizeLogbook(logbook).records.find(record => record.conditionKey === key) || null;
}
