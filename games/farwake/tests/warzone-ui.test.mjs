import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarzoneUI, warzoneBriefingSummary } from '../dist/warzone-ui.mjs';

const view = () => ({ inWarzone: true, factionId: 'freewake', factionName: 'Freewake Union', service: true, hostileFactions: ['meridian'], choices: [], acknowledged: true, source: 'Border patrol', target: { systemId: 'crosswind', bodyId: 'crosswind-vey' }, refuge: { systemId: 'crosswind', bodyId: 'crosswind-orsa' } });

test('briefing distinguishes a captain’s Army record from a differently aligned shared ship', () => {
  const personal = view(), before = JSON.stringify(personal);
  const summary = warzoneBriefingSummary(personal, { rank: { enlisted: true, factionId: 'freewake', branchId: 'army', rank: 'Corporal' }, vessel: { viewerFaction: 'meridian', hostileFactions: ['freewake'] } });
  assert.equal(summary.personal, 'Freewake Union Army · Corporal');
  assert.equal(summary.enemies, 'Meridian Combine');
  assert.deepEqual(summary.vessel, { side: 'Meridian Combine', enemies: 'Freewake Union' });
  assert.equal(JSON.stringify(personal), before);
});

test('both-side hostility, suspended service, and civilian support stay distinct', () => {
  const both = { ...view(), hostileFactions: ['meridian', 'freewake'] };
  assert.match(warzoneBriefingSummary(both).warning, /attacks against it were recorded.*Both sides/);
  assert.equal(warzoneBriefingSummary({ ...view(), service: false }).personal, 'Freewake Union · local support');
  const suspended = warzoneBriefingSummary({ ...both, factionId: null }, { rank: { enlisted: true, factionId: 'freewake', branchId: 'army', rank: 'Corporal', suspended: true } });
  assert.match(suspended.personal, /Army.*Corporal/);assert.match(suspended.warning, /suspended/);
  assert.match(suspended.enemies, /Meridian Combine and Freewake Union/);
});

function fixture() {
  const status = view(), calls = [], marks = [];
  status.hostileFactions.push('freewake');
  status.ceasefire = { needed: true, available: false, reason: 'Reach the Orsa landing first.', action: 'ceasefire', actionLabel: 'Request a ceasefire with your side', factionId: 'freewake', factionName: 'Freewake Union' };
  const game = { state: { seed: 'briefing', mode: 'person', systemId: 'crosswind', professions: { careers: { military: { enlisted: true, factionId: 'freewake', completed: 12, rankVersion: 1 } } }, militaryCareer: { factionId: 'freewake', branchId: 'army' } }, system: { warzone: { viewerFaction: 'freewake', hostileFactions: ['meridian'], factions: [] } }, warzoneStatus: () => status };
  const parts = new Map(['#warzonePhase', '#warzoneFleetCounts', '#warzoneMission', '#warzoneChoices'].map(id => [id, { textContent: '', append() {} }]));
  const dialog = { revision: 0, opened: false, kind: null, items: [], body: { scrollTop: 0, querySelector: selector => parts.get(selector), querySelectorAll: () => [] }, open(title, kind) { this.kind = kind; this.opened = true; this.revision++; }, html(markup) { this.markup = markup; this.items = []; }, choices(items) { this.items.push(...items); return {}; }, close() { this.opened = false; this.revision++; } };
  const ui = createWarzoneUI({ getGame: () => game, dialog, invoke: async (name, args) => { calls.push({ name, args }); return { ok: false }; }, acceptResult: () => false, track: target => marks.push(target), openMap() {} });
  return { status, game, dialog, ui, calls, marks };
}

test('ceasefire action follows authority availability, refreshes live, and rejects an old menu', async () => {
  const f = fixture();f.ui.open();
  const find = () => f.dialog.items.find(item => item.label === f.status.ceasefire.actionLabel);
  assert.equal(find().disabled, true);await find().action();assert.deepEqual(f.calls, []);
  f.status.ceasefire.available = true;f.status.ceasefire.reason = null;assert.equal(f.ui.refresh(), true);
  assert.equal(find().disabled, false);await find().action();
  assert.deepEqual(f.calls, [{ name: 'warzoneAction', args: { action: 'ceasefire', factionId: 'freewake' } }]);
  const stale = find();f.dialog.open('Other briefing', 'warzone');await stale.action();assert.equal(f.calls.length, 1);
});
