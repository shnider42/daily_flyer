import { escapeHtml as esc } from './ui.mjs';
import { captureMenuSession } from './menu-session.mjs';
import { warzoneSpaceView } from './warzone-space.mjs';

/** A persistent briefing: live observations update in place while choices settle. */
export function createWarzoneUI({ getGame, getConnection = () => null, dialog, invoke, acceptResult, track, openMap, onChange = () => {} }) {
  let busy = false, owner = null;
  const status = () => getGame().state.warzoneView || getGame().warzoneStatus();
  const fleet = () => { const game = getGame(); return game.system.warzone?._installed ? warzoneSpaceView(game.system, { factionId: game.warzoneFaction(), hostileFactions: game.warzoneHostilities() }) : game.system.warzone; };
  const valid = () => owner?.({ dialog, game: getGame(), connection: getConnection() }) === true;
  const guarded = action => () => valid() && action();
  const mark = target => { dialog.close(); track(target); };
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
    const view = status(), battle = fleet(), scroll = dialog.body.scrollTop;
    dialog.html(`<p class="warzone-intro">${view.inWarzone ? `Incoming channel · ${esc(view.source)}` : 'One fold jump from Hearth · Freewake and Meridian border'}</p>
      <section class="entry-card"><h3>Crosswind is an active warzone</h3><p>Two military fleets are fighting over Vey. Reinforcements arrive at irregular intervals; a withdrawal can become a counterattack. Destroying the current fleet will not end the war.</p><p id="warzonePhase" class="mini"></p><div id="warzoneFleetCounts" class="warzone-fleet-counts"></div></section>
      <section class="entry-card"><h3>${view.factionId ? esc(view.factionName) + (view.service ? ' service clearance' : ' · local support') : 'You are unaligned'}</h3><p>${view.factionId ? 'The opposing faction may engage you. Your allies continue fighting their own battle.' : 'The picket advises you to leave. You can stay unaligned, but flying through the firing lanes can still get you hit.'} Larger ships draw more deliberate attacks. A small ship is one contact among many.</p>${view.hostileFactions.length ? `<p class="mini">Hostile to you: ${view.hostileFactions.map(id => id === 'freewake' ? 'Freewake Union' : 'Meridian Combine').map(esc).join(', ')}.</p>` : ''}${getGame().state.multiplayer?.aboardVesselId && getGame().state.multiplayer?.crewRole !== 'helm' ? '<p class="mini">The helmsman’s clearance identifies this ship. Your personal service and commitments remain yours. Firing its weapons can make the whole ship a target.</p>' : ''}</section>
      ${view.mission ? `<section class="entry-card"><h3>${esc(view.mission.title)}</h3><p id="warzoneMission">${esc(view.mission.objective)}</p><p class="mini">${view.mission.status === 'complete' ? '220 CR paid once. Your completed sortie is saved.' : '220 CR on confirmed completion. Progress survives return visits. Both time on the approach and actual opposing hull damage are required.'}</p></section>` : ''}
      <section class="entry-card"><h3>Three worlds, different stakes</h3><p><strong>Vey · the ground front.</strong> Land, then find Ashfall Front beyond the landing. Infantry contest three corridors while the hospital, apartment shelter and missing-persons desk need help. The southern relief route offers cover.</p><p><strong>Orsa · civilian refuge.</strong> Shelters and the nearby Third Light relief station sit outside the main firing lanes.</p><p><strong>Lorn · military supply.</strong> Fuel and freight feed the eastern line. Heavy ships gather closer to the fighting.</p></section>
      ${feedback ? `<p class="inline-feedback" role="status">${esc(feedback)}</p>` : ''}`);
    const choices = [];
    if (view.inWarzone) {
      if (!view.factionId) for (const option of view.choices) choices.push({ label: option.label, detail: option.reason || 'Commits you to this side here and starts the relief sortie. The other faction becomes hostile.', disabled: !option.available, action: guarded(() => act('join', option.factionId)) });
      choices.push({ label: 'Mark Vey and the ground front', detail: 'Fly to Vey; land and use the local map to find Ashfall Front.', action: guarded(() => mark(view.target)) });
      choices.push({ label: 'Mark Orsa’s relief approach', detail: 'Civilian refuge outside the main fleet lanes.', action: guarded(() => mark(view.refuge)) });
      choices.push({ label: 'Plot a return to Hearth', action: guarded(() => openMap('hearth')) });
      if (!view.acknowledged) choices.push({ label: view.factionId ? 'Acknowledge orders and resume' : 'Stay unaligned and resume', action: guarded(async () => { await act('acknowledge'); if (valid()) dialog.close(); }) });
    } else choices.push({ label: 'Find Crosswind on the chart', action: guarded(() => openMap('crosswind')) });
    choices.push({ label: 'Close briefing', action: guarded(() => dialog.close()) });
    dialog.choices(choices); dialog.body.scrollTop = scroll; refresh();
  }
  function refresh() {
    if (!valid() || dialog.kind !== 'warzone') return false;
    const view = status(), battle = fleet(), phase = dialog.body.querySelector('#warzonePhase'), counts = dialog.body.querySelector('#warzoneFleetCounts'), mission = dialog.body.querySelector('#warzoneMission');
    if (phase) phase.textContent = battle?.phaseLabel || 'Fleet pressure changes while you are away and while you remain here.';
    if (counts) counts.textContent = (battle?.factions || []).map(side => `${side.name}: ${side.ships} ships present · ${side.fighting} fighting`).join('  /  ');
    if (mission && view.mission) mission.textContent = view.mission.objective;
    return true;
  }
  function open() { dialog.open('Crosswind warzone', 'warzone', { eyebrow: 'MILITARY CHANNEL / CIVILIAN WARNING' }); owner = captureMenuSession({ dialog, game: getGame(), connection: getConnection() }); render(); }
  return { open, refresh };
}
