import test from 'node:test';
import assert from 'node:assert/strict';
import { earthCampaignPresentation } from '../dist/earth-campaign-ui.mjs';

const view = { id: 'earth_long_silence', campaign: { threadId: 'earth_long_silence', stageId: 'defense', operationId: 'attempt-2', missionNumber: 6, missionCount: 16, status: 'defending', held: 4, requiredHold: 36, neutralized: 0, targets: 2, integrity: 80, maxIntegrity: 100 } };

test('live mission counters update only for the same captain stage and defense attempt', () => {
  const live = { ...view.campaign, held: 20, integrity: 70, neutralized: 1 };
  assert.match(earthCampaignPresentation(view, live).detail, /20 \/ 36 seconds.*1 \/ 2 attackers/);
  assert.equal(earthCampaignPresentation(view, live).integrity, 70);
  assert.match(earthCampaignPresentation(view, { ...live, stageId: 'earlier-mission' }).detail, /^4 \/ 36/);
  assert.match(earthCampaignPresentation(view, { ...live, operationId: 'attempt-1' }).detail, /^4 \/ 36/);
});

test('mission presentation distinguishes ready, failed, and physical passenger states', () => {
  assert.match(earthCampaignPresentation(view, { ...view.campaign, status: 'ready' }).detail, /Confirm/);
  assert.match(earthCampaignPresentation(view, { ...view.campaign, status: 'failed' }).detail, /retry/);
  const passenger = earthCampaignPresentation({ id: view.id, campaign: { stageId: 'delivery', missionNumber: 3, missionCount: 16, status: 'active', carriedPassenger: { name: 'Aru' } } });
  assert.match(passenger.detail, /same ship/); assert.equal(passenger.integrity, null);
  assert.equal(earthCampaignPresentation({ id: 'another-story' }, view.campaign), null);
});
