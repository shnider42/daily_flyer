/** The departure lobby is a view of authority state, never an attendance claim. */
import { drawShip } from './space-art.mjs';
import { getShipClass } from './fleet.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function createGroupStartUI({ dialog, getSnapshot, invoke, acceptResult = result => result?.ok === true, onDepart = () => {}, onLeave = () => {}, toast = () => {} }) {
  let shownFor = null, wasWaiting = false, busy = false, rosterKey = '', error = '', displayedSelection = null;
  const snapshot = () => getSnapshot?.() || null;
  const view = () => snapshot()?.groupStart || null;
  const waiting = () => snapshot()?.state?.multiplayer?.waitingForGroupStart === true;
  const identity = () => `${snapshot()?.state?.multiplayer?.realmCode || ''}:${snapshot()?.state?.multiplayer?.captainId || ''}`;
  const active = () => dialog.opened && dialog.kind === 'group-start';

  async function run(command, args = {}) {
    if (busy || !waiting()) return;
    busy = true; error = ''; refresh();
    try {
      const result = await invoke(command, args);
      if (!acceptResult(result)) error = result?.reason || 'That departure choice could not be saved. Please try again.';
    } catch (cause) { error = cause?.message || 'Your connection changed. Reconnect before departing.'; }
    finally { busy = false; update(); }
  }
  function open() {
    const lobby = view(); if (!waiting() || !lobby) return false;
    shownFor = identity(); wasWaiting = true; rosterKey = ''; error = '';
    dialog.open('Gather your crew', 'group-start', { eyebrow: 'KETTLE / DEPARTURE', wide: true });
    const code = snapshot()?.realm?.code || snapshot()?.state?.multiplayer?.realmCode || '';
    dialog.html(`<section class="group-departure" aria-label="Shared departure lobby">
      <div class="group-departure-top"><div><p>Share this galaxy code. Your friends can join from the title screen.</p><div class="group-departure-code"><input readonly aria-label="Galaxy invitation code" value="${esc(code)}" data-group-code><button type="button" data-copy-group-code>Copy code</button></div></div><p><strong data-group-count></strong><br><span class="muted">Only connected captains in this lobby count.</span></p></div>
      <h3>Your departure crew</h3><ul class="group-departure-roster" data-group-roster aria-live="polite"></ul>
      <p data-group-host-note></p>
      <div class="group-departure-ships" role="group" aria-label="Departure ship choices">${lobby.choices.map(choice => `<button type="button" class="entry-card group-departure-ship" data-group-ship="${esc(choice.id)}" aria-pressed="false"><span class="group-departure-ship-head"><strong>${esc(choice.name)}</strong><small data-group-chosen></small></span><canvas width="256" height="110" data-group-preview="${esc(choice.id)}" aria-label="${esc(choice.name)} silhouette"></canvas><span>${esc(choice.subtitle)}</span><span>${choice.berths} ${choice.berths === 1 ? 'berth' : 'berths'} · ${choice.minPlayers === 1 ? 'Compact starter' : `${choice.minPlayers}+ captains`}</span><small data-group-ship-reason></small></button>`).join('')}</div>
      <p class="group-departure-ready"><strong data-group-selection></strong><span data-group-equipment></span></p>
      <p class="group-departure-status" role="status" aria-live="polite" data-group-status></p>
      <div class="group-departure-actions"><button type="button" class="button-primary" data-group-board>Board together</button><button type="button" class="button-primary" data-group-ready>Ready for this ship</button><button type="button" class="button-secondary" data-group-leave></button></div>
      <p class="section-note">Everyone starting together may board, use the stations, and pilot the shared ship. The host owns it. Other captains keep their compact ships docked at Kettle. This departure includes no fold drive, story progress, or extra credits.</p>
    </section>`);
    const body = dialog.body;
    body.querySelector('[data-copy-group-code]').onclick = async () => {
      try { await globalThis.navigator.clipboard.writeText(code); toast('Galaxy code copied.', 'good'); }
      catch { const input = body.querySelector('[data-group-code]'); input.focus(); input.select(); toast('Select and copy the galaxy code.', 'info'); }
    };
    for (const button of body.querySelectorAll('[data-group-ship]')) button.onclick = () => run('chooseGroupShip', { classId: button.dataset.groupShip });
    for (const canvas of body.querySelectorAll('[data-group-preview]')) {
      const ctx = canvas.getContext('2d'); if (!ctx) continue;
      ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#0a1824'; ctx.fillRect(0, 0, 256, 110);
      drawShip(ctx, 128, 55, -.1, '#bcc9c3', 1, false, 0, false, { shipClass: canvas.dataset.groupPreview, size: 100 });
    }
    body.querySelector('[data-group-board]').onclick = () => run('startGroupVoyage');
    body.querySelector('[data-group-ready]').onclick = () => {
      const me = view()?.roster.find(member => member.captainId === snapshot()?.state?.multiplayer?.captainId);
      return run('groupStartReady', me?.ready ? { ready: false } : { ready: true, ...displayedSelection });
    };
    body.querySelector('[data-group-leave]').onclick = () => run('leaveGroupStart');
    refresh(); return true;
  }
  function refresh() {
    if (!active() || !waiting()) return;
    const lobby = view(); if (!lobby) return;
    const body = dialog.body, selected = lobby.choices.find(choice => choice.id === lobby.selectedClassId);
    const me = lobby.roster.find(member => member.captainId === snapshot()?.state?.multiplayer?.captainId);
    body.querySelector('[data-group-count]').textContent = `${lobby.onlineCount} ${lobby.onlineCount === 1 ? 'captain connected' : 'captains connected'}`;
    body.querySelector('[data-group-host-note]').textContent = lobby.isHost ? 'Choose a ship with room for everyone. Larger departures unlock at 2, 4, and 7 connected captains.' : `${lobby.hostName} chooses the ship. Mark yourself ready when you are happy with the selection.`;
    const nextRoster = JSON.stringify(lobby.roster);
    if (nextRoster !== rosterKey) {
      rosterKey = nextRoster;
      body.querySelector('[data-group-roster]').innerHTML = lobby.roster.map(member => `<li><span>${esc(member.name)}${member.host ? ' · host' : ''}</span><strong>${!member.online ? 'Disconnected · not counted' : member.host ? 'Choosing the ship' : member.ready ? 'Ready' : 'Choosing / not ready'}</strong></li>`).join('');
    }
    for (const button of body.querySelectorAll('[data-group-ship]')) {
      const choice = lobby.choices.find(value => value.id === button.dataset.groupShip), chosen = choice?.id === lobby.selectedClassId;
      button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', String(chosen));
      button.disabled = busy || !lobby.isHost || !choice?.eligible;
      button.querySelector('[data-group-chosen]').textContent = chosen ? 'Selected' : choice?.eligible ? 'Available' : 'Locked';
      button.querySelector('[data-group-ship-reason]').textContent = choice?.reason || 'Included for this crew';
    }
    body.querySelector('[data-group-selection]').textContent = selected ? `${selected.name} · ${selected.berths} berths` : 'Choose a departure ship';
    displayedSelection = { classId: lobby.selectedClassId, selectionRevision: lobby.selectionRevision };
    const hull = selected && getShipClass(selected.id);
    body.querySelector('[data-group-equipment]').textContent = hull?.systems ? ` ${hull.systems.name}: ${hull.systems.description}` : '';
    body.querySelector('[data-group-status]').textContent = error || (busy ? 'Saving your departure choice…' : lobby.reason || (lobby.isHost ? 'Everyone is ready. Board your ship together when you want to begin.' : 'Ready for the host to bring the crew aboard.'));
    const board = body.querySelector('[data-group-board]'), ready = body.querySelector('[data-group-ready]'), leave = body.querySelector('[data-group-leave]');
    board.hidden = !lobby.isHost; board.disabled = busy || !lobby.canLaunch;
    ready.hidden = lobby.isHost; ready.disabled = busy || !selected?.eligible; ready.textContent = me?.ready ? 'Not ready yet' : 'Ready for this ship';
    ready.setAttribute('aria-pressed', String(me?.ready === true));
    leave.disabled = busy; leave.textContent = lobby.isHost ? 'Close lobby · begin independently' : 'Leave crew · begin independently';
  }
  function update() {
    const nowWaiting = waiting(), lobby = view();
    if (wasWaiting && !nowWaiting) {
      wasWaiting = false;
      if (active()) dialog.close();
      if (snapshot()?.state?.multiplayer?.groupStartStatus === 'launched') onDepart();
      else onLeave();
      return;
    }
    if (!nowWaiting) return;
    wasWaiting = true;
    if (shownFor !== identity()) { open(); return; }
    refresh();
  }
  return { open, update };
}
