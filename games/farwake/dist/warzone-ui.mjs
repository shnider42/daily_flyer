import { escapeHtml as esc } from './ui.mjs';
import { captureMenuSession } from './menu-session.mjs';
import { warzoneSpaceView } from './warzone-space.mjs';
import { militaryServiceRank } from './military-ranks.mjs';

const factionName = id => ({ freewake: 'Freewake Union', meridian: 'Meridian Combine' })[id] || 'No side';
const factionList = ids => (ids || []).map(factionName).join(' and ') || 'Neither faction is targeting you for your allegiance';

/** Personal service and a shared ship's clearance are different public facts. */
export function warzoneBriefingSummary(view, { rank = {}, vessel = null } = {}) {
  const personal = rank.enlisted ? `${factionName(rank.factionId)}${rank.branchId === 'army' ? ' Army' : rank.branchId === 'navy' ? ' Navy' : ' military'} · ${rank.rank || 'Recruit'}` : view.factionId ? `${factionName(view.factionId)} · local support` : 'Civilian · no side chosen';
  const ownSideHostile = !!view.factionId && view.hostileFactions.includes(view.factionId);
  const warning = rank.suspended ? 'Your military service is suspended. Your rank is saved, but your faction no longer gives you military clearance.' : ownSideHostile ? `${factionName(view.factionId)} also treats you as hostile because attacks against it were recorded. Both sides can attack you.` : view.factionId ? `${factionName(view.factionId)} is your side. ${factionList(view.hostileFactions)} can attack you.` : view.hostileFactions.length ? `${factionList(view.hostileFactions)} can attack you because attacks against them were recorded.` : 'You have not joined either side. Stay away from the main battle if you want to avoid fighting.';
  return { personal, warning, ownSideHostile, enemies: factionList(view.hostileFactions), vessel: vessel ? { side: factionName(vessel.viewerFaction), enemies: factionList(vessel.hostileFactions) } : null };
}

/** A persistent briefing: live observations update in place while choices settle. */
export function createWarzoneUI({ getGame, getConnection = () => null, getGuidance = () => 'simple', openService = null, dialog, invoke, acceptResult, track, openMap, onChange = () => {} }) {
  let busy = false, owner = null, renderedStatus = '';
  const status = () => getGame().state.warzoneView || getGame().warzoneStatus();
  const fleet = () => { const game = getGame(); return game.system.warzone?._installed ? warzoneSpaceView(game.system, { factionId: game.warzoneFaction(), hostileFactions: game.warzoneHostilities() }) : game.system.warzone; };
  const valid = () => owner?.({ dialog, game: getGame(), connection: getConnection() }) === true;
  const guarded = action => () => valid() && action();
  const mark = target => { dialog.close(); track(target); };
  const summaryFor = (view, battle) => {
    const game = getGame(), aboard = game.state.multiplayer?.aboardVesselId;
    return warzoneBriefingSummary(view, { rank: militaryServiceRank(game), vessel: aboard && battle ? battle : null });
  };
  const statusKey = (view, battle) => JSON.stringify([summaryFor(view, battle), view.choices, view.ceasefire, view.acknowledged, view.mission?.status, getGuidance()]);
  async function act(action, factionId) {
    if (busy || !valid()) return;
    const session = owner; busy = true;
    try {
      const answer = await invoke('warzoneAction', { action, factionId });
      if (!session({ dialog, game: getGame(), connection: getConnection() })) return;
      if (!acceptResult(answer)) return;
      onChange(); render(answer.text);
      if(!dialog.el.contains(document.activeElement))dialog.el.focus({preventScroll:true});
    } finally { busy = false; }
  }
  function render(feedback = '') {
    const view = status(), battle = fleet(), scroll = dialog.body.scrollTop, summary = summaryFor(view, battle), simple = getGuidance() === 'simple';
    renderedStatus = statusKey(view, battle);
    dialog.html(`<p class="warzone-intro">${view.inWarzone ? 'You are in Crosswind. Freewake and Meridian are fighting here.' : 'Crosswind is a war system, one jump from Hearth.'}</p>
      <section class="entry-card"><h3>${esc(summary.personal)}</h3><p>${esc(summary.warning)}</p><p><strong>Can attack you:</strong> ${esc(summary.enemies)}.</p>${summary.vessel ? `<p><strong>Your ship’s side:</strong> ${esc(summary.vessel.side)}.<br><strong>Enemies of this ship:</strong> ${esc(summary.vessel.enemies)}.</p><p class="mini">Space enemies react to this ship’s pilot or commander and any attacks recorded against the ship. Your personal Army or Navy record stays yours.</p>` : ''}${simple ? '<p class="mini">Enemies may be out of range or busy fighting someone else. A quiet enemy is still an enemy. Marked explosions can hurt everyone, including allies.</p>' : ''}</section>
      ${simple ? '<p>Your recruiter’s Army assignment is separate. Fighting here does not automatically finish it or earn a promotion.</p>' : ''}
      ${view.ceasefire?.needed ? `<section class="entry-card"><h3>Your own side is hostile</h3><p>Go to the Orsa surface landing and request a ceasefire with ${esc(view.ceasefire.factionName)}. This clears your own side’s attack record. You keep your rank and missions; the opposing side remains your enemy.</p>${!view.ceasefire.available ? `<p class="mini">${esc(view.ceasefire.reason)}</p>` : ''}</section>` : ''}
      <div id="warzoneChoices"></div>
      ${view.mission ? `<details class="thread-history"><summary>Separate space mission · ${view.mission.status === 'complete' ? 'complete' : '220 credits'}</summary><h3>${esc(view.mission.title)}</h3><p>Use a ship near Vey and damage opposing warships. Both tasks are required.</p><p id="warzoneMission">${esc(view.mission.objective)}</p><p class="mini">${view.mission.status === 'complete' ? '220 credits paid once. Your completed mission is saved.' : 'Progress is saved between visits. Complete it to receive 220 credits once.'} This mission gives no Army promotion credit. The war continues afterward.</p></details>` : ''}
      <details class="thread-history"><summary>Battle details and places</summary><p>Both fleets keep receiving reinforcements. Clearing the ships currently here does not end the war. Bigger ships attract more attacks.</p><p id="warzonePhase" class="mini"></p><div id="warzoneFleetCounts" class="warzone-fleet-counts"></div><p><strong>Vey:</strong> the ground battle is in Ashfall’s streets. Find cover after landing. The hospital and civilian relief route are marked on the local map.</p><p><strong>Orsa:</strong> civilian shelters, away from the main fleet routes. Third Light is the nearby relief station.</p><p><strong>Lorn:</strong> military supplies and heavy ships, closer to the fighting.</p><p class="mini">Radio source: ${esc(view.source)}.</p></details>
      ${feedback ? `<p class="inline-feedback" role="status">${esc(feedback)}</p>` : ''}`);
    const choices = [];
    if (view.inWarzone) {
      if (!view.factionId) for (const option of view.choices) choices.push({ label: option.label, detail: option.reason || `Choose this side for the Crosswind war. ${factionName(option.factionId === 'freewake' ? 'meridian' : 'freewake')} becomes your enemy. This does not enlist you in the Army or Navy.`, disabled: !option.available, action: guarded(() => option.available && act('join', option.factionId)) });
      if (view.ceasefire?.needed) choices.push({ label: view.ceasefire.actionLabel, detail: view.ceasefire.reason || 'Keep your side and rank. Clear its record of attacks against it.', disabled: !view.ceasefire.available, action: guarded(() => view.ceasefire.available && act('ceasefire', view.ceasefire.factionId)) });
      choices.push({ label: 'Fight on foot · mark Vey', detail: 'Land on Vey, then use cover on the surface. No mission door is needed for this battle.', action: guarded(() => mark(view.target)) });
      choices.push({ label: 'Leave the main fighting · mark Orsa', detail: view.ceasefire?.needed ? 'Reach the surface landing to request a ceasefire with your side.' : 'Head toward the civilian refuge, away from the main fleet routes.', action: guarded(() => mark(view.refuge)) });
      choices.push({ label: 'Go home · plot Hearth', action: guarded(() => openMap('hearth')) });
      if (!view.acknowledged) choices.push({ label: view.factionId ? 'Understood · back to game' : 'Keep no side · back to game', action: guarded(async () => { await act('acknowledge'); if (valid()) dialog.close(); }) });
    } else choices.push({ label: 'Find Crosswind on the chart', action: guarded(() => openMap('crosswind')) });
    const rank = militaryServiceRank(getGame());
    if (openService && rank.enlisted) choices.push({ label: rank.branchId === 'army' ? 'Army orders & permissions' : rank.branchId === 'navy' ? 'Navy orders & permissions' : 'Military orders & permissions', detail: 'Check your current assignment and what your own rank allows.', action: guarded(openService) });
    choices.push({ label: 'Close briefing', action: guarded(() => dialog.close()) });
    const buttons = dialog.choices(choices), destination = dialog.body.querySelector('#warzoneChoices');
    if (buttons && destination) destination.append(buttons);
    dialog.body.scrollTop = scroll; refresh();
  }
  function refresh() {
    if (!valid() || dialog.kind !== 'warzone') return false;
    const view = status(), battle = fleet();
    if (!busy && statusKey(view, battle) !== renderedStatus) {
      const opened = [...dialog.body.querySelectorAll('details[open]')].map(element => element.querySelector('summary')?.textContent);
      render();
      for (const details of dialog.body.querySelectorAll('details')) if (opened.includes(details.querySelector('summary')?.textContent)) details.open = true;
      return true;
    }
    const phase = dialog.body.querySelector('#warzonePhase'), counts = dialog.body.querySelector('#warzoneFleetCounts'), mission = dialog.body.querySelector('#warzoneMission');
    if (phase) phase.textContent = battle?.phaseLabel || 'Fleet pressure changes while you are away and while you remain here.';
    if (counts) counts.textContent = (battle?.factions || []).map(side => `${side.name}: ${side.ships} ships present · ${side.fighting} fighting`).join('  /  ');
    if (mission && view.mission) mission.textContent = view.mission.objective;
    return true;
  }
  function open() { dialog.open('Crosswind warzone', 'warzone', { eyebrow: 'MILITARY CHANNEL / CIVILIAN WARNING' }); owner = captureMenuSession({ dialog, game: getGame(), connection: getConnection() }); render(); }
  return { open, refresh };
}
